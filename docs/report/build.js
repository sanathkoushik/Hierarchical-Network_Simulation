// Builds the IEEE-format case study report from the original text plus measured results.
// Usage: node build.js <output.docx>
const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, AlignmentType, SectionType, LevelFormat, Table, TableRow,
  TableCell, WidthType, BorderStyle,
} = require("docx");
const H = require("./ieee");
const { body, h1, h2, bullets, numbered, figure, table, tableCaption, spacer, equation, listing, runs } = H;

const ROOT = path.resolve(__dirname, "..", "..");
const FIG = (n) => path.join(ROOT, "docs", "figures", n);
const R = JSON.parse(fs.readFileSync(path.join(ROOT, "experiments", "results.json"), "utf8"));
const E = R.environment;

const f = (x, d = 1) => Number(x).toFixed(d);
const pm = (o, d = 1) => `${f(o.mean, d)}±${f(o.sd, d)}`;
const fmtPath = (r) => (r ? `${r.path.slice(1).join(",")} (${r.cost})` : "none");

// ---- derived numbers ---------------------------------------------------------------------
const loss = R.loss_sweep;
const L = (p) => loss.find((r) => r.loss === p);
const modelDelivery = (p, h = 3, n = 5) => 100 * (1 - Math.pow(1 - Math.pow(1 - p / 100, h), n + 1));
const modelTamper = (p, h = 3, n = 5) => 100 * (1 - Math.pow(1 - Math.pow(1 - p / 100, h - 1), n + 1));
const maxDiff = Math.max(...loss.map((r) => Math.abs(r.delivery.mean - modelDelivery(r.loss))));
const fails = R.failures;
const FA = (name) => fails.find((x) => x.element === name);
const tamp = R.tamper;
const T = (p) => tamp.find((r) => r.tamper_percent === p);
const cry = R.crypto;
const comb = R.combined;
const det = R.detection_delay;

const REFS = [
  "A. Boltres, N. Freymuth, B. Schichtholz, M. König, and G. Neumann, “Towards near-real-time telemetry-aware routing with neural routing algorithms,” arXiv:2604.02927, Apr. 2026.",
  "A. Boltres, N. Freymuth, and G. Neumann, “Can neural networks provide latent embeddings for telemetry-aware greedy routing?,” arXiv:2602.12798, Feb. 2026.",
  "B. Kim, J. H. Kong, T. J. Moore, and F. T. Dagefu, “Deep reinforcement learning for multi-flow routing in heterogeneous wireless networks,” arXiv:2511.02030, Nov. 2025.",
  "L. You, N. Zhou, G. Pang, J. Huang, Y. Shao, and L. Fu, “From simulation to reality: Practical deep reinforcement learning-based link adaptation for cellular networks,” arXiv:2603.00689, Feb. 2026.",
  "J. S. Sidhu, A. Sahu, and A. Bentaleb, “TAROT: Towards optimization-driven adaptive FEC parameter tuning for video streaming,” in <i>Proc. 17th ACM Multimedia Systems Conf. (MMSys)</i>, Hong Kong, China, Apr. 2026; extended version arXiv:2602.09880.",
  "W. Dai, K.-T. Foerster, and S. Schmid, “Fast rerouting against dynamic failures: 2-resilience via ear-decomposition and planarity,” in <i>Proc. 29th Int. Conf. Principles of Distributed Systems (OPODIS 2025)</i>, ser. LIPIcs, vol. 361. Dagstuhl, Germany: Schloss Dagstuhl–Leibniz-Zentrum für Informatik, 2026, pp. 20:1–20:20, doi: 10.4230/LIPIcs.OPODIS.2025.20.",
  "M. Bentert, E. Ceylan, V. Hübner, S. Schmid, and J. Srba, “Fast re-routing in networks: On the complexity of perfect resilience,” in <i>Proc. 29th Int. Conf. Principles of Distributed Systems (OPODIS 2025)</i>, ser. LIPIcs, vol. 361. Dagstuhl, Germany: Schloss Dagstuhl–Leibniz-Zentrum für Informatik, 2026, pp. 31:1–31:16, doi: 10.4230/LIPIcs.OPODIS.2025.31.",
  "M. W. Charrwi and Z. Hussain, “Resilient packet forwarding: A reinforcement learning approach to routing in Gaussian interconnected networks with clustered faults,” arXiv:2512.20394, Dec. 2025.",
  "Z. Liu, “Link failure recovery in hybrid SDN using prior knowledge-based reinforcement learning algorithms,” in <i>Advanced Intelligent Computing Technology and Applications (ICIC 2025)</i>. Springer, Jul. 2025, doi: 10.1007/978-981-96-9958-2_29.",
  "C.-P. Lin, Y.-Y. Hou, and T.-L. Liao, “Authenticated encryption with associated data and ECDH-based key exchange for secure smart grid power monitoring and simulation,” <i>Comput., Mater. Continua</i>, vol. 89, no. 2, Art. no. 44, Sep. 2026, doi: 10.32604/cmc.2026.085788.",
  "D. Alsobaie, U. Khan, and W. Alsabhan, “Lightweight secure protocols for low-powered IoT devices: Modern ciphers, authentication, and machine learning-based intrusion detection,” <i>Sensors</i>, vol. 26, no. 18, Art. no. 5847, Sep. 2026, doi: 10.3390/s26185847.",
  "B. K. Sedraoui, A. Benmachiche, and A. Makhlouf, “Developing and evaluating lightweight cryptographic algorithms for secure embedded systems in IoT devices,” arXiv:2601.02981, Jan. 2026.",
  "A. Hillel-Tuch, “Data siphoning through advanced persistent transmission attacks at the physical layer,” arXiv:2601.17967, Jan. 2026.",
  "F. Lozano-Cuadra, B. Soret, M. Sanchez Net, A. Cauligi, and F. Rossi, “Learning decentralized routing policies via graph attention-based multi-agent reinforcement learning in lunar delay-tolerant networks,” arXiv:2510.20436, Oct. 2025.",
  "F. Al-Ani, M. Wang, J. Charles, A. Ong, J. Forday, and V. Modi, “Simulation-driven reinforcement learning in queuing network routing optimization,” arXiv:2507.18795, Jul. 2025.",
  "E. W. Dijkstra, “A note on two problems in connexion with graphs,” <i>Numer. Math.</i>, vol. 1, no. 1, pp. 269–271, Dec. 1959.",
  "A. A. Hagberg, D. A. Schult, and P. J. Swart, “Exploring network structure, dynamics, and function using NetworkX,” in <i>Proc. 7th Python in Science Conf. (SciPy)</i>, Pasadena, CA, USA, Aug. 2008, pp. 11–15.",
  "J. Postel, “Transmission Control Protocol,” IETF, RFC 793, Sep. 1981.",
  "J. F. Kurose and K. W. Ross, <i>Computer Networking: A Top-Down Approach</i>, 8th ed. Hoboken, NJ, USA: Pearson, 2021.",
  "Y. Nir and A. Langley, “ChaCha20 and Poly1305 for IETF protocols,” IETF, RFC 8439, Jun. 2018.",
  "M. Dworkin, “Recommendation for block cipher modes of operation: Galois/Counter Mode (GCM) and GMAC,” NIST, Gaithersburg, MD, USA, Spec. Publ. 800-38D, Nov. 2007.",
  "“SimPy: Discrete event simulation for Python,” SimPy documentation. [Online]. Available: https://simpy.readthedocs.io",
  "S. M. Koushik, T. T. S., and A. Faujdar, “Hierarchical network simulation,” source code repository, Oct. 2026. [Online]. Available: https://github.com/sanathkoushik/Hierarchical-Network_Simulation",
];

