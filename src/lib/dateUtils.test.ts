import { describe, it, expect } from 'vitest'
import { toSqlDatetime, toIsoDate, toBackupTimestamp } from './dateUtils'

// Fixed UTC date for all tests: 2025-03-15 09:30:45 UTC
const DATE = new Date('2025-03-15T09:30:45.000Z')

describe('toSqlDatetime', () => {
  it('formats as YYYY-MM-DD HH:MM:SS', () => {
    expect(toSqlDatetime(DATE)).toBe('2025-03-15 09:30:45')
  })

  it('contains a space separator (not T)', () => {
    expect(toSqlDatetime(DATE)).not.toContain('T')
  })

  it('does not include milliseconds', () => {
    expect(toSqlDatetime(DATE)).toHaveLength(19)
  })

  it('zero-pads month, day, hour, minute, second', () => {
    const d = new Date('2025-01-02T03:04:05.000Z')
    expect(toSqlDatetime(d)).toBe('2025-01-02 03:04:05')
  })
})

describe('toIsoDate', () => {
  it('formats as YYYY-MM-DD', () => {
    expect(toIsoDate(DATE)).toBe('2025-03-15')
  })

  it('returns exactly 10 characters', () => {
    expect(toIsoDate(DATE)).toHaveLength(10)
  })

  it('zero-pads month and day', () => {
    const d = new Date('2025-01-05T00:00:00.000Z')
    expect(toIsoDate(d)).toBe('2025-01-05')
  })
})

describe('toBackupTimestamp', () => {
  it('formats as YYYY-MM-DD_HH-MM-SS', () => {
    expect(toBackupTimestamp(DATE)).toBe('2025-03-15_09-30-45')
  })

  it('uses underscores and hyphens (safe for filenames)', () => {
    const ts = toBackupTimestamp(DATE)
    expect(ts).not.toContain(':')
    expect(ts).not.toContain('T')
    expect(ts).not.toContain('Z')
  })

  it('returns exactly 19 characters', () => {
    expect(toBackupTimestamp(DATE)).toHaveLength(19)
  })
})
