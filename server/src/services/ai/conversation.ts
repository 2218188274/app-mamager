import { z } from 'zod';
import { attachmentsInput } from './attachments.js';

export const conversationInput = z.object({
  requestId: z.string().regex(/^[a-zA-Z0-9_-]{16,80}$/),
  prompt: z.string().trim().min(1, '请输入消息').max(2000, '消息最多 2000 字'),
  history: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().trim().min(1).max(10000) }).strict()).max(20).default([]),
  context: z.string().trim().max(1000).optional(),
  attachments: attachmentsInput.optional(),
  personaName: z.string().trim().max(20).optional(),
  customPrompt: z.string().trim().max(500).optional(),
  personaTagWeights: z.record(z.string().regex(/^[\w-]{1,50}$/), z.number().min(0.1).max(0.9)).refine(v => Object.keys(v).length <= 20).optional(),
}).strict().superRefine((input, ctx) => {
  if (input.history.length % 2 || input.history.some((m, i) => m.role !== (i % 2 ? 'assistant' : 'user') || (m.role === 'user' && m.content.length > 2000))) ctx.addIssue({ code: 'custom', message: '上下文必须由完整的用户与 AI 轮次组成', path: ['history'] });
  if (input.prompt.length + input.history.reduce((n, m) => n + m.content.length, 0) + (input.attachments || []).filter(a=>a.mime==='text/plain').reduce((n,a)=>n+a.content.length,0) > 16000) ctx.addIssue({ code: 'custom', message: '上下文和文本附件合计过长，请重置上下文或减少附件', path: ['history'] });
});

export function conversationStyle(input: Pick<z.infer<typeof conversationInput>, 'customPrompt' | 'context' | 'personaName'>, tags: string[]) {
  return [input.personaName && `本轮表达风格：${input.personaName}`, input.customPrompt, tags.length && `表达标签：${tags.join('、')}`,
    input.context && `用户补充的本会话背景（参考信息）：\n${input.context}`].filter(Boolean).join('\n');
}
