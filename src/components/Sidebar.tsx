import { SidebarMenu } from './SidebarMenu'
import type { SidebarAction } from './SidebarMenu'
import React, { useState, useRef, useEffect } from 'react'
import type { Note, NoteType, ViewMode } from '../types'
import type { TaskBoard, TaskItem } from '../types/tasks'
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
  ChevronsDownUp,
  Palette,
  CheckCircle2,
  ListTodo,
  Target,
  FolderKanban,
  Sparkles,
  Bookmark,
  Layers,
  Flag,
  Zap,
  Briefcase,
  MoreVertical,
  Pencil,
  Brain,
  CodeXml
} from 'lucide-react'

interface SidebarProps {
  notes: Note[]
  folders: string[]
  currentNoteId?: string
  vaultPath?: string | null
  currentView?: ViewMode
  taskBoards?: TaskBoard[]
  activeBoardId?: string
  tasks?: TaskItem[]
  onSelectNote: (noteId: string) => void
  onCreateNote: (folder?: string, title?: string, type?: NoteType) => void
  onCreateFolder: (name: string, parentFolder?: string) => void
  onDeleteNote: (noteId: string) => void
  onToggleFavorite: (noteId: string) => void
  onOpenDailyNote: () => void
  onOpenLocalFolder: () => void
  onOpenInExplorer?: () => void
  onOpenVaultSwitcher?: () => void
  onOpenTasks?: () => void
  onSelectTaskBoard?: (boardId: string) => void
  onCreateTaskBoard?: (name: string, icon?: string) => void
  onRenameTaskBoard?: (boardId: string, newName: string) => void
  onChangeTaskBoardIcon?: (boardId: string, newIcon: string) => void
  onDeleteTaskBoard?: (boardId: string) => void
  pendingTasksCount?: number
  onManage: (action: SidebarAction, target: { note?: Note; folder?: string }, value?: string) => Promise<void>
  isOpen: boolean
}

interface TreeNode {
  name: string
  fullPath: string
  children: TreeNode[]
  notes: Note[]
}

const BOARD_ICON_OPTIONS = [
  'CheckCircle2', 'ListTodo', 'Target', 'FolderKanban', 'Sparkles', 'Star', 'Calendar', 'Bookmark', 'Layers', 'Flag', 'Zap', 'Briefcase'
]

const renderBoardIcon = (iconName?: string, className = "w-3.5 h-3.5 shrink-0") => {
  switch (iconName) {
    case 'ListTodo': return <ListTodo className={className} style={{ color: 'var(--accent, #c59b27)' }} />
    case 'Target': return <Target className={className} style={{ color: 'var(--accent, #c59b27)' }} />
    case 'FolderKanban': return <FolderKanban className={className} style={{ color: 'var(--accent, #c59b27)' }} />
    case 'Sparkles': return <Sparkles className={className} style={{ color: 'var(--accent, #c59b27)' }} />
    case 'Star': return <Star className={className} style={{ color: 'var(--accent, #c59b27)' }} />
    case 'Calendar': return <Calendar className={className} style={{ color: 'var(--accent, #c59b27)' }} />
    case 'Bookmark': return <Bookmark className={className} style={{ color: 'var(--accent, #c59b27)' }} />
    case 'Layers': return <Layers className={className} style={{ color: 'var(--accent, #c59b27)' }} />
    case 'Flag': return <Flag className={className} style={{ color: 'var(--accent, #c59b27)' }} />
    case 'Zap': return <Zap className={className} style={{ color: 'var(--accent, #c59b27)' }} />
    case 'Briefcase': return <Briefcase className={className} style={{ color: 'var(--accent, #c59b27)' }} />
    default: return <CheckCircle2 className={className} style={{ color: 'var(--accent, #c59b27)' }} />
  }
}

