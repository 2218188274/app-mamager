import React, { useState } from 'react';
import { Image, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Clipboard from '@react-native-clipboard/clipboard';
import { keyboardBridge } from '../../modules/chatq-keyboard';
import { colors, ui } from '../design';
import { expressionGroups, findExpressions, type Expression } from '../services/expressions';
import { Action, EmptyState, NavIcon } from './Ui';
import { Choices } from './PersonaPanel';

const stickers = [
  { id: 'hello', label: '嗨，你好', source: require('../../modules/chatq-keyboard/android/src/main/assets/stickers/hello.png') },
  { id: 'hug', label: '给你抱抱', source: require('../../modules/chatq-keyboard/android/src/main/assets/stickers/hug.png') },
  { id: 'thanks', label: '谢谢你呀', source: require('../../modules/chatq-keyboard/android/src/main/assets/stickers/thanks.png') },
];
export function ExpressionPanel({ onSelect }: { onSelect?: (value: string) => void }) {
  const [kind, setKind] = useState('text'), [group, setGroup] = useState('all'), [query, setQuery] = useState('');
  const [notice, setNotice] = useState(''), [error, setError] = useState(''), [selected, setSelected] = useState<typeof stickers[number] | null>(null), [sharing, setSharing] = useState(false);
  const { width, fontScale } = useWindowDimensions();
  const matches = findExpressions(query, group);
  function choose(item: Expression) { setError(''); if (onSelect) onSelect(item.text); else { Clipboard.setString(item.text); setNotice(`已复制${item.label}，回聊天窗口粘贴即可`); } }
  async function share() {
    if (!selected || sharing) return;
    setSharing(true); setError('');
    try { if (!keyboardBridge?.shareSticker) throw new Error('当前平台暂不支持图片分享'); await keyboardBridge.shareSticker(selected.id); }
    catch (e) { setError(e instanceof Error ? e.message : '暂时无法分享，请重试'); }
    finally { setSharing(false); }
  }
  return <>
    {!onSelect && <Choices wrap hideLabel label="表情类型" items={[{ id: 'text', name: 'Emoji · 颜文字' }, { id: 'stickers', name: '图片表情' }]} value={kind} onChange={id => { setKind(id); setNotice(''); setError(''); }} />}
    {kind === 'text' ? <>
      <View style={s.search}><NavIcon name="search" color={colors.muted} /><TextInput accessibilityLabel="搜索表情" value={query} onChangeText={setQuery} maxLength={40} placeholder="搜索开心、抱抱、谢谢…" placeholderTextColor={colors.muted} style={s.searchInput} /></View>
      <Choices wrap hideLabel label="表情分类" items={expressionGroups} value={group} onChange={setGroup} />
      <Text accessibilityLiveRegion="polite" style={[ui.note, { color: notice ? colors.success : colors.muted }]}>{notice || (onSelect ? '选一个加到回复末尾，不消耗 AI 额度' : '点一下复制 · 不消耗 AI 额度')}</Text>
      {!matches.length && <EmptyState title="没找到这个表情" note="试试“开心”“抱抱”，或切换到全部。" />}
      <View style={s.grid}>{matches.map(item => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={(onSelect ? '添加表情：' : '复制表情：') + item.label} onPress={() => choose(item)} style={({ pressed }) => [s.expression, { width: fontScale >= 1.6 ? '100%' : item.group === 'kaomoji' || width < 350 ? '48%' : '31%' }, pressed && { backgroundColor: colors.soft }]}><Text style={{ fontSize: item.group === 'kaomoji' ? 18 : 30, color: colors.ink, textAlign: 'center' }}>{item.text}</Text><Text style={ui.note}>{item.label}</Text></Pressable>)}</View>
    </> : <>
      <View style={s.pack}><View style={{ flex: 1, gap: 6 }}><Text accessibilityRole="header" style={ui.heading}>软软云 · 日常陪伴</Text><Text style={ui.note}>聊商原创 · 3 张静态表情</Text></View><Image accessible={false} source={stickers[0].source} style={{ width: 68, height: 68 }} /></View>
      <Text style={ui.note}>点开预览，再选择分享。由你在目标应用确认发送。</Text>
      <View style={s.grid}>{stickers.map(item => <Pressable accessibilityRole="button" accessibilityLabel={'预览表情：' + item.label} key={item.id} onPress={() => { setSelected(item); setError(''); }} style={[s.sticker, { width: fontScale >= 1.6 ? '100%' : '48%' }]}><Image source={item.source} style={s.stickerImage} resizeMode="contain" /><Text style={ui.label}>{item.label}</Text></Pressable>)}</View>
    </>}
    <Modal visible={!!selected} transparent animationType="fade" onRequestClose={() => { if (!sharing) setSelected(null); }}><SafeAreaView style={s.overlay}><ScrollView contentContainerStyle={s.previewScroll}><View style={s.preview}>{selected && <><Text accessibilityRole="header" style={ui.heading}>{selected.label}</Text><Image source={selected.source} style={{ width: '100%', height: 210 }} resizeMode="contain" /><Text style={ui.note}>透明 PNG 图片 · 分享后由你确认发送</Text>{!!error && <Text accessibilityRole="alert" style={{ ...ui.text, color: colors.danger }}>{error}</Text>}<Action icon="emoji" label={Platform.OS === 'android' ? '分享图片表情' : '图片分享暂支持安卓'} disabled={sharing || Platform.OS !== 'android'} loading={sharing} onPress={() => void share()} /><Action secondary label="关闭预览" disabled={sharing} onPress={() => setSelected(null)} /></>}</View></ScrollView></SafeAreaView></Modal>
  </>;
}
export function ExpressionPicker({ visible, onClose, onSelect }: { visible: boolean; onClose: () => void; onSelect: (text: string) => void }) {
  return <Modal visible={visible} animationType="slide" onRequestClose={onClose}><SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}><View style={[ui.between, { padding: 16 }]}><Text accessibilityRole="header" style={ui.heading}>给回复加表情</Text><Action secondary label="完成" onPress={onClose} /></View><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 12 }}><ExpressionPanel onSelect={onSelect} /></ScrollView></SafeAreaView></Modal>;
}
const s = StyleSheet.create({
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border }, searchInput: { flex: 1, minHeight: 52, color: colors.ink, fontSize: 15 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between' }, expression: { minHeight: 88, padding: 12, gap: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderRadius: 18 },
  pack: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 16, backgroundColor: colors.soft, borderRadius: 20 }, sticker: { padding: 14, alignItems: 'center', gap: 8, backgroundColor: colors.surface, borderRadius: 20 }, stickerImage: { width: '100%', height: 110 },
  overlay: { flex: 1, backgroundColor: '#221B3C99' }, previewScroll: { flexGrow: 1, justifyContent: 'center', padding: 20 }, preview: { ...ui.card, gap: 14 },
});
