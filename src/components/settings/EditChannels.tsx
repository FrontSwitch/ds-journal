import { useState, useEffect } from 'react'
import ColorInput from './ColorInput'
import { t } from '../../i18n'
import { useChannels } from '../../hooks/useChannels'
import {
  createFolder, createChannel,
  deleteFolder, deleteChannel, softDeleteChannel, restoreChannel, moveChannelToFolder,
  updateFolder, updateChannel, setFolderSortOrders, setChannelSortOrders,
  getChannelTotals, setChannelSyncEnabled,
} from '../../db/channels'
import { isHidden } from '../../types'
import type { Channel, Folder } from '../../types'

interface Props { onClose: () => void }

type Selected =
  | { type: 'folder'; item: Folder }
  | { type: 'channel'; item: Channel }
  | { type: 'new-folder' }
  | { type: 'new-channel' }
  | null

export default function EditChannels({ onClose }: Props) {
  const { channels, folders, loading, reload } = useChannels()
  const [totals, setTotals] = useState<Record<number, number>>({})
  useEffect(() => {
    getChannelTotals().then(rows => {
      setTotals(Object.fromEntries(rows.map(r => [r.channel_id, r.total])))
    })
  }, [])

  const [selected, setSelected] = useState<Selected>(null)
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editColor, setEditColor] = useState('')
  const [editHidden, setEditHidden] = useState(false)
  const [editSyncEnabled, setEditSyncEnabled] = useState(true)
  const [editFolderId, setEditFolderId] = useState<number | null>(null)
  const [editViewMode, setEditViewMode] = useState<string>('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  const [collapsedFolders, setCollapsedFolders] = useState<Record<number, boolean>>({})

  const visibleChannels = channels.filter(c => !isHidden(c.hidden))
  const deletedChannels = channels.filter(c => isHidden(c.hidden))
  const orphans = visibleChannels.filter(c => c.folder_id === null)
  const channelsInFolder = (folderId: number) => visibleChannels.filter(c => c.folder_id === folderId)
  const allCollapsed = folders.length > 0 && folders.every(f => collapsedFolders[f.id])

  function toggleFolderCollapse(id: number) {
    setCollapsedFolders(c => ({ ...c, [id]: !c[id] }))
  }

  function collapseAll() {
    setCollapsedFolders(Object.fromEntries(folders.map(f => [f.id, true])))
  }

  function expandAll() {
    setCollapsedFolders({})
  }

  function selectItem(type: 'folder', item: Folder): void
  function selectItem(type: 'channel', item: Channel): void
  function selectItem(type: 'folder' | 'channel', item: Folder | Channel) {
    setSelected({ type, item } as Selected)
    setEditName(item.name)
    setEditDescription(item.description ?? '')
    setEditColor(item.color ?? '')
    setEditHidden(isHidden(item.hidden))
    setEditSyncEnabled(type === 'channel' ? ((item as Channel).sync_enabled ?? 1) !== 0 : true)
    setEditFolderId(type === 'channel' ? (item as Channel).folder_id : null)
    setEditViewMode(item.view_mode ?? '')
    setConfirmDelete(false)
  }

  function clearSelection() {
    setSelected(null)
    setConfirmDelete(false)
  }

  async function handleSave() {
    if (!editName.trim()) return
    const desc = editDescription.trim() || null
    const col = editColor.trim() || null
    const hid = editHidden ? 1 : 0
    const vm = editViewMode || null
    if (selected?.type === 'new-folder') {
      await createFolder(editName.trim(), desc, col, hid)
    } else if (selected?.type === 'new-channel') {
      await createChannel(editName.trim(), editFolderId, desc, col, hid, vm)
    } else if (selected?.type === 'folder') {
      await updateFolder(selected.item.id, editName.trim(), desc, col, hid, vm)
    } else if (selected?.type === 'channel') {
      await updateChannel(selected.item.id, editName.trim(), desc, col, hid, vm)
      if (editFolderId !== (selected.item as Channel).folder_id) {
        await moveChannelToFolder(selected.item.id, editFolderId)
      }
      const prevSyncEnabled = ((selected.item as Channel).sync_enabled ?? 1) !== 0
      if (editSyncEnabled !== prevSyncEnabled) {
        await setChannelSyncEnabled(selected.item.id, editSyncEnabled)
      }
    }
    clearSelection()
    reload()
  }

  async function handleDelete() {
    if (!selected) return
    if (selected.type === 'folder') {
      const hasChannels = visibleChannels.some(c => c.folder_id === selected.item.id)
      if (hasChannels) { alert(t('editChannels.removeFolderFirst')); return }
      await deleteFolder(selected.item.id)
    } else if (selected.type === 'channel') {
      const total = totals[selected.item.id] ?? 0
      if (total > 0) {
        await softDeleteChannel(selected.item.id)
      } else {
        await deleteChannel(selected.item.id)
      }
    }
    clearSelection()
    reload()
  }

  async function handleRestore(id: number) {
    await restoreChannel(id)
    reload()
  }

  async function handlePermanentDelete(id: number) {
    await deleteChannel(id)
    reload()
  }

  function openNewFolder() {
    setSelected({ type: 'new-folder' })
    setEditName('')
    setEditDescription('')
    setEditColor('')
    setEditHidden(false)
    setEditSyncEnabled(true)
    setEditViewMode('')
    setConfirmDelete(false)
  }

  function openNewChannel() {
    setSelected({ type: 'new-channel' })
    setEditName('')
    setEditDescription('')
    setEditColor('')
    setEditHidden(false)
    setEditSyncEnabled(true)
    setEditFolderId(null)
    setEditViewMode('')
    setConfirmDelete(false)
  }

  async function moveFolderOrder(index: number, dir: 'up' | 'down') {
    const swap = dir === 'up' ? index - 1 : index + 1
    if (swap < 0 || swap >= folders.length) return
    const reordered = [...folders]
    ;[reordered[index], reordered[swap]] = [reordered[swap], reordered[index]]
    await setFolderSortOrders(reordered.map(f => f.id))
    reload()
  }

  async function moveChannelOrder(channelList: Channel[], index: number, dir: 'up' | 'down') {
    const swap = dir === 'up' ? index - 1 : index + 1
    if (swap < 0 || swap >= channelList.length) return
    const reordered = [...channelList]
    ;[reordered[index], reordered[swap]] = [reordered[swap], reordered[index]]
    await setChannelSortOrders(reordered.map(c => c.id))
    reload()
  }

  const renderChannel = (ch: Channel, channelList: Channel[], index: number, indented: boolean) => (
    <div key={ch.id} className={`channel-editor-row${indented ? ' indented' : ''} ${selected?.type === 'channel' && selected.item.id === ch.id ? 'active' : ''}`}>
      <div className="group-order-btns">
        <button onClick={() => moveChannelOrder(channelList, index, 'up')} disabled={index === 0}>▲</button>
        <button onClick={() => moveChannelOrder(channelList, index, 'down')} disabled={index === channelList.length - 1}>▼</button>
      </div>
      <span
        className="channel-editor-name"
        style={ch.color ? { color: ch.color } : undefined}
        onClick={() => selectItem('channel', ch)}
      ># {ch.name}</span>
      {totals[ch.id] != null && (
        <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>
          {totals[ch.id]}
        </span>
      )}
    </div>
  )

  const renderFolder = (f: Folder, index: number) => {
    const kids = channelsInFolder(f.id)
    const isCollapsed = !!collapsedFolders[f.id]
    return (
      <div key={f.id}>
        <div className={`channel-editor-folder ${selected?.type === 'folder' && selected.item.id === f.id ? 'active' : ''}`}>
          <button className="folder-collapse-btn" onClick={() => toggleFolderCollapse(f.id)}>
            {isCollapsed ? '▶' : '▼'}
          </button>
          <div className="group-order-btns">
            <button onClick={() => moveFolderOrder(index, 'up')} disabled={index === 0}>▲</button>
            <button onClick={() => moveFolderOrder(index, 'down')} disabled={index === folders.length - 1}>▼</button>
          </div>
          <span
            className="channel-editor-name"
            style={f.color ? { color: f.color } : undefined}
            onClick={() => selectItem('folder', f)}
          >📁 {f.name}{isHidden(f.hidden) ? ' 👁' : ''}</span>
        </div>
        {!isCollapsed && kids.map((ch, i) => renderChannel(ch, kids, i, true))}
      </div>
    )
  }

  if (loading) return (
    <>
      <div className="editor-header">
        <span>{t('editChannels.title')}</span>
        <button className="editor-close" onClick={onClose}>✕</button>
      </div>
      <div className="editor-body channels"><div className="editor-col"><span className="editor-placeholder">{t('editChannels.loading')}</span></div></div>
    </>
  )

  return (
    <>
      <div className="editor-header">
        <span>{t('editChannels.title')}</span>
        <button className="editor-close" onClick={onClose}>✕</button>
      </div>
      <div className="editor-body channels">
        <div className="editor-col channel-list-col">

          {/* Toolbar — always visible, never scrolls */}
          <div className="channel-editor-toolbar">
            <button className="add-btn" onClick={allCollapsed ? expandAll : collapseAll}>
              {allCollapsed ? t('editChannels.expandAll') : t('editChannels.collapseAll')}
            </button>
            <button className="add-btn" onClick={openNewFolder}>{t('editChannels.addFolder')}</button>
            <button className="add-btn" onClick={openNewChannel}>{t('editChannels.addChannel')}</button>
          </div>

          {/* Scrollable list */}
          <div className="channel-editor-scroll">
            {orphans.map((ch, i) => renderChannel(ch, orphans, i, false))}
            {folders.map((f, i) => renderFolder(f, i))}
            {deletedChannels.length > 0 && (
              <>
                <div className="channel-editor-folder" style={{ marginTop: 12 }}>{t('editChannels.deleted')}</div>
                {deletedChannels.map(ch => (
                  <div key={ch.id} className="channel-editor-row indented">
                    <span className="channel-editor-name" style={{ color: 'var(--text-muted)' }}># {ch.name}</span>
                    {totals[ch.id] != null && (
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>
                        {totals[ch.id]}
                      </span>
                    )}
                    <button onClick={() => handleRestore(ch.id)}>{t('editChannels.restore')}</button>
                    {(totals[ch.id] ?? 0) === 0 && (
                      <button className="danger" onClick={() => handlePermanentDelete(ch.id)}>✕</button>
                    )}
                  </div>
                ))}
              </>
            )}
          </div>

        </div>

        <div className="editor-col">
          {selected === null ? (
            <span className="editor-placeholder">{t('editChannels.placeholder')}</span>
          ) : (
            <>
              <div className="settings-section-title">
                {selected.type === 'new-folder' ? t('editChannels.newFolder') :
                 selected.type === 'new-channel' ? t('editChannels.newChannel') :
                 t('editChannels.editTitle', { type: selected.type, name: selected.item.name })}
              </div>

              <label className="field-label">{t('editChannels.name')}</label>
              <input
                autoFocus={selected.type === 'new-folder' || selected.type === 'new-channel'}
                value={editName}
                onChange={e => setEditName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Escape') clearSelection() }}
              />

              {(selected.type === 'channel' || selected.type === 'new-channel') && (
                <>
                  <label className="field-label">{t('editChannels.folder')}</label>
                  <select
                    value={editFolderId ?? ''}
                    onChange={e => setEditFolderId(e.target.value === '' ? null : Number(e.target.value))}
                    style={{ fontSize: 13, background: 'var(--bg-hover)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 4, padding: '5px 8px' }}
                  >
                    <option value="">{t('editChannels.noFolder')}</option>
                    {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                </>
              )}

              <label className="field-label">{t('editChannels.color')}</label>
              <ColorInput value={editColor} onChange={setEditColor} />

              <label className="field-label">{t('editChannels.description')}</label>
              <textarea
                value={editDescription}
                onChange={e => setEditDescription(e.target.value)}
                placeholder={t('editChannels.descriptionPlaceholder', { type: selected.type === 'new-folder' ? 'folder' : 'channel' })}
                rows={3}
              />

              <label className="field-label">View mode</label>
              <select
                value={editViewMode}
                onChange={e => setEditViewMode(e.target.value)}
                style={{ fontSize: 13, background: 'var(--bg-hover)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 4, padding: '5px 8px' }}
              >
                <option value="">Inherit from {selected.type === 'channel' || selected.type === 'new-channel' ? 'folder / config' : 'config'}</option>
                <option value="normal">Normal</option>
                <option value="compact">Compact</option>
                <option value="log">Log</option>
              </select>

              <label className="field-label checkbox-label">
                <input type="checkbox" checked={editHidden} onChange={e => setEditHidden(e.target.checked)} />
                {t('editChannels.hidden')}
              </label>

              {selected.type === 'channel' && (
                <label className="field-label checkbox-label" title={t('editChannels.syncEnabledHint')}>
                  <input type="checkbox" checked={editSyncEnabled} onChange={e => setEditSyncEnabled(e.target.checked)} />
                  {t('editChannels.syncEnabled')}
                </label>
              )}

              <div className="form-actions">
                <button className="save-btn" onClick={handleSave} disabled={!editName.trim()}>
                  {selected.type === 'new-folder' || selected.type === 'new-channel' ? t('editChannels.create') : t('editChannels.save')}
                </button>
                {selected.type !== 'new-folder' && selected.type !== 'new-channel' && !confirmDelete && (
                  <button className="delete-btn" onClick={() => setConfirmDelete(true)}>
                    {selected.type === 'channel' && (totals[selected.item.id] ?? 0) > 0 ? t('editChannels.hide') : t('editChannels.delete')}
                  </button>
                )}
                {selected.type !== 'new-folder' && selected.type !== 'new-channel' && confirmDelete && (
                  <>
                    <button className="delete-btn" onClick={handleDelete}>{t('editChannels.confirm')}</button>
                    <button className="cancel-btn" onClick={() => setConfirmDelete(false)}>{t('editChannels.no')}</button>
                  </>
                )}
                <button className="cancel-btn" onClick={clearSelection}>{t('editChannels.cancel')}</button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}
