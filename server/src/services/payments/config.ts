import { readFileSync,statSync } from 'node:fs';
import { z } from 'zod';

export const paymentConfigInput=z.object({
  appId:z.string().uuid(),endpoint:z.string().url(),mchNo:z.string().regex(/^[\w-]{1,64}$/),
  merchantAppId:z.string().regex(/^[\w-]{1,64}$/),secret:z.string().min(32).max(256),
  notifyUrl:z.string().max(128).url(),cashierOrigin:z.string().url(),
}).strict();
export type PaymentConfig=z.infer<typeof paymentConfigInput>;
type Field=keyof PaymentConfig|'configuration';
export type PaymentConfigIssue={field:Field;code:string;message:string};
export type PaymentConfigStatus='not_set'|'file_missing'|'unreadable'|'invalid_json'|'invalid'|'ready';
export type PaymentConfigInspection={status:PaymentConfigStatus;issues:PaymentConfigIssue[];readonly config:PaymentConfig|null};
const fields=new Set(['appId','endpoint','mchNo','merchantAppId','secret','notifyUrl','cashierOrigin']);
const labels:Record<Field,string>={appId:'聊商应用 ID',endpoint:'网关 API 地址',mchNo:'商户号',merchantAppId:'商户应用 ID',secret:'应用签名密钥',notifyUrl:'支付回调地址',cashierOrigin:'收银台来源',configuration:'支付配置'};
export class PaymentConfigError extends Error {
  constructor(readonly issues:PaymentConfigIssue[]){super(issues.map(i=>i.message).join('；'));this.name='PaymentConfigError';}
}
export function validatePaymentConfig(value:unknown):PaymentConfig {
  const parsed=paymentConfigInput.safeParse(value);
  if(!parsed.success){
    const names=[...new Set(parsed.error.issues.map(i=>fields.has(String(i.path[0]))?String(i.path[0]) as Field:'configuration'))];
    throw new PaymentConfigError(names.map(field=>({field,code:'invalid_field',message:labels[field]+'缺失或格式不正确'})));
  }
  const config=parsed.data,test=process.env.NODE_ENV==='test',issues:PaymentConfigIssue[]=[];
  const add=(field:Field,code:string,message:string)=>issues.push({field,code,message});
  for(const field of ['mchNo','merchantAppId','secret'] as const){
    if(/^(REPLACE(?:_|\b)|YOUR(?:_|\b)|CHANGE[_-]?ME|TODO(?:_|\b))/i.test(config[field])||/\$\{[^}]+\}|<[^>]+>/.test(config[field]))add(field,'placeholder',labels[field]+'仍为示例占位值');
  }
  for(const field of ['endpoint','cashierOrigin','notifyUrl'] as const){
    const raw=config[field],u=new URL(raw);
    if(/[\s\\\u0000-\u001f]/.test(raw)||u.username||u.password||u.search||u.hash)add(field,'invalid_url',labels[field]+'不能含账号、密码、查询参数或片段');
    if(u.protocol!=='https:'&&!(test&&u.protocol==='http:'&&u.hostname==='127.0.0.1'))add(field,'https_required',labels[field]+'需要 HTTPS');
    const host=u.hostname.toLowerCase().replace(/\.$/,'');
    if(!test&&(/(^|\.)(invalid|example|test)$/.test(host)||/^(.*\.)?example\.(com|org|net)$/.test(host)))add(field,'placeholder_host',labels[field]+'仍为保留的示例域名');
    if(field!=='notifyUrl'&&u.pathname!=='/')add(field,'root_required',labels[field]+'应填写根地址');
    if(field==='notifyUrl'&&u.pathname!=='/api/aikeyboard/payments/notify')add(field,'callback_path',labels[field]+'路径应为 /api/aikeyboard/payments/notify');
  }
  if(issues.length)throw new PaymentConfigError(issues);
  return config;
}
function inspection(status:PaymentConfigStatus,issues:PaymentConfigIssue[],config:PaymentConfig|null=null):PaymentConfigInspection {
  // Diagnostics can be serialized safely; the credentials never participate in JSON or spread.
  const value={status,issues} as PaymentConfigInspection;
  Object.defineProperty(value,'config',{value:config,enumerable:false});return Object.freeze(value);
}
export function inspectPaymentConfig(path=process.env.CHATQ_PAYMENT_CONFIG_FILE):PaymentConfigInspection {
  const issue=(code:string,message:string):PaymentConfigIssue[]=>[{field:'configuration',code,message}];
  if(!path?.trim())return inspection('not_set',issue('config_not_set','尚未指定商户配置文件'));
  try{
    const stat=statSync(path);
    if(!stat.isFile())return inspection('invalid',issue('not_file','商户配置必须是普通文件'));
    if(stat.size>32768)return inspection('invalid',issue('file_too_large','商户配置超过 32KB 限制'));
    if(process.platform!=='win32'&&(stat.mode&0o077)!==0)return inspection('invalid',issue('insecure_permissions','商户配置权限过宽，请设置为 600 或 400'));
    let value:unknown;try{value=JSON.parse(readFileSync(path,'utf8').replace(/^\uFEFF/,''));}catch(error){
      if(error instanceof SyntaxError)return inspection('invalid_json',issue('invalid_json','商户配置不是有效 JSON'));
      throw error;
    }
    try{return inspection('ready',[],validatePaymentConfig(value));}catch(error){
      return inspection('invalid',error instanceof PaymentConfigError?error.issues:issue('invalid_config','商户配置无效'));
    }
  }catch(error){
    return (error as NodeJS.ErrnoException)?.code==='ENOENT'?inspection('file_missing',issue('file_missing','找不到商户配置文件')):inspection('unreadable',issue('unreadable','无法读取商户配置文件'));
  }
}
export function loadPaymentConfig():PaymentConfig|null {return inspectPaymentConfig().config;}
