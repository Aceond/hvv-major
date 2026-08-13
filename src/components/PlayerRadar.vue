<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import type { EventItem, Group, PlayerStatRow, Team } from '@/api/types'
import { listEvents } from '@/api/event'
import { listGroups } from '@/api/match'
import { listMyTeams } from '@/api/registration'
import { getPlayerStatsByEvent } from '@/api/stats'

// ---------------- 战队五维图 ----------------
const events = ref<EventItem[]>([])
const groups = ref<Group[]>([])
const myTeams = ref<Team[]>([])
const radarEventId = ref('')
const radarRange = ref('all') // all=全部队伍；否则为组别 id（队伍平均的对比范围）
const eventStats = ref<PlayerStatRow[]>([])
const radarLoading = ref(false)

/** 五维图维度定义（场均击杀 = 总击杀 / 比赛数，其余直接取字段） */
const RADAR_DIMS = [
  { key: 'avg_kills', label: '场均击杀' },
  { key: 'kd', label: 'KD' },
  { key: 'adr', label: 'ADR' },
  { key: 'rating', label: 'Rating' },
  { key: 'we', label: 'WE' },
] as const

function dimValue(row: PlayerStatRow, key: (typeof RADAR_DIMS)[number]['key']): number {
  switch (key) {
    case 'avg_kills':
      return row.matches > 0 ? row.total_kills / row.matches : 0
    case 'kd':
      return row.kd
    case 'adr':
      return row.adr
    case 'rating':
      return row.rating_pro
    case 'we':
      return row.we
    default:
      return 0
  }
}

/** 当前范围（全部/某组别）内的所有选手统计行。
 *  组别按「数据/比赛所属组别」判定（stage 的组别，即在哪打的），而非选手战队被分配的组别；
 *  演示数据未带 stage 组别时回退用战队组别。 */
const radarRows = computed(() => {
  if (radarRange.value === 'all') return eventStats.value
  return eventStats.value.filter((r) => (r.stage_group_id ?? r.group_id) === radarRange.value)
})

/** 我所在的战队（当前赛事下；同一赛事正式队员一人一队，取第一支匹配的战队） */
const myTeam = computed(
  () => myTeams.value.find((t) => t.event_id === radarEventId.value) ?? null,
)

/** 我队队员的统计行（该赛事下 team_id 等于我队的所有选手行） */
const myTeamRows = computed(() => {
  const team = myTeam.value
  if (!team) return []
  return eventStats.value.filter((r) => r.team_id === team.id)
})

const radarRangeName = computed(() =>
  radarRange.value === 'all'
    ? '全部队伍'
    : (groups.value.find((g) => g.id === radarRange.value)?.name ?? '未分组'),
)

/** 范围内按战队分组（剔除未入队），用于计算「所有队伍平均的平均值」 */
const teamAvgRows = computed(() => {
  const byTeam = new Map<string, PlayerStatRow[]>()
  for (const r of radarRows.value) {
    if (!r.team_id) continue
    const list = byTeam.get(r.team_id)
    if (list) list.push(r)
    else byTeam.set(r.team_id, [r])
  }
  return [...byTeam.values()]
})

/** 五维数据：我队平均 / 范围内各队平均再平均 / 归一化比例（同一维用同一 max，保证两线同尺度） */
const radarData = computed(() => {
  return RADAR_DIMS.map((d) => {
    // 我队内平均
    const myVals = myTeamRows.value.map((r) => dimValue(r, d.key))
    const mineV = myVals.length ? myVals.reduce((a, b) => a + b, 0) / myVals.length : 0
    // 每队先算队内平均，再对所有队伍的平均值求平均
    const teamAvgs: number[] = []
    for (const rows of teamAvgRows.value) {
      const vals = rows.map((r) => dimValue(r, d.key))
      teamAvgs.push(vals.reduce((a, b) => a + b, 0) / vals.length)
    }
    const avgV = teamAvgs.length ? teamAvgs.reduce((a, b) => a + b, 0) / teamAvgs.length : 0
    const maxV = Math.max(mineV, avgV, 0.0001)
    return {
      key: d.key,
      label: d.label,
      mine: mineV,
      avg: avgV,
      mineRatio: mineV / maxV,
      avgRatio: avgV / maxV,
    }
  })
})

// ---- SVG 雷达图几何（五边形，首个维度从正上方开始）----
const RADAR_SIZE = 260
const RADAR_R = 92
const RADAR_CX = RADAR_SIZE / 2
const RADAR_CY = RADAR_SIZE / 2
const N = RADAR_DIMS.length

