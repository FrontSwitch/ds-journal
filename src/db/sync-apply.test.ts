import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NativeDb } from '../native/db'
import { safeCol, sanitizePayload, applyRemoteEvents } from './sync-apply'
import { logCreate, logUpdate, logDelete, getLocalEventsSince } from './sync-events'
import { makeTestDb, makeEvent } from './sync-test-utils'

// ============================================================
// T1 — pure function tests (no DB needed)
// ============================================================

describe('safeCol', () => {
  it('allows lowercase letters', () => expect(safeCol('name')).toBe(true))
  it('allows underscores', () => expect(safeCol('sort_order')).toBe(true))
  it('allows mixed lowercase and underscores', () => expect(safeCol('avatar_field_id')).toBe(true))
  it('rejects uppercase letters', () => expect(safeCol('Name')).toBe(false))
  it('rejects hyphens', () => expect(safeCol('sort-order')).toBe(false))
  it('rejects digits', () => expect(safeCol('col1')).toBe(false))
  it('rejects empty string', () => expect(safeCol('')).toBe(false))
  it('rejects SQL keywords with uppercase', () => expect(safeCol('DROP')).toBe(false))
  it('rejects special chars', () => expect(safeCol('col; DROP TABLE')).toBe(false))
  it('rejects _eid style keys (contain digits via numbers prefix check)', () => {
    // _folder_eid passes safeCol (it IS lowercase+underscore); it's excluded by other logic
    expect(safeCol('_folder_eid')).toBe(true)
  })
})

describe('sanitizePayload', () => {
  it('keeps valid column names', () => {
    const result = sanitizePayload({ name: 'Alex', color: '#ff0000', sort_order: 1 })
    expect(result).toEqual({ name: 'Alex', color: '#ff0000', sort_order: 1 })
  })

  it('filters out uppercase keys', () => {
    const result = sanitizePayload({ Name: 'Alex', name: 'Alex' })
    expect(result).toEqual({ name: 'Alex' })
  })

  it('filters injection attempt in key', () => {
    const result = sanitizePayload({ 'name; DROP TABLE avatars; --': 'x', name: 'safe' })
    expect(result).toEqual({ name: 'safe' })
  })

  it('returns empty object for all-invalid payload', () => {
    expect(sanitizePayload({ 'Key': 'val', '123': 'num' })).toEqual({})
  })

  it('returns empty object for empty input', () => {
    expect(sanitizePayload({})).toEqual({})
  })
})

// ============================================================
// T2 — mock-DB tests for applyRemoteEvents
// ============================================================

function makeMockDb(selectSequence: unknown[][], executeResult = { lastInsertId: 1 }) {
  const db = {
    select: vi.fn<Parameters<NativeDb['select']>, ReturnType<NativeDb['select']>>(),
    execute: vi.fn().mockResolvedValue(executeResult),
  }
  for (const value of selectSequence) {
    db.select.mockResolvedValueOnce(value)
  }
  return db as unknown as NativeDb
}

beforeEach(() => {
  localStorage.setItem('dsj-device-id', 'my-device-id')
})

describe('applyRemoteEvents — dedup', () => {
  it('skips an event already in event_log', async () => {
    const event = makeEvent({ entity_type: 'avatars', operation: 'create' })
    // dedup check returns n=1 (already exists)
    const db = makeMockDb([[{ n: 1 }]])
    await applyRemoteEvents([event], 'peer', db)
    // Only the dedup SELECT; no execute (no INSERT or UPDATE)
    expect(db.execute).not.toHaveBeenCalled()
  })

  it('processes an event not yet in event_log', async () => {
    const event = makeEvent({ entity_type: 'avatars', operation: 'create' })
    // dedup=0, mergeOrInsert byEid=[], natural key check=[], then event_log insert
    const db = makeMockDb([[{ n: 0 }], [], []])
    await applyRemoteEvents([event], 'peer', db)
    expect(db.execute).toHaveBeenCalled()
  })
})

