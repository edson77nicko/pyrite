import React, { useEffect, useRef, useState, useMemo } from 'react'
import type { Note, LinkEdge, GraphNode, GraphSettings } from '../types'
import { buildGraphEdges } from '../utils/vault'
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Filter,
  Search,
  Sparkles,
  Sliders,
  Focus
} from 'lucide-react'

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
  const [isLocalMode, setIsLocalMode] = useState(false)
  const [showSettingsDrawer, setShowSettingsDrawer] = useState(false)

  // Graph physics & visual parameters
  const [settings, setSettings] = useState<GraphSettings>({
    repulsion: 2200,
    linkDistance: 130,
    centerGravity: 0.008,
    nodeSize: 1,
    showLabels: true,
    showArrows: true,
    isLocalGraph: false
  })

  // Camera transform
  const transformRef = useRef({ x: 0, y: 0, scale: 1 })
  const isDraggingCanvasRef = useRef(false)
  const dragStartRef = useRef({ x: 0, y: 0 })
  const draggedNodeRef = useRef<GraphNode | null>(null)

  // Filter notes and edges if in Local Graph mode
  const { filteredNotes, filteredEdges } = useMemo(() => {
    const rawEdges = buildGraphEdges(notes)

    if (!isLocalMode || !currentNoteId) {
      return { filteredNotes: notes, filteredEdges: rawEdges }
    }

    // Local mode: current note + 1st degree neighbors
    const neighborIds = new Set<string>([currentNoteId])
    for (const e of rawEdges) {
      if (e.source === currentNoteId) neighborIds.add(e.target)
      if (e.target === currentNoteId) neighborIds.add(e.source)
    }

    const localNotes = notes.filter(n => neighborIds.has(n.id))
    const localEdges = rawEdges.filter(e => neighborIds.has(e.source) && neighborIds.has(e.target))

    return { filteredNotes: localNotes, filteredEdges: localEdges }
  }, [notes, isLocalMode, currentNoteId])

  // Initialize nodes and edges
  useEffect(() => {
    setEdges(filteredEdges)

    const degreeMap = new Map<string, number>()
    for (const e of filteredEdges) {
      degreeMap.set(e.source, (degreeMap.get(e.source) || 0) + 1)
      degreeMap.set(e.target, (degreeMap.get(e.target) || 0) + 1)
    }

    const folderColors: Record<string, string> = {
      'Início': '#8b5cf6',
      'Engenharia': '#38bdf8',
      'Metodologia': '#34d399',
      'Criatividade': '#f472b6',
      'Inovação': '#fbbf24',
    }

    setNodes(prev => {
      const existing = new Map(prev.map(n => [n.id, n]))
      const radius = isLocalMode ? 140 : 260

      return filteredNotes.map((note, index) => {
        const found = existing.get(note.id)
        const angle = (index / Math.max(1, filteredNotes.length)) * Math.PI * 2
        const connections = degreeMap.get(note.id) || 0

        return {
          id: note.id,
          title: note.title,
          folder: note.folder,
          tags: note.tags,
          connections,
          x: found?.x ?? Math.cos(angle) * radius + (Math.random() - 0.5) * 40,
          y: found?.y ?? Math.sin(angle) * radius + (Math.random() - 0.5) * 40,
          vx: found?.vx ?? 0,
          vy: found?.vy ?? 0,
          color: folderColors[note.folder] || '#a78bfa'
        }
      })
    })
  }, [filteredNotes, filteredEdges, isLocalMode])

  // Physics animation loop
  useEffect(() => {
    let animationFrameId: number
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const tick = () => {
      // 1. Force Simulation
      const repulsion = settings.repulsion
      const springLength = settings.linkDistance
      const springStrength = 0.05
      const centerPull = settings.centerGravity
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

          if (dist < 500) {
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

      // 2. Render Canvas Frame
      const { width, height } = canvas
      ctx.clearRect(0, 0, width, height)

      // Background subtle grid
      ctx.save()
      ctx.fillStyle = '#0f0f12'
      ctx.fillRect(0, 0, width, height)

      // Apply camera transformation
      const transform = transformRef.current
      ctx.translate(width / 2 + transform.x, height / 2 + transform.y)
      ctx.scale(transform.scale, transform.scale)

      // Connected nodes for hover
      const connectedNodeIds = new Set<string>()
      if (hoveredNodeId) {
        connectedNodeIds.add(hoveredNodeId)
        for (const edge of edges) {
          if (edge.source === hoveredNodeId) connectedNodeIds.add(edge.target)
          if (edge.target === hoveredNodeId) connectedNodeIds.add(edge.source)
        }
      }

      // Draw Edges & Directed Arrows
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
          ctx.strokeStyle = 'rgba(113, 113, 122, 0.45)'
          ctx.lineWidth = 1.3
        }
        ctx.stroke()

        // Draw directional arrow on link if enabled
        if (settings.showArrows) {
          const midX = (source.x + target.x) / 2
          const midY = (source.y + target.y) / 2
          const angle = Math.atan2(target.y - source.y, target.x - source.x)
          const arrowSize = 6

          ctx.save()
          ctx.translate(midX, midY)
          ctx.rotate(angle)
          ctx.beginPath()
          ctx.moveTo(0, 0)
          ctx.lineTo(-arrowSize, -arrowSize * 0.6)
          ctx.lineTo(-arrowSize, arrowSize * 0.6)
          ctx.closePath()
          ctx.fillStyle = isHighlighted ? '#c084fc' : 'rgba(161, 161, 170, 0.6)'
          ctx.fill()
          ctx.restore()
        }
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

        const baseRadius = (6 + Math.min(18, node.connections * 3)) * settings.nodeSize

        ctx.save()

        // Dim if filtering
        if ((searchQuery && !matchesSearch) || (selectedTag && !matchesTag)) {
          ctx.globalAlpha = 0.12
        } else if (hoveredNodeId && !isHovered && !isConnected) {
          ctx.globalAlpha = 0.2
        }

        // Outer Glow for active or hovered
        if (isCurrent || isHovered) {
          ctx.beginPath()
          ctx.arc(node.x, node.y, baseRadius + 7, 0, Math.PI * 2)
          ctx.fillStyle = isCurrent ? 'rgba(139, 92, 246, 0.4)' : 'rgba(192, 132, 252, 0.35)'
          ctx.fill()
        }

        // Node Body
        ctx.beginPath()
        ctx.arc(node.x, node.y, baseRadius, 0, Math.PI * 2)
        ctx.fillStyle = node.color || '#8b5cf6'
        ctx.fill()
        ctx.lineWidth = isCurrent ? 2.5 : 1.5
        ctx.strokeStyle = isCurrent ? '#ffffff' : '#27272a'
        ctx.stroke()

        // Node Label
        if (settings.showLabels) {
          ctx.font = `${Math.max(10, 11 + node.connections * 0.5)}px system-ui, sans-serif`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'top'

          if (isHovered || isCurrent || transform.scale > 0.75 || node.connections > 1) {
            ctx.fillStyle = isHovered || isCurrent ? '#ffffff' : '#e4e4e7'
            ctx.shadowColor = 'rgba(0,0,0,0.8)'
            ctx.shadowBlur = 4
            ctx.fillText(node.title, node.x, node.y + baseRadius + 4)
          }
        }

        ctx.restore()
      }

      ctx.restore()
      animationFrameId = requestAnimationFrame(tick)
    }

    animationFrameId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(animationFrameId)
  }, [nodes, edges, currentNoteId, hoveredNodeId, searchQuery, selectedTag, settings])

  // Mouse transformations
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

    for (const node of nodes) {
      const radius = (6 + Math.min(18, node.connections * 3)) * settings.nodeSize + 4
      const dx = mouse.x - node.x
      const dy = mouse.y - node.y
      if (dx * dx + dy * dy <= radius * radius) {
        draggedNodeRef.current = node
        return
      }
    }

    isDraggingCanvasRef.current = true
    dragStartRef.current = { x: e.clientX, y: e.clientY }
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const mouse = getCanvasMouse(e)

    if (draggedNodeRef.current) {
      draggedNodeRef.current.x = mouse.x
      draggedNodeRef.current.y = mouse.y
      draggedNodeRef.current.vx = 0
      draggedNodeRef.current.vy = 0
      return
    }

    if (isDraggingCanvasRef.current) {
      const dx = e.clientX - dragStartRef.current.x
      const dy = e.clientY - dragStartRef.current.y
      transformRef.current.x += dx
      transformRef.current.y += dy
      dragStartRef.current = { x: e.clientX, y: e.clientY }
      return
    }

    let foundHover: string | null = null
    for (const node of nodes) {
      const radius = (6 + Math.min(18, node.connections * 3)) * settings.nodeSize + 4
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
      draggedNodeRef.current = null
    }
    isDraggingCanvasRef.current = false
  }

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const mouse = getCanvasMouse(e)
    for (const node of nodes) {
      const radius = (6 + Math.min(18, node.connections * 3)) * settings.nodeSize + 4
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

  const allTags = Array.from(new Set(notes.flatMap(n => n.tags)))

  return (
    <div className="relative w-full h-full bg-zinc-950 overflow-hidden flex flex-col select-none">
      {/* 1. Top Controls Bar */}
      <div className="absolute top-4 left-4 z-20 flex items-center gap-2 bg-zinc-900/90 backdrop-blur-md border border-zinc-800 rounded-xl p-1.5 shadow-2xl">
        {/* Search */}
        <div className="relative flex items-center">
          <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar nó..."
            className="w-40 pl-8 pr-2 py-1 bg-zinc-800/80 border border-zinc-700/60 rounded-lg text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-violet-500"
          />
        </div>

        {/* Tag filter */}
        {allTags.length > 0 && (
          <div className="flex items-center gap-1 border-l border-zinc-800 pl-2">
            <Filter className="w-3 h-3 text-zinc-400" />
            <select
              value={selectedTag || ''}
              onChange={(e) => setSelectedTag(e.target.value || null)}
              className="bg-zinc-800 text-xs text-zinc-300 rounded-lg px-2 py-1 border border-zinc-700/60 focus:outline-none focus:border-violet-500"
            >
              <option value="">Todas as tags</option>
              {allTags.map(tag => (
                <option key={tag} value={tag}>#{tag}</option>
              ))}
            </select>
          </div>
        )}

        <div className="h-4 w-px bg-zinc-800" />

        {/* Global vs Local Toggle (Obsidian feature) */}
        <button
          onClick={() => setIsLocalMode(m => !m)}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
            isLocalMode
              ? 'bg-violet-600 text-white shadow-sm'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
          }`}
          title="Alternar entre Grafo Global e Grafo Local (focado na nota atual)"
        >
          <Focus className="w-3.5 h-3.5" />
          <span>{isLocalMode ? 'Grafo Local' : 'Grafo Global'}</span>
        </button>

        {/* Settings Drawer Toggle */}
        <button
          onClick={() => setShowSettingsDrawer(d => !d)}
          className={`p-1.5 rounded-lg transition-colors ${
            showSettingsDrawer
              ? 'bg-zinc-800 text-violet-300'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
          }`}
          title="Configurações de Física e Visualização do Grafo"
        >
          <Sliders className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* 2. Collapsible Settings Drawer */}
      {showSettingsDrawer && (
        <div className="absolute top-16 left-4 z-20 w-64 bg-zinc-900/95 backdrop-blur-md border border-zinc-800 rounded-xl p-3.5 shadow-2xl space-y-3 text-xs text-zinc-300">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-2 font-semibold text-zinc-100">
            <span>Ajustes do Grafo</span>
            <button onClick={() => setShowSettingsDrawer(false)} className="text-zinc-500 hover:text-zinc-300">✕</button>
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-[11px] text-zinc-400">
              <span>Repulsão dos Nós</span>
              <span>{settings.repulsion}</span>
            </div>
            <input
              type="range"
              min="800"
              max="4000"
              step="100"
              value={settings.repulsion}
              onChange={(e) => setSettings(s => ({ ...s, repulsion: Number(e.target.value) }))}
              className="w-full accent-violet-500"
            />
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-[11px] text-zinc-400">
              <span>Distância dos Links</span>
              <span>{settings.linkDistance}px</span>
            </div>
            <input
              type="range"
              min="60"
              max="240"
              step="10"
              value={settings.linkDistance}
              onChange={(e) => setSettings(s => ({ ...s, linkDistance: Number(e.target.value) }))}
              className="w-full accent-violet-500"
            />
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-[11px] text-zinc-400">
              <span>Escala dos Nós</span>
              <span>{settings.nodeSize.toFixed(1)}x</span>
            </div>
            <input
              type="range"
              min="0.6"
              max="1.8"
              step="0.1"
              value={settings.nodeSize}
              onChange={(e) => setSettings(s => ({ ...s, nodeSize: Number(e.target.value) }))}
              className="w-full accent-violet-500"
            />
          </div>

          <div className="pt-2 border-t border-zinc-800 flex items-center justify-between">
            <span className="text-[11px]">Setas de Direção</span>
            <input
              type="checkbox"
              checked={settings.showArrows}
              onChange={(e) => setSettings(s => ({ ...s, showArrows: e.target.checked }))}
              className="accent-violet-500 rounded"
            />
          </div>

          <div className="flex items-center justify-between">
            <span className="text-[11px]">Nomes Sempre Visíveis</span>
            <input
              type="checkbox"
              checked={settings.showLabels}
              onChange={(e) => setSettings(s => ({ ...s, showLabels: e.target.checked }))}
              className="accent-violet-500 rounded"
            />
          </div>
        </div>
      )}

      {/* 3. Floating Zoom Controls */}
      <div className="absolute bottom-5 right-5 z-20 flex flex-col gap-1 bg-zinc-900/90 backdrop-blur-md border border-zinc-800 rounded-xl p-1 shadow-2xl">
        <button
          onClick={() => { transformRef.current.scale = Math.min(3, transformRef.current.scale * 1.25) }}
          className="p-2 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-lg transition-colors"
          title="Aproximar Zoom"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          onClick={() => { transformRef.current.scale = Math.max(0.2, transformRef.current.scale * 0.8) }}
          className="p-2 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-lg transition-colors"
          title="Afastar Zoom"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <button
          onClick={handleResetZoom}
          className="p-2 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-lg transition-colors"
          title="Centralizar e Resetar"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>

      {/* 4. Bottom Legend & Status */}
      <div className="absolute bottom-5 left-5 z-20 bg-zinc-900/90 backdrop-blur-md border border-zinc-800 rounded-xl px-3.5 py-2 text-xs text-zinc-400 flex items-center gap-3 shadow-2xl">
        <div className="flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-violet-400" />
          <span className="font-semibold text-zinc-200">{nodes.length} nós</span>
        </div>
        <span className="text-zinc-700">•</span>
        <span>{edges.length} links</span>
        <span className="text-zinc-700">•</span>
        <span className="text-zinc-500 text-[11px]">
          {isLocalMode ? 'Foco local ativado' : 'Arraste para mover • Clique para abrir'}
        </span>
      </div>

      {/* 5. Canvas Element */}
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
