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

  // Parse inline wikilinks [[Target]] or [[Target|Alias]]
  const renderInlineFormatted = (text: string): React.ReactNode => {
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
          className="inline-flex items-center text-violet-400 hover:text-violet-200 bg-violet-950/40 hover:bg-violet-900/60 border border-violet-800/50 hover:border-violet-600 rounded-md px-1.5 py-0.5 mx-0.5 font-medium transition-all text-xs group shadow-sm cursor-pointer"
          title={`Navegar para nota: ${destination}`}
        >
          <span className="underline decoration-violet-500/40 group-hover:decoration-violet-300 underline-offset-2">{displayName}</span>
        </button>
      )
      cursor = match.index + match[0].length
    }

    if (cursor < text.length) {
      parts.push(renderBasicFormatting(text.substring(cursor)))
    }

    return parts.length > 0 ? parts : text
  }

  // Basic formatting: bold, italic, strikethrough, highlights ==...==, tags, inline math $...$, code `...`
  const renderBasicFormatting = (text: string): React.ReactNode => {
    // 1. Math formulas $formula$
    if (text.includes('$')) {
      const mathParts = text.split(/\$([^$]+)\$/g)
      if (mathParts.length > 1) {
        return mathParts.map((chunk, idx) => {
          if (idx % 2 === 1) {
            return (
              <span
                key={`math-${idx}`}
                className="font-serif italic text-amber-200 bg-amber-950/30 px-1.5 py-0.5 rounded border border-amber-800/40 text-sm tracking-wide"
                title="Fórmula Matemática"
              >
                {chunk}
              </span>
            )
          }
          return renderBasicFormatting(chunk)
        })
      }
    }

    // 2. Highlights ==destaque==
    if (text.includes('==')) {
      const hlParts = text.split(/==([^=]+)==/g)
      if (hlParts.length > 1) {
        return hlParts.map((chunk, idx) => {
          if (idx % 2 === 1) {
            return (
              <mark
                key={`hl-${idx}`}
                className="bg-amber-400/25 text-amber-200 px-1 py-0.5 rounded font-normal border-b border-amber-400/50"
              >
                {chunk}
              </mark>
            )
          }
          return renderBasicFormatting(chunk)
        })
      }
    }

    // 3. Tags like #tag
    const tagRegex = /(?:^|\s)(#[a-zA-Z0-9_\u00C0-\u017F-]+)/g
    const chunks = text.split(tagRegex)

    return chunks.map((chunk, i) => {
      if (chunk.startsWith('#') && chunk.length > 1) {
        return (
          <span
            key={`tag-${i}`}
            className="inline-block bg-violet-950/50 text-violet-300 border border-violet-800/40 px-2 py-0.5 rounded-full text-xs font-mono font-medium mx-0.5 hover:border-violet-500 hover:text-violet-200 cursor-pointer transition-colors shadow-sm"
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
              <code key={idx} className="bg-zinc-800/90 text-amber-300 px-1.5 py-0.5 rounded font-mono text-xs border border-zinc-700/60 shadow-inner">
                {s}
              </code>
            )
          }
          return s
        })
      }

      // Strikethrough ~~strike~~
      if (chunk.includes('~~')) {
        const sub = chunk.split(/~~([^~]+)~~/g)
        if (sub.length > 1) {
          return sub.map((s, idx) => (idx % 2 === 1 ? <del key={idx} className="line-through text-zinc-500">{s}</del> : s))
        }
      }

      // Bold **bold**
      if (chunk.includes('**')) {
        const sub = chunk.split(/\*\*([^*]+)\*\*/g)
        return sub.map((s, idx) => (idx % 2 === 1 ? <strong key={idx} className="font-semibold text-zinc-100">{s}</strong> : s))
      }

      // Italic *italic* or _italic_
      if (chunk.includes('*')) {
        const sub = chunk.split(/\*([^*]+)\*/g)
        return sub.map((s, idx) => (idx % 2 === 1 ? <em key={idx} className="italic text-zinc-200">{s}</em> : s))
      }

      return chunk
    })
  }

  // Parse lines into blocks
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
        <div key={`code-${i}`} className="my-4 rounded-xl overflow-hidden border border-zinc-800 bg-zinc-950/90 text-xs font-mono shadow-lg">
          <div className="flex items-center justify-between px-3.5 py-2 bg-zinc-900 border-b border-zinc-800 text-xs text-zinc-400">
            <span className="uppercase font-semibold tracking-wider text-[11px] text-zinc-300 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-violet-500" />
              {lang || 'código'}
            </span>
            <button
              onClick={() => copyToClipboard(codeString, currentCodeIndex)}
              className="flex items-center gap-1 px-2 py-0.5 rounded hover:bg-zinc-800 text-zinc-300 hover:text-zinc-100 transition-colors"
            >
              {copiedCodeIndex === currentCodeIndex ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400 text-[11px]">Copiado</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span className="text-[11px]">Copiar</span>
                </>
              )}
            </button>
          </div>
          <pre className="p-4 overflow-x-auto text-zinc-300 leading-relaxed selectable-text">
            <code>{codeString}</code>
          </pre>
        </div>
      )
      continue
    }

    // Math block $$...$$
    if (line.trim().startsWith('$$')) {
      const mathLines: string[] = []
      i++
      while (i < lines.length && !lines[i].trim().startsWith('$$')) {
        mathLines.push(lines[i])
        i++
      }
      i++ // skip closing $$
      const mathString = mathLines.join('\n')

      blocks.push(
        <div key={`math-block-${i}`} className="my-4 p-4 rounded-xl border border-amber-800/30 bg-amber-950/20 text-center font-serif text-lg text-amber-200 shadow-md">
          {mathString}
        </div>
      )
      continue
    }

    // Markdown Table detection: | header1 | header2 |
    if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
      const tableLines: string[] = []
      while (i < lines.length && lines[i].trim().startsWith('|') && lines[i].trim().endsWith('|')) {
        tableLines.push(lines[i].trim())
        i++
      }

      if (tableLines.length >= 2) {
        const headerRow = tableLines[0].split('|').slice(1, -1).map(c => c.trim())
        const dataRows = tableLines.slice(2).map(row => row.split('|').slice(1, -1).map(c => c.trim()))

        blocks.push(
          <div key={`table-${i}`} className="my-5 overflow-x-auto rounded-xl border border-zinc-800 shadow-md">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-zinc-900 border-b border-zinc-800 text-zinc-200">
                  {headerRow.map((col, idx) => (
                    <th key={idx} className="px-4 py-2.5 font-semibold">
                      {renderInlineFormatted(col)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {dataRows.map((row, rIdx) => (
                  <tr key={rIdx} className="hover:bg-zinc-900/50 transition-colors odd:bg-zinc-950 even:bg-zinc-900/30">
                    {row.map((cell, cIdx) => (
                      <td key={cIdx} className="px-4 py-2 text-zinc-300">
                        {renderInlineFormatted(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
        continue
      }
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
      let icon = <Info className="w-4 h-4 text-blue-400 shrink-0" />

      if (calloutType === 'TIP') {
        borderColor = 'border-emerald-500/60 bg-emerald-950/20 text-emerald-200'
        icon = <Lightbulb className="w-4 h-4 text-emerald-400 shrink-0" />
      } else if (calloutType === 'WARNING') {
        borderColor = 'border-amber-500/60 bg-amber-950/20 text-amber-200'
        icon = <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
      } else if (calloutType === 'IMPORTANT' || calloutType === 'CAUTION') {
        borderColor = 'border-rose-500/60 bg-rose-950/20 text-rose-200'
        icon = <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
      }

      blocks.push(
        <div key={`callout-${i}`} className={`my-4 p-3.5 rounded-xl border-l-4 ${borderColor} text-xs space-y-1.5 shadow-sm`}>
          <div className="flex items-center gap-2 font-semibold">
            {icon}
            <span>{calloutTitle}</span>
          </div>
          <div className="pl-6 space-y-1 text-zinc-300">
            {calloutLines.map((cl, idx) => (
              <p key={idx}>{renderInlineFormatted(cl)}</p>
            ))}
          </div>
        </div>
      )
      continue
    }

    // Standard blockquote: > text
    if (line.trim().startsWith('> ') && !line.trim().startsWith('> [!')) {
      const quoteLines: string[] = []
      while (i < lines.length && lines[i].trim().startsWith('> ') && !lines[i].trim().startsWith('> [!')) {
        quoteLines.push(lines[i].replace(/^>\s?/, ''))
        i++
      }
      blocks.push(
        <blockquote key={`quote-${i}`} className="my-3 pl-4 border-l-2 border-violet-500/80 italic text-zinc-400 text-xs py-0.5">
          {quoteLines.map((ql, qIdx) => (
            <p key={qIdx}>{renderInlineFormatted(ql)}</p>
          ))}
        </blockquote>
      )
      continue
    }

    // Headings H1 - H6
    if (line.startsWith('# ')) {
      blocks.push(
        <h1 key={`h1-${i}`} className="text-2xl font-bold text-zinc-100 mt-6 mb-3 pb-2 border-b border-zinc-800 tracking-tight">
          {renderInlineFormatted(line.slice(2))}
        </h1>
      )
      i++
      continue
    }
    if (line.startsWith('## ')) {
      blocks.push(
        <h2 key={`h2-${i}`} className="text-xl font-semibold text-zinc-100 mt-5 mb-2 pb-1 border-b border-zinc-800/60 tracking-tight">
          {renderInlineFormatted(line.slice(3))}
        </h2>
      )
      i++
      continue
    }
    if (line.startsWith('### ')) {
      blocks.push(
        <h3 key={`h3-${i}`} className="text-lg font-semibold text-zinc-200 mt-4 mb-2 tracking-tight">
          {renderInlineFormatted(line.slice(4))}
        </h3>
      )
      i++
      continue
    }
    if (line.startsWith('#### ')) {
      blocks.push(
        <h4 key={`h4-${i}`} className="text-base font-medium text-zinc-300 mt-3 mb-1.5">
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
          className="flex items-start gap-2.5 my-1.5 cursor-pointer group select-none"
        >
          <input
            type="checkbox"
            checked={isChecked}
            readOnly
            className="task-checkbox mt-0.5 w-4 h-4 cursor-pointer"
          />
          <span className={`text-xs ${isChecked ? 'line-through text-zinc-500' : 'text-zinc-300 group-hover:text-zinc-100'} transition-colors`}>
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
        <li key={`li-${i}`} className="text-xs text-zinc-300 ml-5 list-disc my-1 leading-relaxed">
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
        <li key={`num-${i}`} className="text-xs text-zinc-300 ml-5 list-decimal my-1 leading-relaxed">
          {renderInlineFormatted(numMatch[2])}
        </li>
      )
      i++
      continue
    }

    // Divider ---
    if (line.trim() === '---' || line.trim() === '***') {
      blocks.push(<hr key={`hr-${i}`} className="my-5 border-zinc-800" />)
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
      <p key={`p-${i}`} className="text-xs text-zinc-300 leading-relaxed my-2 selectable-text">
        {renderInlineFormatted(line)}
      </p>
    )
    i++
  }

  return <div className="space-y-0.5 pb-8">{blocks}</div>
}