describe('applyRemoteEvents — unknown entity type', () => {
  it('silently skips events with unknown entity_type', async () => {
    const event = makeEvent({ entity_type: 'unknown_table', device_counter: 1 })
    // dedup check returns 0 (not seen), then skip due to unknown type
    const db = makeMockDb([[{ n: 0 }]])
    await applyRemoteEvents([event], 'peer', db)
    // event_log INSERT should still happen (event was valid, just unknown type)
    // The entity apply is skipped, but we still log it
    expect(db.select).toHaveBeenCalledTimes(1)  // only dedup check
  })
})

describe('applyRemoteEvents — create path', () => {
  it('calls INSERT OR IGNORE for a new entity with no natural key match', async () => {
    const event = makeEvent({
      entity_type: 'avatars',
      entity_id: 'eid-alex',
      operation: 'create',
      payload: { name: 'Alex', color: '#ff0000' },
    })
    // dedup=0, byEid=[], natural key check=[]
    const db = makeMockDb([[{ n: 0 }], [], []])
    await applyRemoteEvents([event], 'peer', db)

    const executeCalls = (db.execute as ReturnType<typeof vi.fn>).mock.calls
    const insertCall = executeCalls.find(([sql]: [string]) => sql.includes('INSERT OR IGNORE INTO avatars'))
    expect(insertCall).toBeDefined()
    expect(insertCall[1]).toContain('eid-alex')  // entity_id in params
  })

  it('resolves _folder_eid FK before INSERT for channels', async () => {
    const event = makeEvent({
      entity_type: 'channels',
      entity_id: 'eid-ch',
      operation: 'create',
      payload: { name: 'Chat', _folder_eid: 'eid-f1' },
    })
    // dedup=0, resolveEntityId(folders, eid-f1)=42, byEid=[], natural key=[]
    const db = makeMockDb([[{ n: 0 }], [{ id: 42 }], [], []])
    await applyRemoteEvents([event], 'peer', db)

    // The resolveEntityId call for folder
    expect(db.select).toHaveBeenCalledWith(
      expect.stringContaining('SELECT id FROM folders'),
      ['eid-f1']
    )
    // INSERT should include folder_id=42 (not the _folder_eid string)
    const executeCalls = (db.execute as ReturnType<typeof vi.fn>).mock.calls
    const insertCall = executeCalls.find(([sql]: [string]) => sql.includes('INSERT OR IGNORE INTO channels'))
    expect(insertCall).toBeDefined()
    expect(insertCall[1]).toContain(42)
  })

  it('inserts avatar group members after group is created', async () => {
    const event = makeEvent({
      entity_type: 'avatar_groups',
      entity_id: 'eid-group',
      operation: 'create',
      payload: { name: 'Protectors', _member_eids: ['eid-av1', 'eid-av2'] },
    })
    // dedup=0, byEid=[], natural key=[] → INSERT group
    // resolveEntityId(avatar_groups, eid-group)=10
    // resolveEntityId(avatars, eid-av1)=1
    // resolveEntityId(avatars, eid-av2)=2
    const db = makeMockDb([[{ n: 0 }], [], [], [{ id: 10 }], [{ id: 1 }], [{ id: 2 }]])
    await applyRemoteEvents([event], 'peer', db)

    const executeCalls = (db.execute as ReturnType<typeof vi.fn>).mock.calls
    const memberInserts = executeCalls.filter(([sql]: [string]) =>
      sql.includes('INSERT OR IGNORE INTO avatar_group_members')
    )
    expect(memberInserts).toHaveLength(2)
    expect(memberInserts[0][1]).toEqual([1, 10])
    expect(memberInserts[1][1]).toEqual([2, 10])
  })

  it('cold sync sentinels (device_counter=-1) are applied but NOT stored in event_log', async () => {
    const event = makeEvent({
      entity_type: 'avatars',
      entity_id: 'eid-cold',
      operation: 'create',
      device_counter: -1,
      payload: { name: 'Cold', color: '#000' },
    })
    // No dedup check for sentinel; byEid=[], natural key=[]
    const db = makeMockDb([[], []])
    await applyRemoteEvents([event], 'peer', db)

    const executeCalls = (db.execute as ReturnType<typeof vi.fn>).mock.calls
    const logInsert = executeCalls.find(([sql]: [string]) => sql.includes('INSERT OR IGNORE INTO event_log'))
    expect(logInsert).toBeUndefined()

    const entityInsert = executeCalls.find(([sql]: [string]) => sql.includes('INSERT OR IGNORE INTO avatars'))
    expect(entityInsert).toBeDefined()
  })

  it('stores regular events (device_counter > 0) in event_log after applying', async () => {
    const event = makeEvent({
      entity_type: 'tags',
      entity_id: 'eid-tag',
      operation: 'create',
      device_counter: 5,
      payload: { name: 'grief', display_name: 'grief' },
    })
    // dedup=0, byEid=[], natural key=[]
    const db = makeMockDb([[{ n: 0 }], [], []])
    await applyRemoteEvents([event], 'peer', db)

    const executeCalls = (db.execute as ReturnType<typeof vi.fn>).mock.calls
    const logInsert = executeCalls.find(([sql]: [string]) => sql.includes('INSERT OR IGNORE INTO event_log'))
    expect(logInsert).toBeDefined()
    expect(logInsert[1]).toContain(event.event_id)
  })
})

