import { useEffect, useRef, useState } from 'react'
import { Alert, Button, Card, Col, Empty, Form, Input, Modal, Row, Select, Space, Table, Tag, Typography, message } from 'antd'
import { CreditCardOutlined, ReloadOutlined, SaveOutlined, SearchOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { trpc } from '@/utils/trpc'

type Status = 'pending' | 'creating' | 'ready' | 'unknown' | 'paid' | 'closed' | 'refund_review' | 'entitlement_review'
type Fields = { endpoint: string; mchNo: string; merchantAppId: string; secret?: string; notifyUrl: string; cashierOrigin: string }
const labels: Record<Status, string> = { pending: '待创建', creating: '创建中', ready: '待支付', unknown: '结果待确认', paid: '已到账', closed: '已关闭', refund_review: '退款待核对', entitlement_review: '权益待核对' }
const configLabels: Record<string, string> = { not_set: '尚未挂载私有配置', file_missing: '尚未填写商户资料', unreadable: '私有配置无法读取', invalid_json: '配置文件格式错误', invalid: '配置校验未通过', ready: '商户配置已保存' }
const statusColor = (s: string) => s === 'paid' ? 'green' : s.endsWith('_review') || s === 'unknown' ? 'orange' : 'default'

export default function PaymentConfig({ appId }: { appId: string }) {
  const navigate = useNavigate(), [form] = Form.useForm<Fields>()
  const [dirty, setDirty] = useState(false), [searchText, setSearchText] = useState(''), [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Status>(), [page, setPage] = useState(1)
  const alive = useRef(true), saveLock = useRef(false), checkLock = useRef(false)
  useEffect(() => { alive.current = true; return () => { alive.current = false; form.setFieldValue('secret', '') } }, [form])
  const status = trpc.paymentManage.status.useQuery({ appId }, { retry: false, staleTime: 0 })
  const orders = trpc.paymentManage.orders.useQuery({ appId, search, status: filter, page, pageSize: 20 }, { retry: false, staleTime: 0 })
  const save = trpc.paymentManage.configure.useMutation({ retry: false, gcTime: 0 })
  const reconcile = trpc.paymentManage.reconcile.useMutation({ retry: false })
  const secure = window.location.protocol === 'https:' || ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname)
  const configuration = status.data?.configuration
  const busy = save.isPending || reconcile.isPending
  useEffect(() => {
    if (configuration && !dirty && !status.isFetching && !status.error) form.setFieldsValue({ endpoint: '', mchNo: '', merchantAppId: '', cashierOrigin: '', notifyUrl: window.location.origin + '/api/aikeyboard/payments/notify', ...configuration.fields, secret: '' })
  }, [configuration, dirty, form, status.isFetching, status.error])
  async function saveConfiguration(values: Fields) {
    if (saveLock.current || !configuration?.editable || !secure || status.error) return
    saveLock.current = true
    try {
      await save.mutateAsync({ ...values, secret: values.secret || undefined, appId, expectedRevision: configuration.revision })
      if (!alive.current) return
      form.setFieldValue('secret', '')
      save.reset()
      const fresh = await status.refetch()
      if (!alive.current) return
      if (fresh.error) message.warning('配置已保存，但状态刷新失败，请刷新确认；销售开关未改变。')
      else { setDirty(false); message.success('商户配置已保存，正式收款保持关闭。') }
    } catch { /* The inline error preserves non-secret fields for correction. */ }
    finally { saveLock.current = false }
  }
  function checkOrder(orderId: string, orderNo: string) {
    Modal.confirm({ title: '核对原支付订单？', content: <><Typography.Paragraph>{orderNo}</Typography.Paragraph><Typography.Paragraph>向网关查询原流水，确认到账后同步会员。此操作不发起扣款或退款；退款和权益冲突会标记为待核对。</Typography.Paragraph></>, okText: '查询原订单', cancelText: '取消', onOk: async () => {
      if (checkLock.current || !alive.current) return
      checkLock.current = true
      try {
        const result = await reconcile.mutateAsync({ appId, orderId })
        if (!alive.current) return
        const refreshed = await Promise.all([orders.refetch(), status.refetch()])
        if (!alive.current) return
        if (refreshed.some(r => r.error)) message.warning('订单核对已完成，但列表刷新失败，请重新刷新。')
        else message.success('原订单状态：' + (labels[result.status as Status] || result.status))
      } catch { /* Inline error. No automatic replay. */ }
      finally { checkLock.current = false }
    } })
  }
  const waiting = status.data?.orders.filter(v => ['unknown', 'creating', 'refund_review', 'entitlement_review'].includes(v.status)).reduce((n, v) => n + v.count, 0) || 0
  const editable = !!configuration?.editable && secure && !status.error
  return <Space orientation="vertical" size={20} style={{ width: '100%' }}>
    <Alert type="info" showIcon title="Jeepay 收款管理" description="保存商户资料不会开放收款。本页检查配置、套餐和订单；正式接通还需商户通道与授权小额实付验收。" />
    {!secure && <Alert type="error" showIcon title="请使用 HTTPS 管理后台" description="当前连接无法安全提交商户密钥，保存已禁用。" />}
    {status.error && <Alert type="error" showIcon title="支付状态读取失败" description={status.error.message} action={<Button onClick={() => void status.refetch()}>重试</Button>} />}
    <Row gutter={[20, 20]}>
      <Col xs={24} xl={10}>
        <Card loading={status.isLoading} title={<Space><CreditCardOutlined />收款状态</Space>} extra={<Button icon={<ReloadOutlined />} loading={status.isFetching} disabled={busy} onClick={() => void status.refetch()}>刷新</Button>}>
          <Space wrap size={[8, 12]} style={{ marginBottom: 16 }}>
            <Tag color={status.data?.readiness.salesEnabled ? 'orange' : 'default'}>{status.data?.readiness.salesEnabled ? '新订单销售已开启' : '新订单销售关闭'}</Tag>
            <Tag color={configuration?.status === 'ready' && configuration.hasSecret ? 'green' : 'orange'}>{configuration ? configLabels[configuration.status] : '正在读取配置'}</Tag>
          </Space>
          <Typography.Paragraph>{status.data?.readiness.message}</Typography.Paragraph>
          {configuration?.issues.map((issue, i) => <Typography.Paragraph key={i} type="secondary">{issue.message}</Typography.Paragraph>)}
          {status.data?.readiness.blockingReasons.includes('merchant_app_mismatch') && <Alert type="warning" title="网关绑定了其他应用，不能覆盖其商户资料" showIcon style={{ marginBottom: 16 }} />}
          <Typography.Paragraph>可购买套餐：<strong>{status.data?.readiness.purchasablePlans ?? '—'}</strong>　待核对订单：<strong>{waiting}</strong></Typography.Paragraph>
          {status.data?.plans.length === 0 && <Typography.Paragraph type="secondary">暂无套餐。请先确定价格、期限和售后规则，再到套餐管理中创建；不会自动添加测试套餐。</Typography.Paragraph>}
          {!!status.data?.plans.some(p => p.active && !p.purchasable) && <Alert type="warning" showIcon title="部分上架套餐不支持当前渠道" description="Jeepay 仅支持有效 CNY 金额、天数的月度或年度会员，请在套餐管理中核对。" style={{ marginBottom: 16 }} />}
          <Button onClick={() => navigate(`/${appId}/subscriptions`)}>管理会员套餐</Button>
        </Card>
      </Col>
      <Col xs={24} xl={14}>
        <Card title="商户配置" extra={configuration?.hasSecret && <Tag color="green">签名密钥已保存</Tag>}>
          {!configuration?.editable && !status.isLoading && !status.error && <Alert type="warning" showIcon title="当前配置只读" description="保存需要超级管理员、私有目录已挂载，并且新订单销售关闭。已有历史订单的商户迁移需维护人员保留旧配置处理。" style={{ marginBottom: 16 }} />}
          <Form form={form} layout="vertical" disabled={!editable || busy || status.isFetching} onFinish={saveConfiguration} onValuesChange={() => { setDirty(true); save.reset() }}>
            <Form.Item name="endpoint" label="Jeepay API 根地址" rules={[{ required: true, message: '请填写支付网关地址' }, { type: 'url', message: '请输入完整 HTTPS 地址' }]}><Input autoComplete="off" placeholder="https://支付网关域名" /></Form.Item>
            <Row gutter={16}><Col xs={24} sm={12}><Form.Item name="mchNo" label="商户号" rules={[{ required: true, message: '请填写商户号' }]}><Input maxLength={64} autoComplete="off" /></Form.Item></Col><Col xs={24} sm={12}><Form.Item name="merchantAppId" label="商户应用 ID" rules={[{ required: true, message: '请填写商户应用 ID' }]} extra="此处填写 Jeepay 的商户应用 ID。"><Input maxLength={64} autoComplete="off" /></Form.Item></Col></Row>
            <Form.Item name="secret" label="应用签名密钥" rules={[{ required: !configuration?.hasSecret, message: '首次配置需要填写签名密钥' }]} extra={configuration?.hasSecret ? '留空保留原密钥；保存后不回显。已有订单不能直接更换商户或密钥。' : '密钥仅保存到服务器私有文件，不会回显或保存到浏览器。'}><Input.Password maxLength={256} autoComplete="new-password" placeholder={configuration?.hasSecret ? '已保存，留空保留' : '输入商户应用签名密钥'} /></Form.Item>
            <Form.Item name="cashierOrigin" label="收银台根地址" rules={[{ required: true, message: '请填写收银台根地址' }, { type: 'url', message: '请输入完整 HTTPS 地址' }]}><Input autoComplete="off" placeholder="https://收银台域名" /></Form.Item>
            <Form.Item name="notifyUrl" label="支付回调地址" rules={[{ required: true, message: '请填写回调地址' }, { type: 'url', message: '请输入完整 HTTPS 地址' }]} extra="保持 /api/aikeyboard/payments/notify 路径，网关需要能够访问此 HTTPS 地址。"><Input maxLength={128} autoComplete="off" /></Form.Item>
            <Space wrap><Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={save.isPending} disabled={!editable || !dirty || busy || status.isFetching}>保存商户配置</Button>{dirty && <Tag color="orange">有未保存修改</Tag>}</Space>
          </Form>
          {save.error && <Alert style={{ marginTop: 16 }} type="error" showIcon title="保存失败" description={save.error.message} />}
        </Card>
      </Col>
    </Row>
    <Card title="支付订单" extra={<Button icon={<ReloadOutlined />} loading={orders.isFetching} disabled={busy} onClick={() => void orders.refetch()}>刷新订单</Button>}>
      <Space wrap style={{ marginBottom: 16, width: '100%' }}>
        <Input.Search aria-label="搜索支付订单" value={searchText} onChange={e => setSearchText(e.target.value)} onSearch={value => { setSearch(value.trim()); setPage(1) }} maxLength={80} placeholder="订单号、支付流水或账号" enterButton={<SearchOutlined />} style={{ width: 'min(290px, 65vw)' }} />
        <Select aria-label="订单状态" allowClear value={filter} onChange={value => { setFilter(value); setPage(1) }} placeholder="全部状态" style={{ width: 160 }} options={Object.entries(labels).map(([value, label]) => ({ value, label }))} />
      </Space>
      {orders.error && <Alert type="error" showIcon title="订单列表读取失败" description={orders.error.message} style={{ marginBottom: 16 }} />}
      {reconcile.error && <Alert type="error" showIcon title="本次核对未完成，请保留原订单" description={reconcile.error.message} style={{ marginBottom: 16 }} />}
      <Table rowKey="id" loading={orders.isFetching} dataSource={orders.error ? [] : orders.data?.items} scroll={{ x: 920 }} locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={orders.error ? '刷新后查看订单' : search || filter ? '没有匹配的订单' : '暂无订单，当前没有发生收款'} /> }} pagination={{ current: page, pageSize: 20, total: orders.error ? 0 : orders.data?.total, showSizeChanger: false, onChange: setPage }} columns={[
        { title: '订单 / 账号', key: 'order', width: 300, render: (_, row) => <><Typography.Text copyable style={{ overflowWrap: 'anywhere' }}>{row.orderNo}</Typography.Text><div><Typography.Text type="secondary">{row.username || '设备用户'}</Typography.Text></div></> },
        { title: '套餐 / 金额', key: 'amount', width: 170, render: (_, row) => <>{row.name}<div><strong>{row.currency} {(row.amount / 100).toFixed(2)}</strong></div></> },
        { title: '状态', key: 'status', width: 130, render: (_, row) => <Tag color={statusColor(row.status)}>{labels[row.status as Status] || row.status}</Tag> },
        { title: '创建时间', key: 'created', width: 180, render: (_, row) => new Date(row.createdAt).toLocaleString() },
        { title: '操作', key: 'action', width: 140, render: (_, row) => <Button style={{ minHeight: 44 }} disabled={busy || !!status.error || !configuration?.hasSecret} loading={reconcile.isPending && reconcile.variables?.orderId === row.id} onClick={() => checkOrder(row.id, row.orderNo || row.id)}>核对支付结果</Button> },
      ]} />
      <Typography.Paragraph type="secondary" style={{ margin: '16px 0 0' }}>退款待核对或权益冲突时，请核验商户流水与现有会员后处理，不要删除原订单或要求用户重复付款。此页不发起真实退款。</Typography.Paragraph>
    </Card>
  </Space>
}
