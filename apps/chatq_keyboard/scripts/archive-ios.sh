#!/bin/bash
# Device archives are separate from simulator builds. Signed export requires an authorized Xcode account.
set -euo pipefail
cd "$(dirname "$0")/.."
mode="${1:-unsigned}"
if [[ "$(uname -s)" != Darwin ]]; then echo 'iPhone archives require macOS and Xcode.' >&2; exit 1; fi
if [[ "$mode" != unsigned && "$mode" != signed ]]; then echo 'Usage: archive-ios.sh unsigned|signed' >&2; exit 1; fi
if [[ "$mode" == signed && ! "${CHATQ_IOS_TEAM_ID:-}" =~ ^[A-Z0-9]{10}$ ]]; then
  echo 'Set CHATQ_IOS_TEAM_ID and configure your Apple Developer account in Xcode before signing.' >&2; exit 1
fi
build_dir="${CHATQ_IOS_DEVICE_BUILD_DIR:-$(mktemp -d "${TMPDIR:-/tmp}/chatq-ios-device.XXXXXX")}"
mkdir -p "$build_dir"
build_dir="$(cd "$build_dir" && pwd)"
archive="$build_dir/ChatQ.xcarchive"
if [[ -e "$archive" || -e "$build_dir/ChatQ-ios-device-unsigned.zip" || -e "$build_dir/export" ]]; then
  echo 'Use a fresh build directory; existing release outputs will not be overwritten.' >&2; exit 1
fi
xcodebuild -version
npm run check
npm test
python3 -m unittest discover -s tests/ios-release -p 'test_*.py'
npx expo prebuild --platform ios --no-install
(cd ios && pod install)
version="$(node -p 'require("./app.config").expo.version')"
build="$(node -p 'require("./app.config").expo.ios.buildNumber')"
signing=(CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO)
if [[ "$mode" == signed ]]; then
  # Xcode handles both explicit App IDs and separate host/extension provisioning profiles.
  signing=(CODE_SIGN_STYLE=Automatic "DEVELOPMENT_TEAM=$CHATQ_IOS_TEAM_ID" -allowProvisioningUpdates)
fi
xcodebuild -workspace ios/app.xcworkspace -scheme app -configuration Release -sdk iphoneos \
  -destination 'generic/platform=iOS' -derivedDataPath "$build_dir/derived" -archivePath "$archive" \
  ARCHS=arm64 ONLY_ACTIVE_ARCH=NO "${signing[@]}" archive
python3 scripts/verify-ios-package.py "$archive/Products/Applications/app.app" --version "$version" \
  --build "$build" --report "$build_dir/device-build.json"
if [[ "$mode" == unsigned ]]; then
  ditto -c -k --sequesterRsrc --keepParent "$archive" "$build_dir/ChatQ-ios-device-unsigned.zip"
  echo 'Device archive built. UNSIGNED: cannot be installed on an iPhone. No IPA was generated.'
else
  # Ad hoc export only. No App Store/TestFlight upload or public release is automatic.
  python3 - "$build_dir/ExportOptions.plist" <<'PY'
import os, plistlib, sys
with open(sys.argv[1], 'wb') as file:
    plistlib.dump({'method': 'release-testing', 'signingStyle': 'automatic',
                  'teamID': os.environ['CHATQ_IOS_TEAM_ID'], 'destination': 'export',
                  'manageAppVersionAndBuildNumber': False, 'stripSwiftSymbols': True}, file)
PY
  xcodebuild -exportArchive -archivePath "$archive" -exportPath "$build_dir/export" \
    -exportOptionsPlist "$build_dir/ExportOptions.plist" -allowProvisioningUpdates
  # Validate the EXPORTED artifact: export can change provisioning and entitlements.
  python3 - "$build_dir" <<'PY'
import importlib.util, json, pathlib, tempfile, zipfile
root = pathlib.Path(__import__('sys').argv[1])
ipas = list((root / 'export').glob('*.ipa'))
if len(ipas) != 1: raise SystemExit('Expected one exported IPA')
module = importlib.util.spec_from_file_location('verify', 'scripts/verify-ios-package.py')
verify = importlib.util.module_from_spec(module); module.loader.exec_module(verify)
with tempfile.TemporaryDirectory(prefix='chatq-ipa-check-') as scratch:
    with zipfile.ZipFile(ipas[0]) as archive:
        if any(pathlib.PurePosixPath(n).is_absolute() or '..' in pathlib.PurePosixPath(n).parts for n in archive.namelist()):
            raise SystemExit('Invalid IPA paths')
        archive.extractall(scratch)  # Our own Xcode export, validated before extraction.
    apps = list((pathlib.Path(scratch) / 'Payload').glob('*.app'))
    if len(apps) != 1: raise SystemExit('Expected one exported application')
    built = json.loads((root / 'device-build.json').read_text())
    result = verify.inspect(apps[0], built['version'], built['build'], __import__('os').environ['CHATQ_IOS_TEAM_ID'])
    import hashlib
    result.update(ipaFile=ipas[0].name, sizeBytes=ipas[0].stat().st_size,
                  sha256=hashlib.file_digest(ipas[0].open('rb'), 'sha256').hexdigest())
    (root / 'signed-export.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result))
PY
  echo 'Signed export checked. Only registered devices present in BOTH profiles can install it; device testing remains required.'
fi
