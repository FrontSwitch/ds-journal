import { useState, useEffect } from 'react'
import { getAllImages } from '../../db/images'
import type { MessageImage } from '../../types'
import { assetUrl } from '../../types'
import { t } from '../../i18n'
import Lightbox, { type LightboxImage } from './Lightbox'
import './AlbumView.css'

export default function AlbumView() {
  const [images, setImages] = useState<MessageImage[]>([])
  const [loading, setLoading] = useState(true)
  const [lightbox, setLightbox] = useState<LightboxImage | null>(null)

  useEffect(() => {
    getAllImages().then(imgs => {
      setImages(imgs)
      setLoading(false)
    })
  }, [])

  if (loading) return <div className="album-view album-loading">…</div>

  if (images.length === 0) {
    return (
      <div className="album-view album-empty">
        <p>{t('album.noImages')}</p>
        <p className="album-empty-hint">{t('album.hint')}</p>
      </div>
    )
  }

  return (
    <div className="album-view">
      <div className="album-grid">
        {images.map(img => {
          const url = assetUrl(img.image_path)
          return (
            <div
              key={img.id}
              className="album-tile"
              onClick={() => setLightbox({
                image_path: img.image_path,
                image_caption: img.caption,
                image_location: img.location,
                image_people: img.people,
                avatar_name: img.avatar_name,
                avatar_color: img.avatar_color,
                created_at: img.created_at,
              })}
              title={img.caption ?? img.image_path}
            >
              {url
                ? <img src={url} className="album-thumb" alt={img.caption ?? ''} />
                : <div className="album-thumb-missing">?</div>
              }
              {img.caption && <p className="album-tile-caption">{img.caption}</p>}
              <div className="album-tile-meta">
                {img.avatar_name && (
                  <span className="album-tile-avatar" style={{ color: img.avatar_color ?? undefined }}>
                    {img.avatar_name}
                  </span>
                )}
                <span className="album-tile-date">
                  {new Date(img.created_at + 'Z').toLocaleDateString()}
                </span>
              </div>
            </div>
          )
        })}
      </div>
      {lightbox && <Lightbox image={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  )
}
