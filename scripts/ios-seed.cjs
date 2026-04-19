#!/usr/bin/env node
// Copies the seeded test DB into the running iOS simulator's app container.
// Run after: npm run seed:load
// Requires the simulator to be booted (npm run ios).

const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const os = require('os')

const APP_ID = 'io.github.frontswitch.dsj'
const SRC_DIR = path.join(os.homedir(), 'Library', 'Application Support', APP_ID)
const SRC = path.join(SRC_DIR, 'test.db')

if (!fs.existsSync(SRC)) {
  console.error('test.db not found — run npm run seed:load first')
  process.exit(1)
}

let containerRoot
try {
  containerRoot = execSync(`xcrun simctl get_app_container booted ${APP_ID} data`, { encoding: 'utf8' }).trim()
} catch {
  console.error('Could not find simulator container — is the simulator booted?')
  process.exit(1)
}

const DEST_DIR = path.join(containerRoot, 'Library', 'Application Support', APP_ID)
fs.mkdirSync(DEST_DIR, { recursive: true })

const DEST = path.join(DEST_DIR, 'dsj.db')

// Copy DB + WAL/SHM files if present, renaming test.db → dsj.db
for (const ext of ['', '-wal', '-shm']) {
  const src = SRC + ext
  const dest = DEST + ext
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest)
    console.log(`copied ${path.basename(src)} → ${path.basename(dest)}`)
  } else if (ext !== '') {
    // Remove stale WAL/SHM in dest so a fresh DB isn't seen as malformed
    if (fs.existsSync(dest)) {
      fs.rmSync(dest)
      console.log(`removed stale ${path.basename(dest)}`)
    }
  }
}

console.log('Done. Restart the app in the simulator.')
