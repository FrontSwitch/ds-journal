import { useState, useEffect } from 'react'
import ColorInput from './ColorInput'
import {
  getAvatarGroups,
  createAvatarGroup, deleteAvatarGroup, setGroupSortOrders, updateAvatarGroup,
} from '../../db/avatars'
import { isHidden } from '../../types'
import type { AvatarGroup } from '../../types'
import { t } from '../../i18n'

interface Props { onClose: () => void }

export default function EditGroups({ onClose }: Props) {
  const [groups, setGroups] = useState<AvatarGroup[]>([])
  const [selected, setSelected] = useState<AvatarGroup | 'new' | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const [groupName, setGroupName] = useState('')
  const [groupDescription, setGroupDescription] = useState('')
  const [groupColor, setGroupColor] = useState('')
  const [groupHidden, setGroupHidden] = useState(false)

  async function load() {
    const g = await getAvatarGroups()
    setGroups(g)
  }

  useEffect(() => { load() }, [])

  function selectGroup(g: AvatarGroup) {
    setSelected(g)
    setGroupName(g.name)
    setGroupDescription(g.description ?? '')
    setGroupColor(g.color ?? '')
    setGroupHidden(isHidden(g.hidden))
    setConfirmDelete(false)
  }

  function openNew() {
    setSelected('new')
    setGroupName('')
    setGroupDescription('')
    setGroupColor('')
    setGroupHidden(false)
    setConfirmDelete(false)
  }

  function clearGroup() {
    setSelected(null)
    setConfirmDelete(false)
  }

  async function handleSave() {
    if (!groupName.trim()) return
    if (selected === 'new') {
      await createAvatarGroup(
        groupName.trim(),
        groupDescription.trim() || null,
        groupColor.trim() || null,
        groupHidden ? 1 : 0
      )
    } else if (selected) {
      await updateAvatarGroup(selected.id, groupName.trim(), groupDescription.trim() || null, groupColor.trim() || null, groupHidden ? 1 : 0)
    }
    clearGroup()
    load()
  }

  async function handleDelete() {
    if (!selected || selected === 'new') return
    try {
      await deleteAvatarGroup(selected.id)
      clearGroup()
      load()
    } catch (e) {
      console.error('[delete group error]', e)
    }
  }

  async function moveGroup(index: number, direction: 'up' | 'down') {
    const swapIndex = direction === 'up' ? index - 1 : index + 1
    if (swapIndex < 0 || swapIndex >= groups.length) return
    const reordered = [...groups]
    const [moved] = reordered.splice(index, 1)
    reordered.splice(swapIndex, 0, moved)
    await setGroupSortOrders(reordered.map(g => g.id))
    load()
  }

  const selectedId = selected !== 'new' && selected ? selected.id : null

  return (
    <>
      <div className="editor-header">
        <span>{t('editGroups.title')}</span>
        <button className="editor-close" onClick={onClose}>✕</button>
      </div>
      <div className="editor-body">
        <div className="editor-col">
          <button className="add-btn" onClick={openNew}>{t('editGroups.newGroup')}</button>

          <div className="group-list">
            {groups.map((g, i) => (
              <div key={g.id} className={`group-row ${selectedId === g.id ? 'active' : ''}`}>
                <div className="group-order-btns">
                  <button onClick={() => moveGroup(i, 'up')} disabled={i === 0}>▲</button>
                  <button onClick={() => moveGroup(i, 'down')} disabled={i === groups.length - 1}>▼</button>
                </div>
                <span className="group-name" onClick={() => selectGroup(g)} style={{ cursor: 'pointer' }}>
                  {isHidden(g.hidden) ? <em>{g.name}</em> : g.name}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="editor-col">
          {selected === null ? (
            <span className="editor-placeholder">{t('editGroups.placeholder')}</span>
          ) : (
            <>
              <div className="settings-section-title">
                {selected === 'new'
                  ? t('editGroups.newTitle')
                  : t('editGroups.editTitle', { name: (selected as AvatarGroup).name })}
              </div>

              <label className="field-label">{t('editGroups.name')}</label>
              <input
                autoFocus={selected === 'new'}
                value={groupName}
                onChange={e => setGroupName(e.target.value)}
                placeholder={t('editGroups.namePlaceholder')}
                onKeyDown={e => { if (e.key === 'Escape') clearGroup() }}
              />

              <label className="field-label">{t('editGroups.color')}</label>
              <ColorInput value={groupColor} onChange={setGroupColor} />

              <label className="field-label">{t('editGroups.description')}</label>
              <textarea value={groupDescription} onChange={e => setGroupDescription(e.target.value)} placeholder={t('editGroups.descriptionPlaceholder')} rows={3} />

              <label className="field-label checkbox-label">
                <input type="checkbox" checked={groupHidden} onChange={e => setGroupHidden(e.target.checked)} />
                {t('editGroups.hidden')}
              </label>

              <div className="form-actions">
                <button className="save-btn" onClick={handleSave} disabled={!groupName.trim()}>
                  {selected === 'new' ? t('editGroups.create') : t('editGroups.save')}
                </button>
                {selected !== 'new' && !confirmDelete && (
                  <button className="delete-btn" onClick={() => setConfirmDelete(true)}>{t('editGroups.delete')}</button>
                )}
                {selected !== 'new' && confirmDelete && (
                  <>
                    <button className="delete-btn" onClick={handleDelete}>{t('editGroups.confirm')}</button>
                    <button className="cancel-btn" onClick={() => setConfirmDelete(false)}>{t('editGroups.no')}</button>
                  </>
                )}
                <button className="cancel-btn" onClick={clearGroup}>{t('editGroups.cancel')}</button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}
