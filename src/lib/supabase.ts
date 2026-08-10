import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/** 是否已配置 Supabase 密钥（未配置时应用运行在演示模式） */
export const isSupabaseConfigured = Boolean(url && anonKey)

/** 请求超时时间（毫秒）：防止挂机/切后台后 token 刷新或网络异常时请求无限挂起 */
const REQUEST_TIMEOUT_MS = 10_000
/** Storage 上传超时（毫秒）：赛季截图体积较大，放宽到 60s，避免大图被 10s 兜底误杀 */
const UPLOAD_TIMEOUT_MS = 60_000

/**
 * 带超时的 fetch：超过对应超时时间自动 abort，
 * 避免请求长时间 pending 导致页面 loading 遮罩卡死、点击/导航无响应。
 * 普通请求 10s，Storage 上传（大图）60s。
 * supabase-js 会把 fetch 抛出的错误包装为 { data, error } 返回，不会向上 throw。
 */
const fetchWithTimeout: typeof fetch = (input, init) => {
  const controller = new AbortController()
  const rawUrl = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  const method = init?.method ?? 'GET'
  let bodySize = 0
  if (typeof init?.body === 'string') bodySize = init.body.length
  else if (init?.body instanceof ArrayBuffer) bodySize = init.body.byteLength
  else if (ArrayBuffer.isView(init?.body)) bodySize = init.body.byteLength
  // 请求体较大的请求（Storage 对象上传，或截图 data URL 随申请一并入库的大 JSON）放宽超时，
  // 避免大请求在慢速网络上被 10s 兜底误杀导致 Failed to fetch
  const isLarge =
    (rawUrl.includes('/storage/v1/object') && (method === 'POST' || method === 'PUT')) ||
    bodySize > 300_000
  const timeoutMs = isLarge ? UPLOAD_TIMEOUT_MS : REQUEST_TIMEOUT_MS
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  return fetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer))
}

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url, anonKey, { global: { fetch: fetchWithTimeout } })
  : null
