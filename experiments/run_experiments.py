"""Headless experiments used for the evaluation section of the report.

Run from the repository root:  python experiments/run_experiments.py
Results are written to experiments/results.json. Every run is seeded, so the
numbers are reproducible. Times are simulated milliseconds.
"""
import json
import statistics as st
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from hnsim.engine import Config, Engine  # noqa: E402
from hnsim.security import SecurityModule  # noqa: E402
from hnsim.topology import HQ  # noqa: E402

SEEDS = [11, 22, 33, 44, 55]
CUSTOMERS = [f"C{i}" for i in range(1, 9)]


def mean_sd(values):
    values = list(values)
    return {"mean": st.mean(values), "sd": st.stdev(values) if len(values) > 1 else 0.0}


def send_batch(eng, n, spacing=10.0):
    """Send n packets from customers in rotation, spacing sim ms apart."""
    for i in range(n):
        eng.send(CUSTOMERS[i % 8])
        eng.advance(spacing)


def finish(eng, extra=20000):
    eng.advance(extra)


# --------------------------------------------------------------- E1: loss sweep
def loss_sweep():
    rows = []
    for loss in [0, 5, 10, 15, 20, 30]:
        per_seed = []
        for seed in SEEDS:
            eng = Engine(Config(loss_percent=loss), seed=seed)
            send_batch(eng, 400)
            finish(eng)
            m = eng.metrics()
            lat_all = [r.delivered_at - r.created for r in eng.packets.values()
                       if r.delivered_at is not None]
            per_seed.append({
                "delivery": m["delivery_ratio"],
                "retx_per_pkt": m["retransmissions"] / m["sent"],
                "latency": st.mean(lat_all) if lat_all else 0.0,
                "p95": sorted(lat_all)[int(0.95 * len(lat_all)) - 1] if lat_all else 0.0,
                "gave_up": m["gave_up"],
                "dups": m["duplicates"],
                "hop_loss": m["hop_loss_pct"],
            })
        rows.append({"loss": loss,
                     **{k: mean_sd(r[k] for r in per_seed) for k in per_seed[0]}})
    return rows


# ------------------------------------------------------------ E2: failure cases
def first(eng, kind):
    return next((e for e in eng.events if e["type"] == kind), None)


def failure_case(kind, ident, inject_at=200.0, seed=7):
    """Steady stream of packets, one element fails at inject_at."""
    eng = Engine(Config(), seed=seed)
    pre_route = {c: eng.router.route(c, HQ) for c in CUSTOMERS}
    send_n, spacing = 120, 5.0
    sent_before, injected = 0, False
    for i in range(send_n):
        if not injected and eng.env.now >= inject_at:
            eng.fail(kind, ident)
            injected = True
            t_inject = eng.env.now
        eng.send(CUSTOMERS[i % 8])
        eng.advance(spacing)
    finish(eng, 20000)
    det = first(eng, "failure_detected")
    post_route = {c: eng.router.route(c, HQ) for c in CUSTOMERS}
    recs = list(eng.packets.values())
    before = [r for r in recs if r.created < t_inject]
    after = [r for r in recs if r.created >= t_inject]
    affected = [r for r in recs if r.attempts > 1]

    def lat(rs):
        v = [r.delivered_at - r.created for r in rs if r.delivered_at is not None]
        return st.mean(v) if v else None

    changed = [c for c in CUSTOMERS if (pre_route[c] and post_route[c])
               and pre_route[c][1] != post_route[c][1]]
    return {
        "element": f"{kind} {ident}",
        "inject_at": t_inject,
        "detected_at": det["t"] if det else None,
        "detection_delay": (det["t"] - t_inject) if det else None,
        "sent": len(recs),
        "delivered": sum(r.delivered_at is not None for r in recs),
        "gave_up": sum(r.outcome == "gave up" for r in recs),
        "affected_packets": len(affected),
        "mean_latency_before": lat(before),
        "mean_latency_after": lat(after),
        "mean_latency_affected": lat(affected),
        "affected_latency_range": ([min(r.delivered_at - r.created for r in affected if r.delivered_at is not None),
                                    max(r.delivered_at - r.created for r in affected if r.delivered_at is not None)]
                                   if any(r.delivered_at is not None for r in affected) else None),
        "customers_rerouted": len(changed),
        "reroutes": eng.m["reroutes"],
        "retransmissions": eng.m["retransmissions"],
        "example": ({"customer": changed[0], "before": pre_route[changed[0]],
                     "after": post_route[changed[0]]} if changed else None),
        "no_route_customers": [c for c in CUSTOMERS if post_route[c] is None],
    }


def detection_delay_stats():
    """Detection delay vs the moment of failure within the hello cycle."""
    delays = []
    for offset in range(0, 25):
        eng = Engine(Config(), seed=1)
        eng.advance(100 + offset)
        t0 = eng.env.now
        eng.fail("node", "R2")
        eng.advance(200)
        delays.append(first(eng, "failure_detected")["t"] - t0)
    return {"min": min(delays), "max": max(delays), "mean": st.mean(delays)}


