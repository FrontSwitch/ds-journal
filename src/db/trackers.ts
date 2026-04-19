import { getDb, setSortOrders } from './index'
import { logCreate, logUpdate, logDelete, getEntityId } from './sync'
import { toSqlDatetime } from '../lib/dateUtils'
import type { Tracker, TrackerField, TrackerRecord, TrackerRecordValueRow } from '../types'

// ─── Trackers folder ────────────────────────────────────────────────────────

const TRACKERS_FOLDER_NAME = 'Trackers'

export async function getOrCreateTrackersFolder(): Promise<number> {
  const db = await getDb()
  const rows = await db.select<{ id: number }[]>(
    'SELECT id FROM folders WHERE name = ? LIMIT 1',
    [TRACKERS_FOLDER_NAME]
  )
  if (rows.length > 0) return rows[0].id
  const entityId = crypto.randomUUID()
  const result = await db.execute(
    'INSERT INTO folders (name, entity_id) VALUES (?, ?)',
    [TRACKERS_FOLDER_NAME, entityId]
  )
  await logCreate('folders', entityId, { name: TRACKERS_FOLDER_NAME })
  return result.lastInsertId as number
}

// ─── Trackers ────────────────────────────────────────────────────────────────

export async function getTrackers(includeHidden = false): Promise<Tracker[]> {
  const db = await getDb()
  const where = includeHidden ? '' : 'WHERE hidden = 0'
  return db.select<Tracker[]>(
    `SELECT * FROM trackers ${where} ORDER BY sort_order, name`
  )
}

export async function getTracker(id: number): Promise<Tracker | null> {
  const db = await getDb()
  const rows = await db.select<Tracker[]>('SELECT * FROM trackers WHERE id = ?', [id])
  return rows[0] ?? null
}

export async function getTrackerByChannelId(channelId: number): Promise<Tracker | null> {
  const db = await getDb()
  const rows = await db.select<Tracker[]>('SELECT * FROM trackers WHERE channel_id = ? LIMIT 1', [channelId])
  return rows[0] ?? null
}

export async function createTracker(name: string, description: string | null, color: string | null = null): Promise<number> {
  const db = await getDb()
  const folderId = await getOrCreateTrackersFolder()

  // auto-create the channel for this tracker
  const chanEntityId = crypto.randomUUID()
  const chanResult = await db.execute(
    'INSERT INTO channels (name, folder_id, entity_id) VALUES (?, ?, ?)',
    [name, folderId, chanEntityId]
  )
  const channelId = chanResult.lastInsertId as number
  const folderEid = await getEntityId('folders', folderId)
  await logCreate('channels', chanEntityId, { name, _folder_eid: folderEid })

  const trackerEntityId = crypto.randomUUID()
  const result = await db.execute(
    'INSERT INTO trackers (channel_id, name, description, color, entity_id) VALUES (?, ?, ?, ?, ?)',
    [channelId, name, description, color, trackerEntityId]
  )
  await logCreate('trackers', trackerEntityId, { _channel_eid: chanEntityId, name, description, color })
  return result.lastInsertId as number
}

export async function updateTracker(
  id: number,
  name: string,
  description: string | null,
  color: string | null,
  hidden: number
): Promise<void> {
  const db = await getDb()
  await db.execute(
    'UPDATE trackers SET name = ?, description = ?, color = ?, hidden = ? WHERE id = ?',
    [name, description, color, hidden, id]
  )
  const entityId = await getEntityId('trackers', id)
  if (entityId) await logUpdate('trackers', entityId, { name, description, color, hidden })

  // keep channel name and hidden in sync
  const tracker = await getTracker(id)
  if (tracker) {
    await db.execute('UPDATE channels SET name = ?, hidden = ? WHERE id = ?', [name, hidden, tracker.channel_id])
    const chanEntityId = await getEntityId('channels', tracker.channel_id)
    if (chanEntityId) await logUpdate('channels', chanEntityId, { name, hidden })
  }
}

