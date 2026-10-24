module.exports = {
  expo: {
    name: '鑱婂晢', slug: 'chatq', scheme: 'chatq', version: '1.19.0', orientation: 'portrait',
    userInterfaceStyle: 'light', newArchEnabled: true,
    ios: { bundleIdentifier: 'com.jaxon.app.chatq', buildNumber: '24', supportsTablet: true, deploymentTarget: '15.1',
      infoPlist: { NSAppTransportSecurity: { NSAllowsArbitraryLoads: true }, ChatQAppGroup: 'group.com.jaxon.app.chatq' },
      entitlements: { 'com.apple.security.application-groups': ['group.com.jaxon.app.chatq'] } },
    android: { allowBackup: false, package: 'com.jaxon.app.chatq', versionCode: 24, permissions: ['INTERNET', 'RECORD_AUDIO'],
      edgeToEdgeEnabled: false },
    plugins: ['./plugins/withChatQKeyboard'],
    extra: { eas: { build: { experimental: { ios: { appExtensions: [{ targetName: 'ChatQKeyboard', bundleIdentifier: 'com.jaxon.app.chatq.keyboard', entitlements: { 'com.apple.security.application-groups': ['group.com.jaxon.app.chatq'] } }] } } } } },
  },
};
