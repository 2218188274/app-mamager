import {statfsSync} from 'node:fs';
import {sql,eq} from 'drizzle-orm';
import {TRPCError} from '@trpc/server';
import type {db} from '../db/index.js';
import {chatqSyncSpaces} from '../db/schema.js';
const MB=1024*1024;
export function checkSyncBudget(appBytes:number,totalBytes:number,incoming:number,previous:number,freeBytes:number){
  if(appBytes-previous+incoming>128*MB||totalBytes-previous+incoming>256*MB||freeBytes<128*MB+incoming*3)throw new TRPCError({code:'PRECONDITION_FAILED',message:'同步服务可用空间不足，未覆盖云端或本机记录；请保留本机备份并联系管理员扩容'});
}
/** Serialize budget accounting inside the same transaction as each cloud write. */
export async function reserveSyncBudget(database:Pick<typeof db,'execute'|'select'>,appId:string,blob:string,previous=0){
  await database.execute(sql`SELECT pg_advisory_xact_lock(11420261023)`);
  const [app]=await database.select({bytes:sql<string>`coalesce(sum(octet_length(${chatqSyncSpaces.blob})),0)`}).from(chatqSyncSpaces).where(eq(chatqSyncSpaces.appId,appId));
  const [total]=await database.select({bytes:sql<string>`coalesce(sum(octet_length(${chatqSyncSpaces.blob})),0)`}).from(chatqSyncSpaces);
  let free=Infinity;
  if(process.env.NODE_ENV!=='test'){try{const fs=statfsSync('/');free=fs.bavail*fs.bsize;}catch{free=0;}}
  checkSyncBudget(Number(app.bytes),Number(total.bytes),Buffer.byteLength(blob,'utf8'),previous,free);
}
