// Run with: node --test scripts/rolefit.test.mjs   (or: bun test scripts/rolefit.test.mjs)
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { test } from "node:test";

const fit = createRequire(import.meta.url)("../assets/js/rolefit.js");

// The real roles and tool ids, read with Ruby like the rest of the data checks.
const data = JSON.parse(execFileSync("ruby", ["-ryaml", "-rjson", "-e", `
  ids = Dir["_data/tools/*.yml"].flat_map { |f| YAML.load_file(f).map { |t| t["id"] } }
  puts JSON.dump(roles: YAML.load_file("_data/roles.yml")["roles"], ids: ids)
`], { cwd: new URL("..", import.meta.url), encoding: "utf8" }));
const known = new Set(data.ids);
const me = (s) => Object.fromEntries(s.split(",").map((x) => [x.slice(0, -1), +x.slice(-1)]));
const best = (ratings) => fit.score(data.roles, ratings, (id) => known.has(id)).map((x) => x.r.id);

test("must have counts 3, every day 2, good to know 1, times the level", () => {
  const roles = [{ id: "a", core: ["x"], daily: ["y"], nice: ["z"], key: ["x"] }];
  assert.equal(fit.score(roles, { x: 3, y: 3, z: 3 })[0].pct, 100);
  assert.equal(fit.score(roles, { x: 3 })[0].pct, 50);
  assert.equal(fit.score(roles, { x: 1 })[0].pct, 17);
});

test("rating none of a role's key tools halves its match", () => {
  const roles = [{ id: "a", core: ["x", "y"], key: ["x"] }];
  const [r] = fit.score(roles, { y: 3 });
  assert.equal(r.pct, 25);
  assert.equal(r.noKey, true);
  assert.deepEqual(r.keyGaps, ["x"]);
  assert.equal(fit.score(roles, { x: 1, y: 3 })[0].noKey, false);
});

test("tools missing from the map are left out", () => {
  const roles = [{ id: "a", core: ["x", "gone"], key: ["gone"] }];
  const [r] = fit.score(roles, { x: 3 }, (id) => id !== "gone");
  assert.equal(r.pct, 100);
  assert.equal(r.noKey, false);
});

test("an ops toolkit with no ML tools is not called MLOps", () => {
  const ops = me("argo-cd1,bundler1,dependabot1,docker-compose3,docker-desktop3,docker-engine2,github-actions3,grafana2,helm2,k9s3,kubectl2,netlify-cli2,nextjs1,nodemon1,npm2,nvm1,opentelemetry1,pnpm2,prometheus2,renovate1,sequelize1,terraform2,tilt1,vault1,webpack2,yarn2");
  const top = best(ops);
  assert.ok(["devops-engineer", "sre"].includes(top[0]), top[0]);
  assert.ok(top.indexOf("mlops-engineer") > 5, "mlops at " + top.indexOf("mlops-engineer"));
});

test("each kind of toolkit still lands on its own role", () => {
  assert.equal(best(me("kubernetes3,vllm3,docker-engine2,terraform2,github-actions2,helm2,prometheus2,grafana2,langfuse1"))[0], "mlops-engineer");
  assert.equal(best(me("uv3,conda2,vllm2,fastapi3,ollama2,docker-desktop2,github-actions1"))[0], "ml-engineer");
  assert.equal(best(me("vite3,pnpm3,nextjs3,npm2,vitest2,msw2,github-actions2"))[0], "frontend-engineer");
  assert.equal(best(me("docker-desktop3,docker-compose3,testcontainers2,flyway2,github-actions2,sentry1"))[0], "backend-engineer");
  assert.equal(best(me("kubectl3,helm3,k9s3,argo-cd2,kustomize2,docker-desktop2"))[0], "kubernetes-engineer");
  assert.equal(best(me("langgraph3,model-context-protocol3,langfuse2,ollama2,docker-compose2,claude-code3"))[0], "ai-agent-engineer");
});

test("every role names key tools from its own loadout", () => {
  for (const r of data.roles) {
    const loadout = [...(r.core || []), ...(r.daily || []), ...(r.nice || [])];
    assert.ok((r.key || []).length, r.id);
    for (const id of r.key) assert.ok(loadout.includes(id), `${r.id}: ${id}`);
  }
});
