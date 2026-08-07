<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import { setPasswordWithResetLink } from '@/api/auth'

const router = useRouter()
const formRef = ref<FormInstance>()
const submitting = ref(false)
const ready = ref(false)

const form = reactive({ password: '', confirm: '' })

const rules: FormRules = {
  password: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { min: 8, message: '密码至少 8 位', trigger: 'blur' },
  ],
  confirm: [
    { required: true, message: '请再次输入新密码', trigger: 'blur' },
    {
      validator: (_rule, value, callback) => {
        if (value !== form.password) callback(new Error('两次输入的密码不一致'))
        else callback()
      },
      trigger: 'blur',
    },
  ],
}

onMounted(async () => {
  // 邮件链接会携带 recovery token，supabase-js 自动恢复会话；短暂等待其完成
  for (let i = 0; i < 10; i++) {
    const { data } = supabase ? await supabase.auth.getSession() : { data: { session: null } }
    if (data.session) break
    await new Promise((r) => setTimeout(r, 200))
  }
  ready.value = true
})

async function submit() {
  if (submitting.value) return
  if (!formRef.value) return
  await formRef.value.validate()
  if (!isSupabaseConfigured || !supabase) {
    ElMessage.warning('未配置 Supabase，无法重置密码')
    return
  }
  submitting.value = true
  try {
    const res = await setPasswordWithResetLink(form.password)
    if (res.demo) {
      ElMessage.warning('未配置 Supabase，无法重置密码')
      return
    }
    if (res.error) {
      ElMessage.error(res.error.message)
      return
    }
    form.password = ''
    form.confirm = ''
    ElMessage.success('密码已重置，请使用新密码登录')
    router.push({ name: 'login' })
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="page-container reset-page">
    <el-card class="reset-card">
      <template #header><b>重置密码</b></template>
      <el-alert
        v-if="!ready"
        type="info"
        :closable="false"
        title="正在校验重置链接…"
        class="tip"
      />
      <template v-else>
        <el-form ref="formRef" :model="form" :rules="rules" label-width="0" size="large">
          <el-form-item prop="password">
            <el-input v-model="form.password" type="password" placeholder="新密码（至少 8 位）" show-password @keyup.enter.prevent="submit" />
          </el-form-item>
          <el-form-item prop="confirm">
            <el-input v-model="form.confirm" type="password" placeholder="再次输入新密码" show-password @keyup.enter.prevent="submit" />
          </el-form-item>
          <el-button type="primary" size="large" style="width: 100%" :loading="submitting" @click="submit">
            设置新密码
          </el-button>
        </el-form>
        <div class="back-login">
          <el-link type="primary" @click="router.push({ name: 'login' })">返回登录</el-link>
        </div>
      </template>
    </el-card>
  </div>
</template>

<style scoped>
.reset-page {
  display: flex;
  justify-content: center;
  padding-top: 64px;
}

.reset-card {
  width: 380px;
}

.tip {
  margin-bottom: 12px;
}

.back-login {
  margin-top: 12px;
  text-align: center;
}
</style>
