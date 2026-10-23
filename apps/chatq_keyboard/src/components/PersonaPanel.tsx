import React, { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { ConfigDataCache } from '../types/configData';
import { cardFromPackage, cleanCard, loadPersona, savePersonaData, savePersonaSelection, type Choice, type PersonaCard, type PersonaState } from '../services/persona';
import { colors, ui } from '../design';
const errorText = (e: unknown) => e instanceof Error ? e.message : '保存失败，请重试';
export function Choices({ label, items, value, onChange, disabled = false }: { label: string; items: Choice[]; value: string; onChange: (id: string) => void; disabled?: boolean }) {
  return <View style={s.group}><Text style={s.label}>{label}</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled"><View style={s.chips}>{items.map(item => <Pressable accessibilityRole="button" accessibilityState={{ selected: value === item.id }} disabled={disabled} key={item.id} onPress={() => onChange(item.id)} style={[s.chip, value === item.id && s.selected]}><Text style={value === item.id ? s.selectedText : s.text}>{item.name}</Text></Pressable>)}</View></ScrollView></View>;
}
export function PersonaChoices({ state, onChange, disabled }: { state: PersonaState; onChange: (state: PersonaState) => void; disabled?: boolean }) {
  const pending = useRef(Promise.resolve());
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  async function choose(key: 'cardId' | 'sceneId' | 'relationId', id: string) {
    pending.current = pending.current.catch(() => {}).then(async () => {
      if (!alive.current) return;
      const current = await loadPersona();
      const saved = await savePersonaSelection(current.data, { ...current.selection, [key]: id });
      if (alive.current) onChange(saved);
    });
    try { await pending.current; } catch (e) { if (alive.current) Alert.alert('保存失败', errorText(e)); }
  }
  return <View style={s.card}>
    <Choices label="我的人设" items={state.data.cards} value={state.selection.cardId} onChange={id => void choose('cardId', id)} disabled={disabled} />
    {!state.data.cards.length && <Text style={s.note}>在人设页新建一张卡，或直接使用自然回复。</Text>}
    <Choices label="对方与我的关系" items={[{ id: '', name: '不指定' }, ...state.data.relations]} value={state.selection.relationId} onChange={id => void choose('relationId', id)} disabled={disabled} />
    <Choices label="聊天场景" items={[{ id: '', name: '不指定' }, ...state.data.scenes]} value={state.selection.sceneId} onChange={id => void choose('sceneId', id)} disabled={disabled} />
    <Text style={s.note}>自动记住选择，并同步到本机聊商键盘。</Text>
  </View>;
}
export function PersonaPanel({ state, catalog, onChange, refresh, resetScroll }: { state: PersonaState; catalog: ConfigDataCache | null; onChange: (state: PersonaState) => void; refresh: () => Promise<void>; resetScroll: () => void }) {
  const [draft, setDraft] = useState<PersonaCard | null>(null);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [dimension, setDimension] = useState(catalog?.dimensions[0]?.id || '');
  function edit(card: PersonaCard | null) { setDraft(card); resetScroll(); }
  const button = (label: string, action: () => void) => <Pressable accessibilityRole="button" disabled={saving || refreshing} style={s.button} onPress={action}><Text style={s.buttonText}>{label}</Text></Pressable>;
  async function save() {
    if (!draft || saving) return;
    if (!draft.name.trim()) { Alert.alert('请填写人设名称'); return; }
    if (!state.data.cards.some(c => c.id === draft.id) && state.data.cards.length >= 20) { Alert.alert('最多保存 20 张人设卡'); return; }
    setSaving(true);
    try {
      const card = cleanCard(draft), cards = state.data.cards.some(c => c.id === card.id) ? state.data.cards.map(c => c.id === card.id ? card : c) : [...state.data.cards, card];
      const saved = await savePersonaData({ ...state.data, cards });
      onChange(await savePersonaSelection(saved.data, { ...saved.selection, cardId: card.id })); edit(null);
      Alert.alert('已保存', '已设为当前人设，键盘下次打开时生效。');
    } catch (e) { Alert.alert('保存失败', errorText(e)); } finally { setSaving(false); }
  }
  function remove(card: PersonaCard) {
    Alert.alert('删除人设', `删除“${card.name}”？`, [{ text: '取消', style: 'cancel' }, { text: '删除', style: 'destructive', onPress: async () => { try { onChange(await savePersonaData({ ...state.data, cards: state.data.cards.filter(c => c.id !== card.id) })); } catch (e) { Alert.alert('删除失败', errorText(e)); } } }]);
  }
  if (draft) {
    const currentDimension = catalog?.dimensions.find(d => d.id === dimension) || catalog?.dimensions[0];
    const selectedTags = new Map(catalog?.dimensions.flatMap(d => d.tags).map(t => [t.id, t.name]));
    return <View style={s.card}><Text style={s.title}>编辑人设卡</Text>
      <Text style={s.label}>人设名称</Text><TextInput accessibilityLabel="人设名称" editable={!saving} value={draft.name} maxLength={20} onChangeText={name => setDraft({ ...draft, name })} style={s.input} placeholderTextColor={colors.muted} placeholder="例如：温柔但有边界的我" />
      <Text style={s.label}>说话习惯与边界 · {draft.instructions.length}/300</Text><TextInput accessibilityLabel="人设说话习惯" editable={!saving} multiline value={draft.instructions} maxLength={300} onChangeText={instructions => setDraft({ ...draft, instructions })} style={[s.input, { minHeight: 100 }]} placeholderTextColor={colors.muted} placeholder="例如：直率，不说土味情话；安慰时先理解感受，再给建议。" />
      <Choices label="回复长度" items={[{ id: 'short', name: '简短' }, { id: 'normal', name: '适中' }, { id: 'detailed', name: '展开' }]} value={draft.length} disabled={saving} onChange={length => setDraft({ ...draft, length: length as PersonaCard['length'] })} />
      <Text style={s.label}>性格标签 · {Object.keys(draft.tagWeights).length}/20</Text>
      {Object.entries(draft.tagWeights).map(([id, weight]) => <View key={id} style={s.tagRow}><Text style={s.text}>{selectedTags.get(id) || id}</Text><View style={s.chips}>{[0.3, 0.6, 0.9].map(n => <Pressable disabled={saving} key={n} style={[s.chip, weight === n && s.selected]} onPress={() => setDraft({ ...draft, tagWeights: { ...draft.tagWeights, [id]: n } })}><Text>{n === 0.3 ? '轻' : n === 0.6 ? '中' : '强'}</Text></Pressable>)}<Pressable disabled={saving} onPress={() => { const weights = { ...draft.tagWeights }; delete weights[id]; setDraft({ ...draft, tagWeights: weights }); }}><Text style={s.link}>移除</Text></Pressable></View></View>)}
      {!!catalog?.dimensions.length && <><Choices label="添加标签：先选维度" items={catalog.dimensions} value={currentDimension?.id || ''} disabled={saving} onChange={setDimension} /><View style={s.wrap}>{currentDimension?.tags.filter(t => !(t.id in draft.tagWeights)).map(tag => <Pressable disabled={saving} key={tag.id} style={s.chip} onPress={() => { if (Object.keys(draft.tagWeights).length >= 20) { Alert.alert('最多选择 20 个标签'); return; } setDraft({ ...draft, tagWeights: { ...draft.tagWeights, [tag.id]: tag.weight_default } }); }}><Text style={s.text}>＋{tag.name}</Text></Pressable>)}</View></>}
      {button(saving ? '保存中…' : '保存并使用', () => void save())}{button('取消编辑', () => edit(null))}
    </View>;
  }
  return <><PersonaChoices state={state} onChange={onChange} disabled={saving} /><Text style={s.note}>人设代表你希望表达的方式。只有点击生成时，所选人设与本次消息才会发给服务器。</Text>
    <Text style={s.title}>我的人设卡</Text>{state.data.cards.map(card => <View style={s.card} key={card.id}><Text style={s.title}>{card.name}{state.selection.cardId === card.id ? ' · 当前默认' : ''}</Text><Text style={s.text}>{card.instructions || '自定义性格标签'}</Text><View style={s.tagRow}><Pressable onPress={() => edit({ ...card, tagWeights: { ...card.tagWeights } })}><Text style={s.link}>编辑人设</Text></Pressable><Pressable onPress={() => remove(card)}><Text style={s.link}>删除</Text></Pressable></View></View>)}
    {button('＋ 自定义人设', () => edit({ id: `card-${Date.now()}`, name: '', instructions: '', tagWeights: {}, length: 'short' }))}
    <Text style={s.title}>从人设包开始</Text><Text style={s.note}>选一个模板，再按你的习惯修改。后台更新后可在此刷新。</Text>
    {catalog?.personaPackages.map(preset => <Pressable key={preset.id} style={s.card} onPress={() => edit(cardFromPackage(preset, catalog))}><Text style={s.title}>{preset.name} ＋</Text><Text style={s.text}>{preset.description}</Text></Pressable>)}
    {!catalog && <Text style={s.note}>尚未获取人设包，请联网后刷新；已保存的人设仍可使用。</Text>}
    {button(refreshing ? '正在刷新…' : '刷新后台人设与场景', () => { setRefreshing(true); void refresh().catch(e => Alert.alert('刷新失败', errorText(e))).finally(() => setRefreshing(false)); })}
  </>;
}
const s = StyleSheet.create({
  card: ui.card, group: { gap: 8 }, label: ui.label, title: ui.heading, note: ui.note, text: ui.text,
  chips: { flexDirection: 'row', gap: 6, alignItems: 'center', flexWrap: 'wrap', maxWidth: '100%' }, wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: ui.chip, selected: ui.selected, selectedText: ui.selectedText,
  button: { minHeight: 50, padding: 14, borderRadius: 13, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }, buttonText: { color: '#FFF', fontSize: 15, lineHeight: 22, fontWeight: '700' },
  link: { color: colors.primary, minHeight: 48, minWidth: 48, paddingVertical: 12, textAlignVertical: 'center', fontWeight: '600' },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, input: ui.input,
});
