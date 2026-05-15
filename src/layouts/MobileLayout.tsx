import { useState, useEffect } from 'react'
import { useAppStore } from '../store/app'
import { useChannels } from '../hooks/useChannels'
import { ALL_MESSAGES_ID, SCRATCH_ID, ALBUM_ID } from '../types'
import { t } from '../i18n'
import Sidebar from '../components/sidebar/Sidebar'
import ChatPanel from '../components/chat/ChatPanel'
import AvatarPanel from '../components/avatars/AvatarPanel'
import Settings from '../components/settings/Settings'
import About from '../components/about/About'
import DebugPanel from '../components/debug/DebugPanel'

export default function MobileLayout() {
  const [showSidebar, setShowSidebar] = useState(false)
  const [showAvatars, setShowAvatars] = useState(false)
  const [showAbout, setShowAbout] = useState(false)
  const [aboutTab, setAboutTab] = useState<'about' | 'help' | 'credits'>('about')
  const { selectedChannelId, avatarFilter, showSettings, setShowSettings, showDebug, setShowDebug, openAvatarPanelRequest, avatarPanelReturnToChat, setAvatarPanelReturnToChat } = useAppStore()
  const { channels } = useChannels()

  const currentChannel = channels.find(c => c.id === selectedChannelId)
  const channelName = (() => {
    if (selectedChannelId === ALL_MESSAGES_ID) return t('sidebar.allMessages')
    if (selectedChannelId === SCRATCH_ID) return t('sidebar.scratch')
    if (selectedChannelId === ALBUM_ID) return t('sidebar.album')
    return currentChannel?.name ?? ''
  })()
  const channelColor = currentChannel?.color ?? undefined

  useEffect(() => {
    if (openAvatarPanelRequest === 0) return
    setShowAvatars(true)
    setShowSidebar(false)
  }, [openAvatarPanelRequest])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === '`') { e.preventDefault(); setShowDebug(!showDebug) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [showDebug])

  // Track visual viewport so the layout fits the area above the keyboard.
  // On iOS WKWebView: vv.height shrinks when keyboard appears; vv.offsetTop shifts the
  // visual viewport down relative to the layout viewport (content appears off the top).
  // We apply both height and a translateY to keep the layout inside the visible area.
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const root = document.documentElement
    const update = () => {
      root.style.setProperty('--mobile-viewport-height', `${vv.height}px`)
      root.style.setProperty('--mobile-viewport-offset', `${vv.offsetTop}px`)
    }
    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
      root.style.removeProperty('--mobile-viewport-height')
      root.style.removeProperty('--mobile-viewport-offset')
    }
  }, [])

  return (
    <div className="app-layout mobile">
      {showDebug && <DebugPanel onClose={() => setShowDebug(false)} />}
      <div className="mobile-top-bar">
        <button
          className={`mobile-top-btn${showSidebar ? ' active' : ''}`}
          onClick={() => { setShowSidebar(v => !v); setShowAvatars(false) }}
          title="Channels"
        >☰</button>
        <span className="mobile-top-title" style={channelColor ? { color: channelColor } : undefined}>{channelName}</span>
        <button
          className={`mobile-top-btn${showAvatars ? ' active' : ''}`}
          onClick={() => { setShowAvatars(v => !v); setShowSidebar(false) }}
          title="Avatars"
        >◉</button>
        <button
          className="mobile-top-btn"
          onClick={() => setShowAbout(true)}
          title="About"
        >?</button>
        <button
          className={`mobile-top-btn${showSettings ? ' active' : ''}`}
          onClick={() => setShowSettings(!showSettings)}
          title="Settings"
        >⚙</button>
      </div>

      <ChatPanel channelId={selectedChannelId} avatarFilter={avatarFilter} />

      {showSidebar && (
        <div className="mobile-overlay">
          <Sidebar onClose={() => setShowSidebar(false)} />
        </div>
      )}

      {showAvatars && (
        <div className="mobile-overlay">
          <AvatarPanel
            channelId={selectedChannelId}
            autoClose={avatarPanelReturnToChat}
            onClose={() => { setShowAvatars(false); setAvatarPanelReturnToChat(false) }}
          />
        </div>
      )}

      {showSettings && <Settings />}

      {showAbout && <About onClose={() => setShowAbout(false)} tab={aboutTab} onTabChange={setAboutTab} />}
    </div>
  )
}
