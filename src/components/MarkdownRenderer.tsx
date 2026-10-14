import React from 'react'
import { Info, Lightbulb, AlertTriangle, AlertCircle, Copy, Check } from 'lucide-react'

interface MarkdownRendererProps {
  content: string
  onNavigate: (title: string) => void
  onToggleTask?: (taskIndex: number, completed: boolean) => void
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({
  content,
  onNavigate,
  onToggleTask
}) => {
  const [copiedCodeIndex, setCopiedCodeIndex] = React.useState<number | null>(null)

  const copyToClipboard = (text: string, index: number) => {
    navigator.clipboard.writeText(text)
    setCopiedCodeIndex(index)
    setTimeout(() => setCopiedCodeIndex(null), 2000)
  }

  // Parse custom wikilinks [[Title]] or [[Title|Alias]]
  const renderInlineFormatted = (text: string) => {
    const parts: (string | React.ReactNode)[] = []
    let cursor = 0
    const regex = /\[\[(.*?)\]\]/g
    let match

    while ((match = regex.exec(text)) !== null) {
      if (match.index > cursor) {
        parts.push(renderBasicFormatting(text.substring(cursor, match.index)))
      }
      const rawTarget = match[1]
      const [targetName, alias] = rawTarget.split('|')
      const displayName = (alias || targetName).split('#')[0].trim()
      const destination = targetName.split('#')[0].trim()

      parts.push(
        <button
          key={`wikilink-${match.index}`}
          onClick={(e) => {
            e.stopPropagation()
            onNavigate(destination)
          }}
          className="inline-flex items-center gap-1 text-violet-400 hover:text-violet-300 bg-violet-950/40 hover:bg-violet-900/60 border border-violet-800/40 rounded px-1.5 py-0.5 mx-0.5 font-medium transition-colors text-sm"
          title={`Ir para: ${destination}`}
        >
          <span className="text-violet-500 font-bold">[[</span>
          <span>{displayName}</span>
          <span className="text-violet-500 font-bold">]]</span>
        </button>
      )
      cursor = match.index + match[0].length
    }

    if (cursor < text.length) {
      parts.push(renderBasicFormatting(text.substring(cursor)))
    }

    return parts.length > 0 ? parts : text
  }

  // Basic formatting: bold, italic, inline code, tags
  const renderBasicFormatting = (text: string): React.ReactNode => {
    // Tags like #tag
    const tagRegex = /(?:^|\s)(#[a-zA-Z0-9_\u00C0-\u017F-]+)/g
    const chunks = text.split(tagRegex)

    return chunks.map((chunk, i) => {
      if (chunk.startsWith('#') && chunk.length > 1) {
        return (
          <span
            key={i}
            className="inline-block bg-zinc-800/80 text-violet-300 border border-zinc-700/60 px-1.5 py-0.2 rounded text-xs font-mono font-medium mx-0.5 hover:border-violet-500/50 cursor-pointer"
          >
            {chunk}
          </span>
        )
      }

      // Inline code `code`
      if (chunk.includes('`')) {
        const sub = chunk.split(/`([^`]+)`/g)
        return sub.map((s, idx) => {
          if (idx % 2 === 1) {
            return (
              <code key={idx} className="bg-zinc-800 text-amber-300 px-1.5 py-0.5 rounded font-mono text-sm border border-zinc-700/40">
                {s}
              </code>
            )
          }
          return s
        })
      }

      // Bold **bold**
      if (chunk.includes('**')) {
        const sub = chunk.split(/\*\*([^*]+)\*\*/g)
        return sub.map((s, idx) => (idx % 2 === 1 ? <strong key={idx} className="font-semibold text-zinc-100">{s}</strong> : s))
      }

      return chunk
    })
  }

  // Process blocks: Headings, Callouts, Checklists, Code Blocks, Tables
  const lines = content.split('\n')
  const blocks: React.ReactNode[] = []
  let i = 0
  let taskCounter = 0
  let codeBlockCounter = 0

  while (i < lines.length) {
    const line = lines[i]

    // Code block ```
    if (line.trim().startsWith('```')) {
      const lang = line.trim().slice(3).trim()
      const codeLines: string[] = []
      i++
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i])
        i++
      }
      i++ // skip closing ```
      const currentCodeIndex = codeBlockCounter++
      const codeString = codeLines.join('\n')

      blocks.push(
        <div key={`code-${i}`} className="my-4 rounded-lg overflow-hidden border border-zinc-800 bg-zinc-950/80 text-sm font-mono">
          <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-900 border-b border-zinc-800 text-xs text-zinc-400">
            <span className="uppercase font-semibold tracking-wider">{lang || 'código'}</span>
            <button
              onClick={() => copyToClipboard(codeString, currentCodeIndex)}
              className="flex items-center gap-1 hover:text-zinc-200 transition-colors"
            >
              {copiedCodeIndex === currentCodeIndex ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400">Copiado</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copiar</span>
                </>
              )}
            </button>
          </div>
          <pre className="p-4 overflow-x-auto text-zinc-300 leading-relaxed">
            <code>{codeString}</code>
          </pre>
        </div>
      )
      continue
    }

    // Callouts: > [!NOTE], > [!TIP], > [!WARNING], > [!IMPORTANT]
    if (line.trim().startsWith('> [!')) {
      const match = line.trim().match(/> \[!([A-Z]+)\]\s*(.*)/i)
      const calloutType = (match ? match[1] : 'NOTE').toUpperCase()
      const calloutTitle = (match && match[2]) ? match[2].trim() : calloutType
      const calloutLines: string[] = []
      i++
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        calloutLines.push(lines[i].replace(/^>\s?/, ''))
        i++
      }

      let borderColor = 'border-blue-500/60 bg-blue-950/20 text-blue-200'
      let icon = <Info className="w-5 h-5 text-blue-400 shrink-0" />

      if (calloutType === 'TIP') {
        borderColor = 'border-emerald-500/60 bg-emerald-950/20 text-emerald-200'
        icon = <Lightbulb className="w-5 h-5 text-emerald-400 shrink-0" />
      } else if (calloutType === 'WARNING') {
        borderColor = 'border-amber-500/60 bg-amber-950/20 text-amber-200'
        icon = <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
      } else if (calloutType === 'IMPORTANT' || calloutType === 'CAUTION') {
        borderColor = 'border-rose-500/60 bg-rose-950/20 text-rose-200'
        icon = <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
      }

      blocks.push(
        <div key={`callout-${i}`} className={`my-4 p-4 rounded-lg border-l-4 ${borderColor} text-sm space-y-1.5`}>
          <div className="flex items-center gap-2 font-semibold">
            {icon}
            <span>{calloutTitle}</span>
          </div>
          <div className="pl-7 space-y-1 text-zinc-300">
            {calloutLines.map((cl, idx) => (
              <p key={idx}>{renderInlineFormatted(cl)}</p>
            ))}
          </div>
        </div>
      )
      continue
    }

