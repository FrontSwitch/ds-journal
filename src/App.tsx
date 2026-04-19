import { useEffect, useRef, useState } from 'react'
import { isTauri } from './native/platform'
import { addLog } from './store/debug'
import { getDb, setDbKey } from './db/index'
import { getChannels, createChannel } from './db/channels'
import { getAvatars, createAvatar } from './db/avatars'
import { checkAutoBackup } from './db/backup'
import { seedTrackerPresets } from './db/tracker-presets'
import { seedFrontLog, getCurrentFront } from './db/front-log'
import { initSyncCtx, handleSyncRequest, upsertSyncPeer, syncNow } from './db/sync'
import { useAppStore } from './store/app'
import { useMobile } from './hooks/useMobile'
import { setLocale } from './i18n'
import { shouldShowNudge, snoozeNudge, dismissNudge } from './lib/nudge'
import DesktopLayout from './layouts/DesktopLayout'
import MobileLayout from './layouts/MobileLayout'
import PassphrasePrompt from './components/security/PassphrasePrompt'
import PostRecoverySetup from './components/security/PostRecoverySetup'
import EncryptionNudge from './components/security/EncryptionNudge'
import RecoveryCodeDisplay from './components/security/RecoveryCodeDisplay'
import { saveConfig } from './config'
import { isHidden } from './types'
import './App.css'

