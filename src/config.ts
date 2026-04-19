import { AVAILABLE_LOCALES, type StringKey } from './i18n'

export enum ConfigLevel {
  Basic    = 0,
  Normal   = 1,
  Advanced = 2,
  System   = 3,
  Restart  = 4, // setting requires app restart; shown at System+
}

export const CONFIG_LEVEL_LABELS: Record<number, string> = {
  [ConfigLevel.Basic]:    'Basic',
  [ConfigLevel.Normal]:   'Normal',
  [ConfigLevel.Advanced]: 'Advanced',
  [ConfigLevel.System]:   'System',
  [ConfigLevel.Restart]:  'Restart',
}

// ── Shape ────────────────────────────────────────────────────────────────────

export interface AppConfig {
  ui: {
    settingsLevel: number
    hideAfterMinutes: number
    threadedView: boolean
    viewMode: 'normal' | 'compact' | 'log'
    use24HourClock: boolean
    language: string
  }
  db: {
    initialMessageLoad: number
    tagPruneLimit: number
  }
  features: {
    tags: boolean
    mentions: boolean
    showFrontGroup: boolean
    builtinShortcodes: boolean
    skinTone: string
  }
  threads: {
    maxDepth: number
    depthColors: string
  }
  messages: {
    deleteWindowMinutes: number
    editWindowMinutes: number
  }
  security: {
    encryptDatabase: boolean
    rememberPassphrase: boolean
  }
  sync: {
    autoSyncOnStartup: boolean
    autoSyncMinutes: number
  }
}

// ── Registry ─────────────────────────────────────────────────────────────────

export interface ConfigDef {
  path: string
  group: string        // kept for search matching
  groupKey: StringKey
  label: string        // kept for search matching
  labelKey: StringKey
  description?: string // kept for search matching
  descKey?: StringKey
  type: 'number' | 'boolean' | 'select' | 'text'
  level: ConfigLevel
  default: unknown
  options?: { value: unknown; label: string }[]
}

