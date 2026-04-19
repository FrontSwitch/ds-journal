import { getDb } from '../../db/index'
import { toSqlDatetime } from '../../lib/dateUtils'
import { getChannels } from '../../db/channels'
import { getAvatars } from '../../db/avatars'
import { getTrackers, getTrackerFields } from '../../db/trackers'
import { addLog } from '../../store/debug'
import { isHidden } from '../../types'

const FAKE_MSGS = [
  "feeling pretty grounded today",
  "had a rough switch earlier",
  "working on the project, making progress",
  "not sure who was fronting this morning",
  "feeling anxious about tomorrow",
  "good morning from the front",
  "just got back from a walk, feeling better",
  "anyone else feeling scattered lately?",
  "made some tea, calming down",
  "therapy was really hard today",
  "pretty tired, might rest early",
  "proud of what we accomplished this week",
  "need some quiet time right now",
  "feeling safe and okay",
  "had a memory come up unexpectedly",
  "switching a lot today, hard to track",
  "things feel more stable now",
  "rough night but doing okay",
  "someone left a note, not sure who",
  "taking it one hour at a time",
  "managed to finish the task",
  "feeling disconnected but present",
  "small win today",
  "co-conscious with someone new",
  "headache, probably from stress",
]

// create fake getMessages. count and Channel.
async function cmdCreateMessage(args: string[]): Promise<string> {
  const count = parseInt(args[0] ?? '')
  if (isNaN(count) || count < 1) return 'usage: create_message <count> <channel> [no_reply|reply]'

  const channelArg = (args[1] ?? '').replace(/^#/, '').toLowerCase()
  if (!channelArg) return 'usage: create_message <count> <channel> [no_reply|reply]'

  const withReplies = (args[2] ?? 'no_reply') !== 'no_reply'

  const [channels, avatars] = await Promise.all([getChannels(), getAvatars()])
  const channel = channels.find(c => c.name.toLowerCase() === channelArg)
  if (!channel) return `channel not found: "${channelArg}"`

  const active = avatars.filter(a => !isHidden(a.hidden))
  if (active.length === 0) return 'no visible avatars found'

  const db = await getDb()
  const ids: number[] = []

  for (let i = 0; i < count; i++) {
    const text = FAKE_MSGS[i % FAKE_MSGS.length] + (count > FAKE_MSGS.length ? ` [${i + 1}]` : '')
    const avatar = active[i % active.length]
    let parentId: number | null = null

    if (withReplies && i >= 5 && ids.length > 0 && Math.random() < 0.25) {
      parentId = ids[Math.floor(Math.random() * ids.length)]
    }

    const result = await db.execute(
      'INSERT INTO messages (channel_id, avatar_id, text, parent_msg_id) VALUES (?, ?, ?, ?)',
      [channel.id, avatar.id, text, parentId]
    )
    ids.push(result.lastInsertId as number)
  }

  const replyNote = withReplies ? ` (~${Math.round(Math.max(0, count - 5) * 0.25)} replies)` : ''
  return `created ${count} messages in #${channel.name}${replyNote}`
}

// create fake sleep tracker results for N days
async function cmdSeedSleep(args: string[]): Promise<string> {
  const days = parseInt(args[0] ?? '30')
  if (isNaN(days) || days < 1) return 'usage: seed_sleep [days=30]'

  const trackers = await getTrackers(true)
  const sleep = trackers.find(t => t.name.toLowerCase() === 'sleep')
  if (!sleep) return 'Sleep tracker not found — create it in Settings → Edit Trackers first'

  const fields = await getTrackerFields(sleep.id)
  const hoursField    = fields.find(f => f.name === 'Hours')
  const qualityField  = fields.find(f => f.name === 'Quality')
  const nightmaresField = fields.find(f => f.name === 'Nightmares')
  if (!hoursField) return 'Sleep tracker missing "Hours" field'

  const qualities = ['Poor', 'Fair', 'Good', 'Great']
  const db = await getDb()
  const now = Date.now()

  for (let i = days; i >= 1; i--) {
    const ts = new Date(now - i * 86400000)
    // randomise time between 6am and 9am
    ts.setHours(6 + Math.floor(Math.random() * 3), Math.floor(Math.random() * 60), 0, 0)
    const isoTs = toSqlDatetime(ts)

    const hours = +(4 + Math.random() * 5).toFixed(1)
    const quality = qualities[Math.floor(Math.random() * qualities.length)]
    const nightmares = Math.random() < 0.2 ? 1 : 0

    const recResult = await db.execute(
      `INSERT INTO tracker_records (tracker_id, avatar_id, created_at) VALUES (?, NULL, ?)`,
      [sleep.id, isoTs]
    )
    const recordId = recResult.lastInsertId as number

    if (hoursField) {
      await db.execute(
        'INSERT INTO tracker_record_values (record_id, field_id, value_number) VALUES (?, ?, ?)',
        [recordId, hoursField.id, hours]
      )
    }
    if (qualityField) {
      await db.execute(
        'INSERT INTO tracker_record_values (record_id, field_id, value_text) VALUES (?, ?, ?)',
        [recordId, qualityField.id, quality]
      )
    }
    if (nightmaresField) {
      await db.execute(
        'INSERT INTO tracker_record_values (record_id, field_id, value_boolean) VALUES (?, ?, ?)',
        [recordId, nightmaresField.id, nightmares]
      )
    }

    const barText = `|${isoTs}|${hours}|${quality}|${nightmares ? 'yes' : 'no'}|`
    await db.execute(
      'INSERT INTO messages (channel_id, avatar_id, text, tracker_record_id, created_at) VALUES (?, NULL, ?, ?, ?)',
      [sleep.channel_id, barText, recordId, isoTs]
    )
  }

  return `seeded ${days} sleep records`
}

// Seed front_sessions for N days.
// Usage: seed_front [days=30] [switches_per_day=random5-10] [max_co=2]
//   days            — how many past days to fill
//   switches_per_day — fixed switches per day (omit for random 5–10)
//   max_co           — max co-fronters in a single slot (default 2)
async function cmdSeedFront(args: string[]): Promise<string> {
  const days = parseInt(args[0] ?? '30')
  if (isNaN(days) || days < 1) return 'usage: seed_front [days=30] [switches_per_day] [max_co=2]'

  const switchesArg = parseInt(args[1] ?? '')
  const fixedSwitches = isNaN(switchesArg) ? null : Math.max(1, switchesArg)
  const maxCo = Math.max(1, parseInt(args[2] ?? '') || 2)

  const avatars = (await getAvatars()).filter(a => !isHidden(a.hidden))
  if (avatars.length === 0) return 'no visible avatars found'

  const db = await getDb()
  const now = Date.now()

  function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)] }
  function pickN<T>(arr: T[], n: number): T[] {
    return [...arr].sort(() => Math.random() - 0.5).slice(0, n)
  }
  function fmtUtc(ms: number): string {
    return toSqlDatetime(new Date(ms))
  }
  function randBetween(lo: number, hi: number): number {
    return lo + Math.random() * (hi - lo)
  }

  let totalSessions = 0
  let totalSwitches = 0

  // d=days is the oldest day, d=0 is today
  for (let d = days; d >= 0; d--) {
    const baseMs = now - d * 86400000
    const base = new Date(baseMs)

    // Day starts between 7–9 am, ends between 10 pm – midnight (or "now" for today)
    const dayStartMs = new Date(base).setHours(7 + Math.floor(Math.random() * 3), Math.floor(Math.random() * 60), 0, 0)
    const dayEndMs = d === 0
      ? now - 2 * 60_000
      : new Date(base).setHours(22 + Math.floor(Math.random() * 2), Math.floor(Math.random() * 60), 0, 0)

    if (dayEndMs <= dayStartMs) continue

    const n = fixedSwitches ?? (5 + Math.floor(Math.random() * 6))  // 5–10
    const slotMs = (dayEndMs - dayStartMs) / n

    // Generate switch times — one per slot with jitter
    const switchTimes: number[] = []
    for (let s = 0; s < n; s++) {
      switchTimes.push(Math.round(dayStartMs + s * slotMs + randBetween(0, slotMs * 0.8)))
    }

    for (let s = 0; s < switchTimes.length; s++) {
      const enteredMs = switchTimes[s]
      const isLastOfToday = d === 0 && s === switchTimes.length - 1
      // Last slot of today stays open (null exited_at = currently fronting)
      const exitedMs: number | null = isLastOfToday
        ? null
        : s < switchTimes.length - 1
          ? switchTimes[s + 1]
          : dayEndMs

      // Configuration: 15% nobody, 55% solo, 30% co-front
      const roll = Math.random()
      let chosen: number[]
      if (roll < 0.15) {
        chosen = []
      } else if (roll < 0.70 || avatars.length === 1) {
        chosen = [pick(avatars).id]
      } else {
        const count = (maxCo >= 3 && Math.random() < 0.3) ? 3 : 2
        chosen = pickN(avatars, Math.min(count, avatars.length)).map(a => a.id)
      }

      const enteredAt = fmtUtc(enteredMs)
      const exitedAt = exitedMs !== null ? fmtUtc(exitedMs) : null

      for (const avatarId of chosen) {
        await db.execute(
          'INSERT INTO front_sessions (avatar_id, entered_at, exited_at) VALUES (?, ?, ?)',
          [avatarId, enteredAt, exitedAt]
        )
        totalSessions++
      }
      totalSwitches++
    }
  }

  const dayCount = days + 1
  const perDay = (totalSwitches / dayCount).toFixed(1)
  return `seeded ${totalSessions} front sessions across ${totalSwitches} switches over ${dayCount} days (~${perDay} switches/day)`
}

