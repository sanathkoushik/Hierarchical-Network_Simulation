"""FastAPI backend: REST control endpoints plus a WebSocket for live events."""
import asyncio
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from .engine import Config, Engine
from .storage import Storage
from .topology import HQ

ROOT = Path(__file__).resolve().parent
DB_PATH = ROOT.parent / "data" / "simulation.db"

TICK = 0.02           # seconds between simulation steps
METRICS_EVERY = 0.5   # seconds between metrics pushes to the dashboard
SNAPSHOT_EVERY = 2.0  # seconds between metric snapshots stored in SQLite


class Hub:
    """Tracks connected dashboards and fans messages out to them."""

    def __init__(self):
        self.clients = set()

    async def broadcast(self, message):
        dead = []
        for ws in list(self.clients):
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.clients.discard(ws)


class State:
    def __init__(self):
        self.engine = Engine()
        self.storage = Storage(DB_PATH)
        self.hub = Hub()

    def reset(self):
        cfg = self.engine.cfg
        fresh = Config(slowdown=cfg.slowdown)
        self.engine = Engine(fresh)
        self.storage.reset()


state = State()


async def pump():
    last_metrics = last_snapshot = 0.0
    while True:
        await asyncio.sleep(TICK)
        eng = state.engine
        eng.tick()
        events = eng.drain()
        if events:
            state.storage.log_events(events)
            await state.hub.broadcast({"type": "events", "events": events})
        done = eng.drain_finished()
        if done:
            state.storage.log_packets(done)
        now = time.monotonic()
        if now - last_metrics >= METRICS_EVERY:
            last_metrics = now
            await state.hub.broadcast({"type": "metrics", "metrics": eng.metrics(),
                                       "wall": time.time()})
        if now - last_snapshot >= SNAPSHOT_EVERY:
            last_snapshot = now
            state.storage.log_metrics(eng.metrics(), time.time())


@asynccontextmanager
async def lifespan(_app):
    task = asyncio.create_task(pump())
    yield
    task.cancel()


app = FastAPI(title="Hierarchical Network Simulation", lifespan=lifespan)


# ---------------------------------------------------------------- requests
class SendReq(BaseModel):
    source: str


class TrafficReq(BaseModel):
    rate: float  # packets per second, 0 stops traffic


class ElementReq(BaseModel):
    kind: str    # "node" or "link"
    id: str


class LossReq(BaseModel):
    percent: float
    link: Optional[str] = None


class TamperReq(BaseModel):
    arm: int = 0                       # modify the next N packets
    percent: Optional[float] = None    # continuous tamper probability


class SpeedReq(BaseModel):
    slowdown: float


def _guard(fn, *args, **kwargs):
    try:
        return fn(*args, **kwargs)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


def _snapshot():
    eng = state.engine
    rel = eng.reliability
    return {
        "failed_nodes": sorted(rel.failed_nodes),
        "failed_links": sorted(rel.failed_links),
        "detected_nodes": sorted(eng.topology.down_nodes),
        "detected_links": sorted(eng.topology.down_edges),
        "loss_percent": eng.cfg.loss_percent,
        "link_loss": rel.link_loss,
        "tamper_percent": eng.cfg.tamper_percent,
        "tamper_armed": eng.tamper_armed,
        "traffic_rate": eng.traffic_rate,
        "slowdown": eng.cfg.slowdown,
        "cipher": eng.security.cipher,
        "metrics": eng.metrics(),
    }


# --------------------------------------------------------------------- REST
@app.get("/api/topology")
def topology():
    return {**state.engine.topology.describe(), "destination": HQ}


@app.get("/api/state")
def get_state():
    return _snapshot()


@app.get("/api/route")
def route(source: str):
    eng = state.engine
    if source not in eng.topology.customers():
        raise HTTPException(400, f"{source} is not a customer")
    found = eng.router.route(source, HQ)
    if found is None:
        return {"source": source, "path": None, "cost": None}
    return {"source": source, "path": found[1], "cost": found[0]}


@app.post("/api/send")
def send(req: SendReq):
    return {"packet": _guard(state.engine.send, req.source)}


@app.post("/api/traffic")
def traffic(req: TrafficReq):
    state.engine.traffic_rate = max(0.0, min(20.0, req.rate))
    return _snapshot()


@app.post("/api/fail")
def fail(req: ElementReq):
    _guard(state.engine.fail, req.kind, req.id)
    return _snapshot()


@app.post("/api/restore")
def restore(req: ElementReq):
    _guard(state.engine.restore, req.kind, req.id)
    return _snapshot()


@app.post("/api/loss")
def loss(req: LossReq):
    if req.link and not state.engine.topology.has_edge_id(req.link):
        raise HTTPException(400, f"unknown link {req.link}")
    state.engine.set_loss(req.percent, req.link)
    return _snapshot()


@app.post("/api/tamper")
def tamper(req: TamperReq):
    if req.arm > 0:
        state.engine.arm_tamper(req.arm)
    if req.percent is not None:
        state.engine.cfg.tamper_percent = max(0.0, min(100.0, req.percent))
    return _snapshot()


@app.post("/api/speed")
def speed(req: SpeedReq):
    state.engine.cfg.slowdown = max(5.0, min(200.0, req.slowdown))
    return _snapshot()


@app.post("/api/reset")
async def reset():
    state.reset()
    await state.hub.broadcast({"type": "reset"})
    return _snapshot()


@app.get("/api/events")
def events(limit: int = 100, type: Optional[str] = None):
    return state.storage.recent_events(min(limit, 1000), type)


@app.get("/api/packets")
def packets(limit: int = 100):
    return state.storage.recent_packets(min(limit, 1000))


# ---------------------------------------------------------------- WebSocket
@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket):
    await ws.accept()
    state.hub.clients.add(ws)
    await ws.send_json({"type": "hello", "state": _snapshot()})
    try:
        while True:
            await ws.receive_text()   # the dashboard only listens
    except WebSocketDisconnect:
        pass
    finally:
        state.hub.clients.discard(ws)


STATIC = ROOT / "static"
app.mount("/static", StaticFiles(directory=STATIC), name="static")


@app.get("/")
def index():
    return FileResponse(STATIC / "index.html")
