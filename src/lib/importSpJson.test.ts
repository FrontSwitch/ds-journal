import { describe, it, expect } from 'vitest'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const {
  spTsToSql,
  normalizeColor,
  buildMemberDescription,
  buildFrontHistoryText,
  buildNoteText,
  buildBoardText,
  frontHistoryMemberId,
} = require('../../scripts/import-sp-json-lib.cjs')

// ── spTsToSql ────────────────────────────────────────────────────────────────

describe('spTsToSql', () => {
  it('converts epoch ms to SQL datetime', () => {
    expect(spTsToSql(1711234567890)).toBe('2024-03-23 22:56:07')
  })
  it('returns null for null', () => {
    expect(spTsToSql(null)).toBeNull()
  })
  it('returns null for 0', () => {
    expect(spTsToSql(0)).toBeNull()
  })
  it('returns null for undefined', () => {
    expect(spTsToSql(undefined)).toBeNull()
  })
  it('handles midnight UTC correctly', () => {
    expect(spTsToSql(1577836800000)).toBe('2020-01-01 00:00:00')
  })
})

// ── normalizeColor ───────────────────────────────────────────────────────────

describe('normalizeColor', () => {
  it('adds # to bare 6-char hex', () => {
    expect(normalizeColor('a8d8ea')).toBe('#a8d8ea')
  })
  it('passes through already-prefixed color', () => {
    expect(normalizeColor('#a8d8ea')).toBe('#a8d8ea')
  })
  it('strips alpha from 8-char hex', () => {
    expect(normalizeColor('a8d8eaff')).toBe('#a8d8ea')
  })
  it('strips alpha from 9-char #-prefixed hex', () => {
    expect(normalizeColor('#a8d8eaff')).toBe('#a8d8ea')
  })
  it('returns null for empty string', () => {
    expect(normalizeColor('')).toBeNull()
  })
  it('returns null for null', () => {
    expect(normalizeColor(null)).toBeNull()
  })
  it('returns null for invalid hex', () => {
    expect(normalizeColor('zzzzzz')).toBeNull()
  })
  it('returns null for too-short hex', () => {
    expect(normalizeColor('abc')).toBeNull()
  })
  it('is case-insensitive', () => {
    expect(normalizeColor('A8D8EA')).toBe('#A8D8EA')
  })
  it('trims whitespace', () => {
    expect(normalizeColor('  a8d8ea  ')).toBe('#a8d8ea')
  })
})

// ── buildMemberDescription ───────────────────────────────────────────────────

describe('buildMemberDescription', () => {
  it('returns desc when no info', () => {
    expect(buildMemberDescription({ desc: 'Hello', info: {} })).toBe('Hello')
  })
  it('returns null for empty desc and no info', () => {
    expect(buildMemberDescription({ desc: '', info: {} })).toBeNull()
  })
  it('returns info lines when no desc', () => {
    expect(buildMemberDescription({ desc: '', info: { role: 'Protector', age: '20s' } }))
      .toBe('role: Protector\nage: 20s')
  })
  it('combines desc and info with blank line', () => {
    expect(buildMemberDescription({ desc: 'Main fronter', info: { role: 'Host' } }))
      .toBe('Main fronter\n\nrole: Host')
  })
  it('handles missing desc field', () => {
    expect(buildMemberDescription({ info: { role: 'Host' } }))
      .toBe('role: Host')
  })
  it('handles missing info field', () => {
    expect(buildMemberDescription({ desc: 'Hello' })).toBe('Hello')
  })
})

// ── buildFrontHistoryText ────────────────────────────────────────────────────

describe('buildFrontHistoryText', () => {
  it('returns "Fronting" with no times', () => {
    expect(buildFrontHistoryText({ startTime: null, endTime: null, live: false, customStatus: '' }))
      .toBe('Fronting')
  })
  it('computes duration in minutes', () => {
    expect(buildFrontHistoryText({ startTime: 0, endTime: 30 * 60000, live: false, customStatus: '' }))
      .toBe('Fronted for 30m')
  })
  it('computes duration in hours and minutes', () => {
    expect(buildFrontHistoryText({ startTime: 0, endTime: 90 * 60000, live: false, customStatus: '' }))
      .toBe('Fronted for 1h 30m')
  })
  it('computes duration in whole hours', () => {
    expect(buildFrontHistoryText({ startTime: 0, endTime: 120 * 60000, live: false, customStatus: '' }))
      .toBe('Fronted for 2h 0m')
  })
  it('shows "Currently fronting" when live and no endTime', () => {
    expect(buildFrontHistoryText({ startTime: 0, endTime: null, live: true, customStatus: '' }))
      .toBe('Currently fronting')
  })
  it('appends customStatus', () => {
    expect(buildFrontHistoryText({ startTime: 0, endTime: 30 * 60000, live: false, customStatus: 'morning shift' }))
      .toBe('Fronted for 30m · morning shift')
  })
  it('appends customStatus to live entry', () => {
    expect(buildFrontHistoryText({ startTime: 0, endTime: null, live: true, customStatus: 'keeping watch' }))
      .toBe('Currently fronting · keeping watch')
  })
  it('rounds to nearest minute', () => {
    expect(buildFrontHistoryText({ startTime: 0, endTime: 90500, live: false, customStatus: '' }))
      .toBe('Fronted for 2m')
  })
})

// ── buildNoteText ────────────────────────────────────────────────────────────

describe('buildNoteText', () => {
  it('combines title and body', () => {
    expect(buildNoteText({ title: 'Therapy notes', note: 'Went well.' }))
      .toBe('**Therapy notes**\nWent well.')
  })
  it('returns only bolded title when no body', () => {
    expect(buildNoteText({ title: 'Title only', note: '' }))
      .toBe('**Title only**')
  })
  it('returns only body when no title', () => {
    expect(buildNoteText({ title: '', note: 'Just a note.' }))
      .toBe('Just a note.')
  })
  it('returns empty string when both missing', () => {
    expect(buildNoteText({ title: '', note: '' })).toBe('')
  })
  it('trims whitespace from title and body', () => {
    expect(buildNoteText({ title: '  Title  ', note: '  Body  ' }))
      .toBe('**Title**\nBody')
  })
  it('handles undefined fields', () => {
    expect(buildNoteText({})).toBe('')
  })
})

// ── buildBoardText ───────────────────────────────────────────────────────────

describe('buildBoardText', () => {
  it('combines title and message', () => {
    expect(buildBoardText({ title: 'Reminder', message: 'Take your meds.' }))
      .toBe('**Reminder**\nTake your meds.')
  })
  it('returns only title when no message', () => {
    expect(buildBoardText({ title: 'Hello', message: '' }))
      .toBe('**Hello**')
  })
  it('returns only message when no title', () => {
    expect(buildBoardText({ title: '', message: 'Just a message.' }))
      .toBe('Just a message.')
  })
  it('handles undefined fields', () => {
    expect(buildBoardText({})).toBe('')
  })
})

// ── frontHistoryMemberId ─────────────────────────────────────────────────────

describe('frontHistoryMemberId', () => {
  it('returns member when not custom', () => {
    expect(frontHistoryMemberId({ custom: false, member: 'mem_1', customFront: null }))
      .toBe('mem_1')
  })
  it('returns customFront when custom=true', () => {
    expect(frontHistoryMemberId({ custom: true, member: null, customFront: 'cf_1' }))
      .toBe('cf_1')
  })
  it('returns null when custom=false and no member', () => {
    expect(frontHistoryMemberId({ custom: false, member: null, customFront: null }))
      .toBeNull()
  })
})
