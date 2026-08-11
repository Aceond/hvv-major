<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useAuthStore } from '@/stores/auth'
import type { EventItem, Match } from '@/api/types'
import { listEvents } from '@/api/event'
import { listAllStageMatches } from '@/api/match'
import {
  getMyBetAccount,
  listMyRecords,
  listPolls,
  placeBet,
  BET_KIND_LABEL,
  type BetOption,
  type BetPoll,
  type BetRecord,
} from '@/api/bet'
import { formatDateTime } from '@/utils/format'

const auth = useAuthStore()

const events = ref<EventItem[]>([])
const currentEvent = ref('')
const polls = ref<BetPoll[]>([])
const records = ref<BetRecord[]>([])
const account = ref({ points: 200, exists: false })
const loading = ref(false)
const betting = ref(false)

/** 当前赛事比赛映射（比赛胜者竞猜展示对阵/阶段/时间用） */
const matchMap = ref<Map<string, Match>>(new Map())

/** 竞猜关联的比赛（自动生成的比赛胜者竞猜带 match_id） */
function matchOf(poll: BetPoll): Match | null {
  return poll.match_id ? matchMap.value.get(poll.match_id) ?? null : null
}

/** 我的投注按竞猜项映射 */
const recordByPoll = computed(() => {
  const m = new Map<string, BetRecord>()
  for (const r of records.value) m.set(r.poll_id, r)
  return m
})

const openPolls = computed(() => polls.value.filter((p) => p.status === 'open'))
const settledPolls = computed(() => polls.value.filter((p) => p.status === 'settled'))

/** 组别冠军竞猜的投注选择（poll_id -> option_id）：下拉选择预测的冠军队伍 */
const champChoice = ref<Record<string, string>>({})

function eventName(id: string | null) {
  return events.value.find((e) => e.id === id)?.name ?? '未关联赛事'
}

function kindLabel(kind: BetPoll['kind']) {
  return BET_KIND_LABEL[kind] ?? '竞猜'
}

function recordResult(r: BetRecord | undefined): { text: string; type: 'success' | 'danger' | 'warning' | 'info' } {
  if (!r) return { text: '', type: 'info' }
  if (r.status === 'won') return { text: `已中奖 +${Math.round(r.stake * r.odds)} 分`, type: 'success' }
  if (r.status === 'lost') return { text: '未中奖', type: 'danger' }
  return { text: '待揭晓', type: 'warning' }
}

async function load() {
  loading.value = true
  try {
    events.value = await listEvents()
    if (!currentEvent.value && events.value[0]) currentEvent.value = events.value[0].id
    const [acc, ps, rs, ms] = await Promise.all([
      getMyBetAccount(),
      listPolls(currentEvent.value || undefined),
      listMyRecords(),
      listAllStageMatches(currentEvent.value || undefined),
    ])
    account.value = acc
    polls.value = ps
    records.value = rs
    matchMap.value = new Map(ms.map((m) => [m.id, m]))
  } finally {
    loading.value = false
  }
}

async function onEventChange() {
  loading.value = true
  try {
    const [acc, ps, ms] = await Promise.all([
      getMyBetAccount(),
      listPolls(currentEvent.value || undefined),
      listAllStageMatches(currentEvent.value || undefined),
    ])
    account.value = acc
    polls.value = ps
    matchMap.value = new Map(ms.map((m) => [m.id, m]))
  } finally {
    loading.value = false
  }
}

/** 组别冠军投注：先校验已从下拉框选择队伍，再进入投注 */
async function doChampBet(poll: BetPoll) {
  const optId = champChoice.value[poll.id]
  if (!optId) {
    ElMessage.warning('请先选择你预测的冠军队伍')
    return
  }
  const opt = poll.options.find((o) => o.id === optId)
  if (opt) await doBet(poll, opt)
}

