// Reorder an ordered list by swapping two positions, then renumber sort_order
// to match the new positions. Returns the new list plus only the items whose
// sort_order actually changed (so callers persist a minimal set of writes).
// Pure + testable; shared by tracker, section, and step reordering.
export function reorderByIndex<T extends { id: string; sort_order: number }>(
  list: T[],
  from: number,
  to: number,
): { list: T[]; changed: { id: string; sort_order: number }[] } {
  const swapped = [...list]
  ;[swapped[from], swapped[to]] = [swapped[to], swapped[from]]
  const next = swapped.map((x, i) => ({ ...x, sort_order: i }))
  const changed = swapped
    .map((x, i) => (x.sort_order === i ? null : { id: x.id, sort_order: i }))
    .filter((c): c is { id: string; sort_order: number } => c !== null)
  return { list: next, changed }
}
