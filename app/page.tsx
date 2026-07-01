'use client'

import { useEffect, useState } from 'react'
import { Plus, LogOut } from 'lucide-react'
import {
  listTrackers,
  listEntriesForDay,
  listNotesForDay,
  listLatestEntries,
  listSections,
  listAllSteps,
  addEntry,
  removeLastEntry,
  uncheckStep,
  clearDay,
  saveNote,
  setDayValue,
  updateTracker,
  createSection,
  updateSection,
  deleteSection,
  type LatestEntry,
} from '@/lib/db'
import { todayKey } from '@/lib/date'
import { reorderByIndex } from '@/lib/reorder'
import { useUser, signOut } from '@/lib/useUser'
import type { Tracker, Section, TrackerStep } from '@/lib/types'

const NO_STEPS_CHECKED: Set<string> = new Set()
import TrackerCard from '@/components/TrackerCard'
import SectionHeader from '@/components/SectionHeader'
import AddTrackerModal from '@/components/AddTrackerModal'
import SignInScreen from '@/components/SignInScreen'

export default function Dashboard() {
  const { user, loading: authLoading } = useUser()
  const [trackers, setTrackers] = useState<Tracker[]>([])
  const [totals, setTotals] = useState<Record<string, number>>({})
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [latest, setLatest] = useState<Record<string, LatestEntry>>({})
  const [sections, setSections] = useState<Section[]>([])
  const [stepsByTracker, setStepsByTracker] = useState<Record<string, TrackerStep[]>>({})
  const [checkedToday, setCheckedToday] = useState<Record<string, Set<string>>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [addingSection, setAddingSection] = useState(false)
  const [newSectionTitle, setNewSectionTitle] = useState('')

  const today = todayKey()

  useEffect(() => {
    if (!user) return // wait for auth — RLS scopes the queries to this user
    let alive = true
    ;(async () => {
      setLoading(true)
      try {
        const [ts, entries, ns, last, secs, allSteps] = await Promise.all([
          listTrackers(),
          listEntriesForDay(today),
          listNotesForDay(today),
          listLatestEntries(),
          listSections(),
          listAllSteps(),
        ])
        if (!alive) return
        const map: Record<string, number> = {}
        const checked: Record<string, Set<string>> = {}
        for (const e of entries) {
          map[e.tracker_id] = (map[e.tracker_id] ?? 0) + e.value
          if (e.step_id) (checked[e.tracker_id] ??= new Set()).add(e.step_id)
        }
        const byTracker: Record<string, TrackerStep[]> = {}
        for (const st of allSteps) (byTracker[st.tracker_id] ??= []).push(st)
        setTrackers(ts)
        setTotals(map)
        setNotes(ns)
        setLatest(last)
        setSections(secs)
        setStepsByTracker(byTracker)
        setCheckedToday(checked)
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

  // Set today's reading for a measure tracker (latest replaces), optimistically.
  async function setValue(tracker: Tracker, value: number) {
    const prevTotal = totals[tracker.id] ?? 0
    const prevLatest = latest[tracker.id]
    setBusyId(tracker.id)
    setTotals((m) => ({ ...m, [tracker.id]: value }))
    setLatest((m) => ({ ...m, [tracker.id]: { day: today, value } }))
    try {
      await setDayValue(tracker.id, today, value)
    } catch {
      setTotals((m) => ({ ...m, [tracker.id]: prevTotal }))
      setLatest((m) => {
        const n = { ...m }
        if (prevLatest) n[tracker.id] = prevLatest
        else delete n[tracker.id]
        return n
      })
      setError('Could not save that reading. Try again.')
    } finally {
      setBusyId(null)
    }
  }

  // Save (or clear) today's note for a tracker, optimistically.
  async function saveNoteFor(tracker: Tracker, text: string) {
    const prev = notes[tracker.id] ?? ''
    setNotes((m) => {
      const n = { ...m }
      if (text) n[tracker.id] = text
      else delete n[tracker.id]
      return n
    })
    try {
      await saveNote(tracker.id, today, text)
    } catch {
      setNotes((m) => {
        const n = { ...m }
        if (prev) n[tracker.id] = prev
        else delete n[tracker.id]
        return n
      })
      setError('Could not save the note. Try again.')
    }
  }

  // Swap two items in an ordered list, renumber sort_order = position, and
  // persist the rows that moved (optimistic; reverts on failure). Shared by
  // tracker and section reordering.
  async function reorderSwap<T extends { id: string; sort_order: number }>(
    list: T[],
    ai: number,
    bi: number,
    setList: (next: T[]) => void,
    persist: (id: string, sortOrder: number) => Promise<unknown>,
    errorMsg: string,
  ) {
    const { list: next, changed } = reorderByIndex(list, ai, bi)
    setList(next)
    try {
      await Promise.all(changed.map((c) => persist(c.id, c.sort_order)))
    } catch {
      setList(list)
      setError(errorMsg)
    }
  }

  // Move a tracker up/down within its own section group (swaps with the
  // neighbour in the same group; the global array stays in display order).
  async function moveTracker(t: Tracker, dir: -1 | 1) {
    const group = trackers.filter((x) => x.section_id === t.section_id)
    const gi = group.findIndex((x) => x.id === t.id)
    const mate = group[gi + dir]
    if (!mate) return
    const ai = trackers.findIndex((x) => x.id === t.id)
    const bi = trackers.findIndex((x) => x.id === mate.id)
    await reorderSwap(
      trackers,
      ai,
      bi,
      setTrackers,
      (id, sort_order) => updateTracker(id, { sort_order }),
      'Could not save the new order. Try again.',
    )
  }

  // Assign a tracker to a section (or null to ungroup), optimistically.
  async function assignSection(t: Tracker, sectionId: string | null) {
    if (t.section_id === sectionId) return
    const before = trackers
    setTrackers((list) => list.map((x) => (x.id === t.id ? { ...x, section_id: sectionId } : x)))
    try {
      await updateTracker(t.id, { section_id: sectionId })
    } catch {
      setTrackers(before)
      setError('Could not move that tracker. Try again.')
    }
  }

  async function addSection(title: string) {
    const t = title.trim()
    if (!t) return
    try {
      const s = await createSection(t, sections.length)
      setSections((list) => [...list, s])
    } catch {
      setError('Could not add the section. Try again.')
    }
  }

  async function renameSection(id: string, title: string) {
    const before = sections
    setSections((list) => list.map((s) => (s.id === id ? { ...s, title } : s)))
    try {
      await updateSection(id, { title })
    } catch {
      setSections(before)
      setError('Could not rename the section. Try again.')
    }
  }

  async function toggleCollapse(s: Section) {
    const before = sections
    setSections((list) => list.map((x) => (x.id === s.id ? { ...x, collapsed: !x.collapsed } : x)))
    try {
      await updateSection(s.id, { collapsed: !s.collapsed })
    } catch {
      setSections(before)
      setError('Could not update the section. Try again.')
    }
  }

  // Delete a section; its trackers fall back to ungrouped (locally + via FK).
  async function removeSection(id: string) {
    const beforeS = sections
    const beforeT = trackers
    setSections((list) => list.filter((s) => s.id !== id))
    setTrackers((list) => list.map((t) => (t.section_id === id ? { ...t, section_id: null } : t)))
    try {
      await deleteSection(id)
    } catch {
      setSections(beforeS)
      setTrackers(beforeT)
      setError('Could not delete the section. Try again.')
    }
  }

  async function moveSection(index: number, dir: -1 | 1) {
    const target = index + dir
    if (target < 0 || target >= sections.length) return
    await reorderSwap(
      sections,
      index,
      target,
      setSections,
      (id, sort_order) => updateSection(id, { sort_order }),
      'Could not reorder sections. Try again.',
    )
  }

  // ---- Series checklist handlers (optimistic) ----
  function setChecked(trackerId: string, mutate: (s: Set<string>) => void) {
    setCheckedToday((m) => {
      const next = new Set(m[trackerId] ?? [])
      mutate(next)
      return { ...m, [trackerId]: next }
    })
  }

  async function checkStep(t: Tracker, stepId: string) {
    if ((checkedToday[t.id] ?? NO_STEPS_CHECKED).has(stepId)) return
    setBusyId(t.id)
    setChecked(t.id, (s) => s.add(stepId))
    setTotals((m) => ({ ...m, [t.id]: (m[t.id] ?? 0) + 1 }))
    try {
      await addEntry(t.id, today, 1, stepId)
    } catch {
      setChecked(t.id, (s) => s.delete(stepId))
      setTotals((m) => ({ ...m, [t.id]: Math.max(0, (m[t.id] ?? 0) - 1) }))
      setError('Could not check that off. Try again.')
    } finally {
      setBusyId(null)
    }
  }

  async function uncheckStepFor(t: Tracker, stepId: string) {
    if (!(checkedToday[t.id] ?? NO_STEPS_CHECKED).has(stepId)) return
    setBusyId(t.id)
    setChecked(t.id, (s) => s.delete(stepId))
    setTotals((m) => ({ ...m, [t.id]: Math.max(0, (m[t.id] ?? 0) - 1) }))
    try {
      await uncheckStep(t.id, today, stepId)
    } catch {
      setChecked(t.id, (s) => s.add(stepId))
      setTotals((m) => ({ ...m, [t.id]: (m[t.id] ?? 0) + 1 }))
      setError('Could not update that step. Try again.')
    } finally {
      setBusyId(null)
    }
  }

  function toggleStep(t: Tracker, stepId: string) {
    return (checkedToday[t.id] ?? NO_STEPS_CHECKED).has(stepId)
      ? uncheckStepFor(t, stepId)
      : checkStep(t, stepId)
  }

  function checkNext(t: Tracker) {
    const checked = checkedToday[t.id] ?? NO_STEPS_CHECKED
    const next = (stepsByTracker[t.id] ?? []).find((s) => !checked.has(s.id))
    if (next) return checkStep(t, next.id)
  }

  async function resetSteps(t: Tracker) {
    const before = checkedToday[t.id] ?? NO_STEPS_CHECKED
    if (before.size === 0) return
    const prevTotal = totals[t.id] ?? 0
    setBusyId(t.id)
    setCheckedToday((m) => ({ ...m, [t.id]: new Set() }))
    setTotals((m) => ({ ...m, [t.id]: 0 }))
    try {
      await clearDay(t.id, today)
    } catch {
      setCheckedToday((m) => ({ ...m, [t.id]: new Set(before) }))
      setTotals((m) => ({ ...m, [t.id]: prevTotal }))
      setError('Could not reset. Try again.')
    } finally {
      setBusyId(null)
    }
  }

  async function checkAll(t: Tracker) {
    const checked = checkedToday[t.id] ?? NO_STEPS_CHECKED
    const steps = stepsByTracker[t.id] ?? []
    const remaining = steps.filter((s) => !checked.has(s.id))
    if (remaining.length === 0) return
    const before = new Set(checked)
    setBusyId(t.id)
    setChecked(t.id, (s) => remaining.forEach((r) => s.add(r.id)))
    setTotals((m) => ({ ...m, [t.id]: steps.length }))
    try {
      await Promise.all(remaining.map((r) => addEntry(t.id, today, 1, r.id)))
    } catch {
      setCheckedToday((m) => ({ ...m, [t.id]: before }))
      setTotals((m) => ({ ...m, [t.id]: before.size }))
      setError('Could not complete all steps. Try again.')
    } finally {
      setBusyId(null)
    }
  }

  // One dashboard card; canMove* are relative to the tracker's own group.
  function renderCard(t: Tracker, group: Tracker[], gi: number) {
    return (
      <TrackerCard
        key={t.id}
        tracker={t}
        todayTotal={totals[t.id] ?? 0}
        note={notes[t.id] ?? ''}
        lastDay={latest[t.id]?.day ?? null}
        latestValue={latest[t.id]?.value ?? null}
        today={today}
        busy={busyId === t.id}
        sections={sections}
        steps={stepsByTracker[t.id] ?? []}
        checkedStepIds={checkedToday[t.id] ?? NO_STEPS_CHECKED}
        canMoveUp={gi > 0}
        canMoveDown={gi < group.length - 1}
        onMoveUp={() => moveTracker(t, -1)}
        onMoveDown={() => moveTracker(t, 1)}
        onLog={(d) => log(t, d)}
        onSetValue={(v) => setValue(t, v)}
        onAssignSection={(sid) => assignSection(t, sid)}
        onCheckNext={() => checkNext(t)}
        onToggleStep={(sid) => toggleStep(t, sid)}
        onResetSteps={() => resetSteps(t)}
        onCheckAll={() => checkAll(t)}
        onSaveNote={(text) => saveNoteFor(t, text)}
      />
    )
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
        <div>
          {/* Ungrouped trackers, shown first with no header. A tracker whose
              section_id doesn't resolve to a loaded section counts as ungrouped
              so it can never silently disappear from the dashboard. */}
          {(() => {
            const sectionIds = new Set(sections.map((s) => s.id))
            const ungrouped = trackers.filter((t) => !t.section_id || !sectionIds.has(t.section_id))
            return ungrouped.length > 0 ? (
              <div className="space-y-2">{ungrouped.map((t, i) => renderCard(t, ungrouped, i))}</div>
            ) : null
          })()}

          {/* Sections */}
          {sections.map((section, si) => {
            const items = trackers.filter((t) => t.section_id === section.id)
            return (
              <div key={section.id}>
                <SectionHeader
                  section={section}
                  count={items.length}
                  canMoveUp={si > 0}
                  canMoveDown={si < sections.length - 1}
                  onToggleCollapse={() => toggleCollapse(section)}
                  onRename={(title) => renameSection(section.id, title)}
                  onDelete={() => removeSection(section.id)}
                  onMoveUp={() => moveSection(si, -1)}
                  onMoveDown={() => moveSection(si, 1)}
                />
                {!section.collapsed &&
                  (items.length > 0 ? (
                    <div className="space-y-2">{items.map((t, i) => renderCard(t, items, i))}</div>
                  ) : (
                    <p className="px-1 pb-1 text-xs text-zinc-400">
                      Empty — set a tracker’s section to “{section.title}” to add it here.
                    </p>
                  ))}
              </div>
            )
          })}

          {/* Add section */}
          {addingSection ? (
            <div className="mt-5 flex items-center gap-2">
              <input
                autoFocus
                value={newSectionTitle}
                onChange={(e) => setNewSectionTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newSectionTitle.trim()) {
                    addSection(newSectionTitle)
                    setNewSectionTitle('')
                    setAddingSection(false)
                  }
                  if (e.key === 'Escape') {
                    setNewSectionTitle('')
                    setAddingSection(false)
                  }
                }}
                maxLength={80}
                placeholder="Section name (e.g. Health)"
                className="min-w-0 flex-1 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm outline-none focus:border-indigo-500"
              />
              <button
                onClick={() => {
                  addSection(newSectionTitle)
                  setNewSectionTitle('')
                  setAddingSection(false)
                }}
                disabled={!newSectionTitle.trim()}
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                Add
              </button>
              <button
                onClick={() => {
                  setNewSectionTitle('')
                  setAddingSection(false)
                }}
                className="rounded-lg px-2 py-1.5 text-sm text-zinc-500 hover:bg-zinc-100"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setAddingSection(true)}
              className="mt-5 text-xs font-medium text-zinc-400 hover:text-indigo-600"
            >
              + Add section
            </button>
          )}
        </div>
      )}

      {error && trackers.length > 0 && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {/* Floating add button */}
      <button
        onClick={() => setShowAdd(true)}
        style={{ bottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}
        className="fixed left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-indigo-600 px-5 py-3 font-medium text-white shadow-lg shadow-indigo-600/30 hover:bg-indigo-700"
      >
        <Plus size={20} /> Add tracker
      </button>

      {showAdd && (
        <AddTrackerModal
          onClose={() => setShowAdd(false)}
          onCreated={(t, newSteps) => {
            setTrackers((list) => [...list, t])
            if (newSteps.length > 0) setStepsByTracker((m) => ({ ...m, [t.id]: newSteps }))
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
