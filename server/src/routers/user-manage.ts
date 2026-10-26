import { z } from "zod";
import { eq, and, sql, desc, asc, count, like, or, inArray } from "drizzle-orm";
import { router, adminProcedure } from "../trpc/index.js";
import {
  apps,
  users,
  subscriptions,
  subscriptionPlans,
  usageRecords,
} from "../db/schema.js";
import { TRPCError } from "@trpc/server";
import { hashPassword } from "../utils/crypto.js";

/**
 * 用户管理路由（管理后台）
 *
 * 功能模块：
 *  list.*     用户列表与搜索
 *  detail.*   用户详情与操作
 *  operations.* 用户状态管理操作
 */
export const userManageRouter = router({
  // ==================== 用户列表与搜索 ====================

  /**
   * 获取指定 App 的用户列表（分页、搜索、筛选、排序）
   */
  list: adminProcedure
    .input(
      z.object({
        appId: z.string().uuid(),
        /** 搜索关键词（设备ID、邮箱） */
        search: z.string().optional(),
        /** 状态筛选 */
        status: z.enum(["active", "disabled", "suspended", "pending_verification"]).optional(),
        /** 邮箱验证状态 */
        emailVerified: z.boolean().optional(),
        /** 订阅层级筛选 */
        subscriptionTier: z.enum(["free", "pro_monthly", "pro_yearly"]).optional(),
        /** 排序字段 */
        sortBy: z.enum(["createdAt", "lastLoginAt", "email", "deviceId"]).default("createdAt"),
        /** 排序方向 */
        sortOrder: z.enum(["asc", "desc"]).default("desc"),
        /** 分页大小 */
        limit: z.number().int().min(1).max(100).optional().default(50),
        /** 分页偏移 */
        offset: z.number().int().min(0).optional().default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      const { appId, search, status, emailVerified, subscriptionTier, sortBy, sortOrder, limit, offset } = input;

      // 验证 App 存在且管理员有权访问
      const [app] = await ctx.db
        .select()
        .from(apps)
        .where(eq(apps.id, appId))
        .limit(1);

      if (!app) {
        throw new TRPCError({ code: "NOT_FOUND", message: "应用不存在" });
      }

      // 构建查询条件
      const conditions: any[] = [eq(users.appId, appId)];

      // 状态筛选
      if (status) {
        conditions.push(eq(users.status, status));
      }

      // 邮箱验证状态筛选
      if (emailVerified !== undefined) {
        conditions.push(eq(users.emailVerified, emailVerified));
      }

      // 搜索条件（设备ID或邮箱）
      if (search) {
        const searchCondition = or(
          like(users.deviceId, `%${search}%`),
          like(users.email, `%${search}%`),
          like(users.username, `%${search.toLowerCase()}%`)
        );
        if (searchCondition) {
          conditions.push(searchCondition);
        }
      }

      // 订阅层级筛选（需要关联查询）
      let tierFilteredUserIds: string[] | null = null;
      if (subscriptionTier) {
        const tierUsers = await ctx.db
          .select({ userId: subscriptions.userId })
          .from(subscriptions)
          .where(
            and(
              eq(subscriptions.tier, subscriptionTier),
              eq(subscriptions.status, "active")
            )
          );

        tierFilteredUserIds = tierUsers.map((u: { userId: string }) => u.userId);
        if (tierFilteredUserIds.length === 0) {
          return {
            items: [],
            total: 0,
            limit,
            offset,
          };
        }
        conditions.push(inArray(users.id, tierFilteredUserIds as string[]));
      }

      // 排序
      const orderBy = sortOrder === "asc" ? asc : desc;
      let sortColumn;
      switch (sortBy) {
        case "createdAt":
          sortColumn = users.createdAt;
          break;
        case "lastLoginAt":
          sortColumn = users.lastLoginAt;
          break;
        case "email":
          sortColumn = users.email;
          break;
        case "deviceId":
          sortColumn = users.deviceId;
          break;
        default:
          sortColumn = users.createdAt;
      }

      // 查询用户数据
      const userRows = await ctx.db
        .select()
        .from(users)
        .where(and(...conditions))
        .orderBy(orderBy(sortColumn))
        .limit(limit)
        .offset(offset);

      // 查询总数
      const [totalResult] = await ctx.db
        .select({ count: count() })
        .from(users)
        .where(and(...conditions));

      const total = Number(totalResult?.count ?? 0);

      // 获取用户的订阅信息
      const userIds = userRows.map((u: { id: string }) => u.id);
      const userSubscriptions = userIds.length > 0
        ? await ctx.db
            .select({
              userId: subscriptions.userId,
              tier: subscriptions.tier,
              status: subscriptions.status,
              expiresAt: subscriptions.expiresAt,
              planName: subscriptionPlans.name,
            })
            .from(subscriptions)
            .leftJoin(
              subscriptionPlans,
              eq(subscriptions.planId, subscriptionPlans.id)
            )
            .where(inArray(subscriptions.userId, userIds))
        : [];

      // 按用户ID分组订阅信息
      const subscriptionsByUserId = userSubscriptions.reduce(
        (acc: Record<string, typeof userSubscriptions>, sub: (typeof userSubscriptions)[number]) => {
          if (!acc[sub.userId]) {
            acc[sub.userId] = [];
          }
          acc[sub.userId].push(sub);
          return acc;
        },
        {} as Record<string, typeof userSubscriptions>
      );

      // 构建返回结果
      const items = userRows.map((user: (typeof userRows)[number]) => ({
        user: {
          id: user.id,
          username: user.username,
          deviceId: user.deviceId,
          email: user.email,
          emailVerified: user.emailVerified,
          status: user.status,
          lastLoginAt: user.lastLoginAt,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        },
        subscription: subscriptionsByUserId[user.id]?.[0] || null,
        hasActiveSubscription: subscriptionsByUserId[user.id]?.some(
          (s: { status: string; tier: string }) => s.status === "active" && s.tier !== "free"
        ) || false,
      }));

      return {
        items,
        total,
        limit,
        offset,
        hasMore: offset + items.length < total,
      };
    }),

  // ==================== 用户详情 ====================

  /**
   * 获取用户详情（包含完整信息、订阅历史、使用统计）
   */
  detail: adminProcedure
    .input(
      z.object({
        userId: z.string().uuid(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { userId } = input;

      // 查询用户信息
      const [user] = await ctx.db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!user) {
        throw new TRPCError({ code: "NOT_FOUND", message: "用户不存在" });
      }

      // 查询用户所属的 App 信息
      const [app] = await ctx.db
        .select({
          id: apps.id,
          name: apps.name,
          bundleId: apps.bundleId,
        })
        .from(apps)
        .where(eq(apps.id, user.appId))
        .limit(1);

      // 查询用户的订阅历史
      const subscriptionHistory = await ctx.db
        .select({
          subscription: subscriptions,
          plan: {
            id: subscriptionPlans.id,
            name: subscriptionPlans.name,
            productId: subscriptionPlans.productId,
            priceCents: subscriptionPlans.priceCents,
            currency: subscriptionPlans.currency,
          },
        })
        .from(subscriptions)
        .leftJoin(
          subscriptionPlans,
          eq(subscriptions.planId, subscriptionPlans.id)
        )
        .where(eq(subscriptions.userId, userId))
        .orderBy(desc(subscriptions.createdAt));

      // 查询当前活跃订阅
      const activeSubscription = subscriptionHistory.find(
        (s: { subscription: { status: string } }) => s.subscription.status === "active"
      );

      // 查询使用统计（最近30天）
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const usageStats = await ctx.db
        .select({
          date: usageRecords.date,
          totalReplies: sql<number>`sum(${usageRecords.replyCount})`.as("total_replies"),
          totalTokens: sql<number>`sum(${usageRecords.tokenCount})`.as("total_tokens"),
          successfulCalls: sql<number>`sum(case when ${usageRecords.success} = true then 1 else 0 end)`.as("successful_calls"),
          failedCalls: sql<number>`sum(case when ${usageRecords.success} = false then 1 else 0 end)`.as("failed_calls"),
        })
        .from(usageRecords)
        .where(
          and(
            eq(usageRecords.userId, userId),
            sql`${usageRecords.date} >= ${thirtyDaysAgo}`
          )
        )
        .groupBy(usageRecords.date)
        .orderBy(desc(usageRecords.date));

      // 查询AI提供商使用统计
      const providerStats = await ctx.db
        .select({
          aiProvider: usageRecords.aiProvider,
          model: usageRecords.model,
          callCount: count().as("call_count"),
          totalTokens: sql<number>`sum(${usageRecords.tokenCount})`.as("total_tokens"),
          avgDuration: sql<number>`avg(${usageRecords.durationMs})`.as("avg_duration"),
          successRate: sql<number>`avg(case when ${usageRecords.success} = true then 1.0 else 0.0 end)`.as("success_rate"),
        })
        .from(usageRecords)
        .where(eq(usageRecords.userId, userId))
        .groupBy(usageRecords.aiProvider, usageRecords.model)
        .orderBy(desc(sql`call_count`));

      return {
        user: {
          ...user,
          // 隐藏敏感信息
          passwordHash: undefined,
            recoveryHash: undefined,
          verificationToken: undefined,
          verificationTokenExpires: undefined,
          resetToken: undefined,
          resetTokenExpires: undefined,
        },
        app,
        activeSubscription: activeSubscription || null,
        subscriptionHistory,
        usageStats: {
          recent30Days: usageStats,
          summary: {
            totalReplies: usageStats.reduce((sum: number, day: { totalReplies?: unknown }) => sum + Number(day.totalReplies || 0), 0),
            totalTokens: usageStats.reduce((sum: number, day: { totalTokens?: unknown }) => sum + Number(day.totalTokens || 0), 0),
            totalCalls: usageStats.reduce((sum: number, day: { successfulCalls?: unknown; failedCalls?: unknown }) =>
              sum + Number(day.successfulCalls || 0) + Number(day.failedCalls || 0), 0),
            successRate: usageStats.length > 0
              ? (usageStats.reduce((sum: number, day: { successfulCalls?: unknown; failedCalls?: unknown }) => sum + Number(day.successfulCalls || 0), 0) /
                 Math.max(1, usageStats.reduce((sum: number, day: { successfulCalls?: unknown; failedCalls?: unknown }) =>
                   sum + Number(day.successfulCalls || 0) + Number(day.failedCalls || 0), 0)) * 100
                ).toFixed(1)
              : "0",
          },
        },
        providerStats,
      };
    }),

  // ==================== 用户状态管理 ====================

  /**
   * 禁用用户
   */
  disable: adminProcedure
    .input(
      z.object({
        userId: z.string().uuid(),
        reason: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { userId, reason } = input;

      const [updated] = await ctx.db
        .update(users)
        .set({
          status: "disabled",
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId))
        .returning();

      if (!updated) {
        throw new TRPCError({ code: "NOT_FOUND", message: "用户不存在" });
      }

      // 记录操作日志（TODO: 实现审计日志系统）
      console.log(`管理员 ${ctx.admin.id} 禁用了用户 ${userId}，原因: ${reason || "未指定"}`);

      return {
        user: { ...updated, passwordHash: undefined, recoveryHash: undefined, verificationToken: undefined, resetToken: undefined },
        message: "用户已禁用",
      };
    }),

  /**
   * 启用用户
   */
  enable: adminProcedure
    .input(
      z.object({
        userId: z.string().uuid(),
        reason: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { userId, reason } = input;

      const [updated] = await ctx.db
        .update(users)
        .set({
          status: "active",
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId))
        .returning();

      if (!updated) {
        throw new TRPCError({ code: "NOT_FOUND", message: "用户不存在" });
      }

      // 记录操作日志
      console.log(`管理员 ${ctx.admin.id} 启用了用户 ${userId}，原因: ${reason || "未指定"}`);

      return {
        user: { ...updated, passwordHash: undefined, recoveryHash: undefined, verificationToken: undefined, resetToken: undefined },
        message: "用户已启用",
      };
    }),

  /**
   * 暂停用户（临时限制）
   */
  suspend: adminProcedure
    .input(
      z.object({
        userId: z.string().uuid(),
        reason: z.string(),
        /** 暂停时长（天） */
        durationDays: z.number().int().min(1).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { userId, reason, durationDays } = input;

      const [updated] = await ctx.db
        .update(users)
        .set({
          status: "suspended",
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId))
        .returning();

      if (!updated) {
        throw new TRPCError({ code: "NOT_FOUND", message: "用户不存在" });
      }

      // 记录操作日志
      console.log(`管理员 ${ctx.admin.id} 暂停了用户 ${userId}，原因: ${reason}，时长: ${durationDays || "无限期"}天`);

      return {
        user: { ...updated, passwordHash: undefined, recoveryHash: undefined, verificationToken: undefined, resetToken: undefined },
        message: `用户已暂停${durationDays ? `，预计 ${durationDays} 天后自动恢复` : ""}`,
      };
    }),

  // ==================== 用户账户操作 ====================

  /**
   * 重置用户密码
   */
  resetPassword: adminProcedure
    .input(
      z.object({
        userId: z.string().uuid(),
        /** 新密码（如果不提供则生成随机密码） */
        newPassword: z.string().min(8).optional(),
        /** 是否要求用户下次登录时修改密码 */
        forceChange: z.boolean().optional().default(true),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { userId, newPassword, forceChange } = input;

      // 检查用户是否存在
      const [user] = await ctx.db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!user) {
        throw new TRPCError({ code: "NOT_FOUND", message: "用户不存在" });
      }

      // 生成或使用提供的密码
      const password = newPassword || generateRandomPassword();
      const passwordHash = await hashPassword(password);

      // 更新用户密码
      await ctx.db
        .update(users)
        .set({
          passwordHash,
          resetToken: null,
          resetTokenExpires: null,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId))
        .returning();

      // 记录操作日志
      console.log(`管理员 ${ctx.admin.id} 重置了用户 ${userId} 的密码`);

      return {
        success: true,
        message: "密码重置成功",
        // 仅在开发环境返回生成的密码
        generatedPassword: process.env.NODE_ENV === "development" && !newPassword ? password : undefined,
        forceChange,
      };
    }),

  /**
   * 手动验证用户邮箱
   */
  verifyEmailManually: adminProcedure
    .input(
      z.object({
        userId: z.string().uuid(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { userId } = input;

      const [updated] = await ctx.db
        .update(users)
        .set({
          emailVerified: true,
          verificationToken: null,
          verificationTokenExpires: null,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId))
        .returning();

      if (!updated) {
        throw new TRPCError({ code: "NOT_FOUND", message: "用户不存在" });
      }

      // 记录操作日志
      console.log(`管理员 ${ctx.admin.id} 手动验证了用户 ${userId} 的邮箱`);

      return {
        user: { ...updated, passwordHash: undefined, recoveryHash: undefined, verificationToken: undefined, resetToken: undefined },
        message: "邮箱验证成功",
      };
    }),

  /**
   * 删除用户（软删除或硬删除）
   */
  delete: adminProcedure
    .input(
      z.object({
        userId: z.string().uuid(),
        /** 是否硬删除（永久删除，谨慎使用） */
        hardDelete: z.boolean().optional().default(false),
        reason: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { userId, hardDelete, reason } = input;

      // 检查用户是否存在
      const [user] = await ctx.db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!user) {
        throw new TRPCError({ code: "NOT_FOUND", message: "用户不存在" });
      }

      if (hardDelete) {
        // 硬删除（永久删除）
        await ctx.db.delete(users).where(eq(users.id, userId));

        console.log(`管理员 ${ctx.admin.id} 硬删除了用户 ${userId}，原因: ${reason || "未指定"}`);

        return {
          success: true,
          message: "用户已永久删除",
        };
      } else {
        // 软删除（标记为禁用并清除敏感信息）
        const [updated] = await ctx.db
          .update(users)
          .set({
            status: "disabled",
            email: null,
            passwordHash: null,
            verificationToken: null,
            verificationTokenExpires: null,
            resetToken: null,
            resetTokenExpires: null,
            updatedAt: new Date(),
          })
          .where(eq(users.id, userId))
          .returning();

        console.log(`管理员 ${ctx.admin.id} 软删除了用户 ${userId}，原因: ${reason || "未指定"}`);

        return {
          user: { ...updated, passwordHash: undefined, recoveryHash: undefined, verificationToken: undefined, resetToken: undefined },
          message: "用户已软删除（标记为禁用并清除敏感信息）",
        };
      }
    }),
});

// ==================== 工具函数 ====================

/**
 * 生成随机密码
 */
function generateRandomPassword(length: number = 12): string {
  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
  let password = "";
  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * charset.length);
    password += charset[randomIndex];
  }
  return password;
}