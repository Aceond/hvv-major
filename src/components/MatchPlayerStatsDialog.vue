<script setup lang="ts">
// 本场队员数据录入对话框（比分录入入口的一部分）
// 自动匹配比赛双方正式队员，按「每张地图」分别登记：击杀/死亡/助攻/爆头率/首杀/多杀/残局/ADR/局数/WE/Rating。
// BO3 即三张图，每张图切换页签单独录入；
// 后台自动聚合（整个赛事期间）：
//   爆头率 = Σ(本图击杀 × 本图爆头率取整) ÷ Σ击杀
//   ADR    = Σ(本图ADR × 本图局数) ÷ Σ局数
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import type { Match, MatchPlayerStat, MatchPlayerStatInput, TeamMember } from '@/api/types'
import {
  listMatchPlayerStats,
  listMatchPlayers,
  saveMatchPlayerStats,
} from '@/api/playerMatchStats'
import { listMatchMaps } from '@/api/match'

const props = defineProps<{ modelValue: boolean; match: Match | null }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void; (e: 'saved'): void }>()

const visible = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
})

interface PlayerRow extends MatchPlayerStatInput {
  player_name: string
  pw_username: string | null
  team_name: string
}

const players = ref<TeamMember[]>([])
/** 地图页签列表：优先使用已录入的逐图比分地图名（Mirage / Inferno …），未录时按赛制生成「地图 N」 */
const maps = ref<{ key: string; label: string }[]>([])
const activeMap = ref('')
/** 每张地图对应的队员数据行 */
const byMap = ref<Record<string, PlayerRow[]>>({})
const loading = ref(false)
const saving = ref(false)

watch(
  () => [props.modelValue, props.match?.id] as const,
  async ([open, matchId]) => {
    if (!open || !matchId) return
    await load(matchId)
  },
)

/** 本场地图数：BO1 = 1；BO3 = 赛制 3（有逐图比分时按已录张数，最多补齐到赛制数） */
function resolveMapCount(m: Match): number {
  if (m.best_of <= 1) return 1
  return Math.max(1, m.best_of)
}

/** 从已存行推导要回填的爆头率整数%（优先读新列 headshot_rate_pct；没值则用 headshots/kills 反推） */
function resolveHsRate(ex: MatchPlayerStat | undefined, kills: number): number {
  if (!ex) return 0
  if (Number(ex.headshot_rate_pct) > 0) return Number(ex.headshot_rate_pct)
  const k = Number(ex.kills) || kills || 0
  if (k <= 0) return 0
  return Math.round(((Number(ex.headshots) || 0) / k) * 100)
}
/** 推导回填 ADR（优先读新列 adr；没值则 damage/rounds） */
function resolveAdr(ex: MatchPlayerStat | undefined, rounds: number): number {
  if (!ex) return 0
  if (Number(ex.adr) > 0) return Number(ex.adr)
  const rnd = Number(ex.rounds) || rounds || 0
  if (rnd <= 0) return 0
  return Math.round(((Number(ex.damage) || 0) / rnd) * 100) / 100
}

