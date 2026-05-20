import { describe, it, expect, vi, beforeEach } from 'vitest'
import { parsePKData, previewPK, runPKImport, type PKData, type PKImportOptions } from './importPK'

vi.mock('../db/index', () => ({ getDb: vi.fn() }))

import { getDb } from '../db/index'

// ── mock DB factory ───────────────────────────────────────────────────────────

function makeDb(selectSequence: unknown[][], lastInsertId = 10) {
  const db = {
    select:  vi.fn(),
    execute: vi.fn().mockResolvedValue({ lastInsertId }),
  }
  for (const value of selectSequence) {
    db.select.mockResolvedValueOnce(value)
  }
  return db
}

const ALL: PKImportOptions = { dryRun: false, skipMembers: false, skipGroups: false, skipSwitches: false }
const NO_SWITCHES: PKImportOptions = { ...ALL, skipSwitches: true }
const ONLY_MEMBERS: PKImportOptions = { ...ALL, skipGroups: true, skipSwitches: true }
const ONLY_SWITCHES: PKImportOptions = { ...ALL, skipMembers: true, skipGroups: true }

beforeEach(() => { vi.clearAllMocks() })

// ── parsePKData ───────────────────────────────────────────────────────────────

describe('parsePKData', () => {
  it('passes through a valid object', () => {
    const data = { id: 'abc', members: [] }
    expect(parsePKData(data)).toBe(data)
  })

  it('passes through an empty object', () => {
    expect(parsePKData({})).toEqual({})
  })

  it('throws for null', () => {
    expect(() => parsePKData(null)).toThrow('Invalid PluralKit JSON')
  })

  it('throws for a string', () => {
    expect(() => parsePKData('{"id":"abc"}')).toThrow('Invalid PluralKit JSON')
  })

  it('throws for a number', () => {
    expect(() => parsePKData(42)).toThrow('Invalid PluralKit JSON')
  })

  it('throws for undefined', () => {
    expect(() => parsePKData(undefined)).toThrow('Invalid PluralKit JSON')
  })
})

// ── previewPK ─────────────────────────────────────────────────────────────────

describe('previewPK', () => {
  it('counts members, groups, and switches', () => {
    const data: PKData = {
      members:  [{ id: 'abc12', name: 'Alex' }, { id: 'def34', name: 'River' }],
      groups:   [{ id: 'g1', name: 'Core' }],
      switches: [{ timestamp: '2024-01-01T00:00:00Z', members: ['abc12'] }],
    }
    expect(previewPK(data)).toEqual({ members: 2, groups: 1, switches: 1 })
  })

  it('returns zeros when arrays are absent', () => {
    expect(previewPK({})).toEqual({ members: 0, groups: 0, switches: 0 })
  })

  it('returns zeros for empty arrays', () => {
    expect(previewPK({ members: [], groups: [], switches: [] })).toEqual({ members: 0, groups: 0, switches: 0 })
  })
})

// ── runPKImport — members ─────────────────────────────────────────────────────

describe('runPKImport — members', () => {
  it('imports a member as an avatar', async () => {
    const db = makeDb([[]])  // no existing avatar
    vi.mocked(getDb).mockResolvedValue(db as any)

    const data: PKData = { members: [{ id: 'abc12', name: 'Alex', color: 'ff0000', pronouns: 'they/them', created: '2024-01-01T00:00:00Z' }] }
    const result = await runPKImport(data, ONLY_MEMBERS)

    expect(result.avatars).toBe(1)
    expect(db.execute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO avatars'),
      expect.arrayContaining(['Alex', '#ff0000', 'they/them'])
    )
  })

  it('skips an existing avatar by name and maps its id', async () => {
    const db = makeDb([[{ id: 99 }]])  // avatar already exists
    vi.mocked(getDb).mockResolvedValue(db as any)

    const data: PKData = { members: [{ id: 'abc12', name: 'Alex' }] }
    const result = await runPKImport(data, ONLY_MEMBERS)

    expect(result.avatars).toBe(0)
    expect(db.execute).not.toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO avatars'), expect.anything()
    )
  })

  it('prefers display_name over name', async () => {
    const db = makeDb([[]])
    vi.mocked(getDb).mockResolvedValue(db as any)

    const data: PKData = { members: [{ id: 'abc12', name: 'Alex', display_name: 'Alex (they/them)' }] }
    await runPKImport(data, ONLY_MEMBERS)

    expect(db.execute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO avatars'),
      expect.arrayContaining(['Alex (they/them)'])
    )
  })

  it('uses #888888 as default color when member has no color', async () => {
    const db = makeDb([[]])
    vi.mocked(getDb).mockResolvedValue(db as any)

    const data: PKData = { members: [{ id: 'abc12', name: 'Alex' }] }
    await runPKImport(data, ONLY_MEMBERS)

    expect(db.execute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO avatars'),
      expect.arrayContaining(['#888888'])
    )
  })

  it('skips members when skipMembers=true', async () => {
    const db = makeDb([])
    vi.mocked(getDb).mockResolvedValue(db as any)

    const data: PKData = { members: [{ id: 'abc12', name: 'Alex' }] }
    const result = await runPKImport(data, { ...ALL, skipMembers: true, skipGroups: true, skipSwitches: true })

    expect(result.avatars).toBe(0)
    expect(db.execute).not.toHaveBeenCalled()
  })

  it('dry run counts avatars but does not call execute', async () => {
    const db = makeDb([[]])
    vi.mocked(getDb).mockResolvedValue(db as any)

    const data: PKData = { members: [{ id: 'abc12', name: 'Alex' }] }
    const result = await runPKImport(data, { ...ONLY_MEMBERS, dryRun: true })

    expect(result.avatars).toBe(1)
    expect(db.execute).not.toHaveBeenCalled()
  })

  it('maps member uuid as an alias so groups can reference it', async () => {
    const db = makeDb([
      [],  // member select → no existing
      [],  // group select → no existing
    ], 42)
    vi.mocked(getDb).mockResolvedValue(db as any)

    const data: PKData = {
      members: [{ id: 'abc12', uuid: 'uuid-1234', name: 'Alex' }],
      groups:  [{ id: 'g1', name: 'Core', members: ['uuid-1234'] }],
    }
    const result = await runPKImport(data, NO_SWITCHES)

    expect(result.warnings).toHaveLength(0)
    expect(db.execute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT OR IGNORE INTO avatar_group_members'),
      expect.anything()
    )
  })
})

