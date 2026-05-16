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
  'com.frontswitchstudio.dsj', 'test.db'
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
const groupCore        = insertGroup.run('Core',        'Primary fronters',          '#89b4fa', 0).lastInsertRowid
const groupProtectors  = insertGroup.run('Protectors',  'Protective alters',         '#f38ba8', 1).lastInsertRowid
const groupLittles     = insertGroup.run('Littles',     'Younger parts',             '#f9e2af', 2).lastInsertRowid
const groupCreatives   = insertGroup.run('Creatives',   'Artists and storytellers',  '#cba6f7', 3).lastInsertRowid
const groupCaretakers  = insertGroup.run('Caretakers',  'Nurturing and support',     '#a6e3a1', 4).lastInsertRowid
const groupSeekers     = insertGroup.run('Seekers',     'Curious and exploratory',   '#fab387', 5).lastInsertRowid
const groupAncients    = insertGroup.run('Ancients',    'Older parts and memories',  '#6c7086', 6).lastInsertRowid
const groupEdge        = insertGroup.run('Edge',        'Shadow and boundary work',  '#f38ba8', 7).lastInsertRowid

// ── Avatars ───────────────────────────────────────────────────────────────────

const insertAvatar = db.prepare(
  'INSERT INTO avatars (name, color, pronouns, image_path, sort_order) VALUES (?, ?, ?, ?, ?)'
)
const insertMember = db.prepare(
  'INSERT INTO avatar_group_members (avatar_id, group_id) VALUES (?, ?)'
)

function img(name) { return `builtin://avatars/kenney-animal-pack/${name}.png` }

let _avatarOrder = 0
function avatar(name, color, pronouns, group, animal) {
  const id = insertAvatar.run(name, color, pronouns, animal ? img(animal) : null, _avatarOrder++).lastInsertRowid
  if (group) insertMember.run(id, group)
  return id
}

// Core (8)
avatar('Alex',     '#89b4fa', 'they/them', groupCore,       'owl')
avatar('Jamie',    '#a6e3a1', 'she/her',   groupCore,       'rabbit')
avatar('Sam',      '#cba6f7', 'he/him',    groupCore,       null)
avatar('Morgan',   '#74c7ec', 'they/them', groupCore,       'dolphin')
avatar('Rowan',    '#89dceb', 'she/her',   groupCore,       null)
avatar('Casey',    '#94e2d5', 'he/him',    groupCore,       'parrot')
avatar('Avery',    '#a6e3a1', 'they/them', groupCore,       null)
avatar('Quinn',    '#b4befe', 'any/all',   groupCore,       'penguin')

// Protectors (10)
avatar('Sentinel', '#f38ba8', 'they/them', groupProtectors, 'bear')
avatar('Ward',     '#fab387', 'he/him',    groupProtectors, null)
avatar('Aegis',    '#f38ba8', 'she/her',   groupProtectors, 'wolf')
avatar('Bastion',  '#eba0ac', 'he/him',    groupProtectors, null)
avatar('Flint',    '#e64553', 'they/them', groupProtectors, 'fox')
avatar('Rampart',  '#f38ba8', 'he/him',    groupProtectors, null)
avatar('Veil',     '#cba6f7', 'she/her',   groupProtectors, 'owl')
avatar('Warden',   '#fab387', 'they/them', groupProtectors, null)
avatar('Bulwark',  '#f38ba8', 'he/him',    groupProtectors, 'bear')
avatar('Shield',   '#eba0ac', 'they/them', groupProtectors, null)

// Littles (12)
avatar('Pip',      '#f9e2af', 'she/her',   groupLittles,    'duck')
avatar('Sunny',    '#ffe0a0', 'they/them', groupLittles,    null)
avatar('Dot',      '#89dceb', 'she/her',   groupLittles,    'penguin')
avatar('Boo',      '#f9e2af', 'she/her',   groupLittles,    'rabbit')
avatar('Nibbles',  '#fab387', 'they/them', groupLittles,    null)
avatar('Sprout',   '#a6e3a1', 'he/him',    groupLittles,    'frog')
avatar('Pudding',  '#f9e2af', 'she/her',   groupLittles,    null)
avatar('Clover',   '#a6e3a1', 'they/them', groupLittles,    'deer')
avatar('Pebble',   '#89dceb', 'she/her',   groupLittles,    null)
avatar('Acorn',    '#fab387', 'he/him',    groupLittles,    'squirrel')
avatar('Wisp',     '#cba6f7', 'they/them', groupLittles,    null)
avatar('Flicker',  '#f9e2af', 'she/her',   groupLittles,    'firefly')

