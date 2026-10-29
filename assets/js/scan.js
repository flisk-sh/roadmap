// Reads a GitHub user's public repos and suggests tools to rate. Nothing is run or cloned: it looks at the file
// names in each repo's tree and at the dependency lists in package.json, pyproject.toml and requirements.txt.
// Pure rules live in RoadmapScan.detect(); the network part is RoadmapScan.scanUser(). The page decides which
// ids exist on the map and what the person keeps.
(function (root) {
  "use strict";

  // path pattern -> tool id (matched against every path in a repo's file tree)
  var PATHS = [
    [/(^|\/)(docker-)?compose(\.[\w-]+)?\.ya?ml$/i, "docker-compose"],
    [/(^|\/)(Dockerfile|Containerfile)(\.[\w.-]+)?$/, "docker-engine"],
    [/(^|\/)\.devcontainer(\/|\.json$)/, "dev-containers"],
    [/^\.github\/workflows\/[^/]+\.ya?ml$/, "github-actions"],
    [/(^|\/)\.gitlab-ci\.ya?ml$/, "gitlab-ci"],
    [/^\.circleci\//, "circleci"],
    [/(^|\/)Jenkinsfile$/, "jenkins"],
    [/\.tf$/, "terraform"],
    [/(^|\/)Pulumi\.ya?ml$/, "pulumi"],
    [/(^|\/)Chart\.ya?ml$/, "helm"],
    [/(^|\/)kustomization\.ya?ml$/, "kustomize"],
    [/(^|\/)Tiltfile$/, "tilt"],
    [/(^|\/)skaffold\.ya?ml$/, "skaffold"],
    [/(^|\/)ansible\.cfg$/, "ansible"],
    [/(^|\/)Pipfile$/, "pipenv"],
    [/(^|\/)pnpm-lock\.yaml$/, "pnpm"],
    [/(^|\/)yarn\.lock$/, "yarn"],
    [/(^|\/)package-lock\.json$/, "npm"],
    [/(^|\/)bun\.lockb?$/, "bun"],
    [/(^|\/)deno\.jsonc?$/, "deno"],
    [/(^|\/)uv\.lock$/, "uv"],
    [/(^|\/)poetry\.lock$/, "poetry"],
    [/(^|\/)pdm\.lock$/, "pdm"],
    [/(^|\/)Cargo\.toml$/, "cargo"],
    [/(^|\/)go\.mod$/, "go-modules"],
    [/(^|\/)pom\.xml$/, "maven"],
    [/(^|\/)build\.gradle(\.kts)?$/, "gradle"],
    [/(^|\/)composer\.json$/, "composer"],
    [/(^|\/)Gemfile$/, "bundler"],
    [/\.csproj$/, "nuget"],
    [/(^|\/)Package\.swift$/, "swiftpm"],
    [/(^|\/)Makefile$/, "make"],
    [/(^|\/)justfile$/i, "just"],
    [/(^|\/)Taskfile\.ya?ml$/, "task"],
    [/(^|\/)(BUILD\.bazel|WORKSPACE(\.bazel)?|MODULE\.bazel)$/, "bazel"],
    [/(^|\/)nx\.json$/, "nx"],
    [/(^|\/)turbo\.jsonc?$/, "turborepo"],
    [/(^|\/)lerna\.json$/, "lerna"],
    [/(^|\/)\.changeset\//, "changesets"],
    [/(^|\/)vite\.config\.[cm]?[jt]s$/, "vite"],
    [/(^|\/)webpack\.config\.[cm]?[jt]s$/, "webpack"],
    [/(^|\/)rollup\.config\.[cm]?[jt]s$/, "rollup"],
    [/(^|\/)astro\.config\.[cm]?[jt]s$/, "astro"],
    [/(^|\/)next\.config\.[cm]?[jt]s$/, "nextjs"],
    [/(^|\/)(mise\.toml|\.mise\.toml)$/, "mise"],
    [/(^|\/)\.tool-versions$/, "asdf"],
    [/(^|\/)\.nvmrc$/, "nvm"],
    [/(^|\/)\.envrc$/, "direnv"],
    [/(^|\/)flake\.nix$/, "nix"],
    [/(^|\/)devbox\.json$/, "devbox"],
    [/(^|\/)(renovate\.json5?|\.renovaterc(\.json)?)$/, "renovate"],
    [/^\.github\/dependabot\.ya?ml$/, "dependabot"],
    [/(^|\/)(CLAUDE\.md|\.claude\/)/, "claude-code"],
    [/(^|\/)(\.cursor\/|\.cursorrules$)/, "cursor"],
    [/^\.github\/copilot-instructions\.md$/, "github-copilot"],
    [/(^|\/)\.windsurf(\/|rules$)/, "windsurf"],
    [/(^|\/)\.clinerules/, "cline"],
    [/(^|\/)(\.aider|CONVENTIONS\.md$)/, "aider"],
    [/(^|\/)(GEMINI\.md|\.gemini\/)/, "gemini-cli"],
    [/(^|\/)prisma\/schema\.prisma$/, "prisma"],
    [/(^|\/)drizzle\.config\.[cm]?[jt]s$/, "drizzle"],
    [/(^|\/)alembic\.ini$/, "alembic"],
    [/(^|\/)flyway\.conf$/, "flyway"],
    [/(^|\/)sqlc\.ya?ml$/, "sqlc"],
    [/(^|\/)atlas\.hcl$/, "atlas"],
    [/(^|\/)wrangler\.(toml|jsonc?)$/, "wrangler"],
    [/(^|\/)vercel\.json$/, "vercel-cli"],
    [/(^|\/)netlify\.toml$/, "netlify-cli"],
    [/(^|\/)serverless\.ya?ml$/, "serverless-framework"],
    [/(^|\/)sst\.config\.[cm]?[jt]s$/, "sst"],
    [/(^|\/)process-compose\.ya?ml$/, "process-compose"],
    [/(^|\/)Procfile$/, "foreman"],
    [/(^|\/)ecosystem\.config\.[cm]?[jt]s$/, "pm2"],
    [/(^|\/)catalog-info\.ya?ml$/, "backstage"],
    [/(^|\/)\.gitleaks\.toml$/, "gitleaks"],
    [/(^|\/)playwright\.config\.[cm]?[jt]s$/, "playwright-mcp"],
    [/^\.flisk(\/|$)/, "flisk"]
  ];

  // npm package (exact name, or a scope ending in /) -> tool id
  var NPM = {
    "hono": "hono", "@nestjs/core": "nestjs", "vite": "vite", "esbuild": "esbuild", "@rspack/core": "rspack",
    "tsdown": "tsdown", "@swc/core": "swc", "react-router": "react-router", "react-router-dom": "react-router",
    "astro": "astro", "next": "nextjs", "nodemon": "nodemon", "concurrently": "concurrently", "prisma": "prisma",
    "@prisma/client": "prisma", "drizzle-orm": "drizzle", "typeorm": "typeorm", "sequelize": "sequelize",
    "kysely": "kysely", "@mikro-orm/core": "mikro-orm", "testcontainers": "testcontainers", "msw": "msw",
    "@pact-foundation/pact": "pact", "@opentelemetry/api": "opentelemetry", "@sentry/node": "sentry",
    "@sentry/browser": "sentry", "@sentry/react": "sentry", "@sentry/nextjs": "sentry", "langchain": "langchain",
    "@langchain/langgraph": "langgraph", "ai": "vercel-ai-sdk", "@mastra/core": "mastra",
    "@modelcontextprotocol/sdk": "model-context-protocol", "fastmcp": "fastmcp",
    "@anthropic-ai/claude-agent-sdk": "claude-agent-sdk", "@openai/agents": "openai-agents-sdk",
    "@google/adk": "google-adk", "llamaindex": "llamaindex", "wrangler": "wrangler", "turbo": "turborepo",
    "nx": "nx", "lerna": "lerna", "webpack": "webpack", "rollup": "rollup", "@temporalio/client": "temporal",
    "inngest": "inngest", "mailpit": "mailpit", "wiremock": "wiremock", "@playwright/test": "playwright-mcp"
  };

  // Python package -> tool id
  var PY = {
    "fastapi": "fastapi", "django": "django", "sqlalchemy": "sqlalchemy", "alembic": "alembic",
    "langchain": "langchain", "langgraph": "langgraph", "crewai": "crewai", "pydantic-ai": "pydantic-ai",
    "llama-index": "llamaindex", "dspy": "dspy", "dspy-ai": "dspy", "mcp": "model-context-protocol",
    "fastmcp": "fastmcp", "autogen": "autogen", "smolagents": "smolagents", "temporalio": "temporal",
    "testcontainers": "testcontainers", "opentelemetry-api": "opentelemetry", "sentry-sdk": "sentry",
    "langfuse": "langfuse", "promptfoo": "promptfoo", "haystack-ai": "haystack", "agno": "agno"
  };

  function addAll(set, ids) { ids.forEach(function (id) { set[id] = true; }); }

  /** The tool ids a repo's file paths and dependency files point to. */
  function detect(paths, files) {
    var found = {};
    (paths || []).forEach(function (p) {
      for (var i = 0; i < PATHS.length; i++) if (PATHS[i][0].test(p)) found[PATHS[i][1]] = true;
    });
    files = files || {};
    if (files.packageJson) {
      var pkg = null;
      try { pkg = JSON.parse(files.packageJson); } catch (e) { pkg = null; }
      if (pkg && typeof pkg === "object") {
        var deps = Object.assign({}, pkg.dependencies, pkg.devDependencies, pkg.peerDependencies);
        Object.keys(deps).forEach(function (name) {
          if (Object.prototype.hasOwnProperty.call(NPM, name)) found[NPM[name]] = true;
        });
        var pm = String(pkg.packageManager || "").split("@")[0];
        if (/^(pnpm|yarn|npm|bun)$/.test(pm)) found[pm] = true;
        if (pkg.volta) found.volta = true;
      }
    }
    var py = String(files.pyproject || "") + "\n" + String(files.requirements || "");
    if (py.trim()) {
      var names = {};
      py.split(/\r?\n/).forEach(function (line) {
        var m = /^\s*["']?([A-Za-z0-9][A-Za-z0-9._-]*)["']?\s*(?:[<>=!~\[;,@]|$)/.exec(line.split("#")[0]);
        if (m) names[m[1].toLowerCase().replace(/_/g, "-")] = true;
        var dep = /["']([A-Za-z0-9][A-Za-z0-9._-]*)\s*(?:[<>=!~\[;]|["'])/g, d;
        while ((d = dep.exec(line.split("#")[0]))) names[d[1].toLowerCase().replace(/_/g, "-")] = true;
      });
      Object.keys(names).forEach(function (n) { if (Object.prototype.hasOwnProperty.call(PY, n)) found[PY[n]] = true; });
      if (/\[tool\.poetry\]/.test(py)) found.poetry = true;
      if (/\[tool\.uv\]/.test(py)) found.uv = true;
    }
    return Object.keys(found);
  }

  /** Adds up detections per tool across repos: {id: [repo names]}. */
  function tally(perRepo) {
    var out = {};
    Object.keys(perRepo).forEach(function (repo) {
      perRepo[repo].forEach(function (id) { (out[id] = out[id] || []).push(repo); });
    });
    return out;
  }

  /** A suggested level from how many repos use a tool. Never expert: that is for the person to claim. */
  function suggestLevel(repoCount) { return repoCount >= 2 ? 2 : 1; }

  var MAX_REPOS = 15;

  /**
   * Scans a user's newest public, non-fork, non-archived repos. fetchJson/fetchText are injected so tests need no
   * network. Resolves {login, repos: [names scanned], tools: {id: [repo, ...]}, truncated}.
   */
  function scanUser(login, io) {
    var api = "https://api.github.com";
    return io.json(api + "/users/" + encodeURIComponent(login) + "/repos?type=owner&sort=pushed&per_page=100").then(function (list) {
      var repos = list.filter(function (r) { return !r.fork && !r.archived && !r.private; }).slice(0, MAX_REPOS);
      var perRepo = {}, truncated = false;
      return Promise.all(repos.map(function (r) {
        var base = "https://raw.githubusercontent.com/" + r.full_name + "/" + encodeURIComponent(r.default_branch);
        return Promise.all([
          io.json(api + "/repos/" + r.full_name + "/git/trees/" + encodeURIComponent(r.default_branch) + "?recursive=1").catch(function () { return { tree: [] }; }),
          io.text(base + "/package.json"), io.text(base + "/pyproject.toml"), io.text(base + "/requirements.txt")
        ]).then(function (got) {
          if (got[0].truncated) truncated = true;
          var paths = (got[0].tree || []).map(function (n) { return n.path; });
          perRepo[r.name] = detect(paths, { packageJson: got[1], pyproject: got[2], requirements: got[3] });
        });
      })).then(function () {
        return { login: login, repos: repos.map(function (r) { return r.name; }), tools: tally(perRepo), truncated: truncated };
      });
    });
  }

  var api = { detect: detect, tally: tally, suggestLevel: suggestLevel, scanUser: scanUser, MAX_REPOS: MAX_REPOS };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.RoadmapScan = api;
})(typeof window !== "undefined" ? window : this);
