"""Reliability Module: packet loss, ACK timeouts and failure detection.

Physical faults (what the dashboard injects) are kept here. The routing layer
only learns about a fault once the detector has missed enough consecutive
hellos, at which point the topology's active graph is updated.
"""


class ReliabilityModule:
    def __init__(self, topology, config, rng, emit, on_topology_change):
        self.topology = topology
        self.cfg = config
        self.rng = rng
        self.emit = emit
        self.on_change = on_topology_change
        self.failed_nodes = set()
        self.failed_links = set()
        self.link_loss = {}  # per-link override, percent
        self._misses = {}

    # --- packet loss ----------------------------------------------------
    def loss_percent(self, u, v):
        return self.link_loss.get(self.topology.edge_id(u, v), self.cfg.loss_percent)

    def roll_loss(self, u, v):
        return self.rng.random() * 100.0 < self.loss_percent(u, v)

    def set_loss(self, percent, link=None):
        percent = max(0.0, min(100.0, float(percent)))
        if link is None:
            self.cfg.loss_percent = percent
            self.link_loss.clear()
        else:
            self.link_loss[link] = percent

    # --- timers -----------------------------------------------------------
    def ack_timeout(self, path_cost):
        """Round-trip time over the chosen path plus a fixed margin (sim ms)."""
        return 2 * path_cost + self.cfg.ack_margin

    # --- faults -----------------------------------------------------------
    def hop_status(self, u, v):
        """Why a transmission u -> v cannot succeed right now, or None."""
        if u in self.failed_nodes:
            return f"router {u} is down"
        if self.topology.edge_id(u, v) in self.failed_links:
            return f"link {self.topology.edge_id(u, v)} is down"
        if v in self.failed_nodes:
            return f"router {v} is down"
        return None

    def inject(self, kind, ident):
        target = self.failed_nodes if kind == "node" else self.failed_links
        target.add(ident)

    def restore(self, kind, ident):
        target = self.failed_nodes if kind == "node" else self.failed_links
        target.discard(ident)

    # --- failure detection ---------------------------------------------------
    def detector(self, env):
        """Hello-based detector. An element is declared down after
        `dead_misses` consecutive missed hellos and declared up again on the
        first hello that gets through."""
        while True:
            yield env.timeout(self.cfg.hello_interval)
            elements = [("node", n, n in self.failed_nodes) for n in self.topology.nodes()]
            elements += [("link", e["id"], e["id"] in self.failed_links)
                         for e in self.topology.describe()["edges"]]
            changed = False
            for kind, ident, is_down in elements:
                key = (kind, ident)
                known_down = (ident in self.topology.down_nodes if kind == "node"
                              else ident in self.topology.down_edges)
                if is_down:
                    self._misses[key] = self._misses.get(key, 0) + 1
                    if self._misses[key] >= self.cfg.dead_misses and not known_down:
                        self.topology.mark_down(kind, ident)
                        changed = True
                        self.emit("failure_detected", element=ident, kind=kind,
                                  msg=f"Failure detected: {kind} {ident} missed "
                                      f"{self._misses[key]} hellos; removed from routing graph")
                else:
                    self._misses[key] = 0
                    if known_down:
                        self.topology.mark_up(kind, ident)
                        changed = True
                        self.emit("recovery_detected", element=ident, kind=kind,
                                  msg=f"Recovery detected: {kind} {ident} is answering hellos again")
            if changed:
                self.on_change()
