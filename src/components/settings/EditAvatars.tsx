import { useState, useEffect, useMemo } from 'react'
import { getBuiltinPacks } from '../../assets/builtinImages'
import type { BuiltinPack } from '../../assets/builtinImages'
import ColorInput from './ColorInput'
import { parseIntRange } from '../../lib/avatarFieldUtils'

function IntRangeInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const parsed = parseIntRange(value)
  const lo = parsed ? String(parsed[0]) : ''
  const hi = parsed && parsed[0] !== parsed[1] ? String(parsed[1]) : ''

  function update(newLo: string, newHi: string) {
    const a = newLo.trim(), b = newHi.trim()
    if (!a && !b) { onChange(''); return }
    onChange(b ? `${a || 0}-${b}` : a)
  }

  return (
    <div className="intrange-input">
      <input
        type="number"
        value={lo}
        placeholder="min"
        onChange={e => update(e.target.value, hi)}
      />
      <span className="intrange-sep">–</span>
      <input
        type="number"
        value={hi}
        placeholder="max"
        onChange={e => update(lo, e.target.value)}
      />
    </div>
  )
}
import {
  getAvatars, getAvatarGroups, getAvatarGroupsForAvatar,
  createAvatar, updateAvatar, deleteAvatar, setAvatarGroups,
  getAvatarFields, getAvatarFieldValues, setAvatarFieldValues,
  setAvatarImageData,
} from '../../db/avatars'
import type { Avatar, AvatarField, AvatarGroup } from '../../types'
import { assetUrl, getInitials, isHidden } from '../../types'
import { t } from '../../i18n'

interface Props { onClose: () => void; initialAvatarId?: number }

