import { loadNativeDb, type NativeDb } from '../native/db'
import { recordDb } from '../store/debug'

// Optional SQLCipher key. Set via setDbKey() before the first getDb() call.
let _dbKey: string | undefined
let dbPromise: Promise<NativeDb> | null = null

export function setDbKey(key: string | undefined) { _dbKey = key }
export function getDbKey(): string | undefined { return _dbKey }
export function resetDb() { dbPromise = null }

export async function setSortOrders(table: string, ids: number[]): Promise<void> {
  const db = await getDb()
  for (let i = 0; i < ids.length; i++) {
    await db.execute(`UPDATE ${table} SET sort_order = ? WHERE id = ?`, [i, ids[i]])
  }
}

export function getDb(): Promise<NativeDb> {
  if (!dbPromise) {
    dbPromise = initDb()
  }
  return dbPromise
}

async function initDb(): Promise<NativeDb> {
  console.log('[db] loading...')
  const db = await loadNativeDb('dsj', _dbKey)
  console.log('[db] loaded, running migrations...')
  await runMigrations(db)
  console.log('[db] ready')
  instrumentDb(db)
  return db
}

function sqlLabel(sql: string): string {
  const s = sql.trim().replace(/\s+/g, ' ')
  const op = s.match(/^(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|PRAGMA)/i)?.[1]?.toUpperCase() ?? '?'
  const table = s.match(/(?:FROM|INTO|UPDATE|TABLE(?:\s+IF\s+NOT\s+EXISTS)?)\s+(\w+)/i)?.[1] ?? ''
  if (op === 'SELECT' && table) {
    const where = s.match(/WHERE\s+(.+?)(?=\s+ORDER|\s+LIMIT|$)/i)?.[1] ?? ''
    let tag = ''
    if (where.includes('channel_id'))  tag = 'ch'
    else if (where.includes('avatar_id')) tag = 'av'
    else if (where.includes('LIKE'))   tag = 'search'
    else if (where.includes('deleted')) tag = 'all'
    if (!tag && s.includes('GROUP BY')) tag = 'count'
    if (tag) return `${op} ${table} [${tag}]`
  }
  return table ? `${op} ${table}` : op
}

function instrumentDb(db: NativeDb): void {
  const origSelect  = db.select.bind(db)
  const origExecute = db.execute.bind(db)
  ;(db as unknown as Record<string, unknown>).select = async <T>(sql: string, params?: unknown[]): Promise<T> => {
    const t = performance.now()
    try { return await origSelect<T>(sql, params) }
    finally { recordDb(sqlLabel(sql), Math.round(performance.now() - t)) }
  }
  ;(db as unknown as Record<string, unknown>).execute = async (sql: string, params?: unknown[]) => {
    const t = performance.now()
    try { return await origExecute(sql, params) }
    finally { recordDb(sqlLabel(sql), Math.round(performance.now() - t)) }
  }
}

