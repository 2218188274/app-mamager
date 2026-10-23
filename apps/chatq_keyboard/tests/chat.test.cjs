const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), path = require('node:path'), ts = require('typescript');
const api = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/services/chat.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: api, require: () => ({ replyPersonalization: s => ({ customPrompt: s.data.cards.find(c => c.id === s.selection.cardId).instructions }) }), AbortController, Date, Math, Set, Error });
const plain = x => JSON.parse(JSON.stringify(x));
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return { promise, resolve, reject }; };
const tick = () => new Promise(r => setImmediate(r));
const turn = (i, size=5) => ({ id: 'turn-'+i, question: 'q'.repeat(size), answer: 'a'.repeat(size), at: 1700000000000+i, personaName: '测试人设' });
test('history carries ten complete pairs, respects reset and total character budget', () => {
  const s=api.newChat();s.turns=Array.from({length:15},(_,i)=>turn(i));
  let h=api.chatHistory(s,'now');assert.equal(h.length,20);assert.equal(h[0].role,'user');assert.equal(h[1].role,'assistant');
  s.contextStart=14;assert.equal(api.chatHistory(s,'now').length,2);
  s.useContext=false;assert.equal(api.chatHistory(s,'now').length,0);
  s.useContext=true;s.contextStart=0;s.turns=[turn(1,5000),turn(2,5000)];h=api.chatHistory(s,'x'.repeat(2000));assert.equal(h.length,2);assert.ok(h.reduce((n,m)=>n+m.content.length,2000)<=16000);
});
test('persona is scoped to chat and a deleted card falls back safely', () => {
  const state={ data:{cards:[{id:'a',name:'温柔',instructions:'温和表达'}]},selection:{cardId:'keyboard',sceneId:'scene',relationId:'relation'} };
  assert.equal(api.chatPersona(state,'a').customPrompt,'温和表达');assert.equal(state.selection.cardId,'keyboard');assert.equal(api.chatPersona(state,'missing').personaName,'默认助手');
});
test('controller sends structured multi-round context and saves a completed answer once', async () => {
  const saves=[],requests=[];const c=new api.ChatController(async s=>{saves.push(plain(s));return true;},async r=>{requests.push(plain(r));return '回答'+requests.length;});
  c.edit({draft:'第一问',background:'会话背景',personaId:'a'});await c.send({personaName:'温柔'});
  c.edit({draft:'第二问'});await c.send({personaName:'温柔'});
  assert.equal(requests.length,2);assert.deepEqual(requests[0].history,[]);assert.deepEqual(requests[1].history,[{role:'user',content:'第一问'},{role:'assistant',content:'回答1'}]);assert.equal(requests[1].context,'会话背景');
  assert.equal(c.getSnapshot().session.turns.length,2);assert.equal(c.getSnapshot().session.draft,'');assert.equal(c.getSnapshot().unsaved,false);assert.equal(saves.filter(s=>s.turns.length===2).length,1);
  c.open(api.newChat());c.edit({draft:'另一个会话'});await c.send({personaName:'默认助手'});assert.deepEqual(requests[2].history,[]);
});
test('double tap starts one request; cancellation discards late result and preserves draft', async () => {
  const answer=deferred();let calls=0,signal;const c=new api.ChatController(async()=>true,async(r,s)=>{calls++;signal=s;return answer.promise;});c.edit({draft:'保留这个问题'});
  const running=c.send({personaName:'默认助手'});await tick();await c.send({personaName:'默认助手'});assert.equal(calls,1);c.cancel();assert.equal(signal.aborted,true);assert.equal(c.getSnapshot().session.draft,'保留这个问题');
  c.open(api.newChat());answer.resolve('迟到的回答');await running;assert.equal(c.getSnapshot().session.turns.length,0);assert.equal(c.getSnapshot().phase,'idle');
});
test('cancellation while preflight save is pending never reaches model', async () => {
  const saving=deferred();let calls=0;const c=new api.ChatController(()=>saving.promise,async()=>{calls++;return 'wrong';});c.edit({draft:'消息'});const running=c.send({personaName:'默认助手'});c.cancel();saving.resolve(true);await running;assert.equal(calls,0);assert.equal(c.getSnapshot().session.draft,'消息');
});
test('failed answer persistence retries only local save, with no duplicate AI charge', async () => {
  let writes=0,calls=0;const c=new api.ChatController(async()=>{if(++writes===2)throw new Error('disk full');return true;},async()=>{calls++;return '已生成';});c.edit({draft:'问题'});await c.send({personaName:'默认助手'});
  assert.equal(c.getSnapshot().session.turns[0].answer,'已生成');assert.equal(c.getSnapshot().unsaved,true);assert.match(c.getSnapshot().error,/保存失败/);await c.retrySave();assert.equal(calls,1);assert.equal(c.getSnapshot().unsaved,false);
});
test('failed preflight or upstream response retains draft without a partial turn', async () => {
  let calls=0;const c=new api.ChatController(async()=>{throw new Error('磁盘满');},async()=>{calls++;return 'wrong';});c.edit({draft:'不能丢'});await c.send({personaName:'默认助手'});assert.equal(calls,0);assert.equal(c.getSnapshot().session.draft,'不能丢');
  const b=new api.ChatController(async()=>true,async()=>{throw new Error('额度不足');});b.edit({draft:'保留'});await b.send({personaName:'默认助手'});assert.equal(b.getSnapshot().session.turns.length,0);assert.equal(b.getSnapshot().session.draft,'保留');assert.match(b.getSnapshot().error,/额度不足/);
});
test('empty cleared draft persists; reset context retains visible records; temporary mode stays unsaved', async () => {
  const saves=[];const c=new api.ChatController(async s=>{saves.push(plain(s));return true;},async()=> '答');c.edit({draft:'草稿'});await c.flush();c.edit({draft:''});await c.flush();assert.equal(saves.at(-1).draft,'');
  c.edit({draft:'问',background:'旧背景'});await c.send({personaName:'默认助手'});c.resetContext();assert.equal(c.getSnapshot().session.turns.length,1);assert.equal(c.getSnapshot().session.background,'');assert.equal(api.chatHistory(c.getSnapshot().session,'下一个').length,0);
  const t=new api.ChatController(async()=>false,async()=> '临时答');t.edit({draft:'临时问'});await t.send({personaName:'默认助手'});assert.equal(t.getSnapshot().session.turns.length,1);assert.equal(t.getSnapshot().unsaved,true);
});
test('turn cap and malformed stored sessions are rejected without silently erasing data', async () => {
  let calls=0;const c=new api.ChatController(async()=>true,async()=>{calls++;return 'wrong';});const s=api.newChat();s.turns=Array.from({length:100},(_,i)=>turn(i));c.open(s);c.edit({draft:'第101问'});await c.send({personaName:'默认助手'});assert.equal(calls,0);assert.match(c.getSnapshot().error,/100/);
  for(const bad of [{...s,unknown:true},{...s,turns:[{...turn(1),role:'system'}]},{...s,contextStart:101}]) assert.throws(()=>api.parseChat(bad),/格式异常/);
});
test('pasted control characters cannot make a successful answer impossible to persist', async () => {
 const c=new api.ChatController(async s=>{api.parseChat(s);return true;},async()=> '可保存回答');c.edit({draft:'标题\u0000控制\n字符'});await c.send({personaName:'默认助手'});assert.equal(c.getSnapshot().unsaved,false);assert.equal(c.getSnapshot().session.title,'标题 控制 字符');assert.equal(c.getSnapshot().session.turns[0].question,'标题\u0000控制\n字符');
});
test('stream previews update before completion and cancel cannot commit a partial answer', async () => {
 const finish=deferred();let progress;const c=new api.ChatController(async()=>true,async(r,s,onProgress)=>{progress=onProgress;onProgress('第一段');return finish.promise;});c.edit({draft:'问题'});const pending=c.send({personaName:'默认助手'});await tick();assert.equal(c.getSnapshot().partial,'第一段');assert.equal(c.getSnapshot().session.turns.length,0);c.cancel();progress('停止后的迟到片段');assert.equal(c.getSnapshot().partial,'第一段');finish.resolve('最终迟到回答');await pending;assert.equal(c.getSnapshot().session.turns.length,0);assert.equal(c.getSnapshot().session.draft,'问题');
});
test('regenerate excludes the answer being replaced, preserves draft and replaces only after success', async () => {
 const s=api.newChat();s.turns=[{...turn(1),question:'第一问',answer:'第一答'},{...turn(2),question:'第二问',answer:'旧答案'}];s.draft='未发送草稿';const requests=[];const finish=deferred();const c=new api.ChatController(async()=>true,async(r,signal,progress)=>{requests.push(plain(r));progress('新回答片段');return finish.promise;});c.open(s);const pending=c.regenerate({personaName:'新人设'});await tick();assert.equal(c.getSnapshot().session.turns[1].answer,'旧答案');assert.equal(requests[0].prompt,'第二问');assert.deepEqual(requests[0].history,[{role:'user',content:'第一问'},{role:'assistant',content:'第一答'}]);finish.resolve('新答案');await pending;assert.equal(c.getSnapshot().session.turns.length,2);assert.equal(c.getSnapshot().session.turns[1].id,s.turns[1].id);assert.equal(c.getSnapshot().session.turns[1].answer,'新答案');assert.equal(c.getSnapshot().session.turns[1].personaName,'新人设');assert.equal(c.getSnapshot().session.draft,'未发送草稿');
});
test('cancelled or failed regeneration retains old answer, draft and context boundary',async()=>{
 for(const stop of [true,false]){const s=api.newChat();s.turns=[turn(1)];s.contextStart=1;s.draft='草稿';const result=deferred();let sent;const c=new api.ChatController(async()=>true,async r=>{sent=r;return result.promise;});c.open(s);const pending=c.regenerate({personaName:'默认助手'});await tick();assert.equal(sent.history.length,0);if(stop)c.cancel();result.reject(new Error('网络失败'));await pending;assert.deepEqual(plain(c.getSnapshot().session),plain(s));}
});
test('regeneration at 100 rounds is allowed and save retry never repeats the model',async()=>{
 const s=api.newChat();s.turns=Array.from({length:100},(_,i)=>turn(i));let calls=0,writes=0;const c=new api.ChatController(async()=>{if(++writes===1)throw new Error('disk');return true;},async()=>{calls++;return '新答案';});c.open(s);await c.regenerate({personaName:'默认助手'});assert.equal(calls,1);assert.equal(c.getSnapshot().session.turns.length,100);assert.equal(c.getSnapshot().unsaved,true);await c.retrySave();assert.equal(calls,1);assert.equal(c.getSnapshot().unsaved,false);
});


