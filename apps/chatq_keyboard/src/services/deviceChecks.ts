import { keyboardBridge } from '../../modules/chatq-keyboard';
import { loadPersonalAi } from './personalAi';
export type CheckState = 'yes' | 'no' | 'unknown' | 'unsupported';
export type DeviceChecks = { api: CheckState; enabled: CheckState; selected: CheckState; version: string };
// This module reads local status only. Never add a provider request or private data to the report.
async function bounded<T>(work: () => Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([Promise.resolve().then(work), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('local check timeout')), 8000); })]); }
  finally { if (timer) clearTimeout(timer); }
}
export async function readDeviceChecks(platform: string): Promise<DeviceChecks> {
  const [api, keyboard, version] = await Promise.allSettled([
    bounded(() => loadPersonalAi()),
    bounded(async () => { if (!keyboardBridge?.getKeyboardStatus) throw new Error('unsupported'); return keyboardBridge.getKeyboardStatus(); }),
    bounded(async () => { if (!keyboardBridge?.getInstalledVersion) throw new Error('unsupported'); return keyboardBridge.getInstalledVersion(); }),
  ]);
  const state = (value: unknown): CheckState => value === true ? 'yes' : value === false ? 'no' : 'unknown';
  return {
    api: platform !== 'android' ? 'unsupported' : api.status === 'fulfilled' ? state(api.value.hasKey) : 'unknown',
    enabled: platform !== 'android' ? 'unsupported' : keyboard.status === 'fulfilled' ? state(keyboard.value?.enabled) : 'unknown',
    selected: platform !== 'android' ? 'unsupported' : keyboard.status === 'fulfilled' ? state(keyboard.value?.selected) : 'unknown',
    version: version.status === 'fulfilled' && /^\d+\.\d+\.\d+(?:[.-][a-zA-Z0-9]+)*$/.test(version.value?.version) && Number.isSafeInteger(version.value.versionCode) && version.value.versionCode > 0 ? `${version.value.version} (${version.value.versionCode})` : '未读取成功',
  };
}
export function deviceReport(checks: DeviceChecks, platform: string): string {
  const labels = { yes: '是', no: '否', unknown: '未读取成功', unsupported: '当前平台不支持检查' };
  return ['聊商本机使用检查', '平台：' + (platform === 'android' ? 'Android' : platform === 'ios' ? 'iOS' : '其他'), '版本：' + checks.version,
    'API 配置已保存：' + labels[checks.api], '键盘已启用：' + labels[checks.enabled], '聊商为当前输入法：' + labels[checks.selected],
    '仅检查本机设置，未测试 API 连接；不包含密钥、接口地址或输入内容。'].join('\n');
}
