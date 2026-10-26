import { sendChat } from './api';
import type { PersonaCard } from './persona';

export function parseGeneratedPersona(response: string): PersonaCard {
  const invalid = () => new Error('AI 返回的人设格式不完整，请重新生成；现有人设未修改。');
  let value: Record<string, unknown>;
  try { value = JSON.parse(response.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')); } catch { throw invalid(); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid();
  const text = (key: string, max: number) => {
    const item = value[key];
    if (typeof item !== 'string' || !item.trim() || item.trim().length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(item)) throw invalid();
    return item.trim();
  };
  const name = text('name', 20), instructions = text('instructions', 300), example = text('example', 120);
  if (!['short', 'normal', 'detailed'].includes(String(value.length)) || !['daily', 'warm', 'funny', 'work', 'custom'].includes(String(value.category))) throw invalid();
  return { id: `ai-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`, name, instructions, example, length: value.length as PersonaCard['length'], category: value.category as string, tagWeights: {} };
}

export async function generatePersona(requirements: string, signal: AbortSignal): Promise<PersonaCard> {
  const content = requirements.trim();
  if (!content || content.length > 800) throw new Error('请用 1–800 字描述你想要的人设');
  const response = await sendChat({
    personaName: '人设卡片设计师', history: [], context: '',
    customPrompt: '根据用户的需求设计聊天表达风格，不扮演该角色。只返回一个 JSON 对象，无代码围栏或额外说明。字段：name（1–20字）、instructions（1–300字，具体说话习惯与边界）、example（1–120字的一句风格示例）、length（short/normal/detailed）、category（daily/warm/funny/work/custom）。不输出 id、标签权重、账号信息。不得凭空编造用户的个人经历。',
    prompt: `请根据以下需求生成一张可编辑的人设卡片：\n${content}`,
  }, signal);
  if (signal.aborted) { const error = new Error('已取消生成'); error.name = 'AbortError'; throw error; }
  return parseGeneratedPersona(response);
}
