import { describe, it, expect, beforeEach, vi } from 'vitest'
import { shouldShowNudge, snoozeNudge, dismissNudge } from './nudge'

const NUDGE_KEY = 'dsj-nudge'
const DAY_MS = 24 * 60 * 60 * 1000

beforeEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

// ── shouldShowNudge ───────────────────────────────────────────────────────────

describe('shouldShowNudge', () => {
  it('returns true when never shown (no localStorage entry)', () => {
    expect(shouldShowNudge()).toBe(true)
  })

  it('returns false when dismissed', () => {
    localStorage.setItem(NUDGE_KEY, 'done')
    expect(shouldShowNudge()).toBe(false)
  })

  it('returns false when snoozed with future nextAt', () => {
    const state = { count: 1, nextAt: Date.now() + DAY_MS }
    localStorage.setItem(NUDGE_KEY, JSON.stringify(state))
    expect(shouldShowNudge()).toBe(false)
  })

  it('returns true when snooze has expired', () => {
    const state = { count: 1, nextAt: Date.now() - 1 }
    localStorage.setItem(NUDGE_KEY, JSON.stringify(state))
    expect(shouldShowNudge()).toBe(true)
  })

  it('returns true when snooze expires exactly now', () => {
    const now = Date.now()
    vi.spyOn(Date, 'now').mockReturnValue(now)
    const state = { count: 1, nextAt: now }
    localStorage.setItem(NUDGE_KEY, JSON.stringify(state))
    expect(shouldShowNudge()).toBe(true)
  })

  it('returns true on corrupt localStorage value', () => {
    localStorage.setItem(NUDGE_KEY, '{bad json}}}')
    expect(shouldShowNudge()).toBe(true)
  })
})

// ── snoozeNudge ───────────────────────────────────────────────────────────────

describe('snoozeNudge', () => {
  it('first snooze uses 2-day delay', () => {
    const now = Date.now()
    vi.spyOn(Date, 'now').mockReturnValue(now)
    snoozeNudge()
    const state = JSON.parse(localStorage.getItem(NUDGE_KEY)!)
    expect(state.count).toBe(1)
    expect(state.nextAt).toBe(now + 2 * DAY_MS)
  })

  it('second snooze uses 4-day delay', () => {
    localStorage.setItem(NUDGE_KEY, JSON.stringify({ count: 1, nextAt: 0 }))
    const now = Date.now()
    vi.spyOn(Date, 'now').mockReturnValue(now)
    snoozeNudge()
    const state = JSON.parse(localStorage.getItem(NUDGE_KEY)!)
    expect(state.count).toBe(2)
    expect(state.nextAt).toBe(now + 4 * DAY_MS)
  })

  it('third snooze uses 8-day delay', () => {
    localStorage.setItem(NUDGE_KEY, JSON.stringify({ count: 2, nextAt: 0 }))
    const now = Date.now()
    vi.spyOn(Date, 'now').mockReturnValue(now)
    snoozeNudge()
    const state = JSON.parse(localStorage.getItem(NUDGE_KEY)!)
    expect(state.count).toBe(3)
    expect(state.nextAt).toBe(now + 8 * DAY_MS)
  })

  it('fourth snooze uses 16-day delay', () => {
    localStorage.setItem(NUDGE_KEY, JSON.stringify({ count: 3, nextAt: 0 }))
    const now = Date.now()
    vi.spyOn(Date, 'now').mockReturnValue(now)
    snoozeNudge()
    const state = JSON.parse(localStorage.getItem(NUDGE_KEY)!)
    expect(state.count).toBe(4)
    expect(state.nextAt).toBe(now + 16 * DAY_MS)
  })

  it('caps at 16-day delay after max snoozes', () => {
    localStorage.setItem(NUDGE_KEY, JSON.stringify({ count: 10, nextAt: 0 }))
    const now = Date.now()
    vi.spyOn(Date, 'now').mockReturnValue(now)
    snoozeNudge()
    const state = JSON.parse(localStorage.getItem(NUDGE_KEY)!)
    expect(state.nextAt).toBe(now + 16 * DAY_MS)
  })

  it('snooze after dismiss resets count to 0', () => {
    // "done" state → count treated as 0 → first snooze = 2 days
    localStorage.setItem(NUDGE_KEY, 'done')
    const now = Date.now()
    vi.spyOn(Date, 'now').mockReturnValue(now)
    snoozeNudge()
    const state = JSON.parse(localStorage.getItem(NUDGE_KEY)!)
    expect(state.count).toBe(1)
    expect(state.nextAt).toBe(now + 2 * DAY_MS)
  })
})

// ── dismissNudge ──────────────────────────────────────────────────────────────

describe('dismissNudge', () => {
  it('sets state to done', () => {
    dismissNudge()
    expect(localStorage.getItem(NUDGE_KEY)).toBe('done')
  })

  it('done state is not shown again', () => {
    dismissNudge()
    expect(shouldShowNudge()).toBe(false)
  })

  it('overrides a snoozed state', () => {
    snoozeNudge()
    dismissNudge()
    expect(shouldShowNudge()).toBe(false)
    expect(localStorage.getItem(NUDGE_KEY)).toBe('done')
  })
})
