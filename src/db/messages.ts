import { getDb } from './index'
import { logCreate, logUpdate, getEntityId } from './sync'
import type { MessageRow } from '../types'
import { upsertTagsFromText } from './tags'
import { insertImage } from './images'

// Single-channel SELECT: no channels join needed (channel is known, name never shown per-message)
const SELECT_CHANNEL = `
  SELECT m.id, m.channel_id, '' as channel_name, m.text, m.original_text, m.deleted, m.created_at,
         m.tracker_record_id, m.parent_msg_id,
         a.id as avatar_id, a.name as avatar_name, a.color as avatar_color, a.image_path as avatar_image_path, a.image_data as avatar_image_data,
         mi.image_path, mi.caption as image_caption, mi.location as image_location, mi.people as image_people
  FROM messages m
  LEFT JOIN avatars a ON m.avatar_id = a.id
  LEFT JOIN message_images mi ON mi.message_id = m.id`

// All-messages SELECT: needs channel name for display
const SELECT_ALL = `
  SELECT m.id, m.channel_id, c.name as channel_name, m.text, m.original_text, m.deleted, m.created_at,
         m.tracker_record_id, m.parent_msg_id,
         a.id as avatar_id, a.name as avatar_name, a.color as avatar_color, a.image_path as avatar_image_path, a.image_data as avatar_image_data,
         mi.image_path, mi.caption as image_caption, mi.location as image_location, mi.people as image_people
  FROM messages m
  LEFT JOIN avatars a ON m.avatar_id = a.id
  LEFT JOIN message_images mi ON mi.message_id = m.id
  JOIN channels c ON m.channel_id = c.id`

async function fetchMessages(
  base: string,
  filterClause: string | null,
  filterParams: unknown[],
  limit: number,
  deletedSince?: string | null
): Promise<MessageRow[]> {
  const db = await getDb()
  const conditions: string[] = []
  const params: unknown[] = [...filterParams]
  if (filterClause) conditions.push(filterClause)
  if (deletedSince) {
    conditions.push(`(m.deleted = 0 OR (m.deleted = 1 AND m.created_at > ?))`)
    params.push(deletedSince)
  } else {
    conditions.push(`m.deleted = 0`)
  }
  params.push(limit)
  return db.select<MessageRow[]>(
    `${base} WHERE ${conditions.join(' AND ')} ORDER BY m.created_at DESC LIMIT ?`,
    params
  )
}

export function getMessages(channelId: number, limit: number, deletedSince?: string | null): Promise<MessageRow[]> {
  return fetchMessages(SELECT_CHANNEL, 'm.channel_id = ?', [channelId], limit, deletedSince)
}

export function getAllMessages(limit: number, deletedSince?: string | null): Promise<MessageRow[]> {
  return fetchMessages(SELECT_ALL, null, [], limit, deletedSince)
}

export function getAllMessagesByAvatar(avatarId: number, limit: number, deletedSince?: string | null): Promise<MessageRow[]> {
  return fetchMessages(SELECT_ALL, 'm.avatar_id = ?', [avatarId], limit, deletedSince)
}

export async function sendMessage(channelId: number, avatarId: number | null, text: string, parentMsgId?: number | null): Promise<number> {
  const db = await getDb()
  const entityId = crypto.randomUUID()
  const result = await db.execute(
    'INSERT INTO messages (channel_id, avatar_id, text, parent_msg_id, entity_id) VALUES (?, ?, ?, ?, ?)',
    [channelId, avatarId, text, parentMsgId ?? null, entityId]
  )
  const newId = Number(result.lastInsertId)
  if (avatarId !== null) {
    await db.execute(
      'INSERT OR IGNORE INTO channel_avatar_activity (channel_id, avatar_id) VALUES (?, ?)',
      [channelId, avatarId]
    )
  }
  await upsertTagsFromText(text)
  const channelEid = await getEntityId('channels', channelId)
  const avatarEid = avatarId !== null ? await getEntityId('avatars', avatarId) : null
  const parentMsgEid = parentMsgId ? await getEntityId('messages', parentMsgId) : null
  await logCreate('messages', entityId, { _channel_eid: channelEid, _avatar_eid: avatarEid, text, _parent_msg_eid: parentMsgEid })
  return newId
}

