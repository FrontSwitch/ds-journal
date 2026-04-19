import { useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { t } from '../../i18n'
import './PassphrasePrompt.css'

interface Props {
  onUnlock: (key: string, remember: boolean) => void
  onUnlockRecovery: (key: string) => void
  onReset: () => void
  defaultRemember: boolean
}

export default function PassphrasePrompt({ onUnlock, onUnlockRecovery, onReset, defaultRemember }: Props) {
  const [mode, setMode] = useState<'passphrase' | 'recovery'>('passphrase')
  const [value, setValue] = useState('')
  const [remember, setRemember] = useState(defaultRemember)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [showReset, setShowReset] = useState(false)
  const [resetConfirmText, setResetConfirmText] = useState('')

  function switchMode(next: 'passphrase' | 'recovery') {
    setMode(next)
    setValue('')
    setError(null)
    setShowReset(false)
    setResetConfirmText('')
  }

  async function handleUnlock() {
    if (!value) return
    setBusy(true); setError(null)
    try {
      if (mode === 'passphrase') {
        const key = await invoke<string>('db_open_passphrase', { name: 'dsj', passphrase: value })
        onUnlock(key, remember)
      } else {
        const key = await invoke<string>('db_open_recovery', { name: 'dsj', recoveryCode: value })
        onUnlockRecovery(key)
      }
    } catch {
      setError(mode === 'passphrase' ? t('passphrase.wrongPassphrase') : t('passphrase.wrongRecovery'))
      setBusy(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleUnlock()
  }

  return (
    <div className="passphrase-screen">
      <div className="passphrase-box" style={{ position: 'relative' }}>
        {busy && (
          <div style={{
            position: 'absolute', inset: 0, zIndex: 10, borderRadius: 'inherit',
            background: 'var(--bg-panel)',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 10,
          }}>
            <div className="passphrase-title">{t('passphrase.unlocking')}</div>
            <div className="passphrase-subtitle">{t('passphrase.unlockingDesc')}</div>
          </div>
        )}
        <div className="passphrase-title">{t('names.title')}</div>
        <div className="passphrase-subtitle">
          {mode === 'passphrase' ? t('passphrase.subtitle') : t('passphrase.recoverySubtitle')}
        </div>
        <input
          className="passphrase-input"
          type={mode === 'passphrase' ? 'password' : 'text'}
          placeholder={mode === 'passphrase' ? t('passphrase.placeholder') : t('passphrase.recoveryPlaceholder')}
          value={value}
          onChange={e => { setValue(e.target.value); setError(null) }}
          onKeyDown={handleKeyDown}
          autoFocus
          disabled={busy}
          spellCheck={false}
          autoComplete="off"
        />
        {error && <div className="passphrase-error">{error}</div>}

        {mode === 'passphrase' && (
          <label className="passphrase-remember" style={import.meta.env.DEV ? { opacity: 0.4, cursor: 'not-allowed' } : undefined}>
            <input
              type="checkbox"
              checked={remember}
              onChange={e => setRemember(e.target.checked)}
              disabled={busy || import.meta.env.DEV}
            />
            {t('passphrase.rememberLabel')}
            {import.meta.env.DEV && <span style={{ fontSize: 11, marginLeft: 6 }}>{t('passphrase.devBuildNote')}</span>}
          </label>
        )}

        <button
          className="passphrase-btn"
          onClick={handleUnlock}
          disabled={busy || !value}
        >
          {busy
            ? t('passphrase.unlocking')
            : mode === 'passphrase'
              ? t('passphrase.unlock')
              : t('passphrase.unlockRecovery')}
        </button>

        {mode === 'passphrase' ? (
          <>
            <button className="passphrase-forgot" onClick={() => switchMode('recovery')}>
              {t('passphrase.useRecovery')}
            </button>
            {!showReset
              ? <button className="passphrase-forgot" onClick={() => setShowReset(true)}>{t('passphrase.forgotBtn')}</button>
              : <div className="passphrase-reset-box">
                  <div className="passphrase-reset-warning" style={{ whiteSpace: 'pre-line' }}>{t('passphrase.resetWarning')}</div>
                  <input
                    className="passphrase-input"
                    type="text"
                    placeholder={t('passphrase.deleteConfirmPrompt')}
                    value={resetConfirmText}
                    onChange={e => setResetConfirmText(e.target.value)}
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <div className="passphrase-reset-actions">
                    <button className="passphrase-reset-cancel" onClick={() => { setShowReset(false); setResetConfirmText('') }}>{t('passphrase.cancel')}</button>
                    <button
                      className="passphrase-reset-confirm"
                      onClick={onReset}
                      disabled={resetConfirmText !== 'DELETE'}
                    >{t('passphrase.deleteAndStart')}</button>
                  </div>
                </div>
            }
          </>
        ) : (
          <button className="passphrase-forgot" onClick={() => switchMode('passphrase')}>
            {t('passphrase.usePassphrase')}
          </button>
        )}
      </div>
    </div>
  )
}
