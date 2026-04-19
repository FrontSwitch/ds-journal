import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useAppStore } from '../../store/app'
import { saveConfig } from '../../config'
import { getDbKey, setDbKey } from '../../db/index'
import { t } from '../../i18n'
import PassphraseStrength from '../security/PassphraseStrength'

interface Props { onClose: () => void }

export default function Security({ onClose }: Props) {
  const { config, setConfig, setPendingRecoveryCode } = useAppStore()
  const encrypted = config.security.encryptDatabase
  const remember  = config.security.rememberPassphrase

  // Whether the DB uses the vault system (vs. legacy passphrase-as-key)
  const [vaultMode, setVaultMode] = useState<boolean | null>(null)

  useEffect(() => {
    if (!encrypted) { setVaultMode(null); return }
    invoke<boolean>('vault_exists', { name: 'dsj' }).then(setVaultMode)
  }, [encrypted])

  // ── enable / upgrade encryption ────────────────────────────────────────────
  const [enablePass,     setEnablePass]     = useState('')
  const [enableConfirm,  setEnableConfirm]  = useState('')
  const [enableRemember, setEnableRemember] = useState(false)
  const [enableError,    setEnableError]    = useState<string | null>(null)
  const [enableBusy,     setEnableBusy]     = useState(false)

  function handleEnableStep1() {
    if (!enablePass) return
    if (enablePass !== enableConfirm) { setEnableError(t('security.mismatchError')); return }
    setEnableError(null)
    handleEnable()
  }

  async function handleEnable() {
    setEnableBusy(true); setEnableError(null)
    // Yield to let React render the busy overlay before Argon2 starts
    await new Promise(r => setTimeout(r, 50))
    console.log('[encrypt] starting db_setup_encryption, enableBusy should be true')
    try {
      const result = await invoke<{ key: string; recovery_code: string }>(
        'db_setup_encryption', { name: 'dsj', passphrase: enablePass }
      )
      setDbKey(result.key)
      if (enableRemember) await invoke('keychain_set', { password: result.key })
      const next = { ...config, security: { encryptDatabase: true, rememberPassphrase: enableRemember } }
      setConfig(next); saveConfig(next)
      setVaultMode(true)
      setPendingRecoveryCode(result.recovery_code)
      console.log('[encrypt] done, recovery code pending')
    } catch (e) {
      console.error('[encrypt] failed:', e)
      setEnableError(String(e))
    } finally {
      setEnableBusy(false)
    }
  }

  // ── change passphrase ──────────────────────────────────────────────────────
  const [changeCurrent,  setChangeCurrent]  = useState('')
  const [changeNew,      setChangeNew]      = useState('')
  const [changeConfirm,  setChangeConfirm]  = useState('')
  const [changeError,    setChangeError]    = useState<string | null>(null)
  const [changeBusy,     setChangeBusy]     = useState(false)

  async function handleRekey() {
    if (!changeCurrent || !changeNew) return
    if (changeNew !== changeConfirm) { setChangeError(t('security.mismatchError')); return }
    setChangeBusy(true); setChangeError(null)
    try {
      await invoke('db_open_passphrase', { name: 'dsj', passphrase: changeCurrent })
      const code = await invoke<string>('db_rewrap_passphrase', { name: 'dsj', newPassphrase: changeNew })
      setChangeCurrent(''); setChangeNew(''); setChangeConfirm('')
      setPendingRecoveryCode(code)
    } catch (e) {
      setChangeError(String(e))
    } finally {
      setChangeBusy(false)
    }
  }

  // ── disable encryption ─────────────────────────────────────────────────────
  const [disablePass,  setDisablePass]  = useState('')
  const [disableError, setDisableError] = useState<string | null>(null)
  const [disableBusy,  setDisableBusy]  = useState(false)

  async function handleDisable() {
    if (!disablePass) return
    setDisableBusy(true); setDisableError(null)
    try {
      await invoke('db_disable_encryption', { name: 'dsj', passphrase: disablePass })
      setDbKey(undefined)
      await invoke('keychain_delete')
      const next = { ...config, security: { encryptDatabase: false, rememberPassphrase: false } }
      setConfig(next); saveConfig(next)
      setDisablePass(''); setVaultMode(null)
    } catch (e) {
      setDisableError(String(e))
    } finally {
      setDisableBusy(false)
    }
  }

  // ── remember toggle ────────────────────────────────────────────────────────
  const [rememberBusy, setRememberBusy] = useState(false)

  async function handleRememberToggle(checked: boolean) {
    setRememberBusy(true)
    try {
      if (checked) {
        const key = getDbKey()
        if (!key) throw new Error('No active key — restart and unlock first')
        await invoke('keychain_set', { password: key })
      } else {
        await invoke('keychain_delete')
      }
      const next = { ...config, security: { ...config.security, rememberPassphrase: checked } }
      setConfig(next); saveConfig(next)
    } catch (e) {
      console.error('[security] remember toggle:', e)
    } finally {
      setRememberBusy(false)
    }
  }

  const isUpgrade = encrypted && vaultMode === false
  const showEnable = !encrypted || isUpgrade

  return (
    <div style={{ position: 'relative' }}>
      {enableBusy && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 10,
          background: 'var(--bg-panel)',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 10,
        }}>
          <div className="settings-section-title">{t('security.encrypting')}</div>
          <p className="muted" style={{ textAlign: 'center' }}>{t('security.encryptingDesc')}</p>
        </div>
      )}
      <div className="editor-header">
        <span>{t('security.title')}</span>
        <button className="editor-close" onClick={onClose}>✕</button>
      </div>
      <div className="editor-body single">
        <div className="editor-col" style={{ maxWidth: 400, gap: 6 }}>

          {/* ── status ── */}
          <div className="settings-section-title">{t('security.encryptionTitle')}</div>
          <p className="muted">
            {encrypted ? t('security.encryptedStatus') : t('security.unencryptedStatus')}
          </p>
          <p className="muted" style={{ color: '#f38ba8', fontStyle: 'normal' }}>
            {t('security.warning')}
          </p>

          {/* ── enable / upgrade ── */}
          {showEnable && (
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div className="settings-section-title">
                {isUpgrade ? t('security.upgradeTitle') : t('security.enableTitle')}
              </div>
              {isUpgrade && (
                <p className="muted">{t('security.upgradeDesc')}</p>
              )}
              <input
                type="password"
                placeholder={t('security.newPassphrase')}
                value={enablePass}
                onChange={e => { setEnablePass(e.target.value); setEnableError(null) }}
              />
              <PassphraseStrength passphrase={enablePass} />
              <input
                type="password"
                placeholder={t('security.confirmPassphrase')}
                value={enableConfirm}
                onChange={e => { setEnableConfirm(e.target.value); setEnableError(null) }}
              />
              {enableError && <p className="muted" style={{ color: '#f38ba8', fontStyle: 'normal' }}>{enableError}</p>}
              {!isUpgrade && (
                <label className="field-label checkbox-label">
                  <input
                    type="checkbox"
                    checked={enableRemember}
                    onChange={e => setEnableRemember(e.target.checked)}
                  />
                  {t('security.rememberLabel')}
                </label>
              )}
              <button
                className="save-btn"
                onClick={handleEnableStep1}
                disabled={enableBusy || !enablePass || !enableConfirm}
              >
                {enableBusy
                  ? (isUpgrade ? t('security.upgrading') : t('security.encrypting'))
                  : (isUpgrade ? t('security.upgradeBtn') : t('security.encryptBtn'))}
              </button>
            </div>
          )}

          {/* ── encrypted controls ── */}
          {encrypted && vaultMode === true && (
            <>
              <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div className="settings-section-title">{t('security.rememberTitle')}</div>
                <p className="muted">{t('security.rememberDesc')}</p>
                <label className="field-label checkbox-label" style={import.meta.env.DEV ? { opacity: 0.4, cursor: 'not-allowed' } : undefined}>
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={e => handleRememberToggle(e.target.checked)}
                    disabled={rememberBusy || import.meta.env.DEV}
                  />
                  {t('security.rememberLabel')}
                  {import.meta.env.DEV && <span style={{ fontSize: 11, marginLeft: 6 }}>{t('security.devBuildNote')}</span>}
                </label>
              </div>

              <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6, cursor: changeBusy ? 'wait' : undefined }}>
                <div className="settings-section-title">{t('security.changeTitle')}</div>
                <p className="muted">{t('security.changeDesc')}</p>
                <input
                  type="password"
                  placeholder={t('security.currentPassphrase')}
                  value={changeCurrent}
                  onChange={e => { setChangeCurrent(e.target.value); setChangeError(null) }}
                  disabled={changeBusy}
                />
                <input
                  type="password"
                  placeholder={t('security.newPassphrase')}
                  value={changeNew}
                  onChange={e => { setChangeNew(e.target.value); setChangeError(null) }}
                  disabled={changeBusy}
                />
                <PassphraseStrength passphrase={changeNew} />
                <input
                  type="password"
                  placeholder={t('security.confirmPassphrase')}
                  value={changeConfirm}
                  onChange={e => { setChangeConfirm(e.target.value); setChangeError(null) }}
                  disabled={changeBusy}
                />
                {changeError && <p className="muted" style={{ color: '#f38ba8', fontStyle: 'normal' }}>{changeError}</p>}
                <button
                  className="save-btn"
                  onClick={handleRekey}
                  disabled={changeBusy || !changeCurrent || !changeNew || !changeConfirm}
                >
                  {changeBusy ? t('security.changing') : t('security.changeBtn')}
                </button>
              </div>

              <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div className="settings-section-title">{t('security.disableTitle')}</div>
                <p className="muted">{t('security.disableDesc')}</p>
                <input
                  type="password"
                  placeholder={t('security.currentPassphrase')}
                  value={disablePass}
                  onChange={e => setDisablePass(e.target.value)}
                  disabled={disableBusy}
                />
                {disableError && <p className="muted" style={{ color: '#f38ba8', fontStyle: 'normal' }}>{disableError}</p>}
                <button
                  className="delete-btn"
                  onClick={handleDisable}
                  disabled={disableBusy || !disablePass}
                >
                  {disableBusy ? t('security.decrypting') : t('security.disableBtn')}
                </button>
              </div>
            </>
          )}

        </div>
      </div>
    </div>
  )
}
