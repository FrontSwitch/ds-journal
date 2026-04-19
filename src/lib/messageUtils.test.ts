import { describe, it, expect } from 'vitest'
import { buildThreadedList, buildLogRows } from './messageUtils'
import type { MessageRow } from '../types'

// Minimal stub — only fields the functions actually use
function msg(id: number, parent_msg_id: number | null = null, created_at = '2025-01-01 10:00:00'): MessageRow {
  return {
    id,
    parent_msg_id,
    channel_id: 1,
    channel_name: 'general',
    text: `msg ${id}`,
    original_text: null,
    deleted: 0,
    created_at,
    avatar_id: 1,
    avatar_name: 'Alex',
    avatar_color: '#89b4fa',
    avatar_image_path: null,
    avatar_image_data: null,
    tracker_record_id: null,
    image_path: null, image_caption: null, image_location: null, image_people: null,
  }
}

describe('buildThreadedList', () => {
  it('returns flat list unchanged when no replies', () => {
    const msgs = [msg(1), msg(2), msg(3)]
    const result = buildThreadedList(msgs)
    expect(result.map(m => m.id)).toEqual([1, 2, 3])
    expect(result.every(m => m._depth === 0)).toBe(true)
  })

  it('places reply immediately after parent at depth 1', () => {
    const msgs = [msg(1), msg(2, 1), msg(3)]
    const result = buildThreadedList(msgs)
    expect(result.map(m => [m.id, m._depth])).toEqual([
      [1, 0],
      [2, 1], // reply to 1
      [3, 0],
    ])
  })

  it('nests multiple levels deep', () => {
    const msgs = [msg(1), msg(2, 1), msg(3, 2), msg(4, 3)]
    const result = buildThreadedList(msgs)
    expect(result.map(m => [m.id, m._depth])).toEqual([
      [1, 0],
      [2, 1],
      [3, 2],
      [4, 3],
    ])
  })

  it('treats out-of-window parent as root-level', () => {
    // msg 5 references parent 99 which is not in the list
    const msgs = [msg(1), msg(5, 99), msg(3)]
    const result = buildThreadedList(msgs)
    const depths = Object.fromEntries(result.map(m => [m.id, m._depth]))
    expect(depths[5]).toBe(0) // orphaned parent → treated as top-level
  })

  it('handles multiple reply branches', () => {
    // 1 → [2, 3]  (two replies to same parent)
    const msgs = [msg(1), msg(2, 1), msg(3, 1), msg(4)]
    const result = buildThreadedList(msgs)
    expect(result[0]).toMatchObject({ id: 1, _depth: 0 })
    expect(result.slice(1, 3).map(m => m._depth)).toEqual([1, 1])
    expect(result[3]).toMatchObject({ id: 4, _depth: 0 })
  })

  it('preserves all message fields', () => {
    const original = msg(1)
    const [rendered] = buildThreadedList([original])
    expect(rendered.channel_name).toBe('general')
    expect(rendered.avatar_name).toBe('Alex')
    expect(rendered._depth).toBe(0)
  })
})

describe('buildLogRows', () => {
  function rendered(id: number, created_at: string) {
    return { ...msg(id, null, created_at), _depth: 0 }
  }

  it('inserts a separator before the first message', () => {
    const rows = buildLogRows([rendered(1, '2025-01-01 10:00:00')])
    expect(rows[0].kind).toBe('sep')
    expect(rows[1]).toMatchObject({ kind: 'msg', msg: expect.objectContaining({ id: 1 }) })
  })

  it('groups messages in the same hour under one separator', () => {
    const rows = buildLogRows([
      rendered(1, '2025-01-01 10:00:00'),
      rendered(2, '2025-01-01 10:45:00'),
      rendered(3, '2025-01-01 10:59:00'),
    ])
    const seps = rows.filter(r => r.kind === 'sep')
    expect(seps).toHaveLength(1)
    expect(rows).toHaveLength(4) // 1 sep + 3 msgs
  })

  it('inserts new separator when hour changes', () => {
    const rows = buildLogRows([
      rendered(1, '2025-01-01 10:00:00'),
      rendered(2, '2025-01-01 11:00:00'),
    ])
    const seps = rows.filter(r => r.kind === 'sep')
    expect(seps).toHaveLength(2)
  })

  it('inserts new separator when day changes', () => {
    const rows = buildLogRows([
      rendered(1, '2025-01-01 10:00:00'),
      rendered(2, '2025-01-02 10:00:00'),
    ])
    expect(rows.filter(r => r.kind === 'sep')).toHaveLength(2)
  })

  it('returns empty array for empty input', () => {
    expect(buildLogRows([])).toEqual([])
  })
})
