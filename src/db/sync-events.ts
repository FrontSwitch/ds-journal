import { getDb } from './index'
import { getOrCreateDeviceId } from './sync-device'
import type { SyncEvent } from '../types'

// --- Event log helpers ---

async function nextCounter(deviceId: string): Promise<number> {
  const db = await getDb()
  const rows = await db.select<{ n: number }[]>(
    `SELECT COALESCE(MAX(device_counter), 0) + 1 AS n FROM event_log WHERE device_id = ?`,
    [deviceId]
  )
  return rows[0]?.n ?? 1
}

export async function logCreate(
  entityType: string,
  entityId: string,
  payload: Record<string, unknown>
): Promise<void> {
  const db = await getDb()
  const deviceId = getOrCreateDeviceId()
  const counter = await nextCounter(deviceId)
  await db.execute(
    `INSERT INTO event_log (event_id, device_id, device_counter, entity_type, entity_id, operation, payload, timestamp)
     VALUES (?, ?, ?, ?, ?, 'create', ?, ?)`,
    [crypto.randomUUID(), deviceId, counter, entityType, entityId, JSON.stringify(payload), Date.now()]
  )
}

export async function logUpdate(
  entityType: string,
  entityId: string,
  payload: Record<string, unknown>
): Promise<void> {
  const db = await getDb()
  const deviceId = getOrCreateDeviceId()
  const counter = await nextCounter(deviceId)
  await db.execute(
    `INSERT INTO event_log (event_id, device_id, device_counter, entity_type, entity_id, operation, payload, timestamp)
     VALUES (?, ?, ?, ?, ?, 'update', ?, ?)`,
    [crypto.randomUUID(), deviceId, counter, entityType, entityId, JSON.stringify(payload), Date.now()]
  )
}

export async function logDelete(
  entityType: string,
  entityId: string
): Promise<void> {
  const db = await getDb()
  const deviceId = getOrCreateDeviceId()
  const counter = await nextCounter(deviceId)
  await db.execute(
    `INSERT INTO event_log (event_id, device_id, device_counter, entity_type, entity_id, operation, payload, timestamp)
     VALUES (?, ?, ?, ?, ?, 'delete', NULL, ?)`,
    [crypto.randomUUID(), deviceId, counter, entityType, entityId, Date.now()]
  )
}

/** Look up the entity_id for any content-table row by its integer PK. */
export async function getEntityId(table: string, id: number): Promise<string | null> {
  const db = await getDb()
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
  options?: GetEventsOptions
): Promise<SyncEvent[]> {
  const db = await getDb()
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