# -------------------------------------------------------------------- E3: tamper
def tamper_experiment():
    rows = []
    for pct in [0, 10, 30, 60]:
        per_seed = []
        for seed in SEEDS:
            eng = Engine(Config(tamper_percent=pct), seed=seed)
            send_batch(eng, 300)
            finish(eng)
            injected = sum(1 for e in eng.events if e["type"] == "tamper_injected")
            m = eng.metrics()
            per_seed.append({
                "injected": injected,
                "rejected": m["tampered"],
                # tampered copies that were neither rejected nor lost on the way
                # to HQ would show up as a failed payload assertion in the engine
                "not_rejected": injected - m["tampered"],
                "delivery": m["delivery_ratio"],
                "retx_per_pkt": m["retransmissions"] / m["sent"],
            })
        rows.append({"tamper_percent": pct,
                     **{k: mean_sd(r[k] for r in per_seed) for k in per_seed[0]}})
    return rows


def delivered_payload_check():
    """Every delivered packet must decrypt to its original payload; the engine
    asserts this inside _arrive_at_hq, so a clean run proves it."""
    eng = Engine(Config(loss_percent=10, tamper_percent=20), seed=3)
    send_batch(eng, 500)
    finish(eng)
    return {"packets": 500, "delivered": eng.m["delivered"],
            "tampered_rejected": eng.m["tampered"]}


# ----------------------------------------------------------------- E4: crypto cost
def crypto_benchmark(n=20000, size=96):
    out = {}
    payload = b"x" * size
    for cipher in ("chacha20-poly1305", "aes-gcm"):
        sec = SecurityModule(cipher)
        t0 = time.perf_counter()
        sealed = [sec.seal("C1", HQ, i + 1, payload) for i in range(n)]
        t1 = time.perf_counter()
        for p in sealed:
            sec.open(p)
        t2 = time.perf_counter()
        out[cipher] = {"seal_us": (t1 - t0) / n * 1e6, "open_us": (t2 - t1) / n * 1e6,
                       "overhead_bytes": len(sealed[0].data) - size}
    return out


# ------------------------------------------------------------ E5: combined stress
def combined():
    eng = Engine(Config(loss_percent=10, tamper_percent=10), seed=9)
    send_batch(eng, 100)
    eng.fail("link", "R1-B1")
    send_batch(eng, 100)
    eng.fail("node", "R2")
    send_batch(eng, 100)
    finish(eng)
    m = eng.metrics()
    return {"sent": m["sent"], "delivered": m["delivered"], "gave_up": m["gave_up"],
            "retransmissions": m["retransmissions"], "reroutes": m["reroutes"],
            "tampered_rejected": m["tampered"], "delivery_ratio": m["delivery_ratio"],
            "avg_latency": m["avg_latency"]}


def route_tables():
    """Dijkstra routes for every customer: normal, and after each detected failure."""
    out = {}
    cases = {"normal": None, "link HQ-R1": ("link", "HQ-R1"), "node R1": ("node", "R1"),
             "node R2": ("node", "R2"), "link R1-B1": ("link", "R1-B1")}
    for name, fault in cases.items():
        eng = Engine(Config(), seed=1)
        if fault:
            eng.fail(*fault)
            eng.advance(200)   # long enough for the detector to remove it
        out[name] = {c: (lambda r: None if r is None else {"cost": r[0], "path": r[1]})(
            eng.router.route(c, HQ)) for c in CUSTOMERS}
    return out


def environment():
    import platform
    from importlib.metadata import version
    eng = Engine()
    return {
        "python": platform.python_version(), "os": platform.platform(),
        "networkx": version("networkx"), "simpy": version("simpy"),
        "cryptography": version("cryptography"), "fastapi": version("fastapi"),
        "nodes": eng.topology.graph.number_of_nodes(),
        "edges": eng.topology.graph.number_of_edges(),
        "config": {k: getattr(eng.cfg, k) for k in vars(eng.cfg)},
    }


def main():
    results = {
        "environment": environment(),
        "routes": route_tables(),
        "seeds": SEEDS,
        "loss_sweep": loss_sweep(),
        "failures": [
            failure_case("link", "HQ-R1"),
            failure_case("node", "R1"),
            failure_case("node", "R2"),
            failure_case("link", "R1-B1"),
            failure_case("node", HQ),
        ],
        "detection_delay": detection_delay_stats(),
        "tamper": tamper_experiment(),
        "payload_check": delivered_payload_check(),
        "crypto": crypto_benchmark(),
        "combined": combined(),
    }
    out = Path(__file__).with_name("results.json")
    out.write_text(json.dumps(results, indent=2))
    print("wrote", out)


if __name__ == "__main__":
    main()
