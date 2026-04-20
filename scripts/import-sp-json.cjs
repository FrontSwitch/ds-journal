#!/usr/bin/env node
// Import a Simply Plural JSON export into DSJ.
//
// Usage:
//   node scripts/import-sp-json.cjs --file path/to/export.json         # dry run
//   node scripts/import-sp-json.cjs --file path/to/export.json --import # write to DB
//   node scripts/import-sp-json.cjs --file path/to/export.json --import --db /path/to/dsj.db
//
// Flags:
//   --file <path>    SP export JSON (required)
//   --import         Actually write. Default is dry-run.
//   --db <path>      Path to dsj.db (default: ~/Library/Application Support/com.frontswitchstudio.dsj/dsj.db)
//   --skip-members   Don't import members as avatars
//   --skip-groups    Don't import groups
//   --skip-channels  Don't import chatCategories/chatChannels
//   --skip-messages  Don't import chatMessages
//   --skip-front     Don't import frontHistory
//   --skip-notes     Don't import notes as messages
//   --skip-board     Don't import boardMessages
//   --custom-fronts  Import customFronts as avatars (default: skip)

const fs = require('fs')
const path = require('path')
const Database = require('better-sqlite3')
const os = require('os')

// ── CLI args ───────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2)
const flag = (name) => argv.includes(name)
const flagVal = (name) => { const i = argv.indexOf(name); return i !== -1 ? argv[i + 1] : null }

const DRY_RUN       = !flag('--import')
const FILE_PATH     = flagVal('--file')
const SKIP_MEMBERS  = flag('--skip-members')
const SKIP_GROUPS   = flag('--skip-groups')
const SKIP_CHANNELS = flag('--skip-channels')
const SKIP_MESSAGES = flag('--skip-messages')
const SKIP_FRONT    = flag('--skip-front')
const SKIP_NOTES    = flag('--skip-notes')
const SKIP_BOARD    = flag('--skip-board')
const IMPORT_CUSTOM_FRONTS = flag('--custom-fronts')

if (!FILE_PATH) {
  console.error('Usage: node import-sp-json.cjs --file <export.json> [--import] [--db <path>]')
  process.exit(1)
}
if (!fs.existsSync(FILE_PATH)) {
  console.error(`File not found: ${FILE_PATH}`)
  process.exit(1)
}

const DB_PATH = flagVal('--db') ??
  path.join(os.homedir(), 'Library', 'Application Support', 'com.frontswitchstudio.dsj', 'dsj.db')

if (!fs.existsSync(DB_PATH)) {
  console.error(`Database not found: ${DB_PATH}`)
  console.error('Launch DSJ once first so the DB is created, or pass --db <path>.')
  process.exit(1)
}

// ── Load export ────────────────────────────────────────────────────────────────

const raw = JSON.parse(fs.readFileSync(FILE_PATH, 'utf8'))

const spMembers      = raw.members        ?? []
const spGroups       = raw.groups         ?? []
const spCustomFronts = raw.customFront    ?? []
const spCategories   = raw.chatCategory   ?? []
const spChannels     = raw.chatChannel    ?? []
const spMessages     = raw.chatMessage    ?? []
const spFrontHistory = raw.frontHistory   ?? []
const spNotes        = raw.notes          ?? []
const spBoard        = raw.boardMessage   ?? []

console.log(`Simply Plural export loaded from: ${FILE_PATH}`)
console.log(`  members:      ${spMembers.length}`)
console.log(`  groups:       ${spGroups.length}`)
console.log(`  customFronts: ${spCustomFronts.length}`)
console.log(`  categories:   ${spCategories.length}`)
console.log(`  channels:     ${spChannels.length}`)
console.log(`  messages:     ${spMessages.length}`)
console.log(`  frontHistory: ${spFrontHistory.length}`)
console.log(`  notes:        ${spNotes.length}`)
console.log(`  boardMessages:${spBoard.length}`)
if (DRY_RUN) console.log('\n[DRY RUN — pass --import to write]\n')
else console.log()

// ── Open DB ────────────────────────────────────────────────────────────────────

const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

// ── Helpers ────────────────────────────────────────────────────────────────────

const {
  spTsToSql, normalizeColor, buildMemberDescription,
  buildFrontHistoryText, buildNoteText, buildBoardText, frontHistoryMemberId,
} = require('./import-sp-json-lib.cjs')

function log(action, detail) {
  console.log(`  ${DRY_RUN ? '[dry]' : '     '} ${action}: ${detail}`)
}

