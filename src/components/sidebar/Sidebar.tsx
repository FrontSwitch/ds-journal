import { useState, useEffect, useRef, useCallback } from 'react'
import { useChannels } from '../../hooks/useChannels'
import { useAppStore } from '../../store/app'
import { renameFolder, renameChannel, deleteFolder, softDeleteChannel, moveChannelToFolder } from '../../db/channels'
import type { Channel, Folder } from '../../types'
import { ALL_MESSAGES_ID, SCRATCH_ID, ALBUM_ID, isHidden } from '../../types'
import { getCurrentFront, enterFront, exitFront, clearFront } from '../../db/front-log'
import { useAvatars } from '../../hooks/useAvatars'
import About, { type Tab as AboutTab } from '../about/About'
import { isTauri } from '../../native/platform'
import { getSyncPeers, syncNow } from '../../db/sync'
import logo from '../../assets/logo.svg'
import { t } from '../../i18n'
import './Sidebar.css'

interface Props {
  onClose?: () => void
}

export default function Sidebar({ onClose }: Props = {}) {
  const { channels, folders, counts, trackerColors, loading, reload } = useChannels()
  const { selectedChannelId, setSelectedChannel, setSelectedAvatar, showSettings, setShowSettings, setPendingSettingsPage, currentFront, setCurrentFront, selectedAvatarId, config, scratchMessages, avatarPanelMode, setAvatarPanelMode } = useAppStore()
  const { avatars } = useAvatars(null)
  const prevShowSettings = useRef(showSettings)
  useEffect(() => {
    if (prevShowSettings.current && !showSettings) reload()
    prevShowSettings.current = showSettings
  }, [showSettings, reload])

  const loadPeerCount = useCallback(async () => {
    const peers = await getSyncPeers()
    setSyncPeerCount(peers.filter(p => p.trusted && p.peer_address && p.peer_code).length)
  }, [])

  useEffect(() => { loadPeerCount() }, [loadPeerCount])
  // Refresh peer count when settings close (user may have just paired)
  useEffect(() => {
    if (!showSettings) loadPeerCount()
  }, [showSettings, loadPeerCount])

  const openAboutTo = useCallback((tab: AboutTab) => {
    setAboutTab(tab)
    setShowAbout(true)
  }, [])

  useEffect(() => {
    if (!isTauri()) return
    let unlisten: (() => void) | undefined
    import('@tauri-apps/api/event').then(({ listen }) => {
      listen<string>('open-about', e => openAboutTo(e.payload as AboutTab))
        .then(fn => { unlisten = fn })
    })
    return () => { unlisten?.() }
  }, [openAboutTo])
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; type: 'folder' | 'channel'; id: number } | null>(null)
  const [showingMoveFor, setShowingMoveFor] = useState<number | null>(null)
  const [renaming, setRenaming] = useState<{ type: 'folder' | 'channel'; id: number; value: string } | null>(null)
  const [collapsed, setCollapsed] = useState<Record<number, boolean>>({})
  const [showAbout, setShowAbout] = useState(false)
  const [aboutTab, setAboutTab] = useState<AboutTab>('about')

  const [syncPeerCount, setSyncPeerCount] = useState(0)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<{ ok: boolean; msg: string; errors?: string[] } | null>(null)

  function abbreviateSyncError(err: string): string {
    // "PeerName: error sending request for url (...): ... Connection refused (os error 61)"
    const colonIdx = err.indexOf(': ')
    const name = colonIdx !== -1 ? err.slice(0, colonIdx) : ''
    const body = colonIdx !== -1 ? err.slice(colonIdx + 2) : err
    let reason: string
    if (/connection refused|connect error|timed? ?out/i.test(body)) reason = 'unreachable'
    else if (/hmac|unauthorized|forbidden|invalid sig/i.test(body)) reason = 'auth error'
    else if (/decrypt|cipher/i.test(body)) reason = 'decryption error'
    else {
      const last = body.split(': ').pop() ?? body
      reason = last.length > 40 ? last.slice(0, 40) + '…' : last
    }
    return name ? `${name}: ${reason}` : reason
  }

  const visibleChannels = channels.filter(c => !isHidden(c.hidden))
  const visibleFolders = folders.filter(f => !isHidden(f.hidden))
  const orphans = visibleChannels.filter(c => c.folder_id === null)
  const channelsInFolder = (folderId: number) => visibleChannels.filter(c => c.folder_id === folderId)

  function sinceLabel(enteredAt: string): string {
    const d = new Date(enteredAt + 'Z')
    const now = new Date()
    const timeStr = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    return d.toDateString() === now.toDateString()
      ? timeStr
      : d.toLocaleDateString([], { weekday: 'short' }) + ' ' + timeStr
  }

  async function refreshFront() {
    setCurrentFront(await getCurrentFront())
  }

  async function handleSetFront(avatarId: number) {
    await enterFront(avatarId, true); await refreshFront()
  }

  async function handleAddFront(avatarId: number) {
    await enterFront(avatarId, false); await refreshFront()
  }

  async function handleRemoveFront(avatarId: number) {
    await exitFront(avatarId); await refreshFront()
  }

  async function handleClearFront() {
    await clearFront(); await refreshFront()
  }

  async function handleSync() {
    if (syncPeerCount === 0) {
      setShowSettings(true)
      setPendingSettingsPage('sync')
      return
    }
    setSyncing(true)
    setSyncResult(null)
    try {
      const result = await syncNow()
      if (result.errors.length > 0) {
        setSyncResult({ ok: false, msg: t('sidebar.syncFailed'), errors: result.errors })
      } else {
        setSyncResult({ ok: true, msg: t('sidebar.syncDone') })
        setTimeout(() => setSyncResult(null), 3000)
      }
    } catch (e) {
      setSyncResult({ ok: false, msg: t('sidebar.syncFailed'), errors: [String(e)] })
    } finally {
      setSyncing(false)
    }
  }

  function selectChannel(ch: Channel) {
    setSelectedChannel(ch.id)
    if (ch.last_avatar_id) setSelectedAvatar(ch.last_avatar_id)
    if (showSettings) setShowSettings(false)
    onClose?.()
  }

  async function handleRename() {
    if (!renaming || !renaming.value.trim()) return
    if (renaming.type === 'folder') await renameFolder(renaming.id, renaming.value.trim())
    else await renameChannel(renaming.id, renaming.value.trim())
    setRenaming(null)
    reload()
  }

  async function handleDelete(type: 'folder' | 'channel', id: number) {
    setContextMenu(null)
    if (type === 'folder') {
      const hasChannels = channels.some(c => c.folder_id === id)
      if (hasChannels) { alert(t('sidebar.removeFolderFirst')); return }
      await deleteFolder(id)
    } else {
      if (selectedChannelId === id) setSelectedChannel(null)
      await softDeleteChannel(id)
    }
    reload()
  }

  function onContextMenu(e: React.MouseEvent, type: 'folder' | 'channel', id: number) {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, type, id })
  }

  function startRename(type: 'folder' | 'channel', id: number, currentName: string) {
    setContextMenu(null)
    setRenaming({ type, id, value: currentName })
  }

  const renderChannel = (ch: Channel) => {
    if (renaming?.type === 'channel' && renaming.id === ch.id) {
      return (
        <li key={ch.id} className="channel-item">
          <input
            autoFocus
            value={renaming.value}
            onChange={e => setRenaming(r => r ? { ...r, value: e.target.value } : r)}
            onKeyDown={e => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') setRenaming(null) }}
            onBlur={handleRename}
          />
        </li>
      )
    }
    const c = counts[ch.id]
    const hasActivity = c && (c.day > 0 || c.week > 0 || c.month > 0)
    return (
      <li
        key={ch.id}
        className={`channel-item ${selectedChannelId === ch.id ? 'active' : ''}`}
        onClick={() => selectChannel(ch)}
        onContextMenu={e => onContextMenu(e, 'channel', ch.id)}
      >
        <div className="channel-row">
          <span className="channel-name" style={ch.color ? { color: ch.color } : trackerColors[ch.id] ? { color: trackerColors[ch.id] } : undefined}># {ch.name}</span>
          {hasActivity && (
            <span className="channel-counts">{c.day}/{c.week}/{c.month}</span>
          )}
        </div>
        {ch.description && <div className="channel-description">{ch.description}</div>}
      </li>
    )
  }

  const renderFolder = (f: Folder) => {
    const isCollapsed = !!collapsed[f.id]
    const kids = channelsInFolder(f.id)

    if (renaming?.type === 'folder' && renaming.id === f.id) {
      return (
        <li key={f.id} className="folder-item">
          <input
            autoFocus
            value={renaming.value}
            onChange={e => setRenaming(r => r ? { ...r, value: e.target.value } : r)}
            onKeyDown={e => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') setRenaming(null) }}
            onBlur={handleRename}
          />
        </li>
      )
    }

    return (
      <li key={f.id} className="folder-item">
        <div
          className="folder-header"
          onClick={() => setCollapsed(c => ({ ...c, [f.id]: !c[f.id] }))}
          onContextMenu={e => onContextMenu(e, 'folder', f.id)}
        >
          <span className="folder-arrow">{isCollapsed ? '▶' : '▼'}</span>
          <span style={f.color ? { color: f.color } : undefined}>{f.name}</span>
        </div>
        {f.description && <div className="channel-description folder-description">{f.description}</div>}
        {!isCollapsed && (
          <ul className="channel-list">
            {kids.map(renderChannel)}
          </ul>
        )}
      </li>
    )
  }

  if (loading) return <aside className="sidebar"><div className="sidebar-loading">...</div></aside>

  return (
    <aside className="sidebar" onClick={contextMenu ? closeContextMenu : undefined}>
      {onClose ? (
        <div className="sidebar-header">
          <button className="sidebar-icon-btn" onClick={onClose}>←</button>
          <span className="sidebar-header-title">Channels</span>
        </div>
      ) : (
        <div className="sidebar-header">
          <div className="sidebar-title">
            <img src={logo} className="sidebar-logo" alt="DSJ" />
            <div className="sidebar-title-text">
              <span className="sidebar-title-main">{t('names.title')}</span>
              <span className="sidebar-title-sub">{t('names.studio')}</span>
            </div>
          </div>
          <div className="sidebar-icon-bar">
            {isTauri() && (
              <button
                className="sidebar-icon-btn"
                onClick={handleSync}
                disabled={syncing}
                title={syncPeerCount === 0 ? t('sidebar.syncSetup') : t('sidebar.syncBtn')}
              >⇅</button>
            )}
            <button
              className="sidebar-icon-btn"
              onClick={() => openAboutTo('about')}
              title={t('sidebar.about')}
            >?</button>
            <button
              className={`sidebar-icon-btn${showSettings ? ' active' : ''}`}
              onClick={() => setShowSettings(!showSettings)}
              title={t('sidebar.settings')}
            >⚙</button>
            <button
              className={`sidebar-icon-btn${avatarPanelMode !== 'hidden' ? ' active' : ''}`}
              onClick={() => setAvatarPanelMode(avatarPanelMode === 'hidden' ? 'small' : 'hidden')}
              title={t('chat.avatars')}
            >👥</button>
          </div>
        </div>
      )}
      {showAbout && <About onClose={() => setShowAbout(false)} tab={aboutTab} onTabChange={setAboutTab} />}

      {isTauri() && !onClose && (syncing || syncResult) && (
        <div className={`sidebar-sync-status-bar ${syncing ? 'syncing' : syncResult?.ok ? 'ok' : 'err'}`}>
          {syncing ? t('sync.syncing') : syncResult?.ok ? syncResult.msg : (
            <>
              <span>{syncResult?.msg}</span>
              {syncResult?.errors && syncResult.errors.length > 0 && (
                <span className="sidebar-sync-error-detail" title={syncResult.errors.join('\n')}>
                  {' — '}{abbreviateSyncError(syncResult.errors[0])}
                </span>
              )}
              <button className="sidebar-sync-settings-link" onClick={() => { setShowSettings(true); setPendingSettingsPage('sync') }}>
                {t('sidebar.syncSettings')}
              </button>
            </>
          )}
        </div>
      )}

      <nav className="sidebar-nav">
        <ul className="channel-list root-list">
          <li
            className={`channel-item all-messages ${selectedChannelId === ALL_MESSAGES_ID ? 'active' : ''}`}
            onClick={() => { setSelectedChannel(ALL_MESSAGES_ID); if (showSettings) setShowSettings(false); onClose?.() }}
          >
            {t('sidebar.allMessages')}
          </li>
          <li
            className={`channel-item scratch ${selectedChannelId === SCRATCH_ID ? 'active' : ''}`}
            onClick={() => { setSelectedChannel(SCRATCH_ID); if (showSettings) setShowSettings(false); onClose?.() }}
          >
            {t('sidebar.scratch')}
            {scratchMessages.length > 0 && (
              <span className="scratch-badge">{scratchMessages.length}</span>
            )}
          </li>
          <li
            className={`channel-item ${selectedChannelId === ALBUM_ID ? 'active' : ''}`}
            onClick={() => { setSelectedChannel(ALBUM_ID); if (showSettings) setShowSettings(false); onClose?.() }}
          >
            {t('sidebar.album')}
          </li>
          {orphans.map(renderChannel)}
          {visibleFolders.map(renderFolder)}
        </ul>
      </nav>

      {config.features.showFrontGroup && (() => {
        const noFront = currentFront.length === 0
        const noSelected = !selectedAvatarId
        const selectedInFront = selectedAvatarId ? currentFront.some(s => s.avatar_id === selectedAvatarId) : false
        return (
          <div className="sidebar-front-bar">
            <div className="sidebar-front-header">
              <span className="sidebar-front-title">Front</span>
              <span className="sidebar-front-actions">
                <button className="sidebar-front-btn" title="Set as sole fronter" disabled={noSelected} onClick={() => selectedAvatarId && handleSetFront(selectedAvatarId)}>set</button>
                <button className="sidebar-front-btn" title="Add to front" disabled={noSelected || selectedInFront} onClick={() => selectedAvatarId && handleAddFront(selectedAvatarId)}>+</button>
                <button className="sidebar-front-btn" title="Remove from front" disabled={noSelected || noFront || !selectedInFront} onClick={() => selectedAvatarId && handleRemoveFront(selectedAvatarId)}>−</button>
                <button className="sidebar-front-btn sidebar-front-clear" title="Clear all fronters" disabled={noFront} onClick={handleClearFront}>clear</button>
              </span>
            </div>
            <div className="sidebar-front-members">
              {noFront ? (
                <span className="sidebar-front-empty">none</span>
              ) : currentFront.map(session => {
                const av = avatars.find(a => a.id === session.avatar_id)
                if (!av) return null
                return (
                  <span key={session.id} className="sidebar-front-avatar">
                    <span className="sidebar-front-dot" style={{ background: av.color }} />
                    <span className="sidebar-front-name">{av.name}</span>
                    <span className="sidebar-front-since">since {sinceLabel(session.entered_at)}</span>
                  </span>
                )
              })}
            </div>
          </div>
        )
      })()}

      {contextMenu && (
        <ul
          className="context-menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={e => e.stopPropagation()}
        >
          {contextMenu.type === 'channel' && (
            <li className="context-menu-move">
              <span onClick={() => setShowingMoveFor(showingMoveFor === contextMenu.id ? null : contextMenu.id)}>
                {t('sidebar.moveTo')}
              </span>
              {showingMoveFor === contextMenu.id && (
                <ul className="context-submenu">
                  <li onClick={async () => {
                    await moveChannelToFolder(contextMenu.id, null)
                    setContextMenu(null); setShowingMoveFor(null); reload()
                  }}>
                    {t('sidebar.noFolder')}
                  </li>
                  {folders.map(f => (
                    <li key={f.id} onClick={async () => {
                      await moveChannelToFolder(contextMenu.id, f.id)
                      setContextMenu(null); setShowingMoveFor(null); reload()
                    }}>
                      {f.name}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          )}
          <li onClick={() => {
            const item = contextMenu.type === 'folder'
              ? folders.find(f => f.id === contextMenu.id)
              : channels.find(c => c.id === contextMenu.id)
            startRename(contextMenu.type, contextMenu.id, item?.name ?? '')
          }}>
            {t('sidebar.rename')}
          </li>
          <li className="danger" onClick={() => handleDelete(contextMenu.type, contextMenu.id)}>
            {t('sidebar.delete')}
          </li>
        </ul>
      )}
    </aside>
  )

  function closeContextMenu() { setContextMenu(null) }
}
