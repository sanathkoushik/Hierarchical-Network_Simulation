import time

from fastapi.testclient import TestClient

from hnsim.api import app


def test_rest_and_websocket_flow():
    with TestClient(app) as client:
        client.post("/api/reset")
        topo = client.get("/api/topology").json()
        assert len(topo["nodes"]) == 15 and topo["destination"] == "HQ"

        assert client.get("/api/route", params={"source": "C1"}).json()["path"] == \
            ["C1", "B1", "R1", "HQ"]

        client.post("/api/fail", json={"kind": "link", "id": "HQ-R1"})
        with client.websocket_connect("/ws") as ws:
            assert ws.receive_json()["type"] == "hello"
            client.post("/api/send", json={"source": "C1"})
            seen = set()
            deadline = time.time() + 15
            while time.time() < deadline and "delivered" not in seen:
                msg = ws.receive_json()
                if msg["type"] == "events":
                    seen.update(e["type"] for e in msg["events"])
            assert "delivered" in seen

        assert client.get("/api/events", params={"type": "delivered"}).json()
        assert client.post("/api/fail", json={"kind": "node", "id": "nope"}).status_code == 400
        assert client.post("/api/send", json={"source": "HQ"}).status_code == 400
        client.post("/api/reset")
