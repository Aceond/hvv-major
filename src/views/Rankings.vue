<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Sortable from 'sortablejs'
import type { Group, PlayerStatRow, Stage, TeamStatRow } from '@/api/types'
import { STAGE_STATUS_LABEL } from '@/api/types'
import { listGroups, listStages } from '@/api/match'
import { getPlayerStats, getTeamNetPoints, getTeamStats } from '@/api/stats'

// 可排序列配置（拖拽表头可调整顺序）
interface StatCol {
  key: string
  label: string
  width: number
  fmt?: 'int' | 'pct0' | 'pct1' | 'dec1' | 'dec2'
  color?: 'trend' | 'pct' // 高值绿 / 低值红
}

const teamCols = ref<StatCol[]>([
  { key: 'win_rate', label: '胜率', width: 78, fmt: 'pct0', color: 'pct' },
  { key: 'net', label: '净胜分', width: 88, fmt: 'int' },
  { key: 'kd', label: 'K/D', width: 82, fmt: 'dec2', color: 'trend' },
  { key: 'matches', label: '比赛数', width: 88, fmt: 'int' },
  { key: 'hs_rate', label: '爆头率', width: 92, fmt: 'pct1' },
  { key: 'pistol_win_rate', label: '手枪局胜率', width: 120, fmt: 'pct0' },
  { key: 'first_five_win_rate', label: '先胜5回合胜率', width: 144, fmt: 'pct0' },
  { key: 'total_kills', label: '总击杀', width: 88, fmt: 'int' },
  { key: 'total_deaths', label: '总死亡', width: 88, fmt: 'int' },
  { key: 'total_assists', label: '总助攻', width: 88, fmt: 'int' },
])

const playerCols = ref<StatCol[]>([
  { key: 'we', label: 'WE', width: 68, fmt: 'dec1', color: 'pct' },
  { key: 'rating_pro', label: 'Rating PRO', width: 126, fmt: 'dec2', color: 'trend' },
  { key: 'win_rate', label: '胜率', width: 78, fmt: 'pct0', color: 'pct' },
  { key: 'kd', label: 'K/D', width: 82, fmt: 'dec2', color: 'trend' },
  { key: 'matches', label: '比赛数', width: 88, fmt: 'int' },
  { key: 'hs_rate', label: '爆头率', width: 92, fmt: 'pct1' },
  { key: 'kpr', label: '击杀/回合', width: 112, fmt: 'dec2' },
  { key: 'dpr', label: '死亡/回合', width: 112, fmt: 'dec2' },
  { key: 'adr', label: 'ADR', width: 78, fmt: 'dec1' },
  { key: 'total_kills', label: '总击杀', width: 88, fmt: 'int' },
  { key: 'total_deaths', label: '总死亡', width: 88, fmt: 'int' },
  { key: 'total_assists', label: '总助攻', width: 88, fmt: 'int' },
  { key: 'fpr', label: '首杀/回合', width: 112, fmt: 'dec2' },
  { key: 'awp_kpr', label: 'AWP击杀/回合', width: 140, fmt: 'dec2' },
])

const tab = ref<'team' | 'player'>('team')
const stages = ref<Stage[]>([])
const groups = ref<Group[]>([])
// '' = 总阶段（汇总全部阶段数据）
const currentStage = ref<string>('')
const currentGroup = ref<string>('')

const teamRows = ref<TeamStatRow[]>([])
const playerRows = ref<PlayerStatRow[]>([])
const loading = ref(false)

let sortable: Sortable | null = null

const currentCols = ref<StatCol[]>(teamCols.value)
const defaultSort = ref<{ prop: string; order: 'ascending' | 'descending' }>({
  prop: 'win_rate',
  order: 'descending',
})

watch(tab, async (v) => {
  currentCols.value = v === 'team' ? teamCols.value : playerCols.value
  defaultSort.value =
    v === 'team'
      ? { prop: 'win_rate', order: 'descending' }
      : { prop: 'rating_pro', order: 'descending' }
  await nextTick()
  bindSortable()
})

onMounted(async () => {
  stages.value = await listStages()
  groups.value = await listGroups()
  await load()
  await nextTick()
  bindSortable()
})

onBeforeUnmount(() => {
  sortable?.destroy()
})

async function load() {
  loading.value = true
  try {
    const groupId = currentGroup.value || undefined
    const stageId = currentStage.value || undefined
    const teamStats = await getTeamStats(groupId, stageId)
    // 净胜分（小分）实时从已完成比赛计算
    const netMap = await getTeamNetPoints(groupId, stageId)
    teamRows.value = teamStats.map((r) => ({ ...r, net: netMap[r.team_id] ?? 0 }))
    playerRows.value = await getPlayerStats(groupId, stageId)
  } finally {
    loading.value = false
  }
}

