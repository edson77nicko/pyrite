import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useImperativeHandle
} from 'react'
import { createPortal } from 'react-dom'
import { EditableTable } from './EditableTable'
import { EditableCodeBlock } from './EditableCodeBlock'
import { EditableCallout } from './EditableCallout'
import { EditorInlineAiModal } from './EditorInlineAiModal'
import { EditorBlockGutter } from './EditorBlockGutter'
import { EditorBlockComments } from './EditorBlockComments'
import { parseCodeInfo, serializeCodeBlock, serializeCallout } from '../utils/editorBlocks'
import type { CodeBlockData, CalloutData } from '../utils/editorBlocks'
import { ensureEditorLandingZones, exitEditorBlock, focusBlankEditorLine, insertEditorBlock } from '../utils/editorSurface'
import { DEFAULT_TABLE, TABLE_METADATA } from '../utils/markdownTable'
import type { Note } from '../types'
import {
  Heading1,
  Heading2,
  Heading3,
  ListTodo,
  List,
  ListOrdered,
  Table as TableIcon,
  Sparkles,
  Link2,
  Divide,
  Code,
  FileText,
  Bold,
  Italic,
  Highlighter,
  Strikethrough,
  Info,
  AlertTriangle,
  MessageSquareText,
  X
} from 'lucide-react'
import type { LiveBlock } from '../utils/markdownBlocks'
import { renderArtifactHtml } from '../utils/artifactParser'

export interface LivePreviewEditorHandle {
  setBlockType: (type: LiveBlock['type']) => void
  toggleBold: () => void
  toggleItalic: () => void
  insertWikiLink: (target: string) => void
  insertCodeBlock: () => void
  insertCallout: (type: string) => void
  insertTable: () => void
  focus?: () => void
  scrollToBlock?: (blockIndex: number, snippet?: string) => void
}

export interface LivePreviewEditorProps {
  note: Note
  allNotes: Note[]
  displayMode: 'live' | 'reading'
  onUpdateContent: (content: string) => void
  onNavigate: (title: string) => void
  fontSizeClass?: string
  editorRef?: React.Ref<LivePreviewEditorHandle>
}

interface SlashCommandItem {
  id: string
  title: string
  icon: React.ReactNode
  keywords: string[]
}

