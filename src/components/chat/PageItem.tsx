import { useState } from 'react'
import type { MessageRow } from '../../types'
import { AvatarIcon } from '../avatars/AvatarIcon'
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
        <AvatarIcon
          image_data={msg.avatar_image_data}
          image_path={msg.avatar_image_path}
          icon_letters={msg.avatar_icon_letters}
          name={msg.avatar_name ?? ''}
          color={msg.avatar_color}
          size={16}
        />
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
