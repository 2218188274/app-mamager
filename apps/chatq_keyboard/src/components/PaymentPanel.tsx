import React,{useEffect,useRef,useState} from 'react';
import { Alert,AppState,Linking,Modal,ScrollView,Text,View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getAccountSession,paymentRequest,type PaymentOrder,type AccountData } from '../services/api';
import { formatPlanPrice } from '../services/planPrice';
import { safeLink } from '../services/markdown';
import { displayError } from '../services/nativeError';
import { colors,ui } from '../design';
import { Action,CopyAction } from './Ui';
const states:Record<string,string>={pending:'待发起',creating:'等待网关确认',ready:'等待支付',unknown:'结果待确认',paid:'已到账',closed:'已关闭',refund_review:'退款待核对',entitlement_review:'权益待核对'};
const newRequestId=()=>`pay-${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
export function PaymentPanel({plan,onClose,onPaid,historyOnly=false}:{historyOnly?:boolean;plan:AccountData['plans'][number]|null;onClose:()=>void;onPaid:()=>Promise<void>}){
  const [rows,setRows]=useState<PaymentOrder[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[now,setNow]=useState(Date.now());
  const lock=useRef(false),alive=useRef(true),controller=useRef<AbortController|null>(null),requestId=useRef(newRequestId()),checkout=useRef<string|null>(null),returnPending=useRef(false),notified=useRef(new Set<string>());
  async function run(fn:()=>Promise<void>){
    if(lock.current||!alive.current)return;
    lock.current=true;controller.current=new AbortController();setBusy(true);setError('');
    try{await fn();}catch(e){if(alive.current)setError(displayError(e,'支付操作失败，请查询原订单'));}
    finally{lock.current=false;if(alive.current){setBusy(false);if(returnPending.current){returnPending.current=false;void run(syncReturn);}}}
  }
  async function refresh(){
    const result=await paymentRequest<PaymentOrder[]>('list',undefined,controller.current?.signal);
    if(!Array.isArray(result))throw new Error('订单列表格式异常');
    if(alive.current){setRows(result);setNow(Date.now());for(const order of result)if(order.status==='paid')await confirmed(order);}
  }
  async function confirmed(order:PaymentOrder){
    if(!alive.current)return;
    if(order.status==='refund_review')setNotice('退款结果已核对，请联系管理员核验退款金额与会员权益；不要重复付款。');
    if(order.status==='paid'&&!notified.current.has(order.id)){
      notified.current.add(order.id);
      try{if(!historyOnly)await onPaid();if(alive.current)setNotice(historyOnly?'历史订单已到账，当前免费模式无需购买会员。':'付款已确认，会员权益已刷新。可返回账号与会员查看。');}
      catch(e){notified.current.delete(order.id);if(alive.current)setNotice('付款已确认，会员同步暂未完成，请刷新列表重试。不要再次付款。');throw e;}
    }
    if(['paid','closed','refund_review','entitlement_review'].includes(order.status)&&checkout.current===order.id)checkout.current=null;
  }
  async function check(id:string,verifyReceipt=false){
    const order=await paymentRequest<PaymentOrder>('check',{id,...(verifyReceipt?{verifyReceipt:true}:{})},controller.current?.signal);
    if(!alive.current)return;
    await refresh();await confirmed(order);
    if(alive.current&&!['paid','closed','refund_review','entitlement_review'].includes(order.status))setNotice('尚未确认付款。若已付款，请稍后查询原订单，避免再次付款。');
  }
  async function syncReturn(){
    if(checkout.current)await check(checkout.current);else await refresh();
  }
  useEffect(()=>{
    alive.current=true;void run(refresh);
    const listener=AppState.addEventListener('change',state=>{
      if(state==='active'){
        setNow(Date.now());
        if(lock.current)returnPending.current=true;else void run(syncReturn);
      }
    });
    const timer=setInterval(()=>{if(alive.current)setNow(Date.now());},30000);
    return()=>{alive.current=false;returnPending.current=false;controller.current?.abort();clearInterval(timer);listener.remove();};
  },[]);
  function open(order:PaymentOrder){
    if(!alive.current||lock.current||historyOnly)return;
    if(Date.parse(order.expiresAt)<=Date.now()){setError('支付入口已过期，请先查询原订单确认结果');return;}
    const link=order.checkoutUrl&&safeLink(order.checkoutUrl);
    if(!link||!link.startsWith('https://')){setError('收银台地址无效，请查询原订单后联系管理员');return;}
    Alert.alert('前往支付收银台？',`${order.name}\n${formatPlanPrice(order.amount,order.currency)}\n${new URL(link).origin}\n返回后会自动查询到账。请以原订单查询结果为准。`,[
      {text:'取消',style:'cancel'},
      {text:'前往支付',onPress:()=>{
        if(!alive.current||lock.current||historyOnly)return;
        if(Date.parse(order.expiresAt)<=Date.now()){setError('支付入口已过期，请先查询原订单');return;}
        checkout.current=order.id;
        void Linking.openURL(link).catch(()=>{if(alive.current){checkout.current=null;setError('无法打开收银台，请稍后重试');}});
      }},
    ]);
  }
  function create(){
    if(!alive.current||lock.current||!plan||historyOnly)return;
    if(!getAccountSession()){setError('请先返回账号与会员，注册或登录后购买');return;}
    Alert.alert('确认创建订单？',`${plan.name} · ${formatPlanPrice(plan.priceCents,plan.currency)}\n购买 ${plan.durationDays} 天，不自动续费。创建后还需主动前往收银台付款。`,[
      {text:'取消',style:'cancel'},
      {text:'创建订单',onPress:()=>void run(async()=>{
        const order=await paymentRequest<PaymentOrder>('create',{planId:plan.id,requestId:requestId.current},controller.current?.signal);
        if(!alive.current)return;
        if(['paid','closed'].includes(order.status))requestId.current=newRequestId();
        await refresh();await confirmed(order);
        if(alive.current&&order.status==='closed')setNotice('原订单已关闭，未重复扣款。如需购买，可重新创建订单。');
      })},
    ]);
  }
  return <Modal visible animationType="slide" onRequestClose={()=>{if(!lock.current)onClose();}}>
    <SafeAreaView style={{flex:1,backgroundColor:colors.background}}>
      <View style={[ui.between,{paddingHorizontal:16,paddingVertical:12,borderBottomWidth:1,borderColor:colors.border}]}>
        <Text accessibilityRole="header" style={[ui.heading,{flexShrink:1}]}>{historyOnly?'历史订单':'套餐与订单'}</Text>
        <Action secondary label="返回" disabled={busy} onPress={onClose}/>
      </View>
      <ScrollView contentContainerStyle={{padding:16,gap:16,paddingBottom:40}}>
        {!!error&&<Text accessibilityRole="alert" style={[ui.text,{color:colors.danger}]}>{error}</Text>}
        {!!notice&&<Text accessibilityLiveRegion="polite" style={[ui.text,{color:colors.success}]}>{notice}</Text>}
        {!historyOnly&&plan&&<View style={ui.card}>
          <Text style={ui.heading}>{plan.name}</Text>
          <Text style={ui.title}>{formatPlanPrice(plan.priceCents,plan.currency)}</Text>
          <Text style={ui.text}>{plan.durationDays} 天 · 不自动续费</Text>
          <Text style={ui.note}>权益绑定登录账号，换手机后可继续使用。续购同档套餐顺延有效期。</Text>
          {!getAccountSession()&&<Text style={[ui.text,{color:colors.primary}]}>请先返回注册或登录账号，再购买会员。</Text>}
          <Action label={getAccountSession()?'确认套餐并创建订单':'请先登录后购买'} disabled={busy||!getAccountSession()} loading={busy} onPress={create}/>
        </View>}
        <View style={ui.between}><Text style={ui.heading}>我的订单</Text><Action secondary label="刷新列表" disabled={busy} onPress={()=>void run(syncReturn)}/></View>
        <Text style={ui.note}>最近 20 笔订单。支付结果待确认时，先查询原订单；退款及争议请复制订单号联系管理员。</Text>
        {!busy&&!rows.length&&<View style={ui.card}><Text style={ui.heading}>暂无订单</Text><Text style={ui.note}>{historyOnly?'当前免费模式无需购买会员，已有订单会保留在这里。':'购买会员后，可在这里查看支付结果和到账时间。'}</Text></View>}
        {rows.map(order=>{
          const expired=Date.parse(order.expiresAt)<=now,terminal=['paid','closed','refund_review','entitlement_review'].includes(order.status);
          return <View key={order.id} style={ui.card}>
            <View style={ui.between}><Text style={[ui.heading,{flexShrink:1}]}>{order.name}</Text><Text style={[ui.label,{color:order.status==='paid'?colors.success:colors.primary}]}>{states[order.status]||'待核对'}</Text></View>
            <Text style={[ui.title,{fontSize:23,lineHeight:32}]}>{formatPlanPrice(order.amount,order.currency)}</Text>
            <Text style={ui.note}>创建于 {new Date(order.createdAt).toLocaleString()}</Text>
            <CopyAction compact label="复制订单号" text={order.orderNo||order.id}/>
            {order.status==='paid'&&<Text style={[ui.text,{color:colors.success}]}>已到账{order.paidAt?' · '+new Date(order.paidAt).toLocaleString():''}</Text>}
            {order.status==='paid'&&<Action secondary label="核对到账与退款" disabled={busy} onPress={()=>void run(()=>check(order.id,true))}/>}
            {order.status==='closed'&&<Text style={ui.note}>此订单已关闭，无需付款。</Text>}
            {order.status==='entitlement_review'&&<Text style={[ui.text,{color:colors.danger}]}>付款已确认，当前会员权益已发生变化。请联系管理员核对，原有权益保留。</Text>}
            {order.status==='refund_review'&&<Text style={[ui.text,{color:colors.danger}]}>网关提示退款，请联系管理员核对退款金额和会员权益。</Text>}
            {!terminal&&<>
              <Text style={ui.note}>{expired?'支付入口已过期，仍需查询原订单确认是否已付款。':'支付截止：'+new Date(order.expiresAt).toLocaleString()}</Text>
              {!historyOnly&&order.status==='ready'&&order.checkoutUrl&&!expired&&<Action label="打开支付收银台" disabled={busy} onPress={()=>open(order)}/>}
              <Action secondary label="查询原订单并确认到账" disabled={busy} onPress={()=>void run(()=>check(order.id))}/>
            </>}
          </View>;
        })}
      </ScrollView>
    </SafeAreaView>
  </Modal>;
}
