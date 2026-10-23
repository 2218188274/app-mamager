const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const source = ts.transpileModule(fs.readFileSync(require.resolve('../src/services/configData.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
function client() {
  const saved = new Map(); let online = true, app = 'a', malformed = false, requests = 0;
  const exports = {};
  vm.runInNewContext(source, { exports, require: name => name.includes('async-storage') ? { default: { getItem: async key => saved.get(key), setItem: async (key, value) => saved.set(key, value), removeItem: async key => saved.delete(key) } } : { getApiConfig: () => ({ baseUrl: 'https://fixture.invalid', apiKey: app }) }, AbortController, setTimeout, clearTimeout,
    fetch: async () => { requests++; if (!online) throw new TypeError('offline'); return { ok: true, json: async () => ({ result: { data: malformed ? {} : [] } }) }; },
  });
  return { api: exports, saved, offline: () => { online = false; }, otherApp: () => { app = 'b'; }, malformed: () => { malformed = true; }, requests: () => requests };
}
test('expired catalogs stay available offline, while a different app cannot read the previous app catalog', async () => {
  const c = client(); await c.api.fetchConfigData(); assert.equal(c.requests(), 4);
  for (const [key, raw] of c.saved) { const value = JSON.parse(raw); value.fetchedAt = 1; c.saved.set(key, JSON.stringify(value)); }
  c.offline(); const cached = await c.api.getConfigData(); assert.equal(cached.fetchedAt, 1);
  c.otherApp(); assert.equal(await c.api.getConfigData(), null);
});
test('malformed remote catalogs cannot replace a previously usable cache', async () => {
  const c = client(); await c.api.fetchConfigData(); const previous = [...c.saved.values()][0];
  c.malformed(); assert.equal(await c.api.fetchConfigData(), null); assert.equal([...c.saved.values()][0], previous);
});
