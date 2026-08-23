<script setup lang="ts">
import { BRACKET_DIM } from '@/lib/bracketTree'
import type { BracketTree } from '@/lib/bracketTree'
import BracketCard from './BracketCard.vue'

defineProps<{ tree: BracketTree }>()
</script>

<template>
  <div
    class="bt"
    :style="{ width: tree.width + 'px', height: tree.height + 'px' }"
  >
    <!-- 轮次标题 -->
    <div
      v-for="(r, i) in tree.rounds"
      :key="`h-${i}`"
      class="bt-round-head"
      :style="{ left: i * (BRACKET_DIM.COL_W + BRACKET_DIM.GAP) + 'px', width: BRACKET_DIM.COL_W + 'px' }"
    >
      <span>{{ r.label }}</span>
      <span class="bt-round-num">第 {{ i + 1 }} 轮</span>
    </div>

    <!-- 连线 -->
    <svg class="bt-svg" :width="tree.width" :height="tree.height">
      <path
        v-for="link in tree.links"
        :key="link.id"
        :d="link.d"
        class="bt-line"
        fill="none"
      />
    </svg>

    <!-- 对阵卡片（含未创建轮次的占位槽） -->
    <template v-for="(r, ri) in tree.rounds" :key="`r-${ri}`">
      <BracketCard
        v-for="s in r.slots"
        :key="s.slot.id"
        :slot="s.slot"
        :col="ri"
        :row="s.row"
      />
    </template>
  </div>
</template>

<style scoped>
.bt {
  position: relative;
  overflow-x: auto;
  padding-bottom: 8px;
}

.bt-round-head {
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

.bt-round-num {
  font-size: 12px;
  font-weight: 400;
  color: var(--cs2-text-muted);
}

.bt-svg {
  position: absolute;
  top: 0;
  left: 0;
  pointer-events: none;
}

.bt-line {
  stroke: var(--cs2-border, rgba(255, 255, 255, 0.25));
  stroke-width: 1.5;
}
</style>
