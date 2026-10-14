import React, { useState } from 'react'
import type { Note } from '../types'
import {
  Folder,
  FolderOpen,
  FileText,
  Plus,
  Search,
  FolderPlus,
  Trash2,
  HardDrive,
  ChevronRight,
  ChevronDown
} from 'lucide-react'

interface SidebarProps {
  notes: Note[]
  folders: string[]
  currentNoteId?: string
  onSelectNote: (noteId: string) => void
  onCreateNote: (folder?: string) => void
  onCreateFolder: (name: string) => void
  onDeleteNote: (noteId: string) => void
  onOpenLocalFolder: () => void
  isOpen: boolean
}

export const Sidebar: React.FC<SidebarProps> = ({
  notes,
  folders,
  currentNoteId,
  onSelectNote,
  onCreateNote,
  onCreateFolder,
  onDeleteNote,
  onOpenLocalFolder,
  isOpen
}) => {
  const [search, setSearch] = useState('')
  const [collapsedFolders, setCollapsedFolders] = useState<Record<string, boolean>>({})
  const [newFolderName, setNewFolderName] = useState('')
  const [isCreatingFolder, setIsCreatingFolder] = useState(false)

  if (!isOpen) return null

  const toggleFolder = (folder: string) => {
    setCollapsedFolders(prev => ({ ...prev, [folder]: !prev[folder] }))
  }

  const handleCreateFolderSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (newFolderName.trim()) {
      onCreateFolder(newFolderName.trim())
      setNewFolderName('')
      setIsCreatingFolder(false)
    }
  }

  const filteredNotes = notes.filter(n => {
    const q = search.toLowerCase()
    return n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q) || n.tags.some(t => t.toLowerCase().includes(q))
  })

  // Group notes by folder
  const notesByFolder: Record<string, Note[]> = {}
  for (const f of folders) {
    notesByFolder[f] = []
  }
  notesByFolder['Sem Pasta'] = []

  for (const n of filteredNotes) {
    if (notesByFolder[n.folder]) {
      notesByFolder[n.folder].push(n)
    } else {
      notesByFolder['Sem Pasta'].push(n)
    }
  }

  return (
    <div className="w-64 h-full bg-zinc-900 border-r border-zinc-800 flex flex-col select-none shrink-0 text-sm">
      {/* Vault Header */}
      <div className="p-3 border-b border-zinc-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-violet-600 flex items-center justify-center font-bold text-xs text-white shadow-md">
            💎
          </div>
          <span className="font-semibold text-zinc-100 text-xs tracking-wide">Pyrite Vault</span>
        </div>

        <button
          onClick={onOpenLocalFolder}
          className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-violet-400 hover:bg-zinc-800 px-2 py-1 rounded transition-colors"
          title="Abrir pasta local do PC como Vault"
        >
          <HardDrive className="w-3 h-3" />
          <span>Local</span>
        </button>
      </div>

      {/* Action Toolbar */}
      <div className="px-3 py-2 flex items-center justify-between border-b border-zinc-800/60 text-zinc-400">
        <div className="flex items-center gap-1">
          <button
            onClick={() => onCreateNote()}
            className="p-1 hover:text-zinc-100 hover:bg-zinc-800 rounded transition-colors"
            title="Nova Nota"
          >
            <Plus className="w-4 h-4" />
          </button>
          <button
            onClick={() => setIsCreatingFolder(true)}
            className="p-1 hover:text-zinc-100 hover:bg-zinc-800 rounded transition-colors"
            title="Nova Pasta"
          >
            <FolderPlus className="w-4 h-4" />
          </button>
        </div>

        <span className="text-[11px] text-zinc-500 font-medium">
          {notes.length} notas
        </span>
      </div>

      {/* Search Input */}
      <div className="p-2.5">
        <div className="relative flex items-center">
          <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filtrar notas..."
            className="w-full pl-8 pr-2 py-1.5 bg-zinc-950/80 border border-zinc-800 rounded-md text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-violet-500"
          />
        </div>
      </div>

      {/* Create Folder Modal/Inline input */}
      {isCreatingFolder && (
        <form onSubmit={handleCreateFolderSubmit} className="px-3 pb-2 flex items-center gap-1">
          <input
            type="text"
            autoFocus
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            placeholder="Nome da pasta..."
            className="flex-1 px-2 py-1 bg-zinc-950 border border-violet-500 rounded text-xs text-zinc-200 focus:outline-none"
          />
          <button
            type="submit"
            className="px-2 py-1 bg-violet-600 hover:bg-violet-500 text-white rounded text-xs"
          >
            Criar
          </button>
          <button
            type="button"
            onClick={() => setIsCreatingFolder(false)}
            className="px-1.5 py-1 text-zinc-400 hover:text-zinc-200 text-xs"
          >
            ✕
          </button>
        </form>
      )}

      {/* File Tree */}
      <div className="flex-1 overflow-y-auto px-2 py-1 space-y-1">
        {folders.map(folder => {
          const folderNotes = notesByFolder[folder] || []
          const isCollapsed = !!collapsedFolders[folder]

          return (
            <div key={folder} className="space-y-0.5">
              {/* Folder Row */}
              <div
                onClick={() => toggleFolder(folder)}
                className="flex items-center justify-between px-2 py-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 cursor-pointer text-xs font-medium group"
              >
                <div className="flex items-center gap-1.5 truncate">
                  {isCollapsed ? (
                    <ChevronRight className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                  )}
                  {isCollapsed ? (
                    <Folder className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                  ) : (
                    <FolderOpen className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                  )}
                  <span className="truncate">{folder}</span>
                </div>

                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onCreateNote(folder)
                    }}
                    className="p-0.5 hover:text-violet-400"
                    title={`Nova nota em ${folder}`}
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                  <span className="text-[10px] text-zinc-600 font-mono">
                    {folderNotes.length}
                  </span>
                </div>
              </div>

              {/* Notes inside Folder */}
              {!isCollapsed && (
                <div className="pl-4 space-y-0.5 border-l border-zinc-800/80 ml-2">
                  {folderNotes.map(note => {
                    const isActive = note.id === currentNoteId
                    return (
                      <div
                        key={note.id}
                        onClick={() => onSelectNote(note.id)}
                        className={`group flex items-center justify-between px-2 py-1.5 rounded text-xs cursor-pointer transition-colors ${
                          isActive
                            ? 'bg-violet-950/60 text-violet-300 font-medium border border-violet-800/40'
                            : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 truncate">
                          <FileText className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-violet-400' : 'text-zinc-500'}`} />
                          <span className="truncate">{note.title}</span>
                        </div>

                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            if (confirm(`Excluir "${note.title}"?`)) {
                              onDeleteNote(note.id)
                            }
                          }}
                          className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-rose-400 transition-opacity"
                          title="Excluir nota"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}

        {/* Notes without folder */}
        {notesByFolder['Sem Pasta'] && notesByFolder['Sem Pasta'].length > 0 && (
          <div className="pt-2">
            <div className="px-2 py-1 text-[11px] font-semibold uppercase text-zinc-500">
              Avulsas
            </div>
            {notesByFolder['Sem Pasta'].map(note => {
              const isActive = note.id === currentNoteId
              return (
                <div
                  key={note.id}
                  onClick={() => onSelectNote(note.id)}
                  className={`group flex items-center justify-between px-2 py-1.5 rounded text-xs cursor-pointer transition-colors ${
                    isActive
                      ? 'bg-violet-950/60 text-violet-300 font-medium border border-violet-800/40'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
                  }`}
                >
                  <div className="flex items-center gap-1.5 truncate">
                    <FileText className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-violet-400' : 'text-zinc-500'}`} />
                    <span className="truncate">{note.title}</span>
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      if (confirm(`Excluir "${note.title}"?`)) {
                        onDeleteNote(note.id)
                      }
                    }}
                    className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-rose-400 transition-opacity"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
