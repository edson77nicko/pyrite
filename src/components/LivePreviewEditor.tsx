import React, { useState, useEffect, useRef, useCallback } from 'react'
import type { Note } from '../types'
import {
  Check,
  Copy,
  Info,
  Lightbulb,
  AlertTriangle,
  AlertCircle,
  Heading1,
  Heading2,
  Heading3,
  ListTodo,
  List,
  ListOrdered,
  Table as TableIcon,
  Code as CodeIcon,
  Sparkles,
  Link2,
  Divide,
  Plus,
  Code
} from 'lucide-react'
import {
  type LiveBlock,
  parseMarkdownToBlocks,
  blocksToMarkdown
} from '../utils/markdownBlocks'

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
  execute: (blockId: string, index: number) => void
}

/**
 * Formats inline Markdown syntax tokens (like **, *, ==, ~~, `, [[...]])
 * 
 * In Obsidian Live Preview:
 * - When line is NOT focused: syntax tokens (**, *, ==) are HIDDEN. Only formatted text is shown.
 * - When line IS focused: syntax tokens appear in subtle muted color so they can be edited!
 */
function renderInlineFormatted(
  text: string,
  isFocused: boolean,
  onNavigate?: (title: string) => void
): React.ReactNode {
  if (!text) return '\u00A0'

  // Token regex for: [[wikilink]], **bold**, ==highlight==, ~~strike~~, `code`, *italic*
  const tokenRegex = /(\[\[.*?\]\]|\*\*.*?\*\*|==.*?==|~~.*?~~|`.*?`|\*[^*]+?\*)/g
  const parts = text.split(tokenRegex)

  return parts.map((part, idx) => {
    if (!part) return null

    // 1. Wikilinks [[Target]] or [[Target|Alias]]
    if (part.startsWith('[[') && part.endsWith(']]') && part.length >= 4) {
      const inner = part.slice(2, -2)
      const [target, alias] = inner.split('|')
      const displayName = (alias || target).split('#')[0].trim()
      const destination = target.split('#')[0].trim()

      if (!isFocused) {
        return (
          <button
            key={`wiki-${idx}`}
            type="button"
            onClick={e => {
              e.stopPropagation()
              if (onNavigate) onNavigate(destination)
            }}
            className="inline-flex items-center gap-0.5 text-violet-400 hover:text-violet-200 bg-violet-950/40 hover:bg-violet-900/60 border border-violet-800/50 rounded px-1.5 py-0 mx-0.5 text-xs font-medium cursor-pointer transition-colors"
          >
            <span className="text-violet-500 font-bold">[[</span>
            <span className="underline decoration-violet-500/40 underline-offset-2">{displayName}</span>
            <span className="text-violet-500 font-bold">]]</span>
          </button>
        )
      } else {
        return (
          <span key={`wiki-${idx}`} className="inline-flex items-center">
            <span className="text-violet-500/60 font-mono text-xs select-none">[[</span>
            <span className="text-violet-300 underline decoration-violet-500/40">{inner}</span>
            <span className="text-violet-500/60 font-mono text-xs select-none">]]</span>
          </span>
        )
      }
    }

    // 2. Bold **text**
    if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
      const inner = part.slice(2, -2)
      if (!isFocused) {
        return (
          <strong key={`b-${idx}`} className="font-semibold text-zinc-100">
            {inner}
          </strong>
        )
      } else {
        return (
          <strong key={`b-${idx}`} className="font-semibold text-zinc-100">
            <span className="text-zinc-500/80 font-mono text-xs font-normal select-none">**</span>
            {inner}
            <span className="text-zinc-500/80 font-mono text-xs font-normal select-none">**</span>
          </strong>
        )
      }
    }

    // 3. Highlight ==text==
    if (part.startsWith('==') && part.endsWith('==') && part.length >= 4) {
      const inner = part.slice(2, -2)
      if (!isFocused) {
        return (
          <mark key={`m-${idx}`} className="bg-amber-400/25 text-amber-200 px-1 py-0.5 rounded font-normal">
            {inner}
          </mark>
        )
      } else {
        return (
          <mark key={`m-${idx}`} className="bg-amber-400/25 text-amber-200 px-1 py-0.5 rounded font-normal">
            <span className="text-amber-500/70 font-mono text-xs select-none">==</span>
            {inner}
            <span className="text-amber-500/70 font-mono text-xs select-none">==</span>
          </mark>
        )
      }
    }

    // 4. Strikethrough ~~text~~
    if (part.startsWith('~~') && part.endsWith('~~') && part.length >= 4) {
      const inner = part.slice(2, -2)
      if (!isFocused) {
        return (
          <del key={`d-${idx}`} className="line-through text-zinc-500">
            {inner}
          </del>
        )
      } else {
        return (
          <del key={`d-${idx}`} className="line-through text-zinc-500">
            <span className="text-zinc-600 font-mono text-xs select-none">~~</span>
            {inner}
            <span className="text-zinc-600 font-mono text-xs select-none">~~</span>
          </del>
        )
      }
    }

    // 5. Code `text`
    if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
      const inner = part.slice(1, -1)
      if (!isFocused) {
        return (
          <code key={`c-${idx}`} className="bg-zinc-800 text-amber-300 px-1 py-0.5 rounded font-mono text-xs">
            {inner}
          </code>
        )
      } else {
        return (
          <code key={`c-${idx}`} className="bg-zinc-800 text-amber-300 px-1 py-0.5 rounded font-mono text-xs">
            <span className="text-zinc-500 font-mono text-xs select-none">`</span>
            {inner}
            <span className="text-zinc-500 font-mono text-xs select-none">`</span>
          </code>
        )
      }
    }

    // 6. Italic *text*
    if (part.startsWith('*') && part.endsWith('*') && part.length >= 2) {
      const inner = part.slice(1, -1)
      if (!isFocused) {
        return (
          <em key={`i-${idx}`} className="italic text-zinc-200">
            {inner}
          </em>
        )
      } else {
        return (
          <em key={`i-${idx}`} className="italic text-zinc-200">
            <span className="text-zinc-500/80 font-mono text-xs font-normal select-none">*</span>
            {inner}
            <span className="text-zinc-500/80 font-mono text-xs font-normal select-none">*</span>
          </em>
        )
      }
    }

    return <span key={`txt-${idx}`}>{part}</span>
  })
}

