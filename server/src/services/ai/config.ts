import type { AIProviderConfig, AppSettings } from '../../db/schema.js';

/** AI credentials are write-only in all administration responses. */
export function redactAISettings<T extends AppSettings | null | undefined>(settings: T): T {
  if (!settings) return settings;
  const safe = { ...settings };
  delete safe.apiKey;
  if (settings.aiProviders) safe.aiProviders = settings.aiProviders.map(({ apiKey: _key, ...provider }) => provider);
  return safe as T;
}

/** Legacy settings forms receive redacted keys; blank edits must not erase them. */
export function mergeAIProviders(incoming: AIProviderConfig[], previous: AIProviderConfig[] = []): AIProviderConfig[] {
  return incoming.map(provider => ({
    ...previous.find(p => p.type === provider.type),
    ...provider,
    apiKey: provider.apiKey?.trim() || previous.find(p => p.type === provider.type)?.apiKey,
  }));
}
