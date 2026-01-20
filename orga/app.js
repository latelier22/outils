(() => {
  const input = document.getElementById("input");
  const nodesEl = document.getElementById("nodes");
  const linksEl = document.getElementById("links");
  const chartTitleEl = document.getElementById("chartTitle");
  const chartWrapEl = document.getElementById("chartWrap");

  const btnRender = document.getElementById("btnRender");
  const btnExample = document.getElementById("btnExample");
  const btnClear = document.getElementById("btnClear");
  const btnPng = document.getElementById("btnPng");
  const btnPdf = document.getElementById("btnPdf");

  const btnSaveTxt = document.getElementById("btnSaveTxt");
const fileTxt = document.getElementById("fileTxt");




  

  function countIndent(line) {
    let tabs = 0;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === "\t") tabs++;
      else if (ch === " ") continue;
      else break;
    }
    if (tabs > 0) return tabs;
    const m = line.match(/^( +)/);
    if (!m) return 0;
    return Math.floor(m[1].length / 2);
  }

  function parse(text) {
    const lines = text.replace(/\r/g, "").split("\n").filter(l => l.trim().length > 0);
    if (!lines.length) return { title: "", nodes: [], roots: [], byId: new Map() };

    const title = lines[0].trim();
    const orgLines = lines.slice(1);

    const nodes = [];
    const stack = [];

    for (let i = 0; i < orgLines.length; i++) {
      const raw = orgLines[i];
      const level = countIndent(raw);
      const label = raw.replace(/^\t+/, "").trim().replace(/^ +/, "").trim();

      const node = {
        id: "n" + i + "_" + Math.random().toString(16).slice(2),
        label,
        level,
        parentId: null,
        children: []
      };

      if (level > 0 && stack[level - 1]) node.parentId = stack[level - 1].id;

      stack[level] = node;
      stack.length = level + 1;
      nodes.push(node);
    }

    const byId = new Map(nodes.map(n => [n.id, n]));
    for (const n of nodes) {
      if (n.parentId) {
        const p = byId.get(n.parentId);
        if (p) p.children.push(n);
      }
    }

    const roots = nodes.filter(n => !n.parentId);
    return { title, nodes, roots, byId };
  }

  // dimensions de base, mais on va “fit” si besoin
  const BASE_NODE_W = 220;
  const BASE_NODE_H = 72;
  const BASE_GAP_X = 34;

  function measureNodeHeight(label) {
    const len = label.length;
    if (len > 80) return BASE_NODE_H + 34;
    if (len > 48) return BASE_NODE_H + 18;
    return BASE_NODE_H;
  }

  function layoutTree(roots, gapX, nodeW) {
    const css = getComputedStyle(document.documentElement);
    const gapY = parseFloat(css.getPropertyValue("--gapY")) || 34;
    const unitStep = nodeW + gapX;

    const widths = new Map();
    function subtreeWidth(node) {
      if (!node.children || node.children.length === 0) return 1;
      return node.children.map(subtreeWidth).reduce((a, b) => a + b, 0);
    }
    function computeWidths(node) {
      widths.set(node.id, subtreeWidth(node));
      (node.children || []).forEach(computeWidths);
    }
    roots.forEach(computeWidths);

    const pos = new Map();
    function setPositions(node, leftUnit, depth) {
      const w = widths.get(node.id) || 1;
      const center = leftUnit + w / 2;
      pos.set(node.id, { unitX: center, depth });

      let cursor = leftUnit;
      for (const ch of (node.children || [])) {
        const cw = widths.get(ch.id) || 1;
        setPositions(ch, cursor, depth + 1);
        cursor += cw;
      }
    }

    let cursorRoot = 0;
    for (const r of roots) {
      const rw = widths.get(r.id) || 1;
      setPositions(r, cursorRoot, 0);
      cursorRoot += rw;
    }

    let minX = Infinity, maxX = -Infinity, maxDepth = 0;
    for (const p of pos.values()) {
      minX = Math.min(minX, p.unitX);
      maxX = Math.max(maxX, p.unitX);
      maxDepth = Math.max(maxDepth, p.depth);
    }

    // surface brute en px
    const leftPad = 16;
    const rightPad = 16;

    const pixelPos = new Map();
    for (const [id, p] of pos.entries()) {
      const x = leftPad + (p.unitX - minX) * unitStep - nodeW / 2;
      pixelPos.set(id, { x, y: 0, depth: p.depth });
    }

    // y provisoire
    const yAtDepth = [0];
    for (let d = 1; d <= maxDepth; d++) yAtDepth[d] = yAtDepth[d - 1] + BASE_NODE_H + gapY;
    for (const p of pixelPos.values()) p.y = yAtDepth[p.depth];

    const totalW = leftPad + (maxX - minX + 1) * unitStep + rightPad;
    const totalH = yAtDepth[maxDepth] + BASE_NODE_H + 40;
    return { pixelPos, totalW, totalH, nodeW, gapX };
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[c]));
  }

  function clear() {
    nodesEl.innerHTML = "";
    linksEl.innerHTML = "";
  }

  function fitParameters(roots) {
    // On ajuste gapX puis nodeW pour que totalW <= largeur dispo
    const available = chartWrapEl.clientWidth; // largeur visible
    // petite marge interne
    const target = Math.max(320, available - 10);

    let nodeW = BASE_NODE_W;
    let gapX = BASE_GAP_X;

    // on tente de réduire gapX
    for (let i = 0; i < 10; i++) {
      const test = layoutTree(roots, gapX, nodeW);
      if (test.totalW <= target) return test;
      gapX = Math.max(10, gapX - 4);
    }

    // si encore trop large, on réduit nodeW
    for (let i = 0; i < 18; i++) {
      const test = layoutTree(roots, gapX, nodeW);
      if (test.totalW <= target) return test;
      nodeW = Math.max(140, nodeW - 6);
    }

    // dernier recours : on retourne avec paramètres mini (ça tiendra au mieux)
    return layoutTree(roots, gapX, nodeW);
  }

