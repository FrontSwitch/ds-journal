#!/usr/bin/env node
// Import Simply Plural exports into DSJ (DissociativeSystemJournal)
//
// Setup:
//   cp scripts/import-map.example.json scripts/import-map.json
//   # edit import-map.json with your SP → DSJ name mappings
//   # put your SP .txt exports in the output/ directory
//
// Usage:
//   node scripts/import.cjs                          # dry run (default — nothing written)
//   node scripts/import.cjs --import                 # actually write to the database
//   node scripts/import.cjs --import --db /path/to/dsj.db

const fs = require('fs')
const path = require('path')
const Database = require('better-sqlite3')
const os = require('os')

const DRY_RUN = !process.argv.includes('--import')
const OUTPUT_DIR = path.join(__dirname, '..', 'output')
const MAP_FILE = path.join(__dirname, 'import-map.json')

// DB path: use --db <path>, or fall back to default macOS location.
// The default uses the bundle identifier from tauri.conf.json — change it if you customised that.
const dbFlagIndex = process.argv.indexOf('--db')
const DB_PATH = dbFlagIndex !== -1
  ? process.argv[dbFlagIndex + 1]
  : path.join(os.homedir(), 'Library', 'Application Support', 'com.frontswitchstudio.dsj', 'dsj.db')

// ── Load map ──────────────────────────────────────────────────────────────────

if (!fs.existsSync(MAP_FILE)) {
  console.error('Missing scripts/import-map.json')
  console.error('Copy scripts/import-map.example.json to scripts/import-map.json and fill in your names.')
  process.exit(1)
}
const map = JSON.parse(fs.readFileSync(MAP_FILE, 'utf8'))

// ── Open DB ───────────────────────────────────────────────────────────────────

if (!fs.existsSync(DB_PATH)) {
  console.error(`Database not found at: ${DB_PATH}`)
  console.error('Start the app once first so the DB is created, or pass --db <path> to specify a location.')
  process.exit(1)
}
const db = new Database(DB_PATH)
db.pragma('foreign_keys = ON')

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseTimestamp(ts) {
  // "[2025-05-23 12:54:38 PDT]" → UTC ISO string
  const match = ts.match(/\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) (PDT|PST|UTC)\]/)
  if (!match) return null
  const [, dt, tz] = match
  const offsetMin = tz === 'PDT' ? -420 : tz === 'PST' ? -480 : 0
  const d = new Date(dt.replace(' ', 'T') + '.000Z')
  d.setMinutes(d.getMinutes() - offsetMin)
  return d.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '')
}

function parseFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8')
  // Split on lines starting with [ timestamp ]
  const blocks = raw.split(/(?=\[\d{4}-\d{2}-\d{2})/).filter(b => b.trim())
  const messages = []
  for (const block of blocks) {
    const lines = block.split('\n')
    const header = lines[0].trim()
    const headerMatch = header.match(/^(\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} \w+\])\s+(.+)$/)
    if (!headerMatch) continue
    const [, tsRaw, avatarName] = headerMatch
    const text = lines.slice(1).join('\n').trim()
    if (!text) continue
    const created_at = parseTimestamp(tsRaw)
    if (!created_at) continue
    messages.push({ avatarName: avatarName.trim(), text, created_at })
  }
  return messages
}

// ── Lookup / create helpers ───────────────────────────────────────────────────

const avatarCache = {}
function getAvatarId(spName) {
  if (spName in avatarCache) return avatarCache[spName]
  const mappedName = map.avatars[spName]
  if (!mappedName) { avatarCache[spName] = null; return null }
  const row = db.prepare('SELECT id FROM avatars WHERE name = ?').get(mappedName)
  const id = row ? row.id : null
  if (!id) console.warn(`  ⚠ Avatar not found in DSJ: "${mappedName}" (mapped from "${spName}")`)
  avatarCache[spName] = id
  return id
}

const channelCache = {}
function getOrCreateChannelId(filename) {
  if (filename in channelCache) return channelCache[filename]
  const mappedName = map.channels[filename] ?? filename
  let row = db.prepare('SELECT id FROM channels WHERE name = ?').get(mappedName)
  if (!row) {
    if (!DRY_RUN) {
      db.prepare('INSERT INTO channels (name) VALUES (?)').run(mappedName)
      row = db.prepare('SELECT id FROM channels WHERE name = ?').get(mappedName)
    } else {
      console.log(`  [dry-run] Would create channel: "${mappedName}"`)
      channelCache[filename] = -1
      return -1
    }
  }
  channelCache[filename] = row.id
  return row.id
}

// ── Import ────────────────────────────────────────────────────────────────────

const insertMsg = db.prepare(`
  INSERT INTO messages (channel_id, avatar_id, text, created_at)
  VALUES (@channel_id, @avatar_id, @text, @created_at)
`)
const insertActivity = db.prepare(`
  INSERT OR IGNORE INTO channel_avatar_activity (channel_id, avatar_id) VALUES (?, ?)
`)
const updateLastAvatar = db.prepare(`
  UPDATE channels SET last_avatar_id = ? WHERE id = ?
`)

const files = fs.readdirSync(OUTPUT_DIR).filter(f => f.endsWith('.txt'))
let totalInserted = 0
let totalSkipped = 0

for (const file of files) {
  const filename = file.replace(/\.txt$/, '')
  const filePath = path.join(OUTPUT_DIR, file)
  const messages = parseFile(filePath)

  console.log(`\n${file}: ${messages.length} messages`)

  const channelId = getOrCreateChannelId(filename)
  let inserted = 0
  let skipped = 0
  let lastAvatarId = null

  const doInsert = db.transaction((msgs) => {
    for (const msg of msgs) {
      const avatarId = getAvatarId(msg.avatarName)
      if (!avatarId) { skipped++; continue }
      insertMsg.run({ channel_id: channelId, avatar_id: avatarId, text: msg.text, created_at: msg.created_at })
      insertActivity.run(channelId, avatarId)
      lastAvatarId = avatarId
      inserted++
    }
    if (lastAvatarId) updateLastAvatar.run(lastAvatarId, channelId)
  })

  if (!DRY_RUN && channelId > 0) {
    doInsert(messages)
  } else {
    for (const msg of messages) {
      const avatarId = getAvatarId(msg.avatarName)
      if (!avatarId) skipped++
      else inserted++
    }
  }

  console.log(`  ✓ ${inserted} inserted, ${skipped} skipped (unmapped avatars)`)
  totalInserted += inserted
  totalSkipped += skipped
}

console.log(`\n── Done ──`)
console.log(`Total inserted: ${totalInserted}`)
console.log(`Total skipped:  ${totalSkipped}`)
if (DRY_RUN) console.log('(dry run — run with --import to write)')

db.close()
