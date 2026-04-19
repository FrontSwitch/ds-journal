import zxcvbn from 'zxcvbn'
import { t } from '../../i18n'
import './PassphraseStrength.css'

interface Props {
  passphrase: string
}

const COLORS = ['#f38ba8', '#fab387', '#f9e2af', '#a6e3a1', '#94e2d5']
const LABEL_KEYS = [
  'passphraseStrength.veryWeak',
  'passphraseStrength.weak',
  'passphraseStrength.fair',
  'passphraseStrength.strong',
  'passphraseStrength.veryStrong',
] as const

export default function PassphraseStrength({ passphrase }: Props) {
  if (!passphrase) return (
    <div className="pass-strength-hint">{t('passphraseStrength.hint')}</div>
  )

  const result = zxcvbn(passphrase)
  const score = result.score // 0–4
  const color = COLORS[score]
  // Argon2id is far slower than zxcvbn's 10k/s assumption, so this is conservative
  const crackTime = result.crack_times_display.offline_slow_hashing_1e4_per_second

  return (
    <div className="pass-strength">
      <div className="pass-strength-bar">
        {[0, 1, 2, 3, 4].map(i => (
          <div
            key={i}
            className="pass-strength-segment"
            style={{ background: i <= score ? color : undefined }}
          />
        ))}
      </div>
      <div className="pass-strength-meta">
        <span className="pass-strength-label" style={{ color }}>{t(LABEL_KEYS[score])}</span>
        <span className="pass-strength-time">{t('passphraseStrength.toCrack', { time: crackTime })}</span>
      </div>
      {score < 3 && (
        <div className="pass-strength-hint">{t('passphraseStrength.hint')}</div>
      )}
    </div>
  )
}
