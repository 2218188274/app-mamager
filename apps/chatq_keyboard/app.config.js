module.exports = {
  expo: {
    name: '鑱婂晢', slug: 'chatq', scheme: 'chatq', version: '1.20.1', orientation: 'portrait',
    userInterfaceStyle: 'light', newArchEnabled: true,
    ios: { bundleIdentifier: 'com.jaxon.app.chatq', buildNumber: '26', supportsTablet: true, deploymentTarget: '15.1',
      infoPlist: { NSAppTransportSecurity: { NSAllowsArbitraryLoads: true }, ChatQAppGroup: 'group.com.jaxon.app.chatq' },
      entitlements: { 'com.apple.security.application-groups': ['group.com.jaxon.app.chatq'] } },
    android: { allowBackup: false, package: 'com.jaxon.app.chatq', versionCode: 26, permissions: ['INTERNET', 'RECORD_AUDIO'],
      edgeToEdgeEnabled: false },
    plugins: ['./plugins/withChatQKeyboard'],
    extra: { eas: { build: { experimental: { ios: { appExtensions: [{ targetName: 'ChatQKeyboard', bundleIdentifier: 'com.jaxon.app.chatq.keyboard', entitlements: { 'com.apple.security.application-groups': ['group.com.jaxon.app.chatq'] } }] } } } } },
  },
};
