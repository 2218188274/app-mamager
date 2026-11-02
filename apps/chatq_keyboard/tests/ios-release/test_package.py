import copy
import datetime
import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('release', Path(__file__).parents[2] / 'scripts/verify-ios-package.py')
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)
TEAM = 'TESTTEAM01'


def profile(bundle):
    return {'TeamIdentifier': [TEAM], 'ApplicationIdentifierPrefix': [TEAM],
            'ExpirationDate': datetime.datetime(2099, 1, 1), 'ProvisionedDevices': ['synthetic-device-1'],
            'DeveloperCertificates': [b'synthetic-certificate'],
            'Entitlements': {'application-identifier': TEAM + '.' + bundle,
                             'com.apple.developer.team-identifier': TEAM, 'get-task-allow': False,
                             'com.apple.security.application-groups': [release.APP_GROUP],
                             'keychain-access-groups': [TEAM + '.*']}}


def info(bundle):
    return {'CFBundleIdentifier': bundle, 'CFBundleShortVersionString': '1.29.1', 'CFBundleVersion': '32',
            'CFBundleSupportedPlatforms': ['iPhoneOS'], 'ChatQAppGroup': release.APP_GROUP,
            'ChatQKeychainGroup': TEAM + '.' + release.KEYCHAIN_SUFFIX,
            'NSExtension': {'NSExtensionPointIdentifier': 'com.apple.keyboard-service',
                            'NSExtensionAttributes': {'RequestsOpenAccess': True}}}


class PackageTests(unittest.TestCase):
    def test_matching_device_metadata(self):
        release.validate_info(info(release.HOST), info(release.KEYBOARD), '1.29.1', '32')

    def test_simulator_version_and_keyboard_mismatches_rejected(self):
        for field, value in [('CFBundleSupportedPlatforms', ['iPhoneSimulator']),
                             ('CFBundleVersion', '31'), ('CFBundleIdentifier', release.HOST),
                             ('ChatQAppGroup', 'wrong.group'), ('NSExtension', {})]:
            with self.subTest(field=field):
                bad = info(release.KEYBOARD); bad[field] = value
                with self.assertRaises(ValueError):
                    release.validate_info(info(release.HOST), bad, '1.29.1', '32')

    def test_matching_profiles_allow_registered_devices(self):
        self.assertEqual(release.validate_profiles(profile(release.HOST), profile(release.KEYBOARD), TEAM), (TEAM, 1))

    def test_unsafe_or_incompatible_profiles_rejected(self):
        changes = [('TeamIdentifier', ['OTHERTEAM1']), ('ExpirationDate', datetime.datetime(2020, 1, 1)),
                   ('ProvisionedDevices', []), ('ProvisionedDevices', ['different-device']),
                   ('ProvisionsAllDevices', True), ('ApplicationIdentifierPrefix', []), ('DeveloperCertificates', [])]
        for field, value in changes:
            with self.subTest(field=field, value=value):
                bad = profile(release.KEYBOARD); bad[field] = value
                with self.assertRaises(ValueError):
                    release.validate_profiles(profile(release.HOST), bad, TEAM)

    def test_development_wildcard_or_missing_capabilities_rejected(self):
        for field, value in [('get-task-allow', True), ('application-identifier', TEAM + '.*'),
                             ('keychain-access-groups', ['*']), ('com.apple.security.application-groups', [])]:
            with self.subTest(field=field):
                bad = profile(release.KEYBOARD); bad['Entitlements'][field] = value
                with self.assertRaises(ValueError):
                    release.validate_profiles(profile(release.HOST), bad, TEAM)

    def test_export_must_keep_concrete_shared_keychain_and_team(self):
        ent = profile(release.HOST)['Entitlements']
        ent['keychain-access-groups'] = [TEAM + '.' + release.KEYCHAIN_SUFFIX]
        release.validate_entitlements(info(release.HOST), ent, release.HOST, TEAM, TEAM)
        for field, value in [('keychain-access-groups', [TEAM + '.*']),
                             ('com.apple.developer.team-identifier', 'OTHERTEAM1'), ('get-task-allow', True)]:
            with self.subTest(field=field):
                bad = copy.deepcopy(ent); bad[field] = value
                with self.assertRaises(ValueError):
                    release.validate_entitlements(info(release.HOST), bad, release.HOST, TEAM, TEAM)
        wrong_info = info(release.HOST); wrong_info['ChatQKeychainGroup'] = '$(AppIdentifierPrefix)' + release.KEYCHAIN_SUFFIX
        with self.assertRaises(ValueError):
            release.validate_entitlements(wrong_info, ent, release.HOST, TEAM, TEAM)


if __name__ == '__main__':
    unittest.main()
