const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const source = ts.transpileModule(fs.readFileSync(require.resolve('../src/services/api.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const screenshots={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(require.resolve('../src/services/screenshotReply.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:screenshots,Error});
function client(native = {}) {
  const saved = new Map(); const shared = [];
  const exports = {}; const own = nativeFixture(native);
  vm.runInNewContext(source, {
    exports, require: name => name === './screenshotReply' ? screenshots : name === './personalAi' ? own.module : name.includes('async-storage') ? { default: { getItem: async key => saved.get(key) || null, setItem: async (key, value) => saved.set(key, value) } } : { keyboardBridge: { getConfig: async () => shared.at(-1) || null, saveConfig: async value => shared.push(value), ...native } },
    URL, fetch, AbortController, setTimeout, clearTimeout, Error, TypeError, process: { env: {} },
  });
  return { api: exports, saved, shared, own };
}
async function fixture(run) {
  const requests = [];
  let replyCode = 200; let delay = 0; let replyData = { result: '真实协议回复', candidates: ['真实协议回复'] };
  const server = http.createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    requests.push({ path: req.url, headers: req.headers, method: req.method, body: body ? JSON.parse(body) : undefined });
    const register = req.url === '/api/user/register';
    if (!register && delay) await new Promise(resolve => setTimeout(resolve, delay));
    res.writeHead(register ? 200 : replyCode, { 'content-type': 'application/json' });
    res.end(JSON.stringify(register ? { success: true, data: { isNew: true } } : replyCode === 200 ? { success: true, data: replyData } : { success: false, error: { message: '今日额度已用完' } }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try { await run({ requests, baseUrl: `http://127.0.0.1:${server.address().port}`, fail: () => { replyCode = 429; }, delayed: ms => { delay = ms; }, payload: value => { replyData = value; } }); }
  finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}

function nativeFixture(overrides = {}) {
 const jobs = [], cancelled = [], released = []; let payload = {candidates:['可用回复']}, failure = '', running = false;
 const bridge = {
  startPersonalAiRequest: async (id, path, body) => jobs.push({id, path, body:JSON.parse(body)}),
  readPersonalAiRequest: async () => JSON.stringify({status:failure?'error':running?'running':'done',text:'',result:JSON.stringify(payload),error:failure}),
  cancelPersonalAiRequest: async id => cancelled.push(id), releasePersonalAiRequest: async id => released.push(id), ...overrides
 };
 const module = {}; vm.runInNewContext(ts.transpileModule(fs.readFileSync(require.resolve('../src/services/personalAi.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:module,require:()=>({keyboardBridge:bridge}),URL,AbortController,setTimeout,clearTimeout,Error,TypeError});
 return {module,jobs,cancelled,released,setPayload:x=>payload=x,fail:x=>failure=x,run:x=>running=x};
}
test('rejects unsafe or malformed server roots before saving native configuration', async () => {
  const { api, shared } = client();
  for (const baseUrl of ['file:///tmp', 'https://user:password@example.com', 'https://example.com/api', 'https://example.com?key=x']) {
    await assert.rejects(api.connect({ baseUrl, apiKey: 'code', deviceId: 'id' }));
  }
  assert.equal(shared.length, 0);
});

test('failed registration does not replace the working shared connection', () => fixture(async ({ baseUrl }) => {
  const { api, shared } = client(); await api.connect({ baseUrl, apiKey: 'good', deviceId: 'id' });
  await assert.rejects(api.connect({ baseUrl: 'http://127.0.0.1:1', apiKey: 'bad', deviceId: 'id' }));
  assert.equal(shared.length, 1); assert.equal(api.getApiConfig().apiKey, 'good');
}));

test('damaged host cache does not prevent restoring the existing native connection', async () => {
  const { api, shared, saved } = client();
  shared.push({ baseUrl: 'http://127.0.0.1', apiKey: 'keep-native-code', deviceId: 'same-device' });
  saved.set('chatq.connection.v1', '{broken json');
  assert.equal((await api.loadConnection()).deviceId, 'same-device');
  assert.equal(api.getApiConfig().apiKey, 'keep-native-code');
});

test('account uses the existing device headers and a read-only GET, never a paid generation', () => fixture(async ({ requests, baseUrl, payload }) => {
 const {api}=client();await api.connect({baseUrl,apiKey:'app-code',deviceId:'same-device'});
 payload({quota:{used:4,limit:10,remaining:6},subscription:{tier:'free'},plans:[],purchaseAvailable:false});
 const result=await api.getAccount();assert.equal(result.quota.remaining,6);
 const request=requests.at(-1);assert.equal(request.path,'/api/aikeyboard/account');assert.equal(request.method,'GET');assert.equal(request.body,undefined);assert.equal(request.headers['x-device-id'],'same-device');
 assert.equal(requests.filter(r=>r.path.includes('/reply')).length,0);
 payload({quota:{used:'bad'},plans:[]});await assert.rejects(api.getAccount(),/格式异常/);
}));


test('reply, polish, topics and chat work without login or platform connection',async()=>{
 const {api,own,shared}=client();
 assert.deepEqual(Array.from(await api.generateReply('你好','friendly',3)),['可用回复']);
 await api.refineReply('原文','简短','professional',{customPrompt:'真诚'},new AbortController().signal);
 await api.generateTopics('daily','背景',['旧话题'],{relationId:'friend'});
 own.setPayload({reply:' 连续回答 '});const history=[{role:'user',content:'前一问'},{role:'assistant',content:'前一答'}];
 assert.equal(await api.sendChat({prompt:'继续',history,customPrompt:'简短'},new AbortController().signal),'连续回答');
 assert.deepEqual(own.jobs.map(j=>j.path),['reply','reply','topics','chat']);assert.equal(own.jobs[1].body.purpose,'polish');assert.deepEqual(own.jobs[3].body.history,history);
 assert.equal(new Set(own.jobs.map(j=>j.id)).size,4);assert.equal(shared.length,0);assert.equal(own.released.length,4);
});
test('persona, relationship, scene and explicit context survive the direct API boundary',async()=>{
 const {api,own}=client();const fields={personaTagWeights:{gentle:0.6},customPrompt:'礼貌拒绝',sceneId:'work',relationId:'friend',context:'约我加班'};
 await api.generateReply('有空吗','professional',2,fields);for(const [k,v] of Object.entries(fields))assert.deepEqual(own.jobs[0].body[k],v);
 await assert.rejects(api.generateTopics('daily','长'.repeat(201),[],fields),/200/);assert.equal(own.jobs.length,1);
});
test('supplier errors are shown once; no fallback to platform or automatic retry',async()=>{
 const {api,own}=client();own.fail('供应商额度不足');await assert.rejects(api.generateReply('你好','friendly',1),/额度不足/);
 assert.equal(own.jobs.length,1);assert.equal(own.released.length,1);
});
test('cancellation releases native transport and ignores late text; preabort never starts',async()=>{
 const controller=new AbortController(),progress=[];const {api,own}=client({readPersonalAiRequest:async()=>{controller.abort();return JSON.stringify({status:'done',text:'迟到',result:'{"reply":"迟到"}'});}});
 await assert.rejects(api.sendChat({prompt:'问'},controller.signal,t=>progress.push(t)),e=>e.name==='AbortError');
 await assert.rejects(api.generateReply('你好','friendly',1,{},controller.signal),e=>e.name==='AbortError');
 assert.deepEqual(progress,[]);assert.equal(own.jobs.length,1);assert.equal(own.cancelled.length,1);assert.equal(own.released.length,1);
});
test('cumulative native stream completes once, without a second JSON request',async()=>{
 const states=[{status:'running',text:'首段'},{status:'done',text:'首段回答',result:'{"reply":"首段回答"}'}],progress=[];
 const {api,own}=client({readPersonalAiRequest:async()=>JSON.stringify(states.shift())});
 assert.equal(await api.sendChat({prompt:'问'},new AbortController().signal,t=>progress.push(t)),'首段回答');assert.deepEqual(progress,['首段','首段回答']);assert.equal(own.jobs.length,1);assert.equal(own.released.length,1);
});
test('malformed candidates fall back to usable text; malformed chat never becomes a saved answer',async()=>{
 const {api,own}=client();own.setPayload({result:' 可用 ',candidates:[null,'']});assert.equal((await api.generateReply('你好','friendly',1))[0],'可用');
 own.setPayload({candidates:[' A ','A','B',null]});assert.deepEqual(Array.from(await api.generateReply('你好','friendly',3)),['A','B']);
 for(const bad of [null,{reply:''},{reply:'x'.repeat(10001)}]){own.setPayload(bad);await assert.rejects(api.sendChat({prompt:'问'},new AbortController().signal),/格式异常/);}
});
test('old native packages fail clearly without falling back to paid platform generation',async()=>{
 const {api}=client({startPersonalAiRequest:undefined});await assert.rejects(api.generateReply('你好','friendly',1),/新版安卓/);
});
test('free edition never creates a payment order',async()=>{
 const {api}=client();await assert.rejects(api.paymentRequest('create',{planId:'old-plan'}),/免费模式/);
});
test('personal API config preserves a custom base path, validates TLS, and only returns metadata',async()=>{
 const sent=[];const own=nativeFixture({savePersonalAiConfig:async value=>{sent.push(JSON.parse(value));return JSON.stringify({...sent[0],hasKey:true});}});
 const result=await own.module.savePersonalAi({baseUrl:' https://example.test/custom/v1/ ',apiKey:'fixture-only',model:'model-id',stream:true});
 assert.equal(sent[0].baseUrl,'https://example.test/custom/v1');assert.equal(result.hasKey,true);assert.equal(result.apiKey,undefined);
 for(const baseUrl of ['http://example.test/v1','https://u:p@example.test','file:///tmp','https://example.test/v1?x=1','https://example.test/chat/completions'])await assert.rejects(own.module.savePersonalAi({baseUrl,apiKey:'fixture',model:'model',stream:true}));
 assert.equal(sent.length,1);
});

test('custom reply count passes to personal API without truncating at three; invalid counts never call AI',async()=>{
 const {api,own}=client();own.setPayload({candidates:Array.from({length:10},(_,i)=>'候选'+i)});
 assert.equal((await api.generateReply('合成消息','friendly',10)).length,10);assert.equal(own.jobs[0].body.candidateCount,10);
 for(const n of [0,11,1.5,NaN,Infinity])await assert.rejects(api.generateReply('合成消息','friendly',n));assert.equal(own.jobs.length,1);
 assert.equal((await api.generateReply('我的草稿','friendly',5,{},undefined,{purpose:'polish'})).length,5);assert.equal(own.jobs[1].body.purpose,'polish');
});
test('screenshot can generate without text, carries only explicit image and side, and rejects invalid attachments',async()=>{
 const {api,own}=client();const screenshot={id:'synthetic-image',name:'合成截图.jpg',mime:'image/jpeg',content:'data:image/jpeg;base64,aGVsbG8='};
 await api.generateReply('','friendly',2,{},undefined,{screenshot,side:'right'});const b=own.jobs[0].body;assert.equal(b.imageSide,'right');assert.equal(b.screenshotReply,true);assert.equal(b.attachments[0].content,screenshot.content);assert.match(b.prompt,/截图/);
 await assert.rejects(api.generateReply('','friendly',2,{},undefined,{screenshot,side:'auto'}));await assert.rejects(api.generateReply('','friendly',2,{},undefined,{screenshot:{...screenshot,mime:'application/pdf'},side:'left'}));await assert.rejects(api.generateReply('x','friendly',2,{},undefined,{screenshot,side:'left',purpose:'polish'}));assert.equal(own.jobs.length,1);
});
