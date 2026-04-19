'use strict'

// Pure transformation functions for the SP JSON importer.
// No DB, no filesystem, no CLI — only data in, data out.
// Tested in src/lib/importSpJson.test.ts via Vitest.

/**
 * Convert a Simply Plural epoch-ms timestamp to DSJ's SQLite datetime format.
 * Returns null for falsy input.
 */
function spTsToSql(ms) {
  if (!ms) return null
  return new Date(ms).toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '')
}

/**
 * Normalize a Simply Plural color string to #rrggbb.
 * SP colors come as: "a8d8ea", "#a8d8ea", "a8d8eaff", "#a8d8eaff", or "".
 * Returns null for empty, invalid, or non-string input.
 */
function normalizeColor(c) {
  if (!c || typeof c !== 'string') return null
  c = c.trim().replace(/^#/, '')
  if (c.length === 8) c = c.slice(0, 6)   // strip alpha
  if (c.length === 6 && /^[0-9a-fA-F]{6}$/.test(c)) return '#' + c
  return null
}

/**
 * Build a DSJ avatar description from a SP member.
 * Combines desc with info key:value pairs.
 */
function buildMemberDescription(member) {
  let desc = member.desc ?? ''
  if (member.info && Object.keys(member.info).length) {
    const infoLines = Object.entries(member.info).map(([k, v]) => `${k}: ${v}`).join('\n')
    desc = desc ? `${desc}\n\n${infoLines}` : infoLines
  }
  return desc || null
}

/**
 * Build the message text for a front history entry.
 * Computes duration from startTime/endTime. Appends customStatus if present.
 */
function buildFrontHistoryText(fh) {
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

/**
 * Build the message text for a SP note.
 * Combines title (bolded) with note body.
 */
function buildNoteText(note) {
  const title = note.title?.trim() ?? ''
  const body  = note.note?.trim()  ?? ''
  if (title && body) return `**${title}**\n${body}`
  if (title)         return `**${title}**`
  return body
}

/**
 * Build the message text for a SP board message.
 * Combines title (bolded) with message body.
 */
function buildBoardText(bm) {
  const title = bm.title?.trim()   ?? ''
  const body  = bm.message?.trim() ?? ''
  if (title && body) return `**${title}**\n${body}`
  if (title)         return `**${title}**`
  return body
}

/**
 * Resolve which SP member ID to use for a front history entry.
 * Returns the customFront ID if custom=true, otherwise the member ID.
 */
function frontHistoryMemberId(fh) {
  return fh.custom ? fh.customFront : fh.member
}

module.exports = {
  spTsToSql,
  normalizeColor,
  buildMemberDescription,
  buildFrontHistoryText,
  buildNoteText,
  buildBoardText,
  frontHistoryMemberId,
}
