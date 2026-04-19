/**
 * Parse an intRange stored value or filter query.
 * Formats: "25"  → [25, 25]
 *          "10-20" → [10, 20]
 *          ""   → null
 *
 * Negative numbers (e.g. "-5-10") aren't expected for avatar age fields,
 * so we find the first '-' after the first character to split.
 */
export function parseIntRange(raw: string): [number, number] | null {
  const s = raw.trim()
  if (!s) return null

  // Find split point: first '-' that isn't at position 0 (leading minus)
  const dashIdx = s.indexOf('-', 1)

  if (dashIdx === -1) {
    const n = parseInt(s, 10)
    if (isNaN(n)) return null
    return [n, n]
  }

  const lo = parseInt(s.slice(0, dashIdx), 10)
  const hi = parseInt(s.slice(dashIdx + 1), 10)
  if (isNaN(lo) || isNaN(hi)) return null
  return [Math.min(lo, hi), Math.max(lo, hi)]
}

/** True if two [min, max] ranges share any integers. */
export function intRangesOverlap(a: [number, number], b: [number, number]): boolean {
  return a[0] <= b[1] && a[1] >= b[0]
}

/** Display an intRange value nicely: "10-20" → "10–20", "25" → "25". */
export function formatIntRange(raw: string): string {
  const r = parseIntRange(raw)
  if (!r) return raw
  return r[0] === r[1] ? String(r[0]) : `${r[0]}–${r[1]}`
}
