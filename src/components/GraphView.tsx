import React, { useEffect, useRef, useState } from 'react'
import type { Note, LinkEdge, GraphNode } from '../types'
import { buildGraphEdges } from '../utils/vault'
import { ZoomIn, ZoomOut, RotateCcw, Filter, Search, Sparkles } from 'lucide-react'

interface GraphViewProps {
  notes: Note[]
  currentNoteId?: string
  onSelectNote: (noteId: string) => void
}

export const GraphView: React.FC<GraphViewProps> = ({
  notes,
  currentNoteId,
  onSelectNote
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [nodes, setNodes] = useState<GraphNode[]>([])
  const [edges, setEdges] = useState<LinkEdge[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedTag, setSelectedTag] = useState<string | null>(null)
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)

  // Camera transform
  const transformRef = useRef({ x: 0, y: 0, scale: 1 })
  const isDraggingCanvasRef = useRef(false)
  const dragStartRef = useRef({ x: 0, y: 0 })
  const draggedNodeRef = useRef<GraphNode | null>(null)

  // Initialize or update nodes and edges
  useEffect(() => {
    const rawEdges = buildGraphEdges(notes)
    setEdges(rawEdges)

    // Calculate node degrees
    const degreeMap = new Map<string, number>()
    for (const e of rawEdges) {
      degreeMap.set(e.source, (degreeMap.get(e.source) || 0) + 1)
      degreeMap.set(e.target, (degreeMap.get(e.target) || 0) + 1)
    }

    // Palette for folders
    const folderColors: Record<string, string> = {
      'Início': '#8b5cf6',
      'Engenharia': '#38bdf8',
      'Metodologia': '#34d399',
      'Criatividade': '#f472b6',
      'Inovação': '#fbbf24',
    }

    setNodes(prev => {
      const existing = new Map(prev.map(n => [n.id, n]))
      const radius = 250

      return notes.map((note, index) => {
        const found = existing.get(note.id)
        const angle = (index / Math.max(1, notes.length)) * Math.PI * 2
        const connections = degreeMap.get(note.id) || 0

        return {
          id: note.id,
          title: note.title,
          folder: note.folder,
          tags: note.tags,
          connections,
          x: found?.x ?? Math.cos(angle) * radius + (Math.random() - 0.5) * 50,
          y: found?.y ?? Math.sin(angle) * radius + (Math.random() - 0.5) * 50,
          vx: found?.vx ?? 0,
          vy: found?.vy ?? 0,
          color: folderColors[note.folder] || '#a78bfa'
        }
      })
    })
  }, [notes])

  // Physics animation loop
  useEffect(() => {
    let animationFrameId: number
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const tick = () => {
      // 1. Apply Forces
      const repulsion = 1800
      const springLength = 120
      const springStrength = 0.05
      const centerPull = 0.008
      const damping = 0.85

      // Repulsion between nodes
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const n1 = nodes[i]
          const n2 = nodes[j]
          const dx = n2.x - n1.x
          const dy = n2.y - n1.y
          const distSq = dx * dx + dy * dy || 1
          const dist = Math.sqrt(distSq)

          if (dist < 400) {
            const force = repulsion / distSq
            const fx = (dx / dist) * force
            const fy = (dy / dist) * force
            if (draggedNodeRef.current?.id !== n1.id) {
              n1.vx -= fx
              n1.vy -= fy
            }
            if (draggedNodeRef.current?.id !== n2.id) {
              n2.vx += fx
              n2.vy += fy
            }
          }
        }
      }

      // Spring attraction along edges
      const nodeMap = new Map(nodes.map(n => [n.id, n]))
      for (const edge of edges) {
        const source = nodeMap.get(edge.source)
        const target = nodeMap.get(edge.target)
        if (source && target) {
          const dx = target.x - source.x
          const dy = target.y - source.y
          const dist = Math.sqrt(dx * dx + dy * dy) || 1
          const delta = dist - springLength
          const fx = (dx / dist) * delta * springStrength
          const fy = (dy / dist) * delta * springStrength

          if (draggedNodeRef.current?.id !== source.id) {
            source.vx += fx
            source.vy += fy
          }
          if (draggedNodeRef.current?.id !== target.id) {
            target.vx -= fx
            target.vy -= fy
          }
        }
      }

      // Center gravity & update position
      for (const node of nodes) {
        if (draggedNodeRef.current?.id !== node.id) {
          node.vx -= node.x * centerPull
          node.vy -= node.y * centerPull
          node.vx *= damping
          node.vy *= damping
          node.x += node.vx
          node.y += node.vy
        }
      }

      // 2. Render Frame
      const { width, height } = canvas
      ctx.clearRect(0, 0, width, height)

      // Background subtle grid
      ctx.save()
      ctx.fillStyle = '#121214'
      ctx.fillRect(0, 0, width, height)

      // Apply camera transformation
      const transform = transformRef.current
      ctx.translate(width / 2 + transform.x, height / 2 + transform.y)
      ctx.scale(transform.scale, transform.scale)

      // Collect connected nodes for hover highlighting
      const connectedNodeIds = new Set<string>()
      if (hoveredNodeId) {
        connectedNodeIds.add(hoveredNodeId)
        for (const edge of edges) {
          if (edge.source === hoveredNodeId) connectedNodeIds.add(edge.target)
          if (edge.target === hoveredNodeId) connectedNodeIds.add(edge.source)
        }
      }

      // Draw Edges
      for (const edge of edges) {
        const source = nodeMap.get(edge.source)
        const target = nodeMap.get(edge.target)
        if (!source || !target) continue

        const isHighlighted = hoveredNodeId
          ? (edge.source === hoveredNodeId || edge.target === hoveredNodeId)
          : false

        ctx.beginPath()
        ctx.moveTo(source.x, source.y)
        ctx.lineTo(target.x, target.y)

        if (isHighlighted) {
          ctx.strokeStyle = '#c084fc'
          ctx.lineWidth = 2.5
        } else if (hoveredNodeId) {
          ctx.strokeStyle = 'rgba(63, 63, 70, 0.2)'
          ctx.lineWidth = 1
        } else {
          ctx.strokeStyle = 'rgba(113, 113, 122, 0.4)'
          ctx.lineWidth = 1.2
        }
        ctx.stroke()
      }

      // Draw Nodes
      for (const node of nodes) {
        const isCurrent = node.id === currentNoteId
        const isHovered = node.id === hoveredNodeId
        const isConnected = connectedNodeIds.has(node.id)
        const matchesSearch = searchQuery
          ? node.title.toLowerCase().includes(searchQuery.toLowerCase())
          : true
        const matchesTag = selectedTag ? node.tags.includes(selectedTag) : true

        const nodeRadius = 6 + Math.min(18, node.connections * 3)

        ctx.save()

        // Dim if filtering
        if ((searchQuery && !matchesSearch) || (selectedTag && !matchesTag)) {
          ctx.globalAlpha = 0.15
        } else if (hoveredNodeId && !isHovered && !isConnected) {
          ctx.globalAlpha = 0.25
        }

        // Outer Glow for active or hovered
        if (isCurrent || isHovered) {
          ctx.beginPath()
          ctx.arc(node.x, node.y, nodeRadius + 6, 0, Math.PI * 2)
          ctx.fillStyle = isCurrent ? 'rgba(139, 92, 246, 0.35)' : 'rgba(192, 132, 252, 0.3)'
          ctx.fill()
        }

        // Main Node Circle
        ctx.beginPath()
        ctx.arc(node.x, node.y, nodeRadius, 0, Math.PI * 2)
        ctx.fillStyle = node.color || '#8b5cf6'
        ctx.fill()
        ctx.lineWidth = isCurrent ? 2.5 : 1.5
        ctx.strokeStyle = isCurrent ? '#ffffff' : '#27272a'
        ctx.stroke()

        // Node Label
        ctx.font = `${Math.max(10, 11 + node.connections * 0.5)}px sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'

        if (isHovered || isCurrent || transform.scale > 0.8 || node.connections > 1) {
          ctx.fillStyle = isHovered || isCurrent ? '#ffffff' : '#d4d4d8'
          ctx.fillText(node.title, node.x, node.y + nodeRadius + 4)
        }

        ctx.restore()
      }

      ctx.restore()
      animationFrameId = requestAnimationFrame(tick)
    }

    animationFrameId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(animationFrameId)
  }, [nodes, edges, currentNoteId, hoveredNodeId, searchQuery, selectedTag])

  // Canvas Mouse Interactions
  const getCanvasMouse = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    const transform = transformRef.current
    const screenX = e.clientX - rect.left - canvas.width / 2 - transform.x
    const screenY = e.clientY - rect.top - canvas.height / 2 - transform.y
    return {
      x: screenX / transform.scale,
      y: screenY / transform.scale
    }
  }

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const mouse = getCanvasMouse(e)

    // Check if clicked a node
    for (const node of nodes) {
      const radius = 6 + Math.min(18, node.connections * 3) + 4
      const dx = mouse.x - node.x
      const dy = mouse.y - node.y
      if (dx * dx + dy * dy <= radius * radius) {
        draggedNodeRef.current = node
        return
      }
    }

    // Otherwise pan canvas
    isDraggingCanvasRef.current = true
    dragStartRef.current = { x: e.clientX, y: e.clientY }
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const mouse = getCanvasMouse(e)

    // Dragging a node
    if (draggedNodeRef.current) {
      draggedNodeRef.current.x = mouse.x
      draggedNodeRef.current.y = mouse.y
      draggedNodeRef.current.vx = 0
      draggedNodeRef.current.vy = 0
      return
    }

    // Panning canvas
    if (isDraggingCanvasRef.current) {
      const dx = e.clientX - dragStartRef.current.x
      const dy = e.clientY - dragStartRef.current.y
      transformRef.current.x += dx
      transformRef.current.y += dy
      dragStartRef.current = { x: e.clientX, y: e.clientY }
      return
    }

    // Check hover
    let foundHover: string | null = null
    for (const node of nodes) {
      const radius = 6 + Math.min(18, node.connections * 3) + 4
      const dx = mouse.x - node.x
      const dy = mouse.y - node.y
      if (dx * dx + dy * dy <= radius * radius) {
        foundHover = node.id
        break
      }
    }
    setHoveredNodeId(foundHover)
  }

  const handleMouseUp = () => {
    if (draggedNodeRef.current) {
      // If barely moved, count as click
      draggedNodeRef.current = null
    }
    isDraggingCanvasRef.current = false
  }

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const mouse = getCanvasMouse(e)
    for (const node of nodes) {
      const radius = 6 + Math.min(18, node.connections * 3) + 4
      const dx = mouse.x - node.x
      const dy = mouse.y - node.y
      if (dx * dx + dy * dy <= radius * radius) {
        onSelectNote(node.id)
        return
      }
    }
  }

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9
    transformRef.current.scale = Math.min(3, Math.max(0.2, transformRef.current.scale * zoomFactor))
  }

  const handleResetZoom = () => {
    transformRef.current = { x: 0, y: 0, scale: 1 }
  }

  // Collect all unique tags for filtering
  const allTags = Array.from(new Set(notes.flatMap(n => n.tags)))

  return (
    <div className="relative w-full h-full bg-zinc-950 overflow-hidden flex flex-col">
      {/* Top Floating Controls */}
      <div className="absolute top-4 left-4 z-10 flex items-center gap-2 bg-zinc-900/90 backdrop-blur-md border border-zinc-800 rounded-lg p-1.5 shadow-xl">
        <div className="relative flex items-center">
          <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar no grafo..."
            className="w-44 pl-8 pr-2 py-1 bg-zinc-800/80 border border-zinc-700/60 rounded text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-violet-500"
          />
        </div>

        {allTags.length > 0 && (
          <div className="flex items-center gap-1 border-l border-zinc-800 pl-2">
            <Filter className="w-3 h-3 text-zinc-400" />
            <select
              value={selectedTag || ''}
              onChange={(e) => setSelectedTag(e.target.value || null)}
              className="bg-zinc-800 text-xs text-zinc-300 rounded px-1.5 py-1 border border-zinc-700/60 focus:outline-none focus:border-violet-500"
            >
              <option value="">Todas as tags</option>
              {allTags.map(tag => (
                <option key={tag} value={tag}>#{tag}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Floating Zoom & Controls */}
      <div className="absolute bottom-4 right-4 z-10 flex flex-col gap-1 bg-zinc-900/90 backdrop-blur-md border border-zinc-800 rounded-lg p-1 shadow-xl">
        <button
          onClick={() => { transformRef.current.scale = Math.min(3, transformRef.current.scale * 1.2) }}
          className="p-2 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded transition-colors"
          title="Aproximar (Zoom In)"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          onClick={() => { transformRef.current.scale = Math.max(0.2, transformRef.current.scale * 0.8) }}
          className="p-2 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded transition-colors"
          title="Afastar (Zoom Out)"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <button
          onClick={handleResetZoom}
          className="p-2 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded transition-colors"
          title="Resetar Câmera"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>

      {/* Graph Legend & Status */}
      <div className="absolute bottom-4 left-4 z-10 bg-zinc-900/80 backdrop-blur-md border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-400 flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-violet-400" />
          <span className="font-medium text-zinc-200">{nodes.length} notas</span>
        </div>
        <span>•</span>
        <span>{edges.length} conexões</span>
        <span>•</span>
        <span className="text-zinc-500">Arraste para mover • Clique para abrir</span>
      </div>

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        width={window.innerWidth}
        height={window.innerHeight}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onClick={handleClick}
        onWheel={handleWheel}
        className="w-full h-full cursor-grab active:cursor-grabbing"
      />
    </div>
  )
}
