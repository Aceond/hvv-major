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
