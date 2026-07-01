'use client'

import { useState, useRef, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Minus, Plus, Check, ChevronRight, ChevronUp, ChevronDown, StickyNote, Clock,
  FolderInput, ListChecks, RotateCcw, CheckCheck, ExternalLink,
} from 'lucide-react'
import type { Tracker, TrackerStep } from '@/lib/types'
import { daysBetween } from '@/lib/date'
import { fmtNum, parseMeasure } from '@/lib/format'
import { seriesProgress } from '@/lib/stats'
import StepChecklist from './StepChecklist'

// One row on the dashboard. `todayTotal` is the tracker's logged value for
// today; `onLog` applies a delta (+1 / -1) with optimistic UI handled by the
// parent. `onSaveNote` persists today's free-text note for this tracker.
// `lastDay` is the most recent day this tracker was logged (for the "days since"
// hint); the move handlers reorder this row in the dashboard list.
export default function TrackerCard({
  tracker,
  todayTotal,
  note,
  lastDay,
  latestValue,
  today,
  busy,
  sections,
  steps,
  checkedStepIds,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  onLog,
  onSetValue,
  onAssignSection,
  onCheckNext,
  onToggleStep,
  onResetSteps,
  onCheckAll,
  onSaveNote,
}: {
  tracker: Tracker
  todayTotal: number
  note: string
  lastDay: string | null
  latestValue: number | null
  today: string
  busy: boolean
  sections: { id: string; title: string }[]
  steps: TrackerStep[]
  checkedStepIds: Set<string>
  canMoveUp: boolean
  canMoveDown: boolean
  onMoveUp: () => void
  onMoveDown: () => void
  onLog: (delta: number) => void
  onSetValue: (value: number) => void
  onAssignSection: (sectionId: string | null) => void
  onCheckNext: () => void
  onToggleStep: (stepId: string) => void
  onResetSteps: () => void
  onCheckAll: () => void
  onSaveNote: (text: string) => void | Promise<void>
}) {
  const router = useRouter()
  const done = todayTotal > 0
  const unit = tracker.unit?.trim()
  const isSeries = tracker.type === 'series'
  const progress = seriesProgress(steps, checkedStepIds)

  // Whole days since this tracker was last logged. Null when it was logged today
  // (todayTotal covers that) or never logged at all.
  const sinceDays = done || !lastDay ? null : daysBetween(lastDay, today)
  const statusText =
    tracker.type === 'yesno'
      ? done
        ? 'Done today'
        : 'Not yet today'
      : tracker.type === 'measure'
        ? latestValue != null
          ? `${fmtNum(latestValue)}${unit ? ' ' + unit : ''}`
          : 'No readings yet'
        : isSeries
          ? progress.total === 0
            ? 'No steps yet'
            : progress.complete
              ? 'All done today'
              : `Next: ${progress.next?.label ?? ''}`
          : `${todayTotal}${unit ? ' ' + unit : ''} today`

  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(note)
  const [expanded, setExpanded] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const longPress = useRef<ReturnType<typeof setTimeout> | null>(null)
  const didLongPress = useRef(false)

  function openEditor() {
    setDraft(note)
    setEditing(true)
  }
  function save() {
    onSaveNote(draft.trim())
    setEditing(false)
  }

  // Hold-menu (series only): right-click or ~500ms long-press opens it.
  function onContext(e: React.MouseEvent) {
    if (!isSeries) return
    e.preventDefault()
    setMenuOpen(true)
  }
  function touchStart() {
    if (!isSeries) return
    didLongPress.current = false
    longPress.current = setTimeout(() => {
      didLongPress.current = true
      setMenuOpen(true)
    }, 500)
  }
  function touchEnd(e: React.TouchEvent) {
    if (longPress.current) {
      clearTimeout(longPress.current)
      longPress.current = null
    }
    // If the long-press fired, swallow the synthetic click so it doesn't land
    // on the menu backdrop (which would immediately close the just-opened menu).
    if (didLongPress.current) {
      e.preventDefault()
      didLongPress.current = false
    }
  }
  function touchMove() {
    if (longPress.current) {
      clearTimeout(longPress.current)
      longPress.current = null
    }
  }

  const head = (
    <>
      <span
        className="flex h-11 w-11 flex-none items-center justify-center rounded-lg text-xl"
        style={{ background: tracker.color + '22' }}
      >
        {tracker.emoji}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{tracker.name}</span>
        {tracker.subtitle && (
          <span className="block truncate text-xs text-zinc-400">{tracker.subtitle}</span>
        )}
        <span className="flex items-center gap-1.5 text-xs text-zinc-500">
          <span className="truncate">{statusText}</span>
          {sinceDays != null && sinceDays >= 1 && (
            <span
              className="flex flex-none items-center gap-0.5 text-zinc-400"
              title={`Last logged ${sinceDays === 1 ? 'yesterday' : `${sinceDays} days ago`}`}
            >
              <Clock size={11} /> {sinceDays}d
            </span>
          )}
        </span>
      </span>
    </>
  )

  return (
    <div className="relative rounded-xl bg-white shadow-sm ring-1 ring-black/5">
      <div
        className="flex items-center gap-2 p-3"
        onContextMenu={onContext}
        onTouchStart={touchStart}
        onTouchEnd={touchEnd}
        onTouchMove={touchMove}
      >
        {/* Reorder handles — the active arrow hides on the first/last row */}
        <div className="-ml-1 flex flex-none flex-col">
          <button
            onClick={onMoveUp}
            disabled={!canMoveUp}
            aria-label={`Move ${tracker.name} up`}
            className="flex h-[22px] w-5 items-center justify-center rounded text-zinc-300 hover:bg-zinc-100 hover:text-zinc-600 disabled:pointer-events-none disabled:opacity-0"
          >
            <ChevronUp size={15} />
          </button>
          <button
            onClick={onMoveDown}
            disabled={!canMoveDown}
            aria-label={`Move ${tracker.name} down`}
            className="flex h-[22px] w-5 items-center justify-center rounded text-zinc-300 hover:bg-zinc-100 hover:text-zinc-600 disabled:pointer-events-none disabled:opacity-0"
          >
            <ChevronDown size={15} />
          </button>
        </div>

        {/* Series cards expand an inline checklist on tap; others link to detail */}
        {isSeries ? (
          <button
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="flex min-w-0 flex-1 items-center gap-3 text-left"
          >
            {head}
            <ChevronDown
              size={16}
              className={`flex-none text-zinc-300 transition-transform ${expanded ? 'rotate-180' : ''}`}
            />
          </button>
        ) : (
          <Link
            href={`/t/${tracker.id}`}
            className="flex min-w-0 flex-1 items-center gap-3"
            aria-label={`Open ${tracker.name}`}
          >
            {head}
            <ChevronRight size={16} className="flex-none text-zinc-300" />
          </Link>
        )}

        {/* Logging controls */}
        {tracker.type === 'yesno' ? (
          <button
            onClick={() => onLog(done ? -1 : 1)}
            disabled={busy}
            aria-pressed={done}
            aria-label={done ? 'Mark not done' : 'Mark done'}
            className={`flex h-11 w-11 flex-none items-center justify-center rounded-full transition disabled:opacity-50 ${
              done ? 'text-white' : 'bg-zinc-100 text-zinc-400 hover:bg-zinc-200'
            }`}
            style={done ? { background: tracker.color } : undefined}
          >
            <Check size={22} />
          </button>
        ) : tracker.type === 'measure' ? (
          <MeasureField
            unit={unit}
            placeholder={latestValue != null ? fmtNum(latestValue) : 'Log'}
            busy={busy}
            color={tracker.color}
            onSubmit={onSetValue}
          />
        ) : isSeries ? (
          <button
            onClick={onCheckNext}
            disabled={busy || progress.complete || progress.total === 0}
            aria-label={progress.complete ? 'All steps done' : `Check off ${progress.next?.label ?? 'next step'}`}
            className="flex h-11 flex-none items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-40"
            style={{ background: tracker.color }}
          >
            <Check size={18} />
            <span className="tabular-nums">
              {progress.done}/{progress.total}
            </span>
          </button>
        ) : (
          <div className="flex flex-none items-center gap-1">
            <button
              onClick={() => onLog(-1)}
              disabled={busy || todayTotal <= 0}
              aria-label="Subtract one"
              className="flex h-11 w-11 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 hover:bg-zinc-200 disabled:opacity-30"
            >
              <Minus size={18} />
            </button>
            <span className="w-7 text-center text-lg font-semibold tabular-nums">{todayTotal}</span>
            <button
              onClick={() => onLog(1)}
              disabled={busy}
              aria-label="Add one"
              className="flex h-11 w-11 items-center justify-center rounded-full text-white transition hover:opacity-90 disabled:opacity-50"
              style={{ background: tracker.color }}
            >
              <Plus size={22} />
            </button>
          </div>
        )}
      </div>

      {/* Series: inline checklist (expand on tap / via the hold-menu) */}
      {isSeries && expanded && (
        <div className="border-t border-zinc-100 px-2 py-2">
          <StepChecklist
            steps={steps}
            checkedIds={checkedStepIds}
            busy={busy}
            color={tracker.color}
            onToggle={onToggleStep}
          />
        </div>
      )}

      {/* Hold-menu (right-click / long-press on a series card) */}
      {menuOpen && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setMenuOpen(false)} />
          <div className="absolute right-2 top-12 z-30 w-48 overflow-hidden rounded-xl bg-white py-1 text-sm shadow-xl ring-1 ring-black/10">
            <MenuItem
              icon={<ListChecks size={15} />}
              label="Reveal checklist"
              onClick={() => {
                setExpanded(true)
                setMenuOpen(false)
              }}
            />
            <MenuItem
              icon={<RotateCcw size={15} />}
              label="Reset today’s checks"
              onClick={() => {
                onResetSteps()
                setMenuOpen(false)
              }}
            />
            <MenuItem
              icon={<CheckCheck size={15} />}
              label="Mark all done"
              onClick={() => {
                onCheckAll()
                setMenuOpen(false)
              }}
            />
            <MenuItem
              icon={<ExternalLink size={15} />}
              label="Open tracker page"
              onClick={() => {
                setMenuOpen(false)
                router.push(`/t/${tracker.id}`)
              }}
            />
          </div>
        </>
      )}

      {/* Section picker — only when sections exist */}
      {sections.length > 0 && (
        <div className="flex items-center gap-1.5 border-t border-zinc-100 px-3 py-1.5 text-xs text-zinc-400">
          <FolderInput size={13} className="flex-none" />
          <select
            value={tracker.section_id ?? ''}
            onChange={(e) => onAssignSection(e.target.value || null)}
            aria-label={`Section for ${tracker.name}`}
            className="-ml-0.5 cursor-pointer rounded bg-transparent py-0.5 pr-1 text-zinc-500 outline-none hover:text-zinc-800 focus:text-zinc-800"
          >
            <option value="">No section</option>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Today's note */}
      <div className="border-t border-zinc-100 px-3 py-2">
        {editing ? (
          <div>
            <textarea
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save()
                if (e.key === 'Escape') setEditing(false)
              }}
              rows={2}
              placeholder="How did today go?"
              className="w-full resize-none rounded-lg border border-zinc-300 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-500"
            />
            <div className="mt-1.5 flex items-center justify-end gap-2">
              <button
                onClick={() => setEditing(false)}
                className="rounded-lg px-2.5 py-1 text-xs font-medium text-zinc-500 hover:bg-zinc-100"
              >
                Cancel
              </button>
              <button
                onClick={save}
                className="rounded-lg px-2.5 py-1 text-xs font-medium text-white"
                style={{ background: tracker.color }}
              >
                Save
              </button>
            </div>
          </div>
        ) : note ? (
          <button
            onClick={openEditor}
            className="flex w-full items-start gap-1.5 text-left text-sm text-zinc-600 hover:text-zinc-900"
          >
            <StickyNote size={14} className="mt-0.5 flex-none text-zinc-400" />
            <span className="line-clamp-2">{note}</span>
          </button>
        ) : (
          <button
            onClick={openEditor}
            className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-indigo-600"
          >
            <StickyNote size={13} /> Add a note for today
          </button>
        )}
      </div>
    </div>
  )
}

