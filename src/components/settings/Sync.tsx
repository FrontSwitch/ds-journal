import { useState, useEffect, useCallback } from 'react'
import { isTauri } from '../../native/platform'
import {
  getSyncPeers, syncNow, completePairing, removeSyncPeer,
  getDeviceName, setDeviceName, getDeviceType, setDeviceType,
  getSyncPort, setSyncPort, getOpenConflictsWithNames, resolveConflict,
  getOrCreateDeviceId,
} from '../../db/sync'
import { t } from '../../i18n'
import type { SyncPeer, DeviceType, SyncConflict } from '../../types'
import {
  getAutoBackup, setAutoBackup as saveAutoBackup,
  getMessageDays, setMessageDays as saveMessageDays,
} from '../../db/sync'

interface Props { onClose: () => void }

interface ServerInfo { device_id: string; local_ip: string; port: number }

const DEVICE_TYPES: { value: DeviceType; label: string; desc: string }[] = [
  { value: 'primary',  label: 'sync.deviceTypePrimary',  desc: 'sync.deviceTypePrimaryDesc' },
  { value: 'full',     label: 'sync.deviceTypeFull',     desc: 'sync.deviceTypeFullDesc' },
  { value: 'remote',   label: 'sync.deviceTypeRemote',   desc: 'sync.deviceTypeRemoteDesc' },
  { value: 'cold',     label: 'sync.deviceTypeCold',     desc: 'sync.deviceTypeColdDesc' },
]

function formatLastSync(ts: number | null): string {
  if (!ts) return t('sync.never')
  return new Date(ts).toLocaleString()
}

function abbrev(id: string) { return id.slice(0, 8) + '…' }

function deviceTypeLabel(type: DeviceType): string {
  const entry = DEVICE_TYPES.find(d => d.value === type)
  return entry ? t(entry.label as Parameters<typeof t>[0]) : type
}

function isColdSync(peer: SyncPeer, ourType: DeviceType): boolean {
  return !peer.last_sync_timestamp || ourType === 'cold' || peer.device_type === 'cold'
}

