import { getDb } from './index'
import { getOrCreateDeviceId } from './sync-device'
import type { NativeDb } from '../native/db'
import type { SyncEvent } from '../types'

// --- Event log helpers ---

async function nextCounter(deviceId: string, db: NativeDb): Promise<number> {
  const rows = await db.select<{ n: number }[]>(
    `SELECT COALESCE(MAX(device_counter), 0) + 1 AS n FROM event_log WHERE device_id = ?`,
    [deviceId]
  )
  return rows[0]?.n ?? 1
}

export async function logCreate(
  entityType: string,
  entityId: string,
  payload: Record<string, unknown>,
  injectedDb?: NativeDb
): Promise<void> {
  const db = injectedDb ?? await getDb()
  const deviceId = getOrCreateDeviceId()
  const counter = await nextCounter(deviceId, db)
  await db.execute(
    `INSERT INTO event_log (event_id, device_id, device_counter, entity_type, entity_id, operation, payload, timestamp)
     VALUES (?, ?, ?, ?, ?, 'create', ?, ?)`,
    [crypto.randomUUID(), deviceId, counter, entityType, entityId, JSON.stringify(payload), Date.now()]
  )
}

export async function logUpdate(
  entityType: string,
  entityId: string,
  payload: Record<string, unknown>,
  injectedDb?: NativeDb
): Promise<void> {
  const db = injectedDb ?? await getDb()
  const deviceId = getOrCreateDeviceId()
  const counter = await nextCounter(deviceId, db)
  await db.execute(
    `INSERT INTO event_log (event_id, device_id, device_counter, entity_type, entity_id, operation, payload, timestamp)
     VALUES (?, ?, ?, ?, ?, 'update', ?, ?)`,
    [crypto.randomUUID(), deviceId, counter, entityType, entityId, JSON.stringify(payload), Date.now()]
  )
}

export async function logDelete(
  entityType: string,
  entityId: string,
  injectedDb?: NativeDb
): Promise<void> {
  const db = injectedDb ?? await getDb()
  const deviceId = getOrCreateDeviceId()
  const counter = await nextCounter(deviceId, db)
  await db.execute(
    `INSERT INTO event_log (event_id, device_id, device_counter, entity_type, entity_id, operation, payload, timestamp)
     VALUES (?, ?, ?, ?, ?, 'delete', NULL, ?)`,
    [crypto.randomUUID(), deviceId, counter, entityType, entityId, Date.now()]
  )
}

/** Fetch entity_id for id, then emit an update event — no-op if entity_id is missing. */
export async function logUpdateById(
  entityType: string,
  id: number,
  payload: Record<string, unknown>,
  injectedDb?: NativeDb
): Promise<void> {
  const entityId = await getEntityId(entityType, id, injectedDb)
  if (entityId) await logUpdate(entityType, entityId, payload, injectedDb)
}

/** Look up the entity_id for any content-table row by its integer PK. */
export async function getEntityId(
  table: string,
  id: number,
  injectedDb?: NativeDb
): Promise<string | null> {
  const db = injectedDb ?? await getDb()
  const rows = await db.select<{ entity_id: string | null }[]>(
    `SELECT entity_id FROM ${table} WHERE id = ?`, [id]
  )
  return rows[0]?.entity_id ?? null
}

// --- Event retrieval (for sending to a peer) ---

export interface GetEventsOptions {
  /** Only include events at or after this ms timestamp (0 or undefined = all) */
  cutoffMs?: number
  /** Filter out message/tracker_record events for channels/trackers with sync_enabled=0 */
  respectSyncEnabled?: boolean
}

export async function getLocalEventsSince(
  sinceCounter: number,
  options?: GetEventsOptions,
  injectedDb?: NativeDb
): Promise<SyncEvent[]> {
  const db = injectedDb ?? await getDb()
  const deviceId = getOrCreateDeviceId()
  const params: unknown[] = [deviceId, sinceCounter]
  const conditions: string[] = ['el.device_id = ?', 'el.device_counter > ?']

  if (options?.cutoffMs && options.cutoffMs > 0) {
    conditions.push('el.timestamp >= ?')
    params.push(options.cutoffMs)
  }

  const syncFilter = options?.respectSyncEnabled
    ? `AND (
        el.entity_type NOT IN ('messages', 'tracker_records')
        OR (el.entity_type = 'messages' AND EXISTS (
          SELECT 1 FROM messages m JOIN channels c ON m.channel_id = c.id
          WHERE m.entity_id = el.entity_id AND COALESCE(c.sync_enabled, 1) = 1
        ))
        OR (el.entity_type = 'tracker_records' AND EXISTS (
          SELECT 1 FROM tracker_records tr JOIN trackers t ON tr.tracker_id = t.id
          WHERE tr.entity_id = el.entity_id AND COALESCE(t.sync_enabled, 1) = 1
        ))
      )`
    : ''

  return db.select<SyncEvent[]>(
    `SELECT el.* FROM event_log el WHERE ${conditions.join(' AND ')} ${syncFilter} ORDER BY el.device_counter ASC`,
    params
  )
}