// ================================ TITLE BLOCK ===================================================
function authorCell(name, reg) {
  const none = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
  return new TableCell({
    width: { size: H.FULLW / 3, type: WidthType.DXA },
    borders: { top: none, bottom: none, left: none, right: none },
    children: [
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 0 }, children: runs(name, { size: 22 }) }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 0 }, children: runs(`Registration No. ${reg}`, { size: 18, italics: true }) }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 0 }, children: runs("Vellore Institute of Technology (VIT)", { size: 18, italics: true }) }),
    ],
  });
}

const titleBlock = [
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 60 },
    children: runs("Hierarchical Enterprise Network Simulation for Routing, Reliability and Security", { size: 44 }) }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 },
    children: runs("Computer Networks – Case Study Report", { size: 24, italics: true }) }),
  new Table({
    width: { size: H.FULLW, type: WidthType.DXA }, columnWidths: [H.FULLW / 3, H.FULLW / 3, H.FULLW / 3],
    borders: { top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, insideVertical: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" } },
    rows: [new TableRow({ children: [
      authorCell("Sanath M Koushik", "24BCE2187"),
      authorCell("Tarun T S", "24BCE2188"),
      authorCell("Akshay Faujdar", "23BCE0059"),
    ] })],
  }),
  spacer(120),
];

// ================================ BODY ==========================================================
const B = [];
const add = (...items) => items.flat().forEach((x) => B.push(x));

// ---- Abstract and index terms (original text, unchanged) ----
add(new Paragraph({
  alignment: AlignmentType.JUSTIFIED, spacing: { after: 80, line: 216 },
  children: runs("<b><i>Abstract</i></b><b>—</b>Enterprise networks are rarely flat: data from a customer typically travels through a branch, a regional office and finally the headquarters, and a fault at any level can disturb the whole path. This case study presents a software simulation of such a hierarchical enterprise network. The simulator models the network as a weighted graph and uses Dijkstra’s shortest-path algorithm to choose routes. It reproduces unreliable links through configurable packet loss and recovers using acknowledgements, timeouts and retransmission. When a router or link fails, the failure is detected and traffic is rerouted automatically over an alternative path. Every packet is protected with authenticated encryption and an integrity check, so tampered packets are rejected at the receiver. All behaviour is shown on a real-time web dashboard that allows failures and loss rates to be injected live during a demonstration. The system is built entirely with free, open-source tools (Python, NetworkX, SimPy, FastAPI) and is informed by recent 2025–2026 research on telemetry-aware routing, fast failover and lightweight authenticated encryption [1]–[13].", { size: 18, bold: true }),
}));
add(new Paragraph({
  alignment: AlignmentType.JUSTIFIED, spacing: { after: 100, line: 216 },
  children: runs("<b><i>Index Terms</i></b><b>—</b>enterprise network, Dijkstra routing, packet loss, retransmission, failure recovery, authenticated encryption, network simulation.", { size: 18, bold: true }),
}));

// ---- I. Introduction ----
add(h1("I", "Introduction and Objectives"));
add(h2("A", "Background and Motivation"));
add(body("Enterprise networks are organised in layers. A customer-facing site connects to a branch, branches connect to a regional office, and regional offices connect to the headquarters (HQ) where core services and data reside. Traffic therefore crosses several administrative and physical boundaries, and each boundary adds a point of failure: a link can degrade and drop packets, a router can crash, and an attacker positioned on the path can try to alter data in transit. A course on computer networks teaches the mechanisms that answer these problems separately, namely shortest-path routing, acknowledgement-based reliability, fault detection and cryptographic protection. In an operating network they work together, and their interaction is where most practical difficulty lies."));
add(body("The project aims to demonstrate, in one integrated and visual simulation, the core ideas of a networking course: routing, reliability, fault tolerance and security. This case study reports the design, implementation and evaluation of such a simulator, built so that every mechanism can be switched on, stressed and observed live."));
add(h2("B", "Problem Statement"));
add(body("Given a four-level enterprise hierarchy with unreliable links, fallible routers and a hostile path, how can a packet from any customer still reach the headquarters correctly, and how can this behaviour be made visible and measurable? The case study answers by building a packet-level simulator in which a single packet passes through route computation, authenticated encryption, lossy hop-by-hop transmission, acknowledgement with retransmission, failure detection with rerouting, and integrity verification at the destination."));
add(h2("C", "Objectives"));
add(body("The objectives are:", { noIndent: true, keepNext: true }));
add(bullets([
  "Model a four-level hierarchy (customer, branch, regional office, headquarters) as a graph.",
  "Compute and display shortest paths using Dijkstra’s algorithm.",
  "Simulate packet loss and recover through acknowledgements and retransmission.",
  "Inject router or link failures and reroute traffic automatically.",
  "Encrypt packets and verify their integrity at the destination.",
  "Visualise all activity on a live dashboard suitable for demonstration.",
]));
add(h2("D", "Scope and Contributions"));
add(body("The study is limited to one traffic direction (customer to HQ, with the acknowledgement returning on the reverse path), a single enterprise topology, and software simulation rather than emulation of real devices. Within that scope the work contributes:"));
add(bullets([
  `a working simulator of the hierarchy with ${E.nodes} nodes and ${E.edges} weighted links, implementing every stage of the workflow in Section III;`,
  "a failure detector based on missed hello messages, and a rerouting path that re-runs Dijkstra on the updated graph and retransmits affected packets at once;",
  "an authenticated-encryption layer in which the packet header is bound to the ciphertext, so forged or modified packets fail verification at HQ;",
  "a real-time web dashboard with live controls for loss, failures and tampering, with all events persisted in SQLite;",
  "a reproducible experimental evaluation, with seeded runs, covering loss, failure, tampering and cryptographic cost (Section VIII), checked against closed-form models.",
]));
add(h2("E", "Organisation of the Paper"));
add(body("Fig. 1 gives an overview of the layered design. Section II describes the case scenario and related work. Sections III to V present the workflow, architecture and technology stack. Section VI gives the detailed design and implementation. Sections VII and VIII describe the experiments and discuss the results. Sections IX to XII cover the live demonstration, limitations, lessons learned and conclusions."));
add(figure(FIG("fig_architecture.png"), "Fig. 1.  Layered architecture of the enterprise network simulator.", 3.15));

