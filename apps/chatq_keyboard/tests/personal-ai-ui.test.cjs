
const {test}=require('node:test');const assert=require('node:assert/strict');const {mount,deferred}=require('./component-harness.cjs');
const empty={baseUrl:'',model:'',stream:true,hasKey:false};
function panel(api={}) {const changes=[];const h=mount(require.resolve('../src/components/PersonalAiPanel.tsx'),'PersonalAiPanel',{'../services/personalAi':{loadPersonalAi:async()=>empty,...api}},{onChanged:x=>changes.push(x)});return {h,changes};}
function type(h,label,text){h.find(label).props.onChangeText(text);h.render();}
test('saving config clears typed secret and does not invoke provider; duplicate taps locked',async()=>{
 const late=deferred();let saves=0,calls=0;const {h,changes}=panel({savePersonalAi:()=>{saves++;return late.promise;},personalAiRequest:()=>calls++});await h.settle();
 type(h,'API 基础地址','https://example.test/v1');type(h,'模型名称','model');type(h,'API 密钥','fixture-only');assert.equal(h.find('API 密钥').props.secureTextEntry,true);
 const action=h.find('保存配置');action.props.onPress();action.props.onPress();await h.settle();assert.equal(saves,1);
 late.resolve({baseUrl:'https://example.test/v1',model:'model',stream:true,hasKey:true});await h.settle();assert.equal(h.find('API 密钥').props.value,'');assert.equal(calls,0);assert.equal(changes.at(-1),true);assert.match(h.text(),/尚未发起 API 请求/);
});
test('unsaved config disables tests; background and explicit cancellation stop a running test',async()=>{
 let signal;const late=deferred();const {h}=panel({loadPersonalAi:async()=>({...empty,baseUrl:'https://example.test/v1',model:'model',hasKey:true}),personalAiRequest:(p,b,s)=>{signal=s;return late.promise;}});await h.settle();
 type(h,'模型名称','other');assert.equal(h.find('测试连接（消耗少量 API 用量）').props.disabled,true);type(h,'模型名称','model');await h.press('测试连接（消耗少量 API 用量）');assert.ok(h.find('停止测试'));h.event('change','background');assert.equal(signal.aborted,true);late.resolve({reply:'OK'});await h.settle();assert.ok(!h.text().includes('连接成功'));
});
test('free account page has no purchase gate and history opens in receipt-only mode',async()=>{
 let configure=0;const h=mount(require.resolve('../src/components/AccountPanel.tsx'),'AccountPanel',{'../services/api':{},'../services/planPrice':{},'./LoginPanel':{LoginPanel:'LoginPanel'},'./PaymentPanel':{PaymentPanel:'PaymentPanel'}},{onConfigure:()=>configure++});await h.settle();assert.match(h.text(),/当前为免费模式/);assert.equal(h.find('查看并购买套餐'),undefined);await h.press('管理我的 API');assert.equal(configure,1);await h.press('查看历史订单');const p=h.nodes().find(n=>n.type==='PaymentPanel');assert.equal(p.props.plan,null);assert.equal(p.props.historyOnly,true);
});
