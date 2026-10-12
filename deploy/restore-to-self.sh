#!/usr/bin/env bash
# ============================================================
# HVV Major 数据迁移：恢复 dump 到自建 Postgres
# 顺序：auth.users → public schema → 重建触发器 → 授权
# 用 docker exec 直接进 postgres 容器跑 psql，绕开网络/密码问题
# 用法：bash restore-to-self.sh
# ============================================================
set -euo pipefail

CONTAINER="hvv-postgres"

echo "==> 检查 dump 文件 ..."
[ -f "dump_auth.sql" ] || { echo "错误：找不到 dump_auth.sql，先运行 dump-from-supabase.sh"; exit 1; }
[ -f "dump_public.sql" ] || { echo "错误：找不到 dump_public.sql，先运行 dump-from-supabase.sh"; exit 1; }

echo "==> 检查 postgres 容器 ..."
docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$" || {
  echo "错误：容器 ${CONTAINER} 没在运行。先执行："
  echo "  docker compose up -d postgres && sleep 10 && docker exec -i ${CONTAINER} psql -U postgres -d postgres < init.sql"
  exit 1
}

echo "==> ① 恢复 auth.users（用户账号 + 密码 hash）..."
docker exec -i "${CONTAINER}" psql -U postgres -d postgres < dump_auth.sql 2>&1 | grep -v "handle_new_user\|does not exist" || true

echo "==> ② 恢复 public schema（25 张业务表 + 函数 + 数据）..."
docker exec -i "${CONTAINER}" psql -U postgres -d postgres < dump_public.sql

echo "==> ③ 重建 auth.users 触发器（handle_new_user 函数现已就位）..."
docker exec -i "${CONTAINER}" psql -U postgres -d postgres <<'SQL'
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
SQL

echo "==> ④ 授权 auth schema 给 GoTrue ..."
[ -f "grant-auth.sql" ] && docker exec -i "${CONTAINER}" psql -U postgres -d postgres < grant-auth.sql

echo "==> 验证：查询核心表行数 ..."
docker exec "${CONTAINER}" psql -U postgres -d postgres \
  -c "select (select count(*) from auth.users) as users, (select count(*) from teams) as teams, (select count(*) from matches) as matches, (select count(*) from profiles) as profiles;"