// ---- II. Case description and related work ----
add(h1("II", "Case Description and Related Work"));
add(h2("A", "Case Scenario"));
add(body(`The case considers a generic multi-site enterprise. Customers are served by branches, branches report to one of two regional offices, and both regional offices connect to a single headquarters. In the simulated network there are 8 customers, four branches, two regional routers and one headquarters. The scenario is hypothetical and is not modelled on any real organisation. Customers are dual-homed to a primary and a sibling branch, branches have a primary uplink and in some cases a backup uplink to the other region, and the two regional routers are linked to each other. This redundancy is a design decision of this study (the original specification fixes only the four levels), and it is what gives the routing engine an alternative path to select when a component fails.`));
add(body("The questions the case study sets out to answer are: (i) does the routing engine select the lowest-cost route and does it change when the topology changes; (ii) how much does packet loss degrade delivery and latency, and does the retransmission scheme absorb it; (iii) how quickly is a failure detected, and how many packets are disturbed before traffic recovers; and (iv) is every tampered packet rejected, at what cost to delivery."));
add(h2("B", "Related Work"));
add(body("<b>Routing.</b> Recent work explores learned and telemetry-aware routing on top of classical baselines. Boltres <i>et al.</i> study near-real-time telemetry-aware routing with neural algorithms [1] and latent embeddings for telemetry-aware greedy routing [2]; Kim <i>et al.</i> apply deep reinforcement learning to multi-flow routing in heterogeneous wireless networks [3]. Dijkstra’s algorithm is retained here as the transparent baseline against which such methods are normally judged."));
add(body("<b>Reliability and adaptation.</b> You <i>et al.</i> report simulation-to-reality deep reinforcement learning for link adaptation in cellular networks [4], and Sidhu <i>et al.</i> tune forward error correction parameters for video streaming [5]. Both address unreliable channels. This study uses the older and simpler mechanism of acknowledgement, timeout and bounded retransmission, which is the baseline such adaptive methods improve on."));
add(body("<b>Failure recovery.</b> Fast rerouting has been analysed in terms of resilience guarantees by Dai <i>et al.</i> [6] and Bentert <i>et al.</i> [7]. Reinforcement learning has been used for forwarding around clustered faults in Gaussian interconnected networks [8] and for link failure recovery in hybrid software-defined networks [9]. The failure handling in this work is deliberately reactive and centralised: a detector marks an element down and the routing graph is recomputed."));
add(body("<b>Security.</b> Authenticated encryption with associated data has been applied to smart-grid monitoring together with ECDH key exchange [10], and lightweight ciphers and authentication for constrained IoT devices are surveyed in [11] and [12]. Attacks that operate below the application, such as physical-layer data siphoning [13], motivate checking integrity at the destination regardless of the path taken. The Security Module follows the AEAD approach of [10], [11] without simulating key exchange."));
add(body("<b>Simulation methodology.</b> Learned routing policies have been trained and evaluated in packet-level simulators for lunar delay-tolerant networks [14] and queueing networks [15]. A custom packet-level simulator, rather than a heavy emulator, is consistent with these simulation-driven studies and keeps the demonstration light enough to run on a laptop."));

// ---- III. Workflow (original text preserved) ----
add(h1("III", "Workflow"));
add(body("A single packet passes through the following stages from the sender to the headquarters (Fig. 2):", { keepNext: true }));
add(numbered([
  "<b>Topology creation.</b> The hierarchical network is built as a weighted graph in which nodes are customers, branch routers, regional routers and the headquarters, and edge weights represent link cost (delay).",
  "<b>Route computation.</b> For each packet, the routing engine runs Dijkstra’s algorithm to find the lowest-cost path from source to destination. Dijkstra serves as the transparent baseline, while recent work explores learned and telemetry-aware routing on top of such baselines [1]–[3].",
  "<b>Encryption and tagging.</b> The sender encrypts the payload and attaches an authentication tag so that any modification in transit can be detected [10]–[13].",
  "<b>Hop-by-hop transmission.</b> The packet moves along the chosen path. At every link the simulator may drop it according to the configured loss probability.",
  "<b>Acknowledgement and retransmission.</b> The receiver returns an ACK. If none arrives before the timeout, the sender retransmits the packet, up to a retry limit [4], [5].",
  "<b>Failure detection and rerouting.</b> If a router or link is marked as failed (from the dashboard), the failure is detected, the graph is updated, and Dijkstra is re-run to select a new path so that delivery continues [6]–[9].",
  "<b>Verification at the destination.</b> The headquarters verifies the tag before decrypting. Packets that fail verification are discarded and logged as tampered [11].",
  "<b>Logging and visualisation.</b> Each event (send, drop, retransmit, reroute, delivery) is stored in SQLite and streamed to the dashboard, which animates packets and updates metrics in real time.",
]));
add(figure(FIG("fig_workflow.png"), "Fig. 2.  The eight workflow stages. After a timeout, or when a failure is detected on the packet’s path, the sender returns to stage 2: Dijkstra is re-run on the current graph and the packet is retransmitted.", 3.3));

// ---- IV. Architecture (original text preserved) ----
add(h1("IV", "System Architecture"));
add(body("The system follows a layered design, shown in Fig. 1. The browser dashboard communicates with a FastAPI backend through REST calls (start, fail a node, set loss percentage) and a WebSocket that pushes live events. Behind the API, four modules implement the functional logic: the Topology Manager (graph), the Routing Engine (Dijkstra and rerouting), the Reliability Module (loss, ACK, timeout, retransmission, failure detection) and the Security Module (encryption, tagging, verification). They run on a SimPy discrete-event simulation core that schedules packets, links and timers, and all events are persisted in SQLite. Using a custom packet-level simulator, rather than a heavy emulator, is consistent with recent simulation-driven networking studies [14], [15]."));
add(body("The engine itself performs no input or output. It advances simulated time and appends every occurrence to an event list; the API layer drains that list every 20 ms of wall-clock time, writes it to SQLite and broadcasts it to all connected dashboards. This separation allows the same engine to run headless and seeded for the experiments in Section VIII, and under the web server for the live demonstration."));
add(body("Simulated time is measured in milliseconds, with link cost equal to one-way delay. A configurable <i>slowdown</i> factor stretches each simulated millisecond to a number of wall-clock milliseconds (40 by default) so that packet animations are slow enough to follow. Reported latencies are always in simulated milliseconds."));

// ---- V. Technology stack (original table preserved) ----
add(h1("V", "Technology Stack"));
add(body("All components are free and open source, so the project can be built and demonstrated at no cost."));
add(tableCaption("I", "Technology stack"));
add(table([900, 1500, 2640], ["Layer", "Tool", "Purpose"], [
  ["Language", "Python 3", "Core simulation, routing and security logic"],
  ["Graph modelling", "NetworkX", "Network topology and Dijkstra shortest-path routing"],
  ["Simulation engine", "SimPy", "Discrete-event simulation of packets, links, timers and failures"],
  ["Backend / API", "FastAPI + Uvicorn", "REST control endpoints and WebSocket live event stream"],
  ["Security", "Python cryptography (ChaCha20-Poly1305 / AES-GCM), hashlib", "Packet encryption and integrity verification"],
  ["Frontend", "HTML, JavaScript, Cytoscape.js", "Interactive network map and packet animation"],
  ["Charts", "Chart.js", "Live metrics: latency, packet loss, retransmissions"],
  ["Storage", "SQLite", "Packet logs, failure events and metrics"],
  ["Tools", "VS Code, Git / GitHub", "Development and version control"],
], { align: [0, 0, 0].map(() => AlignmentType.LEFT) }));
add(spacer(60));

