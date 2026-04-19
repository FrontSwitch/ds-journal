import type { MessageRow } from '../../types'
import { t } from '../../i18n'

function formatFrontDuration(mins: number): string {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h === 0) return `${m}m`
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

/** Returns true if the message text is a structured front log sentinel. */
export function isFrontSentinel(text: string): boolean {
  return text.startsWith('|front:')
}

export default function FrontLogMessage({ msg }: { msg: MessageRow }) {
  const text = msg.text
  const name = msg.avatar_name ?? t('frontLogReport.anonymous')

  if (text === '|front:entered|') {
    return <p className="message-text front-log-message front-log-entered">{t('frontLog.entered', { name })}</p>
  }

  if (text === '|front:left|') {
    return <p className="message-text front-log-message front-log-left">{t('frontLog.left', { name })}</p>
  }

  if (text === '|front:cleared|') {
    return <p className="message-text front-log-message front-log-cleared">{t('frontLog.cleared')}</p>
  }

  if (text.startsWith('|front:session|')) {
    const parts = text.split('|')   // ['', 'front:session', mins, '']
    const mins = parseInt(parts[2])
    if (isNaN(mins) || mins === 0) {
      return <p className="message-text front-log-message">{t('frontLog.fronting')}</p>
    }
    return <p className="message-text front-log-message">{t('frontLog.session', { duration: formatFrontDuration(mins) })}</p>
  }

  if (text.startsWith('|front:co-session|')) {
    const parts = text.split('|')   // ['', 'front:co-session', mins, name1, name2, ...]
    const mins = parseInt(parts[2])
    const names = parts.slice(3).filter(Boolean).join(', ')
    if (isNaN(mins) || mins === 0) {
      return <p className="message-text front-log-message">{t('frontLog.fronting')}{names ? ` (${names})` : ''}</p>
    }
    return <p className="message-text front-log-message">{t('frontLog.coSession', { duration: formatFrontDuration(mins), names })}</p>
  }

  // Fallback: old plain-text front log messages render as-is
  return <p className="message-text front-log-message">{text}</p>
}
