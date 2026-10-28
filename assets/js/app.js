/* DevEx Roadmap: draws the four views from assets/data.json.
   Hovering or focusing anything shows a tooltip; nothing on a chart navigates.
   Sub-tabs are real links. They swap in place with history.pushState, so the
   address bar always holds a link someone else can open. */
(function () {
  "use strict";

  var app = document.getElementById("app");
  if (!app) return;
  var stage = document.getElementById("stage");
  var tip = document.getElementById("tip");
  var qInput = document.getElementById("q");
  var base = app.dataset.base || "";
  var repo = app.dataset.repo || "";
  var NS = "http://www.w3.org/2000/svg";
  var TRACK_COLORS = ["#0ea5e9", "#f97316", "#a855f7", "#22c55e", "#ec4899"];

  var D = null;
  var TOOLS = [];
  var BY_ID = {};
  var FAM = {};
  var state = { view: app.dataset.view, sub: app.dataset.sub || "", q: "" };
  var firstPaint = true;

  // ---------- small helpers ----------

  function el(tag, attrs, parent) {
    var n = document.createElement(tag);
    set(n, attrs);
    if (parent) parent.appendChild(n);
    return n;
  }
  function sv(tag, attrs, parent) {
    var n = document.createElementNS(NS, tag);
    set(n, attrs);
    if (parent) parent.appendChild(n);
    return n;
  }
  function set(n, attrs) {
    if (!attrs) return;
    Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === "text") n.textContent = v;
      else n.setAttribute(k, v);
    });
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  // The data is community-edited, so only https links make it into the page.
  function safeUrl(u) {
    return /^https:\/\/[^\s"'<>]+$/.test(u || "") ? u : "";
  }
  function hash(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0) / 4294967296;
  }
  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }
  function ringOf(id) {
    return D.rubric.rings.filter(function (r) { return r.id === id; })[0] || { id: id, label: id };
  }
  function trackColor(id) {
    var i = D.journeys.tracks.map(function (t) { return t.id; }).indexOf(id);
    return TRACK_COLORS[Math.max(0, i) % TRACK_COLORS.length];
  }
  var LIC_SHORT = { oss: "OS", free: "Fr", freemium: "Fm", paid: "Pd" };

  // ---------- data ----------

  function prep(d) {
    D = d;
    var n = 0;
    d.families.forEach(function (f, i) {
      f.index = i;
      FAM[f.id] = f;
      var list = (d.tools[f.id] || []).slice();
      list.sort(function (a, b) {
        var ca = f.cats.indexOf(a.cat), cb = f.cats.indexOf(b.cat);
        if (ca !== cb) return ca - cb;
        return a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1;
      });
      list.forEach(function (t) {
        t.fam = f.id;
        t.dx = t.dx || [];
        t.parity = t.parity || [];
        t.x = t.dx.length * 10;
        t.y = t.parity.length * 10;
        t.n = ++n;
        TOOLS.push(t);
        BY_ID[t.id] = t;
      });
    });
  }

  function matches(t) {
    if (!state.q) return true;
    var q = state.q.toLowerCase();
    return (t.name + " " + t.id + " " + t.cat + " " + (t.tagline || "")).toLowerCase().indexOf(q) !== -1;
  }

  // ---------- tooltip ----------

  var hideTimer = null;
  var activeId = null;

  function critChips(ids, list) {
    return list.criteria
      .filter(function (c) { return ids.indexOf(c.id) !== -1; })
      .map(function (c) { return '<li title="' + esc(c.help) + '">' + esc(c.label) + "</li>"; })
      .join("");
  }
  function bar(label, v, crit) {
    return (
      '<div class="tt-bar"><span>' + label + "</span><b>" + v + '</b><i style="--v:' + v + '%"></i></div>' +
      (crit ? '<ul class="tt-crit">' + crit + "</ul>" : "")
    );
  }
  function links(pairs) {
    return (
      '<p class="tt-links">' +
      pairs
        .filter(function (p) { return safeUrl(p[1]); })
        .map(function (p) { return '<a href="' + esc(p[1]) + '" target="_blank" rel="noopener">' + p[0] + " ↗</a>"; })
        .join("") +
      "</p>"
    );
  }
  function editUrl(t) {
    return repo + "/edit/main/_data/tools/" + t.fam + ".yml";
  }
  function reportUrl(t) {
    return repo + "/issues/new?labels=data&title=" + encodeURIComponent("Data: " + t.name + " (" + t.id + ")");
  }

  function toolTip(t) {
    var f = FAM[t.fam];
    var r = ringOf(t.ring);
    return (
      '<div class="tt-head" style="--c:' + esc(f.color) + '">' +
      '<span class="tt-sym">' + esc(t.sym) + "</span>" +
      "<div><strong>" + esc(t.name) + "</strong><span>" + esc(f.name) + " · " + esc(t.cat) + "</span></div>" +
      '<span class="tt-ring ring-' + esc(t.ring) + '" title="' + esc(r.help || "") + '">' + esc(r.label) + "</span>" +
      "</div>" +
      '<p class="tt-tag">' + esc(t.tagline) + "</p>" +
      bar("Ergonomics", t.x, critChips(t.dx, D.rubric.dx)) +
      bar("Parity", t.y, critChips(t.parity, D.rubric.parity)) +
      (t.note ? '<p class="tt-note">' + esc(t.note) + "</p>" : "") +
      '<p class="tt-meta">#' + t.n + " · " + esc(D.rubric.licenses[t.license] || t.license) + (t.repo ? " · " + esc(t.repo) : "") + "</p>" +
      links([["Site", t.url], ["Evidence", t.evidence], ["Edit", editUrl(t)], ["Report", reportUrl(t)]])
    );
  }

  function levelById(id) {
    return D.journeys.levels.filter(function (l) { return l.id === id; })[0];
  }
  function levelTip(lv) {
    return (
      '<div class="tt-head"><span class="tt-sym tt-lvl">' + lv.n + "</span><div><strong>" + esc(lv.name) +
      "</strong><span>Level " + lv.n + " of " + D.journeys.levels.length + "</span></div></div>" +
      '<p class="tt-tag">' + esc(lv.goal) + "</p>" +
      '<ul class="tt-crit">' + (lv.skills || []).map(function (s) { return "<li>" + esc(s) + "</li>"; }).join("") + "</ul>"
    );
  }
  var FL_LABEL = { yes: "Does it today", partial: "Partly", soon: "Coming soon" };
  function fliskTip(lv) {
    var st = lv.flisk.status;
    return (
      '<div class="tt-head" style="--c:#22c55e"><span class="tt-sym">Fl</span><div><strong>Flisk at level ' + lv.n +
      "</strong><span>" + esc(lv.name) + '</span></div><span class="tt-ring fl-' + esc(st) + '">' + FL_LABEL[st] + "</span></div>" +
      '<p class="tt-tag">' + esc(lv.flisk.text) + "</p>" +
      (st === "soon" ? '<p class="tt-note">Flisk does not do this yet. The gap is tracked in the Flisk repo, and this stop updates when it ships.</p>' : "") +
      links([["Flisk", "https://flisk.sh"], ["Tracking issue", D.journeys.flisk_issue]])
    );
  }

  function tipHtml(node) {
    var kind = node.getAttribute("data-tip");
    if (kind === "tool") return toolTip(BY_ID[node.getAttribute("data-id")]);
    if (kind === "level") return levelTip(levelById(node.getAttribute("data-level")));
    if (kind === "flisk") return fliskTip(levelById(node.getAttribute("data-level")));
    if (kind === "text") return '<p class="tt-tag">' + esc(node.getAttribute("data-text")) + "</p>";
    return "";
  }

  function place(node) {
    var r = node.getBoundingClientRect();
    var w = tip.offsetWidth, h = tip.offsetHeight;
    var vw = document.documentElement.clientWidth, vh = window.innerHeight;
    var x = r.right + 14;
    var y = r.top + r.height / 2 - h / 2;
    if (x + w > vw - 8) x = r.left - w - 14;
    if (x < 8) {
      x = clamp(r.left + r.width / 2 - w / 2, 8, vw - w - 8);
      y = r.bottom + 12;
      if (y + h > vh - 8) y = r.top - h - 12;
    }
    y = clamp(y, 8, Math.max(8, vh - h - 8));
    tip.style.left = Math.round(x) + "px";
    tip.style.top = Math.round(y) + "px";
  }

  function activate(node) {
    var html = tipHtml(node);
    if (!html) return;
    clearTimeout(hideTimer);
    clearHot();
    var id = node.getAttribute("data-id");
    if (id) {
      activeId = id;
      stage.classList.add("has-hot");
      stage.querySelectorAll('[data-id="' + id + '"]').forEach(function (n) { n.classList.add("is-hot"); });
    } else {
      node.classList.add("is-hot");
    }
    tip.innerHTML = html;
    tip.hidden = false;
    place(node);
    requestAnimationFrame(function () { tip.classList.add("on"); });
  }
  function clearHot() {
    activeId = null;
    stage.classList.remove("has-hot");
    stage.querySelectorAll(".is-hot").forEach(function (n) { n.classList.remove("is-hot"); });
  }
  function hideSoon() {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(hideNow, 160);
  }
  function hideNow() {
    tip.classList.remove("on");
    tip.hidden = true;
    clearHot();
  }

  function target(e) {
    var n = e.target.closest && e.target.closest("[data-tip]");
    return n && stage.contains(n) ? n : null;
  }
  stage.addEventListener("pointerover", function (e) {
    var n = target(e);
    if (n) activate(n);
  });
  stage.addEventListener("pointerout", function (e) {
    var n = target(e);
    if (n && !(e.relatedTarget && n.contains(e.relatedTarget))) hideSoon();
  });
  stage.addEventListener("focusin", function (e) {
    var n = target(e);
    if (n) activate(n);
  });
  stage.addEventListener("focusout", hideSoon);
  tip.addEventListener("pointerenter", function () { clearTimeout(hideTimer); });
  tip.addEventListener("pointerleave", hideSoon);
  tip.addEventListener("focusin", function () { clearTimeout(hideTimer); });
  tip.addEventListener("focusout", hideSoon);
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") hideNow();
  });
  window.addEventListener("scroll", function () { if (!tip.hidden) hideNow(); }, { passive: true });

  // ---------- labels that do not overlap ----------

  function labeler() {
    var boxes = [];
    return function (x, y, text, size) {
      var w = text.length * size * 0.56 + 4, h = size + 3;
      var tries = [[x + 10, y + size * 0.35], [x - 10 - w, y + size * 0.35], [x - w / 2, y - 10], [x - w / 2, y + size + 8]];
      for (var i = 0; i < tries.length; i++) {
        var bx = tries[i][0], by = tries[i][1] - size;
        var hit = boxes.some(function (b) { return bx < b[0] + b[2] && bx + w > b[0] && by < b[1] + b[3] && by + h > b[1]; });
        if (!hit) {
          boxes.push([bx, by, w, h]);
          return { x: tries[i][0], y: tries[i][1], anchor: "start" };
        }
      }
      return null;
    };
  }

  // ---------- Compass ----------

  function renderCompass() {
    var W = 1000, H = 700, m = { l: 92, r: 92, t: 54, b: 66 };
    var iw = W - m.l - m.r, ih = H - m.t - m.b;
    // Scores run 0 to 100; the frame runs a little wider so a dot at 0 never sits on the axis labels.
    var sx = function (v) { return m.l + ((v + 6) / 112) * iw; };
    var sy = function (v) { return m.t + (1 - (v + 6) / 112) * ih; };
    var svg = sv("svg", { viewBox: "0 0 " + W + " " + H, class: "compass" }, stage);

    var defs = sv("defs", null, svg);
    var mk = sv("marker", { id: "arrow", viewBox: "0 0 10 10", refX: 8, refY: 5, markerWidth: 7, markerHeight: 7, orient: "auto-start-reverse" }, defs);
    sv("path", { d: "M0 0 L10 5 L0 10 z", class: "axis-head" }, mk);
    var glow = sv("radialGradient", { id: "rose-glow" }, defs);
    sv("stop", { offset: "0%", "stop-color": "var(--accent)", "stop-opacity": "0.35" }, glow);
    sv("stop", { offset: "100%", "stop-color": "var(--accent)", "stop-opacity": "0" }, glow);

    // The four zones, named like the screenshots people share.
    var zones = [
      ["nw", 0, 50, "Hard to adopt", "Deep parity"],
      ["ne", 50, 50, "Smooth DX", "Deep parity"],
      ["sw", 0, 0, "Hard to adopt", "Quick start"],
      ["se", 50, 0, "Smooth DX", "Quick start"]
    ];
    zones.forEach(function (z) {
      var east = z[1] === 50, north = z[2] === 50;
      sv("rect", {
        x: east ? sx(50) : m.l, y: north ? m.t : sy(50),
        width: east ? m.l + iw - sx(50) : sx(50) - m.l, height: north ? sy(50) - m.t : m.t + ih - sy(50),
        class: "zone zone-" + z[0]
      }, svg);
      // Labels sit outside the frame, so they never cover a dot.
      var tx = east ? m.l + iw : m.l;
      var ty = north ? m.t - 8 : m.t + ih + 34;
      sv("text", {
        x: tx, y: ty, class: "zone-label zone-label-" + z[0], "text-anchor": east ? "end" : "start",
        text: z[3].toUpperCase() + " / " + z[4].toUpperCase()
      }, svg);
    });

    for (var g = 0; g <= 100; g += 10) {
      sv("line", { x1: sx(g), y1: sy(0), x2: sx(g), y2: sy(100), class: g % 50 ? "grid" : "grid grid-strong" }, svg);
      sv("line", { x1: sx(0), y1: sy(g), x2: sx(100), y2: sy(g), class: g % 50 ? "grid" : "grid grid-strong" }, svg);
      sv("text", { x: sx(g), y: m.t + ih + 16, class: "tick", "text-anchor": "middle", text: g }, svg);
      sv("text", { x: m.l - 8, y: sy(g) + 4, class: "tick", "text-anchor": "end", text: g }, svg);
    }

    // Axes through the middle, arrows at both ends: the compass.
    sv("line", { x1: sx(0), y1: sy(50), x2: sx(100), y2: sy(50), class: "axis", "marker-start": "url(#arrow)", "marker-end": "url(#arrow)" }, svg);
    sv("line", { x1: sx(50), y1: sy(0), x2: sx(50), y2: sy(100), class: "axis", "marker-start": "url(#arrow)", "marker-end": "url(#arrow)" }, svg);
    var cx = sx(50), cy = sy(50);
    sv("circle", { cx: cx, cy: cy, r: 56, fill: "url(#rose-glow)" }, svg);
    sv("path", {
      d: "M" + cx + " " + (cy - 30) + " L" + (cx + 6) + " " + (cy - 6) + " L" + (cx + 30) + " " + cy + " L" + (cx + 6) + " " + (cy + 6) +
        " L" + cx + " " + (cy + 30) + " L" + (cx - 6) + " " + (cy + 6) + " L" + (cx - 30) + " " + cy + " L" + (cx - 6) + " " + (cy - 6) + " z",
      class: "rose"
    }, svg);
    sv("circle", { cx: cx, cy: cy, r: 3.5, class: "rose-pin" }, svg);

    var dx = D.rubric.dx, pa = D.rubric.parity;
    var cardinal = [
      ["N", cx, m.t - 22, "middle", pa.high],
      ["S", cx, H - 12, "middle", pa.low],
      ["E", W - 12, cy - 10, "end", dx.high],
      ["W", 12, cy - 10, "start", dx.low]
    ];
    cardinal.forEach(function (c) {
      var t = sv("text", { x: c[1], y: c[2], "text-anchor": c[3], class: "cardinal" }, svg);
      sv("tspan", { class: "cardinal-letter", text: c[0] + " " }, t);
      sv("tspan", { text: c[4] }, t);
    });
    sv("text", { x: W - 12, y: cy + 24, "text-anchor": "end", class: "axis-name", text: dx.title + " →" }, svg);
    sv("text", { x: 12, y: cy + 24, "text-anchor": "start", class: "axis-name", text: "← friction" }, svg);

    // Dots. Tools with the same score sit on a small sunflower spiral around the point,
    // laid out over every tool so a dot never moves when you switch sub-tabs.
    var groups = {};
    TOOLS.forEach(function (t) {
      var k = t.x + ":" + t.y;
      (groups[k] = groups[k] || []).push(t);
    });
    var pos = {};
    Object.keys(groups).forEach(function (k) {
      groups[k].forEach(function (t, i) {
        var r = 8.2 * Math.sqrt(i), a = i * 2.39996 + hash(k) * 6.28;
        pos[t.id] = [sx(t.x) + r * Math.cos(a), sy(t.y) + r * Math.sin(a)];
      });
    });

    var dots = sv("g", { class: "dots" }, svg);
    var focus = state.sub;
    TOOLS.slice()
      .sort(function (a, b) { return (a.fam === focus) - (b.fam === focus); })
      .forEach(function (t) {
        var f = FAM[t.fam];
        var on = (!focus || t.fam === focus) && matches(t);
        var p = pos[t.id];
        var gEl = sv("g", {
          class: "dot" + (on ? "" : " is-dim") + (focus && t.fam === focus ? " is-focus" : ""),
          "data-id": t.id,
          "data-tip": "tool",
          tabindex: on ? 0 : -1,
          "aria-label": t.name + ", ergonomics " + t.x + ", parity " + t.y,
          style: "--c:" + f.color + ";--d:" + Math.round(hash(t.id) * 500) + "ms"
        }, dots);
        gEl.style.transform = firstPaint ? "translate(" + cx + "px," + cy + "px) scale(0.2)" : "translate(" + p[0] + "px," + p[1] + "px)";
        sv("circle", { r: 13, class: "hit" }, gEl);
        sv("circle", { r: 6, class: "core" }, gEl);
        if (firstPaint) {
          requestAnimationFrame(function () {
            requestAnimationFrame(function () { gEl.style.transform = "translate(" + p[0] + "px," + p[1] + "px)"; });
          });
        }
      });

    // Names only where they help: the sub-tab's tools, or what you searched for.
    var labelled = TOOLS.filter(function (t) {
      return (focus ? t.fam === focus : !!state.q) && matches(t);
    });
    if (labelled.length && labelled.length <= 80) {
      var lab = labeler();
      var lg = sv("g", { class: "labels" }, svg);
      labelled.forEach(function (t) {
        var p = pos[t.id], spot = lab(p[0], p[1], t.name, 11);
        if (spot) sv("text", { x: spot.x, y: spot.y, class: "dot-label", text: t.name }, lg);
      });
    }
  }

  // ---------- Adoption Radar ----------

  function arcPath(r, a0, a1, reverse) {
    var x0 = 500 + r * Math.cos(a0), y0 = 500 + r * Math.sin(a0);
    var x1 = 500 + r * Math.cos(a1), y1 = 500 + r * Math.sin(a1);
    var large = a1 - a0 > Math.PI ? 1 : 0;
    return reverse
      ? "M" + x1 + " " + y1 + " A" + r + " " + r + " 0 " + large + " 0 " + x0 + " " + y0
      : "M" + x0 + " " + y0 + " A" + r + " " + r + " 0 " + large + " 1 " + x1 + " " + y1;
  }

  function shape(t, size, parent) {
    if (t.license === "oss") return sv("circle", { r: size, class: "core" }, parent);
    if (t.license === "paid") {
      var s = size * 1.25;
      return sv("path", { d: "M0 " + -s + " L" + s + " 0 L0 " + s + " L" + -s + " 0 z", class: "core" }, parent);
    }
    var q = size * 0.9;
    return sv("rect", { x: -q, y: -q, width: q * 2, height: q * 2, rx: 2, class: "core" }, parent);
  }

  function renderRadar() {
    var R = [0, 205, 318, 388, 446];
    var rings = D.rubric.rings;
    var focus = state.sub ? FAM[state.sub] : null;
    var sectors = focus
      ? focus.cats.map(function (c) {
          return { name: c, color: focus.color, tools: TOOLS.filter(function (t) { return t.fam === focus.id && t.cat === c; }) };
        }).filter(function (s) { return s.tools.length; })
      : D.families.map(function (f) {
          return { name: f.name, color: f.color, tools: TOOLS.filter(function (t) { return t.fam === f.id; }) };
        });

    var layout = el("div", { class: "radar-layout" }, stage);
    var svg = sv("svg", { viewBox: "0 0 1000 1000", class: "radar" + (focus ? " radar-focus" : "") }, layout);
    var defs = sv("defs", null, svg);

    for (var i = rings.length - 1; i >= 0; i--) {
      sv("circle", { cx: 500, cy: 500, r: R[i + 1], class: "ring-band ring-band-" + i }, svg);
    }

    var span = (Math.PI * 2) / sectors.length;
    var start = -Math.PI / 2;
    var dotSize = focus ? 9 : 6.2;
    var placed = [];

    sectors.forEach(function (s, si) {
      var a0 = start + si * span, a1 = a0 + span;
      sv("path", {
        d: "M500 500 L" + (500 + R[4] * Math.cos(a0)) + " " + (500 + R[4] * Math.sin(a0)) + " A" + R[4] + " " + R[4] + " 0 " + (span > Math.PI ? 1 : 0) + " 1 " + (500 + R[4] * Math.cos(a1)) + " " + (500 + R[4] * Math.sin(a1)) + " z",
        class: "sector",
        style: "--c:" + s.color
      }, svg);
      sv("line", { x1: 500, y1: 500, x2: 500 + R[4] * Math.cos(a0), y2: 500 + R[4] * Math.sin(a0), class: "sector-line" }, svg);

      // Sector name on a curve outside the circle, flipped on the bottom half so it reads upright.
      var mid = (a0 + a1) / 2;
      var bottom = Math.sin(mid) > 0.05;
      var pid = "sec-" + si;
      sv("path", { id: pid, d: arcPath(bottom ? 478 : 466, a0 + 0.02, a1 - 0.02, bottom), fill: "none" }, defs);
      var tx = sv("text", { class: "sector-label", style: "--c:" + s.color }, svg);
      var tp = sv("textPath", { href: "#" + pid, startOffset: "50%", "text-anchor": "middle" }, tx);
      tp.textContent = s.name.toUpperCase() + "  " + s.tools.length;

      rings.forEach(function (ring, ri) {
        var cell = s.tools.filter(function (t) { return t.ring === ring.id; });
        if (!cell.length) return;
        var r0 = Math.max(R[ri] + dotSize + 4, 28), r1 = R[ri + 1] - dotSize - 4;
        var pad = (dotSize + 4) / ((r0 + r1) / 2);
        var b0 = a0 + pad, b1 = a1 - pad;
        var pts = cell.map(function (t) {
          var a = b0 + (b1 - b0) * hash(t.id + ring.id);
          var r = Math.sqrt(r0 * r0 + (r1 * r1 - r0 * r0) * hash(t.id + "r"));
          return { t: t, x: 500 + r * Math.cos(a), y: 500 + r * Math.sin(a) };
        });
        // Push overlapping dots apart, keeping each one inside its ring and sector.
        var min = dotSize * 2 + 3;
        for (var it = 0; it < 120; it++) {
          for (var p = 0; p < pts.length; p++) {
            for (var q = p + 1; q < pts.length; q++) {
              var ddx = pts[q].x - pts[p].x, ddy = pts[q].y - pts[p].y;
              var dd = Math.sqrt(ddx * ddx + ddy * ddy) || 0.01;
              if (dd < min) {
                var push = (min - dd) / 2, ux = ddx / dd, uy = ddy / dd;
                pts[p].x -= ux * push; pts[p].y -= uy * push;
                pts[q].x += ux * push; pts[q].y += uy * push;
              }
            }
          }
          pts.forEach(function (pt) {
            var vx = pt.x - 500, vy = pt.y - 500;
            var rr = clamp(Math.sqrt(vx * vx + vy * vy), r0, r1);
            var aa = Math.atan2(vy, vx);
            while (aa < b0 - 0.0001) aa += Math.PI * 2;
            while (aa > b0 + Math.PI * 2) aa -= Math.PI * 2;
            aa = clamp(aa, b0, b1);
            pt.x = 500 + rr * Math.cos(aa);
            pt.y = 500 + rr * Math.sin(aa);
          });
        }
        pts.forEach(function (pt) { placed.push(pt); });
      });
    });

    // Ring names up the north line.
    rings.forEach(function (ring, ri) {
      var y = 500 - (R[ri] + R[ri + 1]) / 2;
      sv("text", { x: 500, y: y + 4, class: "ring-label ring-" + ring.id, "text-anchor": "middle", text: ring.label.toUpperCase() }, svg);
    });

    var dots = sv("g", { class: "dots" }, svg);
    placed.forEach(function (pt, i) {
      var t = pt.t, f = FAM[t.fam];
      var on = matches(t);
      var g = sv("g", {
        class: "dot" + (on ? "" : " is-dim"),
        "data-id": t.id,
        "data-tip": "tool",
        tabindex: on ? 0 : -1,
        "aria-label": t.name + ", " + ringOf(t.ring).label,
        style: "--c:" + f.color + ";--d:" + Math.min(i * 3, 700) + "ms"
      }, dots);
      g.style.transform = "translate(" + pt.x + "px," + pt.y + "px)";
      sv("circle", { r: dotSize + 6, class: "hit" }, g);
      shape(t, dotSize, g);
    });
    if (focus || state.q) {
      var lab = labeler();
      placed.forEach(function (pt) {
        if (!matches(pt.t)) return;
        var spot = lab(pt.x, pt.y, pt.t.name, focus ? 13 : 11);
        if (spot) sv("text", { x: spot.x, y: spot.y, class: "dot-label" + (focus ? " dot-label-lg" : ""), text: pt.t.name }, svg);
      });
    }

    // A ring-by-ring list beside the radar. Hover a name to find its dot.
    var aside = el("aside", { class: "radar-list" }, layout);
    var pool = focus ? TOOLS.filter(function (t) { return t.fam === focus.id; }) : TOOLS;
    rings.forEach(function (ring) {
      var inRing = pool.filter(function (t) { return t.ring === ring.id; });
      var sec = el("section", { class: "rl rl-" + ring.id }, aside);
      var h = el("h3", null, sec);
      el("span", { text: ring.label }, h);
      el("small", { text: inRing.length }, h);
      el("p", { class: "rl-help", text: ring.help }, sec);
      var ul = el("ul", null, sec);
      inRing
        .slice()
        .sort(function (a, b) { return a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1; })
        .forEach(function (t) {
          el("li", {
            class: "chip" + (matches(t) ? "" : " is-dim"),
            "data-id": t.id,
            "data-tip": "tool",
            tabindex: 0,
            style: "--c:" + FAM[t.fam].color,
            text: t.name
          }, ul);
        });
    });
  }

  // ---------- Lab ----------

  function renderLab() {
    var lab = el("div", { class: "lab" + (state.sub ? " lab-focus" : "") }, stage);
    D.families.forEach(function (f) {
      var tools = TOOLS.filter(function (t) { return t.fam === f.id; });
      var on = !state.sub || state.sub === f.id;
      var block = el("section", { class: "lab-block" + (on ? "" : " is-dim") + (state.sub === f.id ? " is-focus" : ""), style: "--c:" + f.color }, lab);
      var h = el("h3", null, block);
      el("span", { class: "lab-group", text: "Group " + (f.index + 1) }, h);
      el("span", { text: f.name }, h);
      var grid = el("div", { class: "lab-grid" }, block);
      tools.forEach(function (t, i) {
        var tile = el("div", {
          class: "tile ring-" + t.ring + (matches(t) ? "" : " is-dim"),
          "data-id": t.id,
          "data-tip": "tool",
          tabindex: on ? 0 : -1,
          "aria-label": t.name + ", element " + t.n,
          style: "--d:" + Math.min(i * 12, 600) + "ms"
        }, grid);
        el("span", { class: "t-n", text: t.n }, tile);
        el("span", { class: "t-lic", text: LIC_SHORT[t.license] || "" }, tile);
        el("span", { class: "t-sym" + (t.sym.length > 2 ? " t-sym-3" : ""), text: t.sym }, tile);
        el("span", { class: "t-name", text: t.name }, tile);
        el("span", { class: "t-formula", text: "Dx" + t.x / 10 + "·Pa" + t.y / 10 }, tile);
      });
    });
  }

  // ---------- Journeys ----------

  function pill(id, kind, parent) {
    var t = BY_ID[id];
    if (!t) return el("span", { class: "pill pill-missing", text: id }, parent);
    var p = el("span", {
      class: "pill pill-" + kind + (matches(t) ? "" : " is-dim"),
      "data-id": t.id,
      "data-tip": "tool",
      tabindex: 0,
      style: "--fc:" + FAM[t.fam].color
    }, parent);
    el("b", { text: t.sym }, p);
    el("span", { text: t.name }, p);
    return p;
  }

  function renderJourneys() {
    var tracks = D.journeys.tracks;
    var tr = tracks.filter(function (t) { return t.id === state.sub; })[0] || tracks[0];
    var metro = el("div", { class: "metro", style: "--c:" + trackColor(tr.id) }, stage);
    var head = el("div", { class: "metro-head" }, metro);
    el("span", { class: "metro-badge", text: tr.name + " line" }, head);
    el("p", { text: tr.blurb }, head);

    D.journeys.levels.forEach(function (lv, i) {
      var stop = (tr.stops && tr.stops[lv.id]) || { main: [], side: [] };
      var row = el("section", { class: "station", style: "--d:" + i * 70 + "ms" }, metro);
      var rail = el("div", { class: "rail" }, row);
      el("span", {
        class: "node",
        "data-tip": "level",
        "data-level": lv.id,
        tabindex: 0,
        "aria-label": "Level " + lv.n + ": " + lv.name,
        text: lv.n
      }, rail);

      var body = el("div", { class: "station-body" }, row);
      el("p", { class: "lvl", text: "Level " + lv.n }, body);
      el("h3", { text: lv.name }, body);
      el("p", { class: "goal", text: lv.goal }, body);

      var line = el("div", { class: "line line-main" }, body);
      el("span", { class: "line-label", text: "On the line" }, line);
      (stop.main || []).forEach(function (id) { if (id !== "flisk") pill(id, "main", line); });
      var st = lv.flisk.status;
      var fl = el("span", {
        class: "pill pill-flisk fl-" + st,
        "data-tip": "flisk",
        "data-level": lv.id,
        tabindex: 0
      }, line);
      el("b", { text: "Fl" }, fl);
      el("span", { text: st === "soon" ? "Flisk · coming soon" : st === "partial" ? "Flisk · partly" : "Flisk" }, fl);

      if (stop.side && stop.side.length) {
        var side = el("div", { class: "line line-side" }, body);
        el("span", { class: "line-label", text: "Branches" }, side);
        stop.side.forEach(function (id) { if (id !== "flisk") pill(id, "side", side); });
      }
      if (stop.tip) el("p", { class: "track-tip", text: stop.tip }, body);
    });
    var end = el("div", { class: "metro-end" }, metro);
    el("span", { class: "node node-end", text: "★" }, end);
    el("p", { text: "End of the line: you can design the paths other people walk." }, end);
  }

  // ---------- render and routing ----------

  function render() {
    hideNow();
    stage.innerHTML = "";
    stage.classList.remove("is-in");
    if (state.view === "compass") renderCompass();
    else if (state.view === "radar") renderRadar();
    else if (state.view === "lab") renderLab();
    else renderJourneys();
    void stage.offsetWidth;
    stage.classList.add("is-in");
    firstPaint = false;
  }

  function viewInfo() {
    return D.views.filter(function (v) { return v.id === state.view; })[0];
  }
  function subName() {
    if (!state.sub) return "";
    var list = viewInfo().subtabs === "tracks" ? D.journeys.tracks : D.families;
    var s = list.filter(function (x) { return x.id === state.sub; })[0];
    return s ? s.name : "";
  }

  function syncChrome() {
    document.querySelectorAll("#subtabs .subtab").forEach(function (a) {
      if ((a.getAttribute("data-sub") || "") === state.sub) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
    var v = viewInfo(), name = subName();
    document.title = v.title + (name && v.subtabs !== "tracks" ? ": " + name : name ? ": " + name : "") + " | DevEx Roadmap";
    document.querySelectorAll(".all-list tbody tr[data-fam]").forEach(function (tr) {
      tr.hidden = !!state.sub && v.subtabs !== "tracks" && tr.getAttribute("data-fam") !== state.sub;
    });
  }

  function pathFor(sub) {
    return base + "/" + state.view + "/" + (sub ? sub + "/" : "");
  }
  function query() {
    return state.q ? "?q=" + encodeURIComponent(state.q) : "";
  }

  document.getElementById("subtabs").addEventListener("click", function (e) {
    var a = e.target.closest("a.subtab");
    if (!a || !D || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button) return;
    e.preventDefault();
    var sub = a.getAttribute("data-sub") || "";
    if (sub === state.sub) return;
    state.sub = sub;
    history.pushState({ sub: sub }, "", pathFor(sub) + query());
    syncChrome();
    render();
  });

  // Keep the search when you jump between views.
  document.querySelectorAll(".views .view-tab").forEach(function (a) {
    a.addEventListener("click", function () {
      if (state.q) a.href = a.href.split("?")[0] + query();
    });
  });

  window.addEventListener("popstate", function () {
    var parts = location.pathname.slice(base.length).split("/").filter(Boolean);
    if (parts[0] && parts[0] !== state.view) {
      location.reload();
      return;
    }
    state.sub = parts[1] || (viewInfo().subtabs === "tracks" ? D.journeys.tracks[0].id : "");
    syncChrome();
    render();
  });

  if (qInput) {
    var qTimer;
    qInput.addEventListener("input", function () {
      clearTimeout(qTimer);
      qTimer = setTimeout(function () {
        state.q = qInput.value.trim();
        history.replaceState(history.state, "", location.pathname + query());
        render();
      }, 120);
    });
  }

  var tb = document.querySelector(".toolbar");
  if (tb) tb.hidden = false;
  try {
    state.q = new URLSearchParams(location.search).get("q") || "";
    if (qInput) qInput.value = state.q;
  } catch (e) {}

  fetch(base + "/assets/data.json")
    .then(function (r) { return r.json(); })
    .then(function (d) {
      prep(d);
      syncChrome();
      render();
    })
    .catch(function () {
      stage.innerHTML = '<p class="stage-error">The chart could not load. The table below has every tool.</p>';
    });
})();
