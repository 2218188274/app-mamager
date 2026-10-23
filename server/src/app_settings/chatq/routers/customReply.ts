import { keyboardAccount } from '../../../services/ai/keyboard-account.js';
import { AIUpstreamError } from "../../../services/ai/providers/openai.js";
import { z } from 'zod';
import { router, protectedProcedure } from '@/trpc';
import { generateUserReply } from '@/services/ai/user-reply.js';
import { topicBrief, topicCategories } from '@/services/ai/topics.js';
import { TRPCError } from '@trpc/server';
import type { KeyboardGenerateOutput } from '../types.js';
import { eq, and, sql, inArray } from 'drizzle-orm';
import { db } from '@/db';
import {
  userPhrases,
  chatqScenes,
  chatqRelations,
  chatqPersonaTags,
} from "@/db/schema.js";

/**
 * 自定义回复路由
 *
 * 功能：
 * - 生成自定义风格的 AI 回复
 * - 快捷短语管理
 * - 上下文感知回复
 */
export const customReplyRouter = router({
  account: protectedProcedure.query(({ ctx }) => keyboardAccount(ctx)),
  /**
   * 生成自定义回复
   * POST /trpc/chatq.customReply.generate
   */
  generate: protectedProcedure
    .input(
      z.object({
        requestId: z.string().regex(/^[a-zA-Z0-9_-]{16,80}$/).optional(),
        purpose: z.enum(['reply', 'topic']).default('reply'),
        prompt: z.string().max(1000).default(''),
        category: z.enum(topicCategories).default('daily'),
        avoid: z.array(z.string().trim().min(1).max(300)).max(6).default([]),
        style: z.enum(['funny', 'professional', 'friendly', 'humor', 'emoji']).default('friendly'),
        customPrompt: z.string().max(500).optional(),
        context: z.string().max(200).optional(),
        sceneId: z.string().max(50).optional(),
        relationId: z.string().max(50).optional(),
        personaTagWeights: z.record(z.string(), z.number().min(0.1).max(0.9)).optional(),
        candidateCount: z.number().int().min(1).max(3).default(3),
      }).refine(value => value.purpose === 'topic' || value.prompt.trim().length > 0, { message: '请输入对方消息', path: ['prompt'] })
    )
    .mutation(async ({ ctx, input }): Promise<KeyboardGenerateOutput> => {
      const { prompt, style, customPrompt, context, sceneId, relationId, personaTagWeights, candidateCount } = input;

      const topic = input.purpose === 'topic';
      const requestText = topic ? topicBrief(input.category, prompt, input.avoid) : prompt;
      let fullPrompt = customPrompt ? `${customPrompt}\n\n用户请求: ${requestText}` : requestText;

      if (context) {
        fullPrompt = `上下文: ${context}\n\n${fullPrompt}`;
      }

      // 人设/场景/关系说明（从 DB 解析名称）
      const parts: string[] = [];
      if (sceneId) {
        const [scene] = await ctx.db.select().from(chatqScenes).where(eq(chatqScenes.sceneId, sceneId)).limit(1);
        if (scene) parts.push(`场景：${scene.name}（${scene.description ?? ''}）`);
      }
      if (relationId) {
        const [relation] = await ctx.db.select().from(chatqRelations).where(eq(chatqRelations.relationId, relationId)).limit(1);
        if (relation) parts.push(`关系：${relation.name}`);
      }
      if (personaTagWeights && Object.keys(personaTagWeights).length > 0) {
        const tagIds = Object.keys(personaTagWeights);
        const tagRows = await ctx.db.select({ tagId: chatqPersonaTags.tagId, name: chatqPersonaTags.name }).from(chatqPersonaTags).where(inArray(chatqPersonaTags.tagId, tagIds));
        const nameMap = new Map(tagRows.map((r) => [r.tagId, r.name]));
        const tagNames = tagIds.map((id) => { const w = personaTagWeights[id]; const name = nameMap.get(id); return name ? `${name}(${w})` : null; }).filter(Boolean) as string[];
        if (tagNames.length > 0) parts.push(`人设标签（权重）：${tagNames.join('、')}`);
      }
      if (parts.length > 0) {
        fullPrompt = `【人设与场景】\n${parts.join('。\n')}\n\n【用户请求】\n${fullPrompt}\n\n请根据以上人设与场景生成${topic ? '话题开场白' : '回复'}。`;
      }
      {
        const styleGuidance: Record<string, string> = {
          funny: '用幽默诙谐的方式回复，带点俏皮和逗趣',
          professional: '用专业正式的方式回复，保持礼貌和专业',
          friendly: '用友好亲切的方式回复，像朋友聊天一样',
          humor: '用轻松搞笑的方式回复，让对方会心一笑',
          emoji: '在回复中加入适量的 Emoji，使内容更生动',
        };
        fullPrompt += `\n\n请用${styleGuidance[style]}的风格回复。`;
      }

      try {
        const aiResponse = await generateUserReply(ctx, {
          text: fullPrompt,
          requestId: input.requestId,
          intent: topic ? 'topic' : 'reply',
          temperature: 0.7,
          maxTokens: 500,
          candidateCount,
        });

        const replies = aiResponse.replies ?? [];
        const contents = replies.map((r) => r.content).filter(Boolean);
        const result = contents[0] || '生成失败，请重试';

        return {
          result,
          candidates: contents.length > 1 ? contents : undefined,
          style,
          tokens: aiResponse.provider.tokensUsed ?? Math.floor(fullPrompt.length / 4),
          generatedAt: new Date(),
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        console.error('[customReply] AI 生成失败:', error);
        throw new TRPCError({ code: 'BAD_GATEWAY', message: error instanceof AIUpstreamError ? error.message : 'AI 生成失败，请检查配置后重试' });
      }
    }),

  /**
   * 快速生成（简化版本）
   * POST /trpc/chatq.customReply.quickGenerate
   */
  quickGenerate: protectedProcedure
    .input(
      z.object({
        requestId: z.string().regex(/^[a-zA-Z0-9_-]{16,80}$/).optional(),
        prompt: z.string().min(1).max(500),
        style: z.enum(['funny', 'professional', 'friendly', 'humor', 'emoji']).default('friendly'),
      })
    )
    .mutation(async ({ ctx, input }): Promise<KeyboardGenerateOutput> => {
      const { prompt, style } = input;

      // 简化版 prompt
      const styleGuidance: Record<string, string> = {
        funny: '幽默诙谐',
        professional: '专业正式',
        friendly: '友好亲切',
        humor: '轻松搞笑',
        emoji: '带 Emoji',
      };

      const fullPrompt = `请用${styleGuidance[style]}的风格回复: ${prompt}`;

      try {
        const aiResponse = await generateUserReply(ctx, {
          text: fullPrompt,
          requestId: input.requestId,
          temperature: 0.7,
          maxTokens: 200,
          candidateCount: 1,
        });

        const reply = aiResponse.replies[0];

        return {
          result: reply?.content || '生成失败，请重试',
          style,
          tokens: aiResponse.provider.tokensUsed || Math.floor(fullPrompt.length / 4),
          generatedAt: new Date(),
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        console.error('[customReply] 快速生成失败:', error);
        throw new TRPCError({ code: 'BAD_GATEWAY', message: error instanceof AIUpstreamError ? error.message : 'AI 生成失败，请检查配置后重试' });
      }
    }),

  /**
   * 获取可用风格列表
   * GET /trpc/chatq.customReply.styles
   */
  styles: protectedProcedure.query(() => {
    return [
      { id: 'funny', name: '幽默风趣', description: '轻松搞笑的风格', icon: '😄' },
      { id: 'professional', name: '专业正式', description: '商务场合适用', icon: '💼' },
      { id: 'friendly', name: '友好亲切', description: '日常聊天首选', icon: '👋' },
      { id: 'humor', name: '轻松搞笑', description: '幽默段子风格', icon: '😂' },
      { id: 'emoji', name: 'Emoji 风格', description: '带表情的活泼回复', icon: '✨' },
    ];
  }),

  /**
   * 保存常用短语
   * POST /trpc/chatq.customReply.savePhrase
   */
  savePhrase: protectedProcedure
    .input(
      z.object({
        phrase: z.string().min(1).max(500),
        label: z.string().max(50).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        // 获取当前短语数量
        const countResult = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(userPhrases)
          .where(
            and(
              eq(userPhrases.appId, ctx.app.id),
              eq(userPhrases.deviceId, ctx.deviceId!)
            )
          );

        const MAX_PHRASES = 50;
        if ((countResult[0]?.count ?? 0) >= MAX_PHRASES) {
          throw new Error(`短语数量已达上限 (${MAX_PHRASES})`);
        }

        // 获取最大排序值
        const maxOrderResult = await db
          .select({ maxOrder: sql<number>`coalesce(max(${userPhrases.sortOrder}), 0)::int` })
          .from(userPhrases)
          .where(
            and(
              eq(userPhrases.appId, ctx.app.id),
              eq(userPhrases.deviceId, ctx.deviceId!)
            )
          );

        const maxOrder = maxOrderResult[0]?.maxOrder ?? 0;

        const [newPhrase] = await db
          .insert(userPhrases)
          .values({
            appId: ctx.app.id,
            deviceId: ctx.deviceId!,
            phrase: input.phrase,
            label: input.label,
            sortOrder: maxOrder + 1,
          })
          .returning({
            id: userPhrases.id,
            phrase: userPhrases.phrase,
            label: userPhrases.label,
          });

        return {
          success: true,
          id: newPhrase.id,
          phrase: newPhrase.phrase,
          label: newPhrase.label,
        };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : '保存短语失败';
        throw new Error(message);
      }
    }),

  /**
   * 获取常用短语列表
   * GET /trpc/chatq.customReply.listPhrases
   */
  listPhrases: protectedProcedure.query(async ({ ctx }) => {
    const phrases = await db
      .select({
        id: userPhrases.id,
        phrase: userPhrases.phrase,
        label: userPhrases.label,
        sortOrder: userPhrases.sortOrder,
      })
      .from(userPhrases)
      .where(
        and(
          eq(userPhrases.appId, ctx.app.id),
          eq(userPhrases.deviceId, ctx.deviceId!)
        )
      )
      .orderBy(userPhrases.sortOrder);

    return phrases;
  }),

  /**
   * 删除短语
   * POST /trpc/chatq.customReply.deletePhrase
   */
  deletePhrase: protectedProcedure
    .input(z.object({ phraseId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const result = await db
          .delete(userPhrases)
          .where(
            and(
              eq(userPhrases.id, input.phraseId),
              eq(userPhrases.appId, ctx.app.id),
              eq(userPhrases.deviceId, ctx.deviceId!)
            )
          )
          .returning({ id: userPhrases.id });

        return { success: result.length > 0 };
      } catch (error) {
        console.error('[customReply] 删除短语失败:', error);
        return { success: false };
      }
    }),

  /**
   * 更新短语排序
   * POST /trpc/chatq.customReply.reorderPhrases
   */
  reorderPhrases: protectedProcedure
    .input(
      z.object({
        phraseIds: z.array(z.string().uuid()),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        // 批量更新排序
        for (let i = 0; i < input.phraseIds.length; i++) {
          await db
            .update(userPhrases)
            .set({ sortOrder: i + 1, updatedAt: new Date() })
            .where(
              and(
                eq(userPhrases.id, input.phraseIds[i]),
                eq(userPhrases.appId, ctx.app.id),
                eq(userPhrases.deviceId, ctx.deviceId!)
              )
            );
        }

        return { success: true };
      } catch (error) {
        console.error('[customReply] 更新排序失败:', error);
        return { success: false };
      }
    }),
});
