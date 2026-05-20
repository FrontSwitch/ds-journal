#!/usr/bin/env bash
set -euo pipefail

# Usage: ./release.sh <version>
# Example: ./release.sh 0.10.2

VERSION="${1:-}"

if [[ -z "$VERSION" ]]; then
  echo "Usage: ./release.sh <version>"
  echo "  e.g. ./release.sh 0.10.2"
  exit 1
fi

if [[ ! "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Error: version must be in x.y.z format, got: $VERSION"
  exit 1
fi

TAG="v$VERSION"

# ── 1. Check we're on main and working tree is clean ────────────────────────
BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [[ "$BRANCH" != "main" ]]; then
  echo "Error: not on main branch (currently on $BRANCH)"
  exit 1
fi

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Error: working tree has uncommitted changes"
  git status --short
  exit 1
fi

if git tag | grep -qx "$TAG"; then
  echo "Error: tag $TAG already exists"
  exit 1
fi

LAST_TAG=$(git tag --sort=-version:refname | head -1)
if [[ -n "$LAST_TAG" ]]; then
  COMMIT_COUNT=$(git rev-list "${LAST_TAG}..HEAD" --count)
  if [[ "$COMMIT_COUNT" -eq 0 ]]; then
    echo "Error: no commits since $LAST_TAG — nothing to release"
    exit 1
  fi
  echo "Commits since $LAST_TAG: $COMMIT_COUNT"
fi

# ── 2. Bump versions in the three files ─────────────────────────────────────
echo "Bumping versions to $VERSION ..."

node -e "
  const fs = require('fs');
  const p = 'package.json';
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  j.version = '$VERSION';
  fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\n');
  console.log('  package.json ✓');
"

node -e "
  const fs = require('fs');
  const p = 'src-tauri/tauri.conf.json';
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  j.version = '$VERSION';
  fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\n');
  console.log('  tauri.conf.json ✓');
"

if [[ "$OSTYPE" == "darwin"* ]]; then
  sed -i '' "/^\[package\]/,/^\[/{s/^version = \"[^\"]*\"/version = \"$VERSION\"/;}" src-tauri/Cargo.toml
else
  sed -i "/^\[package\]/,/^\[/{s/^version = \"[^\"]*\"/version = \"$VERSION\"/;}" src-tauri/Cargo.toml
fi
echo "  Cargo.toml ✓"

# ── 3. Verify all three agree ────────────────────────────────────────────────
echo ""
echo "Verifying version consistency ..."

PKG_VER=$(node -e "console.log(require('./package.json').version)")
TAURI_VER=$(node -e "console.log(require('./src-tauri/tauri.conf.json').version)")
CARGO_VER=$(grep '^version' src-tauri/Cargo.toml | head -1 | sed 's/version = "\(.*\)"/\1/')

PASS=true
check() {
  local label="$1" val="$2"
  if [[ "$val" == "$VERSION" ]]; then
    echo "  $label: $val ✓"
  else
    echo "  $label: $val  ← MISMATCH (expected $VERSION)"
    PASS=false
  fi
}

check "package.json    " "$PKG_VER"
check "tauri.conf.json " "$TAURI_VER"
check "Cargo.toml      " "$CARGO_VER"

if [[ "$PASS" != "true" ]]; then
  echo ""
  echo "Version mismatch — aborting. Revert with: git checkout package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml"
  exit 1
fi

# ── 4. TypeScript check ──────────────────────────────────────────────────────
echo ""
echo "Running tsc ..."
if ! npx tsc --noEmit; then
  echo ""
  echo "TypeScript errors. Version files are modified but nothing was committed."
  echo "Revert with: git checkout package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml"
  exit 1
fi
echo "tsc ✓"

# ── 5. Vite build ────────────────────────────────────────────────────────────
echo ""
echo "Running vite build ..."
if ! npx vite build; then
  echo ""
  echo "Vite build failed. Version files are modified but nothing was committed."
  echo "Revert with: git checkout package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml"
  exit 1
fi
echo "vite build ✓"

# ── 6. Tests ─────────────────────────────────────────────────────────────────
echo ""
echo "Running tests ..."
if ! npm test -- --run; then
  echo ""
  echo "Tests failed. Version files are modified but nothing was committed."
  echo "Revert with: git checkout package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml"
  exit 1
fi
echo "tests ✓"

# ── 7. i18n check ────────────────────────────────────────────────────────────
echo ""
echo "Checking i18n ..."
if ! node scripts/check-i18n.cjs; then
  echo ""
  echo "i18n check failed. Version files are modified but nothing was committed."
  echo "Revert with: git checkout package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml"
  exit 1
fi
echo "i18n ✓"

# ── 8. Rust tests ─────────────────────────────────────────────────────────────
echo ""
echo "Running Rust tests ..."
if ! cargo test --manifest-path src-tauri/Cargo.toml; then
  echo ""
  echo "Rust tests failed. Version files are modified but nothing was committed."
  echo "Revert with: git checkout package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml"
  exit 1
fi
echo "Rust tests ✓"

# ── 9. Print push commands ───────────────────────────────────────────────────
echo ""
echo "All good. When ready, run:"
echo ""
echo "  git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml"
echo "  git commit -m 'Release $TAG'"
echo "  git tag -a $TAG -m "Release $TAG""
echo "  git push origin main && git push origin $TAG"
echo ""