// ---- VI. Detailed design ----
add(h1("VI", "Detailed Design and Implementation"));
add(h2("A", "Topology Manager"));
add(body(`The Topology Manager builds an undirected NetworkX graph of ${E.nodes} nodes and ${E.edges} links (Fig. 3, Table II). Each node has a level (0 headquarters, 1 regional, 2 branch, 3 customer) and each link has an integer cost in milliseconds that is the same in both directions. Besides the full graph, the manager keeps two sets, the routers and links that the routing layer currently believes are down. The <i>active graph</i> used for routing is a view of the full graph with those elements filtered out, so the physical topology is never modified.`));
add(figure(FIG("fig_topology.png"), "Fig. 3.  Simulated topology. L0 is the headquarters, L1 the regional routers, L2 the branch routers and L3 the customers. Numbers on links are one-way delays in milliseconds.", 3.3));
add(tableCaption("II", "Link classes in the simulated topology"));
add(table([1500, 520, 700, 2320], ["Link class", "Links", "Cost (ms)", "Role"], [
  ["HQ – regional (HQ-R1, HQ-R2)", "2", "2", "Core uplinks to headquarters"],
  ["Regional – regional (R1-R2)", "1", "4", "Inter-region path and failover"],
  ["Regional – branch, primary", "4", "4, 5", "Normal branch uplink"],
  ["Branch – other region (B2-R2, B3-R1)", "2", "9", "Backup uplink across regions"],
  ["Branch – branch (B1-B2, B3-B4)", "2", "3", "Lateral link inside a region"],
  ["Customer – primary branch", "8", "2, 3", "Normal access link"],
  ["Customer – sibling branch", "8", "6, 7", "Backup access link"],
], { align: [0, 1, 1, 0].map((x) => (x === 0 ? AlignmentType.LEFT : AlignmentType.CENTER)) }));
add(spacer(60));
add(h2("B", "Routing Engine"));
add(body("For each transmission attempt the Routing Engine runs Dijkstra’s algorithm [16] from the source to HQ on the active graph, using NetworkX [17]. With <i>w</i>(<i>u</i>,<i>v</i>) the cost of link (<i>u</i>,<i>v</i>), the cost of a path <i>P</i> and the chosen route are"));
add(equation("<i>C</i>(<i>P</i>) = Σ<sub>(<i>u</i>,<i>v</i>)∈<i>P</i></sub> <i>w</i>(<i>u</i>,<i>v</i>),   <i>P</i>* = arg min<sub><i>P</i></sub> <i>C</i>(<i>P</i>)", 1));
add(body("The heap-based implementation runs in O((|<i>V</i>| + |<i>E</i>|) log |<i>V</i>|), which is negligible for this graph. If no path exists, the engine reports that the destination is unreachable, which happens, for example, when HQ itself has failed. Table III lists the routes, giving the nodes after the customer and the total cost in milliseconds in brackets, for normal operation and after three failures. Every customer is three hops from HQ, and the mean route cost is 9.0 ms.", { }));
const rn = R.routes;
const custs = ["C1", "C2", "C3", "C4", "C5", "C6", "C7", "C8"];
add(tableCaption("III", "Dijkstra routes from each customer to HQ"));
add(table([520, 1130, 1130, 1130, 1130], ["Cust.", "Normal", "HQ-R1 down", "R1 down", "R2 down"],
  custs.map((c) => [c, fmtPath(rn["normal"][c]), fmtPath(rn["link HQ-R1"][c]), fmtPath(rn["node R1"][c]), fmtPath(rn["node R2"][c])]),
  { size: 14 }));
add(spacer(60));

