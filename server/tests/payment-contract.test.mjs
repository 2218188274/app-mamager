import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {cashierUrl,validatePaymentConfig,verifyPaymentOrder,paymentOrderNumber} from '../dist/services/payments/jeepay.js';
test('official Jeepay hub URL accepts only AES hex tokens on the pinned cashier origin',()=>{
  const config=validatePaymentConfig({appId:randomUUID(),endpoint:'https://pay.example',mchNo:'M1',merchantAppId:'A1',secret:'s'.repeat(32),notifyUrl:'https://chat.example/api/aikeyboard/payments/notify',cashierOrigin:'https://pay.example'});
  const good='https://pay.example/cashier/index.html#/hub/'+'a'.repeat(96);assert.equal(cashierUrl(good,config),good);
  for(const bad of [good.replace('pay.example','evil.example'),good+'?redirect=evil',good.replace('/hub/','/admin/'),good.replace('index.html','redirect.html'),good.slice(0,-1),good.replace('https://','https://user@'),good.replace('/hub/','/hub/%2f')])assert.throws(()=>cashierUrl(bad,config));
  const id=randomUUID(),order={id,amount:1200,currency:'CNY'},receipt={mchNo:'M1',appId:'A1',mchOrderNo:paymentOrderNumber(id),payOrderId:'T1',currency:'CNY',amount:'1200',state:'6'};
  assert.equal(verifyPaymentOrder(receipt,order,config).state,6);
  for(const invalid of [true,null,'',' 1200','1.2e3','01200',[],{}])assert.throws(()=>verifyPaymentOrder({...receipt,amount:invalid},order,config));
  for(const invalid of [true,'','02','2.0','2e0',null,{},7,-1])assert.throws(()=>verifyPaymentOrder({...receipt,state:invalid},order,config));
});
