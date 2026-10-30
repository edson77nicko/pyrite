import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Note } from '../types'
import type { DrawDocument, DrawElement, DrawElementType, DrawPoint, DrawTool } from '../types/draw'
import type { TaskItem } from '../types/tasks'
import {
  getElementBounds,
  isPointInElement,
  parseDrawDocument,
  renderElementToCanvas,
  renderGrid,
  serializeDrawDocument,
  findClosestAnchor,
  updateConnectedLines,
  getOrthogonalConnectorPoints,
  drawRoundedOrthogonalPath,
  drawArrowhead
} from '../utils/drawUtils'
import { loadTasks, saveTasks, loadTaskSettings } from '../utils/taskStorage'
import { CustomColorPickerPopover } from './CustomColorPickerPopover'
import {
  MousePointer,
  Square,
  Diamond,
  Circle,
  Triangle,
  ArrowUpRight,
  Minus,
  PenTool,
  Type,
  Eraser,
  Hand,
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Download,
  Trash2,
  Copy,
  ChevronDown,
  Search,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Layers,
  StickyNote,
  Bold,
  Strikethrough,
  List,
  Shapes,
  CalendarDays,
  Database,
  ChevronLeft,
  ChevronRight,
  Kanban,
  TableProperties,
  Table,
  Plus,
  RefreshCw,
  FolderOpen,
  Folder,
  ArrowLeft,
  ExternalLink,
  FileText,
  X,
  Palette,
  Brain,
  CodeXml,
  CornerDownRight
} from 'lucide-react'

interface DrawEditorProps {
  note: Note
  onUpdateNote: (updatedNote: Note) => void
  notes?: Note[]
  folders?: string[]
  onOpenNote?: (noteId: string) => void
}

// 11 Colors Line 1 (Solid vibrant - FigJam matching)
const FIGJAM_COLORS_ROW1 = [
  '#1e1e1e', // Black
  '#4a4a4e', // Slate dark
  '#e03e1a', // Coral Red
  '#f06a25', // Orange
  '#e8b339', // Gold Yellow
  '#40c057', // Green
  '#22b8cf', // Cyan
  '#339af0', // Blue FigJam
  '#7950f2', // Violet Purple
  '#f06595', // Pink
  '#ffffff'  // Pure White
]

// 10 Colors Line 2 (Pastels / Muted - FigJam matching)
const FIGJAM_COLORS_ROW2 = [
  '#adb5bd', // Muted Gray
  '#e9ecef', // Light Ice Gray
  '#ffd8a8', // Peach Pastel
  '#ffe8cc', // Cream Pastel
  '#fff3bf', // Light Yellow
  '#d3f9d8', // Mint Pastel
  '#c5f6fa', // Soft Cyan
  '#d0ebff', // Soft Blue
  '#e5dbff', // Soft Violet
  '#fcc2d7'  // Soft Pink
]

// Sticky Note Color Palette (FigJam Post-it colors)
const STICKY_COLORS = [
  '#ffd8a8', // Peach / Salmon
  '#fff3bf', // Pastel Yellow
  '#ffe8cc', // Cream Orange
  '#d3f9d8', // Pastel Mint Green
  '#c5f6fa', // Pastel Cyan
  '#d0ebff', // Pastel Blue
  '#e5dbff', // Pastel Lavender
  '#fcc2d7', // Pastel Pink
  '#f4f4f5'  // Soft White / Gray
]

// Table Background Palette (FigJam Table colors)
const TABLE_COLORS = [
  '#18181b', // Zinc Dark
  '#27272a', // Zinc Slate
  '#09090b', // Pure Black
  '#ffffff', // White Clean
  '#f4f4f5', // Zinc Light
  '#0f172a', // Slate Dark
  '#1e293b', // Slate Medium
  '#0c4a6e', // Sky Dark
  '#064e3b', // Emerald Dark
  '#4c0519', // Rose Dark
  '#3b0764'  // Purple Dark
]

