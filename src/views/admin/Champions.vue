<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import type { EventChampion, EventItem, Group, Team } from '@/api/types'
import { listEvents, listEventChampions, resolveEventChampions, saveEventChampion, updateEvent } from '@/api/event'
import { listGroups } from '@/api/match'
import { listTeams } from '@/api/admin'

const events = ref<EventItem[]>([])
const groups = ref<Group[]>([])
const teams = ref<Team[]>([])
const champions = ref<EventChampion[]>([])
const loading = ref(false)
const saving = ref(false)
const selectedEventId = ref<string>('')
const bannerUrl = ref('')
const bannerPreview = ref(false)

const selectedEvent = computed(() => events.value.find((e) => e.id === selectedEventId.value) ?? null)

/** 组别 → 冠军队伍 id */
const pickMap = computed(() => {
  const map = new Map<string, string | null>()
  for (const c of champions.value) map.set(c.group_id, c.team_id)
  return map
})

/** 按组别过滤可用战队（按该组别战队优先展示，未分组队伍也列出便于往届补录） */
function teamsOfGroup(groupId: string): Team[] {
  return teams.value.filter((t) => t.group_id === groupId || t.group_id === null)
}

/** 切换赛事：加载该赛事已录冠军 + banner */
async function loadChampions() {
  if (!selectedEventId.value) {
    champions.value = []
    bannerUrl.value = ''
    return
  }
  loading.value = true
  try {
    champions.value = await listEventChampions(selectedEventId.value)
    bannerUrl.value = selectedEvent.value?.banner_url ?? ''
  } finally {
    loading.value = false
  }
}

/** 保存某组别冠军（先存后刷，覆盖旧值） */
async function onPickGroup(groupId: string, teamId: string | null) {
  if (!selectedEventId.value) return
  saving.value = true
  try {
    await saveEventChampion(selectedEventId.value, groupId, teamId)
    champions.value = await listEventChampions(selectedEventId.value)
    ElMessage.success('已保存')
  } catch (e: any) {
    ElMessage.error(e?.message || '保存失败')
  } finally {
    saving.value = false
  }
}

/** 保存赛事 banner 图（压缩 data URL 存 events.banner_url） */
async function saveBanner() {
  if (!selectedEventId.value) return
  saving.value = true
  try {
    await updateEvent(selectedEventId.value, { banner_url: bannerUrl.value || null })
    ElMessage.success('Banner 已保存')
  } catch (e: any) {
    ElMessage.error(e?.message || '保存失败')
  } finally {
    saving.value = false
  }
}

/** 自动判定：从各组淘汰赛总决赛胜者生成冠军记录 */
async function autoResolve() {
  if (!selectedEventId.value) {
    ElMessage.warning('请先选择赛事')
    return
  }
  saving.value = true
  try {
    const n = await resolveEventChampions(selectedEventId.value)
    champions.value = await listEventChampions(selectedEventId.value)
    ElMessage.success(n > 0 ? `已自动判定 ${n} 个组别的冠军` : '暂无可判定的组别（需各组有已完成比赛）')
  } catch (e: any) {
    ElMessage.error(e?.message || '自动判定失败')
  } finally {
    saving.value = false
  }
}

/** 图片压缩（自适应）：banner 压缩后 < ~100KB */
async function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('读取失败'))
    reader.readAsDataURL(file)
  })
}

function scaleImage(file: File, maxSide: number, quality: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      try {
        const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight))
        const w = Math.max(1, Math.round(img.naturalWidth * scale))
        const h = Math.max(1, Math.round(img.naturalHeight * scale))
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('canvas 不可用')
        ctx.drawImage(img, 0, 0, w, h)
        URL.revokeObjectURL(url)
        resolve(canvas.toDataURL('image/jpeg', quality))
      } catch (e) {
        URL.revokeObjectURL(url)
        reject(e)
      }
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('图片解析失败'))
    }
    img.src = url
  })
}

async function compressImage(file: File): Promise<string> {
  let maxSide = 1280
  let quality = 0.68
  for (let i = 0; i < 6; i++) {
    const dataUrl = await scaleImage(file, maxSide, quality)
    if (dataUrl.length < 140_000 || maxSide <= 320) return dataUrl
    maxSide = Math.round(maxSide * 0.75)
    quality = Math.max(0.4, quality - 0.06)
  }
  return scaleImage(file, 320, 0.4)
}

async function onPickBanner(file: File | undefined) {
  if (!file) return
  try {
    bannerUrl.value = await compressImage(file)
  } catch {
    try {
      bannerUrl.value = await readAsDataUrl(file)
    } catch {
      ElMessage.error('图片读取失败')
    }
  }
}

watch(selectedEventId, loadChampions)

