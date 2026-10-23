import type { ChatSession, ChatTurn } from './chat';

function pattern(query: string, global = false): RegExp | null {
  const value = query.trim().slice(0, 200);
  return value ? new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), global ? 'giu' : 'iu') : null;
}
export function findChatTurns(session: ChatSession, query: string): ChatTurn[] {
  const test = pattern(query);
  return test ? session.turns.filter(turn => test.test(turn.question) || test.test(turn.answer)) : session.turns;
}
export function chatHighlights(text: string, query: string): { text: string; match: boolean }[] {
  const test = pattern(query, true);
  if (!test) return [{ text, match: false }];
  const parts: { text: string; match: boolean }[] = []; let at = 0, count = 0;
  for (const match of text.matchAll(test)) {
    if (count++ >= 80) break;
    if (match.index > at) parts.push({ text: text.slice(at, match.index), match: false });
    parts.push({ text: match[0], match: true }); at = match.index + match[0].length;
  }
  if (at < text.length || !parts.length) parts.push({ text: text.slice(at), match: false });
  return parts;
}
export const hasTemporaryChat = (session: ChatSession, unsaved: boolean) => unsaved && !!(session.draft || session.turns.length || session.attachments?.length || session.background || session.personaId || session.title !== '新对话');
