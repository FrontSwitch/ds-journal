export interface Folder {
  id: number
  name: string
  description: string | null
  color: string | null
  hidden: number
  sort_order: number
  created_at: string
  view_mode: string | null
}

export interface Channel {
  id: number
  name: string
  folder_id: number | null
  description: string | null
  color: string | null
  hidden: number
  sort_order: number
  last_avatar_id: number | null
  created_at: string
  view_mode: string | null
  sync_enabled: number  // 1 = sync messages, 0 = local-only
}

export interface Avatar {
  id: number
  name: string
  color: string
  image_path: string | null
  image_data: string | null   // base64-encoded resized image for cross-device sync
  description: string | null
  pronouns: string | null
  hidden: number
  icon_letters: string | null
  sort_order: number
  created_at: string
}

export interface AvatarGroup {
  id: number
  name: string
  description: string | null
  color: string | null
  hidden: number
  sort_order: number
  created_at: string
}

export interface MessageRow {
  id: number
  channel_id: number
  channel_name: string
  text: string
  original_text: string | null
  deleted: number
  created_at: string
  avatar_id: number | null
  avatar_name: string | null
  avatar_color: string | null
  avatar_image_path: string | null
  avatar_image_data: string | null   // base64 from avatars.image_data
  tracker_record_id: number | null
  parent_msg_id: number | null
  // image attachment (from LEFT JOIN message_images)
  image_path: string | null
  image_caption: string | null
  image_location: string | null
  image_people: string | null
}

export interface MessageImage {
  id: number
  message_id: number
  image_path: string
  caption: string | null
  location: string | null
  people: string | null
  created_at: string
  // joined fields
  avatar_id: number | null
  avatar_name: string | null
  avatar_color: string | null
  channel_id: number
  channel_name: string
}

/** Returns true if the hidden flag (or any bit of a future bitmask) is set. */
export function isHidden(hidden: number | null): boolean {
  return (hidden ?? 0) !== 0
}

export function getMessageDisplayText(msg: MessageRow): string {
  if (msg.tracker_record_id !== null) {
    const date = msg.created_at.slice(0, 10)
    const by = msg.avatar_name ? ` by ${msg.avatar_name}` : ''
    return `Tracker record on ${date}${by}`
  }
  if (msg.image_path !== null) {
    return msg.image_caption ?? '[image]'
  }
  if (msg.text.startsWith('|front:')) {
    const name = msg.avatar_name ?? 'anonymous'
    if (msg.text === '|front:entered|') return `${name} entered front`
    if (msg.text === '|front:left|') return `${name} left front`
    if (msg.text === '|front:cleared|') return 'Front cleared'
    return msg.text.replace(/^\|front:[^|]+\|/, '').replace(/\|/g, ' ').trim() || 'Front log'
  }
  return msg.text
}

export const FIELD_TYPES = [
  'date', 'datetime', 'text_short', 'text_long',
  'list', 'integer', 'number', 'boolean', 'who', 'color', 'custom',
] as const
export type FieldType = typeof FIELD_TYPES[number]

export interface Tracker {
  id: number
  channel_id: number
  name: string
  description: string | null
  color: string | null
  hidden: number
  sync_enabled: number  // 1 = sync records, 0 = local-only
  sort_order: number
  created_at: string
}

export const SUMMARY_OPS = ['none', 'sum', 'average', 'min', 'max', 'count_true', 'count_false'] as const
export type SummaryOp = typeof SUMMARY_OPS[number]

export interface TrackerField {
  id: number
  tracker_id: number
  entity_id: string | null
  name: string
  field_type: FieldType
  sort_order: number
  required: number
  list_values: string | null   // JSON array string
  range_min: number | null
  range_max: number | null
  custom_editor: string | null
  summary_op: SummaryOp
  default_value: string | null
}

export interface TrackerRecordValueRow {
  field_id: number
  field_name: string
  field_type: FieldType
  value_text: string | null
  value_number: number | null
  value_boolean: number | null
  value_avatar_id: number | null
}

export interface TrackerRecord {
  id: number
  tracker_id: number
  avatar_id: number | null
  modified: number
  created_at: string
  values: TrackerRecordValueRow[]
}

export const AVATAR_FIELD_TYPES = ['text', 'integer', 'intRange', 'boolean', 'list'] as const
export type AvatarFieldType = typeof AVATAR_FIELD_TYPES[number]

export interface AvatarField {
  id: number
  name: string
  field_type: AvatarFieldType
  list_values: string | null   // comma-separated options for 'list' type
  sort_order: number
  created_at: string
}

export interface AvatarFieldValue {
  avatar_id: number
  field_id: number
  value: string
}

export interface AvatarNote {
  id: number
  avatar_id: number
  author_avatar_id: number | null
  editor_avatar_id: number | null
  title: string
  body: string
  color: string | null
  favorite: number   // 0 | 1
  created_at: string
  updated_at: string
}

export interface FrontLogConfig {
  id: number
  channel_id: number
  description: string | null
  color: string | null
}


export interface FrontSession {
  id: number
  avatar_id: number | null
  avatar_name: string | null
  avatar_color: string | null
  entered_at: string
  exited_at: string | null
}

export interface Tag {
  id: number
  name: string          // lowercase canonical key
  display_name: string  // original casing
  created_at: string
  last_used_at: string | null
}

// Virtual channel ids
export const ALL_MESSAGES_ID = -1
export const SCRATCH_ID      = -2
export const ALBUM_ID        = -3

export interface ScratchMessage {
  id: number           // local counter, used as React key
  avatarId: number | null
  avatarName: string | null
  avatarColor: string | null
  text: string
  createdAt: number    // Date.now()
}

// Returns initials for an avatar — 2 letters if first letter is shared with another avatar
export function getInitials(name: string, allNames: string[]): string {
  const first = name[0]?.toUpperCase() ?? '?'
  const others = allNames.filter(n => n !== name && n[0]?.toUpperCase() === first)
  if (others.length > 0) return name.slice(0, 2).toUpperCase()
  return first
}

// --- Sync types ---

export interface SyncEvent {
  event_id: string
  device_id: string
  device_counter: number
  entity_type: string
  entity_id: string
  operation: 'create' | 'update' | 'delete'
  payload: string | null   // JSON string
  timestamp: number        // ms since epoch
}

export type DeviceType = 'primary' | 'full' | 'remote' | 'cold'

export interface SyncPeer {
  device_id: string
  device_name: string | null
  device_type: DeviceType
  last_seen_counter: number
  last_sync_timestamp: number | null
  peer_address: string | null   // ip:port of their HTTP server
  peer_code: string | null      // shared pairing secret
  trusted: number
  blocked: number
}

export interface SyncConflict {
  id: string
  entity_type: string
  entity_id: string
  field_name: string | null
  device_id_a: string
  event_id_a: string
  device_id_b: string
  event_id_b: string
  detected_at: number
  status: 'open' | 'pickedA' | 'pickedB' | 'original' | 'lww'
}

// Convert a local file path or builtin:// key to a displayable URL
import { convertAssetUrl } from '../native/urls'
import { BUILTIN_IMAGES } from '../assets/builtinImages'

export function assetUrl(path: string | null): string | null {
  if (!path) return null
  if (path.startsWith('builtin://')) return BUILTIN_IMAGES[path] ?? null
  return convertAssetUrl(path)
}
