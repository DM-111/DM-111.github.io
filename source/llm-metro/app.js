(function () {
  "use strict";

  const HISTORY = window.HISTORY || [];
  const LINES = window.LINES || [];
  const JOURNEYS = window.JOURNEYS || [];
  const ABOUT = window.ABOUT || { paragraphs: [], keys: [] };
  const NS = "http://www.w3.org/2000/svg";
  const VIEW_W = 1000, VIEW_H = 290;
  const byId = new Map(HISTORY.map((s) => [s.id, s]));
  const lineById = new Map(LINES.map((l) => [l.id, l]));

  // Four reading eras, each spread over a horizontal band of the map.
  const ERAS = [
    { name: "智能萌芽", range: "1950—1997", x0: 44, x1: 228 },
    { name: "深度学习前夜", range: "2003—2016", x0: 263, x1: 447 },
    { name: "大模型时代", range: "2017—2021", x0: 482, x1: 666 },
    { name: "生成式 AI 浪潮", range: "2022—2025", x0: 701, x1: 948 }
  ];
  const LANE_Y = [92, 156, 220];
  const LANE_NAMES = ["理论奠基", "关键技术", "规模与产品"];
  // [station, era, lane] — each era is read left → right, one lane after another.
  const LAYOUT = [
    ["turing", 0, 0], ["backprop", 0, 1], ["lstm", 0, 2], ["perceptron", 0, 0], ["eliza", 0, 2],
    ["neural-lm", 1, 0], ["attention", 1, 0], ["word2vec", 1, 1], ["seq2seq", 1, 2], ["transformer", 1, 1],
    ["gpt1", 2, 0], ["t5", 2, 0], ["bert", 2, 1], ["scaling", 2, 1], ["gpt2", 2, 2], ["gpt3", 2, 2],
    ["instructgpt", 3, 0], ["chinchilla", 3, 0], ["mistral", 3, 0], ["gpt4o", 3, 0],
    ["chatgpt", 3, 1], ["llama", 3, 1], ["o1", 3, 1], ["deepseekv3", 3, 1],
    ["gpt4", 3, 2], ["qwen", 3, 2], ["deepseekr1", 3, 2]
  ];
  // Short, collision-free labels (the full title lives in the detail card).
  const LABEL_TEXT = { attention: "注意力机制", "neural-lm": "神经语言模型", instructgpt: "对齐微调", seq2seq: "Seq2Seq 翻译", "gpt3": "GPT-3", "gpt4": "GPT-4", "deepseekv3": "DeepSeek-V3", "deepseekr1": "DeepSeek-R1", llama: "Llama 系列", qwen: "Qwen 千问" };
  const HUB_IDS = new Set(["turing", "backprop", "attention", "transformer", "bert", "gpt3", "chatgpt", "gpt4", "o1", "deepseekr1"]);
  // Which way the label of a station sits relative to its dot.
  const LABEL_SIDE = { turing: "below", backprop: "above", lstm: "above", perceptron: "below", eliza: "above", "neural-lm": "below", attention: "below", word2vec: "above", seq2seq: "above", transformer: "below", gpt1: "below", t5: "above", bert: "above", scaling: "below", gpt2: "below", "gpt3": "above", instructgpt: "above", chinchilla: "below", mistral: "above", "gpt4o": "below", chatgpt: "below", llama: "above", o1: "below", "deepseekv3": "above", "gpt4": "below", qwen: "above", "deepseekr1": "above" };
  const SEGMENT_AFTER = {
    turing: "#a08b6f", perceptron: "#a08b6f", eliza: "#a08b6f", backprop: "#cf4657", lstm: "#cf4657", "neural-lm": "#cf4657",
    word2vec: "#df7b2c", seq2seq: "#cf4657", attention: "#cf4657", transformer: "#cf4657", gpt1: "#df7b2c", bert: "#cf4657",
    gpt2: "#df7b2c", t5: "#df7b2c", scaling: "#df7b2c", gpt3: "#3b7fc4", instructgpt: "#df7b2c", chinchilla: "#df7b2c",
    chatgpt: "#3b7fc4", llama: "#2f9b71", gpt4: "#df7b2c", qwen: "#2f9b71", mistral: "#2f9b71", gpt4o: "#df7b2c",
    o1: "#3b7fc4", deepseekv3: "#2f9b71"
  };
  const PLAN = new Map();
  const EDGES = [];

  (function plan() {
    ERAS.forEach((era, ei) => {
      [0, 1, 2].forEach((lane) => {
        const ids = LAYOUT.filter((r) => r[1] === ei && r[2] === lane).map((r) => r[0]).filter((id) => byId.has(id));
        ids.forEach((id, i) => {
          const pad = Math.min(14, (era.x1 - era.x0) * 0.1);
          const x = ids.length === 1 ? Math.round((era.x0 + era.x1) / 2) : Math.round(era.x0 + pad + ((era.x1 - era.x0 - pad * 2) * i) / (ids.length - 1));
          PLAN.set(id, { x, y: LANE_Y[lane], lane, era: ei, lab: LABEL_SIDE[id] === "above" ? -1 : 1 });
        });
      });
    });
    const ordered = [...PLAN.entries()].sort((a, b) => (a[1].x - b[1].x) || (a[1].y - b[1].y));
    ordered.forEach(([id], i) => {
      const next = ordered[i + 1];
      if (next) EDGES.push({ a: id, b: next[0], color: SEGMENT_AFTER[id] || "#5b6159" });
    });
  })();

  const ORDERED = [...PLAN.keys()].sort((a, b) => (PLAN.get(a).x - PLAN.get(b).x) || (byId.get(a).year - byId.get(b).year));
  const ORDER_INDEX = new Map(ORDERED.map((id, i) => [id, i]));

  let state = {
    selected: null,
    activeLine: null,
    zoom: 1,
    panX: 0,
    panY: 0,
    view: "map",
    mode: "map",
    journeyId: null,
    journeyStop: 0
  };
  const VIEW_KEY = "llmmetro.explored.v1";
  const SAVED_KEY = "llmmetro.saved.v1";
  let explored = new Set(load(VIEW_KEY, []));
  let saved = new Set(load(SAVED_KEY, []));

  function load(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }
  function persist() {
    try {
      localStorage.setItem(VIEW_KEY, JSON.stringify([...explored]));
      localStorage.setItem(SAVED_KEY, JSON.stringify([...saved]));
    } catch (e) { /* storage may be unavailable */ }
  }

  const $ = (sel) => document.querySelector(sel);
  const svgEl = document.getElementById("metro-map");
  const panel = $("#station-panel");
  const el = (tag, cls, html) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html !== undefined) n.innerHTML = html;
    return n;
  };
  function sEl(tag, attrs) {
    const n = document.createElementNS(NS, tag);
    Object.entries(attrs || {}).forEach(([k, v]) => n.setAttribute(k, v));
    return n;
  }
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /* ---------------- Sidebar ---------------- */
  function renderSidebar() {
    const box = $("#sidebar-lines");
    box.innerHTML = "";
    LINES.forEach((line) => {
      const count = HISTORY.filter((s) => s.line === line.id).length;
      const btn = el("button", "line-link", `<i style="background:${line.color}"></i>${esc(line.name)}<em>${count}</em>`);
      btn.dataset.line = line.id;
      btn.title = line.desc;
      btn.addEventListener("click", () => setLineFilter(line.id));
      box.appendChild(btn);
    });
    const fc = $("#line-filters");
    fc.innerHTML = "";
    LINES.forEach((line) => {
      const btn = el("button", "line-chip", `<i style="background:${line.color}"></i>${esc(line.name)}`);
      btn.dataset.line = line.id;
      btn.addEventListener("click", () => setLineFilter(state.activeLine === line.id ? null : line.id));
      fc.appendChild(btn);
    });
    updateSidebar();
  }
  function updateSidebar() {
    const total = HISTORY.length;
    $("#progress-count").textContent = `${explored.size} / ${total}`;
    $("#progress-bar").style.width = `${(explored.size / total) * 100}%`;
    $("#saved-count").textContent = saved.size;
    document.querySelectorAll(".line-link").forEach((b) => b.classList.toggle("active", b.dataset.line === state.activeLine));
    document.querySelectorAll(".line-chip").forEach((b) => {
      const on = state.activeLine === b.dataset.line;
      b.classList.toggle("active", on);
      const line = lineById.get(b.dataset.line);
      if (on) { b.style.background = line.color; b.style.borderColor = "transparent"; b.style.color = "#fff"; }
      else { b.style.background = "#fff"; b.style.borderColor = ""; b.style.color = ""; }
    });
    $("#show-all").classList.toggle("active", !state.activeLine);
    const visible = state.activeLine ? HISTORY.filter((s) => s.line === state.activeLine).length : total;
    $("#visible-count").textContent = state.activeLine ? `${state.activeLine ? lineById.get(state.activeLine).name : ""} · ${visible} 个站点` : `全部 ${total} 个站点`;
  }

  /* ---------------- Map ---------------- */
  function renderMap() {
    svgEl.innerHTML = "";
    const defs = sEl("defs");
    LINES.forEach((line) => {
      const g = sEl("filter", { id: `glow-${line.id}`, x: "-20%", y: "-20%", width: "140%", height: "140%" });
      g.appendChild(sEl("feDropShadow", { dx: "0", dy: "1.2", stdDeviation: "1.2", "flood-color": line.color, "flood-opacity": "0.25" }));
      defs.appendChild(g);
    });
    svgEl.appendChild(defs);

    const land = sEl("g", { class: "tr-land" });
    ERAS.forEach((era, i) => {
      const bx = era.x0 - 16, bw = era.x1 - era.x0 + 32;
      land.appendChild(sEl("rect", { x: bx, y: 42, width: bw, height: 208, rx: 6, class: "tr-era-band" }));
      land.appendChild(sEl("rect", { x: bx, y: 23, width: 20, height: 2, class: "tr-era-accent" }));
      const title = sEl("text", { x: bx, y: 17, class: "tr-era-title" });
      title.textContent = `${String(i + 1).padStart(2, "0")} ${era.name}`;
      land.appendChild(title);
      const range = sEl("text", { x: era.x1 + 16, y: 17, class: "tr-era-range", "text-anchor": "end" });
      range.textContent = era.range;
      land.appendChild(range);
    });
    LANE_Y.forEach((y, i) => {
      land.appendChild(sEl("line", { x1: 24, y1: y, x2: 976, y2: y, stroke: "#e3e4dc", "stroke-width": 1, "stroke-dasharray": "1 7", opacity: 0.95 }));
    });
    svgEl.appendChild(land);

    const paths = sEl("g", { class: "tr-paths" });
    const P = (id) => PLAN.get(id);
    EDGES.forEach((seg) => {
      const a = P(seg.a), b = P(seg.b);
      if (!a || !b) return;
      const sameCol = a.x === b.x;
      const d = sameCol
        ? `M${a.x} ${a.y} L${b.x} ${b.y}`
        : `M${a.x} ${a.y} C${a.x + (b.x - a.x) * 0.45} ${a.y} ${b.x - (b.x - a.x) * 0.45} ${b.y} ${b.x} ${b.y}`;
      const g = sEl("g", { class: "tr-seg", "data-seg": `${seg.a}>${seg.b}` });
      g.appendChild(sEl("path", { d, stroke: "#ffffff", "stroke-width": 12, fill: "none", class: "tr-line tr-base", opacity: 0.8 }));
      g.appendChild(sEl("path", { d, stroke: seg.color, fill: "none", class: "tr-line", "stroke-width": 5.5 }));
      paths.appendChild(g);
    });
    svgEl.appendChild(paths);

    const stationLayer = sEl("g", { class: "tr-stations" });
    PLAN.forEach((p, id) => {
      const item = byId.get(id);
      const lineOf = item && lineById.get(item.line);
      if (!lineOf) return;
      const g = sEl("g", {
        class: `tr-station${HUB_IDS.has(id) ? " hub" : ""}`,
        "data-id": id,
        tabindex: "0",
        role: "button",
        "aria-label": `${item.year} 年 ${item.title}，${item.subtitle}`,
        transform: `translate(${p.x} ${p.y})`,
        style: `color:${lineOf.color}`
      });
      g.appendChild(sEl("circle", { r: HUB_IDS.has(id) ? 13 : 10, class: "halo" }));
      g.appendChild(sEl("circle", { r: HUB_IDS.has(id) ? 5 : 4, class: "dot", stroke: lineOf.color }));
      const label = sEl("text", { class: "label", x: 0, y: p.lab < 0 ? -11 : 15, "text-anchor": "middle" });
      label.textContent = LABEL_TEXT[id] || item.title;
      g.appendChild(label);
      g.addEventListener("click", (ev) => { ev.stopPropagation(); selectStation(id); });
      g.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); selectStation(id); }
      });
      stationLayer.appendChild(g);
    });
    svgEl.appendChild(stationLayer);

    const rule = sEl("line", { id: "cursor-rule", x1: 0, y1: 34, x2: 0, y2: 256, stroke: "#cf4657", "stroke-width": 1, "stroke-dasharray": "2 5", opacity: 0 });
    svgEl.appendChild(rule);
    svgEl.addEventListener("click", () => { if (state.selected) clearSelection(); });
  }

  function applyFilters() {
    svgEl.querySelectorAll(".tr-station").forEach((g) => {
      const item = byId.get(g.dataset.id);
      const visible = !state.activeLine || item.line === state.activeLine;
      g.classList.toggle("dim", !visible);
      g.style.pointerEvents = visible ? "auto" : "none";
    });
    const inLine = (id) => !state.activeLine || (byId.get(id) && byId.get(id).line === state.activeLine);
    svgEl.querySelectorAll(".tr-seg").forEach((g) => {
      if (g.classList.contains("tr-link")) { g.style.opacity = state.activeLine ? 0.2 : 1; return; }
      const ids = (g.dataset.seg || "").split(">");
      g.style.opacity = ids.some(inLine) ? 1 : 0.16;
    });
  }

  function setLineFilter(lineId) {
    state.activeLine = lineId;
    if (lineId) {
      const first = HISTORY.find((s) => s.line === lineId);
      if (first) selectStation(first.id, { scroll: false });
    }
    applyFilters();
    updateSidebar();
    if (state.view !== "map") switchView("map", { keepScroll: true });
    toast(lineId ? `正在浏览「${lineById.get(lineId).name}」线路` : "已显示全部线路");
  }

  function clearFilters() {
    state.activeLine = null;
    applyFilters();
    updateSidebar();
    if (state.view !== "map") switchView("map", { keepScroll: true });
    resetTransform();
    toast("已重置视图");
  }

  /* ---------------- Station detail ---------------- */
  function selectStation(id, opts) {
    const item = byId.get(id);
    if (!item) return;
    state.selected = id;
    explored.add(id);
    persist();
    updateSidebar();
    renderPanel(item);
    svgEl.querySelectorAll(".tr-station").forEach((g) => g.classList.toggle("selected", g.dataset.id === id));
    highlightCursor(item);
    const idx = ORDER_INDEX.get(id);
    const jIdx = JOURNEYS[0].stops.indexOf(id);
    if (state.journeyId) {
      const j = JOURNEYS.find((x) => x.id === state.journeyId);
      const k = j ? j.stops.indexOf(id) : -1;
      if (k >= 0) { state.journeyStop = k; }
    }
    if (opts && opts.scroll && window.innerWidth <= 1080) {
      panel.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    if (window.innerWidth <= 1080 && !opts?.scroll) {
      // On stacked layouts bring the detail card into view without jumping the map.
      const rect = panel.getBoundingClientRect();
      if (rect.top > window.innerHeight - 120) panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
    refreshHash(id);
  }

  function clearSelection() {
    state.selected = null;
    svgEl.querySelectorAll(".tr-station").forEach((g) => g.classList.remove("selected"));
    highlightCursor(null);
    renderEmptyPanel();
    refreshHash(null);
  }

  function highlightCursor(item) {
    const rule = $("#cursor-rule");
    if (!rule) return;
    if (!item) { rule.setAttribute("opacity", 0); return; }
    const p = PLAN.get(item.id);
    rule.setAttribute("x1", p.x);
    rule.setAttribute("x2", p.x);
    rule.setAttribute("opacity", 0.55);
  }

  function renderPanel(item) {
    const line = lineById.get(item.line);
    const idx = ORDER_INDEX.get(item.id);
    const prev = ORDERED[idx - 1] ? byId.get(ORDERED[idx - 1]) : null;
    const next = ORDERED[idx + 1] ? byId.get(ORDERED[idx + 1]) : null;
    const savedNow = saved.has(item.id);
    const journey = state.journeyId ? JOURNEYS.find((x) => x.id === state.journeyId) : null;
    const jk = journey ? journey.stops.indexOf(item.id) : -1;
    const journeyBlock = journey && jk >= 0
      ? `<div class="journey-progress"><small>ROUTE · ${esc(journey.name)}</small><p>第 ${jk + 1} / ${journey.stops.length} 站${next && journey.stops[jk + 1] === next.id ? " · 下一站正是路线上的下一站" : ""}</p></div>`
      : "";
    panel.innerHTML = `
      <div class="panel-line"><span class="badge" style="background:${line.color}">${esc(line.name)}</span><span style="margin-left:auto">STATION ${String(idx + 1).padStart(2, "0")} / ${ORDERED.length}</span></div>
      <div class="panel-head"><div><div class="station-no">${esc(item.date.replace(".", " 年 "))} 月</div><h2>${esc(item.title)}</h2><p class="subtitle">${esc(item.subtitle)}</p></div><button class="save-button${savedNow ? " saved" : ""}" id="save-toggle" title="${savedNow ? "取消收藏" : "收藏这一站"}" aria-pressed="${savedNow}">${savedNow ? "★" : "☆"}</button></div>
      <p class="panel-summary">${esc(item.summary)}</p>
      <div class="fact-block" style="--line-color:${line.color}"><small>KEY BREAKTHROUGH · 关键突破</small><p>${esc(item.breakthrough)}</p></div>
      <div class="why-row"><b>WHY IT MATTERS</b><span>${esc(item.why)}</span></div>
      <div class="term-list">${item.terms.map((t) => `<span>${esc(t)}</span>`).join("")}</div>
      ${journeyBlock}
      <div class="panel-nav">
        <button class="prev" ${prev ? "" : "disabled"}><span>←</span><span><small>上一站</small>${prev ? esc(prev.title) : "起点"}</span></button>
        <button class="next" ${next ? "" : "disabled"}><span><small>下一站 →</small>${next ? esc(next.title) : "终点"}</span><span>→</span></button>
      </div>
      <a class="source-link" href="${esc(item.source)}" target="_blank" rel="noopener noreferrer"><span>查看原始资料 ↗</span><small>${esc(item.sourceLabel || "原始来源")}</small></a>`;
    const save = $("#save-toggle");
    if (save) save.addEventListener("click", () => toggleSave(item.id));
    const pv = panel.querySelector(".panel-nav .prev");
    const nx = panel.querySelector(".panel-nav .next");
    if (prev && pv) pv.addEventListener("click", () => selectStation(prev.id, { scroll: true }));
    if (next && nx) nx.addEventListener("click", () => selectStation(next.id, { scroll: true }));
  }

  function renderEmptyPanel() {
    panel.innerHTML = `
      <div class="empty-panel">
        <div class="empty-icon">◎</div>
        <h2>选一个站点开始</h2>
        <p>点击地图上的任意圆圈，了解那一年发生了什么，以及它如何改变了语言模型的轨迹。</p>
        <div class="tiny-lines">${LINES.map((l) => `<i style="background:${l.color}"></i>`).join("")}</div>
      </div>`;
  }

  function toggleSave(id) {
    if (saved.has(id)) { saved.delete(id); toast("已取消收藏"); }
    else { saved.add(id); toast("已加入收藏 ★"); }
    persist();
    updateSidebar();
    if (state.selected === id) renderPanel(byId.get(id));
    if (state.view === "saved") renderSaved();
  }

  /* ---------------- Transform / zoom ---------------- */
  function resetTransform() { state.zoom = 1; state.panX = 0; state.panY = 0; applyTransform(); }
  function applyTransform() {
    const vb = { x: state.panX, y: state.panY, w: VIEW_W / state.zoom, h: VIEW_H / state.zoom };
    svgEl.setAttribute("viewBox", `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
    $("#zoom-value").textContent = `${Math.round(state.zoom * 100)}%`;
  }
  function zoomBy(delta, cx, cy) {
    const old = state.zoom;
    const next = Math.min(2.5, Math.max(1, Math.round((old + delta) * 20) / 20));
    if (next === old) return;
    state.zoom = next;
    applyTransform();
  }

  function bindPan() {
    let drag = null;
    const viewport = $("#map-viewport");
    const toSvg = (clientX, clientY) => {
      const r = viewport.getBoundingClientRect();
      const vb = VIEW_W / state.zoom, vh = VIEW_H / state.zoom;
      // Preserve the SVG aspect ratio (xMidYMid meet).
      const scale = Math.min(r.width / vb, r.height / vh);
      const offX = (r.width - vb * scale) / 2, offY = (r.height - vh * scale) / 2;
      return { x: state.panX + (clientX - r.left - offX) / scale, y: state.panY + (clientY - r.top - offY) / scale, scale };
    };
    viewport.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      if (e.target.closest(".tr-station")) return;
      drag = { x: e.clientX, y: e.clientY, px: state.panX, py: state.panY };
      svgEl.classList.add("dragging");
    });
    window.addEventListener("pointermove", (e) => {
      if (!drag) return;
      const scale = toSvg(drag.x, drag.y).scale;
      state.panX = drag.px - (e.clientX - drag.x) / scale;
      state.panY = drag.py - (e.clientY - drag.y) / scale;
      const maxX = VIEW_W - VIEW_W / state.zoom, maxY = VIEW_H - VIEW_H / state.zoom;
      state.panX = Math.min(maxX, Math.max(0, state.panX));
      state.panY = Math.min(maxY, Math.max(0, state.panY));
      applyTransform();
    });
    window.addEventListener("pointerup", () => { drag = null; svgEl.classList.remove("dragging"); });
    viewport.addEventListener("wheel", (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      zoomBy(e.deltaY < 0 ? 0.1 : -0.1);
    }, { passive: false });
    $("#zoom-in").addEventListener("click", () => zoomBy(0.2));
    $("#zoom-out").addEventListener("click", () => zoomBy(-0.2));
    $("#fit-map").addEventListener("click", resetTransform);
    const ro = new ResizeObserver(() => applyTransform());
    ro.observe(viewport);
    applyTransform();
  }

  /* ---------------- Views ---------------- */
  function switchView(view, opts) {
    state.view = view;
    $("#breadcrumb-current").textContent = {
      map: "LLM 的前世今生", timeline: "历史时间线", journey: "学习路线", saved: "我的收藏"
    }[view] || "LLM 的前世今生";
    document.querySelectorAll(".nav-item").forEach((b) => b.classList.toggle("active", b.dataset.view === view));
    state.mode = view === "timeline" ? "timeline" : "map";
    document.querySelectorAll(".view-tabs button").forEach((x) => x.classList.toggle("selected", x.dataset.mode === state.mode));
    const explorer = $("#map-view"), alt = $("#alternate-view"), below = document.querySelector(".below-map"), cards = $("#route-cards");
    if (view === "map") {
      explorer.hidden = false; alt.hidden = true; alt.innerHTML = "";
      below.style.display = ""; cards.style.display = "";
    } else {
      explorer.hidden = true; alt.hidden = false; alt.innerHTML = "";
      below.style.display = "none"; cards.style.display = "none";
      if (view === "timeline") renderTimeline();
      if (view === "journey") renderJourneys(alt);
      if (view === "saved") renderSaved();
      if (!opts?.keepScroll) alt.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function altHeader(title, sub, right) {
    return `<div class="alt-head"><div><span class="small-label">LLM METRO · ${esc(sub)}</span><h2>${esc(title)}</h2></div><button class="back-map" id="back-map">← 回到地图</button></div>`;
  }
  function wireBack() {
    const b = $("#back-map");
    if (b) b.addEventListener("click", () => switchView("map"));
  }

  function renderTimeline() {
    const alt = $("#alternate-view");
    let html = altHeader("历史时间线", "TIMELINE · 1950 → 2025", "");
    html += `<p style="margin:-10px 0 26px;font-size:12.5px;color:#858a81">按年份重新排列全部 ${HISTORY.length} 个节点。点击任意事件回到地图上的那一站。</p>`;
    const groups = new Map();
    HISTORY.forEach((s) => {
      if (!groups.has(s.year)) groups.set(s.year, []);
      groups.get(s.year).push(s);
    });
    [...groups.keys()].sort((a, b) => a - b).forEach((year) => {
      html += `<div class="tl-year"><div><h3>${year}</h3><small>${groups.get(year).length} 个节点</small></div><div class="tl-events">`;
      groups.get(year).sort((a, b) => a.date.localeCompare(b.date)).forEach((s) => {
        const line = lineById.get(s.line);
        html += `<button class="tl-event" data-id="${s.id}"><i style="background:${line.color}"></i><span class="tl-title">${esc(s.title)}</span><span class="tl-date">${esc(s.date)}</span><span class="tl-sub">${esc(line.name)} · ${esc(s.subtitle)}</span><span class="tl-arrow">→</span></button>`;
      });
      html += `</div></div>`;
    });
    alt.innerHTML = html;
    alt.querySelectorAll(".tl-event").forEach((b) => b.addEventListener("click", () => {
      switchView("map");
      selectStation(b.dataset.id, { scroll: true });
      document.querySelector(".explorer").scrollIntoView({ behavior: "smooth", block: "start" });
    }));
    wireBack();
  }

  function renderJourneys(container) {
    const target = container || $("#alternate-view");
    let html = altHeader("选择你的学习路线", "LEARNING ROUTES · 三条由浅入深的地铁线", "");
    html += `<p style="margin:-10px 0 26px;font-size:12.5px;color:#858a81">每条路线精选若干站点，按顺序阅读即可建立完整的知识脉络。进度会保存在本机浏览器中。</p><div class="journey-grid">`;
    JOURNEYS.forEach((j) => {
      const spans = j.stops.map((id) => byId.get(id));
      const known = j.stops.filter((id) => explored.has(id)).length;
      html += `<article class="journey-card">
        <div class="jc-top"><span>${esc(j.name)}</span><span>${esc(j.time)}</span></div>
        <h3>${esc(j.title)}</h3><p>${esc(j.desc)}</p>
        <div class="jc-stops">${spans.map((s, i) => `<button class="jc-stop" data-journey="${j.id}" data-id="${s.id}"><b>${String(i + 1).padStart(2, "0")}</b><span>${esc(s.title)}</span><em>${esc(s.date)}</em></button>`).join("")}</div>
        <div class="jc-actions"><button class="start" data-start="${j.id}">${known ? "继续路线" : "开始路线"} · ${known}/${j.stops.length}</button></div>
      </article>`;
    });
    html += `</div>`;
    target.innerHTML = html;
    target.querySelectorAll(".jc-stop").forEach((b) => b.addEventListener("click", () => {
      state.journeyId = b.dataset.journey;
      switchView("map");
      selectStation(b.dataset.id, { scroll: true });
      document.querySelector(".explorer").scrollIntoView({ behavior: "smooth", block: "start" });
    }));
    target.querySelectorAll("[data-start]").forEach((b) => b.addEventListener("click", () => startJourney(b.dataset.start)));
    wireBack();
  }

  function startJourney(id) {
    const j = JOURNEYS.find((x) => x.id === id);
    if (!j) return;
    state.journeyId = id;
    const firstUnseen = j.stops.find((s) => !explored.has(s)) || j.stops[0];
    switchView("map");
    selectStation(firstUnseen, { scroll: true });
    document.querySelector(".explorer").scrollIntoView({ behavior: "smooth", block: "start" });
    toast(`已搭乘「${j.name}」· 共 ${j.stops.length} 站`);
  }

  function renderSaved() {
    const alt = $("#alternate-view");
    let html = altHeader("我的收藏", "SAVED STATIONS", "");
    html += `<div class="saved-grid">`;
    if (!saved.size) {
      html += `<div class="saved-empty">还没有收藏。打开任意站点，点击右上角的 ☆ 把它留在这里。</div>`;
    } else {
      [...saved].map((id) => byId.get(id)).filter(Boolean).sort((a, b) => a.year - b.year).forEach((s) => {
        const line = lineById.get(s.line);
        html += `<button class="saved-card" data-id="${s.id}"><small style="color:${line.color}">● ${esc(line.name)} · ${esc(s.date)}</small><h3>${esc(s.title)}</h3><p>${esc(s.subtitle)}</p></button>`;
      });
    }
    html += `</div>`;
    alt.innerHTML = html;
    alt.querySelectorAll(".saved-card").forEach((b) => b.addEventListener("click", () => {
      switchView("map"); selectStation(b.dataset.id, { scroll: true });
    }));
    wireBack();
  }

  function renderRouteCards() {
    const box = $("#route-cards");
    box.innerHTML = "";
    JOURNEYS.forEach((j) => {
      const card = el("button", "route-card");
      const colors = j.stops.map((id) => lineById.get(byId.get(id).line).color);
      card.innerHTML = `<div class="rc-bar">${colors.map((c) => `<i style="background:${c}"></i>`).join("")}</div><small><span>${esc(j.name)}</span><span>${esc(j.time)}</span></small><h3>${esc(j.title)}</h3><p>${esc(j.desc)}</p><div class="rc-bottom"><span>${j.stops.length} 站</span><span>${j.stops.filter((s) => explored.has(s)).length} 已探索 →</span></div>`;
      card.addEventListener("click", () => startJourney(j.id));
      box.appendChild(card);
    });
  }

  /* ---------------- Search ---------------- */
  function bindSearch() {
    const input = $("#search"), box = $("#search-results");
    let active = -1;
    const close = () => { box.hidden = true; box.innerHTML = ""; active = -1; };
    const run = () => {
      const q = input.value.trim().toLowerCase();
      if (!q) { close(); return; }
      const matches = HISTORY.filter((s) => [s.title, s.subtitle, String(s.year), s.date, ...(s.terms || []), lineById.get(s.line).name].join(" ").toLowerCase().includes(q)).slice(0, 8);
      box.hidden = false;
      if (!matches.length) { box.innerHTML = `<div class="search-empty">没有找到与「${esc(input.value)}」相关的站点</div>`; return; }
      box.innerHTML = matches.map((s) => `<button data-id="${s.id}"><b>${esc(s.date)}</b><i style="background:${lineById.get(s.line).color}"></i><span>${esc(s.title)}</span></button>`).join("");
      box.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
        input.value = ""; close();
        if (state.view !== "map") switchView("map");
        selectStation(b.dataset.id, { scroll: true });
        document.querySelector(".explorer").scrollIntoView({ behavior: "smooth", block: "start" });
      }));
    };
    input.addEventListener("input", run);
    input.addEventListener("focus", () => { if (input.value.trim()) run(); });
    input.addEventListener("keydown", (e) => {
      const items = [...box.querySelectorAll("button")];
      if (e.key === "Escape") { input.value = ""; close(); input.blur(); }
      if (e.key === "ArrowDown" && items.length) { e.preventDefault(); active = (active + 1) % items.length; items.forEach((b, i) => b.classList.toggle("active", i === active)); items[active].scrollIntoView({ block: "nearest" }); }
      if (e.key === "ArrowUp" && items.length) { e.preventDefault(); active = (active - 1 + items.length) % items.length; items.forEach((b, i) => b.classList.toggle("active", i === active)); items[active].scrollIntoView({ block: "nearest" }); }
      if (e.key === "Enter" && items.length) { e.preventDefault(); (items[active] || items[0]).click(); }
    });
    document.addEventListener("click", (e) => { if (!e.target.closest(".search-wrap")) close(); });
    document.addEventListener("keydown", (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); input.focus(); input.select(); }
      if (e.key === "/" && document.activeElement !== input && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); input.focus(); }
    });
  }

  /* ---------------- Misc UI ---------------- */
  let toastTimer;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 1900);
  }

  function refreshHash(id) {
    const next = id ? `#station=${id}` : "";
    if (id) history.replaceState(null, "", `#station=${encodeURIComponent(id)}`);
    else history.replaceState(null, "", location.pathname + location.search);
  }

  function bindGlobal() {
    document.querySelectorAll(".nav-item").forEach((b) => b.addEventListener("click", () => switchView(b.dataset.view)));
    $("#show-all").addEventListener("click", clearFilters);
    $("#reset-filter").addEventListener("click", () => { clearFilters(); clearSelection(); });
    document.querySelectorAll(".view-tabs button").forEach((b) => b.addEventListener("click", () => {
      switchView(b.dataset.mode === "timeline" ? "timeline" : "map");
    }));
    $("#start-journey").addEventListener("click", () => startJourney("beginner"));
    $("#all-journeys").addEventListener("click", () => switchView("journey"));
    const dialog = $("#info-dialog");
    const openDialog = (html) => { $("#dialog-content").innerHTML = html; if (typeof dialog.showModal === "function") dialog.showModal(); else dialog.setAttribute("open", ""); };
    $("#about-button").addEventListener("click", () => {
      openDialog(`<div class="dialog-eyebrow">ABOUT THIS MAP · 关于这张地图</div><h2>一条走向通用智能的轨道</h2>${ABOUT.paragraphs.map((p) => `<p>${esc(p)}</p>`).join("")}<div class="dialog-foot"><span>LLM METRO · VOL. 01</span><span>1950 — 2025</span></div>`);
    });
    $("#help-button").addEventListener("click", () => {
      openDialog(`<div class="dialog-eyebrow">HOW TO READ · 如何使用</div><h2>像坐地铁一样学习</h2><p>点击地图上的站点查看详情；使用顶部的线路标签聚焦某一条技术线路；地铁图上的大圈是多次交汇的关键枢纽。也可以切换到「时间线」按年份浏览，或沿着「学习路线」依次阅读。</p><div class="dialog-keys">${ABOUT.keys.map(([k, v]) => `<div><kbd>${esc(k)}</kbd><span>${esc(v)}</span></div>`).join("")}</div><div class="dialog-foot"><span>进度与收藏仅保存在本机</span><span>ESC 关闭</span></div>`);
    });
    $("#close-dialog").addEventListener("click", () => dialog.close());
    dialog.addEventListener("click", (e) => { if (e.target === dialog) dialog.close(); });
    document.addEventListener("keydown", (e) => {
      const typing = /INPUT|TEXTAREA/.test(document.activeElement.tagName);
      if (typing) return;
      if (e.key === "Escape") {
        if (state.selected) clearSelection();
      }
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        if (!state.selected) return;
        const i = ORDER_INDEX.get(state.selected);
        const nextId = ORDERED[i + (e.key === "ArrowRight" ? 1 : -1)];
        if (nextId) { e.preventDefault(); selectStation(nextId, { scroll: true }); }
      }
      if (e.key === "+" || e.key === "=") zoomBy(0.2);
      if (e.key === "-") zoomBy(-0.2);
      if (e.key === "0") resetTransform();
      if (e.key.toLowerCase() === "s" && state.selected) toggleSave(state.selected);
    });
  }

  function boot() {
    if (!HISTORY.length) {
      document.body.innerHTML = '<p style="padding:40px;font-family:sans-serif">历史数据未能加载，请确认 history.js 与 index.html 在同一目录。</p>';
      return;
    }
    renderSidebar();
    renderMap();
    renderRouteCards();
    bindPan();
    bindSearch();
    bindGlobal();
    renderEmptyPanel();
    updateSidebar();
    const m = location.hash.match(/station=([^&]+)/);
    if (m && byId.has(decodeURIComponent(m[1]))) {
      selectStation(decodeURIComponent(m[1]));
    }
    document.documentElement.dataset.ready = "true";
    window.LLM_METRO = { selectStation, switchView, startJourney, state };
    // Deep link: #station=<id> opens that station directly.
    const deep = location.hash.match(/station=([^&]+)/);
    if (deep) {
      const deepId = decodeURIComponent(deep[1]);
      if (byId.has(deepId)) selectStation(deepId, { scroll: false });
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
  // Re-apply the deep link once everything is parsed and after in-page hash changes.
  const applyHash = () => {
    const m = location.hash.match(/station=([^&]+)/);
    const id = m ? decodeURIComponent(m[1]) : null;
    if (id && byId.has(id)) selectStation(id);
  };
  window.addEventListener("hashchange", applyHash);
})();
