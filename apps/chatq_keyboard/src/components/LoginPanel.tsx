import React, { useEffect, useRef, useState } from 'react';
import { Alert, Keyboard, Modal, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { authenticateAccount, forgetAccountSession, getAccountSession, logoutAccount, accountConnectionSecure } from '../services/api';
import { displayError } from '../services/nativeError';
import { colors, ui } from '../design';
import { Action, CopyAction } from './Ui';

type Mode = 'login' | 'register' | 'recover' | 'changePassword';
export function LoginPanel({ onChanged }: { onChanged: () => void }) {
  const [session, setSession] = useState(getAccountSession), [mode, setMode] = useState<Mode | null>(null);
  const [username, setUsername] = useState(''), [password, setPassword] = useState(''), [confirm, setConfirm] = useState(''), [current, setCurrent] = useState(''), [recovery, setRecovery] = useState('');
  const [code, setCode] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false), [visible, setVisible] = useState(false);
  const alive = useRef(true), lock = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  function clearSecrets() { setPassword(''); setConfirm(''); setCurrent(''); setRecovery(''); setVisible(false); }
  function open(next: Mode) { clearSecrets(); setError(''); setMode(next); setUsername(session?.user.username || ''); }
  function close() { if (lock.current || code) return; Keyboard.dismiss(); clearSecrets(); setMode(null); setError(''); }
  async function run(fn: () => Promise<void>) {
    if (lock.current || !alive.current) return;
    lock.current = true; setBusy(true); setError('');
    try { await fn(); } catch (e) { if (alive.current) setError(displayError(e, '账号操作失败，请稍后重试')); }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  }
  async function submit() {
    const active = mode; if (!active) return;
    if (active !== 'changePassword' && !/^[a-z][a-z0-9_]{3,31}$/.test(username.trim().toLowerCase())) throw new Error('账号为 4–32 位字母、数字或下划线，以字母开头');
    if (active !== 'login' && password !== confirm) throw new Error('两次输入的密码不一致');
    if (active !== 'login' && (password.length < 8 || password.length > 128)) throw new Error('密码长度为 8–128 位');
    const body: Record<string, string> = active === 'changePassword' ? { currentPassword: current, newPassword: password } : active === 'recover' ? { username: username.trim().toLowerCase(), recoveryCode: recovery, newPassword: password } : { username: username.trim().toLowerCase(), password };
    const result = await authenticateAccount(active, body);
    if (!alive.current) return;
    clearSecrets(); Keyboard.dismiss(); setSession(getAccountSession()); onChanged();
    if (result.recoveryCode) setCode(result.recoveryCode); else setMode(null);
  }
  const field = (label: string, value: string, change: (s: string) => void, secret = false, limit = 128) => <View style={{ gap: 6 }}><Text style={ui.label}>{label}</Text><TextInput accessibilityLabel={label} value={value} onChangeText={change} editable={!busy} secureTextEntry={secret && !visible} autoCapitalize="none" autoCorrect={false} textContentType={secret ? 'password' : 'none'} autoComplete="off" maxLength={limit} style={[ui.input, { minHeight: 52 }]} /></View>;
  return <>
    <View style={ui.card}><Text style={ui.heading}>{session ? session.user.username : '登录聊商账号'}</Text><Text style={ui.note}>{session ? '会员、额度和订单随账号使用，键盘与主应用共用。聊天记录保存在本机，需要时使用备份或加密同步。' : '当前使用设备身份。注册可保留本设备的会员、订单和额度，以后换手机登录同一账号即可使用。'}</Text>
      {!accountConnectionSecure() && <Text style={[ui.note, { color: colors.danger }]}>账号功能需要 HTTPS 安全连接，请先更新服务器地址。</Text>}
      {session ? <><Action secondary label="修改密码" onPress={() => open('changePassword')} disabled={busy} /><Action secondary label="退出登录" disabled={busy} onPress={() => Alert.alert('退出账号？', '将使所有设备的登录状态失效。会员和订单保留，聊天记录仍在本机。', [{ text: '取消', style: 'cancel' }, { text: '退出登录', onPress: () => void run(async () => { await logoutAccount(); if (alive.current) { setSession(null); onChanged(); } }) }])} />{(!!error || Date.parse(session.expiresAt) <= Date.now()) && <Action secondary label="仅清除此设备登录" disabled={busy} onPress={() => Alert.alert('清除本机登录？', '适用于离线或登录过期；其他设备保持登录。本机聊天记录保留。', [{ text: '取消', style: 'cancel' }, { text: '清除登录', onPress: () => void run(async () => { await forgetAccountSession(); if (alive.current) { setSession(null); onChanged(); } }) }])} />}</> : <><Action label="账号登录" onPress={() => open('login')} /><Action secondary label="注册账号，保留设备权益" onPress={() => open('register')} /></>}
      {!!error && !mode && <Text accessibilityRole="alert" style={[ui.note, { color: colors.danger }]}>{error}</Text>}
    </View>
    <Modal visible={!!mode} animationType="slide" onRequestClose={close}><SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 48 }}>
      <Text style={ui.title}>{code ? '保存账号恢复码' : ({ login: '欢迎回来', register: '创建聊商账号', recover: '找回账号密码', changePassword: '修改登录密码' } as Record<Mode, string>)[mode || 'login']}</Text>
      {code ? <><Text style={ui.text}>忘记密码时，凭账号和恢复码找回。请保存到安全位置，不要发给他人。此恢复码仅在本次显示。</Text><View style={ui.card}><Text selectable style={[ui.heading, { lineHeight: 32 }]}>{code}</Text><CopyAction label="复制恢复码" text={code} /></View><Action label="我已保存，完成" onPress={() => { setCode(''); setMode(null); }} /></> : <>
        <Text style={ui.note}>{mode === 'register' ? '账号为 4–32 位字母、数字或下划线，以字母开头。注册后请保存恢复码，用于忘记密码时找回。' : mode === 'recover' ? '使用注册时保存的恢复码重置密码。完成后旧恢复码和其他设备登录将失效。' : mode === 'changePassword' ? '修改后当前设备继续登录，其他设备需要重新登录。' : '登录后使用该账号的会员、订单和额度；本机记录会保留。'}</Text>
        {mode !== 'changePassword' && field('账号', username, setUsername, false, 32)}
        {mode === 'recover' && field('账号恢复码', recovery, setRecovery, true, 64)}
        {mode === 'changePassword' && field('当前密码', current, setCurrent, true)}
        {field(mode === 'login' ? '登录密码' : '新密码（8–128 位）', password, setPassword, true)}
        {mode !== 'login' && field('再次输入新密码', confirm, setConfirm, true)}
        <Action secondary label={visible ? mode === 'recover' ? '隐藏密码与恢复码' : '隐藏密码' : mode === 'recover' ? '显示密码与恢复码' : '显示密码'} onPress={() => setVisible(!visible)} disabled={busy} />
        {!!error && <Text accessibilityRole="alert" style={[ui.note, { color: colors.danger }]}>{error}</Text>}
        <Action label={busy ? '处理中…' : mode === 'login' ? '登录' : mode === 'register' ? '注册并登录' : '确认修改并登录'} loading={busy} disabled={busy || !password || mode !== 'changePassword' && !username.trim()} onPress={() => void run(submit)} />
        {mode === 'login' && <><Action secondary label="忘记密码，用恢复码找回" disabled={busy} onPress={() => open('recover')} /><Action secondary label="还没有账号？去注册" disabled={busy} onPress={() => open('register')} /></>}
        <Action secondary label="返回" disabled={busy} onPress={close} />
      </>}
    </ScrollView></SafeAreaView></Modal>
  </>;
}
