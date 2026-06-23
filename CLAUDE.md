# Tracker — Project Context

## What this is
A dead-simple personal habit/quantity tracker. The user adds their own trackers
("Standard drinks", "Chia seeds", "Went outside") that are either **yes/no**
(did it or not) or **count** (how many in a day). They tap to log, see a
**calendar** of which days, and a few **analytics** (streaks, totals, a 30-day
chart). Every day is editable after the fact and can carry a free-text note.
The guiding spirit: a private, honest, low-friction personal tool.

## Local workspace
This repo lives at **`C:\Users\snoww\Mapper-Tracker\tracker\`** — a gitignored subfolder of the user's `Mapper-Tracker` workspace (renamed from `Map` → `Mapper + Tracker` → `Mapper-Tracker`; the `+`/space in the old name broke Turbopack's `next dev` HMR — keep the path free of `+`/spaces), which is itself the `personal-site` portfolio repo. The sibling **MapCrowd** app (`../mapcrowd/`, github `snowwarrior1-alt/Mapper`) is a separate repo in the same workspace, and the two **share one Supabase project** (named "Mapper+Tracker", ref `tmycdgnofvmbyrmpqohw`) — see Deployment.

## Tech stack
- **Framework**: Next.js 16 (App Router, Turbopack), all pages are `'use client'`
- **DB + Auth**: Supabase (Postgres, RLS, Google OAuth)
- **Styling**: Tailwind CSS v4 (`@import "tailwindcss"`, CSS vars in `globals.css`)
- **Icons**: lucide-react
- **Language**: TypeScript
- Mirrors the **MapCrowd** project's stack and conventions (sibling repo).

## Running locally
```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production build check
npm test         # vitest — unit tests for lib/stats.ts (pure logic)
```
`.env.local` needs (Supabase dashboard → Settings → API):
```
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co   # MUST include https://
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```
**Build-time env**: `NEXT_PUBLIC_*` vars are inlined at *build* time, and
`lib/supabase.ts` throws at module load if they're missing — so the build fails
without them. For a CI/clean build without real creds, pass dummy values:
`NEXT_PUBLIC_SUPABASE_URL=https://dummy.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy npm run build`.

## Project structure
```
app/
  page.tsx          # Dashboard: auth gate → tracker list, tap-to-log, add modal, sign-out
  t/[id]/page.tsx   # Detail: today logger, calendar, analytics, per-day editor, delete
  layout.tsx        # Root layout + viewport (viewport-fit=cover for safe-area)
  globals.css       # Tailwind import + theme CSS vars
components/
  AddTrackerModal.tsx  # Create form: name, type, goal direction, emoji, color, unit
  TrackerCard.tsx      # Dashboard row + inline log controls + today's-note subsection
  CalendarView.tsx     # Month grid; days are buttons → onSelectDay; note dots
  DayEditor.tsx        # Bottom-sheet for one day: value editor + note textarea
  Analytics.tsx        # Stat tiles + 30-day bar chart
  SignInScreen.tsx     # "Sign in with Google" gate
lib/
  supabase.ts       # Supabase client (throws if env missing)
  db.ts             # ALL queries (trackers, entries, notes)
  useUser.ts        # useUser() hook + signInWithGoogle()/signOut()
  types.ts          # Tracker, Entry, GoalDirection, DayTotals
  date.ts           # LOCAL day-key helpers + dayLabel/daysInMonth
  stats.ts          # Pure analytics (dayTotals, streaks, summarize) — unit-tested
  stats.test.ts
  constants.ts      # COLORS + EMOJIS palettes
supabase/
  schema.sql        # Full current schema — run on a FRESH project
  02-auth.sql       # Migration: per-user ownership + RLS (already applied to live DB)
  03-notes.sql      # Migration: day_notes table (already applied to live DB)
  04-streak-side.sql # Migration: trackers.streak_side column (did/skipped)
```

## Data model
| Table | Purpose |
|---|---|
| `trackers` | One per tracked thing: `user_id` (owner), name, `type` (`yesno`/`count`), `color`, `emoji`, `unit?`, `goal_direction` (`more`/`less`/`neutral`), `streak_side` (`did`/`skipped` — which side the streak counts), `sort_order`, `archived`, `created_at`. |
| `entries` | One row per tap: `user_id`, `tracker_id`, `day` (LOCAL date), `value`. A count day = `SUM(value)`; a yes/no day = "done" if any row exists (kept to ≤1 row/day by the app). |
| `day_notes` | Optional note, unique per (`tracker_id`, `day`): `user_id`, `note`, `updated_at`. |

- **RLS**: every table is `for all to authenticated using (auth.uid() = user_id)
  with check (auth.uid() = user_id)`. The `user_id` columns **default to
  `auth.uid()`**, so client inserts don't pass `user_id` — it's filled from the
  JWT, and the check passes. To add a column/table, keep this pattern.
- **Migrations**: fresh project → run `schema.sql` (full state). Existing DB →
  run only the numbered files not yet applied, in order. `schema.sql` is kept in
  sync as the union of all migrations.