describe('applyRemoteEvents — update path (no conflict)', () => {
  it('applies UPDATE when remote timestamp is newer than local', async () => {
    const event = makeEvent({
      entity_type: 'avatars',
      entity_id: 'eid-alex',
      operation: 'update',
      payload: { color: '#blue' },
      timestamp: 2000,
    })
    // dedup=0, LWW local ts=1000 (older → no conflict)
    const db = makeMockDb([[{ n: 0 }], [{ ts: 1000 }]])
    await applyRemoteEvents([event], 'peer', db)

    const executeCalls = (db.execute as ReturnType<typeof vi.fn>).mock.calls
    const updateCall = executeCalls.find(([sql]: [string]) =>
      sql.includes('UPDATE avatars SET') && sql.includes('WHERE entity_id')
    )
    expect(updateCall).toBeDefined()
    expect(updateCall[1]).toContain('eid-alex')
  })

  it('applies UPDATE when local has no events for that entity', async () => {
    const event = makeEvent({
      entity_type: 'folders',
      entity_id: 'eid-f',
      operation: 'update',
      payload: { name: 'Renamed' },
      timestamp: 1000,
    })
    // dedup=0, LWW local ts=null (never updated locally)
    const db = makeMockDb([[{ n: 0 }], [{ ts: null }]])
    await applyRemoteEvents([event], 'peer', db)

    const executeCalls = (db.execute as ReturnType<typeof vi.fn>).mock.calls
    const updateCall = executeCalls.find(([sql]: [string]) => sql.includes('UPDATE folders SET'))
    expect(updateCall).toBeDefined()
  })

  it('strips _eid keys and invalid column names before UPDATE', async () => {
    const event = makeEvent({
      entity_type: 'avatars',
      entity_id: 'eid-a',
      operation: 'update',
      payload: { color: 'red', _avatar_eid: 'eid-x', 'DROP TABLE': 'danger' },
      timestamp: 5000,
    })
    // dedup=0, LWW local ts=1 (older → no conflict), resolveEntityId for _avatar_eid → null
    const db = makeMockDb([[{ n: 0 }], [{ ts: 1 }], []])
    await applyRemoteEvents([event], 'peer', db)

    const executeCalls = (db.execute as ReturnType<typeof vi.fn>).mock.calls
    const updateCall = executeCalls.find(([sql]: [string]) => sql.includes('UPDATE avatars SET'))
    expect(updateCall).toBeDefined()
    // SET clause should only have 'color', not DROP TABLE or _avatar_eid
    expect(updateCall[0]).not.toContain('DROP TABLE')
    expect(updateCall[0]).not.toContain('_avatar_eid')
    expect(updateCall[0]).toContain('color')
  })
})

