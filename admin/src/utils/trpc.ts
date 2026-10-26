import { createTRPCReact } from '@trpc/react-query'
import { httpBatchLink } from '@trpc/client'
import { QueryClient } from '@tanstack/react-query'
import type { AppRouter } from '@app-manager/server'
import { message } from 'antd'
import { useAppStore } from '@/stores/appStore'

/**
 * tRPC React 客户端
 * 通过 createTRPCReact 创建，提供类型安全的 API 调用 hooks
 */
export const trpc = createTRPCReact<AppRouter>()

/**
 * React Query 客户端
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000, // 5 分钟
    },
  },
})

/**
 * 从 tRPC 错误中提取用户友好的错误信息
 */
function getErrorMessage(error: unknown): string {
  if (error instanceof TypeError && error.message === 'Failed to fetch') {
    return '网络连接失败，请检查网络设置'
  }
  const err = error as { data?: { code?: string; message?: string }; message?: string } | null
  if (err && typeof err === 'object' && err.data) {
    if (err.data.code === 'UNAUTHORIZED') return '认证失败，请重新登录'
    if (err.data.code === 'FORBIDDEN') return '权限不足，无法执行此操作'
    if (err.data.code === 'NOT_FOUND') return '请求的资源不存在'
    if (err.data.code === 'BAD_REQUEST') return err.data.message || '请求参数错误'
    if (err.data.code === 'TIMEOUT') return '请求超时，请稍后重试'
    if (err.data.code === 'INTERNAL_SERVER_ERROR') return '服务器内部错误，请联系管理员'
  }
  if (err && typeof err === 'object' && 'message' in err && typeof (err as Error).message === 'string') {
    return (err as Error).message
  }
  if (err && typeof err === 'object' && err.data?.message) return err.data.message
  return '操作失败，请稍后重试'
}

/**
 * tRPC 客户端实例
 * 配置 HTTP 批量请求链接，自动附带认证 Token 和当前 App ID
 */
export const trpcClient = trpc.createClient({
  links: [
    // Authentication and merchant mutations contain secrets; never log request payloads.
    httpBatchLink({
      url: '/api/trpc',
      headers() {
        const token = localStorage.getItem('admin_token')
        // 从 appStore 单一数据源读取当前 App ID，避免直接解析 localStorage 导致 key/结构变更遗漏
        const appId = useAppStore.getState().currentAppId

        return {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(appId ? { 'x-app-id': appId } : {}),
        }
      },
    }),
  ],
})

/**
 * 全局错误处理配置
 * 使用 mutation 的 onError 回调处理错误
 * 此函数可在需要全局错误处理的地方调用
 */
export function setupGlobalErrorHandler() {
  const defaults = queryClient.getDefaultOptions()
  const handleQueryError = (error: unknown) => {
    console.error('[Query Error]', error)
    const err = error as { data?: { code?: string } } | null
    if (err && typeof err === 'object' && err.data?.code === 'UNAUTHORIZED') {
      localStorage.removeItem('admin_token')
      window.location.href = '/login'
      return
    }
    message.error(getErrorMessage(error))
  }
  const handleMutationError = (error: unknown) => {
    console.error('[Mutation Error]', error)
    const err = error as { data?: { code?: string } } | null
    if (err && typeof err === 'object' && err.data?.code === 'UNAUTHORIZED') {
      localStorage.removeItem('admin_token')
      window.location.href = '/login'
      return
    }
    message.error(getErrorMessage(error))
  }
  queryClient.setDefaultOptions({
    ...defaults,
    queries: { ...defaults.queries, onError: handleQueryError } as typeof defaults.queries,
    mutations: { ...defaults.mutations, onError: handleMutationError } as typeof defaults.mutations,
  })
}
