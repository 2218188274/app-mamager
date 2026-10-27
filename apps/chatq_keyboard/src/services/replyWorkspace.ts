import { keyboardBridge } from '../../modules/chatq-keyboard';
export type ReplyWorkspace = { schema: 1; mode: 'reply' | 'polish'; reply: string; polish: string; context: string; goal: string; style: 'friendly' | 'professional' | 'funny' | 'emoji'; hadScreenshot: boolean };
export const emptyWorkspace = (): ReplyWorkspace => ({ schema: 1, mode: 'reply', reply: '', polish: '', context: '', goal: '', style: 'friendly', hadScreenshot: false });
export type DraftState = { value: ReplyWorkspace; loaded: boolean; enabled: boolean; blocked: boolean; saving: boolean; operation: boolean; notice: string; error: string };
export function validateWorkspace(v: unknown): asserts v is ReplyWorkspace {
  if (!v || typeof v !== 'object' || Object.keys(v).sort().join(',') !== Object.keys(emptyWorkspace()).sort().join(',')) throw Error('草稿格式异常');
  const row = v as ReplyWorkspace;
  if (row.schema !== 1 || !['reply','polish'].includes(row.mode) || !['friendly','professional','funny','emoji'].includes(row.style) || typeof row.hadScreenshot !== 'boolean') throw Error('草稿格式异常');
  for (const [key, limit] of [['reply',1000],['polish',1000],['context',200],['goal',100]] as const) if (typeof row[key] !== 'string' || row[key].length > limit) throw Error('草稿内容超出限制');
}
// Serialize lifecycle saves, clear and privacy changes across mounts. A late save must never undo clear/off.
let tail: Promise<unknown> = Promise.resolve();
function serial<T>(work: () => Promise<T>): Promise<T> { const next = tail.catch(() => {}).then(work); tail = next; return next; }
export class ReplyDraftController {
  state: DraftState = { value: emptyWorkspace(), loaded: false, enabled: true, blocked: false, saving: false, operation: false, notice: '正在恢复本机草稿…', error: '' };
  private listeners = new Set<(state: DraftState) => void>(); private revision = 0; private dirty = false; private timer: ReturnType<typeof setTimeout> | undefined;
  subscribe(listener: (state: DraftState) => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  private update(patch: Partial<DraftState>) { this.state = { ...this.state, ...patch }; this.listeners.forEach(fn => fn(this.state)); }
  async load() {
    const ticket = ++this.revision;
    try {
      if (!keyboardBridge?.loadReplyDraft) throw Error('unsupported');
      const data = JSON.parse(await serial(() => keyboardBridge!.loadReplyDraft!()));
      if (typeof data.enabled !== 'boolean' || typeof data.expired !== 'boolean') throw Error('invalid');
      if (data.value !== null) validateWorkspace(data.value);
      if (ticket !== this.revision) return;
      this.update({ loaded: true, enabled: data.enabled, value: data.value || emptyWorkspace(), notice: data.value ? '已恢复本机草稿' + (data.value.hadScreenshot ? ' · 截图未保存，请重新选择' : '') : data.expired ? '超过 7 天未修改的草稿已清理' : data.enabled ? '文字草稿自动保存在本机' : '草稿仅在本次打开期间保留' });
    } catch { if (ticket === this.revision) this.update({ loaded: true, blocked: true, notice: '', error: '草稿暂未读取成功，原数据未覆盖。可继续输入，或清空保存的草稿后重试。' }); }
  }
  edit(patch: Partial<ReplyWorkspace>) {
    if (!this.state.loaded || this.state.operation) return;
    const value = { ...this.state.value, ...patch }; validateWorkspace(value); this.dirty = true; this.revision++; clearTimeout(this.timer);
    this.update({ value, saving: this.state.enabled && !this.state.blocked, notice: this.state.enabled && !this.state.blocked ? '正在保存草稿…' : '草稿仅在本次打开期间保留' });
    if (this.state.enabled && !this.state.blocked) this.timer = setTimeout(() => { void this.flush(); }, 250);
  }
  async flush() {
    clearTimeout(this.timer);
    if (!this.dirty || !this.state.loaded || !this.state.enabled || this.state.blocked || this.state.operation) return;
    const ticket = this.revision, raw = JSON.stringify(this.state.value);
    try {
      if (!keyboardBridge?.saveReplyDraft) throw Error('unsupported');
      const saved = await serial(async () => { if (ticket !== this.revision || !this.state.enabled || this.state.blocked) return false; await keyboardBridge!.saveReplyDraft!(raw); return true; });
      if (saved && ticket === this.revision) { this.dirty = false; this.update({ saving: false, notice: '草稿已保存 · 仅本机，保留 7 天', error: '' }); }
    } catch { if (ticket === this.revision) this.update({ saving: false, notice: '', error: '草稿保存失败，当前输入仍保留；请重试保存。' }); }
  }
  async setEnabled(enabled: boolean) {
    if (!this.state.loaded || this.state.operation) return;
    this.revision++; clearTimeout(this.timer); this.update({ operation: true, saving: false });
    try {
      if (!keyboardBridge?.setReplyDraftEnabled) throw Error('unsupported');
      await serial(() => keyboardBridge!.setReplyDraftEnabled!(enabled));
      this.update({ enabled, blocked: false, operation: false, error: '', notice: enabled ? '已开启本机草稿保存' : '已关闭保存并删除本机存档，当前输入仍保留' });
      if (enabled) { this.dirty = true; await this.flush(); }
    } catch { this.update({ operation: false, notice: '', error: '草稿设置未保存，原设置与存档保留，请重试。' }); }
  }
  async clear(): Promise<boolean> {
    if (!this.state.loaded || this.state.operation) return false;
    this.revision++; clearTimeout(this.timer); this.update({ operation: true, saving: false });
    try {
      if (!keyboardBridge?.clearReplyDraft) throw Error('unsupported');
      await serial(() => keyboardBridge!.clearReplyDraft!()); this.dirty = false;
      this.update({ value: emptyWorkspace(), blocked: false, operation: false, error: '', notice: '回复与润色草稿已清空' }); return true;
    } catch { this.update({ operation: false, error: '清空失败，草稿仍保留，请重试。' }); return false; }
  }
}
export function parseReplyCount(value: string): number {
  if (!/^(?:[1-9]|10)$/.test(value.trim())) throw Error('请输入 1–10 的整数'); return Number(value.trim());
}
