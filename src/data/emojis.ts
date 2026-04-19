// Emoji name aliases → character. Each entry's first name is the "canonical" one shown in the picker.
// Format: [[aliases...], unicode, category]
import type { EmojiOverride } from '../db/emojiOverrides'

export const SKIN_TONES: Record<string, string> = {
  none:        '',
  light:       '\u{1F3FB}',
  mediumLight: '\u{1F3FC}',
  medium:      '\u{1F3FD}',
  mediumDark:  '\u{1F3FE}',
  dark:        '\u{1F3FF}',
}

export function applySkinToneOld(emoji: string, toneModifier: string): string {
  if (!toneModifier) return emoji
  const isModifiable = /\p{Emoji_Modifier_Base}/u.test(emoji)
  // don't strip. Some emojis are sequences that include a skin tone, and we want to replace it rather than add a second one. For example, "👩‍💻"
  const cleanBase = emoji.replace(/\u{1F3FB}|\u{1F3FC}|\u{1F3FD}|\u{1F3FE}|\u{1F3FF}/gu, '');  
  if (cleanBase !== emoji) return emoji // already has a skin tone, but may not be the one we want
  return isModifiable ? emoji + toneModifier : emoji
}

export function applySkinTone(emoji: string, toneModifier: string): string {
  if (!toneModifier) return emoji;

  // Spread into an array of code points to handle surrogate pairs
  const codePoints = [...emoji];
  const modifiers = ['\u{1F3FB}', '\u{1F3FC}', '\u{1F3FD}', '\u{1F3FE}', '\u{1F3FF}'];
  const modifierBaseRegex = /\p{Emoji_Modifier_Base}/u;

  let result = "";
  let modified = false;

  for (let i = 0; i < codePoints.length; i++) {
    const char = codePoints[i];
    const nextChar = codePoints[i + 1];

    result += char;

    if (modifierBaseRegex.test(char)) {
      // Check if the next character is ALREADY a skin tone
      const alreadyHasTone = nextChar && modifiers.includes(nextChar);

      if (!alreadyHasTone) {
        result += toneModifier;
        modified = true;
      } else {
        // If it already has a tone, we skip applying the global one 
        // and just let the loop continue to add the existing tone naturally.
      }
    }
  }

  return modified ? result : emoji;
}

export const EMOJI_CATEGORIES = [
  'Faces', 'Hearts', 'Gestures', 'Nature', 'Objects',
] as const

