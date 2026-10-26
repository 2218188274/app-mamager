const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const {mount,deferred}=require('./component-harness.cjs');
function client() {
 const exports={},stored=[],requests=[];let vault=null,response={};
 const src=ts.transpileModule(fs.readFileSync(require.resolve('../src/services/api.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(src,{exports,require:id=>id.includes('async-storage')?{default:{getItem:async()=>null,setItem:async(k,v)=>stored.push([k,v])}}:{keyboardBridge:{getConfig:async()=>({baseUrl:'https://account.test',apiKey:'code',deviceId:'device'}),saveConfig:async()=>{},loadAccountSession:async()=>vault,saveAccountSession:async v=>{vault=v;},clearAccountSession:async()=>{vault=null;}}},fetch:async(url,init)=>{requests.push({url,...init});return {ok:true,json:async()=>({success:true,data:response})};},URL,AbortController,setTimeout,clearTimeout,Error,TypeError,process:{env:{}}});
 return {api:exports,requests,stored,payload:v=>response=v,get vault(){return vault;}};
}
const session={token:'synthetic-token-'.repeat(5),expiresAt:'2027-01-01T00:00:00Z',user:{id:'user1',username:'tester'}};
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
function panel(api={}) { let changed=0;const h=mount(require.resolve('../src/components/LoginPanel.tsx'),'LoginPanel',{'react-native-safe-area-context':{SafeAreaView:'SafeAreaView'},'../services/api':{getAccountSession:()=>null,accountConnectionSecure:()=>true,authenticateAccount:async()=>({}),...api}}, {onChanged:()=>changed++});return {h,get changed(){return changed;}}; }
const type=(h,label,value)=>{h.find(label).props.onChangeText(value);h.render();};
test('register blocks mismatched passwords locally, locks duplicate taps and requires acknowledgement of recovery code',async()=>{
 const late=deferred();let calls=0;const p=panel({authenticateAccount:async()=>{calls++;return late.promise;}}),h=p.h;await h.press('注册账号，保留设备权益');type(h,'账号','tester');type(h,'新密码（8–128 位）','password1');type(h,'再次输入新密码','password2');await h.press('注册并登录');assert.equal(calls,0);assert.match(h.text(),/不一致/);
 type(h,'再次输入新密码','password1');const action=h.find('注册并登录');action.props.onPress();action.props.onPress();await h.settle();assert.equal(calls,1);late.resolve({recoveryCode:'AAAA-BBBB-CCCC-DDDD'});await h.settle();assert.match(h.text(),/保存账号恢复码/);assert.equal(p.changed,1);const modal=h.nodes().find(n=>n.type==='Modal');modal.props.onRequestClose();h.render();assert.match(h.text(),/AAAA-BBBB/);await h.press('我已保存，完成');assert.equal(h.nodes().find(n=>n.type==='Modal').props.visible,false);
});
test('dismissed login form clears password and recovery fields and late UI completion does not notify an unmounted page',async()=>{
 const late=deferred();const p=panel({authenticateAccount:()=>late.promise}),h=p.h;await h.press('账号登录');type(h,'账号','tester');type(h,'登录密码','password1');await h.press('返回');await h.press('账号登录');assert.equal(h.find('登录密码').props.value,'');type(h,'登录密码','password1');h.find('登录').props.onPress();h.unmount();late.resolve({});await h.settle();assert.equal(p.changed,0);
});