const SLASH_COMMANDS: SlashCommandItem[] = [
  {
    id: 'ai',
    title: 'Perguntar à IA / Gerar Texto',
    icon: <Sparkles className="w-3.5 h-3.5 text-amber-400" />,
    keywords: ['ai', 'ia', 'inteligencia', 'gerar', 'escrever', 'ask', 'prompt', 'gemini']
  },
  {
    id: 'h1',
    title: 'Título 1',
    icon: <Heading1 className="w-3.5 h-3.5" />,
    keywords: ['h1', 'titulo', 'header']
  },
  {
    id: 'h2',
    title: 'Título 2',
    icon: <Heading2 className="w-3.5 h-3.5" />,
    keywords: ['h2', 'subtitulo', 'header']
  },
  {
    id: 'h3',
    title: 'Título 3',
    icon: <Heading3 className="w-3.5 h-3.5" />,
    keywords: ['h3', 'secao', 'header']
  },
  {
    id: 'task',
    title: 'Lista de Tarefas',
    icon: <ListTodo className="w-3.5 h-3.5" />,
    keywords: ['todo', 'task', 'checklist', 'tarefa']
  },
  {
    id: 'bullet',
    title: 'Lista com Marcadores',
    icon: <List className="w-3.5 h-3.5" />,
    keywords: ['bullet', 'lista', 'topicos']
  },
  {
    id: 'number',
    title: 'Lista Numerada',
    icon: <ListOrdered className="w-3.5 h-3.5" />,
    keywords: ['number', 'numero', 'ordenada']
  },
  {
    id: 'quote',
    title: 'Citação',
    icon: <Sparkles className="w-3.5 h-3.5" />,
    keywords: ['quote', 'citacao', 'frase']
  },
  {
    id: 'table',
    title: 'Tabela',
    icon: <TableIcon className="w-3.5 h-3.5" />,
    keywords: ['tabela', 'table', 'grade']
  },
  {
    id: 'code',
    title: 'Bloco de Código',
    icon: <Code className="w-3.5 h-3.5" />,
    keywords: ['code', 'codigo', 'script']
  },
  {
    id: 'callout-note',
    title: 'Callout de Nota',
    icon: <Info className="w-3.5 h-3.5" />,
    keywords: ['callout', 'nota', 'info']
  },
  {
    id: 'callout-tip',
    title: 'Callout de Dica',
    icon: <Sparkles className="w-3.5 h-3.5" />,
    keywords: ['tip', 'dica', 'verde']
  },
  {
    id: 'callout-warning',
    title: 'Callout de Aviso',
    icon: <AlertTriangle className="w-3.5 h-3.5" />,
    keywords: ['warning', 'aviso', 'alerta']
  },
  {
    id: 'hr',
    title: 'Linha Divisória',
    icon: <Divide className="w-3.5 h-3.5" />,
    keywords: ['hr', 'linha', 'divisoria']
  },
  {
    id: 'wikilink',
    title: 'Link Bidirecional',
    icon: <Link2 className="w-3.5 h-3.5" />,
    keywords: ['link', 'wikilink', 'conectar']
  }
]

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function formatInlineHtml(text: string, allNotes: Note[] = []): string {
  if (!text) return ''

  const tokenRegex = /(\[\[[^\[\]\r\n]+\]\]|!\[[^\]\r\n]*\]\([^\)\r\n]+\)|\[[^\[\]\r\n]+\]\([^\)\r\n]+\)|\*\*[^\*\r\n]+\*\*|==[^=\r\n]+==|~~[^~\r\n]+~~|`[^`\r\n]+`|\*[^\*\r\n]+\*)/g
  const parts = text.split(tokenRegex)

  return parts.map(part => {
    if (!part) return ''

    // 1. Wikilinks [[Target]] or [[Target|Alias]]
    if (part.startsWith('[[') && part.endsWith(']]') && part.length >= 4) {
      const inner = part.slice(2, -2)
      const [target, alias] = inner.split(/\\?\|/)
      const destination = target.split('#')[0].replace(/[\[\]]/g, '').trim()
      const displayName = (alias || target).split('#')[0].replace(/[\[\]]/g, '').trim()
      const exists = allNotes.some(n => n.title.toLowerCase().trim() === destination.toLowerCase().trim())

      const pillClass = exists
        ? 'wiki-link-exists text-[var(--accent)] hover:opacity-90 bg-[var(--accent-glow-subtle)] border border-[var(--accent)]/30'
        : 'wiki-link-unresolved text-zinc-400 hover:text-zinc-200 bg-zinc-800/60 hover:bg-zinc-800 border border-dashed border-zinc-700/80'

      return `<span class="wiki-link ${exists ? 'wiki-link-exists' : 'wiki-link-unresolved'} inline-flex items-center cursor-pointer font-medium select-none rounded px-1.5 py-0 mx-0.5 text-xs transition-colors shadow-sm ${pillClass}" contenteditable="false" data-wiki="${escapeHtml(destination)}" ${alias && alias !== destination ? `data-alias="${escapeHtml(alias)}"` : ''} title="${exists ? `Abrir nota: &quot;${destination}&quot; (Botão direito para editar)` : `Criar nota: &quot;${destination}&quot; (Botão direito para editar)`}"><span class="underline ${exists ? 'decoration-[var(--accent)]/40 hover:decoration-[var(--accent)]' : 'decoration-zinc-500/50 hover:decoration-zinc-400'} underline-offset-2">${escapeHtml(displayName)}</span></span>`
    }

    // 2. Markdown Image ![alt](src)
    if (part.startsWith('![') && part.includes('](') && part.endsWith(')')) {
      const match = part.match(/^!\[(.*?)\]\((.+)\)$/)
      if (match) {
        const alt = match[1] || 'imagem'
        const src = match[2]
        return `<img src="${src}" alt="${escapeHtml(alt)}" class="rounded-xl max-w-full my-3 shadow-md border border-zinc-800" />`
      }
    }

    // 3. Markdown Standard Link [text](url)
    if (part.startsWith('[') && !part.startsWith('[[') && part.includes('](') && part.endsWith(')')) {
      const match = part.match(/^\[(.*?)\]\((.+)\)$/)
      if (match) {
        const linkText = match[1]
        const href = match[2]
        return `<a href="${href}" target="_blank" rel="noopener noreferrer" class="text-[var(--accent)] hover:underline underline-offset-2 font-medium">${escapeHtml(linkText)}</a>`
      }
    }

    // 4. Bold **text**
    if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
      return `<strong class="font-semibold text-zinc-100">${escapeHtml(part.slice(2, -2))}</strong>`
    }

    // 5. Highlight ==text==
    if (part.startsWith('==') && part.endsWith('==') && part.length >= 4) {
      return `<mark class="bg-[var(--accent-glow)] text-[var(--accent)] px-1 py-0.5 rounded font-normal">${escapeHtml(part.slice(2, -2))}</mark>`
    }

    // 6. Strikethrough ~~text~~
    if (part.startsWith('~~') && part.endsWith('~~') && part.length >= 4) {
      return `<del class="line-through text-zinc-500">${escapeHtml(part.slice(2, -2))}</del>`
    }

    // 7. Code `text`
    if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
      return `<code class="bg-zinc-800 text-[var(--accent)] px-1 py-0.5 rounded font-mono text-xs">${escapeHtml(part.slice(1, -1))}</code>`
    }

    // 8. Italic *text*
    if (part.startsWith('*') && part.endsWith('*') && part.length >= 2) {
      return `<em class="italic text-zinc-200">${escapeHtml(part.slice(1, -1))}</em>`
    }

    return escapeHtml(part)
  }).join('')
}

export function stripDuplicateTitleFromContent(content: string, title?: string): string {
  if (!title) return content
  const trimmed = content.trimStart()
  if (!trimmed.startsWith('# ')) return content

  const firstLineEnd = trimmed.indexOf('\n')
  const firstLine = firstLineEnd === -1 ? trimmed : trimmed.slice(0, firstLineEnd)
  const headingText = firstLine.slice(2).trim()

  const normalize = (s: string) =>
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\w\s]/gi, '')
      .replace(/\s+/g, ' ')
      .trim()

  const normHeading = normalize(headingText)
  const normTitle = normalize(title)

  if (
    normHeading === normTitle ||
    normHeading.startsWith(normTitle) ||
    normTitle.startsWith(normHeading)
  ) {
    return firstLineEnd === -1 ? '' : trimmed.slice(firstLineEnd).trimStart()
  }

  return content
}

function tableShell(markdown: string): string {
  return `<div class="table-wrapper my-4" contenteditable="false" data-raw-table="${encodeURIComponent(markdown)}"><div data-table-host>Carregando tabela…</div></div>`
}

function codeShell(block: CodeBlockData): string {
  return `<div class="code-block-wrapper my-4" contenteditable="false" data-raw-code="${encodeURIComponent(block.content)}" data-code-lang="${escapeHtml(block.language)}" data-code-title="${encodeURIComponent(block.title)}"><div data-code-host>Carregando código…</div></div>`
}

function calloutShell(block: CalloutData): string {
  return `<div class="callout-wrapper my-4" contenteditable="false" data-type="callout" data-callout-type="${escapeHtml(block.type)}" data-callout-title="${encodeURIComponent(block.title)}" data-raw-callout="${encodeURIComponent(block.content)}"><div data-callout-host>Carregando destaque…</div></div>`
}

interface EmbeddedHost {
  kind: 'table' | 'code' | 'callout'
  host: HTMLElement
  wrapper: HTMLElement
  id: string
}

function markdownToHtml(md: string, allNotes: Note[], noteTitle?: string): string {
  const cleanMd = stripDuplicateTitleFromContent(md, noteTitle)
  if (!cleanMd.trim()) {
    return '<p class="my-0.5 text-zinc-300 leading-[1.5]"><br></p>'
  }

  const lines = cleanMd.split('\n')
  const htmlParts: string[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    const tick = String.fromCharCode(96)
    const fence = line.trim().match(new RegExp('^(' + tick + '{3,})(.*)$'))
    if (fence) {
      const info = parseCodeInfo(fence[2].trim())
      const closing = new RegExp('^' + tick + '{' + fence[1].length + ',}\\s*$')
      const codeLines: string[] = []
      i++
      while (i < lines.length && !closing.test(lines[i].trim())) codeLines.push(lines[i++])
      if (i < lines.length) i++
      htmlParts.push(codeShell({ ...info, content: codeLines.join('\n') }))
      continue
    }

    // Declarative Artifact Components :::kpi, :::timeline, :::comparison, :::card
    if (line.trim().startsWith(':::')) {
      const directiveHeader = line.trim()
      const blockLines: string[] = []
      i++
      while (i < lines.length && !lines[i].trim().startsWith(':::')) {
        blockLines.push(lines[i])
        i++
      }
      i++ // skip closing :::
      htmlParts.push(renderArtifactHtml(directiveHeader, blockLines))
      continue
    }

    // Markdown Table
    if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
      const tableLines: string[] = []
      while (i < lines.length && lines[i].trim().startsWith('|') && lines[i].trim().endsWith('|')) {
        tableLines.push(lines[i].trim())
        i++
      }
      if (i < lines.length && TABLE_METADATA.test(lines[i].trim())) tableLines.push(lines[i++].trim())
      htmlParts.push(tableShell(tableLines.join('\n')))
      continue
    }

    // Callout > [!NOTE]
    if (line.trim().startsWith('> [!')) {
      const match = line.trim().match(/> \[!([A-Z]+)\]\s*(.*)/i)
      const calloutType = (match ? match[1] : 'NOTE').toUpperCase()
      const title = match && match[2] ? match[2].trim() : ''
      const calloutLines: string[] = []
      i++
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        calloutLines.push(lines[i].replace(/^>\s?/, ''))
        i++
      }
      htmlParts.push(calloutShell({ type: calloutType, title, content: calloutLines.join('\n') }))
      continue
    }

    // Blockquote >
    if (line.trim().startsWith('> ') && !line.trim().startsWith('> [!')) {
      const quoteLines: string[] = []
      while (i < lines.length && lines[i].trim().startsWith('> ') && !lines[i].trim().startsWith('> [!')) {
        quoteLines.push(lines[i].replace(/^>\s?/, ''))
        i++
      }
      htmlParts.push(`
        <blockquote class="my-3 pl-4 border-l-2 border-amber-500/80 italic text-zinc-400 text-xs py-0.5">
          ${quoteLines.map(ql => `<p class="my-0.5">${formatInlineHtml(ql, allNotes)}</p>`).join('')}
        </blockquote>
      `)
      continue
    }

    // Headings
    if (line.startsWith('# ')) {
      htmlParts.push(`<h1 class="text-2xl font-serif font-bold text-zinc-100 my-3 pb-1 border-b border-zinc-800/60 tracking-tight">${formatInlineHtml(line.slice(2), allNotes)}</h1>`)
      i++
      continue
    }
    if (line.startsWith('## ')) {
      htmlParts.push(`<h2 class="text-xl font-serif font-semibold text-zinc-200 mt-6 mb-2 tracking-tight">${formatInlineHtml(line.slice(3), allNotes)}</h2>`)
      i++
      continue
    }
    if (line.startsWith('### ')) {
      htmlParts.push(`<h3 class="text-lg font-serif font-medium text-zinc-200 mt-4 mb-1.5 tracking-tight">${formatInlineHtml(line.slice(4), allNotes)}</h3>`)
      i++
      continue
    }
    if (line.startsWith('#### ')) {
      htmlParts.push(`<h4 class="text-base font-serif font-medium text-zinc-300 mt-3 mb-1 tracking-tight">${formatInlineHtml(line.slice(5), allNotes)}</h4>`)
      i++
      continue
    }

    // Image line ![alt](url)
    const imgLineMatch = line.trim().match(/^!\[(.*?)\]\((.+)\)$/)
    if (imgLineMatch) {
      const alt = imgLineMatch[1] || 'imagem'
      const src = imgLineMatch[2]
      htmlParts.push(`
        <div class="image-wrapper my-4 rounded-xl overflow-hidden border border-zinc-800 bg-zinc-950/40 p-1 shadow-md inline-block max-w-full" contenteditable="false" data-raw-img="${encodeURIComponent(src)}" data-img-alt="${escapeHtml(alt)}">
          <img src="${src}" alt="${escapeHtml(alt)}" class="rounded-lg max-h-[500px] object-contain w-auto mx-auto" />
        </div>
      `)
      i++
      continue
    }

    // Interactive Task Checklist
    const taskMatch = line.match(/^(\s*)-\s\[([ xX])\]\s(.*)$/)
    if (taskMatch) {
      const isChecked = taskMatch[2].toLowerCase() === 'x'
      const taskText = taskMatch[3]
      htmlParts.push(`
        <div class="task-item flex items-start gap-2.5 my-1.5 group" data-type="task">
          <input type="checkbox" ${isChecked ? 'checked' : ''} contenteditable="false" class="task-checkbox mt-1 w-4 h-4 cursor-pointer shrink-0 select-none" />
          <span class="task-text flex-1 text-[13px] md:text-sm leading-relaxed ${isChecked ? 'line-through text-zinc-500' : 'text-zinc-200'}">${formatInlineHtml(taskText, allNotes) || '<br>'}</span>
        </div>
      `)
      i++
      continue
    }

    // Bullet List
    if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
      const listItems: string[] = []
      while (i < lines.length && (lines[i].trim().startsWith('- ') || lines[i].trim().startsWith('* '))) {
        listItems.push(lines[i].trim().replace(/^[-*]\s/, ''))
        i++
      }
      htmlParts.push(`
        <ul class="list-disc pl-5 my-1.5 space-y-0.5 text-zinc-300">
          ${listItems.map(item => `<li>${formatInlineHtml(item, allNotes)}</li>`).join('')}
        </ul>
      `)
      continue
    }

    // Numbered List
    const numMatch = line.trim().match(/^(\d+)\.\s(.*)$/)
    if (numMatch) {
      const listItems: string[] = []
      while (i < lines.length && lines[i].trim().match(/^(\d+)\.\s(.*)$/)) {
        listItems.push(lines[i].trim().replace(/^(\d+)\.\s/, ''))
        i++
      }
      htmlParts.push(`
        <ol class="list-decimal pl-5 my-1.5 space-y-0.5 text-zinc-300">
          ${listItems.map(item => `<li>${formatInlineHtml(item, allNotes)}</li>`).join('')}
        </ol>
      `)
      continue
    }

    // Horizontal Rule
    if (line.trim() === '---' || line.trim() === '***') {
      htmlParts.push(`<hr class="my-5 border-zinc-800" contenteditable="false" />`)
      i++
      continue
    }

    // Empty line
    if (!line.trim()) {
      htmlParts.push(`<p class="my-0.5 text-zinc-300 leading-[1.5]"><br></p>`)
      i++
      continue
    }

    // Standard Paragraph
    htmlParts.push(`<p class="my-0.5 text-zinc-300 leading-[1.5]">${formatInlineHtml(line, allNotes)}</p>`)
    i++
  }

  return htmlParts.join('\n')
}

function domToMarkdown(root: HTMLElement): string {
  const lines: string[] = []

  function serializeInline(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent || ''
    }

    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement

      // Wikilink chip
      if (el.classList.contains('wiki-link') || el.hasAttribute('data-wiki')) {
        const dest = el.getAttribute('data-wiki') || el.textContent || ''
        const alias = el.getAttribute('data-alias') || ''
        return alias && alias !== dest ? `[[${dest}|${alias}]]` : `[[${dest}]]`
      }

      const tag = el.tagName.toLowerCase()

      // Images (image-wrapper or img)
      if (tag === 'img' || el.classList.contains('image-wrapper')) {
        const img = tag === 'img' ? (el as HTMLImageElement) : el.querySelector('img')
        const src = img?.getAttribute('src') || decodeURIComponent(el.getAttribute('data-raw-img') || '')
        const alt = img?.getAttribute('alt') || el.getAttribute('data-img-alt') || 'imagem'
        return src ? `![${alt}](${src})` : ''
      }

      // Links
      if (tag === 'a') {
        const href = el.getAttribute('href') || ''
        const text = Array.from(el.childNodes).map(serializeInline).join('')
        return href ? `[${text || href}](${href})` : text
      }

      if (tag === 'br') {
        return ''
      }

      const style = el.getAttribute('style') || ''
      const isBold = tag === 'strong' || tag === 'b' || /font-weight:\s*(bold|[6-9]00)/i.test(style)
      const isItalic = tag === 'em' || tag === 'i' || /font-style:\s*italic/i.test(style)
      const isMark = tag === 'mark' || /background-color/i.test(style)
      const isStrike = tag === 'del' || tag === 's' || tag === 'strike' || /line-through/i.test(style)
      const isCode = tag === 'code'

      let inner = Array.from(el.childNodes).map(serializeInline).join('')
      if (isCode) return `\`${inner}\``
      if (isBold) inner = `**${inner}**`
      if (isItalic) inner = `*${inner}*`
      if (isMark) inner = `==${inner}==`
      if (isStrike) inner = `~~${inner}~~`
      return inner
    }

    return ''
  }

  for (const child of Array.from(root.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      const text = child.textContent?.trim()
      if (text) lines.push(text)
      continue
    }

    if (child.nodeType !== Node.ELEMENT_NODE) continue
    const el = child as HTMLElement
    const tag = el.tagName.toLowerCase()
    if (el.hasAttribute('data-editor-gap') && !el.textContent?.trim()) continue

    // 0. Image Card or standalone <img>
    if (el.classList.contains('image-wrapper') || el.hasAttribute('data-raw-img') || tag === 'img') {
      const img = tag === 'img' ? (el as HTMLImageElement) : el.querySelector('img')
      const src = img?.getAttribute('src') || decodeURIComponent(el.getAttribute('data-raw-img') || '')
      const alt = img?.getAttribute('alt') || el.getAttribute('data-img-alt') || 'imagem'
      if (src) lines.push(`![${alt}](${src})`)
      continue
    }

    // 0.1 Nested Artifact Card
    if (el.hasAttribute('data-raw-artifact')) {
      const rawArtifact = decodeURIComponent(el.getAttribute('data-raw-artifact') || '')
      lines.push(rawArtifact)
      continue
    }

    if (el.hasAttribute('data-raw-code')) {
      if (lines.length && lines[lines.length - 1] !== '') lines.push('')
      lines.push(serializeCodeBlock({ content: decodeURIComponent(el.dataset.rawCode || ''), language: el.dataset.codeLang || '', title: decodeURIComponent(el.dataset.codeTitle || '') }), '')
      continue
    }
    if (el.hasAttribute('data-raw-callout')) {
      if (lines.length && lines[lines.length - 1] !== '') lines.push('')
      lines.push(serializeCallout({ type: el.dataset.calloutType || 'NOTE', title: decodeURIComponent(el.dataset.calloutTitle || ''), content: decodeURIComponent(el.dataset.rawCallout || '') }), '')
      continue
    }

    // 2. Table
    if (el.hasAttribute('data-raw-table')) {
      const table = decodeURIComponent(el.getAttribute('data-raw-table') || '')
      // Adjacent grids need a blank line or Markdown parses them as one table.
      if (lines.length && lines[lines.length - 1] !== '') lines.push('')
      lines.push(table, '')
      continue
    }

    // 3. Callout
    if (el.getAttribute('data-type') === 'callout') {
      const calloutType = el.getAttribute('data-callout-type') || 'NOTE'
      const contentEl = el.querySelector('.callout-content') || el
      const contentText = Array.from(contentEl.childNodes).map(serializeInline).join('').trim()
      const calloutLines = contentText.split('\n')
      const first = calloutLines[0] || ''
      const rest = calloutLines.slice(1).map(l => `> ${l}`).join('\n')
      lines.push(`> [!${calloutType}] ${first}${rest ? '\n' + rest : ''}`)
      continue
    }

    // 4. Task Checkbox
    if (el.getAttribute('data-type') === 'task') {
      const checkbox = el.querySelector('input[type="checkbox"]') as HTMLInputElement | null
      const isChecked = checkbox?.checked || false
      const textEl = el.querySelector('.task-text') || el
      const text = Array.from(textEl.childNodes).map(serializeInline).join('').trim()
      lines.push(`- [${isChecked ? 'x' : ' '}] ${text}`)
      continue
    }

    // 5. Headings
    if (tag === 'h1') {
      lines.push(`# ${Array.from(el.childNodes).map(serializeInline).join('').trim()}`)
      continue
    }
    if (tag === 'h2') {
      lines.push(`## ${Array.from(el.childNodes).map(serializeInline).join('').trim()}`)
      continue
    }
    if (tag === 'h3') {
      lines.push(`### ${Array.from(el.childNodes).map(serializeInline).join('').trim()}`)
      continue
    }
    if (tag === 'h4') {
      lines.push(`#### ${Array.from(el.childNodes).map(serializeInline).join('').trim()}`)
      continue
    }
    if (tag === 'h5') {
      lines.push(`##### ${Array.from(el.childNodes).map(serializeInline).join('').trim()}`)
      continue
    }
    if (tag === 'h6') {
      lines.push(`###### ${Array.from(el.childNodes).map(serializeInline).join('').trim()}`)
      continue
    }

    // 6. Lists
    if (tag === 'ul') {
      const lis = el.querySelectorAll('li')
      for (const li of Array.from(lis)) {
        lines.push(`- ${Array.from(li.childNodes).map(serializeInline).join('').trim()}`)
      }
      continue
    }
    if (tag === 'ol') {
      const lis = el.querySelectorAll('li')
      let num = 1
      for (const li of Array.from(lis)) {
        lines.push(`${num}. ${Array.from(li.childNodes).map(serializeInline).join('').trim()}`)
        num++
      }
      continue
    }

    // 7. Blockquote
    if (tag === 'blockquote') {
      const quoteText = Array.from(el.childNodes).map(serializeInline).join('').trim()
      const quoteLines = quoteText.split('\n')
      lines.push(quoteLines.map(l => `> ${l}`).join('\n'))
      continue
    }

    // 8. Horizontal Rule
    if (tag === 'hr') {
      lines.push('---')
      continue
    }

    // 9. Standard Paragraph or Div
    const paraText = Array.from(el.childNodes).map(serializeInline).join('').trim()
    lines.push(paraText)
  }

  return lines.join('\n')
}

