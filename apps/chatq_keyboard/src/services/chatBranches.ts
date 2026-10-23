import type { ChatSession } from './chat';
export type BranchNode = Pick<ChatSession,'id'|'title'|'parent'>;
export type BranchRow<T extends BranchNode = ChatSession> = { session:T;depth:number;detached:boolean };
export function branchRows<T extends BranchNode>(sessions: T[]): BranchRow<T>[] {
  const ids = new Set(sessions.map(s=>s.id)), children = new Map<string,T[]>(), rows:BranchRow<T>[] = [], seen = new Set<string>();
  for (const s of sessions) if (s.parent && ids.has(s.parent.sessionId)) { const list = children.get(s.parent.sessionId) || []; list.push(s); children.set(s.parent.sessionId,list); }
  const add = (s:T,depth:number) => { if (seen.has(s.id)) return; seen.add(s.id); rows.push({session:s,depth:Math.min(depth,5),detached:!!s.parent&&!ids.has(s.parent.sessionId)}); for(const child of children.get(s.id)||[])add(child,depth+1); };
  sessions.filter(s=>!s.parent||!ids.has(s.parent.sessionId)).forEach(s=>add(s,0));
  sessions.forEach(s=>add(s,0)); return rows;
}