const RAW: [string[], string, string][] = [
  // Faces
  [['smile', 'happy', 'grin'], '😊', 'Faces'],
  [['laugh', 'lol', 'haha', 'joy'], '😂', 'Faces'],
  [['rofl', 'rolling'], '🤣', 'Faces'],
  [['cry', 'sob', 'sad'], '😭', 'Faces'],
  [['sad2', 'frown', 'unhappy'], '😔', 'Faces'],
  [['tear', 'single_tear'], '🥹', 'Faces'],
  [['worried', 'nervous'], '😟', 'Faces'],
  [['anxious', 'scared'], '😰', 'Faces'],
  [['fear', 'shock', 'panic'], '😱', 'Faces'],
  [['angry', 'mad'], '😡', 'Faces'],
  [['frustrated', 'grr'], '😤', 'Faces'],
  [['pout', 'rage'], '😠', 'Faces'],
  [['numb', 'blank', 'expressionless'], '😶', 'Faces'],
  [['neutral', 'meh'], '😐', 'Faces'],
  [['confused', 'huh'], '😕', 'Faces'],
  [['pleading', 'uwu', 'begging'], '🥺', 'Faces'],
  [['love', 'heart_eyes', 'adore'], '😍', 'Faces'],
  [['kiss', 'mwah'], '😘', 'Faces'],
  [['wink'], '😉', 'Faces'],
  [['cool', 'sunglasses'], '😎', 'Faces'],
  [['think', 'thinking', 'hmm'], '🤔', 'Faces'],
  [['shush', 'quiet', 'secret'], '🤫', 'Faces'],
  [['lie', 'pinocchio'], '🤥', 'Faces'],
  [['blush', 'flushed'], '😳', 'Faces'],
  [['tired', 'sleepy', 'yawn'], '😴', 'Faces'],
  [['sick', 'ill'], '🤒', 'Faces'],
  [['pain', 'ouch', 'hurt'], '😣', 'Faces'],
  [['explode', 'mind_blown'], '🤯', 'Faces'],
  [['party', 'celebrate', 'tada'], '🥳', 'Faces'],
  [['dizzy', 'spinning'], '😵', 'Faces'],
  [['alien'], '👽', 'Faces'],
  [['ghost'], '👻', 'Faces'],
  [['skull', 'dead', 'rip'], '💀', 'Faces'],

  // Hearts
  [['heart', 'red_heart', 'love2'], '❤️', 'Hearts'],
  [['blue_heart', 'blueheart'], '💙', 'Hearts'],
  [['purple_heart', 'purpleheart'], '💜', 'Hearts'],
  [['green_heart', 'greenheart'], '💚', 'Hearts'],
  [['yellow_heart', 'yellowheart'], '💛', 'Hearts'],
  [['orange_heart', 'orangeheart'], '🧡', 'Hearts'],
  [['pink_heart', 'pinkheart'], '🩷', 'Hearts'],
  [['black_heart', 'blackheart'], '🖤', 'Hearts'],
  [['broken_heart', 'heartbreak'], '💔', 'Hearts'],
  [['sparkling_heart', 'heartglow'], '💖', 'Hearts'],
  [['two_hearts', 'hearts'], '💕', 'Hearts'],

  // Gestures
  [['thumbsup', 'yes', 'good', 'ok'], '👍', 'Gestures'],
  [['thumbsdown', 'no', 'bad'], '👎', 'Gestures'],
  [['wave', 'hi', 'hello', 'bye'], '👋', 'Gestures'],
  [['clap', 'applause'], '👏', 'Gestures'],
  [['hug', 'arms'], '🫂', 'Gestures'],
  [['fist', 'punch', 'bump'], '✊', 'Gestures'],
  [['muscles', 'strong', 'flex'], '💪', 'Gestures'],
  [['ok_hand', 'perfect'], '👌', 'Gestures'],
  [['peace', 'v', 'victory'], '✌️', 'Gestures'],
  [['pray', 'please', 'thanks', 'namaste'], '🙏', 'Gestures'],
  [['point_right', 'right'], '👉', 'Gestures'],
  [['point_left', 'left'], '👈', 'Gestures'],
  [['point_up', 'up'], '☝️', 'Gestures'],
  [['shrug', 'idk'], '🤷', 'Gestures'],

  // Nature
  [['flower', 'blossom', 'cherry_blossom'], '🌸', 'Nature'],
  [['rose', 'red_rose'], '🌹', 'Nature'],
  [['sunflower'], '🌻', 'Nature'],
  [['leaf', 'leaves', 'maple'], '🍁', 'Nature'],
  [['plant', 'sprout', 'seedling'], '🌱', 'Nature'],
  [['tree', 'evergreen'], '🌲', 'Nature'],
  [['rainbow'], '🌈', 'Nature'],
  [['sun', 'sunny'], '☀️', 'Nature'],
  [['moon', 'night'], '🌙', 'Nature'],
  [['star', 'stars'], '⭐', 'Nature'],
  [['sparkles', 'magic', 'glitter'], '✨', 'Nature'],
  [['fire', 'flame', 'hot'], '🔥', 'Nature'],
  [['snowflake', 'cold', 'snow'], '❄️', 'Nature'],
  [['cloud', 'cloudy'], '☁️', 'Nature'],
  [['storm', 'lightning', 'thunder'], '⛈️', 'Nature'],
  [['water', 'wave2', 'ocean'], '🌊', 'Nature'],
  [['butterfly'], '🦋', 'Nature'],
  [['cat', 'kitty'], '🐱', 'Nature'],
  [['dog', 'puppy'], '🐶', 'Nature'],
  [['fox', 'kitsune'], '🦊', 'Nature'],

  // Objects
  [['book', 'journal', 'diary'], '📖', 'Objects'],
  [['pencil', 'write', 'pen'], '✏️', 'Objects'],
  [['note', 'sticky'], '📝', 'Objects'],
  [['music', 'song', 'note2'], '🎵', 'Objects'],
  [['headphones', 'headset'], '🎧', 'Objects'],
  [['camera', 'photo'], '📷', 'Objects'],
  [['key', 'keys'], '🔑', 'Objects'],
  [['lock', 'locked'], '🔒', 'Objects'],
  [['gift', 'present'], '🎁', 'Objects'],
  [['balloon', 'balloons'], '🎈', 'Objects'],
  [['dice', 'die', 'roll'], '🎲', 'Objects'],
  [['joker', 'card', 'cards'], '🃏', 'Objects'],
  [['trophy', 'win', 'winner'], '🏆', 'Objects'],
  [['medal', 'award'], '🥇', 'Objects'],
  [['target', 'bullseye', 'goal'], '🎯', 'Objects'],
  [['pill', 'meds', 'medication'], '💊', 'Objects'],
  [['brain', 'mind'], '🧠', 'Objects'],
  [['zzz', 'sleep', 'zz'], '💤', 'Objects'],
  [['clock', 'time'], '🕐', 'Objects'],
  [['calendar', 'date'], '📅', 'Objects'],
  [['checkmark', 'done', 'complete', 'check'], '✅', 'Objects'],
  [['cross', 'wrong', 'no2', 'x'], '❌', 'Objects'],
  [['warning', 'alert', 'caution'], '⚠️', 'Objects'],
  [['info', 'information'], 'ℹ️', 'Objects'],
  [['question', 'ask'], '❓', 'Objects'],
  [['exclamation', 'important'], '❗', 'Objects'],
  [['bulb', 'idea', 'light'], '💡', 'Objects'],
  [['bell', 'notification'], '🔔', 'Objects'],
  [['mute', 'silent', 'quiet2'], '🔕', 'Objects'],
  [['recycle', 'refresh', 'reuse'], '♻️', 'Objects'],
  [['infinity', 'endless'], '♾️', 'Objects'],
  [['tarot', 'cards2'], '🔮', 'Objects'],
  [['safe', 'safety', 'protect'], '🛡️', 'Objects'],
]

