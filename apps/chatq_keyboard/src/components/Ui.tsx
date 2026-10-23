import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import { colors, ui } from '../design';

export function Action({ label, onPress, disabled = false, secondary = false, loading = false, style, accessibilityLabel }: { label: string; onPress: () => void; disabled?: boolean; secondary?: boolean; loading?: boolean; style?: StyleProp<ViewStyle>; accessibilityLabel?: string }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel || label} accessibilityState={{ disabled, busy: loading }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [s.action, secondary ? s.outline : s.primary, pressed && (secondary ? s.softPressed : s.pressed), disabled && s.disabled, style]}>
    {loading && <ActivityIndicator size="small" color={secondary ? colors.primary : colors.surface} />}
    <Text style={[s.actionText, secondary && s.outlineText]}>{label}</Text>
  </Pressable>;
}
export function CopyAction({ text, label = '复制', style, accessibilityLabel, compact = false }: { text: string; label?: string; style?: StyleProp<ViewStyle>; accessibilityLabel?: string; compact?: boolean }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { setCopied(false); return () => { if (timer.current) clearTimeout(timer.current); }; }, [text]);
  return <View style={style}><Action secondary accessibilityLabel={copied ? '已复制 ✓' : accessibilityLabel || label} label={copied ? (compact ? '已复制' : '已复制 ✓') : label} style={compact ? { paddingHorizontal: 6 } : undefined} onPress={() => { Clipboard.setString(text); setCopied(true); if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => setCopied(false), 1800); }} />{!compact && <Text accessibilityLiveRegion="polite" style={s.copyFeedback}>{copied ? '已复制，回聊天窗口粘贴即可' : ''}</Text>}</View>;
}
export function PageIntro({ title, note }: { title: string; note: string }) {
  return <View style={{ gap: 6 }}><Text accessibilityRole="header" style={ui.title}>{title}</Text><Text style={ui.note}>{note}</Text></View>;
}
export function EmptyState({ title, note }: { title: string; note: string }) {
  return <View style={s.empty}><View style={s.emptyMark}><Text style={{ color: colors.primary, fontSize: 24 }}>✦</Text></View><Text style={ui.heading}>{title}</Text><Text style={[ui.note, { textAlign: 'center' }]}>{note}</Text></View>;
}
export type IconName = 'reply' | 'chat' | 'topics' | 'persona' | 'history' | 'setup';
export function NavIcon({ name, color }: { name: IconName; color: string }) {
  const stroke = { borderColor: color };
  return <View accessible={false} importantForAccessibility="no-hide-descendants" style={s.icon}>
    {name === 'chat' && <><View style={[s.bubble, stroke, { top: 2, left: 1, width: 18, height: 14 }]} /><View style={[s.bubble, stroke, { top: 10, left: 10, width: 16, height: 13, backgroundColor: colors.background }]} /></>}
    {name === 'reply' && <><View style={[s.bubble, stroke]} /><View style={[s.tail, { borderLeftColor: color, borderBottomColor: color }]} /><View style={[s.messageLine, { backgroundColor: color }]} /></>}
    {name === 'topics' && <><Text allowFontScaling={false} style={{ color, fontSize: 28, lineHeight: 29 }}>✦</Text><View style={[s.sparkDot, { backgroundColor: color }]} /></>}
    {name === 'persona' && <><View style={[s.head, stroke]} /><View style={[s.shoulders, stroke]} /></>}
    {name === 'history' && <><View style={[s.clock, stroke]} /><View style={[s.clockHand, { backgroundColor: color }]} /><View style={[s.clockHand2, { backgroundColor: color }]} /></>}
    {name === 'setup' && <><View style={[s.keyboard, stroke]} /><View style={s.keyDots}>{[0, 1, 2, 3, 4, 5].map(n => <View key={n} style={{ width: 3, height: 3, borderRadius: 1, backgroundColor: color }} />)}</View><View style={[s.space, { backgroundColor: color }]} /></>}
  </View>;
}
const s = StyleSheet.create({
  action: { minHeight: 48, minWidth: 48, borderRadius: 13, paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1 },
  primary: { backgroundColor: colors.primary, borderColor: colors.primary }, outline: { backgroundColor: colors.surface, borderColor: colors.border },
  pressed: { backgroundColor: colors.primaryPressed }, softPressed: { backgroundColor: colors.soft }, disabled: { opacity: 0.45 }, actionText: { color: colors.surface, fontSize: 15, lineHeight: 22, fontWeight: '700', textAlign: 'center', flexShrink: 1 }, outlineText: { color: colors.primary },
  copyFeedback: { fontSize: 12, lineHeight: 18, color: colors.success, minHeight: 18, textAlign: 'center' },
  empty: { alignItems: 'center', paddingHorizontal: 24, paddingVertical: 34, gap: 10, backgroundColor: colors.surface, borderRadius: 20 }, emptyMark: { height: 56, width: 56, borderRadius: 18, backgroundColor: colors.soft, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  icon: { height: 28, width: 28, alignItems: 'center', justifyContent: 'center' }, bubble: { position: 'absolute', top: 4, left: 3, width: 22, height: 17, borderWidth: 1.8, borderRadius: 6 }, tail: { position: 'absolute', left: 7, bottom: 4, width: 5, height: 6, borderLeftWidth: 1.8, borderBottomWidth: 1.8, transform: [{ skewY: '-30deg' }] }, messageLine: { width: 10, height: 1.8, position: 'absolute', left: 9, top: 12, borderRadius: 1 }, sparkDot: { position: 'absolute', right: 1, top: 2, width: 4, height: 4, borderRadius: 2 },
  head: { width: 9, height: 9, borderWidth: 1.8, borderRadius: 5, position: 'absolute', top: 3 }, shoulders: { width: 21, height: 11, borderWidth: 1.8, borderRadius: 9, position: 'absolute', bottom: 3 }, clock: { width: 22, height: 22, borderWidth: 1.8, borderRadius: 12 }, clockHand: { height: 7, width: 1.8, position: 'absolute', top: 7, left: 13 }, clockHand2: { height: 1.8, width: 6, position: 'absolute', top: 13, left: 13 }, keyboard: { width: 26, height: 20, borderWidth: 1.8, borderRadius: 5 }, keyDots: { width: 15, gap: 3, position: 'absolute', top: 9, flexDirection: 'row', flexWrap: 'wrap' }, space: { width: 9, height: 2, position: 'absolute', bottom: 8, borderRadius: 1 },
});
