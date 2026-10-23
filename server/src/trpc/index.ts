import { initTRPC, TRPCError } from "@trpc/server";
import { eq, and } from "drizzle-orm";
import type { Context } from "./context.js";
import { admins, users } from "../db/schema.js";
import { extractAndVerifyToken, extractAndVerifyUserToken, type AdminJWTPayload } from "../utils/jwt.js";

/**
 * tRPC 初始化（多租户版）
 *
 * Procedure 层级：
 *  publicProcedure    → 无需任何认证
 *  appProcedure       → 需要有效的 x-api-key（客户端 App 级别）
 *  protectedProcedure → 需要 x-api-key + x-device-id（客户端用户级别）
 *  adminProcedure     → 需要管理员 JWT 认证（管理后台）
 */
const t = initTRPC.context<Context>().create({
  errorFormatter({ shape }) {
    return shape;
  },
});

/** 创建路由 */
export const router = t.router;

/** 公开 procedure（无需认证） */
export const publicProcedure = t.procedure;

/**
 * App 级别 procedure
 * 要求请求携带有效的 x-api-key，解析出对应的 App
 */
export const appProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.app) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "无效的 API Key，请在请求头中携带有效的 x-api-key",
    });
  }

  if (!ctx.app.isActive) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "该应用已被禁用，请联系管理员",
    });
  }

  return next({
    ctx: {
      ...ctx,
      app: ctx.app,
    },
  });
});

/**
 * 用户级别 procedure（需要 App 认证 + 用户认证）
 * 支持两种认证方式：
 * 1. 传统方式：x-api-key + x-device-id（设备标识）
 * 2. JWT方式：x-api-key + Authorization: Bearer <user_token>
 *
 * 如果同时提供两种方式，优先使用 JWT 认证
 */
export const protectedProcedure = appProcedure.use(async ({ ctx, next }) => {
  let userAuth: {
    userId: string;
    deviceId: string;
    user?: typeof users.$inferSelect;
  } | null = null;

  // 首先尝试 JWT 认证
  if (ctx.authorization) {
    const payload = extractAndVerifyUserToken(ctx.authorization);
    if (payload) {
      // 验证 Token 类型
      if (payload.type !== "user_access_token") {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "无效的用户 Token 类型",
        });
      }

      // 验证 Token 中的 App ID 是否与当前 App 匹配
      if (payload.appId !== ctx.app.id) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Token 与应用不匹配",
        });
      }

      // 从数据库中获取最新用户信息（确保用户仍存在）
      const [user] = await ctx.db
        .select()
        .from(users)
        .where(
          and(
            eq(users.appId, ctx.app.id),
            eq(users.id, payload.userId),
            eq(users.deviceId, payload.deviceId)
          )
        )
        .limit(1);

      if (!user) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "用户不存在或 Token 已失效",
        });
      }

      userAuth = {
        userId: user.id,
        deviceId: user.deviceId,
        user,
      };
    }
  }

  // 如果没有 JWT 认证，回退到设备标识认证
  if (!userAuth) {
    if (!ctx.deviceId) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "缺少用户认证，请提供 x-device-id 或 Authorization Token",
      });
    }

    // 根据设备标识查找用户
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
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "用户不存在或设备标识无效",
      });
    }

    userAuth = {
      userId: user.id,
      deviceId: user.deviceId,
      user,
    };
  }

  if (userAuth.user && ['disabled', 'suspended'].includes(userAuth.user.status)) {
    throw new TRPCError({ code: 'FORBIDDEN', message: '当前用户已停用，请联系管理员' });
  }

  return next({
    ctx: {
      ...ctx,
      deviceId: userAuth.deviceId,
      userId: userAuth.userId,
      user: userAuth.user,
    },
  });
});

/**
 * 管理员 procedure
 * 管理后台请求需要 Authorization: Bearer <token>
 * 仅接受经过签名验证的管理员 JWT。
 */
export const adminProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.authorization) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "缺少管理员认证，请在请求头中携带 Authorization",
    });
  }

  let adminId: string | null = null;
  let payload: AdminJWTPayload | null = null;

  // 首先尝试 JWT 验证
  payload = extractAndVerifyToken(ctx.authorization);
  if (payload) {
    // 验证 JWT Token 类型
    if (payload.type !== "access_token") {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "无效的 Token 类型",
      });
    }
    adminId = payload.id;
  } else {
    // 管理员认证必须通过 JWT 签名验证
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "无效的管理员 Token",
    });
  }

  // 从数据库中获取最新管理员信息（确保管理员仍存在且状态正常）
  const [admin] = await ctx.db
    .select()
    .from(admins)
    .where(eq(admins.id, adminId))
    .limit(1);

  if (!admin) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "管理员不存在或 Token 已失效",
    });
  }

  // 如果是 JWT Token，检查版本号是否匹配
  if (payload && payload.version !== admin.tokenVersion) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Token 已失效，请重新登录",
    });
  }

  return next({
    ctx: {
      ...ctx,
      admin,
    },
  });
});
