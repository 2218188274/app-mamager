import AsyncStorage from '@react-native-async-storage/async-storage';
import { keyboardBridge } from '../../modules/chatq-keyboard';
import { topicCategories } from './topics';

const KEY = 'chatq.topic-favorites.v1';
const valid = new Set(topicCategories.flatMap(c => c.topics.map(t => t.id)));
function clean(raw: string | null): string[] {
  try { const value: unknown = JSON.parse(raw || '[]'); return Array.isArray(value) ? [...new Set(value.filter((v): v is string => typeof v === 'string' && valid.has(v)))] : []; }
  catch { return []; }
}
export async function loadTopicFavorites(): Promise<string[]> {
  if (keyboardBridge?.getTopicFavorites && keyboardBridge.initializeTopicFavorites) {
    const native = await keyboardBridge.getTopicFavorites();
    let legacy: string | null;
    try { legacy = await AsyncStorage.getItem(KEY); }
    catch (error) { if (native !== null) return clean(native); throw error; }
    // Native initialization merges the legacy list once, including any IME additions.
    return clean(await keyboardBridge.initializeTopicFavorites(JSON.stringify(clean(legacy))));
  }
  return clean(await AsyncStorage.getItem(KEY));
}
export async function saveTopicFavorites(ids: string[]): Promise<void> {
  const value = JSON.stringify(clean(JSON.stringify(ids)));
  if (keyboardBridge?.saveTopicFavorites) {
    await loadTopicFavorites();
    await keyboardBridge.saveTopicFavorites(value);
  } else await AsyncStorage.setItem(KEY, value);
}
export async function setTopicFavorite(id: string, saved: boolean): Promise<string[]> {
  if (!valid.has(id)) throw new Error('话题不存在');
  if (keyboardBridge?.setTopicFavorite) {
    await loadTopicFavorites();
    return clean(await keyboardBridge.setTopicFavorite(id, saved));
  }
  const ids = (await loadTopicFavorites()).filter(value => value !== id);
  if (saved) ids.push(id);
  await saveTopicFavorites(ids);
  return ids;
}
