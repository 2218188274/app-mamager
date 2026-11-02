// swift-tools-version: 5.9
import PackageDescription
let package = Package(
  name: "ChatQPersonalAI",
  platforms: [.iOS(.v15), .macOS(.v12)],
  products: [.library(name: "ChatQPersonalAI", targets: ["ChatQPersonalAI"])],
  targets: [
    .target(name: "ChatQPersonalAI", path: "modules/chatq-keyboard/ios/PersonalAI"),
    .target(name: "ChatQPersona", path: "native/ios/ChatQKeyboard", exclude: ["KeyboardViewController.swift", "ChatQKeyboard-Bridging-Header.h", "ChatQKeyboard.entitlements", "Info.plist", "PinyinDecoder.h", "PinyinDecoder.mm", "topics.json"], sources: ["PersonaPreferences.swift"]),
    .testTarget(name: "ChatQPersonalAITests", dependencies: ["ChatQPersonalAI", "ChatQPersona"], path: "tests/ios-personal-ai", exclude: ["run-fixture.py"])
  ]
)
