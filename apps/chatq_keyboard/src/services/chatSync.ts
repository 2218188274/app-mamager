import AsyncStorage from '@react-native-async-storage/async-storage';
import { keyboardBridge } from '../../modules/chatq-keyboard';
import { getApiConfig,syncRequest } from './api';
import { parseChat,type ChatSession } from './chat';
import { allChats,mergeSyncedChats } from './chatStore';
import { mergeSync,type SyncBase } from './chatSyncMerge';

function bridge(){if(!keyboardBridge?.createSyncCode||!keyboardBridge.syncCredentials||!keyboardBridge.loadSyncCode||!keyboardBridge.saveSyncCode||!keyboardBridge.encryptSync||!keyboardBridge.decryptSync||!keyboardBridge.syncFingerprint||!keyboardBridge.forgetSyncCode)throw new Error('当前平台暂不支持加密同步，请使用新版安卓应用');return keyboardBridge as Required<Pick<NonNullable<typeof keyboardBridge>,'createSyncCode'|'syncCredentials'|'loadSyncCode'|'saveSyncCode'|'encryptSync'|'decryptSync'|'syncFingerprint'|'forgetSyncCode'>>;}
function scope(){const c=getApiConfig();if(!c?.apiKey)throw new Error('请先连接服务器');return c.baseUrl+'|'+c.apiKey;}
function baseKey(space:string){return 'chatq.syncBase.v1.'+space;}
function payload(rows:ChatSession[]){return JSON.stringify({format:'chatq-conversation-sync',version:1,sessions:rows.map(parseChat)});}
function unpack(value:string):ChatSession[]{const p=JSON.parse(value);if(!p||Object.keys(p).sort().join(',')!=='format,sessions,version'||p.format!=='chatq-conversation-sync'||p.version!==1||!Array.isArray(p.sessions)||p.sessions.length>50)throw new Error('云端会话格式异常，未修改本机');return p.sessions.map(parseChat);}
export async function savedSyncCode(){return bridge().loadSyncCode(scope());}
export async function createSyncSpace(){const b=bridge(),code=await b.createSyncCode(),credentials=JSON.parse(await b.syncCredentials(code));await syncRequest('create',{...credentials,blob:await b.encryptSync(payload([]),code)});await b.saveSyncCode(code,scope());return code;}
export async function connectSyncSpace(value:string){const code=value.trim(),b=bridge(),credentials=JSON.parse(await b.syncCredentials(code));const row=await syncRequest<{blob:string;revision:number}>('read',credentials);const sessions=unpack(await b.decryptSync(row.blob,code));await b.saveSyncCode(code,scope());return {code,count:sessions.length};}
let running=false;
export async function synchronizeChats(){
  if(running)throw new Error('已有同步正在进行');running=true;
  try{
    const b=bridge(),code=await b.loadSyncCode(scope());if(!code)throw new Error('请先创建或连接同步空间');
    if(keyboardBridge?.getHistoryEnabled&&!await keyboardBridge.getHistoryEnabled())throw new Error('请先开启本机记录保存');
    const credentials=JSON.parse(await b.syncCredentials(code)),row=await syncRequest<{blob:string;revision:number}>('read',credentials);
    const remote=unpack(await b.decryptSync(row.blob,code)),local=await allChats(),key=baseKey(await b.syncFingerprint(scope())+'.'+credentials.spaceId);
    let base:SyncBase={};try{const value=JSON.parse(await AsyncStorage.getItem(key)||'{}');if(value&&typeof value==='object'&&!Array.isArray(value)&&Object.values(value).every(v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v)))base=value;}catch{/* No trustworthy base: keep conflicts as copies. */}
    const merged=await mergeSync(local,remote,base,s=>b.syncFingerprint(s));
    const blob=await b.encryptSync(payload(merged.sessions),code);
    // Commit remote with compare-and-swap first. A failed local merge is safe to retry.
    await syncRequest('write',{...credentials,revision:row.revision,blob});
    await mergeSyncedChats(local,merged.sessions);
    await AsyncStorage.setItem(key,JSON.stringify(merged.hashes));
    return {count:merged.sessions.length,conflicts:merged.conflicts.length};
  }finally{running=false;}
}
export async function disconnectSync(){if(running)throw new Error('请等待同步结束');await bridge().forgetSyncCode();}