add(h2("C", "Reliability Module"));
add(body("The module implements three mechanisms: a loss model, an acknowledgement timer and a failure detector."));
add(body("<b>Loss model.</b> Every transmission over a link, data or acknowledgement, is dropped independently with the configured probability <i>p</i>. A global value applies to all links and a per-link value can override it. A packet that crosses a failed router or link is dropped with certainty."));
add(body("<b>Acknowledgement and retransmission.</b> After sending, the sender waits for an ACK, which travels back along the reverse of the data path. This is positive acknowledgement with retransmission, as described in [18] and [19]. The timeout is the round-trip cost of the chosen path plus a fixed margin &#948;:".replace("&#948;", "δ")));
add(equation("<i>T</i><sub>ack</sub> = 2<i>C</i>(<i>P</i>) + δ,   δ = 8 ms", 2));
add(body("If the timer expires, the sender retransmits, recomputing the route first, until the retry limit of 5 retransmissions (6 attempts in total) is reached. A packet that exhausts its attempts is logged as abandoned. If an ACK is lost, the retransmitted copy reaches HQ as a duplicate: HQ counts it once, records the duplicate, and acknowledges again, so the sender is not left waiting forever."));
add(listing("Algorithm 1. Sender procedure for one packet", [
  "seal payload (Section VI-E)",
  "for attempt = 1 .. 6:",
  "    route = Dijkstra(active graph, src, HQ)",
  "    if route is None: wait 30 ms; continue",
  "    if attempt > 1: log retransmit; log reroute if path changed",
  "    start data transit along route",
  "    wait until ACK, or T_ack, or topology change",
  "    if ACK received: done",
  "    if topology changed and route is broken: retransmit now",
  "log 'abandoned'",
]));
add(h2("D", "Failure Detection and Rerouting"));
add(body("A failure injected from the dashboard is physical: the router or link stops forwarding at once. The routing layer does not learn of it instantly. A detector probes every router and link with a hello each <i>H</i> = 25 ms and declares an element down after <i>D</i> = 2 consecutive missed hellos. The delay between a failure and its detection therefore lies between <i>H</i> and <i>D</i>·<i>H</i>:"));
add(equation("<i>H</i> < <i>T</i><sub>detect</sub> ≤ <i>D</i>·<i>H</i>   (25 ms < <i>T</i><sub>detect</sub> ≤ 50 ms)", 3));
add(body("On detection, the element is removed from the active graph, a “failure detected” event is logged, and every sender waiting for an ACK whose current path contains the failed element is woken at once. It retransmits immediately on a path found by re-running Dijkstra, instead of waiting for its own timer. Packets sent during the detection window are lost and recovered by ordinary retransmission. Restoring the element is detected on the first hello that is answered, and the element returns to the active graph."));
add(h2("E", "Security Module"));
add(body("Each customer has its own 256-bit key, derived with SHA-256 from a master secret that HQ shares. A packet is protected with ChaCha20-Poly1305 [20] (the default) or AES-GCM [21], both authenticated-encryption schemes whose 16-byte tag is appended to the ciphertext. The 96-bit nonce is the packet’s sequence number, which is unique within a run, and the associated data is the header string “source>destination#sequence”. Modifying either the ciphertext or the header therefore invalidates the tag. A retransmission re-sends the identical ciphertext and nonce, which is safe because the plaintext is also identical."));
add(body("At HQ the tag is verified before any plaintext is released. A packet that fails verification is discarded, is not acknowledged, and is logged as tampered; the sender then retransmits the original, untampered copy. In the experiments, an on-path attacker model flips one bit of the ciphertext at an intermediate router. A SHA-256 digest of the ciphertext is shown on the dashboard as a short fingerprint. Key exchange (for example with ECDH, as in [10]) is not simulated."));
add(h2("F", "SimPy Core, Event Log and Storage"));
add(body("The simulation core is built on SimPy [22]. Each packet is a SimPy process; each data or ACK transmission is a child process, so many packets are in flight at once. Table IV lists the parameters. Every occurrence is emitted as an event record and Table V lists the event types. Records are written to three SQLite tables: <tt>events</tt> (the full log), <tt>packets</tt> (one summary row per finished packet) and <tt>metrics</tt> (a snapshot every 2 s of wall-clock time)."));
add(tableCaption("IV", "Default simulation parameters"));
const cfg = E.config;
add(table([2300, 1100, 1640], ["Parameter", "Value", "Unit"], [
  ["Retransmissions allowed", String(cfg.max_retries), "after first send"],
  ["ACK timeout margin δ", String(cfg.ack_margin), "sim ms"],
  ["Hello interval <i>H</i>", String(cfg.hello_interval), "sim ms"],
  ["Missed hellos to declare down <i>D</i>", String(cfg.dead_misses), "hellos"],
  ["Wait when no route exists", String(cfg.retry_wait), "sim ms"],
  ["Slowdown (Slow / Normal / Fast)", "80 / 40 / 20", "wall ms per sim ms"],
  ["Tag length, nonce length", "16, 12", "bytes"],
  ["Default packet loss", String(cfg.loss_percent), "% per hop"],
], { align: [AlignmentType.LEFT, AlignmentType.CENTER, AlignmentType.CENTER] }));
add(spacer(40));
add(tableCaption("V", "Event types recorded and streamed"));
add(table([1650, 3390], ["Event", "Meaning"], [
  ["packet_created, route", "Packet sealed at the source; route chosen with its cost"],
  ["hop", "One data or ACK transmission (outcome: ok, lost or blocked)"],
  ["drop, timeout", "Loss on a link, drop at a failed element; no ACK in time"],
  ["retransmit, reroute", "Packet resent (with reason); path changed since last attempt"],
  ["no_route, gave_up", "Destination unreachable; attempts exhausted"],
  ["delivered, duplicate", "Tag verified and accepted at HQ; second copy detected"],
  ["ack_received", "ACK reached the sender"],
  ["tamper_armed, tamper_injected, tamper_detected", "Attacker armed; ciphertext modified at a router; HQ rejected the packet"],
  ["failure_injected, failure_detected", "Fault injected from the dashboard; detector removed it from the graph"],
  ["restore_injected, recovery_detected", "Element restored; detector returned it to the graph"],
  ["loss_changed", "Loss probability changed from the dashboard"],
], { align: [AlignmentType.LEFT, AlignmentType.LEFT] }));
add(spacer(60));
add(h2("G", "Backend API and Dashboard"));
add(body("The FastAPI backend exposes REST endpoints for control and queries, and a WebSocket that pushes events and metrics. Table VI lists them. The dashboard (Fig. 4) draws the topology with Cytoscape.js and animates each hop as a dot travelling along its link: blue for data, green for ACKs, red for packets lost or blocked, and orange for packets that an attacker has modified. A purple overlay shows the current Dijkstra route for a chosen customer, and links that have failed are drawn dashed in red. Live metrics are shown as tiles and as three Chart.js charts (delivery latency, observed link loss over the last half second, and retransmissions with reroutes), above a scrolling, filterable event log. All front-end libraries are served locally, so the demonstration works without an internet connection."));
add(tableCaption("VI", "REST and WebSocket interface"));
add(table([1750, 3290], ["Endpoint", "Function"], [
  ["GET /api/topology, /api/state", "Nodes, links, current faults, loss, metrics"],
  ["GET /api/route?source=", "Dijkstra route and cost from a customer"],
  ["POST /api/send", "Send one packet from a customer"],
  ["POST /api/traffic", "Start or stop automatic traffic (packets per second)"],
  ["POST /api/fail, /api/restore", "Fail or restore a router or link"],
  ["POST /api/loss", "Set loss probability (all links or one link)"],
  ["POST /api/tamper", "Arm the attacker for the next packet, or set its rate"],
  ["POST /api/speed, /api/reset", "Change slowdown; clear state and database"],
  ["GET /api/events, /api/packets", "Query the stored log and packet summaries"],
  ["WebSocket /ws", "Live events and metrics pushed to the dashboard"],
], { align: [AlignmentType.LEFT, AlignmentType.LEFT], size: 15 }));
add(spacer(60));

// --- full-width dashboard figure (single-column section) is inserted by the section builder below ---
const afterVIG = [];
const addA = (...items) => items.flat().forEach((x) => afterVIG.push(x));

addA(h2("H", "Verification by Automated Testing"));
addA(body("The implementation is covered by 17 automated tests that map to the workflow stages: 16 exercise the simulation core and one drives the REST and WebSocket interface end to end. Table VII summarises what each group checks. All tests use seeded random numbers, so a failure is reproducible."));
addA(tableCaption("VII", "Automated tests by workflow stage"));
addA(table([1200, 3840], ["Stage", "What is checked"], [
  ["1 Topology", "Four levels with 1, 2, 4 and 8 nodes; graph is connected"],
  ["2 Routing", "Route and cost equal NetworkX Dijkstra for all customers; C1 uses B1, R1, HQ"],
  ["3 Encryption", "Round trip for both ciphers; bit flip rejected; forged header rejected"],
  ["4, 5 Reliability", "Clean delivery with ACK; recovery under loss; retry limit respected; lost ACK gives a duplicate, not a second delivery"],
  ["6 Failover", "Link and router failures detected and rerouted; detection needs missed hellos; recovery restores the route; HQ failure gives no route"],
  ["7 Verification", "Tampered packet rejected, then delivered by retransmission"],
  ["8 Logging", "Required event kinds appear; SQLite round trip; REST and WebSocket flow"],
], { align: [AlignmentType.LEFT, AlignmentType.LEFT] }));
addA(spacer(60));

// ---- VII. Experimental methodology ----
addA(h1("VII", "Experimental Methodology"));
addA(body(`All experiments run the simulator headless with seeded random number generators, using seeds ${R.seeds.join(", ")} (five independent runs per setting in E1 and E3; the failure runs of E2 use the single seed 7), and are reproducible with <tt>experiments/run_experiments.py</tt>. They ran on ${E.os}, Python ${E.python}, NetworkX ${E.networkx}, SimPy ${E.simpy} and cryptography ${E.cryptography}. Four experiments were run.`));
addA(bullets([
  "<b>E1, loss sweep.</b> For per-hop loss of 0, 5, 10, 15, 20 and 30 %, 400 packets are sent in rotation from the eight customers, 10 ms apart, and the simulation runs until all packets are resolved.",
  "<b>E2, failures.</b> 120 packets are sent 5 ms apart; at <i>t</i> = 200 ms one element fails (link HQ-R1, router R1, router R2, link R1-B1, or HQ). A second experiment injects a router failure at 25 different offsets within the hello cycle to measure the detection delay.",
  "<b>E3, tampering.</b> 300 packets are sent while an attacker modifies the ciphertext at an intermediate router with probability 0, 10, 30 or 60 % per router traversal.",
  "<b>E4, cryptographic cost.</b> 20,000 packets of 96 bytes are sealed and then opened with each cipher, timed with a wall clock.",
]));
addA(body("Two further runs check combined behaviour: 500 packets with 10 % loss and 20 % tampering, to confirm that every delivered packet decrypts to its original payload, and a combined stress run (10 % loss, 10 % tampering, then failure of link R1-B1 and of router R2). The metrics are:"));
addA(bullets([
  "<i>delivery ratio</i>: packets accepted at HQ divided by packets sent;",
  "<i>delivery latency</i>: time from creation to acceptance at HQ, including every retransmission delay (95th percentile by nearest rank);",
  "<i>retransmissions per packet</i> and <i>abandoned packets</i> (all attempts exhausted);",
  "<i>duplicates</i>: copies of an already delivered packet that reach HQ.",
]));

