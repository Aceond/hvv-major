<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { sendPasswordReset, siteUrl } from '@/api/auth'

const router = useRouter()
const auth = useAuthStore()

const mode = ref<'login' | 'register'>('login')
const formRef = ref<FormInstance>()
const submitting = ref(false)

// 忘记密码
const forgotDialog = ref(false)
const forgotEmail = ref('')
const forgotSubmitting = ref(false)

const form = reactive({
  email: '',
  password: '',
  username: '',
})

const rules: FormRules = {
  // 登录可填用户名或邮箱，注册必须是邮箱（邮箱格式在提交时校验）
  email: [
    { required: true, message: '请输入用户名或邮箱', trigger: 'blur' },
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
  if (!formRef.value) return
  await formRef.value.validate()
  if (!isSupabaseConfigured || !supabase) {
    ElMessage.warning('未配置 Supabase，请使用下方演示身份进入')
    return
  }
  const client = supabase // 闭包内 null 收窄
  submitting.value = true
  try {
    if (mode.value === 'login') {
      // 支持用户名或邮箱登录：非邮箱输入时先解析出注册邮箱
      let email = form.email.trim()
      if (!email.includes('@')) {
        const { data: resolved, error: resolveErr } = await client.rpc('resolve_login_email', {
          p_identifier: email,
        })
        if (resolveErr) throw resolveErr
        if (!resolved) {
          ElMessage.error('用户名不存在，请确认后重试')
          throw new Error('username-not-found')
        }
        email = resolved
      }
      const { error } = await client.auth.signInWithPassword({
        email,
        password: form.password,
      })
      if (error) {
        if (/email.*confirm|confirm.*email/i.test(error.message)) {
          ElMessage.warning('该邮箱尚未完成验证，请先通过邮箱验证后登录')
        } else {
          ElMessage.error('用户不存在或密码错误')
        }
        throw error
      }
      form.password = ''
      ElMessage.success('登录成功')
    } else {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
        ElMessage.warning('请输入正确的邮箱地址')
        return
      }
      if (form.password.length < 6) {
        ElMessage.warning('密码至少需要 6 位')
        return
      }
      if (strength.value.level === 'weak') {
        ElMessage.warning('密码强度较弱，建议至少 8 位并包含大小写字母与数字')
        return
      }
      const { data, error } = await client.auth.signUp({
        email: form.email.trim(),
        password: form.password,
        options: {
          data: { username: form.username },
          emailRedirectTo: siteUrl(),
        },
      })
      if (error) throw error
      if (data.session) {
        form.password = ''
        if (auth.requireAccountReview) {
          // 审核开启：新账号默认待审核，弹窗提示审核机制
          await ElMessageBox.alert(
            '您的账号正在审核中，管理员审核通过后即可使用全部功能，请耐心等待。',
            '注册成功',
            { type: 'info', confirmButtonText: '知道了' },
          )
        } else {
          // 审核关闭：注册即可使用全部功能
          ElMessage.success('注册成功！账号已自动通过审核，可直接使用全部功能。')
        }
      } else {
        form.password = ''
        ElMessage.success('注册成功！请查收邮箱中的验证邮件，点击邮件内链接完成验证后即可登录（如未收到请检查垃圾邮件）。')
        return
      }
    }
    await auth.refresh()
    router.push({ name: 'home' })
  } catch (e: any) {
    if (e?.message && /操作过于频繁/.test(e.message)) {
      ElMessage.error(e.message)
    } else if (e?.message) {
      // 其它错误已在分支内单独提示，这里只兜底
    }
  } finally {
    submitting.value = false
  }
}

/** 演示模式：以指定角色直接进入，便于预览页面效果 */
async function enterDemo(role: 'admin' | 'caster' | 'player' | 'captain') {
  await auth.demoLogin(role)
  const label =
    role === 'admin' ? '管理员' : role === 'captain' ? '队长' : role === 'caster' ? '解说' : '选手'
  ElMessage.success(`已进入演示模式（${label}）`)
  router.push(role === 'admin' ? { name: 'admin-dashboard' } : { name: 'home' })
}

/** 游客登录：无需注册，以临时游客身份浏览公开内容 */
async function enterGuest() {
  await auth.guestLogin()
  ElMessage.success('已以游客身份进入，可浏览公开内容')
  router.push({ name: 'home' })
}

async function sendReset() {
  if (!forgotEmail.value.trim()) {
    ElMessage.warning('请输入注册邮箱')
    return
  }
  forgotSubmitting.value = true
  try {
    const res = await sendPasswordReset(forgotEmail.value.trim())
    if (res.demo) {
      ElMessage.warning('未配置 Supabase，无法发送重置邮件')
      return
    }
    if (res.error) {
      ElMessage.error(res.error.message)
      return
    }
    forgotDialog.value = false
    forgotEmail.value = ''
    ElMessage.success('重置链接已发送，请查收邮件（若该邮箱已注册）')
  } catch (e: any) {
    if (e?.message && /操作过于频繁/.test(e.message)) {
      ElMessage.error(e.message)
    }
  } finally {
    forgotSubmitting.value = false
  }
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
          <el-input
            v-model="form.email"
            :placeholder="mode === 'register' ? '邮箱' : '用户名 / 邮箱'"
            @keyup.enter.prevent="submit"
          />
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
        <div v-if="mode === 'login' && isSupabaseConfigured" class="forgot-row">
          <el-link type="primary" :underline="false" @click="forgotDialog = true">忘记密码？</el-link>
        </div>
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
        <div class="guest-row">
          <el-link type="primary" :underline="false" @click="enterGuest">无需注册，以游客身份浏览</el-link>
        </div>
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
          <el-button type="warning" plain @click="enterDemo('caster')">以解说身份进入</el-button>
          <el-button type="danger" plain @click="enterDemo('captain')">以队长身份进入</el-button>
        </div>
      </template>
    </el-card>

    <!-- 忘记密码 -->
    <el-dialog v-model="forgotDialog" title="忘记密码" width="380px">
      <el-alert type="info" :closable="false" title="输入注册邮箱，我们将发送密码重置链接。" class="tip" />
      <el-input v-model="forgotEmail" placeholder="注册邮箱" size="large" @keyup.enter.prevent="sendReset" />
      <template #footer>
        <el-button @click="forgotDialog = false">取消</el-button>
        <el-button type="primary" :loading="forgotSubmitting" @click="sendReset">发送重置链接</el-button>
      </template>
    </el-dialog>
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
  flex-wrap: wrap;
}

.demo-actions .el-button {
  flex: 1 1 40%;
}

.strength-field {
  margin-bottom: 2px;
}

.forgot-row {
  display: flex;
  justify-content: flex-end;
  margin: -6px 0 12px;
}

.guest-row {
  margin-top: 14px;
  text-align: center;
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

/* ---------- 移动端适配 ---------- */
@media (max-width: 768px) {
  .login-page {
    padding-top: 24px;
  }

  .login-card {
    width: 100%;
    max-width: 420px;
  }
}

.strength-label.medium {
  color: #e6a23c;
}

.strength-label.strong {
  color: #67c23a;
}
</style>
