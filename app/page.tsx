'use client'

import { useEffect, useState } from 'react'
import { Plus, LogOut } from 'lucide-react'
import { listTrackers, listEntriesForDay, addEntry, removeLastEntry } from '@/lib/db'
import { todayKey } from '@/lib/date'
import { useUser, signOut } from '@/lib/useUser'
import type { Tracker } from '@/lib/types'
import TrackerCard from '@/components/TrackerCard'
import AddTrackerModal from '@/components/AddTrackerModal'
import SignInScreen from '@/components/SignInScreen'

export default function Dashboard() {
  const { user, loading: authLoading } = useUser()
  const [trackers, setTrackers] = useState<Tracker[]>([])
  const [totals, setTotals] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const today = todayKey()

  useEffect(() => {
    if (!user) return // wait for auth — RLS scopes the queries to this user
    let alive = true
    setLoading(true)
    ;(async () => {
      try {
        const [ts, entries] = await Promise.all([listTrackers(), listEntriesForDay(today)])
        if (!alive) return
        const map: Record<string, number> = {}
        for (const e of entries) map[e.tracker_id] = (map[e.tracker_id] ?? 0) + e.value
        setTrackers(ts)
        setTotals(map)
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : 'Could not load your trackers.')
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [today, user])

  // Auth gate: wait for the session, then show sign-in if logged out.
  if (authLoading) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-lg items-center justify-center px-4">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-300 border-t-indigo-600" />
      </main>
    )
  }
  if (!user) return <SignInScreen />

  async function log(tracker: Tracker, delta: number) {
    const prev = totals[tracker.id] ?? 0
    const next = Math.max(0, prev + delta)
    if (next === prev) return
    setBusyId(tracker.id)
    setTotals((m) => ({ ...m, [tracker.id]: next })) // optimistic
    try {
      if (delta > 0) await addEntry(tracker.id, today, 1)
      else await removeLastEntry(tracker.id, today)
    } catch {
      setTotals((m) => ({ ...m, [tracker.id]: prev })) // revert
      setError('Could not save that tap. Try again.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <main className="mx-auto min-h-dvh w-full max-w-lg px-4 pb-28 pt-6">
      <header className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tracker</h1>
          <p className="text-sm text-zinc-500">Tap to log. See your calendar and stats.</p>
        </div>
        <button
          onClick={signOut}
          title={`Signed in as ${user.email ?? ''} — sign out`}
          className="flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-500 hover:bg-zinc-50"
        >
          <LogOut size={14} /> Sign out
        </button>
      </header>

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-[68px] animate-pulse rounded-xl bg-zinc-200/70" />
          ))}
        </div>
      ) : error && trackers.length === 0 ? (
        <ErrorBox message={error} />
      ) : trackers.length === 0 ? (
        <EmptyState onAdd={() => setShowAdd(true)} />
      ) : (
        <div className="space-y-2">
          {trackers.map((t) => (
            <TrackerCard
              key={t.id}
              tracker={t}
              todayTotal={totals[t.id] ?? 0}
              busy={busyId === t.id}
              onLog={(d) => log(t, d)}
            />
          ))}
        </div>
      )}

      {error && trackers.length > 0 && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {/* Floating add button */}
      <button
        onClick={() => setShowAdd(true)}
        className="fixed bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-indigo-600 px-5 py-3 font-medium text-white shadow-lg shadow-indigo-600/30 hover:bg-indigo-700"
      >
        <Plus size={20} /> Add tracker
      </button>

      {showAdd && (
        <AddTrackerModal
          onClose={() => setShowAdd(false)}
          onCreated={(t) => {
            setTrackers((list) => [...list, t])
            setShowAdd(false)
          }}
        />
      )}
    </main>
  )
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="rounded-2xl border border-dashed border-zinc-300 bg-white/60 p-8 text-center">
      <div className="mb-2 text-4xl">📋</div>
      <h2 className="mb-1 font-semibold">Nothing tracked yet</h2>
      <p className="mb-4 text-sm text-zinc-500">
        Add your first tracker — a yes/no habit, or a daily count like drinks.
      </p>
      <button
        onClick={onAdd}
        className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-700"
      >
        <Plus size={18} /> Add tracker
      </button>
    </div>
  )
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
      <p className="font-medium">Something went wrong</p>
      <p className="mt-1">{message}</p>
      <p className="mt-2 text-red-500">
        If this is a fresh setup, make sure your Supabase env vars are set and the schema is applied.
      </p>
    </div>
  )
}
