interface Props {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

export default function ColorInput({ value, onChange, placeholder = '#888888' }: Props) {
  return (
    <div className="color-row">
      <input
        type="color"
        value={value || placeholder}
        onChange={e => onChange(e.target.value)}
        className="color-picker"
      />
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="color-text"
      />
    </div>
  )
}
