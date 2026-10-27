import React,{useRef,useState} from 'react';
import {Image,Modal,PanResponder,ScrollView,Text,View,useWindowDimensions} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import type {Attachment} from '../services/chat';
import {draggedRect,editScreenshot,fullImage,type ImageRect,type ScreenshotEdit} from '../services/screenshotEdit';
import {Action} from './Ui';
import {colors,ui} from '../design';
import {displayError} from '../services/nativeError';

export function ScreenshotEditor({image,onClose,onApply}:{image:Attachment;onClose:()=>void;onApply:(image:Attachment)=>void}) {
  const {width,height}=useWindowDimensions();const [ratio,setRatio]=useState(2),[mode,setMode]=useState<'crop'|'mask'>('crop');
  const [spec,setSpec]=useState<ScreenshotEdit>({crop:fullImage,masks:[]}),[pending,setPending]=useState<ImageRect|null>(null),[history,setHistory]=useState<ScreenshotEdit[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const locked=useRef(false),alive=useRef(true),start=useRef({x:0,y:0});
  const [drawing,setDrawing]=useState(false);
  React.useEffect(()=>()=>{alive.current=false;},[]);
  const frameHeight=Math.min(380,Math.max(180,height*.43));const w=Math.min(width-48,frameHeight/ratio),h=w*ratio;
  const state=useRef({spec,mode,w,h});state.current={spec,mode,w,h};
  const commit=(next:ScreenshotEdit)=>{setHistory(old=>[...old.slice(-24),state.current.spec]);setSpec(next);setError('');};
  const responder=useRef<ReturnType<typeof PanResponder.create>|null>(null);
  if(!responder.current)responder.current=PanResponder.create({onStartShouldSetPanResponder:()=>!locked.current,onMoveShouldSetPanResponder:()=>!locked.current,onStartShouldSetPanResponderCapture:()=>!locked.current,onMoveShouldSetPanResponderCapture:()=>!locked.current,onPanResponderTerminationRequest:()=>false,
    onPanResponderGrant:e=>{const {w,h}=state.current;start.current={x:e.nativeEvent.locationX/w,y:e.nativeEvent.locationY/h};setDrawing(true);setPending(null);},
    onPanResponderMove:(_,g)=>{const {w,h}=state.current;setPending(draggedRect(start.current,{x:start.current.x+g.dx/w,y:start.current.y+g.dy/h}));},
    onPanResponderRelease:(_,g)=>{setDrawing(false);const {w,h,mode,spec}=state.current;const r=draggedRect(start.current,{x:start.current.x+g.dx/w,y:start.current.y+g.dy/h});setPending(null);if(r.width*w<8||r.height*h<8){setError('请拖出稍大的矩形范围');return;}if(mode==='mask'&&spec.masks.length>=20){setError('最多20处遮挡，可撤销后重画');return;}commit(mode==='crop'?{...spec,crop:r}:{...spec,masks:[...spec.masks,r]});},onPanResponderTerminate:()=>{setPending(null);setDrawing(false);}});
  const box=(r:ImageRect)=>({position:'absolute' as const,left:r.x*w,top:r.y*h,width:r.width*w,height:r.height*h});
  async function apply(){if(locked.current)return;locked.current=true;setBusy(true);setError('');try{const result=await editScreenshot(image,spec);if(alive.current)onApply(result);}catch(e){if(alive.current)setError(displayError(e,'截图编辑失败，原图保留'));}finally{locked.current=false;if(alive.current)setBusy(false);}}
  return <Modal visible animationType="slide" onRequestClose={()=>{if(!busy)onClose();}}><SafeAreaView style={{flex:1,backgroundColor:colors.background}}><ScrollView scrollEnabled={!drawing} contentContainerStyle={{padding:16,gap:14}}><Text style={ui.title}>裁剪与遮挡</Text><Text style={ui.note}>仅在本机编辑，不调用 AI。先框出保留范围，再遮挡姓名、头像等隐私。</Text><View style={[ui.row,{flexWrap:'wrap'}]}><Action label="裁剪" secondary={mode!=='crop'} disabled={busy} onPress={()=>setMode('crop')}/><Action label="遮挡" secondary={mode!=='mask'} disabled={busy} onPress={()=>setMode('mask')}/></View><Text style={ui.label}>{mode==='crop'?'拖出要保留的范围（紫色框）':'拖出要遮挡的范围（黑色块），可多次添加'}</Text>
  <View style={{alignItems:'center',padding:8,backgroundColor:colors.soft,borderRadius:12}}><View {...responder.current.panHandlers} accessibilityLabel="截图框选画布" style={{width:w,height:h}}><Image source={{uri:image.content}} onLoad={e=>{const {width,height}=e.nativeEvent.source;if(width>0&&height>0)setRatio(height/width);}} style={{width:w,height:h}}/>{spec.masks.map((r,i)=><View pointerEvents="none" key={i} style={[box(r),{backgroundColor:'#000'}]}/>)}<View pointerEvents="none" style={[box(spec.crop),{borderWidth:3,borderColor:colors.primary}]}/>{pending&&<View pointerEvents="none" style={[box(pending),mode==='mask'?{backgroundColor:'#000'}:{borderWidth:3,borderColor:colors.primary}]}/>}</View></View>
  <Text style={ui.note}>保留约 {Math.round(spec.crop.width*100)}% 宽 × {Math.round(spec.crop.height*100)}% 高 · 已遮挡 {spec.masks.length} 处。应用后查看实际效果，不合适可重新选图。</Text><View style={[ui.row,{flexWrap:'wrap'}]}><Action secondary label="撤销上一步" disabled={busy||!history.length} onPress={()=>{setSpec(history[history.length-1]);setHistory(history.slice(0,-1));setError('');}}/><Action secondary label="重置编辑" disabled={busy} onPress={()=>commit({crop:fullImage,masks:[]})}/></View>{!!error&&<Text accessibilityRole="alert" style={[ui.text,{color:colors.danger}]}>{error}</Text>}
  <Action label={busy?'正在处理…':'应用编辑'} disabled={busy} onPress={()=>void apply()}/><Action secondary label="取消编辑" disabled={busy} onPress={onClose}/></ScrollView></SafeAreaView></Modal>;
}
