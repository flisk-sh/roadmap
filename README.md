# DevEx Roadmap

**[roadmap.flisk.sh](https://roadmap.flisk.sh)**: a community-edited map of 300+ local developer tools, drawn four ways.

| View | What it shows | Sub-tabs |
| --- | --- | --- |
| **[Compass](https://roadmap.flisk.sh/compass/)** | Developer ergonomics (west → east) against complexity and production parity (south → north) | One per family |
| **[Adoption Radar](https://roadmap.flisk.sh/radar/)** | Adopt, Trial, Assess or Hold, from release and maturity signals | One per family; a family splits into its categories |
| **[Lab](https://roadmap.flisk.sh/lab/)** | Every tool as an element in a periodic table | One per family |
| **[Journeys](https://roadmap.flisk.sh/journeys/)** | Seven levels from Package Wrangler to Platform Architect, as a metro line | Backend, AI & agents, Platform |

Every sub-tab has its own URL, so a link opens exactly the view you shared. Charts show a tooltip on hover or focus; nothing on a chart navigates.

## Honest by construction

- **No dot is placed by hand.** A tool's Compass position is 10 points per criterion it meets in [`_data/rubric.yml`](_data/rubric.yml). Its Radar ring follows the ring rules in the same file, with an `evidence` link.
- **Flisk publishes the site and gets no favors.** It is scored by the same checklist, has no special color or size, and sits in Assess because it first shipped in October 2026.
- **Gaps are shown.** Journeys has a Flisk stop on every level, marked *coming soon* where Flisk does not cover it yet.
- **The first dataset was seeded in October 2026 with AI-assisted research.** It will have mistakes; that is what pull requests are for.

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
