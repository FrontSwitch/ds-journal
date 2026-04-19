// swift-tools-version: 5.9
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
