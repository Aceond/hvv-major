<script setup lang="ts">
// 本场队员数据录入对话框（比分录入入口的一部分）
// 自动匹配比赛双方正式队员，按场次登记：击杀/死亡/助攻/爆头/首杀/多杀/残局/伤害/局数/WE/Rating。
// 个人数据排行页据此自动聚合（场均 = 总量 / 地图数，爆头率 = Σ爆头/Σ击杀，ADR = Σ伤害/Σ局数）。
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import type { Match, MatchPlayerStatInput, TeamMember } from '@/api/types'
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
const rows = ref<PlayerRow[]>([])
const mapCount = ref(1)
const loading = ref(false)
const saving = ref(false)

watch(
  () => [props.modelValue, props.match?.id] as const,
  async ([open, matchId]) => {
    if (!open || !matchId) return
    await load(matchId)
  },
)

/** 本场地图数：BO1 = 1；BO3 = 已录入的逐图比分张数（无逐图时按赛制 3） */
function resolveMapCount(m: Match): number {
  if (m.best_of <= 1) return 1
  return Math.max(1, m.best_of)
}

async function load(matchId: string) {
  const m = props.match
  if (!m) return
  loading.value = true
  try {
    players.value = await listMatchPlayers(m.team_a_id, m.team_b_id)
    // 已有录入回填；逐图数优先按 match_maps 实际张数（BO3 未录逐图时按赛制）
    const [existing, maps] = await Promise.all([
      listMatchPlayerStats(matchId),
      m.best_of > 1 ? listMatchMaps([matchId]) : Promise.resolve([]),
    ])
    const filledMaps = maps.filter((mp) => mp.team_a_score > 0 || mp.team_b_score > 0).length
    mapCount.value = filledMaps > 0 ? filledMaps : resolveMapCount(m)
    const map = new Map(existing.map((e) => [e.player_id, e]))
    rows.value = players.value.map((p) => {
      const ex = map.get(p.profile_id)
      return {
        player_id: p.profile_id,
        team_id: p.team_id,
        map_count: mapCount.value,
        kills: ex?.kills ?? 0,
        deaths: ex?.deaths ?? 0,
        assists: ex?.assists ?? 0,
        headshots: ex?.headshots ?? 0,
        first_kills: ex?.first_kills ?? 0,
        multi_kills: ex?.multi_kills ?? 0,
        clutches: ex?.clutches ?? 0,
        damage: ex?.damage ?? 0,
        rounds: ex?.rounds ?? 0,
        we: ex?.we ?? 0,
        rating: ex?.rating ?? 0,
        player_name: p.nickname ?? p.pw_username ?? '未命名',
        pw_username: p.pw_username,
        team_name: '',
      }
    })
    // 补战队名（team_members 未冗余队名时按 id 简单区分）
    const teamA = m.team_a_name ?? 'A 队'
    const teamB = m.team_b_name ?? 'B 队'
    for (const r of rows.value) {
      r.team_name = r.team_id === m.team_a_id ? teamA : r.team_id === m.team_b_id ? teamB : '-'
    }
  } finally {
    loading.value = false
  }
}

/** 保存：把地图数同步到所有行后整体覆盖 */
async function save() {
  const m = props.match
  if (!m) return
  saving.value = true
  try {
    for (const r of rows.value) r.map_count = mapCount.value
    await saveMatchPlayerStats(
      m.id,
      rows.value.map(({ player_id, team_id, map_count, kills, deaths, assists, headshots, first_kills, multi_kills, clutches, damage, rounds, we, rating }) => ({
        player_id, team_id, map_count, kills, deaths, assists, headshots,
        first_kills, multi_kills, clutches, damage, rounds, we, rating,
      })),
    )
    ElMessage.success('本场队员数据已保存')
    visible.value = false
    emit('saved')
  } catch (e: any) {
    ElMessage.error(e?.message || '保存失败，请检查权限')
  } finally {
    saving.value = false
  }
}

const numCols = [
  { key: 'kills', label: '击杀', tip: '本场所有地图合计' },
  { key: 'deaths', label: '死亡', tip: '' },
  { key: 'assists', label: '助攻', tip: '' },
  { key: 'headshots', label: '爆头', tip: '爆头数（排行页 = Σ爆头/Σ击杀）' },
  { key: 'first_kills', label: '首杀', tip: '场均首杀 = Σ首杀/地图数' },
  { key: 'multi_kills', label: '多杀', tip: '场均多杀 = Σ多杀/地图数' },
  { key: 'clutches', label: '残局', tip: '场均残局 = Σ残局/地图数' },
  { key: 'damage', label: '伤害', tip: '总伤害（ADR = Σ伤害/Σ局数）' },
  { key: 'rounds', label: '局数', tip: '总局数' },
] as const
const decCols = [
  { key: 'we', label: 'WE', tip: '本场 WE（排行页场均 = ΣWE/场次数）' },
  { key: 'rating', label: 'Rating', tip: '本场 Rating（排行页场均 = ΣRating/场次数）' },
] as const
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="`本场队员数据${match ? '：' + (match.team_a_name ?? '') + ' vs ' + (match.team_b_name ?? '') : ''}`"
    width="1180px"
    top="6vh"
  >
    <el-alert
      type="info"
      :closable="false"
      class="tip"
      title="自动匹配本场双方正式队员，按「场次」录入汇总数据（每行 = 本场所有地图合计）。个人数据排行自动聚合：场均 = 总量 / 地图数，爆头率 = Σ爆头/Σ击杀，ADR = Σ伤害/Σ局数，WE / Rating = Σ/场次数。"
    />
    <el-form inline class="map-count-form">
      <el-form-item label="本场地图数">
        <el-input-number v-model="mapCount" :min="1" :max="5" size="small" />
      </el-form-item>
      <span class="map-count-hint">BO{{ match?.best_of ?? 1 }} 默认按已录入的逐图比分张数；计算场均时以此为分母。</span>
    </el-form>

    <el-table v-loading="loading" :data="rows" stripe size="small" max-height="52vh">
      <el-table-column label="选手" min-width="120" fixed>
        <template #default="{ row }">
          <span class="player-name">{{ row.player_name }}</span>
          <span v-if="row.pw_username" class="pw">{{ row.pw_username }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="team_name" label="战队" min-width="110" fixed />
      <el-table-column v-for="c in numCols" :key="c.key" :label="c.label" width="84" :show-overflow-tooltip="!!c.tip">
        <template #header>
          <el-tooltip :content="c.tip || c.label" placement="top">
            <span>{{ c.label }}</span>
          </el-tooltip>
        </template>
        <template #default="{ row }">
          <el-input-number v-model="row[c.key]" :min="0" size="small" :controls="false" class="cell-input" />
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

    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="saving" @click="save">保存本场数据</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.tip {
  margin-bottom: 12px;
}

.map-count-form {
  margin-bottom: 4px;
}

.map-count-hint {
  font-size: 12px;
  color: var(--cs2-text-muted);
}

.player-name {
  margin-right: 6px;
}

.pw {
  font-size: 12px;
  color: var(--cs2-text-muted);
}

.cell-input {
  width: 72px;
}
</style>
