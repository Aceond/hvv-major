# HVV Major 自托管部署包（路线 B）

从 Supabase 云迁到你自己的服务器。全套脚本，按顺序执行。

## 文件清单

| 文件 | 作用 |
|---|---|
| `docker-compose.yml` | 5 个服务：postgres + gotrue + postgrest + realtime + kong |
| `kong.yml` | 路由聚合（前端零改动） |
| `.env.example` | 环境变量模板，复制为 `.env` 填随机值 |
| `init.sql` | 建角色 + auth schema + auth.users 表 |
| `dump-from-supabase.sh` | **从 Supabase 云导出数据**（密码已填） |
| `restore-to-self.sh` | **恢复到自建 Postgres**（需填目标库密码） |
| `schema.sql` | 你的数据库 schema（已从项目复制，含去 storage 版） |

## 执行顺序（在服务器上）

```bash
# 0. 建目录，把整个 deploy 包解压进去
mkdir -p /opt/hvv-backend && cd /opt/hvv-backend

# 1. 配置环境变量
cp .env.example .env
# 编辑 .env：填 SITE_URL 的 IP，把所有 <...> 换成 openssl rand -hex 32/64 的结果

# 2. 生成 init.sql 的实际密码（把 init.sql 里的 __XXX__ 占位符换成 .env 里的对应值）
#    可用：sed -i "s/__AUTHENTICATOR_PASSWORD__/<值>/" init.sql （三个都要换）

# 3. 启动 Postgres（先起这一个，用来初始化）
docker compose up -d postgres

# 4. 初始化角色与 auth.users 表
docker exec -i hvv-postgres psql -U postgres -d postgres < init.sql

# 5. 导出 Supabase 云数据（在任意能联网的机器上，脚本已填好密码）
bash dump-from-supabase.sh

# 6. 把 dump.sql 放到当前目录，恢复到自建 Postgres
#    先填 restore-to-self.sh 里的 PG_PASSWORD（= .env 的 POSTGRES_PASSWORD）
bash restore-to-self.sh

# 7. 启动全部服务
docker compose up -d

# 8. 验证
curl http://<你的IP>:8000/rest/v1/   # 应返回 PostgREST 的 API 元信息
```

## 前端切换

前端 `.env.local` 两个变量改成：

```
VITE_SUPABASE_URL=http://<你的IP>:8000
VITE_SUPABASE_ANON_KEY=<用 JWT_SECRET 签发的 anon JWT>
```

然后重新 `npm run build` 部署即可。

## 注意事项

- **JWT_SECRET 三处必须一致**（gotrue/postgrest/realtime），否则登录成功但查不到数据。
- **密码占位符务必全换**，别用默认值上线。
- 迁移完建议重置 Supabase 云数据库密码（本包 dump 脚本里那个密码已在对话中暴露过）。
- 详细文档见项目 `docs/迁移路线B落地.md`。
