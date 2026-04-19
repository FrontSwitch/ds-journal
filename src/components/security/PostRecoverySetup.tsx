import { useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { t } from '../../i18n'
import RecoveryCodeDisplay from './RecoveryCodeDisplay'
import PassphraseStrength from './PassphraseStrength'
import '../security/PassphrasePrompt.css'

interface Props {
  onComplete: (remember: boolean) => void
}

export default function PostRecoverySetup({ onComplete }: Props) {
  const [newPass, setNewPass] = useState('')
  const [confirm, setConfirm] = useState('')
  const [remember, setRemember] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null)

  async function handleSet() {
    if (!newPass) return
    if (newPass !== confirm) { setError(t('postRecovery.mismatch')); return }
    setBusy(true); setError(null)
    try {
      const code = await invoke<string>('db_rewrap_passphrase', {
        name: 'dsj',
        newPassphrase: newPass,
      })
      setRecoveryCode(code)
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleSet()
  }

  if (busy) {
    return (
      <div className="passphrase-screen">
        <div className="passphrase-box">
          <div className="passphrase-title">{t('postRecovery.setting')}</div>
          <div className="passphrase-subtitle">{t('postRecovery.settingDesc')}</div>
        </div>
      </div>
    )
  }

  if (recoveryCode) {
    return (
      <div className="passphrase-screen">
        <div className="passphrase-box" style={{ width: 400 }}>
          <RecoveryCodeDisplay
            recoveryCode={recoveryCode}
            onAcknowledged={() => onComplete(remember)}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="passphrase-screen">
      <div className="passphrase-box">
        <div className="passphrase-title">{t('postRecovery.title')}</div>
        <div className="passphrase-subtitle">{t('postRecovery.subtitle')}</div>
        <input
          className="passphrase-input"
          type="password"
          placeholder={t('postRecovery.newPassphrase')}
          value={newPass}
          onChange={e => { setNewPass(e.target.value); setError(null) }}
          onKeyDown={handleKeyDown}
          autoFocus
          disabled={busy}
        />
        <PassphraseStrength passphrase={newPass} />
        <input
          className="passphrase-input"
          type="password"
          placeholder={t('postRecovery.confirmPassphrase')}
          value={confirm}
          onChange={e => { setConfirm(e.target.value); setError(null) }}
          onKeyDown={handleKeyDown}
          disabled={busy}
        />
        {error && <div className="passphrase-error">{error}</div>}
        <label className="passphrase-remember" style={import.meta.env.DEV ? { opacity: 0.4, cursor: 'not-allowed' } : undefined}>
          <input
            type="checkbox"
            checked={remember}
            onChange={e => setRemember(e.target.checked)}
            disabled={busy || import.meta.env.DEV}
          />
          {t('postRecovery.rememberLabel')}
          {import.meta.env.DEV && <span style={{ fontSize: 11, marginLeft: 6 }}>{t('passphrase.devBuildNote')}</span>}
        </label>
        <button
          className="passphrase-btn"
          onClick={handleSet}
          disabled={busy || !newPass || !confirm}
        >
          {busy ? t('postRecovery.setting') : t('postRecovery.setBtn')}
        </button>
      </div>
    </div>
  )
}
