import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);

/**
 * 密码哈希 - 使用 Node.js 内置 scrypt（零外部依赖）
 * 输出格式: salt:hash（均为 hex 编码）
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${salt}:${derivedKey.toString("hex")}`;
}

/**
 * 验证密码
 */
export async function verifyPassword(
  password: string,
  storedHash: string
): Promise<boolean> {
  const [salt, hash] = storedHash.split(":");
  if (!/^[a-f0-9]{32}$/i.test(salt || '') || !/^[a-f0-9]{128}$/i.test(hash || '')) return false;
  const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
  const hashBuffer = Buffer.from(hash, "hex");
  return timingSafeEqual(derivedKey, hashBuffer);
}

/**
 * 生成 API Key（32 字节 = 64 字符 hex）
 */
export function generateApiKey(): string {
  return randomBytes(32).toString("hex");
}

/**
 * 生成 API Secret（64 字节 = 128 字符 hex）
 */
export function generateApiSecret(): string {
  return randomBytes(64).toString("hex");
}

/**
 * 生成邮箱验证令牌（32 字节 hex）
 */
export function generateVerificationToken(): string {
  return randomBytes(32).toString("hex");
}

/**
 * 生成密码重置令牌（32 字节 hex）
 */
export function generateResetToken(): string {
  return randomBytes(32).toString("hex");
}

/**
 * 计算令牌过期时间
 * @param hoursFromNow 几小时后过期，默认 24 小时
 * @returns Date 对象
 */
export function getTokenExpiryDate(hoursFromNow: number = 24): Date {
  const expiry = new Date();
  expiry.setHours(expiry.getHours() + hoursFromNow);
  return expiry;
}

/**
 * 检查令牌是否已过期
 * @param expiresAt 过期时间
 * @returns 是否已过期
 */
export function isTokenExpired(expiresAt: Date | null | undefined): boolean {
  if (!expiresAt) return true;
  return new Date() > expiresAt;
}
