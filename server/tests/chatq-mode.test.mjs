import { test } from 'node:test';
import assert from 'node:assert/strict';
import { personalApiMode, requirePlatformAi, requirePaidMode } from '../dist/services/chatq-mode.js';
import { paymentReadiness } from '../dist/services/payments/readiness.js';
test('free rollout disables platform AI and new purchases only for explicitly selected apps', () => {
 const old = process.env.CHATQ_PERSONAL_API_APP_IDS;
 try {
  process.env.CHATQ_PERSONAL_API_APP_IDS=' free-app , other-free ';
  assert.equal(personalApiMode('free-app'),true); assert.equal(personalApiMode('app'),false);
  assert.throws(()=>requirePlatformAi('free-app'),/免费自备 API/);
  assert.throws(()=>requirePaidMode('free-app'),/不创建新支付订单/);
  assert.doesNotThrow(()=>requirePlatformAi('paid-app'));assert.doesNotThrow(()=>requirePaidMode('paid-app'));
  const ready=paymentReadiness('free-app',true,[{tier:'pro_monthly',currency:'CNY',priceCents:1200,durationDays:30}],{status:'ready',config:{appId:'free-app'}});
  assert.equal(ready.configurationReady,false);assert.equal(ready.salesEnabled,false);assert.equal(ready.purchasablePlans,0);
  assert.deepEqual(ready.blockingReasons,['free_personal_api_mode']);
 } finally { if(old===undefined)delete process.env.CHATQ_PERSONAL_API_APP_IDS;else process.env.CHATQ_PERSONAL_API_APP_IDS=old; }
});
