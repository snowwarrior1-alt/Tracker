-- 05-resources.sql — tracker-level resources: titled links and free-text notes
-- attached to a tracker itself (vs day_notes, which are per-day). Lets you keep
-- reference material on a tracker, e.g. a link to your stretch routine doc.
-- Run once on the existing project (after 04-streak-side.sql).

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
  -- a link must carry a url; a note must carry a body
  constraint tracker_resources_shape check (
    (kind = 'link' and url is not null) or
    (kind = 'note' and body is not null)
  )
);

create index if not exists tracker_resources_tracker_idx on tracker_resources (tracker_id);

alter table tracker_resources enable row level security;
drop policy if exists tracker_resources_own on tracker_resources;
create policy tracker_resources_own on tracker_resources
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