// ---- VIII. Results ----
addA(h1("VIII", "Results and Discussion"));
addA(h2("A", "Packet Loss and Retransmission"));
const l0 = L(0), l10 = L(10), l20 = L(20), l30 = L(30), l5 = L(5);
addA(body(`Table VIII and Figs. 5–7 show the loss sweep. With no loss every packet is delivered on its first attempt, and the mean latency of ${f(l0.latency.mean)} ms equals the mean route cost of the eight customers (Section VI-B), as it should. As loss rises, delivery degrades slowly at first and then faster: the delivery ratio is ${f(l10.delivery.mean)} % at 10 % loss, ${f(l20.delivery.mean)} % at 20 % and ${f(l30.delivery.mean)} % at 30 %, while the mean number of retransmissions per packet grows from ${f(l5.retx_per_pkt.mean, 2)} at 5 % to ${f(l30.retx_per_pkt.mean, 2)} at 30 %. Latency grows faster than delivery falls: the mean rises from ${f(l0.latency.mean)} ms to ${f(l30.latency.mean)} ms and the 95th percentile to ${f(l30.p95.mean)} ms at 30 % loss, because each retransmission adds a full timeout of roughly 2<i>C</i>(<i>P</i>) + δ = 24 to 28 ms.`));
addA(body("The results can be checked against a closed-form model. Let <i>h</i> be the number of hops (3 for every customer on its normal path) and <i>N</i> = 5 the retransmission limit. A data packet reaches HQ in one attempt with probability (1 − <i>p</i>)<sup><i>h</i></sup>, and HQ accepts it if at least one of the <i>N</i> + 1 attempts succeeds:"));
addA(equation("<i>P</i><sub>deliver</sub> = 1 − [1 − (1 − <i>p</i>)<sup><i>h</i></sup>]<sup><i>N</i>+1</sup>", 4));
addA(body(`The “Model” column of Table VIII evaluates (4) and agrees with the simulated delivery ratio to within ${f(maxDiff, 1)} percentage points at every loss level. The simulator is therefore reproducing the behaviour its mechanisms imply, rather than something accidental.`));
addA(tableCaption("VIII", "Loss sweep: mean ± s.d. over five seeds (400 packets each)"));
addA(table([560, 900, 640, 620, 700, 700, 920], ["Loss (%)", "Delivery (%)", "Model (%)", "Retx /pkt", "Mean lat. (ms)", "P95 (ms)", "Abandoned"],
  loss.map((r) => [String(r.loss), pm(r.delivery), f(modelDelivery(r.loss)), f(r.retx_per_pkt.mean, 2), f(r.latency.mean), f(r.p95.mean), f(r.gave_up.mean, 1)]), { size: 15 }));
addA(spacer(50));
addA(figure(FIG("fig_loss_delivery.png"), "Fig. 5.  Delivery ratio against per-hop loss probability (mean and standard deviation of five seeds).", 3.3));
addA(figure(FIG("fig_loss_latency.png"), "Fig. 6.  Mean and 95th-percentile delivery latency against per-hop loss probability.", 3.3));
addA(figure(FIG("fig_retx.png"), "Fig. 7.  Mean retransmissions per packet against per-hop loss probability.", 3.3));
addA(body(`Acknowledgement loss has a visible side effect. Data and ACKs are both subject to loss, so a delivered packet whose ACK is lost is retransmitted and arrives again. These duplicates averaged ${f(l10.dups.mean, 0)} per 400 packets at 10 % loss and ${f(l30.dups.mean, 0)} at 30 %. HQ recognised every one of them, counted the packet once, and re-acknowledged it. Unnecessary retransmissions of this kind are the price of a simple, stateless sender.`));

addA(h2("B", "Failure Detection and Rerouting"));
const lk = FA("link HQ-R1"), r1 = FA("node R1"), r2 = FA("node R2"), lb = FA("link R1-B1"), hq = FA("node HQ");
addA(body(`Table IX summarises the failure runs and Fig. 8 shows the per-packet latency around the loss of link HQ-R1 at <i>t</i> = ${f(lk.inject_at, 0)} ms. Before the failure every packet is delivered on its first attempt with latency of 8 to 10 ms. After the failure, the ${lk.affected_packets} packets that were in flight towards the dead link are lost and are recovered by retransmission, at latencies of ${f(lk.affected_latency_range[0], 0)} to ${f(lk.affected_latency_range[1], 0)} ms. The failure is detected ${f(lk.detection_delay, 0)} ms after injection, the four customers whose route used HQ-R1 (C1 to C4) are rerouted through R2, and from then on all packets are delivered on their first attempt again, with a higher steady latency (route cost 12 ms for C1, against 8 ms before, Table III). No packet was lost permanently: all ${lk.delivered} of ${lk.sent} were delivered.`));
addA(figure(FIG("fig_failover.png"), "Fig. 8.  Delivery latency of each packet against its creation time, for the failure of link HQ-R1 at t = 200 ms. Crosses mark packets that needed retransmission.", 3.3));
addA(body(`The loss of router R1 (${r1.affected_packets} packets affected, ${r1.delivered} of ${r1.sent} delivered) and of router R2 (${r2.affected_packets} affected, ${r2.delivered} of ${r2.sent}) behave similarly. R1’s customers C1 and C2 move to the longer path B1, B2, R2, HQ (cost 16 ms for C1), because B1 has no direct uplink to R2; the mean latency after the failure rises from ${f(r1.mean_latency_before)} ms to ${f(r1.mean_latency_after)} ms. The loss of the single link R1-B1 only affects ${lb.affected_packets} packets and moves C1 and C2 onto the lateral link through B2. When HQ itself fails there is no alternative: ${hq.delivered} of the ${hq.sent} packets (those delivered before the failure) arrive, the remaining ${hq.gave_up} are abandoned after their retry attempts, and the routing engine reports every customer as unreachable. This is the correct outcome, and it shows that rerouting stops where redundancy stops.`));
addA(tableCaption("IX", "Failure experiments with 120 packets and one failure"));
addA(body("In Table IX the failure is injected at <i>t</i> = 200 ms; latencies are mean delivery latencies in simulated milliseconds for packets created before the failure, after it, and for the packets that needed a retransmission.", { noIndent: true, keepNext: true }));
addA(table([1160, 640, 640, 760, 620, 620, 600], ["Failed element", "Detect (ms)", "Retx pkts", "Delivered / sent", "Lat. before", "Lat. after", "Lat. affected"],
  fails.map((x) => [x.element, f(x.detection_delay, 0), String(x.affected_packets), `${x.delivered}/${x.sent}`,
    f(x.mean_latency_before), x.mean_latency_after === null ? "–" : f(x.mean_latency_after), x.mean_latency_affected === null ? "–" : f(x.mean_latency_affected)]),
  { size: 14 }));
