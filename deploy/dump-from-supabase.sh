#!/usr/bin/env bash
# ============================================================
# HVV Major 数据迁移：从 Supabase 云导出全部数据（两个文件）
# 坑：pg_dump 的 --table 会覆盖 --schema，必须分开导
#   1. dump_auth.sql   = auth.users（用户账号 + 密码 hash）
#   2. dump_public.sql = public schema（25 张业务表 + 函数 + 触发器 + 数据）
# 走 connection pooler（IPv4）
# 用法：bash dump-from-supabase.sh
# ============================================================
set -euo pipefail

# ===== Supabase 云连接信息（pooler，已填好）=====
SUPABASE_DB_HOST="aws-0-ap-southeast-1.pooler.supabase.com"
SUPABASE_DB_USER="postgres.spljjoalknnblltesuux"
SUPABASE_DB_NAME="postgres"
SUPABASE_DB_PASSWORD="REPLACE_ME"   # 填你的 Supabase 数据库密码（别提交真实密码到 git）
SUPABASE_DB_PORT="5432"   # session pooler
# =================================================

DOCKER_IMAGE="postgres:17"

echo "==> 检查 docker ..."
command -v docker >/dev/null 2>&1 || { echo "错误：本机无 docker。"; exit 1; }

COMMON="--host=${SUPABASE_DB_HOST} --port=${SUPABASE_DB_PORT} --username=${SUPABASE_DB_USER} --dbname=${SUPABASE_DB_NAME} --no-owner --no-privileges --no-publications --no-subscriptions --format=plain"

echo "==> ① 导出 auth.users（用户账号 + 密码 hash）..."
docker run --rm \
  -e PGPASSWORD="${SUPABASE_DB_PASSWORD}" \
  -e PGOPTIONS="-c statement_timeout=0" \
  -v "$(pwd):/out" \
  "${DOCKER_IMAGE}" \
  pg_dump ${COMMON} --table=auth.users --file=/out/dump_auth.sql

echo "==> ② 导出 public schema（25 张业务表 + 函数 + 触发器 + 数据）..."
docker run --rm \
  -e PGPASSWORD="${SUPABASE_DB_PASSWORD}" \
  -e PGOPTIONS="-c statement_timeout=0" \
  -v "$(pwd):/out" \
  "${DOCKER_IMAGE}" \
  pg_dump ${COMMON} --schema=public --file=/out/dump_public.sql

echo "==> 导出完成："
echo "    $(pwd)/dump_auth.sql    ($(du -h dump_auth.sql | cut -f1))"
echo "    $(pwd)/dump_public.sql  ($(du -h dump_public.sql | cut -f1))"
echo ""
echo "下一步：运行 restore-to-self.sh 恢复（先 auth 后 public）。"
