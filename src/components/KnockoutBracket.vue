<script setup lang="ts">
import { computed } from 'vue'
import type { Match } from '@/api/types'
import { MATCH_STATUS_LABEL } from '@/api/types'

const props = defineProps<{
  matches: Match[]
  stageName: string
}>()

// 布局尺寸（px）：卡片宽高 / 每场垂直槽位 / 列间距
const CARD_H = 64
const SLOT_H = 96
const COL_W = 190
const GAP = 56
const HEADER_H = 34

/** 轮次标签：从最后一轮反推 决赛 / 半决赛 / 1/4 决赛…，兜底显示第 N 轮 */
function roundLabel(ci: number, total: number): string {
  const depth = total - ci // 1 = 决赛
  if (depth === 1) return '决赛'
  if (depth === 2) return '半决赛'
  if (depth === 3) return '1/4 决赛'
  if (depth === 4) return '1/8 决赛'
  if (depth === 5) return '1/16 决赛'
  return `第 ${ci + 1} 轮`
}

/** 对阵槽位：真实对阵（已创建）或占位（后续轮次未创建，显示待定） */
interface Slot {
  id: string
  real: boolean
  teamAName: string
  teamBName: string
  scoreA: number
  scoreB: number
  status: Match['status']
  bestOf: number
}

interface RoundCol {
  index: number
  label: string
  slots: Array<{ slot: Slot; row: number }>
}

interface BracketResult {
  rounds: RoundCol[]
  width: number
  height: number
  links: Array<{ id: string; d: string }>
}

