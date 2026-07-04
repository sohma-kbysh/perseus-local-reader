// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "PerseusLocalReader",
    platforms: [
        .macOS(.v13)
    ],
    products: [
        .executable(
            name: "PerseusLocalReader",
            targets: ["PerseusLocalReader"]
        )
    ],
    targets: [
        .executableTarget(
            name: "PerseusLocalReader",
            path: "Sources/PerseusLocalReader"
        )
    ],
    swiftLanguageVersions: [.v5]
)
