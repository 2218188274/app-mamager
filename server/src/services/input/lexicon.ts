import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

export const toDigits = (code: string) => code.replace(/[a-c]/g, '2').replace(/[d-f]/g, '3').replace(/[g-i]/g, '4').replace(/[j-l]/g, '5').replace(/[m-o]/g, '6').replace(/[p-s]/g, '7').replace(/[t-v]/g, '8').replace(/[w-z]/g, '9');
type Word = { text: string; pinyin: string; weight: number };
export class CloudLexicon {
  private full = new Map<string, Word[]>();
  private nine = new Map<string, Word[]>();
  readonly version: string;
  readonly entries: number;
  constructor(content: string) {
    this.version = createHash('sha256').update(content).digest('hex').slice(0, 16);
    let entries = 0;
    for (const line of content.split('\n')) {
      const [pinyin, text, frequency] = line.split('\t');
      if (!/^[a-z]{1,39}$/.test(pinyin || '') || !/^[\u3400-\u9fff]{1,12}$/.test(text || '')) continue;
      const word = { pinyin, text, weight: Number(frequency) || 1 };
      for (const [index, key] of [[this.full,pinyin], [this.nine,toDigits(pinyin)]] as const) {
        const values = index.get(key) || []; values.push(word); index.set(key, values);
      }
      entries++;
    }
    this.entries = entries;
    for (const index of [this.full,this.nine]) for (const [key, values] of index) index.set(key, values.sort((a,b) => b.weight - a.weight).slice(0, 32));
  }
  lookup(code: string, layout: 'qwerty' | 'nine') {
    const key = code.replace(/'/g, '');
    return ((layout === 'nine' ? this.nine : this.full).get(key) || []).slice(0, 12).map(({text,pinyin}) => ({text,pinyin,consumed:code.length}));
  }
}
let dictionary: CloudLexicon | undefined;
export function getCloudLexicon() {
  if (!dictionary) dictionary = new CloudLexicon(readFileSync(process.env.CHATQ_LEXICON_FILE || 'data/input/cloud-lexicon.tsv', 'utf8'));
  return dictionary;
}