// Helper for hierarchical folder navigation in Import Note Modal
function getImmediateChildren(validFolders: string[], currentPath: string): { name: string; fullPath: string; hasChildren: boolean }[] {
  const prefix = currentPath ? currentPath + '/' : ''
  const childMap = new Map<string, { fullPath: string; hasChildren: boolean }>()

  for (const f of validFolders) {
    if (prefix) {
      if (!f.startsWith(prefix)) continue
      const remainder = f.slice(prefix.length)
      if (!remainder) continue
      const parts = remainder.split('/')
      const childName = parts[0]
      const childFullPath = prefix + childName
      const existing = childMap.get(childName)
      childMap.set(childName, {
        fullPath: childFullPath,
        hasChildren: existing?.hasChildren || parts.length > 1
      })
    } else {
      const parts = f.split('/')
      const childName = parts[0]
      const existing = childMap.get(childName)
      childMap.set(childName, {
        fullPath: childName,
        hasChildren: existing?.hasChildren || parts.length > 1
      })
    }
  }

  return Array.from(childMap.entries())
    .map(([name, data]) => ({
      name,
      fullPath: data.fullPath,
      hasChildren: data.hasChildren
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

interface ShapeOption {
  type: DrawElementType
  label: string
  icon: React.FC<{ className?: string }>
}

const SHAPE_OPTIONS: ShapeOption[] = [
  { type: 'rectangle', label: 'Retângulo', icon: Square },
  { type: 'ellipse', label: 'Círculo', icon: Circle },
  { type: 'roundedRect', label: 'Retângulo Arredondado', icon: Square },
  { type: 'diamond', label: 'Losango', icon: Diamond },
  { type: 'triangle', label: 'Triângulo', icon: Triangle },
  { type: 'triangleDown', label: 'Triângulo Invertido', icon: Triangle },
  { type: 'parallelogram', label: 'Paralelogramo', icon: Square },
  { type: 'cylinder', label: 'Cilindro', icon: Circle }
]

export const DrawEditor: React.FC<DrawEditorProps> = ({ note, onUpdateNote, notes = [], folders = [], onOpenNote }) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // Document state
  const [doc, setDoc] = useState<DrawDocument>(() => parseDrawDocument(note.content, note.title))
  const docRef = useRef(doc)
  docRef.current = doc

  // Note Import Modal states
  const [isImportNoteModalOpen, setIsImportNoteModalOpen] = useState(false)
  const [noteModalSearch, setNoteModalSearch] = useState('')
  const [noteModalFolder, setNoteModalFolder] = useState('')

  // Tasks from vault
  const [tasks, setTasks] = useState<TaskItem[]>(() => loadTasks())
  const [taskSettings] = useState(() => loadTaskSettings())

  // Undo / Redo history
  const historyRef = useRef<DrawElement[][]>([doc.elements])
  const historyIndexRef = useRef(0)

  // Active Tool
  const [tool, setTool] = useState<DrawTool>('select')
  const toolRef = useRef(tool)
  toolRef.current = tool

  // Current Selection
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const selectedIdsRef = useRef(selectedIds)
  selectedIdsRef.current = selectedIds

  // Active properties for newly created shapes
  const [strokeColor, setStrokeColor] = useState<string>('#4a4a4e')
  const [backgroundColor, setBackgroundColor] = useState<string>('transparent')
  const [strokeWidth, setStrokeWidth] = useState<number>(2)
  const [strokeStyle, setStrokeStyle] = useState<'solid' | 'dashed' | 'dotted'>('solid')
  const [fillStyle, setFillStyle] = useState<'none' | 'semi' | 'solid'>('none')
  const [fontSize, setFontSize] = useState<number>(18)
  const [fontFamily, setFontFamily] = useState<'sans' | 'handwriting' | 'mono'>('sans')

  // Text Inline Editing
  const [editingText, setEditingText] = useState<{ id: string; x: number; y: number; text: string; width: number; height: number; isShape?: boolean } | null>(null)
  const textInputRef = useRef<HTMLTextAreaElement>(null)

  // Table Inline Cell Editing
  const [editingTableCell, setEditingTableCell] = useState<{
    tableId: string
    row: number
    col: number
    x: number
    y: number
    width: number
    height: number
    text: string
  } | null>(null)
  const tableCellInputRef = useRef<HTMLTextAreaElement>(null)

  // Table Column / Row / Cell Selection & Inserter States
  const [selectedTableCell, setSelectedTableCell] = useState<{
    tableId: string
    row: number
    col: number
  } | null>(null)
  const [selectedTableCol, setSelectedTableCol] = useState<number | null>(null)
  const [selectedTableRow, setSelectedTableRow] = useState<number | null>(null)
  const [hoveredTableCol, setHoveredTableCol] = useState<number | null>(null)
  const [hoveredTableRow, setHoveredTableRow] = useState<number | null>(null)
  const [isHoveringBottomAdd, setIsHoveringBottomAdd] = useState(false)
  const [isHoveringRightAdd, setIsHoveringRightAdd] = useState(false)

  // Table Creation Drag Preview Tooltip
  const [tableCreationPreview, setTableCreationPreview] = useState<{
    screenX: number
    screenY: number
    rows: number
    cols: number
  } | null>(null)

  // Popover state for floating selection toolbar
  const [openPopover, setOpenPopover] = useState<'shape' | 'color' | 'typography' | 'stroke' | 'stickyColor' | 'stickySize' | 'dataTaskBoard' | 'tableColor' | 'tableTypography' | 'tableSize' | 'tableAlign' | null>(null)
  const [shapeSearch, setShapeSearch] = useState('')

  // Custom Color Picker Popover (Matches Platform Settings)
  const [showCustomPicker, setShowCustomPicker] = useState(false)
  const rainbowBtnRef = useRef<HTMLButtonElement>(null)

  // Bottom toolbar Shapes Menu Popover
  const [isBottomShapesOpen, setIsBottomShapesOpen] = useState(false)
  const [bottomShapesSearch, setBottomShapesSearch] = useState('')

  // Calendar month state for DataTask widget
  const [calendarDate, setCalendarDate] = useState(() => new Date())

  // Mouse interaction state
  const isPointerDown = useRef(false)
  const pointerDownScreen = useRef<DrawPoint>({ x: 0, y: 0 })
  const dragStartPoint = useRef<DrawPoint>({ x: 0, y: 0 })
  const spacePressed = useRef(false)
  const isPanning = useRef(false)
  const panStart = useRef<DrawPoint>({ x: 0, y: 0 })
  const activeElementId = useRef<string | null>(null)
  const dragHandle = useRef<string | null>(null) // 'tl', 'tr', 'bl', 'br', 'p1', 'p2', 'move'
  const initialElementBounds = useRef<{ x: number; y: number; width: number; height: number } | null>(null)
  const marqueeBox = useRef<{ startX: number; startY: number; currentX: number; currentY: number } | null>(null)

  // Connection Handler dragging state (N8N-like handlers)
  const activeConnector = useRef<{
    fromId: string
    handleId: 'top' | 'right' | 'bottom' | 'left'
    startX: number
    startY: number
    currentX: number
    currentY: number
  } | null>(null)
  const [hoveredHandle, setHoveredHandle] = useState<string | null>(null)

  // Platform accent color helper
  const getAccentColor = useCallback(() => {
    if (typeof window === 'undefined') return '#c59b27'
    const computed = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()
    return computed || '#c59b27'
  }, [])

  // Debounced auto-save to note
  const saveTimeoutRef = useRef<number | null>(null)
  const scheduleSave = useCallback((updatedDoc: DrawDocument) => {
    if (saveTimeoutRef.current) window.clearTimeout(saveTimeoutRef.current)
    saveTimeoutRef.current = window.setTimeout(() => {
      onUpdateNote({
        ...note,
        content: serializeDrawDocument(updatedDoc),
        updatedAt: Date.now()
      })
    }, 300)
  }, [note, onUpdateNote])

  // Push new state to history
  const pushHistory = useCallback((elements: DrawElement[]) => {
    const nextHistory = historyRef.current.slice(0, historyIndexRef.current + 1)
    nextHistory.push(JSON.parse(JSON.stringify(elements)))
    if (nextHistory.length > 50) nextHistory.shift()
    historyRef.current = nextHistory
    historyIndexRef.current = nextHistory.length - 1
  }, [])

  const handleUndo = useCallback(() => {
    if (historyIndexRef.current > 0) {
      historyIndexRef.current--
      const prevElements = JSON.parse(JSON.stringify(historyRef.current[historyIndexRef.current]))
      setDoc(prev => {
        const next = { ...prev, elements: prevElements }
        scheduleSave(next)
        return next
      })
      setSelectedIds([])
      setOpenPopover(null)
      setShowCustomPicker(false)
    }
  }, [scheduleSave])

  const handleRedo = useCallback(() => {
    if (historyIndexRef.current < historyRef.current.length - 1) {
      historyIndexRef.current++
      const nextElements = JSON.parse(JSON.stringify(historyRef.current[historyIndexRef.current]))
      setDoc(prev => {
        const next = { ...prev, elements: nextElements }
        scheduleSave(next)
        return next
      })
      setSelectedIds([])
      setOpenPopover(null)
      setShowCustomPicker(false)
    }
  }, [scheduleSave])

  // Coordinate conversion helpers
  const screenToWorld = useCallback((screenX: number, screenY: number): DrawPoint => {
    const { panX, panY, zoom } = docRef.current.viewport
    return {
      x: (screenX - panX) / zoom,
      y: (screenY - panY) / zoom
    }
  }, [])

  const worldToScreen = useCallback((worldX: number, worldY: number): DrawPoint => {
    const { panX, panY, zoom } = doc.viewport
    return {
      x: worldX * zoom + panX,
      y: worldY * zoom + panY
    }
  }, [doc.viewport])

  // Sync with prop when note.id externally changes
  useEffect(() => {
    const parsed = parseDrawDocument(note.content, note.title)
    setDoc(parsed)
    historyRef.current = [parsed.elements]
    historyIndexRef.current = 0
    setSelectedIds([])
    setOpenPopover(null)
    setShowCustomPicker(false)
  }, [note.id])

  // Single selected element
  const singleSelectedElement = selectedIds.length === 1
    ? doc.elements.find(el => el.id === selectedIds[0]) || null
    : null

  // Refresh tasks from storage
  const handleReloadTasks = () => {
    setTasks(loadTasks())
  }

  // Toggle task complete from canvas widget
  const handleToggleTask = (taskId: string) => {
    const updated = tasks.map(t => t.id === taskId ? { ...t, completed: !t.completed, updatedAt: Date.now() } : t)
    setTasks(updated)
    saveTasks(updated)
  }

  // Render Loop
  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const { width, height } = canvas
    const { panX, panY, zoom } = doc.viewport
    const accent = getAccentColor()

    // Clear background
    ctx.clearRect(0, 0, width, height)
    ctx.fillStyle = '#111114'
    ctx.fillRect(0, 0, width, height)

    // Dot grid
    renderGrid(ctx, width, height, doc.viewport)

    // World transform
    ctx.save()
    ctx.translate(panX, panY)
    ctx.scale(zoom, zoom)

    // Render elements
    for (const el of doc.elements) {
      if (editingText && editingText.id === el.id && !editingText.isShape) {
        continue
      }
      // Skip data-task and note-card duplicate background rendering in interactive editor canvas,
      // as they are fully managed by the live GPU-accelerated DOM overlay.
      if (el.type === 'data-task' || el.type === 'note-card') {
        continue
      }
      const isSelected = selectedIds.includes(el.id)
      renderElementToCanvas(ctx, el, isSelected, doc.elements)
    }

    // Render selection indicators & FigJam handles (Using user custom accent color!)
    if (selectedIds.length > 0 && !editingText) {
      for (const id of selectedIds) {
        const el = doc.elements.find(e => e.id === id)
        if (!el) continue

        ctx.save()

        // 1. SPECIFIC RENDERING FOR LINE AND ARROW:
        // Only 2 control squares (Point 1 and Point 2), using custom accent color!
        if (el.type === 'line' || el.type === 'arrow') {
          const isOrthogonal = el.connectorStyle === 'orthogonal' || (el.connectorStyle !== 'straight' && !!el.startBinding)
          const p1 = { x: el.x, y: el.y }
          const p2 = { x: el.x + el.width, y: el.y + el.height }
          const handleSize = 9 / zoom

          // Highlight line (exact orthogonal path or straight line)
          ctx.strokeStyle = accent
          ctx.globalAlpha = 0.5
          ctx.lineWidth = Math.max(el.strokeWidth || 2, 4) / zoom

          if (isOrthogonal) {
            const startHandle = el.startBinding?.handle || (Math.abs(el.width) >= Math.abs(el.height) ? (el.width >= 0 ? 'right' : 'left') : (el.height >= 0 ? 'bottom' : 'top'))
            const fromEl = el.startBinding ? doc.elements.find(e => e.id === el.startBinding!.elementId) : undefined
            const toEl = el.endBinding ? doc.elements.find(e => e.id === el.endBinding!.elementId) : undefined
            const fromBounds = fromEl ? getElementBounds(fromEl) : undefined
            const toBounds = toEl ? getElementBounds(toEl) : undefined

            const points = getOrthogonalConnectorPoints(
              p1,
              startHandle,
              p2,
              el.endBinding?.handle,
              fromBounds,
              toBounds
            )
            ctx.beginPath()
            drawRoundedOrthogonalPath(ctx, points, 16)
            ctx.stroke()
          } else {
            ctx.beginPath()
            ctx.moveTo(p1.x, p1.y)
            ctx.lineTo(p2.x, p2.y)
            ctx.stroke()
          }
          ctx.globalAlpha = 1.0

          // Point 1 handle
          ctx.fillStyle = '#ffffff'
          ctx.strokeStyle = accent
          ctx.lineWidth = 1.6 / zoom
          ctx.fillRect(p1.x - handleSize / 2, p1.y - handleSize / 2, handleSize, handleSize)
          ctx.strokeRect(p1.x - handleSize / 2, p1.y - handleSize / 2, handleSize, handleSize)

          // Point 2 handle
          ctx.fillRect(p2.x - handleSize / 2, p2.y - handleSize / 2, handleSize, handleSize)
          ctx.strokeRect(p2.x - handleSize / 2, p2.y - handleSize / 2, handleSize, handleSize)

          ctx.restore()
          continue
        }

        // 2. FOR ALL OTHER ELEMENTS: Bounding Box
        const bounds = getElementBounds(el)

        // Selection Border: Platform accent color with matching border-radii!
        ctx.strokeStyle = accent
        ctx.lineWidth = 1.5 / zoom
        if (el.type === 'data-task' || el.type === 'note-card') {
          ctx.beginPath()
          ctx.roundRect(bounds.x, bounds.y, bounds.width, bounds.height, 16)
          ctx.stroke()
        } else if (el.type === 'table') {
          ctx.beginPath()
          ctx.roundRect(bounds.x, bounds.y, bounds.width, bounds.height, 12)
          ctx.stroke()
        } else {
          ctx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height)
        }

        if (selectedIds.length === 1 && el.type !== 'freedraw') {
          // Resize handles on 4 corners + middle right (mr) and middle bottom (mb)
          const cornerHandleSize = 8 / zoom
          const handles = [
            { id: 'tl', x: bounds.x, y: bounds.y },
            { id: 'tr', x: bounds.x + bounds.width, y: bounds.y },
            { id: 'bl', x: bounds.x, y: bounds.y + bounds.height },
            { id: 'br', x: bounds.x + bounds.width, y: bounds.y + bounds.height },
            { id: 'mr', x: bounds.x + bounds.width, y: bounds.y + bounds.height / 2 },
            { id: 'mb', x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height }
          ]

          for (const c of handles) {
            ctx.fillStyle = '#ffffff'
            ctx.strokeStyle = accent
            ctx.lineWidth = 1.5 / zoom
            ctx.fillRect(c.x - cornerHandleSize / 2, c.y - cornerHandleSize / 2, cornerHandleSize, cornerHandleSize)
            ctx.strokeRect(c.x - cornerHandleSize / 2, c.y - cornerHandleSize / 2, cornerHandleSize, cornerHandleSize)
          }

          // Output connection handlers (N8N circular nodes with accent color)
          const isConnectable = el.type !== 'text' && el.type !== 'table' && el.type !== 'note-card'
          if (isConnectable) {
            const connHandles = [
              { id: 'top', x: bounds.x + bounds.width / 2, y: bounds.y },
              { id: 'right', x: bounds.x + bounds.width, y: bounds.y + bounds.height / 2 },
              { id: 'bottom', x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height },
              { id: 'left', x: bounds.x, y: bounds.y + bounds.height / 2 }
            ]

            const connRadius = 4.5 / zoom

            for (const h of connHandles) {
              const isHovered = hoveredHandle === h.id
              ctx.beginPath()
              ctx.arc(h.x, h.y, isHovered ? connRadius * 1.5 : connRadius, 0, Math.PI * 2)
              ctx.fillStyle = isHovered ? '#ffffff' : accent
              ctx.fill()
              ctx.strokeStyle = isHovered ? accent : '#ffffff'
              ctx.lineWidth = 1.2 / zoom
              ctx.stroke()
            }
          }
        }

        ctx.restore()
      }
    }

    // Render interactive connector line while dragging from N8N handler
    if (activeConnector.current) {
      const { fromId, handleId, startX, startY, currentX, currentY } = activeConnector.current
      ctx.save()
      ctx.strokeStyle = accent
      ctx.fillStyle = accent
      ctx.lineWidth = 2.5 / zoom
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.setLineDash([5 / zoom, 4 / zoom])

      const fromEl = doc.elements.find(e => e.id === fromId)
      const fromBounds = fromEl ? getElementBounds(fromEl) : undefined
      const targetEl = doc.elements.slice().reverse().find(el => el.id !== fromId && el.type !== 'line' && el.type !== 'arrow' && isPointInElement({ x: currentX, y: currentY }, el))

      let targetPoint = { x: currentX, y: currentY }
      let targetHandle: 'top' | 'right' | 'bottom' | 'left' | undefined = undefined
      let toBounds = undefined

      if (targetEl) {
        const anchor = findClosestAnchor(targetEl, { x: currentX, y: currentY })
        targetPoint = anchor.point
        targetHandle = anchor.handle
        toBounds = getElementBounds(targetEl)
      }

      const points = getOrthogonalConnectorPoints(
        { x: startX, y: startY },
        handleId,
        targetPoint,
        targetHandle,
        fromBounds,
        toBounds
      )

      ctx.beginPath()
      drawRoundedOrthogonalPath(ctx, points, 16)
      ctx.stroke()

      ctx.setLineDash([])
      drawArrowhead(ctx, points, 2.5 / zoom)

      // Snap highlight indicator on target handle
      if (targetEl) {
        ctx.beginPath()
        ctx.arc(targetPoint.x, targetPoint.y, 6 / zoom, 0, Math.PI * 2)
        ctx.fillStyle = accent
        ctx.fill()
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = 1.5 / zoom
        ctx.stroke()
      }

      ctx.restore()
    }

    // Render marquee selection box
    if (marqueeBox.current) {
      const { startX, startY, currentX, currentY } = marqueeBox.current
      const left = Math.min(startX, currentX)
      const top = Math.min(startY, currentY)
      const w = Math.abs(currentX - startX)
      const h = Math.abs(currentY - startY)

      ctx.save()
      ctx.fillStyle = 'var(--accent-glow, rgba(197, 155, 39, 0.15))'
      ctx.strokeStyle = accent
      ctx.lineWidth = 1 / zoom
      ctx.fillRect(left, top, w, h)
      ctx.strokeRect(left, top, w, h)
      ctx.restore()
    }

    ctx.restore()
  }, [doc, selectedIds, editingText, hoveredHandle, getAccentColor])

  // Canvas size adjustment
  useEffect(() => {
    const handleResize = () => {
      const container = containerRef.current
      const canvas = canvasRef.current
      if (!container || !canvas) return

      const rect = container.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      canvas.width = rect.width * dpr
      canvas.height = rect.height * dpr
      canvas.style.width = `${rect.width}px`
      canvas.style.height = `${rect.height}px`

      const ctx = canvas.getContext('2d')
      if (ctx) ctx.scale(dpr, dpr)

      drawCanvas()
    }

    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [drawCanvas])

  useEffect(() => {
    drawCanvas()
  }, [drawCanvas])

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (editingText) return
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return

      if (e.code === 'Space' && !spacePressed.current) {
        spacePressed.current = true
        containerRef.current?.classList.add('cursor-grab')
      }

      // Undo / Redo
      if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z') && !e.shiftKey) {
        e.preventDefault()
        handleUndo()
        return
      }
      if (((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y')) ||
          ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'z' || e.key === 'Z'))) {
        e.preventDefault()
        handleRedo()
        return
      }

      // Delete selected
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIdsRef.current.length > 0) {
        e.preventDefault()
        const idsToRemove = new Set(selectedIdsRef.current)
        const updated = docRef.current.elements.filter(el => !idsToRemove.has(el.id))
        setDoc(prev => {
          const next = { ...prev, elements: updated }
          scheduleSave(next)
          return next
        })
        pushHistory(updated)
        setSelectedIds([])
        setOpenPopover(null)
        setShowCustomPicker(false)
        return
      }

      // Duplicate (Ctrl+D)
      if ((e.ctrlKey || e.metaKey) && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault()
        handleDuplicateSelected()
        return
      }

      // Tool shortcuts
      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        switch (e.key.toLowerCase()) {
          case '1':
          case 'v':
            setTool('select')
            break
          case '2':
          case 'r':
            setTool('rectangle')
            break
          case '3':
          case 'd':
            setTool('diamond')
            break
          case '4':
          case 'c':
          case 'o':
            setTool('ellipse')
            break
          case 's':
          case 'n':
            setTool('sticky')
            break
          case 'k':
            setTool('data-task')
            break
          case 'b':
            setTool('table')
            break
          case '5':
          case 'a':
            setTool('arrow')
            break
          case '6':
          case 'l':
            setTool('line')
            break
          case '7':
          case 'p':
            setTool('freedraw')
            break
          case '8':
          case 't':
            setTool('text')
            break
          case '9':
          case 'e':
            setTool('eraser')
            break
          case 'h':
            setTool('pan')
            break
        }
      }
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        spacePressed.current = false
        containerRef.current?.classList.remove('cursor-grab', 'cursor-grabbing')
      }
    }

    const handleGlobalPointerUp = () => {
      if (isPointerDown.current) {
        isPointerDown.current = false
        dragHandle.current = null
        activeElementId.current = null
        activeConnector.current = null
        marqueeBox.current = null
        isPanning.current = false
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    window.addEventListener('pointerup', handleGlobalPointerUp)
    window.addEventListener('pointercancel', handleGlobalPointerUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      window.removeEventListener('pointerup', handleGlobalPointerUp)
      window.removeEventListener('pointercancel', handleGlobalPointerUp)
    }
  }, [editingText, handleUndo, handleRedo, scheduleSave, pushHistory])

  // Mouse wheel zoom & pan
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const container = containerRef.current
    if (!container) return

    const rect = container.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top

    if (e.ctrlKey || e.metaKey) {
      const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9
      const currentZoom = docRef.current.viewport.zoom
      const newZoom = Math.min(3.0, Math.max(0.15, currentZoom * zoomFactor))

      const worldPos = screenToWorld(mouseX, mouseY)
      const newPanX = mouseX - worldPos.x * newZoom
      const newPanY = mouseY - worldPos.y * newZoom

      setDoc(prev => ({
        ...prev,
        viewport: { panX: newPanX, panY: newPanY, zoom: newZoom }
      }))
    } else {
      setDoc(prev => ({
        ...prev,
        viewport: {
          ...prev.viewport,
          panX: prev.viewport.panX - e.deltaX,
          panY: prev.viewport.panY - e.deltaY
        }
      }))
    }
  }

  // Pointer Down
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // ignore
    }
    const container = containerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    const screenX = e.clientX - rect.left
    const screenY = e.clientY - rect.top
    const world = screenToWorld(screenX, screenY)

    isPointerDown.current = true
    pointerDownScreen.current = { x: screenX, y: screenY }
    dragStartPoint.current = world

    // Middle click or space or 'pan' tool -> Pan
    if (e.button === 1 || spacePressed.current || tool === 'pan') {
      isPanning.current = true
      panStart.current = { x: e.clientX - doc.viewport.panX, y: e.clientY - doc.viewport.panY }
      container.classList.add('cursor-grabbing')
      return
    }

    if (tool === 'eraser') {
      const hit = doc.elements.slice().reverse().find(el => isPointInElement(world, el))
      if (hit) {
        const nextElements = doc.elements.filter(el => el.id !== hit.id)
        setDoc(prev => {
          const next = { ...prev, elements: nextElements }
          scheduleSave(next)
          return next
        })
        pushHistory(nextElements)
        setSelectedIds(prev => prev.filter(id => id !== hit.id))
      }
      return
    }

    if (tool === 'select') {
      // 1. Check if hit resize handles on single selection
      if (selectedIds.length === 1) {
        const selEl = doc.elements.find(el => el.id === selectedIds[0])
        if (selEl) {
          const z = doc.viewport.zoom
          const margin = 10 / z

          // SPECIFIC HANDLES FOR LINE AND ARROW: Point 1 and Point 2
          if (selEl.type === 'line' || selEl.type === 'arrow') {
            const p1 = { x: selEl.x, y: selEl.y }
            const p2 = { x: selEl.x + selEl.width, y: selEl.y + selEl.height }

            if (Math.hypot(p1.x - world.x, p1.y - world.y) <= margin) {
              dragHandle.current = 'p1'
              initialElementBounds.current = { x: selEl.x, y: selEl.y, width: selEl.width, height: selEl.height }
              return
            }
            if (Math.hypot(p2.x - world.x, p2.y - world.y) <= margin) {
              dragHandle.current = 'p2'
              initialElementBounds.current = { x: selEl.x, y: selEl.y, width: selEl.width, height: selEl.height }
              return
            }
          } else if (selEl.type !== 'freedraw') {
            // Resize handles: 4 corners + middle right (mr) and middle bottom (mb)
            const bounds = getElementBounds(selEl)
            const handles = [
              { id: 'tl', x: bounds.x, y: bounds.y },
              { id: 'tr', x: bounds.x + bounds.width, y: bounds.y },
              { id: 'bl', x: bounds.x, y: bounds.y + bounds.height },
              { id: 'br', x: bounds.x + bounds.width, y: bounds.y + bounds.height },
              { id: 'mr', x: bounds.x + bounds.width, y: bounds.y + bounds.height / 2 },
              { id: 'mb', x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height }
            ]

            const handleHit = handles.find(h => Math.hypot(h.x - world.x, h.y - world.y) <= margin)
            if (handleHit) {
              dragHandle.current = handleHit.id
              initialElementBounds.current = { ...bounds }
              return
            }

            // N8N Output Connection Nodes (Top, Right, Bottom, Left)
            if (selEl.type !== 'text') {
              const connHandles: Array<{ id: 'top' | 'right' | 'bottom' | 'left'; x: number; y: number }> = [
                { id: 'top', x: bounds.x + bounds.width / 2, y: bounds.y },
                { id: 'right', x: bounds.x + bounds.width, y: bounds.y + bounds.height / 2 },
                { id: 'bottom', x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height },
                { id: 'left', x: bounds.x, y: bounds.y + bounds.height / 2 }
              ]

              const connHit = connHandles.find(h => Math.hypot(h.x - world.x, h.y - world.y) <= margin)
              if (connHit) {
                activeConnector.current = {
                  fromId: selEl.id,
                  handleId: connHit.id,
                  startX: connHit.x,
                  startY: connHit.y,
                  currentX: world.x,
                  currentY: world.y
                }
                return
              }
            }
          }
        }
      }

      // Hit test existing element
      const hit = doc.elements.slice().reverse().find(el => isPointInElement(world, el))

      if (hit) {
        if (e.shiftKey) {
          setSelectedIds(prev => prev.includes(hit.id) ? prev.filter(id => id !== hit.id) : [...prev, hit.id])
        } else if (!selectedIds.includes(hit.id)) {
          setSelectedIds([hit.id])
        }
        dragHandle.current = 'move'
        const bounds = getElementBounds(hit)
        initialElementBounds.current = { ...bounds }

        if (hit.type === 'table') {
          const tCols = Math.max(1, hit.cols || 4)
          const tRows = Math.max(1, hit.rows || 3)
          const colW = bounds.width / tCols
          const rowH = bounds.height / tRows
          const c = Math.max(0, Math.min(tCols - 1, Math.floor((world.x - bounds.x) / colW)))
          const r = Math.max(0, Math.min(tRows - 1, Math.floor((world.y - bounds.y) / rowH)))
          setSelectedTableCell({ tableId: hit.id, row: r, col: c })
          setSelectedTableCol(null)
          setSelectedTableRow(null)
        } else {
          setSelectedTableCell(null)
          setSelectedTableCol(null)
          setSelectedTableRow(null)
        }

        // Sync toolbar properties to hit element
        setStrokeColor(hit.strokeColor || '#4a4a4e')
        setBackgroundColor(hit.backgroundColor || 'transparent')
        setStrokeWidth(hit.strokeWidth || 2)
        setStrokeStyle(hit.strokeStyle || 'solid')
        setFillStyle(hit.fillStyle || 'none')
        if (hit.fontSize) setFontSize(hit.fontSize)
        if (hit.fontFamily) setFontFamily(hit.fontFamily)
      } else {
        if (!e.shiftKey) {
          setSelectedIds([])
          setSelectedTableCell(null)
          setSelectedTableCol(null)
          setSelectedTableRow(null)
        }
        setOpenPopover(null)
        setShowCustomPicker(false)
        setIsBottomShapesOpen(false)
        marqueeBox.current = { startX: world.x, startY: world.y, currentX: world.x, currentY: world.y }
      }
      return
    }

    if (tool === 'text') {
      const id = 'text_' + crypto.randomUUID()
      const newTextElement: DrawElement = {
        id,
        type: 'text',
        x: world.x,
        y: world.y,
        width: 180,
        height: 30,
        strokeColor,
        backgroundColor: 'transparent',
        strokeWidth,
        strokeStyle: 'solid',
        fillStyle: 'none',
        text: '',
        fontSize,
        fontFamily,
        textAlign: 'left'
      }

      const nextElements = [...doc.elements, newTextElement]
      setDoc(prev => ({ ...prev, elements: nextElements }))
      setEditingText({ id, x: world.x, y: world.y, width: 180, height: 30, text: '' })
      setSelectedIds([id])
      setTool('select')
      return
    }

    // Placing DATA-TASK directly on single click
    if (tool === 'data-task') {
      const id = 'data_task_' + crypto.randomUUID()
      const defaultW = 600
      const defaultH = 420
      const newElement: DrawElement = {
        id,
        type: 'data-task',
        x: world.x - defaultW / 2,
        y: world.y - defaultH / 2,
        width: defaultW,
        height: defaultH,
        strokeColor: '#3f3f46',
        backgroundColor: '#16161a',
        strokeWidth: 1,
        strokeStyle: 'solid',
        fillStyle: 'solid',
        viewMode: 'calendar',
        boardId: 'default'
      }

      const nextElements = [...doc.elements, newElement]
      setDoc(prev => ({ ...prev, elements: nextElements }))
      setSelectedIds([id])
      setTool('select')
      scheduleSave({ ...doc, elements: nextElements })
      pushHistory(nextElements)
      return
    }

    // Placing STICKY NOTE directly on single click
    if (tool === 'sticky') {
      const id = 'sticky_' + crypto.randomUUID()
      const defaultSize = 180
      const newElement: DrawElement = {
        id,
        type: 'sticky',
        x: world.x - defaultSize / 2,
        y: world.y - defaultSize / 2,
        width: defaultSize,
        height: defaultSize,
        strokeColor: '#18181b',
        backgroundColor: '#ffd8a8',
        strokeWidth: 1,
        strokeStyle: 'solid',
        fillStyle: 'solid',
        text: ''
      }

      const nextElements = [...doc.elements, newElement]
      setDoc(prev => ({ ...prev, elements: nextElements }))
      setSelectedIds([id])
      setTool('select')
      setEditingText({ id, x: newElement.x, y: newElement.y, width: defaultSize, height: defaultSize, text: '' })
      scheduleSave({ ...doc, elements: nextElements })
      pushHistory(nextElements)
      return
    }

    // Creating shape / table / freedraw / arrow / line
    const newId = 'elem_' + crypto.randomUUID()
    activeElementId.current = newId

    const newElement: DrawElement = {
      id: newId,
      type: tool as DrawElementType,
      x: world.x,
      y: world.y,
      width: 0,
      height: 0,
      strokeColor: tool === 'table' ? '#52525b' : strokeColor,
      backgroundColor: tool === 'table' ? '#18181b' : backgroundColor,
      strokeWidth: tool === 'table' ? 1.5 : strokeWidth,
      strokeStyle,
      fillStyle: tool === 'table' ? 'solid' : fillStyle,
      points: tool === 'freedraw' ? [{ x: 0, y: 0 }] : [],
      rows: tool === 'table' ? 3 : undefined,
      cols: tool === 'table' ? 4 : undefined,
      cells: tool === 'table' ? {} : undefined
    }

    setDoc(prev => ({
      ...prev,
      elements: [...prev.elements, newElement]
    }))
  }

  // Pointer Move
  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const container = containerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    const screenX = e.clientX - rect.left
    const screenY = e.clientY - rect.top
    const world = screenToWorld(screenX, screenY)

    if (isPanning.current) {
      setDoc(prev => ({
        ...prev,
        viewport: {
          ...prev.viewport,
          panX: e.clientX - panStart.current.x,
          panY: e.clientY - panStart.current.y
        }
      }))
      return
    }

    // Handle connection drag from N8N handler
    if (activeConnector.current) {
      activeConnector.current.currentX = world.x
      activeConnector.current.currentY = world.y
      drawCanvas()
      return
    }

    if (!isPointerDown.current) {
      if (spacePressed.current || tool === 'pan') {
        container.style.cursor = 'grab'
      } else if (tool === 'select') {
        if (selectedIds.length === 1) {
          const selEl = doc.elements.find(el => el.id === selectedIds[0])
          if (selEl) {
            const z = doc.viewport.zoom
            const margin = 10 / z

            if (selEl.type === 'line' || selEl.type === 'arrow') {
              const p1 = { x: selEl.x, y: selEl.y }
              const p2 = { x: selEl.x + selEl.width, y: selEl.y + selEl.height }
              if (Math.hypot(p1.x - world.x, p1.y - world.y) <= margin || Math.hypot(p2.x - world.x, p2.y - world.y) <= margin) {
                container.style.cursor = 'crosshair'
                return
              }
            } else if (selEl.type !== 'text' && selEl.type !== 'freedraw') {
              const bounds = getElementBounds(selEl)
              const resizeHandles = [
                { id: 'tl', x: bounds.x, y: bounds.y, cursor: 'nwse-resize' },
                { id: 'tr', x: bounds.x + bounds.width, y: bounds.y, cursor: 'nesw-resize' },
                { id: 'bl', x: bounds.x, y: bounds.y + bounds.height, cursor: 'nesw-resize' },
                { id: 'br', x: bounds.x + bounds.width, y: bounds.y + bounds.height, cursor: 'nwse-resize' },
                { id: 'mr', x: bounds.x + bounds.width, y: bounds.y + bounds.height / 2, cursor: 'ew-resize' },
                { id: 'mb', x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height, cursor: 'ns-resize' }
              ]

              const hitResize = resizeHandles.find(h => Math.hypot(h.x - world.x, h.y - world.y) <= margin)
              if (hitResize) {
                container.style.cursor = hitResize.cursor
                return
              }

              // Dynamic table hover detection (only show handles on hovered row/col)
              if (selEl.type === 'table') {
                const tCols = Math.max(1, selEl.cols || 4)
                const tRows = Math.max(1, selEl.rows || 3)
                const colW = bounds.width / tCols
                const rowH = bounds.height / tRows
                const tableMargin = 32 / doc.viewport.zoom

                if (
                  world.x >= bounds.x - tableMargin &&
                  world.x <= bounds.x + bounds.width + tableMargin &&
                  world.y >= bounds.y - tableMargin &&
                  world.y <= bounds.y + bounds.height + tableMargin
                ) {
                  const colIdx = Math.floor((world.x - bounds.x) / colW)
                  const targetCol = colIdx >= 0 && colIdx < tCols ? colIdx : null
                  setHoveredTableCol(prev => prev === targetCol ? prev : targetCol)

                  const rowIdx = Math.floor((world.y - bounds.y) / rowH)
                  const targetRow = rowIdx >= 0 && rowIdx < tRows ? rowIdx : null
                  setHoveredTableRow(prev => prev === targetRow ? prev : targetRow)

                  const targetBottomAdd = (
                    world.y >= bounds.y + bounds.height - 12 / doc.viewport.zoom &&
                    world.y <= bounds.y + bounds.height + tableMargin &&
                    world.x >= bounds.x && world.x <= bounds.x + bounds.width
                  )
                  setIsHoveringBottomAdd(prev => prev === targetBottomAdd ? prev : targetBottomAdd)

                  const targetRightAdd = (
                    world.x >= bounds.x + bounds.width - 12 / doc.viewport.zoom &&
                    world.x <= bounds.x + bounds.width + tableMargin &&
                    world.y >= bounds.y && world.y <= bounds.y + bounds.height
                  )
                  setIsHoveringRightAdd(prev => prev === targetRightAdd ? prev : targetRightAdd)
                } else {
                  setHoveredTableCol(prev => prev === null ? prev : null)
                  setHoveredTableRow(prev => prev === null ? prev : null)
                  setIsHoveringBottomAdd(prev => !prev ? prev : false)
                  setIsHoveringRightAdd(prev => !prev ? prev : false)
                }
              }

              const connHandles = [
                { id: 'top', x: bounds.x + bounds.width / 2, y: bounds.y },
                { id: 'right', x: bounds.x + bounds.width, y: bounds.y + bounds.height / 2 },
                { id: 'bottom', x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height },
                { id: 'left', x: bounds.x, y: bounds.y + bounds.height / 2 }
              ]

              const hitConn = connHandles.find(h => Math.hypot(h.x - world.x, h.y - world.y) <= margin)
              if (hitConn) {
                setHoveredHandle(hitConn.id)
                container.style.cursor = 'crosshair'
                return
              }
            }
          }
        }

        setHoveredHandle(null)
        const hit = doc.elements.slice().reverse().find(el => isPointInElement(world, el))
        container.style.cursor = hit ? 'move' : 'default'
      } else if (tool === 'eraser') {
        container.style.cursor = 'crosshair'
      } else if (tool === 'text') {
        container.style.cursor = 'text'
      } else {
        container.style.cursor = 'crosshair'
      }
      return
    }

    // Eraser drag
    if (tool === 'eraser') {
      const hit = doc.elements.slice().reverse().find(el => isPointInElement(world, el))
      if (hit) {
        const nextElements = doc.elements.filter(el => el.id !== hit.id)
        setDoc(prev => ({ ...prev, elements: nextElements }))
        setSelectedIds(prev => prev.filter(id => id !== hit.id))
      }
      return
    }

    // Marquee selection drag
    if (marqueeBox.current) {
      marqueeBox.current.currentX = world.x
      marqueeBox.current.currentY = world.y

      const left = Math.min(marqueeBox.current.startX, world.x)
      const top = Math.min(marqueeBox.current.startY, world.y)
      const right = Math.max(marqueeBox.current.startX, world.x)
      const bottom = Math.max(marqueeBox.current.startY, world.y)

      const intersected = doc.elements.filter(el => {
        const b = getElementBounds(el)
        return b.x < right && b.x + b.width > left && b.y < bottom && b.y + b.height > top
      }).map(el => el.id)

      setSelectedIds(intersected)
      drawCanvas()
      return
    }

    // Moving selected elements (with attached lines updated in real-time!)
    if (tool === 'select' && dragHandle.current === 'move') {
      const dx = world.x - dragStartPoint.current.x
      const dy = world.y - dragStartPoint.current.y
      dragStartPoint.current = world

      setDoc(prev => {
        const moved = prev.elements.map(el => {
          if (selectedIds.includes(el.id)) {
            return {
              ...el,
              x: el.x + dx,
              y: el.y + dy
            }
          }
          return el
        })
        const withConnected = updateConnectedLines(moved, selectedIds)
        return { ...prev, elements: withConnected }
      })
      return
    }

    // Resizing single element via handles
    if (tool === 'select' && dragHandle.current && selectedIds.length === 1) {
      const handle = dragHandle.current
      const el = doc.elements.find(e => e.id === selectedIds[0])
      if (el) {
        // Point 1 of line/arrow
        if (handle === 'p1') {
          const fixedEndX = el.x + el.width
          const fixedEndY = el.y + el.height
          const newStartX = world.x
          const newStartY = world.y

          setDoc(prev => ({
            ...prev,
            elements: prev.elements.map(item =>
              item.id === el.id
                ? {
                    ...item,
                    x: newStartX,
                    y: newStartY,
                    width: fixedEndX - newStartX,
                    height: fixedEndY - newStartY,
                    startBinding: undefined
                  }
                : item
            )
          }))
          return
        }

        // Point 2 of line/arrow
        if (handle === 'p2') {
          setDoc(prev => ({
            ...prev,
            elements: prev.elements.map(item =>
              item.id === el.id
                ? {
                    ...item,
                    width: world.x - item.x,
                    height: world.y - item.y,
                    endBinding: undefined
                  }
                : item
            )
          }))
          return
        }

        // 4 corner handles for box shapes
        if (initialElementBounds.current) {
          const b = initialElementBounds.current
          let nextX = el.x
          let nextY = el.y
          let nextW = el.width
          let nextH = el.height

          if (handle === 'br') {
            nextW = Math.max(20, world.x - b.x)
            nextH = Math.max(20, world.y - b.y)
          } else if (handle === 'bl') {
            nextX = world.x
            nextW = Math.max(20, b.x + b.width - world.x)
            nextH = Math.max(20, world.y - b.y)
          } else if (handle === 'tr') {
            nextY = world.y
            nextW = Math.max(20, world.x - b.x)
            nextH = Math.max(20, b.y + b.height - world.y)
          } else if (handle === 'tl') {
            nextX = world.x
            nextY = world.y
            nextW = Math.max(20, b.x + b.width - world.x)
            nextH = Math.max(20, b.y + b.height - world.y)
          } else if (handle === 'mr') {
            // Expand width only via right-center handle
            nextW = Math.max(40, world.x - b.x)
          } else if (handle === 'mb') {
            // Expand height only via bottom-center handle
            nextH = Math.max(40, world.y - b.y)
          }

          setDoc(prev => {
            const resized = prev.elements.map(item =>
              item.id === el.id ? { ...item, x: nextX, y: nextY, width: nextW, height: nextH } : item
            )
            const withConnected = updateConnectedLines(resized, [el.id])
            return { ...prev, elements: withConnected }
          })
        }
      }
      return
    }

    // Drawing new shape or freedraw
    if (activeElementId.current) {
      const activeId = activeElementId.current
      const start = dragStartPoint.current

      setDoc(prev => ({
        ...prev,
        elements: prev.elements.map(el => {
          if (el.id !== activeId) return el

          if (el.type === 'freedraw') {
            const relPoint = { x: world.x - el.x, y: world.y - el.y }
            return {
              ...el,
              points: [...(el.points || []), relPoint]
            }
          }

          if (el.type === 'table') {
            const dragW = world.x - start.x
            const dragH = world.y - start.y
            const computedCols = Math.max(2, Math.min(10, Math.round(Math.abs(dragW) / 110)) || 2)
            const computedRows = Math.max(2, Math.min(10, Math.round(Math.abs(dragH) / 45)) || 2)
            setTableCreationPreview({
              screenX: e.clientX,
              screenY: e.clientY,
              rows: computedRows,
              cols: computedCols
            })
            return {
              ...el,
              width: dragW,
              height: dragH,
              cols: computedCols,
              rows: computedRows
            }
          }

          return {
            ...el,
            width: world.x - start.x,
            height: world.y - start.y
          }
        })
      }))
    }
  }

  // Pointer Up
  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    isPointerDown.current = false

    if (isPanning.current) {
      isPanning.current = false
      containerRef.current?.classList.remove('cursor-grabbing')
    }

    if (marqueeBox.current) {
      marqueeBox.current = null
    }

    setTableCreationPreview(null)

    if (dragHandle.current) {
      // Check if moving line endpoints landed on an object to bind
      const handle = dragHandle.current
      if (selectedIds.length === 1 && (handle === 'p1' || handle === 'p2')) {
        const el = docRef.current.elements.find(e => e.id === selectedIds[0])
        if (el && (el.type === 'line' || el.type === 'arrow')) {
          const pt = handle === 'p1' ? { x: el.x, y: el.y } : { x: el.x + el.width, y: el.y + el.height }
          const targetEl = docRef.current.elements
            .slice()
            .reverse()
            .find(other => other.id !== el.id && other.type !== 'line' && other.type !== 'arrow' && isPointInElement(pt, other))

          if (targetEl) {
            const anchor = findClosestAnchor(targetEl, pt)
            setDoc(prev => {
              const updated = prev.elements.map(item => {
                if (item.id !== el.id) return item
                if (handle === 'p1') {
                  const fixedEndX = item.x + item.width
                  const fixedEndY = item.y + item.height
                  return {
                    ...item,
                    x: anchor.point.x,
                    y: anchor.point.y,
                    width: fixedEndX - anchor.point.x,
                    height: fixedEndY - anchor.point.y,
                    startBinding: { elementId: targetEl.id, handle: anchor.handle },
                    connectorStyle: item.connectorStyle || 'orthogonal'
                  }
                } else {
                  return {
                    ...item,
                    width: anchor.point.x - item.x,
                    height: anchor.point.y - item.y,
                    endBinding: { elementId: targetEl.id, handle: anchor.handle },
                    connectorStyle: item.connectorStyle || 'orthogonal'
                  }
                }
              })
              return { ...prev, elements: updated }
            })
          }
        }
      }

      dragHandle.current = null
      initialElementBounds.current = null
      scheduleSave(docRef.current)
      pushHistory(docRef.current.elements)
    }

    // Handle N8N Output Connection completion: BIND TO TARGET ELEMENT!
    if (activeConnector.current) {
      const { fromId, handleId, startX, startY, currentX, currentY } = activeConnector.current
      activeConnector.current = null

      const fromEl = docRef.current.elements.find(el => el.id === fromId)

      if (fromEl) {
        const targetEl = docRef.current.elements
          .slice()
          .reverse()
          .find(el => el.id !== fromId && el.type !== 'line' && el.type !== 'arrow' && isPointInElement({ x: currentX, y: currentY }, el))

        let finalTargetX = currentX
        let finalTargetY = currentY
        let endBinding = undefined

        if (targetEl) {
          const anchor = findClosestAnchor(targetEl, { x: currentX, y: currentY })
          finalTargetX = anchor.point.x
          finalTargetY = anchor.point.y
          endBinding = { elementId: targetEl.id, handle: anchor.handle }
        }

        const newArrowId = 'elem_' + crypto.randomUUID()
        const newArrow: DrawElement = {
          id: newArrowId,
          type: 'arrow',
          x: startX,
          y: startY,
          width: finalTargetX - startX,
          height: finalTargetY - startY,
          strokeColor: fromEl.strokeColor || '#52525b',
          backgroundColor: 'transparent',
          strokeWidth: fromEl.strokeWidth || 2,
          strokeStyle: 'solid',
          fillStyle: 'none',
          startBinding: { elementId: fromEl.id, handle: handleId },
          endBinding,
          connectorStyle: 'orthogonal'
        }

        const nextElements = [...docRef.current.elements, newArrow]
        setDoc(prev => ({ ...prev, elements: nextElements }))
        setSelectedIds([newArrowId])
        scheduleSave({ ...docRef.current, elements: nextElements })
        pushHistory(nextElements)
      }
      return
    }

    // Creating new element: Handle Click vs Drag!
    if (activeElementId.current) {
      const id = activeElementId.current
      activeElementId.current = null

      const created = docRef.current.elements.find(el => el.id === id)
      if (!created) return

      const container = containerRef.current
      const rect = container?.getBoundingClientRect() || { left: 0, top: 0 }
      const screenX = e.clientX - rect.left
      const screenY = e.clientY - rect.top
      const distanceTraveled = Math.hypot(
        screenX - pointerDownScreen.current.x,
        screenY - pointerDownScreen.current.y
      )

      const isShapeTool = [
        'rectangle',
        'roundedRect',
        'ellipse',
        'diamond',
        'triangle',
        'triangleDown',
        'parallelogram',
        'cylinder',
        'sticky',
        'data-task',
        'table'
      ].includes(created.type)

      // KEY FEATURE: If user just CLICKED, spawn perfect default dimensions!
      if (isShapeTool && distanceTraveled < 8) {
        let defaultWidth = 140
        let defaultHeight = 90

        if (created.type === 'ellipse' || created.type === 'diamond') {
          defaultWidth = 120
          defaultHeight = 120
        } else if (created.type === 'triangle' || created.type === 'triangleDown') {
          defaultWidth = 120
          defaultHeight = 105
        } else if (created.type === 'cylinder') {
          defaultWidth = 110
          defaultHeight = 120
        } else if (created.type === 'sticky') {
          defaultWidth = 180
          defaultHeight = 180
        } else if (created.type === 'data-task') {
          defaultWidth = 580
          defaultHeight = 420
        } else if (created.type === 'table') {
          defaultWidth = 520
          defaultHeight = 150
        }

        const perfectX = created.x - defaultWidth / 2
        const perfectY = created.y - defaultHeight / 2

        const updatedElements = docRef.current.elements.map(el =>
          el.id === id
            ? {
                ...el,
                x: perfectX,
                y: perfectY,
                width: defaultWidth,
                height: defaultHeight,
                backgroundColor: created.type === 'sticky' ? '#ffd8a8' : created.type === 'data-task' || created.type === 'table' ? '#18181b' : el.backgroundColor,
                rows: created.type === 'table' ? 3 : el.rows,
                cols: created.type === 'table' ? 4 : el.cols,
                viewMode: created.type === 'data-task' ? 'calendar' : el.viewMode
              }
            : el
        )

        setDoc(prev => ({ ...prev, elements: updatedElements }))
        setSelectedIds([id])
        setTool('select')
        scheduleSave({ ...docRef.current, elements: updatedElements })
        pushHistory(updatedElements)
        return
      }

      // If user dragged but size is microscopic (< 5px), remove it
      if (created.type !== 'freedraw' && Math.abs(created.width) < 5 && Math.abs(created.height) < 5) {
        setDoc(prev => ({
          ...prev,
          elements: prev.elements.filter(el => el.id !== id)
        }))
        return
      }

      // Normalize negative width / height from manual drag (except for lines and arrows!)
      if (created.type !== 'line' && created.type !== 'arrow' && created.type !== 'freedraw') {
        const normX = created.width < 0 ? created.x + created.width : created.x
        const normY = created.height < 0 ? created.y + created.height : created.y
        const normW = Math.abs(created.width)
        const normH = Math.abs(created.height)

        const finalCols = created.type === 'table' ? Math.max(2, Math.min(10, Math.round(normW / 110)) || 2) : created.cols
        const finalRows = created.type === 'table' ? Math.max(2, Math.min(10, Math.round(normH / 45)) || 2) : created.rows

        const normalizedElements = docRef.current.elements.map(el =>
          el.id === id ? {
            ...el,
            x: normX,
            y: normY,
            width: normW,
            height: normH,
            cols: finalCols,
            rows: finalRows
          } : el
        )

        setDoc(prev => ({ ...prev, elements: normalizedElements }))
      }

      setSelectedIds([id])
      setTool('select')
      scheduleSave(docRef.current)
      pushHistory(docRef.current.elements)
    }
  }

  // Double click: edit text of text element or shape!
  const handleDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const container = containerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    const world = screenToWorld(e.clientX - rect.left, e.clientY - rect.top)

    const hit = doc.elements.slice().reverse().find(el => isPointInElement(world, el))
    if (!hit || hit.type === 'data-task' || hit.type === 'note-card') return

    if (hit.type === 'table') {
      const bounds = getElementBounds(hit)
      const rows = Math.max(1, hit.rows || 3)
      const cols = Math.max(1, hit.cols || 4)
      const colW = bounds.width / cols
      const rowH = bounds.height / rows
      const c = Math.max(0, Math.min(cols - 1, Math.floor((world.x - bounds.x) / colW)))
      const r = Math.max(0, Math.min(rows - 1, Math.floor((world.y - bounds.y) / rowH)))
      const cellX = bounds.x + c * colW
      const cellY = bounds.y + r * rowH
      const key = `${r}_${c}`
      const text = (hit.cells && hit.cells[key]) || ''

      setEditingTableCell({
        tableId: hit.id,
        row: r,
        col: c,
        x: cellX,
        y: cellY,
        width: colW,
        height: rowH,
        text
      })
      setTimeout(() => {
        tableCellInputRef.current?.focus()
        tableCellInputRef.current?.select()
      }, 30)
      return
    }

    const bounds = getElementBounds(hit)
    const isShape = hit.type !== 'text' && hit.type !== 'line' && hit.type !== 'arrow' && hit.type !== 'freedraw'

    setEditingText({
      id: hit.id,
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      text: hit.text || '',
      isShape
    })

    setTimeout(() => {
      textInputRef.current?.focus()
      textInputRef.current?.select()
    }, 20)
  }

  // Finish editing table cell
  const handleFinishEditingTableCell = (nextCell?: { r: number; c: number }) => {
    if (!editingTableCell) return
    const { tableId, row, col, text } = editingTableCell

    const key = `${row}_${col}`
    const nextElements = doc.elements.map(el => {
      if (el.id !== tableId) return el
      const newCells = { ...(el.cells || {}) }
      if (text.trim()) {
        newCells[key] = text
      } else {
        delete newCells[key]
      }
      return { ...el, cells: newCells }
    })

    setDoc(prev => {
      const next = { ...prev, elements: nextElements }
      scheduleSave(next)
      return next
    })
    pushHistory(nextElements)

    if (nextCell) {
      const el = nextElements.find(e => e.id === tableId)
      if (el) {
        const bounds = getElementBounds(el)
        const rows = Math.max(1, el.rows || 3)
        const cols = Math.max(1, el.cols || 4)
        if (nextCell.r >= 0 && nextCell.r < rows && nextCell.c >= 0 && nextCell.c < cols) {
          const colW = bounds.width / cols
          const rowH = bounds.height / rows
          const cellX = bounds.x + nextCell.c * colW
          const cellY = bounds.y + nextCell.r * rowH
          const nextKey = `${nextCell.r}_${nextCell.c}`
          const nextText = (el.cells && el.cells[nextKey]) || ''
          setEditingTableCell({
            tableId,
            row: nextCell.r,
            col: nextCell.c,
            x: cellX,
            y: cellY,
            width: colW,
            height: rowH,
            text: nextText
          })
          setTimeout(() => {
            tableCellInputRef.current?.focus()
            tableCellInputRef.current?.select()
          }, 30)
          return
        }
      }
    }

    setEditingTableCell(null)
  }

  // Table Structure Manipulation Handlers
  const handleAddTableRow = (tableId: string) => {
    setDoc(prev => {
      const updated = prev.elements.map(el => {
        if (el.id !== tableId) return el
        const currentRows = Math.max(1, el.rows || 3)
        const rowH = el.height / currentRows
        return {
          ...el,
          rows: currentRows + 1,
          height: el.height + rowH
        }
      })
      scheduleSave({ ...prev, elements: updated })
      pushHistory(updated)
      return { ...prev, elements: updated }
    })
  }

  const handleAddTableCol = (tableId: string) => {
    setDoc(prev => {
      const updated = prev.elements.map(el => {
        if (el.id !== tableId) return el
        const currentCols = Math.max(1, el.cols || 4)
        const colW = el.width / currentCols
        return {
          ...el,
          cols: currentCols + 1,
          width: el.width + colW
        }
      })
      scheduleSave({ ...prev, elements: updated })
      pushHistory(updated)
      return { ...prev, elements: updated }
    })
  }

  const handleInsertTableRow = (tableId: string, atIndex: number) => {
    setDoc(prev => {
      const updated = prev.elements.map(el => {
        if (el.id !== tableId) return el
        const currentRows = Math.max(1, el.rows || 3)
        const rowH = el.height / currentRows
        const oldCells = el.cells || {}
        const newCells: Record<string, string> = {}

        Object.entries(oldCells).forEach(([k, v]) => {
          const [rStr, cStr] = k.split('_')
          const r = parseInt(rStr, 10)
          const c = parseInt(cStr, 10)
          if (r >= atIndex) {
            newCells[`${r + 1}_${c}`] = v
          } else {
            newCells[k] = v
          }
        })

        return {
          ...el,
          rows: currentRows + 1,
          height: el.height + rowH,
          cells: newCells
        }
      })
      scheduleSave({ ...prev, elements: updated })
      pushHistory(updated)
      return { ...prev, elements: updated }
    })
  }

  const handleInsertTableCol = (tableId: string, atIndex: number) => {
    setDoc(prev => {
      const updated = prev.elements.map(el => {
        if (el.id !== tableId) return el
        const currentCols = Math.max(1, el.cols || 4)
        const colW = el.width / currentCols
        const oldCells = el.cells || {}
        const newCells: Record<string, string> = {}

        Object.entries(oldCells).forEach(([k, v]) => {
          const [rStr, cStr] = k.split('_')
          const r = parseInt(rStr, 10)
          const c = parseInt(cStr, 10)
          if (c >= atIndex) {
            newCells[`${r}_${c + 1}`] = v
          } else {
            newCells[k] = v
          }
        })

        return {
          ...el,
          cols: currentCols + 1,
          width: el.width + colW,
          cells: newCells
        }
      })
      scheduleSave({ ...prev, elements: updated })
      pushHistory(updated)
      return { ...prev, elements: updated }
    })
  }

  const handleDeleteTableRow = (tableId: string, rowIndex: number) => {
    setDoc(prev => {
      const updated = prev.elements.map(el => {
        if (el.id !== tableId) return el
        const currentRows = Math.max(1, el.rows || 3)
        if (currentRows <= 1) return el
        const rowH = el.height / currentRows
        const oldCells = el.cells || {}
        const newCells: Record<string, string> = {}

        Object.entries(oldCells).forEach(([k, v]) => {
          const [rStr, cStr] = k.split('_')
          const r = parseInt(rStr, 10)
          const c = parseInt(cStr, 10)
          if (r === rowIndex) {
            return
          }
          if (r > rowIndex) {
            newCells[`${r - 1}_${c}`] = v
          } else {
            newCells[k] = v
          }
        })

        return {
          ...el,
          rows: currentRows - 1,
          height: Math.max(40, el.height - rowH),
          cells: newCells
        }
      })
      scheduleSave({ ...prev, elements: updated })
      pushHistory(updated)
      return { ...prev, elements: updated }
    })
    setSelectedTableRow(null)
  }

  const handleDeleteTableCol = (tableId: string, colIndex: number) => {
    setDoc(prev => {
      const updated = prev.elements.map(el => {
        if (el.id !== tableId) return el
        const currentCols = Math.max(1, el.cols || 4)
        if (currentCols <= 1) return el
        const colW = el.width / currentCols
        const oldCells = el.cells || {}
        const newCells: Record<string, string> = {}

        Object.entries(oldCells).forEach(([k, v]) => {
          const [rStr, cStr] = k.split('_')
          const r = parseInt(rStr, 10)
          const c = parseInt(cStr, 10)
          if (c === colIndex) {
            return
          }
          if (c > colIndex) {
            newCells[`${r}_${c - 1}`] = v
          } else {
            newCells[k] = v
          }
        })

        return {
          ...el,
          cols: currentCols - 1,
          width: Math.max(80, el.width - colW),
          cells: newCells
        }
      })
      scheduleSave({ ...prev, elements: updated })
      pushHistory(updated)
      return { ...prev, elements: updated }
    })
    setSelectedTableCol(null)
  }

  // Finish editing text
  const handleFinishEditingText = () => {
    if (!editingText) return
    const { id, text, isShape } = editingText

    if (!isShape && !text.trim()) {
      const nextElements = doc.elements.filter(el => el.id !== id)
      setDoc(prev => {
        const next = { ...prev, elements: nextElements }
        scheduleSave(next)
        return next
      })
      pushHistory(nextElements)
    } else {
      const nextElements = doc.elements.map(el => el.id === id ? { ...el, text } : el)
      setDoc(prev => {
        const next = { ...prev, elements: nextElements }
        scheduleSave(next)
        return next
      })
      pushHistory(nextElements)
    }
    setEditingText(null)
  }

  // Update property of selected elements
  const updateSelectedProperty = <K extends keyof DrawElement>(key: K, value: DrawElement[K]) => {
    if (selectedIds.length === 0) return
    const updated = doc.elements.map(el => {
      if (selectedIds.includes(el.id)) {
        return { ...el, [key]: value }
      }
      return el
    })
    setDoc(prev => {
      const next = { ...prev, elements: updated }
      scheduleSave(next)
      return next
    })
    pushHistory(updated)
  }

  // Update property of specific element directly (works even when unselected, and selects it)
  const updateElementProperty = <K extends keyof DrawElement>(elementId: string, key: K, value: DrawElement[K]) => {
    setSelectedIds([elementId])
    const updated = doc.elements.map(el => (el.id === elementId ? { ...el, [key]: value } : el))
    setDoc(prev => {
      const next = { ...prev, elements: updated }
      scheduleSave(next)
      return next
    })
    pushHistory(updated)
  }

  // Duplicate Selected Elements
  const handleDuplicateSelected = () => {
    if (selectedIds.length === 0) return
    const selectedElements = doc.elements.filter(el => selectedIds.includes(el.id))
    const offset = 24

    const duplicated = selectedElements.map(el => ({
      ...el,
      id: 'elem_' + crypto.randomUUID(),
      x: el.x + offset,
      y: el.y + offset,
      startBinding: undefined,
      endBinding: undefined
    }))

    const nextElements = [...doc.elements, ...duplicated]
    setDoc(prev => {
      const next = { ...prev, elements: nextElements }
      scheduleSave(next)
      return next
    })
    pushHistory(nextElements)
    setSelectedIds(duplicated.map(d => d.id))
  }

  // Folders list for Note Import Modal
  const computedFolders = useMemo(() => {
    const set = new Set<string>()
    if (Array.isArray(folders)) {
      folders.forEach(f => f && set.add(f))
    }
    if (Array.isArray(notes)) {
      notes.forEach(n => n.folder && set.add(n.folder))
    }
    return Array.from(set).sort()
  }, [folders, notes])

  // Dedicated robust drag handler for DOM overlays (DataTask and NoteCard headers)
  const handleCardHeaderPointerDown = (e: React.PointerEvent<HTMLDivElement>, cardId: string) => {
    if (e.button !== 0) return
    const target = e.target as HTMLElement
    if (target.closest('button') || target.closest('input') || target.closest('select') || target.closest('a')) {
      return
    }

    e.preventDefault()
    e.stopPropagation()

    if (!selectedIds.includes(cardId)) {
      setSelectedIds([cardId])
    }

    const startClientX = e.clientX
    const startClientY = e.clientY
    const targetEl = docRef.current.elements.find(el => el.id === cardId)
    if (!targetEl) return

    const initialX = targetEl.x
    const initialY = targetEl.y
    const zoom = docRef.current.viewport.zoom

    let hasMoved = false

    const onPointerMove = (evt: PointerEvent) => {
      const deltaX = (evt.clientX - startClientX) / zoom
      const deltaY = (evt.clientY - startClientY) / zoom

      if (!hasMoved && Math.hypot(evt.clientX - startClientX, evt.clientY - startClientY) > 2) {
        hasMoved = true
      }

      setDoc(prev => {
        const moved = prev.elements.map(el => {
          if (el.id === cardId) {
            return {
              ...el,
              x: initialX + deltaX,
              y: initialY + deltaY
            }
          }
          return el
        })
        const withConnected = updateConnectedLines(moved, [cardId])
        return { ...prev, elements: withConnected }
      })
    }

    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerUp)

      if (hasMoved) {
        scheduleSave(docRef.current)
        pushHistory(docRef.current.elements)
      }
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerUp)
  }

  // Import Note as an interactive note card on canvas
  const handleImportNote = (selectedNote: Note) => {
    const container = containerRef.current
    const rect = container?.getBoundingClientRect() || { width: 1000, height: 700 }
    const defaultW = 540
    const defaultH = 620

    // Place in center of current viewport
    const centerX = (rect.width / 2 - doc.viewport.panX) / doc.viewport.zoom - defaultW / 2
    const centerY = (rect.height / 2 - doc.viewport.panY) / doc.viewport.zoom - defaultH / 2

    // If an existing note-card was selected, we can swap its note
    if (selectedIds.length === 1) {
      const existing = doc.elements.find(el => el.id === selectedIds[0] && el.type === 'note-card')
      if (existing) {
        const updated = doc.elements.map(el =>
          el.id === existing.id
            ? {
                ...el,
                noteId: selectedNote.id,
                noteTitle: selectedNote.title,
                noteContent: selectedNote.content,
                noteFolder: selectedNote.folder || ''
              }
            : el
        )
        setDoc(prev => ({ ...prev, elements: updated }))
        scheduleSave({ ...doc, elements: updated })
        pushHistory(updated)
        setIsImportNoteModalOpen(false)
        return
      }
    }

    const newId = 'note_card_' + crypto.randomUUID()
    const newElement: DrawElement = {
      id: newId,
      type: 'note-card',
      x: centerX,
      y: centerY,
      width: defaultW,
      height: defaultH,
      strokeColor: '#3f3f46',
      backgroundColor: '#18181e',
      strokeWidth: 1.5,
      strokeStyle: 'solid',
      fillStyle: 'solid',
      noteId: selectedNote.id,
      noteTitle: selectedNote.title,
      noteContent: selectedNote.content,
      noteFolder: selectedNote.folder || ''
    }

    const nextElements = [...doc.elements, newElement]
    setDoc(prev => ({ ...prev, elements: nextElements }))
    setSelectedIds([newId])
    setTool('select')
    scheduleSave({ ...doc, elements: nextElements })
    pushHistory(nextElements)
    setIsImportNoteModalOpen(false)
  }

  // Reorder
  const handleReorder = (direction: 'front' | 'back') => {
    if (selectedIds.length === 0) return
    const selectedSet = new Set(selectedIds)
    const selected = doc.elements.filter(el => selectedSet.has(el.id))
    const unselected = doc.elements.filter(el => !selectedSet.has(el.id))

    const nextElements = direction === 'front' ? [...unselected, ...selected] : [...selected, ...unselected]
    setDoc(prev => {
      const next = { ...prev, elements: nextElements }
      scheduleSave(next)
      return next
    })
    pushHistory(nextElements)
  }

  // Zoom controls
  const handleZoomChange = (delta: number) => {
    const current = doc.viewport.zoom
    const nextZoom = Math.min(3.0, Math.max(0.2, current + delta))
    const container = containerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    const cx = rect.width / 2
    const cy = rect.height / 2

    const world = screenToWorld(cx, cy)
    const newPanX = cx - world.x * nextZoom
    const newPanY = cy - world.y * nextZoom

    setDoc(prev => ({
      ...prev,
      viewport: { panX: newPanX, panY: newPanY, zoom: nextZoom }
    }))
  }

  const handleResetZoom = () => {
    setDoc(prev => ({
      ...prev,
      viewport: { ...prev.viewport, zoom: 1 }
    }))
  }

  const handleFitToView = () => {
    if (doc.elements.length === 0 || !containerRef.current) return
    const container = containerRef.current
    const rect = container.getBoundingClientRect()

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const el of doc.elements) {
      const b = getElementBounds(el)
      if (b.x < minX) minX = b.x
      if (b.y < minY) minY = b.y
      if (b.x + b.width > maxX) maxX = b.x + b.width
      if (b.y + b.height > maxY) maxY = b.y + b.height
    }

    const w = maxX - minX
    const h = maxY - minY
    const padding = 60

    const zoom = Math.min(2.0, Math.max(0.2, Math.min((rect.width - padding * 2) / w, (rect.height - padding * 2) / h)))
    const panX = (rect.width - w * zoom) / 2 - minX * zoom
    const panY = (rect.height - h * zoom) / 2 - minY * zoom

    setDoc(prev => ({
      ...prev,
      viewport: { panX, panY, zoom }
    }))
  }

  // Export to PNG
  const handleExportPNG = () => {
    if (doc.elements.length === 0) {
      alert('O quadro está vazio para exportar.')
      return
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const el of doc.elements) {
      const b = getElementBounds(el)
      if (b.x < minX) minX = b.x
      if (b.y < minY) minY = b.y
      if (b.x + b.width > maxX) maxX = b.x + b.width
      if (b.y + b.height > maxY) maxY = b.y + b.height
    }

    const padding = 40
    const exportWidth = (maxX - minX) + padding * 2
    const exportHeight = (maxY - minY) + padding * 2

    const offscreen = document.createElement('canvas')
    const scale = 2
    offscreen.width = exportWidth * scale
    offscreen.height = exportHeight * scale
    const ctx = offscreen.getContext('2d')
    if (!ctx) return

    ctx.scale(scale, scale)
    ctx.fillStyle = '#111114'
    ctx.fillRect(0, 0, exportWidth, exportHeight)

    ctx.save()
    ctx.translate(padding - minX, padding - minY)

    for (const el of doc.elements) {
      renderElementToCanvas(ctx, el, false, doc.elements)
    }
    ctx.restore()

    const link = document.createElement('a')
    link.download = `${note.title.replace(/[/\\?%*:|"<>]/g, '_') || 'pyrite-draw'}.png`
    link.href = offscreen.toDataURL('image/png')
    link.click()
  }

  // Clear Canvas
  const handleClearCanvas = () => {
    if (doc.elements.length === 0) return
    if (confirm('Tem certeza de que deseja limpar todo o desenho deste quadro?')) {
      const nextElements: DrawElement[] = []
      setDoc(prev => {
        const next = { ...prev, elements: nextElements }
        scheduleSave(next)
        return next
      })
      pushHistory(nextElements)
      setSelectedIds([])
      setOpenPopover(null)
      setShowCustomPicker(false)
    }
  }

  // Helper to format table cells / rows / columns / whole table
  const updateTableFormatting = (property: string, value: any) => {
    if (!singleSelectedElement || singleSelectedElement.type !== 'table') return
    const tableId = singleSelectedElement.id

    setDoc(prev => {
      const updated = prev.elements.map(el => {
        if (el.id !== tableId) return el
        const cellStyles = { ...(el.cellStyles || {}) }

        if (selectedTableCell && selectedTableCell.tableId === tableId) {
          // Format single cell
          const key = `${selectedTableCell.row}_${selectedTableCell.col}`
          cellStyles[key] = {
            ...cellStyles[key],
            [property]: value
          }
          return { ...el, cellStyles }
        }

        if (selectedTableCol !== null) {
          // Format whole column
          const rows = Math.max(1, el.rows || 3)
          for (let r = 0; r < rows; r++) {
            const key = `${r}_${selectedTableCol}`
            cellStyles[key] = {
              ...cellStyles[key],
              [property]: value
            }
          }
          return { ...el, cellStyles }
        }

        if (selectedTableRow !== null) {
          // Format whole row
          const cols = Math.max(1, el.cols || 4)
          for (let c = 0; c < cols; c++) {
            const key = `${selectedTableRow}_${c}`
            cellStyles[key] = {
              ...cellStyles[key],
              [property]: value
            }
          }
          return { ...el, cellStyles }
        }

        // Format whole table
        if (property === 'backgroundColor') return { ...el, backgroundColor: value }
        if (property === 'textColor') return { ...el, strokeColor: value }
        if (property === 'fontSize') return { ...el, fontSize: value }
        if (property === 'fontFamily') return { ...el, fontFamily: value }
        if (property === 'textAlign') return { ...el, textAlign: value }
        if (property === 'isBold') return { ...el, isBold: value }
        if (property === 'isStrikethrough') return { ...el, isStrikethrough: value }
        if (property === 'isList') return { ...el, isList: value }

        return el
      })

      scheduleSave({ ...prev, elements: updated })
      return { ...prev, elements: updated }
    })
  }

  // Read current formatting property for the active table selection target
  const getTableCurrentValue = (property: string, fallback: any) => {
    if (!singleSelectedElement || singleSelectedElement.type !== 'table') return fallback
    const cellStyles = singleSelectedElement.cellStyles || {}

    if (selectedTableCell && selectedTableCell.tableId === singleSelectedElement.id) {
      const key = `${selectedTableCell.row}_${selectedTableCell.col}`
      const st = cellStyles[key]
      if (st && (st as any)[property] !== undefined) return (st as any)[property]
    } else if (selectedTableCol !== null) {
      const key = `0_${selectedTableCol}`
      const st = cellStyles[key]
      if (st && (st as any)[property] !== undefined) return (st as any)[property]
    } else if (selectedTableRow !== null) {
      const key = `${selectedTableRow}_0`
      const st = cellStyles[key]
      if (st && (st as any)[property] !== undefined) return (st as any)[property]
    }

    if (property === 'backgroundColor') return singleSelectedElement.backgroundColor || fallback
    if (property === 'textColor') return singleSelectedElement.strokeColor || fallback
    if (property === 'fontSize') return singleSelectedElement.fontSize || fallback
    if (property === 'fontFamily') return singleSelectedElement.fontFamily || fallback
    if (property === 'textAlign') return singleSelectedElement.textAlign || fallback
    if (property === 'isBold') return singleSelectedElement.isBold ?? fallback
    if (property === 'isStrikethrough') return singleSelectedElement.isStrikethrough ?? fallback
    if (property === 'isList') return singleSelectedElement.isList ?? fallback

    return fallback
  }

  // Calculate Popover Position above or below selected element/cell
  const getPopoverPosition = () => {
    if (!singleSelectedElement) return null
    const bounds = getElementBounds(singleSelectedElement)
    const topScreen = worldToScreen(bounds.x + bounds.width / 2, bounds.y)
    const bottomScreen = worldToScreen(bounds.x + bounds.width / 2, bounds.y + bounds.height)

    const isTable = singleSelectedElement.type === 'table'

    // If a specific table cell is selected, position popover directly near the cell (matching FigJam reference)
    if (isTable && selectedTableCell && selectedTableCell.tableId === singleSelectedElement.id) {
      const tCols = Math.max(1, singleSelectedElement.cols || 4)
      const tRows = Math.max(1, singleSelectedElement.rows || 3)
      const colW = bounds.width / tCols
      const rowH = bounds.height / tRows
      const cellCenterX = bounds.x + selectedTableCell.col * colW + colW / 2
      const cellBottomY = bounds.y + (selectedTableCell.row + 1) * rowH
      const screenCellBottom = worldToScreen(cellCenterX, cellBottomY)
      let cellTop = screenCellBottom.y + 14
      let cellLeft = screenCellBottom.x
      if (cellTop > window.innerHeight - 80) {
        const cellTopY = bounds.y + selectedTableCell.row * rowH
        cellTop = worldToScreen(cellCenterX, cellTopY).y - 58
      }
      return { top: cellTop, left: cellLeft }
    }

    // If a specific table column is selected, center horizontally on that column
    if (isTable && selectedTableCol !== null) {
      const tCols = Math.max(1, singleSelectedElement.cols || 4)
      const colW = bounds.width / tCols
      const colCenterX = bounds.x + selectedTableCol * colW + colW / 2
      const colScreenX = worldToScreen(colCenterX, bounds.y).x
      let top = topScreen.y - 58
      if (top < 65) top = bottomScreen.y + 44
      return { top, left: colScreenX }
    }

    let top = isTable ? topScreen.y - 68 : topScreen.y - 52
    let left = topScreen.x

    if (top < 65) {
      top = bottomScreen.y + (isTable ? 44 : 16)
    }

    return { top, left }
  }

  const popoverPos = getPopoverPosition()

  const getShapeIcon = (type: DrawElementType) => {
    const found = SHAPE_OPTIONS.find(s => s.type === type)
    return found ? found.icon : Square
  }

  // Pre-index tasks by date for O(1) instant calendar lookup without filtering 42 times per frame
  const tasksByDate = useMemo(() => {
    const map = new Map<string, TaskItem[]>()
    for (const t of tasks) {
      if (t.date) {
        let list = map.get(t.date)
        if (!list) {
          list = []
          map.set(t.date, list)
        }
        list.push(t)
      }
      if (t.deadline && t.deadline !== t.date) {
        let list = map.get(t.deadline)
        if (!list) {
          list = []
          map.set(t.deadline, list)
        }
        list.push(t)
      }
    }
    return map
  }, [tasks])

  // Calendar calculations for DataTask widget
  const currentYear = calendarDate.getFullYear()
  const currentMonth = calendarDate.getMonth()
  const monthNames = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ]

  // Memoize calendar month cells calculation so it doesn't re-run on every mousemove
  const calendarCells = useMemo(() => {
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate()
    const firstDayIndex = new Date(currentYear, currentMonth, 1).getDay()
    const prevMonthDays = new Date(currentYear, currentMonth, 0).getDate()
    const cells: Array<{ day: number; isCurrentMonth: boolean; dateStr: string }> = []

    for (let i = firstDayIndex - 1; i >= 0; i--) {
      cells.push({ day: prevMonthDays - i, isCurrentMonth: false, dateStr: '' })
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      cells.push({ day: d, isCurrentMonth: true, dateStr })
    }
    const remaining = 35 - cells.length > 0 ? 35 - cells.length : 42 - cells.length
    for (let n = 1; n <= remaining; n++) {
      cells.push({ day: n, isCurrentMonth: false, dateStr: '' })
    }
    return cells
  }, [currentYear, currentMonth])

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-[#111114] overflow-hidden select-none touch-none dark-theme-zone"
    >
      {/* 1. Main Canvas */}
      <canvas
        ref={canvasRef}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onDoubleClick={handleDoubleClick}
        className="block w-full h-full"
      />

      {/* 2. Interactive DATA-TASK Frame Overlay (Live Task Database Widget) */}
      {doc.elements.filter(el => el.type === 'data-task').map(dataTaskEl => {
        const screenPos = worldToScreen(dataTaskEl.x, dataTaskEl.y)
        const currentView = dataTaskEl.viewMode || 'calendar'
        const currentBoardId = dataTaskEl.boardId || 'default'

        const filteredTasks = tasks.filter(t => currentBoardId === 'all' || (t.boardId || 'default') === currentBoardId)

        return (
          <div
            key={dataTaskEl.id}
            onPointerDown={() => {
              if (tool === 'select') {
                if (!selectedIds.includes(dataTaskEl.id)) {
                  setSelectedIds([dataTaskEl.id])
                }
              }
            }}
            className={`absolute z-10 rounded-2xl bg-[#15151a] border border-white/[0.08] shadow-2xl flex flex-col overflow-hidden text-xs text-zinc-200 transition-shadow ${
              tool !== 'select' ? 'pointer-events-none' : 'pointer-events-auto'
            }`}
            style={{
              transform: `translate3d(${screenPos.x}px, ${screenPos.y}px, 0)`,
              width: `${dataTaskEl.width * doc.viewport.zoom}px`,
              height: `${dataTaskEl.height * doc.viewport.zoom}px`,
              left: 0,
              top: 0,
              willChange: 'transform',
              boxShadow: '0 20px 45px -10px rgba(0,0,0,0.7)'
            }}
          >
            {/* Widget Top Header - Sleek Tonal Contrast + Drag Surface */}
            <div
              onPointerDown={(e) => handleCardHeaderPointerDown(e, dataTaskEl.id)}
              className="p-3 pb-2.5 bg-[#181820] flex items-center justify-between shrink-0 cursor-grab active:cursor-grabbing border-b border-white/[0.06]"
            >
              <div className="flex items-center gap-2 pointer-events-none">
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/[0.05] text-zinc-200 font-medium text-[11px]">
                  <Database className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
                  <span>{currentView === 'calendar' ? 'Calendário' : currentView === 'kanban' ? 'Quadro' : 'Data Task'}</span>
                </div>

                <div className="flex items-center gap-1 text-[11px] text-zinc-400">
                  <span>•</span>
                  <span className="font-medium text-zinc-300">
                    {taskSettings.boards?.find(b => b.id === currentBoardId)?.name || 'Geral'}
                  </span>
                  <span className="text-[10px] text-zinc-500">({filteredTasks.length} tarefas)</span>
                </div>
              </div>

              {/* View Switcher Pills */}
              <div
                className="flex items-center gap-1 bg-black/30 p-0.5 rounded-lg"
                onPointerDown={(e) => e.stopPropagation()}
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    updateElementProperty(dataTaskEl.id, 'viewMode', 'calendar')
                  }}
                  className={`px-2 py-1 rounded text-[10.5px] font-medium transition-colors cursor-pointer flex items-center gap-1 ${
                    currentView === 'calendar' ? 'text-white shadow-xs' : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                  style={currentView === 'calendar' ? { backgroundColor: 'var(--accent)' } : undefined}
                >
                  <CalendarDays className="w-3 h-3" />
                  <span>Mês</span>
                </button>

                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    updateElementProperty(dataTaskEl.id, 'viewMode', 'list')
                  }}
                  className={`px-2 py-1 rounded text-[10.5px] font-medium transition-colors cursor-pointer flex items-center gap-1 ${
                    currentView === 'list' ? 'text-white shadow-xs' : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                  style={currentView === 'list' ? { backgroundColor: 'var(--accent)' } : undefined}
                >
                  <TableProperties className="w-3 h-3" />
                  <span>Lista</span>
                </button>

                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    updateElementProperty(dataTaskEl.id, 'viewMode', 'kanban')
                  }}
                  className={`px-2 py-1 rounded text-[10.5px] font-medium transition-colors cursor-pointer flex items-center gap-1 ${
                    currentView === 'kanban' ? 'text-white shadow-xs' : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                  style={currentView === 'kanban' ? { backgroundColor: 'var(--accent)' } : undefined}
                >
                  <Kanban className="w-3 h-3" />
                  <span>Quadro</span>
                </button>

                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleReloadTasks()
                  }}
                  className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.08] transition-colors cursor-pointer"
                  title="Sincronizar tarefas do cofre"
                >
                  <RefreshCw className="w-3 h-3" />
                </button>
              </div>
            </div>

            {/* Widget Main View Area - Fluid Unified Body */}
            <div className="flex-1 overflow-auto flex flex-col bg-[#131317]">
              {/* VIEW 1: CALENDAR VIEW */}
              {currentView === 'calendar' && (
                <div className="flex-1 flex flex-col p-3 text-zinc-100 overflow-hidden">
                  {/* Calendar Top Month Navigation */}
                  <div className="flex items-center justify-between pb-2 mb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm tracking-tight text-zinc-200">
                        {monthNames[currentMonth]} {currentYear}
                      </span>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setCalendarDate(new Date(currentYear, currentMonth - 1, 1))
                        }}
                        className="p-1 text-zinc-400 hover:text-white rounded hover:bg-white/[0.06] transition-colors cursor-pointer"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setCalendarDate(new Date())
                        }}
                        className="px-2 py-0.5 rounded text-[10px] font-medium text-zinc-300 hover:text-white bg-white/[0.06] hover:bg-white/[0.1] transition-colors cursor-pointer"
                      >
                        Hoje
                      </button>

                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setCalendarDate(new Date(currentYear, currentMonth + 1, 1))
                        }}
                        className="p-1 text-zinc-400 hover:text-white rounded hover:bg-white/[0.06] transition-colors cursor-pointer"
                      >
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Calendar Days Header */}
                  <div className="grid grid-cols-7 gap-1 text-[10px] font-medium text-zinc-500 pb-1 text-center">
                    <span>Dom</span>
                    <span>Seg</span>
                    <span>Ter</span>
                    <span>Qua</span>
                    <span>Qui</span>
                    <span>Sex</span>
                    <span>Sáb</span>
                  </div>

                  {/* Calendar Month Cells Grid */}
                  <div className="grid grid-cols-7 gap-1 flex-1">
                    {calendarCells.map((cell, idx) => {
                      const rawDayTasks = cell.dateStr ? tasksByDate.get(cell.dateStr) || [] : []
                      const dayTasks = currentBoardId === 'all'
                        ? rawDayTasks
                        : rawDayTasks.filter(t => (t.boardId || 'default') === currentBoardId)
                      const isToday = cell.dateStr === new Date().toISOString().slice(0, 10)

                      return (
                        <div
                          key={idx}
                          className={`flex flex-col p-1.5 rounded-lg min-h-[42px] transition-colors ${
                            cell.isCurrentMonth
                              ? 'bg-white/[0.03] hover:bg-white/[0.06]'
                              : 'bg-black/20 opacity-30'
                          }`}
                          style={isToday ? { boxShadow: 'inset 0 0 0 1.5px var(--accent)' } : undefined}
                        >
                          <div className="flex items-center justify-between">
                            <span
                              className={`text-[10px] font-medium w-4 h-4 flex items-center justify-center rounded-full ${
                                isToday ? 'text-white font-bold' : 'text-zinc-300'
                              }`}
                              style={isToday ? { backgroundColor: 'var(--accent)' } : undefined}
                            >
                              {cell.day}
                            </span>
                            {dayTasks.length > 0 && (
                              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'var(--accent)' }} />
                            )}
                          </div>

                          {/* Task pills inside calendar cell */}
                          <div className="flex flex-col gap-0.5 mt-1 overflow-hidden">
                            {dayTasks.slice(0, 2).map(dt => (
                              <div
                                key={dt.id}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleToggleTask(dt.id)
                                }}
                                className={`text-[9px] truncate px-1.5 py-0.5 rounded cursor-pointer transition-opacity ${
                                  dt.completed ? 'line-through opacity-50 bg-white/[0.04] text-zinc-400' : 'bg-white/[0.08] hover:bg-white/[0.14] text-zinc-200'
                                }`}
                                title={dt.title}
                              >
                                {dt.title}
                              </div>
                            ))}
                            {dayTasks.length > 2 && (
                              <span className="text-[8px] text-zinc-500 font-medium">+{dayTasks.length - 2} mais</span>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* VIEW 2: LIST VIEW */}
              {currentView === 'list' && (
                <div className="flex-1 flex flex-col p-3 overflow-y-auto">
                  <div className="flex flex-col gap-1.5">
                    {filteredTasks.length === 0 ? (
                      <div className="text-center py-8 text-zinc-500 text-xs">
                        Nenhuma tarefa neste quadro.
                      </div>
                    ) : (
                      filteredTasks.map(task => (
                        <div
                          key={task.id}
                          onClick={() => handleToggleTask(task.id)}
                          className={`flex items-center justify-between p-2 rounded-lg transition-colors cursor-pointer ${
                            task.completed
                              ? 'bg-white/[0.02] opacity-50'
                              : 'bg-white/[0.04] hover:bg-white/[0.08]'
                          }`}
                        >
                          <div className="flex items-center gap-2 truncate">
                            <input
                              type="checkbox"
                              checked={task.completed}
                              onChange={() => handleToggleTask(task.id)}
                              className="rounded cursor-pointer"
                              style={{ accentColor: 'var(--accent)' }}
                            />
                            <span className={`text-xs font-medium truncate ${task.completed ? 'line-through text-zinc-400' : 'text-zinc-200'}`}>
                              {task.title}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {task.deadline && (
                              <span className="text-[10px] text-zinc-400 bg-white/[0.05] px-1.5 py-0.5 rounded font-mono">
                                {task.deadline}
                              </span>
                            )}
                            <span
                              className="text-[9.5px] px-2 py-0.5 rounded font-semibold text-white"
                              style={{
                                backgroundColor: taskSettings.statuses?.find(s => s.id === task.statusId)?.color || '#3b82f6'
                              }}
                            >
                              {taskSettings.statuses?.find(s => s.id === task.statusId)?.name || 'Status'}
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* VIEW 3: KANBAN VIEW */}
              {currentView === 'kanban' && (
                <div className="flex-1 flex gap-2.5 p-3 overflow-x-auto pb-2">
                  {(taskSettings.statuses || []).map(status => {
                    const statusTasks = filteredTasks.filter(t => t.statusId === status.id)
                    return (
                      <div key={status.id} className="w-48 shrink-0 bg-[#16161c] rounded-xl p-2.5 flex flex-col border border-white/[0.04]">
                        <div className="flex items-center justify-between pb-2 mb-2">
                          <div className="flex items-center gap-1.5 font-semibold text-[11px] text-zinc-200">
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: status.color }} />
                            <span>{status.name}</span>
                          </div>
                          <span className="text-[10px] text-zinc-500 font-mono">{statusTasks.length}</span>
                        </div>

                        <div className="flex-1 flex flex-col gap-1.5 overflow-y-auto">
                          {statusTasks.map(st => (
                            <div
                              key={st.id}
                              onClick={() => handleToggleTask(st.id)}
                              className="p-2.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] transition-colors cursor-pointer text-xs flex flex-col gap-1"
                            >
                              <span className={`font-medium text-zinc-200 ${st.completed ? 'line-through text-zinc-400' : ''}`}>
                                {st.title}
                              </span>
                              {st.deadline && (
                                <span className="text-[9.5px] text-zinc-400 font-mono">{st.deadline}</span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )
      })}

      {/* 2.5. Interactive NOTE-CARD Frame Overlay (Imported Vault Note Document) */}
      {doc.elements.filter(el => el.type === 'note-card').map(noteEl => {
        const screenPos = worldToScreen(noteEl.x, noteEl.y)

        // Try to read live note from vault, falling back to cached note fields in element
        const liveNote = notes.find(n => n.id === noteEl.noteId)
        const displayTitle = liveNote?.title || noteEl.noteTitle || 'Nota Sem Título'
        const displayContent = liveNote?.content !== undefined ? liveNote.content : noteEl.noteContent || ''
        const displayFolder = liveNote?.folder !== undefined ? liveNote.folder : noteEl.noteFolder || ''

        const NoteIcon = liveNote?.type === 'mindmap' ? Brain : liveNote?.type === 'draw' ? Palette : liveNote?.type === 'html' ? CodeXml : FileText

        return (
          <div
            key={noteEl.id}
            onPointerDown={() => {
              if (tool === 'select') {
                if (!selectedIds.includes(noteEl.id)) {
                  setSelectedIds([noteEl.id])
                }
              }
            }}
            className={`absolute z-10 rounded-2xl bg-[#15151a] border border-white/[0.08] shadow-2xl flex flex-col overflow-hidden text-xs text-zinc-200 transition-shadow ${
              tool !== 'select' ? 'pointer-events-none' : 'pointer-events-auto'
            }`}
            style={{
              transform: `translate3d(${screenPos.x}px, ${screenPos.y}px, 0)`,
              width: `${noteEl.width * doc.viewport.zoom}px`,
              height: `${noteEl.height * doc.viewport.zoom}px`,
              left: 0,
              top: 0,
              willChange: 'transform',
              boxShadow: '0 20px 45px -10px rgba(0,0,0,0.7)'
            }}
          >
            {/* Top Card Header - Drag Surface */}
            <div
              onPointerDown={(e) => handleCardHeaderPointerDown(e, noteEl.id)}
              className="p-3 pb-2.5 bg-[#181820] flex items-center justify-between shrink-0 cursor-grab active:cursor-grabbing border-b border-white/[0.06]"
            >
              <div className="flex items-center gap-2 min-w-0 pointer-events-none">
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/[0.05] text-zinc-100 font-semibold text-[11px] shrink-0">
                  <NoteIcon className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
                  <span className="truncate max-w-[160px]">{displayTitle}</span>
                </div>

                <div className="flex items-center gap-1 text-[10.5px] text-zinc-400 truncate">
                  <span>•</span>
                  <span className="truncate max-w-[140px]">📁 {displayFolder || 'Raiz'}</span>
                </div>
              </div>

              {/* Action Buttons: Sync from vault & Open in tab */}
              <div
                className="flex items-center gap-1 shrink-0"
                onPointerDown={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    if (liveNote) {
                      setDoc(prev => ({
                        ...prev,
                        elements: prev.elements.map(el =>
                          el.id === noteEl.id
                            ? {
                                ...el,
                                noteTitle: liveNote.title,
                                noteContent: liveNote.content,
                                noteFolder: liveNote.folder || ''
                              }
                            : el
                        )
                      }))
                    }
                  }}
                  className="p-1 text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.08] rounded transition-colors cursor-pointer"
                  title="Sincronizar com o conteúdo mais recente do cofre"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>

                {onOpenNote && noteEl.noteId && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      onOpenNote(noteEl.noteId!)
                    }}
                    className="p-1 text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.08] rounded transition-colors cursor-pointer"
                    title="Abrir nota no editor em nova aba"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Scrollable Content Body with live text / markdown preview */}
            <div
              className="flex-1 overflow-y-auto p-4 select-text leading-relaxed font-sans text-zinc-300 text-[13px] bg-[#131317] scrollbar-thin scrollbar-thumb-zinc-700/60"
              onPointerDown={() => {
                if (tool === 'select' && !selectedIds.includes(noteEl.id)) {
                  setSelectedIds([noteEl.id])
                }
              }}
            >
              {displayContent ? (
                <div className="whitespace-pre-wrap break-words">
                  {displayContent}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-zinc-500 text-xs italic">
                  Nota vazia
                </div>
              )}
            </div>

            {/* Bottom Card Footer */}
            <div className="px-3 py-2 border-t border-white/[0.06] bg-[#16161c] flex items-center justify-between text-[10px] text-zinc-500 font-mono shrink-0">
              <span>{displayContent.length} caracteres</span>
              <span>Documento acoplado</span>
            </div>
          </div>
        )
      })}

      {/* 3. Floating Selection Settings Popover (Appears ONLY when an element is selected) */}
      {singleSelectedElement && popoverPos && (
        <div
          className="absolute z-30 pointer-events-auto transition-transform"
          style={{
            top: `${popoverPos.top}px`,
            left: `${popoverPos.left}px`,
            transform: 'translate(-50%, 0)'
          }}
        >
          {/* Main Horizontal Popover Bar */}
          <div className="flex items-center gap-1 bg-[#1e1e22]/95 backdrop-blur-md border border-zinc-700/80 px-2 py-1.5 rounded-2xl shadow-2xl text-xs">
            {/* A. DATA-TASK WIDGET TOOLBAR */}
            {singleSelectedElement.type === 'data-task' ? (
              <>
                <div className="relative">
                  <button
                    onClick={() => setOpenPopover(prev => prev === 'dataTaskBoard' ? null : 'dataTaskBoard')}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
                    title="Escolher Conjunto / Quadro de Tarefas"
                  >
                    <FolderOpen className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
                    <span>{taskSettings.boards?.find(b => b.id === (singleSelectedElement.boardId || 'default'))?.name || 'Geral'}</span>
                    <ChevronDown className="w-3 h-3 text-zinc-400" />
                  </button>

                  {/* Board Selection Popover */}
                  {openPopover === 'dataTaskBoard' && (
                    <div className="absolute left-0 bottom-full mb-2 w-48 bg-[#1a1a1e] border border-zinc-700/80 rounded-xl shadow-2xl p-1.5 z-40 text-xs flex flex-col gap-1">
                      <span className="text-[10px] text-zinc-400 px-2 py-0.5 block">Conjuntos de Tarefas</span>
                      <button
                        onClick={() => {
                          updateSelectedProperty('boardId', 'all')
                          setOpenPopover(null)
                        }}
                        className={`px-2.5 py-1.5 rounded text-left transition-colors cursor-pointer ${
                          singleSelectedElement.boardId === 'all' ? 'text-white font-medium' : 'text-zinc-300 hover:bg-zinc-800'
                        }`}
                        style={singleSelectedElement.boardId === 'all' ? { backgroundColor: 'var(--accent)' } : undefined}
                      >
                        Todas as Tarefas
                      </button>
                      {(taskSettings.boards || []).map(b => (
                        <button
                          key={b.id}
                          onClick={() => {
                            updateSelectedProperty('boardId', b.id)
                            setOpenPopover(null)
                          }}
                          className={`px-2.5 py-1.5 rounded text-left transition-colors cursor-pointer ${
                            (singleSelectedElement.boardId || 'default') === b.id ? 'text-white font-medium' : 'text-zinc-300 hover:bg-zinc-800'
                          }`}
                          style={(singleSelectedElement.boardId || 'default') === b.id ? { backgroundColor: 'var(--accent)' } : undefined}
                        >
                          {b.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="w-px h-4 bg-zinc-700/80 mx-0.5" />
              </>
            ) : singleSelectedElement.type === 'sticky' ? (
              /* B. STICKY NOTE (POST-IT) TOOLBAR - Matching User Print 2 */
              <>
                {/* 1. Sticky Note Color button */}
                <div className="relative">
                  <button
                    onClick={() => setOpenPopover(prev => prev === 'stickyColor' ? null : 'stickyColor')}
                    className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer ${
                      openPopover === 'stickyColor' ? 'bg-zinc-800 text-white shadow-xs' : ''
                    }`}
                    title="Cor da nota"
                  >
                    <div
                      className="w-4 h-4 rounded-full border border-zinc-600 shadow-xs"
                      style={{ backgroundColor: singleSelectedElement.backgroundColor || '#ffd8a8' }}
                    />
                    <ChevronDown className="w-3 h-3 text-zinc-400" />
                  </button>

                  {/* Sticky Color Popover */}
                  {openPopover === 'stickyColor' && (
                    <div className="absolute left-0 bottom-full mb-2 w-48 bg-[#1a1a1e] border border-zinc-700/80 rounded-xl shadow-2xl p-2.5 z-40">
                      <span className="text-[10px] text-zinc-400 block mb-1.5">Cor do Post-it</span>
                      <div className="grid grid-cols-5 gap-1.5">
                        {STICKY_COLORS.map(color => (
                          <button
                            key={color}
                            onClick={() => {
                              updateSelectedProperty('backgroundColor', color)
                              setOpenPopover(null)
                            }}
                            className={`w-7 h-7 rounded-lg border transition-transform hover:scale-110 cursor-pointer ${
                              singleSelectedElement.backgroundColor === color
                                ? 'scale-105 ring-2'
                                : 'border-zinc-700/60'
                            }`}
                            style={{
                              backgroundColor: color,
                              borderColor: singleSelectedElement.backgroundColor === color ? 'var(--accent)' : undefined
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* 2. Font family selector Aa */}
                <button
                  onClick={() => {
                    const next = singleSelectedElement.fontFamily === 'sans' ? 'handwriting' : singleSelectedElement.fontFamily === 'handwriting' ? 'mono' : 'sans'
                    updateSelectedProperty('fontFamily', next)
                  }}
                  className="px-2 py-1.5 rounded-lg font-serif font-bold text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
                  title={`Fonte: ${singleSelectedElement.fontFamily || 'sans'}`}
                >
                  Aa
                </button>

                {/* 3. Text Size Dropdown ("Grande", "Normal", "Pequeno") */}
                <div className="relative">
                  <button
                    onClick={() => setOpenPopover(prev => prev === 'stickySize' ? null : 'stickySize')}
                    className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer ${
                      openPopover === 'stickySize' ? 'bg-zinc-800 text-white' : ''
                    }`}
                  >
                    <span>{singleSelectedElement.fontSize === 24 ? 'Grande' : singleSelectedElement.fontSize === 14 ? 'Pequeno' : 'Normal'}</span>
                    <ChevronDown className="w-3 h-3 text-zinc-400" />
                  </button>

                  {openPopover === 'stickySize' && (
                    <div className="absolute left-0 bottom-full mb-2 w-32 bg-[#1a1a1e] border border-zinc-700/80 rounded-xl shadow-2xl p-1.5 z-40 text-xs flex flex-col gap-1">
                      {[
                        { size: 14, label: 'Pequeno' },
                        { size: 18, label: 'Normal' },
                        { size: 24, label: 'Grande' }
                      ].map(opt => (
                        <button
                          key={opt.size}
                          onClick={() => {
                            updateSelectedProperty('fontSize', opt.size)
                            setOpenPopover(null)
                          }}
                          className={`px-2.5 py-1.5 rounded text-left transition-colors cursor-pointer ${
                            (singleSelectedElement.fontSize || 18) === opt.size ? 'text-white font-medium' : 'text-zinc-300 hover:bg-zinc-800'
                          }`}
                          style={(singleSelectedElement.fontSize || 18) === opt.size ? { backgroundColor: 'var(--accent)' } : undefined}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="w-px h-4 bg-zinc-700/80 mx-0.5" />

                {/* 4. Bold [ B ] */}
                <button
                  onClick={() => updateSelectedProperty('isBold', !singleSelectedElement.isBold)}
                  className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                    singleSelectedElement.isBold ? 'text-white shadow-xs' : 'text-zinc-300 hover:text-white hover:bg-zinc-800'
                  }`}
                  style={singleSelectedElement.isBold ? { backgroundColor: 'var(--accent)' } : undefined}
                  title="Negrito"
                >
                  <Bold className="w-3.5 h-3.5" />
                </button>

                {/* 5. Strikethrough [ S̶ ] */}
                <button
                  onClick={() => updateSelectedProperty('isStrikethrough', !singleSelectedElement.isStrikethrough)}
                  className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                    singleSelectedElement.isStrikethrough ? 'text-white shadow-xs' : 'text-zinc-300 hover:text-white hover:bg-zinc-800'
                  }`}
                  style={singleSelectedElement.isStrikethrough ? { backgroundColor: 'var(--accent)' } : undefined}
                  title="Tachado / Riscado"
                >
                  <Strikethrough className="w-3.5 h-3.5" />
                </button>

                {/* 6. Bullet List [ ≡: ] */}
                <button
                  onClick={() => updateSelectedProperty('isList', !singleSelectedElement.isList)}
                  className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                    singleSelectedElement.isList ? 'text-white shadow-xs' : 'text-zinc-300 hover:text-white hover:bg-zinc-800'
                  }`}
                  style={singleSelectedElement.isList ? { backgroundColor: 'var(--accent)' } : undefined}
                  title="Lista com Marcadores"
                >
                  <List className="w-3.5 h-3.5" />
                </button>
              </>
            ) : singleSelectedElement.type === 'table' ? (
              /* C. TABLE TOOLBAR - Matching User Prints & FigJam Spec */
              <>
                {/* 1. Table / Cell / Row / Column Background Color */}
                <div className="relative">
                  <button
                    onClick={() => setOpenPopover(prev => prev === 'tableColor' ? null : 'tableColor')}
                    className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer ${
                      openPopover === 'tableColor' ? 'bg-zinc-800 text-white shadow-xs' : ''
                    }`}
                    title={
                      selectedTableCell ? 'Cor da célula selecionada' :
                      selectedTableCol !== null ? `Cor da coluna ${selectedTableCol + 1}` :
                      selectedTableRow !== null ? `Cor da linha ${selectedTableRow + 1}` :
                      'Cor da tabela'
                    }
                  >
                    <div
                      className="w-4 h-4 rounded-full border border-zinc-600 shadow-xs"
                      style={{ backgroundColor: getTableCurrentValue('backgroundColor', '#18181b') }}
                    />
                    <ChevronDown className="w-3 h-3 text-zinc-400" />
                  </button>

                  {/* Color Popover */}
                  {openPopover === 'tableColor' && (
                    <div className="absolute left-0 bottom-full mb-2 w-52 bg-[#1a1a1e] border border-zinc-700/80 rounded-xl shadow-2xl p-2.5 z-40">
                      <span className="text-[10px] text-zinc-400 block mb-1.5">
                        {selectedTableCell ? 'Cor de fundo da Célula' :
                         selectedTableCol !== null ? `Cor de fundo da Coluna ${selectedTableCol + 1}` :
                         selectedTableRow !== null ? `Cor de fundo da Linha ${selectedTableRow + 1}` :
                         'Cor de fundo da Tabela'}
                      </span>
                      <div className="grid grid-cols-6 gap-1.5 mb-2">
                        {TABLE_COLORS.map(color => {
                          const currBg = getTableCurrentValue('backgroundColor', '#18181b')
                          return (
                            <button
                              key={color}
                              onClick={() => {
                                updateTableFormatting('backgroundColor', color)
                                setOpenPopover(null)
                              }}
                              className={`w-6 h-6 rounded-lg border transition-transform hover:scale-110 cursor-pointer ${
                                currBg === color
                                  ? 'scale-105 ring-2'
                                  : 'border-zinc-700/60'
                              }`}
                              style={{
                                backgroundColor: color,
                                borderColor: currBg === color ? 'var(--accent)' : undefined
                              }}
                              title={color}
                            />
                          )
                        })}

                        {/* Rainbow circle for Custom color picker */}
                        <button
                          ref={rainbowBtnRef}
                          onClick={(e) => {
                            e.stopPropagation()
                            setShowCustomPicker(prev => !prev)
                          }}
                          className="w-6 h-6 rounded-lg border border-zinc-700/60 transition-transform hover:scale-110 cursor-pointer shadow-xs"
                          style={{
                            background:
                              'conic-gradient(from 180deg at 50% 50%, #FF0000 0deg, #FFA500 50deg, #FFFF00 100deg, #008000 150deg, #00FFFF 200deg, #0000FF 250deg, #EE82EE 300deg, #FF0000 360deg)'
                          }}
                          title="Cor personalizada (Color Picker)"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* 2. Text Color & Font Popover [ Aa ▾ ] */}
                <div className="relative">
                  <button
                    onClick={() => setOpenPopover(prev => prev === 'tableTypography' ? null : 'tableTypography')}
                    className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer ${
                      openPopover === 'tableTypography' ? 'bg-zinc-800 text-white shadow-xs' : ''
                    }`}
                    title="Tipografia e Cor do Texto"
                  >
                    <span
                      className="font-serif font-bold text-xs"
                      style={{ color: getTableCurrentValue('textColor', '#f4f4f5') }}
                    >
                      Aa
                    </span>
                    <ChevronDown className="w-2.5 h-2.5 text-zinc-400" />
                  </button>

                  {openPopover === 'tableTypography' && (
                    <div className="absolute left-0 bottom-full mb-2 w-56 bg-[#1a1a1e] border border-zinc-700/80 rounded-xl shadow-2xl p-2.5 z-40 text-xs">
                      {/* Font family choices */}
                      <span className="text-[10px] text-zinc-400 block mb-1">Família da Fonte</span>
                      <div className="grid grid-cols-3 gap-1 mb-2.5">
                        {[
                          { id: 'sans', label: 'Sans', fontClass: 'font-sans' },
                          { id: 'handwriting', label: 'Escrita', fontClass: 'font-serif italic' },
                          { id: 'mono', label: 'Mono', fontClass: 'font-mono' }
                        ].map(f => {
                          const currFam = getTableCurrentValue('fontFamily', 'sans')
                          const isSel = currFam === f.id
                          return (
                            <button
                              key={f.id}
                              onClick={() => {
                                updateTableFormatting('fontFamily', f.id)
                                setOpenPopover(null)
                              }}
                              className={`py-1 px-1.5 rounded text-center transition-colors cursor-pointer ${
                                isSel ? 'text-white font-medium' : 'text-zinc-300 hover:bg-zinc-800'
                              } ${f.fontClass}`}
                              style={isSel ? { backgroundColor: 'var(--accent)' } : undefined}
                            >
                              {f.label}
                            </button>
                          )
                        })}
                      </div>

                      {/* Text Color presets */}
                      <span className="text-[10px] text-zinc-400 block mb-1">Cor do Texto</span>
                      <div className="grid grid-cols-6 gap-1.5">
                        {[
                          '#f4f4f5', '#a1a1aa', '#ef4444', '#f97316', '#eab308',
                          '#22c55e', '#06b6d4', '#3b82f6', '#a855f7', '#ec4899', '#ffffff', '#18181b'
                        ].map(c => {
                          const currColor = getTableCurrentValue('textColor', '#f4f4f5')
                          return (
                            <button
                              key={c}
                              onClick={() => {
                                updateTableFormatting('textColor', c)
                                setOpenPopover(null)
                              }}
                              className={`w-6 h-6 rounded-md border transition-transform hover:scale-110 cursor-pointer ${
                                currColor === c ? 'ring-2 ring-sky-400' : 'border-zinc-700/60'
                              }`}
                              style={{ backgroundColor: c }}
                              title={c}
                            />
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* 3. Text Size Dropdown ("Pequeno", "Médio", "Grande") */}
                <div className="relative">
                  <button
                    onClick={() => setOpenPopover(prev => prev === 'tableSize' ? null : 'tableSize')}
                    className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer ${
                      openPopover === 'tableSize' ? 'bg-zinc-800 text-white' : ''
                    }`}
                  >
                    <span>{getTableCurrentValue('fontSize', 14) === 18 ? 'Grande' : getTableCurrentValue('fontSize', 14) === 12 ? 'Pequeno' : 'Médio'}</span>
                    <ChevronDown className="w-3 h-3 text-zinc-400" />
                  </button>

                  {openPopover === 'tableSize' && (
                    <div className="absolute left-0 bottom-full mb-2 w-32 bg-[#1a1a1e] border border-zinc-700/80 rounded-xl shadow-2xl p-1.5 z-40 text-xs flex flex-col gap-1">
                      {[
                        { size: 12, label: 'Pequeno' },
                        { size: 14, label: 'Médio' },
                        { size: 18, label: 'Grande' }
                      ].map(opt => {
                        const currSize = getTableCurrentValue('fontSize', 14)
                        return (
                          <button
                            key={opt.size}
                            onClick={() => {
                              updateTableFormatting('fontSize', opt.size)
                              setOpenPopover(null)
                            }}
                            className={`px-2.5 py-1.5 rounded text-left transition-colors cursor-pointer ${
                              currSize === opt.size ? 'text-white font-medium' : 'text-zinc-300 hover:bg-zinc-800'
                            }`}
                            style={currSize === opt.size ? { backgroundColor: 'var(--accent)' } : undefined}
                          >
                            {opt.label}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>

                <div className="w-px h-4 bg-zinc-700/80 mx-0.5" />

                {/* 4. Bold [ B ] */}
                <button
                  onClick={() => updateTableFormatting('isBold', !getTableCurrentValue('isBold', false))}
                  className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                    getTableCurrentValue('isBold', false) ? 'text-white shadow-xs' : 'text-zinc-300 hover:text-white hover:bg-zinc-800'
                  }`}
                  style={getTableCurrentValue('isBold', false) ? { backgroundColor: 'var(--accent)' } : undefined}
                  title="Negrito"
                >
                  <Bold className="w-3.5 h-3.5" />
                </button>

                {/* 5. Strikethrough [ S̶ ] */}
                <button
                  onClick={() => updateTableFormatting('isStrikethrough', !getTableCurrentValue('isStrikethrough', false))}
                  className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                    getTableCurrentValue('isStrikethrough', false) ? 'text-white shadow-xs' : 'text-zinc-300 hover:text-white hover:bg-zinc-800'
                  }`}
                  style={getTableCurrentValue('isStrikethrough', false) ? { backgroundColor: 'var(--accent)' } : undefined}
                  title="Tachado / Riscado"
                >
                  <Strikethrough className="w-3.5 h-3.5" />
                </button>

                {/* 6. Bullet List [ ≡: ] */}
                <button
                  onClick={() => updateTableFormatting('isList', !getTableCurrentValue('isList', false))}
                  className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                    getTableCurrentValue('isList', false) ? 'text-white shadow-xs' : 'text-zinc-300 hover:text-white hover:bg-zinc-800'
                  }`}
                  style={getTableCurrentValue('isList', false) ? { backgroundColor: 'var(--accent)' } : undefined}
                  title="Lista com Marcadores"
                >
                  <List className="w-3.5 h-3.5" />
                </button>

                {/* 7. Alignment dropdown */}
                <div className="relative">
                  <button
                    onClick={() => setOpenPopover(prev => prev === 'tableAlign' ? null : 'tableAlign')}
                    className={`flex items-center gap-1 p-1.5 rounded-lg text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer ${
                      openPopover === 'tableAlign' ? 'bg-zinc-800 text-white shadow-xs' : ''
                    }`}
                    title="Alinhamento do texto"
                  >
                    {getTableCurrentValue('textAlign', 'left') === 'center' ? (
                      <AlignCenter className="w-3.5 h-3.5" />
                    ) : getTableCurrentValue('textAlign', 'left') === 'right' ? (
                      <AlignRight className="w-3.5 h-3.5" />
                    ) : (
                      <AlignLeft className="w-3.5 h-3.5" />
                    )}
                    <ChevronDown className="w-2.5 h-2.5 text-zinc-400" />
                  </button>

                  {openPopover === 'tableAlign' && (
                    <div className="absolute left-0 bottom-full mb-2 w-32 bg-[#1a1a1e] border border-zinc-700/80 rounded-xl shadow-2xl p-1.5 z-40 text-xs flex flex-col gap-1">
                      {[
                        { align: 'left', label: 'Esquerda', icon: AlignLeft },
                        { align: 'center', label: 'Centro', icon: AlignCenter },
                        { align: 'right', label: 'Direita', icon: AlignRight }
                      ].map(opt => {
                        const Icon = opt.icon
                        const currAlign = getTableCurrentValue('textAlign', 'left')
                        return (
                          <button
                            key={opt.align}
                            onClick={() => {
                              updateTableFormatting('textAlign', opt.align as any)
                              setOpenPopover(null)
                            }}
                            className={`flex items-center gap-1.5 px-2 py-1 rounded text-left transition-colors cursor-pointer ${
                              currAlign === opt.align ? 'text-white font-medium' : 'text-zinc-300 hover:bg-zinc-800'
                            }`}
                            style={currAlign === opt.align ? { backgroundColor: 'var(--accent)' } : undefined}
                          >
                            <Icon className="w-3.5 h-3.5" />
                            <span>{opt.label}</span>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>

                {/* 8. Delete / Clear Action depending on active selection target */}
                <div className="w-px h-4 bg-zinc-700/80 mx-0.5" />

                {selectedTableCol !== null ? (
                  <button
                    onClick={() => handleDeleteTableCol(singleSelectedElement.id, selectedTableCol)}
                    className="p-1.5 text-rose-400 hover:text-rose-300 hover:bg-rose-500/20 rounded-lg transition-colors cursor-pointer"
                    title={`Excluir coluna ${selectedTableCol + 1}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                ) : selectedTableRow !== null ? (
                  <button
                    onClick={() => handleDeleteTableRow(singleSelectedElement.id, selectedTableRow)}
                    className="p-1.5 text-rose-400 hover:text-rose-300 hover:bg-rose-500/20 rounded-lg transition-colors cursor-pointer"
                    title={`Excluir linha ${selectedTableRow + 1}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                ) : selectedTableCell ? (
                  <button
                    onClick={() => {
                      const key = `${selectedTableCell.row}_${selectedTableCell.col}`
                      setDoc(prev => {
                        const updated = prev.elements.map(el => {
                          if (el.id !== singleSelectedElement.id) return el
                          const cells = { ...(el.cells || {}) }
                          delete cells[key]
                          const cellStyles = { ...(el.cellStyles || {}) }
                          delete cellStyles[key]
                          return { ...el, cells, cellStyles }
                        })
                        scheduleSave({ ...prev, elements: updated })
                        return { ...prev, elements: updated }
                      })
                    }}
                    className="p-1.5 text-zinc-400 hover:text-rose-400 hover:bg-rose-500/20 rounded-lg transition-colors cursor-pointer"
                    title="Limpar conteúdo e formatação da célula"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      const idsToRemove = new Set(selectedIds)
                      const updated = doc.elements.filter(el => !idsToRemove.has(el.id))
                      setDoc(prev => {
                        const next = { ...prev, elements: updated }
                        scheduleSave(next)
                        return next
                      })
                      pushHistory(updated)
                      setSelectedIds([])
                      setOpenPopover(null)
                      setShowCustomPicker(false)
                    }}
                    className="p-1.5 text-rose-400 hover:text-rose-300 hover:bg-rose-500/20 rounded-lg transition-colors cursor-pointer"
                    title="Excluir tabela inteira"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </>
            ) : singleSelectedElement.type === 'note-card' ? (
              /* D. NOTE CARD TOOLBAR */
              <>
                <div className="flex items-center gap-1.5 px-2 py-1 text-zinc-300">
                  <FileText className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
                  <span className="font-medium truncate max-w-[160px]">
                    {singleSelectedElement.noteTitle || 'Nota Acoplada'}
                  </span>
                </div>

                <div className="w-px h-4 bg-zinc-700/80 mx-0.5" />

                <button
                  type="button"
                  onClick={() => setIsImportNoteModalOpen(true)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer text-xs"
                  title="Trocar nota acoplada"
                >
                  <Search className="w-3.5 h-3.5" />
                  <span>Trocar nota</span>
                </button>

                {onOpenNote && singleSelectedElement.noteId && (
                  <button
                    type="button"
                    onClick={() => onOpenNote(singleSelectedElement.noteId!)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer text-xs"
                    title="Abrir nota no editor"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Abrir</span>
                  </button>
                )}
              </>
            ) : (
              /* E. STANDARD SHAPES & ELEMENTS TOOLBAR */
              <>
                {/* Shape Switcher Button (For geometric shapes) */}
                {![ 'line', 'arrow', 'freedraw', 'text', 'note-card'].includes(singleSelectedElement.type) && (
                  <div className="relative">
                    <button
                      onClick={() => setOpenPopover(prev => prev === 'shape' ? null : 'shape')}
                      className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer ${
                        openPopover === 'shape' ? 'bg-zinc-800 text-white shadow-xs' : ''
                      }`}
                      title="Alterar tipo de forma"
                    >
                      {React.createElement(getShapeIcon(singleSelectedElement.type), { className: 'w-4 h-4' })}
                      <ChevronDown className="w-3 h-3 text-zinc-400" />
                    </button>

                    {/* Shape Picker Popover Menu */}
                    {openPopover === 'shape' && (
                      <div className="absolute left-0 bottom-full mb-2 w-64 bg-[#1a1a1e] border border-zinc-700/80 rounded-xl shadow-2xl p-2.5 z-40">
                        <div className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 mb-2.5">
                          <Search className="w-3.5 h-3.5 text-zinc-500" />
                          <input
                            type="text"
                            placeholder="Procure uma forma"
                            value={shapeSearch}
                            onChange={e => setShapeSearch(e.target.value)}
                            className="w-full bg-transparent text-xs text-zinc-200 placeholder-zinc-500 outline-none"
                            autoFocus
                          />
                        </div>

                        <div className="grid grid-cols-4 gap-1.5 max-h-48 overflow-y-auto scrollbar-none">
                          {SHAPE_OPTIONS.filter(s => s.label.toLowerCase().includes(shapeSearch.toLowerCase())).map(item => {
                            const Icon = item.icon
                            const isSelectedShape = singleSelectedElement.type === item.type
                            return (
                              <button
                                key={item.type}
                                onClick={() => {
                                  updateSelectedProperty('type', item.type)
                                  setOpenPopover(null)
                                }}
                                className={`flex flex-col items-center justify-center p-2 rounded-lg transition-all cursor-pointer ${
                                  isSelectedShape
                                    ? 'text-white shadow-md'
                                    : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80'
                                }`}
                                style={isSelectedShape ? { backgroundColor: 'var(--accent)' } : undefined}
                                title={item.label}
                              >
                                <Icon className="w-5 h-5 stroke-[1.8]" />
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Connector Style Switcher (Orthogonal vs Straight) */}
                {(singleSelectedElement.type === 'line' || singleSelectedElement.type === 'arrow') && (
                  <div className="flex items-center bg-zinc-900/80 p-0.5 rounded-lg border border-zinc-800">
                    <button
                      onClick={() => updateSelectedProperty('connectorStyle', 'orthogonal')}
                      className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors cursor-pointer ${
                        singleSelectedElement.connectorStyle !== 'straight'
                          ? 'text-white shadow-xs font-medium'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                      style={singleSelectedElement.connectorStyle !== 'straight' ? { backgroundColor: 'var(--accent)' } : undefined}
                      title="Conector Ortogonal Curvado"
                    >
                      <CornerDownRight className="w-3.5 h-3.5" />
                      <span>Ortogonal</span>
                    </button>
                    <button
                      onClick={() => updateSelectedProperty('connectorStyle', 'straight')}
                      className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors cursor-pointer ${
                        singleSelectedElement.connectorStyle === 'straight'
                          ? 'text-white shadow-xs font-medium'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                      style={singleSelectedElement.connectorStyle === 'straight' ? { backgroundColor: 'var(--accent)' } : undefined}
                      title="Linha Reta"
                    >
                      <Minus className="w-3.5 h-3.5" />
                      <span>Reta</span>
                    </button>
                  </div>
                )}

                {/* Color & Stroke Style Button */}
                <div className="relative">
                  <button
                    onClick={() => setOpenPopover(prev => prev === 'color' ? null : 'color')}
                    className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer ${
                      openPopover === 'color' ? 'bg-zinc-800 text-white shadow-xs' : ''
                    }`}
                    title="Cor do contorno e estilo"
                  >
                    <div
                      className="w-4 h-4 rounded-full border border-zinc-600 shadow-xs"
                      style={{ backgroundColor: singleSelectedElement.strokeColor || '#ffffff' }}
                    />
                    <ChevronDown className="w-3 h-3 text-zinc-400" />
                  </button>

                  {/* Color & Stroke Popover Menu */}
                  {openPopover === 'color' && (
                    <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-[340px] bg-[#1a1a1e] border border-zinc-700/80 rounded-2xl shadow-2xl p-3 z-40 text-xs">
                      {/* Top Pills: Sólido | Tracejado | Nada */}
                      <div className="flex items-center gap-1.5 bg-zinc-900/80 p-1 rounded-xl mb-3 border border-zinc-800">
                        <button
                          onClick={() => {
                            updateSelectedProperty('strokeStyle', 'solid')
                            if (singleSelectedElement.strokeWidth === 0) updateSelectedProperty('strokeWidth', 2)
                          }}
                          className={`flex-1 py-1.5 rounded-lg flex items-center justify-center gap-1.5 font-medium transition-colors cursor-pointer ${
                            singleSelectedElement.strokeStyle === 'solid' && singleSelectedElement.strokeWidth > 0
                              ? 'text-white shadow-xs'
                              : 'text-zinc-400 hover:text-zinc-200'
                          }`}
                          style={singleSelectedElement.strokeStyle === 'solid' && singleSelectedElement.strokeWidth > 0 ? { backgroundColor: 'var(--accent)' } : undefined}
                        >
                          <Minus className="w-3.5 h-3.5" />
                          <span>Sólido</span>
                        </button>

                        <button
                          onClick={() => {
                            updateSelectedProperty('strokeStyle', 'dashed')
                            if (singleSelectedElement.strokeWidth === 0) updateSelectedProperty('strokeWidth', 2)
                          }}
                          className={`flex-1 py-1.5 rounded-lg flex items-center justify-center gap-1.5 font-medium transition-colors cursor-pointer ${
                            singleSelectedElement.strokeStyle === 'dashed'
                              ? 'text-white shadow-xs'
                              : 'text-zinc-400 hover:text-zinc-200'
                          }`}
                          style={singleSelectedElement.strokeStyle === 'dashed' ? { backgroundColor: 'var(--accent)' } : undefined}
                        >
                          <span className="font-mono text-xs">┄</span>
                          <span>Tracejado</span>
                        </button>

                        <button
                          onClick={() => {
                            updateSelectedProperty('strokeWidth', 0)
                          }}
                          className={`flex-1 py-1.5 rounded-lg flex items-center justify-center gap-1.5 font-medium transition-colors cursor-pointer ${
                            singleSelectedElement.strokeWidth === 0
                              ? 'text-white shadow-xs'
                              : 'text-zinc-400 hover:text-zinc-200'
                          }`}
                          style={singleSelectedElement.strokeWidth === 0 ? { backgroundColor: 'var(--accent)' } : undefined}
                        >
                          <span className="text-xs">⊘</span>
                          <span>Nada</span>
                        </button>
                      </div>

                      {/* Row 1 of Colors: 11 Vibrant FigJam Colors */}
                      <div className="flex items-center justify-between gap-1 mb-2">
                        {FIGJAM_COLORS_ROW1.map(color => {
                          const isCurrent = singleSelectedElement.strokeColor === color
                          return (
                            <button
                              key={color}
                              onClick={() => {
                                setStrokeColor(color)
                                updateSelectedProperty('strokeColor', color)
                              }}
                              className={`w-6 h-6 rounded-full border transition-transform hover:scale-110 cursor-pointer ${
                                isCurrent
                                  ? 'scale-110 ring-2'
                                  : 'border-zinc-700/60'
                              }`}
                              style={{
                                backgroundColor: color,
                                borderColor: isCurrent ? 'var(--accent)' : undefined
                              }}
                              title={color}
                            />
                          )
                        })}
                      </div>

                      {/* Row 2 of Colors: 10 Pastels + 1 Custom Color Picker with Platform Design */}
                      <div className="flex items-center justify-between gap-1 mb-3">
                        {FIGJAM_COLORS_ROW2.map(color => {
                          const isCurrent = singleSelectedElement.strokeColor === color
                          return (
                            <button
                              key={color}
                              onClick={() => {
                                setStrokeColor(color)
                                updateSelectedProperty('strokeColor', color)
                              }}
                              className={`w-6 h-6 rounded-full border transition-transform hover:scale-110 cursor-pointer ${
                                isCurrent
                                  ? 'scale-110 ring-2'
                                  : 'border-zinc-700/60'
                              }`}
                              style={{
                                backgroundColor: color,
                                borderColor: isCurrent ? 'var(--accent)' : undefined
                              }}
                              title={color}
                            />
                          )
                        })}

                        {/* Rainbow circle button opening the platform CustomColorPickerPopover */}
                        <div className="relative">
                          <button
                            ref={rainbowBtnRef}
                            onClick={(e) => {
                              e.stopPropagation()
                              setShowCustomPicker(prev => !prev)
                            }}
                            className="w-6 h-6 rounded-full border border-zinc-700/60 transition-transform hover:scale-110 cursor-pointer shadow-xs"
                            style={{
                              background:
                                'conic-gradient(from 180deg at 50% 50%, #FF0000 0deg, #FFA500 50deg, #FFFF00 100deg, #008000 150deg, #00FFFF 200deg, #0000FF 250deg, #EE82EE 300deg, #FF0000 360deg)'
                            }}
                            title="Cor personalizada (Color Picker)"
                          />
                        </div>
                      </div>

                      {/* Fill Background options for closed shapes */}
                      {![ 'line', 'arrow', 'freedraw', 'text'].includes(singleSelectedElement.type) && (
                        <div className="pt-2 border-t border-zinc-800 flex items-center justify-between">
                          <span className="text-[11px] text-zinc-400 font-medium">Preenchimento:</span>
                          <div className="flex items-center gap-1">
                            {[
                              { id: 'none', label: 'Transparente' },
                              { id: 'semi', label: 'Suave' },
                              { id: 'solid', label: 'Sólido' }
                            ].map(f => (
                              <button
                                key={f.id}
                                onClick={() => {
                                  const fs = f.id as 'none' | 'semi' | 'solid'
                                  setFillStyle(fs)
                                  updateSelectedProperty('fillStyle', fs)
                                  if (fs !== 'none' && singleSelectedElement.backgroundColor === 'transparent') {
                                    updateSelectedProperty('backgroundColor', singleSelectedElement.strokeColor || '#339af0')
                                  }
                                }}
                                className={`px-2 py-0.5 rounded text-[10.5px] cursor-pointer transition-colors ${
                                  singleSelectedElement.fillStyle === f.id
                                    ? 'bg-zinc-750 text-white font-medium'
                                    : 'text-zinc-400 hover:text-zinc-200'
                                }`}
                              >
                                {f.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Typography & Text Alignment Button */}
                <div className="relative">
                  <button
                    onClick={() => setOpenPopover(prev => prev === 'typography' ? null : 'typography')}
                    className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer ${
                      openPopover === 'typography' ? 'bg-zinc-800 text-white shadow-xs' : ''
                    }`}
                    title="Texto e alinhamento"
                  >
                    <AlignLeft className="w-4 h-4" />
                    <ChevronDown className="w-3 h-3 text-zinc-400" />
                  </button>

                  {/* Typography Popover */}
                  {openPopover === 'typography' && (
                    <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-48 bg-[#1a1a1e] border border-zinc-700/80 rounded-xl shadow-2xl p-2.5 z-40 text-xs flex flex-col gap-2">
                      <div>
                        <span className="text-[10px] text-zinc-400 block mb-1">Alinhamento</span>
                        <div className="flex items-center gap-1 bg-zinc-900 p-0.5 rounded-lg border border-zinc-800">
                          {[
                            { id: 'left', icon: AlignLeft },
                            { id: 'center', icon: AlignCenter },
                            { id: 'right', icon: AlignRight }
                          ].map(a => {
                            const Icon = a.icon
                            const isCur = (singleSelectedElement.textAlign || 'center') === a.id
                            return (
                              <button
                                key={a.id}
                                onClick={() => updateSelectedProperty('textAlign', a.id as any)}
                                className={`flex-1 py-1 rounded flex items-center justify-center cursor-pointer ${
                                  isCur ? 'bg-zinc-750 text-white' : 'text-zinc-400 hover:text-zinc-200'
                                }`}
                              >
                                <Icon className="w-3.5 h-3.5" />
                              </button>
                            )
                          })}
                        </div>
                      </div>

                      <div>
                        <span className="text-[10px] text-zinc-400 block mb-1">Tamanho da Fonte</span>
                        <div className="flex items-center gap-1 bg-zinc-900 p-0.5 rounded-lg border border-zinc-800">
                          {[
                            { sz: 14, label: 'P' },
                            { sz: 18, label: 'M' },
                            { sz: 24, label: 'G' },
                            { sz: 32, label: 'GG' }
                          ].map(s => (
                            <button
                              key={s.sz}
                              onClick={() => {
                                setFontSize(s.sz)
                                updateSelectedProperty('fontSize', s.sz)
                              }}
                              className={`flex-1 py-1 rounded text-[11px] font-medium cursor-pointer ${
                                (singleSelectedElement.fontSize || 18) === s.sz ? 'text-white' : 'text-zinc-400 hover:text-zinc-200'
                              }`}
                              style={(singleSelectedElement.fontSize || 18) === s.sz ? { backgroundColor: 'var(--accent)' } : undefined}
                            >
                              {s.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <span className="text-[10px] text-zinc-400 block mb-1">Fonte</span>
                        <div className="flex items-center gap-1 bg-zinc-900 p-0.5 rounded-lg border border-zinc-800">
                          {[
                            { id: 'sans', label: 'Sans' },
                            { id: 'handwriting', label: 'Draw' },
                            { id: 'mono', label: 'Mono' }
                          ].map(f => (
                            <button
                              key={f.id}
                              onClick={() => {
                                setFontFamily(f.id as any)
                                updateSelectedProperty('fontFamily', f.id as any)
                              }}
                              className={`flex-1 py-1 rounded text-[10.5px] cursor-pointer ${
                                (singleSelectedElement.fontFamily || 'sans') === f.id ? 'text-white' : 'text-zinc-400 hover:text-zinc-200'
                              }`}
                              style={(singleSelectedElement.fontFamily || 'sans') === f.id ? { backgroundColor: 'var(--accent)' } : undefined}
                            >
                              {f.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Stroke Width selector (For lines, arrows, and borders) */}
                {singleSelectedElement.type !== 'text' && (
                  <div className="relative">
                    <button
                      onClick={() => setOpenPopover(prev => prev === 'stroke' ? null : 'stroke')}
                      className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer ${
                        openPopover === 'stroke' ? 'bg-zinc-800 text-white shadow-xs' : ''
                      }`}
                      title="Espessura da linha"
                    >
                      <Minus className="w-4 h-4 stroke-[2.5]" />
                      <span className="text-[10px] font-mono">{singleSelectedElement.strokeWidth || 2}px</span>
                    </button>

                    {openPopover === 'stroke' && (
                      <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-36 bg-[#1a1a1e] border border-zinc-700/80 rounded-xl shadow-2xl p-2 z-40 text-xs">
                        <span className="text-[10px] text-zinc-400 block mb-1.5">Espessura</span>
                        <div className="flex items-center gap-1">
                          {[
                            { w: 1, label: '1px' },
                            { w: 2, label: '2px' },
                            { w: 4, label: '4px' },
                            { w: 6, label: '6px' }
                          ].map(st => (
                            <button
                              key={st.w}
                              onClick={() => {
                                setStrokeWidth(st.w)
                                updateSelectedProperty('strokeWidth', st.w)
                                setOpenPopover(null)
                              }}
                              className={`flex-1 py-1 rounded text-[10.5px] font-medium cursor-pointer ${
                                (singleSelectedElement.strokeWidth || 2) === st.w ? 'text-white' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                              }`}
                              style={(singleSelectedElement.strokeWidth || 2) === st.w ? { backgroundColor: 'var(--accent)' } : undefined}
                            >
                              {st.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            <div className="w-px h-4 bg-zinc-700/80 mx-0.5" />

            {/* Quick Actions: Duplicate & Delete */}
            <button
              onClick={handleDuplicateSelected}
              className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer"
              title="Duplicar (Ctrl+D)"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={() => handleReorder('front')}
              className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer"
              title="Trazer para frente"
            >
              <Layers className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={() => {
                const idsToRemove = new Set(selectedIds)
                const updated = doc.elements.filter(el => !idsToRemove.has(el.id))
                setDoc(prev => {
                  const next = { ...prev, elements: updated }
                  scheduleSave(next)
                  return next
                })
                pushHistory(updated)
                setSelectedIds([])
                setOpenPopover(null)
                setShowCustomPicker(false)
              }}
              className="p-1.5 text-rose-400 hover:text-rose-200 hover:bg-rose-500/20 rounded-lg transition-colors cursor-pointer"
              title="Excluir (Del)"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* 4. Platform-matching Custom Color Picker Popover */}
      {showCustomPicker && rainbowBtnRef.current && (
        <CustomColorPickerPopover
          anchorEl={rainbowBtnRef.current}
          currentColor={
            singleSelectedElement?.type === 'table'
              ? singleSelectedElement.backgroundColor || '#18181b'
              : singleSelectedElement?.type === 'sticky'
                ? singleSelectedElement.backgroundColor || '#ffd8a8'
                : singleSelectedElement?.strokeColor || '#c59b27'
          }
          onChange={(newColor) => {
            if (singleSelectedElement?.type === 'table' || singleSelectedElement?.type === 'sticky') {
              updateSelectedProperty('backgroundColor', newColor)
            } else {
              setStrokeColor(newColor)
              updateSelectedProperty('strokeColor', newColor)
            }
          }}
          onClose={() => setShowCustomPicker(false)}
          align="center"
        />
      )}

      {/* 5. Bottom Floating FigJam Main Toolbar */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-[#18181d]/92 backdrop-blur-md border border-zinc-700/80 px-2 py-1.5 rounded-2xl shadow-2xl z-20">
        {/* Pointer / Selection */}
        <button
          onClick={() => {
            setTool('select')
            setIsBottomShapesOpen(false)
          }}
          title="Seleção (V / 1)"
          className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
            tool === 'select'
              ? 'text-white font-semibold shadow-md scale-105'
              : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80'
          }`}
          style={tool === 'select' ? { backgroundColor: 'var(--accent)' } : undefined}
        >
          <MousePointer className="w-4 h-4 stroke-[2]" />
        </button>

        {/* FORMAS (Single unified Shapes button with Popover!) */}
        <div className="relative">
          <button
            onClick={() => setIsBottomShapesOpen(prev => !prev)}
            title="Formas Geométricas (Clique para escolher)"
            className={`h-9 px-2.5 rounded-xl flex items-center gap-1 transition-all cursor-pointer ${
              ['rectangle', 'ellipse', 'diamond', 'triangle', 'triangleDown', 'roundedRect', 'parallelogram', 'cylinder'].includes(tool) || isBottomShapesOpen
                ? 'text-white font-semibold shadow-md scale-105'
                : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80'
            }`}
            style={
              ['rectangle', 'ellipse', 'diamond', 'triangle', 'triangleDown', 'roundedRect', 'parallelogram', 'cylinder'].includes(tool) || isBottomShapesOpen
                ? { backgroundColor: 'var(--accent)' }
                : undefined
            }
          >
            <Shapes className="w-4 h-4 stroke-[2]" />
            <ChevronDown className="w-3 h-3 text-zinc-300" />
          </button>

          {/* Bottom Shapes Popover */}
          {isBottomShapesOpen && (
            <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-3 w-64 bg-[#1a1a1e] border border-zinc-700/80 rounded-2xl shadow-2xl p-2.5 z-40 text-xs">
              <div className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 mb-2.5">
                <Search className="w-3.5 h-3.5 text-zinc-500" />
                <input
                  type="text"
                  placeholder="Procure uma forma"
                  value={bottomShapesSearch}
                  onChange={e => setBottomShapesSearch(e.target.value)}
                  className="w-full bg-transparent text-xs text-zinc-200 placeholder-zinc-500 outline-none"
                  autoFocus
                />
              </div>

              <div className="grid grid-cols-4 gap-1.5 max-h-48 overflow-y-auto scrollbar-none">
                {SHAPE_OPTIONS.filter(s => s.label.toLowerCase().includes(bottomShapesSearch.toLowerCase())).map(item => {
                  const Icon = item.icon
                  const isActive = tool === item.type
                  return (
                    <button
                      key={item.type}
                      onClick={() => {
                        setTool(item.type as DrawTool)
                        setIsBottomShapesOpen(false)
                        setSelectedIds([])
                      }}
                      className={`flex flex-col items-center justify-center p-2 rounded-lg transition-all cursor-pointer ${
                        isActive
                          ? 'text-white shadow-md'
                          : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80'
                      }`}
                      style={isActive ? { backgroundColor: 'var(--accent)' } : undefined}
                      title={item.label}
                    >
                      <Icon className="w-5 h-5 stroke-[1.8]" />
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* NOTA / POST-IT (STICKY NOTE) */}
        <button
          onClick={() => {
            setTool('sticky')
            setSelectedIds([])
            setIsBottomShapesOpen(false)
          }}
          title="Nota Adesiva / Post-it (N / S) - Clique na tela para criar"
          className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
            tool === 'sticky'
              ? 'text-white font-semibold shadow-md scale-105'
              : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80'
          }`}
          style={tool === 'sticky' ? { backgroundColor: 'var(--accent)' } : undefined}
        >
          <StickyNote className="w-4 h-4 stroke-[2]" />
        </button>

        {/* DATA-TASK (Banco de dados de tarefas / Calendar Frame) */}
        <button
          onClick={() => {
            setTool('data-task')
            setSelectedIds([])
            setIsBottomShapesOpen(false)
          }}
          title="Data Task - Banco de tarefas (K)"
          className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
            tool === 'data-task'
              ? 'text-white font-semibold shadow-md scale-105'
              : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80'
          }`}
          style={tool === 'data-task' ? { backgroundColor: 'var(--accent)' } : undefined}
        >
          <Database className="w-4 h-4 stroke-[2]" />
        </button>

        {/* TABELA (FigJam Table tool) */}
        <button
          onClick={() => {
            setTool('table')
            setSelectedIds([])
            setIsBottomShapesOpen(false)
          }}
          title="Tabela (B) - Clique ou arraste para definir tamanho"
          className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
            tool === 'table'
              ? 'text-white font-semibold shadow-md scale-105'
              : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80'
          }`}
          style={tool === 'table' ? { backgroundColor: 'var(--accent)' } : undefined}
        >
          <Table className="w-4 h-4 stroke-[2]" />
        </button>

        {/* IMPORTAR NOTA / DOCUMENTO ACOPLADO */}
        <button
          onClick={() => {
            setIsImportNoteModalOpen(true)
            setIsBottomShapesOpen(false)
          }}
          title="Importar Nota do Cofre (Documento Acoplado)"
          className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
            isImportNoteModalOpen
              ? 'text-white font-semibold shadow-md scale-105'
              : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80'
          }`}
          style={isImportNoteModalOpen ? { backgroundColor: 'var(--accent)' } : undefined}
        >
          <FileText className="w-4 h-4 stroke-[2]" />
        </button>

        {/* Seta / Conector */}
        <button
          onClick={() => {
            setTool('arrow')
            setSelectedIds([])
            setIsBottomShapesOpen(false)
          }}
          title="Seta Livre (A / 5)"
          className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
            tool === 'arrow'
              ? 'text-white font-semibold shadow-md scale-105'
              : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80'
          }`}
          style={tool === 'arrow' ? { backgroundColor: 'var(--accent)' } : undefined}
        >
          <ArrowUpRight className="w-4 h-4 stroke-[2]" />
        </button>

        {/* Linha Reta */}
        <button
          onClick={() => {
            setTool('line')
            setSelectedIds([])
            setIsBottomShapesOpen(false)
          }}
          title="Linha Reta (L / 6)"
          className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
            tool === 'line'
              ? 'text-white font-semibold shadow-md scale-105'
              : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80'
          }`}
          style={tool === 'line' ? { backgroundColor: 'var(--accent)' } : undefined}
        >
          <Minus className="w-4 h-4 stroke-[2]" />
        </button>

        {/* Caneta / Freedraw */}
        <button
          onClick={() => {
            setTool('freedraw')
            setSelectedIds([])
            setIsBottomShapesOpen(false)
          }}
          title="Lápis / Caneta (P / 7)"
          className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
            tool === 'freedraw'
              ? 'text-white font-semibold shadow-md scale-105'
              : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80'
          }`}
          style={tool === 'freedraw' ? { backgroundColor: 'var(--accent)' } : undefined}
        >
          <PenTool className="w-4 h-4 stroke-[2]" />
        </button>

        {/* Texto */}
        <button
          onClick={() => {
            setTool('text')
            setSelectedIds([])
            setIsBottomShapesOpen(false)
          }}
          title="Texto (T / 8)"
          className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
            tool === 'text'
              ? 'text-white font-semibold shadow-md scale-105'
              : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80'
          }`}
          style={tool === 'text' ? { backgroundColor: 'var(--accent)' } : undefined}
        >
          <Type className="w-4 h-4 stroke-[2]" />
        </button>

        {/* Borracha */}
        <button
          onClick={() => {
            setTool('eraser')
            setSelectedIds([])
            setIsBottomShapesOpen(false)
          }}
          title="Borracha (E / 9)"
          className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
            tool === 'eraser'
              ? 'text-white font-semibold shadow-md scale-105'
              : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80'
          }`}
          style={tool === 'eraser' ? { backgroundColor: 'var(--accent)' } : undefined}
        >
          <Eraser className="w-4 h-4 stroke-[2]" />
        </button>

        {/* Pan */}
        <button
          onClick={() => {
            setTool('pan')
            setSelectedIds([])
            setIsBottomShapesOpen(false)
          }}
          title="Mover Tela (H / Espaço)"
          className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
            tool === 'pan'
              ? 'text-white font-semibold shadow-md scale-105'
              : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80'
          }`}
          style={tool === 'pan' ? { backgroundColor: 'var(--accent)' } : undefined}
        >
          <Hand className="w-4 h-4 stroke-[2]" />
        </button>
      </div>

      {/* 6. Top Right Floating Export & Actions Panel */}
      <div className="absolute top-3 right-3 flex items-center gap-1.5 bg-[#18181d]/90 backdrop-blur-md border border-zinc-700/80 p-1 rounded-xl shadow-2xl z-20">
        <button
          onClick={handleExportPNG}
          className="flex items-center gap-1 px-3 py-1.5 text-white font-semibold rounded-lg text-xs transition-opacity shadow-sm cursor-pointer"
          style={{ backgroundColor: 'var(--accent)' }}
          title="Exportar Desenho em Alta Resolução (PNG)"
        >
          <Download className="w-3.5 h-3.5 stroke-[2.5]" />
          <span>Exportar PNG</span>
        </button>

        <button
          onClick={handleClearCanvas}
          className="p-1.5 text-zinc-400 hover:text-rose-400 hover:bg-zinc-800/80 rounded-lg transition-colors cursor-pointer"
          title="Limpar tela inteira"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* 7. Bottom Left Floating Navigation & Zoom Controls */}
      <div className="absolute bottom-6 left-6 flex items-center gap-1 bg-[#18181d]/90 backdrop-blur-md border border-zinc-700/80 p-1 rounded-xl shadow-2xl z-20 text-xs">
        <button
          onClick={handleUndo}
          className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80 rounded-lg transition-colors cursor-pointer"
          title="Desfazer (Ctrl+Z)"
        >
          <Undo2 className="w-4 h-4" />
        </button>

        <button
          onClick={handleRedo}
          className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80 rounded-lg transition-colors cursor-pointer"
          title="Refazer (Ctrl+Y)"
        >
          <Redo2 className="w-4 h-4" />
        </button>

        <div className="w-px h-4 bg-zinc-700/80 mx-1" />

        <button
          onClick={() => handleZoomChange(-0.15)}
          className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80 rounded-lg transition-colors cursor-pointer"
          title="Zoom Out (-)"
        >
          <ZoomOut className="w-4 h-4" />
        </button>

        <button
          onClick={handleResetZoom}
          className="px-2 py-1 text-zinc-300 hover:text-white font-mono text-[11px] rounded-lg transition-colors cursor-pointer"
          title="Resetar Zoom para 100%"
        >
          {Math.round(doc.viewport.zoom * 100)}%
        </button>

        <button
          onClick={() => handleZoomChange(0.15)}
          className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80 rounded-lg transition-colors cursor-pointer"
          title="Zoom In (+)"
        >
          <ZoomIn className="w-4 h-4" />
        </button>

        <button
          onClick={handleFitToView}
          className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80 rounded-lg transition-colors cursor-pointer"
          title="Ajustar Tudo à Tela"
        >
          <Maximize2 className="w-4 h-4" />
        </button>
      </div>

      {/* 8. In-place Overlay Text Editor for Shapes, Sticky & Pure Text */}
      {editingText && (
        <div
          className="absolute z-30"
          style={{
            left: `${worldToScreen(editingText.x, editingText.y).x}px`,
            top: `${worldToScreen(editingText.x, editingText.y).y}px`,
            width: `${Math.max(40, editingText.width) * doc.viewport.zoom}px`,
            height: editingText.isShape ? `${editingText.height * doc.viewport.zoom}px` : undefined,
            display: editingText.isShape ? 'flex' : undefined,
            alignItems: editingText.isShape ? 'center' : undefined,
            justifyContent: editingText.isShape ? 'center' : undefined
          }}
        >
          <textarea
            ref={textInputRef}
            value={editingText.text}
            onChange={e => setEditingText(prev => prev ? { ...prev, text: e.target.value } : null)}
            onBlur={handleFinishEditingText}
            onKeyDown={e => {
              if (e.key === 'Escape') {
                e.preventDefault()
                handleFinishEditingText()
              }
            }}
            placeholder={editingText.isShape ? 'Adicionar texto...' : 'Digite algo...'}
            className={`text-zinc-100 outline-none p-2 resize-none font-sans ${
              editingText.isShape
                ? 'bg-transparent border-none w-full max-h-full leading-tight text-center'
                : 'bg-[#18181d]/95 rounded-lg shadow-2xl w-full leading-snug border'
            }`}
            style={{
              fontSize: `${fontSize * doc.viewport.zoom}px`,
              lineHeight: 1.25,
              borderColor: 'var(--accent)'
            }}
          />
        </div>
      )}

      {/* 9. In-place Overlay Text Editor for Table Cells (Transparent background matching FigJam) */}
      {editingTableCell && (
        <div
          className="absolute z-35"
          style={{
            left: `${worldToScreen(editingTableCell.x, editingTableCell.y).x}px`,
            top: `${worldToScreen(editingTableCell.x, editingTableCell.y).y}px`,
            width: `${editingTableCell.width * doc.viewport.zoom}px`,
            height: `${editingTableCell.height * doc.viewport.zoom}px`
          }}
        >
          {(() => {
            const table = doc.elements.find(el => el.id === editingTableCell.tableId)
            const cellKey = `${editingTableCell.row}_${editingTableCell.col}`
            const cellSt = table?.cellStyles?.[cellKey]
            const cellFontSize = (cellSt?.fontSize || table?.fontSize || 14) * doc.viewport.zoom
            const cellFontFam = cellSt?.fontFamily === 'mono' ? 'monospace' : cellSt?.fontFamily === 'handwriting' ? 'Caveat, cursive, sans-serif' : 'Inter, system-ui, sans-serif'
            const cellColor = cellSt?.textColor || table?.strokeColor || '#f4f4f5'
            const isBold = cellSt?.isBold !== undefined ? cellSt.isBold : !!table?.isBold
            const textAlign = cellSt?.textAlign || table?.textAlign || 'left'

            return (
              <textarea
                ref={tableCellInputRef}
                value={editingTableCell.text}
                onChange={e => setEditingTableCell(prev => prev ? { ...prev, text: e.target.value } : null)}
                onBlur={() => handleFinishEditingTableCell()}
                onKeyDown={e => {
                  if (e.key === 'Tab') {
                    e.preventDefault()
                    const delta = e.shiftKey ? -1 : 1
                    if (table) {
                      const r = editingTableCell.row
                      const c = editingTableCell.col
                      const cols = table.cols || 4
                      const rows = table.rows || 3
                      let nextC = c + delta
                      let nextR = r
                      if (nextC >= cols) {
                        nextC = 0
                        nextR = Math.min(rows - 1, r + 1)
                      } else if (nextC < 0) {
                        nextC = cols - 1
                        nextR = Math.max(0, r - 1)
                      }
                      handleFinishEditingTableCell({ r: nextR, c: nextC })
                    }
                  } else if (e.key === 'Escape') {
                    e.preventDefault()
                    handleFinishEditingTableCell()
                  }
                }}
                placeholder="Digite algo..."
                className="w-full h-full bg-transparent outline-none p-2 resize-none border-2 border-sky-400 leading-snug"
                style={{
                  fontSize: `${cellFontSize}px`,
                  fontFamily: cellFontFam,
                  color: cellColor,
                  fontWeight: isBold ? 'bold' : 'normal',
                  textAlign: textAlign as any
                }}
              />
            )
          })()}
        </div>
      )}

      {/* 10. Table Interactive FigJam Controls (Bottom Bar, Right Bar, Top Handles, Left Handles, Inserter Dots) */}
      {(() => {
        if (selectedIds.length !== 1 || editingTableCell) return null
        const selectedTable = doc.elements.find(el => el.id === selectedIds[0] && el.type === 'table')
        if (!selectedTable) return null

        const bounds = getElementBounds(selectedTable)
        const topLeft = worldToScreen(bounds.x, bounds.y)
        const bottomRight = worldToScreen(bounds.x + bounds.width, bounds.y + bounds.height)
        const tX = topLeft.x
        const tY = topLeft.y
        const tW = bottomRight.x - topLeft.x
        const tH = bottomRight.y - topLeft.y
        const tCols = Math.max(1, selectedTable.cols || 4)
        const tRows = Math.max(1, selectedTable.rows || 3)
        const colW = tW / tCols
        const rowH = tH / tRows

        return (
          <div className="pointer-events-auto">
            {/* A0. Selected Cell Highlight */}
            {selectedTableCell && selectedTableCell.tableId === selectedTable.id && (
              <div
                className="absolute pointer-events-none border-2 border-sky-400 z-25"
                style={{
                  left: `${tX + selectedTableCell.col * colW}px`,
                  top: `${tY + selectedTableCell.row * rowH}px`,
                  width: `${colW}px`,
                  height: `${rowH}px`,
                  boxSizing: 'border-box'
                }}
              />
            )}

            {/* A. Selected Column Highlight */}
            {selectedTableCol !== null && selectedTableCol < tCols && (
              <div
                className="absolute pointer-events-none rounded-sm border-2 border-sky-400 bg-sky-400/10 z-25"
                style={{
                  left: `${tX + selectedTableCol * colW}px`,
                  top: `${tY}px`,
                  width: `${colW}px`,
                  height: `${tH}px`,
                  boxSizing: 'border-box'
                }}
              />
            )}

            {/* B. Selected Row Highlight */}
            {selectedTableRow !== null && selectedTableRow < tRows && (
              <div
                className="absolute pointer-events-none rounded-sm border-2 border-sky-400 bg-sky-400/10 z-25"
                style={{
                  left: `${tX}px`,
                  top: `${tY + selectedTableRow * rowH}px`,
                  width: `${tW}px`,
                  height: `${rowH}px`,
                  boxSizing: 'border-box'
                }}
              />
            )}

            {/* C. Bottom Bar: Add Row (Only visible on hover) */}
            {(isHoveringBottomAdd || hoveredTableRow === tRows - 1) && (
              <button
                onClick={() => handleAddTableRow(selectedTable.id)}
                onMouseEnter={() => setIsHoveringBottomAdd(true)}
                onMouseLeave={() => setIsHoveringBottomAdd(false)}
                className="absolute bg-sky-400/20 hover:bg-sky-400/35 text-sky-400 hover:text-sky-300 border border-sky-400/40 rounded-lg flex items-center justify-center cursor-pointer transition-all z-25 group animate-in fade-in duration-100"
                style={{
                  left: `${tX}px`,
                  top: `${tY + tH + 6}px`,
                  width: `${tW}px`,
                  height: '22px'
                }}
                title="Adicionar linha"
              >
                <Plus className="w-4 h-4 stroke-[2.5] group-hover:scale-125 transition-transform" />
              </button>
            )}

            {/* D. Right Bar: Add Column (Only visible on hover) */}
            {(isHoveringRightAdd || hoveredTableCol === tCols - 1) && (
              <button
                onClick={() => handleAddTableCol(selectedTable.id)}
                onMouseEnter={() => setIsHoveringRightAdd(true)}
                onMouseLeave={() => setIsHoveringRightAdd(false)}
                className="absolute bg-sky-400/20 hover:bg-sky-400/35 text-sky-400 hover:text-sky-300 border border-sky-400/40 rounded-lg flex items-center justify-center cursor-pointer transition-all z-25 group animate-in fade-in duration-100"
                style={{
                  left: `${tX + tW + 6}px`,
                  top: `${tY}px`,
                  width: '22px',
                  height: `${tH}px`
                }}
                title="Adicionar coluna"
              >
                <Plus className="w-4 h-4 stroke-[2.5] group-hover:scale-125 transition-transform" />
              </button>
            )}

            {/* E. Top Column Handles & Inserters (Thin Sleek Pill + Circular Dots) */}
            {Array.from({ length: tCols }).map((_, c) => {
              const handleCenterX = tX + c * colW + colW / 2
              const isSelected = selectedTableCol === c
              const isHovered = hoveredTableCol === c

              if (!isSelected && !isHovered) {
                // If adjacent column is hovered, show divider inserter dot
                const showDivider = hoveredTableCol === c + 1
                if (!showDivider || c + 1 >= tCols) return null
                return (
                  <button
                    key={`col_div_${c}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      handleInsertTableCol(selectedTable.id, c + 1)
                    }}
                    onMouseEnter={() => setHoveredTableCol(c)}
                    className="absolute -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full cursor-pointer transition-all z-30 bg-sky-400 hover:bg-sky-300 hover:scale-125 shadow-xs animate-in fade-in duration-100"
                    style={{
                      left: `${tX + (c + 1) * colW}px`,
                      top: `${tY - 9}px`
                    }}
                    title={`Inserir coluna entre ${c + 1} e ${c + 2}`}
                  />
                )
              }

              return (
                <React.Fragment key={`col_ctrl_${c}`}>
                  {/* Left Inserter Dot */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleInsertTableCol(selectedTable.id, c)
                    }}
                    onMouseEnter={() => setHoveredTableCol(c)}
                    className="absolute -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full cursor-pointer transition-all z-30 bg-sky-400 hover:bg-sky-300 hover:scale-125 shadow-xs animate-in fade-in duration-100"
                    style={{
                      left: `${tX + c * colW}px`,
                      top: `${tY - 9}px`
                    }}
                    title={`Inserir coluna antes da coluna ${c + 1}`}
                  />

                  {/* Sleek Column Handle Pill (Horizontal stroke) */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setSelectedTableCol(prev => prev === c ? null : c)
                      setSelectedTableRow(null)
                      setSelectedTableCell(null)
                    }}
                    onMouseEnter={() => setHoveredTableCol(c)}
                    onMouseLeave={() => setHoveredTableCol(null)}
                    className={`absolute -translate-x-1/2 w-5 h-1.5 rounded-full transition-all cursor-pointer z-30 shadow-xs animate-in fade-in duration-100 ${
                      isSelected
                        ? 'bg-sky-400 ring-2 ring-sky-300 scale-110'
                        : 'bg-sky-400/90 hover:bg-sky-300 hover:scale-125'
                    }`}
                    style={{
                      left: `${handleCenterX}px`,
                      top: `${tY - 10}px`
                    }}
                    title={`Selecionar coluna ${c + 1}`}
                  />

                  {/* Right Inserter Dot */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleInsertTableCol(selectedTable.id, c + 1)
                    }}
                    onMouseEnter={() => setHoveredTableCol(c)}
                    className="absolute -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full cursor-pointer transition-all z-30 bg-sky-400 hover:bg-sky-300 hover:scale-125 shadow-xs animate-in fade-in duration-100"
                    style={{
                      left: `${tX + (c + 1) * colW}px`,
                      top: `${tY - 9}px`
                    }}
                    title={`Inserir coluna depois da coluna ${c + 1}`}
                  />
                </React.Fragment>
              )
            })}

            {/* F. Left Row Handles & Inserters (Thin Sleek Pill + Circular Dots) */}
            {Array.from({ length: tRows }).map((_, r) => {
              const handleCenterY = tY + r * rowH + rowH / 2
              const isSelected = selectedTableRow === r
              const isHovered = hoveredTableRow === r

              if (!isSelected && !isHovered) {
                // If adjacent row is hovered, show divider inserter dot
                const showDivider = hoveredTableRow === r + 1
                if (!showDivider || r + 1 >= tRows) return null
                return (
                  <button
                    key={`row_div_${r}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      handleInsertTableRow(selectedTable.id, r + 1)
                    }}
                    onMouseEnter={() => setHoveredTableRow(r)}
                    className="absolute -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full cursor-pointer transition-all z-30 bg-sky-400 hover:bg-sky-300 hover:scale-125 shadow-xs animate-in fade-in duration-100"
                    style={{
                      left: `${tX - 9}px`,
                      top: `${tY + (r + 1) * rowH}px`
                    }}
                    title={`Inserir linha entre ${r + 1} e ${r + 2}`}
                  />
                )
              }

              return (
                <React.Fragment key={`row_ctrl_${r}`}>
                  {/* Top Inserter Dot */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleInsertTableRow(selectedTable.id, r)
                    }}
                    onMouseEnter={() => setHoveredTableRow(r)}
                    className="absolute -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full cursor-pointer transition-all z-30 bg-sky-400 hover:bg-sky-300 hover:scale-125 shadow-xs animate-in fade-in duration-100"
                    style={{
                      left: `${tX - 9}px`,
                      top: `${tY + r * rowH}px`
                    }}
                    title={`Inserir linha antes da linha ${r + 1}`}
                  />

                  {/* Sleek Row Handle Pill (Vertical stroke) */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setSelectedTableRow(prev => prev === r ? null : r)
                      setSelectedTableCol(null)
                      setSelectedTableCell(null)
                    }}
                    onMouseEnter={() => setHoveredTableRow(r)}
                    onMouseLeave={() => setHoveredTableRow(null)}
                    className={`absolute -translate-y-1/2 w-1.5 h-5 rounded-full transition-all cursor-pointer z-30 shadow-xs animate-in fade-in duration-100 ${
                      isSelected
                        ? 'bg-sky-400 ring-2 ring-sky-300 scale-110'
                        : 'bg-sky-400/90 hover:bg-sky-300 hover:scale-125'
                    }`}
                    style={{
                      left: `${tX - 10}px`,
                      top: `${handleCenterY}px`
                    }}
                    title={`Selecionar linha ${r + 1}`}
                  />

                  {/* Bottom Inserter Dot */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleInsertTableRow(selectedTable.id, r + 1)
                    }}
                    onMouseEnter={() => setHoveredTableRow(r)}
                    className="absolute -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full cursor-pointer transition-all z-30 bg-sky-400 hover:bg-sky-300 hover:scale-125 shadow-xs animate-in fade-in duration-100"
                    style={{
                      left: `${tX - 9}px`,
                      top: `${tY + (r + 1) * rowH}px`
                    }}
                    title={`Inserir linha depois da linha ${r + 1}`}
                  />
                </React.Fragment>
              )
            })}
          </div>
        )
      })()}

      {/* 11. Table Creation Drag Preview Tooltip (Matching Image 1) */}
      {tableCreationPreview && (
        <div
          className="fixed pointer-events-none z-50 flex flex-col items-center gap-1.5"
          style={{
            left: `${tableCreationPreview.screenX + 16}px`,
            top: `${tableCreationPreview.screenY + 16}px`
          }}
        >
          <div className="bg-zinc-800/90 text-zinc-300 text-[10px] px-2 py-0.5 rounded font-mono border border-zinc-700/80 shadow-md">
            {tableCreationPreview.cols} × {tableCreationPreview.rows}
          </div>
          <div className="bg-[#e4e4e7] text-zinc-900 text-xs font-medium px-2.5 py-1 rounded-md shadow-xl border border-zinc-300 flex items-center gap-1.5">
            <span>Clique e arraste para definir o tamanho</span>
          </div>
        </div>
      )}

      {/* 12. Modal: Import Note from Vault (Hierarchical Drill-down + Instant Search) */}
      {isImportNoteModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setIsImportNoteModalOpen(false)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setIsImportNoteModalOpen(false)
          }}
        >
          <div
            className="w-full max-w-xl bg-[#18181f] border border-zinc-700/80 rounded-2xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-4 border-b border-zinc-800 flex items-center justify-between shrink-0 bg-[#1e1e26]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-zinc-800 text-white shadow-xs" style={{ color: 'var(--accent)' }}>
                  <FileText className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-semibold text-zinc-100 text-sm">Importar Nota para o Quadro</h3>
                  <p className="text-[11px] text-zinc-400">
                    Navegue pelas pastas ou busque pelo nome para acoplar uma nota ao canvas
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsImportNoteModalOpen(false)}
                className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Search Bar */}
            <div className="p-3 border-b border-zinc-800/80 bg-[#16161c]">
              <div className="flex items-center bg-zinc-900 border border-zinc-700/80 rounded-xl px-3 py-2 focus-within:border-[var(--accent)] transition-colors">
                <Search className="w-4 h-4 text-zinc-400 shrink-0 mr-2" />
                <input
                  type="text"
                  autoFocus
                  placeholder="Pesquisar por título ou conteúdo da nota..."
                  value={noteModalSearch}
                  onChange={(e) => setNoteModalSearch(e.target.value)}
                  className="w-full bg-transparent text-xs text-zinc-100 placeholder-zinc-500 outline-none"
                />
                {noteModalSearch && (
                  <button
                    type="button"
                    onClick={() => setNoteModalSearch('')}
                    className="p-1 text-zinc-400 hover:text-zinc-200 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-3 text-xs">
              {noteModalSearch.trim() !== '' ? (
                /* Search Results Mode */
                (() => {
                  const q = noteModalSearch.trim().toLowerCase()
                  const results = notes.filter(n =>
                    n.title.toLowerCase().includes(q) ||
                    (n.content && n.content.toLowerCase().includes(q))
                  )

                  if (results.length === 0) {
                    return (
                      <div className="py-12 flex flex-col items-center justify-center text-zinc-500 text-center gap-1.5">
                        <FileText className="w-8 h-8 stroke-[1.5] opacity-50 mb-1" />
                        <p className="font-medium text-zinc-300">Nenhuma nota encontrada</p>
                        <p className="text-[11px] text-zinc-500">Tente buscar por outras palavras-chave</p>
                      </div>
                    )
                  }

                  return (
                    <div className="flex flex-col gap-1.5">
                      <span className="text-[10.5px] font-medium text-zinc-400 px-1">
                        {results.length} {results.length === 1 ? 'nota encontrada' : 'notas encontradas'}:
                      </span>
                      {results.map(n => {
                        const Icon = n.type === 'mindmap' ? Brain : n.type === 'draw' ? Palette : n.type === 'html' ? CodeXml : FileText
                        return (
                          <div
                            key={n.id}
                            onClick={() => handleImportNote(n)}
                            className="p-2.5 rounded-xl border border-zinc-800 bg-[#1c1c24] hover:bg-[#22222c] hover:border-zinc-700 transition-all cursor-pointer flex flex-col gap-1 group"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2 truncate">
                                <Icon className="w-4 h-4 shrink-0" style={{ color: 'var(--accent)' }} />
                                <span className="font-medium text-zinc-100 group-hover:text-white truncate">
                                  {n.title}
                                </span>
                              </div>
                              <span className="text-[10px] px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-400 shrink-0 font-mono">
                                📁 {n.folder || 'Raiz'}
                              </span>
                            </div>
                            {n.content && (
                              <p className="text-[11px] text-zinc-400 line-clamp-2 leading-relaxed pl-6">
                                {n.content.slice(0, 150)}
                              </p>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )
                })()
              ) : (
                /* Hierarchical Drill-down Mode */
                (() => {
                  const childFolders = getImmediateChildren(computedFolders, noteModalFolder)
                  const currentFolderNotes = notes.filter(n => (n.folder || '') === noteModalFolder)

                  return (
                    <div className="flex flex-col gap-3">
                      {/* Breadcrumbs */}
                      <div className="flex items-center gap-1.5 bg-zinc-900/60 p-2 rounded-xl border border-zinc-800/80 text-[11px] overflow-x-auto">
                        <button
                          type="button"
                          onClick={() => setNoteModalFolder('')}
                          className={`px-2 py-1 rounded transition-colors cursor-pointer shrink-0 ${
                            noteModalFolder === '' ? 'bg-zinc-800 text-white font-medium' : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
                          }`}
                        >
                          Raiz do cofre
                        </button>
                        {noteModalFolder.split('/').filter(Boolean).map((seg, idx, arr) => {
                          const segPath = arr.slice(0, idx + 1).join('/')
                          const isLast = idx === arr.length - 1
                          return (
                            <React.Fragment key={segPath}>
                              <ChevronRight className="w-3.5 h-3.5 text-zinc-600 shrink-0" />
                              <button
                                type="button"
                                onClick={() => setNoteModalFolder(segPath)}
                                className={`px-2 py-1 rounded transition-colors cursor-pointer truncate max-w-[120px] ${
                                  isLast ? 'bg-zinc-800 text-white font-medium' : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
                                }`}
                                title={seg}
                              >
                                {seg}
                              </button>
                            </React.Fragment>
                          )
                        })}
                      </div>

                      {/* Back button if inside folder */}
                      {noteModalFolder !== '' && (
                        <button
                          type="button"
                          onClick={() => {
                            const parts = noteModalFolder.split('/')
                            parts.pop()
                            setNoteModalFolder(parts.join('/'))
                          }}
                          className="flex items-center gap-1.5 px-2 py-1 text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer text-xs self-start"
                        >
                          <ArrowLeft className="w-3.5 h-3.5" />
                          <span>Voltar para pasta anterior</span>
                        </button>
                      )}

                      {/* Subfolders Grid */}
                      {childFolders.length > 0 && (
                        <div className="flex flex-col gap-1.5">
                          <span className="text-[10.5px] font-semibold uppercase tracking-wider text-zinc-500 px-1">
                            Pastas ({childFolders.length})
                          </span>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                            {childFolders.map(child => {
                              const notesInChild = notes.filter(n => (n.folder || '') === child.fullPath || (n.folder || '').startsWith(child.fullPath + '/')).length
                              return (
                                <button
                                  key={child.fullPath}
                                  type="button"
                                  onClick={() => setNoteModalFolder(child.fullPath)}
                                  className="p-2.5 rounded-xl border border-zinc-800 bg-[#1a1a22] hover:bg-[#22222e] hover:border-zinc-700 transition-all cursor-pointer flex items-center justify-between text-left group"
                                >
                                  <div className="flex items-center gap-2 truncate">
                                    <Folder className="w-4 h-4 shrink-0" style={{ color: 'var(--accent)' }} />
                                    <span className="font-medium text-zinc-200 group-hover:text-white truncate">
                                      {child.name}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1 text-[10.5px] text-zinc-500 shrink-0">
                                    <span>{notesInChild}</span>
                                    <ChevronRight className="w-3.5 h-3.5 text-zinc-600 group-hover:text-zinc-400 transition-transform group-hover:translate-x-0.5" />
                                  </div>
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      )}

                      {/* Notes in current folder */}
                      <div className="flex flex-col gap-1.5">
                        <span className="text-[10.5px] font-semibold uppercase tracking-wider text-zinc-500 px-1">
                          Notas nesta pasta ({currentFolderNotes.length})
                        </span>

                        {currentFolderNotes.length === 0 ? (
                          <div className="py-6 text-center text-zinc-500 text-xs">
                            Nenhuma nota diretamente nesta pasta
                          </div>
                        ) : (
                          <div className="flex flex-col gap-1.5">
                            {currentFolderNotes.map(n => {
                              const Icon = n.type === 'mindmap' ? Brain : n.type === 'draw' ? Palette : n.type === 'html' ? CodeXml : FileText
                              return (
                                <div
                                  key={n.id}
                                  onClick={() => handleImportNote(n)}
                                  className="p-2.5 rounded-xl border border-zinc-800 bg-[#1c1c24] hover:bg-[#22222c] hover:border-zinc-700 transition-all cursor-pointer flex flex-col gap-1 group"
                                >
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2 truncate">
                                      <Icon className="w-4 h-4 shrink-0" style={{ color: 'var(--accent)' }} />
                                      <span className="font-medium text-zinc-100 group-hover:text-white truncate">
                                        {n.title}
                                      </span>
                                    </div>
                                    <span className="text-[10px] px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-400 shrink-0">
                                      Clique para importar
                                    </span>
                                  </div>
                                  {n.content && (
                                    <p className="text-[11px] text-zinc-400 line-clamp-2 leading-relaxed pl-6">
                                      {n.content.slice(0, 150)}
                                    </p>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })()
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-3 border-t border-zinc-800 bg-[#1a1a22] flex items-center justify-between text-xs">
              <span className="text-zinc-500 text-[11px]">
                Total de notas no cofre: <strong>{notes.length}</strong>
              </span>
              <button
                type="button"
                onClick={() => setIsImportNoteModalOpen(false)}
                className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default DrawEditor
