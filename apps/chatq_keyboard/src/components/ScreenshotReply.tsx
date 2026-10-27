import React, { useEffect, useRef, useState } from 'react';
import { AppState, Image, Modal, Pressable, ScrollView, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Attachment } from '../services/chat';
import type { ScreenshotSide } from '../services/screenshotReply';
import { Action } from './Ui';
import { colors, ui } from '../design';
import { ScreenshotEditor } from './ScreenshotEditor';
import { personalAiRequest } from '../services/personalAi';
import { displayError } from '../services/nativeError';
export function ScreenshotReply({ image, side, busy, onPick, onRemove, onSide, onImage, onUseText, onWorking }: { image: Attachment | null; side: ScreenshotSide; busy: boolean; onPick: () => void; onRemove: () => void; onSide: (side: ScreenshotSide) => void; onImage: (image: Attachment) => void; onUseText: (text: string) => void; onWorking: (busy: boolean) => void }) {
  const [preview, setPreview] = useState(false), [ratio, setRatio] = useState(2);
  const [editing,setEditing]=useState(false),[text,setText]=useState(''),[error,setError]=useState(''),[extracting,setExtracting]=useState(false),[recognized,setRecognized]=useState(false);
  const task=useRef<AbortController|null>(null),alive=useRef(true),current=useRef('');current.current=(image?.id||'')+side;
  useEffect(()=>{setText('');setRecognized(false);setError('');task.current?.abort();},[image?.id,side]);
  useEffect(()=>{alive.current=true;const sub=AppState.addEventListener('change',s=>{if(s!=='active')task.current?.abort();});return()=>{alive.current=false;task.current?.abort();onWorking(false);sub.remove();};},[]);
  async function extract(){if(!image||busy||task.current)return;const controller=new AbortController(),key=current.current;task.current=controller;setExtracting(true);onWorking(true);setError('');try{const result=await personalAiRequest<{reply:string}>('extract',{image,side},controller.signal);if(alive.current&&!controller.signal.aborted&&key===current.current){if(typeof result.reply!=='string'||!result.reply.trim()||result.reply.length>6000)throw Error('识别内容无效或过长，请缩小截图范围');setText(result.reply.trim());setRecognized(true);}}catch(e){if(alive.current)setError(controller.signal.aborted?'已停止识别，截图保留。':displayError(e,'识别失败，请重试'));}finally{if(task.current===controller)task.current=null;if(alive.current){setExtracting(false);onWorking(false);}}}
  const { width, fontScale } = useWindowDimensions();
  return <View style={{ gap: 10 }}><Action secondary label={image ? '重新选择截图' : '选择聊天截图'} disabled={busy} onPress={onPick} />
    {image && <><Pressable accessibilityRole="button" accessibilityLabel="放大预览截图" onPress={() => setPreview(true)} style={{ borderRadius: 12, overflow: 'hidden', backgroundColor: colors.background }}><Image source={{ uri: image.content }} resizeMode="contain" onLoad={event => { const { width, height } = event.nativeEvent.source; if (width > 0 && height > 0) setRatio(height / width); }} style={{ width: '100%', height: fontScale >= 1.5 ? 130 : 180 }} /><Text style={[ui.note, { textAlign: 'center', padding: 8 }]}>点开检查截图内容</Text></Pressable>
    <Text style={ui.label}>要回复的对方在哪一侧？</Text><View style={[ui.row, { flexWrap: 'wrap' }]}>{(['left','right'] as const).map(value => <Action key={value} label={value === 'left' ? '对方在左侧' : '对方在右侧'} secondary={value !== side} disabled={busy} onPress={() => onSide(value)} />)}</View>
    <Text style={ui.note}>裁剪与遮挡在本机完成。只有点击识别或生成才发送当前图片给你的 API，需要支持图片理解的模型。</Text>
    <Action secondary label="裁剪与遮挡" disabled={busy} onPress={()=>{setEditing(true);onWorking(true);}}/>
    <Action secondary label={extracting?'停止识别':'识别文字后确认（使用 API）'} disabled={!extracting&&busy} onPress={()=>extracting?task.current?.abort():void extract()}/>
    {recognized&&<View style={[ui.card,{marginVertical:0}]}><Text style={ui.heading}>核对识别文字</Text><Text style={ui.note}>识别可能有错，请核对说话者并修改。确认后仅使用这段文字，截图将移除；按草稿设置在本机保存。</Text><TextInput accessibilityLabel="截图识别文字" multiline value={text} onChangeText={setText} editable={!busy} maxLength={6000} style={[ui.input,{minHeight:160}]} /><Text style={ui.note}>{text.length}/1000 字{ text.length>1000?'，请保留相关对话后确认':''}</Text><Action label="确认文字，返回回复" disabled={busy||!text.trim()||text.length>1000} onPress={()=>onUseText(text.trim())}/></View>}
    {!!error&&<Text accessibilityRole="alert" style={[ui.text,{color:colors.danger}]}>{error}</Text>}<Action secondary label="移除截图" disabled={busy} onPress={onRemove} /></>}
    {editing&&image&&<ScreenshotEditor image={image} onClose={()=>{setEditing(false);onWorking(false);}} onApply={value=>{onImage(value);setEditing(false);onWorking(false);}}/>}
    <Modal visible={preview && !!image} animationType="slide" onRequestClose={() => setPreview(false)}><SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}><View style={[ui.between, { padding: 16 }]}><Text style={ui.heading}>检查截图</Text><Action secondary label="返回编辑" onPress={() => setPreview(false)} /></View><ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}><Text style={ui.note}>不合适就返回重选。预览不会调用 AI。</Text>{image && <Image source={{ uri: image.content }} resizeMode="contain" style={{ width: Math.max(200, width - 32), height: Math.max(180, (width - 32) * ratio) }} />}</ScrollView></SafeAreaView></Modal>
  </View>;
}
