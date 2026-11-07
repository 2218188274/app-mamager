const androidProduction = process.env.CHATQ_ANDROID_EDITION === 'production';
module.exports = {
  expo: {
    name: '聊商', slug: 'chatq', scheme: androidProduction ? 'chatq-release' : 'chatq', version: '1.30.2', orientation: 'portrait',
    userInterfaceStyle: 'light', newArchEnabled: true, icon: './assets/brand/icon.png',
    ios: { bundleIdentifier: 'com.jaxon.app.chatq', buildNumber: '32', supportsTablet: true, deploymentTarget: '15.1',
      infoPlist: { NSAppTransportSecurity: { NSAllowsLocalNetworking: true }, ChatQAppGroup: 'group.com.jaxon.app.chatq', ChatQKeychainGroup: '$(AppIdentifierPrefix)com.jaxon.app.chatq.shared' },
      entitlements: { 'com.apple.security.application-groups': ['group.com.jaxon.app.chatq'], 'keychain-access-groups': ['$(AppIdentifierPrefix)com.jaxon.app.chatq.shared'] } },
    android: { allowBackup: false, package: androidProduction ? 'com.jaxon.app.chatq.release' : 'com.jaxon.app.chatq', versionCode: 48, permissions: ['INTERNET', 'RECORD_AUDIO'],
      adaptiveIcon: { foregroundImage: './assets/brand/adaptive-foreground.png', backgroundColor: '#7054C8' }, edgeToEdgeEnabled: false },
    plugins: ['./plugins/withChatQKeyboard'],
    extra: { eas: { build: { experimental: { ios: { appExtensions: [{ targetName: 'ChatQKeyboard', bundleIdentifier: 'com.jaxon.app.chatq.keyboard', entitlements: { 'com.apple.security.application-groups': ['group.com.jaxon.app.chatq'], 'keychain-access-groups': ['$(AppIdentifierPrefix)com.jaxon.app.chatq.shared'] } }] } } } } },
  },
};
