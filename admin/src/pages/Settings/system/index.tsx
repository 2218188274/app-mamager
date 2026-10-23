import { useState } from 'react'
import { Tabs, Select, Empty, message } from 'antd'
import PageHeader from '@/components/PageHeader'
import AIConfig from './AIConfig'
import PaymentConfig from './PaymentConfig'
import { useAppStore } from '@/stores/appStore'

export default function SettingsSystemPage() {
  const [activeTab, setActiveTab] = useState('ai')
  const { apps, currentAppId, setCurrentApp } = useAppStore()
  const app = apps.find(a => a.id === currentAppId)
  return <div>
    <PageHeader title="系统配置" subtitle="为应用配置 AI 接口，在线测试聊天回复" breadcrumbs={[{ title: '设置' }, { title: '系统配置' }]} />
    <div style={{ marginBottom: 20 }}>
      <span style={{ marginRight: 12 }}>当前应用</span>
      <Select aria-label="当前应用" style={{ minWidth: 240 }} value={app?.id} onChange={setCurrentApp} options={apps.map(a => ({ value: a.id, label: a.name }))} placeholder="选择应用" />
    </div>
    {!app ? <Empty description="请先创建或选择应用" /> : <Tabs activeKey={activeTab} onChange={setActiveTab} type="card" items={[
      { key: 'ai', label: 'AI 配置与试聊', children: <AIConfig key={app.id} appId={app.id} /> },
      { key: 'payment', label: '支付配置', children: <PaymentConfig onSave={async () => { message.info('支付配置保存功能开发中') }} /> },
    ]} />}
  </div>
}
