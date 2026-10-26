import React, { useEffect, useRef, useState } from 'react';
import { Alert, AppState, Keyboard, Switch, Text, TextInput, View } from 'react-native';
import { clearPersonalAi, loadPersonalAi, personalAiRequest, savePersonalAi, type PersonalAiConfig } from '../services/personalAi';
import { displayError } from '../services/nativeError';
import { colors, ui } from '../design';
import { Action, PageIntro } from './Ui';

export function PersonalAiPanel({ onChanged }: { onChanged: (ready: boolean) => void }) {
  const [saved, setSaved] = useState<PersonalAiConfig | null>(null);
  const [baseUrl, setBaseUrl] = useState(''), [model, setModel] = useState(''), [apiKey, setApiKey] = useState('');
  const [stream, setStream] = useState(true), [busy, setBusy] = useState(false), [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(''), [notice, setNotice] = useState('');
  const alive = useRef(true), lock = useRef(false), request = useRef<AbortController | null>(null);
  useEffect(() => {
    alive.current = true;
    void loadPersonalAi().then(value => { if (!alive.current) return; setSaved(value); setBaseUrl(value.baseUrl); setModel(value.model); setStream(value.stream); onChanged(value.hasKey); }).catch(e => { if (alive.current) setError(displayError(e, '无法读取 API 配置')); }).finally(() => { if (alive.current) setLoaded(true); });
    const listener = AppState.addEventListener('change', state => { if (state !== 'active') request.current?.abort(); });
    return () => { alive.current = false; request.current?.abort(); listener.remove(); };
  }, []);
  const dirty = !saved || baseUrl.trim().replace(/\/+$/, '') !== saved.baseUrl || model.trim() !== saved.model || stream !== saved.stream || !!apiKey;
  async function run(action: () => Promise<void>) {
    if (lock.current) return; lock.current = true; setBusy(true); setError(''); setNotice('');
    try { await action(); } catch (e) { if (alive.current) setError(displayError(e, '操作失败，请重试')); }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  }
  async function save() {
    if (!apiKey.trim() && !saved?.hasKey) throw new Error('请填写自己的 API 密钥');
    const value = await savePersonalAi({ baseUrl, model, apiKey, stream });
    if (alive.current) { setSaved(value); setBaseUrl(value.baseUrl); setModel(value.model); setApiKey(''); setNotice('已保存，主应用与安卓键盘共用；尚未发起 API 请求。'); onChanged(true); Keyboard.dismiss(); }
  }
  async function test() {
    const controller = new AbortController(); request.current = controller;
    try { await personalAiRequest('test', {}, controller.signal); if (alive.current && !controller.signal.aborted) setNotice('连接成功，密钥和模型可以使用。'); }
    finally { if (request.current === controller) request.current = null; }
  }
  const field = (label: string, value: string, change: (text: string) => void, placeholder: string, secret = false) => <View style={{ gap: 6 }}><Text style={ui.label}>{label}</Text><TextInput accessibilityLabel={label} value={value} onChangeText={text => { change(text); setNotice(''); setError(''); }} placeholder={placeholder} placeholderTextColor={colors.muted} style={ui.input} autoCapitalize="none" autoCorrect={false} autoComplete="off" secureTextEntry={secret} editable={loaded && !busy} maxLength={secret ? 8192 : label === '模型名称' ? 200 : 2048} /></View>;
  return <><PageIntro title="我的 API" note="填一次，主应用和安卓键盘都能用。" />
    <View style={[ui.card, { backgroundColor: colors.soft }]}><Text style={ui.heading}>聊商免费使用</Text><Text style={ui.text}>无需购买会员，也无需登录。AI 请求直接发往你配置的供应商；API 用量按供应商账户规则计费。</Text></View>
    <View style={ui.card}><Text style={ui.heading}>{saved?.hasKey ? '已配置自己的 API' : '连接你的 AI'}</Text><Text style={ui.note}>支持 OpenAI 兼容的 Chat Completions 接口。地址和模型名称以供应商文档为准。</Text>
      {field('API 基础地址', baseUrl, setBaseUrl, 'https://供应商域名/v1')}
      <Text style={ui.note}>保留供应商要求的 /v1 等路径，不要填写 /chat/completions。</Text>
      {field('API 密钥', apiKey, setApiKey, saved?.hasKey ? '已保存，留空保留密钥' : '粘贴你自己的 API Key', true)}
      {field('模型名称', model, setModel, '供应商提供的准确模型 ID')}
      <View style={ui.between}><View style={{ flex: 1 }}><Text style={ui.label}>流式回复</Text><Text style={ui.note}>边生成边显示；供应商不兼容时可关闭。</Text></View><Switch accessibilityLabel="流式回复" value={stream} disabled={!loaded || busy} onValueChange={value => { setStream(value); setNotice(''); }} /></View>
      <Text style={ui.note}>更换 API 地址时需重新输入密钥。密钥由本机系统加密保存，不上传聊商服务器，不随备份或会话同步导出。图片和 PDF 需供应商与模型支持。</Text>
      {!!error && <Text accessibilityRole="alert" style={[ui.text, { color: colors.danger }]}>{error}</Text>}
      {!!notice && <Text accessibilityLiveRegion="polite" style={[ui.text, { color: colors.success }]}>{notice}</Text>}
      <Action label={busy && !request.current ? '保存中…' : '保存配置'} disabled={!loaded || busy || !dirty} onPress={() => void run(save)} />
      <Action secondary label={request.current ? '停止测试' : '测试连接（消耗少量 API 用量）'} disabled={!loaded || !request.current && (busy || !saved?.hasKey || dirty)} onPress={() => request.current ? request.current.abort() : void run(test)} />
      {saved?.hasKey && <Action secondary label="清除本机 API 配置" disabled={busy} onPress={() => Alert.alert('清除 API 配置？', '主应用和键盘将暂停 AI 生成；本地打字、人设和记录保留。', [{ text: '取消', style: 'cancel' }, { text: '清除', style: 'destructive', onPress: () => void run(async () => { await clearPersonalAi(); if (alive.current) { setSaved({ baseUrl: '', model: '', stream: true, hasKey: false }); setBaseUrl(''); setModel(''); setApiKey(''); setStream(true); onChanged(false); setNotice('已清除。重新配置后即可使用 AI。'); } }) }])} />}
    </View></>;
}
