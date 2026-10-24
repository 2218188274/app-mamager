const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
function load(name) { const exports = {}; vm.runInNewContext(ts.transpileModule(fs.readFileSync(require.resolve('../src/services/' + name + '.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports, Error }); return exports; }
const e = load('expressions'), replies = load('replyCards');
test('expression search finds meanings, emoji and kaomoji without unexpected category leakage', () => {
  assert.equal(e.expressions.length, 40);
  assert.equal(new Set(e.expressions.map(x => x.id)).size, 40);
  assert.equal(e.findExpressions('抱抱').length, 2);
  assert.equal(e.findExpressions('抱抱', 'love').length, 1);
  assert.equal(e.findExpressions('  👋 ')[0].label, '你好');
  assert.equal(e.findExpressions('not-a-sticker').length, 0);
});
test('adding emoji retains source and prior revisions; limits never silently truncate a reply', () => {
  const original = replies.replyCards(['明天见！'], '自然')[0];
  const decorated = replies.decorateReply(original, e.appendExpression(original.text, '😊'));
  assert.equal(decorated.text, '明天见！ 😊');
  assert.equal(replies.previousReply(decorated).text, original.text);
  assert.equal(decorated.label, original.label);
  assert.throws(() => e.appendExpression('x'.repeat(999), '😊'), /1000/);
  assert.throws(() => e.appendExpression('文字', 'arbitrary'), /选择/);
  assert.equal(original.versions.length, 0);
});
