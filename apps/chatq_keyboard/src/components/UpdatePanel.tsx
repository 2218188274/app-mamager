import { displayError } from '../services/nativeError';
import React, { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { keyboardBridge } from '../../modules/chatq-keyboard';
import { loadConnection } from '../services/api';
import { version } from '../../package.json';
import { ui, colors } from '../design';
import { Action, PageIntro } from './Ui';
type Release={version:string;versionCode:number;sizeBytes:number;sha256:string;url:string;publishedAt:string;notes:string[]};
type Installed={version:string;versionCode:number};
export function UpdatePanel() {
  const [release,setRelease]=useState<Release|null>(null), [busy,setBusy]=useState(''), [message,setMessage]=useState(''), [verified,setVerified]=useState(false), [progress,setProgress]=useState(0);
  const [installed,setInstalled]=useState<Installed|null>(null);
  const alive=useRef(true), lock=useRef(false), base=useRef('');
  async function readInstalled() {
    if(!keyboardBridge?.getInstalledVersion)throw new Error('无法读取安装版本，请安装新版安卓包后重试。');
    const value=await keyboardBridge.getInstalledVersion();
    if(!Number.isSafeInteger(value.versionCode)||value.versionCode<1||!value.version)throw new Error('安装版本读取异常，请重试。');
    if(alive.current)setInstalled(value);
    return value;
  }
  useEffect(()=>{alive.current=true;void readInstalled().catch(e=>{if(alive.current)setMessage(displayError(e,'当前版本读取失败，请重试。'));});return()=>{alive.current=false;void keyboardBridge?.cancelUpdate?.().catch(()=>{});};},[]);
  useEffect(()=>{
    if(busy!=='download')return;
    let active=true,pending=false;
    const timer=setInterval(()=>{if(pending)return;pending=true;void keyboardBridge?.getUpdateProgress?.().then(p=>{if(active&&alive.current)setProgress(p);}).catch(()=>{/* The download promise reports terminal errors. */}).finally(()=>{pending=false;});},500);
    return()=>{active=false;clearInterval(timer);};
  },[busy]);
  async function check() {
    if(lock.current || !alive.current)return;lock.current=true;setBusy('check');setMessage('');setRelease(null);setVerified(false);
    try {const current=await readInstalled();if(!alive.current)return;base.current=(await loadConnection()).baseUrl;if(!alive.current)return;const next=JSON.parse(await keyboardBridge!.checkForUpdate!(base.current));if(alive.current){setRelease(next);setMessage(next.versionCode>current.versionCode?'发现新版本，可下载更新。':'当前已是最新版本。');}}
    catch(e){if(alive.current)setMessage(displayError(e,'暂时无法检查更新，请稍后重试。'));}
    finally{lock.current=false;if(alive.current)setBusy('');}
  }
  async function download() {
    if(lock.current || !release || !installed || release.versionCode<=installed.versionCode)return;lock.current=true;setBusy('download');setVerified(false);setProgress(0);setMessage('正在下载并校验安装包…');
    try {await keyboardBridge!.downloadUpdate!(JSON.stringify(release),base.current);if(alive.current){setVerified(true);setMessage('校验通过：文件完整，包名、版本与签名匹配。');}}
    catch(e){if(alive.current)setMessage(displayError(e,'下载失败，可手动重试。'));}
    finally{lock.current=false;if(alive.current)setBusy('');}
  }
  async function install() {
    if(lock.current)return;lock.current=true;setBusy('install');
    try {const result=await keyboardBridge!.installUpdate!();if(alive.current)setMessage(result==='permission'?'请允许聊商安装应用，返回后再点“打开系统安装”。':'已打开系统安装界面，请在系统界面确认。');}
    catch(e){if(alive.current){setVerified(false);setMessage(displayError(e,'无法打开安装，请重新下载。'));}}
    finally{lock.current=false;if(alive.current)setBusy('');}
  }
  return <><PageIntro title="每次更新，都更顺手" note="主动检查版本，保留你的数据与使用习惯。" />
    <View style={ui.card}><Text style={ui.heading}>当前版本</Text><Text style={{fontSize:32,lineHeight:44,fontWeight:'700',color:colors.primary}}>聊商 {installed?.version || version}</Text><Text style={ui.note}>{installed ? '安卓内部测试版 · 构建 '+installed.versionCode : '正在读取安装版本'}</Text><Text style={ui.note}>请覆盖安装以保留本机数据。卸载会清除记录和词库，更新前也可先导出备份。</Text>{keyboardBridge?.checkForUpdate ? <Action label={busy==='check'?'正在检查…':'检查新版本'} loading={busy==='check'} disabled={!!busy} onPress={()=>void check()}/> : <Text style={ui.note}>更新安装目前在安卓应用中提供。</Text>}</View>
    {release && <View style={ui.card}><Text style={ui.heading}>版本 {release.version}</Text><Text style={ui.note}>{new Date(release.publishedAt).toLocaleDateString()} · {(release.sizeBytes/1024/1024).toFixed(1)} MB</Text>{release.notes.map((note,i)=><Text key={i} style={ui.text}>· {note}</Text>)}<Text selectable style={ui.note}>SHA-256：{release.sha256}</Text>
      {installed && release.versionCode>installed.versionCode && !verified && <Action label={busy==='download'?'下载中 '+progress+'%':'下载并校验'} loading={busy==='download'} disabled={!!busy} onPress={()=>void download()}/>}
      {verified && <Action label="打开系统安装" disabled={!!busy} onPress={()=>void install()}/>}
      {busy==='download' && <Action secondary label="取消下载" onPress={()=>void keyboardBridge?.cancelUpdate?.().catch(e=>{if(alive.current)setMessage(displayError(e,'取消失败，请重试。'));})}/>}
    </View>}
    {!!message && <View style={ui.card}><Text accessibilityRole="alert" style={ui.text}>{message}</Text></View>}
    <Text style={ui.note}>仅主动下载才获取安装包，不会自动安装。官方更新地址使用 HTTPS；下载后校验文件完整性、包名、版本和现有应用签名。当前仍为内部测试签名，正式分发还需完成发布签名和真机验收。</Text>
  </>;
}
