import data from '../data/topics.json';
export type Topic = { id: string; title: string; opener: string; followUp: string };
export const topicCategories: { id: string; name: string; topics: Topic[] }[] = data.categories;
/** Stable pages avoid immediate repeats; browsing never calls a provider. */
export function topicBatch(category: string, page: number, size = 3): Topic[] {
  const items = topicCategories.find(c => c.id === category)?.topics || topicCategories[0].topics;
  return Array.from({ length: Math.min(size, items.length) }, (_, i) => items[(Math.max(0, page) * size + i) % items.length]);
}
