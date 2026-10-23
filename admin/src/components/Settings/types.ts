/**
 * 设置表单类型定义
 */

/** 设置项类型 */
export type SettingsItemType = 'text' | 'number' | 'toggle' | 'select' | 'textarea' | 'custom'

/** 设置项配置 */
export interface SettingsItem {
  /** 唯一标识 */
  key: string
  /** 显示标签 */
  label: string
  /** 字段类型 */
  type: SettingsItemType
  /** 占位符 */
  placeholder?: string
  /** 是否禁用 */
  disabled?: boolean
  /** 是否必填 */
  required?: boolean
  /** 帮助文本 */
  tooltip?: string
  /** 选择项选项（select 类型用） */
  options?: { label: string; value: string | number }[]
  /** 自定义组件（custom 类型用） */
  component?: React.ComponentType<any>
  /** 额外属性 */
  [key: string]: any
}

/** 设置分区配置 */
export interface SettingsSection {
  /** Configuration keys owned by a custom section. */
  keys?: string[]
  /** 分区标题 */
  section: string
  /** 分区描述 */
  description?: string
  /** 设置项列表 */
  items?: SettingsItem[]
  /** 自定义渲染（替代 items） */
  type?: 'custom'
  /** 自定义组件 */
  component?: React.ComponentType<any>
}

/** 设置表单配置 */
export interface SettingsConfig {
  /** Bundle ID */
  bundleId: string
  /** 显示名称 */
  displayName: string
  /** 设置分区列表 */
  settings: SettingsSection[]
}

/** SettingsForm 组件属性 */
export interface SettingsFormProps {
  /** 配置 */
  config: SettingsConfig
  /** 表单数据 */
  values?: Record<string, any>
  /** 加载状态 */
  loading?: boolean
  /** 保存中状态 */
  saving?: boolean
  /** 值变化回调 */
  onChange?: (values: Record<string, any>) => void
  /** 保存回调 */
  onSave?: (values: Record<string, any>) => void
}