function formatLabel(rawLabel) {
  // règle : si "A: B" => A en titre, B en lignes
  // si B contient " - " => chaque élément en puce "- ..."
  const idx = rawLabel.indexOf(":");
  if (idx === -1) {
    return { title: rawLabel.trim(), lines: [] };
  }

  const title = rawLabel.slice(0, idx).trim();
  const rest = rawLabel.slice(idx + 1).trim();

  if (!rest) return { title, lines: [] };

  // split sur " - " (avec espaces) + nettoyage
  const parts = rest.split(" - ").map(s => s.trim()).filter(Boolean);

  // si aucun " - ", on garde une seule ligne
  if (parts.length <= 1) return { title, lines: [rest] };

  // sinon lignes en "- xxx"
  return { title, lines: parts.map(p => `- ${p}`) };
}

function render() {
  clear();

  const { title, nodes, roots, byId } = parse(input.value);
  chartTitleEl.textContent = title || "";
  if (!roots.length) return;

  const layout = fitParameters(roots);
  const { pixelPos, totalW, nodeW } = layout;

  const available = Math.max(320, chartWrapEl.clientWidth - 10);
  const scale = totalW > available ? (available / totalW) : 1;

  // 1) on crée les nodes, mais on calcule d'abord les x "bruts"
  const placed = []; // {id, x, y, w, h}
  for (const n of nodes) {
    const p = pixelPos.get(n.id);
    if (!p) continue;

    const { title: t, lines } = formatLabel(n.label);

    // hauteur auto selon nb de lignes
    const h = 56 + Math.min(8, lines.length) * 16; // simple et efficace
    const lvl = Math.min(5, n.level);

    const x = p.x * scale;
    const y = p.y;
    const w = nodeW * scale;

    placed.push({ id: n.id, x, y, w, h, lvl, t, lines });
  }

  // 2) Anti-débordement gauche : on décale tout pour que minX >= 10
  let minX = Infinity;
  for (const it of placed) minX = Math.min(minX, it.x);
  const shiftX = (minX < 10) ? (10 - minX) : 0;

  // 3) Render DOM
// --- création des cards (SANS hauteur fixe) ---
for (const it of placed) {
  const div = document.createElement("div");
  div.className = `node level-${it.lvl}`;
  div.id = it.id;

  div.style.left = (it.x + shiftX) + "px";
  div.style.top = it.y + "px";
  div.style.width = it.w + "px";
  div.style.height = "auto";          // <-- clé

  const linesHtml = (it.lines || [])
    .map(l => `<span class="bullet">${escapeHtml(l)}</span>`)
    .join("");

  div.innerHTML = `
    <div class="nodeTitle">${escapeHtml(it.t)}</div>
    ${it.lines && it.lines.length ? `<div class="nodeLines">${linesHtml}</div>` : ``}
  `;

  nodesEl.appendChild(div);

  // force la hauteur réelle du contenu
  // (sinon certains navigateurs gardent une hauteur précédente)
  div.style.height = div.scrollHeight + "px";
}


  // 4) Ajuster les Y par profondeur (pour éviter chevauchement)
  const gapY = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--gapY")) || 34;

  // depth max heights
  const depthMax = new Map();
  for (const n of nodes) {
    const el = document.getElementById(n.id);
    if (!el) continue;
    const d = pixelPos.get(n.id)?.depth ?? 0;
    depthMax.set(d, Math.max(depthMax.get(d) || 0, el.getBoundingClientRect().height));
  }

  const depths = [...depthMax.keys()].sort((a,b)=>a-b);
  const yAt = new Map();
  let y = 0;
  for (const d of depths) {
    yAt.set(d, y);
    y += (depthMax.get(d) || 72) + gapY;
  }

  let maxBottom = 0;
  for (const n of nodes) {
    const p = pixelPos.get(n.id);
    const el = document.getElementById(n.id);
    if (!p || !el) continue;
    const newY = yAt.get(p.depth) || 0;
    el.style.top = newY + "px";
    maxBottom = Math.max(maxBottom, newY + el.getBoundingClientRect().height);
  }

  nodesEl.style.height = (maxBottom + 30) + "px";

  // 5) SVG = largeur 100% du conteneur, + liens orthogonaux
  const svgW = chartWrapEl.clientWidth;
  const svgH = maxBottom + 30;
  linksEl.setAttribute("width", svgW);
  linksEl.setAttribute("height", svgH);
  linksEl.setAttribute("viewBox", `0 0 ${svgW} ${svgH}`);

  drawLinksShifted(nodes, byId, shiftX);
}

