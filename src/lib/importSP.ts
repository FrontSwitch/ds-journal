import { getDb } from '../db/index'
import {
  spTsToSql, normalizeColor,
  buildMemberDescription, buildFrontHistoryText,
  buildNoteText, buildBoardText, frontHistoryMemberId,
} from './importUtils'

// ── SP data shapes (minimal — only fields we use) ────────────────────────────

interface SPMember {
  _id: string; name: string; color?: string; pronouns?: string
  desc?: string; info?: Record<string, unknown>; private?: boolean
  lastOperationTime?: number
}
interface SPCustomFront {
  _id: string; name: string; color?: string; desc?: string
  private?: boolean; lastOperationTime?: number
}
interface SPGroup {
  _id: string; name: string; color?: string; desc?: string
  members?: string[]; lastOperationTime?: number
}
interface SPCategory {
  _id: string; name: string; desc?: string; lastOperationTime?: number
}
interface SPChannel {
  _id: string; name: string; desc?: string; category?: string; lastOperationTime?: number
}
interface SPMessage {
  _id: string; channel?: string; writer?: string; message?: string
  timestamp?: number; reply?: string
}
interface SPFrontHistory {
  _id: string; member?: string; customFront?: string; custom?: boolean
  startTime?: number; endTime?: number; live?: boolean; customStatus?: string
}
interface SPNote {
  _id: string; member?: string; title?: string; note?: string
  date?: number; lastOperationTime?: number
}
interface SPBoardMessage {
  _id: string; writer?: string; title?: string; message?: string
  timestamp?: number; lastOperationTime?: number
}

export interface SPData {
  members?: SPMember[]
  groups?: SPGroup[]
  customFront?: SPCustomFront[]
  chatCategory?: SPCategory[]
  chatChannel?: SPChannel[]
  chatMessage?: SPMessage[]
  frontHistory?: SPFrontHistory[]
  notes?: SPNote[]
  boardMessage?: SPBoardMessage[]
}

export interface SPPreview {
  members: number
  customFronts: number
  groups: number
  categories: number
  channels: number
  messages: number
  frontHistory: number
  notes: number
  board: number
}

export function parseSPData(raw: unknown): SPData {
  if (!raw || typeof raw !== 'object') throw new Error('Invalid SP JSON')
  return raw as SPData
}

export function previewSP(data: SPData): SPPreview {
  return {
    members:      data.members?.length      ?? 0,
    customFronts: data.customFront?.length  ?? 0,
    groups:       data.groups?.length       ?? 0,
    categories:   data.chatCategory?.length ?? 0,
    channels:     data.chatChannel?.length  ?? 0,
    messages:     data.chatMessage?.length  ?? 0,
    frontHistory: data.frontHistory?.length ?? 0,
    notes:        data.notes?.length        ?? 0,
    board:        data.boardMessage?.length ?? 0,
  }
}

export interface SPImportOptions {
  dryRun: boolean
  skipMembers: boolean
  skipGroups: boolean
  skipChannels: boolean
  skipMessages: boolean
  skipFront: boolean
  skipNotes: boolean
  skipBoard: boolean
  importCustomFronts: boolean
}

export interface SPImportResult {
  avatars: number
  groups: number
  folders: number
  channels: number
  messages: number
  frontHistory: number
  notes: number
  board: number
  warnings: string[]
}

