const {test}=require('node:test');
const assert=require('node:assert/strict');
const {mount,deferred}=require('./component-harness.cjs');
const row={text:'合成常用句',label:'合成风格',savedAt:1};
function panel(store){return mount(require.resolve('../src/components/ReplyCards.tsx'),'SavedRepliesPanel',{
  './ExpressionPanel':{ExpressionPicker:'ExpressionPicker'},'../services/expressions':{},'../services/replyCards':{},'../services/savedReplies':store,
});}
test('late foreground read cannot resurrect a removed saved reply',async()=>{
  const stale=deferred();let reads=0;
  const h=panel({loadSavedReplies:()=>++reads===1?Promise.resolve([row]):stale.promise,setSavedReply:async()=>[]});
  await h.settle();h.event('change','active');await h.press('移除常用句：'+row.text);
  stale.resolve([row]);await h.settle();assert.equal(h.find('移除常用句：'+row.text),undefined);h.unmount();
});
test('rapid remove taps perform one storage mutation',async()=>{
  const wait=deferred();let writes=0;
  const h=panel({loadSavedReplies:async()=>[row],setSavedReply:()=>{writes++;return wait.promise;}});
  await h.settle();const remove=h.find('移除常用句：'+row.text).props.onPress;remove();remove();assert.equal(writes,1);
  wait.resolve([]);await h.settle();h.unmount();
});
test('saved reply read failure offers an explicit working retry',async()=>{
  let fail=true;const h=panel({loadSavedReplies:async()=>{if(fail)throw Error('storage');return [row];}});
  await h.settle();assert.ok(h.find('重试读取常用句'));fail=false;await h.press('重试读取常用句');assert.ok(h.find('移除常用句：'+row.text));assert.equal(h.find('重试读取常用句'),undefined);h.unmount();
});
test('unresolved initial read does not pretend the saved collection is empty',async()=>{
  const read=deferred();const h=panel({loadSavedReplies:()=>read.promise});
  assert.equal(h.nodes().some(n=>n.type==='EmptyState'),false);assert.match(h.text(),/正在读取常用句/);
  read.resolve([]);await h.settle();assert.ok(h.nodes().find(n=>n.type==='EmptyState'));h.unmount();
});
