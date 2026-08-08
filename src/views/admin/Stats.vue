<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { UploadFilled, Plus } from '@element-plus/icons-vue'
import type { EventItem, Group, PlayerItem, PlayerStatRow, Stage, Team, TeamStatRow } from '@/api/types'
import { createTeamByAdmin, listGroups, listStages, listTeams } from '@/api/admin'
import { listEvents } from '@/api/event'
import { listPlayers } from '@/api/registration'
import { getPlayerStats, getTeamStats, savePlayerStat, saveTeamStat } from '@/api/stats'
import { parseCsv, rowToObject, TEAM_HEADER_ALIASES, PLAYER_HEADER_ALIASES, toNum } from '@/lib/csv'

const tab = ref<'team' | 'player'>('team')
const stages = ref<Stage[]>([])
const groups = ref<Group[]>([])
const events = ref<EventItem[]>([])
const teams = ref<Team[]>([])
const players = ref<PlayerItem[]>([])
const currentEventId = ref<string>('')
const currentStage = ref<string>('')
const currentGroup = ref<string>('')
const currentTeam = ref<string>('')
const loading = ref(false)
const saving = ref(false)
const loadError = ref('')

const teamRows = ref<TeamStatRow[]>([])
const playerRows = ref<PlayerStatRow[]>([])

// 手动新增队伍统计行：从战队列表选择未在当前列表的队伍
const addTeamDialog = ref(false)
const addTeamId = ref('')

// 手动新增个人统计行：从选手池选择
const addPlayerDialog = ref(false)
const addPlayerId = ref('')

// CSV 导入
const fileInput = ref<HTMLInputElement>()
const importDialog = ref(false)
const importLoading = ref(false)
const importError = ref('')
const importType = ref<'team' | 'player'>('team')
/** 预览行：cells = 原始单元格数组（按表头顺序），mapped = 按列别名映射后的字段对象 */
const importPreview = ref<Array<{ cells: string[]; mapped: Record<string, string | undefined> }>>([])
const importHeader = ref<string[]>([])

// 管理员手动新增战队
const teamDialogVisible = ref(false)
const teamSaving = ref(false)
const newTeam = reactive({
  name: '',
  tag: '',
  eventId: '',
  groupId: '',
  captainId: '',
  memberIds: [] as string[],
})

onMounted(async () => {
  events.value = await listEvents()
  currentEventId.value =
    events.value.find((e) => e.status === 'running')?.id ??
    events.value.find((e) => e.status === 'signup')?.id ??
    events.value[0]?.id ??
    ''
  groups.value = await listGroups()
  teams.value = await listTeams()
  players.value = await listPlayers()
  await loadStagesAndTeams()
  await load()
})

/** 切换赛事：刷新阶段与战队，重置阶段/组别/战队选择 */
async function onEventChange() {
  currentStage.value = ''
  currentGroup.value = ''
  currentTeam.value = ''
  await loadStagesAndTeams()
  await load()
}

async function loadStagesAndTeams() {
  stages.value = await listStages(currentEventId.value || undefined)
  teams.value = await listTeams()
  if (!stages.value.some((s) => s.id === currentStage.value)) {
    currentStage.value = stages.value[0]?.id ?? ''
  }
  if (currentTeam.value && !filteredTeams.value.some((t) => t.id === currentTeam.value)) {
    currentTeam.value = ''
  }
}

/** 按当前赛事 + 组别过滤战队（个人数据页签的"选择战队"下拉只显示所选赛事/组别的队伍） */
const filteredTeams = computed(() =>
  teams.value.filter(
    (t) =>
      (!currentEventId.value || t.event_id === currentEventId.value) &&
      (!currentGroup.value || t.group_id === currentGroup.value),
  ),
)

/** 个人数据页签的选手列表：按所选战队过滤；未选战队时显示选手池全部（含未入队选手） */
const filteredPlayers = computed(() => {
  if (currentTeam.value) return players.value.filter((p) => p.team_id === currentTeam.value)
  return players.value
})

/** 切换阶段/组别/页签：先重置为当前筛选范围内第一支战队，再重新加载 */
async function onFilterChange() {
  if (currentTeam.value && !filteredTeams.value.some((t) => t.id === currentTeam.value)) {
    currentTeam.value = ''
  }
  await load()
}

