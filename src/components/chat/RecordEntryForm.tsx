import { useState, useRef, useEffect } from 'react'
import { toSqlDatetime } from '../../lib/dateUtils'
import { useAvatars } from '../../hooks/useAvatars'
import { useTagInput, MENTION_OPTIONS } from '../../hooks/useTagInput'
import { submitRecord, type RecordValueInput } from '../../db/trackers'
import { isHidden } from '../../types'
import type { Tracker, TrackerField, Avatar } from '../../types'
import { t } from '../../i18n'
import TagAutocomplete from './TagAutocomplete'

interface Props {
  tracker: Tracker
  fields: TrackerField[]
  channelId: number
  defaultAvatarId: number | null
  onClose: () => void
  onSubmitted: (usedAvatarId: number | null) => void
}

function localDateStr(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function localDateTimeStr(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function defaultValue(field: TrackerField, defaultAvatarId: number | null): string {
  // contextual defaults always win for these types
  if (field.field_type === 'date') return localDateStr()
  if (field.field_type === 'datetime') return localDateTimeStr()
  if (field.field_type === 'who') return defaultAvatarId != null ? String(defaultAvatarId) : ''
  // use stored default if set
  if (field.default_value != null) return field.default_value
  // fall back to safe empty defaults
  if (field.field_type === 'boolean') return 'false'
  return ''
}

export default function RecordEntryForm({ tracker, fields, channelId, defaultAvatarId, onClose, onSubmitted }: Props) {
  const { avatars } = useAvatars(null)
  const visibleAvatars = avatars.filter(a => !isHidden(a.hidden))

  const [avatarId, setAvatarId] = useState<number | null>(defaultAvatarId)
  const [recordTime, setRecordTime] = useState<string>(localDateTimeStr)
  const [values, setValues] = useState<Record<number, string>>(() => {
    const init: Record<number, string> = {}
    for (const f of fields) init[f.id] = defaultValue(f, defaultAvatarId)
    return init
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function setValue(fieldId: number, val: string) {
    setValues(v => ({ ...v, [fieldId]: val }))
  }

  function buildSubmitValues(): RecordValueInput[] {
    return fields.map(f => {
      const raw = values[f.id] ?? ''
      const v: RecordValueInput = { field_id: f.id }
      switch (f.field_type) {
        case 'boolean':
          v.value_boolean = raw === 'true'
          break
        case 'integer':
        case 'number':
          v.value_number = raw !== '' ? parseFloat(raw) : null
          break
        case 'who':
          v.value_avatar_id = raw !== '' ? parseInt(raw) : null
          break
        default:
          v.value_text = raw || null
      }
      return v
    })
  }

  const canSubmit = fields
    .filter(f => f.required)
    .every(f => {
      if (f.field_type === 'boolean') return true
      return (values[f.id] ?? '').trim() !== ''
    })

  async function handleSubmit() {
    setBusy(true)
    setError(null)
    try {
      // datetime-local gives "YYYY-MM-DDTHH:MM" (local time) — convert to UTC for storage,
      // consistent with SQLite datetime('now') used for non-backdated records
      const createdAt = recordTime ? toSqlDatetime(new Date(recordTime)) : undefined
      await submitRecord(tracker.id, channelId, avatarId, buildSubmitValues(), createdAt)
      onSubmitted(avatarId)
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="record-entry-form">
      <div className="record-form-header">
        <span className="record-form-title">{t('recordForm.title', { name: tracker.name })}</span>
        <div className="record-form-avatar-row">
          <span className="record-form-as">{t('recordForm.at')}</span>
          <input
            type="datetime-local"
            className="record-form-time-input"
            value={recordTime}
            onChange={e => setRecordTime(e.target.value)}
          />
          <span className="record-form-as">{t('recordForm.recordingAs')}</span>
          <select
            className="record-form-avatar-select"
            value={avatarId ?? ''}
            onChange={e => setAvatarId(e.target.value !== '' ? parseInt(e.target.value) : null)}
          >
            <option value="">{t('recordForm.noOne')}</option>
            {visibleAvatars.map(a => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="record-form-fields">
        {fields.map(f => (
          <div key={f.id} className="record-form-field">
            <label className="record-form-label">
              {f.name}
              {!!f.required && <span className="record-form-required">{t('recordForm.required')}</span>}
            </label>
            <FieldInput
              field={f}
              value={values[f.id] ?? ''}
              onChange={v => setValue(f.id, v)}
              avatars={visibleAvatars}
            />
          </div>
        ))}
      </div>

      <div className="record-form-actions">
        <button className="save-btn" onClick={handleSubmit} disabled={busy || !canSubmit}>
          {busy ? '…' : t('recordForm.submit')}
        </button>
        <button className="cancel-btn" onClick={onClose}>{t('recordForm.cancel')}</button>
      </div>
      {error && <div style={{ fontSize: 12, color: '#f38ba8', wordBreak: 'break-all' }}>{error}</div>}
    </div>
  )
}

interface FieldInputProps {
  field: TrackerField
  value: string
  onChange: (v: string) => void
  avatars: Avatar[]
}

const SELECT_STYLE: React.CSSProperties = {
  fontSize: 13,
  background: 'var(--bg-hover)',
  border: '1px solid var(--border)',
  color: 'var(--text)',
  borderRadius: 4,
  padding: '5px 8px',
}

function FieldInput({ field, value, onChange, avatars }: FieldInputProps) {
  switch (field.field_type) {
    case 'boolean':
      return (
        <input
          type="checkbox"
          checked={value === 'true'}
          onChange={e => onChange(e.target.checked ? 'true' : 'false')}
          style={{ width: 16, height: 16, marginTop: 2 }}
        />
      )
    case 'date':
      return <input type="date" value={value} onChange={e => onChange(e.target.value)} />
    case 'datetime':
      return <input type="datetime-local" value={value} onChange={e => onChange(e.target.value)} />
    case 'text_short':
      return <MentionInput value={value} onChange={onChange} maxLength={255} />
    case 'text_long':
      return <MentionTextarea value={value} onChange={onChange} />
    case 'integer':
      return (
        <input
          type="number"
          step="1"
          min={field.range_min ?? undefined}
          max={field.range_max ?? undefined}
          value={value}
          onChange={e => onChange(e.target.value)}
        />
      )
    case 'number':
      return (
        <input
          type="number"
          min={field.range_min ?? undefined}
          max={field.range_max ?? undefined}
          value={value}
          onChange={e => onChange(e.target.value)}
        />
      )
    case 'list': {
      const options = field.list_values ? (JSON.parse(field.list_values) as string[]) : []
      return (
        <select value={value} onChange={e => onChange(e.target.value)} style={SELECT_STYLE}>
          <option value="">{t('recordForm.noneOption')}</option>
          {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
        </select>
      )
    }
    case 'who':
      return (
        <select value={value} onChange={e => onChange(e.target.value)} style={SELECT_STYLE}>
          <option value="">{t('recordForm.noOne')}</option>
          {avatars.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      )
    case 'color':
      return (
        <input
          type="color"
          value={value || '#888888'}
          onChange={e => onChange(e.target.value)}
          style={{ width: 48, height: 32, padding: 2, cursor: 'pointer' }}
        />
      )
    default:
      return <input type="text" value={value} onChange={e => onChange(e.target.value)} />
  }
}

function MentionInput({ value, onChange, maxLength }: { value: string; onChange: (v: string) => void; maxLength?: number }) {
  const ref = useRef<HTMLInputElement>(null)
  const mention = useTagInput(MENTION_OPTIONS)
  useEffect(() => {
    if (mention.pendingCursor.current !== null && ref.current) {
      ref.current.setSelectionRange(mention.pendingCursor.current, mention.pendingCursor.current)
      mention.pendingCursor.current = null
    }
  }, [value])
  return (
    <div style={{ position: 'relative' }}>
      <input
        ref={ref}
        type="text"
        value={value}
        maxLength={maxLength}
        onChange={e => { onChange(e.target.value); mention.onTextChange(e.target.value, e.target.selectionStart ?? 0) }}
        onKeyDown={e => {
          if (!mention.isOpen) return
          if (e.key === 'ArrowUp')   { e.preventDefault(); mention.moveUp() }
          else if (e.key === 'ArrowDown') { e.preventDefault(); mention.moveDown() }
          else if (e.key === ' ' || e.key === 'Tab') { e.preventDefault(); mention.accept(value, onChange, true) }
          else if (e.key === 'Escape') mention.dismiss()
        }}
      />
      {mention.isOpen && <TagAutocomplete suggestions={mention.suggestions} selectedIndex={mention.selectedIndex} placement="above" onSelect={s => mention.acceptSuggestion(value, onChange, s, true)} />}
    </div>
  )
}

function MentionTextarea({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const mention = useTagInput(MENTION_OPTIONS)
  useEffect(() => {
    if (mention.pendingCursor.current !== null && ref.current) {
      ref.current.setSelectionRange(mention.pendingCursor.current, mention.pendingCursor.current)
      mention.pendingCursor.current = null
    }
  }, [value])
  return (
    <div style={{ position: 'relative' }}>
      <textarea
        ref={ref}
        value={value}
        rows={3}
        style={{ resize: 'vertical' }}
        onChange={e => { onChange(e.target.value); mention.onTextChange(e.target.value, e.target.selectionStart ?? 0) }}
        onKeyDown={e => {
          if (!mention.isOpen) return
          if (e.key === 'ArrowUp')   { e.preventDefault(); mention.moveUp() }
          else if (e.key === 'ArrowDown') { e.preventDefault(); mention.moveDown() }
          else if (e.key === ' ' || e.key === 'Tab') { e.preventDefault(); mention.accept(value, onChange, true) }
          else if (e.key === 'Escape') mention.dismiss()
        }}
      />
      {mention.isOpen && <TagAutocomplete suggestions={mention.suggestions} selectedIndex={mention.selectedIndex} placement="above" onSelect={s => mention.acceptSuggestion(value, onChange, s, true)} />}
    </div>
  )
}
