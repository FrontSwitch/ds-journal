import { useState, useEffect } from 'react'
import type { Tracker, TrackerField, TrackerRecord, Avatar } from '../../types'
import { getRecordsSince, getRecordCounts } from '../../db/trackers'
import { t } from '../../i18n'
import { toSqlDatetime } from '../../lib/dateUtils'
import './TrackerReport.css'

type Period = '1d' | '7d' | '14d' | '1mo' | '1yr'

const PERIODS: { key: Period; labelKey: Parameters<typeof t>[0]; days: number }[] = [
  { key: '1d',  labelKey: 'trackerReport.filter1d',  days: 1 },
  { key: '7d',  labelKey: 'trackerReport.filter7d',  days: 7 },
  { key: '14d', labelKey: 'trackerReport.filter14d', days: 14 },
  { key: '1mo', labelKey: 'trackerReport.filter1mo', days: 30 },
  { key: '1yr', labelKey: 'trackerReport.filter1yr', days: 365 },
]

function sinceDate(days: number): string {
  return toSqlDatetime(new Date(Date.now() - days * 86400000))
}

function formatDate(iso: string, use24h: boolean): string {
  const d = new Date(iso + 'Z')
  const date = d.toLocaleDateString([], { month: 'short', day: 'numeric' })
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: !use24h })
  return `${date} ${time}`
}

function computeSummary(op: string, records: TrackerRecord[], fieldId: number): string {
  if (op === 'none') return ''
  const nums: number[] = []
  const bools: number[] = []
  for (const rec of records) {
    const v = rec.values.find(v => v.field_id === fieldId)
    if (!v) continue
    if (v.value_number != null) nums.push(v.value_number)
    if (v.value_boolean != null) bools.push(v.value_boolean)
  }
  if (op === 'count_true')  return String(bools.filter(b => b).length)
  if (op === 'count_false') return String(bools.filter(b => !b).length)
  const values = nums.length > 0 ? nums : bools
  if (values.length === 0) return '—'
  if (op === 'sum')     return String(values.reduce((a, b) => a + b, 0))
  if (op === 'average') return (values.reduce((a, b) => a + b, 0) / values.length).toFixed(2)
  if (op === 'min')     return String(Math.min(...values))
  if (op === 'max')     return String(Math.max(...values))
  return ''
}

function formatCellValue(rec: TrackerRecord, field: TrackerField, avatars: Avatar[], use24h: boolean): string {
  const v = rec.values.find(v => v.field_id === field.id)
  if (!v) return '—'
  if (v.value_boolean != null) return v.value_boolean ? 'Yes' : 'No'
  if (v.value_avatar_id != null) {
    const av = avatars.find(a => a.id === v.value_avatar_id)
    return av?.name ?? String(v.value_avatar_id)
  }
  if (v.value_number != null) {
    if (field.field_type === 'date') {
      return new Date(v.value_number * 1000).toLocaleDateString()
    }
    if (field.field_type === 'datetime') {
      const d = new Date(v.value_number * 1000)
      return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: !use24h })
    }
    return String(v.value_number)
  }
  return v.value_text ?? '—'
}

interface Props {
  tracker: Tracker
  fields: TrackerField[]
  avatars: Avatar[]
  use24HourClock: boolean
  onClose: () => void
}

export default function TrackerReport({ tracker, fields, avatars, use24HourClock, onClose }: Props) {
  const [period, setPeriod] = useState<Period>('7d')
  const [showAvatar, setShowAvatar] = useState(true)
  const [records, setRecords] = useState<TrackerRecord[]>([])
  const [counts, setCounts] = useState({ total: 0, week: 0, month: 0, year: 0 })

  useEffect(() => {
    getRecordCounts(tracker.id).then(setCounts)
  }, [tracker.id])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  useEffect(() => {
    const p = PERIODS.find(p => p.key === period)!
    getRecordsSince(tracker.id, sinceDate(p.days)).then(setRecords)
  }, [tracker.id, period])

  const hasSummary = fields.some(f => f.summary_op && f.summary_op !== 'none')

  return (
    <div className="tracker-report-overlay">
      <div className="tracker-report tracker-report-printable">
        {/* Header */}
        <div className="tracker-report-header no-print">
          <span className="tracker-report-title">{t('trackerReport.title', { name: tracker.name })}</span>
          <div className="tracker-report-controls">
            <div className="tracker-report-periods">
              {PERIODS.map(p => (
                <button
                  key={p.key}
                  className={`report-period-btn${period === p.key ? ' active' : ''}`}
                  onClick={() => setPeriod(p.key)}
                >{t(p.labelKey)}</button>
              ))}
            </div>
            <label className="report-avatar-toggle">
              <input type="checkbox" checked={showAvatar} onChange={e => setShowAvatar(e.target.checked)} />
              {t('trackerReport.showAvatar')}
            </label>
            <button className="report-print-btn" onClick={() => window.print()}>
              {t('trackerReport.print')}
            </button>
            <button className="report-close-btn" onClick={onClose}>{t('trackerReport.close')}</button>
          </div>
        </div>

        {/* Stats bar */}
        <div className="tracker-report-stats no-print">
          <span>{t('trackerReport.statsWeek',  { n: String(counts.week) })}</span>
          <span>{t('trackerReport.statsMonth', { n: String(counts.month) })}</span>
          <span>{t('trackerReport.statsYear',  { n: String(counts.year) })}</span>
          <span>{t('trackerReport.statsTotal', { n: String(counts.total) })}</span>
        </div>

        {/* Print header (visible only when printing) */}
        <div className="print-only tracker-report-print-title">{tracker.name}</div>

        {/* Table */}
        {records.length === 0 ? (
          <p className="tracker-report-empty">{t('trackerReport.noRecords')}</p>
        ) : (
          <div className="tracker-report-table-wrap">
            <table className="tracker-report-table">
              <thead>
                <tr>
                  <th>{t('trackerReport.colDate')}</th>
                  {showAvatar && <th>{t('trackerReport.colAvatar')}</th>}
                  {fields.map(f => <th key={f.id}>{f.name}</th>)}
                </tr>
              </thead>
              <tbody>
                {records.map(rec => {
                  const av = rec.avatar_id != null ? avatars.find(a => a.id === rec.avatar_id) : null
                  return (
                    <tr key={rec.id}>
                      <td className="report-date-cell">{formatDate(rec.created_at, use24HourClock)}</td>
                      {showAvatar && (
                        <td className="report-avatar-cell">
                          {av ? (
                            <span className="report-avatar-dot" style={{ background: av.color }} />
                          ) : null}
                          {av?.name ?? '—'}
                        </td>
                      )}
                      {fields.map(f => (
                        <td key={f.id}>{formatCellValue(rec, f, avatars, use24HourClock)}</td>
                      ))}
                    </tr>
                  )
                })}
              </tbody>
              {hasSummary && (
                <tfoot>
                  <tr className="report-summary-row">
                    <td><strong>{t('trackerReport.summaryRow')}</strong></td>
                    {showAvatar && <td />}
                    {fields.map(f => (
                      <td key={f.id}>
                        <strong>{computeSummary(f.summary_op ?? 'none', records, f.id)}</strong>
                      </td>
                    ))}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