function cmdTestLogs(): string {
  addLog('test debug message', 'debug')
  addLog('test info message', 'info')
  addLog('test warn message', 'warn')
  addLog('test error message', 'error')
  return 'emitted debug / info / warn / error test messages'
}

function cmdHelp(): string {
  return 'available commands:\n' +
    '  create_message <count> <channel> [reply|no_reply]\n' +
    '  seed_front [days=30] [switches_per_day] [max_co=2]\n' +
    '  seed_sleep [days=30]\n' +
    '  test_logs';
}

export async function runCommand(input: string): Promise<string> {
  const parts = input.trim().split(/\s+/)
  const cmd = parts[0]?.toLowerCase()

  try {
    if (cmd === 'create_message' || cmd === 'cm') return await cmdCreateMessage(parts.slice(1))
    if (cmd === 'seed_front'    || cmd === 'sf') return await cmdSeedFront(parts.slice(1))
    if (cmd === 'seed_sleep'    || cmd === 'ss') return await cmdSeedSleep(parts.slice(1))
    if (cmd === 'test_logs'     || cmd === 'tl') return cmdTestLogs()
    if (cmd === 'help' || cmd == '?') return cmdHelp()
    return `unknown command: ${cmd}. try: ${cmdHelp()}`
  } catch (e) {
    return `error: ${e instanceof Error ? e.message : String(e)}`
  }
}