test('rename is validated, persisted atomically and preserved when the first answer arrives', async()=>{
 const writes=[];const c=new api.ChatController(async s=>{writes.push(plain(s));return true;},async()=> '回答');
 await c.rename('  我的安排  ');assert.equal(c.getSnapshot().session.title,'我的安排');c.edit({draft:'第一次问题'});await c.send({personaName:'默认助手'});assert.equal(c.getSnapshot().session.title,'我的安排');
 for(const value of ['', '  ', 'a'.repeat(41), '名\n称'])await assert.rejects(c.rename(value),/1–40/);
 const failed=new api.ChatController(async()=>false,async()=> '不能调用');const old=failed.getSnapshot().session;await assert.rejects(failed.rename('未保存名称'),/开启/);assert.equal(failed.getSnapshot().session,old);assert.equal(failed.getSnapshot().phase,'idle');
 const disk=new api.ChatController(async()=>{throw new Error('disk full');},async()=> '');await assert.rejects(disk.rename('新标题'),/disk full/);assert.equal(disk.getSnapshot().session.title,'新对话');
});
test('editing an earlier question creates a saved branch, excludes old/future answers and preserves original draft',async()=>{
 const original={...api.newChat(),title:'原会话',draft:'原来的未发消息',turns:[turn(1),turn(2),turn(3)]};const saved=[],requests=[];
 const c=new api.ChatController(async s=>{saved.push(plain(s));return true;},async r=>{requests.push(plain(r));return '编辑后的回答';});c.open(original);c.edit({background:'当前背景'});await c.answerEdited(original.turns[1].id,' 修改后的第二问 ',{personaName:'当前人设'});
 const next=c.getSnapshot().session;assert.notEqual(next.id,original.id);assert.equal(next.title,'原会话 · 编辑');assert.equal(next.turns.length,2);assert.equal(next.turns[1].question,'修改后的第二问');assert.equal(next.turns[1].answer,'编辑后的回答');assert.equal(next.turns[1].personaName,'当前人设');assert.equal(original.draft,'原来的未发消息');assert.equal(original.turns.length,3);assert.equal(next.draft,'');
 assert.deepEqual(requests[0].history,[{role:'user',content:original.turns[0].question},{role:'assistant',content:original.turns[0].answer}]);assert.equal(requests[0].context,'当前背景');assert.equal(saved[0].id,original.id);assert.equal(saved[1].id,next.id);assert.equal(saved[1].draft,'修改后的第二问');assert.equal(saved[1].turns.length,1);
});
test('branch preflight rejects capacity/save-off before AI and cannot be double-submitted',async()=>{
 for(const kind of ['capacity','disabled']){let calls=0;const c=new api.ChatController(async()=>{if(kind==='capacity')throw new Error('50 个会话');return false;},async()=>{calls++;return '禁止调用';});const s={...api.newChat(),turns:[turn(1)]};c.open(s);await c.answerEdited(s.turns[0].id,'编辑问题',{personaName:'默认助手'});assert.equal(calls,0);assert.equal(c.getSnapshot().session,s);assert.ok(c.getSnapshot().error);}
 const pending=deferred();let calls=0;const c=new api.ChatController(()=>pending.promise,async()=>{calls++;return '回答';});const s={...api.newChat(),turns:[turn(1)]};c.open(s);const running=c.answerEdited(s.turns[0].id,'改问',{personaName:'默认助手'});await tick();await c.answerEdited(s.turns[0].id,'双击',{personaName:'默认助手'});c.cancel();pending.resolve(true);await running;assert.equal(calls,0);assert.equal(c.getSnapshot().session,s);
});
test('failed/cancelled branch keeps its edited draft and reset boundary without altering original',async()=>{
 for(const stop of [true,false]){const original={...api.newChat(),contextStart:3,turns:[turn(1),turn(2),turn(3)]};const pending=deferred();let request;const c=new api.ChatController(async()=>true,async r=>{request=r;return pending.promise;});c.open(original);const running=c.answerEdited(original.turns[1].id,'保留修改',{personaName:'默认助手'});await tick();const branchId=c.getSnapshot().session.id;assert.notEqual(branchId,original.id);assert.equal(request.history.length,0);assert.equal(c.getSnapshot().session.contextStart,1);if(stop)c.cancel();pending.reject(new Error('断网'));await running;assert.equal(c.getSnapshot().session.draft,'保留修改');assert.equal(c.getSnapshot().session.turns.length,1);assert.equal(original.turns.length,3);}
});
test('editing at 100 rounds and Unicode title boundaries remain valid',async()=>{
 const s={...api.newChat(),title:'a'.repeat(33)+'🙂abc',turns:Array.from({length:100},(_,i)=>turn(i))};const c=new api.ChatController(async s=>{api.parseChat(s);return true;},async()=> '新回答');c.open(s);await c.answerEdited(s.turns[0].id,'改第一问',{personaName:'默认助手'});assert.equal(c.getSnapshot().session.turns.length,1);assert.equal(c.getSnapshot().session.title,'a'.repeat(33)+' · 编辑');assert.equal(c.getSnapshot().unsaved,false);
});

