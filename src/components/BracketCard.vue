<script setup lang="ts">
import { computed } from 'vue'
import { BRACKET_DIM } from '@/lib/bracketTree'
import type { TreeSlot } from '@/lib/bracketTree'
import { MATCH_STATUS_LABEL } from '@/api/types'

const props = defineProps<{ slot: TreeSlot; col: number; row: number }>()

const style = computed(() => {
  const { CARD_H, SLOT_H, COL_W, GAP, HEADER_H } = BRACKET_DIM
  return {
    left: `${props.col * (COL_W + GAP)}px`,
    top: `${HEADER_H + props.row * SLOT_H}px`,
    width: `${COL_W}px`,
    height: `${CARD_H}px`,
  }
})
</script>

<template>
  <div
    class="bc"
    :class="{ completed: slot.real && slot.status === 'completed', placeholder: !slot.real }"
    :style="style"
  >
    <div class="bc-matchup">
      <span
        class="bc-team"
        :class="{ win: slot.real && slot.status === 'completed' && slot.scoreA > slot.scoreB }"
      >
        {{ slot.teamAName }}
      </span>
      <span class="bc-score">{{ slot.real ? `${slot.scoreA}:${slot.scoreB}` : '-' }}</span>
      <span
        class="bc-team"
        :class="{ win: slot.real && slot.status === 'completed' && slot.scoreB > slot.scoreA }"
      >
        {{ slot.teamBName }}
      </span>
    </div>
    <div class="bc-meta">
      <span v-if="slot.real">BO{{ slot.bestOf }}</span>
      <span v-else>等待创建</span>
      <span v-if="slot.real" class="bc-status" :class="slot.status">
        {{ MATCH_STATUS_LABEL[slot.status] }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.bc {
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

.bc.completed {
  border-color: rgba(103, 194, 58, 0.5);
}

/* 未创建对阵的占位槽：虚线 + 弱化，示意赛程待定 */
.bc.placeholder {
  border-style: dashed;
  opacity: 0.55;
}

.bc-matchup {
  display: flex;
  align-items: center;
  gap: 6px;
}

.bc-team {
  flex: 1;
  font-size: 13px;
  color: var(--cs2-text-regular, #c6ccd8);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.bc-team.win {
  color: #67c23a;
  font-weight: 700;
}

.bc-score {
  font-weight: 700;
  color: var(--cs2-accent);
  white-space: nowrap;
}

.bc-meta {
  display: flex;
  justify-content: space-between;
  margin-top: 4px;
  font-size: 12px;
  color: var(--cs2-text-muted);
}

.bc-status.completed {
  color: #67c23a;
}

.bc-status.scheduled {
  color: #e6a23c;
}

.bc-status.cancelled {
  color: #f56c6c;
}
</style>
