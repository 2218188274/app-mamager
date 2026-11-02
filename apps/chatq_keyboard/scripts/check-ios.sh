#!/bin/bash
# Run on a Mac. Simulator compilation verifies UIKit/Keychain integration without a distribution certificate.
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ "$(uname -s)" != Darwin ]]; then echo "Full iOS build requires macOS and Xcode." >&2; exit 1; fi
xcodebuild -version
npm run check
npm test
python3 tests/ios-personal-ai/run-fixture.py "$(xcrun --find swift)"
npx expo prebuild --platform ios --no-install
(cd ios && pod install)
build_dir="${CHATQ_IOS_BUILD_DIR:-$(mktemp -d "${TMPDIR:-/tmp}/chatq-ios-build.XXXXXX")}"
xcodebuild -workspace ios/app.xcworkspace -scheme app -configuration Debug -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' -derivedDataPath "$build_dir" CODE_SIGNING_ALLOWED=NO build
echo "Simulator build completed: $build_dir"
ditto -c -k --sequesterRsrc --keepParent "$build_dir/Build/Products/Debug-iphonesimulator/app.app" "$build_dir/ChatQ-ios-simulator.zip"
echo "Device installation still requires matching App Group, Keychain group and signing profiles."
