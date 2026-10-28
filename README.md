# DevEx Roadmap

**[roadmap.flisk.si](https://roadmap.flisk.si)**: a community-edited map of 372 developer tools, 44 roles and 400 agent skills, drawn eight ways. Live GitHub numbers, a public checklist, and a [Findings](https://roadmap.flisk.si/findings/) page of what the data says.

| View | What it shows | Sub-tabs |
| --- | --- | --- |
| **[Compass](https://roadmap.flisk.si/compass/)** | Easy to use (left → right) against whether it is made for small, simple setups or big, real systems (bottom → top) | One per family |
| **[Adoption Radar](https://roadmap.flisk.si/radar/)** | Adopt, Trial, Assess or Hold, from release and maturity signals | One per family; a family splits into its categories |
| **[Lab](https://roadmap.flisk.si/lab/)** | Every tool as an element in a periodic table | One per family |
| **[Journeys](https://roadmap.flisk.si/journeys/)** | Seven levels from Package Wrangler to Platform Architect, as a metro line | Backend, AI & agents, Platform |
| **[Roles](https://roadmap.flisk.si/roles/)** | 44 jobs (SRE, Platform, Forward Deployed, Benchmark Engineer…) and the tools each one needs: must have, every day, good to know | One per group of jobs |
| **[Skills](https://roadmap.flisk.si/skills/)** | 400 free AI agent skills from GitHub, each tested by Haiku: does it get picked for the right request, and is it followed right | One per kind of skill |
| **[Portfolio](https://roadmap.flisk.si/portfolio/)** | Rate the tools you know 0–3: get your best-fit role, your skill shape and a page to share (a link, a download, or pages.flisk.si) | One per family |
| **[Ask](https://roadmap.flisk.si/ask/)** | Type `yarn vs npm vs bun` and get a side-by-side answer from the data, no AI call. Hand it to your own AI for an opinion | None |

Every sub-tab has its own URL, so a link opens exactly the view you shared. Hover or focus a tool for details. Click up to 5 tools, in any view, to compare them side by side; the picks stay in the URL, so a comparison can be shared.

## Honest by construction

- **No dot is placed by hand.** A tool's Compass position is 10 points per criterion it meets in [`_data/rubric.yml`](_data/rubric.yml). Its Radar ring follows the ring rules in the same file, with an `evidence` link.
- **Flisk publishes the site and gets no favors.** It is scored by the same checklist, has no special color or size, and sits in Assess because it first shipped in October 2026.
- **Flisk appears only where it works.** On Journeys, Flisk is on a level only where it does the job today or part of it. The levels it does not cover yet are tracked in [flisk-sh/flisk#2647](https://github.com/flisk-sh/flisk/issues/2647).
- **The first dataset was seeded in October 2026 with AI-assisted research.** It will have mistakes; that is what pull requests are for.

## Testing agent skills

`ruby scripts/eval-skills.rb` tests every skill with Haiku through `claude -p` and writes `_data/skill_evals.json` (about 400 calls, a few dollars). The test questions live with each skill in `_data/skills/*.yml`: two requests where the skill should be used, one that only sounds similar, and the first step the skill asks for. A stronger model wrote them from each skill's own text; Haiku only takes the test. Run one skill with `--only <id>`, or a smoke test with `--limit 5`.

## Live GitHub numbers

`GITHUB_TOKEN=... ruby scripts/fetch-github.rb` writes stars, last release and archive status to `_data/github.json` and `_data/skill_repos.json`. CI runs it on every build and every Monday.

## Fix or add a tool

See [CONTRIBUTING.md](CONTRIBUTING.md). In short: edit `_data/tools/<family>.yml`, run `ruby scripts/check-data.rb`, open a pull request with a source.

## Run it locally

```bash
bundle install
bundle exec jekyll serve
```

Or with Docker, no Ruby needed:

```bash
docker run --rm -p 4000:4000 -v "$PWD:/site" -w /site ruby:3.3 sh -c "bundle install && bundle exec jekyll serve -H 0.0.0.0"
```

## How it is built

Jekyll on GitHub Pages, from the [flisk-sh/comparer](https://github.com/flisk-sh/comparer) template that also powers [cmd.flisk.sh](https://cmd.flisk.sh).

| Path | What it holds |
| --- | --- |
| `_data/families.yml` | The eight families: sub-tabs, Radar slices, Lab groups |
| `_data/tools/<family>.yml` | The tools |
| `_data/rubric.yml` | Compass criteria, Radar rings, licenses |
| `_data/journeys.yml` | Levels, tracks and Flisk's status per level |
| `_data/meta.yml` | The four views and site-wide text |
| `_plugins/view_pages.rb` | Builds one page per view and sub-tab |
| `assets/js/app.js` | Draws the charts from `assets/data.json` |

## License

MIT. Tool names and trademarks belong to their owners.
