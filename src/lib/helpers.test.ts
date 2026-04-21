import { describe, it, expect, beforeEach } from 'vitest'
import { getInitials, getMessageDisplayText } from '../types'
import {
  DEFAULTS, ConfigLevel,
  getConfigValue, setConfigValue, isEntryVisible,
  loadConfig, saveConfig,
} from '../config'
import type { MessageRow } from '../types'
import type { ConfigDef } from '../config'

// ── getInitials ───────────────────────────────────────────────────────────────

describe('getInitials', () => {
  it('returns first letter when unique', () => {
    expect(getInitials('Alex', ['Alex', 'Jamie', 'Sam'])).toBe('A')
  })

  it('returns first two letters when initial is shared', () => {
    expect(getInitials('Alex', ['Alex', 'Ari'])).toBe('AL')
  })

  it('returns first letter for solo name', () => {
    expect(getInitials('River', [])).toBe('R')
  })

  it('handles empty name gracefully', () => {
    expect(getInitials('', [])).toBe('?')
  })

  it('uppercases the result', () => {
    expect(getInitials('alex', ['alex', 'ari'])).toBe('AL')
  })
})

// ── getMessageDisplayText ─────────────────────────────────────────────────────

describe('getMessageDisplayText', () => {
  function baseMsg(overrides: Partial<MessageRow> = {}): MessageRow {
    return {
      id: 1, channel_id: 1, channel_name: 'general',
      text: 'hello world', original_text: null, deleted: 0,
      created_at: '2025-01-01 10:00:00', avatar_id: 1,
      avatar_name: 'Alex', avatar_color: '#89b4fa',
      avatar_image_path: null, avatar_image_data: null, tracker_record_id: null, parent_msg_id: null,
      message_type: 'chat',
      image_path: null, image_caption: null, image_location: null, image_people: null,
      ...overrides,
    }
  }

  it('returns text for normal message', () => {
    expect(getMessageDisplayText(baseMsg())).toBe('hello world')
  })

  it('returns tracker summary for tracker record', () => {
    const m = baseMsg({ tracker_record_id: 42, created_at: '2025-03-15 09:30:00' })
    expect(getMessageDisplayText(m)).toContain('2025-03-15')
    expect(getMessageDisplayText(m)).toContain('Alex')
  })

  it('tracker summary omits avatar when null', () => {
    const m = baseMsg({ tracker_record_id: 42, avatar_name: null, avatar_id: null })
    expect(getMessageDisplayText(m)).not.toContain('null')
    expect(getMessageDisplayText(m)).not.toContain('undefined')
  })
})

// ── Config path helpers ───────────────────────────────────────────────────────

describe('getConfigValue', () => {
  it('reads ui.viewMode', () => {
    expect(getConfigValue(DEFAULTS, 'ui.viewMode')).toBe('log')
  })

  it('reads db.initialMessageLoad', () => {
    expect(getConfigValue(DEFAULTS, 'db.initialMessageLoad')).toBe(50)
  })

  it('reads features.tags', () => {
    expect(getConfigValue(DEFAULTS, 'features.tags')).toBe(true)
  })

  it('returns undefined for unknown path', () => {
    expect(getConfigValue(DEFAULTS, 'ui.nonexistent')).toBeUndefined()
  })
})

describe('setConfigValue', () => {
  it('sets a value without mutating original', () => {
    const updated = setConfigValue(DEFAULTS, 'ui.viewMode', 'compact')
    expect(updated.ui.viewMode).toBe('compact')
    expect(DEFAULTS.ui.viewMode).toBe('log') // original unchanged
  })

  it('sets a numeric value', () => {
    const updated = setConfigValue(DEFAULTS, 'db.initialMessageLoad', 100)
    expect(updated.db.initialMessageLoad).toBe(100)
  })

  it('preserves other keys in same group', () => {
    const updated = setConfigValue(DEFAULTS, 'ui.viewMode', 'log')
    expect(updated.ui.hideAfterMinutes).toBe(DEFAULTS.ui.hideAfterMinutes)
    expect(updated.ui.threadedView).toBe(DEFAULTS.ui.threadedView)
  })
})

// ── isEntryVisible ────────────────────────────────────────────────────────────

describe('isEntryVisible', () => {
  function entry(level: ConfigLevel): ConfigDef {
    return { path: 'x.y', group: 'X', groupKey: 'editConfig.groups.ui', label: 'X', labelKey: 'editConfig.enable', type: 'boolean', level, default: false }
  }

  it('shows Basic entries at Basic level', () => {
    expect(isEntryVisible(entry(ConfigLevel.Basic), ConfigLevel.Basic)).toBe(true)
  })

  it('hides Advanced entries at Basic level', () => {
    expect(isEntryVisible(entry(ConfigLevel.Advanced), ConfigLevel.Basic)).toBe(false)
  })

  it('shows Advanced entries at Advanced level', () => {
    expect(isEntryVisible(entry(ConfigLevel.Advanced), ConfigLevel.Advanced)).toBe(true)
  })

  it('shows Restart entries at System level', () => {
    expect(isEntryVisible(entry(ConfigLevel.Restart), ConfigLevel.System)).toBe(true)
  })

  it('hides Restart entries at Advanced level', () => {
    expect(isEntryVisible(entry(ConfigLevel.Restart), ConfigLevel.Advanced)).toBe(false)
  })
})

// ── loadConfig / saveConfig ───────────────────────────────────────────────────

describe('loadConfig / saveConfig roundtrip', () => {
  beforeEach(() => localStorage.clear())

  it('returns defaults when nothing saved', () => {
    const cfg = loadConfig()
    expect(cfg.ui.viewMode).toBe('log')
    expect(cfg.db.initialMessageLoad).toBe(50)
  })

  it('restores saved values', () => {
    const modified = setConfigValue(DEFAULTS, 'ui.viewMode', 'compact')
    saveConfig(modified)
    const loaded = loadConfig()
    expect(loaded.ui.viewMode).toBe('compact')
  })

  it('fills missing keys with defaults (forward compat)', () => {
    // Simulate a stored config from an older version that lacks 'threads'
    localStorage.setItem('dsj-config', JSON.stringify({ ui: { viewMode: 'log' } }))
    const cfg = loadConfig()
    expect(cfg.ui.viewMode).toBe('log')
    expect(cfg.threads.maxDepth).toBe(DEFAULTS.threads.maxDepth)
  })

  it('returns defaults on corrupt JSON', () => {
    localStorage.setItem('dsj-config', 'not-json{{{')
    const cfg = loadConfig()
    expect(cfg.ui.viewMode).toBe('log')
  })
})
