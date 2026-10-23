/**
 * ChatQ Keyboard 专属配置定义
 * 定义该 App 的配置项和业务逻辑
 */
import type { SettingsConfig } from '@/components/Settings/types'
import { ChatqFeaturePanel } from './components/ChatqFeaturePanel'
import { ChatqStylesPanel } from './components/ChatqStylesPanel'

/**
 * ChatQ 配置 Schema
 */
export const chatqConfig: SettingsConfig = {
  bundleId: 'com.jaxon.chatqkeyboard',
  displayName: 'ChatQ Keyboard',
  settings: [
    {
      section: '基础信息',
      description: 'App 的基本信息配置',
      items: [
        {
          key: 'appName',
          type: 'text',
          label: '应用名称',
          placeholder: '请输入应用名称',
        },
        {
          key: 'bundleId',
          type: 'text',
          label: 'Bundle ID',
          disabled: true,
          tooltip: 'iOS 应用唯一标识符，不可修改',
        },
      ],
    },
    {
      section: '功能配置',
      description: 'ChatQ 核心功能开关',
      type: 'custom',
      component: ChatqFeaturePanel,
      // 对应的配置 key，用于保存到服务器
      keys: ['enableCustomReply', 'enableKeywordReply', 'enableQuickPhrases', 'enableContextAware', 'enableAISmartAdjust'],
    },
    {
      section: '回复风格',
      description: '配置 AI 回复风格',
      type: 'custom',
      component: ChatqStylesPanel,
      // 对应的配置 key，用于保存到服务器
      keys: ['enabledStyles'],
    },
    {
      section: '配额限制',
      description: '用户使用配额配置',
      items: [
        {
          key: 'freeReplyLimitPerDay',
          type: 'number',
          label: '免费版日配额',
          placeholder: '每日免费回复次数',
          tooltip: '免费用户每天可使用的 AI 回复次数',
        },
        {
          key: 'dailyGenerationLimit',
          type: 'number',
          label: '每日生成上限',
          placeholder: '每日 AI 生成次数',
          tooltip: '所有用户每天的 AI 生成次数限制',
        },
        {
          key: 'maxPersonaCards',
          type: 'number',
          label: '人设卡片数量上限',
          placeholder: '0 表示不限',
          tooltip: '单用户可创建的人设卡片数量上限，0 表示不限制',
        },
      ],
    },
    {
      section: '高级设置',
      description: '高级功能配置',
      items: [
        {
          key: 'enableCloudSync',
          type: 'toggle',
          label: '启用云同步',
          tooltip: '允许用户同步个人词库和设置到云端',
        },
        {
          key: 'enableAnalytics',
          type: 'toggle',
          label: '启用数据分析',
          tooltip: '收集使用数据以优化产品',
        },
      ],
    },
  ],
}

export default chatqConfig
