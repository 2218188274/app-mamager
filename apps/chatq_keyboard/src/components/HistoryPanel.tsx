import { keyboardBridge } from '../../modules/chatq-keyboard';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Switch, BackHandler, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import * as storage from '../services/storage';
import type { ChatMessage, Conversation } from '../types';
import { colors, ui } from '../design';
import { Action, CopyAction, EmptyState, PageIntro } from './Ui';

export function HistoryPanel() {
  const [enabled, setEnabled] = useState(true);
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const sequence = useRef(0);
  const alive = useRef(true);
  useEffect(() => {
    void keyboardBridge?.getHistoryEnabled?.().then(setEnabled);
    const listener=AppState.addEventListener('change',state=>{if(state==='active'){setSelected(null);setMessages([]);setRefresh(n=>n+1);void keyboardBridge?.getHistoryEnabled?.().then(setEnabled);}});
    return()=>listener.remove();
  },[]);
  useEffect(() => { alive.current = true; return () => { alive.current = false; sequence.current++; }; }, []);
  useEffect(() => { if (!selected) return; const back = BackHandler.addEventListener('hardwareBackPress', () => { setSelected(null); setMessages([]); return true; }); return () => back.remove(); }, [selected]);
  useEffect(() => {
    const id = ++sequence.current; setLoading(true); setError('');
    const timer = setTimeout(() => { void storage.searchConversations(query).then(rows => { if (id === sequence.current) setItems(rows); }).catch(e => { if (id === sequence.current) setError(e instanceof Error ? e.message : '读取失败'); }).finally(() => { if (id === sequence.current) setLoading(false); }); }, 180);
    return () => { clearTimeout(timer); sequence.current++; };
  }, [query, refresh]);
  async function open(item: Conversation) {
    const id = ++sequence.current; setLoading(true); setError('');
    try { const rows = await storage.getMessages(item.id); if (alive.current && id === sequence.current) { setMessages(rows); setSelected(item); } }
    catch { if (alive.current && id === sequence.current) setError('记录暂时无法打开，请重试。'); }
    finally { if (alive.current && id === sequence.current) setLoading(false); }
  }
  function remove() {
    if (!selected) return;
    const id = selected.id;
    Alert.alert('删除这条记录？', '这只会删除本机记录，不能撤销。', [{ text: '保留', style: 'cancel' }, { text: '删除', style: 'destructive', onPress: () => {
      void storage.deleteConversation(id).then(() => { if (alive.current) { setSelected(null); setMessages([]); setRefresh(n => n + 1); } }).catch(() => { if (alive.current) setError('删除失败，请重试。'); });
    } }]);
  }
  return <>
    <PageIntro title={selected ? '再看一遍，也能接着用' : '好回复，随时找得到'} note="主动生成成功后保存在本机；安卓键盘与主应用共用记录。" />
    {selected ? <>
      <Action secondary label="返回回复记录" onPress={() => { setSelected(null); setMessages([]); setError(''); }} />
      <Text style={ui.note}>{selected.source === 'keyboard' ? '键盘' : '主应用'} · {selected.kind === 'topic' ? 'AI 话题' : 'AI 回复'} · {new Date(selected.updatedAt).toLocaleString()}</Text>
      {messages.map(message => <View key={message.id} style={[ui.card, message.role === 'user' && s.opponent]}><Text style={ui.label}>{message.role === 'user' ? (selected.kind === 'topic' ? '话题背景' : '对方的消息') : '生成候选'}</Text><Text selectable style={ui.text}>{message.content}</Text>{message.role === 'assistant' && <CopyAction text={message.content} label="复制这条回复" />}</View>)}
      <Action secondary label="删除这条记录" onPress={remove} />
    </> : <>
      {keyboardBridge?.setHistoryEnabled && <View style={ui.card}><View style={ui.between}><Text style={ui.label}>保存生成记录</Text><Switch accessibilityLabel="保存生成记录" value={enabled} onValueChange={value=>void keyboardBridge!.setHistoryEnabled!(value).then(()=>setEnabled(value)).catch(()=>setError('保存设置失败'))}/></View><Text style={ui.note}>关闭后，两端的新生成及独立 AI 对话都不写入本机。现有记录保留；独立会话请到“对话 → 会话”管理。</Text><Action secondary label="清空回复与话题记录" onPress={()=>Alert.alert('清空回复与话题记录？','安卓键盘与主应用的回复/话题记录将一并删除，独立 AI 会话保留。不能撤销。',[{text:'保留',style:'cancel'},{text:'清空',style:'destructive',onPress:()=>void storage.clearHistory().then(()=>setRefresh(n=>n+1)).catch(()=>setError('清空失败，请重试'))}])}/></View>}
      <TextInput accessibilityLabel="搜索回复记录" value={query} onChangeText={setQuery} placeholder="搜索消息或回复中的关键词" placeholderTextColor={colors.muted} style={ui.input} clearButtonMode="while-editing" />
      {loading ? <ActivityIndicator accessibilityLabel="正在读取记录" color={colors.primary} /> : items.length ? <>
        <Text style={ui.note}>{query.trim() ? '搜索结果' : '最近记录'} · {items.length} 条{items.length === 100 ? '，可输入关键词继续查找' : ''}</Text>
        {items.map(item => <Pressable accessibilityRole="button" accessibilityLabel={'查看记录：' + item.title} key={item.id} disabled={loading} onPress={() => void open(item)} style={({ pressed }) => [ui.card, s.record, pressed && { backgroundColor: colors.soft }]}><View style={{ flex: 1, gap: 7 }}><Text numberOfLines={2} style={ui.heading}>{item.title}</Text><Text style={ui.note}>{item.source === 'keyboard' ? '键盘' : '主应用'} · {item.kind === 'topic' ? '话题' : '回复'} · {new Date(item.updatedAt).toLocaleString()}</Text></View><Text style={s.arrow}>›</Text></Pressable>)}
      </> : !error && <EmptyState title={query.trim() ? '还没找到这条记录' : '这里会留下你的好回复'} note={query.trim() ? '换一个关键词再找找。' : '在主应用或安卓键盘主动生成回复与话题后，可在这里回看与复制。'} />}
    </>}
    {!!error && <View style={ui.card}><Text accessibilityRole="alert" style={[ui.note, { color: colors.danger }]}>{error}</Text><Action secondary label="重新读取记录" onPress={() => setRefresh(n => n + 1)} /></View>}
  </>;
}
const s = StyleSheet.create({ opponent: { backgroundColor: '#ECEEF6' }, record: { flexDirection: 'row', alignItems: 'center', minHeight: 88 }, arrow: { color: colors.muted, fontSize: 28 } });
