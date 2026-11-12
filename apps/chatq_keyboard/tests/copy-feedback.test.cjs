const {test}=require('node:test'),assert=require('node:assert/strict');
const {mount}=require('./component-harness.cjs');
test('clipboard failure stays retryable and never displays copied success or private errors',async()=>{
 let fail=true,writes=0;
 const h=mount(require.resolve('../src/components/Ui.tsx'),'CopyAction',{'@react-native-clipboard/clipboard':{default:{setString(){writes++;if(fail)throw Error('private clipboard diagnostic');}}}},{text:'合成回复',label:'复制回复'});
 await assert.doesNotReject(h.press('复制回复'));
 assert.match(h.text(),/复制失败/);assert.doesNotMatch(h.text(),/private clipboard|已复制/);
 fail=false;await h.press('复制回复');assert.equal(writes,2);assert.match(h.text(),/已复制/);assert.doesNotMatch(h.text(),/复制失败/);
 h.tick();await h.settle();assert.doesNotMatch(h.text(),/已复制/);h.unmount();
});