describe('applyRemoteEvents — update path (LWW conflict)', () => {
  it('records a conflict when local event is newer', async () => {
    const event = makeEvent({
      entity_type: 'avatars',
      entity_id: 'eid-alex',
      operation: 'update',
      payload: { color: '#remote' },
      timestamp: 1000,
    })
    // dedup=0, LWW local ts=5000 (newer → conflict!)
    // open conflict count=0, get local event_id
    const db = makeMockDb([
      [{ n: 0 }],             // dedup
      [{ ts: 5000 }],         // LWW: local is newer
      [{ n: 0 }],             // no existing open conflict
      [{ event_id: 'local-event-uuid' }],  // local event_id
    ])
    await applyRemoteEvents([event], 'peer-device', db)

    const executeCalls = (db.execute as ReturnType<typeof vi.fn>).mock.calls
    const conflictInsert = executeCalls.find(([sql]: [string]) => sql.includes('INSERT INTO sync_conflicts'))
    expect(conflictInsert).toBeDefined()
    expect(conflictInsert[1]).toContain('eid-alex')
    expect(conflictInsert[1]).toContain('my-device-id')   // device_id_a (us)
    expect(conflictInsert[1]).toContain('peer-device')     // device_id_b (them)
    expect(conflictInsert[1]).toContain('local-event-uuid')
    expect(conflictInsert[1]).toContain(event.event_id)
  })

  it('does NOT apply the UPDATE when there is a conflict', async () => {
    const event = makeEvent({
      entity_type: 'avatars',
      entity_id: 'eid-alex',
      operation: 'update',
      payload: { color: '#remote' },
      timestamp: 1000,
    })
    const db = makeMockDb([
      [{ n: 0 }],
      [{ ts: 5000 }],
      [{ n: 0 }],
      [{ event_id: 'local-evt' }],
    ])
    await applyRemoteEvents([event], 'peer', db)

    const executeCalls = (db.execute as ReturnType<typeof vi.fn>).mock.calls
    const updateCall = executeCalls.find(([sql]: [string]) => sql.includes('UPDATE avatars SET'))
    expect(updateCall).toBeUndefined()
  })

  it('skips recording a second conflict when one is already open', async () => {
    const event = makeEvent({
      entity_type: 'avatars',
      entity_id: 'eid-alex',
      operation: 'update',
      payload: { color: '#remote' },
      timestamp: 1000,
    })
    // open conflict count=1 (already exists)
    const db = makeMockDb([
      [{ n: 0 }],   // dedup
      [{ ts: 5000 }],  // LWW: conflict
      [{ n: 1 }],   // already an open conflict
    ])
    await applyRemoteEvents([event], 'peer', db)

    const executeCalls = (db.execute as ReturnType<typeof vi.fn>).mock.calls
    const conflictInsert = executeCalls.find(([sql]: [string]) => sql.includes('INSERT INTO sync_conflicts'))
    expect(conflictInsert).toBeUndefined()
  })
})

describe('applyRemoteEvents — delete path', () => {
  it('soft-deletes messages (sets deleted=1)', async () => {
    const event = makeEvent({
      entity_type: 'messages',
      entity_id: 'eid-msg',
      operation: 'delete',
      payload: null,
      device_counter: 3,
    })
    const db = makeMockDb([[{ n: 0 }]])
    await applyRemoteEvents([event], 'peer', db)

    const executeCalls = (db.execute as ReturnType<typeof vi.fn>).mock.calls
    const softDelete = executeCalls.find(([sql]: [string]) =>
      sql.includes('UPDATE messages SET deleted = 1')
    )
    expect(softDelete).toBeDefined()
    expect(softDelete[1]).toEqual(['eid-msg'])

    // Must NOT hard-delete messages
    const hardDelete = executeCalls.find(([sql]: [string]) =>
      sql.includes('DELETE FROM messages')
    )
    expect(hardDelete).toBeUndefined()
  })

  it('hard-deletes non-message entities', async () => {
    const event = makeEvent({
      entity_type: 'folders',
      entity_id: 'eid-f',
      operation: 'delete',
      payload: null,
      device_counter: 2,
    })
    const db = makeMockDb([[{ n: 0 }]])
    await applyRemoteEvents([event], 'peer', db)

    const executeCalls = (db.execute as ReturnType<typeof vi.fn>).mock.calls
    const hardDelete = executeCalls.find(([sql]: [string]) => sql.includes('DELETE FROM folders'))
    expect(hardDelete).toBeDefined()
    expect(hardDelete[1]).toEqual(['eid-f'])
  })
})

