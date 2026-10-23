import { parseChat, type ChatSession } from './chat';
export type SyncBase = Record<string,string>;
const stable = (value:unknown):unknown => Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([key,item])=>[key,stable(item)])):value;
const canonical = (s:ChatSession) => JSON.stringify(stable(parseChat(s)));
export async function mergeSync(local:ChatSession[],remote:ChatSession[],base:SyncBase,digest:(s:string)=>Promise<string>) {
  if(local.length>50||remote.length>50||new Set(local.map(s=>s.id)).size!==local.length||new Set(remote.map(s=>s.id)).size!==remote.length)throw new Error('同步会话列表格式异常');
  const all=new Map(local.map(s=>[s.id,parseChat(s)])), hashes:SyncBase={}, conflicts:string[]=[];
  for(const incoming of remote){parseChat(incoming);const current=all.get(incoming.id);if(!current){all.set(incoming.id,incoming);continue;}
    const [lh,rh]=await Promise.all([digest(canonical(current)),digest(canonical(incoming))]);
    if(lh===rh)continue;
    if(base[incoming.id]===lh){all.set(incoming.id,incoming);continue;}
    if(base[incoming.id]===rh)continue;
    // Neither side is a known unchanged base: retain both; no clock-based data loss.
    const id='chat-conflict-'+rh;const existing=all.get(id);
    const fork={...incoming,id,title:incoming.title.slice(0,33).replace(/[\uD800-\uDBFF]$/,'')+' · 同步副本',...(incoming.parent?.sessionId===id?{parent:undefined}:{})};
    if(!existing) {all.set(id,parseChat(fork));conflicts.push(id);}
    else if(canonical(existing)!==canonical(fork))throw new Error('同步副本发生冲突，请先导出备份后整理');
  }
  const sessions=[...all.values()].sort((a,b)=>b.updatedAt-a.updatedAt||a.id.localeCompare(b.id));
  if(sessions.length>50)throw new Error('合并后超过 50 个会话，请先备份并整理；未修改本机或云端');
  for(const session of sessions)hashes[session.id]=await digest(canonical(session));
  return {sessions,hashes,conflicts};
}