async function load(matchId: string) {
  const m = props.match
  if (!m) return
  loading.value = true
  try {
    players.value = await listMatchPlayers(m.team_a_id, m.team_b_id)
    const [existing, mapsData] = await Promise.all([
      listMatchPlayerStats(matchId),
      m.best_of > 1 ? listMatchMaps([matchId]) : Promise.resolve([]),
    ])
    const filledMaps = mapsData.filter((mp) => mp.team_a_score > 0 || mp.team_b_score > 0)
    const mapNames = filledMaps.map((mp) => mp.map_name).filter(Boolean)
    const n = resolveMapCount(m)
    const keys: string[] = []
    for (let i = 0; i < n; i++) keys.push(mapNames[i] ?? `地图${i + 1}`)
    maps.value = keys.map((key) => ({ key, label: key.startsWith('地图') ? `${key}（待录入逐图比分）` : key }))
    activeMap.value = keys[0]

    // 旧数据（map_name 为空 = 整场合计）归入第一张图页签展示，避免丢失
    const groupByMap = (list: MatchPlayerStat[]) => {
      const g = new Map<string, MatchPlayerStat[]>()
      for (const s of list) {
        const k = s.map_name || keys[0] || ''
        ;(g.get(k) ?? g.set(k, []).get(k)!).push(s)
      }
      return g
    }
    const grouped = groupByMap(existing)
    const teamA = m.team_a_name ?? 'A 队'
    const teamB = m.team_b_name ?? 'B 队'
    const nextByMap: Record<string, PlayerRow[]> = {}
    for (const key of keys) {
      const map = new Map(grouped.get(key)?.map((e) => [e.player_id, e]) ?? [])
      nextByMap[key] = players.value.map((p) => {
        const ex = map.get(p.profile_id)
        const kills = ex?.kills ?? 0
        const rounds = ex?.rounds ?? 0
        return {
          player_id: p.profile_id,
          team_id: p.team_id,
          map_name: key,
          map_count: 1, // 每行 = 一张地图
          kills,
          deaths: ex?.deaths ?? 0,
          assists: ex?.assists ?? 0,
          headshot_rate_pct: resolveHsRate(ex, kills),
          headshots: Math.round((kills * resolveHsRate(ex, kills)) / 100), // 兼容旧列
          first_kills: ex?.first_kills ?? 0,
          multi_kills: ex?.multi_kills ?? 0,
          clutches: ex?.clutches ?? 0,
          adr: resolveAdr(ex, rounds),
          damage: Math.round(resolveAdr(ex, rounds) * rounds), // 兼容旧列
          rounds,
          we: ex?.we ?? 0,
          rating: ex?.rating ?? 0,
          player_name: p.nickname ?? p.pw_username ?? '未命名',
          pw_username: p.pw_username,
          team_name: p.team_id === m.team_a_id ? teamA : p.team_id === m.team_b_id ? teamB : '-',
        }
      })
    }
    byMap.value = nextByMap
  } finally {
    loading.value = false
  }
}

/** 保存：逐张地图分别覆盖保存 */
async function save() {
  const m = props.match
  if (!m) return
  saving.value = true
  try {
    for (const key of Object.keys(byMap.value)) {
      const rows = byMap.value[key].map((r) => {
        // 保存前最终反算：headshots/damage 按新口径重算一次（用户改了 kills 或 rounds 也跟着变）
        const k = Number(r.kills) || 0
        const rnd = Number(r.rounds) || 0
        const hsRate = Math.max(0, Math.min(100, Math.round(Number(r.headshot_rate_pct) || 0)))
        const adr = Math.max(0, Math.round((Number(r.adr) || 0) * 100) / 100)
        const headshots = Math.round((k * hsRate) / 100)
        const damage = Math.round(adr * rnd)
        return { ...r, headshot_rate_pct: hsRate, adr, headshots, damage } as PlayerRow
      })
      await saveMatchPlayerStats(
        m.id,
        key,
        rows.map(({
          player_id, team_id, map_name, map_count,
          kills, deaths, assists,
          headshot_rate_pct, headshots,
          first_kills, multi_kills, clutches,
          adr, damage, rounds, we, rating,
        }) => ({
          player_id, team_id, map_name, map_count,
          kills, deaths, assists,
          headshot_rate_pct, headshots,
          first_kills, multi_kills, clutches,
          adr, damage, rounds, we, rating,
        })),
      )
    }
    ElMessage.success('本场队员数据已保存（后台自动重算爆头率/ADR）')
    visible.value = false
    emit('saved')
  } catch (e: any) {
    ElMessage.error(e?.message || '保存失败，请检查权限')
  } finally {
    saving.value = false
  }
}

