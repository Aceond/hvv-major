-- ============================================================
-- 增量脚本：为 player_applications 表补充「在职状态」相关字段
-- 适用：已跑过旧版 schema.sql 的数据库（表已存在，仅缺这三列）
-- 说明：使用 if not exists，可安全重复执行
-- ============================================================

-- 在职 / 离职
alter table public.player_applications
  add column if not exists employment_status text check (employment_status in ('employed', 'unemployed'));

-- 驻地（在职时必填）
alter table public.player_applications
  add column if not exists location text;

-- 工号（在职时必填）
alter table public.player_applications
  add column if not exists employee_no text;
