import React, { useCallback, useEffect, useRef, useState } from 'react'
import type { Note } from '../types'
import type { DrawDocument, DrawElement, DrawElementType, DrawPoint, DrawTool } from '../types/draw'
import {
  getElementBounds,
  isPointInElement,
  parseDrawDocument,
  renderElementToCanvas,
  renderGrid,
  serializeDrawDocument
} from '../utils/drawUtils'
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
  Layers
} from 'lucide-react'

interface DrawEditorProps {
  note: Note
  onUpdateNote: (updatedNote: Note) => void
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

interface ShapeOption {
  type: DrawElementType
  label: string
  icon: React.FC<{ className?: string }>
}

const SHAPE_OPTIONS: ShapeOption[] = [
  { type: 'ellipse', label: 'Círculo', icon: Circle },
  { type: 'rectangle', label: 'Retângulo', icon: Square },
  { type: 'roundedRect', label: 'Retângulo Arredondado', icon: Square },
  { type: 'diamond', label: 'Losango', icon: Diamond },
  { type: 'triangle', label: 'Triângulo', icon: Triangle },
  { type: 'triangleDown', label: 'Triângulo Invertido', icon: Triangle },
  { type: 'parallelogram', label: 'Paralelogramo', icon: Square },
  { type: 'cylinder', label: 'Cilindro', icon: Circle }
]

export const DrawEditor: React.FC<DrawEditorProps> = ({ note, onUpdateNote }) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // Document state
  const [doc, setDoc] = useState<DrawDocument>(() => parseDrawDocument(note.content, note.title))
  const docRef = useRef(doc)
  docRef.current = doc

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

  // Popover state for floating toolbar
  const [openPopover, setOpenPopover] = useState<'shape' | 'color' | 'typography' | 'stroke' | null>(null)
  const [shapeSearch, setShapeSearch] = useState('')
  const customColorInputRef = useRef<HTMLInputElement>(null)

