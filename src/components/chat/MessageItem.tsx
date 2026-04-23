import { useState } from 'react'
import type { CSSProperties } from 'react'
import type { RenderedMessage } from '../../lib/messageUtils'
import type { MessageRow, TrackerRecord, Avatar } from '../../types'
import { assetUrl, getMessageDisplayText } from '../../types'
import { fmtRestoreTime, fmtMsgTime } from '../../lib/formatTime'
import FrontLogMessage, { isFrontSentinel } from './FrontLogMessage'
import ImageMessage from './ImageMessage'
import TrackerRecordCard, { formatTrackerSummary } from './TrackerRecordCard'
import { addLog } from '../../store/debug'
import { t } from '../../i18n'

function inspectMessage(msg: MessageRow) {
  const parent = msg.parent_msg_id != null ? `parent=#${msg.parent_msg_id}` : 'parent=none'
  const preview = msg.text.replace(/\n/g, '↵').slice(0, 50)
  addLog(`msg#${msg.id} ${parent} ch=${msg.channel_name} avatar=${msg.avatar_name ?? '—'}: "${preview}"`, 'debug')
}

export interface LogMsgProps {
  msg: RenderedMessage
  parentMsg?: MessageRow
  isAllMessages: boolean
  editing: string | null
  onEditStart: () => void
  onEditChange: (v: string) => void
  onEditSave: () => void
  onEditCancel: () => void
  onReply?: (msg: RenderedMessage) => void
  trackerRecord?: TrackerRecord
  avatars: Avatar[]
  use24HourClock: boolean
  deleteWindowMinutes: number
  editWindowMinutes: number
  onDelete: () => void
  onUndelete: () => void
}

export function LogMessageItem({ msg, parentMsg, isAllMessages, editing, onEditStart, onEditChange, onEditSave, onEditCancel, onReply, trackerRecord, avatars, use24HourClock, deleteWindowMinutes, editWindowMinutes, onDelete, onUndelete }: LogMsgProps) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const isReply = msg.parent_msg_id != null
  const ageMs = Date.now() - new Date(msg.created_at + 'Z').getTime()
  const isFrontLog = isFrontSentinel(msg.text)
  const deletable = deleteWindowMinutes > 0 && !msg.tracker_record_id && !isFrontLog && !msg.deleted && ageMs < deleteWindowMinutes * 60_000
  const editable = editWindowMinutes > 0 && !msg.tracker_record_id && !isFrontLog && !msg.deleted && ageMs < editWindowMinutes * 60_000
  const restoreUntilStr = fmtRestoreTime(msg.created_at, deleteWindowMinutes)

  function handleDoubleClick() {
    if (msg.deleted) { onUndelete(); return }
    if (editable) onEditStart()
  }

  return (
    <div
      className={`log-msg-row${isReply ? ' log-msg-reply' : ''}`}
      onDoubleClick={handleDoubleClick}
      onClick={e => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); inspectMessage(msg) } }}
    >
      {isReply && parentMsg && (
        <span className="log-parent-line">
          <span className="log-parent-name" style={{ color: parentMsg.avatar_color ?? 'var(--text-muted)' }}>
            ↩ {parentMsg.avatar_name ?? '—'}:
          </span>
          {' '}<span className="log-parent-text">{getMessageDisplayText(parentMsg).slice(0, 60)}{getMessageDisplayText(parentMsg).length > 60 ? '…' : ''}</span>
        </span>
      )}
      <span className="log-msg-name" style={{ color: msg.avatar_color ?? 'var(--text-muted)' }}>
        {isAllMessages && <span className="log-channel-prefix">{msg.channel_name} · </span>}
        {msg.avatar_name ?? '—'}:{' '}
      </span>
      {msg.deleted ? (
        <span className="log-msg-deleted">{t('chat.deletedRestoreUntil', { time: restoreUntilStr })}</span>
      ) : editing !== null ? (
        <span className="log-edit-row">
          <textarea
            autoFocus
            value={editing}
            onChange={e => onEditChange(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onEditSave() }
              if (e.key === 'Escape') onEditCancel()
            }}
          />
          <button onClick={onEditSave}>{t('chat.save')}</button>
          <button onClick={onEditCancel}>{t('chat.cancel')}</button>
        </span>
      ) : msg.tracker_record_id !== null ? (
        <span className="log-msg-text log-tracker-record">
          {trackerRecord ? formatTrackerSummary(trackerRecord, avatars, use24HourClock) : '…'}
        </span>
      ) : msg.image_path !== null ? (
        <span className="log-msg-text log-tracker-record">[image] {msg.image_caption ?? ''}</span>
      ) : isFrontLog ? (
        <FrontLogMessage msg={msg} />
      ) : (
        <span className="log-msg-text">{msg.text}</span>
      )}
      {editable && editing === null && (
        <button className="log-edit-btn" onClick={e => { e.stopPropagation(); onEditStart() }} title="Edit">✎</button>
      )}
      {!msg.deleted && onReply && (
        <button className="log-reply-btn" onClick={e => { e.stopPropagation(); onReply(msg) }} title="Reply">↩</button>
      )}
      {!!msg.deleted && (
        <button className="log-restore-btn" onClick={e => { e.stopPropagation(); onUndelete() }} title="Restore">↺</button>
      )}
      {deletable && editing === null && (
        confirmDelete ? (
          <span className="log-delete-confirm" onClick={e => e.stopPropagation()}>
            <span className="log-delete-confirm-label">{t('chat.confirmDelete')}</span>
            <button className="log-delete-yes" onClick={() => { setConfirmDelete(false); onDelete() }}>{t('chat.confirmDeleteYes')}</button>
            <button className="log-delete-no" onClick={() => setConfirmDelete(false)}>{t('chat.confirmDeleteNo')}</button>
          </span>
        ) : (
          <button className="log-delete-btn" onClick={e => { e.stopPropagation(); setConfirmDelete(true) }} title={t('chat.delete')}>✕</button>
        )
      )}
    </div>
  )
}

