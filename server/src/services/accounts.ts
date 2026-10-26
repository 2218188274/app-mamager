import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { randomBytes } from 'node:crypto';
import { generateUserToken } from '../utils/jwt.js';
import type { users } from '../db/schema.js';

export const accountName = z.string().trim().toLowerCase().regex(/^[a-z][a-z0-9_]{3,31}$/, '账号为 4–32 位字母、数字或下划线，以字母开头');
export const accountPassword = z.string().min(8, '密码至少 8 位').max(128, '密码最多 128 位');
export const recoveryCode = z.string().trim().transform(s => s.replace(/[-\s]/g, '').toUpperCase()).pipe(z.string().regex(/^[A-F0-9]{32}$/, '恢复码为 32 位，请核对后重试'));
export function createRecoveryCode() { return randomBytes(16).toString('hex').toUpperCase().match(/.{4}/g)!.join('-'); }
export function publicUser(user: typeof users.$inferSelect) {
  return { id: user.id, username: user.username ?? null, email: user.email, emailVerified: user.emailVerified, status: user.status, createdAt: user.createdAt };
}
export function accountSession(user: typeof users.$inferSelect) {
  return { user: publicUser(user), token: generateUserToken({ ...user, email: user.email ?? undefined }, user.appId), expiresAt: new Date(Date.now() + 30 * 86400000).toISOString() };
}
export function requireAccount(user: typeof users.$inferSelect | undefined) {
  if (!user?.username || !user.passwordHash) throw new TRPCError({ code: 'PRECONDITION_FAILED', message: '请先注册或登录账号' });
  if (user.status !== 'active') throw new TRPCError({ code: 'FORBIDDEN', message: '当前账号已停用，请联系管理员' });
  return user;
}
