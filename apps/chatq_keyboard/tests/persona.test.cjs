const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function client(native = true) {
  const saved = new Map(), shared = new Map(); let failure = false;
  const storage = { getItem: async key => saved.get(key) || null, setItem: async (key, value) => saved.set(key, value), removeItem: async key => saved.delete(key) };
  const bridge = { getPersonalization: async () => shared.get('data') || null, savePersonalization: async value => { if (failure) throw new Error('disk full'); shared.set('data', value); }, getPersonaSelection: async () => shared.get('selection') || null, savePersonaSelection: async value => shared.set('selection', value) };
  const exports = {};
  const source = ts.transpileModule(fs.readFileSync(require.resolve('../src/services/persona.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(source, { exports, require: name => name.includes('async-storage') ? { default: storage } : { keyboardBridge: native ? bridge : null } });
  return { api: exports, shared, saved, fail: () => { failure = true; } };
}
const plain = value => JSON.parse(JSON.stringify(value));

test('quick personas prioritize pinned and recent while keeping selected visible', async () => {
  const { api } = client(false); const state = await api.loadPersona();
  state.data.cards = Array.from({length:6},(_,i)=>api.cleanCard({id:'p'+i,name:'人设'+i,length:'short',instructions:'',tagWeights:{},pinned:i===1||i===2}));
  state.selection = {cardId:'p5',sceneId:'',relationId:'',recentIds:['p3','p4']};
  assert.deepEqual(plain(api.quickPersonas(state).map(c=>c.id)),['p1','p2','p5']);
  assert.deepEqual(plain(api.quickPersonas(state,1).map(c=>c.id)),['p5']);
});
test('queued relation, goal and persona changes merge and survive reload without stale overwrites', async () => {
  const { api } = client(false); const state = await api.loadPersona();
  state.data.relations=[{id:'friend',name:'朋友'}]; await api.savePersonaData(state.data);
  await Promise.all([api.updatePersonaSelection({cardId:state.data.cards[1].id}),api.updatePersonaSelection({relationId:'friend'}),api.updatePersonaSelection({goalId:'decline',warmth:'reserved'})]);
  const next = await api.loadPersona(); assert.equal(next.selection.cardId,state.data.cards[1].id); assert.equal(next.selection.relationId,'friend'); assert.equal(next.selection.goalId,'decline');
  const payload=api.replyPersonalization(next); assert.match(payload.customPrompt,/拒绝/); assert.match(payload.customPrompt,/克制/); assert.equal(payload.relationId,'friend');
  const cleaned = api.validSelection(next.data,{...next.selection,goalId:'unknown',warmth:'unknown',recentIds:['deleted',next.selection.cardId,next.selection.cardId]});
  assert.equal(cleaned.goalId,undefined); assert.equal(cleaned.warmth,undefined); assert.equal(cleaned.recentIds.length,1);
});
test('upgrades an existing installation to a usable default without losing keyboard selections during card edits', async () => {
  const { api, shared } = client();
  let state = await api.loadPersona(); assert.equal(state.selection.cardId, 'daily');
  state.data.scenes = [{ id: 'daily', name: '日常' }]; state.data.relations = [{ id: 'friend', name: '朋友' }];
  await api.savePersonaData(state.data);
  shared.set('selection', JSON.stringify({ cardId: 'daily', sceneId: 'daily', relationId: 'friend' }));
  state.data.cards[0].instructions = '少用感叹号';
  state = await api.savePersonaData(state.data);
  assert.deepEqual(plain(state.selection), { cardId: 'daily', sceneId: 'daily', relationId: 'friend' });
  assert.equal((await api.loadPersona()).data.cards[0].instructions, '少用感叹号');
});
test('deleted active cards and removed server options fall back and never leak stale ids into requests', async () => {
  const { api, shared } = client(); let state = await api.loadPersona();
  state.data.cards.push({ id: 'work', name: '职场', instructions: '简洁', tagWeights: { competent: 0.6 }, length: 'normal' });
  await api.savePersonaData(state.data);
  shared.set('selection', JSON.stringify({ cardId: 'work', sceneId: 'deleted', relationId: 'deleted' }));
  state = await api.savePersonaData({ ...state.data, cards: [] });
  assert.deepEqual(plain(state.selection), { cardId: '', sceneId: '', relationId: '' });
  assert.deepEqual(plain(api.replyPersonalization(state)), {});
});
test('preset tags use server weights, edits are bounded, and generated fields include only selected data', async () => {
  const { api } = client();
  const catalog = { dimensions: [{ tags: [{ id: 'gentle', weight_default: 0.7 }] }] };
  const card = api.cardFromPackage({ name: '温柔', description: '先共情', tags: ['gentle', 'missing'] }, catalog);
  assert.deepEqual(plain(card.tagWeights), { gentle: 0.7 });
  card.instructions = 'a'.repeat(500); card.tagWeights.invalid = 20; card.tagWeights.nan = NaN;
  const cleaned = api.cleanCard(card); assert.equal(cleaned.instructions.length, 300); assert.equal(cleaned.tagWeights.invalid, 0.9); assert(!('nan' in cleaned.tagWeights));
  const data = { version: 1, cards: [cleaned], scenes: [{ id: 'daily', name: '日常' }], relations: [{ id: 'friend', name: '朋友' }] };
  const fields = api.replyPersonalization({ data, selection: { cardId: card.id, sceneId: 'daily', relationId: 'friend' } }, 'b'.repeat(250), '礼貌拒绝');
  assert.equal(fields.context.length, 200); assert(fields.customPrompt.length <= 500); assert.match(fields.customPrompt, /礼貌拒绝/); assert.equal(fields.sceneId, 'daily'); assert.equal(fields.relationId, 'friend');
  assert(!JSON.stringify(fields).includes('apiKey'));
});
test('corrupt storage recovers and a failed native save does not report a successful local-only edit', async () => {
  const { api, shared, saved, fail } = client(); shared.set('data', '{broken');
  const state = await api.loadPersona(); assert.equal(state.data.cards[0].name, '自然真诚');
  fail(); await assert.rejects(api.savePersonaData(state.data), /disk full/); assert.equal(saved.size, 0);
});
test('non-native storage persists cards and defaults across loads', async () => {
  const { api } = client(false); let state = await api.loadPersona();
  state.data.cards[0].name = '我的习惯'; await api.savePersonaData(state.data);
  assert.equal((await api.loadPersona()).data.cards[0].name, '我的习惯');
});
