import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Note } from '../types'
import type {
  ComputedNode,
  MindMapBoundary,
  MindMapDocument,
  MindMapLayout,
  MindMapLineStyle,
  MindMapNode,
  MindMapPaletteId,
  MindMapRelation,
  MindMapShape,
  MindMapStylePreset
} from '../types/mindmap'
import {
  MINDMAP_PALETTES,
  MINDMAP_THEMES,
  addNode,
  addSiblingNode,
  applyMapStylePreset,
  calculateMindMapLayout,
  deleteNode,
  exportToMarkdown,
  parseMindMapDocument,
  resetNodePositions,
  serializeMindMapDocument,
  toggleCollapse,
  updateNode
} from '../utils/mindMapUtils'
import { CustomColorPickerPopover } from './CustomColorPickerPopover'
import {
  AlertCircle,
  Bold,
  Check,
  ChevronsDownUp,
  Download,
  FileText,
  Flag,
  Focus,
  Folder,
  HelpCircle,
  Hexagon,
  Italic,
  Layers,
  Lightbulb,
  Minus,
  Palette,
  Plus,
  Redo2,
  Rocket,
  Search,
  Share2,
  Sliders,
  Sparkles,
  Star,
  Trash2,
  Underline,
  Undo2,
  X,
  ZoomIn,
  ZoomOut
} from 'lucide-react'

