import type { DocNode } from './doc'

const credits: DocNode[] = [
  { type: 'h2', text: 'Built by' },
  { type: 'dl', term: 'Front Switch Studio', def: 'Creator and Lead Developer' },

  { type: 'h2', text: 'Built with' },
  { type: 'dl', term: 'Claude (Anthropic)', def: 'Code and conversation' },
  { type: 'dl', term: 'Tauri', def: 'Desktop app framework' },
  { type: 'dl', term: 'React + TypeScript', def: 'UI' },
  { type: 'dl', term: 'SQLCipher', def: 'Local encrypted database' },
  { type: 'dl', term: 'Vite', def: 'Build tooling' },
  { type: 'dl', term: 'Zustand', def: 'State management' },

  { type: 'h2', text: 'Inspired by' },
  { type: 'dl', term: 'Simply Plural and the community it served', def:'' },

  { type: 'h2', text: 'Theme' },
  { type: 'dl', term: 'Catppuccin Mocha', def: 'Color palette' },

  { type: 'h2', text: 'Art' },
  { type: 'dl', term: 'Kenney Animal Pack', def: 'Avatar images · CC0 1.0 · kenney.nl' },
]

export default credits
