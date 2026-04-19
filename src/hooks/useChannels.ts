import { useState, useEffect, useCallback } from 'react'
import { getChannels, getFolders, getChannelCounts } from '../db/channels'
import { getTrackers } from '../db/trackers'
import type { Channel, Folder } from '../types'
import type { ChannelCounts } from '../db/channels'

export function useChannels() {
  const [channels, setChannels] = useState<Channel[]>([])
  const [folders, setFolders] = useState<Folder[]>([])
  const [counts, setCounts] = useState<Record<number, ChannelCounts>>({})
  const [trackerColors, setTrackerColors] = useState<Record<number, string>>({})
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const [c, f, rawCounts, trackers] = await Promise.all([getChannels(), getFolders(), getChannelCounts(), getTrackers(true)])
    setChannels(c)
    setFolders(f)
    setCounts(Object.fromEntries(rawCounts.map(r => [r.channel_id, r])))
    setTrackerColors(Object.fromEntries(trackers.filter(t => t.color).map(t => [t.channel_id, t.color!])))
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  return { channels, folders, counts, trackerColors, loading, reload: load }
}