export const REGISTRY: ConfigDef[] = [
  {
    path: 'ui.settingsLevel',
    group: 'UI', groupKey: 'editConfig.groups.ui',
    label: 'Settings detail level', labelKey: 'editConfig.registry.settingsLevel.label',
    description: 'Controls which settings are visible on this page.', descKey: 'editConfig.registry.settingsLevel.desc',
    type: 'select',
    level: ConfigLevel.Basic,
    default: ConfigLevel.Basic,
    options: [
      { value: ConfigLevel.Basic,    label: 'Basic' },
      { value: ConfigLevel.Normal,   label: 'Normal' },
      { value: ConfigLevel.Advanced, label: 'Advanced' },
      { value: ConfigLevel.System,   label: 'System' },
    ],
  },
  {
    path: 'ui.hideAfterMinutes',
    group: 'UI', groupKey: 'editConfig.groups.ui',
    label: 'Hide after inactivity', labelKey: 'editConfig.registry.hideAfterMinutes.label',
    description: 'Minimizes the window after this many minutes of inactivity. 0 = disabled.', descKey: 'editConfig.registry.hideAfterMinutes.desc',
    type: 'number',
    level: ConfigLevel.Basic,
    default: 0,
  },
  {
    path: 'features.tags',
    group: 'Features', groupKey: 'editConfig.groups.features',
    label: 'Tag autocomplete (#)', labelKey: 'editConfig.registry.tags.label',
    description: 'Enable #tag autocomplete and storage in messages.', descKey: 'editConfig.registry.tags.desc',
    type: 'boolean',
    level: ConfigLevel.Normal,
    default: true,
  },
  {
    path: 'features.mentions',
    group: 'Features', groupKey: 'editConfig.groups.features',
    label: 'Avatar mention autocomplete (@)', labelKey: 'editConfig.registry.mentions.label',
    description: 'Enable @name autocomplete for avatars in messages.', descKey: 'editConfig.registry.mentions.desc',
    type: 'boolean',
    level: ConfigLevel.Normal,
    default: true,
  },
  {
    path: 'features.showFrontGroup',
    group: 'Features', groupKey: 'editConfig.groups.features',
    label: 'Show Front group in avatar panel', labelKey: 'editConfig.registry.showFrontGroup.label',
    description: 'Show the Front group with action buttons at the top of the avatar panel.', descKey: 'editConfig.registry.showFrontGroup.desc',
    type: 'boolean',
    level: ConfigLevel.Normal,
    default: true,
  },
  {
    path: 'features.builtinShortcodes',
    group: 'Features', groupKey: 'editConfig.groups.features',
    label: 'Built-in shortcodes', labelKey: 'editConfig.registry.builtinShortcodes.label',
    description: 'When off, only your custom shortcodes from Settings → Edit Shortcodes are active.', descKey: 'editConfig.registry.builtinShortcodes.desc',
    type: 'boolean',
    level: ConfigLevel.Normal,
    default: true,
  },
  {
    path: 'ui.threadedView',
    group: 'UI', groupKey: 'editConfig.groups.ui',
    label: 'Threaded replies', labelKey: 'editConfig.registry.threadedView.label',
    description: 'Show replies indented under their parent message. Off = all messages in time order.', descKey: 'editConfig.registry.threadedView.desc',
    type: 'boolean',
    level: ConfigLevel.Normal,
    default: true,
  },
  {
    path: 'ui.viewMode',
    group: 'UI', groupKey: 'editConfig.groups.ui',
    label: 'Message view', labelKey: 'editConfig.registry.viewMode.label',
    description: 'Normal: standard layout. Compact: tighter spacing. Log: IRC-style name:text with hourly separators.', descKey: 'editConfig.registry.viewMode.desc',
    type: 'select',
    level: ConfigLevel.Normal,
    default: 'log',
    options: [
      { value: 'normal',  label: 'Normal' },
      { value: 'compact', label: 'Compact' },
      { value: 'log',     label: 'Log' },
    ],
  },
  {
    path: 'ui.use24HourClock',
    group: 'UI', groupKey: 'editConfig.groups.ui',
    label: '24-hour clock', labelKey: 'editConfig.registry.use24HourClock.label',
    description: 'Show times in 24-hour format (e.g. 14:30) instead of 12-hour with AM/PM (e.g. 2:30 PM).', descKey: 'editConfig.registry.use24HourClock.desc',
    type: 'boolean',
    level: ConfigLevel.Basic,
    default: false,
  },
  {
    path: 'ui.language',
    group: 'UI', groupKey: 'editConfig.groups.ui',
    label: 'Language', labelKey: 'editConfig.registry.language.label',
    description: 'Interface language. [xx] pseudo-locale wraps all strings in ⟦…⟧ to spot hardcoded text.', descKey: 'editConfig.registry.language.desc',
    type: 'select',
    level: ConfigLevel.Basic,
    default: 'en',
    options: AVAILABLE_LOCALES,
  },
  {
    path: 'threads.maxDepth',
    group: 'Threads', groupKey: 'editConfig.groups.threads',
    label: 'Max reply depth', labelKey: 'editConfig.registry.maxDepth.label',
    description: 'Maximum nesting level for replies. A message at this depth cannot be replied to.', descKey: 'editConfig.registry.maxDepth.desc',
    type: 'number',
    level: ConfigLevel.Advanced,
    default: 5,
  },
  {
    path: 'threads.depthColors',
    group: 'Threads', groupKey: 'editConfig.groups.threads',
    label: 'Depth colors', labelKey: 'editConfig.registry.depthColors.label',
    description: 'Comma-separated hex colors for reply depth levels (depth 1, 2, 3…). Cycles if more levels than colors.', descKey: 'editConfig.registry.depthColors.desc',
    type: 'text',
    level: ConfigLevel.Advanced,
    default: '#89b4fa,#cba6f7,#a6e3a1,#f9e2af,#f38ba8',
  },
  {
    path: 'db.initialMessageLoad',
    group: 'Database', groupKey: 'editConfig.groups.database',
    label: 'Initial message load count', labelKey: 'editConfig.registry.initialMessageLoad.label',
    description: 'Messages loaded when first opening a channel.', descKey: 'editConfig.registry.initialMessageLoad.desc',
    type: 'number',
    level: ConfigLevel.Advanced,
    default: 50,
  },
  {
    path: 'db.tagPruneLimit',
    group: 'Database', groupKey: 'editConfig.groups.database',
    label: 'Tag prune limit', labelKey: 'editConfig.registry.tagPruneLimit.label',
    description: 'Maximum stored tags. Least recently used are dropped beyond this.', descKey: 'editConfig.registry.tagPruneLimit.desc',
    type: 'number',
    level: ConfigLevel.System,
    default: 10000,
  },
  {
    path: 'messages.deleteWindowMinutes',
    group: 'Messages', groupKey: 'editConfig.groups.messages',
    label: 'Delete window (minutes)', labelKey: 'editConfig.registry.deleteWindowMinutes.label',
    description: 'How long after sending a message can be deleted. 0 = never. Max 6000 (~100 hours).', descKey: 'editConfig.registry.deleteWindowMinutes.desc',
    type: 'number',
    level: ConfigLevel.Normal,
    default: 10,
  },
  {
    path: 'messages.editWindowMinutes',
    group: 'Messages', groupKey: 'editConfig.groups.messages',
    label: 'Edit window (minutes)', labelKey: 'editConfig.registry.editWindowMinutes.label',
    description: 'How long after sending a message can be edited. 0 = never. Max 6000 (~100 hours).', descKey: 'editConfig.registry.editWindowMinutes.desc',
    type: 'number',
    level: ConfigLevel.Normal,
    default: 30,
  },
  {
    path: 'sync.autoSyncOnStartup',
    group: 'Sync', groupKey: 'editConfig.groups.sync',
    label: 'Sync on startup', labelKey: 'editConfig.registry.autoSyncOnStartup.label',
    description: 'Automatically sync with all paired devices when the app starts.', descKey: 'editConfig.registry.autoSyncOnStartup.desc',
    type: 'boolean',
    level: ConfigLevel.Normal,
    default: false,
  },
  {
    path: 'sync.autoSyncMinutes',
    group: 'Sync', groupKey: 'editConfig.groups.sync',
    label: 'Auto-sync interval (minutes)', labelKey: 'editConfig.registry.autoSyncMinutes.label',
    description: 'Sync with paired devices every N minutes. 0 = disabled.', descKey: 'editConfig.registry.autoSyncMinutes.desc',
    type: 'number',
    level: ConfigLevel.Normal,
    default: 0,
  },
]

