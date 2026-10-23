import { createHash,timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
export const syncAuth = z.object({spaceId:z.string().regex(/^[a-f0-9]{32}$/),auth:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
export const syncBlob = z.string().max(12*1024*1024).refine(value=>{
  try {const v=JSON.parse(value);return Object.keys(v).sort().join(',')==='data,format,iv,salt,version'&&v.format==='chatq-encrypted-backup'&&v.version===1&&typeof v.data==='string'&&/^[A-Za-z0-9+/]+={0,2}$/.test(v.data)&&typeof v.salt==='string'&&/^[A-Za-z0-9+/]{22}==$/.test(v.salt)&&typeof v.iv==='string'&&/^[A-Za-z0-9+/]{16}$/.test(v.iv);}catch{return false;}
},'同步内容必须是有效的加密数据');
export const syncCredentialHash = (auth:string)=>createHash('sha256').update(auth).digest('hex');
export function requireSyncCredential(expected:string,auth:string){const a=Buffer.from(expected,'hex'),b=Buffer.from(syncCredentialHash(auth),'hex');if(a.length!==b.length||!timingSafeEqual(a,b))throw new TRPCError({code:'UNAUTHORIZED',message:'同步空间不存在或同步码无效'});}
