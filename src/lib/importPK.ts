import { getDb } from '../db/index'
import { normalizeColor, isoToSql } from './importUtils'

// ── PluralKit data shapes ────────────────────────────────────────────────────

interface PKMember {
  id: string       // 5-char
  uuid?: string
  name: string
  display_name?: string
  description?: string
  pronouns?: string
  color?: string
  birthday?: string
  created?: string
  avatar_url?: string
}

interface PKGroup {
  id: string
  uuid?: string
  name: string
  display_name?: string
  description?: string
  color?: string
  members?: string[]  // member IDs (5-char)
}

interface PKSwitch {
  timestamp: string   // ISO string
  members: string[]   // member IDs (5-char)
}

export interface PKData {
  id?: string
  name?: string
  members?: PKMember[]
  groups?: PKGroup[]
  switches?: PKSwitch[]
}

export interface PKPreview {
  members: number
  groups: number
  switches: number
}

export function parsePKData(raw: unknown): PKData {
  if (!raw || typeof raw !== 'object') throw new Error('Invalid PluralKit JSON')
  return raw as PKData
}

export function previewPK(data: PKData): PKPreview {
  return {
    members:  data.members?.length  ?? 0,
    groups:   data.groups?.length   ?? 0,
    switches: data.switches?.length ?? 0,
  }
}

export interface PKImportOptions {
  dryRun: boolean
  skipMembers: boolean
  skipGroups: boolean
  skipSwitches: boolean
}

export interface PKImportResult {
  avatars: number
  images: number
  groups: number
  switches: number
  warnings: string[]
}

async function fetchImageAsBase64(url: string): Promise<string | null> {
  try {
    const resp = await fetch(url)
    if (!resp.ok) return null
    const blob = await resp.blob()
    const objectUrl = URL.createObjectURL(blob)
    try {
      const img = new Image()
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve()
        img.onerror = reject
        img.src = objectUrl
      })
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0)
      const dataUrl = canvas.toDataURL('image/png')
      return dataUrl.replace(/^data:image\/png;base64,/, '')
    } finally {
      URL.revokeObjectURL(objectUrl)
    }
  } catch {
    return null
  }
}

export async function runPKImport(data: PKData, opts: PKImportOptions): Promise<PKImportResult> {
  const db = await getDb()

  const pkMembers  = data.members  ?? []
  const pkGroups   = data.groups   ?? []
  const pkSwitches = data.switches ?? []

  const memberIdMap: Record<string, number> = {}  // PK member id (5-char) → DSJ avatar id
  const warnings: string[] = []

  const result: PKImportResult = { avatars: 0, images: 0, groups: 0, switches: 0, warnings: [] }

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
    for (const m of pkMembers) {
      const displayName = m.display_name || m.name
      const existing = await selectOne<{ id: number }>('SELECT id FROM avatars WHERE name = ?', [displayName])
      if (existing) {
        memberIdMap[m.id] = existing.id
        if (m.uuid) memberIdMap[m.uuid] = existing.id
        continue
      }

      const id = await insertRow(
        'INSERT INTO avatars (name, color, pronouns, description, created_at) VALUES (?, ?, ?, ?, ?)',
        [displayName, normalizeColor(m.color) ?? '#888888', m.pronouns ?? null, m.description ?? null, isoToSql(m.created)]
      )
      memberIdMap[m.id] = id
      if (m.uuid) memberIdMap[m.uuid] = id
      result.avatars++

      if (!opts.dryRun && id !== -1 && m.avatar_url) {
        const imageData = await fetchImageAsBase64(m.avatar_url)
        if (imageData) {
          await db.execute('UPDATE avatars SET image_data = ? WHERE id = ?', [imageData, id])
          result.images++
        } else {
          warnings.push(`Image fetch failed for "${displayName}"`)
        }
      }
    }
  }

  // ── 2. Groups → avatar_groups + members ───────────────────────────────────

  if (!opts.skipGroups) {
    for (const g of pkGroups) {
      const displayName = g.display_name || g.name
      let groupId: number

      const existing = await selectOne<{ id: number }>('SELECT id FROM avatar_groups WHERE name = ?', [displayName])
      if (existing) {
        groupId = existing.id
      } else {
        groupId = await insertRow(
          'INSERT INTO avatar_groups (name, color, description) VALUES (?, ?, ?)',
          [displayName, normalizeColor(g.color), g.description ?? null]
        )
        result.groups++
      }

      for (const pkMemberId of (g.members ?? [])) {
        const avatarId = memberIdMap[pkMemberId]
        if (!avatarId || avatarId === -1) {
          if (avatarId === undefined) warnings.push(`Group "${displayName}": member ${pkMemberId} not imported`)
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

  // ── 3. Switches → messages in "front log" channel ─────────────────────────

  if (!opts.skipSwitches && pkSwitches.length) {
    // Prefer the front_log_config channel; fall back to any channel named "Front Log"
    let frontChannelId: number | null = null
    const configRow = await selectOne<{ channel_id: number }>('SELECT channel_id FROM front_log_config WHERE id = 1', [])
    if (configRow) {
      frontChannelId = configRow.channel_id
    } else {
      const existing = await selectOne<{ id: number }>('SELECT id FROM channels WHERE name = ?', ['Front Log'])
      if (existing) {
        frontChannelId = existing.id
      } else {
        frontChannelId = await insertRow(
          "INSERT INTO channels (name, description) VALUES ('Front Log', 'Imported from PluralKit switches')",
          []
        )
      }
    }

    const sorted = [...pkSwitches].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())

    for (let i = 0; i < sorted.length; i++) {
      const sw = sorted[i]
      const nextSw = sorted[i + 1]

      const mins = nextSw
        ? Math.round((new Date(nextSw.timestamp).getTime() - new Date(sw.timestamp).getTime()) / 60000)
        : 0

      // First member is the attributed avatar
      const firstMemberId = sw.members[0]
      const avatarId = firstMemberId ? (memberIdMap[firstMemberId] ?? null) : null

      let text: string
      if (sw.members.length > 1) {
        // Multi-member switch: |front:co-session|{mins}|name1|name2|...|
        const names = sw.members
          .map(id => { const m = pkMembers.find(m => m.id === id); return m?.display_name || m?.name })
          .filter(Boolean)
        text = `|front:co-session|${mins}|${names.join('|')}|`
      } else {
        // Single-member (or empty): |front:session|{mins}|
        text = `|front:session|${mins}|`
      }

      if (!opts.dryRun && frontChannelId && frontChannelId !== -1) {
        await db.execute(
          'INSERT INTO messages (channel_id, avatar_id, text, created_at) VALUES (?, ?, ?, ?)',
          [frontChannelId, avatarId === -1 ? null : avatarId, text, isoToSql(sw.timestamp)]
        )
      }
      result.switches++
    }
  }

  result.warnings = warnings
  return result
}
