import { useState } from 'react'
import {
  Tabs,
  Table,
  Button,
  Modal,
  Form,
  Input,
  InputNumber,
  Select,
  Tag,
  Popconfirm,
  Badge,
  message,
  Space,
} from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import PageHeader from '@/components/PageHeader'
import { trpc } from '@/utils/trpc'

function useModal<T>() {
  const [visible, setVisible] = useState(false)
  const [editing, setEditing] = useState<T | null>(null)
  const open = (record?: T) => { setEditing(record ?? null); setVisible(true) }
  const close = () => { setVisible(false); setEditing(null) }
  return { visible, editing, open, close }
}

const SENTIMENT_MAP = {
  positive: { color: 'green', label: '积极' },
  neutral: { color: 'default', label: '中性' },
  negative: { color: 'red', label: '消极' },
} as const

const GENDER_MAP = {
  male: { color: 'blue', label: '男' },
  female: { color: 'pink', label: '女' },
  any: { color: 'default', label: '不限' },
} as const

// ==================== 维度 Tab ====================

function DimensionsTab() {
  const [form] = Form.useForm()
  const modal = useModal<{ id: string }>()
  const utils = trpc.useUtils()

  const listQuery = trpc.chatqManage.listDimensions.useQuery()

  const createMut = trpc.chatqManage.createDimension.useMutation({
    onSuccess: () => { message.success('创建成功'); modal.close(); form.resetFields(); utils.chatqManage.listDimensions.invalidate() },
    onError: (e) => message.error(e.message || '操作失败'),
  })
  const updateMut = trpc.chatqManage.updateDimension.useMutation({
    onSuccess: () => { message.success('更新成功'); modal.close(); form.resetFields(); utils.chatqManage.listDimensions.invalidate() },
    onError: (e) => message.error(e.message || '操作失败'),
  })
  const deleteMut = trpc.chatqManage.deleteDimension.useMutation({
    onSuccess: () => { message.success('删除成功'); utils.chatqManage.listDimensions.invalidate() },
    onError: (e) => message.error(e.message || '操作失败'),
  })

  const columns: ColumnsType<NonNullable<typeof listQuery.data>[number]> = [
    { title: 'ID', dataIndex: 'dimensionId', width: 160 },
    { title: '名称', dataIndex: 'name', width: 160 },
    { title: '描述', dataIndex: 'description', ellipsis: true },
    { title: '排序', dataIndex: 'sort', width: 80 },
    {
      title: '操作', width: 140, render: (_, r) => (
        <Space>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => { modal.open(r); form.setFieldsValue(r) }}>编辑</Button>
          <Popconfirm title="确定删除？" onConfirm={() => deleteMut.mutate({ id: r.id })} okText="删除" cancelText="取消">
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  const handleOk = () => {
    form.validateFields().then((vals) => {
      if (modal.editing) {
        updateMut.mutate({ id: modal.editing.id, ...vals })
      } else {
        createMut.mutate(vals)
      }
    })
  }

  return (
    <>
      <div className="flex justify-end mb-4">
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { modal.open(); form.resetFields() }}>新增</Button>
      </div>
      <Table rowKey="id" dataSource={listQuery.data ?? []} columns={columns} loading={listQuery.isLoading} pagination={false} size="middle" />
      <Modal
        title={modal.editing ? '编辑维度' : '新增维度'}
        open={modal.visible}
        onOk={handleOk}
        onCancel={modal.close}
        confirmLoading={createMut.isPending || updateMut.isPending}
        destroyOnClose
      >
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item name="dimensionId" label="维度 ID" rules={[{ required: true, message: '请输入维度 ID' }]}>
            <Input disabled={!!modal.editing} placeholder="例如: personality" />
          </Form.Item>
          <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入名称' }]}>
            <Input placeholder="例如: 性格特质" />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={2} placeholder="维度描述" />
          </Form.Item>
          <Form.Item name="sort" label="排序" initialValue={0}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}

// ==================== 人设标签 Tab ====================

function PersonaTagsTab() {
  const [form] = Form.useForm()
  const modal = useModal<{ id: string }>()
  const [filterDimId, setFilterDimId] = useState<string | undefined>(undefined)
  const utils = trpc.useUtils()

  const dimensionsQuery = trpc.chatqManage.listDimensions.useQuery()
  const listQuery = trpc.chatqManage.listPersonaTags.useQuery(
    filterDimId ? { dimensionId: filterDimId } : undefined,
  )

  const createMut = trpc.chatqManage.createPersonaTag.useMutation({
    onSuccess: () => { message.success('创建成功'); modal.close(); form.resetFields(); utils.chatqManage.listPersonaTags.invalidate() },
    onError: (e) => message.error(e.message || '操作失败'),
  })
  const updateMut = trpc.chatqManage.updatePersonaTag.useMutation({
    onSuccess: () => { message.success('更新成功'); modal.close(); form.resetFields(); utils.chatqManage.listPersonaTags.invalidate() },
    onError: (e) => message.error(e.message || '操作失败'),
  })
  const deleteMut = trpc.chatqManage.deletePersonaTag.useMutation({
    onSuccess: () => { message.success('删除成功'); utils.chatqManage.listPersonaTags.invalidate() },
    onError: (e) => message.error(e.message || '操作失败'),
  })

  const columns: ColumnsType<NonNullable<typeof listQuery.data>[number]> = [
    { title: 'Tag ID', dataIndex: 'tagId', width: 130 },
    { title: '名称', dataIndex: 'name', width: 120 },
    { title: '维度 ID', dataIndex: 'dimensionId', width: 130 },
    {
      title: '情感倾向', dataIndex: 'sentiment', width: 100,
      render: (v: keyof typeof SENTIMENT_MAP) => <Tag color={SENTIMENT_MAP[v]?.color}>{SENTIMENT_MAP[v]?.label ?? v}</Tag>,
    },
    { title: '默认权重', dataIndex: 'weightDefault', width: 100 },
    { title: '描述', dataIndex: 'description', ellipsis: true },
    { title: '排序', dataIndex: 'sort', width: 70 },
    {
      title: '操作', width: 140, render: (_, r) => (
        <Space>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => { modal.open(r); form.setFieldsValue(r) }}>编辑</Button>
          <Popconfirm title="确定删除？" onConfirm={() => deleteMut.mutate({ id: r.id })} okText="删除" cancelText="取消">
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  const handleOk = () => {
    form.validateFields().then((vals) => {
      if (modal.editing) {
        updateMut.mutate({ id: modal.editing.id, name: vals.name, sentiment: vals.sentiment, weightDefault: vals.weightDefault, description: vals.description, sort: vals.sort })
      } else {
        createMut.mutate(vals)
      }
    })
  }

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <Select
          allowClear
          placeholder="按维度筛选"
          style={{ width: 220 }}
          value={filterDimId}
          onChange={setFilterDimId}
          options={(dimensionsQuery.data ?? []).map((d) => ({ label: d.name, value: d.dimensionId }))}
        />
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { modal.open(); form.resetFields() }}>新增</Button>
      </div>
      <Table rowKey="id" dataSource={listQuery.data ?? []} columns={columns} loading={listQuery.isLoading} pagination={false} size="middle" scroll={{ x: 960 }} />
      <Modal
        title={modal.editing ? '编辑人设标签' : '新增人设标签'}
        open={modal.visible}
        onOk={handleOk}
        onCancel={modal.close}
        confirmLoading={createMut.isPending || updateMut.isPending}
        destroyOnClose
      >
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item name="dimensionId" label="维度" rules={[{ required: true, message: '请选择维度' }]}>
            <Select
              disabled={!!modal.editing}
              placeholder="选择维度"
              options={(dimensionsQuery.data ?? []).map((d) => ({ label: d.name, value: d.dimensionId }))}
            />
          </Form.Item>
          <Form.Item name="tagId" label="标签 ID" rules={[{ required: true, message: '请输入标签 ID' }]}>
            <Input disabled={!!modal.editing} placeholder="例如: optimistic" />
          </Form.Item>
          <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入名称' }]}>
            <Input placeholder="例如: 乐观" />
          </Form.Item>
          <Form.Item name="sentiment" label="情感倾向" rules={[{ required: true, message: '请选择情感倾向' }]}>
            <Select
              placeholder="选择情感倾向"
              options={[
                { label: '积极', value: 'positive' },
                { label: '中性', value: 'neutral' },
                { label: '消极', value: 'negative' },
              ]}
            />
          </Form.Item>
          <Form.Item name="weightDefault" label="默认权重" initialValue={0.5}>
            <InputNumber min={0} max={1} step={0.1} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={2} placeholder="标签描述" />
          </Form.Item>
          <Form.Item name="sort" label="排序" initialValue={0}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}

// ==================== 场景 Tab ====================

function ScenesTab() {
  const [form] = Form.useForm()
  const modal = useModal<{ id: string }>()
  const utils = trpc.useUtils()

  const listQuery = trpc.chatqManage.listScenes.useQuery()

  const createMut = trpc.chatqManage.createScene.useMutation({
    onSuccess: () => { message.success('创建成功'); modal.close(); form.resetFields(); utils.chatqManage.listScenes.invalidate() },
    onError: (e) => message.error(e.message || '操作失败'),
  })
  const updateMut = trpc.chatqManage.updateScene.useMutation({
    onSuccess: () => { message.success('更新成功'); modal.close(); form.resetFields(); utils.chatqManage.listScenes.invalidate() },
    onError: (e) => message.error(e.message || '操作失败'),
  })
  const deleteMut = trpc.chatqManage.deleteScene.useMutation({
    onSuccess: () => { message.success('删除成功'); utils.chatqManage.listScenes.invalidate() },
    onError: (e) => message.error(e.message || '操作失败'),
  })

  const columns: ColumnsType<NonNullable<typeof listQuery.data>[number]> = [
    { title: 'ID', dataIndex: 'sceneId', width: 140 },
    { title: '名称', dataIndex: 'name', width: 120 },
    { title: '图标', dataIndex: 'icon', width: 70 },
    {
      title: '颜色', dataIndex: 'color', width: 100,
      render: (v: string) => v ? <span className="inline-flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: v }} />{v}</span> : '-',
    },
    { title: '描述', dataIndex: 'description', ellipsis: true },
    { title: '排序', dataIndex: 'sort', width: 70 },
    {
      title: '操作', width: 140, render: (_, r) => (
        <Space>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => { modal.open(r); form.setFieldsValue(r) }}>编辑</Button>
          <Popconfirm title="确定删除？" onConfirm={() => deleteMut.mutate({ id: r.id })} okText="删除" cancelText="取消">
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  const handleOk = () => {
    form.validateFields().then((vals) => {
      if (modal.editing) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { sceneId: _, ...rest } = vals
        updateMut.mutate({ id: modal.editing.id, ...rest })
      } else {
        createMut.mutate(vals)
      }
    })
  }

  return (
    <>
      <div className="flex justify-end mb-4">
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { modal.open(); form.resetFields() }}>新增</Button>
      </div>
      <Table rowKey="id" dataSource={listQuery.data ?? []} columns={columns} loading={listQuery.isLoading} pagination={false} size="middle" />
      <Modal
        title={modal.editing ? '编辑场景' : '新增场景'}
        open={modal.visible}
        onOk={handleOk}
        onCancel={modal.close}
        confirmLoading={createMut.isPending || updateMut.isPending}
        destroyOnClose
      >
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item name="sceneId" label="场景 ID" rules={[{ required: true, message: '请输入场景 ID' }]}>
            <Input disabled={!!modal.editing} placeholder="例如: casual" />
          </Form.Item>
          <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入名称' }]}>
            <Input placeholder="例如: 休闲聊天" />
          </Form.Item>
          <Form.Item name="icon" label="图标">
            <Input placeholder="例如: 🎭" maxLength={4} />
          </Form.Item>
          <Form.Item name="color" label="颜色">
            <Input placeholder="例如: #1890ff" />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={2} placeholder="场景描述" />
          </Form.Item>
          <Form.Item name="sort" label="排序" initialValue={0}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}

// ==================== 关系 Tab ====================

function RelationsTab() {
  const [form] = Form.useForm()
  const modal = useModal<{ id: string }>()
  const utils = trpc.useUtils()

  const listQuery = trpc.chatqManage.listRelations.useQuery()

  const createMut = trpc.chatqManage.createRelation.useMutation({
    onSuccess: () => { message.success('创建成功'); modal.close(); form.resetFields(); utils.chatqManage.listRelations.invalidate() },
    onError: (e) => message.error(e.message || '操作失败'),
  })
  const updateMut = trpc.chatqManage.updateRelation.useMutation({
    onSuccess: () => { message.success('更新成功'); modal.close(); form.resetFields(); utils.chatqManage.listRelations.invalidate() },
    onError: (e) => message.error(e.message || '操作失败'),
  })
  const deleteMut = trpc.chatqManage.deleteRelation.useMutation({
    onSuccess: () => { message.success('删除成功'); utils.chatqManage.listRelations.invalidate() },
    onError: (e) => message.error(e.message || '操作失败'),
  })

  const columns: ColumnsType<NonNullable<typeof listQuery.data>[number]> = [
    { title: 'ID', dataIndex: 'relationId', width: 160 },
    { title: '名称', dataIndex: 'name', width: 160 },
    { title: '描述', dataIndex: 'description', ellipsis: true },
    { title: '排序', dataIndex: 'sort', width: 80 },
    {
      title: '操作', width: 140, render: (_, r) => (
        <Space>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => { modal.open(r); form.setFieldsValue(r) }}>编辑</Button>
          <Popconfirm title="确定删除？" onConfirm={() => deleteMut.mutate({ id: r.id })} okText="删除" cancelText="取消">
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  const handleOk = () => {
    form.validateFields().then((vals) => {
      if (modal.editing) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { relationId: _, ...rest } = vals
        updateMut.mutate({ id: modal.editing.id, ...rest })
      } else {
        createMut.mutate(vals)
      }
    })
  }

  return (
    <>
      <div className="flex justify-end mb-4">
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { modal.open(); form.resetFields() }}>新增</Button>
      </div>
      <Table rowKey="id" dataSource={listQuery.data ?? []} columns={columns} loading={listQuery.isLoading} pagination={false} size="middle" />
      <Modal
        title={modal.editing ? '编辑关系' : '新增关系'}
        open={modal.visible}
        onOk={handleOk}
        onCancel={modal.close}
        confirmLoading={createMut.isPending || updateMut.isPending}
        destroyOnClose
      >
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item name="relationId" label="关系 ID" rules={[{ required: true, message: '请输入关系 ID' }]}>
            <Input disabled={!!modal.editing} placeholder="例如: friend" />
          </Form.Item>
          <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入名称' }]}>
            <Input placeholder="例如: 朋友" />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={2} placeholder="关系描述" />
          </Form.Item>
          <Form.Item name="sort" label="排序" initialValue={0}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}

// ==================== 人设包 Tab ====================

function PersonaPackagesTab() {
  const [form] = Form.useForm()
  const modal = useModal<{ id: string }>()
  const utils = trpc.useUtils()

  const listQuery = trpc.chatqManage.listPersonaPackages.useQuery()
  const tagsQuery = trpc.chatqManage.listPersonaTags.useQuery()
  const scenesQuery = trpc.chatqManage.listScenes.useQuery()

  const createMut = trpc.chatqManage.createPersonaPackage.useMutation({
    onSuccess: () => { message.success('创建成功'); modal.close(); form.resetFields(); utils.chatqManage.listPersonaPackages.invalidate() },
    onError: (e) => message.error(e.message || '操作失败'),
  })
  const updateMut = trpc.chatqManage.updatePersonaPackage.useMutation({
    onSuccess: () => { message.success('更新成功'); modal.close(); form.resetFields(); utils.chatqManage.listPersonaPackages.invalidate() },
    onError: (e) => message.error(e.message || '操作失败'),
  })
  const deleteMut = trpc.chatqManage.deletePersonaPackage.useMutation({
    onSuccess: () => { message.success('删除成功'); utils.chatqManage.listPersonaPackages.invalidate() },
    onError: (e) => message.error(e.message || '操作失败'),
  })

  const columns: ColumnsType<NonNullable<typeof listQuery.data>[number]> = [
    { title: 'ID', dataIndex: 'packageId', width: 140 },
    { title: '名称', dataIndex: 'name', width: 120 },
    {
      title: '性别', dataIndex: 'gender', width: 80,
      render: (v: keyof typeof GENDER_MAP) => <Tag color={GENDER_MAP[v]?.color}>{GENDER_MAP[v]?.label ?? v}</Tag>,
    },
    {
      title: '标签', dataIndex: 'tags', width: 100,
      render: (v: string[]) => <Badge count={v?.length ?? 0} showZero color="blue" />,
    },
    {
      title: '场景', dataIndex: 'scenes', width: 100,
      render: (v: string[]) => <Badge count={v?.length ?? 0} showZero color="green" />,
    },
    { title: '描述', dataIndex: 'description', ellipsis: true },
    { title: '排序', dataIndex: 'sort', width: 70 },
    {
      title: '操作', width: 140, render: (_, r) => (
        <Space>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => { modal.open(r); form.setFieldsValue(r) }}>编辑</Button>
          <Popconfirm title="确定删除？" onConfirm={() => deleteMut.mutate({ id: r.id })} okText="删除" cancelText="取消">
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  const handleOk = () => {
    form.validateFields().then((vals) => {
      if (modal.editing) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { packageId: _, ...rest } = vals
        updateMut.mutate({ id: modal.editing.id, ...rest })
      } else {
        createMut.mutate(vals)
      }
    })
  }

  return (
    <>
      <div className="flex justify-end mb-4">
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { modal.open(); form.resetFields() }}>新增</Button>
      </div>
      <Table rowKey="id" dataSource={listQuery.data ?? []} columns={columns} loading={listQuery.isLoading} pagination={false} size="middle" scroll={{ x: 880 }} />
      <Modal
        title={modal.editing ? '编辑人设包' : '新增人设包'}
        open={modal.visible}
        onOk={handleOk}
        onCancel={modal.close}
        confirmLoading={createMut.isPending || updateMut.isPending}
        destroyOnClose
        width={600}
      >
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item name="packageId" label="包 ID" rules={[{ required: true, message: '请输入包 ID' }]}>
            <Input disabled={!!modal.editing} placeholder="例如: cheerful-girl" />
          </Form.Item>
          <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入名称' }]}>
            <Input placeholder="例如: 开朗少女" />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={2} placeholder="人设包描述" />
          </Form.Item>
          <Form.Item name="gender" label="性别" rules={[{ required: true, message: '请选择性别' }]}>
            <Select
              placeholder="选择性别"
              options={[
                { label: '男', value: 'male' },
                { label: '女', value: 'female' },
                { label: '不限', value: 'any' },
              ]}
            />
          </Form.Item>
          <Form.Item name="ageRange" label="年龄范围">
            <Select mode="tags" placeholder="输入年龄标签，回车确认" />
          </Form.Item>
          <Form.Item name="tags" label="标签" rules={[{ required: true, message: '请选择标签' }]}>
            <Select
              mode="multiple"
              placeholder="选择标签"
              options={(tagsQuery.data ?? []).map((t) => ({ label: `${t.name} (${t.tagId})`, value: t.tagId }))}
            />
          </Form.Item>
          <Form.Item name="scenes" label="场景" rules={[{ required: true, message: '请选择场景' }]}>
            <Select
              mode="multiple"
              placeholder="选择场景"
              options={(scenesQuery.data ?? []).map((s) => ({ label: `${s.name} (${s.sceneId})`, value: s.sceneId }))}
            />
          </Form.Item>
          <Form.Item name="sort" label="排序" initialValue={0}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}

// ==================== 主页面 ====================

export default function ChatqDataPage() {
  return (
    <div>
      <PageHeader
        title="ChatQ 主数据管理"
        subtitle="管理人设维度、标签、场景、关系与人设包"
        breadcrumbs={[{ title: '设置' }, { title: 'ChatQ 主数据' }]}
      />
      <Tabs
        defaultActiveKey="dimensions"
        items={[
          { key: 'dimensions', label: '维度', children: <DimensionsTab /> },
          { key: 'personaTags', label: '人设标签', children: <PersonaTagsTab /> },
          { key: 'scenes', label: '场景', children: <ScenesTab /> },
          { key: 'relations', label: '关系', children: <RelationsTab /> },
          { key: 'packages', label: '人设包', children: <PersonaPackagesTab /> },
        ]}
      />
    </div>
  )
}