/** 表头拖拽排序：拖拽后按 DOM 顺序重排列配置 */
function bindSortable() {
  sortable?.destroy()
  const header = document.querySelector('.el-table__header-wrapper .el-table__header')
  if (!header) return
  sortable = Sortable.create(header.querySelector('tr')!, {
    animation: 150,
    ghostClass: 'drag-ghost',
    handle: '.cell',
    onEnd: () => {
      const cols = tab.value === 'team' ? teamCols.value : playerCols.value
      const ths = header.querySelectorAll('th')
      const next: StatCol[] = []
      ths.forEach((th) => {
        const mark = [...th.classList].find((c) => c.startsWith('drag-col-'))
        const key = mark ? mark.slice('drag-col-'.length) : ''
        const col = cols.find((c) => c.key === key)
        if (col && !next.includes(col)) next.push(col)
      })
      if (next.length === cols.length) {
        cols.splice(0, cols.length, ...next)
      }
    },
  })
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

function cellClass(col: StatCol, value: number): string {
  if (col.color === 'trend') return trendClass(value)
  if (col.color === 'pct') return pctClass(value)
  return ''
}

function format(col: StatCol, value: number): string {
  if (col.fmt === 'pct0') return `${value}%`
  if (col.fmt === 'pct1') return `${value.toFixed(1)}%`
  if (col.fmt === 'dec1') return value.toFixed(1)
  if (col.fmt === 'dec2') return value.toFixed(2)
  return String(value)
}
</script>

<template>
  <div class="page-container rankings-page">
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
      <span class="tip-hint">点击表头排序 · 拖动表头调整列顺序</span>
    </div>

    <!-- 队伍排行 -->
    <el-card v-if="tab === 'team'" v-loading="loading">
      <el-table
        :data="teamRows"
        stripe
        empty-text="暂无队伍数据"
        :default-sort="defaultSort"
        row-key="team_id"
      >
        <el-table-column label="排名" width="64" fixed>
          <template #default="{ $index }">
            <span :class="['rank', rankColor($index)]">{{ $index + 1 }}</span>
          </template>
        </el-table-column>
        <el-table-column label="队伍" min-width="150" fixed>
          <template #default="{ row }">
            <span class="team-name">{{ row.team_name }}</span>
            <el-tag v-if="row.tag" size="small" effect="plain">{{ row.tag }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="阶段" width="104" fixed>
          <template #default="{ row }">{{ row.stage_name ?? '-' }}</template>
        </el-table-column>
        <el-table-column prop="group_name" label="组别" width="76" fixed />
        <el-table-column
          v-for="col in currentCols"
          :key="col.key"
          :prop="col.key"
          :label="col.label"
          :width="col.width"
          sortable
          :label-class-name="'drag-col-' + col.key"
        >
          <template #default="{ row }">
            <b v-if="col.color" :class="cellClass(col, row[col.key])">
              {{ format(col, row[col.key]) }}
            </b>
            <template v-else>{{ format(col, row[col.key]) }}</template>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 个人排行 -->
    <el-card v-else v-loading="loading">
      <el-table
        :data="playerRows"
        stripe
        empty-text="暂无个人数据"
        :default-sort="defaultSort"
        row-key="player_id"
      >
        <el-table-column label="排名" width="64" fixed>
          <template #default="{ $index }">
            <span :class="['rank', rankColor($index)]">{{ $index + 1 }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="player_name" label="选手" min-width="100" fixed />
        <el-table-column prop="team_name" label="战队" min-width="120" fixed />
        <el-table-column label="阶段" width="104" fixed>
          <template #default="{ row }">{{ row.stage_name ?? '-' }}</template>
        </el-table-column>
        <el-table-column prop="group_name" label="组别" width="76" fixed />
        <el-table-column
          v-for="col in currentCols"
          :key="col.key"
          :prop="col.key"
          :label="col.label"
          :width="col.width"
          sortable
          :label-class-name="'drag-col-' + col.key"
        >
          <template #default="{ row }">
            <b v-if="col.color" :class="cellClass(col, row[col.key])">
              {{ format(col, row[col.key]) }}
            </b>
            <template v-else>{{ format(col, row[col.key]) }}</template>
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

/* 数据列较多，放大容器让更多列可见 */
.rankings-page {
  max-width: 1600px;
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

.tip-hint {
  font-size: 12px;
  color: var(--cs2-text-muted);
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

/* 拖拽列时高亮目标位置 */
:deep(.drag-ghost) {
  opacity: 0.5;
  background: var(--cs2-accent-soft);
}

:deep(.el-table__header th) {
  cursor: grab;
}

:deep(.el-table__header th:active) {
  cursor: grabbing;
}
</style>
