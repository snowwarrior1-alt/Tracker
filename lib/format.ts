// Display formatting shared across tracker UIs.

// Round to at most 2 decimals and stringify — drops float cruft that can come
// back from a numeric column (e.g. 175.40000001 → "175.4", 175 → "175").
export function fmtNum(n: number): string {
  return String(Math.round(n * 100) / 100)
}

// Parse a user-typed measure reading to a number, or null if it's blank, zero,
// or not a number. Every measure logger rejects those: a 0 reading isn't
// meaningful and the entries `value <> 0` CHECK would reject it anyway.
export function parseMeasure(input: string): number | null {
  const n = parseFloat(input)
  return Number.isNaN(n) || n === 0 ? null : n
}
