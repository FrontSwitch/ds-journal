/**
 * Shared helpers for sync integration tests (T3).
 * Uses better-sqlite3 to run a real SQLite DB in-process.
 * NOT imported by production code.
 */
import Database from 'better-sqlite3'
import type { NativeDb } from '../native/db'
import type { SyncEvent } from '../types'

/** Wrap a better-sqlite3 Database in the NativeDb async interface. */
export function makeNativeDb(sqliteDb: Database.Database): NativeDb {
  return {
    select: async <T>(sql: string, params?: unknown[]) =>
      sqliteDb.prepare(sql).all(params ?? []) as T,
    execute: async (sql: string, params?: unknown[]) => {
      const result = sqliteDb.prepare(sql).run(params ?? [])
      return { lastInsertId: result.lastInsertRowid as number }
    },
  }
}

/**
 * Create a fresh in-memory SQLite DB with the full DSJ schema.
 * Returns both the raw better-sqlite3 instance (for direct assertions)
 * and the NativeDb adapter (for passing to sync functions).
 */
export function makeTestDb(): { raw: Database.Database; db: NativeDb } {
  const raw = new Database(':memory:')
  raw.pragma('foreign_keys = ON')

  // Schema — all tables needed for sync tests, in FK-safe creation order.
  raw.exec(`
    CREATE TABLE folders (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT    NOT NULL,
      description TEXT,
      color      TEXT,
      hidden     INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT    NOT NULL DEFAULT (datetime('now')),
      view_mode  TEXT,
      entity_id  TEXT    UNIQUE
    );

    CREATE TABLE avatar_groups (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT    NOT NULL,
      description TEXT,
      color       TEXT,
      hidden      INTEGER NOT NULL DEFAULT 0,
      sort_order  INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      entity_id   TEXT    UNIQUE
    );

    CREATE TABLE avatar_fields (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT    NOT NULL,
      field_type  TEXT    NOT NULL DEFAULT 'text',
      list_values TEXT,
      sort_order  INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      entity_id   TEXT    UNIQUE
    );

    CREATE TABLE tags (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      name         TEXT    NOT NULL UNIQUE,
      display_name TEXT    NOT NULL,
      created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
      last_used_at TEXT,
      entity_id    TEXT    UNIQUE
    );

    CREATE TABLE emoji_overrides (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT    NOT NULL UNIQUE,
      aliases    TEXT,
      emoji      TEXT    NOT NULL DEFAULT '',
      category   TEXT    NOT NULL DEFAULT '',
      created_at TEXT    NOT NULL DEFAULT (datetime('now')),
      entity_id  TEXT    UNIQUE
    );

    CREATE TABLE avatars (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT    NOT NULL,
      color       TEXT    NOT NULL DEFAULT '#888888',
      image_path  TEXT,
      image_data  TEXT,
      description TEXT,
      pronouns    TEXT,
      hidden      INTEGER NOT NULL DEFAULT 0,
      icon_letters TEXT,
      sort_order  INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      entity_id   TEXT    UNIQUE
    );

    CREATE TABLE channels (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      name           TEXT    NOT NULL,
      folder_id      INTEGER REFERENCES folders(id) ON DELETE RESTRICT,
      description    TEXT,
      color          TEXT,
      hidden         INTEGER NOT NULL DEFAULT 0,
      sort_order     INTEGER NOT NULL DEFAULT 0,
      last_avatar_id INTEGER REFERENCES avatars(id) ON DELETE SET NULL,
      created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
      view_mode      TEXT,
      sync_enabled   INTEGER NOT NULL DEFAULT 1,
      entity_id      TEXT    UNIQUE
    );

    CREATE TABLE avatar_group_members (
      avatar_id INTEGER NOT NULL REFERENCES avatars(id) ON DELETE CASCADE,
      group_id  INTEGER NOT NULL REFERENCES avatar_groups(id) ON DELETE CASCADE,
      PRIMARY KEY (avatar_id, group_id)
    );

    CREATE TABLE avatar_field_values (
      avatar_id INTEGER NOT NULL REFERENCES avatars(id) ON DELETE CASCADE,
      field_id  INTEGER NOT NULL REFERENCES avatar_fields(id) ON DELETE CASCADE,
      value     TEXT    NOT NULL DEFAULT '',
      PRIMARY KEY (avatar_id, field_id)
    );

    CREATE TABLE trackers (
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
    );

    CREATE TABLE tracker_fields (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      tracker_id    INTEGER NOT NULL REFERENCES trackers(id) ON DELETE CASCADE,
      name          TEXT    NOT NULL,
      field_type    TEXT    NOT NULL,
      sort_order    INTEGER NOT NULL DEFAULT 0,
      required      INTEGER NOT NULL DEFAULT 1,
      list_values   TEXT,
      range_min     REAL,
      range_max     REAL,
      custom_editor TEXT,
      summary_op    TEXT    NOT NULL DEFAULT 'none',
      default_value TEXT,
      entity_id     TEXT    UNIQUE
    );

    CREATE TABLE tracker_records (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      tracker_id INTEGER NOT NULL REFERENCES trackers(id) ON DELETE CASCADE,
      avatar_id  INTEGER REFERENCES avatars(id),
      modified   INTEGER NOT NULL DEFAULT 0,
      created_at TEXT    NOT NULL DEFAULT (datetime('now')),
      entity_id  TEXT    UNIQUE
    );

    CREATE TABLE messages (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      channel_id        INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
      avatar_id         INTEGER REFERENCES avatars(id),
      text              TEXT    NOT NULL,
      original_text     TEXT,
      deleted           INTEGER NOT NULL DEFAULT 0,
      created_at        TEXT    NOT NULL DEFAULT (datetime('now')),
      tracker_record_id INTEGER REFERENCES tracker_records(id),
      parent_msg_id     INTEGER REFERENCES messages(id),
      entity_id         TEXT    UNIQUE,
      message_type      TEXT    NOT NULL DEFAULT 'chat'
    );

    CREATE TABLE tracker_record_values (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      record_id       INTEGER NOT NULL REFERENCES tracker_records(id) ON DELETE CASCADE,
      field_id        INTEGER NOT NULL REFERENCES tracker_fields(id),
      value_text      TEXT,
      value_number    REAL,
      value_boolean   INTEGER,
      value_avatar_id INTEGER REFERENCES avatars(id),
      UNIQUE(record_id, field_id)
    );

    CREATE TABLE message_images (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      image_path TEXT    NOT NULL,
      caption    TEXT,
      location   TEXT,
      people     TEXT,
      created_at TEXT    NOT NULL DEFAULT (datetime('now')),
      entity_id  TEXT    UNIQUE
    );

    CREATE TABLE avatar_notes (
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
    );

    CREATE TABLE front_sessions (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      avatar_id  INTEGER REFERENCES avatars(id) ON DELETE SET NULL,
      entered_at TEXT    NOT NULL DEFAULT (datetime('now')),
      exited_at  TEXT,
      entity_id  TEXT    UNIQUE
    );

    CREATE TABLE event_log (
      event_id       TEXT    PRIMARY KEY,
      device_id      TEXT    NOT NULL,
      device_counter INTEGER NOT NULL,
      entity_type    TEXT    NOT NULL,
      entity_id      TEXT    NOT NULL,
      operation      TEXT    NOT NULL,
      payload        TEXT,
      timestamp      INTEGER NOT NULL
    );

    CREATE INDEX idx_event_log_device ON event_log(device_id, device_counter);
    CREATE INDEX idx_event_log_entity ON event_log(entity_id);

    CREATE TABLE sync_conflicts (
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
    );
  `)

  return { raw, db: makeNativeDb(raw) }
}

/** Build a minimal SyncEvent for testing. */
export function makeEvent(
  overrides: Partial<{
    event_id: string
    device_id: string
    device_counter: number
    entity_type: string
    entity_id: string
    operation: SyncEvent['operation']
    payload: Record<string, unknown> | null
    timestamp: number
  }>
): SyncEvent {
  return {
    event_id:       overrides.event_id       ?? crypto.randomUUID(),
    device_id:      overrides.device_id      ?? 'device-peer',
    device_counter: overrides.device_counter ?? 1,
    entity_type:    overrides.entity_type    ?? 'avatars',
    entity_id:      overrides.entity_id      ?? crypto.randomUUID(),
    operation:      overrides.operation      ?? 'create',
    payload: overrides.payload !== undefined
      ? (overrides.payload === null ? null : JSON.stringify(overrides.payload))
      : JSON.stringify({ name: 'Test', color: '#aabbcc' }),
    timestamp:      overrides.timestamp      ?? 1000,
  }
}
