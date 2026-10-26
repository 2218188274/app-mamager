// Explicit integration suite. Every write is confined to connection-local TEMP tables.
import assert from 'node:assert/strict';
import postgres from 'postgres';import {drizzle} from 'drizzle-orm/postgres-js';import {eq} from 'drizzle-orm';import {randomUUID} from 'node:crypto';
import * as schema from '../dist/db/schema.js';
import {accountsRouter} from '../dist/app_settings/chatq/routers/accounts.js';
import {userRouter} from '../dist/routers/user.js';
import {keyboardAccount} from '../dist/services/ai/keyboard-account.js';
const connection=postgres(process.env.DATABASE_URL,{max:1,onnotice:()=>{}}),db=drizzle(connection,{schema});
let checks=0;const check=(value,label)=>{assert.ok(value,label);checks++;},reject=async(promise,code)=>{await assert.rejects(promise,e=>e.code===code);checks++;};
try {
 for(const name of ['users','subscriptions','usage_records','subscription_plans','chatq_payment_orders']) await connection.unsafe(`CREATE TEMP TABLE ${name} (LIKE public.${name} INCLUDING ALL)`);
 await connection.unsafe('ALTER TABLE pg_temp.users ADD COLUMN IF NOT EXISTS username varchar(40), ADD COLUMN IF NOT EXISTS recovery_hash varchar(255), ADD COLUMN IF NOT EXISTS token_version integer NOT NULL DEFAULT 0');
 await connection.unsafe('CREATE UNIQUE INDEX IF NOT EXISTS account_qa_username ON pg_temp.users(app_id,username)');
 for(const name of ['users','subscriptions','usage_records','subscription_plans','chatq_payment_orders']) {const [row]=await connection.unsafe(`SELECT to_regclass('${name}')::oid != to_regclass('public.${name}')::oid AS isolated`);check(row.isolated,'connection uses TEMP '+name);}
 const app={id:randomUUID(),isActive:true,configName:'chatq',name:'Isolated account QA',settings:{enableAI:true,enableSubscription:false,freeReplyLimitPerDay:10,freeCandidateCount:1,proCandidateCount:3}};
 const guestDevice='qa-guest-'+randomUUID();const [guest]=await db.insert(schema.users).values({appId:app.id,deviceId:guestDevice}).returning();
 await db.insert(schema.subscriptions).values({userId:guest.id,tier:'pro_monthly',status:'active',expiresAt:new Date(Date.now()+86400000)});
 await db.insert(schema.usageRecords).values({userId:guest.id,date:new Date().toISOString().slice(0,10),replyCount:7});
 const base={db,app,deviceId:guestDevice,req:{ip:randomUUID(),headers:{'x-forwarded-proto':'https'}}};const guestCaller=accountsRouter.createCaller(base);
 const username='qa_'+randomUUID().replaceAll('-','').slice(0,12),password='fixture-password-123';
 const bound=await guestCaller.register({username,password});check(bound.user.id===guest.id,'registration preserves user identity');check(!!bound.recoveryCode,'one-time recovery code returned');check(!JSON.stringify(bound.user).includes('passwordHash'),'public identity hides credentials');
 const owner={...base,authorization:'Bearer '+bound.token,deviceId:'different-physical-device'};const member=await keyboardAccount({...base,userId:bound.user.id});check(member.quota.isPro&&member.quota.used===7,'membership and used quota survive binding');check(member.identity.mode==='account','member is account-owned');
 await reject(guestCaller.status(),'UNAUTHORIZED');const [rotated]=await db.select().from(schema.users).where(eq(schema.users.id,guest.id));check(rotated.deviceId!==guestDevice,'old guest device cannot access account');
 const safeRegister=await userRouter.createCaller(base).register({deviceId:guestDevice});check(safeRegister.user.id!==guest.id,'old physical device becomes separate guest');check(!('passwordHash'in safeRegister.user)&&!('recoveryHash'in safeRegister.user),'device endpoint sanitizes response');
 const caller=accountsRouter.createCaller(base);await reject(caller.login({username,password:'wrong-password'}),'UNAUTHORIZED');
 const second=await caller.login({username:username.toUpperCase(),password});check(second.user.id===guest.id,'case-normalized cross-device login shares identity');
 check((await accountsRouter.createCaller(owner).status()).mode==='account','valid account bearer accepted');
 const refreshed=await userRouter.createCaller(owner).refresh();check(!!refreshed.token,'legacy refresh preserves versioned account session');
 await reject(userRouter.createCaller(owner).updateProfile({deviceId:'attack'}),'BAD_REQUEST');await reject(accountsRouter.createCaller({...owner,authorization:'Bearer invalid'}).status(),'UNAUTHORIZED');
 const duplicate=accountsRouter.createCaller({...base,deviceId:guestDevice});await reject(duplicate.register({username,password}),'CONFLICT');
 const changed=await accountsRouter.createCaller(owner).changePassword({currentPassword:password,newPassword:'new-fixture-password'});check(changed.user.id===guest.id,'password change preserves account');
 await reject(accountsRouter.createCaller(owner).status(),'UNAUTHORIZED');await reject(caller.login({username,password}),'UNAUTHORIZED');
 const changedOwner={...owner,authorization:'Bearer '+changed.token};check((await accountsRouter.createCaller(changedOwner).status()).user.username===username,'current session continues after password change');
 const recovered=await caller.recover({username,recoveryCode:bound.recoveryCode,newPassword:'recovered-fixture-password'});check(recovered.recoveryCode!==bound.recoveryCode,'recovery rotates one-time code');await reject(accountsRouter.createCaller(changedOwner).status(),'UNAUTHORIZED');
 await reject(caller.recover({username,recoveryCode:bound.recoveryCode,newPassword:'not-used-password'}),'UNAUTHORIZED');
 const recoveryOwner={...owner,authorization:'Bearer '+recovered.token};await accountsRouter.createCaller(recoveryOwner).logout();await reject(accountsRouter.createCaller(recoveryOwner).status(),'UNAUTHORIZED');
 const relogin=await caller.login({username,password:'recovered-fixture-password'});const final=await keyboardAccount({...base,userId:relogin.user.id});check(final.quota.used===7&&final.quota.isPro,'logout and recovery do not reset quota or membership');
 const rotatingDevice='qa-rotate-'+randomUUID();await db.insert(schema.users).values({appId:app.id,deviceId:rotatingDevice});
 const rotating=await accountsRouter.createCaller({...base,deviceId:rotatingDevice}).register({username:'qa_rotate_'+randomUUID().slice(0,8),password});
 const rotateCaller=accountsRouter.createCaller({...base,authorization:'Bearer '+rotating.token});
 await reject(rotateCaller.rotateRecovery({currentPassword:'wrong-password'}),'FORBIDDEN');
 await reject(rotateCaller.changePassword({currentPassword:'wrong-password',newPassword:'unused-fixture-password'}),'FORBIDDEN');check((await rotateCaller.status()).user.id===rotating.user.id,'password typo preserves the valid account session');
 const newRecovery=await rotateCaller.rotateRecovery({currentPassword:password});check(newRecovery.recoveryCode!==rotating.recoveryCode,'authenticated recovery code rotation replaces the old code');
 check(newRecovery.user.id===rotating.user.id,'recovery rotation preserves account identity');await reject(rotateCaller.status(),'UNAUTHORIZED');
 await reject(caller.recover({username:newRecovery.user.username,recoveryCode:rotating.recoveryCode,newPassword:'unused-new-password'}),'UNAUTHORIZED');
 check((await accountsRouter.createCaller({...base,authorization:'Bearer '+newRecovery.token}).status()).user.id===rotating.user.id,'rotated recovery session remains usable on the current device');
 await db.update(schema.users).set({status:'disabled',username:'qa_disabled_'+randomUUID().slice(0,8)}).where(eq(schema.users.id,guest.id));const [disabled]=await db.select().from(schema.users).where(eq(schema.users.id,guest.id));await reject(caller.login({username:disabled.username,password:'recovered-fixture-password'}),'FORBIDDEN');
 console.log('PASS '+checks+' isolated PostgreSQL account/membership checks; no live rows written');
} finally {await connection.end({timeout:5});}
