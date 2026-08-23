// 淘汰赛对阵图共享布局：把每一轮的槽位（真实对阵或占位）排成标准树形（横向），单败/双败共用
import type { Match } from '@/api/types'

export const BRACKET_DIM = {
  CARD_H: 64,
  SLOT_H: 96,
  COL_W: 190,
  GAP: 56,
  HEADER_H: 34,
} as const

/** 轮次标签：从最后一轮反推 决赛 / 半决赛 / 1/4 决赛…，兜底显示第 N 轮 */
export function bracketRoundLabel(ci: number, total: number): string {
  const depth = total - ci // 1 = 决赛
  if (depth === 1) return '决赛'
  if (depth === 2) return '半决赛'
  if (depth === 3) return '1/4 决赛'
  if (depth === 4) return '1/8 决赛'
  if (depth === 5) return '1/16 决赛'
  return `第 ${ci + 1} 轮`
}

/** 对阵槽位：真实对阵（已创建）或占位（未创建，显示待定） */
export interface TreeSlot {
  id: string
  real: boolean
  teamAName: string
  teamBName: string
  scoreA: number
  scoreB: number
  status: Match['status']
  bestOf: number
}

/** 单轮输入：该轮应有 count 个槽位，slots 为真实槽位（<= count，按视觉顺序） */
export interface TreeRoundInput {
  label: string
  count: number
  slots: TreeSlot[]
}

/** 构建结果：轮次（含行号）、整体宽高、连线路径 */
export interface BracketTree {
  rounds: Array<{ label: string; slots: Array<{ slot: TreeSlot; row: number }> }>
  width: number
  height: number
  links: Array<{ id: string; d: string }>
}

export function matchToSlot(m: Match): TreeSlot {
  return {
    id: m.id,
    real: true,
    teamAName: m.team_a_name ?? '待定',
    teamBName: m.team_b_name ?? '待定',
    scoreA: m.team_a_score,
    scoreB: m.team_b_score,
    status: m.status,
    bestOf: m.best_of,
  }
}

function placeholderSlot(roundIdx: number, slotIdx: number): TreeSlot {
  return {
    id: `ph-${roundIdx}-${slotIdx}`,
    real: false,
    teamAName: '待定',
    teamBName: '待定',
    scoreA: 0,
    scoreB: 0,
    status: 'scheduled',
    bestOf: 1,
  }
}

/** 构建树形对阵图：占位补齐每轮 count 个槽位，行号居中于父区间，输出连线路径 */
export function buildBracketTree(rounds: TreeRoundInput[]): BracketTree {
  const { CARD_H, SLOT_H, COL_W, GAP, HEADER_H } = BRACKET_DIM
  if (rounds.length === 0) return { rounds: [], width: 0, height: 0, links: [] }

  const filled = rounds.map((r, ri) => ({
    label: r.label,
    slots: Array.from({ length: r.count }, (_, si) => {
      const slot = r.slots[si] ?? placeholderSlot(ri, si)
      return { slot, row: 0 }
    }),
  }))

  // 行号：第 1 轮顺排，之后每轮的槽位居中于其父槽位区间
  filled[0].slots.forEach((s, i) => (s.row = i))
  for (let ri = 1; ri < filled.length; ri++) {
    const prev = filled[ri - 1]
    const cur = filled[ri]
    cur.slots.forEach((s, si) => {
      const start = Math.floor((si * prev.slots.length) / cur.slots.length)
      const end = Math.max(start, Math.floor(((si + 1) * prev.slots.length) / cur.slots.length) - 1)
      const rows = prev.slots.slice(start, end + 1).map((p) => p.row)
      s.row = rows.reduce((a, b) => a + b, 0) / rows.length
    })
  }
  // 最小间距修正：同轮内的槽位垂直方向不重叠
  for (const r of filled) {
    r.slots.sort((a, b) => a.row - b.row)
    for (let i = 1; i < r.slots.length; i++) {
      if (r.slots[i].row <= r.slots[i - 1].row) r.slots[i].row = r.slots[i - 1].row + 1
    }
  }

  // 连线：后一轮槽位 → 其父区间内前一轮槽位（肘形折线）
  const links: Array<{ id: string; d: string }> = []
  for (let ri = 1; ri < filled.length; ri++) {
    const prev = filled[ri - 1]
    const cur = filled[ri]
    cur.slots.forEach((s, si) => {
      const start = Math.floor((si * prev.slots.length) / cur.slots.length)
      const end = Math.max(start, Math.floor(((si + 1) * prev.slots.length) / cur.slots.length) - 1)
      for (let pi = start; pi <= end; pi++) {
        const p = prev.slots[pi]
        const x1 = (ri - 1) * (COL_W + GAP) + COL_W
        const y1 = HEADER_H + p.row * SLOT_H + CARD_H / 2
        const xp = ri * (COL_W + GAP)
        const yp = HEADER_H + s.row * SLOT_H + CARD_H / 2
        const midX = (x1 + xp) / 2
        links.push({
          id: `l-${ri}-${si}-${pi}`,
          d: `M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${yp} L ${xp} ${yp}`,
        })
      }
    })
  }

  const maxRow = Math.max(0, ...filled.flatMap((r) => r.slots.map((s) => s.row)))
  const width = filled.length * (COL_W + GAP) + COL_W
  const height = HEADER_H + (maxRow + 1) * SLOT_H
  return { rounds: filled, width, height, links }
}
