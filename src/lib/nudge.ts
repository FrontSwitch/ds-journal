const NUDGE_KEY = 'dsj-nudge'

type NudgeSnoozed = { count: number; nextAt: number }
type NudgeState = null | 'done' | NudgeSnoozed

// Snooze delays in ms: first snooze = 2 days, then 4, 8, 16, then stays at 16.
const SNOOZE_DAYS = [2, 4, 8, 16]

function readState(): NudgeState {
  const raw = localStorage.getItem(NUDGE_KEY)
  if (!raw) return null
  if (raw === 'done') return 'done'
  try { return JSON.parse(raw) as NudgeSnoozed } catch { return null }
}

export function shouldShowNudge(): boolean {
  const s = readState()
  if (s === null) return true
  if (s === 'done') return false
  return Date.now() >= s.nextAt
}

export function snoozeNudge(): void {
  const s = readState()
  const count = s !== null && s !== 'done' ? s.count : 0
  const days = SNOOZE_DAYS[Math.min(count, SNOOZE_DAYS.length - 1)]
  const nextAt = Date.now() + days * 24 * 60 * 60 * 1000
  localStorage.setItem(NUDGE_KEY, JSON.stringify({ count: count + 1, nextAt }))
}

export function dismissNudge(): void {
  localStorage.setItem(NUDGE_KEY, 'done')
}
