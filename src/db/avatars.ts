import { getDb, setSortOrders } from './index'
import { logCreate, logUpdate, logUpdateById, logDelete, getEntityId } from './sync'
import type { Avatar, AvatarField, AvatarFieldType, AvatarFieldValue, AvatarGroup, AvatarNote } from '../types'

// Module-level cache so individual lookups don't re-query after the batch load
const _imageCache = new Map<number, string | null>()

export async function getAvatars(): Promise<Avatar[]> {
  const db = await getDb()
  // Excludes image_data — fetched separately via getAvatarImagesMap()
  return db.select<Avatar[]>(
    'SELECT id, name, color, image_path, description, pronouns, hidden, icon_letters, sort_order, created_at, entity_id FROM avatars ORDER BY name'
  )
}

// One query for all non-null images; populates the cache as a side effect
export async function getAvatarImagesMap(): Promise<Map<number, string | null>> {
  const db = await getDb()
  const rows = await db.select<{ id: number; image_data: string | null }[]>(
    'SELECT id, image_data FROM avatars WHERE image_data IS NOT NULL'
  )
  const map = new Map<number, string | null>()
  for (const r of rows) { map.set(r.id, r.image_data); _imageCache.set(r.id, r.image_data) }
  return map
}

export async function getAvatarImageData(id: number): Promise<string | null> {
  if (_imageCache.has(id)) return _imageCache.get(id)!
  const db = await getDb()
  const rows = await db.select<{ image_data: string | null }[]>(
    'SELECT image_data FROM avatars WHERE id = ?', [id]
  )
  const val = rows[0]?.image_data ?? null
  _imageCache.set(id, val)
  return val
}

export function invalidateImageCache(id: number): void {
  _imageCache.delete(id)
}

export async function getAvatarGroups(): Promise<AvatarGroup[]> {
  const db = await getDb()
  return db.select<AvatarGroup[]>('SELECT * FROM avatar_groups ORDER BY sort_order, name')
}

export async function getGroupMembers(groupId: number): Promise<number[]> {
  const db = await getDb()
  const rows = await db.select<{ avatar_id: number }[]>(
    'SELECT avatar_id FROM avatar_group_members WHERE group_id = ?',
    [groupId]
  )
  return rows.map(r => r.avatar_id)
}

export async function getAllGroupMembers(): Promise<{ avatar_id: number; group_id: number }[]> {
  const db = await getDb()
  return db.select<{ avatar_id: number; group_id: number }[]>(
    'SELECT avatar_id, group_id FROM avatar_group_members'
  )
}

export async function getChannelActivityAvatarIds(channelId: number): Promise<number[]> {
  const db = await getDb()
  const rows = await db.select<{ avatar_id: number }[]>(
    'SELECT avatar_id FROM channel_avatar_activity WHERE channel_id = ?',
    [channelId]
  )
  return rows.map(r => r.avatar_id)
}

export async function createAvatar(name: string, color: string, imagePath: string | null, description: string | null, pronouns: string | null, iconLetters: string | null): Promise<void> {
  const db = await getDb()
  const entityId = crypto.randomUUID()
  await db.execute(
    'INSERT INTO avatars (name, color, image_path, description, pronouns, icon_letters, entity_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [name, color, imagePath, description, pronouns, iconLetters, entityId]
  )
  await logCreate('avatars', entityId, { name, color, image_path: imagePath, description, pronouns, icon_letters: iconLetters })
}

export async function updateAvatar(id: number, name: string, color: string, imagePath: string | null, description: string | null, pronouns: string | null, hidden: number, iconLetters: string | null): Promise<void> {
  const db = await getDb()
  await db.execute(
    'UPDATE avatars SET name = ?, color = ?, image_path = ?, description = ?, pronouns = ?, hidden = ?, icon_letters = ? WHERE id = ?',
    [name, color, imagePath, description, pronouns, hidden, iconLetters, id]
  )
  await logUpdateById('avatars', id, { name, color, image_path: imagePath, description, pronouns, hidden, icon_letters: iconLetters })
}

export async function setAvatarImageData(id: number, imageData: string | null): Promise<void> {
  const db = await getDb()
  await db.execute('UPDATE avatars SET image_data = ? WHERE id = ?', [imageData, id])
  await logUpdateById('avatars', id, { image_data: imageData })
  invalidateImageCache(id)
}