// ── runPKImport — groups ──────────────────────────────────────────────────────

describe('runPKImport — groups', () => {
  it('creates a group and links members', async () => {
    const db = makeDb([
      [],  // member select → no existing
      [],  // group select → no existing
    ], 20)
    vi.mocked(getDb).mockResolvedValue(db as any)

    const data: PKData = {
      members: [{ id: 'abc12', name: 'Alex' }],
      groups:  [{ id: 'g1', name: 'Core', members: ['abc12'] }],
    }
    const result = await runPKImport(data, NO_SWITCHES)

    expect(result.groups).toBe(1)
    expect(db.execute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT OR IGNORE INTO avatar_group_members'),
      expect.anything()
    )
  })

  it('reuses an existing group by name', async () => {
    const db = makeDb([[{ id: 55 }]])  // group already exists
    vi.mocked(getDb).mockResolvedValue(db as any)

    const data: PKData = { groups: [{ id: 'g1', name: 'Core' }] }
    const result = await runPKImport(data, { ...ALL, skipMembers: true, skipSwitches: true })

    expect(result.groups).toBe(0)
    expect(db.execute).not.toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO avatar_groups'), expect.anything()
    )
  })

  it('emits warning for a group member not found in memberIdMap', async () => {
    const db = makeDb([
      [],  // group select → no existing
    ])
    vi.mocked(getDb).mockResolvedValue(db as any)

    const data: PKData = {
      groups: [{ id: 'g1', name: 'Core', members: ['unknown_id'] }],
    }
    const result = await runPKImport(data, { ...ALL, skipMembers: true, skipSwitches: true })

    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]).toContain('unknown_id')
  })

  it('skips groups when skipGroups=true', async () => {
    const db = makeDb([])
    vi.mocked(getDb).mockResolvedValue(db as any)

    const data: PKData = { groups: [{ id: 'g1', name: 'Core' }] }
    const result = await runPKImport(data, { ...ALL, skipMembers: true, skipGroups: true, skipSwitches: true })

    expect(result.groups).toBe(0)
    expect(db.execute).not.toHaveBeenCalled()
  })
})

// ── runPKImport — switches ────────────────────────────────────────────────────

