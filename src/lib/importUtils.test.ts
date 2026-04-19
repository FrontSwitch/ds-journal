import { describe, it, expect } from 'vitest'
import {
  normalizeColor,
  buildFrontHistoryText,
  buildNoteText,
  buildBoardText,
  buildMemberDescription,
  frontHistoryMemberId,
} from './importUtils'

// ── normalizeColor ────────────────────────────────────────────────────────────

describe('normalizeColor', () => {
  it('returns a valid 6-digit hex color with #', () => {
    expect(normalizeColor('89b4fa')).toBe('#89b4fa')
  })

  it('accepts input already prefixed with #', () => {
    expect(normalizeColor('#89b4fa')).toBe('#89b4fa')
  })

  it('strips alpha channel from 8-digit hex', () => {
    expect(normalizeColor('89b4faff')).toBe('#89b4fa')
    expect(normalizeColor('#89b4faff')).toBe('#89b4fa')
  })

  it('returns null for null input', () => {
    expect(normalizeColor(null)).toBeNull()
  })

  it('returns null for undefined input', () => {
    expect(normalizeColor(undefined)).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(normalizeColor('')).toBeNull()
  })

  it('returns null for invalid hex', () => {
    expect(normalizeColor('xyz123')).toBeNull()
  })

  it('returns null for too-short hex', () => {
    expect(normalizeColor('89b4')).toBeNull()
  })

  it('accepts uppercase hex', () => {
    expect(normalizeColor('89B4FA')).toBe('#89B4FA')
  })
})

// ── buildFrontHistoryText ─────────────────────────────────────────────────────

describe('buildFrontHistoryText', () => {
  it('returns "Fronting" with no time info', () => {
    expect(buildFrontHistoryText({})).toBe('Fronting')
  })

  it('returns "Currently fronting" when live=true', () => {
    expect(buildFrontHistoryText({ live: true })).toBe('Currently fronting')
  })

  it('includes customStatus', () => {
    expect(buildFrontHistoryText({ customStatus: 'focused' })).toBe('Fronting · focused')
  })

  it('combines live + customStatus', () => {
    expect(buildFrontHistoryText({ live: true, customStatus: 'gaming' }))
      .toBe('Currently fronting · gaming')
  })

  it('formats duration in minutes only', () => {
    const startTime = 0
    const endTime   = 45 * 60 * 1000 // 45 minutes
    expect(buildFrontHistoryText({ startTime, endTime })).toBe('Fronted for 45m')
  })

  it('formats duration in hours and minutes', () => {
    const startTime = 0
    const endTime   = (2 * 60 + 30) * 60 * 1000 // 2h 30m
    expect(buildFrontHistoryText({ startTime, endTime })).toBe('Fronted for 2h 30m')
  })

  it('formats duration of exactly 1 hour', () => {
    const startTime = 0
    const endTime   = 60 * 60 * 1000
    expect(buildFrontHistoryText({ startTime, endTime })).toBe('Fronted for 1h 0m')
  })

  it('includes customStatus with duration', () => {
    const startTime = 0
    const endTime   = 30 * 60 * 1000
    expect(buildFrontHistoryText({ startTime, endTime, customStatus: 'work' }))
      .toBe('Fronted for 30m · work')
  })
})

// ── buildNoteText ─────────────────────────────────────────────────────────────

describe('buildNoteText', () => {
  it('combines title and body with bold title', () => {
    expect(buildNoteText({ title: 'Intro', note: 'Some text' }))
      .toBe('**Intro**\nSome text')
  })

  it('returns bold title alone when no body', () => {
    expect(buildNoteText({ title: 'Intro' })).toBe('**Intro**')
  })

  it('returns body alone when no title', () => {
    expect(buildNoteText({ note: 'Just a note' })).toBe('Just a note')
  })

  it('returns empty string when both absent', () => {
    expect(buildNoteText({})).toBe('')
  })

  it('trims whitespace from title and body', () => {
    expect(buildNoteText({ title: '  Hi  ', note: '  text  ' }))
      .toBe('**Hi**\ntext')
  })
})

// ── buildBoardText ────────────────────────────────────────────────────────────

describe('buildBoardText', () => {
  it('combines title and message with bold title', () => {
    expect(buildBoardText({ title: 'Notice', message: 'Read this' }))
      .toBe('**Notice**\nRead this')
  })

  it('returns bold title alone when no message', () => {
    expect(buildBoardText({ title: 'Notice' })).toBe('**Notice**')
  })

  it('returns message alone when no title', () => {
    expect(buildBoardText({ message: 'Just text' })).toBe('Just text')
  })

  it('returns empty string when both absent', () => {
    expect(buildBoardText({})).toBe('')
  })
})

// ── buildMemberDescription ────────────────────────────────────────────────────

describe('buildMemberDescription', () => {
  it('returns desc when no info', () => {
    expect(buildMemberDescription({ desc: 'Hello' })).toBe('Hello')
  })

  it('returns null when desc and info are both empty', () => {
    expect(buildMemberDescription({})).toBeNull()
    expect(buildMemberDescription({ desc: '', info: {} })).toBeNull()
  })

  it('appends info lines when desc is present', () => {
    const result = buildMemberDescription({ desc: 'Intro', info: { age: 25 } })
    expect(result).toBe('Intro\n\nage: 25')
  })

  it('uses info only when no desc', () => {
    const result = buildMemberDescription({ info: { role: 'host' } })
    expect(result).toBe('role: host')
  })
})

// ── frontHistoryMemberId ──────────────────────────────────────────────────────

describe('frontHistoryMemberId', () => {
  it('returns customFront when custom=true', () => {
    expect(frontHistoryMemberId({ custom: true, customFront: 'cf-id', member: 'm-id' }))
      .toBe('cf-id')
  })

  it('returns member when custom=false', () => {
    expect(frontHistoryMemberId({ custom: false, member: 'm-id' })).toBe('m-id')
  })

  it('returns undefined when custom=true but no customFront', () => {
    expect(frontHistoryMemberId({ custom: true })).toBeUndefined()
  })
})
