// Every write stays in connection-local TEMP tables, including callback handlers.
import assert from 'node:assert/strict';
import postgres from 'postgres';import {drizzle} from 'drizzle-orm/postgres-js';import {eq} from 'drizzle-orm';
import {randomUUID,randomBytes} from 'node:crypto';import {createServer} from 'node:http';import {mkdtempSync,writeFileSync,unlinkSync,rmdirSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import Fastify from 'fastify';
import * as schema from '../dist/db/schema.js';
import {paymentsRouter} from '../dist/app_settings/chatq/routers/payments.js';
import {reconcilePayment,paymentView} from '../dist/services/payments/orders.js';
import {paymentSignature,verifyPaymentSignature,validatePaymentConfig,paymentBinding,paymentOrderNumber} from '../dist/services/payments/jeepay.js';
import {generateUserToken} from '../dist/utils/jwt.js';
import {registerRestAdapter} from '../dist/routers/rest-adapter.js';
import {keyboardAccount} from '../dist/services/ai/keyboard-account.js';
const connection=postgres(process.env.DATABASE_URL,{max:1,onnotice:()=>{}}),db=drizzle(connection,{schema}),secret=randomBytes(32).toString('hex');
const records=new Map();let createCount=0,queryCount=0,immediate=false,unavailable=false,rest,origin,checks=0;
const check=(v,label)=>{assert.ok(v,label);checks++;},reject=async(p,pattern)=>{await assert.rejects(p,pattern);checks++;};
const gateway=createServer(async(req,res)=>{
 try{
  let raw='';for await(const b of req)raw+=b;const v=JSON.parse(raw);verifyPaymentSignature(v,secret);
  if(unavailable){res.statusCode=503;res.end();return;}
  let data;
  if(req.url==='/api/pay/unifiedOrder'){
   createCount++;const row={mchNo:'M1',appId:'merchant',mchOrderNo:v.mchOrderNo,payOrderId:'T'+randomBytes(8).toString('hex'),amount:v.amount,currency:v.currency,state:immediate?2:1};records.set(v.mchOrderNo,row);
   data={mchOrderNo:row.mchOrderNo,payOrderId:row.payOrderId,orderState:row.state,payDataType:'payurl',payData:origin+'/cashier/index.html#/hub/'+'a'.repeat(64)};
  }else{
   queryCount++;const row=records.get(v.mchOrderNo);if(!row){res.statusCode=404;res.end();return;}data=row;
  }
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify({code:0,data,sign:paymentSignature(data,secret)}));
 }catch{res.statusCode=400;res.end();}
});
const dir=mkdtempSync(join(tmpdir(),'chatq-payment-qa-')),configPath=join(dir,'payments.json');
try{
 for(const name of ['users','subscriptions','subscription_plans','chatq_payment_orders','usage_records']){
  await connection.unsafe('CREATE TEMP TABLE '+name+' (LIKE public.'+name+' INCLUDING ALL)');
  const [r]=await connection.unsafe("SELECT to_regclass('"+name+"')::oid != to_regclass('public."+name+"')::oid AS isolated");check(r.isolated,'TEMP isolation '+name);
 }
 const app={id:randomUUID(),isActive:true,configName:'chatq',settings:{enableAI:true,enableSubscription:true}},otherApp={...app,id:randomUUID()};
 await new Promise(r=>gateway.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+gateway.address().port;
 const config=validatePaymentConfig({appId:app.id,endpoint:origin,mchNo:'M1',merchantAppId:'merchant',secret,notifyUrl:origin+'/api/aikeyboard/payments/notify',cashierOrigin:origin});
 writeFileSync(configPath,JSON.stringify(config),{mode:0o600});process.env.CHATQ_PAYMENT_CONFIG_FILE=configPath;
 const [plan,secondPlan]=await db.insert(schema.subscriptionPlans).values([{appId:app.id,name:'QA monthly',productId:randomUUID(),tier:'pro_monthly',currency:'CNY',priceCents:1200,durationDays:30},{appId:app.id,name:'QA yearly',productId:randomUUID(),tier:'pro_yearly',currency:'CNY',priceCents:12000,durationDays:365}]).returning();
 async function buyer(a=app,guest=false){
  const [user]=await db.insert(schema.users).values({appId:a.id,deviceId:randomUUID(),username:guest?null:'qa_'+randomBytes(8).toString('hex'),passwordHash:guest?null:'fixture-hash'}).returning();
  const ctx={db,app:a,deviceId:user.deviceId,authorization:guest?undefined:'Bearer '+generateUserToken(user,a.id),signal:new AbortController().signal};
  return {user,ctx,caller:paymentsRouter.createCaller(ctx)};
 }
 const b=await buyer(),input={planId:plan.id,requestId:randomUUID()};
 const results=await Promise.all([b.caller.create(input),b.caller.create(input)]),id=results[0].id;
 check(results.every(r=>r.id===id)&&createCount===1,'concurrent taps dispatch once');
 check((await b.caller.list())[0].checkoutUrl.includes('/cashier/index.html#/hub/'),'official cashier accepted');
 check((await b.caller.list())[0].orderNo===paymentOrderNumber(id),'support order number matches gateway');
 const stranger=await buyer(),tenant=await buyer(otherApp),guest=await buyer(app,true);
 await reject(stranger.caller.check({id}),/不存在/);await reject(tenant.caller.check({id}),/不存在/);check((await stranger.caller.list()).length===0,'order listing owner isolated');
 await reject(guest.caller.create({planId:plan.id,requestId:randomUUID()}),/登录账号/);
 await reject(b.caller.create({planId:secondPlan.id,requestId:randomUUID()}),/原订单/);
 const wire=records.get(paymentOrderNumber(id));wire.state=2;
 const paid=await Promise.all([b.caller.check({id}),b.caller.check({id})]);check(paid.every(r=>r.status==='paid'),'concurrent payment confirmation');
 const [sub]=await db.select().from(schema.subscriptions).where(eq(schema.subscriptions.userId,b.user.id));const expires=sub.expiresAt.getTime();
 await reconcilePayment(config,id,db,wire.payOrderId);
 check((await db.select().from(schema.subscriptions).where(eq(schema.subscriptions.userId,b.user.id)))[0].expiresAt.getTime()===expires,'replay never extends period twice');
 await reject(b.caller.create({planId:secondPlan.id,requestId:randomUUID()}),/同一档/);
 const renewal=await b.caller.create({planId:plan.id,requestId:randomUUID()});records.get(renewal.orderNo).state=2;await b.caller.check({id:renewal.id});
 check((await db.select().from(schema.subscriptions).where(eq(schema.subscriptions.userId,b.user.id)))[0].expiresAt.getTime()===expires+30*86400000,'same-tier renewal extends exactly once');
 const exp=await buyer(),old=randomUUID();
 await db.insert(schema.chatqPaymentOrders).values({id:old,orderNo:paymentOrderNumber(old),appId:app.id,userId:exp.user.id,planId:plan.id,requestId:randomUUID(),name:plan.name,tier:plan.tier,durationDays:30,amount:1200,currency:'CNY',binding:paymentBinding(config),expiresAt:new Date(Date.now()-1000)});
 const oldCount=createCount,fresh=await exp.caller.create({planId:plan.id,requestId:randomUUID()});
 check(createCount===oldCount+1&&fresh.id!==old,'expired never-dispatched order no longer blocks');
 check((await db.select().from(schema.chatqPaymentOrders).where(eq(schema.chatqPaymentOrders.id,old)))[0].status==='closed','expired pending safely closed');
 await db.update(schema.chatqPaymentOrders).set({expiresAt:new Date(Date.now()-1000)}).where(eq(schema.chatqPaymentOrders.id,fresh.id));
 check(paymentView((await db.select().from(schema.chatqPaymentOrders).where(eq(schema.chatqPaymentOrders.id,fresh.id)))[0]).checkoutUrl===null,'expired checkout never exposed');
 check((await exp.caller.create({planId:plan.id,requestId:randomUUID()})).id===fresh.id,'expired dispatched order reused until verified');
 records.get(fresh.orderNo).state=6;check((await exp.caller.check({id:fresh.id})).status==='closed','Jeepay closed state 6 reconciled');
 const late=await buyer(),lateOrder=await late.caller.create({planId:plan.id,requestId:randomUUID()});
 await db.update(schema.chatqPaymentOrders).set({expiresAt:new Date(Date.now()-1000)}).where(eq(schema.chatqPaymentOrders.id,lateOrder.id));records.get(lateOrder.orderNo).state=2;
 const closedSales={...late.ctx,app:{...app,settings:{...app.settings,enableSubscription:false}}};
 check((await paymentsRouter.createCaller(closedSales).check({id:lateOrder.id})).status==='paid','existing payment settles after checkout expiry and sales disabled');
 await reject(paymentsRouter.createCaller(closedSales).create({planId:plan.id,requestId:randomUUID()}),/尚未配置/);
 immediate=true;const instant=await buyer(),instantOrder=await instant.caller.create({planId:plan.id,requestId:randomUUID()});immediate=false;
 check(instantOrder.status==='paid','immediate successful unifiedOrder independently confirmed');
 const cb=await buyer(),callbackOrder=await cb.caller.create({planId:plan.id,requestId:randomUUID()}),receipt=records.get(callbackOrder.orderNo);receipt.state=2;
 rest=Fastify();await registerRestAdapter(rest,async()=>({query:async()=>[],mutation:async()=>({})}),db);
 const notify=async(data,form=false)=>rest.inject({method:'POST',url:'/api/aikeyboard/payments/notify',headers:form?{'content-type':'application/x-www-form-urlencoded'}:undefined,payload:form?new URLSearchParams(data).toString():data});
 let r=await notify({...receipt,sign:'0'.repeat(32)});check(r.statusCode===400&&r.body==='FAIL','invalid callback rejected');
 for(const change of [{amount:1},{appId:'wrong'},{currency:'USD'},{payOrderId:'wrong'}]){
  const forged={...receipt,...change};r=await notify({...forged,sign:paymentSignature(forged,secret)});check(r.statusCode===400,'signed mismatched callback rejected');
 }
 check((await db.select().from(schema.subscriptions).where(eq(schema.subscriptions.userId,cb.user.id))).length===0,'mismatch never grants');
 unavailable=true;r=await notify({...receipt,sign:paymentSignature(receipt,secret)});unavailable=false;check(r.statusCode===400,'query outage does not acknowledge or grant');
 r=await notify({...receipt,sign:paymentSignature(receipt,secret)},true);check(r.statusCode===200&&r.body==='SUCCESS'&&r.headers['cache-control']==='no-store','signed form callback independently confirmed');
 const [first]=await db.select().from(schema.subscriptions).where(eq(schema.subscriptions.userId,cb.user.id));
 const replies=await Promise.all([notify({...receipt,sign:paymentSignature(receipt,secret)}),notify({...receipt,sign:paymentSignature(receipt,secret)})]);
 check(replies.every(r=>r.body==='SUCCESS'),'concurrent callback replays acknowledged');
 check((await db.select().from(schema.subscriptions).where(eq(schema.subscriptions.userId,cb.user.id)))[0].expiresAt.getTime()===first.expiresAt.getTime(),'replayed callback grants only once');
 r=await rest.inject({method:'POST',url:'/api/aikeyboard/payments/notify',headers:{'content-type':'application/x-www-form-urlencoded'},payload:new URLSearchParams({...receipt,sign:paymentSignature(receipt,secret)}).toString()+'&amount=1200'});check(r.statusCode===400,'duplicate form fields rejected');
 receipt.state=5;r=await notify({...receipt,sign:paymentSignature(receipt,secret)});check(r.body==='SUCCESS','refund callback acknowledged after signed independent query');
 check((await cb.caller.list())[0].status==='refund_review','partial/full refund marked for operator reconciliation');
 const refundedExpiry=(await db.select().from(schema.subscriptions).where(eq(schema.subscriptions.userId,cb.user.id)))[0].expiresAt.getTime();
 receipt.state=2;await reconcilePayment(config,callbackOrder.id,db,receipt.payOrderId);
 check((await db.select().from(schema.subscriptions).where(eq(schema.subscriptions.userId,cb.user.id)))[0].expiresAt.getTime()===refundedExpiry,'refund receipt cannot grant a second membership');
 await reject(cb.caller.create({planId:plan.id,requestId:randomUUID()}),/退款待核对/);
 const beforeRefund=await buyer(),bf=await beforeRefund.caller.create({planId:plan.id,requestId:randomUUID()});const bfReceipt=records.get(bf.orderNo);bfReceipt.state=5;await reconcilePayment(config,bf.id,db,bfReceipt.payOrderId);bfReceipt.state=2;await reconcilePayment(config,bf.id,db,bfReceipt.payOrderId);check((await db.select().from(schema.subscriptions).where(eq(schema.subscriptions.userId,beforeRefund.user.id))).length===0,'refund-before-fulfillment never grants on stale success');
 const permanent=await buyer();await db.insert(schema.subscriptions).values({userId:permanent.user.id,tier:'pro_yearly',status:'active',expiresAt:null});await reject(permanent.caller.create({planId:plan.id,requestId:randomUUID()}),/长期会员/);
 const changed=await buyer(),changedOrder=await changed.caller.create({planId:plan.id,requestId:randomUUID()});await db.insert(schema.subscriptions).values({userId:changed.user.id,tier:'pro_yearly',status:'active',expiresAt:null});const changedReceipt=records.get(changedOrder.orderNo);changedReceipt.state=2;const reviewed=await changed.caller.check({id:changedOrder.id});check(reviewed.status==='entitlement_review'&&reviewed.paidAt,'payment settled for operator review after benefit changed');const [kept]=await db.select().from(schema.subscriptions).where(eq(schema.subscriptions.userId,changed.user.id));check(kept.tier==='pro_yearly'&&kept.expiresAt===null,'existing permanent benefits never downgraded');
 r=await notify({...changedReceipt,sign:paymentSignature(changedReceipt,secret)});check(r.body==='SUCCESS','settled benefit-review callback acknowledged without retry grant');
 const configured=await keyboardAccount({...b.ctx,userId:b.user.id});check(configured.purchaseAvailable&&configured.paymentReadiness.purchasablePlans===2,'safe account readiness summary');
 writeFileSync(configPath,'invalid-json-private-marker',{mode:0o600});const invalidConfig=await keyboardAccount({...b.ctx,userId:b.user.id});check(!invalidConfig.purchaseAvailable&&invalidConfig.paymentReadiness.blockingReasons.includes('merchant_config_invalid'),'malformed config disables buying without leaking raw configuration');check(!JSON.stringify(invalidConfig.paymentReadiness).includes('private-marker'),'public readiness hides invalid config contents');
 writeFileSync(configPath,JSON.stringify({...config,appId:otherApp.id}),{mode:0o600});const wrongApp=await keyboardAccount({...b.ctx,userId:b.user.id});check(!wrongApp.purchaseAvailable&&wrongApp.paymentReadiness.blockingReasons.includes('merchant_app_mismatch'),'valid config bound to another app cannot open sales');
 process.env.CHATQ_PAYMENT_CONFIG_FILE='/not-configured';
 const missing=await keyboardAccount({...b.ctx,userId:b.user.id});check(!missing.purchaseAvailable&&!missing.paymentReadiness.channelConfigured,'missing config closes sales truthfully');
 check(queryCount>10,'real signed transport used for reconciliation');
 console.log('PASS '+checks+' isolated PostgreSQL payment/account/callback checks; no live rows or paid external calls');
}finally{
 if(rest)await rest.close();gateway.closeAllConnections();await new Promise(r=>gateway.close(r));await connection.end({timeout:5});try{unlinkSync(configPath);}catch{}rmdirSync(dir);
}
