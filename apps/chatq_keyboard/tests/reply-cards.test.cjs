const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
function load(name, modules = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(require.resolve('../src/services/' + name + '.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports, require: name => modules[name], Date, Set, Error });
  return exports;
}
test('single reply refinement preserves other cards and restores exact text and label', () => {
  const api = load('replyCards'); const cards = api.replyCards(['原句', '第二句'], '温柔 · 安慰');
  const changed = api.reviseReply(cards[0], ' 更短 ', 'shorter');
  assert.equal(changed.text, '更短'); assert.equal(cards[0].text, '原句'); assert.equal(cards[1].text, '第二句');
  assert.equal(api.previousReply(changed).text, '原句'); assert.equal(api.previousReply(changed).label, '温柔 · 安慰');
  assert.equal(api.reviseReply(cards[0], '原句', 'natural'), cards[0]);
  assert.throws(() => api.reviseReply(cards[0], '', 'natural')); assert.throws(() => api.reviseReply(cards[0], 'x'.repeat(1001), 'natural'));
  let card = cards[0]; for (let i = 0; i < 8; i++) card = api.reviseReply(card, 'v' + i, 'natural');
  assert.equal(card.versions.length, 4); assert.equal(card.label, '更自然 · 温柔 · 安慰');
});
function saved() {
  const data = new Map(); let fail = false;
  const api = load('savedReplies', { '../../modules/chatq-keyboard': { keyboardBridge: null }, '@react-native-async-storage/async-storage': { default: { getItem: async key => data.get(key), setItem: async (key,value) => { if(fail) throw new Error('disk full'); data.set(key,value); } } } });
  return { api, data, fail: value => { fail = value; } };
}
test('concurrent favorites preserve both sentences, deduplicate exact text and recover after failed writes', async () => {
  const { api, fail } = saved(); await Promise.all([api.setSavedReply('句一', '自然', true), api.setSavedReply('句二', '温柔', true)]);
  assert.equal((await api.loadSavedReplies()).length, 2); await api.setSavedReply('句一','更新',true); assert.equal((await api.loadSavedReplies()).length, 2);
  fail(true); await assert.rejects(api.setSavedReply('句三','',true), /disk full/); fail(false);
  assert.equal((await api.loadSavedReplies()).length, 2); await api.setSavedReply('句二','',false); assert.equal((await api.loadSavedReplies())[0].text,'句一');
});
test('corrupt or full favorites are never silently truncated or overwritten', async () => {
  const { api, data } = saved(); const key = 'chatq.savedReplies.v1'; const raw = JSON.stringify([{text:'保留',label:'',savedAt:1},{text:'bad',label:'',savedAt:-1}]); data.set(key,raw);
  await assert.rejects(api.setSavedReply('新句','',true)); assert.equal(data.get(key), raw);
  data.set(key,JSON.stringify(Array.from({length:100},(_,i)=>({text:'句'+i,label:'',savedAt:i}))));
  await assert.rejects(api.setSavedReply('第101句','',true), /100/); assert.equal((await api.loadSavedReplies()).length,100);
  await api.setSavedReply('句0','新标签',true); assert.equal((await api.loadSavedReplies()).length,100);
});