function angle(i: number) {
  return (Math.PI * 2 * i) / N - Math.PI / 2
}
function pointAt(i: number, ratio: number) {
  const a = angle(i)
  const r = RADAR_R * Math.max(0, Math.min(1, ratio))
  return { x: RADAR_CX + r * Math.cos(a), y: RADAR_CY + r * Math.sin(a) }
}
function gridPoints(level: number) {
  return Array.from({ length: N }, (_, i) => {
    const p = pointAt(i, level)
    return `${p.x.toFixed(1)},${p.y.toFixed(1)}`
  }).join(' ')
}
function radarPoints(ratios: number[]) {
  return ratios.map((r, i) => {
    const p = pointAt(i, r)
    return `${p.x.toFixed(1)},${p.y.toFixed(1)}`
  }).join(' ')
}
function axisEnd(i: number) {
  return pointAt(i, 1)
}
function labelPos(i: number) {
  const a = angle(i)
  const x = RADAR_CX + (RADAR_R + 20) * Math.cos(a)
  const y = RADAR_CY + (RADAR_R + 20) * Math.sin(a)
  let anchor = 'middle'
  if (Math.cos(a) > 0.4) anchor = 'start'
  else if (Math.cos(a) < -0.4) anchor = 'end'
  return { x: x.toFixed(1), y: y.toFixed(1), anchor }
}
function vertexPos(i: number, ratio: number) {
  const p = pointAt(i, ratio)
  return { x: p.x.toFixed(1), y: p.y.toFixed(1) }
}

async function loadRadar() {
  if (!radarEventId.value) return
  radarLoading.value = true
  try {
    eventStats.value = await getPlayerStatsByEvent(radarEventId.value)
  } finally {
    radarLoading.value = false
  }
}

/** 数值展示：最多两位小数，去掉无意义的小数尾零 */
function fmtNum(v: number) {
  if (!Number.isFinite(v)) return '-'
  return String(Math.round(v * 100) / 100)
}
function cmpCls(mine: number, avg: number) {
  return mine >= avg ? 'cmp-up' : 'cmp-down'
}

onMounted(async () => {
  const [evts, grps, myT] = await Promise.all([listEvents(), listGroups(), listMyTeams()])
  events.value = evts
  groups.value = grps
  myTeams.value = myT
  if (evts[0]) {
    radarEventId.value = evts[0].id
    await loadRadar()
  }
})
</script>

<template>
  <el-card class="card">
    <template #header>
      <div class="radar-header">
        <span class="card-title">战队五维图</span>
        <div class="radar-filters">
          <el-select
            v-model="radarEventId"
            size="small"
            style="width: 190px"
            placeholder="选择赛事"
            @change="loadRadar"
          >
            <el-option
              v-for="e in events"
              :key="e.id"
              :label="`${e.name}${e.edition ? `（第 ${e.edition} 届）` : ''}`"
              :value="e.id"
            />
          </el-select>
          <el-radio-group v-model="radarRange" size="small">
            <el-radio-button value="all">全部</el-radio-button>
            <el-radio-button v-for="g in groups" :key="g.id" :value="g.id">{{ g.name }}</el-radio-button>
          </el-radio-group>
        </div>
      </div>
    </template>

    <div v-loading="radarLoading" class="radar-wrap">
      <template v-if="myTeam && myTeamRows.length && radarData.length">
        <div class="radar-body">
          <svg
            :viewBox="`0 0 ${RADAR_SIZE} ${RADAR_SIZE}`"
            class="radar-svg"
            role="img"
            aria-label="战队五维图"
          >
            <polygon v-for="lvl in [1, 2, 3]" :key="lvl" :points="gridPoints(lvl / 3)" class="grid" />
            <line
              v-for="(d, i) in radarData"
              :key="`axis-${d.key}`"
              :x1="RADAR_CX"
              :y1="RADAR_CY"
              :x2="axisEnd(i).x.toFixed(1)"
              :y2="axisEnd(i).y.toFixed(1)"
              class="axis"
            />
            <polygon :points="radarPoints(radarData.map((d) => d.avgRatio))" class="poly avg" />
            <polygon :points="radarPoints(radarData.map((d) => d.mineRatio))" class="poly mine" />
            <circle
              v-for="(d, i) in radarData"
              :key="`avg-dot-${d.key}`"
              :cx="vertexPos(i, d.avgRatio).x"
              :cy="vertexPos(i, d.avgRatio).y"
              r="2.5"
              class="dot avg"
            />
            <circle
              v-for="(d, i) in radarData"
              :key="`mine-dot-${d.key}`"
              :cx="vertexPos(i, d.mineRatio).x"
              :cy="vertexPos(i, d.mineRatio).y"
              r="3"
              class="dot mine"
            />
            <text
              v-for="(d, i) in radarData"
              :key="`label-${d.key}`"
              :x="labelPos(i).x"
              :y="labelPos(i).y"
              :text-anchor="labelPos(i).anchor"
              class="dim-label"
            >
              {{ d.label }}
            </text>
          </svg>
          <div class="radar-side">
            <div class="radar-legend">
              <span class="legend-item"><i class="swatch mine"></i>我的战队{{ myTeam ? `（${myTeam.name}）` : '' }}</span>
              <span class="legend-item"><i class="swatch avg"></i>队伍平均（{{ radarRangeName }}）</span>
            </div>
            <el-table :data="radarData" size="small" border class="radar-table">
              <el-table-column prop="label" label="维度" width="96" />
              <el-table-column label="我队" width="96">
                <template #default="{ row }">{{ fmtNum(row.mine) }}</template>
              </el-table-column>
              <el-table-column label="队伍平均" width="96">
                <template #default="{ row }">{{ fmtNum(row.avg) }}</template>
              </el-table-column>
              <el-table-column label="对比">
                <template #default="{ row }">
                  <span :class="cmpCls(row.mine, row.avg)">{{ row.mine >= row.avg ? '高' : '低' }}</span>
                </template>
              </el-table-column>
            </el-table>
            <div class="radar-tip">
              场均击杀 = 总击杀 ÷ 比赛数；数据与后台「数据录入 / 个人排行」同源，管理员保存后自动同步。
            </div>
          </div>
        </div>
      </template>
      <el-empty
        v-else-if="!radarEventId"
        description="暂无赛事，请先在后台发布赛事"
        :image-size="60"
      />
      <el-empty
        v-else-if="!myTeam"
        description="该赛事下你尚未加入战队，暂无法对比战队平均"
        :image-size="60"
      />
      <el-empty
        v-else
        description="该赛事暂无你战队的队员统计数据（队员个人注册审核通过后自动生成，或由管理员在数据录入中维护）"
        :image-size="60"
      />
    </div>
  </el-card>
