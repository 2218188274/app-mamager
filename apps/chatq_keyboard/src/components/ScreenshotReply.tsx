import React, { useState } from 'react';
import { Image, Modal, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Attachment } from '../services/chat';
import type { ScreenshotSide } from '../services/screenshotReply';
import { Action } from './Ui';
import { colors, ui } from '../design';
export function ScreenshotReply({ image, side, busy, onPick, onRemove, onSide }: { image: Attachment | null; side: ScreenshotSide; busy: boolean; onPick: () => void; onRemove: () => void; onSide: (side: ScreenshotSide) => void }) {
  const [preview, setPreview] = useState(false), [ratio, setRatio] = useState(2);
  const { width, fontScale } = useWindowDimensions();
  return <View style={{ gap: 10 }}><Action secondary label={image ? '重新选择截图' : '选择聊天截图'} disabled={busy} onPress={onPick} />
    {image && <><Pressable accessibilityRole="button" accessibilityLabel="放大预览截图" onPress={() => setPreview(true)} style={{ borderRadius: 12, overflow: 'hidden', backgroundColor: colors.background }}><Image source={{ uri: image.content }} resizeMode="contain" onLoad={event => { const { width, height } = event.nativeEvent.source; if (width > 0 && height > 0) setRatio(height / width); }} style={{ width: '100%', height: fontScale >= 1.5 ? 130 : 180 }} /><Text style={[ui.note, { textAlign: 'center', padding: 8 }]}>点开检查截图内容</Text></Pressable>
    <Text style={ui.label}>要回复的对方在哪一侧？</Text><View style={[ui.row, { flexWrap: 'wrap' }]}>{(['left','right'] as const).map(value => <Action key={value} label={value === 'left' ? '对方在左侧' : '对方在右侧'} secondary={value !== side} disabled={busy} onPress={() => onSide(value)} />)}</View>
    <Text style={ui.note}>生成时才将此图发送给你的 API。请先遮挡姓名、头像等隐私；长截图建议裁剪到相关消息。需要支持图片理解的模型。</Text><Action secondary label="移除截图" disabled={busy} onPress={onRemove} /></>}
    <Modal visible={preview && !!image} animationType="slide" onRequestClose={() => setPreview(false)}><SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}><View style={[ui.between, { padding: 16 }]}><Text style={ui.heading}>检查截图</Text><Action secondary label="返回编辑" onPress={() => setPreview(false)} /></View><ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}><Text style={ui.note}>不合适就返回重选。预览不会调用 AI。</Text>{image && <Image source={{ uri: image.content }} resizeMode="contain" style={{ width: Math.max(200, width - 32), height: Math.max(180, (width - 32) * ratio) }} />}</ScrollView></SafeAreaView></Modal>
  </View>;
}
