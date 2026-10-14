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
  ChevronDown,
  Calendar,
  Star
} from 'lucide-react'

interface SidebarProps {
  notes: Note[]
  folders: string[]
  currentNoteId?: string
  onSelectNote: (noteId: string) => void
  onCreateNote: (folder?: string) => void
  onCreateFolder: (name: string, parentFolder?: string) => void
  onDeleteNote: (noteId: string) => void
  onToggleFavorite: (noteId: string) => void
  onOpenDailyNote: () => void
  onOpenLocalFolder: () => void
  isOpen: boolean
}

interface TreeNode {
  name: string
  fullPath: string
  children: TreeNode[]
  notes: Note[]
}

export const Sidebar: React.FC<SidebarProps> = ({
  notes,
  folders,
  currentNoteId,
  onSelectNote,
  onCreateNote,
  onCreateFolder,
  onDeleteNote,
  onToggleFavorite,
  onOpenDailyNote,
  onOpenLocalFolder,
  isOpen
}) => {
  const [search, setSearch] = useState('')
  const [collapsedFolders, setCollapsedFolders] = useState<Record<string, boolean>>({})
  const [newFolderName, setNewFolderName] = useState('')
  const [parentForNewFolder, setParentForNewFolder] = useState<string | null>(null)
  const [isCreatingFolder, setIsCreatingFolder] = useState(false)

  if (!isOpen) return null

  const toggleFolder = (folderPath: string) => {
    setCollapsedFolders(prev => ({ ...prev, [folderPath]: !prev[folderPath] }))
  }

  const handleStartCreateFolder = (parent?: string) => {
    setParentForNewFolder(parent || null)
    setNewFolderName('')
    setIsCreatingFolder(true)
  }

  const handleCreateFolderSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (newFolderName.trim()) {
      const fullPath = parentForNewFolder ? `${parentForNewFolder}/${newFolderName.trim()}` : newFolderName.trim()
      onCreateFolder(fullPath)
      setNewFolderName('')
      setParentForNewFolder(null)
      setIsCreatingFolder(false)
    }
  }

  // Filter notes by search query
  const filteredNotes = notes.filter(n => {
    const q = search.toLowerCase()
    return (
      n.title.toLowerCase().includes(q) ||
      n.content.toLowerCase().includes(q) ||
      n.tags.some(t => t.toLowerCase().includes(q))
    )
  })

  // Favorite notes
  const favoriteNotes = notes.filter(n => n.isFavorite)

  // Build hierarchical folder tree from all folder paths and notes
  const buildTree = (): TreeNode[] => {
    const nodeMap = new Map<string, TreeNode>()

    // Normalize all folders and subfolder segments
    const allPathsSet = new Set<string>()
    for (const f of folders) {
      const parts = f.split('/').filter(Boolean)
      let accumulated = ''
      for (const part of parts) {
        accumulated = accumulated ? `${accumulated}/${part}` : part
        allPathsSet.add(accumulated)
      }
    }

    // Also include any folders mentioned by notes
    for (const n of filteredNotes) {
      if (n.folder && n.folder !== 'Sem Pasta') {
        const parts = n.folder.split('/').filter(Boolean)
        let accumulated = ''
        for (const part of parts) {
          accumulated = accumulated ? `${accumulated}/${part}` : part
          allPathsSet.add(accumulated)
        }
      }
    }

    // Initialize TreeNode for each path
    for (const path of allPathsSet) {
      const parts = path.split('/')
      const name = parts[parts.length - 1]
      nodeMap.set(path, {
        name,
        fullPath: path,
        children: [],
        notes: []
      })
    }

    // Assign notes to their exact folder
    for (const note of filteredNotes) {
      if (note.folder && nodeMap.has(note.folder)) {
        nodeMap.get(note.folder)!.notes.push(note)
      }
    }

    // Assemble parent-child hierarchy
    const rootNodes: TreeNode[] = []
    for (const [path, node] of nodeMap.entries()) {
      const lastSlash = path.lastIndexOf('/')
      if (lastSlash === -1) {
        rootNodes.push(node)
      } else {
        const parentPath = path.substring(0, lastSlash)
        const parentNode = nodeMap.get(parentPath)
        if (parentNode) {
          parentNode.children.push(node)
        } else {
          rootNodes.push(node)
        }
      }
    }

    return rootNodes
  }

  const rootFolderNodes = buildTree()

  // Notes without a registered folder
  const unassignedNotes = filteredNotes.filter(n => !n.folder || n.folder === 'Sem Pasta' || (!folders.includes(n.folder) && !n.folder.includes('/')))

  // Recursive Tree Node Renderer
  const renderFolderNode = (node: TreeNode, depth = 0) => {
    const isCollapsed = !!collapsedFolders[node.fullPath]
    const totalSubNotes = node.notes.length + node.children.reduce((acc, c) => acc + c.notes.length, 0)

    return (
      <div key={node.fullPath} className="space-y-0.5">
        {/* Folder Header Row */}
        <div
          onClick={() => toggleFolder(node.fullPath)}
          className="flex items-center justify-between px-2 py-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 cursor-pointer text-xs font-medium group transition-colors"
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
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
            <span className="truncate">{node.name}</span>
          </div>

          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={(e) => {
                e.stopPropagation()
                onCreateNote(node.fullPath)
              }}
              className="p-0.5 hover:text-violet-400"
              title={`Nova nota em ${node.fullPath}`}
            >
              <Plus className="w-3 h-3" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                handleStartCreateFolder(node.fullPath)
              }}
              className="p-0.5 hover:text-violet-400"
              title={`Nova subpasta em ${node.fullPath}`}
            >
              <FolderPlus className="w-3 h-3" />
            </button>
            <span className="text-[10px] text-zinc-600 font-mono">
              {totalSubNotes}
            </span>
          </div>
        </div>

        {/* Folder Children (Subfolders & Notes) */}
        {!isCollapsed && (
          <div className="space-y-0.5">
            {/* Direct Notes */}
            {node.notes.map(note => {
              const isActive = note.id === currentNoteId
              return (
                <div
                  key={note.id}
                  onClick={() => onSelectNote(note.id)}
                  className={`group flex items-center justify-between px-2 py-1.5 rounded-lg text-xs cursor-pointer transition-colors ${
                    isActive
                      ? 'bg-violet-950/60 text-violet-300 font-medium border border-violet-800/50'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
                  }`}
                  style={{ paddingLeft: `${(depth + 1) * 12 + 10}px` }}
                >
                  <div className="flex items-center gap-1.5 truncate">
                    <FileText className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-violet-400' : 'text-zinc-500'}`} />
                    <span className="truncate">{note.title}</span>
                  </div>

                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onToggleFavorite(note.id)
                      }}
                      className={`p-0.5 rounded hover:text-amber-400 ${note.isFavorite ? 'text-amber-400' : 'text-zinc-500'}`}
                      title={note.isFavorite ? 'Remover dos favoritos' : 'Favoritar nota'}
                    >
                      <Star className={`w-3 h-3 ${note.isFavorite ? 'fill-amber-400' : ''}`} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        if (confirm(`Excluir "${note.title}"?`)) {
                          onDeleteNote(note.id)
                        }
                      }}
                      className="p-0.5 hover:text-rose-400 text-zinc-500"
                      title="Excluir nota"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              )
            })}

            {/* Nested Subfolders */}
            {node.children.map(child => renderFolderNode(child, depth + 1))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="w-64 h-full bg-[#121215] border-r border-zinc-800 flex flex-col select-none shrink-0 text-xs">
      {/* 1. Vault Header */}
      <div className="p-3 border-b border-zinc-800 bg-[#0f0f12] flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center font-bold text-xs text-white shadow-md">
            💎
          </div>
          <div>
            <span className="font-semibold text-zinc-100 text-xs tracking-wide">Pyrite Vault</span>
            <div className="text-[10px] text-zinc-500">Local-First</div>
          </div>
        </div>

        <button
          onClick={onOpenLocalFolder}
          className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-violet-300 hover:bg-zinc-800/80 px-2 py-1 rounded-md transition-colors border border-zinc-800"
          title="Importar pasta e subpastas locais do PC"
        >
          <HardDrive className="w-3 h-3 text-violet-400" />
          <span>Importar</span>
        </button>
      </div>

      {/* 2. Top Quick Actions: Daily Note & New Note */}
      <div className="px-3 py-2 flex items-center justify-between border-b border-zinc-800/60 bg-zinc-950/30 text-zinc-400">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => onCreateNote()}
            className="flex items-center gap-1 px-2 py-1 bg-violet-600 hover:bg-violet-500 text-white rounded-md text-[11px] font-medium transition-colors shadow-sm"
            title="Criar Nova Nota"
          >
            <Plus className="w-3 h-3" />
            <span>Nota</span>
          </button>

          <button
            onClick={onOpenDailyNote}
            className="flex items-center gap-1 px-2 py-1 bg-zinc-800 hover:bg-zinc-750 text-zinc-300 rounded-md text-[11px] font-medium transition-colors border border-zinc-700/60"
            title="Abrir ou Criar Nota Diária de Hoje"
          >
            <Calendar className="w-3 h-3 text-amber-400" />
            <span>Diário</span>
          </button>

          <button
            onClick={() => handleStartCreateFolder()}
            className="p-1 hover:text-zinc-100 hover:bg-zinc-800 rounded-md transition-colors"
            title="Nova Pasta Raiz"
          >
            <FolderPlus className="w-3.5 h-3.5" />
          </button>
        </div>

        <span className="text-[10px] text-zinc-500 font-mono">
          {notes.length} notas
        </span>
      </div>

      {/* 3. Search Bar */}
      <div className="p-2.5">
        <div className="relative flex items-center">
          <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filtrar notas..."
            className="w-full pl-8 pr-2 py-1.5 bg-zinc-900/90 border border-zinc-800 rounded-lg text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-violet-500 transition-colors"
          />
        </div>
      </div>

      {/* Create Folder Modal / Inline input */}
      {isCreatingFolder && (
        <form onSubmit={handleCreateFolderSubmit} className="px-3 pb-2 flex items-center gap-1">
          <input
            type="text"
            autoFocus
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            placeholder={parentForNewFolder ? `Subpasta em ${parentForNewFolder}...` : "Nome da pasta..."}
            className="flex-1 px-2 py-1 bg-zinc-950 border border-violet-500 rounded-md text-xs text-zinc-200 focus:outline-none"
          />
          <button
            type="submit"
            className="px-2 py-1 bg-violet-600 hover:bg-violet-500 text-white rounded-md text-xs font-medium"
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

      {/* 4. Hierarchical File Tree & Favorites */}
      <div className="flex-1 overflow-y-auto px-2 py-1 space-y-2">
        {/* Favoritos (Star section) */}
        {favoriteNotes.length > 0 && (
          <div className="space-y-0.5">
            <div className="px-2 py-1 text-[10px] font-semibold uppercase text-amber-400/90 tracking-wider flex items-center gap-1">
              <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
              <span>Favoritos ({favoriteNotes.length})</span>
            </div>
            <div className="space-y-0.5">
              {favoriteNotes.map(n => {
                const isActive = n.id === currentNoteId
                return (
                  <div
                    key={`fav-${n.id}`}
                    onClick={() => onSelectNote(n.id)}
                    className={`group flex items-center justify-between px-2 py-1.5 rounded-lg text-xs cursor-pointer transition-colors ${
                      isActive
                        ? 'bg-violet-950/60 text-violet-300 font-medium border border-violet-800/50'
                        : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 truncate">
                      <Star className="w-3 h-3 text-amber-400 fill-amber-400 shrink-0" />
                      <span className="truncate">{n.title}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Recursive Subfolders & Notes Tree */}
        <div className="space-y-0.5">
          {rootFolderNodes.map(node => renderFolderNode(node, 0))}
        </div>

        {/* Unassigned notes (without folder) */}
        {unassignedNotes.length > 0 && (
          <div className="pt-2 border-t border-zinc-800/60">
            <div className="px-2 py-1 text-[10px] font-semibold uppercase text-zinc-500 tracking-wider">
              Avulsas
            </div>
            {unassignedNotes.map(note => {
              const isActive = note.id === currentNoteId
              return (
                <div
                  key={note.id}
                  onClick={() => onSelectNote(note.id)}
                  className={`group flex items-center justify-between px-2 py-1.5 rounded-lg text-xs cursor-pointer transition-colors ${
                    isActive
                      ? 'bg-violet-950/60 text-violet-300 font-medium border border-violet-800/50'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
                  }`}
                >
                  <div className="flex items-center gap-1.5 truncate">
                    <FileText className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-violet-400' : 'text-zinc-500'}`} />
                    <span className="truncate">{note.title}</span>
                  </div>

                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onToggleFavorite(note.id)
                      }}
                      className={`p-0.5 rounded hover:text-amber-400 ${note.isFavorite ? 'text-amber-400' : 'text-zinc-500'}`}
                    >
                      <Star className={`w-3 h-3 ${note.isFavorite ? 'fill-amber-400' : ''}`} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        if (confirm(`Excluir "${note.title}"?`)) {
                          onDeleteNote(note.id)
                        }
                      }}
                      className="p-0.5 hover:text-rose-400 text-zinc-500"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
