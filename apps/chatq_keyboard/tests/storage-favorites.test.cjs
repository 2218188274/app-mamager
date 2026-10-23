const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { DatabaseSync } = require('node:sqlite');
function load(name, modules) {
  const source = ts.transpileModule(fs.readFileSync(require.resolve('../src/' + name), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {}; vm.runInNewContext(source, { exports, require: id => { if (!(id in modules)) throw Error(id); return modules[id]; }, Date, Set, Error }); return exports;
}
function storage(native = null) {
  const database = new DatabaseSync(':memory:');
  const bridge = {
    execAsync: async sql => database.exec(sql),
    runAsync: async (sql, args = []) => { const r = database.prepare(sql).run(...args); return { changes: Number(r.changes), lastInsertRowId: Number(r.lastInsertRowid) }; },
    getAllAsync: async (sql, args = []) => database.prepare(sql).all(...args),
    withExclusiveTransactionAsync: async task => { database.exec('BEGIN EXCLUSIVE'); try { await task(bridge); database.exec('COMMIT'); } catch (e) { database.exec('ROLLBACK'); throw e; } },
  };
  return { database, api: load('services/storage.ts', { '../../modules/chatq-keyboard': { keyboardBridge: native }, 'expo-sqlite': { openDatabaseAsync: async () => bridge } }) };
}
test('reply history commits separate candidates, searches original messages and deletes with cascading messages', async () => {
  const { database, api } = storage();
  try {
    await api.saveReplyConversation('第一条消息', ['候选一', '候选二']);
    await api.saveReplyConversation('第二条消息', ['不同的回复']);
    const rows = await api.searchConversations('候选二'); assert.equal(rows.length, 1);
    const messages = await api.getMessages(rows[0].id); assert.equal(messages.length, 3); assert.equal(messages[2].content, '候选二');
    await api.deleteConversation(rows[0].id); assert.equal((await api.getMessages(rows[0].id)).length, 0); assert.equal((await api.searchConversations('')).length, 1);
  } finally { database.close(); }
});
test('a failed candidate write rolls back the whole conversation and keeps earlier history', async () => {
  const { database, api } = storage();
  try {
    await api.saveReplyConversation('已保存', ['之前的回复']);
    database.exec("CREATE TRIGGER reject_candidate BEFORE INSERT ON messages WHEN NEW.content = 'fail-second' BEGIN SELECT RAISE(ABORT, 'disk write failure fixture'); END;");
    await assert.rejects(api.saveReplyConversation('不能留下半条记录', ['第一候选', 'fail-second']), /disk write failure/);
    assert.equal(database.prepare('SELECT count(*) AS n FROM conversations').get().n, 1);
    assert.equal(database.prepare('SELECT count(*) AS n FROM messages').get().n, 2);
  } finally { database.close(); }
});
test('history search treats percent, underscore and backslash as literal user input', async () => {
  const { database, api } = storage();
  try {
    await api.saveReplyConversation('100% 满意_a\\b', ['回复']);
    await api.saveReplyConversation('另一个主题', ['普通消息']);
    for (const query of ['%', '_', '\\']) assert.equal((await api.searchConversations(query)).length, 1);
    assert.equal((await api.searchConversations("' OR 1=1 --")).length, 0);
  } finally { database.close(); }
});
test('topic favorites persist locally, remove duplicates and recover a damaged saved list', async () => {
  const topics = require('../src/data/topics.json').categories;
  const saved = new Map();
  const api = load('services/favorites.ts', { '../../modules/chatq-keyboard': { keyboardBridge: null }, './topics': { topicCategories: topics }, '@react-native-async-storage/async-storage': { default: { getItem: async k => saved.get(k), setItem: async (k, v) => saved.set(k, v) } } });
  const id = topics[0].topics[0].id;
  await api.saveTopicFavorites([id, id, 'removed-or-unknown']);
  assert.deepEqual(Array.from(await api.loadTopicFavorites()), [id]);
  await api.saveTopicFavorites([]); assert.equal((await api.loadTopicFavorites()).length, 0);
  saved.set('chatq.topic-favorites.v1', '{broken'); assert.equal((await api.loadTopicFavorites()).length, 0);
});
test('host text and primary action colors meet normal-text contrast on their actual surfaces', () => {
  const { colors } = load('design.ts', { 'react-native': { StyleSheet: { create: value => value } } });
  const luminance = hex => { const v = hex.slice(1).match(/../g).map(x => parseInt(x, 16) / 255).map(x => x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4); return v[0] * .2126 + v[1] * .7152 + v[2] * .0722; };
  for (const [fg, bg] of [['ink','surface'],['secondary','surface'],['muted','background'],['primary','soft'],['surface','primary'],['success','successSoft']]) {
    const a = luminance(colors[fg]), b = luminance(colors[bg]); const ratio = (Math.max(a,b) + .05) / (Math.min(a,b) + .05);
    assert(ratio >= 4.5, fg + '/' + bg + ' contrast is ' + ratio);
  }
});

test('Android favorite edits use a per-ID mutation and return the latest IME list', async () => {
  const topics = require('../src/data/topics.json').categories;
  const calls = []; let native = ['daily-02'];
  const keyboardBridge = {
    getTopicFavorites: async () => JSON.stringify(native),
    initializeTopicFavorites: async value => { calls.push(['migration', JSON.parse(value)]); return JSON.stringify(native); },
    setTopicFavorite: async (id, saved) => { calls.push([id, saved]); native = ['daily-02', 'daily-03']; return JSON.stringify(native); },
  };
  const api = load('services/favorites.ts', { '../../modules/chatq-keyboard': { keyboardBridge }, './topics': { topicCategories: topics }, '@react-native-async-storage/async-storage': { default: { getItem: async () => '["daily-01"]' } } });
  assert.deepEqual(Array.from(await api.setTopicFavorite('daily-03', true)), ['daily-02','daily-03']);
  assert.deepEqual(calls, [['migration',['daily-01']],['daily-03',true]]);
  await assert.rejects(api.setTopicFavorite('unknown', true), /话题不存在/);
});

test('a legacy storage failure preserves available native favorites and never marks migration complete', async () => {
  const topics = require('../src/data/topics.json').categories; let initialized = false;
  const keyboardBridge = { getTopicFavorites: async () => '["daily-02"]', initializeTopicFavorites: async () => { initialized = true; return '[]'; } };
  const api = load('services/favorites.ts', { '../../modules/chatq-keyboard': { keyboardBridge }, './topics': { topicCategories: topics }, '@react-native-async-storage/async-storage': { default: { getItem: async () => { throw Error('disk unavailable'); } } } });
  assert.deepEqual(Array.from(await api.loadTopicFavorites()), ['daily-02']); assert.equal(initialized, false);
  keyboardBridge.getTopicFavorites = async () => null;
  await assert.rejects(api.loadTopicFavorites(), /disk unavailable/);
});

test('Android migrates old SQLite records before using the shared store and removes the old copy only after success', async () => {
  let migrated = [], saved = [];
  const native = {
    migrateGenerationHistory: async value => { migrated = JSON.parse(value); },
    saveGenerationHistory: async (...args) => { saved.push(args); return true; },
  };
  const { database, api } = storage(native);
  try {
    await api.initDatabase();
    database.exec("INSERT INTO conversations VALUES(5,'旧记录',1700000000000,1700000000000); INSERT INTO messages VALUES(1,5,'user','原消息',1700000000000); INSERT INTO messages VALUES(2,5,'assistant','旧候选',1700000000001);");
    await api.saveReplyConversation('新背景',['新话题'],'topic');
    assert.equal(migrated.length,1); assert.equal(migrated[0].uid,'legacy-5-1700000000000');assert.equal(migrated[0].replies[0],'旧候选');
    assert.equal(database.prepare('SELECT count(*) n FROM conversations').get().n,0);
    assert.equal(saved[0][2],'topic'); assert.equal(saved[0][0],'新背景');
  } finally { database.close(); }
});
test('a failed native migration retains the original SQLite records for retry', async () => {
 const { database, api } = storage({ migrateGenerationHistory: async () => { throw Error('storage unavailable'); }, saveGenerationHistory: async () => { throw Error('must not reach'); } });
 try {
  await api.initDatabase();
  database.exec("INSERT INTO conversations VALUES(1,'原记录',1700000000000,1700000000000);INSERT INTO messages VALUES(1,1,'assistant','保存的回复',1700000000000);");
  await assert.rejects(api.saveReplyConversation('新消息',['新回复']),/storage unavailable/);
  assert.equal(database.prepare('SELECT count(*) n FROM conversations').get().n,1);
  assert.equal(database.prepare('SELECT content FROM messages').get().content,'保存的回复');
 } finally { database.close(); }
});

test('legacy multi-turn conversations migrate every reply with its original prompt', async () => {
 let migrated=[];const {database,api}=storage({migrateGenerationHistory:async value=>{migrated=JSON.parse(value);}});
 try {
  await api.initDatabase();database.exec("INSERT INTO conversations VALUES(1,'旧聊天',1700000000000,1700000000000)");
  for (const [id,role,content] of [[1,'user','第一句'],[2,'assistant','回复一'],[3,'assistant','回复二'],[4,'assistant','回复三'],[5,'assistant','回复四'],[6,'user','第二句'],[7,'assistant','回复五']]) database.prepare('INSERT INTO messages VALUES(?,1,?,?,?)').run(id,role,content,1700000000000+id);
  await api.migrateHistory();assert.equal(migrated.length,3);assert.deepEqual(migrated.flatMap(r=>r.replies),['回复一','回复二','回复三','回复四','回复五']);assert.equal(migrated[2].prompt,'第二句');assert.equal(new Set(migrated.map(r=>r.uid)).size,3);
 } finally {database.close();}
});
