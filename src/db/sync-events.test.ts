import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NativeDb } from '../native/db'
import {
  logCreate,
  logUpdate,
  logDelete,
  logUpdateById,
  getEntityId,
  getLocalEventsSince,
} from './sync-events'

// --- Mock helpers ---

function makeMockDb(selectSequence: unknown[][] = [], executeResult = { lastInsertId: 0 }) {
  const db = {
    select: vi.fn<Parameters<NativeDb['select']>, ReturnType<NativeDb['select']>>(),
    execute: vi.fn().mockResolvedValue(executeResult),
  }
  for (const value of selectSequence) {
    db.select.mockResolvedValueOnce(value)
  }
  return db as unknown as NativeDb
}

// Each test gets a fresh device ID so counter lookups start clean.
beforeEach(() => {
  localStorage.setItem('dsj-device-id', 'test-device-id')
})

// ---

describe('logCreate', () => {
  it('inserts an event_log row with operation=create and JSON payload', async () => {
    // select: nextCounter returns 1; then execute: INSERT
    const db = makeMockDb([[{ n: 1 }]])
    await logCreate('avatars', 'eid-abc', { name: 'Alex', color: '#ff0000' }, db)

    // nextCounter read
    expect(db.select).toHaveBeenCalledWith(
      expect.stringContaining('MAX(device_counter)'),
      ['test-device-id']
    )

    // INSERT into event_log — params: [event_id, deviceId, counter, entityType, entityId, payload, timestamp]
    expect(db.execute).toHaveBeenCalledTimes(1)
    const [sql, params] = (db.execute as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(sql).toContain("'create'")
    expect(sql).toContain('event_log')
    expect(params[1]).toBe('test-device-id')  // device_id
    expect(params[2]).toBe(1)                 // device_counter
    expect(params[3]).toBe('avatars')          // entity_type
    expect(params[4]).toBe('eid-abc')          // entity_id
    expect(JSON.parse(params[5] as string)).toEqual({ name: 'Alex', color: '#ff0000' })
  })

  it('uses counter from nextCounter even when counter > 1', async () => {
    const db = makeMockDb([[{ n: 5 }]])
    await logCreate('channels', 'eid-ch', { name: 'Chat' }, db)
    const [, params] = (db.execute as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(params[2]).toBe(5)  // device_counter at index 2
  })
})

describe('logUpdate', () => {
  it('inserts with operation=update', async () => {
    const db = makeMockDb([[{ n: 2 }]])
    await logUpdate('avatars', 'eid-abc', { color: '#00ff00' }, db)
    const [sql] = (db.execute as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(sql).toContain("'update'")
  })

  it('serializes partial payload correctly', async () => {
    const db = makeMockDb([[{ n: 1 }]])
    await logUpdate('folders', 'eid-f', { hidden: 1 }, db)
    const [, params] = (db.execute as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(JSON.parse(params[5] as string)).toEqual({ hidden: 1 })
  })
})

describe('logDelete', () => {
  it('inserts with operation=delete and NULL payload', async () => {
    const db = makeMockDb([[{ n: 1 }]])
    await logDelete('folders', 'eid-f', db)
    const [sql, params] = (db.execute as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(sql).toContain("'delete'")
    expect(sql).toContain('NULL')
    // payload param position is not in the SQL because it's hardcoded NULL,
    // so params should have 6 items: event_id, device_id, counter, type, entity_id, timestamp
    expect(params).toHaveLength(6)
  })
})

describe('logUpdateById', () => {
  it('looks up entity_id then calls logUpdate', async () => {
    const db = makeMockDb(
      [[{ entity_id: 'eid-x' }], [{ n: 1 }]]  // getEntityId, then nextCounter
    )
    await logUpdateById('avatars', 42, { color: 'red' }, db)

    // First select: entity_id lookup
    expect(db.select).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('entity_id FROM avatars'),
      [42]
    )
    // execute: the update event insert
    expect(db.execute).toHaveBeenCalledTimes(1)
  })

  it('does nothing when entity_id is not found', async () => {
    const db = makeMockDb([[]])  // getEntityId returns no rows
    await logUpdateById('avatars', 99, { color: 'blue' }, db)
    expect(db.execute).not.toHaveBeenCalled()
  })
})

describe('getEntityId', () => {
  it('returns entity_id when row exists', async () => {
    const db = makeMockDb([[{ entity_id: 'eid-42' }]])
    const result = await getEntityId('channels', 42, db)
    expect(result).toBe('eid-42')
    expect(db.select).toHaveBeenCalledWith(
      expect.stringContaining('entity_id FROM channels'),
      [42]
    )
  })

  it('returns null when row not found', async () => {
    const db = makeMockDb([[]])
    expect(await getEntityId('folders', 1, db)).toBeNull()
  })

  it('returns null when entity_id column is null', async () => {
    const db = makeMockDb([[{ entity_id: null }]])
    expect(await getEntityId('avatars', 5, db)).toBeNull()
  })
})

describe('getLocalEventsSince', () => {
  it('queries events for this device after the given counter', async () => {
    const db = makeMockDb([[]])
    await getLocalEventsSince(10, {}, db)
    expect(db.select).toHaveBeenCalledWith(
      expect.stringContaining('device_counter > ?'),
      ['test-device-id', 10]
    )
  })

  it('adds timestamp condition when cutoffMs > 0', async () => {
    const db = makeMockDb([[]])
    await getLocalEventsSince(0, { cutoffMs: 1_700_000_000_000 }, db)
    const [sql, params] = (db.select as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(sql).toContain('timestamp >= ?')
    expect(params).toContain(1_700_000_000_000)
  })

  it('skips timestamp condition when cutoffMs is 0', async () => {
    const db = makeMockDb([[]])
    await getLocalEventsSince(0, { cutoffMs: 0 }, db)
    const [sql] = (db.select as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(sql).not.toContain('timestamp >= ?')
  })

  it('adds sync_enabled filter when respectSyncEnabled=true', async () => {
    const db = makeMockDb([[]])
    await getLocalEventsSince(0, { respectSyncEnabled: true }, db)
    const [sql] = (db.select as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(sql).toContain('sync_enabled')
  })

  it('omits sync_enabled filter when respectSyncEnabled=false', async () => {
    const db = makeMockDb([[]])
    await getLocalEventsSince(0, { respectSyncEnabled: false }, db)
    const [sql] = (db.select as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(sql).not.toContain('sync_enabled')
  })

  it('orders results by device_counter ASC', async () => {
    const db = makeMockDb([[]])
    await getLocalEventsSince(0, {}, db)
    const [sql] = (db.select as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(sql).toContain('ORDER BY el.device_counter ASC')
  })
})
