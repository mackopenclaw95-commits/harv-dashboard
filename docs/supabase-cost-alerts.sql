-- Cost alerts table — tracks threshold notifications sent to users
-- Prevents duplicate alerts per user per period (weekly/monthly)

create table cost_alerts (
  id bigint generated always as identity primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  alert_type text not null,        -- 'weekly_80' | 'weekly_100' | 'monthly_80' | 'monthly_100'
  period_key text not null,        -- '2026-W16' or '2026-04' (dedup key)
  cost_usd numeric not null,
  cap_usd numeric not null,
  email_sent boolean default false,
  created_at timestamptz default now()
);

-- Dedup: one alert per user per type per period
create unique index idx_cost_alerts_dedup on cost_alerts(user_id, alert_type, period_key);

-- Fast lookup for user's recent alerts (notification bell)
create index idx_cost_alerts_user_recent on cost_alerts(user_id, created_at desc);

-- RLS
alter table cost_alerts enable row level security;

-- Users can read their own alerts
create policy "Users read own cost alerts"
  on cost_alerts for select
  using (auth.uid() = user_id);

-- Service role can insert/update (cron job)
create policy "Service role manages cost alerts"
  on cost_alerts for all
  using (true)
  with check (true);