export const LivePreviewEditor: React.FC<LivePreviewEditorProps> = ({
  note,
  allNotes = [],
  displayMode,
  onUpdateContent,
  onNavigate,
  fontSizeClass = 'text-sm',
  editorRef
}) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const [blockHosts, setBlockHosts] = useState<EmbeddedHost[]>([])
  const refreshBlocks = useCallback(() => {
    const root = containerRef.current
    if (!root) return
    ensureEditorLandingZones(root)
    setBlockHosts(previous => {
      const next = Array.from(root.querySelectorAll<HTMLElement>('[data-table-host], [data-code-host], [data-callout-host]')).map(host => {
        const existing = previous.find(value => value.host === host)
        if (existing) return existing
        const kind: EmbeddedHost['kind'] = host.hasAttribute('data-code-host') ? 'code' : host.hasAttribute('data-callout-host') ? 'callout' : 'table'
        const wrapper = host.parentElement!
        host.replaceChildren()
        return { host, wrapper, kind, id: crypto.randomUUID() }
      })
      return next.length === previous.length && next.every((value, index) => value === previous[index]) ? previous : next
    })
  }, [])
  const isTypingRef = useRef(false)
  const syncTimerRef = useRef<any>(null)
  const currentNoteIdRef = useRef<string | null>(null)
  const lastSyncedMdRef = useRef<string>(note.content)

  // Custom History Manager for Undo & Redo (Ctrl+Z / Ctrl+Y)
  interface HistoryEntry {
    html: string
  }
  const undoStackRef = useRef<HistoryEntry[]>([])
  const redoStackRef = useRef<HistoryEntry[]>([])
  const isUndoRedoActionRef = useRef(false)
  const lastSnapshotHtmlRef = useRef<string>('')
  const typingSnapshotTimerRef = useRef<any>(null)

  const captureCurrentHtml = useCallback((): string => {
    if (!containerRef.current) return ''
    containerRef.current.querySelectorAll('.task-checkbox').forEach(cb => {
      const input = cb as HTMLInputElement
      if (input.checked) input.setAttribute('checked', 'checked')
      else input.removeAttribute('checked')
    })
    return containerRef.current.innerHTML
  }, [])

  const pushHistorySnapshot = useCallback((force = false) => {
    if (!containerRef.current || isUndoRedoActionRef.current) return
    const currentHtml = captureCurrentHtml()
    if (!currentHtml) return
    if (!force && currentHtml === lastSnapshotHtmlRef.current) return

    if (undoStackRef.current.length === 0 && lastSnapshotHtmlRef.current) {
      undoStackRef.current.push({ html: lastSnapshotHtmlRef.current })
    }

    undoStackRef.current.push({ html: currentHtml })
    if (undoStackRef.current.length > 80) {
      undoStackRef.current.shift()
    }
    lastSnapshotHtmlRef.current = currentHtml
    redoStackRef.current = []
  }, [captureCurrentHtml])

  const persistContent = useCallback(() => {
    if (!containerRef.current) return
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current)
    const markdown = domToMarkdown(containerRef.current)
    lastSyncedMdRef.current = markdown
    onUpdateContent(markdown)
  }, [onUpdateContent])

  const handleUndo = useCallback(() => {
    if (!containerRef.current || undoStackRef.current.length === 0) return
    const currentHtml = captureCurrentHtml()

    let target = undoStackRef.current.pop()
    if (target && target.html === currentHtml && undoStackRef.current.length > 0) {
      redoStackRef.current.push({ html: currentHtml })
      target = undoStackRef.current.pop()
    } else if (target) {
      redoStackRef.current.push({ html: currentHtml })
    }

    if (!target) return

    isUndoRedoActionRef.current = true
    containerRef.current.innerHTML = target.html
    lastSnapshotHtmlRef.current = target.html
    refreshBlocks()
    persistContent()
    setTimeout(() => { isUndoRedoActionRef.current = false }, 50)
  }, [captureCurrentHtml, refreshBlocks, persistContent])

  const handleRedo = useCallback(() => {
    if (!containerRef.current || redoStackRef.current.length === 0) return
    const target = redoStackRef.current.pop()
    if (!target) return

    const currentHtml = captureCurrentHtml()
    undoStackRef.current.push({ html: currentHtml })

    isUndoRedoActionRef.current = true
    containerRef.current.innerHTML = target.html
    lastSnapshotHtmlRef.current = target.html
    refreshBlocks()
    persistContent()
    setTimeout(() => { isUndoRedoActionRef.current = false }, 50)
  }, [captureCurrentHtml, refreshBlocks, persistContent])

  // Floating Slash Command (/) Menu state
  const [slashMenu, setSlashMenu] = useState<{
    query: string
    top: number
    left: number
    index: number
  } | null>(null)

  // Wikilink [[ Auto-complete Menu state
  const [wikiSuggest, setWikiSuggest] = useState<{
    query: string
    top: number
    left: number
    index: number
  } | null>(null)

  // Notion-style Selection Popover Toolbar state
  const [selectionToolbar, setSelectionToolbar] = useState<{
    top: number
    left: number
    text?: string
    range?: Range
  } | null>(null)

  // Floating Link Search/Picker Popover (for selection link button or editing existing link)
  const [linkPickerPopover, setLinkPickerPopover] = useState<{
    isOpen: boolean
    top: number
    left: number
    selectedText: string
    alias?: string
    range?: Range
    targetElement?: HTMLElement
    query: string
    index: number
  } | null>(null)

  // AppFlowy-style Drop line indicator state when dragging blocks
  const [dropIndicator, setDropIndicator] = useState<{
    top: number
    left: number
    width: number
  } | null>(null)

  // AppFlowy-style Hovered Block Gutter Handle state
  const [hoveredBlock, setHoveredBlock] = useState<{
    element: HTMLElement
    top: number
    left: number
    right: number
  } | null>(null)
  const gutterLeaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [draggedBlock, setDraggedBlock] = useState<HTMLElement | null>(null)

  // AppFlowy-style Inline AI Modal state
  const [inlineAi, setInlineAi] = useState<{
    isOpen: boolean
    targetText: string
    position: { top: number; left: number }
    targetBlock?: HTMLElement | null
    range?: Range | null
  }>({
    isOpen: false,
    targetText: '',
    position: { top: 0, left: 0 }
  })

  const isComposingRef = useRef(false)

  const isEditable = displayMode === 'live'

  useEffect(() => {
    if (slashMenu) document.querySelector('.editor-command-item[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [slashMenu])

  const linkPickerRef = useRef<HTMLDivElement>(null)

  // Close link picker popover when clicking anywhere outside
  useEffect(() => {
    if (!linkPickerPopover) return

    const handlePointerDownOutside = (e: MouseEvent | PointerEvent) => {
      const target = e.target as Node | null
      if (!target) return
      if (linkPickerRef.current && !linkPickerRef.current.contains(target)) {
        // Don't immediately close if clicking on another wiki-link
        if (target instanceof Element && target.closest('.wiki-link')) {
          return
        }
        setLinkPickerPopover(null)
      }
    }

    document.addEventListener('pointerdown', handlePointerDownOutside, true)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDownOutside, true)
    }
  }, [linkPickerPopover])

  // Debounced Markdown Synchronization to parent state (smooth 450ms debounce)
  const handleSync = useCallback(() => {
    if (!containerRef.current) return
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current)
    const scheduledNoteId = currentNoteIdRef.current

    syncTimerRef.current = setTimeout(() => {
      if (containerRef.current && currentNoteIdRef.current === scheduledNoteId) {
        const md = domToMarkdown(containerRef.current)
        lastSyncedMdRef.current = md
        onUpdateContent(md)
        isTypingRef.current = false
      }
    }, 450)
  }, [onUpdateContent])

  useEffect(() => () => {
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current)
    if (typingSnapshotTimerRef.current) clearTimeout(typingSnapshotTimerRef.current)
  }, [])

  // Synchronize initial HTML when note changes or on external update
  useEffect(() => {
    if (!containerRef.current) return

    // If switching notes
    if (currentNoteIdRef.current !== note.id) {
      currentNoteIdRef.current = note.id
      lastSyncedMdRef.current = note.content
      const initialHtml = markdownToHtml(note.content, allNotes, note.title)
      containerRef.current.innerHTML = initialHtml
      lastSnapshotHtmlRef.current = initialHtml
      undoStackRef.current = [{ html: initialHtml }]
      redoStackRef.current = []
      refreshBlocks()
      setSlashMenu(null)
      setWikiSuggest(null)
      setSelectionToolbar(null)
    } else if (
      note.content !== lastSyncedMdRef.current &&
      !containerRef.current.contains(document.activeElement)
    ) {
      // Only sync if content was updated externally and user is not focused on editor
      lastSyncedMdRef.current = note.content
      const newHtml = markdownToHtml(note.content, allNotes, note.title)
      containerRef.current.innerHTML = newHtml
      lastSnapshotHtmlRef.current = newHtml
      refreshBlocks()
    }
  }, [note.id, note.content, note.title, allNotes, refreshBlocks])

  const insertBlock = (html: string) => {
    if (!containerRef.current) return null
    pushHistorySnapshot(true)
    const block = insertEditorBlock(containerRef.current, html)
    refreshBlocks()
    setSelectionToolbar(null)
    persistContent()
    return block
  }

  // Convert selected paragraphs/lines to task checkboxes, or toggle existing paragraph
  const applyTaskList = useCallback(() => {
    pushHistorySnapshot(true)
    const sel = window.getSelection()
    const selectedText = sel?.toString() || ''

    if (sel && !sel.isCollapsed && selectedText.trim()) {
      const rawLines = selectedText.split(/\r?\n/)
      const tasksHtml = rawLines
        .map(line => {
          const clean = line.replace(/^(\s*[-*]\s*(\[[ xX]\])?|\s*\d+\.\s*)/, '').trim()
          if (!clean) return ''
          return `
            <div class="task-item flex items-start gap-2.5 my-1.5 group" data-type="task">
              <input type="checkbox" contenteditable="false" class="task-checkbox mt-1 w-4 h-4 cursor-pointer shrink-0 select-none" />
              <span class="task-text flex-1 text-[13px] md:text-sm text-zinc-200 leading-relaxed">${escapeHtml(clean)}</span>
            </div>
          `
        })
        .filter(Boolean)
        .join('')

      if (tasksHtml) {
        document.execCommand('insertHTML', false, tasksHtml)
        setSelectionToolbar(null)
        refreshBlocks()
        handleSync()
        return
      }
    }

    // If no text was selected, check if cursor is inside a paragraph/block with text
    const range = sel?.rangeCount ? sel.getRangeAt(0) : null
    const currentBlock = range?.startContainer instanceof HTMLElement
      ? range.startContainer.closest('p, div, li, h1, h2, h3, h4, h5, h6')
      : range?.startContainer.parentElement?.closest('p, div, li, h1, h2, h3, h4, h5, h6')

    if (currentBlock && containerRef.current?.contains(currentBlock) && !currentBlock.matches('[data-type="task"]')) {
      const text = currentBlock.textContent?.trim() || ''
      if (text) {
        const clean = text.replace(/^(\s*[-*]\s*(\[[ xX]\])?|\s*\d+\.\s*)/, '').trim()
        const taskEl = document.createElement('div')
        taskEl.className = 'task-item flex items-start gap-2.5 my-1.5 group'
        taskEl.setAttribute('data-type', 'task')
        taskEl.innerHTML = `
          <input type="checkbox" contenteditable="false" class="task-checkbox mt-1 w-4 h-4 cursor-pointer shrink-0 select-none" />
          <span class="task-text flex-1 text-[13px] md:text-sm text-zinc-200 leading-relaxed">${escapeHtml(clean)}</span>
        `
        currentBlock.replaceWith(taskEl)
        refreshBlocks()
        handleSync()
        return
      }
    }

    // Default: insert blank task item
    const taskHtml = `
      <div class="task-item flex items-start gap-2.5 my-1.5 group" data-type="task">
        <input type="checkbox" contenteditable="false" class="task-checkbox mt-1 w-4 h-4 cursor-pointer shrink-0 select-none" />
        <span class="task-text flex-1 text-[13px] md:text-sm text-zinc-200 leading-relaxed"><br></span>
      </div>
    `
    const block = insertBlock(taskHtml)
    const textSpan = block?.querySelector('.task-text') as HTMLElement | null
    if (textSpan) {
      const s = window.getSelection()
      const r = document.createRange()
      r.selectNodeContents(textSpan)
      r.collapse(true)
      s?.removeAllRanges()
      s?.addRange(r)
    }
  }, [pushHistorySnapshot, refreshBlocks, handleSync])
  const insertTableBlock = () => insertBlock(tableShell(DEFAULT_TABLE))

  const formatBlockSafe = (tag: string) => {
    containerRef.current?.focus()
    let ok = false
    try {
      ok = document.execCommand('formatBlock', false, `<${tag.toUpperCase()}>`)
    } catch {
      ok = false
    }
    if (!ok) {
      try {
        ok = document.execCommand('formatBlock', false, `<${tag.toLowerCase()}>`)
      } catch {
        ok = false
      }
    }
    if (!ok) {
      try {
        document.execCommand('formatBlock', false, tag)
      } catch {}
    }
  }

  const insertWikiLinkHtml = (targetTitle: string, alias?: string) => {
    const exists = allNotes.some(n => n.title.toLowerCase().trim() === targetTitle.toLowerCase().trim())
    const pillClass = exists
      ? 'wiki-link-exists text-[var(--accent)] hover:opacity-90 bg-[var(--accent-glow-subtle)] border border-[var(--accent)]/30'
      : 'wiki-link-unresolved text-zinc-400 hover:text-zinc-200 bg-zinc-800/60 hover:bg-zinc-800 border border-dashed border-zinc-700/80'

    const displayName = (alias && alias.trim() && alias !== targetTitle) ? alias : targetTitle
    const linkHtml = `<span class="wiki-link ${exists ? 'wiki-link-exists' : 'wiki-link-unresolved'} inline-flex items-center cursor-pointer font-medium select-none rounded px-1.5 py-0 mx-0.5 text-xs transition-colors shadow-sm ${pillClass}" contenteditable="false" data-wiki="${escapeHtml(targetTitle)}" ${alias && alias !== targetTitle ? `data-alias="${escapeHtml(alias)}"` : ''} title="${exists ? `Abrir nota: &quot;${targetTitle}&quot; (Botão direito para editar)` : `Criar nota: &quot;${targetTitle}&quot; (Botão direito para editar)`}"><span class="underline ${exists ? 'decoration-[var(--accent)]/40 hover:decoration-[var(--accent)]' : 'decoration-zinc-500/50 hover:decoration-zinc-400'} underline-offset-2">${escapeHtml(displayName)}</span></span>&nbsp;`
    document.execCommand('insertHTML', false, linkHtml)
  }

  // Expose formatting commands to top toolbar via ref
  useImperativeHandle(editorRef, () => ({
    setBlockType: (type: LiveBlock['type']) => {
      pushHistorySnapshot(true)
      containerRef.current?.focus()
      if (type === 'h1') formatBlockSafe('h1')
      else if (type === 'h2') formatBlockSafe('h2')
      else if (type === 'h3') formatBlockSafe('h3')
      else if (type === 'bullet') {
        containerRef.current?.focus()
        document.execCommand('insertUnorderedList')
      }
      else if (type === 'number') {
        containerRef.current?.focus()
        document.execCommand('insertOrderedList')
      }
      else if (type === 'quote') formatBlockSafe('blockquote')
      else if (type === 'task') {
        applyTaskList()
      } else {
        formatBlockSafe('p')
      }
      handleSync()
    },
    toggleBold: () => {
      pushHistorySnapshot(true)
      document.execCommand('bold')
      handleSync()
    },
    toggleItalic: () => {
      pushHistorySnapshot(true)
      document.execCommand('italic')
      handleSync()
    },
    insertWikiLink: (target: string) => {
      pushHistorySnapshot(true)
      insertWikiLinkHtml(target)
      handleSync()
    },
    insertCodeBlock: () => {
      pushHistorySnapshot(true)
      insertBlock(codeShell({ title: '', language: '', content: '' }))
    },
    insertCallout: (type: string) => {
      pushHistorySnapshot(true)
      insertBlock(calloutShell({ type: type.toUpperCase() || 'NOTE', title: '', content: '' }))
    },
    insertTable: () => {
      pushHistorySnapshot(true)
      insertTableBlock()
    },
    focus: () => {
      containerRef.current?.focus()
    },
    scrollToBlock: (blockIndex: number, snippet?: string) => {
      const container = containerRef.current
      if (!container) return
      const children = Array.from(container.children) as HTMLElement[]
      let target = children[blockIndex]
      if (!target || (snippet && !target.innerText?.includes(snippet.slice(0, 20)))) {
        if (snippet) {
          const found = children.find(c => c.innerText?.includes(snippet.slice(0, 25)))
          if (found) target = found
        }
      }
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' })
        target.classList.add('pyrite-block-pulse-highlight')
        setTimeout(() => {
          target.classList.remove('pyrite-block-pulse-highlight')
        }, 2200)
      }
    }
  }))

  // Handle image, markdown and rich media pasting directly into the document
  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    const items = e.clipboardData?.items
    if (!items) return

    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (item.type.indexOf('image') !== -1) {
        e.preventDefault()
        const file = item.getAsFile()
        if (!file) continue

        const reader = new FileReader()
        reader.onload = (event) => {
          const dataUrl = event.target?.result as string
          if (!dataUrl) return

          const imgHtml = `
            <div class="image-wrapper my-4 rounded-xl overflow-hidden border border-zinc-800 bg-zinc-950/40 p-1 shadow-md inline-block max-w-full" contenteditable="false" data-raw-img="${encodeURIComponent(dataUrl)}" data-img-alt="imagem">
              <img src="${dataUrl}" alt="imagem" class="rounded-lg max-h-[500px] object-contain w-auto mx-auto" />
            </div>
            <p class="my-1.5 text-[13px] md:text-sm text-zinc-300 leading-relaxed"><br></p>
          `
          insertBlock(imgHtml)
        }
        reader.readAsDataURL(file)
        return
      }
    }

    // Handle plain text or markdown pasting
    const text = e.clipboardData?.getData('text/plain')
    if (text && (/#{1,6}\s+/.test(text) || /\r?\n/.test(text))) {
      e.preventDefault()
      pushHistorySnapshot(true)
      const convertedHtml = markdownToHtml(text, allNotes, note.title)
      document.execCommand('insertHTML', false, convertedHtml)
      refreshBlocks()
      handleSync()
      return
    }
  }

  // Handle typing inside unified contentEditable
  const handleInput = () => {
    if (isComposingRef.current) return
    isTypingRef.current = true
    refreshBlocks()
    handleSync()

    // Debounce typing snapshot (save state 600ms after user pauses typing)
    if (typingSnapshotTimerRef.current) clearTimeout(typingSnapshotTimerRef.current)
    typingSnapshotTimerRef.current = setTimeout(() => {
      pushHistorySnapshot()
    }, 600)

    const sel = window.getSelection()
    if (!sel || !sel.rangeCount) {
      setSlashMenu(null)
      setWikiSuggest(null)
      return
    }

    const range = sel.getRangeAt(0)
    const node = range.startContainer
    const textBefore = node.nodeType === Node.TEXT_NODE ? node.textContent?.slice(0, range.startOffset) || '' : ''

    // 1. Detect Slash trigger "/"
    const slashIdx = textBefore.lastIndexOf('/')
    if (slashIdx !== -1 && (slashIdx === 0 || textBefore[slashIdx - 1] === ' ' || textBefore[slashIdx - 1] === '\n')) {
      const q = textBefore.slice(slashIdx + 1)
      if (!q.includes(' ') && q.length < 20) {
        const rect = range.getBoundingClientRect()
        setSlashMenu({
          query: q.toLowerCase(),
          top: Math.max(8, Math.min(rect.bottom + 6, window.innerHeight - 356)),
          left: Math.max(8, Math.min(window.innerWidth - 250, rect.left)),
          index: 0
        })
      } else {
        setSlashMenu(null)
      }
    } else {
      setSlashMenu(null)
    }

    // 2. Detect Wikilink trigger "[["
    const wikiIdx = textBefore.lastIndexOf('[[')
    if (wikiIdx !== -1) {
      const q = textBefore.slice(wikiIdx + 2)
      if (!q.includes(']]') && !q.includes('\n') && q.length < 35) {
        const rect = range.getBoundingClientRect()
        setWikiSuggest({
          query: q.toLowerCase(),
          top: Math.max(10, rect.bottom + 6),
          left: Math.max(20, Math.min(window.innerWidth - 300, rect.left)),
          index: 0
        })
      } else {
        setWikiSuggest(null)
      }
    } else {
      setWikiSuggest(null)
    }
  }

  // Handle smart keyboard shortcuts & live markdown transformation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!isEditable || e.nativeEvent.isComposing) return

    // 0. Custom Undo & Redo (Ctrl+Z, Ctrl+Shift+Z, Ctrl+Y)
    if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
      e.preventDefault()
      e.stopPropagation()
      if (e.shiftKey) {
        handleRedo()
      } else {
        handleUndo()
      }
      return
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y')) {
      e.preventDefault()
      e.stopPropagation()
      handleRedo()
      return
    }

    // Shortcut to open Inline AI for selection (Ctrl+E, Ctrl+I, Ctrl+J)
    if ((e.ctrlKey || e.metaKey) && (e.key === 'e' || e.key === 'E' || e.key === 'i' || e.key === 'I' || e.key === 'j' || e.key === 'J')) {
      const sel = window.getSelection()
      if (sel && !sel.isCollapsed && sel.rangeCount) {
        e.preventDefault()
        e.stopPropagation()
        handleOpenAiForSelection(sel.getRangeAt(0).cloneRange(), sel.toString().trim())
        return
      }
    }

    // If slash menu active, handle keys
    if (slashMenu && filteredSlashCommands.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSlashMenu(prev => (prev ? { ...prev, index: (prev.index + 1) % filteredSlashCommands.length } : null))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSlashMenu(prev => (prev ? { ...prev, index: (prev.index - 1 + filteredSlashCommands.length) % filteredSlashCommands.length } : null))
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        const cmd = filteredSlashCommands[slashMenu.index] || filteredSlashCommands[0]
        if (cmd) executeSlashCommand(cmd.id)
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setSlashMenu(null)
        return
      }
    }

    // If wikilink autocomplete menu active, handle keys
    if (wikiSuggest && filteredWikiNotes.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setWikiSuggest(prev => (prev ? { ...prev, index: (prev.index + 1) % filteredWikiNotes.length } : null))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setWikiSuggest(prev => (prev ? { ...prev, index: (prev.index - 1 + filteredWikiNotes.length) % filteredWikiNotes.length } : null))
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        const target = filteredWikiNotes[wikiSuggest.index] || filteredWikiNotes[0]
        if (target) handleSelectWikiSuggestion(target.title)
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setWikiSuggest(null)
        return
      }
    }

    // At a block boundary, first select/focus the block; a second Delete removes it.
    if (e.key === 'Backspace' || e.key === 'Delete') {
      const selection = window.getSelection()
      const root = containerRef.current
      if (root && selection?.rangeCount) {
        const range = selection.getRangeAt(0)
        const selector = '[data-raw-code], [data-raw-table], [data-type="callout"], [data-raw-img], [data-raw-artifact], hr'
        if (!selection.isCollapsed && range.startContainer === root && range.endContainer === root && range.endOffset === range.startOffset + 1) {
          const block = root.childNodes[range.startOffset]
          if (block instanceof HTMLElement && block.matches(selector)) { e.preventDefault(); deleteBlock(block); return }
        }
        if (selection.isCollapsed) {
          const element = range.startContainer instanceof HTMLElement ? range.startContainer : range.startContainer.parentElement
          const paragraph = element?.closest('p')
          if (paragraph?.parentElement === root) {
            const boundary = range.cloneRange()
            boundary.selectNodeContents(paragraph)
            if (e.key === 'Backspace') boundary.setEnd(range.startContainer, range.startOffset)
            else boundary.setStart(range.startContainer, range.startOffset)
            const adjacent = e.key === 'Backspace' ? paragraph.previousElementSibling : paragraph.nextElementSibling
            if (!boundary.toString() && adjacent instanceof HTMLElement && adjacent.matches(selector)) {
              e.preventDefault()
              const focusable = adjacent.querySelector<HTMLElement>('section[tabindex="0"]')
              if (focusable) focusable.focus()
              else { const blockRange = document.createRange(); blockRange.selectNode(adjacent); selection.removeAllRanges(); selection.addRange(blockRange) }
              return
            }
          }
        }
      }
    }

    // Handle Enter key inside lists and interactive checklists
    if (e.key === 'Enter') {
      const sel = window.getSelection()
      if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0)
        const node = range.startContainer
        const el = (node.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement) : node.parentElement)

        // 1. Task Item Enter Handling
        const taskItem = el?.closest('.task-item') as HTMLElement | null
        if (taskItem) {
          e.preventDefault()
          const textEl = taskItem.querySelector('.task-text') as HTMLElement | null
          const rawText = textEl?.textContent?.replace(/\u200B/g, '').trim() || ''

          // If current task item has no text, exit checklist mode and convert to a clean paragraph
          if (!rawText) {
            const p = document.createElement('p')
            p.className = 'my-0.5 text-[13px] md:text-sm text-zinc-300 leading-[1.5]'
            p.innerHTML = '<br>'
            taskItem.replaceWith(p)
            const newRange = document.createRange()
            newRange.setStart(p, 0)
            newRange.collapse(true)
            sel.removeAllRanges()
            sel.addRange(newRange)
            handleSync()
            return
          }

          // Current task has content: create a new task item below
          const newTask = document.createElement('div')
          newTask.className = 'task-item flex items-start gap-2.5 my-1.5 group'
          newTask.setAttribute('data-type', 'task')
          newTask.innerHTML = `
            <input type="checkbox" contenteditable="false" class="task-checkbox mt-1 w-4 h-4 cursor-pointer shrink-0 select-none" />
            <span class="task-text flex-1 text-[13px] md:text-sm text-zinc-200 leading-relaxed"><br></span>
          `

          // If cursor was in the middle of text, transfer the trailing content
          if (textEl && !range.collapsed) {
            range.deleteContents()
          } else if (textEl && node.nodeType === Node.TEXT_NODE) {
            try {
              const subRange = document.createRange()
              subRange.setStart(node, range.startOffset)
              subRange.setEnd(textEl, textEl.childNodes.length)
              const trailing = subRange.extractContents()
              const newSpan = newTask.querySelector('.task-text') as HTMLElement
              newSpan.innerHTML = ''
              newSpan.appendChild(trailing)
              if (!newSpan.textContent?.trim()) {
                newSpan.innerHTML = '<br>'
              }
            } catch {
              // fallback
            }
          }

          taskItem.after(newTask)
          const targetSpan = newTask.querySelector('.task-text') as HTMLElement
          const newRange = document.createRange()
          newRange.setStart(targetSpan, 0)
          newRange.collapse(true)
          sel.removeAllRanges()
          sel.addRange(newRange)
          handleSync()
          return
        }

        // 2. List Item (<li>) Enter Handling
        const liElement = el?.closest('li') as HTMLElement | null
        if (liElement) {
          const rawText = liElement.textContent?.replace(/\u200B/g, '').trim() || ''

          // If current li is empty, exit list mode and insert regular paragraph after the list
          if (!rawText) {
            e.preventDefault()
            const parentList = liElement.closest('ul, ol')
            liElement.remove()
            const p = document.createElement('p')
            p.className = 'my-0.5 text-[13px] md:text-sm text-zinc-300 leading-[1.5]'
            p.innerHTML = '<br>'
            if (parentList) {
              if (parentList.children.length === 0) {
                parentList.replaceWith(p)
              } else {
                parentList.after(p)
              }
            } else {
              containerRef.current?.appendChild(p)
            }
            const newRange = document.createRange()
            newRange.setStart(p, 0)
            newRange.collapse(true)
            sel.removeAllRanges()
            sel.addRange(newRange)
            handleSync()
            return
          }

          // Li has content: create new li below
          e.preventDefault()
          const newLi = document.createElement('li')
          newLi.innerHTML = '<br>'

          if (!range.collapsed) {
            range.deleteContents()
          } else if (node.nodeType === Node.TEXT_NODE) {
            try {
              const subRange = document.createRange()
              subRange.setStart(node, range.startOffset)
              subRange.setEnd(liElement, liElement.childNodes.length)
              const trailing = subRange.extractContents()
              newLi.innerHTML = ''
              newLi.appendChild(trailing)
              if (!newLi.textContent?.trim()) {
                newLi.innerHTML = '<br>'
              }
            } catch {
              // fallback
            }
          }

          liElement.after(newLi)
          const newRange = document.createRange()
          newRange.setStart(newLi, 0)
          newRange.collapse(true)
          sel.removeAllRanges()
          sel.addRange(newRange)
          handleSync()
          return
        }
      }
    }

    // Backspace on empty task item converts it back to paragraph
    if (e.key === 'Backspace') {
      const sel = window.getSelection()
      if (sel && sel.rangeCount > 0 && sel.isCollapsed) {
        const range = sel.getRangeAt(0)
        const node = range.startContainer
        const el = (node.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement) : node.parentElement)
        const taskItem = el?.closest('.task-item') as HTMLElement | null
        if (taskItem) {
          const textEl = taskItem.querySelector('.task-text') as HTMLElement | null
          const rawText = textEl?.textContent?.replace(/\u200B/g, '').trim() || ''
          if (!rawText || range.startOffset === 0) {
            e.preventDefault()
            const p = document.createElement('p')
            p.className = 'my-0.5 text-[13px] md:text-sm text-zinc-300 leading-[1.5]'
            p.innerHTML = rawText ? escapeHtml(rawText) : '<br>'
            taskItem.replaceWith(p)
            const newRange = document.createRange()
            newRange.setStart(p, 0)
            newRange.collapse(true)
            sel.removeAllRanges()
            sel.addRange(newRange)
            handleSync()
            return
          }
        }
      }
    }

    // Live markdown formatting when typing Space at beginning of line
    if (e.key === ' ') {
      const sel = window.getSelection()
      if (sel && sel.anchorNode && sel.anchorNode.nodeType === Node.TEXT_NODE) {
        const text = sel.anchorNode.textContent || ''
        const offset = sel.anchorOffset

        if (text === '#' && offset === 1) {
          e.preventDefault()
          sel.anchorNode.textContent = ''
          formatBlockSafe('h1')
          handleSync()
          return
        }
        if (text === '##' && offset === 2) {
          e.preventDefault()
          sel.anchorNode.textContent = ''
          formatBlockSafe('h2')
          handleSync()
          return
        }
        if (text === '###' && offset === 3) {
          e.preventDefault()
          sel.anchorNode.textContent = ''
          formatBlockSafe('h3')
          handleSync()
          return
        }
        if ((text === '-' || text === '*') && offset === 1) {
          e.preventDefault()
          sel.anchorNode.textContent = ''
          document.execCommand('insertUnorderedList')
          handleSync()
          return
        }
        if (text === '1.' && offset === 2) {
          e.preventDefault()
          sel.anchorNode.textContent = ''
          document.execCommand('insertOrderedList')
          handleSync()
          return
        }
        if ((text === '[]' || text === '- [ ]' || text === '[ ]') && offset === text.length) {
          e.preventDefault()
          sel.anchorNode.textContent = ''
          const taskHtml = `
            <div class="task-item flex items-start gap-2.5 my-1.5 group" data-type="task">
              <input type="checkbox" contenteditable="false" class="task-checkbox mt-1 w-4 h-4 cursor-pointer shrink-0 select-none" />
              <span class="task-text flex-1 text-[13px] md:text-sm text-zinc-200 leading-relaxed"><br></span>
            </div>
          `
          document.execCommand('insertHTML', false, taskHtml)
          handleSync()
          return
        }
        if (text === '>' && offset === 1) {
          e.preventDefault()
          sel.anchorNode.textContent = ''
          formatBlockSafe('blockquote')
          handleSync()
          return
        }
        if (text === '---' && offset === 3) {
          e.preventDefault()
          sel.anchorNode.textContent = ''
          document.execCommand('insertHorizontalRule')
          handleSync()
          return
        }
      }
    }
  }

  // Execute Slash Command
  const executeSlashCommand = (cmdId: string) => {
    // Delete the "/" trigger from cursor
    const sel = window.getSelection()
    if (sel && sel.rangeCount) {
      const range = sel.getRangeAt(0)
      const node = range.startContainer
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent || ''
        const slashIdx = text.lastIndexOf('/')
        if (slashIdx !== -1) {
          const suffix = text.slice(range.startOffset)
          node.textContent = text.slice(0, slashIdx) + suffix
          // Re-establish the caret after replacing text; execCommand otherwise
          // receives a collapsed range outside the editing host in Chromium.
          containerRef.current?.focus()
          if (!node.textContent && node.parentElement?.childNodes.length === 1) {
            const parent = node.parentElement
            parent.replaceChildren(document.createElement('br'))
            range.setStart(parent, 0)
          } else range.setStart(node, slashIdx)
          range.collapse(true)
          sel.removeAllRanges()
          sel.addRange(range)
        }
      }
    }

    setSlashMenu(null)

    if (cmdId === 'ai') {
      const sel = window.getSelection()
      const rect = sel?.rangeCount ? sel.getRangeAt(0).getBoundingClientRect() : { top: 120, left: 120 }
      setInlineAi({
        isOpen: true,
        targetText: '',
        position: {
          top: Math.max(20, rect.top + 28),
          left: Math.max(20, Math.min(window.innerWidth - 480, rect.left))
        }
      })
      return
    }

    if (cmdId === 'h1') formatBlockSafe('h1')
    else if (cmdId === 'h2') formatBlockSafe('h2')
    else if (cmdId === 'h3') formatBlockSafe('h3')
    else if (cmdId === 'bullet') {
      containerRef.current?.focus()
      document.execCommand('insertUnorderedList')
    }
    else if (cmdId === 'number') {
      containerRef.current?.focus()
      document.execCommand('insertOrderedList')
    }
    else if (cmdId === 'quote') formatBlockSafe('blockquote')
    else if (cmdId === 'hr') insertBlock('<hr class="my-5 border-zinc-800" contenteditable="false" />')
    else if (cmdId === 'task') {
      const taskHtml = `
        <div class="task-item flex items-start gap-2.5 my-1.5 group" data-type="task">
          <input type="checkbox" contenteditable="false" class="task-checkbox mt-1 w-4 h-4 cursor-pointer shrink-0 select-none" />
          <span class="task-text flex-1 text-[13px] md:text-sm text-zinc-200 leading-relaxed"><br></span>
        </div>
      `
      const block = insertBlock(taskHtml)
      const textSpan = block?.querySelector('.task-text') as HTMLElement | null
      if (textSpan) {
        const sel = window.getSelection()
        const range = document.createRange()
        range.selectNodeContents(textSpan)
        range.collapse(true)
        sel?.removeAllRanges()
        sel?.addRange(range)
      }
    } else if (cmdId === 'table') {
      insertTableBlock()
    } else if (cmdId === 'code') {
      insertBlock(codeShell({ title: '', language: '', content: '' }))
    } else if (cmdId === 'callout-note' || cmdId === 'callout-tip' || cmdId === 'callout-warning') {
      const type = cmdId === 'callout-tip' ? 'TIP' : cmdId === 'callout-warning' ? 'WARNING' : 'NOTE'
      insertBlock(calloutShell({ type, title: '', content: '' }))
    } else if (cmdId === 'wikilink') {
      document.execCommand('insertText', false, '[[')

    }

    handleSync()
  }

  // Select a suggestion from Wikilink autocomplete menu
  const handleSelectWikiSuggestion = (targetNoteTitle: string) => {
    // Delete the "[[" trigger and query from cursor
    const sel = window.getSelection()
    if (sel && sel.rangeCount) {
      const range = sel.getRangeAt(0)
      const node = range.startContainer
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent || ''
        const wikiIdx = text.lastIndexOf('[[')
        if (wikiIdx !== -1) {
          node.textContent = text.slice(0, wikiIdx)
        }
      }
    }

    insertWikiLinkHtml(targetNoteTitle)
    setWikiSuggest(null)
    handleSync()
  }

  // Check selection for Notion-style Floating Toolbar
  const handleSelectionCheck = useCallback(() => {
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed || !sel.rangeCount) {
      setSelectionToolbar(null)
      return
    }

    const selectedText = sel.toString().trim()
    if (!selectedText) {
      setSelectionToolbar(null)
      return
    }

    const range = sel.getRangeAt(0)
    const rect = range.getBoundingClientRect()
    if (rect.width === 0 && rect.height === 0) {
      setSelectionToolbar(null)
      return
    }

    setSelectionToolbar({
      top: Math.max(12, rect.top - 46),
      left: Math.max(120, Math.min(window.innerWidth - 120, rect.left + rect.width / 2)),
      text: selectedText,
      range: range.cloneRange()
    })
  }, [])

  // Floating Toolbar Formatting Actions
  const handleToolbarWrap = (type: 'bold' | 'italic' | 'strike' | 'highlight' | 'code' | 'link' | 'h1' | 'h2' | 'h3' | 'task' | 'bullet' | 'callout') => {
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed) return
    pushHistorySnapshot(true)

    if (type === 'bold') {
      document.execCommand('bold')
    } else if (type === 'italic') {
      document.execCommand('italic')
    } else if (type === 'strike') {
      document.execCommand('strikeThrough')
    } else if (type === 'code') {
      const selectedText = sel.toString()
      document.execCommand('insertHTML', false, `<code class="bg-zinc-800 text-[var(--accent)] px-1 py-0.5 rounded font-mono text-xs">${escapeHtml(selectedText)}</code>`)
    } else if (type === 'highlight') {
      const selectedText = sel.toString()
      document.execCommand('insertHTML', false, `<mark class="bg-[var(--accent-glow-subtle)] text-[var(--accent)] px-1 py-0.5 rounded font-normal border border-[var(--accent)]/30">${escapeHtml(selectedText)}</mark>`)
    } else if (type === 'link') {
      const selectedText = sel.toString().trim()
      const range = sel.getRangeAt(0).cloneRange()
      const rect = range.getBoundingClientRect()
      setSelectionToolbar(null)
      setLinkPickerPopover({
        isOpen: true,
        top: Math.max(20, rect.bottom + 8),
        left: Math.max(20, Math.min(window.innerWidth - 300, rect.left)),
        selectedText,
        range,
        query: selectedText,
        index: 0
      })
      return
    } else if (type === 'h1') {
      formatBlockSafe('h1')
    } else if (type === 'h2') {
      formatBlockSafe('h2')
    } else if (type === 'h3') {
      formatBlockSafe('h3')
    } else if (type === 'bullet') {
      document.execCommand('insertUnorderedList')
    } else if (type === 'task') {
      applyTaskList()
    } else if (type === 'callout') {
      const selectedText = sel.toString().trim() || 'Texto de destaque'
      insertBlock(calloutShell({ type: 'NOTE', title: '', content: selectedText }))
    }

    setSelectionToolbar(null)
    refreshBlocks()
    handleSync()
  }

  // Apply chosen wiki link from search popover
  const handleApplyLink = (targetTitle: string) => {
    if (!linkPickerPopover) return
    const { targetElement, range, selectedText } = linkPickerPopover

    // 1. Editing an existing link element in-place
    if (targetElement && containerRef.current?.contains(targetElement)) {
      pushHistorySnapshot(true)
      const exists = allNotes.some(n => n.title.toLowerCase().trim() === targetTitle.toLowerCase().trim())
      const pillClass = exists
        ? 'wiki-link-exists text-[var(--accent)] hover:opacity-90 bg-[var(--accent-glow-subtle)] border border-[var(--accent)]/30'
        : 'wiki-link-unresolved text-zinc-400 hover:text-zinc-200 bg-zinc-800/60 hover:bg-zinc-800 border border-dashed border-zinc-700/80'

      const alias = (selectedText && selectedText.trim() !== targetTitle.trim()) ? selectedText.trim() : undefined
      const displayName = alias || targetTitle

      targetElement.className = `wiki-link ${exists ? 'wiki-link-exists' : 'wiki-link-unresolved'} inline-flex items-center cursor-pointer font-medium select-none rounded px-1.5 py-0 mx-0.5 text-xs transition-colors shadow-sm ${pillClass}`
      targetElement.setAttribute('data-wiki', targetTitle.trim())
      if (alias) {
        targetElement.setAttribute('data-alias', alias)
      } else {
        targetElement.removeAttribute('data-alias')
      }
      targetElement.setAttribute('title', exists ? `Abrir nota: "${targetTitle.trim()}" (Botão direito para editar)` : `Criar nota: "${targetTitle.trim()}" (Botão direito para editar)`)
      targetElement.innerHTML = `<span class="underline ${exists ? 'decoration-[var(--accent)]/40 hover:decoration-[var(--accent)]' : 'decoration-zinc-500/50 hover:decoration-zinc-400'} underline-offset-2">${escapeHtml(displayName)}</span>`
      setLinkPickerPopover(null)
      refreshBlocks()
      handleSync()
      return
    }

    // 2. Creating a new link from selected text
    if (range) {
      const sel = window.getSelection()
      if (sel) {
        sel.removeAllRanges()
        sel.addRange(range)
      }
      pushHistorySnapshot(true)
      const alias = (selectedText && selectedText.trim() !== targetTitle.trim()) ? selectedText.trim() : undefined
      insertWikiLinkHtml(targetTitle.trim(), alias)
      setLinkPickerPopover(null)
      refreshBlocks()
      handleSync()
    }
  }

  // Remove / unlink an existing link chip
  const handleRemoveLink = () => {
    if (!linkPickerPopover?.targetElement) return
    const el = linkPickerPopover.targetElement
    if (containerRef.current?.contains(el)) {
      pushHistorySnapshot(true)
      const text = el.textContent || ''
      el.replaceWith(document.createTextNode(text))
      setLinkPickerPopover(null)
      refreshBlocks()
      handleSync()
    }
  }

  const handleConfirmLinkPicker = () => {
    if (!linkPickerPopover) return
    const q = linkPickerPopover.query.trim()
    const matches = allNotes
      .filter(n => !q || n.title.toLowerCase().includes(q.toLowerCase()))
      .slice(0, 8)
    const chosen = matches[linkPickerPopover.index]
    const target = chosen ? chosen.title : q
    if (target) {
      handleApplyLink(target)
    } else {
      setLinkPickerPopover(null)
    }
  }

  // Open Inline AI Modal for current text selection
  const handleOpenAiForSelection = (customRange?: Range, customText?: string) => {
    let text = customText || selectionToolbar?.text || ''
    let range = customRange || selectionToolbar?.range || null

    if (!text || !range) {
      const sel = window.getSelection()
      if (sel && !sel.isCollapsed && sel.rangeCount) {
        text = sel.toString().trim()
        range = sel.getRangeAt(0).cloneRange()
      }
    }

    if (!text || !range) return

    const rect = range.getBoundingClientRect()
    const top = Math.max(20, rect.bottom + 10)
    const left = Math.max(20, Math.min(window.innerWidth - 480, rect.left))

    setSelectionToolbar(null)
    setInlineAi({
      isOpen: true,
      targetText: text,
      position: { top, left },
      range
    })
  }

  // Open Inline AI Modal for a hovered block
  const handleOpenAiForBlock = (element: HTMLElement, text: string) => {
    const rect = element.getBoundingClientRect()
    setInlineAi({
      isOpen: true,
      targetText: text,
      position: {
        top: Math.max(20, rect.bottom + 8),
        left: Math.max(20, Math.min(window.innerWidth - 480, rect.left))
      },
      targetBlock: element
    })
  }

  // Apply result from Inline AI Modal
  const handleApplyInlineAi = (generatedText: string, action: 'replace' | 'insert-below') => {
    pushHistorySnapshot(true)

    if (inlineAi.targetBlock) {
      const block = inlineAi.targetBlock
      if (action === 'replace') {
        const p = document.createElement('p')
        p.className = 'my-0.5 text-zinc-300 leading-[1.5]'
        p.innerHTML = formatInlineHtml(generatedText, allNotes) || '<br>'
        block.replaceWith(p)
      } else {
        const p = document.createElement('p')
        p.className = 'my-0.5 text-zinc-300 leading-[1.5]'
        p.innerHTML = formatInlineHtml(generatedText, allNotes) || '<br>'
        block.after(p)
      }
    } else if (inlineAi.range) {
      const range = inlineAi.range
      const sel = window.getSelection()
      sel?.removeAllRanges()
      sel?.addRange(range)

      if (action === 'replace') {
        document.execCommand('insertHTML', false, formatInlineHtml(generatedText, allNotes))
      } else {
        range.collapse(false)
        const p = document.createElement('p')
        p.className = 'my-0.5 text-zinc-300 leading-[1.5]'
        p.innerHTML = formatInlineHtml(generatedText, allNotes) || '<br>'
        const block = range.startContainer instanceof HTMLElement
          ? range.startContainer.closest('p, div, h1, h2, h3, li')
          : range.startContainer.parentElement?.closest('p, div, h1, h2, h3, li')
        if (block) {
          block.after(p)
        } else {
          document.execCommand('insertHTML', false, `\n\n${generatedText}`)
        }
      }
    } else {
      insertBlock(`<p class="my-0.5 text-zinc-300 leading-[1.5]">${formatInlineHtml(generatedText, allNotes)}</p>`)
    }

    refreshBlocks()
    persistContent()
    setInlineAi({ isOpen: false, targetText: '', position: { top: 0, left: 0 } })
  }

  // AppFlowy Block Gutter & Comments Handlers
  const handleEditorMouseMove = (e: React.MouseEvent) => {
    if (!isEditable || inlineAi.isOpen) return
    const container = containerRef.current
    if (!container) return

    let target = e.target as HTMLElement | null
    while (target && target.parentElement !== container) {
      target = target.parentElement
    }

    if (target && target !== container) {
      if (gutterLeaveTimeoutRef.current) {
        clearTimeout(gutterLeaveTimeoutRef.current)
        gutterLeaveTimeoutRef.current = null
      }
      const rect = target.getBoundingClientRect()
      const containerRect = container.getBoundingClientRect()
      setHoveredBlock({
        element: target,
        top: rect.top,
        left: Math.max(8, containerRect.left - 48),
        right: containerRect.right
      })
    }
  }

  const handleEditorMouseLeave = (e: React.MouseEvent) => {
    if (gutterLeaveTimeoutRef.current) {
      clearTimeout(gutterLeaveTimeoutRef.current)
    }
    const related = e.relatedTarget as HTMLElement | null
    if (related?.closest('.appflowy-block-gutter') || related?.closest('.group\\/addcomment')) {
      return
    }
    // Give 600ms grace period so moving towards gutter or comment button is smooth and never flickers
    gutterLeaveTimeoutRef.current = setTimeout(() => {
      setHoveredBlock(null)
    }, 600)
    setDropIndicator(null)
  }

  const handleBlockInsertBelow = (element: HTMLElement) => {
    pushHistorySnapshot(true)
    const newP = document.createElement('p')
    newP.className = 'my-0.5 text-zinc-300 leading-[1.5]'
    newP.innerHTML = '<br>'
    element.after(newP)
    refreshBlocks()
    persistContent()

    const sel = window.getSelection()
    const r = document.createRange()
    r.selectNodeContents(newP)
    r.collapse(true)
    sel?.removeAllRanges()
    sel?.addRange(r)
  }

  const handleBlockDelete = (element: HTMLElement) => {
    pushHistorySnapshot(true)
    element.remove()
    refreshBlocks()
    persistContent()
    setHoveredBlock(null)
  }

  const handleBlockDuplicate = (element: HTMLElement) => {
    pushHistorySnapshot(true)
    const clone = element.cloneNode(true) as HTMLElement
    element.after(clone)
    refreshBlocks()
    persistContent()
  }

  const handleBlockMove = (element: HTMLElement, direction: 'up' | 'down') => {
    pushHistorySnapshot(true)
    if (direction === 'up' && element.previousElementSibling) {
      element.parentElement?.insertBefore(element, element.previousElementSibling)
    } else if (direction === 'down' && element.nextElementSibling) {
      element.parentElement?.insertBefore(element.nextElementSibling, element)
    }
    refreshBlocks()
    persistContent()

    const rect = element.getBoundingClientRect()
    const containerRect = containerRef.current?.getBoundingClientRect()
    if (containerRect) {
      setHoveredBlock({
        element,
        top: rect.top,
        left: Math.max(8, containerRect.left - 48),
        right: containerRect.right
      })
    }
  }

  const handleBlockTransform = (element: HTMLElement, type: 'p' | 'h1' | 'h2' | 'h3' | 'task' | 'bullet' | 'number' | 'callout' | 'code') => {
    pushHistorySnapshot(true)
    const rawText = element.textContent?.trim() || ''

    if (type === 'h1') {
      const h1 = document.createElement('h1')
      h1.className = 'text-2xl font-serif font-bold text-zinc-100 my-3 pb-1 border-b border-zinc-800/60 tracking-tight'
      h1.innerHTML = formatInlineHtml(rawText, allNotes) || '<br>'
      element.replaceWith(h1)
    } else if (type === 'h2') {
      const h2 = document.createElement('h2')
      h2.className = 'text-xl font-serif font-semibold text-zinc-200 mt-6 mb-2 tracking-tight'
      h2.innerHTML = formatInlineHtml(rawText, allNotes) || '<br>'
      element.replaceWith(h2)
    } else if (type === 'h3') {
      const h3 = document.createElement('h3')
      h3.className = 'text-lg font-serif font-medium text-zinc-200 mt-4 mb-1.5 tracking-tight'
      h3.innerHTML = formatInlineHtml(rawText, allNotes) || '<br>'
      element.replaceWith(h3)
    } else if (type === 'task') {
      const task = document.createElement('div')
      task.className = 'task-item flex items-start gap-2.5 my-1.5 group'
      task.setAttribute('data-type', 'task')
      task.innerHTML = `
        <input type="checkbox" contenteditable="false" class="task-checkbox mt-1 w-4 h-4 cursor-pointer shrink-0 select-none" />
        <span class="task-text flex-1 text-[13px] md:text-sm text-zinc-200 leading-relaxed">${formatInlineHtml(rawText, allNotes) || '<br>'}</span>
      `
      element.replaceWith(task)
    } else if (type === 'bullet') {
      const ul = document.createElement('ul')
      ul.className = 'list-disc pl-5 my-1.5 space-y-0.5 text-zinc-300'
      ul.innerHTML = `<li>${formatInlineHtml(rawText, allNotes) || '<br>'}</li>`
      element.replaceWith(ul)
    } else if (type === 'number') {
      const ol = document.createElement('ol')
      ol.className = 'list-decimal pl-5 my-1.5 space-y-0.5 text-zinc-300'
      ol.innerHTML = `<li>${formatInlineHtml(rawText, allNotes) || '<br>'}</li>`
      element.replaceWith(ol)
    } else if (type === 'callout') {
      const shell = document.createElement('div')
      shell.innerHTML = calloutShell({ type: 'NOTE', title: '', content: rawText })
      element.replaceWith(shell.firstElementChild || shell)
    } else if (type === 'code') {
      const shell = document.createElement('div')
      shell.innerHTML = codeShell({ title: '', language: '', content: rawText })
      element.replaceWith(shell.firstElementChild || shell)
    } else {
      const p = document.createElement('p')
      p.className = 'my-0.5 text-zinc-300 leading-[1.5]'
      p.innerHTML = formatInlineHtml(rawText, allNotes) || '<br>'
      element.replaceWith(p)
    }

    refreshBlocks()
    persistContent()
    setHoveredBlock(null)
  }

  const handleBlockDragStart = (e: React.DragEvent, element: HTMLElement) => {
    e.dataTransfer.setData('text/plain', element.textContent || '')
    e.dataTransfer.effectAllowed = 'move'
    setDraggedBlock(element)
    element.classList.add('opacity-40')
  }

  const handleBlockDragEnd = () => {
    if (draggedBlock) {
      draggedBlock.classList.remove('opacity-40')
      setDraggedBlock(null)
    }
    setDropIndicator(null)
  }

  const handleEditorDragOver = (e: React.DragEvent) => {
    if (!draggedBlock || !containerRef.current) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'

    const container = containerRef.current
    let target = e.target as HTMLElement | null
    while (target && target.parentElement !== container) {
      target = target.parentElement
    }

    if (target && target !== container && target !== draggedBlock) {
      const rect = target.getBoundingClientRect()
      const isAfter = e.clientY > rect.top + rect.height / 2
      const lineY = isAfter ? rect.bottom : rect.top

      setDropIndicator({
        top: lineY,
        left: rect.left,
        width: rect.width
      })
    } else {
      setDropIndicator(null)
    }
  }

  const handleEditorDrop = (e: React.DragEvent) => {
    if (!draggedBlock || !containerRef.current) return
    e.preventDefault()
    draggedBlock.classList.remove('opacity-40')
    setDropIndicator(null)

    const container = containerRef.current
    let target = e.target as HTMLElement | null
    while (target && target.parentElement !== container) {
      target = target.parentElement
    }

    if (target && target !== container && target !== draggedBlock) {
      pushHistorySnapshot(true)
      const rect = target.getBoundingClientRect()
      const isAfter = e.clientY > rect.top + rect.height / 2
      if (isAfter) {
        target.after(draggedBlock)
      } else {
        target.before(draggedBlock)
      }
      refreshBlocks()
      persistContent()
    }
    setDraggedBlock(null)
  }

  // Handle click delegation (wikilink navigation, task checkboxes, code copy)
  const handleEditorClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && containerRef.current && isEditable) {
      focusBlankEditorLine(containerRef.current, e.clientY)
      return
    }
    // 1. Wikilink Navigation Click (Always follows the link to open the target note)
    const wikiTargetEl = (e.target as HTMLElement).closest('.wiki-link') as HTMLElement | null
    if (wikiTargetEl) {
      e.preventDefault()
      e.stopPropagation()
      const destination = wikiTargetEl.getAttribute('data-wiki')
      if (destination && onNavigate) {
        onNavigate(destination)
      }
      return
    }

    // 2. Task Checkbox Toggle Click
    const checkbox = (e.target as HTMLElement).closest('.task-checkbox') as HTMLInputElement | null
    if (checkbox) {
      pushHistorySnapshot(true)
      if (checkbox.checked) {
        checkbox.setAttribute('checked', 'checked')
      } else {
        checkbox.removeAttribute('checked')
      }
      const taskItem = checkbox.closest('.task-item')
      const textSpan = taskItem?.querySelector('.task-text')
      if (textSpan) {
        if (checkbox.checked) {
          textSpan.classList.add('line-through', 'text-zinc-500')
          textSpan.classList.remove('text-zinc-200')
        } else {
          textSpan.classList.remove('line-through', 'text-zinc-500')
          textSpan.classList.add('text-zinc-200')
        }
      }
      handleSync()
      return
    }

    // 3. Copy Code Button Click
    const copyBtn = (e.target as HTMLElement).closest('.copy-code-btn')
    if (copyBtn) {
      const codeWrapper = copyBtn.closest('.code-block-wrapper')
      const rawCode = decodeURIComponent(codeWrapper?.getAttribute('data-raw-code') || '')
      if (rawCode) {
        navigator.clipboard.writeText(rawCode)
        copyBtn.textContent = 'Copiado!'
        setTimeout(() => {
          copyBtn.textContent = 'Copiar'
        }, 2000)
      }
      return
    }
  }

  // Table changes are persisted immediately; the DOM wrapper is the Markdown source of truth.
  const updateTable = (wrapper: HTMLElement, markdown: string) => {
    if (!containerRef.current?.contains(wrapper)) return
    wrapper.dataset.rawTable = encodeURIComponent(markdown)
    persistContent()
  }
  const exitBlock = (wrapper: HTMLElement) => {
    if (containerRef.current) exitEditorBlock(containerRef.current, wrapper)
  }
  const deleteBlock = (wrapper: HTMLElement) => {
    if (!containerRef.current?.contains(wrapper)) return
    exitBlock(wrapper)
    wrapper.remove()
    refreshBlocks()
    persistContent()
  }
  const updateCode = (wrapper: HTMLElement, block: CodeBlockData) => {
    if (!containerRef.current?.contains(wrapper)) return
    wrapper.dataset.rawCode = encodeURIComponent(block.content)
    wrapper.dataset.codeLang = block.language
    wrapper.dataset.codeTitle = encodeURIComponent(block.title)
    persistContent()
  }
  const updateCallout = (wrapper: HTMLElement, block: CalloutData) => {
    if (!containerRef.current?.contains(wrapper)) return
    wrapper.dataset.rawCallout = encodeURIComponent(block.content)
    wrapper.dataset.calloutType = block.type
    wrapper.dataset.calloutTitle = encodeURIComponent(block.title)
    persistContent()
  }

  // Handle right-click context menu (e.g. edit wikilink in place)
  const handleEditorContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    const wikiTargetEl = (e.target as HTMLElement).closest('.wiki-link') as HTMLElement | null
    if (wikiTargetEl && isEditable) {
      e.preventDefault()
      e.stopPropagation()
      const targetTitle = wikiTargetEl.getAttribute('data-wiki') || ''
      const alias = wikiTargetEl.getAttribute('data-alias') || ''
      const rect = wikiTargetEl.getBoundingClientRect()
      setSelectionToolbar(null)
      setLinkPickerPopover({
        isOpen: true,
        top: Math.max(20, rect.bottom + 6),
        left: Math.max(20, Math.min(window.innerWidth - 300, rect.left)),
        selectedText: alias || targetTitle,
        alias,
        targetElement: wikiTargetEl,
        query: targetTitle,
        index: 0
      })
      return
    }
  }

  // Filter commands and notes for menus
  const filteredSlashCommands = SLASH_COMMANDS.filter(cmd => {
    if (!slashMenu?.query) return true
    const q = slashMenu.query
    return (
      cmd.title.toLowerCase().includes(q) ||
      cmd.id.toLowerCase().includes(q) ||
      cmd.keywords.some(k => k.toLowerCase().includes(q))
    )
  })

  const filteredWikiNotes = allNotes.filter(n => {
    if (!wikiSuggest?.query) return true
    return n.title.toLowerCase().includes(wikiSuggest.query)
  })

  return (
    <div
      className="w-full min-h-[500px] relative pb-28"
      onMouseMove={(e) => {
        // If mouse is moving in the horizontal corridor of the active block row, maintain hover
        if (gutterLeaveTimeoutRef.current && hoveredBlock) {
          const rect = hoveredBlock.element.getBoundingClientRect()
          if (e.clientY >= rect.top - 12 && e.clientY <= rect.bottom + 12) {
            clearTimeout(gutterLeaveTimeoutRef.current)
            gutterLeaveTimeoutRef.current = null
          }
        }
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && containerRef.current && isEditable) {
          focusBlankEditorLine(containerRef.current, e.clientY)
        }
      }}
    >
      {/* The Single Unified Dynamic Content Surface (Like Notion / AppFlowy) */}
      <div
        ref={containerRef}
        contentEditable={isEditable}
        suppressContentEditableWarning
        onInput={handleInput}
        onBlur={() => { if (isEditable) persistContent() }}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onMouseUp={handleSelectionCheck}
        onKeyUp={handleSelectionCheck}
        onClick={handleEditorClick}
        onContextMenu={handleEditorContextMenu}
        onMouseMove={handleEditorMouseMove}
        onMouseLeave={handleEditorMouseLeave}
        onDragOver={handleEditorDragOver}
        onDrop={handleEditorDrop}
        onCompositionStart={() => { isComposingRef.current = true }}
        onCompositionEnd={() => {
          isComposingRef.current = false
          handleInput()
        }}
        className={`pyrite-editor-surface w-full min-h-[400px] focus:outline-none font-sans text-zinc-300 leading-[1.5] ${fontSizeClass} select-text`}
      />

      {blockHosts.map(block => createPortal(block.kind === 'table'
        ? <EditableTable markdown={decodeURIComponent(block.wrapper.dataset.rawTable || '')} readOnly={!isEditable} renderInline={text => formatInlineHtml(text, allNotes)} onNavigate={onNavigate} allNotes={allNotes} onChange={markdown => updateTable(block.wrapper, markdown)} onDelete={() => deleteBlock(block.wrapper)} onExit={() => exitBlock(block.wrapper)} />
        : block.kind === 'code'
          ? <EditableCodeBlock initial={{ content: decodeURIComponent(block.wrapper.dataset.rawCode || ''), title: decodeURIComponent(block.wrapper.dataset.codeTitle || ''), language: block.wrapper.dataset.codeLang || '' }} readOnly={!isEditable} onChange={data => updateCode(block.wrapper, data)} onDelete={() => deleteBlock(block.wrapper)} onExit={() => exitBlock(block.wrapper)} />
          : <EditableCallout initial={{ type: block.wrapper.dataset.calloutType || 'NOTE', title: decodeURIComponent(block.wrapper.dataset.calloutTitle || ''), content: decodeURIComponent(block.wrapper.dataset.rawCallout || '') }} readOnly={!isEditable} renderInline={text => formatInlineHtml(text, allNotes)} onChange={data => updateCallout(block.wrapper, data)} onDelete={() => deleteBlock(block.wrapper)} onExit={() => exitBlock(block.wrapper)} />, block.host, block.id))}

      {/* AppFlowy-style Block Gutter Handle (Drag handle & Block options menu) */}
      <EditorBlockGutter
        hoveredBlock={hoveredBlock}
        isEditable={isEditable}
        onMouseEnter={() => {
          if (gutterLeaveTimeoutRef.current) {
            clearTimeout(gutterLeaveTimeoutRef.current)
            gutterLeaveTimeoutRef.current = null
          }
        }}
        onMouseLeave={() => {
          gutterLeaveTimeoutRef.current = setTimeout(() => {
            setHoveredBlock(null)
          }, 300)
        }}
        onInsertBelow={handleBlockInsertBelow}
        onDeleteBlock={handleBlockDelete}
        onDuplicateBlock={handleBlockDuplicate}
        onMoveBlock={handleBlockMove}
        onTransformBlock={handleBlockTransform}
        onAskAi={handleOpenAiForBlock}
        onDragStart={handleBlockDragStart}
        onDragEnd={handleBlockDragEnd}
      />

      {/* Right-Side Block Comments (+ Icon on Hover, Pinned Avatar Speech Bubble & Expanding Card) */}
      <EditorBlockComments
        noteId={note.id}
        hoveredBlock={hoveredBlock}
        containerRef={containerRef}
        isEditable={isEditable}
        onMouseEnter={() => {
          if (gutterLeaveTimeoutRef.current) {
            clearTimeout(gutterLeaveTimeoutRef.current)
            gutterLeaveTimeoutRef.current = null
          }
        }}
        onMouseLeave={() => {
          gutterLeaveTimeoutRef.current = setTimeout(() => {
            setHoveredBlock(null)
          }, 600)
        }}
      />

      {/* AppFlowy-style Drop Line Indicator */}
      {dropIndicator && (
        <div
          style={{
            position: 'fixed',
            top: `${dropIndicator.top - 1}px`,
            left: `${dropIndicator.left}px`,
            width: `${dropIndicator.width}px`,
            zIndex: 9999
          }}
          className="pointer-events-none h-[2px] bg-[var(--accent)] rounded-full shadow-[0_0_8px_var(--accent-glow)] transition-all duration-75"
        >
          <div className="absolute -left-1 -top-1 w-2.5 h-2.5 rounded-full bg-[var(--accent)] shadow-[0_0_6px_var(--accent-glow)]" />
        </div>
      )}

      {/* AppFlowy-style Inline AI Floating Modal */}
      <EditorInlineAiModal
        isOpen={inlineAi.isOpen}
        targetText={inlineAi.targetText}
        position={inlineAi.position}
        onApply={handleApplyInlineAi}
        onClose={() => setInlineAi({ isOpen: false, targetText: '', position: { top: 0, left: 0 } })}
      />

      {/* Floating Notion/AppFlowy Selection Popover Toolbar */}
      {isEditable && selectionToolbar && (
        <div
          style={{
            position: 'fixed',
            top: `${selectionToolbar.top}px`,
            left: `${selectionToolbar.left}px`,
            transform: 'translateX(-50%)',
            zIndex: 9999
          }}
          onMouseDown={e => e.preventDefault()}
          className="editor-selection-toolbar flex items-center gap-0.5 px-2 py-1.5 bg-[#141418]/95 border border-zinc-800 rounded-xl shadow-2xl backdrop-blur-md animate-in fade-in zoom-in-95 duration-100 select-none shadow-black/80 text-xs"
        >
          {/* Perguntar à IA / Transformar com IA Button (Icon-only, Cor de Destaque) */}
          <button
            type="button"
            onMouseDown={e => {
              e.preventDefault()
              e.stopPropagation()
              handleOpenAiForSelection()
            }}
            onClick={e => {
              e.preventDefault()
              e.stopPropagation()
              handleOpenAiForSelection()
            }}
            className="p-1.5 rounded-lg text-[var(--accent)] hover:text-white bg-[var(--accent-glow-subtle)] hover:bg-[var(--accent)]/30 border border-[var(--accent)]/40 transition-all cursor-pointer flex items-center justify-center"
            title="Pedir à IA para melhorar, resumir ou continuar este texto"
          >
            <Sparkles className="w-3.5 h-3.5" />
          </button>

          <div className="w-[1px] h-4 bg-zinc-800 mx-0.5" />

          {/* Conectar com Nota / Wikilink [[...]] Button (Cor de Destaque) */}
          <button
            type="button"
            onMouseDown={e => {
              e.preventDefault()
              handleToolbarWrap('link')
            }}
            className="p-1.5 rounded-lg text-[var(--accent)] hover:text-white bg-transparent hover:bg-[var(--accent-glow-subtle)] border border-[var(--accent)]/40 transition-all shadow-xs cursor-pointer flex items-center justify-center"
            title="Linkar nota"
          >
            <Link2 className="w-3.5 h-3.5" />
          </button>

          <div className="w-[1px] h-4 bg-zinc-800 mx-0.5" />

          {/* Tamanhos de títulos (H1, H2, H3) */}
          <button
            type="button"
            onMouseDown={e => {
              e.preventDefault()
              handleToolbarWrap('h1')
            }}
            className="px-1.5 py-1 rounded-lg text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer font-bold text-[11px]"
            title="Título H1"
          >
            H1
          </button>
          <button
            type="button"
            onMouseDown={e => {
              e.preventDefault()
              handleToolbarWrap('h2')
            }}
            className="px-1.5 py-1 rounded-lg text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer font-bold text-[11px]"
            title="Título H2"
          >
            H2
          </button>
          <button
            type="button"
            onMouseDown={e => {
              e.preventDefault()
              handleToolbarWrap('h3')
            }}
            className="px-1.5 py-1 rounded-lg text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer font-bold text-[11px]"
            title="Título H3"
          >
            H3
          </button>

          <div className="w-[1px] h-4 bg-zinc-800 mx-0.5" />

          {/* Lista de tarefas */}
          <button
            type="button"
            onMouseDown={e => {
              e.preventDefault()
              handleToolbarWrap('task')
            }}
            className="p-1.5 rounded-lg text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer flex items-center justify-center"
            title="Lista de Tarefas"
          >
            <ListTodo className="w-3.5 h-3.5" />
          </button>

          {/* Lista de marcadores */}
          <button
            type="button"
            onMouseDown={e => {
              e.preventDefault()
              handleToolbarWrap('bullet')
            }}
            className="p-1.5 rounded-lg text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer flex items-center justify-center"
            title="Lista com Marcadores"
          >
            <List className="w-3.5 h-3.5" />
          </button>

          {/* Callout (Cor de Destaque) */}
          <button
            type="button"
            onMouseDown={e => {
              e.preventDefault()
              handleToolbarWrap('callout')
            }}
            className="p-1.5 rounded-lg text-[var(--accent)] hover:text-white hover:bg-[var(--accent-glow-subtle)] transition-colors cursor-pointer flex items-center justify-center"
            title="Inserir Callout / Caixa de Destaque"
          >
            <MessageSquareText className="w-3.5 h-3.5" />
          </button>

          <div className="w-[1px] h-4 bg-zinc-800 mx-0.5" />

          {/* Bold Button */}
          <button
            type="button"
            onMouseDown={e => {
              e.preventDefault()
              handleToolbarWrap('bold')
            }}
            className="p-1.5 rounded-lg text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
            title="Negrito (**)"
          >
            <Bold className="w-3.5 h-3.5" />
          </button>

          {/* Italic Button */}
          <button
            type="button"
            onMouseDown={e => {
              e.preventDefault()
              handleToolbarWrap('italic')
            }}
            className="p-1.5 rounded-lg text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
            title="Itálico (*)"
          >
            <Italic className="w-3.5 h-3.5" />
          </button>

          {/* Highlight Button (Cor de Destaque) */}
          <button
            type="button"
            onMouseDown={e => {
              e.preventDefault()
              handleToolbarWrap('highlight')
            }}
            className="p-1.5 rounded-lg text-[var(--accent)] hover:text-white hover:bg-[var(--accent-glow-subtle)] transition-colors cursor-pointer"
            title="Destaque (==)"
          >
            <Highlighter className="w-3.5 h-3.5" />
          </button>

          {/* Strikethrough Button */}
          <button
            type="button"
            onMouseDown={e => {
              e.preventDefault()
              handleToolbarWrap('strike')
            }}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
            title="Tachado (~~)"
          >
            <Strikethrough className="w-3.5 h-3.5" />
          </button>

          {/* Code Button */}
          <button
            type="button"
            onMouseDown={e => {
              e.preventDefault()
              handleToolbarWrap('code')
            }}
            className="p-1.5 rounded-lg text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
            title="Código em linha (`)"
          >
            <Code className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Floating Link Search / Picker Popover */}
      {isEditable && linkPickerPopover && (
        <div
          ref={linkPickerRef}
          style={{
            position: 'fixed',
            top: `${linkPickerPopover.top}px`,
            left: `${linkPickerPopover.left}px`,
            zIndex: 9999
          }}
          onMouseDown={e => e.stopPropagation()}
          className="w-72 bg-[#16161b] border border-zinc-700/80 rounded-xl shadow-2xl p-2 z-50 text-xs text-zinc-200 animate-in fade-in zoom-in-95 duration-100 select-none shadow-black/80"
        >
          <div className="flex items-center gap-1.5 px-2 py-1 bg-zinc-900 border border-zinc-750 rounded-lg mb-1.5">
            <Link2 className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
            <input
              autoFocus
              type="text"
              value={linkPickerPopover.query}
              onChange={e => setLinkPickerPopover(prev => prev ? { ...prev, query: e.target.value, index: 0 } : null)}
              onKeyDown={e => {
                const matches = allNotes.filter(n => !linkPickerPopover.query || n.title.toLowerCase().includes(linkPickerPopover.query.toLowerCase())).slice(0, 8)
                if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  if (matches.length > 0) {
                    setLinkPickerPopover(prev => prev ? { ...prev, index: (prev.index + 1) % matches.length } : null)
                  }
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault()
                  if (matches.length > 0) {
                    setLinkPickerPopover(prev => prev ? { ...prev, index: (prev.index - 1 + matches.length) % matches.length } : null)
                  }
                } else if (e.key === 'Enter') {
                  e.preventDefault()
                  handleConfirmLinkPicker()
                } else if (e.key === 'Escape') {
                  e.preventDefault()
                  setLinkPickerPopover(null)
                }
              }}
              placeholder="Buscar nota para linkar..."
              className="w-full bg-transparent border-0 outline-none text-xs text-zinc-100 placeholder:text-zinc-500"
            />
            <button
              type="button"
              onClick={() => setLinkPickerPopover(null)}
              className="p-0.5 rounded text-zinc-500 hover:text-zinc-300 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* List of matching notes */}
          <div className="max-h-48 overflow-y-auto space-y-0.5 custom-chat-scrollbar">
            {allNotes
              .filter(n => !linkPickerPopover.query || n.title.toLowerCase().includes(linkPickerPopover.query.toLowerCase()))
              .slice(0, 8)
              .map((noteItem, idx) => {
                const isSel = idx === linkPickerPopover.index
                return (
                  <button
                    key={noteItem.id}
                    type="button"
                    onMouseDown={e => {
                      e.preventDefault()
                      handleApplyLink(noteItem.title)
                    }}
                    style={isSel ? {
                      backgroundColor: 'var(--accent)',
                      color: 'var(--accent-contrast, #09090b)'
                    } : undefined}
                    className={`w-full text-left px-2 py-1.5 rounded-lg flex items-center justify-between transition-colors cursor-pointer ${
                      isSel ? 'shadow-sm font-medium' : 'hover:bg-zinc-800 text-zinc-300'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 truncate">
                      <FileText className="w-3 h-3 shrink-0 opacity-70" />
                      <span className="truncate">{noteItem.title}</span>
                    </div>
                    <span 
                      className="text-[10px] shrink-0"
                      style={isSel ? {
                        color: 'var(--accent-contrast-muted, rgba(9,9,11,0.70))'
                      } : undefined}
                    >
                      {noteItem.folder}
                    </span>
                  </button>
                )
              })}

            {linkPickerPopover.query.trim() && (
              <button
                type="button"
                onMouseDown={e => {
                  e.preventDefault()
                  handleApplyLink(linkPickerPopover.query.trim())
                }}
                className="w-full text-left px-2 py-1.5 rounded-lg text-zinc-400 hover:bg-zinc-800 flex items-center gap-1.5 transition-colors cursor-pointer border-t border-zinc-800/80 mt-1"
              >
                <span className="text-[11px] truncate">Link para: <strong className="text-[var(--accent)]">"{linkPickerPopover.query.trim()}"</strong></span>
              </button>
            )}

            {linkPickerPopover.targetElement && (
              <button
                type="button"
                onMouseDown={e => {
                  e.preventDefault()
                  handleRemoveLink()
                }}
                className="w-full text-left px-2 py-1.5 rounded-lg text-rose-400 hover:bg-rose-500/10 flex items-center gap-1.5 transition-colors cursor-pointer border-t border-zinc-800/80 mt-1 text-[11px]"
              >
                <span>Desvincular (remover link)</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Floating Slash Command (/) Menu */}
      {isEditable && slashMenu && filteredSlashCommands.length > 0 && (
        <div
          style={{
            position: 'fixed',
            top: `${slashMenu.top}px`,
            left: `${slashMenu.left}px`,
            zIndex: 9999
          }}
          role="listbox"
          aria-label="Comandos rápidos"
          onMouseDown={e => e.preventDefault()}
          className="editor-command-menu"
        >
          <div className="editor-command-heading">
            <span>Comandos Rápidos</span>
            <span className="text-zinc-500 font-mono text-[10px]">↵ Inserir</span>
          </div>
          <div className="editor-command-items">
            {filteredSlashCommands.map((cmd, cIdx) => {
              const isSelected = cIdx === slashMenu.index
              return (
                <div
                  key={cmd.id}
                  role="option"
                  aria-selected={isSelected}
                  onMouseDown={e => {
                    e.preventDefault()
                    executeSlashCommand(cmd.id)
                  }}
                  onMouseEnter={() => setSlashMenu(prev => (prev ? { ...prev, index: cIdx } : null))}
                  className={`editor-command-item${isSelected ? ' is-selected' : ''}`}
                >
                  {cmd.icon}
                  <span className="truncate">{cmd.title}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Floating Wikilink [[ Auto-complete Menu */}
      {isEditable && wikiSuggest && filteredWikiNotes.length > 0 && (
        <div
          style={{
            position: 'fixed',
            top: `${wikiSuggest.top}px`,
            left: `${wikiSuggest.left}px`,
            zIndex: 9999
          }}
          onMouseDown={e => e.preventDefault()}
          className="editor-wikilink-menu w-72 bg-[#141418] border border-amber-500/40 rounded-xl shadow-2xl p-1.5 overflow-hidden backdrop-blur-md animate-in fade-in zoom-in-95 duration-100 select-none shadow-black/80"
        >
          <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-amber-400 border-b border-zinc-800 flex items-center justify-between">
            <span className="flex items-center gap-1">
              <span className="font-mono text-amber-300">[[</span> Link para Nota
            </span>
            <span className="text-zinc-500 font-mono text-[10px]">↵ Inserir</span>
          </div>
          <div className="max-h-56 overflow-y-auto space-y-0.5 pt-1 scrollbar-none">
            {filteredWikiNotes.map((targetNote, nIdx) => {
              const isSelected = nIdx === wikiSuggest.index
              return (
                <div
                  key={targetNote.id}
                  onMouseDown={e => {
                    e.preventDefault()
                    handleSelectWikiSuggestion(targetNote.title)
                  }}
                  onMouseEnter={() => setWikiSuggest(prev => (prev ? { ...prev, index: nIdx } : null))}
                  className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-amber-500/15 text-amber-200 border border-amber-500/40 shadow-sm'
                      : 'text-zinc-300 hover:bg-zinc-800/60'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <div className="truncate flex-1">
                    <div className="text-xs font-medium text-zinc-100 truncate">{targetNote.title}</div>
                    <div className="text-[10px] text-zinc-500 truncate">{targetNote.folder}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
