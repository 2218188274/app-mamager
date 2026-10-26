// All database writes are scoped to connection-local TEMP clones. No live orders or credentials.
import assert from 'node:assert/strict';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq } from 'drizzle-orm';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, chmodSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import * as schema from '../dist/db/schema.js';
import { paymentManageRouter } from '../dist/routers/payment-manage.js';
import { generateAdminToken, generateUserToken } from '../dist/utils/jwt.js';
import { paymentBinding, paymentSignature } from '../dist/services/payments/jeepay.js';
const connection = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} }), db = drizzle(connection, { schema });
const dir = mkdtempSync(join(tmpdir(), 'chatq-admin-payment-')); chmodSync(dir, 0o700);
let checks = 0, queries = 0, wire;
const check = (v, label) => { assert.ok(v, label); checks++; };
const reject = async (p, pattern) => { await assert.rejects(p, pattern); checks++; };
const secret = randomBytes(32).toString('hex');
const gateway = createServer(async (req, res) => {
  queries++; for await (const b of req) { /* Synthetic fixture request only. */ }
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ code: 0, data: wire, sign: paymentSignature(wire, secret) }));
});
try {
  for (const name of ['admins', 'apps', 'users', 'subscriptions', 'subscription_plans', 'chatq_payment_orders']) {
    await connection.unsafe('CREATE TEMP TABLE ' + name + ' (LIKE public.' + name + ' INCLUDING ALL)');
    const [row] = await connection.unsafe("SELECT to_regclass('" + name + "')::oid != to_regclass('public." + name + "')::oid AS isolated");
    check(row.isolated, name + ' isolated');
  }
  const appFixture = name => ({ name, bundleId: 'qa.' + randomUUID(), apiKey: randomUUID(), apiSecret: randomUUID(), configName: 'chatq', settings: { enableSubscription: false } });
  const [app, other, unrelated] = await db.insert(schema.apps).values([appFixture('payment fixture'), appFixture('other fixture'), { ...appFixture('non-chatq'), configName: 'default' }]).returning();
  const makeAdmin = async role => (await db.insert(schema.admins).values({ username: randomUUID(), email: randomUUID() + '@fixture.invalid', passwordHash: 'synthetic', role }).returning())[0];
  const admin = await makeAdmin('super_admin'), regular = await makeAdmin('admin');
  const ctx = (a = admin, secure = true) => ({ db, authorization: 'Bearer ' + generateAdminToken(a), req: { protocol: secure ? 'https' : 'http', ip: '192.0.2.1', headers: {} }, res: { header() {} } });
  const caller = paymentManageRouter.createCaller(ctx());
  process.env.CHATQ_PAYMENT_CONFIG_FILE = join(dir, 'merchant.json');
  process.env.CHATQ_PAYMENT_ADMIN_WRITE = 'true';
  await reject(paymentManageRouter.createCaller({ db }).status({ appId: app.id }), /管理员认证/);
  await reject(caller.status({ appId: unrelated.id }), /聊商应用/);
  let status = await caller.status({ appId: app.id });
  check(status.configuration.editable && status.configuration.revision === 'none', 'empty private configuration editable');
  check(!status.readiness.salesEnabled && !status.livePaymentsVerified, 'no sale or live acceptance claimed');
  await new Promise(r => gateway.listen(0, '127.0.0.1', r));
  const origin = 'http://127.0.0.1:' + gateway.address().port;
  const values = { appId: app.id, endpoint: origin, mchNo: 'M1', merchantAppId: 'A1', secret, notifyUrl: origin + '/api/aikeyboard/payments/notify', cashierOrigin: origin, expectedRevision: 'none' };
  await reject(paymentManageRouter.createCaller(ctx(regular)).configure(values), /超级管理员/);
  await reject(paymentManageRouter.createCaller(ctx(admin, false)).configure(values), /HTTPS/);
  await reject(caller.configure({ ...values, secret: 'short' }), /签名密钥/);
  const saved = await caller.configure(values);
  check(saved.saved && !saved.salesEnabled, 'configuration saved without enabling sales');
  status = await caller.status({ appId: app.id });
  check(status.configuration.hasSecret && !JSON.stringify(status).includes(secret), 'status never returns secret');
  check((await caller.status({ appId: other.id })).configuration.fields === null, 'other application configuration hidden');
  check(!(await caller.status({ appId: other.id })).configuration.editable, 'other application cannot overwrite gateway');
  check(!(await paymentManageRouter.createCaller(ctx(regular)).status({ appId: app.id })).configuration.editable, 'regular admin cannot save');
  await reject(caller.configure(values), /已被修改/);
  const retained = await caller.configure({ ...values, expectedRevision: saved.revision, secret: undefined });
  check(retained.revision === saved.revision && JSON.parse(readFileSync(process.env.CHATQ_PAYMENT_CONFIG_FILE)).secret === secret, 'blank field retains credential');
  await db.update(schema.apps).set({ settings: { enableSubscription: true } }).where(eq(schema.apps.id, app.id));
  await reject(caller.configure({ ...values, expectedRevision: saved.revision }), /关闭新订单/);
  await db.update(schema.apps).set({ settings: { enableSubscription: false } }).where(eq(schema.apps.id, app.id));
  const [user] = await db.insert(schema.users).values({ appId: app.id, deviceId: randomUUID(), username: 'qa_account', passwordHash: 'synthetic' }).returning();
  await reject(paymentManageRouter.createCaller({ ...ctx(), authorization: 'Bearer ' + generateUserToken(user, app.id) }).status({ appId: app.id }), /Token/);
  const [plan] = await db.insert(schema.subscriptionPlans).values({ appId: app.id, name: 'QA', productId: randomUUID(), tier: 'pro_monthly', currency: 'CNY', priceCents: 100, durationDays: 30 }).returning();
  const cfg = JSON.parse(readFileSync(process.env.CHATQ_PAYMENT_CONFIG_FILE));
  const id = randomUUID(), orderNo = 'CQ' + id.replaceAll('-', '').slice(0, 28);
  const [order] = await db.insert(schema.chatqPaymentOrders).values({ id, orderNo, appId: app.id, userId: user.id, planId: plan.id, requestId: randomUUID(), name: 'QA', tier: 'pro_monthly', durationDays: 30, amount: 100, currency: 'CNY', binding: paymentBinding(cfg), status: 'ready', checkoutUrl: origin + '/cashier/fixture', expiresAt: new Date(Date.now() + 60000) }).returning();
  wire = { mchNo: 'M1', appId: 'A1', mchOrderNo: orderNo, payOrderId: 'QA1', amount: 100, currency: 'CNY', state: 2 };
  const list = await caller.orders({ appId: app.id });
  check(list.total === 1 && list.items[0].username === 'qa_account', 'orders include account and amount');
  check(list.items[0].checkoutUrl === null && !('binding' in list.items[0]), 'sensitive order internals omitted');
  check((await caller.orders({ appId: other.id })).total === 0, 'other app has no orders');
  check((await caller.orders({ appId: app.id, search: 'qa_acc' })).total === 1, 'literal account search works');
  check((await caller.orders({ appId: app.id, search: '%' })).total === 0, 'search percent is literal');
  check((await caller.orders({ appId: app.id, status: 'paid' })).total === 0, 'status filter works');
  await reject(caller.reconcile({ appId: other.id, orderId: order.id }), /不属于/);
  check(queries === 0, 'foreign order never reaches gateway');
  const paid = await caller.reconcile({ appId: app.id, orderId: order.id });
  check(paid.status === 'paid' && queries === 1, 'admin reconciliation grants confirmed membership');
  const [sub] = await db.select().from(schema.subscriptions);
  await caller.reconcile({ appId: app.id, orderId: order.id });
  check((await db.select().from(schema.subscriptions))[0].expiresAt.getTime() === sub.expiresAt.getTime(), 'repeat query never grants twice');
  // Fresh admin identity avoids the per-admin change rate limit masking the historical binding guard.
  const fresh = await makeAdmin('super_admin');
  await reject(paymentManageRouter.createCaller(ctx(fresh)).configure({ ...values, expectedRevision: saved.revision, mchNo: 'M2' }), /历史订单/);
  check(JSON.parse(readFileSync(process.env.CHATQ_PAYMENT_CONFIG_FILE)).mchNo === 'M1', 'historical binding preserved');
  await db.update(schema.admins).set({ tokenVersion: admin.tokenVersion + 1 }).where(eq(schema.admins.id, admin.id));
  await reject(caller.status({ appId: app.id }), /失效/);
  console.log('PASS ' + checks + ' payment admin checks; TEMP-only, no real gateway requests');
} finally {
  await new Promise(r => gateway.close(r));
  await connection.end();
  rmSync(dir, { recursive: true, force: true });
}