export async function deleteTracker(id: number): Promise<void> {
  const db = await getDb()
  const tracker = await getTracker(id)
  if (!tracker) return
  const trackerEntityId = await getEntityId('trackers', id)
  const chanEntityId = await getEntityId('channels', tracker.channel_id)
  // cascade deletes tracker_fields, tracker_records, tracker_record_values
  await db.execute('DELETE FROM trackers WHERE id = ?', [id])
  // delete the auto-created channel (cascades messages)
  await db.execute('DELETE FROM channels WHERE id = ?', [tracker.channel_id])
  if (trackerEntityId) await logDelete('trackers', trackerEntityId)
  if (chanEntityId) await logDelete('channels', chanEntityId)
}

export async function setTrackerSortOrders(ids: number[]): Promise<void> {
  return setSortOrders('trackers', ids)
}

// ─── Tracker fields ──────────────────────────────────────────────────────────

export async function getTrackerFields(trackerId: number): Promise<TrackerField[]> {
  const db = await getDb()
  return db.select<TrackerField[]>(
    'SELECT * FROM tracker_fields WHERE tracker_id = ? ORDER BY sort_order, id',
    [trackerId]
  )
}

export async function createTrackerField(
  trackerId: number,
  name: string,
  fieldType: string,
  options: {
    required?: number
    listValues?: string | null
    rangeMin?: number | null
    rangeMax?: number | null
    customEditor?: string | null
    summaryOp?: string
    defaultValue?: string | null
  } = {}
): Promise<number> {
  const db = await getDb()
  const maxRow = await db.select<{ max: number | null }[]>(
    'SELECT MAX(sort_order) as max FROM tracker_fields WHERE tracker_id = ?',
    [trackerId]
  )
  const sortOrder = (maxRow[0].max ?? -1) + 1
  const entityId = crypto.randomUUID()
  const result = await db.execute(
    `INSERT INTO tracker_fields
       (tracker_id, name, field_type, sort_order, required, list_values, range_min, range_max, custom_editor, summary_op, default_value, entity_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      trackerId, name, fieldType, sortOrder,
      options.required ?? 1,
      options.listValues ?? null,
      options.rangeMin ?? null,
      options.rangeMax ?? null,
      options.customEditor ?? null,
      options.summaryOp ?? 'none',
      options.defaultValue ?? null,
      entityId,
    ]
  )
  const trackerEid = await getEntityId('trackers', trackerId)
  await logCreate('tracker_fields', entityId, {
    _tracker_eid: trackerEid, name, field_type: fieldType, sort_order: sortOrder,
    required: options.required ?? 1, list_values: options.listValues ?? null,
    range_min: options.rangeMin ?? null, range_max: options.rangeMax ?? null,
    custom_editor: options.customEditor ?? null, summary_op: options.summaryOp ?? 'none',
    default_value: options.defaultValue ?? null,
  })
  return result.lastInsertId as number
}

export async function updateTrackerField(
  id: number,
  name: string,
  fieldType: string,
  options: {
    required?: number
    listValues?: string | null
    rangeMin?: number | null
    rangeMax?: number | null
    customEditor?: string | null
    summaryOp?: string
    defaultValue?: string | null
  } = {}
): Promise<void> {
  const db = await getDb()
  await db.execute(
    `UPDATE tracker_fields
     SET name = ?, field_type = ?, required = ?, list_values = ?, range_min = ?, range_max = ?, custom_editor = ?, summary_op = ?, default_value = ?
     WHERE id = ?`,
    [
      name, fieldType,
      options.required ?? 1,
      options.listValues ?? null,
      options.rangeMin ?? null,
      options.rangeMax ?? null,
      options.customEditor ?? null,
      options.summaryOp ?? 'none',
      options.defaultValue ?? null,
      id,
    ]
  )
  const entityId = await getEntityId('tracker_fields', id)
  if (entityId) await logUpdate('tracker_fields', entityId, {
    name, field_type: fieldType, required: options.required ?? 1,
    list_values: options.listValues ?? null, range_min: options.rangeMin ?? null,
    range_max: options.rangeMax ?? null, custom_editor: options.customEditor ?? null,
    summary_op: options.summaryOp ?? 'none', default_value: options.defaultValue ?? null,
  })
}

export async function deleteTrackerField(id: number): Promise<void> {
  // tracker_record_values has no CASCADE on field_id — check for existing values first
  const db = await getDb()
  const rows = await db.select<{ n: number }[]>(
    'SELECT COUNT(*) as n FROM tracker_record_values WHERE field_id = ?',
    [id]
  )
  if ((rows[0]?.n ?? 0) > 0) {
    throw new Error('Cannot delete a field that has recorded values')
  }
  const entityId = await getEntityId('tracker_fields', id)
  await db.execute('DELETE FROM tracker_fields WHERE id = ?', [id])
  if (entityId) await logDelete('tracker_fields', entityId)
}

export async function setTrackerFieldSortOrders(ids: number[]): Promise<void> {
  return setSortOrders('tracker_fields', ids)
}

// ─── Record submission ───────────────────────────────────────────────────────

export interface RecordValueInput {
  field_id: number
  value_text?: string | null
  value_number?: number | null
  value_boolean?: boolean | null
  value_avatar_id?: number | null
}

function buildBarText(fields: TrackerField[], values: RecordValueInput[], ts: string): string {
  const map = new Map(values.map(v => [v.field_id, v]))
  const parts = fields.map(f => {
    const v = map.get(f.id)
    if (!v) return ''
    if (v.value_boolean != null) return v.value_boolean ? 'yes' : 'no'
    if (v.value_number != null) return String(v.value_number)
    if (v.value_avatar_id != null) return String(v.value_avatar_id)
    return v.value_text ?? ''
  })
  return '|' + ts + '|' + parts.join('|') + '|'
}

export async function submitRecord(
  trackerId: number,
  channelId: number,
  avatarId: number | null,
  values: RecordValueInput[],
  createdAt?: string   // YYYY-MM-DD HH:MM:SS; defaults to now
): Promise<number> {
  const db = await getDb()
  const fields = await getTrackerFields(trackerId)

  const tsArg = createdAt ?? null
  const recordEntityId = crypto.randomUUID()
  const recResult = await db.execute(
    tsArg
      ? 'INSERT INTO tracker_records (tracker_id, avatar_id, created_at, entity_id) VALUES (?, ?, ?, ?)'
      : 'INSERT INTO tracker_records (tracker_id, avatar_id, entity_id) VALUES (?, ?, ?)',
    tsArg ? [trackerId, avatarId, tsArg, recordEntityId] : [trackerId, avatarId, recordEntityId]
  )
  const recordId = recResult.lastInsertId as number

  // build bar timestamp: use provided time or local now
  const barTs = (() => {
    const d = tsArg ? new Date(tsArg.replace(' ', 'T') + 'Z') : new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  })()

  for (const v of values) {
    await db.execute(
      `INSERT INTO tracker_record_values
         (record_id, field_id, value_text, value_number, value_boolean, value_avatar_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        recordId, v.field_id,
        v.value_text ?? null,
        v.value_number ?? null,
        v.value_boolean != null ? (v.value_boolean ? 1 : 0) : null,
        v.value_avatar_id ?? null,
      ]
    )
  }

  const barText = buildBarText(fields, values, barTs)
  const msgEntityId = crypto.randomUUID()
  await db.execute(
    tsArg
      ? 'INSERT INTO messages (channel_id, avatar_id, text, tracker_record_id, created_at, entity_id) VALUES (?, ?, ?, ?, ?, ?)'
      : 'INSERT INTO messages (channel_id, avatar_id, text, tracker_record_id, entity_id) VALUES (?, ?, ?, ?, ?)',
    tsArg
      ? [channelId, avatarId, barText, recordId, tsArg, msgEntityId]
      : [channelId, avatarId, barText, recordId, msgEntityId]
  )
  if (avatarId != null) {
    await db.execute(
      'INSERT OR IGNORE INTO channel_avatar_activity (channel_id, avatar_id) VALUES (?, ?)',
      [channelId, avatarId]
    )
  }

  const trackerEidRec = await getEntityId('trackers', trackerId)
  const avatarEidRec = avatarId !== null ? await getEntityId('avatars', avatarId) : null
  const fieldEidMap = new Map(fields.map(f => [f.id, f.entity_id]))
  const _record_values = await Promise.all(values.map(async v => ({
    field_eid: fieldEidMap.get(v.field_id) ?? '',
    value_text: v.value_text ?? null,
    value_number: v.value_number ?? null,
    value_boolean: v.value_boolean != null ? (v.value_boolean ? 1 : 0) : null,
    _value_avatar_eid: v.value_avatar_id ? await getEntityId('avatars', v.value_avatar_id) : null,
  })))
  await logCreate('tracker_records', recordEntityId, { _tracker_eid: trackerEidRec, _avatar_eid: avatarEidRec, _record_values })

  const channelEidRec = await getEntityId('channels', channelId)
  await logCreate('messages', msgEntityId, { _channel_eid: channelEidRec, _avatar_eid: avatarEidRec, text: barText, _tracker_record_eid: recordEntityId })

  return recordId
}

