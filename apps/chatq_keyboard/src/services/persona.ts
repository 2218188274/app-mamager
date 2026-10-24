import AsyncStorage from '@react-native-async-storage/async-storage';
import { keyboardBridge } from '../../modules/chatq-keyboard';
import type { ConfigDataCache, PersonaPackageItem } from '../types/configData';
export type PersonaCard = { id: string; name: string; instructions: string; tagWeights: Record<string, number>; length: 'short' | 'normal' | 'detailed'; category?: string; example?: string; pinned?: boolean };
export type Choice = { id: string; name: string };
export type PersonaData = { version: 1; cards: PersonaCard[]; scenes: Choice[]; relations: Choice[] };
export type PersonaSelection = { cardId: string; sceneId: string; relationId: string; warmth?: string; goalId?: string; recentIds?: string[] };
export type PersonaState = { data: PersonaData; selection: PersonaSelection };
export type ReplyPersonalization = { customPrompt?: string; personaTagWeights?: Record<string, number>; sceneId?: string; relationId?: string; context?: string };
const DATA = 'chatq.persona.v1', SELECTION = 'chatq.personaSelection.v1';
const lengths = { short: '回复简短，通常一到两句话。', normal: '回复长短适中。', detailed: '根据消息适当展开，避免重复。' };
export const personaCategories = [{ id: 'all', name: '全部' }, { id: 'daily', name: '日常' }, { id: 'warm', name: '温柔' }, { id: 'funny', name: '幽默' }, { id: 'work', name: '职场' }, { id: 'custom', name: '自定义' }];
export const replyGoals = [
  { id: '', name: '自然接话', instruction: '' }, { id: 'comfort', name: '安慰', instruction: '先理解感受，再温柔回应，避免说教。' },
  { id: 'decline', name: '拒绝', instruction: '礼貌明确地拒绝，保持边界，不编造理由。' }, { id: 'invite', name: '邀约', instruction: '自然提出邀请，给对方选择余地，不施加压力。' },
  { id: 'continue', name: '接着聊', instruction: '接住当前话题，用一个容易回答的问题延续聊天。' }, { id: 'thanks', name: '感谢', instruction: '具体真诚地表达感谢，不夸张奉承。' },
  { id: 'apology', name: '道歉', instruction: '真诚说明歉意，承担已有事实中的责任，不凭空承诺。' },
];
export const replyWarmths = [{ id: '', name: '自然', instruction: '' }, { id: 'reserved', name: '克制', instruction: '表达克制，保持礼貌边界，避免过度亲昵。' }, { id: 'warm', name: '热情', instruction: '表达热情有温度，但尊重边界，不预设亲密关系。' }];
export const starterPersonas: PersonaCard[] = [
  { id: 'daily', name: '自然真诚', category: 'daily', instructions: '自然真诚地回应，不夸大关系，不编造经历。', example: '听起来今天挺充实的，最开心的是哪件事？', tagWeights: {}, length: 'short' },
  { id: 'starter-warm', name: '温柔体贴', category: 'warm', instructions: '先理解感受，用平实温柔的话回应，不说教，不使用肉麻称呼。', example: '今天辛苦啦，先歇一会儿，想说的话我在听。', tagWeights: {}, length: 'short' },
  { id: 'starter-work', name: '礼貌得体', category: 'work', instructions: '表达清楚、礼貌得体，重点明确，保持边界，不凭空承诺。', example: '收到，我先确认一下安排，再和你沟通具体时间。', tagWeights: {}, length: 'short' },
  { id: 'starter-funny', name: '轻松幽默', category: 'funny', instructions: '轻松自然，适度幽默，不嘲讽、不冒犯，不使用生硬网络梗。', example: '今天的电量大概只剩 5% 了，急需一顿好吃的充电。', tagWeights: {}, length: 'short' },
  { id: 'starter-boundary', name: '坚定有界', category: 'daily', instructions: '温和但明确表达自己的想法和边界，不讨好、不指责。', example: '谢谢你想到我，不过这次我就不参加了，祝你们玩得开心。', tagWeights: {}, length: 'short' },
];
const fallback = (): PersonaData => ({ version: 1, cards: starterPersonas.slice(0, 3).map(card => ({ ...card, tagWeights: {} })), scenes: [], relations: [] });
const parse = (raw: string | null) => { try { return raw ? JSON.parse(raw) : null; } catch { return null; } };
export function cleanCard(value: PersonaCard): PersonaCard {
  const tagWeights: Record<string, number> = {};
  Object.entries(value.tagWeights || {}).slice(0, 20).forEach(([id, weight]) => { if (/^[\w-]{1,50}$/.test(id) && Number.isFinite(weight)) tagWeights[id] = Math.round(Math.max(0.1, Math.min(0.9, weight)) * 10) / 10; });
  return { id: String(value.id).slice(0, 80), name: String(value.name || '').trim().slice(0, 20) || '我的人设', instructions: String(value.instructions || '').trim().slice(0, 300), tagWeights, length: value.length in lengths ? value.length : 'short', ...(personaCategories.some(c => c.id !== 'all' && c.id === value.category) ? { category: value.category } : {}), ...(typeof value.example === 'string' && value.example.trim() ? { example: value.example.trim().slice(0, 120) } : {}), ...(value.pinned === true ? { pinned: true } : {}) };
}
export function validSelection(data: PersonaData, value?: Partial<PersonaSelection>): PersonaSelection {
  return { cardId: data.cards.some(c => c.id === value?.cardId) ? value!.cardId! : data.cards[0]?.id || '', sceneId: data.scenes.some(c => c.id === value?.sceneId) ? value!.sceneId! : '', relationId: data.relations.some(c => c.id === value?.relationId) ? value!.relationId! : '', ...(replyWarmths.some(c => c.id && c.id === value?.warmth) ? { warmth: value!.warmth } : {}), ...(replyGoals.some(c => c.id && c.id === value?.goalId) ? { goalId: value!.goalId } : {}), ...(Array.isArray(value?.recentIds) ? { recentIds: [...new Set(value.recentIds.filter(id => data.cards.some(c => c.id === id)))].slice(0, 6) } : {}) };
}
export function quickPersonas(state: PersonaState, limit = 3): PersonaCard[] {
  const ids = [...state.data.cards.filter(c => c.pinned).map(c => c.id), ...(state.selection.recentIds || []), ...state.data.cards.map(c => c.id)];
  const ordered = [...new Set(ids)].map(id => state.data.cards.find(c => c.id === id)).filter((c): c is PersonaCard => !!c).slice(0, limit);
  const selected = state.data.cards.find(c => c.id === state.selection.cardId);
  if (selected && !ordered.some(c => c.id === selected.id)) ordered.splice(Math.max(0, limit - 1), 1, selected);
  return ordered;
}
let selectionQueue: Promise<unknown> = Promise.resolve();
export function updatePersonaSelection(patch: Partial<PersonaSelection>): Promise<PersonaState> {
  const update = selectionQueue.catch(() => {}).then(async () => {
    if (keyboardBridge?.patchPersonaSelection) { await keyboardBridge.patchPersonaSelection(JSON.stringify(patch)); return loadPersona(); }
    const current = await loadPersona();
    const next = { ...current.selection, ...patch };
    if (patch.cardId) next.recentIds = [patch.cardId, ...(current.selection.recentIds || []).filter(id => id !== patch.cardId)].slice(0, 6);
    return savePersonaSelection(current.data, next);
  });
  selectionQueue = update; return update;
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
  const instructions = [card?.instructions, card && lengths[card.length], replyWarmths.find(w => w.id === selected.warmth)?.instruction, replyGoals.find(g => g.id === selected.goalId)?.instruction, goal.trim() && `本次回复目标：${goal.trim().slice(0, 80)}`].filter(Boolean).join('\n');
  return { ...(instructions ? { customPrompt: instructions.slice(0, 500) } : {}), ...(card && Object.keys(card.tagWeights).length ? { personaTagWeights: card.tagWeights } : {}), ...(selected.sceneId ? { sceneId: selected.sceneId } : {}), ...(selected.relationId ? { relationId: selected.relationId } : {}), ...(context.trim() ? { context: context.trim().slice(0, 200) } : {}) };
}
