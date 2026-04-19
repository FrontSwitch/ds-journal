#!/usr/bin/env node
// Creates (or recreates) a test database pre-populated with sample alters and channels.
// Usage:
//   node scripts/seed-test-db.cjs
//
// Then run the app against it:
//   npm run dev:test

const Database = require('better-sqlite3')
const os = require('os')
const path = require('path')
const fs = require('fs')

const DB_PATH = process.env.DSJ_DB ?? path.join(
  os.homedir(), 'Library', 'Application Support',
  'io.github.frontswitch.dsj', 'test.db'
)

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true })

const KEYS_PATH = DB_PATH.replace(/\.db$/, '.keys')

for (const p of [DB_PATH, DB_PATH + '-wal', DB_PATH + '-shm', KEYS_PATH]) {
  if (fs.existsSync(p)) { fs.unlinkSync(p); console.log(`Removed ${path.basename(p)}`) }
}

const db = new Database(DB_PATH)
db.pragma('foreign_keys = ON')

// ── Schema (mirrors src/db/index.ts) ─────────────────────────────────────────

db.exec(`
  CREATE TABLE folders (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT    NOT NULL,
    description TEXT,
    color      TEXT,
    hidden     INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT    NOT NULL DEFAULT (datetime('now')),
    view_mode  TEXT
  );

  CREATE TABLE avatars (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL,
    color       TEXT    NOT NULL DEFAULT '#888888',
    image_path  TEXT,
    description TEXT,
    pronouns    TEXT,
    hidden      INTEGER NOT NULL DEFAULT 0,
    icon_letters TEXT,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
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
    view_mode      TEXT
  );

  CREATE TABLE avatar_groups (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL,
    description TEXT,
    color       TEXT,
    hidden      INTEGER NOT NULL DEFAULT 0,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE avatar_group_members (
    avatar_id INTEGER NOT NULL REFERENCES avatars(id) ON DELETE CASCADE,
    group_id  INTEGER NOT NULL REFERENCES avatar_groups(id) ON DELETE CASCADE,
    PRIMARY KEY (avatar_id, group_id)
  );

  CREATE TABLE messages (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_id        INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    avatar_id         INTEGER REFERENCES avatars(id),
    text              TEXT    NOT NULL,
    original_text     TEXT,
    deleted           INTEGER NOT NULL DEFAULT 0,
    created_at        TEXT    NOT NULL DEFAULT (datetime('now')),
    tracker_record_id INTEGER,
    parent_msg_id     INTEGER REFERENCES messages(id)
  );

  CREATE TABLE IF NOT EXISTS tags (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    name         TEXT    NOT NULL UNIQUE,
    display_name TEXT    NOT NULL,
    created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
    last_used_at TEXT
  );

  CREATE TABLE channel_avatar_activity (
    channel_id INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    avatar_id  INTEGER NOT NULL REFERENCES avatars(id) ON DELETE CASCADE,
    PRIMARY KEY (channel_id, avatar_id)
  );

  CREATE TABLE trackers (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_id  INTEGER NOT NULL REFERENCES channels(id),
    name        TEXT    NOT NULL,
    description TEXT,
    color       TEXT,
    hidden      INTEGER NOT NULL DEFAULT 0,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
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
    custom_editor TEXT
  );

  CREATE TABLE tracker_records (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    tracker_id INTEGER NOT NULL REFERENCES trackers(id) ON DELETE CASCADE,
    avatar_id  INTEGER REFERENCES avatars(id),
    modified   INTEGER NOT NULL DEFAULT 0,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
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

  CREATE INDEX idx_messages_channel          ON messages(channel_id, deleted, created_at DESC);
  CREATE INDEX idx_messages_all              ON messages(deleted, created_at DESC);
  CREATE INDEX idx_messages_avatar           ON messages(avatar_id, deleted, created_at DESC);
  CREATE INDEX idx_tracker_records_tracker   ON tracker_records(tracker_id);
  CREATE INDEX idx_tracker_record_values_rec ON tracker_record_values(record_id);
`)