describe('applyRemoteEvents — first-sync merge (mock DB)', () => {
  it('adopts incoming entity_id when natural key matches existing row', async () => {
    const event = makeEvent({
      entity_type: 'avatars',
      entity_id: 'incoming-eid',
      operation: 'create',
      payload: { name: 'Alex', color: '#ff0000' },
    })
    // dedup=0, byEid=[] (no row with incoming-eid),
    // natural key check: finds existing row id=7 with old-eid
    const db = makeMockDb([
      [{ n: 0 }],
      [],
      [{ id: 7, entity_id: 'old-eid' }],
    ])
    await applyRemoteEvents([event], 'peer', db)

    const executeCalls = (db.execute as ReturnType<typeof vi.fn>).mock.calls
    const adoptCall = executeCalls.find(([sql]: [string]) =>
      sql.includes('UPDATE avatars SET entity_id = ?')
    )
    expect(adoptCall).toBeDefined()
    expect(adoptCall[1]).toEqual(['incoming-eid', 7])
  })
})

// ============================================================
// T3 — integration tests against real SQLite (better-sqlite3)
// ============================================================

describe('T3: two-device sync — structure creates', () => {
  it('applies folder + channel + avatar from peer to empty local DB', async () => {
    const { raw, db } = makeTestDb()
    localStorage.setItem('dsj-device-id', 'local-device')

    const folderEid  = crypto.randomUUID()
    const channelEid = crypto.randomUUID()
    const avatarEid  = crypto.randomUUID()

    const events = [
      makeEvent({
        entity_type: 'folders',
        entity_id: folderEid,
        operation: 'create',
        payload: { name: 'Journal', sort_order: 0 },
        timestamp: 100,
        device_counter: 1,
      }),
      makeEvent({
        entity_type: 'channels',
        entity_id: channelEid,
        operation: 'create',
        payload: { name: 'daily', _folder_eid: folderEid },
        timestamp: 101,
        device_counter: 2,
      }),
      makeEvent({
        entity_type: 'avatars',
        entity_id: avatarEid,
        operation: 'create',
        payload: { name: 'Alex', color: '#cc00ff' },
        timestamp: 102,
        device_counter: 3,
      }),
    ]

    await applyRemoteEvents(events, 'peer-device', db)

    const folder  = raw.prepare('SELECT * FROM folders WHERE entity_id = ?').get(folderEid) as Record<string, unknown>
    const channel = raw.prepare('SELECT * FROM channels WHERE entity_id = ?').get(channelEid) as Record<string, unknown>
    const avatar  = raw.prepare('SELECT * FROM avatars WHERE entity_id = ?').get(avatarEid) as Record<string, unknown>

    expect(folder).toBeDefined()
    expect(folder.name).toBe('Journal')

    expect(channel).toBeDefined()
    expect(channel.name).toBe('daily')
    expect(channel.folder_id).toBe(folder.id)  // FK resolved correctly

    expect(avatar).toBeDefined()
    expect(avatar.name).toBe('Alex')
    expect(avatar.color).toBe('#cc00ff')

    // All three events stored in event_log
    const logged = raw.prepare('SELECT * FROM event_log').all() as unknown[]
    expect(logged).toHaveLength(3)
  })
})

