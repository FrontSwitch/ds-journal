import './AvatarIcon.css'
import { assetUrl, getInitials } from '../../types'

interface AvatarIconProps {
  image_data?: string | null
  image_path?: string | null
  icon_letters?: string | null
  name: string
  color?: string | null
  allNames?: string[]
  size?: number
  className?: string
}

export function AvatarIcon({ image_data, image_path, icon_letters, name, color, allNames, size, className }: AvatarIconProps) {
  const style: React.CSSProperties & { '--ai-size'?: string } = {
    background: color ?? 'var(--text-muted)',
  }
  if (size != null) style['--ai-size'] = `${size}px`

  const cls = ['avatar-icon', className].filter(Boolean).join(' ')

  if (image_data) {
    return (
      <span className={cls} style={style}>
        <img src={`data:image/png;base64,${image_data}`} alt={name} draggable={false} />
      </span>
    )
  }
  if (image_path) {
    return (
      <span className={cls} style={style}>
        <img src={assetUrl(image_path)!} alt={name} draggable={false} />
      </span>
    )
  }
  return (
    <span className={cls} style={style}>
      {icon_letters || (allNames ? getInitials(name, allNames) : name.charAt(0).toUpperCase())}
    </span>
  )
}
