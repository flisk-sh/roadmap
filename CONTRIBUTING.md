# Contributing

This map is a wiki in a Git repo. Fixes are welcome from anyone, including the makers of the tools on it.

## Fix a tool

1. Find the tool in `_data/tools/<family>.yml` (the tooltip's **Edit** link opens the right file).
2. Change what is wrong. To move a dot on the Compass, add or remove criterion ids in `dx` or `parity`. To change its ring, change `ring` and `evidence`.
3. Say why in the pull request, with a link: docs, a release page, a changelog.

## Add a tool

Add it to the family file it fits best. It has to be worth considering for local development in a real project, not just exist.

```yaml
- id: tilt                 # kebab-case, unique across all files
  name: Tilt
  sym: Tl                  # capital + 1 or 2 lowercase letters (Tl, Cln), unique across all files
  cat: Live-update loops   # one of the family's cats in _data/families.yml
  tagline: Live-update loop for multi-service apps   # 60 characters or less
  url: https://tilt.dev
  repo: tilt-dev/tilt      # optional, GitHub owner/name
  license: oss             # oss | free | freemium | paid
  ring: adopt              # adopt | trial | assess | hold
  evidence: https://github.com/tilt-dev/tilt/releases
  dx: [one-command, fast-feedback, ui, docs, cross-platform, offline]
  parity: [containers, multi-service, networking, state, prod-artifacts, k8s]
  note: One honest caveat, 120 characters or less.   # optional
```

The criteria and ring rules are in `_data/rubric.yml`. Read them literally: a criterion is met or it is not.

## Add a logo

Drop `<tool id>.svg` (a single-color mark, for example from [Simple Icons](https://simpleicons.org)) or a small `<tool id>.png` into `assets/logos/`. It shows up on its own. See [LOGOS.md](LOGOS.md) for the rules. A tool without a logo shows its symbol.

## Check before you push

```bash
ruby scripts/check-data.rb
```

It checks ids, symbols, categories, criteria, rings, URLs and that every tool a journey names exists. CI runs the same check on every pull request.

## Change the rules

Changes to `_data/rubric.yml` move many dots at once, so open an issue first.
