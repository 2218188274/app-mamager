import { displayError } from '../services/nativeError';
import React, { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { keyboardBridge } from '../../modules/chatq-keyboard';
import { loadConnection } from '../services/api';
import { version } from '../../package.json';
import { ui, colors } from '../design';
import { Action, PageIntro } from './Ui';
type Release={version:string;versionCode:number;sizeBytes:number;sha256:string;url:string;publishedAt:string;notes:string[]};
const CURRENT=17;
export function UpdatePanel() {
  const [release,setRelease]=useState<Release|null>(null), [busy,setBusy]=useState(''), [message,setMessage]=useState(''), [verified,setVerified]=useState(false), [progress,setProgress]=useState(0);
  const alive=useRef(true), lock=useRef(false), base=useRef('');
  useEffect(()=>()=>{alive.current=false;void keyboardBridge?.cancelUpdate?.();},[]);
  useEffect(()=>{if(busy!=='download')return;const timer=setInterval(()=>{void keyboardBridge?.getUpdateProgress?.().then(p=>{if(alive.current)setProgress(p);});},500);return()=>clearInterval(timer);},[busy]);
  async function check() {
    if(lock.current)return;lock.current=true;setBusy('check');setMessage('');setRelease(null);setVerified(false);
    try {base.current=(await loadConnection()).baseUrl;const next=JSON.parse(await keyboardBridge!.checkForUpdate!(base.current));if(alive.current){setRelease(next);setMessage(next.versionCode>CURRENT?'发现新版本，可下载更新。':'当前已是最新版本。');}}
    catch(e){if(alive.current)setMessage(displayError(e,'暂时无法检查更新，请稍后重试。'));}
    finally{lock.current=false;if(alive.current)setBusy('');}
  }
  async function download() {
    if(lock.current || !release)return;lock.current=true;setBusy('download');setProgress(0);setMessage('正在下载并校验安装包…');
    try {await keyboardBridge!.downloadUpdate!(JSON.stringify(release),base.current);if(alive.current){setVerified(true);setMessage('校验通过：文件完整，包名、版本与签名匹配。');}}
    catch(e){if(alive.current)setMessage(displayError(e,'下载失败，可手动重试。'));}
    finally{lock.current=false;if(alive.current)setBusy('');}
  }
  async function install() {
    if(lock.current)return;lock.current=true;setBusy('install');
    try {const result=await keyboardBridge!.installUpdate!();if(alive.current)setMessage(result==='permission'?'请允许聊商安装应用，返回后再点“打开系统安装”。':'已打开系统安装界面，请在系统界面确认。');}
    catch(e){if(alive.current)setMessage(displayError(e,'无法打开安装，请重新下载。'));}
    finally{lock.current=false;if(alive.current)setBusy('');}
  }
  return <><PageIntro title="每次更新，都更顺手" note="主动检查版本，保留你的数据与使用习惯。" />
    <View style={ui.card}><Text style={ui.heading}>当前版本</Text><Text style={{fontSize:32,lineHeight:44,fontWeight:'700',color:colors.primary}}>聊商 {version}</Text><Text style={ui.note}>安卓内部测试版 · 构建 {CURRENT}</Text><Text style={ui.note}>请覆盖安装以保留本机数据。卸载会清除记录和词库，更新前也可先导出备份。</Text>{keyboardBridge?.checkForUpdate ? <Action label={busy==='check'?'正在检查…':'检查新版本'} loading={busy==='check'} disabled={!!busy} onPress={()=>void check()}/> : <Text style={ui.note}>更新安装目前在安卓应用中提供。</Text>}</View>
    {release && <View style={ui.card}><Text style={ui.heading}>版本 {release.version}</Text><Text style={ui.note}>{new Date(release.publishedAt).toLocaleDateString()} · {(release.sizeBytes/1024/1024).toFixed(1)} MB</Text>{release.notes.map((note,i)=><Text key={i} style={ui.text}>· {note}</Text>)}<Text selectable style={ui.note}>SHA-256：{release.sha256}</Text>
      {release.versionCode>CURRENT && !verified && <Action label={busy==='download'?'下载中 '+progress+'%':'下载并校验'} loading={busy==='download'} disabled={!!busy} onPress={()=>void download()}/>}
      {verified && <Action label="打开系统安装" disabled={!!busy} onPress={()=>void install()}/>}
      {busy==='download' && <Action secondary label="取消下载" onPress={()=>void keyboardBridge?.cancelUpdate?.()}/>}
    </View>}
    {!!message && <View style={ui.card}><Text accessibilityRole="alert" style={ui.text}>{message}</Text></View>}
    <Text style={ui.note}>仅主动下载才获取安装包，不会自动安装。当前 IP 使用 HTTP，下载后会同时校验现有应用的签名；正式上线仍需启用 HTTPS 与正式签名。</Text>
  </>;
}
