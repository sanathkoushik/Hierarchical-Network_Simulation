"""Routing Engine: Dijkstra shortest path over the currently active graph."""
import networkx as nx


class RoutingEngine:
    def __init__(self, topology):
        self.topology = topology

    def route(self, source, destination):
        """Return (cost, path) of the lowest-cost route, or None if unreachable.

        The graph handed to Dijkstra excludes every router and link that the
        failure detector has marked as down, so calling this again after a
        detection is what produces the alternative path.
        """
        view = self.topology.active_graph()
        if source not in view or destination not in view:
            return None
        try:
            cost, path = nx.single_source_dijkstra(view, source, destination, weight="weight")
        except nx.NetworkXNoPath:
            return None
        return cost, path
