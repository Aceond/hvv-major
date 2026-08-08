// 比赛解说人员数据访问层（每场比赛的解说，管理员 / 解说添加，观众可查看）
// 未配置 Supabase（演示模式）时使用内存存储；真实环境存 match_casters 表（RLS：公开可读，admin/caster 增删）。
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import type { MatchCaster } from './types'

// 演示模式下的解说名单（内存存储，刷新后清空）
const demoCasters: MatchCaster[] = [
  { id: 'caster-1', match_id: 'match-1', caster_name: '解说甲', created_at: '2026-08-01 10:00:00' },
  { id: 'caster-2', match_id: 'match-1', caster_name: '解说乙', created_at: '2026-08-01 10:05:00' },
  { id: 'caster-3', match_id: 'match-13', caster_name: '官方解说', created_at: '2026-08-02 09:00:00' },
]

/** 某场比赛的解说人员 */
export async function listMatchCasters(matchId: string): Promise<MatchCaster[]> {
  if (!isSupabaseConfigured || !supabase) {
    return demoCasters.filter((c) => c.match_id === matchId)
  }
  const { data } = await supabase
    .from('match_casters')
    .select('*')
    .eq('match_id', matchId)
    .order('created_at')
  return (data as MatchCaster[]) ?? []
}

/** 全部比赛的解说人员（赛程页一次拉取后按比赛分组） */
export async function listAllMatchCasters(): Promise<MatchCaster[]> {
  if (!isSupabaseConfigured || !supabase) return [...demoCasters]
  const { data } = await supabase
    .from('match_casters')
    .select('*')
    .order('created_at')
  return (data as MatchCaster[]) ?? []
}

/** 添加解说人员（管理员 / 解说） */
export async function addMatchCaster(matchId: string, casterName: string): Promise<MatchCaster | null> {
  if (!isSupabaseConfigured || !supabase) {
    const item: MatchCaster = {
      id: `caster-${Date.now()}`,
      match_id: matchId,
      caster_name: casterName,
      created_at: new Date().toISOString(),
    }
    demoCasters.push(item)
    return item
  }
  const { data } = await supabase
    .from('match_casters')
    .insert({ match_id: matchId, caster_name: casterName })
    .select('*')
    .single()
  return (data as MatchCaster) ?? null
}

/** 删除解说人员（管理员 / 解说） */
export async function removeMatchCaster(id: string): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase) {
    const idx = demoCasters.findIndex((c) => c.id === id)
    if (idx >= 0) demoCasters.splice(idx, 1)
    return idx >= 0
  }
  const { error } = await supabase.from('match_casters').delete().eq('id', id)
  return !error
}
