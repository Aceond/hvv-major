// 淘汰赛自动匹配：管理员 / 队长任何入口录入比分后，自动把胜者 / 败者匹配到后续轮次
// 单败：胜者晋级下一轮；双败：胜者组胜者晋级胜者组下一轮、败者掉入败者组，败者组胜者续战、再败出局，
// 最后胜者组冠军 vs 败者组冠军打总决赛。
// 生成逻辑在前端计算（演示模式直接写 mock）；真实环境通过 security definer 的 RPC
// insert_playoff_matches 一次性批量插入，绕开 RLS 权限（队长也可触发，但只会插入真实结果推导出的对阵）。
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import type { Match } from './types'
import { listMatches, listStages } from './match'
import { createMatch } from './admin'
import {
  doubleElimRoundCounts,
  loserOf,
  singleElimRoundCounts,
  winnerOf,
} from '@/lib/playoff'

export interface PendingPlayoffMatch {
  round_number: number
  bracket: 'wb' | 'lb' | 'gf'
  team_a_id: string
  team_b_id: string
  best_of: number
}

function bracketOf(m: Match): 'wb' | 'lb' | 'gf' {
  return m.bracket ?? 'wb'
}

/** 是否已有同赛组同轮次、对阵双方一致的比赛（幂等去重，含本轮已计算出的对阵） */
function alreadyHas(
  pool: Match[],
  bracket: string,
  roundNumber: number,
  a: string | null,
  b: string | null,
): boolean {
  return pool.some(
    (m) =>
      bracketOf(m) === bracket &&
      m.round_number === roundNumber &&
      ((m.team_a_id === a && m.team_b_id === b) || (m.team_a_id === b && m.team_b_id === a)),
  )
}

/** 计算一对待创建对阵（去重后写入 out 与 pool） */
function pushPair(
  pool: Match[],
  out: PendingPlayoffMatch[],
  stageId: string,
  bracket: 'wb' | 'lb' | 'gf',
  roundNumber: number,
  a: string | null,
  b: string | null,
  bestOf: number,
) {
  if (!a || !b || a === b) return
  if (alreadyHas(pool, bracket, roundNumber, a, b)) return
  out.push({ round_number: roundNumber, bracket, team_a_id: a, team_b_id: b, best_of: bestOf || 1 })
  pool.push({
    id: `__auto-${bracket}-${roundNumber}-${a}-${b}`,
    stage_id: stageId,
    group_id: null,
    round_number: roundNumber,
    bracket,
    team_a_id: a,
    team_b_id: b,
    best_of: bestOf || 1,
    map: null,
    team_a_score: 0,
    team_b_score: 0,
    winner_id: null,
    status: 'scheduled',
    scheduled_at: null,
  } as Match)
}

/** 单败：胜者晋级下一轮（槽位 2j / 2j+1；决赛按阶段配置的总决赛赛制） */
function collectSingle(ms: Match[], gfBestOf: number): PendingPlayoffMatch[] {
  const pool = ms
  const out: PendingPlayoffMatch[] = []
  const wb = ms.filter((m) => bracketOf(m) === 'wb')
  const byRound = new Map<number, Match[]>()
  for (const m of wb) {
    const r = m.round_number
    let l = byRound.get(r)
    if (!l) {
      l = []
      byRound.set(r, l)
    }
    l.push(m)
  }
  const rns = [...byRound.keys()].sort((a, b) => a - b)
  if (rns.length === 0) return out
  const base = rns[0]
  const counts = singleElimRoundCounts(byRound.get(base)!.length)
  for (let ri = 0; ri < counts.length - 1; ri++) {
    const cur = byRound.get(base + ri) ?? []
    const isFinalRound = ri === counts.length - 2 // 由半决赛生成决赛
    for (let j = 0; j < Math.floor(counts[ri] / 2); j++) {
      const a = winnerOf(cur[2 * j])
      const b = winnerOf(cur[2 * j + 1])
      const bestOf = isFinalRound ? gfBestOf : cur[2 * j]?.best_of ?? 1
      pushPair(pool, out, cur[0].stage_id, 'wb', base + ri + 1, a, b, bestOf)
    }
  }
  return out
}