// liens avec prise en compte du shiftX
function drawLinksShifted(nodes, byId, shiftX) {
  linksEl.innerHTML = "";
  const css = getComputedStyle(document.documentElement);
  const stroke = css.getPropertyValue("--line").trim() || "#7a8399";
  const strokeWidth = parseFloat(css.getPropertyValue("--lineWidth")) || 2.4;

  const baseRect = nodesEl.getBoundingClientRect();

  for (const n of nodes) {
    if (!n.parentId) continue;
    const p = byId.get(n.parentId);
    if (!p) continue;

    const pel = document.getElementById(p.id);
    const cel = document.getElementById(n.id);
    if (!pel || !cel) continue;

    const pr = pel.getBoundingClientRect();
    const cr = cel.getBoundingClientRect();

    // coords relatives à nodesEl
    const pX = (pr.left - baseRect.left) + pr.width / 2;
    const pY = (pr.top - baseRect.top) + pr.height;

    const cX = (cr.left - baseRect.left) + cr.width / 2;
    const cY = (cr.top - baseRect.top);

    const midY = pY + 18;

    const d = `M ${pX} ${pY} L ${pX} ${midY} L ${cX} ${midY} L ${cX} ${cY}`;

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", d);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", stroke);
    path.setAttribute("stroke-width", String(strokeWidth));
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    linksEl.appendChild(path);
  }
}


  function drawLinks(nodes, byId, pixelPos, scale) {
    linksEl.innerHTML = "";
    const css = getComputedStyle(document.documentElement);
    const stroke = css.getPropertyValue("--line").trim() || "#7a8399";
    const strokeWidth = parseFloat(css.getPropertyValue("--lineWidth")) || 2.4;

    const baseRect = nodesEl.getBoundingClientRect();

    for (const n of nodes) {
      if (!n.parentId) continue;
      const p = byId.get(n.parentId);
      if (!p) continue;

      const pel = document.getElementById(p.id);
      const cel = document.getElementById(n.id);
      if (!pel || !cel) continue;

      const pr = pel.getBoundingClientRect();
      const cr = cel.getBoundingClientRect();

      const pX = (pr.left - baseRect.left) + pr.width / 2;
      const pY = (pr.top - baseRect.top) + pr.height;

      const cX = (cr.left - baseRect.left) + cr.width / 2;
      const cY = (cr.top - baseRect.top);

      const midY = pY + 18;

      const d = `M ${pX} ${pY} L ${pX} ${midY} L ${cX} ${midY} L ${cX} ${cY}`;

      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", d);
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", stroke);
      path.setAttribute("stroke-width", String(strokeWidth));
      path.setAttribute("stroke-linecap", "round");
      path.setAttribute("stroke-linejoin", "round");
      linksEl.appendChild(path);
    }
  }

