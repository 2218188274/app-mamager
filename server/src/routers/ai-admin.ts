import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { router, adminProcedure } from '../trpc/index.js';
import { apps, type AppSettings, type AIProviderConfig } from '../db/schema.js';
import { OpenAIProvider, completionEndpoint, AIUpstreamError } from '../services/ai/providers/openai.js';
import { getGlobalAIService } from '../services/ai/index.js';
import type { Context } from '../trpc/context.js';

const appInput = z.object({ appId: z.string().uuid() });
const configInput = appInput.extend({
  enabled: z.boolean(),
  baseUrl: z.string().trim().min(1).max(2048).refine(value => {
    try { completionEndpoint(value); return true; } catch { return false; }
  }, '请输入有效的 HTTP/HTTPS API 地址，不要包含查询参数'),
  apiKey: z.string().trim().max(4096).optional(),
  model: z.string().trim().min(1, '请填写模型名称').max(200),
  timeout: z.number().int().min(5000).max(120000).default(60000),
  tokenParameter: z.enum(['max_tokens', 'max_completion_tokens']).default('max_tokens'),
  sendTemperature: z.boolean().default(true),
});

async function getApp(ctx: Context, appId: string) {
  const [app] = await ctx.db.select().from(apps).where(eq(apps.id, appId)).limit(1);
  if (!app) throw new TRPCError({ code: 'NOT_FOUND', message: '应用不存在' });
  return app;
}

function publicConfig(settings: AppSettings | null) {
  const provider = settings?.aiProviders?.find(p => p.type === 'openai');
  return {
    enabled: settings?.enableAI === true && provider?.enabled === true,
    baseUrl: provider?.baseUrl || 'https://api.openai.com/v1',
    model: provider?.model || 'gpt-4o-mini',
    hasApiKey: !!provider?.apiKey,
    timeout: provider?.timeout ?? 60000,
    tokenParameter: provider?.tokenParameter ?? 'max_tokens' as const,
    sendTemperature: provider?.sendTemperature ?? true,
  };
}

function resolveProvider(input: z.infer<typeof configInput>, settings: AppSettings | null): AIProviderConfig {
  const previous = settings?.aiProviders?.find(p => p.type === 'openai');
  if (!input.apiKey && previous?.apiKey && completionEndpoint(previous.baseUrl) !== completionEndpoint(input.baseUrl)) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'API 地址已改变，请重新填写该地址对应的密钥' });
  }
  const apiKey = input.apiKey || previous?.apiKey;
  if (input.enabled && !apiKey) throw new TRPCError({ code: 'BAD_REQUEST', message: '启用 AI 前请填写 API 密钥' });
  return {
    type: 'openai', enabled: input.enabled, priority: 1, apiKey,
    baseUrl: input.baseUrl, model: input.model, timeout: input.timeout,
    tokenParameter: input.tokenParameter, sendTemperature: input.sendTemperature,
  };
}

function apiError(error: unknown): never {
  if (error instanceof TRPCError) throw error;
  throw new TRPCError({ code: 'BAD_GATEWAY', message: error instanceof AIUpstreamError ? error.message : 'AI 请求失败，请检查配置后重试' });
}

export const aiAdminRouter = router({
  config: adminProcedure.input(appInput).query(async ({ ctx, input }) => {
    const app = await getApp(ctx, input.appId);
    return { appId: app.id, appName: app.name, ...publicConfig(app.settings) };
  }),
  save: adminProcedure.input(configInput).mutation(async ({ ctx, input }) => {
    const app = await getApp(ctx, input.appId);
    const provider = resolveProvider(input, app.settings);
    const settings: AppSettings = {
      freeReplyLimitPerDay: 10, freeCandidateCount: 1, proCandidateCount: 3, enableSubscription: false,
      ...app.settings, enableAI: input.enabled, defaultAIProvider: 'openai', aiProviders: [provider],
    };
    delete settings.apiKey;
    await ctx.db.update(apps).set({ settings, updatedAt: new Date() }).where(eq(apps.id, input.appId));
    getGlobalAIService().initializeApp(app.id, settings);
    return { appId: app.id, appName: app.name, ...publicConfig(settings) };
  }),
  // Tests the form's draft values without saving, using a real short completion.
  test: adminProcedure.input(configInput).mutation(async ({ ctx, input }) => {
    const app = await getApp(ctx, input.appId);
    const provider = resolveProvider({ ...input, enabled: true }, app.settings);
    try {
      const response = await new OpenAIProvider(provider).generate({ appId: app.id, text: '你好，请简短打个招呼。', maxTokens: 256, candidateCount: 1 });
      return { reply: response.replies[0]!.content, ...response.provider };
    } catch (error) { return apiError(error); }
  }),
  // Uses saved settings and exactly the same service as client replies.
  reply: adminProcedure.input(appInput.extend({
    text: z.string().trim().min(1).max(2000),
    context: z.string().trim().max(2000).default(''),
    style: z.enum(['friendly', 'professional', 'funny', 'emoji']).default('friendly'),
    candidateCount: z.number().int().min(1).max(3).default(1),
  })).mutation(async ({ ctx, input }) => {
    const app = await getApp(ctx, input.appId);
    if (!app.isActive || !app.settings?.enableAI) throw new TRPCError({ code: 'FORBIDDEN', message: '请先保存并启用当前应用的 AI 配置' });
    if (!app.settings.aiProviders?.some(p => p.type === 'openai' && p.enabled && p.apiKey)) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: '请先配置真实 AI 接口和密钥' });
    }
    const styles = { friendly: '自然亲切，像朋友聊天', professional: '专业礼貌，适合工作沟通', funny: '幽默轻松，避免冒犯', emoji: '轻松活泼，使用适量表情' };
    const service = getGlobalAIService();
    service.initializeApp(app.id, app.settings);
    try {
      return await service.generate({
        appId: app.id, text: input.context ? `聊天背景：${input.context}\n\n对方说：${input.text}` : input.text,
        stylePrompt: styles[input.style], candidateCount: input.candidateCount, maxTokens: 800,
      });
    } catch (error) { return apiError(error); }
  }),
});
