import { useState, useRef } from 'react'

/**
 * Base hook for autocomplete UI: manages selectedIndex, pendingCursor, and keyboard navigation.
 * @param suggestions - current suggestion list (used to bound moveUp/moveDown)
 * @param wrap - if true, navigation wraps around (modulo); if false, clamps at edges
 */
export function useAutocomplete<T>(suggestions: T[], wrap = false) {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const pendingCursor = useRef<number | null>(null)

  function moveUp() {
    if (wrap) setSelectedIndex(i => (i - 1 + suggestions.length) % suggestions.length)
    else setSelectedIndex(i => Math.max(0, i - 1))
  }

  function moveDown() {
    if (wrap) setSelectedIndex(i => (i + 1) % suggestions.length)
    else setSelectedIndex(i => Math.min(suggestions.length - 1, i + 1))
  }

  function reset() { setSelectedIndex(0) }

  return { selectedIndex, setSelectedIndex, pendingCursor, moveUp, moveDown, reset }
}