export default function Sync({ onClose }: Props) {
  const [info, setInfo] = useState<ServerInfo | null>(null)
  const [peers, setPeers] = useState<SyncPeer[]>([])
  const [pairCode, setPairCode] = useState<string | null>(null)
  const [connectAddr, setConnectAddr] = useState('')
  const [connectCode, setConnectCode] = useState('')
  const [connectStatus, setConnectStatus] = useState<string | null>(null)
  const [syncStatus, setSyncStatus] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [showConnectPanel, setShowConnectPanel] = useState(false)
  const [editingDeviceType, setEditingDeviceType] = useState(false)
  const [editingPort, setEditingPort] = useState(false)
  const [portInput, setPortInput] = useState('')   // '' = random
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [conflicts, setConflicts] = useState<Array<SyncConflict & { entity_name?: string }>>([])

  const [deviceName, setDeviceNameState] = useState('')
  const [deviceType, setDeviceTypeState] = useState<DeviceType>('full')
  const [preferredPort, setPreferredPort] = useState(0) // 0 = random
  const [autoBackup, setAutoBackupState] = useState(false)
  const [messageDays, setMessageDaysState] = useState(-1)
  const [customDaysInput, setCustomDaysInput] = useState('')

  const loadPeers = useCallback(async () => {
    setPeers(await getSyncPeers())
  }, [])

  const loadConflicts = useCallback(async () => {
    setConflicts(await getOpenConflictsWithNames())
  }, [])

  useEffect(() => {
    loadPeers()
    loadConflicts()
    getDeviceName().then(n => setDeviceNameState(n ?? ''))
    getDeviceType().then(setDeviceTypeState)
    getSyncPort().then(p => setPreferredPort(p))
    getAutoBackup().then(setAutoBackupState)
    getMessageDays().then(d => { setMessageDaysState(d); setCustomDaysInput(d > 0 ? String(d) : '30') })

    if (!isTauri()) return
    import('@tauri-apps/api/core').then(({ invoke }) => {
      invoke<ServerInfo>('sync_get_server_info').then(setInfo).catch(console.warn)
    })
    let unlisten: (() => void) | undefined
    import('@tauri-apps/api/event').then(({ listen }) => {
      listen('dsj-peer-paired', () => loadPeers()).then(fn => { unlisten = fn })
    })
    return () => { unlisten?.() }
  }, [])

  async function handleSaveDeviceName() {
    await setDeviceName(deviceName.trim())
  }

  async function handleSetDeviceType(type: DeviceType) {
    setDeviceTypeState(type)
    setEditingDeviceType(false)
    await setDeviceType(type)
  }

  async function applyPort(port: number) {
    setEditingPort(false)
    // If the server is already on this port, just persist the preference and stop
    if (port !== 0 && port === info?.port) {
      await setSyncPort(port)
      setPreferredPort(port)
      return
    }
    await setSyncPort(port)
    setPreferredPort(port)
    if (isTauri()) {
      const { invoke } = await import('@tauri-apps/api/core')
      const actual = await invoke<number>('sync_restart_on_port', { port })
      setInfo(prev => prev ? { ...prev, port: actual } : prev)
      if (actual !== port) {
        await setSyncPort(actual)
        setPreferredPort(actual)
      }
    }
  }

  async function handleSavePort() {
    const n = portInput.trim() === '' ? 0 : parseInt(portInput.trim(), 10)
    await applyPort(isNaN(n) || n < 1 || n > 65535 ? 0 : n)
  }

  async function handleRandomPort() {
    await applyPort(0)
  }

  async function handleGenerateCode() {
    if (!isTauri()) return
    const { invoke } = await import('@tauri-apps/api/core')
    const code = await invoke<string>('sync_generate_pair_code')
    setPairCode(code)
    setTimeout(() => setPairCode(null), 5 * 60 * 1000)
  }

  async function handleConnect() {
    if (!connectAddr.trim() || !connectCode.trim()) return
    setConnecting(true)
    setConnectStatus(null)
    try {
      const infoResp = await fetch(`http://${connectAddr.trim()}/dsj/info`)
      if (!infoResp.ok) throw new Error(`Info request failed: ${infoResp.status}`)
      const theirInfo = await infoResp.json() as { device_id: string; device_name?: string; device_type?: string }

      const pairResp = await fetch(`http://${connectAddr.trim()}/dsj/pair`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requester_device_id: info?.device_id ?? getOrCreateDeviceId(),
          requester_device_name: deviceName.trim() || undefined,
          requester_device_type: deviceType,
          requester_address: info ? `${info.local_ip}:${info.port}` : '',
          pair_code: connectCode.trim(),
        }),
      })
      if (!pairResp.ok) throw new Error(`Pair failed: ${pairResp.status}`)
      const { peer_code } = await pairResp.json() as { peer_code: string }

      await completePairing(
        theirInfo.device_id,
        peer_code,
        connectAddr.trim(),
        theirInfo.device_name ?? null,
        (theirInfo.device_type as DeviceType) ?? null,
      )
      setConnectStatus(t('sync.pairedSuccess'))
      setConnectAddr('')
      setConnectCode('')
      await loadPeers()
    } catch (e) {
      setConnectStatus(String(e))
    } finally {
      setConnecting(false)
    }
  }

  async function handleSyncNow() {
    setSyncing(true)
    setSyncStatus(null)
    try {
      const result = await syncNow()
      if (result.errors.length > 0) {
        setSyncStatus(`${t('sync.syncError')} ${result.errors.join('; ')}`)
      } else {
        setSyncStatus(t('sync.syncDone', { sent: String(result.sent), received: String(result.received) }))
      }
      await loadPeers()
      await loadConflicts()
    } catch (e) {
      setSyncStatus(`${t('sync.syncError')} ${String(e)}`)
    } finally {
      setSyncing(false)
    }
  }

  async function handleRemovePeer(deviceId: string) {
    setRemovingId(deviceId)
    await removeSyncPeer(deviceId)
    await loadPeers()
    setRemovingId(null)
  }

  async function handleDismissConflict(conflictId: string) {
    await resolveConflict(conflictId, 'lww')
    await loadConflicts()
  }

  async function handleAutoBackupChange(enabled: boolean) {
    setAutoBackupState(enabled)
    await saveAutoBackup(enabled)
  }

  async function handleMessageDaysChange(days: number) {
    setMessageDaysState(days)
    await saveMessageDays(days)
  }

  const trustedPeerCount = peers.filter(p => p.trusted).length

  return (
    <>
      <div className="editor-header">
        <span>{t('sync.title')}</span>
        <button className="editor-close" onClick={onClose}>✕</button>
      </div>
      <div className="editor-body single" style={{ overflowY: 'auto' }}>
        <div className="editor-col" style={{ gap: 20 }}>

          {/* This device — bordered card */}
          <div className="sync-device-card">
            <div className="settings-section-title" style={{ marginBottom: 10 }}>{t('sync.thisDevice')}</div>

            <label className="field-label">
              {t('sync.deviceNameLabel')}
              <input
                className="field-input"
                value={deviceName}
                onChange={e => setDeviceNameState(e.target.value)}
                onBlur={handleSaveDeviceName}
                onKeyDown={e => { if (e.key === 'Enter') handleSaveDeviceName() }}
                placeholder={t('sync.deviceNamePlaceholder')}
              />
            </label>

            <div className="sync-device-type-row">
              <span className="field-label" style={{ marginBottom: 0 }}>{t('sync.deviceTypeSectionLabel')}</span>
              {editingDeviceType ? (
                <div className="sync-device-type-list">
                  {DEVICE_TYPES.map(({ value, label, desc }) => (
                    <label
                      key={value}
                      className={`sync-type-option${deviceType === value ? ' selected' : ''}`}
                    >
                      <input
                        type="radio"
                        name="device-type"
                        value={value}
                        checked={deviceType === value}
                        onChange={() => handleSetDeviceType(value)}
                      />
                      <div>
                        <div style={{ fontWeight: 500 }}>{t(label as Parameters<typeof t>[0])}</div>
                        <div className="muted" style={{ fontSize: 11, marginTop: 1 }}>
                          {t(desc as Parameters<typeof t>[0])}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              ) : (
                <div className="sync-type-current">
                  <span>{deviceTypeLabel(deviceType)}</span>
                  <button className="inline-btn" onClick={() => setEditingDeviceType(true)}>
                    {t('sync.changeType')}
                  </button>
                </div>
              )}
            </div>

            <label className="field-label checkbox-label" style={{ marginBottom: 0 }}>
              <input
                type="checkbox"
                checked={autoBackup}
                onChange={e => handleAutoBackupChange(e.target.checked)}
              />
              {t('sync.policyAutoBackup')}
            </label>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span className="field-label" style={{ marginBottom: 0 }}>{t('sync.policyMessageDays')}</span>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                <input type="radio" name="msg-days" checked={messageDays === -1}
                  onChange={() => handleMessageDaysChange(-1)} />
                {t('sync.policyDaysAll')}
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                <input type="radio" name="msg-days" checked={messageDays === 0}
                  onChange={() => handleMessageDaysChange(0)} />
                {t('sync.policyDaysNone')}
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                <input type="radio" name="msg-days" checked={messageDays > 0}
                  onChange={() => {
                    const n = parseInt(customDaysInput, 10)
                    handleMessageDaysChange(isNaN(n) || n < 1 ? 30 : n)
                  }} />
                {t('sync.policyDaysCustom')}
                {messageDays > 0 && (
                  <input
                    type="number"
                    min={1}
                    style={{ width: 56, marginLeft: 4, fontSize: 12, padding: '1px 4px',
                      background: 'var(--bg-hover)', border: '1px solid var(--border)',
                      color: 'var(--text)', borderRadius: 3 }}
                    value={customDaysInput}
                    onChange={e => {
                      setCustomDaysInput(e.target.value)
                      const n = parseInt(e.target.value, 10)
                      if (!isNaN(n) && n >= 1) handleMessageDaysChange(n)
                    }}
                  />
                )}
              </label>
            </div>
            <div className="muted" style={{ fontSize: 11 }}>{t('sync.policyDaysHint')}</div>

            <div className="sync-device-meta">
              <span className="muted">{t('sync.deviceId')}</span>
              <code>{info ? abbrev(info.device_id) : '…'}</code>
              <span className="muted">{t('sync.addressLabel')}</span>
              <code>{info ? `${info.local_ip}` : t('sync.notAvailable')}</code>
              <span className="muted">{t('sync.portLabel')}</span>
              {editingPort ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input
                    className="field-input"
                    style={{ width: 80, padding: '2px 6px', fontSize: 12 }}
                    value={portInput}
                    onChange={e => setPortInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleSavePort(); if (e.key === 'Escape') setEditingPort(false) }}
                    placeholder={t('sync.portRandom')}
                    autoFocus
                  />
                  <button className="inline-btn" onClick={handleSavePort}>{t('sync.portSave')}</button>
                  <button className="inline-btn" onClick={handleRandomPort}>{t('sync.portPickRandom')}</button>
                  <button className="inline-btn" onClick={() => setEditingPort(false)}>{t('sync.portCancel')}</button>
                </span>
              ) : (
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <code>{info?.port ?? '…'}</code>
                  <button className="inline-btn" onClick={() => { setPortInput(preferredPort === 0 ? '' : String(preferredPort)); setEditingPort(true) }}>
                    {t('sync.changeType')}
                  </button>
                </span>
              )}
            </div>
          </div>

          {/* Paired devices */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div className="settings-section-title" style={{ marginBottom: 0 }}>{t('sync.peersSection')}</div>
              <button
                className="save-btn"
                onClick={handleSyncNow}
                disabled={syncing || trustedPeerCount === 0}
                style={{ marginBottom: 0, padding: '4px 12px', fontSize: 13 }}
              >
                {syncing ? t('sync.syncing') : t('sync.syncNow')}
              </button>
            </div>
            {syncStatus && (
              <p className="muted" style={{ marginBottom: 8, color: syncStatus.startsWith(t('sync.syncError')) ? '#f38ba8' : '#a6e3a1' }}>
                {syncStatus}
              </p>
            )}
            {peers.length === 0 ? (
              <p className="muted">{t('sync.noPeers')}</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {peers.map(peer => (
                  <div key={peer.device_id} className="sync-peer-row">
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontWeight: 500, fontSize: 13 }}>
                          {peer.device_name ?? abbrev(peer.device_id)}
                        </span>
                        <span className="sync-badge">{deviceTypeLabel(peer.device_type ?? 'full')}</span>
                        {isColdSync(peer, deviceType) && (
                          <span className="sync-badge cold">{t('sync.coldSyncBadge')}</span>
                        )}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, display: 'flex', gap: 12 }}>
                        {peer.peer_address && <code>{peer.peer_address}</code>}
                        <span>{t('sync.lastSync')} {formatLastSync(peer.last_sync_timestamp)}</span>
                      </div>
                    </div>
                    <button
                      className="sync-remove-btn"
                      onClick={() => handleRemovePeer(peer.device_id)}
                      disabled={removingId === peer.device_id}
                      title={t('sync.removePeer')}
                    >✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Connect to peer — collapsed by default */}
          <div>
            <button
              className="sync-connect-toggle"
              onClick={() => { setShowConnectPanel(p => !p); setConnectStatus(null) }}
            >
              <span>{showConnectPanel ? '▼' : '▶'}</span>
              {t('sync.connectToggle')}
            </button>

            {showConnectPanel && (
              <div className="sync-connect-panel">
                {/* Generate a code for the other device */}
                <div className="sync-connect-sub">
                  <div className="field-label" style={{ marginBottom: 6 }}>{t('sync.pairSection')}</div>
                  {pairCode ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <p className="muted">{t('sync.codeExpires')}</p>
                      <code style={{ fontSize: 28, letterSpacing: 6, fontWeight: 700, color: 'var(--text)' }}>
                        {pairCode}
                      </code>
                      {info && (
                        <code style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                          {info.local_ip}:{info.port}
                        </code>
                      )}
                    </div>
                  ) : (
                    <button className="save-btn" style={{ marginBottom: 0 }} onClick={handleGenerateCode}>
                      {t('sync.generateCode')}
                    </button>
                  )}
                </div>

                <div className="sync-connect-divider" />

                {/* Connect using their code */}
                <div className="sync-connect-sub">
                  <div className="field-label" style={{ marginBottom: 6 }}>{t('sync.connectSection')}</div>
                  <label className="field-label">
                    {t('sync.peerAddressLabel')}
                    <input
                      className="field-input"
                      value={connectAddr}
                      onChange={e => setConnectAddr(e.target.value)}
                      placeholder={t('sync.peerAddressPlaceholder')}
                    />
                  </label>
                  <label className="field-label" style={{ marginTop: 6 }}>
                    {t('sync.pairCodeLabel')}
                    <input
                      className="field-input"
                      value={connectCode}
                      onChange={e => setConnectCode(e.target.value)}
                      placeholder={t('sync.pairCodePlaceholder')}
                      maxLength={6}
                      onKeyDown={e => { if (e.key === 'Enter') handleConnect() }}
                    />
                  </label>
                  <button
                    className="save-btn"
                    style={{ marginTop: 8, marginBottom: 0 }}
                    onClick={handleConnect}
                    disabled={connecting || !connectAddr.trim() || !connectCode.trim()}
                  >
                    {connecting ? t('sync.connecting') : t('sync.connectBtn')}
                  </button>
                  {connectStatus && (
                    <p className="muted" style={{ marginTop: 6, color: connectStatus === t('sync.pairedSuccess') ? '#a6e3a1' : '#f38ba8' }}>
                      {connectStatus}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Conflicts */}
          {conflicts.length > 0 && (
            <div>
              <div className="settings-section-title" style={{ marginBottom: 8 }}>{t('sync.conflictsSection')}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {conflicts.map(c => (
                  <div key={c.id} className="sync-peer-row" style={{ alignItems: 'flex-start', flexDirection: 'column', gap: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                      <span style={{ fontWeight: 500, fontSize: 13 }}>
                        {c.entity_name ?? c.entity_id.slice(0, 8) + '…'}{' '}
                        <span className="sync-badge">{c.entity_type}</span>
                      </span>
                      <button
                        className="inline-btn"
                        onClick={() => handleDismissConflict(c.id)}
                        title={t('sync.conflictKeptLocal')}
                      >
                        {t('sync.dismissConflict')}
                      </button>
                    </div>
                    {c.field_name && (
                      <div className="muted" style={{ fontSize: 11 }}>
                        {t('sync.conflictFields', { fields: c.field_name })}
                      </div>
                    )}
                    <div className="muted" style={{ fontSize: 11 }}>
                      {t('sync.conflictDetected', { date: new Date(c.detected_at).toLocaleString() })}
                      {' · '}{t('sync.conflictKeptLocal')}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>
    </>
  )
}
