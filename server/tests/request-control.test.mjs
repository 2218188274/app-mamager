import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { GenerationClaims, requestAbortSignal } from '../dist/services/ai/request-control.js';
import { generateUserReply } from '../dist/services/ai/user-reply.js';
import { AIService, OpenAIProvider, setGlobalAIService } from '../dist/services/ai/index.js';
import { users } from '../dist/db/schema.js';
import { router, protectedProcedure } from '../dist/trpc/index.js';
import { subscriptionManageRouter } from '../dist/routers/subscription-manage.js';

function database(status = 'active', onWrite = () => {}) {
 const user = { id: randomUUID(), status, deviceId: 'fixture-device' }; let committed = 0;
 const tx = {
  select: () => ({ from: table => ({ where: () => ({ limit: () => {
   const rows = table === users ? [user] : [];
   return { for: async () => rows, then: (resolve, reject) => Promise.resolve(rows).then(resolve, reject) };
  } }) }) }),
  insert: () => ({ values: async () => { onWrite(); } }),
 };
 return { user, get committed() { return committed; }, db: { ...tx, transaction: async fn => {
  let writes = 0; const result = await fn({ ...tx, insert: () => ({ values: async () => { writes++; onWrite(); } }) }); committed += writes; return result;
 } } };
}
const input = () => ({ text: 'isolated fixture', stylePrompt: 'friendly', requestId: randomUUID() });
function setup(store, generator, signal) {
 let calls = 0;
 const service = new AIService();
 service.registerProvider('mock', config => ({ config, isAvailable: () => true, validateConfig: () => true, generate: async request => {
  calls++; await generator?.(request);
  return { replies: [{ id: 'fixture', content: 'fixture' }], provider: { type: 'mock', model: 'fixture', tokensUsed: 1, processingTime: 1 } };
 } }));
 setGlobalAIService(service);
 const app = { id: randomUUID(), isActive: true, settings: { enableAI: true, aiProviders: [{ type: 'mock', enabled: true }], freeReplyLimitPerDay: 10 } };
 return { ctx: { db: store.db, app, userId: store.user.id, signal }, get calls() { return calls; } };
}
const code = expected => e => e.code === expected;
const deadline = (promise, ms = 3000) => Promise.race([promise, new Promise((_, reject) => { const t = setTimeout(() => reject(new Error('fixture deadline')), ms); t.unref(); })]);

