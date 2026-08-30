<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import type { EventItem, EventStatus, Team } from '@/api/types'
import { EVENT_STATUS_LABEL } from '@/api/types'
import { createEvent, listEvents, resolveEventChampion, updateEvent } from '@/api/event'
import { listTeams } from '@/api/admin'

const rows = ref<EventItem[]>([])
const loading = ref(false)

const dialogVisible = ref(false)
const saving = ref(false)
const editingId = ref<string | null>(null)

const teams = ref<Team[]>([])

const form = reactive({
  name: '',
  edition: null as number | null,
  status: 'signup' as EventStatus,
  signup_start: '',
  signup_end: '',
  start_at: '',
  end_at: '',
  description: '',
  champion_team_id: null as string | null,
  banner_url: '',
  champion_image: '',
})

const championPreview = ref(false)
const bannerPreview = ref(false)

function statusType(s: EventStatus) {
  return s === 'signup' ? 'success' : s === 'running' ? 'warning' : 'info'
}

async function load() {
  loading.value = true
  try {
    rows.value = await listEvents()
  } finally {
    loading.value = false
  }
}

function resetForm() {
  Object.assign(form, {
    name: '',
    edition: null,
    status: 'signup',
    signup_start: '',
    signup_end: '',
    start_at: '',
    end_at: '',
    description: '',
    champion_team_id: null,
    banner_url: '',
    champion_image: '',
  })
}

function openCreate() {
  editingId.value = null
  resetForm()
  dialogVisible.value = true
}

function openEdit(e: EventItem) {
  editingId.value = e.id
  Object.assign(form, {
    name: e.name,
    edition: e.edition,
    status: e.status,
    signup_start: e.signup_start ?? '',
    signup_end: e.signup_end ?? '',
    start_at: e.start_at ?? '',
    end_at: e.end_at ?? '',
    description: e.description ?? '',
    champion_team_id: e.champion_team_id ?? null,
    banner_url: e.banner_url ?? '',
    champion_image: e.champion_image ?? '',
  })
  dialogVisible.value = true
}

async function save() {
  if (!form.name) {
    ElMessage.warning('请填写赛事名称')
    return
  }
  saving.value = true
  try {
    const payload = {
      name: form.name,
      edition: form.edition,
      status: form.status,
      signup_start: form.signup_start || null,
      signup_end: form.signup_end || null,
      start_at: form.start_at || null,
      end_at: form.end_at || null,
      description: form.description || null,
      champion_team_id: form.champion_team_id || null,
      banner_url: form.banner_url || null,
      champion_image: form.champion_image || null,
    }
    if (editingId.value) {
      await updateEvent(editingId.value, payload)
      ElMessage.success('赛事已更新')
    } else {
      const created = await createEvent(payload)
      if (!created) {
        ElMessage.error('发布失败')
        return
      }
      ElMessage.success(`已发布赛事「${created.name}」`)
    }
    dialogVisible.value = false
    await load()
  } finally {
    saving.value = false
  }
}

/** 赛事结束自动判定冠军：从总决赛（或最大轮次）已完成比赛取胜者写入 */
async function autoResolveChampion() {
  if (!editingId.value) {
    ElMessage.warning('请先保存赛事再自动判定')
    return
  }
  saving.value = true
  try {
    const tid = await resolveEventChampion(editingId.value)
    if (tid) {
      form.champion_team_id = tid
      await save()
      ElMessage.success('已自动判定冠军')
    } else {
      ElMessage.warning('该赛事还没有已完成的比赛，无法自动判定。请先录完比分，或手动选择冠军队伍。')
    }
  } catch (e: any) {
    ElMessage.error(e?.message || '自动判定失败')
  } finally {
    saving.value = false
  }
}

/** 客户端压缩图片（自适应）：banner 压缩后 < ~100KB，避免大图被网络/网关拦截 */
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

