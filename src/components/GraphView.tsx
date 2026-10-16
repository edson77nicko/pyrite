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
  Sparkles,
  Orbit,
  Compass,
  FileText,
  Tag,
  Folder,
  ExternalLink,
  Layers
} from 'lucide-react'

interface GraphViewProps {
  notes: Note[]
  currentNoteId?: string
  onSelectNote: (noteId: string) => void
}

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
  radius: number
  color: string
  glowColor: string
}

interface Particle {
  sourceId: string
  targetId: string
  progress: number // 0 to 1
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

export const GraphView: React.FC<GraphViewProps> = ({
  notes,
  currentNoteId,
  onSelectNote
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  // Simulation state
  const [nodes, setNodes] = useState<SimNode[]>([])
  const [edges, setEdges] = useState<LinkEdge[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)
  const [hoveredFolder, setHoveredFolder] = useState<string | null>(null)
  const [selectedTag, setSelectedTag] = useState<string | null>(null)
  const [isLocalMode, setIsLocalMode] = useState(false)
  const [layoutMode, setLayoutMode] = useState<'constellation' | 'radial'>('constellation')
  const [showSettingsDrawer, setShowSettingsDrawer] = useState(false)

  // Visual & Physics Settings
  const [settings, setSettings] = useState<GraphSettings & {
    enableGlow: boolean
    enableParticles: boolean
    clusterStrength: number
  }>({
    repulsion: 2400,
    linkDistance: 130,
    centerGravity: 0.015,
    nodeSize: 1.1,
    showLabels: false, // Default: CLEAN! No cluttered text everywhere!
    showArrows: false,
    isLocalGraph: false,
    enableGlow: true,
    enableParticles: true,
    clusterStrength: 0.04
  })

  // Camera transform & interaction tracking
  const transformRef = useRef({ x: 0, y: 0, scale: 0.9 })
  const isDraggingCanvasRef = useRef(false)
  const pointerDownRef = useRef<{ x: number; y: number; time: number } | null>(null)
  const draggedNodeRef = useRef<SimNode | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const simAlphaRef = useRef<number>(1.0) // Cooling factor

  // Particle flow along edges
  const particlesRef = useRef<Particle[]>([])

  // Color generator based on folder
  const folderColorMap = useMemo(() => {
    const folders = Array.from(new Set(notes.map(n => n.folder || 'Início'))).sort()
    const map = new Map<string, string>()
    folders.forEach((f, idx) => {
      map.set(f, FOLDER_PALETTE[idx % FOLDER_PALETTE.length])
    })
    return map
  }, [notes])

  // Filter notes and edges (Local vs Global graph)
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

  // Initialize node physics data
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

      return filteredNotes.map((note, index) => {
        const found = existing.get(note.id)
        const connections = degreeMap.get(note.id) || 0
        const angle = (index / total) * Math.PI * 2
        const dist = 160 + Math.random() * 120

        const color = folderColorMap.get(note.folder) || '#c59b27'
        // Base radius: from 6px up to 16px based on connection weight
        const radius = (7 + Math.min(18, connections * 2.8)) * settings.nodeSize

        // Extract excerpt
        const rawText = note.content.replace(/[#*`>~\[\]\(\)-]/g, ' ').replace(/\s+/g, ' ').trim()
        const excerpt = rawText.slice(0, 130) + (rawText.length > 130 ? '...' : '')

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
          radius,
          color,
          glowColor: color + '40'
        }
      })
    })

    simAlphaRef.current = 1.0 // Reset cooling to warm
  }, [filteredNotes, filteredEdges, folderColorMap, settings.nodeSize])

  // Initialize and update particles
  useEffect(() => {
    if (!settings.enableParticles) {
      particlesRef.current = []
      return
    }

    const newParticles: Particle[] = []
    filteredEdges.slice(0, 40).forEach(edge => {
      const count = Math.random() > 0.5 ? 2 : 1
      for (let i = 0; i < count; i++) {
        newParticles.push({
          sourceId: edge.source,
          targetId: edge.target,
          progress: Math.random(),
          speed: 0.003 + Math.random() * 0.004,
          color: '#ffffff'
        })
      }
    })
    particlesRef.current = newParticles
  }, [filteredEdges, settings.enableParticles])

  // Canvas size sync with Device Pixel Ratio
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

  // Simulation & Render Loop
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

      // 1. Physics Step (if simulation is active)
      if (simAlphaRef.current > 0.003 || draggedNodeRef.current) {
        const alpha = simAlphaRef.current
        const nodeMap = new Map(nodes.map(n => [n.id, n]))

        if (layoutMode === 'radial' && currentNoteId) {
          // Radial Orbit Mode
          const centerNode = nodeMap.get(currentNoteId)
          if (centerNode) {
            // Anchor center node
            centerNode.x += (0 - centerNode.x) * 0.1
            centerNode.y += (0 - centerNode.y) * 0.1

            // 1st degree neighbors
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

            // Remaining nodes in outer orbit
            const outer = nodes.filter(n => n.id !== currentNoteId && !directNeighbors.has(n.id))
            outer.forEach((n, idx) => {
              const angle = (idx / Math.max(1, outer.length)) * Math.PI * 2
              const targetX = Math.cos(angle) * 350
              const targetY = Math.sin(angle) * 350
              if (draggedNodeRef.current?.id !== n.id) {
                n.x += (targetX - n.x) * 0.05
                n.y += (targetY - n.y) * 0.05
              }
            })
          }
        } else {
          // Force-Directed Constellation Mode
          const repulsion = settings.repulsion * alpha
          const springLength = settings.linkDistance
          const springStrength = 0.04 * alpha
          const centerPull = settings.centerGravity * alpha
          const damping = 0.86

          // Compute folder clusters centroid
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

          // Coulomb repulsion
          for (let i = 0; i < nodes.length; i++) {
            for (let j = i + 1; j < nodes.length; j++) {
              const n1 = nodes[i]
              const n2 = nodes[j]
              const dx = n2.x - n1.x
              const dy = n2.y - n1.y
              const distSq = dx * dx + dy * dy || 1
              const dist = Math.sqrt(distSq)

              if (dist < 460) {
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

          // Edge attraction
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

          // Folder Cohesive Gravitation & Global Centering
          for (const n of nodes) {
            if (draggedNodeRef.current?.id !== n.id) {
              // Pull toward folder centroid
              const fc = folderCentroids.get(n.folder)
              if (fc && fc.count > 1) {
                n.vx += (fc.x - n.x) * settings.clusterStrength * alpha
                n.vy += (fc.y - n.y) * settings.clusterStrength * alpha
              }

              // Center gravity
              n.vx -= n.x * centerPull
              n.vy -= n.y * centerPull

              // Apply velocity
              n.vx *= damping
              n.vy *= damping
              n.x += n.vx * dt
              n.y += n.vy * dt
            }
          }
        }

        // Cool simulation gradually
        if (!draggedNodeRef.current) {
          simAlphaRef.current *= 0.985
        }
      }

      // 2. Clear Screen & Draw Deep Cosmic Canvas
      ctx.save()
      ctx.scale(dpr, dpr)
      ctx.clearRect(0, 0, width, height)

      // Celestial background
      ctx.fillStyle = '#07080b'
      ctx.fillRect(0, 0, width, height)

      // Center Ambient Nebula Glow
      const centerGrad = ctx.createRadialGradient(
        width / 2, height / 2, 20,
        width / 2, height / 2, Math.max(width, height) * 0.65
      )
      centerGrad.addColorStop(0, 'rgba(197, 155, 39, 0.05)') // Soft Pyrita Gold aura
      centerGrad.addColorStop(0.4, 'rgba(99, 102, 241, 0.025)') // Subtle cosmic indigo
      centerGrad.addColorStop(1, 'rgba(7, 8, 11, 0)')
      ctx.fillStyle = centerGrad
      ctx.fillRect(0, 0, width, height)

      // Starlight Grid / Micro-particles (moving with pan)
      const transform = transformRef.current
      ctx.save()
      const gridSize = 45 * transform.scale
      if (gridSize > 18) {
        const offsetX = (width / 2 + transform.x) % gridSize
        const offsetY = (height / 2 + transform.y) % gridSize
        ctx.fillStyle = 'rgba(255, 255, 255, 0.04)'
        for (let x = offsetX; x < width; x += gridSize) {
          for (let y = offsetY; y < height; y += gridSize) {
            ctx.beginPath()
            ctx.arc(x, y, 0.8, 0, Math.PI * 2)
            ctx.fill()
          }
        }
      }
      ctx.restore()

      // Camera Matrix
      ctx.save()
      ctx.translate(width / 2 + transform.x, height / 2 + transform.y)
      ctx.scale(transform.scale, transform.scale)

      const nodeMap = new Map(nodes.map(n => [n.id, n]))

      // Active & Hovered Neighborhood Sets
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

      // 3. Render Edges (Luminous Filaments)
      for (const edge of edges) {
        const s = nodeMap.get(edge.source)
        const t = nodeMap.get(edge.target)
        if (!s || !t) continue

        const isHighlighted = hoveredNodeId
          ? (edge.source === hoveredNodeId || edge.target === hoveredNodeId)
          : (currentNoteId && (edge.source === currentNoteId || edge.target === currentNoteId))

        const isDimmed = (hoveredNodeId && !isHighlighted) || (hoveredFolder && (s.folder !== hoveredFolder && t.folder !== hoveredFolder))

        ctx.beginPath()
        ctx.moveTo(s.x, s.y)
        ctx.lineTo(t.x, t.y)

        if (isHighlighted) {
          // Dynamic gradient between source and target node colors
          const edgeGrad = ctx.createLinearGradient(s.x, s.y, t.x, t.y)
          edgeGrad.addColorStop(0, s.color)
          edgeGrad.addColorStop(1, t.color)
          ctx.strokeStyle = edgeGrad
          ctx.lineWidth = 2.2
          ctx.globalAlpha = 0.95
          if (settings.enableGlow) {
            ctx.shadowColor = s.color
            ctx.shadowBlur = 8
          }
        } else if (isDimmed) {
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)'
          ctx.lineWidth = 0.8
          ctx.globalAlpha = 0.15
          ctx.shadowBlur = 0
        } else {
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)'
          ctx.lineWidth = 1.0
          ctx.globalAlpha = 0.5
          ctx.shadowBlur = 0
        }

        ctx.stroke()
        ctx.shadowBlur = 0
        ctx.globalAlpha = 1.0
      }

      // 4. Render Edge Particles (Information Flow)
      if (settings.enableParticles && particlesRef.current.length > 0) {
        for (const p of particlesRef.current) {
          const s = nodeMap.get(p.sourceId)
          const t = nodeMap.get(p.targetId)
          if (!s || !t) continue

          p.progress += p.speed
          if (p.progress > 1) p.progress = 0

          const px = s.x + (t.x - s.x) * p.progress
          const py = s.y + (t.y - s.y) * p.progress

          const isNearActive = activeNeighborIds.has(p.sourceId) || activeNeighborIds.has(p.targetId)
          ctx.beginPath()
          ctx.arc(px, py, isNearActive ? 2.0 : 1.2, 0, Math.PI * 2)
          ctx.fillStyle = isNearActive ? s.color : 'rgba(255, 255, 255, 0.6)'
          ctx.fill()
        }
      }

      // 5. Render Nodes (Luminous Celestial Orbs)
      const nowSec = currentTime * 0.002

      for (const node of nodes) {
        const isCurrent = node.id === currentNoteId
        const isHovered = node.id === hoveredNodeId
        const isConnected = activeNeighborIds.has(node.id)
        const isFolderMatch = hoveredFolder ? node.folder === hoveredFolder : true
        const isSearchMatch = searchQuery
          ? node.title.toLowerCase().includes(searchQuery.toLowerCase())
          : false
        const isTagMatch = selectedTag ? node.tags.includes(selectedTag) : true

        // Filter / Dimming calculation
        let alpha = 1.0
        if (searchQuery) {
          alpha = isSearchMatch ? 1.0 : 0.12
        } else if (hoveredFolder) {
          alpha = isFolderMatch ? 1.0 : 0.15
        } else if (hoveredNodeId) {
          alpha = (isHovered || isConnected) ? 1.0 : 0.18
        } else if (selectedTag) {
          alpha = isTagMatch ? 1.0 : 0.15
        }

        ctx.save()
        ctx.globalAlpha = alpha

        const r = node.radius

        // Search Match Beacon / Radar Ping
        if (isSearchMatch) {
          const pingRadius = r + 8 + Math.sin(nowSec * 5) * 6
          ctx.beginPath()
          ctx.arc(node.x, node.y, pingRadius, 0, Math.PI * 2)
          ctx.strokeStyle = '#f59e0b'
          ctx.lineWidth = 1.5
          ctx.stroke()
        }

        // Active Note Breathing Orbit Ring
        if (isCurrent) {
          const orbitR = r + 6 + Math.sin(nowSec * 3) * 3
          ctx.beginPath()
          ctx.arc(node.x, node.y, orbitR, 0, Math.PI * 2)
          ctx.strokeStyle = 'rgba(197, 155, 39, 0.7)'
          ctx.lineWidth = 1.8
          ctx.setLineDash([4, 4])
          ctx.stroke()
          ctx.setLineDash([])
        }

        // Hovered Halo Ring
        if (isHovered) {
          ctx.beginPath()
          ctx.arc(node.x, node.y, r + 5, 0, Math.PI * 2)
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)'
          ctx.lineWidth = 2
          ctx.stroke()
        }

        // Layer 1: Atmospheric Outer Glow (if enabled)
        if (settings.enableGlow && (isCurrent || isHovered || isConnected || isSearchMatch)) {
          const glowGrad = ctx.createRadialGradient(
            node.x, node.y, r * 0.5,
            node.x, node.y, r * 2.4
          )
          glowGrad.addColorStop(0, node.color + 'aa')
          glowGrad.addColorStop(1, 'rgba(0,0,0,0)')
          ctx.fillStyle = glowGrad
          ctx.beginPath()
          ctx.arc(node.x, node.y, r * 2.4, 0, Math.PI * 2)
          ctx.fill()
        }

        // Layer 2: 3D Celestial Core Gradient
        const coreGrad = ctx.createRadialGradient(
          node.x - r * 0.35, node.y - r * 0.35, r * 0.1,
          node.x, node.y, r
        )
        coreGrad.addColorStop(0, '#ffffff')
        coreGrad.addColorStop(0.35, node.color)
        coreGrad.addColorStop(1, '#0c0d12')

        ctx.beginPath()
        ctx.arc(node.x, node.y, r, 0, Math.PI * 2)
        ctx.fillStyle = coreGrad
        ctx.fill()

        // Layer 3: High-contrast concentric rim
        ctx.lineWidth = isCurrent || isHovered ? 2.0 : 1.2
        ctx.strokeStyle = isCurrent || isHovered ? '#ffffff' : 'rgba(255, 255, 255, 0.25)'
        ctx.stroke()

        // 6. Intelligent Label System:
        // Clean by default! ONLY render labels for active, hovered, neighbor, or search match!
        const shouldShowLabel =
          settings.showLabels ||
          isCurrent ||
          isHovered ||
          (hoveredNodeId && isConnected) ||
          isSearchMatch

        if (shouldShowLabel) {
          const fontSize = Math.max(10, Math.min(13, 11 + node.connections * 0.3))
          ctx.font = `600 ${fontSize}px "Inter", system-ui, -apple-system, sans-serif`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'

          const text = node.title
          const metrics = ctx.measureText(text)
          const textWidth = metrics.width
          const pillPaddingX = 7
          const pillHeight = fontSize + 8
          const pillY = node.y + r + 5 + pillHeight / 2

          // Background Pill for crisp readability
          ctx.beginPath()
          const radiusRound = 6
          const px = node.x - textWidth / 2 - pillPaddingX
          const py = pillY - pillHeight / 2
          const pw = textWidth + pillPaddingX * 2
          const ph = pillHeight

          // Rounded rect path
          ctx.moveTo(px + radiusRound, py)
          ctx.lineTo(px + pw - radiusRound, py)
          ctx.quadraticCurveTo(px + pw, py, px + pw, py + radiusRound)
          ctx.lineTo(px + pw, py + ph - radiusRound)
          ctx.quadraticCurveTo(px + pw, py + ph, px + pw - radiusRound, py + ph)
          ctx.lineTo(px + radiusRound, py + ph)
          ctx.quadraticCurveTo(px, py + ph, px, py + ph - radiusRound)
          ctx.lineTo(px, py + radiusRound)
          ctx.quadraticCurveTo(px, py, px + radiusRound, py)
          ctx.closePath()

          ctx.fillStyle = isHovered || isCurrent
            ? 'rgba(18, 19, 24, 0.94)'
            : 'rgba(12, 13, 17, 0.85)'
          ctx.fill()

          ctx.strokeStyle = isHovered
            ? '#ffffff'
            : isCurrent
            ? node.color
            : 'rgba(255, 255, 255, 0.12)'
          ctx.lineWidth = 1
          ctx.stroke()

          // Text content
          ctx.fillStyle = isHovered || isCurrent ? '#ffffff' : '#e4e4e7'
          ctx.fillText(text, node.x, pillY)
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
    selectedTag,
    settings,
    layoutMode
  ])

  // Precise Canvas Coordinate Converter
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

  // Find node under mouse
  const getNodeAtCoords = useCallback((worldX: number, worldY: number): SimNode | null => {
    for (let i = nodes.length - 1; i >= 0; i--) {
      const node = nodes[i]
      // Generous hit box (radius + 12px) for effortless clicking!
      const hitRadius = node.radius + 12
      const dx = worldX - node.x
      const dy = worldY - node.y
      if (dx * dx + dy * dy <= hitRadius * hitRadius) {
        return node
      }
    }
    return null
  }, [nodes])

  // Mouse / Pointer Event Handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const mouse = getCanvasMouse(e)
    pointerDownRef.current = { x: e.clientX, y: e.clientY, time: Date.now() }

    const hit = getNodeAtCoords(mouse.x, mouse.y)
    if (hit) {
      draggedNodeRef.current = hit
      simAlphaRef.current = 0.5 // Wake up physics locally
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
    // Unambiguous CLICK detection:
    // If pointer traveled less than 6px and was pressed for less than 400ms, it's a CLICK!
    if (pointerDownRef.current) {
      const dist = Math.hypot(e.clientX - pointerDownRef.current.x, e.clientY - pointerDownRef.current.y)
      const elapsed = Date.now() - pointerDownRef.current.time

      if (dist < 6 && elapsed < 400) {
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

  // Smooth Zoom Toward Mouse Position
  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const mouseScreenX = e.clientX - rect.left - rect.width / 2
    const mouseScreenY = e.clientY - rect.top - rect.height / 2

    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87
    const currentScale = transformRef.current.scale
    const newScale = Math.min(3.5, Math.max(0.15, currentScale * zoomFactor))

    // Keep point under cursor fixed
    transformRef.current.x -= (mouseScreenX - transformRef.current.x) * (newScale / currentScale - 1)
    transformRef.current.y -= (mouseScreenY - transformRef.current.y) * (newScale / currentScale - 1)
    transformRef.current.scale = newScale
  }

  const handleResetCamera = () => {
    transformRef.current = { x: 0, y: 0, scale: 0.9 }
    simAlphaRef.current = 1.0 // Settle nicely
  }

  const handleFocusActiveNote = () => {
    if (!currentNoteId) return
    const target = nodes.find(n => n.id === currentNoteId)
    if (target) {
      transformRef.current = {
        x: -target.x * 1.3,
        y: -target.y * 1.3,
        scale: 1.3
      }
    }
  }

  // Active hovered node object for preview HUD
  const hoveredNode = useMemo(() => {
    if (!hoveredNodeId) return null
    return nodes.find(n => n.id === hoveredNodeId) || null
  }, [hoveredNodeId, nodes])

  // Extract all tags and folders for quick filters
  const allTags = useMemo(() => Array.from(new Set(notes.flatMap(n => n.tags))), [notes])
  const allFolders = useMemo(() => Array.from(new Set(notes.map(n => n.folder || 'Início'))), [notes])

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-[#07080b] overflow-hidden flex flex-col select-none"
    >
      {/* 1. Top Glassmorphic Controls Bar */}
      <div className="absolute top-4 left-4 z-20 flex items-center gap-2 bg-[#0d0e14]/90 backdrop-blur-xl border border-white/[0.08] rounded-2xl p-1.5 shadow-2xl">
        {/* Search Input */}
        <div className="relative flex items-center">
          <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar nó..."
            className="w-44 pl-8 pr-7 py-1.5 bg-[#14151d] border border-zinc-800 rounded-xl text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-[var(--accent)] transition-all"
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

        {/* Layout Mode Pill */}
        <div className="flex items-center bg-[#14151d] border border-zinc-800 rounded-xl p-0.5 text-xs">
          <button
            onClick={() => {
              setLayoutMode('constellation')
              simAlphaRef.current = 1.0
            }}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-medium transition-all cursor-pointer ${
              layoutMode === 'constellation'
                ? 'bg-[var(--accent)] text-zinc-950 font-bold shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
            title="Modo Constelação Orgânica (Force-Directed)"
          >
            <Compass className="w-3 h-3" />
            <span>Constelação</span>
          </button>
          <button
            onClick={() => {
              setLayoutMode('radial')
              simAlphaRef.current = 1.0
            }}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-medium transition-all cursor-pointer ${
              layoutMode === 'radial'
                ? 'bg-[var(--accent)] text-zinc-950 font-bold shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
            title="Modo Órbita Conectada (Em torno da nota ativa)"
          >
            <Orbit className="w-3 h-3" />
            <span>Órbita</span>
          </button>
        </div>

        <div className="h-4 w-px bg-zinc-800" />

        {/* Tag Filter */}
        {allTags.length > 0 && (
          <div className="flex items-center gap-1">
            <select
              value={selectedTag || ''}
              onChange={(e) => setSelectedTag(e.target.value || null)}
              className="bg-[#14151d] text-xs text-zinc-300 rounded-xl px-2.5 py-1.5 border border-zinc-800 focus:outline-none focus:border-[var(--accent)] cursor-pointer"
            >
              <option value="">Todas as tags ({allTags.length})</option>
              {allTags.map(tag => (
                <option key={tag} value={tag}>#{tag}</option>
              ))}
            </select>
          </div>
        )}

        {/* Local vs Global Focus Toggle */}
        <button
          onClick={() => setIsLocalMode(m => !m)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
            isLocalMode
              ? 'bg-[var(--accent)] text-zinc-950 shadow-md'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
          }`}
          title="Alternar entre Universo Completo e Grafo Local focado na nota"
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
          title="Ajustes de Física e Estilo Visual"
        >
          <Sliders className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* 2. Floating Settings Drawer */}
      {showSettingsDrawer && (
        <div className="absolute top-18 left-4 z-30 w-72 bg-[#0e0f16]/95 backdrop-blur-2xl border border-white/[0.09] rounded-2xl p-4 shadow-2xl space-y-3.5 text-xs text-zinc-300 animate-in fade-in zoom-in-95 duration-150">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
            <span className="font-bold text-zinc-100 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-[var(--accent)]" />
              Parâmetros do Universo
            </span>
            <button
              onClick={() => setShowSettingsDrawer(false)}
              className="text-zinc-500 hover:text-zinc-300 cursor-pointer"
            >
              ✕
            </button>
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-[11px] text-zinc-400">
              <span>Repulsão Gravitacional</span>
              <span className="font-mono text-zinc-200">{settings.repulsion}</span>
            </div>
            <input
              type="range"
              min="800"
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
            <div className="flex justify-between text-[11px] text-zinc-400">
              <span>Comprimento dos Filamentos</span>
              <span className="font-mono text-zinc-200">{settings.linkDistance}px</span>
            </div>
            <input
              type="range"
              min="70"
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
            <div className="flex justify-between text-[11px] text-zinc-400">
              <span>Escala dos Orbes</span>
              <span className="font-mono text-zinc-200">{settings.nodeSize.toFixed(1)}x</span>
            </div>
            <input
              type="range"
              min="0.6"
              max="1.8"
              step="0.1"
              value={settings.nodeSize}
              onChange={(e) => setSettings(s => ({ ...s, nodeSize: Number(e.target.value) }))}
              className="w-full accent-[var(--accent)] cursor-pointer"
            />
          </div>

          <div className="pt-2 border-t border-zinc-800 space-y-2">
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-[11px]">Aura Cósmica (Glow)</span>
              <input
                type="checkbox"
                checked={settings.enableGlow}
                onChange={(e) => setSettings(s => ({ ...s, enableGlow: e.target.checked }))}
                className="accent-[var(--accent)] rounded cursor-pointer"
              />
            </label>

            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-[11px]">Partículas em Movimento</span>
              <input
                type="checkbox"
                checked={settings.enableParticles}
                onChange={(e) => setSettings(s => ({ ...s, enableParticles: e.target.checked }))}
                className="accent-[var(--accent)] rounded cursor-pointer"
              />
            </label>

            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-[11px]">Fixar Todos os Rótulos</span>
              <input
                type="checkbox"
                checked={settings.showLabels}
                onChange={(e) => setSettings(s => ({ ...s, showLabels: e.target.checked }))}
                className="accent-[var(--accent)] rounded cursor-pointer"
              />
            </label>
          </div>
        </div>
      )}

      {/* 3. Hover Preview Card (Clean HUD preview instead of permanently noisy labels) */}
      {hoveredNode && (
        <div className="absolute top-4 right-4 z-20 w-80 bg-[#0d0e14]/95 backdrop-blur-2xl border border-white/[0.1] rounded-2xl p-4 shadow-2xl space-y-2.5 text-xs animate-in fade-in zoom-in-95 duration-100 select-none pointer-events-none">
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-1">
              <span
                className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full inline-flex items-center gap-1 border"
                style={{
                  backgroundColor: hoveredNode.color + '15',
                  borderColor: hoveredNode.color + '40',
                  color: hoveredNode.color
                }}
              >
                <Folder className="w-2.5 h-2.5" />
                <span>{hoveredNode.folder}</span>
              </span>
              <h3 className="text-sm font-bold text-zinc-100 leading-snug line-clamp-2">
                {hoveredNode.title}
              </h3>
            </div>
            <div className="w-6 h-6 rounded-lg bg-zinc-800/80 flex items-center justify-center shrink-0 text-zinc-300">
              <FileText className="w-3.5 h-3.5" />
            </div>
          </div>

          {hoveredNode.excerpt && (
            <p className="text-[11px] text-zinc-400 line-clamp-3 leading-relaxed border-t border-zinc-800/60 pt-2 font-normal">
              {hoveredNode.excerpt}
            </p>
          )}

          {hoveredNode.tags && hoveredNode.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-0.5">
              {hoveredNode.tags.slice(0, 4).map(t => (
                <span
                  key={t}
                  className="flex items-center gap-1 text-[10px] text-zinc-400 bg-zinc-800/70 border border-zinc-700/50 rounded-md px-1.5 py-0.5 font-mono"
                >
                  <Tag className="w-2.5 h-2.5 text-zinc-500" />
                  <span>#{t}</span>
                </span>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between pt-1 border-t border-zinc-800/60 text-[10px] text-zinc-400">
            <span className="flex items-center gap-1 font-medium text-zinc-300">
              <Layers className="w-3 h-3 text-[var(--accent)]" />
              {hoveredNode.connections} {hoveredNode.connections === 1 ? 'conexão' : 'conexões'}
            </span>
            <span className="text-[var(--accent)] font-semibold flex items-center gap-0.5">
              Clique para abrir <ExternalLink className="w-2.5 h-2.5" />
            </span>
          </div>
        </div>
      )}

      {/* 4. Bottom Folder Clusters Legend */}
      <div className="absolute bottom-5 left-5 z-20 bg-[#0d0e14]/90 backdrop-blur-xl border border-white/[0.08] rounded-2xl px-3.5 py-2 text-xs text-zinc-400 flex items-center gap-3 shadow-2xl">
        <div className="flex items-center gap-1.5 font-bold text-zinc-200">
          <Sparkles className="w-3.5 h-3.5 text-[var(--accent)]" />
          <span>{nodes.length} nós</span>
        </div>
        <span className="text-zinc-700">•</span>
        <span>{edges.length} conexões</span>
        <span className="text-zinc-700">•</span>

        {/* Interactive Folder Cluster Dots */}
        <div className="flex items-center gap-2">
          {allFolders.slice(0, 6).map(folder => {
            const color = folderColorMap.get(folder) || '#c59b27'
            const isHovered = hoveredFolder === folder
            return (
              <button
                key={folder}
                type="button"
                onMouseEnter={() => setHoveredFolder(folder)}
                onMouseLeave={() => setHoveredFolder(null)}
                className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] transition-all cursor-pointer ${
                  isHovered
                    ? 'bg-white/10 text-zinc-100 scale-105'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
                title={`Destacar pasta: ${folder}`}
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0 shadow-sm"
                  style={{ backgroundColor: color }}
                />
                <span className="truncate max-w-[80px]">{folder}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* 5. Floating Navigation Controls */}
      <div className="absolute bottom-5 right-5 z-20 flex flex-col gap-1.5 bg-[#0d0e14]/90 backdrop-blur-xl border border-white/[0.08] rounded-2xl p-1.5 shadow-2xl">
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
            transformRef.current.scale = Math.max(0.15, transformRef.current.scale * 0.77)
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
          title="Centralizar Universo"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>

      {/* 6. High-Performance Hardware-Accelerated Canvas */}
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
