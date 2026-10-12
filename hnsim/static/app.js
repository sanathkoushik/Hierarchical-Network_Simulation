/* Dashboard for the hierarchical network simulator. */
(function () {
  "use strict";

  const COLORS = { data: "#2563eb", ack: "#16a34a", bad: "#dc2626", tamper: "#d97706", route: "#7c3aed" };
  const LEVEL_STYLE = {
    0: { color: "#111827", size: 46, shape: "round-rectangle" },
    1: { color: "#1e3a8a", size: 40, shape: "round-rectangle" },
    2: { color: "#0f766e", size: 34, shape: "ellipse" },
    3: { color: "#6b7280", size: 28, shape: "ellipse" },
  };

  const $ = (id) => document.getElementById(id);
  let cy, topo, selected = null, serverState = null, slowdown = 40;
  const tampered = new Set();

  async function api(path, body) {
    const opt = body === undefined ? {} : {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    };
    const res = await fetch(path, opt);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || res.statusText);
    }
    return res.json();
  }

  /* ------------------------------------------------------------- map */
  function buildMap() {
    const elements = [];
    topo.nodes.forEach((n) => elements.push({
      group: "nodes", data: { id: n.id, level: n.level, kind: n.kind }, position: { x: n.x, y: n.y },
    }));
    topo.edges.forEach((e) => elements.push({
      group: "edges", data: { id: e.id, source: e.source, target: e.target, weight: e.weight, label: String(e.weight) },
    }));
    cy = cytoscape({
      container: $("cy"),
      elements,
      layout: { name: "preset" },
      userZoomingEnabled: false,
      userPanningEnabled: false,
      boxSelectionEnabled: false,
      autoungrabify: true,
      style: [
        { selector: "node[level]", style: {
            label: "data(id)", "text-valign": "center", color: "#fff", "font-size": 11, "font-weight": 600,
            "border-width": 2, "border-color": "#fff" } },
        ...[0, 1, 2, 3].map((l) => ({ selector: `node[level = ${l}]`, style: {
            "background-color": LEVEL_STYLE[l].color, width: LEVEL_STYLE[l].size,
            height: LEVEL_STYLE[l].size, shape: LEVEL_STYLE[l].shape } })),
        { selector: "edge", style: {
            width: 2, "line-color": "#b6bcc6", label: "data(label)", "font-size": 10, color: "#4b5563",
            "text-background-color": "#fafafa", "text-background-opacity": 1, "text-background-padding": 2,
            "curve-style": "straight" } },
        { selector: "edge.route", style: { "line-color": COLORS.route, width: 4 } },
        { selector: ".down", style: { "line-color": COLORS.bad, "line-style": "dashed", "background-color": COLORS.bad } },
        { selector: "node.down", style: { "border-color": COLORS.bad, "border-width": 3 } },
        { selector: ".detected", style: { "line-style": "solid", opacity: 0.45 } },
        { selector: ":selected", style: { "border-color": "#f59e0b", "border-width": 4, "overlay-opacity": 0 } },
        { selector: "edge:selected", style: { "line-color": "#f59e0b", width: 5 } },
        { selector: ".pkt", style: {
            width: 11, height: 11, label: "", "border-width": 1, "border-color": "#fff",
            "z-index": 99, events: "no" } },
      ],
    });
    cy.on("tap", "node[level]", (evt) => select("node", evt.target.id()));
    cy.on("tap", "edge", (evt) => select("link", evt.target.id()));
    cy.on("tap", (evt) => { if (evt.target === cy) select(null); });
    cy.fit(undefined, 20);
  }

  function select(kind, id) {
    selected = kind ? { kind, id } : null;
    $("selected").textContent = selected
      ? (kind === "node" ? `Router / host ${id}` : `Link ${id}`) : "Nothing selected";
    $("failBtn").disabled = !selected;
    $("restoreBtn").disabled = !selected;
    $("linkLossBtn").disabled = !(selected && kind === "link");
  }

  function paintFaults() {
    if (!cy || !serverState) return;
    cy.elements().removeClass("down detected");
    serverState.failed_nodes.forEach((n) => cy.getElementById(n).addClass("down"));
    serverState.failed_links.forEach((l) => cy.getElementById(l).addClass("down"));
    serverState.detected_nodes.forEach((n) => cy.getElementById(n).addClass("detected"));
    serverState.detected_links.forEach((l) => cy.getElementById(l).addClass("detected"));
    const parts = [];
    const nodeFaults = serverState.failed_nodes, linkFaults = serverState.failed_links;
    if (nodeFaults.length) parts.push("Routers down: <b>" + nodeFaults.join(", ") + "</b>");
    if (linkFaults.length) parts.push("Links down: <b>" + linkFaults.join(", ") + "</b>");
    const undetected = [...nodeFaults.filter((n) => !serverState.detected_nodes.includes(n)),
                        ...linkFaults.filter((l) => !serverState.detected_links.includes(l))];
    if (undetected.length) parts.push("Not yet detected: " + undetected.join(", "));
    $("faultList").innerHTML = parts.length ? parts.join("<br>") : "No failures injected";
  }

  async function paintRoute() {
    const src = $("routeSrc").value;
    if (!src) return;
    const r = await api("/api/route?source=" + src);
    cy.edges().removeClass("route");
    if (!r.path) { $("routeOut").textContent = src + ": no route to HQ"; return; }
    $("routeOut").textContent = r.path.join(" > ") + "   (cost " + r.cost + " ms)";
    for (let i = 0; i < r.path.length - 1; i++) {
      cy.edges().filter((e) => {
        const s = e.source().id(), t = e.target().id();
        return (s === r.path[i] && t === r.path[i + 1]) || (t === r.path[i] && s === r.path[i + 1]);
      }).addClass("route");
    }
  }

  /* ------------------------------------------------- packet animation */
  let pktCounter = 0;
  function animateHop(ev) {
    const a = cy.getElementById(ev.src), b = cy.getElementById(ev.dst);
    if (!a.length || !b.length) return;
    const from = a.position(), to = b.position();
    const color = tampered.has(ev.packet) ? COLORS.tamper : (ev.kind === "ack" ? COLORS.ack : COLORS.data);
    const id = "pkt" + (++pktCounter);
    const node = cy.add({ group: "nodes", data: { id }, position: { x: from.x, y: from.y }, classes: "pkt" });
    node.style("background-color", color);
    if (ev.kind === "ack") node.style({ width: 8, height: 8 });

    if (ev.outcome === "blocked") {
      node.style("background-color", COLORS.bad);
      setTimeout(() => node.remove(), 500);
      return;
    }
    const lost = ev.outcome === "lost";
    const frac = lost ? 0.6 : 1;
    const target = { x: from.x + (to.x - from.x) * frac, y: from.y + (to.y - from.y) * frac };
    node.animate({ position: target }, {
      duration: Math.max(60, ev.dur * frac), easing: "linear",
      complete: () => {
        if (lost) {
          node.style({ "background-color": COLORS.bad, width: 16, height: 16 });
          setTimeout(() => node.remove(), 350);
        } else {
          node.remove();
        }
      },
    });
  }

  /* ---------------------------------------------------------- metrics */
  const TILES = [
    ["sent", "Packets sent", (m) => m.sent],
    ["delivered", "Delivered", (m) => m.delivered],
    ["ratio", "Delivery ratio", (m) => m.delivery_ratio.toFixed(1) + "%"],
    ["lat", "Avg latency", (m) => m.avg_latency.toFixed(1) + " ms"],
    ["loss", "Lost on links", (m) => m.loss_drops],
    ["retx", "Retransmissions", (m) => m.retransmissions],
    ["rer", "Reroutes", (m) => m.reroutes],
    ["tam", "Tampered, rejected", (m) => m.tampered],
  ];
  function buildTiles() {
    $("tiles").innerHTML = TILES.map(([k, label]) =>
      `<div class="tile"><div class="v" id="tile-${k}">0</div><div class="k">${label}</div></div>`).join("");
  }
  function paintMetrics(m) {
    TILES.forEach(([k, , f]) => { $("tile-" + k).textContent = f(m); });
  }

  /* ----------------------------------------------------------- charts */
  let chLat, chLoss, chRetx, startWall = null;
  const MAXPTS = 90;
  function mkChart(id, datasets, opts) {
    return new Chart($(id), {
      type: "line",
      data: { labels: [], datasets: datasets.map((d) => ({
        borderWidth: 2, pointRadius: 0, tension: 0.25, fill: false, ...d, data: [] })) },
      options: {
        animation: false, maintainAspectRatio: false,
        plugins: { legend: { display: datasets.length > 1, labels: { boxWidth: 10, font: { size: 11 } } } },
        scales: { x: { ticks: { maxTicksLimit: 6, font: { size: 10 } }, title: { display: true, text: opts.xTitle, font: { size: 10 } } },
                  y: { beginAtZero: true, ticks: { font: { size: 10 } } } },
      },
    });
  }
  function buildCharts() {
    chLat = mkChart("chLatency", [{ label: "latency", borderColor: COLORS.data, pointRadius: 2 }], { xTitle: "delivered packet #" });
    chLoss = mkChart("chLoss", [{ label: "loss", borderColor: COLORS.bad }], { xTitle: "seconds" });
    chRetx = mkChart("chRetx", [
      { label: "retransmissions", borderColor: COLORS.tamper },
      { label: "reroutes", borderColor: COLORS.route },
    ], { xTitle: "seconds" });
  }
  function push(chart, label, ...values) {
    chart.data.labels.push(label);
    values.forEach((v, i) => chart.data.datasets[i].data.push(v));
    if (chart.data.labels.length > MAXPTS) {
      chart.data.labels.shift();
      chart.data.datasets.forEach((d) => d.data.shift());
    }
    chart.update();
  }
  let delivered = 0;
  function chartLatency(ev) { delivered += 1; push(chLat, delivered, +ev.latency.toFixed(1)); }
  let prevM = null;
  function chartMetrics(m, wall) {
    if (startWall === null) startWall = wall;
    const s = Math.round(wall - startWall);
    // loss over the last interval, so the chart follows the slider quickly
    const dTx = prevM ? m.hop_tx - prevM.hop_tx : 0;
    const dLoss = prevM ? m.loss_drops - prevM.loss_drops : 0;
    const recent = dTx > 0 ? (100 * dLoss) / dTx : 0;
    prevM = m;
    push(chLoss, s, +recent.toFixed(1));
    push(chRetx, s, m.retransmissions, m.reroutes);
  }
  function clearCharts() {
    [chLat, chLoss, chRetx].forEach((c) => {
      c.data.labels = []; c.data.datasets.forEach((d) => { d.data = []; }); c.update();
    });
    delivered = 0; startWall = null; prevM = null;
  }

  /* -------------------------------------------------------------- log */
  const FILTERS = {
    all: () => true,
    problems: (t) => ["drop", "timeout", "failure_injected", "failure_detected", "gave_up", "no_route",
                      "recovery_detected", "restore_injected", "retransmit", "reroute"].includes(t),
    security: (t) => t.startsWith("tamper"),
    delivery: (t) => t === "delivered" || t === "ack_received",
  };
  function logEvent(ev) {
    if (!ev.msg) return;
    if (!FILTERS[$("logFilter").value](ev.type)) return;
    const row = document.createElement("div");
    row.className = ev.type;
    row.innerHTML = `<span class="t">${ev.t.toFixed(1).padStart(8)} ms</span>`;
    row.appendChild(document.createTextNode(ev.msg));
    const box = $("log");
    box.prepend(row);
    while (box.childElementCount > 400) box.lastChild.remove();
  }

  /* ----------------------------------------------------------- events */
  function handleEvent(ev) {
    if (ev.type === "hop") animateHop(ev);
    else if (ev.type === "tamper_injected") tampered.add(ev.packet);
    else if (ev.type === "delivered") chartLatency(ev);
    if (["failure_detected", "recovery_detected", "failure_injected", "restore_injected"].includes(ev.type)) {
      refreshState().then(paintRoute);
    }
    logEvent(ev);
  }

  async function refreshState() {
    serverState = await api("/api/state");
    syncControls();
    paintFaults();
  }

  function syncControls() {
    const s = serverState;
    slowdown = s.slowdown;
    $("loss").value = s.loss_percent; $("lossOut").textContent = s.loss_percent + "%";
    $("tamper").value = s.tamper_percent; $("tamperOut").textContent = s.tamper_percent + "%";
    $("rate").value = s.traffic_rate; $("rateOut").textContent = s.traffic_rate ? s.traffic_rate + "/s" : "off";
    $("speed").value = String(s.slowdown);
    $("cipherLine").textContent = "Cipher: " + s.cipher + " (tag verified at headquarters)";
    paintMetrics(s.metrics);
  }

  /* -------------------------------------------------------- websocket */
  function connect() {
    const ws = new WebSocket((location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/ws");
    ws.onopen = () => { $("conn").className = "dot"; $("connText").textContent = "live"; };
    ws.onclose = () => {
      $("conn").className = "dot off"; $("connText").textContent = "disconnected, retrying";
      setTimeout(connect, 1500);
    };
    ws.onmessage = (msg) => {
      const data = JSON.parse(msg.data);
      if (data.type === "hello") { serverState = data.state; syncControls(); paintFaults(); paintRoute(); }
      else if (data.type === "events") data.events.forEach(handleEvent);
      else if (data.type === "metrics") { paintMetrics(data.metrics); chartMetrics(data.metrics, data.wall); }
      else if (data.type === "reset") resetView();
    };
  }

  function resetView() {
    $("log").innerHTML = "";
    cy.nodes(".pkt").remove();
    tampered.clear();
    clearCharts();
    refreshState().then(paintRoute);
  }

  /* --------------------------------------------------------- controls */
  function wire() {
    const customers = topo.nodes.filter((n) => n.level === 3).map((n) => n.id);
    ["srcSelect", "routeSrc"].forEach((id) => {
      $(id).innerHTML = customers.map((c) => `<option>${c}</option>`).join("");
    });
    const attempt = (fn) => async () => { try { await fn(); } catch (e) { alert(e.message); } };

    $("sendBtn").onclick = attempt(() => api("/api/send", { source: $("srcSelect").value }));
    $("rate").oninput = attempt(async () => {
      const r = parseFloat($("rate").value);
      $("rateOut").textContent = r ? r + "/s" : "off";
      await api("/api/traffic", { rate: r });
    });
    $("loss").onchange = attempt(() => api("/api/loss", { percent: parseFloat($("loss").value) }));
    $("loss").oninput = () => { $("lossOut").textContent = $("loss").value + "%"; };
    $("linkLossBtn").onclick = attempt(() =>
      api("/api/loss", { percent: parseFloat($("loss").value), link: selected.id }));
    $("failBtn").onclick = attempt(() => api("/api/fail", selected));
    $("restoreBtn").onclick = attempt(() => api("/api/restore", selected));
    $("tamperBtn").onclick = attempt(() => api("/api/tamper", { arm: 1 }));
    $("tamper").oninput = () => { $("tamperOut").textContent = $("tamper").value + "%"; };
    $("tamper").onchange = attempt(() => api("/api/tamper", { percent: parseFloat($("tamper").value) }));
    $("speed").onchange = attempt(() => api("/api/speed", { slowdown: parseFloat($("speed").value) }));
    $("resetBtn").onclick = attempt(() => api("/api/reset", {}));
    $("routeSrc").onchange = paintRoute;
    $("logFilter").onchange = async () => {
      $("log").innerHTML = "";
      const rows = (await api("/api/events?limit=300")).reverse();
      rows.forEach((r) => logEvent({ type: r.type, t: r.sim_ms, msg: r.message }));
    };
  }

  /* ------------------------------------------------------------- boot */
  (async function init() {
    topo = await api("/api/topology");
    buildMap(); buildTiles(); buildCharts(); wire();
    await refreshState();
    await paintRoute();
    connect();
  })();
})();
