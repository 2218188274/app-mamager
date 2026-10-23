import React, { useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { colors, ui } from '../design';
import { CopyAction, PageIntro } from './Ui';
import { version } from '../../package.json';

const questions = [
  ['如何添加附件和切换回答版本？', '对话输入框左侧＋可主动选择图片、PDF（500KB内）或 UTF-8 文本，每次最多2个附件、文本合计12000字，只有点击发送才交给后台 AI。图片/PDF需要所选模型支持，不支持 Word/Excel。重新生成保留最近4个成功回答，点击“回答版本”可比较和切换，切换不消耗 AI 额度。编辑历史问题会保留原会话并另开分支，在设置中可查看分支。'],
  ['如何在两台设备间同步对话？', '对话设置 → 加密会话同步，创建空间后先保存恢复同步码；另一台设备连接同一服务器和完整同步码，再点“立即同步会话”。草稿、附件、背景和回答版本在本机加密上传，冲突保留副本，不自动删除另一端内容。同步码丢失无法恢复，人设卡配置请另用加密备份，套餐额度不跨设备迁移。'],
  ['怎样和 AI 连续聊天？', '底部“AI 对话”是独立 AI 聊天。选择表达风格、补充背景后发送，AI 仅使用本会话最近最多 10 轮与本次输入（合计最多 16000 字）。可关闭或重置上下文，或开始新对话。人设选择仅影响当前会话，不改键盘默认人设；成功回答共用 AI 额度。会话默认只保存在本机，可在会话列表继续或删除，并纳入安卓加密备份。可在对话设置中主动开启同步码加密同步。'],
  ['取消生成还会消耗额度吗？', '取消会停止本机等待，并通过连接中断通知后台尽力停止模型请求。后台在取消生效前尚未完成的请求不计成功额度；已经完成的请求或服务商已产生的费用不能撤回。不会自动重试，再次点击生成属于新请求。'],
  ['怎样切换九宫格、主题和常用词？', '在“我的 → 调整键盘布局与高度”里设置。键盘工具栏点“更多”可直接切换九宫格、按键高度和底部留白；默认舒适留白让按键离手机底部更远。常用短语可用简拼添加，例如 ls → 聊商。'],
  ['不知道聊什么，在哪里找话题？', '在“发现”中按分类找开场白，点“怎么接着聊”看后续提示。安卓聊天键盘里点“AI 助手 → 找话题”。离线库不消耗 AI 额度；收藏可在主应用与安卓键盘互通。'],
  ['怎样让回复更像我？', '在“发现 → 人设管理”编辑自己的表达习惯，再选择与谁聊、当前场景。“帮回复 → 回复偏好”可切换人设、语气，并补充背景和目标；每次生成会使用当前选择。'],
  ['AI 提示连接失败或额度不足？', '先在“我的 → AI 连接”确认服务器连接。连接成功表示应用服务器可访问，模型服务仍可能单独失败。检查后台的模型配置和每日额度，确认后手动重试；不会自动重复付费请求。'],
  ['语音为什么需要麦克风？', '在安卓键盘里选择语音，授权麦克风后主动录音，最长 20 秒。识别需要连接服务器；识别后先预览，点插入才会填入原输入框。切换输入框或会话过期时需重新录制。'],
  ['回复会直接发送给对方吗？', '不会。候选词、回复和话题都需要你点选才填入输入框；请确认内容后在聊天应用里自行发送。AI 内容可能有误，注意语气和事实。'],
  ['iPhone 现在可以安装吗？', 'iPhone 工程已准备，仍需要 Mac、Xcode 和 Apple 开发者签名完成编译与真机验证，当前提供的是安卓安装包。'],
];
export function HelpPanel({ connected }: { connected: boolean }) {
  const [expanded, setExpanded] = useState<number | null>(0);
  const diagnostics = ['聊商使用反馈', '版本：' + version, '平台：' + Platform.OS + ' ' + String(Platform.Version), '应用服务器连接：' + (connected ? '本次已连接' : '本次未连接'), '问题发生在哪个页面或应用：', '操作步骤：', '预期结果 / 实际结果：'].join('\n');
  return <>
    <PageIntro title="使用帮助与隐私" note="把输入用顺手，也清楚哪些内容会联网。" />
    <View style={ui.card}><Text style={ui.heading}>常见问题</Text>
      {questions.map(([title, answer], i) => <View key={title} style={{ borderTopWidth: i ? 1 : 0, borderColor: colors.border }}>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: expanded === i }} onPress={() => setExpanded(expanded === i ? null : i)} style={{ minHeight: 52, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Text style={[ui.label, { flex: 1 }]}>{title}</Text><Text style={ui.selectedText}>{expanded === i ? '−' : '＋'}</Text>
        </Pressable>{expanded === i && <Text style={[ui.text, { paddingBottom: 14 }]}>{answer}</Text>}
      </View>)}
    </View>
    <View style={ui.card}><Text accessibilityRole="header" style={ui.heading}>数据与隐私说明</Text>
      <Text style={ui.text}>离线输入：拼音、九宫格、英文纠错、联想和话题库可在本机使用。人设、收藏、常用词、独立 AI 会话和两端共用的生成记录保存在本机。记录页可关闭保存或清空；备份恢复可导出密码加密文件，连接码和设备身份不会写入备份。</Text>
      <Text style={ui.text}>AI 生成：只有主动点生成时，才将本次消息或背景、所选人设与关系场景提交到服务器；独立 AI 对话还会携带本会话最近的上下文（可以关闭或重置），并由后台配置的模型提供商处理。请勿填写密码、验证码等敏感信息。</Text>
      <Text style={ui.text}>可选联网：云词库开启后会将当前拼音提交到服务器查询；语音识别会上传你主动录制的音频。剪贴板只在你点“粘贴”时读取，不在后台持续读取聊天或剪贴板。</Text>
      <Text style={ui.note}>当前为服务器 IP 的 HTTP 内部测试连接，尚未启用 HTTPS。正式使用仍需配置域名、HTTPS 与正式签名；本说明是当前功能的数据流说明。</Text>
    </View>
    <View style={ui.card}><Text style={ui.heading}>反馈问题</Text><Text style={ui.note}>复制模板，补上问题步骤后发给开发者。模板不包含连接码、设备标识、聊天记录或 API 密钥。</Text><CopyAction text={diagnostics} label="复制问题反馈模板" /></View>
  </>;
}
