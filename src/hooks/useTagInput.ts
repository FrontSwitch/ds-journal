import { useState, useEffect } from 'react'
import { useAutocomplete } from './useAutocomplete'
import { getTagCursor, applyTagAccept, shouldSkip } from '../lib/tagUtils'
import { getTagSuggestions } from '../db/tags'
import { getChannels } from '../db/channels'
import { isHidden } from '../types'
import { getAvatars } from '../db/avatars'

export interface TagSuggestion {
  name: string
  display_name: string
  isChannel: boolean
  color?: string | null
}

interface Options {
  trigger: string
  loadSuggestions: (prefix: string) => Promise<TagSuggestion[]>
  skipFn?: (word: string) => boolean
}

async function loadTagSuggestions(prefix: string): Promise<TagSuggestion[]> {
  const [dbTags, channels] = await Promise.all([getTagSuggestions(prefix), getChannels()])
  const lower = prefix.toLowerCase()
  const seen = new Set(dbTags.map(t => t.name))
  const channelSuggs: TagSuggestion[] = channels
    .filter(c => !isHidden(c.hidden) && c.name.toLowerCase().startsWith(lower) && !seen.has(c.name.toLowerCase()))
    .slice(0, 5)
    .map(c => ({ name: c.name.toLowerCase(), display_name: c.name, isChannel: true }))
  const scratchSugg: TagSuggestion[] = 'scratch'.startsWith(lower)
    ? [{ name: 'scratch', display_name: 'Scratch', isChannel: true }]
    : []
  return [
    ...dbTags.map(t => ({ name: t.name, display_name: t.display_name, isChannel: false })),
    ...channelSuggs,
    ...scratchSugg,
  ].slice(0, 10)
}

async function loadAvatarSuggestions(prefix: string): Promise<TagSuggestion[]> {
  const avatars = await getAvatars()
  const lower = prefix.toLowerCase()
  return avatars
    .filter(a => !isHidden(a.hidden) && (
      a.name.toLowerCase().startsWith(lower) ||
      (a.icon_letters != null && a.icon_letters.toLowerCase().startsWith(lower))
    ))
    .slice(0, 10)
    .map(a => ({ name: a.name.toLowerCase(), display_name: a.name, isChannel: false, color: a.color }))
}

export const TAG_OPTIONS: Options = {
    trigger: '#',
    loadSuggestions: loadTagSuggestions,
    skipFn: shouldSkip,
}

export const MENTION_OPTIONS: Options = {
  trigger: '@',
  loadSuggestions: loadAvatarSuggestions,
}

export function useTagInput(options: Options = TAG_OPTIONS, enabled: boolean = true) {
  const { trigger, loadSuggestions, skipFn } = options
  const [tagCursor, setTagCursor] = useState<{ prefix: string; triggerPos: number } | null>(null)
  const [suggestions, setSuggestions] = useState<TagSuggestion[]>([])
  const { selectedIndex, setSelectedIndex, pendingCursor, moveUp, moveDown } = useAutocomplete(suggestions)

  useEffect(() => {
    if (!tagCursor) { setSuggestions([]); return }
    let cancelled = false
    loadSuggestions(tagCursor.prefix).then(suggs => {
      if (!cancelled) { setSuggestions(suggs); setSelectedIndex(0) }
    })
    return () => { cancelled = true }
  }, [tagCursor?.prefix])

  function onTextChange(text: string, cursor: number) {
    if (!enabled) { setTagCursor(null); return }
    setTagCursor(getTagCursor(text, cursor, trigger, skipFn))
  }

  function acceptSuggestion(text: string, setText: (t: string) => void, sugg: TagSuggestion, addSpace: boolean) {
    if (!tagCursor) return
    const { newText, newCursor } = applyTagAccept(
      text, tagCursor.triggerPos, tagCursor.prefix, sugg.display_name, addSpace, trigger
    )
    pendingCursor.current = newCursor
    setText(newText)
    setTagCursor(null)
    setSuggestions([])
  }

  function accept(text: string, setText: (t: string) => void, addSpace: boolean): boolean {
    if (!tagCursor || suggestions.length === 0) return false
    acceptSuggestion(text, setText, suggestions[Math.min(selectedIndex, suggestions.length - 1)], addSpace)
    return true
  }

  function dismiss() { setTagCursor(null); setSuggestions([]) }

  return { isOpen: suggestions.length > 0, suggestions, selectedIndex, pendingCursor, onTextChange, accept, acceptSuggestion, dismiss, moveUp, moveDown }
}
