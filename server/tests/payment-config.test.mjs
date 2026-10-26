import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,writeFileSync,chmodSync,unlinkSync,rmdirSync} from 'node:fs';
import {join} from 'node:path';import {tmpdir} from 'node:os';import {randomUUID,randomBytes} from 'node:crypto';
import {spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {inspectPaymentConfig,validatePaymentConfig,PaymentConfigError} from '../dist/services/payments/config.js';
import {paymentReadiness,isPurchasablePlan} from '../dist/services/payments/readiness.js';
const valid=()=>({appId:randomUUID(),endpoint:'https://127.0.0.1',mchNo:'M123456',merchantAppId:'A123456',secret:randomBytes(32).toString('hex'),notifyUrl:'https://127.0.0.1/api/aikeyboard/payments/notify',cashierOrigin:'https://127.0.0.1'});
function temporary(fn){
 const dir=mkdtempSync(join(tmpdir(),'chatq-config-')),file=join(dir,'merchant.json');
 try{return fn(file,dir);}finally{try{chmodSync(file,0o600);unlinkSync(file);}catch{}rmdirSync(dir);}
}
function production(fn){const before=process.env.NODE_ENV;process.env.NODE_ENV='production';try{return fn();}finally{if(before===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=before;}}
function save(file,value){writeFileSync(file,typeof value==='string'?value:JSON.stringify(value),{mode:0o600});chmodSync(file,0o600);}
test('bundled example and placeholder credentials cannot pass a production configuration check',()=>production(()=>{
 const example=fileURLToPath(new URL('../deploy/payments.example.json',import.meta.url));
 // The tracked example is intentionally non-deployable, even if an operator chmods it.
 const value=JSON.parse(readFileSync(example,'utf8'));
 assert.throws(()=>validatePaymentConfig(value),PaymentConfigError);
 for(const change of [{mchNo:'REPLACE_MERCHANT_NUMBER'},{merchantAppId:'YOUR_APP_ID'},{secret:'REPLACE_'.repeat(8)},{secret:'${MERCHANT_KEY}'.repeat(4)},{endpoint:'https://pay.example.invalid'},{cashierOrigin:'https://example.com'},{endpoint:'http://127.0.0.1'}]){
  assert.throws(()=>validatePaymentConfig({...valid(),...change}),PaymentConfigError);
 }
}));
test('configuration errors name fields without echoing secrets, URL passwords or unknown values',()=>production(()=>{
 const c={...valid(),secret:'sensitive-secret-'.repeat(4),endpoint:'https://someone:sensitive-url-password@127.0.0.1'};
 assert.throws(()=>validatePaymentConfig(c),error=>error instanceof PaymentConfigError&&error.issues.some(i=>i.field==='endpoint')&&!JSON.stringify(error).includes('sensitive')&&!error.message.includes('sensitive'));
 assert.throws(()=>validatePaymentConfig({...valid(),secret:'secret-short',unexpected:'private-marker'}),error=>!JSON.stringify(error).includes('private-marker')&&!error.message.includes('secret-short'));
}));
test('file checks distinguish missing, invalid JSON, oversized, non-file and permission problems',()=>temporary((file,dir)=>{
 assert.equal(inspectPaymentConfig('').status,'not_set');assert.equal(inspectPaymentConfig(file).status,'file_missing');
 assert.equal(inspectPaymentConfig(dir).issues[0].code,'not_file');
 save(file,'not-json-private-marker');const bad=inspectPaymentConfig(file);assert.equal(bad.status,'invalid_json');assert.ok(!JSON.stringify(bad).includes('private-marker'));
 save(file,' '.repeat(32769));assert.equal(inspectPaymentConfig(file).issues[0].code,'file_too_large');
 save(file,'\uFEFF'+JSON.stringify(valid()));assert.equal(inspectPaymentConfig(file).status,'ready');
 if(process.platform!=='win32'){chmodSync(file,0o644);assert.equal(inspectPaymentConfig(file).issues[0].code,'insecure_permissions');}
}));
test('valid credentials are readable by the gateway but absent from diagnostic JSON and spread',()=>temporary(file=>{
 const value=valid();save(file,value);const result=inspectPaymentConfig(file);assert.equal(result.config.secret,value.secret);
 assert.deepEqual(JSON.parse(JSON.stringify(result)),{status:'ready',issues:[]});assert.ok(!('config' in {...result}));
}));
test('shared readiness blocks invalid config, tenant mismatch, disabled sales and invalid plans',()=>temporary(file=>{
 const c=valid(),plan={tier:'pro_monthly',currency:'CNY',priceCents:1200,durationDays:30};save(file,c);const config=inspectPaymentConfig(file);
 assert.equal(paymentReadiness(c.appId,true,[plan],config).configurationReady,true);
 assert.ok(paymentReadiness(randomUUID(),true,[plan],config).blockingReasons.includes('merchant_app_mismatch'));
 const closed=paymentReadiness(c.appId,false,[],config);assert.deepEqual(closed.blockingReasons,['sales_disabled','plans_missing']);
 const missing=paymentReadiness(c.appId,true,[plan],inspectPaymentConfig(''));assert.equal(missing.channelConfigured,false);assert.ok(!missing.configurationReady);
 for(const change of [{currency:'USD'},{priceCents:0},{priceCents:1.1},{durationDays:1.2},{durationDays:0},{tier:'free'},{durationDays:36501}]){assert.equal(isPurchasablePlan({...plan,...change}),false);assert.equal(paymentReadiness(c.appId,true,[{...plan,...change}],config).configurationReady,false);}
}));
test('config-only CLI requires no database, reports missing config and never prints valid credentials',()=>temporary(file=>{
 const command=fileURLToPath(new URL('../scripts/payment-readiness.mjs',import.meta.url));const env={...process.env,NODE_ENV:'production',CHATQ_PAYMENT_CONFIG_FILE:''};delete env.DATABASE_URL;
 let r=spawnSync(process.execPath,[command,'--config-only'],{env,encoding:'utf8'});assert.equal(r.status,2);let data=JSON.parse(r.stdout);assert.equal(data.databaseChecked,false);assert.equal(data.configuration.status,'not_set');assert.equal(data.externalCalls,0);
 const c=valid();save(file,c);env.CHATQ_PAYMENT_CONFIG_FILE=file;r=spawnSync(process.execPath,[command,'--config-only'],{env,encoding:'utf8'});assert.equal(r.status,0);data=JSON.parse(r.stdout);assert.equal(data.configuration.status,'ready');assert.equal(data.livePaymentsVerified,false);assert.ok(!r.stdout.includes(c.secret));assert.ok(!r.stdout.includes(c.mchNo));
 r=spawnSync(process.execPath,[command],{env,encoding:'utf8'});assert.equal(r.status,1);data=JSON.parse(r.stdout);assert.equal(data.databaseChecked,false);assert.match(data.error,/未设置数据库连接/);
}));
test('CLI database errors are structured and cannot expose the configured database password',()=>{
 const command=fileURLToPath(new URL('../scripts/payment-readiness.mjs',import.meta.url));
 const r=spawnSync(process.execPath,[command],{env:{...process.env,CHATQ_PAYMENT_CONFIG_FILE:'',DATABASE_URL:'postgresql://qa:sensitive-db-password@[invalid'},encoding:'utf8'});
 assert.equal(r.status,1);assert.equal(JSON.parse(r.stdout).databaseChecked,false);assert.ok(!(r.stdout+r.stderr).includes('sensitive-db-password'));
});