export async function runSPImport(data: SPData, opts: SPImportOptions): Promise<SPImportResult> {
  const db = await getDb()

  const spMembers      = data.members      ?? []
  const spGroups       = data.groups       ?? []
  const spCustomFronts = data.customFront  ?? []
  const spCategories   = data.chatCategory ?? []
  const spChannels     = data.chatChannel  ?? []
  const spMessages     = data.chatMessage  ?? []
  const spFrontHistory = data.frontHistory ?? []
  const spNotes        = data.notes        ?? []
  const spBoard        = data.boardMessage ?? []

  const memberIdMap:   Record<string, number> = {}
  const groupIdMap:    Record<string, number> = {}
  const categoryIdMap: Record<string, number> = {}
  const channelIdMap:  Record<string, number> = {}
  const messageIdMap:  Record<string, number> = {}
  const warnings: string[] = []

  const result: SPImportResult = {
    avatars: 0, groups: 0, folders: 0, channels: 0,
    messages: 0, frontHistory: 0, notes: 0, board: 0, warnings: [],
  }

  async function selectOne<T>(sql: string, params: unknown[]): Promise<T | null> {
    const rows = await db.select<T[]>(sql, params)
    return rows[0] ?? null
  }

  async function insertRow(sql: string, params: unknown[]): Promise<number> {
    if (opts.dryRun) return -1
    const r = await db.execute(sql, params)
    return Number(r.lastInsertId)
  }

  // ── 1. Members → avatars ───────────────────────────────────────────────────

  if (!opts.skipMembers) {
    for (const m of spMembers) {
      const existing = await selectOne<{ id: number }>('SELECT id FROM avatars WHERE name = ?', [m.name])
      if (existing) { memberIdMap[m._id] = existing.id; continue }

      const id = await insertRow(
        'INSERT INTO avatars (name, color, pronouns, description, hidden, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [m.name, normalizeColor(m.color) ?? '#888888', m.pronouns ?? null, buildMemberDescription(m), m.private ? 1 : 0, spTsToSql(m.lastOperationTime)]
      )
      memberIdMap[m._id] = id
      result.avatars++
    }
  }

  // ── 2. customFronts → avatars (optional) ──────────────────────────────────

  if (opts.importCustomFronts) {
    for (const cf of spCustomFronts) {
      const existing = await selectOne<{ id: number }>('SELECT id FROM avatars WHERE name = ?', [cf.name])
      if (existing) { memberIdMap[cf._id] = existing.id; continue }

      const desc = cf.desc ? `[custom front] ${cf.desc}` : '[custom front]'
      const id = await insertRow(
        'INSERT INTO avatars (name, color, description, hidden, created_at) VALUES (?, ?, ?, ?, ?)',
        [cf.name, normalizeColor(cf.color) ?? '#888888', desc, cf.private ? 1 : 0, spTsToSql(cf.lastOperationTime)]
      )
      memberIdMap[cf._id] = id
      result.avatars++
    }
  }

  // ── 3. Groups → avatar_groups + members ───────────────────────────────────

  if (!opts.skipGroups) {
    for (const g of spGroups) {
      let groupId: number
      const existing = await selectOne<{ id: number }>('SELECT id FROM avatar_groups WHERE name = ?', [g.name])
      if (existing) {
        groupId = existing.id
      } else {
        groupId = await insertRow(
          'INSERT INTO avatar_groups (name, color, description, created_at) VALUES (?, ?, ?, ?)',
          [g.name, normalizeColor(g.color), g.desc ?? null, spTsToSql(g.lastOperationTime)]
        )
        result.groups++
      }
      groupIdMap[g._id] = groupId

      for (const spMemberId of (g.members ?? [])) {
        const avatarId = memberIdMap[spMemberId]
        if (!avatarId || avatarId === -1) {
          if (avatarId === undefined) warnings.push(`Group "${g.name}": member ${spMemberId} not imported`)
          continue
        }
        if (!opts.dryRun) {
          await db.execute(
            'INSERT OR IGNORE INTO avatar_group_members (group_id, avatar_id) VALUES (?, ?)',
            [groupId, avatarId]
          )
        }
      }
    }
  }

  // ── 4. chatCategories → folders ───────────────────────────────────────────

  if (!opts.skipChannels) {
    for (const cat of spCategories) {
      const existing = await selectOne<{ id: number }>('SELECT id FROM folders WHERE name = ?', [cat.name])
      if (existing) { categoryIdMap[cat._id] = existing.id; continue }

      const id = await insertRow(
        'INSERT INTO folders (name, description, created_at) VALUES (?, ?, ?)',
        [cat.name, cat.desc ?? null, spTsToSql(cat.lastOperationTime)]
      )
      categoryIdMap[cat._id] = id
      result.folders++
    }

    // ── 5. chatChannels → channels ───────────────────────────────────────────

    for (const ch of spChannels) {
      const existing = await selectOne<{ id: number }>('SELECT id FROM channels WHERE name = ?', [ch.name])
      if (existing) { channelIdMap[ch._id] = existing.id; continue }

      const folderId = ch.category ? (categoryIdMap[ch.category] ?? null) : null
      const id = await insertRow(
        'INSERT INTO channels (name, description, folder_id, created_at) VALUES (?, ?, ?, ?)',
        [ch.name, ch.desc ?? null, folderId === -1 ? null : folderId, spTsToSql(ch.lastOperationTime)]
      )
      channelIdMap[ch._id] = id
      result.channels++
    }
  }

  // ── 6. chatMessages → messages ────────────────────────────────────────────

  if (!opts.skipMessages) {
    const sorted = [...spMessages].sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0))
    for (const msg of sorted) {
      const channelId = channelIdMap[msg.channel ?? '']
      if (!channelId || channelId === -1) continue

      const avatarId = msg.writer ? (memberIdMap[msg.writer] ?? null) : null
      const parentId = msg.reply  ? (messageIdMap[msg.reply]  ?? null) : null

      const id = await insertRow(
        'INSERT INTO messages (channel_id, avatar_id, text, created_at, parent_msg_id) VALUES (?, ?, ?, ?, ?)',
        [channelId, avatarId === -1 ? null : avatarId, msg.message ?? '', spTsToSql(msg.timestamp), parentId === -1 ? null : parentId]
      )
      messageIdMap[msg._id] = id

      if (!opts.dryRun && avatarId && avatarId !== -1) {
        await db.execute(
          'INSERT OR IGNORE INTO channel_avatar_activity (channel_id, avatar_id) VALUES (?, ?)',
          [channelId, avatarId]
        )
      }
      result.messages++
    }
  }

  // ── 7. Notes → messages in "notes" channel ────────────────────────────────

  if (!opts.skipNotes && spNotes.length) {
    let notesChannelId: number | null = null
    const existing = await selectOne<{ id: number }>('SELECT id FROM channels WHERE name = ?', ['notes'])
    if (existing) {
      notesChannelId = existing.id
    } else {
      notesChannelId = await insertRow(
        "INSERT INTO channels (name, description) VALUES ('notes', 'Imported from Simply Plural notes')",
        []
      )
    }

    for (const note of spNotes) {
      const avatarId = note.member ? (memberIdMap[note.member] ?? null) : null
      const text = buildNoteText(note).trim()
      if (!opts.dryRun && notesChannelId && notesChannelId !== -1) {
        await db.execute(
          'INSERT INTO messages (channel_id, avatar_id, text, created_at) VALUES (?, ?, ?, ?)',
          [notesChannelId, avatarId === -1 ? null : avatarId, text, spTsToSql(note.date ?? note.lastOperationTime)]
        )
      }
      result.notes++
    }
  }

  // ── 8. boardMessages → messages in "board" channel ────────────────────────

  if (!opts.skipBoard && spBoard.length) {
    let boardChannelId: number | null = null
    const existing = await selectOne<{ id: number }>('SELECT id FROM channels WHERE name = ?', ['board'])
    if (existing) {
      boardChannelId = existing.id
    } else {
      boardChannelId = await insertRow(
        "INSERT INTO channels (name, description) VALUES ('board', 'Imported from Simply Plural board')",
        []
      )
    }

    for (const bm of spBoard) {
      const avatarId = bm.writer ? (memberIdMap[bm.writer] ?? null) : null
      const text = buildBoardText(bm).trim()
      if (!opts.dryRun && boardChannelId && boardChannelId !== -1) {
        await db.execute(
          'INSERT INTO messages (channel_id, avatar_id, text, created_at) VALUES (?, ?, ?, ?)',
          [boardChannelId, avatarId === -1 ? null : avatarId, text, spTsToSql(bm.timestamp ?? bm.lastOperationTime)]
        )
      }
      result.board++
    }
  }

  // ── 9. Front history → messages in "front log" channel ────────────────────

  if (!opts.skipFront && spFrontHistory.length) {
    let frontChannelId: number | null = null
    const existing = await selectOne<{ id: number }>('SELECT id FROM channels WHERE name = ?', ['front log'])
    if (existing) {
      frontChannelId = existing.id
    } else {
      frontChannelId = await insertRow(
        "INSERT INTO channels (name, description) VALUES ('front log', 'Imported from Simply Plural front history')",
        []
      )
    }

    const sorted = [...spFrontHistory].sort((a, b) => (a.startTime ?? 0) - (b.startTime ?? 0))
    for (const fh of sorted) {
      const spMemberId = frontHistoryMemberId(fh)
      const avatarId = spMemberId ? (memberIdMap[spMemberId] ?? null) : null
      const text = buildFrontHistoryText(fh)

      if (!opts.dryRun && frontChannelId && frontChannelId !== -1) {
        await db.execute(
          'INSERT INTO messages (channel_id, avatar_id, text, created_at) VALUES (?, ?, ?, ?)',
          [frontChannelId, avatarId === -1 ? null : avatarId, text, spTsToSql(fh.startTime)]
        )
      }
      result.frontHistory++
    }
  }

  result.warnings = warnings
  return result
}
