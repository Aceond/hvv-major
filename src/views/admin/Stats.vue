<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import type { Group, PlayerStatRow, Stage, Team, TeamStatRow } from '@/api/types'
import { listGroups, listMembers, listStages, listTeams } from '@/api/admin'
import { getPlayerStats, getTeamStats, savePlayerStat, saveTeamStat } from '@/api/stats'

const tab = ref<'team' | 'player'>('team')
const stages = ref<Stage[]>([])
const groups = ref<Group[]>([])
const teams = ref<Team[]>([])
const currentStage = ref<string>('')
const currentGroup = ref<string>('')
const currentTeam = ref<string>('')
const loading = ref(false)
const saving = ref(false)

const teamRows = ref<TeamStatRow[]>([])
const playerRows = ref<PlayerStatRow[]>([])

onMounted(async () => {
  stages.value = await listStages()
  groups.value = await listGroups()
  teams.value = await listTeams()
  if (stages.value.length > 0) currentStage.value = stages.value[0].id
  if (teams.value.length > 0) currentTeam.value = teams.value[0].id
  await load()
})

async function load() {
  loading.value = true
  try {
    const stageId = currentStage.value || undefined
    const groupId = currentGroup.value || undefined
    const stageName = stages.value.find((s) => s.id === currentStage.value)?.name ?? '-'

    // 队伍统计行：以战队列表为底，合并已有统计数据
    const teamStats = await getTeamStats(groupId, stageId)
    const teamMap = new Map(teamStats.map((s) => [s.team_id, s]))
    teamRows.value = teams.value
      .filter((t) => !groupId || t.group_id === groupId)
      .map((t) => {
        const ex = teamMap.get(t.id)
        const groupName = groups.value.find((g) => g.id === t.group_id)?.name ?? '-'
        return {
          team_id: t.id, team_name: t.name, tag: t.tag,
          stage_id: currentStage.value, stage_name: stageName,
          group_id: t.group_id, group_name: groupName,
          win_rate: ex?.win_rate ?? 0, kd: ex?.kd ?? 0, matches: ex?.matches ?? 0,
          hs_rate: ex?.hs_rate ?? 0, pistol_win_rate: ex?.pistol_win_rate ?? 0,
          first_five_win_rate: ex?.first_five_win_rate ?? 0,
          avg_kills: ex?.avg_kills ?? 0, avg_deaths: ex?.avg_deaths ?? 0,
          avg_assists: ex?.avg_assists ?? 0,
          total_kills: ex?.total_kills ?? 0, total_deaths: ex?.total_deaths ?? 0,
          total_assists: ex?.total_assists ?? 0,
        } as TeamStatRow
      })

    // 个人统计行：按所选战队名册为底
    if (currentTeam.value) {
      const team = teams.value.find((t) => t.id === currentTeam.value)
      const members = await listMembers(currentTeam.value)
      const playerStats = await getPlayerStats(groupId, stageId)
      const playerMap = new Map(playerStats.map((s) => [s.player_id, s]))
      const groupName = groups.value.find((g) => g.id === team?.group_id)?.name ?? '-'
      playerRows.value = members.map((m) => {
        const ex = playerMap.get(m.profile_id)
        return {
          player_id: m.profile_id, player_name: m.nickname ?? '-',
          pw_username: m.pw_username ?? null,
          team_id: currentTeam.value, team_name: team?.name ?? '-',
          stage_id: currentStage.value, stage_name: stageName,
          group_id: team?.group_id ?? null, group_name: groupName,
          we: ex?.we ?? 0, rating_pro: ex?.rating_pro ?? 0,
          win_rate: ex?.win_rate ?? 0, kd: ex?.kd ?? 0, matches: ex?.matches ?? 0,
          hs_rate: ex?.hs_rate ?? 0, kpr: ex?.kpr ?? 0, dpr: ex?.dpr ?? 0,
          adr: ex?.adr ?? 0,
          total_kills: ex?.total_kills ?? 0, total_deaths: ex?.total_deaths ?? 0,
          total_assists: ex?.total_assists ?? 0,
          fpr: ex?.fpr ?? 0, awp_kpr: ex?.awp_kpr ?? 0,
        } as PlayerStatRow
      })
    } else {
      playerRows.value = []
    }
  } finally {
    loading.value = false
  }
}

