import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, AppState, Modal, ScrollView, Pressable, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { Action, CopyAction, EmptyState, NavIcon } from './Ui';
import { ExpressionPicker } from './ExpressionPanel';
import { appendExpression } from '../services/expressions';
import { colors, ui } from '../design';
import { loadSavedReplies, setSavedReply, type SavedReply } from '../services/savedReplies';
import { previousReply, decorateReply, refinementLabels, refinementNotes, type ReplyCard, type Refinement } from '../services/replyCards';

export function ReplyCards({ cards, busy, onRefine, onRestore }: { cards: ReplyCard[]; busy: boolean; onRefine: (index: number, mode: Refinement) => void; onRestore: (index: number, card: ReplyCard) => void }) {
  const { fontScale } = useWindowDimensions();
  const [saved, setSaved] = useState<SavedReply[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [decorating, setDecorating] = useState<ReplyCard | null>(null);
  const [rewriting, setRewriting] = useState<ReplyCard | null>(null);
  const rewriteLock = useRef(false);
  useEffect(() => { const sub = AppState.addEventListener('change', state => { if (state === 'active') void refreshSaved(); else { setRewriting(null); setDecorating(null); } }); return () => sub.remove(); }, []);
  const [favoriteError, setFavoriteError] = useState('');
  const saveLock = useRef(false);
  const alive = useRef(true), revision = useRef(0);
  async function refreshSaved() {
    if (saveLock.current) return;
    const ticket = ++revision.current;
    try { const rows = await loadSavedReplies(); if (alive.current && ticket === revision.current) { setSaved(rows); setFavoriteError(''); } }
    catch { if (alive.current && ticket === revision.current) setFavoriteError('收藏状态暂未读取成功，可重试；回复仍可复制。'); }
  }
  useEffect(() => { alive.current = true; void refreshSaved(); return () => { alive.current = false; revision.current++; }; }, [cards]);
  async function favorite(card: ReplyCard) {
    if (saveLock.current) return; saveLock.current = true; revision.current++; setSaving(true);
    try { const rows = await loadSavedReplies(); const next = await setSavedReply(card.text, card.label, !rows.some(row => row.text === card.text)); if (alive.current) { setSaved(next); setFavoriteError(''); } }
    catch (e) { if (alive.current) Alert.alert('收藏失败', e instanceof Error ? e.message : '请稍后重试'); }
    finally { saveLock.current = false; if (alive.current) setSaving(false); }
  }
  return <>{!!favoriteError && !!cards.length && <View style={ui.card}><Text accessibilityRole="alert" style={ui.note}>{favoriteError}</Text><Action secondary label="重试读取收藏" disabled={saving} onPress={() => void refreshSaved()} /></View>}{cards.map((card, index) => <View key={index} style={[ui.card, { padding: 0, overflow: 'hidden' }]}>
    <View style={{ padding: 14, backgroundColor: colors.soft, flexDirection: 'row', alignItems: 'center', gap: 10 }}><NavIcon name="reply" color={colors.primary} /><Text style={[ui.selectedText, { flex: 1, lineHeight: 22 }]}>{card.label}</Text><Text style={ui.note}>{String(index + 1).padStart(2, '0')}</Text></View>
    <View style={{ padding: 16, gap: 12 }}><Text selectable style={{ ...ui.text, fontSize: 18, lineHeight: 30 }}>{card.text}</Text>
    <CopyAction primary text={card.text} label="复制回复" />
    <View style={[ui.row, { flexWrap: 'wrap', alignItems: 'stretch' }]}><Action secondary label={saved?.some(row => row.text === card.text) ? '已收藏' : '收藏'} disabled={saving} onPress={() => void favorite(card)} style={{ flex: 1, minWidth: fontScale >= 1.3 ? '45%' : 48, paddingHorizontal: 8 }} /><Action secondary label="加表情" accessibilityLabel="加表情" disabled={busy} onPress={() => setDecorating(card)} style={{ flex: 1, minWidth: fontScale >= 1.3 ? '45%' : 48, paddingHorizontal: 8 }} /><Action secondary label="改一改" accessibilityLabel="改一改" disabled={busy} style={{ flex: 1, minWidth: fontScale >= 1.3 ? '100%' : 48, paddingHorizontal: 8 }} onPress={() => { rewriteLock.current = false; setRewriting(card); }} /></View>
    {!!card.versions.length && <Action secondary label="恢复上一版" disabled={busy} onPress={() => onRestore(index, previousReply(card))} />}
    </View>
  </View>)}<Modal visible={!!rewriting} animationType="slide" onRequestClose={() => setRewriting(null)}><SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
    <View style={[ui.between, { padding: 16, gap: 8 }]}><Text accessibilityRole="header" style={ui.heading}>改写与翻译</Text><Action secondary label="返回回复" onPress={() => setRewriting(null)} /></View>
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}><Text style={ui.note}>选择一种处理方式。使用你自己的 API，供应商可能计费；处理后可恢复上一版。</Text>
    {rewriting && <View style={ui.card}><Text style={ui.label}>这次处理的原句</Text><Text numberOfLines={3} style={ui.text}>{rewriting.text}</Text></View>}
    {(Object.keys(refinementLabels) as Refinement[]).map(mode => <Pressable key={mode} accessibilityRole="button" accessibilityLabel={refinementLabels[mode]} accessibilityState={{ disabled: busy }} disabled={busy} style={[ui.card, { minHeight: 64, gap: 4 }]} onPress={() => {
      if (!rewriting || busy || rewriteLock.current) return;
      const index = cards.indexOf(rewriting); rewriteLock.current = true; setRewriting(null);
      if (index >= 0) onRefine(index, mode);
    }}><Text style={ui.heading}>{refinementLabels[mode]}</Text><Text style={ui.note}>{refinementNotes[mode]}</Text></Pressable>)}
    </ScrollView></SafeAreaView></Modal><ExpressionPicker visible={!!decorating} onClose={() => setDecorating(null)} onSelect={text => { if (!decorating) return; const index = cards.indexOf(decorating); if (index < 0 || busy) { setDecorating(null); return; } try { onRestore(index, decorateReply(decorating, appendExpression(decorating.text, text))); setDecorating(null); } catch (e) { Alert.alert('无法添加', e instanceof Error ? e.message : '请重试'); } }} /></>;
}

