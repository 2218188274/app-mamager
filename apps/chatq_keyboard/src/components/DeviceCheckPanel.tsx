import React, { useEffect, useRef, useState } from 'react';
import { Alert, AppState, Platform, Text, TextInput, View } from 'react-native';
import { keyboardBridge } from '../../modules/chatq-keyboard';
import { readDeviceChecks, deviceReport, type DeviceChecks } from '../services/deviceChecks';
import { Action, CopyAction, PageIntro } from './Ui';
import { colors, ui } from '../design';
export function DeviceCheckPanel({ onConfigure, onUpdates }: { onConfigure: () => void; onUpdates: () => void }) {
  const [checks, setChecks] = useState<DeviceChecks | null>(null), [busy, setBusy] = useState(false);
  const [trial, setTrial] = useState(''), [trialOpen, setTrialOpen] = useState(false);
  const alive = useRef(true), revision = useRef(0);
  async function refresh() {
    const ticket = ++revision.current; setBusy(true);
    try { const value = await readDeviceChecks(Platform.OS); if (alive.current && ticket === revision.current) setChecks(value); }
    catch { if (alive.current && ticket === revision.current) setChecks({ api: 'unknown', enabled: 'unknown', selected: 'unknown', version: '未读取成功' }); }
    finally { if (alive.current && ticket === revision.current) setBusy(false); }
  }
  useEffect(() => {
    alive.current = true; void refresh();
    const change = AppState.addEventListener('change', value => { if (value === 'active') void refresh(); });
    const focus = Platform.OS === 'android' ? AppState.addEventListener('focus', () => void refresh()) : null;
    return () => { alive.current = false; revision.current++; change.remove(); focus?.remove(); };
  }, []);
  async function open(picker: boolean) {
    try { if (!keyboardBridge) throw new Error('unsupported'); if (picker) await keyboardBridge.showKeyboardPicker(); else await keyboardBridge.openKeyboardSettings(); }
    catch { Alert.alert('无法打开系统设置', '请在手机系统设置中搜索“输入法”，启用并选择聊商。'); }
  }
  const apiText = checks?.api === 'yes' ? '已保存 API 配置' : checks?.api === 'no' ? '还没有配置 API' : checks?.api === 'unsupported' ? '自备 API 暂支持安卓' : 'API 配置暂未读取成功';
  const keyboardText = checks?.selected === 'yes' ? '正在使用聊商键盘' : checks?.enabled === 'yes' ? '已启用，切换后即可输入' : checks?.enabled === 'no' ? '先启用聊商键盘' : '系统状态暂未读取成功';
  return <><PageIntro title="开始使用与自检" note="两步准备，再试打一下。只读取本机设置，不调用 AI，也不收集输入内容。" />
    <Action secondary label={busy ? '正在检查本机设置…' : '重新检查本机设置'} disabled={busy} loading={busy} onPress={() => void refresh()} />
    {checks && <>
      <View style={ui.card}><Text style={ui.heading}>1 · 连接自己的 AI</Text><Text accessibilityLiveRegion="polite" style={ui.text}>{apiText}</Text><Text style={ui.note}>已保存不代表连接已验证。需要时到 API 页面手动测试，供应商可能计费。</Text><Action label={checks.api === 'yes' ? '查看我的 API' : '去配置 API'} onPress={onConfigure} /></View>
      <View style={ui.card}><Text style={ui.heading}>2 · 启用并选择键盘</Text>{Platform.OS === 'android' ? <><Text accessibilityLiveRegion="polite" style={ui.text}>{keyboardText}</Text><Text style={ui.note}>普通拼音、九宫格和表情可离线使用，不需要 API 或账号。</Text><Action secondary label="打开系统输入法设置" onPress={() => void open(false)} /><Action label="选择当前输入法" onPress={() => void open(true)} /></> : <Text style={ui.note}>请到系统设置 → 通用 → 键盘中添加聊商。此处暂不能自动检查。</Text>}</View>
      <View style={ui.card}><Text style={ui.heading}>试一试日常输入</Text><Text style={ui.note}>试试 nihao → 你好，再点联想词；九宫格输入 64426。试打内容不会保存。</Text><Action secondary label={trialOpen ? '收起试打区' : '打开试打区'} onPress={() => setTrialOpen(!trialOpen)} />{trialOpen && <><TextInput autoFocus multiline maxLength={200} value={trial} onChangeText={setTrial} accessibilityLabel="自检键盘试打区" placeholder="在这里试打，不会自动发送" placeholderTextColor={colors.muted} style={[ui.input, { minHeight: 112, textAlignVertical: 'top' }]} /><Action secondary label="清空试打内容" disabled={!trial} onPress={() => setTrial('')} /></>}</View>
      <View style={ui.card}><Text style={ui.heading}>版本与问题反馈</Text><Text style={ui.text}>当前安装：{checks.version}</Text><Text style={ui.note}>检查结果仅包含版本和开关状态，不包含密钥、接口地址或输入内容。</Text><CopyAction text={deviceReport(checks, Platform.OS)} label="复制检查结果" feedback="已复制检查结果，可自行粘贴给支持人员" /><Action secondary label="前往更新中心" onPress={onUpdates} /></View>
    </>}
  </>;
}
