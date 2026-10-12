-- ============================================================
-- HVV Major 自托管后端初始化 SQL
-- 作用：建角色 + auth schema（空 schema，不建 users 表）
-- auth.users 表由 dump.sql 里的完整 Supabase 版自己创建（含密码 hash），
-- 避免与最小版表结构冲突
-- 用法：docker compose up -d postgres 后执行
--   docker exec -i hvv-postgres psql -U postgres -d postgres < init.sql
-- ============================================================

-- 1. 角色（PostgREST / GoTrue / Realtime 各自专用）
create role anon nologin;
create role authenticated nologin;
create role authenticator noinherit login password '__AUTHENTICATOR_PASSWORD__';
grant anon to authenticator;
grant authenticated to authenticator;

create role supabase_auth_admin noinherit login password '__AUTH_DB_PASSWORD__';
create role supabase_realtime_admin noinherit login password '__REALTIME_DB_PASSWORD__';

-- 2. auth schema（只建空 schema，users 表由 dump 建完整版）
create schema if not exists auth;
grant usage on schema auth to supabase_auth_admin;

-- 3. 授权（public schema 给 API 角色）
grant usage on schema public to anon, authenticated, supabase_auth_admin, supabase_realtime_admin;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;

-- 4. realtime 需要的复制权限
alter role supabase_realtime_admin with replication;
alter role supabase_realtime_admin with superuser;

-- 提示
\echo '角色与 auth schema 已就绪（users 表将由 dump 创建）。'
\echo '下一步：恢复 dump.sql，然后执行 grant-auth.sql 给 GoTrue 授权。'
