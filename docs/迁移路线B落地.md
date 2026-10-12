# 路线 B 落地：Postgres + PostgREST + GoTrue + Realtime（微缩版 Supabase）

> 目标：在 3.7GB 内存的机器上，跑起 HVV Major 需要的**最小后端**，摆脱 Supabase 云，代码几乎零改动。
>
> 核心洞察：**Supabase 的 Auth（GoTrue）、Realtime、Storage 本身都是独立开源组件，可以只挑需要的单独跑**。你的项目实际上只需要 4 个服务，而不是官方全家桶的 11 个。

---

## 0. 你的项目到底需要什么（实测结论）

| Supabase 能力 | 实际依赖 | 结论 |
|---|---|---|
| Postgres + 30 个 plpgsql 函数 + 8 触发器 | ✅ 重度 | **必须保留**，裸 Postgres 原样跑 |
| RLS（50 处 `auth.uid()`） | ✅ 重度 | 依赖 `auth.uid()`，需要 GoTrue 提供 |
| Auth（邮箱注册/登录/JWT） | ✅ | 需要 GoTrue |
| Realtime（`matches` 表 2 个订阅） | ⚠️ 很轻 | 可保留 Realtime 单跑，或退化轮询 |
| Storage（截图上传） | ❌ **空壳** | 截图走 JSON 存 `player_applications` 表，全项目零处真实调用，**整个删掉** |
| Edge Function `pwa-proxy` | ⚠️ 1 个 | 改 nginx 反代即可，不需要 Deno |
| Studio 控制台 | ❌ 不需要常驻 | 运维时临时起，平时停 |

**所以 B 方案 = 4 个容器**，内存压到 ~1.5GB，你的 2.8GB 可用内存够塞。

---

## 1. 服务清单与内存预估

| 容器 | 镜像 | 内存 | 作用 |
|---|---|---|---|
| postgres | `postgres:15` | ~400MB（`shared_buffers` 调小） | 数据库 + 30 函数 + RLS |
| gotrue | `supabase/gotrue` | ~150MB | Auth：注册/登录/JWT 签发，提供 `auth` schema + `auth.uid()` |
| postgrest | `postgrest/postgrest` | ~150MB | REST API（supabase-js 底层就是它） |
| realtime | `supabase/realtime` | ~300MB | `matches` 表变更广播 |

合计约 **1.0~1.5GB**，加上你的现有服务，2.8GB 可用内存可容纳。

> 若想再省：Realtime 换成前端轮询（30s），可省 300MB，但需改前端 2 处。见第 6 节。

---

## 2. 部署步骤（在你的 140 服务器上）

### 2.1 建目录与 `.env`

```bash
mkdir -p /opt/hvv-backend && cd /opt/hvv-backend
```

`.env`（**所有密钥换成随机值**）：

```env
# Postgres
POSTGRES_PASSWORD=<随机32位>
POSTGRES_DB=postgres

# GoTrue（Auth）
GOTRUE_JWT_SECRET=<随机64位>
GOTRUE_JWT_EXP=3600
GOTRUE_DB_DRIVER=postgres
GOTRUE_DB_DATABASE_URL=postgres://supabase_auth_admin:<密码>@postgres:5432/postgres
GOTRUE_API_HOST=0.0.0.0
GOTRUE_API_PORT=9999
GOTRUE_SITE_URL=http://<你的IP>
GOTRUE_URI_ALLOW_LIST=http://localhost:5173,https://major.hwmajor.club
GOTRUE_EXTERNAL_EMAIL_ENABLED=true

# PostgREST
PGRST_DB_URI=postgres://authenticator:<密码>@postgres:5432/postgres
PGRST_DB_SCHEMA=public
PGRST_DB_ANON_ROLE=anon
PGRST_JWT_SECRET=<与GOTRUE_JWT_SECRET相同>
PGRST_DB_SCHEMAS=public,storage

# Realtime
REALTIME_DB_HOST=postgres
REALTIME_DB_PORT=5432
REALTIME_DB_NAME=postgres
REALTIME_DB_USER=supabase_realtime_admin
REALTIME_DB_PASSWORD=<密码>
REALTIME_JWT_SECRET=<与GOTRUE_JWT_SECRET相同>
```

