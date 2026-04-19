import { getDb } from './index'

// Simple seeded PRNG (mulberry32) — deterministic, same seed = same data
function makePrng(seed: number) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const MESSAGES = [
  "switching a lot today, hard to keep track",
  "front feels clearer this morning",
  "woke up mid-switch, took a while to orient",
  "co-fronting right now, a bit disorienting but manageable",
  "pretty stable today, we've been doing better",
  "lost about two hours, not sure who was out",
  "good morning from the front",
  "feeling more grounded than usual today",
  "present and accounted for",
  "slow day, mostly dissociated #dissociation",
  "that interaction earlier was really triggering #trigger",
  "worked through something difficult in therapy today",
  "feeling overwhelmed, too much input",
  "actually proud of how we handled that",
  "it's okay. we're okay. just needed to write that",
  "struggling with the memories again",
  "today was heavy. putting it down here so we don't carry it all night",
  "felt really seen today, it meant a lot",
  "frustration about things outside our control",
  "small win today, noting it for the record",
  "anxiety is loud today #anxiety",
  "the body is tired even if some of us aren't",
  "feeling safer than we did last month",
  "reminder to the others: we have an appointment Thursday",
  "please don't make commitments without checking with the rest of us",
  "thank you whoever handled that call, it sounded hard",
  "hey does anyone remember what we decided about that last week",
  "leaving a note here in case anyone else fronts tonight",
  "to whoever was out earlier: we're proud of you",
  "heads up, we're going to need a lot of quiet time this evening",
  "can we all agree not to doomscroll tonight",
  "for the record: this was a good decision",
  "things to get done this week: groceries, email, call back",
  "don't forget we said we'd rest on Sunday",
  "booking that appointment today #planning",
  "priorities: body care, one task, no more",
  "goal for today is just getting through it, and that's enough",
  "out since about 9am #frontlog",
  "switching at around 3pm #frontlog",
  "late night front, writing before it fades #frontlog",
  "front log: stable most of the afternoon",
  "ok", "we're here", "hello", "noted", "agreed", "yeah that's fair", "thank you", "felt that",
  "This is a longer entry.\n\nWe had a hard day and needed to put it somewhere. The body went through a lot and some of us are still processing. Writing it down helps.",
  "Today was actually nice? That felt strange to write. We went outside, the sun was out, and for a little while things felt okay.",
  "There's been tension in the system lately. Nothing dramatic, just friction. We're trying to be patient with each other.",
  "Therapy today. We worked on something old. It's going to take more sessions but there was movement, which is the point.",
  "Reminder to future fronters: the thing in the fridge is from Monday, still fine to eat. You're allowed to rest.",
]

function randomTimestamp(rng: () => number, total: number): string {
  const nowMs = Date.now()
  const days = Math.max(20, Math.round(total / 100))
  const range = days * 24 * 60 * 60 * 1000
  const offset = Math.floor(Math.pow(rng(), 2) * range)
  return new Date(nowMs - offset).toISOString().replace('T', ' ').slice(0, 19)
}

