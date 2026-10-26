const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const {mount,deferred}=require('./component-harness.cjs');
function client() {
 const exports={},stored=[],requests=[];let vault=null,response={},handler=null,saveFailure=false;
 const src=ts.transpileModule(fs.readFileSync(require.resolve('../src/services/api.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(src,{exports,require:id=>id.includes('async-storage')?{default:{getItem:async()=>null,setItem:async(k,v)=>stored.push([k,v])}}:{keyboardBridge:{getConfig:async()=>({baseUrl:'https://account.test',apiKey:'code',deviceId:'device'}),saveConfig:async()=>{},loadAccountSession:async()=>vault,saveAccountSession:async v=>{if(saveFailure)throw new Error('vault unavailable');vault=v;},clearAccountSession:async()=>{vault=null;}}},fetch:async(url,init)=>{requests.push({url,...init});return handler?handler(url,init):{ok:true,json:async()=>({success:true,data:response})};},URL,AbortController,setTimeout,clearTimeout,Error,TypeError,process:{env:{}}});
 return {api:exports,requests,stored,payload:v=>response=v,handle:v=>handler=v,failSave:()=>saveFailure=true,setVault:v=>vault=v,get vault(){return vault;}};
}
const session={token:'synthetic-token-'.repeat(5),expiresAt:'2027-01-01T00:00:00Z',user:{id:'user1',username:'tester'}};
test('a current-password typo is a forbidden action and keeps the valid login available',async()=>{
 const c=client();await c.api.loadConnection();c.payload(session);await c.api.authenticateAccount('login',{username:'tester',password:'test-password'});
 c.handle(async()=>({ok:false,status:403,json:async()=>({success:false,error:{message:'当前密码不正确，请重新输入'}})}));
 for(const action of ['changePassword','rotateRecovery'])await assert.rejects(c.api.authenticateAccount(action,{currentPassword:'wrong-password',newPassword:'unused-password'}),/当前密码不正确/);
 assert.equal(c.api.getAccountIssue(),'');assert.equal(c.api.getAccountSession().token,session.token);assert.equal(JSON.parse(c.vault).token,session.token);
});
test('account login persists only the sanitized session in native vault and authenticates reply/quota/order requests',async()=>{
 const c=client();await c.api.loadConnection();c.payload({...session,recoveryCode:'sensitive-recovery',password:'must-not-persist'});
 await c.api.authenticateAccount('login',{username:'tester',password:'test-password'});
 assert.equal(c.requests[0].headers.Authorization,undefined);assert.equal(c.requests[0].redirect,'error');
 assert.equal(c.stored.length,0);assert.ok(c.vault.includes(session.token));assert.ok(!c.vault.includes('sensitive-recovery'));assert.ok(!c.vault.includes('must-not-persist'));
 c.payload({quota:{used:0},subscription:{tier:'free'},plans:[]});await c.api.getAccount();assert.equal(c.requests.at(-1).headers.Authorization,'Bearer '+session.token);
 c.payload([]);await c.api.paymentRequest('list');assert.equal(c.requests.at(-1).headers.Authorization,'Bearer '+session.token);
 await c.api.forgetAccountSession();assert.equal(c.vault,null);assert.equal(c.api.getAccountSession(),null);
});
test('password and token requests refuse cleartext non-loopback hosts before any upload',async()=>{
 const c=client();await c.api.loadConnection();c.payload({});await c.api.connect({baseUrl:'http://untrusted.test',apiKey:'code',deviceId:'d'});const before=c.requests.length;
 await assert.rejects(c.api.authenticateAccount('login',{username:'tester',password:'test-password'}),/HTTPS/);assert.equal(c.requests.length,before);
});
test('connection switching clears account authorization; registration never sends an account token',async()=>{
 const c=client();await c.api.loadConnection();c.payload(session);await c.api.authenticateAccount('login',{username:'tester',password:'test-password'});c.payload({});
 await c.api.connect({baseUrl:'https://account.test',apiKey:'code',deviceId:'device'});assert.equal(c.requests.at(-1).headers.Authorization,undefined);assert.ok(c.api.getAccountSession());
 await c.api.connect({baseUrl:'https://another.test',apiKey:'new',deviceId:'device'});assert.equal(c.api.getAccountSession(),null);assert.equal(c.vault,null);
});
test('native login survives client reload and malformed server session never replaces a valid login',async()=>{
 const c=client();await c.api.loadConnection();c.payload(session);await c.api.authenticateAccount('login',{username:'tester',password:'test-password'});await c.api.loadConnection();assert.equal(c.api.getAccountSession().user.username,'tester');
 c.payload({token:'bad'});await assert.rejects(c.api.authenticateAccount('login',{username:'tester',password:'test-password'}),/格式异常/);assert.equal(c.api.getAccountSession().token,session.token);
});

test('a late login cannot restore an account after explicit local logout',async()=>{
 const c=client();await c.api.loadConnection();const late=deferred();c.handle(()=>late.promise);
 const login=c.api.authenticateAccount('login',{username:'tester',password:'test-password'});const rejected=assert.rejects(login,/状态已变化/);
 await c.api.forgetAccountSession();late.resolve({ok:true,json:async()=>({success:true,data:session})});await rejected;
 assert.equal(c.api.getAccountSession(),null);assert.equal(c.vault,null);
});

test('the newest login wins even when an earlier server response arrives last',async()=>{
 const c=client();await c.api.loadConnection();const late=deferred();let n=0;c.handle(async()=>++n===1?late.promise:{ok:true,json:async()=>({success:true,data:{...session,user:{id:'user2',username:'second'}}})});
 const first=c.api.authenticateAccount('login',{username:'tester',password:'test-password'});const rejected=assert.rejects(first,/状态已变化/);
 await c.api.authenticateAccount('login',{username:'second',password:'test-password'});late.resolve({ok:true,json:async()=>({success:true,data:session})});await rejected;
 assert.equal(c.api.getAccountSession().user.username,'second');assert.equal(JSON.parse(c.vault).user.username,'second');
});

test('registration retains its one-time recovery code if encrypted storage fails',async()=>{
 const c=client();await c.api.loadConnection();c.failSave();c.payload({...session,recoveryCode:'AAAA-BBBB-CCCC-DDDD-EEEE-FFFF-0000-1111'});
 const result=await c.api.authenticateAccount('register',{username:'tester',password:'test-password'});
 assert.equal(result.sessionSaved,false);assert.match(result.recoveryCode,/AAAA-BBBB/);assert.match(result.warning,/保存/);assert.equal(c.vault,null);
});

test('damaged saved login does not block app initialization or silently use guest AI',async()=>{
 const c=client();c.setVault('damaged-json');await c.api.loadConnection();const n=c.requests.length;
 await assert.rejects(c.api.getAccount(),/登录状态/);assert.equal(c.requests.length,n);await c.api.forgetAccountSession();
 c.payload({quota:{used:0},subscription:{tier:'free'},plans:[]});await c.api.getAccount();assert.equal(c.requests.at(-1).headers.Authorization,undefined);
});
function panel(api={}) { let changed=0;const h=mount(require.resolve('../src/components/LoginPanel.tsx'),'LoginPanel',{'react-native-safe-area-context':{SafeAreaView:'SafeAreaView'},'../services/api':{getAccountSession:()=>null,getAccountIssue:()=>'',subscribeAccountSession:()=>()=>{},accountConnectionSecure:()=>true,authenticateAccount:async()=>({}),...api}}, {onChanged:()=>changed++});return {h,get changed(){return changed;}}; }
const type=(h,label,value)=>{h.find(label).props.onChangeText(value);h.render();};
test('register blocks mismatched passwords locally, locks duplicate taps and requires acknowledgement of recovery code',async()=>{
 const late=deferred();let calls=0;const p=panel({authenticateAccount:async()=>{calls++;return late.promise;}}),h=p.h;await h.press('注册账号（可选）');type(h,'账号','tester');type(h,'新密码（8–128 位）','password1');type(h,'再次输入新密码','password2');await h.press('注册并登录');assert.equal(calls,0);assert.match(h.text(),/不一致/);
 type(h,'再次输入新密码','password1');const action=h.find('注册并登录');action.props.onPress();action.props.onPress();await h.settle();assert.equal(calls,1);late.resolve({recoveryCode:'AAAA-BBBB-CCCC-DDDD'});await h.settle();assert.match(h.text(),/保存账号恢复码/);assert.equal(p.changed,1);const modal=h.nodes().find(n=>n.type==='Modal');modal.props.onRequestClose();h.render();assert.match(h.text(),/AAAA-BBBB/);await h.press('我已保存，完成');assert.equal(h.nodes().find(n=>n.type==='Modal').props.visible,false);
});
test('dismissed login form clears password and recovery fields and late UI completion does not notify an unmounted page',async()=>{
 const late=deferred();const p=panel({authenticateAccount:()=>late.promise}),h=p.h;await h.press('账号登录');type(h,'账号','tester');type(h,'登录密码','password1');await h.press('返回');await h.press('账号登录');assert.equal(h.find('登录密码').props.value,'');type(h,'登录密码','password1');h.find('登录').props.onPress();h.unmount();late.resolve({});await h.settle();assert.equal(p.changed,0);
});

test('recovery preserves the typed username and rejects incomplete recovery code before uploading',async()=>{
 let calls=0;const p=panel({authenticateAccount:async()=>{calls++;return {};}}),h=p.h;
 await h.press('账号登录');type(h,'账号','tester');await h.press('忘记密码，用恢复码找回');assert.equal(h.find('账号').props.value,'tester');
 type(h,'账号恢复码','short');type(h,'新密码（8–128 位）','password1');type(h,'再次输入新密码','password1');await h.press('确认修改并登录');assert.equal(calls,0);assert.match(h.text(),/32 位恢复码/);
});

test('invalid login exposes direct reauthentication and local-only removal without requiring an old password',async()=>{
 const p=panel({getAccountSession:()=>session,getAccountIssue:()=> '登录已失效，请重新登录'}),h=p.h;
 assert.ok(h.find('重新登录'));assert.ok(h.find('仅清除此设备登录'));assert.ok(h.find('修改密码').props.disabled);
 await h.press('重新登录');assert.equal(h.find('账号').props.value,'tester');assert.ok(h.find('忘记密码，用恢复码找回'));
});
test('recovery code rotation requires only current password and shows the new one-time code',async()=>{
 let sent;const p=panel({getAccountSession:()=>session,authenticateAccount:async(a,b)=>{sent=[a,b];return {recoveryCode:'AAAA-BBBB-CCCC-DDDD-EEEE-FFFF-0000-1111'};}}),h=p.h;
 await h.press('重新生成恢复码');assert.equal(h.find('账号'),undefined);assert.equal(h.find('新密码（8–128 位）'),undefined);assert.ok(h.find('验证密码并生成新码').props.disabled);
 type(h,'当前密码','password1');await h.press('验证密码并生成新码');assert.equal(sent[0],'rotateRecovery');assert.equal(sent[1].currentPassword,'password1');assert.match(h.text(),/旧恢复码已失效/);assert.equal(h.find('复制恢复码').props.feedback,'已复制，请保存到你信任的安全位置。');
});

const member={identity:{mode:'account',username:'tester'},quota:{enabled:true,used:7,limit:null,remaining:null,isPro:true,candidateLimit:3,resetsAt:'2027-01-01T00:00:00Z'},subscription:{tier:'pro_monthly',status:'active',expiresAt:'2027-01-01T00:00:00Z'},plans:[{id:'plan',name:'月度会员',priceCents:1200,currency:'CNY',durationDays:30}],purchaseAvailable:true};
function memberPanel(api={}){return mount(require.resolve('../src/components/AccountPanel.tsx'),'MembershipAccountPanel',{'../services/api':{getAccount:async()=>member,getAccountIssue:()=>'',resumeGuestConnection:async()=>{},...api},'../services/planPrice':{formatPlanPrice:()=> '¥12'},'./LoginPanel':{LoginPanel:'LoginPanel'},'./PaymentPanel':{PaymentPanel:'PaymentPanel'}});}
test('membership auth failure removes stale entitlements and purchase controls, while offline state is explicit',async()=>{
 let fail=false,issue='';const h=memberPanel({getAccount:async()=>{if(fail)throw new Error('network');return member;},getAccountIssue:()=>issue});await h.settle();assert.match(h.text(),/不限次数/);
 fail=true;await h.press('刷新额度');assert.match(h.text(),/上次状态/);assert.ok(h.find('查看并购买套餐').props.disabled);
 issue='登录已失效';await h.press('刷新额度');assert.ok(!h.text().includes('不限次数'));assert.equal(h.find('查看并购买套餐'),undefined);
});
test('membership refresh propagates an order-triggered sync failure instead of reporting success',async()=>{
 let fail=false;const h=memberPanel({getAccount:async()=>{if(fail)throw new Error('network');return member;}});await h.settle();await h.press('查看套餐订单');
 const payment=h.nodes().find(n=>n.type==='PaymentPanel');fail=true;await assert.rejects(payment.props.onPaid(),/network/);await h.settle();assert.match(h.text(),/上次状态/);
});