export async function searchMessages(query: string, channelId?: number, avatarId?: number, date?: string): Promise<MessageRow[]> {
  const db = await getDb()
  const conditions = ["m.deleted = 0"]
  const params: unknown[] = []
  if (query) {
    // FTS5 prefix match: each whitespace-separated token becomes "token"*
    const ftsQuery = query.trim().split(/\s+/).map(w => `"${w.replace(/"/g, '')}"*`).join(' ')
    conditions.push("m.id IN (SELECT rowid FROM messages_fts WHERE messages_fts MATCH ?)")
    params.push(ftsQuery)
  }
  if (channelId !== undefined) { conditions.push("m.channel_id = ?"); params.push(channelId) }
  if (avatarId !== undefined) { conditions.push("m.avatar_id = ?"); params.push(avatarId) }
  if (date) { conditions.push("DATE(m.created_at) = ?"); params.push(date) }
  const rows = await db.select<MessageRow[]>(
    `${SELECT_ALL} WHERE ${conditions.join(" AND ")} ORDER BY m.created_at DESC LIMIT 500`,
    params
  )
  return [...rows].reverse()
}

export async function deleteMessage(id: number): Promise<void> {
  const db = await getDb()
  await db.execute(`UPDATE messages SET deleted = 1 WHERE id = ?`, [id])
  const entityId = await getEntityId('messages', id)
  if (entityId) await logUpdate('messages', entityId, { deleted: 1 })
}

export async function undeleteMessage(id: number): Promise<void> {
  const db = await getDb()
  await db.execute(`UPDATE messages SET deleted = 0 WHERE id = ?`, [id])
  const entityId = await getEntityId('messages', id)
  if (entityId) await logUpdate('messages', entityId, { deleted: 0 })
}

export async function sendImageMessage(
  channelId: number,
  avatarId: number | null,
  imagePath: string,
  caption: string | null,
  location: string | null,
  people: string | null,
): Promise<void> {
  const db = await getDb()
  // Store searchable text: pipe-separated fields (same pattern as tracker records)
  const parts = [caption, location, people].filter(Boolean)
  const text = parts.length > 0 ? `|${parts.join('|')}|` : '|image|'
  const entityId = crypto.randomUUID()
  const result = await db.execute(
    `INSERT INTO messages (channel_id, avatar_id, text, entity_id) VALUES (?, ?, ?, ?)`,
    [channelId, avatarId, text, entityId]
  )
  const messageId = result.lastInsertId as number
  await insertImage(messageId, imagePath, caption, location, people)
  if (avatarId !== null) {
    await db.execute(
      'INSERT OR IGNORE INTO channel_avatar_activity (channel_id, avatar_id) VALUES (?, ?)',
      [channelId, avatarId]
    )
  }
  if (parts.length > 0) await upsertTagsFromText(text)
  const channelEidImg = await getEntityId('channels', channelId)
  const avatarEidImg = avatarId !== null ? await getEntityId('avatars', avatarId) : null
  await logCreate('messages', entityId, { _channel_eid: channelEidImg, _avatar_eid: avatarEidImg, text, image_path: imagePath, caption, location, people })
}

export async function editMessage(id: number, newText: string): Promise<void> {
  const db = await getDb()
  await db.execute(
    `UPDATE messages
     SET original_text = CASE WHEN original_text IS NULL THEN text ELSE original_text END,
         text = ?
     WHERE id = ?`,
    [newText, id]
  )
  await upsertTagsFromText(newText)
  const entityId = await getEntityId('messages', id)
  if (entityId) await logUpdate('messages', entityId, { text: newText })
}
