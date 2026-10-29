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

test("parseMe reads ?me= ratings, drops unknown tools, bad levels and junk", () => {
  const known = new Set(["bun", "helm", "argo-cd", "aws-cdk"]);
  const has = (id) => known.has(id);
  assert.deepEqual(scan.parseMe("bun3,helm2,argo-cd1,aws-cdk2", has), { bun: 3, helm: 2, "argo-cd": 1, "aws-cdk": 2 });
  assert.deepEqual(scan.parseMe("bun3,nope2,helm9,helm0,,<b>1", has), { bun: 3 });
  assert.deepEqual(scan.parseMe("", has), {});
  assert.deepEqual(scan.parseMe(null, has), {});
  assert.deepEqual(scan.parseMe("nope2"), { nope: 2 }); // no filter: every well-formed pair
});

test("the real shared link from the radar parses fully (95 tools)", () => {
  const me = "argo-cd1,aws-cdk2,aws-sam2,backstage3,bun3,cdktf1,circleci1,claude-code2,cline2,cloudflare-tunnel2,cloudformation3,codespaces1,codex3,colima1,composer1,create-t3-app1,create-vite1,cursor3,deno1,dependabot3,dev-containers1,devin3,docker-compose3,docker-desktop2,docker-engine2,docker-mcp-toolkit1,esbuild1,firebase-studio1,flisk3,gemini-cli2,github-actions3,github-copilot3,gitlab-ci2,helm2,homebrew1,hono2,jenkins1,k3s1,k9s3,kiro1,kubectl2,kubernetes3,kubernetes-dashboard1,langchain1,langgraph1,lima2,mcp-registry3,minikube1,model-context-protocol2,neon1,nestjs2,netlify-cli2,nextjs1,ngrok1,nodemon3,npm3,nvm3,nx1,ollama1,opencode3,opentelemetry1,orbstack2,pact1,playwright-mcp1,pm21,pnpm2,podman3,podman-desktop1,portainer1,prisma3,pulumi1,react-router2,replit1,roo-code2,sentry1,sequelize2,serverless-framework3,signoz1,skills-sh2,stackblitz1,supabase-cli1,swc1,terraform3,terragrunt3,tilt3,turbopack1,typeorm2,vercel-cli1,vite1,webpack2,windsurf3,wrangler2,yarn3,yeoman3,zed1";
  const got = scan.parseMe(me);
  assert.equal(Object.keys(got).length, 95);
  assert.equal(got["pm2"], 1);
  assert.equal(got["argo-cd"], 1);
  assert.equal(got["kubernetes"], 3);
});
