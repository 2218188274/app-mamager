import { z } from "zod";
import { router, protectedProcedure } from "../trpc/index.js";
import { generateUserReply } from "../services/ai/user-reply.js";

/**
 * AI 路由（App 隔离）
 * 用量限制读取当前 App 的 settings 配置
 */
export const aiRouter = router({
  /**
   * 生成 AI 回复
   */
  generate: protectedProcedure
    .input(
      z.object({
        requestId: z.string().regex(/^[a-zA-Z0-9_-]{16,80}$/).optional(),
        text: z.string().trim().min(1, "输入文本不能为空").max(2000),
        stylePrompt: z.string().max(2000).optional(),
        temperature: z.number().min(0).max(2).optional().default(0.7),
        maxTokens: z.number().min(1).max(2000).optional().default(500),
        candidateCount: z.number().int().min(1).max(5).optional().default(1),
      })
    )
    .mutation(async ({ ctx, input }) => generateUserReply(ctx, input)),

  /**
   * 获取可用的 AI 模型列表
   */
  models: protectedProcedure.query(({ ctx }) => (ctx.app.settings?.aiProviders ?? [])
    .filter(p => p.enabled && p.type !== 'mock' && p.model)
    .map(p => ({ id: p.model!, name: p.model!, description: '管理员配置的模型', isPro: false }))),
});
