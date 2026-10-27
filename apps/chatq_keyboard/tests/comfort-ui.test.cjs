const {test}=require('node:test');
const assert=require('node:assert/strict');
const {mount,deferred}=require('./component-harness.cjs');
const panel=name=>require.resolve('../src/components/'+name+'.tsx');
function expressions(bridge){return mount(panel('ExpressionPanel'),'ExpressionPanel',{
  '../../modules/chatq-keyboard':{keyboardBridge:bridge},
  'react-native-safe-area-context':{SafeAreaView:'SafeAreaView'},
  '@react-native-clipboard/clipboard':{default:{setString(){}}},
  '../services/expressions':{expressionGroups:[],findExpressions:()=>[]},
  './PersonaPanel':{Choices:'Choices'},
  ...Object.fromEntries(['hello','hug','thanks'].map(id=>['../../modules/chatq-keyboard/android/src/main/assets/stickers/'+id+'.png',id])),
});}
test('rapid explicit share taps open only one Android chooser',async()=>{
  let calls=0;const wait=deferred();const h=expressions({shareSticker:()=>{calls++;return wait.promise;}});
  h.nodes().find(n=>n.props.label==='表情类型').props.onChange('stickers');h.render();
  await h.press('预览表情：嗨，你好');const share=h.find('分享图片表情').props.onPress;
  share();share();assert.equal(calls,1);wait.resolve();await h.settle();h.unmount();
});
test('late initial favorite read cannot overwrite a successful favorite change',async()=>{
  const late=deferred();let reads=0;const card={text:'合成测试回复',label:'测试',versions:[]};
  const h=mount(panel('ReplyCards'),'ReplyCards',{
    './ExpressionPanel':{ExpressionPicker:'ExpressionPicker'},'../services/expressions':{appendExpression:(a,b)=>a+' '+b},
    '../services/replyCards':{refinementLabels:{shorter:'更简短'},refinementNotes:{shorter:'减少赘述'}},'../services/savedReplies':{loadSavedReplies:()=>++reads===1?late.promise:Promise.resolve([]),setSavedReply:async()=>[{text:card.text,label:card.label,savedAt:1}]},
  },{cards:[card],busy:false,onRefine(){},onRestore(){}});
  await h.press('收藏');late.resolve([]);await h.settle();assert.ok(h.find('已收藏'));h.unmount();
});
test('favorite read failure is visible and offers a retry',async()=>{
  const card={text:'合成测试回复',label:'测试',versions:[]};let fail=true;
  const h=mount(panel('ReplyCards'),'ReplyCards',{
    './ExpressionPanel':{ExpressionPicker:'ExpressionPicker'},'../services/expressions':{},'../services/replyCards':{refinementLabels:{shorter:'更简短'},refinementNotes:{shorter:'减少赘述'}},
    '../services/savedReplies':{loadSavedReplies:async()=>{if(fail)throw Error('offline');return [{text:card.text}];}},
  },{cards:[card],busy:false,onRefine(){},onRestore(){}});
  await h.settle();assert.ok(h.find('重试读取收藏'));fail=false;await h.press('重试读取收藏');assert.ok(h.find('已收藏'));h.unmount();
});

test('returning from keyboard refreshes changed favorites without replacing reply cards',async()=>{
 const card={text:'合成测试回复',label:'测试',versions:[]};let rows=[],changes=[];
 const h=mount(panel('ReplyCards'),'ReplyCards',{'./ExpressionPanel':{ExpressionPicker:'ExpressionPicker'},'../services/expressions':{},'../services/replyCards':{refinementLabels:{shorter:'更简短'},refinementNotes:{}},'../services/savedReplies':{loadSavedReplies:async()=>rows,setSavedReply:async(text,label,saved)=>{changes.push(saved);rows=saved?[{text,label}]:[];return rows;}}},{cards:[card],busy:false,onRefine(){},onRestore(){}});
 await h.settle();assert.ok(h.find('收藏'));h.event('change','background');rows=[{text:card.text}];h.event('change','active');await h.settle();assert.ok(h.find('已收藏'));await h.press('已收藏');assert.deepEqual(changes,[false]);h.unmount();
});
