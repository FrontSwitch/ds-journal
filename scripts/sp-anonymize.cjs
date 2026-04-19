#!/usr/bin/env node
// Anonymizes a Simply Plural export.json for safe sharing / bug reports.
//
// What it strips:
//   - All text (names, descriptions, messages, notes, titles, comments, status)
//   - Pronouns, avatarUrl, avatarUuid, pkId, uid, username, info fields
//   - All _id values remapped to opaque IDs (mem_1, ch_1, etc.)
//   - All cross-references updated to match remapped IDs
//   - All timestamps → sequential values from 2020-01-01 +1s each (order preserved)
//
// What it keeps:
//   - Colors (non-PII, useful for testing color normalization)
//   - Boolean/flag fields (private, live, read, etc.)
//   - Numeric type/order fields
//   - Collection structure and array lengths
//
// Usage:
//   node scripts/sp-anonymize.cjs                          # export.json → test-export.json
//   node scripts/sp-anonymize.cjs my-export.json           # → test-export.json
//   node scripts/sp-anonymize.cjs my-export.json out.json  # custom output

'use strict'

const fs = require('fs')

const inFile  = process.argv[2] || 'export.json'
const outFile = process.argv[3] || 'test-export.json'

if (!fs.existsSync(inFile)) {
  console.error(`File not found: ${inFile}`)
  process.exit(1)
}

const data = JSON.parse(fs.readFileSync(inFile, 'utf8'))

// ── ID remapping ─────────────────────────────────────────────────────────────
// Build a map from every original _id → anonymous opaque ID.

const idMap = new Map() // original _id → new _id

const ID_PREFIXES = {
  members:      'mem',
  groups:       'grp',
  customFront:  'cf',
  chatCategory: 'cat',
  chatChannel:  'ch',
  chatMessage:  'msg',
  frontHistory: 'fh',
  notes:        'note',
  boardMessage: 'bm',
  polls:        'poll',
  customField:  'field',
  user:         'user',
}

for (const [col, prefix] of Object.entries(ID_PREFIXES)) {
  const arr = data[col]
  if (!Array.isArray(arr)) continue
  arr.forEach((obj, i) => {
    if (obj._id) idMap.set(obj._id, `${prefix}_${i + 1}`)
  })
}

function remapId(v) {
  if (v === null || v === undefined) return v
  return idMap.get(v) ?? v
}

function remapIds(arr) {
  return (arr ?? []).map(id => remapId(id))
}

// ── Timestamp mapping ────────────────────────────────────────────────────────

const TS_FIELDS = new Set(['timestamp', 'date', 'startTime', 'endTime', 'lastOperationTime'])
const BASE_MS   = new Date('2020-01-01T00:00:00Z').getTime()

const allTs = new Set()
for (const col of Object.values(data)) {
  if (!Array.isArray(col)) continue
  for (const obj of col) {
    for (const [k, v] of Object.entries(obj)) {
      if (TS_FIELDS.has(k) && typeof v === 'number') allTs.add(v)
    }
  }
}

const tsMap = new Map()
;[...allTs].sort((a, b) => a - b).forEach((ts, i) => tsMap.set(ts, BASE_MS + i * 1000))

function mapTs(v) {
  return (typeof v === 'number' && tsMap.has(v)) ? tsMap.get(v) : v
}

// ── Counters for sequential labels ──────────────────────────────────────────

const counters = {}
function next(prefix) {
  counters[prefix] = (counters[prefix] ?? 0) + 1
  return `${prefix}${counters[prefix]}`
}

// ── Collection processors ────────────────────────────────────────────────────

function members(arr) {
  return (arr ?? []).map(m => ({
    _id:                 remapId(m._id),
    uid:                 'anon',
    name:                next('avatar'),
    desc:                '',
    pronouns:            '',
    color:               'ffffff',
    avatarUrl:           null,
    avatarUuid:          null,
    pkId:                null,
    private:             false,
    preventTrusted:      false,
    supportDescMarkdown: false,
    preventsFrontNotifs: false,
    info:                {},
    lastOperationTime:   mapTs(m.lastOperationTime),
  }))
}

function groups(arr) {
  return (arr ?? []).map(g => ({
    _id:                 remapId(g._id),
    uid:                 'anon',
    name:                next('group'),
    desc:                '',
    color:               'ffffff',
    emoji:               '',
    members:             remapIds(g.members),
    parent:              remapId(g.parent),
    private:             false,
    preventTrusted:      false,
    supportDescMarkdown: false,
    lastOperationTime:   mapTs(g.lastOperationTime),
  }))
}

function customFront(arr) {
  return (arr ?? []).map(cf => ({
    _id:                 remapId(cf._id),
    uid:                 'anon',
    name:                next('customfront'),
    desc:                '',
    color:               'ffffff',
    avatarUrl:           null,
    avatarUuid:          null,
    private:             false,
    preventTrusted:      false,
    supportDescMarkdown: false,
    lastOperationTime:   mapTs(cf.lastOperationTime),
  }))
}

