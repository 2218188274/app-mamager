const { withAndroidManifest, withDangerousMod, withXcodeProject } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');
const NAME = 'ChatQKeyboard';
function addKeyboardTarget(project, app = require('../app.config').expo) {
  const versions = { CURRENT_PROJECT_VERSION: String(app.ios.buildNumber), MARKETING_VERSION: app.version };
  for (const value of Object.values(project.pbxXCBuildConfigurationSection())) {
    if (value && typeof value === 'object' && String(value.buildSettings?.PRODUCT_BUNDLE_IDENTIFIER).replace(/"/g, '') === app.ios.bundleIdentifier) Object.assign(value.buildSettings, versions);
  }
  project.hash.project.objects.PBXTargetDependency ||= {};
  project.hash.project.objects.PBXContainerItemProxy ||= {};
  const existing = Object.entries(project.pbxNativeTargetSection()).find(([, v]) => v && typeof v === 'object' && String(v.name).replace(/"/g, '') === NAME);
  if (existing) {
    const [id, target] = existing;
    const group = project.pbxGroupByName(NAME);
    const groupId = Object.entries(project.hash.project.objects.PBXGroup).find(([, v]) => v === group)?.[0];
    if (!Object.values(project.pbxFileReferenceSection()).some(v => v && typeof v === 'object' && String(v.path).replace(/"/g, '') === 'topics.json')) project.addResourceFile('topics.json', { target: id }, groupId);
    for (const item of project.pbxXCConfigurationList()[target.buildConfigurationList].buildConfigurations) Object.assign(project.pbxXCBuildConfigurationSection()[item.value].buildSettings, versions);
    return project;
  }
  const target = project.addTarget(NAME, 'app_extension', NAME, 'com.jaxon.app.chatq.keyboard');
  const group = project.addPbxGroup([], NAME, NAME);
  project.addToPbxGroup(group.uuid, project.getFirstProject().firstProject.mainGroup);
  project.addBuildPhase([], 'PBXSourcesBuildPhase', 'Sources', target.uuid);
  project.addBuildPhase([], 'PBXResourcesBuildPhase', 'Resources', target.uuid);
  project.addBuildPhase([], 'PBXFrameworksBuildPhase', 'Frameworks', target.uuid);
  project.addSourceFile('KeyboardViewController.swift', { target: target.uuid }, group.uuid);
  project.addSourceFile('PersonaPreferences.swift', { target: target.uuid }, group.uuid);
  project.addSourceFile('PinyinDecoder.mm', { target: target.uuid }, group.uuid);
  project.addSourceFile('PinyinCore/chatq_decoder.cpp', { target: target.uuid }, group.uuid);
  const shared = path.join(__dirname, '../modules/chatq-keyboard/vendor/pinyin');
  for (const file of fs.readdirSync(path.join(shared, 'jni/share')).filter(file => file.endsWith('.cpp'))) {
    project.addSourceFile(`PinyinCore/jni/share/${file}`, { target: target.uuid }, group.uuid);
  }
  // node-xcode expects a Resources group even when a custom target group is used.
  if (!project.pbxGroupByName('Resources')) {
    const resources = project.addPbxGroup([], 'Resources');
    project.addToPbxGroup(resources.uuid, group.uuid);
  }
  project.addResourceFile('dict_pinyin.dat', { target: target.uuid }, group.uuid);
  project.addResourceFile('pinyin-NOTICE.txt', { target: target.uuid }, group.uuid);
  project.addResourceFile('topics.json', { target: target.uuid }, group.uuid);
  project.addFile('Info.plist', group.uuid); project.addFile(`${NAME}.entitlements`, group.uuid);
  const configs = project.pbxXCBuildConfigurationSection();
  for (const item of project.pbxXCConfigurationList()[target.pbxNativeTarget.buildConfigurationList].buildConfigurations) {
    Object.assign(configs[item.value].buildSettings, {
      INFOPLIST_FILE: `"${NAME}/Info.plist"`, CODE_SIGN_ENTITLEMENTS: `"${NAME}/${NAME}.entitlements"`,
      PRODUCT_BUNDLE_IDENTIFIER: 'com.jaxon.app.chatq.keyboard', PRODUCT_NAME: `"${NAME}"`,
      SWIFT_VERSION: '5.9', IPHONEOS_DEPLOYMENT_TARGET: '15.1', TARGETED_DEVICE_FAMILY: '"1,2"',
      APPLICATION_EXTENSION_API_ONLY: 'YES', SKIP_INSTALL: 'YES', CODE_SIGN_STYLE: 'Automatic',
      ...versions, GENERATE_INFOPLIST_FILE: 'NO',
      SWIFT_OBJC_BRIDGING_HEADER: `"${NAME}/ChatQKeyboard-Bridging-Header.h"`,
      CLANG_CXX_LANGUAGE_STANDARD: '"c++17"', CLANG_CXX_LIBRARY: '"libc++"',
      CLANG_ENABLE_MODULES: 'YES', SWIFT_OPTIMIZATION_LEVEL: configs[item.value].name === 'Debug' ? '"-Onone"' : '"-O"',
    });
  }
  const root = project.getFirstProject().firstProject;
  root.attributes.TargetAttributes ||= {};
  root.attributes.TargetAttributes[target.uuid] = { CreatedOnToolsVersion: '16.0', SystemCapabilities: { 'com.apple.ApplicationGroups.iOS': { enabled: 1 } } };
  // node-xcode adds the host dependency and PlugIns copy phase in addTarget.
  for (const value of Object.values(project.pbxBuildFileSection())) {
    if (value && typeof value === 'object' && value.fileRef === target.pbxNativeTarget.productReference) value.settings = { ATTRIBUTES: ['RemoveHeadersOnCopy'] };
  }
  return project;
}
module.exports = function withChatQKeyboard(config) {
  config = withAndroidManifest(config, mod => {
    mod.modResults.manifest.application[0].$['android:networkSecurityConfig'] = '@xml/chatq_network_security';
    mod.modResults.manifest.application[0].$['android:allowBackup'] = 'false';
    mod.modResults.manifest.application[0].$['android:fullBackupContent'] = '@xml/chatq_backup_rules';
    mod.modResults.manifest.application[0].$['android:dataExtractionRules'] = '@xml/chatq_data_extraction_rules';
    return mod;
  });
  config = withDangerousMod(config, ['android', async mod => {
    const directory = path.join(mod.modRequest.platformProjectRoot, 'app/src/main/res/xml');
    fs.mkdirSync(directory, { recursive: true });
    const exclusions = ['root','file','database','sharedpref','external'].map(domain => `<exclude domain="${domain}" path="."/>`).join('');
    fs.writeFileSync(path.join(directory, 'chatq_backup_rules.xml'), `<full-backup-content>${exclusions}</full-backup-content>`);
    fs.writeFileSync(path.join(directory, 'chatq_data_extraction_rules.xml'), `<data-extraction-rules><cloud-backup>${exclusions}</cloud-backup><device-transfer>${exclusions}</device-transfer></data-extraction-rules>`);
    fs.writeFileSync(path.join(directory, 'chatq_network_security.xml'), '<?xml version="1.0" encoding="utf-8"?><network-security-config><base-config cleartextTrafficPermitted="false"/><domain-config cleartextTrafficPermitted="true"><domain includeSubdomains="false">103.149.91.78</domain><domain includeSubdomains="false">localhost</domain><domain includeSubdomains="false">10.0.2.2</domain></domain-config></network-security-config>');
    return mod;
  }]);
  config = withDangerousMod(config, ['ios', async mod => {
    const extension = path.join(mod.modRequest.platformProjectRoot, NAME);
    const core = path.join(mod.modRequest.projectRoot, 'modules/chatq-keyboard/vendor/pinyin');
    fs.cpSync(path.join(mod.modRequest.projectRoot, 'native/ios', NAME), extension, { recursive: true });
    fs.cpSync(core, path.join(extension, 'PinyinCore'), { recursive: true });
    fs.copyFileSync(path.join(core, 'res/raw/dict_pinyin.dat'), path.join(extension, 'dict_pinyin.dat'));
    fs.copyFileSync(path.join(core, 'NOTICE'), path.join(extension, 'pinyin-NOTICE.txt'));
    return mod;
  }]);
  return withXcodeProject(config, mod => { addKeyboardTarget(mod.modResults, mod); return mod; });
};
module.exports.addKeyboardTarget = addKeyboardTarget;
