import { useEffect, useRef, useState } from 'react'
import { useAvatars } from '../../hooks/useAvatars'
import { useAppStore } from '../../store/app'
import { ALL_MESSAGES_ID, assetUrl, getInitials, isHidden } from '../../types'
import type { Avatar, AvatarField, AvatarFieldValue, AvatarNote } from '../../types'
import { t } from '../../i18n'
import { parseIntRange, intRangesOverlap, formatIntRange } from '../../lib/avatarFieldUtils'
import { getAvatarNotes, createAvatarNote, updateAvatarNote, deleteAvatarNote } from '../../db/avatars'
import { getCurrentFront, enterFront, exitFront } from '../../db/front-log'
import './AvatarPanel.css'

function formatNoteDate(iso: string): string {
  const d = new Date(iso.replace(' ', 'T'))
  const now = new Date()
  const sameYear = d.getFullYear() === now.getFullYear()
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) })
}

interface Props {
  channelId: number | null
  onClose?: () => void
}

function AvatarInfoPopup({ avatar, fields, fieldValues, avatars, selectedAvatarId, onClose, initialView }: {
  avatar: Avatar
  fields: AvatarField[]
  fieldValues: AvatarFieldValue[]
  avatars: Avatar[]
  selectedAvatarId: number | null
  onClose: () => void
  initialView?: 'edit'
}) {
  const myValues = fieldValues.filter(v => v.avatar_id === avatar.id)
  const valueMap: Record<number, string> = {}
  for (const v of myValues) valueMap[v.field_id] = v.value
  const filledFields = fields.filter(f => valueMap[f.id])

  const [notes, setNotes] = useState<AvatarNote[]>([])
  const [view, setView] = useState<'info' | 'view' | 'edit'>(initialView ?? 'info')
  const [editNote, setEditNote] = useState<AvatarNote | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editBody, setEditBody] = useState('')
  const [editColor, setEditColor] = useState('')
  const [editFavorite, setEditFavorite] = useState(false)
  const [editAuthorId, setEditAuthorId] = useState<number | null>(null)
  const [editEditorId, setEditEditorId] = useState<number | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    getAvatarNotes(avatar.id).then(setNotes)
  }, [avatar.id])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  function openNew() {
    setEditNote(null); setEditTitle(''); setEditBody('')
    setEditColor(''); setEditFavorite(false)
    setEditAuthorId(selectedAvatarId); setEditEditorId(null)
    setConfirmDelete(false); setView('edit')
  }

  function openView(note: AvatarNote) {
    setEditNote(note); setConfirmDelete(false); setView('view')
  }

  function openEdit(note: AvatarNote) {
    setEditNote(note); setEditTitle(note.title); setEditBody(note.body)
    setEditColor(note.color ?? ''); setEditFavorite(!!note.favorite)
    setEditAuthorId(note.author_avatar_id)
    setEditEditorId(note.editor_avatar_id)
    setConfirmDelete(false); setView('edit')
  }

  async function handleSave() {
    if (editNote) {
      await updateAvatarNote(editNote.id, editTitle, editBody, editColor || null, editFavorite ? 1 : 0, editEditorId)
      const refreshed = await getAvatarNotes(avatar.id)
      setNotes(refreshed)
      setEditNote(refreshed.find(n => n.id === editNote.id) ?? null)
      setView('view')
    } else {
      const newId = await createAvatarNote(avatar.id, editAuthorId, editTitle, editBody, editColor || null, editFavorite ? 1 : 0)
      const refreshed = await getAvatarNotes(avatar.id)
      setNotes(refreshed)
      setEditNote(refreshed.find(n => n.id === newId) ?? null)
      setView('view')
    }
  }

  async function handleDelete() {
    if (!editNote) return
    await deleteAvatarNote(editNote.id)
    setNotes(await getAvatarNotes(avatar.id))
    setView('info')
  }

  const visibleAvatars = avatars.filter(a => !isHidden(a.hidden))

  if (view === 'view' && editNote) {
    const author = visibleAvatars.find(a => a.id === editNote.author_avatar_id)
    return (
      <div className="avatar-info-overlay" onClick={onClose}>
        <div className="avatar-info-popup" onClick={e => e.stopPropagation()}>
          <div className="avatar-info-header">
            <button className="avatar-info-back" onClick={() => setView('info')}>←</button>
            <span className="avatar-info-edit-label" style={editNote.color ? { color: editNote.color } : undefined}>
              {editNote.title || t('avatarNotes.untitled')}
              {!!editNote.favorite && <span className="avatar-note-view-star"> ★</span>}
            </span>
            <button className="avatar-info-close" onClick={onClose}>✕</button>
          </div>
          <div className="avatar-note-view-meta">
            {formatNoteDate(editNote.updated_at)}
            {author && <> · {author.name}</>}
            {editNote.editor_avatar_id != null && (() => {
              const editor = visibleAvatars.find(a => a.id === editNote.editor_avatar_id)
              return editor ? <> → {editor.name}</> : null
            })()}
          </div>
          {editNote.body ? (
            <div className="avatar-note-view-body">{editNote.body}</div>
          ) : (
            <div className="avatar-note-view-empty">{t('avatarNotes.noContent')}</div>
          )}
          <div className="avatar-note-actions">
            <button className="avatar-note-save-btn" onClick={() => openEdit(editNote)}>{t('avatarNotes.editBtn')}</button>
          </div>
        </div>
      </div>
    )
  }

  if (view === 'edit') {
    return (
      <div className="avatar-info-overlay" onClick={onClose}>
        <div className="avatar-info-popup" onClick={e => e.stopPropagation()}>
          <div className="avatar-info-header">
            <button className="avatar-info-back" onClick={() => setView('info')}>←</button>
            <span className="avatar-info-edit-label">{editNote ? t('avatarNotes.editNoteTitle') : t('avatarNotes.newNoteTitle')}</span>
            <button className="avatar-info-close" onClick={onClose}>✕</button>
          </div>
          <div className="avatar-note-editor">
            <div className="avatar-note-title-row">
              <input
                className="avatar-note-title-input"
                value={editTitle}
                onChange={e => setEditTitle(e.target.value)}
                placeholder={t('avatarNotes.titlePlaceholder')}
                autoFocus
              />
              <button
                className={`avatar-note-fav-btn ${editFavorite ? 'active' : ''}`}
                onClick={() => setEditFavorite(f => !f)}
                title={t('avatarNotes.favorite')}
              >★</button>
            </div>
            <div className="avatar-note-meta-row">
              <label className="avatar-note-color-label">
                {t('avatarNotes.colorLabel')}
                <input
                  type="color"
                  value={editColor || '#888888'}
                  onChange={e => setEditColor(e.target.value)}
                  className="avatar-note-color-input"
                />
                {editColor && (
                  <button className="avatar-note-clear" onClick={() => setEditColor('')}>✕</button>
                )}
              </label>
              <label className="avatar-note-by-label">
                {t('avatarNotes.authorLabel')}
                {editNote ? (
                  <span className="avatar-note-by-fixed">
                    {visibleAvatars.find(a => a.id === editAuthorId)?.name ?? '—'}
                  </span>
                ) : (
                  <select
                    className="avatar-note-by-select"
                    value={editAuthorId ?? ''}
                    onChange={e => setEditAuthorId(e.target.value ? Number(e.target.value) : null)}
                  >
                    <option value="">—</option>
                    {visibleAvatars.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                )}
              </label>
              {editNote && (
                <label className="avatar-note-by-label">
                  {t('avatarNotes.editorLabel')}
                  <select
                    className="avatar-note-by-select"
                    value={editEditorId ?? ''}
                    onChange={e => setEditEditorId(e.target.value ? Number(e.target.value) : null)}
                  >
                    <option value="">—</option>
                    {visibleAvatars.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </label>
              )}
            </div>
            <textarea
              className="avatar-note-body"
              value={editBody}
              onChange={e => setEditBody(e.target.value)}
              placeholder={t('avatarNotes.bodyPlaceholder')}
              rows={8}
            />
            <div className="avatar-note-actions">
              <button className="avatar-note-save-btn" onClick={handleSave}>{t('avatarNotes.save')}</button>
              {editNote && !confirmDelete && (
                <button className="avatar-note-delete-btn" onClick={() => setConfirmDelete(true)}>{t('avatarNotes.delete')}</button>
              )}
              {editNote && confirmDelete && (
                <>
                  <button className="avatar-note-delete-btn" onClick={handleDelete}>{t('avatarNotes.confirm')}</button>
                  <button className="avatar-note-cancel-btn" onClick={() => setConfirmDelete(false)}>{t('avatarNotes.no')}</button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="avatar-info-overlay" onClick={onClose}>
      <div className="avatar-info-popup" onClick={e => e.stopPropagation()}>
        <div className="avatar-info-header">
          <div className="avatar-info-icon" style={{ background: avatar.color }}>
            {getInitials(avatar.name, [avatar.name])}
          </div>
          <div className="avatar-info-name-block">
            <span className="avatar-info-name">{avatar.name}</span>
            {avatar.pronouns && <span className="avatar-info-pronouns">{avatar.pronouns}</span>}
          </div>
          <button className="avatar-info-close" onClick={onClose}>✕</button>
        </div>
        {avatar.description && <p className="avatar-info-desc">{avatar.description}</p>}
        {filledFields.length > 0 && (
          <dl className="avatar-info-fields">
            {filledFields.map(f => (
              <div key={f.id} className="avatar-info-field-row">
                <dt>{f.name}</dt>
                <dd>{f.field_type === 'intRange' ? formatIntRange(valueMap[f.id]) : valueMap[f.id]}</dd>
              </div>
            ))}
          </dl>
        )}
        <div className="avatar-notes-section">
          <div className="avatar-notes-header">
            <span className="avatar-notes-label">{t('avatarNotes.notesSection')}</span>
            <button className="avatar-notes-add-btn" onClick={openNew}>{t('avatarNotes.addNote')}</button>
          </div>
          {notes.length === 0 ? (
            <div className="avatar-notes-empty">{t('avatarNotes.noNotes')}</div>
          ) : (
            <div className="avatar-notes-list">
              {notes.map(note => (
                <div
                  key={note.id}
                  className="avatar-note-item"
                  style={note.color ? { borderLeftColor: note.color } : undefined}
                  onClick={() => openView(note)}
                >
                  <div className="avatar-note-item-top">
                    <span className="avatar-note-item-title">{note.title || t('avatarNotes.untitled')}</span>
                    {!!note.favorite && <span className="avatar-note-item-star">★</span>}
                  </div>
                  <div className="avatar-note-item-meta">
                    {formatNoteDate(note.updated_at)}
                    {note.author_avatar_id != null && (
                      <> · {visibleAvatars.find(a => a.id === note.author_avatar_id)?.name ?? '?'}</>
                    )}
                    {note.editor_avatar_id != null && (
                      <> → {visibleAvatars.find(a => a.id === note.editor_avatar_id)?.name ?? '?'}</>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

interface ContextMenu { avatar: Avatar; x: number; y: number }

export default function AvatarPanel({ channelId, onClose }: Props) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [filter, setFilter] = useState('')
  const [fieldFilterId, setFieldFilterId] = useState<number | null>(null)
  const [fieldFilterValue, setFieldFilterValue] = useState('')
  const [infoAvatar, setInfoAvatar] = useState<Avatar | null>(null)
  const [infoNewNote, setInfoNewNote] = useState(false)
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null)
  const contextMenuRef = useRef<HTMLDivElement>(null)
  const {
    selectedAvatarId, setSelectedAvatar, avatarFilter, setAvatarFilter,
    avatarPanelMode, setAvatarPanelMode, setShowSettings, setPendingEditAvatarId,
    pendingOpenAvatarId, setPendingOpenAvatarId,
    pendingNewNoteAvatarId, setPendingNewNoteAvatarId,
    setCurrentFront,
  } = useAppStore()
  const { groups, ungrouped, suspects, loading, avatars, fields, fieldValues } = useAvatars(channelId)

  const wide = avatarPanelMode === 'full'
  const isAllMessages = channelId === ALL_MESSAGES_ID
  const allNames = avatars.map(a => a.name)

  useEffect(() => {
    document.querySelector('.app-layout')?.classList.toggle('wide-avatars', wide)
  }, [wide])

  useEffect(() => {
    if (!contextMenu) return
    function handleClick(e: MouseEvent) {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [contextMenu])

  useEffect(() => {
    if (!pendingOpenAvatarId) return
    const av = avatars.find(a => a.id === pendingOpenAvatarId)
    if (av) {
      setInfoNewNote(false)
      setInfoAvatar(av)
      if (avatarPanelMode === 'hidden') setAvatarPanelMode('small')
    }
    setPendingOpenAvatarId(null)
  }, [pendingOpenAvatarId, avatars])

  useEffect(() => {
    if (!pendingNewNoteAvatarId) return
    const av = avatars.find(a => a.id === pendingNewNoteAvatarId)
    if (av) {
      setInfoNewNote(true)
      setInfoAvatar(av)
      if (avatarPanelMode === 'hidden') setAvatarPanelMode('small')
    }
    setPendingNewNoteAvatarId(null)
  }, [pendingNewNoteAvatarId, avatars])

  function toggleCollapse(key: string) {
    setCollapsed(c => ({ ...c, [key]: !c[key] }))
  }

  function handleAvatarClick(avatar: Avatar) {
    if (channelId === null) return
    if (isAllMessages) {
      setAvatarFilter(avatarFilter === avatar.id ? null : avatar.id)
    } else {
      setSelectedAvatar(selectedAvatarId === avatar.id ? null : avatar.id)
    }
    if (!onClose) {
      document.querySelector<HTMLTextAreaElement>('.chat-panel textarea')?.focus()
    }
  }

  function isSelected(avatar: Avatar) {
    if (isAllMessages) return avatarFilter === avatar.id
    return selectedAvatarId === avatar.id
  }

  function handleContextMenu(e: React.MouseEvent, avatar: Avatar) {
    e.preventDefault()
    setContextMenu({ avatar, x: e.clientX, y: e.clientY })
  }

  function openInfo(avatar: Avatar) {
    setContextMenu(null)
    setInfoAvatar(avatar)
  }

  function openEdit(avatar: Avatar) {
    setContextMenu(null)
    setPendingEditAvatarId(avatar.id)
    setShowSettings(true)
  }

  async function refreshFront() {
    const sessions = await getCurrentFront()
    setCurrentFront(sessions)
  }

  async function handleSetFront(avatarId: number) {
    setContextMenu(null)
    await enterFront(avatarId, true)
    await refreshFront()
  }

  async function handleAddFront(avatarId: number) {
    setContextMenu(null)
    await enterFront(avatarId, false)
    await refreshFront()
  }

  async function handleRemoveFront(avatarId: number) {
    setContextMenu(null)
    await exitFront(avatarId)
    await refreshFront()
  }

  function renderAvatar(avatar: Avatar) {
    const selected = isSelected(avatar)
    return (
      <div
        key={avatar.id}
        className={`avatar-item ${wide ? 'wide' : ''} ${selected ? 'selected' : ''}`}
        onClick={() => handleAvatarClick(avatar)}
        onDoubleClick={() => openInfo(avatar)}
        onContextMenu={e => handleContextMenu(e, avatar)}
        style={{ '--avatar-color': avatar.color } as React.CSSProperties}
        title={avatar.name}
      >
        {avatar.image_data ? (
          <img src={`data:image/png;base64,${avatar.image_data}`} alt={avatar.name} className="avatar-img" />
        ) : avatar.image_path ? (
          <img src={assetUrl(avatar.image_path)!} alt={avatar.name} className="avatar-img" />
        ) : (
          <div className="avatar-img placeholder" style={{ background: avatar.color }}>
            {avatar.icon_letters || getInitials(avatar.name, allNames)}
          </div>
        )}
        {wide && (
          <div className="avatar-label-group">
            <span className="avatar-label">{avatar.name}</span>
            {(avatar.pronouns || avatar.description) && (
              <span className="avatar-sublabel">
                {[avatar.pronouns, avatar.description].filter(Boolean).join(' · ')}
              </span>
            )}
          </div>
        )}
      </div>
    )
  }

  function renderGroup(title: string, groupAvatars: Avatar[], key: string, groupDescription?: string | null, groupColor?: string | null) {
    const visibleAvatars = groupAvatars.filter(a => !isHidden(a.hidden))
    if (visibleAvatars.length === 0) return null
    const isCollapsed = collapsed[key]
    const headerStyle = groupColor ? { color: groupColor } as React.CSSProperties : undefined
    return (
      <div key={key} className="avatar-group">
        <div className="group-header" style={headerStyle} onClick={() => toggleCollapse(key)}>
          <span className="group-arrow">{isCollapsed ? '▶' : '▼'}</span>
          {title}
          <span className="group-count">{visibleAvatars.length}</span>
        </div>
        {wide && !isCollapsed && groupDescription && (
          <div className="group-description">{groupDescription}</div>
        )}
        {!isCollapsed && (
          <div className={`avatar-grid ${wide ? 'wide' : ''}`}>
            {visibleAvatars.map(renderAvatar)}
          </div>
        )}
      </div>
    )
  }

  const nameActive = filter.trim().length > 0
  const fieldActive = fieldFilterId !== null && fieldFilterValue.trim().length > 0
  const filtered = (nameActive || fieldActive) ? (() => {
    let result = avatars.filter(a => !isHidden(a.hidden))
    if (nameActive) {
      const term = filter.trim().toLowerCase()
      result = result.filter(a => a.name.toLowerCase().includes(term))
    }
    if (fieldActive) {
      const field = fields.find(f => f.id === fieldFilterId)
      if (field) {
        const valQuery = fieldFilterValue.trim().toLowerCase()
        result = result.filter(a => {
          const fv = fieldValues.find(v => v.avatar_id === a.id && v.field_id === field.id)
          if (!fv) return false
          if (field.field_type === 'intRange') {
            const stored = parseIntRange(fv.value)
            if (!stored) return false
            const query = parseIntRange(valQuery)
            if (!query) return false
            return intRangesOverlap(stored, query)
          }
          return fv.value.toLowerCase().includes(valQuery)
        })
      }
    }
    return result
  })() : null

  if (loading) return <aside className="avatar-panel"><div className="panel-loading">...</div></aside>

  return (
    <aside className="avatar-panel">
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="avatar-context-menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          <button onClick={() => openInfo(contextMenu.avatar)}>{t('avatarPanel.contextView')}</button>
          <button onClick={() => openEdit(contextMenu.avatar)}>{t('avatarPanel.contextEdit')}</button>
          <div className="avatar-context-divider" />
          <button onClick={() => handleSetFront(contextMenu.avatar.id)}>{t('avatarPanel.contextSetFront')}</button>
          <button onClick={() => handleAddFront(contextMenu.avatar.id)}>{t('avatarPanel.contextAddFront')}</button>
          <button onClick={() => handleRemoveFront(contextMenu.avatar.id)}>{t('avatarPanel.contextRemoveFront')}</button>
        </div>
      )}
      {infoAvatar && (
        <AvatarInfoPopup
          key={infoAvatar.id}
          avatar={infoAvatar}
          fields={fields}
          fieldValues={fieldValues}
          avatars={avatars}
          selectedAvatarId={selectedAvatarId}
          initialView={infoNewNote ? 'edit' : undefined}
          onClose={() => { setInfoAvatar(null); setInfoNewNote(false) }}
        />
      )}
      <div className="panel-header">
        {onClose && (
          <button className="wide-toggle" onClick={onClose} title="Close">←</button>
        )}
        <span>{t('avatarPanel.title')}</span>
        <button className="wide-toggle" onClick={() => setAvatarPanelMode(wide ? 'small' : 'full')} title={wide ? t('avatarPanel.compact') : t('avatarPanel.full')}>
          {wide ? '⟨' : '⟩'}
        </button>
        {!onClose && (
          <button className="wide-toggle" onClick={() => setAvatarPanelMode('hidden')} title={t('avatarPanel.hide')}>✕</button>
        )}
      </div>

      <div className="panel-filter">
        <input
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder={t('avatarPanel.filterPlaceholder')}
          className="filter-input"
          onKeyDown={e => {
            if (e.key === 'Tab') {
              e.preventDefault()
              document.querySelector<HTMLTextAreaElement>('.chat-panel textarea')?.focus()
            }
          }}
        />
        {fields.length > 0 && (
          <div className="field-filter-row">
            <select
              className="field-filter-select"
              value={fieldFilterId ?? ''}
              onChange={e => {
                setFieldFilterId(e.target.value ? Number(e.target.value) : null)
                setFieldFilterValue('')
              }}
            >
              <option value="">{t('avatarPanel.fieldPlaceholder')}</option>
              {fields.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
            {fieldFilterId !== null && (
              <input
                className="field-filter-value"
                value={fieldFilterValue}
                onChange={e => setFieldFilterValue(e.target.value)}
                placeholder={t('avatarPanel.fieldValuePlaceholder')}
              />
            )}
          </div>
        )}
      </div>

      <div className="avatar-scroll">
        {filtered ? (
          <div className={`avatar-grid ${wide ? 'wide' : ''}`}>
            {filtered.length > 0
              ? filtered.map(renderAvatar)
              : <span className="no-match">{t('avatarPanel.noMatch')}</span>
            }
          </div>
        ) : (
          <>
            {channelId !== null && !isAllMessages &&
              renderGroup(t('avatarPanel.activeHere'), suspects.filter(a => !isHidden(a.hidden)), '__suspects')}

            {isAllMessages && (
              <div className="filter-hint">
                {avatarFilter
                  ? t('avatarPanel.filteredBy', { name: avatars.find(a => a.id === avatarFilter)?.name ?? '?' })
                  : t('avatarPanel.clickToFilter')}
              </div>
            )}

            {groups
              .filter(({ group }) => !isHidden(group.hidden))
              .map(({ group, avatars: ga }) =>
                renderGroup(group.name, ga, String(group.id), group.description, group.color)
              )}

            {renderGroup(t('avatarPanel.ungrouped'), ungrouped, '__ungrouped')}
          </>
        )}
      </div>

    </aside>
  )
}
