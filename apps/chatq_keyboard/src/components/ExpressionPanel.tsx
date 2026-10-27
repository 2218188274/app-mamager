import React, { useEffect, useRef, useState } from 'react';
import { Alert, Image, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions, type ImageSourcePropType } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Clipboard from '@react-native-clipboard/clipboard';
import { keyboardBridge } from '../../modules/chatq-keyboard';
import { colors, ui } from '../design';
import { expressionGroups, findExpressions, type Expression } from '../services/expressions';
import { Action, EmptyState, NavIcon } from './Ui';
import { Choices } from './PersonaPanel';

type Sticker={id:string;label:string;source:ImageSourcePropType;custom?:boolean};
const stickers:Sticker[] = [
  { id: 'hello', label: '嗨，你好', source: require('../../modules/chatq-keyboard/android/src/main/assets/stickers/hello.png') },
  { id: 'hug', label: '给你抱抱', source: require('../../modules/chatq-keyboard/android/src/main/assets/stickers/hug.png') },
  { id: 'thanks', label: '谢谢你呀', source: require('../../modules/chatq-keyboard/android/src/main/assets/stickers/thanks.png') },
];
export function ExpressionPanel({ onSelect }: { onSelect?: (value: string) => void }) {
  const [kind, setKind] = useState('text'), [group, setGroup] = useState('all'), [query, setQuery] = useState('');
  const [notice, setNotice] = useState(''), [error, setError] = useState(''), [selected, setSelected] = useState<Sticker | null>(null), [sharing, setSharing] = useState(false);
  const [pictures,setPictures]=useState<Sticker[]>(stickers),[favorites,setFavorites]=useState<string[]>([]),[recent,setRecent]=useState<string[]>([]),[pictureFilter,setPictureFilter]=useState('all'),[editName,setEditName]=useState('');
  const { width, fontScale } = useWindowDimensions();
  const shareLock = useRef(false);
  const alive=useRef(true),pictureRevision=useRef(0);
  function accept(raw:string){const data=JSON.parse(raw);const rows:Sticker[]=data.items.map((p:{id:string;name:string;content?:string;custom:boolean})=>({id:p.id,label:p.name,custom:p.custom,source:p.content?{uri:p.content}:stickers.find(s=>s.id===p.id)?.source}));setPictures(rows);setFavorites(data.favorites);setRecent(data.recent);return rows;}
  async function refreshPictures(){const ticket=++pictureRevision.current;try{if(keyboardBridge?.getStickerLibrary){const raw=await keyboardBridge.getStickerLibrary();if(alive.current&&ticket===pictureRevision.current){accept(raw);setError('');}}}catch{if(alive.current&&ticket===pictureRevision.current)setError('自定义表情暂未读取成功，内置表情仍可使用。');}}
  useEffect(()=>{alive.current=true;void refreshPictures();return()=>{alive.current=false;pictureRevision.current++;};},[]);
  async function pictureAction(work:()=>Promise<string>){if(shareLock.current||!alive.current)return;shareLock.current=true;pictureRevision.current++;setSharing(true);setError('');try{const raw=await work();if(alive.current){const rows=accept(raw);setSelected(old=>old?rows.find(r=>r.id===old.id)||null:null);}}catch(e){if(alive.current)setError(e instanceof Error?e.message:'图片操作失败，请重试');}finally{shareLock.current=false;if(alive.current)setSharing(false);}}
  async function importPicture(){const native=keyboardBridge;if(!native?.pickChatAttachment||!native.importSticker)return;await pictureAction(async()=>{const raw=await native.pickChatAttachment!('sticker');if(!alive.current)throw new Error('已离开图片页，导入已取消');if(!raw)return native.getStickerLibrary!();const result=await native.importSticker!(raw);if(alive.current)setNotice('图片已导入，可在主应用和安卓键盘中使用；尚未分享。');return result;});}
  const shownPictures=pictureFilter==='all'?pictures:(pictureFilter==='favorites'?favorites:recent).map(id=>pictures.find(p=>p.id===id)).filter((p):p is Sticker=>!!p);
  const matches = findExpressions(query, group);
  function choose(item: Expression) { setError(''); if (onSelect) onSelect(item.text); else { Clipboard.setString(item.text); setNotice(`已复制${item.label}，回聊天窗口粘贴即可`); } }
  async function share() {
    if (!selected || shareLock.current) return;
    shareLock.current = true; setSharing(true); setError('');
    try { if (!keyboardBridge?.shareSticker) throw new Error('当前平台暂不支持图片分享'); await keyboardBridge.shareSticker(selected.id); }
    catch (e) { if(alive.current)setError(e instanceof Error ? e.message : '暂时无法分享，请重试'); }
    finally { shareLock.current = false; if(alive.current){setSharing(false);void refreshPictures();} }
  }
  return <>
    {!onSelect && <Choices wrap hideLabel label="表情类型" items={[{ id: 'text', name: 'Emoji · 颜文字' }, { id: 'stickers', name: '图片表情' }]} value={kind} onChange={id => { setKind(id); setNotice(''); setError(''); }} />}
    {kind === 'text' ? <>
      <View style={s.search}><NavIcon name="search" color={colors.muted} /><TextInput accessibilityLabel="搜索表情" value={query} onChangeText={text => { setQuery(text); setNotice(''); }} maxLength={40} placeholder="搜索开心、抱抱、谢谢…" placeholderTextColor={colors.muted} style={s.searchInput} />{!!query && <Pressable accessibilityRole="button" accessibilityLabel="清空表情搜索" onPress={() => { setQuery(''); setNotice(''); }} style={s.clear}><Text style={ui.selectedText}>清空</Text></Pressable>}</View>
      <Choices hideLabel label="表情分类" items={expressionGroups} value={group} onChange={id => { setGroup(id); setNotice(''); }} />
      <Text accessibilityLiveRegion="polite" style={[ui.note, { color: notice ? colors.success : colors.muted }]}>{notice || (onSelect ? '选一个加到回复末尾，不消耗 AI 额度' : '点一下复制 · 不消耗 AI 额度')}</Text>
      {!matches.length && <><EmptyState title="没找到这个表情" note="试试“开心”“抱抱”，或查看全部。" /><Action secondary label="查看全部表情" onPress={() => { setQuery(''); setGroup('all'); setNotice(''); }} /></>}
      <View style={s.grid}>{matches.map(item => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={(onSelect ? '添加表情：' : '复制表情：') + item.label} onPress={() => choose(item)} style={({ pressed }) => [s.expression, { width: item.group === 'kaomoji' && fontScale >= 1.3 ? '100%' : fontScale >= 1.3 || item.group === 'kaomoji' || width < 350 ? '48%' : '31%' }, pressed && { backgroundColor: colors.soft }]}><Text allowFontScaling={item.group === 'kaomoji'} style={{ fontSize: item.group === 'kaomoji' ? 18 : 30, color: colors.ink, textAlign: 'center' }}>{item.text}</Text><Text style={[ui.note, { textAlign: 'center' }]}>{item.label}</Text></Pressable>)}</View>
    </> : <>
      <View style={s.pack}><View style={{ flex: 1, gap: 6 }}><Text accessibilityRole="header" style={ui.heading}>软软云 · 日常陪伴</Text><Text style={ui.note}>聊商原创 · 3 张静态表情</Text></View><Image accessible={false} source={stickers[0].source} style={{ width: 68, height: 68 }} /></View>
      <Text style={ui.note}>点开预览，再选择分享。由你在目标应用确认发送。</Text>
      {keyboardBridge?.importSticker&&<><Text style={ui.note}>导入图片 {pictures.filter(p=>p.custom).length}/20 · 仅本机，纳入加密备份 · 每张自动缩放至128KB以内</Text><Action secondary label="导入我的图片表情" disabled={sharing||pictures.filter(p=>p.custom).length>=20} onPress={()=>void importPicture()}/><Choices wrap hideLabel label="图片表情范围" items={[{id:'all',name:'全部图片'},{id:'favorites',name:'收藏图片'},{id:'recent',name:'最近图片'}]} value={pictureFilter} onChange={setPictureFilter}/></>}
      {!!notice&&<Text style={[ui.note,{color:colors.success}]}>{notice}</Text>}{!!error&&!selected&&<Text accessibilityRole="alert" style={[ui.note,{color:colors.danger}]}>{error}</Text>}
      {!shownPictures.length&&<Text style={ui.note}>这里还没有图片，先导入、收藏或使用一张吧。</Text>}
      <View style={s.grid}>{shownPictures.map(item => <Pressable accessibilityRole="button" accessibilityLabel={'预览表情：' + item.label} key={item.id} onPress={() => { if (!shareLock.current) { setSelected(item);setEditName(item.label); setError(''); } }} style={[s.sticker, { width: '48%' }]}><Image accessible={false} source={item.source} style={s.stickerImage} resizeMode="contain" /><Text style={[ui.label, { textAlign: 'center' }]}>{item.label}{favorites.includes(item.id)?' ★':''}</Text></Pressable>)}</View>
    </>}
    <Modal visible={!!selected} transparent animationType="fade" onRequestClose={() => { if (!shareLock.current) setSelected(null); }}><SafeAreaView style={s.overlay}><ScrollView contentContainerStyle={s.previewScroll}><View style={s.preview}>{selected && <><Text accessibilityRole="header" style={ui.heading}>{selected.label}</Text><Image accessible={false} source={selected.source} style={{ width: '100%', height: fontScale >= 1.6 ? 120 : 180 }} resizeMode="contain" /><Text style={ui.note}>通过系统分享，自行选择应用和联系人。</Text>{!!error && <Text accessibilityRole="alert" style={{ ...ui.text, color: colors.danger }}>{error}</Text>}<Action icon="emoji" label={Platform.OS === 'android' ? '分享图片表情' : '图片分享暂支持安卓'} disabled={sharing || Platform.OS !== 'android'} loading={sharing} onPress={() => void share()} />{keyboardBridge?.updateSticker&&<><Action secondary label={favorites.includes(selected.id)?'取消图片收藏':'收藏此图片'} disabled={sharing} onPress={()=>void pictureAction(()=>keyboardBridge!.updateSticker!(selected.id,selected.label,!favorites.includes(selected.id)))}/>{selected.custom&&<><TextInput accessibilityLabel="图片表情名称" value={editName} onChangeText={setEditName} maxLength={20} editable={!sharing} style={ui.input}/><Action secondary label="保存图片名称" disabled={sharing||!editName.trim()} onPress={()=>void pictureAction(()=>keyboardBridge!.updateSticker!(selected.id,editName,favorites.includes(selected.id)))}/><Action secondary label="删除这张图片" disabled={sharing} onPress={()=>{const id=selected.id;Alert.alert('删除导入图片？','主应用和键盘会同时移除，本次不删除其他图片。加密备份中的旧副本保留。',[{text:'保留',style:'cancel'},{text:'删除',style:'destructive',onPress:()=>void pictureAction(()=>keyboardBridge!.removeSticker!(id))}]);}}/></>}</>}
<Action secondary label="关闭预览" disabled={sharing} onPress={() => { if (!shareLock.current) setSelected(null); }} /></>}</View></ScrollView></SafeAreaView></Modal>
  </>;
}
export function ExpressionPicker({ visible, onClose, onSelect }: { visible: boolean; onClose: () => void; onSelect: (text: string) => void }) {
  return <Modal visible={visible} animationType="slide" onRequestClose={onClose}><SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}><View style={[ui.row, { padding: 16 }]}><Text accessibilityRole="header" style={[ui.heading, { flex: 1 }]}>给回复加表情</Text><Action secondary label="返回" accessibilityLabel="返回回复" onPress={onClose} /></View><ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={{ padding: 16, gap: 12 }}><ExpressionPanel onSelect={onSelect} /></ScrollView></SafeAreaView></Modal>;
}
const s = StyleSheet.create({
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border }, searchInput: { flex: 1, minHeight: 52, color: colors.ink, fontSize: 15 },
  clear: { minWidth: 48, minHeight: 48, justifyContent: 'center', alignItems: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between' }, expression: { minHeight: 88, padding: 12, gap: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderRadius: 18 },
  pack: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 16, backgroundColor: colors.soft, borderRadius: 20 }, sticker: { padding: 14, alignItems: 'center', gap: 8, backgroundColor: colors.surface, borderRadius: 20 }, stickerImage: { width: '100%', height: 110 },
  overlay: { flex: 1, backgroundColor: '#221B3C99' }, previewScroll: { flexGrow: 1, justifyContent: 'center', padding: 20 }, preview: { ...ui.card, gap: 14 },
});
