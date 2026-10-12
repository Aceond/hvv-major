# HVV Major · CS2 电竞赛事管理系统

面向 CS2 赛事的一站式平台：**战队报名**、**多阶段赛程**、**积分排名**、**竞猜投注**、**论坛**、**场地预约**，管理后台负责审核与运维。当前已办至第 11 届（HVV MAJOR XI）。

- 前端：Vue 3 + TypeScript + Vite + Element Plus + Pinia + Vue Router
- 后端：Supabase（PostgreSQL + Auth + RLS + Realtime + Storage + Edge Function）
- 部署：GitHub Actions → GitHub Pages（纯静态，自定义域名 `major.hwmajor.club`）
- 数据来源：赛程/比分/统计由**管理员后台手动录入**，并支持从**完美对战平台(PWA)** 按 Steam64 自动导入战绩

架构与设计详见 [docs/架构设计方案.md](docs/架构设计方案.md)。

## 快速开始

```bash
npm install
npm run dev          # 本地开发 http://localhost:5173/hvv-major/
npm run build        # 构建产物 dist/（含类型检查）
```

未配置 Supabase 密钥时，应用以**演示模式**运行：登录页可直接"以管理员/选手身份进入"，全链路（个人注册 → 战队报名 → 审核 → 赛程/比分录入 → 数据录入 → 积分榜/排行）均可体验。

## 后台数据录入

管理员登录后进入「数据录入」页面（`/admin/stats`）：

- **队伍数据**：按组别 + 阶段行内编辑 场次/胜/负/积分/**WE%**/**ADR**/**KD**/**Rating**，批量保存
- **个人数据**：按战队筛选名册，录入 场次/击杀/死亡/助攻/爆头率/**Rating**，以完美用户名（`pw_username`）记录
- 赛程比分在「赛程管理」（`/admin/matches`）录入，胜者由系统按比分自动判定
- 录入数据按阶段幂等 upsert，「总阶段」自动汇总全部阶段数据

## 功能总览

| 模块 | 公开端 | 管理端 |
|---|---|---|
| 赛事 | 公告 / 多届赛事 / 冠军展播（罗马数字届数） | 赛事管理 / 冠军自动判定 |
| 报名 | 个人注册（Steam64 校验）· 战队报名（名册 ≥5）· 审核状态查询 | 账号审核 / 战队审核 / 选手审核 |
| 赛程 | 多阶段混合赛制（循环/单败/双败/瑞士轮）对阵树 | 阶段·对阵·比分录入（胜者自动判定） |
| 数据 | 积分榜 / 队伍与个人排行 / 五维雷达图 | 队伍(WE/ADR/KD/Rating)与个人统计录入、总阶段汇总 |
| 竞猜 | 赛事竞猜投注 | 竞猜盘口管理 / 结算 |
| 社区 | 论坛（发帖/回帖/点赞/收藏） | — |
| 其他 | 场地预约 · 个人中心 · 历史对战记录 | 账号 / 站点配置 |

数据录入支持从**完美对战平台**自动导入：输入 PWA token + Steam64 拉取对局列表，按 Steam64 匹配名册，自动写入比分与个人数据（不在名册的选手自动归为替补）。

## 目录结构

```
hvv-major/
├─ docs/                      # 架构设计方案
├─ supabase/                  # schema.sql(建表/触发器/RLS/函数) + migration_*.sql + functions/pwa-proxy
├─ .github/workflows/deploy.yml
├─ scripts/ + data/           # PWA(完美平台)接口逆向探测脚本与抓取样本
└─ src/
   ├─ api/                    # registration/match/admin/stats/event/bet/forum/booking/caster/pwaImport/types
   ├─ lib/                    # supabase / bracketTree / playoff / csv / pwaCrypto(签名)
   ├─ components/             # 各类对阵树 + PlayerRadar(五维图) + MatchPlayerStatsDialog
   ├─ mock/data.ts            # 本地演示数据（演示模式）
   ├─ stores/auth.ts          # 登录态（含演示/游客登录）
   ├─ layouts/                # 公开端 / 管理端布局
   └─ views/                  # 16 个公开页 + admin/ 10 个后台页
```

## 接入 Supabase（3 步）

1. 在 [supabase.com](https://supabase.com) 创建项目，复制 `Project URL` 与 `anon public key`
2. 在 SQL Editor 中整体执行 `supabase/schema.sql`
3. 本地：复制 `.env.example` 为 `.env.local` 填入两个密钥

启用管理员：在 Auth → Users 创建账号后，把 schema.sql 末尾的更新语句中的 UUID 换成该用户 id 执行。

## 部署到 GitHub Pages

1. 推送代码到 GitHub 仓库 `main` 分支
2. 在仓库 Settings → Secrets and variables → Actions 添加 `VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY`
3. Settings → Pages → Source 选择 `gh-pages` 分支
4. push 后 Actions 自动构建并发布到 `https://<user>.github.io/hvv-major/`

## 当前状态

核心链路均已实现并投入使用：报名审核闭环、多赛制对阵、比分/统计录入（手动 + PWA 自动导入）、竞猜、论坛、场地预约。M0–M4 路线图中的功能已基本落地，README 历史版本标注的「M0 框架（当前）」已过时。

剩余可选方向：导出 CSV、公告管理等打磨项；`src/api/sync.ts` 保留为对战平台全自动同步的扩展点。
