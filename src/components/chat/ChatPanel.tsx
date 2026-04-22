import { useRef, useEffect, useState, useMemo, useCallback, MutableRefObject } from 'react'
import { useMobile } from '../../hooks/useMobile'
import { useMessages } from '../../hooks/useMessages'
import { useAvatars } from '../../hooks/useAvatars'
import { useTagInput, TAG_OPTIONS, MENTION_OPTIONS } from '../../hooks/useTagInput'
import { useSearchState } from '../../hooks/useSearchState'
import { useTrackerState } from '../../hooks/useTrackerState'
import { useScratchExport } from '../../hooks/useScratchExport'
import { useAppStore } from '../../store/app'
import { sendMessage, editMessage, deleteMessage, undeleteMessage } from '../../db/messages'
import { updateLastAvatar, getChannelViewModes, getChannels } from '../../db/channels'
import { getRecordsByIds, getTrackers } from '../../db/trackers'
import { getFrontLogConfig, getCurrentFront, enterFront, exitFront, clearFront } from '../../db/front-log'
import type { FrontLogConfig, ScratchMessage } from '../../types'
import type { MessageRow, TrackerRecord, TrackerRecordValueRow, Avatar } from '../../types'
import { ALL_MESSAGES_ID, SCRATCH_ID, ALBUM_ID, assetUrl, getMessageDisplayText, isHidden } from '../../types'
import { buildThreadedList, buildLogRows } from '../../lib/messageUtils'
import type { RenderedMessage } from '../../lib/messageUtils'
import { addLog } from '../../store/debug'
import { isTauri } from '../../native/platform'
import { t } from '../../i18n'
import RecordEntryForm from './RecordEntryForm'
import ImagePostForm from './ImagePostForm'
import ImageMessage from './ImageMessage'
import FrontLogMessage, { isFrontSentinel } from './FrontLogMessage'
import AlbumView from './AlbumView'
import TrackerReport from './TrackerReport'
import FrontLogReport from '../front-log/FrontLogReport'
import TagAutocomplete from './TagAutocomplete'
import SlashAutocomplete from './SlashAutocomplete'
import { PageEditor } from './PageEditor'
import EmojiAutocomplete from './EmojiAutocomplete'
import { useSlashInput, SETTINGS_PAGES } from '../../hooks/useSlashInput'
import { TAROT_DECK } from '../../data/tarot'
import { useEmojiInput } from '../../hooks/useEmojiInput'
import { matchBot, getBotConfig, listBotNames, distillTone, TONE_HISTORY_SIZE, type ResolvedBotConfig, type BotMessage, type ToneSnapshot } from '../../lib/botEngine'
import './ChatPanel.css'

interface Props {
  channelId: number | null
  avatarFilter: number | null
}

function makeDepthStyle(colors: string[]) {
  return function depthStyle(depth: number): React.CSSProperties | undefined {
    if (depth === 0) return undefined
    const color = colors[(depth - 1) % colors.length]
    return {
      paddingLeft: `${16 + depth * 24}px`,
      borderLeft: `3px solid ${color}`,
      background: `${color}0d`,
    }
  }
}


function decayBotTags(
  tags: string[],
  lastMsgAtRef: MutableRefObject<number>,
  setTags: (t: string[]) => void,
): string[] {
  const now = Date.now()
  const elapsed = lastMsgAtRef.current > 0 ? now - lastMsgAtRef.current : 0
  lastMsgAtRef.current = now
  if (elapsed <= 2 * 60_000 || tags.length === 0) return tags
  const decay = Math.floor((elapsed - 2 * 60_000) / (5 * 60_000))
  if (decay <= 0) return tags
  const decayed = tags.slice(0, Math.max(0, tags.length - decay))
  setTags(decayed)
  return decayed
}

