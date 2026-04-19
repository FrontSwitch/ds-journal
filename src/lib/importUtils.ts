// Pure transformation helpers shared between SP and PK importers.
import { toSqlDatetime } from './dateUtils'

export function normalizeColor(c: string | null | undefined): string | null {
  if (!c || typeof c !== 'string') return null
  c = c.trim().replace(/^#/, '')
  if (c.length === 8) c = c.slice(0, 6)  // strip alpha
  if (c.length === 6 && /^[0-9a-fA-F]{6}$/.test(c)) return '#' + c
  return null
}

// Convert epoch-ms timestamp (SP style) to DSJ SQL datetime.
export function spTsToSql(ms: number | null | undefined): string | null {
  if (!ms) return null
  return toSqlDatetime(new Date(ms))
}

// Convert ISO string timestamp (PK style) to DSJ SQL datetime.
export function isoToSql(iso: string | null | undefined): string | null {
  if (!iso) return null
  return toSqlDatetime(new Date(iso))
}

export function buildMemberDescription(member: { desc?: string; info?: Record<string, unknown> }): string | null {
  let desc = member.desc ?? ''
  if (member.info && Object.keys(member.info).length) {
    const infoLines = Object.entries(member.info).map(([k, v]) => `${k}: ${v}`).join('\n')
    desc = desc ? `${desc}\n\n${infoLines}` : infoLines
  }
  return desc || null
}

export function buildFrontHistoryText(fh: {
  startTime?: number; endTime?: number; live?: boolean; customStatus?: string
}): string {
  let text = 'Fronting'
  if (fh.endTime != null && fh.startTime != null) {
    const mins = Math.round((fh.endTime - fh.startTime) / 60000)
    const h = Math.floor(mins / 60)
    const m = mins % 60
    text = h > 0 ? `Fronted for ${h}h ${m}m` : `Fronted for ${m}m`
  } else if (fh.live) {
    text = 'Currently fronting'
  }
  if (fh.customStatus) text += ` · ${fh.customStatus}`
  return text
}

export function buildNoteText(note: { title?: string; note?: string }): string {
  const title = note.title?.trim() ?? ''
  const body  = note.note?.trim()  ?? ''
  if (title && body) return `**${title}**\n${body}`
  if (title)         return `**${title}**`
  return body
}

export function buildBoardText(bm: { title?: string; message?: string }): string {
  const title = bm.title?.trim()   ?? ''
  const body  = bm.message?.trim() ?? ''
  if (title && body) return `**${title}**\n${body}`
  if (title)         return `**${title}**`
  return body
}

export function frontHistoryMemberId(fh: {
  custom?: boolean; customFront?: string; member?: string
}): string | undefined {
  return fh.custom ? fh.customFront : fh.member
}
