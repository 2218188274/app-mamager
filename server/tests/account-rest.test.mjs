import {TRPCError} from '@trpc/server';
import test from 'node:test';import assert from 'node:assert/strict';import Fastify from 'fastify';
process.env.DATABASE_URL = 'postgres://fixture:fixture@127.0.0.1:1/fixture';
const {registerRestAdapter} = await import('../dist/routers/rest-adapter.js');
test('recovery rotation REST route forwards to the protected procedure and never caches the one-time response',async()=>{
 const app=Fastify();const seen=[];let rejectPassword=false;
 try{
  await registerRestAdapter(app,async()=>({query:async()=>({}),mutation:async(path,body)=>{seen.push({path,body});if(rejectPassword)throw new TRPCError({code:'FORBIDDEN',message:'当前密码不正确，请重新输入'});return {recoveryCode:'synthetic-one-time-code'};}}));
  const result=await app.inject({method:'POST',url:'/api/aikeyboard/auth/rotateRecovery',payload:{currentPassword:'synthetic-password'}});
  assert.equal(result.statusCode,200);assert.equal(result.headers['cache-control'],'no-store');assert.equal(result.json().data.recoveryCode,'synthetic-one-time-code');assert.equal(seen[0].path,'chatq.accounts.rotateRecovery');assert.equal(seen[0].body.currentPassword,'synthetic-password');
  rejectPassword=true;const typo=await app.inject({method:'POST',url:'/api/aikeyboard/auth/rotateRecovery',payload:{currentPassword:'wrong-fixture-password'}});assert.equal(typo.statusCode,403);assert.equal(typo.headers['cache-control'],'no-store');
 }finally{await app.close();}
});
