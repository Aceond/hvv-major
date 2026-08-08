import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/** 是否已配置 Supabase 密钥（未配置时应用运行在演示模式） */
export const isSupabaseConfigured = Boolean(url && anonKey)

/** 请求超时时间（毫秒）：防止挂机/切后台后 token 刷新或网络异常时请求无限挂起 */
const REQUEST_TIMEOUT_MS = 10_000

/**
 * 带超时的 fetch：超过 REQUEST_TIMEOUT_MS 自动 abort，
 * 避免请求长时间 pending 导致页面 loading 遮罩卡死、点击/导航无响应。
 * supabase-js 会把 fetch 抛出的错误包装为 { data, error } 返回，不会向上 throw。
 */
const fetchWithTimeout: typeof fetch = (input, init) => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  return fetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer))
}

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url, anonKey, { global: { fetch: fetchWithTimeout } })
  : null
