import React, { useState, useRef, useEffect, useCallback } from 'react'
import type { Note, EditorDisplayMode, AppSettings, ContextRole } from '../types'
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
  PanelRight,
  Users,
  MessageSquare
} from 'lucide-react'
import { NoteCommentsModal } from './NoteCommentsModal'
import { getNoteComments } from '../utils/commentsStorage'
import type { NoteComment } from '../types/comments'

interface EditorProps {
  note: Note
  allNotes: Note[]
  displayMode: EditorDisplayMode
  onUpdateNote: (updated: Note) => void
  onNavigate: (title: string) => void
  settings: AppSettings
  isRightSidebarOpen?: boolean
  onToggleRightSidebar?: () => void
  onUseNoteWithAgent?: (noteId: string, role: ContextRole) => void
}

export const Editor: React.FC<EditorProps> = ({
  note,
  allNotes,
  displayMode,
  onUpdateNote,
  onNavigate,
  settings,
  isRightSidebarOpen = false,
  onToggleRightSidebar,
  onUseNoteWithAgent
}) => {
  const [content, setContent] = useState(note.content)
  const [title, setTitle] = useState(note.title)
  const isTitleFocusedRef = useRef(false)
  const previousNoteIdRef = useRef(note.id)
  const [isAgentRoleMenuOpen, setIsAgentRoleMenuOpen] = useState(false)
  const [isCommentsModalOpen, setIsCommentsModalOpen] = useState(false)
  const [openCommentsCount, setOpenCommentsCount] = useState<number>(() => {
    return getNoteComments(note.id).filter(c => !c.resolved).length
  })

  // Keep open comments count updated
  useEffect(() => {
    const updateCount = () => {
      setOpenCommentsCount(getNoteComments(note.id).filter(c => !c.resolved).length)
    }
    updateCount()
    const handleUpdate = (e: any) => {
      if (!e.detail?.noteId || e.detail.noteId === note.id) {
        updateCount()
      }
    }
    window.addEventListener('pyrite_comments_updated', handleUpdate)
    return () => window.removeEventListener('pyrite_comments_updated', handleUpdate)
  }, [note.id])

  const handleSelectComment = (comment: NoteComment) => {
    liveEditorRef.current?.scrollToBlock?.(comment.blockIndex, comment.blockSnippet)
  }
  const liveEditorRef = useRef<LivePreviewEditorHandle>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const pendingContentRef = useRef<string | null>(null)
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const noteRef = useRef(note)
  noteRef.current = note

  const flushPendingContent = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
      debounceTimerRef.current = null
    }
    if (pendingContentRef.current !== null && pendingContentRef.current !== noteRef.current.content) {
      const updated = pendingContentRef.current
      pendingContentRef.current = null
      onUpdateNote({ ...noteRef.current, content: updated, updatedAt: Date.now() })
    }
  }, [onUpdateNote])

  // Keep internal state in sync when note changes
  useEffect(() => {
    if (previousNoteIdRef.current !== note.id) {
      flushPendingContent()
      previousNoteIdRef.current = note.id
      isTitleFocusedRef.current = false
      setContent(note.content)
      setTitle(note.title)
    } else {
      if (pendingContentRef.current === null && note.content !== content) {
        setContent(note.content)
      }
      if (!isTitleFocusedRef.current && note.title !== title) {
        setTitle(note.title)
      }
    }
  }, [note.id, note.content, note.title, flushPendingContent, content, title])

  // Flush on unmount
  useEffect(() => {
    return () => {
      flushPendingContent()
    }
  }, [flushPendingContent])

  const commitTitleChange = (candidateTitle?: string) => {
    const raw = candidateTitle !== undefined ? candidateTitle : title
    const trimmed = raw.trim()
    if (!trimmed || trimmed === note.title) {
      setTitle(note.title)
      return
    }
    setTitle(trimmed)
    onUpdateNote({ ...note, title: trimmed, updatedAt: Date.now() })
  }

  const handleTitleChange = (newTitle: string) => {
    // Only update local state while typing. Never trim or commit mid-typing so spaces are fully preserved!
    setTitle(newTitle)
  }

  // Handle typing inside editor with local responsiveness and debounced persistence
  const handleContentChange = useCallback((newContent: string) => {
    setContent(newContent)
    pendingContentRef.current = newContent
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
    debounceTimerRef.current = setTimeout(() => {
      flushPendingContent()
    }, 800)
  }, [flushPendingContent])

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
    small: 'text-xs font-size-small leading-relaxed',
    medium: 'text-sm font-size-medium leading-relaxed',
    large: 'text-base font-size-large leading-relaxed'
  }[settings.fontSize]

  return (
    <div className="app-editor-pane flex flex-col h-full bg-[#121215] overflow-hidden relative">
      {/* Top Editor Toolbar (Breadcrumb + In-editor formatting tools) */}
      <div className="app-editor-toolbar relative z-30 flex items-center justify-between px-6 py-2 bg-[#121215] border-b border-zinc-800/60 text-xs text-zinc-400 shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-zinc-300 font-medium">
            <Folder className="w-3.5 h-3.5 shrink-0 editor-folder-icon" style={{ color: 'var(--accent)' }} />
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

          {/* Action: "Usar com um agente" (Seção 3) */}
          {onUseNoteWithAgent && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsAgentRoleMenuOpen(v => !v)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-zinc-700/70 bg-zinc-900/60 hover:border-[#c59b27]/60 text-zinc-300 hover:text-white transition-all cursor-pointer text-[11px] font-medium"
                title="Definir o papel desta nota e usá-la com um agente da equipe"
              >
                <Users className="w-3.5 h-3.5 text-[#c59b27]" />
                <span>Usar com um agente</span>
              </button>

              {isAgentRoleMenuOpen && (
                <div className="absolute right-0 mt-1.5 w-64 bg-[#14141b] border border-zinc-700/80 rounded-xl shadow-2xl p-1.5 z-40 text-xs space-y-1">
                  <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                    Escolha o papel desta nota:
                  </div>
                  {[
                    { role: 'template' as ContextRole, label: 'Modelo a seguir', desc: 'Preservar estrutura e criar novo doc' },
                    { role: 'permanent_ref' as ContextRole, label: 'Referência permanente', desc: 'Catálogo, regras e preços fixos' },
                    { role: 'project_context' as ContextRole, label: 'Contexto do cliente/projeto', desc: 'Briefing e escopo deste cliente' },
                    { role: 'request_context' as ContextRole, label: 'Contexto deste pedido', desc: 'Anexar apenas nesta execução' }
                  ].map(opt => (
                    <button
                      key={opt.role}
                      type="button"
                      onClick={() => {
                        setIsAgentRoleMenuOpen(false)
                        onUseNoteWithAgent(note.id, opt.role)
                      }}
                      className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-zinc-800 transition-colors cursor-pointer"
                    >
                      <div className="font-semibold text-zinc-100">{opt.label}</div>
                      <div className="text-[10px] text-zinc-400">{opt.desc}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Note Comments Toggle Button */}
          <button
            type="button"
            onClick={() => setIsCommentsModalOpen(v => !v)}
            className={`relative p-1.5 rounded-lg border transition-all cursor-pointer ${
              isCommentsModalOpen
                ? 'border-zinc-700 bg-zinc-800 text-white shadow-sm'
                : 'border-zinc-800/80 bg-zinc-900/40 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
            }`}
            style={isCommentsModalOpen || openCommentsCount > 0 ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : undefined}
            title={`Comentários da nota (${openCommentsCount} abertos)`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            {openCommentsCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] px-0.5 rounded-full bg-[var(--accent)] text-[9px] font-bold text-white flex items-center justify-center shadow-xs">
                {openCommentsCount}
              </span>
            )}
          </button>

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
                onFocus={() => { isTitleFocusedRef.current = true }}
                onBlur={() => {
                  isTitleFocusedRef.current = false
                  commitTitleChange(title)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    isTitleFocusedRef.current = false
                    commitTitleChange(title)
                    liveEditorRef.current?.focus?.()
                  }
                }}
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
      <div className="app-editor-footer flex items-center justify-between px-6 py-1.5 bg-[#0c0c0e] border-t border-zinc-800/80 text-[11px] text-zinc-500 shrink-0">
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

      {/* Note Comments Modal (Abertos, Resolvidos, Todos) */}
      <NoteCommentsModal
        noteId={note.id}
        isOpen={isCommentsModalOpen}
        onClose={() => setIsCommentsModalOpen(false)}
        onSelectComment={handleSelectComment}
      />
    </div>
  )
}