## Key conventions & gotchas
- **Day keys are LOCAL, not UTC.** `lib/date.ts` `toDayKey()`/`todayKey()` format
  `YYYY-MM-DD` in the browser's local timezone so a late-night tap lands on the
  right day. Never send `new Date().toISOString()` as a day. The `day` column is
  a Postgres `date`.
- **Editing any day reuses the same writers.** `db.ts` `addEntry`/`removeLastEntry`/
  `clearDay` all take a `day` arg; the "today" logger and the calendar `DayEditor`
  call the same `adjust(day, delta)` / `setDone(day, done)` handlers in
  `app/t/[id]/page.tsx`. Local `entries` state is mutated optimistically and a
  `busy` flag guards against double-submits while a write is in flight.
- **Analytics `since`** = the tracker's created day, or the earliest entry day if
  earlier (so honest backfilling counts). Computed in the detail page.
- **Streak side** (`trackers.streak_side`): `'did'` streaks on days you logged it
  (`total > 0`), `'skipped'` on clean days (`total === 0`). It's **independent of
  `goal_direction`** (which still drives the calendar tint + the "good/clean/active
  days" tile). Default at creation comes from the goal (`defaultStreakSide`: `less`
  → `skipped`, else `did`); the detail page's "Streak counts" toggle flips it live
  via `updateTracker`. Streak math (`currentStreak`/`longestStreak`) takes the side,
  not the goal. App code reads `tracker.streak_side ?? defaultStreakSide(...)` so it
  still works against rows from before migration 04.
- **Chart ranges**: `Analytics` lets you pick week / month / year / all / custom
  (date pickers). `stats.buildBuckets(totals, start, end)` auto-picks a
  `Granularity` (`chooseGranularity`: ≤45 days daily, ≤366 weekly, else monthly) so
  the bar count stays phone-readable. **Note callouts only render on daily bars** (a
  week/month bucket has no single note day). Callouts mark interior strict local
  max (`▲`) / min (`▼`) bars that have a `day_notes` note, shown on hover (desktop)
  or tap (mobile).
- **`listNotes` tolerates a missing `day_notes` table** (returns `{}` on
  `42P01`/`PGRST205`) so the detail page still loads if migration 03 lags a deploy.
- **Auth is client-side, like MapCrowd** — `signInWithOAuth({ provider: 'google',
  options: { redirectTo: window.location.origin } })`, no server callback route.
  `useUser()` reads `getSession()` + subscribes to `onAuthStateChange`. Both pages
  gate on it (spinner → SignInScreen → content). The redirect origin MUST be in
  Supabase → Authentication → URL Configuration → Redirect URLs or sign-in fails.
- **Mobile-first.** Tap targets are kept ≥44px; modals are bottom sheets
  (`items-end ... sm:items-center`, `rounded-t-2xl`) that dismiss on backdrop tap;
  the floating Add button uses `env(safe-area-inset-bottom)` (needs
  `viewport-fit=cover`, set in `layout.tsx`).

## Verifying changes
- `npm run build` (with real or dummy env) + `npm test` should both pass.
- The app is auth-gated, so previewing signed-in screens needs a session. The
  pattern used during development: create a throwaway user via the GoTrue admin
  API (service-role key, `email_confirm:true`), password-grant a session, inject
  it into the browser's `localStorage` under `sb-<ref>-auth-token`, then delete
  the user after. (Supabase uses rotating ES256 JWT keys — a freshly minted token
  can briefly 401 with "no suitable key" until the JWKS cache catches up; refresh
  or retry.)

## Deployment
- **GitHub**: https://github.com/snowwarrior1-alt/Tracker (Vercel auto-deploys `main`)
- **Live**: https://dailytally.vercel.app
- **Supabase**: shares MapCrowd's project — named **"Mapper+Tracker"**
  (`tmycdgnofvmbyrmpqohw`) — to stay under the free-tier 2-project cap. Tracker
  only owns the `trackers`/`entries`/`day_notes` tables; its RLS doesn't touch
  MapCrowd data. Google OAuth + the Google callback are already configured at the
  project level.
- **Vercel env vars**: `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  set for all environments. Must exist *before* a build (inlined at build time).

## Features built
- Add trackers (yes/no or count; emoji, color, unit, goal direction, streak side)
- Tap-to-log on the dashboard; per-tracker detail with today logger
- Month calendar tinted by goal direction; note dots
- Analytics: current/longest streak, good/clean days, totals, 7/30-day sums
- **Adjustable chart range**: week / month / year / all / custom, auto-bucketed
  daily → weekly → monthly to stay readable
- **Choosable streak side** ("did it" vs "skipped"), set at creation and flippable
  on the detail page
- **Edit any past day** via a calendar-tap bottom sheet (adjust value / toggle)
- **Per-day notes**, with peak/dip **note callouts** on the daily chart; today's
  note is also editable inline from each **dashboard card** (`listNotesForDay`)
- Google sign-in, per-user data (RLS)
- Mobile-tuned (tap targets, bottom sheets, safe-area)
