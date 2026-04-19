import type { TagSuggestion } from '../../hooks/useTagInput'
import { t } from '../../i18n'
import './TagAutocomplete.css'

interface Props {
  suggestions: TagSuggestion[]
  selectedIndex: number
  placement: 'above' | 'below'
  onSelect: (suggestion: TagSuggestion) => void
}

export default function TagAutocomplete({ suggestions, selectedIndex, placement, onSelect }: Props) {
  if (suggestions.length === 0) return null
  return (
    <div className={`tag-autocomplete tag-autocomplete-${placement}`}>
      {suggestions.map((s, i) => (
        <button
          key={s.name}
          className={`tag-suggestion${i === selectedIndex ? ' selected' : ''}`}
          onMouseDown={e => { e.preventDefault(); onSelect(s) }}
        >
          {s.color != null && (
            <span className="tag-suggestion-dot" style={{ background: s.color }} />
          )}
          <span className="tag-suggestion-name">{s.display_name}</span>
          {s.isChannel && <span className="tag-suggestion-badge">{t('tagAutocomplete.channelBadge')}</span>}
        </button>
      ))}
    </div>
  )
}
