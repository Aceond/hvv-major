<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { VideoCamera, Link, Microphone } from '@element-plus/icons-vue'
import SwissBracket from '@/components/SwissBracket.vue'
import type { EventItem, Group, Match, MatchCaster, MatchMedia, MediaKind, Stage } from '@/api/types'
import { MATCH_STATUS_LABEL, MEDIA_KIND_LABEL, STAGE_STATUS_LABEL } from '@/api/types'
import { listGroups, listMatches, listStages, listAllStageMatches } from '@/api/match'
import { listEvents } from '@/api/event'
import { addMatchMedia, listAllMatchMedia, removeMatchMedia } from '@/api/media'
import { addMatchCaster, listAllMatchCasters, removeMatchCaster } from '@/api/caster'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()

const events = ref<EventItem[]>([])
const currentEventId = ref<string>('')
const currentGroupId = ref<string>('')
const stages = ref<Stage[]>([])
const groups = ref<Group[]>([])
const currentStage = ref<string>('all') // 'all' = 全部比赛页签
const matches = ref<Match[]>([])
const loading = ref(false)
const viewMode = ref<'list' | 'bracket'>('list')

// 媒体链接：按比赛分组（matchId -> MatchMedia[]）
const mediaMap = ref<Record<string, MatchMedia[]>>({})
// 解说名单：按比赛分组（matchId -> MatchCaster[]）
const castersMap = ref<Record<string, MatchCaster[]>>({})

// 登记媒体对话框
const dialogVisible = ref(false)
const dialogMatch = ref<Match | null>(null)
const mediaList = ref<MatchMedia[]>([])
const mediaForm = reactive<{ kind: MediaKind; label: string; url: string }>({
  kind: 'live',
  label: '',
  url: '',
})

// 解说对话框
const casterDialogVisible = ref(false)
const casterDialogMatch = ref<Match | null>(null)
const casterList = ref<MatchCaster[]>([])
const casterInput = ref('')

const currentStageName = computed(
  () => stages.value.find((s) => s.id === currentStage.value)?.name ?? '',
)

function mediaOf(match: Match): MatchMedia[] {
  return mediaMap.value[match.id] ?? []
}

function castersOf(match: Match): MatchCaster[] {
  return castersMap.value[match.id] ?? []
}

onMounted(async () => {
  events.value = await listEvents()
  const active =
    events.value.find((e) => e.status === 'running') ??
    events.value.find((e) => e.status === 'signup') ??
    events.value[0]
  currentEventId.value = active?.id ?? ''
  groups.value = await listGroups()
  await loadMatches()
})

async function onEventChange() {
  currentStage.value = 'all'
  await loadMatches()
}

async function loadMatches() {
  loading.value = true
  try {
    stages.value = await listStages(currentEventId.value || undefined, currentGroupId.value || undefined)
    if (currentStage.value !== 'all' && !stages.value.some((s) => s.id === currentStage.value)) {
      currentStage.value = 'all'
    }
    matches.value =
      currentStage.value === 'all'
        ? await listAllStageMatches(
            currentEventId.value || undefined,
            currentGroupId.value || undefined,
          )
        : await listMatches(currentStage.value)
    await loadMedia()
    await loadCasters()
  } finally {
    loading.value = false
  }
}

/** 阶段页签文案：阶段名自动带上组别，避免同名阶段分不清 */
function stageTabLabel(s: Stage) {
  const g = s.group_id ? groups.value.find((x) => x.id === s.group_id)?.name ?? '' : ''
  const name = s.name
  return g && !name.includes(g) ? `${name} · ${g}` : name
}

/** 全部比赛视图：按组别分组（组别顺序按 sort_order，未分组的放最后） */
const groupedMatches = computed(() => {
  const order = new Map(groups.value.map((g, i) => [g.id, i]))
  const map = new Map<string, { key: string; name: string; matches: Match[] }>()
  for (const m of matches.value) {
    const gid = m.group_id ?? ''
    const key = gid || '__none__'
    if (!map.has(key)) {
      const name = gid
        ? (groups.value.find((g) => g.id === gid)?.name ?? '未分组')
        : '跨组 / 未分组'
      map.set(key, { key, name, matches: [] })
    }
    map.get(key)!.matches.push(m)
  }
  return [...map.values()].sort((a, b) => {
    const ia = a.key === '__none__' ? 99 : order.get(a.key) ?? 98
    const ib = b.key === '__none__' ? 99 : order.get(b.key) ?? 98
    return ia - ib
  })
})

