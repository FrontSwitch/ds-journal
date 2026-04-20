export interface BotRule {
  name: string
  pattern: string
  responses: string[]
  priority: number
  tags: string[]
}

export interface RuleSet {
  name: string
  rules: BotRule[]
}

export interface BotConfigFile {
  name: string
  displayName: string
  delaySeconds: number
  ruleSets: string[]
}

export interface ResolvedBotConfig {
  name: string
  displayName: string
  delaySeconds: number
  rules: BotRule[]
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
  createdAt: number
}

export function matchBot(text: string, recentTags: string[], rules: BotRule[]): BotMatch | null {
  const sorted = [...rules].sort((a, b) => {
    const boostA = a.tags.some(t => recentTags.includes(t)) ? 5 : 0
    const boostB = b.tags.some(t => recentTags.includes(t)) ? 5 : 0
    return (b.priority + boostB) - (a.priority + boostA)
  })

  for (const rule of sorted) {
    let rx: RegExp
    try { rx = new RegExp(rule.pattern, 'i') } catch { continue }
    const match = text.match(rx)
    if (match) {
      const template = rule.responses[Math.floor(Math.random() * rule.responses.length)]
      const response = template.replace(/\{(\d+)\}/g, (_, i) => match[parseInt(i) + 1] ?? '')
      return { response, ruleName: rule.name, tags: rule.tags }
    }
  }
  return null
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

const BOT_FILES: Record<string, BotConfigFile> = Object.fromEntries(
  (botsFile as BotConfigFile[]).map(b => [b.name, b])
)

export function getBotConfig(name: string): ResolvedBotConfig | null {
  const file = BOT_FILES[name]
  if (!file) return null
  const rules = file.ruleSets.flatMap(rs => RULE_SET_REGISTRY[rs]?.rules ?? [])
  return { name: file.name, displayName: file.displayName, delaySeconds: file.delaySeconds, rules }
}

export function listBotNames(): string[] {
  return Object.keys(BOT_FILES)
}
