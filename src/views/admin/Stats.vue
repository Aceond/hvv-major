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
          played: ex?.played ?? 0, wins: ex?.wins ?? 0,
          losses: ex?.losses ?? 0, points: ex?.points ?? 0,
          we: ex?.we ?? 0, adr: ex?.adr ?? 0, kd: ex?.kd ?? 0, rating: ex?.rating ?? 0,
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
          matches: ex?.matches ?? 0, kills: ex?.kills ?? 0,
          deaths: ex?.deaths ?? 0, assists: ex?.assists ?? 0,
          hs_rate: ex?.hs_rate ?? 0, rating: ex?.rating ?? 0,
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
        <el-table-column prop="team_name" label="队伍" min-width="150">
          <template #default="{ row }">
            <span>{{ row.team_name }}</span>
            <el-tag v-if="row.tag" size="small" effect="plain">{{ row.tag }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="group_name" label="组别" width="80" />
        <el-table-column label="场次" width="76">
          <template #default="{ row }"><el-input-number v-model="row.played" :min="0" size="small" :controls="false" /></template>
        </el-table-column>
        <el-table-column label="胜" width="66">
          <template #default="{ row }"><el-input-number v-model="row.wins" :min="0" size="small" :controls="false" /></template>
        </el-table-column>
        <el-table-column label="负" width="66">
          <template #default="{ row }"><el-input-number v-model="row.losses" :min="0" size="small" :controls="false" /></template>
        </el-table-column>
        <el-table-column label="积分" width="66">
          <template #default="{ row }"><el-input-number v-model="row.points" :min="0" size="small" :controls="false" /></template>
        </el-table-column>
        <el-table-column label="WE%" width="80">
          <template #default="{ row }"><el-input-number v-model="row.we" :min="0" :max="100" size="small" :controls="false" /></template>
        </el-table-column>
        <el-table-column label="ADR" width="86">
          <template #default="{ row }"><el-input-number v-model="row.adr" :min="0" :precision="1" size="small" :controls="false" /></template>
        </el-table-column>
        <el-table-column label="KD" width="76">
          <template #default="{ row }"><el-input-number v-model="row.kd" :min="0" :precision="2" size="small" :controls="false" /></template>
        </el-table-column>
        <el-table-column label="Rating" width="90">
          <template #default="{ row }"><el-input-number v-model="row.rating" :min="0" :precision="2" size="small" :controls="false" /></template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 个人数据 -->
    <el-card v-else v-loading="loading">
      <el-table :data="playerRows" stripe empty-text="暂无选手（请先选择战队）">
        <el-table-column prop="player_name" label="选手" min-width="110" />
        <el-table-column label="完美 ID" min-width="130">
          <template #default="{ row }">{{ row.pw_username ?? '-' }}</template>
        </el-table-column>
        <el-table-column label="场次" width="76">
          <template #default="{ row }"><el-input-number v-model="row.matches" :min="0" size="small" :controls="false" /></template>
        </el-table-column>
        <el-table-column label="击杀" width="76">
          <template #default="{ row }"><el-input-number v-model="row.kills" :min="0" size="small" :controls="false" /></template>
        </el-table-column>
        <el-table-column label="死亡" width="76">
          <template #default="{ row }"><el-input-number v-model="row.deaths" :min="0" size="small" :controls="false" /></template>
        </el-table-column>
        <el-table-column label="助攻" width="76">
          <template #default="{ row }"><el-input-number v-model="row.assists" :min="0" size="small" :controls="false" /></template>
        </el-table-column>
        <el-table-column label="爆头率%" width="96">
          <template #default="{ row }"><el-input-number v-model="row.hs_rate" :min="0" :max="100" :precision="1" size="small" :controls="false" /></template>
        </el-table-column>
        <el-table-column label="Rating" width="90">
          <template #default="{ row }"><el-input-number v-model="row.rating" :min="0" :precision="2" size="small" :controls="false" /></template>
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