export async function seedDatabase(count: number): Promise<{ avatars: number; channels: number; messages: number }> {
  const db = await getDb()
  const rng = makePrng(42)
  function pick<T>(arr: T[]): T { return arr[Math.floor(rng() * arr.length)] }

  async function upsertGroup(name: string, description: string, color: string, order: number): Promise<number> {
    const rows = await db.select<{ id: number }[]>('SELECT id FROM avatar_groups WHERE name=? LIMIT 1', [name])
    if (rows.length > 0 && rows[0]?.id) return rows[0].id
    return (await db.execute('INSERT INTO avatar_groups (name, description, color, sort_order) VALUES (?,?,?,?)', [name, description, color, order])).lastInsertId as number
  }

  // ── Groups ────────────────────────────────────────────────────────────────
  const gCore  = await upsertGroup('Core',       'Primary fronters',  '#89b4fa', 0)
  const gProt  = await upsertGroup('Protectors', 'Protective alters', '#f38ba8', 1)
  const gLit   = await upsertGroup('Littles',    'Younger parts',     '#f9e2af', 2)

  // ── Avatars ───────────────────────────────────────────────────────────────
  function img(name: string) { return `builtin://avatars/kenney-animal-pack/${name}.png` }
  async function upsertAvatar(name: string, color: string, pronouns: string | null, group: number | null, order: number, animal: string | null): Promise<number> {
    const rows = await db.select<{ id: number }[]>('SELECT id FROM avatars WHERE name=? LIMIT 1', [name])
    if (rows.length > 0 && rows[0]?.id) return rows[0].id
    const id = (await db.execute(
      'INSERT INTO avatars (name, color, pronouns, image_path, sort_order) VALUES (?,?,?,?,?)',
      [name, color, pronouns, animal ? img(animal) : null, order]
    )).lastInsertId as number
    if (group !== null) await db.execute('INSERT OR IGNORE INTO avatar_group_members (avatar_id, group_id) VALUES (?,?)', [id, group])
    return id
  }

  const aAlex     = await upsertAvatar('Alex',     '#89b4fa', 'they/them', gCore, 0, 'owl')
  const aJamie    = await upsertAvatar('Jamie',    '#a6e3a1', 'she/her',   gCore, 1, 'rabbit')
  const aSam      = await upsertAvatar('Sam',      '#cba6f7', 'he/him',    gCore, 2, null)
  const aSentinel = await upsertAvatar('Sentinel', '#f38ba8', 'they/them', gProt, 3, 'bear')
  const aWard     = await upsertAvatar('Ward',     '#fab387', 'he/him',    gProt, 4, null)
  const aPip      = await upsertAvatar('Pip',      '#f9e2af', 'she/her',   gLit,  5, 'duck')
  const aSunny    = await upsertAvatar('Sunny',    '#ffe0a0', 'they/them', gLit,  6, null)
  const aDot      = await upsertAvatar('Dot',      '#89dceb', 'she/her',   gLit,  7, 'penguin')
  const aEcho     = await upsertAvatar('Echo',     '#cdd6f4', null,        null,  8, null)
  const aRiver    = await upsertAvatar('River',    '#b4befe', 'they/them', null,  9, 'narwhal')

  const avatarsWeighted = [
    ...Array(12).fill(aAlex), ...Array(10).fill(aJamie), ...Array(10).fill(aSam),
    ...Array(5).fill(aSentinel), ...Array(4).fill(aWard),
    ...Array(3).fill(aPip), ...Array(3).fill(aSunny), ...Array(2).fill(aDot),
    ...Array(3).fill(aEcho), ...Array(3).fill(aRiver),
    null, null,
  ]

  // ── Folders + channels ────────────────────────────────────────────────────
  async function upsertFolder(name: string, color: string, order: number): Promise<number> {
    const rows = await db.select<{ id: number }[]>('SELECT id FROM folders WHERE name=? LIMIT 1', [name])
    if (rows.length > 0 && rows[0]?.id) return rows[0].id
    return (await db.execute('INSERT INTO folders (name, color, sort_order) VALUES (?,?,?)', [name, color, order])).lastInsertId as number
  }
  async function upsertChannel(name: string, folderId: number | null, order: number): Promise<number> {
    const rows = await db.select<{ id: number }[]>('SELECT id FROM channels WHERE name=? AND folder_id IS ? LIMIT 1', [name, folderId])
    if (rows.length > 0 && rows[0]?.id) return rows[0].id
    return (await db.execute('INSERT INTO channels (name, folder_id, sort_order) VALUES (?,?,?)', [name, folderId, order])).lastInsertId as number
  }

  const fDaily  = await upsertFolder('Daily',   '#a6e3a1', 0)
  const fSystem = await upsertFolder('System',  '#89b4fa', 1)
  const fOld    = await upsertFolder('Archive', '#6c7086', 2)

  const chGeneral   = await upsertChannel('general',    fDaily,  0)
  const chVenting   = await upsertChannel('venting',    fDaily,  1)
  const chPlanning  = await upsertChannel('planning',   fDaily,  2)
  const chCheckIn   = await upsertChannel('check-in',   fDaily,  3)
  const chFrontLog  = await upsertChannel('front-log',  fSystem, 0)
  const chDecisions = await upsertChannel('decisions',  fSystem, 1)
  const chMemories  = await upsertChannel('memories',   fSystem, 2)
  const chOldGen    = await upsertChannel('old-general',fOld,    0)
  const chOldEvents = await upsertChannel('old-events', fOld,    1)
  const chRandom    = await upsertChannel('random',     null,    0)

  const channelsWeighted = [
    ...Array(12).fill(chGeneral), ...Array(12).fill(chFrontLog),
    ...Array(12).fill(chCheckIn), ...Array(12).fill(chVenting),
    ...Array(10).fill(chPlanning), ...Array(10).fill(chMemories),
    ...Array(8).fill(chDecisions), ...Array(8).fill(chOldGen),
    ...Array(8).fill(chOldEvents), ...Array(8).fill(chRandom),
  ]

  // ── Messages ──────────────────────────────────────────────────────────────
  // Build list sorted by timestamp so IDs are roughly chronological
  type Row = [number, number | null, string, string]
  const rows: Row[] = []
  for (let i = 0; i < count; i++) {
    rows.push([
      pick(channelsWeighted),
      pick(avatarsWeighted),
      pick(MESSAGES),
      randomTimestamp(rng, count),
    ])
  }
  rows.sort((a, b) => a[3].localeCompare(b[3]))

  for (const [channelId, avatarId, text, createdAt] of rows) {
    await db.execute(
      'INSERT INTO messages (channel_id, avatar_id, text, created_at) VALUES (?,?,?,?)',
      [channelId, avatarId, text, createdAt]
    )
  }

  return { avatars: 10, channels: 10, messages: count }
}