export interface EmojiEntry {
  name: string      // canonical first name
  aliases: string[]
  emoji: string
  category: string
}

export interface EmojiSuggestion {
  name: string
  emoji: string
}

// Build lookup list
const ALIAS_MAP = new Map<string, EmojiEntry>()
export const EMOJI_ENTRIES: EmojiEntry[] = []

for (const [names, emoji, category] of RAW) {
  const entry: EmojiEntry = { name: names[0], aliases: names.slice(1), emoji, category }
  EMOJI_ENTRIES.push(entry)
  for (const alias of names) {
    ALIAS_MAP.set(alias, entry)
  }
}

export function findEmojiSuggestions(
  prefix: string,
  skinTone: string = '',
  entries: EmojiEntry[] = EMOJI_ENTRIES
): EmojiSuggestion[] {
  if (!prefix) return []
  const lower = prefix.toLowerCase()
  const seen = new Set<string>()
  const results: EmojiSuggestion[] = []
  // First: canonical names starting with prefix
  for (const entry of entries) {
    if (entry.name.startsWith(lower) && !seen.has(entry.name)) {
      seen.add(entry.name)
      results.push({ name: entry.name, emoji: applySkinTone(entry.emoji, skinTone) })
    }
  }
  // Then: aliases starting with prefix
  for (const entry of entries) {
    if (!seen.has(entry.name)) {
      for (const alias of entry.aliases) {
        if (alias.startsWith(lower) && !seen.has(alias)) {
          seen.add(entry.name)
          results.push({ name: alias, emoji: applySkinTone(entry.emoji, skinTone) })
          break
        }
      }
    }
  }
  return results.slice(0, 8)
}

export function buildMergedEntries(
  overrides: EmojiOverride[],
  builtinEnabled: boolean
): EmojiEntry[] {
  const userNames = new Set(overrides.map(o => o.name))
  const result: EmojiEntry[] = []

  // User entries first (empty emoji = hidden, excluded from autocomplete)
  for (const o of overrides) {
    if (o.emoji !== '') {
      result.push({
        name: o.name,
        aliases: o.aliases ? o.aliases.split('|').map(s => s.trim()).filter(Boolean) : [],
        emoji: o.emoji,
        category: o.category || 'User',
      })
    }
  }

  // Built-in entries, skipping any shadowed by a user entry with the same name
  if (builtinEnabled) {
    for (const e of EMOJI_ENTRIES) {
      if (!userNames.has(e.name)) result.push(e)
    }
  }

  return result
}