test('failed sends expose an explicit retry, never retry automatically and prevent a double retry',async()=>{
 const finish=deferred();let calls=0;const c=new api.ChatController(async()=>true,async()=>{if(++calls===1)throw new Error('offline');return finish.promise;});c.edit({draft:'需要重试'});await c.send({personaName:'默认助手'});await tick();assert.equal(calls,1);assert.equal(c.getSnapshot().retry,'send');assert.equal(c.getSnapshot().session.draft,'需要重试');
 const pending=c.retry({personaName:'默认助手'});await tick();await c.retry({personaName:'默认助手'});assert.equal(calls,2);finish.resolve('成功回答');await pending;assert.equal(c.getSnapshot().session.turns.length,1);assert.equal(c.getSnapshot().retry,null);
});
test('regeneration retry keeps original question, preceding context and unsent draft; editing draft clears retry',async()=>{
 const s={...api.newChat(),turns:[turn(1),turn(2)],draft:'不要发这个草稿'};let calls=0;const requests=[];const c=new api.ChatController(async()=>true,async r=>{requests.push(plain(r));if(++calls===1)throw new Error('offline');return 'new';});c.open(s);await c.regenerate({personaName:'默认助手'});assert.equal(c.getSnapshot().retry,'regenerate');assert.equal(c.getSnapshot().session.turns[1].answer,s.turns[1].answer);await c.retry({personaName:'默认助手'});assert.equal(requests[1].prompt,s.turns[1].question);assert.equal(requests[1].history.length,2);assert.equal(c.getSnapshot().session.draft,s.draft);
 const d=new api.ChatController(async()=>true,async()=>{throw new Error('offline');});d.edit({draft:'old'});await d.send({personaName:'默认助手'});d.edit({draft:'new'});assert.equal(d.getSnapshot().retry,null);
});
test('edited preflight failures never retry a different original draft, while a reserved branch can retry its edited question',async()=>{
 const original={...api.newChat(),turns:[turn(1)],draft:'原草稿'};let calls=0;const blocked=new api.ChatController(async s=>{if(s.id!==original.id)throw new Error('full');return true;},async()=>{calls++;return 'wrong';});blocked.open(original);await blocked.answerEdited(original.turns[0].id,'修改的问题',{personaName:'默认助手'});assert.equal(blocked.getSnapshot().retry,null);await blocked.retry({personaName:'默认助手'});assert.equal(calls,0);assert.equal(blocked.getSnapshot().session.draft,'原草稿');
 const requests=[];const branch=new api.ChatController(async()=>true,async r=>{requests.push(plain(r));if(requests.length===1)throw new Error('offline');return '新回答';});branch.open(original);await branch.answerEdited(original.turns[0].id,'修改的问题',{personaName:'默认助手'});const id=branch.getSnapshot().session.id;assert.notEqual(id,original.id);await branch.retry({personaName:'默认助手'});assert.equal(branch.getSnapshot().session.id,id);assert.equal(requests[1].prompt,'修改的问题');assert.equal(original.draft,'原草稿');
});
test('guarded async open rejects stale results after a newer draft, session switch or active request',async()=>{
 const c=new api.ChatController(async()=>true,async()=> 'answer'),original=c.getSnapshot().session;c.edit({draft:'新草稿'});assert.equal(c.open(api.newChat(),original),false);assert.equal(c.getSnapshot().session.draft,'新草稿');const current=c.getSnapshot().session;assert.equal(c.open(api.newChat(),current),true);assert.equal(c.open(api.newChat(),current),false);
 const finish=deferred(),d=new api.ChatController(async()=>true,async()=>finish.promise);d.edit({draft:'问'});const snapshot=d.getSnapshot().session,pending=d.send({personaName:'默认助手'});await tick();assert.equal(d.open(api.newChat(),snapshot),false);d.cancel();finish.resolve('迟到');await pending;assert.equal(d.getSnapshot().session.draft,'问');
});
test('answer persistence failures offer local save only, and cancellation never exposes an AI retry',async()=>{
 let writes=0,calls=0;const c=new api.ChatController(async()=>{if(++writes===2)throw new Error('disk');return true;},async()=>{calls++;return '成功但未保存';});c.edit({draft:'问题'});await c.send({personaName:'默认助手'});assert.equal(c.getSnapshot().retry,null);await c.retry({personaName:'默认助手'});await c.retrySave();assert.equal(calls,1);assert.equal(c.getSnapshot().unsaved,false);
 const finish=deferred(),d=new api.ChatController(async()=>true,async()=>finish.promise);d.edit({draft:'取消'});const pending=d.send({personaName:'默认助手'});await tick();d.cancel();finish.reject(new Error('late'));await pending;assert.equal(d.getSnapshot().retry,null);d.dismissNotice();assert.equal(d.getSnapshot().notice,'');assert.equal(d.getSnapshot().session.draft,'取消');
});
