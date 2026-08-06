// 自动同步（预留）：比赛结果从第三方平台拉取
// ============================================================
// 当前方案：已决定采用手动录入（见赛程管理「录入比分」、数据录入）。
// 若未来需要对接完美对战平台（无公开 API，需抓包内部接口 + 签名破解），
// 在此实现 runSync('perfect_world') 并配合 Supabase Edge Function 定时执行。
// ============================================================
import { mockMatches } from '@/mock/data'
import { updateMatchResult } from './admin'

export interface SyncResult {
  synced: number
  source: string
}

const MAPS = ['Mirage', 'Inferno', 'Anubis', 'Nuke', 'Dust2', 'Ancient']

export async function runSync(source = 'demo'): Promise<SyncResult> {
  // 演示模式：随机为 scheduled 比赛生成比分
  if (source === 'demo') {
    const scheduled = mockMatches.filter(
      (m) => m.status === 'scheduled' && m.team_a_id && m.team_b_id,
    )
    for (const m of scheduled) {
      const a = 7 + Math.floor(Math.random() * 7) // 7~13
      const b = a > 10 ? 3 + Math.floor(Math.random() * 6) : 10 + Math.floor(Math.random() * 4)
      m.map = m.map ?? MAPS[Math.floor(Math.random() * MAPS.length)]
      await updateMatchResult(m.id, a, b)
    }
    return { synced: scheduled.length, source }
  }

  // TODO: 真实平台 API 接入（见文件头注释）
  throw new Error(`数据源 "${source}" 尚未接入，请先在 src/api/sync.ts 中实现`)
}
