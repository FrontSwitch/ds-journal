import { getDb } from './index'
import { getOrCreateDeviceId } from './sync-device'
import type { SyncEvent } from '../types'

// --- Cold sync: structure snapshot ---

export const SYNC_TABLES = new Set([
  'folders', 'channels', 'avatars', 'avatar_groups', 'messages',
  'trackers', 'tracker_fields', 'tracker_records', 'avatar_fields',
  'avatar_notes', 'front_sessions', 'tags', 'emoji_overrides', 'message_images',
])

// Payload fields that are not real DB columns (old integer-based formats) — stripped before INSERT
const VIRTUAL_FIELDS = new Set(['member_ids', 'group_ids', 'field_values', 'values'])

// Allowlist column names from sync payloads to prevent injection via crafted peer events.
// Only lowercase letters and underscores are valid SQLite column names in this schema.
function safeCol(name: string): boolean {
  return /^[a-z_]+$/.test(name)
}

function sanitizePayload(payload: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(payload).filter(([k]) => safeCol(k)))
}

// Maps _*_eid payload keys → the integer FK column they resolve to + the table to look up.
// All _*_eid keys are stripped from the payload after resolution.
const EID_TO_FK = [
  { eid: '_folder_eid',         col: 'folder_id',         table: 'folders' },
  { eid: '_channel_eid',        col: 'channel_id',        table: 'channels' },
  { eid: '_tracker_eid',        col: 'tracker_id',        table: 'trackers' },
  { eid: '_avatar_eid',         col: 'avatar_id',         table: 'avatars' },
  { eid: '_author_avatar_eid',  col: 'author_avatar_id',  table: 'avatars' },
  { eid: '_editor_avatar_eid',  col: 'editor_avatar_id',  table: 'avatars' },
  { eid: '_parent_msg_eid',     col: 'parent_msg_id',     table: 'messages' },
  { eid: '_tracker_record_eid', col: 'tracker_record_id', table: 'tracker_records' },
] as const

// Natural key columns used to match existing rows during first-sync merge.
// When a create event arrives for an entity that already exists under a different
// entity_id, we adopt the incoming entity_id rather than inserting a duplicate.
const NATURAL_KEY_COLS: Partial<Record<string, string[]>> = {
  folders:       ['name'],
  channels:      ['name'],
  avatars:       ['name'],
  avatar_groups: ['name'],
  avatar_fields: ['name'],
  trackers:      ['name'],
  tracker_fields: ['name', 'tracker_id'],  // tracker_id resolved to local int before merge
  tags:          ['name'],
  emoji_overrides: ['name'],
}

/** Resolve a known entity_id to the local integer PK. */
async function resolveEntityId(table: string, entityId: string): Promise<number | null> {
  const db = await getDb()
  const rows = await db.select<{ id: number }[]>(
    `SELECT id FROM ${table} WHERE entity_id = ?`, [entityId]
  )
  return rows[0]?.id ?? null
}

/**
 * Insert an entity row, but first check for a name-match on the local device.
 * If a row with the same natural key already exists under a different entity_id,
 * we adopt the incoming entity_id (first-sync merge) instead of inserting a duplicate.
 */