/** 双败：胜者组 / 败者组 / 总决赛。第 1 轮场次不是 2 的幂时返回 needPowerOfTwo */
function collectDouble(
  ms: Match[],
  gfBestOf: number,
): { pairs: PendingPlayoffMatch[]; needPowerOfTwo: boolean } {
  const pool = ms
  const out: PendingPlayoffMatch[] = []
  const wbAll = ms.filter((m) => bracketOf(m) === 'wb')
  const wbByRound = new Map<number, Match[]>()
  for (const m of wbAll) {
    const r = m.round_number
    let l = wbByRound.get(r)
    if (!l) {
      l = []
      wbByRound.set(r, l)
    }
    l.push(m)
  }
  const rns = [...wbByRound.keys()].sort((a, b) => a - b)
  if (rns.length === 0) return { pairs: out, needPowerOfTwo: false }
  const base = rns[0]
  const st = doubleElimRoundCounts(wbByRound.get(base)!.length)
  if (!st) return { pairs: out, needPowerOfTwo: true }
  const stageId = wbAll[0].stage_id
  const wbRound = (rn: number) => wbByRound.get(rn) ?? []
  const lbRound = (rn: number) => ms.filter((m) => bracketOf(m) === 'lb' && m.round_number === rn)

  // 胜者组晋级
  for (let ri = 0; ri < st.k - 1; ri++) {
    const cur = wbRound(base + ri)
    for (let j = 0; j < Math.floor(st.wb[ri] / 2); j++) {
      const a = winnerOf(cur[2 * j])
      const b = winnerOf(cur[2 * j + 1])
      pushPair(pool, out, stageId, 'wb', base + ri + 1, a, b, cur[2 * j]?.best_of ?? 1)
    }
  }

  // 败者组
  if (st.k >= 2) {
    // LB1：胜者组第 1 轮败者两两配对
    const wb1 = wbRound(base)
    for (let j = 0; j < st.lb[0]; j++) {
      const a = loserOf(wb1[2 * j])
      const b = loserOf(wb1[2 * j + 1])
      pushPair(pool, out, stageId, 'lb', 1, a, b, wb1[2 * j]?.best_of ?? 1)
    }
    // 偶数轮 LB(2s)：LB(2s-1) 胜者 vs 胜者组 WB(s+1) 败者
    for (let s = 1; s <= st.k - 1; s++) {
      const r = 2 * s
      const prev = lbRound(r - 1)
      const wbSrc = wbRound(base + s)
      for (let j = 0; j < st.lb[r - 1]; j++) {
        const a = winnerOf(prev[j])
        const b = loserOf(wbSrc[j])
        pushPair(pool, out, stageId, 'lb', r, a, b, wbSrc[j]?.best_of ?? prev[j]?.best_of ?? 1)
      }
    }
    // 奇数轮 LB(2s+1)：LB(2s) 胜者两两配对
    for (let s = 1; s <= st.k - 2; s++) {
      const r = 2 * s + 1
      const prev = lbRound(2 * s)
      for (let j = 0; j < Math.floor(st.lb[r - 1]); j++) {
        const a = winnerOf(prev[2 * j])
        const b = winnerOf(prev[2 * j + 1])
        pushPair(pool, out, stageId, 'lb', r, a, b, prev[2 * j]?.best_of ?? 1)
      }
    }
  }

  // 总决赛：胜者组冠军 vs 败者组冠军（2 队时同一场再战），赛制取阶段配置
  if (st.k >= 2) {
    const wbFinal = wbRound(base + st.k - 1)[0]
    const lbFinal = lbRound(2 * st.k - 2)[0]
    pushPair(pool, out, stageId, 'gf', base + st.k, winnerOf(wbFinal), winnerOf(lbFinal), gfBestOf)
  } else {
    const wb1 = wbRound(base)[0]
    pushPair(pool, out, stageId, 'gf', base + 1, winnerOf(wb1), loserOf(wb1), gfBestOf)
  }

  return { pairs: out, needPowerOfTwo: false }
}

/**
 * 按当前阶段已录入的比赛结果，自动匹配出后续所有能确定的对阵（幂等：已存在的对阵跳过）。
 * 总决赛赛制取阶段配置 final_best_of（BO3/BO5）。
 * 返回 { created, needPowerOfTwo }：needPowerOfTwo 表示双败赛制第 1 轮场次不是 2 的幂，无法自动匹配。
 */
export async function generatePlayoffNext(
  stageId: string,
  format: 'single_elim' | 'double_elim',
): Promise<{ created: number; needPowerOfTwo?: boolean }> {
  const ms = await listMatches(stageId)
  const stage = (await listStages()).find((s) => s.id === stageId)
  const gfBestOf = stage?.final_best_of === 5 ? 5 : 3
  const res =
    format === 'single_elim'
      ? { pairs: collectSingle(ms, gfBestOf), needPowerOfTwo: false }
      : collectDouble(ms, gfBestOf)
  if (res.needPowerOfTwo) return { created: 0, needPowerOfTwo: true }
  const pairs = res.pairs
  if (pairs.length === 0) return { created: 0 }
  if (!isSupabaseConfigured || !supabase) {
    // 演示模式：直接写 mock
    for (const p of pairs) await createMatch({ stage_id: stageId, ...p })
    return { created: pairs.length }
  }
  // 真实环境：一次 RPC 批量插入（security definer，管理员或参赛队队长均可调用）
  const { data, error } = await supabase.rpc('insert_playoff_matches', {
    p_stage_id: stageId,
    p_matches: pairs,
  })
  if (error) throw new Error(error.message)
  return { created: (data as number) ?? 0 }
}
