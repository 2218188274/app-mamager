import { TRPCError } from '@trpc/server';

/** Scoped rollout: other applications and historical subscriptions remain untouched. */
export function personalApiMode(appId: string): boolean {
  return (process.env.CHATQ_PERSONAL_API_APP_IDS || '').split(',').map(id => id.trim()).filter(Boolean).includes(appId);
}
export function requirePlatformAi(appId: string) {
  if (personalApiMode(appId)) throw new TRPCError({ code: 'PRECONDITION_FAILED', message: '聊商已改为免费自备 API 模式，请更新安卓安装包，在“我的 → 我的 API”配置自己的 API。' });
}
export function requirePaidMode(appId: string) {
  if (personalApiMode(appId)) throw new TRPCError({ code: 'PRECONDITION_FAILED', message: '当前为免费自备 API 模式，无需购买会员，暂不创建新支付订单。' });
}
