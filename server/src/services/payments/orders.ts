import { and,eq } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { db } from '../../db/index.js';
import { chatqPaymentOrders,subscriptions,users } from '../../db/schema.js';
import { getGlobalCache,SubscriptionCacheKeys } from '../../utils/cache.js';
import { gatewayRequest,paymentBinding,paymentOrderNumber,verifyPaymentOrder,type PaymentConfig } from './jeepay.js';
export function paymentView(row:typeof chatqPaymentOrders.$inferSelect){return {id:row.id,name:row.name,amount:row.amount,currency:row.currency,status:row.status,checkoutUrl:row.status==='ready'?row.checkoutUrl:null,createdAt:row.createdAt.toISOString(),expiresAt:row.expiresAt.toISOString(),paidAt:row.paidAt?.toISOString()||null};}
export async function reconcilePayment(config:PaymentConfig,id:string,database:typeof db=db,expectedTransactionId?:string){
  const [order]=await database.select().from(chatqPaymentOrders).where(and(eq(chatqPaymentOrders.id,id),eq(chatqPaymentOrders.appId,config.appId))).limit(1);
  if(!order)throw new TRPCError({code:'NOT_FOUND',message:'订单不存在'});
  if(order.binding!==paymentBinding(config))throw new TRPCError({code:'PRECONDITION_FAILED',message:'支付配置已变化，请联系管理员核对原订单'});
  if(expectedTransactionId&&order.transactionId&&order.transactionId!==expectedTransactionId)throw new TRPCError({code:'CONFLICT',message:'支付流水不匹配，未开通权益'});
  if(order.status==='paid')return order;
  const data=await gatewayRequest(config,'query',{mchOrderNo:paymentOrderNumber(order.id)}),result=verifyPaymentOrder(data,order,config);
  // Bind the signed notification to the independently queried receipt before any entitlement write.
  if(expectedTransactionId&&result.transactionId!==expectedTransactionId)throw new TRPCError({code:'CONFLICT',message:'支付流水不匹配，未开通权益'});
  if(result.state!==2){
    if([3,4].includes(result.state)){const [updated]=await database.update(chatqPaymentOrders).set({status:'closed',transactionId:result.transactionId}).where(and(eq(chatqPaymentOrders.id,id),eq(chatqPaymentOrders.status,order.status))).returning();return updated||order;}
    return order;
  }
  const paid=await database.transaction(async tx=>{
    const [current]=await tx.select().from(chatqPaymentOrders).where(eq(chatqPaymentOrders.id,id)).limit(1).for('update');
    if(current.status==='paid')return current;
    if(current.binding!==paymentBinding(config)||current.amount!==order.amount||current.currency!==order.currency)throw new TRPCError({code:'CONFLICT',message:'订单核对失败，未开通权益'});
    const [user]=await tx.select().from(users).where(and(eq(users.id,current.userId),eq(users.appId,current.appId))).limit(1).for('update');if(!user)throw new TRPCError({code:'NOT_FOUND',message:'订单用户不存在'});
    const [sub]=await tx.select().from(subscriptions).where(eq(subscriptions.userId,current.userId)).limit(1);
    const now=new Date(),base=sub?.status==='active'&&sub.expiresAt&&sub.expiresAt>now?sub.expiresAt.getTime():now.getTime();
    if(!['pro_monthly','pro_yearly'].includes(current.tier)||!Number.isInteger(current.durationDays)||current.durationDays<1||current.durationDays>36500)throw new TRPCError({code:'CONFLICT',message:'套餐快照异常，请联系管理员'});
    const values={planId:current.planId,tier:current.tier as 'pro_monthly'|'pro_yearly',status:'active' as const,expiresAt:new Date(base+current.durationDays*86400000),originalTransactionId:'jeepay:'+result.transactionId,updatedAt:now};
    if(sub)await tx.update(subscriptions).set(values).where(eq(subscriptions.id,sub.id));else await tx.insert(subscriptions).values({...values,userId:current.userId});
    const [updated]=await tx.update(chatqPaymentOrders).set({status:'paid',paidAt:now,transactionId:result.transactionId}).where(eq(chatqPaymentOrders.id,id)).returning();return updated;
  });getGlobalCache().delete(SubscriptionCacheKeys.userSubscription(paid.userId));return paid;
}
