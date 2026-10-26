import { and, eq } from 'drizzle-orm';
import { usageRecords, subscriptions, subscriptionPlans, users } from '../../db/schema.js';
import type { Context } from '../../trpc/context.js';
import { inspectPaymentConfig } from '../payments/config.js';
import { paymentReadiness } from '../payments/readiness.js';
import { personalApiMode } from '../chatq-mode.js';

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
  const readiness=paymentReadiness(ctx.app.id,!!ctx.app.settings?.enableSubscription,plans,inspectPaymentConfig());
  if (personalApiMode(ctx.app.id)) return { mode:'free_personal_api', identity:{username:identity[0]?.username??null,mode:identity[0]?.username?'account':'guest'},quota:{...quotaSnapshot(ctx.app.settings,usage[0]?.count??0,subs[0],now),enabled:false},subscription:subs[0]??{tier:'free',status:'active',expiresAt:null},plans:[],purchaseAvailable:false,paymentReadiness:readiness };
  return { identity: { username: identity[0]?.username ?? null, mode: identity[0]?.username ? 'account' : 'guest' }, quota: quotaSnapshot(ctx.app.settings, usage[0]?.count ?? 0, subs[0], now), subscription: subs[0] ? { ...subs[0], status: subs[0].expiresAt && subs[0].expiresAt <= now ? 'expired' : subs[0].status } : { tier: 'free', status: 'active', expiresAt: null }, plans, purchaseAvailable: readiness.configurationReady,paymentReadiness:readiness };
}