export async function deleteAvatar(id: number): Promise<void> {
  const db = await getDb()
  const rows = await db.select<{ count: number }[]>(
    'SELECT COUNT(*) as count FROM messages WHERE avatar_id = ?', [id]
  )
  if ((rows[0]?.count ?? 0) > 0) throw new Error('Avatar has messages and cannot be deleted.')
  const entityId = await getEntityId('avatars', id)
  await db.execute('DELETE FROM avatars WHERE id = ?', [id])
  if (entityId) await logDelete('avatars', entityId)
}

export async function getAvatarGroupsForAvatar(avatarId: number): Promise<number[]> {
  const db = await getDb()
  const rows = await db.select<{ group_id: number }[]>(
    'SELECT group_id FROM avatar_group_members WHERE avatar_id = ?', [avatarId]
  )
  return rows.map(r => r.group_id)
}

export async function createAvatarGroup(name: string, description: string | null = null, color: string | null = null, hidden: number = 0): Promise<number> {
  const db = await getDb()
  const rows = await db.select<{ max: number }[]>('SELECT COALESCE(MAX(sort_order), -1) as max FROM avatar_groups')
  const nextOrder = (rows[0]?.max ?? -1) + 1
  const entityId = crypto.randomUUID()
  const result = await db.execute(
    'INSERT INTO avatar_groups (name, description, color, hidden, sort_order, entity_id) VALUES (?, ?, ?, ?, ?, ?)',
    [name, description, color, hidden, nextOrder, entityId]
  )
  await logCreate('avatar_groups', entityId, { name, description, color, hidden, sort_order: nextOrder })
  return result.lastInsertId as number
}

export async function setGroupSortOrders(ids: number[]): Promise<void> {
  return setSortOrders('avatar_groups', ids)
}

export async function renameAvatarGroup(id: number, name: string): Promise<void> {
  const db = await getDb()
  await db.execute('UPDATE avatar_groups SET name = ? WHERE id = ?', [name, id])
  await logUpdateById('avatar_groups', id, { name })
}

export async function updateAvatarGroup(id: number, name: string, description: string | null, color: string | null, hidden: number): Promise<void> {
  const db = await getDb()
  await db.execute(
    'UPDATE avatar_groups SET name = ?, description = ?, color = ?, hidden = ? WHERE id = ?',
    [name, description, color, hidden, id]
  )
  await logUpdateById('avatar_groups', id, { name, description, color, hidden })
}

export async function deleteAvatarGroup(id: number): Promise<void> {
  const db = await getDb()
  const entityId = await getEntityId('avatar_groups', id)
  await db.execute('DELETE FROM avatar_group_members WHERE group_id = ?', [id])
  await db.execute('DELETE FROM avatar_groups WHERE id = ?', [id])
  if (entityId) await logDelete('avatar_groups', entityId)
}

export async function setGroupMembers(groupId: number, avatarIds: number[]): Promise<void> {
  const db = await getDb()
  await db.execute('DELETE FROM avatar_group_members WHERE group_id = ?', [groupId])
  for (const avatarId of avatarIds) {
    await db.execute(
      'INSERT OR IGNORE INTO avatar_group_members (avatar_id, group_id) VALUES (?, ?)',
      [avatarId, groupId]
    )
  }
  await logUpdateById('avatar_groups', groupId, { member_ids: avatarIds })
}

// ── Avatar fields ──────────────────────────────────────────────────────────────

export async function getAvatarFields(): Promise<AvatarField[]> {
  const db = await getDb()
  return db.select<AvatarField[]>('SELECT * FROM avatar_fields ORDER BY sort_order, name')
}

export async function createAvatarField(name: string, fieldType: AvatarFieldType = 'text', listValues: string | null = null): Promise<void> {
  const db = await getDb()
  const rows = await db.select<{ max: number }[]>('SELECT COALESCE(MAX(sort_order), -1) as max FROM avatar_fields')
  const sortOrder = (rows[0]?.max ?? -1) + 1
  const entityId = crypto.randomUUID()
  await db.execute(
    'INSERT INTO avatar_fields (name, field_type, list_values, sort_order, entity_id) VALUES (?, ?, ?, ?, ?)',
    [name, fieldType, listValues, sortOrder, entityId]
  )
  await logCreate('avatar_fields', entityId, { name, field_type: fieldType, list_values: listValues, sort_order: sortOrder })
}

export async function updateAvatarField(id: number, name: string, fieldType: AvatarFieldType, listValues: string | null): Promise<void> {
  const db = await getDb()
  await db.execute(
    'UPDATE avatar_fields SET name = ?, field_type = ?, list_values = ? WHERE id = ?',
    [name, fieldType, listValues, id]
  )
  await logUpdateById('avatar_fields', id, { name, field_type: fieldType, list_values: listValues })
}

