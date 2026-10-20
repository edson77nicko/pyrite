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
  AlertTriangle
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
      const [target, alias] = inner.split('|')
      const destination = target.split('#')[0].replace(/[\[\]]/g, '').trim()
      const displayName = (alias || target).split('#')[0].replace(/[\[\]]/g, '').trim()
      const exists = allNotes.some(n => n.title.toLowerCase().trim() === destination.toLowerCase().trim())

      const pillClass = exists
        ? 'text-[var(--accent)] hover:opacity-90 bg-[var(--accent-glow-subtle)] border border-[var(--accent)]/30'
        : 'text-zinc-400 hover:text-zinc-200 bg-zinc-800/60 hover:bg-zinc-800 border border-dashed border-zinc-700/80'

      return `<span class="wiki-link inline-flex items-center cursor-pointer font-medium select-none rounded px-1.5 py-0 mx-0.5 text-xs transition-colors shadow-sm ${pillClass}" contenteditable="false" data-wiki="${escapeHtml(destination)}" title="${exists ? `Abrir nota: &quot;${destination}&quot;` : `Criar nota: &quot;${destination}&quot;`}"><span class="underline decoration-[var(--accent)]/40 hover:decoration-[var(--accent)] underline-offset-2">${escapeHtml(displayName)}</span></span>`
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
    return '<p class="my-1.5 text-[13px] md:text-sm text-zinc-300 leading-relaxed"><br></p>'
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
        <ul class="list-disc pl-5 my-1.5 space-y-0.5 text-zinc-300 text-[13px] md:text-sm">
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
        <ol class="list-decimal pl-5 my-1.5 space-y-0.5 text-zinc-300 text-[13px] md:text-sm">
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
      htmlParts.push(`<p class="my-1 text-[13px] md:text-sm text-zinc-300 leading-relaxed"><br></p>`)
      i++
      continue
    }

    // Standard Paragraph
    htmlParts.push(`<p class="my-1.5 text-[13px] md:text-sm text-zinc-300 leading-relaxed">${formatInlineHtml(line, allNotes)}</p>`)
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
        return `[[${dest}]]`
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
  } | null>(null)

  const isEditable = displayMode === 'live'

  useEffect(() => {
    if (slashMenu) document.querySelector('.editor-command-item[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [slashMenu])

  // Debounced Markdown Synchronization to parent state
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
    }, 250)
  }, [onUpdateContent])

  const persistContent = () => {
    if (!containerRef.current) return
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current)
    const markdown = domToMarkdown(containerRef.current)
    lastSyncedMdRef.current = markdown
    onUpdateContent(markdown)
  }

  useEffect(() => () => { if (syncTimerRef.current) clearTimeout(syncTimerRef.current) }, [])

  // Synchronize initial HTML when note changes or on external update
  useEffect(() => {
    if (!containerRef.current) return

    // If switching notes
    if (currentNoteIdRef.current !== note.id) {
      currentNoteIdRef.current = note.id
      lastSyncedMdRef.current = note.content
      containerRef.current.innerHTML = markdownToHtml(note.content, allNotes, note.title)
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
      containerRef.current.innerHTML = markdownToHtml(note.content, allNotes, note.title)
      refreshBlocks()
    }
  }, [note.id, note.content, note.title, allNotes, refreshBlocks])

  const insertBlock = (html: string) => {
    if (!containerRef.current) return
    insertEditorBlock(containerRef.current, html)
    refreshBlocks()
    setSelectionToolbar(null)
    persistContent()
  }
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

  // Expose formatting commands to top toolbar via ref
  useImperativeHandle(editorRef, () => ({
    setBlockType: (type: LiveBlock['type']) => {
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
        const taskHtml = `
          <div class="task-item flex items-start gap-2.5 my-1.5 group" data-type="task">
            <input type="checkbox" contenteditable="false" class="task-checkbox mt-1 w-4 h-4 cursor-pointer shrink-0 select-none" />
            <span class="task-text flex-1 text-[13px] md:text-sm text-zinc-200 leading-relaxed">Nova tarefa...</span>
          </div>
        `
        insertBlock(taskHtml)
      } else {
        formatBlockSafe('p')
      }
      handleSync()
    },
    toggleBold: () => {
      document.execCommand('bold')
      handleSync()
    },
    toggleItalic: () => {
      document.execCommand('italic')
      handleSync()
    },
    insertWikiLink: (target: string) => {
      insertWikiLinkHtml(target)
      handleSync()
    },
    insertCodeBlock: () => insertBlock(codeShell({ title: '', language: '', content: '' })),
    insertCallout: (type: string) => insertBlock(calloutShell({ type: type.toUpperCase() || 'NOTE', title: '', content: '' })),
    insertTable: insertTableBlock
  }))

  const insertWikiLinkHtml = (targetTitle: string) => {
    const exists = allNotes.some(n => n.title.toLowerCase().trim() === targetTitle.toLowerCase().trim())
    const pillClass = exists
      ? 'text-amber-300 hover:text-amber-100 bg-amber-950/30 hover:bg-amber-900/50 border border-amber-800/40'
      : 'text-zinc-400 hover:text-zinc-200 bg-zinc-800/60 hover:bg-zinc-800 border border-dashed border-zinc-700/80'

    const linkHtml = `<span class="wiki-link inline-flex items-center cursor-pointer font-medium select-none rounded px-1.5 py-0 mx-0.5 text-xs transition-colors shadow-sm ${pillClass}" contenteditable="false" data-wiki="${escapeHtml(targetTitle)}" title="${exists ? `Abrir nota: &quot;${targetTitle}&quot;` : `Criar nota: &quot;${targetTitle}&quot;`}"><span class="underline decoration-amber-500/40 hover:decoration-amber-300 underline-offset-2">${escapeHtml(targetTitle)}</span></span>&nbsp;`
    document.execCommand('insertHTML', false, linkHtml)
  }

  // Handle image and rich media pasting directly into the document
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
  }

  // Handle typing inside unified contentEditable
  const handleInput = () => {
    isTypingRef.current = true
    refreshBlocks()
    handleSync()

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
            p.className = 'my-1.5 text-[13px] md:text-sm text-zinc-300 leading-relaxed'
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
            p.className = 'my-1.5 text-[13px] md:text-sm text-zinc-300 leading-relaxed'
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
            p.className = 'my-1.5 text-[13px] md:text-sm text-zinc-300 leading-relaxed'
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
          <span class="task-text flex-1 text-[13px] md:text-sm text-zinc-200 leading-relaxed">Nova tarefa...</span>
        </div>
      `
      insertBlock(taskHtml)
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
      left: Math.max(120, Math.min(window.innerWidth - 120, rect.left + rect.width / 2))
    })
  }, [])

  // Floating Toolbar Formatting Actions
  const handleToolbarWrap = (type: 'bold' | 'italic' | 'strike' | 'highlight' | 'code' | 'link') => {
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed) return

    if (type === 'bold') {
      document.execCommand('bold')
    } else if (type === 'italic') {
      document.execCommand('italic')
    } else if (type === 'strike') {
      document.execCommand('strikeThrough')
    } else if (type === 'code') {
      const selectedText = sel.toString()
      document.execCommand('insertHTML', false, `<code class="bg-zinc-800 text-amber-300 px-1 py-0.5 rounded font-mono text-xs">${escapeHtml(selectedText)}</code>`)
    } else if (type === 'highlight') {
      const selectedText = sel.toString()
      document.execCommand('insertHTML', false, `<mark class="bg-amber-400/25 text-amber-200 px-1 py-0.5 rounded font-normal">${escapeHtml(selectedText)}</mark>`)
    } else if (type === 'link') {
      const selectedText = sel.toString().trim()
      insertWikiLinkHtml(selectedText)
    }

    setSelectionToolbar(null)
    handleSync()
  }

  // Handle click delegation (wikilink navigation, task checkboxes, code copy)
  const handleEditorClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && containerRef.current && isEditable) {
      focusBlankEditorLine(containerRef.current, e.clientY)
      return
    }
    // 1. Wikilink Navigation Click
    const wikiTargetEl = (e.target as HTMLElement).closest('.wiki-link')
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
      onClick={(e) => {
        if (e.target === e.currentTarget && containerRef.current && isEditable) {
          focusBlankEditorLine(containerRef.current, e.clientY)
        }
      }}
    >
      {/* The Single Unified Dynamic Content Surface (Like Notion) */}
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
        className={`pyrita-editor-surface w-full min-h-[400px] focus:outline-none font-sans text-zinc-300 leading-relaxed ${fontSizeClass} select-text`}
      />

      {blockHosts.map(block => createPortal(block.kind === 'table'
        ? <EditableTable markdown={decodeURIComponent(block.wrapper.dataset.rawTable || '')} readOnly={!isEditable} renderInline={text => formatInlineHtml(text, allNotes)} onChange={markdown => updateTable(block.wrapper, markdown)} onDelete={() => deleteBlock(block.wrapper)} onExit={() => exitBlock(block.wrapper)} />
        : block.kind === 'code'
          ? <EditableCodeBlock initial={{ content: decodeURIComponent(block.wrapper.dataset.rawCode || ''), title: decodeURIComponent(block.wrapper.dataset.codeTitle || ''), language: block.wrapper.dataset.codeLang || '' }} readOnly={!isEditable} onChange={data => updateCode(block.wrapper, data)} onDelete={() => deleteBlock(block.wrapper)} onExit={() => exitBlock(block.wrapper)} />
          : <EditableCallout initial={{ type: block.wrapper.dataset.calloutType || 'NOTE', title: decodeURIComponent(block.wrapper.dataset.calloutTitle || ''), content: decodeURIComponent(block.wrapper.dataset.rawCallout || '') }} readOnly={!isEditable} renderInline={text => formatInlineHtml(text, allNotes)} onChange={data => updateCallout(block.wrapper, data)} onDelete={() => deleteBlock(block.wrapper)} onExit={() => exitBlock(block.wrapper)} />, block.host, block.id))}

      {/* Floating Notion-style Selection Popover Toolbar */}
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
          className="editor-selection-toolbar flex items-center gap-0.5 px-1.5 py-1 bg-[#141418]/95 border border-amber-500/40 rounded-xl shadow-2xl backdrop-blur-md animate-in fade-in zoom-in-95 duration-100 select-none shadow-black/80"
        >
          {/* Wikilink [[...]] Button */}
          <button
            type="button"
            onMouseDown={e => {
              e.preventDefault()
              handleToolbarWrap('link')
            }}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold text-amber-200 hover:text-zinc-950 bg-amber-500/15 hover:bg-amber-400 border border-amber-500/40 transition-all shadow-sm cursor-pointer"
            title="Conectar com Nota / Link Bidirecional [[...]]"
          >
            <Link2 className="w-3.5 h-3.5 text-amber-400" />
            <span className="font-semibold text-[11px]">[[ Link ]]</span>
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

          {/* Highlight Button */}
          <button
            type="button"
            onMouseDown={e => {
              e.preventDefault()
              handleToolbarWrap('highlight')
            }}
            className="p-1.5 rounded-lg text-amber-300 hover:text-amber-100 hover:bg-amber-950/40 transition-colors cursor-pointer"
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
            className="p-1.5 rounded-lg text-emerald-400 hover:text-emerald-200 hover:bg-emerald-950/40 transition-colors cursor-pointer"
            title="Código em linha (`)"
          >
            <Code className="w-3.5 h-3.5" />
          </button>
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
          className="w-72 bg-[#141418] border border-amber-500/40 rounded-xl shadow-2xl p-1.5 overflow-hidden backdrop-blur-md animate-in fade-in zoom-in-95 duration-100 select-none shadow-black/80"
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
