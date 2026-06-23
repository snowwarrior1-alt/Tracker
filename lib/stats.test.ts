import { describe, it, expect } from 'vitest'
import type { Entry } from './types'
import {
  dayTotals,
  isGoodDay,
  defaultStreakSide,
  countsForStreak,
  dayRange,
  currentStreak,
  longestStreak,
  summarize,
  chooseGranularity,
  buildBuckets,
  resolveRange,
} from './stats'

function entry(day: string, value = 1): Entry {
  return { id: day + value + Math.random(), tracker_id: 't', day, value, logged_at: day }
}

describe('dayTotals', () => {
  it('sums multiple taps on the same day', () => {
    const totals = dayTotals([entry('2026-06-01'), entry('2026-06-01'), entry('2026-06-02', 3)])
    expect(totals).toEqual({ '2026-06-01': 2, '2026-06-02': 3 })
  })
})

describe('isGoodDay', () => {
  it('more/neutral: any activity is good', () => {
    expect(isGoodDay(1, 'more')).toBe(true)
    expect(isGoodDay(0, 'more')).toBe(false)
    expect(isGoodDay(2, 'neutral')).toBe(true)
  })
  it('less: only a clean (zero) day is good', () => {
    expect(isGoodDay(0, 'less')).toBe(true)
    expect(isGoodDay(1, 'less')).toBe(false)
  })
})

describe('defaultStreakSide', () => {
  it('maps less → skipped, everything else → did', () => {
    expect(defaultStreakSide('less')).toBe('skipped')
    expect(defaultStreakSide('more')).toBe('did')
    expect(defaultStreakSide('neutral')).toBe('did')
  })
})

describe('countsForStreak', () => {
  it('did: any activity continues the streak', () => {
    expect(countsForStreak(1, 'did')).toBe(true)
    expect(countsForStreak(0, 'did')).toBe(false)
  })
  it('skipped: only a clean (zero) day continues the streak', () => {
    expect(countsForStreak(0, 'skipped')).toBe(true)
    expect(countsForStreak(2, 'skipped')).toBe(false)
  })
})

describe('dayRange', () => {
  it('is inclusive on both ends', () => {
    expect(dayRange('2026-06-01', '2026-06-03')).toEqual(['2026-06-01', '2026-06-02', '2026-06-03'])
  })
  it('returns empty for an inverted range', () => {
    expect(dayRange('2026-06-03', '2026-06-01')).toEqual([])
  })
})

describe('currentStreak (did)', () => {
  const totals = dayTotals([entry('2026-06-17'), entry('2026-06-18'), entry('2026-06-19')])
  it('counts consecutive done days ending today', () => {
    expect(currentStreak(totals, 'did', '2026-06-19', '2026-06-01')).toBe(3)
  })
  it('is zero when today is missing', () => {
    expect(currentStreak(totals, 'did', '2026-06-20', '2026-06-01')).toBe(0)
  })
})

describe('currentStreak (skipped)', () => {
  it('counts clean days, breaking on a logged day', () => {
    // Logged on the 17th; clean since.
    const totals = dayTotals([entry('2026-06-17')])
    expect(currentStreak(totals, 'skipped', '2026-06-19', '2026-06-01')).toBe(2)
    expect(currentStreak(totals, 'skipped', '2026-06-17', '2026-06-01')).toBe(0)
  })
})

describe('longestStreak', () => {
  it('finds the longest done run in range', () => {
    const totals = dayTotals([
      entry('2026-06-01'), entry('2026-06-02'),
      // gap on the 3rd
      entry('2026-06-04'), entry('2026-06-05'), entry('2026-06-06'),
    ])
    expect(longestStreak(totals, 'did', '2026-06-06', '2026-06-01')).toBe(3)
  })
  it('skipped: longest clean run is the gap days', () => {
    const totals = dayTotals([entry('2026-06-01'), entry('2026-06-05')])
    // Clean on 2,3,4 → run of 3.
    expect(longestStreak(totals, 'skipped', '2026-06-06', '2026-06-01')).toBe(3)
  })
})

describe('summarize', () => {
  it('aggregates totals, averages, and trailing windows', () => {
    const entries = [entry('2026-06-18', 2), entry('2026-06-19', 1), entry('2026-06-19', 1)]
    const s = summarize(entries, 'more', 'did', '2026-06-19', '2026-06-18')
    expect(s.total).toBe(4)
    expect(s.daysLogged).toBe(2)
    expect(s.avgPerLoggedDay).toBe(2)
    expect(s.last7).toBe(4)
    expect(s.currentStreak).toBe(2)
  })
})

describe('resolveRange', () => {
  const today = '2026-06-22'
  const since = '2026-01-10'
  const custom = { from: '2026-03-01', to: '2026-03-31' }

  it('week/month/year end today and span the right number of days back', () => {
    expect(resolveRange('week', today, since, custom)).toEqual({ start: '2026-06-16', end: today })
    expect(resolveRange('month', today, since, custom)).toEqual({ start: '2026-05-24', end: today })
    expect(resolveRange('year', today, since, custom)).toEqual({ start: '2025-06-23', end: today })
  })
  it('all starts at the tracker since-day', () => {
    expect(resolveRange('all', today, since, custom)).toEqual({ start: since, end: today })
  })
  it('custom uses the supplied from/to', () => {
    expect(resolveRange('custom', today, since, custom)).toEqual({ start: custom.from, end: custom.to })
  })
})

describe('chooseGranularity', () => {
  it('scales bar size with the span', () => {
    expect(chooseGranularity(7)).toBe('day')
    expect(chooseGranularity(30)).toBe('day')
    expect(chooseGranularity(90)).toBe('week')
    expect(chooseGranularity(365)).toBe('week')
    expect(chooseGranularity(800)).toBe('month')
  })
})

describe('buildBuckets', () => {
  const totals = dayTotals([
    entry('2026-06-01', 2), entry('2026-06-02', 3), entry('2026-06-10', 5),
  ])
  it('daily: one bucket per day with that day total', () => {
    const { granularity, buckets } = buildBuckets(totals, '2026-06-01', '2026-06-03')
    expect(granularity).toBe('day')
    expect(buckets.map((b) => b.value)).toEqual([2, 3, 0])
  })
  it('weekly: sums each 7-day chunk', () => {
    const { granularity, buckets } = buildBuckets(totals, '2026-06-01', '2026-07-20')
    expect(granularity).toBe('week')
    // First week (Jun 1–7) = 2+3, second week (Jun 8–14) includes Jun 10 = 5.
    expect(buckets[0].value).toBe(5)
    expect(buckets[1].value).toBe(5)
  })
  it('monthly: groups by calendar month over a long span', () => {
    const { granularity, buckets } = buildBuckets(totals, '2026-06-01', '2028-01-01')
    expect(granularity).toBe('month')
    const june = buckets.find((b) => b.key === '2026-06')
    expect(june?.value).toBe(10)
  })
  it('returns no buckets for an inverted range', () => {
    expect(buildBuckets(totals, '2026-06-03', '2026-06-01').buckets).toEqual([])
  })
})
