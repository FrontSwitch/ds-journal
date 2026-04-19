import { useState } from 'react'
import { assetUrl } from '../../types'
import type { MessageRow } from '../../types'
import { t } from '../../i18n'
import Lightbox, { type LightboxImage } from './Lightbox'
import './ImageMessage.css'

interface Props {
  msg: MessageRow
}

export default function ImageMessage({ msg }: Props) {
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const url = assetUrl(msg.image_path)

  const imageData: LightboxImage = {
    image_path: msg.image_path!,
    image_caption: msg.image_caption,
    image_location: msg.image_location,
    image_people: msg.image_people,
    avatar_name: msg.avatar_name,
    avatar_color: msg.avatar_color,
    created_at: msg.created_at,
  }

  return (
    <>
      <div className="image-message" onClick={() => setLightboxOpen(true)} title={t('imageMessage.clickToView')}>
        {url
          ? <img src={url} className="image-thumbnail" alt={msg.image_caption ?? 'image'} />
          : <div className="image-thumbnail-missing">{t('imageMessage.notFound')}</div>
        }
        {msg.image_caption && <p className="image-caption">{msg.image_caption}</p>}
        <div className="image-details">
          {msg.image_location && <span className="image-detail">📍 {msg.image_location}</span>}
          {msg.image_people && <span className="image-detail">👥 {msg.image_people}</span>}
        </div>
      </div>
      {lightboxOpen && <Lightbox image={imageData} onClose={() => setLightboxOpen(false)} />}
    </>
  )
}
