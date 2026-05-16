import { describe, it, expect, vi } from 'vitest'
import {
  matchBot,
  distillTone,
  type BotRule,
  type ToneDelta,
  type ToneSnapshot,
} from './botEngine'

// ── helpers ───────────────────────────────────────────────────────────────────

function rule(
  overrides: Partial<BotRule> & { name: string; pattern: string; responses: string[]; priority: number }
): BotRule {
  return { chance: 1, ...overrides }
}

const TAG_MAP: Record<string, ToneDelta> = {
  anxious: { seriousness: 1,  depth:  0.5 },
  calm:    { seriousness: -1, depth: -0.5 },
  heavy:   { seriousness: 2,  depth:  1   },
}

// ── distillTone ───────────────────────────────────────────────────────────────

describe('distillTone', () => {
  it('returns neutral tone with no tags and no history', () => {
    const t = distillTone([], TAG_MAP, [])
    expect(t.seriousness).toBe(2)
    expect(t.depth).toBe(2)
    expect(t.volatility).toBe(0)
  })

  it('returns volatility=0 with fewer than 2 history entries', () => {
    const t = distillTone([], TAG_MAP, [{ seriousness: 3, depth: 1 }])
    expect(t.volatility).toBe(0)
  })

  it('applies a single tag delta from neutral', () => {
    // anxious: s+1, d+0.5 at weight 1/(0+1)=1
    const t = distillTone(['anxious'], TAG_MAP, [])
    expect(t.seriousness).toBeCloseTo(3)
    expect(t.depth).toBeCloseTo(2.5)
  })

  it('weights earlier tags more heavily than later ones', () => {
    // heavy at i=0: weight=1, s+=2; calm at i=1: weight=0.5, s-=0.5 → 2+2-0.5=3.5
    const t = distillTone(['heavy', 'calm'], TAG_MAP, [])
    expect(t.seriousness).toBeCloseTo(3.5)
  })

  it('clamps seriousness max to 4', () => {
    const t = distillTone(['huge'], { huge: { seriousness: 10, depth: 0 } }, [])
    expect(t.seriousness).toBe(4)
  })

  it('clamps seriousness min to 0', () => {
    const t = distillTone(['neg'], { neg: { seriousness: -10, depth: 0 } }, [])
    expect(t.seriousness).toBe(0)
  })

  it('clamps depth max to 4', () => {
    const t = distillTone(['deep'], { deep: { seriousness: 0, depth: 10 } }, [])
    expect(t.depth).toBe(4)
  })

  it('clamps depth min to 0', () => {
    const t = distillTone(['shallow'], { shallow: { seriousness: 0, depth: -10 } }, [])
    expect(t.depth).toBe(0)
  })

  it('ignores tags not in tagMap', () => {
    const t = distillTone(['unknown_tag', 'also_missing'], TAG_MAP, [])
    expect(t.seriousness).toBe(2)
    expect(t.depth).toBe(2)
  })

  it('computes volatility as avg Euclidean distance between consecutive history snapshots', () => {
    const history: ToneSnapshot[] = [
      { seriousness: 2, depth: 2 },
      { seriousness: 3, depth: 2 },  // gap: ds=-1, dd=0 → dist=1
    ]
    const t = distillTone([], TAG_MAP, history)
    expect(t.volatility).toBeCloseTo(1)
  })

  it('averages multiple history gaps', () => {
    const history: ToneSnapshot[] = [
      { seriousness: 2, depth: 2 },
      { seriousness: 3, depth: 2 },  // gap1: dist=1
      { seriousness: 3, depth: 0 },  // gap2: dist=2
    ]
    // avg = (1+2)/2 = 1.5
    const t = distillTone([], TAG_MAP, history)
    expect(t.volatility).toBeCloseTo(1.5)
  })
})

// ── matchBot — basics ─────────────────────────────────────────────────────────

