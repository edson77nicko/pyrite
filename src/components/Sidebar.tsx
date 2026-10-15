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
  Calendar,
  Star,
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  FolderSync
} from 'lucide-react'

interface SidebarProps {
  notes: Note[]
  folders: string[]
  currentNoteId?: string
  vaultPath?: string | null
  onSelectNote: (noteId: string) => void
  onCreateNote: (folder?: string) => void
  onCreateFolder: (name: string, parentFolder?: string) => void
  onDeleteNote: (noteId: string) => void
  onToggleFavorite: (noteId: string) => void
  onOpenDailyNote: () => void
  onOpenLocalFolder: () => void
  onOpenInExplorer?: () => void
  onOpenVaultSwitcher?: () => void
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
  vaultPath,
  onSelectNote,
  onCreateNote,
  onCreateFolder,
  onDeleteNote,
  onToggleFavorite,
  onOpenDailyNote,
  onOpenLocalFolder,
  onOpenInExplorer,
  onOpenVaultSwitcher,
  isOpen
}) => {
  const [search, setSearch] = useState('')
  const [collapsedFolders, setCollapsedFolders] = useState<Record<string, boolean>>({})
  const [newFolderName, setNewFolderName] = useState('')
  const [parentForNewFolder, setParentForNewFolder] = useState<string | null>(null)
  const [isCreatingFolder, setIsCreatingFolder] = useState(false)

  // Resizable sidebar width with localStorage persistence
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('pyrita_sidebar_width')
      return saved ? Number(saved) : 260
    } catch {
      return 260
    }
  })
  const [isDragging, setIsDragging] = useState(false)

  // Drag handler to resize sidebar width
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    setIsDragging(true)
    const startX = e.clientX
    const startWidth = sidebarWidth

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX
      const newWidth = Math.min(650, Math.max(200, startWidth + deltaX))
      setSidebarWidth(newWidth)
    }

    const handleMouseUp = (upEvent: MouseEvent) => {
      setIsDragging(false)
      const deltaX = upEvent.clientX - startX
      const finalWidth = Math.min(650, Math.max(200, startWidth + deltaX))
      try {
        localStorage.setItem('pyrita_sidebar_width', String(finalWidth))
      } catch {}
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
  }

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

  // Collapse or Expand all folders
  const handleToggleCollapseAll = () => {
    const allPaths: string[] = []
    const collect = (nodes: TreeNode[]) => {
      for (const n of nodes) {
        allPaths.push(n.fullPath)
        collect(n.children)
      }
    }
    collect(rootFolderNodes)

    const hasAnyOpen = allPaths.some(p => !collapsedFolders[p])
    if (hasAnyOpen) {
      const next: Record<string, boolean> = {}
      for (const p of allPaths) {
        next[p] = true
      }
      setCollapsedFolders(next)
    } else {
      setCollapsedFolders({})
    }
  }

  // Notes without a registered folder
  const unassignedNotes = filteredNotes.filter(n => !n.folder || n.folder === 'Sem Pasta' || (!folders.includes(n.folder) && !n.folder.includes('/')))

  // Recursive Tree Node Renderer - High Density & Compact Indentation
  const renderFolderNode = (node: TreeNode, depth = 0) => {
    const isCollapsed = !!collapsedFolders[node.fullPath]
    const totalSubNotes = node.notes.length + node.children.reduce((acc, c) => acc + c.notes.length, 0)
    // Compact indent: 8px to 10px instead of 22px, preventing infinite drift to the right
    const indentPadding = depth === 0 ? 'ml-1.5 pl-1.5' : 'ml-1.5 pl-1.5'

    return (
      <div key={node.fullPath} className="space-y-[1px]">
        {/* Folder Header Row */}
        <div
          onClick={() => toggleFolder(node.fullPath)}
          title={node.fullPath}
          className="flex items-center justify-between px-1.5 py-[3px] rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 cursor-pointer text-[11.5px] font-medium group transition-colors"
        >
          <div className="flex items-center gap-1.5 truncate min-w-0">
            <span className="text-zinc-500 hover:text-zinc-300 shrink-0">
              {isCollapsed ? (
                <ChevronRight className="w-3 h-3" />
              ) : (
                <ChevronDown className="w-3 h-3 text-zinc-400" />
              )}
            </span>
            {isCollapsed ? (
              <Folder className="w-3.5 h-3.5 text-[#c59b27]/80 shrink-0" />
            ) : (
              <FolderOpen className="w-3.5 h-3.5 text-[#d4af37] shrink-0" />
            )}
            <span className="truncate">{node.name}</span>
          </div>

          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            <button
              onClick={(e) => {
                e.stopPropagation()
                onCreateNote(node.fullPath)
              }}
              className="p-0.5 hover:text-[#d4af37] rounded"
              title={`Nova nota em ${node.fullPath}`}
            >
              <Plus className="w-3 h-3" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                handleStartCreateFolder(node.fullPath)
              }}
              className="p-0.5 hover:text-[#d4af37] rounded"
              title={`Nova subpasta em ${node.fullPath}`}
            >
              <FolderPlus className="w-3 h-3" />
            </button>
            <span className="text-[9.5px] text-zinc-600 font-mono px-0.5">
              {totalSubNotes}
            </span>
          </div>
        </div>

        {/* Folder Children (Subfolders & Notes) - Subtle Indented depth line */}
        {!isCollapsed && (
          <div className={`relative ${indentPadding} border-l border-zinc-800/40 hover:border-zinc-700/60 transition-colors space-y-[1px]`}>
            {node.notes.length === 0 && node.children.length === 0 && (
              <div className="px-2 py-0.5 text-[10px] text-zinc-600 italic">
                Pasta vazia
              </div>
            )}

            {/* Direct Notes */}
            {node.notes.map(note => {
              const isActive = note.id === currentNoteId
              return (
                <div
                  key={note.id}
                  onClick={() => onSelectNote(note.id)}
                  title={note.title}
                  className={`group flex items-center justify-between px-1.5 py-[3px] rounded-md text-[11.5px] cursor-pointer transition-colors border ${
                    isActive
                      ? 'bg-[#c59b27]/12 text-zinc-100 font-medium border-[#c59b27]/30'
                      : 'border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
                  }`}
                >
                  <div className="flex items-center gap-1.5 truncate min-w-0">
                    <FileText className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-[#c59b27]' : 'text-zinc-500'}`} />
                    <span className="truncate">{note.title}</span>
                  </div>

                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onToggleFavorite(note.id)
                      }}
                      className={`p-0.5 rounded hover:text-[#d4af37] ${note.isFavorite ? 'text-[#c59b27]' : 'text-zinc-500'}`}
                      title={note.isFavorite ? 'Remover dos favoritos' : 'Favoritar nota'}
                    >
                      <Star className={`w-3 h-3 ${note.isFavorite ? 'fill-[#c59b27] text-[#c59b27]' : ''}`} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        if (confirm(`Excluir "${note.title}"?`)) {
                          onDeleteNote(note.id)
                        }
                      }}
                      className="p-0.5 hover:text-rose-400 text-zinc-500 rounded"
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
    <div
      style={{ width: `${sidebarWidth}px` }}
      className="relative h-full bg-[#121215] border-r border-zinc-800 flex flex-col select-none shrink-0 text-xs"
    >
      {/* 1. Vault Header */}
      <div className="p-2.5 border-b border-zinc-800 bg-[#0f0f12] flex items-center justify-between">
        <div
          onClick={onOpenVaultSwitcher}
          className="flex items-center gap-2 truncate flex-1 mr-1 p-1 -ml-1 rounded-lg hover:bg-zinc-800/60 cursor-pointer transition-colors group"
          title="Clique para alternar ou gerenciar cofres (Vault Switcher)"
        >
          <div className="w-6 h-6 rounded-lg bg-[#c59b27] flex items-center justify-center font-bold text-xs text-zinc-950 shadow-sm shrink-0">
            Py
          </div>
          <div className="truncate flex-1">
            <div className="flex items-center gap-1">
              <span className="font-semibold text-zinc-100 text-xs tracking-wide truncate block group-hover:text-[#d4af37] transition-colors">
                {vaultPath ? vaultPath.split(/[/\\]/).filter(Boolean).pop() : 'Pyrita Vault'}
              </span>
              <ChevronDown className="w-3 h-3 text-zinc-500 group-hover:text-[#d4af37] shrink-0" />
            </div>
            <div className="text-[10px] text-zinc-500 truncate" title={vaultPath || 'Armazenamento local'}>
              {vaultPath ? 'Cofre Local (.md)' : 'Local-First'}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {onOpenInExplorer && vaultPath && (
            <button
              onClick={onOpenInExplorer}
              className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80 rounded-md transition-colors border border-zinc-800/80 cursor-pointer"
              title="Abrir pasta do cofre no Explorador de Arquivos do Windows"
            >
              <FolderOpen className="w-3.5 h-3.5 text-[#c59b27]" />
            </button>
          )}

          <button
            onClick={onOpenVaultSwitcher || onOpenLocalFolder}
            className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-[#d4af37] hover:bg-zinc-800/80 px-2 py-1 rounded-md transition-colors border border-zinc-800 cursor-pointer"
            title="Alternar ou Gerenciar Cofres (Vault Switcher)"
          >
            <FolderSync className="w-3 h-3 text-[#c59b27]" />
            <span>Cofres</span>
          </button>
        </div>
      </div>

      {/* 2. Top Quick Actions: Daily Note, New Note & Collapse All */}
      <div className="px-2.5 py-1.5 flex items-center justify-between border-b border-zinc-800/60 bg-zinc-950/30 text-zinc-400">
        <div className="flex items-center gap-1">
          <button
            onClick={() => onCreateNote()}
            className="flex items-center gap-1 px-2 py-1 bg-[#c59b27] hover:bg-[#d8b150] text-zinc-950 rounded-md text-[11px] font-semibold transition-all shadow-sm cursor-pointer"
            title="Criar Nova Nota"
          >
            <Plus className="w-3 h-3 stroke-[2.5]" />
            <span>Nota</span>
          </button>

          <button
            onClick={onOpenDailyNote}
            className="flex items-center gap-1 px-2 py-1 bg-zinc-800 hover:bg-zinc-750 text-zinc-300 rounded-md text-[11px] font-medium transition-colors border border-zinc-700/60 cursor-pointer"
            title="Abrir ou Criar Nota Diária de Hoje"
          >
            <Calendar className="w-3 h-3 text-[#c59b27]" />
            <span>Diário</span>
          </button>

          <button
            onClick={() => handleStartCreateFolder()}
            className="p-1 hover:text-[#d4af37] hover:bg-zinc-800 rounded-md transition-colors cursor-pointer"
            title="Nova Pasta Raiz"
          >
            <FolderPlus className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={handleToggleCollapseAll}
            className="p-1 hover:text-[#d4af37] hover:bg-zinc-800 rounded-md transition-colors cursor-pointer"
            title="Recolher / Expandir todas as pastas"
          >
            <ChevronsDownUp className="w-3.5 h-3.5" />
          </button>
        </div>

        <span className="text-[10px] text-zinc-500 font-mono">
          {notes.length} notas
        </span>
      </div>

      {/* 3. Search Bar */}
      <div className="p-2 border-b border-zinc-800/40">
        <div className="relative flex items-center">
          <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filtrar notas..."
            className="w-full pl-7 pr-2 py-1 bg-zinc-900/90 border border-zinc-800 rounded-md text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-[#c59b27]/60 transition-colors"
          />
        </div>
      </div>

      {/* Create Folder Modal / Inline input */}
      {isCreatingFolder && (
        <form onSubmit={handleCreateFolderSubmit} className="px-2.5 py-1.5 flex items-center gap-1 border-b border-zinc-800/60 bg-zinc-900/40">
          <input
            type="text"
            autoFocus
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            placeholder={parentForNewFolder ? `Subpasta em ${parentForNewFolder}...` : "Nome da pasta..."}
            className="flex-1 px-2 py-1 bg-zinc-950 border border-[#c59b27]/60 rounded-md text-xs text-zinc-200 focus:outline-none"
          />
          <button
            type="submit"
            className="px-2 py-1 bg-[#c59b27] hover:bg-[#d8b150] text-zinc-950 rounded-md text-xs font-semibold cursor-pointer"
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

      {/* 4. Hierarchical File Tree & Favorites - High Density & Horizontal Flexibility */}
      <div className="flex-1 overflow-y-auto overflow-x-auto px-1.5 py-1 space-y-1 custom-chat-scrollbar min-w-0">
        {/* Favoritos (Star section) */}
        {favoriteNotes.length > 0 && (
          <div className="space-y-[1px]">
            <div className="px-1.5 py-0.5 text-[9.5px] font-semibold uppercase text-[#d4af37] tracking-wider flex items-center gap-1">
              <Star className="w-2.5 h-2.5 fill-[#c59b27] text-[#c59b27]" />
              <span>Favoritos ({favoriteNotes.length})</span>
            </div>
            <div className="space-y-[1px]">
              {favoriteNotes.map(n => {
                const isActive = n.id === currentNoteId
                return (
                  <div
                    key={`fav-${n.id}`}
                    onClick={() => onSelectNote(n.id)}
                    title={n.title}
                    className={`group flex items-center justify-between px-1.5 py-[3px] rounded-md text-[11.5px] cursor-pointer transition-colors border ${
                      isActive
                        ? 'bg-[#c59b27]/12 text-zinc-100 font-medium border-[#c59b27]/30'
                        : 'border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 truncate min-w-0">
                      <Star className="w-3 h-3 text-[#c59b27] fill-[#c59b27] shrink-0" />
                      <span className="truncate">{n.title}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Recursive Subfolders & Notes Tree */}
        <div className="space-y-[1px] min-w-fit">
          {rootFolderNodes.map(node => renderFolderNode(node, 0))}
        </div>

        {/* Unassigned notes (without folder) */}
        {unassignedNotes.length > 0 && (
          <div className="pt-1.5 mt-1 border-t border-zinc-800/60">
            <div className="px-1.5 py-0.5 text-[9.5px] font-semibold uppercase text-zinc-500 tracking-wider">
              Avulsas ({unassignedNotes.length})
            </div>
            <div className="space-y-[1px]">
              {unassignedNotes.map(note => {
                const isActive = note.id === currentNoteId
                return (
                  <div
                    key={note.id}
                    onClick={() => onSelectNote(note.id)}
                    title={note.title}
                    className={`group flex items-center justify-between px-1.5 py-[3px] rounded-md text-[11.5px] cursor-pointer transition-colors border ${
                      isActive
                        ? 'bg-[#c59b27]/12 text-zinc-100 font-medium border-[#c59b27]/30'
                        : 'border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 truncate min-w-0">
                      <FileText className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-[#c59b27]' : 'text-zinc-500'}`} />
                      <span className="truncate">{note.title}</span>
                    </div>

                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          onToggleFavorite(note.id)
                        }}
                        className={`p-0.5 rounded hover:text-[#d4af37] ${note.isFavorite ? 'text-[#c59b27]' : 'text-zinc-500'}`}
                        title={note.isFavorite ? 'Remover dos favoritos' : 'Favoritar nota'}
                      >
                        <Star className={`w-3 h-3 ${note.isFavorite ? 'fill-[#c59b27] text-[#c59b27]' : ''}`} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          if (confirm(`Excluir "${note.title}"?`)) {
                            onDeleteNote(note.id)
                          }
                        }}
                        className="p-0.5 hover:text-rose-400 text-zinc-500 rounded"
                        title="Excluir nota"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Resize Handle on Right Border */}
      <div
        onMouseDown={handleMouseDown}
        className={`absolute top-0 right-0 w-1.5 h-full cursor-col-resize hover:bg-[#c59b27]/50 transition-colors z-20 ${
          isDragging ? 'bg-[#c59b27]' : 'bg-transparent'
        }`}
        title="Arraste para ajustar a largura da barra lateral"
      />
    </div>
  )
}
