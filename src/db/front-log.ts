import { getDb } from './index'
import { logCreate, logUpdate, getEntityId } from './sync'
import type { FrontLogConfig, FrontSession } from '../types'
import { toSqlDatetime } from '../lib/dateUtils'
import { getOrCreateTrackersFolder } from './trackers'

// ── Config ────────────────────────────────────────────────────────────────────

export async function getFrontLogConfig(): Promise<FrontLogConfig | null> {
  const db = await getDb()
  const rows = await db.select<FrontLogConfig[]>(`SELECT * FROM front_log_config WHERE id = 1`)
  return rows[0] ?? null
}

/** Called on startup. Creates the Front Log channel + config row if they don't exist yet. */
export async function seedFrontLog(): Promise<void> {
  const db = await getDb()
  const existing = await db.select<{ n: number }[]>(
    `SELECT COUNT(*) as n FROM front_log_config`
  )
  if (existing[0].n > 0) return  // already seeded

  const folderId = await getOrCreateTrackersFolder()

  // Create the Front Log channel
  const chanEntityId = crypto.randomUUID()
  const cr = await db.execute(
    `INSERT INTO channels (name, folder_id, color, entity_id) VALUES ('Front Log', ?, '#89b4fa', ?)`,
    [folderId, chanEntityId]
  )
  const channelId = cr.lastInsertId as number
  await logCreate('channels', chanEntityId, { name: 'Front Log', folder_id: folderId, color: '#89b4fa' })

  await db.execute(
    `INSERT INTO front_log_config (id, channel_id, color) VALUES (1, ?, '#89b4fa')`,
    [channelId]
  )
}

// ── Sessions ──────────────────────────────────────────────────────────────────

export async function getCurrentFront(): Promise<FrontSession[]> {
  const db = await getDb()
  return db.select<FrontSession[]>(`
    SELECT fs.id, fs.avatar_id, fs.entered_at, fs.exited_at,
           a.name as avatar_name, a.color as avatar_color
    FROM front_sessions fs
    LEFT JOIN avatars a ON a.id = fs.avatar_id
    WHERE fs.exited_at IS NULL
    ORDER BY fs.entered_at ASC
  `)
}

export async function getFrontSessions(since?: string): Promise<FrontSession[]> {
  const db = await getDb()
  if (since) {
    return db.select<FrontSession[]>(`
      SELECT fs.id, fs.avatar_id, fs.entered_at, fs.exited_at,
             a.name as avatar_name, a.color as avatar_color
      FROM front_sessions fs
      LEFT JOIN avatars a ON a.id = fs.avatar_id
      WHERE fs.entered_at >= ?
      ORDER BY fs.entered_at ASC
    `, [since])
  }
  return db.select<FrontSession[]>(`
    SELECT fs.id, fs.avatar_id, fs.entered_at, fs.exited_at,
           a.name as avatar_name, a.color as avatar_color
    FROM front_sessions fs
    LEFT JOIN avatars a ON a.id = fs.avatar_id
    ORDER BY fs.entered_at ASC
  `)
}

/**
 * Add an avatar to front.
 * replace=true: close all open sessions first (set), replace=false: append (add).
 */
export async function enterFront(avatarId: number | null, replace: boolean): Promise<void> {
  const config = await getFrontLogConfig()
  if (!config) return
  const db = await getDb()
  const now = toSqlDatetime(new Date())

  if (replace) {
    const open = await getCurrentFront()
    for (const s of open) {
      await db.execute(`UPDATE front_sessions SET exited_at = ? WHERE id = ?`, [now, s.id])
      await db.execute(
        `INSERT INTO messages (channel_id, avatar_id, text, created_at) VALUES (?, ?, ?, ?)`,
        [config.channel_id, s.avatar_id, '|front:left|', now]
      )
    }
  }

  const sessionEntityId = crypto.randomUUID()
  await db.execute(
    `INSERT INTO front_sessions (avatar_id, entered_at, entity_id) VALUES (?, ?, ?)`,
    [avatarId, now, sessionEntityId]
  )
  await logCreate('front_sessions', sessionEntityId, { avatar_id: avatarId, entered_at: now })

  const msgEntityId = crypto.randomUUID()
  await db.execute(
    `INSERT INTO messages (channel_id, avatar_id, text, created_at, entity_id) VALUES (?, ?, ?, ?, ?)`,
    [config.channel_id, avatarId, '|front:entered|', now, msgEntityId]
  )
  await logCreate('messages', msgEntityId, { channel_id: config.channel_id, avatar_id: avatarId, text: '|front:entered|', created_at: now })
}

/** Remove one avatar from front. No-op if they're not currently fronting. */
export async function exitFront(avatarId: number): Promise<void> {
  const config = await getFrontLogConfig()
  if (!config) return
  const db = await getDb()
  const now = toSqlDatetime(new Date())

  const open = await db.select<{ id: number }[]>(
    `SELECT id FROM front_sessions WHERE avatar_id = ? AND exited_at IS NULL LIMIT 1`,
    [avatarId]
  )
  if (open.length === 0) return

  await db.execute(
    `UPDATE front_sessions SET exited_at = ? WHERE id = ?`, [now, open[0].id]
  )
  const sessionEntityId = await getEntityId('front_sessions', open[0].id)
  if (sessionEntityId) await logUpdate('front_sessions', sessionEntityId, { exited_at: now })

  const msgEntityId = crypto.randomUUID()
  await db.execute(
    `INSERT INTO messages (channel_id, avatar_id, text, created_at, entity_id) VALUES (?, ?, ?, ?, ?)`,
    [config.channel_id, avatarId, '|front:left|', now, msgEntityId]
  )
  await logCreate('messages', msgEntityId, { channel_id: config.channel_id, avatar_id: avatarId, text: '|front:left|', created_at: now })
}

/** Close all open sessions. */
export async function clearFront(): Promise<void> {
  const config = await getFrontLogConfig()
  if (!config) return
  const db = await getDb()
  const now = toSqlDatetime(new Date())

  const open = await getCurrentFront()
  for (const s of open) {
    await db.execute(`UPDATE front_sessions SET exited_at = ? WHERE id = ?`, [now, s.id])
    const sessionEntityId = await getEntityId('front_sessions', s.id)
    if (sessionEntityId) await logUpdate('front_sessions', sessionEntityId, { exited_at: now })
    const leftMsgEntityId = crypto.randomUUID()
    await db.execute(
      `INSERT INTO messages (channel_id, avatar_id, text, created_at, entity_id) VALUES (?, ?, ?, ?, ?)`,
      [config.channel_id, s.avatar_id, '|front:left|', now, leftMsgEntityId]
    )
    await logCreate('messages', leftMsgEntityId, { channel_id: config.channel_id, avatar_id: s.avatar_id, text: '|front:left|', created_at: now })
  }

  const clearedMsgEntityId = crypto.randomUUID()
  await db.execute(
    `INSERT INTO messages (channel_id, avatar_id, text, created_at, entity_id) VALUES (?, ?, ?, ?, ?)`,
    [config.channel_id, null, '|front:cleared|', now, clearedMsgEntityId]
  )
  await logCreate('messages', clearedMsgEntityId, { channel_id: config.channel_id, avatar_id: null, text: '|front:cleared|', created_at: now })
}

