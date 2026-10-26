import { and,desc,eq,gte,lte,inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router,protectedProcedure } from '../../../trpc/index.js';
import { chatqPaymentOrders,subscriptionPlans,subscriptions,users } from '../../../db/schema.js';
import { interactionLimit } from '../../../services/interaction-limit.js';
import { loadPaymentConfig,gatewayRequest,paymentBinding,paymentOrderNumber,cashierUrl,paymentInteger } from '../../../services/payments/jeepay.js';
import { paymentView,reconcilePayment } from '../../../services/payments/orders.js';
function configFor(appId:string,enabled=true){const c=loadPaymentConfig();if(!enabled||!c||c.appId!==appId)throw new TRPCError({code:'PRECONDITION_FAILED',message:'收款渠道尚未配置完成，当前不会创建支付或扣款'});return c;}
export const paymentsRouter=router({
  list:protectedProcedure.query(async({ctx})=>{interactionLimit(`pay-read:${ctx.userId}`,30);const rows=await ctx.db.select().from(chatqPaymentOrders).where(and(eq(chatqPaymentOrders.appId,ctx.app.id),eq(chatqPaymentOrders.userId,ctx.userId))).orderBy(desc(chatqPaymentOrders.createdAt)).limit(20);return rows.map(paymentView);}),
  create:protectedProcedure.input(z.object({planId:z.string().uuid(),requestId:z.string().regex(/^[\w-]{16,80}$/)}).strict()).mutation(async({ctx,input})=>{
    interactionLimit(`pay-create:${ctx.userId}`,5);const config=configFor(ctx.app.id,!!ctx.app.settings?.enableSubscription),binding=paymentBinding(config);
    const order=await ctx.db.transaction(async tx=>{
      const [buyer]=await tx.select().from(users).where(eq(users.id,ctx.userId)).limit(1).for('update');
      if(!buyer?.username||!buyer.passwordHash)throw new TRPCError({code:'PRECONDITION_FAILED',message:'请先注册或登录账号再购买，会员权益将绑定账号'});
      await tx.update(chatqPaymentOrders).set({status:'closed'}).where(and(eq(chatqPaymentOrders.appId,ctx.app.id),eq(chatqPaymentOrders.userId,ctx.userId),eq(chatqPaymentOrders.status,'pending'),lte(chatqPaymentOrders.expiresAt,new Date())));
      const [duplicate]=await tx.select().from(chatqPaymentOrders).where(and(eq(chatqPaymentOrders.appId,ctx.app.id),eq(chatqPaymentOrders.userId,ctx.userId),eq(chatqPaymentOrders.requestId,input.requestId))).limit(1);if(duplicate)return duplicate;
      const [pending]=await tx.select().from(chatqPaymentOrders).where(and(eq(chatqPaymentOrders.appId,ctx.app.id),eq(chatqPaymentOrders.userId,ctx.userId),inArray(chatqPaymentOrders.status,['pending','creating','ready','unknown','refund_review','entitlement_review']))).orderBy(desc(chatqPaymentOrders.createdAt)).limit(1);
      if(pending){if(pending.planId===input.planId&&!pending.status.endsWith('_review'))return pending;throw new TRPCError({code:'CONFLICT',message:'还有未确认、权益或退款待核对的订单，请先查询原订单或联系管理员，避免重复支付'});}
      const [plan]=await tx.select().from(subscriptionPlans).where(and(eq(subscriptionPlans.id,input.planId),eq(subscriptionPlans.appId,ctx.app.id),eq(subscriptionPlans.isActive,true))).limit(1);
      if(!plan||plan.currency.toUpperCase()!=='CNY'||!Number.isInteger(plan.priceCents)||plan.priceCents<1||plan.priceCents>10000000||!['pro_monthly','pro_yearly'].includes(plan.tier)||plan.durationDays<1||plan.durationDays>36500)throw new TRPCError({code:'BAD_REQUEST',message:'该套餐暂不支持购买，请联系管理员核对价格、币种和时长'});
      const [sub]=await tx.select().from(subscriptions).where(eq(subscriptions.userId,ctx.userId)).limit(1);
      if(sub?.status==='active'&&sub.tier!=='free'&&!sub.expiresAt)throw new TRPCError({code:'CONFLICT',message:'当前为长期会员，无需重复购买，请联系管理员核对权益'});
      if(sub&&sub.status==='active'&&sub.expiresAt&&sub.expiresAt>new Date()&&sub.tier!=='free'&&sub.tier!==plan.tier)throw new TRPCError({code:'CONFLICT',message:'当前套餐尚未到期，请续购同一档套餐或到期后更换'});
      const id=randomUUID();const [row]=await tx.insert(chatqPaymentOrders).values({id,orderNo:paymentOrderNumber(id),appId:ctx.app.id,userId:ctx.userId,planId:plan.id,requestId:input.requestId,name:plan.name,tier:plan.tier,durationDays:plan.durationDays,amount:plan.priceCents,currency:'CNY',binding,expiresAt:new Date(Date.now()+15*60000)}).returning();return row;
    });
    if(order.binding!==binding)throw new TRPCError({code:'PRECONDITION_FAILED',message:'请联系管理员核对原订单使用的支付配置'});
    const [claimed]=await ctx.db.update(chatqPaymentOrders).set({status:'creating'}).where(and(eq(chatqPaymentOrders.id,order.id),eq(chatqPaymentOrders.status,'pending'),gte(chatqPaymentOrders.expiresAt,new Date()))).returning();if(!claimed){const [current]=await ctx.db.select().from(chatqPaymentOrders).where(eq(chatqPaymentOrders.id,order.id)).limit(1);return paymentView(current);}
    try{
      const data=await gatewayRequest(config,'unifiedOrder',{mchOrderNo:paymentOrderNumber(order.id),wayCode:'QR_CASHIER',amount:order.amount,currency:order.currency,subject:('聊商 '+order.name).slice(0,64),body:'聊商订阅套餐',notifyUrl:config.notifyUrl,expiredTime:Math.max(1,Math.floor((order.expiresAt.getTime()-Date.now())/1000)),divisionMode:0,channelExtra:'{"payDataType":"payurl"}'});
      const state=paymentInteger(data.orderState);
      if(data.mchOrderNo!==paymentOrderNumber(order.id)||typeof data.payOrderId!=='string'||!/^[\w-]{1,64}$/.test(data.payOrderId)||![0,1,2].includes(state))throw new Error('支付网关返回异常');
      if(state===2)return paymentView(await reconcilePayment(config,order.id,ctx.db,data.payOrderId));
      if(data.payDataType!=='payurl')throw new Error('支付网关返回异常');
      const [ready]=await ctx.db.update(chatqPaymentOrders).set({status:'ready',transactionId:data.payOrderId,checkoutUrl:cashierUrl(data.payData,config)}).where(and(eq(chatqPaymentOrders.id,order.id),eq(chatqPaymentOrders.status,'creating'))).returning();if(ready)return paymentView(ready);
    }catch{await ctx.db.update(chatqPaymentOrders).set({status:'unknown'}).where(and(eq(chatqPaymentOrders.id,order.id),eq(chatqPaymentOrders.status,'creating')));}
    const [current]=await ctx.db.select().from(chatqPaymentOrders).where(eq(chatqPaymentOrders.id,order.id)).limit(1);return paymentView(current);
  }),
  check:protectedProcedure.input(z.object({id:z.string().uuid()}).strict()).mutation(async({ctx,input})=>{interactionLimit(`pay-check:${ctx.userId}`,15);const [row]=await ctx.db.select().from(chatqPaymentOrders).where(and(eq(chatqPaymentOrders.id,input.id),eq(chatqPaymentOrders.appId,ctx.app.id),eq(chatqPaymentOrders.userId,ctx.userId))).limit(1);if(!row)throw new TRPCError({code:'NOT_FOUND',message:'订单不存在'});if(['paid','closed','refund_review','entitlement_review'].includes(row.status))return paymentView(row);return paymentView(await reconcilePayment(configFor(ctx.app.id),row.id,ctx.db));}),
});