describe('matchBot — basics', () => {
  it('returns null when no rules match', () => {
    const rules = [rule({ name: 'r1', pattern: 'xyz', responses: ['hi'], priority: 1 })]
    expect(matchBot('hello world', [], rules)).toBeNull()
  })

  it('matches a simple pattern', () => {
    const rules = [rule({ name: 'r1', pattern: 'hello', responses: ['Hi!'], priority: 1 })]
    const m = matchBot('hello world', [], rules)
    expect(m).not.toBeNull()
    expect(m!.response).toBe('Hi!')
    expect(m!.ruleName).toBe('r1')
  })

  it('is case-insensitive', () => {
    const rules = [rule({ name: 'r1', pattern: 'HELLO', responses: ['Hi!'], priority: 1 })]
    expect(matchBot('hello', [], rules)).not.toBeNull()
  })

  it('returns rule tags in the match', () => {
    const rules = [rule({ name: 'r1', pattern: 'sad', responses: ['I hear you'], priority: 1, tags: ['emotion', 'sadness'] })]
    const m = matchBot('I feel so sad', [], rules)
    expect(m!.tags).toContain('emotion')
    expect(m!.tags).toContain('sadness')
  })

  it('returns empty tags when rule has no tags', () => {
    const rules = [rule({ name: 'r1', pattern: 'hi', responses: ['hey'], priority: 1 })]
    expect(matchBot('hi', [], rules)!.tags).toEqual([])
  })

  it('substitutes capture group {0} into response', () => {
    const rules = [rule({ name: 'r1', pattern: 'I feel (\\w+)', responses: ['You feel {0}.'], priority: 1 })]
    expect(matchBot('I feel lost', [], rules)!.response).toBe('You feel lost.')
  })

  it('leaves {0} empty when no capture group', () => {
    const rules = [rule({ name: 'r1', pattern: 'hi', responses: ['hey {0}'], priority: 1 })]
    expect(matchBot('hi', [], rules)!.response).toBe('hey ')
  })

  it('skips rules with invalid regex', () => {
    const rules = [
      rule({ name: 'bad',  pattern: '[invalid',  responses: ['bad'], priority: 10 }),
      rule({ name: 'good', pattern: 'hello',     responses: ['ok'],  priority: 1  }),
    ]
    expect(matchBot('hello', [], rules)!.ruleName).toBe('good')
  })
})

// ── matchBot — priority ───────────────────────────────────────────────────────

describe('matchBot — priority', () => {
  it('returns the highest-priority match', () => {
    const rules = [
      rule({ name: 'low',  pattern: 'hello', responses: ['low'],  priority: 1  }),
      rule({ name: 'high', pattern: 'hello', responses: ['high'], priority: 10 }),
    ]
    expect(matchBot('hello', [], rules)!.ruleName).toBe('high')
  })

  it('boosts priority by 5 when a rule tag overlaps recentTags', () => {
    const rules = [
      rule({ name: 'base',    pattern: 'hi', responses: ['base'],    priority: 10               }),
      rule({ name: 'boosted', pattern: 'hi', responses: ['boosted'], priority: 7, tags: ['emotion'] }),
    ]
    // 'emotion' in recentTags → boosted effective=12 > base=10
    expect(matchBot('hi', ['emotion'], rules)!.ruleName).toBe('boosted')
  })

  it('does not boost when rule tags are absent from recentTags', () => {
    const rules = [
      rule({ name: 'base',   pattern: 'hi', responses: ['base'],   priority: 10               }),
      rule({ name: 'nobust', pattern: 'hi', responses: ['nobust'], priority: 7, tags: ['sadness'] }),
    ]
    expect(matchBot('hi', ['emotion'], rules)!.ruleName).toBe('base')
  })
})

// ── matchBot — required / excluded ───────────────────────────────────────────

