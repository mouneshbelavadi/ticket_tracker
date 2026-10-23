-- ========================================================
-- Ticket Alert Portal: Database Schema
-- Run this script in the Supabase SQL Editor.
-- ========================================================

-- Enable UUID extension if not already enabled
create extension if not exists "pgcrypto";

-- 1. Monitors Table
create table if not exists monitors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  url text not null,
  interval_seconds int not null check (interval_seconds in (60, 180, 300)),
  mode text not null check (mode in ('appears', 'disappears', 'changes')),
  keyword text,                -- For appears/disappears; multiple keywords separated by "|"
  sanity_keyword text,         -- Text that must be on page to count as valid (e.g. event name)
  css_selector text,           -- Optional selector used by 'changes' mode
  release_at timestamptz,      -- Optional expected release timestamp
  status text not null default 'active' check (status in ('active', 'paused', 'alerted')),
  last_state text not null default 'unknown' check (last_state in ('unknown', 'unavailable', 'available', 'error', 'blocked')),
  last_checked_at timestamptz,
  next_check_at timestamptz not null default now(),
  consecutive_failures int not null default 0,
  last_error text,
  last_content_hash text,
  alert_claimed_at timestamptz,
  alert_sent_at timestamptz,
  trouble_notified_at timestamptz,
  created_at timestamptz not null default now()
);

-- Index for claiming due monitors efficiently
create index if not exists idx_monitors_due 
  on monitors (status, next_check_at) 
  where status = 'active';

-- 2. Check Logs Table
create table if not exists check_logs (
  id bigserial primary key,
  monitor_id uuid not null references monitors(id) on delete cascade,
  checked_at timestamptz not null default now(),
  http_status int,
  state text not null,
  latency_ms int,
  note text
);

-- Index for retrieving monitor history quickly
create index if not exists idx_check_logs_monitor_time 
  on check_logs (monitor_id, checked_at desc);

-- 3. Heartbeat Table (Single Row tracking last tick timestamp)
create table if not exists heartbeat (
  id int primary key check (id = 1),
  last_tick_at timestamptz
);

-- Initialize the single heartbeat row
insert into heartbeat (id, last_tick_at)
values (1, null)
on conflict (id) do nothing;

-- 4. Demo State Table (Single Row for testing ticket availability toggle)
create table if not exists demo_state (
  id int primary key check (id = 1),
  available boolean not null default false
);

-- Initialize the single demo_state row
insert into demo_state (id, available)
values (1, false)
on conflict (id) do nothing;

-- 5. Row-Level Security (RLS)
-- Enable RLS on all tables and add NO policies.
-- Public anon key has NO access; server code uses service_role key which bypasses RLS.
alter table monitors enable row level security;
alter table check_logs enable row level security;
alter table heartbeat enable row level security;
alter table demo_state enable row level security;

-- 6. Atomic Lease Function: claim_due_monitors
-- Selects up to max_rows active monitors due for a check using FOR UPDATE SKIP LOCKED
-- Sets their next_check_at to now() + 60s as a lease to prevent overlapping ticks
create or replace function claim_due_monitors(max_rows int)
returns setof monitors
language plpgsql
security definer
as $$
begin
  return query
  with due as (
    select id
    from monitors
    where status = 'active'
      and next_check_at <= now()
    order by next_check_at asc
    limit max_rows
    for update skip locked
  )
  update monitors m
  set next_check_at = now() + interval '60 seconds'
  from due
  where m.id = due.id
  returning m.*;
end;
$$;

-- 7. Retention Function: prune_logs
-- Keeps only the latest 200 check_logs per monitor
create or replace function prune_logs()
returns void
language sql
security definer
as $$
  delete from check_logs
  where id in (
    select id from (
      select id, row_number() over (partition by monitor_id order by checked_at desc) as rn
      from check_logs
    ) sub
    where sub.rn > 200
  );
$$;