async function exportPNG() {
  const original = document.querySelector(".sheet.a4.landscape");

  // 1. Cloner la fiche
  const clone = original.cloneNode(true);

  // 2. Forcer taille A4 réelle
  clone.style.width = "1123px";
  clone.style.height = "794px";
  clone.style.transform = "none";
  clone.style.maxWidth = "none";
  clone.style.position = "fixed";
  clone.style.left = "-2000px";
  clone.style.top = "0";
  clone.style.background = "#fff";

  document.body.appendChild(clone);

  // 3. Capture haute qualité
  const canvas = await html2canvas(clone, {
    backgroundColor: "#ffffff",
    scale: 2,          // 🔥 netteté
    useCORS: true
  });

  // 4. Nettoyage
  document.body.removeChild(clone);

  // 5. Téléchargement
  const link = document.createElement("a");
  link.download = "fiche-poste.png";
  link.href = canvas.toDataURL("image/png");
  link.click();
}

  async function exportPDF() {
    const canvas = await html2canvas(chartWrapEl, { backgroundColor: "#ffffff", scale: 2 });
    const imgData = canvas.toDataURL("image/png");
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });

    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const ratio = Math.min(pageW / canvas.width, pageH / canvas.height);

    pdf.addImage(imgData, "PNG",
      (pageW - canvas.width * ratio) / 2,
      (pageH - canvas.height * ratio) / 2,
      canvas.width * ratio,
      canvas.height * ratio
    );
    pdf.save("organigramme.pdf");
  }

  // events
  btnRender.addEventListener("click", render);
  btnExample.addEventListener("click", () => { input.value = example; render(); });
  btnClear.addEventListener("click", () => { input.value = ""; render(); });
  btnPng.addEventListener("click", exportPNG);
  btnPdf.addEventListener("click", exportPDF);

  let t = null;
  input.addEventListener("input", () => {
    clearTimeout(t);
    t = setTimeout(render, 250);
  });

  window.addEventListener("resize", () => render());