test('replay protection isolates tenants/users, expires and has bounded storage', () => {
 const claims = new GenerationClaims(100, 2); const id = randomUUID();
 claims.claim('a', 'u', id, 0); assert.throws(() => claims.claim('a', 'u', id, 1), code('CONFLICT'));
 claims.claim('b', 'u', id, 1); assert.throws(() => claims.claim('a', 'v', id, 1), code('TOO_MANY_REQUESTS'));
 claims.claim('a', 'v', id, 101); claims.claim('a', 'u', undefined, 101);
 assert.throws(() => claims.claim('a', 'u', 'bad!', 101), code('BAD_REQUEST'));
});
test('protected routes reject disabled and suspended device users before the handler', async () => {
 let handled = 0; const appRouter = router({ probe: protectedProcedure.query(() => { handled++; return true; }) });
 for (const status of ['disabled', 'suspended']) {
  const store = database(status); const ctx = { db: store.db, app: { id: randomUUID(), isActive: true }, deviceId: store.user.deviceId };
  await assert.rejects(appRouter.createCaller(ctx).probe(), code('FORBIDDEN'));
 }
 assert.equal(handled, 0);
});
test('transaction lock checks current status before any model call or accounting', async () => {
 for (const status of ['disabled', 'suspended', 'pending_verification']) {
  const store = database(status); const fixture = setup(store);
  await assert.rejects(generateUserReply(fixture.ctx, input()), code('FORBIDDEN'));
  assert.equal(fixture.calls, 0); assert.equal(store.committed, 0);
 }
});
test('successful generation counts once; the same ID never invokes or charges twice', async () => {
 const store = database(); const f = setup(store); const request = input();
 await generateUserReply(f.ctx, request); await assert.rejects(generateUserReply(f.ctx, request), code('CONFLICT'));
 assert.equal(f.calls, 1); assert.equal(store.committed, 1);
});
test('pre-cancel and cancellation after model or during usage write roll back success accounting', async () => {
 for (const point of ['before', 'model', 'write']) {
  const controller = new AbortController(); const store = database('active', () => { if (point === 'write') controller.abort(); });
  const f = setup(store, async () => { if (point === 'model') controller.abort(); }, controller.signal);
  if (point === 'before') controller.abort();
  await assert.rejects(generateUserReply(f.ctx, input()), code('CLIENT_CLOSED_REQUEST'));
  assert.equal(store.committed, 0); assert.equal(f.calls, point === 'before' ? 0 : 1);
 }
});
test('model failure rolls back accounting and a replay cannot automatically repeat it', async () => {
 const store = database(); const f = setup(store, async () => { throw new Error('fixture failure'); }); const request = input();
 await assert.rejects(generateUserReply(f.ctx, request), code('BAD_GATEWAY'));
 await assert.rejects(generateUserReply(f.ctx, request), code('CONFLICT'));
 assert.equal(f.calls, 1); assert.equal(store.committed, 0);
});
test('plan creation normalizes currency and rejects malformed values at the actual route schema', () => {
 const schema = subscriptionManageRouter._def.procedures.createPlan._def.inputs[0];
 const plan = { appId: randomUUID(), name: 'fixture', productId: 'fixture', priceCents: 1200, durationDays: 30 };
 assert.equal(schema.parse(plan).currency, 'CNY'); assert.equal(schema.parse({ ...plan, currency: ' usd ' }).currency, 'USD');
 for (const currency of ['12!', '', 'TOOLONG', '人民币', null, 123]) assert.equal(schema.safeParse({ ...plan, currency }).success, false);
});
test('real client disconnect aborts the real upstream HTTP call, skips failover and rolls back quota', async () => {
 let upstreamStarted, upstreamClosed, handlerFinished;
 const started = new Promise(r => { upstreamStarted = r; }), closed = new Promise(r => { upstreamClosed = r; }), finished = new Promise(r => { handlerFinished = r; });
 const upstream = createServer(async (req, res) => { for await (const _ of req) {} res.on('close', upstreamClosed); upstreamStarted(); });
 await new Promise(r => upstream.listen(0, '127.0.0.1', r));
 const store = database(); const service = new AIService(); let fallbackCalls = 0;
 service.registerProvider('openai', c => new OpenAIProvider(c));
 service.registerProvider('anthropic', config => ({ config, isAvailable: () => true, validateConfig: () => true, generate: async () => { fallbackCalls++; throw new Error('must not failover'); } }));
 setGlobalAIService(service);
 const app = { id: randomUUID(), settings: { enableAI: true, aiProviders: [
  { type: 'openai', enabled: true, priority: 1, baseUrl: `http://127.0.0.1:${upstream.address().port}/v1`, apiKey: 'fixture', model: 'fixture', timeout: 10000 },
  { type: 'anthropic', enabled: true, priority: 2 },
 ] } };
 let failure;
 const api = createServer(async (req, res) => {
  const signal = requestAbortSignal(req, res); for await (const _ of req) {}
  try { await generateUserReply({ db: store.db, app, userId: store.user.id, signal }, input()); res.end('unexpected success'); }
  catch(e) { failure = e; if (!res.destroyed) res.end('cancelled'); }
  finally { handlerFinished(); }
 });
 await new Promise(r => api.listen(0, '127.0.0.1', r));
 try {
  const controller = new AbortController(); const result = fetch(`http://127.0.0.1:${api.address().port}`, { method: 'POST', body: '{}', signal: controller.signal });
  const rejected = assert.rejects(result, e => e.name === 'AbortError');
  await deadline(started); controller.abort(); await rejected; await deadline(Promise.all([closed, finished]));
  assert.equal(failure.code, 'CLIENT_CLOSED_REQUEST'); assert.equal(store.committed, 0); assert.equal(fallbackCalls, 0);
 } finally { api.closeAllConnections(); upstream.closeAllConnections(); await Promise.all([new Promise(r => api.close(r)), new Promise(r => upstream.close(r))]); }
});
test('normal HTTP completion does not cancel and removes transport listeners', async () => {
 let saved;
 const server = createServer(async (req, res) => { saved = { initialAborted: req.listenerCount('aborted'), initialFinish: res.listenerCount('finish'), signal: requestAbortSignal(req, res), req, res }; for await (const _ of req) {} res.end('ok'); });
 await new Promise(r => server.listen(0, '127.0.0.1', r));
 try { const response = await fetch(`http://127.0.0.1:${server.address().port}`, { method:'POST', body:'{}' }); assert.equal(await response.text(), 'ok'); assert.equal(saved.signal.aborted, false); assert.ok(saved.req.listenerCount('aborted') <= saved.initialAborted); assert.ok(saved.res.listenerCount('finish') <= saved.initialFinish); }
 finally { server.closeAllConnections(); await new Promise(r => server.close(r)); }
});
