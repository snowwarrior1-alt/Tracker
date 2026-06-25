-- Tracker — full schema for a fresh Supabase project.
-- Run this once in the Supabase SQL editor.
--
-- Multi-user via Supabase Auth: every row is owned by a user (user_id), and RLS
-- scopes reads/writes to the signed-in user. (The original single-user version
-- was migrated to this by supabase/02-auth.sql.)

-- ---------------------------------------------------------------------------
-- trackers: one row per thing you want to track.
-- ---------------------------------------------------------------------------
create table if not exists trackers (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid references auth.users(id) on delete cascade default auth.uid(),
  name           text not null check (char_length(name) between 1 and 80),
  -- 'yesno'  : a day is either done or not (at most one entry per day)
  -- 'count'  : tally taps within a day (a day's value is SUM of its entries)
  type           text not null check (type in ('yesno', 'count')),
  color          text not null default '#6366f1' check (color ~ '^#[0-9a-fA-F]{6}$'),
  emoji          text not null default '✅' check (char_length(emoji) <= 8),
  unit           text check (unit is null or char_length(unit) <= 24),
  -- 'more'  : logging more is good (e.g. chia seeds)        → good day = any log
  -- 'less'  : you want to avoid this (e.g. drinks)          → good day = zero
  -- 'neutral': just counting                                → good day = any log
  goal_direction text not null default 'neutral' check (goal_direction in ('more', 'less', 'neutral')),
  -- which side the streak counts: 'did' = days logged, 'skipped' = clean days
  streak_side    text not null default 'did' check (streak_side in ('did', 'skipped')),
  sort_order     int not null default 0,
  archived       boolean not null default false,
  created_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- entries: one row per tap. day is the user's LOCAL calendar date.
-- ---------------------------------------------------------------------------
create table if not exists entries (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users(id) on delete cascade default auth.uid(),
  tracker_id uuid not null references trackers(id) on delete cascade,
  day        date not null,
  value      int not null default 1 check (value <> 0),
  logged_at  timestamptz not null default now()
);

create index if not exists entries_tracker_day_idx on entries (tracker_id, day);
create index if not exists entries_day_idx on entries (day);
create index if not exists trackers_user_idx on trackers (user_id);
create index if not exists entries_user_idx on entries (user_id);

-- ---------------------------------------------------------------------------
-- day_notes: an optional free-text note per tracker per day.
-- ---------------------------------------------------------------------------
create table if not exists day_notes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users(id) on delete cascade default auth.uid(),
  tracker_id uuid not null references trackers(id) on delete cascade,
  day        date not null,
  note       text not null check (char_length(note) <= 2000),
  updated_at timestamptz not null default now(),
  unique (tracker_id, day)
);
create index if not exists day_notes_tracker_idx on day_notes (tracker_id);

-- ---------------------------------------------------------------------------
-- tracker_resources: reference material attached to a tracker itself — titled
-- links and free-text notes (vs day_notes, which are per-day).
-- ---------------------------------------------------------------------------
create table if not exists tracker_resources (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users(id) on delete cascade default auth.uid(),
  tracker_id uuid not null references trackers(id) on delete cascade,
  kind       text not null check (kind in ('link', 'note')),
  title      text check (title is null or char_length(title) <= 120),
  url        text check (url is null or char_length(url) <= 2000),
  body       text check (body is null or char_length(body) <= 4000),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tracker_resources_shape check (
    (kind = 'link' and url is not null) or
    (kind = 'note' and body is not null)
  )
);
create index if not exists tracker_resources_tracker_idx on tracker_resources (tracker_id);

-- ---------------------------------------------------------------------------
-- Row Level Security — each user only sees their own rows.
-- ---------------------------------------------------------------------------
alter table trackers enable row level security;
alter table entries  enable row level security;

drop policy if exists trackers_own on trackers;
create policy trackers_own on trackers
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists entries_own on entries;
create policy entries_own on entries
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table day_notes enable row level security;
drop policy if exists day_notes_own on day_notes;
create policy day_notes_own on day_notes
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table tracker_resources enable row level security;
drop policy if exists tracker_resources_own on tracker_resources;
create policy tracker_resources_own on tracker_resources
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
