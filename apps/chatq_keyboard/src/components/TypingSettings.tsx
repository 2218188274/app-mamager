import React, { useEffect, useRef, useState } from 'react';
import { Alert, AppState, Linking, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { keyboardBridge } from '../../modules/chatq-keyboard';
import { colors, ui } from '../design';
import { Action } from './Ui';
type Preferences = { haptic: boolean; sound: boolean; numberRow: boolean; learning: boolean; chinese: boolean; cloudWords: boolean; englishCorrection: boolean; predictions: boolean; layout: 'qwerty' | 'nine'; bottomSpace: 'low' | 'normal' | 'high'; height: 'compact' | 'normal' | 'large'; theme: 'system' | 'light' | 'dark' };
type Word = { pinyin: string; text: string; count: number; manual: boolean };
const errorText = (e: unknown) => e instanceof Error ? e.message : '操作失败，请重试';
export function TypingSettings() {
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [words, setWords] = useState<Word[]>([]);
  const [pinyin, setPinyin] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('');
  const [loadError,setLoadError] = useState('');
  const alive=useRef(true), revision=useRef(0), lock=useRef(false);
  async function load() {
    const ticket=++revision.current;
    try {
    if (!keyboardBridge?.getTypingPreferences || !keyboardBridge.listUserWords) throw new Error('请安装新版安卓安装包后打开设置');
    const [config, list] = await Promise.all([keyboardBridge.getTypingPreferences(), keyboardBridge.listUserWords()]);
    if(alive.current&&ticket===revision.current){setPreferences(JSON.parse(config));setWords(JSON.parse(list));setLoadError('');}
    } catch(e) {if(alive.current&&ticket===revision.current)throw e;}
  }
  async function refresh() {if(lock.current)return;try {await load();}catch(e){if(alive.current)setLoadError(errorText(e));}}
  useEffect(() => {
    alive.current=true;void refresh();
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') void refresh(); });
    return () => { alive.current=false;revision.current++;subscription.remove(); };
  }, []);
  async function save(patch: Partial<Preferences>) {
    if (!keyboardBridge?.saveTypingPreferences || lock.current) return;
    lock.current=true;revision.current++;setBusy(true);
    try { const value=JSON.parse(await keyboardBridge.saveTypingPreferences(JSON.stringify(patch)));if(alive.current){setPreferences(value);setLoadError('');} }
    catch (e) { if(alive.current)Alert.alert('保存失败', errorText(e)); } finally { lock.current=false;if(alive.current)setBusy(false); }
  }
  async function add() {
    if (!keyboardBridge?.addUserWord || lock.current) return;
    if (!/^[a-zA-Z']{1,39}$/.test(pinyin.trim()) || !pinyin.replace(/'/g, '').trim()) { Alert.alert('请填写 1–39 个拼音字母，可使用简拼'); return; }
    if (!text.trim() || text.trim().length > 60 || /[\r\n\t]/.test(text)) { Alert.alert('请填写 1–60 个字符的词语或短语，不支持换行'); return; }
    lock.current=true;revision.current++;setBusy(true);
    try { await keyboardBridge.addUserWord(pinyin.trim(), text.trim());if(!alive.current)return;setPinyin('');setText('');await load();if(alive.current)Alert.alert('已添加', '在中文模式输入这个拼音码，即可选到你的词语。'); }
    catch (e) { if(alive.current)Alert.alert('添加失败', errorText(e)); } finally { lock.current=false;if(alive.current)setBusy(false); }
  }
  async function changeWords(action:()=>Promise<void>,label:string) {
    if(lock.current||!alive.current)return;lock.current=true;revision.current++;setBusy(true);
    try {await action();if(alive.current)await load();}catch(e){if(alive.current)Alert.alert(label,errorText(e));}
    finally {lock.current=false;if(alive.current)setBusy(false);}
  }
  function remove(word: Word) {
    Alert.alert('删除常用词', `删除“${word.text}”（${word.pinyin}）？`, [{ text: '取消', style: 'cancel' }, { text: '删除', style: 'destructive', onPress: () => { void changeWords(()=>keyboardBridge!.removeUserWord!(word.pinyin,word.text),'删除失败'); } }]);
  }
  const button = (label: string, action: () => void) => <Pressable accessibilityRole="button" disabled={busy} onPress={action} style={[s.button, busy && { opacity: 0.5 }]}><Text style={s.buttonText}>{label}</Text></Pressable>;
  const search = filter.trim().toLowerCase();
  const filteredWords = words.filter(w => w.text.toLowerCase().includes(search) || w.pinyin.includes(search));
  return <>
    <Text style={s.title}>安卓键盘偏好</Text><Text style={s.note}>设置保存在本机，下次打开键盘时生效。日常拼音和常用词无需联网。</Text>
    {!!loadError&&<View style={ui.card}><Text accessibilityRole="alert" style={[ui.note,{color:colors.danger}]}>{loadError}</Text><Action secondary label="重新读取键盘设置" disabled={busy} onPress={()=>void refresh()}/></View>}
    {preferences && <View style={s.card}>
      <Text style={s.label}>中文布局</Text><View style={s.row}>{([['qwerty', '全键盘拼音'], ['nine', '九宫格拼音']] as const).map(([id, label]) => <Pressable disabled={busy} key={id} accessibilityRole="button" accessibilityState={{ selected: preferences.layout === id, disabled: busy }} style={[s.chip, preferences.layout === id && s.selected]} onPress={() => void save({ layout: id })}><Text>{label}</Text></Pressable>)}</View>
      <Text style={s.label}>按键高度</Text><View style={s.row}>{([['compact', '紧凑'], ['normal', '标准'], ['large', '大键']] as const).map(([id, label]) => <Pressable disabled={busy} key={id} accessibilityRole="button" accessibilityState={{ selected: preferences.height === id, disabled: busy }} style={[s.chip, preferences.height === id && s.selected]} onPress={() => void save({ height: id })}><Text>{label}</Text></Pressable>)}</View>
      <Text style={s.label}>底部留白 · 把键盘往上移</Text><Text style={s.note}>默认舒适高度，避开底部手势区。可在键盘「更多」里随时调整。</Text><View style={s.row}>{([['low', '较低'], ['normal', '舒适'], ['high', '较高']] as const).map(([id, label]) => <Pressable disabled={busy} key={id} accessibilityRole="button" accessibilityState={{ selected: preferences.bottomSpace === id, disabled: busy }} style={[s.chip, preferences.bottomSpace === id && s.selected]} onPress={() => void save({ bottomSpace: id })}><Text style={s.label}>{label}</Text></Pressable>)}</View>
      <Text style={s.label}>键盘主题</Text><View style={s.row}>{([['system', '跟随系统'], ['light', '浅色'], ['dark', '深色']] as const).map(([id, label]) => <Pressable disabled={busy} key={id} accessibilityRole="button" accessibilityState={{ selected: preferences.theme === id, disabled: busy }} style={[s.chip, preferences.theme === id && s.selected]} onPress={() => void save({ theme: id })}><Text>{label}</Text></Pressable>)}</View>
      {([['haptic', '按键震动'], ['sound', '按键音'], ['numberRow', '字母键盘顶部数字行'], ['learning', '记住选词习惯'], ['predictions', '选词后显示本地联想'], ['chinese', '普通输入框默认中文'], ['englishCorrection', '英文空格自动纠错'], ['cloudWords', '云词库（需联网）']] as const).map(([id, label]) => <View style={s.row} key={id}><Text style={[s.label, { flex: 1 }]}>{label}</Text><Switch accessibilityLabel={label} disabled={busy} value={preferences[id]} trackColor={{ false: '#D3D7E4', true: '#B6A6E6' }} thumbColor={preferences[id] ? colors.primary : '#FFF'} onValueChange={value => void save({ [id]: value })} /></View>)}
      <Text style={s.note}>声音和震动同时遵循手机系统设置。密码框和禁止个性化的输入框不记词。</Text>
      <Text style={s.note}>本地联想只根据本次在键盘中选过的词给出短语续写，点击才填入，空格仍输入空格。不自动读取聊天或剪贴板，断网可用；移动光标或切换输入框后清除联想上下文。简拼示例：wzdl → 我知道了，mwt → 没问题。</Text>
      <Text style={s.note}>云词库默认关闭；开启后仅发送正在输入的拼音码或九宫格数字，不发送聊天内容。英文纠错在输入空格时生效，紧接着退格可撤销；长按“原文”可记住专有词。语音从键盘顶部“语音”进入，录音仅在点击识别后发送至服务器。</Text>
    </View>}
    <View style={s.card}><Text style={s.title}>添加自定义常用词</Text><Text style={s.note}>姓名、新词或常用短语都可以。例如：拼音码 ls → 聊商，dz → 你的常用地址。最多 300 个词条。</Text>
      <TextInput accessibilityLabel="常用词拼音码" autoCorrect={false} autoCapitalize="none" maxLength={39} style={s.input} placeholderTextColor={colors.muted} placeholder="拼音码，例如 liaoshang 或 ls" value={pinyin} onChangeText={setPinyin} editable={!busy} />
      <TextInput accessibilityLabel="常用词内容" maxLength={60} style={s.input} placeholderTextColor={colors.muted} placeholder="希望输入的词语或短语" value={text} onChangeText={setText} editable={!busy} />
      {button(busy ? '保存中…' : '添加常用词', () => void add())}
    </View>
    <Text style={s.title}>本机词库 · {words.length}/300</Text><Text style={s.note}>自动记忆仅保存主动选中的短词及拼音码，不保存整段聊天或剪贴板。自定义词在关闭自动记词后仍可使用。</Text>
    <TextInput accessibilityLabel="搜索常用词" style={s.input} placeholderTextColor={colors.muted} placeholder="搜索词语或拼音码" value={filter} onChangeText={setFilter} />
    {filteredWords.slice(0, 100).map(word => <View key={`${word.pinyin}:${word.text}`} style={s.word}><View style={{ flex: 1 }}><Text style={s.label}>{word.text}</Text><Text style={s.note}>{word.pinyin} · {word.manual ? '自定义' : '已记住选词'}</Text></View><Pressable accessibilityRole="button" accessibilityLabel={`删除常用词${word.text}`} disabled={busy} onPress={() => remove(word)}><Text style={s.link}>删除</Text></Pressable></View>)}
    {!!words.length && !filteredWords.length && <Text style={s.note}>没有找到匹配的词语，换个关键词试试。</Text>}
    {filteredWords.length > 100 && <Text style={s.note}>已显示前 100 条，请输入关键词查找其余词语。</Text>}
    {!words.length && <Text style={s.note}>还没有常用词。可手动添加，也可在键盘中选择拼音候选。</Text>}
    {!!words.length && button('清空本机词库', () => Alert.alert('清空本机词库', '将删除全部自定义词和选词记忆，此操作不能撤销。', [{ text: '取消', style: 'cancel' }, { text: '清空', style: 'destructive', onPress: () => { void changeWords(()=>keyboardBridge!.clearUserWords!(),'清空失败'); } }]))}
    <Text style={s.note}>词库来源：AOSP / Rime 简体拼音（Apache 2.0）；FrequencyWords 英文频率、CC-CEDICT 云词库（CC BY-SA 4.0）。词库经过拼音归一化、过滤和合并，原始数据、修改说明及完整许可证随项目源码提供。语音识别使用 Whisper.cpp（MIT），模型为多语言 base 量化版。</Text>
    {([['Rime 拼音词库', 'https://github.com/rime/rime-pinyin-simp'], ['FrequencyWords 英文词库', 'https://github.com/hermitdave/FrequencyWords'], ['CC-CEDICT 云端词库', 'https://www.mdbg.net/chinese/dictionary?page=cc-cedict'], ['Apache 2.0 许可证', 'https://www.apache.org/licenses/LICENSE-2.0'], ['CC BY-SA 4.0 许可证', 'https://creativecommons.org/licenses/by-sa/4.0/']] as const).map(([label, url]) => <Pressable accessibilityRole="link" key={url} onPress={() => void Linking.openURL(url).catch(() => Alert.alert('无法打开链接', url))}><Text style={s.link}>{label}</Text></Pressable>)}
  </>;
}
const s = StyleSheet.create({
  card: ui.card, title: ui.heading, note: ui.note, label: ui.label, row: { flexDirection: 'row', flexWrap: 'wrap', minHeight: 48, justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  chip: { ...ui.chip, flexGrow: 1 }, selected: ui.selected, input: ui.input,
  button: { minHeight: 50, backgroundColor: colors.primary, padding: 14, borderRadius: 13, alignItems: 'center', justifyContent: 'center' }, buttonText: { color: '#FFF', fontSize: 15, lineHeight: 22, fontWeight: '700' },
  word: { ...ui.card, flexDirection: 'row', gap: 8, alignItems: 'center' }, link: { color: colors.primary, padding: 12, minHeight: 48, minWidth: 48, textAlignVertical: 'center' },
});
