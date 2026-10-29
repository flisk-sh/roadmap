// Run with: node --test scripts/scan.test.mjs   (or: bun test scripts/scan.test.mjs)
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";

const scan = createRequire(import.meta.url)("../assets/js/scan.js");

test("file names point to the tools a repo uses", () => {
  const ids = scan.detect([
    "docker-compose.yml", "services/api/Dockerfile", ".github/workflows/ci.yml", "infra/main.tf", "charts/app/Chart.yaml",
    "pnpm-lock.yaml", "CLAUDE.md", ".cursor/rules/a.mdc", "Tiltfile", "src/index.ts"
  ]);
  for (const id of ["docker-compose", "docker-engine", "github-actions", "terraform", "helm", "pnpm", "claude-code", "cursor", "tilt"])
    assert.ok(ids.includes(id), id);
  assert.ok(!ids.includes("npm"));
});

test("a workflow file only counts at the top .github/workflows", () => {
  assert.ok(!scan.detect(["vendor/.github/workflows/x.yml"]).includes("github-actions"));
});

test("package.json dependencies and packageManager count, junk is ignored", () => {
  const pkg = JSON.stringify({ packageManager: "bun@1.4.3", dependencies: { hono: "^4", ai: "^5" }, devDependencies: { vite: "^7", "left-pad": "1" } });
  const ids = scan.detect([], { packageJson: pkg });
  for (const id of ["bun", "hono", "vite", "vercel-ai-sdk"]) assert.ok(ids.includes(id), id);
  assert.deepEqual(scan.detect([], { packageJson: "{not json" }), []);
});

test("Python dependency lists count, from requirements and pyproject", () => {
  const ids = scan.detect([], { requirements: "fastapi==0.1\nSQLAlchemy>=2\n# django\n", pyproject: '[tool.poetry]\ndependencies = ["langgraph>=0.2", "crewai"]' });
  for (const id of ["fastapi", "sqlalchemy", "langgraph", "crewai", "poetry"]) assert.ok(ids.includes(id), id);
  assert.ok(!ids.includes("django"));
});

test("levels are used or use-often, never expert", () => {
  assert.equal(scan.suggestLevel(1), 1);
  assert.equal(scan.suggestLevel(2), 2);
  assert.equal(scan.suggestLevel(9), 2);
});

test("scanUser skips forks and archived repos and tallies tools per repo", async () => {
  const repos = [
    { name: "a", full_name: "u/a", default_branch: "main" },
    { name: "b", full_name: "u/b", default_branch: "main" },
    { name: "f", full_name: "u/f", default_branch: "main", fork: true },
    { name: "z", full_name: "u/z", default_branch: "main", archived: true }
  ];
  const seen = [];
  const io = {
    json: async (url) => {
      seen.push(url);
      if (url.includes("/repos?")) return repos;
      return { tree: [{ path: "docker-compose.yml" }, ...(url.includes("/u/a/") ? [{ path: "Tiltfile" }] : [])] };
    },
    text: async () => ""
  };
  const out = await scan.scanUser("u", io);
  assert.deepEqual(out.repos, ["a", "b"]);
  assert.deepEqual(out.tools["docker-compose"], ["a", "b"]);
  assert.deepEqual(out.tools.tilt, ["a"]);
  assert.ok(!seen.some((u) => u.includes("/u/f/") || u.includes("/u/z/")));
});
