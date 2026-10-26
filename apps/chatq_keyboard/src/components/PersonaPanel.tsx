import React, { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import type { ConfigDataCache } from '../types/configData';
import { cardFromPackage, cleanCard, loadPersona, savePersonaData, updatePersonaSelection, personaCategories, starterPersonas, replyGoals, replyWarmths, quickPersonas, type Choice, type PersonaCard, type PersonaState, type PersonaSelection } from '../services/persona';
import { colors, ui } from '../design';
import { Action, EmptyState, NavIcon } from './Ui';
import { PersonaGenerator } from './PersonaGenerator';
const errorText = (e: unknown) => e instanceof Error ? e.message : '保存失败，请重试';
export function Choices({ label, items, value, onChange, disabled = false, wrap = false, hideLabel = false }: { label: string; items: Choice[]; value: string; onChange: (id: string) => void; disabled?: boolean; wrap?: boolean; hideLabel?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const selected = items.find(item => item.id === value);
  const shown = !wrap || expanded || items.length <= 6 ? items : [...items.slice(0, 5), selected && !items.slice(0, 5).some(item => item.id === value) ? selected : items[5]];
  const chips = <View style={wrap ? s.wrap : s.chips}>{shown.map(item => <Pressable accessibilityRole="button" accessibilityLabel={`${label}：${item.name}`} accessibilityState={{ selected: value === item.id, disabled }} disabled={disabled} key={item.id} onPress={() => onChange(item.id)} style={[s.chip, { maxWidth: '100%' }, value === item.id && s.selected]}><Text style={value === item.id ? s.selectedText : s.text}>{item.name}</Text></Pressable>)}</View>;
  return <View style={s.group}>{!hideLabel && <Text style={s.label}>{label}</Text>}{wrap ? chips : <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled">{chips}</ScrollView>}{wrap && items.length > 6 && <Pressable accessibilityRole="button" accessibilityLabel={`${expanded ? '收起' : '展开'}${label}全部选项`} accessibilityState={{ expanded }} onPress={() => setExpanded(!expanded)} style={{ minHeight: 48, justifyContent: 'center' }}><Text style={ui.selectedText}>{expanded ? '收起' : `查看全部 ${items.length} 项`} {expanded ? '⌃' : '›'}</Text></Pressable>}</View>;
}
export function PersonaChoices({ state, onChange, disabled }: { state: PersonaState; onChange: (state: PersonaState) => void; disabled?: boolean }) {
  const pending = useRef(Promise.resolve());
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  async function choose(key: keyof PersonaSelection, id: string) {
    pending.current = pending.current.catch(() => {}).then(async () => {
      if (!alive.current) return;
      const saved = await updatePersonaSelection({ [key]: id });
      if (alive.current) onChange(saved);
    });
    try { await pending.current; } catch (e) { if (alive.current) Alert.alert('保存失败', errorText(e)); }
  }
  return <View style={s.card}>
    <Choices wrap label="我的人设" items={state.data.cards} value={state.selection.cardId} onChange={id => void choose('cardId', id)} disabled={disabled} />
    {!state.data.cards.length && <Text style={s.note}>在人设页新建一张卡，或直接使用自然回复。</Text>}
    <Choices wrap label="对方与我的关系" items={[{ id: '', name: '不指定' }, ...state.data.relations]} value={state.selection.relationId} onChange={id => void choose('relationId', id)} disabled={disabled} />
    <Choices wrap label="聊天场景" items={[{ id: '', name: '不指定' }, ...state.data.scenes]} value={state.selection.sceneId} onChange={id => void choose('sceneId', id)} disabled={disabled} />
    <Choices wrap label="表达分寸" items={replyWarmths} value={state.selection.warmth || ''} onChange={id => void choose('warmth', id)} disabled={disabled} />
    <Choices wrap label="这次想怎样聊" items={replyGoals} value={state.selection.goalId || ''} onChange={id => void choose('goalId', id)} disabled={disabled} />
    <Text style={s.note}>自动记住选择，并同步到本机聊商键盘。</Text>
  </View>;
}
export function PersonaPanel({ state, catalog, onChange, refresh, resetScroll }: { state: PersonaState; catalog: ConfigDataCache | null; onChange: (state: PersonaState) => void; refresh: () => Promise<void>; resetScroll: () => void }) {
  const [draft, setDraft] = useState<PersonaCard | null>(null);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [dimension, setDimension] = useState(catalog?.dimensions[0]?.id || '');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [collection, setCollection] = useState('mine');
  const [managing, setManaging] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const lock = useRef(false);
  const { width, fontScale } = useWindowDimensions();
  const twoColumns = width >= 380 && fontScale < 1.3;
  function edit(card: PersonaCard | null) { setDraft(card); resetScroll(); }
  const button = (label: string, action: () => void) => <Pressable accessibilityRole="button" disabled={saving || refreshing} style={s.button} onPress={action}><Text style={s.buttonText}>{label}</Text></Pressable>;
  async function save() {
    if (!draft || lock.current) return;
    if (!draft.name.trim()) { Alert.alert('请填写人设名称'); return; }
    if (!state.data.cards.some(c => c.id === draft.id) && state.data.cards.length >= 20) { Alert.alert('最多保存 20 张人设卡'); return; }
    lock.current = true; setSaving(true);
    try {
      const current = await loadPersona();
      const card = cleanCard(draft), cards = current.data.cards.some(c => c.id === card.id) ? current.data.cards.map(c => c.id === card.id ? card : c) : [...current.data.cards, card];
      if (cards.length > 20) throw new Error('最多保存 20 张人设卡');
      await savePersonaData({ ...current.data, cards });
      onChange(await updatePersonaSelection({ cardId: card.id })); edit(null);
      Alert.alert('已保存', '已设为当前人设，键盘下次打开时生效。');
    } catch (e) { Alert.alert('保存失败', errorText(e)); } finally { lock.current = false; setSaving(false); }
  }
  async function use(card: PersonaCard) {
    if (lock.current) return; lock.current = true; setSaving(true);
    try {
      const current = await loadPersona();
      if (!current.data.cards.some(c => c.id === card.id)) {
        if (current.data.cards.length >= 20) throw new Error('最多保存 20 张人设卡，请先整理我的人设');
        await savePersonaData({ ...current.data, cards: [...current.data.cards, cleanCard(card)] });
      }
      onChange(await updatePersonaSelection({ cardId: card.id }));
    } catch (e) { Alert.alert('未能选用', errorText(e)); }
    finally { lock.current = false; setSaving(false); }
  }
  async function pin(card: PersonaCard) {
    if (lock.current) return; lock.current = true; setSaving(true);
    try {
      const current = await loadPersona(); const value = current.data.cards.find(c => c.id === card.id);
      if (!value) return;
      const updated = { ...value, pinned: !value.pinned };
      const cards = current.data.cards.filter(c => c.id !== card.id);
      if (updated.pinned) cards.unshift(updated); else cards.push(updated);
      onChange(await savePersonaData({ ...current.data, cards }));
    } catch (e) { Alert.alert('常用未保存', errorText(e)); }
    finally { lock.current = false; setSaving(false); }
  }
  function remove(card: PersonaCard) {
    Alert.alert('删除人设', `删除“${card.name}”？`, [{ text: '取消', style: 'cancel' }, { text: '删除', style: 'destructive', onPress: async () => {
      if (lock.current) return; lock.current = true; setSaving(true);
      try { const current = await loadPersona(); onChange(await savePersonaData({ ...current.data, cards: current.data.cards.filter(c => c.id !== card.id) })); setManaging(''); }
      catch (e) { Alert.alert('删除失败', errorText(e)); }
      finally { lock.current = false; setSaving(false); }
    } }]);
  }
  if (generating) return <PersonaGenerator onClose={() => { setGenerating(false); resetScroll(); }} onGenerated={card => { setGenerating(false); edit(card); }} />;
  if (draft) {
    const currentDimension = catalog?.dimensions.find(d => d.id === dimension) || catalog?.dimensions[0];
    const selectedTags = new Map(catalog?.dimensions.flatMap(d => d.tags).map(t => [t.id, t.name]));
    return <View style={s.card}><Text style={s.title}>编辑人设卡</Text>
      <Text style={s.label}>人设名称</Text><TextInput accessibilityLabel="人设名称" editable={!saving} value={draft.name} maxLength={20} onChangeText={name => setDraft({ ...draft, name })} style={s.input} placeholderTextColor={colors.muted} placeholder="例如：温柔但有边界的我" />
      <Text style={s.label}>说话习惯与边界 · {draft.instructions.length}/300</Text><TextInput accessibilityLabel="人设说话习惯" editable={!saving} multiline value={draft.instructions} maxLength={300} onChangeText={instructions => setDraft({ ...draft, instructions })} style={[s.input, { minHeight: 100 }]} placeholderTextColor={colors.muted} placeholder="例如：直率，不说土味情话；安慰时先理解感受，再给建议。" />
      <Choices wrap label="人设分类" items={personaCategories.filter(c => c.id !== 'all')} value={draft.category || 'custom'} disabled={saving} onChange={category => setDraft({ ...draft, category })} />
      <Text style={s.label}>示例回复 · 选填</Text><TextInput accessibilityLabel="人设示例回复" editable={!saving} multiline maxLength={120} value={draft.example || ''} onChangeText={example => setDraft({ ...draft, example })} style={s.input} placeholder="写一句能代表这种风格的话" placeholderTextColor={colors.muted} />
      <Choices label="回复长度" items={[{ id: 'short', name: '简短' }, { id: 'normal', name: '适中' }, { id: 'detailed', name: '展开' }]} value={draft.length} disabled={saving} onChange={length => setDraft({ ...draft, length: length as PersonaCard['length'] })} />
      <Text style={s.label}>性格标签 · {Object.keys(draft.tagWeights).length}/20</Text>
      {Object.entries(draft.tagWeights).map(([id, weight]) => <View key={id} style={s.tagRow}><Text style={s.text}>{selectedTags.get(id) || id}</Text><View style={s.chips}>{[0.3, 0.6, 0.9].map(n => <Pressable disabled={saving} key={n} style={[s.chip, weight === n && s.selected]} onPress={() => setDraft({ ...draft, tagWeights: { ...draft.tagWeights, [id]: n } })}><Text>{n === 0.3 ? '轻' : n === 0.6 ? '中' : '强'}</Text></Pressable>)}<Pressable disabled={saving} onPress={() => { const weights = { ...draft.tagWeights }; delete weights[id]; setDraft({ ...draft, tagWeights: weights }); }}><Text style={s.link}>移除</Text></Pressable></View></View>)}
      {!!catalog?.dimensions.length && <><Choices label="添加标签：先选维度" items={catalog.dimensions} value={currentDimension?.id || ''} disabled={saving} onChange={setDimension} /><View style={s.wrap}>{currentDimension?.tags.filter(t => !(t.id in draft.tagWeights)).map(tag => <Pressable disabled={saving} key={tag.id} style={s.chip} onPress={() => { if (Object.keys(draft.tagWeights).length >= 20) { Alert.alert('最多选择 20 个标签'); return; } setDraft({ ...draft, tagWeights: { ...draft.tagWeights, [tag.id]: tag.weight_default } }); }}><Text style={s.text}>＋{tag.name}</Text></Pressable>)}</View></>}
      {button(saving ? '保存中…' : '保存并使用', () => void save())}{button('取消编辑', () => edit(null))}
    </View>;
  }
  const templates = [...starterPersonas, ...(catalog?.personaPackages.map(preset => ({ ...cardFromPackage(preset, catalog), id: ('preset-' + preset.id).slice(0, 80) })) || [])].map(card => state.data.cards.find(c => c.id === card.id) || card);
  const sourceCards = collection === 'recommended' ? templates : collection === 'pinned' ? state.data.cards.filter(c => c.pinned) : state.data.cards;
  const visible = sourceCards.filter(card => (category === 'all' || (card.category || 'custom') === category) && (card.name + card.instructions + (card.example || '')).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const quick = quickPersonas(state).map(c => c.name).join('、');
  const currentCard = state.data.cards.find(card => card.id === state.selection.cardId);
  return <>
    <Text accessibilityLiveRegion="polite" style={ui.note}>当前：<Text style={ui.selectedText}>{currentCard?.name || '自然回复'}</Text> · 与键盘共用</Text>
    <Action label="AI 帮我创建人设" icon="topics" disabled={saving || refreshing} onPress={() => { if (state.data.cards.length >= 20) { Alert.alert('人设库已满', '最多保存 20 张，请先整理我的人设。'); return; } setGenerating(true); resetScroll(); }} />
    <View style={fontScale >= 1.6 ? { gap: 8 } : ui.row}><TextInput accessibilityLabel="搜索人设" value={query} onChangeText={setQuery} maxLength={100} style={[s.input, fontScale < 1.6 && { flex: 1 }]} placeholder="搜索人设或风格" placeholderTextColor={colors.muted} /><Action secondary label="分类⌄" accessibilityLabel="筛选人设分类" onPress={() => setFiltersOpen(!filtersOpen)} /></View>
    {(!!query || category !== 'all') && <View style={ui.between}><Text style={ui.note}>{visible.length} 张 · {personaCategories.find(c => c.id === category)?.name || '全部'}</Text><Action secondary label="清除筛选" onPress={() => { setQuery(''); setCategory('all'); setFiltersOpen(false); }} /></View>}
    <Choices wrap hideLabel label="人设库" items={[{ id: 'mine', name: '我的人设' }, { id: 'pinned', name: '常用' }, { id: 'recommended', name: '推荐模板' }]} value={collection} onChange={setCollection} disabled={saving} />
    {filtersOpen && <Choices wrap label="分类" items={personaCategories} value={category} onChange={id => { setCategory(id); setFiltersOpen(false); }} disabled={saving} />}
    {!visible.length && <EmptyState title="没有找到人设" note="试试其他分类或关键词，也可以创建自己的表达风格。" />}
    <View style={s.grid}>{visible.map(card => { const owned = state.data.cards.find(c => c.id === card.id); const selected = state.selection.cardId === card.id; return <View key={card.id} style={[s.personaCard, { width: twoColumns ? '48%' : '100%' }, selected && { borderColor: colors.primary, backgroundColor: '#F8F5FF' }]}>
      <View style={ui.row}>{!twoColumns && <View style={[s.avatar, { backgroundColor: card.category === 'work' ? colors.mint : card.category === 'warm' ? colors.rose : card.category === 'funny' ? colors.peach : colors.soft }]}><NavIcon name={card.category === 'funny' ? 'emoji' : card.category === 'work' ? 'bookmark' : 'persona'} color={colors.primary} /></View>}<View style={{ flex: 1, gap: 4 }}><Text accessibilityRole="header" style={ui.heading}>{card.name}</Text><Text style={ui.note}>{owned?.pinned ? '★ 常用 · ' : ''}{personaCategories.find(c => c.id === card.category)?.name || '专属风格'}</Text></View>{owned && <Pressable accessibilityRole="button" accessibilityLabel={'管理人设：' + card.name} accessibilityState={{ expanded: managing === card.id, disabled: saving }} disabled={saving} onPress={() => setManaging(managing === card.id ? '' : card.id)} style={{ minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: colors.muted, fontSize: 24 }}>···</Text></Pressable>}</View>
      <View style={s.example}><Text style={ui.note}>{card.example ? '风格示例' : '表达习惯'}</Text><Text numberOfLines={twoColumns ? 3 : undefined} style={ui.text}>{card.example || card.instructions || '按你的习惯表达'}</Text></View>
      <View style={{ marginTop: 'auto', gap: 4 }}>{selected ? <View accessibilityLabel={'当前人设：' + card.name} style={{ minHeight: 48, justifyContent: 'center', alignItems: 'center', padding: 12, borderRadius: 13, backgroundColor: colors.soft }}><Text style={ui.selectedText}>✓ 正在使用</Text></View> : <Action label={owned ? '选用人设' : '添加并选用'} disabled={saving} onPress={() => void use(card)} accessibilityLabel={'选用人设：' + card.name} />}
      {owned && managing === card.id && <><Text style={ui.note}>{card.instructions}</Text><Action secondary label={owned.pinned ? '取消常用' : '设为常用'} disabled={saving} onPress={() => void pin(owned)} /><Action secondary label="编辑人设" disabled={saving} onPress={() => edit({ ...owned, tagWeights: { ...owned.tagWeights } })} /><Action secondary label="删除人设" disabled={saving} onPress={() => remove(owned)} /></>}</View>
    </View>; })}</View>
    {button('＋ 自定义人设', () => edit({ id: `card-${Date.now()}`, name: '', instructions: '', tagWeights: {}, length: 'short', category: 'custom' }))}
    <Text style={s.note}>键盘快捷人设：{quick || '还没有人设'}。设为常用后优先显示。</Text>
    <Action secondary label={refreshing ? '正在刷新…' : '刷新后台人设与场景'} disabled={saving || refreshing} onPress={() => { setRefreshing(true); void refresh().catch(e => Alert.alert('刷新失败', errorText(e))).finally(() => setRefreshing(false)); }} />
    <Text style={s.note}>示例仅帮助了解风格，实际回复以本次消息为准。只有点击生成才发送消息与所选人设。</Text>
  </>;
}
const s = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 10 }, personaCard: { ...ui.card, padding: 12, gap: 6 }, avatar: { width: 44, height: 44, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }, example: { padding: 10, borderRadius: 12, backgroundColor: colors.background, gap: 4 },
  card: ui.card, group: { gap: 8 }, label: ui.label, title: ui.heading, note: ui.note, text: ui.text,
  chips: { flexDirection: 'row', gap: 6, alignItems: 'center', flexWrap: 'wrap', maxWidth: '100%' }, wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: ui.chip, selected: ui.selected, selectedText: ui.selectedText,
  button: { minHeight: 50, padding: 14, borderRadius: 13, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }, buttonText: { color: '#FFF', fontSize: 15, lineHeight: 22, fontWeight: '700' },
  link: { color: colors.primary, minHeight: 48, minWidth: 48, paddingVertical: 12, textAlignVertical: 'center', fontWeight: '600' },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, input: ui.input,
});
