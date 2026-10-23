import { readCompletionStream } from '../stream.js';
import { attachmentContent, type AIAttachment } from '../attachments.js';
import { BaseAIProvider } from './base.js';
import type { AIProviderConfig } from '../../../db/schema.js';

export class AIUpstreamError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
    this.name = 'AIUpstreamError';
  }
}

/** Accept a vendor base URL or the complete Chat Completions URL. */
export function completionEndpoint(baseUrl = 'https://api.openai.com/v1'): string {
  let url: URL;
  try { url = new URL(baseUrl.trim()); }
  catch { throw new AIUpstreamError('API 地址格式不正确'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new AIUpstreamError('API 地址仅支持 HTTP/HTTPS，不能包含账号、查询参数或锚点');
  }
  let path = url.pathname.replace(/\/+$/, '');
  if (!path) path = '/v1';
  if (!path.endsWith('/chat/completions')) path += '/chat/completions';
  url.pathname = path;
  return url.toString();
}

type GenerateParams = {
  attachments?: AIAttachment[];
  intent?: 'reply' | 'topic' | 'chat';
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  signal?: AbortSignal;
  onDelta?: (text: string) => void | Promise<void>;
  text: string; stylePrompt?: string; temperature: number;
  maxTokens: number; candidateCount: number; model: string;
};

/** Real JSON and streaming OpenAI-compatible Chat Completions provider. */
export class OpenAIProvider extends BaseAIProvider {
  readonly type = 'openai' as const;
  readonly name = 'OpenAI compatible';
  protected defaultModel = 'gpt-4o-mini';

  validateConfig(config: AIProviderConfig): boolean {
    if (!super.validateConfig(config) || !config.apiKey?.trim()) return false;
    try { completionEndpoint(config.baseUrl); return true; } catch { return false; }
  }

  protected async _generate(params: GenerateParams) {
    const count = params.intent === 'chat' ? 1 : Math.max(1, Math.min(5, Math.trunc(params.candidateCount)));
    const system = params.intent === 'chat' ? [
      '你是聊商 AI 对话助手，直接与当前用户连续交谈。结合此前的 user/assistant 消息回答当前问题，承认不确定的信息。',
      '所选人设只决定你的表达风格。你是 AI，不要冒充真人，不替用户给第三方写候选回复，不虚构共同经历。',
      '默认使用中文，回答清楚自然，不输出候选 JSON 数组。',
      params.stylePrompt || '',
    ].filter(Boolean).join('\n') : [
      params.intent === 'topic'
        ? '你是聊天话题助手。根据用户选择的人设、关系、场景和自填背景，替用户主动发起一个轻松自然、容易接话的话题。只输出可以直接发送的开场白。'
        : '你是聊天回复助手。根据对方消息和上下文，替用户写出可以直接发送的回复。',
      '保持自然、简洁，不要添加解释、角色名称或“回复如下”。没有其他语言要求时使用中文。',
      params.stylePrompt ? `回复风格和要求：${params.stylePrompt}` : '',
      count > 1
        ? `给出 ${count} 条不同措辞的候选回复，只输出一个包含 ${count} 个非空字符串的 JSON 数组，不要 Markdown。`
        : '只输出一条回复正文。',
    ].filter(Boolean).join('\n');
    params.signal?.throwIfAborted();
    const controller = new AbortController();
    const abort = () => controller.abort(params.signal?.reason);
    params.signal?.addEventListener('abort', abort, { once: true });
    const timeout = Math.min(120000, Math.max(1000, this.config.timeout ?? 60000));
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const tokenParameter = this.config.tokenParameter ?? 'max_tokens';
      const response = await fetch(completionEndpoint(this.config.baseUrl), {
        method: 'POST',
        redirect: 'error',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.config.apiKey!.trim()}` },
        body: JSON.stringify({
          model: params.model,
          messages: [{ role: 'system', content: system }, ...(params.intent === 'chat' ? params.history ?? [] : []), { role: 'user', content: params.intent === 'chat' ? attachmentContent(params.text, params.attachments) : params.text }],
          stream: !!params.onDelta,
          ...(this.config.sendTemperature === false ? {} : { temperature: params.temperature }),
          [tokenParameter]: params.maxTokens * count,
        }),
      });
      if (!response.ok) {
        await response.body?.cancel();
        const messages: Record<number, string> = {
          400: '请求参数或模型不兼容，请检查模型名称及高级参数',
          401: 'API 密钥无效或已过期',
          402: 'AI 账户余额不足，请检查服务商账户',
          403: 'API 没有访问权限，请检查密钥权限或服务商访问限制',
          404: 'API 路径或模型不存在，请检查地址和模型名称',
          429: 'AI 服务限流或额度不足，请检查账户额度后重试',
        };
        throw new AIUpstreamError(`AI 服务返回 HTTP ${response.status}：${messages[response.status] ?? '服务暂不可用，请稍后重试'}`, response.status);
      }
      if (params.onDelta && response.headers.get('content-type')?.includes('text/event-stream')) {
        if (!response.body) throw new AIUpstreamError('AI 服务返回空流');
        const result = await readCompletionStream(response.body, params.onDelta, controller.signal);
        return { replies: [{ id: this.generateReplyId(), content: result.text, style: params.stylePrompt }], tokensUsed: result.tokensUsed, metadata: { model: params.model, apiVersion: 'chat-completions-stream' } };
      }
      // Limit response size and keep the same abort deadline while reading it.
      const reader = response.body?.getReader();
      if (!reader) throw new AIUpstreamError('AI 服务返回了空响应');
      const chunks: Uint8Array[] = [];
      let bytes = 0;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > 1024 * 1024) {
          await reader.cancel();
          throw new AIUpstreamError('AI 响应超过大小限制');
        }
        chunks.push(value);
      }
      let body: any;
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
      catch { throw new AIUpstreamError('AI 返回的不是有效 JSON，请检查 API 地址是否为兼容接口'); }
      const choice = body?.choices?.[0];
      if (choice?.finish_reason === 'length') {
        throw new AIUpstreamError('AI 回复被长度限制截断，请减少候选数量或更换模型');
      }
      const content = choice?.message?.content;
      if (typeof content !== 'string' || !content.trim()) {
        throw new AIUpstreamError('AI 没有返回有效回复，模型可能拒绝了请求或接口格式不兼容');
      }
      if (params.intent === 'chat' && content.trim().length > 10000) throw new AIUpstreamError('AI 回答过长，请缩小问题范围后手动重试');
      let contents: string[] = [content.trim()];
      if (count > 1) {
        let parsed: unknown;
        try { parsed = JSON.parse(content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')); }
        catch { throw new AIUpstreamError('模型未返回有效的候选列表，请尝试单条回复或更换模型'); }
        if (!Array.isArray(parsed) || parsed.length !== count || !parsed.every(v => typeof v === 'string' && v.trim())) {
          throw new AIUpstreamError('模型返回的候选数量或内容不正确，请尝试单条回复');
        }
        contents = parsed.map(v => (v as string).trim());
      }
      if (params.onDelta) await params.onDelta(content.trim());
      return {
        replies: contents.map(content => ({ id: this.generateReplyId(), content, style: params.stylePrompt })),
        tokensUsed: typeof body.usage?.total_tokens === 'number' ? body.usage.total_tokens : undefined,
        metadata: { model: typeof body.model === 'string' ? body.model : params.model, apiVersion: 'chat-completions' },
      };
    } catch (error) {
      if (error instanceof AIUpstreamError) throw error;
      if (params.signal?.aborted) throw params.signal.reason;
      if (controller.signal.aborted) throw new AIUpstreamError(`AI 请求超时（${timeout / 1000} 秒），请稍后重试或调整超时设置`);
      // Do not expose vendor bodies, URLs with credentials, headers, or raw fetch errors.
      throw new AIUpstreamError('无法连接 AI 服务，请检查 API 地址和服务器网络（不支持重定向）');
    } finally {
      clearTimeout(timer);
      params.signal?.removeEventListener('abort', abort);
    }
  }
}
