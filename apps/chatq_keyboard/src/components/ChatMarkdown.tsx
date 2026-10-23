import React, { useMemo } from 'react';
import { Alert, Linking, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { markdownBlocks, markdownInline, safeLink } from '../services/markdown';
import { colors, ui } from '../design';
import { CopyAction } from './Ui';

function openLink(value: string) {
  const url = safeLink(value); if (!url) return;
  Alert.alert('打开外部链接？', url, [{ text: '取消', style: 'cancel' }, { text: '打开浏览器', onPress: () => { void Linking.openURL(url).catch(() => Alert.alert('无法打开链接', '请复制回答中的地址后手动打开。')); } }]);
}
function Inline({ text }: { text: string }) {
  return <>{markdownInline(text).map((p, i) => <Text key={i} accessibilityRole={p.url ? 'link' : undefined} onPress={p.url ? () => openLink(p.url!) : undefined} style={p.kind === 'bold' ? s.bold : p.kind === 'italic' ? s.italic : p.kind === 'strike' ? s.strike : p.kind === 'code' ? s.inlineCode : p.kind === 'link' ? s.link : undefined}>{p.text}</Text>)}</>;
}
export function ChatMarkdown({ text }: { text: string }) {
  const blocks = useMemo(() => markdownBlocks(text), [text]);
  return <View style={{ gap: 10 }}>{blocks.map((block, index) => block.kind === 'code' ? <View key={index} style={s.code}>
    <View style={ui.between}><Text style={ui.note}>{block.language || '代码'}</Text><CopyAction compact label="复制代码" accessibilityLabel={'复制代码块 ' + (index + 1)} text={block.text} /></View>
    <ScrollView horizontal contentContainerStyle={{ paddingBottom: 4 }}><Text selectable style={s.codeText}>{block.text || ' '}</Text></ScrollView>
  </View> : block.kind === 'rule' ? <View key={index} style={s.rule} /> : <Text selectable key={index} style={[s.text, block.kind === 'heading' && { fontSize: block.level === 1 ? 21 : block.level === 2 ? 19 : 17, fontWeight: '700', lineHeight: 29 }, block.kind === 'quote' && s.quote, block.kind === 'list' && { paddingLeft: 4 }]}><Inline text={block.text} /></Text>)}</View>;
}
const s = StyleSheet.create({
  text: { fontSize: 16, lineHeight: 26, color: colors.ink }, bold: { fontWeight: '700' }, italic: { fontStyle: 'italic' }, strike: { textDecorationLine: 'line-through' },
  inlineCode: { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', backgroundColor: colors.soft }, link: { color: colors.primary, textDecorationLine: 'underline' },
  quote: { borderLeftWidth: 3, borderColor: colors.primary, paddingLeft: 12, color: colors.secondary }, rule: { height: 1, backgroundColor: colors.border, marginVertical: 4 },
  code: { borderRadius: 12, backgroundColor: '#F1F3F8', padding: 10, gap: 8, borderWidth: 1, borderColor: colors.border },
  codeText: { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 14, lineHeight: 23, color: colors.ink },
});
