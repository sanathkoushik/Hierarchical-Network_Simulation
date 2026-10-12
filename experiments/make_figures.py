"""Figures for the report, drawn from the topology and experiments/results.json.

All figures are sized for a single IEEE column (3.45 in) and kept greyscale so
they survive black-and-white printing.
"""
import json
import sys
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from hnsim.engine import Config, Engine  # noqa: E402
from hnsim.topology import TopologyManager  # noqa: E402

OUT = ROOT / "docs" / "figures"
OUT.mkdir(parents=True, exist_ok=True)
R = json.loads((ROOT / "experiments" / "results.json").read_text())

COL = 3.45
plt.rcParams.update({
    "font.family": "serif", "font.serif": ["Times New Roman", "DejaVu Serif"],
    "font.size": 7.5, "axes.linewidth": 0.6, "axes.grid": True, "grid.alpha": 0.3,
    "grid.linewidth": 0.4, "savefig.dpi": 300, "legend.fontsize": 6.5,
})
LEVEL_FILL = {0: "#222222", 1: "#555555", 2: "#8a8a8a", 3: "#d0d0d0"}
LEVEL_TEXT = {0: "white", 1: "white", 2: "white", 3: "black"}


def topology_figure():
    t = TopologyManager()
    fig, ax = plt.subplots(figsize=(COL, 3.0))
    pos = {n: (d["x"], -d["y"]) for n, d in t.graph.nodes(data=True)}
    for u, v, d in t.graph.edges(data=True):
        (x1, y1), (x2, y2) = pos[u], pos[v]
        ax.plot([x1, x2], [y1, y2], color="#9a9a9a", lw=0.6, zorder=1)
        ax.text((x1 + x2) / 2, (y1 + y2) / 2, str(d["weight"]), fontsize=4.6, ha="center",
                va="center", zorder=2,
                bbox=dict(boxstyle="round,pad=0.05", fc="white", ec="none", alpha=0.9))
    for n, d in t.graph.nodes(data=True):
        x, y = pos[n]
        ax.scatter([x], [y], s=190 - 25 * d["level"], c=LEVEL_FILL[d["level"]], ec="black",
                   lw=0.6, zorder=3)
        ax.text(x, y, n, color=LEVEL_TEXT[d["level"]], ha="center", va="center", fontsize=5.2,
                zorder=4, weight="bold")
    for label, y in [("L0", -40), ("L1", -170), ("L2", -320), ("L3", -470)]:
        ax.text(10, y, label, fontsize=6.5, va="center", ha="center", style="italic")
    ax.set_xlim(-30, 970)
    ax.set_ylim(-510, 0)
    ax.axis("off")
    fig.subplots_adjust(left=0, right=1, top=1, bottom=0)
    fig.savefig(OUT / "fig_topology.png")
    plt.close(fig)


def workflow_figure():
    steps = ["1 Topology\ncreation", "2 Route\ncomputation", "3 Encrypt\nand tag",
             "4 Hop-by-hop\ntransmission", "5 ACK and\nretransmit", "6 Detect failure\nand reroute",
             "7 Verify\nat HQ", "8 Log and\nvisualise"]
    fig, ax = plt.subplots(figsize=(COL, 1.7))
    w, h, gap = 1.0, 0.75, 0.22
    row_y = {0: 1.45, 1: 0.45}
    pos = {}
    for i, text in enumerate(steps):
        r, c = divmod(i, 4)
        x, y = c * (w + gap), row_y[r]
        pos[i] = (x, y)
        ax.add_patch(plt.Rectangle((x, y), w, h, fc="#eeeeee", ec="black", lw=0.6))
        ax.text(x + w / 2, y + h / 2, text, ha="center", va="center", fontsize=5.3)
        if c < 3:
            ax.annotate("", xy=(x + w + gap, y + h / 2), xytext=(x + w, y + h / 2),
                        arrowprops=dict(arrowstyle="->", lw=0.6))
    # wrap from the end of row 1 to the start of row 2
    x4, y4 = pos[3]
    x5, y5 = pos[4]
    mid = (row_y[0] + row_y[1] + h) / 2
    ax.plot([x4 + w / 2, x4 + w / 2], [y4, mid], color="black", lw=0.6)
    ax.plot([x4 + w / 2, x5 + w / 2], [mid, mid], color="black", lw=0.6)
    ax.annotate("", xy=(x5 + w / 2, y5 + h), xytext=(x5 + w / 2, mid),
                arrowprops=dict(arrowstyle="->", lw=0.6))
    ax.set_xlim(-0.05, 4 * (w + gap) - gap + 0.05)
    ax.set_ylim(0.4, 2.25)
    ax.axis("off")
    fig.savefig(OUT / "fig_workflow.png", bbox_inches="tight", pad_inches=0.02)
    plt.close(fig)


