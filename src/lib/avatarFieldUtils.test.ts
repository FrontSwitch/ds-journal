import { describe, it, expect } from 'vitest'
import { parseIntRange, intRangesOverlap, formatIntRange } from './avatarFieldUtils'

// ── parseIntRange ─────────────────────────────────────────────────────────────

describe('parseIntRange', () => {
  it('parses a single number as [n, n]', () => {
    expect(parseIntRange('25')).toEqual([25, 25])
  })

  it('parses a range', () => {
    expect(parseIntRange('10-20')).toEqual([10, 20])
  })

  it('normalises reversed range so lo <= hi', () => {
    expect(parseIntRange('20-10')).toEqual([10, 20])
  })

  it('returns null for empty string', () => {
    expect(parseIntRange('')).toBeNull()
  })

  it('returns null for whitespace', () => {
    expect(parseIntRange('   ')).toBeNull()
  })

  it('returns null for non-numeric input', () => {
    expect(parseIntRange('abc')).toBeNull()
  })

  it('returns null for partial non-numeric range', () => {
    expect(parseIntRange('10-abc')).toBeNull()
  })

  it('trims whitespace before parsing', () => {
    expect(parseIntRange('  15  ')).toEqual([15, 15])
  })

  it('parses zero', () => {
    expect(parseIntRange('0')).toEqual([0, 0])
  })

  it('parses a range containing zero', () => {
    expect(parseIntRange('0-5')).toEqual([0, 5])
  })
})

// ── intRangesOverlap ──────────────────────────────────────────────────────────

describe('intRangesOverlap', () => {
  it('returns true for identical ranges', () => {
    expect(intRangesOverlap([5, 10], [5, 10])).toBe(true)
  })

  it('returns true for overlapping ranges', () => {
    expect(intRangesOverlap([1, 10], [8, 15])).toBe(true)
  })

  it('returns true when one range contains the other', () => {
    expect(intRangesOverlap([1, 20], [5, 10])).toBe(true)
  })

  it('returns true when ranges share a single boundary point', () => {
    expect(intRangesOverlap([1, 5], [5, 10])).toBe(true)
  })

  it('returns false for non-overlapping ranges (a before b)', () => {
    expect(intRangesOverlap([1, 4], [6, 10])).toBe(false)
  })

  it('returns false for non-overlapping ranges (b before a)', () => {
    expect(intRangesOverlap([6, 10], [1, 4])).toBe(false)
  })

  it('returns false when ranges are adjacent but not touching', () => {
    expect(intRangesOverlap([1, 5], [6, 10])).toBe(false)
  })

  it('returns true for single-point ranges that match', () => {
    expect(intRangesOverlap([7, 7], [7, 7])).toBe(true)
  })

  it('returns false for single-point ranges that differ', () => {
    expect(intRangesOverlap([7, 7], [8, 8])).toBe(false)
  })
})

// ── formatIntRange ────────────────────────────────────────────────────────────

describe('formatIntRange', () => {
  it('formats a range with en-dash', () => {
    expect(formatIntRange('10-20')).toBe('10–20')
  })

  it('formats a single value without dash', () => {
    expect(formatIntRange('25')).toBe('25')
  })

  it('formats a reversed range correctly', () => {
    expect(formatIntRange('20-5')).toBe('5–20')
  })

  it('returns raw string for invalid input', () => {
    expect(formatIntRange('abc')).toBe('abc')
  })

  it('returns raw string for empty input', () => {
    expect(formatIntRange('')).toBe('')
  })
})
