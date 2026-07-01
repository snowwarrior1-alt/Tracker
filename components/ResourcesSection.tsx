'use client'

import { useEffect, useRef, useState } from 'react'
import { Link2, StickyNote, Trash2, ExternalLink, Pencil, X, Upload, FileText } from 'lucide-react'
import {
  listResources,
  addResource,
  updateResource,
  deleteResource,
  uploadResourceFile,
  signedUrlForFile,
  removeResourceFile,
} from '@/lib/db'
import { normalizeUrl, hostLabel, safeHref } from '@/lib/url'
import type { TrackerResource, ResourceKind } from '@/lib/types'

// Client-side guards mirroring the bucket config (docs + images, 10 MB).
const MAX_FILE_BYTES = 10 * 1024 * 1024
const ALLOWED_EXT = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'pdf', 'txt', 'doc', 'docx']
const FILE_ACCEPT = '.png,.jpg,.jpeg,.gif,.webp,.pdf,.txt,.doc,.docx,image/*,application/pdf'

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

// Reference material attached to a tracker: titled links and free-text notes
// (distinct from per-day notes). Self-loads on mount; add / edit / delete in
// place. Links are normalized to safe http(s) and opened in a new tab.
export default function ResourcesSection({ trackerId, color }: { trackerId: string; color: string }) {
  const [resources, setResources] = useState<TrackerResource[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState<ResourceKind | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const r = await listResources(trackerId)
        if (alive) setResources(r)
      } catch {
        if (alive) setError('Could not load resources.')
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [trackerId])

  async function create(kind: ResourceKind, fields: { title: string | null; url?: string; body?: string }) {
    const created = await addResource({ tracker_id: trackerId, kind, ...fields })
    setResources((list) => [...list, created])
    setAdding(null)
  }

  async function saveEdit(id: string, fields: { title: string | null; url?: string; body?: string }) {
    const updated = await updateResource(id, fields)
    setResources((list) => list.map((r) => (r.id === id ? updated : r)))
    setEditing(null)
  }

  // Validate + upload a file, then record it as a 'file' resource.
  async function uploadFile(file: File) {
    setError(null)
    const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
    if (!ALLOWED_EXT.includes(ext)) {
      setError('That file type isn’t allowed — docs & images only.')
      return
    }
    if (file.size > MAX_FILE_BYTES) {
      setError('That file is too big (max 10 MB).')
      return
    }
    setUploading(true)
    try {
      const meta = await uploadResourceFile(trackerId, file)
      // File name lives in file_name; no separate title needed.
      const created = await addResource({ tracker_id: trackerId, kind: 'file', ...meta })
      setResources((list) => [...list, created])
    } catch {
      setError('Could not upload that file. Try again.')
    } finally {
      setUploading(false)
    }
  }

  async function remove(id: string) {
    const target = resources.find((r) => r.id === id)
    const prev = resources
    setResources((list) => list.filter((r) => r.id !== id)) // optimistic
    setConfirmDelete(null)
    try {
      // Best-effort: drop the Storage object first, then the row.
      if (target?.kind === 'file' && target.file_path) {
        await removeResourceFile(target.file_path).catch(() => {})
      }
      await deleteResource(id)
    } catch {
      setResources(prev)
      setError('Could not delete that. Try again.')
    }
  }

  return (
    <section className="mb-6">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-500">Resources</h2>
        {!adding && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                setAdding('link')
                setEditing(null)
              }}
              className="flex items-center gap-1 rounded-full border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-500 hover:bg-zinc-50"
            >
              <Link2 size={13} /> Link
            </button>
            <button
              onClick={() => {
                setAdding('note')
                setEditing(null)
              }}
              className="flex items-center gap-1 rounded-full border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-500 hover:bg-zinc-50"
            >
              <StickyNote size={13} /> Note
            </button>
            <button
              onClick={() => fileInput.current?.click()}
              disabled={uploading}
              className="flex items-center gap-1 rounded-full border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-500 hover:bg-zinc-50 disabled:opacity-50"
            >
              <Upload size={13} /> {uploading ? 'Uploading…' : 'File'}
            </button>
          </div>
        )}
      </div>

      <input
        ref={fileInput}
        type="file"
        accept={FILE_ACCEPT}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) uploadFile(f)
          e.target.value = '' // allow re-selecting the same file
        }}
      />

      <div className="space-y-2">
        {adding && (
          <ResourceForm
            kind={adding}
            color={color}
            onCancel={() => setAdding(null)}
            onSubmit={(fields) => create(adding, fields)}
          />
        )}

        {resources.map((r) =>
          editing === r.id ? (
            <ResourceForm
              key={r.id}
              kind={r.kind}
              color={color}
              initial={r}
              onCancel={() => setEditing(null)}
              onSubmit={(fields) => saveEdit(r.id, fields)}
            />
          ) : (
            <ResourceRow
              key={r.id}
              resource={r}
              confirming={confirmDelete === r.id}
              onEdit={() => {
                setEditing(r.id)
                setAdding(null)
              }}
              onAskDelete={() => setConfirmDelete(r.id)}
              onCancelDelete={() => setConfirmDelete(null)}
              onConfirmDelete={() => remove(r.id)}
            />
          ),
        )}

        {!loading && resources.length === 0 && !adding && (
          <p className="rounded-xl border border-dashed border-zinc-200 px-3 py-3 text-center text-xs text-zinc-400">
            Attach a link (like a routine doc), a note, or a file to keep with this tracker.
          </p>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </section>
  )
}