async function doBet(poll: BetPoll, opt: BetOption) {
  const mine = recordByPoll.value.get(poll.id)
  if (mine) {
    ElMessage.warning('你已参与过该竞猜，每人限投一次')
    return
  }
  const max = account.value.points
  if (max < 1) {
    ElMessage.warning('积分不足，无法投注')
    return
  }
  let stake = 0
  try {
    const { value } = await ElMessageBox.prompt(
      `「${opt.label}」当前赔率 ${opt.odds}，猜中返还投注 × ${opt.odds} 积分（即 ${Math.round(opt.odds * 10)}% 收益）。\n你的可用积分：${max}`,
      `投注竞猜`,
      {
        confirmButtonText: '确认投注',
        cancelButtonText: '取消',
        inputPlaceholder: `请输入 1 - ${max} 积分`,
        inputPattern: /^\d+$/,
        inputErrorMessage: '请输入正整数',
      },
    )
    stake = Number(value)
  } catch {
    return
  }
  if (!Number.isInteger(stake) || stake < 1) {
    ElMessage.warning('请输入正整数积分')
    return
  }
  if (stake > max) {
    ElMessage.warning(`积分不足，最多可投 ${max} 分`)
    return
  }
  betting.value = true
  try {
    await placeBet(poll.id, opt.id, stake)
    ElMessage.success('投注成功')
    await load()
  } catch (e: any) {
    ElMessage.error(e.message || '投注失败')
  } finally {
    betting.value = false
  }
}

onMounted(async () => {
  if (!auth.isLoggedIn) await auth.refresh()
  await load()
})
</script>

