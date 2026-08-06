<script setup lang="ts">
import { onMounted, ref } from 'vue'
import type { Group, PlayerStatRow, Stage, TeamStatRow } from '@/api/types'
import { STAGE_STATUS_LABEL } from '@/api/types'
import { listGroups, listStages } from '@/api/match'
import { getPlayerStats, getTeamStats } from '@/api/stats'

const tab = ref<'team' | 'player'>('team')
const stages = ref<Stage[]>([])
const groups = ref<Group[]>([])
// '' = 总阶段（汇总全部阶段数据）
const currentStage = ref<string>('')
const currentGroup = ref<string>('')

const teamRows = ref<TeamStatRow[]>([])
const playerRows = ref<PlayerStatRow[]>([])
const loading = ref(false)

onMounted(async () => {
  stages.value = await listStages()
  groups.value = await listGroups()
  await load()
})

async function load() {
  loading.value = true
  try {
    const groupId = currentGroup.value || undefined
    const stageId = currentStage.value || undefined
    teamRows.value = await getTeamStats(groupId, stageId)
    playerRows.value = await getPlayerStats(groupId, stageId)
  } finally {
    loading.value = false
  }
}

function rankColor(index: number) {
  if (index === 0) return 'gold'
  if (index === 1) return 'silver'
  if (index === 2) return 'bronze'
  return ''
}

/**
 * KD 显示规则：
 * - 击杀=0 且 死亡=0 → '-'（无意义）
 * - 死亡=0 且 击杀>0 → 击杀数（HLTV 惯例，避免无穷大）
 * - 其余 → 击杀/死亡 保留两位小数
 */
function formatKd(kills: number, deaths: number): string {
  if (kills === 0 && deaths === 0) return '-'
  if (deaths === 0) return String(kills)
  return (kills / deaths).toFixed(2)
}

function kdClass(kills: number, deaths: number): string {
  if (deaths === 0) return 'rating-pos'
  return kills / deaths >= 1 ? 'rating-pos' : 'rating-neg'
}
</script>

<template>
  <div class="page-container">
    <h2 class="title">数据排行</h2>

    <div class="filters">
      <el-radio-group v-model="tab">
        <el-radio-button value="team">队伍排行</el-radio-button>
        <el-radio-button value="player">个人排行</el-radio-button>
      </el-radio-group>
      <el-select
        v-model="currentStage"
        placeholder="选择阶段"
        class="filter-item"
        @change="load"
      >
        <el-option label="总阶段（全部数据）" value="" />
        <el-option
          v-for="s in stages"
          :key="s.id"
          :label="`${s.name}（${STAGE_STATUS_LABEL[s.status]}）`"
          :value="s.id"
        />
      </el-select>
      <el-select
        v-model="currentGroup"
        placeholder="选择组别"
        clearable
        class="filter-item"
        @change="load"
      >
        <el-option v-for="g in groups" :key="g.id" :label="g.name" :value="g.id" />
      </el-select>
    </div>

    <!-- 队伍排行 -->
    <el-card v-if="tab === 'team'" v-loading="loading">
      <el-table :data="teamRows" stripe empty-text="暂无队伍数据">
        <el-table-column label="排名" width="70">
          <template #default="{ $index }">
            <span :class="['rank', rankColor($index)]">{{ $index + 1 }}</span>
          </template>
        </el-table-column>
        <el-table-column label="队伍" min-width="150">
          <template #default="{ row }">
            <span class="team-name">{{ row.team_name }}</span>
            <el-tag v-if="row.tag" size="small" effect="plain">{{ row.tag }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="阶段" width="110">
          <template #default="{ row }">{{ row.stage_name ?? '-' }}</template>
        </el-table-column>
        <el-table-column prop="group_name" label="组别" width="80" />
        <el-table-column prop="played" label="场次" width="60" />
        <el-table-column prop="wins" label="胜" width="50" />
        <el-table-column prop="losses" label="负" width="50" />
        <el-table-column label="WE" width="70">
          <template #default="{ row }">
            <b :class="row.we > 0 ? 'rating-pos' : 'rating-neg'">{{ row.we }}%</b>
          </template>
        </el-table-column>
        <el-table-column label="ADR" width="80">
          <template #default="{ row }">{{ row.adr.toFixed(1) }}</template>
        </el-table-column>
        <el-table-column label="KD" width="70">
          <template #default="{ row }">
            <b :class="row.kd >= 1 ? 'rating-pos' : 'rating-neg'">{{ row.kd.toFixed(2) }}</b>
          </template>
        </el-table-column>
        <el-table-column label="Rating" width="80">
          <template #default="{ row }">
            <b :class="row.rating >= 1 ? 'rating-pos' : 'rating-neg'">{{ row.rating.toFixed(2) }}</b>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 个人排行 -->
    <el-card v-else v-loading="loading">
      <el-table :data="playerRows" stripe empty-text="暂无个人数据">
        <el-table-column label="排名" width="70">
          <template #default="{ $index }">
            <span :class="['rank', rankColor($index)]">{{ $index + 1 }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="player_name" label="选手" min-width="110" />
        <el-table-column prop="team_name" label="战队" min-width="130" />
        <el-table-column label="阶段" width="110">
          <template #default="{ row }">{{ row.stage_name ?? '-' }}</template>
        </el-table-column>
        <el-table-column prop="group_name" label="组别" width="80" />
        <el-table-column prop="matches" label="场次" width="60" />
        <el-table-column label="击杀" width="60">
          <template #default="{ row }">{{ row.kills }}</template>
        </el-table-column>
        <el-table-column label="死亡" width="60">
          <template #default="{ row }">{{ row.deaths }}</template>
        </el-table-column>
        <el-table-column label="助攻" width="60">
          <template #default="{ row }">{{ row.assists }}</template>
        </el-table-column>
        <el-table-column label="爆头率" width="80">
          <template #default="{ row }">{{ row.hs_rate.toFixed(1) }}%</template>
        </el-table-column>
        <el-table-column label="KD" width="70">
          <template #default="{ row }">
            <b :class="kdClass(row.kills, row.deaths)">{{ formatKd(row.kills, row.deaths) }}</b>
          </template>
        </el-table-column>
        <el-table-column label="Rating" width="80">
          <template #default="{ row }">
            <b :class="row.rating >= 1 ? 'rating-pos' : 'rating-neg'">{{ row.rating.toFixed(2) }}</b>
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

.filters {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.filter-item {
  width: 200px;
}

.rank {
  font-weight: 700;
}

.rank.gold {
  color: #f7ba2a;
}

.rank.silver {
  color: #a0a4ad;
}

.rank.bronze {
  color: #cd7f32;
}

.team-name {
  margin-right: 8px;
}

.rating-pos {
  color: #67c23a;
}

.rating-neg {
  color: #f56c6c;
}
</style>
