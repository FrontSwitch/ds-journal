import { useEffect } from 'react'
import { assetUrl } from '../../types'
import './Lightbox.css'

export interface LightboxImage {
  image_path: string
  image_caption: string | null
  image_location: string | null
  image_people: string | null
  avatar_name: string | null
  avatar_color: string | null
  created_at: string
}

interface Props {
  image: LightboxImage
  onClose: () => void
}

export default function Lightbox({ image, onClose }: Props) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const url = assetUrl(image.image_path)

  return (
    <div className="lightbox-backdrop" onClick={onClose}>
      <button className="lightbox-close" onClick={onClose} title="Close">×</button>
      <div className="lightbox-inner" onClick={e => e.stopPropagation()}>
        {url && <img src={url} className="lightbox-img" alt={image.image_caption ?? ''} />}
        <div className="lightbox-meta">
          {image.image_caption && <p className="lightbox-caption">{image.image_caption}</p>}
          <div className="lightbox-details">
            {image.image_location && <span className="lightbox-detail">📍 {image.image_location}</span>}
            {image.image_people && <span className="lightbox-detail">👥 {image.image_people}</span>}
            {image.avatar_name && (
              <span className="lightbox-detail lightbox-by" style={{ color: image.avatar_color ?? undefined }}>
                {image.avatar_name}
              </span>
            )}
            <span className="lightbox-detail lightbox-date">
              {new Date(image.created_at + 'Z').toLocaleDateString()}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
