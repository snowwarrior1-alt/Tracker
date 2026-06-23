'use client'

import { useState } from 'react'
import type { Tracker, Entry, StreakSide } from '@/lib/types'
import {
  summarize,
  dayTotals,
  buildBuckets,
  defaultStreakSide,
  resolveRange,
  type Bucket,
  type RangeId,
} from '@/lib/stats'
import { addDays, dayLabel, shortDay, shortMonth } from '@/lib/date'

type Annotation = { key: string; note: string; kind: 'peak' | 'dip' }

const RANGES: { id: RangeId; label: string }[] = [
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
  { id: 'year', label: 'Year' },
  { id: 'all', label: 'All' },
  { id: 'custom', label: 'Custom' },
]

// Stat tiles + a range-adjustable bar chart for one tracker. On daily ranges,
// relative peaks/dips that have a note get a little callout pin.
export default function Analytics({
  tracker,
  entries,
  today,
  since,
  notes,
}: {
  tracker: Tracker
  entries: Entry[]
  today: string
  since: string
  notes: Record<string, string>
}) {
  const side: StreakSide = tracker.streak_side ?? defaultStreakSide(tracker.goal_direction)
  const s = summarize(entries, tracker.goal_direction, side, today, since)
  const totals = dayTotals(entries)
  const unit = tracker.unit?.trim()
  const isCount = tracker.type === 'count'

  // Chart range + the open (tapped) callout. Mobile has no hover, so a tap pins it.
  const [range, setRange] = useState<RangeId>('month')
  const [customFrom, setCustomFrom] = useState(addDays(today, -89))
  const [customTo, setCustomTo] = useState(today)
  const [openKey, setOpenKey] = useState<string | null>(null)

  // Resolve the selected range to a [start, end] window.
  const { start, end } = resolveRange(range, today, since, { from: customFrom, to: customTo })

  const { granularity, buckets } = buildBuckets(totals, start, end)
  const chartMax = Math.max(1, ...buckets.map((b) => b.value))

  // Callouts: only on daily bars (a week/month bucket has no single note day).
  // An interior bar that's a strict local max (peak) or min (dip) AND carries a
  // note gets annotated.
  const annotations: Record<string, Annotation> = {}
  if (granularity === 'day') {
    for (let i = 1; i < buckets.length - 1; i++) {
      const { key, value } = buckets[i]
      const note = notes[key]
      if (!note) continue
      const prev = buckets[i - 1].value
      const next = buckets[i + 1].value
      if (value > prev && value > next) annotations[key] = { key, note, kind: 'peak' }
      else if (value < prev && value < next) annotations[key] = { key, note, kind: 'dip' }
    }
  }

  const goodLabel =
    tracker.goal_direction === 'less' ? 'Clean days' : tracker.goal_direction === 'more' ? 'Good days' : 'Active days'
  const streakSub = side === 'skipped' ? 'clean days' : 'days'
  const denseGap = buckets.length > 40

  function barTooltip(b: Bucket): string {
    if (granularity === 'day') return `${b.start}: ${b.value}`
    if (granularity === 'week') return `${shortDay(b.start)}–${shortDay(b.end)}: ${b.value}`
    return `${shortMonth(b.key)}: ${b.value}`
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Current streak" value={`${s.currentStreak}`} sub={streakSub} accent={tracker.color} />
        <Stat label="Longest streak" value={`${s.longestStreak}`} sub={streakSub} />
        <Stat
          label={goodLabel}
          value={`${s.goodDays}`}
          sub={`of ${s.rangeDays} day${s.rangeDays === 1 ? '' : 's'}`}
        />
        {isCount ? (
          <Stat label="Total" value={`${s.total}`} sub={unit || 'logged'} />
        ) : (
          <Stat label="Times done" value={`${s.daysLogged}`} sub="all time" />
        )}
      </div>

      {isCount && (
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Last 7 days" value={`${s.last7}`} sub={unit || ''} />
          <Stat label="Last 30 days" value={`${s.last30}`} sub={unit || ''} />
          <Stat
            label="Avg / logged day"
            value={s.avgPerLoggedDay ? s.avgPerLoggedDay.toFixed(1) : '0'}
            sub={unit || ''}
          />
        </div>
      )}

      {/* Range-adjustable bar chart — peaks/dips with a note get a callout pin */}
      <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
        {/* Range selector */}
        <div className="mb-3 flex flex-wrap gap-1.5">
          {RANGES.map((r) => (
            <button
              key={r.id}
              onClick={() => {
                setRange(r.id)
                setOpenKey(null)
              }}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                range === r.id ? 'text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
              }`}
              style={range === r.id ? { background: tracker.color } : undefined}
            >
              {r.label}
            </button>
          ))}
        </div>

        {/* Custom date pickers */}
        {range === 'custom' && (
          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
            <label className="flex items-center gap-1">
              From
              <input
                type="date"
                value={customFrom}
                max={customTo}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="rounded-lg border border-zinc-300 px-2 py-1 outline-none focus:border-indigo-500"
              />
            </label>
            <label className="flex items-center gap-1">
              to
              <input
                type="date"
                value={customTo}
                min={customFrom}
                max={today}
                onChange={(e) => setCustomTo(e.target.value)}
                className="rounded-lg border border-zinc-300 px-2 py-1 outline-none focus:border-indigo-500"
              />
            </label>
          </div>
        )}

        {buckets.length === 0 ? (
          <p className="py-8 text-center text-sm text-zinc-400">Pick a start date on or before the end date.</p>
        ) : (
          <>
            {/* extra top padding leaves room for callouts to float above the bars */}
            <div className={`flex h-28 items-end pt-6 ${denseGap ? 'gap-[1.5px]' : 'gap-[3px]'}`}>
              {buckets.map((b, i) => {
                const ann = annotations[b.key]
                const align = i <= 4 ? 'left' : i >= buckets.length - 5 ? 'right' : 'center'
                const open = openKey === b.key
                return (
                  <div
                    key={b.key}
                    className="group relative flex h-full flex-1 items-end"
                    title={ann ? undefined : barTooltip(b)}
                    onClick={() => ann && setOpenKey(open ? null : b.key)}
                  >
                    <div
                      className="relative w-full rounded-sm"
                      style={{
                        height: `${b.value === 0 ? 2 : Math.max(4, (b.value / chartMax) * 100)}%`,
                        background: b.value === 0 ? '#e4e4e7' : tracker.color,
                      }}
                    >
                      {ann && (
                        <>
                          {/* pin sitting on the bar's tip */}
                          <span
                            className="absolute -top-1 left-1/2 z-10 h-2 w-2 -translate-x-1/2 -translate-y-full rounded-full ring-2 ring-white"
                            style={{ background: tracker.color }}
                          />
                          {/* callout bubble — hover (desktop) or tap (mobile) */}
                          <div
                            className={[
                              'absolute bottom-full z-20 mb-2 w-max max-w-[150px] -translate-y-1 rounded-lg bg-zinc-900 px-2.5 py-1.5 text-left shadow-lg',
                              align === 'center' ? 'left-1/2 -translate-x-1/2' : align === 'left' ? 'left-0' : 'right-0',
                              open ? 'block' : 'hidden group-hover:block',
                            ].join(' ')}
                          >
                            <div className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-zinc-400">
                              <span>{ann.kind === 'peak' ? '▲' : '▼'}</span>
                              <span>{dayLabel(b.key)}</span>
                              <span className="text-zinc-500">· {b.value}{unit ? ` ${unit}` : ''}</span>
                            </div>
                            <p className="mt-0.5 line-clamp-3 text-xs leading-snug text-zinc-100">{ann.note}</p>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="mt-1 flex justify-between text-[11px] text-zinc-400">
              <span>{shortDay(buckets[0].start)}</span>
              <span className="text-zinc-400">
                {granularity === 'day' ? 'daily' : granularity === 'week' ? 'weekly' : 'monthly'}
              </span>
              <span>{end === today ? 'today' : shortDay(end)}</span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function Stat({
  label,
  value,
  sub,
  accent,
}: {
  label: string
  value: string
  sub?: string
  accent?: string
}) {
  return (
    <div className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-black/5">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="text-2xl font-bold tabular-nums" style={accent ? { color: accent } : undefined}>
        {value}
      </div>
      {sub && <div className="text-[11px] text-zinc-400">{sub}</div>}
    </div>
  )
}
