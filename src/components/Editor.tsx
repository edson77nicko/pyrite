import React, { useState, useRef, useEffect } from 'react'
import type { Note, EditorDisplayMode, TabItem, AppSettings } from '../types'
import { LivePreviewEditor, type LivePreviewEditorHandle } from './LivePreviewEditor'
import {
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
  Folder,
  Plus,
  X,
  Sliders
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
  onOpenSettings: () => void
  settings: AppSettings
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
  onNavigate,
  onOpenSettings,
  settings
}) => {
  const [content, setContent] = useState(note.content)
  const [title, setTitle] = useState(note.title)
  const liveEditorRef = useRef<LivePreviewEditorHandle>(null)

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
    <div className="flex flex-col h-full bg-[#121215] overflow-hidden">
      {/* 1. Obsidian Tabs Bar */}
      <div className="h-9 bg-[#0c0c0e] border-b border-zinc-800 flex items-center px-2 gap-1 overflow-x-auto select-none shrink-0 scrollbar-none">
        {tabs.map(tab => {
          const isActive = tab.id === activeTabId
          return (
            <div
              key={tab.id}
              onClick={() => onSelectTab(tab.id)}
              className={`group flex items-center gap-2 h-7 px-3 rounded-t-lg text-xs cursor-pointer border-t border-x transition-all max-w-[200px] ${
                isActive
                  ? 'bg-[#121215] border-zinc-700/80 text-violet-300 font-medium shadow-sm'
                  : 'bg-transparent border-transparent text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/40'
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
          className="p-1 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900 rounded-lg transition-colors ml-1"
          title="Nova nota em aba"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* 2. Top Editor Action Toolbar (Icon-only mode switcher and formatting tools) */}
      <div className="flex items-center justify-between px-6 py-2 bg-zinc-900/60 border-b border-zinc-800/80 text-xs text-zinc-400 shrink-0">
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

        {/* Action icons & Live vs Reading Mode toggle */}
        <div className="flex items-center gap-2">
          {/* Quick formatting toolbar */}
          {displayMode === 'live' && (
            <div className="flex items-center gap-1 bg-zinc-800/80 rounded-lg p-0.5 border border-zinc-700/60 mr-2 shadow-inner">
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
              <button onClick={handleFormatLink} className="p-1.5 hover:text-violet-400 hover:bg-zinc-700 rounded transition-colors" title="Link Bidirecional [[...]]">
                <Link2 className="w-3.5 h-3.5" />
              </button>
              <button onClick={handleFormatTask} className="p-1.5 hover:text-zinc-100 hover:bg-zinc-700 rounded transition-colors" title="Lista de Tarefas">
                <ListTodo className="w-3.5 h-3.5" />
              </button>
              <button onClick={handleFormatCode} className="p-1.5 hover:text-zinc-100 hover:bg-zinc-700 rounded transition-colors" title="Bloco de Código">
                <Code className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Mode Switcher: APENAS ÍCONES (Edição ao Vivo vs Modo Leitura) */}
          <div className="flex items-center gap-0.5 bg-zinc-800 rounded-lg p-0.5 border border-zinc-700 shadow-sm">
            <button
              onClick={() => onChangeDisplayMode('live')}
              className={`p-1.5 rounded-md transition-all ${
                displayMode === 'live' ? 'bg-violet-600 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
              }`}
              title="Edição ao Vivo (Edite formatado diretamente como no Obsidian)"
            >
              <Edit3 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onChangeDisplayMode('reading')}
              className={`p-1.5 rounded-md transition-all ${
                displayMode === 'reading' ? 'bg-violet-600 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
              }`}
              title="Modo Leitura (Visualização pura)"
            >
              <Eye className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Personalizar Button */}
          <button
            onClick={onOpenSettings}
            className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition-colors ml-1 border border-zinc-800"
            title="Personalizar Tipografia e Aparência"
          >
            <Sliders className="w-3.5 h-3.5 text-violet-400" />
          </button>
        </div>
      </div>

      {/* 3. Editor Surface (In-place WYSIWYG Live Preview matching Obsidian screenshot) */}
      <div className="flex-1 overflow-y-auto px-6 py-6 flex justify-center">
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
