import { ChatPanel } from './src/components/ChatPanel';
import { AccountPanel } from './src/components/AccountPanel';
import { BackupPanel } from './src/components/BackupPanel';
import { UpdatePanel } from './src/components/UpdatePanel';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, AppState, BackHandler, Keyboard, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import Clipboard from '@react-native-clipboard/clipboard';
import { StatusBar } from 'expo-status-bar';
import { keyboardBridge, type KeyboardConfig } from './modules/chatq-keyboard';
import { connect, generateReply, loadConnection, type ReplyStyle } from './src/services/api';
import * as storage from './src/services/storage';
import { loadPersona, savePersonaData, syncPersonaCatalog, replyPersonalization, type PersonaState } from './src/services/persona';
import { getConfigData, fetchConfigData, getCachedConfigData } from './src/services/configData';
import type { ConfigDataCache } from './src/types/configData';
import { PersonaPanel, PersonaChoices } from './src/components/PersonaPanel';
import { TypingSettings } from './src/components/TypingSettings';
import { TopicPanel } from './src/components/TopicPanel';
import { HistoryPanel } from './src/components/HistoryPanel';
import { KeyboardSetup } from './src/components/KeyboardSetup';
import { HelpPanel } from './src/components/HelpPanel';
import { version } from './package.json';
import { Action, CopyAction, NavIcon, PageIntro, type IconName } from './src/components/Ui';
import { colors, ui } from './src/design';

