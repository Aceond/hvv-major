// 站点配置数据访问层（首页 hero 标题等，后台可修改）
// 未配置 Supabase（演示模式）时读写 localStorage 持久化。
import { supabase, isSupabaseConfigured } from '@/lib/supabase'

export interface SiteConfig {
  brand_title: string // 首页 hero 大标题，如 "HVV MAJOR 11"
  brand_overline: string // 标题上方一行小字
  brand_slogan: string // 标题下方标语
  notice: string // 赛事公告
}

export const DEFAULT_SITE_CONFIG: SiteConfig = {
  brand_title: 'HVV MAJOR 11',
  brand_overline: 'HVV MAJOR 2026 · COUNTER-STRIKE 2',
  brand_slogan: '战队报名 · 赛程赛制 · 积分排名 — 一站式 CS2 赛事平台',
  notice:
    '本系统为框架阶段骨架，赛程、比分与统计由管理员在后台录入维护。（此区域用于展示赛事公告）',
}

const STORAGE_KEY = 'hvv_site_config'

/** 读取站点配置 */
export async function getSiteConfig(): Promise<SiteConfig> {
  if (!isSupabaseConfigured || !supabase) {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) return { ...DEFAULT_SITE_CONFIG, ...JSON.parse(raw) }
    } catch {
      /* 忽略损坏的本地缓存 */
    }
    return { ...DEFAULT_SITE_CONFIG }
  }
  const { data } = await supabase
    .from('site_config')
    .select('brand_title, brand_overline, brand_slogan, notice')
    .eq('id', 1)
    .maybeSingle()
  if (data) return { ...DEFAULT_SITE_CONFIG, ...data }
  return { ...DEFAULT_SITE_CONFIG }
}

/** 更新站点配置（单行 upsert，仅管理员可调用） */
export async function updateSiteConfig(cfg: SiteConfig) {
  if (!isSupabaseConfigured || !supabase) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg))
    return
  }
  await supabase.from('site_config').upsert({ id: 1, ...cfg })
}
