import { z } from 'zod';
import { and, count, desc, eq, ilike, or } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { router, adminProcedure } from '../trpc/index.js';
import { apps, chatqPaymentOrders, subscriptionPlans, users } from '../db/schema.js';
import { inspectPaymentConfig, PaymentConfigError, validatePaymentConfig } from '../services/payments/config.js';
import { paymentConfigEditable, paymentConfigRevision, savePaymentConfig } from '../services/payments/config-store.js';
import { isPurchasablePlan, paymentReadiness } from '../services/payments/readiness.js';
import { paymentBinding } from '../services/payments/jeepay.js';
import { paymentView, reconcilePayment } from '../services/payments/orders.js';
import { interactionLimit } from '../services/interaction-limit.js';
import type { Context } from '../trpc/context.js';

const appInput = z.object({ appId: z.string().uuid() }).strict();
const orderStatuses = ['pending', 'creating', 'ready', 'unknown', 'paid', 'closed', 'refund_review', 'entitlement_review'] as const;
async function selectedApp(database: Context['db'], appId: string) {
  const [app] = await database.select().from(apps).where(eq(apps.id, appId)).limit(1);
  if (!app || app.configName !== 'chatq') throw new TRPCError({ code: 'NOT_FOUND', message: '请选择聊商应用后管理 Jeepay 支付' });
  return app;
}
function noCache(ctx: Context) { ctx.res?.header('Cache-Control', 'no-store'); }
function secureWrite(ctx: Context) {
  const req = ctx.req;
  const secure = req?.protocol === 'https' || process.env.CHATQ_PAYMENT_TRUST_PROXY === 'true' && req?.headers['x-forwarded-proto'] === 'https';
  const local = process.env.NODE_ENV !== 'production' && ['127.0.0.1', '::1'].includes(req?.ip || '');
  if (!secure && !local) throw new TRPCError({ code: 'FORBIDDEN', message: '请通过 HTTPS 管理后台保存支付配置' });
}
export const paymentManageRouter = router({
  status: adminProcedure.input(appInput).query(async ({ ctx, input }) => {
    noCache(ctx); const app = await selectedApp(ctx.db, input.appId), inspection = inspectPaymentConfig();
    const plans = await ctx.db.select().from(subscriptionPlans).where(eq(subscriptionPlans.appId, app.id));
    const own = inspection.config?.appId === app.id ? inspection.config : null;
    const states = await ctx.db.select({ status: chatqPaymentOrders.status, count: count() }).from(chatqPaymentOrders).where(eq(chatqPaymentOrders.appId, app.id)).groupBy(chatqPaymentOrders.status);
    let revision = 'unavailable'; try { revision = paymentConfigRevision(); } catch { /* Report sanitized diagnostics only. */ }
    return {
      readiness: paymentReadiness(app.id, !!app.settings?.enableSubscription, plans.filter(p => p.isActive), inspection),
      configuration: { status: inspection.status, issues: inspection.issues, hasSecret: !!own, revision, editable: ctx.admin.role === 'super_admin' && paymentConfigEditable() && !app.settings?.enableSubscription && revision !== 'unavailable' && ['file_missing', 'ready'].includes(inspection.status) && (!inspection.config || !!own), fields: own ? { endpoint: own.endpoint, mchNo: own.mchNo, merchantAppId: own.merchantAppId, notifyUrl: own.notifyUrl, cashierOrigin: own.cashierOrigin } : null },
      plans: plans.map(p => ({ id: p.id, name: p.name, active: p.isActive, purchasable: p.isActive && isPurchasablePlan(p) })),
      orders: states, livePaymentsVerified: false,
    };
  }),
  configure: adminProcedure.input(z.object({ appId: z.string().uuid(), expectedRevision: z.string().regex(/^(none|[a-f0-9]{64})$/), endpoint: z.string().max(2048), mchNo: z.string().max(64), merchantAppId: z.string().max(64), secret: z.string().max(256).optional(), notifyUrl: z.string().max(128), cashierOrigin: z.string().max(2048) }).strict()).mutation(async ({ ctx, input }) => {
    noCache(ctx); secureWrite(ctx);
    if (ctx.admin.role !== 'super_admin') throw new TRPCError({ code: 'FORBIDDEN', message: '仅超级管理员可以保存商户配置' });
    interactionLimit(`pay-config:${ctx.admin.id}`, 8);
    return ctx.db.transaction(async tx => {
      const [app] = await tx.select().from(apps).where(eq(apps.id, input.appId)).limit(1).for('update');
      if (!app || app.configName !== 'chatq') throw new TRPCError({ code: 'NOT_FOUND', message: '请选择聊商应用' });
      if (app.settings?.enableSubscription) throw new TRPCError({ code: 'PRECONDITION_FAILED', message: '请先关闭新订单销售，再修改支付配置' });
      const existing = inspectPaymentConfig();
      if (existing.config && existing.config.appId !== app.id) throw new TRPCError({ code: 'CONFLICT', message: '此网关已绑定其他应用，不能覆盖其商户配置' });
      const { expectedRevision, secret, ...fields } = input;
      let config;
      try { config = validatePaymentConfig({ ...fields, secret: secret || existing.config?.secret }); }
      catch (error) { throw new TRPCError({ code: 'BAD_REQUEST', message: error instanceof PaymentConfigError ? error.message : '商户配置格式不正确' }); }
      const [orders] = await tx.select({ count: count() }).from(chatqPaymentOrders).where(eq(chatqPaymentOrders.appId, app.id));
      if (orders.count && (!existing.config || paymentBinding(config) !== paymentBinding(existing.config))) throw new TRPCError({ code: 'PRECONDITION_FAILED', message: '已有历史订单，不能直接替换其商户配置；请维护人员保留旧配置后安排迁移' });
      const revision = savePaymentConfig(config, expectedRevision, ctx.admin.id);
      return { saved: true, revision, salesEnabled: false, livePaymentsVerified: false, message: '配置已保存，新订单销售保持关闭。仍需通道和实付验收。' };
    });
  }),
  orders: adminProcedure.input(z.object({ appId: z.string().uuid(), search: z.string().trim().max(80).default(''), status: z.enum(orderStatuses).optional(), page: z.number().int().min(1).max(10000).default(1), pageSize: z.number().int().min(1).max(50).default(20) }).strict()).query(async ({ ctx, input }) => {
    noCache(ctx); await selectedApp(ctx.db, input.appId);
    const conditions = [eq(chatqPaymentOrders.appId, input.appId)];
    if (input.status) conditions.push(eq(chatqPaymentOrders.status, input.status));
    if (input.search) { const term = '%' + input.search.replace(/[\\%_]/g, '\\$&') + '%'; conditions.push(or(ilike(chatqPaymentOrders.orderNo, term), ilike(chatqPaymentOrders.transactionId, term), ilike(users.username, term))!); }
    const where = and(...conditions), join = and(eq(chatqPaymentOrders.userId, users.id), eq(users.appId, input.appId));
    const [total] = await ctx.db.select({ count: count() }).from(chatqPaymentOrders).leftJoin(users, join).where(where);
    const rows = await ctx.db.select({ order: chatqPaymentOrders, username: users.username }).from(chatqPaymentOrders).leftJoin(users, join).where(where).orderBy(desc(chatqPaymentOrders.createdAt), desc(chatqPaymentOrders.id)).limit(input.pageSize).offset((input.page - 1) * input.pageSize);
    return { total: total.count, page: input.page, items: rows.map(({ order, username }) => ({ ...paymentView(order), checkoutUrl: null, transactionId: order.transactionId, username })) };
  }),
  reconcile: adminProcedure.input(z.object({ appId: z.string().uuid(), orderId: z.string().uuid() }).strict()).mutation(async ({ ctx, input }) => {
    noCache(ctx); await selectedApp(ctx.db, input.appId); interactionLimit(`pay-admin-check:${ctx.admin.id}`, 15);
    const [order] = await ctx.db.select().from(chatqPaymentOrders).where(and(eq(chatqPaymentOrders.id, input.orderId), eq(chatqPaymentOrders.appId, input.appId))).limit(1);
    if (!order) throw new TRPCError({ code: 'NOT_FOUND', message: '订单不属于当前应用或不存在' });
    const config = inspectPaymentConfig().config;
    if (!config || config.appId !== input.appId) throw new TRPCError({ code: 'PRECONDITION_FAILED', message: '原订单商户配置尚未就绪，暂不能向网关核对' });
    const result = paymentView(await reconcilePayment(config, order.id, ctx.db));
    return { ...result, checkoutUrl: null };
  }),
});