export default function App() {
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // null = security check in progress, true = need passphrase, false = ready to init DB
  const [needsPassphrase, setNeedsPassphrase] = useState<boolean | null>(null)
  const [needsPostRecovery, setNeedsPostRecovery] = useState(false)
  const [showNudge, setShowNudge] = useState(false)
  const { selectedChannelId, setSelectedChannel, config, setConfig, showSettings, nudgeCheckRequest,
          pendingRecoveryCode, setPendingRecoveryCode } = useAppStore()
  setLocale(config.ui.language ?? 'en')
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevShowSettings = useRef(showSettings)
  const isMobile = useMobile()

  // Phase 1: security check (keychain lookup or show prompt)
  useEffect(() => {
    async function checkSecurity() {
      if (isTauri() && config.security.encryptDatabase) {
        const { invoke } = await import('@tauri-apps/api/core')
        // If the DB file is gone (deleted/moved), reset encryption config and start fresh.
        const exists = await invoke<boolean>('db_exists', { name: 'dsj' })
        if (!exists) {
          const next = { ...config, security: { ...config.security, encryptDatabase: false, rememberPassphrase: false } }
          setConfig(next); saveConfig(next)
          setNeedsPassphrase(false)
          return
        }
        if (config.security.rememberPassphrase) {
          console.log('[security] rememberPassphrase=true, trying keychain...')
          try {
            const key = await invoke<string | null>('keychain_get')
            console.log('[security] keychain_get result:', key ? 'got key' : 'null/empty')
            if (key) { setDbKey(key); setNeedsPassphrase(false); return }
            // Keychain had no entry — clear the stale flag so the prompt shows unchecked
            console.log('[security] keychain empty, clearing rememberPassphrase flag')
            const next = { ...config, security: { ...config.security, rememberPassphrase: false } }
            setConfig(next); saveConfig(next)
          } catch (e) {
            console.warn('[security] keychain_get error:', e)
          }
        } else {
          console.log('[security] rememberPassphrase=false, showing prompt')
        }
        setNeedsPassphrase(true)
      } else {
        setNeedsPassphrase(false)
      }
    }
    checkSecurity()
  }, [])

  // Phase 2: DB init — runs once security phase resolves (needsPassphrase = false)
  useEffect(() => {
    if (needsPassphrase !== false) return
    let backupInterval: ReturnType<typeof setInterval> | undefined
    let syncInterval: ReturnType<typeof setInterval> | undefined
    getDb()
      .then(async () => {
        const channels = await getChannels()
        if (channels.length === 0) {
          await createChannel('general', null)
          const avatars = await getAvatars()
          if (avatars.length === 0) await createAvatar('someone', '#89b4fa', null, null, null, null)
        }

        const allChannels = await getChannels()
        if (selectedChannelId !== null && selectedChannelId > 0) {
          const still = allChannels.find(c => c.id === selectedChannelId && !isHidden(c.hidden))
          if (!still) setSelectedChannel(allChannels.find(c => !isHidden(c.hidden))?.id ?? null)
        } else if (selectedChannelId === null && allChannels.length > 0) {
          setSelectedChannel(allChannels.find(c => !isHidden(c.hidden))?.id ?? null)
        }

        await initSyncCtx()
        await seedTrackerPresets()
        await seedFrontLog()
        const frontSessions = await getCurrentFront()
        useAppStore.getState().setCurrentFront(frontSessions)
        setReady(true)
        checkAutoBackup().catch(e => console.warn('[auto-backup]', e))
        backupInterval = setInterval(
          () => checkAutoBackup().catch(e => console.warn('[auto-backup]', e)),
          60 * 60 * 1000
        )
        // Check nudge after DB init
        checkNudge()
        // Auto-sync on startup
        const syncCfg = config.sync
        if (syncCfg?.autoSyncOnStartup) {
          syncNow().catch(e => console.warn('[auto-sync startup]', e))
        }
        // Periodic auto-sync
        const syncMinutes = syncCfg?.autoSyncMinutes ?? 0
        if (syncMinutes > 0) {
          syncInterval = setInterval(
            () => syncNow().catch(e => console.warn('[auto-sync periodic]', e)),
            syncMinutes * 60 * 1000
          )
        }
      })
      .catch(e => {
        console.error('[db error]', e)
        setError(String(e))
      })
    return () => { clearInterval(backupInterval); clearInterval(syncInterval) }
  }, [needsPassphrase])

  // Watch for settings closing — check nudge then too
  useEffect(() => {
    if (prevShowSettings.current && !showSettings && ready) {
      checkNudge()
    }
    prevShowSettings.current = showSettings
  }, [showSettings])

  // Watch for nudge check requests from other components (e.g. ChatPanel after send)
  useEffect(() => {
    if (nudgeCheckRequest > 0 && ready) checkNudge()
  }, [nudgeCheckRequest])

  useEffect(() => {
    if (!isTauri()) return
    let unlisten: (() => void) | undefined
    import('@tauri-apps/api/event').then(({ listen }) => {
      listen('open-settings', () => useAppStore.getState().setShowSettings(true))
        .then(fn => { unlisten = fn })
    })
    return () => { unlisten?.() }
  }, [])

  // Handle incoming sync requests from peers
  useEffect(() => {
    if (!isTauri() || !ready) return
    let unlisten: (() => void) | undefined
    import('@tauri-apps/api/event').then(({ listen }) => {
      listen<{ request_id: string, peer_device_id: string, from_counter: number, cold_sync: boolean, events: Parameters<typeof handleSyncRequest>[2] }>(
        'dsj-sync-request',
        async ({ payload }) => {
          try {
            const { invoke } = await import('@tauri-apps/api/core')
            const response = await handleSyncRequest(payload.peer_device_id, payload.from_counter, payload.events, payload.cold_sync ?? false)
            await invoke('sync_complete_request', { requestId: payload.request_id, events: response.events })
          } catch (e) {
            console.error('[sync] Failed to handle dsj-sync-request:', e)
          }
        }
      ).then(fn => { unlisten = fn })
    })
    return () => { unlisten?.() }
  }, [ready])

  // Persist newly-paired peers (Rust emits this after a successful /dsj/pair)
  useEffect(() => {
    if (!isTauri()) return
    let unlisten: (() => void) | undefined
    import('@tauri-apps/api/event').then(({ listen }) => {
      listen<{ device_id: string, device_name: string, device_type: string, peer_code: string, peer_address: string }>(
        'dsj-peer-paired',
        ({ payload }) => {
          upsertSyncPeer({
            device_id: payload.device_id,
            device_name: payload.device_name || null,
            device_type: (payload.device_type as import('./types').DeviceType) || 'full',
            peer_code: payload.peer_code,
            peer_address: payload.peer_address || null,
            trusted: 1,
          }).catch(e => console.warn('[sync] Failed to save paired peer:', e))
        }
      ).then(fn => { unlisten = fn })
    })
    return () => { unlisten?.() }
  }, [])

  useEffect(() => {
    const minutes = config.ui.hideAfterMinutes
    if (!minutes || minutes <= 0) return
    const ms = minutes * 60 * 1000
    const reset = () => {
      if (idleTimer.current) clearTimeout(idleTimer.current)
      idleTimer.current = setTimeout(() => {
        addLog(`minimize: idle ${minutes}m`, 'info')
        if (isTauri()) import('@tauri-apps/api/window').then(m => m.getCurrentWindow().minimize())
      }, ms)
    }
    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll']
    events.forEach(e => window.addEventListener(e, reset, { passive: true }))
    reset()
    return () => {
      if (idleTimer.current) clearTimeout(idleTimer.current)
      events.forEach(e => window.removeEventListener(e, reset))
    }
  }, [config.ui.hideAfterMinutes])

  // Block Escape (and clicks) while recovery code acknowledgment is pending
  useEffect(() => {
    if (!pendingRecoveryCode) return
    const block = (e: KeyboardEvent) => { if (e.key === 'Escape') e.stopImmediatePropagation() }
    window.addEventListener('keydown', block, true)
    return () => window.removeEventListener('keydown', block, true)
  }, [!!pendingRecoveryCode])

  async function checkNudge() {
    const { config: currentConfig } = useAppStore.getState()
    if (!isTauri()) return
    if (currentConfig.security.encryptDatabase) return
    if (!shouldShowNudge()) return
    try {
      const avatars = await getAvatars()
      const channels = await getChannels()
      // Show nudge once the user has set up beyond the default seed
      if (avatars.length > 1 || channels.length > 1) setShowNudge(true)
    } catch { /* ignore */ }
  }

  async function handlePassphraseUnlock(key: string, remember: boolean) {
    console.log('[unlock] remember checkbox was:', remember)
    setDbKey(key)
    let savedRemember = remember
    if (remember) {
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        console.log('[unlock] calling keychain_set...')
        await invoke('keychain_set', { password: key })
        console.log('[unlock] keychain_set succeeded')
        const verify = await invoke<string | null>('keychain_get')
        console.log('[unlock] immediate read-back:', verify ? 'got key' : 'NULL — write did not persist!')
      } catch (e) {
        console.warn('[unlock] keychain_set FAILED:', e)
        savedRemember = false
      }
    }
    console.log('[unlock] saving rememberPassphrase:', savedRemember)
    const next = { ...config, security: { ...config.security, rememberPassphrase: savedRemember } }
    setConfig(next); saveConfig(next)
    console.log('[unlock] config saved to localStorage')
    setNeedsPassphrase(false)
  }

  function handleRecoveryUnlock(key: string) {
    setDbKey(key)
    // Don't save to keychain — user must set a new passphrase first
    setNeedsPassphrase(false)
    setNeedsPostRecovery(true)
  }

  async function handlePassphraseReset() {
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('db_reset', { name: 'dsj' })
    try { await invoke('keychain_delete') } catch { /* ok */ }
    const next = { ...config, security: { ...config.security, encryptDatabase: false, rememberPassphrase: false } }
    setConfig(next); saveConfig(next)
    setNeedsPassphrase(false)
  }

  async function handlePostRecoveryComplete(remember: boolean) {
    if (remember && isTauri()) {
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        const { getDbKey } = await import('./db/index')
        const key = getDbKey()
        if (key) {
          await invoke('keychain_set', { password: key })
        }
      } catch (e) {
        console.warn('[post-recovery] keychain_set failed:', e)
      }
    }
    const next = { ...config, security: { encryptDatabase: true, rememberPassphrase: remember } }
    setConfig(next); saveConfig(next)
    setNeedsPostRecovery(false)
  }

  function handleNudgeEncryptNow() {
    dismissNudge()
    setShowNudge(false)
    useAppStore.getState().setShowSettings(true)
    useAppStore.getState().setPendingSettingsPage('security')
  }

  function handleNudgeAskLater() {
    snoozeNudge()
    setShowNudge(false)
  }

  function handleNudgeIgnore() {
    dismissNudge()
    setShowNudge(false)
  }

  if (needsPassphrase === null) return <div className="init-loading">Loading...</div>
  if (needsPassphrase) return (
    <PassphrasePrompt
      onUnlock={handlePassphraseUnlock}
      onUnlockRecovery={handleRecoveryUnlock}
      onReset={handlePassphraseReset}
      defaultRemember={config.security.rememberPassphrase}
    />
  )
  if (error) return <div className="init-error">Failed to open database: {error}</div>
  if (!ready) return <div className="init-loading">Loading...</div>
  if (needsPostRecovery) return <PostRecoverySetup onComplete={handlePostRecoveryComplete} />

  return (
    <>
      {isMobile ? <MobileLayout /> : <DesktopLayout />}
      {showNudge && (
        <EncryptionNudge
          onEncryptNow={handleNudgeEncryptNow}
          onAskLater={handleNudgeAskLater}
          onIgnore={handleNudgeIgnore}
        />
      )}
      {pendingRecoveryCode && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.75)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onMouseDown={e => e.stopPropagation()}
        >
          <div style={{ width: 400 }}>
            <RecoveryCodeDisplay
              recoveryCode={pendingRecoveryCode}
              onAcknowledged={() => setPendingRecoveryCode(null)}
            />
          </div>
        </div>
      )}
    </>
  )
}
