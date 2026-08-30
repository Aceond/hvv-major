// 赛事数据访问层（一届一届持续举办，管理员发布赛事，选手按赛事报名）
// 冠军展播：往届赛事在后台「往届冠军」独立入口按组别（传奇/大师/挑战）手动录入；本届及以后可自动判定。
// 未配置 Supabase（演示模式）时返回 mock 数据。
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import { mockEvents } from '@/mock/data'
import type { EventChampion, EventItem, EventStatus } from './types'

/** 赛事列表（按届数倒序，最新一届在前） */
export async function listEvents(): Promise<EventItem[]> {
  if (!isSupabaseConfigured || !supabase) {
    return [...mockEvents].sort((a, b) => (b.edition ?? 0) - (a.edition ?? 0))
  }
  const { data, error } = await supabase.from('events').select('*').order('edition', { ascending: false })
  if (error) {
    // 兼容：列不存在时回退为最简查询（不阻断赛事管理/首页展示）
    const fallback = await supabase.from('events').select('*').order('edition', { ascending: false })
    return (fallback.data as EventItem[]) ?? []
  }
  return ((data ?? []) as any[]).map((e) => ({
    ...e,
    champion_team_id: e.champion_team_id ?? null,
    banner_url: e.banner_url ?? null,
    champion_image: e.champion_image ?? null,
  }))
}

/** 某赛事下按组别的冠军记录（往届冠军管理/首页轮播用） */
export async function listEventChampions(eventId: string): Promise<EventChampion[]> {
  if (!isSupabaseConfigured || !supabase) {
    return mockEvents
      .filter((e) => e.id === eventId)
      .flatMap((e) =>
        e.champion_team_id
          ? [
              {
                id: `${e.id}-champ`,
                event_id: e.id,
                group_id: 'g1',
                team_id: e.champion_team_id,
                group_name: '传奇组',
                team_name: e.champion_team_name ?? null,
                team_tag: e.champion_team_tag ?? null,
              },
            ]
          : [],
      )
  }
  const { data } = await supabase
    .from('event_champions')
    .select('*, group:groups(name), team:teams(name, tag)')
    .eq('event_id', eventId)
  return ((data ?? []) as any[]).map((c) => ({
    ...c,
    group_name: c.group?.name ?? null,
    team_name: c.team?.name ?? null,
    team_tag: c.team?.tag ?? null,
  }))
}

/** 保存某赛事某组别的冠军队伍（upsert；传 null 则删除该组别冠军记录） */
export async function saveEventChampion(
  eventId: string,
  groupId: string,
  teamId: string | null,
): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    return
  }
  if (!teamId) {
    await supabase
      .from('event_champions')
      .delete()
      .eq('event_id', eventId)
      .eq('group_id', groupId)
    return
  }
  await supabase
    .from('event_champions')
    .upsert({ event_id: eventId, group_id: groupId, team_id: teamId }, { onConflict: 'event_id,group_id' })
}

/** 自动判定某赛事各组的冠军（从各组淘汰赛总决赛胜者生成），返回写入的组别数 */
export async function resolveEventChampions(eventId: string): Promise<number> {
  if (!isSupabaseConfigured || !supabase) {
    return 0
  }
  const { data, error } = await supabase.rpc('resolve_event_champions', { p_event_id: eventId })
  if (error) throw new Error(error.message)
  return (data as number) ?? 0
}

/** 删除赛事（级联清理报名/战队/赛程/冠军记录；仅管理员） */
export async function deleteEvent(eventId: string): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    const i = mockEvents.findIndex((x) => x.id === eventId)
    if (i >= 0) mockEvents.splice(i, 1)
    return
  }
  const { error } = await supabase.rpc('delete_event', { p_event_id: eventId })
  if (error) throw new Error(error.message)
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
      banner_url: input.banner_url ?? null,
      champion_image: input.champion_image ?? null,
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
      banner_url: input.banner_url ?? null,
      champion_image: input.champion_image ?? null,
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