describe('matchBot — required / excluded', () => {
  it('skips rule when no required tag is in recentTags', () => {
    const rules = [rule({ name: 'r1', pattern: 'hi', responses: ['hey'], priority: 1, required: ['sadness'] })]
    expect(matchBot('hi', ['emotion'], rules)).toBeNull()
  })

  it('includes rule when any required tag matches (OR logic)', () => {
    const rules = [rule({ name: 'r1', pattern: 'hi', responses: ['hey'], priority: 1, required: ['sadness', 'emotion'] })]
    expect(matchBot('hi', ['emotion'], rules)).not.toBeNull()
  })

  it('skips rule when an excluded tag is in recentTags', () => {
    const rules = [rule({ name: 'r1', pattern: 'hi', responses: ['hey'], priority: 1, excluded: ['sadness'] })]
    expect(matchBot('hi', ['sadness'], rules)).toBeNull()
  })

  it('includes rule when no excluded tags are in recentTags', () => {
    const rules = [rule({ name: 'r1', pattern: 'hi', responses: ['hey'], priority: 1, excluded: ['sadness'] })]
    expect(matchBot('hi', ['emotion'], rules)).not.toBeNull()
  })

  it('no required constraint when required field is absent', () => {
    const rules = [rule({ name: 'r1', pattern: 'hi', responses: ['hey'], priority: 1 })]
    expect(matchBot('hi', [], rules)).not.toBeNull()
  })
})

// ── matchBot — tone filters ───────────────────────────────────────────────────

describe('matchBot — tone filters', () => {
  const toneHeavy    = { seriousness: 3.5, depth: 2.0, volatility: 0.0 }
  const toneLight    = { seriousness: 0.5, depth: 2.0, volatility: 0.0 }
  const toneDeep     = { seriousness: 2.0, depth: 3.5, volatility: 0.0 }
  const toneShallow  = { seriousness: 2.0, depth: 0.5, volatility: 0.0 }
  const toneVolatile = { seriousness: 2.0, depth: 2.0, volatility: 2.0 }
  const toneStable   = { seriousness: 2.0, depth: 2.0, volatility: 0.0 }

  it('skips rule when tone.seriousness < minSeriousness', () => {
    const rules = [rule({ name: 'r1', pattern: 'hi', responses: ['hey'], priority: 1, minSeriousness: 3 })]
    expect(matchBot('hi', [], rules, toneLight)).toBeNull()
  })

  it('includes rule when tone.seriousness >= minSeriousness', () => {
    const rules = [rule({ name: 'r1', pattern: 'hi', responses: ['hey'], priority: 1, minSeriousness: 3 })]
    expect(matchBot('hi', [], rules, toneHeavy)).not.toBeNull()
  })

  it('skips rule when tone.seriousness > maxSeriousness', () => {
    const rules = [rule({ name: 'r1', pattern: 'hi', responses: ['hey'], priority: 1, maxSeriousness: 1 })]
    expect(matchBot('hi', [], rules, toneHeavy)).toBeNull()
  })

  it('includes rule when tone.seriousness <= maxSeriousness', () => {
    const rules = [rule({ name: 'r1', pattern: 'hi', responses: ['hey'], priority: 1, maxSeriousness: 1 })]
    expect(matchBot('hi', [], rules, toneLight)).not.toBeNull()
  })

  it('skips rule when tone.depth < minDepth', () => {
    const rules = [rule({ name: 'r1', pattern: 'hi', responses: ['hey'], priority: 1, minDepth: 2 })]
    expect(matchBot('hi', [], rules, toneShallow)).toBeNull()
  })

  it('includes rule when tone.depth >= minDepth', () => {
    const rules = [rule({ name: 'r1', pattern: 'hi', responses: ['hey'], priority: 1, minDepth: 2 })]
    expect(matchBot('hi', [], rules, toneDeep)).not.toBeNull()
  })

  it('skips rule when tone.depth > maxDepth', () => {
    const rules = [rule({ name: 'r1', pattern: 'hi', responses: ['hey'], priority: 1, maxDepth: 2 })]
    expect(matchBot('hi', [], rules, toneDeep)).toBeNull()
  })

  it('includes rule when tone.depth <= maxDepth', () => {
    const rules = [rule({ name: 'r1', pattern: 'hi', responses: ['hey'], priority: 1, maxDepth: 2 })]
    expect(matchBot('hi', [], rules, toneShallow)).not.toBeNull()
  })

  it('skips rule when volatility < minVolatility', () => {
    const rules = [rule({ name: 'r1', pattern: 'hi', responses: ['hey'], priority: 1, minVolatility: 1 })]
    expect(matchBot('hi', [], rules, toneStable)).toBeNull()
  })

  it('includes rule when volatility >= minVolatility', () => {
    const rules = [rule({ name: 'r1', pattern: 'hi', responses: ['hey'], priority: 1, minVolatility: 1 })]
    expect(matchBot('hi', [], rules, toneVolatile)).not.toBeNull()
  })

  it('skips rule when volatility > maxVolatility', () => {
    const rules = [rule({ name: 'r1', pattern: 'hi', responses: ['hey'], priority: 1, maxVolatility: 1 })]
    expect(matchBot('hi', [], rules, toneVolatile)).toBeNull()
  })

  it('includes rule when volatility <= maxVolatility', () => {
    const rules = [rule({ name: 'r1', pattern: 'hi', responses: ['hey'], priority: 1, maxVolatility: 1 })]
    expect(matchBot('hi', [], rules, toneStable)).not.toBeNull()
  })

  it('does not apply tone filters when no tone is passed', () => {
    // minSeriousness=3 but tone omitted → filter is skipped
    const rules = [rule({ name: 'r1', pattern: 'hi', responses: ['hey'], priority: 1, minSeriousness: 3 })]
    expect(matchBot('hi', [], rules)).not.toBeNull()
  })
})