    // Headings H1 - H6
    if (line.startsWith('# ')) {
      blocks.push(
        <h1 key={`h1-${i}`} className="text-3xl font-bold text-zinc-100 mt-6 mb-3 pb-2 border-b border-zinc-800">
          {renderInlineFormatted(line.slice(2))}
        </h1>
      )
      i++
      continue
    }
    if (line.startsWith('## ')) {
      blocks.push(
        <h2 key={`h2-${i}`} className="text-2xl font-semibold text-zinc-100 mt-5 mb-2 pb-1 border-b border-zinc-800/60">
          {renderInlineFormatted(line.slice(3))}
        </h2>
      )
      i++
      continue
    }
    if (line.startsWith('### ')) {
      blocks.push(
        <h3 key={`h3-${i}`} className="text-xl font-semibold text-zinc-200 mt-4 mb-2">
          {renderInlineFormatted(line.slice(4))}
        </h3>
      )
      i++
      continue
    }
    if (line.startsWith('#### ')) {
      blocks.push(
        <h4 key={`h4-${i}`} className="text-lg font-medium text-zinc-300 mt-3 mb-1.5">
          {renderInlineFormatted(line.slice(5))}
        </h4>
      )
      i++
      continue
    }

    // Interactive Checklist items: - [ ] or - [x]
    const taskMatch = line.match(/^(\s*)-\s\[([ xX])\]\s(.*)$/)
    if (taskMatch) {
      const isChecked = taskMatch[2].toLowerCase() === 'x'
      const taskText = taskMatch[3]
      const currentTaskIndex = taskCounter++

      blocks.push(
        <div
          key={`task-${i}`}
          onClick={() => onToggleTask && onToggleTask(currentTaskIndex, !isChecked)}
          className="flex items-start gap-2.5 my-1.5 cursor-pointer group"
        >
          <input
            type="checkbox"
            checked={isChecked}
            readOnly
            className="mt-1 w-4 h-4 rounded border-zinc-700 bg-zinc-800 text-violet-500 focus:ring-violet-400 focus:ring-offset-zinc-900 cursor-pointer"
          />
          <span className={`text-sm ${isChecked ? 'line-through text-zinc-500' : 'text-zinc-300 group-hover:text-zinc-100'}`}>
            {renderInlineFormatted(taskText)}
          </span>
        </div>
      )
      i++
      continue
    }

    // Unordered lists - item
    if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
      const listText = line.trim().replace(/^[-*]\s/, '')
      blocks.push(
        <li key={`li-${i}`} className="text-sm text-zinc-300 ml-5 list-disc my-1 leading-relaxed">
          {renderInlineFormatted(listText)}
        </li>
      )
      i++
      continue
    }

    // Numbered list 1. item
    const numMatch = line.trim().match(/^(\d+)\.\s(.*)$/)
    if (numMatch) {
      blocks.push(
        <li key={`num-${i}`} className="text-sm text-zinc-300 ml-5 list-decimal my-1 leading-relaxed">
          {renderInlineFormatted(numMatch[2])}
        </li>
      )
      i++
      continue
    }

    // Divider ---
    if (line.trim() === '---' || line.trim() === '***') {
      blocks.push(<hr key={`hr-${i}`} className="my-6 border-zinc-800" />)
      i++
      continue
    }

    // Empty line
    if (!line.trim()) {
      blocks.push(<div key={`empty-${i}`} className="h-2" />)
      i++
      continue
    }

    // Standard paragraph
    blocks.push(
      <p key={`p-${i}`} className="text-sm text-zinc-300 leading-relaxed my-2 selectable-text">
        {renderInlineFormatted(line)}
      </p>
    )
    i++
  }

  return <div className="space-y-0.5">{blocks}</div>
}
