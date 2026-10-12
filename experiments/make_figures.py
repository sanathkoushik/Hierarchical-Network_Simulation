"""Figures for the report, drawn from the topology and experiments/results.json."""
import json
import sys
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from hnsim.engine import Config, Engine  # noqa: E402
from hnsim.topology import HQ, TopologyManager  # noqa: E402

OUT = ROOT / "docs" / "figures"
OUT.mkdir(parents=True, exist_ok=True)
R = json.loads((ROOT / "experiments" / "results.json").read_text())

plt.rcParams.update({
    "font.family": "serif", "font.serif": ["Times New Roman", "DejaVu Serif"],
    "font.size": 8, "axes.linewidth": 0.6, "axes.grid": True, "grid.alpha": 0.3,
    "grid.linewidth": 0.4, "savefig.dpi": 300,
})
LEVEL_FILL = {0: "#222222", 1: "#555555", 2: "#8a8a8a", 3: "#d0d0d0"}
LEVEL_TEXT = {0: "white", 1: "white", 2: "white", 3: "black"}


def topology_figure():
    t = TopologyManager()
    fig, ax = plt.subplots(figsize=(7.1, 3.5))
    pos = {n: (d["x"], -d["y"]) for n, d in t.graph.nodes(data=True)}
    for u, v, d in t.graph.edges(data=True):
        (x1, y1), (x2, y2) = pos[u], pos[v]
        ax.plot([x1, x2], [y1, y2], color="#999999", lw=0.8, zorder=1)
        ax.text((x1 + x2) / 2, (y1 + y2) / 2, str(d["weight"]), fontsize=6, ha="center",
                va="center", zorder=2,
                bbox=dict(boxstyle="round,pad=0.1", fc="white", ec="none", alpha=0.9))
    for n, d in t.graph.nodes(data=True):
        x, y = pos[n]
        ax.scatter([x], [y], s=520 - 60 * d["level"], c=LEVEL_FILL[d["level"]], ec="black",
                   lw=0.7, zorder=3)
        ax.text(x, y, n, color=LEVEL_TEXT[d["level"]], ha="center", va="center", fontsize=7,
                zorder=4, weight="bold")
    for label, y in [("Level 0: headquarters", -40), ("Level 1: regional", -170),
                     ("Level 2: branch", -320), ("Level 3: customers", -470)]:
        ax.text(-20, y, label, fontsize=7, va="center", ha="right", style="italic")
    ax.set_xlim(-230, 990)
    ax.set_ylim(-520, 10)
    ax.axis("off")
    fig.tight_layout()
    fig.savefig(OUT / "fig_topology.png")
    plt.close(fig)


def workflow_figure():
    steps = ["1 Topology\ncreation", "2 Route\ncomputation", "3 Encrypt\nand tag",
             "4 Hop-by-hop\ntransmission", "5 ACK and\nretransmit", "6 Failure detect\nand reroute",
             "7 Verify\nat HQ", "8 Log and\nvisualise"]
    fig, ax = plt.subplots(figsize=(7.1, 1.5))
    w, gap, y0, h = 1.0, 0.28, 1.0, 0.9
    for i, text in enumerate(steps):
        x = i * (w + gap)
        ax.add_patch(plt.Rectangle((x, y0), w, h, fc="#eeeeee", ec="black", lw=0.7))
        ax.text(x + w / 2, y0 + h / 2, text, ha="center", va="center", fontsize=6.3)
        if i < len(steps) - 1:
            ax.annotate("", xy=(x + w + gap, y0 + h / 2), xytext=(x + w, y0 + h / 2),
                        arrowprops=dict(arrowstyle="->", lw=0.8))
    # retransmission loop: out of box 5, along the bottom, back into box 2
    x5 = 4 * (w + gap) + w / 2
    x2 = 1 * (w + gap) + w / 2
    yb = 0.45
    ax.plot([x5, x5], [y0, yb], color="black", lw=0.8, ls="--")
    ax.plot([x5, x2], [yb, yb], color="black", lw=0.8, ls="--")
    ax.annotate("", xy=(x2, y0), xytext=(x2, yb), arrowprops=dict(arrowstyle="->", lw=0.8))
    ax.text((x2 + x5) / 2, yb - 0.12, "no ACK before timeout, or a failure is detected on the path: "
            "re-run Dijkstra and retransmit", ha="center", va="top", fontsize=6.2, style="italic")
    ax.set_xlim(-0.1, 8 * (w + gap) - gap + 0.1)
    ax.set_ylim(-0.1, 2.0)
    ax.axis("off")
    fig.savefig(OUT / "fig_workflow.png", bbox_inches="tight", pad_inches=0.03)
    plt.close(fig)