const bracket = computed<BracketResult>(() => {
  const ms = props.matches
  if (ms.length === 0) return { rounds: [], width: 0, height: 0, links: [] }

  // 按轮次分组（round_number 升序）
  const byRound = new Map<number, Match[]>()
  for (const m of ms) {
    const r = m.round_number ?? 1
    let list = byRound.get(r)
    if (!list) {
      list = []
      byRound.set(r, list)
    }
    list.push(m)
  }
  const roundNums = [...byRound.keys()].sort((a, b) => a - b)
  const counts = roundNums.map((rn) => byRound.get(rn)!.length)

  // 完整赛程骨架：以最宽的轮（第 1 轮）为底，每往后一轮对半收缩，一路补齐到「决赛」1 场。
  // 尚未创建的对阵（后续轮次没提交）以占位槽显示「待定」。
  const slotCounts: number[] = [counts[0]]
  for (let i = 1; i < counts.length; i++) {
    slotCounts.push(Math.max(Math.ceil(slotCounts[i - 1] / 2), counts[i]))
  }
  while (slotCounts[slotCounts.length - 1] > 1) {
    slotCounts.push(Math.ceil(slotCounts[slotCounts.length - 1] / 2))
  }

  // 组装槽位：真实对阵按创建顺序填入，其余为占位
  const rounds: RoundCol[] = slotCounts.map((count, ri) => {
    const realMatches = ri < roundNums.length ? byRound.get(roundNums[ri])! : []
    const slots: Array<{ slot: Slot; row: number }> = []
    for (let si = 0; si < count; si++) {
      const m = realMatches[si] ?? null
      slots.push({
        slot: m
          ? {
              id: m.id,
              real: true,
              teamAName: m.team_a_name ?? '待定',
              teamBName: m.team_b_name ?? '待定',
              scoreA: m.team_a_score,
              scoreB: m.team_b_score,
              status: m.status,
              bestOf: m.best_of,
            }
          : {
              id: `ph-${ri}-${si}`,
              real: false,
              teamAName: '待定',
              teamBName: '待定',
              scoreA: 0,
              scoreB: 0,
              status: 'scheduled',
              bestOf: 1,
            },
        row: 0,
      })
    }
    return { index: ri, label: roundLabel(ri, slotCounts.length), slots }
  })

  // 行号：第 1 轮顺排，之后每轮的槽位居中于其父槽位区间（标准树形对阵图）
  rounds[0].slots.forEach((s, i) => (s.row = i))
  for (let ri = 1; ri < rounds.length; ri++) {
    const prev = rounds[ri - 1]
    const cur = rounds[ri]
    cur.slots.forEach((s, si) => {
      const start = Math.floor((si * prev.slots.length) / cur.slots.length)
      const end = Math.max(start, Math.floor(((si + 1) * prev.slots.length) / cur.slots.length) - 1)
      const rows = prev.slots.slice(start, end + 1).map((p) => p.row)
      s.row = rows.reduce((a, b) => a + b, 0) / rows.length
    })
  }
  // 最小间距修正：同轮内的槽位垂直方向不重叠
  for (const r of rounds) {
    r.slots.sort((a, b) => a.row - b.row)
    for (let i = 1; i < r.slots.length; i++) {
      if (r.slots[i].row <= r.slots[i - 1].row) r.slots[i].row = r.slots[i - 1].row + 1
    }
  }

  // 连线：后一轮槽位 → 其父区间内前一轮槽位（肘形折线）
  const links: Array<{ id: string; d: string }> = []
  for (let ri = 1; ri < rounds.length; ri++) {
    const prev = rounds[ri - 1]
    const cur = rounds[ri]
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

  const maxRow = Math.max(0, ...rounds.flatMap((r) => r.slots.map((s) => s.row)))
  const width = rounds.length * (COL_W + GAP) + COL_W
  const height = HEADER_H + (maxRow + 1) * SLOT_H
  return { rounds, width, height, links }
})

function cardStyle(col: number, row: number) {
  return {
    left: `${col * (COL_W + GAP)}px`,
    top: `${HEADER_H + row * SLOT_H}px`,
    width: `${COL_W}px`,
    height: `${CARD_H}px`,
  }
}
</script>

<template>
  <div class="kb" :style="{ width: bracket.width + 'px' }">
    <div class="kb-header">
      <span class="kb-title">对阵图</span>
      <span class="kb-stage">{{ stageName }}</span>
    </div>

    <el-empty
      v-if="bracket.rounds.length === 0"
      description="当前阶段暂无对阵，请管理员在后台创建"
    />

    <div
      v-else
      class="kb-body"
      :style="{ width: bracket.width + 'px', height: bracket.height + 'px' }"
    >
      <!-- 轮次标题 -->
      <div
        v-for="(r, i) in bracket.rounds"
        :key="`h-${r.index}`"
        class="kb-round-head"
        :style="{ left: i * (COL_W + GAP) + 'px', width: COL_W + 'px' }"
      >
        <span>{{ r.label }}</span>
        <span class="kb-round-num">第 {{ i + 1 }} 轮</span>
      </div>

      <!-- 连线 -->
      <svg class="kb-svg" :width="bracket.width" :height="bracket.height">
        <path
          v-for="link in bracket.links"
          :key="link.id"
          :d="link.d"
          class="kb-line"
          fill="none"
        />
      </svg>

      <!-- 对阵卡片（含未创建轮次的占位槽） -->
      <template v-for="(r, ri) in bracket.rounds" :key="r.index">
        <div
          v-for="s in r.slots"
          :key="s.slot.id"
          class="kb-card"
          :class="{ completed: s.slot.real && s.slot.status === 'completed', placeholder: !s.slot.real }"
          :style="cardStyle(ri, s.row)"
        >
          <div class="kb-matchup">
            <span
              class="kb-team"
              :class="{ win: s.slot.real && s.slot.status === 'completed' && s.slot.scoreA > s.slot.scoreB }"
            >
              {{ s.slot.teamAName }}
            </span>
            <span class="kb-score">{{ s.slot.real ? `${s.slot.scoreA}:${s.slot.scoreB}` : '-' }}</span>
            <span
              class="kb-team"
              :class="{ win: s.slot.real && s.slot.status === 'completed' && s.slot.scoreB > s.slot.scoreA }"
            >
              {{ s.slot.teamBName }}
            </span>
          </div>
          <div class="kb-meta">
            <span v-if="s.slot.real">BO{{ s.slot.bestOf }}</span>
            <span v-else>等待创建</span>
            <span v-if="s.slot.real" class="kb-status" :class="s.slot.status">
              {{ MATCH_STATUS_LABEL[s.slot.status as Match['status']] }}
            </span>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.kb-header {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin-bottom: 16px;
}

.kb-title {
  font-size: 15px;
  font-weight: 700;
}

.kb-stage {
  color: var(--cs2-text-muted);
  font-size: 13px;
}

.kb-body {
  position: relative;
  overflow-x: auto;
}

.kb-round-head {
  position: absolute;
  top: 0;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 4px;
  font-size: 13px;
  font-weight: 700;
  color: var(--cs2-accent);
}

.kb-round-num {
  font-size: 12px;
  font-weight: 400;
  color: var(--cs2-text-muted);
}

.kb-svg {
  position: absolute;
  top: 0;
  left: 0;
  pointer-events: none;
}

.kb-line {
  stroke: var(--cs2-border, rgba(255, 255, 255, 0.25));
  stroke-width: 1.5;
}

.kb-card {
  position: absolute;
  background: var(--cs2-panel-2);
  border: 1px solid var(--cs2-border);
  border-radius: 6px;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  box-sizing: border-box;
}

.kb-card.completed {
  border-color: rgba(103, 194, 58, 0.5);
}

/* 未创建对阵的占位槽：虚线 + 弱化，示意赛程待定 */
.kb-card.placeholder {
  border-style: dashed;
  opacity: 0.55;
}

.kb-matchup {
  display: flex;
  align-items: center;
  gap: 6px;
}

.kb-team {
  flex: 1;
  font-size: 13px;
  color: var(--cs2-text-regular, #c6ccd8);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.kb-team.win {
  color: #67c23a;
  font-weight: 700;
}

.kb-score {
  font-weight: 700;
  color: var(--cs2-accent);
  white-space: nowrap;
}

.kb-meta {
  display: flex;
  justify-content: space-between;
  margin-top: 4px;
  font-size: 12px;
  color: var(--cs2-text-muted);
}

.kb-status.completed {
  color: #67c23a;
}

.kb-status.scheduled {
  color: #e6a23c;
}

.kb-status.cancelled {
  color: #f56c6c;
}
</style>
