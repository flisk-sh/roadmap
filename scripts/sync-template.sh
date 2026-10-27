#!/usr/bin/env bash
# Update the comparer engine in this site from its template.
#
#   scripts/sync-template.sh            copy the engine from flisk-sh/comparer@main
#   scripts/sync-template.sh v1.2       from a branch, tag or commit instead
#   COMPARER_TEMPLATE=owner/repo scripts/sync-template.sh   from another template repo
#   COMPARER_TEMPLATE_DIR=../comparer scripts/sync-template.sh   from a local checkout
#
# It copies only the paths listed in .comparer-engine, deletes engine files the template no
# longer has, and records what it synced in .comparer-version. Review the result with
# `git diff`, run `ruby scripts/check-data.rb`, then commit.
set -euo pipefail

# Everything runs inside one block so bash has read the whole script before this file is
# replaced by the copy below.
{
  template="${COMPARER_TEMPLATE:-flisk-sh/comparer}"
  ref="${1:-main}"
  work="$(mktemp -d)"
  trap 'rm -rf "$work"' EXIT

  if [ -n "${COMPARER_TEMPLATE_DIR:-}" ]; then
    src="$(cd "$COMPARER_TEMPLATE_DIR" && pwd)"
    sha="$(git -C "$src" rev-parse HEAD 2>/dev/null || echo local)"
    template="$src"
  else
    sha="$(git ls-remote "https://github.com/$template.git" "$ref" | awk 'NR==1{print $1}')"
    [ -n "$sha" ] || { echo "Could not find $ref in $template" >&2; exit 1; }
    curl -fsSL "https://codeload.github.com/$template/tar.gz/$sha" | tar -xz -C "$work" --strip-components=1
    src="$work"
  fi

  [ -f "$src/.comparer-engine" ] || { echo "$template has no .comparer-engine manifest" >&2; exit 1; }

  count=0
  while IFS= read -r path || [ -n "$path" ]; do
    case "$path" in ''|'#'*) continue ;; esac
    rm -rf "./$path"
    if [ -e "$src/$path" ]; then
      mkdir -p "$(dirname "./$path")"
      cp -R "$src/$path" "./$path"
      count=$((count + 1))
    fi
  done < "$src/.comparer-engine"

  {
    echo "template: $template"
    echo "ref: $ref"
    echo "sha: $sha"
    echo "synced: $(date -u +%Y-%m-%d)"
  } > .comparer-version

  echo "Synced $count engine paths from $template@${sha:0:7}. Review with git diff."
  exit 0
}