// ID remapping tables: SP _id → DSJ row id
const memberIdMap   = {}   // mem_xxx → DSJ avatar id
const groupIdMap    = {}   // grp_xxx → DSJ avatar_group id
const categoryIdMap = {}   // cat_xxx → DSJ folder id
const channelIdMap  = {}   // ch_xxx  → DSJ channel id
const messageIdMap  = {}   // msg_xxx → DSJ message id

// ── 1. Members → avatars ───────────────────────────────────────────────────────

if (!SKIP_MEMBERS && spMembers.length) {
  console.log('── Members → avatars')
  const insert = db.prepare(`
    INSERT INTO avatars (name, color, pronouns, description, hidden, created_at)
    VALUES (@name, @color, @pronouns, @description, @hidden, @created_at)
  `)
  const exists = db.prepare('SELECT id FROM avatars WHERE name = ?')

  for (const m of spMembers) {
    const row = exists.get(m.name)
    if (row) {
      log('skip (exists)', m.name)
      memberIdMap[m._id] = row.id
      continue
    }

    const params = {
      name:        m.name,
      color:       normalizeColor(m.color),
      pronouns:    m.pronouns ?? null,
      description: buildMemberDescription(m),
      hidden:      m.private ? 1 : 0,
      created_at:  spTsToSql(m.lastOperationTime),
    }

    if (!DRY_RUN) {
      const result = insert.run(params)
      memberIdMap[m._id] = result.lastInsertRowid
    } else {
      memberIdMap[m._id] = -1
    }
    log('avatar', m.name + (m.private ? ' (hidden)' : ''))
  }
}

// ── 2. customFronts → avatars (optional) ──────────────────────────────────────

if (IMPORT_CUSTOM_FRONTS && spCustomFronts.length) {
  console.log('\n── Custom Fronts → avatars')
  const insert = db.prepare(`
    INSERT INTO avatars (name, color, description, hidden, created_at)
    VALUES (@name, @color, @description, @hidden, @created_at)
  `)
  const exists = db.prepare('SELECT id FROM avatars WHERE name = ?')

  for (const cf of spCustomFronts) {
    const row = exists.get(cf.name)
    if (row) {
      log('skip (exists)', cf.name)
      memberIdMap[cf._id] = row.id
      continue
    }
    const desc = cf.desc ? `[custom front] ${cf.desc}` : '[custom front]'
    const params = {
      name:        cf.name,
      color:       normalizeColor(cf.color),
      description: desc,
      hidden:      cf.private ? 1 : 0,
      created_at:  spTsToSql(cf.lastOperationTime),
    }
    if (!DRY_RUN) {
      const result = insert.run(params)
      memberIdMap[cf._id] = result.lastInsertRowid
    } else {
      memberIdMap[cf._id] = -1
    }
    log('avatar (custom front)', cf.name)
  }
}

// ── 3. Groups → avatar_groups + members ───────────────────────────────────────

if (!SKIP_GROUPS && spGroups.length) {
  console.log('\n── Groups → avatar_groups')
  const insertGroup = db.prepare(`
    INSERT INTO avatar_groups (name, color, description, created_at)
    VALUES (@name, @color, @description, @created_at)
  `)
  const insertMember = db.prepare(`
    INSERT OR IGNORE INTO avatar_group_members (group_id, avatar_id) VALUES (?, ?)
  `)
  const exists = db.prepare('SELECT id FROM avatar_groups WHERE name = ?')

  for (const g of spGroups) {
    let groupId
    const row = exists.get(g.name)
    if (row) {
      log('skip (exists)', g.name)
      groupId = row.id
    } else {
      const params = {
        name:        g.name,
        color:       normalizeColor(g.color),
        description: g.desc ?? null,
        created_at:  spTsToSql(g.lastOperationTime),
      }
      if (!DRY_RUN) {
        groupId = insertGroup.run(params).lastInsertRowid
      } else {
        groupId = -1
      }
      log('group', g.name)
    }
    groupIdMap[g._id] = groupId

    // Assign members
    for (const spMemberId of (g.members ?? [])) {
      const avatarId = memberIdMap[spMemberId]
      if (!avatarId || avatarId === -1) {
        if (avatarId === undefined) log('  warn: member not imported', spMemberId)
        continue
      }
      if (!DRY_RUN) insertMember.run(groupId, avatarId)
      log('  member', spMemberId + ' → group ' + g.name)
    }
  }
}

// ── 4. chatCategories → folders ───────────────────────────────────────────────

