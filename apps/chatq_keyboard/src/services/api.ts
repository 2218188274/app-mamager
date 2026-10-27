import { validateScreenshot, type ScreenshotSide } from './screenshotReply';
import type { Attachment } from './chat';
import { personalAiRequest } from './personalAi';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { keyboardBridge, type KeyboardConfig } from '../../modules/chatq-keyboard';
import type { ReplyPersonalization } from './persona';
export type ReplyStyle = 'friendly' | 'professional' | 'funny' | 'emoji';
let config: KeyboardConfig | null = null;
export type AccountSession = { token: string; expiresAt: string; user: { id: string; username: string } };
let accountSession: AccountSession | null = null;
let accountRevision = 0, accountIssue = '';
let vaultWrites: Promise<void> = Promise.resolve();
const accountListeners = new Set<() => void>();
export function getAccountSession() { return accountSession; }
export function getAccountIssue() { return accountIssue || (accountSession && Date.parse(accountSession.expiresAt) <= Date.now() ? '登录已过期，请重新登录。会员和订单仍保留在账号中。' : ''); }
export function subscribeAccountSession(listener: () => void) { accountListeners.add(listener); return () => { accountListeners.delete(listener); }; }
function notifyAccount() { accountListeners.forEach(listener => listener()); }
function currentAccount(revision: number) { if (revision !== accountRevision) throw new Error('账号状态已变化，请重新操作'); }
function writeVault(fn: () => Promise<void>) { const next = vaultWrites.then(fn); vaultWrites = next.catch(() => {}); return next; }
const scope = (c: KeyboardConfig) => [c.baseUrl, c.apiKey, c.deviceId].join('\n');
export function accountConnectionSecure(c = config) { if (!c) return false; const u = new URL(c.baseUrl); return u.protocol === 'https:' || ['127.0.0.1', 'localhost'].includes(u.hostname); }
function validSession(value: unknown): value is AccountSession { const s = value as AccountSession | null; return !!s && typeof s.token === 'string' && s.token.length >= 32 && s.token.length <= 8192 && typeof s.user?.id === 'string' && typeof s.user?.username === 'string' && Number.isFinite(Date.parse(s.expiresAt)); }
async function saveSession(value: AccountSession, revision: number) {
  if (!validSession(value)) throw new Error('登录状态格式异常，请重新登录');
  // Passwords and recovery codes are never persisted. Android encrypts the token in Keystore.
  const clean = { token: value.token, expiresAt: value.expiresAt, user: { id: value.user.id, username: value.user.username } };
  await writeVault(async () => {
    currentAccount(revision);
    await keyboardBridge?.saveAccountSession?.(JSON.stringify(clean));
    currentAccount(revision); accountSession = clean; accountIssue = ''; notifyAccount();
  });
}
export async function forgetAccountSession() {
  const revision = ++accountRevision;
  await writeVault(async () => { await keyboardBridge?.clearAccountSession?.(); if (revision === accountRevision) { accountSession = null; accountIssue = ''; notifyAccount(); } });
}
const CONFIG_KEY = 'chatq.connection.v1';
export function getApiConfig() { return config; }
export function validateConfig(value: KeyboardConfig): KeyboardConfig {
  const baseUrl = value.baseUrl.trim().replace(/\/+$/, '');
  const url = new URL(baseUrl);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('请填写服务器根地址，例如 http://103.149.91.78');
  if (!value.apiKey.trim() || !value.deviceId.trim()) throw new Error('缺少应用连接配置');
  return { baseUrl, apiKey: value.apiKey.trim(), deviceId: value.deviceId };
}
export async function loadConnection(): Promise<KeyboardConfig> {
  const revision = ++accountRevision;
  const native = await keyboardBridge?.getConfig().catch(() => null);
  const saved = await AsyncStorage.getItem(CONFIG_KEY);
  let fallback: Partial<KeyboardConfig> | null = null;
  try { const value = JSON.parse(saved || 'null'); if (value && typeof value === 'object') fallback = Object.fromEntries(['baseUrl', 'apiKey', 'deviceId'].filter(k => typeof value[k] === 'string').map(k => [k, value[k]])); } catch { /* Recover from a damaged host cache using the native connection. */ }
  config = {
    baseUrl: native?.baseUrl || fallback?.baseUrl || process.env.EXPO_PUBLIC_CHATQ_BASE_URL || 'https://lt.youling.lol',
    apiKey: native?.apiKey || fallback?.apiKey || process.env.EXPO_PUBLIC_CHATQ_APP_KEY || '',
    deviceId: native?.deviceId || fallback?.deviceId || `chatq-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  };
  if (['http://103.149.91.78', 'https://103.149.91.78'].includes(config.baseUrl)) config.baseUrl = 'https://lt.youling.lol';
  currentAccount(revision); accountSession = null; accountIssue = '';
  try {
    const session = await keyboardBridge?.loadAccountSession?.(); currentAccount(revision);
    if (session) { const value: unknown = JSON.parse(session); if (!validSession(value)) throw new Error(); accountSession = value; }
  } catch { currentAccount(revision); accountIssue = '本机登录状态无法读取，请重新登录或清除本机登录。'; }
  notifyAccount();
  return config;
}
function requestId(): string {
  return `chatq-${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}
function cancelled(): Error { const error = new Error('已取消生成'); error.name = 'AbortError'; return error; }
async function post<T>(connection: KeyboardConfig, path: string, body: unknown, signal?: AbortSignal, method: 'POST' | 'GET' = 'POST', authenticated = true): Promise<T> {
  if (signal?.aborted) throw cancelled();
  const revision = accountRevision;
  if (authenticated && getAccountIssue()) throw new Error(getAccountIssue());
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort);
  const timeout = setTimeout(() => controller.abort(), 75000);
  try {
    const token = authenticated && config && scope(connection) === scope(config) ? accountSession?.token : undefined;
    if (token && !accountConnectionSecure(connection)) throw new Error('账号需要 HTTPS 安全连接，请更新服务器地址');
    const response = await fetch(`${connection.baseUrl}${path}`, {
      method, signal: controller.signal,
      redirect: 'error',
      headers: { 'Content-Type': 'application/json', 'x-api-key': connection.apiKey, 'x-device-id': connection.deviceId, ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      body: method === 'GET' ? undefined : JSON.stringify(body),
    });
    let json;
    try { json = await response.json(); } catch { throw new Error(`服务器响应异常（${response.status}），请稍后手动重试`); }
    if (authenticated) currentAccount(revision);
    if (!json || typeof json !== 'object') throw new Error('服务器响应格式异常，请稍后手动重试');
    if (!response.ok || !json.success) {
      const detail = typeof json.error === 'string' ? json.error : json.error?.message || json.message;
      if (token && response.status === 401) { accountIssue = '登录已失效，请重新登录。会员和订单仍保留在账号中。'; notifyAccount(); }
      throw new Error(detail || `服务器请求失败（${response.status}）`);
    }
    return json.data as T;
  } catch (error) {
    if (signal?.aborted) throw cancelled();
    if (error instanceof Error && error.name === 'AbortError') throw new Error('生成超时，请稍后手动重试');
    if (error instanceof TypeError) throw new Error('连接失败，请检查网络和服务器地址');
    throw error;
  } finally { clearTimeout(timeout); signal?.removeEventListener('abort', abort); }
}
export async function connect(value: KeyboardConfig) {
  const candidate = validateConfig(value);
  await post(candidate, '/api/user/register', { deviceId: candidate.deviceId }, undefined, 'POST', false);
  if (config && scope(config) !== scope(candidate)) await forgetAccountSession();
  await keyboardBridge?.saveConfig(candidate);
  await AsyncStorage.setItem(CONFIG_KEY, JSON.stringify(candidate));
  config = candidate;
  return candidate;
}
function candidatesFrom(result: unknown, limit = 3): string[] {
  if (!result || typeof result !== 'object') throw new Error('服务器没有返回回复内容');
  const data = result as { result?: unknown; candidates?: unknown };
  const values = Array.isArray(data.candidates) ? data.candidates : [];
  const candidates = [...new Set(values.filter((s): s is string => typeof s === 'string' && !!s.trim()).map(s => s.trim()))].slice(0, limit);
  if (!candidates.length && typeof data.result === 'string' && data.result.trim()) candidates.push(data.result.trim());
  if (!candidates.length) throw new Error('服务器没有返回回复内容');
  return candidates;
}
export async function generateReply(content: string, style: ReplyStyle, candidateCount: number, personalization: ReplyPersonalization = {}, signal?: AbortSignal, options: { purpose?: 'reply' | 'polish'; screenshot?: Attachment; side?: ScreenshotSide } = {}) {
  if (!Number.isInteger(candidateCount) || candidateCount < 1 || candidateCount > 10) throw new Error('回复条数需为 1–10 的整数');
  if (options.screenshot) { validateScreenshot(options.screenshot); if (options.purpose === 'polish' || !['left','right'].includes(options.side || '')) throw new Error('请确认截图中对方所在的一侧'); }
  const text = content.trim() || (options.screenshot ? '请结合截图中的聊天上下文，针对对方最后一条消息给出合适回复。' : '');
  if (!text || text.length > 1000) throw new Error('请输入 1–1000 字的消息，或选择聊天截图');
  const result = await personalAiRequest<unknown>('reply', { ...personalization, prompt: text, style, candidateCount, purpose: options.purpose || 'reply', ...(options.screenshot ? { screenshotReply: true, imageSide: options.side, attachments: [options.screenshot] } : {}), requestId: requestId() }, signal);
  return candidatesFrom(result, candidateCount);
}
export async function generateTopics(category: string, background: string, avoid: string[], personalization: ReplyPersonalization = {}, signal?: AbortSignal) {
  if (background.length > 200) throw new Error('话题背景最多 200 字');
  const result = await personalAiRequest<{ result: string; candidates?: string[] }>('topics', {
    ...personalization, category, prompt: background.trim(), style: 'friendly', candidateCount: 3, requestId: requestId(),
    avoid: avoid.filter(s => s.trim()).slice(0, 6).map(s => s.slice(0, 300)),
  }, signal);
  return candidatesFrom(result);
}
export async function refineReply(content: string, instruction: string, style: ReplyStyle, personalization: ReplyPersonalization, signal: AbortSignal): Promise<string> {
  if (!content.trim() || content.length > 1000) throw new Error('只支持改写 1–1000 字的回复');
  const result = await personalAiRequest<unknown>('reply', { ...personalization, customPrompt: [instruction, personalization.customPrompt].filter(Boolean).join('\n').slice(0, 500), prompt: content, purpose: 'polish', style, candidateCount: 1, requestId: requestId() }, signal);
  return candidatesFrom(result)[0];
}

export type AccountData = {
  identity?: { username: string | null; mode: 'account' | 'guest' };
  quota: { enabled: boolean; date: string; resetsAt: string; used: number; limit: number | null; remaining: number | null; isPro: boolean; candidateLimit: number };
  subscription: { tier: string; status: string; expiresAt: string | null };
  plans: { id: string; name: string; tier: string; billingPeriod: string; priceCents: number; currency: string; durationDays: number; description: string | null; features: string[] | null }[];
  purchaseAvailable: boolean;
  paymentReadiness?: {channelConfigured:boolean;salesEnabled:boolean;purchasablePlans:number;message:string};
};
export async function getAccount(signal?: AbortSignal): Promise<AccountData> {
  if (!config) throw new Error('请先连接服务器');
  const data = await post<AccountData>(config, '/api/aikeyboard/account', undefined, signal, 'GET');
  if (!data?.quota || !Number.isInteger(data.quota.used) || !data.subscription || !Array.isArray(data.plans)) throw new Error('额度信息格式异常，请稍后刷新');
  return data;
}
export async function syncRequest<T>(action:'create'|'read'|'write',body:unknown):Promise<T> {
  if(!config)throw new Error('请先连接服务器');
  return post<T>(config,'/api/aikeyboard/sync/'+action,body);
}
export type PaymentOrder = {id:string;orderNo?:string;durationDays?:number;name:string;amount:number;currency:string;status:string;checkoutUrl:string|null;createdAt:string;expiresAt:string;paidAt:string|null};
export async function paymentRequest<T>(action:'list'|'create'|'check',body?:unknown,signal?:AbortSignal):Promise<T>{if(action==='create')throw new Error('当前为免费模式，无需购买会员');if(!config)throw new Error('请先连接服务器');return post<T>(config,'/api/aikeyboard/payments'+(action==='list'?'':'/'+action),body,signal,action==='list'?'GET':'POST');}

export async function authenticateAccount(action: 'register' | 'login' | 'recover' | 'changePassword' | 'rotateRecovery', body: Record<string, string>): Promise<{ recoveryCode?: string; sessionSaved?: boolean; warning?: string }> {
  if (!config) throw new Error('请先连接服务器');
  if (!accountConnectionSecure()) throw new Error('账号密码需要 HTTPS 安全连接，请更新服务器地址');
  const connection = config, revision = ++accountRevision;
  const result = await post<AccountSession & { recoveryCode?: string }>(connection, '/api/aikeyboard/auth/' + action, body, undefined, 'POST', !['login','recover'].includes(action));
  currentAccount(revision); if (config !== connection) throw new Error('连接已变化，请重新登录');
  if (!validSession(result)) throw new Error('登录状态格式异常，请重新登录');
  try { await saveSession(result, revision); }
  catch (error) {
    currentAccount(revision);
    accountIssue = result.recoveryCode ? '登录状态未能保存，请保存恢复码后重新登录。' : '登录状态未能保存，请检查设备存储后重新登录。'; notifyAccount();
    if (!result.recoveryCode) throw new Error(accountIssue);
    return { recoveryCode: result.recoveryCode, sessionSaved: false, warning: accountIssue };
  }
  return { recoveryCode: result.recoveryCode, sessionSaved: true };
}
export async function refreshAccountSession() {
  if (!config || !accountSession) return;
  const current = accountSession, revision = accountRevision;
  const result = await post<AccountSession>(config, '/api/aikeyboard/auth/refresh', {});
  if (accountSession === current) await saveSession(result, revision);
}
export async function logoutAccount() {
  if (!config) throw new Error('请先连接服务器');
  const revision = accountRevision;
  await post(config, '/api/aikeyboard/auth/logout', {});
  currentAccount(revision);
  await forgetAccountSession();
}
export async function resumeGuestConnection() {
  if (getAccountIssue()) throw new Error(getAccountIssue());
  if (config && !accountSession) await post(config, '/api/user/register', { deviceId: config.deviceId }, undefined, 'POST', false);
}

export async function sendChat(request: import('./chat').ChatRequest, signal: AbortSignal, onDelta?: (text: string) => void): Promise<string> {
  const result = await personalAiRequest<{ reply: string }>('chat', request, signal, onDelta);
  if (typeof result?.reply !== 'string' || !result.reply.trim() || result.reply.length > 10000) throw new Error('AI 回答格式异常，请检查模型配置');
  return result.reply.trim();
}
