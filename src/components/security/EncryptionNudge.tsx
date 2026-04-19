import { t } from '../../i18n'
import './EncryptionNudge.css'

interface Props {
  onEncryptNow: () => void
  onAskLater: () => void
  onIgnore: () => void
}

export default function EncryptionNudge({ onEncryptNow, onAskLater, onIgnore }: Props) {
  return (
    <div className="nudge-overlay">
      <div className="nudge-card">
        <div className="nudge-title">{t('nudge.title')}</div>
        <p className="nudge-body">{t('nudge.body')}</p>
        <div className="nudge-actions">
          <button className="nudge-later-btn" onClick={onIgnore}>{t('nudge.ignore')}</button>
          <button className="nudge-later-btn" onClick={onAskLater}>{t('nudge.askLater')}</button>
          <button className="nudge-encrypt-btn" onClick={onEncryptNow}>{t('nudge.encryptNow')}</button>
        </div>
      </div>
    </div>
  )
}
