<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import SwissBracket from '@/components/SwissBracket.vue'
import type { Group, Match, Stage } from '@/api/types'
import { MATCH_STATUS_LABEL, STAGE_STATUS_LABEL } from '@/api/types'
import { listGroups, listMatches, listStages } from '@/api/match'

const stages = ref<Stage[]>([])
const groups = ref<Group[]>([])
const currentStage = ref<string>('')
const currentGroup = ref<string>('')
const matches = ref<Match[]>([])
const loading = ref(false)
const viewMode = ref<'list' | 'bracket'>('list')

const currentStageName = computed(
  () => stages.value.find((s) => s.id === currentStage.value)?.name ?? '',
)

onMounted(async () => {
  stages.value = await listStages()
  groups.value = await listGroups()
  if (stages.value.length > 0) currentStage.value = stages.value[0].id
  await loadMatches()
})

async function loadMatches() {
  loading.value = true
  try {
    matches.value = await listMatches(currentStage.value, currentGroup.value || undefined)
  } finally {
    loading.value = false
  }
}

function matchStatusType(status: Match['status']) {
  return status === 'completed' ? 'success' : status === 'cancelled' ? 'danger' : 'warning'
}
</script>

<template>
  <div class="page-container">
    <h2 class="title">赛程</h2>

    <el-tabs v-model="currentStage" @tab-change="loadMatches">
      <el-tab-pane
        v-for="s in stages"
        :key="s.id"
        :label="`${s.name}（${STAGE_STATUS_LABEL[s.status]}）`"
        :name="s.id"
      />
    </el-tabs>

    <el-radio-group v-model="currentGroup" class="group-filter" @change="loadMatches">
      <el-radio-button value="">全部组别</el-radio-button>
      <el-radio-button v-for="g in groups" :key="g.id" :value="g.id">
        {{ g.name }}
      </el-radio-button>
    </el-radio-group>

    <div class="view-switch">
      <el-radio-group v-model="viewMode">
        <el-radio-button value="list">列表</el-radio-button>
        <el-radio-button value="bracket">对阵图</el-radio-button>
      </el-radio-group>
    </div>

    <!-- 对阵图（瑞士轮样式） -->
    <SwissBracket
      v-if="viewMode === 'bracket'"
      :matches="matches"
      :stage-name="currentStageName"
      class="bracket"
    />

    <!-- 对阵列表 -->
    <el-card v-else v-loading="loading">
      <el-table :data="matches" stripe empty-text="该阶段暂无对阵">
        <el-table-column prop="group_name" label="组别" width="90">
          <template #default="{ row }">
            <el-tag size="small" effect="plain">{{ row.group_name ?? '跨组' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="对阵" min-width="240">
          <template #default="{ row }">
            <div class="matchup">
              <span class="team" :class="{ win: row.winner_id === row.team_a_id }">
                {{ row.team_a_name }}
              </span>
              <span class="score">{{ row.team_a_score }} : {{ row.team_b_score }}</span>
              <span class="team" :class="{ win: row.winner_id === row.team_b_id }">
                {{ row.team_b_name }}
              </span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="赛制 / 地图" width="140">
          <template #default="{ row }">
            BO{{ row.best_of }}{{ row.map ? ` · ${row.map}` : '' }}
          </template>
        </el-table-column>
        <el-table-column prop="scheduled_at" label="时间" min-width="140" />
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-tag :type="matchStatusType(row.status)">
              {{ MATCH_STATUS_LABEL[row.status as Match['status']] }}
            </el-tag>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<style scoped>
.title {
  margin: 0 0 16px;
}

.group-filter {
  margin-bottom: 16px;
}

.view-switch {
  margin-bottom: 16px;
}

.bracket {
  margin-bottom: 8px;
}

.matchup {
  display: flex;
  align-items: center;
  gap: 10px;
}

.team {
  min-width: 90px;
  color: var(--cs2-text-regular, #c6ccd8);
}

.team.win {
  color: #67c23a;
  font-weight: 700;
}

.score {
  font-weight: 700;
  color: var(--cs2-accent);
  white-space: nowrap;
}
</style>
