import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import PaymentConfig from './PaymentConfig'
const mocks = vi.hoisted(() => ({ save: vi.fn(), search: vi.fn(), refetch: vi.fn(), editable: true, error: false, fields: null as null | { endpoint: string; mchNo: string; merchantAppId: string; cashierOrigin: string; notifyUrl: string } }))
vi.mock('@/utils/trpc', () => ({ trpc: { paymentManage: {
  status: { useQuery: () => ({ data: { configuration: { status: mocks.fields ? 'ready' : 'file_missing', hasSecret: !!mocks.fields, editable: mocks.editable, revision: 'none', fields: mocks.fields, issues: [] }, readiness: { salesEnabled: false, message: '正式收款关闭', purchasablePlans: 0, blockingReasons: [] }, plans: [], orders: [], livePaymentsVerified: false }, error: mocks.error ? new Error('连接中断') : null, isLoading: false, isFetching: false, refetch: mocks.refetch }) },
  orders: { useQuery: (input: unknown) => { mocks.search(input); return { data: { items: [], total: 0 }, isFetching: false, refetch: mocks.refetch } } },
  configure: { useMutation: () => ({ mutateAsync: mocks.save, reset: vi.fn(), isPending: false }) },
  reconcile: { useMutation: () => ({ mutateAsync: vi.fn(), isPending: false }) },
} } }))
const mount = () => render(<MemoryRouter><PaymentConfig appId="qa-app" /></MemoryRouter>)
const input = (label: string) => screen.getByLabelText(label) as HTMLInputElement
describe('Jeepay payment administration', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.fields = null; mocks.editable = true; mocks.error = false; mocks.refetch.mockResolvedValue({ data: {} }); mocks.save.mockResolvedValue({ saved: true }) })
  it('shows closed sales and a useful empty order state without pretending payment works', () => {
    mount()
    expect(screen.getByText('新订单销售关闭')).toBeTruthy()
    expect(screen.getByText('暂无订单，当前没有发生收款')).toBeTruthy()
    expect((screen.getByRole('button', { name: /保存商户配置/ }) as HTMLButtonElement).disabled).toBe(true)
    expect(mocks.save).not.toHaveBeenCalled()
  })
  it('submits one request, clears the credential after saving and keeps sales closed', async () => {
    let finish: () => void = () => {}
    mocks.save.mockImplementation(() => new Promise<void>(r => { finish = r }))
    mount()
    const values: Record<string, string> = { 'Jeepay API 根地址': 'https://gateway.example', '商户号': 'M1', '商户应用 ID': 'A1', '应用签名密钥': 'fixture-secret-for-testing-only-12345678', '收银台根地址': 'https://cashier.example', '支付回调地址': 'https://chatq.example/api/aikeyboard/payments/notify' }
    for (const [label, value] of Object.entries(values)) fireEvent.change(input(label), { target: { value } })
    const button = screen.getByRole('button', { name: /保存商户配置/ })
    fireEvent.click(button); fireEvent.click(button)
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1))
    expect(mocks.save.mock.calls[0][0].expectedRevision).toBe('none')
    expect(mocks.save.mock.calls[0][0].appId).toBe('qa-app')
    expect(mocks.save.mock.calls[0][0].enableSubscription).toBeUndefined()
    finish()
    await waitFor(() => expect(input('应用签名密钥').value).toBe(''))
  })
  it('read-only roles and failed status loads cannot save a merchant credential', () => {
    mocks.editable = false; mocks.error = true
    mount()
    expect(input('应用签名密钥').disabled).toBe(true)
    expect(screen.getByText('支付状态读取失败')).toBeTruthy()
    expect(mocks.save).not.toHaveBeenCalled()
  })
  it('searches only after explicit submission and retains the selected application', async () => {
    mount()
    const search = screen.getByLabelText('搜索支付订单')
    fireEvent.change(search, { target: { value: ' CQ123 ' } })
    expect(mocks.search.mock.lastCall?.[0].search).toBe('')
    fireEvent.keyDown(search, { key: 'Enter', code: 'Enter', charCode: 13 })
    await waitFor(() => expect(mocks.search.mock.lastCall?.[0]).toMatchObject({ appId: 'qa-app', search: 'CQ123', page: 1 }))
  })
})
