-- ============================================================
-- 恢复 dump.sql 之后执行：给 GoTrue / API 角色授权 auth schema
-- 用法：docker exec -i hvv-postgres psql -U postgres -d postgres < grant-auth.sql
-- ============================================================

-- GoTrue 用 supabase_auth_admin 连库，需要 auth schema 全权限
grant usage on schema auth to supabase_auth_admin;
grant all on all tables in schema auth to supabase_auth_admin;
grant all on all sequences in schema auth to supabase_auth_admin;
grant all on all functions in schema auth to supabase_auth_admin;

-- API 角色读权限（前端查自己 profile 时经 PostgREST 访问 auth 相关）
grant usage on schema auth to anon, authenticated;
grant select on auth.users to authenticated;

\echo 'auth schema 授权完成。'
