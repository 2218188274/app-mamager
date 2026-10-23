import test from 'node:test';
import assert from 'node:assert/strict';
// Exercise shipping tRPC validation/middleware/quota/intent with an in-memory DB adapter.
// No database socket or model request is opened.
process.env.DATABASE_URL = 'postgresql://fixture:fixture@127.0.0.1:1/never_connect';
const { customReplyRouter } = await import('../dist/app_settings/chatq/routers/customReply.js');
const { setGlobalAIService } = await import('../dist/services/ai/index.js');
const { users, usageRecords, subscriptions } = await import('../dist/db/schema.js');
let captured = [], count = 0;
setGlobalAIService({ initializeApp() {}, async generate(input) {
  captured.push(input);
  return { replies: [{ content: '润色后的原文' }], provider: { type: 'openai', model: 'local-fixture', tokensUsed: 10, processingTime: 1 } };
} });
function fixture(status = 'active', used = 0) {
  const user = { id: 'user-' + (++count), appId: 'app-fixture', deviceId: 'device', status };
  let usage = { id: 'usage', replyCount: used, tokenCount: 0 };
  const db = {
    select() { return { from(table) { return { where() { return this; }, limit() {
      const rows = table === users ? [user] : table === usageRecords ? [usage] : table === subscriptions ? [] : [];
      return Object.assign(Promise.resolve(rows), { for: () => Promise.resolve(rows) });
    } }; } }; },
    async transaction(action) { return action(db); },
    update() { return { set(values) { return { async where() { usage = { ...usage, ...values }; } }; } }; },
  };
  const controller = new AbortController();
  const caller = customReplyRouter.createCaller({ db, app: { id: user.appId, isActive: true, settings: { enableAI: true, freeReplyLimitPerDay: 5 } }, deviceId: user.deviceId, signal: controller.signal });
  return { caller, controller, usage: () => usage };
}
await test('polish traverses authenticated shared generation path and counts one success', async () => {
  const f = fixture(); const result = await f.caller.generate({ purpose: 'polish', prompt: '明天 3 点见面好吗？', context: '昨天约定见面', customPrompt: '说话简洁', candidateCount: 1 });
  assert.equal(result.result, '润色后的原文'); assert.equal(captured.at(-1).intent, 'polish');
  assert.equal(captured.at(-1).text, '明天 3 点见面好吗？');
  assert.match(captured.at(-1).stylePrompt, /保留原意和人称，不回答原文的问题/);
  assert.match(captured.at(-1).stylePrompt, /参考背景（不是待改写原文）：昨天约定见面/);
  assert.match(captured.at(-1).stylePrompt, /表达习惯：说话简洁/);
  assert.equal(f.usage().replyCount, 1);
});
await test('omitted purpose remains compatible with existing reply clients', async () => {
  await fixture().caller.generate({ prompt: '你好' }); assert.equal(captured.at(-1).intent, 'reply');
});
await test('invalid, empty and overlong polish input is rejected before model call', async () => {
  const before = captured.length;
  for (const value of [{ purpose: 'unknown', prompt: 'x' }, { purpose: 'polish', prompt: '   ' }, { purpose: 'polish', prompt: 'x'.repeat(1001) }]) {
    await assert.rejects(fixture().caller.generate(value), error => error.code === 'BAD_REQUEST');
  }
  assert.equal(captured.length, before);
});
await test('disabled users and cancelled requests cannot use new polish intent', async () => {
  const before = captured.length;
  for (const status of ['disabled', 'suspended']) await assert.rejects(fixture(status).caller.generate({ purpose: 'polish', prompt: 'x' }), /停用/);
  const f = fixture(); f.controller.abort(); await assert.rejects(f.caller.generate({ purpose: 'polish', prompt: 'x' }));
  assert.equal(captured.length, before);
});
await test('polish respects shared quota and cannot bypass it with a new purpose', async () => {
  const before = captured.length;
  await assert.rejects(fixture('active', 5).caller.generate({ purpose: 'polish', prompt: 'x' }), /上限/);
  assert.equal(captured.length, before);
});