### 2.2 docker-compose.yml

```yaml
services:
  postgres:
    image: postgres:15
    restart: unless-stopped
    command:
      - postgres
      - -c
      - shared_buffers=256MB
      - -c
      - wal_level=logical   # realtime 需要
      - -c
      - max_replication_slots=5
    environment:
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: postgres
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 5s
      retries: 10

  gotrue:
    image: supabase/gotrue:latest
    restart: unless-stopped
    environment:
      GOTRUE_JWT_SECRET: ${GOTRUE_JWT_SECRET}
      GOTRUE_JWT_EXP: "3600"
      GOTRUE_DB_DRIVER: postgres
      GOTRUE_DB_DATABASE_URL: ${GOTRUE_DB_DATABASE_URL}
      GOTRUE_API_HOST: 0.0.0.0
      GOTRUE_API_PORT: "9999"
      GOTRUE_SITE_URL: ${GOTRUE_SITE_URL}
      GOTRUE_URI_ALLOW_LIST: ${GOTRUE_URI_ALLOW_LIST}
      GOTRUE_EXTERNAL_EMAIL_ENABLED: "true"
      GOTRUE_MAILER_AUTOCONFIRM: "false"
      GOTRUE_MAILER_SUBJECTS_CONFIRMATION: "确认你的 HVV Major 账号"
    depends_on:
      postgres:
        condition: service_healthy

  postgrest:
    image: postgrest/postgrest:latest
    restart: unless-stopped
    environment:
      PGRST_DB_URI: ${PGRST_DB_URI}
      PGRST_DB_SCHEMA: public
      PGRST_DB_ANON_ROLE: anon
      PGRST_JWT_SECRET: ${PGRST_JWT_SECRET}
      PGRST_DB_SCHEMAS: public
    depends_on:
      postgres:
        condition: service_healthy

  realtime:
    image: supabase/realtime:latest
    restart: unless-stopped
    environment:
      DB_HOST: ${REALTIME_DB_HOST}
      DB_PORT: ${REALTIME_DB_PORT}
      DB_NAME: ${REALTIME_DB_NAME}
      DB_USER: ${REALTIME_DB_USER}
      DB_PASSWORD: ${REALTIME_DB_PASSWORD}
      DB_SSL: "false"
      JWT_SECRET: ${REALTIME_JWT_SECRET}
      PORT: "4000"
      SECURE_CHANNELS: "false"
    depends_on:
      postgres:
        condition: service_healthy

  # 反代：把 /auth /rest /realtime /storage 聚合到一个入口，给前端当 SUPABASE_URL
  kong:
    image: kong:3.6
    restart: unless-stopped
    environment:
      KONG_DATABASE: "off"
      KONG_DECLARATIVE_CONFIG: /kong.yml
      KONG_PROXY_ACCESS_LOG: /dev/stdout
      KONG_PROXY_ERROR_LOG: /dev/stderr
    ports:
      - "8000:8000"
    volumes:
      - ./kong.yml:/kong.yml
    depends_on:
      - gotrue
      - postgrest
      - realtime

volumes:
  pgdata:
```

> **Kong 是可选但强烈建议**：前端 `@supabase/supabase-js` 默认按 `/auth/v1`、`/rest/v1`、`/realtime/v1`、`/storage/v1` 路径访问同一个 `SUPABASE_URL`。没有 Kong，就得改前端 `supabase.ts` 传 `auth`/`realtime` 分地址。加一个 Kong 声明式配置，前端**完全不用改**。

### 2.3 kong.yml（声明式路由）

```yaml
_format_version: "3.0"
services:
  - name: auth
    url: http://gotrue:9999
    routes:
      - name: auth-route
        paths: ["/auth"]
        strip_path: false
  - name: rest
    url: http://postgrest:3000
    routes:
      - name: rest-route
        paths: ["/rest"]
        strip_path: false
  - name: realtime
    url: http://realtime:4000
    routes:
      - name: realtime-route
        paths: ["/realtime"]
        strip_path: false
    protocols: ["http", "https"]
```

---

## 3. 初始化数据库（关键，最容易卡在这里）

### 3.1 建角色

在 postgres 容器里执行：

