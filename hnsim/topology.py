"""Topology Manager: the four-level enterprise hierarchy as a weighted graph.

Levels (top to bottom): headquarters, regional routers, branch routers,
customers. Edge weight is link cost, i.e. one-way delay in milliseconds.
"""
import networkx as nx

HQ = "HQ"

LEVEL_NAMES = {0: "Headquarters", 1: "Regional router", 2: "Branch router", 3: "Customer"}

# (id, level, x, y) - fixed canvas positions used by the dashboard map
_NODES = [
    ("HQ", 0, 500, 40),
    ("R1", 1, 280, 170), ("R2", 1, 720, 170),
    ("B1", 2, 150, 320), ("B2", 2, 400, 320), ("B3", 2, 600, 320), ("B4", 2, 850, 320),
    ("C1", 3, 80, 470), ("C2", 3, 220, 470), ("C3", 3, 330, 470), ("C4", 3, 470, 470),
    ("C5", 3, 530, 470), ("C6", 3, 670, 470), ("C7", 3, 780, 470), ("C8", 3, 920, 470),
]

# (u, v, cost in ms)
_EDGES = [
    # core
    ("HQ", "R1", 2), ("HQ", "R2", 2), ("R1", "R2", 4),
    # regional -> branch (primary uplinks)
    ("R1", "B1", 4), ("R1", "B2", 5), ("R2", "B3", 4), ("R2", "B4", 5),
    # backup uplinks across regions, and lateral branch links
    ("B2", "R2", 9), ("B3", "R1", 9), ("B1", "B2", 3), ("B3", "B4", 3),
    # customers: primary branch, plus a costlier link to the sibling branch
    ("C1", "B1", 2), ("C1", "B2", 6), ("C2", "B1", 3), ("C2", "B2", 7),
    ("C3", "B2", 2), ("C3", "B1", 6), ("C4", "B2", 3), ("C4", "B1", 7),
    ("C5", "B3", 2), ("C5", "B4", 6), ("C6", "B3", 3), ("C6", "B4", 7),
    ("C7", "B4", 2), ("C7", "B3", 6), ("C8", "B4", 3), ("C8", "B3", 7),
]


class TopologyManager:
    def __init__(self):
        self.graph = nx.Graph()
        self._edge_ids = {}
        for node, level, x, y in _NODES:
            self.graph.add_node(node, level=level, x=x, y=y)
        for u, v, w in _EDGES:
            eid = f"{u}-{v}"
            self.graph.add_edge(u, v, weight=w, id=eid)
            self._edge_ids[frozenset((u, v))] = eid
        # elements the routing layer currently believes are down
        self.down_nodes = set()
        self.down_edges = set()

    # --- lookups -------------------------------------------------------
    def edge_id(self, u, v):
        return self._edge_ids[frozenset((u, v))]

    def weight(self, u, v):
        return self.graph[u][v]["weight"]

    def customers(self):
        return [n for n, d in self.graph.nodes(data=True) if d["level"] == 3]

    def nodes(self):
        return list(self.graph.nodes)

    def has_node(self, n):
        return n in self.graph

    def has_edge_id(self, eid):
        return eid in self._edge_ids.values()

    # --- routing view (graph update after a failure is detected) ------
    def mark_down(self, kind, ident):
        (self.down_nodes if kind == "node" else self.down_edges).add(ident)

    def mark_up(self, kind, ident):
        (self.down_nodes if kind == "node" else self.down_edges).discard(ident)

    def active_graph(self):
        return nx.subgraph_view(
            self.graph,
            filter_node=lambda n: n not in self.down_nodes,
            filter_edge=lambda u, v: self.graph[u][v]["id"] not in self.down_edges,
        )

    def path_is_broken(self, path):
        if any(n in self.down_nodes for n in path):
            return True
        return any(self.edge_id(a, b) in self.down_edges for a, b in zip(path, path[1:]))

    # --- serialisation for the dashboard -------------------------------
    def describe(self):
        nodes = [
            {"id": n, "level": d["level"], "kind": LEVEL_NAMES[d["level"]], "x": d["x"], "y": d["y"]}
            for n, d in self.graph.nodes(data=True)
        ]
        edges = [
            {"id": d["id"], "source": u, "target": v, "weight": d["weight"]}
            for u, v, d in self.graph.edges(data=True)
        ]
        return {"nodes": nodes, "edges": edges}