// ── Avatar groups ─────────────────────────────────────────────────────────────

const insertGroup = db.prepare(
  'INSERT INTO avatar_groups (name, description, color, sort_order) VALUES (?, ?, ?, ?)'
)
const groupCore       = insertGroup.run('Core',       'Primary fronters',     '#89b4fa', 0).lastInsertRowid
const groupProtectors = insertGroup.run('Protectors', 'Protective alters',    '#f38ba8', 1).lastInsertRowid
const groupLittles    = insertGroup.run('Littles',    'Younger parts',        '#f9e2af', 2).lastInsertRowid

// ── Avatars ───────────────────────────────────────────────────────────────────

const insertAvatar = db.prepare(
  'INSERT INTO avatars (name, color, pronouns, image_path, sort_order) VALUES (?, ?, ?, ?, ?)'
)
const insertMember = db.prepare(
  'INSERT INTO avatar_group_members (avatar_id, group_id) VALUES (?, ?)'
)

function img(name) { return `builtin://avatars/kenney-animal-pack/${name}.png` }

function avatar(name, color, pronouns, group, order, animal) {
  const id = insertAvatar.run(name, color, pronouns, animal ? img(animal) : null, order).lastInsertRowid
  if (group) insertMember.run(id, group)
  return id
}

// Core (3)
avatar('Alex',     '#89b4fa', 'they/them', groupCore,       0, 'owl')
avatar('Jamie',    '#a6e3a1', 'she/her',   groupCore,       1, 'rabbit')
avatar('Sam',      '#cba6f7', 'he/him',    groupCore,       2, null)
// Protectors (2)
avatar('Sentinel', '#f38ba8', 'they/them', groupProtectors, 3, 'bear')
avatar('Ward',     '#fab387', 'he/him',    groupProtectors, 4, null)
// Littles (3)
avatar('Pip',      '#f9e2af', 'she/her',   groupLittles,    5, 'duck')
avatar('Sunny',    '#ffe0a0', 'they/them', groupLittles,    6, null)
avatar('Dot',      '#89dceb', 'she/her',   groupLittles,    7, 'penguin')
// Ungrouped (2)
avatar('Echo',     '#cdd6f4', null,        null,            8, null)
avatar('River',    '#b4befe', 'they/them', null,            9, 'narwhal')

// ── Folders + channels ────────────────────────────────────────────────────────

const insertFolder = db.prepare(
  'INSERT INTO folders (name, color, sort_order) VALUES (?, ?, ?)'
)
const insertChannel = db.prepare(
  'INSERT INTO channels (name, folder_id, sort_order) VALUES (?, ?, ?)'
)

const folderDaily  = insertFolder.run('Daily',  '#a6e3a1', 0).lastInsertRowid
const folderSystem = insertFolder.run('System', '#89b4fa', 1).lastInsertRowid
const folderOld    = insertFolder.run('Archive','#6c7086', 2).lastInsertRowid

// Daily (4)
insertChannel.run('general',  folderDaily,  0)
insertChannel.run('venting',  folderDaily,  1)
insertChannel.run('planning', folderDaily,  2)
insertChannel.run('check-in', folderDaily,  3)
// System (3)
insertChannel.run('front-log',  folderSystem, 0)
insertChannel.run('decisions',  folderSystem, 1)
insertChannel.run('memories',   folderSystem, 2)
// Archive (2)
insertChannel.run('old-general', folderOld, 0)
insertChannel.run('old-events',  folderOld, 1)
// Ungrouped (1)
insertChannel.run('random', null, 0)

// ── Done ─────────────────────────────────────────────────────────────────────

db.close()
console.log(`Test DB created at:\n  ${DB_PATH}`)
console.log('\nRun the app against it:')
console.log('  npm run dev:test')
