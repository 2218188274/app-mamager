"""Check a real iPhone archive/export. Never label unsigned or simulator output installable."""
import argparse
import datetime
import json
import plistlib
import re
import subprocess
import tempfile
from pathlib import Path

HOST = 'com.jaxon.app.chatq'
KEYBOARD = HOST + '.keyboard'
APP_GROUP = 'group.' + HOST
KEYCHAIN_SUFFIX = HOST + '.shared'


def require(value, message):
    if not value:
        raise ValueError(message)


def validate_info(host, keyboard, version, build):
    for info, bundle in [(host, HOST), (keyboard, KEYBOARD)]:
        require(info.get('CFBundleIdentifier') == bundle, 'Unexpected bundle identifier')
        require(info.get('CFBundleShortVersionString') == version, 'Version mismatch')
        require(info.get('CFBundleVersion') == build, 'Build number mismatch')
        require(info.get('CFBundleSupportedPlatforms') == ['iPhoneOS'], 'Not an iPhone device build')
        require(info.get('ChatQAppGroup') == APP_GROUP, 'App Group mismatch')
        require(info.get('NSAppTransportSecurity', {}).get('NSAllowsArbitraryLoads') is not True,
                'Unrestricted transport is not permitted')
    extension = keyboard.get('NSExtension', {})
    require(extension.get('NSExtensionPointIdentifier') == 'com.apple.keyboard-service', 'Keyboard missing')
    require(extension.get('NSExtensionAttributes', {}).get('RequestsOpenAccess') is True,
            'Keyboard network permission declaration missing')


def validate_profiles(host, keyboard, team, now=None):
    require(bool(re.fullmatch(r'[A-Z0-9]{10}', team)), 'A 10-character Apple Team ID is required')
    now = now or datetime.datetime.now(datetime.timezone.utc)
    prefixes, device_sets = [], []
    for profile, bundle in [(host, HOST), (keyboard, KEYBOARD)]:
        require(profile.get('TeamIdentifier') == [team], 'Provisioning team mismatch')
        expiry = profile.get('ExpirationDate')
        require(isinstance(expiry, datetime.datetime), 'Missing provisioning expiry')
        require(expiry.replace(tzinfo=datetime.timezone.utc) > now, 'Expired provisioning profile')
        prefix = profile.get('ApplicationIdentifierPrefix', [])
        require(len(prefix) == 1 and re.fullmatch(r'[A-Z0-9]{10}', prefix[0]), 'Invalid App ID prefix')
        prefixes.append(prefix[0])
        ent = profile.get('Entitlements', {})
        require(ent.get('application-identifier') == prefix[0] + '.' + bundle, 'Explicit App ID required')
        require(ent.get('com.apple.developer.team-identifier') == team, 'Entitlement team mismatch')
        require(ent.get('get-task-allow') is False, 'Use distribution profiles, not development profiles')
        require(APP_GROUP in ent.get('com.apple.security.application-groups', []), 'App Group not allowed')
        groups = ent.get('keychain-access-groups', [])
        require(prefix[0] + '.' + KEYCHAIN_SUFFIX in groups or prefix[0] + '.*' in groups,
                'Shared Keychain group not allowed')
        devices = profile.get('ProvisionedDevices', [])
        require(isinstance(devices, list) and len(devices) > 0 and
                all(isinstance(x, str) and x.strip() for x in devices), 'Registered devices missing')
        require(profile.get('ProvisionsAllDevices') is not True, 'Enterprise distribution is not configured')
        certificates = profile.get('DeveloperCertificates', [])
        require(isinstance(certificates, list) and len(certificates) > 0 and
                all(isinstance(cert, bytes) and cert for cert in certificates), 'Provisioning certificate missing')
        device_sets.append(set(devices))
    require(prefixes[0] == prefixes[1], 'Host and keyboard App ID prefixes differ')
    require(device_sets[0] == device_sets[1], 'Host and keyboard must cover the same test devices')
    return prefixes[0], len(device_sets[0])


