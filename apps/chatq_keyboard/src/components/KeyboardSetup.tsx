import React, { useEffect, useState } from 'react';
import { Alert, AppState, Platform, Text, TextInput, View } from 'react-native';
import { keyboardBridge, type KeyboardStatus } from '../../modules/chatq-keyboard';
import { colors, ui } from '../design';
import { Action } from './Ui';

export function KeyboardSetup() {
  const [status, setStatus] = useState<KeyboardStatus | null>(null);
  const [failure, setFailure] = useState('');
  const [trial, setTrial] = useState('');
  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      try {
        const value = await keyboardBridge?.getKeyboardStatus?.();
        if (alive) { setStatus(value || null); setFailure(value ? '' : '当前版本无法读取系统状态，可按下面的步骤手动设置。'); }
      } catch { if (alive) setFailure('系统状态暂时无法读取，返回本页后会重新检查。'); }
    };
    void refresh();
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') void refresh(); });
    // The system IME picker can take window focus without backgrounding this Activity.
    const focus = Platform.OS === 'android' ? AppState.addEventListener('focus', () => void refresh()) : null;
    return () => { alive = false; subscription.remove(); focus?.remove(); };
  }, []);
  const open = async (picker: boolean) => {
    try { if (picker) await keyboardBridge?.showKeyboardPicker(); else await keyboardBridge?.openKeyboardSettings(); }
    catch { Alert.alert('无法打开系统设置', '请在手机的系统设置中搜索“输入法”，启用并选择聊商。'); }
  };
  return <>
    <View style={ui.card}>
      <Text style={ui.heading}>键盘使用状态</Text>
      {Platform.OS === 'android' ? <>
        <Text accessibilityLiveRegion="polite" style={[ui.label, { color: status?.selected ? colors.success : colors.secondary }]}>{status ? status.selected ? '正在使用聊商键盘' : status.enabled ? '已启用，请切换到聊商' : '尚未启用聊商键盘' : '正在读取系统状态…'}</Text>
        {!!failure && <Text style={ui.note}>{failure}</Text>}
        <Text style={ui.note}>1 · 在系统输入法设置中启用“聊商 AI 回复”。</Text>
        <Action secondary label={status?.enabled ? '查看系统键盘设置' : '打开键盘设置'} disabled={!keyboardBridge} onPress={() => void open(false)} />
        <Text style={ui.note}>2 · 在系统输入法列表中选择聊商，再到下面试打。</Text>
        <Action label={status?.selected ? '切换输入法' : '切换到聊商键盘'} disabled={!keyboardBridge} onPress={() => void open(true)} />
      </> : <Text style={ui.note}>设置 → 通用 → 键盘 → 添加新键盘 → 聊商。联网 AI 需要“允许完全访问”，聊天时长按地球图标切换。</Text>}
    </View>
    <View style={ui.card}>
      <Text style={ui.heading}>先在这里试打</Text>
      <Text style={ui.note}>试试 nihao → 你好，再点联想词。九宫格可输入 64426。此处不会生成 AI 或保存为聊天记录。</Text>
      <TextInput accessibilityLabel="键盘试打区" value={trial} onChangeText={setTrial} multiline maxLength={200} placeholder="点这里，试试拼音、九宫格和英文…" placeholderTextColor={colors.muted} style={[ui.input, { minHeight: 112, textAlignVertical: 'top' }]} />
      <Action secondary label="清空试打内容" disabled={!trial} onPress={() => setTrial('')} />
    </View>
  </>;
}