async function loadMedia() {
  const all = await listAllMatchMedia()
  mediaMap.value = all.reduce<Record<string, MatchMedia[]>>((acc, m) => {
    ;(acc[m.match_id] ??= []).push(m)
    return acc
  }, {})
}

async function loadCasters() {
  const all = await listAllMatchCasters()
  castersMap.value = all.reduce<Record<string, MatchCaster[]>>((acc, c) => {
    ;(acc[c.match_id] ??= []).push(c)
    return acc
  }, {})
}

function matchStatusType(status: Match['status']) {
  return status === 'completed' ? 'success' : status === 'cancelled' ? 'danger' : 'warning'
}

function openMediaDialog(match: Match) {
  dialogMatch.value = match
  mediaList.value = [...mediaOf(match)]
  mediaForm.kind = 'live'
  mediaForm.label = ''
  mediaForm.url = ''
  dialogVisible.value = true
}

async function submitMedia() {
  const match = dialogMatch.value
  if (!match) return
  const url = mediaForm.url.trim()
  if (!/^https?:\/\//i.test(url)) {
    ElMessage.warning('链接需以 http:// 或 https:// 开头')
    return
  }
  const item = await addMatchMedia(match.id, mediaForm.kind, mediaForm.label.trim(), url)
  if (!item) {
    ElMessage.error('保存失败，请稍后重试')
    return
  }
  mediaList.value.push(item)
  mediaMap.value[match.id] = [...(mediaMap.value[match.id] ?? []), item]
  mediaForm.kind = 'live'
  mediaForm.label = ''
  mediaForm.url = ''
  ElMessage.success('已登记媒体链接')
}

async function removeMedia(item: MatchMedia) {
  try {
    await ElMessageBox.confirm('确认删除这条链接吗？', '删除确认', { type: 'warning' })
  } catch {
    return
  }
  const ok = await removeMatchMedia(item.id)
  if (!ok) {
    ElMessage.error('删除失败，请稍后重试')
    return
  }
  mediaList.value = mediaList.value.filter((x) => x.id !== item.id)
  const list = mediaMap.value[item.match_id]
  if (list) mediaMap.value[item.match_id] = list.filter((x) => x.id !== item.id)
  ElMessage.success('已删除')
}

// ---------------- 解说管理 ----------------
function openCasterDialog(match: Match) {
  casterDialogMatch.value = match
  casterList.value = [...castersOf(match)]
  casterInput.value = ''
  casterDialogVisible.value = true
}

async function addCaster() {
  const match = casterDialogMatch.value
  const name = casterInput.value.trim()
  if (!match || !name) {
    ElMessage.warning('请输入解说人员姓名')
    return
  }
  if (castersOf(match).some((c) => c.caster_name === name)) {
    ElMessage.warning('该解说已添加')
    return
  }
  const item = await addMatchCaster(match.id, name)
  if (!item) {
    ElMessage.error('保存失败，请稍后重试')
    return
  }
  casterList.value.push(item)
  castersMap.value[match.id] = [...(castersMap.value[match.id] ?? []), item]
  casterInput.value = ''
  ElMessage.success('已添加解说')
}

async function removeCaster(item: MatchCaster) {
  try {
    await ElMessageBox.confirm(`确认移除解说「${item.caster_name}」吗？`, '移除确认', { type: 'warning' })
  } catch {
    return
  }
  const ok = await removeMatchCaster(item.id)
  if (!ok) {
    ElMessage.error('删除失败，请稍后重试')
    return
  }
  casterList.value = casterList.value.filter((x) => x.id !== item.id)
  const list = castersMap.value[item.match_id]
  if (list) castersMap.value[item.match_id] = list.filter((x) => x.id !== item.id)
  ElMessage.success('已移除解说')
}
</script>

