import type {PaymentConfigInspection} from './config.js';
export type PurchasePlan={tier:string;currency:string;priceCents:number;durationDays:number};
export function isPurchasablePlan(plan:PurchasePlan){
  return ['pro_monthly','pro_yearly'].includes(plan.tier)&&plan.currency.toUpperCase()==='CNY'&&Number.isInteger(plan.priceCents)&&plan.priceCents>=1&&plan.priceCents<=10000000&&Number.isInteger(plan.durationDays)&&plan.durationDays>=1&&plan.durationDays<=36500;
}
export function paymentReadiness(appId:string,salesEnabled:boolean,plans:PurchasePlan[],configuration:PaymentConfigInspection){
  const channelConfigured=configuration.status==='ready'&&configuration.config?.appId===appId;
  const purchasablePlans=plans.filter(isPurchasablePlan).length;
  const blockingReasons:string[]=[];
  if(configuration.status!=='ready')blockingReasons.push(configuration.status==='not_set'?'merchant_not_configured':'merchant_config_invalid');
  else if(!channelConfigured)blockingReasons.push('merchant_app_mismatch');
  if(!salesEnabled)blockingReasons.push('sales_disabled');
  if(!purchasablePlans)blockingReasons.push('plans_missing');
  const configurationReady=blockingReasons.length===0;
  const message=!channelConfigured?'会员购买暂未开放，免费功能仍可正常使用。':!salesEnabled?'会员购买尚未开放，已付款订单仍可查询到账。':!purchasablePlans?'会员套餐暂未上架，请稍后查看。':'购买前请确认金额与天数，权益以服务器确认到账为准。';
  return {channelConfigured,salesEnabled,purchasablePlans,configurationReady,blockingReasons,message};
}
