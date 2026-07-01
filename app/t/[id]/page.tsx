'use client'

import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Trash2, Minus, Plus, Check, StickyNote, Pencil, ChevronUp, ChevronDown, X } from 'lucide-react'
import {
  getTracker,
  listEntries,
  listNotes,
  listSteps,
  saveNote,
  addEntry,
  removeLastEntry,
  clearDay,
  setDayValue,
  uncheckStep,
  createStep,
  updateStep,
  deleteStep,
  deleteTracker,
  updateTracker,
} from '@/lib/db'
import { todayKey, toDayKey } from '@/lib/date'
import { reorderByIndex } from '@/lib/reorder'
import { dayTotals, defaultStreakSide } from '@/lib/stats'
import { useUser } from '@/lib/useUser'
import { EMOJIS } from '@/lib/constants'
import { fmtNum, parseMeasure } from '@/lib/format'
import type { Tracker, Entry, StreakSide, TrackerStep } from '@/lib/types'
import CalendarView from '@/components/CalendarView'
import Analytics from '@/components/Analytics'
import DayEditor from '@/components/DayEditor'
import StepChecklist from '@/components/StepChecklist'
import ResourcesSection from '@/components/ResourcesSection'
import SignInScreen from '@/components/SignInScreen'

export default function TrackerDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { user, loading: authLoading } = useUser()

  const [tracker, setTracker] = useState<Tracker | null>(null)
  const [entries, setEntries] = useState<Entry[]>([])
  const [steps, setSteps] = useState<TrackerStep[]>([])
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [editingEmoji, setEditingEmoji] = useState(false)
  const [editingSubtitle, setEditingSubtitle] = useState(false)
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
        const [es, ns, sts] = await Promise.all([listEntries(id), listNotes(id), listSteps(id)])
        if (!alive) return
        setTracker(t)
        setEntries(es)
        setNotes(ns)
        setSteps(sts)
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

  // Add/remove a tap on any day (count trackers). delta is +1 / -1.
  async function adjust(day: string, delta: number) {
    if (!tracker) return
    const dayTotal = totals[day] ?? 0
    if (delta < 0 && dayTotal <= 0) return
    setBusy(true)
    setError(null)
    try {
      if (delta > 0) {
        const e = await addEntry(tracker.id, day, 1)
        setEntries((list) => [...list, e])
      } else {
        await removeLastEntry(tracker.id, day)
        setEntries((list) => {
          let idx = -1
          for (let i = list.length - 1; i >= 0; i--) {
            if (list[i].day === day) {
              idx = i
              break
            }
          }
          return idx === -1 ? list : list.filter((_, i) => i !== idx)
        })
      }
    } catch {
      setError('Could not save that change. Try again.')
    } finally {
      setBusy(false)
    }
  }

  // Mark a yes/no day done or not (at most one entry per day).
  async function setDone(day: string, done: boolean) {
    if (!tracker) return
    const dayTotal = totals[day] ?? 0
    if (done === dayTotal > 0) return
    setBusy(true)
    setError(null)
    try {
      if (done) {
        const e = await addEntry(tracker.id, day, 1)
        setEntries((list) => [...list, e])
      } else {
        await clearDay(tracker.id, day)
        setEntries((list) => list.filter((e) => e.day !== day))
      }
    } catch {
      setError('Could not save that change. Try again.')
    } finally {
      setBusy(false)
    }
  }

  // Set a measure day to a single reading (latest replaces): swap out any
  // existing entries for that day locally and add the returned row.
  async function setMeasure(day: string, value: number) {
    if (!tracker || Number.isNaN(value) || value === 0) return
    setBusy(true)
    setError(null)
    try {
      const e = await setDayValue(tracker.id, day, value)
      setEntries((list) => [...list.filter((x) => x.day !== day), e])
    } catch {
      setError('Could not save that reading. Try again.')
    } finally {
      setBusy(false)
    }
  }

  // Which steps are checked on a given day (for series trackers).
  function checkedForDay(day: string): Set<string> {
    const set = new Set<string>()
    for (const e of entries) if (e.day === day && e.step_id) set.add(e.step_id)
    return set
  }

  // Toggle a series step for a day (check → add entry, uncheck → remove it).
  async function toggleStepOnDay(day: string, stepId: string) {
    if (!tracker) return
    const checked = entries.some((e) => e.day === day && e.step_id === stepId)
    setBusy(true)
    setError(null)
    try {
      if (checked) {
        await uncheckStep(tracker.id, day, stepId)
        setEntries((list) => list.filter((e) => !(e.day === day && e.step_id === stepId)))
      } else {
        const e = await addEntry(tracker.id, day, 1, stepId)
        setEntries((list) => [...list, e])
      }
    } catch {
      setError('Could not update that step. Try again.')
    } finally {
      setBusy(false)
    }
  }

  // ---- Step management (series) ----
  async function addStepTo(label: string) {
    if (!tracker) return
    const l = label.trim()
    if (!l) return
    try {
      const s = await createStep(tracker.id, l, steps.length)
      setSteps((list) => [...list, s])
    } catch {
      setError('Could not add the step. Try again.')
    }
  }

  async function renameStepById(stepId: string, label: string) {
    const before = steps
    setSteps((list) => list.map((s) => (s.id === stepId ? { ...s, label } : s)))
    try {
      await updateStep(stepId, { label })
    } catch {
      setSteps(before)
      setError('Could not rename the step. Try again.')
    }
  }

  // Delete a step; its day-checks (entries with this step_id) cascade away.
  async function removeStepById(stepId: string) {
    const beforeSteps = steps
    const beforeEntries = entries
    setSteps((list) => list.filter((s) => s.id !== stepId))
    setEntries((list) => list.filter((e) => e.step_id !== stepId))
    try {
      await deleteStep(stepId)
    } catch {
      setSteps(beforeSteps)
      setEntries(beforeEntries)
      setError('Could not delete the step. Try again.')
    }
  }

  async function moveStep(index: number, dir: -1 | 1) {
    const target = index + dir
    if (target < 0 || target >= steps.length) return
    const before = steps
    const { list, changed } = reorderByIndex(steps, index, target)
    setSteps(list)
    try {
      await Promise.all(changed.map((c) => updateStep(c.id, { sort_order: c.sort_order })))
    } catch {
      setSteps(before)
      setError('Could not reorder steps. Try again.')
    }
  }

  // Persist a day's note and reflect it locally (empty text removes it).
  async function persistNote(day: string, text: string) {
    if (!tracker) return
    const trimmed = text.trim()
    try {
      await saveNote(tracker.id, day, trimmed)
      setNotes((m) => {
        const next = { ...m }
        if (trimmed) next[day] = trimmed
        else delete next[day]
        return next
      })
    } catch {
      setError('Could not save the note. Try again.')
    }
  }

  // Save the tracker's subtitle/description; persist optimistically.
  async function changeSubtitle(next: string) {
    if (!tracker) return
    const value = next.trim() || null
    setEditingSubtitle(false)
    if ((tracker.subtitle ?? null) === value) return
    const prev = tracker
    setTracker({ ...tracker, subtitle: value })
    setError(null)
    try {
      await updateTracker(tracker.id, { subtitle: value })
    } catch {
      setTracker(prev)
      setError('Could not update the description. Try again.')
    }
  }

  // Change the tracker's icon; persist optimistically.
  async function changeEmoji(next: string) {
    if (!tracker) return
    setEditingEmoji(false)
    if (tracker.emoji === next) return
    const prev = tracker
    setTracker({ ...tracker, emoji: next })
    setError(null)
    try {
      await updateTracker(tracker.id, { emoji: next })
    } catch {
      setTracker(prev)
      setError('Could not update the icon. Try again.')
    }
  }

  // Flip which side the streak counts; persist optimistically.
  async function changeStreakSide(next: StreakSide) {
    if (!tracker || (tracker.streak_side ?? defaultStreakSide(tracker.goal_direction)) === next) return
    const prev = tracker
    setTracker({ ...tracker, streak_side: next })
    setError(null)
    try {
      await updateTracker(tracker.id, { streak_side: next })
    } catch {
      setTracker(prev)
      setError('Could not update the streak setting. Try again.')
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

  // Analytics start at the tracker's creation day, or earlier if days were
  // backfilled before it (so honest backfilling still counts toward streaks).
  const createdDay = toDayKey(new Date(tracker.created_at))
  const firstEntryDay = entries.reduce<string | null>(
    (m, e) => (m === null || e.day < m ? e.day : m),
    null,
  )
  const since = firstEntryDay && firstEntryDay < createdDay ? firstEntryDay : createdDay
  const unit = tracker.unit?.trim()
  const done = todayTotal > 0

  return (
    <main className="mx-auto w-full max-w-lg px-4 pb-16 pt-4">
      <div className="mb-4 flex items-center justify-between">
        <Link
          href="/"
          className="-my-1 flex items-center gap-1 py-2 pr-2 text-sm text-zinc-500 hover:text-zinc-800"
        >
          <ArrowLeft size={16} /> Back
        </Link>
        <button
          onClick={() => setConfirmDelete(true)}
          className="-my-1 flex items-center gap-1 py-2 pl-2 text-sm text-zinc-400 hover:text-red-600"
        >
          <Trash2 size={16} /> Delete
        </button>
      </div>

      {/* Header */}
      <div className="mb-5 flex items-center gap-3">
        <div className="relative">
          <button
            onClick={() => setEditingEmoji((v) => !v)}
            className="flex h-14 w-14 items-center justify-center rounded-xl text-2xl transition hover:brightness-95"
            style={{ background: tracker.color + '22' }}
            aria-label="Change icon"
          >
            {tracker.emoji}
            <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-white text-zinc-500 shadow ring-1 ring-black/5">
              <Pencil size={11} />
            </span>
          </button>
          {editingEmoji && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setEditingEmoji(false)} />
              <div className="absolute left-0 top-full z-20 mt-2 w-64 rounded-xl bg-white p-2 shadow-xl ring-1 ring-black/10">
                <div className="flex flex-wrap gap-1">
                  {EMOJIS.map((e) => (
                    <button
                      key={e}
                      onClick={() => changeEmoji(e)}
                      className={`flex h-9 w-9 items-center justify-center rounded-lg text-lg ${
                        tracker.emoji === e ? 'bg-indigo-100 ring-2 ring-indigo-500' : 'hover:bg-zinc-100'
                      }`}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold leading-tight">{tracker.name}</h1>
          {editingSubtitle ? (
            <input
              autoFocus
              defaultValue={tracker.subtitle ?? ''}
              maxLength={200}
              onBlur={(e) => changeSubtitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') changeSubtitle((e.target as HTMLInputElement).value)
                if (e.key === 'Escape') setEditingSubtitle(false)
              }}
              placeholder="Short description"
              className="mt-0.5 w-full rounded border border-zinc-300 px-1.5 py-0.5 text-sm outline-none focus:border-indigo-500"
            />
          ) : tracker.subtitle ? (
            <button
              onClick={() => setEditingSubtitle(true)}
              className="mt-0.5 block max-w-full truncate text-left text-sm text-zinc-500 hover:text-zinc-800"
              title="Edit description"
            >
              {tracker.subtitle}
            </button>
          ) : (
            <button
              onClick={() => setEditingSubtitle(true)}
              className="mt-0.5 block text-left text-xs text-zinc-400 hover:text-indigo-600"
            >
              + Add a description
            </button>
          )}
          <p className="text-sm text-zinc-500">
            {tracker.type === 'yesno'
              ? 'Yes / no habit'
              : tracker.type === 'measure'
                ? `Measuring${unit ? ' ' + unit : ''}`
                : `Counting${unit ? ' ' + unit : ''}`}
            {' · '}
            {tracker.type === 'measure'
              ? tracker.goal_direction === 'more'
                ? 'higher is better'
                : tracker.goal_direction === 'less'
                  ? 'lower is better'
                  : 'tracking'
              : tracker.goal_direction === 'more'
                ? 'more is better'
                : tracker.goal_direction === 'less'
                  ? 'less is better'
                  : 'neutral'}
          </p>
        </div>
      </div>

      {/* Today logger */}
      <div className="mb-6 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm font-medium text-zinc-600">Today</span>
          <button
            onClick={() => setSelectedDay(today)}
            className="flex items-center gap-1 text-xs text-zinc-400 hover:text-indigo-600"
          >
            <StickyNote size={13} /> {notes[today] ? 'Edit note' : 'Add note'}
          </button>
        </div>
        {tracker.type === 'yesno' ? (
          <button
            onClick={() => setDone(today, !done)}
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-xl py-4 text-lg font-semibold text-white transition disabled:opacity-50"
            style={{ background: done ? tracker.color : '#a1a1aa' }}
          >
            <Check size={22} /> {done ? 'Done today' : 'Mark done'}
          </button>
        ) : tracker.type === 'series' ? (
          <StepChecklist
            steps={steps}
            checkedIds={checkedForDay(today)}
            busy={busy}
            color={tracker.color}
            onToggle={(sid) => toggleStepOnDay(today, sid)}
          />
        ) : tracker.type === 'measure' ? (
          <MeasureToday
            todayValue={todayTotal > 0 ? todayTotal : null}
            unit={unit}
            busy={busy}
            color={tracker.color}
            onSet={(v) => setMeasure(today, v)}
          />
        ) : (
          <div className="flex items-center justify-center gap-5">
            <button
              onClick={() => adjust(today, -1)}
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
              onClick={() => adjust(today, 1)}
              disabled={busy}
              className="flex h-14 w-14 items-center justify-center rounded-full text-white hover:opacity-90 disabled:opacity-50"
              style={{ background: tracker.color }}
              aria-label="Add one"
            >
              <Plus size={28} />
            </button>
          </div>
        )}
        {notes[today] && (
          <p className="mt-3 rounded-lg bg-zinc-50 px-3 py-2 text-sm text-zinc-600">{notes[today]}</p>
        )}
        {error && <p className="mt-3 text-center text-sm text-red-600">{error}</p>}
      </div>

      {tracker.type === 'series' && (
        <StepsManager
          steps={steps}
          color={tracker.color}
          onAdd={addStepTo}
          onRename={renameStepById}
          onDelete={removeStepById}
          onMove={moveStep}
        />
      )}

      <ResourcesSection trackerId={tracker.id} color={tracker.color} />

      <section className="mb-6">
        <h2 className="mb-2 text-sm font-semibold text-zinc-500">Calendar</h2>
        <CalendarView
          tracker={tracker}
          totals={totals}
          notes={notes}
          selectedDay={selectedDay}
          onSelectDay={setSelectedDay}
        />
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-zinc-500">Analytics</h2>
          {/* Streak side is meaningless for a measure (a "clean" day isn't a 0 reading) */}
          {tracker.type !== 'measure' && (
            <div className="flex items-center gap-1.5 text-[11px] text-zinc-400">
              <span>Streak counts</span>
              <div className="flex overflow-hidden rounded-full border border-zinc-200">
                {(['did', 'skipped'] as StreakSide[]).map((sideOpt) => {
                  const active = (tracker.streak_side ?? defaultStreakSide(tracker.goal_direction)) === sideOpt
                  return (
                    <button
                      key={sideOpt}
                      onClick={() => changeStreakSide(sideOpt)}
                      className={`px-2.5 py-1 font-medium transition ${active ? 'text-white' : 'text-zinc-500 hover:bg-zinc-100'}`}
                      style={active ? { background: tracker.color } : undefined}
                    >
                      {sideOpt === 'did' ? 'Did it' : 'Skipped'}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
        <Analytics tracker={tracker} entries={entries} today={today} since={since} notes={notes} />
      </section>

      {/* Per-day editor (opened by tapping a calendar day or "Add note") */}
      {selectedDay && (
        <DayEditor
          tracker={tracker}
          day={selectedDay}
          total={totals[selectedDay] ?? 0}
          note={notes[selectedDay] ?? ''}
          busy={busy}
          onAdjust={(delta) => adjust(selectedDay, delta)}
          onSetDone={(d) => setDone(selectedDay, d)}
          onSetValue={(v) => setMeasure(selectedDay, v)}
          steps={steps}
          checkedStepIds={checkedForDay(selectedDay)}
          onToggleStep={(sid) => toggleStepOnDay(selectedDay, sid)}
          onSaveNote={(text) => persistNote(selectedDay, text)}
          onClose={() => setSelectedDay(null)}
        />
      )}

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

// Today's logger for a measure tracker: shows today's reading (or —) and a
// free-form field to set/update it (latest replaces). Rejects blank/zero/NaN.
function MeasureToday({
  todayValue,
  unit,
  busy,
  color,
  onSet,
}: {
  todayValue: number | null
  unit?: string
  busy: boolean
  color: string
  onSet: (value: number) => void
}) {
  const [val, setVal] = useState('')
  function submit() {
    const n = parseMeasure(val)
    if (n === null) return
    onSet(n)
    setVal('')
  }
  return (
    <div>
      <div className="mb-3 text-center">
        <div className="text-4xl font-bold tabular-nums">{todayValue != null ? fmtNum(todayValue) : '—'}</div>
        <div className="text-xs text-zinc-400">
          {todayValue != null ? unit || 'today' : 'no reading today'}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="number"
          inputMode="decimal"
          step="any"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !busy && submit()}
          placeholder={`${todayValue != null ? 'Update' : 'Enter'} ${unit || 'value'}`}
          disabled={busy}
          className="min-w-0 flex-1 rounded-xl border border-zinc-300 px-3 py-3 text-center text-lg tabular-nums outline-none focus:border-indigo-500"
        />
        <button
          onClick={submit}
          disabled={busy || !val.trim()}
          className="rounded-xl px-5 py-3 font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
          style={{ background: color }}
        >
          Log
        </button>
      </div>
    </div>
  )
}

// Define/edit a series tracker's steps: add, rename (tap), delete, reorder.
function StepsManager({
  steps,
  color,
  onAdd,
  onRename,
  onDelete,
  onMove,
}: {
  steps: TrackerStep[]
  color: string
  onAdd: (label: string) => void
  onRename: (id: string, label: string) => void
  onDelete: (id: string) => void
  onMove: (index: number, dir: -1 | 1) => void
}) {
  const [newLabel, setNewLabel] = useState('')
  function add() {
    if (!newLabel.trim()) return
    onAdd(newLabel)
    setNewLabel('')
  }
  return (
    <section className="mb-6">
      <h2 className="mb-2 text-sm font-semibold text-zinc-500">Steps</h2>
      <div className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-black/5">
        <ul className="space-y-0.5">
          {steps.map((s, i) => (
            <StepRow
              key={s.id}
              step={s}
              canUp={i > 0}
              canDown={i < steps.length - 1}
              onRename={(l) => onRename(s.id, l)}
              onDelete={() => onDelete(s.id)}
              onUp={() => onMove(i, -1)}
              onDown={() => onMove(i, 1)}
            />
          ))}
          {steps.length === 0 && <li className="px-1 py-1 text-xs text-zinc-400">No steps yet.</li>}
        </ul>
        <div className="mt-2 flex items-center gap-2">
          <input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
            maxLength={120}
            placeholder="Add a step…"
            className="min-w-0 flex-1 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm outline-none focus:border-indigo-500"
          />
          <button
            onClick={add}
            disabled={!newLabel.trim()}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            style={{ background: color }}
          >
            Add
          </button>
        </div>
      </div>
    </section>
  )
}

function StepRow({
  step,
  canUp,
  canDown,
  onRename,
  onDelete,
  onUp,
  onDown,
}: {
  step: TrackerStep
  canUp: boolean
  canDown: boolean
  onRename: (label: string) => void
  onDelete: () => void
  onUp: () => void
  onDown: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(step.label)
  function save() {
    const l = draft.trim()
    if (l && l !== step.label) onRename(l)
    else setDraft(step.label)
    setEditing(false)
  }
  return (
    <li className="flex items-center gap-1.5">
      <div className="flex flex-none flex-col text-zinc-300">
        <button
          onClick={onUp}
          disabled={!canUp}
          aria-label="Move step up"
          className="flex h-[18px] w-5 items-center justify-center rounded hover:bg-zinc-100 hover:text-zinc-600 disabled:pointer-events-none disabled:opacity-0"
        >
          <ChevronUp size={13} />
        </button>
        <button
          onClick={onDown}
          disabled={!canDown}
          aria-label="Move step down"
          className="flex h-[18px] w-5 items-center justify-center rounded hover:bg-zinc-100 hover:text-zinc-600 disabled:pointer-events-none disabled:opacity-0"
        >
          <ChevronDown size={13} />
        </button>
      </div>
      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save()
            if (e.key === 'Escape') {
              setDraft(step.label)
              setEditing(false)
            }
          }}
          onBlur={save}
          maxLength={120}
          className="min-w-0 flex-1 rounded border border-zinc-300 px-2 py-1 text-sm outline-none focus:border-indigo-500"
        />
      ) : (
        <button
          onClick={() => {
            setDraft(step.label)
            setEditing(true)
          }}
          className="min-w-0 flex-1 truncate py-1 text-left text-sm text-zinc-700 hover:text-zinc-900"
        >
          {step.label}
        </button>
      )}
      <button
        onClick={onDelete}
        aria-label={`Delete step ${step.label}`}
        className="flex-none rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-red-600"
      >
        <X size={14} />
      </button>
    </li>
  )
}
