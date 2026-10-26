import { createHash,timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
// Independent Jeepay open-source MD5 wire adapter. Never logs keys, canonical strings or raw bodies.
// Official contract: https://docs.jeequan.com/docs/jeepay/payment_api
export const paymentConfigInput=z.object({appId:z.string().uuid(),endpoint:z.string().url(),mchNo:z.string().regex(/^[\w-]{1,64}$/),merchantAppId:z.string().regex(/^[\w-]{1,64}$/),secret:z.string().min(32).max(256),notifyUrl:z.string().url(),cashierOrigin:z.string().url()}).strict();
export type PaymentConfig=z.infer<typeof paymentConfigInput>;
export function validatePaymentConfig(value:unknown):PaymentConfig {
  const config=paymentConfigInput.parse(value),test=process.env.NODE_ENV==='test';
  for(const raw of [config.endpoint,config.cashierOrigin,config.notifyUrl]){const u=new URL(raw);if((u.protocol!=='https:'&&!(test&&u.protocol==='http:'&&u.hostname==='127.0.0.1'))||u.username||u.password||u.search||u.hash)throw new Error('支付地址需要 HTTPS');}
  for(const raw of [config.endpoint,config.cashierOrigin])if(new URL(raw).pathname!=='/')throw new Error('支付网关应填写根地址');
  if(new URL(config.notifyUrl).pathname!=='/api/aikeyboard/payments/notify')throw new Error('支付回调路径不匹配');return config;
}
export function loadPaymentConfig():PaymentConfig|null {
  const path=process.env.CHATQ_PAYMENT_CONFIG_FILE;if(!path)return null;
  try{return validatePaymentConfig(JSON.parse(readFileSync(path,'utf8')));}catch{return null;}
}
export function paymentSignature(data:Record<string,unknown>,secret:string):string {
  const keys=Object.keys(data).sort((a,b)=>a.toLowerCase()<b.toLowerCase()?-1:a.toLowerCase()>b.toLowerCase()?1:0),seen=new Set<string>();let canonical='';
  for(const key of keys){if(!/^[A-Za-z][A-Za-z0-9]{0,63}$/.test(key)||seen.has(key.toLowerCase()))throw new Error('支付字段格式异常');seen.add(key.toLowerCase());const value=data[key];if(key==='sign'||value===null||value===undefined||value==='')continue;if(!['string','number'].includes(typeof value)||typeof value==='number'&&!Number.isSafeInteger(value)||String(value).length>4096)throw new Error('支付字段格式异常');canonical+=`${key}=${value}&`;}
  return createHash('md5').update(canonical+'key='+secret,'utf8').digest('hex').toUpperCase();
}
export function verifyPaymentSignature(data:Record<string,unknown>,secret:string,signature:unknown=data.sign){if(typeof signature!=='string'||!/^[a-fA-F0-9]{32}$/.test(signature)||!timingSafeEqual(Buffer.from(paymentSignature(data,secret)),Buffer.from(signature.toUpperCase())))throw new TRPCError({code:'BAD_REQUEST',message:'支付签名无效'});}
export const paymentOrderNumber=(id:string)=>'CQ'+id.replace(/-/g,'').slice(0,28);
export const paymentBinding=(c:PaymentConfig)=>createHash('sha256').update(JSON.stringify([c.endpoint,c.mchNo,c.merchantAppId,c.secret,c.notifyUrl,c.cashierOrigin])).digest('hex');
export function cashierUrl(value:unknown,config:PaymentConfig){
  if(typeof value!=='string'||value.length>2048||/[\s\\\u0000-\u001f]/.test(value))throw new Error('收银台地址无效');
  const u=new URL(value),origin=new URL(config.cashierOrigin);
  // Official QR_CASHIER uses an AES hex token at /cashier/index.html#/hub/… .
  const official=u.pathname==='/cashier/index.html'&&/^#\/hub\/(?:[a-fA-F0-9]{32}){1,16}$/.test(u.hash);
  const legacy=u.pathname==='/'&&/^#\/cashier\/[a-fA-F0-9]{16,128}$/.test(u.hash);
  if(u.origin!==origin.origin||u.username||u.password||u.search||!official&&!legacy)throw new Error('收银台地址无效');return value;
}
export function paymentInteger(value:unknown):number {
  if(typeof value!=='number'&&!(typeof value==='string'&&/^(0|[1-9]\d{0,10})$/.test(value)))throw new Error('支付数字字段格式无效');
  const n=Number(value);if(!Number.isSafeInteger(n)||n<0)throw new Error('支付数字字段格式无效');return n;
}
export async function gatewayRequest(config:PaymentConfig,path:'unifiedOrder'|'query',business:Record<string,unknown>){
  const data={...business,mchNo:config.mchNo,appId:config.merchantAppId,reqTime:Date.now(),version:'1.0',signType:'MD5'};const body=JSON.stringify({...data,sign:paymentSignature(data,config.secret)});
  try{const response=await fetch(new URL('/api/pay/'+path,config.endpoint),{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body,redirect:'error',signal:AbortSignal.timeout(10000)});
    if(!response.ok||!response.headers.get('content-type')?.includes('application/json'))throw new Error();
    const reader=response.body?.getReader();if(!reader)throw new Error();let bytes=0;const chunks:Uint8Array[]=[];while(true){const {value,done}=await reader.read();if(done)break;bytes+=value.length;if(bytes>32768){await reader.cancel();throw new Error();}chunks.push(value);}
    const envelope=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(envelope.code!==0||!envelope.data||typeof envelope.data!=='object'||Array.isArray(envelope.data))throw new Error();verifyPaymentSignature(envelope.data,config.secret,envelope.sign);return envelope.data as Record<string,unknown>;
  }catch{throw new TRPCError({code:'BAD_GATEWAY',message:'支付网关结果暂未确认，请查询原订单；不要重复支付'});}
}
export function verifyPaymentOrder(data:Record<string,unknown>,order:{id:string;amount:number;currency:string;transactionId?:string|null},config:PaymentConfig){
  const state=paymentInteger(data.state??data.orderState),amount=paymentInteger(data.amount);
  if(data.mchOrderNo!==paymentOrderNumber(order.id)||data.mchNo!==config.mchNo||data.appId!==config.merchantAppId||amount!==order.amount||String(data.currency).toUpperCase()!==order.currency||!Number.isInteger(state)||state<0||state>6||typeof data.payOrderId!=='string'||!/^[\w-]{1,64}$/.test(data.payOrderId)||order.transactionId&&data.payOrderId!==order.transactionId)throw new TRPCError({code:'CONFLICT',message:'支付金额、商户或订单不匹配，未开通权益，请联系管理员核查'});
  return {state,transactionId:data.payOrderId};
}
