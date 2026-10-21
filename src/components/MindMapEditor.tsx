import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Note } from '../types'
import type {
  ComputedNode,
  MindMapBoundary,
  MindMapDocument,
  MindMapLayout,
  MindMapLineStyle,
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
import {
  AlertCircle,
  Bold,
  Check,
  ChevronDown,
  Download,
  FileText,
  Flag,
  Folder,
  GitFork,
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
  Sparkles,
  Star,
  Trash2,
  Underline,
  Undo2,
  X,
  ZoomIn,
  ZoomOut
} from 'lucide-react'

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

const PALETTE_COLORS = [
  '#ffffff',
  '#f4f4f5',
  '#a1a1aa',
  '#3b82f6',
  '#06b6d4',
  '#10b981',
  '#84cc16',
  '#eab308',
  '#c59b27',
  '#f97316',
  '#ef4444',
  '#ec4899',
  '#a855f7',
  '#18181b',
  '#27272a',
  '#0f172a'
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

  // Selection & Editing
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
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
    'color' | 'shape' | 'icons' | 'style' | 'palette' | 'lines' | 'canvasBg' | 'layout' | 'export' | null
  >(null)
  const [activeSideDrawer, setActiveSideDrawer] = useState<'note' | null>(null)

  // Search filter
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearchOpen, setIsSearchOpen] = useState(false)

  // Minimap
  const [showMinimap, setShowMinimap] = useState(true)

  // Viewport (Pan & Zoom)
  const [viewport, setViewport] = useState(() => doc.viewport || { panX: 0, panY: 0, zoom: 1 })
  const isDraggingCanvas = useRef(false)
  const dragStartPos = useRef({ x: 0, y: 0 })
  const initialPan = useRef({ panX: 0, panY: 0 })

  // Current Theme definition
  const currentTheme = MINDMAP_THEMES[doc.theme] || MINDMAP_THEMES['pyrita-classic']
  const currentCanvasBg = doc.canvasBg || currentTheme.bg || '#0f172a'
  const isCanvasLight = currentCanvasBg === '#ffffff' || currentCanvasBg === '#f4f4f5'

  // Auto-save debounced
  const saveTimeoutRef = useRef<number | null>(null)
  const scheduleSave = useCallback(
    (newDoc: MindMapDocument) => {
      if (saveTimeoutRef.current) window.clearTimeout(saveTimeoutRef.current)
      saveTimeoutRef.current = window.setTimeout(() => {
        onUpdateNote({
          ...note,
          content: serializeMindMapDocument(newDoc),
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
  const fitView = useCallback(() => {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const { minX, maxX, minY, maxY } = layoutResult.bounds
    const mapWidth = Math.max(100, maxX - minX)
    const mapHeight = Math.max(100, maxY - minY)

    const scaleX = (rect.width - 120) / mapWidth
    const scaleY = (rect.height - 120) / mapHeight
    const targetZoom = Math.max(0.3, Math.min(1.2, Math.min(scaleX, scaleY)))

    const centerX = (minX + maxX) / 2
    const centerY = (minY + maxY) / 2

    const newViewport = {
      zoom: targetZoom,
      panX: rect.width / 2 - centerX * targetZoom,
      panY: rect.height / 2 - centerY * targetZoom
    }
    setViewport(newViewport)
  }, [layoutResult])

  // Center view on mount if at (0,0)
  useEffect(() => {
    if (viewport.panX === 0 && viewport.panY === 0 && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect()
      setViewport({
        zoom: 1,
        panX: rect.width / 2,
        panY: rect.height / 2
      })
    }
  }, [])

  // Node editing handlers
  const startEditing = useCallback(
    (nodeId: string) => {
      const target = doc.nodes[nodeId]
      if (!target) return
      setEditingNodeId(nodeId)
      setEditingText(target.title)
      setActivePopover(null)
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

  // Delete node
  const handleDeleteSelected = useCallback(() => {
    if (!selectedNodeId || selectedNodeId === doc.rootId) return
    const parentId = doc.nodes[selectedNodeId]?.parentId
    const nextDoc = deleteNode(doc, selectedNodeId)
    commitDoc(nextDoc)
    setSelectedNodeId(parentId || doc.rootId)
    setActivePopover(null)
  }, [doc, selectedNodeId, commitDoc])

  // Reset all custom positions (Reorganizar)
  const handleResetPositions = useCallback(() => {
    const cleaned = resetNodePositions(doc)
    commitDoc(cleaned)
  }, [doc, commitDoc])

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

    // Dismiss active selections & popovers when clicking empty canvas
    setSelectedNodeId(null)
    setActivePopover(null)
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
    // Do not initiate drag if root node (root is fixed!)
    if (cn.id === doc.rootId) return
    if ((e.target as HTMLElement).closest('button') || (e.target as HTMLElement).closest('input')) return

    e.stopPropagation()
    draggingNodeId.current = cn.id
    hasDraggedNode.current = false
    nodeDragStartMouse.current = { x: e.clientX, y: e.clientY }
    nodeDragStartNodePos.current = { x: cn.x, y: cn.y }
  }

  // Node click handler
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

    setSelectedNodeId(nodeId)
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
        fillColor: 'rgba(59, 130, 246, 0.08)',
        strokeColor: '#3b82f6',
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
      onMouseDown={handleMouseDownCanvas}
      onMouseMove={handleMouseMoveCanvas}
      onMouseUp={handleMouseUpCanvas}
      onWheel={handleWheel}
      style={{ backgroundColor: currentCanvasBg }}
      className="relative w-full h-full overflow-hidden select-none font-sans text-zinc-100 flex flex-col"
    >
      {/* 1. TOP HEADER TOOLBAR (Styled in Pyrita Dark/Gold Design System) */}
      <header className="z-20 h-10 px-3 bg-[#0c0c0e]/95 backdrop-blur-md border-b border-zinc-800/80 flex items-center justify-between shrink-0 text-xs shadow-xs">
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

        {/* Center: Style Presets, Line Styles, Palettes, Layout & Canvas Background */}
        <div className="flex items-center gap-1">
          {/* Estilos Visuais do Mapa (Presets como na referência) */}
          <div className="relative">
            <button
              onClick={() => setActivePopover(prev => (prev === 'style' ? null : 'style'))}
              className="flex items-center gap-1 px-2 py-1 rounded bg-[#18181e] hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 transition-colors cursor-pointer"
              title="Estilo Visual do Mapa"
            >
              <Sparkles className="w-3.5 h-3.5 text-[var(--accent,#c59b27)]" />
              <span>
                {doc.mapStyle === 'organic-branch'
                  ? 'Orgânico (Ramos)'
                  : doc.mapStyle === 'modern-cards'
                  ? 'Cartões Modernos'
                  : doc.mapStyle === 'pills'
                  ? 'Cápsulas'
                  : doc.mapStyle === 'technical'
                  ? 'Técnico'
                  : 'Minimalista'}
              </span>
              <ChevronDown className="w-3 h-3 text-zinc-500" />
            </button>

            {activePopover === 'style' && (
              <div className="absolute top-8 left-0 w-52 bg-[#141418] border border-zinc-700/80 rounded-lg shadow-2xl p-1 z-30 space-y-0.5">
                {[
                  { id: 'organic-branch', label: 'Orgânico (Galhos & Linhas)' },
                  { id: 'modern-cards', label: 'Cartões Modernos' },
                  { id: 'pills', label: 'Pílulas & Cápsulas' },
                  { id: 'technical', label: 'Técnico / Ortogonal' },
                  { id: 'minimal-lines', label: 'Minimalista (Linhas)' }
                ].map(s => (
                  <button
                    key={s.id}
                    onClick={() => {
                      commitDoc(applyMapStylePreset(doc, s.id as MindMapStylePreset))
                      setActivePopover(null)
                    }}
                    className={`w-full text-left px-2.5 py-1.5 rounded flex items-center justify-between text-xs cursor-pointer ${
                      doc.mapStyle === s.id ? 'bg-[#1e1e26] text-[var(--accent,#c59b27)] font-medium' : 'text-zinc-300 hover:bg-zinc-800/60'
                    }`}
                  >
                    <span>{s.label}</span>
                    {doc.mapStyle === s.id && <Check className="w-3.5 h-3.5" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Seletor de Tipo de Conexão / Ramos */}
          <div className="relative">
            <button
              onClick={() => setActivePopover(prev => (prev === 'lines' ? null : 'lines'))}
              className="flex items-center gap-1 px-2 py-1 rounded bg-[#18181e] hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 transition-colors cursor-pointer"
              title="Tipo de Linha / Conexão"
            >
              <GitFork className="w-3.5 h-3.5 text-zinc-400" />
              <span>
                {doc.lineStyle === 'curved' ? 'Curva Suave' : doc.lineStyle === 'straight' ? 'Reta' : 'Ortogonal'}
              </span>
              <ChevronDown className="w-3 h-3 text-zinc-500" />
            </button>

            {activePopover === 'lines' && (
              <div className="absolute top-8 left-0 w-44 bg-[#141418] border border-zinc-700/80 rounded-lg shadow-2xl p-1 z-30 space-y-0.5">
                {[
                  { id: 'curved', label: 'Curva Suave (Bézier)' },
                  { id: 'straight', label: 'Linha Reta Direta' },
                  { id: 'rounded-elbow', label: 'Cotovelo / Ortogonal' }
                ].map(line => (
                  <button
                    key={line.id}
                    onClick={() => {
                      commitDoc({ ...doc, lineStyle: line.id as MindMapLineStyle })
                      setActivePopover(null)
                    }}
                    className={`w-full text-left px-2.5 py-1.5 rounded flex items-center justify-between text-xs cursor-pointer ${
                      doc.lineStyle === line.id ? 'bg-[#1e1e26] text-[var(--accent,#c59b27)] font-medium' : 'text-zinc-300 hover:bg-zinc-800/60'
                    }`}
                  >
                    <span>{line.label}</span>
                    {doc.lineStyle === line.id && <Check className="w-3.5 h-3.5" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Seletor de Paleta / Cores dos Ramos */}
          <div className="relative">
            <button
              onClick={() => setActivePopover(prev => (prev === 'palette' ? null : 'palette'))}
              className="flex items-center gap-1.5 px-2 py-1 rounded bg-[#18181e] hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 transition-colors cursor-pointer"
              title="Cores dos Ramos"
            >
              <div className="flex gap-0.5">
                {(MINDMAP_PALETTES[doc.paletteId || 'rainbow']?.colors || []).slice(0, 3).map((c, i) => (
                  <span key={i} className="w-2 h-2 rounded-full" style={{ backgroundColor: c }} />
                ))}
              </div>
              <span>{MINDMAP_PALETTES[doc.paletteId || 'rainbow']?.name || 'Cores'}</span>
              <ChevronDown className="w-3 h-3 text-zinc-500" />
            </button>

            {activePopover === 'palette' && (
              <div className="absolute top-8 left-0 w-52 bg-[#141418] border border-zinc-700/80 rounded-lg shadow-2xl p-1 z-30 space-y-1">
                {Object.entries(MINDMAP_PALETTES).map(([pId, p]) => (
                  <button
                    key={pId}
                    onClick={() => {
                      commitDoc({ ...doc, paletteId: pId as MindMapPaletteId })
                      setActivePopover(null)
                    }}
                    className={`w-full text-left px-2.5 py-1.5 rounded flex items-center justify-between text-xs cursor-pointer ${
                      (doc.paletteId || 'rainbow') === pId ? 'bg-[#1e1e26] text-[var(--accent,#c59b27)] font-medium' : 'text-zinc-300 hover:bg-zinc-800/60'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div className="flex gap-0.5">
                        {p.colors.slice(0, 4).map((c, i) => (
                          <span key={i} className="w-2 h-2 rounded-full" style={{ backgroundColor: c }} />
                        ))}
                      </div>
                      <span>{p.name}</span>
                    </div>
                    {(doc.paletteId || 'rainbow') === pId && <Check className="w-3.5 h-3.5" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Layout Estrutural */}
          <div className="relative">
            <button
              onClick={() => setActivePopover(prev => (prev === 'layout' ? null : 'layout'))}
              className="flex items-center gap-1 px-2 py-1 rounded bg-[#18181e] hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 transition-colors cursor-pointer"
              title="Estrutura do Mapa"
            >
              <span>
                {doc.layout === 'radial'
                  ? 'Radial'
                  : doc.layout === 'right'
                  ? 'À Direita'
                  : doc.layout === 'left'
                  ? 'À Esquerda'
                  : 'Organograma'}
              </span>
              <ChevronDown className="w-3 h-3 text-zinc-500" />
            </button>

            {activePopover === 'layout' && (
              <div className="absolute top-8 left-0 w-44 bg-[#141418] border border-zinc-700/80 rounded-lg shadow-2xl p-1 z-30 space-y-0.5">
                {[
                  { id: 'radial', label: 'Mind Map (Radial)' },
                  { id: 'right', label: 'Árvore à Direita' },
                  { id: 'left', label: 'Árvore à Esquerda' },
                  { id: 'org-chart', label: 'Organograma (Top-Down)' }
                ].map(l => (
                  <button
                    key={l.id}
                    onClick={() => {
                      commitDoc({ ...doc, layout: l.id as MindMapLayout })
                      setActivePopover(null)
                    }}
                    className={`w-full text-left px-2.5 py-1.5 rounded flex items-center justify-between text-xs cursor-pointer ${
                      doc.layout === l.id ? 'bg-[#1e1e26] text-[var(--accent,#c59b27)] font-medium' : 'text-zinc-300 hover:bg-zinc-800/60'
                    }`}
                  >
                    <span>{l.label}</span>
                    {doc.layout === l.id && <Check className="w-3.5 h-3.5" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Fundo da Malha (Canvas Background) */}
          <div className="relative">
            <button
              onClick={() => setActivePopover(prev => (prev === 'canvasBg' ? null : 'canvasBg'))}
              className="p-1 rounded bg-[#18181e] hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 transition-colors cursor-pointer"
              title="Cor de Fundo da Tela"
            >
              <span
                className="w-3.5 h-3.5 rounded-full block border border-zinc-700"
                style={{ backgroundColor: currentCanvasBg }}
              />
            </button>

            {activePopover === 'canvasBg' && (
              <div className="absolute top-8 left-0 w-40 bg-[#141418] border border-zinc-700/80 rounded-lg shadow-2xl p-1 z-30 space-y-0.5">
                {CANVAS_BG_OPTIONS.map(opt => (
                  <button
                    key={opt.id}
                    onClick={() => {
                      commitDoc({ ...doc, canvasBg: opt.id })
                      setActivePopover(null)
                    }}
                    className={`w-full text-left px-2 py-1.5 rounded flex items-center justify-between text-xs cursor-pointer ${
                      currentCanvasBg === opt.id ? 'bg-[#1e1e26] text-[var(--accent,#c59b27)] font-medium' : 'text-zinc-300 hover:bg-zinc-800/60'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full border border-zinc-600" style={{ backgroundColor: opt.id }} />
                      <span>{opt.label}</span>
                    </div>
                    {currentCanvasBg === opt.id && <Check className="w-3.5 h-3.5" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: Search, Undo/Redo, Reorganizar, Zoom, Minimap, Export */}
        <div className="flex items-center gap-1">
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
            onClick={() => setViewport(prev => ({ ...prev, zoom: Math.min(2.5, prev.zoom + 0.15) }))}
            className="p-1.5 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 cursor-pointer"
            title="Aumentar Zoom (+)"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>

          {/* Export Dropdown */}
          <div className="relative">
            <button
              onClick={() => setActivePopover(prev => (prev === 'export' ? null : 'export'))}
              className="p-1.5 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 cursor-pointer"
              title="Exportar Mapa"
            >
              <Download className="w-3.5 h-3.5" />
            </button>

            {activePopover === 'export' && (
              <div className="absolute top-8 right-0 w-48 bg-[#141418] border border-zinc-700/80 rounded-lg shadow-2xl p-1 z-30 space-y-0.5">
                <button
                  onClick={() => {
                    handleExportMarkdown()
                    setActivePopover(null)
                  }}
                  className="w-full text-left px-2 py-1.5 rounded hover:bg-zinc-800 text-xs flex items-center gap-2 text-zinc-200 cursor-pointer"
                >
                  <FileText className="w-3.5 h-3.5 text-blue-400" />
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

      {/* 2. FLOATING NODE TOOLBAR (Only renders if a node is selected!) */}
      {selectedComputed && (
        <div
          style={{
            position: 'absolute',
            left: `${viewport.panX + selectedComputed.x * viewport.zoom}px`,
            top: `${viewport.panY + (selectedComputed.y - selectedComputed.height / 2 - 14) * viewport.zoom}px`,
            transform: 'translate(-50%, -100%)'
          }}
          className="mindmap-interactive-control z-30 flex items-center gap-1 p-1 bg-[#121216]/95 backdrop-blur-md border border-zinc-700/80 rounded-lg shadow-2xl text-xs select-none"
        >
          {/* Cor do Tópico */}
          <div className="relative">
            <button
              onClick={() => setActivePopover(prev => (prev === 'color' ? null : 'color'))}
              className="p-1 rounded hover:bg-zinc-800 text-zinc-300 hover:text-white"
              title="Cor de Preenchimento"
            >
              <Palette className="w-3.5 h-3.5 text-[var(--accent,#c59b27)]" />
            </button>

            {activePopover === 'color' && (
              <div className="absolute top-8 left-0 bg-[#141418] border border-zinc-700 rounded-lg p-2 shadow-2xl z-40 grid grid-cols-4 gap-1.5 w-36">
                {PALETTE_COLORS.map(c => (
                  <button
                    key={c}
                    onClick={() => {
                      commitDoc(
                        updateNode(doc, selectedComputed.id, {
                          fillColor: c,
                          textColor: c === '#ffffff' || c === '#f4f4f5' ? '#09090b' : '#ffffff'
                        })
                      )
                      setActivePopover(null)
                    }}
                    className="w-6 h-6 rounded-md border border-zinc-700 hover:scale-110 transition-transform cursor-pointer"
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Formato do Tópico */}
          <div className="relative">
            <button
              onClick={() => setActivePopover(prev => (prev === 'shape' ? null : 'shape'))}
              className="p-1 rounded hover:bg-zinc-800 text-zinc-300 hover:text-white"
              title="Forma da Caixa"
            >
              <Hexagon className="w-3.5 h-3.5" />
            </button>

            {activePopover === 'shape' && (
              <div className="absolute top-8 left-0 bg-[#141418] border border-zinc-700 rounded-lg p-1 shadow-2xl z-40 w-44 space-y-0.5">
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
          <div className="relative">
            <button
              onClick={() => setActivePopover(prev => (prev === 'icons' ? null : 'icons'))}
              className="p-1 rounded hover:bg-zinc-800 text-zinc-300 hover:text-white"
              title="Adicionar Ícone / Prioridade"
            >
              <Star className="w-3.5 h-3.5 text-amber-400" />
            </button>

            {activePopover === 'icons' && (
              <div className="absolute top-8 left-0 bg-[#141418] border border-zinc-700 rounded-lg p-1.5 shadow-2xl z-40 w-44 space-y-1">
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
              connectingFromId === selectedComputed.id ? 'bg-blue-600 text-white animate-pulse' : 'text-zinc-300'
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

      {/* 3. RELATIONSHIP CREATION NOTICE */}
      {connectingFromId && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-30 px-3 py-1.5 bg-blue-600/90 text-white text-xs rounded-full shadow-lg flex items-center gap-2 backdrop-blur-xs">
          <Share2 className="w-3.5 h-3.5 animate-bounce" />
          <span>Clique no tópico de destino para criar a conexão</span>
          <button
            onClick={() => setConnectingFromId(null)}
            className="ml-2 hover:bg-blue-700 rounded-full p-0.5"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* 4. MAIN INTERACTIVE SVG & DOM CANVAS (With Grid/Malha Pattern) */}
      <div className="relative flex-1 w-full h-full cursor-grab active:cursor-grabbing">
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
                  fill={b.boundary.fillColor || 'rgba(59, 130, 246, 0.08)'}
                  stroke={b.boundary.strokeColor || '#3b82f6'}
                  strokeWidth="1.5"
                  strokeDasharray="4 4"
                />
                {b.boundary.label && (
                  <text
                    x={b.rect.x + 12}
                    y={b.rect.y + 16}
                    fill={b.boundary.strokeColor || '#3b82f6'}
                    fontSize="11"
                    fontWeight="600"
                    opacity="0.9"
                  >
                    {b.boundary.label}
                  </text>
                )}
              </g>
            ))}

            {/* Tree Branch Edges */}
            {layoutResult.edges.map(edge => (
              <path
                key={edge.id}
                d={edge.path}
                fill="none"
                stroke={edge.color}
                strokeWidth={edge.width}
                strokeLinecap="round"
                opacity="0.9"
              />
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
            const isSelected = cn.id === selectedNodeId
            const isEditing = cn.id === editingNodeId
            const isHighlighted = searchQuery && cn.node.title.toLowerCase().includes(searchQuery.toLowerCase())
            const hasChildren = cn.node.children && cn.node.children.length > 0
            const isCollapsed = !!cn.node.collapsed

            // Color resolution based on light/dark canvas
            const effectiveBg = cn.node.fillColor
              ? cn.node.fillColor
              : isRoot
              ? currentTheme.rootBg
              : isCanvasLight
              ? '#ffffff'
              : currentTheme.subtopicBg

            const effectiveBorder = cn.node.strokeColor
              ? cn.node.strokeColor
              : isRoot
              ? currentTheme.rootBorder
              : cn.branchColor

            const effectiveText = cn.node.textColor
              ? cn.node.textColor
              : isRoot
              ? currentTheme.rootText
              : isCanvasLight
              ? '#0f172a'
              : currentTheme.subtopicText

            const shape = cn.node.shape || 'rounded'
            const isUnderline = shape === 'underline'

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
                ? 'rounded-none border-b-2! border-t-0! border-l-0! border-r-0! bg-transparent!'
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
                  minHeight: `${cn.height}px`,
                  backgroundColor: isUnderline ? 'transparent' : effectiveBg,
                  borderColor: isSelected ? 'var(--accent,#c59b27)' : effectiveBorder,
                  color: effectiveText,
                  borderWidth: isUnderline ? '0 0 2px 0' : isSelected ? '2.5px' : '1.5px',
                  boxShadow: isUnderline
                    ? 'none'
                    : isSelected
                    ? '0 0 0 3px rgba(197, 155, 39, 0.25), 0 8px 20px rgba(0,0,0,0.3)'
                    : isHighlighted
                    ? '0 0 0 3px rgba(245, 158, 11, 0.5)'
                    : isCanvasLight
                    ? '0 2px 8px rgba(0,0,0,0.06)'
                    : '0 4px 12px rgba(0,0,0,0.2)'
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

                  {/* Collapse / Expand Toggle Button on nodes with children */}
                  {hasChildren && (
                    <button
                      onClick={e => {
                        e.stopPropagation()
                        commitDoc(toggleCollapse(doc, cn.id))
                      }}
                      className="w-4 h-4 rounded-full bg-zinc-800/90 hover:bg-zinc-700 flex items-center justify-center text-[10px] font-bold text-zinc-300 transition-transform active:scale-90 cursor-pointer"
                      title={isCollapsed ? 'Expandir ramo' : 'Recolher ramo'}
                    >
                      {isCollapsed ? <Plus className="w-2.5 h-2.5" /> : <Minus className="w-2.5 h-2.5" />}
                    </button>
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
              </div>
            )
          })}
        </div>
      </div>

      {/* 5. SIDE DRAWER: TOPIC NOTES (Styled in Pyrita Design System) */}
      {activeSideDrawer === 'note' && selectedComputed && (
        <div className="absolute top-10 right-0 bottom-0 w-80 bg-[#0c0c0e]/95 backdrop-blur-md border-l border-zinc-800/80 z-40 p-4 flex flex-col shadow-2xl">
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
          onClick={fitView}
          title="Clique para centralizar o mapa na tela"
          className="absolute bottom-3 right-3 w-40 h-28 bg-[#0c0c0e]/90 backdrop-blur-md border border-zinc-800 hover:border-[var(--accent,#c59b27)] rounded-lg overflow-hidden shadow-xl z-20 cursor-pointer transition-all pointer-events-auto group"
        >
          <svg className="w-full h-full">
            {layoutResult.nodes.map(cn => (
              <circle
                key={cn.id}
                cx={20 + ((cn.x - layoutResult.bounds.minX) / (layoutResult.bounds.maxX - layoutResult.bounds.minX || 1)) * 120}
                cy={15 + ((cn.y - layoutResult.bounds.minY) / (layoutResult.bounds.maxY - layoutResult.bounds.minY || 1)) * 80}
                r={cn.id === doc.rootId ? 4 : 2}
                fill={cn.id === selectedNodeId ? 'var(--accent,#c59b27)' : cn.branchColor}
              />
            ))}
          </svg>
          <div className="absolute bottom-1 right-1 opacity-0 group-hover:opacity-100 text-[9px] text-[var(--accent,#c59b27)] font-medium transition-opacity px-1 bg-black/60 rounded">
            Centralizar
          </div>
        </div>
      )}

      {/* 7. BOTTOM STATUS BAR */}
      <footer className="h-6 bg-[#0c0c0e]/95 border-t border-zinc-800/80 px-3 flex items-center justify-between text-[10px] text-zinc-500 shrink-0 select-none">
        <div className="flex items-center gap-3">
          <span>
            <kbd className="font-mono text-zinc-400">Tab</kbd> Subtópico
          </span>
          <span>
            <kbd className="font-mono text-zinc-400">Enter</kbd> Irmão
          </span>
          <span>
            <kbd className="font-mono text-zinc-400">Del</kbd> Excluir
          </span>
          <span>
            <kbd className="font-mono text-zinc-400">Espaço</kbd> Editar
          </span>
          <span>
            <kbd className="font-mono text-zinc-400">Arraste</kbd> Mover Nó
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span>{layoutResult.nodes.length} tópicos</span>
          <span>•</span>
          <span>Pyrita Mind Engine</span>
        </div>
      </footer>
    </div>
  )
}
