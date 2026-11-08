import { SidebarMenu } from './SidebarMenu'
import type { SidebarAction } from './SidebarMenu'
import React, { useState, useRef, useEffect } from 'react'
import pyriteLogo from '../assets/icone_pyrite.png'
import type { Note, NoteType, ViewMode } from '../types'
import type { TaskBoard, TaskItem } from '../types/tasks'
import { renderDynamicIcon, IconPickerPopover } from './IconPickerPopover'
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
  Palette,
  CheckCircle2,
  MoreVertical,
  Pencil,
  Brain,
  CodeXml,
  RotateCw,
  FileInput
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
  onRefreshVault?: () => void
  onImportHtml?: (targetFolder?: string) => void
  onSelectTaskBoard?: (boardId: string) => void
  onCreateTaskBoard?: (name: string, icon?: string, category?: 'project' | 'item') => void
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
  return renderDynamicIcon(iconName, className, { color: 'var(--accent, #c59b27)' })
}

// Module-level drag tracker to guarantee persistence across React render frames
let activeDragItem: { type: 'note'; note: Note } | { type: 'folder'; fullPath: string } | null = null

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
  onRefreshVault,
  onImportHtml,
  onSelectTaskBoard,
  onCreateTaskBoard,
  onRenameTaskBoard,
  onChangeTaskBoardIcon,
  onDeleteTaskBoard,
  pendingTasksCount: _pendingTasksCount,
  isOpen,
  onManage
}) => {
  const [isSyncing, setIsSyncing] = useState(false)
  const [logoFailed, setLogoFailed] = useState(false)
  const handleSyncClick = async () => {
    if (!onRefreshVault || isSyncing) return
    setIsSyncing(true)
    try {
      await onRefreshVault()
    } finally {
      setTimeout(() => setIsSyncing(false), 500)
    }
  }
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
  const draggedItemRef = useRef<
    | { type: 'note'; note: Note }
    | { type: 'folder'; fullPath: string }
    | null
  >(null)
  const [dragOverTarget, setDragOverTarget] = useState<string | null>(null)
  const autoExpandTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const justDraggedRef = useRef(false)

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

  const normPath = (p?: string) => (p || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').trim()

  const isVaultRoot = (path?: string) => {
    if (!path) return true
    const clean = normPath(path).toLowerCase()
    return clean === '' || clean === 'início' || clean === 'inicio' || clean === 'sem pasta'
  }

  const canDropInto = (
    dragged: { type: 'note'; note: Note } | { type: 'folder'; fullPath: string } | null,
    targetFolder: string
  ): boolean => {
    const item = dragged || activeDragItem || draggedItemRef.current
    if (!item) return false
    const targetIsRoot = isVaultRoot(targetFolder)
    const normTarget = normPath(targetFolder)

    if (item.type === 'note') {
      const noteFolder = normPath(item.note.folder)
      const noteIsRoot = isVaultRoot(noteFolder)
      if (targetIsRoot && noteIsRoot) return false
      if (!targetIsRoot && noteFolder.toLowerCase() === normTarget.toLowerCase()) return false
      return true
    }

    if (item.type === 'folder') {
      const folderPath = normPath(item.fullPath)
      if (isVaultRoot(folderPath)) return false
      if (folderPath.toLowerCase() === normTarget.toLowerCase()) return false
      if (normTarget.toLowerCase().startsWith(folderPath.toLowerCase() + '/')) return false
      const lastSlash = folderPath.lastIndexOf('/')
      const currentParent = lastSlash === -1 ? '' : folderPath.substring(0, lastSlash)
      const parentIsRoot = isVaultRoot(currentParent)
      if (targetIsRoot && parentIsRoot) return false
      if (!targetIsRoot && currentParent.toLowerCase() === normTarget.toLowerCase()) return false
      return true
    }

    return false
  }

  const handleFolderDragStart = (e: React.DragEvent, fullPath: string) => {
    e.stopPropagation()
    const item = { type: 'folder' as const, fullPath }
    activeDragItem = item
    draggedItemRef.current = item
    try {
      e.dataTransfer.setData('text/plain', JSON.stringify(item))
      e.dataTransfer.setData('application/json', JSON.stringify(item))
    } catch {}
    e.dataTransfer.effectAllowed = 'copyMove'
    // Defer state update so Chromium doesn't cancel drag on DOM re-render
    setTimeout(() => {
      setDraggedItem(item)
    }, 0)
  }

  const handleNoteDragStart = (e: React.DragEvent, note: Note) => {
    e.stopPropagation()
    const item = { type: 'note' as const, note }
    activeDragItem = item
    draggedItemRef.current = item
    try {
      e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'note', id: note.id }))
      e.dataTransfer.setData('application/json', JSON.stringify({ type: 'note', id: note.id }))
    } catch {}
    e.dataTransfer.effectAllowed = 'copyMove'
    // Defer state update so Chromium doesn't cancel drag on DOM re-render
    setTimeout(() => {
      setDraggedItem(item)
    }, 0)
  }

  const handleDragEnd = () => {
    justDraggedRef.current = true
    setTimeout(() => {
      justDraggedRef.current = false
    }, 150)
    // Defer clearing so any concurrent drop handler finishes cleanly
    setTimeout(() => {
      activeDragItem = null
      draggedItemRef.current = null
      setDraggedItem(null)
      setDragOverTarget(null)
      clearAutoExpandTimer()
    }, 50)
  }

  const handleFolderDragEnter = (e: React.DragEvent, folderPath: string) => {
    const dragged = activeDragItem || draggedItemRef.current || draggedItem
    if (canDropInto(dragged, folderPath)) {
      e.preventDefault()
      e.stopPropagation()
    }
  }

  const handleFolderDragOver = (e: React.DragEvent, folderPath: string) => {
    const dragged = activeDragItem || draggedItemRef.current || draggedItem
    if (canDropInto(dragged, folderPath)) {
      e.preventDefault()
      e.stopPropagation()
      e.dataTransfer.dropEffect = 'move'
      const norm = normPath(folderPath)
      if (dragOverTarget !== norm) {
        setDragOverTarget(norm)
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
    const norm = normPath(folderPath)
    if (dragOverTarget === norm) {
      setDragOverTarget(null)
    }
    clearAutoExpandTimer()
  }

  const handleNoteDragEnter = (e: React.DragEvent, note: Note) => {
    const targetFolder = isVaultRoot(note.folder) ? '' : note.folder
    const dragged = activeDragItem || draggedItemRef.current || draggedItem
    if (canDropInto(dragged, targetFolder)) {
      e.preventDefault()
      e.stopPropagation()
    }
  }

  const handleNoteDragOver = (e: React.DragEvent, note: Note) => {
    const targetFolder = isVaultRoot(note.folder) ? '' : note.folder
    const dragged = activeDragItem || draggedItemRef.current || draggedItem
    if (canDropInto(dragged, targetFolder)) {
      e.preventDefault()
      e.stopPropagation()
      e.dataTransfer.dropEffect = 'move'
      const norm = normPath(targetFolder)
      if (dragOverTarget !== norm) {
        setDragOverTarget(norm)
      }
    }
  }

  const handleNoteDragLeave = (e: React.DragEvent, note: Note) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return
    const targetFolder = isVaultRoot(note.folder) ? '' : note.folder
    const norm = normPath(targetFolder)
    if (dragOverTarget === norm) {
      setDragOverTarget(null)
    }
  }

  const handleDrop = async (e: React.DragEvent, targetFolder: string) => {
    e.preventDefault()
    e.stopPropagation()
    clearAutoExpandTimer()

    let currentDrag = activeDragItem || draggedItemRef.current || draggedItem

    if (!currentDrag) {
      try {
        const raw = e.dataTransfer.getData('application/json') || e.dataTransfer.getData('text/plain')
        if (raw) {
          const parsed = JSON.parse(raw)
          if (parsed.type === 'folder' && parsed.fullPath) {
            currentDrag = { type: 'folder', fullPath: parsed.fullPath }
          } else if (parsed.type === 'note' && (parsed.id || parsed.note?.id)) {
            const noteId = parsed.id || parsed.note?.id
            const found = notes.find(n => n.id === noteId)
            if (found) currentDrag = { type: 'note', note: found }
          }
        }
      } catch {}
    }

    activeDragItem = null
    draggedItemRef.current = null
    setDraggedItem(null)
    setDragOverTarget(null)

    if (!currentDrag) return
    if (!canDropInto(currentDrag, targetFolder)) return

    const dest = isVaultRoot(targetFolder) ? '' : normPath(targetFolder)

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
  const [creatingBoardCategory, setCreatingBoardCategory] = useState<'project' | 'item'>('project')
  const [newBoardName, setNewBoardName] = useState('')
  const [newBoardIcon, setNewBoardIcon] = useState('CheckCircle2')
  const [editingBoardId, setEditingBoardId] = useState<string | null>(null)
  const [editingBoardName, setEditingBoardName] = useState('')
  const [boardMenuId, setBoardMenuId] = useState<string | null>(null)
  const [boardToDelete, setBoardToDelete] = useState<TaskBoard | null>(null)
  const [iconPickerBoardId, setIconPickerBoardId] = useState<string | null>(null)

  // Estados para recolher/expandir seções de Itens e Projetos
  const [isItemsCollapsed, setIsItemsCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('pyrite_sidebar_items_collapsed') === 'true'
    } catch {
      return false
    }
  })
  const [isProjectsCollapsed, setIsProjectsCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('pyrite_sidebar_projects_collapsed') === 'true'
    } catch {
      return false
    }
  })

  const toggleItemsCollapse = () => {
    setIsItemsCollapsed(prev => {
      const next = !prev
      try {
        localStorage.setItem('pyrite_sidebar_items_collapsed', String(next))
      } catch {}
      return next
    })
  }

  const toggleProjectsCollapse = () => {
    setIsProjectsCollapsed(prev => {
      const next = !prev
      try {
        localStorage.setItem('pyrite_sidebar_projects_collapsed', String(next))
      } catch {}
      return next
    })
  }

  const effectiveBoards: TaskBoard[] = taskBoards.length > 0
    ? taskBoards
    : [{ id: 'default', name: 'Geral', icon: 'CheckCircle2', createdAt: Date.now(), category: 'project' }]

  const projectBoards = effectiveBoards.filter(b => b.category !== 'item')
  const itemBoards = effectiveBoards.filter(b => b.category === 'item')

  // Resizable sidebar width with localStorage persistence
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('pyrite_sidebar_width') || localStorage.getItem('pyrita_sidebar_width')
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
        localStorage.setItem('pyrite_sidebar_width', String(finalWidth))
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
    const trimmed = newFolderName.trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
    if (trimmed) {
      const fullPath = parentForNewFolder ? `${parentForNewFolder}/${trimmed}` : trimmed
      onCreateFolder(fullPath)
      if (parentForNewFolder) {
        const parts = parentForNewFolder.split('/')
        const toExpand: Record<string, boolean> = {}
        let acc = ''
        for (const part of parts) {
          acc = acc ? `${acc}/${part}` : part
          toExpand[acc] = false
        }
        setCollapsedFolders(prev => ({ ...prev, ...toExpand }))
      }
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
      if (isVaultRoot(f)) continue
      const parts = normPath(f).split('/').filter(Boolean)
      let accumulated = ''
      for (const part of parts) {
        accumulated = accumulated ? `${accumulated}/${part}` : part
        allPathsSet.add(accumulated)
      }
    }

    // Also include any folders mentioned by notes
    for (const n of filteredNotes) {
      if (n.folder && !isVaultRoot(n.folder)) {
        const parts = normPath(n.folder).split('/').filter(Boolean)
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
      const nFolder = normPath(note.folder)
      if (nFolder && !isVaultRoot(nFolder) && nodeMap.has(nFolder)) {
        nodeMap.get(nFolder)!.notes.push(note)
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
  const unassignedNotes = filteredNotes.filter(n => isVaultRoot(n.folder))

  // Recursive Tree Node Renderer - High Density & Compact Indentation
  const renderFolderNode = (node: TreeNode, depth = 0) => {
    const isCollapsed = collapsedFolders[node.fullPath] ?? true
    const totalSubNotes = node.notes.length + node.children.reduce((acc, c) => acc + c.notes.length, 0)
    // Keep each nesting step aligned cleanly under the parent
    const indentPadding = 'ml-2.5 pl-1.5'
    const isBeingDragged =
      (draggedItem?.type === 'folder' && normPath(draggedItem.fullPath) === normPath(node.fullPath)) ||
      (draggedItemRef.current?.type === 'folder' && normPath(draggedItemRef.current.fullPath) === normPath(node.fullPath))
    const isTargetFolder = dragOverTarget !== null && dragOverTarget === normPath(node.fullPath)
    const isRootNode = isVaultRoot(node.fullPath)

    return (
      <div key={node.fullPath} className="space-y-[1px]">
        {/* Folder Header Row */}
        <div
          draggable={!isRootNode}
          onDragStart={(e) => handleFolderDragStart(e, node.fullPath)}
          onDragEnd={handleDragEnd}
          onDragEnter={(e) => handleFolderDragEnter(e, node.fullPath)}
          onDragOver={(e) => handleFolderDragOver(e, node.fullPath)}
          onDragLeave={(e) => handleFolderDragLeave(e, node.fullPath)}
          onDrop={(e) => handleDrop(e, node.fullPath)}
          onContextMenu={e => openContext(e, { folder: node.fullPath })}
          onClick={() => {
            if (justDraggedRef.current) return
            toggleFolder(node.fullPath)
          }}
          title={node.fullPath}
          className={`flex items-center justify-between ${depth === 0 ? 'px-2.5' : 'px-2'} py-1 rounded-lg text-[13px] font-medium group transition-colors cursor-pointer select-none ${
            isBeingDragged
              ? 'opacity-40 border border-dashed border-zinc-600'
              : isTargetFolder
              ? 'ring-2 ring-[var(--accent)] bg-[var(--accent-glow-subtle)] text-zinc-100 shadow-xs'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
          }`}
          style={{ WebkitUserDrag: !isRootNode ? 'element' : 'none' } as React.CSSProperties}
        >
          <div className="flex items-center gap-2 truncate min-w-0">
            {isCollapsed ? (
              <Folder className="w-4 h-4 opacity-80 shrink-0 folder-icon-common" style={isTargetFolder ? { color: 'var(--accent-icon, var(--accent))' } : undefined} />
            ) : (
              <FolderOpen className="w-4 h-4 shrink-0 folder-icon-common" style={isTargetFolder ? { color: 'var(--accent-icon, var(--accent))' } : undefined} />
            )}
            <span className="truncate">{node.name}</span>
          </div>

          {isTargetFolder ? (
            <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold text-zinc-950 shrink-0 shadow-xs animate-in fade-in duration-100 pointer-events-none select-none" style={{ backgroundColor: 'var(--accent)' }}>
              Mover para cá
            </span>
          ) : (
            <div className={`flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ${draggedItem ? 'pointer-events-none' : ''}`}>
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
              {onImportHtml && (
                <button
                  draggable={false}
                  onDragStart={e => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation()
                    onImportHtml(node.fullPath)
                  }}
                  className="p-0.5 hover:text-white rounded"
                  title={`Importar HTML para ${node.fullPath}`}
                >
                  <FileInput className="w-3 h-3 text-orange-400 hover:text-orange-300" />
                </button>
              )}
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
          <div
            onDragEnter={(e) => handleFolderDragEnter(e, node.fullPath)}
            onDragOver={(e) => handleFolderDragOver(e, node.fullPath)}
            onDragLeave={(e) => handleFolderDragLeave(e, node.fullPath)}
            onDrop={(e) => handleDrop(e, node.fullPath)}
            className={`relative ${indentPadding} border-l border-zinc-800/40 hover:border-zinc-700/60 transition-colors space-y-[1px] ${
              isTargetFolder ? 'bg-[var(--accent-glow-subtle)]/30 rounded-b-md' : ''
            }`}
          >
            {node.notes.length === 0 && node.children.length === 0 && (
              <div
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
              const isNoteDragged =
                (draggedItem?.type === 'note' && draggedItem.note.id === note.id) ||
                (draggedItemRef.current?.type === 'note' && draggedItemRef.current.note.id === note.id)
              return (
                <div
                  key={note.id}
                  draggable={true}
                  onDragStart={(e) => handleNoteDragStart(e, note)}
                  onDragEnd={handleDragEnd}
                  onDragEnter={(e) => handleNoteDragEnter(e, note)}
                  onDragOver={(e) => handleNoteDragOver(e, note)}
                  onDragLeave={(e) => handleNoteDragLeave(e, note)}
                  onDrop={(e) => handleNoteDrop(e, note)}
                  onContextMenu={e => openContext(e, { note })}
                  onClick={() => {
                    if (justDraggedRef.current) return
                    onSelectNote(note.id)
                  }}
                  title={`${note.title} (${isMindMap ? 'Mapa Mental' : isDraw ? 'Desenho / Draw' : isHtml ? 'Arquivo HTML' : 'Nota'})`}
                  className={`group flex items-center justify-between px-2 py-1 rounded-lg text-[13px] cursor-pointer transition-colors border select-none ${
                    isNoteDragged
                      ? 'opacity-40 border-dashed border-zinc-600'
                      : isActive
                      ? 'text-zinc-100 font-medium border-zinc-700/80 shadow-xs app-sidebar-note-active'
                      : 'border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
                  }`}
                  style={{
                    WebkitUserDrag: 'element',
                    ...(isActive && !isNoteDragged ? { backgroundColor: 'var(--accent-glow-subtle)', borderColor: 'var(--accent-glow)' } : {})
                  } as React.CSSProperties}
                >
                  <div className="flex items-center gap-2 truncate min-w-0">
                    <NoteIcon
                      className="w-4 h-4 shrink-0"
                      style={
                        isHtml
                          ? { color: '#f97316' }
                          : isActive
                          ? { color: 'var(--accent-icon, var(--accent))' }
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
            {node.children.map(child => renderFolderNode(child, depth + 1))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div
      style={{ width: `${sidebarWidth}px` }}
      className="app-sidebar app-no-drag relative my-2 bg-[#121215] rounded-r-2xl border-y border-r border-zinc-800 flex flex-col select-none shrink-0 text-xs overflow-hidden shadow-lg"
    >
      {/* 1. Vault Header */}
      <div className="app-sidebar-header p-2 border-b border-zinc-800/60 bg-[#0f0f12] flex items-center justify-between gap-1">
        <div
          onClick={onOpenVaultSwitcher || onOpenLocalFolder}
          className="flex items-center gap-2 truncate flex-1 min-w-0 p-1 -ml-0.5 rounded-lg hover:bg-zinc-800/60 cursor-pointer transition-colors group"
          title="Clique para alternar ou gerenciar cofres (Vault Switcher)"
        >
          {!logoFailed ? (
            <img
              src={pyriteLogo}
              alt="Pyrite"
              className="w-6 h-6 rounded-md object-contain shrink-0 drop-shadow-sm select-none"
              onError={() => setLogoFailed(true)}
            />
          ) : (
            <div
              className="w-6 h-6 rounded-lg flex items-center justify-center font-bold text-xs shadow-xs shrink-0"
              style={{
                backgroundColor: 'var(--accent-glow-subtle, rgba(197, 155, 39, 0.12))',
                color: 'var(--accent, #d4af37)'
              }}
            >
              Py
            </div>
          )}
          <div className="truncate flex-1 min-w-0">
            <div className="flex items-center gap-1">
              <span className="font-semibold text-zinc-100 text-xs tracking-wide truncate block group-hover:text-white transition-colors">
                {vaultPath ? vaultPath.split(/[/\\]/).filter(Boolean).pop() : 'Pyrite Vault'}
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
                  <FileText className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--accent)' }} />
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

                {onImportHtml && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsCreateMenuOpen(false)
                      onImportHtml()
                    }}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-zinc-200 hover:text-white hover:bg-zinc-800 transition-colors text-left cursor-pointer group"
                  >
                    <FileInput className="w-3.5 h-3.5 text-orange-400 shrink-0" />
                    <span className="font-medium text-xs">Importar Arquivo HTML...</span>
                  </button>
                )}

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

      {/* 2. Search Bar & Quick Tools */}
      <div className="p-2 flex items-center gap-1.5">
        <div className="relative flex-1 flex items-center">
          <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filtrar notas..."
            className="w-full pl-7 pr-2 py-1 bg-zinc-900/90 border border-zinc-800/80 rounded-md text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-[var(--accent)] transition-colors"
          />
        </div>

        {/* Sync/Refresh Vault (sem texto, just icon) */}
        {onRefreshVault && (
          <button
            type="button"
            onClick={handleSyncClick}
            disabled={isSyncing}
            className={`p-1.5 rounded-md border border-zinc-800/80 bg-zinc-900/90 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-all shrink-0 cursor-pointer ${isSyncing ? 'animate-spin text-[var(--accent)]' : ''}`}
            title="Sincronizar cofre e atualizar pastas"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>
        )}

        {/* Import HTML (sem texto, just icon) */}
        {onImportHtml && (
          <button
            type="button"
            onClick={() => onImportHtml()}
            className="p-1.5 rounded-md border border-zinc-800/80 bg-zinc-900/90 text-orange-400/90 hover:text-orange-400 hover:bg-orange-500/10 transition-all shrink-0 cursor-pointer"
            title="Importar arquivo HTML para o cofre"
          >
            <FileInput className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {folderFilter && <button className="px-3 py-1 text-left" style={{ color: 'var(--accent)' }} onClick={() => setFolderFilter(null)}>Pesquisa em {folderFilter} · Limpar ×</button>}
      {context && <SidebarMenu key={context.x + ':' + context.y + (context.note?.id || context.folder)} context={context} folders={folders} isVaultRoot={!!vaultPath && context.folder === 'Início'} onClose={() => setContext(null)} onAction={async (action, value) => {
        if (action === 'new-note') onCreateNote(context.folder, undefined, 'note')
        else if (action === 'new-draw') onCreateNote(context.folder, undefined, 'draw')
        else if (action === 'new-mindmap') onCreateNote(context.folder, undefined, 'mindmap')
        else if (action === 'new-html') onCreateNote(context.folder, undefined, 'html')
        else if (action === 'import-html') onImportHtml?.(context.folder)
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
        
        {/* PARTE 1: ITENS (Clientes, Conteúdo, etc.) */}
        <div className="space-y-1 pt-1 pb-1">
          <div className="flex items-center justify-between px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            <button
              type="button"
              onClick={toggleItemsCollapse}
              className="flex items-center gap-1.5 hover:text-zinc-300 transition-colors cursor-pointer select-none"
              title={isItemsCollapsed ? "Expandir Itens" : "Recolher Itens"}
            >
              <ChevronRight className={`w-3 h-3 transition-transform duration-150 ${!isItemsCollapsed ? 'rotate-90' : ''}`} />
              <span>Itens</span>
              {itemBoards.length > 0 && <span className="text-[9px] font-normal opacity-70">({itemBoards.length})</span>}
            </button>
            {onCreateTaskBoard && (
              <button
                type="button"
                onClick={() => {
                  setCreatingBoardCategory('item')
                  setNewBoardIcon('Folder')
                  setIsCreatingBoard(true)
                  if (isItemsCollapsed) setIsItemsCollapsed(false)
                }}
                className="p-0.5 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
                title="Novo Grupo de Itens (ex: Clientes, Produtos)"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {!isItemsCollapsed && (
            <>

          {/* Form to create new board in Itens */}
          {isCreatingBoard && creatingBoardCategory === 'item' && (
            <div className="p-2.5 bg-[#16161a] border border-zinc-700/60 rounded-xl space-y-2 mb-1.5 animate-in fade-in duration-100">
              <input
                type="text"
                autoFocus
                value={newBoardName}
                onChange={e => setNewBoardName(e.target.value)}
                placeholder="Nome do grupo (ex: Clientes)..."
                className="w-full bg-[#121215] border border-zinc-700 rounded-lg px-2 py-1 text-xs text-zinc-200 outline-none"
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    if (newBoardName.trim()) {
                      onCreateTaskBoard?.(newBoardName.trim(), newBoardIcon, 'item')
                      setNewBoardName('')
                      setIsCreatingBoard(false)
                    }
                  }
                  if (e.key === 'Escape') setIsCreatingBoard(false)
                }}
              />
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-zinc-400 font-mono">Ícone:</span>
                <button
                  type="button"
                  onClick={() => setIconPickerBoardId('__new_item_board__')}
                  className="text-[10px] text-[var(--accent,#c59b27)] hover:underline cursor-pointer"
                >
                  Mais...
                </button>
              </div>
              <div className="flex items-center gap-1 flex-wrap">
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
              {iconPickerBoardId === '__new_item_board__' && (
                <div className="relative">
                  <IconPickerPopover
                    selectedIcon={newBoardIcon}
                    onSelectIcon={ico => {
                      setNewBoardIcon(ico)
                      setIconPickerBoardId(null)
                    }}
                    onClose={() => setIconPickerBoardId(null)}
                    align="left"
                  />
                </div>
              )}
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
                      onCreateTaskBoard?.(newBoardName.trim(), newBoardIcon, 'item')
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

          {/* List item boards */}
          {itemBoards.length === 0 && !isCreatingBoard ? (
            <button
              type="button"
              onClick={() => {
                setCreatingBoardCategory('item')
                setNewBoardIcon('Folder')
                setIsCreatingBoard(true)
              }}
              className="w-full text-left px-2.5 py-1 text-[11px] text-zinc-500 hover:text-zinc-300 hover:bg-zinc-850/40 rounded-lg cursor-pointer flex items-center gap-1.5"
            >
              <Plus className="w-3 h-3 text-zinc-500" />
              <span>Adicionar grupo (ex: Clientes)</span>
            </button>
          ) : (
            itemBoards.map((b) => {
              const isBoardActive = currentView === 'tasks' && activeBoardId === b.id
              const boardPendingCount = tasks.filter(t => (t.boardId || 'default') === b.id && !t.completed).length
              const isEditing = editingBoardId === b.id

              return (
                <div key={b.id} className="group relative">
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
                      className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[13px] cursor-pointer transition-colors border ${
                        isBoardActive
                          ? 'text-zinc-100 font-medium border-zinc-700/80 shadow-xs'
                          : 'border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-zinc-850/50'
                      }`}
                      style={isBoardActive ? { backgroundColor: 'var(--accent-glow-subtle)', borderColor: 'var(--accent-glow)' } : undefined}
                    >
                      <div className="flex items-center gap-2 truncate min-w-0">
                        {renderBoardIcon(b.icon || "Folder", "w-4 h-4 shrink-0")}
                        <span className="truncate font-medium">{b.name}</span>
                      </div>

                      <div className="flex items-center gap-1">
                        {boardPendingCount > 0 && (
                          <span className="px-1.5 py-0.5 rounded-full text-[9.5px] font-mono bg-zinc-800 text-zinc-400 group-hover:text-zinc-200">
                            {boardPendingCount}
                          </span>
                        )}

                        <button
                          type="button"
                          onClick={e => {
                            e.stopPropagation()
                            setBoardMenuId(boardMenuId === b.id ? null : b.id)
                          }}
                          className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-opacity cursor-pointer"
                          title="Opções do grupo"
                        >
                          <MoreVertical className="w-3 h-3" />
                        </button>
                      </div>

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
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })
          )}
            </>
          )}
        </div>

        {/* PARTE 2: PROJETOS */}
        <div className="space-y-1 pt-1 pb-1">
          <div className="flex items-center justify-between px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            <button
              type="button"
              onClick={toggleProjectsCollapse}
              className="flex items-center gap-1.5 hover:text-zinc-300 transition-colors cursor-pointer select-none"
              title={isProjectsCollapsed ? "Expandir Projetos" : "Recolher Projetos"}
            >
              <ChevronRight className={`w-3 h-3 transition-transform duration-150 ${!isProjectsCollapsed ? 'rotate-90' : ''}`} />
              <span>Projetos</span>
              {projectBoards.length > 0 && <span className="text-[9px] font-normal opacity-70">({projectBoards.length})</span>}
            </button>
            {onCreateTaskBoard && (
              <button
                type="button"
                onClick={() => {
                  setCreatingBoardCategory('project')
                  setNewBoardIcon('CheckCircle2')
                  setIsCreatingBoard(true)
                  if (isProjectsCollapsed) setIsProjectsCollapsed(false)
                }}
                className="p-0.5 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
                title="Novo Projeto"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {!isProjectsCollapsed && (
            <>

          {/* Form to create new board in Projetos */}
          {isCreatingBoard && creatingBoardCategory === 'project' && (
            <div className="p-2.5 bg-[#16161a] border border-zinc-700/60 rounded-xl space-y-2 mb-1.5 animate-in fade-in duration-100">
              <input
                type="text"
                autoFocus
                value={newBoardName}
                onChange={e => setNewBoardName(e.target.value)}
                placeholder="Nome do projeto..."
                className="w-full bg-[#121215] border border-zinc-700 rounded-lg px-2 py-1 text-xs text-zinc-200 outline-none"
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    if (newBoardName.trim()) {
                      onCreateTaskBoard?.(newBoardName.trim(), newBoardIcon, 'project')
                      setNewBoardName('')
                      setIsCreatingBoard(false)
                    }
                  }
                  if (e.key === 'Escape') setIsCreatingBoard(false)
                }}
              />
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-zinc-400 font-mono">Ícone:</span>
                <button
                  type="button"
                  onClick={() => setIconPickerBoardId('__new_item_board__')}
                  className="text-[10px] text-[var(--accent,#c59b27)] hover:underline cursor-pointer"
                >
                  Mais...
                </button>
              </div>
              <div className="flex items-center gap-1 flex-wrap">
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
              {iconPickerBoardId === '__new_item_board__' && (
                <div className="relative">
                  <IconPickerPopover
                    selectedIcon={newBoardIcon}
                    onSelectIcon={ico => {
                      setNewBoardIcon(ico)
                      setIconPickerBoardId(null)
                    }}
                    onClose={() => setIconPickerBoardId(null)}
                    align="left"
                  />
                </div>
              )}
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
                      onCreateTaskBoard?.(newBoardName.trim(), newBoardIcon, 'project')
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

          {/* List project boards */}
          {projectBoards.map((b) => {
            const isBoardActive = currentView === 'tasks' && activeBoardId === b.id
            const boardPendingCount = tasks.filter(t => (t.boardId || 'default') === b.id && !t.completed).length
            const isEditing = editingBoardId === b.id

            return (
              <div key={b.id} className="group relative">
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
                    className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[13px] cursor-pointer transition-colors border ${
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

                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation()
                          setBoardMenuId(boardMenuId === b.id ? null : b.id)
                        }}
                        className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-opacity cursor-pointer"
                        title="Opções do projeto"
                      >
                        <MoreVertical className="w-3 h-3" />
                      </button>
                    </div>

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

                        <div className="flex items-center justify-between px-2 py-1 text-[10px] text-zinc-500 font-mono">
                          <span>Ícone:</span>
                          <button
                            type="button"
                            onClick={e => {
                              e.stopPropagation()
                              setIconPickerBoardId(b.id)
                            }}
                            className="text-[10px] text-[var(--accent,#c59b27)] hover:underline cursor-pointer"
                          >
                            Mais ícones...
                          </button>
                        </div>
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

                        {iconPickerBoardId === b.id && (
                          <div className="relative">
                            <IconPickerPopover
                              selectedIcon={b.icon}
                              onSelectIcon={ico => {
                                onChangeTaskBoardIcon?.(b.id, ico)
                                setIconPickerBoardId(null)
                                setBoardMenuId(null)
                              }}
                              onClose={() => setIconPickerBoardId(null)}
                              align="left"
                            />
                          </div>
                        )}

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
            </>
          )}
        </div>

        {/* PARTE 2: DOCUMENTOS */}
        <div className="space-y-1.5 pt-2">
          <div
            onDragEnter={(e) => {
              if (canDropInto(activeDragItem || draggedItemRef.current || draggedItem, '')) {
                e.preventDefault()
                e.stopPropagation()
              }
            }}
            onDragOver={(e) => {
              if (canDropInto(activeDragItem || draggedItemRef.current || draggedItem, '')) {
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
            className={`flex items-center justify-between px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider transition-all rounded-md ${
              dragOverTarget === ''
                ? 'ring-2 ring-[var(--accent)] bg-[var(--accent-glow-subtle)] text-[var(--accent)]'
                : 'text-zinc-500'
            }`}
          >
            <div className="flex items-center gap-2">
              <Folder className="w-4 h-4 text-[var(--accent)]" />
              <span>Documentos {dragOverTarget === '' && '· Raiz do cofre'}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  handleStartCreateFolder()
                }}
                className="p-0.5 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
                title="Criar nova pasta na raiz do cofre"
              >
                <Plus className="w-3.5 h-3.5 text-[var(--accent)]" />
              </button>
              {dragOverTarget === '' ? (
                <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold text-zinc-950 uppercase tracking-normal" style={{ backgroundColor: 'var(--accent)' }}>
                  Mover para raiz
                </span>
              ) : (
                <span className="text-[9.5px] font-mono text-zinc-600">{notes.length}</span>
              )}
            </div>
          </div>

          {/* Form to create folder when triggered at root */}
          {isCreatingFolder && !parentForNewFolder && (
            <form onSubmit={handleCreateFolderSubmit} className="mx-1 my-1 px-2.5 py-1.5 flex items-center gap-2 bg-[#16161d] border border-zinc-700/80 rounded-lg shadow-sm">
              <Folder className="w-4 h-4 text-[var(--accent)] shrink-0" />
              <input
                type="text"
                autoFocus
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="Nome da pasta na raiz..."
                className="flex-1 bg-transparent text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none"
              />
              <button type="submit" className="px-1.5 py-0.5 hover:bg-zinc-800 text-[var(--accent)] rounded text-xs font-semibold cursor-pointer">✓</button>
              <button type="button" onClick={() => setIsCreatingFolder(false)} className="px-1.5 py-0.5 hover:bg-zinc-800 text-zinc-400 rounded text-xs cursor-pointer">✕</button>
            </form>
          )}

          {/* Root Drop Banner when dragging non-root item */}
          {canDropInto(activeDragItem || draggedItemRef.current || draggedItem, '') && (
            <div
              onDragEnter={(e) => {
                e.preventDefault()
                e.stopPropagation()
              }}
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
              <div className="flex items-center justify-center gap-1.5 pointer-events-none">
                <Folder className="w-4 h-4" style={{ color: 'var(--accent)' }} />
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
                const isNoteDragged =
                  (draggedItem?.type === 'note' && draggedItem.note.id === n.id) ||
                  (draggedItemRef.current?.type === 'note' && draggedItemRef.current.note.id === n.id)
                return (
                  <div
                    key={`fav-${n.id}`}
                    draggable={true}
                    onDragStart={(e) => handleNoteDragStart(e, n)}
                    onDragEnd={handleDragEnd}
                    onDragEnter={(e) => handleNoteDragEnter(e, n)}
                    onDragOver={(e) => handleNoteDragOver(e, n)}
                    onDragLeave={(e) => handleNoteDragLeave(e, n)}
                    onDrop={(e) => handleNoteDrop(e, n)}
                    onContextMenu={e => openContext(e, { note: n })}
                    onClick={() => {
                      if (justDraggedRef.current) return
                      onSelectNote(n.id)
                    }}
                    title={n.title}
                    className={`group flex items-center justify-between px-2.5 py-1 rounded-lg text-[13px] cursor-pointer transition-colors border select-none ${
                      isNoteDragged
                        ? 'opacity-40 border-dashed border-zinc-600'
                        : isActive
                        ? 'text-zinc-100 font-medium border-zinc-700/80 shadow-xs app-sidebar-note-active'
                        : 'border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
                    }`}
                    style={{
                      WebkitUserDrag: 'element',
                      ...(isActive && !isNoteDragged ? { backgroundColor: 'var(--accent-glow-subtle)', borderColor: 'var(--accent-glow)' } : {})
                    } as React.CSSProperties}
                  >
                    <div className="flex items-center gap-2 truncate min-w-0">
                      <Star className="w-4 h-4 shrink-0" style={{ fill: 'var(--accent-icon, var(--accent))', color: 'var(--accent-icon, var(--accent))' }} />
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
          <div className="pt-2 mt-1">
            <div
              onDragEnter={(e) => {
                if (canDropInto(activeDragItem || draggedItemRef.current || draggedItem, '')) {
                  e.preventDefault()
                  e.stopPropagation()
                }
              }}
              onDragOver={(e) => {
                if (canDropInto(activeDragItem || draggedItemRef.current || draggedItem, '')) {
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
                const isNoteDragged =
                  (draggedItem?.type === 'note' && draggedItem.note.id === note.id) ||
                  (draggedItemRef.current?.type === 'note' && draggedItemRef.current.note.id === note.id)
                return (
                  <div
                    key={note.id}
                    draggable={true}
                    onDragStart={(e) => handleNoteDragStart(e, note)}
                    onDragEnd={handleDragEnd}
                    onDragEnter={(e) => handleNoteDragEnter(e, note)}
                    onDragOver={(e) => handleNoteDragOver(e, note)}
                    onDragLeave={(e) => handleNoteDragLeave(e, note)}
                    onDrop={(e) => handleNoteDrop(e, note)}
                    onContextMenu={e => openContext(e, { note })}
                    onClick={() => {
                      if (justDraggedRef.current) return
                      onSelectNote(note.id)
                    }}
                    title={`${note.title} (${isMindMap ? 'Mapa Mental' : isDraw ? 'Desenho / Draw' : isHtml ? 'Arquivo HTML' : 'Nota'})`}
                    className={`group flex items-center justify-between px-2.5 py-1 rounded-lg text-[13px] cursor-pointer transition-colors border select-none ${
                      isNoteDragged
                        ? 'opacity-40 border-dashed border-zinc-600'
                        : isActive
                        ? 'text-zinc-100 font-medium border-zinc-700/80 shadow-xs app-sidebar-note-active'
                        : 'border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
                    }`}
                    style={{
                      WebkitUserDrag: 'element',
                      ...(isActive && !isNoteDragged ? { backgroundColor: 'var(--accent-glow-subtle)', borderColor: 'var(--accent-glow)' } : {})
                    } as React.CSSProperties}
                  >
                    <div className="flex items-center gap-2 truncate min-w-0">
                      <NoteIcon
                        className="w-4 h-4 shrink-0"
                        style={
                          isHtml
                            ? { color: '#f97316' }
                            : isActive
                            ? { color: 'var(--accent-icon, var(--accent))' }
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
          onDragEnter={(e) => {
            if (canDropInto(activeDragItem || draggedItemRef.current || draggedItem, '')) {
              e.preventDefault()
              e.stopPropagation()
            }
          }}
          onDragOver={(e) => {
            if (canDropInto(activeDragItem || draggedItemRef.current || draggedItem, '')) {
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