export default function EditAvatars({ onClose, initialAvatarId }: Props) {
  const [avatars, setAvatars] = useState<Avatar[]>([])
  const [groups, setGroups] = useState<AvatarGroup[]>([])
  const [fields, setFields] = useState<AvatarField[]>([])
  const [selected, setSelected] = useState<Avatar | null>(null)
  const [confirmDeleteAvatar, setConfirmDeleteAvatar] = useState(false)
  const [selectedGroups, setSelectedGroups] = useState<number[]>([])
  const [fieldValues, setFieldValues] = useState<Record<number, string>>({})
  const [listFilter, setListFilter] = useState('')

  const [name, setName] = useState('')
  const [color, setColor] = useState('#888888')
  const [imagePath, setImagePath] = useState('')
  const [showImagePicker, setShowImagePicker] = useState(false)
  const [hasImageData, setHasImageData] = useState(false)
  const [importingImage, setImportingImage] = useState(false)
  const [imageMaxSize, setImageMaxSize] = useState(300)
  const builtinPacks = useMemo(() => getBuiltinPacks(), [])
  const [description, setDescription] = useState('')
  const [pronouns, setPronouns] = useState('')
  const [hidden, setHidden] = useState(false)
  const [iconLetters, setIconLetters] = useState('')

  async function load() {
    const [a, g, f] = await Promise.all([getAvatars(), getAvatarGroups(), getAvatarFields()])
    setAvatars(a)
    setGroups(g)
    setFields(f)
    if (initialAvatarId != null) {
      const target = a.find(av => av.id === initialAvatarId)
      if (target) selectAvatar(target)
    }
  }

  useEffect(() => { load() }, [])

  async function selectAvatar(avatar: Avatar) {
    setSelected(avatar)
    setName(avatar.name)
    setColor(avatar.color)
    setImagePath(avatar.image_path ?? '')
    setHasImageData(!!avatar.image_data)
    setDescription(avatar.description ?? '')
    setPronouns(avatar.pronouns ?? '')
    setHidden(isHidden(avatar.hidden))
    setIconLetters(avatar.icon_letters ?? '')
    const [gIds, vals] = await Promise.all([
      getAvatarGroupsForAvatar(avatar.id),
      getAvatarFieldValues(avatar.id),
    ])
    setSelectedGroups(gIds)
    const fvMap: Record<number, string> = {}
    for (const v of vals) fvMap[v.field_id] = v.value
    setFieldValues(fvMap)
  }

  function clearForm() {
    setSelected(null)
    setName('')
    setColor('#888888')
    setImagePath('')
    setHasImageData(false)
    setDescription('')
    setPronouns('')
    setHidden(false)
    setIconLetters('')
    setSelectedGroups([])
    setFieldValues({})
    setConfirmDeleteAvatar(false)
  }

  async function handleSave() {
    if (!name.trim()) return
    const fvList = Object.entries(fieldValues).map(([fid, val]) => ({ fieldId: Number(fid), value: val }))
    if (selected) {
      await updateAvatar(selected.id, name.trim(), color, imagePath.trim() || null, description.trim() || null, pronouns.trim() || null, hidden ? 1 : 0, iconLetters.trim() || null)
      await setAvatarGroups(selected.id, selectedGroups)
      await setAvatarFieldValues(selected.id, fvList)
    } else {
      await createAvatar(name.trim(), color, imagePath.trim() || null, description.trim() || null, pronouns.trim() || null, iconLetters.trim() || null)
      const updated = await getAvatars()
      const newest = updated[updated.length - 1]
      if (newest) {
        await setAvatarGroups(newest.id, selectedGroups)
        await setAvatarFieldValues(newest.id, fvList)
      }
    }
    clearForm()
    load()
  }

  async function handleDelete() {
    if (!selected) return
    try {
      await deleteAvatar(selected.id)
      clearForm()
      load()
    } catch (e) {
      alert(String(e))
    }
  }

  async function importImageToDb() {
    if (!selected || !imagePath.trim()) return
    setImportingImage(true)
    let blobUrl: string | null = null
    try {
      const src = assetUrl(imagePath.trim())
      if (!src) throw new Error('Could not resolve image path')
      // Fetch as blob → object URL so canvas.toDataURL() never hits cross-origin taint
      // (WKWebView taints the canvas for images loaded from tauri:// scheme URLs directly)
      const response = await fetch(src)
      if (!response.ok) throw new Error(`Failed to fetch image: ${response.status}`)
      const blob = await response.blob()
      blobUrl = URL.createObjectURL(blob)
      const img = new Image()
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve()
        img.onerror = () => reject(new Error('Image failed to load'))
        img.src = blobUrl!
      })
      const size = imageMaxSize
      const scale = Math.min(1, size / Math.max(img.naturalWidth, img.naturalHeight))
      const w = Math.round(img.naturalWidth * scale)
      const h = Math.round(img.naturalHeight * scale)
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, w, h)
      // strip data: prefix, store only the base64 payload
      const dataUrl = canvas.toDataURL('image/png')
      const base64 = dataUrl.split(',')[1]
      await setAvatarImageData(selected.id, base64)
      setHasImageData(true)
      load()
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e))
    } finally {
      if (blobUrl) URL.revokeObjectURL(blobUrl)
      setImportingImage(false)
    }
  }

  async function clearImageFromDb() {
    if (!selected) return
    await setAvatarImageData(selected.id, null)
    setHasImageData(false)
    load()
  }

  function toggleGroup(groupId: number) {
    setSelectedGroups(gs =>
      gs.includes(groupId) ? gs.filter(g => g !== groupId) : [...gs, groupId]
    )
  }

  return (
    <>
      <div className="editor-header">
        <span>{t('editAvatars.title')}</span>
        <button className="editor-close" onClick={onClose}>✕</button>
      </div>
      <div className="editor-body">
        <div className="editor-col">
          <button className="add-btn" onClick={clearForm}>{t('editAvatars.newAvatar')}</button>
          <input
            className="settings-list-filter"
            value={listFilter}
            onChange={e => setListFilter(e.target.value)}
            placeholder={t('editAvatars.filterPlaceholder')}
          />
          <div className="avatar-list">
            {avatars
              .filter(a => !listFilter.trim() || a.name.toLowerCase().includes(listFilter.trim().toLowerCase()))
              .map(a => (
                <div
                  key={a.id}
                  className={`settings-avatar-row ${selected?.id === a.id ? 'active' : ''}`}
                  onClick={() => selectAvatar(a)}
                >
                  {a.image_path
                    ? <img src={assetUrl(a.image_path)!} className="settings-avatar-img" alt={a.name} />
                    : <div className="settings-avatar-dot" style={{ background: a.color }}>
                        {a.icon_letters || getInitials(a.name, avatars.map(x => x.name))}
                      </div>
                  }
                  {a.name}
                </div>
              ))}
          </div>
        </div>

        <div className="editor-col">
          <div className="settings-section-title">
            {selected ? t('editAvatars.editTitle', { name: selected.name }) : t('editAvatars.newTitle')}
          </div>

          <label className="field-label">{t('editAvatars.name')}</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder={t('editAvatars.namePlaceholder')} />

          <label className="field-label">{t('editAvatars.color')}</label>
          <ColorInput value={color} onChange={setColor} />

          <label className="field-label">{t('editAvatars.imagePath')}</label>
          <ImagePicker
            value={imagePath}
            onChange={setImagePath}
            packs={builtinPacks}
            showPicker={showImagePicker}
            setShowPicker={setShowImagePicker}
          />

          {selected && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 2 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <label className="field-label" style={{ marginBottom: 0 }}>{t('editAvatarImg.importHint', { size: String(imageMaxSize) })}</label>
                <input
                  type="number"
                  style={{ width: 60, padding: '2px 4px', fontSize: 12 }}
                  value={imageMaxSize}
                  min={64} max={1024}
                  onChange={e => setImageMaxSize(Math.max(64, Math.min(1024, Number(e.target.value) || 300)))}
                  title={t('sync.imageSizeLabel')}
                />
                <span className="muted" style={{ fontSize: 11 }}>px</span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="inline-btn"
                  onClick={importImageToDb}
                  disabled={importingImage || !imagePath.trim()}
                  title={t('editAvatarImg.importBtn')}
                >
                  {importingImage ? '…' : t('editAvatarImg.importBtn')}
                </button>
                {hasImageData && (
                  <button className="inline-btn" onClick={clearImageFromDb}>{t('editAvatarImg.clearBtn')}</button>
                )}
              </div>
              <div className="muted" style={{ fontSize: 11 }}>
                {hasImageData ? t('editAvatarImg.hasSyncImage') : t('editAvatarImg.noSyncImage')}
              </div>
            </div>
          )}

          <label className="field-label">{t('editAvatars.iconLetters')}</label>
          <input value={iconLetters} onChange={e => setIconLetters(e.target.value)} placeholder={t('editAvatars.iconLettersPlaceholder')} maxLength={3} />

          <label className="field-label">{t('editAvatars.pronouns')}</label>
          <input value={pronouns} onChange={e => setPronouns(e.target.value)} placeholder={t('editAvatars.pronounsPlaceholder')} />

          <label className="field-label">{t('editAvatars.description')}</label>
          <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder={t('editAvatars.descriptionPlaceholder')} rows={3} />

          <label className="field-label checkbox-label">
            <input type="checkbox" checked={hidden} onChange={e => setHidden(e.target.checked)} />
            {t('editAvatars.hidden')}
          </label>

          <label className="field-label">{t('editAvatars.groups')}</label>
          <div className="group-checkboxes">
            {groups.map(g => (
              <label key={g.id} className="group-check">
                <input type="checkbox" checked={selectedGroups.includes(g.id)} onChange={() => toggleGroup(g.id)} />
                {g.name}
              </label>
            ))}
            {groups.length === 0 && <span className="muted">{t('editAvatars.noGroups')}</span>}
          </div>

          {fields.length > 0 && (
            <>
              <label className="field-label">{t('editAvatars.fields')}</label>
              <div className="avatar-field-values">
                {fields.map(f => (
                  <div key={f.id} className="avatar-field-row">
                    <span className="avatar-field-name">{f.name}</span>
                    {f.field_type === 'intRange' ? (
                      <IntRangeInput
                        value={fieldValues[f.id] ?? ''}
                        onChange={v => setFieldValues(fv => ({ ...fv, [f.id]: v }))}
                      />
                    ) : f.field_type === 'boolean' ? (
                      <select
                        value={fieldValues[f.id] ?? ''}
                        onChange={e => setFieldValues(fv => ({ ...fv, [f.id]: e.target.value }))}
                      >
                        <option value="">—</option>
                        <option value="yes">Yes</option>
                        <option value="no">No</option>
                      </select>
                    ) : f.field_type === 'list' && f.list_values ? (
                      <select
                        value={fieldValues[f.id] ?? ''}
                        onChange={e => setFieldValues(fv => ({ ...fv, [f.id]: e.target.value }))}
                      >
                        <option value="">—</option>
                        {f.list_values.split(',').map(o => o.trim()).filter(Boolean).map(o => (
                          <option key={o} value={o}>{o}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type={f.field_type === 'integer' ? 'number' : 'text'}
                        value={fieldValues[f.id] ?? ''}
                        onChange={e => setFieldValues(fv => ({ ...fv, [f.id]: e.target.value }))}
                        placeholder="—"
                      />
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          <div className="form-actions">
            <button className="save-btn" onClick={handleSave} disabled={!name.trim()}>
              {selected ? t('editAvatars.save') : t('editAvatars.create')}
            </button>
            {selected && !confirmDeleteAvatar && (
              <button className="delete-btn" onClick={() => setConfirmDeleteAvatar(true)}>{t('editAvatars.delete')}</button>
            )}
            {selected && confirmDeleteAvatar && (
              <>
                <button className="delete-btn" onClick={handleDelete}>{t('editAvatars.confirm')}</button>
                <button className="cancel-btn" onClick={() => setConfirmDeleteAvatar(false)}>{t('editAvatars.no')}</button>
              </>
            )}
            <button className="cancel-btn" onClick={clearForm}>{t('editAvatars.cancel')}</button>
          </div>
        </div>
      </div>
    </>
  )
}

// ── Image picker ──────────────────────────────────────────────────────────────

interface ImagePickerProps {
  value: string
  onChange: (v: string) => void
  packs: BuiltinPack[]
  showPicker: boolean
  setShowPicker: (v: boolean) => void
}

function ImagePicker({ value, onChange, packs, showPicker, setShowPicker }: ImagePickerProps) {
  const isBuiltin = value.startsWith('builtin://')
  const previewUrl = isBuiltin
    ? packs.flatMap(p => p.images).find(i => i.key === value)?.url
    : null

  return (
    <div className="image-picker">
      <div className="image-picker-row">
        {previewUrl && <img src={previewUrl} className="image-picker-preview" alt="" />}
        <button
          type="button"
          className="image-picker-toggle"
          onClick={() => setShowPicker(!showPicker)}
        >
          {isBuiltin ? value.replace(/^builtin:\/\/avatars\/[^/]+\//, '').replace(/\.[^.]+$/, '') : 'Choose built-in…'}
        </button>
        {value && (
          <button type="button" className="image-picker-clear" onClick={() => { onChange(''); setShowPicker(false) }}>×</button>
        )}
      </div>
      {showPicker && (
        <div className="image-picker-grid-wrap">
          {packs.map(pack => (
            <div key={pack.id}>
              <div className="image-picker-pack-label">{pack.label}</div>
              <div className="image-picker-grid">
                {pack.images.map(img => (
                  <button
                    key={img.key}
                    type="button"
                    className={`image-picker-cell${value === img.key ? ' selected' : ''}`}
                    title={img.name}
                    onClick={() => { onChange(img.key); setShowPicker(false) }}
                  >
                    <img src={img.url} alt={img.name} />
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      <input
        className="image-picker-path"
        value={isBuiltin ? '' : value}
        onChange={e => onChange(e.target.value)}
        placeholder="or enter file path…"
      />
    </div>
  )
}
