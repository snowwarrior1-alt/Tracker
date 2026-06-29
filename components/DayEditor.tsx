'use client'

import { useState } from 'react'
import { X, Minus, Plus, Check } from 'lucide-react'
import type { Tracker } from '@/lib/types'
import { dayLabel } from '@/lib/date'
import { fmtNum, parseMeasure } from '@/lib/format'

// Bottom-sheet editor for a single day: adjust the value (count), toggle done
// (yes/no), or set a reading (measure), plus edit a free-text note. Opens for
// any non-future day, so it doubles as the "fix up a past day" surface.
export default function DayEditor({
  tracker,
  day,
  total,
  note,
  busy,
  onAdjust,
  onSetDone,
  onSetValue,
  onSaveNote,
  onClose,
}: {
  tracker: Tracker
  day: string
  total: number
  note: string
  busy: boolean
  onAdjust: (delta: number) => void
  onSetDone: (done: boolean) => void
  onSetValue: (value: number) => void
  onSaveNote: (text: string) => Promise<void> | void
  onClose: () => void
}) {
  const [text, setText] = useState(note)
  const [savedNote, setSavedNote] = useState(note)
  const [savingNote, setSavingNote] = useState(false)
  const [mval, setMval] = useState('')
  const unit = tracker.unit?.trim()
  const done = total > 0
  const noteDirty = text.trim() !== savedNote.trim()

  function submitMeasure() {
    const n = parseMeasure(mval)
    if (n === null) return
    onSetValue(n)
    setMval('')
  }

  async function persistNote() {
    if (!noteDirty) return
    setSavingNote(true)
    try {
      await onSaveNote(text)
      setSavedNote(text)
    } finally {
      setSavingNote(false)
    }
  }

  async function close() {
    await persistNote()
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4"
      onClick={close}
    >
      <div
        className="flex w-full max-w-md flex-col rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-zinc-200 sm:hidden" />
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{dayLabel(day)}</h2>
          <button onClick={close} className="rounded-full p-1 text-zinc-400 hover:bg-zinc-100" aria-label="Close">
            <X size={20} />
          </button>
        </div>

        {/* Value editor */}
        {tracker.type === 'yesno' ? (
          <button
            onClick={() => onSetDone(!done)}
            disabled={busy}
            className="mb-5 flex w-full items-center justify-center gap-2 rounded-xl py-4 text-lg font-semibold text-white transition disabled:opacity-50"
            style={{ background: done ? tracker.color : '#a1a1aa' }}
          >
            <Check size={22} /> {done ? 'Done' : 'Mark done'}
          </button>
        ) : tracker.type === 'measure' ? (
          <div className="mb-5">
            <div className="mb-3 text-center">
              <div className="text-4xl font-bold tabular-nums">{done ? fmtNum(total) : '—'}</div>
              <div className="text-xs text-zinc-400">{done ? unit || 'reading' : 'no reading'}</div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                inputMode="decimal"
                step="any"
                value={mval}
                onChange={(e) => setMval(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !busy && submitMeasure()}
                placeholder={`${done ? 'Update' : 'Enter'} ${unit || 'value'}`}
                disabled={busy}
                className="min-w-0 flex-1 rounded-xl border border-zinc-300 px-3 py-2.5 text-center text-lg tabular-nums outline-none focus:border-indigo-500"
              />
              <button
                onClick={submitMeasure}
                disabled={busy || !mval.trim()}
                className="rounded-xl px-5 py-2.5 font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                style={{ background: tracker.color }}
              >
                Set
              </button>
            </div>
            {done && (
              <button
                onClick={() => onSetDone(false)}
                disabled={busy}
                className="mt-2 w-full text-center text-xs text-zinc-400 hover:text-red-600 disabled:opacity-50"
              >
                Clear this day’s reading
              </button>
            )}
          </div>
        ) : (
          <div className="mb-5 flex items-center justify-center gap-5">
            <button
              onClick={() => onAdjust(-1)}
              disabled={busy || total <= 0}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 text-zinc-600 hover:bg-zinc-200 disabled:opacity-30"
              aria-label="Subtract one"
            >
              <Minus size={24} />
            </button>
            <div className="text-center">
              <div className="text-4xl font-bold tabular-nums">{total}</div>
              {unit && <div className="text-xs text-zinc-400">{unit}</div>}
            </div>
            <button
              onClick={() => onAdjust(1)}
              disabled={busy}
              className="flex h-14 w-14 items-center justify-center rounded-full text-white hover:opacity-90 disabled:opacity-50"
              style={{ background: tracker.color }}
              aria-label="Add one"
            >
              <Plus size={28} />
            </button>
          </div>
        )}

        {/* Note */}
        <label className="mb-1 flex items-center justify-between text-sm font-medium text-zinc-600">
          <span>Note</span>
          {savingNote ? (
            <span className="text-xs font-normal text-zinc-400">Saving…</span>
          ) : noteDirty ? (
            <span className="text-xs font-normal text-amber-500">Unsaved</span>
          ) : savedNote.trim() ? (
            <span className="text-xs font-normal text-green-600">Saved</span>
          ) : null}
        </label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={persistNote}
          rows={3}
          maxLength={2000}
          placeholder="What happened this day? (optional)"
          className="w-full resize-y rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-indigo-500"
        />

        <button
          onClick={close}
          className="mt-4 w-full rounded-lg bg-indigo-600 py-2.5 font-medium text-white hover:bg-indigo-700"
        >
          Done
        </button>
      </div>
    </div>
  )
}