async function saveTeamRows() {
  saving.value = true
  try {
    for (const r of teamRows.value) await saveTeamStat(r)
    ElMessage.success('队伍数据已保存')
  } finally {
    saving.value = false
  }
}

async function savePlayerRows() {
  saving.value = true
  try {
    for (const r of playerRows.value) await savePlayerStat(r)
    ElMessage.success('个人数据已保存')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div>
    <h2>数据录入</h2>

    <div class="filters">
      <el-radio-group v-model="tab">
        <el-radio-button value="team">队伍数据</el-radio-button>
        <el-radio-button value="player">个人数据</el-radio-button>
      </el-radio-group>

      <el-select v-model="currentStage" placeholder="选择阶段" class="filter-item" @change="load">
        <el-option v-for="s in stages" :key="s.id" :label="s.name" :value="s.id" />
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

      <el-select
        v-if="tab === 'player'"
        v-model="currentTeam"
        placeholder="选择战队"
        class="filter-item"
        @change="load"
      >
        <el-option v-for="t in teams" :key="t.id" :label="t.name" :value="t.id" />
      </el-select>

      <el-button
        type="primary"
        :loading="saving"
        @click="tab === 'team' ? saveTeamRows() : savePlayerRows()"
      >
        保存当前列表
      </el-button>
    </div>

    <!-- 队伍数据 -->
    <el-card v-if="tab === 'team'" v-loading="loading">
      <el-table :data="teamRows" stripe empty-text="暂无队伍">
        <el-table-column prop="team_name" label="队伍" min-width="150" fixed>
          <template #default="{ row }">
            <span>{{ row.team_name }}</span>
            <el-tag v-if="row.tag" size="small" effect="plain">{{ row.tag }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="group_name" label="组别" width="80" fixed />
        <el-table-column label="胜率%" width="86">
          <template #default="{ row }"><el-input-number v-model="row.win_rate" :min="0" :max="100" size="small" :controls="false" /></template>
        </el-table-column>
        <el-table-column label="K/D" width="76">
          <template #default="{ row }"><el-input-number v-model="row.kd" :min="0" :precision="2" size="small" :controls="false" /></template>
        </el-table-column>
        <el-table-column label="比赛数" width="76">
          <template #default="{ row }"><el-input-number v-model="row.matches" :min="0" size="small" :controls="false" /></template>
        </el-table-column>
        <el-table-column label="爆头率%" width="86">
          <template #default="{ row }"><el-input-number v-model="row.hs_rate" :min="0" :max="100" :precision="1" size="small" :controls="false" /></template>
        </el-table-column>
        <el-table-column label="手枪局胜率%" width="110">
          <template #default="{ row }"><el-input-number v-model="row.pistol_win_rate" :min="0" :max="100" size="small" :controls="false" /></template>
        </el-table-column>
        <el-table-column label="先胜5回合胜率%" width="128">
          <template #default="{ row }"><el-input-number v-model="row.first_five_win_rate" :min="0" :max="100" size="small" :controls="false" /></template>
        </el-table-column>
        <el-table-column label="场均击杀" width="86">
          <template #default="{ row }"><el-input-number v-model="row.avg_kills" :min="0" :precision="1" size="small" :controls="false" /></template>
        </el-table-column>
        <el-table-column label="场均死亡" width="86">
          <template #default="{ row }"><el-input-number v-model="row.avg_deaths" :min="0" :precision="1" size="small" :controls="false" /></template>
        </el-table-column>
        <el-table-column label="场均助攻" width="86">
          <template #default="{ row }"><el-input-number v-model="row.avg_assists" :min="0" :precision="1" size="small" :controls="false" /></template>
        </el-table-column>
        <el-table-column label="总击杀" width="76">
          <template #default="{ row }"><el-input-number v-model="row.total_kills" :min="0" size="small" :controls="false" /></template>
        </el-table-column>
        <el-table-column label="总死亡" width="76">
          <template #default="{ row }"><el-input-number v-model="row.total_deaths" :min="0" size="small" :controls="false" /></template>
        </el-table-column>
        <el-table-column label="总助攻" width="76">
          <template #default="{ row }"><el-input-number v-model="row.total_assists" :min="0" size="small" :controls="false" /></template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 个人数据 -->
    <el-card v-else v-loading="loading">
      <el-table :data="playerRows" stripe empty-text="暂无选手（请先选择战队）">
        <el-table-column prop="player_name" label="选手" min-width="110" fixed />
        <el-table-column label="完美 ID" min-width="130" fixed>
          <template #default="{ row }">{{ row.pw_username ?? '-' }}</template>
        </el-table-column>
        <el-table-column label="WE" width="76">
          <template #default="{ row }"><el-input-number v-model="row.we" :min="0" :max="100" :precision="1" size="small" :controls="false" /></template>
        </el-table-column>
        <el-table-column label="Rating PRO" width="96">
          <template #default="{ row }"><el-input-number v-model="row.rating_pro" :min="0" :precision="2" size="small" :controls="false" /></template>
        </el-table-column>
        <el-table-column label="胜率%" width="76">
          <template #default="{ row }"><el-input-number v-model="row.win_rate" :min="0" :max="100" size="small" :controls="false" /></template>
        </el-table-column>
        <el-table-column label="K/D" width="76">
          <template #default="{ row }"><el-input-number v-model="row.kd" :min="0" :precision="2" size="small" :controls="false" /></template>
        </el-table-column>
        <el-table-column label="比赛数" width="76">
          <template #default="{ row }"><el-input-number v-model="row.matches" :min="0" size="small" :controls="false" /></template>
        </el-table-column>
        <el-table-column label="爆头率%" width="86">
          <template #default="{ row }"><el-input-number v-model="row.hs_rate" :min="0" :max="100" :precision="1" size="small" :controls="false" /></template>
        </el-table-column>
        <el-table-column label="击杀/回合" width="90">
          <template #default="{ row }"><el-input-number v-model="row.kpr" :min="0" :precision="2" size="small" :controls="false" /></template>
        </el-table-column>
        <el-table-column label="死亡/回合" width="90">
          <template #default="{ row }"><el-input-number v-model="row.dpr" :min="0" :precision="2" size="small" :controls="false" /></template>
        </el-table-column>
        <el-table-column label="ADR" width="80">
          <template #default="{ row }"><el-input-number v-model="row.adr" :min="0" :precision="1" size="small" :controls="false" /></template>
        </el-table-column>
        <el-table-column label="总击杀" width="76">
          <template #default="{ row }"><el-input-number v-model="row.total_kills" :min="0" size="small" :controls="false" /></template>
        </el-table-column>
        <el-table-column label="总死亡" width="76">
          <template #default="{ row }"><el-input-number v-model="row.total_deaths" :min="0" size="small" :controls="false" /></template>
        </el-table-column>
        <el-table-column label="总助攻" width="76">
          <template #default="{ row }"><el-input-number v-model="row.total_assists" :min="0" size="small" :controls="false" /></template>
        </el-table-column>
        <el-table-column label="首杀/回合" width="90">
          <template #default="{ row }"><el-input-number v-model="row.fpr" :min="0" :precision="2" size="small" :controls="false" /></template>
        </el-table-column>
        <el-table-column label="AWP击杀/回合" width="118">
          <template #default="{ row }"><el-input-number v-model="row.awp_kpr" :min="0" :precision="2" size="small" :controls="false" /></template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<style scoped>
.filters {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.filter-item {
  width: 180px;
}
</style>
