<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useAuthStore } from '@/stores/auth'
import { updateMyPlayerInfo } from '@/api/registration'

const auth = useAuthStore()
const saving = ref(false)

const form = reactive({
  nickname: '',
  pwUsername: '',
})

onMounted(() => {
  form.nickname = auth.profile?.nickname ?? ''
  form.pwUsername = auth.profile?.pw_username ?? ''
})

async function save() {
  if (!auth.isLoggedIn) {
    ElMessage.warning('请先登录（演示模式可在登录页选择"以选手身份进入"）')
    return
  }
  if (!form.nickname) {
    ElMessage.warning('请填写游戏昵称')
    return
  }
  saving.value = true
  try {
    await updateMyPlayerInfo(form.nickname, form.pwUsername)
    ElMessage.success('个人选手注册完成，现已被计入选手池')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="page-container">
    <h2 class="title">个人选手注册</h2>

    <el-steps :active="1" align-center class="steps">
      <el-step title="注册个人信息" />
      <el-step title="加入战队（队长选人）" />
    </el-steps>

    <el-card class="register-card">
      <el-alert
        type="info"
        :closable="false"
        title="先注册成个人选手"
        description="填写游戏昵称与完美 ID（完美对战平台的用户名）后进入选手池。队长创建战队报名时，将从这个池中选择队员；每人只能加入一支战队。"
        class="tip"
      />
      <el-form label-width="110px" class="form">
        <el-form-item label="账号邮箱">
          <el-input :model-value="auth.user?.email ?? '-'" disabled />
        </el-form-item>
        <el-form-item label="游戏昵称">
          <el-input v-model="form.nickname" placeholder="比赛时展示的昵称" />
        </el-form-item>
        <el-form-item label="完美 ID">
          <el-input v-model="form.pwUsername" placeholder="完美对战平台的用户名，如 yanlong" />
          <div class="form-tip">后台将按此用户名记录选手数据</div>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="saving" @click="save">保存注册信息</el-button>
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
  max-width: 560px;
}

.tip {
  margin-bottom: 16px;
}

.form-tip {
  font-size: 12px;
  color: var(--cs2-text-muted);
  line-height: 1.5;
}
</style>
