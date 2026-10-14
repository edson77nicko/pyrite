import React, { useState, useRef, useEffect } from 'react'
import type { Note, EditorDisplayMode, TabItem } from '../types'
import { MarkdownRenderer } from './MarkdownRenderer'
import {
  Columns2,
  Eye,
  Edit3,
  Heading1,
  Heading2,
  Heading3,
  Bold,
  Italic,
  ListTodo,
  Code,
  Link2,
  Clock,
  FileText,
  Tag,
  Folder,
  Plus,
  X,
  Table,
  Sparkles,
  Info
} from 'lucide-react'

interface EditorProps {
  note: Note
  allNotes: Note[]
  tabs: TabItem[]
  activeTabId: string
  onSelectTab: (tabId: string) => void
  onCloseTab: (tabId: string) => void
  onNewTab: () => void
  displayMode: EditorDisplayMode
  onChangeDisplayMode: (mode: EditorDisplayMode) => void
  onUpdateNote: (updated: Note) => void
  onNavigate: (title: string) => void
}

interface SlashCommand {
  id: string
  title: string
  subtitle: string
  icon: React.ReactNode
  snippet: string
}

export const Editor: React.FC<EditorProps> = ({
  note,
  allNotes,
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onNewTab,
  displayMode,
  onChangeDisplayMode,
  onUpdateNote,
  onNavigate
}) => {
  const [content, setContent] = useState(note.content)
  const [title, setTitle] = useState(note.title)
  const [showLinkSuggest, setShowLinkSuggest] = useState(false)
  const [suggestQuery, setSuggestQuery] = useState('')
  const [showSlashMenu, setShowSlashMenu] = useState(false)
  const [slashQuery, setSlashQuery] = useState('')
  const [slashIndex, setSlashIndex] = useState(0)

  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  // Keep internal state in sync when note changes
  useEffect(() => {
    setContent(note.content)
    setTitle(note.title)
    setShowLinkSuggest(false)
    setShowSlashMenu(false)
  }, [note.id])

  const handleTitleChange = (newTitle: string) => {
    setTitle(newTitle)
    onUpdateNote({ ...note, title: newTitle, updatedAt: Date.now() })
  }

  // Handle typing inside textarea
  const handleContentChange = (newContent: string) => {
    setContent(newContent)
    onUpdateNote({ ...note, content: newContent, updatedAt: Date.now() })

    const textarea = textareaRef.current
    if (!textarea) return

    const cursor = textarea.selectionStart
    const textBefore = newContent.slice(0, cursor)

    // Check for [[ autocomplete trigger
    const lastDoubleBracket = textBefore.lastIndexOf('[[')
    if (lastDoubleBracket !== -1 && lastDoubleBracket > textBefore.lastIndexOf(']]')) {
      const query = textBefore.slice(lastDoubleBracket + 2)
      if (!query.includes('\n') && query.length < 30) {
        setSuggestQuery(query)
        setShowLinkSuggest(true)
        setShowSlashMenu(false)
        return
      }
    }
    setShowLinkSuggest(false)

    // Check for Slash Command trigger /
    const lastSlash = textBefore.lastIndexOf('/')
    if (lastSlash !== -1) {
      const charBeforeSlash = textBefore[lastSlash - 1]
      const textAfterSlash = textBefore.slice(lastSlash + 1)
      if ((!charBeforeSlash || charBeforeSlash === '\n' || charBeforeSlash === ' ') && !textAfterSlash.includes('\n') && textAfterSlash.length < 20) {
        setSlashQuery(textAfterSlash)
        setShowSlashMenu(true)
        setSlashIndex(0)
        return
      }
    }
    setShowSlashMenu(false)
  }

  // Smart Keyboard Handling: Tab, Smart List Continuation on Enter, Brackets
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const textarea = textareaRef.current
    if (!textarea) return

    // Slash menu navigation with Arrow keys
    if (showSlashMenu) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSlashIndex(idx => (idx + 1) % Math.max(1, filteredSlashCommands.length))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSlashIndex(idx => (idx - 1 + filteredSlashCommands.length) % Math.max(1, filteredSlashCommands.length))
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        if (filteredSlashCommands[slashIndex]) {
          applySlashCommand(filteredSlashCommands[slashIndex])
          return
        }
      }
      if (e.key === 'Escape') {
        setShowSlashMenu(false)
        return
      }
    }

    // Link suggestions navigation with Enter
    if (showLinkSuggest && e.key === 'Enter') {
      if (filteredLinkSuggestions.length > 0) {
        e.preventDefault()
        insertLinkSuggestion(filteredLinkSuggestions[0].title)
        return
      }
    }

    // 1. Tab key for 2 spaces indentation
    if (e.key === 'Tab') {
      e.preventDefault()
      const start = textarea.selectionStart
      const end = textarea.selectionEnd

      if (e.shiftKey) {
        // Unindent
        const linesBefore = content.slice(0, start).split('\n')
        const currentLineIdx = linesBefore.length - 1
        const allLines = content.split('\n')
        const curLine = allLines[currentLineIdx]
        if (curLine.startsWith('  ')) {
          allLines[currentLineIdx] = curLine.slice(2)
          const newText = allLines.join('\n')
          setContent(newText)
          onUpdateNote({ ...note, content: newText, updatedAt: Date.now() })
        }
      } else {
        // Indent
        const newText = content.slice(0, start) + '  ' + content.slice(end)
        setContent(newText)
        onUpdateNote({ ...note, content: newText, updatedAt: Date.now() })
        setTimeout(() => {
          textarea.setSelectionRange(start + 2, start + 2)
        }, 10)
      }
      return
    }

    // 2. Smart List & Task Continuation on Enter (Obsidian Behavior)
    if (e.key === 'Enter' && !e.shiftKey && !showSlashMenu && !showLinkSuggest) {
      const cursor = textarea.selectionStart
      const textBefore = content.slice(0, cursor)
      const currentLine = textBefore.split('\n').pop() || ''

      // Check for Task item: - [ ] or - [x]
      const taskMatch = currentLine.match(/^(\s*)-\s\[([ xX])\]\s(.*)$/)
      if (taskMatch) {
        e.preventDefault()
        const textAfterBullet = taskMatch[3]
        if (textAfterBullet.trim() === '') {
          // Empty task item: clear the bullet on Enter!
          const lineStart = cursor - currentLine.length
          const newText = content.slice(0, lineStart) + content.slice(cursor)
          setContent(newText)
          onUpdateNote({ ...note, content: newText, updatedAt: Date.now() })
        } else {
          // Continue task item
          const prefix = `\n${taskMatch[1]}- [ ] `
          const newText = content.slice(0, cursor) + prefix + content.slice(cursor)
          setContent(newText)
          onUpdateNote({ ...note, content: newText, updatedAt: Date.now() })
          setTimeout(() => {
            textarea.setSelectionRange(cursor + prefix.length, cursor + prefix.length)
          }, 10)
        }
        return
      }

      // Check for bullet list: - item or * item
      const bulletMatch = currentLine.match(/^(\s*)[-*]\s(.*)$/)
      if (bulletMatch) {
        e.preventDefault()
        const textAfterBullet = bulletMatch[2]
        if (textAfterBullet.trim() === '') {
          // Empty bullet: remove it on Enter!
          const lineStart = cursor - currentLine.length
          const newText = content.slice(0, lineStart) + content.slice(cursor)
          setContent(newText)
          onUpdateNote({ ...note, content: newText, updatedAt: Date.now() })
        } else {
          const prefix = `\n${bulletMatch[1]}- `
          const newText = content.slice(0, cursor) + prefix + content.slice(cursor)
          setContent(newText)
          onUpdateNote({ ...note, content: newText, updatedAt: Date.now() })
          setTimeout(() => {
            textarea.setSelectionRange(cursor + prefix.length, cursor + prefix.length)
          }, 10)
        }
        return
      }

      // Check for numbered list: 1. item
      const numMatch = currentLine.match(/^(\s*)(\d+)\.\s(.*)$/)
      if (numMatch) {
        e.preventDefault()
        const textAfterNum = numMatch[3]
        if (textAfterNum.trim() === '') {
          // Empty number: remove it
          const lineStart = cursor - currentLine.length
          const newText = content.slice(0, lineStart) + content.slice(cursor)
          setContent(newText)
          onUpdateNote({ ...note, content: newText, updatedAt: Date.now() })
        } else {
          const nextNum = parseInt(numMatch[2], 10) + 1
          const prefix = `\n${numMatch[1]}${nextNum}. `
          const newText = content.slice(0, cursor) + prefix + content.slice(cursor)
          setContent(newText)
          onUpdateNote({ ...note, content: newText, updatedAt: Date.now() })
          setTimeout(() => {
            textarea.setSelectionRange(cursor + prefix.length, cursor + prefix.length)
          }, 10)
        }
        return
      }
    }
  }

  // Insert link suggestion
  const insertLinkSuggestion = (targetTitle: string) => {
    const textarea = textareaRef.current
    if (!textarea) return

    const cursor = textarea.selectionStart
    const textBefore = content.slice(0, cursor)
    const textAfter = content.slice(cursor)
    const lastDoubleBracket = textBefore.lastIndexOf('[[')

    if (lastDoubleBracket !== -1) {
      const beforeBracket = textBefore.slice(0, lastDoubleBracket)
      const newText = `${beforeBracket}[[${targetTitle}]]${textAfter}`
      setContent(newText)
      onUpdateNote({ ...note, content: newText, updatedAt: Date.now() })
      setShowLinkSuggest(false)

      setTimeout(() => {
        textarea.focus()
        const newCursor = lastDoubleBracket + targetTitle.length + 4
        textarea.setSelectionRange(newCursor, newCursor)
      }, 50)
    }
  }

  // Slash commands registry
  const SLASH_COMMANDS: SlashCommand[] = [
    { id: 'h1', title: 'Título 1', subtitle: 'Cabeçalho principal grande', icon: <Heading1 className="w-4 h-4 text-violet-400" />, snippet: '# ' },
    { id: 'h2', title: 'Título 2', subtitle: 'Subseção média', icon: <Heading2 className="w-4 h-4 text-blue-400" />, snippet: '## ' },
    { id: 'h3', title: 'Título 3', subtitle: 'Subtítulo pequeno', icon: <Heading3 className="w-4 h-4 text-cyan-400" />, snippet: '### ' },
    { id: 'task', title: 'Lista de Tarefas', subtitle: 'Caixa de seleção interativa', icon: <ListTodo className="w-4 h-4 text-emerald-400" />, snippet: '- [ ] ' },
    { id: 'callout-note', title: 'Callout de Nota', subtitle: 'Caixa azul com informação', icon: <Info className="w-4 h-4 text-blue-400" />, snippet: '> [!NOTE]\n> Escreva sua observação aqui...\n' },
    { id: 'callout-tip', title: 'Callout de Dica', subtitle: 'Caixa verde com ideia útil', icon: <Sparkles className="w-4 h-4 text-emerald-400" />, snippet: '> [!TIP]\n> Dica valiosa aqui...\n' },
    { id: 'code', title: 'Bloco de Código', subtitle: 'Código com syntax highlight', icon: <Code className="w-4 h-4 text-amber-400" />, snippet: '```ts\n// seu código aqui\n```\n' },
    { id: 'table', title: 'Tabela Markdown', subtitle: 'Grade de dados estruturada', icon: <Table className="w-4 h-4 text-purple-400" />, snippet: '| Item | Descrição | Status |\n| --- | --- | --- |\n| Exemplo 1 | Detalhe | Concluído |\n| Exemplo 2 | Detalhe | Em andamento |\n' },
    { id: 'wikilink', title: 'Link Bidirecional', subtitle: 'Conectar com outra nota', icon: <Link2 className="w-4 h-4 text-violet-400" />, snippet: '[[' },
  ]

  const filteredSlashCommands = SLASH_COMMANDS.filter(cmd =>
    cmd.title.toLowerCase().includes(slashQuery.toLowerCase()) ||
    cmd.id.toLowerCase().includes(slashQuery.toLowerCase())
  )

  const applySlashCommand = (cmd: SlashCommand) => {
    const textarea = textareaRef.current
    if (!textarea) return

    const cursor = textarea.selectionStart
    const textBefore = content.slice(0, cursor)
    const textAfter = content.slice(cursor)
    const lastSlash = textBefore.lastIndexOf('/')

    if (lastSlash !== -1) {
      const beforeSlash = textBefore.slice(0, lastSlash)
      const newText = beforeSlash + cmd.snippet + textAfter
      setContent(newText)
      onUpdateNote({ ...note, content: newText, updatedAt: Date.now() })
      setShowSlashMenu(false)

      setTimeout(() => {
        textarea.focus()
        const newCursor = beforeSlash.length + cmd.snippet.length
        textarea.setSelectionRange(newCursor, newCursor)
      }, 50)
    }
  }

  // Formatting shortcuts
  const insertFormatting = (prefix: string, suffix: string = '') => {
    const textarea = textareaRef.current
    if (!textarea) return
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const selected = content.slice(start, end)
    const replacement = `${prefix}${selected}${suffix}`
    const newContent = content.slice(0, start) + replacement + content.slice(end)

    setContent(newContent)
    onUpdateNote({ ...note, content: newContent, updatedAt: Date.now() })

    setTimeout(() => {
      textarea.focus()
      textarea.setSelectionRange(start + prefix.length, end + prefix.length)
    }, 50)
  }

  const handleToggleTask = (taskIndex: number, completed: boolean) => {
    const lines = content.split('\n')
    let currentTask = 0
    const newLines = lines.map(line => {
      const match = line.match(/^(\s*-\s\[)([ xX])(\]\s.*)$/)
      if (match) {
        if (currentTask === taskIndex) {
          currentTask++
          return `${match[1]}${completed ? 'x' : ' '}${match[3]}`
        }
        currentTask++
      }
      return line
    })
    const newContent = newLines.join('\n')
    setContent(newContent)
    onUpdateNote({ ...note, content: newContent, updatedAt: Date.now() })
  }

  // Words & reading stats
  const words = content.trim() ? content.trim().split(/\s+/).length : 0
  const readingTime = Math.max(1, Math.ceil(words / 200))

  const filteredLinkSuggestions = allNotes
    .filter(n => n.id !== note.id && n.title.toLowerCase().includes(suggestQuery.toLowerCase()))
    .slice(0, 5)

  return (
    <div className="flex flex-col h-full bg-zinc-950 overflow-hidden">
      {/* 1. Obsidian-Style Tabs Bar */}
      <div className="h-9 bg-zinc-950 border-b border-zinc-800 flex items-center px-2 gap-1 overflow-x-auto select-none shrink-0 scrollbar-none">
        {tabs.map(tab => {
          const isActive = tab.id === activeTabId
          return (
            <div
              key={tab.id}
              onClick={() => onSelectTab(tab.id)}
              className={`group flex items-center gap-2 h-7 px-3 rounded-t-md text-xs cursor-pointer border-t border-x transition-all max-w-[200px] ${
                isActive
                  ? 'bg-zinc-900 border-zinc-700/80 text-violet-300 font-medium shadow-sm'
                  : 'bg-zinc-950 border-transparent text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/40'
              }`}
            >
              <FileText className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-violet-400' : 'text-zinc-600'}`} />
              <span className="truncate">{tab.title}</span>
              {tabs.length > 1 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onCloseTab(tab.id)
                  }}
                  className="p-0.5 rounded-full hover:bg-zinc-800 text-zinc-500 hover:text-zinc-200 opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Fechar aba"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          )
        })}

        <button
          onClick={onNewTab}
          className="p-1 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900 rounded transition-colors ml-1"
          title="Nova nota em aba"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* 2. Top Editor Action Toolbar */}
      <div className="flex items-center justify-between px-6 py-2 bg-zinc-900/60 border-b border-zinc-800 text-xs text-zinc-400 shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-zinc-300 font-medium">
            <Folder className="w-3.5 h-3.5 text-violet-400" />
            <span>{note.folder}</span>
          </div>
          <span className="text-zinc-700">/</span>
          <div className="flex items-center gap-1.5 text-zinc-400 truncate max-w-xs">
            <span className="truncate">{title || 'Sem título'}</span>
          </div>
        </div>

        {/* Action icons & display mode toggle */}
        <div className="flex items-center gap-2">
          {/* Quick formatting toolbar */}
          <div className="flex items-center gap-1 bg-zinc-800/80 rounded-lg p-0.5 border border-zinc-700/60 mr-2 shadow-inner">
            <button onClick={() => insertFormatting('# ')} className="p-1 hover:text-zinc-100 hover:bg-zinc-700 rounded transition-colors" title="Título H1">
              <Heading1 className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => insertFormatting('## ')} className="p-1 hover:text-zinc-100 hover:bg-zinc-700 rounded transition-colors" title="Título H2">
              <Heading2 className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => insertFormatting('**', '**')} className="p-1 hover:text-zinc-100 hover:bg-zinc-700 rounded transition-colors" title="Negrito">
              <Bold className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => insertFormatting('*', '*')} className="p-1 hover:text-zinc-100 hover:bg-zinc-700 rounded transition-colors" title="Itálico">
              <Italic className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => insertFormatting('[[', ']]')} className="p-1 hover:text-violet-400 hover:bg-zinc-700 rounded transition-colors" title="Link Bidirecional [[...]]">
              <Link2 className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => insertFormatting('- [ ] ')} className="p-1 hover:text-zinc-100 hover:bg-zinc-700 rounded transition-colors" title="Lista de Tarefas">
              <ListTodo className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => insertFormatting('```ts\n', '\n```')} className="p-1 hover:text-zinc-100 hover:bg-zinc-700 rounded transition-colors" title="Bloco de Código">
              <Code className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* View mode toggle */}
          <div className="flex items-center gap-0.5 bg-zinc-800 rounded-lg p-0.5 border border-zinc-700">
            <button
              onClick={() => onChangeDisplayMode('edit')}
              className={`p-1.5 rounded transition-colors ${
                displayMode === 'edit' ? 'bg-violet-600 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
              }`}
              title="Modo Código Puro"
            >
              <Edit3 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onChangeDisplayMode('split')}
              className={`p-1.5 rounded transition-colors ${
                displayMode === 'split' ? 'bg-violet-600 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
              }`}
              title="Modo Dividido (Live Preview)"
            >
              <Columns2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onChangeDisplayMode('preview')}
              className={`p-1.5 rounded transition-colors ${
                displayMode === 'preview' ? 'bg-violet-600 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
              }`}
              title="Modo Leitura"
            >
              <Eye className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* 3. Editor Main Body */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Side: Markdown Source Editor */}
        {(displayMode === 'edit' || displayMode === 'split') && (
          <div className={`flex flex-col h-full ${displayMode === 'split' ? 'w-1/2 border-r border-zinc-800' : 'w-full'} overflow-hidden relative`}>
            {/* Note Title Input */}
            <div className="px-8 pt-6 pb-2">
              <input
                type="text"
                value={title}
                onChange={(e) => handleTitleChange(e.target.value)}
                placeholder="Título da Nota..."
                className="w-full text-2xl font-bold bg-transparent text-zinc-100 placeholder-zinc-700 focus:outline-none tracking-tight"
              />
            </div>

            {/* Note Textarea with syntax aids */}
            <div className="flex-1 relative px-8 pb-8 overflow-y-auto">
              <textarea
                ref={textareaRef}
                value={content}
                onChange={(e) => handleContentChange(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Escreva livremente... Use [[ para linkar notas ou digite / para comandos rápidos..."
                className="w-full h-full bg-transparent text-xs font-mono text-zinc-200 placeholder-zinc-700 resize-none focus:outline-none leading-relaxed selectable-text"
              />

              {/* Slash Command (/) Popup Menu */}
              {showSlashMenu && filteredSlashCommands.length > 0 && (
                <div className="absolute z-40 bottom-16 left-10 w-72 bg-zinc-900 border border-violet-500/60 rounded-xl shadow-2xl p-1.5 overflow-hidden backdrop-blur-md">
                  <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-violet-400 border-b border-zinc-800 flex items-center justify-between">
                    <span>Comandos Rápidos</span>
                    <span className="text-zinc-500 font-mono">↵ Inserir</span>
                  </div>
                  <div className="max-h-56 overflow-y-auto space-y-0.5 pt-1">
                    {filteredSlashCommands.map((cmd, idx) => {
                      const isSelected = idx === slashIndex
                      return (
                        <div
                          key={cmd.id}
                          onClick={() => applySlashCommand(cmd)}
                          onMouseEnter={() => setSlashIndex(idx)}
                          className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors ${
                            isSelected ? 'bg-violet-600/30 text-violet-200 border border-violet-500/30' : 'text-zinc-300 hover:bg-zinc-800/60'
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

              {/* [[ Wikilink Autocomplete Suggestion Popup */}
              {showLinkSuggest && filteredLinkSuggestions.length > 0 && (
                <div className="absolute z-40 bottom-16 left-12 w-64 bg-zinc-900 border border-violet-500/60 rounded-xl shadow-2xl p-1.5 overflow-hidden backdrop-blur-md">
                  <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-violet-400 border-b border-zinc-800 flex items-center justify-between">
                    <span>Conectar com Nota</span>
                    <span className="text-zinc-500 font-mono">[[...]]</span>
                  </div>
                  <div className="space-y-0.5 pt-1">
                    {filteredLinkSuggestions.map(s => (
                      <button
                        key={s.id}
                        onClick={() => insertLinkSuggestion(s.title)}
                        className="w-full text-left px-2 py-1.5 hover:bg-violet-900/40 rounded-lg text-xs text-zinc-200 flex items-center justify-between transition-colors"
                      >
                        <span className="truncate">{s.title}</span>
                        <span className="text-[10px] text-zinc-500 font-mono">{s.folder}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Right Side: Live Markdown Preview */}
        {(displayMode === 'preview' || displayMode === 'split') && (
          <div className={`h-full overflow-y-auto px-8 py-6 ${displayMode === 'split' ? 'w-1/2 bg-zinc-950/40' : 'w-full max-w-4xl mx-auto'}`}>
            <MarkdownRenderer
              content={content}
              onNavigate={onNavigate}
              onToggleTask={handleToggleTask}
            />
          </div>
        )}
      </div>

      {/* 4. Bottom Footer Info Bar */}
      <div className="flex items-center justify-between px-6 py-1.5 bg-zinc-900/50 border-t border-zinc-800/80 text-[11px] text-zinc-500 shrink-0">
        <div className="flex items-center gap-4">
          <span>{words} palavras</span>
          <span>•</span>
          <span>{content.length} caracteres</span>
          <span>•</span>
          <div className="flex items-center gap-1">
            <Clock className="w-3 h-3 text-zinc-600" />
            <span>{readingTime} min de leitura</span>
          </div>
        </div>

        {note.tags.length > 0 && (
          <div className="flex items-center gap-1.5">
            <Tag className="w-3 h-3 text-violet-400" />
            {note.tags.map(t => (
              <span key={t} className="text-zinc-400">#{t}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
