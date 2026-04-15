-- Pricing drift history log
--
-- Records every drift check (from the on-demand admin UI or the weekly VPS
-- cron) so we can see "rates have been stable for N days" and spot trends.
--
-- Run this in Supabase SQL editor once.

create table if not exists pricing_drift_log (
  id bigserial primary key,
  checked_at timestamptz not null default now(),
  source text not null,                 -- 'admin_ui' | 'weekly_cron' | 'manual'
  rows_checked int not null default 0,
  live_models int not null default 0,
  is_clean boolean not null default true,
  zombies_count int not null default 0,
  free_wrong_count int not null default 0,
  drifts_count int not null default 0,
  details jsonb                          -- full issue list for post-hoc analysis
);

create index if not exists pricing_drift_log_checked_at_idx
  on pricing_drift_log (checked_at desc);

-- RLS — admins read, service role writes.
alter table pricing_drift_log enable row level security;

drop policy if exists "pricing_drift_log_admin_read" on pricing_drift_log;
create policy "pricing_drift_log_admin_read"
  on pricing_drift_log for select
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
      and profiles.role in ('owner', 'admin')
    )
  );
