import { redactAISettings, mergeAIProviders } from "../services/ai/config.js";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { router, adminProcedure } from "../trpc/index.js";
import { apps, users, type AppSettings, type AIProviderConfig } from "../db/schema.js";
import { generateApiKey, generateApiSecret } from "../utils/crypto.js";
import { TRPCError } from "@trpc/server";
import { sql } from "drizzle-orm";

/**
 * AI 提供商配置的 Zod 模式
 */
const aiProviderConfigSchema = z.object({
  type: z.enum(["openai", "anthropic", "google", "mock", "azure_openai", "unknown"]),
  apiKey: z.string().optional(),
  baseUrl: z.string().optional(),
  model: z.string().optional(),
  enabled: z.boolean().default(true),
  priority: z.number().default(100),
  retryCount: z.number().optional(),
  timeout: z.number().optional(),
});

/**
 * 应用管理路由（仅管理员可操作）
 * 处理 App 的创建、查询、更新、删除及统计
 */
export const appRouter = router({
  /**
   * 创建新应用
   */
  create: adminProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100),
        bundleId: z.string().min(1).max(255),
        platform: z.enum(["ios", "android", "web"]).optional().default("ios"),
        description: z.string().optional(),
        configName: z.string().min(1).max(100).optional().default("common"),
        configTemplate: z.string().min(1).max(100).optional(),
        slug: z.string().min(1).max(100).optional(),
        settings: z
          .object({
            freeReplyLimitPerDay: z.number().optional().default(10),
            freeCandidateCount: z.number().optional().default(1),
            proCandidateCount: z.number().optional().default(5),
            enableAI: z.boolean().optional().default(true),
            enableSubscription: z.boolean().optional().default(true),
            aiProviders: z.array(aiProviderConfigSchema).optional(),
            defaultAIProvider: z.enum(["openai", "anthropic", "google", "mock", "azure_openai", "unknown"]).optional(),
          })
          .optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const apiKey = generateApiKey();
      const apiSecret = generateApiSecret();

      const [app] = await ctx.db
        .insert(apps)
        .values({
          name: input.name,
          bundleId: input.bundleId,
          platform: input.platform,
          description: input.description,
          configName: input.configName ?? "common",
          configTemplate: input.configTemplate,
          slug: input.slug,
          apiKey,
          apiSecret,
          settings: input.settings ?? {
            freeReplyLimitPerDay: 10,
            freeCandidateCount: 1,
            proCandidateCount: 5,
            enableAI: true,
            enableSubscription: true,
            aiProviders: [
              {
                type: "mock",
                enabled: true,
                priority: 100,
              } as AIProviderConfig,
            ],
            defaultAIProvider: "mock",
          },
        })
        .returning();

      return {
        app: { ...app, settings: redactAISettings(app.settings) },
        message: "应用创建成功，请妥善保管 API Key 和 API Secret",
      };
    }),

  /**
   * 获取所有应用列表
   */
  list: adminProcedure.query(async ({ ctx }) => {
    const appList = await ctx.db.select().from(apps).orderBy(apps.createdAt);

    // 转换 isActive 为 status 字段
    return appList.map((app: typeof apps.$inferSelect) => ({
      ...app,
      settings: redactAISettings(app.settings),
      status: app.isActive ? "active" : "inactive",
    }));
  }),

  /**
   * 获取单个应用详情
   */
  detail: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [app] = await ctx.db
        .select()
        .from(apps)
        .where(eq(apps.id, input.id))
        .limit(1);

      if (!app) {
        throw new TRPCError({ code: "NOT_FOUND", message: "应用不存在" });
      }

      // 统计用户数量
      const [userCount] = await ctx.db
        .select({ count: sql<number>`count(*)` })
        .from(users)
        .where(eq(users.appId, app.id));

      return {
        ...app,
      settings: redactAISettings(app.settings),
        stats: {
          userCount: Number(userCount?.count ?? 0),
        },
      };
    }),

  /**
   * 更新应用信息
   */
  update: adminProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().min(1).max(100).optional(),
        bundleId: z.string().min(1).max(255).optional(),
        description: z.string().optional(),
        isActive: z.boolean().optional(),
        configName: z.string().min(1).max(100).optional(),
        configTemplate: z.string().min(1).max(100).optional(),
        slug: z.string().min(1).max(100).optional(),
        settings: z
          .object({
            freeReplyLimitPerDay: z.number().optional(),
            freeCandidateCount: z.number().optional(),
            proCandidateCount: z.number().optional(),
            enableAI: z.boolean().optional(),
            enableSubscription: z.boolean().optional(),
            aiProviders: z.array(aiProviderConfigSchema).optional(),
            defaultAIProvider: z.enum(["openai", "anthropic", "google", "mock", "azure_openai", "unknown"]).optional(),
          })
          .optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, settings, ...rest } = input;

      // 如果有 settings 更新，与现有 settings 合并
      let mergedSettings: AppSettings | undefined;
      if (settings) {
        const [existing] = await ctx.db
          .select()
          .from(apps)
          .where(eq(apps.id, id))
          .limit(1);

        if (existing) {
          mergedSettings = {
            ...((existing.settings as AppSettings) ?? {}),
            ...settings,
            ...(settings.aiProviders ? { aiProviders: mergeAIProviders(settings.aiProviders, existing.settings?.aiProviders) } : {}),
          } as AppSettings;
        }
      }

      const [updated] = await ctx.db
        .update(apps)
        .set({
          ...rest,
          ...(mergedSettings ? { settings: mergedSettings } : {}),
          updatedAt: new Date(),
        })
        .where(eq(apps.id, id))
        .returning();

      if (!updated) {
        throw new TRPCError({ code: "NOT_FOUND", message: "应用不存在" });
      }

      return { app: { ...updated, settings: redactAISettings(updated.settings) }, message: "应用更新成功" };
    }),

  /**
   * 重新生成 API Key（旧的将立即失效）
   */
  regenerateKey: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const newApiKey = generateApiKey();
      const newApiSecret = generateApiSecret();

      const [updated] = await ctx.db
        .update(apps)
        .set({
          apiKey: newApiKey,
          apiSecret: newApiSecret,
          updatedAt: new Date(),
        })
        .where(eq(apps.id, input.id))
        .returning();

      if (!updated) {
        throw new TRPCError({ code: "NOT_FOUND", message: "应用不存在" });
      }

      return {
        app: { ...updated, settings: redactAISettings(updated.settings) },
        message: "API Key 已重新生成，请更新客户端配置",
      };
    }),

  /**
   * 删除应用（级联删除所有关联数据）
   */
  delete: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.admin.role !== "super_admin") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "仅超级管理员可删除应用",
        });
      }

      const [deleted] = await ctx.db
        .delete(apps)
        .where(eq(apps.id, input.id))
        .returning();

      if (!deleted) {
        throw new TRPCError({ code: "NOT_FOUND", message: "应用不存在" });
      }

      return { success: true, message: "应用及所有关联数据已删除" };
    }),
});
