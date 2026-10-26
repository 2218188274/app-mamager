export type ReplyVersion = { text: string; label: string };
export type ReplyCard = ReplyVersion & { versions: ReplyVersion[] };
export const refinementLabels = { shorter: '更简短', natural: '更自然', formal: '更书面', translate_zh: '译成中文', translate_en: '译成英文' } as const;
export type Refinement = keyof typeof refinementLabels;
export const refinementNotes: Record<Refinement, string> = { shorter: '减少赘述，保留重点', natural: '像日常聊天一样表达', formal: '适合工作沟通与正式表达', translate_zh: '保留名称、数字和事实', translate_en: '保留名称、数字和事实' };
export function replyCards(texts: string[], label: string): ReplyCard[] { return texts.map(text => ({ text, label, versions: [] })); }
export function reviseReply(card: ReplyCard, text: string, mode: Refinement): ReplyCard {
  if (!text.trim() || text.length > 1000) throw new Error('改写结果不完整，请重试');
  if (text.trim() === card.text) return card;
  return { text: text.trim(), label: refinementLabels[mode] + ' · ' + card.label.replace(/^(更简短|更自然|更书面|译成中文|译成英文) · /, ''), versions: [...card.versions, { text: card.text, label: card.label }].slice(-4) };
}
export function previousReply(card: ReplyCard): ReplyCard {
  const previous = card.versions.at(-1); return previous ? { ...previous, versions: card.versions.slice(0, -1) } : card;
}
export function decorateReply(card: ReplyCard, text: string): ReplyCard {
  if (!text.trim() || text.length > 1000) throw new Error('回复最多 1000 字');
  if (text === card.text) return card;
  return { text, label: card.label, versions: [...card.versions, { text: card.text, label: card.label }].slice(-4) };
}
export function refinementInstruction(mode: Refinement): string {
  const task: Record<Refinement, string> = {
    shorter: '把这句回复改得更简短，保留主要意思和必要事实。',
    natural: '把这句回复改得更自然口语化，避免模板腔，保留原意和事实。',
    formal: '把这句回复改为清晰得体的书面表达，保留原意和事实，不增加承诺。',
    translate_zh: '将这段文字翻译成简体中文，保留原意、专有名称、数字和事实。不要应用与翻译冲突的人设风格。',
    translate_en: 'Translate the text into natural English, preserving names, numbers, meaning and facts. Ignore persona style instructions that conflict with translation.',
  };
  return task[mode] + '只输出处理后的句子，不回答这句话，不编造新事实。';
}