async function openTeamDialog() {
  players.value = await listPlayers()
  events.value = await listEvents()
  Object.assign(newTeam, {
    name: '',
    tag: '',
    eventId:
      currentEventId.value ||
      events.value.find((e) => e.status === 'signup')?.id ||
      events.value[0]?.id ||
      '',
    groupId: '',
    captainId: '',
    memberIds: [],
  })
  teamDialogVisible.value = true
}

async function submitNewTeam() {
  if (!newTeam.name) {
    ElMessage.warning('请填写战队名称')
    return
  }
  if (!newTeam.eventId) {
    ElMessage.warning('请选择赛事')
    return
  }
  const count = 1 + newTeam.memberIds.length
  if (count < 5) {
    ElMessage.warning(`至少 5 人（含队长），还需选 ${5 - count} 名队员`)
    return
  }
  teamSaving.value = true
  try {
    const team = await createTeamByAdmin({
      name: newTeam.name,
      tag: newTeam.tag,
      eventId: newTeam.eventId,
      groupId: newTeam.groupId || null,
      captainId: newTeam.captainId,
      memberIds: newTeam.memberIds,
    })
    if (!team) {
      ElMessage.error('创建失败')
      return
    }
    ElMessage.success(`已创建战队「${team.name}」`)
    teamDialogVisible.value = false
    teams.value = await listTeams()
    if (!currentTeam.value) currentTeam.value = teams.value[0]?.id ?? ''
    await load()
  } finally {
    teamSaving.value = false
  }
}

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const stageId = currentStage.value || undefined
    const groupId = currentGroup.value || undefined
    const stageName = stages.value.find((s) => s.id === currentStage.value)?.name ?? '-'

    // 队伍统计行：以战队列表为底（按赛事 + 组别筛选），合并已有统计数据
    const teamStats = await getTeamStats(groupId, stageId)
    const teamMap = new Map(teamStats.map((s) => [s.team_id, s]))
    teamRows.value = teams.value
      .filter((t) => (!currentEventId.value || t.event_id === currentEventId.value))
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
          first_five_win_rate: ex?.first_five_win_rate ?? 0, net: 0,
          avg_kills: ex?.avg_kills ?? 0, avg_deaths: ex?.avg_deaths ?? 0, avg_assists: ex?.avg_assists ?? 0,
          total_kills: ex?.total_kills ?? 0, total_deaths: ex?.total_deaths ?? 0,
          total_assists: ex?.total_assists ?? 0,
        } as TeamStatRow
      })

    // 个人统计行：以选手池为底（可选按战队过滤；未入队选手也能初始化数据）
    const playerStats = await getPlayerStats(groupId, stageId)
    const playerMap = new Map(playerStats.map((s) => [s.player_id, s]))
    playerRows.value = filteredPlayers.value.map((p) => {
      const ex = playerMap.get(p.id)
      const team = p.team_id ? teams.value.find((t) => t.id === p.team_id) : null
      const groupName = team ? (groups.value.find((g) => g.id === team.group_id)?.name ?? '-') : '未入队'
      return {
        player_id: p.id, player_name: p.nickname ?? '-',
        pw_username: p.pw_username ?? null,
        team_id: p.team_id ?? null, team_name: team?.name ?? '未入队',
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
  } catch (e: any) {
    loadError.value = e?.message || '数据加载失败'
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

// ---------------- 手动新增统计行 ----------------
/** 打开新增队伍行对话框：可选范围 = 当前筛选范围内尚未出现在列表的队伍 */
function openAddTeamRow() {
  addTeamId.value = ''
  addTeamDialog.value = true
}

const addableTeams = computed(() => {
  const existing = new Set(teamRows.value.map((r) => r.team_id))
  return filteredTeams.value.filter((t) => !existing.has(t.id))
})

function confirmAddTeamRow() {
  const t = teams.value.find((x) => x.id === addTeamId.value)
  if (!t) {
    ElMessage.warning('请选择要补录的战队')
    return
  }
  const groupName = groups.value.find((g) => g.id === t.group_id)?.name ?? '-'
  teamRows.value.push({
    team_id: t.id, team_name: t.name, tag: t.tag,
    stage_id: currentStage.value, stage_name: stages.value.find((s) => s.id === currentStage.value)?.name ?? '-',
    group_id: t.group_id, group_name: groupName,
    win_rate: 0, kd: 0, matches: 0, net: 0,
    hs_rate: 0, pistol_win_rate: 0, first_five_win_rate: 0,
    avg_kills: 0, avg_deaths: 0, avg_assists: 0,
    total_kills: 0, total_deaths: 0, total_assists: 0,
  } as TeamStatRow)
  addTeamDialog.value = false
  ElMessage.success(`已添加「${t.name}」一行，填写后点保存`)
}

/** 打开新增个人行对话框：可选范围 = 选手池中尚未出现在当前战队名册的选手 */
function openAddPlayerRow() {
  addPlayerId.value = ''
  addPlayerDialog.value = true
}

const addablePlayers = computed(() => {
  const existing = new Set(playerRows.value.map((r) => r.player_id))
  return players.value.filter((p) => !existing.has(p.id))
})

function confirmAddPlayerRow() {
  const p = players.value.find((x) => x.id === addPlayerId.value)
  if (!p) {
    ElMessage.warning('请选择要补录的选手')
    return
  }
  const team = p.team_id ? teams.value.find((t) => t.id === p.team_id) : null
  const groupName = team ? (groups.value.find((g) => g.id === team.group_id)?.name ?? '-') : '未入队'
  playerRows.value.push({
    player_id: p.id, player_name: p.nickname ?? '-', pw_username: p.pw_username ?? null,
    team_id: p.team_id ?? null, team_name: team?.name ?? '未入队',
    stage_id: currentStage.value, stage_name: stages.value.find((s) => s.id === currentStage.value)?.name ?? '-',
    group_id: team?.group_id ?? null, group_name: groupName,
    we: 0, rating_pro: 0, win_rate: 0, kd: 0, matches: 0, hs_rate: 0,
    kpr: 0, dpr: 0, adr: 0,
    total_kills: 0, total_deaths: 0, total_assists: 0, fpr: 0, awp_kpr: 0,
  } as PlayerStatRow)
  addPlayerDialog.value = false
  ElMessage.success(`已添加「${p.nickname ?? p.pw_username ?? '-'}」一行，填写后点保存`)
}

// ---------------- CSV 批量导入 ----------------
function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = '' // 允许重复选择同一文件
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    try {
      const rows = parseCsv(String(reader.result ?? ''))
      if (rows.length === 0) {
        ElMessage.warning('CSV 为空或无法解析')
        return
      }
      const header = rows[0]
      importHeader.value = header
      importType.value = tab.value
      importPreview.value = rows.slice(1).map((r) => ({
        cells: r,
        mapped: rowToObject(header, r, importType.value === 'team' ? TEAM_HEADER_ALIASES : PLAYER_HEADER_ALIASES),
      }))
      importError.value = ''
      importDialog.value = true
    } catch (err: any) {
      ElMessage.error('解析 CSV 失败：' + (err?.message ?? '未知错误'))
    }
  }
  reader.onerror = () => ElMessage.error('读取文件失败')
  reader.readAsText(file)
}

/** 把导入预览行落库（新增数据；同 team_id+stage_id 或 player_id+stage_id 已存在的行跳过，不覆盖） */
async function confirmImport() {
  if (!currentStage.value) {
    ElMessage.warning('请先选择阶段，再导入数据')
    return
  }
  importLoading.value = true
  importError.value = ''
  let okCount = 0
  const skipped: string[] = []
  try {
    if (importType.value === 'team') {
      const existing = await getTeamStats(undefined, currentStage.value)
      const existingKeys = new Set(existing.map((s) => s.team_id))
      for (const { mapped: raw } of importPreview.value) {
        const name = raw.team_name?.trim()
        if (!name) continue
        const t = teams.value.find(
          (x) =>
            (!currentEventId.value || x.event_id === currentEventId.value) &&
            (x.name === name || x.tag === name || x.name.toLowerCase() === name.toLowerCase()),
        )
        if (!t) {
          skipped.push(name)
          continue
        }
        if (existingKeys.has(t.id)) {
          skipped.push(`${name}（已存在，跳过）`)
          continue
        }
        const groupName = groups.value.find((g) => g.id === t.group_id)?.name ?? '-'
        await saveTeamStat({
          team_id: t.id, team_name: t.name, tag: t.tag,
          stage_id: currentStage.value, stage_name: stages.value.find((s) => s.id === currentStage.value)?.name ?? '-',
          group_id: t.group_id, group_name: groupName,
          win_rate: toNum(raw.win_rate), kd: toNum(raw.kd), matches: Math.round(toNum(raw.matches)),
          hs_rate: toNum(raw.hs_rate), pistol_win_rate: toNum(raw.pistol_win_rate),
          first_five_win_rate: toNum(raw.first_five_win_rate), net: 0,
          avg_kills: toNum(raw.avg_kills), avg_deaths: toNum(raw.avg_deaths), avg_assists: toNum(raw.avg_assists),
          total_kills: Math.round(toNum(raw.total_kills)), total_deaths: Math.round(toNum(raw.total_deaths)),
          total_assists: Math.round(toNum(raw.total_assists)),
        } as TeamStatRow)
        okCount++
      }
    } else {
      // 个人数据导入按选手池匹配选手，战队归属取该选手在池中的实际战队（未入队则显示「未入队」），不强制绑定当前所选战队
      const existing = await getPlayerStats(undefined, currentStage.value)
      const existingKeys = new Set(existing.map((s) => s.player_id))
      for (const { mapped: raw } of importPreview.value) {
        const name = raw.player_name?.trim()
        if (!name) continue
        const p = players.value.find(
          (x) => x.nickname === name || x.pw_username === name || x.nickname?.toLowerCase() === name.toLowerCase(),
        )
        if (!p) {
          skipped.push(name)
          continue
        }
        if (existingKeys.has(p.id)) {
          skipped.push(`${name}（已存在，跳过）`)
          continue
        }
        const team = p.team_id ? teams.value.find((t) => t.id === p.team_id) : null
        const groupName = team ? (groups.value.find((g) => g.id === team.group_id)?.name ?? '-') : '未入队'
        await savePlayerStat({
          player_id: p.id, player_name: p.nickname ?? '-', pw_username: p.pw_username ?? null,
          team_id: p.team_id ?? null, team_name: team?.name ?? '未入队',
          stage_id: currentStage.value, stage_name: stages.value.find((s) => s.id === currentStage.value)?.name ?? '-',
          group_id: team?.group_id ?? null, group_name: groupName,
          we: toNum(raw.we), rating_pro: toNum(raw.rating_pro),
          win_rate: toNum(raw.win_rate), kd: toNum(raw.kd), matches: Math.round(toNum(raw.matches)),
          hs_rate: toNum(raw.hs_rate), kpr: toNum(raw.kpr), dpr: toNum(raw.dpr), adr: toNum(raw.adr),
          total_kills: Math.round(toNum(raw.total_kills)), total_deaths: Math.round(toNum(raw.total_deaths)),
          total_assists: Math.round(toNum(raw.total_assists)), fpr: toNum(raw.fpr), awp_kpr: toNum(raw.awp_kpr),
        } as PlayerStatRow)
        okCount++
      }
    }
    importDialog.value = false
    await load()
    const tip = `导入完成：新增 ${okCount} 条`
    ElMessage.success(skipped.length > 0 ? `${tip}；跳过 ${skipped.length} 条（${skipped.slice(0, 5).join('、')}${skipped.length > 5 ? '…' : ''}）` : tip)
  } catch (e: any) {
    importError.value = e?.message || '导入失败'
  } finally {
    importLoading.value = false
  }
}
</script>

<template>
  <div class="stats-page">
    <h2>数据录入</h2>

    <div class="filters">
      <el-radio-group v-model="tab" @change="onFilterChange">
        <el-radio-button value="team">队伍数据</el-radio-button>
        <el-radio-button value="player">个人数据</el-radio-button>
      </el-radio-group>

      <el-select v-model="currentEventId" placeholder="选择赛事" class="filter-item" @change="onEventChange">
        <el-option
          v-for="e in events"
          :key="e.id"
          :label="`${e.name}${e.edition ? `（第 ${e.edition} 届）` : ''}`"
          :value="e.id"
        />
      </el-select>

      <el-select v-model="currentStage" placeholder="选择阶段" class="filter-item" @change="onFilterChange">
        <el-option v-for="s in stages" :key="s.id" :label="s.name" :value="s.id" />
      </el-select>

      <el-select
        v-model="currentGroup"
        placeholder="选择组别"
        clearable
        class="filter-item"
        @change="onFilterChange"
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
        <el-option v-for="t in filteredTeams" :key="t.id" :label="t.name" :value="t.id" />
      </el-select>

      <el-button v-if="tab === 'team'" type="success" plain @click="openTeamDialog">
        新增战队
      </el-button>
      <el-button
        v-if="tab === 'team'"
        :icon="Plus"
        plain
        :disabled="addableTeams.length === 0"
        @click="openAddTeamRow"
      >
        补录队伍行
      </el-button>
      <el-button
        v-if="tab === 'player'"
        :icon="Plus"
        plain
        :disabled="addablePlayers.length === 0"
        @click="openAddPlayerRow"
      >
        补录选手行
      </el-button>
      <el-button :icon="UploadFilled" plain @click="fileInput?.click()">
        导入 CSV
      </el-button>
      <el-button
        type="primary"
        :loading="saving"
        @click="tab === 'team' ? saveTeamRows() : savePlayerRows()"
      >
        保存当前列表
      </el-button>
      <input
        ref="fileInput"
        type="file"
        accept=".csv,text/csv"
        class="file-input"
        @change="onFileChange"
      />
    </div>

    <el-alert
      v-if="loadError"
      type="error"
      :closable="false"
      class="hint"
      title="数据加载失败"
      :description="`${loadError}。请确认已在 Supabase SQL Editor 执行完整的 schema.sql（建好 teams / stages / team_stats / player_stats 等表），然后刷新重试。`"
    />
    <el-alert
      v-else-if="tab === 'team' && teamRows.length === 0"
      type="info"
      :closable="false"
      class="hint"
      title="暂无队伍可录入"
      description="数据录入按已审核战队生成录入行。请先在前台「战队报名」创建战队，再到「战队审核」通过（通过时需分配组别、队员 ≥5 人），返回本页即可看到可编辑的统计行。"
    />
    <el-alert
      v-else-if="tab === 'player' && players.length === 0"
      type="info"
      :closable="false"
      class="hint"
      title="暂无选手可录入"
      description="个人数据以选手池为底：请先在前台「个人注册」提交完美 ID 与赛季截图，并在「个人选手审核」中通过，该选手即自动出现在下方列表（未入队选手也可直接录入统计）。"
    />

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
          <template #default="{ row }"><el-input-number v-model="row.avg_kills" :min="0" :precision="2" size="small" :controls="false" /></template>
        </el-table-column>
        <el-table-column label="场均死亡" width="86">
          <template #default="{ row }"><el-input-number v-model="row.avg_deaths" :min="0" :precision="2" size="small" :controls="false" /></template>
        </el-table-column>
        <el-table-column label="场均助攻" width="86">
          <template #default="{ row }"><el-input-number v-model="row.avg_assists" :min="0" :precision="2" size="small" :controls="false" /></template>
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
      <el-table :data="playerRows" stripe empty-text="暂无选手（请先通过个人注册审核）">
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

    <!-- 新增战队对话框 -->
    <el-dialog v-model="teamDialogVisible" title="新增战队（直接通过审核并创建名册）" width="520px">
      <el-alert
        v-if="players.length === 0"
        type="warning"
        :closable="false"
        class="dialog-tip"
        title="选手池为空"
        description="请先在前台「个人注册」提交完美 ID 与赛季截图并通过「选手审核」，本对话框才能选择队长与队员。"
      />
      <el-form :model="newTeam" label-width="90px">
        <el-form-item label="赛事">
          <el-select v-model="newTeam.eventId" placeholder="选择赛事" style="width: 100%">
            <el-option
              v-for="e in events"
              :key="e.id"
              :label="`${e.name}${e.edition ? `（第 ${e.edition} 届）` : ''}`"
              :value="e.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="战队名称">
          <el-input v-model="newTeam.name" placeholder="如 Nova Velocity" />
        </el-form-item>
        <el-form-item label="战队 ID">
          <el-input v-model="newTeam.tag" maxlength="6" placeholder="如 NV11" />
        </el-form-item>
        <el-form-item label="组别">
          <el-select v-model="newTeam.groupId" placeholder="选择组别" style="width: 100%">
            <el-option v-for="g in groups" :key="g.id" :label="g.name" :value="g.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="队长">
          <el-select
            v-model="newTeam.captainId"
            filterable
            placeholder="从选手池选择队长"
            style="width: 100%"
          >
            <el-option
              v-for="p in players"
              :key="p.id"
              :label="`${p.nickname || '未命名'}${p.pw_username ? `（${p.pw_username}）` : ''}`"
              :value="p.id"
              :disabled="p.in_team"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="队员">
          <el-select
            v-model="newTeam.memberIds"
            multiple
            filterable
            placeholder="选择 4 名以上队员"
            style="width: 100%"
          >
            <el-option
              v-for="p in players"
              :key="p.id"
              :label="`${p.nickname || '未命名'}${p.pw_username ? `（${p.pw_username}）` : ''}`"
              :value="p.id"
              :disabled="p.in_team || p.id === newTeam.captainId"
            />
          </el-select>
          <div class="form-tip">共需 5 人（含队长），当前 {{ 1 + newTeam.memberIds.length }} 人</div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="teamDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="teamSaving" @click="submitNewTeam">创建</el-button>
      </template>
    </el-dialog>

    <!-- 补录队伍统计行（从当前筛选范围内选择尚未在列表的战队） -->
    <el-dialog v-model="addTeamDialog" title="补录队伍统计行" width="420px">
      <p class="dialog-tip">为尚未录入数据的战队新增一行，保存后写入统计数据，不影响已有记录。</p>
      <el-select v-model="addTeamId" placeholder="选择战队" filterable style="width: 100%">
        <el-option v-for="t in addableTeams" :key="t.id" :label="t.name" :value="t.id" />
      </el-select>
      <template #footer>
        <el-button @click="addTeamDialog = false">取消</el-button>
        <el-button type="primary" @click="confirmAddTeamRow">添加</el-button>
      </template>
    </el-dialog>

    <!-- 补录个人统计行（从选手池选择尚未在列表的选手，战队归属按该选手实际入队情况） -->
    <el-dialog v-model="addPlayerDialog" title="补录个人统计行" width="420px">
      <p class="dialog-tip">为选手池中的一名选手新增一行统计，保存后写入统计数据；未入队选手也可补录。</p>
      <el-select v-model="addPlayerId" placeholder="选择选手" filterable style="width: 100%">
        <el-option
          v-for="p in addablePlayers"
          :key="p.id"
          :label="`${p.nickname || '未命名'}${p.pw_username ? `（${p.pw_username}）` : ''}`"
          :value="p.id"
        />
      </el-select>
      <template #footer>
        <el-button @click="addPlayerDialog = false">取消</el-button>
        <el-button type="primary" @click="confirmAddPlayerRow">添加</el-button>
      </template>
    </el-dialog>

    <!-- CSV 批量导入预览 -->
    <el-dialog v-model="importDialog" title="导入 CSV 数据" width="720px">
      <el-alert
        type="info"
        :closable="false"
        class="dialog-tip"
        :title="`共解析 ${importPreview.length} 行 · ${importType === 'team' ? '队伍统计' : '个人统计'} 格式`"
        description="按列名自动匹配（如 战队/胜率/K-D/爆头率/场均击杀/总击杀 等）。导入为新增数据：同一阶段已存在的队伍/选手会跳过，不会覆盖旧数据；无法匹配到系统内战队/选手的行会跳过。"
      />
      <el-alert
        v-if="importError"
        type="error"
        :closable="false"
        class="dialog-tip"
        title="导入失败"
        :description="importError"
      />
      <div class="import-preview">
        <el-table :data="importPreview" stripe height="320">
          <el-table-column
            v-for="(h, i) in importHeader"
            :key="i"
            :prop="String(i)"
            :label="h"
            min-width="90"
          >
            <template #default="{ row }">{{ row.cells[i] ?? '' }}</template>
          </el-table-column>
        </el-table>
      </div>
      <template #footer>
        <el-button @click="importDialog = false">取消</el-button>
        <el-button type="primary" :loading="importLoading" @click="confirmImport">确认导入</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.stats-page {
  max-width: 1680px;
}

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

.file-input {
  display: none;
}

.import-preview {
  margin-top: 4px;
}

.hint {
  margin-bottom: 16px;
}

.dialog-tip {
  margin-bottom: 16px;
}

.form-tip {
  font-size: 12px;
  color: var(--cs2-text-muted);
  line-height: 1.5;
}
</style>
