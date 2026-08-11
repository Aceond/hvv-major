/** 时间格式化：兼容 ISO（带 T/秒/时区）与 'YYYY-MM-DD HH:mm'，统一输出「YYYY-MM-DD HH:mm」浏览器本地时区 */
export function formatDateTime(v: string | null | undefined): string {
  if (!v) return '-'
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(v)) return v
  const d = new Date(v)
  if (isNaN(d.getTime())) return v
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
