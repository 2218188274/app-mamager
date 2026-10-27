import { keyboardBridge } from '../../modules/chatq-keyboard';

export type PersonalAiProfile = { id: string; name: string; baseUrl: string; model: string };
export type PersonalAiConfig = { baseUrl: string; model: string; stream: boolean; hasKey: boolean; profileId?: string; profileName?: string; profiles?: PersonalAiProfile[] };
export type PersonalAiInput = Pick<PersonalAiConfig, 'baseUrl' | 'model' | 'stream' | 'profileId' | 'profileName'> & { apiKey: string };
const unsupported = () => new Error('当前安装包不支持个人 API，请安装新版安卓安装包');
function cancelled() { const e = new Error('已取消生成'); e.name = 'AbortError'; return e; }
export function validatePersonalAi(input: PersonalAiInput): PersonalAiInput {
  const baseUrl = input.baseUrl.trim().replace(/\/+$/, '');
  let url: URL; try { url = new URL(baseUrl); } catch { throw new Error('请填写完整的 HTTPS API 基础地址'); }
  if (baseUrl.length > 2048 || url.username || url.password || url.search || url.hash || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname)))) throw new Error('API 地址需使用 HTTPS，不能包含账号、查询参数或片段');
  if (baseUrl.endsWith('/chat/completions')) throw new Error('请填写基础地址，不包含 /chat/completions，例如 https://供应商域名/v1');
  const model = input.model.trim(), apiKey = input.apiKey.trim();
  if (!model || model.length > 200 || /[\s\u0000-\u001f\u007f]/.test(model)) throw new Error('请填写供应商提供的模型名称');
  if (apiKey.length > 8192 || /[^\x21-\x7e]/.test(apiKey)) throw new Error('密钥不能包含空格、换行或非英文字符');
  const profileName = input.profileName?.trim();
  if (profileName !== undefined && (!profileName || profileName.length > 30 || /[\u0000-\u001f\u007f]/.test(profileName))) throw new Error('配置名称需为1–30字');
  return { baseUrl, model, apiKey, stream: input.stream, ...(input.profileId !== undefined ? { profileId: input.profileId } : {}), ...(profileName !== undefined ? { profileName } : {}) };
}
function metadata(raw: string): PersonalAiConfig {
  const v = JSON.parse(raw);
  if (!v || typeof v.baseUrl !== 'string' || typeof v.model !== 'string' || typeof v.hasKey !== 'boolean' || typeof v.stream !== 'boolean') throw new Error('API 配置格式异常，请重新保存');
  const profiles = Array.isArray(v.profiles) ? v.profiles.map((p: PersonalAiProfile) => { if (!p || !['id','name','baseUrl','model'].every(k => typeof p[k as keyof PersonalAiProfile] === 'string')) throw new Error('配置列表格式异常'); return { id:p.id, name:p.name, baseUrl:p.baseUrl, model:p.model }; }) : [];
  return { baseUrl: v.baseUrl, model: v.model, stream: v.stream, hasKey: v.hasKey, profileId: typeof v.profileId === 'string' ? v.profileId : '', profileName: typeof v.profileName === 'string' ? v.profileName : '', profiles };
}
export async function loadPersonalAi(): Promise<PersonalAiConfig> {
  if (!keyboardBridge?.getPersonalAiConfig) throw unsupported();
  return metadata(await keyboardBridge.getPersonalAiConfig());
}
export async function savePersonalAi(value: PersonalAiInput): Promise<PersonalAiConfig> {
  if (!keyboardBridge?.savePersonalAiConfig) throw unsupported();
  return metadata(await keyboardBridge.savePersonalAiConfig(JSON.stringify(validatePersonalAi(value))));
}
export async function clearPersonalAi() { if (!keyboardBridge?.clearPersonalAiConfig) throw unsupported(); await keyboardBridge.clearPersonalAiConfig(); }
export async function selectPersonalAiProfile(id: string) { if (!keyboardBridge?.selectPersonalAiProfile) throw unsupported(); return metadata(await keyboardBridge.selectPersonalAiProfile(id)); }
export async function removePersonalAiProfile(id: string) { if (!keyboardBridge?.removePersonalAiProfile) throw unsupported(); return metadata(await keyboardBridge.removePersonalAiProfile(id)); }
export async function personalAiModels(input: PersonalAiInput, signal?: AbortSignal): Promise<string[]> {
  const config=validatePersonalAi({...input, model: input.model || 'model-list-only'});
  const result=await personalAiRequest<{models: unknown}>('models',{config},signal);
  if (!Array.isArray(result.models) || result.models.length>500 || result.models.some(x => typeof x!=='string' || !x.length || x.length>200)) throw new Error('模型列表格式异常，请手动填写');
  return result.models as string[];
}
export async function personalAiRequest<T>(path: 'reply' | 'topics' | 'chat' | 'test' | 'extract' | 'visionTest' | 'models', body: unknown, signal?: AbortSignal, onDelta?: (text: string) => void): Promise<T> {
  const native = keyboardBridge;
  if (!native?.startPersonalAiRequest || !native.readPersonalAiRequest || !native.cancelPersonalAiRequest || !native.releasePersonalAiRequest) throw unsupported();
  if (signal?.aborted) throw cancelled();
  const id = `personal-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const abort = () => { void native.cancelPersonalAiRequest!(id).catch(() => {}); };
  signal?.addEventListener('abort', abort, { once: true });
  let last = ''; const deadline = Date.now() + 80000;
  try {
    await native.startPersonalAiRequest(id, path, JSON.stringify(body));
    while (true) {
      if (signal?.aborted) throw cancelled();
      const status = JSON.parse(await native.readPersonalAiRequest(id));
      if (signal?.aborted) throw cancelled();
      if (typeof status.text !== 'string' || status.text.length > 10000) throw new Error('AI 回复格式异常');
      if (status.text !== last) { last = status.text; onDelta?.(last); }
      if (status.status === 'done') return JSON.parse(status.result) as T;
      if (status.status === 'cancelled') throw cancelled();
      if (status.status === 'error') throw new Error(typeof status.error === 'string' ? status.error : 'API 请求失败，请手动重试');
      if (status.status !== 'running') throw new Error('AI 请求状态异常');
      if (Date.now() > deadline) throw new Error('生成超时，请稍后手动重试');
      await new Promise<void>(resolve => setTimeout(resolve, 80));
    }
  } finally { signal?.removeEventListener('abort', abort); await native.releasePersonalAiRequest(id).catch(() => {}); }
}
