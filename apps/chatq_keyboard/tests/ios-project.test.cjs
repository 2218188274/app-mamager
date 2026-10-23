const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const xcode = require('xcode');
const root = path.join(__dirname, '../ios');
const app = require('../app.config').expo;
test('iOS keyboard includes offline decoder, dictionary, bridging header and host embedding', () => {
  const file = path.join(root, fs.readdirSync(root).find(x => x.endsWith('.xcodeproj')), 'project.pbxproj');
  const project = xcode.project(file).parseSync();
  const [id, target] = Object.entries(project.pbxNativeTargetSection()).find(([, value]) => value && typeof value === 'object' && String(value.name).replaceAll('"', '') === 'ChatQKeyboard');
  const objects = project.hash.project.objects;
  const phases = target.buildPhases.map(item => Object.values(objects).map(section => section[item.value]).find(value => value && typeof value === 'object' && value.isa?.endsWith('BuildPhase')));
  const files = phase => phase.files.map(entry => objects.PBXFileReference[objects.PBXBuildFile[entry.value].fileRef].path.replaceAll('"', ''));
  const sources = files(phases.find(p => p.isa === 'PBXSourcesBuildPhase'));
  const resources = files(phases.find(p => p.isa === 'PBXResourcesBuildPhase'));
  assert(sources.includes('KeyboardViewController.swift'));
  assert(sources.includes('PersonaPreferences.swift'));
  assert(sources.includes('PinyinDecoder.mm'));
  assert(sources.includes('PinyinCore/chatq_decoder.cpp'));
  assert(sources.includes('PinyinCore/jni/share/matrixsearch.cpp'));
  assert(resources.includes('dict_pinyin.dat'));
  assert(resources.includes('pinyin-NOTICE.txt'));
  assert(resources.includes('topics.json'));
  for (const item of [...sources, ...resources, 'ChatQKeyboard-Bridging-Header.h']) assert(fs.existsSync(path.join(root, 'ChatQKeyboard', item)), item);
  assert(fs.readFileSync(path.join(root, 'ChatQKeyboard/dict_pinyin.dat')).equals(fs.readFileSync(path.join(__dirname, '../modules/chatq-keyboard/vendor/pinyin/res/raw/dict_pinyin.dat'))));
  const settings = objects.XCConfigurationList[target.buildConfigurationList].buildConfigurations.map(item => objects.XCBuildConfiguration[item.value].buildSettings);
  const hostSettings = Object.values(objects.XCBuildConfiguration).filter(v => v && typeof v === 'object' && String(v.buildSettings?.PRODUCT_BUNDLE_IDENTIFIER).replaceAll('"', '') === app.ios.bundleIdentifier).map(v => v.buildSettings);
  assert(hostSettings.length >= 2);
  for (const value of hostSettings) { assert.equal(String(value.CURRENT_PROJECT_VERSION), app.ios.buildNumber); assert.equal(String(value.MARKETING_VERSION), app.version); }
  for (const config of settings) {
    assert(config.SWIFT_OBJC_BRIDGING_HEADER.includes('ChatQKeyboard-Bridging-Header.h'));
    assert(config.CLANG_CXX_LANGUAGE_STANDARD.includes('c++17'));
    assert.equal(String(config.CURRENT_PROJECT_VERSION), app.ios.buildNumber);
    assert.equal(String(config.MARKETING_VERSION), app.version);
  }
  assert(Object.values(objects.PBXTargetDependency).some(value => value && typeof value === 'object' && value.target === id));
  assert(Object.values(objects.PBXCopyFilesBuildPhase).some(value => value && typeof value === 'object' && String(value.dstSubfolderSpec) === '13' && value.files.some(item => objects.PBXBuildFile[item.value].fileRef === target.productReference)));
});
test('extension versions follow app configuration on repeated prebuilds', () => {
  const file = path.join(root, fs.readdirSync(root).find(x => x.endsWith('.xcodeproj')), 'project.pbxproj');
  const project = xcode.project(file).parseSync();
  require('../plugins/withChatQKeyboard').addKeyboardTarget(project, { version: '2.0.1', ios: { buildNumber: '42' } });
  const target = Object.values(project.pbxNativeTargetSection()).find(v => v && typeof v === 'object' && String(v.name).replaceAll('"', '') === 'ChatQKeyboard');
  for (const item of project.pbxXCConfigurationList()[target.buildConfigurationList].buildConfigurations) {
    const settings = project.pbxXCBuildConfigurationSection()[item.value].buildSettings;
    assert.equal(settings.CURRENT_PROJECT_VERSION, '42'); assert.equal(settings.MARKETING_VERSION, '2.0.1');
  }
  for (const directory of ['../native/ios/ChatQKeyboard', '../ios/ChatQKeyboard']) {
    const info = fs.readFileSync(path.join(__dirname, directory, 'Info.plist'), 'utf8');
    assert(info.includes('$(MARKETING_VERSION)')); assert(info.includes('$(CURRENT_PROJECT_VERSION)'));
  }
});
