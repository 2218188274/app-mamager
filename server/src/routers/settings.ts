import { redactAISettings, mergeAIProviders } from "../services/ai/config.js";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { router, adminProcedure } from "../trpc/index.js";
import { apps, type AppSettings, type AIProviderConfig, type AIProviderType } from "../db/schema.js";
import { TRPCError } from "@trpc/server";

/**
 * 系统配置路由（管理后台）
 *
 * 功能模块：
 *  global.*  全局配置管理
 *  app.*     应用级别配置管理
 */
export const settingsRouter = router({
  // ==================== 全局配置管理 ====================

  /**
   * 获取全局配置
   * 注意：当前使用第一个 App 作为全局配置存储，未来可迁移到独立表
   */
  global: adminProcedure
    .query(async ({ ctx }) => {
      // 获取第一个 App 作为全局配置源（简化实现）
      const [globalApp] = await ctx.db
        .select()
        .from(apps)
        .where(eq(apps.isActive, true))
        .limit(1);

      if (!globalApp) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "未找到可用的应用配置",
        });
      }

      return {
        settings: redactAISettings(globalApp.settings),
        appId: globalApp.id,
        appName: globalApp.name,
        message: "当前使用应用配置作为全局配置，建议迁移到独立全局配置表",
      };
    }),

  /**
   * 更新全局配置
   */
  updateGlobal: adminProcedure
    .input(
      z.object({
        /** 邮件服务配置 */
        email: z
          .object({
            enabled: z.boolean().optional(),
            host: z.string().optional(),
            port: z.number().int().optional(),
            secure: z.boolean().optional(),
            auth: z
              .object({
                user: z.string().optional(),
                pass: z.string().optional(),
              })
              .optional(),
            fromAddress: z.string().email().optional(),
            templates: z
              .record(
                z.object({
                  subject: z.string(),
                  body: z.string(),
                })
              )
              .optional(),
          })
          .optional(),
        /** AI 服务默认配置 */
        aiDefaults: z
          .object({
            defaultProvider: z.string().optional(),
            fallbackProvider: z.string().optional(),
            maxRetries: z.number().int().min(0).max(5).optional(),
            timeoutMs: z.number().int().min(1000).max(30000).optional(),
            rateLimit: z
              .object({
                requestsPerMinute: z.number().int().min(1).max(1000).optional(),
                tokensPerMinute: z.number().int().min(1000).max(1000000).optional(),
              })
              .optional(),
          })
          .optional(),
        /** 平台功能开关 */
        features: z
          .object({
            enableUserRegistration: z.boolean().optional(),
            enableEmailVerification: z.boolean().optional(),
            enablePasswordReset: z.boolean().optional(),
            enableSocialLogin: z.boolean().optional(),
            enableTwoFactorAuth: z.boolean().optional(),
            enableUsageAnalytics: z.boolean().optional(),
            enableAutoScaling: z.boolean().optional(),
          })
          .optional(),
        /** 安全配置 */
        security: z
          .object({
            passwordMinLength: z.number().int().min(6).max(32).optional(),
            passwordRequireSpecialChar: z.boolean().optional(),
            sessionTimeoutMinutes: z.number().int().min(5).max(1440).optional(),
            maxLoginAttempts: z.number().int().min(1).max(10).optional(),
            enableIpWhitelist: z.boolean().optional(),
            ipWhitelist: z.array(z.string().ip()).optional(),
          })
          .optional(),
        /** 内容策略 */
        contentPolicy: z
          .object({
            allowedLanguages: z.array(z.string()).optional(),
            profanityFilter: z.boolean().optional(),
            maxStyleNameLength: z.number().int().min(1).max(100).optional(),
            maxPromptLength: z.number().int().min(1).max(5000).optional(),
            sensitiveTopics: z.array(z.string()).optional(),
          })
          .optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // 获取第一个 App 作为全局配置源
      const [globalApp] = await ctx.db
        .select()
        .from(apps)
        .where(eq(apps.isActive, true))
        .limit(1);

      if (!globalApp) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "未找到可用的应用配置",
        });
      }

      // 合并现有配置
      const currentSettings = globalApp.settings || ({} as AppSettings);

      // 默认配置
      const defaultSettings: AppSettings = {
        freeReplyLimitPerDay: 10,
        freeCandidateCount: 1,
        proCandidateCount: 5,
        enableAI: true,
        enableSubscription: true,
        aiProviders: [
          { type: "mock", enabled: true, priority: 100 } as AIProviderConfig,
        ],
        defaultAIProvider: "mock" as AIProviderType,
      };

      // 创建更新后的配置：默认值 <- 当前配置 <- 输入配置
      const updatedSettings: AppSettings = {
        ...defaultSettings,
        ...currentSettings,
        ...(input.email && { email: input.email }),
        ...(input.aiDefaults && { aiDefaults: input.aiDefaults }),
        ...(input.features && { features: input.features }),
        ...(input.security && { security: input.security }),
        ...(input.contentPolicy && { contentPolicy: input.contentPolicy }),
      };

      // 更新数据库
      const [updated] = await ctx.db
        .update(apps)
        .set({
          settings: updatedSettings,
          updatedAt: new Date(),
        })
        .where(eq(apps.id, globalApp.id))
        .returning();

      return {
        settings: redactAISettings(updated?.settings),
        message: "全局配置更新成功",
      };
    }),

  // ==================== 应用配置管理 ====================

  /**
   * 获取应用配置
   */
  app: adminProcedure
    .input(
      z.object({
        appId: z.string().uuid(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { appId } = input;

      const [app] = await ctx.db
        .select()
        .from(apps)
        .where(eq(apps.id, appId))
        .limit(1);

      if (!app) {
        throw new TRPCError({ code: "NOT_FOUND", message: "应用不存在" });
      }

      return {
        appId: app.id,
        appName: app.name,
        bundleId: app.bundleId,
        settings: redactAISettings(app.settings),
        platform: app.platform,
        isActive: app.isActive,
        createdAt: app.createdAt,
        updatedAt: app.updatedAt,
      };
    }),

  /**
   * 更新应用配置
   */
  updateApp: adminProcedure
    .input(
      z
        .object({
          appId: z.string().uuid(),
          /** 基础配置 */
          freeReplyLimitPerDay: z.number().int().min(0).max(1000).optional(),
          freeCandidateCount: z.number().int().min(1).max(10).optional(),
          proCandidateCount: z.number().int().min(1).max(20).optional(),
          enableAI: z.boolean().optional(),
          enableSubscription: z.boolean().optional(),
          /** AI 提供商配置 */
          aiProviders: z
            .array(
              z.object({
                type: z.enum(["openai", "anthropic", "google", "mock", "azure_openai", "unknown"]),
                apiKey: z.string().optional(),
                baseUrl: z.string().url().optional(),
                model: z.string().optional(),
                enabled: z.boolean(),
                priority: z.number().int().min(0).max(1000),
                retryCount: z.number().int().min(0).max(5).optional(),
                timeout: z.number().int().min(1000).max(30000).optional(),
              })
            )
            .optional(),
          defaultAIProvider: z.string().optional(),
          /** 自定义功能开关（模板页专属配置可放此处或顶层，顶层未声明键会通过 passthrough 传入） */
          customFeatures: z
            .record(z.unknown())
            .optional()
            .describe("应用自定义功能配置，支持任意扩展字段"),
        })
        .passthrough()
    )
    .mutation(async ({ ctx, input }) => {
      const { appId, ...configUpdates } = input;

      // 已知顶层字段，仅这些参与显式合并；其余键（模板自定义）归入 customUpdates 一并写入 settings
      const knownTopLevelKeys = [
        "freeReplyLimitPerDay",
        "freeCandidateCount",
        "proCandidateCount",
        "enableAI",
        "enableSubscription",
        "aiProviders",
        "defaultAIProvider",
        "customFeatures",
      ];
      const customUpdates: Record<string, unknown> = {};
      for (const k of Object.keys(configUpdates)) {
        if (!knownTopLevelKeys.includes(k)) customUpdates[k] = (configUpdates as Record<string, unknown>)[k];
      }

      // 验证应用存在
      const [app] = await ctx.db
        .select()
        .from(apps)
        .where(eq(apps.id, appId))
        .limit(1);

      if (!app) {
        throw new TRPCError({ code: "NOT_FOUND", message: "应用不存在" });
      }

      // 默认配置
      const defaultSettings: AppSettings = {
        freeReplyLimitPerDay: 10,
        freeCandidateCount: 1,
        proCandidateCount: 5,
        enableAI: true,
        enableSubscription: true,
        aiProviders: [
          { type: "mock", enabled: true, priority: 100 } as AIProviderConfig,
        ],
        defaultAIProvider: "mock" as AIProviderType,
      };

      // 构建更新后的配置：默认值 <- 当前配置 <- 输入配置
      const currentSettings = app.settings || ({} as AppSettings);
      const updatedSettings: AppSettings = {
        ...defaultSettings,
        ...currentSettings,
        ...(configUpdates.freeReplyLimitPerDay !== undefined && {
          freeReplyLimitPerDay: configUpdates.freeReplyLimitPerDay,
        }),
        ...(configUpdates.freeCandidateCount !== undefined && {
          freeCandidateCount: configUpdates.freeCandidateCount,
        }),
        ...(configUpdates.proCandidateCount !== undefined && {
          proCandidateCount: configUpdates.proCandidateCount,
        }),
        ...(configUpdates.enableAI !== undefined && {
          enableAI: configUpdates.enableAI,
        }),
        ...(configUpdates.enableSubscription !== undefined && {
          enableSubscription: configUpdates.enableSubscription,
        }),
        ...(configUpdates.aiProviders !== undefined && {
          aiProviders: mergeAIProviders(configUpdates.aiProviders as AIProviderConfig[], currentSettings.aiProviders),
        }),
        ...(configUpdates.defaultAIProvider !== undefined && {
          defaultAIProvider: configUpdates.defaultAIProvider as AIProviderType,
        }),
        ...(configUpdates.customFeatures !== undefined && configUpdates.customFeatures),
        ...customUpdates,
      };

      // 更新数据库
      const [updated] = await ctx.db
        .update(apps)
        .set({
          settings: updatedSettings,
          updatedAt: new Date(),
        })
        .where(eq(apps.id, appId))
        .returning();

      // 记录配置变更日志
      console.log(`管理员 ${ctx.admin.id} 更新了应用 ${appId} 的配置`);

      return {
        appId: updated?.id,
        appName: updated?.name,
        settings: redactAISettings(updated?.settings),
        message: "应用配置更新成功",
      };
    }),

  /**
   * 验证应用配置
   * 检查配置的完整性和有效性
   */
  validateApp: adminProcedure
    .input(
      z.object({
        appId: z.string().uuid(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { appId } = input;

      const [app] = await ctx.db
        .select()
        .from(apps)
        .where(eq(apps.id, appId))
        .limit(1);

      if (!app) {
        throw new TRPCError({ code: "NOT_FOUND", message: "应用不存在" });
      }

      const settings = app.settings || ({} as AppSettings);
      const issues: Array<{
        level: "error" | "warning" | "info";
        field: string;
        message: string;
        suggestion?: string;
      }> = [];

      // 检查必需配置
      if ((settings as AppSettings).freeReplyLimitPerDay === undefined) {
        issues.push({
          level: "error",
          field: "freeReplyLimitPerDay",
          message: "免费用户每日回复上限未设置",
          suggestion: "建议设置为 10-50 之间的值",
        });
      }

      if ((settings as AppSettings).enableAI === undefined) {
        issues.push({
          level: "warning",
          field: "enableAI",
          message: "AI 功能开关未明确设置",
          suggestion: "明确设置 enableAI: true/false",
        });
      }

      // 检查 AI 提供商配置
      if ((settings as AppSettings).aiProviders && Array.isArray((settings as AppSettings).aiProviders)) {
        const enabledProviders = (settings.aiProviders as AIProviderConfig[]).filter(
          (p: AIProviderConfig) => p.enabled
        );
        if (enabledProviders.length === 0) {
          issues.push({
            level: "error",
            field: "aiProviders",
            message: "没有启用的 AI 提供商",
            suggestion: "至少启用一个 AI 提供商（如 mock 用于测试）",
          });
        }

        // 检查默认提供商是否在启用列表中
        if ((settings as AppSettings).defaultAIProvider) {
          const defaultProviderExists = enabledProviders.some(
            (p: AIProviderConfig) => p.type === settings.defaultAIProvider
          );
          if (!defaultProviderExists) {
            issues.push({
              level: "warning",
              field: "defaultAIProvider",
              message: `默认 AI 提供商 "${settings.defaultAIProvider}" 未启用`,
              suggestion: `启用该提供商或更改默认提供商`,
            });
          }
        }
      } else {
        issues.push({
          level: "warning",
          field: "aiProviders",
          message: "AI 提供商配置未设置",
          suggestion: "配置至少一个 AI 提供商",
        });
      }

      // 检查订阅相关配置
      if ((settings as AppSettings).enableSubscription === true) {
        if ((settings as AppSettings).proCandidateCount === undefined) {
          issues.push({
            level: "warning",
            field: "proCandidateCount",
            message: "Pro 用户候选回复数未设置",
            suggestion: "建议设置为 3-10 之间的值",
          });
        }
      }

      return {
        appId,
        appName: app.name,
        isValid: issues.every((issue) => issue.level !== "error"),
        issues,
        summary: {
          total: issues.length,
          errors: issues.filter((i) => i.level === "error").length,
          warnings: issues.filter((i) => i.level === "warning").length,
          info: issues.filter((i) => i.level === "info").length,
        },
      };
    }),

  /**
   * 重置应用配置到默认值
   */
  resetApp: adminProcedure
    .input(
      z.object({
        appId: z.string().uuid(),
        confirm: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { appId, confirm } = input;

      if (!confirm) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "请确认重置操作，设置 confirm: true",
        });
      }

      // 验证应用存在
      const [app] = await ctx.db
        .select()
        .from(apps)
        .where(eq(apps.id, appId))
        .limit(1);

      if (!app) {
        throw new TRPCError({ code: "NOT_FOUND", message: "应用不存在" });
      }

      // 默认配置
      const defaultSettings: AppSettings = {
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
        defaultAIProvider: "mock" as AIProviderType,
      };

      // 更新数据库
      const [updated] = await ctx.db
        .update(apps)
        .set({
          settings: defaultSettings,
          updatedAt: new Date(),
        })
        .where(eq(apps.id, appId))
        .returning();

      // 记录操作日志
      console.log(`管理员 ${ctx.admin.id} 重置了应用 ${appId} 的配置`);

      return {
        appId: updated?.id,
        appName: updated?.name,
        settings: redactAISettings(updated?.settings),
        message: "应用配置已重置为默认值",
      };
    }),

  /**
   * 获取所有应用的配置摘要
   */
  listApps: adminProcedure
    .query(async ({ ctx }) => {
      const allApps = await ctx.db
        .select({
          id: apps.id,
          name: apps.name,
          platform: apps.platform,
          isActive: apps.isActive,
          settings: apps.settings,
          userCount: sql<number>`(SELECT COUNT(*) FROM users WHERE users.app_id = apps.id)`.as("user_count"),
          subscriptionCount: sql<number>`(SELECT COUNT(*) FROM subscriptions
            INNER JOIN users ON subscriptions.user_id = users.id
            WHERE users.app_id = apps.id AND subscriptions.status = 'active' AND subscriptions.tier != 'free')`.as("subscription_count"),
        })
        .from(apps)
        .orderBy(apps.createdAt);

      return allApps.map((app: {
        id: string; name: string; platform: string; isActive: boolean;
        settings?: { enableAI?: boolean; enableSubscription?: boolean; aiProviders?: unknown[] } | null;
        userCount?: unknown; subscriptionCount?: unknown;
      }) => ({
        id: app.id,
        name: app.name,
        platform: app.platform,
        isActive: app.isActive,
        configStatus: app.settings ? "configured" : "default",
        userCount: Number(app.userCount || 0),
        subscriptionCount: Number(app.subscriptionCount || 0),
        features: {
          aiEnabled: app.settings?.enableAI ?? false,
          subscriptionEnabled: app.settings?.enableSubscription ?? false,
          hasCustomAIProviders: Array.isArray(app.settings?.aiProviders) && (app.settings.aiProviders?.length ?? 0) > 0,
        },
      }));
    }),
});

// 工具函数：用于类型安全的 SQL 表达式
import { sql } from "drizzle-orm";