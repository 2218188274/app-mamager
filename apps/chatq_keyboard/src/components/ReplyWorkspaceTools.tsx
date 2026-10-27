import React, { useEffect, useState } from 'react';
import { Alert, Modal, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Action } from './Ui';
import { colors, ui } from '../design';
import { parseReplyCount, type DraftState } from '../services/replyWorkspace';
export function DraftControls({ state, disabled, onToggle, onClear, onRetry }: { state: DraftState; disabled: boolean; onToggle: (enabled: boolean) => void; onClear: () => void; onRetry: () => void }) {
  const [open, setOpen] = useState(false);
  return <View style={{ gap: 8 }}><View style={ui.between}><Text accessibilityLiveRegion="polite" style={[ui.note, { flex: 1 }]}>{state.notice || '草稿暂未保存'}</Text><Action secondary label={open ? '收起草稿设置' : '草稿设置'} onPress={() => setOpen(!open)} /></View>
    {!!state.error && <Text accessibilityRole="alert" style={[ui.note, { color: colors.danger }]}>{state.error}</Text>}
    {!!state.error && !state.blocked && <Action secondary label="重试保存草稿" disabled={disabled || state.operation} onPress={onRetry} />}
    {open && <View style={ui.card}><Text style={ui.heading}>本机草稿</Text><Text style={ui.note}>仅保存你在主应用填写的文字、模式和背景，保留 7 天。截图、API 密钥和其他应用输入框不保存，也不随备份或同步导出。</Text>
    <Action secondary label={state.enabled ? '关闭草稿自动保存' : '开启草稿自动保存'} disabled={disabled || state.operation || !state.loaded} onPress={() => state.enabled ? Alert.alert('关闭草稿保存？', '删除已保存的草稿，当前页面的文字仍保留。', [{ text: '取消', style: 'cancel' }, { text: '关闭并删除存档', style: 'destructive', onPress: () => onToggle(false) }]) : onToggle(true)} />
    <Action secondary label="清空全部草稿" disabled={disabled || state.operation || !state.loaded} onPress={() => Alert.alert('清空回复与润色草稿？', '清空两种模式的文字、背景和截图选择；已生成的历史记录保留。', [{ text: '取消', style: 'cancel' }, { text: '清空草稿', style: 'destructive', onPress: onClear }])} /></View>}
  </View>;
}
export function ReplyCountPicker({ value, disabled, onChange }: { value: number; disabled: boolean; onChange: (value: number) => void }) {
  const [open, setOpen] = useState(false), [text, setText] = useState(String(value)), [error, setError] = useState('');
  useEffect(() => { if (open) { setText(String(value)); setError(''); } }, [open, value]);
  return <><View style={ui.between}><View style={{ flex: 1 }}><Text style={ui.label}>回复条数</Text><Text style={ui.note}>当前 {value} 条 · 主应用与键盘共用</Text></View><Action secondary accessibilityLabel="自定义回复条数" label="调整条数" disabled={disabled} onPress={() => setOpen(true)} /></View>
    <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}><SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 16 }}>
      <Text accessibilityRole="header" style={ui.title}>自定义回复条数</Text><Text style={ui.text}>一次生成 1–10 条。条数越多，等待和 API 用量可能增加；不会自动补发请求。</Text>
      <View style={[ui.row, { flexWrap: 'wrap' }]}>{[1,3,5,10].map(n => <Action key={n} secondary label={n + ' 条'} onPress={() => { setText(String(n)); setError(''); }} />)}</View>
      <TextInput accessibilityLabel="回复条数（1–10）" value={text} onChangeText={value => { setText(value); setError(''); }} keyboardType="number-pad" maxLength={3} selectTextOnFocus style={ui.input} />
      {!!error && <Text accessibilityRole="alert" style={[ui.text, { color: colors.danger }]}>{error}</Text>}
      <Action label="使用这个条数" disabled={disabled} onPress={() => { try { const next = parseReplyCount(text); onChange(next); setOpen(false); } catch (e) { setError(e instanceof Error ? e.message : '请输入 1–10 的整数'); } }} />
      <Action secondary label="返回回复" onPress={() => setOpen(false)} />
    </ScrollView></SafeAreaView></Modal></>;
}
