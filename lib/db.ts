// Supabase data access. Every table is owned by a user (`user_id`) and guarded
// by per-user RLS (`auth.uid() = user_id`), so these queries never pass a
// user_id — the signed-in JWT scopes every read and write, and inserts fill
// `user_id` from `auth.uid()` by default. See supabase/schema.sql.

import { supabase } from './supabase'
import type {
  Tracker,
  Entry,
  TrackerType,
  GoalDirection,
  StreakSide,
  TrackerResource,
  ResourceKind,
} from './types'

// True when a PostgREST error means "that table doesn't exist yet" — used to
// tolerate a migration that lags a deploy (e.g. day_notes, tracker_resources).
function isMissingTable(error: { code?: string; message?: string }, table: string): boolean {
  return error.code === '42P01' || error.code === 'PGRST205' || new RegExp(table).test(error.message ?? '')
}

export async function listTrackers(): Promise<Tracker[]> {
  const { data, error } = await supabase
    .from('trackers')
    .select('*')
    .eq('archived', false)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function getTracker(id: string): Promise<Tracker | null> {
  const { data, error } = await supabase.from('trackers').select('*').eq('id', id).single()
  if (error) {
    if (error.code === 'PGRST116') return null // no rows
    throw error
  }
  return data
}

export interface NewTracker {
  name: string
  type: TrackerType
  color: string
  emoji: string
  unit?: string | null
  goal_direction: GoalDirection
  streak_side: StreakSide
}

export async function createTracker(input: NewTracker): Promise<Tracker> {
  const { data, error } = await supabase
    .from('trackers')
    .insert({ ...input, unit: input.unit || null })
    .select()
    .single()
  if (error) throw error
  return data
}

// Patch editable settings on a tracker (e.g. which side the streak counts, or
// its position in the dashboard list via sort_order).
export async function updateTracker(
  id: string,
  patch: Partial<
    Pick<Tracker, 'streak_side' | 'goal_direction' | 'name' | 'color' | 'emoji' | 'unit' | 'sort_order'>
  >,
): Promise<Tracker> {
  const { data, error } = await supabase
    .from('trackers')
    .update(patch)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteTracker(id: string): Promise<void> {
  const { error } = await supabase.from('trackers').delete().eq('id', id)
  if (error) throw error
}

// All entries for one tracker, oldest first.
export async function listEntries(trackerId: string): Promise<Entry[]> {
  const { data, error } = await supabase
    .from('entries')
    .select('*')
    .eq('tracker_id', trackerId)
    .order('logged_at', { ascending: true })
  if (error) throw error
  return data ?? []
}

// Entries for ALL trackers on a single day — powers the dashboard's "today" totals.
export async function listEntriesForDay(day: string): Promise<Entry[]> {
  const { data, error } = await supabase.from('entries').select('*').eq('day', day)
  if (error) throw error
  return data ?? []
}

// Most recent logged day per tracker → { trackerId: 'YYYY-MM-DD' }. Powers the
// dashboard's "days since last logged" hint. RLS scopes this to the user; we
// only pull (tracker_id, day) and keep the first (latest) seen per tracker.
export async function listLastEntryDays(): Promise<Record<string, string>> {
  const { data, error } = await supabase
    .from('entries')
    .select('tracker_id, day')
    .order('day', { ascending: false })
  if (error) throw error
  const map: Record<string, string> = {}
  for (const row of data ?? []) {
    if (!(row.tracker_id in map)) map[row.tracker_id] = row.day
  }
  return map
}

// Record one tap (+value) on a day.
export async function addEntry(trackerId: string, day: string, value = 1): Promise<Entry> {
  const { data, error } = await supabase
    .from('entries')
    .insert({ tracker_id: trackerId, day, value })
    .select()
    .single()
  if (error) throw error
  return data
}

// Undo: remove the most recent tap for a tracker on a given day. Returns true
// if a row was deleted.
export async function removeLastEntry(trackerId: string, day: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('entries')
    .select('id')
    .eq('tracker_id', trackerId)
    .eq('day', day)
    .order('logged_at', { ascending: false })
    .limit(1)
  if (error) throw error
  const row = data?.[0]
  if (!row) return false
  const { error: delError } = await supabase.from('entries').delete().eq('id', row.id)
  if (delError) throw delError
  return true
}

// Remove every entry for a tracker on a day (used to clear a yes/no day).
export async function clearDay(trackerId: string, day: string): Promise<void> {
  const { error } = await supabase
    .from('entries')
    .delete()
    .eq('tracker_id', trackerId)
    .eq('day', day)
  if (error) throw error
}

// ---- Day notes -----------------------------------------------------------

// All notes for a tracker, as a { 'YYYY-MM-DD': text } map.
export async function listNotes(trackerId: string): Promise<Record<string, string>> {
  const { data, error } = await supabase
    .from('day_notes')
    .select('day, note')
    .eq('tracker_id', trackerId)
  if (error) {
    // Tolerate the table not existing yet (migration 03-notes.sql not applied)
    // so the rest of the detail page still works without notes.
    if (isMissingTable(error, 'day_notes')) return {}
    throw error
  }
  const map: Record<string, string> = {}
  for (const row of data ?? []) map[row.day] = row.note
  return map
}

// Notes across ALL trackers on a single day → { trackerId: note }. Powers the
// dashboard's per-card "today's note". Tolerates a missing day_notes table.
export async function listNotesForDay(day: string): Promise<Record<string, string>> {
  const { data, error } = await supabase
    .from('day_notes')
    .select('tracker_id, note')
    .eq('day', day)
  if (error) {
    if (isMissingTable(error, 'day_notes')) return {}
    throw error
  }
  const map: Record<string, string> = {}
  for (const row of data ?? []) map[row.tracker_id] = row.note
  return map
}

// ---- Tracker resources (links + notes attached to the tracker) ------------

// All resources for a tracker, oldest first. Tolerates a missing table so the
// detail page still loads if migration 05-resources.sql lags a deploy.
export async function listResources(trackerId: string): Promise<TrackerResource[]> {
  const { data, error } = await supabase
    .from('tracker_resources')
    .select('*')
    .eq('tracker_id', trackerId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) {
    if (isMissingTable(error, 'tracker_resources')) return []
    throw error
  }
  return data ?? []
}

export interface NewResource {
  tracker_id: string
  kind: ResourceKind
  title?: string | null
  url?: string | null
  body?: string | null
}

export async function addResource(input: NewResource): Promise<TrackerResource> {
  const { data, error } = await supabase.from('tracker_resources').insert(input).select().single()
  if (error) throw error
  return data
}

export async function updateResource(
  id: string,
  patch: Partial<Pick<TrackerResource, 'title' | 'url' | 'body'>>,
): Promise<TrackerResource> {
  const { data, error } = await supabase
    .from('tracker_resources')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteResource(id: string): Promise<void> {
  const { error } = await supabase.from('tracker_resources').delete().eq('id', id)
  if (error) throw error
}

// Save (upsert) or, when the text is empty, delete the note for a day.
export async function saveNote(trackerId: string, day: string, note: string): Promise<void> {
  const text = note.trim()
  if (!text) {
    const { error } = await supabase
      .from('day_notes')
      .delete()
      .eq('tracker_id', trackerId)
      .eq('day', day)
    if (error) throw error
    return
  }
  const { error } = await supabase
    .from('day_notes')
    .upsert(
      { tracker_id: trackerId, day, note: text, updated_at: new Date().toISOString() },
      { onConflict: 'tracker_id,day' },
    )
  if (error) throw error
}