// ─── Record queries ──────────────────────────────────────────────────────────

async function fetchValues(recordIds: number[]): Promise<Map<number, TrackerRecordValueRow[]>> {
  if (recordIds.length === 0) return new Map()
  const db = await getDb()
  const rows = await db.select<(TrackerRecordValueRow & { record_id: number })[]>(
    `SELECT trv.record_id, trv.field_id, tf.name as field_name, tf.field_type,
            trv.value_text, trv.value_number, trv.value_boolean, trv.value_avatar_id
     FROM tracker_record_values trv
     JOIN tracker_fields tf ON trv.field_id = tf.id
     WHERE trv.record_id IN (${recordIds.join(',')})
     ORDER BY tf.sort_order`
  )
  const map = new Map<number, TrackerRecordValueRow[]>()
  for (const row of rows) {
    const { record_id, ...value } = row
    if (!map.has(record_id)) map.set(record_id, [])
    map.get(record_id)!.push(value)
  }
  return map
}

export async function getRecordsByIds(ids: number[]): Promise<TrackerRecord[]> {
  if (ids.length === 0) return []
  const db = await getDb()
  const records = await db.select<Omit<TrackerRecord, 'values'>[]>(
    `SELECT * FROM tracker_records WHERE id IN (${ids.join(',')}) ORDER BY created_at`
  )
  const valuesMap = await fetchValues(ids)
  return records.map(r => ({ ...r, values: valuesMap.get(r.id) ?? [] }))
}

