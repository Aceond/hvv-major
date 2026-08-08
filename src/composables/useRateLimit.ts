import { ref } from 'vue'

/**
 * 本地提交节流（防重复提交 + 连续失败指数退避）。
 * 注意：这只是前端兜底，真实防暴力破解必须依赖后端（见 Supabase SQL 脚本里的 auth.failed_login_attempts 表）。
 *
 * 行为：
 * 1. 同一 key 在提交期间再次调用会被直接忽略（防连点）。
 * 2. 连续失败累计 failCount，下一次 submit 前强制等待 delayMs（指数退避）。
 * 3. success 时 failCount 清零。
 */
export function useRateLimit(key: string, maxFailures = 5, baseDelayMs = 1500) {
  const submitting = ref(false)

  const storageKey = `rl:${key}:fails`
  const readFails = () => Number(localStorage.getItem(storageKey) || 0)
  const writeFails = (n: number) => localStorage.setItem(storageKey, String(n))
  const clearFails = () => localStorage.removeItem(storageKey)

  function currentDelayMs(): number {
    const fails = readFails()
    if (fails <= 1) return 0
    // 2 次失败 → 1.5s，3 次 → 3s，4 次 → 6s，5 次 → 12s，封顶
    return Math.min(baseDelayMs * 2 ** (fails - 2), 15_000)
  }

  async function sleep(ms: number) {
    return new Promise<void>((resolve) => setTimeout(resolve, ms))
  }

  async function submit<T>(fn: () => Promise<T>): Promise<T | undefined> {
    if (submitting.value) return undefined
    const delayMs = currentDelayMs()
    if (delayMs > 0) {
      submitting.value = true
      try {
        await sleep(delayMs)
      } finally {
        submitting.value = false
      }
    }
    if (submitting.value) return undefined
    if (readFails() >= maxFailures) {
      throw new Error(`操作过于频繁，请稍后再试（本地连续失败 ${maxFailures} 次）`)
    }
    submitting.value = true
    try {
      const res = await fn()
      clearFails()
      return res
    } catch (e) {
      writeFails(readFails() + 1)
      throw e
    } finally {
      submitting.value = false
    }
  }

  function reset() {
    clearFails()
  }

  return { submitting, submit, reset }
}
