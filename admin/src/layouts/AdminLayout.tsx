import { useState, useEffect, useMemo } from 'react'
import { Outlet, useNavigate, useLocation, useParams } from 'react-router-dom'
import { Layout, Menu, Avatar, Dropdown, theme, Button, Space, Divider, Spin, Tag, Typography } from 'antd'
import {
  UserOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  LogoutOutlined,
  AppstoreOutlined,
  CloudServerOutlined,
  MobileOutlined,
  SettingOutlined,
} from '@ant-design/icons'
import { useAuthStore } from '@/stores/authStore'
import { useAppStore } from '@/stores/appStore'
import { trpc } from '@/utils/trpc'
import { PLATFORM_NAME } from '@/utils/constants'
import type { AppInfo } from '@/types'

const { Header, Sider, Content } = Layout

export default function AdminLayout() {
  const [collapsed, setCollapsed] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const params = useParams<{ appId: string }>()
  const { user, logout } = useAuthStore()
  const { apps, setApps } = useAppStore()
  const currentAppId = params.appId
  const currentApp = apps.find((a) => a.id === currentAppId)
  const { token: themeToken } = theme.useToken()

  // 获取应用列表
  const { data: appsData, isLoading: appsLoading } = trpc.app.list.useQuery(undefined)

  // 处理 API 返回的数据
  useEffect(() => {
    if (appsData && Array.isArray(appsData)) {
      const appList: AppInfo[] = appsData.map((app) => ({
        id: app.id,
        name: app.name,
        slug: app.slug || '',
        description: app.description || '',
        icon: '📱',
        platform: app.platform as 'ios' | 'android' | 'web' | 'cross_platform',
        bundleId: app.bundleId,
        status: app.status as 'active' | 'inactive' | 'maintenance' | 'archived',
        configTemplate: app.configTemplate || undefined,
        createdAt: app.createdAt?.toString() || new Date().toISOString(),
        updatedAt: app.updatedAt?.toString() || new Date().toISOString(),
      }))
      setApps(appList)
    }
  }, [appsData, setApps])

  // App 列表菜单 - 始终显示，带状态标签
  const appListMenuItems = useMemo(() => {
    return apps.map((app) => ({
      key: `/${app.id}/dashboard`,
      icon: <MobileOutlined />,
      label: (
        <div className="flex items-center justify-between w-full" style={{ padding: '4px 0' }}>
          <span>{app.icon} {app.name}</span>
          <Tag
            color={app.status === 'active' ? 'green' : 'default'}
            style={{ marginRight: 0, fontSize: 11 }}
          >
            {app.status === 'active' ? '运行中' : '已停用'}
          </Tag>
        </div>
      ),
    }))
  }, [apps])

  // 平台管理菜单
  const platformMenuItems = [
    {
      key: '/apps',
      icon: <AppstoreOutlined />,
      label: '应用管理',
    },
    {
      key: 'system',
      icon: <SettingOutlined />,
      label: '系统管理',
      children: [
        { key: '/settings/templates', label: '模板管理' },
        { key: '/settings/system', label: 'AI 配置与试聊' },
        { key: '/settings/chatq-data', label: 'ChatQ 主数据' },
      ],
    },
  ]

  // 当前选中的菜单 key
  const selectedKeys = useMemo(() => {
    const path = location.pathname
    if (path.startsWith('/settings/')) return [path]
    // 匹配 /:appId/* 路径
    if (path.match(/^\/[^/]+\/.*/)) {
      const parts = path.split('/')
      if (parts.length >= 2) {
        return [`/${parts[1]}/dashboard`]
      }
    }
    if (path === '/apps') {
      return ['/apps']
    }
    return []
  }, [location.pathname])

  const handleMenuClick = ({ key }: { key: string }) => {
    navigate(key)
  }

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  /** 用户下拉菜单 */
  const userMenuItems = [
    {
      key: 'profile',
      icon: <UserOutlined />,
      label: '个人信息',
    },
    { type: 'divider' as const },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: '退出登录',
      danger: true,
      onClick: handleLogout,
    },
  ]

  return (
    <Layout className="min-h-screen">
      {/* ===== 侧边栏 ===== */}
      <Sider
        trigger={null}
        collapsible
        collapsed={collapsed}
        width={240}
        style={{
          overflow: 'auto',
          height: '100vh',
          position: 'fixed',
          left: 0,
          top: 0,
          bottom: 0,
          background: themeToken.colorBgContainer,
          borderRight: `1px solid ${themeToken.colorBorderSecondary}`,
        }}
      >
        {/* Logo 区域 */}
        <div
          className="flex items-center justify-center gap-2 cursor-pointer"
          style={{
            height: 56,
            borderBottom: `1px solid ${themeToken.colorBorderSecondary}`,
          }}
          onClick={() => navigate('/')}
        >
          <CloudServerOutlined
            style={{ fontSize: 22, color: themeToken.colorPrimary }}
          />
          {!collapsed && (
            <span
              className="text-sm font-semibold whitespace-nowrap"
              style={{ color: themeToken.colorText }}
            >
              {PLATFORM_NAME}
            </span>
          )}
        </div>

        {/* 加载状态 */}
        {appsLoading && (
          <div className="flex items-center justify-center py-4">
            <Spin size="small" />
          </div>
        )}

        {/* App 列表菜单 - 始终显示 */}
        {!appsLoading && apps.length > 0 && (
          <Menu
            mode="inline"
            selectedKeys={selectedKeys}
            items={appListMenuItems}
            onClick={handleMenuClick}
            style={{
              border: 'none',
              padding: '4px 0',
            }}
          />
        )}

        {/* 无 App 时的提示 */}
        {!appsLoading && apps.length === 0 && (
          <div className="px-4 py-8 text-center">
            <Typography.Text type="secondary">暂无应用</Typography.Text>
            <br />
            <Button type="link" onClick={() => navigate('/apps')}>
              前往创建
            </Button>
          </div>
        )}

        <Divider style={{ margin: '4px 16px', minWidth: 'auto', width: 'auto' }} />

        {/* 全局管理菜单 */}
        {!collapsed && (
          <div
            className="px-4 py-1 text-xs font-medium"
            style={{ color: themeToken.colorTextQuaternary, letterSpacing: 1 }}
          >
            平台管理
          </div>
        )}
        <Menu
          mode="inline"
          selectedKeys={selectedKeys}
          items={platformMenuItems}
          onClick={handleMenuClick}
          style={{
            border: 'none',
            padding: '4px 0',
          }}
        />
      </Sider>

      {/* ===== 右侧主区域 ===== */}
      <Layout
        style={{
          marginLeft: collapsed ? 80 : 240,
          transition: 'margin-left 0.2s',
        }}
      >
        {/* 顶部栏 */}
        <Header
          style={{
            padding: '0 24px',
            background: themeToken.colorBgContainer,
            borderBottom: `1px solid ${themeToken.colorBorderSecondary}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            position: 'sticky',
            top: 0,
            zIndex: 10,
            height: 56,
            lineHeight: '56px',
          }}
        >
          <Space>
            <Button
              type="text"
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setCollapsed(!collapsed)}
              style={{ fontSize: 16 }}
            />
            {currentApp && (
              <span
                className="text-sm"
                style={{ color: themeToken.colorTextSecondary }}
              >
                {currentApp.icon} {currentApp.name}
              </span>
            )}
          </Space>

          <Space size="middle">
            <Button type="text" onClick={() => navigate('/settings/system')}>AI 配置与试聊</Button>
            {/* 应用管理按钮 */}
            <Button
              type="text"
              icon={<AppstoreOutlined />}
              onClick={() => navigate('/apps')}
            >
              应用管理
            </Button>
            <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
              <Space className="cursor-pointer" size="small">
                <Avatar
                  size="small"
                  icon={<UserOutlined />}
                  style={{ backgroundColor: themeToken.colorPrimary }}
                />
                <span style={{ color: themeToken.colorText }}>
                  {user?.username ?? 'Admin'}
                </span>
              </Space>
            </Dropdown>
          </Space>
        </Header>

        {/* 页面内容区 */}
        <Content
          style={{
            margin: 24,
            minHeight: 'calc(100vh - 56px - 48px)',
          }}
        >
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  )
}
