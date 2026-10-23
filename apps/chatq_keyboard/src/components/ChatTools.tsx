import React, { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, SafeAreaView, ScrollView, Text, TextInput, View } from 'react-native';
import type { ChatSession } from '../services/chat';
import { chatTitle } from '../services/chat';
import { exportChat, type ChatExportFormat } from '../services/chatExport';
import { keyboardBridge } from '../../modules/chatq-keyboard';
import { displayError } from '../services/nativeError';
import { colors, ui } from '../design';
import { Action } from './Ui';

export type ChatTool = { kind: 'rename' | 'export'; session: ChatSession; back: 'sessions' | 'settings' } | { kind: 'edit'; session: ChatSession; turnId: string; question: string };
export function ChatTools({ tool, onClose, onRename, onEdit }: { tool: ChatTool; onClose: () => void; onRename: (title: string) => Promise<void>; onEdit: (question: string) => void }) {
  const [value, setValue] = useState(tool.kind === 'edit' ? tool.question : tool.session.title);
  const [format, setFormat] = useState<ChatExportFormat>('txt');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const alive = useRef(true), lock = useRef(false);
  useEffect(() => () => { alive.current = false; }, []);
  const title = tool.kind === 'rename' ? '重命名会话' : tool.kind === 'edit' ? '编辑问题' : '导出聊天记录';
  async function submit() {
    if (lock.current) return; lock.current = true; setBusy(true); setError(''); setMessage('');
    try {
      if (tool.kind === 'rename') { await onRename(chatTitle(value)); onClose(); }
      else if (tool.kind === 'edit') {
        if (!value.trim() || value.trim().length > 2000) throw new Error('请输入 1–2000 字的问题');
        onEdit(value.trim());
      } else {
        if (!keyboardBridge?.exportChat) throw new Error('当前平台尚不支持文件导出，请在新版安卓应用中使用');
        const result = await keyboardBridge.exportChat(exportChat(tool.session, format), format);
        if (alive.current) setMessage(result === 'saved' ? '聊天记录已保存到你选择的位置。' : '已取消导出，会话记录未修改。');
      }
    } catch (e) { if (alive.current) setError(displayError(e, '操作失败，请重试')); }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  }
  return <Modal visible animationType="slide" onRequestClose={() => { if (!lock.current) onClose(); }}>
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={[ui.row, { padding: 20, justifyContent: 'space-between' }]}><Text accessibilityRole="header" style={[ui.heading, { flex: 1 }]}>{title}</Text><Action secondary label="返回" disabled={busy} onPress={onClose} /></View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 40 }}>
        <Text style={ui.label} numberOfLines={2}>{tool.session.title}</Text>
        {tool.kind === 'rename' ? <><Text style={ui.note}>给会话起个容易找到的名称，不改变已有问答。</Text><TextInput accessibilityLabel="会话新名称" value={value} onChangeText={setValue} maxLength={40} editable={!busy} style={ui.input} /><Text style={ui.note}>{value.length}/40</Text></> : tool.kind === 'edit' ? <><Text style={ui.note}>将另开会话，保留原对话及后续消息。仅携带该问题之前的上下文，按当前人设回答；成功计 1 次额度。需要开启本机保存并有空余会话名额。</Text><TextInput accessibilityLabel="编辑后的问题" value={value} onChangeText={setValue} multiline maxLength={2000} editable={!busy} style={[ui.input, { minHeight: 150 }]} /><Text style={ui.note}>{value.length}/2000 · 停止或失败时保留新会话的草稿。</Text></> : <><Text style={ui.note}>导出这段会话的 {tool.session.turns.length} 轮完整问答和会话背景，不包含草稿或未完成预览。文件为明文，请妥善保管；加密备份仍在“键盘 → 数据备份与恢复”。</Text><View style={ui.row}>{(['txt', 'md'] as const).map(item => <Action key={item} label={item === 'txt' ? 'TXT 文本' : 'Markdown'} secondary={format !== item} disabled={busy} style={{ flex: 1, paddingHorizontal: 8 }} onPress={() => setFormat(item)} />)}</View><Text style={ui.note}>仅在本机生成，不消耗 AI 额度。点击后由系统选择保存位置。</Text></>}
        {!!error && <Text accessibilityRole="alert" style={[ui.note, { color: colors.danger }]}>{error}</Text>}
        {!!message && <Text accessibilityLiveRegion="polite" style={[ui.note, { color: colors.success }]}>{message}</Text>}
        <Action label={tool.kind === 'rename' ? '保存名称' : tool.kind === 'edit' ? '另开会话并回答' : '选择位置并导出'} loading={busy} disabled={busy || (tool.kind === 'export' && !tool.session.turns.length)} onPress={() => void submit()} />
      </ScrollView>
    </KeyboardAvoidingView></SafeAreaView>
  </Modal>;
}