/** banner / 冠军图选择：压缩为 data URL 存入表单 */
async function onPickImage(field: 'banner_url' | 'champion_image', file: File | undefined) {
  if (!file) return
  try {
    form[field] = await compressImage(file)
  } catch {
    try {
      form[field] = await readAsDataUrl(file)
    } catch {
      ElMessage.error('图片读取失败')
    }
  }
}

onMounted(async () => {
  await load()
  teams.value = await listTeams()
})
</script>

<template>
  <div>
    <div class="head">
      <h2>赛事管理</h2>
      <el-button type="primary" @click="openCreate">发布赛事</el-button>
    </div>

    <el-alert
      type="info"
      :closable="false"
      class="tip"
      title="系列赛事"
      description="HVV Major 一届一届持续举办（当前第十一届）。发布新赛事后，选手在「个人注册」中按赛事报名，报名中的赛事会展示在前台「赛事」入口。"
    />

    <el-table v-loading="loading" :data="rows" stripe empty-text="暂无赛事">
      <el-table-column label="赛事" min-width="180">
        <template #default="{ row }">
          <span class="ev-name">{{ row.name }}</span>
          <el-tag v-if="row.edition" size="small" effect="plain">第 {{ row.edition }} 届</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="110">
        <template #default="{ row }">
          <el-tag :type="statusType(row.status)" effect="plain">
            {{ EVENT_STATUS_LABEL[row.status as EventStatus] }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="冠军" min-width="150">
        <template #default="{ row }">
          <template v-if="row.champion_team_name">
            <span class="champ-name">🏆 {{ row.champion_team_name }}</span>
            <el-tag v-if="row.champion_team_tag" size="small" effect="plain">{{ row.champion_team_tag }}</el-tag>
          </template>
          <span v-else class="muted">-</span>
        </template>
      </el-table-column>
      <el-table-column label="报名时间" min-width="170">
        <template #default="{ row }">
          {{ row.signup_start ? row.signup_start.slice(0, 10) : '-' }}
          ~ {{ row.signup_end ? row.signup_end.slice(0, 10) : '-' }}
        </template>
      </el-table-column>
      <el-table-column label="比赛时间" min-width="170">
        <template #default="{ row }">
          {{ row.start_at ? row.start_at.slice(0, 10) : '-' }}
          {{ row.end_at ? `~ ${row.end_at.slice(0, 10)}` : '' }}
        </template>
      </el-table-column>
      <el-table-column prop="description" label="简介" min-width="220" show-overflow-tooltip />
      <el-table-column label="操作" width="90">
        <template #default="{ row }">
          <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 发布/编辑赛事对话框 -->
    <el-dialog
      v-model="dialogVisible"
      :title="editingId ? '编辑赛事' : '发布赛事'"
      width="560px"
    >
      <el-form :model="form" label-width="100px">
        <el-form-item label="赛事名称">
          <el-input v-model="form.name" placeholder="如 HVV MAJOR 12" />
        </el-form-item>
        <el-form-item label="届数">
          <el-input-number v-model="form.edition" :min="1" placeholder="如 12" style="width: 160px" />
          <span class="hint">第几届，用于排序与展示</span>
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="form.status" style="width: 160px">
            <el-option label="报名中" value="signup" />
            <el-option label="进行中" value="running" />
            <el-option label="已结束" value="ended" />
          </el-select>
          <span class="hint">「报名中」的赛事才会出现在个人注册的选择列表中</span>
        </el-form-item>
        <el-form-item label="报名时间">
          <div class="range">
            <el-date-picker
              v-model="form.signup_start"
              type="datetime"
              format="YYYY-MM-DD HH:mm"
              value-format="YYYY-MM-DD HH:mm"
              placeholder="报名开始"
            />
            <span>~</span>
            <el-date-picker
              v-model="form.signup_end"
              type="datetime"
              format="YYYY-MM-DD HH:mm"
              value-format="YYYY-MM-DD HH:mm"
              placeholder="报名截止"
            />
          </div>
        </el-form-item>
        <el-form-item label="比赛时间">
          <div class="range">
            <el-date-picker
              v-model="form.start_at"
              type="datetime"
              format="YYYY-MM-DD HH:mm"
              value-format="YYYY-MM-DD HH:mm"
              placeholder="开赛"
            />
            <span>~</span>
            <el-date-picker
              v-model="form.end_at"
              type="datetime"
              format="YYYY-MM-DD HH:mm"
              value-format="YYYY-MM-DD HH:mm"
              placeholder="结束"
            />
          </div>
        </el-form-item>
        <el-form-item label="赛事简介">
          <el-input v-model="form.description" type="textarea" :rows="3" placeholder="赛事说明" />
        </el-form-item>

        <!-- 冠军展播：往届手动录入；本届及以后赛事结束可自动判定 -->
        <el-divider content-position="left">冠军展播（首页轮播）</el-divider>
        <el-form-item label="冠军队伍">
          <div class="champ-row">
            <el-select
              v-model="form.champion_team_id"
              filterable
              clearable
              placeholder="选择冠军队伍"
              style="width: 260px"
            >
              <el-option
                v-for="t in teams"
                :key="t.id"
                :label="t.name + (t.tag ? `（${t.tag}）` : '')"
                :value="t.id"
              />
            </el-select>
            <el-button :loading="saving" @click="autoResolveChampion">自动判定（总决赛胜者）</el-button>
          </div>
          <span class="hint">「自动判定」取该赛事总决赛（或最大轮次）已完成比赛的胜者；往届无比赛数据的赛事手动选择即可。</span>
        </el-form-item>
        <el-form-item label="赛事 Banner">
          <div class="img-row">
            <img
              v-if="form.banner_url"
              :src="form.banner_url"
              class="img-preview"
              alt="banner"
              @click="bannerPreview = true"
            />
            <label class="img-upload">
              <input type="file" accept="image/*" @change="(e: any) => onPickImage('banner_url', e.target.files?.[0])" />
              {{ form.banner_url ? '更换' : '上传' }}
            </label>
            <el-button v-if="form.banner_url" text type="danger" size="small" @click="form.banner_url = ''">移除</el-button>
          </div>
          <span class="hint">横版宣传图（建议 1280×360 左右），首页冠军轮播展示当前赛事使用。</span>
        </el-form-item>
        <el-form-item label="冠军图">
          <div class="img-row">
            <img
              v-if="form.champion_image"
              :src="form.champion_image"
              class="img-preview"
              alt="champion"
              @click="championPreview = true"
            />
            <label class="img-upload">
              <input type="file" accept="image/*" @change="(e: any) => onPickImage('champion_image', e.target.files?.[0])" />
              {{ form.champion_image ? '更换' : '上传' }}
            </label>
            <el-button v-if="form.champion_image" text type="danger" size="small" @click="form.champion_image = ''">移除</el-button>
          </div>
          <span class="hint">冠军队伍展示图（可选，如队标 / 合影），冠军轮播卡片中使用。</span>
        </el-form-item>
      </el-form>
      <el-image-viewer
        v-if="bannerPreview"
        :url-list="[form.banner_url]"
        @close="bannerPreview = false"
      />
      <el-image-viewer
        v-if="championPreview"
        :url-list="[form.champion_image]"
        @close="championPreview = false"
      />
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>
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

.ev-name {
  font-weight: 700;
  color: var(--cs2-accent);
  margin-right: 8px;
}

.range {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.hint {
  display: block;
  font-size: 12px;
  color: var(--cs2-text-muted);
  line-height: 1.6;
  margin-left: 8px;
}

.champ-name {
  color: var(--cs2-accent);
  font-weight: 700;
  margin-right: 6px;
}

.muted {
  color: var(--cs2-text-muted);
}

.champ-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
}

.img-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
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
