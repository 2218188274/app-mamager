module.exports = {
  expo: {
    name: '聊商', slug: 'chatq', scheme: 'chatq', version: '1.24.0', orientation: 'portrait',
    userInterfaceStyle: 'light', newArchEnabled: true, icon: './assets/brand/icon.png',
    ios: { bundleIdentifier: 'com.jaxon.app.chatq', buildNumber: '31', supportsTablet: true, deploymentTarget: '15.1',
      infoPlist: { NSAppTransportSecurity: { NSAllowsArbitraryLoads: true }, ChatQAppGroup: 'group.com.jaxon.app.chatq' },
      entitlements: { 'com.apple.security.application-groups': ['group.com.jaxon.app.chatq'] } },
    android: { allowBackup: false, package: 'com.jaxon.app.chatq', versionCode: 35, permissions: ['INTERNET', 'RECORD_AUDIO'],
      adaptiveIcon: { foregroundImage: './assets/brand/adaptive-foreground.png', backgroundColor: '#7054C8' }, edgeToEdgeEnabled: false },
    plugins: ['./plugins/withChatQKeyboard'],
    extra: { eas: { build: { experimental: { ios: { appExtensions: [{ targetName: 'ChatQKeyboard', bundleIdentifier: 'com.jaxon.app.chatq.keyboard', entitlements: { 'com.apple.security.application-groups': ['group.com.jaxon.app.chatq'] } }] } } } } },
  },
};