function MenuItem({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-zinc-700 hover:bg-zinc-50"
    >
      <span className="flex-none text-zinc-400">{icon}</span>
      {label}
    </button>
  )
}

// Inline numeric entry for a 'measure' tracker: type a reading, Enter or the
// check button logs it (latest replaces). Rejects blank/zero/non-numeric.
function MeasureField({
  unit,
  placeholder,
  busy,
  color,
  onSubmit,
}: {
  unit?: string
  placeholder: string
  busy: boolean
  color: string
  onSubmit: (value: number) => void
}) {
  const [val, setVal] = useState('')
  function submit() {
    const n = parseMeasure(val)
    if (n === null) return
    onSubmit(n)
    setVal('')
  }
  return (
    <div className="flex flex-none items-center gap-1">
      <input
        type="number"
        inputMode="decimal"
        step="any"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && !busy && submit()}
        placeholder={placeholder}
        aria-label={`Log ${unit || 'value'}`}
        disabled={busy}
        className="w-16 rounded-lg border border-zinc-300 px-2 py-1.5 text-right text-sm tabular-nums outline-none focus:border-indigo-500"
      />
      <button
        onClick={submit}
        disabled={busy || !val.trim()}
        aria-label="Log value"
        className="flex h-11 w-11 flex-none items-center justify-center rounded-full text-white transition hover:opacity-90 disabled:opacity-30"
        style={{ background: color }}
      >
        <Check size={20} />
      </button>
    </div>
  )
}
