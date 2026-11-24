// The GitHub session for every page. The org bar (flisk.si/assets/bar.js) draws the profile icon and the Sign in / Log out menu;
// this file only keeps the session and hands the bar the login. publish.flisk.si does the sign-in and sends the visitor
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

  function mount() {
    var login = readSession();
    if (login) {
      // The bar reads the login from the element's whole text, so the span holds nothing else.
      var el = document.createElement("span");
      el.setAttribute("data-flisk-login", "");
      el.hidden = true;
      el.textContent = login;
      document.body.appendChild(el);
    }
    // The bar's Log out dispatches this event. Nothing signs out until it fires.
    document.addEventListener("flisk:signout", function () {
      try { sessionStorage.removeItem(KEY); } catch (e) {}
      location.reload();
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
