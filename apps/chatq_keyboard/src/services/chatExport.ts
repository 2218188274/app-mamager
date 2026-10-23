import { parseChat, type ChatSession } from './chat';

export type ChatExportFormat = 'txt' | 'md';
const date = (at: number) => new Date(at).toISOString();
const heading = (value: string) => value.replace(/[\\`*_{}\[\]()#+.!>|<~=-]/g, '\\$&');
// Literal blocks prevent message-supplied HTML, links or images from executing in Markdown viewers.
function literal(value: string): string {
  let longest = 0; for (const run of value.matchAll(/`+/g)) longest = Math.max(longest, run[0].length);
  const fence = '`'.repeat(Math.max(3, longest + 1)); return `${fence}text\n${value}\n${fence}`;
}
export function exportChat(session: ChatSession, format: ChatExportFormat): string {
  parseChat(session);
  if (format !== 'txt' && format !== 'md') throw new Error('不支持的导出格式');
  if (!session.turns.length) throw new Error('当前会话还没有完整问答可导出');
  const md = format === 'md';
  const lines = [md ? '# ' + heading(session.title) : session.title, '', '聊商 ChatQ · 本机 AI 会话', `创建时间：${date(session.createdAt)}`, `更新时间：${date(session.updatedAt)}`, `完整问答：${session.turns.length} 轮`, '导出仅含完整问答与会话背景；不含草稿、未完成预览或连接凭据。', '此文件为明文，请妥善保管。AI 内容可能有误。'];
  if (session.background) lines.push('', md ? '## 会话背景' : '【会话背景】', md ? literal(session.background) : session.background);
  session.turns.forEach((turn, index) => {
    lines.push('', md ? `## 第 ${index + 1} 轮` : `===== 第 ${index + 1} 轮 =====`, `回答时间：${date(turn.at)}`);
    if (session.contextStart > 0 && index === session.contextStart) lines.push('（从此轮开始重置过上下文）');
    lines.push('', md ? '### 你' : '【你】', md ? literal(turn.question) : turn.question, '', md ? '### AI · ' + heading(turn.personaName) : '【AI · ' + turn.personaName + '】', md ? literal(turn.answer) : turn.answer);
  });
  const text = lines.join('\n') + '\n';
  if (text.length > 4000000) throw new Error('导出内容过大，请先整理会话');
  return text;
}
