import AsyncStorage from '@react-native-async-storage/async-storage';
import { keyboardBridge } from '../../modules/chatq-keyboard';
export type SavedReply = { text: string; label: string; savedAt: number };
const key = 'chatq.savedReplies.v1';
export function cleanSavedReplies(raw: string | null): SavedReply[] {
  const data = JSON.parse(raw || '[]');
  if (!Array.isArray(data) || data.length > 100) throw new Error('常用句数据异常，请从备份恢复');
  const seen = new Set<string>();
  return data.map(row => {
    if (typeof row?.text !== 'string' || !row.text.trim() || row.text.length > 1000 || seen.has(row.text) || typeof row.label !== 'string' || row.label.length > 80 || !Number.isSafeInteger(row.savedAt) || row.savedAt < 0) throw new Error('常用句数据异常，请从备份恢复');
    seen.add(row.text); return { text: row.text, label: row.label, savedAt: row.savedAt };
  });
}
export async function loadSavedReplies(): Promise<SavedReply[]> {
  return cleanSavedReplies(keyboardBridge?.getSavedReplies ? await keyboardBridge.getSavedReplies() : await AsyncStorage.getItem(key));
}
let queue: Promise<unknown> = Promise.resolve();
export function setSavedReply(text: string, label: string, saved: boolean): Promise<SavedReply[]> {
  const operation = queue.catch(() => {}).then(async () => {
    if (!text.trim() || text.length > 1000) throw new Error('常用句需要 1–1000 字');
    if (keyboardBridge?.setSavedReply) return cleanSavedReplies(await keyboardBridge.setSavedReply(text, label.slice(0, 80), saved));
    const rows = (await loadSavedReplies()).filter(row => row.text !== text);
    if (saved) { if (rows.length >= 100) throw new Error('最多收藏 100 句，请先整理'); rows.unshift({ text, label: label.slice(0, 80), savedAt: Date.now() }); }
    await AsyncStorage.setItem(key, JSON.stringify(rows)); return rows;
  });
  queue = operation; return operation;
}
