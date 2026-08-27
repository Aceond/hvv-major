<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Sortable from 'sortablejs'
import type { Group, PlayerStatRow, Stage, TeamStatRow } from '@/api/types'
import { STAGE_STATUS_LABEL } from '@/api/types'
import { listGroups, listStages, stageDisplayName } from '@/api/match'
import {
  getParticipatingTeams,
  getPlayerStatsAggregated,
  getTeamNetPoints,
  getTeamStats,
  getTeamWinStats,
} from '@/api/stats'

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
  { key: 'we', label: '场均 WE', width: 84, fmt: 'dec1', color: 'pct' },
  { key: 'rating_pro', label: '场均 Rating', width: 110, fmt: 'dec2', color: 'trend' },
  { key: 'win_rate', label: '胜率', width: 74, fmt: 'pct0', color: 'pct' },
  { key: 'kd', label: 'K/D', width: 80, fmt: 'dec2', color: 'trend' },
  { key: 'matches', label: '比赛数', width: 86, fmt: 'int' },
  { key: 'maps', label: '地图数', width: 86, fmt: 'int' },
  { key: 'hs_rate', label: '爆头率', width: 90, fmt: 'pct1' },
  { key: 'avg_kills', label: '场均击杀', width: 96, fmt: 'dec2' },
  { key: 'avg_deaths', label: '场均死亡', width: 96, fmt: 'dec2' },
  { key: 'avg_assists', label: '场均助攻', width: 96, fmt: 'dec2' },
  { key: 'avg_first_kills', label: '场均首杀', width: 96, fmt: 'dec2' },
  { key: 'avg_multi_kills', label: '场均多杀', width: 96, fmt: 'dec2' },
  { key: 'avg_clutches', label: '场均残局', width: 96, fmt: 'dec2' },
  { key: 'adr', label: 'ADR', width: 80, fmt: 'dec1' },
  { key: 'total_kills', label: '总击杀', width: 86, fmt: 'int' },
  { key: 'total_deaths', label: '总死亡', width: 86, fmt: 'int' },
  { key: 'total_assists', label: '总助攻', width: 86, fmt: 'int' },
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
    // 队伍排行：以「打过已完成比赛的参赛队伍」为底（录比分后两队都会出现），
    // 合并后台手动录入的统计（team_stats），净胜分实时从已完成比赛计算
    const [teamStats, netMap, participating, winStats] = await Promise.all([
      getTeamStats(groupId, stageId),
      getTeamNetPoints(groupId, stageId),
      getParticipatingTeams(groupId, stageId),
      getTeamWinStats(groupId, stageId),
    ])
    const statsMap = new Map(teamStats.map((r) => [r.team_id, r]))
    const stageName = stageId ? stages.value.find((s) => s.id === stageId)?.name ?? null : null
    const merged = new Map<string, TeamStatRow>()
    for (const p of participating) {
      const base = statsMap.get(p.team_id)
      const win = winStats[p.team_id]
      merged.set(p.team_id, {
        ...p,
        ...(base ?? {}),
        // 比赛数/胜率/净胜分按已完成比赛实时计算（录完比分自动更新）
        matches: win?.played ?? base?.matches ?? 0,
        win_rate: win?.win_rate ?? base?.win_rate ?? 0,
        net: netMap[p.team_id] ?? 0,
        stage_name: base?.stage_name ?? stageName ?? p.stage_name,
        group_name: base?.group_name ?? p.group_name,
      })
    }
    // 已手动录入统计但尚未打比赛的队也保留，避免从排行消失
    for (const r of teamStats) {
      if (!merged.has(r.team_id)) {
        const win = winStats[r.team_id]
        merged.set(r.team_id, {
          ...r,
          matches: win?.played ?? r.matches,
          win_rate: win?.win_rate ?? r.win_rate,
          net: netMap[r.team_id] ?? 0,
        })
      }
    }
    teamRows.value = [...merged.values()]
    // 个人排行：从比赛队员数据自动聚合（场均 = 总量/地图数，爆头率/ADR/WE/Rating 按指定口径）
    playerRows.value = await getPlayerStatsAggregated(groupId, stageId)
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

/** 胜率排序：胜率相同按净胜分高者优先（第二参考项） */
function teamWinRateSort(a: TeamStatRow, b: TeamStatRow): number {
  const d = (a.win_rate ?? 0) - (b.win_rate ?? 0)
  if (d !== 0) return d
  return (a.net ?? 0) - (b.net ?? 0)
}

/** 净胜分排序：净胜分相同按胜率高者优先（与胜率排序互逆，保证两个方向排名一致） */
function teamNetSort(a: TeamStatRow, b: TeamStatRow): number {
  const d = (a.net ?? 0) - (b.net ?? 0)
  if (d !== 0) return d
  return (a.win_rate ?? 0) - (b.win_rate ?? 0)
}

/** 动态列：胜率列与净胜分列走复合排序，其余列默认单键排序 */
function teamSortMethodFor(col: StatCol): ((a: TeamStatRow, b: TeamStatRow) => number) | undefined {
  if (col.key === 'win_rate') return teamWinRateSort
  if (col.key === 'net') return teamNetSort
  return undefined
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
          :label="`${stageDisplayName(s)}（${STAGE_STATUS_LABEL[s.status]}）`"
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
          <template #default="{ row }">
            {{ row.stage_name ?? '-' }}{{ row.stage_name && row.group_name ? ' · ' + row.group_name : '' }}
          </template>
        </el-table-column>
        <el-table-column prop="group_name" label="组别" width="96" fixed />
        <el-table-column
          v-for="col in currentCols"
          :key="col.key"
          :prop="col.key"
          :label="col.label"
          :width="col.width"
          sortable
          :sort-method="teamSortMethodFor(col)"
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
        <el-table-column label="完美 ID" min-width="110" fixed>
          <template #default="{ row }">{{ row.pw_username || row.player_name || '-' }}</template>
        </el-table-column>
        <el-table-column prop="team_name" label="战队" min-width="120" fixed />
        <el-table-column label="阶段" width="104" fixed>
          <template #default="{ row }">
            {{ row.stage_name ?? '-' }}{{ row.stage_name && row.group_name ? ' · ' + row.group_name : '' }}
          </template>
        </el-table-column>
        <el-table-column label="组别" width="132" fixed>
          <template #default="{ row }">
            <template v-if="(row.group_names ?? []).length">
              <el-tag
                v-for="(g, gi) in row.group_names"
                :key="gi"
                size="small"
                effect="plain"
                round
                class="group-tag"
              >{{ g }}</el-tag>
            </template>
            <span v-else>-</span>
          </template>
        </el-table-column>
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

.group-tag {
  margin: 2px 4px 2px 0;
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

/* ---------- 移动端适配 ---------- */
@media (max-width: 768px) {
  .filters {
    gap: 8px;
  }

  .filter-item {
    width: 100%;
    flex: 1 1 100%;
  }

  .tip-hint {
    width: 100%;
  }
}
</style>