export const LivePreviewEditor: React.FC<LivePreviewEditorProps> = ({
  note,
  displayMode,
  onUpdateContent,
  onNavigate,
  fontSizeClass = 'text-sm',
  editorRef
}) => {
  const [blocks, setBlocks] = useState<LiveBlock[]>(() => parseMarkdownToBlocks(note.content))
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null)
  const [copiedCodeId, setCopiedCodeId] = useState<string | null>(null)
  const [rawTableEditId, setRawTableEditId] = useState<string | null>(null)

  // Slash command popover state
  const [slashMenu, setSlashMenu] = useState<{
    blockId: string
    query: string
    index: number
  } | null>(null)

  // Focus target management (only for programmatic navigation like Enter, Backspace, Arrow keys)
  const [focusTarget, setFocusTarget] = useState<{
    blockId: string
    position: 'start' | 'end' | number
  } | null>(null)

  const isTypingRef = useRef(false)
  const syncTimerRef = useRef<any>(null)
  const currentNoteIdRef = useRef(note.id)

  // Re-parse when switching notes
  useEffect(() => {
    if (currentNoteIdRef.current !== note.id) {
      currentNoteIdRef.current = note.id
      setBlocks(parseMarkdownToBlocks(note.content))
      setActiveBlockId(null)
      setFocusTarget(null)
      setSlashMenu(null)
      setRawTableEditId(null)
    }
  }, [note.id, note.content])

  // Caret placement effect ONLY when focusTarget is explicitly set
  useEffect(() => {
    if (!focusTarget) return
    const el = document.querySelector(`[data-block-id="${focusTarget.blockId}"]`) as HTMLElement
    if (el) {
      el.focus()
      const sel = window.getSelection()
      if (sel) {
        const range = document.createRange()
        if (focusTarget.position === 'start') {
          range.selectNodeContents(el)
          range.collapse(true)
        } else if (focusTarget.position === 'end') {
          range.selectNodeContents(el)
          range.collapse(false)
        } else if (typeof focusTarget.position === 'number') {
          const targetNode = el.firstChild || el
          const len = targetNode.textContent?.length || 0
          const offset = Math.min(focusTarget.position, len)
          try {
            range.setStart(targetNode, offset)
            range.setEnd(targetNode, offset)
          } catch {
            range.selectNodeContents(el)
            range.collapse(false)
          }
        }
        sel.removeAllRanges()
        sel.addRange(range)
      }
    }
    setFocusTarget(null)
  }, [focusTarget, blocks])

  // Debounced sync to note.content
  const syncMarkdown = useCallback(
    (newBlocks: LiveBlock[]) => {
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current)
      syncTimerRef.current = setTimeout(() => {
        const md = blocksToMarkdown(newBlocks)
        onUpdateContent(md)
        isTypingRef.current = false
      }, 200)
    },
    [onUpdateContent]
  )

  // Clean text from slash trigger
  const cleanSlashFromText = (text: string) => {
    const slashIdx = text.lastIndexOf('/')
    if (slashIdx !== -1) {
      return text.slice(0, slashIdx).trim()
    }
    return text.trim()
  }

  // Registry of Slash Commands
  const SLASH_COMMANDS: SlashCommandItem[] = [
    {
      id: 'h1',
      title: 'Título 1',
      subtitle: 'Cabeçalho principal grande',
      icon: <Heading1 className="w-4 h-4 text-violet-400" />,
      keywords: ['h1', 'titulo 1', 'header', 'grande'],
      execute: (blockId, index) => {
        setBlocks(prev => {
          const updated = [...prev]
          const current = updated[index]
          updated[index] = { ...current, type: 'h1', text: cleanSlashFromText(current.text) }
          syncMarkdown(updated)
          setFocusTarget({ blockId, position: 'end' })
          return updated
        })
        setSlashMenu(null)
      }
    },
    {
      id: 'h2',
      title: 'Título 2',
      subtitle: 'Subseção média',
      icon: <Heading2 className="w-4 h-4 text-blue-400" />,
      keywords: ['h2', 'titulo 2', 'subtitulo', 'medio'],
      execute: (blockId, index) => {
        setBlocks(prev => {
          const updated = [...prev]
          const current = updated[index]
          updated[index] = { ...current, type: 'h2', text: cleanSlashFromText(current.text) }
          syncMarkdown(updated)
          setFocusTarget({ blockId, position: 'end' })
          return updated
        })
        setSlashMenu(null)
      }
    },
    {
      id: 'h3',
      title: 'Título 3',
      subtitle: 'Subtítulo pequeno',
      icon: <Heading3 className="w-4 h-4 text-cyan-400" />,
      keywords: ['h3', 'titulo 3', 'pequeno'],
      execute: (blockId, index) => {
        setBlocks(prev => {
          const updated = [...prev]
          const current = updated[index]
          updated[index] = { ...current, type: 'h3', text: cleanSlashFromText(current.text) }
          syncMarkdown(updated)
          setFocusTarget({ blockId, position: 'end' })
          return updated
        })
        setSlashMenu(null)
      }
    },
    {
      id: 'task',
      title: 'Lista de Tarefas',
      subtitle: 'Caixa de seleção interativa',
      icon: <ListTodo className="w-4 h-4 text-emerald-400" />,
      keywords: ['task', 'tarefa', 'check', 'checklist', 'todo'],
      execute: (blockId, index) => {
        setBlocks(prev => {
          const updated = [...prev]
          const current = updated[index]
          updated[index] = { ...current, type: 'task', text: cleanSlashFromText(current.text), checked: false }
          syncMarkdown(updated)
          setFocusTarget({ blockId, position: 'end' })
          return updated
        })
        setSlashMenu(null)
      }
    },
    {
      id: 'bullet',
      title: 'Lista com Marcadores',
      subtitle: 'Tópicos simples com marcadores',
      icon: <List className="w-4 h-4 text-amber-400" />,
      keywords: ['bullet', 'lista', 'topicos', 'marcador'],
      execute: (blockId, index) => {
        setBlocks(prev => {
          const updated = [...prev]
          const current = updated[index]
          updated[index] = { ...current, type: 'bullet', text: cleanSlashFromText(current.text) }
          syncMarkdown(updated)
          setFocusTarget({ blockId, position: 'end' })
          return updated
        })
        setSlashMenu(null)
      }
    },
    {
      id: 'number',
      title: 'Lista Numerada',
      subtitle: 'Sequência ordenada de passos',
      icon: <ListOrdered className="w-4 h-4 text-orange-400" />,
      keywords: ['number', 'numero', 'ordenada', 'passos'],
      execute: (blockId, index) => {
        setBlocks(prev => {
          const updated = [...prev]
          const current = updated[index]
          updated[index] = { ...current, type: 'number', text: cleanSlashFromText(current.text) }
          syncMarkdown(updated)
          setFocusTarget({ blockId, position: 'end' })
          return updated
        })
        setSlashMenu(null)
      }
    },
    {
      id: 'table',
      title: 'Tabela Markdown',
      subtitle: 'Grade de dados com colunas e linhas',
      icon: <TableIcon className="w-4 h-4 text-purple-400" />,
      keywords: ['tabela', 'table', 'grade', 'linhas', 'colunas'],
      execute: (blockId, index) => {
        const defaultTable = `| Coluna 1 | Coluna 2 | Coluna 3 |\n| --- | --- | --- |\n| Exemplo 1 | Detalhe | Ativo |\n| Exemplo 2 | Detalhe | Pendente |`
        setBlocks(prev => {
          const updated = [...prev]
          updated[index] = { id: blockId, type: 'table', text: defaultTable }
          syncMarkdown(updated)
          return updated
        })
        setSlashMenu(null)
      }
    },
    {
      id: 'callout-note',
      title: 'Callout de Nota',
      subtitle: 'Destaque azul informativo',
      icon: <Info className="w-4 h-4 text-blue-400" />,
      keywords: ['callout', 'nota', 'info', 'box'],
      execute: (blockId, index) => {
        setBlocks(prev => {
          const updated = [...prev]
          updated[index] = {
            id: blockId,
            type: 'callout',
            calloutType: 'NOTE',
            text: 'Observação importante aqui...'
          }
          syncMarkdown(updated)
          setFocusTarget({ blockId, position: 'end' })
          return updated
        })
        setSlashMenu(null)
      }
    },
    {
      id: 'callout-tip',
      title: 'Callout de Dica',
      subtitle: 'Caixa verde com ideia útil',
      icon: <Sparkles className="w-4 h-4 text-emerald-400" />,
      keywords: ['tip', 'dica', 'truque', 'verde'],
      execute: (blockId, index) => {
        setBlocks(prev => {
          const updated = [...prev]
          updated[index] = {
            id: blockId,
            type: 'callout',
            calloutType: 'TIP',
            text: 'Dica valiosa para aplicar...'
          }
          syncMarkdown(updated)
          setFocusTarget({ blockId, position: 'end' })
          return updated
        })
        setSlashMenu(null)
      }
    },
    {
      id: 'callout-warning',
      title: 'Callout de Aviso',
      subtitle: 'Alerta âmbar para cuidados',
      icon: <AlertTriangle className="w-4 h-4 text-amber-400" />,
      keywords: ['warning', 'aviso', 'alerta', 'cuidado'],
      execute: (blockId, index) => {
        setBlocks(prev => {
          const updated = [...prev]
          updated[index] = {
            id: blockId,
            type: 'callout',
            calloutType: 'WARNING',
            text: 'Atenção a este ponto crítico...'
          }
          syncMarkdown(updated)
          setFocusTarget({ blockId, position: 'end' })
          return updated
        })
        setSlashMenu(null)
      }
    },
    {
      id: 'code',
      title: 'Bloco de Código',
      subtitle: 'Código syntax highlight',
      icon: <CodeIcon className="w-4 h-4 text-rose-400" />,
      keywords: ['code', 'codigo', 'ts', 'js', 'bloco'],
      execute: (blockId, index) => {
        setBlocks(prev => {
          const updated = [...prev]
          updated[index] = {
            id: blockId,
            type: 'code',
            codeLang: 'ts',
            text: '// seu código aqui\nconsole.log("Pyrite");'
          }
          syncMarkdown(updated)
          return updated
        })
        setSlashMenu(null)
      }
    },
    {
      id: 'hr',
      title: 'Linha Divisória',
      subtitle: 'Separador horizontal sutil',
      icon: <Divide className="w-4 h-4 text-zinc-400" />,
      keywords: ['hr', 'linha', 'divisoria', 'separador'],
      execute: (blockId, index) => {
        setBlocks(prev => {
          const updated = [...prev]
          updated[index] = { id: blockId, type: 'hr', text: '' }
          const newP: LiveBlock = {
            id: `blk_p_${Date.now()}`,
            type: 'paragraph',
            text: ''
          }
          updated.splice(index + 1, 0, newP)
          syncMarkdown(updated)
          setFocusTarget({ blockId: newP.id, position: 'start' })
          return updated
        })
        setSlashMenu(null)
      }
    },
    {
      id: 'wikilink',
      title: 'Link Bidirecional',
      subtitle: 'Conectar com outra nota [[...]]',
      icon: <Link2 className="w-4 h-4 text-violet-400" />,
      keywords: ['link', 'wikilink', 'conectar', 'referencia'],
      execute: (blockId, index) => {
        setBlocks(prev => {
          const updated = [...prev]
          const current = updated[index]
          const cleaned = cleanSlashFromText(current.text)
          updated[index] = { ...current, text: `${cleaned}[[` }
          syncMarkdown(updated)
          setFocusTarget({ blockId, position: 'end' })
          return updated
        })
        setSlashMenu(null)
      }
    }
  ]

  const filteredSlashCommands = SLASH_COMMANDS.filter(cmd => {
    if (!slashMenu?.query) return true
    const q = slashMenu.query.toLowerCase().trim()
    return (
      cmd.title.toLowerCase().includes(q) ||
      cmd.id.toLowerCase().includes(q) ||
      cmd.keywords.some(k => k.toLowerCase().includes(q))
    )
  })

  // Toggle task checkbox in-place
  const handleToggleTask = (blockId: string) => {
    setBlocks(prev => {
      const next = prev.map(b => (b.id === blockId ? { ...b, checked: !b.checked } : b))
      syncMarkdown(next)
      return next
    })
  }

  // Handle typing inside contentEditable
  const handleInput = (blockId: string, e: React.FormEvent<HTMLElement>) => {
    isTypingRef.current = true
    const rawText = e.currentTarget.innerText || ''

    // Detect Slash Command trigger: "/"
    const slashIdx = rawText.lastIndexOf('/')
    if (slashIdx !== -1) {
      const charBefore = rawText[slashIdx - 1]
      if (!charBefore || charBefore === ' ' || charBefore === '\n') {
        const query = rawText.slice(slashIdx + 1)
        if (!query.includes(' ') && query.length < 20) {
          setSlashMenu({
            blockId,
            query,
            index: 0
          })
        } else {
          setSlashMenu(null)
        }
      } else {
        setSlashMenu(null)
      }
    } else {
      setSlashMenu(null)
    }

    setBlocks(prev => {
      const index = prev.findIndex(b => b.id === blockId)
      if (index === -1) return prev

      const current = prev[index]

      // Live Markdown triggers on-the-fly:
      if (current.type === 'paragraph') {
        if (rawText.startsWith('# ')) {
          const updated = [...prev]
          const stripped = rawText.slice(2)
          updated[index] = { ...current, type: 'h1', text: stripped }
          syncMarkdown(updated)
          setFocusTarget({ blockId: current.id, position: stripped.length })
          return updated
        }
        if (rawText.startsWith('## ')) {
          const updated = [...prev]
          const stripped = rawText.slice(3)
          updated[index] = { ...current, type: 'h2', text: stripped }
          syncMarkdown(updated)
          setFocusTarget({ blockId: current.id, position: stripped.length })
          return updated
        }
        if (rawText.startsWith('### ')) {
          const updated = [...prev]
          const stripped = rawText.slice(4)
          updated[index] = { ...current, type: 'h3', text: stripped }
          syncMarkdown(updated)
          setFocusTarget({ blockId: current.id, position: stripped.length })
          return updated
        }
        if (rawText.startsWith('- [ ] ') || rawText.startsWith('[] ')) {
          const updated = [...prev]
          const stripped = rawText.startsWith('[] ') ? rawText.slice(3) : rawText.slice(6)
          updated[index] = { ...current, type: 'task', text: stripped, checked: false }
          syncMarkdown(updated)
          setFocusTarget({ blockId: current.id, position: stripped.length })
          return updated
        }
        if (rawText.startsWith('- ') || rawText.startsWith('* ')) {
          const updated = [...prev]
          const stripped = rawText.slice(2)
          updated[index] = { ...current, type: 'bullet', text: stripped }
          syncMarkdown(updated)
          setFocusTarget({ blockId: current.id, position: stripped.length })
          return updated
        }
        if (rawText.match(/^1\.\s/)) {
          const updated = [...prev]
          const stripped = rawText.replace(/^1\.\s/, '')
          updated[index] = { ...current, type: 'number', text: stripped }
          syncMarkdown(updated)
          setFocusTarget({ blockId: current.id, position: stripped.length })
          return updated
        }
        if (rawText.startsWith('> ')) {
          const updated = [...prev]
          const stripped = rawText.slice(2)
          updated[index] = { ...current, type: 'quote', text: stripped }
          syncMarkdown(updated)
          setFocusTarget({ blockId: current.id, position: stripped.length })
          return updated
        }
      }

      const next = [...prev]
      next[index] = { ...current, text: rawText }
      syncMarkdown(next)
      return next
    })
  }

  // Handle smart keyboard navigation (Enter, Backspace, Arrows)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLElement>, _blockId: string, index: number) => {
    // If slash menu is active, intercept arrow keys and Enter
    if (slashMenu && filteredSlashCommands.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSlashMenu(prev => (prev ? { ...prev, index: (prev.index + 1) % filteredSlashCommands.length } : null))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSlashMenu(prev =>
          prev ? { ...prev, index: (prev.index - 1 + filteredSlashCommands.length) % filteredSlashCommands.length } : null
        )
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        const targetCommand = filteredSlashCommands[slashMenu.index] || filteredSlashCommands[0]
        if (targetCommand) {
          targetCommand.execute(slashMenu.blockId, index)
          return
        }
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setSlashMenu(null)
        return
      }
    }

    const current = blocks[index]
    if (!current) return

    // ENTER KEY: Intelligent Block Splitting / Continuation
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()

      const sel = window.getSelection()
      let cursorOffset = current.text.length
      if (sel && sel.rangeCount > 0) {
        cursorOffset = sel.getRangeAt(0).startOffset
      }

      const text = current.text
      const left = text.slice(0, cursorOffset)
      const right = text.slice(cursorOffset)

      // 1. Task continuation or exit
      if (current.type === 'task') {
        if (text.trim() === '') {
          // Empty task -> convert to paragraph (strip checkbox)
          const updated = [...blocks]
          updated[index] = { ...current, type: 'paragraph', text: '' }
          setBlocks(updated)
          syncMarkdown(updated)
          setFocusTarget({ blockId: current.id, position: 'start' })
          return
        }

        const updated = [...blocks]
        updated[index] = { ...current, text: left }
        const nextBlock: LiveBlock = {
          id: `blk_task_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          type: 'task',
          text: right,
          checked: false
        }
        updated.splice(index + 1, 0, nextBlock)
        setBlocks(updated)
        syncMarkdown(updated)
        setFocusTarget({ blockId: nextBlock.id, position: 'start' })
        return
      }

      // 2. Bullet continuation or exit
      if (current.type === 'bullet') {
        if (text.trim() === '') {
          const updated = [...blocks]
          updated[index] = { ...current, type: 'paragraph', text: '' }
          setBlocks(updated)
          syncMarkdown(updated)
          setFocusTarget({ blockId: current.id, position: 'start' })
          return
        }
        const updated = [...blocks]
        updated[index] = { ...current, text: left }
        const nextBlock: LiveBlock = {
          id: `blk_bullet_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          type: 'bullet',
          text: right
        }
        updated.splice(index + 1, 0, nextBlock)
        setBlocks(updated)
        syncMarkdown(updated)
        setFocusTarget({ blockId: nextBlock.id, position: 'start' })
        return
      }

      // 3. Number list continuation or exit
      if (current.type === 'number') {
        if (text.trim() === '') {
          const updated = [...blocks]
          updated[index] = { ...current, type: 'paragraph', text: '' }
          setBlocks(updated)
          syncMarkdown(updated)
          setFocusTarget({ blockId: current.id, position: 'start' })
          return
        }
        const updated = [...blocks]
        updated[index] = { ...current, text: left }
        const nextBlock: LiveBlock = {
          id: `blk_num_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          type: 'number',
          text: right
        }
        updated.splice(index + 1, 0, nextBlock)
        setBlocks(updated)
        syncMarkdown(updated)
        setFocusTarget({ blockId: nextBlock.id, position: 'start' })
        return
      }

      // 4. Heading or paragraph split -> creates paragraph below
      const updated = [...blocks]
      updated[index] = { ...current, text: left }
      const nextBlock: LiveBlock = {
        id: `blk_p_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        type: 'paragraph',
        text: right
      }
      updated.splice(index + 1, 0, nextBlock)
      setBlocks(updated)
      syncMarkdown(updated)
      setFocusTarget({ blockId: nextBlock.id, position: 'start' })
      return
    }

    // BACKSPACE KEY: Smart Block Unwrapping / Deletion
    if (e.key === 'Backspace') {
      const sel = window.getSelection()
      let cursorOffset = 0
      if (sel && sel.rangeCount > 0) {
        cursorOffset = sel.getRangeAt(0).startOffset
      }

      if (cursorOffset === 0) {
        // If task with text, strip checkbox and revert to paragraph
        if (current.type === 'task') {
          e.preventDefault()
          if (current.text === '' && index > 0) {
            const prev = blocks[index - 1]
            const updated = blocks.filter((_, i) => i !== index)
            setBlocks(updated)
            syncMarkdown(updated)
            setFocusTarget({ blockId: prev.id, position: 'end' })
            return
          }
          const updated = [...blocks]
          updated[index] = { ...current, type: 'paragraph' }
          setBlocks(updated)
          syncMarkdown(updated)
          setFocusTarget({ blockId: current.id, position: 'start' })
          return
        }

        // If bullet, number, or heading at offset 0, revert to paragraph
        if (['bullet', 'number', 'h1', 'h2', 'h3', 'h4', 'quote'].includes(current.type)) {
          e.preventDefault()
          const updated = [...blocks]
          updated[index] = { ...current, type: 'paragraph' }
          setBlocks(updated)
          syncMarkdown(updated)
          setFocusTarget({ blockId: current.id, position: 'start' })
          return
        }

        // If paragraph at 0 and previous block exists, merge with previous block
        if (index > 0) {
          e.preventDefault()
          const prev = blocks[index - 1]
          const mergePosition = prev.text.length
          const updated = [...blocks]
          updated[index - 1] = { ...prev, text: prev.text + current.text }
          updated.splice(index, 1)
          setBlocks(updated)
          syncMarkdown(updated)
          setFocusTarget({ blockId: prev.id, position: mergePosition })
          return
        }
      }
    }

    // ARROW NAVIGATION ACROSS BLOCKS
    if (e.key === 'ArrowUp' && index > 0) {
      const sel = window.getSelection()
      if (sel && sel.getRangeAt(0).startOffset === 0) {
        e.preventDefault()
        const prev = blocks[index - 1]
        setFocusTarget({ blockId: prev.id, position: 'end' })
      }
    }

    if (e.key === 'ArrowDown' && index < blocks.length - 1) {
      const sel = window.getSelection()
      if (sel && sel.getRangeAt(0).startOffset >= current.text.length) {
        e.preventDefault()
        const next = blocks[index + 1]
        setFocusTarget({ blockId: next.id, position: 'start' })
      }
    }
  }

  // Handle Pasting multi-line text (splices blocks naturally)
  const handlePaste = (e: React.ClipboardEvent<HTMLElement>, index: number) => {
    const text = e.clipboardData.getData('text/plain')
    if (text.includes('\n')) {
      e.preventDefault()
      const pastedBlocks = parseMarkdownToBlocks(text)
      const updated = [...blocks]
      updated.splice(index, 1, ...pastedBlocks)
      setBlocks(updated)
      syncMarkdown(updated)
      if (pastedBlocks.length > 0) {
        setFocusTarget({ blockId: pastedBlocks[pastedBlocks.length - 1].id, position: 'end' })
      }
    }
  }

  // Expose handles for toolbar formatting
  React.useImperativeHandle(
    editorRef,
    () => ({
      setBlockType: (newType: LiveBlock['type']) => {
        if (!activeBlockId) return
        setBlocks(prev => {
          const updated = prev.map(b => (b.id === activeBlockId ? { ...b, type: newType } : b))
          syncMarkdown(updated)
          return updated
        })
      },
      toggleBold: () => {
        document.execCommand('bold', false)
      },
      toggleItalic: () => {
        document.execCommand('italic', false)
      },
      insertWikiLink: (target: string) => {
        if (!activeBlockId) return
        setBlocks(prev => {
          const updated = prev.map(b =>
            b.id === activeBlockId ? { ...b, text: `${b.text} [[${target}]]` } : b
          )
          syncMarkdown(updated)
          return updated
        })
      },
      insertCodeBlock: () => {
        const newBlock: LiveBlock = {
          id: `blk_code_${Date.now()}`,
          type: 'code',
          text: '// seu código aqui',
          codeLang: 'ts'
        }
        setBlocks(prev => {
          const updated = [...prev, newBlock]
          syncMarkdown(updated)
          return updated
        })
      },
      insertCallout: (calloutType: string) => {
        const newBlock: LiveBlock = {
          id: `blk_callout_${Date.now()}`,
          type: 'callout',
          text: 'Escreva sua anotação...',
          calloutType
        }
        setBlocks(prev => {
          const updated = [...prev, newBlock]
          syncMarkdown(updated)
          return updated
        })
      },
      insertTable: () => {
        const defaultTable = `| Coluna 1 | Coluna 2 | Coluna 3 |\n| --- | --- | --- |\n| Item 1 | Detalhe | Ativo |\n| Item 2 | Detalhe | Pendente |`
        const newBlock: LiveBlock = {
          id: `blk_table_${Date.now()}`,
          type: 'table',
          text: defaultTable
        }
        setBlocks(prev => {
          const updated = [...prev, newBlock]
          syncMarkdown(updated)
          return updated
        })
      }
    }),
    [activeBlockId, syncMarkdown]
  )

  // Copy code block helper
  const copyCode = (codeStr: string, blockId: string) => {
    navigator.clipboard.writeText(codeStr)
    setCopiedCodeId(blockId)
    setTimeout(() => setCopiedCodeId(null), 2000)
  }

  // Table manipulation helpers
  const handleTableCellChange = (blockId: string, rowIndex: number, colIndex: number, newText: string) => {
    setBlocks(prev => {
      const idx = prev.findIndex(b => b.id === blockId)
      if (idx === -1) return prev
      const current = prev[idx]
      const lines = current.text.split('\n').filter(l => l.trim().startsWith('|') && l.trim().endsWith('|'))
      if (lines.length < 2) return prev

      const headerCells = lines[0].split('|').slice(1, -1).map(c => c.trim())
      const separator = lines[1]
      const dataRows = lines.slice(2).map(l => l.split('|').slice(1, -1).map(c => c.trim()))

      if (rowIndex === -1) {
        // Changing header cell
        headerCells[colIndex] = newText
      } else {
        if (!dataRows[rowIndex]) dataRows[rowIndex] = []
        dataRows[rowIndex][colIndex] = newText
      }

      const newHeaderStr = `| ${headerCells.join(' | ')} |`
      const newDataRowsStr = dataRows.map(row => `| ${row.join(' | ')} |`).join('\n')
      const finalTableText = `${newHeaderStr}\n${separator}\n${newDataRowsStr}`

      const updated = [...prev]
      updated[idx] = { ...current, text: finalTableText }
      syncMarkdown(updated)
      return updated
    })
  }

  const handleAddTableRow = (blockId: string) => {
    setBlocks(prev => {
      const idx = prev.findIndex(b => b.id === blockId)
      if (idx === -1) return prev
      const current = prev[idx]
      const lines = current.text.split('\n').filter(l => l.trim().startsWith('|') && l.trim().endsWith('|'))
      if (lines.length < 2) return prev

      const cols = lines[0].split('|').slice(1, -1).length
      const emptyRow = `| ${Array(cols).fill('Novo').join(' | ')} |`
      const newText = `${current.text.trim()}\n${emptyRow}`

      const updated = [...prev]
      updated[idx] = { ...current, text: newText }
      syncMarkdown(updated)
      return updated
    })
  }

  const handleAddTableColumn = (blockId: string) => {
    setBlocks(prev => {
      const idx = prev.findIndex(b => b.id === blockId)
      if (idx === -1) return prev
      const current = prev[idx]
      const lines = current.text.split('\n').filter(l => l.trim().startsWith('|') && l.trim().endsWith('|'))
      if (lines.length < 2) return prev

      const newLines = lines.map((line, lIdx) => {
        if (lIdx === 1) {
          return line.replace(/\|\s*$/, ' --- |')
        }
        return line.replace(/\|\s*$/, ` Nova Coluna |`)
      })

      const updated = [...prev]
      updated[idx] = { ...current, text: newLines.join('\n') }
      syncMarkdown(updated)
      return updated
    })
  }

  const isEditable = displayMode === 'live'

  return (
    <div
      className={`w-full min-h-[500px] flex flex-col font-sans ${fontSizeClass} pb-24`}
      onClick={(e) => {
        // ONLY if clicking directly on the empty background area below all blocks:
        if (e.target === e.currentTarget && isEditable && blocks.length > 0) {
          const last = blocks[blocks.length - 1]
          setFocusTarget({ blockId: last.id, position: 'end' })
        }
      }}
    >
      {blocks.map((block, idx) => {
        const isFocused = isEditable && activeBlockId === block.id

        // Heading 1 (Large Serif Header matching Obsidian screenshot)
        if (block.type === 'h1') {
          return (
            <div
              key={block.id}
              onClick={e => e.stopPropagation()}
              className="relative group my-3"
            >
              <h1
                data-block-id={block.id}
                contentEditable={isEditable}
                suppressContentEditableWarning
                onFocus={() => setActiveBlockId(block.id)}
                onBlur={() => {
                  if (activeBlockId === block.id) setActiveBlockId(null)
                }}
                onInput={e => handleInput(block.id, e)}
                onKeyDown={e => handleKeyDown(e, block.id, idx)}
                onPaste={e => handlePaste(e, idx)}
                className={`text-2xl font-serif font-bold text-zinc-100 tracking-tight pb-1 border-b border-zinc-800/60 focus:outline-none transition-all rounded px-0.5 ${
                  isFocused ? 'ring-1 ring-violet-500/30' : ''
                }`}
              >
                {isFocused && (
                  <span className="text-violet-400/60 font-mono text-base mr-1.5 select-none font-normal">
                    # 
                  </span>
                )}
                {renderInlineFormatted(block.text, isFocused, onNavigate)}
              </h1>
            </div>
          )
        }

        // Heading 2 (Medium Serif Header matching "Antes de criar", "Etapa 1")
        if (block.type === 'h2') {
          return (
            <div
              key={block.id}
              onClick={e => e.stopPropagation()}
              className="relative group mt-6 mb-2"
            >
              <h2
                data-block-id={block.id}
                contentEditable={isEditable}
                suppressContentEditableWarning
                onFocus={() => setActiveBlockId(block.id)}
                onBlur={() => {
                  if (activeBlockId === block.id) setActiveBlockId(null)
                }}
                onInput={e => handleInput(block.id, e)}
                onKeyDown={e => handleKeyDown(e, block.id, idx)}
                onPaste={e => handlePaste(e, idx)}
                className={`text-xl font-serif font-semibold text-zinc-200 tracking-tight pb-0.5 focus:outline-none transition-all rounded px-0.5 ${
                  isFocused ? 'ring-1 ring-violet-500/30' : ''
                }`}
              >
                {isFocused && (
                  <span className="text-violet-400/60 font-mono text-sm mr-1.5 select-none font-normal">
                    ## 
                  </span>
                )}
                {renderInlineFormatted(block.text, isFocused, onNavigate)}
              </h2>
            </div>
          )
        }

        // Heading 3
        if (block.type === 'h3') {
          return (
            <div
              key={block.id}
              onClick={e => e.stopPropagation()}
              className="relative group mt-4 mb-1.5"
            >
              <h3
                data-block-id={block.id}
                contentEditable={isEditable}
                suppressContentEditableWarning
                onFocus={() => setActiveBlockId(block.id)}
                onBlur={() => {
                  if (activeBlockId === block.id) setActiveBlockId(null)
                }}
                onInput={e => handleInput(block.id, e)}
                onKeyDown={e => handleKeyDown(e, block.id, idx)}
                onPaste={e => handlePaste(e, idx)}
                className={`text-lg font-serif font-medium text-zinc-200 tracking-tight focus:outline-none transition-all rounded px-0.5 ${
                  isFocused ? 'ring-1 ring-violet-500/30' : ''
                }`}
              >
                {isFocused && (
                  <span className="text-violet-400/60 font-mono text-xs mr-1.5 select-none font-normal">
                    ### 
                  </span>
                )}
                {renderInlineFormatted(block.text, isFocused, onNavigate)}
              </h3>
            </div>
          )
        }

        // Checklist Item (Square checkbox + In-place editable text matching Obsidian screenshot)
        if (block.type === 'task') {
          return (
            <div
              key={block.id}
              onClick={e => e.stopPropagation()}
              className="flex items-start gap-2.5 my-1.5 group select-none"
            >
              <button
                type="button"
                onClick={e => {
                  e.stopPropagation()
                  handleToggleTask(block.id)
                }}
                className={`mt-0.5 w-[17px] h-[17px] rounded-[3px] border transition-all flex items-center justify-center shrink-0 cursor-pointer ${
                  block.checked
                    ? 'bg-violet-600/30 border-violet-500 text-violet-300'
                    : 'border-zinc-600 hover:border-zinc-400 bg-[#202024]'
                }`}
                title={block.checked ? 'Marcar como não concluída' : 'Marcar como concluída'}
              >
                {block.checked && <Check className="w-3.5 h-3.5 stroke-[3]" />}
              </button>

              <div
                data-block-id={block.id}
                contentEditable={isEditable}
                suppressContentEditableWarning
                onFocus={() => setActiveBlockId(block.id)}
                onBlur={() => {
                  if (activeBlockId === block.id) setActiveBlockId(null)
                }}
                onInput={e => handleInput(block.id, e)}
                onKeyDown={e => handleKeyDown(e, block.id, idx)}
                onPaste={e => handlePaste(e, idx)}
                className={`flex-1 text-[13px] md:text-sm leading-relaxed focus:outline-none transition-all rounded px-1 select-text ${
                  block.checked ? 'line-through text-zinc-500' : 'text-zinc-200'
                } ${isFocused ? 'ring-1 ring-violet-500/30' : ''}`}
              >
                {renderInlineFormatted(block.text, isFocused, onNavigate)}
              </div>
            </div>
          )
        }

        // Bullet list item
        if (block.type === 'bullet') {
          return (
            <div
              key={block.id}
              onClick={e => e.stopPropagation()}
              className="flex items-start gap-2.5 my-1 group"
            >
              <span className="text-zinc-500 mt-1 select-none text-base leading-none">•</span>
              <div
                data-block-id={block.id}
                contentEditable={isEditable}
                suppressContentEditableWarning
                onFocus={() => setActiveBlockId(block.id)}
                onBlur={() => {
                  if (activeBlockId === block.id) setActiveBlockId(null)
                }}
                onInput={e => handleInput(block.id, e)}
                onKeyDown={e => handleKeyDown(e, block.id, idx)}
                onPaste={e => handlePaste(e, idx)}
                className={`flex-1 text-[13px] md:text-sm text-zinc-300 leading-relaxed focus:outline-none transition-all rounded px-1 select-text ${
                  isFocused ? 'ring-1 ring-violet-500/30' : ''
                }`}
              >
                {renderInlineFormatted(block.text, isFocused, onNavigate)}
              </div>
            </div>
          )
        }

        // Numbered list item
        if (block.type === 'number') {
          return (
            <div
              key={block.id}
              onClick={e => e.stopPropagation()}
              className="flex items-start gap-2 my-1 group"
            >
              <span className="text-zinc-500 font-mono text-xs mt-0.5 select-none shrink-0 min-w-[16px]">
                {idx + 1}.
              </span>
              <div
                data-block-id={block.id}
                contentEditable={isEditable}
                suppressContentEditableWarning
                onFocus={() => setActiveBlockId(block.id)}
                onBlur={() => {
                  if (activeBlockId === block.id) setActiveBlockId(null)
                }}
                onInput={e => handleInput(block.id, e)}
                onKeyDown={e => handleKeyDown(e, block.id, idx)}
                onPaste={e => handlePaste(e, idx)}
                className={`flex-1 text-[13px] md:text-sm text-zinc-300 leading-relaxed focus:outline-none transition-all rounded px-1 select-text ${
                  isFocused ? 'ring-1 ring-violet-500/30' : ''
                }`}
              >
                {renderInlineFormatted(block.text, isFocused, onNavigate)}
              </div>
            </div>
          )
        }

        // Markdown Table Block
        if (block.type === 'table') {
          const tableLines = block.text.split('\n').filter(l => l.trim().startsWith('|') && l.trim().endsWith('|'))
          const hasValidTable = tableLines.length >= 2
          const headerCells = hasValidTable ? tableLines[0].split('|').slice(1, -1).map(c => c.trim()) : ['Coluna 1', 'Coluna 2']
          const bodyRows = hasValidTable ? tableLines.slice(2).map(l => l.split('|').slice(1, -1).map(c => c.trim())) : []

          return (
            <div
              key={block.id}
              onClick={e => e.stopPropagation()}
              className="my-5 rounded-xl border border-zinc-800 bg-zinc-950/40 overflow-hidden shadow-lg group relative"
            >
              {/* Table header bar */}
              <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-900 border-b border-zinc-800 text-xs text-zinc-400">
                <div className="flex items-center gap-1.5 font-medium text-zinc-300">
                  <TableIcon className="w-3.5 h-3.5 text-violet-400" />
                  <span>Tabela Markdown</span>
                </div>

                {isEditable && (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleAddTableRow(block.id)}
                      className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors"
                      title="Adicionar linha"
                    >
                      <Plus className="w-3 h-3 text-emerald-400" />
                      <span>Linha</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAddTableColumn(block.id)}
                      className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors"
                      title="Adicionar coluna"
                    >
                      <Plus className="w-3 h-3 text-cyan-400" />
                      <span>Coluna</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setRawTableEditId(rawTableEditId === block.id ? null : block.id)}
                      className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
                      title="Alternar edição direta do código da tabela"
                    >
                      <Code className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>

              {rawTableEditId === block.id && isEditable ? (
                <div className="p-3 bg-zinc-950 font-mono text-xs">
                  <textarea
                    value={block.text}
                    onChange={e => {
                      const updated = [...blocks]
                      updated[idx] = { ...block, text: e.target.value }
                      setBlocks(updated)
                      syncMarkdown(updated)
                    }}
                    rows={tableLines.length + 1}
                    className="w-full bg-transparent text-zinc-200 focus:outline-none resize-none font-mono"
                  />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-zinc-900/80 border-b border-zinc-800 text-zinc-200">
                        {headerCells.map((head, cIdx) => (
                          <th
                            key={cIdx}
                            contentEditable={isEditable}
                            suppressContentEditableWarning
                            onBlur={e => handleTableCellChange(block.id, -1, cIdx, e.currentTarget.innerText)}
                            className="px-4 py-2.5 font-semibold text-zinc-200 border-r border-zinc-800/60 last:border-r-0 focus:outline-none focus:bg-violet-950/30"
                          >
                            {head}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/60">
                      {bodyRows.map((row, rIdx) => (
                        <tr
                          key={rIdx}
                          className="hover:bg-zinc-900/40 transition-colors odd:bg-zinc-950/40 even:bg-zinc-900/20"
                        >
                          {headerCells.map((_, cIdx) => {
                            const cellValue = row[cIdx] || ''
                            return (
                              <td
                                key={cIdx}
                                contentEditable={isEditable}
                                suppressContentEditableWarning
                                onBlur={e => handleTableCellChange(block.id, rIdx, cIdx, e.currentTarget.innerText)}
                                className="px-4 py-2 text-zinc-300 border-r border-zinc-800/40 last:border-r-0 focus:outline-none focus:bg-violet-950/30"
                              >
                                {renderInlineFormatted(cellValue, false, onNavigate)}
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )
        }

        // Math Block $$ ... $$
        if (block.type === 'math') {
          return (
            <div
              key={block.id}
              onClick={e => e.stopPropagation()}
              className="my-4 p-4 rounded-xl border border-amber-800/30 bg-amber-950/20 text-center font-serif text-lg text-amber-200 shadow-md relative group"
            >
              <div
                data-block-id={block.id}
                contentEditable={isEditable}
                suppressContentEditableWarning
                onFocus={() => setActiveBlockId(block.id)}
                onBlur={() => {
                  if (activeBlockId === block.id) setActiveBlockId(null)
                }}
                onInput={e => handleInput(block.id, e)}
                onKeyDown={e => handleKeyDown(e, block.id, idx)}
                className="focus:outline-none select-text tracking-wide"
              >
                {block.text}
              </div>
            </div>
          )
        }

        // Blockquote
        if (block.type === 'quote') {
          return (
            <blockquote
              key={block.id}
              onClick={e => e.stopPropagation()}
              className="my-3 pl-4 border-l-2 border-violet-500/80 italic text-zinc-400 text-xs py-0.5"
            >
              <div
                data-block-id={block.id}
                contentEditable={isEditable}
                suppressContentEditableWarning
                onFocus={() => setActiveBlockId(block.id)}
                onBlur={() => {
                  if (activeBlockId === block.id) setActiveBlockId(null)
                }}
                onInput={e => handleInput(block.id, e)}
                onKeyDown={e => handleKeyDown(e, block.id, idx)}
                onPaste={e => handlePaste(e, idx)}
                className="focus:outline-none leading-relaxed select-text"
              >
                {renderInlineFormatted(block.text, isFocused, onNavigate)}
              </div>
            </blockquote>
          )
        }

        // Obsidian Callout (> [!NOTE], > [!TIP], etc.)
        if (block.type === 'callout') {
          let calloutTheme = 'border-blue-500/60 bg-blue-950/20 text-blue-200'
          let Icon = Info

          if (block.calloutType === 'TIP') {
            calloutTheme = 'border-emerald-500/60 bg-emerald-950/20 text-emerald-200'
            Icon = Lightbulb
          } else if (block.calloutType === 'WARNING') {
            calloutTheme = 'border-amber-500/60 bg-amber-950/20 text-amber-200'
            Icon = AlertTriangle
          } else if (block.calloutType === 'IMPORTANT' || block.calloutType === 'CAUTION') {
            calloutTheme = 'border-rose-500/60 bg-rose-950/20 text-rose-200'
            Icon = AlertCircle
          }

          return (
            <div
              key={block.id}
              onClick={e => e.stopPropagation()}
              className={`my-4 p-3.5 rounded-xl border-l-4 ${calloutTheme} text-xs space-y-1.5 shadow-sm`}
            >
              <div className="flex items-center gap-2 font-semibold">
                <Icon className="w-4 h-4 shrink-0" />
                <span>{block.calloutType || 'NOTE'}</span>
              </div>
              <div
                data-block-id={block.id}
                contentEditable={isEditable}
                suppressContentEditableWarning
                onFocus={() => setActiveBlockId(block.id)}
                onBlur={() => {
                  if (activeBlockId === block.id) setActiveBlockId(null)
                }}
                onInput={e => handleInput(block.id, e)}
                onKeyDown={e => handleKeyDown(e, block.id, idx)}
                onPaste={e => handlePaste(e, idx)}
                className="pl-6 space-y-1 text-zinc-300 focus:outline-none leading-relaxed select-text whitespace-pre-wrap"
              >
                {renderInlineFormatted(block.text, isFocused, onNavigate)}
              </div>
            </div>
          )
        }

        // Code block
        if (block.type === 'code') {
          return (
            <div
              key={block.id}
              onClick={e => e.stopPropagation()}
              className="my-4 rounded-xl overflow-hidden border border-zinc-800 bg-zinc-950/90 text-xs font-mono shadow-lg"
            >
              <div className="flex items-center justify-between px-3.5 py-2 bg-zinc-900 border-b border-zinc-800 text-xs text-zinc-400">
                <span className="uppercase font-semibold tracking-wider text-[11px] text-zinc-300 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-violet-500" />
                  {block.codeLang || 'código'}
                </span>
                <button
                  type="button"
                  onClick={() => copyCode(block.text, block.id)}
                  className="flex items-center gap-1 px-2 py-0.5 rounded hover:bg-zinc-800 text-zinc-300 hover:text-zinc-100 transition-colors"
                >
                  {copiedCodeId === block.id ? (
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
              <div
                data-block-id={block.id}
                contentEditable={isEditable}
                suppressContentEditableWarning
                onFocus={() => setActiveBlockId(block.id)}
                onBlur={() => {
                  if (activeBlockId === block.id) setActiveBlockId(null)
                }}
                onInput={e => handleInput(block.id, e)}
                onKeyDown={e => handleKeyDown(e, block.id, idx)}
                className="p-4 overflow-x-auto text-zinc-300 leading-relaxed focus:outline-none select-text whitespace-pre font-mono"
              >
                {block.text}
              </div>
            </div>
          )
        }

        // Horizontal Rule
        if (block.type === 'hr') {
          return <hr key={block.id} className="my-5 border-zinc-800" />
        }

        // Empty line
        if (block.type === 'empty') {
          return (
            <div
              key={block.id}
              data-block-id={block.id}
              contentEditable={isEditable}
              suppressContentEditableWarning
              onClick={e => e.stopPropagation()}
              onFocus={() => setActiveBlockId(block.id)}
              onBlur={() => {
                if (activeBlockId === block.id) setActiveBlockId(null)
              }}
              onInput={e => handleInput(block.id, e)}
              onKeyDown={e => handleKeyDown(e, block.id, idx)}
              className="h-5 my-0.5 focus:outline-none rounded px-0.5"
            >
              {'\u00A0'}
            </div>
          )
        }

        // Standard Paragraph
        return (
          <div key={block.id} className="relative group" onClick={e => e.stopPropagation()}>
            <p
              data-block-id={block.id}
              contentEditable={isEditable}
              suppressContentEditableWarning
              onFocus={() => setActiveBlockId(block.id)}
              onBlur={() => {
                // If slash menu not open, blur
                if (!slashMenu && activeBlockId === block.id) {
                  setActiveBlockId(null)
                }
              }}
              onInput={e => handleInput(block.id, e)}
              onKeyDown={e => handleKeyDown(e, block.id, idx)}
              onPaste={e => handlePaste(e, idx)}
              className={`text-[13px] md:text-sm text-zinc-300 leading-relaxed my-1.5 focus:outline-none transition-all rounded px-0.5 select-text ${
                isFocused ? 'ring-1 ring-violet-500/30' : ''
              }`}
            >
              {renderInlineFormatted(block.text, isFocused, onNavigate)}
            </p>

            {/* Floating Slash Command (/) Menu attached right to the active block */}
            {isFocused && slashMenu && slashMenu.blockId === block.id && filteredSlashCommands.length > 0 && (
              <div className="absolute left-0 top-full mt-1 z-50 w-72 bg-zinc-900 border border-violet-500/60 rounded-xl shadow-2xl p-1.5 overflow-hidden backdrop-blur-md">
                <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-violet-400 border-b border-zinc-800 flex items-center justify-between">
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
                          cmd.execute(block.id, idx)
                        }}
                        onMouseEnter={() => setSlashMenu(prev => (prev ? { ...prev, index: cIdx } : null))}
                        className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-violet-600/30 text-violet-200 border border-violet-500/30'
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
          </div>
        )
      })}
    </div>
  )
}
