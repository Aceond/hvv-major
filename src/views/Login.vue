<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const auth = useAuthStore()

const mode = ref<'login' | 'register'>('login')
const formRef = ref<FormInstance>()
const submitting = ref(false)

const form = reactive({
  email: '',
  password: '',
  username: '',
})

const rules: FormRules = {
  email: [
    { required: true, message: '请输入邮箱', trigger: 'blur' },
    { type: 'email', message: '邮箱格式不正确', trigger: 'blur' },
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 6, message: '密码至少 6 位', trigger: 'blur' },
  ],
}

async function submit() {
  if (!formRef.value) return
  await formRef.value.validate()
  if (!isSupabaseConfigured || !supabase) {
    ElMessage.warning('未配置 Supabase，请使用下方演示身份进入')
    return
  }
  submitting.value = true
  try {
    if (mode.value === 'login') {
      const { error } = await supabase.auth.signInWithPassword({
        email: form.email,
        password: form.password,
      })
      if (error) throw error
      ElMessage.success('登录成功')
    } else {
      const { error } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: { data: { username: form.username } },
      })
      if (error) throw error
      ElMessage.success('注册成功，请查收验证邮件')
    }
    await auth.refresh()
    router.push({ name: 'home' })
  } catch (e: any) {
    ElMessage.error(e.message || '操作失败')
  } finally {
    submitting.value = false
  }
}

/** 演示模式：以指定角色直接进入，便于预览页面效果 */
async function enterDemo(role: 'admin' | 'player') {
  await auth.demoLogin(role)
  ElMessage.success(`已进入演示模式（${role === 'admin' ? '管理员' : '选手'}）`)
  router.push(role === 'admin' ? { name: 'admin-dashboard' } : { name: 'home' })
}
</script>

<template>
  <div class="page-container login-page">
    <el-card class="login-card">
      <template #header>
        <el-radio-group v-model="mode" size="large">
          <el-radio-button value="login">登录</el-radio-button>
          <el-radio-button value="register">注册</el-radio-button>
        </el-radio-group>
      </template>

      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        label-width="0"
        size="large"
        @submit.prevent="submit"
      >
        <el-form-item v-if="mode === 'register'" prop="username">
          <el-input v-model="form.username" placeholder="昵称 / 队伍联系人" />
        </el-form-item>
        <el-form-item prop="email">
          <el-input v-model="form.email" placeholder="邮箱" />
        </el-form-item>
        <el-form-item prop="password">
          <el-input v-model="form.password" type="password" placeholder="密码" show-password />
        </el-form-item>
        <el-button
          type="primary"
          size="large"
          style="width: 100%"
          :loading="submitting"
          @click="submit"
        >
          {{ mode === 'login' ? '登 录' : '注 册' }}
        </el-button>
      </el-form>

      <el-divider v-if="!isSupabaseConfigured" />

      <template v-if="!isSupabaseConfigured">
        <el-alert
          type="info"
          :closable="false"
          title="演示模式"
          description="未配置 Supabase，可直接以演示身份进入查看页面效果。"
        />
        <div class="demo-actions">
          <el-button type="primary" plain @click="enterDemo('admin')">以管理员身份进入</el-button>
          <el-button type="success" plain @click="enterDemo('player')">以选手身份进入</el-button>
        </div>
      </template>
    </el-card>
  </div>
</template>

<style scoped>
.login-page {
  display: flex;
  justify-content: center;
  padding-top: 64px;
}

.login-card {
  width: 380px;
}

.demo-actions {
  margin-top: 12px;
  display: flex;
  gap: 12px;
}

.demo-actions .el-button {
  flex: 1;
}
</style>
