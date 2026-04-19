import { useState, useEffect } from 'react'
import {
  getAvatarFields, createAvatarField, updateAvatarField, deleteAvatarField, setAvatarFieldSortOrders,
} from '../../db/avatars'
import type { AvatarField, AvatarFieldType } from '../../types'
import { AVATAR_FIELD_TYPES } from '../../types'
import { t } from '../../i18n'

interface Props { onClose: () => void }

function typeLabel(ft: AvatarFieldType): string {
  return t(`editAvatarFields.types.${ft}` as Parameters<typeof t>[0])
}

export default function EditAvatarFields({ onClose }: Props) {
  const [fields, setFields] = useState<AvatarField[]>([])
  const [selected, setSelected] = useState<AvatarField | 'new' | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const [editName, setEditName] = useState('')
  const [editType, setEditType] = useState<AvatarFieldType>('text')
  const [editListValues, setEditListValues] = useState('')

  async function load() { setFields(await getAvatarFields()) }
  useEffect(() => { load() }, [])

  function selectField(f: AvatarField) {
    setSelected(f)
    setEditName(f.name)
    setEditType(f.field_type)
    setEditListValues(f.list_values ?? '')
    setConfirmDelete(false)
  }

  function openNew() {
    setSelected('new')
    setEditName('')
    setEditType('text')
    setEditListValues('')
    setConfirmDelete(false)
  }

  function clearField() {
    setSelected(null)
    setConfirmDelete(false)
  }

  async function handleSave() {
    if (!editName.trim()) return
    const listValues = editType === 'list' && editListValues.trim() ? editListValues.trim() : null
    if (selected === 'new') {
      await createAvatarField(editName.trim(), editType, listValues)
    } else if (selected) {
      await updateAvatarField(selected.id, editName.trim(), editType, listValues)
    }
    clearField()
    load()
  }

  async function handleDelete() {
    if (!selected || selected === 'new') return
    await deleteAvatarField(selected.id)
    clearField()
    load()
  }

  async function move(index: number, dir: 'up' | 'down') {
    const swap = dir === 'up' ? index - 1 : index + 1
    if (swap < 0 || swap >= fields.length) return
    const reordered = [...fields]
    const [moved] = reordered.splice(index, 1)
    reordered.splice(swap, 0, moved)
    await setAvatarFieldSortOrders(reordered.map(f => f.id))
    load()
  }

  const selectedId = selected !== 'new' && selected ? selected.id : null

  return (
    <>
      <div className="editor-header">
        <span>{t('editAvatarFields.title')}</span>
        <button className="editor-close" onClick={onClose}>✕</button>
      </div>
      <div className="editor-body">
        <div className="editor-col">
          <button className="add-btn" onClick={openNew}>{t('editAvatarFields.newField')}</button>

          <div className="group-list">
            {fields.map((f, i) => (
              <div key={f.id} className={`group-row ${selectedId === f.id ? 'active' : ''}`}>
                <div className="group-order-btns">
                  <button onClick={() => move(i, 'up')} disabled={i === 0}>▲</button>
                  <button onClick={() => move(i, 'down')} disabled={i === fields.length - 1}>▼</button>
                </div>
                <span className="group-name" onClick={() => selectField(f)} style={{ cursor: 'pointer' }}>
                  {f.name}
                  <span className="field-type-badge">{typeLabel(f.field_type)}</span>
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="editor-col">
          {selected === null ? (
            <span className="editor-placeholder">{t('editAvatarFields.placeholder')}</span>
          ) : (
            <>
              <div className="settings-section-title">
                {selected === 'new'
                  ? t('editAvatarFields.newTitle')
                  : t('editAvatarFields.editTitle', { name: (selected as AvatarField).name })}
              </div>

              <label className="field-label">{t('editAvatarFields.name')}</label>
              <input
                autoFocus={selected === 'new'}
                value={editName}
                onChange={e => setEditName(e.target.value)}
                placeholder={t('editAvatarFields.namePlaceholder')}
                onKeyDown={e => { if (e.key === 'Escape') clearField() }}
              />

              <label className="field-label">{t('editAvatarFields.type')}</label>
              <select value={editType} onChange={e => setEditType(e.target.value as AvatarFieldType)}>
                {AVATAR_FIELD_TYPES.map(ft => (
                  <option key={ft} value={ft}>{typeLabel(ft)}</option>
                ))}
              </select>

              {editType === 'intRange' && (
                <p className="field-hint">{t('editAvatarFields.intRangeHint')}</p>
              )}

              {editType === 'list' && (
                <>
                  <label className="field-label">{t('editAvatarFields.listValues')}</label>
                  <input
                    value={editListValues}
                    onChange={e => setEditListValues(e.target.value)}
                    placeholder={t('editAvatarFields.listValuesPlaceholder')}
                  />
                </>
              )}

              <div className="form-actions">
                <button className="save-btn" onClick={handleSave} disabled={!editName.trim()}>
                  {selected === 'new' ? t('editAvatarFields.create') : t('editAvatarFields.save')}
                </button>
                {selected !== 'new' && !confirmDelete && (
                  <button className="delete-btn" onClick={() => setConfirmDelete(true)}>{t('editAvatarFields.delete')}</button>
                )}
                {selected !== 'new' && confirmDelete && (
                  <>
                    <button className="delete-btn" onClick={handleDelete}>{t('editAvatarFields.confirm')}</button>
                    <button className="cancel-btn" onClick={() => setConfirmDelete(false)}>{t('editAvatarFields.no')}</button>
                  </>
                )}
                <button className="cancel-btn" onClick={clearField}>{t('editAvatarFields.cancel')}</button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}
