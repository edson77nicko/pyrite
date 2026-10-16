import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import type { Note, LinkEdge, GraphSettings } from '../types'
import { buildGraphEdges } from '../utils/vault'
import {
  Search,
  X,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Focus,
  Sliders,
  Map as MapIcon,
  Cpu,
  Radar,
  ExternalLink,
  Layers,
  ArrowRight
} from 'lucide-react'

interface GraphViewProps {
  notes: Note[]
  currentNoteId?: string
  onSelectNote: (noteId: string) => void
}

type GraphLayoutMode = 'atlas' | 'circuit' | 'radar'

interface SimNode {
  id: string
  title: string
  folder: string
  tags: string[]
  connections: number
  excerpt: string
  x: number
  y: number
  vx: number
  vy: number
  width: number
  height: number
  color: string
}

interface Particle {
  sourceId: string
  targetId: string
  progress: number
  speed: number
  color: string
}

const FOLDER_PALETTE: string[] = [
  '#c59b27', // Pyrita Gold
  '#38bdf8', // Sky Blue
  '#a855f7', // Electric Violet
  '#10b981', // Emerald
  '#f43f5e', // Rose
  '#fb923c', // Tangerine
  '#6366f1', // Indigo
  '#2dd4bf', // Teal
  '#ec4899', // Fuchsia
  '#84cc16', // Lime
  '#e2e8f0'  // Slate
]

// 2D Convex Hull (Andrew's Monotone Chain) for Territory Islands
function getConvexHull(points: { x: number; y: number }[]): { x: number; y: number }[] {
  if (points.length <= 2) return points

  const sorted = [...points].sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x))

  const cross = (o: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)

  const lower: { x: number; y: number }[] = []
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop()
    }
    lower.push(p)
  }

  const upper: { x: number; y: number }[] = []
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop()
    }
    upper.push(p)
  }

  lower.pop()
  upper.pop()
  return lower.concat(upper)
}