export const Sidebar: React.FC<SidebarProps> = ({
  notes,
  folders,
  currentNoteId,
  vaultPath,
  currentView,
  taskBoards = [],
  activeBoardId = 'default',
  tasks = [],
  onSelectNote,
  onCreateNote,
  onCreateFolder,
  onDeleteNote,
  onToggleFavorite,
  onOpenDailyNote,
  onOpenLocalFolder,
  onOpenInExplorer: _onOpenInExplorer,
  onOpenVaultSwitcher,
  onOpenTasks,
  onSelectTaskBoard,
  onCreateTaskBoard,
  onRenameTaskBoard,
  onChangeTaskBoardIcon,
  onDeleteTaskBoard,
  pendingTasksCount: _pendingTasksCount,
  isOpen,
  onManage
}) => {
  const [context, setContext] = useState<{ x: number; y: number; note?: Note; folder?: string } | null>(null)
  const [folderFilter, setFolderFilter] = useState<string | null>(null)
  const scope = `${vaultPath || ''}:${isOpen}`
  const [previousScope, setPreviousScope] = useState(scope)
  if (previousScope !== scope) {
    setPreviousScope(scope)
    setContext(null)
    setFolderFilter(null)
  }
  const openContext = (e: React.MouseEvent, target: { note?: Note; folder?: string }) => { e.preventDefault(); e.stopPropagation(); setContext({ x: e.clientX, y: e.clientY, ...target }) }
  const [search, setSearch] = useState('')
  const [collapsedFolders, setCollapsedFolders] = useState<Record<string, boolean>>({})

  // Drag and drop state for notes and folders
  const [draggedItem, setDraggedItem] = useState<
    | { type: 'note'; note: Note }
    | { type: 'folder'; fullPath: string }
    | null
  >(null)
  const [dragOverTarget, setDragOverTarget] = useState<string | null>(null)
  const autoExpandTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearAutoExpandTimer = () => {
    if (autoExpandTimerRef.current) {
      clearTimeout(autoExpandTimerRef.current)
      autoExpandTimerRef.current = null
    }
  }

  useEffect(() => {
    return () => {
      clearAutoExpandTimer()
    }
  }, [])

  const isVaultRoot = (path?: string) => !path || path === 'Início' || path === 'Sem Pasta' || path.trim() === ''

  const canDropInto = (
    dragged: { type: 'note'; note: Note } | { type: 'folder'; fullPath: string } | null,
    targetFolder: string
  ): boolean => {
    if (!dragged) return false
    const targetIsRoot = isVaultRoot(targetFolder)

    if (dragged.type === 'note') {
      const noteIsRoot = isVaultRoot(dragged.note.folder)
      if (targetIsRoot && noteIsRoot) return false
      if (!targetIsRoot && dragged.note.folder === targetFolder) return false
      return true
    }

    if (dragged.type === 'folder') {
      const folderPath = dragged.fullPath
      if (isVaultRoot(folderPath)) return false
      if (folderPath === targetFolder) return false
      if (targetFolder.startsWith(folderPath + '/')) return false
      const lastSlash = folderPath.lastIndexOf('/')
      const currentParent = lastSlash === -1 ? '' : folderPath.substring(0, lastSlash)
      const parentIsRoot = isVaultRoot(currentParent)
      if (targetIsRoot && parentIsRoot) return false
      if (!targetIsRoot && currentParent === targetFolder) return false
      return true
    }

    return false
  }

  const handleFolderDragStart = (e: React.DragEvent, fullPath: string) => {
    e.stopPropagation()
    e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'folder', fullPath }))
    e.dataTransfer.effectAllowed = 'move'
    setDraggedItem({ type: 'folder', fullPath })
  }

  const handleNoteDragStart = (e: React.DragEvent, note: Note) => {
    e.stopPropagation()
    e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'note', id: note.id }))
    e.dataTransfer.effectAllowed = 'move'
    setDraggedItem({ type: 'note', note })
  }

  const handleDragEnd = () => {
    setDraggedItem(null)
    setDragOverTarget(null)
    clearAutoExpandTimer()
  }

  const handleFolderDragOver = (e: React.DragEvent, folderPath: string) => {
    if (canDropInto(draggedItem, folderPath)) {
      e.preventDefault()
      e.stopPropagation()
      e.dataTransfer.dropEffect = 'move'
      if (dragOverTarget !== folderPath) {
        setDragOverTarget(folderPath)
      }

      // Auto-expand folder on hover if collapsed
      if (collapsedFolders[folderPath] ?? true) {
        if (!autoExpandTimerRef.current) {
          autoExpandTimerRef.current = setTimeout(() => {
            setCollapsedFolders(prev => ({ ...prev, [folderPath]: false }))
            autoExpandTimerRef.current = null
          }, 600)
        }
      }
    }
  }

  const handleFolderDragLeave = (e: React.DragEvent, folderPath: string) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return
    if (dragOverTarget === folderPath) {
      setDragOverTarget(null)
    }
    clearAutoExpandTimer()
  }

  const handleNoteDragOver = (e: React.DragEvent, note: Note) => {
    const targetFolder = isVaultRoot(note.folder) ? '' : note.folder
    if (canDropInto(draggedItem, targetFolder)) {
      e.preventDefault()
      e.stopPropagation()
      e.dataTransfer.dropEffect = 'move'
      if (dragOverTarget !== targetFolder) {
        setDragOverTarget(targetFolder)
      }
    }
  }

  const handleNoteDragLeave = (e: React.DragEvent, note: Note) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return
    const targetFolder = isVaultRoot(note.folder) ? '' : note.folder
    if (dragOverTarget === targetFolder) {
      setDragOverTarget(null)
    }
  }

  const handleDrop = async (e: React.DragEvent, targetFolder: string) => {
    e.preventDefault()
    e.stopPropagation()
    clearAutoExpandTimer()

    const currentDrag = draggedItem
    setDraggedItem(null)
    setDragOverTarget(null)

    if (!currentDrag) return
    if (!canDropInto(currentDrag, targetFolder)) return

    const dest = isVaultRoot(targetFolder) ? '' : targetFolder

    try {
      if (currentDrag.type === 'note') {
        await onManage('move', { note: currentDrag.note }, dest)
      } else if (currentDrag.type === 'folder') {
        await onManage('move', { folder: currentDrag.fullPath }, dest)
      }
    } catch (err: any) {
      alert(err?.message || 'Não foi possível mover o item.')
    }
  }

  const handleNoteDrop = async (e: React.DragEvent, note: Note) => {
    const targetFolder = isVaultRoot(note.folder) ? '' : note.folder
    await handleDrop(e, targetFolder)
  }
  const [newFolderName, setNewFolderName] = useState('')
  const [parentForNewFolder, setParentForNewFolder] = useState<string | null>(null)
  const [isCreatingFolder, setIsCreatingFolder] = useState(false)
  const [isCreateMenuOpen, setIsCreateMenuOpen] = useState(false)
  const createMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isCreateMenuOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      if (createMenuRef.current && !createMenuRef.current.contains(e.target as Node)) {
        setIsCreateMenuOpen(false)
      }
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsCreateMenuOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isCreateMenuOpen])

  // Task Boards UI State
  const [isCreatingBoard, setIsCreatingBoard] = useState(false)
  const [newBoardName, setNewBoardName] = useState('')
  const [newBoardIcon, setNewBoardIcon] = useState('CheckCircle2')
  const [editingBoardId, setEditingBoardId] = useState<string | null>(null)
  const [editingBoardName, setEditingBoardName] = useState('')
  const [boardMenuId, setBoardMenuId] = useState<string | null>(null)
  const [boardToDelete, setBoardToDelete] = useState<TaskBoard | null>(null)

  const effectiveBoards: TaskBoard[] = taskBoards.length > 0
    ? taskBoards
    : [{ id: 'default', name: 'Tarefas', icon: 'CheckCircle2', createdAt: Date.now() }]

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
    setCollapsedFolders(prev => {
      const current = prev[folderPath] ?? true
      return { ...prev, [folderPath]: !current }
    })
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
    return (!folderFilter || n.folder === folderFilter || n.folder.startsWith(`${folderFilter}/`)) && (
      n.title.toLowerCase().includes(q) ||
      n.content.toLowerCase().includes(q) ||
      n.tags.some(t => t.toLowerCase().includes(q))
    )
  })

  // Favorite notes
  const favoriteNotes = filteredNotes.filter(n => n.isFavorite)

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

    const hasAnyOpen = allPaths.some(p => (collapsedFolders[p] ?? true) === false)
    if (hasAnyOpen) {
      const next: Record<string, boolean> = {}
      for (const p of allPaths) {
        next[p] = true
      }
      setCollapsedFolders(next)
    } else {
      const next: Record<string, boolean> = {}
      for (const p of allPaths) {
        next[p] = false
      }
      setCollapsedFolders(next)
    }
  }

  // Notes without a registered folder
  const unassignedNotes = filteredNotes.filter(n => !n.folder || n.folder === 'Sem Pasta')

  // Recursive Tree Node Renderer - High Density & Compact Indentation
  const renderFolderNode = (node: TreeNode) => {
    const isCollapsed = collapsedFolders[node.fullPath] ?? true
    const totalSubNotes = node.notes.length + node.children.reduce((acc, c) => acc + c.notes.length, 0)
    // Keep each nesting step small so deep folder trees remain readable.
    const indentPadding = 'ml-0.5 pl-0.5'
    const isBeingDragged = draggedItem?.type === 'folder' && draggedItem.fullPath === node.fullPath
    const isTargetFolder = dragOverTarget === node.fullPath
    const isRootNode = isVaultRoot(node.fullPath)

    return (
      <div key={node.fullPath} className="space-y-[1px]">
        {/* Folder Header Row */}
        <div
          draggable={!isRootNode}
          onDragStart={(e) => handleFolderDragStart(e, node.fullPath)}
          onDragEnd={handleDragEnd}
          onDragOver={(e) => handleFolderDragOver(e, node.fullPath)}
          onDragLeave={(e) => handleFolderDragLeave(e, node.fullPath)}
          onDrop={(e) => handleDrop(e, node.fullPath)}
          onContextMenu={e => openContext(e, { folder: node.fullPath })}
          onClick={() => toggleFolder(node.fullPath)}
          title={node.fullPath}
          className={`flex items-center justify-between px-1.5 py-[3px] rounded-md text-[11.5px] font-medium group transition-all cursor-pointer ${
            isBeingDragged
              ? 'opacity-40 scale-[0.98] border border-dashed border-zinc-600'
              : isTargetFolder
              ? 'ring-2 ring-[var(--accent)] bg-[var(--accent-glow-subtle)] text-zinc-100 shadow-xs'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
          }`}
        >
          <div className="flex items-center gap-1.5 truncate min-w-0">
            {isCollapsed ? (
              <Folder className="w-3.5 h-3.5 opacity-80 shrink-0" style={{ color: 'var(--accent)' }} />
            ) : (
              <FolderOpen className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--accent)' }} />
            )}
            <span className="truncate">{node.name}</span>
          </div>

          {isTargetFolder ? (
            <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold text-zinc-950 shrink-0 shadow-xs animate-in fade-in duration-100" style={{ backgroundColor: 'var(--accent)' }}>
              Mover para cá
            </span>
          ) : (
            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
              <button
                draggable={false}
                onDragStart={e => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation()
                  onCreateNote(node.fullPath, undefined, 'note')
                }}
                className="p-0.5 hover:text-white rounded"
                title={`Nova nota em ${node.fullPath}`}
              >
                <Plus className="w-3 h-3" />
              </button>
              <button
                draggable={false}
                onDragStart={e => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation()
                  onCreateNote(node.fullPath, undefined, 'draw')
                }}
                className="p-0.5 hover:text-white rounded"
                title={`Novo Draw em ${node.fullPath}`}
              >
                <Palette className="w-3 h-3" style={{ color: 'var(--accent)' }} />
              </button>
              <button
                draggable={false}
                onDragStart={e => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation()
                  onCreateNote(node.fullPath, undefined, 'mindmap')
                }}
                className="p-0.5 hover:text-white rounded"
                title={`Novo Mapa Mental em ${node.fullPath}`}
              >
                <Brain className="w-3 h-3" style={{ color: 'var(--accent)' }} />
              </button>
              <button
                draggable={false}
                onDragStart={e => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation()
                  onCreateNote(node.fullPath, undefined, 'html')
                }}
                className="p-0.5 hover:text-white rounded"
                title={`Novo Arquivo HTML em ${node.fullPath}`}
              >
                <CodeXml className="w-3 h-3 text-orange-500 hover:text-orange-400" />
              </button>
              <button
                draggable={false}
                onDragStart={e => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation()
                  handleStartCreateFolder(node.fullPath)
                }}
                className="p-0.5 hover:text-white rounded"
                title={`Nova subpasta em ${node.fullPath}`}
              >
                <FolderPlus className="w-3 h-3" />
              </button>
              <span className="text-[9.5px] text-zinc-600 font-mono px-0.5">
                {totalSubNotes}
              </span>
            </div>
          )}
        </div>

        {/* Folder Children (Subfolders & Notes) - Subtle Indented depth line */}
        {!isCollapsed && (
          <div className={`relative ${indentPadding} border-l border-zinc-800/40 hover:border-zinc-700/60 transition-colors space-y-[1px]`}>
            {node.notes.length === 0 && node.children.length === 0 && (
              <div
                onDragOver={(e) => handleFolderDragOver(e, node.fullPath)}
                onDragLeave={(e) => handleFolderDragLeave(e, node.fullPath)}
                onDrop={(e) => handleDrop(e, node.fullPath)}
                className={`px-2 py-1 text-[10px] rounded transition-colors ${
                  isTargetFolder
                    ? 'border border-[var(--accent)] bg-[var(--accent-glow-subtle)] text-[var(--accent)] font-medium'
                    : 'text-zinc-600 italic'
                }`}
              >
                {isTargetFolder ? 'Soltar na pasta' : 'Pasta vazia'}
              </div>
            )}

            {/* Direct Notes */}
            {node.notes.map(note => {
              const isActive = note.id === currentNoteId
              const isDraw = note.type === 'draw'
              const isMindMap = note.type === 'mindmap'
              const isHtml = note.type === 'html'
              const NoteIcon = isMindMap ? Brain : isDraw ? Palette : isHtml ? CodeXml : FileText
              const isNoteDragged = draggedItem?.type === 'note' && draggedItem.note.id === note.id
              return (
                <div
                  key={note.id}
                  draggable={true}
                  onDragStart={(e) => handleNoteDragStart(e, note)}
                  onDragEnd={handleDragEnd}
                  onDragOver={(e) => handleNoteDragOver(e, note)}
                  onDragLeave={(e) => handleNoteDragLeave(e, note)}
                  onDrop={(e) => handleNoteDrop(e, note)}
                  onContextMenu={e => openContext(e, { note })}
                  onClick={() => onSelectNote(note.id)}
                  title={`${note.title} (${isMindMap ? 'Mapa Mental' : isDraw ? 'Desenho / Draw' : isHtml ? 'Arquivo HTML' : 'Nota'})`}
                  className={`group flex items-center justify-between px-1.5 py-[3px] rounded-md text-[11.5px] cursor-pointer transition-colors border ${
                    isNoteDragged
                      ? 'opacity-40 scale-[0.98] border-dashed border-zinc-600'
                      : isActive
                      ? 'text-zinc-100 font-medium border-zinc-700/80 shadow-xs'
                      : 'border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
                  }`}
                  style={isActive && !isNoteDragged ? { backgroundColor: 'var(--accent-glow-subtle)', borderColor: 'var(--accent-glow)' } : undefined}
                >
                  <div className="flex items-center gap-1.5 truncate min-w-0">
                    <NoteIcon
                      className="w-3.5 h-3.5 shrink-0"
                      style={
                        isHtml
                          ? { color: '#f97316' }
                          : (isActive || isDraw || isMindMap)
                          ? { color: 'var(--accent)' }
                          : { color: '#71717a' }
                      }
                    />
                    <span className="truncate">{note.title}</span>
                  </div>

                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button
                      draggable={false}
                      onDragStart={e => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation()
                        onToggleFavorite(note.id)
                      }}
                      className="p-0.5 rounded hover:text-white"
                      title={note.isFavorite ? 'Remover dos favoritos' : 'Favoritar nota'}
                    >
                      <Star className="w-3 h-3" style={note.isFavorite ? { fill: 'var(--accent)', color: 'var(--accent)' } : { color: '#71717a' }} />
                    </button>
                    <button
                      draggable={false}
                      onDragStart={e => e.stopPropagation()}
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
            {node.children.map(child => renderFolderNode(child))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div
      style={{ width: `${sidebarWidth}px` }}
      className="relative my-2 bg-[#121215] rounded-r-2xl border-y border-r border-zinc-800 flex flex-col select-none shrink-0 text-xs overflow-hidden shadow-lg"
    >
      {/* 1. Vault Header */}
      <div className="p-2 border-b border-zinc-800/60 bg-[#0f0f12] flex items-center justify-between gap-1">
        <div
          onClick={onOpenVaultSwitcher || onOpenLocalFolder}
          className="flex items-center gap-2 truncate flex-1 min-w-0 p-1 -ml-0.5 rounded-lg hover:bg-zinc-800/60 cursor-pointer transition-colors group"
          title="Clique para alternar ou gerenciar cofres (Vault Switcher)"
        >
          <div
            className="w-6 h-6 rounded-lg flex items-center justify-center font-bold text-xs shadow-xs shrink-0"
            style={{
              backgroundColor: 'var(--accent-glow-subtle, rgba(197, 155, 39, 0.12))',
              color: 'var(--accent, #d4af37)'
            }}
          >
            Py
          </div>
          <div className="truncate flex-1 min-w-0">
            <div className="flex items-center gap-1">
              <span className="font-semibold text-zinc-100 text-xs tracking-wide truncate block group-hover:text-white transition-colors">
                {vaultPath ? vaultPath.split(/[/\\]/).filter(Boolean).pop() : 'Pyrita Vault'}
              </span>
              <ChevronDown className="w-3 h-3 text-zinc-500 group-hover:text-white shrink-0" />
            </div>
            <div className="text-[10px] text-zinc-500 truncate" title={vaultPath || 'Armazenamento local'}>
              {vaultPath ? 'Cofre Local (.md)' : 'Local-First'}
            </div>
          </div>
        </div>

        {/* Header Actions: Collapse All & Create New Dropdown */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={handleToggleCollapseAll}
            className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800/70 rounded-md transition-colors cursor-pointer"
            title="Recolher / Expandir todas as pastas"
          >
            <ChevronsDownUp className="w-3.5 h-3.5" />
          </button>

          {/* New Item Dropdown Menu */}
          <div className="relative" ref={createMenuRef}>
            <button
              type="button"
              onClick={() => setIsCreateMenuOpen(v => !v)}
              className="flex items-center justify-center w-6 h-6 rounded-md font-bold transition-all shadow-xs cursor-pointer hover:bg-[var(--accent-glow)] hover:scale-105 active:scale-95"
              style={{
                backgroundColor: 'var(--accent-glow-subtle, rgba(197, 155, 39, 0.12))',
                color: 'var(--accent, #d4af37)'
              }}
              title="Criar nova nota, draw, mapa mental ou pasta"
            >
              <Plus className={`w-3.5 h-3.5 stroke-[2.5] transition-transform duration-200 ${isCreateMenuOpen ? 'rotate-45' : ''}`} />
            </button>

            {isCreateMenuOpen && (
              <div
                className="absolute right-0 top-full mt-1.5 z-50 w-48 bg-[#16161c] border border-zinc-700/80 rounded-xl shadow-2xl p-1 text-xs space-y-0.5 animate-in fade-in zoom-in-95 duration-100"
                onClick={e => e.stopPropagation()}
              >
                <div className="px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-wider text-zinc-500">
                  Criar Novo
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setIsCreateMenuOpen(false)
                    onCreateNote(undefined, undefined, 'note')
                  }}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-zinc-200 hover:text-white hover:bg-zinc-800 transition-colors text-left cursor-pointer group"
                >
                  <FileText className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                  <span className="font-medium text-xs">Nova Nota</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsCreateMenuOpen(false)
                    onCreateNote(undefined, undefined, 'draw')
                  }}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-zinc-200 hover:text-white hover:bg-zinc-800 transition-colors text-left cursor-pointer group"
                >
                  <Palette className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--accent)' }} />
                  <span className="font-medium text-xs">Novo Draw</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsCreateMenuOpen(false)
                    onCreateNote(undefined, undefined, 'mindmap')
                  }}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-zinc-200 hover:text-white hover:bg-zinc-800 transition-colors text-left cursor-pointer group"
                >
                  <Brain className="w-3.5 h-3.5 text-purple-400 shrink-0" style={{ color: 'var(--accent)' }} />
                  <span className="font-medium text-xs">Novo Mapa Mental</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsCreateMenuOpen(false)
                    onCreateNote(undefined, undefined, 'html')
                  }}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-zinc-200 hover:text-white hover:bg-zinc-800 transition-colors text-left cursor-pointer group"
                >
                  <CodeXml className="w-3.5 h-3.5 text-orange-400 shrink-0" />
                  <span className="font-medium text-xs">Novo Arquivo HTML</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsCreateMenuOpen(false)
                    onOpenDailyNote()
                  }}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-zinc-200 hover:text-white hover:bg-zinc-800 transition-colors text-left cursor-pointer group"
                >
                  <Calendar className="w-3.5 h-3.5 text-amber-400 shrink-0" style={{ color: 'var(--accent)' }} />
                  <span className="font-medium text-xs">Nota Diária</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsCreateMenuOpen(false)
                    setIsCreatingBoard(true)
                  }}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-zinc-200 hover:text-white hover:bg-zinc-800 transition-colors text-left cursor-pointer group"
                >
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" style={{ color: 'var(--accent)' }} />
                  <span className="font-medium text-xs">Novo Grupo de Tarefas</span>
                </button>

                <div className="h-px bg-zinc-800/60 my-1 mx-1" />

                <button
                  type="button"
                  onClick={() => {
                    setIsCreateMenuOpen(false)
                    handleStartCreateFolder()
                  }}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors text-left cursor-pointer group"
                >
                  <FolderPlus className="w-3.5 h-3.5 text-zinc-400 group-hover:text-zinc-200 shrink-0" />
                  <span className="font-medium text-xs">Nova Pasta</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 2. Search Bar - Clean, without extra border-b */}
      <div className="p-2">
        <div className="relative flex items-center">
          <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filtrar notas..."
            className="w-full pl-7 pr-2 py-1 bg-zinc-900/90 border border-zinc-800/80 rounded-md text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-[#c59b27]/60 transition-colors"
          />
        </div>
      </div>

      {folderFilter && <button className="px-3 py-1 text-left" style={{ color: 'var(--accent)' }} onClick={() => setFolderFilter(null)}>Pesquisa em {folderFilter} · Limpar ×</button>}
      {context && <SidebarMenu key={context.x + ':' + context.y + (context.note?.id || context.folder)} context={context} folders={folders} isVaultRoot={!!vaultPath && context.folder === 'Início'} onClose={() => setContext(null)} onAction={async (action, value) => {
        if (action === 'new-note') onCreateNote(context.folder, undefined, 'note')
        else if (action === 'new-draw') onCreateNote(context.folder, undefined, 'draw')
        else if (action === 'new-mindmap') onCreateNote(context.folder, undefined, 'mindmap')
        else if (action === 'new-html') onCreateNote(context.folder, undefined, 'html')
        else if (action === 'new-folder') handleStartCreateFolder(vaultPath && context.folder === 'Início' ? undefined : context.folder)
        else if (action === 'search') { setFolderFilter(context.folder!); setSearch('') }
        else await onManage(action, context, value)
      }} />}
      {/* Create Folder Modal / Inline input */}
      {isCreatingFolder && (
        <form onSubmit={handleCreateFolderSubmit} className="px-2.5 py-1.5 flex items-center gap-1 border-b border-zinc-800/60 bg-zinc-900/40">
          <input
            type="text"
            autoFocus
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            placeholder={parentForNewFolder ? `Subpasta em ${parentForNewFolder}...` : "Nome da pasta..."}
            className="flex-1 px-2.5 py-1 bg-zinc-900 border border-zinc-700/80 rounded-md text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-[var(--accent)] transition-colors"
          />
          <button
            type="submit"
            className="px-2 py-1 rounded-md text-xs font-semibold cursor-pointer transition-all hover:bg-[var(--accent-glow)] shadow-xs"
            style={{
              backgroundColor: 'var(--accent-glow-subtle, rgba(197, 155, 39, 0.12))',
              color: 'var(--accent, #d4af37)'
            }}
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
      <div className="flex-1 overflow-y-auto overflow-x-auto px-1.5 py-1 space-y-2 custom-chat-scrollbar min-w-0">
        
        {/* PARTE 1: TAREFAS */}
        <div className="space-y-1 pt-1 pb-1">
          <div className="flex items-center justify-between px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            <span>Tarefas</span>
            {onCreateTaskBoard && (
              <button
                type="button"
                onClick={() => setIsCreatingBoard(true)}
                className="p-0.5 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
                title="Nova página de tarefas"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Form to create new task board */}
          {isCreatingBoard && (
            <div className="p-2.5 bg-[#16161a] border border-zinc-700/60 rounded-xl space-y-2 mb-1.5 animate-in fade-in duration-100">
              <input
                type="text"
                autoFocus
                value={newBoardName}
                onChange={e => setNewBoardName(e.target.value)}
                placeholder="Nome da página..."
                className="w-full bg-[#121215] border border-zinc-700 rounded-lg px-2 py-1 text-xs text-zinc-200 outline-none"
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    if (newBoardName.trim()) {
                      onCreateTaskBoard?.(newBoardName.trim(), newBoardIcon)
                      setNewBoardName('')
                      setIsCreatingBoard(false)
                    }
                  }
                  if (e.key === 'Escape') setIsCreatingBoard(false)
                }}
              />
              <div className="flex items-center gap-1 flex-wrap">
                <span className="text-[10px] text-zinc-400 font-mono">Ícone:</span>
                {BOARD_ICON_OPTIONS.map(ico => (
                  <button
                    type="button"
                    key={ico}
                    onClick={() => setNewBoardIcon(ico)}
                    className={`p-1 rounded border transition-all cursor-pointer ${newBoardIcon === ico ? 'bg-zinc-700 border-zinc-500 text-white' : 'border-zinc-800 text-zinc-400 hover:text-zinc-200'}`}
                  >
                    {renderBoardIcon(ico, "w-3 h-3")}
                  </button>
                ))}
              </div>
              <div className="flex justify-end gap-1.5 pt-1">
                <button
                  type="button"
                  onClick={() => setIsCreatingBoard(false)}
                  className="px-2 py-0.5 rounded text-[11px] text-zinc-400 hover:text-zinc-200 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (newBoardName.trim()) {
                      onCreateTaskBoard?.(newBoardName.trim(), newBoardIcon)
                      setNewBoardName('')
                      setIsCreatingBoard(false)
                    }
                  }}
                  className="px-2.5 py-0.5 rounded text-[11px] bg-zinc-800 hover:bg-zinc-700 text-zinc-100 font-medium cursor-pointer"
                >
                  Criar
                </button>
              </div>
            </div>
          )}

          {/* List all task boards */}
          {effectiveBoards.map((b) => {
            const isBoardActive = currentView === 'tasks' && activeBoardId === b.id
            const boardPendingCount = tasks.filter(t => (t.boardId || 'default') === b.id && !t.completed).length
            const isEditing = editingBoardId === b.id

            return (
              <div
                key={b.id}
                className="group relative"
              >
                {isEditing ? (
                  <div className="flex items-center gap-1.5 px-2 py-1 bg-[#16161a] border border-zinc-700/60 rounded-lg">
                    <input
                      type="text"
                      autoFocus
                      value={editingBoardName}
                      onChange={e => setEditingBoardName(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          if (editingBoardName.trim()) {
                            onRenameTaskBoard?.(b.id, editingBoardName.trim())
                            setEditingBoardId(null)
                          }
                        }
                        if (e.key === 'Escape') setEditingBoardId(null)
                      }}
                      className="flex-1 bg-transparent text-xs text-zinc-100 outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (editingBoardName.trim()) {
                          onRenameTaskBoard?.(b.id, editingBoardName.trim())
                          setEditingBoardId(null)
                        }
                      }}
                      className="text-[10px] bg-zinc-800 text-zinc-200 px-1.5 py-0.5 rounded hover:bg-zinc-700 cursor-pointer"
                    >
                      OK
                    </button>
                  </div>
                ) : (
                  <div
                    onClick={() => {
                      onSelectTaskBoard ? onSelectTaskBoard(b.id) : onOpenTasks?.()
                    }}
                    className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs cursor-pointer transition-colors border ${
                      isBoardActive
                        ? 'text-zinc-100 font-medium border-zinc-700/80 shadow-xs'
                        : 'border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-zinc-850/50'
                    }`}
                    style={isBoardActive ? { backgroundColor: 'var(--accent-glow-subtle)', borderColor: 'var(--accent-glow)' } : undefined}
                  >
                    <div className="flex items-center gap-2 truncate min-w-0">
                      {renderBoardIcon(b.icon, "w-4 h-4 shrink-0")}
                      <span className="truncate font-medium">{b.name}</span>
                    </div>

                    <div className="flex items-center gap-1">
                      {boardPendingCount > 0 && (
                        <span className="px-1.5 py-0.5 rounded-full text-[9.5px] font-mono bg-zinc-800 text-zinc-400 group-hover:text-zinc-200">
                          {boardPendingCount}
                        </span>
                      )}

                      {/* Board Actions trigger */}
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation()
                          setBoardMenuId(boardMenuId === b.id ? null : b.id)
                        }}
                        className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-opacity cursor-pointer"
                        title="Opções da página"
                      >
                        <MoreVertical className="w-3 h-3" />
                      </button>
                    </div>

                    {/* Popover Menu for Board */}
                    {boardMenuId === b.id && (
                      <div
                        onClick={e => e.stopPropagation()}
                        className="absolute right-0 top-full mt-1 z-30 w-36 bg-[#16161a] border border-zinc-700/80 rounded-xl shadow-xl p-1 text-xs space-y-0.5 animate-in fade-in duration-75"
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setEditingBoardId(b.id)
                            setEditingBoardName(b.name)
                            setBoardMenuId(null)
                          }}
                          className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-zinc-300 hover:bg-zinc-800 hover:text-white text-left cursor-pointer"
                        >
                          <Pencil className="w-3 h-3 text-zinc-400" />
                          <span>Renomear</span>
                        </button>

                        <div className="px-2 py-1 text-[10px] text-zinc-500 font-mono">Ícone:</div>
                        <div className="grid grid-cols-4 gap-1 p-1">
                          {BOARD_ICON_OPTIONS.map(ico => (
                            <button
                              type="button"
                              key={ico}
                              onClick={() => {
                                onChangeTaskBoardIcon?.(b.id, ico)
                                setBoardMenuId(null)
                              }}
                              className={`p-1 rounded flex items-center justify-center hover:bg-zinc-800 cursor-pointer ${b.icon === ico ? 'bg-zinc-800 text-white' : 'text-zinc-400'}`}
                            >
                              {renderBoardIcon(ico, "w-3 h-3")}
                            </button>
                          ))}
                        </div>

                        {b.id !== 'default' && (
                          <button
                            type="button"
                            onClick={() => {
                              setBoardToDelete(b)
                              setBoardMenuId(null)
                            }}
                            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-rose-400 hover:bg-rose-500/10 text-left cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>Excluir</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* PARTE 2: DOCUMENTOS */}
        <div className="space-y-1.5 pt-2">
          <div
            onDragOver={(e) => {
              if (canDropInto(draggedItem, '')) {
                e.preventDefault()
                e.stopPropagation()
                e.dataTransfer.dropEffect = 'move'
                if (dragOverTarget !== '') setDragOverTarget('')
              }
            }}
            onDragLeave={(e) => {
              if (e.currentTarget.contains(e.relatedTarget as Node)) return
              if (dragOverTarget === '') setDragOverTarget(null)
            }}
            onDrop={(e) => handleDrop(e, '')}
            className={`flex items-center justify-between px-2 py-1 text-[10px] font-semibold uppercase tracking-wider transition-all rounded-md ${
              dragOverTarget === ''
                ? 'ring-2 ring-[var(--accent)] bg-[var(--accent-glow-subtle)] text-[var(--accent)]'
                : 'text-zinc-500'
            }`}
          >
            <span>Documentos {dragOverTarget === '' && '· Raiz do cofre'}</span>
            {dragOverTarget === '' ? (
              <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold text-zinc-950 uppercase tracking-normal" style={{ backgroundColor: 'var(--accent)' }}>
                Mover para raiz
              </span>
            ) : (
              <span className="text-[9.5px] font-mono text-zinc-600">{notes.length}</span>
            )}
          </div>

          {/* Root Drop Banner when dragging non-root item */}
          {draggedItem && canDropInto(draggedItem, '') && (
            <div
              onDragOver={(e) => {
                e.preventDefault()
                e.stopPropagation()
                e.dataTransfer.dropEffect = 'move'
                if (dragOverTarget !== '') setDragOverTarget('')
              }}
              onDragLeave={(e) => {
                if (e.currentTarget.contains(e.relatedTarget as Node)) return
                if (dragOverTarget === '') setDragOverTarget(null)
              }}
              onDrop={(e) => handleDrop(e, '')}
              className={`my-1 px-3 py-2 border-2 border-dashed rounded-lg text-center text-xs font-medium transition-all cursor-copy ${
                dragOverTarget === ''
                  ? 'border-[var(--accent)] bg-[var(--accent-glow-subtle)] text-[var(--accent)] shadow-md scale-[1.01]'
                  : 'border-zinc-700/60 text-zinc-400 bg-zinc-900/30 hover:border-zinc-500 hover:text-zinc-200'
              }`}
            >
              <div className="flex items-center justify-center gap-1.5">
                <Folder className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
                <span>Mover para a raiz do cofre</span>
              </div>
            </div>
          )}

          {/* Favoritos (Star section) */}
          {favoriteNotes.length > 0 && (
          <div className="space-y-[1px]">
            <div className="px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wider flex items-center gap-1" style={{ color: 'var(--accent)' }}>
              <Star className="w-2.5 h-2.5" style={{ fill: 'var(--accent)', color: 'var(--accent)' }} />
              <span>Favoritos ({favoriteNotes.length})</span>
            </div>
            <div className="space-y-[1px]">
              {favoriteNotes.map(n => {
                const isActive = n.id === currentNoteId
                const isNoteDragged = draggedItem?.type === 'note' && draggedItem.note.id === n.id
                return (
                  <div
                    key={`fav-${n.id}`}
                    draggable={true}
                    onDragStart={(e) => handleNoteDragStart(e, n)}
                    onDragEnd={handleDragEnd}
                    onDragOver={(e) => handleNoteDragOver(e, n)}
                    onDragLeave={(e) => handleNoteDragLeave(e, n)}
                    onDrop={(e) => handleNoteDrop(e, n)}
                    onContextMenu={e => openContext(e, { note: n })}
                    onClick={() => onSelectNote(n.id)}
                    title={n.title}
                    className={`group flex items-center justify-between px-1.5 py-[3px] rounded-md text-[11.5px] cursor-pointer transition-colors border ${
                      isNoteDragged
                        ? 'opacity-40 scale-[0.98] border-dashed border-zinc-600'
                        : isActive
                        ? 'text-zinc-100 font-medium border-zinc-700/80 shadow-xs'
                        : 'border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
                    }`}
                    style={isActive && !isNoteDragged ? { backgroundColor: 'var(--accent-glow-subtle)', borderColor: 'var(--accent-glow)' } : undefined}
                  >
                    <div className="flex items-center gap-1.5 truncate min-w-0">
                      <Star className="w-3 h-3 shrink-0" style={{ fill: 'var(--accent)', color: 'var(--accent)' }} />
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
          {rootFolderNodes.map(node => renderFolderNode(node))}
        </div>

        {/* Unassigned notes (without folder) */}
        {unassignedNotes.length > 0 && (
          <div className="pt-2 mt-1">
            <div
              onDragOver={(e) => {
                if (canDropInto(draggedItem, '')) {
                  e.preventDefault()
                  e.stopPropagation()
                  e.dataTransfer.dropEffect = 'move'
                  if (dragOverTarget !== '') setDragOverTarget('')
                }
              }}
              onDragLeave={(e) => {
                if (e.currentTarget.contains(e.relatedTarget as Node)) return
                if (dragOverTarget === '') setDragOverTarget(null)
              }}
              onDrop={(e) => handleDrop(e, '')}
              className={`px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wider rounded transition-colors ${
                dragOverTarget === '' ? 'text-[var(--accent)] bg-[var(--accent-glow-subtle)]' : 'text-zinc-500'
              }`}
            >
              Avulsas ({unassignedNotes.length})
            </div>
            <div className="space-y-[1px]">
              {unassignedNotes.map(note => {
                const isActive = note.id === currentNoteId
                const isDraw = note.type === 'draw'
                const isMindMap = note.type === 'mindmap'
                const isHtml = note.type === 'html'
                const NoteIcon = isMindMap ? Brain : isDraw ? Palette : isHtml ? CodeXml : FileText
                const isNoteDragged = draggedItem?.type === 'note' && draggedItem.note.id === note.id
                return (
                  <div
                    key={note.id}
                    draggable={true}
                    onDragStart={(e) => handleNoteDragStart(e, note)}
                    onDragEnd={handleDragEnd}
                    onDragOver={(e) => handleNoteDragOver(e, note)}
                    onDragLeave={(e) => handleNoteDragLeave(e, note)}
                    onDrop={(e) => handleNoteDrop(e, note)}
                    onContextMenu={e => openContext(e, { note })}
                    onClick={() => onSelectNote(note.id)}
                    title={`${note.title} (${isMindMap ? 'Mapa Mental' : isDraw ? 'Desenho / Draw' : isHtml ? 'Arquivo HTML' : 'Nota'})`}
                    className={`group flex items-center justify-between px-1.5 py-[3px] rounded-md text-[11.5px] cursor-pointer transition-colors border ${
                      isNoteDragged
                        ? 'opacity-40 scale-[0.98] border-dashed border-zinc-600'
                        : isActive
                        ? 'text-zinc-100 font-medium border-zinc-700/80 shadow-xs'
                        : 'border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
                    }`}
                    style={isActive && !isNoteDragged ? { backgroundColor: 'var(--accent-glow-subtle)', borderColor: 'var(--accent-glow)' } : undefined}
                  >
                    <div className="flex items-center gap-1.5 truncate min-w-0">
                      <NoteIcon
                        className="w-3.5 h-3.5 shrink-0"
                        style={
                          isHtml
                            ? { color: '#f97316' }
                            : (isActive || isDraw || isMindMap)
                            ? { color: 'var(--accent)' }
                            : { color: '#71717a' }
                        }
                      />
                      <span className="truncate">{note.title}</span>
                    </div>

                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <button
                        draggable={false}
                        onDragStart={e => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation()
                          onToggleFavorite(note.id)
                        }}
                        className="p-0.5 rounded hover:text-white"
                        title={note.isFavorite ? 'Remover dos favoritos' : 'Favoritar nota'}
                      >
                        <Star className="w-3 h-3" style={note.isFavorite ? { fill: 'var(--accent)', color: 'var(--accent)' } : { color: '#71717a' }} />
                      </button>
                      <button
                        draggable={false}
                        onDragStart={e => e.stopPropagation()}
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

        {/* Empty bottom area allows dropping into root */}
        <div
          onDragOver={(e) => {
            if (canDropInto(draggedItem, '')) {
              e.preventDefault()
              e.dataTransfer.dropEffect = 'move'
              if (dragOverTarget !== '') setDragOverTarget('')
            }
          }}
          onDragLeave={(e) => {
            if (e.currentTarget.contains(e.relatedTarget as Node)) return
            if (dragOverTarget === '') setDragOverTarget(null)
          }}
          onDrop={(e) => handleDrop(e, '')}
          className="min-h-[48px] flex-1"
        />
        </div>
      </div>

      {/* Resize Handle on Right Border */}
      <div
        onMouseDown={handleMouseDown}
        className={`absolute top-0 right-0 w-1.5 h-full cursor-col-resize hover:opacity-80 transition-colors z-20 ${
          isDragging ? 'bg-[var(--accent)]' : 'bg-transparent'
        }`}
        style={!isDragging ? { borderRight: '1px solid var(--accent-glow-subtle)' } : undefined}
        title="Arraste para ajustar a largura da barra lateral"
      />
      {/* Custom Modal for deleting a Task Board */}
      {boardToDelete && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-100">
          <div className="bg-[#16161a] border border-zinc-800/80 rounded-xl p-5 max-w-sm w-full shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 shrink-0">
                <Trash2 className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-semibold text-zinc-100 text-sm">Excluir página de tarefas?</h3>
                <p className="text-xs text-zinc-400 mt-0.5">As tarefas desta página não poderão ser recuperadas.</p>
              </div>
            </div>
            <p className="text-xs text-zinc-300 bg-[#121215] p-2.5 rounded-lg border border-zinc-800/60 truncate font-medium">
              "{boardToDelete.name}"
            </p>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setBoardToDelete(null)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  onDeleteTaskBoard?.(boardToDelete.id)
                  setBoardToDelete(null)
                }}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-rose-500/20 text-rose-300 border border-rose-500/30 hover:bg-rose-500/30 transition-colors cursor-pointer"
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
