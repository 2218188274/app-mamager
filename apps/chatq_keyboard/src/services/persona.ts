import AsyncStorage from '@react-native-async-storage/async-storage';
import { keyboardBridge } from '../../modules/chatq-keyboard';
import type { ConfigDataCache, PersonaPackageItem } from '../types/configData';
export type PersonaCard = { id: string; name: string; instructions: string; tagWeights: Record<string, number>; length: 'short' | 'normal' | 'detailed' };
export type Choice = { id: string; name: string };
export type PersonaData = { version: 1; cards: PersonaCard[]; scenes: Choice[]; relations: Choice[] };
export type PersonaSelection = { cardId: string; sceneId: string; relationId: string };
export type PersonaState = { data: PersonaData; selection: PersonaSelection };
export type ReplyPersonalization = { customPrompt?: string; personaTagWeights?: Record<string, number>; sceneId?: string; relationId?: string; context?: string };
const DATA = 'chatq.persona.v1', SELECTION = 'chatq.personaSelection.v1';
const lengths = { short: '回复简短，通常一到两句话。', normal: '回复长短适中。', detailed: '根据消息适当展开，避免重复。' };
const fallback = (): PersonaData => ({ version: 1, cards: [{ id: 'daily', name: '自然真诚', instructions: '自然真诚地回应，不夸大关系，不编造经历。', tagWeights: {}, length: 'short' }], scenes: [], relations: [] });
const parse = (raw: string | null) => { try { return raw ? JSON.parse(raw) : null; } catch { return null; } };
export function cleanCard(value: PersonaCard): PersonaCard {
  const tagWeights: Record<string, number> = {};
  Object.entries(value.tagWeights || {}).slice(0, 20).forEach(([id, weight]) => { if (/^[\w-]{1,50}$/.test(id) && Number.isFinite(weight)) tagWeights[id] = Math.round(Math.max(0.1, Math.min(0.9, weight)) * 10) / 10; });
  return { id: String(value.id).slice(0, 80), name: String(value.name || '').trim().slice(0, 20) || '我的人设', instructions: String(value.instructions || '').trim().slice(0, 300), tagWeights, length: value.length in lengths ? value.length : 'short' };
}
export function validSelection(data: PersonaData, value?: Partial<PersonaSelection>): PersonaSelection {
  return { cardId: data.cards.some(c => c.id === value?.cardId) ? value!.cardId! : data.cards[0]?.id || '', sceneId: data.scenes.some(c => c.id === value?.sceneId) ? value!.sceneId! : '', relationId: data.relations.some(c => c.id === value?.relationId) ? value!.relationId! : '' };
}
export async function loadPersona(): Promise<PersonaState> {
  const raw = keyboardBridge ? await keyboardBridge.getPersonalization() : await AsyncStorage.getItem(DATA);
  const saved = parse(raw);
  const choices = (items: unknown): Choice[] => Array.isArray(items) ? items.filter(i => typeof i?.id === 'string' && typeof i?.name === 'string').slice(0, 100).map(i => ({ id: i.id.slice(0, 50), name: i.name.slice(0, 30) })) : [];
  const data: PersonaData = saved?.version === 1 && Array.isArray(saved.cards) ? { version: 1, cards: saved.cards.filter((c: PersonaCard) => typeof c?.id === 'string').slice(0, 20).map(cleanCard), scenes: choices(saved.scenes), relations: choices(saved.relations) } : fallback();
  const selected = parse(keyboardBridge ? await keyboardBridge.getPersonaSelection() : await AsyncStorage.getItem(SELECTION));
  return { data, selection: validSelection(data, selected || { cardId: data.cards[0]?.id }) };
}
export async function savePersonaData(data: PersonaData): Promise<PersonaState> {
  const cleaned: PersonaData = { ...data, version: 1, cards: data.cards.slice(0, 20).map(cleanCard) };
  const raw = JSON.stringify(cleaned);
  if (keyboardBridge) await keyboardBridge.savePersonalization(raw);
  await AsyncStorage.setItem(DATA, raw);
  // Selection lives in a separate key so an edit cannot overwrite a keyboard quick switch.
  return loadPersona();
}
export async function savePersonaSelection(data: PersonaData, selection: PersonaSelection): Promise<PersonaState> {
  const value = validSelection(data, selection), raw = JSON.stringify(value);
  if (keyboardBridge) await keyboardBridge.savePersonaSelection(raw);
  await AsyncStorage.setItem(SELECTION, raw);
  return { data, selection: value };
}
export async function syncPersonaCatalog(catalog: ConfigDataCache): Promise<PersonaState> {
  const state = await loadPersona();
  return savePersonaData({ ...state.data, scenes: catalog.scenes.map(({ id, name }) => ({ id, name })), relations: catalog.relations.map(({ id, name }) => ({ id, name })) });
}
export function cardFromPackage(preset: PersonaPackageItem, catalog: ConfigDataCache): PersonaCard {
  const tags = new Map(catalog.dimensions.flatMap(d => d.tags).map(t => [t.id, t]));
  return cleanCard({ id: `card-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name: preset.name, instructions: preset.description, tagWeights: Object.fromEntries(preset.tags.filter(id => tags.has(id)).map(id => [id, tags.get(id)!.weight_default])), length: 'short' });
}
export function replyPersonalization(state: PersonaState, context = '', goal = ''): ReplyPersonalization {
  const selected = validSelection(state.data, state.selection);
  const card = state.data.cards.find(c => c.id === selected.cardId);
  const instructions = [card?.instructions, card && lengths[card.length], goal.trim() && `本次回复目标：${goal.trim().slice(0, 80)}`].filter(Boolean).join('\n');
  return { ...(instructions ? { customPrompt: instructions.slice(0, 500) } : {}), ...(card && Object.keys(card.tagWeights).length ? { personaTagWeights: card.tagWeights } : {}), ...(selected.sceneId ? { sceneId: selected.sceneId } : {}), ...(selected.relationId ? { relationId: selected.relationId } : {}), ...(context.trim() ? { context: context.trim().slice(0, 200) } : {}) };
}
