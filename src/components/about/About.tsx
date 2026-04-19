import { openUrl } from '../../native/urls'
import pkg from '../../../package.json'
import logo from '../../assets/logo.svg'
import { t } from '../../i18n'
import DocRenderer from '../doc/DocRenderer'
import HelpRenderer from '../doc/HelpRenderer'
import credits from '../../content/credits.en'
import { help } from '../../content/help'
import './About.css'

interface Props {
  onClose: () => void
  tab: Tab
  onTabChange: (tab: Tab) => void
}

export type Tab = 'about' | 'help' | 'credits'

export default function About({ onClose, tab, onTabChange }: Props) {

  const box = (
    <div className="about-box" onClick={e => e.stopPropagation()}>
        <button className="about-close" onClick={onClose}>✕</button>
        <div className="about-title">{t('names.title')}</div>
        <div className="about-version-row">
          <span className="about-version">v{pkg.version}</span>
          <span className="about-early-access">{t('about.earlyAccess')}</span>
        </div>

        <div className="about-tabs">
          <button className={tab === 'about' ? 'active' : ''} onClick={() => onTabChange('about')}>{t('about.aboutTab')}</button>
          <button className={tab === 'help' ? 'active' : ''} onClick={() => onTabChange('help')}>{t('about.helpTab')}</button>
          <button className={tab === 'credits' ? 'active' : ''} onClick={() => onTabChange('credits')}>{t('about.creditsTab')}</button>
        </div>

        {tab === 'about' && (
          <div className="about-content">
            <p>{t('about.description')}</p>
            <p>{t('about.tagline').split('\n').map((line, i) => <span key={i}>{line}{i === 0 && <br />}</span>)}</p>
            {t('about.translationNotice') && (
              t('about.translationNoticeUrl')
                ? <button
                    className="about-translation-notice"
                    onClick={() => openUrl(t('about.translationNoticeUrl'))}
                  >{t('about.translationNotice')} ↗</button>
                : <p className="about-translation-notice">{t('about.translationNotice')}</p>
            )}
            <p className="about-crisis">
              If you are in crisis, call or text <strong>988</strong> (US &amp; Canada).{' '}
              <button className="about-crisis-link" onClick={() => openUrl('https://findahelpline.com')}>findahelpline.com</button>{' '}
              lists resources worldwide.
            </p>
          </div>
        )}

        {tab === 'help' && (
          <div className="about-content about-content-help">
            <HelpRenderer content={help} />
            <button
              className="about-docs-link"
              onClick={() => openUrl(t('help.docsUrl'))}
            >
              {t('help.docsLink')}
            </button>
          </div>
        )}

        {tab === 'credits' && (
          <div className="about-content">
            <DocRenderer nodes={credits} />
          </div>
        )}

        {tab === 'about' && (
          <button
            className="about-github"
            onClick={() => openUrl('https://github.com/FrontSwitch/dsj')}
          >
            <img src={logo} className="about-github-logo" alt="" />
            <span className="about-github-text">
              <span>Front Switch Studio</span>
              <span className="about-github-sub">Open source on GitHub ↗</span>
            </span>
          </button>
        )}

      </div>
  )

  return <div className="about-overlay" onClick={onClose}>{box}</div>
}
