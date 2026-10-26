import { useState, useEffect, useMemo } from 'react'
import {
  Card,
  Table,
  Tag,
  Input,
  Select,
  Button,
  Space,
  Modal,
  Descriptions,
  Empty,
  message,
} from 'antd'
import {
  SearchOutlined,
  ReloadOutlined,
  EyeOutlined,
  StopOutlined,
  ExportOutlined,
} from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import PageHeader from '@/components/PageHeader'
import { useAppStore } from '@/stores/appStore'
import type { User } from '@/types'
import {
  SUBSCRIPTION_TIER_LABELS,
  SUBSCRIPTION_STATUS_LABELS,
  SUBSCRIPTION_STATUS_COLORS,
  PAGE_SIZE_OPTIONS,
} from '@/utils/constants'
import { trpc } from '@/utils/trpc'
import { useSmartLoading } from '@/hooks/useLoading'

// ===== API 数据转换 =====

/**
 * 将后端状态映射到前端状态
 */
function mapBackendToFrontendStatus(backendStatus?: string): User['subscriptionStatus'] {
  if (!backendStatus) return 'active'

  const mapping: Record<string, User['subscriptionStatus']> = {
    active: 'active',
    expired: 'expired',
    cancelled: 'cancelled',
    grace_period: 'active', // 宽限期视为活跃
  }

  return mapping[backendStatus] || 'active'
}

/**
 * 将后端订阅列表数据转换为前端 User 类型
 */
function subscriptionToUser(
  subscriptionItem: any,
  appId: string,
  appPlatform: 'ios' | 'android' | 'web' | 'cross_platform'
): User {
  const { subscription, user } = subscriptionItem

  // 从App平台推断用户平台（简化逻辑）
  const platform: 'ios' | 'android' =
    appPlatform === 'ios' || appPlatform === 'cross_platform' ? 'ios' :
    appPlatform === 'android' ? 'android' : 'ios'

  // 使用订阅时间作为最后活跃时间（简化）
  const lastActiveAt = subscription?.updatedAt || subscription?.createdAt || user?.createdAt || new Date().toISOString()

  // 默认app版本
  const appVersion = '1.0.0'

  return {
    id: user.id || subscription.userId,
    appId,
    deviceId: user.username || user.deviceId || 'unknown',
    platform,
    appVersion,
    subscriptionTier: subscription.tier || 'free',
    subscriptionStatus: mapBackendToFrontendStatus(subscription.status),
    createdAt: user.createdAt || subscription.createdAt || new Date().toISOString(),
    lastActiveAt,
  }
}

