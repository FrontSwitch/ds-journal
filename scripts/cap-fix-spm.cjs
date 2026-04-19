#!/usr/bin/env node
// Clears SPM plugin dependencies from CapApp-SPM/Package.swift after `cap sync`.
// Needed because @capacitor-community/sqlite requires CocoaPods (no SPM support),
// so all plugins are managed via Podfile instead. If SPM and CocoaPods both link
// the same frameworks, you'll get duplicate-symbol build errors.
// Run: node scripts/cap-fix-spm.cjs (called automatically by npm run cap:sync)

const fs = require('fs')
const path = require('path')

const PACKAGE_SWIFT = path.join(__dirname, '../ios/App/CapApp-SPM/Package.swift')

const EMPTY_PACKAGE = `// swift-tools-version: 5.9
import PackageDescription

// NOTE: Intentionally empty — all plugins are provided via CocoaPods (see Podfile).
// CapacitorCommunitySqlite does not support SPM, so all plugins are installed via pods.
// The Xcode project still references this package by name; keeping it avoids a project edit.
let package = Package(
    name: "CapApp-SPM",
    platforms: [.iOS(.v15)],
    products: [
        .library(
            name: "CapApp-SPM",
            targets: ["CapApp-SPM"])
    ],
    dependencies: [],
    targets: [
        .target(
            name: "CapApp-SPM",
            dependencies: []
        )
    ]
)
`

const PACKAGE_RESOLVED = path.join(
  __dirname,
  '../ios/App/App.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved'
)

const EMPTY_RESOLVED = JSON.stringify({ originHash: '', pins: [], version: 3 }, null, 2) + '\n'

fs.writeFileSync(PACKAGE_SWIFT, EMPTY_PACKAGE)
fs.writeFileSync(PACKAGE_RESOLVED, EMPTY_RESOLVED)
console.log('cap-fix-spm: cleared SPM plugin dependencies and Package.resolved (CocoaPods manages all plugins)')
