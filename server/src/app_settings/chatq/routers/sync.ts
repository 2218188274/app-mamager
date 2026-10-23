import { and,eq,count } from 'drizzle-orm';
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router,protectedProcedure } from '../../../trpc/index.js';
import { chatqSyncSpaces,users } from '../../../db/schema.js';
import { syncAuth,syncBlob,syncCredentialHash,requireSyncCredential } from '../../../services/chat-sync.js';
import {reserveSyncBudget} from '../../../services/chat-sync-budget.js';
import { interactionLimit } from '../../../services/interaction-limit.js';
export const syncRouter=router({
  create:protectedProcedure.input(syncAuth.extend({blob:syncBlob}).strict()).mutation(async({ctx,input})=>{
    interactionLimit(`sync-create:${ctx.app.id}:${ctx.userId}`,3,3600000);
    return ctx.db.transaction(async tx=>{
    await tx.select().from(users).where(eq(users.id,ctx.userId)).limit(1).for('update');
    const [existing]=await tx.select().from(chatqSyncSpaces).where(and(eq(chatqSyncSpaces.appId,ctx.app.id),eq(chatqSyncSpaces.spaceId,input.spaceId))).limit(1);
    if(existing){requireSyncCredential(existing.credentialHash,input.auth);return {revision:existing.revision};}
    const [total]=await tx.select({n:count()}).from(chatqSyncSpaces).where(and(eq(chatqSyncSpaces.appId,ctx.app.id),eq(chatqSyncSpaces.ownerUserId,ctx.userId)));
    if(Number(total.n)>=3)throw new TRPCError({code:'FORBIDDEN',message:'本设备最多创建 3 个同步空间，请使用已有同步码连接'});
    await reserveSyncBudget(tx,ctx.app.id,input.blob);
    const [row]=await tx.insert(chatqSyncSpaces).values({appId:ctx.app.id,ownerUserId:ctx.userId,spaceId:input.spaceId,credentialHash:syncCredentialHash(input.auth),blob:input.blob}).returning({revision:chatqSyncSpaces.revision});return row;
    });
  }),
  read:protectedProcedure.input(syncAuth).mutation(async({ctx,input})=>{
    interactionLimit(`sync:${ctx.app.id}:${ctx.userId}`);
    const [row]=await ctx.db.select().from(chatqSyncSpaces).where(and(eq(chatqSyncSpaces.appId,ctx.app.id),eq(chatqSyncSpaces.spaceId,input.spaceId))).limit(1);
    if(!row)throw new TRPCError({code:'UNAUTHORIZED',message:'同步空间不存在或同步码无效'});requireSyncCredential(row.credentialHash,input.auth);return {blob:row.blob,revision:row.revision,updatedAt:row.updatedAt.toISOString()};
  }),
  write:protectedProcedure.input(syncAuth.extend({revision:z.number().int().min(1).max(2147483646),blob:syncBlob}).strict()).mutation(async({ctx,input})=>{
    interactionLimit(`sync:${ctx.app.id}:${ctx.userId}`);
    const [row]=await ctx.db.select().from(chatqSyncSpaces).where(and(eq(chatqSyncSpaces.appId,ctx.app.id),eq(chatqSyncSpaces.spaceId,input.spaceId))).limit(1);
    if(!row)throw new TRPCError({code:'UNAUTHORIZED',message:'同步空间不存在或同步码无效'});requireSyncCredential(row.credentialHash,input.auth);
    return ctx.db.transaction(async tx=>{
    await reserveSyncBudget(tx,ctx.app.id,input.blob,Buffer.byteLength(row.blob));
    const [updated]=await tx.update(chatqSyncSpaces).set({blob:input.blob,revision:input.revision+1,updatedAt:new Date()}).where(and(eq(chatqSyncSpaces.id,row.id),eq(chatqSyncSpaces.revision,input.revision))).returning({revision:chatqSyncSpaces.revision});
    if(!updated)throw new TRPCError({code:'CONFLICT',message:'另一台设备刚更新了云端，请重新同步；未覆盖云端数据'});return updated;
    });
  }),
});
