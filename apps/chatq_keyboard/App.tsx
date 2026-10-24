import { ChatPanel } from './src/components/ChatPanel';
import { AccountPanel } from './src/components/AccountPanel';
import { BackupPanel } from './src/components/BackupPanel';
import { UpdatePanel } from './src/components/UpdatePanel';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, AppState, BackHandler, Keyboard, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import Clipboard from '@react-native-clipboard/clipboard';
import { StatusBar } from 'expo-status-bar';
import { keyboardBridge, type KeyboardConfig } from './modules/chatq-keyboard';
import { connect, generateReply, refineReply, loadConnection, type ReplyStyle } from './src/services/api';
import { replyCards, reviseReply, refinementInstruction, type ReplyCard, type Refinement } from './src/services/replyCards';
import { ReplyCards, SavedRepliesPanel } from './src/components/ReplyCards';
import { ExpressionPanel } from './src/components/ExpressionPanel';
import * as storage from './src/services/storage';
import { loadPersona, savePersonaData, syncPersonaCatalog, replyPersonalization, replyGoals, replyWarmths, type PersonaState, type ReplyPersonalization } from './src/services/persona';
import { getConfigData, fetchConfigData, getCachedConfigData } from './src/services/configData';
import type { ConfigDataCache } from './src/types/configData';
import { PersonaPanel, PersonaChoices } from './src/components/PersonaPanel';
import { TypingSettings } from './src/components/TypingSettings';
import { TopicPanel } from './src/components/TopicPanel';
import { HistoryPanel } from './src/components/HistoryPanel';
import { KeyboardSetup } from './src/components/KeyboardSetup';
import { HelpPanel } from './src/components/HelpPanel';
import { version } from './package.json';
import { Action, CopyAction, NavIcon, PageIntro, SettingRow, ToolTile, type IconName } from './src/components/Ui';
import { colors, ui } from './src/design';

