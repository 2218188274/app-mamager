import AsyncStorage from '@react-native-async-storage/async-storage';
import { keyboardBridge } from '../../modules/chatq-keyboard';
import { getApiConfig,syncRequest } from './api';
import { parseChat,type ChatSession } from './chat';
import { allChats,mergeSyncedChats } from './chatStore';
import { mergeSync,type SyncBase } from './chatSyncMerge';

function bridge(){if(!keyboardBridge?.createSyncCode||!keyboardBridge.syncCredentials||!keyboardBridge.loadSyncCode||!keyboardBridge.saveSyncCode||!keyboardBridge.encryptSync||!keyboardBridge.decryptSync||!keyboardBridge.syncFingerprint||!keyboardBridge.forgetSyncCode)throw new Error('当前平台暂不支持加密同步，请使用新版安卓应用');return keyboardBridge as Required<Pick<NonNullable<typeof keyboardBridge>,'createSyncCode'|'syncCredentials'|'loadSyncCode'|'saveSyncCode'|'encryptSync'|'decryptSync'|'syncFingerprint'|'forgetSyncCode'>>;}
function operation() {
  const connection=getApiConfig();if(!connection?.apiKey)throw new Error('请先连接服务器');
  const identity=JSON.stringify([connection.baseUrl,connection.apiKey,connection.deviceId]);
  const current=()=>{const c=getApiConfig();if(!c||JSON.stringify([c.baseUrl,c.apiKey,c.deviceId])!==identity)throw new Error('服务器连接已变化，同步已停止；请确认连接后重试');};
  return {scope:connection.baseUrl+'|'+connection.apiKey,current,async run<T>(work:()=>Promise<T>):Promise<T>{current();const result=await work();current();return result;}};
}
function baseKey(space:string){return 'chatq.syncBase.v1.'+space;}
function payload(rows:ChatSession[]){return JSON.stringify({format:'chatq-conversation-sync',version:1,sessions:rows.map(parseChat)});}
function unpack(value:string):ChatSession[]{const p=JSON.parse(value);if(!p||Object.keys(p).sort().join(',')!=='format,sessions,version'||p.format!=='chatq-conversation-sync'||p.version!==1||!Array.isArray(p.sessions)||p.sessions.length>50)throw new Error('云端会话格式异常，未修改本机');return p.sessions.map(parseChat);}
let running=false;
async function exclusive<T>(work:()=>Promise<T>):Promise<T>{
  if(running)throw new Error('已有同步正在进行');running=true;
  try{return await work();}finally{running=false;}
}
export async function savedSyncCode(){const b=bridge(),op=operation();return op.run(()=>b.loadSyncCode(op.scope));}
export function createSyncSpace(){return exclusive(async()=>{
  const b=bridge(),op=operation(),code=await op.run(()=>b.createSyncCode()),credentials=JSON.parse(await op.run(()=>b.syncCredentials(code)));
  const blob=await op.run(()=>b.encryptSync(payload([]),code));
  await op.run(()=>syncRequest('create',{...credentials,blob}));await op.run(()=>b.saveSyncCode(code,op.scope));return code;
});}
export function connectSyncSpace(value:string){return exclusive(async()=>{
  const code=value.trim(),b=bridge(),op=operation(),credentials=JSON.parse(await op.run(()=>b.syncCredentials(code)));
  const row=await op.run(()=>syncRequest<{blob:string;revision:number}>('read',credentials));
  const sessions=unpack(await op.run(()=>b.decryptSync(row.blob,code)));
  await op.run(()=>b.saveSyncCode(code,op.scope));return {code,count:sessions.length};
});}
export function synchronizeChats(){return exclusive(async()=>{
    const b=bridge(),op=operation(),code=await op.run(()=>b.loadSyncCode(op.scope));if(!code)throw new Error('请先创建或连接同步空间');
    if(keyboardBridge?.getHistoryEnabled&&!await op.run(()=>keyboardBridge!.getHistoryEnabled!()))throw new Error('请先开启本机记录保存');
    const credentials=JSON.parse(await op.run(()=>b.syncCredentials(code))),row=await op.run(()=>syncRequest<{blob:string;revision:number}>('read',credentials));
    const remote=unpack(await op.run(()=>b.decryptSync(row.blob,code))),local=await op.run(()=>allChats()),key=baseKey(await op.run(()=>b.syncFingerprint(op.scope))+'.'+credentials.spaceId);
    let base:SyncBase={};try{const value=JSON.parse(await op.run(()=>AsyncStorage.getItem(key))||'{}');if(value&&typeof value==='object'&&!Array.isArray(value)&&Object.values(value).every(v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v)))base=value;}catch{/* No trustworthy base: keep conflicts as copies. */}
    const merged=await op.run(()=>mergeSync(local,remote,base,s=>b.syncFingerprint(s)));
    const blob=await op.run(()=>b.encryptSync(payload(merged.sessions),code));
    // Commit remote with compare-and-swap first. A failed local merge is safe to retry.
    await op.run(()=>syncRequest('write',{...credentials,revision:row.revision,blob}));
    await op.run(()=>mergeSyncedChats(local,merged.sessions));
    await op.run(()=>AsyncStorage.setItem(key,JSON.stringify(merged.hashes)));
    return {count:merged.sessions.length,conflicts:merged.conflicts.length};
});}
export function disconnectSync(){return exclusive(async()=>{const b=bridge(),op=operation();await op.run(()=>b.forgetSyncCode());});}
export type SyncCapacity={spaceId:string;revision:number;sizeBytes:number;maxBytes:number;updatedAt:string};
export function syncCapacity(){return exclusive(async()=>{const b=bridge(),op=operation(),code=await op.run(()=>b.loadSyncCode(op.scope));if(!code)throw new Error('请先连接同步空间');const credentials=JSON.parse(await op.run(()=>b.syncCredentials(code)));const capacity=await op.run(()=>syncRequest<Omit<SyncCapacity,'spaceId'>>('stats',credentials));return {...capacity,spaceId:credentials.spaceId};});}
export function deleteSyncSpace(revision:number,expectedSpaceId:string){return exclusive(async()=>{const b=bridge(),op=operation(),code=await op.run(()=>b.loadSyncCode(op.scope));if(!code)throw new Error('请先连接同步空间');const credentials=JSON.parse(await op.run(()=>b.syncCredentials(code)));if(!expectedSpaceId||credentials.spaceId!==expectedSpaceId)throw new Error('同步空间已更换，请刷新容量后重新确认删除');const result=await op.run(()=>syncRequest<{deleted:boolean}>('remove',{...credentials,revision,confirmation:'删除云端'}));if(result.deleted!==true)throw new Error('服务器未确认删除，本机连接已保留');let localCleared=true;try{await op.run(()=>b.forgetSyncCode());}catch{localCleared=false;}return {deleted:true,localCleared};});}
