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

/** 高值显示绿色、低值红色（threshold 为分界，≥ 为高） */
function trendClass(value: number, threshold = 1) {
  return value >= threshold ? 'rating-pos' : 'rating-neg'
}

function pctClass(value: number) {
  return value >= 50 ? 'rating-pos' : 'rating-neg'
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
        <el-table-column label="排名" width="64">
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
        <el-table-column label="阶段" width="104">
          <template #default="{ row }">{{ row.stage_name ?? '-' }}</template>
        </el-table-column>
        <el-table-column prop="group_name" label="组别" width="76" />
        <el-table-column label="胜率" width="72">
          <template #default="{ row }">
            <b :class="pctClass(row.win_rate)">{{ row.win_rate }}%</b>
          </template>
        </el-table-column>
        <el-table-column label="K/D" width="72">
          <template #default="{ row }">
            <b :class="trendClass(row.kd)">{{ row.kd.toFixed(2) }}</b>
          </template>
        </el-table-column>
        <el-table-column prop="matches" label="比赛数" width="70" align="center" />
        <el-table-column label="爆头率" width="80">
          <template #default="{ row }">{{ row.hs_rate.toFixed(1) }}%</template>
        </el-table-column>
        <el-table-column label="手枪局胜率" width="104">
          <template #default="{ row }">{{ row.pistol_win_rate }}%</template>
        </el-table-column>
        <el-table-column label="先胜5回合胜率" width="120">
          <template #default="{ row }">{{ row.first_five_win_rate }}%</template>
        </el-table-column>
        <el-table-column label="场均击杀" width="82">
          <template #default="{ row }">{{ row.avg_kills.toFixed(1) }}</template>
        </el-table-column>
        <el-table-column label="场均死亡" width="82">
          <template #default="{ row }">{{ row.avg_deaths.toFixed(1) }}</template>
        </el-table-column>
        <el-table-column label="场均助攻" width="82">
          <template #default="{ row }">{{ row.avg_assists.toFixed(1) }}</template>
        </el-table-column>
        <el-table-column label="总击杀" width="72">
          <template #default="{ row }">{{ row.total_kills }}</template>
        </el-table-column>
        <el-table-column label="总死亡" width="72">
          <template #default="{ row }">{{ row.total_deaths }}</template>
        </el-table-column>
        <el-table-column label="总助攻" width="72">
          <template #default="{ row }">{{ row.total_assists }}</template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 个人排行 -->
    <el-card v-else v-loading="loading">
      <el-table :data="playerRows" stripe empty-text="暂无个人数据">
        <el-table-column label="排名" width="64">
          <template #default="{ $index }">
            <span :class="['rank', rankColor($index)]">{{ $index + 1 }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="player_name" label="选手" min-width="100" />
        <el-table-column prop="team_name" label="战队" min-width="120" />
        <el-table-column label="阶段" width="104">
          <template #default="{ row }">{{ row.stage_name ?? '-' }}</template>
        </el-table-column>
        <el-table-column prop="group_name" label="组别" width="76" />
        <el-table-column label="WE" width="72">
          <template #default="{ row }">
            <b :class="pctClass(row.we)">{{ row.we.toFixed(1) }}</b>
          </template>
        </el-table-column>
        <el-table-column label="Rating PRO" width="92">
          <template #default="{ row }">
            <b :class="trendClass(row.rating_pro)">{{ row.rating_pro.toFixed(2) }}</b>
          </template>
        </el-table-column>
        <el-table-column label="胜率" width="72">
          <template #default="{ row }">
            <b :class="pctClass(row.win_rate)">{{ row.win_rate }}%</b>
          </template>
        </el-table-column>
        <el-table-column label="K/D" width="72">
          <template #default="{ row }">
            <b :class="trendClass(row.kd)">{{ row.kd.toFixed(2) }}</b>
          </template>
        </el-table-column>
        <el-table-column prop="matches" label="比赛数" width="70" align="center" />
        <el-table-column label="爆头率" width="80">
          <template #default="{ row }">{{ row.hs_rate.toFixed(1) }}%</template>
        </el-table-column>
        <el-table-column label="击杀/回合" width="92">
          <template #default="{ row }">{{ row.kpr.toFixed(2) }}</template>
        </el-table-column>
        <el-table-column label="死亡/回合" width="92">
          <template #default="{ row }">{{ row.dpr.toFixed(2) }}</template>
        </el-table-column>
        <el-table-column label="ADR" width="72">
          <template #default="{ row }">{{ row.adr.toFixed(1) }}</template>
        </el-table-column>
        <el-table-column label="总击杀" width="72">
          <template #default="{ row }">{{ row.total_kills }}</template>
        </el-table-column>
        <el-table-column label="总死亡" width="72">
          <template #default="{ row }">{{ row.total_deaths }}</template>
        </el-table-column>
        <el-table-column label="总助攻" width="72">
          <template #default="{ row }">{{ row.total_assists }}</template>
        </el-table-column>
        <el-table-column label="首杀/回合" width="92">
          <template #default="{ row }">{{ row.fpr.toFixed(2) }}</template>
        </el-table-column>
        <el-table-column label="AWP击杀/回合" width="110">
          <template #default="{ row }">{{ row.awp_kpr.toFixed(2) }}</template>
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