(() => {
  const input = document.getElementById("input");
  const nodesEl = document.getElementById("nodes");
  const linksEl = document.getElementById("links");
  const chartTitleEl = document.getElementById("chartTitle");
  const chartWrapEl = document.getElementById("chartWrap");

  const btnRender = document.getElementById("btnRender");
  const btnExample = document.getElementById("btnExample");
  const btnClear = document.getElementById("btnClear");
  const btnPng = document.getElementById("btnPng");
  const btnPdf = document.getElementById("btnPdf");

  const btnSaveTxt = document.getElementById("btnSaveTxt");
const fileTxt = document.getElementById("fileTxt");


 const example = `TITRE DE L’ORGANIGRAMME
TITRE NIVEAU 1
  TITRE NIVEAU 2
    TITRE NIVEAU 3
      TITRE NIVEAU 4
      TITRE NIVEAU 4
    TITRE NIVEAU 3
      TITRE NIVEAU 4
      TITRE NIVEAU 4
      TITRE NIVEAU 4
      TITRE NIVEAU 4
  TITRE NIVEAU 2`;
  input.value = example;

  function countIndent(line) {
    let tabs = 0;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === "\t") tabs++;
      else if (ch === " ") continue;
      else break;
    }
    if (tabs > 0) return tabs;
    const m = line.match(/^( +)/);
    if (!m) return 0;
    return Math.floor(m[1].length / 2);
  }

  function parse(text) {
    const lines = text.replace(/\r/g, "").split("\n").filter(l => l.trim().length > 0);
    if (!lines.length) return { title: "", nodes: [], roots: [], byId: new Map() };

    const title = lines[0].trim();
    const orgLines = lines.slice(1);

    const nodes = [];
    const stack = [];

    for (let i = 0; i < orgLines.length; i++) {
      const raw = orgLines[i];
      const level = countIndent(raw);
      const label = raw.replace(/^\t+/, "").trim().replace(/^ +/, "").trim();

      const node = {
        id: "n" + i + "_" + Math.random().toString(16).slice(2),
        label,
        level,
        parentId: null,
        children: []
      };

      if (level > 0 && stack[level - 1]) node.parentId = stack[level - 1].id;

      stack[level] = node;
      stack.length = level + 1;
      nodes.push(node);
    }

    const byId = new Map(nodes.map(n => [n.id, n]));
    for (const n of nodes) {
      if (n.parentId) {
        const p = byId.get(n.parentId);
        if (p) p.children.push(n);
      }
    }

    const roots = nodes.filter(n => !n.parentId);
    return { title, nodes, roots, byId };
  }

  // dimensions de base, mais on va “fit” si besoin
  const BASE_NODE_W = 220;
  const BASE_NODE_H = 72;
  const BASE_GAP_X = 34;

  function measureNodeHeight(label) {
    const len = label.length;
    if (len > 80) return BASE_NODE_H + 34;
    if (len > 48) return BASE_NODE_H + 18;
    return BASE_NODE_H;
  }

  function layoutTree(roots, gapX, nodeW) {
    const css = getComputedStyle(document.documentElement);
    const gapY = parseFloat(css.getPropertyValue("--gapY")) || 34;
    const unitStep = nodeW + gapX;

    const widths = new Map();
    function subtreeWidth(node) {
      if (!node.children || node.children.length === 0) return 1;
      return node.children.map(subtreeWidth).reduce((a, b) => a + b, 0);
    }
    function computeWidths(node) {
      widths.set(node.id, subtreeWidth(node));
      (node.children || []).forEach(computeWidths);
    }
    roots.forEach(computeWidths);

    const pos = new Map();
    function setPositions(node, leftUnit, depth) {
      const w = widths.get(node.id) || 1;
      const center = leftUnit + w / 2;
      pos.set(node.id, { unitX: center, depth });

      let cursor = leftUnit;
      for (const ch of (node.children || [])) {
        const cw = widths.get(ch.id) || 1;
        setPositions(ch, cursor, depth + 1);
        cursor += cw;
      }
    }

    let cursorRoot = 0;
    for (const r of roots) {
      const rw = widths.get(r.id) || 1;
      setPositions(r, cursorRoot, 0);
      cursorRoot += rw;
    }

    let minX = Infinity, maxX = -Infinity, maxDepth = 0;
    for (const p of pos.values()) {
      minX = Math.min(minX, p.unitX);
      maxX = Math.max(maxX, p.unitX);
      maxDepth = Math.max(maxDepth, p.depth);
    }

    // surface brute en px
    const leftPad = 16;
    const rightPad = 16;

    const pixelPos = new Map();
    for (const [id, p] of pos.entries()) {
      const x = leftPad + (p.unitX - minX) * unitStep - nodeW / 2;
      pixelPos.set(id, { x, y: 0, depth: p.depth });
    }

    // y provisoire
    const yAtDepth = [0];
    for (let d = 1; d <= maxDepth; d++) yAtDepth[d] = yAtDepth[d - 1] + BASE_NODE_H + gapY;
    for (const p of pixelPos.values()) p.y = yAtDepth[p.depth];

    const totalW = leftPad + (maxX - minX + 1) * unitStep + rightPad;
    const totalH = yAtDepth[maxDepth] + BASE_NODE_H + 40;
    return { pixelPos, totalW, totalH, nodeW, gapX };
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[c]));
  }

  function clear() {
    nodesEl.innerHTML = "";
    linksEl.innerHTML = "";
  }

  function fitParameters(roots) {
    // On ajuste gapX puis nodeW pour que totalW <= largeur dispo
    const available = chartWrapEl.clientWidth; // largeur visible
    // petite marge interne
    const target = Math.max(320, available - 10);

    let nodeW = BASE_NODE_W;
    let gapX = BASE_GAP_X;

    // on tente de réduire gapX
    for (let i = 0; i < 10; i++) {
      const test = layoutTree(roots, gapX, nodeW);
      if (test.totalW <= target) return test;
      gapX = Math.max(10, gapX - 4);
    }

    // si encore trop large, on réduit nodeW
    for (let i = 0; i < 18; i++) {
      const test = layoutTree(roots, gapX, nodeW);
      if (test.totalW <= target) return test;
      nodeW = Math.max(140, nodeW - 6);
    }

    // dernier recours : on retourne avec paramètres mini (ça tiendra au mieux)
    return layoutTree(roots, gapX, nodeW);
  }