function chatCategory(arr) {
  return (arr ?? []).map(cat => ({
    _id:               remapId(cat._id),
    uid:               'anon',
    name:              next('folder'),
    desc:              '',
    lastOperationTime: mapTs(cat.lastOperationTime),
  }))
}

function chatChannel(arr) {
  return (arr ?? []).map(ch => ({
    _id:               remapId(ch._id),
    uid:               'anon',
    name:              next('channel'),
    desc:              '',
    category:          remapId(ch.category),
    lastOperationTime: mapTs(ch.lastOperationTime),
  }))
}

function chatMessage(arr) {
  return (arr ?? []).map((msg, i) => ({
    _id:               remapId(msg._id),
    uid:               'anon',
    message:           `[message ${i + 1}]`,
    channel:           remapId(msg.channel),
    writer:            remapId(msg.writer),
    timestamp:         mapTs(msg.timestamp),
    reply:             remapId(msg.reply),
    iv:                '',
    lastOperationTime: mapTs(msg.lastOperationTime),
  }))
}

function frontHistory(arr) {
  return (arr ?? []).map(fh => ({
    _id:               remapId(fh._id),
    uid:               'anon',
    startTime:         mapTs(fh.startTime),
    endTime:           fh.endTime !== null ? mapTs(fh.endTime) : null,
    member:            remapId(fh.member),
    customFront:       remapId(fh.customFront),
    custom:            false,
    live:              false,
    customStatus:      '',
    lastOperationTime: mapTs(fh.lastOperationTime),
  }))
}

function notes(arr) {
  return (arr ?? []).map((n, i) => ({
    _id:                 remapId(n._id),
    uid:                 'anon',
    title:               `[note ${i + 1}]`,
    note:                '[note text]',
    color:               'ffffff',
    date:                mapTs(n.date),
    member:              remapId(n.member),
    supportDescMarkdown: false,
    lastOperationTime:   mapTs(n.lastOperationTime),
  }))
}

function boardMessage(arr) {
  return (arr ?? []).map((bm, i) => ({
    _id:                 remapId(bm._id),
    uid:                 'anon',
    title:               `[board ${i + 1}]`,
    message:             '[board text]',
    writer:              remapId(bm.writer),
    recipient:           remapId(bm.recipient),
    timestamp:           mapTs(bm.timestamp),
    read:                false,
    supportDescMarkdown: false,
    lastOperationTime:   mapTs(bm.lastOperationTime),
  }))
}

function polls(arr) {
  return (arr ?? []).map((p, i) => ({
    _id:               remapId(p._id),
    uid:               'anon',
    title:             `[poll ${i + 1}]`,
    desc:              '',
    allowAbstain:      false,
    allowVeto:         false,
    custom:            false,
    votes:             (p.votes ?? []).map(v => ({
      member:  remapId(v.member),
      vote:    'yes',
      comment: '',
    })),
    lastOperationTime: mapTs(p.lastOperationTime),
  }))
}

function customField(arr) {
  return (arr ?? []).map((cf, i) => ({
    _id:             remapId(cf._id),
    uid:             'anon',
    name:            next('field'),
    order:           i,
    private:         false,
    preventTrusted:  false,
    type:            0,
    supportMarkdown: false,
    buckets:         [],
    lastOperationTime: mapTs(cf.lastOperationTime),
  }))
}

function user(arr) {
  return (arr ?? []).map(u => ({
    _id:                 remapId(u._id),
    uid:                 'anon',
    username:            'anon',
    desc:                '',
    color:               'ffffff',
    isAsystem:           true,
    supportDescMarkdown: false,
    avatarUuid:          null,
    avatarUrl:           null,
    lastOperationTime:   mapTs(u.lastOperationTime),
  }))
}

// ── Build output ─────────────────────────────────────────────────────────────

const PROCESSORS = {
  members, groups, customFront, chatCategory, chatChannel,
  chatMessage, frontHistory, notes, boardMessage, polls, customField, user,
}

const out = {}
for (const [key, val] of Object.entries(data)) {
  if (!Array.isArray(val)) continue
  const fn = PROCESSORS[key]
  out[key] = fn ? fn(val) : val // unknown collections passed through unchanged
}

fs.writeFileSync(outFile, JSON.stringify(out, null, 2))

// ── Summary ──────────────────────────────────────────────────────────────────

console.log(`Anonymized ${inFile} → ${outFile}`)
for (const [key, val] of Object.entries(out)) {
  console.log(`  ${key}: ${val.length} records`)
}
console.log(`  ${idMap.size} IDs remapped, ${tsMap.size} timestamps remapped`)
