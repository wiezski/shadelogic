-- ── Phase 15: Device Session Tracking & User Limits ─────────────
-- Tracks active device sessions per user (max 3 concurrent)
-- Also adds max_users / extra_user_price to companies for plan enforcement

-- ── Active device sessions ──────────────────────────────────────
create table if not exists user_sessions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  company_id    uuid not null references companies(id) on delete cascade,
  device_id     text not null,                  -- fingerprint or generated device token
  device_label  text,                           -- e.g. "Chrome on Mac", "Safari on iPhone"
  ip_address    text,
  last_active   timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

-- Index for fast lookup by user
create index if not exists idx_user_sessions_user on user_sessions(user_id);
create index if not exists idx_user_sessions_device on user_sessions(user_id, device_id);

-- Unique constraint: one row per user+device combo
create unique index if not exists idx_user_sessions_unique on user_sessions(user_id, device_id);

-- RLS
alter table user_sessions enable row level security;

-- Users can see their own sessions
create policy "Users can view own sessions"
  on user_sessions for select
  using (user_id = auth.uid());

-- Users can insert/update their own sessions
create policy "Users can upsert own sessions"
  on user_sessions for insert
  with check (user_id = auth.uid());

create policy "Users can update own sessions"
  on user_sessions for update
  using (user_id = auth.uid());

-- Users can delete their own sessions (logout from device)
create policy "Users can delete own sessions"
  on user_sessions for delete
  using (user_id = auth.uid());

-- ── Trial abuse prevention ──────────────────────────────────────
-- Track card fingerprints to prevent repeated free trials
create table if not exists trial_cards (
  id              uuid primary key default gen_random_uuid(),
  card_fingerprint text not null unique,         -- Stripe card fingerprint
  company_id      uuid not null references companies(id),
  used_at         timestamptz not null default now()
);

create index if not exists idx_trial_cards_fingerprint on trial_cards(card_fingerprint);

-- Only service role should write to this table (via webhook)
alter table trial_cards enable row level security;

-- No public access - only service role
create policy "No public access to trial_cards"
  on trial_cards for select
  using (false);

-- ── Cleanup function for stale sessions ─────────────────────────
-- Sessions inactive for more than 24 hours are considered stale
create or replace function cleanup_stale_sessions()
returns void as $$
begin
  delete from user_sessions
  where last_active < now() - interval '24 hours';
end;
$$ language plpgsql security definer;
