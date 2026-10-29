// The Sign in with GitHub button in the header, on every page. publish.flisk.si does the sign-in and sends the visitor
// back with #gh=<session>, a signed one-hour session that holds only their GitHub login. It is kept for this tab
// (sessionStorage) and taken out of the address bar. app.js reads the same session to publish under the login.
(function () {
  "use strict";
  var API = "https://publish.flisk.si";
  var KEY = "roadmap-gh";
  var HANDLE = /^[a-z0-9](?:[a-z0-9-]{0,38})$/;

  function readSession() {
    var token = "";
    var m = /^#gh=(gh1\.[\w-]+\.[\w-]+)$/.exec(location.hash);
    if (m) {
      token = m[1];
      try { sessionStorage.setItem(KEY, token); } catch (e) {}
      try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {}
    } else {
      try { token = sessionStorage.getItem(KEY) || ""; } catch (e) { token = ""; }
    }
    try {
      var payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
      if (HANDLE.test(payload.login) && payload.exp > Date.now() / 1000) return payload.login;
    } catch (e) {}
    try { sessionStorage.removeItem(KEY); } catch (e) {}
    return "";
  }

  var ICON = '<svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"/></svg>';

  function mount() {
    var nav = document.querySelector(".site-header .nav");
    if (!nav) return;
    var login = readSession();
    var el;
    if (login) {
      // Signed in: the name opens a small menu. Nothing signs out until "Sign out" is clicked.
      el = document.createElement("details");
      el.className = "gh-menu";
      el.id = "gh-btn";
      var cv = "https://pages.flisk.si/@" + login + "/cv/";
      el.innerHTML = '<summary class="gh-btn on" title="Signed in with GitHub as @' + login + '">' + ICON + "<span>@" + login + '</span><i aria-hidden="true">&#9662;</i></summary>' +
        '<div class="gh-pop" role="menu">' +
        '<a role="menuitem" href="' + cv + '" rel="noopener">My CV <small>pages.flisk.si/@' + login + '/cv</small></a>' +
        '<a role="menuitem" href="' + location.origin + '/portfolio/">My portfolio</a>' +
        '<a role="menuitem" href="https://github.com/' + login + '" rel="noopener">My GitHub profile</a>' +
        '<button type="button" role="menuitem" id="gh-out">Sign out</button></div>';
      el.querySelector("#gh-out").addEventListener("click", function () {
        try { sessionStorage.removeItem(KEY); } catch (e) {}
        location.reload();
      });
      document.addEventListener("click", function (e) { if (!el.contains(e.target)) el.removeAttribute("open"); });
      document.addEventListener("keydown", function (e) { if (e.key === "Escape") el.removeAttribute("open"); });
    } else {
      el = document.createElement("a");
      el.className = "gh-btn";
      el.id = "gh-btn";
      el.href = API + "/auth/github?return=" + encodeURIComponent(location.origin + location.pathname + location.search);
      el.innerHTML = ICON + "<span>Sign in with GitHub</span>";
      el.title = "Optional. We only read your public GitHub login.";
    }
    nav.insertBefore(el, nav.firstChild);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
