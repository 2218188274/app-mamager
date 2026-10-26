import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { router, appProcedure, protectedProcedure } from "../trpc/index.js";
import { users, subscriptions } from "../db/schema.js";
import { hashPassword, verifyPassword, generateVerificationToken, generateResetToken, getTokenExpiryDate, isTokenExpired } from "../utils/crypto.js";
import { sendVerificationEmail, sendPasswordResetEmail } from "../utils/email.js";
import { generateUserToken } from "../utils/jwt.js";
import { TRPCError } from "@trpc/server";
import { publicUser } from '../services/accounts.js';

/**
 * 用户路由（App 隔离）
 * 所有用户操作都限定在当前 App 范围内
 */
export const userRouter = router({
  /**
   * 设备注册
   * 客户端首次启动时调用，通过 deviceId 在当前 App 下注册用户
   */
  register: appProcedure
    .input(
      z.object({
        deviceId: z.string().min(1, "设备 ID 不能为空"),
        email: z.string().email("邮箱格式不正确").optional(),
      })
    )
    .input(
      z.object({
        deviceId: z.string().min(1, "设备 ID 不能为空"),
        email: z.string().email("邮箱格式不正确").optional(),
        password: z.string().min(6, "密码至少6位").optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // 在当前 App 范围内查找设备
      const existing = await ctx.db
        .select()
        .from(users)
        .where(
          and(
            eq(users.appId, ctx.app.id),
            eq(users.deviceId, input.deviceId)
          )
        )
        .limit(1);

      if (existing.length > 0) {
        return {
          user: publicUser(existing[0]),
          isNew: false,
          message: "设备已注册，欢迎回来",
        };
      }

      // 如果提供了邮箱，检查是否已被注册（同一App内）
      if (input.email) {
        const existingEmail = await ctx.db
          .select()
          .from(users)
          .where(
            and(
              eq(users.appId, ctx.app.id),
              eq(users.email, input.email)
            )
          )
          .limit(1);

        if (existingEmail.length > 0) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "该邮箱已被注册",
          });
        }
      }

      // 准备用户数据
      const userData: any = {
        appId: ctx.app.id,
        deviceId: input.deviceId,
        email: input.email,
        emailVerified: false,
      };

      // 如果有密码，哈希密码
      if (input.password) {
        userData.passwordHash = await hashPassword(input.password);
      }

      // 如果有邮箱，生成验证令牌并发送验证邮件
      if (input.email) {
        const verificationToken = generateVerificationToken();
        const verificationTokenExpires = getTokenExpiryDate(24);
        userData.verificationToken = verificationToken;
        userData.verificationTokenExpires = verificationTokenExpires;
      }

      userData.lastLoginAt = new Date();

      // 在当前 App 下创建新用户
      const [newUser] = await ctx.db
        .insert(users)
        .values(userData)
        .returning();

      // 为新用户创建免费订阅
      await ctx.db.insert(subscriptions).values({
        userId: newUser.id,
        tier: "free",
        status: "active",
      });

      // 如果提供了邮箱，发送验证邮件
      if (input.email && userData.verificationToken) {
        await sendVerificationEmail(input.email, userData.verificationToken, ctx.app.name);
      }

      return {
        user: publicUser(newUser),
        isNew: true,
        message: input.email ? "注册成功，请查收验证邮件" : "注册成功",
      };
    }),

  /**
   * 刷新 Token
   */
  refresh: protectedProcedure.mutation(async ({ ctx }) => {
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
      return { success: false, message: "用户不存在" };
    }

    // 生成新的用户 JWT Token
    const token = generateUserToken(
      {
        id: user.id,
        deviceId: user.deviceId,
        email: user.email ?? undefined,
        emailVerified: user.emailVerified, tokenVersion: user.tokenVersion, username: user.username,
      },
      ctx.app.id
    );

    return {
      success: true,
      token,
      message: "Token 刷新成功",
    };
  }),

  /**
   * 获取当前用户信息（含订阅状态）
   */
  me: protectedProcedure.query(async ({ ctx }) => {
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
      return null;
    }

    const [sub] = await ctx.db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, user.id))
      .limit(1);

    return {
      ...publicUser(user),
      subscription: sub ?? null,
    };
  }),

  /**
   * 邮箱注册
   * 通过邮箱和密码创建新用户，自动发送验证邮件
   */
  registerWithEmail: appProcedure
    .input(
      z.object({
        email: z.string().email("邮箱格式不正确"),
        password: z.string().min(6, "密码至少6位"),
        deviceId: z.string().min(1, "设备ID不能为空").optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // 检查邮箱是否已被注册（同一App内）
      const existingUser = await ctx.db
        .select()
        .from(users)
        .where(
          and(
            eq(users.appId, ctx.app.id),
            eq(users.email, input.email)
          )
        )
        .limit(1);

      if (existingUser.length > 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "该邮箱已被注册",
        });
      }

      // 哈希密码
      const passwordHash = await hashPassword(input.password);

      // 生成验证令牌
      const verificationToken = generateVerificationToken();
      const verificationTokenExpires = getTokenExpiryDate(24); // 24小时后过期

      // 创建用户
      const [newUser] = await ctx.db
        .insert(users)
        .values({
          appId: ctx.app.id,
          deviceId: input.deviceId || `email:${input.email}`, // 如果没有设备ID，使用邮箱作为设备标识
          email: input.email,
          passwordHash,
          emailVerified: false,
          verificationToken,
          verificationTokenExpires,
          lastLoginAt: new Date(),
        })
        .returning();

      // 为新用户创建免费订阅
      await ctx.db.insert(subscriptions).values({
        userId: newUser.id,
        tier: "free",
        status: "active",
      });

      // 发送验证邮件（开发环境输出到控制台）
      await sendVerificationEmail(input.email, verificationToken, ctx.app.name);

      return {
        user: {
          id: newUser.id,
          email: newUser.email,
          emailVerified: newUser.emailVerified,
          createdAt: newUser.createdAt,
        },
        message: "注册成功，请查收验证邮件",
      };
    }),

  /**
   * 验证邮箱
   */
  verifyEmail: appProcedure
    .input(
      z.object({
        token: z.string().min(1, "验证令牌不能为空"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [user] = await ctx.db
        .select()
        .from(users)
        .where(
          and(
            eq(users.appId, ctx.app.id),
            eq(users.verificationToken, input.token),
            eq(users.emailVerified, false) // 确保尚未验证
          )
        )
        .limit(1);

      if (!user) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "验证令牌无效或已过期",
        });
      }

      // 检查令牌是否过期
      if (isTokenExpired(user.verificationTokenExpires)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "验证令牌已过期，请重新请求验证邮件",
        });
      }

      // 更新用户为已验证状态
      await ctx.db
        .update(users)
        .set({
          emailVerified: true,
          verificationToken: null,
          verificationTokenExpires: null,
          updatedAt: new Date(),
        })
        .where(eq(users.id, user.id));

      return {
        success: true,
        message: "邮箱验证成功",
      };
    }),

  /**
   * 重新发送验证邮件
   */
  resendVerificationEmail: appProcedure
    .input(
      z.object({
        email: z.string().email("邮箱格式不正确"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [user] = await ctx.db
        .select()
        .from(users)
        .where(
          and(
            eq(users.appId, ctx.app.id),
            eq(users.email, input.email),
            eq(users.emailVerified, false) // 仅未验证用户可重新发送
          )
        )
        .limit(1);

      if (!user) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "用户不存在或邮箱已验证",
        });
      }

      // 生成新的验证令牌
      const verificationToken = generateVerificationToken();
      const verificationTokenExpires = getTokenExpiryDate(24);

      // 更新用户验证令牌
      await ctx.db
        .update(users)
        .set({
          verificationToken,
          verificationTokenExpires,
          updatedAt: new Date(),
        })
        .where(eq(users.id, user.id));

      // 发送验证邮件
      await sendVerificationEmail(input.email, verificationToken, ctx.app.name);

      return {
        success: true,
        message: "验证邮件已重新发送",
      };
    }),

  /**
   * 邮箱密码登录
   */
  loginWithEmail: appProcedure
    .input(
      z.object({
        email: z.string().email("邮箱格式不正确"),
        password: z.string().min(1, "密码不能为空"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [user] = await ctx.db
        .select()
        .from(users)
        .where(
          and(
            eq(users.appId, ctx.app.id),
            eq(users.email, input.email)
          )
        )
        .limit(1);

      if (!user) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "邮箱或密码不正确",
        });
      }

      // 检查用户是否有密码
      if (!user.passwordHash) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "该账户未设置密码，请使用设备登录",
        });
      }

      // 验证密码
      const validPassword = await verifyPassword(input.password, user.passwordHash);
      if (!validPassword) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "邮箱或密码不正确",
        });
      }

      // 检查邮箱是否已验证
      if (!user.emailVerified) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "请先验证您的邮箱",
        });
      }

      // 更新最后登录时间
      await ctx.db
        .update(users)
        .set({
          lastLoginAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(users.id, user.id));

      // 生成用户 JWT Token
      const token = generateUserToken(
        {
          id: user.id,
          deviceId: user.deviceId,
          email: user.email ?? undefined,
          emailVerified: user.emailVerified,
        },
        ctx.app.id
      );

      return {
        success: true,
        token,
        user: {
          id: user.id,
          email: user.email,
          emailVerified: user.emailVerified,
          deviceId: user.deviceId,
        },
        message: "登录成功",
      };
    }),

  /**
   * 请求密码重置
   */
  requestPasswordReset: appProcedure
    .input(
      z.object({
        email: z.string().email("邮箱格式不正确"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [user] = await ctx.db
        .select()
        .from(users)
        .where(
          and(
            eq(users.appId, ctx.app.id),
            eq(users.email, input.email)
          )
        )
        .limit(1);

      if (!user) {
        // 出于安全考虑，不透露用户是否存在
        return {
          success: true,
          message: "如果该邮箱已注册，重置邮件将发送到您的邮箱",
        };
      }

      // 生成重置令牌
      const resetToken = generateResetToken();
      const resetTokenExpires = getTokenExpiryDate(1); // 1小时后过期

      // 更新用户重置令牌
      await ctx.db
        .update(users)
        .set({
          resetToken,
          resetTokenExpires,
          updatedAt: new Date(),
        })
        .where(eq(users.id, user.id));

      // 发送重置邮件
      await sendPasswordResetEmail(input.email, resetToken, ctx.app.name);

      return {
        success: true,
        message: "重置邮件已发送，请查收",
      };
    }),

  /**
   * 重置密码
   */
  resetPassword: appProcedure
    .input(
      z.object({
        token: z.string().min(1, "重置令牌不能为空"),
        newPassword: z.string().min(6, "新密码至少6位"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [user] = await ctx.db
        .select()
        .from(users)
        .where(
          and(
            eq(users.appId, ctx.app.id),
            eq(users.resetToken, input.token)
          )
        )
        .limit(1);

      if (!user) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "重置令牌无效",
        });
      }

      // 检查令牌是否过期
      if (isTokenExpired(user.resetTokenExpires)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "重置令牌已过期，请重新请求重置",
        });
      }

      // 哈希新密码
      const passwordHash = await hashPassword(input.newPassword);

      // 更新密码并清除重置令牌
      await ctx.db
        .update(users)
        .set({
          passwordHash,
          tokenVersion: user.tokenVersion + 1,
          resetToken: null,
          resetTokenExpires: null,
          updatedAt: new Date(),
        })
        .where(eq(users.id, user.id));

      return {
        success: true,
        message: "密码重置成功",
      };
    }),

  /**
   * 修改密码（需要当前密码）
   */
  updatePassword: protectedProcedure
    .input(
      z.object({
        currentPassword: z.string().min(1, "当前密码不能为空"),
        newPassword: z.string().min(6, "新密码至少6位"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.user?.username) throw new TRPCError({ code: 'BAD_REQUEST', message: '请在聊商账号页修改密码' });
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
          code: "NOT_FOUND",
          message: "用户不存在",
        });
      }

      // 检查用户是否有密码
      if (!user.passwordHash) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "该账户未设置密码，无法修改",
        });
      }

      // 验证当前密码
      const validPassword = await verifyPassword(input.currentPassword, user.passwordHash);
      if (!validPassword) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "当前密码不正确",
        });
      }

      // 哈希新密码
      const passwordHash = await hashPassword(input.newPassword);

      // 更新密码
      await ctx.db
        .update(users)
        .set({
          passwordHash,
          tokenVersion: user.tokenVersion + 1,
          updatedAt: new Date(),
        })
        .where(eq(users.id, user.id));

      return {
        success: true,
        message: "密码修改成功",
      };
    }),

  /**
   * 更新用户资料（邮箱、设备ID等）
   */
  updateProfile: protectedProcedure
    .input(
      z.object({
        email: z.string().email("邮箱格式不正确").optional(),
        deviceId: z.string().min(1, "设备ID不能为空").optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.user?.username) throw new TRPCError({ code: 'BAD_REQUEST', message: '账号资料不支持通过设备接口修改' });
      // 首先查询当前用户，获取用户ID
      const [currentUser] = await ctx.db
        .select()
        .from(users)
        .where(
          and(
            eq(users.appId, ctx.app.id),
            eq(users.deviceId, ctx.deviceId)
          )
        )
        .limit(1);

      if (!currentUser) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "用户不存在",
        });
      }

      const updates: Record<string, any> = {
        updatedAt: new Date(),
      };

      if (input.email !== undefined) {
        // 检查邮箱是否已被其他用户使用
        if (input.email) {
          const existingUser = await ctx.db
            .select()
            .from(users)
            .where(
              and(
                eq(users.appId, ctx.app.id),
                eq(users.email, input.email),
                eq(users.id, currentUser.id) // 排除当前用户自己
              )
            )
            .limit(1);

          if (existingUser.length > 0) {
            throw new TRPCError({
              code: "CONFLICT",
              message: "该邮箱已被其他用户使用",
            });
          }
        }
        updates.email = input.email;
        // 更改邮箱后需要重新验证
        updates.emailVerified = false;
      }

      if (input.deviceId !== undefined) {
        updates.deviceId = input.deviceId;
      }

      const [updatedUser] = await ctx.db
        .update(users)
        .set(updates)
        .where(eq(users.id, currentUser.id))
        .returning();

      return {
        user: publicUser(updatedUser),
        message: "资料更新成功",
      };
    }),
});