addA(spacer(30));
addA(body(`Detection time follows the model in (3). Injecting a router failure at 25 different phases of the hello cycle gave detection delays from ${f(det.min, 0)} to ${f(det.max, 0)} ms with a mean of ${f(det.mean, 1)} ms, which lies within the predicted range of 25 to 50 ms. A shorter hello interval or a smaller <i>D</i> would shorten the window in which packets are lost, at the cost of more probe traffic and a higher risk of declaring a healthy element down under heavy loss.`));

addA(h2("C", "Tamper Detection"));
const t10 = T(10), t30 = T(30), t60 = T(60);
addA(body(`Table X and Fig. 9 show the tampering runs. In every run each modified packet that reached HQ was rejected: the number of tampered transits equals the number rejected, and none passed verification, for example ${f(t30.injected.mean, 0)} injected and ${f(t30.rejected.mean, 0)} rejected on average at 30 %. Rejected packets cost delivery only through retransmission. Since a tampered packet is never acknowledged, the sender times out and sends a clean copy. The attacker acts at each of the <i>h</i> − 1 intermediate routers with probability <i>q</i>, and the first strike corrupts the whole transit, so the delivery model becomes`));
addA(equation("<i>P</i><sub>deliver</sub> = 1 − [1 − (1 − <i>q</i>)<sup><i>h</i>−1</sup>]<sup><i>N</i>+1</sup>", 5));
addA(body(`With <i>q</i> = 60 % the model gives ${f(modelTamper(60))} %, and the simulation ${f(t60.delivery.mean)} %. The loss of delivery here comes from the retry limit, not from the cryptography: an attacker who corrupts almost every transit can deny service but cannot make HQ accept altered data.`));
addA(tableCaption("X", "Tampering experiment (300 packets, five seeds)"));
addA(table([560, 760, 760, 720, 800, 700, 740], ["q (%)", "Tampered transits", "Rejected at HQ", "Not rejected", "Delivery (%)", "Model (%)", "Retx /pkt"],
  tamp.map((r) => [String(r.tamper_percent), f(r.injected.mean, 1), f(r.rejected.mean, 1), f(r.not_rejected.mean, 0), pm(r.delivery), f(modelTamper(r.tamper_percent)), f(r.retx_per_pkt.mean, 2)]),
  { size: 14 }));
addA(spacer(30));
addA(figure(FIG("fig_tamper.png"), "Fig. 9.  Delivery ratio against the attacker’s strike probability per intermediate router.", 3.3));
addA(body(`A separate run of ${R.payload_check.packets} packets with 10 % loss and 20 % tampering delivered ${R.payload_check.delivered} and rejected ${R.payload_check.tampered_rejected} tampered transits. The engine compares every accepted plaintext with the original payload and raises an error on any difference. No error occurred.`));

addA(h2("D", "Cost of Authenticated Encryption"));
const cc = cry["chacha20-poly1305"], ca = cry["aes-gcm"];
addA(body(`Table XI gives the measured cost of sealing and opening a 96-byte payload. Both ciphers add the same 16 bytes of overhead (the tag) and take about ${f((cc.seal_us + ca.seal_us) / 2, 0)} µs to seal and about ${f((cc.open_us + ca.open_us) / 2, 0)} µs to open on the test machine. These figures include Python call overhead and one key derivation per packet, so they overstate the cost of the primitives. Even so, they are more than two orders of magnitude below the millisecond-scale link delays of the simulation, so encryption does not materially affect latency. The two ciphers are indistinguishable at this scale.`));
addA(tableCaption("XI", "Measured cost of sealing and opening a 96-byte payload"));
addA(table([1900, 1050, 1050, 1040], ["Cipher", "Seal (µs)", "Open (µs)", "Overhead (B)"], [
  ["ChaCha20-Poly1305", f(cc.seal_us, 2), f(cc.open_us, 2), String(cc.overhead_bytes)],
  ["AES-GCM", f(ca.seal_us, 2), f(ca.open_us, 2), String(ca.overhead_bytes)],
]));
addA(spacer(60));

addA(h2("E", "Combined Stress Run"));
addA(body(`In the combined run, 300 packets were sent with 10 % loss and 10 % tampering while link R1-B1 failed after the first 100 packets and router R2 after the next 100. ${comb.delivered} of ${comb.sent} packets (${f(comb.delivery_ratio, 1)} %) were delivered; ${comb.gave_up} were abandoned. There were ${comb.retransmissions} retransmissions, ${comb.reroutes} reroutes and ${comb.tampered_rejected} rejected tampered transits, and the mean delivery latency was ${f(comb.avg_latency, 1)} ms. The mechanisms therefore compose: loss, failure and attack can occur together without breaking delivery, at the price of higher latency.`));

addA(h2("F", "Discussion"));
addA(body("Three findings stand out. First, the simple stop-and-wait scheme with bounded retransmission is remarkably effective for moderate loss: up to 15 % loss per hop costs less than one percent of delivery, and the loss is paid for in latency, not in lost data. Second, redundancy decides recovery. Every failure that left an alternative path was recovered without permanent loss, and the failure of HQ, which has none, was not. Third, detection time dominates the disturbance: the number of packets affected by a failure is roughly the number sent during the detection window, so faster detection is the most direct way to reduce it. Security checks cost almost nothing in latency and gave the strongest guarantee in the study, since no tampered packet was ever accepted."));

// ---- IX. Demonstration ----
addA(h1("IX", "Live Demonstration Scenarios"));
addA(body("The dashboard is used for a live demonstration in the following sequence, which exercises every objective in turn:", { keepNext: true }));
addA(numbered([
  "<b>Routing.</b> Select C1 in the route inspector. The purple path C1, B1, R1, HQ (cost 8 ms) is shown. Send a packet and watch it and its ACK travel.",
  "<b>Reliability.</b> Turn on automatic traffic and raise the loss slider to about 15 %. Red dots mark drops, and the retransmission counter and chart rise while the delivery ratio stays high.",
  "<b>Failover.</b> Click link HQ-R1 and press Fail. Packets die at the dead link until the log shows “failure detected”, then “rerouted”. The route inspector now shows C1, B1, R1, R2, HQ (cost 12 ms). Restore the link and try router R1.",
  "<b>Security.</b> With loss at 0, press “Tamper with next packet”. The log shows the modification, the rejection at HQ and the clean retransmission.",
  "<b>Records.</b> Show the stored events and packets through the query endpoints, then reset the run.",
], "num2"));

// ---- X. Limitations ----
addA(h1("X", "Limitations and Threats to Validity"));
addA(bullets([
  "<b>Abstract timing.</b> Links have a fixed delay. There are no queues, bandwidth limits or congestion, so latency reflects distance and retransmission only. Latencies are in simulated milliseconds, not measurements on a real network.",
  "<b>Independent loss.</b> Losses are independent and identically distributed per hop. Real links lose packets in bursts, which would increase retransmission delays.",
  "<b>Abstract detector.</b> The hello mechanism is modelled as a probe of each element with fixed timing, not as real control-plane messages. Detection in a real network also depends on protocol timers and convergence.",
  "<b>Security scope.</b> The shared master key stands in for key distribution, and replay is limited to duplicate suppression by sequence number. The attacker model only flips a ciphertext bit, and does not model eavesdropping, replay or traffic analysis.",
  "<b>Statistical scope.</b> Loss and tampering results come from five seeds per setting, the failure runs from a single seed, and the topology is a single hypothetical enterprise. Model checks show agreement, but other topologies could behave differently.",
  "<b>Single direction.</b> Only customer-to-HQ traffic is simulated.",
]));

