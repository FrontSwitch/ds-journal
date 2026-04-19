import { useEffect } from 'react'
import { useAppStore } from '../store/app'
import Sidebar from '../components/sidebar/Sidebar'
import ChatPanel from '../components/chat/ChatPanel'
import AvatarPanel from '../components/avatars/AvatarPanel'
import Settings from '../components/settings/Settings'
import DebugPanel from '../components/debug/DebugPanel'

export default function DesktopLayout() {
  const { selectedChannelId, avatarFilter, showSettings, avatarPanelMode, showDebug, setShowDebug } = useAppStore()

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === '`') { e.preventDefault(); setShowDebug(!showDebug) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [showDebug])

  return (
    <div className={`app-layout${avatarPanelMode === 'hidden' ? ' hidden-avatars' : ''}${avatarPanelMode === 'full' ? ' wide-avatars' : ''}`}>
      {showDebug && <DebugPanel onClose={() => setShowDebug(false)} />}
      <Sidebar />
      {showSettings
        ? <Settings />
        : <ChatPanel channelId={selectedChannelId} avatarFilter={avatarFilter} />}
      {!showSettings && avatarPanelMode !== 'hidden' && <AvatarPanel channelId={selectedChannelId} />}
    </div>
  )
}
