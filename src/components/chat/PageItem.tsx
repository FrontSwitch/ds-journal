import { useState } from 'react'
import type { MessageRow } from '../../types'
import { assetUrl } from '../../types'
import { fmtMsgTime } from '../../lib/formatTime'

function extractPageTitle(html: string): string {
  const tmp = document.createElement('div')
  tmp.innerHTML = html
  const first = tmp.querySelector('h1,h2,h3,h4,h5,h6,p')
  const text = first?.textContent?.trim() ?? ''
  return text.length > 100 ? text.slice(0, 100) + '…' : text
}

export default function PageItem({ msg, use24HourClock }: { msg: MessageRow; use24HourClock: boolean }) {
  const [expanded, setExpanded] = useState(true)
  const { timeStr, dateStr } = fmtMsgTime(msg.created_at, use24HourClock)
  const title = extractPageTitle(msg.text)
  return (
    <div className={`page-item${expanded ? ' page-item-expanded' : ''}`}>
      <button className="page-item-header" onClick={() => setExpanded(v => !v)}>
        {msg.avatar_image_data
          ? <img src={`data:image/png;base64,${msg.avatar_image_data}`} className="page-item-avatar-img" alt={msg.avatar_name ?? ''} />
          : msg.avatar_image_path
          ? <img src={assetUrl(msg.avatar_image_path)!} className="page-item-avatar-img" alt={msg.avatar_name ?? ''} />
          : <span className="page-item-avatar-dot" style={{ background: msg.avatar_color ?? 'var(--text-muted)' }} />
        }
        <span className="page-item-author" style={{ color: msg.avatar_color ?? 'var(--text-muted)' }}>
          {msg.avatar_name ?? '—'}
        </span>
        {title && <span className="page-item-title">{title}</span>}
        <span className="page-item-meta">{dateStr} {timeStr}</span>
        <span className="page-item-chevron">{expanded ? '▾' : '▸'}</span>
      </button>
      {expanded && (
        <div className="page-item-body" dangerouslySetInnerHTML={{ __html: msg.text }} />
      )}
    </div>
  )
}
