import type { TrackerRecord, TrackerRecordValueRow, Avatar } from '../../types'

function formatTrackerValue(v: TrackerRecordValueRow, avatars: Avatar[], use24HourClock: boolean): string {
  if (v.value_boolean !== null) return v.value_boolean ? 'Yes' : 'No'
  if (v.value_avatar_id !== null) {
    const found = avatars.find(a => a.id === v.value_avatar_id)
    return found ? found.name : `#${v.value_avatar_id}`
  }
  if (v.value_number !== null) return String(v.value_number)
  if (v.value_text !== null && v.value_text !== '') {
    if (v.field_type === 'date') {
      const [y, m, d] = v.value_text.split('-').map(Number)
      return new Date(y, m - 1, d).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
    }
    if (v.field_type === 'datetime') {
      const [datePart, timePart] = v.value_text.split('T')
      const [y, mo, d] = datePart.split('-').map(Number)
      const [h, min] = timePart.split(':').map(Number)
      const dt = new Date(y, mo - 1, d, h, min)
      const dateStr = dt.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
      const timeStr = dt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: !use24HourClock })
      return `${dateStr} ${timeStr}`
    }
    return v.value_text
  }
  return '—'
}

export function formatTrackerSummary(record: TrackerRecord, avatars: Avatar[], use24HourClock: boolean): string {
  if (record.values.length === 0) return '(no fields)'
  return record.values
    .map(v => `${v.field_name}: ${formatTrackerValue(v, avatars, use24HourClock)}`)
    .join(' · ')
}

export default function TrackerRecordCard({ record, avatars, use24HourClock }: { record?: TrackerRecord; avatars: Avatar[]; use24HourClock: boolean }) {
  if (!record) return <p className="message-text tracker-record-loading">…</p>
  if (record.values.length === 0) return <p className="message-text tracker-record-empty">(no fields)</p>
  return (
    <div className="tracker-record-card">
      {record.values.map(v => (
        <div key={v.field_id} className="tracker-record-row">
          <span className="tracker-field-name">{v.field_name}</span>
          <span className="tracker-field-value">{formatTrackerValue(v, avatars, use24HourClock)}</span>
        </div>
      ))}
    </div>
  )
}
