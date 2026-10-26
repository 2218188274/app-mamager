/**
 * Clipboard Tool 设置页面入口
 * com.jaxon.clipboardtool 专属配置页面
 */
import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { Card, Empty, Spin, message, Alert } from 'antd'
import PageHeader from '@/components/PageHeader'
import { SettingsForm } from '@/components/Settings'
import { clipboardConfig } from './config'
import { useAppStore } from '@/stores/appStore'
import { trpc } from '@/utils/trpc'

interface ClipboardSettingsPageProps {
  appIdFromParent?: string
}

export default function ClipboardSettingsPage({ appIdFromParent }: ClipboardSettingsPageProps = {}) {
  const { appId: appIdFromParams } = useParams<{ appId?: string; templateId?: string }>()
  const { apps, currentAppId: currentAppIdFromStore } = useAppStore()
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
    const base: Record<string, unknown> = (data.settings && typeof data.settings === 'object') ? { ...data.settings } : {}
    setFormValues({
      ...base,
      appName: (data as { appName?: string }).appName ?? currentApp?.name ?? base.appName,
      bundleId: (data as { bundleId?: string }).bundleId ?? currentApp?.bundleId ?? base.bundleId,
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

  // 路由参数中的 bundleId 与当前 app 不匹配（仅当有 currentApp 时校验）
  const bundleId = currentApp?.bundleId
  if (bundleId && bundleId !== 'com.jaxon.clipboardtool') {
    return (
      <div>
        <PageHeader
          title="应用设置"
          subtitle="应用配置不匹配"
          breadcrumbs={[{ title: '应用设置' }]}
        />
        <Alert
          message="配置错误"
          description="当前应用的 bundleId 与配置不匹配"
          type="error"
          showIcon
        />
      </div>
    )
  }

  // 加载中
  if (settingsQuery.isLoading) {
    return (
      <div>
        <PageHeader
          title="Clipboard Tool 设置"
          breadcrumbs={[{ title: '设置' }, { title: 'Clipboard Tool' }]}
        />
        <Card style={{ borderRadius: 12 }}>
          <div style={{ textAlign: 'center', padding: 40 }}>
            <Spin />
          </div>
        </Card>
      </div>
    )
  }

  // 无 appId 才提示选择应用；有 appId 无 currentApp 时仍展示表单（如从应用管理跳转时 store 未同步）
  if (!currentAppId) {
    return (
      <div>
        <PageHeader
          title="Clipboard Tool 设置"
          breadcrumbs={[{ title: '设置' }, { title: 'Clipboard Tool' }]}
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
        title="Clipboard Tool 设置"
        subtitle={displaySubtitle}
        breadcrumbs={[{ title: '设置' }, { title: 'Clipboard Tool' }]}
      />

      <Alert
        message="专属配置"
        description="以下配置仅对 Clipboard Tool 应用生效"
        type="info"
        showIcon
        className="mb-4"
      />

      <SettingsForm
        config={clipboardConfig}
        values={formValues}
        loading={settingsQuery.isLoading}
        saving={saving}
        onSave={handleSave}
        onChange={(values) => setFormValues(values)}
      />
    </div>
  )
}