def _errline(ax, x, rows, key, marker, label=None, ls="-", color="black"):
    ax.errorbar(x, [r[key]["mean"] for r in rows], yerr=[r[key]["sd"] for r in rows],
                marker=marker, ms=3, lw=0.9, capsize=2, color=color, ls=ls, label=label)


def loss_figures():
    rows = R["loss_sweep"]
    x = [r["loss"] for r in rows]

    fig, ax = plt.subplots(figsize=(COL, 2.1))
    _errline(ax, x, rows, "delivery", "o")
    ax.set_xlabel("Per-hop loss probability (%)")
    ax.set_ylabel("Delivery ratio (%)")
    ax.set_ylim(88, 101)
    fig.tight_layout(pad=0.4)
    fig.savefig(OUT / "fig_loss_delivery.png")
    plt.close(fig)

    fig, ax = plt.subplots(figsize=(COL, 2.1))
    _errline(ax, x, rows, "latency", "s", "mean")
    ax.plot(x, [r["p95"]["mean"] for r in rows], marker="^", ms=3, lw=0.9, ls="--",
            color="#555555", label="95th percentile")
    ax.set_xlabel("Per-hop loss probability (%)")
    ax.set_ylabel("Delivery latency (sim ms)")
    ax.legend(frameon=False, loc="upper left")
    fig.tight_layout(pad=0.4)
    fig.savefig(OUT / "fig_loss_latency.png")
    plt.close(fig)

    fig, ax = plt.subplots(figsize=(COL, 2.0))
    ax.bar([str(v) for v in x], [r["retx_per_pkt"]["mean"] for r in rows], color="#777777",
           ec="black", lw=0.5, width=0.6)
    ax.set_xlabel("Per-hop loss probability (%)")
    ax.set_ylabel("Retransmissions per packet")
    fig.tight_layout(pad=0.4)
    fig.savefig(OUT / "fig_retx.png")
    plt.close(fig)


def failover_figure():
    """Per-packet latency around a failure of link HQ-R1 (same run as the failure table)."""
    eng = Engine(Config(), seed=7)
    customers = [f"C{i}" for i in range(1, 9)]
    t_inject = None
    for i in range(120):
        if t_inject is None and eng.env.now >= 200.0:
            eng.fail("link", "HQ-R1")
            t_inject = eng.env.now
        eng.send(customers[i % 8])
        eng.advance(5.0)
    eng.advance(20000)
    t_detect = next(e["t"] for e in eng.events if e["type"] == "failure_detected")
    ok = [(r.created, r.delivered_at - r.created) for r in eng.packets.values() if r.attempts == 1]
    retried = [(r.created, r.delivered_at - r.created) for r in eng.packets.values()
               if r.attempts > 1]
    fig, ax = plt.subplots(figsize=(COL, 2.3))
    ax.scatter(*zip(*ok), s=6, c="#444444", label="delivered on first attempt")
    ax.scatter(*zip(*retried), s=20, marker="x", c="black", label="needed retransmission")
    ax.axvline(t_inject, color="black", ls="--", lw=0.7)
    ax.axvline(t_detect, color="black", ls=":", lw=0.8)
    ax.text(t_inject - 8, 39, "link fails", rotation=90, ha="right", va="top", fontsize=6.5)
    ax.text(t_detect + 8, 39, "failure detected", rotation=90, ha="left", va="top", fontsize=6.5)
    ax.set_xlabel("Packet creation time (sim ms)")
    ax.set_ylabel("Delivery latency (sim ms)")
    ax.set_ylim(0, 40)
    ax.legend(frameon=False, loc="upper right", bbox_to_anchor=(1.0, 0.78))
    fig.tight_layout(pad=0.4)
    fig.savefig(OUT / "fig_failover.png")
    plt.close(fig)


def tamper_figure():
    rows = R["tamper"]
    x = [r["tamper_percent"] for r in rows]
    fig, ax = plt.subplots(figsize=(COL, 2.0))
    _errline(ax, x, rows, "delivery", "o")
    ax.set_xlabel("Attacker strike probability per router (%)")
    ax.set_ylabel("Delivery ratio (%)")
    fig.tight_layout(pad=0.4)
    fig.savefig(OUT / "fig_tamper.png")
    plt.close(fig)


if __name__ == "__main__":
    topology_figure()
    workflow_figure()
    loss_figures()
    failover_figure()
    tamper_figure()
    print("figures in", OUT)
