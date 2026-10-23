const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const source = ts.transpileModule(fs.readFileSync(require.resolve('../src/services/api.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function client(native = {}) {
  const saved = new Map(); const shared = [];
  const exports = {};
  vm.runInNewContext(source, {
    exports, require: name => name.includes('async-storage') ? { default: { getItem: async key => saved.get(key) || null, setItem: async (key, value) => saved.set(key, value) } } : { keyboardBridge: { getConfig: async () => shared.at(-1) || null, saveConfig: async value => shared.push(value), ...native } },
    URL, fetch, AbortController, setTimeout, clearTimeout, Error, TypeError, process: { env: {} },
  });
  return { api: exports, saved, shared };
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
test('registers the same device, shares connection and handles fewer candidates than requested', () => fixture(async ({ requests, baseUrl }) => {
  const { api, shared } = client();
  await api.connect({ baseUrl, apiKey: 'application-code', deviceId: 'stable-device' });
  const result = await api.generateReply('今天有点累', 'friendly', 3);
  assert.equal(result.length, 1); assert.equal(result[0], '真实协议回复');
  assert.equal(shared.length, 1); assert.equal(requests.length, 2);
  assert.equal(requests[0].path, '/api/user/register'); assert.equal(requests[0].body.deviceId, 'stable-device');
  assert.equal(requests[1].headers['x-device-id'], 'stable-device');
  assert.equal(requests[1].headers['x-api-key'], 'application-code');
  assert.equal(requests[1].body.prompt, '今天有点累'); assert.equal(requests[1].body.candidateCount, 3);
}));
test('shows quota failure and never retries a paid generation automatically', () => fixture(async ({ requests, baseUrl, fail }) => {
  const { api } = client(); await api.connect({ baseUrl, apiKey: 'code', deviceId: 'id' }); fail();
  await assert.rejects(api.generateReply('你好', 'funny', 1), /今日额度已用完/);
  assert.equal(requests.filter(r => r.path.includes('/reply')).length, 1);
}));
test('transmits persona, scene, relationship, context and goal with the actual reply request', () => fixture(async ({ requests, baseUrl }) => {
  const { api } = client(); await api.connect({ baseUrl, apiKey: 'code', deviceId: 'id' });
  const fields = { personaTagWeights: { gentle: 0.6 }, customPrompt: '直率，不说土味情话。\n本次回复目标：礼貌拒绝', sceneId: 'workplace', relationId: 'colleague', context: '对方昨天约我加班' };
  await api.generateReply('晚上有空吗', 'professional', 1, fields);
  for (const [key, value] of Object.entries(fields)) assert.deepEqual(JSON.parse(JSON.stringify(requests[1].body[key])), value);
}));
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
test('topics work without an opponent message and reuse explicit persona/background without retries', () => fixture(async ({ requests, baseUrl, fail }) => {
  const { api } = client(); await api.connect({ baseUrl, apiKey: 'code', deviceId: 'id' });
  const fields = { customPrompt: '自然真诚', sceneId: 'daily', relationId: 'friend' };
  const result = await api.generateTopics('hobbies', '', ['旧话题'], fields);
  assert.equal(result.length, 1);
  const sent = requests[1]; assert.equal(sent.path, '/api/aikeyboard/topics');
  assert.equal(sent.body.prompt, ''); assert.equal(sent.body.category, 'hobbies'); assert.equal(sent.body.customPrompt, fields.customPrompt);
  assert.deepEqual(sent.body.avoid, ['旧话题']); assert.equal(sent.body.candidateCount, 3);
  await assert.rejects(api.generateTopics('daily', '长'.repeat(201), [], fields), /200/);
  assert.equal(requests.length, 2);
  fail(); await assert.rejects(api.generateTopics('daily', '刚认识', [], fields), /今日额度/);
  assert.equal(requests.filter(r => r.path.endsWith('/topics')).length, 2);
}));
test('damaged host cache does not prevent restoring the existing native connection', async () => {
  const { api, shared, saved } = client();
  shared.push({ baseUrl: 'http://127.0.0.1', apiKey: 'keep-native-code', deviceId: 'same-device' });
  saved.set('chatq.connection.v1', '{broken json');
  assert.equal((await api.loadConnection()).deviceId, 'same-device');
  assert.equal(api.getApiConfig().apiKey, 'keep-native-code');
});
test('explicit cancellation aborts a pending reply without retry and permits a later request', () => fixture(async ({ api, requests, baseUrl, delayed }) => {
  const { api: clientApi } = client(); await clientApi.connect({ baseUrl, apiKey: 'code', deviceId: 'id' }); delayed(200);
  const controller = new AbortController(); const result = clientApi.generateReply('待取消', 'friendly', 1, {}, controller.signal);
  await new Promise(resolve => setTimeout(resolve, 30)); controller.abort();
  await assert.rejects(result, e => e.name === 'AbortError');
  assert.equal(requests.filter(r => r.path.endsWith('/reply')).length, 1);
  delayed(0); assert.equal((await clientApi.generateReply('重新生成', 'friendly', 1)).length, 1);
}));
test('an already cancelled request never uploads a message', () => fixture(async ({ requests, baseUrl }) => {
  const { api } = client(); await api.connect({ baseUrl, apiKey: 'code', deviceId: 'id' });
  const controller = new AbortController(); controller.abort();
  await assert.rejects(api.generateTopics('daily', '', [], {}, controller.signal), e => e.name === 'AbortError');
  assert.equal(requests.length, 1);
}));
test('malformed candidate lists fall back to valid text and empty payloads fail clearly', () => fixture(async ({ baseUrl, payload }) => {
  const { api } = client(); await api.connect({ baseUrl, apiKey: 'code', deviceId: 'id' });
  payload({ result: ' 可用回复 ', candidates: [null, '', ' '] });
  assert.deepEqual(Array.from(await api.generateReply('你好', 'friendly', 1)), ['可用回复']);
  payload({ result: '备用', candidates: '不是数组' }); assert.equal((await api.generateTopics('daily', '', []))[0], '备用');
  payload({ candidates: [' A ', 'A', 'B', null] }); assert.deepEqual(Array.from(await api.generateReply('你好', 'friendly', 3)), ['A', 'B']);
  payload(null); await assert.rejects(api.generateReply('你好', 'friendly', 1), /没有返回回复内容/);
}));

test('account uses the existing device headers and a read-only GET, never a paid generation', () => fixture(async ({ requests, baseUrl, payload }) => {
 const {api}=client();await api.connect({baseUrl,apiKey:'app-code',deviceId:'same-device'});
 payload({quota:{used:4,limit:10,remaining:6},subscription:{tier:'free'},plans:[],purchaseAvailable:false});
 const result=await api.getAccount();assert.equal(result.quota.remaining,6);
 const request=requests.at(-1);assert.equal(request.path,'/api/aikeyboard/account');assert.equal(request.method,'GET');assert.equal(request.body,undefined);assert.equal(request.headers['x-device-id'],'same-device');
 assert.equal(requests.filter(r=>r.path.includes('/reply')).length,0);
 payload({quota:{used:'bad'},plans:[]});await assert.rejects(api.getAccount(),/格式异常/);
}));

test('reply and topics use distinct replay protection IDs without changing registration', () => fixture(async ({ requests, baseUrl }) => {
 const { api } = client(); await api.connect({baseUrl, apiKey:'code', deviceId:'id'});
 await api.generateReply('你好', 'friendly', 1); await api.generateTopics('daily', '', []);
 assert.equal(requests[0].body.requestId, undefined);
 for (const request of requests.slice(1)) assert.match(request.body.requestId, /^[a-zA-Z0-9_-]{16,80}$/);
 assert.notEqual(requests[1].body.requestId, requests[2].body.requestId);
}));

test('chat uses its protected endpoint, structured context and a fresh ID for each turn', () => fixture(async ({ requests, baseUrl, payload }) => {
 const {api}=client();await api.connect({baseUrl,apiKey:'code',deviceId:'id'});payload({reply:' 连续回答 '});
 const input={prompt:'接着聊',history:[{role:'user',content:'第一问'},{role:'assistant',content:'第一答'}],context:'当前背景',personaName:'自然真诚',customPrompt:'简洁'};
 for(let i=0;i<2;i++)assert.equal(await api.sendChat(input,new AbortController().signal),'连续回答');
 for(const req of requests.slice(1)){assert.equal(req.path,'/api/aikeyboard/chat');assert.deepEqual(req.body.history,input.history);assert.equal(req.body.personaName,'自然真诚');assert.equal(req.headers['x-api-key'],'code');}
 assert.notEqual(requests[1].body.requestId,requests[2].body.requestId);
}));
test('chat cancellation closes fetch without retry, and pre-abort never uploads history', () => fixture(async ({ requests, baseUrl, delayed, payload }) => {
 const {api}=client();await api.connect({baseUrl,apiKey:'code',deviceId:'id'});payload({reply:'迟到回答'});delayed(200);
 const input={prompt:'当前消息',history:[],context:'',personaName:'默认助手'},controller=new AbortController();const pending=api.sendChat(input,controller.signal);await new Promise(r=>setTimeout(r,30));controller.abort();await assert.rejects(pending,e=>e.name==='AbortError');
 await assert.rejects(api.sendChat(input,controller.signal),e=>e.name==='AbortError');assert.equal(requests.filter(r=>r.path.endsWith('/chat')).length,1);
}));
test('chat rejects missing and oversized answers instead of saving a malformed turn', () => fixture(async ({ baseUrl, payload }) => {
 const {api}=client();await api.connect({baseUrl,apiKey:'code',deviceId:'id'});const input={prompt:'问',history:[],context:'',personaName:'默认助手'};
 for(const bad of [null,{reply:''},{reply:'x'.repeat(10001)}]){payload(bad);await assert.rejects(api.sendChat(input,new AbortController().signal),/格式异常/);}
}));


test('native chat stream yields cumulative text, releases once and never repeats as JSON', () => fixture(async ({requests,baseUrl}) => {
 const states=[{status:'running',text:'首段'},{status:'done',text:'首段回答'}], started=[],released=[],progress=[];
 const {api}=client({startChatStream:async(id,payload)=>started.push([id,JSON.parse(payload)]),readChatStream:async()=>JSON.stringify(states.shift()),cancelChatStream:async()=>{},releaseChatStream:async id=>released.push(id)});
 await api.connect({baseUrl,apiKey:'code',deviceId:'id'});
 assert.equal(await api.sendChat({prompt:'问',history:[]},new AbortController().signal,text=>progress.push(text)),'首段回答');
 assert.deepEqual(progress,['首段','首段回答']);assert.equal(started.length,1);assert.equal(started[0][0],started[0][1].requestId);assert.deepEqual(released,[started[0][0]]);assert.equal(requests.length,1);
}));
test('native cancellation rejects late text, releases transport, and does not fallback on an error', () => fixture(async ({requests,baseUrl}) => {
 const controller=new AbortController(),progress=[],calls=[];let failed=false;
 const {api}=client({startChatStream:async()=>calls.push('start'),readChatStream:async()=>{if(failed)return JSON.stringify({status:'error',text:'部分',error:'断流'});controller.abort();return JSON.stringify({status:'done',text:'迟到'});},cancelChatStream:async()=>calls.push('cancel'),releaseChatStream:async()=>calls.push('release')});
 await api.connect({baseUrl,apiKey:'code',deviceId:'id'});await assert.rejects(api.sendChat({prompt:'问'},controller.signal,t=>progress.push(t)),e=>e.name==='AbortError');assert.deepEqual(progress,[]);assert.deepEqual(calls,['start','cancel','release']);
 failed=true;await assert.rejects(api.sendChat({prompt:'问'},new AbortController().signal,t=>progress.push(t)),/断流/);assert.equal(requests.length,1);assert.equal(calls.filter(c=>c==='release').length,2);
}));
