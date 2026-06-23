'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Minus, Plus, Check, ChevronRight, StickyNote } from 'lucide-react'
import type { Tracker } from '@/lib/types'

// One row on the dashboard. `todayTotal` is the tracker's logged value for
// today; `onLog` applies a delta (+1 / -1) with optimistic UI handled by the
// parent. `onSaveNote` persists today's free-text note for this tracker.
export default function TrackerCard({
  tracker,
  todayTotal,
  note,
  busy,
  onLog,
  onSaveNote,
}: {
  tracker: Tracker
  todayTotal: number
  note: string
  busy: boolean
  onLog: (delta: number) => void
  onSaveNote: (text: string) => void | Promise<void>
}) {
  const done = todayTotal > 0
  const unit = tracker.unit?.trim()

  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(note)

  function openEditor() {
    setDraft(note)
    setEditing(true)
  }
  function save() {
    onSaveNote(draft.trim())
    setEditing(false)
  }

  return (
    <div className="rounded-xl bg-white shadow-sm ring-1 ring-black/5">
      <div className="flex items-center gap-3 p-3">
        <Link
          href={`/t/${tracker.id}`}
          className="flex min-w-0 flex-1 items-center gap-3"
          aria-label={`Open ${tracker.name}`}
        >
          <span
            className="flex h-11 w-11 flex-none items-center justify-center rounded-lg text-xl"
            style={{ background: tracker.color + '22' }}
          >
            {tracker.emoji}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">{tracker.name}</span>
            <span className="block text-xs text-zinc-500">
              {tracker.type === 'yesno'
                ? done
                  ? 'Done today'
                  : 'Not yet today'
                : `${todayTotal}${unit ? ' ' + unit : ''} today`}
            </span>
          </span>
          <ChevronRight size={16} className="flex-none text-zinc-300" />
        </Link>

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
