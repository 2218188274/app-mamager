/**
 * Webhook 路由 - 处理外部服务推送通知
 * 主要处理 Apple Store Server Notifications V2
 */

import { FastifyPluginAsync } from "fastify";
import { eq, and } from "drizzle-orm";
import { subscriptions, users, apps } from "../db/schema.js";
import { getGlobalAppleStoreService } from "../services/apple/index.js";
import { getGlobalCache, SubscriptionCacheKeys } from "../utils/cache.js";
import type { AppleNotificationType } from "../services/apple/types.js";

/**
 * Apple Webhook 路由插件
 */
const appleWebhookPlugin: FastifyPluginAsync = async (fastify) => {
  // Apple Store Server Notifications V2 Webhook
  fastify.post("/apple", async (request, reply) => {
    // ChatQ's Android deployment has no verified Apple billing integration.
    // Fail before parsing any mock notification or touching entitlements.
    if (process.env.CHATQ_DISABLE_APPLE_WEBHOOK === 'true') {
      return reply.status(503).send({ error: 'BILLING_NOT_CONFIGURED', message: '商店支付验证尚未配置' });
    }
    const signature = request.headers["x-apple-signature"] as string;
    const body = request.body as string;

    if (!signature) {
      return reply.status(400).send({
        error: "MISSING_SIGNATURE",
        message: "缺少 X-Apple-Signature 请求头",
      });
    }

    if (!body) {
      return reply.status(400).send({
        error: "EMPTY_BODY",
        message: "请求体为空",
      });
    }

    const appleService = getGlobalAppleStoreService();

    try {
      // 1. 验证签名
      const isSignatureValid = await appleService.verifyWebhookSignature(body, signature);

      if (!isSignatureValid) {
        fastify.log.warn({ msg: "Apple Webhook 签名验证失败", signature });
        return reply.status(401).send({
          error: "INVALID_SIGNATURE",
          message: "签名验证失败",
        });
      }

      // 2. 解析通知
      const notification = await appleService.parseWebhookNotification(body);

      fastify.log.info({
        msg: "收到 Apple Webhook 通知",
        notificationType: notification.notificationType,
        notificationUUID: notification.notificationUUID,
        originalTransactionId: notification.data.originalTransactionId,
        environment: notification.data.environment,
      });

      // 3. 根据通知类型处理
      await handleAppleNotification(notification, fastify);

      // 4. 返回成功响应
      return reply.status(200).send({
        success: true,
        message: "通知处理成功",
        notificationUUID: notification.notificationUUID,
      });

    } catch (error) {
      fastify.log.error({ msg: "处理 Apple Webhook 失败", err: error });
      return reply.status(500).send({
        error: "PROCESSING_ERROR",
        message: "处理通知时发生错误",
      });
    }
  });

  // 健康检查端点（供 Apple 验证 Webhook 可用性）
  fastify.get("/apple/health", async (_, reply) => {
    return reply.status(200).send({
      status: "ok",
      service: "Apple Webhook Handler",
      timestamp: new Date().toISOString(),
    });
  });
};

/**
 * 处理 Apple 通知
 */
async function handleAppleNotification(
  notification: any,
  fastify: any
): Promise<void> {
  const { notificationType, data } = notification;
  const { originalTransactionId, bundleId, environment } = data;

  fastify.log.debug("处理 Apple 通知", {
    notificationType,
    originalTransactionId,
    bundleId,
    environment,
  });

  // 根据通知类型路由到不同的处理器
  switch (notificationType as AppleNotificationType) {
    case "DID_CHANGE_RENEWAL_STATUS":
      await handleRenewalStatusChange(notification, fastify);
      break;

    case "DID_RENEW":
      await handleSubscriptionRenewal(notification, fastify);
      break;

    case "EXPIRED":
      await handleSubscriptionExpired(notification, fastify);
      break;

    case "DID_FAIL_TO_RENEW":
      await handleRenewalFailure(notification, fastify);
      break;

    case "GRACE_PERIOD_EXPIRED":
      await handleGracePeriodExpired(notification, fastify);
      break;

    case "REFUND":
      await handleRefund(notification, fastify);
      break;

    case "CONSUMPTION_REQUEST":
      await handleConsumptionRequest(notification, fastify);
      break;

    case "RENEWAL_EXTENDED":
      await handleRenewalExtended(notification, fastify);
      break;

    case "REVOKE":
      await handleRevocation(notification, fastify);
      break;

    case "TEST":
      fastify.log.info("收到 Apple 测试通知", {
        notificationUUID: notification.notificationUUID,
      });
      break;

    default:
      fastify.log.warn("未知的 Apple 通知类型", { notificationType });
  }
}

/**
 * 处理续订状态变更
 */
async function handleRenewalStatusChange(notification: any, fastify: any): Promise<void> {
  const { data } = notification;
  const { originalTransactionId, signedRenewalInfo } = data;

  try {
    // 这里应该解析 signedRenewalInfo 获取最新的续订状态
    // 目前先记录日志，后续实现完整的解析逻辑

    fastify.log.info("处理续订状态变更", {
      originalTransactionId,
      hasRenewalInfo: !!signedRenewalInfo,
    });

    // TODO: 解析 signedRenewalInfo 并更新数据库

  } catch (error) {
    fastify.log.error("处理续订状态变更失败", error);
  }
}

