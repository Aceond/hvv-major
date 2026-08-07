// 比赛媒体链接数据访问层（每场比赛的直播 / 录像 / 其他，管理员登记，观众可查看）
// 未配置 Supabase（演示模式）时使用内存存储；真实环境存 match_media 表（RLS：公开可读，管理员增删）。
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import type { MatchMedia, MediaKind } from './types'

// 演示模式下的媒体链接（内存存储，刷新后清空）
const demoMedia: MatchMedia[] = []

/** 某场比赛的媒体链接（直播 / 录像 / 其他） */
export async function listMatchMedia(matchId: string): Promise<MatchMedia[]> {
  if (!isSupabaseConfigured || !supabase) {
    return demoMedia.filter((m) => m.match_id === matchId)
  }
  const { data } = await supabase
    .from('match_media')
    .select('*')
    .eq('match_id', matchId)
    .order('created_at')
  return (data as MatchMedia[]) ?? []
}

/** 全部比赛的媒体链接（赛程页一次拉取后按比赛分组） */
export async function listAllMatchMedia(): Promise<MatchMedia[]> {
  if (!isSupabaseConfigured || !supabase) return [...demoMedia]
  const { data } = await supabase
    .from('match_media')
    .select('*')
    .order('created_at')
  return (data as MatchMedia[]) ?? []
}

/** 管理员登记一条媒体链接 */
export async function addMatchMedia(
  matchId: string,
  kind: MediaKind,
  label: string,
  url: string,
): Promise<MatchMedia | null> {
  if (!isSupabaseConfigured || !supabase) {
    const item: MatchMedia = {
      id: `media-${Date.now()}`,
      match_id: matchId,
      kind,
      label,
      url,
      created_at: new Date().toISOString(),
    }
    demoMedia.push(item)
    return item
  }
  const { data } = await supabase
    .from('match_media')
    .insert({ match_id: matchId, kind, label, url })
    .select('*')
    .single()
  return (data as MatchMedia) ?? null
}

/** 管理员删除一条媒体链接 */
export async function removeMatchMedia(id: string): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase) {
    const idx = demoMedia.findIndex((m) => m.id === id)
    if (idx >= 0) demoMedia.splice(idx, 1)
    return idx >= 0
  }
  const { error } = await supabase.from('match_media').delete().eq('id', id)
  return !error
}
