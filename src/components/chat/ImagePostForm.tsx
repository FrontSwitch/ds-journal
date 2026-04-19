import { useState, useEffect } from 'react'
import { isTauri } from '../../native/platform'
import { addLog } from '../../store/debug'
import { assetUrl } from '../../types'
import { sendImageMessage } from '../../db/messages'
import { updateLastAvatar } from '../../db/channels'
import { t } from '../../i18n'
import './ImagePostForm.css'

interface Props {
  channelId: number
  defaultAvatarId: number | null
  initialImagePath?: string | null
  onClose: () => void
  onSubmitted: () => void
}

export default function ImagePostForm({ channelId, defaultAvatarId, initialImagePath, onClose, onSubmitted }: Props) {
  const [imagePath, setImagePath] = useState<string | null>(initialImagePath ?? null)
  const [caption, setCaption] = useState('')
  const [location, setLocation] = useState('')
  const [people, setPeople] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { if (initialImagePath) setImagePath(initialImagePath) }, [initialImagePath])

  const previewUrl = imagePath ? assetUrl(imagePath) : null

  async function pickFile() {
    if (!isTauri()) return
    try {
      const { open } = await import('@tauri-apps/plugin-dialog')
      const result = await open({
        multiple: false,
        filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'heic', 'heif'] }],
      })
      addLog(`pickFile: result=${JSON.stringify(result)} type=${typeof result}`)
      if (!result) return
      const path = typeof result === 'string' ? result : (result as { path: string }).path
      addLog(`pickFile: path=${path}`)
      setImagePath(path)
    } catch (e) {
      addLog(`pickFile: error: ${e}`, 'error')
      setError(String(e))
    }
  }


  async function handleSubmit() {
    if (!imagePath || !channelId) return
    setBusy(true)
    setError(null)
    try {
      await sendImageMessage(
        channelId,
        defaultAvatarId,
        imagePath,
        caption.trim() || null,
        location.trim() || null,
        people.trim() || null,
      )
      if (defaultAvatarId !== null) await updateLastAvatar(channelId, defaultAvatarId)
      onSubmitted()
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="image-post-form">
      <div className="image-post-header">
        <span className="image-post-title">{t('imagePost.title')}</span>
        <button className="image-post-close" onClick={onClose}>×</button>
      </div>

      <div
        className={`image-drop-zone${imagePath ? ' has-image' : ''}`}
        onClick={!imagePath ? pickFile : undefined}
      >
        {imagePath && previewUrl ? (
          <div className="image-drop-preview">
            <img src={previewUrl} className="image-drop-thumb" alt="preview" />
            <button className="image-drop-change" onClick={e => { e.stopPropagation(); pickFile() }}>
              {t('imagePost.change')}
            </button>
          </div>
        ) : (
          <div className="image-drop-hint">
            <span className="image-drop-icon">🖼</span>
            <span>{t('imagePost.dropHint')} <span className="image-drop-link">{t('imagePost.browse')}</span></span>
          </div>
        )}
      </div>

      <div className="image-post-fields">
        <div className="image-post-field">
          <label>{t('imagePost.caption')}</label>
          <input
            type="text"
            value={caption}
            onChange={e => setCaption(e.target.value)}
            placeholder={t('imagePost.captionPlaceholder')}
            maxLength={500}
          />
        </div>
        <div className="image-post-field">
          <label>{t('imagePost.location')}</label>
          <input
            type="text"
            value={location}
            onChange={e => setLocation(e.target.value)}
            placeholder={t('imagePost.locationPlaceholder')}
            maxLength={200}
          />
        </div>
        <div className="image-post-field">
          <label>{t('imagePost.people')}</label>
          <input
            type="text"
            value={people}
            onChange={e => setPeople(e.target.value)}
            placeholder={t('imagePost.peoplePlaceholder')}
            maxLength={200}
          />
        </div>
      </div>

      {error && <div className="image-post-error">{error}</div>}

      <div className="image-post-actions">
        <button
          className="save-btn"
          onClick={handleSubmit}
          disabled={!imagePath || busy}
        >
          {busy ? '…' : t('imagePost.post')}
        </button>
      </div>
    </div>
  )
}
