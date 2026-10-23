import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import { readCompletionStream } from '../dist/services/ai/stream.js';
import { requestAbortSignal } from '../dist/services/ai/request-control.js';
process.env.DATABASE_URL = 'postgres://fixture:fixture@127.0.0.1:1/fixture';
const { registerRestAdapter } = await import('../dist/routers/rest-adapter.js');
import { conversationRouter } from '../dist/app_settings/chatq/routers/conversation.js';
import { AIService, OpenAIProvider, setGlobalAIService } from '../dist/services/ai/index.js';
import { users, usageRecords } from '../dist/db/schema.js';
const packet = data => `data: ${typeof data==='string'?data:JSON.stringify(data)}\r\n\r\n`;
const delta = text => packet({choices:[{index:0,delta:{content:text}}]});
const terminal = packet({choices:[{index:0,delta:{},finish_reason:'stop'}]})+packet('[DONE]');
function bytes(text, split=1){const all=new TextEncoder().encode(text);return new ReadableStream({start(c){for(let i=0;i<all.length;i+=split)c.enqueue(all.slice(i,i+split));c.close();}});}
test('stream reader preserves Unicode and CRLF across every byte boundary', async()=>{
 const chunks=[];const result=await readCompletionStream(bytes(': hello\r\n\r\n'+delta('你好😀')+delta('，世界')+terminal),s=>chunks.push(s),new AbortController().signal);
 assert.equal(result.text,'你好😀，世界');assert.deepEqual(chunks,['你好😀','，世界']);
});
test('stream reader rejects truncation, bad frames, length finish, oversized answer and error bodies', async()=>{
 for(const raw of [delta('未完成'),delta('x')+packet({choices:[{finish_reason:'length'}]}), 'data: {bad}\n\n',delta('x'.repeat(10001))+terminal,packet({error:{message:'secret vendor text'}}),terminal]) await assert.rejects(readCompletionStream(bytes(raw,257),()=>{},new AbortController().signal));
});
test('stopping during a delta rejects the stream and releases its reader',async()=>{
 const c=new AbortController();let count=0;await assert.rejects(readCompletionStream(bytes(delta('一')+delta('二')+terminal),()=>{count++;c.abort();},c.signal));assert.equal(count,1);
});
function store(){let count=0;const user={id:randomUUID(),deviceId:'fixture',status:'active'};
 function tx(p){return{select:()=>({from:table=>({where:()=>{const rows=table===users?[user]:table===usageRecords&&count?[{id:'usage',replyCount:count,tokenCount:0}]:[];const q={then:(r,e)=>Promise.resolve(rows).then(r,e),for:async()=>rows};return{...q,limit:()=>q};}})}),insert:()=>({values:async v=>{p.value=v.replyCount;}}),update:()=>({set:v=>({where:async()=>{p.value=v.replyCount;}})})};}
 return{user,get count(){return count;},db:{...tx({}),transaction:async f=>{const p={value:count};const result=await f(tx(p));count=p.value;return result;}}};}
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
async function fixture(run){
 const gate=deferred(),closed=deferred();let calls=0,fallback=0,mode='normal';
 const upstream=createServer(async(req,res)=>{for await(const _ of req){}calls++;res.on('close',closed.resolve);res.writeHead(200,{'Content-Type':'text/event-stream'});res.write(delta('你好'));
  if(mode==='stall')await gate.promise;
  if(mode==='error'){res.end(packet({error:{message:'vendor secret'}}));return;}
  res.end(delta('世界')+terminal);
 });await new Promise(r=>upstream.listen(0,'127.0.0.1',r));
 const data=store(),service=new AIService();service.registerProvider('openai',c=>new OpenAIProvider(c));service.registerProvider('anthropic',c=>({config:c,isAvailable:()=>true,generate:async()=>{fallback++;throw new Error('must not retry');}}));setGlobalAIService(service);
 const app={id:randomUUID(),isActive:true,settings:{enableAI:true,freeReplyLimitPerDay:10,aiProviders:[{type:'openai',enabled:true,priority:1,baseUrl:`http://127.0.0.1:${upstream.address().port}/v1`,apiKey:'test-only',model:'test'},{type:'anthropic',enabled:true,priority:2}]}};
 const api=Fastify();await registerRestAdapter(api,async(req,res,onDelta)=>{const caller=conversationRouter.createCaller({db:data.db,app,deviceId:'fixture',signal:requestAbortSignal(req.raw,res.raw),onDelta});return{mutation:(_,input)=>caller.send(input),query:async()=>null};});await api.listen({host:'127.0.0.1',port:0});
 const send=(body={},signal)=>fetch(`http://127.0.0.1:${api.server.address().port}/api/aikeyboard/chat/stream`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requestId:randomUUID(),prompt:'测试',history:[],...body}),signal});
 try{await run({send,data,gate,closed,mode:value=>{mode=value;},get calls(){return calls;},get fallback(){return fallback;}});}finally{gate.resolve();upstream.closeAllConnections();await Promise.all([api.close(),new Promise(r=>upstream.close(r))]);}
}
test('real protected REST stream flushes deltas before completion, then commits one success before done',()=>fixture(async f=>{
 f.mode('stall');const response=await f.send();assert.equal(response.headers.get('content-type'),'text/event-stream; charset=utf-8');const reader=response.body.getReader();let text=new TextDecoder().decode((await reader.read()).value);assert.ok(text.includes('你好'));assert.equal(f.data.count,0);f.gate.resolve();while(true){const part=await reader.read();if(part.done)break;text+=new TextDecoder().decode(part.value);}assert.ok(text.includes('"type":"done"'));assert.ok(text.includes('你好世界'));assert.equal(f.data.count,1);assert.equal(f.calls,1);
}));
test('real downstream disconnect closes streaming upstream and never commits quota',()=>fixture(async f=>{
 f.mode('stall');const controller=new AbortController();const response=await f.send({},controller.signal);await response.body.getReader().read();controller.abort();await Promise.race([f.closed.promise,new Promise((_,reject)=>{const t=setTimeout(()=>reject(new Error('stream disconnect timeout')),3000);t.unref();})]);await new Promise(r=>setTimeout(r,30));assert.equal(f.data.count,0);assert.equal(f.fallback,0);
}));
test('stream failures stay in-band after deltas, retain no successful quota and never switch providers',()=>fixture(async f=>{
 f.mode('error');const response=await f.send();const text=await response.text();assert.ok(text.includes('"type":"delta"'));assert.ok(text.includes('"type":"error"'));assert.ok(!text.includes('"type":"done"'));assert.ok(!text.includes('vendor secret'));assert.equal(f.data.count,0);assert.equal(f.fallback,0);
}));
test('disabled users and invalid stream input are rejected before opening SSE',()=>fixture(async f=>{
 f.data.user.status='disabled';let response=await f.send();assert.equal(response.status,403);assert.equal((await response.json()).success,false);f.data.user.status='active';response=await f.send({history:[{role:'system',content:'bad'}]});assert.equal(response.status,400);assert.equal(f.calls,0);
}));
