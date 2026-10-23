import { generationClaims, requireActiveAIUser } from './request-control.js';
import { quotaSnapshot } from './keyboard-account.js';
import { and, eq } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { db } from '../../db/index.js';
import { users, subscriptions, usageRecords, type App } from '../../db/schema.js';
import { getGlobalAIService } from './index.js';
import { AIUpstreamError } from './providers/openai.js';
import type { AIGenerateRequest } from './types.js';

/** Both public reply routes share the same quota and atomic success accounting. */
export async function generateUserReply(
  ctx: { db: typeof db; app: App; userId: string; signal?: AbortSignal },
  input: Omit<AIGenerateRequest, 'appId' | 'userId'>,
) {
  const settings = ctx.app.settings;
  if (!settings?.enableAI) throw new TRPCError({ code: 'FORBIDDEN', message: '当前应用未启用 AI 功能' });
  try { return await ctx.db.transaction(async tx => {
    ctx.signal?.throwIfAborted();
    // Serialize each user's requests, including requests to different reply routes.
    const [user] = await tx.select().from(users).where(and(eq(users.id, ctx.userId), eq(users.appId, ctx.app.id))).limit(1).for('update');
    requireActiveAIUser(user);
    ctx.signal?.throwIfAborted();
    const today = new Date().toISOString().slice(0, 10);
    const [usage] = await tx.select().from(usageRecords).where(and(eq(usageRecords.userId, user.id), eq(usageRecords.date, today))).limit(1);
    const [sub] = await tx.select().from(subscriptions).where(eq(subscriptions.userId, user.id)).limit(1);
    const currentCount = usage?.replyCount ?? 0;
    const quota = quotaSnapshot(settings, currentCount, sub);
    const { isPro, limit } = quota;
    if (limit !== null && currentCount >= limit) throw new TRPCError({ code: 'FORBIDDEN', message: `今日回复次数已达到上限（${limit} 次）` });
    generationClaims.claim(ctx.app.id, user.id, input.requestId);
    const cap = quota.candidateLimit;
    const service = getGlobalAIService();
    service.initializeApp(ctx.app.id, settings);
    let response;
    try {
      response = await service.generate({ ...input, appId: ctx.app.id, userId: user.id, candidateCount: Math.min(input.candidateCount ?? 1, cap), signal: ctx.signal });
      ctx.signal?.throwIfAborted();
    } catch (error) {
      if (ctx.signal?.aborted) throw error;
      throw new TRPCError({ code: 'BAD_GATEWAY', message: error instanceof AIUpstreamError ? error.message : 'AI 生成失败，请联系管理员检查接口配置' });
    }
    const values = {
      replyCount: currentCount + 1,
      tokenCount: (usage?.tokenCount ?? 0) + (response.provider.tokensUsed ?? 0),
      aiProvider: response.provider.type, model: response.provider.model.slice(0, 100), success: true,
      durationMs: response.provider.processingTime,
    };
    if (usage) await tx.update(usageRecords).set(values).where(eq(usageRecords.id, usage.id));
    else await tx.insert(usageRecords).values({ ...values, userId: user.id, date: today });
    ctx.signal?.throwIfAborted();
    return { ...response, usage: { today: currentCount + 1, limit: isPro ? null : limit, isPro } };
  }); } catch (error) {
    if (ctx.signal?.aborted) throw new TRPCError({ code: 'CLIENT_CLOSED_REQUEST', message: '已取消生成' });
    throw error;
  }
}
