#!/usr/bin/env node
// Generates a load-test database with realistic message volume.
// Usage:
//   node scripts/seed-load-test.cjs [--messages N]  (default: 2000)
//
// Creates the same DB path as seed-test-db so you can run it with:
//   npm run dev:test

const Database = require('better-sqlite3')
const os = require('os')
const path = require('path')
const fs = require('fs')

const args = process.argv.slice(2)
const msgCountArg = args.indexOf('--messages')
const TOTAL_MESSAGES = msgCountArg !== -1 ? parseInt(args[msgCountArg + 1], 10) : 2000

const DB_PATH = path.join(
  os.homedir(), 'Library', 'Application Support',
  'com.frontswitchstudio.dsj', 'test.db'
)

for (const suffix of ['', '-wal', '-shm']) {
  const p = DB_PATH + suffix
  if (fs.existsSync(p)) { fs.unlinkSync(p); console.log(`Removed ${path.basename(p)}`) }
}

const db = new Database(DB_PATH)
db.pragma('foreign_keys = ON')
db.pragma('journal_mode = WAL')

// ── Schema ────────────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE folders (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL,
    description TEXT,
    color       TEXT,
    hidden      INTEGER NOT NULL DEFAULT 0,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    view_mode   TEXT
  );

  CREATE TABLE avatars (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    name         TEXT    NOT NULL,
    color        TEXT    NOT NULL DEFAULT '#888888',
    image_path   TEXT,
    description  TEXT,
    pronouns     TEXT,
    hidden       INTEGER NOT NULL DEFAULT 0,
    icon_letters TEXT,
    sort_order   INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
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

  CREATE TABLE tags (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    name         TEXT    NOT NULL UNIQUE,
    display_name TEXT    NOT NULL,
    created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
    last_used_at TEXT
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
const groupCore       = insertGroup.run('Core',       'Primary fronters',  '#89b4fa', 0).lastInsertRowid
const groupProtectors = insertGroup.run('Protectors', 'Protective alters', '#f38ba8', 1).lastInsertRowid
const groupLittles    = insertGroup.run('Littles',    'Younger parts',     '#f9e2af', 2).lastInsertRowid

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

const avatarAlex     = avatar('Alex',     '#89b4fa', 'they/them', groupCore,       0, 'owl')
const avatarJamie    = avatar('Jamie',    '#a6e3a1', 'she/her',   groupCore,       1, 'rabbit')
const avatarSam      = avatar('Sam',      '#cba6f7', 'he/him',    groupCore,       2, null)
const avatarSentinel = avatar('Sentinel', '#f38ba8', 'they/them', groupProtectors, 3, 'bear')
const avatarWard     = avatar('Ward',     '#fab387', 'he/him',    groupProtectors, 4, null)
const avatarPip      = avatar('Pip',      '#f9e2af', 'she/her',   groupLittles,    5, 'duck')
const avatarSunny    = avatar('Sunny',    '#ffe0a0', 'they/them', groupLittles,    6, null)
const avatarDot      = avatar('Dot',      '#89dceb', 'she/her',   groupLittles,    7, 'penguin')
const avatarEcho     = avatar('Echo',     '#cdd6f4', null,        null,            8, null)
const avatarRiver    = avatar('River',    '#b4befe', 'they/them', null,            9, 'narwhal')

// Weighted distribution: core alters post most, littles post occasionally
const AVATARS_WEIGHTED = [
  ...Array(12).fill(avatarAlex),
  ...Array(10).fill(avatarJamie),
  ...Array(10).fill(avatarSam),
  ...Array(5).fill(avatarSentinel),
  ...Array(4).fill(avatarWard),
  ...Array(3).fill(avatarPip),
  ...Array(3).fill(avatarSunny),
  ...Array(2).fill(avatarDot),
  ...Array(3).fill(avatarEcho),
  ...Array(3).fill(avatarRiver),
  null, null, // anonymous
]

// ── Folders + channels ────────────────────────────────────────────────────────

const insertFolder = db.prepare(
  'INSERT INTO folders (name, color, sort_order) VALUES (?, ?, ?)'
)
const insertChannel = db.prepare(
  'INSERT INTO channels (name, folder_id, sort_order) VALUES (?, ?, ?)'
)

const folderDaily  = insertFolder.run('Daily',   '#a6e3a1', 0).lastInsertRowid
const folderSystem = insertFolder.run('System',  '#89b4fa', 1).lastInsertRowid
const folderOld    = insertFolder.run('Archive', '#6c7086', 2).lastInsertRowid

const chGeneral   = insertChannel.run('general',      folderDaily,  0).lastInsertRowid
const chVenting   = insertChannel.run('venting',      folderDaily,  1).lastInsertRowid
const chPlanning  = insertChannel.run('planning',     folderDaily,  2).lastInsertRowid
const chCheckIn   = insertChannel.run('check-in',     folderDaily,  3).lastInsertRowid
const chFrontLog  = insertChannel.run('front-log',    folderSystem, 0).lastInsertRowid
const chDecisions = insertChannel.run('decisions',    folderSystem, 1).lastInsertRowid
const chMemories  = insertChannel.run('memories',     folderSystem, 2).lastInsertRowid
const chOldGen    = insertChannel.run('old-general',  folderOld,    0).lastInsertRowid
const chOldEvents = insertChannel.run('old-events',   folderOld,    1).lastInsertRowid
const chRandom    = insertChannel.run('random',       null,         0).lastInsertRowid

// Channel weights: ~12% to general → ~6k at 50k total
const CHANNELS_WEIGHTED = [
  ...Array(12).fill(chGeneral),
  ...Array(12).fill(chFrontLog),
  ...Array(12).fill(chCheckIn),
  ...Array(12).fill(chVenting),
  ...Array(10).fill(chPlanning),
  ...Array(10).fill(chMemories),
  ...Array(8).fill(chDecisions),
  ...Array(8).fill(chOldGen),
  ...Array(8).fill(chOldEvents),
  ...Array(8).fill(chRandom),
]

// ── Message content ───────────────────────────────────────────────────────────

const MESSAGES = [
  // Checking in
  "switching a lot today, hard to keep track",
  "front feels clearer this morning",
  "woke up mid-switch, took a while to orient",
  "co-fronting right now, a bit disorienting but manageable",
  "pretty stable today, we've been doing better",
  "lost about two hours, not sure who was out",
  "good morning from the front",
  "feeling more grounded than usual today",
  "present and accounted for",
  "slow day, mostly dissociated #dissociation",

  // Processing / emotional
  "that interaction earlier was really triggering #trigger",
  "worked through something difficult in therapy today",
  "feeling overwhelmed, too much input",
  "actually proud of how we handled that",
  "it's okay. we're okay. just needed to write that",
  "struggling with the memories again",
  "today was heavy. putting it down here so we don't carry it all night",
  "felt really seen today, it meant a lot",
  "frustration about things outside our control",
  "small win today, noting it for the record",
  "anxiety is loud today #anxiety",
  "the body is tired even if some of us aren't",
  "good cry, needed it",
  "feeling safer than we did last month",
  "that was scary but we got through it",

  // System communication
  "reminder to the others: we have an appointment Thursday",
  "please don't make commitments without checking with the rest of us",
  "thank you whoever handled that call, it sounded hard",
  "hey does anyone remember what we decided about that last week",
  "leaving a note here in case anyone else fronts tonight",
  "to whoever was out earlier: we're proud of you",
  "heads up, we're going to need a lot of quiet time this evening",
  "can we all agree not to doomscroll tonight",
  "for the record: this was a good decision",
  "checking if anyone else is having trouble with this",

  // Planning
  "things to get done this week: groceries, email, call back",
  "don't forget we said we'd rest on Sunday",
  "booking that appointment today #planning",
  "making a list of what needs to happen this week",
  "blocked out time for rest, please respect it",
  "priorities: body care, one task, no more",
  "goal for today is just getting through it, and that's enough",
  "small steps. today: make tea, open laptop, that's it",

  // Front log style
  "out since about 9am #frontlog",
  "switching at around 3pm #frontlog",
  "late night front, writing before it fades #frontlog",
  "in and out today, hard to pin down times",
  "front log: stable most of the afternoon",
  "fronted for an appointment, did okay #frontlog",

  // Memories / history
  "found an old note from two years ago, still relevant",
  "trying to piece together what happened that week",
  "some of us have memories of this, some don't",
  "this used to be really hard. it's less hard now",
  "remembering today isn't always how it felt back then",

  // Varied length entries
  "ok",
  "we're here",
  "hello",
  "noted",
  "agreed",
  "yeah that's fair",
  "thank you",
  "felt that",
  "This is a longer entry.\n\nWe had a hard day and needed to put it somewhere. The body went through a lot and some of us are still processing. Writing it down helps. We'll look back at this eventually and hopefully it'll make more sense. For now: we got through it, and that matters.",
  "Today was actually nice? That felt strange to write. We went outside, the sun was out, and for a little while things felt okay. Noting this so we remember that okay days exist.",
  "There's been tension in the system lately. Nothing dramatic, just friction. We're trying to be patient with each other. It's hard when everyone is hurting.",
  "Therapy today. We worked on something old. It's going to take more sessions but there was movement, which is the point. Feeling tired but also a little lighter.",
  "Reminder to future fronters: the thing in the fridge is from Monday, still fine to eat. We paid that bill. Appointment is next Thursday at 2. You're allowed to rest.",
]

const TAGS = ['#frontlog', '#switching', '#anxiety', '#dissociation', '#trigger', '#planning', '#mood', '#grounding', '#progress', '#memory']

// ── Time helpers ──────────────────────────────────────────────────────────────

// Spread messages over the past 180 days, with higher density in recent weeks
function randomTimestamp(rng) {
  const nowMs = Date.now()
  const days = Math.round(TOTAL_MESSAGES / 100) // ~100 messages/day
  const range = days * 24 * 60 * 60 * 1000
  // Weight toward recent: square the random value so older dates are less common
  const offset = Math.floor(Math.pow(rng(), 2) * range)
  const d = new Date(nowMs - offset)
  return d.toISOString().replace('T', ' ').slice(0, 19)
}

// Simple seeded PRNG (mulberry32)
function makePrng(seed) {
  return function() {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed)
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t
    return ((t ^ t >>> 14) >>> 0) / 4294967296
  }
}

const rng = makePrng(42)
function pick(arr) { return arr[Math.floor(rng() * arr.length)] }
function chance(p) { return rng() < p }

// ── FTS5 (created before bulk insert so triggers fire) ────────────────────────

db.exec(`
  CREATE VIRTUAL TABLE messages_fts USING fts5(
    text, content='messages', content_rowid='id', tokenize='unicode61'
  );
  CREATE TRIGGER messages_fts_insert AFTER INSERT ON messages BEGIN
    INSERT INTO messages_fts(rowid, text) VALUES (new.id, new.text);
  END;
  CREATE TRIGGER messages_fts_delete AFTER DELETE ON messages BEGIN
    INSERT INTO messages_fts(messages_fts, rowid, text) VALUES('delete', old.id, old.text);
  END;
  CREATE TRIGGER messages_fts_update AFTER UPDATE OF text ON messages BEGIN
    INSERT INTO messages_fts(messages_fts, rowid, text) VALUES('delete', old.id, old.text);
    INSERT INTO messages_fts(rowid, text) VALUES (new.id, new.text);
  END;
`)

// ── Insert messages ───────────────────────────────────────────────────────────

const insertMsg = db.prepare(`
  INSERT INTO messages (channel_id, avatar_id, text, created_at, parent_msg_id)
  VALUES (?, ?, ?, ?, ?)
`)

// Track recent message IDs per channel for building reply chains
const recentByChannel = {}

// Collect all rows then sort by timestamp so IDs roughly reflect chronological order
const rows = []
for (let i = 0; i < TOTAL_MESSAGES; i++) {
  const channelId = pick(CHANNELS_WEIGHTED)
  const avatarId = pick(AVATARS_WEIGHTED)
  let text = pick(MESSAGES)

  // 30% chance to append a tag
  if (chance(0.3)) text += ' ' + pick(TAGS)
  // 5% chance for a second tag
  if (chance(0.05)) text += ' ' + pick(TAGS)

  rows.push({ channelId, avatarId, text, ts: randomTimestamp(rng) })
}

// Sort chronologically so AUTOINCREMENT IDs match time order
rows.sort((a, b) => a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0)

const insertAll = db.transaction(() => {
  for (const row of rows) {
    const { channelId, avatarId, text, ts } = row

    // 20% chance to reply to a recent message in same channel
    let parentId = null
    if (chance(0.2) && recentByChannel[channelId]?.length > 0) {
      const candidates = recentByChannel[channelId]
      parentId = candidates[Math.floor(rng() * candidates.length)]
    }

    const result = insertMsg.run(channelId, avatarId, text, ts, parentId)
    const newId = result.lastInsertRowid

    if (!recentByChannel[channelId]) recentByChannel[channelId] = []
    recentByChannel[channelId].push(newId)
    // Keep only the last 10 per channel to avoid deep one-off chains
    if (recentByChannel[channelId].length > 10) recentByChannel[channelId].shift()
  }
})

insertAll()

// ── Summary ───────────────────────────────────────────────────────────────────

const counts = db.prepare(`
  SELECT c.name, COUNT(m.id) as n
  FROM channels c
  LEFT JOIN messages m ON m.channel_id = c.id
  GROUP BY c.id
  ORDER BY n DESC
`).all()

const repliesCount = db.prepare('SELECT COUNT(*) as n FROM messages WHERE parent_msg_id IS NOT NULL').get()
const threadedCount = db.prepare('SELECT COUNT(DISTINCT parent_msg_id) as n FROM messages WHERE parent_msg_id IS NOT NULL').get()

db.close()

console.log(`\nLoad test DB created: ${DB_PATH}`)
console.log(`\nMessages: ${TOTAL_MESSAGES} total, ${repliesCount.n} replies in ${threadedCount.n} threads`)
console.log('\nPer channel:')
counts.forEach(r => console.log(`  ${r.name.padEnd(14)} ${r.n}`))
console.log('\nRun with:  npm run dev:test')
