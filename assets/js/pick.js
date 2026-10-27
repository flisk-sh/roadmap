/* The Pick tools page. Loads compare.json once, then draws one table for every tab that
   covers at least one picked tool. The primary tool (_data/meta.yml) is always the first column. The picks live in the
   URL (?tools=a,b), so the link can be shared. Copy buttons and Note buttons are handled by
   compare.js, which listens on the whole document. */
(function () {
  "use strict";

  var rootEl = document.getElementById("pick");
  if (!rootEl) return;

  var src = rootEl.getAttribute("data-src");
  var base = rootEl.getAttribute("data-base") || "";
  var toolbar = document.getElementById("pick-toolbar");
  var chipsEl = document.getElementById("pick-chips");
  var addMenu = document.getElementById("add-menu");
  var addList = document.getElementById("add-list");
  var preset = document.getElementById("preset");
  var input = document.getElementById("q");
  var notesBtn = document.getElementById("notes-toggle");
  var countEl = document.getElementById("count");
  var out = document.getElementById("pick-out");
  var emptyEl = document.getElementById("pick-empty");
  var errorEl = document.getElementById("pick-error");

  var DEFAULT = [];
  var primary = "";
  var db = null;
  var state = { tools: [], q: "", notes: false };

  function el(tag, cls, txt) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (txt !== undefined && txt !== null) n.textContent = txt;
    return n;
  }

  function srOnly(txt) { return el("span", "sr-only", txt); }

  function safeHref(url) { return /^https:\/\//.test(url || "") ? url : "#"; }

  // --- State and URL -----------------------------------------------------
  function cleanTools(list) {
    var seen = {};
    seen[primary] = true;
    var ids = [];
    list.forEach(function (raw) {
      var id = String(raw).trim();
      if (id && !seen[id] && db.tools[id]) { seen[id] = true; ids.push(id); }
    });
    return ids;
  }

  function readUrl() {
    var p = new URLSearchParams(window.location.search);
    var picked = null;
    if (p.has("tools")) {
      picked = p.get("tools").split(",");
    } else {
      try {
        var saved = localStorage.getItem("pickTools");
        if (saved !== null) picked = saved.split(",");
      } catch (e) {}
    }
    state.tools = cleanTools(picked || DEFAULT);
    state.q = (p.get("q") || "").trim();
    state.notes = p.get("notes") === "1";
  }

  function writeUrl() {
    var p = new URLSearchParams();
    p.set("tools", state.tools.join(","));
    if (state.q) p.set("q", state.q);
    if (state.notes) p.set("notes", "1");
    try {
      history.replaceState(null, "", window.location.pathname + "?" + p.toString() + window.location.hash);
    } catch (e) {}
    try { localStorage.setItem("pickTools", state.tools.join(",")); } catch (e) {}
  }

  // --- Picker: chips with x, and the Add tool list ------------------------
  function toolName(id) { return db.tools[id].name; }

  function renderPicker() {
    chipsEl.textContent = "";

    var first = el("button", "chip chip-tool chip-primary", toolName(primary));
    first.type = "button";
    first.disabled = true;
    first.setAttribute("data-tool", primary);
    first.setAttribute("aria-pressed", "true");
    first.setAttribute("aria-label", toolName(primary) + " is always shown");
    chipsEl.appendChild(first);

    state.tools.forEach(function (id) {
      var b = el("button", "chip chip-tool", toolName(id));
      b.type = "button";
      b.setAttribute("data-tool", id);
      b.setAttribute("aria-pressed", "true");
      b.setAttribute("aria-label", "Remove " + toolName(id));
      b.title = "Remove this tool";
      chipsEl.appendChild(b);
    });

    addList.textContent = "";
    var filter = el("input", "add-filter");
    filter.type = "search";
    filter.placeholder = "Filter tools";
    filter.setAttribute("aria-label", "Filter tools to add");
    filter.autocomplete = "off";
    addList.appendChild(filter);

    var items = [];
    Object.keys(db.tools).forEach(function (id) {
      if (id === primary || state.tools.indexOf(id) !== -1) return;
      var t = db.tools[id];
      var b = el("button", "add-item");
      b.type = "button";
      b.setAttribute("data-add", id);
      b.appendChild(el("span", null, t.name));
      b.appendChild(el("small", null, t.tagline));
      b.setAttribute("data-text", (t.name + " " + t.tagline).toLowerCase());
      addList.appendChild(b);
      items.push(b);
    });
    if (!items.length) addList.appendChild(el("p", "add-hint", "Every tool is picked."));

    filter.addEventListener("input", function () {
      var q = filter.value.trim().toLowerCase();
      items.forEach(function (b) { b.hidden = q !== "" && b.getAttribute("data-text").indexOf(q) === -1; });
    });
  }

  // --- Cells: the same markup the static pages use ------------------------
  function cmdEl(cmd) {
    var wrap = el("div", "cmd");
    wrap.setAttribute("data-copy", cmd);
    var code = el("code");
    code.title = "Click to copy";
    var words = cmd.split(" ");
    words.forEach(function (w, i) {
      code.appendChild(el("span", "tok", w));
      if (i < words.length - 1) code.appendChild(document.createTextNode(" "));
    });
    wrap.appendChild(code);
    return wrap;
  }

  function cellEl(cell, toolLabel, taskLabel, noteId) {
    var status = cell.status || "match";
    var box = el("div", "cell cell-" + status);
    if (status === "partial") box.appendChild(srOnly("Different job, closest command. "));

    if (status === "none") {
      box.appendChild(el("span", "cell-empty sr-only", "No equivalent"));
    } else if (status === "na") {
      box.appendChild(el("span", "cell-empty sr-only", "Not needed"));
    } else {
      var cmds = Array.isArray(cell.cmd) ? cell.cmd : (cell.cmd ? [cell.cmd] : []);
      cmds.forEach(function (c) { box.appendChild(cmdEl(String(c))); });
    }

    if (cell.note) {
      var np = el("p", "cell-note", cell.note);
      np.id = noteId;
      box.appendChild(np);
    }

    var links = el("div", "cell-links");
    var a = el("a", "cell-src", "\u2197\uFE0E");
    a.href = safeHref(cell.source);
    a.target = "_blank";
    a.rel = "noopener";
    a.title = "Open the source";
    a.appendChild(srOnly(" Source for " + toolLabel + ": " + taskLabel));
    links.appendChild(a);
    if (cell.note) {
      var nb = el("button", "note-btn", "i");
      nb.type = "button";
      nb.title = "Show the note";
      nb.setAttribute("aria-expanded", String(state.notes));
      nb.setAttribute("aria-controls", noteId);
      nb.appendChild(srOnly(" Note for " + toolLabel + ": " + taskLabel));
      links.appendChild(nb);
    }
    box.appendChild(links);
    return box;
  }

  function tabHref(tab) {
    return base + (tab.id === "overview" ? "/" : "/" + tab.id + "/");
  }

  function buildSection(tab, cols, tasks) {
    var sec = el("section", "pick-section");
    var h = el("h2", "pick-heading");
    var link = el("a", null, tab.title);
    link.href = tabHref(tab);
    h.appendChild(link);
    sec.appendChild(h);

    var wrap = el("div", "table-wrap");
    wrap.setAttribute("data-cols", String(cols.length));
    var table = el("table", "compare" + (state.notes ? " show-notes" : ""));
    table.style.setProperty("--cols", String(cols.length));

    var thead = el("thead");
    var hr = el("tr");
    var th0 = el("th", "col-task", "Task");
    th0.scope = "col";
    hr.appendChild(th0);
    cols.forEach(function (id) {
      var t = db.tools[id];
      var th = el("th", "col-tool" + (id === primary ? " col-primary" : ""));
      th.scope = "col";
      th.setAttribute("data-tool", id);
      var a = el("a", null, t.name);
      a.href = safeHref(t.docs);
      a.target = "_blank";
      a.rel = "noopener";
      th.appendChild(a);
      th.appendChild(el("span", "th-tag", t.tagline));
      hr.appendChild(th);
    });
    thead.appendChild(hr);
    table.appendChild(thead);

    var tbody = el("tbody");
    tasks.forEach(function (task) {
      var tr = el("tr");
      var rh = el("th", "cell-task");
      rh.scope = "row";
      rh.appendChild(el("span", "cell-task-name", task.task));
      tr.appendChild(rh);
      cols.forEach(function (id) {
        var td = el("td", "col-tool" + (id === primary ? " col-primary" : ""));
        td.setAttribute("data-tool", id);
        td.setAttribute("data-label", toolName(id));
        var cell = task.cells[id];
        if (cell && typeof cell === "object") {
          td.appendChild(cellEl(cell, toolName(id), task.task, "note-pick-" + tab.id + "-" + task.id + "-" + id));
        }
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
    sec.appendChild(wrap);
    return sec;
  }

  function haystack(task, cols) {
    var parts = [task.task, task.keywords || ""];
    cols.forEach(function (id) {
      var c = task.cells[id];
      parts.push(toolName(id));
      if (c && typeof c === "object") {
        parts.push([].concat(c.cmd || []).join(" "), c.note || "", c.status === "none" ? "none" : "");
      }
    });
    return parts.join(" ").toLowerCase().replace(/\s+/g, " ");
  }

  // --- Draw the tables ----------------------------------------------------
  function renderTables() {
    out.textContent = "";
    var terms = state.q.toLowerCase().split(/\s+/).filter(Boolean);
    var sections = 0;
    var rowsShown = 0;

    db.tabs.forEach(function (tab) {
      var cols = [primary].concat(state.tools.filter(function (id) { return tab.tools.indexOf(id) !== -1; }));
      if (cols.length < 2) return;
      var data = db.compare[tab.id];
      if (!data) return;
      var tasks = data.tasks.filter(function (task) {
        var hay = haystack(task, cols);
        return terms.every(function (t) { return hay.indexOf(t) !== -1; });
      });
      if (!tasks.length) return;
      sections += 1;
      rowsShown += tasks.length;
      out.appendChild(buildSection(tab, cols, tasks));
    });

    notesBtn.setAttribute("aria-pressed", String(state.notes));
    countEl.textContent = state.tools.length
      ? rowsShown + " tasks in " + sections + (sections === 1 ? " tab" : " tabs")
      : "";

    if (!state.tools.length) {
      emptyEl.textContent = "Add a tool besides " + toolName(primary) + " to see it here.";
      emptyEl.hidden = false;
    } else if (!sections) {
      emptyEl.textContent = "No task matches. Try a shorter search.";
      emptyEl.hidden = false;
    } else {
      emptyEl.hidden = true;
    }
  }

  function changed() {
    renderPicker();
    renderTables();
    writeUrl();
  }

  // --- Events ---------------------------------------------------------------
  function bind() {
    chipsEl.addEventListener("click", function (e) {
      var chip = e.target.closest(".chip");
      if (!chip || chip.disabled) return;
      var id = chip.getAttribute("data-tool");
      state.tools = state.tools.filter(function (t) { return t !== id; });
      changed();
    });

    addList.addEventListener("click", function (e) {
      var b = e.target.closest(".add-item");
      if (!b) return;
      state.tools = cleanTools(state.tools.concat(b.getAttribute("data-add")));
      addMenu.removeAttribute("open");
      changed();
    });

    preset.addEventListener("change", function () {
      var tab = db.tabs.filter(function (t) { return t.id === preset.value; })[0];
      preset.value = "";
      if (!tab) return;
      state.tools = cleanTools(tab.tools);
      changed();
    });

    input.addEventListener("input", function () {
      state.q = input.value.trim();
      renderTables();
      writeUrl();
    });

    notesBtn.addEventListener("click", function () {
      state.notes = !state.notes;
      renderTables();
      writeUrl();
    });

    document.addEventListener("keydown", function (e) {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      var tag = (e.target.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select" || e.target.isContentEditable) return;
      e.preventDefault();
      input.focus();
    });
  }

  function init(data) {
    db = data;
    primary = data.primary;
    DEFAULT = (data.pick_default && data.pick_default.length)
      ? data.pick_default
      : Object.keys(db.tools).filter(function (id) { return id !== primary; }).slice(0, 3);
    readUrl();
    input.value = state.q;
    toolbar.hidden = false;
    bind();
    renderPicker();
    renderTables();
    writeUrl();
  }

  fetch(src)
    .then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    })
    .then(init)
    .catch(function () { errorEl.hidden = false; });
})();