// ── Defaults ─────────────────────────────────────────────────────────────────

export const DEFAULTS: AppConfig = {
  ui:       { settingsLevel: ConfigLevel.Basic, hideAfterMinutes: 0, threadedView: true, viewMode: 'log' as const, use24HourClock: false, language: 'en' },
  db:       { initialMessageLoad: 50, tagPruneLimit: 10000 },
  features: { tags: true, mentions: true, showFrontGroup: true, builtinShortcodes: true, skinTone: '' },
  threads:  { maxDepth: 5, depthColors: '#89b4fa,#cba6f7,#a6e3a1,#f9e2af,#f38ba8' },
  messages: { deleteWindowMinutes: 10, editWindowMinutes: 30 },
  security: { encryptDatabase: false, rememberPassphrase: false },
  sync:     { autoSyncOnStartup: false, autoSyncMinutes: 0 },
}

// ── Storage ───────────────────────────────────────────────────────────────────

const CONFIG_KEY = 'dsj-config'

function mergeConfig(saved?: Partial<AppConfig>): AppConfig {
  const s = saved ?? {}
  return {
    ui:       { ...DEFAULTS.ui,       ...s.ui },
    db:       { ...DEFAULTS.db,       ...s.db },
    features: { ...DEFAULTS.features, ...s.features },
    threads:  { ...DEFAULTS.threads,  ...s.threads },
    messages: { ...DEFAULTS.messages, ...s.messages },
    security: { ...DEFAULTS.security, ...s.security },
    sync:     { ...DEFAULTS.sync,     ...s.sync },
  }
}

export function loadConfig(): AppConfig {
  try {
    const raw = localStorage.getItem(CONFIG_KEY)
    if (!raw) return mergeConfig()
    return mergeConfig(JSON.parse(raw))
  } catch {
    return mergeConfig()
  }
}

export function saveConfig(config: AppConfig): void {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config))
}

// ── Path helpers ──────────────────────────────────────────────────────────────

type ConfigRecord = Record<string, Record<string, unknown>>

export function getConfigValue(config: AppConfig, path: string): unknown {
  const [group, key] = path.split('.')
  return (config as unknown as ConfigRecord)[group]?.[key]
}

export function setConfigValue(config: AppConfig, path: string, value: unknown): AppConfig {
  const [group, key] = path.split('.')
  const c = config as unknown as ConfigRecord
  return { ...config, [group]: { ...c[group], [key]: value } } as AppConfig
}

export function isEntryVisible(entry: ConfigDef, currentLevel: number): boolean {
  if (entry.level === ConfigLevel.Restart) return currentLevel >= ConfigLevel.System
  return entry.level <= currentLevel
}
