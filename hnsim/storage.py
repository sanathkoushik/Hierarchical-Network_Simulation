"""SQLite persistence for the event log, per-packet summaries and metrics."""
import json
import sqlite3
import threading

SCHEMA = """
CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY, sim_ms REAL, wall REAL, type TEXT, packet TEXT,
    message TEXT, detail TEXT);
CREATE TABLE IF NOT EXISTS packets (
    pid TEXT PRIMARY KEY, source TEXT, attempts INTEGER, outcome TEXT,
    created_ms REAL, delivered_ms REAL, latency_ms REAL, final_path TEXT);
CREATE TABLE IF NOT EXISTS metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT, sim_ms REAL, wall REAL, data TEXT);
"""


class Storage:
    def __init__(self, path):
        self._db = sqlite3.connect(str(path), check_same_thread=False)
        self._lock = threading.Lock()
        with self._lock:
            self._db.executescript(SCHEMA)
            self._db.commit()

    def reset(self):
        with self._lock:
            for table in ("events", "packets", "metrics"):
                self._db.execute(f"DELETE FROM {table}")
            self._db.commit()

    def log_events(self, events):
        rows = []
        for e in events:
            detail = {k: v for k, v in e.items()
                      if k not in ("id", "type", "t", "wall", "packet", "msg")}
            rows.append((e["id"], e["t"], e["wall"], e["type"], e.get("packet"),
                         e.get("msg"), json.dumps(detail)))
        with self._lock:
            self._db.executemany("INSERT OR REPLACE INTO events VALUES (?,?,?,?,?,?,?)", rows)
            self._db.commit()

    def log_packets(self, records):
        rows = [(r.pid, r.source, r.attempts, r.outcome, r.created, r.delivered_at,
                 None if r.delivered_at is None else r.delivered_at - r.created,
                 " > ".join(r.path)) for r in records]
        with self._lock:
            self._db.executemany("INSERT OR REPLACE INTO packets VALUES (?,?,?,?,?,?,?,?)", rows)
            self._db.commit()

    def log_metrics(self, m, wall):
        with self._lock:
            self._db.execute("INSERT INTO metrics (sim_ms, wall, data) VALUES (?,?,?)",
                             (m["sim_time"], wall, json.dumps(m)))
            self._db.commit()

    def recent_events(self, limit=100, kind=None):
        q = "SELECT id, sim_ms, type, packet, message FROM events"
        args = []
        if kind:
            q += " WHERE type = ?"
            args.append(kind)
        q += " ORDER BY id DESC LIMIT ?"
        args.append(limit)
        with self._lock:
            rows = self._db.execute(q, args).fetchall()
        return [dict(id=r[0], sim_ms=r[1], type=r[2], packet=r[3], message=r[4]) for r in rows]

    def recent_packets(self, limit=100):
        with self._lock:
            rows = self._db.execute(
                "SELECT pid, source, attempts, outcome, latency_ms, final_path FROM packets "
                "ORDER BY created_ms DESC LIMIT ?", (limit,)).fetchall()
        return [dict(pid=r[0], source=r[1], attempts=r[2], outcome=r[3],
                     latency_ms=r[4], path=r[5]) for r in rows]

    def count(self, table):
        with self._lock:
            return self._db.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
