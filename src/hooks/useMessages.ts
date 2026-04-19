import { useState, useEffect, useCallback } from 'react'
import { getMessages, getAllMessages, getAllMessagesByAvatar } from '../db/messages'
import type { MessageRow } from '../types'
import { ALL_MESSAGES_ID, SCRATCH_ID, ALBUM_ID } from '../types'
import { toSqlDatetime } from '../lib/dateUtils'

export function useMessages(channelId: number | null, avatarFilter: number | null, initialLoad = 50, deleteWindowMinutes = 0) {
  const LIMITS = [initialLoad, initialLoad * 2, initialLoad * 10]
  const [messages, setMessages] = useState<MessageRow[]>([])
  const [limitIndex, setLimitIndex] = useState(0)
  const [loading, setLoading] = useState(false)

  const limit = LIMITS[limitIndex]

  const load = useCallback(async () => {
    if (channelId === null || channelId === SCRATCH_ID || channelId === ALBUM_ID) { setMessages([]); return }
    setLoading(true)
    const deletedSince = deleteWindowMinutes > 0
      ? toSqlDatetime(new Date(Date.now() - deleteWindowMinutes * 60_000))
      : null
    let rows: MessageRow[]
    if (channelId === ALL_MESSAGES_ID) {
      rows = avatarFilter
        ? await getAllMessagesByAvatar(avatarFilter, limit, deletedSince)
        : await getAllMessages(limit, deletedSince)
    } else {
      rows = await getMessages(channelId, limit, deletedSince)
    }
    // reverse so newest is at bottom
    setMessages([...rows].reverse())
    setLoading(false)
  }, [channelId, avatarFilter, limit, deleteWindowMinutes])

  useEffect(() => {
    setLimitIndex(0)  // reset pagination when channel changes
  }, [channelId])

  useEffect(() => { load() }, [load])

  const loadMore = () => {
    if (limitIndex < LIMITS.length - 1) setLimitIndex(i => i + 1)
  }

  const canLoadMore = limitIndex < LIMITS.length - 1

  return { messages, loading, reload: load, loadMore, canLoadMore }
}
