import { useState, useEffect, useRef } from 'react'
import type { FrontLogConfig, FrontSession } from '../../types'
import { getFrontSessions } from '../../db/front-log'
import { t } from '../../i18n'
import { toSqlDatetime, toIsoDate } from '../../lib/dateUtils'
import './FrontLogReport.css'

interface Props {
  config: FrontLogConfig
  onClose: () => void
}

type Period = '1d' | '7d' | '14d' | '1mo' | '1yr' | 'custom'

function getPeriods(): { key: Period; label: string }[] {
  return [
    { key: '1d',     label: t('frontLogReport.period1d') },
    { key: '7d',     label: t('frontLogReport.period7d') },
    { key: '14d',    label: t('frontLogReport.period14d') },
    { key: '1mo',    label: t('frontLogReport.period1mo') },
    { key: '1yr',    label: t('frontLogReport.period1yr') },
    { key: 'custom', label: t('frontLogReport.periodCustom') },
  ]
}

const ROW_H  = 32
const BAR_H  = 18
const BAR_Y  = (ROW_H - BAR_H) / 2
const AXIS_H = 28
const CHART_W = 1000   // SVG coordinate units
const MIN_BAR_W = 6

interface ProcessedSession {
  id: number
  effectiveStart: Date
  effectiveEnd: Date
  isOpen: boolean
  durationMs: number
  raw: FrontSession
}

interface AvatarRow {
  avatarId: number | null
  name: string
  color: string
  totalMs: number
  sessions: ProcessedSession[]
}

interface TooltipState {
  label: string
  x: number
  y: number
}

function formatDuration(ms: number): string {
  if (ms < 60_000) return '< 1m'
  const mins = Math.floor(ms / 60_000)
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  const remMins = mins % 60
  if (hours < 24) return remMins > 0 ? `${hours}h ${remMins}m` : `${hours}h`
  const days = Math.floor(hours / 24)
  const remHours = hours % 24
  return remHours > 0 ? `${days}d ${remHours}h` : `${days}d`
}

