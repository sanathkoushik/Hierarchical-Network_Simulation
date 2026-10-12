"""SimPy core: schedules packets, link delays, ACK timers and the detector.

The engine has no I/O of its own. Everything that happens is appended to an
event list (see `emit`); the API layer drains it, stores it in SQLite and
pushes it to the dashboard. Simulated time is in milliseconds. `slowdown` is
the number of wall-clock milliseconds one simulated millisecond is stretched
to, so that packets are slow enough to watch during a demo.
"""
import json
import random
import time
from dataclasses import dataclass, field

import simpy

from .reliability import ReliabilityModule
from .routing import RoutingEngine
from .security import IntegrityError, SecurityModule
from .topology import HQ, TopologyManager


@dataclass
class Config:
    loss_percent: float = 0.0
    max_retries: int = 5        # retransmissions allowed after the first send
    ack_margin: float = 8.0     # sim ms added to the round-trip time
    hello_interval: float = 25.0
    dead_misses: int = 2
    retry_wait: float = 30.0    # sim ms to wait before re-trying when no route exists
    slowdown: float = 40.0      # wall ms per sim ms
    tamper_percent: float = 0.0


@dataclass
class PacketRecord:
    pid: str
    seq: int
    source: str
    payload: bytes
    sealed: object
    created: float
    acked: object = None
    attempts: int = 0
    delivered_at: float = None
    path: list = field(default_factory=list)
    outcome: str = "in flight"


