import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { OpenAIProvider, completionEndpoint } from '../dist/services/ai/providers/openai.js';
import { AIService } from '../dist/services/ai/service.js';
import { redactAISettings, mergeAIProviders } from '../dist/services/ai/config.js';

const secret = 'fixture-secret-never-return';
const request = { appId: 'test-app', text: '今天有点累', stylePrompt: '友好', maxTokens: 100, candidateCount: 1 };
let mode = 'success', calls = [], label = '真实协议响应';
const server = createServer(async (req, res) => {
  let body = '';
  for await (const chunk of req) body += chunk;
  calls.push({ url: req.url, method: req.method, auth: req.headers.authorization, body: JSON.parse(body) });
  if (mode === 'slow') { await new Promise(resolve => setTimeout(resolve, 1400)); }
  if (mode === 'redirect') { res.writeHead(302, { Location: '/stolen' }); return res.end(); }
  if (/^error/.test(mode)) { res.writeHead(Number(mode.slice(5))); return res.end(JSON.stringify({ error: secret })); }
  if (mode === 'html') return res.end('<html>wrong endpoint</html>');
  if (mode === 'large') return res.end('x'.repeat(1024 * 1024 + 100));
  const content = mode === 'empty' ? '' : mode === 'multiple' ? '["候选一","候选二","候选三"]' : mode === 'bad-list' ? '["只有一条"]' : label;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ model: 'fixture-model', choices: [{ message: { content }, finish_reason: mode === 'truncated' ? 'length' : 'stop' }], usage: { total_tokens: 123 } }));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}/v1`;
const config = { type: 'openai', enabled: true, priority: 1, apiKey: secret, baseUrl: url, model: 'fixture-model', timeout: 1000 };
const provider = new OpenAIProvider(config);

try {
  await test('normalizes base and full endpoint; rejects credential/query URLs', () => {
    assert.equal(completionEndpoint('https://example.com'), 'https://example.com/v1/chat/completions');
    assert.equal(completionEndpoint('https://example.com/api/v3/'), 'https://example.com/api/v3/chat/completions');
    assert.equal(completionEndpoint('https://example.com/v1/chat/completions/'), 'https://example.com/v1/chat/completions');
    for (const bad of ['file:///tmp/x', 'https://u:p@example.com', 'https://example.com?key=x', 'nonsense']) assert.throws(() => completionEndpoint(bad));
  });
  await test('sends real HTTP request and returns upstream content/usage', async () => {
    const result = await provider.generate(request);
    assert.equal(result.replies[0].content, label);
    assert.equal(result.provider.tokensUsed, 123);
    assert.equal(calls[0].url, '/v1/chat/completions');
    assert.equal(calls[0].method, 'POST');
    assert.equal(calls[0].auth, `Bearer ${secret}`);
    assert.equal(calls[0].body.model, 'fixture-model');
    assert.equal(calls[0].body.messages[1].content, request.text);
    assert.equal(calls[0].body.stream, false);
    assert.equal(calls[0].body.max_tokens, 100);
    assert.ok(!JSON.stringify(result).includes(secret));
  });
  await test('one request for three validated candidate replies', async () => {
    mode = 'multiple'; const previous = calls.length;
    const result = await provider.generate({ ...request, candidateCount: 3 });
    assert.equal(result.replies.length, 3);
    assert.equal(calls.length, previous + 1);
    assert.equal(calls.at(-1).body.max_tokens, 300);
    assert.ok(!('n' in calls.at(-1).body));
  });
  await test('topics use an opening-topic system instruction rather than replying to an invented message', async () => {
    mode = 'success'; await provider.generate({ ...request, intent: 'topic', text: '主动开启一个日常话题' });
    assert.match(calls.at(-1).body.messages[0].content, /聊天话题助手/);
    assert.match(calls.at(-1).body.messages[0].content, /主动发起/);
    assert.equal(calls.at(-1).body.messages[1].content, '主动开启一个日常话题');
  });
  await test('polish keeps the author perspective and does not answer the original question', async () => {
    mode = 'success'; await provider.generate({ ...request, intent: 'polish', text: '明天 3 点可以见面吗？' });
    assert.match(calls.at(-1).body.messages[0].content, /表达润色助手/);
    assert.match(calls.at(-1).body.messages[0].content, /不要回答原文里的问题/);
    assert.match(calls.at(-1).body.messages[0].content, /保留原意、人称、事实、时间、数字和承诺/);
    assert.equal(calls.at(-1).body.messages[1].content, '明天 3 点可以见面吗？');
  });
  await test('supports completion token parameter and omitting temperature', async () => {
    mode = 'success';
    await new OpenAIProvider({ ...config, tokenParameter: 'max_completion_tokens', sendTemperature: false }).generate(request);
    assert.equal(calls.at(-1).body.max_completion_tokens, 100);
    assert.ok(!('temperature' in calls.at(-1).body));
    assert.ok(!('max_tokens' in calls.at(-1).body));
  });
  await test('HTTP failures are actionable and never expose vendor payload secrets', async () => {
    for (const status of [400, 401, 402, 403, 404, 429, 500]) {
      mode = `error${status}`;
      await assert.rejects(provider.generate(request), error => error.message.includes(String(status)) && !error.message.includes(secret));
    }
  });
  await test('rejects malformed, empty, truncated, oversized and redirected responses', async () => {
    for (const failure of ['html', 'empty', 'truncated', 'large', 'redirect']) {
      mode = failure; await assert.rejects(provider.generate(request));
    }
    mode = 'bad-list'; await assert.rejects(provider.generate({ ...request, candidateCount: 3 }));
  });
  await test('aborts upstream calls on timeout', async () => {
    mode = 'slow'; const start = Date.now();
    await assert.rejects(provider.generate(request), /超时/);
    assert.ok(Date.now() - start < 1350);
  });
  await test('config edits invalidate old cache; disabling AI denies cached results', async () => {
    mode = 'success'; const service = new AIService({ enableCache: true });
    service.registerProvider('openai', c => new OpenAIProvider(c));
    service.initializeApp(request.appId, { enableAI: true, aiProviders: [config] });
    await service.generate(request);
    label = '新配置的回复';
    service.initializeApp(request.appId, { enableAI: true, aiProviders: [{ ...config, model: 'new-model' }] });
    assert.equal((await service.generate(request)).replies[0].content, label);
    service.initializeApp(request.appId, { enableAI: false, aiProviders: [config] });
    await assert.rejects(service.generate(request));
  });
  await test('real-provider failure cannot fall back to mock', async () => {
    mode = 'error401'; let mockCalled = false;
    const service = new AIService();
    service.registerProvider('openai', c => new OpenAIProvider(c));
    service.registerProvider('mock', () => ({ isAvailable: () => true, validateConfig: () => true, generate: async () => { mockCalled = true; return {}; } }));
    service.initializeApp(request.appId, { enableAI: true, aiProviders: [config, { type: 'mock', enabled: true, priority: 100 }] });
    await assert.rejects(service.generate(request), /401/);
    assert.equal(mockCalled, false);
  });
  await test('redaction removes keys without changing stored settings; blank edits retain keys', () => {
    const settings = { apiKey: secret, aiProviders: [config] };
    assert.ok(!JSON.stringify(redactAISettings(settings)).includes(secret));
    assert.equal(settings.aiProviders[0].apiKey, secret);
    assert.equal(mergeAIProviders([{ ...config, apiKey: '' }], [config])[0].apiKey, secret);
  });
} finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