/**
 * 处理订阅续订
 */
async function handleSubscriptionRenewal(notification: any, fastify: any): Promise<void> {
  const { data } = notification;
  const { originalTransactionId, signedTransactionInfo } = data;

  try {
    // 查找对应的订阅记录
    const [subscription] = await fastify.db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.originalTransactionId, originalTransactionId))
      .limit(1);

    if (!subscription) {
      fastify.log.warn("未找到对应的订阅记录", { originalTransactionId });
      return;
    }

    // 更新订阅状态为 active，并延长过期时间
    // 这里应该解析 signedTransactionInfo 获取新的过期时间
    // 目前先使用默认逻辑

    const newExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 默认30天

    await fastify.db
      .update(subscriptions)
      .set({
        status: "active",
        expiresAt: newExpiresAt,
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.id, subscription.id));

    // 清除用户订阅缓存
    const cache = getGlobalCache();
    cache.delete(SubscriptionCacheKeys.userSubscription(subscription.userId));

    fastify.log.info("订阅续订成功", {
      subscriptionId: subscription.id,
      originalTransactionId,
      newExpiresAt,
    });

  } catch (error) {
    fastify.log.error("处理订阅续订失败", error);
  }
}

/**
 * 处理订阅过期
 */
async function handleSubscriptionExpired(notification: any, fastify: any): Promise<void> {
  const { data } = notification;
  const { originalTransactionId } = data;

  try {
    const [subscription] = await fastify.db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.originalTransactionId, originalTransactionId))
      .limit(1);

    if (!subscription) {
      fastify.log.warn("未找到对应的订阅记录", { originalTransactionId });
      return;
    }

    await fastify.db
      .update(subscriptions)
      .set({
        status: "expired",
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.id, subscription.id));

    fastify.log.info("订阅已标记为过期", {
      subscriptionId: subscription.id,
      originalTransactionId,
    });

  } catch (error) {
    fastify.log.error("处理订阅过期失败", error);
  }
}

/**
 * 处理续订失败
 */
async function handleRenewalFailure(notification: any, fastify: any): Promise<void> {
  const { data } = notification;
  const { originalTransactionId } = data;

  fastify.log.warn("订阅续订失败", { originalTransactionId });

  // 可以在这里触发告警或发送通知给用户
}

/**
 * 处理宽限期结束
 */
async function handleGracePeriodExpired(notification: any, fastify: any): Promise<void> {
  const { data } = notification;
  const { originalTransactionId } = data;

  try {
    const [subscription] = await fastify.db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.originalTransactionId, originalTransactionId))
      .limit(1);

    if (!subscription) {
      fastify.log.warn("未找到对应的订阅记录", { originalTransactionId });
      return;
    }

    await fastify.db
      .update(subscriptions)
      .set({
        status: "expired", // 宽限期结束，标记为过期
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.id, subscription.id));

    fastify.log.info("宽限期已结束", {
      subscriptionId: subscription.id,
      originalTransactionId,
    });

  } catch (error) {
    fastify.log.error("处理宽限期结束失败", error);
  }
}

/**
 * 处理退款
 */
async function handleRefund(notification: any, fastify: any): Promise<void> {
  const { data } = notification;
  const { originalTransactionId } = data;

  try {
    const [subscription] = await fastify.db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.originalTransactionId, originalTransactionId))
      .limit(1);

    if (!subscription) {
      fastify.log.warn("未找到对应的订阅记录", { originalTransactionId });
      return;
    }

    await fastify.db
      .update(subscriptions)
      .set({
        status: "cancelled",
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.id, subscription.id));

    fastify.log.info("订阅已退款并取消", {
      subscriptionId: subscription.id,
      originalTransactionId,
    });

  } catch (error) {
    fastify.log.error("处理退款失败", error);
  }
}

/**
 * 处理消耗型商品请求（目前不适用）
 */
async function handleConsumptionRequest(notification: any, fastify: any): Promise<void> {
  fastify.log.info("收到消耗型商品请求", {
    notificationUUID: notification.notificationUUID,
  });
  // 我们的应用使用自动续订订阅，不处理消耗型商品
}

/**
 * 处理续订延期
 */
async function handleRenewalExtended(notification: any, fastify: any): Promise<void> {
  const { data } = notification;
  const { originalTransactionId } = data;

  fastify.log.info("订阅续订已延期", { originalTransactionId });
  // 可以记录日志或更新数据库
}

/**
 * 处理权限撤销
 */
async function handleRevocation(notification: any, fastify: any): Promise<void> {
  const { data } = notification;
  const { originalTransactionId } = data;

  try {
    const [subscription] = await fastify.db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.originalTransactionId, originalTransactionId))
      .limit(1);

    if (!subscription) {
      fastify.log.warn("未找到对应的订阅记录", { originalTransactionId });
      return;
    }

    await fastify.db
      .update(subscriptions)
      .set({
        status: "cancelled",
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.id, subscription.id));

    fastify.log.info("订阅权限已被撤销", {
      subscriptionId: subscription.id,
      originalTransactionId,
    });

  } catch (error) {
    fastify.log.error("处理权限撤销失败", error);
  }
}

export default appleWebhookPlugin;