export const GraphView: React.FC<GraphViewProps> = ({
  notes,
  currentNoteId,
  onSelectNote
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  // Simulation State
  const [nodes, setNodes] = useState<SimNode[]>([])
  const [edges, setEdges] = useState<LinkEdge[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)
  const [hoveredFolder, setHoveredFolder] = useState<string | null>(null)
  const [isLocalMode, setIsLocalMode] = useState(false)
  const [layoutMode, setLayoutMode] = useState<GraphLayoutMode>('atlas')
  const [showSettingsDrawer, setShowSettingsDrawer] = useState(false)

  // Settings
  const [settings, setSettings] = useState<GraphSettings & {
    enableTerritories: boolean
    enablePulses: boolean
    clusterStrength: number
    radarSpeed: number
  }>({
    repulsion: 2600,
    linkDistance: 140,
    centerGravity: 0.012,
    nodeSize: 1.0,
    showLabels: true,
    showArrows: true,
    isLocalGraph: false,
    enableTerritories: true,
    enablePulses: true,
    clusterStrength: 0.06,
    radarSpeed: 1.0
  })

  // Camera & Interaction Refs
  const transformRef = useRef({ x: 0, y: 0, scale: 0.85 })
  const isDraggingCanvasRef = useRef(false)
  const pointerDownRef = useRef<{ x: number; y: number; time: number } | null>(null)
  const draggedNodeRef = useRef<SimNode | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const simAlphaRef = useRef<number>(1.0)
  const radarAngleRef = useRef<number>(0)

  // Signal Packets along edges
  const particlesRef = useRef<Particle[]>([])

  // Folder Colors
  const folderColorMap = useMemo(() => {
    const folders = Array.from(new Set(notes.map(n => n.folder || 'Início'))).sort()
    const map = new Map<string, string>()
    folders.forEach((f, idx) => {
      map.set(f, FOLDER_PALETTE[idx % FOLDER_PALETTE.length])
    })
    return map
  }, [notes])

  // Filter notes & edges
  const { filteredNotes, filteredEdges } = useMemo(() => {
    const rawEdges = buildGraphEdges(notes)

    if (!isLocalMode || !currentNoteId) {
      return { filteredNotes: notes, filteredEdges: rawEdges }
    }

    const neighborIds = new Set<string>([currentNoteId])
    for (const e of rawEdges) {
      if (e.source === currentNoteId) neighborIds.add(e.target)
      if (e.target === currentNoteId) neighborIds.add(e.source)
    }

    const localNotes = notes.filter(n => neighborIds.has(n.id))
    const localEdges = rawEdges.filter(e => neighborIds.has(e.source) && neighborIds.has(e.target))

    return { filteredNotes: localNotes, filteredEdges: localEdges }
  }, [notes, isLocalMode, currentNoteId])

  // Initialize node positions & metrics
  useEffect(() => {
    setEdges(filteredEdges)

    const degreeMap = new Map<string, number>()
    for (const e of filteredEdges) {
      degreeMap.set(e.source, (degreeMap.get(e.source) || 0) + 1)
      degreeMap.set(e.target, (degreeMap.get(e.target) || 0) + 1)
    }

    setNodes(prev => {
      const existing = new Map(prev.map(n => [n.id, n]))
      const total = Math.max(1, filteredNotes.length)

      // Measure text approximation for initial widths
      return filteredNotes.map((note, index) => {
        const found = existing.get(note.id)
        const connections = degreeMap.get(note.id) || 0
        const angle = (index / total) * Math.PI * 2
        const dist = 180 + Math.random() * 140

        const color = folderColorMap.get(note.folder) || '#c59b27'

        // Architectural capsule dimensions
        const charLen = Math.min(26, note.title.length)
        const width = Math.max(88, charLen * 7.5 + 40)
        const height = 24

        const rawText = note.content.replace(/[#*`>~\[\]\(\)-]/g, ' ').replace(/\s+/g, ' ').trim()
        const excerpt = rawText.slice(0, 140) + (rawText.length > 140 ? '...' : '')

        return {
          id: note.id,
          title: note.title,
          folder: note.folder,
          tags: note.tags,
          connections,
          excerpt,
          x: found?.x ?? Math.cos(angle) * dist,
          y: found?.y ?? Math.sin(angle) * dist,
          vx: found?.vx ?? 0,
          vy: found?.vy ?? 0,
          width,
          height,
          color
        }
      })
    })

    simAlphaRef.current = 1.0
  }, [filteredNotes, filteredEdges, folderColorMap])

  // Signal Packets Initialization
  useEffect(() => {
    if (!settings.enablePulses) {
      particlesRef.current = []
      return
    }

    const newParticles: Particle[] = []
    filteredEdges.forEach(edge => {
      newParticles.push({
        sourceId: edge.source,
        targetId: edge.target,
        progress: Math.random(),
        speed: 0.002 + Math.random() * 0.004,
        color: '#ffffff'
      })
    })
    particlesRef.current = newParticles
  }, [filteredEdges, settings.enablePulses])

  // Synchronize Canvas Size with DPI & Container
  const updateCanvasSize = useCallback(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const rect = container.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1

    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    canvas.style.width = `${rect.width}px`
    canvas.style.height = `${rect.height}px`
  }, [])

  useEffect(() => {
    updateCanvasSize()
    window.addEventListener('resize', updateCanvasSize)
    const observer = new ResizeObserver(updateCanvasSize)
    if (containerRef.current) observer.observe(containerRef.current)

    return () => {
      window.removeEventListener('resize', updateCanvasSize)
      observer.disconnect()
    }
  }, [updateCanvasSize])

  // Main Render & Simulation Loop
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let lastTime = performance.now()

    const render = (currentTime: number) => {
      const dt = Math.min(32, currentTime - lastTime) / 16.66
      lastTime = currentTime

      const width = canvas.clientWidth
      const height = canvas.clientHeight
      const dpr = window.devicePixelRatio || 1

      // Advance radar sweep
      radarAngleRef.current = (radarAngleRef.current + 0.015 * settings.radarSpeed) % (Math.PI * 2)

      // 1. Physics Step
      if (simAlphaRef.current > 0.002 || draggedNodeRef.current) {
        const alpha = simAlphaRef.current
        const nodeMap = new Map(nodes.map(n => [n.id, n]))

        if (layoutMode === 'radar' && currentNoteId) {
          // RADAR MODE: Concentric Orbits
          const centerNode = nodeMap.get(currentNoteId)
          if (centerNode) {
            centerNode.x += (0 - centerNode.x) * 0.1
            centerNode.y += (0 - centerNode.y) * 0.1

            const directNeighbors = new Set<string>()
            for (const e of edges) {
              if (e.source === currentNoteId) directNeighbors.add(e.target)
              if (e.target === currentNoteId) directNeighbors.add(e.source)
            }

            const orbit1 = Array.from(directNeighbors).map(id => nodeMap.get(id)).filter(Boolean) as SimNode[]
            orbit1.forEach((n, idx) => {
              const angle = (idx / Math.max(1, orbit1.length)) * Math.PI * 2
              const targetX = Math.cos(angle) * 190
              const targetY = Math.sin(angle) * 190
              if (draggedNodeRef.current?.id !== n.id) {
                n.x += (targetX - n.x) * 0.06
                n.y += (targetY - n.y) * 0.06
              }
            })

            const outer = nodes.filter(n => n.id !== currentNoteId && !directNeighbors.has(n.id))
            outer.forEach((n, idx) => {
              const angle = (idx / Math.max(1, outer.length)) * Math.PI * 2
              const targetX = Math.cos(angle) * 360
              const targetY = Math.sin(angle) * 360
              if (draggedNodeRef.current?.id !== n.id) {
                n.x += (targetX - n.x) * 0.05
                n.y += (targetY - n.y) * 0.05
              }
            })
          }
        } else {
          // FORCE SIMULATION (Atlas & Circuit Modes)
          const repulsion = settings.repulsion * alpha
          const springLength = settings.linkDistance
          const springStrength = 0.045 * alpha
          const centerPull = settings.centerGravity * alpha
          const damping = 0.86

          // Folder Centroids for cohesive island grouping
          const folderCentroids = new Map<string, { x: number; y: number; count: number }>()
          for (const n of nodes) {
            const cur = folderCentroids.get(n.folder) || { x: 0, y: 0, count: 0 }
            cur.x += n.x
            cur.y += n.y
            cur.count++
            folderCentroids.set(n.folder, cur)
          }
          folderCentroids.forEach(val => {
            val.x /= val.count
            val.y /= val.count
          })

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

          // Spring tension along links
          for (const edge of edges) {
            const s = nodeMap.get(edge.source)
            const t = nodeMap.get(edge.target)
            if (s && t) {
              const dx = t.x - s.x
              const dy = t.y - s.y
              const dist = Math.sqrt(dx * dx + dy * dy) || 1
              const delta = dist - springLength
              const fx = (dx / dist) * delta * springStrength
              const fy = (dy / dist) * delta * springStrength

              if (draggedNodeRef.current?.id !== s.id) {
                s.vx += fx
                s.vy += fy
              }
              if (draggedNodeRef.current?.id !== t.id) {
                t.vx -= fx
                t.vy -= fy
              }
            }
          }

          // Apply gravitation and velocities
          for (const n of nodes) {
            if (draggedNodeRef.current?.id !== n.id) {
              // Island cohesion (attraction to folder centroid)
              const fc = folderCentroids.get(n.folder)
              if (fc && fc.count > 1) {
                n.vx += (fc.x - n.x) * settings.clusterStrength * alpha
                n.vy += (fc.y - n.y) * settings.clusterStrength * alpha
              }

              // Centering pull
              n.vx -= n.x * centerPull
              n.vy -= n.y * centerPull

              n.vx *= damping
              n.vy *= damping
              n.x += n.vx * dt
              n.y += n.vy * dt
            }
          }
        }

        if (!draggedNodeRef.current) {
          simAlphaRef.current *= 0.985
        }
      }

      // 2. Clear Screen & Draw Luxury Matte Background
      ctx.save()
      ctx.scale(dpr, dpr)
      ctx.clearRect(0, 0, width, height)

      // Matte Slate Blueprint Background (NO GLOSS)
      ctx.fillStyle = '#0a0b10'
      ctx.fillRect(0, 0, width, height)

      // Background Architectural Coordinate Matrix
      const transform = transformRef.current
      ctx.save()
      const gridSize = 40 * transform.scale
      if (gridSize > 18) {
        const offsetX = (width / 2 + transform.x) % gridSize
        const offsetY = (height / 2 + transform.y) % gridSize

        ctx.strokeStyle = layoutMode === 'circuit' ? 'rgba(56, 189, 248, 0.05)' : 'rgba(255, 255, 255, 0.03)'
        ctx.lineWidth = 1

        // Grid lines in circuit mode or subtle crosshairs in atlas
        if (layoutMode === 'circuit') {
          ctx.beginPath()
          for (let x = offsetX; x < width; x += gridSize) {
            ctx.moveTo(x, 0)
            ctx.lineTo(x, height)
          }
          for (let y = offsetY; y < height; y += gridSize) {
            ctx.moveTo(0, y)
            ctx.lineTo(width, y)
          }
          ctx.stroke()
        } else {
          // Minimal precision crosshairs
          ctx.fillStyle = 'rgba(255, 255, 255, 0.08)'
          for (let x = offsetX; x < width; x += gridSize) {
            for (let y = offsetY; y < height; y += gridSize) {
              ctx.fillRect(x - 2, y, 5, 1)
              ctx.fillRect(x, y - 2, 1, 5)
            }
          }
        }
      }
      ctx.restore()

      // Camera Matrix
      ctx.save()
      ctx.translate(width / 2 + transform.x, height / 2 + transform.y)
      ctx.scale(transform.scale, transform.scale)

      const nodeMap = new Map(nodes.map(n => [n.id, n]))

      // Active / Neighbor sets
      const activeNeighborIds = new Set<string>()
      if (hoveredNodeId) {
        activeNeighborIds.add(hoveredNodeId)
        for (const e of edges) {
          if (e.source === hoveredNodeId) activeNeighborIds.add(e.target)
          if (e.target === hoveredNodeId) activeNeighborIds.add(e.source)
        }
      } else if (currentNoteId) {
        activeNeighborIds.add(currentNoteId)
        for (const e of edges) {
          if (e.source === currentNoteId) activeNeighborIds.add(e.target)
          if (e.target === currentNoteId) activeNeighborIds.add(e.source)
        }
      }

      // 3. RADAR MODE: Range Rings & Sweep Beam
      if (layoutMode === 'radar') {
        const rings = [100, 190, 280, 360, 480]
        ctx.save()

        // Concentric Range Rings
        rings.forEach((r, idx) => {
          ctx.beginPath()
          ctx.arc(0, 0, r, 0, Math.PI * 2)
          ctx.strokeStyle = idx === 1 ? 'rgba(197, 155, 39, 0.25)' : 'rgba(255, 255, 255, 0.05)'
          ctx.lineWidth = 1
          ctx.setLineDash([3, 6])
          ctx.stroke()

          // Ring range label
          ctx.fillStyle = 'rgba(255, 255, 255, 0.25)'
          ctx.font = '9px "JetBrains Mono", monospace'
          ctx.textAlign = 'right'
          ctx.fillText(`RNG 0${idx + 1} // ${r}PX`, -10, -r + 4)
        })
        ctx.setLineDash([])

        // Radial cross lines
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)'
        for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
          ctx.beginPath()
          ctx.moveTo(0, 0)
          ctx.lineTo(Math.cos(a) * 500, Math.sin(a) * 500)
          ctx.stroke()
        }

        // Animated Radar Sweep Sector
        const sweepAngle = radarAngleRef.current
        const sweepGrad = ctx.createRadialGradient(0, 0, 10, 0, 0, 480)
        sweepGrad.addColorStop(0, 'rgba(197, 155, 39, 0.15)')
        sweepGrad.addColorStop(1, 'rgba(197, 155, 39, 0)')

        ctx.beginPath()
        ctx.moveTo(0, 0)
        ctx.arc(0, 0, 480, sweepAngle - 0.35, sweepAngle)
        ctx.closePath()
        ctx.fillStyle = sweepGrad
        ctx.fill()

        ctx.restore()
      }

      // 4. ATLAS MODE: Territory Islands (Convex Hull Continents)
      if (layoutMode === 'atlas' && settings.enableTerritories) {
        // Group nodes by folder
        const folderGroups = new Map<string, SimNode[]>()
        for (const n of nodes) {
          const list = folderGroups.get(n.folder) || []
          list.push(n)
          folderGroups.set(n.folder, list)
        }

        folderGroups.forEach((groupNodes, folderName) => {
          if (groupNodes.length === 0) return
          const color = folderColorMap.get(folderName) || '#c59b27'
          const isFolderFocused = hoveredFolder ? hoveredFolder === folderName : true
          const alphaMultiplier = isFolderFocused ? 1.0 : 0.25

          ctx.save()
          ctx.globalAlpha = alphaMultiplier

          if (groupNodes.length === 1) {
            // Single node territory: rounded pill perimeter
            const n = groupNodes[0]
            const padX = n.width / 2 + 30
            const padY = n.height / 2 + 25

            ctx.beginPath()
            ctx.roundRect(n.x - padX, n.y - padY, padX * 2, padY * 2, 16)
            ctx.fillStyle = color + '08' // 3% opacity fill
            ctx.fill()
            ctx.strokeStyle = color + '30' // 19% opacity border
            ctx.lineWidth = 1
            ctx.setLineDash([4, 4])
            ctx.stroke()

            // Territory label
            ctx.fillStyle = color
            ctx.font = '600 9px "JetBrains Mono", monospace'
            ctx.textAlign = 'left'
            ctx.fillText(`+ TERRITÓRIO // ${folderName.toUpperCase()}`, n.x - padX + 10, n.y - padY - 8)
          } else {
            // Multi-node territory: smooth expanded convex hull
            const points = groupNodes.map(n => ({ x: n.x, y: n.y }))
            const hull = getConvexHull(points)

            // Centroid
            const cx = hull.reduce((acc, p) => acc + p.x, 0) / hull.length
            const cy = hull.reduce((acc, p) => acc + p.y, 0) / hull.length

            // Expand vertices outward from centroid
            const pad = 42
            const expanded = hull.map(p => {
              const dx = p.x - cx
              const dy = p.y - cy
              const len = Math.hypot(dx, dy) || 1
              return {
                x: p.x + (dx / len) * pad,
                y: p.y + (dy / len) * pad
              }
            })

            // Draw smooth closed polygon
            ctx.beginPath()
            ctx.moveTo(expanded[0].x, expanded[0].y)
            for (let i = 0; i < expanded.length; i++) {
              const cur = expanded[i]
              const next = expanded[(i + 1) % expanded.length]
              const midX = (cur.x + next.x) / 2
              const midY = (cur.y + next.y) / 2
              ctx.quadraticCurveTo(cur.x, cur.y, midX, midY)
            }
            ctx.closePath()

            // Subtle topographic tinted terrain fill
            ctx.fillStyle = color + '08'
            ctx.fill()

            // Outer dashed contour
            ctx.strokeStyle = color + '35'
            ctx.lineWidth = 1
            ctx.setLineDash([4, 4])
            ctx.stroke()

            // Inner subtle contour line
            ctx.beginPath()
            const innerPad = 14
            const innerExpanded = hull.map(p => {
              const dx = p.x - cx
              const dy = p.y - cy
              const len = Math.hypot(dx, dy) || 1
              return {
                x: p.x + (dx / len) * (pad - innerPad),
                y: p.y + (dy / len) * (pad - innerPad)
              }
            })
            ctx.moveTo(innerExpanded[0].x, innerExpanded[0].y)
            for (let i = 0; i < innerExpanded.length; i++) {
              const cur = innerExpanded[i]
              const next = innerExpanded[(i + 1) % innerExpanded.length]
              ctx.quadraticCurveTo(cur.x, cur.y, (cur.x + next.x) / 2, (cur.y + next.y) / 2)
            }
            ctx.closePath()
            ctx.strokeStyle = color + '15'
            ctx.stroke()
            ctx.setLineDash([])

            // Territory Header Tag
            const minX = Math.min(...expanded.map(p => p.x))
            const minY = Math.min(...expanded.map(p => p.y))

            ctx.fillStyle = color
            ctx.font = '700 9px "JetBrains Mono", monospace'
            ctx.textAlign = 'left'
            ctx.fillText(`✛ SETOR // ${folderName.toUpperCase()} [${groupNodes.length}]`, minX + 12, minY - 8)
          }

          ctx.restore()
        })
      }

      // 5. Render Connection Links (Vector Filaments & Circuit Traces)
      for (const edge of edges) {
        const s = nodeMap.get(edge.source)
        const t = nodeMap.get(edge.target)
        if (!s || !t) continue

        const isHighlighted = hoveredNodeId
          ? (edge.source === hoveredNodeId || edge.target === hoveredNodeId)
          : (currentNoteId && (edge.source === currentNoteId || edge.target === currentNoteId))

        const isDimmed = hoveredNodeId
          ? !isHighlighted
          : (hoveredFolder && (s.folder !== hoveredFolder && t.folder !== hoveredFolder))

        const isInterFolder = s.folder !== t.folder

        ctx.save()
        if (isDimmed) {
          ctx.globalAlpha = 0.12
        }

        ctx.beginPath()

        if (layoutMode === 'circuit') {
          // CIRCUIT BLUEPRINT: Orthogonal stepped trace
          const midX = (s.x + t.x) / 2
          ctx.moveTo(s.x, s.y)
          ctx.lineTo(midX, s.y)
          ctx.lineTo(midX, t.y)
          ctx.lineTo(t.x, t.y)

          ctx.strokeStyle = isHighlighted
            ? '#38bdf8'
            : isInterFolder
            ? 'rgba(255, 255, 255, 0.2)'
            : 'rgba(56, 189, 248, 0.14)'
          ctx.lineWidth = isHighlighted ? 1.8 : 1.0
          ctx.stroke()

          // Circuit junction dot at corner
          if (isHighlighted) {
            ctx.beginPath()
            ctx.arc(midX, s.y, 2.5, 0, Math.PI * 2)
            ctx.arc(midX, t.y, 2.5, 0, Math.PI * 2)
            ctx.fillStyle = '#38bdf8'
            ctx.fill()
          }
        } else {
          // VECTOR FILAMENT: Direct laser link
          ctx.moveTo(s.x, s.y)
          ctx.lineTo(t.x, t.y)

          if (isHighlighted) {
            const linkGrad = ctx.createLinearGradient(s.x, s.y, t.x, t.y)
            linkGrad.addColorStop(0, s.color)
            linkGrad.addColorStop(1, t.color)
            ctx.strokeStyle = linkGrad
            ctx.lineWidth = 1.8
          } else if (isInterFolder) {
            // Inter-island bridge: crisp dotted link
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)'
            ctx.lineWidth = 1.0
            ctx.setLineDash([3, 4])
          } else {
            // Intra-island link: subtle solid hairline
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)'
            ctx.lineWidth = 0.8
          }
          ctx.stroke()
          ctx.setLineDash([])
        }

        ctx.restore()
      }

      // 6. Signal Packets (Data Flow along Links)
      if (settings.enablePulses && particlesRef.current.length > 0) {
        for (const p of particlesRef.current) {
          const s = nodeMap.get(p.sourceId)
          const t = nodeMap.get(p.targetId)
          if (!s || !t) continue

          p.progress += p.speed
          if (p.progress > 1) p.progress = 0

          let px = s.x + (t.x - s.x) * p.progress
          let py = s.y + (t.y - s.y) * p.progress

          if (layoutMode === 'circuit') {
            const midX = (s.x + t.x) / 2
            if (p.progress < 0.33) {
              const localProg = p.progress / 0.33
              px = s.x + (midX - s.x) * localProg
              py = s.y
            } else if (p.progress < 0.66) {
              const localProg = (p.progress - 0.33) / 0.33
              px = midX
              py = s.y + (t.y - s.y) * localProg
            } else {
              const localProg = (p.progress - 0.66) / 0.34
              px = midX + (t.x - midX) * localProg
              py = t.y
            }
          }

          const isNearActive = activeNeighborIds.has(p.sourceId) || activeNeighborIds.has(p.targetId)

          ctx.beginPath()
          ctx.arc(px, py, isNearActive ? 2.2 : 1.2, 0, Math.PI * 2)
          ctx.fillStyle = isNearActive ? s.color : 'rgba(255, 255, 255, 0.55)'
          ctx.fill()
        }
      }

      // 7. Render Nodes (ARCHITECTURAL MATTE CAPSULES - NO PLASTIC SHINE!)
      const isZoomedFar = transform.scale < 0.65

      for (const node of nodes) {
        const isCurrent = node.id === currentNoteId
        const isHovered = node.id === hoveredNodeId
        const isConnected = activeNeighborIds.has(node.id)
        const isFolderMatch = hoveredFolder ? node.folder === hoveredFolder : true
        const isSearchMatch = searchQuery
          ? node.title.toLowerCase().includes(searchQuery.toLowerCase())
          : false

        let alpha = 1.0
        if (searchQuery) {
          alpha = isSearchMatch ? 1.0 : 0.12
        } else if (hoveredFolder) {
          alpha = isFolderMatch ? 1.0 : 0.15
        } else if (hoveredNodeId) {
          alpha = (isHovered || isConnected) ? 1.0 : 0.18
        }

        ctx.save()
        ctx.globalAlpha = alpha

        // Determine if node displays as full architectural capsule or collapsed micro-chip
        const showFullCapsule = !isZoomedFar || isCurrent || isHovered || isConnected || isSearchMatch

        if (showFullCapsule) {
          // --- FULL ARCHITECTURAL CAPSULE ---
          const w = node.width
          const h = node.height
          const x = node.x - w / 2
          const y = node.y - h / 2
          const cornerR = 7

          // Active CAD Viewfinder Frame `[ · ]`
          if (isCurrent) {
            const pad = 5
            ctx.strokeStyle = node.color
            ctx.lineWidth = 1.2
            ctx.beginPath()
            // Top-left bracket
            ctx.moveTo(x - pad, y - pad + 6)
            ctx.lineTo(x - pad, y - pad)
            ctx.lineTo(x - pad + 6, y - pad)
            // Top-right bracket
            ctx.moveTo(x + w + pad - 6, y - pad)
            ctx.lineTo(x + w + pad, y - pad)
            ctx.lineTo(x + w + pad, y - pad + 6)
            // Bottom-left bracket
            ctx.moveTo(x - pad, y + h + pad - 6)
            ctx.lineTo(x - pad, y + h + pad)
            ctx.lineTo(x - pad + 6, y + h + pad)
            // Bottom-right bracket
            ctx.moveTo(x + w + pad - 6, y + h + pad)
            ctx.lineTo(x + w + pad, y + h + pad)
            ctx.lineTo(x + w + pad, y + h + pad - 6)
            ctx.stroke()
          }

          // Search Beacon Ping
          if (isSearchMatch) {
            ctx.strokeStyle = '#f59e0b'
            ctx.lineWidth = 1.2
            ctx.setLineDash([3, 3])
            ctx.strokeRect(x - 4, y - 4, w + 8, h + 8)
            ctx.setLineDash([])
          }

          // Matte Capsule Background (Deep slate, flat, zero gloss)
          ctx.beginPath()
          ctx.roundRect(x, y, w, h, cornerR)
          ctx.fillStyle = isCurrent
            ? '#161822'
            : isHovered
            ? '#1a1c2a'
            : '#111219'
          ctx.fill()

          // Hairline Matte Border
          ctx.strokeStyle = isCurrent
            ? node.color
            : isHovered
            ? '#ffffff'
            : 'rgba(255, 255, 255, 0.12)'
          ctx.lineWidth = isCurrent || isHovered ? 1.5 : 1.0
          ctx.stroke()

          // Left Indicator Dot (Flat solid folder color)
          ctx.beginPath()
          ctx.arc(x + 12, node.y, 4, 0, Math.PI * 2)
          ctx.fillStyle = node.color
          ctx.fill()

          // Title Typography (Clean, high-legibility Inter/system)
          ctx.font = '600 11px "Inter", system-ui, sans-serif'
          ctx.textAlign = 'left'
          ctx.textBaseline = 'middle'
          ctx.fillStyle = isCurrent || isHovered ? '#ffffff' : '#e2e8f0'

          // Truncated title if needed
          ctx.fillText(node.title, x + 22, node.y, w - 46)

          // Right Connection Counter Badge (e.g. "· 3")
          if (node.connections > 0) {
            ctx.font = '500 9px "JetBrains Mono", monospace'
            ctx.textAlign = 'right'
            ctx.fillStyle = isCurrent || isHovered ? node.color : 'rgba(255, 255, 255, 0.4)'
            ctx.fillText(`${node.connections}`, x + w - 8, node.y)
          }
        } else {
          // --- COLLAPSED MICRO-CHIP (High zoom-out level of detail) ---
          const size = 11
          ctx.beginPath()
          ctx.roundRect(node.x - size / 2, node.y - size / 2, size, size, 3)
          ctx.fillStyle = '#111219'
          ctx.fill()
          ctx.strokeStyle = node.color
          ctx.lineWidth = 1.2
          ctx.stroke()

          // Inner solid core
          ctx.beginPath()
          ctx.arc(node.x, node.y, 2.5, 0, Math.PI * 2)
          ctx.fillStyle = node.color
          ctx.fill()
        }

        ctx.restore()
      }

      ctx.restore()
      ctx.restore()

      animationFrameRef.current = requestAnimationFrame(render)
    }

    animationFrameRef.current = requestAnimationFrame(render)
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current)
    }
  }, [
    nodes,
    edges,
    currentNoteId,
    hoveredNodeId,
    hoveredFolder,
    searchQuery,
    settings,
    layoutMode
  ])

  // Precise World Mouse Coordinate Converter
  const getCanvasMouse = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    const transform = transformRef.current

    const clientX = e.clientX - rect.left
    const clientY = e.clientY - rect.top

    const centerX = rect.width / 2
    const centerY = rect.height / 2

    const screenX = clientX - centerX - transform.x
    const screenY = clientY - centerY - transform.y

    return {
      x: screenX / transform.scale,
      y: screenY / transform.scale
    }
  }, [])

  // Precise Node Hit Testing for Rectangular Architectural Capsules
  const getNodeAtCoords = useCallback((worldX: number, worldY: number): SimNode | null => {
    const isZoomedFar = transformRef.current.scale < 0.65

    for (let i = nodes.length - 1; i >= 0; i--) {
      const node = nodes[i]
      const showFullCapsule = !isZoomedFar || node.id === currentNoteId || node.id === hoveredNodeId

      if (showFullCapsule) {
        // Hit test rectangle with generous 8px margin
        const halfW = node.width / 2 + 8
        const halfH = node.height / 2 + 8
        if (
          worldX >= node.x - halfW &&
          worldX <= node.x + halfW &&
          worldY >= node.y - halfH &&
          worldY <= node.y + halfH
        ) {
          return node
        }
      } else {
        // Hit test micro-chip circle (generous 16px radius)
        const dx = worldX - node.x
        const dy = worldY - node.y
        if (dx * dx + dy * dy <= 16 * 16) {
          return node
        }
      }
    }
    return null
  }, [nodes, currentNoteId, hoveredNodeId])

  // Mouse / Pointer Event Handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const mouse = getCanvasMouse(e)
    pointerDownRef.current = { x: e.clientX, y: e.clientY, time: Date.now() }

    const hit = getNodeAtCoords(mouse.x, mouse.y)
    if (hit) {
      draggedNodeRef.current = hit
      simAlphaRef.current = 0.5
    } else {
      isDraggingCanvasRef.current = true
    }
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const mouse = getCanvasMouse(e)

    if (draggedNodeRef.current) {
      draggedNodeRef.current.x = mouse.x
      draggedNodeRef.current.y = mouse.y
      draggedNodeRef.current.vx = 0
      draggedNodeRef.current.vy = 0
      simAlphaRef.current = 0.5
      return
    }

    if (isDraggingCanvasRef.current && pointerDownRef.current) {
      const dx = e.clientX - pointerDownRef.current.x
      const dy = e.clientY - pointerDownRef.current.y
      transformRef.current.x += dx
      transformRef.current.y += dy
      pointerDownRef.current = { x: e.clientX, y: e.clientY, time: pointerDownRef.current.time }
      return
    }

    // Hover detection & cursor styling
    const hit = getNodeAtCoords(mouse.x, mouse.y)
    if (hit) {
      setHoveredNodeId(hit.id)
      canvas.style.cursor = 'pointer'
    } else {
      setHoveredNodeId(null)
      canvas.style.cursor = isDraggingCanvasRef.current ? 'grabbing' : 'grab'
    }
  }

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    // Click detection (clean click if distance < 6px and time < 450ms)
    if (pointerDownRef.current) {
      const dist = Math.hypot(e.clientX - pointerDownRef.current.x, e.clientY - pointerDownRef.current.y)
      const elapsed = Date.now() - pointerDownRef.current.time

      if (dist < 6 && elapsed < 450) {
        const mouse = getCanvasMouse(e)
        const hit = getNodeAtCoords(mouse.x, mouse.y)
        if (hit) {
          onSelectNote(hit.id)
        }
      }
    }

    draggedNodeRef.current = null
    isDraggingCanvasRef.current = false
    pointerDownRef.current = null
  }

  // Smooth Zoom Centered on Mouse
  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const mouseScreenX = e.clientX - rect.left - rect.width / 2
    const mouseScreenY = e.clientY - rect.top - rect.height / 2

    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87
    const currentScale = transformRef.current.scale
    const newScale = Math.min(3.5, Math.max(0.2, currentScale * zoomFactor))

    transformRef.current.x -= (mouseScreenX - transformRef.current.x) * (newScale / currentScale - 1)
    transformRef.current.y -= (mouseScreenY - transformRef.current.y) * (newScale / currentScale - 1)
    transformRef.current.scale = newScale
  }

  const handleResetCamera = () => {
    transformRef.current = { x: 0, y: 0, scale: 0.85 }
    simAlphaRef.current = 1.0
  }

  const handleFocusActiveNote = () => {
    if (!currentNoteId) return
    const target = nodes.find(n => n.id === currentNoteId)
    if (target) {
      transformRef.current = {
        x: -target.x * 1.2,
        y: -target.y * 1.2,
        scale: 1.2
      }
    }
  }

  // Focus on a specific territory island
  const handleFocusFolderIsland = (folder: string) => {
    const group = nodes.filter(n => n.folder === folder)
    if (group.length === 0) return
    const cx = group.reduce((acc, n) => acc + n.x, 0) / group.length
    const cy = group.reduce((acc, n) => acc + n.y, 0) / group.length

    transformRef.current = {
      x: -cx * 1.1,
      y: -cy * 1.1,
      scale: 1.1
    }
  }

  // Active hovered node data
  const hoveredNode = useMemo(() => {
    if (!hoveredNodeId) return null
    return nodes.find(n => n.id === hoveredNodeId) || null
  }, [hoveredNodeId, nodes])

  // Connected nodes list for hovered node
  const hoveredConnections = useMemo(() => {
    if (!hoveredNodeId) return []
    const ids: string[] = []
    edges.forEach(e => {
      if (e.source === hoveredNodeId) ids.push(e.target)
      if (e.target === hoveredNodeId) ids.push(e.source)
    })
    return nodes.filter(n => ids.includes(n.id))
  }, [hoveredNodeId, edges, nodes])

  const allFolders = useMemo(() => Array.from(new Set(notes.map(n => n.folder || 'Início'))), [notes])

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-[#0a0b10] overflow-hidden flex flex-col select-none"
    >
      {/* 1. Top HUD Control Bar */}
      <div className="absolute top-4 left-4 z-20 flex items-center gap-2 bg-[#0e0f17]/90 backdrop-blur-xl border border-white/[0.08] rounded-2xl p-1.5 shadow-2xl">
        {/* Search */}
        <div className="relative flex items-center">
          <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filtrar nós..."
            className="w-40 pl-8 pr-7 py-1.5 bg-[#141622] border border-zinc-800 rounded-xl text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-[var(--accent)] font-mono transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 text-zinc-500 hover:text-zinc-300 cursor-pointer"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* 3 Innovative Format Modes */}
        <div className="flex items-center bg-[#141622] border border-zinc-800 rounded-xl p-0.5 text-xs">
          <button
            onClick={() => {
              setLayoutMode('atlas')
              simAlphaRef.current = 1.0
            }}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-medium transition-all cursor-pointer ${
              layoutMode === 'atlas'
                ? 'bg-[var(--accent)] text-zinc-950 font-bold shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
            title="Atlas Topográfico: Continentes & Ilhas Territoriais"
          >
            <MapIcon className="w-3.5 h-3.5" />
            <span>Atlas</span>
          </button>

          <button
            onClick={() => {
              setLayoutMode('circuit')
              simAlphaRef.current = 1.0
            }}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-medium transition-all cursor-pointer ${
              layoutMode === 'circuit'
                ? 'bg-[var(--accent)] text-zinc-950 font-bold shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
            title="Circuito Neural: Blueprint com trilhas de dados ortogonais"
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>Circuito</span>
          </button>

          <button
            onClick={() => {
              setLayoutMode('radar')
              simAlphaRef.current = 1.0
            }}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-medium transition-all cursor-pointer ${
              layoutMode === 'radar'
                ? 'bg-[var(--accent)] text-zinc-950 font-bold shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
            title="Radar Ecosfera: Anéis concêntricos de proximidade"
          >
            <Radar className="w-3.5 h-3.5" />
            <span>Radar</span>
          </button>
        </div>

        <div className="h-4 w-px bg-zinc-800" />

        {/* Local vs Global Focus Toggle */}
        <button
          onClick={() => setIsLocalMode(m => !m)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
            isLocalMode
              ? 'bg-[var(--accent)] text-zinc-950 shadow-md'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
          }`}
          title="Alternar entre Universo Completo e Grafo Local focado na nota ativa"
        >
          <Focus className="w-3.5 h-3.5" />
          <span>{isLocalMode ? 'Foco Local' : 'Global'}</span>
        </button>

        {/* Settings Toggle */}
        <button
          onClick={() => setShowSettingsDrawer(d => !d)}
          className={`p-1.5 rounded-xl transition-all cursor-pointer ${
            showSettingsDrawer
              ? 'bg-[var(--accent)] text-zinc-950 font-bold'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
          }`}
          title="Ajustes de Topologia e Física"
        >
          <Sliders className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* 2. Top-Right Architectural Inspector HUD Card */}
      {hoveredNode && (
        <div className="absolute top-4 right-4 z-20 w-84 bg-[#0e0f17]/95 backdrop-blur-2xl border border-white/[0.1] rounded-2xl p-4 shadow-2xl space-y-3 text-xs animate-in fade-in zoom-in-95 duration-100 select-none">
          <div className="flex items-start justify-between gap-2 border-b border-zinc-800/80 pb-2.5">
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-[9px] font-mono uppercase tracking-wider text-zinc-400">
                <span
                  className="w-2 h-2 rounded-full inline-block"
                  style={{ backgroundColor: hoveredNode.color }}
                />
                <span>VAULT // {hoveredNode.folder}</span>
              </div>
              <h3 className="text-sm font-bold text-zinc-100 leading-snug">
                {hoveredNode.title}
              </h3>
            </div>
            <button
              onClick={() => onSelectNote(hoveredNode.id)}
              className="p-1.5 rounded-lg bg-[var(--accent)]/15 hover:bg-[var(--accent)] text-[var(--accent)] hover:text-zinc-950 transition-all cursor-pointer shadow-sm"
              title="Abrir nota no editor"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          </div>

          {hoveredNode.excerpt && (
            <p className="text-[11px] text-zinc-400 leading-relaxed font-normal">
              {hoveredNode.excerpt}
            </p>
          )}

          {/* Connected Notes Micro Pills */}
          {hoveredConnections.length > 0 && (
            <div className="space-y-1 pt-1">
              <span className="text-[10px] text-zinc-500 font-mono">
                CONEXÕES DIRETAS ({hoveredConnections.length}):
              </span>
              <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto pt-0.5">
                {hoveredConnections.map(c => (
                  <button
                    key={c.id}
                    onClick={() => onSelectNote(c.id)}
                    className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#161822] hover:bg-zinc-800 border border-zinc-800 text-[10px] text-zinc-300 transition-colors cursor-pointer"
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ backgroundColor: c.color }}
                    />
                    <span className="truncate max-w-[120px]">{c.title}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between pt-1 border-t border-zinc-800/80 text-[10px] text-zinc-400 font-mono">
            <span>COORD: {Math.round(hoveredNode.x)}, {Math.round(hoveredNode.y)}</span>
            <span className="text-[var(--accent)] font-semibold flex items-center gap-1">
              CLIQUE PARA ABRIR <ArrowRight className="w-2.5 h-2.5" />
            </span>
          </div>
        </div>
      )}

      {/* 3. Settings Drawer */}
      {showSettingsDrawer && (
        <div className="absolute top-18 left-4 z-30 w-72 bg-[#0e0f17]/95 backdrop-blur-2xl border border-white/[0.1] rounded-2xl p-4 shadow-2xl space-y-3.5 text-xs text-zinc-300 animate-in fade-in zoom-in-95 duration-150">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
            <span className="font-bold text-zinc-100 flex items-center gap-1.5 font-mono text-[11px]">
              <Sliders className="w-3.5 h-3.5 text-[var(--accent)]" />
              PARÂMETROS TOPOLÓGICOS
            </span>
            <button
              onClick={() => setShowSettingsDrawer(false)}
              className="text-zinc-500 hover:text-zinc-300 cursor-pointer"
            >
              ✕
            </button>
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-[11px] text-zinc-400 font-mono">
              <span>FORÇA DE REPULSÃO</span>
              <span>{settings.repulsion}</span>
            </div>
            <input
              type="range"
              min="1000"
              max="4500"
              step="100"
              value={settings.repulsion}
              onChange={(e) => {
                setSettings(s => ({ ...s, repulsion: Number(e.target.value) }))
                simAlphaRef.current = 0.5
              }}
              className="w-full accent-[var(--accent)] cursor-pointer"
            />
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-[11px] text-zinc-400 font-mono">
              <span>COMPRIMENTO DOS VETORES</span>
              <span>{settings.linkDistance}px</span>
            </div>
            <input
              type="range"
              min="80"
              max="260"
              step="10"
              value={settings.linkDistance}
              onChange={(e) => {
                setSettings(s => ({ ...s, linkDistance: Number(e.target.value) }))
                simAlphaRef.current = 0.5
              }}
              className="w-full accent-[var(--accent)] cursor-pointer"
            />
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-[11px] text-zinc-400 font-mono">
              <span>COESÃO TERRITORIAL (ILHAS)</span>
              <span>{(settings.clusterStrength * 100).toFixed(0)}%</span>
            </div>
            <input
              type="range"
              min="0.01"
              max="0.15"
              step="0.01"
              value={settings.clusterStrength}
              onChange={(e) => {
                setSettings(s => ({ ...s, clusterStrength: Number(e.target.value) }))
                simAlphaRef.current = 0.5
              }}
              className="w-full accent-[var(--accent)] cursor-pointer"
            />
          </div>

          <div className="pt-2 border-t border-zinc-800 space-y-2">
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-[11px]">Placas Territoriais (Atlas)</span>
              <input
                type="checkbox"
                checked={settings.enableTerritories}
                onChange={(e) => setSettings(s => ({ ...s, enableTerritories: e.target.checked }))}
                className="accent-[var(--accent)] rounded cursor-pointer"
              />
            </label>

            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-[11px]">Pulsos de Sinal em Linha</span>
              <input
                type="checkbox"
                checked={settings.enablePulses}
                onChange={(e) => setSettings(s => ({ ...s, enablePulses: e.target.checked }))}
                className="accent-[var(--accent)] rounded cursor-pointer"
              />
            </label>
          </div>
        </div>
      )}

      {/* 4. Bottom Archipelago Continent Navigator */}
      <div className="absolute bottom-5 left-5 z-20 bg-[#0e0f17]/90 backdrop-blur-xl border border-white/[0.08] rounded-2xl px-3.5 py-2 text-xs text-zinc-400 flex items-center gap-3 shadow-2xl">
        <div className="flex items-center gap-1.5 font-bold text-zinc-200 font-mono text-[11px]">
          <Layers className="w-3.5 h-3.5 text-[var(--accent)]" />
          <span>{nodes.length} NÓS</span>
        </div>
        <span className="text-zinc-700">•</span>
        <span className="font-mono text-[11px]">{edges.length} PONTES</span>
        <span className="text-zinc-700">•</span>

        {/* Territory Island Jump Buttons */}
        <div className="flex items-center gap-1.5">
          {allFolders.slice(0, 6).map(folder => {
            const color = folderColorMap.get(folder) || '#c59b27'
            const isHovered = hoveredFolder === folder
            return (
              <button
                key={folder}
                type="button"
                onClick={() => handleFocusFolderIsland(folder)}
                onMouseEnter={() => setHoveredFolder(folder)}
                onMouseLeave={() => setHoveredFolder(null)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-mono transition-all cursor-pointer ${
                  isHovered
                    ? 'bg-white/10 text-zinc-100 scale-105 border border-white/20'
                    : 'bg-[#141622] text-zinc-400 hover:text-zinc-200 border border-zinc-800'
                }`}
                title={`Focar no território: ${folder}`}
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: color }}
                />
                <span className="truncate max-w-[85px]">{folder}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* 5. Floating Precision Zoom HUD */}
      <div className="absolute bottom-5 right-5 z-20 flex flex-col gap-1.5 bg-[#0e0f17]/90 backdrop-blur-xl border border-white/[0.08] rounded-2xl p-1.5 shadow-2xl">
        <button
          onClick={() => {
            transformRef.current.scale = Math.min(3.5, transformRef.current.scale * 1.3)
          }}
          className="p-2 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/70 rounded-xl transition-all cursor-pointer"
          title="Aproximar Zoom (+)"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          onClick={() => {
            transformRef.current.scale = Math.max(0.2, transformRef.current.scale * 0.77)
          }}
          className="p-2 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/70 rounded-xl transition-all cursor-pointer"
          title="Afastar Zoom (-)"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <button
          onClick={handleFocusActiveNote}
          className="p-2 text-zinc-400 hover:text-[var(--accent)] hover:bg-zinc-800/70 rounded-xl transition-all cursor-pointer"
          title="Focar na nota ativa"
        >
          <Focus className="w-4 h-4" />
        </button>
        <button
          onClick={handleResetCamera}
          className="p-2 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/70 rounded-xl transition-all cursor-pointer"
          title="Centralizar Visualização"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>

      {/* 6. Hardware-Accelerated Matte Canvas */}
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
        className="w-full h-full cursor-grab active:cursor-grabbing outline-none"
      />
    </div>
  )
}
