import { useEffect, useState } from 'react'
import { useAppStore } from '../../store/app'
import { t } from '../../i18n'
import EditAvatars from './EditAvatars'
import EditAvatarFields from './EditAvatarFields'
import EditGroups from './EditGroups'
import EditChannels from './EditChannels'
import EditTrackers from './EditTrackers'
import EditTags from './EditTags'
import EditShortcodes from './EditShortcodes'
import EditConfig from './EditConfig'
import Backup from './Backup'
import Security from './Security'
import Import from './Import'
import Sync from './Sync'
import './Settings.css'

type Editor = 'avatars' | 'avatarFields' | 'groups' | 'channels' | 'trackers' | 'tags' | 'shortcodes' | 'config' | 'backup' | 'security' | 'import' | 'sync' | null

export default function Settings() {
  const { setShowSettings, pendingEditAvatarId, setPendingEditAvatarId, pendingSettingsPage, setPendingSettingsPage } = useAppStore()
  const [editor, setEditor] = useState<Editor>(null)

  useEffect(() => {
    if (pendingEditAvatarId !== null) setEditor('avatars')
  }, [pendingEditAvatarId])

  useEffect(() => {
    if (pendingSettingsPage) {
      setEditor(pendingSettingsPage as Editor)
      setPendingSettingsPage(null)
    }
  }, [pendingSettingsPage])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      if (editor !== null) setEditor(null)
      else setShowSettings(false)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [editor, setShowSettings])

  return (
    <div className="settings">
      <div className="settings-header">
        <span>{t('settings.title')}</span>
        <button className="settings-close" onClick={() => setShowSettings(false)}>✕</button>
      </div>
      {editor === null && (
        <div className="settings-null-editor">
          <div className="settings-main">
            <div className="settings-group-label">{t('settings.sectionApp')}</div>
            <button className="settings-editor-btn" onClick={() => setEditor('config')}>{t('settings.appSettings')} <span>›</span></button>
            <button className="settings-editor-btn" onClick={() => setEditor('security')}>{t('settings.security')} <span>›</span></button>
            <button className="settings-editor-btn" onClick={() => setEditor('sync')}>{t('settings.sync')} <span>›</span></button>

            <div className="settings-group-label">{t('settings.sectionSystem')}</div>
            <button className="settings-editor-btn" onClick={() => setEditor('avatars')}>{t('settings.editAvatars')} <span>›</span></button>
            <button className="settings-editor-btn" onClick={() => setEditor('avatarFields')}>{t('settings.editAvatarFields')} <span>›</span></button>
            <button className="settings-editor-btn" onClick={() => setEditor('groups')}>{t('settings.editGroups')} <span>›</span></button>

            <div className="settings-group-label">{t('settings.sectionSpaces')}</div>
            <button className="settings-editor-btn" onClick={() => setEditor('channels')}>{t('settings.editChannels')} <span>›</span></button>
            <button className="settings-editor-btn" onClick={() => setEditor('trackers')}>{t('settings.editTrackers')} <span>›</span></button>

            <div className="settings-group-label">{t('settings.sectionCustomize')}</div>
            <button className="settings-editor-btn" onClick={() => setEditor('tags')}>{t('settings.editTags')} <span>›</span></button>
            <button className="settings-editor-btn" onClick={() => setEditor('shortcodes')}>{t('settings.editShortcodes')} <span>›</span></button>

            <div className="settings-group-label">{t('settings.sectionData')}</div>
            <button className="settings-editor-btn" onClick={() => setEditor('backup')}>{t('settings.backupExport')} <span>›</span></button>
            <button className="settings-editor-btn" onClick={() => setEditor('import')}>{t('settings.import')} <span>›</span></button>
          </div>
        </div>
      )}
      {editor === 'avatars' && (
        <EditAvatars
          initialAvatarId={pendingEditAvatarId ?? undefined}
          onClose={() => { setPendingEditAvatarId(null); setEditor(null) }}
        />
      )}
      {editor === 'avatarFields' && <EditAvatarFields onClose={() => setEditor(null)} />}
      {editor === 'groups' && <EditGroups onClose={() => setEditor(null)} />}
      {editor === 'channels' && <EditChannels onClose={() => setEditor(null)} />}
      {editor === 'trackers' && <EditTrackers onClose={() => setEditor(null)} />}
      {editor === 'tags' && <EditTags onClose={() => setEditor(null)} />}
      {editor === 'shortcodes' && <EditShortcodes onClose={() => setEditor(null)} />}
      {editor === 'config' && <EditConfig onClose={() => setEditor(null)} />}
      {editor === 'backup' && <Backup onClose={() => setEditor(null)} />}
      {editor === 'security' && <Security onClose={() => setEditor(null)} />}
      {editor === 'import' && <Import onClose={() => setEditor(null)} />}
      {editor === 'sync' && <Sync onClose={() => setEditor(null)} />}
    </div>
  )
}
