export type MarkdownBlock = { kind: 'paragraph' | 'heading' | 'quote' | 'list' | 'code' | 'rule'; text: string; level?: number; language?: string };
export type InlinePart = { text: string; kind?: 'bold' | 'italic' | 'code' | 'strike' | 'link'; url?: string };

// Native Text only: no HTML, remote images, WebView, scripts or automatic network requests.
export function safeLink(value: string): string | null {
  if (value.length > 2048 || /[\s\u0000-\u001f\u007f]/.test(value)) return null;
  try { const u = new URL(value); return ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password && !!u.hostname ? u.toString() : null; } catch { return null; }
}
export function markdownBlocks(value: string): MarkdownBlock[] {
  if (value.length > 10000) return [{ kind: 'paragraph', text: value }];
  const lines = value.replace(/\r\n/g, '\n').split('\n'), out: MarkdownBlock[] = [];
  let buffer: string[] = [];
  const flush = () => { if (buffer.length) { out.push({ kind: 'paragraph', text: buffer.join('\n') }); buffer = []; } };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i], fence = /^ {0,3}(`{3,}|~{3,})([\w+-]{0,30})\s*$/.exec(line);
    if (fence) {
      flush(); const code: string[] = [], end = new RegExp('^ {0,3}' + fence[1][0] + '{' + fence[1].length + ',}\\s*$');
      while (++i < lines.length && !end.test(lines[i])) code.push(lines[i]);
      out.push({ kind: 'code', text: code.join('\n'), language: fence[2] }); continue;
    }
    if (!line.trim()) { flush(); continue; }
    const h = /^(#{1,6})\s+(.+)$/.exec(line), q = /^>\s?(.*)$/.exec(line), li = /^\s{0,6}([-+*]|\d{1,5}[.)])\s+(.+)$/.exec(line);
    if (/^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/.test(line)) { flush(); out.push({ kind: 'rule', text: '' }); }
    else if (h) { flush(); out.push({ kind: 'heading', text: h[2], level: h[1].length }); }
    else if (q) { flush(); out.push({ kind: 'quote', text: q[1] }); }
    else if (li) { flush(); out.push({ kind: 'list', text: (/^\d/.test(li[1]) ? li[1] : '•') + ' ' + li[2] }); }
    else buffer.push(line);
    if (out.length > 300) return [{ kind: 'paragraph', text: value }];
  }
  flush(); return out;
}
export function markdownInline(value: string): InlinePart[] {
  const out: InlinePart[] = [], pattern = /(`+)([^`\n]+)\1|\*\*([^*\n]+)\*\*|__([^_\n]+)__|~~([^~\n]+)~~|(!?)\[([^\]\n]{1,200})\]\(([^)\n]{1,2048})\)|\*([^*\n]+)\*/g;
  let start = 0, match: RegExpExecArray | null;
  while ((match = pattern.exec(value)) && out.length < 200) {
    if (match.index > start) out.push({ text: value.slice(start, match.index) });
    if (match[1]) out.push({ text: match[2], kind: 'code' });
    else if (match[3] || match[4]) out.push({ text: match[3] || match[4], kind: 'bold' });
    else if (match[5]) out.push({ text: match[5], kind: 'strike' });
    else if (match[7]) { const url = match[6] ? null : safeLink(match[8]); out.push(url ? { text: match[7], kind: 'link', url } : { text: match[0] }); }
    else out.push({ text: match[9], kind: 'italic' });
    start = match.index + match[0].length;
  }
  if (start < value.length) out.push({ text: value.slice(start) });
  return out;
}
