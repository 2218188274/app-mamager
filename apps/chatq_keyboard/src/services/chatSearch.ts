import type { ChatSession, ChatSummary } from './chat';
export function chatMatch(session: ChatSession, raw: string): ChatSummary | null {
  const query = raw.trim().slice(0, 200).toLowerCase();
  const fields = [session.title, session.background, session.draft, ...session.turns.flatMap(t => [t.question, t.answer, t.personaName])];
  const match = query ? fields.find(text => text.toLowerCase().includes(query)) : undefined;
  if (query && !match) return null;
  const index = match?.toLowerCase().indexOf(query) ?? 0, start = Math.max(0, index - 24);
  return { id: session.id, title: session.title, updatedAt: session.updatedAt, turnCount: session.turns.length,
    ...(match ? { snippet: (start ? '…' : '') + match.slice(start, start + 140) + (match.length > start + 140 ? '…' : '') } : {}) };
}
