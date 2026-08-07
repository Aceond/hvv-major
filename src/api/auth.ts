import { supabase, isSupabaseConfigured } from '@/lib/supabase'

export interface AuthResult {
  ok?: boolean
  demo?: boolean
  error?: { message: string }
}

/** 重置密码落地页地址（需在 Supabase 控制台 Redirect URLs 中添加白名单） */
export function resetPasswordUrl() {
  return `${window.location.origin}${import.meta.env.BASE_URL}reset-password`
}

/** 忘记密码：向邮箱发送重置链接（演示模式不可用，返回 demo 标志） */
export async function sendPasswordReset(email: string): Promise<AuthResult> {
  if (!isSupabaseConfigured || !supabase) return { demo: true }
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: resetPasswordUrl(),
  })
  return error ? { error } : { ok: true }
}

/** 修改密码：先验证当前密码，再更新为新密码（演示模式不可用） */
export async function updatePassword(oldPassword: string, newPassword: string): Promise<AuthResult> {
  if (!isSupabaseConfigured || !supabase) return { demo: true }
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user?.email) return { error: { message: '无法获取当前账号邮箱' } }
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: oldPassword,
  })
  if (signInError) return { error: { message: '当前密码不正确' } }
  const { error } = await supabase.auth.updateUser({ password: newPassword })
  return error ? { error } : { ok: true }
}

/** 通过邮件重置链接设置新密码（recovery 会话由 supabase-js 自动恢复） */
export async function setPasswordWithResetLink(newPassword: string): Promise<AuthResult> {
  if (!isSupabaseConfigured || !supabase) return { demo: true }
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) return { error: { message: '重置链接无效或已过期，请重新申请' } }
  const { error } = await supabase.auth.updateUser({ password: newPassword })
  return error ? { error } : { ok: true }
}
