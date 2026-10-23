import { formatPlanPrice } from '../services/planPrice';
import { displayError } from '../services/nativeError';
import React, { useEffect, useRef, useState } from 'react';
import { AppState, Text, View } from 'react-native';
import { getAccount, type AccountData } from '../services/api';
import { colors, ui } from '../design';
import { Action, PageIntro } from './Ui';

export function AccountPanel() {
  const [data,setData]=useState<AccountData|null>(null), [error,setError]=useState(''), [busy,setBusy]=useState(false);
  const alive=useRef(true), request=useRef<AbortController|null>(null);
  async function refresh() {
    request.current?.abort(); const controller=new AbortController(); request.current=controller; setBusy(true); setError('');
    try { const result=await getAccount(controller.signal); if(alive.current && request.current===controller) setData(result); }
    catch(e) { if(alive.current && !controller.signal.aborted) setError(displayError(e,'额度读取失败')); }
    finally { if(alive.current && request.current===controller) setBusy(false); }
  }
  useEffect(()=>{ alive.current=true; void refresh(); const listener=AppState.addEventListener('change',s=>{ if(s==='active') void refresh(); else request.current?.abort(); }); return()=>{alive.current=false; request.current?.abort();listener.remove();}; },[]);
  const q=data?.quota;
  return <><PageIntro title="每一次灵感，心中有数" note="查看本设备的真实额度和后台上架套餐。" />
    <View style={ui.card}><Text style={ui.heading}>{q?.isPro ? '专业版权益' : '每日免费额度'}</Text>
      <Text style={{fontSize:36,lineHeight:48,fontWeight:'700',color:colors.primary}}>{q ? q.remaining===null ? '不限次数' : q.remaining+' 次可用' : '—'}</Text>
      {q && <><Text style={ui.text}>今日已用 {q.used} 次{q.limit===null ? '' : ' / 共 '+q.limit+' 次'}</Text><Text style={ui.note}>回复、AI 话题与独立对话共用，成功生成计 1 次。每次最多 {Math.min(3,q.candidateLimit)} 条候选。</Text><Text style={ui.note}>下次重置：{new Date(q.resetsAt).toLocaleString()}（服务端按 UTC 日切）</Text>{!q.enabled && <Text style={[ui.note,{color:colors.danger}]}>后台暂未启用 AI，请联系管理员。</Text>}</>}
      {!!error && <Text accessibilityRole="alert" style={[ui.note,{color:colors.danger}]}>{error}{data ? ' · 以下为上次读取结果' : ''}</Text>}
      <Action secondary label={busy?'正在刷新…':'刷新额度'} loading={busy} disabled={busy} onPress={()=>void refresh()} />
    </View>
    {data && <View style={ui.card}><Text style={ui.heading}>当前订阅</Text><Text style={ui.text}>{data.subscription.tier==='free'?'免费版':data.subscription.tier} · {({active:'生效中',expired:'已到期',cancelled:'已取消',grace_period:'宽限期'} as Record<string,string>)[data.subscription.status] || data.subscription.status}</Text>{data.subscription.expiresAt && <Text style={ui.note}>到期时间：{new Date(data.subscription.expiresAt).toLocaleString()}</Text>}<Text style={ui.note}>额度与订阅绑定当前设备。恢复本机备份不会转移或增加额度。</Text></View>}
    <Text style={ui.heading}>可选套餐</Text>
    {data && !data.plans.length && <View style={ui.card}><Text style={ui.text}>后台暂未上架套餐</Text><Text style={ui.note}>免费额度仍可正常使用，管理员上架后可在这里查看。</Text></View>}
    {data?.plans.map(plan=><View key={plan.id} style={ui.card}><Text style={ui.heading}>{plan.name}</Text><Text style={{fontSize:28,lineHeight:38,fontWeight:'700',color:colors.primary}}>{formatPlanPrice(plan.priceCents, plan.currency)}<Text style={ui.note}> / {({monthly:'月',yearly:'年',weekly:'周',lifetime:'终身'} as Record<string,string>)[plan.billingPeriod] || plan.durationDays+'天'}</Text></Text>{!!plan.description && <Text style={ui.text}>{plan.description}</Text>}{plan.features?.map((f,i)=><Text key={i} style={ui.note}>✓ {f}</Text>)}</View>)}
    <Text style={ui.note}>当前内部测试版本尚未接入购买渠道。套餐以后台实际配置为准，此页不会扣款或开通订阅。离线话题和本地输入不消耗 AI 额度。</Text>
  </>;
}
