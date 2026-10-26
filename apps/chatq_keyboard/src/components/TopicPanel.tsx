import { saveReplyConversation } from '../services/storage';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, AppState, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { topicBatch, topicCategories } from '../services/topics';
import { generateTopics } from '../services/api';
import { loadTopicFavorites, setTopicFavorite } from '../services/favorites';
import { loadPersona, replyPersonalization, type PersonaState } from '../services/persona';
import { PersonaChoices } from './PersonaPanel';
import { colors, ui } from '../design';
import { Action, CopyAction, EmptyState, PageIntro } from './Ui';

export function TopicPanel({ persona, onPersona, ready }: { persona: PersonaState | null; onPersona: (p: PersonaState) => void; ready: boolean }) {
  const [category, setCategory] = useState('daily');
  const [page, setPage] = useState(0);
  const [background, setBackground] = useState('');
  const [ai, setAI] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [showPersona, setShowPersona] = useState(false);
  const [mode, setMode] = useState<'library' | 'ai' | 'saved'>('library');
  const [follow, setFollow] = useState('');
  const [favorites, setFavorites] = useState<string[]>([]);
  const [favoritesReady, setFavoritesReady] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const request = useRef<AbortController | null>(null);
  const alive = useRef(true);
  const favoriteLock = useRef(false);
  const basis = useRef(JSON.stringify(persona));
  const personaKey = JSON.stringify(persona);
  useEffect(() => {
    if (basis.current !== personaKey) { basis.current = personaKey; request.current?.abort(); request.current = null; setBusy(false); setAI([]); }
  }, [personaKey]);
  useEffect(() => {
    alive.current = true;
    void loadTopicFavorites().then(ids => { if (alive.current) { setFavorites(ids); setFavoritesReady(true); } }).catch(() => { if (alive.current) setError('收藏暂时无法读取，请返回后重试；话题库仍可使用。'); });
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') { request.current?.abort(); request.current = null; setBusy(false); }
      else void loadTopicFavorites().then(ids => { if (alive.current) setFavorites(ids); }).catch(() => {});
    });
    return () => { alive.current = false; request.current?.abort(); subscription.remove(); };
  }, []);
  function cancel() { request.current?.abort(); request.current = null; setBusy(false); }
  function invalidate() { cancel(); setAI([]); setError(''); }
  async function toggleFavorite(id: string) {
    if (favoriteLock.current || !favoritesReady) return;
    favoriteLock.current = true; setSaving(true);
    try { const next = await setTopicFavorite(id, !favorites.includes(id)); if (alive.current) setFavorites(next); }
    catch { if (alive.current) Alert.alert('收藏未保存', '本机存储暂时不可用，请稍后重试。'); }
    finally { favoriteLock.current = false; if (alive.current) setSaving(false); }
  }
  async function generate() {
    if (request.current || !ready) return;
    const controller = new AbortController(); request.current = controller; setBusy(true); setError('');
    const previous = ai; setAI([]);
    try {
      const current = await loadPersona();
      if (controller.signal.aborted || !alive.current) return;
      basis.current = JSON.stringify(current); onPersona(current);
      const results = await generateTopics(category, background, previous, replyPersonalization(current), controller.signal);
      if (!controller.signal.aborted && alive.current) {
        setAI(results);
        try { await saveReplyConversation(background.trim(), results, 'topic'); }
        catch { if (alive.current) setError('话题已生成，但本机记录未保存，仍可复制使用。'); }
      }
    } catch (e) { if (!controller.signal.aborted && alive.current) setError(e instanceof Error ? e.message : '话题生成失败，请手动重试。'); }
    finally { if (request.current === controller) { request.current = null; if (alive.current) setBusy(false); } }
  }
  const topics = mode === 'saved' ? topicCategories.flatMap(c => c.topics).filter(t => favorites.includes(t.id)) : topicBatch(category, page);
  return <>
    <PageIntro title="从一句轻松的话开始" note="64 个日常话题，帮你自然打开话匣子。" />
    <View style={s.modes}>{([['library', '话题库'], ['ai', 'AI 灵感'], ['saved', '我的收藏']] as const).map(([id, label]) => <Pressable key={id} accessibilityRole="tab" accessibilityState={{ selected: mode === id }} onPress={() => { invalidate(); setMode(id); setFollow(''); }} style={[s.mode, mode === id && s.activeMode]}><Text style={[s.modeText, mode === id && ui.selectedText]}>{label}</Text></Pressable>)}</View>
    {mode !== 'saved' && <View style={s.wrap}>{topicCategories.map(c => <Pressable key={c.id} accessibilityRole="button" accessibilityState={{ selected: category === c.id }} onPress={() => { invalidate(); setCategory(c.id); setPage(0); setFollow(''); }} style={[s.category, category === c.id && s.selected]}><Text style={[s.categoryText, category === c.id && ui.selectedText]}>{c.name}</Text></Pressable>)}</View>}
    {mode !== 'ai' ? <>
      {mode === 'saved' && <Text style={ui.note}>{Platform.OS === 'android' ? '与安卓键盘互通：AI / 话题 → 找话题 → 分类中选“我的收藏”。' : '收藏保存在本机主应用中。'}</Text>}
      <View style={ui.between}><View style={{ flex: 1 }}><Text style={ui.heading}>{mode === 'saved' ? '我的话题 · ' + topics.length : topicCategories.find(c => c.id === category)?.name}</Text><Text style={ui.note}>{mode === 'saved' ? '喜欢的开场白，留着下次用' : '离线可用 · 不消耗 AI 额度'}</Text></View>{mode === 'library' && <Action secondary label="换一批" onPress={() => { setPage(p => p + 1); setFollow(''); }} />}</View>
      {mode === 'saved' && !topics.length && <EmptyState title="把喜欢的话题留下来" note="在话题卡片上点“收藏”，下次不知道聊什么时，就来这里看看。" />}
      {topics.map(t => <View key={t.id} style={ui.card}>
        <View style={ui.row}><Text style={[ui.label, { flex: 1 }]}>{t.title}</Text><Pressable accessibilityRole="button" accessibilityLabel={(favorites.includes(t.id) ? '取消收藏：' : '收藏：') + t.title} accessibilityState={{ selected: favorites.includes(t.id), disabled: !favoritesReady || saving }} disabled={!favoritesReady || saving} onPress={() => void toggleFavorite(t.id)} style={s.favorite}><Text style={[ui.label, favorites.includes(t.id) && ui.selectedText]}>{favorites.includes(t.id) ? '★ 已收藏' : '☆ 收藏'}</Text></Pressable></View>
        <Text selectable style={s.opener}>{t.opener}</Text>
        <View style={s.cardActions}><CopyAction text={t.opener} label="复制开场白" style={{ flex: 1 }} /><View style={{ flex: 1 }}><Action secondary label={follow === t.id ? '收起接话' : '怎么接着聊'} onPress={() => setFollow(follow === t.id ? '' : t.id)} /></View></View>
        {follow === t.id && <View style={s.follow}><Text style={ui.label}>等对方回答后，试着这样接</Text><Text selectable style={ui.text}>{t.followUp}</Text><CopyAction text={t.followUp} label="复制接话提示" /></View>}
      </View>)}
    </> : <>
      <View style={ui.card}><View style={ui.between}><Text style={ui.heading}>给我一点聊天灵感</Text><Text style={s.badge}>真实 AI</Text></View><Text style={ui.note}>结合你的人设、关系与场景，想一句更适合当下的开场白。</Text>
        {persona && <><Action secondary label={(persona.data.cards.find(c => c.id === persona.selection.cardId)?.name || '自然真诚') + (showPersona ? ' · 收起选择' : ' · 切换人设')} onPress={() => setShowPersona(!showPersona)} disabled={busy} />{showPersona && <PersonaChoices state={persona} disabled={busy} onChange={p => { invalidate(); onPersona(p); }} />}</>}
        <Text style={ui.label}>补充一点背景 <Text style={ui.note}>（选填）</Text></Text><TextInput accessibilityLabel="话题背景" multiline maxLength={200} editable={!busy} value={background} onChangeText={value => { invalidate(); setBackground(value); }} placeholder="例如：刚认识，想从共同爱好聊起…" placeholderTextColor={colors.muted} style={[ui.input, { minHeight: 100 }]} /><Text style={[ui.note, { textAlign: 'right' }]}>{background.length}/200</Text>
        <Action label={busy ? '正在想话题…' : ai.length ? 'AI 再想一批' : '帮我想个话题'} loading={busy} onPress={() => void generate()} disabled={busy || !ready || !persona} />{busy && <Action secondary label="取消生成" onPress={cancel} />}
        <Text style={ui.note}>{ready ? '仅将你主动填写的背景发往自己的 API，供应商可能按用量计费。' : '请先到“我的 → 我的 API”配置；离线话题库可直接使用。'}</Text>
      </View>
      {ai.map((text, i) => <View key={i + ':' + text} style={ui.card}><Text style={ui.selectedText}>灵感 {String(i + 1).padStart(2, '0')}</Text><Text selectable style={s.opener}>{text}</Text><CopyAction text={text} label="复制这个话题" /></View>)}
    </>}
    {!!error && <Text accessibilityRole="alert" style={[ui.note, { color: colors.danger }]}>{error}</Text>}
  </>;
}
const s = StyleSheet.create({
  modes: { flexDirection: 'row', padding: 4, backgroundColor: '#E9EBF3', borderRadius: 15 }, mode: { flex: 1, minHeight: 48, justifyContent: 'center', alignItems: 'center', borderRadius: 11, padding: 6 }, activeMode: { backgroundColor: colors.surface }, modeText: { color: colors.secondary, fontSize: 14, lineHeight: 22 }, wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, category: { width: '31%', minHeight: 48, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 4, paddingVertical: 12, backgroundColor: colors.surface, borderRadius: 13, borderWidth: 1, borderColor: colors.border }, selected: { borderColor: colors.primary, backgroundColor: colors.soft }, categoryText: { fontSize: 14, lineHeight: 22, textAlign: 'center', color: colors.secondary }, favorite: { minHeight: 48, minWidth: 74, justifyContent: 'center', alignItems: 'center' }, opener: { fontSize: 17, lineHeight: 29, color: colors.ink }, cardActions: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 }, follow: { backgroundColor: '#F4F1FC', borderRadius: 14, padding: 14, gap: 10 }, badge: { backgroundColor: colors.soft, color: colors.primary, fontSize: 12, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, fontWeight: '700' },
});