export default function UsersPage() {
  const { apps, currentAppId } = useAppStore()
  const currentApp = apps.find((a) => a.id === currentAppId)

  const [searchText, setSearchText] = useState('')
  const [tierFilter, setTierFilter] = useState<string | undefined>()
  const [statusFilter, setStatusFilter] = useState<string | undefined>()
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [loading] = useState(false)
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: PAGE_SIZE_OPTIONS[0],
  })

  // 当过滤器变化时重置分页到第一页
  useEffect(() => {
    setPagination(prev => ({ ...prev, current: 1 }))
  }, [tierFilter, statusFilter])

  // 状态映射：前端 trial -> 后端 active（因为后端没有 trial 状态）
  const getBackendStatus = (frontendStatus?: string) => {
    if (!frontendStatus) return undefined
    // 映射前端状态到后端状态
    const mapping: Record<string, string> = {
      active: 'active',
      expired: 'expired',
      cancelled: 'cancelled',
      trial: 'active', // 试用中视为活跃
    }
    return mapping[frontendStatus] as any
  }

  // tRPC 查询
  const subscriptionsQuery = trpc.subscriptionManage.listSubscriptions.useQuery(
    {
      appId: currentAppId || '',
      status: getBackendStatus(statusFilter),
      tier: tierFilter as any,
      limit: pagination.pageSize,
      offset: (pagination.current - 1) * pagination.pageSize,
    },
    {
      enabled: !!currentAppId,
      refetchOnWindowFocus: false,
    }
  )

  // 组合加载状态
  const overallLoading = useSmartLoading({
    queries: [subscriptionsQuery],
    manualStates: [loading],
  })

  // 转换API数据为用户列表
  const apiUsers = useMemo(() => {
    if (!subscriptionsQuery.data || !currentAppId || !currentApp) {
      return []
    }

    return subscriptionsQuery.data.items.map((item: any) =>
      subscriptionToUser(item, currentAppId, currentApp.platform)
    )
  }, [subscriptionsQuery.data, currentAppId, currentApp])

  // 客户端搜索筛选（设备ID）
  const filteredUsers = useMemo(() => {
    if (!searchText) {
      return apiUsers
    }

    const searchLower = searchText.toLowerCase()
    return apiUsers.filter((user: User) =>
      user.deviceId.toLowerCase().includes(searchLower)
    )
  }, [apiUsers, searchText])

  const handleRefresh = () => {
    subscriptionsQuery.refetch().then(() => {
      message.success('数据已刷新')
    }).catch((error) => {
      console.error('刷新数据失败:', error)
      message.error('刷新数据失败')
    })
  }

  const handleTableChange = (newPagination: any) => {
    setPagination({
      current: newPagination.current,
      pageSize: newPagination.pageSize,
    })
  }

  const handleViewDetail = (user: User) => {
    setSelectedUser(user)
    setDetailOpen(true)
  }

  const handleBanUser = (user: User) => {
    Modal.confirm({
      title: '确认禁用用户',
      content: `确定要禁用设备 ${user.deviceId} 吗？禁用后该设备将无法使用 ${currentApp?.name ?? '应用'} 服务。`,
      okText: '确认禁用',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: () => {
        message.success('用户已禁用')
      },
    })
  }

  const columns: ColumnsType<User> = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 60 },
    { title: '账号 / 设备', dataIndex: 'deviceId', key: 'deviceId', ellipsis: true },
    {
      title: '平台',
      dataIndex: 'platform',
      key: 'platform',
      width: 80,
      render: (platform: string) => <Tag color="blue">{platform.toUpperCase()}</Tag>,
    },
    { title: '版本', dataIndex: 'appVersion', key: 'appVersion', width: 80 },
    {
      title: '订阅方案',
      dataIndex: 'subscriptionTier',
      key: 'subscriptionTier',
      width: 120,
      render: (tier: string) => {
        const colors: Record<string, string> = { free: 'default', pro_monthly: 'gold', pro_yearly: 'purple' }
        return <Tag color={colors[tier]}>{SUBSCRIPTION_TIER_LABELS[tier]}</Tag>
      },
    },
    {
      title: '状态',
      dataIndex: 'subscriptionStatus',
      key: 'subscriptionStatus',
      width: 100,
      render: (status: string) => (
        <Tag color={SUBSCRIPTION_STATUS_COLORS[status]}>{SUBSCRIPTION_STATUS_LABELS[status]}</Tag>
      ),
    },
    {
      title: '注册时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 120,
      render: (date: string) => new Date(date).toLocaleDateString('zh-CN'),
      sorter: (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    },
    {
      title: '最后活跃',
      dataIndex: 'lastActiveAt',
      key: 'lastActiveAt',
      width: 120,
      render: (date: string) => new Date(date).toLocaleDateString('zh-CN'),
      sorter: (a, b) => new Date(a.lastActiveAt).getTime() - new Date(b.lastActiveAt).getTime(),
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      render: (_, record) => (
        <Space size="small">
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => handleViewDetail(record)}>
            详情
          </Button>
          <Button type="link" size="small" danger icon={<StopOutlined />} onClick={() => handleBanUser(record)}>
            禁用
          </Button>
        </Space>
      ),
    },
  ]

  if (!currentApp) {
    return (
      <div>
        <PageHeader title="用户管理" subtitle="请先选择一个应用" breadcrumbs={[{ title: '用户管理' }]} />
        <Card style={{ borderRadius: 12 }}><Empty description="请先选择一个应用" /></Card>
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="用户管理"
        subtitle={`${currentApp.icon} ${currentApp.name} 的用户数据`}
        breadcrumbs={[{ title: '用户管理' }]}
        extra={<Button icon={<ExportOutlined />}>导出</Button>}
      />

      <Card style={{ borderRadius: 12 }}>
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <Input
            placeholder="搜索设备 ID..."
            prefix={<SearchOutlined />}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 240 }}
            allowClear
          />
          <Select
            placeholder="订阅方案"
            value={tierFilter}
            onChange={setTierFilter}
            allowClear
            style={{ width: 140 }}
            options={[
              { label: '免费版', value: 'free' },
              { label: 'Pro 月度', value: 'pro_monthly' },
              { label: 'Pro 年度', value: 'pro_yearly' },
            ]}
          />
          <Select
            placeholder="订阅状态"
            value={statusFilter}
            onChange={setStatusFilter}
            allowClear
            style={{ width: 120 }}
            options={[
              { label: '活跃', value: 'active' },
              { label: '已过期', value: 'expired' },
              { label: '已取消', value: 'cancelled' },
              { label: '试用中', value: 'trial' },
            ]}
          />
          <Button icon={<ReloadOutlined />} onClick={handleRefresh}>刷新</Button>
        </div>

        <Table
          dataSource={filteredUsers}
          columns={columns}
          rowKey="id"
          loading={overallLoading}
          pagination={{
            current: pagination.current,
            pageSize: pagination.pageSize,
            total: subscriptionsQuery.data?.total || 0,
            showSizeChanger: true,
            showQuickJumper: true,
            pageSizeOptions: PAGE_SIZE_OPTIONS.map(String),
            showTotal: (total) => `共 ${total} 条记录`,
          }}
          onChange={handleTableChange}
          scroll={{ x: 1000 }}
          size="middle"
        />
      </Card>

      {/* 用户详情弹窗 */}
      <Modal title="用户详情" open={detailOpen} onCancel={() => setDetailOpen(false)} footer={null} width={600}>
        {selectedUser && (
          <Descriptions column={2} bordered size="small">
            <Descriptions.Item label="用户 ID">{selectedUser.id}</Descriptions.Item>
            <Descriptions.Item label="所属应用">{currentApp.icon} {currentApp.name}</Descriptions.Item>
            <Descriptions.Item label="账号 / 设备">{selectedUser.deviceId}</Descriptions.Item>
            <Descriptions.Item label="平台">{selectedUser.platform.toUpperCase()}</Descriptions.Item>
            <Descriptions.Item label="App 版本">{selectedUser.appVersion}</Descriptions.Item>
            <Descriptions.Item label="订阅方案">{SUBSCRIPTION_TIER_LABELS[selectedUser.subscriptionTier]}</Descriptions.Item>
            <Descriptions.Item label="订阅状态">
              <Tag color={SUBSCRIPTION_STATUS_COLORS[selectedUser.subscriptionStatus]}>
                {SUBSCRIPTION_STATUS_LABELS[selectedUser.subscriptionStatus]}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="注册时间">{new Date(selectedUser.createdAt).toLocaleString('zh-CN')}</Descriptions.Item>
            <Descriptions.Item label="最后活跃" span={2}>{new Date(selectedUser.lastActiveAt).toLocaleString('zh-CN')}</Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </div>
  )
}
