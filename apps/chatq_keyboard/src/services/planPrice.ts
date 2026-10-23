/** Display malformed legacy plan data without crashing or inventing a currency. */
export function formatPlanPrice(priceCents: unknown, currency: unknown): string {
  if (typeof priceCents !== 'number' || !Number.isSafeInteger(priceCents) || priceCents < 0) return '价格待确认';
  const amount = (priceCents / 100).toFixed(2);
  const code = typeof currency === 'string' ? currency.trim().toUpperCase() : '';
  if (!/^[A-Z]{3}$/.test(code)) return amount + '（币种待确认）';
  try { return new Intl.NumberFormat('zh-CN', { style: 'currency', currency: code }).format(priceCents / 100); }
  catch { return code + ' ' + amount; }
}