// ── Normal view ───────────────────────────────────────────────────────────────

export interface MsgProps {
  msg: MessageRow
  depth: number
  depthStyle: (depth: number) => CSSProperties | undefined
  isAllMessages: boolean
  editing: string | null
  onEditStart: () => void
  onEditChange: (v: string) => void
  onEditSave: () => void
  onEditCancel: () => void
  onReply?: () => void
  trackerRecord?: TrackerRecord
  avatars: Avatar[]
  use24HourClock: boolean
  deleteWindowMinutes: number
  editWindowMinutes: number
  onDelete: () => void
  onUndelete: () => void
}

export function MessageItem({ msg, depth, depthStyle, isAllMessages, editing, onEditStart, onEditChange, onEditSave, onEditCancel, onReply, trackerRecord, avatars, use24HourClock, deleteWindowMinutes, editWindowMinutes, onDelete, onUndelete }: MsgProps) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const ageMs = Date.now() - new Date(msg.created_at + 'Z').getTime()
  const isFrontLog = isFrontSentinel(msg.text)
  const deletable = deleteWindowMinutes > 0 && !msg.tracker_record_id && !isFrontLog && !msg.deleted && ageMs < deleteWindowMinutes * 60_000
  const editable = editWindowMinutes > 0 && !msg.tracker_record_id && !isFrontLog && !msg.deleted && ageMs < editWindowMinutes * 60_000
  const restoreUntilStr = fmtRestoreTime(msg.created_at, deleteWindowMinutes)
  const { timeStr, dateStr } = fmtMsgTime(msg.created_at, use24HourClock)

  function handleDoubleClick() {
    if (msg.deleted) { onUndelete(); return }
    if (editable) onEditStart()
  }

  return (
    <div className="message-item" style={depthStyle(depth)} onDoubleClick={handleDoubleClick} onClick={e => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); inspectMessage(msg) } }}>
      <div className="message-avatar-col">
        {msg.avatar_image_data
          ? <img src={`data:image/png;base64,${msg.avatar_image_data}`} className="message-avatar-img" alt={msg.avatar_name ?? ''} />
          : msg.avatar_image_path
          ? <img src={assetUrl(msg.avatar_image_path)!} className="message-avatar-img" alt={msg.avatar_name ?? ''} />
          : <div className="message-avatar-dot" style={{ background: msg.avatar_color ?? 'var(--text-muted)' }} />
        }
        {!msg.deleted && onReply && (
          <button className="reply-btn" onClick={e => { e.stopPropagation(); onReply() }} title="Reply">↩</button>
        )}
      </div>
      <div className="message-body">
        <div className="message-meta">
          <span className="message-avatar-name" style={{ color: msg.avatar_color ?? 'var(--text-muted)' }}>
            {msg.avatar_name ?? '—'}
          </span>
          {isAllMessages && <span className="message-muted"> · {msg.channel_name}</span>}
          <span className="message-muted"> · {dateStr} {timeStr}</span>
          {!msg.deleted && msg.original_text && <span className="message-edited"> {t('chat.edited')}</span>}
          {editable && editing === null && (
            <button className="msg-edit-btn" onClick={e => { e.stopPropagation(); onEditStart() }} title="Edit">✎</button>
          )}
          {!!msg.deleted && (
            <button className="msg-restore-btn" onClick={e => { e.stopPropagation(); onUndelete() }} title="Restore">↺</button>
          )}
          {deletable && editing === null && (
            confirmDelete ? (
              <span className="msg-delete-confirm" onClick={e => e.stopPropagation()}>
                <span className="msg-delete-confirm-label">{t('chat.confirmDelete')}</span>
                <button className="msg-delete-yes" onClick={() => { setConfirmDelete(false); onDelete() }}>{t('chat.confirmDeleteYes')}</button>
                <button className="msg-delete-no" onClick={() => setConfirmDelete(false)}>{t('chat.confirmDeleteNo')}</button>
              </span>
            ) : (
              <button className="msg-delete-btn" onClick={e => { e.stopPropagation(); setConfirmDelete(true) }} title={t('chat.delete')}>✕</button>
            )
          )}
        </div>
        {msg.deleted ? (
          <p className="message-deleted">{t('chat.deletedRestoreUntil', { time: restoreUntilStr })}</p>
        ) : editing !== null ? (
          <div className="edit-row">
            <textarea
              autoFocus
              value={editing}
              onChange={e => onEditChange(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onEditSave() }
                if (e.key === 'Escape') onEditCancel()
              }}
            />
            <button onClick={onEditSave}>{t('chat.save')}</button>
            <button onClick={onEditCancel}>{t('chat.cancel')}</button>
          </div>
        ) : msg.tracker_record_id !== null ? (
          <TrackerRecordCard record={trackerRecord} avatars={avatars} use24HourClock={use24HourClock} />
        ) : msg.image_path !== null ? (
          <ImageMessage msg={msg} />
        ) : isFrontLog ? (
          <FrontLogMessage msg={msg} />
        ) : (
          <p className="message-text">{msg.text}</p>
        )}
      </div>
    </div>
  )
}
