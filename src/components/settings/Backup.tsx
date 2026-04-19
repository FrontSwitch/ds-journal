import { useState, useEffect } from 'react'
import {
  loadBackupConfig, saveBackupConfig, runBackup, listBackups, exportToJson,
  openBackupsDir, type BackupConfig, type BackupEntry,
} from '../../db/backup'
import { t, tn } from '../../i18n'

interface Props { onClose: () => void }

export default function Backup({ onClose }: Props) {
  const [config, setConfig] = useState<BackupConfig>(loadBackupConfig)
  const [backups, setBackups] = useState<BackupEntry[]>([])
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    listBackups().then(setBackups)
  }, [])

  async function handleBackupNow() {
    setBusy(true)
    setStatus(null)
    try {
      const path = await runBackup('daily', config.dailyKeep)
      const updated = { ...config, lastDailyAt: new Date().toISOString() }
      saveBackupConfig(updated)
      setConfig(updated)
      setStatus(t('backup.savedStatus', { path }))
      setBackups(await listBackups())
    } catch (e) {
      setStatus(t('backup.errorStatus', { message: String(e) }))
    } finally {
      setBusy(false)
    }
  }

  function handleSaveConfig() {
    saveBackupConfig(config)
    setStatus(t('backup.saveSettings'))
  }

  async function handleExport() {
    setBusy(true)
    setStatus(null)
    try {
      const path = await exportToJson()
      setStatus(path ? t('backup.exportedStatus', { path }) : t('backup.cancelledStatus'))
    } catch (e) {
      setStatus(t('backup.errorStatus', { message: String(e) }))
    } finally {
      setBusy(false)
    }
  }

  function formatName(name: string): string {
    return name.replace('dsj_', '').replace('.db', '').replace('_', ' ').replace(/-/g, (_, o) => o > 10 ? ':' : '-')
  }

  return (
    <>
      <div className="editor-header">
        <span>{t('backup.title')}</span>
        <button className="editor-close" onClick={onClose}>✕</button>
      </div>
      <div className="editor-body single" style={{ overflowY: 'auto' }}>
        <div className="editor-col" style={{ gap: 20 }}>

          <div>
            <div className="settings-section-title">{t('backup.manualTitle')}</div>
            <p className="muted" style={{ marginBottom: 10 }}>{t('backup.manualDesc')}</p>
            <button className="save-btn" onClick={handleBackupNow} disabled={busy}>
              {busy ? t('backup.working') : t('backup.backupNow')}
            </button>
          </div>

          <div>
            <div className="settings-section-title">{t('backup.autoTitle')}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <label className="field-label checkbox-label">
                <input
                  type="checkbox"
                  checked={config.dailyEnabled}
                  onChange={e => setConfig(c => ({ ...c, dailyEnabled: e.target.checked }))}
                />
                {t('backup.dailyLabel')}
                <input
                  type="number"
                  min={1} max={30}
                  value={config.dailyKeep}
                  onChange={e => setConfig(c => ({ ...c, dailyKeep: Number(e.target.value) }))}
                  style={{ width: 48, marginLeft: 6, fontSize: 13 }}
                />
                {tn('backup.copy', config.dailyKeep)}
              </label>
              <label className="field-label checkbox-label">
                <input
                  type="checkbox"
                  checked={config.weeklyEnabled}
                  onChange={e => setConfig(c => ({ ...c, weeklyEnabled: e.target.checked }))}
                />
                {t('backup.weeklyLabel')}
                <input
                  type="number"
                  min={1} max={52}
                  value={config.weeklyKeep}
                  onChange={e => setConfig(c => ({ ...c, weeklyKeep: Number(e.target.value) }))}
                  style={{ width: 48, marginLeft: 6, fontSize: 13 }}
                />
                {tn('backup.copy', config.weeklyKeep)}
              </label>
              {config.lastDailyAt && (
                <div className="muted">{t('backup.lastDaily', { date: new Date(config.lastDailyAt).toLocaleString() })}</div>
              )}
              {config.lastWeeklyAt && (
                <div className="muted">{t('backup.lastWeekly', { date: new Date(config.lastWeeklyAt).toLocaleString() })}</div>
              )}
              <div>
                <button className="save-btn" onClick={handleSaveConfig}>{t('backup.saveSettings')}</button>
              </div>
            </div>
          </div>

          <div>
            <div className="settings-section-title">{t('backup.exportTitle')}</div>
            <p className="muted" style={{ marginBottom: 10 }}>{t('backup.exportDesc')}</p>
            <button className="save-btn" onClick={handleExport} disabled={busy}>
              {busy ? t('backup.working') : t('backup.exportBtn')}
            </button>
          </div>

          {status && (
            <div className="muted" style={{ wordBreak: 'break-all' }}>{status}</div>
          )}

          {backups.length > 0 && (
            <div>
              <div className="settings-section-title">{t('backup.backupsTitle')}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
                {backups.map(b => (
                  <div key={b.path} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
                    <span style={{ color: 'var(--text-muted)', fontSize: 11, flexShrink: 0, width: 44 }}>
                      {b.type}
                    </span>
                    <span style={{ color: 'var(--text)' }}>{formatName(b.name)}</span>
                  </div>
                ))}
              </div>
              <button className="add-btn" onClick={() => openBackupsDir()}>
                {t('backup.openFolderBtn')}
              </button>
              <p className="muted" style={{ marginTop: 10 }}>{t('backup.restoreWarning')}</p>
            </div>
          )}

        </div>
      </div>
    </>
  )
}
