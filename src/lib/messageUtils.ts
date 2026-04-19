import type { MessageRow } from '../types'

export type RenderedMessage = MessageRow & { _depth: number }

export type LogRow =
  | { kind: 'sep'; label: string }
  | { kind: 'msg'; msg: RenderedMessage }

export function buildThreadedList(messages: MessageRow[]): RenderedMessage[] {
  const ids = new Set(messages.map(m => m.id))
  const byParent = new Map<number | null, MessageRow[]>()
  for (const m of messages) {
    const parentId = m.parent_msg_id != null && ids.has(m.parent_msg_id) ? m.parent_msg_id : null
    if (!byParent.has(parentId)) byParent.set(parentId, [])
    byParent.get(parentId)!.push(m)
  }
  const result: RenderedMessage[] = []
  function visit(parentId: number | null, depth: number) {
    for (const msg of byParent.get(parentId) ?? []) {
      result.push({ ...msg, _depth: depth })
      visit(msg.id, depth + 1)
    }
  }
  visit(null, 0)
  return result
}

function formatHourLabel(d: Date, use24Hour: boolean): string {
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  const sameYear = d.getFullYear() === now.getFullYear()
  const hourStr = d.toLocaleTimeString([], { hour: '2-digit', hour12: !use24Hour })
  if (sameDay) return hourStr
  const dayStr = d.toLocaleDateString([], {
    weekday: 'short', month: 'short', day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  })
  return `${dayStr} · ${hourStr}`
}

export function buildLogRows(messages: RenderedMessage[], use24Hour = false): LogRow[] {
  const rows: LogRow[] = []
  let lastBucket = ''
  for (const msg of messages) {
    const d = new Date(msg.created_at + 'Z')
    const bucket = `${d.toDateString()}-${d.getHours()}`
    if (bucket !== lastBucket) {
      rows.push({ kind: 'sep', label: formatHourLabel(d, use24Hour) })
      lastBucket = bucket
    }
    rows.push({ kind: 'msg', msg })
  }
  return rows
}
