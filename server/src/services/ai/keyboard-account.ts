import { and, eq } from 'drizzle-orm';
import { usageRecords, subscriptions, subscriptionPlans, users } from '../../db/schema.js';
import type { Context } from '../../trpc/context.js';
import { loadPaymentConfig } from '../payments/jeepay.js';

export function quotaSnapshot(settings: { enableAI?: boolean; freeReplyLimitPerDay?: number; freeCandidateCount?: number; proCandidateCount?: number } | null, used: number, sub: { tier: string; status: string; expiresAt: Date | null } | undefined, now = new Date()) {
  const isPro = !!sub && sub.tier !== 'free' && sub.status === 'active' && (!sub.expiresAt || sub.expiresAt > now);
  const limit = isPro ? null : (settings?.freeReplyLimitPerDay ?? 10);
  const day = now.toISOString().slice(0, 10);
  return { enabled: !!settings?.enableAI, date: day, resetsAt: new Date(Date.parse(day + 'T00:00:00Z') + 86400000).toISOString(), used, limit, remaining: limit === null ? null : Math.max(0, limit - used), isPro, candidateLimit: Math.max(1, Math.min(5, (isPro ? settings?.proCandidateCount : settings?.freeCandidateCount) ?? 1)) };
}

export async function keyboardAccount(ctx: Pick<Context, 'db'> & { app: NonNullable<Context['app']>; userId: string }) {
  const now = new Date();
  const [usage, subs, plans, identity] = await Promise.all([
    ctx.db.select({ count: usageRecords.replyCount }).from(usageRecords).where(and(eq(usageRecords.userId, ctx.userId), eq(usageRecords.date, now.toISOString().slice(0, 10)))).limit(1),
    ctx.db.select({ tier: subscriptions.tier, status: subscriptions.status, expiresAt: subscriptions.expiresAt }).from(subscriptions).where(eq(subscriptions.userId, ctx.userId)).limit(1),
    ctx.db.select({ id: subscriptionPlans.id, name: subscriptionPlans.name, tier: subscriptionPlans.tier, billingPeriod: subscriptionPlans.billingPeriod, priceCents: subscriptionPlans.priceCents, currency: subscriptionPlans.currency, durationDays: subscriptionPlans.durationDays, description: subscriptionPlans.description, features: subscriptionPlans.features }).from(subscriptionPlans).where(and(eq(subscriptionPlans.appId, ctx.app.id), eq(subscriptionPlans.isActive, true))).orderBy(subscriptionPlans.sortOrder),
    ctx.db.select({ username: users.username }).from(users).where(and(eq(users.id, ctx.userId), eq(users.appId, ctx.app.id))).limit(1),
  ]);
  const payment=loadPaymentConfig();
  const channelConfigured=payment?.appId===ctx.app.id,salesEnabled=!!ctx.app.settings?.enableSubscription;
  const purchasablePlans=plans.filter(p=>p.currency.toUpperCase()==='CNY'&&Number.isInteger(p.priceCents)&&p.priceCents>0&&p.priceCents<=10000000&&['pro_monthly','pro_yearly'].includes(p.tier)&&p.durationDays>=1&&p.durationDays<=36500).length;
  const message=!channelConfigured?'收款渠道尚未配置，暂不能购买会员。':!salesEnabled?'会员购买尚未开放，已付款订单仍可查询到账。':!purchasablePlans?'后台尚未上架可购买的人民币会员套餐。':'收款渠道已配置，请以实际支付与服务端到账结果为准。';
  return { identity: { username: identity[0]?.username ?? null, mode: identity[0]?.username ? 'account' : 'guest' }, quota: quotaSnapshot(ctx.app.settings, usage[0]?.count ?? 0, subs[0], now), subscription: subs[0] ? { ...subs[0], status: subs[0].expiresAt && subs[0].expiresAt <= now ? 'expired' : subs[0].status } : { tier: 'free', status: 'active', expiresAt: null }, plans, purchaseAvailable: salesEnabled&&channelConfigured&&purchasablePlans>0,paymentReadiness:{channelConfigured,salesEnabled,purchasablePlans,message} };
}
