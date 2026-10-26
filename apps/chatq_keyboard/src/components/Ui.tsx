import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import { colors, ui } from '../design';

export function Action({ label, onPress, disabled = false, secondary = false, loading = false, style, accessibilityLabel, icon }: { label: string; onPress: () => void; disabled?: boolean; secondary?: boolean; loading?: boolean; style?: StyleProp<ViewStyle>; accessibilityLabel?: string; icon?: IconName }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel || label} accessibilityState={{ disabled, busy: loading }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [s.action, secondary ? s.outline : s.primary, pressed && (secondary ? s.softPressed : s.pressed), disabled && s.disabled, style]}>
    {loading && <ActivityIndicator size="small" color={secondary ? colors.primary : colors.surface} />}
    {!!icon && !loading && <NavIcon name={icon} color={secondary ? colors.primary : colors.surface} />}
    <Text style={[s.actionText, secondary && s.outlineText]}>{label}</Text>
  </Pressable>;
}
export function CopyAction({ text, label = '复制', style, accessibilityLabel, compact = false, primary = false, feedback = '已复制，回聊天窗口粘贴即可' }: { text: string; label?: string; style?: StyleProp<ViewStyle>; accessibilityLabel?: string; compact?: boolean; primary?: boolean; feedback?: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { setCopied(false); return () => { if (timer.current) clearTimeout(timer.current); }; }, [text]);
  return <View style={style}><Action secondary={!primary} icon={primary ? 'copy' : undefined} accessibilityLabel={copied ? '已复制 ✓' : accessibilityLabel || label} label={copied ? (compact ? '已复制' : '已复制 ✓') : label} style={compact ? { paddingHorizontal: 6 } : undefined} onPress={() => { Clipboard.setString(text); setCopied(true); if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => setCopied(false), 1800); }} />{!compact && copied && <Text accessibilityLiveRegion="polite" style={s.copyFeedback}>{feedback}</Text>}</View>;
}
export function PageIntro({ title, note }: { title: string; note: string }) {
  return <View style={{ gap: 6 }}><Text accessibilityRole="header" style={ui.title}>{title}</Text><Text style={ui.note}>{note}</Text></View>;
}
export function ToolTile({ icon, title, note, onPress, compact = false, tint = colors.soft }: { icon: IconName; title: string; note?: string; onPress: () => void; compact?: boolean; tint?: string }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress} style={({ pressed }) => [s.toolTile, compact && { minWidth: 60 }, pressed && s.softPressed]}>
    <View style={[s.toolIcon, { backgroundColor: tint }, compact && { width: 36, height: 36 }]}><NavIcon name={icon} color={colors.primary} /></View>
    <Text style={s.toolTitle}>{title}</Text>{note && <Text style={s.toolNote}>{note}</Text>}
  </Pressable>;
}
export function SettingRow({ icon, title, note, onPress }: { icon: IconName; title: string; note: string; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress} style={({ pressed }) => [s.settingRow, pressed && s.softPressed]}>
    <View style={s.toolIcon}><NavIcon name={icon} color={colors.primary} /></View><View style={{ flex: 1, gap: 2 }}><Text style={ui.text}>{title}</Text><Text style={ui.note}>{note}</Text></View><Text accessible={false} style={s.chevron}>›</Text>
  </Pressable>;
}
export function EmptyState({ title, note }: { title: string; note: string }) {
  return <View style={s.empty}><View style={s.emptyMark}><Text style={{ color: colors.primary, fontSize: 24 }}>✦</Text></View><Text style={ui.heading}>{title}</Text><Text style={[ui.note, { textAlign: 'center' }]}>{note}</Text></View>;
}
export type IconName = 'reply' | 'chat' | 'topics' | 'persona' | 'history' | 'setup' | 'emoji' | 'copy' | 'edit' | 'bookmark' | 'search';
export function NavIcon({ name, color }: { name: IconName; color: string }) {
  const stroke = { borderColor: color };
  return <View accessible={false} importantForAccessibility="no-hide-descendants" style={s.icon}>
    {name === 'emoji' && <><View style={[s.clock, stroke]} /><View style={{ position: 'absolute', top: 9, left: 9, width: 3, height: 3, borderRadius: 2, backgroundColor: color }} /><View style={{ position: 'absolute', top: 9, right: 8, width: 3, height: 3, borderRadius: 2, backgroundColor: color }} /><View style={{ position: 'absolute', bottom: 8, width: 10, height: 5, borderBottomWidth: 2, borderColor: color, borderRadius: 5 }} /></>}
    {name === 'copy' && <><View style={[s.bubble, stroke, { width: 14, height: 17, left: 4, top: 3, borderRadius: 3 }]} /><View style={[s.bubble, stroke, { width: 14, height: 17, left: 10, top: 8, borderRadius: 3 }]} /></>}
    {name === 'edit' && <><View style={{ width: 7, height: 21, borderWidth: 1.8, borderColor: color, borderRadius: 2, transform: [{ rotate: '40deg' }] }} /><View style={{ position: 'absolute', width: 10, height: 2, bottom: 2, right: 1, backgroundColor: color }} /></>}
    {name === 'bookmark' && <View style={{ width: 16, height: 21, borderWidth: 1.8, borderColor: color, borderTopLeftRadius: 4, borderTopRightRadius: 4, borderBottomLeftRadius: 7, borderBottomRightRadius: 7 }} />}
    {name === 'search' && <><View style={[s.clock, stroke, { width: 17, height: 17, position: 'absolute', left: 3, top: 2 }]} /><View style={{ width: 10, height: 2, backgroundColor: color, position: 'absolute', right: 1, bottom: 5, transform: [{ rotate: '45deg' }] }} /></>}
    {name === 'chat' && <><View style={[s.bubble, stroke, { top: 2, left: 1, width: 18, height: 14 }]} /><View style={[s.bubble, stroke, { top: 10, left: 10, width: 16, height: 13, backgroundColor: colors.background }]} /></>}
    {name === 'reply' && <><View style={[s.bubble, stroke]} /><View style={[s.tail, { borderLeftColor: color, borderBottomColor: color }]} /><View style={[s.messageLine, { backgroundColor: color }]} /></>}
    {name === 'topics' && <><Text allowFontScaling={false} style={{ color, fontSize: 28, lineHeight: 29 }}>✦</Text><View style={[s.sparkDot, { backgroundColor: color }]} /></>}
    {name === 'persona' && <><View style={[s.head, stroke]} /><View style={[s.shoulders, stroke]} /></>}
    {name === 'history' && <><View style={[s.clock, stroke]} /><View style={[s.clockHand, { backgroundColor: color }]} /><View style={[s.clockHand2, { backgroundColor: color }]} /></>}
    {name === 'setup' && <><View style={[s.keyboard, stroke]} /><View style={s.keyDots}>{[0, 1, 2, 3, 4, 5].map(n => <View key={n} style={{ width: 3, height: 3, borderRadius: 1, backgroundColor: color }} />)}</View><View style={[s.space, { backgroundColor: color }]} /></>}
  </View>;
}
const s = StyleSheet.create({
  toolTile: { flex: 1, minWidth: 120, minHeight: 76, paddingHorizontal: 4, paddingVertical: 8, borderRadius: 18, alignItems: 'center', gap: 5, backgroundColor: colors.surface },
  toolIcon: { width: 40, height: 40, borderRadius: 13, backgroundColor: colors.soft, alignItems: 'center', justifyContent: 'center' },
  toolTitle: { fontSize: 14, lineHeight: 22, fontWeight: '600', color: colors.ink, textAlign: 'center' }, toolNote: { fontSize: 12, lineHeight: 19, color: colors.muted, textAlign: 'center' },
  settingRow: { minHeight: 72, paddingVertical: 12, paddingHorizontal: 2, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 12 }, chevron: { color: colors.muted, fontSize: 24 },
  action: { minHeight: 48, minWidth: 48, borderRadius: 13, paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1 },
  primary: { backgroundColor: colors.primary, borderColor: colors.primary }, outline: { backgroundColor: colors.surface, borderColor: colors.border },
  pressed: { backgroundColor: colors.primaryPressed }, softPressed: { backgroundColor: colors.soft }, disabled: { opacity: 0.45 }, actionText: { color: colors.surface, fontSize: 15, lineHeight: 22, fontWeight: '700', textAlign: 'center', flexShrink: 1 }, outlineText: { color: colors.primary },
  copyFeedback: { fontSize: 12, lineHeight: 18, color: colors.success, minHeight: 18, textAlign: 'center' },
  empty: { alignItems: 'center', paddingHorizontal: 24, paddingVertical: 34, gap: 10, backgroundColor: colors.surface, borderRadius: 20 }, emptyMark: { height: 56, width: 56, borderRadius: 18, backgroundColor: colors.soft, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  icon: { height: 28, width: 28, alignItems: 'center', justifyContent: 'center' }, bubble: { position: 'absolute', top: 4, left: 3, width: 22, height: 17, borderWidth: 1.8, borderRadius: 6 }, tail: { position: 'absolute', left: 7, bottom: 4, width: 5, height: 6, borderLeftWidth: 1.8, borderBottomWidth: 1.8, transform: [{ skewY: '-30deg' }] }, messageLine: { width: 10, height: 1.8, position: 'absolute', left: 9, top: 12, borderRadius: 1 }, sparkDot: { position: 'absolute', right: 1, top: 2, width: 4, height: 4, borderRadius: 2 },
  head: { width: 9, height: 9, borderWidth: 1.8, borderRadius: 5, position: 'absolute', top: 3 }, shoulders: { width: 21, height: 11, borderWidth: 1.8, borderRadius: 9, position: 'absolute', bottom: 3 }, clock: { width: 22, height: 22, borderWidth: 1.8, borderRadius: 12 }, clockHand: { height: 7, width: 1.8, position: 'absolute', top: 7, left: 13 }, clockHand2: { height: 1.8, width: 6, position: 'absolute', top: 13, left: 13 }, keyboard: { width: 26, height: 20, borderWidth: 1.8, borderRadius: 5 }, keyDots: { width: 15, gap: 3, position: 'absolute', top: 9, flexDirection: 'row', flexWrap: 'wrap' }, space: { width: 9, height: 2, position: 'absolute', bottom: 8, borderRadius: 1 },
});
