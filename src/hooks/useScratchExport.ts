import { useState } from 'react'
import { createAvatarNote } from '../db/avatars'
import { sendMessage } from '../db/messages'
import { getChannels } from '../db/channels'
import { isHidden } from '../types'
import type { ScratchMessage, Channel } from '../types'

export function useScratchExport(scratchMessages: ScratchMessage[], selectedAvatarId: number | null) {
  const [scratchExport, setScratchExport] = useState<'note' | 'channel' | null>(null)
  const [scratchExportAvatarId, setScratchExportAvatarId] = useState<number | null>(null)
  const [scratchExportChannelId, setScratchExportChannelId] = useState<number | null>(null)
  const [scratchExportChannels, setScratchExportChannels] = useState<Channel[]>([])

  async function handleExportNote() {
    if (!scratchExportAvatarId || scratchMessages.length === 0) return
    const body = scratchMessages.map(m => {
      const time = new Date(m.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
      return `${time}  ${m.avatarName ?? '—'}: ${m.text}`
    }).join('\n')
    const title = `Scratch · ${new Date().toLocaleDateString()}`
    await createAvatarNote(scratchExportAvatarId, selectedAvatarId, title, body, null, 0)
    setScratchExport(null)
    setScratchExportAvatarId(null)
  }

  async function handleExportChannel() {
    if (!scratchExportChannelId || scratchMessages.length === 0) return
    for (const msg of scratchMessages) {
      await sendMessage(scratchExportChannelId, msg.avatarId, msg.text)
    }
    setScratchExport(null)
    setScratchExportChannelId(null)
  }

  async function openChannelExport() {
    const chans = await getChannels()
    setScratchExportChannels(chans.filter(c => !isHidden(c.hidden)))
    setScratchExport('channel')
  }

  return {
    scratchExport, setScratchExport,
    scratchExportAvatarId, setScratchExportAvatarId,
    scratchExportChannelId, setScratchExportChannelId,
    scratchExportChannels,
    handleExportNote,
    handleExportChannel,
    openChannelExport,
  }
}