export async function getRecords(trackerId: number, limit = 100): Promise<TrackerRecord[]> {
  const db = await getDb()
  const records = await db.select<Omit<TrackerRecord, 'values'>[]>(
    'SELECT * FROM tracker_records WHERE tracker_id = ? ORDER BY created_at DESC LIMIT ?',
    [trackerId, limit]
  )
  const ids = records.map(r => r.id)
  const valuesMap = await fetchValues(ids)
  return records.map(r => ({ ...r, values: valuesMap.get(r.id) ?? [] }))
}

export async function getRecordsSince(trackerId: number, since: string): Promise<TrackerRecord[]> {
  const db = await getDb()
  const records = await db.select<Omit<TrackerRecord, 'values'>[]>(
    'SELECT * FROM tracker_records WHERE tracker_id = ? AND created_at >= ? ORDER BY created_at DESC',
    [trackerId, since]
  )
  const ids = records.map(r => r.id)
  const valuesMap = await fetchValues(ids)
  return records.map(r => ({ ...r, values: valuesMap.get(r.id) ?? [] }))
}

export async function getRecordCounts(trackerId: number): Promise<{ total: number; week: number; month: number; year: number }> {
  const db = await getDb()
  const now = Date.now()
  const weekAgo  = toSqlDatetime(new Date(now - 7   * 86400000))
  const monthAgo = toSqlDatetime(new Date(now - 30  * 86400000))
  const yearAgo  = toSqlDatetime(new Date(now - 365 * 86400000))
  const rows = await db.select<{ total: number; week: number; month: number; year: number }[]>(
    `SELECT COUNT(*) as total,
            SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) as week,
            SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) as month,
            SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) as year
     FROM tracker_records WHERE tracker_id = ?`,
    [weekAgo, monthAgo, yearAgo, trackerId]
  )
  return rows[0] ?? { total: 0, week: 0, month: 0, year: 0 }
}


export async function setTrackerSyncEnabled(id: number, enabled: boolean): Promise<void> {
  const db = await getDb()
  const v = enabled ? 1 : 0
  await db.execute('UPDATE trackers SET sync_enabled = ? WHERE id = ?', [v, id])
  const entityId = await getEntityId('trackers', id)
  if (entityId) await logUpdate('trackers', entityId, { sync_enabled: v })
}
