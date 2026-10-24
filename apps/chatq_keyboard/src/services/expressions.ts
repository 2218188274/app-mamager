export type Expression = { id: string; text: string; label: string; group: 'happy' | 'love' | 'mood' | 'hello' | 'kaomoji' };
export const expressionGroups = [{ id: 'all', name: '全部' }, { id: 'happy', name: '开心' }, { id: 'love', name: '关心' }, { id: 'mood', name: '心情' }, { id: 'hello', name: '日常' }, { id: 'kaomoji', name: '颜文字' }];
const groups: [Expression['group'], string[][]][] = [
  ['happy', [['😀','开心'],['😄','大笑'],['😂','笑哭'],['🤣','笑翻'],['😊','微笑'],['😎','酷'],['🥳','庆祝'],['🎉','礼花']]],
  ['love', [['🥰','喜欢'],['😍','心动'],['😘','亲亲'],['🤗','抱抱'],['❤️','爱心'],['💕','两颗心'],['🌹','玫瑰'],['💗','心意']]],
  ['mood', [['🥺','委屈'],['😭','哭泣'],['😅','尴尬'],['🤔','思考'],['🙃','无奈'],['😴','困了'],['😤','生气'],['🤭','偷笑']]],
  ['hello', [['👋','你好'],['👍','点赞'],['👌','好的'],['🙏','谢谢'],['👏','鼓掌'],['💪','加油'],['☕','咖啡'],['✅','收到']]],
  ['kaomoji', [['(｡･ω･｡)ﾉ♡','打招呼'],['(づ｡◕‿‿◕｡)づ','抱抱'],['(๑•̀ㅂ•́)و✧','加油'],['ヾ(≧▽≦*)o','开心'],['(•̀ᴗ•́)و','没问题'],['(｡•́︿•̀｡)','委屈'],['( ˘ω˘ )','晚安'],['(人´∀`)','谢谢']]],
];
export const expressions: Expression[] = groups.flatMap(([group, values]) => values.map(([text,label],i) => ({ id: `${group}-${i}`, text, label, group })));
export function findExpressions(query: string, group = 'all') {
  const needle = query.trim().toLocaleLowerCase();
  return expressions.filter(item => (group === 'all' || item.group === group) && (item.label + item.text).toLocaleLowerCase().includes(needle));
}
export function appendExpression(text: string, expression: string): string {
  if (!expressions.some(item => item.text === expression)) throw new Error('请选择表情库中的表情');
  const value = text.trim() + ' ' + expression;
  if (value.length > 1000) throw new Error('这句已接近 1000 字，无法再加表情');
  return value;
}
