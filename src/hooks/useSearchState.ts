import { useState, useEffect } from 'react'
import { searchMessages } from '../db/messages'
import { ALL_MESSAGES_ID } from '../types'
import type { MessageRow } from '../types'

export function useSearchState(channelId: number | null, avatarFilter: number | null) {
  const [showSearch, setShowSearch] = useState(false)
  const [search, setSearch] = useState('')
  const [searchDate, setSearchDate] = useState<string | null>(null)
  const [searchResults, setSearchResults] = useState<MessageRow[] | null>(null)

  useEffect(() => {
    if ((!search.trim() && !searchDate) || channelId === null) { setSearchResults(null); return }
    const timer = setTimeout(() => {
      const channelArg = channelId === ALL_MESSAGES_ID ? undefined : channelId
      const avatarArg = (channelId === ALL_MESSAGES_ID && avatarFilter) ? avatarFilter : undefined
      searchMessages(search.trim(), channelArg, avatarArg, searchDate ?? undefined).then(setSearchResults)
    }, 300)
    return () => clearTimeout(timer)
  }, [search, searchDate, channelId, avatarFilter])

  function closeSearch() {
    setShowSearch(false)
    setSearch('')
    setSearchDate(null)
  }

  function adjustDate(delta: number) {
    const base = searchDate ? new Date(searchDate + 'T00:00:00') : new Date()
    base.setDate(base.getDate() + delta)
    setSearchDate(base.toISOString().slice(0, 10))
  }

  return { showSearch, setShowSearch, search, setSearch, searchDate, setSearchDate, searchResults, closeSearch, adjustDate }
}
