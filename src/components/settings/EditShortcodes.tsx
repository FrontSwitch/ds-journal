import { useState, useEffect } from 'react'
import { EMOJI_ENTRIES, EMOJI_CATEGORIES, SKIN_TONES, applySkinTone } from '../../data/emojis'
import type { EmojiEntry } from '../../data/emojis'
import {
  getEmojiOverrides, createEmojiOverride, updateEmojiOverride, deleteEmojiOverride,
} from '../../db/emojiOverrides'
import type { EmojiOverride } from '../../db/emojiOverrides'
import { useAppStore } from '../../store/app'
import { t } from '../../i18n'

interface Props { onClose: () => void }

type Target = EmojiOverride | 'new' | null
type BuiltinTarget = EmojiEntry | null

// Normalize aliases input: allow comma or pipe separation, output pipe-separated
function normalizeAliases(raw: string): string | null {
  const parts = raw.split(/[|,]/).map(s => s.trim().toLowerCase()).filter(Boolean)
  return parts.length > 0 ? parts.join('|') : null
}

function aliasesDisplay(a: string | null): string {
  if (!a) return ''
  return a.split('|').join(', ')
}

// Preview emoji used to demonstrate skin tones — wave supports all modifiers
const TONE_PREVIEW = '👋'

export default function EditShortcodes({ onClose }: Props) {
  const { config, setConfig } = useAppStore()
  const skinTone = config.features.skinTone ?? ''

  function setSkinTone(tone: string) {
    setConfig({ ...config, features: { ...config.features, skinTone: tone } })
  }

  const [overrides, setOverrides] = useState<EmojiOverride[]>([])
  const [filter, setFilter] = useState('')

  // Left panel selection
  const [userTarget, setUserTarget] = useState<Target>(null)
  const [builtinTarget, setBuiltinTarget] = useState<BuiltinTarget>(null)

  // Editor fields (for user entry)
  const [editName, setEditName] = useState('')
  const [editAliases, setEditAliases] = useState('')
  const [editEmoji, setEditEmoji] = useState('')
  const [editCategory, setEditCategory] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setOverrides(await getEmojiOverrides())
  }

  // ── Name uniqueness check ─────────────────────────────────────────────────

  const nameConflict = editName.trim() !== '' &&
    overrides.some(o =>
      o.name === editName.trim().toLowerCase() &&
      (userTarget === 'new' || o.id !== (userTarget as EmojiOverride)?.id)
    )

  // ── Derived sets ─────────────────────────────────────────────────────────

  const overrideNames = new Set(overrides.map(o => o.name))

  // ── Filter logic ─────────────────────────────────────────────────────────

  const lowerFilter = filter.toLowerCase()

  function matchesFilter(name: string, aliases: string | null): boolean {
    if (!lowerFilter) return true
    if (name.includes(lowerFilter)) return true
    if (aliases) {
      const parts = aliases.split('|')
      if (parts.some(a => a.includes(lowerFilter))) return true
    }
    return false
  }

  function builtinMatchesFilter(entry: EmojiEntry): boolean {
    if (!lowerFilter) return true
    if (entry.name.includes(lowerFilter)) return true
    if (entry.aliases.some(a => a.includes(lowerFilter))) return true
    return false
  }

  // ── User entry CRUD ───────────────────────────────────────────────────────

  function openNewEntry() {
    setUserTarget('new')
    setBuiltinTarget(null)
    setEditName('')
    setEditAliases('')
    setEditEmoji('')
    setEditCategory('')
    setConfirmDelete(false)
  }

  function openUserEditor(o: EmojiOverride) {
    setUserTarget(o)
    setBuiltinTarget(null)
    setEditName(o.name)
    setEditAliases(aliasesDisplay(o.aliases))
    setEditEmoji(o.emoji)
    setEditCategory(o.category)
    setConfirmDelete(false)
  }

  function openBuiltinViewer(entry: EmojiEntry) {
    setBuiltinTarget(entry)
    setUserTarget(null)
    setConfirmDelete(false)
  }

  function closeEditor() {
    setUserTarget(null)
    setBuiltinTarget(null)
    setConfirmDelete(false)
  }

  async function handleSave() {
    const name = editName.trim().toLowerCase()
    if (!name || nameConflict) return
    const aliases = normalizeAliases(editAliases)
    const emoji = editEmoji.trim()
    const category = editCategory.trim()
    if (userTarget === 'new') {
      await createEmojiOverride(name, aliases, emoji, category)
    } else if (userTarget) {
      await updateEmojiOverride(userTarget.id, name, aliases, emoji, category)
    }
    closeEditor()
    load()
  }

  async function handleDelete() {
    if (!userTarget || userTarget === 'new') return
    await deleteEmojiOverride((userTarget as EmojiOverride).id)
    closeEditor()
    load()
  }

  async function handleClone(entry: EmojiEntry) {
    await createEmojiOverride(
      entry.name,
      entry.aliases.join('|') || null,
      entry.emoji,
      entry.category
    )
    closeEditor()
    load()
  }

  async function handleHide(entry: EmojiEntry) {
    await createEmojiOverride(entry.name, null, '', entry.category)
    closeEditor()
    load()
  }

  // ── Grouped list data ─────────────────────────────────────────────────────

  // User groups: collect unique categories from overrides
  const userCategories = Array.from(new Set(overrides.map(o => o.category || 'User')))

  // Collapsed state — built-in groups start collapsed; user groups start open.
  // Keys: `user-{cat}` for user groups, `builtin-{cat}` for built-in groups.
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    () => new Set(EMOJI_CATEGORIES.map(c => `builtin-${c}`))
  )

  function toggleGroup(key: string) {
    setCollapsedGroups(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const showEditor = userTarget !== null || builtinTarget !== null

  return (
    <>
      <div className="editor-header">
        <span>{t('editShortcodes.title')}</span>
        <button className="editor-close" onClick={onClose}>✕</button>
      </div>

      <div className="editor-body" style={{ gridTemplateColumns: '440px 1fr' }}>
        {/* ── Left: list ── */}
        <div className="editor-col" style={{ borderRight: '1px solid var(--border)', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', marginBottom: 4 }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', marginRight: 2 }}>Skin tone:</span>
            {Object.entries(SKIN_TONES).map(([key, modifier]) => {
              const preview = applySkinTone(TONE_PREVIEW, modifier)
              const active = skinTone === modifier
              return (
                <button
                  key={key}
                  onClick={() => setSkinTone(modifier)}
                  title={key}
                  style={{
                    fontSize: 18, lineHeight: 1,
                    padding: '2px 4px', borderRadius: 4,
                    background: active ? 'var(--bg-active, var(--bg-hover))' : 'none',
                    border: active ? '1px solid var(--accent, var(--border))' : '1px solid transparent',
                    cursor: 'pointer',
                  }}
                >
                  {preview}
                </button>
              )
            })}
          </div>

          <input
            className="editor-filter"
            placeholder={t('editShortcodes.filterPlaceholder')}
            value={filter}
            onChange={e => setFilter(e.target.value)}
            style={{ marginBottom: 8 }}
          />

          <div className="group-list" style={{ flex: 1, overflowY: 'auto' }}>
            {/* User groups */}
            {userCategories.map(cat => {
              const groupKey = `user-${cat}`
              const entries = overrides.filter(o =>
                (o.category || 'User') === cat &&
                matchesFilter(o.name, o.aliases)
              )
              if (entries.length === 0) return null
              const collapsed = !lowerFilter && collapsedGroups.has(groupKey)
              return (
                <div key={groupKey}>
                  <CategoryHeader
                    label={`${t('editShortcodes.userGroupPrefix')} — ${cat}`}
                    count={entries.length}
                    collapsed={collapsed}
                    onToggle={() => toggleGroup(groupKey)}
                  />
                  {!collapsed && entries.map(o => (
                    <ShortcodeRow
                      key={o.id}
                      emoji={applySkinTone(o.emoji, skinTone) || '∅'}
                      name={o.name}
                      aliases={aliasesDisplay(o.aliases)}
                      active={userTarget !== 'new' && (userTarget as EmojiOverride)?.id === o.id}
                      dimmed={false}
                      onClick={() => openUserEditor(o)}
                    />
                  ))}
                </div>
              )
            })}

            {/* Built-in groups */}
            {EMOJI_CATEGORIES.map(cat => {
              const groupKey = `builtin-${cat}`
              const entries = EMOJI_ENTRIES.filter(e =>
                e.category === cat && builtinMatchesFilter(e)
              )
              if (entries.length === 0) return null
              const collapsed = !lowerFilter && collapsedGroups.has(groupKey)
              return (
                <div key={groupKey}>
                  <CategoryHeader
                    label={cat}
                    count={entries.length}
                    collapsed={collapsed}
                    onToggle={() => toggleGroup(groupKey)}
                  />
                  {!collapsed && entries.map(e => (
                    <ShortcodeRow
                      key={e.name}
                      emoji={applySkinTone(e.emoji, skinTone)}
                      name={e.name}
                      aliases={e.aliases.join(', ')}
                      active={builtinTarget?.name === e.name}
                      dimmed={overrideNames.has(e.name)}
                      onClick={() => openBuiltinViewer(e)}
                    />
                  ))}
                </div>
              )
            })}

            {/* Empty state */}
            {filter && !userCategories.some(cat =>
              overrides.some(o => (o.category || 'User') === cat && matchesFilter(o.name, o.aliases))
            ) && !EMOJI_CATEGORIES.some(cat =>
              EMOJI_ENTRIES.some(e => e.category === cat && builtinMatchesFilter(e))
            ) && (
              <span className="editor-placeholder">{t('editShortcodes.noMatch')}</span>
            )}
          </div>

          {userTarget === null && builtinTarget === null && (
            <button
              className="add-btn"
              style={{ alignSelf: 'flex-start', marginTop: 8 }}
              onClick={openNewEntry}
            >
              {t('editShortcodes.newShortcode')}
            </button>
          )}
        </div>

        {/* ── Right: editor panel ── */}
        <div className="editor-col">
          {!showEditor && (
            <span className="editor-placeholder">{t('editShortcodes.builtinNote')}</span>
          )}

          {/* User entry editor */}
          {userTarget !== null && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div className="settings-section-title">
                {userTarget === 'new'
                  ? t('editShortcodes.newTitle')
                  : t('editShortcodes.editTitle', { name: editName })}
              </div>

              <label className="field-label">{t('editShortcodes.name')}</label>
              <input
                autoFocus={userTarget === 'new'}
                value={editName}
                onChange={e => setEditName(e.target.value.toLowerCase().replace(/\s/g, '_'))}
                placeholder={t('editShortcodes.namePlaceholder')}
                onKeyDown={e => { if (e.key === 'Escape') closeEditor() }}
              />
              {nameConflict && (
                <span style={{ fontSize: 11, color: 'var(--error, #f38ba8)' }}>
                  {t('editShortcodes.nameConflict')}
                </span>
              )}

              <label className="field-label">{t('editShortcodes.emoji')}</label>
              <input
                type="text"
                value={editEmoji}
                onChange={e => setEditEmoji(e.target.value)}
                placeholder={t('editShortcodes.emojiPlaceholder')}
                style={{ fontSize: 20, width: '100%' }}
              />
              {editEmoji === '' && userTarget !== 'new' && (
                <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 8 }}>
                  (hidden)
                </span>
              )}

              <label className="field-label">{t('editShortcodes.aliases')}</label>
              <input
                value={editAliases}
                onChange={e => setEditAliases(e.target.value)}
                placeholder={t('editShortcodes.aliasesPlaceholder')}
              />

              <label className="field-label">{t('editShortcodes.category')}</label>
              <input
                value={editCategory}
                onChange={e => setEditCategory(e.target.value)}
                placeholder={t('editShortcodes.categoryPlaceholder')}
              />

              <div className="form-actions">
                <button
                  className="save-btn"
                  onClick={handleSave}
                  disabled={!editName.trim() || nameConflict}
                >
                  {t('editShortcodes.save')}
                </button>
                {userTarget !== 'new' && !confirmDelete && (
                  <button className="delete-btn" onClick={() => setConfirmDelete(true)}>
                    {t('editShortcodes.delete')}
                  </button>
                )}
                {userTarget !== 'new' && confirmDelete && (
                  <>
                    <button className="delete-btn" onClick={handleDelete}>
                      {t('editShortcodes.yes')}
                    </button>
                    <button className="cancel-btn" onClick={() => setConfirmDelete(false)}>
                      {t('editShortcodes.no')}
                    </button>
                  </>
                )}
                <button className="cancel-btn" onClick={closeEditor}>
                  {t('editShortcodes.cancel')}
                </button>
              </div>
            </div>
          )}

          {/* Built-in entry viewer */}
          {builtinTarget !== null && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div className="settings-section-title">
                {t('editShortcodes.viewTitle', { name: builtinTarget.name })}
              </div>

              <div style={{ fontSize: 32, marginBottom: 8 }}>{applySkinTone(builtinTarget.emoji, skinTone)}</div>

              <label className="field-label">{t('editShortcodes.name')}</label>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>
                :{builtinTarget.name}:
              </div>

              <label className="field-label">{t('editShortcodes.aliases')}</label>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>
                {builtinTarget.aliases.length > 0
                  ? builtinTarget.aliases.map(a => `:${a}:`).join(' ')
                  : '—'}
              </div>

              <label className="field-label">{t('editShortcodes.category')}</label>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
                {builtinTarget.category}
              </div>

              {overrideNames.has(builtinTarget.name) && (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>
                  {t('editShortcodes.shadowedNote')}
                </div>
              )}

              <div className="form-actions">
                <button
                  className="save-btn"
                  onClick={() => handleClone(builtinTarget)}
                  disabled={overrideNames.has(builtinTarget.name)}
                >
                  {t('editShortcodes.clone')}
                </button>
                <button
                  className="delete-btn"
                  onClick={() => handleHide(builtinTarget)}
                  disabled={overrideNames.has(builtinTarget.name)}
                >
                  {t('editShortcodes.hide')}
                </button>
                <button className="cancel-btn" onClick={closeEditor}>
                  {t('editShortcodes.cancel')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

// ── Category header ───────────────────────────────────────────────────────────

interface CategoryHeaderProps {
  label: string
  count: number
  collapsed: boolean
  onToggle: () => void
}

function CategoryHeader({ label, count, collapsed, onToggle }: CategoryHeaderProps) {
  return (
    <button
      onClick={onToggle}
      style={{
        display: 'flex', alignItems: 'center', gap: 4,
        width: '100%', textAlign: 'left',
        background: 'none', border: 'none', cursor: 'pointer',
        padding: '6px 2px 2px',
        color: 'var(--text-muted)', fontSize: 11, fontWeight: 600,
        textTransform: 'uppercase', letterSpacing: '0.04em',
      }}
    >
      <span style={{ fontSize: 9, flexShrink: 0 }}>{collapsed ? '▶' : '▼'}</span>
      <span>{label}</span>
      <span style={{ fontWeight: 400, opacity: 0.7 }}>({count})</span>
    </button>
  )
}

// ── Row component ─────────────────────────────────────────────────────────────

interface RowProps {
  emoji: string
  name: string
  aliases: string
  active: boolean
  dimmed: boolean
  onClick: () => void
}

function ShortcodeRow({ emoji, name, aliases, active, dimmed, onClick }: RowProps) {
  return (
    <div
      className={`channel-editor-row${active ? ' active' : ''}`}
      style={{ cursor: 'pointer', opacity: dimmed ? 0.45 : 1, paddingLeft: 4 }}
      onClick={onClick}
    >
      <span style={{ fontSize: 16, flexShrink: 0, width: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{emoji}</span>
      <span className="channel-editor-name" style={{ fontWeight: 500 }}>:{name}:</span>
      {aliases && (
        <span style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {aliases}
        </span>
      )}
    </div>
  )
}
