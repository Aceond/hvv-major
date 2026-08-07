<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
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

/** 密码强度评估：长度、大小写、数字、特殊字符综合评分 */
const strength = computed(() => {
  const pw = form.password
  if (!pw) return { level: 'weak' as const, label: '' }
  const len = pw.length
  let score = 0
  if (len >= 8) score++
  if (len >= 12) score++
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++
  if (/\d/.test(pw)) score++
  if (/[^a-zA-Z0-9]/.test(pw)) score++
  if (score >= 4) return { level: 'strong' as const, label: '强' }
  if (score >= 2) return { level: 'medium' as const, label: '中' }
  return { level: 'weak' as const, label: '弱' }
})

async function submit() {
  if (submitting.value) return
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
      if (error) {
        // 统一提示，不向用户泄露账号是否存在；邮箱未验证单独提示
        if (/email.*confirm|confirm.*email/i.test(error.message)) {
          ElMessage.warning('该邮箱尚未完成验证，请先通过邮箱验证后登录')
        } else {
          ElMessage.error('用户不存在或密码错误')
        }
        return
      }
      form.password = '' // 成功后清空，避免密码残留在内存/DevTools 中
      ElMessage.success('登录成功')
    } else {
      if (form.password.length < 6) {
        ElMessage.warning('密码至少需要 6 位')
        return
      }
      if (strength.value.level === 'weak') {
        ElMessage.warning('密码强度较弱，建议至少 8 位并包含大小写字母与数字')
        return
      }
      const { data, error } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: { data: { username: form.username } },
      })
      if (error) throw error
      // 服务端关闭「Confirm email（邮箱确认）」后 signUp 会直接返回 session，即注册即登录
      if (data.session) {
        form.password = '' // 成功后清空，避免密码残留在内存/DevTools 中
        ElMessage.success('注册成功，已自动登录')
      } else {
        ElMessage.warning('注册已提交，但当前开启了邮箱验证，请查收邮件完成验证后登录。若验证邮件无法打开，请让管理员在 Supabase 后台关闭邮箱确认（Authentication → Sign In / Providers → Email → Confirm email）。')
        return
      }
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
      >
        <el-form-item v-if="mode === 'register'" prop="username">
          <el-input
            v-model="form.username"
            placeholder="昵称 / 队伍联系人"
            @keyup.enter.prevent="submit"
          />
        </el-form-item>
        <el-form-item prop="email">
          <el-input v-model="form.email" placeholder="邮箱" @keyup.enter.prevent="submit" />
        </el-form-item>
        <el-form-item prop="password">
          <el-input
            v-model="form.password"
            type="password"
            placeholder="密码"
            show-password
            :autocomplete="mode === 'login' ? 'current-password' : 'new-password'"
            @keyup.enter.prevent="submit"
          />
        </el-form-item>
        <el-form-item v-if="mode === 'register'" class="strength-field">
          <div v-if="form.password" class="strength">
            <div class="strength-bar">
              <span :class="['bar', strength.level]" />
            </div>
            <span :class="['strength-label', strength.level]">
              密码强度：{{ strength.label }}
              <template v-if="strength.level === 'weak'">（建议 8 位以上并包含大小写字母与数字）</template>
            </span>
          </div>
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

.strength-field {
  margin-bottom: 2px;
}

.strength {
  width: 100%;
}

.strength-bar {
  height: 6px;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.08);
  overflow: hidden;
  margin-bottom: 6px;
}

.strength-bar .bar {
  display: block;
  height: 100%;
  border-radius: 3px;
  transition: width 0.3s ease, background 0.3s ease;
}

.strength-bar .bar.weak {
  width: 33%;
  background: #f56c6c;
}

.strength-bar .bar.medium {
  width: 66%;
  background: #e6a23c;
}

.strength-bar .bar.strong {
  width: 100%;
  background: #67c23a;
}

.strength-label {
  font-size: 12px;
  color: var(--cs2-text-muted);
}

.strength-label.weak {
  color: #f56c6c;
}

.strength-label.medium {
  color: #e6a23c;
}

.strength-label.strong {
  color: #67c23a;
}
</style>
