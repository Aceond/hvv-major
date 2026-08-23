// 淘汰赛自动匹配：管理员只需生成第 1 轮，后续轮次按比赛结果自动匹配胜者 / 败者
// 单败：胜者晋级下一轮；双败：胜者组胜者晋级胜者组下一轮、败者掉入败者组，败者组胜者续战、再败出局，最后胜者组冠军 vs 败者组冠军打总决赛。
import type { Match } from './types'
import { listMatches } from './match'
import { createMatch } from './admin'
import {
  doubleElimRoundCounts,
  loserOf,
  singleElimRoundCounts,
  winnerOf,
} from '@/lib/playoff'

function bracketOf(m: Match): 'wb' | 'lb' | 'gf' {
  return m.bracket ?? 'wb'
}

/** 在既有对阵中查找同赛组同轮次、对阵双方一致的比赛（幂等去重，含本轮已新建的） */
function findSame(
  pool: Match[],
  bracket: string,
  roundNumber: number,
  a: string | null,
  b: string | null,
): Match | undefined {
  return pool.find(
    (m) =>
      bracketOf(m) === bracket &&
      m.round_number === roundNumber &&
      ((m.team_a_id === a && m.team_b_id === b) || (m.team_a_id === b && m.team_b_id === a)),
  )
}

/** 确保某场对阵存在：双方已确定且未创建时创建；创建后写入 pool 以便本轮去重 */
async function ensureMatch(
  pool: Match[],
  stageId: string,
  bracket: 'wb' | 'lb' | 'gf',
  roundNumber: number,
  a: string | null,
  b: string | null,
  bestOf: number,
): Promise<boolean> {
  if (!a || !b || a === b) return false
  if (findSame(pool, bracket, roundNumber, a, b)) return false
  await createMatch({
    stage_id: stageId,
    round_number: roundNumber,
    bracket,
    team_a_id: a,
    team_b_id: b,
    best_of: bestOf || 1,
  })
  // 记录到 pool，避免本轮后续槽位重复创建
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
  return true
}

/** 单败：胜者晋级下一轮（高低配槽位 2j / 2j+1） */
async function generateSingleElim(stageId: string, ms: Match[]): Promise<number> {
  const pool = ms
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
  if (rns.length === 0) return 0
  const base = rns[0]
  const counts = singleElimRoundCounts(byRound.get(base)!.length)
  let created = 0
  for (let ri = 0; ri < counts.length - 1; ri++) {
    const cur = byRound.get(base + ri) ?? []
    for (let j = 0; j < Math.floor(counts[ri] / 2); j++) {
      const a = winnerOf(cur[2 * j])
      const b = winnerOf(cur[2 * j + 1])
      if (a && b && (await ensureMatch(pool, stageId, 'wb', base + ri + 1, a, b, cur[2 * j]?.best_of ?? 1))) created++
    }
  }
  return created
}

/** 双败：胜者组胜者晋级、败者掉败者组；败者组胜者续战；最后总决赛 */
async function generateDoubleElim(stageId: string, ms: Match[]): Promise<number | 'needPowerOfTwo'> {
  const pool = ms
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
  if (rns.length === 0) return 0
  const base = rns[0]
  const st = doubleElimRoundCounts(wbByRound.get(base)!.length)
  if (!st) return 'needPowerOfTwo'
  const wbRound = (rn: number) => wbByRound.get(rn) ?? []
  const lbRound = (rn: number) => ms.filter((m) => bracketOf(m) === 'lb' && m.round_number === rn)

  let created = 0

  // 胜者组晋级
  for (let ri = 0; ri < st.k - 1; ri++) {
    const cur = wbRound(base + ri)
    for (let j = 0; j < Math.floor(st.wb[ri] / 2); j++) {
      const a = winnerOf(cur[2 * j])
      const b = winnerOf(cur[2 * j + 1])
      if (a && b && (await ensureMatch(pool, stageId, 'wb', base + ri + 1, a, b, cur[2 * j]?.best_of ?? 1))) created++
    }
  }

  // 败者组
  if (st.k >= 2) {
    // LB1：胜者组第 1 轮败者两两配对（槽位 2j / 2j+1）
    const wb1 = wbRound(base)
    for (let j = 0; j < st.lb[0]; j++) {
      const a = loserOf(wb1[2 * j])
      const b = loserOf(wb1[2 * j + 1])
      if (a && b && (await ensureMatch(pool, stageId, 'lb', 1, a, b, wb1[2 * j]?.best_of ?? 1))) created++
    }
    // 偶数轮 LB(2s)（s=1..k-1）：LB(2s-1) 胜者 vs 胜者组 WB(s+1) 败者
    for (let s = 1; s <= st.k - 1; s++) {
      const r = 2 * s
      const prev = lbRound(r - 1)
      const wbSrc = wbRound(base + s)
      for (let j = 0; j < st.lb[r - 1]; j++) {
        const a = winnerOf(prev[j])
        const b = loserOf(wbSrc[j])
        if (a && b && (await ensureMatch(pool, stageId, 'lb', r, a, b, wbSrc[j]?.best_of ?? 1))) created++
      }
    }
    // 奇数轮 LB(2s+1)（s=1..k-2）：LB(2s) 胜者两两配对
    for (let s = 1; s <= st.k - 2; s++) {
      const r = 2 * s + 1
      const prev = lbRound(2 * s)
      for (let j = 0; j < Math.floor(st.lb[r - 1]); j++) {
        const a = winnerOf(prev[2 * j])
        const b = winnerOf(prev[2 * j + 1])
        if (a && b && (await ensureMatch(pool, stageId, 'lb', r, a, b, prev[2 * j]?.best_of ?? 1))) created++
      }
    }
  }

  // 总决赛：胜者组冠军 vs 败者组冠军（2 队时即同一场再战）
  if (st.k >= 2) {
    const wbFinal = wbRound(base + st.k - 1)[0]
    const lbFinal = lbRound(2 * st.k - 2)[0]
    const a = winnerOf(wbFinal)
    const b = winnerOf(lbFinal)
    if (a && b && (await ensureMatch(pool, stageId, 'gf', base + st.k, a, b, wbFinal?.best_of ?? 1))) created++
  } else {
    const wb1 = wbRound(base)[0]
    const a = winnerOf(wb1)
    const b = loserOf(wb1)
    if (a && b && (await ensureMatch(pool, stageId, 'gf', base + 1, a, b, wb1?.best_of ?? 1))) created++
  }

  return created
}

/**
 * 按当前阶段已录入的比赛结果，自动匹配出后续所有能确定的对阵（幂等：已存在的对阵跳过）。
 * 返回 { created, needPowerOfTwo }：needPowerOfTwo 表示双败赛制第 1 轮场次不是 2 的幂，无法自动匹配。
 */
export async function generatePlayoffNext(
  stageId: string,
  format: 'single_elim' | 'double_elim',
): Promise<{ created: number; needPowerOfTwo?: boolean }> {
  const ms = await listMatches(stageId)
  if (format === 'single_elim') {
    return { created: await generateSingleElim(stageId, ms) }
  }
  const res = await generateDoubleElim(stageId, ms)
  if (res === 'needPowerOfTwo') return { created: 0, needPowerOfTwo: true }
  return { created: res }
}
