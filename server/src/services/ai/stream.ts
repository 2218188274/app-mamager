import { AIUpstreamError } from './providers/openai.js';

/** Bounded UTF-8 SSE reader; only validated answer deltas reach the client. */
export async function readCompletionStream(body: ReadableStream<Uint8Array>, onDelta: (text: string) => void | Promise<void>, signal: AbortSignal) {
  const reader = body.getReader(), decoder = new TextDecoder('utf-8', { fatal: true });
  let buffer = '', text = '', bytes = 0, finished = false, ended = false, tokensUsed: number | undefined;
  async function frame(raw: string) {
    const data = raw.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).replace(/^ /, '')).join('\n');
    if (!data || ended) return;
    if (data === '[DONE]') { ended = true; return; }
    let event: any; try { event = JSON.parse(data); } catch { throw new AIUpstreamError('AI 流数据格式异常，请手动重试'); }
    if (event.error) throw new AIUpstreamError('AI 流式服务返回错误，请检查后台配置');
    if (typeof event.usage?.total_tokens === 'number' && Number.isFinite(event.usage.total_tokens)) tokensUsed = event.usage.total_tokens;
    const choice = event.choices?.find((c: any) => c.index === 0 || c.index === undefined);
    if (choice?.finish_reason === 'length') throw new AIUpstreamError('AI 回答被截断，请缩小问题范围后手动重试');
    if (choice?.finish_reason) { if (choice.finish_reason !== 'stop') throw new AIUpstreamError('AI 未正常完成回答'); finished = true; }
    const delta = choice?.delta?.content;
    if (delta !== undefined && delta !== null && typeof delta !== 'string') throw new AIUpstreamError('AI 流式回答格式不兼容');
    if (delta) {
      if (text.length + delta.length > 10000) throw new AIUpstreamError('AI 回答过长，请缩小问题范围');
      text += delta; await onDelta(delta); signal.throwIfAborted();
    }
  }
  try {
    while (!ended) {
      signal.throwIfAborted(); const part = await reader.read();
      if (part.done) { buffer += decoder.decode(); break; }
      bytes += part.value.length; if (bytes > 1024 * 1024) throw new AIUpstreamError('AI 流响应超过大小限制');
      buffer += decoder.decode(part.value, { stream: true });
      // Preserve a trailing CR until the next packet arrives.
      buffer = buffer.replace(/\r\n/g, '\n');
      let end: number;
      while ((end = buffer.indexOf('\n\n')) >= 0) { const raw = buffer.slice(0, end); buffer = buffer.slice(end + 2); await frame(raw); }
      if (buffer.length > 65536) throw new AIUpstreamError('AI 流数据帧过大');
    }
    if (buffer.trim() && !ended) await frame(buffer.replace(/\r\n/g, '\n'));
    if ((!finished && !ended) || !text.trim()) throw new AIUpstreamError('AI 连接提前结束，未完成内容没有加入上下文');
    return { text: text.trim(), tokensUsed };
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