// Creatives (12)
avatar('Lyric',    '#cba6f7', 'she/her',   groupCreatives,  null)
avatar('Canvas',   '#89b4fa', 'they/them', groupCreatives,  null)
avatar('Reverie',  '#f5c2e7', 'she/her',   groupCreatives,  'butterfly')
avatar('Mosaic',   '#cba6f7', 'any/all',   groupCreatives,  null)
avatar('Fable',    '#f5c2e7', 'she/her',   groupCreatives,  null)
avatar('Prism',    '#89b4fa', 'they/them', groupCreatives,  null)
avatar('Lore',     '#cba6f7', 'he/him',    groupCreatives,  null)
avatar('Sonnet',   '#f5c2e7', 'she/her',   groupCreatives,  null)
avatar('Palette',  '#89b4fa', 'they/them', groupCreatives,  null)
avatar('Whimsy',   '#cba6f7', 'she/her',   groupCreatives,  null)
avatar('Stanza',   '#f5c2e7', 'any/all',   groupCreatives,  null)
avatar('Myth',     '#89b4fa', 'they/them', groupCreatives,  null)

// Caretakers (10)
avatar('Solace',   '#a6e3a1', 'she/her',   groupCaretakers, null)
avatar('Haven',    '#94e2d5', 'they/them', groupCaretakers, null)
avatar('Tender',   '#a6e3a1', 'she/her',   groupCaretakers, 'deer')
avatar('Bloom',    '#94e2d5', 'they/them', groupCaretakers, null)
avatar('Balm',     '#a6e3a1', 'she/her',   groupCaretakers, null)
avatar('Nurturer', '#94e2d5', 'they/them', groupCaretakers, null)
avatar('Anchor',   '#a6e3a1', 'he/him',    groupCaretakers, null)
avatar('Harbor',   '#94e2d5', 'she/her',   groupCaretakers, null)
avatar('Comfort',  '#a6e3a1', 'they/them', groupCaretakers, null)
avatar('Grounded', '#94e2d5', 'he/him',    groupCaretakers, null)

// Seekers (10)
avatar('Cipher',   '#fab387', 'they/them', groupSeekers,    null)
avatar('Wander',   '#f9e2af', 'she/her',   groupSeekers,    null)
avatar('Rune',     '#fab387', 'they/them', groupSeekers,    null)
avatar('Drift',    '#f9e2af', 'he/him',    groupSeekers,    null)
avatar('Riddle',   '#fab387', 'they/them', groupSeekers,    null)
avatar('Trace',    '#f9e2af', 'she/her',   groupSeekers,    null)
avatar('Quill',    '#fab387', 'they/them', groupSeekers,    null)
avatar('Spark',    '#f9e2af', 'he/him',    groupSeekers,    null)
avatar('Flint',    '#fab387', 'they/them', groupSeekers,    null)
avatar('Current',  '#f9e2af', 'she/her',   groupSeekers,    null)

// Ancients (8)
avatar('Elder',    '#6c7086', 'they/them', groupAncients,   null)
avatar('Archive',  '#585b70', 'she/her',   groupAncients,   null)
avatar('Remnant',  '#6c7086', 'he/him',    groupAncients,   null)
avatar('Vestige',  '#585b70', 'they/them', groupAncients,   null)
avatar('Chronicle','#6c7086', 'she/her',   groupAncients,   null)
avatar('Epoch',    '#585b70', 'they/them', groupAncients,   null)
avatar('Relic',    '#6c7086', 'he/him',    groupAncients,   null)
avatar('Memoria',  '#585b70', 'she/her',   groupAncients,   null)

// Edge (8)
avatar('Shade',    '#313244', 'they/them', groupEdge,       null)
avatar('Thorn',    '#45475a', 'she/her',   groupEdge,       null)
avatar('Fracture', '#313244', 'they/them', groupEdge,       null)
avatar('Hollow',   '#45475a', 'he/him',    groupEdge,       null)
avatar('Void',     '#313244', 'they/them', groupEdge,       null)
avatar('Ashen',    '#45475a', 'she/her',   groupEdge,       null)
avatar('Rift',     '#313244', 'they/them', groupEdge,       null)
avatar('Ember',    '#45475a', 'he/him',    groupEdge,       null)

// Ungrouped (12)
avatar('Echo',     '#cdd6f4', null,        null,            null)
avatar('River',    '#b4befe', 'they/them', null,            'narwhal')
avatar('Sage',     '#a6e3a1', 'she/her',   null,            null)
avatar('Mist',     '#89dceb', 'they/them', null,            null)
avatar('Vale',     '#cba6f7', 'she/her',   null,            null)
avatar('Stone',    '#6c7086', 'he/him',    null,            null)
avatar('Cinder',   '#fab387', 'they/them', null,            null)
avatar('Aura',     '#f5c2e7', 'she/her',   null,            null)
avatar('Nexus',    '#89b4fa', 'they/them', null,            null)
avatar('Axis',     '#94e2d5', 'he/him',    null,            null)
avatar('Lumen',    '#f9e2af', 'they/them', null,            null)
avatar('Vex',      '#f38ba8', 'they/them', null,            null)

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
