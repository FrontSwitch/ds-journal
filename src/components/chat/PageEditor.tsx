import { useEffect, useRef, useCallback, useState } from 'react'
import { useEditor, EditorContent, ReactRenderer, Extension } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Mention from '@tiptap/extension-mention'
import Placeholder from '@tiptap/extension-placeholder'
import Suggestion from '@tiptap/suggestion'
import type { SuggestionProps, SuggestionKeyDownProps } from '@tiptap/suggestion'
import type { Avatar } from '../../types'
import { assetUrl, isHidden } from '../../types'
import { getTagSuggestions } from '../../db/tags'
import { getChannels } from '../../db/channels'
import './PageEditor.css'

interface Props {
  channelId: number
  avatars: Avatar[]
  selectedAvatar: Avatar | null
  onPublish: (html: string) => void
  onBack: () => void
  onDiscard: () => void
}

function draftKey(channelId: number) {
  return `dsj-page-draft-${channelId}`
}

function positionEl(el: HTMLElement, props: SuggestionProps) {
  const rect = props.clientRect?.()
  if (!rect) return
  el.style.left = rect.left + 'px'
  el.style.top = (rect.bottom + 4) + 'px'
}

// ── Mention (@avatar) ─────────────────────────────────────────────────────────

interface MentionListProps extends SuggestionProps {
  items: Avatar[]
  selectedIndex: number
}

function MentionList({ items, command, selectedIndex }: MentionListProps) {
  return (
    <div className="page-mention-list">
      {items.length === 0
        ? <div className="page-mention-empty">No avatars</div>
        : items.map((a, i) => (
            <button
              key={a.id}
              className={`page-mention-item${i === selectedIndex ? ' selected' : ''}`}
              onClick={() => command({ id: String(a.id), label: a.name })}
            >
              <span className="page-mention-dot" style={{ background: a.color ?? 'var(--text-muted)' }} />
              {a.name}
            </button>
          ))
      }
    </div>
  )
}

function makeMentionRender() {
  return () => {
    let component: ReactRenderer<typeof MentionList>
    let selectedIndex = 0
    let currentItems: Avatar[] = []
    let currentCommand: SuggestionProps['command'] | null = null

    return {
      onStart(props: SuggestionProps) {
        currentItems = props.items as Avatar[]
        currentCommand = props.command
        selectedIndex = 0
        component = new ReactRenderer(MentionList, {
          props: { ...props, selectedIndex },
          editor: props.editor,
        })
        const el = component.element as HTMLElement
        el.style.position = 'fixed'
        el.style.zIndex = '1000'
        document.body.appendChild(el)
        positionEl(el, props)
      },
      onUpdate(props: SuggestionProps) {
        currentItems = props.items as Avatar[]
        currentCommand = props.command
        selectedIndex = 0
        component.updateProps({ ...props, selectedIndex })
        positionEl(component.element as HTMLElement, props)
      },
      onKeyDown({ event }: SuggestionKeyDownProps) {
        if (event.key === 'ArrowDown') {
          selectedIndex = Math.min(selectedIndex + 1, currentItems.length - 1)
          component.updateProps({ selectedIndex })
          return true
        }
        if (event.key === 'ArrowUp') {
          selectedIndex = Math.max(selectedIndex - 1, 0)
          component.updateProps({ selectedIndex })
          return true
        }
        if (event.key === 'Enter' || event.key === ' ') {
          const item = currentItems[selectedIndex]
          if (item && currentCommand) {
            currentCommand({ id: String(item.id), label: item.name })
            return true
          }
        }
        return false
      },
      onExit() {
        component.destroy()
        component.element.remove()
      },
    }
  }
}

// ── Hashtag (#tag / #channel) ─────────────────────────────────────────────────

interface HashItem { name: string; display_name: string; isChannel: boolean; color?: string | null }

interface HashListProps extends SuggestionProps {
  items: HashItem[]
  selectedIndex: number
}

function HashList({ items, command, selectedIndex }: HashListProps) {
  return (
    <div className="page-mention-list">
      {items.length === 0
        ? <div className="page-mention-empty">No tags</div>
        : items.map((s, i) => (
            <button
              key={s.name}
              className={`page-mention-item${i === selectedIndex ? ' selected' : ''}`}
              onClick={() => command({ id: s.name, label: s.display_name })}
            >
              {s.color != null
                ? <span className="page-mention-dot" style={{ background: s.color }} />
                : <span className="page-hash-prefix">#</span>
              }
              <span>{s.display_name}</span>
              {s.isChannel && <span className="page-hash-badge">channel</span>}
            </button>
          ))
      }
    </div>
  )
}

async function loadHashSuggestions(query: string): Promise<HashItem[]> {
  const lower = query.toLowerCase()
  const [dbTags, channels] = await Promise.all([getTagSuggestions(lower), getChannels()])
  const seen = new Set(dbTags.map(t => t.name))
  const channelItems: HashItem[] = channels
    .filter(c => !isHidden(c.hidden) && c.name.toLowerCase().startsWith(lower) && !seen.has(c.name.toLowerCase()))
    .slice(0, 5)
    .map(c => ({ name: c.name.toLowerCase(), display_name: c.name, isChannel: true }))
  return [
    ...dbTags.map(t => ({ name: t.name, display_name: t.display_name, isChannel: false })),
    ...channelItems,
  ].slice(0, 10)
}

