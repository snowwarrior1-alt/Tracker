# Tracker

A dead-simple personal tracker. Add anything you want to track — a yes/no habit
("ate chia seeds today?") or a daily count ("standard drinks") — then tap to log
it. See a calendar of which days you did it and a few analytics (streaks, totals,
a 30-day chart).

Built with **Next.js 16 + Supabase + Tailwind v4**, deployed on **Vercel** —
the same stack as MapCrowd.

## How it works

- **Dashboard** (`/`) — every tracker as a row. Tap the check (yes/no) or the
  `+ / −` (count) to log today. Tap the row to open its detail.
- **Detail** (`/t/[id]`) — a bigger "today" logger, a month **calendar** tinted
  by what you logged, and **analytics**: current/longest streak, good days,
  totals, trailing 7/30-day sums, and a 30-day bar chart.
- **Goal direction** — when you create a tracker you say whether doing it is
  *good* (more = 💚, e.g. chia seeds), *bad* (less = 💚, e.g. drinks — a clean
  day is the win), or *neutral*. This only changes how streaks/"good days" and
  the calendar colors are framed.

Data is stored in Supabase and synced across every device you open the site on.

**Sign in with Google** — each account sees only its own trackers (Supabase Auth
+ row-level security keyed on `user_id`). Sign in on any device to pick up where
you left off.

## One-time setup

This app needs a Supabase project. It's single-user for now (no login) — the
anon key has full access, which is fine for a personal tracker.

1. **Create a Supabase project** at https://supabase.com (free tier is plenty).
2. **Apply the schema**: open the project → SQL Editor → paste all of
   [`supabase/schema.sql`](supabase/schema.sql) → Run.
3. **Get your keys**: Project Settings → API. Copy the Project URL and the
   `anon` `public` key.
4. **Local env**: copy `.env.local.example` to `.env.local` and fill in:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://<your-project>.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
   ```
   The URL **must** include `https://`.
5. **Enable Google sign-in**:
   - Run [`supabase/02-auth.sql`](supabase/02-auth.sql) in the SQL editor (adds
     `user_id` ownership + per-user RLS). Skip if you used the current
     `schema.sql`, which already includes it.
   - Supabase → **Authentication → Providers → Google**: make sure it's enabled.
   - Supabase → **Authentication → URL Configuration → Redirect URLs**: add
     `http://localhost:3000/**` (local dev) and `https://<your-vercel-app>/**`
     (production). The OAuth redirect (`window.location.origin`) must be on this
     allowlist or sign-in fails.

## Running locally

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production build check
npm test         # vitest — unit tests for lib/stats.ts
```

## Deploying (Vercel)

1. Push this repo to GitHub (`origin` is already set to the Tracker repo).
2. Import it in Vercel → it auto-detects Next.js.
3. Add the two `NEXT_PUBLIC_SUPABASE_*` env vars in Vercel → Settings →
   Environment Variables.
4. Deploy. Every push to `main` redeploys.

## Project layout

```
app/
  page.tsx          # Dashboard — tracker list + tap-to-log + add modal
  t/[id]/page.tsx   # Tracker detail — today logger, calendar, analytics, delete
  layout.tsx        # Root layout
  globals.css       # Tailwind + theme vars
components/
  AddTrackerModal.tsx
  TrackerCard.tsx
  CalendarView.tsx
  Analytics.tsx
lib/
  supabase.ts       # Supabase client (validates env vars at startup)
  db.ts             # All queries (list/create/delete trackers, add/remove entries)
  types.ts          # Tracker, Entry, GoalDirection types
  date.ts           # Local-date helpers (day keys are local, not UTC)
  stats.ts          # Pure analytics: streaks, day totals, summaries
  stats.test.ts     # Unit tests
  constants.ts      # Color + emoji palettes
supabase/
  schema.sql        # Full schema — run once on a fresh project
```

## Data model

| Table | What |
|---|---|
| `trackers` | One row per thing tracked: name, `type` (`yesno`/`count`), color, emoji, optional `unit`, `goal_direction`. |
| `entries` | One row per tap: `tracker_id`, `day` (local date), `value`. A count day is `SUM(value)`; a yes/no day is "done" if any row exists. |

To make it multi-user later: add a `user_id` column to both tables and tighten
the RLS policies from `using (true)` to `auth.uid() = user_id`.
