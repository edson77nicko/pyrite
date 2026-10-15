import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useImperativeHandle
} from 'react'
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
  Activity,
  Calendar,
  Layers
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
  subtitle: string
  icon: React.ReactNode
  keywords: string[]
}

const SLASH_COMMANDS: SlashCommandItem[] = [
  {
    id: 'h1',
    title: 'Título 1',
    subtitle: 'Cabeçalho principal grande',
    icon: <Heading1 className="w-4 h-4 text-amber-400" />,
    keywords: ['h1', 'titulo', 'header']
  },
  {
    id: 'h2',
    title: 'Título 2',
    subtitle: 'Subtítulo médio',
    icon: <Heading2 className="w-4 h-4 text-indigo-400" />,
    keywords: ['h2', 'subtitulo', 'header']
  },
  {
    id: 'h3',
    title: 'Título 3',
    subtitle: 'Seção menor',
    icon: <Heading3 className="w-4 h-4 text-blue-400" />,
    keywords: ['h3', 'secao', 'header']
  },
  {
    id: 'task',
    title: 'Lista de Tarefas',
    subtitle: 'Checklist interativo',
    icon: <ListTodo className="w-4 h-4 text-emerald-400" />,
    keywords: ['todo', 'task', 'checklist', 'tarefa']
  },
  {
    id: 'bullet',
    title: 'Lista com Marcadores',
    subtitle: 'Tópicos simples',
    icon: <List className="w-4 h-4 text-amber-400" />,
    keywords: ['bullet', 'lista', 'topicos']
  },
  {
    id: 'number',
    title: 'Lista Numerada',
    subtitle: 'Sequência ordenada',
    icon: <ListOrdered className="w-4 h-4 text-orange-400" />,
    keywords: ['number', 'numero', 'ordenada']
  },
  {
    id: 'quote',
    title: 'Citação',
    subtitle: 'Bloco de destaque em itálico',
    icon: <Sparkles className="w-4 h-4 text-zinc-400" />,
    keywords: ['quote', 'citacao', 'frase']
  },
  {
    id: 'table',
    title: 'Tabela Markdown',
    subtitle: 'Grade de dados',
    icon: <TableIcon className="w-4 h-4 text-purple-400" />,
    keywords: ['tabela', 'table', 'grade']
  },
  {
    id: 'code',
    title: 'Bloco de Código',
    subtitle: 'Área com formatação monospace',
    icon: <Code className="w-4 h-4 text-emerald-400" />,
    keywords: ['code', 'codigo', 'script']
  },
  {
    id: 'callout-note',
    title: 'Callout de Nota',
    subtitle: 'Destaque azul informativo',
    icon: <Info className="w-4 h-4 text-blue-400" />,
    keywords: ['callout', 'nota', 'info']
  },
  {
    id: 'callout-tip',
    title: 'Callout de Dica',
    subtitle: 'Caixa verde com ideia útil',
    icon: <Sparkles className="w-4 h-4 text-emerald-400" />,
    keywords: ['tip', 'dica', 'verde']
  },
  {
    id: 'callout-warning',
    title: 'Callout de Aviso',
    subtitle: 'Alerta âmbar',
    icon: <AlertTriangle className="w-4 h-4 text-amber-400" />,
    keywords: ['warning', 'aviso', 'alerta']
  },
  {
    id: 'hr',
    title: 'Linha Divisória',
    subtitle: 'Separador horizontal sutil',
    icon: <Divide className="w-4 h-4 text-zinc-400" />,
    keywords: ['hr', 'linha', 'divisoria']
  },
  {
    id: 'wikilink',
    title: 'Link Bidirecional',
    subtitle: 'Conectar com outra nota [[...]]',
    icon: <Link2 className="w-4 h-4 text-amber-400" />,
    keywords: ['link', 'wikilink', 'conectar']
  },
  {
    id: 'kpi',
    title: 'Cartão KPI (Métrica Concêntrica)',
    subtitle: 'Métrica com valor, variação e bordas concêntricas',
    icon: <Activity className="w-4 h-4 text-amber-400" />,
    keywords: ['kpi', 'metrica', 'numero', 'estatistica', 'card']
  },
  {
    id: 'timeline',
    title: 'Linha do Tempo / Roadmap',
    subtitle: 'Marcos cronológicos embutidos',
    icon: <Calendar className="w-4 h-4 text-amber-400" />,
    keywords: ['timeline', 'roadmap', 'cronograma', 'etapas']
  },
  {
    id: 'comparison',
    title: 'Comparativo Lado a Lado',
    subtitle: 'Colunas concêntricas para decisão e trade-offs',
    icon: <Layers className="w-4 h-4 text-amber-400" />,
    keywords: ['comparison', 'comparativo', 'versus', 'versus', 'pros']
  },
  {
    id: 'card',
    title: 'Cartão Embutido (Nested Card)',
    subtitle: 'Moldura com cabeçalho e subsuperfície concêntrica',
    icon: <Sparkles className="w-4 h-4 text-amber-400" />,
    keywords: ['card', 'nested', 'moldura', 'bloco', 'camadas']
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

  const tokenRegex = /(\[\[[^\[\]\r\n]+\]\]|\*\*[^\*\r\n]+\*\*|==[^=\r\n]+==|~~[^~\r\n]+~~|`[^`\r\n]+`|\*[^\*\r\n]+\*)/g
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
        ? 'text-amber-300 hover:text-amber-100 bg-amber-950/30 hover:bg-amber-900/50 border border-amber-800/40'
        : 'text-zinc-400 hover:text-zinc-200 bg-zinc-800/60 hover:bg-zinc-800 border border-dashed border-zinc-700/80'

      return `<span class="wiki-link inline-flex items-center cursor-pointer font-medium select-none rounded px-1.5 py-0 mx-0.5 text-xs transition-colors shadow-sm ${pillClass}" contenteditable="false" data-wiki="${escapeHtml(destination)}" title="${exists ? `Abrir nota: &quot;${destination}&quot;` : `Criar nota: &quot;${destination}&quot;`}"><span class="underline decoration-amber-500/40 hover:decoration-amber-300 underline-offset-2">${escapeHtml(displayName)}</span></span>`
    }

    // 2. Bold **text**
    if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
      return `<strong class="font-semibold text-zinc-100">${escapeHtml(part.slice(2, -2))}</strong>`
    }

    // 3. Highlight ==text==
    if (part.startsWith('==') && part.endsWith('==') && part.length >= 4) {
      return `<mark class="bg-amber-400/25 text-amber-200 px-1 py-0.5 rounded font-normal">${escapeHtml(part.slice(2, -2))}</mark>`
    }

    // 4. Strikethrough ~~text~~
    if (part.startsWith('~~') && part.endsWith('~~') && part.length >= 4) {
      return `<del class="line-through text-zinc-500">${escapeHtml(part.slice(2, -2))}</del>`
    }

    // 5. Code `text`
    if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
      return `<code class="bg-zinc-800 text-amber-300 px-1 py-0.5 rounded font-mono text-xs">${escapeHtml(part.slice(1, -1))}</code>`
    }

    // 6. Italic *text*
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
      const rawCode = codeLines.join('\n')
      htmlParts.push(`
        <div class="code-block-wrapper my-4 rounded-xl overflow-hidden border border-zinc-800 bg-zinc-950/90 text-xs font-mono shadow-lg" contenteditable="false" data-raw-code="${encodeURIComponent(rawCode)}" data-code-lang="${lang}">
          <div class="flex items-center justify-between px-3.5 py-2 bg-zinc-900 border-b border-zinc-800 text-xs text-zinc-400">
            <span class="uppercase font-semibold tracking-wider text-[11px] text-zinc-300 flex items-center gap-1.5">
              <span class="w-2 h-2 rounded-full bg-amber-400"></span>
              ${lang || 'código'}
            </span>
            <button type="button" class="copy-code-btn flex items-center gap-1 px-2 py-0.5 rounded hover:bg-zinc-800 text-zinc-300 hover:text-zinc-100 transition-colors cursor-pointer">
              Copiar
            </button>
          </div>
          <pre class="p-4 overflow-x-auto text-zinc-300 leading-relaxed font-mono"><code>${escapeHtml(rawCode)}</code></pre>
        </div>
      `)
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
      const rawTable = tableLines.join('\n')
      const headerCells = tableLines[0].split('|').slice(1, -1).map(c => c.trim())
      const bodyRows = tableLines.slice(2).map(l => l.split('|').slice(1, -1).map(c => c.trim()))

      htmlParts.push(`
        <div class="table-wrapper my-4 rounded-xl border border-zinc-800 bg-zinc-950/40 overflow-hidden shadow-lg" contenteditable="false" data-raw-table="${encodeURIComponent(rawTable)}">
          <div class="flex items-center justify-between px-3 py-1.5 bg-zinc-900 border-b border-zinc-800 text-xs text-zinc-400 font-medium">
            <span>Tabela Markdown</span>
          </div>
          <div class="overflow-x-auto p-1">
            <table class="w-full text-left text-xs border-collapse">
              <thead>
                <tr class="border-b border-zinc-800 bg-zinc-900/40">
                  ${headerCells.map(h => `<th class="p-2.5 font-semibold text-zinc-300">${escapeHtml(h)}</th>`).join('')}
                </tr>
              </thead>
              <tbody>
                ${bodyRows.map(row => `
                  <tr class="border-b border-zinc-800/40 hover:bg-zinc-800/20">
                    ${row.map(cell => `<td class="p-2.5 text-zinc-300">${escapeHtml(cell)}</td>`).join('')}
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `)
      continue
    }

    // Callout > [!NOTE]
    if (line.trim().startsWith('> [!')) {
      const match = line.trim().match(/> \[!([A-Z]+)\]\s*(.*)/i)
      const calloutType = (match ? match[1] : 'NOTE').toUpperCase()
      const title = match && match[2] ? match[2].trim() : ''
      const calloutLines: string[] = []
      if (title) calloutLines.push(title)
      i++
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        calloutLines.push(lines[i].replace(/^>\s?/, ''))
        i++
      }
      const rawCallout = calloutLines.join('\n')
      let theme = 'border-blue-500/60 bg-blue-950/20 text-blue-200'
      if (calloutType === 'TIP') theme = 'border-emerald-500/60 bg-emerald-950/20 text-emerald-200'
      else if (calloutType === 'WARNING') theme = 'border-amber-500/60 bg-amber-950/20 text-amber-200'
      else if (calloutType === 'IMPORTANT' || calloutType === 'CAUTION') theme = 'border-rose-500/60 bg-rose-950/20 text-rose-200'

      htmlParts.push(`
        <div class="callout-wrapper my-4 p-3.5 rounded-xl border-l-4 ${theme} text-xs shadow-sm" data-type="callout" data-callout-type="${calloutType}">
          <div class="font-semibold mb-1 flex items-center gap-1.5 select-none" contenteditable="false">
            <span>${calloutType}</span>
          </div>
          <div class="callout-content text-zinc-300 leading-relaxed">${formatInlineHtml(rawCallout, allNotes)}</div>
        </div>
      `)
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

    // Interactive Task Checklist
    const taskMatch = line.match(/^(\s*)-\s\[([ xX])\]\s(.*)$/)
    if (taskMatch) {
      const isChecked = taskMatch[2].toLowerCase() === 'x'
      const taskText = taskMatch[3]
      htmlParts.push(`
        <div class="task-item flex items-start gap-2.5 my-1.5 group select-none" data-type="task">
          <input type="checkbox" ${isChecked ? 'checked' : ''} contenteditable="false" class="task-checkbox mt-1 w-4 h-4 cursor-pointer shrink-0" />
          <span class="task-text flex-1 text-[13px] md:text-sm leading-relaxed ${isChecked ? 'line-through text-zinc-500' : 'text-zinc-200'}">${formatInlineHtml(taskText, allNotes)}</span>
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
      if (tag === 'strong' || tag === 'b') {
        return `**${Array.from(el.childNodes).map(serializeInline).join('')}**`
      }
      if (tag === 'em' || tag === 'i') {
        return `*${Array.from(el.childNodes).map(serializeInline).join('')}*`
      }
      if (tag === 'mark') {
        return `==${Array.from(el.childNodes).map(serializeInline).join('')}==`
      }
      if (tag === 'del' || tag === 's') {
        return `~~${Array.from(el.childNodes).map(serializeInline).join('')}~~`
      }
      if (tag === 'code') {
        return `\`${Array.from(el.childNodes).map(serializeInline).join('')}\``
      }
      if (tag === 'br') {
        return ''
      }

      return Array.from(el.childNodes).map(serializeInline).join('')
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

    // 0. Nested Artifact Card
    if (el.hasAttribute('data-raw-artifact')) {
      const rawArtifact = decodeURIComponent(el.getAttribute('data-raw-artifact') || '')
      lines.push(rawArtifact)
      continue
    }

    // 1. Code Block
    if (el.hasAttribute('data-raw-code')) {
      const code = decodeURIComponent(el.getAttribute('data-raw-code') || '')
      const lang = el.getAttribute('data-code-lang') || ''
      lines.push(`\`\`\`${lang}\n${code}\n\`\`\``)
      continue
    }

    // 2. Table
    if (el.hasAttribute('data-raw-table')) {
      const table = decodeURIComponent(el.getAttribute('data-raw-table') || '')
      lines.push(table)
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
  const isTypingRef = useRef(false)
  const syncTimerRef = useRef<any>(null)
  const currentNoteIdRef = useRef<string | null>(null)

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

  // Debounced Markdown Synchronization to parent state
  const handleSync = useCallback(() => {
    if (!containerRef.current) return
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current)

    syncTimerRef.current = setTimeout(() => {
      if (containerRef.current) {
        const md = domToMarkdown(containerRef.current)
        onUpdateContent(md)
        isTypingRef.current = false
      }
    }, 250)
  }, [onUpdateContent])

  // Synchronize initial HTML when note changes or on mount
  useEffect(() => {
    if (!containerRef.current) return

    // If switching notes or note was loaded from external source:
    if (
      currentNoteIdRef.current !== note.id ||
      (!isTypingRef.current && !containerRef.current.contains(document.activeElement))
    ) {
      currentNoteIdRef.current = note.id
      containerRef.current.innerHTML = markdownToHtml(note.content, allNotes, note.title)
      setSlashMenu(null)
      setWikiSuggest(null)
      setSelectionToolbar(null)
    }
  }, [note.id, note.content, note.title, allNotes])

  // Expose formatting commands to top toolbar via ref
  useImperativeHandle(editorRef, () => ({
    setBlockType: (type: LiveBlock['type']) => {
      containerRef.current?.focus()
      if (type === 'h1') document.execCommand('formatBlock', false, 'h1')
      else if (type === 'h2') document.execCommand('formatBlock', false, 'h2')
      else if (type === 'h3') document.execCommand('formatBlock', false, 'h3')
      else if (type === 'bullet') document.execCommand('insertUnorderedList')
      else if (type === 'number') document.execCommand('insertOrderedList')
      else if (type === 'quote') document.execCommand('formatBlock', false, 'blockquote')
      else if (type === 'task') {
        const taskHtml = `
          <div class="task-item flex items-start gap-2.5 my-1.5 group select-none" data-type="task">
            <input type="checkbox" contenteditable="false" class="task-checkbox mt-1 w-4 h-4 cursor-pointer shrink-0" />
            <span class="task-text flex-1 text-[13px] md:text-sm text-zinc-200 leading-relaxed">Nova tarefa...</span>
          </div>
        `
        document.execCommand('insertHTML', false, taskHtml)
      } else {
        document.execCommand('formatBlock', false, 'p')
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
    insertCodeBlock: () => {
      const codeHtml = `
        <div class="code-block-wrapper my-4 rounded-xl overflow-hidden border border-zinc-800 bg-zinc-950/90 text-xs font-mono shadow-lg" contenteditable="false" data-raw-code="console.log('Olá, Pyrite!');" data-code-lang="javascript">
          <div class="flex items-center justify-between px-3.5 py-2 bg-zinc-900 border-b border-zinc-800 text-xs text-zinc-400">
            <span class="uppercase font-semibold tracking-wider text-[11px] text-zinc-300">javascript</span>
            <button type="button" class="copy-code-btn flex items-center gap-1 px-2 py-0.5 rounded hover:bg-zinc-800 text-zinc-300">Copiar</button>
          </div>
          <pre class="p-4 overflow-x-auto text-zinc-300 font-mono"><code>console.log('Olá, Pyrite!');</code></pre>
        </div>
      `
      document.execCommand('insertHTML', false, codeHtml)
      handleSync()
    },
    insertCallout: (type: string) => {
      const calloutType = type.toUpperCase() || 'NOTE'
      const calloutHtml = `
        <div class="callout-wrapper my-4 p-3.5 rounded-xl border-l-4 border-blue-500/60 bg-blue-950/20 text-blue-200 text-xs shadow-sm" data-type="callout" data-callout-type="${calloutType}">
          <div class="font-semibold mb-1" contenteditable="false">${calloutType}</div>
          <div class="callout-content text-zinc-300">Observação importante aqui...</div>
        </div>
      `
      document.execCommand('insertHTML', false, calloutHtml)
      handleSync()
    },
    insertTable: () => {
      const defaultTable = `| Coluna 1 | Coluna 2 | Coluna 3 |\n| --- | --- | --- |\n| Exemplo 1 | Detalhe | Ativo |`
      const tableHtml = `
        <div class="table-wrapper my-4 rounded-xl border border-zinc-800 bg-zinc-950/40 overflow-hidden shadow-lg" contenteditable="false" data-raw-table="${encodeURIComponent(defaultTable)}">
          <div class="flex items-center justify-between px-3 py-1.5 bg-zinc-900 border-b border-zinc-800 text-xs text-zinc-400 font-medium">
            <span>Tabela Markdown</span>
          </div>
          <div class="overflow-x-auto p-1">
            <table class="w-full text-left text-xs border-collapse">
              <thead><tr class="border-b border-zinc-800 bg-zinc-900/40"><th class="p-2.5">Coluna 1</th><th class="p-2.5">Coluna 2</th><th class="p-2.5">Coluna 3</th></tr></thead>
              <tbody><tr class="border-b border-zinc-800/40"><td class="p-2.5">Exemplo 1</td><td class="p-2.5">Detalhe</td><td class="p-2.5">Ativo</td></tr></tbody>
            </table>
          </div>
        </div>
      `
      document.execCommand('insertHTML', false, tableHtml)
      handleSync()
    }
  }))

  const insertWikiLinkHtml = (targetTitle: string) => {
    const exists = allNotes.some(n => n.title.toLowerCase().trim() === targetTitle.toLowerCase().trim())
    const pillClass = exists
      ? 'text-amber-300 hover:text-amber-100 bg-amber-950/30 hover:bg-amber-900/50 border border-amber-800/40'
      : 'text-zinc-400 hover:text-zinc-200 bg-zinc-800/60 hover:bg-zinc-800 border border-dashed border-zinc-700/80'

    const linkHtml = `<span class="wiki-link inline-flex items-center cursor-pointer font-medium select-none rounded px-1.5 py-0 mx-0.5 text-xs transition-colors shadow-sm ${pillClass}" contenteditable="false" data-wiki="${escapeHtml(targetTitle)}" title="${exists ? `Abrir nota: &quot;${targetTitle}&quot;` : `Criar nota: &quot;${targetTitle}&quot;`}"><span class="underline decoration-amber-500/40 hover:decoration-amber-300 underline-offset-2">${escapeHtml(targetTitle)}</span></span>&nbsp;`
    document.execCommand('insertHTML', false, linkHtml)
  }

  // Handle typing inside unified contentEditable
  const handleInput = () => {
    isTypingRef.current = true
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
          top: Math.max(10, rect.bottom + 6),
          left: Math.max(20, Math.min(window.innerWidth - 300, rect.left)),
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

    // Live markdown formatting when typing Space at beginning of line
    if (e.key === ' ') {
      const sel = window.getSelection()
      if (sel && sel.anchorNode && sel.anchorNode.nodeType === Node.TEXT_NODE) {
        const text = sel.anchorNode.textContent || ''
        const offset = sel.anchorOffset

        if (text === '#' && offset === 1) {
          e.preventDefault()
          sel.anchorNode.textContent = ''
          document.execCommand('formatBlock', false, 'h1')
          handleSync()
          return
        }
        if (text === '##' && offset === 2) {
          e.preventDefault()
          sel.anchorNode.textContent = ''
          document.execCommand('formatBlock', false, 'h2')
          handleSync()
          return
        }
        if (text === '###' && offset === 3) {
          e.preventDefault()
          sel.anchorNode.textContent = ''
          document.execCommand('formatBlock', false, 'h3')
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
        if (text === '>' && offset === 1) {
          e.preventDefault()
          sel.anchorNode.textContent = ''
          document.execCommand('formatBlock', false, 'blockquote')
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
          node.textContent = text.slice(0, slashIdx)
        }
      }
    }

    setSlashMenu(null)

    if (cmdId === 'h1') document.execCommand('formatBlock', false, 'h1')
    else if (cmdId === 'h2') document.execCommand('formatBlock', false, 'h2')
    else if (cmdId === 'h3') document.execCommand('formatBlock', false, 'h3')
    else if (cmdId === 'bullet') document.execCommand('insertUnorderedList')
    else if (cmdId === 'number') document.execCommand('insertOrderedList')
    else if (cmdId === 'quote') document.execCommand('formatBlock', false, 'blockquote')
    else if (cmdId === 'hr') document.execCommand('insertHorizontalRule')
    else if (cmdId === 'task') {
      const taskHtml = `
        <div class="task-item flex items-start gap-2.5 my-1.5 group select-none" data-type="task">
          <input type="checkbox" contenteditable="false" class="task-checkbox mt-1 w-4 h-4 cursor-pointer shrink-0" />
          <span class="task-text flex-1 text-[13px] md:text-sm text-zinc-200 leading-relaxed">Nova tarefa...</span>
        </div>
      `
      document.execCommand('insertHTML', false, taskHtml)
    } else if (cmdId === 'table') {
      const defaultTable = `| Coluna 1 | Coluna 2 | Coluna 3 |\n| --- | --- | --- |\n| Exemplo 1 | Detalhe | Ativo |`
      const tableHtml = `
        <div class="table-wrapper my-4 rounded-xl border border-zinc-800 bg-zinc-950/40 overflow-hidden shadow-lg" contenteditable="false" data-raw-table="${encodeURIComponent(defaultTable)}">
          <div class="flex items-center justify-between px-3 py-1.5 bg-zinc-900 border-b border-zinc-800 text-xs text-zinc-400 font-medium">
            <span>Tabela Markdown</span>
          </div>
          <div class="overflow-x-auto p-1">
            <table class="w-full text-left text-xs border-collapse">
              <thead><tr class="border-b border-zinc-800 bg-zinc-900/40"><th class="p-2.5">Coluna 1</th><th class="p-2.5">Coluna 2</th><th class="p-2.5">Coluna 3</th></tr></thead>
              <tbody><tr class="border-b border-zinc-800/40"><td class="p-2.5">Exemplo 1</td><td class="p-2.5">Detalhe</td><td class="p-2.5">Ativo</td></tr></tbody>
            </table>
          </div>
        </div>
      `
      document.execCommand('insertHTML', false, tableHtml)
    } else if (cmdId === 'code') {
      const codeHtml = `
        <div class="code-block-wrapper my-4 rounded-xl overflow-hidden border border-zinc-800 bg-zinc-950/90 text-xs font-mono shadow-lg" contenteditable="false" data-raw-code="console.log('Olá, Pyrite!');" data-code-lang="javascript">
          <div class="flex items-center justify-between px-3.5 py-2 bg-zinc-900 border-b border-zinc-800 text-xs text-zinc-400">
            <span class="uppercase font-semibold tracking-wider text-[11px] text-zinc-300">javascript</span>
            <button type="button" class="copy-code-btn flex items-center gap-1 px-2 py-0.5 rounded hover:bg-zinc-800 text-zinc-300">Copiar</button>
          </div>
          <pre class="p-4 overflow-x-auto text-zinc-300 font-mono"><code>console.log('Olá, Pyrite!');</code></pre>
        </div>
      `
      document.execCommand('insertHTML', false, codeHtml)
    } else if (cmdId === 'callout-note' || cmdId === 'callout-tip' || cmdId === 'callout-warning') {
      const type = cmdId === 'callout-tip' ? 'TIP' : cmdId === 'callout-warning' ? 'WARNING' : 'NOTE'
      const theme = type === 'TIP' ? 'border-emerald-500/60 bg-emerald-950/20 text-emerald-200' : type === 'WARNING' ? 'border-amber-500/60 bg-amber-950/20 text-amber-200' : 'border-blue-500/60 bg-blue-950/20 text-blue-200'
      const calloutHtml = `
        <div class="callout-wrapper my-4 p-3.5 rounded-xl border-l-4 ${theme} text-xs shadow-sm" data-type="callout" data-callout-type="${type}">
          <div class="font-semibold mb-1" contenteditable="false">${type}</div>
          <div class="callout-content text-zinc-300">Destaque importante aqui...</div>
        </div>
      `
      document.execCommand('insertHTML', false, calloutHtml)
    } else if (cmdId === 'wikilink') {
      document.execCommand('insertText', false, '[[')
    } else if (cmdId === 'kpi') {
      const kpiSnippet = `\n:::kpi\ntitle: Métrica Chave\nvalue: 84.5%\nchange: +12.3%\ntrend: up\nsubtitle: Desempenho acima da média\nbadge: Q3 Meta\n:::\n`
      document.execCommand('insertText', false, kpiSnippet)
    } else if (cmdId === 'timeline') {
      const timelineSnippet = `\n:::timeline [Roadmap Estratégico] badge: 2026\n- 2026-Q1 | Fase de Descoberta | Alinhamento e prototipação\n- 2026-Q2 | Desenvolvimento Core | Arquitetura e componentes concêntricos\n- 2026-Q3 | Lançamento Oficial | Rollout para os usuários\n:::\n`
      document.execCommand('insertText', false, timelineSnippet)
    } else if (cmdId === 'comparison') {
      const compSnippet = `\n:::comparison [Comparativo de Soluções] badge: Análise\n### Opção A (Destaque)\n- Alto desempenho\n- Foco em privacidade\n### Opção B\n- Modelo convencional\n- Dependência externa\n:::\n`
      document.execCommand('insertText', false, compSnippet)
    } else if (cmdId === 'card') {
      const cardSnippet = `\n:::card [Título da Seção] badge: Destaque\nInsira aqui o conteúdo embutido na subsuperfície concêntrica.\n:::\n`
      document.execCommand('insertText', false, cardSnippet)
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
        // If clicking on empty padding below content, place cursor at the end
        if (e.target === e.currentTarget && containerRef.current && isEditable) {
          containerRef.current.focus()
          const sel = window.getSelection()
          if (sel) {
            const range = document.createRange()
            range.selectNodeContents(containerRef.current)
            range.collapse(false)
            sel.removeAllRanges()
            sel.addRange(range)
          }
        }
      }}
    >
      {/* The Single Unified Dynamic Content Surface (Like Notion) */}
      <div
        ref={containerRef}
        contentEditable={isEditable}
        suppressContentEditableWarning
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onMouseUp={handleSelectionCheck}
        onKeyUp={handleSelectionCheck}
        onClick={handleEditorClick}
        className={`w-full min-h-[400px] focus:outline-none font-sans text-zinc-300 leading-relaxed ${fontSizeClass} select-text`}
      />

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
          className="flex items-center gap-0.5 px-1.5 py-1 bg-[#141418]/95 border border-amber-500/40 rounded-xl shadow-2xl backdrop-blur-md animate-in fade-in zoom-in-95 duration-100 select-none shadow-black/80"
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
          onMouseDown={e => e.preventDefault()}
          className="w-72 bg-[#141418] border border-amber-500/40 rounded-xl shadow-2xl p-1.5 overflow-hidden backdrop-blur-md animate-in fade-in zoom-in-95 duration-100 select-none shadow-black/80"
        >
          <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-amber-400 border-b border-zinc-800 flex items-center justify-between">
            <span>Comandos Rápidos</span>
            <span className="text-zinc-500 font-mono text-[10px]">↵ Inserir</span>
          </div>
          <div className="max-h-56 overflow-y-auto space-y-0.5 pt-1 scrollbar-none">
            {filteredSlashCommands.map((cmd, cIdx) => {
              const isSelected = cIdx === slashMenu.index
              return (
                <div
                  key={cmd.id}
                  onMouseDown={e => {
                    e.preventDefault()
                    executeSlashCommand(cmd.id)
                  }}
                  onMouseEnter={() => setSlashMenu(prev => (prev ? { ...prev, index: cIdx } : null))}
                  className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-amber-500/15 text-amber-200 border border-amber-500/40'
                      : 'text-zinc-300 hover:bg-zinc-800/60'
                  }`}
                >
                  {cmd.icon}
                  <div className="truncate">
                    <div className="text-xs font-medium text-zinc-100">{cmd.title}</div>
                    <div className="text-[10px] text-zinc-500 truncate">{cmd.subtitle}</div>
                  </div>
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