export default function ChatPanel({ channelId, avatarFilter }: Props) {
  const isMobile = useMobile()
  const {
    selectedAvatarId, avatarPanelMode, setAvatarPanelMode, config,
    setSelectedChannel, setSelectedAvatar, setShowSettings, setShowDebug,
    setPendingSettingsPage,
    setPendingOpenAvatarId, setPendingNewNoteAvatarId,
    setCurrentFront,
    scratchMessages, addScratchMessage, clearScratch,
  } = useAppStore()

  async function refreshFront() {
    const sessions = await getCurrentFront()
    setCurrentFront(sessions)
  }
  const deleteWindowMinutes = config.messages?.deleteWindowMinutes ?? 10
  const editWindowMinutes = config.messages?.editWindowMinutes ?? 30
  const { messages, loading, reload, loadMore, canLoadMore } = useMessages(channelId, avatarFilter, config.db.initialMessageLoad, deleteWindowMinutes)
  const { avatars } = useAvatars(null)
  const [text, setText] = useState('')
  const [editing, setEditing] = useState<{ id: number; text: string } | null>(null)
  const [frontLogConfig, setFrontLogConfig] = useState<FrontLogConfig | null>(null)
  const [showImageForm, setShowImageForm] = useState(false)
  const [droppedImagePath, setDroppedImagePath] = useState<string | null>(null)
  const [replyTo, setReplyTo] = useState<MessageRow | null>(null)
  const [channelViewMode, setChannelViewMode] = useState<string | null>(null)
  const [folderViewMode, setFolderViewMode] = useState<string | null>(null)
  const [trackerRecords, setTrackerRecords] = useState<Map<number, TrackerRecord>>(new Map())
  const [botConfig, setBotConfig] = useState<ResolvedBotConfig | null>(null)
  const [botMessage, setBotMessage] = useState<BotMessage | null>(null)
  const [botHidden, setBotHidden] = useState(false)
  const [botRecentTags, setBotRecentTags] = useState<string[]>([])
  const [toneHistory, setToneHistory] = useState<ToneSnapshot[]>([])
  const botTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const botLastMsgAtRef = useRef<number>(0)

  interface WriteSession {
    goalType: 'time' | 'words'
    goalValue: number
    startTime: number
    wordCount: number
    channelId: number
    intentMsgId: number | null
  }
  const [pageEditorOpen, setPageEditorOpen] = useState(false)
  const [writeSession, setWriteSession] = useState<WriteSession | null>(null)
  const [writeTick, setWriteTick] = useState(0)
  const writeSessionRef = useRef<WriteSession | null>(null)
  const writeTickRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const dateInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)
  const [cmdError, setCmdError] = useState<string | null>(null)
  const pendingOpenRef = useRef<'record' | 'report' | null>(null)

  const slash = useSlashInput(text)
  const chatTag     = useTagInput(TAG_OPTIONS, config.features.tags)
  const chatMention = useTagInput(MENTION_OPTIONS, config.features.mentions)
  const chatEmoji   = useEmojiInput(true, config.features.builtinShortcodes, config.features.skinTone)
  const searchTag     = useTagInput(TAG_OPTIONS, config.features.tags)
  const searchMention = useTagInput(MENTION_OPTIONS, config.features.mentions)

  useEffect(() => {
    getFrontLogConfig().then(setFrontLogConfig)
  }, [])

  const isFrontLogChannel = frontLogConfig !== null && channelId === frontLogConfig.channel_id
  const selectedAvatar = avatars.find(a => a.id === selectedAvatarId)

  const { showSearch, setShowSearch, search, setSearch, searchDate, setSearchDate, searchResults, closeSearch, adjustDate } = useSearchState(channelId, avatarFilter)
  const { tracker, trackerFields, showRecordForm, setShowRecordForm, showReport, setShowReport } = useTrackerState(channelId, isFrontLogChannel, pendingOpenRef)
  const { scratchExport, setScratchExport, scratchExportAvatarId, setScratchExportAvatarId, scratchExportChannelId, setScratchExportChannelId, scratchExportChannels, handleExportNote, handleExportChannel, openChannelExport } = useScratchExport(scratchMessages, selectedAvatarId)

  // Window-level drag-drop: accept image drops anywhere, open image form with the path.
  useEffect(() => {
    if (!isTauri()) return
    let unlisten: (() => void) | undefined
    import('@tauri-apps/api/window').then(({ getCurrentWindow }) => {
      getCurrentWindow().onDragDropEvent(event => {
        if (event.payload.type !== 'drop') return
        const paths = (event.payload as { paths?: string[] }).paths
        if (!paths || paths.length === 0) return
        const path = paths[0]
        const imageExts = /\.(png|jpe?g|gif|webp|bmp|svg|heic|heif)$/i
        if (!imageExts.test(path)) return
        setDroppedImagePath(path)
        setShowImageForm(true)
      }).then(fn => { unlisten = fn })
    })
    return () => unlisten?.()
  }, [])

  // Keep textarea focused unless search or record form is active (desktop only)
  useEffect(() => {
    if (isMobile) return
    if (!showSearch && !showRecordForm) {
      textareaRef.current?.focus()
    }
  }, [isMobile, channelId, showSearch, showRecordForm])

  // Global: Escape or any printable key while focus is on body → jump to textarea (desktop only)
  useEffect(() => {
    if (isMobile) return
    function handleGlobalKey(e: KeyboardEvent) {
      if (showSearch || showRecordForm) return
      const active = document.activeElement as HTMLElement | null
      const tag = active?.tagName?.toLowerCase()
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return
      const isPrintable = e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey
      if (e.key === 'Escape' || isPrintable) {
        textareaRef.current?.focus()
      }
    }
    document.addEventListener('keydown', handleGlobalKey)
    return () => document.removeEventListener('keydown', handleGlobalKey)
  }, [isMobile, showSearch, showRecordForm])

  // Restore cursor after programmatic tag/mention/emoji acceptance
  useEffect(() => {
    const cur = chatTag.pendingCursor.current ?? chatMention.pendingCursor.current ?? chatEmoji.pendingCursor.current
    if (cur !== null && textareaRef.current) {
      textareaRef.current.setSelectionRange(cur, cur)
      chatTag.pendingCursor.current = null
      chatMention.pendingCursor.current = null
      chatEmoji.pendingCursor.current = null
    }
  }, [text])

  useEffect(() => {
    const cur = searchTag.pendingCursor.current ?? searchMention.pendingCursor.current
    if (cur !== null && searchInputRef.current) {
      searchInputRef.current.setSelectionRange(cur, cur)
      searchTag.pendingCursor.current = null
      searchMention.pendingCursor.current = null
    }
  }, [search])

  useEffect(() => {
    if (!channelId || channelId === ALL_MESSAGES_ID || channelId === SCRATCH_ID || channelId === ALBUM_ID) {
      setShowImageForm(false)
    }
  }, [channelId])

  useEffect(() => {
    setReplyTo(null)
  }, [channelId])

  useEffect(() => {
    setBotMessage(null)
    if (botTimerRef.current) { clearTimeout(botTimerRef.current); botTimerRef.current = null }
  }, [channelId])

  useEffect(() => {
    return () => {
      if (writeTickRef.current) clearInterval(writeTickRef.current)
      if (botTimerRef.current) clearTimeout(botTimerRef.current)
    }
  }, [])

  useEffect(() => {
    if (!channelId || channelId === ALL_MESSAGES_ID || channelId === SCRATCH_ID || channelId === ALBUM_ID) {
      setChannelViewMode(null); setFolderViewMode(null); return
    }
    getChannelViewModes(channelId).then(({ channelMode, folderMode }) => {
      setChannelViewMode(channelMode)
      setFolderViewMode(folderMode)
    })
  }, [channelId])

  useEffect(() => {
    if (autoScroll) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, autoScroll, botMessage])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [searchResults])

  function fmtElapsed(ms: number): string {
    const totalSec = Math.floor(ms / 1000)
    const m = Math.floor(totalSec / 60)
    const s = totalSec % 60
    return `${m}:${String(s).padStart(2, '0')}`
  }

  const endWriteSession = useCallback(async (session: WriteSession, avatarId: number | null, avatarName: string | null, avatarColor: string | null) => {
    if (writeTickRef.current) { clearInterval(writeTickRef.current); writeTickRef.current = null }
    writeSessionRef.current = null
    setWriteSession(null)
    setWriteTick(0)
    const elapsedMin = Math.max(1, Math.round((Date.now() - session.startTime) / 60000))
    const summary = t('chat.writeSummary', { words: String(session.wordCount), minutes: String(elapsedMin) })
    if (session.channelId === SCRATCH_ID || session.channelId === ALL_MESSAGES_ID) {
      addScratchMessage({ avatarId, avatarName, avatarColor, text: summary, createdAt: Date.now() })
    } else {
      await sendMessage(session.channelId, avatarId, summary, session.intentMsgId)
      reload()
    }
    setAutoScroll(true)
  }, [reload, addScratchMessage])

  function drawTarot(args: string): string | null {
    const count = args.trim() ? parseInt(args.trim()) : 1
    if (isNaN(count) || count < 1 || count > 10) return null
    const deck = [...TAROT_DECK]
    const drawn: string[] = []
    for (let i = 0; i < count; i++) {
      const idx = Math.floor(Math.random() * deck.length)
      drawn.push(deck.splice(idx, 1)[0])
    }
    return `🔮 Tarot: ${drawn.join(' · ')}`
  }

  function rollDice(args: string): string | null {
    const xMatch = args.match(/^(\d+)\s+x\s+(\d+)$/i)
    let dice: number[]
    if (xMatch) {
      const sides = parseInt(xMatch[1]), count = parseInt(xMatch[2])
      if (sides < 2 || count < 1 || count > 20) return null
      dice = Array(count).fill(sides)
    } else {
      dice = args.split(/\s+/).map(Number).filter(n => !isNaN(n) && n >= 2)
      if (dice.length === 0 || dice.length > 20) return null
    }
    const rolls = dice.map(s => ({ s, r: Math.floor(Math.random() * s) + 1 }))
    const parts = rolls.map(({ s, r }) => `d${s}: ${r}`)
    const total = rolls.length > 1 ? `  (total: ${rolls.reduce((a, b) => a + b.r, 0)})` : ''
    return `🎲 ${parts.join(', ')}${total}`
  }

  function pickLottery(args: string): string | null {
    const m = args.match(/^(\d+)\s+x\s+(\d+)$/i)
    if (!m) return null
    const max = parseInt(m[1]), count = parseInt(m[2])
    if (max < 1 || count < 1 || count > max || count > 100) return null
    const pool = Array.from({ length: max }, (_, i) => i + 1)
    const picks: number[] = []
    for (let i = 0; i < count; i++) {
      const idx = Math.floor(Math.random() * pool.length)
      picks.push(pool.splice(idx, 1)[0])
    }
    return `🎰 Lottery 1-${max} ×${count}: ${picks.sort((a, b) => a - b).join(', ')}`
  }

  function matchName<T extends { name: string }>(items: T[], raw: string): T | undefined {
    const q = raw.replace(/^[@#]/, '').toLowerCase()
    return items.find(i => i.name.toLowerCase() === q)
      ?? items.find(i => i.name.toLowerCase().startsWith(q))
  }

  async function openPageEditor() {
    if (selectedAvatarId === null) {
      const channels = await getChannels()
      const ch = channels.find(c => c.id === channelId)
      if (ch?.last_avatar_id != null) setSelectedAvatar(ch.last_avatar_id)
    }
    setPageEditorOpen(true)
  }

  async function executeSlashCommand(cmd: string, args: string): Promise<void> {
    switch (cmd) {
      case 'who': {
        const av = matchName(avatars, args)
        if (!av) { setCmdError(`Avatar not found: ${args}`); return }
        setSelectedAvatar(av.id)
        setText('')
        break
      }
      case 'channel': {
        const argClean = args.replace(/^#/, '').trim()
        if (argClean.toLowerCase() === 'scratch') {
          setSelectedChannel(SCRATCH_ID)
          setText('')
          break
        }
        const channels = await getChannels()
        const ch = matchName(channels, args)
        if (!ch) { setCmdError(`Channel not found: ${args}`); return }
        setSelectedChannel(ch.id)
        setText('')
        break
      }
      case 'avatar': {
        const av = matchName(avatars, args)
        if (!av) { setCmdError(`Avatar not found: ${args}`); return }
        setPendingOpenAvatarId(av.id)
        setText('')
        break
      }
      case 'note': {
        const av = matchName(avatars, args)
        if (!av) { setCmdError(`Avatar not found: ${args}`); return }
        setPendingNewNoteAvatarId(av.id)
        setText('')
        break
      }
      case 'tracker': {
        const trackers = await getTrackers(false)
        const tr = matchName(trackers, args)
        if (!tr) { setCmdError(`Tracker not found: ${args}`); return }
        pendingOpenRef.current = 'record'
        setSelectedChannel(tr.channel_id)
        setText('')
        break
      }
      case 'report': {
        const trackers = await getTrackers(false)
        const tr = matchName(trackers, args)
        if (!tr) { setCmdError(`Tracker not found: ${args}`); return }
        pendingOpenRef.current = 'report'
        setSelectedChannel(tr.channel_id)
        setText('')
        break
      }
      case 'roll': {
        const result = rollDice(args)
        if (!result) { setCmdError('Usage: /roll 6 20  or  /roll 6 x 3'); return }
        setText(result)
        break
      }
      case 'lottery': {
        const result = pickLottery(args)
        if (!result) { setCmdError('Usage: /lottery 72 x 5'); return }
        setText(result)
        break
      }
      case 'tarot': {
        const result = drawTarot(args)
        if (!result) { setCmdError('Usage: /tarot [count 1–10]'); return }
        setText(result)
        break
      }
      case 'front': {
        const flConfig = await getFrontLogConfig()
        if (!flConfig) { setCmdError('Front Log not set up'); return }
        const a = args.trim()
        // /front or /front ? — show current front in textarea
        if (a === '' || a === '?') {
          const sessions = await getCurrentFront()
          if (sessions.length === 0) {
            setText('No one is currently fronting.')
          } else {
            setText('Currently fronting: ' + sessions.map(s => s.avatar_name ?? '(anonymous)').join(', '))
          }
          return
        }
        // /front clear
        if (a.toLowerCase() === 'clear') {
          await clearFront()
          await refreshFront()
          if (channelId === flConfig.channel_id) reload()
          setText(''); return
        }
        // /front add @name
        if (a.toLowerCase().startsWith('add ')) {
          const av = matchName(avatars, a.slice(4).trim())
          if (!av) { setCmdError(`Avatar not found: ${a.slice(4).trim()}`); return }
          await enterFront(av.id, false)
          await refreshFront()
          setSelectedAvatar(av.id)
          if (channelId === flConfig.channel_id) reload()
          setText(''); return
        }
        // /front remove @name
        if (a.toLowerCase().startsWith('remove ')) {
          const av = matchName(avatars, a.slice(7).trim())
          if (!av) { setCmdError(`Avatar not found: ${a.slice(7).trim()}`); return }
          await exitFront(av.id)
          await refreshFront()
          if (channelId === flConfig.channel_id) reload()
          setText(''); return
        }
        // /front @name — set (replace all)
        const av = matchName(avatars, a)
        if (!av) { setCmdError(`Avatar not found: ${a}`); return }
        await enterFront(av.id, true)
        await refreshFront()
        setSelectedAvatar(av.id)
        if (channelId === flConfig.channel_id) reload()
        setText('')
        break
      }
      case 'date': {
        const raw = args.toLowerCase().trim()
        let date: string
        if (raw === 'today') {
          date = new Date().toISOString().slice(0, 10)
        } else if (raw === 'yesterday') {
          date = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
        } else if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
          date = raw
        } else {
          setCmdError('Usage: /date YYYY-MM-DD  or  today  or  yesterday'); return
        }
        setShowSearch(true)
        setSearch('')
        setSearchDate(date)
        setText('')
        break
      }
      case 'last': {
        setShowSearch(false)
        setSearch('')
        setSearchDate(null)
        setAutoScroll(true)
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
        setText('')
        break
      }
      case 'search': {
        setShowSearch(true)
        setSearch(args)
        setText('')
        break
      }
      case 'settings': {
        const page = args ? SETTINGS_PAGES[args.toLowerCase()] ?? null : null
        if (page) setPendingSettingsPage(page)
        setShowSettings(true)
        setText('')
        break
      }
      case 'seed': {
        const n = args.trim() ? parseInt(args.trim(), 10) : 200
        if (isNaN(n) || n < 1 || n > 50000) { setCmdError('Usage: /seed [1–50000]'); return }
        setText('')
        setCmdError(`Seeding ${n} messages…`)
        const { seedDatabase } = await import('../../db/seed')
        const result = await seedDatabase(n)
        setCmdError(`Seeded: ${result.avatars} avatars, ${result.channels} channels, ${result.messages} messages`)
        reload()
        break
      }
      case 'album':
        setSelectedChannel(ALBUM_ID)
        setText('')
        break
      case 'debug':
        setShowDebug(true)
        setText('')
        break
      case 'write': {
        const arg = args.trim().toLowerCase()
        if (arg === 'stop') {
          const session = writeSessionRef.current
          if (!session) { setCmdError(t('chat.writeNoSession')); return }
          await endWriteSession(session, selectedAvatarId, selectedAvatar?.name ?? null, selectedAvatar?.color ?? null)
          setText('')
          break
        }
        const mMin = arg.match(/^(\d+)\s*min(utes?)?$/)
        const mWords = arg.match(/^(\d+)\s*words?$/)
        if (!mMin && !mWords) { setCmdError(t('chat.writeUsage')); return }
        const goalType = mMin ? 'time' : 'words'
        const goalValue = parseInt(mMin ? mMin[1] : mWords![1])
        if (goalValue < 1 || goalValue > 999) { setCmdError(t('chat.writeUsage')); return }
        // End any existing session
        if (writeSessionRef.current) await endWriteSession(writeSessionRef.current, selectedAvatarId, selectedAvatar?.name ?? null, selectedAvatar?.color ?? null)
        // Send intent message
        const intentMsg = goalType === 'time'
          ? t('chat.writeGoalMinutes', { n: String(goalValue) })
          : t('chat.writeGoalWords', { n: String(goalValue) })
        let intentMsgId: number | null = null
        if (channelId === SCRATCH_ID || channelId === ALL_MESSAGES_ID) {
          addScratchMessage({ avatarId: selectedAvatarId, avatarName: selectedAvatar?.name ?? null, avatarColor: selectedAvatar?.color ?? null, text: intentMsg, createdAt: Date.now() })
        } else if (channelId) {
          intentMsgId = await sendMessage(channelId, null, intentMsg, null)
          reload()
        }
        setAutoScroll(true)
        // Start session
        const session: WriteSession = { goalType, goalValue, startTime: Date.now(), wordCount: 0, channelId: channelId!, intentMsgId }
        writeSessionRef.current = session
        setWriteSession(session)
        setWriteTick(0)
        if (writeTickRef.current) clearInterval(writeTickRef.current)
        writeTickRef.current = setInterval(() => setWriteTick(t => t + 1), 1000)
        setText('')
        break
      }
      case 'bot': {
        const arg = args.trim().toLowerCase()
        if (arg === 'off') {
          setBotConfig(null)
          if (botTimerRef.current) { clearTimeout(botTimerRef.current); botTimerRef.current = null }
          setCmdError(t('chat.botOff'))
          setText('')
          break
        }
        if (arg === 'hide') { setBotHidden(true); setCmdError(t('chat.botHidden')); setText(''); break }
        if (arg === 'show') { setBotHidden(false); setCmdError(t('chat.botShown')); setText(''); break }
        const config = getBotConfig(arg)
        if (!config) {
          const names = listBotNames().join(', ')
          setCmdError(t('chat.botNotFound', { name: arg }) + (names ? ` (available: ${names})` : ''))
          return
        }
        setBotConfig(config)
        setBotMessage(null)
        setBotRecentTags([])
        setToneHistory([])
        botLastMsgAtRef.current = 0
        setBotHidden(false)
        setCmdError(t('chat.botOn', { name: config.name }))
        setText('')
        break
      }
      case 'page': {
        await openPageEditor()
        setText('')
        break
      }
      default:
        setCmdError(`Unknown command: /${cmd}`)
    }
  }

  async function handleSend() {
    if (!text.trim() || !channelId) return
    chatTag.dismiss(); chatMention.dismiss()
    const p = slash.parsedCmd
    if (p) { executeSlashCommand(p.name, p.args); return }

    if (isAllMessages || isScratch) {
      const msgText = text.trim()
      addScratchMessage({
        avatarId: selectedAvatarId,
        avatarName: selectedAvatar?.name ?? null,
        avatarColor: selectedAvatar?.color ?? null,
        text: msgText,
        createdAt: Date.now(),
      })
      setText('')
      setAutoScroll(true)
      if (writeSessionRef.current) {
        const words = msgText.trim().split(/\s+/).filter(Boolean).length
        const updated = { ...writeSessionRef.current, wordCount: writeSessionRef.current.wordCount + words }
        writeSessionRef.current = updated
        setWriteSession({ ...updated })
        const reached = updated.goalType === 'words'
          ? updated.wordCount >= updated.goalValue
          : Date.now() - updated.startTime >= updated.goalValue * 60_000
        if (reached) { await endWriteSession(updated, selectedAvatarId, selectedAvatar?.name ?? null, selectedAvatar?.color ?? null); return }
      }
      if (botConfig) {
        setBotMessage(null)
        if (botTimerRef.current) clearTimeout(botTimerRef.current)
        const capturedConfig = botConfig
        const capturedTags = decayBotTags(botRecentTags, botLastMsgAtRef, setBotRecentTags)
        const capturedTone = distillTone(capturedTags, capturedConfig.tagTones, toneHistory)
        setToneHistory(prev => [{ seriousness: capturedTone.seriousness, depth: capturedTone.depth }, ...prev].slice(0, TONE_HISTORY_SIZE))
        const capturedSession = writeSessionRef.current
        botTimerRef.current = setTimeout(() => {
          botTimerRef.current = null
          let result = matchBot(msgText, capturedTags, capturedConfig.rules, capturedTone)
          if (result && result.ruleName === 'catchall' && capturedSession) {
            const elapsed = fmtElapsed(Date.now() - capturedSession.startTime)
            const nudge = capturedSession.goalType === 'words'
              ? t('chat.writeNudgeWords', { elapsed, words: String(capturedSession.wordCount), goal: String(capturedSession.goalValue) })
              : t('chat.writeNudgeTime', { elapsed, words: String(capturedSession.wordCount), remaining: String(Math.max(0, capturedSession.goalValue - Math.floor((Date.now() - capturedSession.startTime) / 60000))) + ' min' })
            result = { ...result, response: nudge, ruleName: 'write-nudge' }
          }
          if (result) {
            setBotMessage({ id: Date.now(), text: result.response, ruleName: result.ruleName, addedTags: result.tags, contextTags: capturedTags, tone: capturedTone, createdAt: Date.now() })
            if (result.tags.length > 0) {
              setBotRecentTags(prev => [...result.tags, ...prev].slice(0, 20))
            }
            setAutoScroll(true)
          } else if (capturedSession) {
            const elapsed = fmtElapsed(Date.now() - capturedSession.startTime)
            const nudge = capturedSession.goalType === 'words'
              ? t('chat.writeNudgeWords', { elapsed, words: String(capturedSession.wordCount), goal: String(capturedSession.goalValue) })
              : t('chat.writeNudgeTime', { elapsed, words: String(capturedSession.wordCount), remaining: String(Math.max(0, capturedSession.goalValue - Math.floor((Date.now() - capturedSession.startTime) / 60000))) + ' min' })
            setBotMessage({ id: Date.now(), text: nudge, ruleName: 'write-nudge', addedTags: [], contextTags: [], createdAt: Date.now() })
            setAutoScroll(true)
          }
        }, capturedConfig.delaySeconds * 1000)
      } else if (writeSessionRef.current) {
        setBotMessage(null)
        if (botTimerRef.current) clearTimeout(botTimerRef.current)
        const capturedSession = writeSessionRef.current
        botTimerRef.current = setTimeout(() => {
          botTimerRef.current = null
          const elapsed = fmtElapsed(Date.now() - capturedSession.startTime)
          const nudge = capturedSession.goalType === 'words'
            ? t('chat.writeNudgeWords', { elapsed, words: String(capturedSession.wordCount), goal: String(capturedSession.goalValue) })
            : t('chat.writeNudgeTime', { elapsed, words: String(capturedSession.wordCount), remaining: String(Math.max(0, capturedSession.goalValue - Math.floor((Date.now() - capturedSession.startTime) / 60000))) + ' min' })
          setBotMessage({ id: Date.now(), text: nudge, ruleName: 'write-nudge', addedTags: [], contextTags: [], createdAt: Date.now() })
          setAutoScroll(true)
        }, 8000)
      }
      return
    }

    const isReply = replyTo !== null
    const msgText = text.trim()
    const parentId = replyTo?.id ?? writeSessionRef.current?.intentMsgId ?? null
    await sendMessage(channelId, selectedAvatarId, msgText, parentId)
    if (selectedAvatarId !== null) await updateLastAvatar(channelId, selectedAvatarId)
    setText('')
    setReplyTo(null)
    if (!isReply) setAutoScroll(true)
    useAppStore.getState().requestNudgeCheck()
    let goalReached = false
    if (writeSessionRef.current) {
      const words = msgText.trim().split(/\s+/).filter(Boolean).length
      const updated = { ...writeSessionRef.current, wordCount: writeSessionRef.current.wordCount + words }
      writeSessionRef.current = updated
      setWriteSession({ ...updated })
      goalReached = updated.goalType === 'words'
        ? updated.wordCount >= updated.goalValue
        : Date.now() - updated.startTime >= updated.goalValue * 60_000
      if (goalReached) { await endWriteSession(updated, selectedAvatarId, selectedAvatar?.name ?? null, selectedAvatar?.color ?? null); return }
    }
    reload()
    if (botConfig) {
      setBotMessage(null)
      if (botTimerRef.current) clearTimeout(botTimerRef.current)
      const capturedConfig = botConfig
      const capturedTags = decayBotTags(botRecentTags, botLastMsgAtRef, setBotRecentTags)
      const capturedTone = distillTone(capturedTags, capturedConfig.tagTones, toneHistory)
      setToneHistory(prev => [{ seriousness: capturedTone.seriousness, depth: capturedTone.depth }, ...prev].slice(0, TONE_HISTORY_SIZE))
      const capturedSession = writeSessionRef.current
      botTimerRef.current = setTimeout(() => {
        botTimerRef.current = null
        let result = matchBot(msgText, capturedTags, capturedConfig.rules, capturedTone)
        if (result && result.ruleName === 'catchall' && capturedSession) {
          const elapsed = fmtElapsed(Date.now() - capturedSession.startTime)
          const nudge = capturedSession.goalType === 'words'
            ? t('chat.writeNudgeWords', { elapsed, words: String(capturedSession.wordCount), goal: String(capturedSession.goalValue) })
            : t('chat.writeNudgeTime', { elapsed, words: String(capturedSession.wordCount), remaining: String(Math.max(0, capturedSession.goalValue - Math.floor((Date.now() - capturedSession.startTime) / 60000))) + ' min' })
          result = { ...result, response: nudge, ruleName: 'write-nudge' }
        }
        if (result) {
          setBotMessage({ id: Date.now(), text: result.response, ruleName: result.ruleName, addedTags: result.tags, contextTags: capturedTags, tone: capturedTone, createdAt: Date.now() })
          if (result.tags.length > 0) {
            setBotRecentTags(prev => [...result.tags, ...prev].slice(0, 20))
          }
          setAutoScroll(true)
        } else if (capturedSession) {
          const elapsed = fmtElapsed(Date.now() - capturedSession.startTime)
          const nudge = capturedSession.goalType === 'words'
            ? t('chat.writeNudgeWords', { elapsed, words: String(capturedSession.wordCount), goal: String(capturedSession.goalValue) })
            : t('chat.writeNudgeTime', { elapsed, words: String(capturedSession.wordCount), remaining: String(Math.max(0, capturedSession.goalValue - Math.floor((Date.now() - capturedSession.startTime) / 60000))) + ' min' })
          setBotMessage({ id: Date.now(), text: nudge, ruleName: 'write-nudge', addedTags: [], contextTags: [], createdAt: Date.now() })
          setAutoScroll(true)
        }
      }, capturedConfig.delaySeconds * 1000)
    } else if (writeSessionRef.current) {
      setBotMessage(null)
      if (botTimerRef.current) clearTimeout(botTimerRef.current)
      const capturedSession = writeSessionRef.current
      botTimerRef.current = setTimeout(() => {
        botTimerRef.current = null
        const elapsed = fmtElapsed(Date.now() - capturedSession.startTime)
        const nudge = capturedSession.goalType === 'words'
          ? t('chat.writeNudgeWords', { elapsed, words: String(capturedSession.wordCount), goal: String(capturedSession.goalValue) })
          : t('chat.writeNudgeTime', { elapsed, words: String(capturedSession.wordCount), remaining: String(Math.max(0, capturedSession.goalValue - Math.floor((Date.now() - capturedSession.startTime) / 60000))) + ' min' })
        setBotMessage({ id: Date.now(), text: nudge, ruleName: 'write-nudge', addedTags: [], contextTags: [], createdAt: Date.now() })
        setAutoScroll(true)
      }, 8000)
    }
  }

  async function handleEdit() {
    if (!editing || !editing.text.trim()) return
    await editMessage(editing.id, editing.text.trim())
    setEditing(null)
    reload()
  }

  async function handleDelete(id: number) {
    await deleteMessage(id)
    reload()
  }

  async function handleUndelete(id: number) {
    await undeleteMessage(id)
    reload()
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Slash command autocomplete (command name still being typed — no space yet)
    if (slash.isOpen) {
      if (e.key === 'ArrowUp')   { e.preventDefault(); slash.moveUp();   return }
      if (e.key === 'ArrowDown') { e.preventDefault(); slash.moveDown(); return }
      if (e.key === 'Tab') {
        const completion = slash.accept()
        if (completion) { e.preventDefault(); setText(completion); return }
      }
      if (e.key === 'Escape') { e.preventDefault(); setText(''); return }
    }
    // Emoji autocomplete (:name)
    if (chatEmoji.isOpen) {
      if (e.key === 'ArrowUp')   { e.preventDefault(); chatEmoji.moveUp();   return }
      if (e.key === 'ArrowDown') { e.preventDefault(); chatEmoji.moveDown(); return }
      if (e.key === 'Tab' || e.key === ' ') {
        e.preventDefault(); chatEmoji.accept(text, setText); return
      }
      if (e.key === 'Escape') { chatEmoji.dismiss(); return }
    }
    // Tag / mention autocomplete
    const active = chatTag.isOpen ? chatTag : chatMention.isOpen ? chatMention : null
    if (active) {
      if (e.key === 'ArrowUp')   { e.preventDefault(); active.moveUp();   return }
      if (e.key === 'ArrowDown') { e.preventDefault(); active.moveDown(); return }
      if (e.key === ' ' || e.key === 'Tab') {
        e.preventDefault(); active.accept(text, setText, true); return
      }
      if (e.key === 'Escape') { active.dismiss(); return }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      const p = slash.parsedCmd
      if (p) {
        executeSlashCommand(p.name, p.args)
      } else {
        handleSend()
      }
    }
  }

  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    const active = searchTag.isOpen ? searchTag : searchMention.isOpen ? searchMention : null
    if (!active) return
    if (e.key === 'ArrowUp')   { e.preventDefault(); active.moveUp() }
    else if (e.key === 'ArrowDown') { e.preventDefault(); active.moveDown() }
    else if (e.key === ' ' || e.key === 'Tab') { e.preventDefault(); active.accept(search, setSearch, false) }
    else if (e.key === 'Escape') active.dismiss()
  }

  useEffect(() => {
    const allMsgs = [...messages, ...(searchResults ?? [])]
    const ids = [...new Set(
      allMsgs.filter(m => m.tracker_record_id !== null).map(m => m.tracker_record_id!)
    )]
    if (ids.length === 0) { setTrackerRecords(new Map()); return }
    getRecordsByIds(ids).then(records => {
      setTrackerRecords(new Map(records.map(r => [r.id, r])))
    })
  }, [messages, searchResults])

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = el.scrollHeight + 'px'
  }, [text])

  const depthColors = useMemo(
    () => config.threads.depthColors.split(',').map(c => c.trim()).filter(Boolean),
    [config.threads.depthColors]
  )
  const depthStyle = useMemo(() => makeDepthStyle(depthColors), [depthColors])

  const viewMode = (channelViewMode ?? folderViewMode ?? config.ui.viewMode) as 'normal' | 'compact' | 'log'

  const displayMessages: RenderedMessage[] = config.ui.threadedView && viewMode !== 'log' && !searchResults
    ? buildThreadedList(messages)
    : (searchResults ?? messages).map(m => ({ ...m, _depth: 0 }))

  const msgById = useMemo(() => {
    const map = new Map<number, MessageRow>()
    for (const m of messages) map.set(m.id, m)
    return map
  }, [messages])

  const logRows = useMemo(
    () => viewMode === 'log' ? buildLogRows(displayMessages, config.ui.use24HourClock) : null,
    [displayMessages, viewMode, config.ui.use24HourClock]
  )

  const isAllMessages = channelId === ALL_MESSAGES_ID
  const isScratch     = channelId === SCRATCH_ID
  const isAlbum       = channelId === ALBUM_ID
  const canType = channelId !== null && !isAlbum
  const canSend = canType
  const maxDepth = config.threads.maxDepth

  if (channelId === null) {
    return (
      <main className="chat-panel empty">
        <p>{t('chat.selectChannel')}</p>
      </main>
    )
  }

  if (isAlbum) {
    return (
      <main className="chat-panel">
        <div className="avatar-indicator" style={{ borderBottom: '1px solid var(--border)', padding: '6px 12px' }}>
          <span className="avatar-name-label">🖼 Album</span>
          {avatarPanelMode === 'hidden' && (
            <button className="avatars-btn" onClick={() => setAvatarPanelMode('small')}>{t('chat.avatars')}</button>
          )}
        </div>
        <AlbumView />
      </main>
    )
  }

  return (
    <main className="chat-panel">
      {showReport && tracker && (
        <TrackerReport
          tracker={tracker}
          fields={trackerFields}
          avatars={avatars}
          use24HourClock={config.ui.use24HourClock}
          onClose={() => setShowReport(false)}
        />
      )}
      {showReport && isFrontLogChannel && frontLogConfig && (
        <FrontLogReport
          config={frontLogConfig}
          onClose={() => setShowReport(false)}
        />
      )}
      {showSearch && <div className="chat-toolbar">
        <div className="search-tag-wrapper">
          <input
            ref={searchInputRef}
            className="search-input"
            placeholder={t('chat.searchPlaceholder')}
            value={search}
            onChange={e => { setSearch(e.target.value); searchTag.onTextChange(e.target.value, e.target.selectionStart ?? 0); searchMention.onTextChange(e.target.value, e.target.selectionStart ?? 0) }}
            onKeyDown={handleSearchKeyDown}
          />
          {searchTag.isOpen && <TagAutocomplete suggestions={searchTag.suggestions} selectedIndex={searchTag.selectedIndex} placement="below" onSelect={s => searchTag.acceptSuggestion(search, setSearch, s, false)} />}
          {searchMention.isOpen && <TagAutocomplete suggestions={searchMention.suggestions} selectedIndex={searchMention.selectedIndex} placement="below" onSelect={s => searchMention.acceptSuggestion(search, setSearch, s, false)} />}
        </div>
        <input
          ref={dateInputRef}
          type="date"
          className="date-picker-hidden"
          value={searchDate ?? ''}
          onChange={e => setSearchDate(e.target.value || null)}
        />
        {searchDate ? (
          <span className="date-display">
            {searchDate}
            <button className="date-clear" onClick={() => setSearchDate(null)} title={t('chat.clearDate')}>×</button>
          </span>
        ) : (
          <button className="date-btn" onClick={() => dateInputRef.current?.showPicker()} title={t('chat.pickDate')}>📅</button>
        )}
        <button className="date-adj" onClick={() => adjustDate(-1)} title={t('chat.prevDay')}>−</button>
        <button className="date-adj" onClick={() => adjustDate(1)} title={t('chat.nextDay')}>+</button>
        <button
          className="jump-btn"
          onClick={() => { setAutoScroll(true); bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }}
          title={t('chat.jumpToLatest')}
        >↓</button>
      </div>}

      {isScratch && (
        <div className="scratch-toolbar">
          {scratchExport === 'note' ? (
            <span className="scratch-export-form">
              <span className="scratch-export-label">{t('chat.scratchForAvatar')}</span>
              <select value={scratchExportAvatarId ?? ''} onChange={e => setScratchExportAvatarId(Number(e.target.value) || null)}>
                <option value="">—</option>
                {avatars.filter(a => !isHidden(a.hidden)).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              <button className="scratch-export-btn" onClick={handleExportNote} disabled={!scratchExportAvatarId || scratchMessages.length === 0}>{t('chat.scratchExport')}</button>
              <button className="scratch-cancel-btn" onClick={() => setScratchExport(null)}>{t('chat.cancel')}</button>
            </span>
          ) : scratchExport === 'channel' ? (
            <span className="scratch-export-form">
              <span className="scratch-export-label">{t('chat.scratchToChannel')}</span>
              <select value={scratchExportChannelId ?? ''} onChange={e => setScratchExportChannelId(Number(e.target.value) || null)}>
                <option value="">—</option>
                {scratchExportChannels.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <button className="scratch-export-btn" onClick={handleExportChannel} disabled={!scratchExportChannelId || scratchMessages.length === 0}>{t('chat.scratchExport')}</button>
              <button className="scratch-cancel-btn" onClick={() => setScratchExport(null)}>{t('chat.cancel')}</button>
            </span>
          ) : (
            <>
              <button className="scratch-action-btn" onClick={() => setScratchExport('note')}>{t('chat.scratchExportNote')}</button>
              <button className="scratch-action-btn" onClick={openChannelExport}>{t('chat.scratchExportChannel')}</button>
              <button className="scratch-action-btn scratch-clear-btn" onClick={clearScratch} disabled={scratchMessages.length === 0}>{t('chat.scratchClear')}</button>
            </>
          )}
        </div>
      )}

      {pageEditorOpen && !isScratch && !isAllMessages && (
        <PageEditor
          channelId={channelId}
          avatars={avatars}
          selectedAvatar={selectedAvatar ?? null}
          onPublish={async (html) => {
            await sendMessage(channelId, selectedAvatarId, html, null, 'page')
            setPageEditorOpen(false)
            reload()
          }}
          onBack={() => setPageEditorOpen(false)}
          onDiscard={() => setPageEditorOpen(false)}
        />
      )}

      <div
        className={`message-list${isScratch ? ' log-view' : ''}${!isScratch && viewMode === 'compact' ? ' compact' : ''}${!isScratch && viewMode === 'log' ? ' log-view' : ''}${pageEditorOpen ? ' hidden' : ''}`}
        ref={listRef}
        onClick={() => { if (!showSearch && !showRecordForm) textareaRef.current?.focus() }}
        onScroll={e => {
          const el = e.currentTarget
          const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80
          setAutoScroll(nearBottom)
        }}
      >
        {isScratch ? (
          <>
            {scratchMessages.length === 0
              ? <p className="scratch-empty">{t('chat.scratchEmpty')}</p>
              : scratchMessages.map(m => <ScratchMessageItem key={m.id} msg={m} use24HourClock={config.ui.use24HourClock} />)
            }
            {(botConfig || writeSession) && !botHidden && botMessage && (
              <BotMessageItem key={botMessage.id} msg={botMessage} displayName={botConfig?.displayName ?? '✍'} recentTags={botRecentTags} />
            )}
          </>
        ) : null}

        {!isScratch && canLoadMore && (
          <button className="load-more" onClick={loadMore} disabled={loading}>
            {t('chat.loadMore')}
          </button>
        )}

        {!isScratch && viewMode === 'log' && logRows
          ? logRows.map((row, i) =>
              row.kind === 'sep'
                ? <div key={`sep-${i}`} className="log-hour-sep"><span>{row.label}</span></div>
                : row.msg.message_type === 'page'
                ? <PageItem key={row.msg.id} msg={row.msg} use24HourClock={config.ui.use24HourClock} />
                : <LogMessageItem
                    key={row.msg.id}
                    msg={row.msg}
                    parentMsg={row.msg.parent_msg_id != null ? msgById.get(row.msg.parent_msg_id) : undefined}
                    isAllMessages={isAllMessages}
                    editing={editing?.id === row.msg.id ? editing.text : null}
                    onEditStart={() => setEditing({ id: row.msg.id, text: row.msg.text })}
                    onEditChange={v => setEditing(e => e ? { ...e, text: v } : null)}
                    onEditSave={handleEdit}
                    onEditCancel={() => setEditing(null)}
                    onReply={!isAllMessages ? (m) => { setReplyTo(m); textareaRef.current?.focus() } : undefined}
                    trackerRecord={row.msg.tracker_record_id != null ? trackerRecords.get(row.msg.tracker_record_id) : undefined}
                    avatars={avatars}
                    use24HourClock={config.ui.use24HourClock}
                    deleteWindowMinutes={deleteWindowMinutes}
                    editWindowMinutes={editWindowMinutes}
                    onDelete={() => handleDelete(row.msg.id)}
                    onUndelete={() => handleUndelete(row.msg.id)}
                  />
            )
          : !isScratch ? displayMessages.map(msg =>
              msg.message_type === 'page'
                ? <PageItem key={msg.id} msg={msg} use24HourClock={config.ui.use24HourClock} />
                : <MessageItem
                    key={msg.id}
                    msg={msg}
                    depth={msg._depth}
                    depthStyle={depthStyle}
                    isAllMessages={isAllMessages}
                    editing={editing?.id === msg.id ? editing.text : null}
                    onEditStart={() => setEditing({ id: msg.id, text: msg.text })}
                    onEditChange={v => setEditing(e => e ? { ...e, text: v } : null)}
                    onEditSave={handleEdit}
                    onEditCancel={() => setEditing(null)}
                    onReply={!isAllMessages && msg._depth < maxDepth ? () => { setReplyTo(msg); textareaRef.current?.focus() } : undefined}
                    trackerRecord={msg.tracker_record_id != null ? trackerRecords.get(msg.tracker_record_id) : undefined}
                    avatars={avatars}
                    use24HourClock={config.ui.use24HourClock}
                    deleteWindowMinutes={deleteWindowMinutes}
                    editWindowMinutes={editWindowMinutes}
                    onDelete={() => handleDelete(msg.id)}
                    onUndelete={() => handleUndelete(msg.id)}
                  />
            ) : null
        }
        {!isScratch && (botConfig || writeSession) && !botHidden && botMessage && (
          <BotMessageItem key={botMessage.id} msg={botMessage} displayName={botConfig?.displayName ?? '✍'} recentTags={botRecentTags} />
        )}
        <div ref={bottomRef} />
      </div>

      {isAllMessages && (
        <div className="chat-input-area">
          <div className="avatar-indicator">
            <span className="avatar-name-label muted">All Messages</span>
            {avatarFilter != null && (
              <span className="avatar-name-label" style={{ color: avatars.find(a => a.id === avatarFilter)?.color }}>
                · {avatars.find(a => a.id === avatarFilter)?.name}
              </span>
            )}
            {avatarPanelMode === 'hidden' && (
              <button className="avatars-btn" onClick={() => setAvatarPanelMode('small')}>{t('chat.avatars')}</button>
            )}
            <button className="avatars-btn" onClick={showSearch ? closeSearch : () => setShowSearch(true)}>
              {showSearch ? t('chat.closeSearch') : t('chat.search')}
            </button>
            <span className="avatar-name-label scratch-route-hint">{t('chat.scratchHint')}</span>
          </div>
          {cmdError && <div className="cmd-error">{cmdError}</div>}
          <div className="input-row">
            {slash.isOpen && <SlashAutocomplete suggestions={slash.suggestions} selectedIndex={slash.selectedIndex} onSelect={cmd => setText('/' + cmd.name + ' ')} />}
            {!slash.isOpen && chatEmoji.isOpen && <EmojiAutocomplete suggestions={chatEmoji.suggestions} selectedIndex={chatEmoji.selectedIndex} onSelect={s => chatEmoji.acceptSuggestion(text, setText, s)} />}
            {!slash.isOpen && !chatEmoji.isOpen && chatTag.isOpen && <TagAutocomplete suggestions={chatTag.suggestions} selectedIndex={chatTag.selectedIndex} placement="above" onSelect={s => chatTag.acceptSuggestion(text, setText, s, true)} />}
            {!slash.isOpen && !chatEmoji.isOpen && chatMention.isOpen && <TagAutocomplete suggestions={chatMention.suggestions} selectedIndex={chatMention.selectedIndex} placement="above" onSelect={s => chatMention.acceptSuggestion(text, setText, s, true)} />}
            <textarea
              ref={textareaRef}
              value={text}
              onChange={e => {
                const v = e.target.value
                const pos = e.target.selectionStart ?? 0
                setText(v)
                if (cmdError) setCmdError(null)
                if (botTimerRef.current) { clearTimeout(botTimerRef.current); botTimerRef.current = null }
                chatTag.onTextChange(v, pos)
                chatMention.onTextChange(v, pos)
                chatEmoji.onTextChange(v, pos)
              }}
              onKeyDown={handleKeyDown}
              placeholder={t('chat.scratchPlaceholder')}
              maxLength={1000}
              rows={1}
            />
            <button className="send-btn" onClick={handleSend} disabled={!text.trim()}>
              {t('chat.send')}
            </button>
          </div>
        </div>
      )}
      {!isAllMessages && !isScratch && !pageEditorOpen && (
        <div className="chat-input-area">
          <div className="avatar-indicator">
            {selectedAvatar ? (
              <>
                <div className="avatar-dot" style={{ background: selectedAvatar.color }} />
                <span className="avatar-name-label">{selectedAvatar.name}</span>
              </>
            ) : (
              <span className="avatar-name-label muted">{t('chat.selectAvatarHint')}</span>
            )}
            {writeSession && (() => {
              const elapsed = fmtElapsed(Date.now() - writeSession.startTime)
              void writeTick
              const status = writeSession.goalType === 'words'
                ? t('chat.writeStatusGoalWords', { elapsed, words: String(writeSession.wordCount), goal: String(writeSession.goalValue) })
                : t('chat.writeStatusGoalTime', { elapsed, words: String(writeSession.wordCount), goal: String(writeSession.goalValue) })
              return <span className="write-session-status">{status}</span>
            })()}
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
              {avatarPanelMode === 'hidden' && (
                <button className="avatars-btn" onClick={() => setAvatarPanelMode('small')}>{t('chat.avatars')}</button>
              )}
              <button className="avatars-btn" onClick={showSearch ? closeSearch : () => setShowSearch(true)}>
                {showSearch ? t('chat.closeSearch') : t('chat.search')}
              </button>
              <button
                className={`avatars-btn${localStorage.getItem(`dsj-page-draft-${channelId}`) ? ' page-draft-btn' : ''}`}
                onClick={() => pageEditorOpen ? setPageEditorOpen(false) : openPageEditor()}
              >
                {localStorage.getItem(`dsj-page-draft-${channelId}`) ? '✎ Page' : '+ Page'}
              </button>
              {tracker && !showRecordForm && !showReport && (
                <button className="avatars-btn" onClick={() => setShowRecordForm(true)}>
                  {t('recordForm.addRecord')}
                </button>
              )}
              {tracker && !showRecordForm && !showReport && (
                <button className="avatars-btn" onClick={() => setShowReport(true)}>
                  {t('trackerReport.addReport')}
                </button>
              )}
              {isFrontLogChannel && !showReport && (
                <button className="avatars-btn" onClick={() => setShowReport(true)}>
                  {t('trackerReport.addReport')}
                </button>
              )}
              {!showRecordForm && !showReport && (
                <button className="avatars-btn" onClick={() => setShowImageForm(v => !v)} title="Add image">
                  🖼
                </button>
              )}
            </div>
          </div>
          {showRecordForm && tracker && (
            <RecordEntryForm
              tracker={tracker}
              fields={trackerFields}
              channelId={channelId}
              defaultAvatarId={selectedAvatarId}
              onClose={() => setShowRecordForm(false)}
              onSubmitted={usedAvatarId => {
                setShowRecordForm(false)
                if (usedAvatarId != null && channelId != null) updateLastAvatar(channelId, usedAvatarId)
                setAutoScroll(true)
                reload()
              }}
            />
          )}
          {showImageForm && channelId && (
            <ImagePostForm
              channelId={channelId}
              defaultAvatarId={selectedAvatarId}
              initialImagePath={droppedImagePath}
              onClose={() => { setShowImageForm(false); setDroppedImagePath(null) }}
              onSubmitted={() => {
                setShowImageForm(false)
                setDroppedImagePath(null)
                setAutoScroll(true)
                reload()
              }}
            />
          )}
          {replyTo && (
            <div className="reply-indicator">
              <span className="reply-indicator-text">
                ↩ Replying to{' '}
                <span className="reply-indicator-name" style={{ color: replyTo.avatar_color ?? undefined }}>
                  {replyTo.avatar_name ?? '—'}
                </span>
                {': '}
                {getMessageDisplayText(replyTo).slice(0, 80)}
              </span>
              <button className="reply-cancel" onClick={() => setReplyTo(null)} title="Cancel reply">×</button>
            </div>
          )}
          {cmdError && (
            <div className="cmd-error">{cmdError}</div>
          )}
          <div className="input-row">
            {slash.isOpen && <SlashAutocomplete suggestions={slash.suggestions} selectedIndex={slash.selectedIndex} onSelect={cmd => setText('/' + cmd.name + ' ')} />}
            {!slash.isOpen && chatEmoji.isOpen && <EmojiAutocomplete suggestions={chatEmoji.suggestions} selectedIndex={chatEmoji.selectedIndex} onSelect={s => chatEmoji.acceptSuggestion(text, setText, s)} />}
            {!slash.isOpen && !chatEmoji.isOpen && chatTag.isOpen && <TagAutocomplete suggestions={chatTag.suggestions} selectedIndex={chatTag.selectedIndex} placement="above" onSelect={s => chatTag.acceptSuggestion(text, setText, s, true)} />}
            {!slash.isOpen && !chatEmoji.isOpen && chatMention.isOpen && <TagAutocomplete suggestions={chatMention.suggestions} selectedIndex={chatMention.selectedIndex} placement="above" onSelect={s => chatMention.acceptSuggestion(text, setText, s, true)} />}
            <textarea
              ref={textareaRef}
              value={text}
              onChange={e => {
                const v = e.target.value
                const pos = e.target.selectionStart ?? 0
                setText(v)
                if (cmdError) setCmdError(null)
                if (botTimerRef.current) { clearTimeout(botTimerRef.current); botTimerRef.current = null }
                chatTag.onTextChange(v, pos)
                chatMention.onTextChange(v, pos)
                chatEmoji.onTextChange(v, pos)
              }}
              onKeyDown={handleKeyDown}
              placeholder={t('chat.messagePlaceholder')}
              disabled={!canType}
              maxLength={1000}
              rows={1}
            />
            <button className="send-btn" onClick={handleSend} disabled={!canSend || !text.trim()}>
              {t('chat.send')}
            </button>
          </div>
        </div>
      )}
      {isScratch && (
        <div className="chat-input-area">
          <div className="avatar-indicator">
            {selectedAvatar ? (
              <>
                <div className="avatar-dot" style={{ background: selectedAvatar.color }} />
                <span className="avatar-name-label">{selectedAvatar.name}</span>
              </>
            ) : (
              <span className="avatar-name-label muted">{t('chat.selectAvatarHint')}</span>
            )}
            {avatarPanelMode === 'hidden' && (
              <button className="avatars-btn" onClick={() => setAvatarPanelMode('small')}>{t('chat.avatars')}</button>
            )}
            {writeSession && (() => {
              const elapsed = fmtElapsed(Date.now() - writeSession.startTime)
              void writeTick
              const status = writeSession.goalType === 'words'
                ? t('chat.writeStatusGoalWords', { elapsed, words: String(writeSession.wordCount), goal: String(writeSession.goalValue) })
                : t('chat.writeStatusGoalTime', { elapsed, words: String(writeSession.wordCount), goal: String(writeSession.goalValue) })
              return <span className="write-session-status">{status}</span>
            })()}
          </div>
          {cmdError && <div className="cmd-error">{cmdError}</div>}
          <div className="input-row">
            {slash.isOpen && <SlashAutocomplete suggestions={slash.suggestions} selectedIndex={slash.selectedIndex} onSelect={cmd => setText('/' + cmd.name + ' ')} />}
            {!slash.isOpen && chatEmoji.isOpen && <EmojiAutocomplete suggestions={chatEmoji.suggestions} selectedIndex={chatEmoji.selectedIndex} onSelect={s => chatEmoji.acceptSuggestion(text, setText, s)} />}
            {!slash.isOpen && !chatEmoji.isOpen && chatTag.isOpen && <TagAutocomplete suggestions={chatTag.suggestions} selectedIndex={chatTag.selectedIndex} placement="above" onSelect={s => chatTag.acceptSuggestion(text, setText, s, true)} />}
            {!slash.isOpen && !chatEmoji.isOpen && chatMention.isOpen && <TagAutocomplete suggestions={chatMention.suggestions} selectedIndex={chatMention.selectedIndex} placement="above" onSelect={s => chatMention.acceptSuggestion(text, setText, s, true)} />}
            <textarea
              ref={textareaRef}
              value={text}
              onChange={e => {
                const v = e.target.value
                const pos = e.target.selectionStart ?? 0
                setText(v)
                if (cmdError) setCmdError(null)
                if (botTimerRef.current) { clearTimeout(botTimerRef.current); botTimerRef.current = null }
                chatTag.onTextChange(v, pos)
                chatMention.onTextChange(v, pos)
                chatEmoji.onTextChange(v, pos)
              }}
              onKeyDown={handleKeyDown}
              placeholder={t('chat.scratchPlaceholder')}
              maxLength={1000}
              rows={1}
            />
            <button className="send-btn" onClick={handleSend} disabled={!text.trim()}>
              {t('chat.send')}
            </button>
          </div>
        </div>
      )}
    </main>
  )
}

// ── Bot message ───────────────────────────────────────────────────────────────

function BotMessageItem({ msg, displayName, recentTags }: { msg: BotMessage; displayName: string; recentTags: string[] }) {
  return (
    <div className="bot-message-item">
      <span className="bot-message-name">{displayName}:</span>
      {msg.text && <span className="bot-message-text">{msg.text}</span>}
      <span className="bot-message-debug">
        [{msg.ruleName}]
        {msg.addedTags.length > 0 && <> +{msg.addedTags.join(' +')}</>}
        {msg.tone && <> · s:{msg.tone.seriousness.toFixed(1)} d:{msg.tone.depth.toFixed(1)} v:{msg.tone.volatility.toFixed(2)}</>}
        {recentTags.length > 0 && <> · ctx: {recentTags.slice(0, 5).join(' ')}</>}
      </span>
    </div>
  )
}

// ── Scratch message ───────────────────────────────────────────────────────────

function ScratchMessageItem({ msg, use24HourClock }: { msg: ScratchMessage; use24HourClock: boolean }) {
  const time = new Date(msg.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: !use24HourClock })
  return (
    <div className="log-msg-row scratch-msg-row">
      <span className="log-msg-name" style={{ color: msg.avatarColor ?? 'var(--text-muted)' }}>
        {msg.avatarName ?? '—'}:{' '}
      </span>
      <span className="log-msg-text">{msg.text}</span>
      <span className="scratch-msg-time">{time}</span>
    </div>
  )
}

