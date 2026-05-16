import type { AvatarField } from '../../types'
import { parseIntRange } from '../../lib/avatarFieldUtils'
import './AvatarFieldEditor.css'

function IntRangeInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const parsed = parseIntRange(value)
  const lo = parsed ? String(parsed[0]) : ''
  const hi = parsed && parsed[0] !== parsed[1] ? String(parsed[1]) : ''

  function update(newLo: string, newHi: string) {
    const a = newLo.trim(), b = newHi.trim()
    if (!a && !b) { onChange(''); return }
    onChange(b ? `${a || 0}-${b}` : a)
  }

  return (
    <div className="intrange-input">
      <input type="number" value={lo} placeholder="min" onChange={e => update(e.target.value, hi)} />
      <span className="intrange-sep">–</span>
      <input type="number" value={hi} placeholder="max" onChange={e => update(lo, e.target.value)} />
    </div>
  )
}

interface Props {
  fields: AvatarField[]
  values: Record<number, string>
  onChange: (fieldId: number, value: string) => void
}

export function AvatarFieldEditor({ fields, values, onChange }: Props) {
  if (fields.length === 0) return null
  return (
    <div className="avatar-field-values">
      {fields.map(f => (
        <div key={f.id} className="avatar-field-row">
          <span className="avatar-field-name">{f.name}</span>
          {f.field_type === 'intRange' ? (
            <IntRangeInput value={values[f.id] ?? ''} onChange={v => onChange(f.id, v)} />
          ) : f.field_type === 'boolean' ? (
            <select value={values[f.id] ?? ''} onChange={e => onChange(f.id, e.target.value)}>
              <option value="">—</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          ) : f.field_type === 'list' && f.list_values ? (
            <select value={values[f.id] ?? ''} onChange={e => onChange(f.id, e.target.value)}>
              <option value="">—</option>
              {f.list_values.split(',').map(o => o.trim()).filter(Boolean).map(o => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          ) : (
            <input
              type={f.field_type === 'integer' ? 'number' : 'text'}
              value={values[f.id] ?? ''}
              onChange={e => onChange(f.id, e.target.value)}
              placeholder="—"
            />
          )}
        </div>
      ))}
    </div>
  )
}
