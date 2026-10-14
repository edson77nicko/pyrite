import React, { useState, useRef, useEffect } from 'react'
import type { Note, EditorDisplayMode } from '../types'
import { MarkdownRenderer } from './MarkdownRenderer'
import {
  Columns2,
  Eye,
  Edit3,
  Heading1,
  Heading2,
  Bold,
  Italic,
  ListTodo,
  Code,
  Link2,
  Clock,
  FileText,
  Tag,
  Folder
} from 'lucide-react'

interface EditorProps {
  note: Note
  allNotes: Note[]
  displayMode: EditorDisplayMode
  onChangeDisplayMode: (mode: EditorDisplayMode) => void
  onUpdateNote: (updated: Note) => void
  onNavigate: (title: string) => void
}

export const Editor: React.FC<EditorProps> = ({
  note,
  allNotes,
  displayMode,
  onChangeDisplayMode,
  onUpdateNote,
  onNavigate
}) => {
  const [content, setContent] = useState(note.content)
  const [title, setTitle] = useState(note.title)
  const [showLinkSuggest, setShowLinkSuggest] = useState(false)
  const [suggestQuery, setSuggestQuery] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  // Keep internal state in sync when selecting different notes
  useEffect(() => {
    setContent(note.content)
    setTitle(note.title)
  }, [note.id])

  const handleTitleChange = (newTitle: string) => {
    setTitle(newTitle)
    onUpdateNote({ ...note, title: newTitle, updatedAt: Date.now() })
  }

  const handleContentChange = (newContent: string) => {
    setContent(newContent)
    onUpdateNote({ ...note, content: newContent, updatedAt: Date.now() })

    // Check for [[ autocomplete trigger
    const textarea = textareaRef.current
    if (textarea) {
      const cursor = textarea.selectionStart
      const textBefore = newContent.slice(0, cursor)
      const lastDoubleBracket = textBefore.lastIndexOf('[[')

      if (lastDoubleBracket !== -1 && lastDoubleBracket > textBefore.lastIndexOf(']]')) {
        const query = textBefore.slice(lastDoubleBracket + 2)
        if (!query.includes('\n') && query.length < 30) {
          setSuggestQuery(query)
          setShowLinkSuggest(true)
          return
        }
      }
    }
    setShowLinkSuggest(false)
  }

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

  // Insert markdown helpers
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

  // Word & reading stats
  const words = content.trim() ? content.trim().split(/\s+/).length : 0
  const readingTime = Math.max(1, Math.ceil(words / 200))

  const filteredSuggestions = allNotes
    .filter(n => n.id !== note.id && n.title.toLowerCase().includes(suggestQuery.toLowerCase()))
    .slice(0, 5)

  return (
    <div className="flex flex-col h-full bg-zinc-950 overflow-hidden">
      {/* Top Editor Toolbar */}
      <div className="flex items-center justify-between px-6 py-2 bg-zinc-900/60 border-b border-zinc-800 text-xs text-zinc-400">
        {/* Breadcrumb info */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-zinc-300 font-medium">
            <Folder className="w-3.5 h-3.5 text-violet-400" />
            <span>{note.folder}</span>
          </div>
          <span>/</span>
          <div className="flex items-center gap-1.5 text-zinc-400">
            <FileText className="w-3.5 h-3.5 text-zinc-500" />
            <span>{title || 'Sem título'}</span>
          </div>
        </div>

        {/* Action icons & display mode toggle */}
        <div className="flex items-center gap-2">
          {/* Quick formatting buttons */}
          <div className="flex items-center gap-1 bg-zinc-800/80 rounded p-0.5 border border-zinc-700/60 mr-2">
            <button
              onClick={() => insertFormatting('# ')}
              className="p-1 hover:text-zinc-100 hover:bg-zinc-700 rounded transition-colors"
              title="Título H1"
            >
              <Heading1 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => insertFormatting('## ')}
              className="p-1 hover:text-zinc-100 hover:bg-zinc-700 rounded transition-colors"
              title="Título H2"
            >
              <Heading2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => insertFormatting('**', '**')}
              className="p-1 hover:text-zinc-100 hover:bg-zinc-700 rounded transition-colors"
              title="Negrito"
            >
              <Bold className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => insertFormatting('*', '*')}
              className="p-1 hover:text-zinc-100 hover:bg-zinc-700 rounded transition-colors"
              title="Itálico"
            >
              <Italic className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => insertFormatting('[[', ']]')}
              className="p-1 hover:text-violet-400 hover:bg-zinc-700 rounded transition-colors"
              title="Link Bidirecional [[...]]"
            >
              <Link2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => insertFormatting('- [ ] ')}
              className="p-1 hover:text-zinc-100 hover:bg-zinc-700 rounded transition-colors"
              title="Lista de Tarefas"
            >
              <ListTodo className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => insertFormatting('```ts\n', '\n```')}
              className="p-1 hover:text-zinc-100 hover:bg-zinc-700 rounded transition-colors"
              title="Bloco de Código"
            >
              <Code className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* View mode toggle */}
          <div className="flex items-center gap-0.5 bg-zinc-800 rounded p-0.5 border border-zinc-700">
            <button
              onClick={() => onChangeDisplayMode('edit')}
              className={`p-1.5 rounded transition-colors ${
                displayMode === 'edit' ? 'bg-violet-600 text-white' : 'text-zinc-400 hover:text-zinc-200'
              }`}
              title="Modo Código"
            >
              <Edit3 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onChangeDisplayMode('split')}
              className={`p-1.5 rounded transition-colors ${
                displayMode === 'split' ? 'bg-violet-600 text-white' : 'text-zinc-400 hover:text-zinc-200'
              }`}
              title="Modo Dividido (Live Preview)"
            >
              <Columns2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onChangeDisplayMode('preview')}
              className={`p-1.5 rounded transition-colors ${
                displayMode === 'preview' ? 'bg-violet-600 text-white' : 'text-zinc-400 hover:text-zinc-200'
              }`}
              title="Modo Leitura"
            >
              <Eye className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Editor Body */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Side: Markdown Source */}
        {(displayMode === 'edit' || displayMode === 'split') && (
          <div className={`flex flex-col h-full ${displayMode === 'split' ? 'w-1/2 border-r border-zinc-800' : 'w-full'} overflow-hidden`}>
            {/* Note Title Input */}
            <div className="px-8 pt-6 pb-2">
              <input
                type="text"
                value={title}
                onChange={(e) => handleTitleChange(e.target.value)}
                placeholder="Título da Nota..."
                className="w-full text-2xl font-bold bg-transparent text-zinc-100 placeholder-zinc-600 focus:outline-none"
              />
            </div>

            {/* Note Textarea */}
            <div className="flex-1 relative px-8 pb-8 overflow-y-auto">
              <textarea
                ref={textareaRef}
                value={content}
                onChange={(e) => handleContentChange(e.target.value)}
                placeholder="Comece a escrever ou use [[ para linkar notas..."
                className="w-full h-full bg-transparent text-sm font-mono text-zinc-200 placeholder-zinc-600 resize-none focus:outline-none leading-relaxed selectable-text"
              />

              {/* [[ Wikilink Autocomplete Suggestion Popup */}
              {showLinkSuggest && filteredSuggestions.length > 0 && (
                <div className="absolute z-30 bottom-16 left-12 w-64 bg-zinc-900 border border-violet-500/50 rounded-lg shadow-2xl p-1 overflow-hidden">
                  <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-violet-400 border-b border-zinc-800">
                    Conectar com nota
                  </div>
                  {filteredSuggestions.map(s => (
                    <button
                      key={s.id}
                      onClick={() => insertLinkSuggestion(s.title)}
                      className="w-full text-left px-2 py-1.5 hover:bg-violet-900/40 rounded text-xs text-zinc-200 flex items-center justify-between transition-colors"
                    >
                      <span className="truncate">{s.title}</span>
                      <span className="text-[10px] text-zinc-500 font-mono">[[...]]</span>
                    </button>
                  ))}
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

      {/* Footer Info Bar */}
      <div className="flex items-center justify-between px-6 py-1.5 bg-zinc-900/40 border-t border-zinc-800/80 text-[11px] text-zinc-500">
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
