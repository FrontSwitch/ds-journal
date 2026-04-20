import { useEffect, useMemo } from 'react'
import { useAutocomplete } from './useAutocomplete'

export interface SlashCommand {
  name: string
  usage: string   // full usage string including /<name>
  desc: string
}

export const SLASH_COMMANDS: SlashCommand[] = [
  { name: 'who',      usage: '/who @<name>',             desc: 'Set current avatar' },
  { name: 'channel',  usage: '/channel #<name>',          desc: 'Switch to channel' },
  { name: 'avatar',   usage: '/avatar @<name>',           desc: 'Open avatar info panel' },
  { name: 'note',     usage: '/note @<name>',             desc: 'New note for avatar' },
  { name: 'tracker',  usage: '/tracker #<name>',          desc: 'New record for tracker' },
  { name: 'report',   usage: '/report #<name>',           desc: 'Open tracker report' },
  { name: 'front',    usage: '/front [add|remove] @<name> | clear | ?', desc: 'Manage who is fronting' },
  { name: 'roll',     usage: '/roll <sides> [x <count>]', desc: 'Roll dice  e.g. /roll 6 6 20' },
  { name: 'lottery',  usage: '/lottery <max> x <count>',  desc: 'Pick unique numbers' },
  { name: 'tarot',   usage: '/tarot [count]',            desc: 'Draw tarot cards' },
  { name: 'album',    usage: '/album',                              desc: 'Open image album' },
  { name: 'date',     usage: '/date <YYYY-MM-DD | today | yesterday>', desc: 'Jump to date' },
  { name: 'last',     usage: '/last',                     desc: 'Jump to latest messages' },
  { name: 'search',   usage: '/search <query>',           desc: 'Search messages' },
  { name: 'settings', usage: '/settings [page]',          desc: 'Open settings' },
  { name: 'seed',     usage: '/seed [count]',             desc: 'Seed DB with test avatars + messages (default 200)' },
  { name: 'debug',    usage: '/debug',                    desc: 'Toggle debug panel' },
  { name: 'bot',      usage: '/bot <name> | off | hide | show', desc: 'Enable/disable journaling bot' },
  { name: 'write',    usage: '/write <n> minutes | <n> words | stop', desc: 'Start/stop a timed writing session' },
]

// Settings subpage aliases
export const SETTINGS_PAGES: Record<string, string> = {
  avatars:     'avatars',
  avatar:      'avatars',
  fields:      'avatarFields',
  avatarfields:'avatarFields',
  groups:      'groups',
  channels:    'channels',
  trackers:    'trackers',
  tracker:     'trackers',
  tags:        'tags',
  shortcodes:  'shortcodes',
  emoji:       'shortcodes',
  config:      'config',
  settings:    'config',
  backup:      'backup',
  import:      'import',
}

export interface ParsedSlashCmd {
  name: string
  args: string
}

export function useSlashInput(text: string) {
  // Active only while still typing the command word (no space yet)
  const isTypingCmd = text.startsWith('/') && !text.includes(' ')
  const fragment = isTypingCmd ? text.slice(1).toLowerCase() : ''

  const suggestions = useMemo(
    () => SLASH_COMMANDS.filter(c => c.name.startsWith(fragment)),
    [fragment]
  )

  const { selectedIndex, reset, moveUp, moveDown } = useAutocomplete(suggestions, true)

  // Reset selection when the fragment changes
  useEffect(() => { reset() }, [fragment])

  const isOpen = isTypingCmd && suggestions.length > 0

  const parsedCmd = useMemo((): ParsedSlashCmd | null => {
    if (!text.startsWith('/')) return null
    const space = text.indexOf(' ')
    if (space === -1) return { name: text.slice(1).toLowerCase(), args: '' }
    return { name: text.slice(1, space).toLowerCase(), args: text.slice(space + 1).trim() }
  }, [text])

  /** Returns the completed command string (with trailing space), or null if nothing to complete. */
  function accept(): string | null {
    if (!isOpen || suggestions.length === 0) return null
    return '/' + suggestions[selectedIndex].name + ' '
  }

  return { isOpen, suggestions, selectedIndex, parsedCmd, moveUp, moveDown, accept }
}