function inspectMessage(msg: MessageRow) {
  const parent = msg.parent_msg_id != null ? `parent=#${msg.parent_msg_id}` : 'parent=none'
  const preview = msg.text.replace(/\n/g, '↵').slice(0, 50)
  addLog(`msg#${msg.id} ${parent} ch=${msg.channel_name} avatar=${msg.avatar_name ?? '—'}: "${preview}"`, 'debug')
}


interface LogMsgProps {
  msg: RenderedMessage
  parentMsg?: MessageRow
  isAllMessages: boolean
  editing: string | null
  onEditStart: () => void
  onEditChange: (v: string) => void
  onEditSave: () => void
  onEditCancel: () => void
  onReply?: (msg: RenderedMessage) => void
  trackerRecord?: TrackerRecord
  avatars: Avatar[]
  use24HourClock: boolean
  deleteWindowMinutes: number
  editWindowMinutes: number
  onDelete: () => void
  onUndelete: () => void
}

function LogMessageItem({ msg, parentMsg, isAllMessages, editing, onEditStart, onEditChange, onEditSave, onEditCancel, onReply, trackerRecord, avatars, use24HourClock, deleteWindowMinutes, editWindowMinutes, onDelete, onUndelete }: LogMsgProps) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const isReply = msg.parent_msg_id != null
  const ageMs = Date.now() - new Date(msg.created_at + 'Z').getTime()
  const isFrontLog = isFrontSentinel(msg.text)
  const deletable = deleteWindowMinutes > 0 && !msg.tracker_record_id && !isFrontLog && !msg.deleted && ageMs < deleteWindowMinutes * 60_000
  const editable = editWindowMinutes > 0 && !msg.tracker_record_id && !isFrontLog && !msg.deleted && ageMs < editWindowMinutes * 60_000
  const restoreUntilMs = new Date(msg.created_at + 'Z').getTime() + deleteWindowMinutes * 60_000
  const restoreUntilStr = new Date(restoreUntilMs).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

  function handleDoubleClick() {
    if (msg.deleted) { onUndelete(); return }
    if (editable) onEditStart()
  }

  return (
    <div
      className={`log-msg-row${isReply ? ' log-msg-reply' : ''}`}
      onDoubleClick={handleDoubleClick}
      onClick={e => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); inspectMessage(msg) } }}
    >
      {isReply && parentMsg && (
        <span className="log-parent-line">
          <span className="log-parent-name" style={{ color: parentMsg.avatar_color ?? 'var(--text-muted)' }}>
            ↩ {parentMsg.avatar_name ?? '—'}:
          </span>
          {' '}<span className="log-parent-text">{getMessageDisplayText(parentMsg).slice(0, 60)}{getMessageDisplayText(parentMsg).length > 60 ? '…' : ''}</span>
        </span>
      )}
      <span className="log-msg-name" style={{ color: msg.avatar_color ?? 'var(--text-muted)' }}>
        {isAllMessages && <span className="log-channel-prefix">{msg.channel_name} · </span>}
        {msg.avatar_name ?? '—'}:{' '}
      </span>
      {msg.deleted ? (
        <span className="log-msg-deleted">{t('chat.deletedRestoreUntil', { time: restoreUntilStr })}</span>
      ) : editing !== null ? (
        <span className="log-edit-row">
          <textarea
            autoFocus
            value={editing}
            onChange={e => onEditChange(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onEditSave() }
              if (e.key === 'Escape') onEditCancel()
            }}
          />
          <button onClick={onEditSave}>{t('chat.save')}</button>
          <button onClick={onEditCancel}>{t('chat.cancel')}</button>
        </span>
      ) : msg.tracker_record_id !== null ? (
        <span className="log-msg-text log-tracker-record">
          {trackerRecord ? formatTrackerSummary(trackerRecord, avatars, use24HourClock) : '…'}
        </span>
      ) : msg.image_path !== null ? (
        <span className="log-msg-text log-tracker-record">[image] {msg.image_caption ?? ''}</span>
      ) : isFrontLog ? (
        <FrontLogMessage msg={msg} />
      ) : (
        <span className="log-msg-text">{msg.text}</span>
      )}
      {editable && editing === null && (
        <button className="log-edit-btn" onClick={e => { e.stopPropagation(); onEditStart() }} title="Edit">✎</button>
      )}
      {!msg.deleted && onReply && (
        <button className="log-reply-btn" onClick={e => { e.stopPropagation(); onReply(msg) }} title="Reply">↩</button>
      )}
      {!!msg.deleted && (
        <button className="log-restore-btn" onClick={e => { e.stopPropagation(); onUndelete() }} title="Restore">↺</button>
      )}
      {deletable && editing === null && (
        confirmDelete ? (
          <span className="log-delete-confirm" onClick={e => e.stopPropagation()}>
            <span className="log-delete-confirm-label">{t('chat.confirmDelete')}</span>
            <button className="log-delete-yes" onClick={() => { setConfirmDelete(false); onDelete() }}>{t('chat.confirmDeleteYes')}</button>
            <button className="log-delete-no" onClick={() => setConfirmDelete(false)}>{t('chat.confirmDeleteNo')}</button>
          </span>
        ) : (
          <button className="log-delete-btn" onClick={e => { e.stopPropagation(); setConfirmDelete(true) }} title={t('chat.delete')}>✕</button>
        )
      )}
    </div>
  )
}

