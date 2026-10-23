/**
 * ChatQ Keyboard 设置页面入口
 * com.jaxon.chatqkeyboard 专属配置页面
 */
import { useState, useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Card, Empty, Spin, message, Alert } from 'antd'
import PageHeader from '@/components/PageHeader'
import { SettingsForm } from '@/components/Settings'
import { chatqConfig } from './config'
import { useAppStore } from '@/stores/appStore'
import { trpc } from '@/utils/trpc'

interface ChatqSettingsPageProps {
  /** 从设置入口传入的 appId（从应用管理跳转时首帧即有，避免无网络请求） */
  appIdFromParent?: string
}

export default function ChatqSettingsPage({ appIdFromParent }: ChatqSettingsPageProps = {}) {
  const { appId: appIdFromParams } = useParams<{ templateId?: string; appId?: string }>()
  const { apps, currentAppId: currentAppIdFromStore } = useAppStore()
  // 优先使用父级传入的 appId（从应用管理跳转时保证首帧有值），再 store，再 URL
  const currentAppId = appIdFromParent || currentAppIdFromStore || appIdFromParams || null
  const currentApp = apps.find((a) => a.id === currentAppId)

  const [formValues, setFormValues] = useState<Record<string, any>>({})
  const [saving, setSaving] = useState(false)

  // tRPC - 获取应用配置
  const settingsQuery = trpc.settings.app.useQuery(
    { appId: currentAppId! },
    { enabled: !!currentAppId }
  )

  // tRPC - 更新应用配置
  const updateSettingsMutation = trpc.settings.updateApp.useMutation({
    onSuccess: () => {
      message.success('配置已保存')
      settingsQuery.refetch()
    },
    onError: (error) => {
      message.error(error.message || '保存失败')
    },
    onSettled: () => {
      setSaving(false)
    },
  })

  // 加载配置数据，并合并当前应用的 appName / bundleId，使「基础信息」与所选 app 一致
  useEffect(() => {
    const data = settingsQuery.data
    if (!data) return
    const base = (data.settings && typeof data.settings === 'object') ? { ...data.settings } : {}
    setFormValues({
      ...base,
      appName: data.appName ?? currentApp?.name ?? '',
      bundleId: data.bundleId ?? currentApp?.bundleId ?? '',
    })
  }, [settingsQuery.data, currentApp?.name, currentApp?.bundleId])

  // 保存配置
  const handleSave = (values: Record<string, any>) => {
    setSaving(true)

    updateSettingsMutation.mutate({
      appId: currentAppId!,
      ...values,
    })
  }

  // 加载中
  if (settingsQuery.isLoading) {
    return (
      <div>
        <PageHeader
          title="ChatQ Keyboard 设置"
          breadcrumbs={[{ title: '设置' }, { title: 'ChatQ' }]}
        />
        <Card style={{ borderRadius: 12 }}>
          <div style={{ textAlign: 'center', padding: 40 }}>
            <Spin />
          </div>
        </Card>
      </div>
    )
  }

  // 无 appId（如从错误链接进入）才提示选择应用；有 appId 无 currentApp 时仍展示表单（如从应用管理跳转时 store 未同步）
  if (!currentAppId) {
    return (
      <div>
        <PageHeader
          title="ChatQ Keyboard 设置"
          breadcrumbs={[{ title: '设置' }, { title: 'ChatQ' }]}
        />
        <Card style={{ borderRadius: 12 }}>
          <Empty description="请先选择一个应用" />
        </Card>
      </div>
    )
  }

  const displaySubtitle = currentApp ? `${currentApp.icon} ${currentApp.name} 的专属配置` : '当前应用的专属配置'

  return (
    <div>
      <PageHeader
        title="ChatQ Keyboard 设置"
        subtitle={displaySubtitle}
        breadcrumbs={[{ title: '设置' }, { title: 'ChatQ' }]}
      />

      <Alert
        message="专属配置"
        description="以下配置仅对 ChatQ Keyboard 应用生效"
        type="info"
        showIcon
        className="mb-4"
      />

      <Alert type="info" showIcon className="mb-4" title="AI 接口配置" description={<Link to="/settings/system" onClick={() => useAppStore.getState().setCurrentApp(currentAppId)}>配置 API 地址、密钥和模型，体验真实聊天回复 →</Link>} />

      <SettingsForm
        config={chatqConfig}
        values={formValues}
        loading={settingsQuery.isLoading}
        saving={saving}
        onSave={handleSave}
        onChange={(values) => setFormValues(values)}
      />
    </div>
  )
}