if (!SKIP_CHANNELS && spCategories.length) {
  console.log('\n── Chat categories → folders')
  const insert = db.prepare(`
    INSERT INTO folders (name, description, created_at)
    VALUES (@name, @description, @created_at)
  `)
  const exists = db.prepare('SELECT id FROM folders WHERE name = ?')

  for (const cat of spCategories) {
    const row = exists.get(cat.name)
    if (row) {
      log('skip (exists)', cat.name)
      categoryIdMap[cat._id] = row.id
      continue
    }
    const params = {
      name:        cat.name,
      description: cat.desc ?? null,
      created_at:  spTsToSql(cat.lastOperationTime),
    }
    if (!DRY_RUN) {
      categoryIdMap[cat._id] = insert.run(params).lastInsertRowid
    } else {
      categoryIdMap[cat._id] = -1
    }
    log('folder', cat.name)
  }
}

// ── 5. chatChannels → channels ────────────────────────────────────────────────

if (!SKIP_CHANNELS && spChannels.length) {
  console.log('\n── Chat channels → channels')
  const insert = db.prepare(`
    INSERT INTO channels (name, description, folder_id, created_at)
    VALUES (@name, @description, @folder_id, @created_at)
  `)
  const exists = db.prepare('SELECT id FROM channels WHERE name = ?')

  for (const ch of spChannels) {
    const row = exists.get(ch.name)
    if (row) {
      log('skip (exists)', ch.name)
      channelIdMap[ch._id] = row.id  // still map so messages resolve correctly
      continue
    }
    const folderId = ch.category ? (categoryIdMap[ch.category] ?? null) : null
    const params = {
      name:        ch.name,
      description: ch.desc ?? null,
      folder_id:   folderId && folderId !== -1 ? folderId : null,
      created_at:  spTsToSql(ch.lastOperationTime),
    }
    if (!DRY_RUN) {
      channelIdMap[ch._id] = insert.run(params).lastInsertRowid
    } else {
      channelIdMap[ch._id] = -1
    }
    log('channel', ch.name + (folderId ? ` (in folder ${ch.category})` : ''))
  }
}

// ── 6. chatMessages → messages ────────────────────────────────────────────────

if (!SKIP_MESSAGES && spMessages.length) {
  console.log('\n── Chat messages → messages')
  // Sort by timestamp so parent messages are inserted before replies
  const sorted = [...spMessages].sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0))

  const insert = DRY_RUN ? null : db.prepare(`
    INSERT INTO messages (channel_id, avatar_id, text, created_at, parent_msg_id)
    VALUES (@channel_id, @avatar_id, @text, @created_at, @parent_msg_id)
  `)
  const insertActivity = DRY_RUN ? null : db.prepare(`
    INSERT OR IGNORE INTO channel_avatar_activity (channel_id, avatar_id) VALUES (?, ?)
  `)

  let inserted = 0, skipped = 0
  for (const msg of sorted) {
    const channelId = channelIdMap[msg.channel]
    if (!channelId || channelId === -1) {
      skipped++
      continue
    }
    const avatarId = msg.writer ? (memberIdMap[msg.writer] ?? null) : null
    const parentId = msg.reply ? (messageIdMap[msg.reply] ?? null) : null
    const params = {
      channel_id:    channelId,
      avatar_id:     avatarId && avatarId !== -1 ? avatarId : null,
      text:          msg.message,
      created_at:    spTsToSql(msg.timestamp),
      parent_msg_id: parentId && parentId !== -1 ? parentId : null,
    }
    if (!DRY_RUN) {
      const result = insert.run(params)
      messageIdMap[msg._id] = result.lastInsertRowid
      if (avatarId && avatarId !== -1) insertActivity.run(channelId, avatarId)
      inserted++
    } else {
      messageIdMap[msg._id] = -1
      inserted++
    }
  }
  console.log(`  ${inserted} inserted, ${skipped} skipped (unknown channel)`)
}

// ── 7. Notes → messages in "Notes" channel ────────────────────────────────────

