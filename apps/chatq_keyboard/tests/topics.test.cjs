const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), path = require('node:path'), ts = require('typescript');
const root = path.join(__dirname, '..');
const data = require('../src/data/topics.json');
const exportsObject = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root, 'src/services/topics.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText, { exports: exportsObject, require: () => data });
test('all 64 authored topics have unique ids and usable opening and follow-up text', () => {
  assert.equal(data.categories.length, 8);
  const items = data.categories.flatMap(c => c.topics);
  assert.equal(items.length, 64); assert.equal(new Set(items.map(t => t.id)).size, 64); assert.equal(new Set(items.map(t => t.opener)).size, 64);
  for (const item of items) for (const key of ['title', 'opener', 'followUp']) assert.ok(item[key].trim().length > 0 && item[key].length <= 150);
});
test('offline batches rotate without immediate repeats and wrap safely', () => {
  for (const category of data.categories) {
    const first = exportsObject.topicBatch(category.id, 0), next = exportsObject.topicBatch(category.id, 1);
    assert.equal(first.length, 3); assert.ok(next.every(t => !first.some(f => f.id === t.id)));
    const seen = new Set(Array.from({ length: 8 }, (_, i) => exportsObject.topicBatch(category.id, i)).flat().map(t => t.id));
    assert.equal(seen.size, 8);
  }
  assert.equal(exportsObject.topicBatch('missing', -1).length, 3);
});
test('Android and iOS ship exactly the same offline library as the host app', () => {
  const source = fs.readFileSync(path.join(root, 'src/data/topics.json'));
  for (const name of ['modules/chatq-keyboard/android/src/main/assets/topics.json', 'native/ios/ChatQKeyboard/topics.json', 'ios/ChatQKeyboard/topics.json']) assert.ok(source.equals(fs.readFileSync(path.join(root, name))), name);
});