export function SavedRepliesPanel() {
  const [rows, setRows] = useState<SavedReply[]>([]), [query, setQuery] = useState(''), [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const alive = useRef(true), revision = useRef(0), removeLock = useRef(false);
  async function refresh() {
    if (removeLock.current) return;
    const ticket = ++revision.current;
    try { const value = await loadSavedReplies(); if (alive.current && ticket === revision.current) { setRows(value); setLoaded(true); setError(''); } }
    catch { if (alive.current && ticket === revision.current) setError('常用句暂时读取失败，请重试。'); }
  }
  useEffect(() => { alive.current = true; void refresh(); const sub = AppState.addEventListener('change', state => { if (state === 'active') void refresh(); }); return () => { alive.current = false; revision.current++; sub.remove(); }; }, []);
  async function remove(row: SavedReply) {
    if (removeLock.current) return;
    removeLock.current = true; revision.current++; setBusy(true);
    try { const next = await setSavedReply(row.text, row.label, false); if (alive.current) { setRows(next); setError(''); } }
    catch (e) { if (alive.current) setError(e instanceof Error ? e.message : '移除失败'); }
    finally { removeLock.current = false; if (alive.current) setBusy(false); }
  }
  const visible = rows.filter(row => (row.text + row.label).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  return <><Text accessibilityRole="header" style={ui.title}>我的常用句</Text><Text style={ui.note}>与安卓键盘互通 · 离线可用 · {rows.length}/100 句</Text>
    <TextInput accessibilityLabel="搜索常用句" value={query} onChangeText={setQuery} maxLength={100} placeholder="搜索句子或风格…" placeholderTextColor={colors.muted} style={ui.input} />
    {!!error && <View style={ui.card}><Text accessibilityRole="alert" style={{ ...ui.text, color: colors.danger }}>{error}</Text><Action secondary label="重试读取常用句" disabled={busy} onPress={() => void refresh()} /></View>}
    {!loaded && !error && <Text accessibilityLiveRegion="polite" style={ui.note}>正在读取常用句…</Text>}
    {loaded && !visible.length && !error && <EmptyState title={query ? '没有找到这句话' : '把喜欢的表达留下来'} note={query ? '换个关键词试试。' : '在回复卡片上点收藏，聊天时可从键盘直接填入。'} />}
    {visible.map(row => <View key={row.text} style={ui.card}><Text style={ui.selectedText}>{row.label}</Text><Text selectable style={ui.text}>{row.text}</Text><View style={ui.between}><CopyAction text={row.text} label="复制常用句" /><Pressable accessibilityRole="button" accessibilityLabel={'移除常用句：' + row.text} disabled={busy} onPress={() => void remove(row)} style={{ minWidth: 48, minHeight: 48, justifyContent: 'center' }}><Text style={ui.note}>移除</Text></Pressable></View></View>)}
  </>;
}
