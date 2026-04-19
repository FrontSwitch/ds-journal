import { useState, useEffect } from 'react'
import ColorInput from './ColorInput'
import {
  getTrackers, createTracker, updateTracker, deleteTracker, setTrackerSortOrders,
  getTrackerFields, createTrackerField, updateTrackerField, deleteTrackerField, setTrackerFieldSortOrders,
  setTrackerSyncEnabled,
} from '../../db/trackers'
import type { Tracker, TrackerField, FieldType, SummaryOp } from '../../types'
import { FIELD_TYPES, SUMMARY_OPS, isHidden } from '../../types'
import { t } from '../../i18n'

interface Props { onClose: () => void }

function fieldTypeLabel(ft: FieldType): string {
  return t(`editTrackers.fieldTypes.${ft}` as Parameters<typeof t>[0])
}

export default function EditTrackers({ onClose }: Props) {
  const [trackers, setTrackers] = useState<Tracker[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [fields, setFields] = useState<TrackerField[]>([])

  // tracker form
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editHidden, setEditHidden] = useState(false)
  const [editSyncEnabled, setEditSyncEnabled] = useState(true)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // new tracker mode
  const [isNewTracker, setIsNewTracker] = useState(false)

  // field editor: null = closed, 'new' = adding, TrackerField = editing
  const [fieldTarget, setFieldTarget] = useState<TrackerField | 'new' | null>(null)
  const [fieldName, setFieldName] = useState('')
  const [fieldType, setFieldType] = useState<FieldType>('text_short')
  const [fieldRequired, setFieldRequired] = useState(true)
  const [fieldListValues, setFieldListValues] = useState('')
  const [fieldRangeMin, setFieldRangeMin] = useState('')
  const [fieldRangeMax, setFieldRangeMax] = useState('')
  const [fieldCustomEditor, setFieldCustomEditor] = useState('')
  const [fieldSummaryOp, setFieldSummaryOp] = useState<SummaryOp>('none')
  const [fieldDefaultValue, setFieldDefaultValue] = useState('')
  const [confirmDeleteField, setConfirmDeleteField] = useState<number | null>(null)

  useEffect(() => { loadTrackers() }, [])

  async function loadTrackers() {
    setTrackers(await getTrackers(true))
  }

  async function loadFields(trackerId: number) {
    setFields(await getTrackerFields(trackerId))
  }

  function selectTracker(t: Tracker) {
    setSelectedId(t.id)
    setEditName(t.name)
    setEditColor(t.color ?? '')
    setEditDescription(t.description ?? '')
    setEditHidden(isHidden(t.hidden))
    setEditSyncEnabled((t.sync_enabled ?? 1) !== 0)
    setConfirmDelete(false)
    setFieldTarget(null)
    setConfirmDeleteField(null)
    loadFields(t.id)
  }

  function openNewTracker() {
    setSelectedId(null)
    setIsNewTracker(true)
    setEditName('')
    setEditColor('')
    setEditDescription('')
    setEditHidden(false)
    setConfirmDelete(false)
    setFieldTarget(null)
    setConfirmDeleteField(null)
  }

  function clearSelection() {
    setSelectedId(null)
    setIsNewTracker(false)
    setFieldTarget(null)
    setConfirmDelete(false)
  }

  // ── Tracker CRUD ─────────────────────────────────────────────────────────

  async function handleSaveTracker() {
    if (!editName.trim()) return
    if (isNewTracker) {
      const id = await createTracker(editName.trim(), editDescription.trim() || null, editColor.trim() || null)
      setIsNewTracker(false)
      const updated = await getTrackers(true)
      setTrackers(updated)
      const created = updated.find(t => t.id === id)
      if (created) selectTracker(created)
    } else {
      if (!selectedId) return
      const current = trackers.find(t => t.id === selectedId)
      await updateTracker(
        selectedId,
        editName.trim(),
        editDescription.trim() || null,
        editColor.trim() || null,
        editHidden ? 1 : 0,
      )
      if (current && editSyncEnabled !== ((current.sync_enabled ?? 1) !== 0)) {
        await setTrackerSyncEnabled(selectedId, editSyncEnabled)
      }
      await loadTrackers()
      setConfirmDelete(false)
    }
  }

  async function handleDeleteTracker() {
    if (!selectedId) return
    await deleteTracker(selectedId)
    clearSelection()
    await loadTrackers()
  }

  async function moveTrackerOrder(index: number, dir: 'up' | 'down') {
    const swap = dir === 'up' ? index - 1 : index + 1
    if (swap < 0 || swap >= trackers.length) return
    const reordered = [...trackers]
    ;[reordered[index], reordered[swap]] = [reordered[swap], reordered[index]]
    await setTrackerSortOrders(reordered.map(t => t.id))
    setTrackers(reordered)
  }

  // ── Field editor helpers ─────────────────────────────────────────────────

  function openFieldEditor(field: TrackerField) {
    setFieldTarget(field)
    setFieldName(field.name)
    setFieldType(field.field_type)
    setFieldRequired(!!field.required)
    setFieldListValues(field.list_values ? JSON.parse(field.list_values).join(', ') : '')
    setFieldRangeMin(field.range_min != null ? String(field.range_min) : '')
    setFieldRangeMax(field.range_max != null ? String(field.range_max) : '')
    setFieldCustomEditor(field.custom_editor ?? '')
    setFieldSummaryOp((field.summary_op as SummaryOp) ?? 'none')
    setFieldDefaultValue(field.default_value ?? '')
    setConfirmDeleteField(null)
  }

  function openNewField() {
    setFieldTarget('new')
    setFieldName('')
    setFieldType('text_short')
    setFieldRequired(true)
    setFieldListValues('')
    setFieldRangeMin('')
    setFieldRangeMax('')
    setFieldCustomEditor('')
    setFieldSummaryOp('none')
    setFieldDefaultValue('')
    setConfirmDeleteField(null)
  }

  function closeFieldEditor() {
    setFieldTarget(null)
    setConfirmDeleteField(null)
  }

  function buildListValues(): string | null {
    if (fieldType !== 'list') return null
    const items = fieldListValues.split(',').map(s => s.trim()).filter(Boolean)
    return items.length > 0 ? JSON.stringify(items) : null
  }

  async function handleSaveField() {
    if (!selectedId || !fieldName.trim()) return
    const options = {
      required: fieldRequired ? 1 : 0,
      listValues: buildListValues(),
      rangeMin: fieldRangeMin !== '' ? parseFloat(fieldRangeMin) : null,
      rangeMax: fieldRangeMax !== '' ? parseFloat(fieldRangeMax) : null,
      customEditor: fieldCustomEditor.trim() || null,
      summaryOp: fieldSummaryOp,
      defaultValue: fieldDefaultValue || null,
    }
    if (fieldTarget === 'new') {
      await createTrackerField(selectedId, fieldName.trim(), fieldType, options)
    } else if (fieldTarget) {
      await updateTrackerField(fieldTarget.id, fieldName.trim(), fieldType, options)
    }
    closeFieldEditor()
    loadFields(selectedId)
  }

  async function handleDeleteField(fieldId: number) {
    if (!selectedId) return
    try {
      await deleteTrackerField(fieldId)
      setConfirmDeleteField(null)
      closeFieldEditor()
      loadFields(selectedId)
    } catch {
      alert(t('editTrackers.deleteFieldHasValues'))
    }
  }

  async function moveFieldOrder(index: number, dir: 'up' | 'down') {
    if (!selectedId) return
    const swap = dir === 'up' ? index - 1 : index + 1
    if (swap < 0 || swap >= fields.length) return
    const reordered = [...fields]
    ;[reordered[index], reordered[swap]] = [reordered[swap], reordered[index]]
    await setTrackerFieldSortOrders(reordered.map(f => f.id))
    setFields(reordered)
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <div className="editor-header">
        <span>{t('editTrackers.title')}</span>
        <button className="editor-close" onClick={onClose}>✕</button>
      </div>

      <div className="editor-body">
        {/* ── Left: tracker list ── */}
        <div className="editor-col" style={{ borderRight: '1px solid var(--border)' }}>
          <button className="add-btn" onClick={openNewTracker}>{t('editTrackers.addTracker')}</button>

          <div className="group-list">
            {trackers.map((tr, i) => (
              <div
                key={tr.id}
                className={`group-row${selectedId === tr.id ? ' active' : ''}`}
                style={{ cursor: 'pointer' }}
              >
                <div className="group-order-btns">
                  <button onClick={() => moveTrackerOrder(i, 'up')} disabled={i === 0}>▲</button>
                  <button onClick={() => moveTrackerOrder(i, trackers.length - 1 === i ? 'up' : 'down')} disabled={i === trackers.length - 1}>▼</button>
                </div>
                {tr.color && (
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: tr.color, flexShrink: 0 }} />
                )}
                <span
                  className="group-name"
                  style={tr.color ? { color: tr.color } : undefined}
                  onClick={() => selectTracker(tr)}
                >
                  {tr.name}
                  {isHidden(tr.hidden) && <span style={{ color: 'var(--text-muted)', fontSize: 11 }}> {t('editTrackers.hiddenLabel')}</span>}
                </span>
              </div>
            ))}
            {trackers.length === 0 && (
              <span className="editor-placeholder">{t('editTrackers.noTrackers')}</span>
            )}
          </div>
        </div>

        {/* ── Right: editor ── */}
        <div className="editor-col">
          {selectedId === null && !isNewTracker ? (
            <span className="editor-placeholder">{t('editTrackers.placeholder')}</span>
          ) : (
            <>
              <div className="settings-section-title">
                {isNewTracker ? t('editTrackers.newTitle') : t('editTrackers.sectionTracker')}
              </div>

              <label className="field-label">{t('editTrackers.name')}</label>
              <input autoFocus={isNewTracker} value={editName} onChange={e => setEditName(e.target.value)} />

              <label className="field-label">{t('editTrackers.color')}</label>
              <ColorInput value={editColor} onChange={setEditColor} />

              <label className="field-label">{t('editTrackers.description')}</label>
              <textarea
                value={editDescription}
                onChange={e => setEditDescription(e.target.value)}
                placeholder={t('editTrackers.descriptionPlaceholder')}
                rows={2}
              />

              <label className="field-label checkbox-label">
                <input type="checkbox" checked={editHidden} onChange={e => setEditHidden(e.target.checked)} />
                {t('editTrackers.hidden')}
              </label>

              {!isNewTracker && (
                <label className="field-label checkbox-label" title={t('editTrackers.syncEnabledHint')}>
                  <input type="checkbox" checked={editSyncEnabled} onChange={e => setEditSyncEnabled(e.target.checked)} />
                  {t('editTrackers.syncEnabled')}
                </label>
              )}

              <div className="form-actions">
                <button className="save-btn" onClick={handleSaveTracker} disabled={!editName.trim()}>
                  {isNewTracker ? t('editTrackers.create') : t('editTrackers.save')}
                </button>
                {!isNewTracker && !confirmDelete && (
                  <button className="delete-btn" onClick={() => setConfirmDelete(true)}>{t('editTrackers.delete')}</button>
                )}
                {!isNewTracker && confirmDelete && (
                  <>
                    <button className="delete-btn" onClick={handleDeleteTracker}>{t('editTrackers.confirm')}</button>
                    <button className="cancel-btn" onClick={() => setConfirmDelete(false)}>{t('editTrackers.no')}</button>
                  </>
                )}
                <button className="cancel-btn" onClick={clearSelection}>{t('editTrackers.cancel')}</button>
              </div>

              {/* ── Fields ── */}
              {!isNewTracker && (<>
              <div className="settings-section-title" style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                {t('editTrackers.sectionFields')}
              </div>

              {fields.length === 0 && fieldTarget !== 'new' && (
                <span className="editor-placeholder">{t('editTrackers.noFields')}</span>
              )}

              {fields.map((f, i) => (
                <div
                  key={f.id}
                  className={`channel-editor-row${fieldTarget !== 'new' && (fieldTarget as TrackerField)?.id === f.id ? ' active' : ''}`}
                  style={{ paddingLeft: 4 }}
                >
                  <div className="group-order-btns">
                    <button onClick={() => moveFieldOrder(i, 'up')} disabled={i === 0}>▲</button>
                    <button onClick={() => moveFieldOrder(i, 'down')} disabled={i === fields.length - 1}>▼</button>
                  </div>
                  <span className="channel-editor-name" onClick={() => openFieldEditor(f)} style={{ cursor: 'pointer' }}>
                    {f.name}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>
                    {fieldTypeLabel(f.field_type)}
                  </span>
                  {confirmDeleteField === f.id ? (
                    <>
                      <button className="delete-btn" style={{ fontSize: 11, padding: '2px 6px' }} onClick={() => handleDeleteField(f.id)}>✓</button>
                      <button className="cancel-btn" style={{ fontSize: 11, padding: '2px 6px' }} onClick={() => setConfirmDeleteField(null)}>✕</button>
                    </>
                  ) : (
                    <button
                      style={{ color: 'var(--text-muted)', fontSize: 12, padding: '2px 6px', borderRadius: 3 }}
                      onClick={() => setConfirmDeleteField(f.id)}
                    >✕</button>
                  )}
                </div>
              ))}

              {fieldTarget === null && (
                <button className="add-btn" style={{ alignSelf: 'flex-start' }} onClick={openNewField}>
                  {t('editTrackers.addField')}
                </button>
              )}

              {/* ── Field editor ── */}
              {fieldTarget !== null && (
                <div className="group-edit-panel">
                  <div className="settings-section-title">
                    {fieldTarget === 'new' ? t('editTrackers.newField') : t('editTrackers.editFieldTitle', { name: (fieldTarget as TrackerField).name })}
                  </div>

                  <label className="field-label">{t('editTrackers.fieldName')}</label>
                  <input
                    autoFocus={fieldTarget === 'new'}
                    value={fieldName}
                    onChange={e => setFieldName(e.target.value)}
                    placeholder={t('editTrackers.fieldNamePlaceholder')}
                    onKeyDown={e => { if (e.key === 'Escape') closeFieldEditor() }}
                  />

                  <label className="field-label">{t('editTrackers.fieldType')}</label>
                  <select
                    value={fieldType}
                    onChange={e => setFieldType(e.target.value as FieldType)}
                    style={{ fontSize: 13, background: 'var(--bg-hover)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 4, padding: '5px 8px' }}
                  >
                    {FIELD_TYPES.map(ft => (
                      <option key={ft} value={ft}>{fieldTypeLabel(ft)}</option>
                    ))}
                  </select>

                  <label className="field-label checkbox-label">
                    <input type="checkbox" checked={fieldRequired} onChange={e => setFieldRequired(e.target.checked)} />
                    {t('editTrackers.fieldRequired')}
                  </label>

                  {fieldType === 'list' && (
                    <>
                      <label className="field-label">{t('editTrackers.fieldListValues')}</label>
                      <input
                        value={fieldListValues}
                        onChange={e => setFieldListValues(e.target.value)}
                        placeholder={t('editTrackers.fieldListValuesPlaceholder')}
                      />
                    </>
                  )}

                  {(fieldType === 'integer' || fieldType === 'number') && (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <div style={{ flex: 1 }}>
                        <label className="field-label">{t('editTrackers.fieldMin')}</label>
                        <input type="number" value={fieldRangeMin} onChange={e => setFieldRangeMin(e.target.value)} placeholder="0" />
                      </div>
                      <div style={{ flex: 1 }}>
                        <label className="field-label">{t('editTrackers.fieldMax')}</label>
                        <input type="number" value={fieldRangeMax} onChange={e => setFieldRangeMax(e.target.value)} placeholder="10" />
                      </div>
                    </div>
                  )}

                  {fieldType === 'custom' && (
                    <>
                      <label className="field-label">{t('editTrackers.fieldCustomEditor')}</label>
                      <input
                        value={fieldCustomEditor}
                        onChange={e => setFieldCustomEditor(e.target.value)}
                        placeholder={t('editTrackers.fieldCustomEditorPlaceholder')}
                      />
                    </>
                  )}

                  <label className="field-label">{t('editTrackers.fieldSummaryOp')}</label>
                  <select
                    value={fieldSummaryOp}
                    onChange={e => setFieldSummaryOp(e.target.value as SummaryOp)}
                    style={{ fontSize: 13, background: 'var(--bg-hover)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 4, padding: '5px 8px' }}
                  >
                    {SUMMARY_OPS.map(op => (
                      <option key={op} value={op}>{t(`editTrackers.summaryOps.${op}` as Parameters<typeof t>[0])}</option>
                    ))}
                  </select>

                  <label className="field-label">{t('editTrackers.fieldDefaultValue')}</label>
                  {(fieldType === 'date' || fieldType === 'datetime' || fieldType === 'who') ? (
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {t(`editTrackers.fieldDefaultAuto.${fieldType}` as Parameters<typeof t>[0])}
                    </span>
                  ) : fieldType === 'boolean' ? (
                    <input
                      type="checkbox"
                      checked={fieldDefaultValue === 'true'}
                      onChange={e => setFieldDefaultValue(e.target.checked ? 'true' : 'false')}
                      style={{ width: 16, height: 16 }}
                    />
                  ) : (fieldType === 'integer' || fieldType === 'number') ? (
                    <input
                      type="number"
                      value={fieldDefaultValue}
                      onChange={e => setFieldDefaultValue(e.target.value)}
                      placeholder={t('editTrackers.fieldDefaultValuePlaceholder')}
                    />
                  ) : fieldType === 'list' ? (
                    (() => {
                      const opts = fieldListValues ? fieldListValues.split(',').map(s => s.trim()).filter(Boolean) : []
                      return opts.length > 0 ? (
                        <select
                          value={fieldDefaultValue}
                          onChange={e => setFieldDefaultValue(e.target.value)}
                          style={{ fontSize: 13, background: 'var(--bg-hover)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 4, padding: '5px 8px' }}
                        >
                          <option value="">{t('editTrackers.fieldDefaultNone')}</option>
                          {opts.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                      ) : (
                        <input
                          type="text"
                          value={fieldDefaultValue}
                          onChange={e => setFieldDefaultValue(e.target.value)}
                          placeholder={t('editTrackers.fieldDefaultValuePlaceholder')}
                        />
                      )
                    })()
                  ) : fieldType === 'color' ? (
                    <input
                      type="color"
                      value={fieldDefaultValue || '#888888'}
                      onChange={e => setFieldDefaultValue(e.target.value)}
                      style={{ width: 48, height: 32, padding: 2, cursor: 'pointer' }}
                    />
                  ) : (
                    <input
                      type="text"
                      value={fieldDefaultValue}
                      onChange={e => setFieldDefaultValue(e.target.value)}
                      placeholder={t('editTrackers.fieldDefaultValuePlaceholder')}
                    />
                  )}

                  <div className="form-actions">
                    <button className="save-btn" onClick={handleSaveField} disabled={!fieldName.trim()}>
                      {fieldTarget === 'new' ? t('editTrackers.addFieldBtn') : t('editTrackers.saveFieldBtn')}
                    </button>
                    <button className="cancel-btn" onClick={closeFieldEditor}>{t('editTrackers.cancel')}</button>
                  </div>
                </div>
              )}
              </>)}
            </>
          )}
        </div>
      </div>
    </>
  )
}
