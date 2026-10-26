import { and,eq,lte } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { db } from '../../db/index.js';
import { chatqPaymentOrders,subscriptions,users } from '../../db/schema.js';
import { getGlobalCache,SubscriptionCacheKeys } from '../../utils/cache.js';
import { gatewayRequest,paymentBinding,paymentOrderNumber,verifyPaymentOrder,type PaymentConfig } from './jeepay.js';
export function paymentView(row:typeof chatqPaymentOrders.$inferSelect){return {id:row.id,orderNo:row.orderNo,name:row.name,durationDays:row.durationDays,amount:row.amount,currency:row.currency,status:row.status,checkoutUrl:row.status==='ready'&&row.expiresAt>new Date()?row.checkoutUrl:null,createdAt:row.createdAt.toISOString(),expiresAt:row.expiresAt.toISOString(),paidAt:row.paidAt?.toISOString()||null};}
export async function reconcilePayment(config:PaymentConfig,id:string,database:typeof db=db,expectedTransactionId?:string){
  const [order]=await database.select().from(chatqPaymentOrders).where(and(eq(chatqPaymentOrders.id,id),eq(chatqPaymentOrders.appId,config.appId))).limit(1);
  if(!order)throw new TRPCError({code:'NOT_FOUND',message:'订单不存在'});
  if(order.binding!==paymentBinding(config))throw new TRPCError({code:'PRECONDITION_FAILED',message:'支付配置已变化，请联系管理员核对原订单'});
  if(expectedTransactionId&&order.transactionId&&order.transactionId!==expectedTransactionId)throw new TRPCError({code:'CONFLICT',message:'支付流水不匹配，未开通权益'});
  // Only pending orders have never been dispatched. An unknown/ready timeout must
  // still be queried: payment may have succeeded just before the local deadline.
  if(order.status==='pending'&&!expectedTransactionId){
    const [closed]=await database.update(chatqPaymentOrders).set({status:'closed'}).where(and(eq(chatqPaymentOrders.id,id),eq(chatqPaymentOrders.status,'pending'),lte(chatqPaymentOrders.expiresAt,new Date()))).returning();
    if(closed)return closed;
    const [current]=await database.select().from(chatqPaymentOrders).where(eq(chatqPaymentOrders.id,id)).limit(1);return current;
  }
  const data=await gatewayRequest(config,'query',{mchOrderNo:paymentOrderNumber(order.id)}),result=verifyPaymentOrder(data,order,config);
  // Bind the signed notification to the independently queried receipt before any entitlement write.
  if(expectedTransactionId&&result.transactionId!==expectedTransactionId)throw new TRPCError({code:'CONFLICT',message:'支付流水不匹配，未开通权益'});
  if(result.state!==2){
    // Jeepay state 5 can represent a partial refund. Flag for review rather than
    // silently revoking a later renewal or ever granting the same receipt again.
    const status=result.state===5?'refund_review':[3,4,6].includes(result.state)&&!order.paidAt?'closed':null;
    if(status){const [updated]=await database.update(chatqPaymentOrders).set({status,transactionId:result.transactionId,checkoutUrl:null}).where(and(eq(chatqPaymentOrders.id,id),eq(chatqPaymentOrders.status,order.status))).returning();if(updated)return updated;const [current]=await database.select().from(chatqPaymentOrders).where(eq(chatqPaymentOrders.id,id)).limit(1);return current;}
    return order;
  }
  const paid=await database.transaction(async tx=>{
    const [current]=await tx.select().from(chatqPaymentOrders).where(eq(chatqPaymentOrders.id,id)).limit(1).for('update');
    if(current.paidAt||current.status==='refund_review')return current;
    if(current.binding!==paymentBinding(config)||current.amount!==order.amount||current.currency!==order.currency)throw new TRPCError({code:'CONFLICT',message:'订单核对失败，未开通权益'});
    const [user]=await tx.select().from(users).where(and(eq(users.id,current.userId),eq(users.appId,current.appId))).limit(1).for('update');if(!user)throw new TRPCError({code:'NOT_FOUND',message:'订单用户不存在'});
    const [sub]=await tx.select().from(subscriptions).where(eq(subscriptions.userId,current.userId)).limit(1);
    if(sub?.status==='active'&&sub.tier!=='free'&&(!sub.expiresAt||sub.expiresAt>new Date())&&(!sub.expiresAt||sub.tier!==current.tier)){
      // An administrator may have changed entitlements after order creation.
      // Record receipt once, preserve the better/current benefit and request review.
      const [review]=await tx.update(chatqPaymentOrders).set({status:'entitlement_review',paidAt:new Date(),transactionId:result.transactionId,checkoutUrl:null}).where(eq(chatqPaymentOrders.id,id)).returning();return review;
    }
    const now=new Date(),base=sub?.status==='active'&&sub.expiresAt&&sub.expiresAt>now?sub.expiresAt.getTime():now.getTime();
    if(!['pro_monthly','pro_yearly'].includes(current.tier)||!Number.isInteger(current.durationDays)||current.durationDays<1||current.durationDays>36500)throw new TRPCError({code:'CONFLICT',message:'套餐快照异常，请联系管理员'});
    const values={planId:current.planId,tier:current.tier as 'pro_monthly'|'pro_yearly',status:'active' as const,expiresAt:new Date(base+current.durationDays*86400000),originalTransactionId:'jeepay:'+result.transactionId,updatedAt:now};
    if(sub)await tx.update(subscriptions).set(values).where(eq(subscriptions.id,sub.id));else await tx.insert(subscriptions).values({...values,userId:current.userId});
    const [updated]=await tx.update(chatqPaymentOrders).set({status:'paid',paidAt:now,transactionId:result.transactionId}).where(eq(chatqPaymentOrders.id,id)).returning();return updated;
  });getGlobalCache().delete(SubscriptionCacheKeys.userSubscription(paid.userId));return paid;
}