describe('runPKImport — switches', () => {
  it('counts switches and skips inserts in dry run', async () => {
    const db = makeDb([[{ channel_id: 7 }]])  // front_log_config found
    vi.mocked(getDb).mockResolvedValue(db as any)

    const data: PKData = {
      switches: [
        { timestamp: '2024-01-01T10:00:00Z', members: ['abc12'] },
        { timestamp: '2024-01-01T11:00:00Z', members: ['abc12'] },
      ],
    }
    const result = await runPKImport(data, { ...ONLY_SWITCHES, dryRun: true })

    expect(result.switches).toBe(2)
    expect(db.execute).not.toHaveBeenCalled()
  })

  it('sorts out-of-order switches by timestamp before processing', async () => {
    const db = makeDb([[{ channel_id: 7 }]])
    vi.mocked(getDb).mockResolvedValue(db as any)

    const data: PKData = {
      switches: [
        { timestamp: '2024-01-01T12:00:00Z', members: [] },
        { timestamp: '2024-01-01T10:00:00Z', members: [] },
        { timestamp: '2024-01-01T11:00:00Z', members: [] },
      ],
    }
    await runPKImport(data, ONLY_SWITCHES)

    const inserts = db.execute.mock.calls.filter((c: unknown[]) =>
      (c[0] as string).includes('INSERT INTO messages')
    )
    // sorted: 10:00 → 11:00 (60m), 11:00 → 12:00 (60m), 12:00 (0m)
    expect(inserts[0][1][2]).toContain('|front:session|60|')
    expect(inserts[1][1][2]).toContain('|front:session|60|')
    expect(inserts[2][1][2]).toContain('|front:session|0|')
  })

  it('computes duration in minutes to the next switch', async () => {
    const db = makeDb([[{ channel_id: 7 }]])
    vi.mocked(getDb).mockResolvedValue(db as any)

    const data: PKData = {
      switches: [
        { timestamp: '2024-01-01T10:00:00Z', members: [] },
        { timestamp: '2024-01-01T10:45:00Z', members: [] },
      ],
    }
    await runPKImport(data, ONLY_SWITCHES)

    const inserts = db.execute.mock.calls.filter((c: unknown[]) =>
      (c[0] as string).includes('INSERT INTO messages')
    )
    expect(inserts[0][1][2]).toBe('|front:session|45|')
  })

  it('gives the last switch duration=0', async () => {
    const db = makeDb([[{ channel_id: 7 }]])
    vi.mocked(getDb).mockResolvedValue(db as any)

    const data: PKData = {
      switches: [{ timestamp: '2024-01-01T10:00:00Z', members: [] }],
    }
    await runPKImport(data, ONLY_SWITCHES)

    const insert = db.execute.mock.calls.find((c: unknown[]) =>
      (c[0] as string).includes('INSERT INTO messages')
    )
    expect(insert![1][2]).toBe('|front:session|0|')
  })

  it('formats multi-member switch as co-session with names', async () => {
    const db = makeDb([[{ channel_id: 7 }]])
    vi.mocked(getDb).mockResolvedValue(db as any)

    const data: PKData = {
      members:  [{ id: 'abc12', name: 'Alex' }, { id: 'def34', name: 'River' }],
      switches: [{ timestamp: '2024-01-01T10:00:00Z', members: ['abc12', 'def34'] }],
    }
    await runPKImport(data, ONLY_SWITCHES)

    const insert = db.execute.mock.calls.find((c: unknown[]) =>
      (c[0] as string).includes('INSERT INTO messages')
    )
    expect(insert![1][2]).toBe('|front:co-session|0|Alex|River|')
  })

  it('uses display_name in co-session text when available', async () => {
    const db = makeDb([[{ channel_id: 7 }]])
    vi.mocked(getDb).mockResolvedValue(db as any)

    const data: PKData = {
      members:  [{ id: 'abc12', name: 'Alex', display_name: 'Alexandra' }],
      switches: [{ timestamp: '2024-01-01T10:00:00Z', members: ['abc12', 'abc12'] }],
    }
    await runPKImport(data, ONLY_SWITCHES)

    const insert = db.execute.mock.calls.find((c: unknown[]) =>
      (c[0] as string).includes('INSERT INTO messages')
    )
    expect(insert![1][2]).toContain('Alexandra')
  })

  it('skips switches when skipSwitches=true', async () => {
    const db = makeDb([])
    vi.mocked(getDb).mockResolvedValue(db as any)

    const data: PKData = {
      switches: [{ timestamp: '2024-01-01T10:00:00Z', members: [] }],
    }
    const result = await runPKImport(data, { ...ALL, skipMembers: true, skipGroups: true, skipSwitches: true })

    expect(result.switches).toBe(0)
    expect(db.execute).not.toHaveBeenCalled()
  })

  it('creates a Front Log channel when front_log_config and named channel are absent', async () => {
    const db = makeDb([
      [],  // front_log_config: not found
      [],  // channels WHERE name='Front Log': not found
    ])
    vi.mocked(getDb).mockResolvedValue(db as any)

    const data: PKData = {
      switches: [{ timestamp: '2024-01-01T10:00:00Z', members: [] }],
    }
    await runPKImport(data, ONLY_SWITCHES)

    expect(db.execute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO channels'),
      expect.anything()
    )
  })

  it('uses an existing Front Log channel when found by name', async () => {
    const db = makeDb([
      [],            // front_log_config: not found
      [{ id: 12 }], // channels WHERE name='Front Log': found
    ])
    vi.mocked(getDb).mockResolvedValue(db as any)

    const data: PKData = {
      switches: [{ timestamp: '2024-01-01T10:00:00Z', members: [] }],
    }
    await runPKImport(data, ONLY_SWITCHES)

    expect(db.execute).not.toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO channels'), expect.anything()
    )
    expect(db.execute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO messages'), expect.anything()
    )
  })
})