function isColorLight(hex?: string): boolean {
  if (!hex || hex === 'transparent') return false
  const clean = hex.replace('#', '')
  if (clean.length < 6) return false
  const r = parseInt(clean.slice(0, 2), 16)
  const g = parseInt(clean.slice(2, 4), 16)
  const b = parseInt(clean.slice(4, 6), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.65
}

interface MindMapEditorProps {
  note: Note
  onUpdateNote: (updatedNote: Note) => void
}

const SHAPES: { id: MindMapShape; label: string }[] = [
  { id: 'rounded', label: 'Arredondado' },
  { id: 'capsule', label: 'Cápsula' },
  { id: 'rectangle', label: 'Retângulo' },
  { id: 'oval', label: 'Oval' },
  { id: 'cloud', label: 'Nuvem' },
  { id: 'diamond', label: 'Losango' },
  { id: 'hexagon', label: 'Hexágono' },
  { id: 'underline', label: 'Linha / Sublinhado' }
]

const CANVAS_BG_OPTIONS = [
  { id: '#09090b', label: 'Dark Grafite', isLight: false },
  { id: '#0f172a', label: 'Slate Azulado', isLight: false },
  { id: '#1e293b', label: 'Cinza Escuro', isLight: false },
  { id: '#f4f4f5', label: 'Cinza Claro', isLight: true },
  { id: '#ffffff', label: 'Branco Puro', isLight: true }
]

const ICON_PRESETS: { id: string; label: string; icon: React.ReactNode; color: string }[] = [
  { id: 'check', label: 'Concluído', icon: <Check className="w-3.5 h-3.5" />, color: '#10b981' },
  { id: 'star', label: 'Destaque', icon: <Star className="w-3.5 h-3.5 fill-current" />, color: '#f59e0b' },
  { id: 'flag', label: 'Prioridade', icon: <Flag className="w-3.5 h-3.5 fill-current" />, color: '#ef4444' },
  { id: 'bulb', label: 'Ideia', icon: <Lightbulb className="w-3.5 h-3.5 fill-current" />, color: '#eab308' },
  { id: 'alert', label: 'Atenção', icon: <AlertCircle className="w-3.5 h-3.5" />, color: '#f97316' },
  { id: 'rocket', label: 'Ação / Sprint', icon: <Rocket className="w-3.5 h-3.5" />, color: '#8b5cf6' },
  { id: 'help', label: 'Dúvida', icon: <HelpCircle className="w-3.5 h-3.5" />, color: '#06b6d4' }
]

// In-memory cache to preserve viewport across tab switches while the note tab is still open
export const mindMapViewportCache = new Map<string, { panX: number; panY: number; zoom: number }>()

export const MindMapEditor: React.FC<MindMapEditorProps> = ({
  note,
  onUpdateNote
}) => {
  const containerRef = useRef<HTMLDivElement>(null)

  // Document state
  const [doc, setDoc] = useState<MindMapDocument>(() =>
    parseMindMapDocument(note.content, note.title)
  )
  const docRef = useRef(doc)
  docRef.current = doc

  // History for Undo/Redo
  const historyRef = useRef<MindMapDocument[]>([doc])
  const historyIndexRef = useRef(0)

  // Selection & Editing (Supports Ctrl/Cmd Multi-selection)
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([])
  const selectedNodeId = selectedNodeIds[selectedNodeIds.length - 1] || null
  const setSelectedNodeId = useCallback((id: string | null) => {
    setSelectedNodeIds(id ? [id] : [])
  }, [])
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null)
  const [editingText, setEditingText] = useState('')

  // Node Dragging state
  const draggingNodeId = useRef<string | null>(null)
  const nodeDragStartMouse = useRef({ x: 0, y: 0 })
  const nodeDragStartNodePos = useRef({ x: 0, y: 0 })
  const hasDraggedNode = useRef(false)

  // Relationship creation mode
  const [connectingFromId, setConnectingFromId] = useState<string | null>(null)

  // Active Popovers
  const [activePopover, setActivePopover] = useState<
    'color' | 'shape' | 'icons' | 'canvasBgPicker' | 'export' | null
  >(null)
  const [activeSideDrawer, setActiveSideDrawer] = useState<'note' | null>(null)
  const colorBtnRef = useRef<HTMLButtonElement>(null)
  const canvasBgBtnRef = useRef<HTMLButtonElement>(null)

  // Floating Settings Dropdown Menu (Consolidates Layout, Style, Lines, Palette, Canvas Bg)
  const [showSettingsMenu, setShowSettingsMenu] = useState(false)
  const [settingsTab, setSettingsTab] = useState<'layout' | 'colors' | 'canvas'>('layout')
  const settingsBtnRef = useRef<HTMLButtonElement>(null)

  // Recent Colors queue (max 4 colors)
  const [recentColors, setRecentColors] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('pyrite_mindmap_recent_colors') || localStorage.getItem('pyrita_mindmap_recent_colors')
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed) && parsed.length > 0) return parsed.slice(0, 4)
      }
    } catch {}
    return ['#c59b27', '#2563eb', '#10b981', '#ea580c']
  })

  const pushRecentColor = useCallback((color: string) => {
    if (!color || color === 'transparent') return
    setRecentColors(prev => {
      const next = [color, ...prev.filter(c => c.toLowerCase() !== color.toLowerCase())].slice(0, 4)
      try {
        localStorage.setItem('pyrite_mindmap_recent_colors', JSON.stringify(next))
      } catch {}
      return next
    })
  }, [])

  // Custom Palette creation state
  const [isCreatingPalette, setIsCreatingPalette] = useState(false)
  const [newPaletteName, setNewPaletteName] = useState('')
  const [newPaletteColors, setNewPaletteColors] = useState<string[]>([
    '#f43f5e',
    '#8b5cf6',
    '#06b6d4',
    '#10b981',
    '#f59e0b'
  ])

  // Close active popover / settings menu on outside click or Escape
  useEffect(() => {
    if (!activePopover && !showSettingsMenu) return
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (target.closest && target.closest('[data-color-picker-portal="true"]')) return
      if (!target.closest || (!target.closest('.mindmap-popover-anchor') && !target.closest('.mindmap-settings-anchor'))) {
        setActivePopover(null)
        setShowSettingsMenu(false)
        setIsCreatingPalette(false)
      }
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActivePopover(null)
        setShowSettingsMenu(false)
        setIsCreatingPalette(false)
      }
    }
    document.addEventListener('mousedown', handleOutsideClick)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [activePopover, showSettingsMenu])

  // Search filter
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearchOpen, setIsSearchOpen] = useState(false)

  // Minimap
  const [showMinimap, setShowMinimap] = useState(true)

  // Check if we have a cached viewport from before switching tabs
  const cachedViewport = mindMapViewportCache.get(note.id)

  // Viewport (Pan & Zoom) - restore immediately if cached so tab switches stay exactly where the user was!
  // If not cached (e.g. app startup), calculate initial centered viewport from window dimensions so it NEVER opens off-center at (0, 0)!
  const [viewport, setViewportState] = useState<{ panX: number; panY: number; zoom: number }>(() => {
    if (cachedViewport) return cachedViewport
    try {
      const initialLayout = calculateMindMapLayout(doc)
      const bounds = initialLayout.bounds
      const mapWidth = Math.max(80, bounds.maxX - bounds.minX)
      const mapHeight = Math.max(80, bounds.maxY - bounds.minY)
      const estWidth = typeof window !== 'undefined' ? Math.max(400, window.innerWidth - 240) : 1000
      const estHeight = typeof window !== 'undefined' ? Math.max(300, window.innerHeight - 50) : 700
      const scaleX = (estWidth - 100) / mapWidth
      const scaleY = (estHeight - 100) / mapHeight
      const targetZoom = Math.max(0.35, Math.min(1.15, Math.min(scaleX, scaleY)))
      const centerX = (bounds.minX + bounds.maxX) / 2
      const centerY = (bounds.minY + bounds.maxY) / 2
      const initialVp = {
        zoom: targetZoom,
        panX: estWidth / 2 - centerX * targetZoom,
        panY: estHeight / 2 - centerY * targetZoom
      }
      mindMapViewportCache.set(note.id, initialVp)
      return initialVp
    } catch {
      return { panX: 0, panY: 0, zoom: 1 }
    }
  })

  // Synchronize viewport changes to the in-memory cache so switching tabs preserves position
  const setViewport = useCallback(
    (updater: React.SetStateAction<{ panX: number; panY: number; zoom: number }>) => {
      setViewportState(prev => {
        const next = typeof updater === 'function' ? updater(prev) : updater
        mindMapViewportCache.set(note.id, next)
        return next
      })
    },
    [note.id]
  )
  const isDraggingCanvas = useRef(false)
  const dragStartPos = useRef({ x: 0, y: 0 })
  const initialPan = useRef({ panX: 0, panY: 0 })

  // Current Theme definition
  const currentTheme = MINDMAP_THEMES[doc.theme] || MINDMAP_THEMES['pyrite-classic']
  const currentCanvasBg = doc.canvasBg || currentTheme.bg || '#0f172a'
  const isCanvasLight = currentCanvasBg === '#ffffff' || currentCanvasBg === '#f4f4f5'

  // Synchronization with external changes (e.g. AI Assistant or file reload)
  const lastExternalContentRef = useRef<string>(note.content)

  useEffect(() => {
    if (note.content !== lastExternalContentRef.current) {
      lastExternalContentRef.current = note.content
      const updatedDoc = parseMindMapDocument(note.content, note.title)
      setDoc(updatedDoc)
      historyRef.current = [JSON.parse(JSON.stringify(updatedDoc))]
      historyIndexRef.current = 0
    }
  }, [note.content, note.title])

  // Auto-save debounced
  const saveTimeoutRef = useRef<number | null>(null)
  const scheduleSave = useCallback(
    (newDoc: MindMapDocument) => {
      if (saveTimeoutRef.current) window.clearTimeout(saveTimeoutRef.current)
      saveTimeoutRef.current = window.setTimeout(() => {
        const serialized = serializeMindMapDocument(newDoc)
        lastExternalContentRef.current = serialized
        onUpdateNote({
          ...note,
          content: serialized,
          updatedAt: Date.now()
        })
      }, 400)
    },
    [note, onUpdateNote]
  )

  // Push to history
  const commitDoc = useCallback(
    (newDoc: MindMapDocument) => {
      setDoc(newDoc)
      scheduleSave(newDoc)

      const nextHistory = historyRef.current.slice(0, historyIndexRef.current + 1)
      nextHistory.push(JSON.parse(JSON.stringify(newDoc)))
      if (nextHistory.length > 50) nextHistory.shift()
      historyRef.current = nextHistory
      historyIndexRef.current = nextHistory.length - 1
    },
    [scheduleSave]
  )

  const handleUndo = useCallback(() => {
    if (historyIndexRef.current > 0) {
      historyIndexRef.current--
      const prevDoc = JSON.parse(JSON.stringify(historyRef.current[historyIndexRef.current]))
      setDoc(prevDoc)
      scheduleSave(prevDoc)
    }
  }, [scheduleSave])

  const handleRedo = useCallback(() => {
    if (historyIndexRef.current < historyRef.current.length - 1) {
      historyIndexRef.current++
      const nextDoc = JSON.parse(JSON.stringify(historyRef.current[historyIndexRef.current]))
      setDoc(nextDoc)
      scheduleSave(nextDoc)
    }
  }, [scheduleSave])

  // Calculate layout
  const layoutResult = useMemo(() => {
    return calculateMindMapLayout(doc)
  }, [doc])

  // Center on node or fit view
  const centerOnContainer = useCallback(
    (customBounds?: { minX: number; maxX: number; minY: number; maxY: number }) => {
      if (!containerRef.current) return false
      const rect = containerRef.current.getBoundingClientRect()
      if (rect.width < 50 || rect.height < 50) return false

      const bounds = customBounds || layoutResult.bounds
      const mapWidth = Math.max(80, bounds.maxX - bounds.minX)
      const mapHeight = Math.max(80, bounds.maxY - bounds.minY)

      const scaleX = (rect.width - 100) / mapWidth
      const scaleY = (rect.height - 100) / mapHeight
      const targetZoom = Math.max(0.35, Math.min(1.15, Math.min(scaleX, scaleY)))

      const centerX = (bounds.minX + bounds.maxX) / 2
      const centerY = (bounds.minY + bounds.maxY) / 2

      const newViewport = {
        zoom: targetZoom,
        panX: rect.width / 2 - centerX * targetZoom,
        panY: rect.height / 2 - centerY * targetZoom
      }
      setViewport(newViewport)
      return true
    },
    [layoutResult, setViewport]
  )

  const fitView = useCallback(
    (customBounds?: { minX: number; maxX: number; minY: number; maxY: number } | unknown) => {
      const hasBounds = customBounds && typeof customBounds === 'object' && 'minX' in customBounds
      const bounds = hasBounds
        ? (customBounds as { minX: number; maxX: number; minY: number; maxY: number })
        : layoutResult.bounds
      centerOnContainer(bounds)
    },
    [centerOnContainer, layoutResult.bounds]
  )

  // Track if this note has been refined to actual container bounds
  const hasRefinedContainerRef = useRef<string | null>(cachedViewport ? note.id : null)

  useLayoutEffect(() => {
    // If switching back to an already open mind map tab, keep the position where the user was!
    if (hasRefinedContainerRef.current === note.id) return

    // If container already has real dimensions, refine centering to exact pixel bounds
    if (centerOnContainer()) {
      hasRefinedContainerRef.current = note.id
      return
    }

    // Otherwise (e.g. app startup before layout pass), observe container resize or retry
    let attempts = 0
    let timerId: number

    const tryRefine = () => {
      attempts++
      if (centerOnContainer()) {
        hasRefinedContainerRef.current = note.id
        return
      }
      if (attempts < 20) {
        timerId = window.setTimeout(tryRefine, 50)
      }
    }

    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        if (entry.contentRect.width > 50 && entry.contentRect.height > 50) {
          if (hasRefinedContainerRef.current !== note.id) {
            if (centerOnContainer()) {
              hasRefinedContainerRef.current = note.id
            }
          }
        }
      }
    })

    if (containerRef.current) {
      observer.observe(containerRef.current)
    }

    timerId = window.setTimeout(tryRefine, 30)

    return () => {
      observer.disconnect()
      window.clearTimeout(timerId)
    }
  }, [note.id, centerOnContainer])

  // Check if any node with children is currently collapsed
  const hasAnyCollapsed = useMemo(() => {
    return Object.entries(doc.nodes).some(([id, n]) => {
      const isRoot = id === doc.rootId || !n.parentId
      return (isRoot && !!n.collapsed) || (!isRoot && n.children && n.children.length > 0 && !!n.collapsed)
    })
  }, [doc.nodes, doc.rootId])

  // Toggle expand / collapse all nodes in the mind map
  // When collapsing: do NOT collapse root node. Keep root node and all 1st-stage (level 1) nodes visible,
  // while collapsing all branches from level 1 down so their badges (+N) are shown (matching user reference).
  const handleToggleExpandCollapseAll = useCallback(() => {
    const nodesWithChildren = Object.values(doc.nodes).filter(n => n.children && n.children.length > 0)
    if (nodesWithChildren.length === 0) return

    const shouldCollapse = !hasAnyCollapsed

    const nextNodes: Record<string, MindMapNode> = {}
    for (const [id, node] of Object.entries(doc.nodes)) {
      if (node.children && node.children.length > 0) {
        const isRoot = id === doc.rootId || !node.parentId
        nextNodes[id] = { ...node, collapsed: shouldCollapse ? (isRoot ? false : true) : false }
      } else {
        nextNodes[id] = node
      }
    }

    const nextDoc: MindMapDocument = {
      ...doc,
      nodes: nextNodes
    }
    commitDoc(nextDoc)

    // Synchronously compute the exact layout of the new state and center the view!
    const nextLayout = calculateMindMapLayout(nextDoc)
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0) {
        const { minX, maxX, minY, maxY } = nextLayout.bounds
        const mapWidth = Math.max(80, maxX - minX)
        const mapHeight = Math.max(80, maxY - minY)
        const scaleX = (rect.width - 100) / mapWidth
        const scaleY = (rect.height - 100) / mapHeight

        // When collapsing, keep a comfortable readable zoom (0.85 to 1.1) so it doesn't zoom out into the distance!
        // When expanding, fit all branches comfortably into view.
        const targetZoom = shouldCollapse
          ? Math.max(0.85, Math.min(1.10, Math.min(scaleX, scaleY)))
          : Math.max(0.35, Math.min(1.10, Math.min(scaleX, scaleY)))

        const centerX = (minX + maxX) / 2
        const centerY = (minY + maxY) / 2

        const newViewport = {
          zoom: targetZoom,
          panX: rect.width / 2 - centerX * targetZoom,
          panY: rect.height / 2 - centerY * targetZoom
        }
        setViewport(newViewport)
      }
    }
  }, [doc, hasAnyCollapsed, commitDoc, setViewport])

  // Node editing handlers
  const startEditing = useCallback(
    (nodeId: string) => {
      const target = doc.nodes[nodeId]
      if (!target) return
      setEditingNodeId(nodeId)
      setEditingText(target.title)
      setActivePopover(null)
      setShowSettingsMenu(false)
    },
    [doc.nodes]
  )

  const finishEditing = useCallback(() => {
    if (editingNodeId && editingText.trim()) {
      const updated = updateNode(docRef.current, editingNodeId, {
        title: editingText.trim()
      })
      commitDoc(updated)
    }
    setEditingNodeId(null)
  }, [editingNodeId, editingText, commitDoc])

  // Add child
  const handleAddChild = useCallback(
    (targetParentId?: string) => {
      const pId = targetParentId || selectedNodeId || doc.rootId
      const { updatedDoc, newId } = addNode(doc, pId, 'Novo Tópico')
      commitDoc(updatedDoc)
      setSelectedNodeId(newId)
      startEditing(newId)
    },
    [doc, selectedNodeId, commitDoc, startEditing]
  )

  // Add sibling
  const handleAddSibling = useCallback(
    (targetSiblingId?: string) => {
      const sId = targetSiblingId || selectedNodeId
      if (!sId || sId === doc.rootId) {
        handleAddChild(doc.rootId)
        return
      }
      const { updatedDoc, newId } = addSiblingNode(doc, sId, 'Novo Tópico')
      commitDoc(updatedDoc)
      setSelectedNodeId(newId)
      startEditing(newId)
    },
    [doc, selectedNodeId, handleAddChild, commitDoc, startEditing]
  )

  // Delete node(s) - Supports mass deletion with multiple selected nodes
  const handleDeleteSelected = useCallback(() => {
    if (selectedNodeIds.length > 1) {
      let nextDoc = doc
      const toDelete = selectedNodeIds.filter(id => id !== doc.rootId)
      if (toDelete.length === 0) return
      toDelete.forEach(id => {
        if (nextDoc.nodes[id]) {
          nextDoc = deleteNode(nextDoc, id)
        }
      })
      commitDoc(nextDoc)
      setSelectedNodeIds([])
      setActivePopover(null)
      return
    }

    if (!selectedNodeId || selectedNodeId === doc.rootId) return
    const parentId = doc.nodes[selectedNodeId]?.parentId
    const nextDoc = deleteNode(doc, selectedNodeId)
    commitDoc(nextDoc)
    setSelectedNodeId(parentId || doc.rootId)
    setActivePopover(null)
  }, [doc, selectedNodeIds, selectedNodeId, commitDoc, setSelectedNodeId])

  // Reset all custom positions (Reorganizar)
  const handleResetPositions = useCallback(() => {
    const cleaned = resetNodePositions(doc)
    commitDoc(cleaned)
  }, [doc, commitDoc])

  // Delete custom palette
  const handleDeleteCustomPalette = useCallback(
    (paletteId: string) => {
      const nextPalettes = { ...(doc.customPalettes || {}) }
      delete nextPalettes[paletteId]
      const fallbackPalette = doc.paletteId === paletteId ? 'rainbow' : doc.paletteId
      commitDoc({
        ...doc,
        paletteId: fallbackPalette,
        customPalettes: nextPalettes
      })
    },
    [doc, commitDoc]
  )

  // Keyboard navigation & shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const targetTag = (e.target as HTMLElement)?.tagName?.toLowerCase()
      const isInput = targetTag === 'input' || targetTag === 'textarea'

      if (isInput && editingNodeId) {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault()
          finishEditing()
        } else if (e.key === 'Escape') {
          e.preventDefault()
          setEditingNodeId(null)
        }
        return
      }

      if (isInput) return

      if (e.key === 'Tab') {
        e.preventDefault()
        handleAddChild()
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (e.shiftKey) {
          if (selectedNodeId && selectedNodeId !== doc.rootId) {
            const { updatedDoc, newId } = addSiblingNode(doc, selectedNodeId, 'Novo Tópico', true)
            commitDoc(updatedDoc)
            setSelectedNodeId(newId)
            startEditing(newId)
          }
        } else {
          handleAddSibling()
        }
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        handleDeleteSelected()
      } else if (e.key === ' ' || e.key === 'F2') {
        e.preventDefault()
        if (selectedNodeId) startEditing(selectedNodeId)
      } else if (e.key === 'Escape') {
        e.preventDefault()
        setActivePopover(null)
        setShowSettingsMenu(false)
        setIsCreatingPalette(false)
        setConnectingFromId(null)
        setEditingNodeId(null)
        setSelectedNodeId(null)
        setActiveSideDrawer(null)
      } else if (e.ctrlKey || e.metaKey) {
        if (e.key === 'z') {
          e.preventDefault()
          if (e.shiftKey) handleRedo()
          else handleUndo()
        } else if (e.key === 'y') {
          e.preventDefault()
          handleRedo()
        } else if (e.key === 'f') {
          e.preventDefault()
          setIsSearchOpen(prev => !prev)
        }
      } else if (e.key.startsWith('Arrow') && selectedNodeId) {
        const currentCN = layoutResult.nodes.find(n => n.id === selectedNodeId)
        if (!currentCN) return

        let bestCandidate: ComputedNode | null = null
        let minDistance = Infinity

        layoutResult.nodes.forEach(cn => {
          if (cn.id === selectedNodeId) return

          const dx = cn.x - currentCN.x
          const dy = cn.y - currentCN.y

          let isCorrectDirection = false
          if (e.key === 'ArrowRight' && dx > 20) isCorrectDirection = true
          if (e.key === 'ArrowLeft' && dx < -20) isCorrectDirection = true
          if (e.key === 'ArrowDown' && dy > 15) isCorrectDirection = true
          if (e.key === 'ArrowUp' && dy < -15) isCorrectDirection = true

          if (isCorrectDirection) {
            const dist = Math.hypot(dx, dy)
            if (dist < minDistance) {
              minDistance = dist
              bestCandidate = cn
            }
          }
        })

        if (bestCandidate) {
          e.preventDefault()
          setSelectedNodeId((bestCandidate as ComputedNode).id)
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    editingNodeId,
    finishEditing,
    handleAddChild,
    handleAddSibling,
    handleDeleteSelected,
    selectedNodeId,
    doc,
    commitDoc,
    startEditing,
    handleUndo,
    handleRedo,
    layoutResult
  ])

  // Mouse Canvas Interaction (Pan & Click-away dismiss)
  const handleMouseDownCanvas = (e: React.MouseEvent) => {
    // If clicking on node or controls, do not pan
    if ((e.target as HTMLElement).closest('.mindmap-interactive-node')) return
    if ((e.target as HTMLElement).closest('.mindmap-interactive-control')) return
    if ((e.target as HTMLElement).closest('.mindmap-popover-anchor')) return
    if ((e.target as HTMLElement).closest('.mindmap-settings-anchor')) return
    if ((e.target as HTMLElement).closest('header, footer, button, input, textarea')) return

    // Dismiss active selections & popovers when clicking empty canvas
    setSelectedNodeId(null)
    setActivePopover(null)
    setShowSettingsMenu(false)
    setIsCreatingPalette(false)
    setActiveSideDrawer(null)
    setEditingNodeId(null)
    setConnectingFromId(null)

    isDraggingCanvas.current = true
    dragStartPos.current = { x: e.clientX, y: e.clientY }
    initialPan.current = { panX: viewport.panX, panY: viewport.panY }
  }

  const handleMouseMoveCanvas = (e: React.MouseEvent) => {
    // If dragging a specific node freely
    if (draggingNodeId.current) {
      hasDraggedNode.current = true
      const dx = (e.clientX - nodeDragStartMouse.current.x) / viewport.zoom
      const dy = (e.clientY - nodeDragStartMouse.current.y) / viewport.zoom

      const newX = Math.round(nodeDragStartNodePos.current.x + dx)
      const newY = Math.round(nodeDragStartNodePos.current.y + dy)

      setDoc(prev => ({
        ...prev,
        nodes: {
          ...prev.nodes,
          [draggingNodeId.current!]: {
            ...prev.nodes[draggingNodeId.current!],
            customX: newX,
            customY: newY
          }
        }
      }))
      return
    }

    // Canvas panning
    if (!isDraggingCanvas.current) return
    const dx = e.clientX - dragStartPos.current.x
    const dy = e.clientY - dragStartPos.current.y
    setViewport(prev => ({
      ...prev,
      panX: initialPan.current.panX + dx,
      panY: initialPan.current.panY + dy
    }))
  }

  const handleMouseUpCanvas = () => {
    if (draggingNodeId.current) {
      if (hasDraggedNode.current) {
        commitDoc(docRef.current)
      }
      draggingNodeId.current = null
      hasDraggedNode.current = false
    }
    isDraggingCanvas.current = false
  }

  // Wheel zoom
  const handleWheel = (e: React.WheelEvent) => {
    if (!containerRef.current) return
    e.preventDefault()

    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9
    const newZoom = Math.max(0.2, Math.min(2.5, viewport.zoom * zoomFactor))

    const rect = containerRef.current.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top

    const newPanX = mouseX - (mouseX - viewport.panX) * (newZoom / viewport.zoom)
    const newPanY = mouseY - (mouseY - viewport.panY) * (newZoom / viewport.zoom)

    setViewport({
      zoom: newZoom,
      panX: newPanX,
      panY: newPanY
    })
  }

  // Start dragging node (only for non-root nodes!)
  const handleNodeMouseDown = (cn: ComputedNode, e: React.MouseEvent) => {
    // If holding Ctrl or Cmd, do not start drag so multi-selection click works cleanly
    if (e.ctrlKey || e.metaKey) return
    // Do not initiate drag if root node (root is fixed!)
    if (cn.id === doc.rootId) return
    if ((e.target as HTMLElement).closest('button') || (e.target as HTMLElement).closest('input')) return

    e.stopPropagation()
    draggingNodeId.current = cn.id
    hasDraggedNode.current = false
    nodeDragStartMouse.current = { x: e.clientX, y: e.clientY }
    nodeDragStartNodePos.current = { x: cn.x, y: cn.y }
  }

  // Node click handler (Supports Ctrl/Cmd Multi-Selection)
  const handleNodeClick = (nodeId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (hasDraggedNode.current) return

    if (connectingFromId) {
      if (connectingFromId !== nodeId) {
        const newRel: MindMapRelation = {
          id: 'rel_' + crypto.randomUUID().slice(0, 8),
          fromId: connectingFromId,
          toId: nodeId,
          color: '#38bdf8',
          lineStyle: 'dashed',
          arrowEnd: true
        }
        commitDoc({
          ...doc,
          relations: [...(doc.relations || []), newRel]
        })
      }
      setConnectingFromId(null)
      return
    }

    if (e.ctrlKey || e.metaKey) {
      setSelectedNodeIds(prev =>
        prev.includes(nodeId) ? prev.filter(id => id !== nodeId) : [...prev, nodeId]
      )
    } else {
      setSelectedNodeIds([nodeId])
    }
    setActivePopover(null)
  }

  // Toggle boundary around selected node's branch
  const handleToggleBoundary = (nodeId: string) => {
    const existing = doc.boundaries?.find(b => b.rootNodeId === nodeId)
    if (existing) {
      commitDoc({
        ...doc,
        boundaries: doc.boundaries.filter(b => b.id !== existing.id)
      })
    } else {
      const newBoundary: MindMapBoundary = {
        id: 'boundary_' + crypto.randomUUID().slice(0, 8),
        rootNodeId: nodeId,
        label: 'Grupo: ' + (doc.nodes[nodeId]?.title || 'Tópico'),
        fillColor: 'rgba(197, 155, 39, 0.08)',
        strokeColor: '#c59b27',
        shape: 'rounded'
      }
      commitDoc({
        ...doc,
        boundaries: [...(doc.boundaries || []), newBoundary]
      })
    }
  }

  // Toggle node icon
  const handleToggleIcon = (nodeId: string, iconId: string) => {
    const target = doc.nodes[nodeId]
    if (!target) return
    const currentIcons = target.icons || []
    const nextIcons = currentIcons.includes(iconId)
      ? currentIcons.filter(i => i !== iconId)
      : [...currentIcons, iconId]

    commitDoc(updateNode(doc, nodeId, { icons: nextIcons }))
  }

  // Export handlers
  const handleExportMarkdown = () => {
    const md = exportToMarkdown(doc)
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${note.title || 'mapa-mental'}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleExportJSON = () => {
    const json = serializeMindMapDocument(doc)
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${note.title || 'mapa-mental'}.mindmap.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleExportSVG = () => {
    const svgEl = containerRef.current?.querySelector('svg.mindmap-svg-canvas')
    if (!svgEl) return
    const serializer = new XMLSerializer()
    const source = serializer.serializeToString(svgEl)
    const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${note.title || 'mapa-mental'}.svg`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Find currently selected node in computed layout
  const selectedComputed = useMemo(() => {
    if (!selectedNodeId) return null
    return layoutResult.nodes.find(n => n.id === selectedNodeId) || null
  }, [selectedNodeId, layoutResult.nodes])

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMoveCanvas}
      onMouseUp={handleMouseUpCanvas}
      style={{
        backgroundColor: currentCanvasBg
      }}
      className="relative w-full h-full overflow-hidden select-none font-sans text-zinc-100 flex flex-col"
    >
      {/* 1. TOP HEADER TOOLBAR (Styled in Pyrite Dark/Gold Design System) */}
      <header
        onMouseDown={e => e.stopPropagation()}
        className="mindmap-interactive-control z-40 h-10 px-3 bg-[#0c0c0e]/95 backdrop-blur-md border-b border-zinc-800/80 flex items-center justify-between shrink-0 text-xs shadow-xs"
      >
        {/* Left: Folder & Title */}
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex items-center gap-1.5 text-zinc-400 font-medium truncate">
            <Folder className="w-3.5 h-3.5 text-[var(--accent,#c59b27)] shrink-0" />
            <span className="truncate max-w-[130px]" title={note.folder}>
              {note.folder || 'Início'}
            </span>
            <span className="text-zinc-600">/</span>
            <span className="font-semibold text-zinc-100 truncate max-w-[180px]">
              {note.title || 'Mapa Mental'}
            </span>
          </div>
        </div>

        {/* Center / Action: Aparência & Configurações do Mapa (Menu estilo Grafo, sem escurecer a tela) */}
        <div className="relative mindmap-settings-anchor">
          <button
            ref={settingsBtnRef}
            onClick={() => {
              setActivePopover(null)
              setShowSettingsMenu(prev => !prev)
            }}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-all cursor-pointer font-medium text-xs ${
              showSettingsMenu
                ? 'bg-[var(--accent,#c59b27)] text-zinc-950 font-bold shadow-xs'
                : 'bg-[#18181e] hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800'
            }`}
            title="Aparência e Layout do Mapa"
          >
            <Sliders className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Aparência</span>
          </button>

          {/* Floating Settings Dropdown Menu (Anchored below button, NO black backdrop) */}
          {showSettingsMenu && (
            <div
              onMouseDown={e => e.stopPropagation()}
              className="mindmap-settings-popup absolute top-9 left-1/2 -translate-x-1/2 sm:left-0 sm:translate-x-0 w-80 max-h-[82vh] overflow-y-auto bg-[#121216]/98 backdrop-blur-2xl border border-zinc-700/80 rounded-2xl shadow-2xl p-3 text-xs text-zinc-300 space-y-3 z-50 animate-in fade-in zoom-in-95 duration-150"
            >
              {/* Header with Title and Close Button */}
              <div className="flex items-center justify-between border-b border-zinc-800/90 pb-2">
                <span className="font-bold text-zinc-100 flex items-center gap-1.5 font-mono text-[11px] tracking-wide uppercase">
                  <Sliders className="w-3.5 h-3.5 text-[var(--accent,#c59b27)]" />
                  Aparência do Mapa
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setShowSettingsMenu(false)
                    setIsCreatingPalette(false)
                  }}
                  className="p-1 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/80 cursor-pointer transition-colors"
                  title="Fechar"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Segmented Tab Switcher */}
              <div className="grid grid-cols-3 gap-1 p-0.5 bg-[#0a0a0d] border border-zinc-800/80 rounded-xl text-[11px]">
                <button
                  type="button"
                  onClick={() => setSettingsTab('layout')}
                  className={`py-1 rounded-lg font-medium transition-all cursor-pointer text-center ${
                    settingsTab === 'layout'
                      ? 'bg-[#1e1e26] text-[var(--accent,#c59b27)] font-semibold shadow-xs'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  Estrutura
                </button>
                <button
                  type="button"
                  onClick={() => setSettingsTab('colors')}
                  className={`py-1 rounded-lg font-medium transition-all cursor-pointer text-center ${
                    settingsTab === 'colors'
                      ? 'bg-[#1e1e26] text-[var(--accent,#c59b27)] font-semibold shadow-xs'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  Cores
                </button>
                <button
                  type="button"
                  onClick={() => setSettingsTab('canvas')}
                  className={`py-1 rounded-lg font-medium transition-all cursor-pointer text-center ${
                    settingsTab === 'canvas'
                      ? 'bg-[#1e1e26] text-[var(--accent,#c59b27)] font-semibold shadow-xs'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  Fundo
                </button>
              </div>

              {/* TAB 1: ESTRUTURA (Layout, Linhas & Estilos) */}
              {settingsTab === 'layout' && (
                <div className="space-y-3">
                  {/* Layout do Mapa */}
                  <div>
                    <div className="text-[10px] uppercase font-bold text-zinc-400 mb-1.5 flex items-center justify-between">
                      <span>Layout do Mapa</span>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {[
                        { id: 'radial', label: 'Mind Map (Radial)' },
                        { id: 'right', label: 'Árvore à Direita' },
                        { id: 'left', label: 'Árvore à Esquerda' },
                        { id: 'org-chart', label: 'Organograma' }
                      ].map(l => (
                        <button
                          key={l.id}
                          type="button"
                          onClick={() => {
                            const cleaned = resetNodePositions(doc)
                            commitDoc({ ...cleaned, layout: l.id as MindMapLayout })
                          }}
                          className={`p-2 rounded-xl border text-left cursor-pointer transition-all ${
                            doc.layout === l.id
                              ? 'bg-[#1e1e26] border-[var(--accent,#c59b27)]/80 text-[var(--accent,#c59b27)] font-semibold shadow-xs'
                              : 'bg-[#141418] border-zinc-800 text-zinc-300 hover:bg-zinc-800/60 hover:border-zinc-700'
                          }`}
                        >
                          <div className="flex items-center justify-between text-xs">
                            <span className="truncate">{l.label}</span>
                            {doc.layout === l.id && <Check className="w-3.5 h-3.5 shrink-0" />}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Estilo de Linhas & Ramos */}
                  <div>
                    <div className="text-[10px] uppercase font-bold text-zinc-400 mb-1.5">Conexões & Linhas</div>
                    <div className="space-y-1">
                      {[
                        { id: 'tapered', label: 'Ramo Orgânico (Afunilado)' },
                        { id: 'curved', label: 'Curva Suave (Bézier)' },
                        { id: 'rounded-elbow', label: 'Cotovelo / Ortogonal' }
                      ].map(line => (
                        <button
                          key={line.id}
                          type="button"
                          onClick={() => {
                            const nextNodes = { ...doc.nodes }
                            for (const id in nextNodes) {
                              if (nextNodes[id].branchStyle) {
                                nextNodes[id] = { ...nextNodes[id], branchStyle: undefined }
                              }
                            }
                            commitDoc({ ...doc, lineStyle: line.id as MindMapLineStyle, nodes: nextNodes })
                          }}
                          className={`w-full text-left px-2.5 py-1.5 rounded-lg flex items-center justify-between text-xs cursor-pointer border transition-colors ${
                            doc.lineStyle === line.id
                              ? 'bg-[#1e1e26] border-[var(--accent,#c59b27)]/80 text-[var(--accent,#c59b27)] font-semibold'
                              : 'bg-[#141418] border-zinc-800 text-zinc-300 hover:bg-zinc-800/60'
                          }`}
                        >
                          <span>{line.label}</span>
                          {doc.lineStyle === line.id && <Check className="w-3.5 h-3.5" />}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Estilos Visuais (Presets Prontos) */}
                  <div>
                    <div className="text-[10px] uppercase font-bold text-zinc-400 mb-1.5 flex items-center gap-1">
                      <Sparkles className="w-3 h-3 text-[var(--accent,#c59b27)]" />
                      <span>Estilo Visual Rápido</span>
                    </div>
                    <div className="space-y-1">
                      {[
                        { id: 'organic-branch', label: 'Orgânico (Galhos & Linhas)' },
                        { id: 'modern-cards', label: 'Cartões Modernos' },
                        { id: 'pills', label: 'Pílulas & Cápsulas' },
                        { id: 'technical', label: 'Técnico / Ortogonal' },
                        { id: 'minimal-lines', label: 'Minimalista (Linhas)' }
                      ].map(s => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => commitDoc(applyMapStylePreset(doc, s.id as MindMapStylePreset))}
                          className={`w-full text-left px-2.5 py-1.5 rounded-lg flex items-center justify-between text-xs cursor-pointer border transition-colors ${
                            doc.mapStyle === s.id
                              ? 'bg-[#1e1e26] border-[var(--accent,#c59b27)]/80 text-[var(--accent,#c59b27)] font-semibold'
                              : 'bg-[#141418] border-zinc-800 text-zinc-300 hover:bg-zinc-800/60'
                          }`}
                        >
                          <span>{s.label}</span>
                          {doc.mapStyle === s.id && <Check className="w-3.5 h-3.5" />}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: CORES & PALETAS */}
              {settingsTab === 'colors' && (
                <div className="space-y-2.5">
                  {isCreatingPalette ? (
                    <div className="space-y-2 p-1 bg-[#141418] border border-zinc-800 rounded-xl p-2.5">
                      <div className="flex items-center justify-between pb-1 border-b border-zinc-800">
                        <span className="text-xs font-semibold text-zinc-100">Criar Grupo de Cores</span>
                        <button
                          type="button"
                          onClick={() => setIsCreatingPalette(false)}
                          className="text-zinc-500 hover:text-zinc-300 p-0.5 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div>
                        <label className="text-[10px] text-zinc-400 block mb-1">Nome do Grupo</label>
                        <input
                          type="text"
                          value={newPaletteName}
                          onChange={e => setNewPaletteName(e.target.value)}
                          placeholder="Ex: Minha Marca"
                          className="w-full bg-[#18181e] border border-zinc-700 rounded-lg px-2.5 py-1 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-hidden focus:border-[var(--accent,#c59b27)]"
                          autoFocus
                        />
                      </div>

                      <div>
                        <label className="text-[10px] text-zinc-400 block mb-1">Cores dos Ramos (5 cores)</label>
                        <div className="flex items-center justify-between gap-1">
                          {newPaletteColors.map((color, idx) => (
                            <div key={idx} className="relative">
                              <input
                                type="color"
                                value={color}
                                onChange={e => {
                                  const next = [...newPaletteColors]
                                  next[idx] = e.target.value
                                  setNewPaletteColors(next)
                                }}
                                className="w-8 h-8 rounded-lg border border-zinc-700 bg-transparent cursor-pointer p-0 block hover:scale-105 transition-transform"
                                title={`Cor ${idx + 1}: ${color}`}
                              />
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="flex items-center justify-end gap-1.5 pt-2 border-t border-zinc-800">
                        <button
                          type="button"
                          onClick={() => setIsCreatingPalette(false)}
                          className="px-2 py-1 text-xs text-zinc-400 hover:text-zinc-200 cursor-pointer rounded"
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const id = 'custom_' + Date.now()
                            const customPalettes = {
                              ...(doc.customPalettes || {}),
                              [id]: {
                                name: newPaletteName.trim() || 'Grupo Personalizado',
                                colors: newPaletteColors
                              }
                            }
                            const nextNodes = { ...doc.nodes }
                            for (const nid in nextNodes) {
                              if (nid !== doc.rootId && nextNodes[nid].branchColor) {
                                nextNodes[nid] = { ...nextNodes[nid], branchColor: undefined }
                              }
                            }
                            commitDoc({
                              ...doc,
                              paletteId: id,
                              customPalettes,
                              nodes: nextNodes
                            })
                            setIsCreatingPalette(false)
                          }}
                          className="px-2.5 py-1 text-xs bg-[var(--accent,#c59b27)] text-black font-semibold rounded-lg hover:brightness-110 cursor-pointer shadow-xs"
                        >
                          Salvar Grupo
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* Distribuição da Cor */}
                      <div className="px-2.5 py-1.5 bg-[#141418] border border-zinc-800 rounded-xl space-y-1">
                        <span className="text-[10px] text-zinc-400 font-medium block">Distribuição da Cor</span>
                        <div className="grid grid-cols-2 gap-1">
                          <button
                            type="button"
                            onClick={() => commitDoc({ ...doc, colorDistribution: 'hierarchy' })}
                            className={`px-2 py-1 rounded-lg text-[11px] font-medium transition-colors cursor-pointer text-center ${
                              doc.colorDistribution !== 'branch'
                                ? 'bg-[var(--accent,#c59b27)] text-black font-semibold shadow-xs'
                                : 'bg-zinc-800/80 text-zinc-300 hover:text-white'
                            }`}
                          >
                            Por Nível (Etapa)
                          </button>
                          <button
                            type="button"
                            onClick={() => commitDoc({ ...doc, colorDistribution: 'branch' })}
                            className={`px-2 py-1 rounded-lg text-[11px] font-medium transition-colors cursor-pointer text-center ${
                              doc.colorDistribution === 'branch'
                                ? 'bg-[var(--accent,#c59b27)] text-black font-semibold shadow-xs'
                                : 'bg-zinc-800/80 text-zinc-300 hover:text-white'
                            }`}
                          >
                            Por Ramo
                          </button>
                        </div>
                      </div>

                      {/* Toggle: Colorir fundo dos nós com a cor do ramo */}
                      <div className="flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-[#141418] border border-zinc-800">
                        <div className="flex items-center gap-1.5">
                          <Palette className="w-3.5 h-3.5 text-[var(--accent,#c59b27)]" />
                          <span className="text-[11px] font-medium text-zinc-200">Colorir fundo dos cartões</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => commitDoc({ ...doc, colorizeNodeBg: !doc.colorizeNodeBg })}
                          className={`w-7 h-4 rounded-full transition-colors relative cursor-pointer ${
                            doc.colorizeNodeBg ? 'bg-[var(--accent,#c59b27)]' : 'bg-zinc-700'
                          }`}
                          title={doc.colorizeNodeBg ? 'Desativar preenchimento dos nós' : 'Ativar preenchimento dos nós'}
                        >
                          <span
                            className={`w-3 h-3 rounded-full bg-white absolute top-0.5 transition-transform ${
                              doc.colorizeNodeBg ? 'right-0.5' : 'left-0.5'
                            }`}
                          />
                        </button>
                      </div>

                      {/* Paletas Padrão */}
                      <div className="space-y-1">
                        <div className="text-[10px] uppercase font-bold text-zinc-500 px-1 pt-1">Paletas Prontas</div>
                        {Object.entries(MINDMAP_PALETTES).map(([pId, p]) => (
                          <button
                            key={pId}
                            type="button"
                            onClick={() => {
                              const nextNodes = { ...doc.nodes }
                              for (const id in nextNodes) {
                                if (id !== doc.rootId && nextNodes[id].branchColor) {
                                  nextNodes[id] = { ...nextNodes[id], branchColor: undefined }
                                }
                              }
                              commitDoc({ ...doc, paletteId: pId as MindMapPaletteId, nodes: nextNodes })
                            }}
                            className={`w-full text-left px-2.5 py-1.5 rounded-lg flex items-center justify-between text-xs cursor-pointer border transition-colors ${
                              (doc.paletteId || 'rainbow') === pId
                                ? 'bg-[#1e1e26] border-[var(--accent,#c59b27)]/80 text-[var(--accent,#c59b27)] font-medium'
                                : 'bg-[#141418] border-zinc-800 text-zinc-300 hover:bg-zinc-800/60'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <div className="flex gap-0.5">
                                {p.colors.slice(0, 4).map((c, i) => (
                                  <span key={i} className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c }} />
                                ))}
                              </div>
                              <span>{p.name}</span>
                            </div>
                            {(doc.paletteId || 'rainbow') === pId && <Check className="w-3.5 h-3.5" />}
                          </button>
                        ))}
                      </div>

                      {/* Custom Palettes (if any) */}
                      {doc.customPalettes && Object.keys(doc.customPalettes).length > 0 && (
                        <div className="space-y-1 pt-1">
                          <div className="text-[10px] uppercase font-bold text-zinc-500 px-1 pt-1 border-t border-zinc-800/80">
                            Grupos Personalizados
                          </div>
                          {Object.entries(doc.customPalettes).map(([pId, p]) => (
                            <div
                              key={pId}
                              className={`w-full px-2.5 py-1.5 rounded-lg flex items-center justify-between text-xs border ${
                                doc.paletteId === pId
                                  ? 'bg-[#1e1e26] border-[var(--accent,#c59b27)]/80 text-[var(--accent,#c59b27)] font-medium'
                                  : 'bg-[#141418] border-zinc-800 text-zinc-300 hover:bg-zinc-800/60'
                              }`}
                            >
                              <button
                                type="button"
                                onClick={() => {
                                  const nextNodes = { ...doc.nodes }
                                  for (const id in nextNodes) {
                                    if (id !== doc.rootId && nextNodes[id].branchColor) {
                                      nextNodes[id] = { ...nextNodes[id], branchColor: undefined }
                                    }
                                  }
                                  commitDoc({ ...doc, paletteId: pId as MindMapPaletteId, nodes: nextNodes })
                                }}
                                className="flex items-center gap-2 flex-1 text-left cursor-pointer min-w-0"
                              >
                                <div className="flex gap-0.5 shrink-0">
                                  {p.colors.slice(0, 4).map((c, i) => (
                                    <span key={i} className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c }} />
                                  ))}
                                </div>
                                <span className="truncate">{p.name}</span>
                              </button>
                              <div className="flex items-center gap-1 shrink-0">
                                {doc.paletteId === pId && <Check className="w-3.5 h-3.5 mr-1" />}
                                <button
                                  type="button"
                                  onClick={e => {
                                    e.stopPropagation()
                                    handleDeleteCustomPalette(pId)
                                  }}
                                  className="p-1 text-zinc-500 hover:text-red-400 cursor-pointer"
                                  title="Excluir Grupo"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Criar Grupo de Cores button */}
                      <button
                        type="button"
                        onClick={() => {
                          setNewPaletteName(`Paleta ${(Object.keys(doc.customPalettes || {}).length || 0) + 1}`)
                          setNewPaletteColors(['#f43f5e', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b'])
                          setIsCreatingPalette(true)
                        }}
                        className="w-full mt-1 px-2.5 py-1.5 rounded-lg border border-dashed border-zinc-700 hover:border-[var(--accent,#c59b27)] text-zinc-300 hover:text-[var(--accent,#c59b27)] flex items-center justify-center gap-1.5 text-xs transition-colors cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Criar Grupo de Cores</span>
                      </button>
                    </>
                  )}
                </div>
              )}

              {/* TAB 3: FUNDO DA TELA */}
              {settingsTab === 'canvas' && (
                <div className="space-y-2.5">
                  <div className="text-[10px] uppercase font-bold text-zinc-400 px-1">Cores Prontas do Fundo</div>
                  <div className="space-y-1">
                    {CANVAS_BG_OPTIONS.map(opt => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => commitDoc({ ...doc, canvasBg: opt.id })}
                        className={`w-full text-left px-2.5 py-2 rounded-lg flex items-center justify-between text-xs cursor-pointer border transition-colors ${
                          currentCanvasBg === opt.id
                            ? 'bg-[#1e1e26] border-[var(--accent,#c59b27)]/80 text-[var(--accent,#c59b27)] font-semibold shadow-xs'
                            : 'bg-[#141418] border-zinc-800 text-zinc-300 hover:bg-zinc-800/60'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="w-3.5 h-3.5 rounded-full border border-zinc-600 shrink-0" style={{ backgroundColor: opt.id }} />
                          <span>{opt.label}</span>
                        </div>
                        {currentCanvasBg === opt.id && <Check className="w-3.5 h-3.5" />}
                      </button>
                    ))}
                  </div>

                  <div className="pt-2 border-t border-zinc-800 space-y-1.5">
                    <div className="text-[10px] uppercase font-bold text-zinc-400 px-1">Cor Personalizada</div>
                    <button
                      ref={canvasBgBtnRef}
                      type="button"
                      onClick={() => setActivePopover(prev => (prev === 'canvasBgPicker' ? null : 'canvasBgPicker'))}
                      className="w-full text-left px-2.5 py-2 rounded-lg flex items-center justify-between text-xs bg-[#141418] border border-zinc-800 hover:border-zinc-700 text-zinc-200 hover:bg-zinc-800/70 cursor-pointer transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <Palette className="w-3.5 h-3.5 text-[var(--accent,#c59b27)]" />
                        <span>Abrir Color Picker...</span>
                      </div>
                      <span className="w-4 h-4 rounded-md border border-zinc-600" style={{ backgroundColor: currentCanvasBg }} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Color Picker popover for Canvas Background (Portal attached) */}
          {activePopover === 'canvasBgPicker' && (
            <CustomColorPickerPopover
              currentColor={currentCanvasBg}
              onChange={c => {
                pushRecentColor(c)
                commitDoc({ ...doc, canvasBg: c })
              }}
              onClearColor={() => {
                commitDoc({ ...doc, canvasBg: undefined })
              }}
              onClose={() => setActivePopover(null)}
              anchorEl={canvasBgBtnRef.current}
              align="left"
              recentColors={recentColors}
            />
          )}
        </div>

        {/* Right: Search, Undo/Redo, Reorganizar, Zoom, Minimap, Export */}
        <div className="flex items-center gap-1">
          {/* Expand / Collapse All Mind Map Nodes */}
          <button
            onClick={handleToggleExpandCollapseAll}
            className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white cursor-pointer transition-colors"
            title={hasAnyCollapsed ? "Expandir todo o mapa mental" : "Recolher todo o mapa mental"}
          >
            <ChevronsDownUp className="w-3.5 h-3.5" />
          </button>

          {/* Search Toggle */}
          <button
            onClick={() => setIsSearchOpen(prev => !prev)}
            className={`p-1.5 rounded hover:bg-zinc-800 cursor-pointer ${
              isSearchOpen || searchQuery ? 'text-[var(--accent,#c59b27)] bg-zinc-800' : 'text-zinc-400'
            }`}
            title="Localizar Tópico (Ctrl+F)"
          >
            <Search className="w-3.5 h-3.5" />
          </button>

          {isSearchOpen && (
            <div className="flex items-center bg-[#18181e] border border-zinc-700 rounded px-1.5 py-0.5">
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Buscar nó..."
                className="bg-transparent border-none outline-hidden text-xs text-zinc-100 placeholder-zinc-500 w-24"
                autoFocus
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="text-zinc-500 hover:text-zinc-300">
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          )}

          {/* Undo / Redo */}
          <button
            onClick={handleUndo}
            disabled={historyIndexRef.current <= 0}
            className="p-1.5 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 disabled:opacity-30 cursor-pointer"
            title="Desfazer (Ctrl+Z)"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleRedo}
            disabled={historyIndexRef.current >= historyRef.current.length - 1}
            className="p-1.5 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 disabled:opacity-30 cursor-pointer"
            title="Refazer (Ctrl+Y)"
          >
            <Redo2 className="w-3.5 h-3.5" />
          </button>

          <div className="w-px h-4 bg-zinc-800 mx-1" />

          {/* Reorganizar Mapa (Reset to standard auto-layout) */}
          <button
            onClick={handleResetPositions}
            className="flex items-center gap-1 px-2 py-1 rounded bg-[#18181e] hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 text-[11px] font-medium transition-colors cursor-pointer"
            title="Reorganizar Nós no Layout Padrão"
          >
            <Sparkles className="w-3.5 h-3.5 text-[var(--accent,#c59b27)]" />
            <span>Reorganizar</span>
          </button>

          {/* Zoom Controls */}
          <button
            onClick={() => setViewport(prev => ({ ...prev, zoom: Math.max(0.2, prev.zoom - 0.15) }))}
            className="p-1.5 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 cursor-pointer"
            title="Reduzir Zoom (-)"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={fitView}
            className="px-1.5 py-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 font-mono text-[10px] cursor-pointer"
            title="Centralizar e Ajustar à Tela"
          >
            {Math.round(viewport.zoom * 100)}%
          </button>
          <button
            onClick={fitView}
            className="p-1.5 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 cursor-pointer"
            title="Centralizar Mapa Mental na Tela"
          >
            <Focus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setViewport(prev => ({ ...prev, zoom: Math.min(2.5, prev.zoom + 0.15) }))}
            className="p-1.5 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 cursor-pointer"
            title="Aumentar Zoom (+)"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>

          {/* Export Dropdown */}
          <div className="relative mindmap-popover-anchor">
            <button
              onClick={() => setActivePopover(prev => (prev === 'export' ? null : 'export'))}
              className="p-1.5 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 cursor-pointer"
              title="Exportar Mapa"
            >
              <Download className="w-3.5 h-3.5" />
            </button>

            {activePopover === 'export' && (
              <div
                onMouseDown={e => e.stopPropagation()}
                className="absolute top-8 right-0 w-48 bg-[#141418] border border-zinc-700/80 rounded-lg shadow-2xl p-1 z-50 space-y-0.5"
              >
                <button
                  onClick={() => {
                    handleExportMarkdown()
                    setActivePopover(null)
                  }}
                  className="w-full text-left px-2 py-1.5 rounded hover:bg-zinc-800 text-xs flex items-center gap-2 text-zinc-200 cursor-pointer"
                >
                  <FileText className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Exportar Markdown (.md)</span>
                </button>
                <button
                  onClick={() => {
                    handleExportSVG()
                    setActivePopover(null)
                  }}
                  className="w-full text-left px-2 py-1.5 rounded hover:bg-zinc-800 text-xs flex items-center gap-2 text-zinc-200 cursor-pointer"
                >
                  <Share2 className="w-3.5 h-3.5 text-amber-400" />
                  <span>Exportar Vetor SVG (.svg)</span>
                </button>
                <button
                  onClick={() => {
                    handleExportJSON()
                    setActivePopover(null)
                  }}
                  className="w-full text-left px-2 py-1.5 rounded hover:bg-zinc-800 text-xs flex items-center gap-2 text-zinc-200 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Exportar JSON</span>
                </button>
              </div>
            )}
          </div>

          {/* Minimap Toggle */}
          <button
            onClick={() => setShowMinimap(prev => !prev)}
            className={`p-1.5 rounded cursor-pointer ${
              showMinimap ? 'text-[var(--accent,#c59b27)] bg-zinc-800' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
            }`}
            title="Alternar Minimapa"
          >
            <Layers className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* 2. FLOATING NODE TOOLBAR (Only renders if exactly 1 node is selected!) */}
      {selectedComputed && selectedNodeIds.length <= 1 && (
        <div
          onMouseDown={e => e.stopPropagation()}
          style={{
            position: 'absolute',
            left: `${viewport.panX + selectedComputed.x * viewport.zoom}px`,
            top: `${40 + viewport.panY + (selectedComputed.y - selectedComputed.height / 2) * viewport.zoom - 8}px`,
            transform: 'translate(-50%, -100%)'
          }}
          className="mindmap-interactive-control z-30 flex items-center gap-1 p-1 bg-[#121216]/95 backdrop-blur-md border border-zinc-700/80 rounded-lg shadow-2xl text-xs select-none"
        >
          {/* Cor do Tópico */}
          <div className="relative mindmap-popover-anchor">
            <button
              ref={colorBtnRef}
              onClick={() => setActivePopover(prev => (prev === 'color' ? null : 'color'))}
              className={`p-1 rounded hover:bg-zinc-800 cursor-pointer ${
                activePopover === 'color' ? 'bg-zinc-800 text-[var(--accent,#c59b27)]' : 'text-zinc-300 hover:text-white'
              }`}
              title="Cor de Preenchimento"
            >
              <Palette className="w-3.5 h-3.5 text-[var(--accent,#c59b27)]" />
            </button>

            {activePopover === 'color' && (
              <CustomColorPickerPopover
                currentColor={
                  selectedComputed.node.fillColor && selectedComputed.node.fillColor !== 'transparent'
                    ? selectedComputed.node.fillColor
                    : (doc.colorizeNodeBg ? selectedComputed.branchColor : '#1e293b')
                }
                onChange={c => {
                  pushRecentColor(c)
                  commitDoc(
                    updateNode(doc, selectedComputed.id, {
                      fillColor: c,
                      textColor: isColorLight(c) ? '#09090b' : '#ffffff'
                    })
                  )
                }}
                onClearColor={() => {
                  commitDoc(
                    updateNode(doc, selectedComputed.id, {
                      fillColor: 'transparent',
                      textColor: undefined
                    })
                  )
                }}
                onClose={() => setActivePopover(null)}
                anchorEl={colorBtnRef.current}
                align="center"
                recentColors={recentColors}
              />
            )}
          </div>

          {/* Formato do Tópico */}
          <div className="relative mindmap-popover-anchor">
            <button
              onClick={() => setActivePopover(prev => (prev === 'shape' ? null : 'shape'))}
              className="p-1 rounded hover:bg-zinc-800 text-zinc-300 hover:text-white"
              title="Forma da Caixa"
            >
              <Hexagon className="w-3.5 h-3.5" />
            </button>

            {activePopover === 'shape' && (
              <div
                onMouseDown={e => e.stopPropagation()}
                className="absolute top-8 left-0 bg-[#141418] border border-zinc-700 rounded-lg p-1 shadow-2xl z-50 w-44 space-y-0.5"
              >
                {SHAPES.map(s => (
                  <button
                    key={s.id}
                    onClick={() => {
                      commitDoc(updateNode(doc, selectedComputed.id, { shape: s.id }))
                      setActivePopover(null)
                    }}
                    className="w-full text-left px-2 py-1 rounded hover:bg-zinc-800 text-xs text-zinc-300 flex items-center justify-between cursor-pointer"
                  >
                    <span>{s.label}</span>
                    {selectedComputed.node.shape === s.id && <Check className="w-3 h-3 text-[var(--accent,#c59b27)]" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="w-px h-3.5 bg-zinc-800 mx-0.5" />

          {/* Bold */}
          <button
            onClick={() => {
              const currentWeight = selectedComputed.node.fontWeight || 'normal'
              commitDoc(
                updateNode(doc, selectedComputed.id, {
                  fontWeight: currentWeight === 'bold' ? 'normal' : 'bold'
                })
              )
            }}
            className={`p-1 rounded hover:bg-zinc-800 ${
              selectedComputed.node.fontWeight === 'bold' ? 'bg-zinc-800 text-[var(--accent,#c59b27)]' : 'text-zinc-300'
            }`}
            title="Negrito"
          >
            <Bold className="w-3.5 h-3.5" />
          </button>

          {/* Italic */}
          <button
            onClick={() => {
              commitDoc(
                updateNode(doc, selectedComputed.id, {
                  fontItalic: !selectedComputed.node.fontItalic
                })
              )
            }}
            className={`p-1 rounded hover:bg-zinc-800 ${
              selectedComputed.node.fontItalic ? 'bg-zinc-800 text-[var(--accent,#c59b27)]' : 'text-zinc-300'
            }`}
            title="Itálico"
          >
            <Italic className="w-3.5 h-3.5" />
          </button>

          {/* Sublinhado */}
          <button
            onClick={() => {
              commitDoc(
                updateNode(doc, selectedComputed.id, {
                  fontUnderline: !selectedComputed.node.fontUnderline
                })
              )
            }}
            className={`p-1 rounded hover:bg-zinc-800 ${
              selectedComputed.node.fontUnderline ? 'bg-zinc-800 text-[var(--accent,#c59b27)]' : 'text-zinc-300'
            }`}
            title="Sublinhado"
          >
            <Underline className="w-3.5 h-3.5" />
          </button>

          <div className="w-px h-3.5 bg-zinc-800 mx-0.5" />

          {/* Ícones & Badges */}
          <div className="relative mindmap-popover-anchor">
            <button
              onClick={() => setActivePopover(prev => (prev === 'icons' ? null : 'icons'))}
              className="p-1 rounded hover:bg-zinc-800 text-zinc-300 hover:text-white"
              title="Adicionar Ícone / Prioridade"
            >
              <Star className="w-3.5 h-3.5 text-amber-400" />
            </button>

            {activePopover === 'icons' && (
              <div
                onMouseDown={e => e.stopPropagation()}
                className="absolute top-8 left-0 bg-[#141418] border border-zinc-700 rounded-lg p-1.5 shadow-2xl z-50 w-44 space-y-1"
              >
                <span className="text-[10px] uppercase font-bold text-zinc-500 px-1">Ícones de Status</span>
                <div className="grid grid-cols-4 gap-1">
                  {ICON_PRESETS.map(p => {
                    const isSelected = selectedComputed.node.icons?.includes(p.id)
                    return (
                      <button
                        key={p.id}
                        onClick={() => handleToggleIcon(selectedComputed.id, p.id)}
                        className={`p-1.5 rounded flex items-center justify-center cursor-pointer transition-colors ${
                          isSelected ? 'bg-zinc-700 ring-1 ring-[var(--accent,#c59b27)]' : 'hover:bg-zinc-800'
                        }`}
                        style={{ color: p.color }}
                        title={p.label}
                      >
                        {p.icon}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Nota Markdown */}
          <button
            onClick={() => setActiveSideDrawer('note')}
            className={`p-1 rounded hover:bg-zinc-800 ${
              selectedComputed.node.note ? 'text-amber-400' : 'text-zinc-300 hover:text-white'
            }`}
            title="Anotação do Tópico"
          >
            <FileText className="w-3.5 h-3.5" />
          </button>

          {/* Contorno de Grupo (Boundary) */}
          <button
            onClick={() => handleToggleBoundary(selectedComputed.id)}
            className="p-1 rounded hover:bg-zinc-800 text-zinc-300 hover:text-white"
            title="Adicionar Contorno de Grupo"
          >
            <Layers className="w-3.5 h-3.5" />
          </button>

          {/* Conexão / Relação */}
          <button
            onClick={() => setConnectingFromId(selectedComputed.id)}
            className={`p-1 rounded hover:bg-zinc-800 ${
              connectingFromId === selectedComputed.id ? 'bg-[var(--accent,#c59b27)] text-zinc-950 font-bold animate-pulse' : 'text-zinc-300'
            }`}
            title="Conectar com outro nó (Relação)"
          >
            <Share2 className="w-3.5 h-3.5" />
          </button>

          {/* Excluir Nó */}
          {selectedComputed.id !== doc.rootId && (
            <button
              onClick={handleDeleteSelected}
              className="p-1 rounded hover:bg-red-950/60 text-zinc-400 hover:text-red-400"
              title="Excluir Tópico (Del)"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {/* 2b. MULTI-SELECTION FLOATING TOOLBAR (When > 1 node selected with Ctrl) */}
      {selectedNodeIds.length > 1 && selectedComputed && (
        <div
          onMouseDown={e => e.stopPropagation()}
          style={{
            position: 'absolute',
            left: `${viewport.panX + selectedComputed.x * viewport.zoom}px`,
            top: `${40 + viewport.panY + (selectedComputed.y - selectedComputed.height / 2) * viewport.zoom - 8}px`,
            transform: 'translate(-50%, -100%)'
          }}
          className="mindmap-interactive-control z-30 flex items-center gap-2.5 px-3 py-1.5 bg-[#121216]/95 backdrop-blur-md border border-[var(--accent,#c59b27)]/60 rounded-xl shadow-2xl text-xs select-none"
        >
          <div className="flex items-center gap-1.5 text-zinc-200 font-medium">
            <span className="w-2 h-2 rounded-full bg-[var(--accent,#c59b27)] animate-pulse" />
            <span>{selectedNodeIds.length} tópicos selecionados</span>
          </div>

          <div className="h-3.5 w-px bg-zinc-700 mx-0.5" />

          <button
            onClick={handleDeleteSelected}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-red-500/15 hover:bg-red-500/25 text-red-400 hover:text-red-300 border border-red-500/30 transition-colors cursor-pointer font-medium"
            title="Excluir selecionados (Del ou Backspace)"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Excluir Selecionados</span>
          </button>
        </div>
      )}

      {/* 3. RELATIONSHIP CREATION NOTICE */}
      {connectingFromId && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-30 px-3 py-1.5 bg-[var(--accent,#c59b27)] text-zinc-950 font-medium text-xs rounded-full shadow-lg flex items-center gap-2 backdrop-blur-xs">
          <Share2 className="w-3.5 h-3.5 animate-bounce" />
          <span>Clique no tópico de destino para criar a conexão</span>
          <button
            onClick={() => setConnectingFromId(null)}
            className="ml-2 hover:opacity-75 rounded-full p-0.5"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* 4. MAIN INTERACTIVE SVG & DOM CANVAS (With Grid/Malha Pattern) */}
      <div
        onMouseDown={handleMouseDownCanvas}
        onWheel={handleWheel}
        className="relative flex-1 w-full h-full cursor-grab active:cursor-grabbing"
      >
        {/* SVG LAYER: Infinite Grid/Malha, Edges, Boundaries, Relations */}
        <svg
          className="mindmap-svg-canvas absolute inset-0 w-full h-full pointer-events-none"
          style={{ width: '100%', height: '100%' }}
        >
          {/* Defs for Grid Pattern and Arrowhead */}
          <defs>
            <pattern
              id="mindmap-grid-dots"
              width="24"
              height="24"
              patternUnits="userSpaceOnUse"
              patternTransform={`translate(${viewport.panX}, ${viewport.panY}) scale(${viewport.zoom})`}
            >
              <circle
                cx="12"
                cy="12"
                r="1.2"
                fill={isCanvasLight ? 'rgba(0, 0, 0, 0.16)' : 'rgba(255, 255, 255, 0.12)'}
              />
            </pattern>
            <marker
              id="arrowhead-relation"
              markerWidth="8"
              markerHeight="6"
              refX="6"
              refY="3"
              orient="auto"
            >
              <polygon points="0 0, 8 3, 0 6" fill="#38bdf8" />
            </marker>
          </defs>

          {/* Full Canvas Infinite Grid / Malha */}
          <rect width="100%" height="100%" fill="url(#mindmap-grid-dots)" pointerEvents="none" />

          <g transform={`translate(${viewport.panX}, ${viewport.panY}) scale(${viewport.zoom})`}>
            {/* Boundaries (Contornos) */}
            {layoutResult.boundaries.map(b => (
              <g key={b.id}>
                <rect
                  x={b.rect.x}
                  y={b.rect.y}
                  width={b.rect.width}
                  height={b.rect.height}
                  rx="16"
                  ry="16"
                  fill={b.boundary.fillColor || 'rgba(197, 155, 39, 0.08)'}
                  stroke={b.boundary.strokeColor || '#c59b27'}
                  strokeWidth="1.5"
                  strokeDasharray="4 4"
                />
                {b.boundary.label && (
                  <text
                    x={b.rect.x + 12}
                    y={b.rect.y + 16}
                    fill={b.boundary.strokeColor || '#c59b27'}
                    fontSize="11"
                    fontWeight="600"
                    opacity="0.9"
                  >
                    {b.boundary.label}
                  </text>
                )}
              </g>
            ))}

            {/* Tree Branch Edges (Tapered Organic or Smoothed Stroke) */}
            {layoutResult.edges.map(edge => (
              edge.isTapered ? (
                <path
                  key={edge.id}
                  d={edge.path}
                  fill={edge.color}
                  stroke={edge.color}
                  strokeWidth={0.5}
                  strokeLinejoin="round"
                  opacity="0.94"
                />
              ) : (
                <path
                  key={edge.id}
                  d={edge.path}
                  fill="none"
                  stroke={edge.color}
                  strokeWidth={edge.width}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity="0.9"
                />
              )
            ))}

            {/* Cross-Topic Relations */}
            {(doc.relations || []).map(rel => {
              const fromCN = layoutResult.nodes.find(n => n.id === rel.fromId)
              const toCN = layoutResult.nodes.find(n => n.id === rel.toId)
              if (!fromCN || !toCN) return null

              const x1 = fromCN.x
              const y1 = fromCN.y
              const x2 = toCN.x
              const y2 = toCN.y
              const midX = (x1 + x2) / 2
              const midY = (y1 + y2) / 2 - 40

              const path = `M ${x1} ${y1} Q ${midX} ${midY}, ${x2} ${y2}`
              return (
                <g key={rel.id}>
                  <path
                    d={path}
                    fill="none"
                    stroke={rel.color || '#38bdf8'}
                    strokeWidth="2"
                    strokeDasharray={rel.lineStyle === 'dashed' ? '5 5' : undefined}
                    markerEnd="url(#arrowhead-relation)"
                    opacity="0.9"
                  />
                  {rel.label && (
                    <text
                      x={midX}
                      y={midY - 8}
                      fill={rel.color || '#38bdf8'}
                      fontSize="10"
                      textAnchor="middle"
                      fontWeight="600"
                    >
                      {rel.label}
                    </text>
                  )}
                </g>
              )
            })}
          </g>
        </svg>

        {/* DOM LAYER: Interactive Nodes with Direct + Button, Free Dragging and Badges */}
        <div
          className="absolute inset-0 pointer-events-none origin-top-left"
          style={{
            transform: `translate(${viewport.panX}px, ${viewport.panY}px) scale(${viewport.zoom})`
          }}
        >
          {layoutResult.nodes.map(cn => {
            const isRoot = cn.id === doc.rootId
            const isSelected = selectedNodeIds.includes(cn.id)
            const isEditing = cn.id === editingNodeId
            const isHighlighted = searchQuery && cn.node.title.toLowerCase().includes(searchQuery.toLowerCase())
            const hasChildren = cn.node.children && cn.node.children.length > 0
            const isCollapsed = !!cn.node.collapsed

            const shape = cn.node.shape || 'rounded'
            const isUnderline = shape === 'underline'

            // Color resolution based on light/dark canvas, hierarchy level & colorizeNodeBg
            const isExplicitTransparent = cn.node.fillColor === 'transparent' || cn.node.fillColor === 'none'
            const defaultCardBg = isRoot
              ? currentTheme.rootBg
              : isCanvasLight
              ? '#ffffff'
              : currentTheme.subtopicBg

            const effectiveBg = isExplicitTransparent
              ? (isUnderline ? 'transparent' : defaultCardBg)
              : cn.node.fillColor
              ? cn.node.fillColor
              : doc.colorizeNodeBg
              ? (isRoot ? (cn.branchColor || currentTheme.rootBg) : cn.level === 1 ? cn.branchColor : `${cn.branchColor}22`)
              : defaultCardBg

            const effectiveBorder = cn.node.strokeColor
              ? cn.node.strokeColor
              : isRoot
              ? currentTheme.rootBorder
              : isUnderline
              ? cn.branchColor
              : doc.colorizeNodeBg
              ? cn.branchColor
              : (cn.branchColor || currentTheme.subtopicBorder)

            const effectiveText = isExplicitTransparent
              ? (isRoot ? currentTheme.rootText : isCanvasLight ? '#0f172a' : currentTheme.subtopicText)
              : cn.node.textColor
              ? cn.node.textColor
              : doc.colorizeNodeBg && !cn.node.fillColor
              ? (cn.level === 1 && isColorLight(cn.branchColor) ? '#09090b' : '#ffffff')
              : isRoot
              ? currentTheme.rootText
              : isCanvasLight
              ? '#0f172a'
              : currentTheme.subtopicText

            // Badge styling with strong contrast against background
            const badgeBg = effectiveBg !== 'transparent'
              ? effectiveBg
              : (isCanvasLight ? '#ffffff' : currentTheme.subtopicBg || '#18181e')

            const isBadgeBgLight = isColorLight(badgeBg)

            // When colorizeNodeBg is active or badge background is light:
            // Ensure the text has high contrast (e.g. #09090b on light badge, #ffffff on dark badge).
            // When colorizeNodeBg is false on dark background, keep the accent branch color (like Image 1).
            const badgeTextColor = doc.colorizeNodeBg
              ? (isBadgeBgLight ? '#09090b' : '#ffffff')
              : (isBadgeBgLight ? (isColorLight(effectiveBorder) ? '#09090b' : effectiveBorder) : effectiveBorder)

            const badgeBorderColor = doc.colorizeNodeBg && isBadgeBgLight
              ? (isColorLight(effectiveBorder) ? 'rgba(0, 0, 0, 0.25)' : effectiveBorder)
              : effectiveBorder

            const borderRadiusClass =
              shape === 'capsule'
                ? 'rounded-full'
                : shape === 'rectangle'
                ? 'rounded-none'
                : shape === 'oval'
                ? 'rounded-[50%]'
                : shape === 'cloud'
                ? 'rounded-2xl border-dashed'
                : isUnderline
                ? 'rounded-none'
                : 'rounded-xl'

            return (
              <div
                key={cn.id}
                onMouseDown={e => handleNodeMouseDown(cn, e)}
                onClick={e => handleNodeClick(cn.id, e)}
                onDoubleClick={e => {
                  e.stopPropagation()
                  startEditing(cn.id)
                }}
                style={{
                  position: 'absolute',
                  left: `${cn.x}px`,
                  top: `${cn.y}px`,
                  transform: 'translate(-50%, -50%)',
                  width: `${cn.width}px`,
                  height: isUnderline ? `${cn.height}px` : undefined,
                  minHeight: isUnderline ? undefined : `${cn.height}px`,
                  boxSizing: 'border-box',
                  backgroundColor: isUnderline ? 'transparent' : effectiveBg,
                  borderColor: isSelected ? 'var(--accent,#c59b27)' : isUnderline ? cn.branchColor : effectiveBorder,
                  color: effectiveText,
                  borderWidth: isUnderline ? '0 0 2px 0' : isSelected ? '1.5px' : '1px',
                  borderBottomStyle: 'solid',
                  boxShadow: isUnderline
                    ? 'none'
                    : isSelected
                    ? '0 0 0 2px rgba(197, 155, 39, 0.3), 0 4px 14px rgba(0,0,0,0.25)'
                    : isHighlighted
                    ? '0 0 0 2.5px rgba(245, 158, 11, 0.5)'
                    : isCanvasLight
                    ? '0 1px 4px rgba(0,0,0,0.06)'
                    : '0 2px 8px rgba(0,0,0,0.2)',
                  padding: isUnderline ? '2px 4px' : undefined
                }}
                className={`mindmap-interactive-node group pointer-events-auto cursor-grab active:cursor-grabbing transition-shadow flex items-center justify-between px-2.5 py-1 ${borderRadiusClass} border select-none`}
              >
                {/* Node Content */}
                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                  {cn.node.icons?.map(iconId => {
                    const preset = ICON_PRESETS.find(p => p.id === iconId)
                    if (!preset) return null
                    return (
                      <span key={iconId} style={{ color: preset.color }} className="shrink-0">
                        {preset.icon}
                      </span>
                    )
                  })}

                  {/* Title / Inline Editor */}
                  {isEditing ? (
                    <input
                      type="text"
                      value={editingText}
                      onChange={e => setEditingText(e.target.value)}
                      onBlur={finishEditing}
                      autoFocus
                      className="w-full bg-transparent border-none outline-hidden text-xs font-semibold px-0"
                      style={{ color: effectiveText }}
                    />
                  ) : (
                    <span
                      className={`truncate text-xs ${
                        isRoot ? 'font-bold text-[13.5px]' : 'font-medium'
                      } ${cn.node.fontWeight === 'bold' ? 'font-bold' : ''} ${
                        cn.node.fontItalic ? 'italic' : ''
                      } ${cn.node.fontUnderline ? 'underline' : ''}`}
                    >
                      {cn.node.title}
                    </span>
                  )}
                </div>

                {/* Right badges & Direct (+) Add Child Button on the Node itself! */}
                <div className="flex items-center gap-1 shrink-0 ml-1">
                  {/* Note Indicator */}
                  {cn.node.note && (
                    <span
                      onClick={e => {
                        e.stopPropagation()
                        setSelectedNodeId(cn.id)
                        setActiveSideDrawer('note')
                      }}
                      className="text-amber-400 hover:text-amber-300 cursor-pointer"
                      title="Ver Anotação"
                    >
                      <FileText className="w-3 h-3" />
                    </span>
                  )}

                  {/* DIRECT (+) ADD SUBTOPIC BUTTON ON THE NODE */}
                  <button
                    onClick={e => {
                      e.stopPropagation()
                      handleAddChild(cn.id)
                    }}
                    className="w-4 h-4 rounded-full bg-[var(--accent,#c59b27)] text-black hover:brightness-110 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity active:scale-90 cursor-pointer shadow-xs ml-0.5"
                    title="Adicionar Subtópico (+)"
                  >
                    <Plus className="w-2.5 h-2.5 stroke-[2.5]" />
                  </button>
                </div>

                {/* OUTSIDE COLLAPSE BUTTON: Sits on the connecting line outside the node when expanded */}
                {hasChildren && !isCollapsed && (
                  <button
                    onClick={e => {
                      e.stopPropagation()
                      commitDoc(toggleCollapse(doc, cn.id))
                    }}
                    style={{
                      position: 'absolute',
                      [cn.side === 'left' ? 'left' : 'right']: '-8px',
                      top: isUnderline ? 'calc(100% - 1px)' : '50%',
                      transform: cn.side === 'left' ? 'translate(-50%, -50%)' : 'translate(50%, -50%)',
                      borderColor: badgeBorderColor,
                      backgroundColor: badgeBg,
                      color: badgeTextColor
                    }}
                    className="w-3.5 h-3.5 rounded-full border flex items-center justify-center text-[9px] font-bold opacity-0 group-hover:opacity-100 hover:opacity-100! transition-opacity active:scale-90 cursor-pointer shadow-xs z-30 hover:brightness-110"
                    title="Recolher ramo (-)"
                  >
                    <Minus className="w-2 h-2 stroke-[2.5]" />
                  </button>
                )}

                {/* OUTSIDE EXPAND STUB & BADGE: Protrudes on a small branch line stub when collapsed */}
                {hasChildren && isCollapsed && (
                  <div
                    style={{
                      position: 'absolute',
                      [cn.side === 'left' ? 'right' : 'left']: '100%',
                      top: isUnderline ? 'calc(100% - 1px)' : '50%',
                      transform: 'translate(0, -50%)'
                    }}
                    className={`flex items-center z-30 pointer-events-auto ${cn.side === 'left' ? 'flex-row-reverse' : 'flex-row'}`}
                  >
                    {/* Small branch line stub */}
                    <div
                      style={{
                        width: '8px',
                        height: '2px',
                        backgroundColor: cn.branchColor,
                        flexShrink: 0
                      }}
                    />
                    {/* Expand badge button */}
                    <button
                      onClick={e => {
                        e.stopPropagation()
                        commitDoc(toggleCollapse(doc, cn.id))
                      }}
                      style={{
                        borderColor: badgeBorderColor,
                        backgroundColor: badgeBg,
                        color: badgeTextColor
                      }}
                      className="px-1.5 h-4.5 rounded-full border flex items-center justify-center gap-0.5 text-[10px] font-bold hover:brightness-125 transition-transform active:scale-90 cursor-pointer shadow-xs shrink-0"
                      title={`Expandir ramo (${cn.node.children.length} subtópicos)`}
                    >
                      <Plus className="w-2.5 h-2.5 stroke-[2.5]" />
                      <span className="text-[9px] font-semibold">{cn.node.children.length}</span>
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* 5. SIDE DRAWER: TOPIC NOTES (Styled in Pyrite Design System) */}
      {activeSideDrawer === 'note' && selectedComputed && (
        <div
          onMouseDown={e => e.stopPropagation()}
          className="mindmap-interactive-control absolute top-10 right-0 bottom-0 w-80 bg-[#0c0c0e]/95 backdrop-blur-md border-l border-zinc-800/80 z-40 p-4 flex flex-col shadow-2xl"
        >
          <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-amber-400" />
              <span className="font-semibold text-xs text-zinc-100 truncate max-w-[200px]">
                Anotação: {selectedComputed.node.title}
              </span>
            </div>
            <button
              onClick={() => setActiveSideDrawer(null)}
              className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 py-3 flex flex-col min-h-0">
            <textarea
              value={selectedComputed.node.note || ''}
              onChange={e => {
                commitDoc(
                  updateNode(doc, selectedComputed.id, {
                    note: e.target.value
                  })
                )
              }}
              placeholder="Escreva notas ricas em markdown para este tópico..."
              className="flex-1 w-full bg-[#18181e] border border-zinc-700/60 rounded-lg p-2.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-hidden focus:border-[var(--accent,#c59b27)] resize-none"
            />
          </div>

          <div className="text-[10px] text-zinc-500 flex items-center justify-between pt-2 border-t border-zinc-800/80">
            <span>Suporta Markdown e links</span>
            <button
              onClick={() => {
                commitDoc(updateNode(doc, selectedComputed.id, { note: undefined }))
                setActiveSideDrawer(null)
              }}
              className="text-red-400 hover:text-red-300 cursor-pointer"
            >
              Remover nota
            </button>
          </div>
        </div>
      )}

      {/* 6. MINIMAP RADAR (Interactive: Click to center map!) */}
      {showMinimap && (
        <div
          onMouseDown={e => e.stopPropagation()}
          onClick={fitView}
          title="Clique para centralizar o mapa na tela"
          className="mindmap-interactive-control absolute bottom-3 right-3 w-40 h-28 bg-[#0c0c0e]/90 backdrop-blur-md border border-zinc-800 hover:border-[var(--accent,#c59b27)] rounded-lg overflow-hidden shadow-xl z-20 cursor-pointer transition-all pointer-events-auto group"
        >
          <svg className="w-full h-full">
            {layoutResult.nodes.map(cn => (
              <circle
                key={cn.id}
                cx={20 + ((cn.x - layoutResult.bounds.minX) / (layoutResult.bounds.maxX - layoutResult.bounds.minX || 1)) * 120}
                cy={15 + ((cn.y - layoutResult.bounds.minY) / (layoutResult.bounds.maxY - layoutResult.bounds.minY || 1)) * 80}
                r={cn.id === doc.rootId ? 4 : 2}
                fill={selectedNodeIds.includes(cn.id) ? 'var(--accent,#c59b27)' : cn.branchColor}
              />
            ))}
          </svg>
          <div className="absolute bottom-1 right-1 opacity-0 group-hover:opacity-100 text-[9px] text-[var(--accent,#c59b27)] font-medium transition-opacity px-1 bg-black/60 rounded">
            Centralizar
          </div>
        </div>
      )}
    </div>
  )
}