<template>
  <div class="page-container">
    <h2 class="title">赛程</h2>

    <div class="event-bar">
      <el-select v-model="currentEventId" class="event-select" placeholder="选择赛事" @change="onEventChange">
        <el-option
          v-for="e in events"
          :key="e.id"
          :label="`${e.name}${e.edition ? `（第 ${e.edition} 届）` : ''}`"
          :value="e.id"
        />
      </el-select>
      <el-select v-model="currentGroupId" class="event-select" placeholder="选择组别" @change="onEventChange">
        <el-option label="全部组别" value="" />
        <el-option v-for="g in groups" :key="g.id" :label="g.name" :value="g.id" />
      </el-select>
    </div>

    <el-tabs v-model="currentStage" @tab-change="loadMatches">
      <el-tab-pane label="全部比赛" name="all" />
      <el-tab-pane
        v-for="s in stages"
        :key="s.id"
        :label="`${stageTabLabel(s)}（${STAGE_STATUS_LABEL[s.status]}）`"
        :name="s.id"
      />
    </el-tabs>

    <div class="view-switch">
      <el-radio-group v-model="viewMode">
        <el-radio-button value="list">列表</el-radio-button>
        <el-radio-button value="bracket">对阵图</el-radio-button>
      </el-radio-group>
    </div>

    <!-- 对阵图（瑞士轮样式） -->
    <SwissBracket
      v-if="viewMode === 'bracket'"
      :matches="matches"
      :stage-name="currentStageName"
      class="bracket"
    />

    <!-- 对阵列表 -->
    <el-card v-else v-loading="loading">
      <!-- 全部比赛：按组别分组展示，组别一目了然 -->
      <template v-if="currentStage === 'all' && groupedMatches.length">
        <div v-for="g in groupedMatches" :key="g.key" class="group-block">
          <h4 class="group-title">
            <span class="group-name">{{ g.name }}</span>
            <span class="group-count">{{ g.matches.length }} 场</span>
          </h4>
          <el-table :data="g.matches" stripe empty-text="该组暂无对阵">
            <el-table-column label="组别" width="90">
              <template #default="{ row }">
                <el-tag size="small" effect="plain">{{ row.group_name ?? '跨组' }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="对阵" min-width="300">
              <template #default="{ row }">
                <div class="matchup">
                  <!-- 绿色突出按比分判定（比分高者为胜），避免历史数据 winner_id 与比分不一致时标错 -->
                  <span class="team" :class="{ win: row.status === 'completed' && row.team_a_score > row.team_b_score }">
                    {{ row.team_a_name }}
                  </span>
                  <span class="score">{{ row.team_a_score }} : {{ row.team_b_score }}</span>
                  <span class="team" :class="{ win: row.status === 'completed' && row.team_b_score > row.team_a_score }">
                    {{ row.team_b_name }}
                  </span>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="阶段" min-width="140">
              <template #default="{ row }">{{ row.stage_name ?? '-' }}</template>
            </el-table-column>
            <el-table-column label="赛制 / 地图" width="140">
              <template #default="{ row }">
                BO{{ row.best_of }}{{ row.map ? ` · ${row.map}` : '' }}
              </template>
            </el-table-column>
            <el-table-column label="时间" min-width="110">
              <template #default="{ row }">{{ row.scheduled_at ? row.scheduled_at.slice(0, 10) : '-' }}</template>
            </el-table-column>
            <el-table-column label="状态" width="90">
              <template #default="{ row }">
                <el-tag :type="matchStatusType(row.status)">
                  {{ MATCH_STATUS_LABEL[row.status as Match['status']] }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="直播 / 录像" min-width="180">
              <template #default="{ row }">
                <div v-if="mediaOf(row).length > 0" class="media-links">
                  <a
                    v-for="m in mediaOf(row)"
                    :key="m.id"
                    :href="m.url"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="media-link"
                    :title="m.label"
                  >
                    <el-tag size="small" :type="m.kind === 'live' ? 'danger' : m.kind === 'vod' ? 'primary' : 'info'" effect="plain">
                      {{ MEDIA_KIND_LABEL[m.kind] }}
                    </el-tag>
                    <el-icon v-if="m.kind === 'live'"><VideoCamera /></el-icon>
                    <el-icon v-else><Link /></el-icon>
                    <span class="media-label">{{ m.label || '查看' }}</span>
                  </a>
                </div>
                <span v-else class="no-media">暂无</span>
              </template>
            </el-table-column>
            <el-table-column label="解说" min-width="150">
              <template #default="{ row }">
                <div v-if="castersOf(row).length > 0" class="caster-tags">
                  <el-tag
                    v-for="c in castersOf(row)"
                    :key="c.id"
                    size="small"
                    type="warning"
                    effect="plain"
                    class="caster-tag"
                  >
                    <el-icon class="caster-icon"><Microphone /></el-icon>{{ c.caster_name }}
                  </el-tag>
                </div>
                <span v-else class="no-media">暂无</span>
              </template>
            </el-table-column>
            <el-table-column v-if="auth.isAdmin || auth.isCaster" label="操作" width="170" fixed="right">
              <template #default="{ row }">
                <div class="op-btns">
                  <el-button size="small" @click="openCasterDialog(row)">解说</el-button>
                  <el-button v-if="auth.isAdmin" size="small" @click="openMediaDialog(row)">登记</el-button>
                </div>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </template>

      <!-- 单阶段视图 -->
      <el-table v-else :data="matches" stripe empty-text="暂无对阵">
        <el-table-column prop="group_name" label="组别" width="90">
          <template #default="{ row }">
            <el-tag size="small" effect="plain">{{ row.group_name ?? '跨组' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="对阵" min-width="300">
          <template #default="{ row }">
            <div class="matchup">
              <!-- 绿色突出按比分判定（比分高者为胜），避免历史数据 winner_id 与比分不一致时标错 -->
              <span class="team" :class="{ win: row.status === 'completed' && row.team_a_score > row.team_b_score }">
                {{ row.team_a_name }}
              </span>
              <span class="score">{{ row.team_a_score }} : {{ row.team_b_score }}</span>
              <span class="team" :class="{ win: row.status === 'completed' && row.team_b_score > row.team_a_score }">
                {{ row.team_b_name }}
              </span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="赛制 / 地图" width="140">
          <template #default="{ row }">
            BO{{ row.best_of }}{{ row.map ? ` · ${row.map}` : '' }}
          </template>
        </el-table-column>
        <el-table-column label="时间" min-width="110">
          <template #default="{ row }">{{ row.scheduled_at ? row.scheduled_at.slice(0, 10) : '-' }}</template>
        </el-table-column>
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-tag :type="matchStatusType(row.status)">
              {{ MATCH_STATUS_LABEL[row.status as Match['status']] }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="直播 / 录像" min-width="180">
          <template #default="{ row }">
            <div v-if="mediaOf(row).length > 0" class="media-links">
              <a
                v-for="m in mediaOf(row)"
                :key="m.id"
                :href="m.url"
                target="_blank"
                rel="noopener noreferrer"
                class="media-link"
                :title="m.label"
              >
                <el-tag size="small" :type="m.kind === 'live' ? 'danger' : m.kind === 'vod' ? 'primary' : 'info'" effect="plain">
                  {{ MEDIA_KIND_LABEL[m.kind] }}
                </el-tag>
                <el-icon v-if="m.kind === 'live'"><VideoCamera /></el-icon>
                <el-icon v-else><Link /></el-icon>
                <span class="media-label">{{ m.label || '查看' }}</span>
              </a>
            </div>
            <span v-else class="no-media">暂无</span>
          </template>
        </el-table-column>
        <el-table-column label="解说" min-width="150">
          <template #default="{ row }">
            <div v-if="castersOf(row).length > 0" class="caster-tags">
              <el-tag
                v-for="c in castersOf(row)"
                :key="c.id"
                size="small"
                type="warning"
                effect="plain"
                class="caster-tag"
              >
                <el-icon class="caster-icon"><Microphone /></el-icon>{{ c.caster_name }}
              </el-tag>
            </div>
            <span v-else class="no-media">暂无</span>
          </template>
        </el-table-column>
        <el-table-column v-if="auth.isAdmin || auth.isCaster" label="操作" width="170" fixed="right">
          <template #default="{ row }">
            <div class="op-btns">
              <el-button size="small" @click="openCasterDialog(row)">解说</el-button>
              <el-button v-if="auth.isAdmin" size="small" @click="openMediaDialog(row)">登记</el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 登记比赛媒体链接（管理员） -->
    <el-dialog v-model="dialogVisible" title="登记直播 / 录像链接" width="520px">
      <template v-if="dialogMatch">
        <div class="dialog-match">
          {{ dialogMatch.team_a_name }} {{ dialogMatch.team_a_score }} : {{ dialogMatch.team_b_score }} {{ dialogMatch.team_b_name }}
        </div>

        <div class="media-form">
          <el-select v-model="mediaForm.kind" style="width: 90px">
            <el-option label="直播" value="live" />
            <el-option label="录像" value="vod" />
            <el-option label="其他" value="other" />
          </el-select>
          <el-input v-model="mediaForm.label" placeholder="备注，如 官方直播间 / B站第一视角" maxlength="50" />
          <el-input v-model="mediaForm.url" placeholder="https://..." clearable />
          <el-button type="primary" @click="submitMedia">添加</el-button>
        </div>

        <el-empty v-if="mediaList.length === 0" description="尚未登记直播 / 录像链接" :image-size="60" />
        <ul v-else class="media-list">
          <li v-for="m in mediaList" :key="m.id">
            <el-tag size="small" :type="m.kind === 'live' ? 'danger' : m.kind === 'vod' ? 'primary' : 'info'" effect="plain">
              {{ MEDIA_KIND_LABEL[m.kind] }}
            </el-tag>
            <span class="media-label">{{ m.label || '无备注' }}</span>
            <a :href="m.url" target="_blank" rel="noopener noreferrer" class="media-url">{{ m.url }}</a>
            <el-button size="small" type="danger" text @click="removeMedia(m)">删除</el-button>
          </li>
        </ul>
      </template>
    </el-dialog>

    <!-- 管理解说（管理员 / 解说） -->
    <el-dialog v-model="casterDialogVisible" title="管理解说" width="460px">
      <template v-if="casterDialogMatch">
        <div class="dialog-match">
          {{ casterDialogMatch.team_a_name }} {{ casterDialogMatch.team_a_score }} : {{ casterDialogMatch.team_b_score }} {{ casterDialogMatch.team_b_name }}
        </div>

        <div class="media-form">
          <el-input v-model="casterInput" placeholder="解说人员姓名 / 平台昵称" maxlength="30" clearable @keyup.enter="addCaster" />
          <el-button type="primary" @click="addCaster">添加</el-button>
        </div>

        <el-empty v-if="casterList.length === 0" description="尚未添加解说" :image-size="60" />
        <ul v-else class="media-list">
          <li v-for="c in casterList" :key="c.id">
            <el-tag size="small" type="warning" effect="plain" class="caster-tag">
              <el-icon class="caster-icon"><Microphone /></el-icon>{{ c.caster_name }}
            </el-tag>
            <el-button size="small" type="danger" text @click="removeCaster(c)">移除</el-button>
          </li>
        </ul>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
/* 赛程页显示框整体加宽：双类选择器覆盖全局 .page-container 的 1120px 上限 */
.page-container.page-container {
  max-width: 1440px;
}

.title {
  margin: 0 0 16px;
}

.event-bar {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
}

.event-select {
  width: 240px;
}

.group-filter {
  margin-bottom: 16px;
}

.view-switch {
  margin-bottom: 16px;
}

.bracket {
  margin-bottom: 8px;
}

.group-block {
  margin-bottom: 20px;
}

.group-block:last-child {
  margin-bottom: 0;
}

.group-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 10px;
  font-size: 15px;
}

.group-name {
  font-weight: 800;
  color: var(--cs2-accent);
}

.group-count {
  font-size: 12px;
  font-weight: 400;
  color: var(--cs2-text-muted);
}

.matchup {
  display: flex;
  align-items: center;
  gap: 10px;
}

.team {
  min-width: 90px;
  color: var(--cs2-text-regular, #c6ccd8);
}

.team.win {
  color: #67c23a;
  font-weight: 700;
}

.score {
  font-weight: 700;
  color: var(--cs2-accent);
  white-space: nowrap;
}

.op-btns {
  display: flex;
  align-items: center;
  white-space: nowrap;
}

.media-links {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.media-link {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--cs2-accent);
  text-decoration: none;
  font-size: 12px;
}

.media-link:hover {
  text-decoration: underline;
}

.no-media {
  color: var(--cs2-text-muted);
  font-size: 12px;
}

.caster-tags {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.caster-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.caster-icon {
  font-size: 12px;
}

.dialog-match {
  font-weight: 700;
  color: var(--cs2-accent);
  margin-bottom: 12px;
}

.media-form {
  display: flex;
  gap: 8px;
  margin-bottom: 14px;
}

.media-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.media-list li {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
  border-bottom: 1px solid var(--cs2-border, rgba(255, 255, 255, 0.08));
}

.media-label {
  color: var(--cs2-text-regular, #c6ccd8);
  white-space: nowrap;
}

.media-url {
  flex: 1;
  color: var(--cs2-accent);
  font-size: 12px;
  text-decoration: none;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.media-url:hover {
  text-decoration: underline;
}
</style>
