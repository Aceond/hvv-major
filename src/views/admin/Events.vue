<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import type { EventItem, EventStatus } from '@/api/types'
import { EVENT_STATUS_LABEL } from '@/api/types'
import { createEvent, listEvents, updateEvent } from '@/api/event'

const rows = ref<EventItem[]>([])
const loading = ref(false)

const dialogVisible = ref(false)
const saving = ref(false)
const editingId = ref<string | null>(null)

const form = reactive({
  name: '',
  edition: null as number | null,
  status: 'signup' as EventStatus,
  signup_start: '',
  signup_end: '',
  start_at: '',
  end_at: '',
  description: '',
})

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

onMounted(load)
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
      </el-form>
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
</style>
