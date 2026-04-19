import { useState } from 'react'
import { t } from '../../i18n'
import './RecoveryCodeDisplay.css'

interface Props {
  recoveryCode: string
  onAcknowledged: () => void
}

export default function RecoveryCodeDisplay({ recoveryCode, onAcknowledged }: Props) {
  const [copied, setCopied] = useState(false)
  const [acknowledged, setAcknowledged] = useState(false)

  async function handleCopy() {
    await navigator.clipboard.writeText(recoveryCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="recovery-display">
      <div className="recovery-title">{t('recovery.title')}</div>
      <p className="recovery-body">{t('recovery.body')}</p>
      <div className="recovery-code-box">
        <span className="recovery-code">{recoveryCode}</span>
        <button className="recovery-copy-btn" onClick={handleCopy}>
          {copied ? t('recovery.copied') : t('recovery.copyBtn')}
        </button>
      </div>
      <label className="recovery-ack-label">
        <input
          type="checkbox"
          checked={acknowledged}
          onChange={e => setAcknowledged(e.target.checked)}
        />
        {t('recovery.acknowledgeLabel')}
      </label>
      <button
        className="save-btn"
        onClick={onAcknowledged}
        disabled={!acknowledged}
      >
        {t('recovery.continueBtn')}
      </button>
    </div>
  )
}
