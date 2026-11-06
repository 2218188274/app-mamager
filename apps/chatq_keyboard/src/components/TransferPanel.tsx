import React,{useEffect,useRef,useState} from 'react';
import {Alert,Text,TextInput,View} from 'react-native';
import {keyboardBridge} from '../../modules/chatq-keyboard';
import {ui,colors} from '../design';
import {Action} from './Ui';
import {displayError} from '../services/nativeError';

type Preview={source:'windows'|'android';createdAt:number;added:number;duplicate:number;conflict:number};
export function TransferPanel(){
  const [password,setPassword]=useState(''),[repeat,setRepeat]=useState(''),[busy,setBusy]=useState(false),[preview,setPreview]=useState<Preview|null>(null),[message,setMessage]=useState('');const alive=useRef(true),lock=useRef(false);
  const [expanded,setExpanded]=useState(false),[details,setDetails]=useState(false);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;void keyboardBridge?.discardTransfer?.().catch(()=>{});};},[]);
  function invalidate(value:string){setPassword(value);setPreview(null);void keyboardBridge?.discardTransfer?.().catch(()=>{});}
  async function run(kind:'export'|'inspect'|'apply'|'undo'){
    if(lock.current||!alive.current)return;if((kind==='export'||kind==='inspect')&&password.length<8){setMessage('迁移密码至少8个字符。');return;}if(kind==='export'&&password!==repeat){setMessage('两次密码不一致。');return;}
    lock.current=true;setBusy(true);setMessage('');
    try{
      if(kind==='export'){setPreview(null);const saved=await keyboardBridge!.exportTransfer!(password);if(alive.current){setMessage(saved?'跨端文件已加密保存，可在Windows或安卓手动导入。':'已取消保存。');if(saved){setPassword('');setRepeat('');}}}
      else if(kind==='inspect'){setPreview(null);const raw=await keyboardBridge!.inspectTransfer!(password);if(alive.current){if(raw)setPreview(JSON.parse(raw));else setMessage('已取消选择。');}}
      else if(kind==='apply'){const count=await keyboardBridge!.applyTransfer!();if(alive.current){setPreview(null);setPassword('');setRepeat('');setMessage(`合并完成，新增${count}项。已有冲突内容保留，可撤销本次新增。`);}}
      else{await keyboardBridge!.undoTransfer!();if(alive.current){setPreview(null);setMessage('已撤销上次跨端新增；原数据保留。');}}
    }catch(e){if(alive.current){setMessage(displayError(e,'迁移失败，原数据已保留。'));if(kind==='apply')setPreview(null);}}
    finally{lock.current=false;if(alive.current)setBusy(false);}
  }
  if(!keyboardBridge?.exportTransfer)return null;
  return <View style={ui.card}><Text style={ui.heading}>Windows / 安卓资料互通</Text><Text style={ui.text}>密码保护的跨端文件。先预览，再合并；相同内容去重，冲突保留本机。</Text>
    <Action secondary label={expanded?'收起跨端迁移':'展开跨端迁移'} disabled={busy} onPress={()=>{if(expanded){setPreview(null);setPassword('');setRepeat('');void keyboardBridge?.discardTransfer?.().catch(()=>{});}setExpanded(!expanded);}}/>
    {expanded&&<><Text style={ui.note}>互通人设文本、常用句及AI对话主线；API和自动回复账号不迁移。它不代替完整备份。</Text><Action secondary label={details?'收起范围说明':'查看迁移范围与容量'} disabled={busy} onPress={()=>setDetails(!details)}/>{details&&<Text style={ui.note}>支持人设名称/指令/示例、常用句文字和AI对话主线。最多20个人设（指令300字）、100句收藏、50个会话，每个50轮、标题40字，总计6MiB。接收端的人设标签与长度采用默认值。其他偏好、背景、分支、附件、草稿、图片表情、聊天资料库和API密钥不迁移，原设备内容保留。</Text>}
    <Text style={ui.label}>迁移密码</Text><TextInput accessibilityLabel="跨端迁移密码" value={password} onChangeText={invalidate} editable={!busy} secureTextEntry autoCapitalize="none" autoCorrect={false} maxLength={128} placeholder="8–128个字符" placeholderTextColor={colors.muted} style={ui.input}/>
    <Text style={ui.label}>再次输入密码（导出时）</Text><TextInput accessibilityLabel="确认迁移密码" value={repeat} onChangeText={setRepeat} editable={!busy} secureTextEntry autoCapitalize="none" autoCorrect={false} maxLength={128} placeholder="再次输入密码" placeholderTextColor={colors.muted} style={ui.input}/>
    <Action label="导出给另一端" disabled={busy} loading={busy} onPress={()=>Alert.alert('导出跨端文字资料？','请核对上方范围。此文件不代替完整备份；不包含API和自动回复账号。',[{text:'取消',style:'cancel'},{text:'加密导出',onPress:()=>void run('export')}])}/>
    <Action secondary label="选择跨端文件并预览" disabled={busy} onPress={()=>void run('inspect')}/>
    {preview&&<><Text style={ui.text}>来自{preview.source==='windows'?'Windows':'安卓'} · {new Date(preview.createdAt).toLocaleString()}</Text><Text style={ui.text}>新增{preview.added} · 重复{preview.duplicate} · 冲突{preview.conflict}（保留本机），尚未写入。</Text><Action label="确认合并到本机" disabled={busy} onPress={()=>Alert.alert('合并这份跨端资料？','只新增，保留本机冲突。预览后本机变化时会停止；不会开始AI或自动回复。',[{text:'取消',style:'cancel'},{text:'确认合并',onPress:()=>void run('apply')}])}/></>}
    <Action secondary label="撤销上次跨端导入" disabled={busy} onPress={()=>Alert.alert('撤销上次跨端新增？','只删除上次导入新增的内容。导入后资料有修改时会停止并保留现有内容。',[{text:'取消',style:'cancel'},{text:'撤销新增',onPress:()=>void run('undo')}])}/>
    {!!message&&<Text accessibilityRole="alert" selectable style={ui.text}>{message}</Text>}
    </>}
  </View>;
}
