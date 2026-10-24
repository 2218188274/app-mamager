import React, { useEffect, useRef, useState } from 'react';
import { Alert, AppState, Pressable, Text, TextInput, View } from 'react-native';
import { Action, CopyAction, EmptyState } from './Ui';
import { colors, ui } from '../design';
import { loadSavedReplies, setSavedReply, type SavedReply } from '../services/savedReplies';
import { previousReply, type ReplyCard, type Refinement } from '../services/replyCards';

export function ReplyCards({ cards, busy, onRefine, onRestore }: { cards: ReplyCard[]; busy: boolean; onRefine: (index: number, mode: Refinement) => void; onRestore: (index: number, card: ReplyCard) => void }) {
  const [saved, setSaved] = useState<SavedReply[] | null>(null);
  const [saving, setSaving] = useState(false);
  const saveLock = useRef(false);
  useEffect(() => { let alive = true; void loadSavedReplies().then(rows => { if (alive) setSaved(rows); }).catch(() => {}); return () => { alive = false; }; }, [cards]);
  async function favorite(card: ReplyCard) {
    if (saveLock.current) return; saveLock.current = true; setSaving(true);
    try { const rows = await loadSavedReplies(); setSaved(await setSavedReply(card.text, card.label, !rows.some(row => row.text === card.text))); }
    catch (e) { Alert.alert('收藏失败', e instanceof Error ? e.message : '请稍后重试'); }
    finally { saveLock.current = false; setSaving(false); }
  }
  return <>{cards.map((card, index) => <View key={index} style={ui.card}>
    <View style={ui.between}><Text style={[ui.selectedText, { flex: 1 }]}>{card.label}</Text><Text style={ui.note}>{index + 1}/{cards.length}</Text></View>
    <Text selectable style={{ ...ui.text, fontSize: 18, lineHeight: 29 }}>{card.text}</Text>
    <View style={[ui.row, { flexWrap: 'wrap' }]}><CopyAction text={card.text} label="复制回复" style={{ flex: 1, minWidth: 110 }} /><Action secondary label={saved?.some(row => row.text === card.text) ? '已收藏' : '收藏'} disabled={saving} onPress={() => void favorite(card)} /><Action secondary label="改一改" disabled={busy} onPress={() => Alert.alert('改写这一句', '保留原意，选择一种调整。成功生成会消耗 AI 额度；上一版仍可恢复。', [{ text: '更简短', onPress: () => onRefine(index, 'shorter') }, { text: '更自然', onPress: () => onRefine(index, 'natural') }, { text: '取消', style: 'cancel' }])} /></View>
    {!!card.versions.length && <Action secondary label="恢复上一版" disabled={busy} onPress={() => onRestore(index, previousReply(card))} />}
  </View>)}</>;
}

export function SavedRepliesPanel() {
  const [rows, setRows] = useState<SavedReply[]>([]), [query, setQuery] = useState(''), [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { let alive = true; const refresh = () => { void loadSavedReplies().then(value => { if (alive) { setRows(value); setError(''); } }).catch(e => { if (alive) setError(e.message); }); }; refresh(); const sub = AppState.addEventListener('change', state => { if (state === 'active') refresh(); }); return () => { alive = false; sub.remove(); }; }, []);
  async function remove(row: SavedReply) { if (busy) return; setBusy(true); try { setRows(await setSavedReply(row.text, row.label, false)); } catch (e) { setError(e instanceof Error ? e.message : '移除失败'); } finally { setBusy(false); } }
  const visible = rows.filter(row => (row.text + row.label).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  return <><Text accessibilityRole="header" style={ui.title}>我的常用句</Text><Text style={ui.note}>与安卓键盘互通 · 离线可用 · {rows.length}/100 句</Text>
    <TextInput accessibilityLabel="搜索常用句" value={query} onChangeText={setQuery} maxLength={100} placeholder="搜索句子或风格…" placeholderTextColor={colors.muted} style={ui.input} />
    {!!error && <Text accessibilityRole="alert" style={{ ...ui.text, color: colors.danger }}>{error}</Text>}
    {!visible.length && !error && <EmptyState title={query ? '没有找到这句话' : '把喜欢的表达留下来'} note={query ? '换个关键词试试。' : '在回复卡片上点收藏，聊天时可从键盘直接填入。'} />}
    {visible.map(row => <View key={row.text} style={ui.card}><Text style={ui.selectedText}>{row.label}</Text><Text selectable style={ui.text}>{row.text}</Text><View style={ui.between}><CopyAction text={row.text} label="复制常用句" /><Pressable accessibilityRole="button" accessibilityLabel={'移除常用句：' + row.text} disabled={busy} onPress={() => void remove(row)} style={{ minWidth: 48, minHeight: 48, justifyContent: 'center' }}><Text style={ui.note}>移除</Text></Pressable></View></View>)}
  </>;
}
