import { getDb, setSortOrders } from './index'
import { logCreate, logUpdate, logDelete, getEntityId } from './sync'
import type { Channel, Folder } from '../types'

export interface ChannelCounts {
  channel_id: number
  day: number
  week: number
  month: number
}

// Fast sidebar query: scans only the last 30 days using the date index.
export async function getChannelCounts(): Promise<ChannelCounts[]> {
  const db = await getDb()
  return db.select<ChannelCounts[]>(`
    SELECT
      channel_id,
      COUNT(CASE WHEN created_at >= datetime('now', '-1 day')  THEN 1 END) as day,
      COUNT(CASE WHEN created_at >= datetime('now', '-7 days') THEN 1 END) as week,
      COUNT(*)                                                               as month
    FROM messages
    WHERE deleted = 0 AND created_at >= datetime('now', '-30 days')
    GROUP BY channel_id
  `)
}

// All-time totals used in EditChannels for soft vs hard delete decisions.
export async function getChannelTotals(): Promise<{ channel_id: number; total: number }[]> {
  const db = await getDb()
  return db.select<{ channel_id: number; total: number }[]>(
    'SELECT channel_id, COUNT(*) as total FROM messages GROUP BY channel_id'
  )
}

export async function getFolders(): Promise<Folder[]> {
  const db = await getDb()
  return db.select<Folder[]>('SELECT * FROM folders ORDER BY sort_order, name')
}

export async function getChannels(): Promise<Channel[]> {
  const db = await getDb()
  return db.select<Channel[]>('SELECT * FROM channels ORDER BY sort_order, name')
}

export async function createFolder(name: string, description: string | null = null, color: string | null = null, hidden: number = 0): Promise<void> {
  const db = await getDb()
  const entityId = crypto.randomUUID()
  await db.execute(
    'INSERT INTO folders (name, description, color, hidden, entity_id) VALUES (?, ?, ?, ?, ?)',
    [name, description, color, hidden, entityId]
  )
  await logCreate('folders', entityId, { name, description, color, hidden })
}

export async function createChannel(name: string, folderId: number | null, description: string | null = null, color: string | null = null, hidden: number = 0, viewMode: string | null = null): Promise<void> {
  const db = await getDb()
  const entityId = crypto.randomUUID()
  await db.execute(
    'INSERT INTO channels (name, folder_id, description, color, hidden, view_mode, entity_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [name, folderId, description, color, hidden, viewMode, entityId]
  )
  const folderEid = folderId ? await getEntityId('folders', folderId) : null
  await logCreate('channels', entityId, { name, _folder_eid: folderEid, description, color, hidden, view_mode: viewMode })
}

export async function renameFolder(id: number, name: string): Promise<void> {
  const db = await getDb()
  await db.execute('UPDATE folders SET name = ? WHERE id = ?', [name, id])
  const entityId = await getEntityId('folders', id)
  if (entityId) await logUpdate('folders', entityId, { name })
}

export async function updateFolder(id: number, name: string, description: string | null, color: string | null, hidden: number, viewMode: string | null = null): Promise<void> {
  const db = await getDb()
  await db.execute(
    'UPDATE folders SET name = ?, description = ?, color = ?, hidden = ?, view_mode = ? WHERE id = ?',
    [name, description, color, hidden, viewMode, id]
  )
  const entityId = await getEntityId('folders', id)
  if (entityId) await logUpdate('folders', entityId, { name, description, color, hidden, view_mode: viewMode })
}

export async function setFolderSortOrders(ids: number[]): Promise<void> {
  return setSortOrders('folders', ids)
}

export async function renameChannel(id: number, name: string): Promise<void> {
  const db = await getDb()
  await db.execute('UPDATE channels SET name = ? WHERE id = ?', [name, id])
  const entityId = await getEntityId('channels', id)
  if (entityId) await logUpdate('channels', entityId, { name })
}

export async function updateChannel(id: number, name: string, description: string | null, color: string | null, hidden: number, viewMode: string | null = null): Promise<void> {
  const db = await getDb()
  await db.execute(
    'UPDATE channels SET name = ?, description = ?, color = ?, hidden = ?, view_mode = ? WHERE id = ?',
    [name, description, color, hidden, viewMode, id]
  )
  const entityId = await getEntityId('channels', id)
  if (entityId) await logUpdate('channels', entityId, { name, description, color, hidden, view_mode: viewMode })
}

export async function getChannelViewModes(channelId: number): Promise<{ channelMode: string | null; folderMode: string | null }> {
  const db = await getDb()
  const rows = await db.select<{ channel_mode: string | null; folder_mode: string | null }[]>(`
    SELECT c.view_mode AS channel_mode, f.view_mode AS folder_mode
    FROM channels c
    LEFT JOIN folders f ON f.id = c.folder_id
    WHERE c.id = ?
  `, [channelId])
  if (!rows[0]) return { channelMode: null, folderMode: null }
  return { channelMode: rows[0].channel_mode, folderMode: rows[0].folder_mode }
}

export async function setChannelSortOrders(ids: number[]): Promise<void> {
  return setSortOrders('channels', ids)
}

export async function deleteFolder(id: number): Promise<void> {
  const db = await getDb()
  const entityId = await getEntityId('folders', id)
  // blocked by ON DELETE RESTRICT if channels exist — will throw
  await db.execute('DELETE FROM folders WHERE id = ?', [id])
  if (entityId) await logDelete('folders', entityId)
}

export async function softDeleteChannel(id: number): Promise<void> {
  const db = await getDb()
  await db.execute('UPDATE channels SET hidden = 1 WHERE id = ?', [id])
  const entityId = await getEntityId('channels', id)
  if (entityId) await logUpdate('channels', entityId, { hidden: 1 })
}

export async function restoreChannel(id: number): Promise<void> {
  const db = await getDb()
  await db.execute('UPDATE channels SET hidden = 0 WHERE id = ?', [id])
  const entityId = await getEntityId('channels', id)
  if (entityId) await logUpdate('channels', entityId, { hidden: 0 })
}

export async function deleteChannel(id: number): Promise<void> {
  const db = await getDb()
  const entityId = await getEntityId('channels', id)
  await db.execute('DELETE FROM channels WHERE id = ?', [id])
  if (entityId) await logDelete('channels', entityId)
}

export async function moveChannelToFolder(channelId: number, folderId: number | null): Promise<void> {
  const db = await getDb()
  await db.execute('UPDATE channels SET folder_id = ? WHERE id = ?', [folderId, channelId])
  const entityId = await getEntityId('channels', channelId)
  const folderEid = folderId ? await getEntityId('folders', folderId) : null
  if (entityId) await logUpdate('channels', entityId, { _folder_eid: folderEid })
}

export async function setChannelSyncEnabled(id: number, enabled: boolean): Promise<void> {
  const db = await getDb()
  const v = enabled ? 1 : 0
  await db.execute('UPDATE channels SET sync_enabled = ? WHERE id = ?', [v, id])
  const entityId = await getEntityId('channels', id)
  if (entityId) await logUpdate('channels', entityId, { sync_enabled: v })
}

export async function updateLastAvatar(channelId: number, avatarId: number): Promise<void> {
  const db = await getDb()
  await db.execute('UPDATE channels SET last_avatar_id = ? WHERE id = ?', [avatarId, channelId])
}
