import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {router,protectedProcedure} from '../dist/trpc/index.js';
import {generateUserToken,verifyUserToken} from '../dist/utils/jwt.js';
import {hashPassword,verifyPassword} from '../dist/utils/crypto.js';
import {accountName,accountPassword,recoveryCode,createRecoveryCode,publicUser} from '../dist/services/accounts.js';
import {subscriptionRouter} from '../dist/routers/subscription.js';
import Fastify from 'fastify';
import appleWebhook from '../dist/routers/webhook.js';
const failure=code=>e=>e.code===code;

test('Android deployment rejects legacy mock Apple notifications before processing',async()=>{
 const previous=process.env.CHATQ_DISABLE_APPLE_WEBHOOK;process.env.CHATQ_DISABLE_APPLE_WEBHOOK='true';
 const app=Fastify();try{await app.register(appleWebhook);const r=await app.inject({method:'POST',url:'/apple',headers:{'x-apple-signature':'mock_signature_forged'},payload:{notificationType:'DID_RENEW',data:{originalTransactionId:'forged'}}});assert.equal(r.statusCode,503);assert.equal(r.json().error,'BILLING_NOT_CONFIGURED');}finally{await app.close();if(previous===undefined)delete process.env.CHATQ_DISABLE_APPLE_WEBHOOK;else process.env.CHATQ_DISABLE_APPLE_WEBHOOK=previous;}
});
test('ChatQ rejects mock store receipt verification and restore before entitlement writes',async()=>{
 let reads=0;const user={id:randomUUID(),deviceId:'guest',status:'active'},ctx={app:{id:randomUUID(),configName:'chatq',isActive:true},deviceId:'guest',db:{select:()=>{reads++;return {from:()=>({where:()=>({limit:async()=>[user]})})};}}};
 const caller=subscriptionRouter.createCaller(ctx);
 await assert.rejects(caller.verify({receiptData:'fake-receipt',productId:'fake-plan'}),failure('PRECONDITION_FAILED'));
 await assert.rejects(caller.restore({originalTransactionId:'fake-transaction'}),failure('PRECONDITION_FAILED'));assert.equal(reads,2);
});
test('account schema normalizes names, bounds passwords, and creates random recoverable codes',()=>{
 assert.equal(accountName.parse(' Tester_01 '),'tester_01');for(const x of ['a','1test','test@x','a'.repeat(33),'x x x'])assert.equal(accountName.safeParse(x).success,false);
 assert.equal(accountPassword.safeParse('x'.repeat(129)).success,false);assert.equal(accountPassword.safeParse('1234567').success,false);
 const a=createRecoveryCode(),b=createRecoveryCode();assert.notEqual(a,b);assert.equal(recoveryCode.parse(a).length,32);assert.equal(recoveryCode.parse(a.toLowerCase()),recoveryCode.parse(a));
});
test('hashes never contain a plaintext password and damaged hash safely rejects',async()=>{const hash=await hashPassword('secure-password');assert.ok(!hash.includes('secure-password'));assert.equal(await verifyPassword('secure-password',hash),true);assert.equal(await verifyPassword('wrong',hash),false);for(const h of ['broken','salt:00',''])assert.equal(await verifyPassword('x',h),false);});
test('public user shape excludes password, device credentials, recovery and email reset tokens',()=>{const value=publicUser({id:'u',username:'test',passwordHash:'private',recoveryHash:'private',deviceId:'private',resetToken:'private',verificationToken:'private',tokenVersion:42});assert.equal(JSON.stringify(value).includes('private'),false);assert.equal(value.username,'test');});
test('invalid bearer never falls back to a guest device; password accounts require a token',async()=>{
 let reads=0;const route=router({probe:protectedProcedure.query(()=>true)});const user={id:randomUUID(),appId:randomUUID(),deviceId:'guest',status:'active',tokenVersion:0};const ctx={app:{id:user.appId,isActive:true},deviceId:'guest',db:{select:()=>{reads++;return {from:()=>({where:()=>({limit:async()=>[user]})})};}}};
 await assert.rejects(route.createCaller({...ctx,authorization:'Bearer invalid'}).probe(),failure('UNAUTHORIZED'));assert.equal(reads,0);
 user.passwordHash='set';await assert.rejects(route.createCaller(ctx).probe(),failure('UNAUTHORIZED'));
 const token=generateUserToken({...user,emailVerified:false,username:'tester'},user.appId);assert.equal(verifyUserToken(token).version,0);assert.equal(await route.createCaller({...ctx,authorization:'Bearer '+token}).probe(),true);
 user.tokenVersion++;await assert.rejects(route.createCaller({...ctx,authorization:'Bearer '+token}).probe(),failure('UNAUTHORIZED'));
});
test('account tokens reject tenant mismatch and disabled users, with a bounded 30-day lifetime',async()=>{
 const user={id:randomUUID(),appId:randomUUID(),deviceId:'owner',status:'disabled',tokenVersion:3,username:'tester',emailVerified:false};const route=router({probe:protectedProcedure.query(()=>true)}),token=generateUserToken(user,user.appId),payload=verifyUserToken(token);assert.equal(payload.exp-payload.iat,30*86400);
 const ctx={app:{id:user.appId,isActive:true},authorization:'Bearer '+token,db:{select:()=>({from:()=>({where:()=>({limit:async()=>[user]})})})}};
 await assert.rejects(route.createCaller(ctx).probe(),failure('FORBIDDEN'));await assert.rejects(route.createCaller({...ctx,app:{id:randomUUID(),isActive:true}}).probe(),failure('UNAUTHORIZED'));
});