// ── Normal view ───────────────────────────────────────────────────────────────

interface MsgProps {
  msg: MessageRow
  depth: number
  depthStyle: (depth: number) => React.CSSProperties | undefined
  isAllMessages: boolean
  editing: string | null
  onEditStart: () => void
  onEditChange: (v: string) => void
  onEditSave: () => void
  onEditCancel: () => void
  onReply?: () => void
  trackerRecord?: TrackerRecord
  avatars: Avatar[]
  use24HourClock: boolean
  deleteWindowMinutes: number
  editWindowMinutes: number
  onDelete: () => void
  onUndelete: () => void
}

function MessageItem({ msg, depth, depthStyle, isAllMessages, editing, onEditStart, onEditChange, onEditSave, onEditCancel, onReply, trackerRecord, avatars, use24HourClock, deleteWindowMinutes, editWindowMinutes, onDelete, onUndelete }: MsgProps) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const ageMs = Date.now() - new Date(msg.created_at + 'Z').getTime()
  const isFrontLog = isFrontSentinel(msg.text)
  const deletable = deleteWindowMinutes > 0 && !msg.tracker_record_id && !isFrontLog && !msg.deleted && ageMs < deleteWindowMinutes * 60_000
  const editable = editWindowMinutes > 0 && !msg.tracker_record_id && !isFrontLog && !msg.deleted && ageMs < editWindowMinutes * 60_000
  const restoreUntilMs = new Date(msg.created_at + 'Z').getTime() + deleteWindowMinutes * 60_000
  const restoreUntilStr = new Date(restoreUntilMs).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  const date = new Date(msg.created_at + 'Z')
  const timeStr = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: !use24HourClock })
  const dateStr = date.toLocaleDateString()

  function handleDoubleClick() {
    if (msg.deleted) { onUndelete(); return }
    if (editable) onEditStart()
  }

  return (
    <div className="message-item" style={depthStyle(depth)} onDoubleClick={handleDoubleClick} onClick={e => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); inspectMessage(msg) } }}>
      <div className="message-avatar-col">
        {msg.avatar_image_data
          ? <img src={`data:image/png;base64,${msg.avatar_image_data}`} className="message-avatar-img" alt={msg.avatar_name ?? ''} />
          : msg.avatar_image_path
          ? <img src={assetUrl(msg.avatar_image_path)!} className="message-avatar-img" alt={msg.avatar_name ?? ''} />
          : <div className="message-avatar-dot" style={{ background: msg.avatar_color ?? 'var(--text-muted)' }} />
        }
        {!msg.deleted && onReply && (
          <button className="reply-btn" onClick={e => { e.stopPropagation(); onReply() }} title="Reply">↩</button>
        )}
      </div>
      <div className="message-body">
        <div className="message-meta">
          <span className="message-avatar-name" style={{ color: msg.avatar_color ?? 'var(--text-muted)' }}>
            {msg.avatar_name ?? '—'}
          </span>
          {isAllMessages && <span className="message-muted"> · {msg.channel_name}</span>}
          <span className="message-muted"> · {dateStr} {timeStr}</span>
          {!msg.deleted && msg.original_text && <span className="message-edited"> {t('chat.edited')}</span>}
          {editable && editing === null && (
            <button className="msg-edit-btn" onClick={e => { e.stopPropagation(); onEditStart() }} title="Edit">✎</button>
          )}
          {!!msg.deleted && (
            <button className="msg-restore-btn" onClick={e => { e.stopPropagation(); onUndelete() }} title="Restore">↺</button>
          )}
          {deletable && editing === null && (
            confirmDelete ? (
              <span className="msg-delete-confirm" onClick={e => e.stopPropagation()}>
                <span className="msg-delete-confirm-label">{t('chat.confirmDelete')}</span>
                <button className="msg-delete-yes" onClick={() => { setConfirmDelete(false); onDelete() }}>{t('chat.confirmDeleteYes')}</button>
                <button className="msg-delete-no" onClick={() => setConfirmDelete(false)}>{t('chat.confirmDeleteNo')}</button>
              </span>
            ) : (
              <button className="msg-delete-btn" onClick={e => { e.stopPropagation(); setConfirmDelete(true) }} title={t('chat.delete')}>✕</button>
            )
          )}
        </div>
        {msg.deleted ? (
          <p className="message-deleted">{t('chat.deletedRestoreUntil', { time: restoreUntilStr })}</p>
        ) : editing !== null ? (
          <div className="edit-row">
            <textarea
              autoFocus
              value={editing}
              onChange={e => onEditChange(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onEditSave() }
                if (e.key === 'Escape') onEditCancel()
              }}
            />
            <button onClick={onEditSave}>{t('chat.save')}</button>
            <button onClick={onEditCancel}>{t('chat.cancel')}</button>
          </div>
        ) : msg.tracker_record_id !== null ? (
          <TrackerRecordCard record={trackerRecord} avatars={avatars} use24HourClock={use24HourClock} />
        ) : msg.image_path !== null ? (
          <ImageMessage msg={msg} />
        ) : isFrontLog ? (
          <FrontLogMessage msg={msg} />
        ) : (
          <p className="message-text">{msg.text}</p>
        )}
      </div>
    </div>
  )
}