def loss_figure():
    rows = R["loss_sweep"]
    x = [r["loss"] for r in rows]
    fig, axs = plt.subplots(1, 2, figsize=(7.1, 2.3))
    axs[0].errorbar(x, [r["delivery"]["mean"] for r in rows],
                    yerr=[r["delivery"]["sd"] for r in rows], marker="o", ms=3, lw=1,
                    capsize=2, color="black")
    axs[0].set_xlabel("Per-hop loss probability (%)")
    axs[0].set_ylabel("Delivery ratio (%)")
    axs[0].set_ylim(85, 101)
    ax2 = axs[1]
    ax2.errorbar(x, [r["latency"]["mean"] for r in rows], yerr=[r["latency"]["sd"] for r in rows],
                 marker="s", ms=3, lw=1, capsize=2, color="black", label="Mean latency (ms)")
    ax2.plot(x, [r["p95"]["mean"] for r in rows], marker="^", ms=3, lw=1, ls="--",
             color="#555555", label="95th percentile (ms)")
    ax2.set_xlabel("Per-hop loss probability (%)")
    ax2.set_ylabel("Delivery latency (sim ms)")
    ax2.legend(frameon=False, fontsize=7)
    fig.tight_layout()
    fig.savefig(OUT / "fig_loss.png")
    plt.close(fig)

    fig, ax = plt.subplots(figsize=(3.4, 2.3))
    ax.bar([str(v) for v in x], [r["retx_per_pkt"]["mean"] for r in rows], color="#777777",
           ec="black", lw=0.6)
    ax.set_xlabel("Per-hop loss probability (%)")
    ax.set_ylabel("Retransmissions per packet")
    fig.tight_layout()
    fig.savefig(OUT / "fig_retx.png")
    plt.close(fig)


def failover_figure():
    """Per-packet latency around a failure of link HQ-R1."""
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
    ok = [(r.created, r.delivered_at - r.created) for r in eng.packets.values()
          if r.attempts == 1]
    retried = [(r.created, r.delivered_at - r.created) for r in eng.packets.values()
               if r.attempts > 1]
    fig, ax = plt.subplots(figsize=(3.45, 2.5))
    ax.scatter(*zip(*ok), s=7, c="#444444", label="first attempt succeeded")
    ax.scatter(*zip(*retried), s=22, marker="x", c="black", label="needed retransmission")
    ax.axvline(t_inject, color="black", ls="--", lw=0.8)
    ax.axvline(t_detect, color="black", ls=":", lw=0.9)
    ax.text(t_inject - 6, 37, "link fails", rotation=90, ha="right", va="top", fontsize=7)
    ax.text(t_detect + 6, 37, "detected", rotation=90, ha="left", va="top", fontsize=7)
    ax.set_xlabel("Packet creation time (sim ms)")
    ax.set_ylabel("Delivery latency (sim ms)")
    ax.set_ylim(0, 40)
    ax.legend(frameon=False, fontsize=6.5, loc="upper right", bbox_to_anchor=(1.0, 0.82))
    fig.tight_layout()
    fig.savefig(OUT / "fig_failover.png")
    plt.close(fig)


def tamper_figure():
    rows = R["tamper"]
    fig, ax = plt.subplots(figsize=(3.45, 2.3))
    x = [r["tamper_percent"] for r in rows]
    ax.errorbar(x, [r["delivery"]["mean"] for r in rows], yerr=[r["delivery"]["sd"] for r in rows],
                marker="o", ms=3, lw=1, capsize=2, color="black")
    ax.set_xlabel("Attacker strike probability per transit (%)")
    ax.set_ylabel("Delivery ratio (%)")
    fig.tight_layout()
    fig.savefig(OUT / "fig_tamper.png")
    plt.close(fig)


if __name__ == "__main__":
    topology_figure()
    workflow_figure()
    loss_figure()
    failover_figure()
    tamper_figure()
    print("figures in", OUT)
