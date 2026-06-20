-- 02-auth.sql — make Tracker multi-user via Supabase Auth (Google).
-- Run this ONCE on the existing project (after schema.sql was already applied).
--
-- Adds an owner to every row and scopes RLS so each signed-in user only sees
-- their own trackers and entries. Existing rows get user_id = NULL, which makes
-- them invisible under the new policies (not deleted) until claimed — see the
-- optional "claim" block at the bottom.

-- 1) Ownership columns. Default to the caller's uid so inserts from the client
--    fill it automatically — no app code needs to pass user_id.
alter table trackers
  add column if not exists user_id uuid references auth.users(id) on delete cascade default auth.uid();
alter table entries
  add column if not exists user_id uuid references auth.users(id) on delete cascade default auth.uid();

create index if not exists trackers_user_idx on trackers (user_id);
create index if not exists entries_user_idx on entries (user_id);

-- 2) Replace the open (anon) policies with per-user ones. Only authenticated
--    users, and only their own rows.
drop policy if exists trackers_all on trackers;
create policy trackers_own on trackers
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists entries_all on entries;
create policy entries_own on entries
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 3) OPTIONAL — claim pre-auth demo data for yourself.
-- After you sign in once, find your user id in Supabase → Authentication →
-- Users, then uncomment and run (replace the UUID):
--
-- update trackers set user_id = 'YOUR-USER-UUID' where user_id is null;
-- update entries  set user_id = 'YOUR-USER-UUID' where user_id is null;
