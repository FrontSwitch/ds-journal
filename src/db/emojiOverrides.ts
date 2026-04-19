import { getDb } from './index'
import { logCreate, logUpdate, logDelete, getEntityId } from './sync'

export interface EmojiOverride {
  id: number
  name: string
  aliases: string | null   // pipe-separated: "happy|grin"
  emoji: string            // empty string = hidden
  category: string
  created_at: string
}

export async function getEmojiOverrides(): Promise<EmojiOverride[]> {
  const db = await getDb()
  return db.select<EmojiOverride[]>(
    'SELECT * FROM emoji_overrides ORDER BY category, name'
  )
}

export async function createEmojiOverride(
  name: string,
  aliases: string | null,
  emoji: string,
  category: string
): Promise<number> {
  const db = await getDb()
  const entityId = crypto.randomUUID()
  const result = await db.execute(
    'INSERT INTO emoji_overrides (name, aliases, emoji, category, entity_id) VALUES (?, ?, ?, ?, ?)',
    [name, aliases, emoji, category, entityId]
  )
  await logCreate('emoji_overrides', entityId, { name, aliases, emoji, category })
  return result.lastInsertId as number
}

export async function updateEmojiOverride(
  id: number,
  name: string,
  aliases: string | null,
  emoji: string,
  category: string
): Promise<void> {
  const db = await getDb()
  await db.execute(
    'UPDATE emoji_overrides SET name = ?, aliases = ?, emoji = ?, category = ? WHERE id = ?',
    [name, aliases, emoji, category, id]
  )
  const entityId = await getEntityId('emoji_overrides', id)
  if (entityId) await logUpdate('emoji_overrides', entityId, { name, aliases, emoji, category })
}

export async function deleteEmojiOverride(id: number): Promise<void> {
  const db = await getDb()
  const entityId = await getEntityId('emoji_overrides', id)
  await db.execute('DELETE FROM emoji_overrides WHERE id = ?', [id])
  if (entityId) await logDelete('emoji_overrides', entityId)
}