function makeHashRender() {
  return () => {
    let component: ReactRenderer<typeof HashList>
    let selectedIndex = 0
    let currentItems: HashItem[] = []
    let currentCommand: SuggestionProps['command'] | null = null

    return {
      onStart(props: SuggestionProps) {
        currentItems = props.items as HashItem[]
        currentCommand = props.command
        selectedIndex = 0
        component = new ReactRenderer(HashList, {
          props: { ...props, selectedIndex },
          editor: props.editor,
        })
        const el = component.element as HTMLElement
        el.style.position = 'fixed'
        el.style.zIndex = '1000'
        document.body.appendChild(el)
        positionEl(el, props)
      },
      onUpdate(props: SuggestionProps) {
        currentItems = props.items as HashItem[]
        currentCommand = props.command
        selectedIndex = 0
        component.updateProps({ ...props, selectedIndex })
        positionEl(component.element as HTMLElement, props)
      },
      onKeyDown({ event }: SuggestionKeyDownProps) {
        if (event.key === 'ArrowDown') {
          selectedIndex = Math.min(selectedIndex + 1, currentItems.length - 1)
          component.updateProps({ selectedIndex })
          return true
        }
        if (event.key === 'ArrowUp') {
          selectedIndex = Math.max(selectedIndex - 1, 0)
          component.updateProps({ selectedIndex })
          return true
        }
        if (event.key === 'Enter' || event.key === ' ') {
          const item = currentItems[selectedIndex]
          if (item && currentCommand) {
            currentCommand({ id: item.name, label: item.display_name })
            return true
          }
        }
        return false
      },
      onExit() {
        component.destroy()
        component.element.remove()
      },
    }
  }
}

// Custom Extension using raw Suggestion plugin — avoids schema node conflicts
// that occur when extending Mention with a different char.
function makeHashtagExtension() {
  return Extension.create({
    name: 'hashtagSuggestion',
    addProseMirrorPlugins() {
      return [
        Suggestion({
          editor: this.editor,
          char: '#',
          allow: () => true,
          command: ({ editor, range, props }: { editor: ReturnType<typeof useEditor>, range: { from: number; to: number }, props: { id: string; label: string } }) => {
            ;(editor as NonNullable<typeof editor>)!
              .chain()
              .focus()
              .deleteRange(range)
              .insertContent(`#${props.label} `)
              .run()
          },
          items: ({ query }: { query: string }) => loadHashSuggestions(query),
          render: makeHashRender(),
        }),
      ]
    },
  })
}

// ── PageEditor ────────────────────────────────────────────────────────────────

export function PageEditor({ channelId, avatars, selectedAvatar, onPublish, onBack, onDiscard }: Props) {
  const rendererRef = useRef<ReactRenderer | null>(null)
  const [isEmpty, setIsEmpty] = useState(true)
  const [confirmingDiscard, setConfirmingDiscard] = useState(false)

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: 'Write your entry…' }),
      Mention.configure({
        HTMLAttributes: { class: 'page-mention-chip' },
        suggestion: {
          items: ({ query }: { query: string }) =>
            avatars.filter(a => a.name.toLowerCase().startsWith(query.toLowerCase())).slice(0, 8),
          render: makeMentionRender(),
        },
      }),
      makeHashtagExtension(),
    ],
    autofocus: true,
    onUpdate: ({ editor }) => {
      const html = editor.getHTML()
      const empty = html === '<p></p>'
      setIsEmpty(empty)
      if (empty) localStorage.removeItem(draftKey(channelId))
      else localStorage.setItem(draftKey(channelId), html)
    },
  })

  // Restore draft on mount
  useEffect(() => {
    if (!editor) return
    const saved = localStorage.getItem(draftKey(channelId))
    if (saved) {
      editor.commands.setContent(saved)
      setIsEmpty(false)
    }
  }, [editor, channelId])

  useEffect(() => {
    return () => { rendererRef.current?.destroy() }
  }, [])

  const handlePublish = useCallback(() => {
    if (!editor) return
    const html = editor.getHTML()
    if (html === '<p></p>') return
    localStorage.removeItem(draftKey(channelId))
    onPublish(html)
  }, [editor, channelId, onPublish])

  const handleDiscard = useCallback(() => {
    localStorage.removeItem(draftKey(channelId))
    onDiscard()
  }, [channelId, onDiscard])

  return (
    <div className="page-editor-wrap">
      <div className="page-editor-toolbar">
        <button className="page-editor-back" onClick={onBack} title="Back to chat — draft is saved">← Back</button>
        <div className="page-editor-avatar">
          {selectedAvatar?.image_data
            ? <img src={`data:image/png;base64,${selectedAvatar.image_data}`} className="page-editor-avatar-img" alt={selectedAvatar.name} />
            : selectedAvatar?.image_path
            ? <img src={assetUrl(selectedAvatar.image_path)!} className="page-editor-avatar-img" alt={selectedAvatar.name} />
            : <span className="page-editor-avatar-dot" style={{ background: selectedAvatar?.color ?? 'var(--text-muted)' }} />
          }
          <span className="page-editor-avatar-name" style={{ color: selectedAvatar?.color ?? 'var(--text-muted)' }}>
            {selectedAvatar?.name ?? 'anonymous'}
          </span>
        </div>
        <div style={{ flex: 1 }} />
        {!isEmpty && !confirmingDiscard && (
          <button className="page-editor-discard" onClick={() => setConfirmingDiscard(true)}>Discard draft</button>
        )}
        {confirmingDiscard && (
          <span className="page-editor-discard-confirm">
            <span className="page-editor-discard-label">Discard?</span>
            <button className="page-editor-discard-yes" onClick={handleDiscard}>Yes</button>
            <button className="page-editor-discard-no" onClick={() => setConfirmingDiscard(false)}>No</button>
          </span>
        )}
        <button className="page-editor-publish" onClick={handlePublish} disabled={isEmpty}>Publish</button>
      </div>
      <div className="page-editor-scroll">
        <EditorContent editor={editor} className="page-editor-content" />
      </div>
    </div>
  )
}
