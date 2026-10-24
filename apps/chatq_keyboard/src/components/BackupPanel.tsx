import { displayError } from '../services/nativeError';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Text, TextInput, View } from 'react-native';
import { keyboardBridge } from '../../modules/chatq-keyboard';
import { migrateHistory } from '../services/storage';
import { loadTopicFavorites } from '../services/favorites';
import { ui, colors } from '../design';
import { Action, PageIntro } from './Ui';
type Preview={createdAt:number;records:number;chats?:number;settings:number};
export function BackupPanel() {
  const [password,setPassword]=useState(''), [confirm,setConfirm]=useState(''), [busy,setBusy]=useState(false), [message,setMessage]=useState(''), [preview,setPreview]=useState<Preview|null>(null);
  const alive=useRef(true), lock=useRef(false);
  useEffect(()=>()=>{alive.current=false; void keyboardBridge?.cancelBackup?.();},[]);
  async function run(kind:'export'|'inspect') {
    if(lock.current) return;
    if(password.length<8) {setMessage('请输入至少 8 位的备份密码。');return;}
    if(kind==='export' && password!==confirm) {setMessage('两次密码不一致，请检查。');return;}
    lock.current=true;setBusy(true);setMessage('');setPreview(null);
    try {
      await migrateHistory(); await loadTopicFavorites();
      if(kind==='export') {
        const result=await keyboardBridge!.exportBackup!(password);
        if(alive.current) {setMessage(result?'加密备份已保存，请妥善保管文件和密码。':'已取消保存，现有数据未修改。');if(result){setPassword('');setConfirm('');}}
      } else {
        const result=await keyboardBridge!.inspectBackup!(password);
        if(alive.current) { if(result) setPreview(JSON.parse(result)); else setMessage('已取消选择，现有数据未修改。'); }
      }
    } catch(e) { if(alive.current) setMessage(displayError(e,'文件操作失败，请重试。')); }
    finally { lock.current=false; if(alive.current) setBusy(false); }
  }
  function restore() {
    Alert.alert('合并这份备份？','保留现有记录；相同记录去重；AI 对话冲突时另存恢复副本，补充缺少的人设、收藏和词语。人设冲突时另存恢复副本，键盘设置保留现有选择。不会恢复连接码、设备身份或额度。',[{text:'取消',style:'cancel'},{text:'合并恢复',onPress:()=>{if(lock.current)return;lock.current=true;setBusy(true);void keyboardBridge!.applyBackup!().then(added=>{if(alive.current){setPreview(null);setPassword('');setConfirm('');setMessage('恢复完成，新增 '+added+' 条记录/会话。收藏、人设与词库已合并。');}}).catch(e=>{if(alive.current)setMessage(displayError(e,'恢复失败，现有数据已保留。'));}).finally(()=>{lock.current=false;if(alive.current)setBusy(false);});}}]);
  }
  return <><PageIntro title="重要的表达，安心留下" note="密码加密的本机备份，由你选择保存位置。" />
    <View style={ui.card}><Text style={ui.heading}>备份包含什么</Text><Text style={ui.text}>生成记录、AI 对话、人设与常用排序、关系目标、话题收藏、常用句、键盘偏好和本机常用词。</Text><Text style={ui.note}>不包含应用连接码、设备身份、供应商密钥、订阅与额度。不会上传服务器。卸载前请先导出，换机后重新连接服务。</Text></View>
    {!keyboardBridge?.exportBackup ? <Text style={ui.note}>文件备份目前在安卓应用中提供。</Text> : <View style={ui.card}>
      <Text style={ui.label}>备份密码</Text><TextInput accessibilityLabel="备份密码" value={password} onChangeText={v=>{setPassword(v);setPreview(null);void keyboardBridge?.discardBackup?.();}} editable={!busy} secureTextEntry maxLength={128} autoCapitalize="none" autoCorrect={false} placeholder="至少 8 位，恢复时需要" placeholderTextColor={colors.muted} style={ui.input}/>
      <Text style={ui.label}>再次输入密码（新建备份时）</Text><TextInput accessibilityLabel="确认备份密码" value={confirm} onChangeText={setConfirm} editable={!busy} secureTextEntry maxLength={128} autoCapitalize="none" autoCorrect={false} placeholder="再次输入以免误记" placeholderTextColor={colors.muted} style={ui.input}/>
      <Text style={ui.note}>使用 AES-256-GCM 加密。密码无法找回；请自行保管，切勿只保存在这台手机。</Text>
      <Action label={busy?'正在处理文件…':'导出加密备份'} loading={busy} disabled={busy} onPress={()=>void run('export')}/>
      <Action secondary label="选择备份并预览" disabled={busy} onPress={()=>void run('inspect')}/>
    </View>}
    {preview && <View style={ui.card}><Text style={ui.heading}>确认备份内容</Text><Text style={ui.text}>{new Date(preview.createdAt).toLocaleString()}</Text><Text style={ui.text}>{preview.records} 条记录 · {preview.chats || 0} 个对话 · {preview.settings} 类设置</Text><Text style={ui.note}>尚未写入任何数据。恢复采用合并方式，重复恢复不会增加相同记录。</Text><Action label="合并恢复到本机" disabled={busy} onPress={restore}/></View>}
    {!!message && <View style={ui.card}><Text accessibilityRole="alert" selectable style={ui.text}>{message}</Text></View>}
  </>;
}