// ── Page item ─────────────────────────────────────────────────────────────────

function extractPageTitle(html: string): string {
  const tmp = document.createElement('div')
  tmp.innerHTML = html
  const first = tmp.querySelector('h1,h2,h3,h4,h5,h6,p')
  const text = first?.textContent?.trim() ?? ''
  return text.length > 100 ? text.slice(0, 100) + '…' : text
}

function PageItem({ msg, use24HourClock }: { msg: MessageRow; use24HourClock: boolean }) {
  const [expanded, setExpanded] = useState(true)
  const date = new Date(msg.created_at + 'Z')
  const timeStr = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: !use24HourClock })
  const dateStr = date.toLocaleDateString()
  const title = extractPageTitle(msg.text)
  return (
    <div className={`page-item${expanded ? ' page-item-expanded' : ''}`}>
      <button className="page-item-header" onClick={() => setExpanded(v => !v)}>
        {msg.avatar_image_data
          ? <img src={`data:image/png;base64,${msg.avatar_image_data}`} className="page-item-avatar-img" alt={msg.avatar_name ?? ''} />
          : msg.avatar_image_path
          ? <img src={assetUrl(msg.avatar_image_path)!} className="page-item-avatar-img" alt={msg.avatar_name ?? ''} />
          : <span className="page-item-avatar-dot" style={{ background: msg.avatar_color ?? 'var(--text-muted)' }} />
        }
        <span className="page-item-author" style={{ color: msg.avatar_color ?? 'var(--text-muted)' }}>
          {msg.avatar_name ?? '—'}
        </span>
        {title && <span className="page-item-title">{title}</span>}
        <span className="page-item-meta">{dateStr} {timeStr}</span>
        <span className="page-item-chevron">{expanded ? '▾' : '▸'}</span>
      </button>
      {expanded && (
        <div className="page-item-body" dangerouslySetInnerHTML={{ __html: msg.text }} />
      )}
    </div>
  )
}

