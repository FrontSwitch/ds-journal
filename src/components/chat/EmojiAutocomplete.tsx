import type { EmojiSuggestion } from '../../hooks/useEmojiInput'
import './TagAutocomplete.css'

interface Props {
  suggestions: EmojiSuggestion[]
  selectedIndex: number
  onSelect: (sugg: EmojiSuggestion) => void
}

export default function EmojiAutocomplete({ suggestions, selectedIndex, onSelect }: Props) {
  if (suggestions.length === 0) return null
  return (
    <div className="tag-autocomplete tag-autocomplete-above">
      {suggestions.map((s, i) => (
        <button
          key={s.name}
          className={`tag-suggestion${i === selectedIndex ? ' selected' : ''}`}
          onMouseDown={e => { e.preventDefault(); onSelect(s) }}
        >
          <span style={{ fontSize: 16, lineHeight: 1 }}>{s.emoji}</span>
          <span className="tag-suggestion-name">:{s.name}</span>
        </button>
      ))}
    </div>
  )
}