class Engine:
    def __init__(self, config=None, seed=None, cipher="chacha20-poly1305"):
        self.cfg = config or Config()
        self.rng = random.Random(seed)
        self.env = simpy.Environment()
        self.topology = TopologyManager()
        self.router = RoutingEngine(self.topology)
        self.security = SecurityModule(cipher)
        self.reliability = ReliabilityModule(
            self.topology, self.cfg, self.rng, self.emit, self._topology_changed)
        self.events = []
        self.packets = {}
        self.finished = []          # packet records ready for the log
        self._seq = 0
        self._event_id = 0
        self._topo_event = self.env.event()
        self.tamper_armed = 0
        self.traffic_rate = 0.0     # packets per wall-clock second; 0 = off
        self._last_wall = None
        self.m = dict(sent=0, delivered=0, gave_up=0, hop_tx=0, loss_drops=0,
                      fault_drops=0, retransmissions=0, reroutes=0, tampered=0,
                      duplicates=0, no_route=0, latency_sum=0.0, latency_n=0)
        self.env.process(self.reliability.detector(self.env))
        self.env.process(self._traffic())

    # ------------------------------------------------------------------ utils
    def emit(self, etype, /, **fields):
        self._event_id += 1
        ev = {"id": self._event_id, "type": etype, "t": round(self.env.now, 3),
              "wall": time.time(), **fields}
        self.events.append(ev)
        return ev

    def _wall_ms(self, sim_ms):
        return sim_ms * self.cfg.slowdown

    def _topology_changed(self):
        old, self._topo_event = self._topo_event, self.env.event()
        old.succeed()

    def drain(self):
        out, self.events = self.events, []
        return out

    def drain_finished(self):
        out, self.finished = self.finished, []
        return out

    # ----------------------------------------------------------------- time
    def advance(self, sim_ms):
        """Run the simulation forward by sim_ms milliseconds of simulated time."""
        self.env.run(until=self.env.now + sim_ms)

    def tick(self):
        """Advance by however much wall-clock time has passed (live mode)."""
        now = time.monotonic()
        if self._last_wall is not None:
            self.advance((now - self._last_wall) * 1000.0 / self.cfg.slowdown)
        self._last_wall = now

    # --------------------------------------------------------------- traffic
    def _traffic(self):
        while True:
            if self.traffic_rate <= 0:
                yield self.env.timeout(20)
                continue
            interval = 1000.0 / self.traffic_rate / self.cfg.slowdown
            yield self.env.timeout(interval * self.rng.uniform(0.7, 1.3))
            live = [c for c in self.topology.customers() if c not in self.topology.down_nodes]
            if live:
                self.send(self.rng.choice(live))

    def send(self, source):
        if source not in self.topology.customers():
            raise ValueError(f"{source} is not a customer")
        self._seq += 1
        pid = f"P{self._seq:04d}"
        payload = json.dumps({"customer": source, "seq": self._seq,
                              "amount": round(self.rng.uniform(10, 900), 2)}).encode()
        sealed = self.security.seal(source, HQ, self._seq, payload)
        rec = PacketRecord(pid, self._seq, source, payload, sealed, self.env.now)
        rec.acked = self.env.event()
        self.packets[pid] = rec
        self.m["sent"] += 1
        self.emit("packet_created", packet=pid, source=source,
                  msg=f"{pid} created at {source}; payload sealed "
                      f"({self.security.cipher}, tag {sealed.fingerprint})")
        self.env.process(self._sender(rec))
        return pid

    # --------------------------------------------------------------- sender
    def _sender(self, rec):
        cfg = self.cfg
        prev_path, reason, tries = None, None, 0
        while tries <= cfg.max_retries:
            tries += 1
            route = self.router.route(rec.source, HQ)
            if route is None:
                self.m["no_route"] += 1
                self.emit("no_route", packet=rec.pid, source=rec.source,
                          msg=f"{rec.pid}: no route from {rec.source} to HQ, waiting")
                yield rec.acked | self.env.timeout(cfg.retry_wait)
                if rec.acked.triggered:
                    break
                continue
            cost, path = route
            rec.attempts += 1
            rec.path = path
            if prev_path is not None:
                self.m["retransmissions"] += 1
                self.emit("retransmit", packet=rec.pid, attempt=rec.attempts, reason=reason,
                          msg=f"{rec.pid} retransmitted (attempt {rec.attempts}, {reason})")
                if path != prev_path:
                    self.m["reroutes"] += 1
                    self.emit("reroute", packet=rec.pid, old=prev_path, new=path,
                              msg=f"{rec.pid} rerouted: {' > '.join(prev_path)}  ->  "
                                  f"{' > '.join(path)}")
            self.emit("route", packet=rec.pid, path=path, cost=cost, attempt=rec.attempts,
                      msg=f"{rec.pid} route {' > '.join(path)} (cost {cost:g} ms)")
            prev_path = path
            self.env.process(self._data_transit(rec, rec.sealed, path))

            deadline = self.env.now + self.reliability.ack_timeout(cost)
            reason = "timeout"
            while True:
                remaining = deadline - self.env.now
                if remaining <= 1e-9:
                    self.emit("timeout", packet=rec.pid,
                              msg=f"{rec.pid}: no ACK before timeout")
                    break
                topo_event = self._topo_event
                yield rec.acked | self.env.timeout(remaining) | topo_event
                if rec.acked.triggered:
                    break
                if topo_event.triggered and self.topology.path_is_broken(path):
                    reason = "reroute"
                    break
            if rec.acked.triggered:
                break

        if rec.acked.triggered:
            rec.outcome = "delivered"
        else:
            rec.outcome = "delivered, ACK lost" if rec.delivered_at is not None else "gave up"
            if rec.delivered_at is None:
                self.m["gave_up"] += 1
            self.emit("gave_up", packet=rec.pid,
                      msg=f"{rec.pid} abandoned after {rec.attempts} attempts ({rec.outcome})")
        self.finished.append(rec)

    # -------------------------------------------------------------- transit
    def _hop(self, rec, u, v, kind):
        """Decide the fate of one transmission and announce it. Returns
        (delay, failure_reason or None, lost flag)."""
        w = self.topology.weight(u, v)
        fault = self.reliability.hop_status(u, v)
        lost = False if fault else self.reliability.roll_loss(u, v)
        self.m["hop_tx"] += 1
        outcome = "blocked" if fault else ("lost" if lost else "ok")
        self.emit("hop", packet=rec.pid, kind=kind, src=u, dst=v,
                  dur=self._wall_ms(w), outcome=outcome, link=self.topology.edge_id(u, v),
                  msg=None)
        return w, fault, lost

    def _data_transit(self, rec, sealed, path):
        wire = sealed
        for i, (u, v) in enumerate(zip(path, path[1:])):
            w, fault, lost = self._hop(rec, u, v, "data")
            if fault:
                self.m["fault_drops"] += 1
                self.emit("drop", packet=rec.pid, at=u, reason="fault",
                          msg=f"{rec.pid} dropped at {u}: {fault}")
                return
            yield self.env.timeout(w)
            if lost:
                self.m["loss_drops"] += 1
                self.emit("drop", packet=rec.pid, at=v, reason="loss",
                          msg=f"{rec.pid} lost on link {self.topology.edge_id(u, v)}")
                return
            if self.reliability.hop_status(u, v):
                self.m["fault_drops"] += 1
                self.emit("drop", packet=rec.pid, at=v, reason="fault",
                          msg=f"{rec.pid} dropped: element failed during transmission")
                return
            if v != HQ and wire is sealed and self._attacker_strikes():
                wire = sealed.flipped(self.rng.randrange(1 << 16))
                self.emit("tamper_injected", packet=rec.pid, at=v,
                          msg=f"On-path attacker at {v} modified the ciphertext of {rec.pid}")
        self._arrive_at_hq(rec, wire, path)

    def _attacker_strikes(self):
        if self.tamper_armed > 0:
            self.tamper_armed -= 1
            return True
        return self.rng.random() * 100.0 < self.cfg.tamper_percent

    def _arrive_at_hq(self, rec, wire, path):
        try:
            plain = self.security.open(wire)
        except IntegrityError:
            self.m["tampered"] += 1
            self.emit("tamper_detected", packet=rec.pid,
                      msg=f"HQ rejected {rec.pid}: authentication tag mismatch "
                          f"(tampered), packet discarded")
            return
        if plain != rec.payload:  # cannot happen unless the cipher is broken
            raise AssertionError("decrypted payload differs from the original")
        if rec.delivered_at is None:
            rec.delivered_at = self.env.now
            latency = self.env.now - rec.created
            self.m["delivered"] += 1
            self.m["latency_sum"] += latency
            self.m["latency_n"] += 1
            self.emit("delivered", packet=rec.pid, source=rec.source, latency=latency,
                      attempts=rec.attempts,
                      msg=f"{rec.pid} delivered to HQ in {latency:.1f} ms; tag verified")
        else:
            self.m["duplicates"] += 1
            self.emit("duplicate", packet=rec.pid,
                      msg=f"{rec.pid} duplicate at HQ (earlier ACK was lost); re-acknowledging")
        self.env.process(self._ack_transit(rec, path[::-1]))

    def _ack_transit(self, rec, path):
        for u, v in zip(path, path[1:]):
            w, fault, lost = self._hop(rec, u, v, "ack")
            if fault:
                self.m["fault_drops"] += 1
                self.emit("drop", packet=rec.pid, at=u, reason="fault", kind="ack",
                          msg=f"ACK for {rec.pid} dropped at {u}: {fault}")
                return
            yield self.env.timeout(w)
            if lost:
                self.m["loss_drops"] += 1
                self.emit("drop", packet=rec.pid, at=v, reason="loss", kind="ack",
                          msg=f"ACK for {rec.pid} lost on link {self.topology.edge_id(u, v)}")
                return
        if not rec.acked.triggered:
            rec.acked.succeed()
            self.emit("ack_received", packet=rec.pid,
                      msg=f"{rec.pid} acknowledged at {rec.source}")

    # -------------------------------------------------------------- controls
    def fail(self, kind, ident):
        self._check_element(kind, ident)
        self.reliability.inject(kind, ident)
        self.emit("failure_injected", element=ident, kind=kind,
                  msg=f"Failure injected: {kind} {ident} is down")

    def restore(self, kind, ident):
        self._check_element(kind, ident)
        self.reliability.restore(kind, ident)
        self.emit("restore_injected", element=ident, kind=kind,
                  msg=f"{kind} {ident} brought back up")

    def _check_element(self, kind, ident):
        ok = self.topology.has_node(ident) if kind == "node" else self.topology.has_edge_id(ident)
        if kind not in ("node", "link") or not ok:
            raise ValueError(f"unknown {kind} {ident!r}")

    def set_loss(self, percent, link=None):
        self.reliability.set_loss(percent, link)
        where = f"link {link}" if link else "all links"
        self.emit("loss_changed", percent=percent, link=link,
                  msg=f"Packet loss on {where} set to {float(percent):g}%")

    def arm_tamper(self, count=1):
        self.tamper_armed += count
        self.emit("tamper_armed", msg=f"Attacker armed: next {count} packet(s) will be modified")

    def metrics(self):
        m = dict(self.m)
        n = m["latency_n"]
        m["avg_latency"] = m["latency_sum"] / n if n else 0.0
        m["hop_loss_pct"] = 100.0 * m["loss_drops"] / m["hop_tx"] if m["hop_tx"] else 0.0
        m["delivery_ratio"] = 100.0 * m["delivered"] / m["sent"] if m["sent"] else 0.0
        m["sim_time"] = self.env.now
        return m

