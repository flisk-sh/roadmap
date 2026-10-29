// How well a set of ratings fits each role on the Roles tab. Pure: the page passes the roles, the ratings
// ({ toolId: 1..3 }) and which tool ids exist on the map. pages.flisk.si applies the same rule to the CV.
(function (root) {
  "use strict";

  var TIERS = [["core", 3], ["daily", 2], ["nice", 1]];

  // A must-have tool counts 3, an every-day tool 2, a good-to-know tool 1, each times your level out of 3.
  // Many roles share the same generic tools (GitHub Actions, Docker, Terraform), so those alone do not make
  // you that role: each role names its key tools, the ones that set it apart. Rate none of them and the
  // match is halved, so an ops toolkit is not called MLOps just because MLOps also runs on Terraform.
  function score(roles, me, known) {
    var has = function (id) { return !known || known(id); };
    return (roles || []).map(function (r) {
      var got = 0, max = 0, gaps = [];
      TIERS.forEach(function (k) {
        (r[k[0]] || []).forEach(function (id) {
          if (!has(id)) return;
          max += k[1] * 3;
          got += k[1] * (me[id] || 0);
          if (k[0] === "core" && !me[id]) gaps.push(id);
        });
      });
      var keys = (r.key || []).filter(has);
      var keyGot = keys.reduce(function (a, id) { return a + (me[id] || 0); }, 0);
      var noKey = keys.length > 0 && keyGot === 0;
      var pct = max ? Math.round((got / max) * 100 * (noKey ? 0.5 : 1)) : 0;
      return {
        r: r, pct: pct, gaps: gaps, keyGot: keyGot, noKey: noKey,
        keyGaps: keys.filter(function (id) { return !me[id]; })
      };
    }).sort(function (a, b) { return b.pct - a.pct || b.keyGot - a.keyGot; });
  }

  var api = { score: score };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.RoadmapRoleFit = api;
})(typeof window !== "undefined" ? window : this);
