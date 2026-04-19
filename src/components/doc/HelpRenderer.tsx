import { useState } from 'react'
import { t } from '../../i18n'
import type { HelpContent, HelpNode } from '../../content/help'
import './HelpRenderer.css'

interface Props {
  content: HelpContent
}

function renderNode(node: HelpNode, key: number) {
  if (node.type === 'h2') return <h2 key={key}>{t(node.key as Parameters<typeof t>[0])}</h2>
  if (node.type === 'p') return <p key={key}>{t(node.key as Parameters<typeof t>[0])}</p>
  if (node.type === 'item') return <div key={key} className="help-item">{t(node.key as Parameters<typeof t>[0])}</div>
  if (node.type === 'img') return <img key={key} src={node.src} alt={node.altKey ? t(node.altKey as Parameters<typeof t>[0]) : ''} className="help-img" />
  return null
}

export default function HelpRenderer({ content }: Props) {
  const [activeTopic, setActiveTopic] = useState<string | null>(null)

  if (activeTopic) {
    const idx = content.topics.findIndex(tp => tp.id === activeTopic)
    const topic = content.topics[idx]
    if (!topic) return null
    const next = content.topics[idx + 1] ?? null
    return (
      <div className="help-subpage">
        <div className="help-nav">
          <button className="help-back" onClick={() => setActiveTopic(null)}>
            {t('help.back')}
          </button>
          {next && (
            <button className="help-next" onClick={() => setActiveTopic(next.id)}>
              {t('help.next')} ›
            </button>
          )}
        </div>
        <h2 className="help-subpage-title">{t(topic.titleKey as Parameters<typeof t>[0])}</h2>
        <div className="help-subpage-body">
          {topic.nodes.map((node, i) => renderNode(node, i))}
        </div>
      </div>
    )
  }

  return (
    <div className="help-index">
      <p className="help-intro">{t(content.introKey as Parameters<typeof t>[0])}</p>
      <ul className="help-topic-list">
        {content.topics.map(topic => (
          <li key={topic.id}>
            <button className="help-topic-btn" onClick={() => setActiveTopic(topic.id)}>
              {t(topic.titleKey as Parameters<typeof t>[0])}
              <span className="help-topic-arrow">›</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
