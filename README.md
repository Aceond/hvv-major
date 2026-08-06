# HVV Major · CS2 电竞赛事管理系统

面向 CS2 赛事的一站式平台：**战队报名**、**多阶段赛程**、**积分排名**，管理后台负责审核与运维。

- 前端：Vue 3 + TypeScript + Vite + Element Plus + Pinia + Vue Router
- 后端：Supabase（PostgreSQL + Auth + RLS + Realtime）
- 部署：GitHub Actions → GitHub Pages（纯静态，零服务器成本）
- 数据来源：赛程、比分与队伍/个人统计均由**管理员后台手动录入**（预留对战平台 API 扩展点）

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

## 目录结构

```
hvv-major/
├─ docs/                     # 架构设计方案
├─ supabase/schema.sql       # 数据库初始化（建表/触发器/RLS/函数）
├─ .github/workflows/deploy.yml
└─ src/
   ├─ api/                   # registration / match / admin / stats / sync(扩展) / types
   ├─ mock/data.ts           # 本地演示数据
   ├─ stores/auth.ts         # 登录态（含演示登录）
   ├─ layouts/               # 公开端 / 管理端布局
   └─ views/                 # Home/PlayerRegister/Register/Matches/Standings/Rankings/Login + admin/*
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

## 开发路线图

| 阶段 | 内容 |
|---|---|
| M0 框架（当前） | 架构文档 + 可运行骨架 |
| M1 报名 | 审核闭环、名册管理、移动端适配 |
| M2 赛程 | 分组/对阵自动生成、地图详情 |
| M3 数据录入 | 队伍/个人统计手动录入（WE/ADR/KD/Rating） |
| M4 打磨 | 公告、选手数据、导出 CSV、对接对战平台 API（可选） |
