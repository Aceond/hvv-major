// 赛事数据访问层（一届一届持续举办，管理员发布赛事，选手按赛事报名）
// 未配置 Supabase（演示模式）时返回 mock 数据。
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import { mockEvents } from '@/mock/data'
import type { EventItem, EventStatus } from './types'

/** 赛事列表（按届数倒序，最新一届在前） */
export async function listEvents(): Promise<EventItem[]> {
  if (!isSupabaseConfigured || !supabase) {
    return [...mockEvents].sort((a, b) => (b.edition ?? 0) - (a.edition ?? 0))
  }
  const { data } = await supabase
    .from('events')
    .select('*')
    .order('edition', { ascending: false })
  return (data as EventItem[]) ?? []
}

/** 报名中的赛事（个人注册时可选报名的赛事） */
export async function listSignupEvents(): Promise<EventItem[]> {
  const all = await listEvents()
  return all.filter((e) => e.status === 'signup')
}

/** 管理员发布赛事 */
export async function createEvent(input: Partial<EventItem>): Promise<EventItem | null> {
  if (!isSupabaseConfigured || !supabase) {
    const event: EventItem = {
      id: `event-${Date.now()}`,
      name: input.name ?? '未命名赛事',
      edition: input.edition ?? null,
      status: (input.status as EventStatus) ?? 'signup',
      signup_start: input.signup_start ?? null,
      signup_end: input.signup_end ?? null,
      start_at: input.start_at ?? null,
      end_at: input.end_at ?? null,
      description: input.description ?? null,
      created_at: new Date().toISOString(),
    }
    mockEvents.push(event)
    return event
  }
  const { data } = await supabase
    .from('events')
    .insert({
      name: input.name,
      edition: input.edition,
      status: input.status,
      signup_start: input.signup_start,
      signup_end: input.signup_end,
      start_at: input.start_at,
      end_at: input.end_at,
      description: input.description,
    })
    .select('*')
    .single()
  return (data as EventItem) ?? null
}

/** 更新赛事信息 */
export async function updateEvent(id: string, input: Partial<EventItem>): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    const e = mockEvents.find((x) => x.id === id)
    if (e) Object.assign(e, input)
    return
  }
  await supabase.from('events').update(input).eq('id', id)
}
