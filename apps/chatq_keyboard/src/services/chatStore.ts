import { chatMatch } from './chatSearch';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { keyboardBridge } from '../../modules/chatq-keyboard';
import { parseChat, type ChatSession, type ChatSummary } from './chat';
const KEY = 'chatq.aiConversations.v1';
let mutations: Promise<unknown> = Promise.resolve();
function mutate<T>(work: () => Promise<T>): Promise<T> { const next = mutations.catch(() => {}).then(work); mutations = next; return next; }
async function fallback(): Promise<ChatSession[]> { const value = JSON.parse(await AsyncStorage.getItem(KEY) || '[]'); if (!Array.isArray(value) || value.length > 50) throw new Error('本机会话列表格式异常'); return value.map(parseChat); }
export async function listChats(query = ''): Promise<ChatSummary[]> {
  await mutations.catch(() => {});
  if (keyboardBridge?.searchChats) return JSON.parse(await keyboardBridge.searchChats(query.trim().slice(0, 200)));
  if (keyboardBridge?.listChats && !query.trim()) return JSON.parse(await keyboardBridge.listChats());
  if (keyboardBridge?.listChats && keyboardBridge.getChat) { const rows: ChatSummary[] = JSON.parse(await keyboardBridge.listChats()); const all = await Promise.all(rows.map(s => getChat(s.id))); return all.map(s => chatMatch(s, query)).filter((s): s is ChatSummary => !!s); }
  return (await fallback()).sort((a, b) => b.updatedAt - a.updatedAt).map(s => chatMatch(s, query)).filter((s): s is ChatSummary => !!s);
}
export async function getChat(id: string): Promise<ChatSession> {
  await mutations.catch(() => {});
  if (keyboardBridge?.getChat) return parseChat(JSON.parse(await keyboardBridge.getChat(id)));
  const session = (await fallback()).find(s => s.id === id); if (!session) throw new Error('会话已被删除'); return session;
}
export function saveChat(session: ChatSession): Promise<boolean> {
  // Capture this revision before queuing; a later draft must not mutate it.
  const captured = JSON.stringify(parseChat(session));
  return mutate(async () => {
    if (keyboardBridge?.saveChat) return keyboardBridge.saveChat(captured);
    const all = await fallback(), value = parseChat(JSON.parse(captured)), index = all.findIndex(s => s.id === value.id);
    if (index < 0) { if (all.length >= 50) throw new Error('最多保存 50 个会话，请先整理'); all.push(value); } else if (all[index].updatedAt <= value.updatedAt) all[index] = value;
    await AsyncStorage.setItem(KEY, JSON.stringify(all)); return true;
  });
}
export function deleteChat(id: string): Promise<void> { return mutate(async () => { if (keyboardBridge?.deleteChat) return keyboardBridge.deleteChat(id); await AsyncStorage.setItem(KEY, JSON.stringify((await fallback()).filter(s => s.id !== id))); }); }
