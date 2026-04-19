import { describe, it, expect } from 'vitest'
import { shouldSkip, getTagCursor, applyTagAccept, extractTagsFromText } from './tagUtils'

describe('shouldSkip', () => {
  it('skips empty string', () => expect(shouldSkip('')).toBe(true))
  it('skips digits-only', () => {
    expect(shouldSkip('123')).toBe(true)
    expect(shouldSkip('0')).toBe(true)
  })
  it('skips 3-char hex', () => expect(shouldSkip('f9e')).toBe(true))
  it('skips 6-char hex', () => expect(shouldSkip('89b4fa')).toBe(true))
  it('allows 3-char non-hex', () => expect(shouldSkip('the')).toBe(false))
  it('allows 6-char non-hex', () => expect(shouldSkip('system')).toBe(false))
  it('allows normal words', () => expect(shouldSkip('planning')).toBe(false))
  it('allows 4-char hex-looking word', () => expect(shouldSkip('face')).toBe(false)) // 4 chars, not 3 or 6
})

describe('getTagCursor', () => {
  it('returns null when no trigger in text', () => {
    expect(getTagCursor('hello world', 11, '#')).toBeNull()
  })

  it('finds tag at start of text', () => {
    const text = '#planning'
    const result = getTagCursor(text, text.length, '#')
    expect(result).toEqual({ prefix: 'planning', triggerPos: 0 })
  })

  it('finds tag after space', () => {
    const text = 'today #mood check'
    const result = getTagCursor(text, 11, '#') // cursor after '#mood'
    expect(result).toEqual({ prefix: 'mood', triggerPos: 6 })
  })

  it('returns null for bare trigger with no prefix', () => {
    const text = 'hello # '
    expect(getTagCursor(text, 7, '#')).toBeNull()
  })

  it('returns null when trigger not preceded by whitespace', () => {
    const text = 'word#tag'
    expect(getTagCursor(text, 8, '#')).toBeNull()
  })

  it('returns null when skipFn matches', () => {
    const text = '#123'
    expect(getTagCursor(text, 4, '#', shouldSkip)).toBeNull()
  })

  it('returns result when skipFn does not match', () => {
    const text = '#planning'
    expect(getTagCursor(text, 9, '#', shouldSkip)).not.toBeNull()
  })

  it('finds tag mid-sentence with cursor mid-word', () => {
    const text = 'today #pla'
    const result = getTagCursor(text, 10, '#')
    expect(result).toEqual({ prefix: 'pla', triggerPos: 6 })
  })

  it('returns null when cursor is past a completed tag (space follows)', () => {
    // cursor is at the space after the tag, not inside a word
    const text = '#done '
    expect(getTagCursor(text, 6, '#')).toBeNull()
  })
})

describe('applyTagAccept', () => {
  it('replaces tag prefix with accepted name', () => {
    const text = '#pla'
    const result = applyTagAccept(text, 0, 'pla', 'planning', true, '#')
    expect(result.newText).toBe('#planning ')
    expect(result.newCursor).toBe(10)
  })

  it('replaces inline tag leaving surrounding text', () => {
    const text = 'today #mo check'
    const result = applyTagAccept(text, 6, 'mo', 'mood', true, '#')
    expect(result.newText).toBe('today #mood  check')
    expect(result.newCursor).toBe(12)
  })

  it('does not add space when addSpace is false', () => {
    const result = applyTagAccept('#plan', 0, 'plan', 'planning', false, '#')
    expect(result.newText).toBe('#planning')
    expect(result.newCursor).toBe(9)
  })

  it('works for @ mentions', () => {
    const text = '@Alex'
    const result = applyTagAccept(text, 0, 'Alex', 'Alex', true, '@')
    expect(result.newText).toBe('@Alex ')
    expect(result.newCursor).toBe(6)
  })
})

describe('extractTagsFromText', () => {
  it('extracts single tag', () => {
    const tags = extractTagsFromText('feeling #anxious today')
    expect(tags).toEqual([{ name: 'anxious', displayName: 'anxious' }])
  })

  it('extracts multiple tags', () => {
    const tags = extractTagsFromText('#frontlog #switching today')
    expect(tags.map(t => t.name)).toEqual(['frontlog', 'switching'])
  })

  it('preserves first-seen casing as displayName', () => {
    const tags = extractTagsFromText('#FrontLog then #frontlog again')
    expect(tags).toHaveLength(1)
    expect(tags[0]).toEqual({ name: 'frontlog', displayName: 'FrontLog' })
  })

  it('skips digits-only tokens', () => {
    expect(extractTagsFromText('#123 and #plan')).toEqual([
      { name: 'plan', displayName: 'plan' },
    ])
  })

  it('skips hex color tokens', () => {
    expect(extractTagsFromText('#89b4fa and #mood')).toEqual([
      { name: 'mood', displayName: 'mood' },
    ])
  })

  it('returns empty for text with no tags', () => {
    expect(extractTagsFromText('nothing special here')).toEqual([])
  })
})