def validate_entitlements(info, ent, bundle, team, prefix):
    require(ent.get('application-identifier') == prefix + '.' + bundle, 'Signed App ID mismatch')
    require(ent.get('com.apple.developer.team-identifier') == team, 'Signed team mismatch')
    require(ent.get('get-task-allow') is False, 'Debug signing is not a distribution build')
    require(APP_GROUP in ent.get('com.apple.security.application-groups', []), 'Signed App Group missing')
    keychain = prefix + '.' + KEYCHAIN_SUFFIX
    require(keychain in ent.get('keychain-access-groups', []), 'Signed shared Keychain missing')
    require(info.get('ChatQKeychainGroup') == keychain, 'Resolved Keychain group differs from signing')


def command(args):
    return subprocess.check_output(args, stderr=subprocess.PIPE)


def plist(path):
    return plistlib.loads(path.read_bytes())


def inspect(app, version, build, team=None):
    host = plist(app / 'Info.plist')
    keyboards = list((app / 'PlugIns').glob('*.appex'))
    require(len(keyboards) == 1, 'Exactly one keyboard extension is required')
    keyboard_path = keyboards[0]
    keyboard = plist(keyboard_path / 'Info.plist')
    validate_info(host, keyboard, version, build)
    require((app / 'main.jsbundle').stat().st_size > 1000, 'Bundled JavaScript missing')
    require((keyboard_path / 'dict_pinyin.dat').stat().st_size > 1000, 'Offline Pinyin dictionary missing')
    require((keyboard_path / 'pinyin-NOTICE.txt').is_file(), 'Pinyin license notice missing')
    for path, info in [(app, host), (keyboard_path, keyboard)]:
        executable = path / info['CFBundleExecutable']
        require(command(['lipo', '-archs', str(executable)]).decode().strip() == 'arm64', 'Expected arm64')
        require(re.search(r'platform\s+IOS\b', command(['xcrun', 'vtool', '-show-build', str(executable)]).decode()),
                'Mach-O must target iOS, not the simulator')
    report = {'version': version, 'build': build, 'platform': 'iPhoneOS', 'architecture': 'arm64',
              'hostAndKeyboardIncluded': True, 'javascriptBundled': True, 'dictionaryBundled': True,
              'signedPackageVerified': False, 'deviceInstallable': False, 'realDeviceValidated': False,
              'paidAiCalls': 0}
    if team:
        profiles = [plistlib.loads(command(['security', 'cms', '-D', '-i', str(path / 'embedded.mobileprovision')]))
                    for path in [app, keyboard_path]]
        prefix, devices = validate_profiles(*profiles, team)
        command(['codesign', '--verify', '--deep', '--strict', str(app)])
        for path, info, bundle, profile in [(app, host, HOST, profiles[0]),
                                           (keyboard_path, keyboard, KEYBOARD, profiles[1])]:
            command(['codesign', '--verify', '--strict', '-R=anchor apple generic', str(path)])
            ent = plistlib.loads(command(['codesign', '-d', '--entitlements', ':-', str(path)]))
            validate_entitlements(info, ent, bundle, team, prefix)
            signature = subprocess.run(['codesign', '-dvv', str(path)], capture_output=True, check=True).stderr.decode()
            require('Signature=adhoc' not in signature and
                    re.search(r'Authority=(?:Apple|iPhone) Distribution:', signature),
                    'Apple distribution certificate required')
            with tempfile.TemporaryDirectory(prefix='chatq-signer-check-') as scratch:
                cert_prefix = str(Path(scratch) / 'signer')
                command(['codesign', '-d', '--extract-certificates=' + cert_prefix, str(path)])
                leaf = Path(cert_prefix + '0').read_bytes()
                require(leaf in profile['DeveloperCertificates'], 'Signing certificate not in provisioning profile')
        report.update(signedPackageVerified=True, deviceInstallable=True,
                      registeredDeviceCount=devices, installationScope='matching registered devices only')
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('app', type=Path)
    parser.add_argument('--version', required=True)
    parser.add_argument('--build', required=True)
    parser.add_argument('--team')
    parser.add_argument('--report', type=Path, required=True)
    args = parser.parse_args()
    try:
        result = inspect(args.app, args.version, args.build, args.team)
        args.report.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
        print(json.dumps(result))
    except ValueError as error:
        raise SystemExit('iOS package validation failed: ' + str(error))
    except (OSError, subprocess.CalledProcessError, plistlib.InvalidFileException):
        # Do not print signing profile, certificate or account details from tool errors.
        raise SystemExit('iOS package validation failed; no installable package has been approved.')
