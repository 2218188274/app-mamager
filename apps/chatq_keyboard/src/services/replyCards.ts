export type ReplyVersion = { text: string; label: string };
export type ReplyCard = ReplyVersion & { versions: ReplyVersion[] };
export type Refinement = 'shorter' | 'natural';
export const refinementLabels = { shorter: '更简短', natural: '更自然' };
export function replyCards(texts: string[], label: string): ReplyCard[] { return texts.map(text => ({ text, label, versions: [] })); }
export function reviseReply(card: ReplyCard, text: string, mode: Refinement): ReplyCard {
  if (!text.trim() || text.length > 1000) throw new Error('改写结果不完整，请重试');
  if (text.trim() === card.text) return card;
  return { text: text.trim(), label: refinementLabels[mode] + ' · ' + card.label.replace(/^(更简短|更自然) · /, ''), versions: [...card.versions, { text: card.text, label: card.label }].slice(-4) };
}
export function previousReply(card: ReplyCard): ReplyCard {
  const previous = card.versions.at(-1); return previous ? { ...previous, versions: card.versions.slice(0, -1) } : card;
}
export function refinementInstruction(mode: Refinement): string {
  return (mode === 'shorter' ? '把这句回复改得更简短，保留主要意思和必要事实。' : '把这句回复改得更自然口语化，避免模板腔，保留原意和事实。') + '只输出改写后的句子，不回答这句话，不编造新事实。';
}
