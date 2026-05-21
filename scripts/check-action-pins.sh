#!/usr/bin/env bash
# Check whether pinned GitHub Action SHAs are still current.
# Usage: ./scripts/check-action-pins.sh

set -euo pipefail

WORKFLOW=".github/workflows/build.yml"
UP_TO_DATE=true

# Each entry: "owner/repo  ref"
declare -a ACTIONS=(
  "actions/checkout          refs/tags/v4"
  "actions/setup-node        refs/tags/v4"
  "dtolnay/rust-toolchain    refs/heads/stable"
  "Swatinem/rust-cache       refs/tags/v2"
  "tauri-apps/tauri-action   refs/tags/v0"
)

for entry in "${ACTIONS[@]}"; do
  repo=$(echo "$entry" | awk '{print $1}')
  ref=$(echo "$entry" | awk '{print $2}')

  # Get current upstream SHA (dereference annotated tags to commit)
  upstream=$(git ls-remote "https://github.com/${repo}.git" "$ref" "${ref}^{}" 2>/dev/null \
    | grep -v '\^{}' | awk '{print $1}' | head -1)
  deref=$(git ls-remote "https://github.com/${repo}.git" "${ref}^{}" 2>/dev/null \
    | awk '{print $1}' | head -1)
  current_upstream=${deref:-$upstream}

  if [ -z "$current_upstream" ]; then
    echo "  WARN  $repo ($ref) — could not fetch upstream SHA"
    continue
  fi

  # Find the SHA pinned in the workflow file
  pinned=$(grep -oP "(?<=${repo}@)[0-9a-f]{40}" "$WORKFLOW" || true)

  if [ -z "$pinned" ]; then
    echo "  SKIP  $repo — not found in $WORKFLOW"
    continue
  fi

  if [ "$pinned" = "$current_upstream" ]; then
    echo "  OK    $repo — ${pinned:0:12} is current"
  else
    echo "  OLD   $repo — pinned ${pinned:0:12}, upstream ${current_upstream:0:12}"
    echo "        Update: sed -i '' 's/${pinned}/${current_upstream}/' $WORKFLOW"
    UP_TO_DATE=false
  fi
done

echo ""
if $UP_TO_DATE; then
  echo "All action pins are current."
else
  echo "Some pins are outdated. Run the sed commands above to update."
fi
