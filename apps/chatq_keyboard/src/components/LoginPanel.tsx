import React, { useEffect, useRef, useState } from 'react';
import { Alert, Keyboard, KeyboardAvoidingView, Modal, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { authenticateAccount, forgetAccountSession, getAccountSession, getAccountIssue, subscribeAccountSession, logoutAccount, closeAccount, accountConnectionSecure } from '../services/api';
import { displayError } from '../services/nativeError';
import { colors, ui } from '../design';
import { Action, CopyAction } from './Ui';

type Mode = 'login' | 'register' | 'recover' | 'changePassword' | 'rotateRecovery' | 'closeAccount';
export function LoginPanel({ onChanged }: { onChanged: () => void }) {
  const [session, setSession] = useState(getAccountSession), [mode, setMode] = useState<Mode | null>(null);
  const [username, setUsername] = useState(''), [password, setPassword] = useState(''), [confirm, setConfirm] = useState(''), [current, setCurrent] = useState(''), [recovery, setRecovery] = useState('');
  const [code, setCode] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false), [visible, setVisible] = useState(false);
  const [issue, setIssue] = useState(getAccountIssue), [warning, setWarning] = useState('');
  const [confirmation,setConfirmation]=useState('');
  const alive = useRef(true), lock = useRef(false);
  useEffect(() => { alive.current = true; const unsubscribe = subscribeAccountSession(() => { if (alive.current) { setSession(getAccountSession()); setIssue(getAccountIssue()); } }); return () => { alive.current = false; unsubscribe(); }; }, []);
  function clearSecrets() { setPassword(''); setConfirm(''); setCurrent(''); setRecovery(''); setVisible(false);setConfirmation(''); }
  function open(next: Mode) { if (lock.current || code) return; clearSecrets(); setError(''); setWarning(''); setMode(next); setUsername(session?.user.username || username); }
  function close() { if (lock.current || code) return; Keyboard.dismiss(); clearSecrets(); setMode(null); setError(''); }
  async function run(fn: () => Promise<void>) {
    if (lock.current || !alive.current) return;
    lock.current = true; setBusy(true); setError('');
    try { await fn(); } catch (e) { if (alive.current) setError(displayError(e, '账号操作失败，请稍后重试')); }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  }
  async function submit() {
    const active = mode; if (!active) return;
    if(active==='closeAccount'){if(!current||confirmation!=='注销账号')throw new Error('请输入当前密码，并填写“注销账号”确认');const result=await closeAccount(current);if(alive.current){clearSecrets();setSession(getAccountSession());setWarning(result.warning||'账号已注销，本机API、人设和记录保留。');setMode(null);onChanged();}return;}
    if (!['changePassword','rotateRecovery'].includes(active) && !/^[a-z][a-z0-9_]{3,31}$/.test(username.trim().toLowerCase())) throw new Error('账号为 4–32 位字母、数字或下划线，以字母开头');
    if (!['login','rotateRecovery'].includes(active) && password !== confirm) throw new Error('两次输入的密码不一致');
    if (!['login','rotateRecovery'].includes(active) && (password.length < 8 || password.length > 128)) throw new Error('密码长度为 8–128 位');
    if (active === 'login' && !password) throw new Error('请输入登录密码');
    if (['changePassword','rotateRecovery'].includes(active) && !current) throw new Error('请输入当前密码');
    if (active === 'recover' && !/^[A-F0-9]{32}$/.test(recovery.replace(/[-\s]/g, '').toUpperCase())) throw new Error('请输入完整的 32 位恢复码，可保留分隔线');
    const body: Record<string, string> = active === 'rotateRecovery' ? { currentPassword: current } : active === 'changePassword' ? { currentPassword: current, newPassword: password } : active === 'recover' ? { username: username.trim().toLowerCase(), recoveryCode: recovery, newPassword: password } : { username: username.trim().toLowerCase(), password };
    const result = await authenticateAccount(active, body);
    if (!alive.current) return;
    clearSecrets(); Keyboard.dismiss(); setSession(getAccountSession()); onChanged();
    setWarning(result.warning || '');
    if (result.recoveryCode) setCode(result.recoveryCode); else setMode(null);
  }
  const field = (label: string, value: string, change: (s: string) => void, secret = false, limit = 128) => <View style={{ gap: 6 }}><Text style={ui.label}>{label}</Text><TextInput accessibilityLabel={label} value={value} onChangeText={change} editable={!busy} secureTextEntry={secret && !visible} autoCapitalize="none" autoCorrect={false} textContentType={label === '账号' ? 'username' : label.startsWith('新密码') || label.startsWith('再次') ? 'newPassword' : secret && label !== '账号恢复码' ? 'password' : 'none'} autoComplete={label === '账号' ? 'username' : 'off'} maxLength={limit} style={[ui.input, { minHeight: 52 }]} /></View>;
  return <>
    <View style={ui.card}><Text style={ui.label}>我的账号 · {session ? issue ? '需要重新登录' : '已登录' : '设备身份'}</Text><Text style={ui.heading}>{session ? session.user.username : '登录聊商账号'}</Text><Text style={ui.note}>{session ? '账号用于保留历史资料；自己的 API 与聊天记录保存在本机，免费使用无需登录。' : '登录为可选功能，不影响使用自己的 API。换机请重新配置 API，记录可用加密备份迁移。'}</Text>
      {!!issue && <Text accessibilityRole="alert" style={[ui.note, { color: colors.danger }]}>{issue}</Text>}
      {!accountConnectionSecure() && <Text style={[ui.note, { color: colors.danger }]}>账号功能需要 HTTPS 安全连接，请先更新服务器地址。</Text>}
      {session ? <>{!!issue && <Action label="重新登录" onPress={() => open('login')} disabled={busy} />}<View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}><Action secondary style={{ flex: 1, minWidth: 112 }} label="修改密码" onPress={() => open('changePassword')} disabled={busy || !!issue} /><Action secondary style={{ flex: 1, minWidth: 112 }} label="退出登录" disabled={busy} onPress={() => Alert.alert('退出账号？', '将使所有设备的登录状态失效。会员和订单保留，聊天记录仍在本机。', [{ text: '取消', style: 'cancel' }, { text: '退出登录', onPress: () => void run(async () => { await logoutAccount(); if (alive.current) { setSession(null); onChanged(); } }) }])} /></View><Action secondary label="重新生成恢复码" disabled={busy || !!issue} onPress={() => open('rotateRecovery')} /><Action secondary label="注销账号" disabled={busy||!!issue} onPress={()=>open('closeAccount')}/></> : <><Action label="账号登录" onPress={() => open('login')} disabled={busy || !accountConnectionSecure()} /><Action secondary label="注册账号（可选）" onPress={() => open('register')} disabled={busy || !!issue || !accountConnectionSecure()} /></>}
      {(session || !!issue) && <Action secondary label="仅清除此设备登录" disabled={busy} onPress={() => Alert.alert('清除本机登录？', '适用于离线、登录过期或存储损坏；其他设备保持登录。本机聊天记录、会员和订单保留。', [{ text: '取消', style: 'cancel' }, { text: '清除登录', onPress: () => void run(async () => { await forgetAccountSession(); if (alive.current) { setSession(null); onChanged(); } }) }])} />}
      {!!warning&&!mode&&<Text accessibilityLiveRegion="polite" style={ui.note}>{warning}</Text>}{!!error && !mode && <Text accessibilityRole="alert" style={[ui.note, { color: colors.danger }]}>{error}</Text>}
    </View>
    <Modal visible={!!mode} animationType="slide" onRequestClose={close}><SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 48, width: '100%', maxWidth: 600, alignSelf: 'center' }}>
      {!code && <Action secondary label="返回" disabled={busy} onPress={close} />}
      <Text style={ui.title}>{code ? '保存账号恢复码' : ({ login: '欢迎回来', register: '创建聊商账号', recover: '找回账号密码', changePassword: '修改登录密码', rotateRecovery: '重新生成恢复码',closeAccount:'注销聊商账号' } as Record<Mode, string>)[mode || 'login']}</Text>
      {code ? <><Text style={ui.text}>账号：{username}。忘记密码时，需要账号和恢复码。请保存到安全位置，不要发给他人。</Text>{(mode === 'recover' || mode === 'rotateRecovery') && <Text style={ui.note}>旧恢复码已失效，请保存下面的新码。</Text>}{!!warning && <Text accessibilityRole="alert" style={[ui.text, { color: colors.danger }]}>{warning}</Text>}<View style={ui.card}><Text selectable style={[ui.text, { fontWeight: '700', lineHeight: 30 }]}>{code}</Text><CopyAction label="复制恢复码" text={code} feedback="已复制，请保存到你信任的安全位置。" /></View><Text style={ui.note}>恢复码仅本次显示，应用不会保存它。</Text><Action label="我已保存，完成" onPress={() => { setCode(''); setMode(null); }} /></> : <>
        <Text style={ui.note}>{mode === 'register' ? '账号为 4–32 位字母、数字或下划线，以字母开头。注册后请保存恢复码，用于忘记密码时找回。' : mode === 'recover' ? '使用注册时保存的恢复码重置密码。完成后旧恢复码和其他设备登录将失效。' : mode === 'rotateRecovery' ? '验证当前密码后生成新码。旧恢复码和其他设备登录会失效；当前设备继续登录，会员与订单保留。' : mode === 'changePassword' ? '修改后当前设备继续登录，其他设备需要重新登录。' : '登录后管理历史账号资料；本机 API 配置和聊天记录不受影响。'}</Text>
        {mode !== 'closeAccount' && mode !== 'changePassword' && mode !== 'rotateRecovery' && field('账号', username, setUsername, false, 32)}
        {mode === 'recover' && field('账号恢复码', recovery, setRecovery, true, 64)}
        {mode === 'recover' && <Text style={ui.note}>恢复码为 32 位，可粘贴带分隔线的完整内容。当前不支持短信或邮箱找回；未保存恢复码时请联系管理员核验。</Text>}
        {(mode === 'changePassword' || mode === 'rotateRecovery' || mode === 'closeAccount') && field('当前密码', current, setCurrent, true)}
        {mode !== 'rotateRecovery' && mode !== 'closeAccount' && field(mode === 'login' ? '登录密码' : '新密码（8–128 位）', password, setPassword, true)}
        {mode !== 'login' && mode !== 'rotateRecovery' && mode !== 'closeAccount' && field('再次输入新密码', confirm, setConfirm, true)}
        {mode==='closeAccount'&&<><Text style={ui.text}>注销会停用账号、使全部登录和恢复码失效，并删除由该账号创建的云端同步空间。不可撤销。为保留历史交易记录，服务器保留不可登录的匿名标识及必要订单记录。</Text><Text style={ui.note}>本机输入、API密钥、人设、图片与会话不会自动删除；其他账号的同步空间不受影响。请先导出需要保留的数据。</Text><TextInput accessibilityLabel="注销确认文字" value={confirmation} onChangeText={setConfirmation} editable={!busy} maxLength={4} placeholder="输入：注销账号" style={ui.input}/></>}
        <Action secondary label={visible ? mode === 'recover' ? '隐藏密码与恢复码' : '隐藏密码' : mode === 'recover' ? '显示密码与恢复码' : '显示密码'} onPress={() => setVisible(!visible)} disabled={busy} />
        {!!error && <Text accessibilityRole="alert" style={[ui.note, { color: colors.danger }]}>{error}</Text>}
        <Action label={busy ? '处理中…' : mode === 'login' ? '登录' : mode === 'register' ? '注册并登录' : mode === 'rotateRecovery' ? '验证密码并生成新码' : mode==='closeAccount'?'确认注销账号':'确认修改并登录'} loading={busy} disabled={busy || (mode==='closeAccount'?(!current||confirmation!=='注销账号'):(mode === 'rotateRecovery' ? !current : !password)) || !['changePassword','rotateRecovery','closeAccount'].includes(mode || '') && !username.trim()} onPress={() => void run(submit)} />
        {mode === 'login' && <><Action secondary label="忘记密码，用恢复码找回" disabled={busy} onPress={() => open('recover')} /><Action secondary label="还没有账号？去注册" disabled={busy} onPress={() => open('register')} /></>}
      </>}
    </ScrollView></KeyboardAvoidingView></SafeAreaView></Modal>
  </>;
}