export async function deleteAvatarField(id: number): Promise<void> {
  const db = await getDb()
  const entityId = await getEntityId('avatar_fields', id)
  await db.execute('DELETE FROM avatar_field_values WHERE field_id = ?', [id])
  await db.execute('DELETE FROM avatar_fields WHERE id = ?', [id])
  if (entityId) await logDelete('avatar_fields', entityId)
}

export async function setAvatarFieldSortOrders(ids: number[]): Promise<void> {
  return setSortOrders('avatar_fields', ids)
}

export async function getAvatarFieldValues(avatarId: number): Promise<AvatarFieldValue[]> {
  const db = await getDb()
  return db.select<AvatarFieldValue[]>(
    'SELECT avatar_id, field_id, value FROM avatar_field_values WHERE avatar_id = ?', [avatarId]
  )
}

export async function getAllAvatarFieldValues(): Promise<AvatarFieldValue[]> {
  const db = await getDb()
  return db.select<AvatarFieldValue[]>('SELECT avatar_id, field_id, value FROM avatar_field_values')
}

export async function setAvatarFieldValues(avatarId: number, values: { fieldId: number; value: string }[]): Promise<void> {
  const db = await getDb()
  await db.execute('DELETE FROM avatar_field_values WHERE avatar_id = ?', [avatarId])
  for (const { fieldId, value } of values) {
    if (value.trim()) {
      await db.execute(
        'INSERT INTO avatar_field_values (avatar_id, field_id, value) VALUES (?, ?, ?)',
        [avatarId, fieldId, value.trim()]
      )
    }
  }
  await logUpdateById('avatars', avatarId, { field_values: values })
}

export async function setAvatarGroups(avatarId: number, groupIds: number[]): Promise<void> {
  const db = await getDb()
  await db.execute('DELETE FROM avatar_group_members WHERE avatar_id = ?', [avatarId])
  for (const groupId of groupIds) {
    await db.execute(
      'INSERT OR IGNORE INTO avatar_group_members (avatar_id, group_id) VALUES (?, ?)',
      [avatarId, groupId]
    )
  }
  await logUpdateById('avatars', avatarId, { group_ids: groupIds })
}

// ── Avatar notes ────────────────────────────────────────────────────────────────

export async function getAvatarNotes(avatarId: number): Promise<AvatarNote[]> {
  const db = await getDb()
  return db.select<AvatarNote[]>(
    'SELECT * FROM avatar_notes WHERE avatar_id = ? ORDER BY favorite DESC, updated_at DESC',
    [avatarId]
  )
}

export async function createAvatarNote(
  avatarId: number, authorAvatarId: number | null,
  title: string, body: string, color: string | null, favorite: number
): Promise<number> {
  const db = await getDb()
  const entityId = crypto.randomUUID()
  const result = await db.execute(
    'INSERT INTO avatar_notes (avatar_id, author_avatar_id, title, body, color, favorite, entity_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [avatarId, authorAvatarId, title, body, color, favorite, entityId]
  )
  const avatarEidNote = await getEntityId('avatars', avatarId)
  const authorEid = authorAvatarId ? await getEntityId('avatars', authorAvatarId) : null
  await logCreate('avatar_notes', entityId, { _avatar_eid: avatarEidNote, _author_avatar_eid: authorEid, title, body, color, favorite })
  return result.lastInsertId as number
}

export async function updateAvatarNote(
  id: number, title: string, body: string, color: string | null, favorite: number, editorAvatarId: number | null
): Promise<void> {
  const db = await getDb()
  await db.execute(
    "UPDATE avatar_notes SET title = ?, body = ?, color = ?, favorite = ?, editor_avatar_id = ?, updated_at = datetime('now') WHERE id = ?",
    [title, body, color, favorite, editorAvatarId, id]
  )
  const entityId = await getEntityId('avatar_notes', id)
  const editorEid = editorAvatarId ? await getEntityId('avatars', editorAvatarId) : null
  if (entityId) await logUpdate('avatar_notes', entityId, { title, body, color, favorite, _editor_avatar_eid: editorEid })
}

export async function deleteAvatarNote(id: number): Promise<void> {
  const db = await getDb()
  const entityId = await getEntityId('avatar_notes', id)
  await db.execute('DELETE FROM avatar_notes WHERE id = ?', [id])
  if (entityId) await logDelete('avatar_notes', entityId)
}