onMounted(async () => {
  const [evs, gs, ts] = await Promise.all([listEvents(), listGroups(), listTeams()])
  events.value = evs
  groups.value = gs
  teams.value = ts
  // 默认选最新一届
  if (evs.length) selectedEventId.value = evs[0].id
})
</script>

<template>
  <div>
    <div class="head">
      <h2>往届冠军</h2>
      <el-button :loading="saving" @click="autoResolve">自动判定（各组总决赛胜者）</el-button>
    </div>

    <el-alert
      type="info"
      :closable="false"
      class="tip"
      title="按组别录入冠军"
      description="选择一届赛事，为传奇组 / 大师组 / 挑战组分别指定冠军队伍（往届手动录入）。本届及以后赛事可先录完各组淘汰赛比分，再点「自动判定」从总决赛胜者自动生成。"
    />

    <el-select
      v-model="selectedEventId"
      filterable
      placeholder="选择赛事"
      class="event-select"
      @change="loadChampions"
    >
      <el-option
        v-for="e in events"
        :key="e.id"
        :label="`${e.name}${e.status === 'ended' ? '（已结束）' : ''}`"
        :value="e.id"
      />
    </el-select>

    <div v-loading="loading" class="champ-body">
      <template v-if="selectedEventId">
        <el-card v-for="g in groups" :key="g.id" class="group-card" shadow="never">
          <div class="group-head">
            <span class="group-name">{{ g.name }}</span>
            <el-select
              :model-value="pickMap.get(g.id) ?? null"
              filterable
              clearable
              placeholder="选择冠军队伍"
              class="team-select"
              :disabled="saving"
              @update:model-value="(v: string | null) => onPickGroup(g.id, v ?? null)"
            >
              <el-option
                v-for="t in teamsOfGroup(g.id)"
                :key="t.id"
                :label="t.name + (t.tag ? `（${t.tag}）` : '')"
                :value="t.id"
              />
            </el-select>
          </div>
          <div v-if="pickMap.get(g.id)" class="group-champ">
            <span class="crown">🏆</span>
            <span class="team-name">
              {{ teams.find((t) => t.id === pickMap.get(g.id))?.name ?? '未知队伍' }}
            </span>
          </div>
          <span v-else class="group-empty">尚未录入冠军</span>
        </el-card>

        <el-card class="group-card banner-card" shadow="never">
          <div class="group-head">
            <span class="group-name">赛事 Banner</span>
            <div class="img-row">
              <img
                v-if="bannerUrl"
                :src="bannerUrl"
                class="img-preview"
                alt="banner"
                @click="bannerPreview = true"
              />
              <label class="img-upload">
                <input type="file" accept="image/*" @change="(e: any) => onPickBanner(e.target.files?.[0])" />
                {{ bannerUrl ? '更换' : '上传' }}
              </label>
              <el-button v-if="bannerUrl" text type="danger" size="small" @click="bannerUrl = ''">移除</el-button>
              <el-button type="primary" size="small" :loading="saving" @click="saveBanner">保存 Banner</el-button>
            </div>
          </div>
          <span class="group-empty">横版宣传图（建议 1280×360），首页冠军轮播展示当前赛事使用。</span>
        </el-card>
      </template>
      <div v-else class="empty">请先选择赛事</div>
    </div>

    <el-image-viewer
      v-if="bannerPreview"
      :url-list="[bannerUrl]"
      @close="bannerPreview = false"
    />
  </div>
</template>

<style scoped>
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.head h2 {
  margin: 0;
}

.tip {
  margin-bottom: 16px;
}

.event-select {
  width: 320px;
  margin-bottom: 16px;
}

.champ-body {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
  gap: 14px;
}

.group-card {
  background: var(--cs2-panel);
  border: 1px solid var(--cs2-border);
}

.group-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.group-name {
  font-size: 16px;
  font-weight: 700;
  color: var(--cs2-accent);
  letter-spacing: 1px;
}

.team-select {
  width: 220px;
}

.group-champ {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
}

.crown {
  font-size: 18px;
}

.team-name {
  font-weight: 700;
  color: var(--cs2-text);
}

.group-empty {
  font-size: 13px;
  color: var(--cs2-text-muted);
}

.empty {
  padding: 40px 0;
  text-align: center;
  color: var(--cs2-text-muted);
}

.banner-card {
  grid-column: 1 / -1;
}

.img-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.img-preview {
  width: 180px;
  height: auto;
  max-height: 72px;
  object-fit: cover;
  border: 1px solid var(--cs2-border);
  cursor: zoom-in;
  border-radius: 4px;
}

.img-upload {
  display: inline-flex;
  align-items: center;
  padding: 5px 12px;
  border: 1px solid var(--cs2-border-strong);
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  color: var(--cs2-text);
  transition: border-color 0.2s, color 0.2s;
}

.img-upload:hover {
  border-color: var(--cs2-accent);
  color: var(--cs2-accent);
}

.img-upload input {
  display: none;
}
</style>
