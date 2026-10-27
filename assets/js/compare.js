/* Shared behavior (theme, copy buttons, note buttons, menus) and the filters on a tab page.
   The table is plain HTML, so a tab still reads fine without this script. Storage and
   clipboard can fail; both are guarded. The pick page (pick.js) reuses the shared parts. */
(function () {
  "use strict";

  var root = document.documentElement;
  root.classList.add("js");
  // The tool that is always shown first (set in _data/meta.yml).
  var primary = document.body.getAttribute("data-primary") || "";

  // --- Theme -------------------------------------------------------------
  var themeBtn = document.getElementById("theme-toggle");
  var media = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;

  function currentTheme() {
    var set = root.getAttribute("data-theme");
    if (set === "light" || set === "dark") return set;
    return media && media.matches ? "dark" : "light";
  }

  function paintThemeButton() {
    if (!themeBtn) return;
    var next = currentTheme() === "dark" ? "light" : "dark";
    themeBtn.textContent = next === "light" ? "Light mode" : "Dark mode";
    themeBtn.setAttribute("aria-label", "Switch to " + next + " mode");
  }

  if (themeBtn) {
    themeBtn.addEventListener("click", function () {
      var next = currentTheme() === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      try { localStorage.setItem("theme", next); } catch (e) {}
      paintThemeButton();
    });
    if (media && media.addEventListener) media.addEventListener("change", paintThemeButton);
    paintThemeButton();
  }

  // --- Tabs: keep the current tab visible when the bar scrolls sideways -----
  var tabBar = document.querySelector(".tabs");
  var tabNow = tabBar && tabBar.querySelector('[aria-current="page"]');
  if (tabNow) {
    tabBar.scrollLeft = Math.max(0, tabNow.offsetLeft - (tabBar.clientWidth - tabNow.offsetWidth) / 2);
  }

  // --- Shared click handlers: they also cover cells that pick.js draws later ---
  function fallbackCopy(value) {
    var ta = document.createElement("textarea");
    ta.value = value;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand("copy"); } catch (e) {}
    document.body.removeChild(ta);
    return ok;
  }

  // A polite live region tells screen readers a copy happened.
  var live = document.createElement("div");
  live.className = "sr-only";
  live.setAttribute("role", "status");
  document.body.appendChild(live);

  function copied(box, ok, value) {
    box.classList.add("copied");
    live.textContent = ok ? "Copied " + value : "Could not copy. Select the text and press Ctrl+C.";
    window.setTimeout(function () { box.classList.remove("copied"); }, 1200);
  }

  document.addEventListener("click", function (e) {
    // Click a command to copy it. Dragging to select text must not trigger a copy.
    var box = e.target.closest ? e.target.closest(".cmd") : null;
    if (box) {
      var picked = window.getSelection ? String(window.getSelection()) : "";
      if (picked) return;
      var value = box.getAttribute("data-copy") || "";
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(value).then(
          function () { copied(box, true, value); },
          function () { copied(box, fallbackCopy(value), value); }
        );
      } else {
        copied(box, fallbackCopy(value), value);
      }
      return;
    }

    // A cell's own Note button opens just that cell's note.
    var note = e.target.closest ? e.target.closest(".note-btn") : null;
    if (note) {
      var cell = note.closest(".cell");
      var open = cell.classList.toggle("open");
      note.setAttribute("aria-expanded", String(open));
      return;
    }

    // Close the Add tool menu when you click anywhere else.
    Array.prototype.forEach.call(document.querySelectorAll("details.add-menu[open]"), function (d) {
      if (!d.contains(e.target)) d.removeAttribute("open");
    });
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      Array.prototype.forEach.call(document.querySelectorAll("details.add-menu[open]"), function (d) {
        d.removeAttribute("open");
        var s = d.querySelector("summary");
        if (s) s.focus();
      });
    }
  });

  // --- Add tool menu: keep the list inside the window ---------------------
  // The chip can sit far to the right, so the list is placed against the window, not the chip.
  function placeAddList(details) {
    var list = details.querySelector(".add-list");
    var summary = details.querySelector("summary");
    if (!list || !summary) return;
    var gap = 8;
    var vw = document.documentElement.clientWidth;
    var vh = window.innerHeight;
    var width = Math.min(576, vw - gap * 2);
    var r = summary.getBoundingClientRect();
    var left = Math.min(Math.max(gap, r.left), vw - width - gap);
    var top = r.bottom + 6;
    list.style.width = width + "px";
    list.style.left = left + "px";
    list.style.top = top + "px";
    list.style.maxHeight = Math.max(160, vh - top - gap) + "px";
  }

  document.addEventListener("toggle", function (e) {
    var d = e.target;
    if (d && d.matches && d.matches("details.add-menu") && d.open) placeAddList(d);
  }, true);

  window.addEventListener("resize", function () {
    Array.prototype.forEach.call(document.querySelectorAll("details.add-menu[open]"), placeAddList);
  });

  // --- Filters on a tab page ---------------------------------------------
  var table = document.getElementById("comparison");
  if (!table) return;

  var rows = Array.prototype.slice.call(table.querySelectorAll("tbody tr"));
  var input = document.getElementById("q");
  var toolBox = document.getElementById("tools-toggle");
  var notesBtn = document.getElementById("notes-toggle");
  var countEl = document.getElementById("count");
  var emptyEl = document.getElementById("empty");

  Array.prototype.forEach.call(document.querySelectorAll(".js-only"), function (el) {
    el.hidden = el.id === "empty" ? el.hidden : false;
  });

  function text(el) { return el ? el.textContent : ""; }

  // Search text per row: the task, its keywords, and each tool's command and note.
  var haystack = rows.map(function (row) {
    var parts = [text(row.querySelector(".cell-task-name")), row.getAttribute("data-keywords") || ""];
    Array.prototype.forEach.call(row.querySelectorAll("td"), function (td) {
      parts.push(td.getAttribute("data-label") || "");
      Array.prototype.forEach.call(td.querySelectorAll("code, .cell-note, .cell-empty"), function (n) {
        parts.push(n.textContent);
      });
    });
    return parts.join(" ").toLowerCase().replace(/\s+/g, " ");
  });

  var state = { q: "", off: {}, notes: false };

  function readUrl() {
    try {
      var p = new URLSearchParams(window.location.search);
      state.q = (p.get("q") || "").trim();
      state.notes = p.get("notes") === "1";
      (p.get("hide") || "").split(",").forEach(function (id) {
        if (id && id !== primary) state.off[id] = true;
      });
    } catch (e) {}
  }

  function writeUrl() {
    try {
      var p = new URLSearchParams();
      if (state.q) p.set("q", state.q);
      var hidden = Object.keys(state.off).filter(function (k) { return state.off[k]; });
      if (hidden.length) p.set("hide", hidden.join(","));
      if (state.notes) p.set("notes", "1");
      var qs = p.toString();
      history.replaceState(null, "", window.location.pathname + (qs ? "?" + qs : "") + window.location.hash);
    } catch (e) {}
  }

  function apply() {
    var terms = state.q.toLowerCase().split(/\s+/).filter(Boolean);
    var shown = 0;

    rows.forEach(function (row, i) {
      var hay = haystack[i];
      var visible = terms.every(function (t) { return hay.indexOf(t) !== -1; });
      row.hidden = !visible;
      if (visible) shown += 1;
    });

    Array.prototype.forEach.call(table.querySelectorAll("[data-tool]"), function (cell) {
      cell.hidden = !!state.off[cell.getAttribute("data-tool")];
    });

    table.classList.toggle("show-notes", state.notes);
    Array.prototype.forEach.call(table.querySelectorAll(".note-btn"), function (b) {
      b.setAttribute("aria-expanded", String(state.notes || b.closest(".cell").classList.contains("open")));
    });
    if (notesBtn) notesBtn.setAttribute("aria-pressed", String(state.notes));
    if (countEl) countEl.textContent = shown + " of " + rows.length + " tasks";
    if (emptyEl) emptyEl.hidden = shown !== 0;
    table.hidden = shown === 0;
  }

  // Each tool chip is a switch: x removes the column, + brings it back.
  function paintChips() {
    if (!toolBox) return;
    Array.prototype.forEach.call(toolBox.querySelectorAll(".chip[data-tool]"), function (chip) {
      var id = chip.getAttribute("data-tool");
      if (id === primary) return;
      var on = !state.off[id];
      var name = chip.getAttribute("data-name") || chip.textContent;
      chip.setAttribute("aria-pressed", String(on));
      chip.setAttribute("aria-label", (on ? "Remove " : "Show ") + name + " column");
      chip.title = on ? "Remove this column" : "Show this column";
    });
  }

  if (input) {
    input.addEventListener("input", function () {
      state.q = input.value.trim();
      apply();
      writeUrl();
    });
  }

  if (toolBox) {
    toolBox.addEventListener("click", function (e) {
      var chip = e.target.closest(".chip");
      if (!chip || chip.disabled) return;
      var id = chip.getAttribute("data-tool");
      state.off[id] = !state.off[id];
      paintChips();
      apply();
      writeUrl();
    });
  }

  if (notesBtn) {
    notesBtn.addEventListener("click", function () {
      state.notes = !state.notes;
      apply();
      writeUrl();
    });
  }

  document.addEventListener("keydown", function (e) {
    if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey || !input) return;
    var tag = (e.target.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select" || e.target.isContentEditable) return;
    e.preventDefault();
    input.focus();
  });

  readUrl();
  if (input) input.value = state.q;
  paintChips();
  apply();
})();
