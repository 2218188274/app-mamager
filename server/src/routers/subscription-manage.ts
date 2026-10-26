import { z } from "zod";
import { eq, and, sql, desc, count } from "drizzle-orm";
import { router, adminProcedure } from "../trpc/index.js";
import {
  apps,
  users,
  subscriptions,
  subscriptionPlans,
} from "../db/schema.js";
import { TRPCError } from "@trpc/server";

/**
 * 订阅管理路由（管理后台）
 *
 * 功能模块：
 *  plan.*   订阅计划 CRUD（为每个 App 配置订阅方案）
 *  sub.*    用户订阅查看与手动管理
 *  stats.*  订阅数据统计
 */
export const subscriptionManageRouter = router({
  // ==================== 订阅计划管理 ====================

  /**
   * 创建订阅计划
   * 为指定 App 添加一个新的订阅方案（如 "Pro 月度 ¥12"）
   */
  createPlan: adminProcedure
    .input(
      z.object({
        appId: z.string().uuid(),
        name: z.string().min(1).max(100),
        productId: z.string().min(1).max(255),
        tier: z.enum(["free", "pro_monthly", "pro_yearly"]).default("pro_monthly"),
        billingPeriod: z.enum(["monthly", "yearly", "lifetime", "custom"]).default("monthly"),
        priceCents: z.number().int().min(0),
        currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "币种需要 3 位英文字母，例如 CNY").default("CNY"),
        durationDays: z.number().int().min(1),
        description: z.string().optional(),
        features: z.array(z.string()).optional().default([]),
        isActive: z.boolean().optional().default(true),
        sortOrder: z.number().int().optional().default(0),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // 验证 App 存在
      const [app] = await ctx.db
        .select()
        .from(apps)
        .where(eq(apps.id, input.appId))
        .limit(1);

      if (!app) {
        throw new TRPCError({ code: "NOT_FOUND", message: "应用不存在" });
      }

      const [plan] = await ctx.db
        .insert(subscriptionPlans)
        .values({
          appId: input.appId,
          name: input.name,
          productId: input.productId,
          tier: input.tier,
          billingPeriod: input.billingPeriod,
          priceCents: input.priceCents,
          currency: input.currency,
          durationDays: input.durationDays,
          description: input.description,
          features: input.features,
          isActive: input.isActive,
          sortOrder: input.sortOrder,
        })
        .returning();

      return { plan, message: "订阅计划创建成功" };
    }),

  /**
   * 获取指定 App 的所有订阅计划
   */
  listPlans: adminProcedure
    .input(
      z.object({
        appId: z.string().uuid(),
        includeInactive: z.boolean().optional().default(false),
      })
    )
    .query(async ({ ctx, input }) => {
      const conditions = [eq(subscriptionPlans.appId, input.appId)];
      if (!input.includeInactive) {
        conditions.push(eq(subscriptionPlans.isActive, true));
      }

      return await ctx.db
        .select()
        .from(subscriptionPlans)
        .where(and(...conditions))
        .orderBy(subscriptionPlans.sortOrder);
    }),

  /**
   * 更新订阅计划
   */
  updatePlan: adminProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().min(1).max(100).optional(),
        priceCents: z.number().int().min(0).optional(),
        durationDays: z.number().int().min(1).optional(),
        description: z.string().optional(),
        features: z.array(z.string()).optional(),
        isActive: z.boolean().optional(),
        sortOrder: z.number().int().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...updateData } = input;

      const [updated] = await ctx.db
        .update(subscriptionPlans)
        .set({ ...updateData, updatedAt: new Date() })
        .where(eq(subscriptionPlans.id, id))
        .returning();

      if (!updated) {
        throw new TRPCError({ code: "NOT_FOUND", message: "订阅计划不存在" });
      }

      return { plan: updated, message: "订阅计划更新成功" };
    }),

  /**
   * 删除订阅计划（已有用户订阅的计划建议改为下架而非删除）
   */
  deletePlan: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // 检查是否有活跃订阅引用此计划
      const [activeSubCount] = await ctx.db
        .select({ count: count() })
        .from(subscriptions)
        .where(
          and(
            eq(subscriptions.planId, input.id),
            eq(subscriptions.status, "active")
          )
        );

      if (Number(activeSubCount?.count ?? 0) > 0) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `该计划下仍有 ${activeSubCount.count} 个活跃订阅，请先下架（isActive=false）而非直接删除`,
        });
      }

      const [deleted] = await ctx.db
        .delete(subscriptionPlans)
        .where(eq(subscriptionPlans.id, input.id))
        .returning();

      if (!deleted) {
        throw new TRPCError({ code: "NOT_FOUND", message: "订阅计划不存在" });
      }

      return { success: true, message: "订阅计划已删除" };
    }),

  // ==================== 用户订阅管理 ====================

  /**
   * 查看指定 App 的所有用户订阅列表
   */
  listSubscriptions: adminProcedure
    .input(
      z.object({
        appId: z.string().uuid(),
        status: z
          .enum(["active", "expired", "cancelled", "grace_period"])
          .optional(),
        tier: z.enum(["free", "pro_monthly", "pro_yearly"]).optional(),
        limit: z.number().int().min(1).max(100).optional().default(50),
        offset: z.number().int().min(0).optional().default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      // 先找到该 App 下的所有用户 ID
      const appUsers = ctx.db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.appId, input.appId));

      // 构建查询条件
      const conditions = [sql`${subscriptions.userId} IN (${appUsers})`];
      if (input.status) {
        conditions.push(eq(subscriptions.status, input.status));
      }
      if (input.tier) {
        conditions.push(eq(subscriptions.tier, input.tier));
      }

      const rows = await ctx.db
        .select({
          subscription: subscriptions,
          user: {
            id: users.id,
            username: users.username,
            deviceId: users.deviceId,
            email: users.email,
          },
          plan: {
            id: subscriptionPlans.id,
            name: subscriptionPlans.name,
            productId: subscriptionPlans.productId,
          },
        })
        .from(subscriptions)
        .innerJoin(users, eq(subscriptions.userId, users.id))
        .leftJoin(
          subscriptionPlans,
          eq(subscriptions.planId, subscriptionPlans.id)
        )
        .where(and(...conditions))
        .orderBy(desc(subscriptions.updatedAt))
        .limit(input.limit)
        .offset(input.offset);

      // 总数
      const [total] = await ctx.db
        .select({ count: count() })
        .from(subscriptions)
        .where(and(...conditions));

      return {
        items: rows,
        total: Number(total?.count ?? 0),
        limit: input.limit,
        offset: input.offset,
      };
    }),

  /**
   * 手动激活/变更用户订阅（管理员特权）
   * 用于补偿、促销、手动处理异常等场景
   */
  activateSubscription: adminProcedure
    .input(
      z.object({
        userId: z.string().uuid(),
        planId: z.string().uuid(),
        /** 覆盖时长（天），不传则使用计划默认时长 */
        durationDays: z.number().int().min(1).optional(),
        reason: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // 验证用户和计划
      const [user] = await ctx.db
        .select()
        .from(users)
        .where(eq(users.id, input.userId))
        .limit(1);

      if (!user) {
        throw new TRPCError({ code: "NOT_FOUND", message: "用户不存在" });
      }

      const [plan] = await ctx.db
        .select()
        .from(subscriptionPlans)
        .where(eq(subscriptionPlans.id, input.planId))
        .limit(1);

      if (!plan) {
        throw new TRPCError({ code: "NOT_FOUND", message: "订阅计划不存在" });
      }

      const days = input.durationDays ?? plan.durationDays;
      const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

      // 查找用户现有订阅
      const [existing] = await ctx.db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.userId, user.id))
        .limit(1);

      if (existing) {
        const [updated] = await ctx.db
          .update(subscriptions)
          .set({
            planId: plan.id,
            tier: plan.tier,
            status: "active",
            originalTransactionId: `admin_${Date.now()}`,
            expiresAt,
            updatedAt: new Date(),
          })
          .where(eq(subscriptions.id, existing.id))
          .returning();

        return { subscription: updated, message: "用户订阅已激活" };
      }

      const [newSub] = await ctx.db
        .insert(subscriptions)
        .values({
          userId: user.id,
          planId: plan.id,
          tier: plan.tier,
          status: "active",
          originalTransactionId: `admin_${Date.now()}`,
          expiresAt,
        })
        .returning();

      return { subscription: newSub, message: "用户订阅已创建并激活" };
    }),

  /**
   * 手动取消用户订阅
   */
  cancelSubscription: adminProcedure
    .input(
      z.object({
        subscriptionId: z.string().uuid(),
        reason: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db
        .update(subscriptions)
        .set({
          status: "cancelled",
          updatedAt: new Date(),
        })
        .where(eq(subscriptions.id, input.subscriptionId))
        .returning();

      if (!updated) {
        throw new TRPCError({ code: "NOT_FOUND", message: "订阅记录不存在" });
      }

      return { subscription: updated, message: "订阅已取消" };
    }),

  /**
   * 延长用户订阅
   */
  extendSubscription: adminProcedure
    .input(
      z.object({
        subscriptionId: z.string().uuid(),
        extraDays: z.number().int().min(1),
        reason: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [sub] = await ctx.db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.id, input.subscriptionId))
        .limit(1);

      if (!sub) {
        throw new TRPCError({ code: "NOT_FOUND", message: "订阅记录不存在" });
      }

      // 从当前过期时间或现在开始延长
      const baseDate =
        sub.expiresAt && new Date(sub.expiresAt) > new Date()
          ? new Date(sub.expiresAt)
          : new Date();

      const newExpiresAt = new Date(
        baseDate.getTime() + input.extraDays * 24 * 60 * 60 * 1000
      );

      const [updated] = await ctx.db
        .update(subscriptions)
        .set({
          status: "active",
          expiresAt: newExpiresAt,
          updatedAt: new Date(),
        })
        .where(eq(subscriptions.id, sub.id))
        .returning();

      return {
        subscription: updated,
        message: `订阅已延长 ${input.extraDays} 天，新到期时间: ${newExpiresAt.toISOString()}`,
      };
    }),

  // ==================== 订阅统计 ====================

  /**
   * 获取指定 App 的订阅统计数据
   */
  stats: adminProcedure
    .input(z.object({ appId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      // 该 App 的所有用户
      const appUserIds = ctx.db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.appId, input.appId));

      // 各状态订阅数
      const statusCounts = await ctx.db
        .select({
          status: subscriptions.status,
          count: count(),
        })
        .from(subscriptions)
        .where(sql`${subscriptions.userId} IN (${appUserIds})`)
        .groupBy(subscriptions.status);

      // 各层级订阅数
      const tierCounts = await ctx.db
        .select({
          tier: subscriptions.tier,
          count: count(),
        })
        .from(subscriptions)
        .where(sql`${subscriptions.userId} IN (${appUserIds})`)
        .groupBy(subscriptions.tier);

      // 总用户数
      const [userTotal] = await ctx.db
        .select({ count: count() })
        .from(users)
        .where(eq(users.appId, input.appId));

      // 可用计划数
      const [planTotal] = await ctx.db
        .select({ count: count() })
        .from(subscriptionPlans)
        .where(
          and(
            eq(subscriptionPlans.appId, input.appId),
            eq(subscriptionPlans.isActive, true)
          )
        );

      // 构建统计结果
      const statusMap: Record<string, number> = {};
      for (const row of statusCounts) {
        statusMap[row.status] = Number(row.count);
      }

      const tierMap: Record<string, number> = {};
      for (const row of tierCounts) {
        tierMap[row.tier] = Number(row.count);
      }

      return {
        totalUsers: Number(userTotal?.count ?? 0),
        activePlans: Number(planTotal?.count ?? 0),
        byStatus: {
          active: statusMap.active ?? 0,
          expired: statusMap.expired ?? 0,
          cancelled: statusMap.cancelled ?? 0,
          gracePeriod: statusMap.grace_period ?? 0,
        },
        byTier: {
          free: tierMap.free ?? 0,
          proMonthly: tierMap.pro_monthly ?? 0,
          proYearly: tierMap.pro_yearly ?? 0,
        },
        conversionRate:
          Number(userTotal?.count ?? 0) > 0
            ? (
                ((tierMap.pro_monthly ?? 0) + (tierMap.pro_yearly ?? 0)) /
                Number(userTotal?.count ?? 1)
              ).toFixed(4)
            : "0",
      };
    }),
});