```sql
-- PostgREST 用的角色（authenticator 切换 anon/authenticated）
create role anon nologin;
create role authenticated nologin;
create role authenticator noinherit login password '<密码>';
grant anon to authenticator;
grant authenticated to authenticator;

-- GoTrue 用的角色与 schema
create role supabase_auth_admin noinherit login password '<密码>';
create schema if not exists auth;
grant all on schema auth to supabase_auth_admin;
grant usage on schema public to anon, authenticated, supabase_auth_admin;

-- Realtime 用的角色
create role supabase_realtime_admin noinherit login password '<密码>';
```

### 3.2 建 auth.users 表（替代 Supabase Auth 内建表）

GoTrue 需要一个 `auth.users` 表（你的 `handle_new_user` 触发器和 `profiles` 外键都依赖它）：

```sql
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  raw_user_meta_data jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

> GoTrue 在自托管模式会自己创建/管理 auth schema，但为了稳妥，先手工建好这张最小表，让 `profiles.id references auth.users(id)` 和 `on_auth_user_created` 触发器能挂上。

### 3.3 执行你的 schema（去掉 Supabase 特有段）

```bash
# 1. 先删掉 schema.sql 里的 storage 段（第 97~113 行，你的项目没真实用 Storage）
# 2. 执行
psql -h 127.0.0.1 -U postgres -d postgres -f schema.sql
# 3. 按时间顺序执行 migration
for f in migration_*.sql; do psql -h 127.0.0.1 -U postgres -d postgres -f "$f"; done
```

**必须手动处理的两处**（其余 SQL 纯 Postgres 通用，直接跑）：

1. 删除 `storage.buckets` / `storage.objects` 相关段（97~113 行）。
2. `profiles.id references auth.users(id)` 需确保 `auth.users` 表已存在（3.2 已建）。

### 3.4 验证 JWT 签发

```bash
curl -X POST http://<IP>:8000/auth/v1/signup \
  -H 'apikey: <anon-key>' \
  -H 'Content-Type: application/json' \
  -d '{"email":"test@x.com","password":"test123456"}'