// ── matchBot — multi-sentence ─────────────────────────────────────────────────

describe('matchBot — multi-sentence', () => {
  it('matches text in a later sentence', () => {
    const rules = [rule({ name: 'r1', pattern: 'tired', responses: ['Rest.'], priority: 1 })]
    expect(matchBot('I am happy. I am so tired.', [], rules)).not.toBeNull()
  })

  it('collects tags from all matching rules across all sentences', () => {
    const rules = [
      rule({ name: 'r1', pattern: 'happy', responses: ['good'], priority: 1,  tags: ['joy']     }),
      rule({ name: 'r2', pattern: 'tired', responses: ['rest'], priority: 10, tags: ['fatigue'] }),
    ]
    const m = matchBot('I am happy. I am tired.', [], rules)
    expect(m!.ruleName).toBe('r2')
    expect(m!.tags).toContain('joy')
    expect(m!.tags).toContain('fatigue')
  })

  it('deduplicates tags when the same rule matches multiple sentences', () => {
    const rules = [rule({ name: 'r1', pattern: 'ugh', responses: ['yeah'], priority: 1, tags: ['frustration'] })]
    const m = matchBot('Ugh. Ugh!', [], rules)
    expect(m!.tags.filter(t => t === 'frustration')).toHaveLength(1)
  })
})

// ── matchBot — chance ─────────────────────────────────────────────────────────

describe('matchBot — chance', () => {
  it('skips rule when chance=0', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    const rules = [rule({ name: 'r1', pattern: 'hi', responses: ['hey'], priority: 1, chance: 0 })]
    expect(matchBot('hi', [], rules)).toBeNull()
    vi.restoreAllMocks()
  })

  it('always includes rule when chance=1', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99)
    const rules = [rule({ name: 'r1', pattern: 'hi', responses: ['hey'], priority: 1, chance: 1 })]
    expect(matchBot('hi', [], rules)).not.toBeNull()
    vi.restoreAllMocks()
  })

  it('includes rule when Math.random < chance', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.3)
    const rules = [rule({ name: 'r1', pattern: 'hi', responses: ['hey'], priority: 1, chance: 0.5 })]
    expect(matchBot('hi', [], rules)).not.toBeNull()
    vi.restoreAllMocks()
  })

  it('skips rule when Math.random >= chance', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.8)
    const rules = [rule({ name: 'r1', pattern: 'hi', responses: ['hey'], priority: 1, chance: 0.5 })]
    expect(matchBot('hi', [], rules)).toBeNull()
    vi.restoreAllMocks()
  })
})
