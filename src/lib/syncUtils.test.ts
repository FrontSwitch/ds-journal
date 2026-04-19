import { describe, it, expect } from 'vitest'
import { extractConflictFields, payloadsConflict, lwwWinner } from './syncUtils'

describe('extractConflictFields', () => {
  it('returns user-visible field names', () => {
    expect(extractConflictFields({ color: '#ff0000', name: 'Alex' })).toEqual(['color', 'name'])
  })

  it('strips internal _*_eid fields', () => {
    const fields = extractConflictFields({ _avatar_eid: 'abc', color: '#ff0000' })
    expect(fields).toEqual(['color'])
  })

  it('strips entity_id and created_at', () => {
    const fields = extractConflictFields({ entity_id: 'xyz', created_at: '2025-01-01', color: 'red' })
    expect(fields).toEqual(['color'])
  })

  it('returns empty for empty payload', () => {
    expect(extractConflictFields({})).toEqual([])
  })
})

describe('payloadsConflict', () => {
  it('detects conflicting color values', () => {
    expect(payloadsConflict(
      { color: '#ff0000' },
      { color: '#00ff00' }
    )).toBe(true)
  })

  it('returns false when values match', () => {
    expect(payloadsConflict(
      { color: '#ff0000' },
      { color: '#ff0000' }
    )).toBe(false)
  })

  it('returns false when local does not have the field (addition, not conflict)', () => {
    expect(payloadsConflict(
      { color: '#ff0000' },
      {}
    )).toBe(false)
  })

  it('detects conflict in one of multiple fields', () => {
    expect(payloadsConflict(
      { color: '#ff0000', name: 'Alex' },
      { color: '#00ff00', name: 'Alex' }
    )).toBe(true)
  })

  it('no conflict when all differing fields are absent locally', () => {
    expect(payloadsConflict(
      { pronouns: 'they/them' },
      { color: 'red' }   // local has color, but remote is changing pronouns
    )).toBe(false)
  })

  it('ignores _eid fields when comparing', () => {
    expect(payloadsConflict(
      { _avatar_eid: 'abc', color: '#ff0000' },
      { _avatar_eid: 'xyz', color: '#ff0000' }
    )).toBe(false)
  })
})

describe('lwwWinner', () => {
  it('local wins when local timestamp is newer', () => {
    expect(lwwWinner(2000, 1000)).toBe('local')
  })

  it('remote wins when remote timestamp is newer', () => {
    expect(lwwWinner(1000, 2000)).toBe('remote')
  })

  it('remote wins on tie (remote edit is applied)', () => {
    expect(lwwWinner(1000, 1000)).toBe('remote')
  })
})
