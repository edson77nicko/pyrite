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
  Check
} from 'lucide-react'

interface DrawEditorProps {
  note: Note
  onUpdateNote: (updatedNote: Note) => void
}

const STROKE_COLORS = [
  '#f4f4f5', // White / Zinc 100
  '#a1a1aa', // Gray / Zinc 400
  '#ef4444', // Red
  '#f59e0b', // Amber
  '#c59b27', // Pyrita Gold
  '#10b981', // Emerald
  '#06b6d4', // Cyan
  '#3b82f6', // Blue
  '#8b5cf6', // Violet
  '#ec4899'  // Pink
]

const BG_COLORS = [
  'transparent',
  '#27272a', // Zinc 800
  '#7f1d1d', // Dark Red
  '#78350f', // Dark Amber
  '#59420b', // Dark Pyrita Gold
  '#064e3b', // Dark Emerald
  '#164e63', // Dark Cyan
  '#1e3a8a', // Dark Blue
  '#4c1d95', // Dark Violet
  '#831843'  // Dark Pink
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

  // Tool / Element Properties
  const [strokeColor, setStrokeColor] = useState<string>('#f4f4f5')
  const [backgroundColor, setBackgroundColor] = useState<string>('transparent')
  const [strokeWidth, setStrokeWidth] = useState<number>(2)
  const [strokeStyle, setStrokeStyle] = useState<'solid' | 'dashed' | 'dotted'>('solid')
  const [fillStyle, setFillStyle] = useState<'none' | 'semi' | 'solid'>('none')
  const [fontSize, setFontSize] = useState<number>(20)
  const [fontFamily, setFontFamily] = useState<'sans' | 'handwriting' | 'mono'>('sans')

  // Text Inline Editing
  const [editingText, setEditingText] = useState<{ id: string; x: number; y: number; text: string } | null>(null)
  const textInputRef = useRef<HTMLTextAreaElement>(null)

  // Mouse interaction state
  const isPointerDown = useRef(false)
  const dragStartPoint = useRef<DrawPoint>({ x: 0, y: 0 })
  const spacePressed = useRef(false)
  const isPanning = useRef(false)
  const panStart = useRef<DrawPoint>({ x: 0, y: 0 })
  const activeElementId = useRef<string | null>(null)
  const dragHandle = useRef<string | null>(null) // 'tl', 'tr', 'bl', 'br', 'move'
  const initialElementBounds = useRef<{ x: number; y: number; width: number; height: number } | null>(null)
  const marqueeBox = useRef<{ startX: number; startY: number; currentX: number; currentY: number } | null>(null)

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

  // Push new state to undo/redo history
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

  const worldToScreen = (worldX: number, worldY: number): DrawPoint => {
    const { panX, panY, zoom } = doc.viewport
    return {
      x: worldX * zoom + panX,
      y: worldY * zoom + panY
    }
  }

  // Sync with prop when note.id or note.content externally changes
  useEffect(() => {
    const parsed = parseDrawDocument(note.content, note.title)
    setDoc(parsed)
    historyRef.current = [parsed.elements]
    historyIndexRef.current = 0
    setSelectedIds([])
  }, [note.id])

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

    // Render dot grid
    renderGrid(ctx, width, height, doc.viewport)

    // World transform
    ctx.save()
    ctx.translate(panX, panY)
    ctx.scale(zoom, zoom)

    // Render elements
    for (const el of doc.elements) {
      if (editingText && editingText.id === el.id) {
        // Skip rendering text element while editing in textarea
        continue
      }
      renderElementToCanvas(ctx, el)
    }

    // Render selection indicators & handles
    if (selectedIds.length > 0 && !editingText) {
      for (const id of selectedIds) {
        const el = doc.elements.find(e => e.id === id)
        if (!el) continue

        const bounds = getElementBounds(el)
        ctx.save()
        ctx.strokeStyle = 'var(--accent, #c59b27)'
        ctx.lineWidth = 1.5 / zoom
        ctx.setLineDash([4 / zoom, 4 / zoom])
        ctx.strokeRect(bounds.x - 4 / zoom, bounds.y - 4 / zoom, bounds.width + 8 / zoom, bounds.height + 8 / zoom)

        // Draw resize handles on single selection
        if (selectedIds.length === 1 && el.type !== 'freedraw') {
          ctx.setLineDash([])
          ctx.fillStyle = '#ffffff'
          ctx.strokeStyle = 'var(--accent, #c59b27)'
          ctx.lineWidth = 1.5 / zoom
          const handleSize = 7 / zoom

          const handlePositions = [
            { x: bounds.x - 4 / zoom, y: bounds.y - 4 / zoom }, // tl
            { x: bounds.x + bounds.width + 4 / zoom, y: bounds.y - 4 / zoom }, // tr
            { x: bounds.x - 4 / zoom, y: bounds.y + bounds.height + 4 / zoom }, // bl
            { x: bounds.x + bounds.width + 4 / zoom, y: bounds.y + bounds.height + 4 / zoom } // br
          ]

          for (const pos of handlePositions) {
            ctx.beginPath()
            ctx.arc(pos.x, pos.y, handleSize / 2, 0, Math.PI * 2)
            ctx.fill()
            ctx.stroke()
          }
        }
        ctx.restore()
      }
    }

    // Render marquee selection box
    if (marqueeBox.current) {
      const { startX, startY, currentX, currentY } = marqueeBox.current
      const left = Math.min(startX, currentX)
      const top = Math.min(startY, currentY)
      const w = Math.abs(currentX - startX)
      const h = Math.abs(currentY - startY)

      ctx.save()
      ctx.fillStyle = 'rgba(197, 155, 39, 0.12)'
      ctx.strokeStyle = 'var(--accent, #c59b27)'
      ctx.lineWidth = 1 / zoom
      ctx.fillRect(left, top, w, h)
      ctx.strokeRect(left, top, w, h)
      ctx.restore()
    }

    ctx.restore()
  }, [doc, selectedIds, editingText])

  // Canvas size adjustment to container size
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

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (editingText) return // Don't intercept when writing text
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
        return
      }

      // Duplicate (Ctrl+D)
      if ((e.ctrlKey || e.metaKey) && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault()
        handleDuplicateSelected()
        return
      }

      // Tool shortcuts (1-9 or keys)
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
      // Zoom centered at mouse pointer
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
      // Pan
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
    dragStartPoint.current = world

    // Middle click or space or 'pan' tool -> Pan
    if (e.button === 1 || spacePressed.current || tool === 'pan') {
      isPanning.current = true
      panStart.current = { x: e.clientX - doc.viewport.panX, y: e.clientY - doc.viewport.panY }
      container.classList.add('cursor-grabbing')
      return
    }

    if (tool === 'eraser') {
      // Erase element under pointer
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
      // Check handles if single selection
      if (selectedIds.length === 1) {
        const selEl = doc.elements.find(el => el.id === selectedIds[0])
        if (selEl && selEl.type !== 'freedraw') {
          const bounds = getElementBounds(selEl)
          const z = doc.viewport.zoom
          const margin = 8 / z

          const handles = [
            { id: 'tl', x: bounds.x, y: bounds.y },
            { id: 'tr', x: bounds.x + bounds.width, y: bounds.y },
            { id: 'bl', x: bounds.x, y: bounds.y + bounds.height },
            { id: 'br', x: bounds.x + bounds.width, y: bounds.y + bounds.height }
          ]

          const handleHit = handles.find(h => Math.hypot(h.x - world.x, h.y - world.y) <= margin)
          if (handleHit) {
            dragHandle.current = handleHit.id
            initialElementBounds.current = { ...bounds }
            return
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
        setStrokeColor(hit.strokeColor || '#f4f4f5')
        setBackgroundColor(hit.backgroundColor || 'transparent')
        setStrokeWidth(hit.strokeWidth || 2)
        setStrokeStyle(hit.strokeStyle || 'solid')
        setFillStyle(hit.fillStyle || 'none')
        if (hit.fontSize) setFontSize(hit.fontSize)
      } else {
        // Clicked on empty space: clear selection and start marquee selection box
        if (!e.shiftKey) setSelectedIds([])
        marqueeBox.current = { startX: world.x, startY: world.y, currentX: world.x, currentY: world.y }
      }
      return
    }

    if (tool === 'text') {
      // Create new text element at click point
      const id = 'text_' + crypto.randomUUID()
      const newTextElement: DrawElement = {
        id,
        type: 'text',
        x: world.x,
        y: world.y,
        width: 150,
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
      setEditingText({ id, x: world.x, y: world.y, text: '' })
      setSelectedIds([id])
      setTool('select')
      return
    }

    // Creating new shape or freedraw
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

    if (!isPointerDown.current) {
      // Dynamic cursor update
      if (spacePressed.current || tool === 'pan') {
        container.style.cursor = 'grab'
      } else if (tool === 'select') {
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
  const handlePointerUp = () => {
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

    if (activeElementId.current) {
      const id = activeElementId.current
      activeElementId.current = null

      const created = docRef.current.elements.find(el => el.id === id)
      if (created) {
        // If element is microscopic or zero-size, remove it
        if (created.type !== 'freedraw' && Math.abs(created.width) < 5 && Math.abs(created.height) < 5) {
          setDoc(prev => ({
            ...prev,
            elements: prev.elements.filter(el => el.id !== id)
          }))
          return
        }

        // Auto select created element and switch back to select tool
        setSelectedIds([id])
        setTool('select')
        scheduleSave(docRef.current)
        pushHistory(docRef.current.elements)
      }
    }
  }

  // Double click on element to edit text
  const handleDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const container = containerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    const world = screenToWorld(e.clientX - rect.left, e.clientY - rect.top)

    const hit = doc.elements.slice().reverse().find(el => isPointInElement(world, el))
    if (hit && hit.type === 'text') {
      setEditingText({
        id: hit.id,
        x: hit.x,
        y: hit.y,
        text: hit.text || ''
      })
      setTimeout(() => {
        textInputRef.current?.focus()
        textInputRef.current?.select()
      }, 20)
    }
  }

  // Finish editing text
  const handleFinishEditingText = () => {
    if (!editingText) return
    const { id, text } = editingText

    if (!text.trim()) {
      // Remove empty text
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

  // Bring to Front / Send to Back
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

  // Export to PNG with high resolution and smart crop
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
    const scale = 2 // 2x high-res
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
      renderElementToCanvas(ctx, el)
    }
    ctx.restore()

    const link = document.createElement('a')
    link.download = `${note.title.replace(/[/\\?%*:|"<>]/g, '_') || 'pyrita-draw'}.png`
    link.href = offscreen.toDataURL('image/png')
    link.click()
  }

  // Clear Canvas with confirmation
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
    }
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

      {/* 2. Top Floating Excalidraw-like Toolbar */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-[#18181d]/90 backdrop-blur-md border border-zinc-700/80 p-1 rounded-xl shadow-2xl z-20">
        {[
          { id: 'select', icon: MousePointer, title: 'Seleção (V / 1)' },
          { id: 'rectangle', icon: Square, title: 'Retângulo (R / 2)' },
          { id: 'diamond', icon: Diamond, title: 'Losango (D / 3)' },
          { id: 'ellipse', icon: Circle, title: 'Círculo (C / 4)' },
          { id: 'arrow', icon: ArrowUpRight, title: 'Seta (A / 5)' },
          { id: 'line', icon: Minus, title: 'Linha (L / 6)' },
          { id: 'freedraw', icon: PenTool, title: 'Caneta / Lápis (P / 7)' },
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
              }}
              title={item.title}
              className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all cursor-pointer ${
                isActive
                  ? 'text-zinc-950 font-semibold shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80'
              }`}
              style={isActive ? { backgroundColor: 'var(--accent, #c59b27)' } : undefined}
            >
              <Icon className="w-4 h-4 stroke-[2]" />
            </button>
          )
        })}
      </div>

      {/* 3. Left Floating Properties Panel */}
      <div className="absolute top-16 left-3 bg-[#18181d]/90 backdrop-blur-md border border-zinc-700/80 p-2.5 rounded-xl shadow-2xl z-20 flex flex-col gap-3 text-xs w-52 max-h-[calc(100vh-140px)] overflow-y-auto scrollbar-none">
        {/* Stroke Color Palette */}
        <div>
          <span className="text-[11px] font-medium text-zinc-400 block mb-1.5">Cor do Traço</span>
          <div className="grid grid-cols-5 gap-1.5">
            {STROKE_COLORS.map(color => (
              <button
                key={color}
                onClick={() => {
                  setStrokeColor(color)
                  updateSelectedProperty('strokeColor', color)
                }}
                className={`w-7 h-7 rounded-md border flex items-center justify-center transition-transform hover:scale-110 cursor-pointer ${
                  strokeColor === color ? 'border-white scale-105 shadow-sm' : 'border-zinc-700'
                }`}
                style={{ backgroundColor: color }}
              >
                {strokeColor === color && (
                  <Check className={`w-3.5 h-3.5 ${color === '#f4f4f5' ? 'text-zinc-950' : 'text-white'}`} />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Fill Background Palette */}
        <div>
          <span className="text-[11px] font-medium text-zinc-400 block mb-1.5">Fundo</span>
          <div className="grid grid-cols-5 gap-1.5">
            {BG_COLORS.map(color => (
              <button
                key={color}
                onClick={() => {
                  setBackgroundColor(color)
                  updateSelectedProperty('backgroundColor', color)
                  if (color !== 'transparent' && fillStyle === 'none') {
                    setFillStyle('semi')
                    updateSelectedProperty('fillStyle', 'semi')
                  }
                }}
                className={`w-7 h-7 rounded-md border flex items-center justify-center transition-transform hover:scale-110 cursor-pointer ${
                  backgroundColor === color ? 'border-white scale-105 shadow-sm' : 'border-zinc-700'
                }`}
                style={{ backgroundColor: color === 'transparent' ? '#18181b' : color }}
                title={color === 'transparent' ? 'Transparente' : color}
              >
                {color === 'transparent' ? (
                  <span className="text-[9px] text-zinc-500 font-mono">None</span>
                ) : backgroundColor === color ? (
                  <Check className="w-3.5 h-3.5 text-white" />
                ) : null}
              </button>
            ))}
          </div>
        </div>

        {/* Fill Style */}
        {backgroundColor !== 'transparent' && (
          <div>
            <span className="text-[11px] font-medium text-zinc-400 block mb-1.5">Preenchimento</span>
            <div className="flex items-center gap-1 bg-zinc-900/60 p-0.5 rounded-lg border border-zinc-800">
              {[
                { id: 'semi', label: 'Suave' },
                { id: 'solid', label: 'Sólido' }
              ].map(opt => (
                <button
                  key={opt.id}
                  onClick={() => {
                    setFillStyle(opt.id as any)
                    updateSelectedProperty('fillStyle', opt.id as any)
                  }}
                  className={`flex-1 py-1 rounded text-[10.5px] font-medium transition-colors cursor-pointer ${
                    fillStyle === opt.id ? 'bg-zinc-750 text-white shadow-xs' : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Stroke Width */}
        <div>
          <span className="text-[11px] font-medium text-zinc-400 block mb-1.5">Espessura</span>
          <div className="flex items-center gap-1 bg-zinc-900/60 p-0.5 rounded-lg border border-zinc-800">
            {[
              { w: 2, label: 'Fino' },
              { w: 4, label: 'Médio' },
              { w: 7, label: 'Grosso' }
            ].map(opt => (
              <button
                key={opt.w}
                onClick={() => {
                  setStrokeWidth(opt.w)
                  updateSelectedProperty('strokeWidth', opt.w)
                }}
                className={`flex-1 py-1 rounded text-[10.5px] font-medium transition-colors cursor-pointer ${
                  strokeWidth === opt.w ? 'bg-zinc-750 text-white shadow-xs' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Stroke Style */}
        <div>
          <span className="text-[11px] font-medium text-zinc-400 block mb-1.5">Estilo do Traço</span>
          <div className="flex items-center gap-1 bg-zinc-900/60 p-0.5 rounded-lg border border-zinc-800">
            {[
              { id: 'solid', label: 'Contínuo' },
              { id: 'dashed', label: 'Tracejado' },
              { id: 'dotted', label: 'Pontilhado' }
            ].map(opt => (
              <button
                key={opt.id}
                onClick={() => {
                  setStrokeStyle(opt.id as any)
                  updateSelectedProperty('strokeStyle', opt.id as any)
                }}
                className={`flex-1 py-1 rounded text-[10.5px] font-medium transition-colors cursor-pointer ${
                  strokeStyle === opt.id ? 'bg-zinc-750 text-white shadow-xs' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tipografia */}
        <div>
          <span className="text-[11px] font-medium text-zinc-400 block mb-1.5">Tipografia</span>
          <div className="flex items-center gap-1 bg-zinc-900/60 p-0.5 rounded-lg border border-zinc-800">
            {[
              { id: 'sans', label: 'Normal' },
              { id: 'handwriting', label: 'Sketch' },
              { id: 'mono', label: 'Mono' }
            ].map(opt => (
              <button
                key={opt.id}
                onClick={() => {
                  setFontFamily(opt.id as any)
                  updateSelectedProperty('fontFamily', opt.id as any)
                }}
                className={`flex-1 py-1 rounded text-[10.5px] font-medium transition-colors cursor-pointer ${
                  fontFamily === opt.id ? 'bg-zinc-750 text-white shadow-xs' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Selected Element Actions */}
        {selectedIds.length > 0 && (
          <div className="pt-2 border-t border-zinc-800 flex flex-col gap-1.5">
            <span className="text-[11px] font-medium text-zinc-400">Ações ({selectedIds.length})</span>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                onClick={handleDuplicateSelected}
                className="flex items-center justify-center gap-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 p-1.5 rounded-lg transition-colors cursor-pointer text-[10.5px]"
                title="Duplicar selecionados (Ctrl+D)"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Duplicar</span>
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
                }}
                className="flex items-center justify-center gap-1 bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 p-1.5 rounded-lg transition-colors cursor-pointer text-[10.5px]"
                title="Excluir selecionados (Del)"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Excluir</span>
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => handleReorder('front')}
                className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 py-1 rounded-md text-[10px] cursor-pointer"
                title="Trazer para frente"
              >
                Trazer p/ Frente
              </button>
              <button
                onClick={() => handleReorder('back')}
                className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 py-1 rounded-md text-[10px] cursor-pointer"
                title="Enviar para trás"
              >
                Enviar p/ Trás
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 4. Top Right Floating Export & Actions Panel */}
      <div className="absolute top-3 right-3 flex items-center gap-1.5 bg-[#18181d]/90 backdrop-blur-md border border-zinc-700/80 p-1 rounded-xl shadow-2xl z-20">
        <button
          onClick={handleExportPNG}
          className="flex items-center gap-1 px-2.5 py-1 text-zinc-950 font-semibold rounded-lg text-xs transition-opacity hover:opacity-90 shadow-sm cursor-pointer"
          style={{ backgroundColor: 'var(--accent, #c59b27)' }}
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
      <div className="absolute bottom-3 left-3 flex items-center gap-1 bg-[#18181d]/90 backdrop-blur-md border border-zinc-700/80 p-1 rounded-xl shadow-2xl z-20 text-xs">
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

      {/* 6. In-place Overlay Text Editor */}
      {editingText && (
        <div
          className="absolute z-30"
          style={{
            left: `${worldToScreen(editingText.x, editingText.y).x}px`,
            top: `${worldToScreen(editingText.x, editingText.y).y}px`
          }}
        >
          <textarea
            ref={textInputRef}
            value={editingText.text}
            onChange={e => setEditingText(prev => prev ? { ...prev, text: e.target.value } : null)}
            onBlur={handleFinishEditingText}
            onKeyDown={e => {
              if (e.key === 'Escape') {
                handleFinishEditingText()
              }
            }}
            placeholder="Digite algo..."
            className="bg-[#18181d]/95 text-zinc-100 border border-amber-500/80 rounded-lg p-2 outline-none shadow-2xl resize min-w-[200px] min-h-[40px] text-lg font-sans leading-snug"
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
