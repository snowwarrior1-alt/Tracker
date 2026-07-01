import { describe, it, expect } from 'vitest'
import { reorderByIndex } from './reorder'

const mk = (ids: string[]) => ids.map((id, i) => ({ id, sort_order: i }))
const byOrder = (c: { id: string; sort_order: number }[]) =>
  [...c].sort((p, q) => p.sort_order - q.sort_order)

describe('reorderByIndex', () => {
  it('moves an item up and renumbers sort_order to positions', () => {
    const { list, changed } = reorderByIndex(mk(['a', 'b', 'c']), 2, 1) // c up past b
    expect(list.map((x) => x.id)).toEqual(['a', 'c', 'b'])
    expect(list.map((x) => x.sort_order)).toEqual([0, 1, 2])
    expect(byOrder(changed)).toEqual([
      { id: 'c', sort_order: 1 },
      { id: 'b', sort_order: 2 },
    ])
  })
  it('reports only the two swapped items as changed', () => {
    const { changed } = reorderByIndex(mk(['a', 'b', 'c', 'd']), 0, 1)
    expect(changed.map((c) => c.id).sort()).toEqual(['a', 'b'])
  })
  it('swaps non-adjacent positions', () => {
    const { list } = reorderByIndex(mk(['a', 'b', 'c', 'd']), 0, 3)
    expect(list.map((x) => x.id)).toEqual(['d', 'b', 'c', 'a'])
  })
})
