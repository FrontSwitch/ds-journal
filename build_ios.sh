#!/bin/bash
set -e
cd "$(dirname "$0")"

echo "▸ Building frontend..."
npm run build

echo "▸ Syncing to Capacitor iOS..."
npx cap sync ios

echo "▸ Fixing SPM..."
node scripts/cap-fix-spm.cjs

echo "▸ Installing pods..."
cd ios/App && pod install

echo ""
echo "✓ Done. In Xcode: Product → Clean Build Folder (⇧⌘K), then rebuild."
