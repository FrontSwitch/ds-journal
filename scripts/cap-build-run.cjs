#!/usr/bin/env node
// Builds and runs the Capacitor iOS app on the iPhone 16 simulator.
// Uses xcodebuild -workspace (CocoaPods) instead of -project (Capacitor CLI default).
// Run: node scripts/cap-build-run.cjs (called by npm run cap:ios:run)

const { execSync } = require('child_process')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const WORKSPACE = path.join(ROOT, 'ios/App/App.xcworkspace')
const DERIVED_DATA = path.join(ROOT, 'ios/DerivedData/cap')
const SIMULATOR_ID = 'C7DE5A02-A4BD-4F0D-B51F-8661BB546820'
const BUNDLE_ID = 'com.frontswitchstudio.dsj'
const APP_PATH = `${DERIVED_DATA}/Build/Products/Debug-iphonesimulator/App.app`

const run = (cmd, opts = {}) => {
  console.log(`\n> ${cmd.split('\n').join(' ').slice(0, 120)}`)
  execSync(cmd, { stdio: 'inherit', cwd: ROOT, ...opts })
}

// Boot simulator
try { execSync(`xcrun simctl boot ${SIMULATOR_ID}`, { stdio: 'pipe' }) } catch { /* already booted */ }

// Build
run(`xcodebuild \
  -workspace "${WORKSPACE}" \
  -scheme App \
  -configuration Debug \
  -sdk iphonesimulator \
  -destination "id=${SIMULATOR_ID}" \
  -derivedDataPath "${DERIVED_DATA}" \
  CODE_SIGN_IDENTITY="" \
  CODE_SIGNING_REQUIRED=NO \
  CODE_SIGNING_ALLOWED=NO \
  build \
  | xcbeautify 2>/dev/null || cat`)

// Install + launch
run(`xcrun simctl install ${SIMULATOR_ID} "${APP_PATH}"`)
run(`xcrun simctl launch ${SIMULATOR_ID} ${BUNDLE_ID}`)

// Bring Simulator to front
try { execSync('open -a Simulator', { stdio: 'pipe' }) } catch { /* ok */ }

console.log('\nApp launched in simulator.')
