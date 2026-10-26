import React, { useEffect, useRef, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { generatePersona } from '../services/personaGeneration';
import type { PersonaCard } from '../services/persona';
import { colors, ui } from '../design';
import { Action } from './Ui';

export function PersonaGenerator({ onGenerated, onClose }: { onGenerated: (card: PersonaCard) => void; onClose: () => void }) {
  const [requirements, setRequirements] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const request = useRef<AbortController | null>(null), alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; request.current?.abort(); request.current = null; }; }, []);
  function stop() { const previous = request.current; request.current = null; previous?.abort(); setBusy(false); setError('已停止，需求保留，可手动重新生成。'); }
  async function generate() {
    if (request.current || !requirements.trim()) return;
    const controller = new AbortController(); request.current = controller; setBusy(true); setError('');
    try { const card = await generatePersona(requirements, controller.signal); if (alive.current && request.current === controller && !controller.signal.aborted) onGenerated(card); }
    catch (e) { if (alive.current && request.current === controller && !controller.signal.aborted) setError(e instanceof Error ? e.message : '生成失败，请手动重试'); }
    finally { if (request.current === controller) { request.current = null; if (alive.current) setBusy(false); } }
  }
  return <View style={ui.card}>
    <Text accessibilityRole="header" style={ui.heading}>AI 帮你创建人设</Text>
    <Text style={ui.note}>描述你想要的说话风格，生成后可预览修改。</Text>
    <Text style={ui.label}>你想要什么样的人设？ · {requirements.length}/800</Text>
    <TextInput accessibilityLabel="AI 人设需求" multiline editable={!busy} value={requirements} maxLength={800} onChangeText={setRequirements} placeholder="例如：职场沟通，礼貌有边界，回复简短，不随便承诺。" placeholderTextColor={colors.muted} style={[ui.input, { minHeight: 100, textAlignVertical: 'top' }]} />
    {!!error && <Text accessibilityRole="alert" style={{ ...ui.note, color: colors.danger }}>{error}</Text>}
    <Text style={ui.note}>生成会发送这段需求并使用 AI 额度。保存后与键盘共用。</Text>
    <Action label={busy ? '停止生成' : '生成人设草稿'} loading={busy} disabled={!busy && !requirements.trim()} onPress={() => busy ? stop() : void generate()} />
    <Action secondary label="返回人设中心" onPress={() => { request.current?.abort(); request.current = null; onClose(); }} />
  </View>;
}
