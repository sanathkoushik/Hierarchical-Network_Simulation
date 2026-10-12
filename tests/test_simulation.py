"""Tests mapped to the stages in section 2 of the case study report."""
import networkx as nx
import pytest

from hnsim.engine import Config, Engine
from hnsim.security import IntegrityError, SecurityModule
from hnsim.topology import HQ, TopologyManager


def run_one(engine, source="C1", ms=2000):
    pid = engine.send(source)
    engine.advance(ms)
    return engine.packets[pid]


def kinds(engine):
    return [e["type"] for e in engine.events]


# 1. Topology -------------------------------------------------------------
def test_four_level_hierarchy():
    t = TopologyManager()
    levels = {}
    for _, d in t.graph.nodes(data=True):
        levels[d["level"]] = levels.get(d["level"], 0) + 1
    assert levels == {0: 1, 1: 2, 2: 4, 3: 8}
    assert nx.is_connected(t.graph)


# 2. Routing ---------------------------------------------------------------
def test_route_matches_networkx_dijkstra():
    e = Engine(seed=1)
    for c in e.topology.customers():
        cost, path = e.router.route(c, HQ)
        assert cost == nx.dijkstra_path_length(e.topology.graph, c, HQ, weight="weight")
    assert e.router.route("C1", HQ)[1] == ["C1", "B1", "R1", "HQ"]


# 3. Encryption and tagging ---------------------------------------------------
@pytest.mark.parametrize("cipher", ["chacha20-poly1305", "aes-gcm"])
def test_seal_open_roundtrip_and_tamper(cipher):
    sec = SecurityModule(cipher)
    pkt = sec.seal("C1", HQ, 7, b"hello")
    assert b"hello" not in pkt.data
    assert sec.open(pkt) == b"hello"
    with pytest.raises(IntegrityError):
        sec.open(pkt.flipped())


def test_header_is_authenticated():
    sec = SecurityModule()
    pkt = sec.seal("C1", HQ, 7, b"hello")
    forged = type(pkt)("C1", HQ, 8, pkt.nonce, pkt.data)
    with pytest.raises(IntegrityError):
        sec.open(forged)


# 4/5. Loss, ACK, retransmission ---------------------------------------------
def test_clean_delivery_and_ack():
    e = Engine(seed=1)
    rec = run_one(e)
    assert rec.outcome == "delivered" and rec.attempts == 1
    assert e.m["retransmissions"] == 0
    assert "ack_received" in kinds(e)


def test_lossy_network_still_delivers_with_retransmissions():
    e = Engine(Config(loss_percent=20), seed=3)
    for i in range(60):
        e.send(f"C{i % 8 + 1}")
    e.advance(20000)
    assert e.m["loss_drops"] > 0
    assert e.m["retransmissions"] > 0
    assert e.m["delivered"] >= 50          # retries recover most packets


def test_retry_limit_is_respected():
    e = Engine(Config(loss_percent=100, max_retries=3), seed=1)
    rec = run_one(e, ms=5000)
    assert rec.outcome == "gave up"
    assert rec.attempts == 4               # first send + 3 retransmissions
    assert e.m["gave_up"] == 1


def test_lost_ack_gives_duplicate_not_double_delivery():
    e = Engine(seed=1)
    pid = e.send("C1")
    e.advance(8.5)                         # data reached HQ at t=8, ACK is on its way back
    assert e.packets[pid].delivered_at is not None
    e.reliability.set_loss(100, link="R1-B1")   # the ACK dies on R1-B1
    e.advance(16.5)                        # past the sender's timeout, retransmission under way
    e.reliability.set_loss(0, link="R1-B1")
    e.advance(3000)
    assert e.m["delivered"] == 1           # counted once
    assert e.m["duplicates"] == 1          # second copy recognised at HQ
    assert e.m["retransmissions"] == 1
    assert e.packets[pid].outcome == "delivered"


# 6. Failure detection and rerouting -----------------------------------------
def test_link_failure_detected_and_rerouted():
    e = Engine(seed=1)
    e.fail("link", "HQ-R1")
    e.advance(100)
    assert "HQ-R1" in e.topology.down_edges
    assert e.router.route("C1", HQ)[1] == ["C1", "B1", "R1", "R2", "HQ"]
    rec = run_one(e, ms=2000)
    assert rec.outcome == "delivered"
    assert rec.path == ["C1", "B1", "R1", "R2", "HQ"]


def test_router_failure_reroutes_in_flight_packet():
    e = Engine(seed=1)
    pid = e.send("C1")
    e.advance(3)                           # packet is between B1 and R1
    e.fail("node", "R1")
    e.advance(3000)
    rec = e.packets[pid]
    assert rec.outcome == "delivered"
    assert "R1" not in rec.path
    assert e.m["reroutes"] == 1
    assert "failure_detected" in kinds(e)


def test_detection_takes_missed_hellos_and_recovery_restores_route():
    e = Engine(seed=1)
    e.fail("node", "R1")
    e.advance(20)                          # less than one hello interval
    assert "R1" not in e.topology.down_nodes
    e.advance(60)
    assert "R1" in e.topology.down_nodes
    e.restore("node", "R1")
    e.advance(60)
    assert "R1" not in e.topology.down_nodes
    assert e.router.route("C1", HQ)[1] == ["C1", "B1", "R1", "HQ"]


def test_hq_failure_means_no_route_and_gave_up():
    e = Engine(seed=1)
    e.fail("node", HQ)
    e.advance(100)
    rec = run_one(e, ms=5000)
    assert rec.outcome == "gave up"
    assert e.m["no_route"] > 0


# 7. Verification at the destination -------------------------------------------
def test_tampered_packet_rejected_then_recovered_by_retransmission():
    e = Engine(seed=1)
    e.arm_tamper(1)
    rec = run_one(e)
    assert e.m["tampered"] == 1
    assert "tamper_detected" in kinds(e)
    assert rec.outcome == "delivered"      # the clean retransmission gets through
    assert rec.attempts == 2


# 8. Logging ----------------------------------------------------------------------
def test_events_cover_required_kinds():
    e = Engine(Config(loss_percent=40), seed=5)
    for i in range(30):
        e.send(f"C{i % 8 + 1}")
    e.fail("link", "HQ-R1")
    e.advance(15000)
    seen = set(kinds(e))
    assert {"packet_created", "hop", "drop", "retransmit", "reroute", "delivered"} <= seen


def test_storage_roundtrip(tmp_path):
    from hnsim.storage import Storage
    e = Engine(seed=1)
    run_one(e)
    s = Storage(tmp_path / "t.db")
    s.log_events(e.drain())
    s.log_packets(e.drain_finished())
    assert s.count("events") > 0
    assert s.count("packets") == 1
