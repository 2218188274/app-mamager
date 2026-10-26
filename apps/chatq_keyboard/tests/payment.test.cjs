const {test}=require('node:test'),assert=require('node:assert/strict');
const {mount,deferred}=require('./component-harness.cjs');
const plan={id:'plan',name:'月度会员',priceCents:1200,currency:'CNY',durationDays:30};
const row={id:'order',orderNo:'CQ'+'a'.repeat(28),name:plan.name,amount:1200,currency:'CNY',status:'ready',checkoutUrl:'https://pay.test/cashier/index.html#/hub/'+'a'.repeat(64),createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+60000).toISOString(),paidAt:null};
function panel({request=async a=>a==='list'?[row]:row,logged=true,planValue=plan}={}){
 let paid=0,opened=0;const calls=[];
 const h=mount(require.resolve('../src/components/PaymentPanel.tsx'),'PaymentPanel',{
  '../services/api':{getAccountSession:()=>logged?{user:{username:'tester'}}:null,paymentRequest:async(...args)=>{calls.push(args);return request(...args);}},
  '../services/planPrice':{formatPlanPrice:(amount,currency)=>currency+' '+(amount/100).toFixed(2)},
  '../services/markdown':{safeLink:v=>v},
  'react-native-safe-area-context':{SafeAreaView:'SafeAreaView'},
  'react-native':{Linking:{openURL:async()=>{opened++;}}},
 },{plan:planValue,onClose:()=>{},onPaid:async()=>{paid++;}});
 return {h,calls,get paid(){return paid;},get opened(){return opened;}};
}
test('returning from cashier checks the original order and refreshes membership exactly once',async()=>{
 let isPaid=false;const p=panel({request:async a=>a==='list'?[{...row,status:isPaid?'paid':'ready'}]:{...row,status:'paid',paidAt:new Date().toISOString()}}),h=p.h;
 await h.settle();await h.press('打开支付收银台');h.alerts.at(-1)[2].find(b=>b.text==='前往支付').onPress();await h.settle();assert.equal(p.opened,1);
 isPaid=true;h.event('change','active');await h.settle();assert.equal(p.paid,1);assert.equal(p.calls.filter(c=>c[0]==='check').length,1);assert.equal(p.calls.find(c=>c[0]==='check')[1].id,row.id);
 h.event('change','active');await h.settle();assert.equal(p.paid,1);assert.match(h.text(),/会员权益已刷新/);
 assert.equal(h.find('复制订单号').props.text,row.orderNo);
});
test('unmounted payment page aborts requests and ignores late create completion and confirmation',async()=>{
 const late=deferred();const p=panel({request:async a=>a==='list'?[]:late.promise}),h=p.h;await h.settle();
 await h.press('确认套餐并创建订单');h.alerts.at(-1)[2].find(b=>b.text==='创建订单').onPress();await h.settle();
 const call=p.calls.find(c=>c[0]==='create');assert.equal(call[2].aborted,false);h.unmount();assert.equal(call[2].aborted,true);late.resolve({...row,status:'paid'});await h.settle();
 assert.equal(p.paid,0);assert.equal(p.calls.filter(c=>c[0]==='list').length,1);
 const q=panel();await q.h.settle();await q.h.press('打开支付收银台');q.h.unmount();q.h.alerts.at(-1)[2].find(b=>b.text==='前往支付').onPress();assert.equal(q.opened,0);
});
test('guest cannot buy; expired checkout stays queryable without a payment button',async()=>{
 const p=panel({logged:false});await p.h.settle();assert.ok(p.h.find('请先登录后购买').props.disabled);assert.match(p.h.text(),/注册或登录/);
 const q=panel({request:async()=>[{...row,expiresAt:'2020-01-01T00:00:00Z'}]});await q.h.settle();assert.equal(q.h.find('打开支付收银台'),undefined);assert.ok(q.h.find('查询原订单并确认到账'));assert.match(q.h.text(),/支付入口已过期/);
});
test('rapid taps reuse one request; closed order permits a deliberate fresh purchase',async()=>{
 const values=[];const p=panel({request:async(a,b)=>{if(a==='list')return [];values.push(b.requestId);return {...row,status:'closed'};}}),h=p.h;await h.settle();
 await h.press('确认套餐并创建订单');const action=h.alerts.at(-1)[2].find(b=>b.text==='创建订单');action.onPress();action.onPress();await h.settle();assert.equal(values.length,1);assert.match(h.text(),/原订单已关闭/);
 await h.press('确认套餐并创建订单');h.alerts.at(-1)[2].find(b=>b.text==='创建订单').onPress();await h.settle();assert.equal(values.length,2);assert.notEqual(values[0],values[1]);
});
test('refund review is explicit and never offers another checkout',async()=>{
 const p=panel({planValue:null,request:async()=>[{...row,status:'refund_review'}]});await p.h.settle();assert.match(p.h.text(),/退款金额和会员权益/);assert.equal(p.h.find('打开支付收银台'),undefined);
});
test('foreground event during an in-flight refresh is reconciled after that request',async()=>{
 const late=deferred();let count=0;const p=panel({request:async a=>{if(a==='list'){count++;if(count===2)return late.promise;return [row];}return {...row,status:'paid'};}}),h=p.h;await h.settle();
 await h.press('打开支付收银台');h.alerts.at(-1)[2].find(b=>b.text==='前往支付').onPress();await h.settle();
 h.find('刷新列表').props.onPress();await h.settle();h.event('change','active');late.resolve([row]);await h.settle();assert.equal(p.paid,1);
});


test('entitlement conflict preserves explicit review instead of another payment button',async()=>{const p=panel({planValue:null,request:async()=>[{...row,status:'entitlement_review'}]});await p.h.settle();assert.match(p.h.text(),/原有权益保留/);assert.equal(p.h.find('打开支付收银台'),undefined);assert.equal(p.h.find('查询原订单并确认到账'),undefined);});
