import { useEffect, useRef, useState } from 'react'
import { useDebugStore, type DbEntry, type LogLevel, LOG_LEVELS, logLevelIndex } from '../../store/debug'
import { runCommand } from './commands'
import './DebugPanel.css'

interface Stats {
  count: number
  avg:   number
  min:   number
  max:   number
  total: number
}

function computeStats(calls: DbEntry[]): Stats {
  const cutoff = Date.now() - 60_000
  const win = calls.filter(c => c.ts >= cutoff)
  if (win.length === 0) return { count: 0, avg: 0, min: 0, max: 0, total: calls.length }
  const ms = win.map(c => c.ms)
  return {
    count: win.length,
    avg:   Math.round(ms.reduce((a, b) => a + b, 0) / ms.length),
    min:   Math.min(...ms),
    max:   Math.max(...ms),
    total: calls.length,
  }
}

function msColor(ms: number) {
  if (ms < 10) return '#a6e3a1'
  if (ms < 50) return '#f9e2af'
  return '#f38ba8'
}

function fmtTime(ts: number) {
  const d = new Date(ts)
  const p = (n: number, w = 2) => String(n).padStart(w, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`
}

const LEVEL_COLOR: Record<LogLevel, string> = {
  debug: '#89dceb',
  info:  '#89b4fa',
  warn:  '#f9e2af',
  error: '#f38ba8',
}

const LEVEL_SYMBOL: Record<LogLevel, string> = {
  debug: '◆',
  info:  '●',
  warn:  '▲',
  error: '✕',
}

type Row =
  | { kind: 'db';  ts: number; label: string; ms: number }
  | { kind: 'log'; ts: number; msg: string; level: LogLevel }

export default function DebugPanel({ onClose }: { onClose: () => void }) {
  const { dbCalls, logs } = useDebugStore()
  const [stats, setStats] = useState<Stats>(() => computeStats(dbCalls))
  const bodyRef = useRef<HTMLDivElement>(null)
  const [pinned, setPinned] = useState(true)
  const [filterLevel, setFilterLevel] = useState<LogLevel>('debug')
  const [cmdInput, setCmdInput] = useState('')
  const [cmdOutput, setCmdOutput] = useState('')
  const cmdRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const id = setInterval(() => setStats(computeStats(useDebugStore.getState().dbCalls)), 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => { setStats(computeStats(dbCalls)) }, [dbCalls])

  useEffect(() => {
    if (pinned && bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight
    }
  }, [dbCalls, logs, pinned])

  const filterIdx = logLevelIndex(filterLevel)

  const rows: Row[] = [
    ...dbCalls.map(e => ({ kind: 'db'  as const, ts: e.ts, label: e.label, ms: e.ms })),
    ...logs
      .filter(e => logLevelIndex(e.level) >= filterIdx)
      .map(e => ({ kind: 'log' as const, ts: e.ts, msg: e.msg, level: e.level })),
  ].sort((a, b) => a.ts - b.ts).slice(-150)

  // hide db rows when filter is above debug
  const visibleRows = filterIdx > 0
    ? rows.filter(r => r.kind !== 'db')
    : rows

  const maxMs = Math.max(...dbCalls.map(c => c.ms), 1)

  function cycleLevel() {
    const next = LOG_LEVELS[(logLevelIndex(filterLevel) + 1) % LOG_LEVELS.length]
    setFilterLevel(next)
  }

  async function handleCmd(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return
    const input = cmdInput.trim()
    if (!input) return
    setCmdOutput('…')
    setCmdInput('')
    const result = await runCommand(input)
    setCmdOutput(result)
  }

  return (
    <div className="debug-panel">
      <div className="debug-header">
        <span className="debug-title">Debug</span>
        <div className="debug-stats">
          <span className="debug-stat">
            <span className="debug-stat-label">1m</span>{stats.count}
          </span>
          <span className="debug-stat">
            <span className="debug-stat-label">avg</span>{stats.avg}ms
          </span>
          <span className="debug-stat">
            <span className="debug-stat-label">min</span>{stats.min}ms
          </span>
          <span className="debug-stat" style={{ color: stats.max > 0 ? msColor(stats.max) : undefined }}>
            <span className="debug-stat-label">max</span>{stats.max}ms
          </span>
          <span className="debug-stat debug-stat-dim">
            <span className="debug-stat-label">∑</span>{stats.total}
          </span>
        </div>
        <div className="debug-header-btns">
          <button
            className="debug-level-btn"
            style={{ color: LEVEL_COLOR[filterLevel] }}
            title="Cycle log level filter"
            onClick={cycleLevel}
          >{filterLevel === 'error' ? 'error only' : `${filterLevel}+`}</button>
          <button
            className={`debug-pin${pinned ? ' active' : ''}`}
            title="Follow tail"
            onClick={() => setPinned(p => !p)}
          >↓</button>
          <button className="debug-close" onClick={onClose}>✕</button>
        </div>
      </div>

      <div
        className="debug-body"
        ref={bodyRef}
        onScroll={e => {
          const el = e.currentTarget
          setPinned(el.scrollTop + el.clientHeight >= el.scrollHeight - 4)
        }}
      >
        {visibleRows.map((row, i) =>
          row.kind === 'db' ? (
            <div key={i} className="debug-row">
              <span className="debug-ts">{fmtTime(row.ts)}</span>
              <span className="debug-label">{row.label}</span>
              <span className="debug-bar-wrap">
                <span
                  className="debug-bar"
                  style={{
                    width:      `${Math.max(2, (row.ms / maxMs) * 64)}px`,
                    background: msColor(row.ms),
                  }}
                />
              </span>
              <span className="debug-ms" style={{ color: msColor(row.ms) }}>
                {row.ms}ms
              </span>
            </div>
          ) : (
            <div key={i} className="debug-row debug-row-log">
              <span className="debug-ts">{fmtTime(row.ts)}</span>
              <span className="debug-log-symbol" style={{ color: LEVEL_COLOR[row.level] }}>
                {LEVEL_SYMBOL[row.level]}
              </span>
              <span className="debug-log-msg" style={{ color: LEVEL_COLOR[row.level] }}>
                {row.msg}
              </span>
            </div>
          )
        )}
        {visibleRows.length === 0 && <div className="debug-empty">No data yet.</div>}
      </div>

      <div className="debug-cmd-area">
        {cmdOutput && <div className="debug-cmd-output">{cmdOutput}</div>}
        <div className="debug-cmd-row">
          <span className="debug-cmd-prompt">&gt;</span>
          <input
            ref={cmdRef}
            className="debug-cmd-input"
            value={cmdInput}
            onChange={e => setCmdInput(e.target.value)}
            onKeyDown={handleCmd}
            placeholder="create_message 100 #channel [no_reply|reply]"
            spellCheck={false}
            autoComplete="off"
          />
        </div>
      </div>
    </div>
  )
}