async function runMigrations(db: NativeDb) {
  await db.execute(`PRAGMA foreign_keys = ON;`)

  await db.execute(`
    CREATE TABLE IF NOT EXISTS folders (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT    NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT    NOT NULL DEFAULT (datetime('now')),
      view_mode  TEXT,
      entity_id  TEXT    UNIQUE
    )
  `)

  await db.execute(`
    CREATE TABLE IF NOT EXISTS avatars (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT    NOT NULL,
      color      TEXT    NOT NULL DEFAULT '#888888',
      image_path TEXT,
      image_data TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT    NOT NULL DEFAULT (datetime('now')),
      entity_id  TEXT    UNIQUE
    )
  `)

  await db.execute(`
    CREATE TABLE IF NOT EXISTS channels (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      name           TEXT    NOT NULL,
      folder_id      INTEGER REFERENCES folders(id) ON DELETE RESTRICT,
      sort_order     INTEGER NOT NULL DEFAULT 0,
      last_avatar_id INTEGER REFERENCES avatars(id) ON DELETE SET NULL,
      created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
      view_mode      TEXT,
      sync_enabled   INTEGER NOT NULL DEFAULT 1,
      entity_id      TEXT    UNIQUE
    )
  `)

  await db.execute(`
    CREATE TABLE IF NOT EXISTS avatar_groups (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT    NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT    NOT NULL DEFAULT (datetime('now')),
      entity_id  TEXT    UNIQUE
    )
  `)

  await db.execute(`
    CREATE TABLE IF NOT EXISTS avatar_group_members (
      avatar_id INTEGER NOT NULL REFERENCES avatars(id) ON DELETE CASCADE,
      group_id  INTEGER NOT NULL REFERENCES avatar_groups(id) ON DELETE CASCADE,
      PRIMARY KEY (avatar_id, group_id)
    )
  `)

  await db.execute(`
    CREATE TABLE IF NOT EXISTS messages (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      channel_id        INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
      avatar_id         INTEGER REFERENCES avatars(id),
      text              TEXT    NOT NULL,
      original_text     TEXT,
      deleted           INTEGER NOT NULL DEFAULT 0,
      created_at        TEXT    NOT NULL DEFAULT (datetime('now')),
      tracker_record_id INTEGER REFERENCES tracker_records(id),
      parent_msg_id     INTEGER REFERENCES messages(id),
      entity_id         TEXT    UNIQUE
    )
  `)

  await db.execute(`
    CREATE TABLE IF NOT EXISTS channel_avatar_activity (
      channel_id INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
      avatar_id  INTEGER NOT NULL REFERENCES avatars(id) ON DELETE CASCADE,
      PRIMARY KEY (channel_id, avatar_id)
    )
  `)

  // Drop old 2-column index so it gets replaced by the covering 3-column version below
  try { await db.execute(`DROP INDEX IF EXISTS idx_messages_channel`) } catch { /* ok */ }

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(channel_id, deleted, created_at DESC)
  `)

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_messages_all ON messages(deleted, created_at DESC)
  `)

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_messages_avatar ON messages(avatar_id, deleted, created_at DESC)
  `)

  await db.execute(`
    CREATE TABLE IF NOT EXISTS trackers (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      channel_id   INTEGER NOT NULL REFERENCES channels(id),
      name         TEXT    NOT NULL,
      description  TEXT,
      color        TEXT,
      hidden       INTEGER NOT NULL DEFAULT 0,
      sort_order   INTEGER NOT NULL DEFAULT 0,
      created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
      sync_enabled INTEGER NOT NULL DEFAULT 1,
      entity_id    TEXT    UNIQUE
    )
  `)

  await db.execute(`
    CREATE TABLE IF NOT EXISTS tracker_fields (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      tracker_id    INTEGER NOT NULL REFERENCES trackers(id) ON DELETE CASCADE,
      name          TEXT    NOT NULL,
      field_type    TEXT    NOT NULL,
      sort_order    INTEGER NOT NULL DEFAULT 0,
      required      INTEGER NOT NULL DEFAULT 1,
      list_values   TEXT,
      range_min     REAL,
      range_max     REAL,
      custom_editor  TEXT,
      default_value  TEXT,
      entity_id      TEXT    UNIQUE
    )
  `)

  await db.execute(`
    CREATE TABLE IF NOT EXISTS tracker_records (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      tracker_id INTEGER NOT NULL REFERENCES trackers(id) ON DELETE CASCADE,
      avatar_id  INTEGER REFERENCES avatars(id),
      modified   INTEGER NOT NULL DEFAULT 0,
      created_at TEXT    NOT NULL DEFAULT (datetime('now')),
      entity_id  TEXT    UNIQUE
    )
  `)

  await db.execute(`
    CREATE TABLE IF NOT EXISTS tracker_record_values (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      record_id       INTEGER NOT NULL REFERENCES tracker_records(id) ON DELETE CASCADE,
      field_id        INTEGER NOT NULL REFERENCES tracker_fields(id),
      value_text      TEXT,
      value_number    REAL,
      value_boolean   INTEGER,
      value_avatar_id INTEGER REFERENCES avatars(id),
      UNIQUE(record_id, field_id)
    )
  `)

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_tracker_records_tracker ON tracker_records(tracker_id)
  `)

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_tracker_record_values_record ON tracker_record_values(record_id)
  `)

  await db.execute(`
    CREATE TABLE IF NOT EXISTS avatar_fields (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT    NOT NULL,
      field_type  TEXT    NOT NULL DEFAULT 'text',
      list_values TEXT,
      sort_order  INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      entity_id   TEXT    UNIQUE
    )
  `)

  await db.execute(`
    CREATE TABLE IF NOT EXISTS avatar_field_values (
      avatar_id INTEGER NOT NULL REFERENCES avatars(id) ON DELETE CASCADE,
      field_id  INTEGER NOT NULL REFERENCES avatar_fields(id) ON DELETE CASCADE,
      value     TEXT    NOT NULL DEFAULT '',
      PRIMARY KEY (avatar_id, field_id)
    )
  `)

  await db.execute(`
    CREATE TABLE IF NOT EXISTS avatar_notes (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      avatar_id        INTEGER NOT NULL REFERENCES avatars(id) ON DELETE CASCADE,
      author_avatar_id INTEGER REFERENCES avatars(id) ON DELETE SET NULL,
      editor_avatar_id INTEGER REFERENCES avatars(id) ON DELETE SET NULL,
      title            TEXT    NOT NULL DEFAULT '',
      body             TEXT    NOT NULL DEFAULT '',
      color            TEXT,
      favorite         INTEGER NOT NULL DEFAULT 0,
      created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at       TEXT    NOT NULL DEFAULT (datetime('now')),
      entity_id        TEXT    UNIQUE
    )
  `)

  await db.execute(`
    CREATE TABLE IF NOT EXISTS front_log_config (
      id          INTEGER PRIMARY KEY,
      channel_id  INTEGER NOT NULL REFERENCES channels(id),
      description TEXT,
      color       TEXT
    )
  `)

  await db.execute(`
    CREATE TABLE IF NOT EXISTS front_sessions (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      avatar_id  INTEGER REFERENCES avatars(id) ON DELETE SET NULL,
      entered_at TEXT    NOT NULL DEFAULT (datetime('now')),
      exited_at  TEXT,
      entity_id  TEXT    UNIQUE
    )
  `)

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_front_sessions_open ON front_sessions(exited_at)
  `)

  await db.execute(`
    CREATE TABLE IF NOT EXISTS tags (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      name         TEXT    NOT NULL UNIQUE,
      display_name TEXT    NOT NULL,
      created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
      last_used_at TEXT,
      entity_id    TEXT    UNIQUE
    )
  `)

  await db.execute(`
    CREATE TABLE IF NOT EXISTS emoji_overrides (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT    NOT NULL UNIQUE,
      aliases    TEXT,
      emoji      TEXT    NOT NULL DEFAULT '',
      category   TEXT    NOT NULL DEFAULT '',
      created_at TEXT    NOT NULL DEFAULT (datetime('now')),
      entity_id  TEXT    UNIQUE
    )
  `)

  await db.execute(`
    CREATE TABLE IF NOT EXISTS message_images (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      image_path TEXT    NOT NULL,
      caption    TEXT,
      location   TEXT,
      people     TEXT,
      created_at TEXT    NOT NULL DEFAULT (datetime('now')),
      entity_id  TEXT    UNIQUE
    )
  `)

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_message_images_message ON message_images(message_id)
  `)

  // --- Sync tables ---

  // device_config: stores this device's identity and sync settings
  await db.execute(`
    CREATE TABLE IF NOT EXISTS device_config (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `)

  // event_log: append-only record of all local create/update/delete operations
  await db.execute(`
    CREATE TABLE IF NOT EXISTS event_log (
      event_id       TEXT    PRIMARY KEY,
      device_id      TEXT    NOT NULL,
      device_counter INTEGER NOT NULL,
      entity_type    TEXT    NOT NULL,
      entity_id      TEXT    NOT NULL,
      operation      TEXT    NOT NULL,
      payload        TEXT,
      timestamp      INTEGER NOT NULL
    )
  `)
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_event_log_device ON event_log(device_id, device_counter)
  `)
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_event_log_entity ON event_log(entity_id)
  `)

  // sync_peers: trusted devices we can exchange events with
  await db.execute(`
    CREATE TABLE IF NOT EXISTS sync_peers (
      device_id           TEXT    PRIMARY KEY,
      device_name         TEXT,
      device_type         TEXT    NOT NULL DEFAULT 'full',
      last_seen_counter   INTEGER NOT NULL DEFAULT 0,
      last_sync_timestamp INTEGER,
      peer_address        TEXT,
      peer_code           TEXT,
      trusted             INTEGER NOT NULL DEFAULT 0,
      blocked             INTEGER NOT NULL DEFAULT 0
    )
  `)

  // sync_conflicts: unresolved LWW conflicts requiring user decision
  await db.execute(`
    CREATE TABLE IF NOT EXISTS sync_conflicts (
      id          TEXT    PRIMARY KEY,
      entity_type TEXT    NOT NULL,
      entity_id   TEXT    NOT NULL,
      field_name  TEXT,
      device_id_a TEXT    NOT NULL,
      event_id_a  TEXT    NOT NULL,
      device_id_b TEXT    NOT NULL,
      event_id_b  TEXT    NOT NULL,
      detected_at INTEGER NOT NULL,
      status      TEXT    NOT NULL DEFAULT 'open'
    )
  `)
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_sync_conflicts_entity ON sync_conflicts(entity_id)
  `)
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_sync_conflicts_open ON sync_conflicts(status) WHERE status = 'open'
  `)

  // additive migrations — ignore errors when column already exists
  const alterations = [
    'ALTER TABLE avatars ADD COLUMN description TEXT',
    'ALTER TABLE avatars ADD COLUMN pronouns TEXT',
    'ALTER TABLE avatars ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE avatars ADD COLUMN icon_letters TEXT',
    'ALTER TABLE avatar_groups ADD COLUMN description TEXT',
    'ALTER TABLE avatar_groups ADD COLUMN color TEXT',
    'ALTER TABLE avatar_groups ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE folders ADD COLUMN description TEXT',
    'ALTER TABLE folders ADD COLUMN color TEXT',
    'ALTER TABLE folders ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE channels ADD COLUMN description TEXT',
    'ALTER TABLE channels ADD COLUMN color TEXT',
    'ALTER TABLE channels ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0',
    // tracker_record_id was added here; now in CREATE TABLE — keep for existing DBs
    'ALTER TABLE messages ADD COLUMN tracker_record_id INTEGER REFERENCES tracker_records(id)',
    'ALTER TABLE messages ADD COLUMN parent_msg_id INTEGER REFERENCES messages(id)',
    'ALTER TABLE trackers ADD COLUMN color TEXT',
    'ALTER TABLE folders ADD COLUMN view_mode TEXT',
    'ALTER TABLE channels ADD COLUMN view_mode TEXT',
    "ALTER TABLE avatar_fields ADD COLUMN field_type TEXT NOT NULL DEFAULT 'text'",
    'ALTER TABLE avatar_fields ADD COLUMN list_values TEXT',
    'ALTER TABLE avatar_notes ADD COLUMN editor_avatar_id INTEGER REFERENCES avatars(id) ON DELETE SET NULL',
    "ALTER TABLE tracker_fields ADD COLUMN summary_op TEXT NOT NULL DEFAULT 'none'",
    'ALTER TABLE tracker_fields ADD COLUMN default_value TEXT',
    // entity_id columns for sync — added to all content tables
    'ALTER TABLE folders ADD COLUMN entity_id TEXT',
    'ALTER TABLE channels ADD COLUMN entity_id TEXT',
    'ALTER TABLE avatars ADD COLUMN entity_id TEXT',
    'ALTER TABLE avatar_groups ADD COLUMN entity_id TEXT',
    'ALTER TABLE messages ADD COLUMN entity_id TEXT',
    'ALTER TABLE trackers ADD COLUMN entity_id TEXT',
    'ALTER TABLE tracker_fields ADD COLUMN entity_id TEXT',
    'ALTER TABLE tracker_records ADD COLUMN entity_id TEXT',
    'ALTER TABLE avatar_fields ADD COLUMN entity_id TEXT',
    'ALTER TABLE avatar_notes ADD COLUMN entity_id TEXT',
    'ALTER TABLE front_sessions ADD COLUMN entity_id TEXT',
    'ALTER TABLE tags ADD COLUMN entity_id TEXT',
    'ALTER TABLE emoji_overrides ADD COLUMN entity_id TEXT',
    'ALTER TABLE message_images ADD COLUMN entity_id TEXT',
    "ALTER TABLE sync_peers ADD COLUMN device_type TEXT NOT NULL DEFAULT 'full'",
    'ALTER TABLE channels ADD COLUMN sync_enabled INTEGER NOT NULL DEFAULT 1',
    'ALTER TABLE trackers ADD COLUMN sync_enabled INTEGER NOT NULL DEFAULT 1',
    'ALTER TABLE avatars ADD COLUMN image_data TEXT',
  ]
  for (const sql of alterations) {
    try { await db.execute(sql) } catch { /* column already exists */ }
  }

  // Backfill entity_id for all existing rows that don't have one yet.
  // Uses SQLite's randomblob to generate UUID4-format identifiers.
  // Runs in a single UPDATE per table — only touches rows where entity_id IS NULL.
  const entityIdTables = [
    'folders', 'channels', 'avatars', 'avatar_groups', 'messages',
    'trackers', 'tracker_fields', 'tracker_records', 'avatar_fields',
    'avatar_notes', 'front_sessions', 'tags', 'emoji_overrides', 'message_images',
  ]
  for (const table of entityIdTables) {
    try {
      await db.execute(`
        UPDATE ${table}
        SET entity_id = (
          lower(hex(randomblob(4))) || '-' ||
          lower(hex(randomblob(2))) || '-4' ||
          lower(substr(hex(randomblob(2)),1,3)) || '-' ||
          lower(hex(randomblob(2))) || '-' ||
          lower(hex(randomblob(6)))
        )
        WHERE entity_id IS NULL
      `)
    } catch (e) {
      console.warn(`[migration] entity_id backfill for ${table}:`, e)
    }
  }

  // Migrate Front Log from tracker system to dedicated first-class feature.
  // Runs once: if front_log_config is empty and a "Front Log" tracker exists,
  // drop its records/messages (user choice) and claim its channel.
  try {
    const flRows = await db.select<{ n: number }[]>(
      `SELECT COUNT(*) as n FROM front_log_config`
    )
    if (flRows[0].n === 0) {
      const trackerRows = await db.select<{ id: number; channel_id: number }[]>(
        `SELECT id, channel_id FROM trackers WHERE name = 'Front Log' LIMIT 1`
      )
      if (trackerRows.length > 0) {
        const { id: tid, channel_id: cid } = trackerRows[0]
        await db.execute(`DELETE FROM messages WHERE channel_id = ?`, [cid])
        await db.execute(`DELETE FROM trackers WHERE id = ?`, [tid])
        await db.execute(`INSERT INTO front_log_config (id, channel_id) VALUES (1, ?)`, [cid])
      }
    }
  } catch (e) {
    console.warn('[migration] front log extraction:', e)
  }

  // Make tracker_records.avatar_id nullable.
  // Records feature was non-functional before this migration, so data loss is acceptable.
  // Drop+recreate is used because the rename approach is unreliable with this SQLite plugin.
  // Fix tracker_record_values if its FK was broken by the rename migration.
  // SQLite updates FK references on table rename, so if tracker_records was renamed
  // and later dropped, tracker_record_values ends up referencing a non-existent table.
  try {
    const tvSql = await db.select<{ sql: string }[]>(
      `SELECT sql FROM sqlite_master WHERE type='table' AND name='tracker_record_values'`
    )
    if (tvSql[0]?.sql?.includes('tracker_records_old')) {
      await db.execute('DROP TABLE IF EXISTS tracker_record_values')
      await db.execute(`
        CREATE TABLE tracker_record_values (
          id              INTEGER PRIMARY KEY AUTOINCREMENT,
          record_id       INTEGER NOT NULL REFERENCES tracker_records(id) ON DELETE CASCADE,
          field_id        INTEGER NOT NULL REFERENCES tracker_fields(id),
          value_text      TEXT,
          value_number    REAL,
          value_boolean   INTEGER,
          value_avatar_id INTEGER REFERENCES avatars(id),
          UNIQUE(record_id, field_id)
        )
      `)
      await db.execute('CREATE INDEX IF NOT EXISTS idx_tracker_record_values_record ON tracker_record_values(record_id)')
    }
  } catch (e) {
    console.warn('[migration] tracker_record_values FK fix:', e)
  }

  // FTS5 full-text search index on message text.
  // One-time rebuild on first creation; triggers keep it in sync afterward.
  try {
    const ftsExists = await db.select<{ n: number }[]>(
      `SELECT COUNT(*) as n FROM sqlite_master WHERE type='table' AND name='messages_fts'`
    )
    if (ftsExists[0].n === 0) {
      await db.execute(`
        CREATE VIRTUAL TABLE messages_fts USING fts5(
          text,
          content='messages',
          content_rowid='id',
          tokenize='unicode61'
        )
      `)
      await db.execute(`
        CREATE TRIGGER messages_fts_insert AFTER INSERT ON messages BEGIN
          INSERT INTO messages_fts(rowid, text) VALUES (new.id, new.text);
        END
      `)
      await db.execute(`
        CREATE TRIGGER messages_fts_delete AFTER DELETE ON messages BEGIN
          INSERT INTO messages_fts(messages_fts, rowid, text) VALUES('delete', old.id, old.text);
        END
      `)
      await db.execute(`
        CREATE TRIGGER messages_fts_update AFTER UPDATE OF text ON messages BEGIN
          INSERT INTO messages_fts(messages_fts, rowid, text) VALUES('delete', old.id, old.text);
          INSERT INTO messages_fts(rowid, text) VALUES (new.id, new.text);
        END
      `)
      console.log('[db] building FTS index...')
      await db.execute(`INSERT INTO messages_fts(messages_fts) VALUES('rebuild')`)
    }
  } catch (e) {
    console.warn('[migration] FTS5 unavailable, falling back to LIKE search:', e)
  }
}