function formatLabel(rawLabel) {
  // règle : si "A: B" => A en titre, B en lignes
  // si B contient " - " => chaque élément en puce "- ..."
  const idx = rawLabel.indexOf(":");
  if (idx === -1) {
    return { title: rawLabel.trim(), lines: [] };
  }

  const title = rawLabel.slice(0, idx).trim();
  const rest = rawLabel.slice(idx + 1).trim();

  if (!rest) return { title, lines: [] };

  // split sur " - " (avec espaces) + nettoyage
  const parts = rest.split(" - ").map(s => s.trim()).filter(Boolean);

  // si aucun " - ", on garde une seule ligne
  if (parts.length <= 1) return { title, lines: [rest] };

  // sinon lignes en "- xxx"
  return { title, lines: parts.map(p => `- ${p}`) };
}

function render() {
  clear();

  const { title, nodes, roots, byId } = parse(input.value);
  chartTitleEl.textContent = title || "";
  if (!roots.length) return;

  const layout = fitParameters(roots);
  const { pixelPos, totalW, nodeW } = layout;

  const available = Math.max(320, chartWrapEl.clientWidth - 10);
  const scale = totalW > available ? (available / totalW) : 1;

  // 1) on crée les nodes, mais on calcule d'abord les x "bruts"
  const placed = []; // {id, x, y, w, h}
  for (const n of nodes) {
    const p = pixelPos.get(n.id);
    if (!p) continue;

    const { title: t, lines } = formatLabel(n.label);

    // hauteur auto selon nb de lignes
    const h = 56 + Math.min(8, lines.length) * 16; // simple et efficace
    const lvl = Math.min(5, n.level);

    const x = p.x * scale;
    const y = p.y;
    const w = nodeW * scale;

    placed.push({ id: n.id, x, y, w, h, lvl, t, lines });
  }

  // 2) Anti-débordement gauche : on décale tout pour que minX >= 10
  let minX = Infinity;
  for (const it of placed) minX = Math.min(minX, it.x);
  const shiftX = (minX < 10) ? (10 - minX) : 0;

  // 3) Render DOM
// --- création des cards (SANS hauteur fixe) ---
for (const it of placed) {
  const div = document.createElement("div");
  div.className = `node level-${it.lvl}`;
  div.id = it.id;

  div.style.left = (it.x + shiftX) + "px";
  div.style.top = it.y + "px";
  div.style.width = it.w + "px";
  div.style.height = "auto";          // <-- clé

  const linesHtml = (it.lines || [])
    .map(l => `<span class="bullet">${escapeHtml(l)}</span>`)
    .join("");

  div.innerHTML = `
    <div class="nodeTitle">${escapeHtml(it.t)}</div>
    ${it.lines && it.lines.length ? `<div class="nodeLines">${linesHtml}</div>` : ``}
  `;

  nodesEl.appendChild(div);

  // force la hauteur réelle du contenu
  // (sinon certains navigateurs gardent une hauteur précédente)
  div.style.height = div.scrollHeight + "px";
}


  // 4) Ajuster les Y par profondeur (pour éviter chevauchement)
  const gapY = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--gapY")) || 34;

  // depth max heights
  const depthMax = new Map();
  for (const n of nodes) {
    const el = document.getElementById(n.id);
    if (!el) continue;
    const d = pixelPos.get(n.id)?.depth ?? 0;
    depthMax.set(d, Math.max(depthMax.get(d) || 0, el.getBoundingClientRect().height));
  }

  const depths = [...depthMax.keys()].sort((a,b)=>a-b);
  const yAt = new Map();
  let y = 0;
  for (const d of depths) {
    yAt.set(d, y);
    y += (depthMax.get(d) || 72) + gapY;
  }

  let maxBottom = 0;
  for (const n of nodes) {
    const p = pixelPos.get(n.id);
    const el = document.getElementById(n.id);
    if (!p || !el) continue;
    const newY = yAt.get(p.depth) || 0;
    el.style.top = newY + "px";
    maxBottom = Math.max(maxBottom, newY + el.getBoundingClientRect().height);
  }

  nodesEl.style.height = (maxBottom + 30) + "px";

  // 5) SVG = largeur 100% du conteneur, + liens orthogonaux
  const svgW = chartWrapEl.clientWidth;
  const svgH = maxBottom + 30;
  linksEl.setAttribute("width", svgW);
  linksEl.setAttribute("height", svgH);
  linksEl.setAttribute("viewBox", `0 0 ${svgW} ${svgH}`);

  drawLinksShifted(nodes, byId, shiftX);
}

