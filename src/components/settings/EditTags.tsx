import { useState, useEffect } from 'react'
import { getTags, deleteTag } from '../../db/tags'
import type { Tag } from '../../types'
import { t } from '../../i18n'

interface Props {
  onClose: () => void
}

export default function EditTags({ onClose }: Props) {
  const [tags, setTags] = useState<Tag[]>([])

  async function load() {
    setTags(await getTags())
  }

  useEffect(() => { load() }, [])

  async function handleDelete(id: number) {
    await deleteTag(id)
    load()
  }

  function formatDate(iso: string | null): string {
    if (!iso) return t('editTags.never')
    return new Date(iso).toLocaleDateString()
  }

  return (
    <>
      <div className="editor-header">
        <span>{t('editTags.title')}</span>
        <button className="editor-close" onClick={onClose}>✕</button>
      </div>
      <div className="editor-body single">
        <div className="editor-col">
          {tags.length === 0 ? (
            <p className="editor-placeholder">{t('editTags.empty')}</p>
          ) : (
            tags.map(tag => (
              <div key={tag.id} className="tag-row">
                <span className="tag-row-name">#{tag.display_name}</span>
                <span className="tag-row-date">{t('editTags.lastUsed', { date: formatDate(tag.last_used_at) })}</span>
                <button className="tag-row-delete" onClick={() => handleDelete(tag.id)}>✕</button>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  )
}
