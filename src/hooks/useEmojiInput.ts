import { useState, useEffect, useMemo } from 'react'
import { useAutocomplete } from './useAutocomplete'
import { findEmojiSuggestions, buildMergedEntries, applySkinTone } from '../data/emojis'
import { getEmojiOverrides } from '../db/emojiOverrides'
import type { EmojiSuggestion } from '../data/emojis'
import type { EmojiOverride } from '../db/emojiOverrides'

export type { EmojiSuggestion }
export type { EmojiOverride }

interface EmojiCursor {
  prefix: string
  triggerPos: number
}

function getEmojiCursor(text: string, cursor: number): EmojiCursor | null {
  let i = cursor - 1
  // Walk back over word characters
  while (i >= 0 && /[\w]/.test(text[i])) i--
  if (i < 0 || text[i] !== ':') return null
  // Trigger must be at start or preceded by whitespace
  if (i > 0 && !/\s/.test(text[i - 1])) return null
  const prefix = text.slice(i + 1, cursor)
  if (!prefix) return null
  return { prefix, triggerPos: i }
}

export function useEmojiInput(enabled: boolean = true, builtinShortcodes: boolean = true, skinTone: string = '') {
  const [overrides, setOverrides] = useState<EmojiOverride[]>([])
  const [emojiCursor, setEmojiCursor] = useState<EmojiCursor | null>(null)
  const [suggestions, setSuggestions] = useState<EmojiSuggestion[]>([])
  const { selectedIndex, setSelectedIndex, pendingCursor, moveUp, moveDown } = useAutocomplete(suggestions)

  useEffect(() => {
    getEmojiOverrides().then(setOverrides)
  }, [])

  const entries = useMemo(
    () => buildMergedEntries(overrides, builtinShortcodes),
    [overrides, builtinShortcodes]
  )

  useEffect(() => {
    if (!emojiCursor) { setSuggestions([]); return }
    const suggs = findEmojiSuggestions(emojiCursor.prefix, skinTone, entries)
    setSuggestions(suggs)
    setSelectedIndex(0)
  }, [emojiCursor?.prefix, entries])

  function onTextChange(text: string, cursor: number) {
    if (!enabled) { setEmojiCursor(null); return }
    setEmojiCursor(getEmojiCursor(text, cursor))
  }

  function acceptSuggestion(text: string, setText: (t: string) => void, sugg: EmojiSuggestion) {
    if (!emojiCursor) return
    const before = text.slice(0, emojiCursor.triggerPos)
    const after = text.slice(emojiCursor.triggerPos + 1 + emojiCursor.prefix.length)
    const insert = applySkinTone(sugg.emoji, skinTone) + ' '
    pendingCursor.current = emojiCursor.triggerPos + insert.length
    setText(before + insert + after)
    setEmojiCursor(null)
    setSuggestions([])
  }

  function accept(text: string, setText: (t: string) => void): boolean {
    if (!emojiCursor || suggestions.length === 0) return false
    acceptSuggestion(text, setText, suggestions[Math.min(selectedIndex, suggestions.length - 1)])
    return true
  }

  function dismiss() { setEmojiCursor(null); setSuggestions([]) }

  return {
    isOpen: suggestions.length > 0,
    suggestions,
    selectedIndex,
    pendingCursor,
    onTextChange,
    accept,
    acceptSuggestion,
    dismiss,
    moveUp,
    moveDown,
  }
}
