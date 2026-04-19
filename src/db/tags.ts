import { getDb } from './index'
import type { Tag } from '../types'
import { extractTagsFromText } from '../lib/tagUtils'

export async function getTags(): Promise<Tag[]> {
  const db = await getDb()
  return db.select<Tag[]>(
    'SELECT * FROM tags ORDER BY last_used_at IS NULL, last_used_at DESC, created_at DESC'
  )
}

export async function getTagSuggestions(prefix: string): Promise<Tag[]> {
  const db = await getDb()
  return db.select<Tag[]>(
    `SELECT * FROM tags WHERE name LIKE ?
     ORDER BY last_used_at IS NULL, last_used_at DESC LIMIT 10`,
    [`${prefix.toLowerCase()}%`]
  )
}

// Called on message send/edit — extracts #tags from text and upserts them.
// display_name is set on first creation and never overwritten.
export async function upsertTagsFromText(text: string): Promise<void> {
  const tags = extractTagsFromText(text)
  if (tags.length === 0) return
  const db = await getDb()
  const now = new Date().toISOString()
  for (const { name, displayName } of tags) {
    await db.execute(
      `INSERT INTO tags (name, display_name, created_at, last_used_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(name) DO UPDATE SET last_used_at = excluded.last_used_at`,
      [name, displayName, now, now]
    )
  }
}

export async function deleteTag(id: number): Promise<void> {
  const db = await getDb()
  await db.execute('DELETE FROM tags WHERE id = ?', [id])
}

// Drop least-recently-used tags beyond the keep limit.
export async function pruneOldTags(keep = 10000): Promise<void> {
  const db = await getDb()
  await db.execute(
    `DELETE FROM tags WHERE id NOT IN (
       SELECT id FROM tags ORDER BY last_used_at IS NULL, last_used_at DESC LIMIT ?
     )`,
    [keep]
  )
}