type Page = IconName | 'typing' | 'help' | 'account' | 'backup' | 'updates' | 'saved';
const tabs: [IconName, string][] = [['reply', '帮回复'], ['chat', 'AI 对话'], ['topics', '发现'], ['setup', '我的']];
const tones: [ReplyStyle, string][] = [['friendly', '自然'], ['professional', '得体'], ['funny', '幽默'], ['emoji', '轻松']];
const errorText = (error: unknown) => error instanceof Error ? error.message : '操作失败，请重试';
export default function App() { return <SafeAreaProvider><ChatQApp /></SafeAreaProvider>; }
function ChatQApp() {
  const { width, height, fontScale } = useWindowDimensions();
  const compactHome = fontScale >= 1.2 || height < 560;
  const compactHeader = width < 350 || fontScale >= 1.5;
  const [page, setPage] = useState<Page>('reply');
  const [persona, setPersona] = useState<PersonaState | null>(null);
  const [catalog, setCatalog] = useState<ConfigDataCache | null>(null);
  const [context, setContext] = useState('');
  const [goal, setGoal] = useState('');
  const [showContext, setShowContext] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [connection, setConnection] = useState<KeyboardConfig | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('正在连接服务器…');
  const [input, setInput] = useState('');
  const [replyMode, setReplyMode] = useState<'reply' | 'polish'>('reply');
  const drafts = useRef({ reply: '', polish: '' });
  const [showSource, setShowSource] = useState(true);
  const [style, setStyle] = useState<ReplyStyle>('friendly');
  const [count, setCount] = useState(1);
  const [candidates, setCandidates] = useState<ReplyCard[]>([]);
  const resultSettings = useRef<{ style: ReplyStyle; personalization: ReplyPersonalization }>({ style: 'friendly', personalization: {} });
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
  function switchMode(mode: 'reply' | 'polish') { if (mode === replyMode) return; drafts.current[replyMode] = input; invalidate(); setInput(drafts.current[mode]); setReplyMode(mode); setShowSource(true); }
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
    const open = (url: string | null) => { if (Platform.OS === 'android' && url?.startsWith('chatq://typing')) navigate('typing'); else if (url?.startsWith('chatq://history')) navigate('history'); else if (url?.startsWith('chatq://persona')) navigate('persona'); else if (url?.startsWith('chatq://saved')) navigate('saved'); else if (url?.startsWith('chatq://emoji')) navigate('emoji'); };
    void Linking.getInitialURL().then(open);
    const listener = Linking.addEventListener('url', event => open(event.url));
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardOpen(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardOpen(false));
    return () => { listener.remove(); show.remove(); hide.remove(); };
  }, []);
  useEffect(() => {
    const back = BackHandler.addEventListener('hardwareBackPress', () => { if (page === 'reply') return false; navigate(['typing','help','account','backup','updates'].includes(page) ? 'setup' : ['persona','history','saved','emoji'].includes(page) ? 'topics' : 'reply'); return true; });
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
    revealResult.current = false; setBusy(true); setError(''); setNotice('');
    const prompt = input.trim();
    try {
      const current = await loadPersona();
      if (controller.signal.aborted || !mounted.current) return;
      // A freshly loaded selection is used for the request without treating it as a user edit.
      personaSnapshot.current = JSON.stringify(current); setPersona(current);
      const personalization = replyPersonalization(current, context, goal);
      const replies = replyMode === 'polish' ? [await refineReply(prompt, '润色用户自己的草稿，保留原意和事实，不回答这段话，只输出润色后的文字。', style, personalization, controller.signal)] : await generateReply(prompt, style, count, personalization, controller.signal);
      if (controller.signal.aborted || !mounted.current) return;
      const label = [current.data.cards.find(c => c.id === current.selection.cardId)?.name || '自然真诚', tones.find(t => t[0] === style)?.[1], replyGoals.find(g => g.id === current.selection.goalId)?.name].filter(Boolean).join(' · ');
      resultSettings.current = { style, personalization };
      revealResult.current = true; setCandidates(replyCards(replies, label)); setShowSource(false); setShowOptions(false); Keyboard.dismiss();
      try { await storage.saveReplyConversation(prompt, replies, replyMode === 'polish' ? 'polish' : 'reply'); }
      catch { if (mounted.current && !controller.signal.aborted) setNotice('回复已生成，但本机记录未保存；仍可复制使用。'); }
    } catch (e) { if (!controller.signal.aborted && mounted.current) { revealResult.current = true; setError(errorText(e)); } }
    finally { if (request.current === controller) { request.current = null; if (mounted.current) setBusy(false); } }
  }
  async function refine(index: number, mode: Refinement) {
    if (request.current || !ready || connecting.current) return;
    const card = candidates[index]; if (!card) return;
    const controller = new AbortController(); request.current = controller; setBusy(true); setError(''); setNotice('');
    const settings = resultSettings.current;
    try {
      const text = await refineReply(card.text, refinementInstruction(mode), settings.style, settings.personalization, controller.signal);
      if (controller.signal.aborted || !mounted.current) return;
      const updated = reviseReply(card, text, mode);
      setCandidates(current => current.map((value, i) => i === index && value === card ? updated : value));
      try { await storage.saveReplyConversation(card.text, [text], 'polish'); } catch { if (!controller.signal.aborted) setNotice('改写已完成，但记录未保存；原结果仍可恢复。'); }
    } catch (e) { if (!controller.signal.aborted && mounted.current) setError(errorText(e) + '，原结果已保留。'); }
    finally { if (request.current === controller) { request.current = null; if (mounted.current) setBusy(false); } }
  }
  async function paste() {
    try { const text = await Clipboard.getString(); if (mounted.current) { if (!text.trim()) { setNotice('剪贴板里还没有文字，先复制消息；原草稿已保留。'); return; } if (text.length > 1000) { setError('消息超过 1000 字，请选取较短内容；原草稿已保留。'); return; } invalidate(); setInput(text); setShowSource(true); } }
    catch { setError('暂时无法读取剪贴板，请长按输入框粘贴。'); }
  }
  const selectedPersona = persona?.data.cards.find(c => c.id === persona.selection.cardId)?.name || '自然真诚';
  return <SafeAreaView style={s.root}><StatusBar style="dark" />
    {!keyboardOpen && page !== 'chat' && <View style={s.header}><View style={ui.row}><View style={s.logo}><NavIcon name="reply" color={colors.surface} /></View><View><Text style={s.brand}>聊商{!compactHeader && <Text style={s.brandEnglish}> ChatQ</Text>}</Text>{!compactHeader && <Text style={s.tagline}>让聊天，更像你</Text>}</View></View>
      <Pressable accessibilityRole="button" accessibilityLabel={ready ? '服务器已连接，查看连接设置' : '查看连接状态与重新连接'} onPress={() => navigate('setup')} style={[s.connection, ready && s.connected]}><View style={[s.dot, { backgroundColor: ready ? colors.success : colors.muted }]} /><Text style={[s.connectionText, ready && { color: colors.success }]}>{ready ? '已连接' : '离线可用'}</Text></Pressable>
    </View>}
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ChatPanel active={page === 'chat'} keyboardOpen={keyboardOpen} ready={ready} persona={persona} onConnect={() => navigate('setup')} onManagePersona={() => navigate('persona')} />
    <ScrollView style={page === 'chat' ? { display: 'none' } : undefined} ref={scroll} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={s.content}>
      {page === 'reply' && <>
        {!keyboardOpen && !candidates.length && fontScale < 1.6 && <View style={s.hero}><Text accessibilityRole="header" style={s.heroTitle}>这句，怎么回？</Text><Text style={ui.note}>选个风格，让表达更像你。</Text></View>}
        {!keyboardOpen && !input && !candidates.length && !compactHome && <View style={s.toolGrid}><ToolTile compact icon="persona" title="人设" tint={colors.rose} onPress={() => navigate('persona')} /><ToolTile compact icon="emoji" title="表情包" tint={colors.peach} onPress={() => navigate('emoji')} /><ToolTile compact icon="topics" title="找话题" tint={colors.mint} onPress={() => navigate('topics')} /><ToolTile compact icon="bookmark" title="常用句" tint={colors.sky} onPress={() => navigate('saved')} /></View>}
        <View style={s.modeTabs}>{(['reply', 'polish'] as const).map(mode => <Pressable accessibilityRole="tab" accessibilityLabel={mode === 'reply' ? '回复模式' : '润色模式'} accessibilityState={{ selected: replyMode === mode, disabled: busy }} disabled={busy} key={mode} onPress={() => switchMode(mode)} style={[s.modeTab, replyMode === mode && s.modeActive]}><NavIcon name={mode === 'reply' ? 'reply' : 'edit'} color={replyMode === mode ? colors.primary : colors.muted} /><Text style={[replyMode === mode ? ui.selectedText : ui.label, { flexShrink: 1 }]}>{mode === 'reply' ? fontScale >= 1.3 ? '回复' : '帮我回复' : fontScale >= 1.3 ? '润色' : '润色我的话'}</Text></Pressable>)}</View>
        <View style={[ui.card, s.composeCard]}>
          {showSource || !candidates.length ? <>
            <View style={ui.between}><Text style={ui.heading}>{replyMode === 'reply' ? '对方消息' : '我的草稿'}</Text><Action secondary accessibilityLabel="粘贴消息" label="粘贴" style={{ paddingHorizontal: 12 }} onPress={() => void paste()} disabled={busy} /></View>
            <TextInput accessibilityLabel={replyMode === 'reply' ? '对方消息' : '我的草稿'} multiline maxLength={1000} placeholder={replyMode === 'reply' ? '粘贴对方的话，帮你想回复…' : '写下想说的话，帮你变顺口…'} placeholderTextColor={colors.muted} value={input} onChangeText={text => { invalidate(); setInput(text); }} style={s.messageInput} editable={!busy} />
            {!!input && <View style={s.composeFoot}><Text style={ui.note}>{input.length}/1000</Text><Pressable accessibilityRole="button" accessibilityLabel="清空对方消息" disabled={busy} onPress={() => { invalidate(); setInput(''); }} style={s.textAction}><Text style={ui.note}>清空</Text></Pressable></View>}
          </> : <View style={ui.row}><View style={{ flex: 1, gap: 4 }}><Text style={ui.note}>{replyMode === 'reply' ? '对方消息' : '原草稿'}</Text><Text numberOfLines={2} style={ui.text}>{input}</Text></View><Action secondary label="修改" accessibilityLabel="修改消息" onPress={() => setShowSource(true)} disabled={busy} /></View>}
          <Pressable accessibilityRole="button" accessibilityLabel="回复偏好" accessibilityState={{ expanded: showOptions }} disabled={busy} onPress={() => setShowOptions(!showOptions)} style={s.preferences}><View style={s.personaMark}><NavIcon name="persona" color={colors.primary} /></View><View style={{ flex: 1, gap: 2 }}><Text style={ui.label}>{selectedPersona}</Text><Text numberOfLines={fontScale < 1.6 ? 1 : undefined} style={ui.note}>{persona?.data.relations.find(c => c.id === persona.selection.relationId)?.name || '关系不限'} · {replyGoals.find(g => g.id === (persona?.selection.goalId || ''))?.name}</Text></View><Text style={ui.selectedText}>{showOptions ? '收起' : '调整 ›'}</Text></Pressable>
        </View>
        {!ready && <Action secondary label="连接 AI 服务" onPress={() => navigate('setup')} />}
        <Text style={[ui.note, { textAlign: 'center' }]}>只使用你主动提供的文字</Text>
        {showOptions && <>
        {persona && <PersonaChoices state={persona} onChange={acceptPersona} disabled={busy} />}
        <View style={ui.card}><Text style={ui.heading}>用什么语气聊？</Text><View style={ui.row}>{tones.map(([id, label]) => <Pressable accessibilityRole="button" accessibilityState={{ selected: style === id }} key={id} disabled={busy} style={[s.tone, style === id && s.toneSelected]} onPress={() => { invalidate(); setStyle(id); }}><Text style={[s.toneText, style === id && ui.selectedText]}>{label}</Text></Pressable>)}</View>
          <View style={ui.between}><Text style={ui.label}>生成数量</Text><View style={ui.row}>{[1, 2, 3].map(n => <Pressable accessibilityRole="button" accessibilityLabel={n + ' 条回复'} accessibilityState={{ selected: count === n }} key={n} disabled={busy} onPress={() => { invalidate(); setCount(n); }} style={[s.quantity, count === n && s.toneSelected]}><Text style={count === n ? ui.selectedText : ui.note}>{n} 条</Text></Pressable>)}</View></View>
        </View>
        <View style={ui.card}><Pressable accessibilityRole="button" accessibilityState={{ expanded: showContext }} onPress={() => setShowContext(!showContext)} style={[ui.between, { minHeight: 48 }]}><Text style={ui.label}>补充背景与回复目标</Text><Text style={ui.note}>{showContext ? '收起 ⌃' : '选填 ＋'}</Text></Pressable>{showContext && <><TextInput accessibilityLabel="聊天背景" editable={!busy} style={[ui.input, { minHeight: 88 }]} maxLength={200} multiline placeholder="例如：昨天约好见面，今天对方临时取消。" placeholderTextColor={colors.muted} value={context} onChangeText={text => { invalidate(); setContext(text); }} /><Text style={ui.label}>本次想达到什么目的？</Text><TextInput accessibilityLabel="回复目标" editable={!busy} style={ui.input} maxLength={80} placeholder="表达关心、礼貌拒绝、推进邀约…" placeholderTextColor={colors.muted} value={goal} onChangeText={text => { invalidate(); setGoal(text); }} /></>}</View>
        </>}
        <View onLayout={event => { resultY.current = event.nativeEvent.layout.y; }} style={{ gap: 16 }}>
        {!!error && <View style={s.error}><Text accessibilityRole="alert" style={[ui.text, { color: colors.danger }]}>{error}</Text><Text style={ui.note}>检查网络与输入后，可点击底部按钮重试。</Text></View>}
        {!!notice && <Text accessibilityLiveRegion="polite" style={ui.note}>{notice}</Text>}
        {!!candidates.length && <View style={ui.between}><Text accessibilityRole="header" accessibilityLiveRegion="polite" style={ui.heading}>{replyMode === 'polish' ? '润色好了' : '这样回，更顺口'}</Text><Text style={ui.note}>{candidates.length} 条建议</Text></View>}
        <ReplyCards cards={candidates} busy={busy} onRefine={(i, mode) => void refine(i, mode)} onRestore={(index, card) => setCandidates(current => current.map((value, i) => index === i ? card : value))} />
        </View>
      </>}
      {page === 'topics' && <><Text accessibilityRole="header" style={ui.heading}>聊天工具箱</Text><View style={s.toolGrid}><ToolTile icon="emoji" title="表情包" note="给聊天加点情绪" tint={colors.peach} onPress={() => navigate('emoji')} /><ToolTile icon="persona" title="人设卡片" note="找到你的语气" onPress={() => navigate('persona')} /><ToolTile icon="history" title="常用句" note="喜欢的表达留下来" onPress={() => navigate('saved')} /><ToolTile icon="history" title="生成记录" note="好表达随时回看" onPress={() => navigate('history')} /></View><TopicPanel persona={persona} onPersona={acceptPersona} ready={ready} /></>}
      {page === 'emoji' && <><View style={ui.between}><Text accessibilityRole="header" style={ui.title}>表情中心</Text><Action secondary label="返回首页" onPress={() => navigate('reply')} /></View><ExpressionPanel /></>}
      {page === 'saved' && <><Action secondary label="返回发现" onPress={() => navigate('topics')} /><SavedRepliesPanel /></>}
      {page === 'persona' && <><View style={ui.between}><Text accessibilityRole="header" style={ui.title}>人设卡片</Text><Action secondary label="返回发现" onPress={() => navigate('topics')} /></View>{persona ? <PersonaPanel state={persona} catalog={catalog} onChange={acceptPersona} refresh={refreshCatalog} resetScroll={() => scroll.current?.scrollTo({ y: 0, animated: false })} /> : <View style={ui.card}><Text style={ui.note}>人设暂时无法读取，请重新打开应用。</Text></View>}</>}
      {page === 'history' && <><Action secondary label="返回发现" onPress={() => navigate('topics')} /><HistoryPanel /></>}
      {page === 'setup' && <>
        <PageIntro title="我的聊商" note="调成顺手的键盘，留住喜欢的表达。" />
        <KeyboardSetup onCustomize={Platform.OS === 'android' ? () => navigate('typing') : undefined} />
        <View style={ui.card}><Text style={ui.heading}>账户与数据</Text><View>{([['account','persona','额度与套餐','今日用量与订阅权益'],['backup','history','备份与恢复','加密备份，安全换机'],['updates','setup','更新中心','查看新版与安装包']] as const).map(([id,icon,title,note], index) => <View key={id} style={index ? s.rowDivider : undefined}><SettingRow icon={icon} title={title} note={note} onPress={() => navigate(id)} /></View>)}</View></View>
        <View style={ui.card}><View style={ui.between}><Text style={ui.heading}>AI 连接</Text><Text style={[ui.label, { color: ready ? colors.success : colors.secondary }]}>{ready ? '已连接' : '待连接'}</Text></View>{(!ready || advanced) && <Text style={ui.note}>{status}</Text>}{advanced && <Text style={ui.note}>模型地址和供应商密钥由网页后台管理；手机只保存应用连接配置。</Text>}
          <Action secondary label={advanced ? '收起连接设置' : '修改服务器连接'} onPress={() => setAdvanced(!advanced)} disabled={busy} />
          {advanced && connection && <><Text style={ui.label}>服务器地址</Text><TextInput accessibilityLabel="服务器地址" autoCapitalize="none" autoCorrect={false} editable={!busy} style={ui.input} value={connection.baseUrl} onChangeText={baseUrl => setConnection({ ...connection, baseUrl })} /><Text style={ui.label}>应用连接码</Text><TextInput accessibilityLabel="应用连接码" secureTextEntry autoCapitalize="none" autoCorrect={false} editable={!busy} style={ui.input} value={connection.apiKey} onChangeText={apiKey => setConnection({ ...connection, apiKey })} /><Action label={busy ? '连接中…' : '保存并连接'} loading={busy} onPress={() => void saveConnection()} disabled={busy} /></>}
          {!ready && !advanced && <Action label="重新连接" onPress={() => void saveConnection()} disabled={busy} />}
          {!!error && <Text accessibilityRole="alert" style={[ui.note, { color: colors.danger }]}>{error}</Text>}
        </View>
        <Action secondary label="使用帮助与隐私" onPress={() => navigate('help')} />
        <Text style={[ui.note, { textAlign: 'center' }]}>聊商 {version} · 输入与灵感，相伴每一次聊天</Text>
      </>}
      {page === 'account' && <><Action secondary label="返回我的" onPress={() => navigate('setup')} /><AccountPanel /></>}
      {page === 'backup' && <><Action secondary label="返回我的" onPress={() => navigate('setup')} /><BackupPanel /></>}
      {page === 'updates' && <><Action secondary label="返回我的" onPress={() => navigate('setup')} /><UpdatePanel /></>}
      {page === 'help' && <><Action secondary label="返回我的" onPress={() => navigate('setup')} /><HelpPanel connected={ready} /></>}
      {page === 'typing' && Platform.OS === 'android' && <><Action secondary label="返回我的" onPress={() => navigate('setup')} /><TypingSettings /></>}
    </ScrollView>
    {page === 'reply' && <View style={{paddingHorizontal:20,paddingVertical:8,backgroundColor:colors.surface,borderTopWidth:1,borderColor:colors.border}}><Action secondary={!!candidates.length && !busy} label={busy ? '停止生成' : replyMode === 'polish' ? candidates.length ? '再润色一次' : '帮我润色' : candidates.length ? '再帮我想一句' : '帮我想回复'} loading={busy} onPress={() => busy ? cancel() : void generate()} disabled={!busy && (!ready || !input.trim())} /></View>}
    </KeyboardAvoidingView>
    {!keyboardOpen && <View accessibilityRole="tablist" style={s.navigation}>{tabs.map(([id, label]) => { const active = page === id || id === 'topics' && ['persona','history','saved','emoji'].includes(page) || id === 'setup' && ['typing','help','account','backup','updates'].includes(page); return <Pressable accessibilityRole="tab" accessibilityLabel={label} accessibilityState={{ selected: active, disabled: connecting.current }} key={id} disabled={connecting.current} onPress={() => navigate(id)} style={({ pressed }) => [s.navItem, pressed && { backgroundColor: colors.soft }]}><View style={[s.navIcon, active && { backgroundColor: colors.soft }]}><NavIcon name={id} color={active ? colors.primary : colors.muted} /></View><Text style={[s.navLabel, active && ui.selectedText]}>{fontScale >= 1.6 && id === 'chat' ? '对话' : label}</Text></Pressable>; })}</View>}
  </SafeAreaView>;
}
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background }, header: { minHeight: 56, paddingHorizontal: 16, paddingVertical: 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, logo: { width: 36, height: 36, borderRadius: 12, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center' }, brand: { fontSize: 22, fontWeight: '800', color: colors.ink }, brandEnglish: { fontSize: 13, color: colors.primary, fontWeight: '700' }, tagline: { fontSize: 11, lineHeight: 18, color: colors.muted }, connection: { minHeight: 48, paddingHorizontal: 10, borderRadius: 16, backgroundColor: '#ECEEF4', flexDirection: 'row', alignItems: 'center', gap: 5 }, connected: { backgroundColor: colors.successSoft }, dot: { width: 6, height: 6, borderRadius: 3 }, connectionText: { fontSize: 12, lineHeight: 18, color: colors.secondary, fontWeight: '600' },
  composeCard: { borderColor: colors.border, gap: 6, padding: 12 }, composeFoot: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, preferences: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 8, paddingBottom: 0, borderTopWidth: 1, borderColor: colors.border, minHeight: 64 }, toolGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, rowDivider: { borderTopWidth: 1, borderColor: colors.border },
  content: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 28, gap: 12 }, hero: { gap: 2, paddingVertical: 0 }, eyebrow: { fontSize: 12, lineHeight: 20, fontWeight: '600', color: colors.primary }, heroTitle: { fontSize: 24, lineHeight: 32, fontWeight: '800', color: colors.ink }, heroNote: { fontSize: 15, lineHeight: 24, color: colors.secondary }, topicLink: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 6, padding: 14, borderRadius: 14, backgroundColor: colors.soft }, messageInput: { minHeight: 64, paddingHorizontal: 12, backgroundColor: colors.background, borderRadius: 12, textAlignVertical: 'top', color: colors.ink, fontSize: 17, lineHeight: 27, paddingVertical: 8 }, textAction: { minWidth: 48, minHeight: 48, justifyContent: 'center', alignItems: 'center' },
  personaMark: { width: 32, height: 32, backgroundColor: colors.soft, borderRadius: 13, alignItems: 'center', justifyContent: 'center' }, chevron: { color: colors.muted, fontSize: 27 }, tone: { flex: 1, minWidth: 48, minHeight: 48, paddingHorizontal: 3, paddingVertical: 12, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 12 }, toneSelected: { backgroundColor: colors.soft, borderColor: colors.primary }, toneText: { fontSize: 14, color: colors.secondary, lineHeight: 22 }, quantity: { minHeight: 48, minWidth: 48, paddingHorizontal: 10, paddingVertical: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 12, justifyContent: 'center', alignItems: 'center' }, error: { backgroundColor: '#FCEEF1', borderRadius: 14, padding: 16, gap: 8 }, candidate: { fontSize: 17, lineHeight: 29, color: colors.ink }, step: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', paddingVertical: 4 }, stepNumber: { width: 30, height: 30, lineHeight: 30, borderRadius: 10, backgroundColor: colors.soft, color: colors.primary, textAlign: 'center', fontWeight: '700' },
  modeTabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, padding: 4, borderRadius: 17, backgroundColor: '#EBE8F3' }, modeTab: { flex: 1, minWidth: 120, minHeight: 48, padding: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 13 }, modeActive: { backgroundColor: colors.surface },
  navigation: { flexDirection: 'row', paddingHorizontal: 8, paddingTop: 6, paddingBottom: 6, backgroundColor: colors.surface, borderTopWidth: 1, borderColor: colors.border }, navItem: { flex: 1, minWidth: 48, minHeight: 64, justifyContent: 'center', alignItems: 'center', gap: 3, borderRadius: 12 }, navIcon: { width: 56, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: 11 }, navLabel: { color: colors.muted, fontSize: 12, lineHeight: 20 },
});