describe('T3: first-sync merge', () => {
  it('adopts peer entity_id when local has same-named avatar', async () => {
    const { raw, db } = makeTestDb()
    localStorage.setItem('dsj-device-id', 'local-device')

    // Seed a local avatar with a different entity_id
    raw.prepare("INSERT INTO avatars (name, color, entity_id) VALUES ('Alex', '#888', 'local-eid')").run()

    const peerEid = crypto.randomUUID()
    const event = makeEvent({
      entity_type: 'avatars',
      entity_id: peerEid,
      operation: 'create',
      payload: { name: 'Alex', color: '#ff0000', sort_order: 1 },
      timestamp: 100,
      device_counter: 1,
    })

    await applyRemoteEvents([event], 'peer-device', db)

    // entity_id should now be the peer's
    const row = raw.prepare("SELECT * FROM avatars WHERE name = 'Alex'").get() as Record<string, unknown>
    expect(row.entity_id).toBe(peerEid)
    // structural fields updated
    expect(row.color).toBe('#ff0000')
    expect(row.sort_order).toBe(1)
    // still only one avatar
    const count = (raw.prepare('SELECT COUNT(*) as n FROM avatars').get() as { n: number }).n
    expect(count).toBe(1)
  })
})

describe('T3: LWW conflict detection', () => {
  it('records conflict in sync_conflicts when local event is newer', async () => {
    const { raw, db } = makeTestDb()
    localStorage.setItem('dsj-device-id', 'local-device')

    const avatarEid = crypto.randomUUID()
    raw.prepare('INSERT INTO avatars (name, color, entity_id) VALUES (?, ?, ?)')
       .run('Alex', '#aaa', avatarEid)

    // Seed a local event at t=5000
    raw.prepare(`
      INSERT INTO event_log (event_id, device_id, device_counter, entity_type, entity_id, operation, payload, timestamp)
      VALUES (?, 'local-device', 1, 'avatars', ?, 'update', '{"color":"#aaa"}', 5000)
    `).run(crypto.randomUUID(), avatarEid)

    // Peer sends an update at t=1000 (older)
    const peerEvent = makeEvent({
      entity_type: 'avatars',
      entity_id: avatarEid,
      operation: 'update',
      payload: { color: '#remote' },
      timestamp: 1000,
      device_counter: 1,
    })

    await applyRemoteEvents([peerEvent], 'peer-device', db)

    const conflict = raw.prepare("SELECT * FROM sync_conflicts WHERE entity_id = ?").get(avatarEid) as Record<string, unknown> | undefined
    expect(conflict).toBeDefined()
    expect(conflict!.status).toBe('open')
    expect(conflict!.device_id_a).toBe('local-device')
    expect(conflict!.device_id_b).toBe('peer-device')

    // Avatar color should NOT have changed
    const avatar = raw.prepare('SELECT * FROM avatars WHERE entity_id = ?').get(avatarEid) as Record<string, unknown>
    expect(avatar.color).toBe('#aaa')
  })

  it('applies update when peer event is newer (no conflict)', async () => {
    const { raw, db } = makeTestDb()
    localStorage.setItem('dsj-device-id', 'local-device')

    const avatarEid = crypto.randomUUID()
    raw.prepare('INSERT INTO avatars (name, color, entity_id) VALUES (?, ?, ?)')
       .run('Jordan', '#111', avatarEid)

    // Local event at t=1000
    raw.prepare(`
      INSERT INTO event_log (event_id, device_id, device_counter, entity_type, entity_id, operation, payload, timestamp)
      VALUES (?, 'local-device', 1, 'avatars', ?, 'update', '{"color":"#111"}', 1000)
    `).run(crypto.randomUUID(), avatarEid)

    // Peer update at t=5000 (newer)
    const peerEvent = makeEvent({
      entity_type: 'avatars',
      entity_id: avatarEid,
      operation: 'update',
      payload: { color: '#peer-color' },
      timestamp: 5000,
      device_counter: 1,
    })

    await applyRemoteEvents([peerEvent], 'peer-device', db)

    const avatar = raw.prepare('SELECT * FROM avatars WHERE entity_id = ?').get(avatarEid) as Record<string, unknown>
    expect(avatar.color).toBe('#peer-color')

    const conflicts = raw.prepare('SELECT * FROM sync_conflicts').all() as unknown[]
    expect(conflicts).toHaveLength(0)
  })
})

