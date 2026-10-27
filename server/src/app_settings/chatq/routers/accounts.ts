import { z } from 'zod';
import { and, eq, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { isIP } from 'node:net';
import { TRPCError } from '@trpc/server';
import { router, appProcedure, protectedProcedure } from '../../../trpc/index.js';
import { users, chatqSyncSpaces } from '../../../db/schema.js';
import { hashPassword, verifyPassword } from '../../../utils/crypto.js';
import { interactionLimit } from '../../../services/interaction-limit.js';
import { accountName, accountPassword, recoveryCode, createRecoveryCode, accountSession, publicUser, requireAccount } from '../../../services/accounts.js';

function admission(ctx: { app: { id: string; configName: string }; req: { ip: string; headers: Record<string, unknown> } }, name: string) {
  if (ctx.app.configName !== 'chatq') throw new TRPCError({ code: 'FORBIDDEN', message: '当前应用不支持此账号功能' });
  if (process.env.NODE_ENV === 'production' && ctx.req.headers['x-forwarded-proto'] !== 'https') throw new TRPCError({ code: 'PRECONDITION_FAILED', message: '账号操作需要 HTTPS 安全连接，请更新服务器地址' });
  const forwarded = ctx.req.headers['x-forwarded-for'];
  const address = typeof forwarded === 'string' && isIP(forwarded.trim()) ? forwarded.trim() : ctx.req.ip;
  interactionLimit(`account-ip:${ctx.app.id}:${address}`, 60, 3600000);
  interactionLimit(`account-name:${ctx.app.id}:${name}`, 10, 900000);
}
function conflict(error: unknown): never {
  if ((error as { code?: string })?.code === '23505' || (error as { cause?: { code?: string } })?.cause?.code === '23505') throw new TRPCError({ code: 'CONFLICT', message: '此账号已被注册，请换一个或直接登录' });
  throw error;
}
export const accountsRouter = router({
  close:protectedProcedure.input(z.object({currentPassword:z.string().min(1).max(128),confirmation:z.literal('注销账号')}).strict()).mutation(async({ctx,input})=>{
    const account=requireAccount(ctx.user);admission(ctx,account.username!);
    return ctx.db.transaction(async tx=>{
      const [current]=await tx.select().from(users).where(and(eq(users.appId,ctx.app.id),eq(users.id,ctx.userId))).limit(1).for('update');requireAccount(current);
      if(current.tokenVersion!==account.tokenVersion)throw new TRPCError({code:'UNAUTHORIZED',message:'登录已失效，请重新登录'});
      if(!await verifyPassword(input.currentPassword,current.passwordHash!))throw new TRPCError({code:'FORBIDDEN',message:'当前密码不正确，账号未注销'});
      await tx.execute(sql`SELECT pg_advisory_xact_lock(11420261023)`);
      const spaces=await tx.delete(chatqSyncSpaces).where(and(eq(chatqSyncSpaces.appId,ctx.app.id),eq(chatqSyncSpaces.ownerUserId,current.id))).returning({id:chatqSyncSpaces.id});
      await tx.update(users).set({username:null,email:null,passwordHash:null,recoveryHash:null,emailVerified:false,verificationToken:null,verificationTokenExpires:null,resetToken:null,resetTokenExpires:null,lastLoginAt:null,status:'disabled',deviceId:'closed:'+randomUUID(),tokenVersion:current.tokenVersion+1,updatedAt:new Date()}).where(and(eq(users.appId,ctx.app.id),eq(users.id,current.id)));
      return {closed:true,deletedSpaces:spaces.length,minimalTransactionRecordsRetained:true};
    });
  }),
  status: protectedProcedure.query(({ ctx }) => ({ user: publicUser(ctx.user!), mode: ctx.user?.username ? 'account' : 'guest' })),
  register: protectedProcedure.input(z.object({ username: accountName, password: accountPassword }).strict()).mutation(async ({ ctx, input }) => {
    admission(ctx, input.username);
    if (ctx.user?.passwordHash || ctx.user?.username) throw new TRPCError({ code: 'CONFLICT', message: '当前已绑定账号，请先退出后再注册' });
    const code = createRecoveryCode(), [passwordHash, recoveryHash] = await Promise.all([hashPassword(input.password), hashPassword(recoveryCode.parse(code))]);
    try {
      const user = await ctx.db.transaction(async tx => {
        const [current] = await tx.select().from(users).where(and(eq(users.id, ctx.userId), eq(users.appId, ctx.app.id))).limit(1).for('update');
        if (!current || current.passwordHash || current.username || current.status !== 'active') throw new TRPCError({ code: 'CONFLICT', message: '设备状态已变化，请重新连接后重试' });
        const [updated] = await tx.update(users).set({ username: input.username, passwordHash, recoveryHash, deviceId: 'account:' + randomUUID(), tokenVersion: (current.tokenVersion ?? 0) + 1, lastLoginAt: new Date(), updatedAt: new Date() }).where(eq(users.id, current.id)).returning();
        return updated;
      });
      return { ...accountSession(user), recoveryCode: code };
    } catch (error) { conflict(error); }
  }),
  login: appProcedure.input(z.object({ username: accountName, password: z.string().min(1).max(128) }).strict()).mutation(async ({ ctx, input }) => {
    admission(ctx, input.username);
    const [user] = await ctx.db.select().from(users).where(and(eq(users.appId, ctx.app.id), eq(users.username, input.username))).limit(1);
    // Always perform scrypt, including when the account does not exist.
    const valid = await verifyPassword(input.password, user?.passwordHash || '00000000000000000000000000000000:' + '00'.repeat(64));
    if (!valid || !user) throw new TRPCError({ code: 'UNAUTHORIZED', message: '账号或密码不正确' });
    requireAccount(user);
    await ctx.db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
    return accountSession(user);
  }),
  recover: appProcedure.input(z.object({ username: accountName, recoveryCode, newPassword: accountPassword }).strict()).mutation(async ({ ctx, input }) => {
    admission(ctx, input.username);
    const code = createRecoveryCode(), [passwordHash, recoveryHash] = await Promise.all([hashPassword(input.newPassword), hashPassword(recoveryCode.parse(code))]);
    const user = await ctx.db.transaction(async tx => {
      const [current] = await tx.select().from(users).where(and(eq(users.appId, ctx.app.id), eq(users.username, input.username))).limit(1).for('update');
      const valid = await verifyPassword(input.recoveryCode, current?.recoveryHash || '00000000000000000000000000000000:' + '00'.repeat(64));
      if (!valid || !current) throw new TRPCError({ code: 'UNAUTHORIZED', message: '账号或恢复码不正确' });
      requireAccount(current);
      const [updated] = await tx.update(users).set({ passwordHash, recoveryHash, tokenVersion: current.tokenVersion + 1, updatedAt: new Date() }).where(eq(users.id, current.id)).returning();
      return updated;
    });
    return { ...accountSession(user), recoveryCode: code };
  }),
  changePassword: protectedProcedure.input(z.object({ currentPassword: z.string().min(1).max(128), newPassword: accountPassword }).strict()).mutation(async ({ ctx, input }) => {
    const account = requireAccount(ctx.user); admission(ctx, account.username!);
    const user = await ctx.db.transaction(async tx => {
      const [current] = await tx.select().from(users).where(eq(users.id, ctx.userId)).limit(1).for('update');
      requireAccount(current);
      if (current.tokenVersion !== account.tokenVersion) throw new TRPCError({ code: 'UNAUTHORIZED', message: '登录已失效，请重新登录' });
      if (!await verifyPassword(input.currentPassword, current.passwordHash!)) throw new TRPCError({ code: 'FORBIDDEN', message: '当前密码不正确，请重新输入' });
      const [updated] = await tx.update(users).set({ passwordHash: await hashPassword(input.newPassword), tokenVersion: current.tokenVersion + 1, updatedAt: new Date() }).where(eq(users.id, current.id)).returning();
      return updated;
    });
    return accountSession(user);
  }),
  rotateRecovery: protectedProcedure.input(z.object({ currentPassword: z.string().min(1).max(128) }).strict()).mutation(async ({ ctx, input }) => {
    const account = requireAccount(ctx.user); admission(ctx, account.username!);
    const code = createRecoveryCode();
    const user = await ctx.db.transaction(async tx => {
      const [current] = await tx.select().from(users).where(and(eq(users.id, ctx.userId), eq(users.appId, ctx.app.id))).limit(1).for('update');
      requireAccount(current);
      if (current.tokenVersion !== account.tokenVersion) throw new TRPCError({ code: 'UNAUTHORIZED', message: '登录已失效，请重新登录' });
      if (!await verifyPassword(input.currentPassword, current.passwordHash!)) throw new TRPCError({ code: 'FORBIDDEN', message: '当前密码不正确，请重新输入' });
      const [updated] = await tx.update(users).set({ recoveryHash: await hashPassword(recoveryCode.parse(code)), tokenVersion: current.tokenVersion + 1, updatedAt: new Date() }).where(eq(users.id, current.id)).returning();
      return updated;
    });
    return { ...accountSession(user), recoveryCode: code };
  }),
  logout: protectedProcedure.mutation(async ({ ctx }) => {
    const user = requireAccount(ctx.user); admission(ctx, user.username!);
    // Compare-and-swap: a delayed logout cannot invalidate a later password reset.
    await ctx.db.update(users).set({ tokenVersion: user.tokenVersion + 1 }).where(and(eq(users.id, user.id), eq(users.tokenVersion, user.tokenVersion)));
    return { loggedOut: true };
  }),
  refresh: protectedProcedure.mutation(({ ctx }) => accountSession(requireAccount(ctx.user))),
});
