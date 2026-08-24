// 淘汰赛结构计算：单败 / 双败的轮次与场次，供对阵图展示与自动匹配共用
import type { Match } from '@/api/types'

export type BracketKind = 'wb' | 'lb' | 'gf'

export const BRACKET_LABEL: Record<BracketKind, string> = {
  wb: '胜者组',
  lb: '败者组',
  gf: '总决赛',
}

/** 按比分判定胜者（与赛程列表一致，避免历史 winner_id 不一致时标错） */
export function winnerOf(
  m: Pick<Match, 'status' | 'team_a_score' | 'team_b_score' | 'team_a_id' | 'team_b_id'> | null | undefined,
): string | null {
  if (!m || m.status !== 'completed') return null
  if (m.team_a_score > m.team_b_score) return m.team_a_id
  if (m.team_b_score > m.team_a_score) return m.team_b_id
  return null
}

/** 按比分判定败者 */
export function loserOf(
  m: Pick<Match, 'status' | 'team_a_score' | 'team_b_score' | 'team_a_id' | 'team_b_id'> | null | undefined,
): string | null {
  if (!m || m.status !== 'completed') return null
  if (m.team_a_score > m.team_b_score) return m.team_b_id
  if (m.team_b_score > m.team_a_score) return m.team_a_id
  return null
}

/** 单败骨架：第 1 轮有 n 场，每轮对半收缩到决赛 1 场 */
export function singleElimRoundCounts(firstRoundMatches: number): number[] {
  const counts = [firstRoundMatches]
  while (counts[counts.length - 1] > 1) counts.push(Math.ceil(counts[counts.length - 1] / 2))
  return counts
}

export interface DoubleElimStructure {
  k: number // 胜者组轮数（队伍数 = 2^k）
  wb: number[] // 胜者组每轮场次
  lb: number[] // 败者组每轮场次（不含总决赛）
}

/** 双败骨架：第 1 轮场次数需为 2 的幂（2/4/8/16…），否则返回 null */
export function doubleElimRoundCounts(firstRoundMatches: number): DoubleElimStructure | null {
  if (firstRoundMatches < 1) return null
  const k = Math.round(Math.log2(firstRoundMatches * 2))
  if (Math.pow(2, k) !== firstRoundMatches * 2) return null
  const wb = Array.from({ length: k }, (_, i) => Math.pow(2, k - 1 - i))
  const lb: number[] = []
  if (k >= 2) {
    // 败者组共 2k-2 轮：轮次 j（1 起）场次 = 2^(k-1-ceil(j/2))，形如 2,2,1,1,…
    for (let j = 1; j <= 2 * k - 2; j++) lb.push(Math.pow(2, k - 1 - Math.ceil(j / 2)))
  }
  return { k, wb, lb }
}

/** 高低配：第 i 名 vs 倒数第 i 名（1vs8、2vs7…；半区为 {1,8,2,7} 与 {3,6,4,5}） */
export function seedPairs(ids: string[]): Array<[string, string]> {
  const n = ids.length
  return Array.from({ length: Math.floor(n / 2) }, (_, i) => [ids[i], ids[n - 1 - i]])
}

/** 标准分区种子排列：1, N, N/2, N/2+1, N/4, …（保证 1,4,5,8 与 2,3,6,7 分属两半区）。仅支持 2 的幂，否则返回 null */
export function bracketSeedOrder(n: number): number[] | null {
  if (n < 2) return null
  const k = Math.round(Math.log2(n))
  if (Math.pow(2, k) !== n) return null
  if (n === 2) return [1, 2]
  const half = bracketSeedOrder(n / 2)
  if (!half) return null
  return [1, n, ...half.slice(1).flatMap((s) => [s, n - s + 1])]
}

/** 半区分组配对（按标准分区排列两两配对）：1v8、4v5、2v7、3v6 …（半区 {1,8,4,5} 与 {2,7,3,6}）。仅支持 2 的幂，否则返回 null */
export function halfSplitPairs(ids: string[]): Array<[string, string]> | null {
  const order = bracketSeedOrder(ids.length)
  if (!order) return null
  const pairs: Array<[string, string]> = []
  for (let i = 0; i < order.length; i += 2) {
    pairs.push([ids[order[i] - 1], ids[order[i + 1] - 1]])
  }
  return pairs
}
