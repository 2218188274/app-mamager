import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { router, appProcedure, protectedProcedure } from "../trpc/index.js";
import { users, subscriptions, subscriptionPlans } from "../db/schema.js";
import { TRPCError } from "@trpc/server";
import { getGlobalAppleStoreService } from "../services/apple/index.js";
import { getGlobalCache, SubscriptionCacheKeys } from "../utils/cache.js";

/**
 * 订阅路由 - 客户端 API（App 隔离）
 *
 * 客户端通过此路由：
 *  1. 查询当前 App 有哪些可购买的订阅计划
 *  2. 购买后验证收据并激活订阅
 *  3. 查询当前订阅状态
 *  4. 恢复购买
 */
export const subscriptionRouter = router({
  /**
   * 获取当前 App 的可用订阅计划列表
   * 客户端展示付费墙时调用，无需用户级别认证
   */
  plans: appProcedure.query(async ({ ctx }) => {
    return await ctx.db
      .select({
        id: subscriptionPlans.id,
        name: subscriptionPlans.name,
        productId: subscriptionPlans.productId,
        tier: subscriptionPlans.tier,
        billingPeriod: subscriptionPlans.billingPeriod,
        priceCents: subscriptionPlans.priceCents,
        currency: subscriptionPlans.currency,
        durationDays: subscriptionPlans.durationDays,
        description: subscriptionPlans.description,
        features: subscriptionPlans.features,
      })
      .from(subscriptionPlans)
      .where(
        and(
          eq(subscriptionPlans.appId, ctx.app.id),
          eq(subscriptionPlans.isActive, true)
        )
      )
      .orderBy(subscriptionPlans.sortOrder);
  }),

  /**
   * 验证 App Store / Google Play 收据
   * 客户端完成购买后调用，通过 productId 匹配到对应的 plan 并激活订阅
   */
  verify: protectedProcedure
    .input(
      z.object({
        receiptData: z.string().min(1, "收据数据不能为空"),
        productId: z.string().min(1, "产品 ID 不能为空"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.app.configName === 'chatq') throw new TRPCError({ code: 'PRECONDITION_FAILED', message: '聊商商店内购尚未接入，请使用已启用的收款渠道；权益须真实到账或由管理员开通' });
      // 1. 查找用户
      const [user] = await ctx.db
        .select()
        .from(users)
        .where(
          and(
            eq(users.appId, ctx.app.id),
            eq(users.deviceId, ctx.deviceId)
          )
        )
        .limit(1);

      if (!user) {
        throw new TRPCError({ code: "NOT_FOUND", message: "用户不存在" });
      }

      // 2. 通过 productId 在当前 App 下查找对应的订阅计划
      const [plan] = await ctx.db
        .select()
        .from(subscriptionPlans)
        .where(
          and(
            eq(subscriptionPlans.appId, ctx.app.id),
            eq(subscriptionPlans.productId, input.productId)
          )
        )
        .limit(1);

      if (!plan) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `未找到产品 ID 为 "${input.productId}" 的订阅计划`,
        });
      }

      if (!plan.isActive) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "该订阅计划已下架",
        });
      }

      // 3. 调用 Apple Store API 验证收据合法性
      const appleService = getGlobalAppleStoreService();
      const validationResult = await appleService.verifyReceipt(
        input.receiptData,
        input.productId
      );

      if (!validationResult.isValid) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: validationResult.error?.message || "收据验证失败",
        });
      }

      // 检查产品ID是否匹配
      if (validationResult.productId !== input.productId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `收据中的产品ID (${validationResult.productId}) 与请求的产品ID (${input.productId}) 不匹配`,
        });
      }

      // 4. 激活订阅（使用 Apple 返回的过期时间）
      const expiresAt = validationResult.expiresAt || new Date(
        Date.now() + plan.durationDays * 24 * 60 * 60 * 1000
      );

      const [existing] = await ctx.db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.userId, user.id))
        .limit(1);

      // 确定订阅状态（根据 Apple 返回的状态）
      let subscriptionStatus: typeof subscriptions.$inferSelect.status = "active";
      if (validationResult.status === "expired") {
        subscriptionStatus = "expired";
      } else if (validationResult.status === "cancelled") {
        subscriptionStatus = "cancelled";
      } else if (validationResult.status === "grace_period") {
        subscriptionStatus = "grace_period";
      }

      if (existing) {
        const [updated] = await ctx.db
          .update(subscriptions)
          .set({
            planId: plan.id,
            tier: plan.tier,
            status: subscriptionStatus,
            originalTransactionId: validationResult.originalTransactionId,
            expiresAt,
            updatedAt: new Date(),
          })
          .where(eq(subscriptions.id, existing.id))
          .returning();

        // 清除用户订阅缓存
        const cache = getGlobalCache();
        cache.delete(SubscriptionCacheKeys.userSubscription(user.id));

        return {
          subscription: updated,
          plan: { id: plan.id, name: plan.name },
          message: "订阅验证成功",
          appleValidation: {
            originalTransactionId: validationResult.originalTransactionId,
            willAutoRenew: validationResult.willAutoRenew,
            isInIntroOfferPeriod: validationResult.isInIntroOfferPeriod,
          },
        };
      }

      const [newSub] = await ctx.db
        .insert(subscriptions)
        .values({
          userId: user.id,
          planId: plan.id,
          tier: plan.tier,
          status: subscriptionStatus,
          originalTransactionId: validationResult.originalTransactionId,
          expiresAt,
        })
        .returning();

      // 清除用户订阅缓存
      const cache = getGlobalCache();
      cache.delete(SubscriptionCacheKeys.userSubscription(user.id));

      return {
        subscription: newSub,
        plan: { id: plan.id, name: plan.name },
        message: "订阅创建成功",
        appleValidation: {
          originalTransactionId: validationResult.originalTransactionId,
          willAutoRenew: validationResult.willAutoRenew,
          isInIntroOfferPeriod: validationResult.isInIntroOfferPeriod,
        },
      };
    }),

  /**
   * 查询当前用户订阅状态（带缓存）
   */
  status: protectedProcedure.query(async ({ ctx }) => {
    const [user] = await ctx.db
      .select()
      .from(users)
      .where(
        and(
          eq(users.appId, ctx.app.id),
          eq(users.deviceId, ctx.deviceId)
        )
      )
      .limit(1);

    if (!user) {
      throw new TRPCError({ code: "NOT_FOUND", message: "用户不存在" });
    }

    // 检查缓存
    const cache = getGlobalCache();
    const cacheKey = SubscriptionCacheKeys.userSubscription(user.id);
    const cachedResult = cache.get(cacheKey);

    if (cachedResult) {
      return cachedResult;
    }

    const [sub] = await ctx.db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, user.id))
      .limit(1);

    if (!sub) {
      return {
        tier: "free" as const,
        status: "active" as const,
        isPro: false,
        plan: null,
        expiresAt: null,
      };
    }

    // 查询关联的计划信息
    let planInfo = null;
    if (sub.planId) {
      const [plan] = await ctx.db
        .select({
          id: subscriptionPlans.id,
          name: subscriptionPlans.name,
          billingPeriod: subscriptionPlans.billingPeriod,
        })
        .from(subscriptionPlans)
        .where(eq(subscriptionPlans.id, sub.planId))
        .limit(1);
      planInfo = plan ?? null;
    }

    const isExpired = sub.expiresAt && new Date(sub.expiresAt) < new Date();
    const isPro =
      sub.tier !== "free" && sub.status === "active" && !isExpired;

    const result = {
      tier: sub.tier,
      status: isExpired ? ("expired" as const) : sub.status,
      isPro,
      plan: planInfo,
      expiresAt: sub.expiresAt,
    };

    // 缓存结果
    cache.set(cacheKey, result);

    return result;
  }),

  /**
   * 恢复购买
   */
  restore: protectedProcedure
    .input(
      z.object({
        originalTransactionId: z.string().min(1),
      })
    )
    .mutation(async ({ ctx }) => {
      if (ctx.app.configName === 'chatq') throw new TRPCError({ code: 'PRECONDITION_FAILED', message: '聊商商店内购尚未接入，不能使用模拟收据恢复会员；请登录原账号查询真实权益' });
      const [user] = await ctx.db
        .select()
        .from(users)
        .where(
          and(
            eq(users.appId, ctx.app.id),
            eq(users.deviceId, ctx.deviceId)
          )
        )
        .limit(1);

      if (!user) {
        throw new TRPCError({ code: "NOT_FOUND", message: "用户不存在" });
      }

      // TODO: 通过 App Store Server API 验证 originalTransactionId
      return {
        success: true,
        message: "恢复购买功能将在集成 App Store Server API 后完善",
      };
    }),
});
