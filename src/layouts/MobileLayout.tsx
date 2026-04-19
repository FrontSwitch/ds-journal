import { useState, useEffect } from 'react'
import { useAppStore } from '../store/app'
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
  const { selectedChannelId, avatarFilter, showSettings, setShowSettings, showDebug, setShowDebug } = useAppStore()

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === '`') { e.preventDefault(); setShowDebug(!showDebug) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [showDebug])

  return (
    <div className="app-layout mobile">
      {showDebug && <DebugPanel onClose={() => setShowDebug(false)} />}
      <div className="mobile-top-bar">
        <button
          className={`mobile-top-btn${showSidebar ? ' active' : ''}`}
          onClick={() => { setShowSidebar(v => !v); setShowAvatars(false) }}
          title="Channels"
        >☰</button>
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
          <AvatarPanel channelId={selectedChannelId} onClose={() => setShowAvatars(false)} />
        </div>
      )}

      {showSettings && <Settings />}

      {showAbout && <About onClose={() => setShowAbout(false)} tab={aboutTab} onTabChange={setAboutTab} />}
    </div>
  )
}
