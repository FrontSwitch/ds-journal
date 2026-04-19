import { create } from 'zustand'
import { ALL_MESSAGES_ID } from '../types'
import type { FrontSession, ScratchMessage } from '../types'
import { loadConfig, saveConfig, type AppConfig } from '../config'

export type AvatarPanelMode = 'full' | 'small' | 'hidden'

const AVATAR_PANEL_MODE_KEY = 'avatar-panel-mode'
const SELECTED_CHANNEL_KEY = 'selected-channel-id'
const RECOVERY_PENDING_KEY = 'dsj-recovery-pending'

function loadMode(): AvatarPanelMode {
  const v = localStorage.getItem(AVATAR_PANEL_MODE_KEY)
  if (v === 'full' || v === 'small' || v === 'hidden') return v
  return 'small'
}

function saveMode(mode: AvatarPanelMode) {
  localStorage.setItem(AVATAR_PANEL_MODE_KEY, mode)
}

function loadSelectedChannel(): number | null {
  const v = localStorage.getItem(SELECTED_CHANNEL_KEY)
  return v !== null ? Number(v) : null
}

function saveSelectedChannel(id: number | null) {
  if (id === null) localStorage.removeItem(SELECTED_CHANNEL_KEY)
  else localStorage.setItem(SELECTED_CHANNEL_KEY, String(id))
}

interface AppState {
  selectedChannelId: number | null
  selectedAvatarId: number | null
  avatarFilter: number | null  // only used when in All Messages channel
  showSettings: boolean
  showDebug: boolean
  avatarPanelMode: AvatarPanelMode
  config: AppConfig
  pendingEditAvatarId: number | null
  pendingSettingsPage: string | null
  pendingOpenAvatarId: number | null      // open info popup (info view)
  pendingNewNoteAvatarId: number | null   // open info popup (new note view)
  currentFront: FrontSession[]
  scratchMessages: ScratchMessage[]
  nudgeCheckRequest: number               // increment to trigger a nudge check in App
  pendingRecoveryCode: string | null      // persists to localStorage until acknowledged
  setSelectedChannel: (id: number | null) => void
  setSelectedAvatar: (id: number | null) => void
  setAvatarFilter: (id: number | null) => void
  setShowSettings: (show: boolean) => void
  setShowDebug: (show: boolean) => void
  setAvatarPanelMode: (mode: AvatarPanelMode) => void
  cycleAvatarPanelMode: () => void
  setConfig: (config: AppConfig) => void
  setPendingEditAvatarId: (id: number | null) => void
  setPendingSettingsPage: (page: string | null) => void
  setPendingOpenAvatarId: (id: number | null) => void
  setPendingNewNoteAvatarId: (id: number | null) => void
  setCurrentFront: (sessions: FrontSession[]) => void
  addScratchMessage: (msg: Omit<ScratchMessage, 'id'>) => void
  clearScratch: () => void
  requestNudgeCheck: () => void
  setPendingRecoveryCode: (code: string | null) => void
}

let scratchSeq = 0

export const useAppStore = create<AppState>((set, get) => ({
  selectedChannelId: loadSelectedChannel(),
  selectedAvatarId: null,
  avatarFilter: null,
  showSettings: false,
  showDebug: false,
  avatarPanelMode: loadMode(),
  config: loadConfig(),
  pendingEditAvatarId: null,
  pendingSettingsPage: null,
  pendingOpenAvatarId: null,
  pendingNewNoteAvatarId: null,
  currentFront: [],
  scratchMessages: [],
  nudgeCheckRequest: 0,
  pendingRecoveryCode: localStorage.getItem(RECOVERY_PENDING_KEY) ?? null,

  setSelectedChannel: (id) => {
    saveSelectedChannel(id)
    const prev = get().selectedChannelId
    if (prev === ALL_MESSAGES_ID && id !== ALL_MESSAGES_ID) {
      set({ selectedChannelId: id, avatarFilter: null })
    } else {
      set({ selectedChannelId: id })
    }
  },

  setSelectedAvatar: (id) => set({ selectedAvatarId: id }),
  setAvatarFilter: (id) => set({ avatarFilter: id }),
  setShowSettings: (show) => set({ showSettings: show }),
  setShowDebug: (show) => set({ showDebug: show }),

  setAvatarPanelMode: (mode) => { saveMode(mode); set({ avatarPanelMode: mode }) },

  setConfig: (config) => { saveConfig(config); set({ config }) },
  setPendingEditAvatarId: (id) => set({ pendingEditAvatarId: id }),
  setPendingSettingsPage: (page) => set({ pendingSettingsPage: page }),
  setPendingOpenAvatarId: (id) => set({ pendingOpenAvatarId: id }),
  setPendingNewNoteAvatarId: (id) => set({ pendingNewNoteAvatarId: id }),
  setCurrentFront: (sessions) => set({ currentFront: sessions }),

  addScratchMessage: (msg) => set(s => ({
    scratchMessages: [...s.scratchMessages, { ...msg, id: ++scratchSeq }]
  })),
  clearScratch: () => set({ scratchMessages: [] }),
  requestNudgeCheck: () => set(s => ({ nudgeCheckRequest: s.nudgeCheckRequest + 1 })),

  setPendingRecoveryCode: (code) => {
    if (code) localStorage.setItem(RECOVERY_PENDING_KEY, code)
    else localStorage.removeItem(RECOVERY_PENDING_KEY)
    set({ pendingRecoveryCode: code })
  },

  cycleAvatarPanelMode: () => {
    const next: Record<AvatarPanelMode, AvatarPanelMode> = { full: 'small', small: 'hidden', hidden: 'full' }
    const mode = next[get().avatarPanelMode]
    saveMode(mode)
    set({ avatarPanelMode: mode })
  },
}))
