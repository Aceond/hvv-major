import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { User } from '@supabase/supabase-js'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import type { ApplicationStatus } from '@/api/types'

export interface Profile {
  id: string
  username: string | null
  nickname: string | null
  pw_username: string | null
  role: 'admin' | 'player' | null
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const profile = ref<Profile | null>(null)
  const loading = ref(false)
  // 账号人工审核状态（pending/approved/rejected，读 profiles.account_status）
  const accountStatus = ref<ApplicationStatus | null>(null)

  const isLoggedIn = computed(() => user.value !== null)
  const isAdmin = computed(() => profile.value?.role === 'admin')

  // 账号是否被审核拦截（待审核 / 被拒的新账号；管理员与已通过账号不受限）
  const reviewBlocked = computed(
    () => isLoggedIn.value && !isAdmin.value && (accountStatus.value === 'pending' || accountStatus.value === 'rejected'),
  )

  /** 拉取当前用户账号的审核状态（profiles.account_status） */
  async function loadAccountStatus() {
    accountStatus.value = null
    if (!isSupabaseConfigured || !supabase) return
    const {
      data: { user: u },
    } = await supabase.auth.getUser()
    if (!u) return
    const { data } = await supabase
      .from('profiles')
      .select('account_status')
      .eq('id', u.id)
      .maybeSingle()
    accountStatus.value = (data?.account_status as ApplicationStatus | undefined) ?? null
  }

  /** 拉取当前登录用户及其资料（演示模式下跳过） */
  async function refresh() {
    if (!isSupabaseConfigured || !supabase) return
    loading.value = true
    try {
      const { data } = await supabase.auth.getUser()
      user.value = data.user ?? null
      if (data.user) {
        const { data: p } = await supabase
          .from('profiles')
          .select('id, username, nickname, pw_username, role')
          .eq('id', data.user.id)
          .maybeSingle()
        profile.value = (p as Profile | null) ?? null
        await loadAccountStatus()
      } else {
        profile.value = null
        accountStatus.value = null
      }
    } finally {
      loading.value = false
    }
  }

  /** 演示模式登录：未配置 Supabase 时以本地身份进入，便于预览页面 */
  async function demoLogin(role: 'admin' | 'player') {
    user.value = {
      id: `demo-${role}`,
      email: `demo-${role}@hvv-major.local`,
      user_metadata: {},
      app_metadata: {},
      aud: 'authenticated',
      created_at: new Date().toISOString(),
    } as User
    profile.value = {
      id: `demo-${role}`,
      username: role === 'admin' ? '演示管理员' : '演示选手',
      nickname: role === 'admin' ? 'KillerAce' : '炎龙',
      pw_username: role === 'admin' ? 'killerace' : 'yanlong',
      role,
    }
    // 演示选手视为已通过审核，演示管理员不受审核限制
    accountStatus.value = role === 'admin' ? null : 'approved'
  }

  async function signOut() {
    if (supabase) await supabase.auth.signOut()
    user.value = null
    profile.value = null
    accountStatus.value = null
  }

  return {
    user,
    profile,
    loading,
    accountStatus,
    isLoggedIn,
    isAdmin,
    reviewBlocked,
    refresh,
    loadAccountStatus,
    demoLogin,
    signOut,
  }
})
