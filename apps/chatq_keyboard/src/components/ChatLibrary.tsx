import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, SafeAreaView, ScrollView, Text, View } from 'react-native';
import type { ChatSession, ChatTurn } from '../services/chat';
import { branchRows } from '../services/chatBranches';
import { getChat, listChats } from '../services/chatStore';
import { displayError } from '../services/nativeError';
import { colors, ui } from '../design';
import { Action, CopyAction } from './Ui';
import { ChatMarkdown } from './ChatMarkdown';
export function ChatLibrary({ session, turn, onClose, onOpen, onSelect }: { session:ChatSession; turn?:ChatTurn; onClose:()=>void; onOpen:(id:string)=>Promise<void>; onSelect:(index:number)=>Promise<void> }) {
  const [all,setAll]=useState<Array<Pick<ChatSession,'id'|'title'|'parent'>&{turnCount:number}>>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(!turn);
  useEffect(()=>{if(turn)return;let alive=true;void listChats().then(async rows=>{const summaries=[];for(const row of rows){if(!alive)return [];const value=await getChat(row.id);summaries.push({id:value.id,title:value.title,parent:value.parent,turnCount:value.turns.length});}return summaries;}).then(rows=>{if(alive)setAll(rows);}).catch(e=>{if(alive)setError(displayError(e,'分支读取失败'));}).finally(()=>{if(alive)setLoading(false);});return()=>{alive=false;};},[turn]);
  async function select(index:number){if(busy)return;setBusy(true);setError('');try{await onSelect(index);onClose();}catch(e){setError(displayError(e,'切换失败'));}finally{setBusy(false);}}
  return <Modal visible animationType="slide" onRequestClose={()=>{if(!busy)onClose();}}><SafeAreaView style={{flex:1,backgroundColor:colors.background}}>
    <View style={[ui.between,{padding:20}]}><Text style={ui.heading}>{turn?'回答版本与对比':'会话分支'}</Text><Action secondary label="返回" disabled={busy} onPress={onClose}/></View>
    <ScrollView contentContainerStyle={{padding:20,gap:16,paddingBottom:40}}>
      {!!error&&<Text accessibilityRole="alert" style={[ui.note,{color:colors.danger}]}>{error}</Text>}{loading&&<ActivityIndicator color={colors.primary}/>}
      {turn?<><Text style={ui.note}>保留最近 4 个成功回答。切换只改变本机会话和后续上下文，不请求 AI；失败或停止生成保留原版本。</Text><Text style={ui.label}>{turn.question}</Text>
        <View style={ui.card}><Text style={ui.selectedText}>当前使用 · {turn.personaName}</Text><ChatMarkdown text={turn.answer}/><CopyAction text={turn.answer} compact label="复制当前版本"/></View>
        {[...(turn.alternatives||[])].map((v,index)=><View key={index} style={ui.card}><Text style={ui.heading}>历史版本 {index+1} · {v.personaName}</Text><Text style={ui.note}>{new Date(v.at).toLocaleString()}</Text><ChatMarkdown text={v.answer}/><View style={ui.row}><CopyAction text={v.answer} compact label="复制此版本" style={{flex:1}}/><Action label="使用此版本" disabled={busy} style={{flex:1}} onPress={()=>void select(index)}/></View></View>)}
      </>:<><Text style={ui.note}>编辑历史问题会另开分支，原会话保留。原会话已删除时，分支仍可独立继续；选择一段会话即可打开。</Text>{branchRows(all).map(row=><View key={row.session.id} style={[ui.card,{marginLeft:row.depth*12}]}><Text style={row.session.id===session.id?ui.selectedText:ui.heading}>{row.depth?'↳ ':''}{row.session.title}</Text><Text style={ui.note}>{row.session.turnCount} 轮{row.detached?' · 原会话已不在本机':row.session.parent?' · 编辑分支':' · 原始会话'}</Text><Action secondary label={row.session.id===session.id?'返回当前会话':'打开会话'} disabled={busy} onPress={()=>{setBusy(true);void onOpen(row.session.id).then(onClose).catch(e=>setError(displayError(e,'切换失败'))).finally(()=>setBusy(false));}}/></View>)}{!loading&&!all.length&&<Text style={ui.note}>暂无已保存会话。</Text>}</>}
    </ScrollView></SafeAreaView></Modal>;
}
