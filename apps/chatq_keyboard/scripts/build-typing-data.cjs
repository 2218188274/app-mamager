// Rebuild only from the checked-in, attributed source datasets; no network at build time.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const root = path.join(__dirname, '..');
const vendor = path.join(root, 'modules/chatq-keyboard/vendor/typing');
const assets = path.join(root, 'modules/chatq-keyboard/android/src/main/assets');
fs.mkdirSync(assets, { recursive: true });
const base = new Map();
const syllables = new Map();
for (const line of fs.readFileSync(path.join(vendor, 'pinyin_simp.dict.yaml'), 'utf8').split(/\r?\n/)) {
  const [text, spelling, weight] = line.split('\t');
  const code = spelling?.replace(/[ '\t]/g, '');
  if (!text || !/^[\u3400-\u9fff]{1,12}$/.test(text) || !/^[a-z]{1,39}$/.test(code || '')) continue;
  base.set(`${code}\t${text}`, Number(weight) || 0);
  syllables.set(`${code}\t${text}`, spelling.trim().replace(/ +/g, ' '));
}
const serialize = map => [...map].sort((a,b) => b[1] - a[1] || a[0].localeCompare(b[0], 'en')).map(([key,weight]) => `${key}\t${weight}`).join('\n') + '\n';
fs.writeFileSync(path.join(assets, 'nine-pinyin.tsv'), [...base].sort((a,b) => b[1] - a[1] || a[0].localeCompare(b[0], 'en')).map(([key,weight]) => `${key}\t${weight}\t${syllables.get(key)}`).join('\n') + '\n');
const chat = fs.readFileSync(path.join(root, 'data/chat-phrases.tsv'), 'utf8').split(/\r?\n/).filter(line => line && !line.startsWith('#')).map(line => {
  const [text, spelling, weight] = line.split('\t');
  if (!/^[\u3400-\u9fff]{1,12}$/.test(text) || !/^[a-z]+(?: [a-z]+)*$/.test(spelling || '') || spelling.replaceAll(' ', '').length > 39 || !(Number(weight) > 0)) throw new Error(`Invalid chat phrase: ${text}`);
  return `${spelling.replaceAll(' ', '')}\t${text}\t${weight}\t${spelling}`;
});
fs.writeFileSync(path.join(assets, 'chat-phrases.tsv'), chat.join('\n') + '\n');
fs.copyFileSync(path.join(root, 'data/chat-associations.tsv'), path.join(assets, 'chat-associations.tsv'));
// Freeze the shared indexes at build time: no 65k-word sorting on the keyboard thread.
const digitCode = code => code.replace(/[a-c]/g,'2').replace(/[d-f]/g,'3').replace(/[g-i]/g,'4').replace(/[j-l]/g,'5').replace(/[m-o]/g,'6').replace(/[p-s]/g,'7').replace(/[t-v]/g,'8').replace(/[w-z]/g,'9');
const merged = new Map([...base].map(([key,weight]) => [key, {code:key.split('\t')[0],text:key.split('\t')[1],weight,reading:syllables.get(key),chat:false}]));
for (const line of chat) {
  const [code,text,weight,reading] = line.split('\t'), key = `${code}\t${text}`;
  merged.set(key,{code,text,weight:Math.max(Number(weight),merged.get(key)?.weight ?? 0),reading,chat:true});
}
const compare = (a,b) => a < b ? -1 : a > b ? 1 : 0;
const entries = [...merged.values()].sort((a,b) => b.weight-a.weight || compare(a.text,b.text));
entries.forEach(entry => entry.digits = digitCode(entry.code));
const chunks = [], int = value => { const b=Buffer.alloc(4);b.writeUInt32BE(value);chunks.push(b); };
const string = value => { const b=Buffer.from(value,'utf8'), length=Buffer.alloc(2);length.writeUInt16BE(b.length);chunks.push(length,b); };
int(0x43514431);int(entries.length);
for (const entry of entries) { string(entry.code);string(entry.text);int(entry.weight);string(entry.reading);string(entry.digits);chunks.push(Buffer.from([entry.chat?1:0])); }
for (const key of ['digits','text']) entries.map((_,i)=>i).sort((a,b)=>compare(entries[a][key],entries[b][key]) || entries[b].weight-entries[a].weight || compare(entries[a].text,entries[b].text)).forEach(int);
fs.writeFileSync(path.join(assets,'chinese-index.bin'),Buffer.concat(chunks));
const english = fs.readFileSync(path.join(vendor, 'english-frequency.txt'), 'utf8').split(/\r?\n/).map(line => line.split(' ')).filter(([word, weight]) => /^[a-z]+(?:'[a-z]+)?$/.test(word || '') && word.length <= 30 && Number(weight) > 0);
fs.writeFileSync(path.join(assets, 'english-frequency.tsv'), english.map(([word, weight]) => `${word}\t${weight}`).join('\n') + '\n');
const notice = `ChatQ typing data\n\nOffline Chinese dictionary derived from rime/rime-pinyin-simp at 0c6861ef7420ee780270ca6d993d18d4101049d0. Source: https://github.com/rime/rime-pinyin-simp (originally AOSP PinyinIME). Apache-2.0; converted to normalized spelling/word/frequency TSV with original syllable boundaries. Chat phrase and association supplements were authored for ChatQ in data/chat-phrases.tsv and data/chat-associations.tsv.\n\nEnglish frequency data from Hermit Dave / FrequencyWords at 525f9b560de45753a5ea01069454e72e9aa541c6, content/2018/en/en_50k.txt, derived from OpenSubtitles 2018. https://github.com/hermitdave/FrequencyWords . Content licensed CC BY-SA 4.0: https://creativecommons.org/licenses/by-sa/4.0/ . Converted to lowercase alphabetic/contraction TSV; this derived data remains CC BY-SA 4.0. This license applies to the dataset, independent of the application source.\n`;
fs.writeFileSync(path.join(assets, 'typing-NOTICE.txt'), notice);
fs.copyFileSync(path.join(vendor, 'Rime-APACHE-2.0.txt'), path.join(assets, 'typing-APACHE-2.0.txt'));
fs.copyFileSync(path.join(vendor, 'CC-BY-SA-4.0.txt'), path.join(assets, 'typing-CC-BY-SA-4.0.txt'));
const hashes = Object.fromEntries(['nine-pinyin.tsv','chat-phrases.tsv','chat-associations.tsv','chinese-index.bin','english-frequency.tsv'].map(file => [file, crypto.createHash('sha256').update(fs.readFileSync(path.join(assets,file))).digest('hex')]));
fs.writeFileSync(path.join(assets, 'typing-data.json'), JSON.stringify({ version: '20261021.2', nineEntries: base.size, chatEntries: chat.length, englishEntries: english.length, hashes }, null, 2));
const cloudDir = path.join(root, '../../server/data/input');
if (!process.argv.includes('--offline') && fs.existsSync(path.join(cloudDir, 'cedict-source.txt.gz'))) {
  const cloud = new Map(base);
  const source = zlib.gunzipSync(fs.readFileSync(path.join(cloudDir, 'cedict-source.txt.gz'))).toString('utf8');
  for (const line of source.split('\n')) {
    const match = line.match(/^\S+ ([\u3400-\u9fff]{1,12}) \[([^\]]+)\]/);
    if (!match) continue;
    const code = match[2].toLowerCase().replace(/u:|ü/g, 'v').replace(/[1-5 '\t]/g, '');
    if (/^[a-z]{1,39}$/.test(code) && !cloud.has(`${code}\t${match[1]}`)) cloud.set(`${code}\t${match[1]}`, 1);
  }
  const additions = [['大语言模型','dayuyanmoxing'],['生成式人工智能','shengchengshirengongzhineng'],['人工智能助手','rengongzhinengzhushou'],['多模态','duomotai'],['提示词','tishici'],['短视频','duanshipin'],['直播带货','zhibodaihuo'],['数字人','shuziren'],['智能体','zhinengti'],['聊商','liaoshang'],['九宫格','jiugongge'],['语音输入','yuyinshuru'],['云词库','yunciku'],['自动纠错','zidongjiucuo'],['新能源汽车','xinnengyuanqiche'],['低空经济','dikongjingji'],['情绪价值','qingxujiazhi']];
  for (const [text,code] of additions) cloud.set(`${code}\t${text}`, 10000);
  fs.writeFileSync(path.join(cloudDir,'cloud-lexicon.tsv'), serialize(cloud));
  fs.writeFileSync(path.join(cloudDir,'NOTICE.txt'), notice + '\nCloud additions derived from CC-CEDICT / MDBG, downloaded 2026-10-21. https://www.mdbg.net/chinese/dictionary?page=cc-cedict . Licensed CC BY-SA 4.0; normalized simplified Chinese spelling pairs with tone numbers removed and modern ChatQ vocabulary added. The derived cloud dataset is CC BY-SA 4.0.\n');
  fs.copyFileSync(path.join(vendor,'CC-BY-SA-4.0.txt'), path.join(cloudDir,'CC-BY-SA-4.0.txt'));
  fs.writeFileSync(path.join(cloudDir,'manifest.json'), JSON.stringify({version:'20261021.1',entries:cloud.size,sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(cloudDir,'cloud-lexicon.tsv'))).digest('hex')},null,2));
  console.log(`Cloud dictionary: ${cloud.size} entries`);
}
console.log(`Offline nine-key: ${base.size}; English: ${english.length}`);
