// Read-only operator check. Never creates an order, calls AI, or prints merchant keys.
import postgres from 'postgres';
import {loadPaymentConfig} from '../dist/services/payments/jeepay.js';
const sql=postgres(process.env.DATABASE_URL,{max:1,onnotice:()=>{}});
try{
  const config=loadPaymentConfig();
  const report=await sql.begin('read only',async tx=>{
    const apps=await tx`SELECT id,settings FROM apps WHERE config_name='chatq' AND is_active=true`;
    const result=[];
    for(const app of apps){
      const plans=await tx`SELECT tier,currency,price_cents,duration_days FROM subscription_plans WHERE app_id=${app.id} AND is_active=true`;
      const purchasable=plans.filter(p=>['pro_monthly','pro_yearly'].includes(p.tier)&&p.currency.toUpperCase()==='CNY'&&p.price_cents>=1&&p.price_cents<=10000000&&p.duration_days>=1&&p.duration_days<=36500).length;
      const pending=await tx`SELECT status,count(*)::int AS count FROM chatq_payment_orders WHERE app_id=${app.id} AND status NOT IN ('paid','closed') GROUP BY status`;
      const channelConfigured=config?.appId===app.id,salesEnabled=!!app.settings?.enableSubscription;
      result.push({appId:app.id,channelConfigured,salesEnabled,activePlans:plans.length,purchasablePlans:purchasable,unresolvedOrders:pending,configurationReady:channelConfigured&&salesEnabled&&purchasable>0});
    }
    return result;
  });
  console.log(JSON.stringify({readOnly:true,externalCalls:0,merchantAcceptance:'requires actual merchant channel and authorized live acceptance test',apps:report},null,2));
  if(!report.length||report.some(a=>!a.configurationReady))process.exitCode=2;
}finally{await sql.end({timeout:5});}
