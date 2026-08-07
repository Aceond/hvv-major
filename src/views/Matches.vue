<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { VideoCamera, Link } from '@element-plus/icons-vue'
import SwissBracket from '@/components/SwissBracket.vue'
import type { EventItem, Group, Match, MatchMedia, MediaKind, Stage } from '@/api/types'
import { MATCH_STATUS_LABEL, MEDIA_KIND_LABEL, STAGE_STATUS_LABEL } from '@/api/types'
import { listGroups, listMatches, listStages } from '@/api/match'
import { listEvents } from '@/api/event'
import { addMatchMedia, listAllMatchMedia, removeMatchMedia } from '@/api/media'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()

const events = ref<EventItem[]>([])
const currentEventId = ref<string>('')
const currentGroupId = ref<string>('')
const stages = ref<Stage[]>([])
const groups = ref<Group[]>([])
const currentStage = ref<string>('')
const matches = ref<Match[]>([])
const loading = ref(false)
const viewMode = ref<'list' | 'bracket'>('list')

// 媒体链接：按比赛分组（matchId -> MatchMedia[]）
const mediaMap = ref<Record<string, MatchMedia[]>>({})

// 登记媒体对话框
const dialogVisible = ref(false)
const dialogMatch = ref<Match | null>(null)
const mediaList = ref<MatchMedia[]>([])
const mediaForm = reactive<{ kind: MediaKind; label: string; url: string }>({
  kind: 'live',
  label: '',
  url: '',
})

const currentStageName = computed(
  () => stages.value.find((s) => s.id === currentStage.value)?.name ?? '',
)

function mediaOf(match: Match): MatchMedia[] {
  return mediaMap.value[match.id] ?? []
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
  currentStage.value = ''
  await loadMatches()
}

async function loadMatches() {
  loading.value = true
  try {
    stages.value = await listStages(currentEventId.value || undefined, currentGroupId.value || undefined)
    if (!stages.value.some((s) => s.id === currentStage.value)) {
      currentStage.value = stages.value[0]?.id ?? ''
    }
    matches.value = await listMatches(currentStage.value)
    await loadMedia()
  } finally {
    loading.value = false
  }
}

async function loadMedia() {
  const all = await listAllMatchMedia()
  mediaMap.value = all.reduce<Record<string, MatchMedia[]>>((acc, m) => {
    ;(acc[m.match_id] ??= []).push(m)
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
      <el-tab-pane
        v-for="s in stages"
        :key="s.id"
        :label="`${s.name}（${STAGE_STATUS_LABEL[s.status]}）`"
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
      <el-table :data="matches" stripe empty-text="该阶段暂无对阵">
        <el-table-column prop="group_name" label="组别" width="90">
          <template #default="{ row }">
            <el-tag size="small" effect="plain">{{ row.group_name ?? '跨组' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="对阵" min-width="240">
          <template #default="{ row }">
            <div class="matchup">
              <span class="team" :class="{ win: row.winner_id === row.team_a_id }">
                {{ row.team_a_name }}
              </span>
              <span class="score">{{ row.team_a_score }} : {{ row.team_b_score }}</span>
              <span class="team" :class="{ win: row.winner_id === row.team_b_id }">
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
        <el-table-column prop="scheduled_at" label="时间" min-width="140" />
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
        <el-table-column v-if="auth.isAdmin" label="操作" width="90" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="openMediaDialog(row)">登记</el-button>
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
  </div>
</template>

<style scoped>
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
