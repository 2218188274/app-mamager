import React, { useEffect, useRef, useState } from 'react';
import { Alert, AppState, Keyboard, Modal, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { clearPersonalAi, loadPersonalAi, personalAiRequest, personalAiModels, selectPersonalAiProfile, removePersonalAiProfile, savePersonalAi, type PersonalAiConfig } from '../services/personalAi';
import { displayError } from '../services/nativeError';
import { colors, ui } from '../design';
import { Action, PageIntro } from './Ui';

export function PersonalAiPanel({ onChanged }: { onChanged: (ready: boolean) => void }) {
  const [saved, setSaved] = useState<PersonalAiConfig | null>(null);
  const [baseUrl, setBaseUrl] = useState(''), [model, setModel] = useState(''), [apiKey, setApiKey] = useState('');
  const [stream, setStream] = useState(true), [busy, setBusy] = useState(false), [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [profileId,setProfileId]=useState<string|undefined>(undefined),[profileName,setProfileName]=useState('默认配置'),[creating,setCreating]=useState(false);
  const [models,setModels]=useState<string[]>([]),[modelPicker,setModelPicker]=useState(false),[filter,setFilter]=useState(''),[requestKind,setRequestKind]=useState('');
  const [modelLimit,setModelLimit]=useState(80);
  const alive = useRef(true), lock = useRef(false), request = useRef<AbortController | null>(null);
  function accept(value:PersonalAiConfig){setSaved(value);setBaseUrl(value.baseUrl);setModel(value.model);setStream(value.stream);setApiKey('');setProfileId(value.profileId);setProfileName(value.profileName||'默认配置');setCreating(false);setModels([]);onChanged(value.hasKey);}
  useEffect(() => {
    alive.current = true;
    void loadPersonalAi().then(value => { if (alive.current) accept(value); }).catch(e => { if (alive.current) setError(displayError(e, '无法读取 API 配置')); }).finally(() => { if (alive.current) setLoaded(true); });
    const listener = AppState.addEventListener('change', state => { if (state !== 'active') request.current?.abort(); });
    return () => { alive.current = false; request.current?.abort(); listener.remove(); };
  }, []);
  const dirty = creating || !saved || profileName.trim()!==(saved.profileName||'默认配置') || baseUrl.trim().replace(/\/+$/, '') !== saved.baseUrl || model.trim() !== saved.model || stream !== saved.stream || !!apiKey;
  async function run(action: () => Promise<void>) {
    if (lock.current || !alive.current) return; lock.current = true; setBusy(true); setError(''); setNotice('');
    try { await action(); } catch (e) { if (alive.current) setError(displayError(e, '操作失败，请重试')); }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  }
  async function save() {
    if (!apiKey.trim() && (creating || !saved?.hasKey)) throw new Error('请填写自己的 API 密钥');
    const value = await savePersonalAi({ baseUrl, model, apiKey, stream, profileId, profileName });
    if (alive.current) { accept(value); setNotice('已保存，主应用与安卓键盘共用；尚未发起 API 请求。'); Keyboard.dismiss(); }
  }
  async function test(kind='test') {
    const controller = new AbortController(); request.current = controller;
    setRequestKind(kind);
    try { if(kind==='models'){const list=await personalAiModels({baseUrl,model,apiKey,stream,profileId,profileName},controller.signal);if(alive.current&&!controller.signal.aborted){setModels(list);setFilter('');setModelLimit(80);setModelPicker(true);Keyboard.dismiss();}}else{await personalAiRequest(kind==='visionTest'?'visionTest':'test', {}, controller.signal); if (alive.current && !controller.signal.aborted) setNotice(kind==='visionTest'?'测试图片读取成功。此结果仅验证基础图片能力，实际截图仍需核对。':'连接成功，密钥和模型可以使用。');} }
    finally { if (request.current === controller) request.current = null;if(alive.current)setRequestKind(''); }
  }
  function discardThen(action:()=>void){if(dirty&&(!!saved?.hasKey||creating||!!apiKey||!!baseUrl||!!model))Alert.alert('放弃未保存的配置？','已保存的配置不会被修改。',[{text:'继续编辑',style:'cancel'},{text:'放弃修改',onPress:action}]);else action();}
  function switchProfile(id:string){discardThen(()=>void run(async()=>{const next=await selectPersonalAiProfile(id);if(alive.current){accept(next);setNotice('已切换配置，主应用和键盘立即共用；未发起 API 请求。');}}));}
  const field = (label: string, value: string, change: (text: string) => void, placeholder: string, secret = false) => <View style={{ gap: 6 }}><Text style={ui.label}>{label}</Text><TextInput accessibilityLabel={label} value={value} onChangeText={text => { change(text); setNotice(''); setError(''); }} placeholder={placeholder} placeholderTextColor={colors.muted} style={ui.input} autoCapitalize="none" autoCorrect={false} autoComplete="off" secureTextEntry={secret} editable={loaded && !busy} maxLength={secret ? 8192 : label === '配置名称' ? 30 : label === '模型名称' ? 200 : 2048} /></View>;
  const matchingModels=models.filter(id=>id.toLowerCase().includes(filter.trim().toLowerCase()));
  return <><PageIntro title="我的 API" note="填一次，主应用和安卓键盘都能用。" />
    <View style={[ui.card, { backgroundColor: colors.soft }]}><Text style={ui.heading}>聊商免费使用</Text><Text style={ui.text}>无需购买会员，也无需登录。AI 请求直接发往你配置的供应商；API 用量按供应商账户规则计费。</Text></View>
    <View style={ui.card}><Text style={ui.heading}>我的配置 · {saved?.profiles?.length||0}/8</Text><Text style={ui.note}>切换只更换本机配置，不会自动测试或生成。</Text>{saved?.profiles?.map(p=><Action key={p.id} secondary={p.id!==saved.profileId||creating} label={(p.id===saved.profileId?'当前 · ':'切换 · ')+p.name} disabled={busy||!loaded} onPress={()=>switchProfile(p.id)}/>)}<Action secondary label="新增 API 配置" disabled={busy||!loaded||(saved?.profiles?.length||0)>=8} onPress={()=>discardThen(()=>{setCreating(true);setProfileId('');setProfileName('新配置');setBaseUrl('');setModel('');setApiKey('');setStream(true);setModels([]);setNotice('填好后保存，即可作为当前配置。');setError('');})}/>{creating&&<Action secondary label="取消新增，返回当前配置" disabled={busy} onPress={()=>discardThen(()=>{if(saved)accept(saved);setNotice('');})}/>}</View>
    <View style={ui.card}><Text style={ui.heading}>{creating ? '新建 API 配置' : saved?.hasKey ? '已配置自己的 API' : '连接你的 AI'}</Text><Text style={ui.note}>支持 OpenAI 兼容的 Chat Completions 接口。地址和模型名称以供应商文档为准。</Text>
      {field('配置名称',profileName,setProfileName,'例如：日常聊天、图片识别')}
      {field('API 基础地址', baseUrl, setBaseUrl, 'https://供应商域名/v1')}
      <Text style={ui.note}>保留供应商要求的 /v1 等路径，不要填写 /chat/completions。</Text>
      {field('API 密钥', apiKey, setApiKey, saved?.hasKey&&!creating ? '已保存，留空保留密钥' : '粘贴你自己的 API Key', true)}
      {field('模型名称', model, setModel, '供应商提供的准确模型 ID')}
      <Action secondary label={requestKind==='models'?'停止获取模型':'获取模型列表'} disabled={!loaded||busy&&requestKind!=='models'||!baseUrl.trim()||!apiKey.trim()&&(creating||!saved?.hasKey)} onPress={()=>requestKind==='models'?request.current?.abort():void run(()=>test('models'))}/><Text style={ui.note}>主动请求供应商的 /models，不发聊天内容；不支持列表时可手动填写。</Text>
      <View style={ui.between}><View style={{ flex: 1 }}><Text style={ui.label}>流式回复</Text><Text style={ui.note}>边生成边显示；供应商不兼容时可关闭。</Text></View><Switch accessibilityLabel="流式回复" value={stream} disabled={!loaded || busy} onValueChange={value => { setStream(value); setNotice(''); }} /></View>
      <Text style={ui.note}>更换 API 地址时需重新输入密钥。密钥由本机系统加密保存，不上传聊商服务器，不随备份或会话同步导出。图片和 PDF 需供应商与模型支持。</Text>
      {!!error && <Text accessibilityRole="alert" style={[ui.text, { color: colors.danger }]}>{error}</Text>}
      {!!notice && <Text accessibilityLiveRegion="polite" style={[ui.text, { color: colors.success }]}>{notice}</Text>}
      <Action label={busy && !request.current ? '保存中…' : '保存配置'} disabled={!loaded || busy || !dirty} onPress={() => void run(save)} />
      <Action secondary label={requestKind==='test' ? '停止测试' : '测试连接（消耗少量 API 用量）'} disabled={!loaded || requestKind!=='test' && (busy || !saved?.hasKey || dirty)} onPress={() => requestKind==='test' ? request.current?.abort() : void run(()=>test())} />
      <Action secondary label={requestKind==='visionTest'?'停止图片测试':'测试图片能力（消耗 API 用量）'} disabled={!loaded||requestKind!=='visionTest'&&(busy||!saved?.hasKey||dirty)} onPress={()=>requestKind==='visionTest'?request.current?.abort():void run(()=>test('visionTest'))}/>
      {saved?.profileId&&!creating&&<Action secondary label="删除当前配置" disabled={busy} onPress={()=>Alert.alert('删除当前配置？','仅删除本机这套配置；如有其他配置，将切换到列表第一套。',[{text:'保留',style:'cancel'},{text:'删除',style:'destructive',onPress:()=>void run(async()=>{const next=await removePersonalAiProfile(saved.profileId!);if(alive.current){accept(next);setNotice('当前配置已删除。');}})}])}/>}
      {(saved?.hasKey||!!error)&&<Action secondary label="清除本机 API 配置" disabled={busy} onPress={() => Alert.alert('清除全部 API 配置？', '所有本机 API 配置和密钥将删除；本地打字、人设和记录保留。', [{ text: '取消', style: 'cancel' }, { text: '清除', style: 'destructive', onPress: () => void run(async () => { await clearPersonalAi(); if (alive.current) { accept({ baseUrl: '', model: '', stream: true, hasKey: false,profiles:[],profileId:'' }); setNotice('已清除。重新配置后即可使用 AI。'); } }) }])} />}
    </View><Modal visible={modelPicker} animationType="slide" onRequestClose={()=>setModelPicker(false)}><SafeAreaView style={{flex:1,backgroundColor:colors.background}}><ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={{padding:16,gap:10}}><Text style={ui.heading}>选择模型</Text><Text style={ui.note}>列表由供应商提供，不代表每个模型都支持聊天或图片。选择后请保存配置。</Text><TextInput accessibilityLabel="搜索模型" value={filter} onChangeText={value=>{setFilter(value);setModelLimit(80);}} placeholder="搜索模型名称" style={ui.input}/><Action secondary label="返回 API 配置" onPress={()=>setModelPicker(false)}/><Text style={ui.note}>{`已显示 ${Math.min(modelLimit,matchingModels.length)}/${matchingModels.length} 个模型`}</Text>{matchingModels.slice(0,modelLimit).map(id=><Action key={id} label={id} secondary onPress={()=>{setModel(id);setModelPicker(false);setNotice('已选择模型，请保存配置后测试。');}}/>)}{matchingModels.length>modelLimit&&<Action secondary label="显示更多模型" onPress={()=>setModelLimit(limit=>limit+80)}/>} {!matchingModels.length&&<Text style={ui.note}>没有匹配模型，可以返回手动填写。</Text>}</ScrollView></SafeAreaView></Modal></>;
}
