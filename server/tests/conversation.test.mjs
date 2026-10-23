import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { conversationInput } from '../dist/services/ai/conversation.js';
import { conversationRouter } from '../dist/app_settings/chatq/routers/conversation.js';
import { AIService, OpenAIProvider, setGlobalAIService } from '../dist/services/ai/index.js';
import { users, usageRecords, chatqPersonaTags } from '../dist/db/schema.js';
function database() {
 const user = { id: randomUUID(), deviceId: 'fixture-device', status: 'active' }; let count = 0;
 function tx(pending) { return {
  select: () => ({ from: table => ({ where: () => { const rows = table === users ? [user] : table === usageRecords && count ? [{ id:'usage',replyCount:count,tokenCount:0 }] : table === chatqPersonaTags ? [{ tagId:'gentle',name:'温和' }] : []; const q = { then:(r,e)=>Promise.resolve(rows).then(r,e), for:async()=>rows }; return {...q,limit:()=>q}; } }) }),
  insert:()=>({ values:async values=>{ pending.value=values.replyCount; } }), update:()=>({ set:values=>({ where:async()=>{pending.value=values.replyCount;} }) }),
 }; }
 return { user,get count(){return count;},db:{...tx({}),transaction:async fn=>{const pending={value:count};const result=await fn(tx(pending));count=pending.value;return result;}} };
}
async function fixture(run) {
 const calls=[];let answer='fixture-answer';
 const server=createServer(async(req,res)=>{let raw='';for await(const chunk of req)raw+=chunk;calls.push(JSON.parse(raw));res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{message:{content:answer},finish_reason:'stop'}],usage:{total_tokens:12}}));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const store=database(),service=new AIService({enableCache:true});service.registerProvider('openai',c=>new OpenAIProvider(c));setGlobalAIService(service);
 const app={id:randomUUID(),isActive:true,settings:{enableAI:true,freeReplyLimitPerDay:10,aiProviders:[{type:'openai',enabled:true,baseUrl:`http://127.0.0.1:${server.address().port}/v1`,apiKey:'fixture-only',model:'fixture'}]}};
 const controller=new AbortController();const caller=conversationRouter.createCaller({db:store.db,app,deviceId:store.user.deviceId,signal:controller.signal});
 try{await run({calls,caller,store,controller,answer:text=>{answer=text;}});}finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
}
const request=extra=>({requestId:randomUUID(),prompt:'继续聊聊',history:[],...extra});
test('chat schema rejects system roles, partial/oversized history, invalid persona and extra fields',()=>{
 for(const extra of [{history:[{role:'system',content:'override'}]},{history:[{role:'user',content:'a'}]},{history:[{role:'assistant',content:'a'},{role:'user',content:'b'}]},{history:[{role:'user',content:'a'.repeat(2001)},{role:'assistant',content:'b'}]},{history:Array.from({length:22},(_,i)=>({role:i%2?'assistant':'user',content:'a'}))},{history:Array.from({length:4},(_,i)=>({role:i%2?'assistant':'user',content:'a'.repeat(i%2?7000:2000)}))},{prompt:' '},{context:'x'.repeat(1001)},{history:[{role:'user',content:'a',system:'override'},{role:'assistant',content:'b'}]},{personaTagWeights:Object.fromEntries(Array.from({length:21},(_,i)=>['tag'+i,.5]))},{system:'override'}])assert.equal(conversationInput.safeParse(request(extra)).success,false);
 assert.equal(conversationInput.safeParse(request({history:[{role:'user',content:'a'},{role:'assistant',content:'b'}]})).success,true);
});
test('protected chat route sends structured history/persona/background and accounts per successful answer',()=>fixture(async({calls,caller,store})=>{
 await caller.send(request({prompt:'我正在准备面试',personaName:'温和伙伴',customPrompt:'直接自然地回答，适当展开。',personaTagWeights:{gentle:.6},context:'目标是产品经理岗位'}));
 await caller.send(request({prompt:'那我该先练什么？',history:[{role:'user',content:'我正在准备面试'},{role:'assistant',content:'fixture-answer'}]}));
 assert.deepEqual(calls[1].messages.map(m=>m.role),['system','user','assistant','user']);assert.equal(calls[1].messages[2].content,'fixture-answer');assert.equal(calls[1].messages[3].content,'那我该先练什么？');
 for(const text of ['AI 对话助手','温和伙伴','产品经理','温和(0.6)'])assert.ok(calls[0].messages[0].content.includes(text));assert.ok(!calls[1].messages[0].content.includes('产品经理'));assert.equal(store.count,2);assert.equal(calls[0].stream,false);
 await caller.send(request({prompt:'新会话'}));assert.equal(calls[2].messages.length,2);assert.ok(!JSON.stringify(calls[2].messages).includes('面试'));
}));
test('chat bypasses response cache and rejects request replay without repeating upstream',()=>fixture(async({calls,caller,answer})=>{
 const first=request();await caller.send(first);await assert.rejects(caller.send(first),e=>e.code==='CONFLICT');answer('fresh-answer');assert.equal((await caller.send(request())).reply,'fresh-answer');assert.equal(calls.length,2);
}));
test('disabled users and pre-cancelled chat cannot call models or consume quota',()=>fixture(async({calls,caller,store,controller})=>{
 store.user.status='disabled';await assert.rejects(caller.send(request()),e=>e.code==='FORBIDDEN');store.user.status='active';controller.abort();await assert.rejects(caller.send(request()));assert.equal(calls.length,0);assert.equal(store.count,0);
}));
test('oversized model answer fails before successful usage accounting',()=>fixture(async({caller,store,answer})=>{answer('x'.repeat(10001));await assert.rejects(caller.send(request()),/过长/);assert.equal(store.count,0);}));