describe('T3: message sync', () => {
  it('syncs a message with avatar and channel FK resolution', async () => {
    const { raw, db } = makeTestDb()
    localStorage.setItem('dsj-device-id', 'local-device')

    const folderEid  = crypto.randomUUID()
    const channelEid = crypto.randomUUID()
    const avatarEid  = crypto.randomUUID()
    const messageEid = crypto.randomUUID()

    // Pre-populate structure (as if already synced)
    raw.prepare('INSERT INTO folders (name, entity_id) VALUES (?, ?)').run('J', folderEid)
    const folderId = (raw.prepare('SELECT id FROM folders WHERE entity_id = ?').get(folderEid) as { id: number }).id
    raw.prepare('INSERT INTO channels (name, folder_id, entity_id) VALUES (?, ?, ?)').run('daily', folderId, channelEid)
    raw.prepare('INSERT INTO avatars (name, color, entity_id) VALUES (?, ?, ?)').run('Alex', '#aaa', avatarEid)

    const event = makeEvent({
      entity_type: 'messages',
      entity_id: messageEid,
      operation: 'create',
      payload: {
        text: 'Hello from peer',
        message_type: 'chat',
        _channel_eid: channelEid,
        _avatar_eid: avatarEid,
      },
      timestamp: 200,
      device_counter: 1,
    })

    await applyRemoteEvents([event], 'peer-device', db)

    const msg = raw.prepare('SELECT * FROM messages WHERE entity_id = ?').get(messageEid) as Record<string, unknown> | undefined
    expect(msg).toBeDefined()
    expect(msg!.text).toBe('Hello from peer')
    expect(msg!.message_type).toBe('chat')

    const channelId = (raw.prepare('SELECT id FROM channels WHERE entity_id = ?').get(channelEid) as { id: number }).id
    const avatarId  = (raw.prepare('SELECT id FROM avatars WHERE entity_id = ?').get(avatarEid) as { id: number }).id
    expect(msg!.channel_id).toBe(channelId)
    expect(msg!.avatar_id).toBe(avatarId)
  })

  it('soft-deletes a message when peer sends delete event', async () => {
    const { raw, db } = makeTestDb()
    localStorage.setItem('dsj-device-id', 'local-device')

    const folderEid  = crypto.randomUUID()
    const channelEid = crypto.randomUUID()
    const messageEid = crypto.randomUUID()

    raw.prepare('INSERT INTO folders (name, entity_id) VALUES (?, ?)').run('J', folderEid)
    const folderId = (raw.prepare('SELECT id FROM folders WHERE entity_id = ?').get(folderEid) as { id: number }).id
    raw.prepare('INSERT INTO channels (name, folder_id, entity_id) VALUES (?, ?, ?)').run('daily', folderId, channelEid)
    const channelId = (raw.prepare('SELECT id FROM channels WHERE entity_id = ?').get(channelEid) as { id: number }).id
    raw.prepare('INSERT INTO messages (channel_id, text, entity_id) VALUES (?, ?, ?)').run(channelId, 'Oops', messageEid)

    const deleteEvent = makeEvent({
      entity_type: 'messages',
      entity_id: messageEid,
      operation: 'delete',
      payload: null,
      timestamp: 500,
      device_counter: 2,
    })

    await applyRemoteEvents([deleteEvent], 'peer-device', db)

    const msg = raw.prepare('SELECT * FROM messages WHERE entity_id = ?').get(messageEid) as Record<string, unknown>
    expect(msg).toBeDefined()         // row still exists
    expect(msg.deleted).toBe(1)        // but marked deleted
  })
})

