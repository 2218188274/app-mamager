import jwt from "jsonwebtoken";
import type { Admin } from "../db/schema.js";

/**
 * JWT 配置
 */
const JWT_CONFIG = {
  /** JWT 密钥，从环境变量读取 */
  secret: process.env.JWT_SECRET || "your-jwt-secret-change-in-production",

  /** Access Token 过期时间（默认 24 小时） */
  accessTokenExpiresIn: "24h",

  /** Refresh Token 过期时间（默认 7 天） - 后续可启用 */
  // refreshTokenExpiresIn: "7d",
} as const;

if (process.env.NODE_ENV === "production" && (!process.env.JWT_SECRET || JWT_CONFIG.secret === "your-jwt-secret-change-in-production" || JWT_CONFIG.secret.length < 32)) {
  throw new Error("Production requires a unique JWT_SECRET of at least 32 characters");
}

// 安全警告：检查是否使用默认 JWT 密钥
if (JWT_CONFIG.secret === "your-jwt-secret-change-in-production") {
  console.warn(
    "⚠️  警告：使用默认 JWT 密钥，生产环境请修改 .env 中的 JWT_SECRET"
  );
}

/**
 * 管理员 JWT Payload 结构
 */
export interface AdminJWTPayload {
  /** 管理员 ID */
  id: string;

  /** 管理员用户名 */
  username: string;

  /** 管理员邮箱 */
  email: string;

  /** 管理员角色 */
  role: "super_admin" | "admin";

  /** Token 版本号（用于使旧 Token 失效） */
  version: number;

  /** Token 类型 */
  type: "access_token";

  /** 颁发时间 */
  iat?: number;

  /** 过期时间 */
  exp?: number;
}

/**
 * 用户 JWT Payload 结构
 */
export interface UserJWTPayload {
  /** 用户 ID */
  userId: string;

  /** 应用 ID */
  appId: string;

  /** 设备标识 */
  deviceId: string;

  /** 用户邮箱（可选） */
  email?: string;

  /** 邮箱验证状态 */
  emailVerified: boolean;

  /** Token 版本号（用于使旧 Token 失效） */
  version: number;

  /** Token 类型 */
  type: "user_access_token";

  /** 颁发时间 */
  iat?: number;

  /** 过期时间 */
  exp?: number;
}

/**
 * 生成管理员 Access Token
 * @param admin 管理员对象
 * @returns JWT Token
 */
export function generateAdminToken(
  admin: Pick<Admin, "id" | "username" | "email" | "role" | "tokenVersion">
): string {
  const payload: AdminJWTPayload = {
    id: admin.id,
    username: admin.username,
    email: admin.email,
    role: admin.role,
    version: admin.tokenVersion,
    type: "access_token",
  };

  return jwt.sign(payload, JWT_CONFIG.secret, {
    expiresIn: JWT_CONFIG.accessTokenExpiresIn,
  });
}

/**
 * 验证管理员 Token
 * @param token JWT Token
 * @returns 解析后的 Payload 或 null
 */
export function verifyAdminToken(token: string): AdminJWTPayload | null {
  try {
    // 移除可能的 "Bearer " 前缀
    const cleanToken = token.replace(/^Bearer\s+/i, "");

    const payload = jwt.verify(cleanToken, JWT_CONFIG.secret) as AdminJWTPayload;

    // 验证 Token 类型
    if (payload.type !== "access_token") {
      console.warn("无效的 Token 类型:", payload.type);
      return null;
    }

    return payload;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      console.warn("JWT Token 已过期");
    } else if (error instanceof jwt.JsonWebTokenError) {
      console.warn("JWT Token 验证失败:", error.message);
    } else {
      console.error("JWT 验证未知错误:", error);
    }
    return null;
  }
}

/**
 * 检查 Token 是否即将过期（用于刷新）
 * @param payload JWT Payload
 * @param thresholdSeconds 过期阈值（秒），默认 1 小时
 * @returns 是否即将过期
 */
export function isTokenExpiringSoon(
  payload: AdminJWTPayload,
  thresholdSeconds: number = 3600
): boolean {
  if (!payload.exp) return false;

  const now = Math.floor(Date.now() / 1000);
  const timeUntilExpiry = payload.exp - now;

  return timeUntilExpiry < thresholdSeconds;
}

/**
 * 从 Authorization Header 中提取并验证 Token
 * @param authorizationHeader Authorization 请求头
 * @returns 验证后的 Payload 或 null
 */
export function extractAndVerifyToken(authorizationHeader?: string): AdminJWTPayload | null {
  if (!authorizationHeader) {
    return null;
  }

  return verifyAdminToken(authorizationHeader);
}

/**
 * 生成用户 Access Token
 * @param user 用户对象
 * @param appId 应用 ID
 * @returns JWT Token
 */
export function generateUserToken(
  user: { id: string; deviceId: string; email?: string; emailVerified: boolean },
  appId: string
): string {
  const payload: UserJWTPayload = {
    userId: user.id,
    appId,
    deviceId: user.deviceId,
    email: user.email,
    emailVerified: user.emailVerified,
    version: 0, // 用户 Token 版本控制（后续可扩展）
    type: "user_access_token",
  };

  return jwt.sign(payload, JWT_CONFIG.secret, {
    expiresIn: JWT_CONFIG.accessTokenExpiresIn,
  });
}

/**
 * 验证用户 Token
 * @param token JWT Token
 * @returns 解析后的 Payload 或 null
 */
export function verifyUserToken(token: string): UserJWTPayload | null {
  try {
    // 移除可能的 "Bearer " 前缀
    const cleanToken = token.replace(/^Bearer\s+/i, "");

    const payload = jwt.verify(cleanToken, JWT_CONFIG.secret) as UserJWTPayload;

    // 验证 Token 类型
    if (payload.type !== "user_access_token") {
      console.warn("无效的用户 Token 类型:", payload.type);
      return null;
    }

    return payload;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      console.warn("用户 JWT Token 已过期");
    } else if (error instanceof jwt.JsonWebTokenError) {
      console.warn("用户 JWT Token 验证失败:", error.message);
    } else {
      console.error("用户 JWT 验证未知错误:", error);
    }
    return null;
  }
}

/**
 * 从 Authorization Header 中提取并验证用户 Token
 * @param authorizationHeader Authorization 请求头
 * @returns 验证后的 Payload 或 null
 */
export function extractAndVerifyUserToken(authorizationHeader?: string): UserJWTPayload | null {
  if (!authorizationHeader) {
    return null;
  }

  return verifyUserToken(authorizationHeader);
}

/**
 * 检查用户 Token 是否即将过期（用于刷新）
 * @param payload 用户 JWT Payload
 * @param thresholdSeconds 过期阈值（秒），默认 1 小时
 * @returns 是否即将过期
 */
export function isUserTokenExpiringSoon(
  payload: UserJWTPayload,
  thresholdSeconds: number = 3600
): boolean {
  if (!payload.exp) return false;

  const now = Math.floor(Date.now() / 1000);
  const timeUntilExpiry = payload.exp - now;

  return timeUntilExpiry < thresholdSeconds;
}