type Page = IconName | 'typing' | 'help' | 'account' | 'backup' | 'updates';
const tabs: [IconName, string][] = [['reply', '回复'], ['chat', '对话'], ['topics', '话题'], ['persona', '人设'], ['history', '记录'], ['setup', '键盘']];
const tones: [ReplyStyle, string][] = [['friendly', '自然'], ['professional', '得体'], ['funny', '幽默'], ['emoji', '轻松']];
const errorText = (error: unknown) => error instanceof Error ? error.message : '操作失败，请重试';
export default function App() { return <SafeAreaProvider><ChatQApp /></SafeAreaProvider>; }
function ChatQApp() {
  const [page, setPage] = useState<Page>('reply');
  const [persona, setPersona] = useState<PersonaState | null>(null);
  const [catalog, setCatalog] = useState<ConfigDataCache | null>(null);
  const [context, setContext] = useState('');
  const [goal, setGoal] = useState('');
  const [showPersonaOptions, setShowPersonaOptions] = useState(false);
  const [showContext, setShowContext] = useState(false);
  const [connection, setConnection] = useState<KeyboardConfig | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('正在连接服务器…');
  const [input, setInput] = useState('');
  const [style, setStyle] = useState<ReplyStyle>('friendly');
  const [count, setCount] = useState(1);
  const [candidates, setCandidates] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [advanced, setAdvanced] = useState(false);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const connecting = useRef(false);
  const request = useRef<AbortController | null>(null);
  const scroll = useRef<ScrollView>(null);
  const mounted = useRef(true);
  const personaSnapshot = useRef('');
  const resultY = useRef(0);
  const revealResult = useRef(false);
  function cancel() { request.current?.abort(); request.current = null; setBusy(false); }
  function invalidate() { cancel(); revealResult.current = false; setCandidates([]); setError(''); setNotice(''); }
  function acceptPersona(value: PersonaState) {
    const next = JSON.stringify(value);
    if (personaSnapshot.current && next !== personaSnapshot.current) invalidate();
    personaSnapshot.current = next; setPersona(value);
  }
  function navigate(next: Page) {
    if (connecting.current) return;
    cancel(); Keyboard.dismiss(); setPage(next); setError('');
    scroll.current?.scrollTo({ y: 0, animated: false });
  }
  useEffect(() => {
    const open = (url: string | null) => { if (Platform.OS === 'android' && url?.startsWith('chatq://typing')) navigate('typing'); else if (url?.startsWith('chatq://history')) navigate('history'); };
    void Linking.getInitialURL().then(open);
    const listener = Linking.addEventListener('url', event => open(event.url));
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardOpen(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardOpen(false));
    return () => { listener.remove(); show.remove(); hide.remove(); };
  }, []);
  useEffect(() => {
    const back = BackHandler.addEventListener('hardwareBackPress', () => { if (page === 'reply') return false; navigate(['typing','help','account','backup','updates'].includes(page) ? 'setup' : 'reply'); return true; });
    return () => back.remove();
  }, [page]);
  useEffect(() => {
    if (page !== 'reply' || busy || !revealResult.current || (!candidates.length && !error)) return;
    // Let the result card finish its native layout before bringing it into view.
    const timer = setTimeout(() => { revealResult.current = false; scroll.current?.scrollTo({ y: resultY.current, animated: true }); }, 80);
    return () => clearTimeout(timer);
  }, [page, busy, candidates, error]);
  useEffect(() => {
    mounted.current = true;
    void storage.migrateHistory().catch(() => { if (mounted.current) setNotice('旧版记录暂未迁移，请到记录页重试。'); });
    void loadPersona().then(state => savePersonaData(state.data)).then(state => { if (mounted.current) acceptPersona(state); }).catch(e => { if (mounted.current) setError('人设读取失败：' + errorText(e)); });
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') { if (request.current) cancel(); }
      else void loadPersona().then(value => { if (mounted.current) acceptPersona(value); }).catch(() => {});
    });
    (async () => {
      try {
        const value = await loadConnection();
        if (!mounted.current) return;
        setConnection(value);
        const cached = await getCachedConfigData(); if (mounted.current && cached) setCatalog(cached);
        if (!value.apiKey) { setStatus('请填写应用连接码'); setAdvanced(true); setPage('setup'); return; }
        const connected = await connect(value);
        if (!mounted.current) return;
        setConnection(connected); setReady(true); setStatus('服务器已连接');
        const data = await getConfigData();
        if (data) { const state = await syncPersonaCatalog(data); if (mounted.current) { setCatalog(data); acceptPersona(state); } }
      } catch (e) { if (mounted.current) setStatus(errorText(e)); }
    })();
    return () => { mounted.current = false; request.current?.abort(); subscription.remove(); };
  }, []);
  async function refreshCatalog() {
    const data = await fetchConfigData();
    if (!data) throw new Error('无法读取后台配置，请检查服务器连接；已保存的人设不受影响。');
    if (mounted.current) { setCatalog(data); acceptPersona(await syncPersonaCatalog(data)); }
  }
  async function saveConnection() {
    if (!connection || connecting.current) return;
    connecting.current = true; cancel(); setBusy(true); setReady(false); setError('');
    try {
      const value = await connect(connection);
      if (!mounted.current) return;
      setConnection(value); setReady(true); setStatus('服务器已连接');
      await refreshCatalog().catch(() => { if (mounted.current) setStatus('已连接，人设目录暂不可用，可稍后刷新'); });
      if (mounted.current) Alert.alert('连接成功', '键盘和主应用已同步配置');
    } catch (e) { if (mounted.current) { setStatus(errorText(e)); setError(errorText(e)); } }
    finally { connecting.current = false; if (mounted.current) setBusy(false); }
  }
  async function generate() {
    if (request.current || !ready || connecting.current) return;
    const controller = new AbortController(); request.current = controller;
    revealResult.current = false; setBusy(true); setCandidates([]); setError(''); setNotice('');
    const prompt = input.trim();
    try {
      const current = await loadPersona();
      if (controller.signal.aborted || !mounted.current) return;
      // A freshly loaded selection is used for the request without treating it as a user edit.
      personaSnapshot.current = JSON.stringify(current); setPersona(current);
      const replies = await generateReply(prompt, style, count, replyPersonalization(current, context, goal), controller.signal);
      if (controller.signal.aborted || !mounted.current) return;
      revealResult.current = true; setCandidates(replies); Keyboard.dismiss();
      try { await storage.saveReplyConversation(prompt, replies); }
      catch { if (mounted.current && !controller.signal.aborted) setNotice('回复已生成，但本机记录未保存；仍可复制使用。'); }
    } catch (e) { if (!controller.signal.aborted && mounted.current) { revealResult.current = true; setError(errorText(e)); } }
    finally { if (request.current === controller) { request.current = null; if (mounted.current) setBusy(false); } }
  }
  async function paste() {
    try { const text = (await Clipboard.getString()).slice(0, 1000); if (mounted.current) { invalidate(); setInput(text); if (!text.trim()) setNotice('剪贴板里还没有文字，先复制对方的消息。'); } }
    catch { setError('暂时无法读取剪贴板，请长按输入框粘贴。'); }
  }
  const selectedPersona = persona?.data.cards.find(c => c.id === persona.selection.cardId)?.name || '自然真诚';
  return <SafeAreaView style={s.root}><StatusBar style="dark" />
    {!(page === 'chat' && keyboardOpen) && <View style={[s.header, page === 'chat' && { minHeight: 64, paddingVertical: 6 }]}><View style={ui.row}><View style={s.logo}><NavIcon name="reply" color={colors.surface} /></View><View><Text style={s.brand}>聊商 <Text style={s.brandEnglish}>ChatQ</Text></Text><Text style={s.tagline}>让聊天，更像你</Text></View></View>
      <Pressable accessibilityRole="button" accessibilityLabel={ready ? '服务器已连接，查看连接设置' : '查看连接状态与重新连接'} onPress={() => navigate('setup')} style={[s.connection, ready && s.connected]}><View style={[s.dot, { backgroundColor: ready ? colors.success : colors.muted }]} /><Text style={[s.connectionText, ready && { color: colors.success }]}>{ready ? '已连接' : '离线可用'}</Text></Pressable>
    </View>}
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ChatPanel active={page === 'chat'} keyboardOpen={keyboardOpen} ready={ready} persona={persona} onConnect={() => navigate('setup')} onManagePersona={() => navigate('persona')} />
    <ScrollView style={page === 'chat' ? { display: 'none' } : undefined} ref={scroll} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={s.content}>
      {page === 'reply' && <>
        <View style={s.hero}><Text style={s.eyebrow}>YOUR WORDS, YOUR WAY</Text><Text accessibilityRole="header" style={s.heroTitle}>这句，怎么回？</Text><Text style={s.heroNote}>把想说的话，说得恰到好处。</Text><Pressable accessibilityRole="button" onPress={() => navigate('topics')} style={s.topicLink}><Text style={[ui.selectedText, { flex: 1 }]}>没话题了？找一句轻松的开场白</Text><Text style={ui.selectedText}>↗</Text></Pressable></View>
        <View style={ui.card}><View style={ui.between}><Text style={ui.heading}>对方的消息</Text><Text style={ui.note}>{input.length}/1000</Text></View><TextInput accessibilityLabel="对方消息" multiline maxLength={1000} placeholder="粘贴对方发来的消息…" placeholderTextColor={colors.muted} value={input} onChangeText={text => { invalidate(); setInput(text); }} style={s.messageInput} editable={!busy} />
          <View style={ui.between}><Pressable accessibilityRole="button" accessibilityLabel="清空对方消息" disabled={busy || !input} onPress={() => { invalidate(); setInput(''); }} style={s.textAction}><Text style={[ui.note, (!input || busy) && { opacity: 0.45 }]}>清空</Text></Pressable><Action secondary label="粘贴消息" onPress={() => void paste()} disabled={busy} /></View>
        </View>
        {persona && <><Pressable accessibilityRole="button" accessibilityState={{ expanded: showPersonaOptions }} disabled={busy} style={[ui.card, ui.row]} onPress={() => setShowPersonaOptions(!showPersonaOptions)}><View style={s.personaMark}><NavIcon name="persona" color={colors.primary} /></View><View style={{ flex: 1, gap: 3 }}><Text style={ui.heading}>{selectedPersona}</Text><Text style={ui.note}>{persona.data.relations.find(c => c.id === persona.selection.relationId)?.name || '关系不限'} · {persona.data.scenes.find(c => c.id === persona.selection.sceneId)?.name || '场景不限'}</Text></View><Text style={s.chevron}>{showPersonaOptions ? '⌃' : '›'}</Text></Pressable>{showPersonaOptions && <PersonaChoices state={persona} onChange={acceptPersona} disabled={busy} />}</>}
        <View style={ui.card}><Text style={ui.heading}>用什么语气聊？</Text><View style={ui.row}>{tones.map(([id, label]) => <Pressable accessibilityRole="button" accessibilityState={{ selected: style === id }} key={id} disabled={busy} style={[s.tone, style === id && s.toneSelected]} onPress={() => { invalidate(); setStyle(id); }}><Text style={[s.toneText, style === id && ui.selectedText]}>{label}</Text></Pressable>)}</View>
          <View style={ui.between}><Text style={ui.label}>生成数量</Text><View style={ui.row}>{[1, 2, 3].map(n => <Pressable accessibilityRole="button" accessibilityLabel={n + ' 条回复'} accessibilityState={{ selected: count === n }} key={n} disabled={busy} onPress={() => { invalidate(); setCount(n); }} style={[s.quantity, count === n && s.toneSelected]}><Text style={count === n ? ui.selectedText : ui.note}>{n} 条</Text></Pressable>)}</View></View>
        </View>
        <View style={ui.card}><Pressable accessibilityRole="button" accessibilityState={{ expanded: showContext }} onPress={() => setShowContext(!showContext)} style={[ui.between, { minHeight: 48 }]}><Text style={ui.label}>补充背景与回复目标</Text><Text style={ui.note}>{showContext ? '收起 ⌃' : '选填 ＋'}</Text></Pressable>{showContext && <><TextInput accessibilityLabel="聊天背景" editable={!busy} style={[ui.input, { minHeight: 88 }]} maxLength={200} multiline placeholder="例如：昨天约好见面，今天对方临时取消。" placeholderTextColor={colors.muted} value={context} onChangeText={text => { invalidate(); setContext(text); }} /><Text style={ui.label}>本次想达到什么目的？</Text><TextInput accessibilityLabel="回复目标" editable={!busy} style={ui.input} maxLength={80} placeholder="表达关心、礼貌拒绝、推进邀约…" placeholderTextColor={colors.muted} value={goal} onChangeText={text => { invalidate(); setGoal(text); }} /></>}</View>
        <Action label={busy ? '正在认真想回复…' : candidates.length ? '再帮我想一句' : '帮我想回复'} loading={busy} onPress={() => void generate()} disabled={busy || !ready || !input.trim()} />
        {busy && <Action secondary label="取消生成" onPress={cancel} />}
        {!ready && <Action secondary label="连接 AI 服务" onPress={() => navigate('setup')} />}
        <Text style={[ui.note, { textAlign: 'center' }]}>只在你点生成时上传本条消息，不读取其他聊天。{"\n"}实际候选数量与每日额度由套餐决定。</Text>
        <View onLayout={event => { resultY.current = event.nativeEvent.layout.y; }} style={{ gap: 16 }}>
        {!!error && <View style={s.error}><Text accessibilityRole="alert" style={[ui.text, { color: colors.danger }]}>{error}</Text><Text style={ui.note}>确认网络与输入内容后，可点击上方按钮手动重试。</Text></View>}
        {!!notice && <Text accessibilityLiveRegion="polite" style={ui.note}>{notice}</Text>}
        {!!candidates.length && <Text accessibilityRole="header" accessibilityLiveRegion="polite" style={ui.heading}>给你的回复 · {candidates.length} 条</Text>}
        {candidates.map((reply, i) => <View key={i + ':' + reply} style={ui.card}><Text style={ui.selectedText}>回复 {String(i + 1).padStart(2, '0')}</Text><Text selectable style={s.candidate}>{reply}</Text><CopyAction text={reply} label="复制回复" /></View>)}
        </View>
      </>}
      {page === 'topics' && <TopicPanel persona={persona} onPersona={acceptPersona} ready={ready} />}
      {page === 'persona' && <><PageIntro title="用你喜欢的方式表达" note="选一个人设，也可以为不同关系保留不同的自己。" />{persona ? <PersonaPanel state={persona} catalog={catalog} onChange={acceptPersona} refresh={refreshCatalog} resetScroll={() => scroll.current?.scrollTo({ y: 0, animated: false })} /> : <View style={ui.card}><Text style={ui.note}>人设暂时无法读取，请重新打开应用。</Text></View>}</>}
      {page === 'history' && <HistoryPanel />}
      {page === 'setup' && <>
        <PageIntro title="聊天，从键盘开始" note="输入、回复、找话题，顺手完成。" />
        <KeyboardSetup />
        {([['account','额度与套餐','查看今日用量与订阅权益'],['backup','数据备份与恢复','加密导出，换机也能带走'],['updates','更新中心','查看版本，下载并校验更新']] as const).map(([id,title,note]) => <Pressable key={id} accessibilityRole="button" style={[ui.card,ui.row]} onPress={() => navigate(id)}><View style={{flex:1,gap:4}}><Text style={ui.heading}>{title}</Text><Text style={ui.note}>{note}</Text></View><Text style={s.chevron}>›</Text></Pressable>)}
        {Platform.OS === 'android' && <Pressable accessibilityRole="button" style={[ui.card, ui.row]} onPress={() => navigate('typing')}><View style={s.personaMark}><NavIcon name="setup" color={colors.primary} /></View><View style={{ flex: 1, gap: 3 }}><Text style={ui.heading}>让打字更顺手</Text><Text style={ui.note}>布局、主题、按键反馈与常用词</Text></View><Text style={s.chevron}>›</Text></Pressable>}
        <View style={ui.card}><View style={ui.between}><Text style={ui.heading}>AI 连接</Text><Text style={[ui.label, { color: ready ? colors.success : colors.secondary }]}>{ready ? '已连接' : '待连接'}</Text></View><Text style={ui.note}>{status}</Text><Text style={ui.note}>模型地址和供应商密钥由网页后台管理；手机只保存应用连接配置。</Text>
          <Action secondary label={advanced ? '收起连接设置' : '修改服务器连接'} onPress={() => setAdvanced(!advanced)} disabled={busy} />
          {advanced && connection && <><Text style={ui.label}>服务器地址</Text><TextInput accessibilityLabel="服务器地址" autoCapitalize="none" autoCorrect={false} editable={!busy} style={ui.input} value={connection.baseUrl} onChangeText={baseUrl => setConnection({ ...connection, baseUrl })} /><Text style={ui.label}>应用连接码</Text><TextInput accessibilityLabel="应用连接码" secureTextEntry autoCapitalize="none" autoCorrect={false} editable={!busy} style={ui.input} value={connection.apiKey} onChangeText={apiKey => setConnection({ ...connection, apiKey })} /><Action label={busy ? '连接中…' : '保存并连接'} loading={busy} onPress={() => void saveConnection()} disabled={busy} /></>}
          {!ready && !advanced && <Action label="重新连接" onPress={() => void saveConnection()} disabled={busy} />}
          {!!error && <Text accessibilityRole="alert" style={[ui.note, { color: colors.danger }]}>{error}</Text>}
        </View>
        <Action secondary label="使用帮助与隐私" onPress={() => navigate('help')} />
        <Text style={[ui.note, { textAlign: 'center' }]}>聊商 {version} · 输入与灵感，相伴每一次聊天</Text>
      </>}
      {page === 'account' && <><Action secondary label="返回键盘设置" onPress={() => navigate('setup')} /><AccountPanel /></>}
      {page === 'backup' && <><Action secondary label="返回键盘设置" onPress={() => navigate('setup')} /><BackupPanel /></>}
      {page === 'updates' && <><Action secondary label="返回键盘设置" onPress={() => navigate('setup')} /><UpdatePanel /></>}
      {page === 'help' && <><Action secondary label="返回键盘设置" onPress={() => navigate('setup')} /><HelpPanel connected={ready} /></>}
      {page === 'typing' && Platform.OS === 'android' && <><Action secondary label="返回键盘设置" onPress={() => navigate('setup')} /><TypingSettings /></>}
    </ScrollView></KeyboardAvoidingView>
    {!keyboardOpen && <View accessibilityRole="tablist" style={s.navigation}>{tabs.map(([id, label]) => { const active = page === id || id === 'setup' && ['typing','help','account','backup','updates'].includes(page); return <Pressable accessibilityRole="tab" accessibilityLabel={label} accessibilityState={{ selected: active, disabled: connecting.current }} key={id} disabled={connecting.current} onPress={() => navigate(id)} style={({ pressed }) => [s.navItem, pressed && { backgroundColor: colors.soft }]}><View style={[s.navIcon, active && { backgroundColor: colors.soft }]}><NavIcon name={id} color={active ? colors.primary : colors.muted} /></View><Text style={[s.navLabel, active && ui.selectedText]}>{label}</Text></Pressable>; })}</View>}
  </SafeAreaView>;
}
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background }, header: { minHeight: 80, paddingHorizontal: 20, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, logo: { width: 42, height: 42, borderRadius: 14, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center' }, brand: { fontSize: 22, fontWeight: '800', color: colors.ink }, brandEnglish: { fontSize: 13, color: colors.primary, fontWeight: '700' }, tagline: { fontSize: 11, lineHeight: 18, color: colors.muted }, connection: { minHeight: 48, paddingHorizontal: 10, borderRadius: 16, backgroundColor: '#ECEEF4', flexDirection: 'row', alignItems: 'center', gap: 5 }, connected: { backgroundColor: colors.successSoft }, dot: { width: 6, height: 6, borderRadius: 3 }, connectionText: { fontSize: 12, lineHeight: 18, color: colors.secondary, fontWeight: '600' },
  content: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 28, gap: 16 }, hero: { gap: 8, paddingVertical: 10 }, eyebrow: { fontSize: 10, letterSpacing: 1.6, fontWeight: '700', color: colors.primary }, heroTitle: { fontSize: 30, lineHeight: 40, fontWeight: '800', color: colors.ink }, heroNote: { fontSize: 15, lineHeight: 24, color: colors.secondary }, topicLink: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 6, padding: 14, borderRadius: 14, backgroundColor: colors.soft }, messageInput: { minHeight: 106, textAlignVertical: 'top', color: colors.ink, fontSize: 17, lineHeight: 27, paddingVertical: 8 }, textAction: { minWidth: 48, minHeight: 48, justifyContent: 'center', alignItems: 'center' },
  personaMark: { width: 42, height: 42, backgroundColor: colors.soft, borderRadius: 13, alignItems: 'center', justifyContent: 'center' }, chevron: { color: colors.muted, fontSize: 27 }, tone: { flex: 1, minWidth: 48, minHeight: 48, paddingHorizontal: 3, paddingVertical: 12, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 12 }, toneSelected: { backgroundColor: colors.soft, borderColor: colors.primary }, toneText: { fontSize: 14, color: colors.secondary, lineHeight: 22 }, quantity: { minHeight: 48, minWidth: 48, paddingHorizontal: 10, paddingVertical: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 12, justifyContent: 'center', alignItems: 'center' }, error: { backgroundColor: '#FCEEF1', borderRadius: 14, padding: 16, gap: 8 }, candidate: { fontSize: 17, lineHeight: 29, color: colors.ink }, step: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', paddingVertical: 4 }, stepNumber: { width: 30, height: 30, lineHeight: 30, borderRadius: 10, backgroundColor: colors.soft, color: colors.primary, textAlign: 'center', fontWeight: '700' },
  navigation: { flexDirection: 'row', paddingHorizontal: 8, paddingTop: 7, paddingBottom: 4, backgroundColor: colors.surface, borderTopWidth: 1, borderColor: colors.border }, navItem: { flex: 1, minWidth: 48, minHeight: 64, justifyContent: 'center', alignItems: 'center', gap: 3, borderRadius: 12 }, navIcon: { width: 48, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: 11 }, navLabel: { color: colors.muted, fontSize: 11, lineHeight: 18 },
});