// liens avec prise en compte du shiftX
function drawLinksShifted(nodes, byId, shiftX) {
  linksEl.innerHTML = "";
  const css = getComputedStyle(document.documentElement);
  const stroke = css.getPropertyValue("--line").trim() || "#7a8399";
  const strokeWidth = parseFloat(css.getPropertyValue("--lineWidth")) || 2.4;

  const baseRect = nodesEl.getBoundingClientRect();

  for (const n of nodes) {
    if (!n.parentId) continue;
    const p = byId.get(n.parentId);
    if (!p) continue;

    const pel = document.getElementById(p.id);
    const cel = document.getElementById(n.id);
    if (!pel || !cel) continue;

    const pr = pel.getBoundingClientRect();
    const cr = cel.getBoundingClientRect();

    // coords relatives à nodesEl
    const pX = (pr.left - baseRect.left) + pr.width / 2;
    const pY = (pr.top - baseRect.top) + pr.height;

    const cX = (cr.left - baseRect.left) + cr.width / 2;
    const cY = (cr.top - baseRect.top);

    const midY = pY + 18;

    const d = `M ${pX} ${pY} L ${pX} ${midY} L ${cX} ${midY} L ${cX} ${cY}`;

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", d);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", stroke);
    path.setAttribute("stroke-width", String(strokeWidth));
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    linksEl.appendChild(path);
  }
}


  function drawLinks(nodes, byId, pixelPos, scale) {
    linksEl.innerHTML = "";
    const css = getComputedStyle(document.documentElement);
    const stroke = css.getPropertyValue("--line").trim() || "#7a8399";
    const strokeWidth = parseFloat(css.getPropertyValue("--lineWidth")) || 2.4;

    const baseRect = nodesEl.getBoundingClientRect();

    for (const n of nodes) {
      if (!n.parentId) continue;
      const p = byId.get(n.parentId);
      if (!p) continue;

      const pel = document.getElementById(p.id);
      const cel = document.getElementById(n.id);
      if (!pel || !cel) continue;

      const pr = pel.getBoundingClientRect();
      const cr = cel.getBoundingClientRect();

      const pX = (pr.left - baseRect.left) + pr.width / 2;
      const pY = (pr.top - baseRect.top) + pr.height;

      const cX = (cr.left - baseRect.left) + cr.width / 2;
      const cY = (cr.top - baseRect.top);

      const midY = pY + 18;

      const d = `M ${pX} ${pY} L ${pX} ${midY} L ${cX} ${midY} L ${cX} ${cY}`;

      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", d);
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", stroke);
      path.setAttribute("stroke-width", String(strokeWidth));
      path.setAttribute("stroke-linecap", "round");
      path.setAttribute("stroke-linejoin", "round");
      linksEl.appendChild(path);
    }
  }

  async function exportPNG() {
    const canvas = await html2canvas(chartWrapEl, { backgroundColor: "#ffffff", scale: 2 });
    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = "organigramme.png";
    a.click();
  }

  async function exportPDF() {
    const canvas = await html2canvas(chartWrapEl, { backgroundColor: "#ffffff", scale: 2 });
    const imgData = canvas.toDataURL("image/png");
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });

    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const ratio = Math.min(pageW / canvas.width, pageH / canvas.height);

    pdf.addImage(imgData, "PNG",
      (pageW - canvas.width * ratio) / 2,
      (pageH - canvas.height * ratio) / 2,
      canvas.width * ratio,
      canvas.height * ratio
    );
    pdf.save("organigramme.pdf");
  }

  // events
  btnRender.addEventListener("click", render);
  btnExample.addEventListener("click", () => { input.value = example; render(); });
  btnClear.addEventListener("click", () => { input.value = ""; render(); });
  btnPng.addEventListener("click", exportPNG);
  btnPdf.addEventListener("click", exportPDF);

  let t = null;
  input.addEventListener("input", () => {
    clearTimeout(t);
    t = setTimeout(render, 250);
  });

  window.addEventListener("resize", () => render());

  render();
})();


function safeFileNameFromTitle() {
  const t = (chartTitleEl.textContent || "organigramme").trim().toLowerCase();
  return (t
    .replace(/[^\p{L}\p{N}]+/gu, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60) || "organigramme") + ".txt";
}

function saveTxt() {
  const content = input.value ?? "";
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = safeFileNameFromTitle();
  document.body.appendChild(a);
  a.click();
  a.remove();

  URL.revokeObjectURL(url);
}

function loadTxtFile(file) {
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    input.value = String(reader.result || "");
    render();
  };
  reader.readAsText(file, "utf-8");
}

// events
btnSaveTxt.addEventListener("click", saveTxt);

fileTxt.addEventListener("change", (e) => {
  const f = e.target.files && e.target.files[0];
  loadTxtFile(f);
  e.target.value = ""; // permet de recharger le même fichier ensuite
});


  render();
})();


