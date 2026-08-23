<script setup lang="ts">
import { computed } from 'vue'
import type { Match } from '@/api/types'
import { bracketRoundLabel, buildBracketTree, matchToSlot } from '@/lib/bracketTree'
import type { BracketTree } from '@/lib/bracketTree'
import { doubleElimRoundCounts, singleElimRoundCounts } from '@/lib/playoff'
import BracketTreeView from './BracketTree.vue'

const props = defineProps<{
  matches: Match[]
  stageName: string
}>()

function bracketOf(m: Match): 'wb' | 'lb' | 'gf' {
  return m.bracket ?? 'wb'
}

function groupByRound(ms: Match[]): Map<number, Match[]> {
  const map = new Map<number, Match[]>()
  for (const m of ms) {
    const r = m.round_number ?? 1
    let list = map.get(r)
    if (!list) {
      list = []
      map.set(r, list)
    }
    list.push(m)
  }
  return map
}

/** 双败结构（败者组轮次依赖胜者组第 1 轮场次），非 2 的幂时退化为单败树 */
function structureOf() {
  const wb = props.matches.filter((m) => bracketOf(m) === 'wb')
  const wbByRound = groupByRound(wb)
  if (wbByRound.size === 0) return null
  const base = Math.min(...wbByRound.keys())
  const firstCount = wbByRound.get(base)!.length
  const st = doubleElimRoundCounts(firstCount)
  return { base, st, stCounts: st ? st.wb : singleElimRoundCounts(firstCount) }
}

/** 胜者组树 */
const wbTree = computed<BracketTree>(() => {
  const s = structureOf()
  if (!s) return { rounds: [], width: 0, height: 0, links: [] }
  const wbByRound = groupByRound(props.matches.filter((m) => bracketOf(m) === 'wb'))
  const rounds = s.stCounts.map((count, ri) => ({
    label: bracketRoundLabel(ri, s.stCounts.length),
    count,
    slots: (wbByRound.get(s.base + ri) ?? []).map(matchToSlot),
  }))
  return buildBracketTree(rounds)
})

/** 败者组树（未开始/未创建轮次以占位槽显示） */
const lbTree = computed<BracketTree>(() => {
  const s = structureOf()
  if (!s || !s.st || s.st.lb.length === 0) return { rounds: [], width: 0, height: 0, links: [] }
  const lbByRound = groupByRound(props.matches.filter((m) => bracketOf(m) === 'lb'))
  const lbBase = lbByRound.size > 0 ? Math.min(...lbByRound.keys()) : 1
  const rounds = s.st.lb.map((count, ri) => ({
    label: `第 ${ri + 1} 轮`,
    count,
    slots: (lbByRound.get(lbBase + ri) ?? []).map(matchToSlot),
  }))
  return buildBracketTree(rounds)
})

/** 总决赛树（胜者组冠军 vs 败者组冠军） */
const gfTree = computed<BracketTree>(() => {
  const gf = props.matches.filter((m) => bracketOf(m) === 'gf')
  const count = Math.max(1, gf.length)
  return buildBracketTree([{ label: '总决赛', count, slots: gf.map(matchToSlot) }])
})
</script>

<template>
  <div class="deb">
    <div class="deb-header">
      <span class="deb-title">对阵图</span>
      <span class="deb-stage">{{ stageName }}</span>
      <span class="deb-legend">
        <span class="legend-dot wb" />胜者组&nbsp;<span class="legend-dot lb" />败者组
      </span>
    </div>

    <el-empty
      v-if="wbTree.rounds.length === 0"
      description="当前阶段暂无对阵，请管理员在后台创建"
    />

    <template v-else>
      <div class="deb-section">
        <div class="deb-section-title">胜者组</div>
        <BracketTreeView :tree="wbTree" />
      </div>

      <div v-if="lbTree.rounds.length > 0" class="deb-section">
        <div class="deb-section-title">败者组</div>
        <BracketTreeView :tree="lbTree" />
      </div>

      <div class="deb-section">
        <div class="deb-section-title">总决赛</div>
        <BracketTreeView :tree="gfTree" />
      </div>
    </template>
  </div>
</template>

<style scoped>
.deb-header {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.deb-title {
  font-size: 15px;
  font-weight: 700;
}

.deb-stage {
  color: var(--cs2-text-muted);
  font-size: 13px;
}

.deb-legend {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--cs2-text-muted);
}

.legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 2px;
  display: inline-block;
}

.legend-dot.wb {
  background: var(--cs2-accent);
}

.legend-dot.lb {
  background: var(--cs2-border, rgba(255, 255, 255, 0.25));
}

.deb-section {
  margin-bottom: 22px;
}

.deb-section:last-child {
  margin-bottom: 0;
}

.deb-section-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--cs2-accent);
  margin-bottom: 8px;
}
</style>
