<script setup lang="ts">
import { computed } from 'vue'
import type { Match } from '@/api/types'
import { MATCH_STATUS_LABEL } from '@/api/types'

const props = defineProps<{
  matches: Match[]
  stageName: string
}>()

/** 按轮次分组（round_number 升序） */
const rounds = computed(() => {
  const map = new Map<number, Match[]>()
  for (const m of props.matches) {
    const list = map.get(m.round_number) ?? []
    list.push(m)
    map.set(m.round_number, list)
  }
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([number, matches]) => ({ number, matches }))
})

/** 瑞士轮当前排名：按已完成比赛统计胜/负场，胜场多者靠前 */
const standings = computed(() => {
  const map = new Map<
    string,
    { id: string; name: string; wins: number; losses: number }
  >()
  for (const m of props.matches) {
    if (m.status !== 'completed' || !m.winner_id) continue
    for (const [tid, name] of [
      [m.team_a_id, m.team_a_name],
      [m.team_b_id, m.team_b_name],
    ] as const) {
      if (!tid) continue
      const row =
        map.get(tid) ?? { id: tid, name: name ?? '-', wins: 0, losses: 0 }
      if (m.winner_id === tid) row.wins++
      else row.losses++
      map.set(tid, row)
    }
  }
  return [...map.values()].sort(
    (a, b) => b.wins - a.wins || a.losses - b.losses,
  )
})
</script>

<template>
  <div class="swiss">
    <div class="swiss-header">
      <span class="swiss-title">瑞士轮对阵图</span>
      <span class="swiss-stage">{{ stageName }}</span>
    </div>

    <el-empty
      v-if="rounds.length === 0"
      description="当前阶段暂无对阵，请管理员在后台创建"
    />

    <template v-else>
      <div class="rounds">
        <div v-for="round in rounds" :key="round.number" class="round">
          <div class="round-head">
            <span class="round-name">第 {{ round.number }} 轮</span>
            <span class="round-count">{{ round.matches.length }} 场</span>
          </div>
          <div class="round-matches">
            <div
              v-for="m in round.matches"
              :key="m.id"
              class="match-card"
              :class="{ completed: m.status === 'completed' }"
            >
              <div class="matchup">
                <span
                  class="team"
                  :class="{ win: m.winner_id === m.team_a_id }"
                >
                  {{ m.team_a_name }}
                </span>
                <span class="score">{{ m.team_a_score }}:{{ m.team_b_score }}</span>
                <span
                  class="team"
                  :class="{ win: m.winner_id === m.team_b_id }"
                >
                  {{ m.team_b_name }}
                </span>
              </div>
              <div class="match-meta">
                <span>BO{{ m.best_of }}</span>
                <span class="status" :class="m.status">
                  {{ MATCH_STATUS_LABEL[m.status as Match['status']] }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <el-table :data="standings" stripe class="standings" empty-text="暂无排名">
        <el-table-column label="排名" width="70" type="index" :index="1" />
        <el-table-column prop="name" label="战队" min-width="160" />
        <el-table-column prop="wins" label="胜" width="70" align="center" />
        <el-table-column prop="losses" label="负" width="70" align="center" />
      </el-table>
    </template>
  </div>
</template>

<style scoped>
.swiss-header {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin-bottom: 16px;
}

.swiss-title {
  font-size: 15px;
  font-weight: 700;
}

.swiss-stage {
  color: var(--cs2-text-muted);
  font-size: 13px;
}

.rounds {
  display: flex;
  gap: 16px;
  overflow-x: auto;
  padding-bottom: 8px;
}

.round {
  flex: 0 0 auto;
  width: 230px;
  background: var(--cs2-panel);
  border: 1px solid var(--cs2-border);
  border-radius: 8px;
  padding: 12px;
}

.round-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.round-name {
  font-weight: 700;
  color: var(--cs2-text);
}

.round-count {
  font-size: 12px;
  color: var(--cs2-text-muted);
}

.round-matches {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.match-card {
  background: var(--cs2-panel-2);
  border: 1px solid var(--cs2-border);
  border-radius: 6px;
  padding: 8px 10px;
}

.matchup {
  display: flex;
  align-items: center;
  gap: 6px;
}

.team {
  flex: 1;
  font-size: 13px;
  color: var(--cs2-text-regular, #c6ccd8);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.team.win {
  color: #67c23a;
  font-weight: 700;
}

.score {
  font-weight: 700;
  color: var(--cs2-accent);
  white-space: nowrap;
}

.match-meta {
  display: flex;
  justify-content: space-between;
  margin-top: 6px;
  font-size: 12px;
  color: var(--cs2-text-muted);
}

.status.completed {
  color: #67c23a;
}

.status.scheduled {
  color: #e6a23c;
}

.status.cancelled {
  color: #f56c6c;
}

.standings {
  margin-top: 20px;
}
</style>