</template>

<style scoped>
.card {
  margin-bottom: 16px;
}

.card-title {
  font-weight: 700;
  letter-spacing: 1px;
}

.radar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
}

.radar-filters {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.radar-wrap {
  min-height: 120px;
}

.radar-body {
  display: flex;
  align-items: center;
  gap: 24px;
  flex-wrap: wrap;
}

.radar-svg {
  width: 260px;
  height: 260px;
  flex-shrink: 0;
}

.radar-svg .grid {
  fill: none;
  stroke: var(--cs2-border);
  stroke-width: 1;
}

.radar-svg .axis {
  stroke: var(--cs2-border);
  stroke-width: 1;
}

.radar-svg .poly.avg {
  fill: rgba(90, 140, 255, 0.16);
  stroke: #5a8cff;
  stroke-width: 1.5;
  stroke-dasharray: 4 3;
}

.radar-svg .poly.mine {
  fill: rgba(255, 176, 32, 0.22);
  stroke: #ffb020;
  stroke-width: 2;
}

.radar-svg .dot.avg {
  fill: #5a8cff;
}

.radar-svg .dot.mine {
  fill: #ffb020;
}

.radar-svg .dim-label {
  font-size: 11px;
  fill: var(--cs2-text-muted);
}

.radar-side {
  flex: 1;
  min-width: 280px;
}

.radar-legend {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 8px;
}

.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--cs2-text-muted);
}

.swatch {
  display: inline-block;
  width: 12px;
  height: 12px;
  border-radius: 3px;
}

.swatch.mine {
  background: #ffb020;
}

.swatch.avg {
  background: #5a8cff;
}

.radar-table {
  width: 100%;
}

.cmp-up {
  color: #67c23a;
  font-weight: 700;
}

.cmp-down {
  color: #f56c6c;
  font-weight: 700;
}

.radar-tip {
  margin-top: 8px;
  font-size: 12px;
  color: var(--cs2-text-muted);
}

/* ---------- 移动端适配 ---------- */
@media (max-width: 768px) {
  .radar-svg {
    width: 100%;
    max-width: 240px;
    height: auto;
    margin: 0 auto;
  }

  .radar-body {
    justify-content: center;
    gap: 16px;
  }

  .radar-side {
    min-width: 0;
    width: 100%;
  }

  .radar-filters {
    width: 100%;
  }

  .radar-filters .el-select {
    width: 100% !important;
  }
}
</style>
