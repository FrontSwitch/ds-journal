export interface BotRule {
  name: string
  pattern: string
  responses: string[]
  priority: number
  tags?: string[]
  chance?: number      // 0–1 probability this match is accepted; default 1
  required?: string[]  // at least one must be in recentTags (OR); absent = no requirement
  excluded?: string[]  // none may be in recentTags; absent = no restriction
  minSeriousness?: number
  maxSeriousness?: number
  minDepth?: number
  maxDepth?: number
  minVolatility?: number
  maxVolatility?: number
}

export interface RuleSet {
  name: string
  rules: BotRule[]
}

// seriousness: 0=light/casual → 2=neutral → 4=heavy/intense
// depth:       0=playful      → 2=mirroring → 4=reflective/insightful
export interface ToneDelta {
  seriousness: number
  depth: number
}

export interface ToneSnapshot {
  seriousness: number
  depth: number
}

export interface ToneState extends ToneSnapshot {
  volatility: number  // avg Euclidean distance between last N snapshots; 0 = stable
}

export const TONE_NEUTRAL: ToneSnapshot = { seriousness: 2, depth: 2 }
const TONE_HISTORY_SIZE = 5

export function distillTone(
  tags: string[],
  tagMap: Record<string, ToneDelta>,
  history: ToneSnapshot[],
): ToneState {
  let s = TONE_NEUTRAL.seriousness
  let d = TONE_NEUTRAL.depth

  for (let i = 0; i < tags.length; i++) {
    const delta = tagMap[tags[i]]
    if (!delta) continue
    const weight = 1 / (i + 1)
    s += delta.seriousness * weight
    d += delta.depth * weight
  }

  const seriousness = Math.max(0, Math.min(4, s))
  const depth = Math.max(0, Math.min(4, d))

  let volatility = 0
  if (history.length >= 2) {
    let total = 0
    for (let i = 0; i < history.length - 1; i++) {
      const ds = history[i].seriousness - history[i + 1].seriousness
      const dd = history[i].depth - history[i + 1].depth
      total += Math.sqrt(ds * ds + dd * dd)
    }
    volatility = total / (history.length - 1)
  }

  return { seriousness, depth, volatility }
}

export interface BotConfigFile {
  name: string
  displayName: string
  delaySeconds: number
  ruleSets: string[]
}

export interface BotsFile {
  tags: Record<string, ToneDelta>
  bots: BotConfigFile[]
}

export interface ResolvedBotConfig {
  name: string
  displayName: string
  delaySeconds: number
  rules: BotRule[]
  tagTones: Record<string, ToneDelta>
}

export interface BotMatch {
  response: string
  ruleName: string
  tags: string[]
}

export interface BotMessage {
  id: number
  text: string
  ruleName: string
  addedTags: string[]
  contextTags: string[]
  tone?: ToneState
  createdAt: number
}

function splitSentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean)
}

export function matchBot(
  text: string,
  recentTags: string[],
  rules: BotRule[],
  tone?: ToneState,
): BotMatch | null {
  const sentences = splitSentences(text)

  type Candidate = { rule: BotRule; regexMatch: RegExpMatchArray; effectivePriority: number }
  const candidates: Candidate[] = []
  const allTagsSeen = new Set<string>()

  for (const sentence of sentences) {
    for (const rule of rules) {
      let rx: RegExp
      try { rx = new RegExp(rule.pattern, 'i') } catch { continue }
      const regexMatch = sentence.match(rx)
      if (!regexMatch) continue
      if (rule.required?.length && !rule.required.some(t => recentTags.includes(t))) continue
      if (rule.excluded?.length && rule.excluded.some(t => recentTags.includes(t))) continue
      if (tone) {
        if (rule.minSeriousness !== undefined && tone.seriousness < rule.minSeriousness) continue
        if (rule.maxSeriousness !== undefined && tone.seriousness > rule.maxSeriousness) continue
        if (rule.minDepth !== undefined && tone.depth < rule.minDepth) continue
        if (rule.maxDepth !== undefined && tone.depth > rule.maxDepth) continue
        if (rule.minVolatility !== undefined && tone.volatility < rule.minVolatility) continue
        if (rule.maxVolatility !== undefined && tone.volatility > rule.maxVolatility) continue
      }
      const chance = rule.chance ?? 1
      if (chance < 1 && Math.random() > chance) continue
      const ruleTags = rule.tags ?? []
      const boost = ruleTags.some(t => recentTags.includes(t)) ? 5 : 0
      candidates.push({ rule, regexMatch, effectivePriority: rule.priority + boost })
      ruleTags.forEach(t => allTagsSeen.add(t))
    }
  }

  if (candidates.length === 0) return null

  candidates.sort((a, b) => b.effectivePriority - a.effectivePriority)
  const best = candidates[0]
  const template = best.rule.responses[Math.floor(Math.random() * best.rule.responses.length)]
  const response = template.replace(/\{(\d+)\}/g, (_, i) => best.regexMatch[parseInt(i) + 1] ?? '')

  return { response, ruleName: best.rule.name, tags: [...allTagsSeen] }
}

// ── Rule set registry ──────────────────────────────────────────────────────────

const RULE_SET_REGISTRY: Record<string, RuleSet> = Object.fromEntries(
  Object.entries(import.meta.glob('../data/bots/rules/*.json', { eager: true })).map(([path, mod]) => {
    const name = path.replace(/^.*\/(.+)\.json$/, '$1')
    return [name, (mod as { default: RuleSet }).default]
  })
)

// ── Bot registry ───────────────────────────────────────────────────────────────

import botsFile from '../data/bots/bots.json'

const { tags: SHARED_TAG_TONES, bots: BOT_LIST } = botsFile as BotsFile
const BOT_FILES: Record<string, BotConfigFile> = Object.fromEntries(BOT_LIST.map(b => [b.name, b]))

export function getBotConfig(name: string): ResolvedBotConfig | null {
  const file = BOT_FILES[name]
  if (!file) return null
  const rules = file.ruleSets.flatMap(rs => RULE_SET_REGISTRY[rs]?.rules ?? [])
  return {
    name: file.name,
    displayName: file.displayName,
    delaySeconds: file.delaySeconds,
    rules,
    tagTones: SHARED_TAG_TONES,
  }
}

export function listBotNames(): string[] {
  return Object.keys(BOT_FILES)
}

export { TONE_HISTORY_SIZE }
