import type { SlashCommand } from '../../hooks/useSlashInput'
import './SlashAutocomplete.css'

interface Props {
  suggestions: SlashCommand[]
  selectedIndex: number
  onSelect: (cmd: SlashCommand) => void
}

export default function SlashAutocomplete({ suggestions, selectedIndex, onSelect }: Props) {
  if (suggestions.length === 0) return null
  return (
    <div className="slash-autocomplete">
      {suggestions.map((cmd, i) => (
        <button
          key={cmd.name}
          className={`slash-suggestion${i === selectedIndex ? ' selected' : ''}`}
          onMouseDown={e => { e.preventDefault(); onSelect(cmd) }}
        >
          <span className="slash-cmd-name">{cmd.usage}</span>
          <span className="slash-cmd-desc">{cmd.desc}</span>
        </button>
      ))}
    </div>
  )
}
