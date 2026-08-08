<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, type UploadFile, type UploadUserFile } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import { useAuthStore } from '@/stores/auth'
import type { ApplicationStatus, EmploymentStatus, EventItem } from '@/api/types'
import { CS2_RANKS } from '@/api/types'
import { listSignupEvents } from '@/api/event'
import { listMyPlayerApplication, submitPlayerApplication } from '@/api/registration'

const auth = useAuthStore()
const saving = ref(false)
const status = ref<ApplicationStatus | null>(null)
const events = ref<EventItem[]>([])
const eventsLoaded = ref(false)

const form = reactive({
  eventId: '',
  pwUsername: '',
  displayName: '',
  highestRank: '',
  employmentStatus: 'employed' as EmploymentStatus,
  location: '',
  employeeNo: '',
})

const fileList = ref<UploadUserFile[]>([])
const screenshots = ref<string[]>([])

const MIN_SHOTS = 3
const MAX_SHOTS = 5

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.readAsDataURL(file)
  })
}

/**
 * 客户端压缩图片：限制最长边为 maxSide、转 JPEG，显著减小上传体积，
 * 避免大截图上传超时/连接被重置导致 failed to fetch。
 */
function compressImage(file: File, maxSide = 1920, quality = 0.85): Promise<string> {
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

/** 版本号：防止一次多选多张时多次异步读取交错覆盖结果 */
let fileReadSeq = 0

async function handleFiles(files: UploadFile[]) {
  const seq = ++fileReadSeq
  fileList.value = files
  const urls: string[] = []
  for (const f of files) {
    if (!f.raw) continue
    try {
      urls.push(await compressImage(f.raw))
    } catch {
      urls.push(await readAsDataUrl(f.raw)) // 压缩失败则用原图
    }
  }
  // 只保留最后一次读取结果，避免较早的异步读取晚返回时覆盖新选择
  if (seq === fileReadSeq) screenshots.value = urls
}

function onUploadChange(_file: UploadFile, files: UploadFile[]) {
  handleFiles(files)
}

function onUploadRemove(_file: UploadFile, files: UploadFile[]) {
  handleFiles(files)
}

async function submit() {
  if (!auth.isLoggedIn) {
    ElMessage.warning('请先登录（演示模式可在登录页选择"以选手身份进入"）')
    return
  }
  if (!form.eventId) {
    ElMessage.warning('请选择报名的赛事')
    return
  }
  if (!form.displayName.trim()) {
    ElMessage.warning('请填写选手姓名')
    return
  }
  if (!form.pwUsername) {
    ElMessage.warning('请填写完美 ID')
    return
  }
  if (form.employmentStatus === 'employed' && !form.location.trim()) {
    ElMessage.warning('在职状态请填写驻地')
    return
  }
  if (form.employmentStatus === 'employed' && !form.employeeNo.trim()) {
    ElMessage.warning('在职状态请填写工号')
    return
  }
  if (screenshots.value.length < MIN_SHOTS) {
    ElMessage.warning(`请至少上传 ${MIN_SHOTS} 张赛季截图（当前 ${screenshots.value.length} 张）`)
    return
  }
  if (screenshots.value.length > MAX_SHOTS) {
    ElMessage.warning(`最多上传 ${MAX_SHOTS} 张赛季截图`)
    return
  }
  saving.value = true
  try {
    const app = await submitPlayerApplication(
      form.pwUsername,
      form.displayName,
      form.eventId,
      screenshots.value,
      {
        status: form.employmentStatus,
        location: form.employmentStatus === 'employed' ? form.location : null,
        employeeNo: form.employmentStatus === 'employed' ? form.employeeNo : null,
      },
      form.highestRank,
    )
    if (!app) {
      ElMessage.error('提交失败，请稍后重试')
      return
    }
    status.value = 'pending'
    ElMessage.success('注册申请已提交，等待管理员审核')
  } catch (e: any) {
    ElMessage.error(e.message || '提交失败')
  } finally {
    saving.value = false
  }
}

onMounted(async () => {
  events.value = await listSignupEvents()
  eventsLoaded.value = true
  form.eventId = events.value[0]?.id ?? ''
  form.pwUsername = auth.profile?.pw_username ?? ''
  form.displayName = auth.profile?.nickname ?? ''
  const app = await listMyPlayerApplication()
  if (app) {
    status.value = app.status
    form.eventId = app.event_id ?? form.eventId
    form.pwUsername = app.pw_username
    form.displayName = app.display_name ?? ''
    form.highestRank = app.highest_rank ?? ''
    form.employmentStatus = app.employment_status ?? 'employed'
    form.location = app.location ?? ''
    form.employeeNo = app.employee_no ?? ''
  }
})
</script>

<template>
  <div class="page-container">
    <h2 class="title">个人选手注册</h2>

    <el-steps :active="status === 'approved' ? 2 : 1" align-center class="steps">
      <el-step title="提交注册申请" />
      <el-step title="管理员审核" />
      <el-step title="加入战队（队长选人）" />
    </el-steps>

    <el-card class="register-card">
      <el-alert
        v-if="status === 'pending'"
        type="warning"
        :closable="false"
        title="申请审核中"
        description="你的注册申请已提交，请等待管理员审核。审核通过后即可被队长选入战队。"
        class="tip"
      />
      <el-alert
        v-else-if="status === 'approved'"
        type="success"
        :closable="false"
        title="注册已通过"
        description="你的个人选手注册已通过审核，可前往「战队报名」由队长选入战队。"
        class="tip"
      />
      <el-alert
        v-else-if="status === 'rejected'"
        type="error"
        :closable="false"
        title="申请未通过"
        description="你的注册申请未通过审核，请核对完美 ID 与赛季截图后重新提交。"
        class="tip"
      />

      <el-alert
        type="info"
        :closable="false"
        title="注册流程"
        description="选择要报名的赛事，填写选手姓名、完美 ID（完美对战平台用户名）与在职状态（在职需填驻地和工号），并上传最近 3-5 个赛季的截图，提交后由管理员审核。审核通过后进入该赛事选手池（以选手姓名展示），队长创建战队时将从池中选择队员；每人只能加入一支战队。"
        class="tip"
      />

      <el-alert
        v-if="eventsLoaded && events.length === 0"
        type="warning"
        :closable="false"
        title="暂无可报名赛事"
        description="当前没有处于「报名中」状态的赛事，请联系管理员发布赛事后再来报名。"
        class="tip"
      />

      <el-form label-width="110px" class="form">
        <el-form-item label="账号邮箱">
          <el-input :model-value="auth.user?.email ?? '-'" disabled />
        </el-form-item>
        <el-form-item label="报名赛事">
          <el-select
            v-model="form.eventId"
            placeholder="选择本次报名的赛事"
            style="width: 100%"
            :disabled="events.length === 0"
          >
            <el-option
              v-for="e in events"
              :key="e.id"
              :label="`${e.name}${e.edition ? `（第 ${e.edition} 届）` : ''}`"
              :value="e.id"
            />
          </el-select>
          <div class="form-tip">赛事一届一届举办，请选择本次要参加的赛事</div>
        </el-form-item>
        <el-form-item label="选手姓名">
          <el-input
            v-model="form.displayName"
            placeholder="真实姓名，如 张伟"
            maxlength="20"
          />
          <div class="form-tip">审核通过后将以该姓名展示在选手池中，供队长选人</div>
        </el-form-item>
        <el-form-item label="在职状态">
          <el-radio-group v-model="form.employmentStatus">
            <el-radio-button value="employed">在职</el-radio-button>
            <el-radio-button value="unemployed">离职</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="form.employmentStatus === 'employed'" label="驻地">
          <el-input v-model="form.location" placeholder="当前工作驻地，如 上海" maxlength="50" />
        </el-form-item>
        <el-form-item v-if="form.employmentStatus === 'employed'" label="工号">
          <el-input v-model="form.employeeNo" placeholder="员工工号，如 HVV001234" maxlength="30" />
          <div class="form-tip">在职选手需提供驻地与工号，供后台核验</div>
        </el-form-item>
        <el-form-item label="完美 ID">
          <el-input
            v-model="form.pwUsername"
            placeholder="完美对战平台的用户名，如 yanlong"
            maxlength="24"
          />
          <div class="form-tip">后台将按此用户名记录选手数据（2-24 位字母、数字或下划线）</div>
        </el-form-item>
        <el-form-item label="最高段位">
          <el-select
            v-model="form.highestRank"
            clearable
            placeholder="选择您最近 3 个赛季的最高段位（可选）"
            style="width: 100%"
          >
            <el-option v-for="r in CS2_RANKS" :key="r" :label="r" :value="r" />
          </el-select>
          <div class="form-tip">自选的段位仅供管理员审核时参考，最终以管理员核验战绩截图后确认的为准</div>
        </el-form-item>
        <el-form-item label="赛季截图">
          <div class="upload-wrap">
            <el-upload
              v-model:file-list="fileList"
              :auto-upload="false"
              list-type="picture-card"
              multiple
              accept="image/*"
              :limit="MAX_SHOTS"
              :on-change="onUploadChange"
              :on-remove="onUploadRemove"
            >
              <el-icon><Plus /></el-icon>
            </el-upload>
            <div class="form-tip">
              上传最近 3-5 个赛季的段位/战绩截图（必传 {{ MIN_SHOTS }} 张，最多 {{ MAX_SHOTS }} 张），可一次框选多张，供管理员审核
            </div>
          </div>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="saving" :disabled="status === 'pending'" @click="submit">
            {{ status === 'approved' ? '重新提交申请' : '提交注册申请' }}
          </el-button>
          <el-button @click="$router.push({ name: 'register' })">去创建战队</el-button>
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>

<style scoped>
.title {
  margin: 0 0 16px;
}

.steps {
  margin-bottom: 24px;
}

.register-card {
  max-width: 620px;
}

.tip {
  margin-bottom: 16px;
}

.form-tip {
  font-size: 12px;
  color: var(--cs2-text-muted);
  line-height: 1.5;
}

.upload-wrap {
  width: 100%;
}
</style>
