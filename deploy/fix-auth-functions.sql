-- ============================================================
-- 修复 auth 辅助函数（RLS 策略依赖，Supabase 云自带，自建需手动建）
-- auth.uid()/auth.role()/auth.jwt() 从 PostgREST 注入的 JWT GUC 读取
-- 用法：docker exec -i hvv-postgres psql -U postgres -d postgres < fix-auth-functions.sql
-- ============================================================

-- 返回当前登录用户 id（JWT 的 sub claim）
create or replace function auth.uid()
returns uuid
language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

-- 返回当前 JWT 的 role claim
create or replace function auth.role()
returns text
language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;

-- 返回完整 JWT claims
create or replace function auth.jwt()
returns jsonb
language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')
  )::jsonb
$$;

-- 授权给 API 角色（RLS 策略在 anon/authenticated 上下文中调用）
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
grant execute on function auth.role() to anon, authenticated;
grant execute on function auth.jwt() to anon, authenticated;

\echo 'auth.uid/role/jwt 函数已创建并授权。'
