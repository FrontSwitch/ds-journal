import type { ReactNode } from 'react'
import type { DocNode } from '../../content/doc'
import './DocRenderer.css'

interface Props {
  nodes: DocNode[]
}

export default function DocRenderer({ nodes }: Props) {
  const rendered: ReactNode[] = []
  let i = 0
  let key = 0

  while (i < nodes.length) {
    const node = nodes[i]

    if (node.type === 'dl') {
      // Group consecutive dl nodes into one <dl> element
      const items: Extract<DocNode, { type: 'dl' }>[] = []
      while (i < nodes.length && nodes[i].type === 'dl') {
        items.push(nodes[i] as Extract<DocNode, { type: 'dl' }>)
        i++
      }
      rendered.push(
        <dl key={key++}>
          {items.map((item, j) => (
            <div key={j} className="doc-dl-row">
              <dt>{item.term}</dt>
              <dd>{item.def}</dd>
            </div>
          ))}
        </dl>
      )
    } else {
      if (node.type === 'h2') rendered.push(<h2 key={key++}>{node.text}</h2>)
      else if (node.type === 'p') rendered.push(<p key={key++}>{node.text}</p>)
      else if (node.type === 'item') rendered.push(<div key={key++} className="doc-item">{node.text}</div>)
      i++
    }
  }

  return <div className="doc-renderer">{rendered}</div>
}