```

返回 `access_token` 即成功。

---

## 3.5 已有真实数据的迁移（重要，项目已上线）

> 项目已在 Supabase 云上有真实数据（战队/比分/竞猜/论坛/账号），**不能从空库重建**，必须把数据导过来。配套脚本已放在 `deploy/` 目录。

### 3.5.1 导出（在装了 docker 的服务器上运行）

```bash
cd deploy
# 编辑 dump-from-supabase.sh，填 SUPABASE_DB_HOST 和 SUPABASE_DB_PASSWORD
bash dump-from-supabase.sh
```

产出 `dump.sql`，包含 **schema + `auth.users`（用户账号）+ 25 张业务表数据**，一个不落。

关键点：
- 连接信息在 Supabase 控制台 **Settings → Database**：Host 形如 `db.xxxxxxxx.supabase.co`，密码在页内设置/重置。
- **必须用直连端口 `5432`**，不能用连接池 `6543`（pgbouncer 会导致 pg_dump 报错）。
- 用户密码是 bcrypt hash，导出恢复后**用户直接用原密码登录，无需重置**。

### 3.5.2 恢复（目标服务器上运行）

```bash
cd deploy
# 编辑 restore-to-self.sh，填目标库 PG_PASSWORD
# 前提：已按 3.1/3.2 建好角色 + auth schema + auth.users 表
bash restore-to-self.sh
```

脚本会自动：
1. 备份 `dump.sql` 为 `.bak`
2. 剥离 Supabase 特有段（`storage` schema、`supabase_realtime`、pgsodium/vault 扩展、event trigger）
3. 恢复进自建 Postgres
4. 输出 `auth.users / teams / matches / player_applications` 四张表行数做校验

### 3.5.3 迁移后必须复核的几件事

1. **行数对得上**：导出前先在 Supabase 云 SQL Editor 跑一遍 `select count(*) from teams/matches/...`，恢复后对比，数字一致才算成功。
2. **管理员账号能登录**：恢复后登录页用原管理员邮箱登录，确认 `profiles.role='admin'` 生效（RLS 和 `is_admin()` 函数都依赖它）。
3. **JWT 三处 secret 一致**（见第 7 节），否则登录成功但查不到数据。
4. **附件/截图**：截图走 JSON 存 `player_applications.screenshots`，随表迁移，无需额外处理；如果历史上有人往 Storage bucket 传过文件，需另外用 `supabase storage` 导出（本项目的 schema 里 `player-screenshots` bucket 是空壳，一般无此问题）。

---

## 4. 前端改造（最小化）

### 4.1 `.env.local`

```
VITE_SUPABASE_URL=http://<你的IP>:8000
VITE_SUPABASE_ANON_KEY=<anon JWT>
```

`anon key` 用 `GOTRUE_JWT_SECRET` 签发，payload 为 `{"role":"anon","iss":"supabase"}`。

### 4.2 `src/lib/supabase.ts`（如果不想用 Kong）

若你不想加 Kong 容器，改用分地址创建客户端：

```ts
import { createClient } from '@supabase/supabase-js'
const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
export const supabase = createClient(url, anonKey, {
  auth: { persistSession: true, autoRefreshToken: true },
  // realtime 单独地址（若走轮询则不用）
})
```

> 加了 Kong 的话，这段**完全不用改**，`@supabase/supabase-js` 自动按 `/auth/v1` `/rest/v1` `/realtime/v1` 访问。

---

## 5. 数据迁移（Supabase 云 → 你的机器）

```bash
# 在能连到 Supabase 云的地方
supabase db dump --db-url postgresql://postgres:<云库密码>@<云host>:5432/postgres -f dump.sql
# 恢复到你机器（先清掉 storage 相关 + 保留 auth.users 数据）
psql -h <IP> -U postgres -d postgres -f dump.sql
```

> 注意：dump 里会带 `auth.users`（Supabase 云的用户数据）和 `storage.*`，恢复前先把 storage 段注释掉。用户密码是 hash，直接迁移即可登录。

---

## 6. 可选的省内存优化

| 优化 | 省内存 | 代价 |
|---|---|---|
| Realtime → 前端 30s 轮询 | ~300MB | 改 `match.ts` 两个 `subscribe*` 函数 + `Matches.vue` 一处 `setInterval` |
| Kong → 直连 + 改 `supabase.ts` | ~100MB | 改 1 个文件传分地址 |
| 关 `wal_level=logical`（不用 Realtime 时） | 磁盘/CPU | Realtime 失效 |

**你的 2.8GB 可用内存，跑 4 容器（1~1.5GB）+ 现有服务，不需要做上述任何优化也能稳。**

---

## 7. 风险与注意

1. **JWT secret 必须一致**：GoTrue、PostgREST、Realtime 三处的 `JWT_SECRET` 必须完全相同，否则 `auth.uid()` 解析不出用户 → 所有 RLS 策略失效（表现为"查不到数据"）。
2. **`supabase/gotrue` 镜像版本**：GoTrue 的 env 变量名历史上变过（`GOTRUE_*` vs `API_EXTERNAL_URL` 等），部署后务必 `docker logs gotrue` 看报错，别照抄过时博客。
3. **邮箱验证**：`GOTRUE_EXTERNAL_EMAIL_ENABLED` 若配 SMTP，需正确设置 `GOTRUE_SMTP_*`；不配则用 `GOTRUE_MAILER_AUTOCONFIRM=true` 跳过邮箱验证直接登录（内部赛事可接受）。
4. **HTTPS**：你的 IP 无备案无证书，`GOTRUE_URI_ALLOW_LIST` 和前端 `VITE_SUPABASE_URL` 用 `http://IP` 即可，别配 https 会连不上。
5. **备份**：`pg_dump` 定时任务 + 保留 dump 文件，这是自建后你要自己负责的事。

---

## 8. 一键脚本（TODO 待补全）

完整的 `deploy.sh` + `init.sql` + `kong.yml` 待根据你的具体 IP、域名、SMTP 参数生成。当前文档给出的是**手工可执行版**，每个命令都能独立跑通。

需要我出可执行脚本的话，告诉我三个参数：服务器 IP、是否用邮箱验证（还是注册即通过）、是否要 Kong 聚合（还是改前端分地址）。
