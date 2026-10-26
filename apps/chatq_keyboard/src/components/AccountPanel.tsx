import { formatPlanPrice } from '../services/planPrice';
import { displayError } from '../services/nativeError';
import React, { useEffect, useRef, useState } from 'react';
import { AppState, Text, View } from 'react-native';
import { getAccount, getAccountIssue, resumeGuestConnection, type AccountData } from '../services/api';
import { colors, ui } from '../design';
import { Action, PageIntro } from './Ui';
import { LoginPanel } from './LoginPanel';
import { PaymentPanel } from './PaymentPanel';

const tiers: Record<string, string> = { free: '免费版', pro_monthly: '月度会员', pro_yearly: '年度会员' };
const statuses: Record<string, string> = { active: '生效中', expired: '已到期', cancelled: '已取消', grace_period: '宽限期' };
export function AccountPanel() {
  const [data, setData] = useState<AccountData | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [syncedAt, setSyncedAt] = useState<number | null>(null), [details, setDetails] = useState(false);
  const [orders, setOrders] = useState<false | AccountData['plans'][number] | null>(false);
  const alive = useRef(true), request = useRef<AbortController | null>(null);
  async function refresh(requireFresh = false) {
    if (!alive.current) { if (requireFresh) throw new Error('页面已关闭，请返回后刷新权益'); return; }
    request.current?.abort(); const controller = new AbortController(); request.current = controller; setBusy(true); setError('');
    try {
      await resumeGuestConnection();
      if (!alive.current || controller.signal.aborted) throw new Error('同步已取消，请重新刷新权益');
      const result = await getAccount(controller.signal);
      if (!alive.current || request.current !== controller || controller.signal.aborted) throw new Error('同步已取消，请重新刷新权益');
      setData(result); setSyncedAt(Date.now());
    } catch (e) {
      if (alive.current && request.current === controller && !controller.signal.aborted) {
        setError(displayError(e, '权益暂未同步，请检查网络后重试'));
        if (getAccountIssue()) { setData(null); setSyncedAt(null); }
      }
      if (requireFresh) throw e;
    } finally { if (alive.current && request.current === controller) setBusy(false); }
  }
  useEffect(() => {
    alive.current = true; void refresh();
    const listener = AppState.addEventListener('change', state => { if (state === 'active') void refresh(); else request.current?.abort(); });
    return () => { alive.current = false; request.current?.abort(); listener.remove(); };
  }, []);
  const q = data?.quota, sub = data?.subscription, stale = !!error && !!data;
  return <><PageIntro title="账号与会员" note="账号、权益、订单，一处管理。" />
    <LoginPanel onChanged={() => { setData(null); setSyncedAt(null); setOrders(false); void refresh(); }} />
    <View style={ui.card}>
      <Text style={ui.label}>{stale ? '上次状态 · 待同步' : busy ? '正在同步权益…' : syncedAt ? '已同步 · ' + new Date(syncedAt).toLocaleTimeString() : '我的权益'}</Text>
      <Text style={ui.heading}>{!q ? '正在读取账号权益' : q.isPro ? tiers[sub?.tier || ''] || '专业版权益' : sub?.status === 'expired' ? '会员已到期 · 使用免费额度' : '每日免费额度'}</Text>
      <Text style={{ fontSize: 32, lineHeight: 44, fontWeight: '700', color: stale ? colors.muted : colors.primary }}>{q ? q.remaining === null ? '不限次数' : q.remaining + ' 次可用' : '—'}</Text>
      {q && <><Text style={ui.text}>今日已用 {q.used} 次{q.limit === null ? '' : ' / 共 ' + q.limit + ' 次'}</Text>
        {sub && <Text style={ui.note}>{tiers[sub.tier] || '会员'} · {statuses[sub.status] || '状态待核对'}{sub.expiresAt ? '\n到期：' + new Date(sub.expiresAt).toLocaleString() : q.isPro ? ' · 长期有效' : ''}</Text>}
        <Text style={ui.note}>{data?.identity?.mode === 'account' ? '权益跟随当前账号，键盘与主应用共用。' : '设备权益可在注册时保留到账号。'}</Text>
        {!q.enabled && <Text style={[ui.note, { color: colors.danger }]}>后台暂未启用 AI，请联系管理员。</Text>}</>}
      {!!error && <Text accessibilityRole="alert" style={[ui.note, { color: colors.danger }]}>{error}{stale ? '。当前仅展示上次状态，暂不能购买。' : ''}</Text>}
      <Action secondary label={busy ? '正在刷新…' : '刷新额度'} accessibilityLabel={busy ? '正在刷新…' : '刷新额度'} loading={busy} disabled={busy} onPress={() => void refresh()} />
      <Action secondary label={details ? '收起权益说明' : '查看权益说明'} onPress={() => setDetails(!details)} />
      {details && <><Text style={ui.text}>免费版按每日额度使用；会员有效期内 AI 不限次数，每次最多 3 条候选。</Text><Text style={ui.note}>回复、AI 话题与独立对话共用额度，成功生成计 1 次。拼音、九宫格、离线话题和本地表情不消耗额度。</Text>{q && <Text style={ui.note}>下次重置：{new Date(q.resetsAt).toLocaleString()}（UTC 日切）</Text>}<Text style={ui.note}>不自动续费。人工开通及付款到账以服务器状态为准，恢复本机备份不会增加额度。</Text></>}
    </View>
    <Text style={ui.heading}>会员套餐</Text>
    {!!data?.paymentReadiness?.message && <Text style={ui.note}>{data.paymentReadiness.message}</Text>}
    {data && !data.plans.length && <View style={ui.card}><Text style={ui.heading}>会员购买暂未开放</Text><Text style={ui.note}>套餐尚未上架，免费功能继续可用。已有会员仍按当前权益使用。</Text></View>}
    {data?.plans.map(plan => <View key={plan.id} style={ui.card}>
      <Text style={ui.heading}>{plan.name}</Text><Text style={{ fontSize: 28, lineHeight: 38, fontWeight: '700', color: colors.primary }}>{formatPlanPrice(plan.priceCents, plan.currency)}</Text>
      <Text style={ui.note}>有效期 {plan.durationDays} 天 · 单次购买，不自动续费</Text>
      {!!plan.description && <Text style={ui.text}>{plan.description}</Text>}{plan.features?.map((f, i) => <Text key={i} style={ui.note}>✓ {f}</Text>)}
      <Action label={!data.purchaseAvailable ? '暂未开放购买' : data.identity?.mode !== 'account' ? '请先登录后购买' : '查看并购买套餐'} disabled={!data.purchaseAvailable || data.identity?.mode !== 'account' || busy || !!error || plan.currency?.toUpperCase() !== 'CNY' || plan.priceCents < 1} onPress={() => setOrders(plan)} />
    </View>)}
    <View style={ui.card}><Text style={ui.heading}>套餐订单</Text><Text style={ui.note}>付款结果不确定时，先查询原订单。订单与会员保留在账号中，不会因退出或重新登录丢失。</Text><Action secondary label="查看套餐订单" onPress={() => setOrders(null)} disabled={!data || !!getAccountIssue()} /></View>
    {orders !== false && <PaymentPanel plan={orders} onClose={() => setOrders(false)} onPaid={() => refresh(true)} />}
  </>;
}
