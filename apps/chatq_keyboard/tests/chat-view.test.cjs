const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const api={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/services/chatView.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:api});
const turns=[{id:'a',question:'First question🙂 .* [a]',answer:'完整回答 Alpha'},{id:'b',question:'第二个问题',answer:'Beta 后续回答'}];
const session={turns,draft:'private-draft-only',background:'background-only',personaId:'',title:'新对话'};
test('within-chat find matches full questions/answers literally, ignoring case without uploading draft or background',()=>{
 for(const query of [' FIRST ','.* [a]','🙂','alpha'])assert.equal(api.findChatTurns(session,query)[0].id,'a');
 assert.equal(api.findChatTurns(session,'BETA')[0].id,'b');assert.equal(api.findChatTurns(session,'.*')[0].id,'a');
 assert.equal(api.findChatTurns(session,'private-draft-only').length,0);assert.equal(api.findChatTurns(session,'background-only').length,0);assert.equal(api.findChatTurns(session,'[no match]').length,0);assert.equal(api.findChatTurns(session,' ').length,2);assert.equal(turns.length,2);
});
test('highlighting preserves every character and bounds native view count for long repeated answers',()=>{
 for(const [text,query] of [['A .* [x] 🙂 a','.* [x]'],['Alpha ALPHA alpha','alpha'],['<img src="remote">','<img'],['i İ I ı','i'],['🙂🙂🙂','🙂']]){
  const parts=api.chatHighlights(text,query);assert.equal(parts.map(p=>p.text).join(''),text);assert.ok(parts.some(p=>p.match));
 }
 const repeated='a'.repeat(10000),parts=api.chatHighlights(repeated,'a');assert.equal(parts.map(p=>p.text).join(''),repeated);assert.ok(parts.length<=162);assert.equal(api.chatHighlights('literal','[').map(p=>p.text).join(''),'literal');
});
test('temporary navigation guard includes draft, answers and customized empty sessions but not an untouched blank session',()=>{
 assert.equal(api.hasTemporaryChat({...session,turns:[],draft:'',background:''},true),false);
 for(const patch of [{draft:'draft'},{turns},{background:'context'},{title:'my title'},{personaId:'card'}]){
  const s={...session,turns:[],draft:'',background:'',...patch};assert.equal(api.hasTemporaryChat(s,true),true);assert.equal(api.hasTemporaryChat(s,false),false);
 }
});
