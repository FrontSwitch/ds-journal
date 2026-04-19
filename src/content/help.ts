export type HelpNode =
  | { type: 'p'; key: string }
  | { type: 'h2'; key: string }
  | { type: 'item'; key: string }
  | { type: 'img'; src: string; altKey?: string }

export interface HelpTopic {
  id: string
  titleKey: string
  nodes: HelpNode[]
}

export interface HelpContent {
  introKey: string
  topics: HelpTopic[]
}

export const help: HelpContent = {
  introKey: 'help.intro',
  topics: [
    {
      id: 'chat',
      titleKey: 'help.chat.title',
      nodes: [
        { type: 'p', key: 'help.chat.p1' },
        { type: 'p', key: 'help.chat.p2' },
        { type: 'p', key: 'help.chat.p3' },
      ],
    },
    {
      id: 'trackers',
      titleKey: 'help.trackers.title',
      nodes: [
        { type: 'p', key: 'help.trackers.p1' },
        { type: 'p', key: 'help.trackers.p2' },
      ],
    },
    {
      id: 'sync',
      titleKey: 'help.sync.title',
      nodes: [
        { type: 'p', key: 'help.sync.p1' },
        { type: 'p', key: 'help.sync.p2' },
      ],
    },
  ],
}