<template>
  <div class="page-container">
    <h2 class="title">赛事竞猜</h2>

    <el-alert
      v-if="!auth.isLoggedIn"
      type="warning"
      :closable="false"
      title="请先登录"
      description="竞猜功能仅对注册用户开放，登录后即可使用。"
      class="tip"
    />

    <template v-if="auth.isLoggedIn">
      <el-row :gutter="16">
        <!-- 我的积分 -->
        <el-col :xs="24" :md="8">
          <el-card class="card points-card">
            <div class="points-body">
              <div class="points-label">我的竞猜积分</div>
              <div class="points-value">{{ account.points }}</div>
            </div>
          </el-card>
        </el-col>
        <el-col :xs="24" :md="16">
          <el-card class="card">
            <template #header><span class="card-title">竞猜赛事</span></template>
            <el-select
              v-model="currentEvent"
              placeholder="选择赛事"
              style="width: 100%"
              @change="onEventChange"
            >
              <el-option
                v-for="e in events"
                :key="e.id"
                :label="`${e.name}${e.edition ? `（第 ${e.edition} 届）` : ''}`"
                :value="e.id"
              />
            </el-select>
            <div class="event-tip">每个赛事有独立的竞猜项目，管理员会持续发布新竞猜</div>
          </el-card>
        </el-col>
      </el-row>

      <div v-loading="loading">
        <!-- 进行中的竞猜 -->
        <el-card class="card">
          <template #header><span class="card-title">进行中的竞猜</span></template>
          <el-empty v-if="openPolls.length === 0" description="该赛事暂无进行中的竞猜" :image-size="60" />
          <div v-for="poll in openPolls" :key="poll.id" class="poll-block">
            <div class="poll-head">
              <span class="poll-title">{{ poll.title }}</span>
              <el-tag size="small" type="warning" effect="plain">{{ kindLabel(poll.kind) }}</el-tag>
              <el-tag size="small" effect="plain">{{ eventName(poll.event_id) }}</el-tag>
            </div>

            <!-- 组别冠军：下拉选择预测的冠军队后投注 -->
            <template v-if="poll.kind === 'group_champion'">
              <div class="champ-bet">
                <el-select
                  v-model="champChoice[poll.id]"
                  placeholder="选择你预测的冠军队伍"
                  style="flex: 1"
                  :disabled="!!recordByPoll.get(poll.id)"
                >
                  <el-option
                    v-for="opt in poll.options"
                    :key="opt.id"
                    :label="`${opt.label}（赔率 ${opt.odds}）`"
                    :value="opt.id"
                  />
                </el-select>
                <el-button
                  type="primary"
                  :loading="betting"
                  :disabled="!!recordByPoll.get(poll.id)"
                  @click="doChampBet(poll)"
                >
                  {{ recordByPoll.get(poll.id) ? '已投注' : '投注' }}
                </el-button>
              </div>
              <div v-if="recordByPoll.get(poll.id)" class="my-bet">
                我的投注：{{ recordByPoll.get(poll.id)?.option_label }}（{{ recordByPoll.get(poll.id)?.stake }} 分 @{{ recordByPoll.get(poll.id)?.odds }}）
              </div>
            </template>

            <!-- 比赛胜者：对阵一行（参考赛程页格式，附比赛信息） -->
            <template v-else-if="poll.kind === 'match_winner'">
              <div class="match-bet">
                <div class="match-line">
                  <div class="side">
                    <span class="side-team">{{ matchOf(poll)?.team_a_name || poll.options[0]?.label || '-' }}</span>
                    <el-tag size="small" type="danger" effect="plain">@{{ poll.options[0]?.odds ?? '-' }}</el-tag>
                    <el-button
                      size="small"
                      type="primary"
                      :loading="betting"
                      :disabled="!!recordByPoll.get(poll.id)"
                      @click="poll.options[0] && doBet(poll, poll.options[0])"
                    >
                      {{ recordByPoll.get(poll.id) ? '已投注' : '投注' }}
                    </el-button>
                  </div>
                  <div class="middle">
                    <span class="vs">VS</span>
                    <div v-if="matchOf(poll)" class="match-meta">
                      <span v-if="matchOf(poll)?.stage_name">{{ matchOf(poll)?.stage_name }}</span>
                      <span v-if="matchOf(poll)?.group_name">{{ matchOf(poll)?.group_name }}</span>
                      <span v-if="matchOf(poll)?.scheduled_at">{{ formatDateTime(matchOf(poll)?.scheduled_at) }}</span>
                    </div>
                  </div>
                  <div class="side">
                    <span class="side-team">{{ matchOf(poll)?.team_b_name || poll.options[1]?.label || '-' }}</span>
                    <el-tag size="small" type="danger" effect="plain">@{{ poll.options[1]?.odds ?? '-' }}</el-tag>
                    <el-button
                      size="small"
                      type="primary"
                      :loading="betting"
                      :disabled="!!recordByPoll.get(poll.id)"
                      @click="poll.options[1] && doBet(poll, poll.options[1])"
                    >
                      {{ recordByPoll.get(poll.id) ? '已投注' : '投注' }}
                    </el-button>
                  </div>
                </div>
                <div v-if="recordByPoll.get(poll.id)" class="my-bet">
                  我的投注：{{ recordByPoll.get(poll.id)?.option_label }}（{{ recordByPoll.get(poll.id)?.stake }} 分 @{{ recordByPoll.get(poll.id)?.odds }}）
                </div>
              </div>
            </template>

            <!-- 其他类型：选项行直接投注 -->
            <template v-else>
              <div class="options">
                <div v-for="opt in poll.options" :key="opt.id" class="option-row">
                  <div class="option-info">
                    <span class="option-label">{{ opt.label }}</span>
                    <el-tag size="small" type="danger" effect="plain">赔率 {{ opt.odds }}</el-tag>
                  </div>
                  <el-button
                    size="small"
                    type="primary"
                    plain
                    :loading="betting"
                    @click="doBet(poll, opt)"
                  >
                    {{ recordByPoll.get(poll.id) ? '已投注' : '投注' }}
                  </el-button>
                </div>
              </div>
              <div v-if="recordByPoll.get(poll.id)" class="my-bet">
                我的投注：{{ recordByPoll.get(poll.id)?.option_label }}（{{ recordByPoll.get(poll.id)?.stake }} 分 @{{ recordByPoll.get(poll.id)?.odds }}）
              </div>
            </template>
          </div>
        </el-card>

        <!-- 已结算的竞猜 -->
        <el-card class="card">
          <template #header><span class="card-title">已结算</span></template>
          <el-empty v-if="settledPolls.length === 0" description="暂无已结算的竞猜" :image-size="60" />
          <div v-for="poll in settledPolls" :key="poll.id" class="poll-block">
            <div class="poll-head">
              <span class="poll-title">{{ poll.title }}</span>
              <el-tag size="small" type="success" effect="plain">{{ kindLabel(poll.kind) }}</el-tag>
              <el-tag size="small" effect="plain">{{ eventName(poll.event_id) }}</el-tag>
              <el-tag size="small" type="success" effect="dark">已结算</el-tag>
            </div>

            <!-- 比赛胜者：对阵一行 -->
            <template v-if="poll.kind === 'match_winner'">
              <div class="match-bet">
                <div class="match-line">
                  <div class="side" :class="{ winner: poll.options[0]?.id === poll.winning_option_id }">
                    <span class="side-team">{{ matchOf(poll)?.team_a_name || poll.options[0]?.label || '-' }}</span>
                    <el-tag size="small" type="danger" effect="plain">@{{ poll.options[0]?.odds ?? '-' }}</el-tag>
                    <div class="side-result">
                      <el-tag v-if="poll.options[0]?.id === poll.winning_option_id" size="small" type="success" effect="dark">中奖</el-tag>
                      <el-tag
                        v-if="recordByPoll.get(poll.id)?.option_id === poll.options[0]?.id"
                        size="small"
                        :type="recordResult(recordByPoll.get(poll.id)).type"
                      >
                        {{ recordResult(recordByPoll.get(poll.id)).text }}
                      </el-tag>
                    </div>
                  </div>
                  <div class="middle">
                    <span class="vs">VS</span>
                    <div v-if="matchOf(poll)" class="match-meta">
                      <span v-if="matchOf(poll)?.stage_name">{{ matchOf(poll)?.stage_name }}</span>
                      <span v-if="matchOf(poll)?.group_name">{{ matchOf(poll)?.group_name }}</span>
                      <span v-if="matchOf(poll)?.scheduled_at">{{ formatDateTime(matchOf(poll)?.scheduled_at) }}</span>
                    </div>
                  </div>
                  <div class="side" :class="{ winner: poll.options[1]?.id === poll.winning_option_id }">
                    <span class="side-team">{{ matchOf(poll)?.team_b_name || poll.options[1]?.label || '-' }}</span>
                    <el-tag size="small" type="danger" effect="plain">@{{ poll.options[1]?.odds ?? '-' }}</el-tag>
                    <div class="side-result">
                      <el-tag v-if="poll.options[1]?.id === poll.winning_option_id" size="small" type="success" effect="dark">中奖</el-tag>
                      <el-tag
                        v-if="recordByPoll.get(poll.id)?.option_id === poll.options[1]?.id"
                        size="small"
                        :type="recordResult(recordByPoll.get(poll.id)).type"
                      >
                        {{ recordResult(recordByPoll.get(poll.id)).text }}
                      </el-tag>
                    </div>
                  </div>
                </div>
              </div>
            </template>

            <!-- 其他类型：选项行展示 + 中奖标记 -->
            <template v-else>
              <div class="options">
                <div
                  v-for="opt in poll.options"
                  :key="opt.id"
                  class="option-row"
                  :class="{ winner: opt.id === poll.winning_option_id }"
                >
                  <div class="option-info">
                    <span class="option-label">{{ opt.label }}</span>
                    <el-tag size="small" type="danger" effect="plain">赔率 {{ opt.odds }}</el-tag>
                    <el-tag v-if="opt.id === poll.winning_option_id" size="small" type="success" effect="dark">中奖</el-tag>
                  </div>
                  <el-tag v-if="recordByPoll.get(poll.id)?.option_id === opt.id" size="small" :type="recordResult(recordByPoll.get(poll.id)).type">
                    {{ recordResult(recordByPoll.get(poll.id)).text }}
                  </el-tag>
                </div>
              </div>
            </template>
          </div>
        </el-card>

        <!-- 我的投注记录 -->
        <el-card class="card">
          <template #header><span class="card-title">我的投注记录</span></template>
          <el-table :data="records" stripe empty-text="暂无投注记录" size="small">
            <el-table-column prop="poll.title" label="竞猜项" min-width="180" />
            <el-table-column prop="option_label" label="投注选项" min-width="140" />
            <el-table-column prop="stake" label="投注" width="70" />
            <el-table-column prop="odds" label="赔率" width="70" />
            <el-table-column label="结果" width="90">
              <template #default="{ row }">
                <el-tag size="small" :type="recordResult(row as BetRecord).type">
                  {{ recordResult(row as BetRecord).text }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="时间" min-width="120">
              <template #default="{ row }">{{ formatDateTime(row.created_at) }}</template>
            </el-table-column>
          </el-table>
        </el-card>
      </div>
    </template>
  </div>
</template>

<style scoped>
.title {
  margin: 0 0 16px;
}

.tip {
  margin-bottom: 16px;
}

.card {
  margin-bottom: 16px;
}

.card-title {
  font-weight: 700;
  letter-spacing: 1px;
}

.points-card .points-body {
  text-align: center;
  padding: 6px 0;
}

.points-label {
  font-size: 13px;
  color: var(--cs2-text-muted);
}

.points-value {
  font-size: 40px;
  font-weight: 800;
  color: var(--cs2-accent);
  margin: 6px 0;
}

.event-tip {
  margin-top: 8px;
  font-size: 12px;
  color: var(--cs2-text-muted);
}

.poll-block {
  padding: 12px 0;
  border-bottom: 1px solid var(--cs2-border);
}

.poll-block:last-child {
  border-bottom: none;
}

.poll-head {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 8px;
}

.poll-title {
  font-weight: 700;
  color: var(--cs2-text);
  margin-right: 4px;
}

.options {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.match-bet {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.match-line {
  display: flex;
  align-items: stretch;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--cs2-panel-2);
}

.side {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 6px 8px;
  border-radius: 8px;
}

.side.winner {
  outline: 1px solid #67c23a;
  background: rgba(103, 194, 58, 0.08);
}

.side-team {
  font-weight: 700;
  color: var(--cs2-text);
  text-align: center;
  line-height: 1.3;
}

.side-result {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
  justify-content: center;
}

.middle {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  flex-shrink: 0;
  min-width: 72px;
}

.vs {
  font-size: 18px;
  font-weight: 800;
  color: var(--cs2-accent);
}

.match-meta {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  font-size: 11px;
  color: var(--cs2-text-muted);
}

.champ-bet {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.option-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 12px;
  border-radius: 8px;
  background: var(--cs2-panel-2);
}

.option-row.winner {
  outline: 1px solid #67c23a;
  background: rgba(103, 194, 58, 0.08);
}

.option-info {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.option-label {
  font-weight: 600;
  color: var(--cs2-text-regular, #c6ccd8);
}

.my-bet {
  margin-top: 6px;
  font-size: 12px;
  color: var(--cs2-accent);
}

/* ---------- 移动端适配 ---------- */
@media (max-width: 600px) {
  .match-line {
    flex-direction: column;
    gap: 8px;
  }

  .middle {
    min-width: 0;
    order: 0;
  }

  .side {
    flex-direction: row;
    flex-wrap: wrap;
    justify-content: center;
  }
}
</style>
