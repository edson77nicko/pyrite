import React, { useState, useRef, useEffect } from 'react'
import type { Note, EditorDisplayMode, AppSettings } from '../types'
import { LivePreviewEditor, type LivePreviewEditorHandle } from './LivePreviewEditor'
import { DocumentOutlineRail } from './DocumentOutlineRail'
import {
  Heading1,
  Heading2,
  Bold,
  Italic,
  ListTodo,
  Code,
  Link2,
  Clock,
  Tag,
  Folder,
  Table,
  PanelRight
} from 'lucide-react'

interface EditorProps {
  note: Note
  allNotes: Note[]
  displayMode: EditorDisplayMode
  onUpdateNote: (updated: Note) => void
  onNavigate: (title: string) => void
  settings: AppSettings
  isRightSidebarOpen?: boolean
  onToggleRightSidebar?: () => void
}

export const Editor: React.FC<EditorProps> = ({
  note,
  allNotes,
  displayMode,
  onUpdateNote,
  onNavigate,
  settings,
  isRightSidebarOpen = false,
  onToggleRightSidebar
}) => {
  const [content, setContent] = useState(note.content)
  const [title, setTitle] = useState(note.title)
  const liveEditorRef = useRef<LivePreviewEditorHandle>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  // Keep internal state in sync when note changes
  useEffect(() => {
    setContent(note.content)
    setTitle(note.title)
  }, [note.id, note.content, note.title])

  const handleTitleChange = (newTitle: string) => {
    setTitle(newTitle)
    onUpdateNote({ ...note, title: newTitle, updatedAt: Date.now() })
  }

  // Handle typing inside editor
  const handleContentChange = (newContent: string) => {
    setContent(newContent)
    onUpdateNote({ ...note, content: newContent, updatedAt: Date.now() })
  }

  // Quick formatting toolbar buttons wired to LivePreviewEditor
  const handleFormatH1 = () => liveEditorRef.current?.setBlockType('h1')
  const handleFormatH2 = () => liveEditorRef.current?.setBlockType('h2')
  const handleFormatBold = () => liveEditorRef.current?.toggleBold()
  const handleFormatItalic = () => liveEditorRef.current?.toggleItalic()
  const handleFormatTask = () => liveEditorRef.current?.setBlockType('task')
  const handleFormatCode = () => liveEditorRef.current?.insertCodeBlock()
  const handleFormatTable = () => liveEditorRef.current?.insertTable()
  const handleFormatLink = () => {
    const target = prompt('Nome da nota para linkar:')
    if (target) liveEditorRef.current?.insertWikiLink(target)
  }

  // Words & reading stats
  const words = content.trim() ? content.trim().split(/\s+/).length : 0
  const readingTime = Math.max(1, Math.ceil(words / 200))

  // Typography & Width styles based on settings
  const widthClasses = {
    compact: 'max-w-2xl',
    standard: 'max-w-3xl',
    wide: 'max-w-5xl'
  }[settings.editorWidth]

  const fontClasses = {
    small: 'text-xs leading-relaxed',
    medium: 'text-sm leading-relaxed',
    large: 'text-base leading-relaxed'
  }[settings.fontSize]

  return (
    <div className="flex flex-col h-full bg-[#121215] overflow-hidden relative">
      {/* Top Editor Toolbar (Breadcrumb + In-editor formatting tools) */}
      <div className="flex items-center justify-between px-6 py-2 bg-zinc-900/40 border-b border-zinc-800/60 text-xs text-zinc-400 shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-zinc-300 font-medium">
            <Folder className="w-3.5 h-3.5 text-amber-400" />
            <span>{note.folder}</span>
          </div>
          <span className="text-zinc-700">/</span>
          <div className="flex items-center gap-1.5 text-zinc-400 truncate max-w-xs">
            <span className="truncate">{title || 'Sem título'}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Quick formatting toolbar */}
          {displayMode === 'live' && (
            <div className="flex items-center gap-1 bg-zinc-800/80 rounded-lg p-0.5 border border-zinc-700/60 shadow-inner">
              <button onClick={handleFormatH1} className="p-1.5 hover:text-zinc-100 hover:bg-zinc-700 rounded transition-colors" title="Título H1">
                <Heading1 className="w-3.5 h-3.5" />
              </button>
              <button onClick={handleFormatH2} className="p-1.5 hover:text-zinc-100 hover:bg-zinc-700 rounded transition-colors" title="Título H2">
                <Heading2 className="w-3.5 h-3.5" />
              </button>
              <button onClick={handleFormatBold} className="p-1.5 hover:text-zinc-100 hover:bg-zinc-700 rounded transition-colors" title="Negrito">
                <Bold className="w-3.5 h-3.5" />
              </button>
              <button onClick={handleFormatItalic} className="p-1.5 hover:text-zinc-100 hover:bg-zinc-700 rounded transition-colors" title="Itálico">
                <Italic className="w-3.5 h-3.5" />
              </button>
              <button onClick={handleFormatLink} className="p-1.5 hover:text-zinc-100 hover:bg-zinc-700 rounded transition-colors" title="Link Bidirecional [[...]]">
                <Link2 className="w-3.5 h-3.5" />
              </button>
              <button onClick={handleFormatTask} className="p-1.5 hover:text-zinc-100 hover:bg-zinc-700 rounded transition-colors" title="Lista de Tarefas">
                <ListTodo className="w-3.5 h-3.5" />
              </button>
              <button onMouseDown={event => event.preventDefault()} onClick={handleFormatTable} className="p-1.5 hover:text-zinc-100 hover:bg-zinc-700 rounded transition-colors" title="Inserir tabela">
                <Table className="w-3.5 h-3.5" />
              </button>
              <button onClick={handleFormatCode} className="p-1.5 hover:text-zinc-100 hover:bg-zinc-700 rounded transition-colors" title="Bloco de Código">
                <Code className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Right Sidebar Toggle (Sumário, Links, Backlinks) */}
          {onToggleRightSidebar && (
            <button
              type="button"
              onClick={onToggleRightSidebar}
              className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                isRightSidebarOpen
                  ? 'border-zinc-700 bg-zinc-800 text-white shadow-sm'
                  : 'border-zinc-800/80 bg-zinc-900/40 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
              }`}
              style={isRightSidebarOpen ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : undefined}
              title="Alternar Painel Lateral Direito (Sumário e Conexões)"
            >
              <PanelRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* 3. Editor Surface (In-place WYSIWYG Live Preview matching Obsidian screenshot) */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-6 py-6 flex justify-center custom-chat-scrollbar">
        <div className={`w-full ${widthClasses} flex flex-col`}>
          {/* Note Title Input */}
          <div className="pb-4 mb-2 border-b border-zinc-800/60">
            {displayMode === 'live' ? (
              <input
                type="text"
                value={title}
                onChange={(e) => handleTitleChange(e.target.value)}
                placeholder="Título da Nota..."
                className="w-full text-3xl font-serif font-bold bg-transparent text-zinc-100 placeholder-zinc-700 focus:outline-none tracking-tight"
              />
            ) : (
              <h1 className="text-3xl font-serif font-bold text-zinc-100 tracking-tight">
                {title || 'Sem título'}
              </h1>
            )}
          </div>

          {/* In-place WYSIWYG Content Area */}
          <div className="flex-1 relative">
            <LivePreviewEditor
              editorRef={liveEditorRef}
              note={note}
              allNotes={allNotes}
              displayMode={displayMode}
              onUpdateContent={handleContentChange}
              onNavigate={onNavigate}
              fontSizeClass={fontClasses}
            />
          </div>
        </div>
      </div>

      {/* In-page Minimap / Floating Outline Scroller (Dashboard Heading Rail) */}
      <DocumentOutlineRail
        content={content}
        noteTitle={title}
        scrollContainerRef={scrollContainerRef}
      />

      {/* 4. Bottom Footer Info Bar */}
      <div className="flex items-center justify-between px-6 py-1.5 bg-[#0c0c0e] border-t border-zinc-800/80 text-[11px] text-zinc-500 shrink-0">
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
            <Tag className="w-3 h-3 text-amber-400" />
            {note.tags.map(t => (
              <span key={t} className="text-zinc-400">#{t}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