function formatAxisTick(d: Date, period: Period): string {
  if (period === '1d')  return d.toLocaleTimeString([], { hour: 'numeric' })
  if (period === '1yr') return d.toLocaleDateString([], { month: 'short' })
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function getAxisTicks(from: Date, to: Date, period: Period): Date[] {
  const ticks: Date[] = []
  const cur = new Date(from)

  if (period === '1d') {
    cur.setMinutes(0, 0, 0)
    cur.setHours(cur.getHours() + 1)
    const step = 4
    while (cur < to) {
      if (cur.getHours() % step === 0) ticks.push(new Date(cur))
      cur.setHours(cur.getHours() + 1)
    }
  } else if (period === '7d' || period === '14d') {
    cur.setHours(0, 0, 0, 0)
    cur.setDate(cur.getDate() + 1)
    const step = period === '14d' ? 2 : 1
    while (cur <= to) {
      ticks.push(new Date(cur))
      cur.setDate(cur.getDate() + step)
    }
  } else if (period === '1mo') {
    cur.setHours(0, 0, 0, 0)
    cur.setDate(cur.getDate() + 1)
    while (cur <= to) {
      if (cur.getDate() % 5 === 1) ticks.push(new Date(cur))
      cur.setDate(cur.getDate() + 1)
    }
  } else {
    // 1yr or custom: monthly
    cur.setDate(1)
    cur.setHours(0, 0, 0, 0)
    cur.setMonth(cur.getMonth() + 1)
    while (cur <= to) {
      ticks.push(new Date(cur))
      cur.setMonth(cur.getMonth() + 1)
    }
  }
  return ticks
}

function todayISO(): string {
  return toIsoDate(new Date())
}

function daysAgoISO(n: number): string {
  return toIsoDate(new Date(Date.now() - n * 24 * 3600_000))
}

function getRange(period: Period, customFrom: string, customTo: string): [Date, Date] {
  const now = new Date()
  if (period === 'custom') {
    const from = customFrom ? new Date(customFrom) : new Date(now.getTime() - 30 * 24 * 3600_000)
    const to   = customTo   ? new Date(customTo + 'T23:59:59') : now
    return [from, to]
  }
  const days: Record<string, number> = { '1d': 1, '7d': 7, '14d': 14, '1mo': 30, '1yr': 365 }
  return [new Date(now.getTime() - days[period] * 24 * 3600_000), now]
}

function tooltipLabel(s: ProcessedSession, row: AvatarRow): string {
  const fmt = (d: Date) =>
    d.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  const end = s.isOpen ? t('frontLogReport.now') : fmt(s.effectiveEnd)
  return `${row.name} · ${formatDuration(s.durationMs)} · ${fmt(s.effectiveStart)} – ${end}`
}

export default function FrontLogReport({ config: _, onClose }: Props) {
  const [period, setPeriod]         = useState<Period>('7d')
  const [customFrom, setCustomFrom] = useState(daysAgoISO(30))
  const [customTo,   setCustomTo]   = useState(todayISO())
  const [rows, setRows]             = useState<AvatarRow[]>([])
  const [tooltip, setTooltip]       = useState<TooltipState | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose])

  useEffect(() => { load() }, [period, customFrom, customTo])

  async function load() {
    const [from, to] = getRange(period, customFrom, customTo)
    const sinceUTC = toSqlDatetime(from)
    const all = await getFrontSessions(sinceUTC)
    const now = new Date()

    const filtered = all.filter(s => {
      const start = new Date(s.entered_at + 'Z')
      const end   = s.exited_at ? new Date(s.exited_at + 'Z') : now
      return start <= to && end >= from
    })

    const byAvatar = new Map<string, ProcessedSession[]>()
    for (const s of filtered) {
      const key = String(s.avatar_id ?? 'anon')
      const eStart = new Date(Math.max(new Date(s.entered_at + 'Z').getTime(), from.getTime()))
      const eEnd   = new Date(Math.min(
        s.exited_at ? new Date(s.exited_at + 'Z').getTime() : now.getTime(),
        to.getTime()
      ))
      const proc: ProcessedSession = {
        id: s.id,
        effectiveStart: eStart,
        effectiveEnd:   eEnd,
        isOpen:         !s.exited_at,
        durationMs:     Math.max(0, eEnd.getTime() - eStart.getTime()),
        raw: s,
      }
      if (!byAvatar.has(key)) byAvatar.set(key, [])
      byAvatar.get(key)!.push(proc)
    }

    const result: AvatarRow[] = []
    for (const [, sessions] of byAvatar) {
      const first = sessions[0].raw
      result.push({
        avatarId: first.avatar_id,
        name:     first.avatar_name ?? t('frontLogReport.anonymous'),
        color:    first.avatar_color ?? '#888888',
        totalMs:  sessions.reduce((s, p) => s + p.durationMs, 0),
        sessions,
      })
    }
    result.sort((a, b) => b.totalMs - a.totalMs)
    setRows(result)
  }

  const [rangeFrom, rangeTo] = getRange(period, customFrom, customTo)
  const rangeSpan = rangeTo.getTime() - rangeFrom.getTime()
  const ticks = getAxisTicks(rangeFrom, rangeTo, period)
  const rangeIncludesNow = rangeTo >= new Date()

  function xPct(d: Date): number {
    return ((d.getTime() - rangeFrom.getTime()) / rangeSpan) * 100
  }

  function wPct(s: ProcessedSession): number {
    return (s.durationMs / rangeSpan) * 100
  }

  // Min bar width as a % of CHART_W, so we can check before rendering
  const minWPct = (MIN_BAR_W / CHART_W) * 100

  function handleBarMove(e: React.MouseEvent, s: ProcessedSession, row: AvatarRow) {
    setTooltip({ label: tooltipLabel(s, row), x: e.clientX, y: e.clientY })
  }

  const svgH = rows.length * ROW_H
  const periods = getPeriods()

  return (
    <div className="front-log-report">
      <div className="front-log-report-header">
        <span className="front-log-report-title">{t('frontLogReport.title')}</span>
        <button className="front-log-report-close" onClick={onClose}>✕</button>
      </div>

      <div className="front-log-period-bar">
        {periods.map(p => (
          <button
            key={p.key}
            className={`front-log-period-tab${period === p.key ? ' active' : ''}`}
            onClick={() => setPeriod(p.key)}
          >{p.label}</button>
        ))}
      </div>

      {period === 'custom' && (
        <div className="front-log-custom-range">
          <input type="date" value={customFrom} max={customTo} onChange={e => setCustomFrom(e.target.value)} />
          <span>{t('frontLogReport.to')}</span>
          <input type="date" value={customTo}   min={customFrom} max={todayISO()} onChange={e => setCustomTo(e.target.value)} />
        </div>
      )}

      <div className="front-log-chart-wrap" ref={wrapRef} onMouseLeave={() => setTooltip(null)}>
        {rows.length === 0 ? (
          <p className="front-log-empty">{t('frontLogReport.noSessions')}</p>
        ) : (
          <div className="front-log-chart">

            {/* Name column */}
            <div className="flc-names">
              {rows.map(row => (
                <div key={String(row.avatarId)} className="flc-name-cell">
                  <span className="flc-dot" style={{ background: row.color }} />
                  <span className="flc-name-text">{row.name}</span>
                </div>
              ))}
              <div className="flc-axis-spacer" />
            </div>

            {/* Chart + axis */}
            <div className="flc-middle">
              {/* Bars SVG */}
              <div className="flc-svg-wrap">
                <svg
                  width="100%"
                  height={svgH}
                  viewBox={`0 0 ${CHART_W} ${svgH}`}
                  preserveAspectRatio="none"
                >
                  {/* Grid lines */}
                  {ticks.map((tick, i) => {
                    const x = (xPct(tick) / 100) * CHART_W
                    return (
                      <line key={i} x1={x} y1={0} x2={x} y2={svgH}
                        stroke="var(--border)" strokeWidth={1} />
                    )
                  })}

                  {/* Bars */}
                  {rows.map((row, ri) => {
                    const y = ri * ROW_H
                    return (
                      <g key={String(row.avatarId)}>
                        {row.sessions.map(s => {
                          const xp  = xPct(s.effectiveStart)
                          const wp  = Math.max(minWPct, wPct(s))
                          const x   = (xp  / 100) * CHART_W
                          const w   = (wp  / 100) * CHART_W
                          return (
                            <g key={s.id}
                              onMouseMove={e => handleBarMove(e, s, row)}
                              onMouseLeave={() => setTooltip(null)}
                            >
                              <rect
                                x={x} y={y + BAR_Y} width={w} height={BAR_H}
                                fill={row.color} rx={3} opacity={0.8}
                                style={{ cursor: 'default' }}
                              />
                              {s.isOpen && (
                                <rect
                                  x={x + w - 8} y={y + BAR_Y} width={8} height={BAR_H}
                                  fill={row.color} rx={3}
                                  className="flc-pulse"
                                />
                              )}
                            </g>
                          )
                        })}
                      </g>
                    )
                  })}

                  {/* Now line */}
                  {rangeIncludesNow && (
                    <line
                      x1={CHART_W} y1={0} x2={CHART_W} y2={svgH}
                      stroke="var(--accent)" strokeWidth={2}
                      strokeDasharray="4 3" opacity={0.5}
                    />
                  )}
                </svg>
              </div>

              {/* X axis labels */}
              <div className="flc-axis" style={{ height: AXIS_H }}>
                {ticks.map((tick, i) => (
                  <span key={i} className="flc-tick" style={{ left: `${xPct(tick)}%` }}>
                    {formatAxisTick(tick, period)}
                  </span>
                ))}
              </div>
            </div>

            {/* Duration column */}
            <div className="flc-durations">
              {rows.map(row => (
                <div key={String(row.avatarId)} className="flc-dur-cell">
                  {formatDuration(row.totalMs)}
                </div>
              ))}
              <div className="flc-axis-spacer" />
            </div>

            {/* Tooltip */}
            {tooltip && (
              <div className="flc-tooltip" style={{ left: tooltip.x + 14, top: tooltip.y - 10 }}>
                {tooltip.label}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