// ── Tracker record helpers ─────────────────────────────────────────────────────

function formatTrackerValue(v: TrackerRecordValueRow, avatars: Avatar[], use24HourClock: boolean): string {
  if (v.value_boolean !== null) return v.value_boolean ? 'Yes' : 'No'
  if (v.value_avatar_id !== null) {
    const found = avatars.find(a => a.id === v.value_avatar_id)
    return found ? found.name : `#${v.value_avatar_id}`
  }
  if (v.value_number !== null) return String(v.value_number)
  if (v.value_text !== null && v.value_text !== '') {
    if (v.field_type === 'date') {
      const [y, m, d] = v.value_text.split('-').map(Number)
      return new Date(y, m - 1, d).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
    }
    if (v.field_type === 'datetime') {
      const [datePart, timePart] = v.value_text.split('T')
      const [y, mo, d] = datePart.split('-').map(Number)
      const [h, min] = timePart.split(':').map(Number)
      const dt = new Date(y, mo - 1, d, h, min)
      const dateStr = dt.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
      const timeStr = dt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: !use24HourClock })
      return `${dateStr} ${timeStr}`
    }
    return v.value_text
  }
  return '—'
}

function formatTrackerSummary(record: TrackerRecord, avatars: Avatar[], use24HourClock: boolean): string {
  if (record.values.length === 0) return '(no fields)'
  return record.values
    .map(v => `${v.field_name}: ${formatTrackerValue(v, avatars, use24HourClock)}`)
    .join(' · ')
}

function TrackerRecordCard({ record, avatars, use24HourClock }: { record?: TrackerRecord; avatars: Avatar[]; use24HourClock: boolean }) {
  if (!record) return <p className="message-text tracker-record-loading">…</p>
  if (record.values.length === 0) return <p className="message-text tracker-record-empty">(no fields)</p>
  return (
    <div className="tracker-record-card">
      {record.values.map(v => (
        <div key={v.field_id} className="tracker-record-row">
          <span className="tracker-field-name">{v.field_name}</span>
          <span className="tracker-field-value">{formatTrackerValue(v, avatars, use24HourClock)}</span>
        </div>
      ))}
    </div>
  )
}
