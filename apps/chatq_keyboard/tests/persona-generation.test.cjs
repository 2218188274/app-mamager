const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const {mount,deferred}=require('./component-harness.cjs');
const card={name:'礼貌有界',instructions:'礼貌简短，明确边界，不随便承诺。',example:'收到，我确认后再回复你。',length:'short',category:'work'};
function service(sendChat){const exports={};const source=ts.transpileModule(fs.readFileSync(require.resolve('../src/services/personaGeneration.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;vm.runInNewContext(source,{exports,require:()=>({sendChat}),Error,Date,JSON,Math});return exports;}
function generator(generatePersona,onGenerated=()=>{},onClose=()=>{}){return mount(require.resolve('../src/components/PersonaGenerator.tsx'),'PersonaGenerator',{'../services/personaGeneration':{generatePersona}},{onGenerated,onClose});}
const type=(h,text)=>{h.find('AI 人设需求').props.onChangeText(text);h.render();};
test('AI persona sends only explicit requirements and returns an unsaved local draft',async()=>{
 let request;const api=service(async r=>{request=r;return JSON.stringify({...card,id:'remote-id',pinned:true,tagWeights:{fake:0.9}});});
 const result=await api.generatePersona('  职场礼貌简短  ',new AbortController().signal);
 assert.deepEqual(Array.from(request.history),[]);assert.equal(request.context,'');assert.match(request.prompt,/职场礼貌简短/);assert.match(result.id,/^ai-/);assert.notEqual(result.id,'remote-id');assert.deepEqual(Object.keys(result.tagWeights),[]);assert.equal(result.pinned,undefined);assert.equal(result.name,card.name);
});
test('persona parser accepts a JSON fence but rejects malformed, oversized or invalid fields',()=>{
 const api=service();assert.equal(api.parseGeneratedPersona('```json\n'+JSON.stringify(card)+'\n```').name,card.name);
 for(const value of ['not JSON','[]','null',JSON.stringify({...card,name:'X'.repeat(21)}),JSON.stringify({...card,instructions:''}),JSON.stringify({...card,example:5}),JSON.stringify({...card,length:'huge'}),JSON.stringify({...card,category:'unknown'})])assert.throws(()=>api.parseGeneratedPersona(value),/格式不完整/);
});
test('empty and overlong persona requirements never reach AI; late cancelled reply is discarded',async()=>{
 let calls=0;const late=deferred(),api=service(async()=>{calls++;return late.promise;});
 await assert.rejects(api.generatePersona(' ',new AbortController().signal),/1–800/);await assert.rejects(api.generatePersona('x'.repeat(801),new AbortController().signal),/1–800/);assert.equal(calls,0);
 const controller=new AbortController(),pending=api.generatePersona('礼貌',controller.signal);controller.abort();late.resolve(JSON.stringify(card));await assert.rejects(pending,e=>e.name==='AbortError');assert.equal(calls,1);
});
test('rapid persona generate taps make one request and stop prevents late draft navigation',async()=>{
 const late=deferred();let calls=0,signal,selected=0;const h=generator((_,s)=>{calls++;signal=s;return late.promise;},()=>selected++);type(h,'礼貌简短');
 const start=h.find('生成人设草稿').props.onPress;start();start();h.render();assert.equal(calls,1);await h.press('停止生成');assert.equal(signal.aborted,true);late.resolve(card);await h.settle();assert.equal(selected,0);assert.match(h.text(),/已停止/);h.unmount();
});
test('persona errors are visible without auto retry; returning or unmounting cancels work',async()=>{
 let calls=0;const h=generator(async()=>{calls++;throw Error('今日额度已用完');});type(h,'温柔');await h.press('生成人设草稿');assert.match(h.text(),/今日额度已用完/);assert.equal(calls,1);h.unmount();
 for(const close of ['返回人设中心','unmount']){let signal,selected=0;const late=deferred(),g=generator((_,s)=>{signal=s;return late.promise;},()=>selected++);type(g,'自然');g.find('生成人设草稿').props.onPress();g.render();if(close==='unmount')g.unmount();else await g.press(close);assert.equal(signal.aborted,true);late.resolve(card);await g.settle();assert.equal(selected,0);g.unmount();}
});


test('system back aborts persona generation and preserves the parent requirements draft',async()=>{
 let kept='',closed=0,signal,selected=0;const late=deferred();
 const h=mount(require.resolve('../src/components/PersonaGenerator.tsx'),'PersonaGenerator',{'../services/personaGeneration':{generatePersona:(_,s)=>{signal=s;return late.promise;}}},{initialRequirements:'礼貌简短',onRequirementsChange:text=>kept=text,onClose:()=>closed++,onGenerated:()=>selected++});
 assert.equal(h.find('AI 人设需求').props.value,'礼貌简短');type(h,'职场有边界');assert.equal(kept,'职场有边界');h.find('生成人设草稿').props.onPress();h.render();assert.equal(h.event('hardwareBackPress'),true);assert.equal(signal.aborted,true);assert.equal(closed,1);late.resolve(card);await h.settle();assert.equal(selected,0);h.unmount();
});

test('generated persona preview returns to editable requirements without saving or regenerating',async()=>{
 let saves=0;const state={data:{cards:[],relations:[],scenes:[]},selection:{cardId:''}};
 const h=mount(require.resolve('../src/components/PersonaPanel.tsx'),'PersonaPanel',{
  './PersonaGenerator':{PersonaGenerator:'PersonaGenerator'},
  './ConversationProfiles':{ConversationProfiles:'ConversationProfiles'},'../services/persona':{quickPersonas:()=>[],starterPersonas:[],personaCategories:[{id:'all',name:'全部'},{id:'work',name:'职场'}],savePersonaData:async()=>{saves++;}},
 },{state,catalog:null,onChange(){},refresh:async()=>{},resetScroll(){}});
 await h.press('AI 帮我创建人设');let child=h.nodes().find(n=>n.type==='PersonaGenerator');child.props.onRequirementsChange('职场简短');h.render();child=h.nodes().find(n=>n.type==='PersonaGenerator');child.props.onGenerated({...card,id:'ai-local',tagWeights:{}});h.render();
 assert.ok(h.find('保存并使用'));assert.ok(h.find('返回修改需求'));assert.equal(h.find('人设分类'),undefined);assert.equal(h.find('更多人设设置').props.accessibilityState.expanded,false);
 await h.press('更多人设设置');assert.equal(h.find('更多人设设置').props.accessibilityState.expanded,true);
 assert.equal(h.event('hardwareBackPress'),true);h.render();child=h.nodes().find(n=>n.type==='PersonaGenerator');assert.equal(child.props.initialRequirements,'职场简短');assert.equal(saves,0);child.props.onClose();h.render();await h.press('＋ 自定义人设');assert.ok(h.find('取消编辑'));await h.press('取消编辑');assert.equal(h.nodes().some(n=>n.type==='PersonaGenerator'),false);h.unmount();
});
