import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, Alert, AppState, BackHandler, FlatList, Image, Keyboard, Modal, Pressable, SafeAreaView, ScrollView, StyleSheet, Switch, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { keyboardBridge } from '../../modules/chatq-keyboard';
import { ChatController, chatHistory, chatPersona, newChat, validateAttachments, type Attachment, type ChatSummary, type ChatTurn } from '../services/chat';
import { listChats, getChat, saveChat, deleteChat } from '../services/chatStore';
import { sendChat } from '../services/api';
import type { PersonaState } from '../services/persona';
import { displayError } from '../services/nativeError';
import { colors, ui } from '../design';
import { Action, CopyAction } from './Ui';
import { ChatTools, type ChatTool } from './ChatTools';
import { chatHighlights, findChatTurns, hasTemporaryChat } from '../services/chatView';
import { ChatMarkdown } from './ChatMarkdown';
import { ChatLibrary } from './ChatLibrary';
import { SyncPanel } from './SyncPanel';

export function ChatPanel({ active, keyboardOpen, ready, persona, onConnect, onManagePersona }: { active: boolean; keyboardOpen: boolean; ready: boolean; persona: PersonaState | null; onConnect: () => void; onManagePersona: () => void }) {
  const {fontScale}=useWindowDimensions(),largeType=fontScale>=1.5;
  const [controller] = useState(() => new ChatController(saveChat, sendChat));
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot), session = state.session;
  const [loaded, setLoaded] = useState(false), [loading, setLoading] = useState(false), [error, setError] = useState('');
  const [panel, setPanel] = useState<'sessions' | 'settings' | null>(null), [sessions, setSessions] = useState<ChatSummary[]>([]), [savedMode, setSavedMode] = useState(true);
  const [query, setQuery] = useState(''), [searching, setSearching] = useState(false);
  const [finding, setFinding] = useState(false), [findQuery, setFindQuery] = useState(''), [showLatest, setShowLatest] = useState(false);
  const readRevision = useRef(0);
  const searchRevision = useRef(0), toolRevision = useRef(0), activeRef = useRef(active); activeRef.current = active;
  const [tool, setTool] = useState<ChatTool | null>(null);
  const [library, setLibrary] = useState<ChatTurn | 'branches' | null>(null), [picking,setPicking] = useState(false);
  const [syncOpen,setSyncOpen] = useState(false);
  const [deleting,setDeleting] = useState(false), deleteLock = useRef(false);
  const lastEdit = useRef<{ sessionId: string; turnId: string; question: string } | null>(null);
  const list = useRef<FlatList<ChatTurn>>(null), input = useRef<TextInput>(null), mounted = useRef(true), nearEnd = useRef(true), manualScroll = useRef(false);
  const busy = state.phase !== 'idle';
  const selected = chatPersona(persona, session.personaId);
  const contextRounds = chatHistory(session, session.draft).length / 2;
  const localQuery = finding ? findQuery : '';
  const visibleTurns = useMemo(() => findChatTurns(session, localQuery), [session.turns, localQuery]);
  const latest = () => { manualScroll.current = false; nearEnd.current = true; setShowLatest(false); list.current?.scrollToEnd({ animated: false }); };
  function closeFind() { setFinding(false); setFindQuery(''); manualScroll.current = false; nearEnd.current = true; setTimeout(latest, 150); Keyboard.dismiss(); }
  async function refreshSessions(text = '') { const ticket = ++searchRevision.current; const rows = await listChats(text); if (mounted.current && ticket === searchRevision.current) setSessions(rows); return rows; }
  async function init() {
    const ticket = ++readRevision.current, original = controller.getSnapshot().session;
    setLoading(true); setError('');
    try { const rows = await refreshSessions(); const value = rows.length ? await getChat(rows[0].id) : null;
      if (!mounted.current || !activeRef.current || ticket !== readRevision.current) return;
      if (value && !controller.getSnapshot().unsaved) controller.open(value, original); setLoaded(true);
    }
    catch (e) { if (mounted.current && activeRef.current && ticket === readRevision.current) setError(displayError(e, '本机会话读取失败')); }
    finally { if (mounted.current && ticket === readRevision.current) setLoading(false); }
  }
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; controller.cancel(); void controller.flush().catch(() => {}); }; }, [controller]);
  useEffect(() => {
    if (!active) { readRevision.current++; toolRevision.current++; setLoading(false); setTool(null); setLibrary(null); setSyncOpen(false); controller.cancel(); setPanel(null); void controller.flush().catch(() => {}); return; }
    if (!loaded) void init();
    void keyboardBridge?.getHistoryEnabled?.().then(setSavedMode).catch(() => {});
    const listener = AppState.addEventListener('change', value => { if (value !== 'active') { controller.cancel(); void controller.flush().catch(e => setError(displayError(e, '草稿保存失败'))); } else void keyboardBridge?.getHistoryEnabled?.().then(setSavedMode).catch(() => {}); });
    return () => { readRevision.current++; listener.remove(); };
  }, [active, loaded]);
  useEffect(() => {
    if (!active || !loaded || !state.unsaved || busy) return;
    const timer = setTimeout(() => { void controller.flush().catch(e => { if (mounted.current) setError(displayError(e, '本机保存失败')); }); }, 500);
    return () => clearTimeout(timer);
  }, [active, loaded, session, state.unsaved, busy]);
  useEffect(() => {
    // Scroll after the new bubble and composer have both completed native layout.
    // A content-size callback can run before the list viewport resizes at large font sizes.
    const timer = setTimeout(() => { if (nearEnd.current && !finding) list.current?.scrollToEnd({ animated: false }); }, 150);
    return () => clearTimeout(timer);
  }, [session.id, session.turns.length, state.phase, finding]);
  useEffect(() => { manualScroll.current = false; nearEnd.current = true; setShowLatest(false); setFinding(false); setFindQuery(''); }, [session.id]);
  useEffect(() => { if (finding) { const timer = setTimeout(() => list.current?.scrollToOffset({ offset: 0, animated: false }), 150); return () => clearTimeout(timer); } }, [finding, findQuery]);
  useEffect(() => { if (!active || !finding) return; const listener = BackHandler.addEventListener('hardwareBackPress', () => { closeFind(); return true; }); return () => listener.remove(); }, [active, finding]);
  async function switchTo(id?: string) {
    if (busy || loading) return;
    const ticket = ++readRevision.current, original = controller.getSnapshot().session;
    setLoading(true); setError('');
    try {
      const saved = await controller.flush();
      if (!saved && hasTemporaryChat(original, controller.getSnapshot().unsaved) && id !== original.id) {
        const leave = await new Promise<boolean>(resolve => Alert.alert('离开未保存的对话？', '本机保存已关闭。继续会丢弃当前临时问答和草稿；你可以先返回开启保存。', [{ text: '留下', style: 'cancel', onPress: () => resolve(false) }, { text: '放弃并继续', style: 'destructive', onPress: () => resolve(true) }], { cancelable: true, onDismiss: () => resolve(false) }));
        if (!leave) return;
      }
      const value = id !== original.id ? (id ? await getChat(id) : newChat()) : original;
      if (!mounted.current || !activeRef.current || ticket !== readRevision.current || controller.getSnapshot().session !== original) return;
      if (id !== original.id && !controller.open(value, original)) return;
      setPanel(null); Keyboard.dismiss(); nearEnd.current = true;
    } catch (e) { if (mounted.current && activeRef.current && ticket === readRevision.current) setError(displayError(e, '无法切换会话')); }
    finally { if (mounted.current && ticket === readRevision.current) setLoading(false); }
  }
  async function openSessions() {
    setQuery(''); setError(''); setPanel('sessions'); Keyboard.dismiss();
    try { await controller.flush(); } catch (e) { setError(displayError(e, '草稿未保存，仍可在下方整理会话')); }
  }
  useEffect(() => {
    if (panel !== 'sessions') return;
    let current = true; setSearching(true);
    const timer = setTimeout(() => { void refreshSessions(query).catch(e => { if (current) setError(displayError(e, '会话搜索失败')); }).finally(() => { if (current) setSearching(false); }); }, 200);
    return () => { current = false; searchRevision.current++; clearTimeout(timer); };
  }, [panel, query]);
  function remove(item: ChatSummary) {
    if (deleteLock.current || busy || loading) return;
    Alert.alert('删除这段 AI 对话？', '只删除本机会话，不能撤销；回复与话题记录不受影响。', [{ text: '保留', style: 'cancel' }, { text: '删除', style: 'destructive', onPress: () => { void removeConfirmed(item.id); } }]);
  }
  async function removeConfirmed(id: string) {
    if (!mounted.current || !activeRef.current || deleteLock.current || controller.getSnapshot().phase !== 'idle') return;
    deleteLock.current = true; setDeleting(true); setLoading(true); setError('');
    try { await controller.remove(id, deleteChat); if (mounted.current && activeRef.current) await refreshSessions(query); }
    catch (e) { if (mounted.current && activeRef.current) setError(displayError(e, '删除失败，原会话仍保留')); }
    finally { deleteLock.current = false; if (mounted.current) { setDeleting(false); setLoading(false); } }
  }
  function reset() { Alert.alert('重置本次上下文？', '下一轮不会携带此前对话，并清除补充背景。已有本机记录和所选人设保留。', [{ text: '保留', style: 'cancel' }, { text: '重置上下文', onPress: () => controller.resetContext() }]); }
  async function closeSettings() { try { await controller.flush(); toolRevision.current++; setPanel(null); } catch (e) { setError(displayError(e, '设置保存失败')); } }
  async function openTool(kind: 'rename' | 'export', id = session.id, back: 'sessions' | 'settings' = 'settings') {
    if (busy || loading) return;
    const ticket = ++toolRevision.current; setLoading(true); setError(''); Keyboard.dismiss();
    try {
      const current = controller.getSnapshot().session;
      const value = id === current.id ? current : await getChat(id);
      if (!mounted.current || !activeRef.current || ticket !== toolRevision.current) return;
      setPanel(null); setTool({ kind, session: value, back });
    } catch (e) { if (mounted.current && ticket === toolRevision.current) setError(displayError(e, '无法读取会话')); }
    finally { if (mounted.current) setLoading(false); }
  }
  function editQuestion(turn: ChatTurn) {
    Keyboard.dismiss(); setError('');
    const previous = lastEdit.current;
    setTool({ kind: 'edit', session, turnId: turn.id, question: previous?.sessionId === session.id && previous.turnId === turn.id ? previous.question : turn.question });
  }
  function closeTool() { Keyboard.dismiss(); toolRevision.current++; if (tool && tool.kind !== 'edit') setPanel(tool.back); setTool(null); }
  async function rename(title: string) {
    if (!tool || tool.kind !== 'rename') return;
    if (tool.session.id === controller.getSnapshot().session.id) await controller.rename(title);
    else if (!await saveChat({ ...tool.session, title, updatedAt: Math.max(Date.now(), tool.session.updatedAt + 1) })) throw new Error('请先开启本机记录保存，再重命名会话');
  }
  async function pick(kind:'image'|'file') {
    if (busy || loading || picking) return;
    if (!keyboardBridge?.pickChatAttachment) { setError('当前平台暂不支持附件选择，请使用新版安卓应用'); return; }
    if ((session.attachments?.length || 0) >= 2) { setError('每次最多 2 个附件，请先移除一个'); return; }
    setPicking(true); setError(''); const original = controller.getSnapshot().session;
    try { const value = await keyboardBridge.pickChatAttachment(kind); if (!mounted.current || !value || controller.getSnapshot().session !== original || controller.getSnapshot().phase !== 'idle') return;
      const rows = [...(original.attachments || []), JSON.parse(value) as Attachment]; validateAttachments(rows);
      controller.edit({attachments: rows, draft: original.draft || '请帮我分析附件中的内容'});
    } catch (e) { if (mounted.current) setError(displayError(e,'附件选择失败')); } finally { if (mounted.current) setPicking(false); }
  }
  function chooseAttachment() { Keyboard.dismiss(); Alert.alert('添加附件','仅在点击发送后，将所选附件发往你在“我的 API”配置的供应商。每次最多 2 个，图片会压缩；支持 PDF（500KB）和 UTF-8 文本（合计12000字）。图片/PDF需模型支持。', [{text:'取消',style:'cancel'},{text:'选择图片',onPress:()=>void pick('image')},{text:'选择文件',onPress:()=>void pick('file')}]); }
  const attachmentAction=<Action secondary label="＋" accessibilityLabel="添加图片或文件附件" disabled={busy || loading || picking || !loaded} loading={picking} style={{ minWidth: 48, minHeight: 52, paddingHorizontal: 8 }} onPress={chooseAttachment} />;
  const messageInput=<TextInput ref={input} accessibilityLabel="AI 对话消息" placeholder={largeType?'输入消息…':'输入消息，和 AI 接着聊…'} placeholderTextColor={colors.muted} multiline maxLength={2000} editable={loaded && !busy && !loading} value={busy ? '' : session.draft} onChangeText={draft => { setError(''); controller.edit({ draft }); }} onFocus={() => { if (finding) { setFinding(false); setFindQuery(''); } nearEnd.current = true; setTimeout(latest, 250); }} style={[s.input,largeType&&{flex:0,width:'100%',minHeight:72}]} />;
  const sendAction=state.phase === 'generating' ? <Action secondary label="停止生成" onPress={() => controller.cancel()} style={s.send} /> : <Action accessibilityLabel="发送给 AI" label={state.phase === 'saving' ? '保存中' : '发送'} loading={state.phase === 'saving'} disabled={busy || loading || !loaded || !ready || !session.draft.trim()} onPress={() => { closeFind(); Keyboard.dismiss(); nearEnd.current = true; setError(''); void controller.send(chatPersona(persona, session.personaId)); }} style={s.send} />;
  if (!active) return null;
  return <View style={s.root}>
    {(!largeType||!keyboardOpen)&&<View style={[s.heading,largeType&&{flexDirection:'column',alignItems:'stretch'}]}><Text accessibilityRole="header" accessibilityLabel="AI 对话标题" style={s.title}>AI 对话</Text><View style={ui.row}><Action secondary label="新对话" disabled={busy || loading || !loaded} onPress={() => void switchTo()} style={[s.smallAction,largeType&&{flex:1}]} /><Action secondary label="会话" disabled={busy || loading || !loaded} onPress={() => void openSessions()} style={[s.smallAction,largeType&&{flex:1}]} /></View></View>}
    {!keyboardOpen && <View style={s.settings}><Pressable accessibilityRole="button" accessibilityLabel="对话人设与上下文" disabled={busy || loading || !loaded} onPress={() => { Keyboard.dismiss(); setPanel('settings'); }} style={{ flex: 1, minHeight: 48, justifyContent: 'center' }}><Text numberOfLines={1} style={ui.selectedText}>{session.title}</Text><Text numberOfLines={1} style={ui.note}>{selected.personaName} · {session.useContext ? `携带 ${contextRounds} 轮` : '不携带历史'} · 设置 ›</Text></Pressable><Action secondary label="查找" accessibilityLabel="查找当前对话" disabled={busy || loading || !loaded || !session.turns.length} style={s.smallAction} onPress={() => { nearEnd.current = false; setFinding(true); }} /></View>}
    {!savedMode && !keyboardOpen && <Text style={s.banner}>本机保存已关闭，当前问答和草稿仅临时保留。</Text>}
    {finding && <View style={s.find}><View style={ui.row}><TextInput accessibilityLabel="查找当前会话内容" placeholder="查找本段问题或回答…" placeholderTextColor={colors.muted} maxLength={200} value={findQuery} onChangeText={setFindQuery} style={[ui.input, { flex: 1 }]} /><Action secondary label="关闭" accessibilityLabel="关闭当前会话查找" style={s.smallAction} onPress={closeFind} /></View><Text accessibilityLiveRegion="polite" style={ui.note}>{findQuery.trim() ? `匹配 ${visibleTurns.length}/${session.turns.length} 轮 · 仅本机查找` : '输入关键词查找本段完整问答，不消耗额度'}</Text></View>}
    {loading && <ActivityIndicator accessibilityLabel="正在读取会话" color={colors.primary} />}
    <View style={s.timeline}><FlatList ref={list} extraData={[state.phase, ready, loading, localQuery]} data={visibleTurns} keyExtractor={t => t.id} style={s.list} contentContainerStyle={s.messages} initialNumToRender={5} maxToRenderPerBatch={5} windowSize={5} removeClippedSubviews={false} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
      onScrollBeginDrag={() => { manualScroll.current = true; }} onScroll={e => { if (!manualScroll.current) return; const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent; nearEnd.current = contentOffset.y + layoutMeasurement.height >= contentSize.height - 100; setShowLatest(!nearEnd.current); }} scrollEventThrottle={100}
      onContentSizeChange={() => { if (nearEnd.current && !finding) list.current?.scrollToEnd({ animated: false }); }}
      renderItem={({ item }) => <View style={{ gap: 10 }}>
        {session.contextStart > 0 && session.turns[session.contextStart]?.id === item.id && <Text style={s.divider}>从这里开始新的上下文</Text>}
        <View style={s.userBubble}><View style={ui.between}><Text style={ui.label}>你</Text><View style={ui.row}><CopyAction text={item.question} label="复制" accessibilityLabel={'复制问题：' + item.question} compact /><Action secondary label="编辑" accessibilityLabel={"编辑问题：" + item.question} disabled={busy || loading || !ready} onPress={() => editQuestion(item)} style={{ paddingHorizontal: 8 }} /></View></View><ChatText text={item.question} query={localQuery} />{!!item.attachments?.length && <AttachmentList rows={item.attachments} />}</View>
        <View style={s.aiBubble}><View style={ui.between}><Text style={[ui.selectedText, { flexShrink: 1 }]}>AI · {item.personaName}</Text><Text style={s.time}>{new Date(item.at).toLocaleString(undefined, { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</Text></View><ChatText text={item.answer} query={localQuery} answer />{!!item.alternatives?.length && <Action secondary label={`回答版本 · ${item.alternatives.length + 1} 个`} disabled={busy || loading} onPress={() => setLibrary(item)} />}<View style={{ flexDirection: 'row', gap: 8 }}><CopyAction text={item.answer} label="复制" accessibilityLabel="复制 AI 回答" compact style={{ flex: 1 }} />{item.id === session.turns.at(-1)?.id && <Action secondary label="重新生成" style={{ flex: 1, paddingHorizontal: 6 }} accessibilityLabel="重新生成最后回答" disabled={busy || loading || !ready} onPress={() => { closeFind(); Keyboard.dismiss(); nearEnd.current = true; setError(''); void controller.regenerate(chatPersona(persona, session.personaId)); }} />}</View></View>
      </View>}
      ListEmptyComponent={!loading && !state.pending && !state.partial ? <View style={s.empty}>{finding && findQuery.trim() ? <><Text style={ui.heading}>没有匹配的问答</Text><Text style={ui.note}>换个关键词试试，或关闭查找查看全部消息。</Text></> : <><View style={s.spark}><Text style={s.sparkText}>✦</Text></View><Text style={ui.heading}>想说的，慢慢聊</Text><Text style={[ui.note, { textAlign: 'center' }]}>从一个问题开始，AI 会接着本次对话回答。{"\n"}人设和上下文由你决定。</Text><Action secondary label="帮我梳理一下今天的安排" onPress={() => { controller.edit({ draft: '帮我梳理一下今天的安排' }); input.current?.focus(); }} /></>}</View> : null}
      ListFooterComponent={state.pending || state.partial ? <View style={{ gap: 12 }}>{!!state.pending && !state.regenerating && <View style={s.userBubble}><Text style={ui.label}>你</Text><Text style={ui.text}>{state.pending}</Text></View>}<View style={s.aiBubble}><Text accessibilityLiveRegion="polite" style={ui.selectedText}>{state.phase === 'generating' ? (state.regenerating ? '正在重新生成…' : 'AI 正在回答…') : '未完成预览 · 未加入上下文'}</Text>{state.partial ? <Text selectable style={s.answer}>{state.partial}</Text> : <Text style={ui.note}>正在等待 AI…</Text>}{state.partial && state.phase === 'idle' ? <CopyAction text={state.partial} label="复制未完成预览" compact /> : null}</View></View> : null}
    />{showLatest && !finding && <Pressable accessibilityRole="button" accessibilityLabel="查看最新消息" onPress={latest} style={s.jump}><Text style={ui.selectedText}>最新 ↓</Text></Pressable>}</View>
    <View style={s.composer}>
      {!!(error || state.error) && <View style={s.error}><ScrollView style={{ maxHeight: 70 }}><Text accessibilityRole="alert" style={[ui.note, { color: colors.danger }]}>{error || state.error}</Text></ScrollView><View style={[ui.row, { flexWrap: 'wrap' }]}>{state.retry && <Action secondary label={state.retry === 'regenerate' ? '重试重新生成' : '重试本次问题'} disabled={busy || !ready || loading} onPress={() => { closeFind(); nearEnd.current = true; void controller.retry(chatPersona(persona, session.personaId)); }} />}{state.unsaved && !state.retry && <Action secondary label="保存本机记录" onPress={() => { setError(''); void controller.retrySave(); }} />}{!loaded && <Action secondary label="重新读取会话" onPress={() => void init()} />}</View></View>}
      {!!state.notice && !keyboardOpen && <View style={ui.row}><Text accessibilityLiveRegion="polite" numberOfLines={2} style={[ui.note, { flex: 1 }]}>{state.notice}</Text><Action secondary label="关闭" accessibilityLabel="隐藏对话提示" style={s.smallAction} onPress={() => controller.dismissNotice()} /></View>}
      {!!session.attachments?.length && <ScrollView style={{ maxHeight: keyboardOpen ? 56 : 150 }}><AttachmentList rows={session.attachments} onRemove={busy ? undefined : id => controller.edit({ attachments: session.attachments!.filter(a => a.id !== id) })} /><Text style={ui.note}>仅随本次发送；原附件不自动带入后续轮次。</Text></ScrollView>}
      {largeType?<View style={{gap:8}}>{messageInput}<View style={ui.between}>{attachmentAction}{sendAction}</View></View>:<View style={s.inputRow}>{attachmentAction}{messageInput}{sendAction}</View>}
      {!ready ? <Action secondary label="配置我的 API" onPress={onConnect} /> : !keyboardOpen && !largeType && <Text style={s.hint}>使用自己的 API · {session.draft.length}/2000</Text>}
    </View>
    <Modal visible={panel !== null} animationType="slide" onRequestClose={() => { if (deleteLock.current) return; if (panel === 'settings') void closeSettings(); else { toolRevision.current++; setPanel(null); } }}>
      <SafeAreaView style={s.modal}><View style={s.modalHead}><Text style={ui.heading}>{panel === 'sessions' ? '本机 AI 会话' : '对话人设与上下文'}</Text><Action secondary label="完成" disabled={deleting} onPress={() => { if (deleteLock.current) return; if (panel === 'settings') void closeSettings(); else { toolRevision.current++; setPanel(null); } }} /></View>
      {deleting && <Text accessibilityLiveRegion="polite" style={[ui.note,{paddingHorizontal:20}]}>正在删除会话…</Text>}
      {!!error && <Text accessibilityRole="alert" style={[ui.note, { color: colors.danger, paddingHorizontal: 20 }]}>{error}</Text>}
      {panel === 'sessions' ? <><View style={{ paddingHorizontal: 20, gap: 8 }}><TextInput accessibilityLabel="搜索 AI 会话" placeholder="搜索标题、问题或回答…" placeholderTextColor={colors.muted} maxLength={200} value={query} onChangeText={value => { searchRevision.current++; setError(''); setQuery(value); }} style={ui.input} /><Text accessibilityLiveRegion="polite" style={ui.note}>{searching ? '正在搜索…' : `找到 ${sessions.length} 个会话`}</Text></View><FlatList data={sessions} extraData={[searching, loading]} keyExtractor={i => i.id} contentContainerStyle={s.modalContent} ListHeaderComponent={<><Text style={ui.note}>默认保存在本机，可纳入加密备份或主动开启加密同步。最多 50 个会话，每个 100 轮；不会自动删除旧内容。</Text><Action label="开始新对话" onPress={() => void switchTo()} /></>} ListEmptyComponent={<Text style={ui.note}>{searching ? '正在读取本机会话…' : query.trim() ? '没有匹配的会话，试试其他关键词。' : '还没有已保存的对话。'}</Text>} renderItem={({ item }) => <View style={ui.card}><Pressable accessibilityRole="button" accessibilityLabel={'继续对话：' + item.title} disabled={searching || loading} style={{ flex: 1, minHeight: 48, gap: 6 }} onPress={() => void switchTo(item.id)}><Text numberOfLines={2} style={ui.heading}>{item.title}</Text><Text style={ui.note}>{item.turnCount} 轮 · {new Date(item.updatedAt).toLocaleString()}</Text>{!!item.snippet && item.snippet !== item.title && <Text numberOfLines={3} style={ui.text}>{item.snippet}</Text>}</Pressable><View style={ui.row}><Action secondary label="重命名" accessibilityLabel={'重命名对话：' + item.title} disabled={loading || searching} onPress={() => void openTool('rename', item.id, 'sessions')} style={{ flex: 1, paddingHorizontal: 6 }} /><Action secondary label="导出" accessibilityLabel={'导出对话：' + item.title} disabled={loading || searching || !item.turnCount} onPress={() => void openTool('export', item.id, 'sessions')} style={{ flex: 1, paddingHorizontal: 6 }} /><Action secondary label="删除" accessibilityLabel={'删除对话：' + item.title} disabled={loading || searching} onPress={() => remove(item)} style={{ flex: 1, paddingHorizontal: 6 }} /></View></View>} /></> : <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.modalContent}>
        <Text style={ui.note}>仅影响当前会话及后续回答，不改变键盘的人设选择。重新生成保留最近 4 个成功回答，可对比和切换；使用自己的 API，供应商可能按用量计费；停止或失败保留原答案。</Text>
        <Text style={ui.heading}>AI 表达人设</Text><View style={s.chips}>{[{ id: '', name: '默认助手' }, ...(persona?.data.cards || [])].map(card => <Pressable accessibilityRole="button" accessibilityLabel={'对话人设：' + card.name} accessibilityState={{ selected: session.personaId === card.id }} key={card.id} onPress={() => controller.edit({ personaId: card.id })} style={[ui.chip, session.personaId === card.id && ui.selected]}><Text style={session.personaId === card.id ? ui.selectedText : ui.label}>{card.name}</Text></Pressable>)}</View>
        {!!session.personaId && !persona?.data.cards.some(c => c.id === session.personaId) && <Text style={ui.note}>原人设已删除，本轮使用默认助手。可重新选择。</Text>}
        <Action secondary label="管理人设卡" onPress={() => { setPanel(null); onManagePersona(); }} />
        <View style={ui.between}><Text style={ui.heading}>携带最近对话</Text><Switch accessibilityLabel="携带对话上下文" value={session.useContext} onValueChange={useContext => controller.edit({ useContext })} /></View>
        <Text style={ui.note}>仅发送本会话最近 10 个完整轮次，连同本次输入最多 16000 字；更早消息仍留在本机。关闭后只发本次消息、人设和下方背景。</Text>
        <Text style={ui.label}>补充背景 · {session.background.length}/1000</Text><TextInput accessibilityLabel="AI 对话背景" multiline maxLength={1000} value={session.background} onChangeText={background => controller.edit({ background })} placeholder="例如：我想练习日常英语，请帮我纠正表达。" placeholderTextColor={colors.muted} style={[ui.input, { minHeight: 110 }]} />
        <Text style={ui.heading}>当前会话</Text><Text style={ui.text}>{session.title}</Text><View style={ui.row}><Action secondary label="重命名" style={{ flex: 1 }} onPress={() => void openTool('rename')} /><Action secondary label="导出记录" disabled={!session.turns.length} style={{ flex: 1 }} onPress={() => void openTool('export')} /></View>
        <Action secondary label="加密会话同步" onPress={() => { setError(''); void controller.flush().then(saved => { if (!saved) throw new Error('请先开启本机记录保存'); setPanel(null); setSyncOpen(true); }).catch(e => setError(displayError(e,'同步暂不可用'))); }} />
        <Action secondary label="查看会话分支" onPress={() => { setPanel(null); setLibrary('branches'); }} />
        <Action secondary label="重置对话上下文" onPress={reset} /><Text style={ui.note}>会清除补充背景并停止携带之前的消息，不删除本机记录。AI 内容可能有误，请核实重要信息；不要输入密码或验证码。</Text>
      </ScrollView>}
      </SafeAreaView>
    </Modal>
    {syncOpen && <SyncPanel onClose={() => setSyncOpen(false)} onUpdated={async () => { const original = controller.getSnapshot().session; try { const value = await getChat(original.id); controller.open(value, original); } catch (e) { throw new Error('云端已同步，请返回后重新读取会话：' + displayError(e,'读取失败')); } }} />}
    {library && <ChatLibrary session={session} turn={library === 'branches' ? undefined : library} onClose={() => setLibrary(null)} onOpen={id => switchTo(id)} onSelect={index => library !== 'branches' ? controller.selectVersion(library.id, index) : Promise.resolve()} />}
    {tool && <ChatTools key={tool.kind + tool.session.id} tool={tool} onClose={closeTool} onRename={rename} onEdit={question => {
      if (tool.kind !== 'edit') return;
      Keyboard.dismiss(); lastEdit.current = { sessionId: tool.session.id, turnId: tool.turnId, question };
      setTool(null); nearEnd.current = true;
      void controller.answerEdited(tool.turnId, question, chatPersona(persona, session.personaId));
    }} />}
  </View>;
}
function AttachmentList({ rows, onRemove }: { rows: Attachment[]; onRemove?: (id:string)=>void }) {
  return <View style={{gap:6}}>{rows.map(a=><View key={a.id} style={[ui.row,{paddingVertical:4}]}>{a.mime.startsWith('image/')&&<Image accessible accessibilityLabel={a.name} source={{uri:a.content}} style={{width:44,height:44,borderRadius:8}}/>}<Text numberOfLines={2} style={[ui.note,{flex:1}]}>{a.mime==='application/pdf'?'PDF · ':a.mime==='text/plain'?'文件 · ':''}{a.name}</Text>{onRemove&&<Action secondary label="移除" accessibilityLabel={'移除附件：'+a.name} style={{paddingHorizontal:8}} onPress={()=>onRemove(a.id)}/>}</View>)}</View>;
}
function ChatText({ text, query, answer = false }: { text: string; query: string; answer?: boolean }) {
  const parts = useMemo(() => chatHighlights(text, query), [text, query]);
  if (answer && !query.trim()) return <ChatMarkdown text={text} />;
  return <Text selectable style={answer ? s.answer : ui.text}>{parts.map((part, index) => <Text key={index} style={part.match ? s.highlight : undefined}>{part.text}</Text>)}</Text>;
}
const s = StyleSheet.create({
  root: { flex: 1, minHeight: 0 }, heading: { paddingHorizontal: 20, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, title: { fontSize: 22, lineHeight: 30, fontWeight: '800', color: colors.ink, flexShrink: 1 }, smallAction: { paddingHorizontal: 10 },
  settings: { marginHorizontal: 20, paddingHorizontal: 12, paddingVertical: 6, minHeight: 60, borderRadius: 14, backgroundColor: colors.soft, flexDirection: 'row', gap: 10, alignItems: 'center' }, banner: { ...ui.note, marginHorizontal: 20, paddingTop: 6 }, list: { flex: 1 }, timeline: { flex: 1, minHeight: 0 }, messages: { padding: 16, gap: 20, flexGrow: 1 }, find: { paddingHorizontal: 16, paddingTop: 8, gap: 4 }, highlight: { color: '#533E17', backgroundColor: '#FFF0B8' }, time: { fontSize: 11, lineHeight: 18, color: colors.muted }, jump: { position: 'absolute', right: 16, bottom: 8, minHeight: 48, minWidth: 80, paddingHorizontal: 14, borderRadius: 24, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, justifyContent: 'center', alignItems: 'center', elevation: 3 },
  userBubble: { marginLeft: 24, alignSelf: 'flex-end', maxWidth: '94%', padding: 14, gap: 6, backgroundColor: colors.soft, borderRadius: 18, borderTopRightRadius: 5 }, aiBubble: { marginRight: 16, padding: 16, gap: 10, backgroundColor: colors.surface, borderRadius: 18, borderTopLeftRadius: 5, borderWidth: 1, borderColor: colors.border }, answer: { fontSize: 16, lineHeight: 26, color: colors.ink }, divider: { ...ui.note, textAlign: 'center', paddingVertical: 8 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, paddingVertical: 16 }, spark: { width: 52, height: 52, borderRadius: 18, backgroundColor: colors.soft, alignItems: 'center', justifyContent: 'center' }, sparkText: { fontSize: 30, color: colors.primary },
  composer: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4, borderTopWidth: 1, borderColor: colors.border, gap: 8, backgroundColor: colors.background }, inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 }, input: { ...ui.input, flex: 1, minHeight: 52, maxHeight: 112 }, send: { maxWidth: 104, minHeight: 52, paddingHorizontal: 12 }, hint: { fontSize: 12, lineHeight: 20, color: colors.muted }, latest: { minWidth: 48, minHeight: 48, justifyContent: 'center', paddingHorizontal: 8 }, error: { backgroundColor: '#FCEEF1', padding: 10, borderRadius: 12, gap: 8 },
  modal: { flex: 1, backgroundColor: colors.background }, modalHead: { paddingHorizontal: 20, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, modalContent: { padding: 20, gap: 16, paddingBottom: 40 }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
