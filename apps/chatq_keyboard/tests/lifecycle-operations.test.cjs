const {test}=require('node:test'),assert=require('node:assert/strict');
const {mount,deferred}=require('./component-harness.cjs');
const panel=name=>require.resolve('../src/components/'+name+'.tsx');
function backup(bridge,migrate=async()=>{},favorites=async()=>{}){return mount(panel('BackupPanel'),'BackupPanel',{'../../modules/chatq-keyboard':{keyboardBridge:bridge},'../services/storage':{migrateHistory:migrate},'../services/favorites':{loadTopicFavorites:favorites}});}
const type=(h,label,value)=>{h.find(label).props.onChangeText(value);h.render();};
test('leaving backup during preparation never opens a file chooser afterward',async()=>{
 for(const stage of ['migration','favorites'])for(const kind of ['export','inspect']) {
  const late=deferred();let files=0;const h=backup({exportBackup:async()=>{files++;return '';},inspectBackup:async()=>{files++;return '';},cancelBackup:async()=>{}},stage==='migration'?()=>late.promise:async()=>{},stage==='favorites'?()=>late.promise:async()=>{});
  type(h,'备份密码','local-test-password');type(h,'确认备份密码','local-test-password');h.find(kind==='export'?'导出加密备份':'选择备份并预览').props.onPress();await h.settle();h.unmount();late.resolve();await h.settle();assert.equal(files,0,stage+' / '+kind);
 }
});
test('an old backup restore confirmation cannot apply after leaving the panel',async()=>{
 let applies=0;const h=backup({exportBackup:async()=>'',inspectBackup:async()=>JSON.stringify({createdAt:1,records:1,settings:1}),applyBackup:async()=>{applies++;return 1;},cancelBackup:async()=>{}});
 type(h,'备份密码','local-test-password');await h.press('选择备份并预览');await h.press('合并恢复到本机');const confirm=h.alerts.at(-1)[2].find(b=>b.text==='合并恢复');h.unmount();confirm.onPress();await h.settle();assert.equal(applies,0);
});
test('leaving update center during version or connection read prevents a later network check',async()=>{
 for(const stage of ['version','connection']) {
  const late=deferred();let checks=0;const current={version:'fixture',versionCode:31};const h=mount(panel('UpdatePanel'),'UpdatePanel',{'../../modules/chatq-keyboard':{keyboardBridge:{getInstalledVersion:()=>stage==='version'?late.promise:Promise.resolve(current),checkForUpdate:async()=>{checks++;return JSON.stringify({versionCode:31});},cancelUpdate:async()=>{}}},'../services/api':{loadConnection:()=>stage==='connection'?late.promise:Promise.resolve({baseUrl:'http://localhost'})}});
  await h.settle();h.find('检查新版本').props.onPress();await h.settle();h.unmount();late.resolve(stage==='version'?current:{baseUrl:'http://localhost'});await h.settle();assert.equal(checks,0,stage);
 }
});
