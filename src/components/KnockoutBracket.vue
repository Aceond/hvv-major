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

/** 按比分判定胜者（与赛程列表一致，避免历史 winner_id 不一致时标错） */
function matchWinner(m: Match): string | null {
  if (m.status !== 'completed') return null
  if (m.team_a_score > m.team_b_score) return m.team_a_id
  if (m.team_b_score > m.team_a_score) return m.team_b_id
  return null
}

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

interface RoundCol {
  number: number
  label: string
  nodes: Array<{ match: Match; col: number; row: number }>
}

interface BracketResult {
  rounds: RoundCol[]
  width: number
  height: number
  links: Array<{ id: string; d: string }>
}

const bracket = computed<BracketResult>(() => {
  const ms = props.matches
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
  if (roundNums.length === 0) return { rounds: [], width: 0, height: 0, links: [] }

  const rowOf = new Map<string, number>() // matchId -> row
  const rounds: RoundCol[] = []
  let maxRow = 0

  for (let ci = 0; ci < roundNums.length; ci++) {
    const list = byRound.get(roundNums[ci])!
    const prevList = ci > 0 ? byRound.get(roundNums[ci - 1])! : []
    const nodes: RoundCol['nodes'] = []
    let cursor = 0
    for (const m of list) {
      let row: number
      if (ci === 0) {
        row = cursor++
      } else {
        // 后一轮对阵对齐其前一轮的两个胜者（取中点）；无胜者信息（未录比分）时顺延排布
        const feeders = prevList.filter(
          (p) => matchWinner(p) === m.team_a_id || matchWinner(p) === m.team_b_id,
        )
        if (feeders.length >= 2) {
          const r1 = rowOf.get(feeders[0].id) ?? 0
          const r2 = rowOf.get(feeders[1].id) ?? 1
          row = (r1 + r2) / 2
        } else {
          row = cursor++ * 2
        }
      }
      nodes.push({ match: m, col: ci, row })
      rowOf.set(m.id, row)
      maxRow = Math.max(maxRow, row)
    }
    rounds.push({ number: roundNums[ci], label: roundLabel(ci, roundNums.length), nodes })
  }

  // 连线：后一轮对阵 → 前一轮两个胜者
  const links: Array<{ id: string; d: string }> = []
  for (let ci = 1; ci < rounds.length; ci++) {
    const prev = rounds[ci - 1]
    const cur = rounds[ci]
    for (const node of cur.nodes) {
      const feeders = prev.nodes.filter(
        (n) => matchWinner(n.match) === node.match.team_a_id || matchWinner(n.match) === node.match.team_b_id,
      )
      for (const f of feeders) {
        const x1 = f.col * (COL_W + GAP) + COL_W
        const y1 = HEADER_H + f.row * SLOT_H + CARD_H / 2
        const xp = node.col * (COL_W + GAP)
        const yp = HEADER_H + node.row * SLOT_H + CARD_H / 2
        const midX = (x1 + xp) / 2
        links.push({
          id: `${f.match.id}-${node.match.id}`,
          d: `M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${yp} L ${xp} ${yp}`,
        })
      }
    }
  }

  const width = rounds.length * (COL_W + GAP) + COL_W
  const height = HEADER_H + (maxRow + 1) * SLOT_H
  return { rounds, width, height, links }
})

/** 平铺全部节点用于绝对定位渲染 */
const allNodes = computed(() => bracket.value.rounds.flatMap((r) => r.nodes))

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
        :key="`h-${r.number}`"
        class="kb-round-head"
        :style="{ left: i * (COL_W + GAP) + 'px', width: COL_W + 'px' }"
      >
        <span>{{ r.label }}</span>
        <span class="kb-round-num">第 {{ r.number }} 轮</span>
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

      <!-- 对阵卡片 -->
      <div
        v-for="n in allNodes"
        :key="n.match.id"
        class="kb-card"
        :class="{ completed: n.match.status === 'completed' }"
        :style="cardStyle(n.col, n.row)"
      >
        <div class="kb-matchup">
          <span
            class="kb-team"
            :class="{ win: n.match.status === 'completed' && n.match.team_a_score > n.match.team_b_score }"
          >
            {{ n.match.team_a_name ?? '待定' }}
          </span>
          <span class="kb-score">{{ n.match.team_a_score }}:{{ n.match.team_b_score }}</span>
          <span
            class="kb-team"
            :class="{ win: n.match.status === 'completed' && n.match.team_b_score > n.match.team_a_score }"
          >
            {{ n.match.team_b_name ?? '待定' }}
          </span>
        </div>
        <div class="kb-meta">
          <span>BO{{ n.match.best_of }}</span>
          <span class="kb-status" :class="n.match.status">
            {{ MATCH_STATUS_LABEL[n.match.status as Match['status']] }}
          </span>
        </div>
      </div>
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
