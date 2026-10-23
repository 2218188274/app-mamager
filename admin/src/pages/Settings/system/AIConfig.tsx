import { useEffect, useState } from 'react'
import { Alert, Button, Card, Col, Collapse, Empty, Form, Input, InputNumber, Row, Select, Space, Spin, Switch, Tag, Typography, message } from 'antd'
import { ApiOutlined, SaveOutlined, SendOutlined, ExperimentOutlined } from '@ant-design/icons'
import { trpc } from '@/utils/trpc'

type ConfigValues = {
  enabled: boolean; baseUrl: string; apiKey?: string; model: string;
  timeout: number; tokenParameter: 'max_tokens' | 'max_completion_tokens'; sendTemperature: boolean
}
type ReplyValues = { text: string; context?: string; style: 'friendly' | 'professional' | 'funny' | 'emoji'; candidateCount: number }

export default function AIConfig({ appId }: { appId: string }) {
  const [form] = Form.useForm<ConfigValues>()
  const [replyForm] = Form.useForm<ReplyValues>()
  const [dirty, setDirty] = useState(false)
  const utils = trpc.useUtils()
  const config = trpc.aiAdmin.config.useQuery({ appId }, { refetchOnWindowFocus: false })
  const save = trpc.aiAdmin.save.useMutation()
  const test = trpc.aiAdmin.test.useMutation()
  const reply = trpc.aiAdmin.reply.useMutation()
  const busy = save.isPending || test.isPending || reply.isPending

  useEffect(() => {
    if (config.data) {
      form.setFieldsValue({ ...config.data, apiKey: '' })
      setDirty(false)
    }
  }, [config.data, form])

  const saveConfig = async (values: ConfigValues) => {
    test.reset()
    reply.reset()
    try {
      const saved = await save.mutateAsync({ appId, ...values })
      form.setFieldsValue({ ...saved, apiKey: '' })
      setDirty(false)
      utils.aiAdmin.config.setData({ appId }, saved)
      await Promise.all([utils.settings.app.invalidate({ appId }), utils.app.list.invalidate()])
      message.success('配置已保存，聊天回复将使用新配置')
    } catch { /* Show the persistent error below the form. */ }
  }

  const testConnection = async () => {
    try {
      const values = await form.validateFields()
      await test.mutateAsync({ appId, ...values })
    } catch { /* Validation and API errors are displayed inline. */ }
  }

  if (config.isLoading) return <Spin />
  if (config.error) return <Alert type="error" showIcon title={config.error.message} action={<Button onClick={() => config.refetch()}>重试</Button>} />

  return <Row gutter={[24, 24]}>
    <Col xs={24} xl={11}>
      <Card title={<Space><ApiOutlined />AI 接口配置</Space>} extra={<Tag color={config.data?.enabled ? 'green' : 'default'}>{config.data?.enabled ? '已启用' : '未启用'}</Tag>}>
        <Typography.Paragraph type="secondary">支持 OpenAI 兼容接口。填写服务商提供的地址、密钥和模型，保存后对当前应用生效。</Typography.Paragraph>
        <Form form={form} layout="vertical" onFinish={saveConfig} disabled={busy} onValuesChange={() => { setDirty(true); test.reset(); save.reset(); reply.reset() }}>
          <Form.Item name="enabled" label="启用聊天 AI" valuePropName="checked"><Switch /></Form.Item>
          <Form.Item name="baseUrl" label="API 地址" rules={[{ required: true, message: '请填写 API 地址' }, { type: 'url', message: '请输入完整 URL' }]} extra="可填基础地址（如 https://api.openai.com/v1），或完整的 /chat/completions 地址。">
            <Input placeholder="https://api.openai.com/v1" autoComplete="off" />
          </Form.Item>
          <Form.Item name="apiKey" label={<Space>API 密钥{config.data?.hasApiKey && <Tag color="green">已保存</Tag>}</Space>} extra={config.data?.hasApiKey ? '留空保留已保存密钥；输入新密钥可替换。更换 API 地址时需要重新填写。' : '密钥只用于服务器调用，保存后不会回显。'}>
            <Input.Password placeholder={config.data?.hasApiKey ? '已保存，留空不修改' : '输入服务商 API Key'} autoComplete="new-password" />
          </Form.Item>
          <Form.Item name="model" label="模型名称" rules={[{ required: true, whitespace: true, message: '请填写模型名称' }]} extra="必须与服务商控制台中的模型 ID 完全一致。"><Input placeholder="例如 gpt-4o-mini" /></Form.Item>
          <Collapse ghost items={[{ key: 'advanced', label: '高级参数', children: <>
            <Form.Item name="timeout" label="请求超时（毫秒）" rules={[{ required: true }]}><InputNumber min={5000} max={120000} step={5000} style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="tokenParameter" label="输出长度参数"><Select options={[{ value: 'max_tokens', label: 'max_tokens（常见兼容接口）' }, { value: 'max_completion_tokens', label: 'max_completion_tokens（部分推理模型）' }]} /></Form.Item>
            <Form.Item name="sendTemperature" valuePropName="checked" label="发送 temperature 参数" extra="模型提示不支持 temperature 时关闭。"><Switch /></Form.Item>
          </> }]} />
          <Space wrap style={{ marginTop: 16 }}>
            <Button icon={<ExperimentOutlined />} onClick={testConnection} loading={test.isPending}>测试连接</Button>
            <Button type="primary" icon={<SaveOutlined />} htmlType="submit" loading={save.isPending}>保存配置</Button>
            {dirty && <Tag color="orange">有未保存修改</Tag>}
          </Space>
        </Form>
        <Typography.Paragraph type="secondary" style={{ marginTop: 16, marginBottom: 0 }}>测试连接会使用表单中的配置发起一次真实请求，可能产生少量 API 费用。</Typography.Paragraph>
        {save.error && <Alert style={{ marginTop: 16 }} type="error" showIcon title="保存失败" description={save.error.message} />}
        {test.error && <Alert style={{ marginTop: 16 }} type="error" showIcon title="连接失败" description={test.error.message} />}
        {test.data && <Alert style={{ marginTop: 16 }} type="success" showIcon title={`连接成功 · ${test.data.model} · ${test.data.processingTime} ms`} description={test.data.reply} />}
      </Card>
    </Col>
    <Col xs={24} xl={13}>
      <Card title="聊天回复体验" extra={<Tag color="blue">使用已保存配置</Tag>}>
        <Typography.Paragraph type="secondary">粘贴对方的消息，选择回复风格，即可生成能直接发送的回复。管理员试聊不计入用户日配额。</Typography.Paragraph>
        {(!config.data?.enabled || !config.data.hasApiKey) && <Alert style={{ marginBottom: 16 }} type="info" showIcon title="先填写接口信息、打开 AI 开关并保存，再开始试聊。" />}
        <Form form={replyForm} layout="vertical" initialValues={{ style: 'friendly', candidateCount: 1 }} onFinish={async values => {
          reply.reset()
          try { await reply.mutateAsync({ appId, ...values, context: values.context ?? '' }) } catch { /* Inline error. */ }
        }} disabled={busy}>
          <Form.Item name="text" label="对方说了什么？" rules={[{ required: true, whitespace: true, message: '请输入对方的消息' }]}><Input.TextArea rows={4} maxLength={2000} showCount placeholder="例如：今天工作好累，感觉什么都没做好。" /></Form.Item>
          <Form.Item name="context" label="聊天背景（可选）"><Input.TextArea rows={2} maxLength={2000} placeholder="例如：这是我的好朋友，想安慰一下对方。" /></Form.Item>
          <Row gutter={16}>
            <Col span={14}><Form.Item name="style" label="回复风格"><Select options={[{ value: 'friendly', label: '友好亲切' }, { value: 'professional', label: '专业礼貌' }, { value: 'funny', label: '幽默轻松' }, { value: 'emoji', label: '活泼表情' }]} /></Form.Item></Col>
            <Col span={10}><Form.Item name="candidateCount" label="候选数量"><Select options={[1, 2, 3].map(value => ({ value, label: `${value} 条` }))} /></Form.Item></Col>
          </Row>
          <Button type="primary" htmlType="submit" icon={<SendOutlined />} loading={reply.isPending} disabled={busy || dirty || !config.data?.enabled || !config.data.hasApiKey}>生成回复</Button>
          {dirty && <Typography.Text type="secondary" style={{ marginLeft: 12 }}>请先保存左侧配置</Typography.Text>}
        </Form>
        <div aria-live="polite" style={{ marginTop: 24 }}>
          {reply.error && <Alert type="error" showIcon title="生成失败" description={reply.error.message} />}
          {reply.isPending && <Spin description="正在等待 AI 回复…" />}
          {!reply.data && !reply.error && !reply.isPending && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="生成的回复会显示在这里" />}
          {reply.data && <>
            <Space wrap style={{ marginBottom: 12 }}><Tag>{reply.data.provider.model}</Tag><Typography.Text type="secondary">{(reply.data.provider.processingTime / 1000).toFixed(1)} 秒{reply.data.provider.tokensUsed != null ? ` · ${reply.data.provider.tokensUsed} tokens` : ''}</Typography.Text></Space>
            {reply.data.replies.map((item, index) => <Card key={item.id} size="small" title={`回复 ${index + 1}`} style={{ marginBottom: 12, background: '#f7faff' }}><Typography.Paragraph copyable style={{ whiteSpace: 'pre-wrap', marginBottom: 0 }}>{item.content}</Typography.Paragraph></Card>)}
          </>}
        </div>
      </Card>
    </Col>
  </Row>
}
