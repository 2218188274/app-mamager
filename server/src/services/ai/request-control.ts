import { createHash } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { TRPCError } from '@trpc/server';

/** The response closing early also covers proxies and fully uploaded POST bodies. */
export function requestAbortSignal(req: IncomingMessage, res: ServerResponse): AbortSignal {
  const controller = new AbortController();
  const abort = () => controller.abort();
  const close = () => { if (!res.writableFinished) abort(); cleanup(); };
  const cleanup = () => { req.off('aborted', abort); res.off('close', close); res.off('finish', cleanup); };
  req.once('aborted', abort); res.once('close', close); res.once('finish', cleanup);
  if (req.aborted || (res.destroyed && !res.writableFinished)) { abort(); cleanup(); }
  return controller.signal;
}

export function requireActiveAIUser(user: { status: string } | undefined) {
  if (!user) throw new TRPCError({ code: 'UNAUTHORIZED', message: '用户不存在' });
  if (user.status !== 'active') throw new TRPCError({ code: 'FORBIDDEN', message: '当前用户已停用或尚未启用，无法使用 AI' });
}

/** Bounded replay protection stores hashes only, never prompts or replies. */
export class GenerationClaims {
  private claims = new Map<string, number>();
  constructor(private ttl = 15 * 60 * 1000, private capacity = 10000) {}
  claim(app: string, user: string, id: string | undefined, now = Date.now()) {
    if (!id) return; // Compatibility with previously released clients.
    if (!/^[a-zA-Z0-9_-]{16,80}$/.test(id)) throw new TRPCError({code:'BAD_REQUEST',message:'请求编号格式异常'});
    for (const [key, expires] of this.claims) if (expires <= now) this.claims.delete(key);
    const key = createHash('sha256').update(JSON.stringify([app,user,id])).digest('hex');
    if (this.claims.has(key)) throw new TRPCError({code:'CONFLICT',message:'此请求已处理或已取消，请查看记录；重新生成请发起新请求'});
    if (this.claims.size >= this.capacity) throw new TRPCError({code:'TOO_MANY_REQUESTS',message:'生成服务繁忙，请稍后重试'});
    this.claims.set(key, now + this.ttl);
  }
}
export const generationClaims = new GenerationClaims();
