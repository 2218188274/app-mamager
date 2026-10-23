/** Keep native module wrappers out of user-facing errors. */
export function displayError(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  const value = error.message.split('→ Caused by: ').pop()?.trim() || '';
  return !value || /Failed requirement|java\.|kotlin\.|Call to function/.test(value) ? fallback : value;
}
