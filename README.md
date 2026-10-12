# Hierarchical Enterprise Network Simulation

Case study for Computer Networks, VIT.

| Team member | Registration no. |
|---|---|
| Sanath M Koushik | 24BCE2187 |
| Tarun T S | 24BCE2188 |
| Akshay Faujdar | 23BCE0059 |

A packet-level simulation of a four-level enterprise network (customer, branch,
regional office, headquarters). It demonstrates routing, reliability, fault
tolerance and security in one live web dashboard.

## Running it

Python 3.10 or newer.

```
pip install -r requirements.txt
python run.py
```

`run.py` starts the server on http://127.0.0.1:8000 and opens the dashboard.
Everything, including Cytoscape.js and Chart.js, is served locally, so the demo
works without an internet connection.

Tests: `python -m pytest`

## How the report's workflow maps to the code

| Report stage (section 2) | Where it lives |
|---|---|
| 1. Topology creation | `hnsim/topology.py`, `TopologyManager` builds a weighted NetworkX graph; edge weight is link delay in ms |
| 2. Route computation | `hnsim/routing.py`, `RoutingEngine.route` runs Dijkstra on the graph minus elements detected as down |
| 3. Encryption and tagging | `hnsim/security.py`, `SecurityModule.seal` (ChaCha20-Poly1305 or AES-GCM) |
| 4. Hop-by-hop transmission | `hnsim/engine.py`, `_data_transit`; each hop may be dropped according to the loss probability |
| 5. ACK and retransmission | `engine.py`, `_sender` and `_ack_transit`; timeout and retry limit in `Config` |
| 6. Failure detection and rerouting | `hnsim/reliability.py`, `detector`; the graph is updated and Dijkstra is re-run |
| 7. Verification at the destination | `engine.py`, `_arrive_at_hq` calls `SecurityModule.open`; failures are logged as tampered |
| 8. Logging and visualisation | `hnsim/storage.py` (SQLite), `hnsim/api.py` (WebSocket), `hnsim/static/` (dashboard) |

Architecture (report Fig. 1):

```
Browser dashboard (Cytoscape.js map, Chart.js charts)
        |  REST (start, fail, loss)        ^  WebSocket (live events)
        v                                  |
FastAPI backend  (hnsim/api.py)
        |
Topology Manager | Routing Engine | Reliability Module | Security Module
        |
SimPy discrete-event core (hnsim/engine.py)
        |
SQLite (data/simulation.db): events, packets, metrics
```

## Behaviour worth knowing before the demo

The report fixes the stages but not every parameter. These are the choices made here.

- **Topology.** 1 headquarters, 2 regional routers, 4 branch routers, 8
  customers. Each customer has a primary branch and a costlier link to the
  sibling branch; branches have a primary uplink and some have a backup uplink
  to the other region. This is what gives Dijkstra an alternative path after a
  failure. Failing the headquarters itself leaves no route, as it should.
- **Time.** Link cost is in simulated milliseconds. The dashboard stretches
  simulated time (Slow / Normal / Fast) so packets are slow enough to watch.
  Latency figures are in simulated ms.
- **Loss.** Each hop (data and ACK) is dropped with the configured probability.
  The slider sets all links; a selected link can be given its own value.
- **ACK and timeout.** The ACK retraces the data path. The timeout is the
  round-trip cost of the chosen path plus 8 ms. Up to 5 retransmissions are
  made after the first send. If an ACK is lost, the retransmitted copy reaches
  headquarters as a duplicate; it is counted once and acknowledged again.
- **Failure detection.** A failure injected from the dashboard is physical: the
  router or link stops forwarding at once. Routing only reacts after the
  detector misses 2 consecutive hellos (25 ms apart). Packets sent in that
  window are lost and recovered by retransmission. When detection fires,
  packets whose path is broken retransmit immediately on the new route.
  Restoring an element is detected on the next hello.
- **Security.** Each customer's key is derived with SHA-256 from a master
  secret shared with headquarters. The header (source, destination, sequence
  number) is bound to the ciphertext as associated data. The dashboard's
  "attacker" flips a bit of the ciphertext at an intermediate router. The tag
  check at headquarters rejects it before any plaintext is released; the sender
  then times out and retransmits the original. Key exchange is not simulated.
- **Metrics.** "Lost on links" counts hop drops from the loss model.
  "Observed link loss" is the share of hop transmissions dropped in the last
  half second.

## Suggested demo script

1. Open the dashboard. In *Route inspector* pick C1: the purple path is the
   Dijkstra route (C1 > B1 > R1 > HQ, cost 8 ms). Send a packet and watch it
   and its ACK travel.
2. Turn auto traffic on (about 3 per second).
3. **Reliability:** move *Packet loss* to about 15%. Red dots mark drops, and the
   retransmission counter and chart climb while delivery still succeeds.
4. **Failover:** click the HQ-R1 link on the map and press *Fail*. Packets die
   at the dead link until the detector fires; the log shows "Failure
   detected", then "rerouted". Check the route inspector again: the path now
   goes through R2.
5. Press *Restore* to bring the link back, then try failing router R1.
6. **Security:** set loss to 0 and press *Tamper with next packet*. The log
   shows the attacker modifying the packet, headquarters rejecting it, and a
   clean retransmission being delivered.
7. *Reset* clears the run (and the SQLite log) for another pass.

## Report and experiments

- `docs/report/CN_Case_Study_Report_IEEE.docx`: the case study report in IEEE format.
  It is generated by `docs/report/build.js` (`cd docs/report && npm install docx && node build.js out.docx`),
  which reads the measured numbers from `experiments/results.json`.
- `python experiments/run_experiments.py` re-runs the seeded loss, failure, tamper and crypto
  experiments; `python experiments/make_figures.py` redraws the figures in `docs/figures/`.

## Stored data

`data/simulation.db` holds the `events` log, a per-packet summary in `packets`
and periodic `metrics` snapshots. Quick look:

```
GET /api/events?limit=50&type=reroute
GET /api/packets?limit=20
```

## Stack

Python 3, NetworkX, SimPy, FastAPI + Uvicorn, `cryptography`, `hashlib`,
SQLite, Cytoscape.js, Chart.js.
