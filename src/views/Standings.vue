<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import type { EventItem, Group, Stage, StandingsRow } from '@/api/types'
import { STAGE_STATUS_LABEL } from '@/api/types'
import { getStandings, listGroups, listStages, stageDisplayName, subscribeStandings } from '@/api/match'
import { listEvents } from '@/api/event'

const events = ref<EventItem[]>([])
const stages = ref<Stage[]>([])
const groups = ref<Group[]>([])
const currentEventId = ref<string>('')
const currentStage = ref<string>('')
const currentGroup = ref<string>('')
const rows = ref<StandingsRow[]>([])
const loading = ref(false)
let unsubscribe: (() => void) | null = null

onMounted(async () => {
  events.value = await listEvents()
  // 当前赛事：进行中 > 报名中 > 最新一届（与赛程页一致）
  const active =
    events.value.find((e) => e.status === 'running') ??
    events.value.find((e) => e.status === 'signup') ??
    events.value[0]
  currentEventId.value = active?.id ?? ''
  groups.value = await listGroups()
  stages.value = await listStages(currentEventId.value || undefined)
  if (stages.value.length > 0) currentStage.value = stages.value[0].id
  await load()
  unsubscribe = subscribeStandings(load)
})

onUnmounted(() => unsubscribe?.())

async function onEventChange() {
  currentStage.value = ''
  currentGroup.value = ''
  stages.value = await listStages(currentEventId.value || undefined)
  if (stages.value.length > 0) currentStage.value = stages.value[0].id
  await load()
}

async function load() {
  if (!currentStage.value) {
    rows.value = []
    return
  }
  loading.value = true
  try {
    rows.value = await getStandings(currentStage.value, currentGroup.value || undefined)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="page-container">
    <h2 class="title">积分榜</h2>

    <div class="event-bar">
      <el-select
        v-model="currentEventId"
        class="event-select"
        placeholder="选择赛事"
        @change="onEventChange"
      >
        <el-option
          v-for="e in events"
          :key="e.id"
          :label="`${e.name}${e.edition ? `（第 ${e.edition} 届）` : ''}`"
          :value="e.id"
        />
      </el-select>
    </div>

    <el-tabs v-model="currentStage" @tab-change="load">
      <el-tab-pane
        v-for="s in stages"
        :key="s.id"
        :label="`${stageDisplayName(s)}（${STAGE_STATUS_LABEL[s.status]}）`"
        :name="s.id"
      />
    </el-tabs>

    <el-radio-group v-model="currentGroup" class="group-filter" @change="load">
      <el-radio-button value="">全部组别</el-radio-button>
      <el-radio-button v-for="g in groups" :key="g.id" :value="g.id">
        {{ g.name }}
      </el-radio-button>
    </el-radio-group>

    <el-card v-loading="loading">
      <el-table :data="rows" stripe empty-text="暂无排名数据">
        <el-table-column label="排名" type="index" width="70" />
        <el-table-column label="队伍" min-width="180">
          <template #default="{ row }">
            <span class="team-name">{{ row.team_name }}</span>
            <el-tag v-if="row.tag" size="small" effect="plain" class="tag">{{ row.tag }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="group_name" label="组别" width="90">
          <template #default="{ row }">{{ row.group_name ?? '跨组' }}</template>
        </el-table-column>
        <el-table-column prop="played" label="场次" width="70" />
        <el-table-column prop="wins" label="胜" width="60" />
        <el-table-column prop="losses" label="负" width="60" />
        <el-table-column label="地图" width="130">
          <template #default="{ row }">
            {{ row.maps_won }} : {{ row.maps_lost }}
            <span :class="row.map_diff >= 0 ? 'diff-pos' : 'diff-neg'">
              ({{ row.map_diff >= 0 ? '+' : '' }}{{ row.map_diff }})
            </span>
          </template>
        </el-table-column>
        <el-table-column label="积分" width="90">
          <template #default="{ row }">
            <b class="points">{{ row.points }}</b>
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

.event-bar {
  margin-bottom: 16px;
}

.event-select {
  width: 220px;
}

.group-filter {
  margin-bottom: 16px;
}

.team-name {
  margin-right: 8px;
}

.tag {
  margin-right: 4px;
}

.diff-pos {
  color: #67c23a;
}

.diff-neg {
  color: #f56c6c;
}

.points {
  color: var(--cs2-accent);
  font-size: 16px;
}
</style>
