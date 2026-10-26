// Read-only operator check. No gateway requests, orders, AI calls, or credential output.
import {inspectPaymentConfig} from '../dist/services/payments/config.js';
import {paymentReadiness} from '../dist/services/payments/readiness.js';
const args=process.argv.slice(2),configuration=inspectPaymentConfig();
const base={readOnly:true,externalCalls:0,livePaymentsVerified:false,paymentActivationChanged:false,merchantAcceptance:'not_verified; requires actual merchant channel and authorized live acceptance test',configuration};
let sql;
try{
  if(args.some(a=>a!=='--config-only')){console.log(JSON.stringify({...base,error:'仅支持 --config-only；省略参数时同时只读检查数据库'},null,2));process.exitCode=1;}
  else if(args.includes('--config-only')){
    console.log(JSON.stringify({...base,scope:'configuration_only',databaseChecked:false},null,2));
    if(configuration.status!=='ready')process.exitCode=2;
  }else if(!process.env.DATABASE_URL){
    console.log(JSON.stringify({...base,databaseChecked:false,error:'未设置数据库连接，无法核对应用、套餐和订单；可先使用 --config-only'},null,2));process.exitCode=1;
  }else{
    const postgres=(await import('postgres')).default;
    sql=postgres(process.env.DATABASE_URL,{max:1,connect_timeout:5,onnotice:()=>{}});
    const apps=await sql.begin('read only',async tx=>{
      const rows=await tx`SELECT id,settings FROM apps WHERE config_name='chatq' AND is_active=true`;
      const result=[];
      for(const app of rows){
        const plans=await tx`SELECT tier,currency,price_cents AS "priceCents",duration_days AS "durationDays" FROM subscription_plans WHERE app_id=${app.id} AND is_active=true`;
        const unresolvedOrders=await tx`SELECT status,count(*)::int AS count FROM chatq_payment_orders WHERE app_id=${app.id} AND status NOT IN ('paid','closed') GROUP BY status`;
        const readiness=paymentReadiness(app.id,!!app.settings?.enableSubscription,plans,configuration);
        result.push({appId:app.id,...readiness,activePlans:plans.length,unresolvedOrders});
      }
      return result;
    });
    console.log(JSON.stringify({...base,databaseChecked:true,apps},null,2));
    if(!apps.length||apps.some(a=>!a.configurationReady))process.exitCode=2;
  }
}catch{
  console.log(JSON.stringify({...base,databaseChecked:false,error:'数据库检查暂不可用，请检查私有连接配置和服务状态；未创建订单或调用支付网关'},null,2));process.exitCode=1;
}finally{await sql?.end({timeout:5});}
