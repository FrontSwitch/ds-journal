import { getDb } from './index'
import type { MessageImage } from '../types'

export async function insertImage(
  messageId: number,
  imagePath: string,
  caption: string | null,
  location: string | null,
  people: string | null,
): Promise<void> {
  const db = await getDb()
  await db.execute(
    `INSERT INTO message_images (message_id, image_path, caption, location, people)
     VALUES (?, ?, ?, ?, ?)`,
    [messageId, imagePath, caption || null, location || null, people || null]
  )
}

export async function getAllImages(): Promise<MessageImage[]> {
  const db = await getDb()
  return db.select<MessageImage[]>(`
    SELECT mi.id, mi.message_id, mi.image_path, mi.caption, mi.location, mi.people, mi.created_at,
           m.avatar_id, a.name as avatar_name, a.color as avatar_color, m.channel_id, c.name as channel_name
    FROM message_images mi
    JOIN messages m ON mi.message_id = m.id
    LEFT JOIN avatars a ON m.avatar_id = a.id
    JOIN channels c ON m.channel_id = c.id
    WHERE m.deleted = 0
    ORDER BY mi.created_at DESC
  `)
}
