#!/bin/bash
# Run DSJ locally against the production database.
# Usage:
#   ./run.sh          # dev (hot-reload, debug build)
#   ./run.sh release  # release build
set -e
cd "$(dirname "$0")"

# Ensure Rust/Cargo is available (not always in PATH outside interactive shells)
[ -f "$HOME/.cargo/env" ] && source "$HOME/.cargo/env"

if [[ "$1" == "release" ]]; then
  echo "▸ Building release..."
  npm run tauri build
  echo "▸ Launching..."
  open src-tauri/target/release/bundle/macos/DissociativeSystemJournal.app
else
  echo "▸ Starting dev (prod DB)..."
  npm run tauri dev
fi