async function mergeOrInsert(
  db: Awaited<ReturnType<typeof getDb>>,
  entityType: string,
  entityId: string,
  payload: Record<string, unknown>
): Promise<void> {
  // Already have this exact entity_id → nothing to do
  const byEid = await db.select<{ id: number }[]>(
    `SELECT id FROM ${entityType} WHERE entity_id = ?`, [entityId]
  )
  if (byEid.length > 0) return

  const naturalKeys = NATURAL_KEY_COLS[entityType]
  if (naturalKeys) {
    const whereClause = naturalKeys.map(k => `${k} = ?`).join(' AND ')
    const whereVals = naturalKeys.map(k => payload[k])
    // Only merge if all key columns are present in the payload
    if (whereVals.every(v => v !== undefined && v !== null)) {
      const existing = await db.select<{ id: number; entity_id: string | null }[]>(
        `SELECT id, entity_id FROM ${entityType} WHERE ${whereClause} LIMIT 1`,
        whereVals
      )
      if (existing.length > 0) {
        // Adopt the incoming entity_id so both devices agree on identity
        console.warn('[sync] First-sync merge:', entityType, existing[0].entity_id, '→', entityId)
        await db.execute(
          `UPDATE ${entityType} SET entity_id = ? WHERE id = ?`,
          [entityId, existing[0].id]
        )
        // Also apply structural fields (folder placement, color, sort_order, etc.)
        // so structure is consistent across devices after first-sync merge.
        // Exclude created_at (preserve local timestamp) and entity_id (just set above).
        const updateFields = Object.entries(sanitizePayload(payload)).filter(([k]) => k !== 'entity_id' && k !== 'created_at')
        if (updateFields.length > 0) {
          const setClauses = updateFields.map(([k]) => `${k} = ?`).join(', ')
          await db.execute(
            `UPDATE ${entityType} SET ${setClauses} WHERE id = ?`,
            [...updateFields.map(([, v]) => v), existing[0].id]
          )
        }
        return
      }
    }
  }

  // No matching row — insert as new
  const safe = sanitizePayload(payload)
  const cols = [...Object.keys(safe), 'entity_id']
  const vals = [...Object.values(safe), entityId]
  await db.execute(
    `INSERT OR IGNORE INTO ${entityType} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
    vals
  )
}

/**
 * Build a snapshot of all structure entities as synthetic create events.
 * device_counter=-1 is a sentinel: these events are applied but NOT stored in event_log.
 * FK references use _*_eid fields (entity_ids) instead of integer IDs so they
 * resolve correctly on any device.
 */
export async function buildStructureSnapshot(): Promise<SyncEvent[]> {
  const db = await getDb()
  const deviceId = getOrCreateDeviceId()
  const events: SyncEvent[] = []

  const makeEvent = (
    entity_type: string,
    entity_id: string,
    payload: Record<string, unknown>
  ): SyncEvent => ({
    event_id: crypto.randomUUID(),
    device_id: deviceId,
    device_counter: -1,  // sentinel: cold sync snapshot
    entity_type,
    entity_id,
    operation: 'create',
    payload: JSON.stringify(payload),
    timestamp: 0,
  })

  // folders
  const folders = await db.select<Record<string, unknown>[]>(
    `SELECT entity_id, name, description, color, hidden, sort_order, created_at, view_mode
     FROM folders WHERE entity_id IS NOT NULL`
  )
  for (const row of folders) {
    const { entity_id, ...payload } = row
    events.push(makeEvent('folders', entity_id as string, payload))
  }

  // channels (folder_id → _folder_eid)
  const channels = await db.select<Record<string, unknown>[]>(
    `SELECT c.entity_id, c.name, c.description, c.color, c.hidden, c.sort_order, c.created_at, c.view_mode,
            f.entity_id AS _folder_eid
     FROM channels c LEFT JOIN folders f ON c.folder_id = f.id
     WHERE c.entity_id IS NOT NULL`
  )
  for (const row of channels) {
    const { entity_id, ...payload } = row
    events.push(makeEvent('channels', entity_id as string, payload))
  }

  // avatar_groups (with _member_eids)
  const agroups = await db.select<Record<string, unknown>[]>(
    `SELECT entity_id, name, description, color, hidden, sort_order, created_at
     FROM avatar_groups WHERE entity_id IS NOT NULL`
  )
  for (const row of agroups) {
    const { entity_id, ...payload } = row
    const members = await db.select<{ eid: string }[]>(
      `SELECT a.entity_id AS eid FROM avatar_group_members agm
       JOIN avatars a ON agm.avatar_id = a.id
       WHERE agm.group_id = (SELECT id FROM avatar_groups WHERE entity_id = ?)`,
      [entity_id as string]
    )
    events.push(makeEvent('avatar_groups', entity_id as string, {
      ...payload,
      _member_eids: members.map(m => m.eid),
    }))
  }

  // avatar_fields
  const afields = await db.select<Record<string, unknown>[]>(
    `SELECT entity_id, name, field_type, list_values, sort_order, created_at
     FROM avatar_fields WHERE entity_id IS NOT NULL`
  )
  for (const row of afields) {
    const { entity_id, ...payload } = row
    events.push(makeEvent('avatar_fields', entity_id as string, payload))
  }

  // avatars (with _field_values)
  const avatars = await db.select<Record<string, unknown>[]>(
    `SELECT entity_id, name, color, image_path, image_data, description, pronouns, hidden, icon_letters, sort_order, created_at
     FROM avatars WHERE entity_id IS NOT NULL`
  )
  for (const row of avatars) {
    const { entity_id, ...payload } = row
    const fieldVals = await db.select<{ eid: string; value: string }[]>(
      `SELECT af.entity_id AS eid, afv.value FROM avatar_field_values afv
       JOIN avatar_fields af ON afv.field_id = af.id
       WHERE afv.avatar_id = (SELECT id FROM avatars WHERE entity_id = ?)`,
      [entity_id as string]
    )
    events.push(makeEvent('avatars', entity_id as string, {
      ...payload,
      _field_values: fieldVals,
    }))
  }

  // trackers (channel_id → _channel_eid)
  const trackers = await db.select<Record<string, unknown>[]>(
    `SELECT t.entity_id, t.name, t.description, t.color, t.hidden, t.sort_order, t.created_at,
            c.entity_id AS _channel_eid
     FROM trackers t JOIN channels c ON t.channel_id = c.id
     WHERE t.entity_id IS NOT NULL`
  )
  for (const row of trackers) {
    const { entity_id, ...payload } = row
    events.push(makeEvent('trackers', entity_id as string, payload))
  }

  // tracker_fields (tracker_id → _tracker_eid)
  const tfields = await db.select<Record<string, unknown>[]>(
    `SELECT tf.entity_id, tf.name, tf.field_type, tf.sort_order, tf.required, tf.list_values,
            tf.range_min, tf.range_max, tf.custom_editor, tf.summary_op, tf.default_value,
            t.entity_id AS _tracker_eid
     FROM tracker_fields tf JOIN trackers t ON tf.tracker_id = t.id
     WHERE tf.entity_id IS NOT NULL`
  )
  for (const row of tfields) {
    const { entity_id, ...payload } = row
    events.push(makeEvent('tracker_fields', entity_id as string, payload))
  }

  // tags
  const tags = await db.select<Record<string, unknown>[]>(
    `SELECT entity_id, name, display_name, created_at, last_used_at FROM tags WHERE entity_id IS NOT NULL`
  )
  for (const row of tags) {
    const { entity_id, ...payload } = row
    events.push(makeEvent('tags', entity_id as string, payload))
  }

  // emoji_overrides
  const overrides = await db.select<Record<string, unknown>[]>(
    `SELECT entity_id, name, aliases, emoji, category, created_at FROM emoji_overrides WHERE entity_id IS NOT NULL`
  )
  for (const row of overrides) {
    const { entity_id, ...payload } = row
    events.push(makeEvent('emoji_overrides', entity_id as string, payload))
  }

  return events
}

// --- Apply remote events (incoming sync) ---

export async function applyRemoteEvents(
  events: SyncEvent[],
  theirDeviceId: string
): Promise<void> {
  if (events.length === 0) return
  const db = await getDb()
  const myDeviceId = getOrCreateDeviceId()
  // Sort by timestamp; snapshot events (ts=0) always applied first for FK resolution
  const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp)

  for (const event of sorted) {
    // Dedup check — skip for snapshot sentinels (counter=-1) since they're idempotent
    if (event.device_counter !== -1) {
      const exists = await db.select<{ n: number }[]>(
        `SELECT COUNT(*) as n FROM event_log WHERE event_id = ?`, [event.event_id]
      )
      if (exists[0].n > 0) {
        console.warn('[sync] Event already applied, skipping:', event.event_id)
        continue
      }
    }

    if (!SYNC_TABLES.has(event.entity_type)) {
      console.warn('[sync] Unknown entity_type, skipping:', event.entity_type)
      continue
    }

    try {
      if (event.operation === 'create' && event.payload) {
        const payload = JSON.parse(event.payload) as Record<string, unknown>

        // Resolve all _*_eid FK references → local integer IDs.
        // Also removes any stale integer FK that may be present alongside the eid.
        for (const { eid, col, table } of EID_TO_FK) {
          if (eid in payload) {
            delete payload[col]  // remove stale integer if present
            const localId = payload[eid] ? await resolveEntityId(table, payload[eid] as string) : null
            delete payload[eid]
            payload[col] = localId
          }
        }

        // Extract virtual/junction fields before INSERT
        const _member_eids = payload._member_eids as string[] | undefined; delete payload._member_eids
        const _field_values = payload._field_values as { eid: string; value: string }[] | undefined; delete payload._field_values
        type RecordValue = { field_eid: string; value_text?: string | null; value_number?: number | null; value_boolean?: number | null; _value_avatar_eid?: string | null }
        const _record_values = payload._record_values as RecordValue[] | undefined; delete payload._record_values

        // Drop old-format virtual fields
        for (const vf of VIRTUAL_FIELDS) delete payload[vf]

        console.warn('[sync] Applying create for', event.entity_type, event.entity_id)
        await mergeOrInsert(db, event.entity_type, event.entity_id, payload)

        // Apply junction/child tables after entity is guaranteed to exist
        if (_member_eids && event.entity_type === 'avatar_groups') {
          const groupId = await resolveEntityId('avatar_groups', event.entity_id)
          if (groupId) {
            for (const avatarEid of _member_eids) {
              const avatarId = await resolveEntityId('avatars', avatarEid)
              if (avatarId) await db.execute(
                `INSERT OR IGNORE INTO avatar_group_members (avatar_id, group_id) VALUES (?, ?)`,
                [avatarId, groupId]
              )
            }
          }
        }
        if (_field_values && event.entity_type === 'avatars') {
          const avatarId = await resolveEntityId('avatars', event.entity_id)
          if (avatarId) {
            for (const fv of _field_values) {
              const fieldId = await resolveEntityId('avatar_fields', fv.eid)
              if (fieldId) await db.execute(
                `INSERT OR REPLACE INTO avatar_field_values (avatar_id, field_id, value) VALUES (?, ?, ?)`,
                [avatarId, fieldId, fv.value]
              )
            }
          }
        }
        if (_record_values && event.entity_type === 'tracker_records') {
          const recordId = await resolveEntityId('tracker_records', event.entity_id)
          if (recordId) {
            for (const rv of _record_values) {
              const fieldId = await resolveEntityId('tracker_fields', rv.field_eid)
              if (!fieldId) continue
              const valueAvatarId = rv._value_avatar_eid
                ? await resolveEntityId('avatars', rv._value_avatar_eid)
                : null
              await db.execute(
                `INSERT OR REPLACE INTO tracker_record_values
                   (record_id, field_id, value_text, value_number, value_boolean, value_avatar_id)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [recordId, fieldId, rv.value_text ?? null, rv.value_number ?? null, rv.value_boolean ?? null, valueAvatarId]
              )
            }
          }
        }

      } else if (event.operation === 'update' && event.payload) {
        const payload = JSON.parse(event.payload) as Record<string, unknown>

        // Resolve FK eids and drop stale integers
        for (const { eid, col, table } of EID_TO_FK) {
          if (eid in payload) {
            delete payload[col]
            const localId = payload[eid] ? await resolveEntityId(table, payload[eid] as string) : null
            delete payload[eid]
            payload[col] = localId
          }
        }

        // Extract junction fields
        const _member_eids = payload._member_eids as string[] | undefined; delete payload._member_eids
        const _field_values = payload._field_values as { eid: string; value: string }[] | undefined; delete payload._field_values

        // Drop old-format virtual fields
        for (const vf of VIRTUAL_FIELDS) delete payload[vf]

        // LWW: skip if we have a newer local change for this entity
        const ourLatest = await db.select<{ ts: number | null }[]>(
          `SELECT MAX(timestamp) as ts FROM event_log WHERE entity_id = ? AND device_id = ?`,
          [event.entity_id, myDeviceId]
        )
        if (ourLatest[0]?.ts != null && ourLatest[0].ts > event.timestamp) {
          console.warn('[sync] CONFLICT — keeping local version for', event.entity_type, event.entity_id)
          // Only record if no open conflict already exists for this entity
          const openCount = await db.select<{ n: number }[]>(
            `SELECT COUNT(*) as n FROM sync_conflicts WHERE entity_id = ? AND status = 'open'`,
            [event.entity_id]
          )
          if (openCount[0].n === 0) {
            const localEventRow = await db.select<{ event_id: string }[]>(
              `SELECT event_id FROM event_log WHERE entity_id = ? AND device_id = ? ORDER BY device_counter DESC LIMIT 1`,
              [event.entity_id, myDeviceId]
            )
            const localEventId = localEventRow[0]?.event_id ?? ''
            const fieldNames = Object.keys(payload).filter(k => !k.startsWith('_')).join(', ')
            await db.execute(
              `INSERT INTO sync_conflicts
                 (id, entity_type, entity_id, field_name, device_id_a, event_id_a, device_id_b, event_id_b, detected_at, status)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open')`,
              [crypto.randomUUID(), event.entity_type, event.entity_id,
               fieldNames, myDeviceId, localEventId, theirDeviceId, event.event_id, Date.now()]
            )
          }
        } else {
          const safePayload = sanitizePayload(payload)
          if (Object.keys(safePayload).length > 0) {
            const setClauses = Object.keys(safePayload).map(k => `${k} = ?`).join(', ')
            console.warn('[sync] Applying update for', event.entity_type, event.entity_id)
            await db.execute(
              `UPDATE ${event.entity_type} SET ${setClauses} WHERE entity_id = ?`,
              [...Object.values(safePayload), event.entity_id]
            )
          }

          // Apply junction table updates (entity_id-based format only)
          if (_member_eids !== undefined && event.entity_type === 'avatar_groups') {
            const groupId = await resolveEntityId('avatar_groups', event.entity_id)
            if (groupId) {
              await db.execute(`DELETE FROM avatar_group_members WHERE group_id = ?`, [groupId])
              for (const avatarEid of _member_eids) {
                const avatarId = await resolveEntityId('avatars', avatarEid)
                if (avatarId) await db.execute(
                  `INSERT OR IGNORE INTO avatar_group_members (avatar_id, group_id) VALUES (?, ?)`,
                  [avatarId, groupId]
                )
              }
            }
          }
          if (_field_values !== undefined && event.entity_type === 'avatars') {
            const avatarId = await resolveEntityId('avatars', event.entity_id)
            if (avatarId) {
              await db.execute(`DELETE FROM avatar_field_values WHERE avatar_id = ?`, [avatarId])
              for (const fv of _field_values) {
                const fieldId = await resolveEntityId('avatar_fields', fv.eid)
                if (fieldId) await db.execute(
                  `INSERT OR REPLACE INTO avatar_field_values (avatar_id, field_id, value) VALUES (?, ?, ?)`,
                  [avatarId, fieldId, fv.value]
                )
              }
            }
          }
        }

      } else if (event.operation === 'delete') {
        if (event.entity_type === 'messages') {
          await db.execute(`UPDATE messages SET deleted = 1 WHERE entity_id = ?`, [event.entity_id])
        } else {
          await db.execute(`DELETE FROM ${event.entity_type} WHERE entity_id = ?`, [event.entity_id])
        }
      }
    } catch (e) {
      console.warn('[sync] Failed to apply event', event.event_id, e)
    }

    // Store event in our log — skip cold sync snapshots (counter=-1)
    if (event.device_counter !== -1) {
      await db.execute(
        `INSERT OR IGNORE INTO event_log
           (event_id, device_id, device_counter, entity_type, entity_id, operation, payload, timestamp)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [event.event_id, event.device_id, event.device_counter,
         event.entity_type, event.entity_id, event.operation, event.payload ?? null, event.timestamp]
      )
    }
  }
}
