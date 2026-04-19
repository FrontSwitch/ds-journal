const ONLY_DIGITS = /^\d+$/
const HEX_CHARS   = /^[0-9a-fA-F]+$/

export function shouldSkip(word: string): boolean {
  if (!word) return true
  if (ONLY_DIGITS.test(word)) return true
  if ((word.length === 3 || word.length === 6) && HEX_CHARS.test(word)) return true
  return false
}

// Extract all tags from message text: { name (lowercase), displayName (original casing) }
export function extractTagsFromText(text: string): { name: string; displayName: string }[] {
  const seen = new Map<string, string>()
  for (const m of text.matchAll(/#(\w+)/g)) {
    const word = m[1]
    if (!shouldSkip(word)) {
      const key = word.toLowerCase()
      if (!seen.has(key)) seen.set(key, word) // first occurrence wins for display
    }
  }
  return [...seen.entries()].map(([name, displayName]) => ({ name, displayName }))
}

// Walk backwards from cursor to find a #tag or @mention being typed.
// skipFn is only applied for # tags; @ mentions pass no skip function.
export interface TagCursor {
  prefix: string   // text after the trigger, up to cursor
  triggerPos: number // index of the trigger char in the string
}

export function getTagCursor(
  text: string,
  cursor: number,
  trigger: string,
  skipFn?: (word: string) => boolean
): TagCursor | null {
  let i = cursor - 1
  while (i >= 0 && /\w/.test(text[i])) i--
  if (i < 0 || text[i] !== trigger) return null
  if (i > 0 && !/\s/.test(text[i - 1])) return null // trigger must follow whitespace or be at start
  const prefix = text.slice(i + 1, cursor)
  if (!prefix) return null // bare trigger shows nothing until first char
  if (skipFn && skipFn(prefix)) return null
  return { prefix, triggerPos: i }
}

// Replace the trigger+prefix being typed with trigger+displayName, optionally adding a trailing space.
export function applyTagAccept(
  text: string,
  triggerPos: number,
  prefix: string,
  displayName: string,
  addSpace: boolean,
  trigger: string
): { newText: string; newCursor: number } {
  const before = text.slice(0, triggerPos)
  const after  = text.slice(triggerPos + 1 + prefix.length)
  const insert = `${trigger}${displayName}${addSpace ? ' ' : ''}`
  return { newText: before + insert + after, newCursor: triggerPos + insert.length }
}
