<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, type UploadFile, type UploadUserFile } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import { useAuthStore } from '@/stores/auth'
import type { ApplicationStatus } from '@/api/types'
import { listMyPlayerApplication, submitPlayerApplication } from '@/api/registration'

const auth = useAuthStore()
const saving = ref(false)
const status = ref<ApplicationStatus | null>(null)

const form = reactive({
  pwUsername: '',
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

async function handleFiles(files: UploadFile[]) {
  fileList.value = files
  const urls: string[] = []
  for (const f of files) {
    if (f.raw) urls.push(await readAsDataUrl(f.raw))
  }
  screenshots.value = urls
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
  if (!form.pwUsername) {
    ElMessage.warning('请填写完美 ID')
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
    const app = await submitPlayerApplication(form.pwUsername, screenshots.value)
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
  form.pwUsername = auth.profile?.pw_username ?? ''
  const app = await listMyPlayerApplication()
  if (app) {
    status.value = app.status
    form.pwUsername = app.pw_username
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
        description="填写完美 ID（完美对战平台用户名）并上传最近 3-5 个赛季的截图，提交后由管理员审核。审核通过后进入选手池，队长创建战队时将从池中选择队员；每人只能加入一支战队。"
        class="tip"
      />

      <el-form label-width="110px" class="form">
        <el-form-item label="账号邮箱">
          <el-input :model-value="auth.user?.email ?? '-'" disabled />
        </el-form-item>
        <el-form-item label="完美 ID">
          <el-input
            v-model="form.pwUsername"
            placeholder="完美对战平台的用户名，如 yanlong"
            maxlength="24"
          />
          <div class="form-tip">后台将按此用户名记录选手数据（2-24 位字母、数字或下划线）</div>
        </el-form-item>
        <el-form-item label="赛季截图">
          <div class="upload-wrap">
            <el-upload
              v-model:file-list="fileList"
              :auto-upload="false"
              list-type="picture-card"
              accept="image/*"
              :limit="MAX_SHOTS"
              :on-change="onUploadChange"
              :on-remove="onUploadRemove"
            >
              <el-icon><Plus /></el-icon>
            </el-upload>
            <div class="form-tip">
              上传最近 3-5 个赛季的段位/战绩截图（必传 {{ MIN_SHOTS }} 张，最多 {{ MAX_SHOTS }} 张），供管理员审核
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
