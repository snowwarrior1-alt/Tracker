'use client'

import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Trash2, Minus, Plus, Check } from 'lucide-react'
import {
  getTracker,
  listEntries,
  addEntry,
  removeLastEntry,
  deleteTracker,
} from '@/lib/db'
import { todayKey, toDayKey } from '@/lib/date'
import { dayTotals } from '@/lib/stats'
import { useUser } from '@/lib/useUser'
import type { Tracker, Entry } from '@/lib/types'
import CalendarView from '@/components/CalendarView'
import Analytics from '@/components/Analytics'
import SignInScreen from '@/components/SignInScreen'

export default function TrackerDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { user, loading: authLoading } = useUser()

  const [tracker, setTracker] = useState<Tracker | null>(null)
  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const today = todayKey()

  useEffect(() => {
    if (!user) return // wait for auth — RLS scopes the queries to this user
    let alive = true
    ;(async () => {
      try {
        const t = await getTracker(id)
        if (!alive) return
        if (!t) {
          setNotFound(true)
          return
        }
        const es = await listEntries(id)
        if (!alive) return
        setTracker(t)
        setEntries(es)
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : 'Could not load this tracker.')
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [id, user])

  const totals = dayTotals(entries)
  const todayTotal = totals[today] ?? 0

  async function log(delta: number) {
    if (!tracker) return
    if (delta < 0 && todayTotal <= 0) return
    setBusy(true)
    setError(null)
    try {
      if (delta > 0) {
        const e = await addEntry(tracker.id, today, 1)
        setEntries((list) => [...list, e])
      } else {
        await removeLastEntry(tracker.id, today)
        // Drop the most recent entry for today from local state.
        setEntries((list) => {
          let idx = -1
          for (let i = list.length - 1; i >= 0; i--) {
            if (list[i].day === today) {
              idx = i
              break
            }
          }
          if (idx === -1) return list
          return list.filter((_, i) => i !== idx)
        })
      }
    } catch {
      setError('Could not save that tap. Try again.')
    } finally {
      setBusy(false)
    }
  }

  async function onDelete() {
    if (!tracker) return
    setBusy(true)
    try {
      await deleteTracker(tracker.id)
      router.push('/')
    } catch {
      setError('Could not delete. Try again.')
      setBusy(false)
    }
  }

  if (authLoading) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-lg items-center justify-center px-4">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-300 border-t-indigo-600" />
      </main>
    )
  }
  if (!user) return <SignInScreen />

  if (loading) {
    return (
      <main className="mx-auto w-full max-w-lg px-4 py-6">
        <div className="h-8 w-32 animate-pulse rounded bg-zinc-200" />
        <div className="mt-4 h-40 animate-pulse rounded-2xl bg-zinc-200/70" />
      </main>
    )
  }

  if (notFound) {
    return (
      <main className="mx-auto w-full max-w-lg px-4 py-10 text-center">
        <p className="text-zinc-500">This tracker doesn’t exist.</p>
        <Link href="/" className="mt-3 inline-block text-indigo-600 underline">
          Back to dashboard
        </Link>
      </main>
    )
  }

  if (!tracker) {
    return (
      <main className="mx-auto w-full max-w-lg px-4 py-10">
        <p className="text-sm text-red-600">{error ?? 'Something went wrong.'}</p>
        <Link href="/" className="mt-3 inline-block text-indigo-600 underline">
          Back
        </Link>
      </main>
    )
  }

  const since = toDayKey(new Date(tracker.created_at))
  const unit = tracker.unit?.trim()
  const done = todayTotal > 0

  return (
    <main className="mx-auto w-full max-w-lg px-4 pb-16 pt-4">
      <div className="mb-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-800">
          <ArrowLeft size={16} /> Back
        </Link>
        <button
          onClick={() => setConfirmDelete(true)}
          className="flex items-center gap-1 text-sm text-zinc-400 hover:text-red-600"
        >
          <Trash2 size={16} /> Delete
        </button>
      </div>

      {/* Header */}
      <div className="mb-5 flex items-center gap-3">
        <span
          className="flex h-14 w-14 items-center justify-center rounded-xl text-2xl"
          style={{ background: tracker.color + '22' }}
        >
          {tracker.emoji}
        </span>
        <div>
          <h1 className="text-xl font-bold leading-tight">{tracker.name}</h1>
          <p className="text-sm text-zinc-500">
            {tracker.type === 'yesno' ? 'Yes / no habit' : `Counting${unit ? ' ' + unit : ''}`}
            {' · '}
            {tracker.goal_direction === 'more'
              ? 'more is better'
              : tracker.goal_direction === 'less'
                ? 'less is better'
                : 'neutral'}
          </p>
        </div>
      </div>

      {/* Today logger */}
      <div className="mb-6 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
        <div className="mb-3 text-sm font-medium text-zinc-600">Today</div>
        {tracker.type === 'yesno' ? (
          <button
            onClick={() => log(done ? -1 : 1)}
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-xl py-4 text-lg font-semibold text-white transition disabled:opacity-50"
            style={{ background: done ? tracker.color : '#a1a1aa' }}
          >
            <Check size={22} /> {done ? 'Done today' : 'Mark done'}
          </button>
        ) : (
          <div className="flex items-center justify-center gap-5">
            <button
              onClick={() => log(-1)}
              disabled={busy || todayTotal <= 0}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 text-zinc-600 hover:bg-zinc-200 disabled:opacity-30"
              aria-label="Subtract one"
            >
              <Minus size={24} />
            </button>
            <div className="text-center">
              <div className="text-4xl font-bold tabular-nums">{todayTotal}</div>
              {unit && <div className="text-xs text-zinc-400">{unit}</div>}
            </div>
            <button
              onClick={() => log(1)}
              disabled={busy}
              className="flex h-14 w-14 items-center justify-center rounded-full text-white hover:opacity-90 disabled:opacity-50"
              style={{ background: tracker.color }}
              aria-label="Add one"
            >
              <Plus size={28} />
            </button>
          </div>
        )}
        {error && <p className="mt-3 text-center text-sm text-red-600">{error}</p>}
      </div>

      <section className="mb-6">
        <h2 className="mb-2 text-sm font-semibold text-zinc-500">Calendar</h2>
        <CalendarView tracker={tracker} totals={totals} />
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-zinc-500">Analytics</h2>
        <Analytics tracker={tracker} entries={entries} today={today} since={since} />
      </section>

      {/* Delete confirm */}
      {confirmDelete && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4"
          onClick={() => setConfirmDelete(false)}
        >
          <div
            className="w-full max-w-sm rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-1 text-lg font-semibold">Delete “{tracker.name}”?</h3>
            <p className="mb-4 text-sm text-zinc-500">
              This removes the tracker and all {entries.length} logged{' '}
              {entries.length === 1 ? 'entry' : 'entries'}. This can’t be undone.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmDelete(false)}
                className="flex-1 rounded-lg border border-zinc-300 py-2 font-medium hover:bg-zinc-50"
              >
                Cancel
              </button>
              <button
                onClick={onDelete}
                disabled={busy}
                className="flex-1 rounded-lg bg-red-600 py-2 font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