// One resource row: a clickable link (opens in a new tab) or a note. Trailing
// edit + delete controls; delete asks for a confirm tap first.
function ResourceRow({
  resource: r,
  confirming,
  onEdit,
  onAskDelete,
  onCancelDelete,
  onConfirmDelete,
}: {
  resource: TrackerResource
  confirming: boolean
  onEdit: () => void
  onAskDelete: () => void
  onCancelDelete: () => void
  onConfirmDelete: () => void
}) {
  const [opening, setOpening] = useState(false)
  const [openErr, setOpenErr] = useState(false)

  // Files are private; fetch a short-lived signed URL on click, then open it.
  async function openFile() {
    if (!r.file_path) return
    setOpening(true)
    setOpenErr(false)
    try {
      const url = await signedUrlForFile(r.file_path)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch {
      setOpenErr(true)
    } finally {
      setOpening(false)
    }
  }

  return (
    <div className="flex items-start gap-2 rounded-xl bg-white p-3 shadow-sm ring-1 ring-black/5">
      <span className="mt-0.5 flex-none text-zinc-400">
        {r.kind === 'link' ? <Link2 size={15} /> : r.kind === 'file' ? <FileText size={15} /> : <StickyNote size={15} />}
      </span>

      <div className="min-w-0 flex-1">
        {r.kind === 'link' && r.url ? (
          <a
            href={safeHref(r.url)}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-center gap-1 text-sm font-medium text-indigo-600 hover:underline"
          >
            <span className="truncate">{r.title?.trim() || hostLabel(r.url)}</span>
            <ExternalLink size={12} className="flex-none opacity-60" />
          </a>
        ) : r.kind === 'file' ? (
          <button
            onClick={openFile}
            disabled={opening}
            className="group flex max-w-full items-center gap-1 text-sm font-medium text-indigo-600 hover:underline disabled:opacity-60"
          >
            <span className="truncate">{r.title?.trim() || r.file_name}</span>
            <ExternalLink size={12} className="flex-none opacity-60" />
          </button>
        ) : (
          <>
            {r.title?.trim() && <div className="truncate text-sm font-medium">{r.title}</div>}
            <p className="whitespace-pre-wrap break-words text-sm text-zinc-600">{r.body}</p>
          </>
        )}
        {r.kind === 'link' && r.title?.trim() && r.url && (
          <div className="truncate text-xs text-zinc-400">{hostLabel(r.url)}</div>
        )}
        {r.kind === 'file' && (
          <div className="text-xs text-zinc-400">
            {r.file_size != null ? fmtBytes(r.file_size) : 'file'}
            {opening && ' · opening…'}
            {openErr && <span className="text-red-500"> · couldn’t open — tap to retry</span>}
          </div>
        )}
      </div>

      {confirming ? (
        <div className="flex flex-none items-center gap-1 text-xs">
          <button onClick={onConfirmDelete} className="rounded-md bg-red-600 px-2 py-1 font-medium text-white hover:bg-red-700">
            Delete
          </button>
          <button onClick={onCancelDelete} className="rounded-md px-1.5 py-1 text-zinc-500 hover:bg-zinc-100" aria-label="Cancel">
            <X size={14} />
          </button>
        </div>
      ) : (
        <div className="flex flex-none items-center gap-0.5">
          {r.kind !== 'file' && (
            <button onClick={onEdit} aria-label="Edit" className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700">
              <Pencil size={14} />
            </button>
          )}
          <button onClick={onAskDelete} aria-label="Delete" className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-red-600">
            <Trash2 size={14} />
          </button>
        </div>
      )}
    </div>
  )
}

// Add/edit form for a single resource. Validates a link to a safe http(s) URL
// before submitting; a note requires a body. `onSubmit` may throw — we surface
// it inline and keep the form open.
function ResourceForm({
  kind,
  color,
  initial,
  onCancel,
  onSubmit,
}: {
  kind: ResourceKind
  color: string
  initial?: TrackerResource
  onCancel: () => void
  onSubmit: (fields: { title: string | null; url?: string; body?: string }) => Promise<void>
}) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [url, setUrl] = useState(initial?.url ?? '')
  const [body, setBody] = useState(initial?.body ?? '')
  const [err, setErr] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function submit() {
    setErr(null)
    let fields: { title: string | null; url?: string; body?: string }
    if (kind === 'link') {
      const normalized = normalizeUrl(url)
      if (!normalized) {
        setErr('Enter a valid web link (http or https).')
        return
      }
      fields = { title: title.trim() || null, url: normalized }
    } else {
      if (!body.trim()) {
        setErr('Write something first.')
        return
      }
      fields = { title: title.trim() || null, body: body.trim() }
    }
    setSaving(true)
    try {
      await onSubmit(fields)
    } catch {
      setErr('Could not save. Try again.')
      setSaving(false)
    }
  }

  return (
    <div className="rounded-xl bg-white p-3 shadow-sm ring-1 ring-black/5">
      {kind === 'link' ? (
        <>
          <input
            autoFocus
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !saving && submit()}
            maxLength={2000}
            placeholder="https://… (paste a link)"
            className="mb-2 w-full rounded-lg border border-zinc-300 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-500"
          />
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !saving && submit()}
            maxLength={120}
            placeholder="Label (optional, e.g. Stretch routine)"
            className="mb-2 w-full rounded-lg border border-zinc-300 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-500"
          />
        </>
      ) : (
        <>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            placeholder="Title (optional)"
            className="mb-2 w-full rounded-lg border border-zinc-300 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-500"
          />
          <textarea
            autoFocus
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            maxLength={4000}
            placeholder="Anything you want to keep with this tracker…"
            className="mb-2 w-full resize-y rounded-lg border border-zinc-300 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-500"
          />
        </>
      )}

      {err && <p className="mb-2 text-xs text-red-600">{err}</p>}

      <div className="flex items-center justify-end gap-2">
        <button onClick={onCancel} className="rounded-lg px-2.5 py-1 text-xs font-medium text-zinc-500 hover:bg-zinc-100">
          Cancel
        </button>
        <button
          onClick={submit}
          disabled={saving}
          className="rounded-lg px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
          style={{ background: color }}
        >
          {saving ? 'Saving…' : initial ? 'Save' : 'Add'}
        </button>
      </div>
    </div>
  )
}