if (!SKIP_NOTES && spNotes.length) {
  console.log('\n── Notes → messages')
  let notesChannelId = channelIdMap['ch_notes'] ?? null

  // Find or create a "Notes" channel
  const existingNotesChannel = db.prepare("SELECT id FROM channels WHERE name = 'notes'").get()
  if (existingNotesChannel) {
    notesChannelId = existingNotesChannel.id
  } else if (!DRY_RUN) {
    const result = db.prepare("INSERT INTO channels (name, description) VALUES ('notes', 'Imported from Simply Plural notes')").run()
    notesChannelId = result.lastInsertRowid
    log('created channel', 'notes')
  }

  const insert = db.prepare(`
    INSERT INTO messages (channel_id, avatar_id, text, created_at)
    VALUES (@channel_id, @avatar_id, @text, @created_at)
  `)

  let inserted = 0
  for (const note of spNotes) {
    const avatarId = note.member ? (memberIdMap[note.member] ?? null) : null
    const text = buildNoteText(note)
    const params = {
      channel_id: notesChannelId ?? -1,
      avatar_id:  avatarId && avatarId !== -1 ? avatarId : null,
      text:       text.trim(),
      created_at: spTsToSql(note.date ?? note.lastOperationTime),
    }
    if (!DRY_RUN && notesChannelId) {
      insert.run(params)
    }
    inserted++
    log('note', (note.title ?? '(untitled)').slice(0, 50))
  }
  console.log(`  ${inserted} notes → messages`)
}

// ── 8. boardMessages → messages in "Board" channel ────────────────────────────

if (!SKIP_BOARD && spBoard.length) {
  console.log('\n── Board messages → messages')

  let boardChannelId = null
  const existingBoardChannel = db.prepare("SELECT id FROM channels WHERE name = 'board'").get()
  if (existingBoardChannel) {
    boardChannelId = existingBoardChannel.id
  } else if (!DRY_RUN) {
    const result = db.prepare("INSERT INTO channels (name, description) VALUES ('board', 'Imported from Simply Plural board')").run()
    boardChannelId = result.lastInsertRowid
    log('created channel', 'board')
  }

  const insert = db.prepare(`
    INSERT INTO messages (channel_id, avatar_id, text, created_at)
    VALUES (@channel_id, @avatar_id, @text, @created_at)
  `)

  let inserted = 0
  for (const bm of spBoard) {
    const avatarId = bm.writer ? (memberIdMap[bm.writer] ?? null) : null
    const text = buildBoardText(bm)
    const params = {
      channel_id: boardChannelId ?? -1,
      avatar_id:  avatarId && avatarId !== -1 ? avatarId : null,
      text:       text.trim(),
      created_at: spTsToSql(bm.timestamp ?? bm.lastOperationTime),
    }
    if (!DRY_RUN && boardChannelId) {
      insert.run(params)
    }
    inserted++
    log('board msg', (bm.title ?? '(untitled)').slice(0, 50))
  }
  console.log(`  ${inserted} board messages → messages`)
}

// ── 9. Front history → messages in "front log" channel ────────────────────────

if (!SKIP_FRONT && spFrontHistory.length) {
  console.log('\n── Front history → messages')

  let frontChannelId = channelIdMap['ch_frontlog'] ?? null
  const existingFrontChannel = db.prepare("SELECT id FROM channels WHERE name = 'front log'").get()
  if (existingFrontChannel) {
    frontChannelId = existingFrontChannel.id
  } else if (!DRY_RUN) {
    const result = db.prepare("INSERT INTO channels (name, description) VALUES ('front log', 'Imported from Simply Plural front history')").run()
    frontChannelId = result.lastInsertRowid
    log('created channel', 'front log')
  }

  const insert = db.prepare(`
    INSERT INTO messages (channel_id, avatar_id, text, created_at)
    VALUES (@channel_id, @avatar_id, @text, @created_at)
  `)

  // Sort by startTime
  const sorted = [...spFrontHistory].sort((a, b) => (a.startTime ?? 0) - (b.startTime ?? 0))
  let inserted = 0
  for (const fh of sorted) {
    const spMemberId = frontHistoryMemberId(fh)
    const avatarId = spMemberId ? (memberIdMap[spMemberId] ?? null) : null
    const text = buildFrontHistoryText(fh)

    const params = {
      channel_id: frontChannelId ?? -1,
      avatar_id:  avatarId && avatarId !== -1 ? avatarId : null,
      text,
      created_at: spTsToSql(fh.startTime),
    }
    if (!DRY_RUN && frontChannelId) {
      insert.run(params)
    }
    inserted++
  }
  console.log(`  ${inserted} front history entries → messages`)
}

// ── Summary ────────────────────────────────────────────────────────────────────

console.log('\n── Summary ──────────────────────────────────────────────────')
console.log(`  avatars imported:   ${Object.keys(memberIdMap).length}`)
console.log(`  groups imported:    ${Object.keys(groupIdMap).length}`)
console.log(`  folders imported:   ${Object.keys(categoryIdMap).length}`)
console.log(`  channels imported:  ${Object.keys(channelIdMap).length}`)
console.log(`  messages imported:  ${Object.keys(messageIdMap).length}`)

if (DRY_RUN) {
  console.log('\n[dry run — add --import to write to the database]')
}

db.close()