// ---- XI. Lessons ----
addA(h1("XI", "Lessons Learned and Recommendations"));
addA(bullets([
  "<b>Design redundancy first.</b> The alternative path after a failure exists only because customers and branches were dual-homed. Without it, rerouting has nothing to select.",
  "<b>Keep detection and recovery separate.</b> Treating a failure as physical and detection as a later step makes the loss window visible and measurable, and explains why fast failover is a research topic [6]–[9].",
  "<b>Wake waiting senders on topology change.</b> Retransmitting at the moment of detection, rather than at timer expiry, saved up to one full timeout per affected packet.",
  "<b>Bind the header into the tag.</b> Treating source, destination and sequence number as associated data closes header forgery at no extra cost [10], [11].",
  "<b>Check simulations against models.</b> Equations (4) and (5) caught nothing wrong here, but they are what gives confidence that the numbers are not artefacts of the code.",
  "<b>Seed everything.</b> Seeded random numbers made every experiment and test reproducible, which turned unexplained failures into debuggable ones.",
]));
addA(body("For a deployment of this design, the recommendations are to tune the hello interval against the tolerable loss window, to give every branch at least two uplinks into different regional routers, and to keep the retry limit high enough that the retransmission model (4) meets the required delivery ratio at the expected loss rate."));

// ---- XII. Conclusion ----
addA(h1("XII", "Conclusion and Future Work"));
addA(body("This case study has built and evaluated a simulation of a four-level enterprise network that combines Dijkstra routing, loss recovery with acknowledgements and retransmission, failure detection with automatic rerouting, and authenticated encryption with verification at the destination, all shown on a live dashboard. The experiments gave the following results. Delivery stayed above 98 % up to 20 % per-hop loss. Failures with a redundant path were detected within the predicted 25 to 50 ms and recovered without permanent loss. Every tampered packet was rejected. Cryptographic cost was negligible against link delays. The measured delivery ratios matched closed-form models, which supports the correctness of the implementation. The whole system uses only free and open-source tools and runs on a laptop, which makes it suitable for classroom demonstration."));
addA(body("Future work includes replacing Dijkstra with a telemetry-aware or learned route selector and comparing it with the baseline [1]–[3], adding a queueing and congestion model [15], modelling bursty loss and adaptive forward error correction [5], adding an authenticated key exchange [10], and extending the traffic to both directions and several destinations. The source code, tests, experiment scripts and these results are available in the project repository [23]."));

// ---- Acknowledgment and appendix ----
addA(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 160, after: 80 }, keepNext: true, children: runs("ACKNOWLEDGMENT", { size: 18 }) }));
addA(body("The authors thank the faculty of the Computer Networks course at Vellore Institute of Technology (VIT) for the case-study assignment and guidance."));
addA(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 160, after: 80 }, keepNext: true, children: runs("APPENDIX A: REPRODUCING THE RESULTS", { size: 18 }) }));
addA(body("The project repository [23] contains the simulator, the tests, the experiment scripts and this report’s generator. Table XII lists the main components and the commands that reproduce the results."));
addA(tableCaption("XII", "Repository layout and commands"));
addA(table([1900, 3140], ["Item", "Purpose"], [
  ["hnsim/topology.py", "Topology Manager: graph, active-graph view"],
  ["hnsim/routing.py", "Routing Engine: Dijkstra on the active graph"],
  ["hnsim/reliability.py", "Loss model, ACK timer, hello-based detector"],
  ["hnsim/security.py", "Key derivation, AEAD seal and open"],
  ["hnsim/engine.py", "SimPy core, packet processes, metrics, events"],
  ["hnsim/storage.py, api.py", "SQLite persistence; REST and WebSocket server"],
  ["hnsim/static/", "Dashboard (HTML, JavaScript, local libraries)"],
  ["tests/", "17 automated tests (Table VII)"],
  ["experiments/", "Experiment and figure scripts; results.json"],
  ["pip install -r requirements.txt", "Install dependencies"],
  ["python run.py", "Start the server and dashboard"],
  ["python -m pytest", "Run the tests"],
  ["python experiments/run_experiments.py", "Re-run experiments E1 to E4"],
], { align: [AlignmentType.LEFT, AlignmentType.LEFT], size: 15 }));
addA(spacer(40));

// ---- References ----
const refParas = REFS.map((t, i) => new Paragraph({
  alignment: AlignmentType.JUSTIFIED, spacing: { after: 30, line: 210 },
  indent: { left: 360, hanging: 360 },
  tabStops: [{ type: "left", position: 360 }],
  children: runs(`[${i + 1}]\t${t}`, { size: 16 }),
}));

afterVIG.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 160, after: 80 }, keepNext: true,
  children: runs("REFERENCES", { size: 18 }) }));
refParas.forEach((p) => afterVIG.push(p));

// ================================ DOCUMENT ======================================================
const page = {
  size: { width: 12240, height: 15840 },
  margin: { top: 1080, bottom: 1300, left: 900, right: 900, header: 500, footer: 500 },
};
const two = { count: 2, space: 360, equalWidth: true };

// full-width dashboard figure
const dashFig = figure(FIG("fig_dashboard.png"),
  "Fig. 4.  The live dashboard during a demonstration: link HQ-R1 has failed (dashed, faded), and the purple overlay shows the rerouted Dijkstra path for C1 through R2. Controls for traffic, route inspection, failures, packet loss, security and speed are on the right; metrics, charts and the event log are below.", 7.0);

const doc = new Document({
  creator: "Sanath M Koushik, Tarun T S, Akshay Faujdar",
  title: "Hierarchical Enterprise Network Simulation for Routing, Reliability and Security",
  description: "Computer Networks case study report (IEEE format)",
  styles: { default: { document: { run: { font: H.FONT, size: 20 } } } },
  numbering: {
    config: [
      { reference: "bul", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 300, hanging: 200 } } } }] },
      { reference: "num", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1)", alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 360, hanging: 300 } } } }] },
      { reference: "num2", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1)", alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 360, hanging: 300 } } } }] },
    ],
  },
  sections: [
    { properties: { page, column: { count: 1 } }, footers: { default: H.pageFooter() }, children: titleBlock },
    { properties: { type: SectionType.CONTINUOUS, page, column: two }, footers: { default: H.pageFooter() }, children: B },
    { properties: { type: SectionType.CONTINUOUS, page, column: { count: 1 } }, footers: { default: H.pageFooter() }, children: dashFig },
    { properties: { type: SectionType.CONTINUOUS, page, column: two }, footers: { default: H.pageFooter() }, children: afterVIG },
  ],
});

const out = process.argv[2] || path.join(__dirname, "CN_Case_Study_Report_IEEE.docx");
Packer.toBuffer(doc).then((buf) => { fs.writeFileSync(out, buf); console.log("wrote", out, buf.length, "bytes"); });
