<script setup lang="ts">
import { computed } from 'vue'
import type { Match } from '@/api/types'
import { bracketRoundLabel, buildBracketTree, matchToSlot } from '@/lib/bracketTree'
import type { BracketTree } from '@/lib/bracketTree'
import { singleElimRoundCounts } from '@/lib/playoff'
import BracketTreeView from './BracketTree.vue'

const props = defineProps<{
  matches: Match[]
  stageName: string
}>()

/** 单败淘汰对阵图：以第 1 轮对阵数为底生成完整赛程树，未创建轮次以占位槽显示 */
const tree = computed<BracketTree>(() => {
  const ms = props.matches
  if (ms.length === 0) return { rounds: [], width: 0, height: 0, links: [] }
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
  const rns = [...byRound.keys()].sort((a, b) => a - b)
  const base = rns[0]
  const counts = singleElimRoundCounts(byRound.get(base)!.length)
  const rounds = counts.map((count, ri) => ({
    label: bracketRoundLabel(ri, counts.length),
    count,
    slots: (byRound.get(base + ri) ?? []).map(matchToSlot),
  }))
  return buildBracketTree(rounds)
})
</script>

<template>
  <div class="kb">
    <div class="kb-header">
      <span class="kb-title">对阵图</span>
      <span class="kb-stage">{{ stageName }}</span>
    </div>

    <el-empty
      v-if="tree.rounds.length === 0"
      description="当前阶段暂无对阵，请管理员在后台创建"
    />

    <BracketTreeView v-else :tree="tree" />
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
</style>