const numCols = [
  { key: 'kills', label: '击杀', tip: '本图击杀数（参与爆头率加权：Σ 击杀 × 爆头率）' },
  { key: 'deaths', label: '死亡', tip: '' },
  { key: 'assists', label: '助攻', tip: '' },
  { key: 'headshot_rate_pct', label: '爆头率%', tip: '本图爆头率(整数 0~100)。赛事合计爆头率=Σ(击杀×爆头率取整)/Σ击杀' },
  { key: 'first_kills', label: '首杀', tip: '本图首杀' },
  { key: 'multi_kills', label: '多杀', tip: '本图多杀' },
  { key: 'clutches', label: '残局', tip: '本图残局' },
  { key: 'rounds', label: '局数', tip: '本图局数（ADR 合计权重）' },
] as const
const decCols = [
  { key: 'adr', label: 'ADR', tip: '本图平均伤害（小数）。赛事合计ADR=Σ(ADR×局数)/Σ局数' },
  { key: 'we', label: 'WE', tip: '本图 WE（排行页场均 = Σ/场次数）' },
  { key: 'rating', label: 'Rating', tip: '本图 Rating（排行页场均 = Σ/场次数）' },
] as const
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="`本场队员数据${match ? '：' + (match.team_a_name ?? '') + ' vs ' + (match.team_b_name ?? '') : ''}`"
    width="1220px"
    top="6vh"
  >
    <el-alert
      type="info"
      :closable="false"
      class="tip"
      title="按「每图」录入：爆头改为【爆头率整数%】，伤害改为【ADR平均伤害】。赛事期间自动按加权公式聚合：爆头率 = Σ(本图击杀×本图爆头率取整) ÷ Σ击杀；ADR = Σ(本图ADR×本图局数) ÷ Σ局数。"
    />

    <el-tabs v-model="activeMap">
      <el-tab-pane v-for="mp in maps" :key="mp.key" :name="mp.key">
        <template #label>
          <span class="map-tab-label">{{ mp.label }}</span>
        </template>
        <el-table v-loading="loading" :data="byMap[mp.key] ?? []" stripe size="small" max-height="52vh">
          <el-table-column label="选手" min-width="120" fixed>
            <template #default="{ row }">
              <span class="player-name">{{ row.player_name }}</span>
              <span v-if="row.pw_username" class="pw">{{ row.pw_username }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="team_name" label="战队" min-width="110" fixed />
          <el-table-column v-for="c in numCols" :key="c.key" :label="c.label" :width="c.key === 'headshot_rate_pct' ? 100 : 84" :show-overflow-tooltip="!!c.tip">
            <template #header>
              <el-tooltip :content="c.tip || c.label" placement="top">
                <span>{{ c.label }}</span>
              </el-tooltip>
            </template>
            <template #default="{ row }">
              <el-input-number
                v-model="row[c.key]"
                :min="c.key === 'headshot_rate_pct' ? 0 : 0"
                :max="c.key === 'headshot_rate_pct' ? 100 : undefined"
                size="small"
                :controls="false"
                class="cell-input"
              />
            </template>
          </el-table-column>
          <el-table-column v-for="c in decCols" :key="c.key" :label="c.label" width="96">
            <template #header>
              <el-tooltip :content="c.tip" placement="top">
                <span>{{ c.label }}</span>
              </el-tooltip>
            </template>
            <template #default="{ row }">
              <el-input-number v-model="row[c.key]" :min="0" :precision="2" size="small" :controls="false" class="cell-input" />
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>
    </el-tabs>

    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="saving" @click="save">保存全部地图数据</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.tip {
  margin-bottom: 12px;
}

.map-tab-label {
  font-weight: 500;
}

.player-name {
  margin-right: 6px;
}

.pw {
  font-size: 12px;
  color: var(--cs2-text-muted);
}

.cell-input {
  width: 76px;
}
</style>