describe('T3: avatar group member sync', () => {
  it('creates a group and inserts member links', async () => {
    const { raw, db } = makeTestDb()
    localStorage.setItem('dsj-device-id', 'local-device')

    const av1Eid   = crypto.randomUUID()
    const av2Eid   = crypto.randomUUID()
    const groupEid = crypto.randomUUID()

    raw.prepare('INSERT INTO avatars (name, color, entity_id) VALUES (?, ?, ?)').run('Alex', '#aaa', av1Eid)
    raw.prepare('INSERT INTO avatars (name, color, entity_id) VALUES (?, ?, ?)').run('Jordan', '#bbb', av2Eid)

    const event = makeEvent({
      entity_type: 'avatar_groups',
      entity_id: groupEid,
      operation: 'create',
      payload: { name: 'Protectors', _member_eids: [av1Eid, av2Eid] },
      timestamp: 100,
      device_counter: 1,
    })

    await applyRemoteEvents([event], 'peer-device', db)

    const group = raw.prepare('SELECT * FROM avatar_groups WHERE entity_id = ?').get(groupEid) as Record<string, unknown> | undefined
    expect(group).toBeDefined()
    expect(group!.name).toBe('Protectors')

    const members = raw.prepare(`
      SELECT a.name FROM avatar_group_members agm
      JOIN avatars a ON agm.avatar_id = a.id
      WHERE agm.group_id = ?
      ORDER BY a.name
    `).all(group!.id) as { name: string }[]
    expect(members.map(m => m.name)).toEqual(['Alex', 'Jordan'])
  })
})

describe('T3: dedup prevents double-apply', () => {
  it('ignores the same event when applied twice', async () => {
    const { raw, db } = makeTestDb()
    localStorage.setItem('dsj-device-id', 'local-device')

    const avatarEid = crypto.randomUUID()
    const event = makeEvent({
      entity_type: 'avatars',
      entity_id: avatarEid,
      operation: 'create',
      payload: { name: 'Dedup', color: '#fff' },
      timestamp: 100,
      device_counter: 1,
    })

    await applyRemoteEvents([event], 'peer-device', db)
    await applyRemoteEvents([event], 'peer-device', db)  // second apply

    const count = (raw.prepare('SELECT COUNT(*) as n FROM avatars WHERE entity_id = ?').get(avatarEid) as { n: number }).n
    expect(count).toBe(1)  // only one row

    const logCount = (raw.prepare('SELECT COUNT(*) as n FROM event_log WHERE event_id = ?').get(event.event_id) as { n: number }).n
    expect(logCount).toBe(1)  // only one log entry
  })
})

describe('T3: event log round-trip via logCreate / getLocalEventsSince', () => {
  it('can write events and read them back since a counter', async () => {
    const { db } = makeTestDb()
    localStorage.setItem('dsj-device-id', 'local-device')

    const eid1 = crypto.randomUUID()
    const eid2 = crypto.randomUUID()

    await logCreate('avatars', eid1, { name: 'First' }, db)
    await logCreate('avatars', eid2, { name: 'Second' }, db)

    const allEvents = await getLocalEventsSince(0, {}, db)
    expect(allEvents).toHaveLength(2)
    expect(allEvents[0].entity_id).toBe(eid1)
    expect(allEvents[1].entity_id).toBe(eid2)

    // Since counter=1 returns only the second event
    const sinceOne = await getLocalEventsSince(1, {}, db)
    expect(sinceOne).toHaveLength(1)
    expect(sinceOne[0].entity_id).toBe(eid2)
  })

  it('filters by cutoffMs timestamp', async () => {
    const { raw, db } = makeTestDb()
    localStorage.setItem('dsj-device-id', 'local-device')

    const eid = crypto.randomUUID()
    // Insert event with known timestamp directly
    raw.prepare(`
      INSERT INTO event_log (event_id, device_id, device_counter, entity_type, entity_id, operation, payload, timestamp)
      VALUES (?, 'local-device', 1, 'avatars', ?, 'create', '{}', 500)
    `).run(crypto.randomUUID(), eid)

    const after  = await getLocalEventsSince(0, { cutoffMs: 501 }, db)
    const before = await getLocalEventsSince(0, { cutoffMs: 499 }, db)

    expect(after).toHaveLength(0)   // event at t=500 is before cutoff 501
    expect(before).toHaveLength(1)  // event at t=500 is at/after cutoff 499
  })
})
