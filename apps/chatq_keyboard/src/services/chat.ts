import type { PersonaState } from './persona';
import { replyPersonalization } from './persona';

export type AnswerVersion = { answer: string; at: number; personaName: string };
export type Attachment = { id: string; name: string; mime: 'image/jpeg' | 'image/png' | 'application/pdf' | 'text/plain'; content: string };
export type ChatTurn = { id: string; question: string; answer: string; at: number; personaName: string; alternatives?: AnswerVersion[]; attachments?: Attachment[] };
export type ChatSession = { id: string; title: string; createdAt: number; updatedAt: number; personaId: string; background: string; useContext: boolean; contextStart: number; draft: string; turns: ChatTurn[]; parent?: { sessionId: string; turnId: string }; attachments?: Attachment[] };
export type ChatSummary = Pick<ChatSession, 'id' | 'title' | 'updatedAt'> & { turnCount: number; snippet?: string };
export type HistoryMessage = { role: 'user' | 'assistant'; content: string };
export type ChatPersona = { personaName: string; customPrompt?: string; personaTagWeights?: Record<string, number> };
export type ChatRequest = ChatPersona & { prompt: string; history: HistoryMessage[]; context: string; attachments?: Attachment[] };
const clipTitle = (value: string, max: number) => value.slice(0, max).replace(/[\uD800-\uDBFF]$/, '');
export const chatId = () => `chat-${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
export function newChat(): ChatSession { const now = Date.now(); return { id: chatId(), title: '新对话', createdAt: now, updatedAt: now, personaId: '', background: '', useContext: true, contextStart: 0, draft: '', turns: [] }; }
export function chatTitle(value: string): string {
  const title = value.trim();
  if (!title || title.length > 40 || /[\u0000-\u001f\u007f-\u009f]/.test(title)) throw new Error('会话名称需要 1–40 个字，不能包含换行或控制字符');
  return title;
}
export function parseChat(value: unknown): ChatSession {
  const v = value as ChatSession;
  const text = (s: unknown, min: number, max: number): s is string => typeof s === 'string' && s.length >= min && s.length <= max;
  const exact = (o: object, keys: string[], optional: string[] = []) => keys.every(k => Object.prototype.hasOwnProperty.call(o, k)) && Object.keys(o).every(k => keys.includes(k) || optional.includes(k));
  const time = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n > 0 && n < 4102444800000;
  if (!v || typeof v !== 'object' || !exact(v, ['id','title','createdAt','updatedAt','personaId','background','useContext','contextStart','draft','turns'], ['parent','attachments']) || !text(v.id, 1, 80) || !/^[a-zA-Z0-9_-]+$/.test(v.id) || !text(v.title, 1, 40) || /[\u0000-\u001f\u007f-\u009f]/.test(v.title) || !time(v.createdAt) || !time(v.updatedAt) || v.updatedAt < v.createdAt || !text(v.personaId, 0, 80) || !text(v.background, 0, 1000) || !text(v.draft, 0, 2000) || typeof v.useContext !== 'boolean' || !Array.isArray(v.turns) || v.turns.length > 100 || !Number.isInteger(v.contextStart) || v.contextStart < 0 || v.contextStart > v.turns.length) throw new Error('对话记录格式异常，现有数据未修改');
  if (v.parent !== undefined && (!v.parent || typeof v.parent !== 'object' || !exact(v.parent, ['sessionId','turnId']) || !text(v.parent.sessionId,1,80) || !text(v.parent.turnId,1,80) || v.parent.sessionId === v.id)) throw new Error('分支来源格式异常');
  validateAttachments(v.attachments);
  const ids = new Set();
  for (const t of v.turns) { if (!t || typeof t !== 'object' || !exact(t, ['id','question','answer','at','personaName'], ['alternatives','attachments']) || !text(t.id, 1, 80) || ids.has(t.id) || !text(t.question, 1, 2000) || !t.question.trim() || !text(t.answer, 1, 10000) || !t.answer.trim() || !time(t.at) || t.at > v.updatedAt || !text(t.personaName, 1, 20)) throw new Error('对话内容格式异常，现有数据未修改'); ids.add(t.id);
    if (t.alternatives !== undefined && (!Array.isArray(t.alternatives) || t.alternatives.length > 3 || t.alternatives.some(a => !a || !exact(a, ['answer','at','personaName']) || !text(a.answer,1,10000) || !a.answer.trim() || !time(a.at) || a.at > v.updatedAt || !text(a.personaName,1,20)))) throw new Error('回答版本格式异常');
    validateAttachments(t.attachments);
  }
  if (JSON.stringify(v).length > 4000000) throw new Error('会话容量已达上限，请开始新会话');
  return v;
}
export function validateAttachments(value: unknown): asserts value is Attachment[] | undefined {
  if (value === undefined) return;
  if (!Array.isArray(value) || value.length > 2) throw new Error('每次最多添加 2 个附件');
  let textSize = 0, size = 0; const ids = new Set<string>();
  for (const a of value) {
    if (!a || typeof a !== 'object' || Object.keys(a).sort().join(',') !== 'content,id,mime,name' || typeof a.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(a.id) || ids.has(a.id) || typeof a.name !== 'string' || !a.name.trim() || a.name.length > 100 || /[\u0000-\u001f\u007f]/.test(a.name) || typeof a.content !== 'string' || !a.content.length || !['image/jpeg','image/png','application/pdf','text/plain'].includes(a.mime)) throw new Error('附件格式异常');
    ids.add(a.id); size += a.content.length;
    if (a.mime === 'text/plain') textSize += a.content.length;
    else if (a.content.length > 700000 || !a.content.startsWith('data:' + a.mime + ';base64,') || !/^[A-Za-z0-9+/]+={0,2}$/.test(a.content.split(',')[1] || '')) throw new Error('图片格式或大小异常');
  }
  if (textSize > 12000 || size > 1400000) throw new Error('附件超出容量：文本合计最多 12000 字、图片每张约 500KB');
}
export function chatHistory(session: ChatSession, prompt: string): HistoryMessage[] {
  if (!session.useContext) return [];
  let budget = 16000 - prompt.length; const turns: ChatTurn[] = [];
  for (let i = session.turns.length - 1; i >= Math.max(session.contextStart, session.turns.length - 10); i--) {
    const turn = session.turns[i], size = turn.question.length + turn.answer.length;
    if (size > budget) break; turns.unshift(turn); budget -= size;
  }
  return turns.flatMap(t => [{ role: 'user' as const, content: t.question }, { role: 'assistant' as const, content: t.answer }]);
}
export function chatPersona(state: PersonaState | null, id: string): ChatPersona {
  if (!state || !id || !state.data.cards.some(c => c.id === id)) return { personaName: '默认助手' };
  const card = state.data.cards.find(c => c.id === id)!;
  const fields = replyPersonalization({ data: state.data, selection: { cardId: id, sceneId: '', relationId: '' } });
  return { personaName: card.name, customPrompt: fields.customPrompt, personaTagWeights: fields.personaTagWeights };
}
export type ChatSnapshot = { session: ChatSession; phase: 'idle' | 'generating' | 'saving'; pending: string; partial: string; regenerating: boolean; error: string; notice: string; unsaved: boolean; retry: 'send' | 'regenerate' | null };
const errorText = (e: unknown) => e instanceof Error ? e.message : '操作失败，请手动重试';
export class ChatController {
  private state: ChatSnapshot = { session: newChat(), phase: 'idle', pending: '', partial: '', regenerating: false, error: '', notice: '', unsaved: false, retry: null };
  private listeners = new Set<() => void>();
  private request: AbortController | null = null;
  private removing = '';
  constructor(private save: (session: ChatSession) => Promise<boolean>, private generate: (request: ChatRequest, signal: AbortSignal, onProgress?: (text: string) => void) => Promise<string>) {}
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(patch: Partial<ChatSnapshot>) { this.state = { ...this.state, ...patch }; this.listeners.forEach(fn => fn()); }
  edit(patch: Partial<Pick<ChatSession, 'draft' | 'background' | 'personaId' | 'useContext' | 'contextStart' | 'attachments'>>) {
    if (this.state.phase !== 'idle') return;
    if ('attachments' in patch) validateAttachments(patch.attachments);
    this.publish({ session: { ...this.state.session, ...patch, updatedAt: Math.max(Date.now(), this.state.session.updatedAt + 1) }, unsaved: true, error: '', notice: '', retry: null });
  }
  open(session: ChatSession, expected?: ChatSession): boolean { if (this.state.phase !== 'idle' || expected && expected !== this.state.session) return false; this.request = null; this.publish({ session: parseChat(session), unsaved: false, partial: '', regenerating: false, error: '', notice: '', retry: null }); return true; }
  resetContext() { this.edit({ contextStart: this.state.session.turns.length, background: '', useContext: true }); this.publish({ notice: '上下文已重置，之前的消息仍保留在本机。' }); }
  async flush() {
    const current = this.state.session;
    // Writes already queued before remove are serialized by chatStore. A new
    // lifecycle/autosave must not enqueue the deleted revision afterward.
    if (this.removing === current.id) return false;
    if (!this.state.unsaved) return true;
    const saved = await this.save(current);
    if (this.state.session === current) this.publish({ unsaved: !saved, ...(saved ? {} : { notice: '本机保存已关闭，当前内容仅临时保留。' }) });
    return saved;
  }
  async retrySave() { try { const saved = await this.flush(); if (saved) this.publish({ error: '', notice: '对话已保存到本机。' }); } catch (e) { this.publish({ error: '保存失败：' + errorText(e) }); } }
  async remove(id: string, remove: (id: string) => Promise<void>) {
    if (this.state.phase !== 'idle') throw new Error('请等待当前操作结束');
    const current = this.state.session;
    this.removing = id; this.publish({ phase: 'saving' });
    try {
      await remove(id);
      if (current.id === id) this.publish({ session: newChat(), unsaved: false, pending: '', partial: '', regenerating: false, error: '', notice: '会话已从本机删除。', retry: null });
    } finally { this.removing = ''; this.publish({ phase: 'idle' }); }
  }
  async rename(value: string) {
    if (this.state.phase !== 'idle') throw new Error('请等待当前操作结束');
    const title = chatTitle(value), session = this.state.session;
    const next = { ...session, title, updatedAt: Math.max(Date.now(), session.updatedAt + 1) };
    this.publish({ phase: 'saving' });
    try {
      if (!await this.save(next)) throw new Error('请先开启本机记录保存，再重命名会话');
      this.publish({ session: next, unsaved: false, error: '', notice: '', retry: null });
    } finally { this.publish({ phase: 'idle' }); }
  }
  cancel() {
    if (this.state.phase !== 'generating') return;
    this.request?.abort(); this.request = null;
    this.publish({ phase: 'idle', pending: '', notice: this.state.regenerating ? '已停止，原回答和草稿保留。' : '已停止，消息保留在输入框。', error: '', retry: null });
  }
  dismissNotice() { this.publish({ notice: '' }); }
  async retry(persona: ChatPersona) { const kind = this.state.retry; if (kind) return this.run(persona, kind === 'regenerate'); }
  async selectVersion(turnId: string, index: number) {
    if (this.state.phase !== 'idle') throw new Error('请等待当前操作结束');
    const session = this.state.session, position = session.turns.findIndex(t => t.id === turnId), turn = session.turns[position], chosen = turn?.alternatives?.[index];
    if (!chosen) throw new Error('回答版本不存在');
    const alternatives = [...turn.alternatives!]; alternatives[index] = { answer: turn.answer, at: turn.at, personaName: turn.personaName };
    const turns = [...session.turns]; turns[position] = { ...turn, ...chosen, alternatives };
    const next = { ...session, turns, updatedAt: Math.max(Date.now(), session.updatedAt + 1) };
    this.publish({ phase: 'saving' });
    try { if (!await this.save(next)) throw new Error('请先开启本机记录保存'); this.publish({ session: next, unsaved: false, error: '', notice: '已切换回答，后续上下文使用当前版本。' }); }
    finally { this.publish({ phase: 'idle' }); }
  }
  async send(persona: ChatPersona) { return this.run(persona, false); }
  async regenerate(persona: ChatPersona) { return this.run(persona, true); }
  async answerEdited(turnId: string, question: string, persona: ChatPersona) { return this.run(persona, false, { turnId, question }); }
  private async run(persona: ChatPersona, regenerate: boolean, edited?: { turnId: string; question: string }) {
    if (this.state.phase !== 'idle') return;
    let session = this.state.session;
    const previous = session.turns.at(-1), editedIndex = edited ? session.turns.findIndex(t => t.id === edited.turnId) : -1;
    if (edited && editedIndex < 0) { this.publish({ error: '原问题已不存在，请重新选择' }); return; }
    if (regenerate && !previous) return;
    const prompt = edited ? edited.question.trim() : regenerate ? previous!.question : session.draft.trim();
    if (!prompt || prompt.length > 2000) { this.publish({ error: '请输入 1–2000 字的消息' }); return; }
    if (!regenerate && !edited && session.turns.length >= 100) { this.publish({ error: '当前对话已达 100 轮，请开始新对话。' }); return; }
    const controller = new AbortController(); this.request = controller;
    let retryAllowed = !edited;
    const current = () => this.request === controller && !controller.signal.aborted;
    this.publish({ phase: 'generating', pending: prompt, partial: '', regenerating: regenerate, error: '', notice: '', retry: null });
    try {
      const saved = await this.flush(); if (!current()) return;
      if (edited) {
        if (!saved) throw new Error('请先开启本机记录保存，保留原对话后再编辑问题');
        const now = Math.max(Date.now(), session.updatedAt + 1);
        const branch = { ...session, id: chatId(), title: clipTitle(session.title, 34) + ' · 编辑', createdAt: now, updatedAt: now, draft: prompt, parent: { sessionId: session.id, turnId: edited!.turnId }, attachments: session.turns[editedIndex].attachments || [], contextStart: Math.min(session.contextStart, editedIndex), turns: session.turns.slice(0, editedIndex) };
        // Reserve a persisted draft before a paid request. Capacity failures leave the original intact.
        if (!await this.save(branch)) throw new Error('请先开启本机记录保存，再编辑问题');
        if (!current()) return;
        session = branch; this.publish({ session, unsaved: false }); retryAllowed = true;
      }
      parseChat(session);
      if (JSON.stringify(session).length > 3920000) throw new Error('当前会话空间不足以保存新的完整回答，请开始新会话；本次未请求 AI');
      const historySession = regenerate ? { ...session, turns: session.turns.slice(0, -1) } : session;
      const attachments = regenerate ? previous!.attachments : session.attachments;
      const attachmentText = (attachments || []).filter(a => a.mime === 'text/plain').map(a => a.content).join('');
      const answer = await this.generate({ ...persona, prompt, context: session.background, history: chatHistory(historySession, prompt + attachmentText), ...(attachments?.length ? { attachments } : {}) }, controller.signal, text => {
        if (current() && typeof text === 'string' && text.length <= 10000) this.publish({ partial: text });
      });
      if (!current()) return;
      if (typeof answer !== 'string' || !answer.trim() || answer.length > 10000) throw new Error('AI 回答格式异常，请检查服务配置');
      const at = Math.max(Date.now(), session.updatedAt + 1);
      const alternatives = regenerate ? [...(previous!.alternatives || []), { answer: previous!.answer, at: previous!.at, personaName: previous!.personaName }].slice(-3) : undefined;
      const next = { ...session, ...(session.attachments ? { attachments: regenerate ? session.attachments : [] } : {}), draft: regenerate ? session.draft : '', title: session.turns.length || session.title !== '新对话' ? session.title : (clipTitle(prompt.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').replace(/\s+/g, ' ').trim(), 40) || '新对话'), updatedAt: at, contextStart: regenerate ? Math.min(session.contextStart, session.turns.length - 1) : session.contextStart, turns: [...(regenerate ? session.turns.slice(0, -1) : session.turns), { id: regenerate ? previous!.id : chatId(), question: prompt, answer: answer.trim(), at, personaName: persona.personaName, ...(alternatives?.length ? { alternatives } : {}), ...(attachments?.length ? { attachments } : {}) }] };
      this.publish({ session: next, phase: 'saving', pending: '', partial: '', regenerating: false, unsaved: true });
      try { await this.flush(); }
      catch (e) { this.publish({ error: '回答已生成，但保存失败。请点“保存本机记录”，无需再次请求 AI。' }); }
    } catch (e) {
      if (current()) this.publish({ error: errorText(e), retry: retryAllowed ? (regenerate ? 'regenerate' : 'send') : null });
    } finally { if (this.request === controller) { this.request = null; this.publish({ phase: 'idle', pending: '' }); } }
  }
}