  // Mouse interaction state
  const isPointerDown = useRef(false)
  const pointerDownScreen = useRef<DrawPoint>({ x: 0, y: 0 })
  const dragStartPoint = useRef<DrawPoint>({ x: 0, y: 0 })
  const spacePressed = useRef(false)
  const isPanning = useRef(false)
  const panStart = useRef<DrawPoint>({ x: 0, y: 0 })
  const activeElementId = useRef<string | null>(null)
  const dragHandle = useRef<string | null>(null) // 'tl', 'tr', 'bl', 'br', 'move'
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
  }, [note.id])

  // Get selected element if single
  const singleSelectedElement = selectedIds.length === 1
    ? doc.elements.find(el => el.id === selectedIds[0]) || null
    : null

  // Render Loop
  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const { width, height } = canvas
    const { panX, panY, zoom } = doc.viewport

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
        // Skip pure text element while editing
        continue
      }
      const isSelected = selectedIds.includes(el.id)
      renderElementToCanvas(ctx, el, isSelected)
    }

    // Render selection indicators & FigJam-like handles
    if (selectedIds.length > 0 && !editingText) {
      for (const id of selectedIds) {
        const el = doc.elements.find(e => e.id === id)
        if (!el) continue

        const bounds = getElementBounds(el)
        ctx.save()

        // Selection Border: FigJam cyan / bright blue (#0099ff)
        ctx.strokeStyle = '#0099ff'
        ctx.lineWidth = 1.5 / zoom
        ctx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height)

        // Handles on single selection
        if (selectedIds.length === 1 && el.type !== 'freedraw') {
          // 1. Resize handles on 4 corners (White square with blue outline, like FigJam)
          const cornerHandleSize = 8 / zoom
          const corners = [
            { id: 'tl', x: bounds.x, y: bounds.y },
            { id: 'tr', x: bounds.x + bounds.width, y: bounds.y },
            { id: 'bl', x: bounds.x, y: bounds.y + bounds.height },
            { id: 'br', x: bounds.x + bounds.width, y: bounds.y + bounds.height }
          ]

          for (const c of corners) {
            ctx.fillStyle = '#ffffff'
            ctx.strokeStyle = '#0099ff'
            ctx.lineWidth = 1.5 / zoom
            ctx.fillRect(c.x - cornerHandleSize / 2, c.y - cornerHandleSize / 2, cornerHandleSize, cornerHandleSize)
            ctx.strokeRect(c.x - cornerHandleSize / 2, c.y - cornerHandleSize / 2, cornerHandleSize, cornerHandleSize)
          }

          // 2. Output connection handlers (N8N / FigJam circular nodes on 4 cardinal edges)
          const isClosed = !['arrow', 'line', 'text'].includes(el.type)
          if (isClosed) {
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
              ctx.arc(h.x, h.y, isHovered ? connRadius * 1.4 : connRadius, 0, Math.PI * 2)
              ctx.fillStyle = isHovered ? '#38bdf8' : '#7dd3fc'
              ctx.fill()
              ctx.strokeStyle = '#0284c7'
              ctx.lineWidth = 1 / zoom
              ctx.stroke()
            }

            // Bottom quick add connection button (Blue circular button with down arrow ↓)
            const bottomH = connHandles[2]
            const arrowBtnY = bottomH.y + 14 / zoom
            const arrowBtnRadius = 8 / zoom

            ctx.beginPath()
            ctx.arc(bottomH.x, arrowBtnY, arrowBtnRadius, 0, Math.PI * 2)
            ctx.fillStyle = '#0284c7'
            ctx.fill()
            ctx.strokeStyle = '#ffffff'
            ctx.lineWidth = 1.2 / zoom
            ctx.stroke()

            // Draw white down arrow inside button
            ctx.beginPath()
            ctx.strokeStyle = '#ffffff'
            ctx.lineWidth = 1.6 / zoom
            ctx.lineCap = 'round'
            ctx.lineJoin = 'round'
            const arrowSize = 3.5 / zoom
            ctx.moveTo(bottomH.x, arrowBtnY - arrowSize)
            ctx.lineTo(bottomH.x, arrowBtnY + arrowSize)
            ctx.moveTo(bottomH.x - arrowSize * 0.8, arrowBtnY + arrowSize * 0.3)
            ctx.lineTo(bottomH.x, arrowBtnY + arrowSize)
            ctx.lineTo(bottomH.x + arrowSize * 0.8, arrowBtnY + arrowSize * 0.3)
            ctx.stroke()
          }
        }

        ctx.restore()
      }
    }

    // Render interactive connector line while dragging from N8N handler
    if (activeConnector.current) {
      const { startX, startY, currentX, currentY } = activeConnector.current
      ctx.save()
      ctx.strokeStyle = '#0099ff'
      ctx.lineWidth = 2.5 / zoom
      ctx.lineCap = 'round'
      ctx.setLineDash([4 / zoom, 4 / zoom])

      ctx.beginPath()
      ctx.moveTo(startX, startY)
      ctx.lineTo(currentX, currentY)
      ctx.stroke()

      // Arrowhead at cursor
      const angle = Math.atan2(currentY - startY, currentX - startX)
      const headLength = 12 / zoom
      const headAngle = Math.PI / 6
      ctx.setLineDash([])
      ctx.fillStyle = '#0099ff'
      ctx.beginPath()
      ctx.moveTo(currentX, currentY)
      ctx.lineTo(
        currentX - headLength * Math.cos(angle - headAngle),
        currentY - headLength * Math.sin(angle - headAngle)
      )
      ctx.lineTo(
        currentX - headLength * Math.cos(angle + headAngle),
        currentY - headLength * Math.sin(angle + headAngle)
      )
      ctx.closePath()
      ctx.fill()
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
      ctx.fillStyle = 'rgba(0, 153, 255, 0.12)'
      ctx.strokeStyle = '#0099ff'
      ctx.lineWidth = 1 / zoom
      ctx.fillRect(left, top, w, h)
      ctx.strokeRect(left, top, w, h)
      ctx.restore()
    }

    ctx.restore()
  }, [doc, selectedIds, editingText, hoveredHandle])

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

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
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
      // 1. Check if hit resize handles or N8N output connection handles on single selection
      if (selectedIds.length === 1) {
        const selEl = doc.elements.find(el => el.id === selectedIds[0])
        if (selEl && selEl.type !== 'freedraw') {
          const bounds = getElementBounds(selEl)
          const z = doc.viewport.zoom
          const margin = 10 / z

          // Corners
          const corners = [
            { id: 'tl', x: bounds.x, y: bounds.y },
            { id: 'tr', x: bounds.x + bounds.width, y: bounds.y },
            { id: 'bl', x: bounds.x, y: bounds.y + bounds.height },
            { id: 'br', x: bounds.x + bounds.width, y: bounds.y + bounds.height }
          ]

          const cornerHit = corners.find(h => Math.hypot(h.x - world.x, h.y - world.y) <= margin)
          if (cornerHit) {
            dragHandle.current = cornerHit.id
            initialElementBounds.current = { ...bounds }
            return
          }

          // N8N Output Connection Nodes (Top, Right, Bottom, Left)
          const isClosed = !['arrow', 'line', 'text'].includes(selEl.type)
          if (isClosed) {
            const connHandles: Array<{ id: 'top' | 'right' | 'bottom' | 'left'; x: number; y: number }> = [
              { id: 'top', x: bounds.x + bounds.width / 2, y: bounds.y },
              { id: 'right', x: bounds.x + bounds.width, y: bounds.y + bounds.height / 2 },
              { id: 'bottom', x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height },
              { id: 'left', x: bounds.x, y: bounds.y + bounds.height / 2 }
            ]

            const connHit = connHandles.find(h => Math.hypot(h.x - world.x, h.y - world.y) <= margin)
            // Also check bottom quick-add button (down arrow circular button)
            const bottomBtnY = bounds.y + bounds.height + 14 / z
            const isBottomBtnHit = Math.hypot(bounds.x + bounds.width / 2 - world.x, bottomBtnY - world.y) <= margin

            if (connHit || isBottomBtnHit) {
              const handle = connHit ? connHit.id : 'bottom'
              const startX = connHit ? connHit.x : bounds.x + bounds.width / 2
              const startY = connHit ? connHit.y : bounds.y + bounds.height

              activeConnector.current = {
                fromId: selEl.id,
                handleId: handle,
                startX,
                startY,
                currentX: world.x,
                currentY: world.y
              }
              return
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

        // Sync toolbar properties to hit element
        setStrokeColor(hit.strokeColor || '#4a4a4e')
        setBackgroundColor(hit.backgroundColor || 'transparent')
        setStrokeWidth(hit.strokeWidth || 2)
        setStrokeStyle(hit.strokeStyle || 'solid')
        setFillStyle(hit.fillStyle || 'none')
        if (hit.fontSize) setFontSize(hit.fontSize)
        if (hit.fontFamily) setFontFamily(hit.fontFamily)
      } else {
        // Clicked on empty space: clear selection and close any open popover
        if (!e.shiftKey) setSelectedIds([])
        setOpenPopover(null)
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
        width: 160,
        height: 36,
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
      setEditingText({ id, x: world.x, y: world.y, width: 160, height: 36, text: '' })
      setSelectedIds([id])
      setTool('select')
      return
    }

    // Creating shape / freedraw / arrow / line
    const newId = 'elem_' + crypto.randomUUID()
    activeElementId.current = newId

    const newElement: DrawElement = {
      id: newId,
      type: tool as DrawElementType,
      x: world.x,
      y: world.y,
      width: 0,
      height: 0,
      strokeColor,
      backgroundColor,
      strokeWidth,
      strokeStyle,
      fillStyle,
      points: tool === 'freedraw' ? [{ x: 0, y: 0 }] : []
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
      // Dynamic cursor & hover inspection
      if (spacePressed.current || tool === 'pan') {
        container.style.cursor = 'grab'
      } else if (tool === 'select') {
        // Check hover over handles
        if (selectedIds.length === 1) {
          const selEl = doc.elements.find(el => el.id === selectedIds[0])
          if (selEl && !['arrow', 'line', 'freedraw'].includes(selEl.type)) {
            const bounds = getElementBounds(selEl)
            const z = doc.viewport.zoom
            const margin = 10 / z

            const connHandles = [
              { id: 'top', x: bounds.x + bounds.width / 2, y: bounds.y },
              { id: 'right', x: bounds.x + bounds.width, y: bounds.y + bounds.height / 2 },
              { id: 'bottom', x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height },
              { id: 'left', x: bounds.x, y: bounds.y + bounds.height / 2 }
            ]

            const hitConn = connHandles.find(h => Math.hypot(h.x - world.x, h.y - world.y) <= margin)
            const bottomBtnY = bounds.y + bounds.height + 14 / z
            const isBottomHit = Math.hypot(bounds.x + bounds.width / 2 - world.x, bottomBtnY - world.y) <= margin

            if (hitConn || isBottomHit) {
              setHoveredHandle(hitConn ? hitConn.id : 'bottom')
              container.style.cursor = 'crosshair'
              return
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

    // Moving selected elements
    if (tool === 'select' && dragHandle.current === 'move') {
      const dx = world.x - dragStartPoint.current.x
      const dy = world.y - dragStartPoint.current.y
      dragStartPoint.current = world

      setDoc(prev => ({
        ...prev,
        elements: prev.elements.map(el => {
          if (selectedIds.includes(el.id)) {
            return {
              ...el,
              x: el.x + dx,
              y: el.y + dy
            }
          }
          return el
        })
      }))
      return
    }

    // Resizing single element via handles
    if (tool === 'select' && dragHandle.current && selectedIds.length === 1) {
      const handle = dragHandle.current
      const el = doc.elements.find(e => e.id === selectedIds[0])
      if (el && initialElementBounds.current) {
        const b = initialElementBounds.current
        let nextX = el.x
        let nextY = el.y
        let nextW = el.width
        let nextH = el.height

        if (handle === 'br') {
          nextW = Math.max(10, world.x - b.x)
          nextH = Math.max(10, world.y - b.y)
        } else if (handle === 'bl') {
          nextX = world.x
          nextW = Math.max(10, b.x + b.width - world.x)
          nextH = Math.max(10, world.y - b.y)
        } else if (handle === 'tr') {
          nextY = world.y
          nextW = Math.max(10, world.x - b.x)
          nextH = Math.max(10, b.y + b.height - world.y)
        } else if (handle === 'tl') {
          nextX = world.x
          nextY = world.y
          nextW = Math.max(10, b.x + b.width - world.x)
          nextH = Math.max(10, b.y + b.height - world.y)
        }

        setDoc(prev => ({
          ...prev,
          elements: prev.elements.map(item => item.id === el.id ? { ...item, x: nextX, y: nextY, width: nextW, height: nextH } : item)
        }))
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

    if (dragHandle.current) {
      dragHandle.current = null
      initialElementBounds.current = null
      scheduleSave(docRef.current)
      pushHistory(docRef.current.elements)
    }

    // Handle N8N Output Connection completion
    if (activeConnector.current) {
      const { fromId, handleId, startX, startY, currentX, currentY } = activeConnector.current
      activeConnector.current = null

      const dist = Math.hypot(currentX - startX, currentY - startY)
      const fromEl = docRef.current.elements.find(el => el.id === fromId)

      if (fromEl) {
        if (dist < 8) {
          // Quick click on down arrow (or handler) -> create connected new shape in that direction!
          const bounds = getElementBounds(fromEl)
          const newShapeId = 'elem_' + crypto.randomUUID()
          const newArrowId = 'elem_' + crypto.randomUUID()

          const offsetDistance = 60
          let newX = bounds.x
          let newY = bounds.y
          let arrowTargetX = bounds.x + bounds.width / 2
          let arrowTargetY = bounds.y + bounds.height + offsetDistance

          if (handleId === 'bottom') {
            newY = bounds.y + bounds.height + offsetDistance
            arrowTargetX = bounds.x + bounds.width / 2
            arrowTargetY = newY
          } else if (handleId === 'right') {
            newX = bounds.x + bounds.width + offsetDistance
            arrowTargetX = newX
            arrowTargetY = bounds.y + bounds.height / 2
          } else if (handleId === 'left') {
            newX = bounds.x - bounds.width - offsetDistance
            arrowTargetX = newX + bounds.width
            arrowTargetY = bounds.y + bounds.height / 2
          } else if (handleId === 'top') {
            newY = bounds.y - bounds.height - offsetDistance
            arrowTargetX = bounds.x + bounds.width / 2
            arrowTargetY = newY + bounds.height
          }

          const newShape: DrawElement = {
            id: newShapeId,
            type: fromEl.type,
            x: newX,
            y: newY,
            width: bounds.width,
            height: bounds.height,
            strokeColor: fromEl.strokeColor,
            backgroundColor: fromEl.backgroundColor,
            strokeWidth: fromEl.strokeWidth,
            strokeStyle: fromEl.strokeStyle,
            fillStyle: fromEl.fillStyle
          }

          const newArrow: DrawElement = {
            id: newArrowId,
            type: 'arrow',
            x: startX,
            y: startY,
            width: arrowTargetX - startX,
            height: arrowTargetY - startY,
            strokeColor: '#339af0',
            backgroundColor: 'transparent',
            strokeWidth: 2,
            strokeStyle: 'solid',
            fillStyle: 'none'
          }

          const nextElements = [...docRef.current.elements, newShape, newArrow]
          setDoc(prev => ({ ...prev, elements: nextElements }))
          setSelectedIds([newShapeId])
          scheduleSave({ ...docRef.current, elements: nextElements })
          pushHistory(nextElements)
        } else {
          // Dragged connection line: create arrow pointing to drop position
          const targetEl = docRef.current.elements
            .slice()
            .reverse()
            .find(el => el.id !== fromId && isPointInElement({ x: currentX, y: currentY }, el))

          let finalTargetX = currentX
          let finalTargetY = currentY

          if (targetEl) {
            const tb = getElementBounds(targetEl)
            // Snap to closest edge of target element
            finalTargetX = Math.max(tb.x, Math.min(tb.x + tb.width, currentX))
            finalTargetY = Math.max(tb.y, Math.min(tb.y + tb.height, currentY))
          }

          const newArrowId = 'elem_' + crypto.randomUUID()
          const newArrow: DrawElement = {
            id: newArrowId,
            type: 'arrow',
            x: startX,
            y: startY,
            width: finalTargetX - startX,
            height: finalTargetY - startY,
            strokeColor: fromEl.strokeColor || '#339af0',
            backgroundColor: 'transparent',
            strokeWidth: fromEl.strokeWidth || 2,
            strokeStyle: 'solid',
            fillStyle: 'none'
          }

          const nextElements = [...docRef.current.elements, newArrow]
          setDoc(prev => ({ ...prev, elements: nextElements }))
          setSelectedIds([newArrowId])
          scheduleSave({ ...docRef.current, elements: nextElements })
          pushHistory(nextElements)
        }
      }
      return
    }

    // Creating new element: Handle Click vs Drag!
    if (activeElementId.current) {
      const id = activeElementId.current
      activeElementId.current = null

      const created = docRef.current.elements.find(el => el.id === id)
      if (!created) return

      // Measure distance traveled from pointer down
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
        'cylinder'
      ].includes(created.type)

      // KEY FEATURE: If user just CLICKED (without dragging or < 8px), spawn perfect default dimensions!
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
        }

        // Center on click point
        const perfectX = created.x - defaultWidth / 2
        const perfectY = created.y - defaultHeight / 2

        const updatedElements = docRef.current.elements.map(el =>
          el.id === id
            ? {
                ...el,
                x: perfectX,
                y: perfectY,
                width: defaultWidth,
                height: defaultHeight
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

      // Normalize negative width / height from manual drag
      const normX = created.width < 0 ? created.x + created.width : created.x
      const normY = created.height < 0 ? created.y + created.height : created.y
      const normW = Math.abs(created.width)
      const normH = Math.abs(created.height)

      const normalizedElements = docRef.current.elements.map(el =>
        el.id === id ? { ...el, x: normX, y: normY, width: normW, height: normH } : el
      )

      setDoc(prev => ({ ...prev, elements: normalizedElements }))
      setSelectedIds([id])
      setTool('select')
      scheduleSave({ ...docRef.current, elements: normalizedElements })
      pushHistory(normalizedElements)
    }
  }

  // Double click: edit text of text element or shape!
  const handleDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const container = containerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    const world = screenToWorld(e.clientX - rect.left, e.clientY - rect.top)

    const hit = doc.elements.slice().reverse().find(el => isPointInElement(world, el))
    if (!hit) return

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

  // Finish editing text
  const handleFinishEditingText = () => {
    if (!editingText) return
    const { id, text, isShape } = editingText

    if (!isShape && !text.trim()) {
      // Remove empty standalone text element
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

  // Duplicate Selected Elements
  const handleDuplicateSelected = () => {
    if (selectedIds.length === 0) return
    const selectedElements = doc.elements.filter(el => selectedIds.includes(el.id))
    const offset = 24

    const duplicated = selectedElements.map(el => ({
      ...el,
      id: 'elem_' + crypto.randomUUID(),
      x: el.x + offset,
      y: el.y + offset
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
      renderElementToCanvas(ctx, el, false)
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
    }
  }

  // Calculate Popover Position above selected element
  const getPopoverPosition = () => {
    if (!singleSelectedElement) return null
    const bounds = getElementBounds(singleSelectedElement)
    const topScreen = worldToScreen(bounds.x + bounds.width / 2, bounds.y)
    const bottomScreen = worldToScreen(bounds.x + bounds.width / 2, bounds.y + bounds.height)

    // Default: 50px above element
    let top = topScreen.y - 52
    let left = topScreen.x

    // If too close to top of screen, place below element
    if (top < 65) {
      top = bottomScreen.y + 16
    }

    return { top, left }
  }

  const popoverPos = getPopoverPosition()

  // Shape icon helper
  const getShapeIcon = (type: DrawElementType) => {
    const found = SHAPE_OPTIONS.find(s => s.type === type)
    return found ? found.icon : Square
  }

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

      {/* 2. Floating Selection Settings Popover (Appears ONLY when an element is selected) */}
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
            {/* A. Shape Switcher Button (For geometric shapes) */}
            {![ 'line', 'arrow', 'freedraw', 'text'].includes(singleSelectedElement.type) && (
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

                {/* Shape Picker Popover Menu (Matching User Print 2) */}
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
                        const isSelected = singleSelectedElement.type === item.type
                        return (
                          <button
                            key={item.type}
                            onClick={() => {
                              updateSelectedProperty('type', item.type)
                              setOpenPopover(null)
                            }}
                            className={`flex flex-col items-center justify-center p-2 rounded-lg transition-all cursor-pointer ${
                              isSelected
                                ? 'bg-violet-600 text-white shadow-md'
                                : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80'
                            }`}
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

            {/* B. Color & Stroke Style Button (Matching User Print 1) */}
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

              {/* Color & Stroke Popover Menu (Matching User Print 1) */}
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
                          ? 'bg-violet-600 text-white shadow-xs'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
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
                          ? 'bg-violet-600 text-white shadow-xs'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
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
                          ? 'bg-violet-600 text-white shadow-xs'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
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
                              ? 'border-violet-400 scale-110 ring-2 ring-violet-500'
                              : 'border-zinc-700/60'
                          }`}
                          style={{ backgroundColor: color }}
                          title={color}
                        />
                      )
                    })}
                  </div>

                  {/* Row 2 of Colors: 10 Pastels + 1 Rainbow Custom Picker */}
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
                              ? 'border-violet-400 scale-110 ring-2 ring-violet-500'
                              : 'border-zinc-700/60'
                          }`}
                          style={{ backgroundColor: color }}
                          title={color}
                        />
                      )
                    })}

                    {/* Rainbow circle button for custom color */}
                    <div className="relative">
                      <button
                        onClick={() => customColorInputRef.current?.click()}
                        className="w-6 h-6 rounded-full border border-zinc-700/60 transition-transform hover:scale-110 cursor-pointer shadow-xs"
                        style={{
                          background:
                            'conic-gradient(from 180deg at 50% 50%, #FF0000 0deg, #FFA500 50deg, #FFFF00 100deg, #008000 150deg, #00FFFF 200deg, #0000FF 250deg, #EE82EE 300deg, #FF0000 360deg)'
                        }}
                        title="Cor personalizada"
                      />
                      <input
                        ref={customColorInputRef}
                        type="color"
                        value={singleSelectedElement.strokeColor || '#ffffff'}
                        onChange={e => {
                          setStrokeColor(e.target.value)
                          updateSelectedProperty('strokeColor', e.target.value)
                        }}
                        className="absolute inset-0 opacity-0 cursor-pointer pointer-events-none w-0 h-0"
                      />
                    </div>
                  </div>

                  {/* Fill Background options for closed shapes */}
                  {![ 'line', 'arrow', 'freedraw'].includes(singleSelectedElement.type) && (
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

            {/* C. Typography & Text Alignment Button (Matching User Print 1 & 2) */}
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
                            (singleSelectedElement.fontSize || 18) === s.sz ? 'bg-zinc-750 text-white' : 'text-zinc-400 hover:text-zinc-200'
                          }`}
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
                            (singleSelectedElement.fontFamily || 'sans') === f.id ? 'bg-zinc-750 text-white' : 'text-zinc-400 hover:text-zinc-200'
                          }`}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* D. Stroke Width selector */}
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
                          (singleSelectedElement.strokeWidth || 2) === st.w ? 'bg-violet-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        {st.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

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
              }}
              className="p-1.5 text-rose-400 hover:text-rose-200 hover:bg-rose-500/20 rounded-lg transition-colors cursor-pointer"
              title="Excluir (Del)"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* 3. Bottom Floating FigJam Main Toolbar */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-[#18181d]/92 backdrop-blur-md border border-zinc-700/80 px-2 py-1.5 rounded-2xl shadow-2xl z-20">
        {[
          { id: 'select', icon: MousePointer, title: 'Seleção (V / 1)' },
          { id: 'rectangle', icon: Square, title: 'Retângulo (R / 2) - Clique para criar perfeito' },
          { id: 'ellipse', icon: Circle, title: 'Círculo (C / 4) - Clique para criar perfeito' },
          { id: 'diamond', icon: Diamond, title: 'Losango (D / 3) - Clique para criar perfeito' },
          { id: 'arrow', icon: ArrowUpRight, title: 'Seta / Conector (A / 5)' },
          { id: 'line', icon: Minus, title: 'Linha (L / 6)' },
          { id: 'freedraw', icon: PenTool, title: 'Lápis / Caneta (P / 7)' },
          { id: 'text', icon: Type, title: 'Texto (T / 8)' },
          { id: 'eraser', icon: Eraser, title: 'Borracha (E / 9)' },
          { id: 'pan', icon: Hand, title: 'Mover Tela (H / Espaço)' }
        ].map(item => {
          const Icon = item.icon
          const isActive = tool === item.id
          return (
            <button
              key={item.id}
              onClick={() => {
                setTool(item.id as DrawTool)
                if (item.id !== 'select') setSelectedIds([])
                setOpenPopover(null)
              }}
              title={item.title}
              className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
                isActive
                  ? 'bg-violet-600 text-white font-semibold shadow-md scale-105'
                  : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80'
              }`}
            >
              <Icon className="w-4 h-4 stroke-[2]" />
            </button>
          )
        })}
      </div>

      {/* 4. Top Right Floating Export & Actions Panel */}
      <div className="absolute top-3 right-3 flex items-center gap-1.5 bg-[#18181d]/90 backdrop-blur-md border border-zinc-700/80 p-1 rounded-xl shadow-2xl z-20">
        <button
          onClick={handleExportPNG}
          className="flex items-center gap-1 px-3 py-1.5 bg-violet-600 hover:bg-violet-500 text-white font-semibold rounded-lg text-xs transition-opacity shadow-sm cursor-pointer"
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

      {/* 5. Bottom Left Floating Navigation & Zoom Controls */}
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

      {/* 6. In-place Overlay Text Editor for Shapes & Pure Text */}
      {editingText && (
        <div
          className="absolute z-30"
          style={{
            left: `${worldToScreen(editingText.x, editingText.y).x}px`,
            top: `${worldToScreen(editingText.x, editingText.y).y}px`,
            width: editingText.isShape ? `${editingText.width * doc.viewport.zoom}px` : undefined,
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
              if (e.key === 'Escape' || (e.key === 'Enter' && !e.shiftKey && editingText.isShape)) {
                e.preventDefault()
                handleFinishEditingText()
              }
            }}
            placeholder={editingText.isShape ? 'Adicionar texto...' : 'Digite algo...'}
            className={`text-zinc-100 outline-none p-2 resize-none text-center font-sans ${
              editingText.isShape
                ? 'bg-transparent border-none w-full max-h-full leading-tight'
                : 'bg-[#18181d]/95 border border-violet-500 rounded-lg shadow-2xl min-w-[200px] min-h-[40px]'
            }`}
            style={{
              fontSize: `${fontSize * doc.viewport.zoom}px`,
              lineHeight: 1.3
            }}
          />
        </div>
      )}
    </div>
  )
}

export default DrawEditor
