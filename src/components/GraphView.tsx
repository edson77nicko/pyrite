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

type GraphLayoutMode = 'constellation' | 'circuit' | 'radar'

interface SimNode {
  id: string
  title: string
  folder: string
  folderShort: string
  tags: string[]
  connections: number
  excerpt: string
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  color: string
}

interface Particle {
  sourceId: string
  targetId: string
  progress: number
  speed: number
  color: string
}

// Sophisticated, elegant matte palette (zero plastic neon)
const FOLDER_PALETTE: string[] = [
  '#d4a338', // Pyrita Matte Gold
  '#38bdf8', // Architectural Cyan
  '#a78bfa', // Muted Violet
  '#34d399', // Mineral Emerald
  '#fb7185', // Soft Rose
  '#fb923c', // Amber Bronze
  '#818cf8', // Slate Indigo
  '#2dd4bf', // Sage Teal
  '#f472b6', // Coral
  '#a3e635', // Olive Lime
  '#cbd5e1'  // Pale Slate
]

export const GraphView: React.FC<GraphViewProps> = ({
  notes,
  currentNoteId,
  onSelectNote
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  // Simulation & Graph State
  const [nodes, setNodes] = useState<SimNode[]>([])
  const [edges, setEdges] = useState<LinkEdge[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)
  const [hoveredFolder, setHoveredFolder] = useState<string | null>(null)
  const [isLocalMode, setIsLocalMode] = useState(false)
  const [layoutMode, setLayoutMode] = useState<GraphLayoutMode>('constellation')
  const [showSettingsDrawer, setShowSettingsDrawer] = useState(false)

  // Calibrated Settings for Smooth Large-Vault Performance (600+ notes)
  const [settings, setSettings] = useState<GraphSettings & {
    enableNebulae: boolean
    enablePulses: boolean
    clusterStrength: number
    radarSpeed: number
  }>({
    repulsion: 1800,
    linkDistance: 110,
    centerGravity: 0.008,
    nodeSize: 1.0,
    showLabels: false, // Clean by default! Contextual hover labels
    showArrows: true,
    isLocalGraph: false,
    enableNebulae: true,
    enablePulses: true,
    clusterStrength: 0.05,
    radarSpeed: 1.0
  })

  // Camera & Interaction
  const transformRef = useRef({ x: 0, y: 0, scale: 0.85 })
  const isDraggingCanvasRef = useRef(false)
  const pointerDownRef = useRef<{ x: number; y: number; time: number } | null>(null)
  const draggedNodeRef = useRef<SimNode | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const simAlphaRef = useRef<number>(1.0)
  const radarAngleRef = useRef<number>(0)
  const particlesRef = useRef<Particle[]>([])

  // Folder Colors (Clean short leaf name)
  const folderColorMap = useMemo(() => {
    const folders = Array.from(new Set(notes.map(n => {
      const parts = (n.folder || 'Início').replace(/\\/g, '/').split('/')
      return parts[parts.length - 1] || 'Início'
    }))).sort()

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

  // Pre-cluster and initialize node positions cleanly (prevents messy overlapping piles)
  useEffect(() => {
    setEdges(filteredEdges)

    const degreeMap = new Map<string, number>()
    for (const e of filteredEdges) {
      degreeMap.set(e.source, (degreeMap.get(e.source) || 0) + 1)
      degreeMap.set(e.target, (degreeMap.get(e.target) || 0) + 1)
    }

    setNodes(prev => {
      const existing = new Map(prev.map(n => [n.id, n]))

      // Identify distinct folders for harmonic spatial island placement
      const folderList = Array.from(new Set(filteredNotes.map(n => {
        const parts = (n.folder || 'Início').replace(/\\/g, '/').split('/')
        return parts[parts.length - 1] || 'Início'
      })))

      const folderAngles = new Map<string, number>()
      folderList.forEach((f, idx) => {
        folderAngles.set(f, (idx / Math.max(1, folderList.length)) * Math.PI * 2)
      })

      const folderSpreadRadius = Math.max(260, Math.min(650, folderList.length * 55))

      return filteredNotes.map((note, index) => {
        const found = existing.get(note.id)
        const connections = degreeMap.get(note.id) || 0

        const parts = (note.folder || 'Início').replace(/\\/g, '/').split('/')
        const folderShort = parts[parts.length - 1] || 'Início'
        const color = folderColorMap.get(folderShort) || '#d4a338'

        // Architectural matte gem radius (scales smoothly with degree: 4.5px to 13px)
        const radius = Math.max(4.5, Math.min(13, 4.5 + Math.sqrt(connections) * 2.2))

        const rawText = note.content.replace(/[#*`>~\[\]\(\)-]/g, ' ').replace(/\s+/g, ' ').trim()
        const excerpt = rawText.slice(0, 140) + (rawText.length > 140 ? '...' : '')

        // Harmonic island initial positioning around folder center
        const fAngle = folderAngles.get(folderShort) || 0
        const fCenterX = Math.cos(fAngle) * folderSpreadRadius
        const fCenterY = Math.sin(fAngle) * folderSpreadRadius

        const noteSubAngle = (index * 2.39996) // Golden angle spiral
        const noteSubDist = 20 + Math.sqrt(index % 35) * 26

        const initialX = fCenterX + Math.cos(noteSubAngle) * noteSubDist
        const initialY = fCenterY + Math.sin(noteSubAngle) * noteSubDist

        return {
          id: note.id,
          title: note.title,
          folder: note.folder,
          folderShort,
          tags: note.tags,
          connections,
          excerpt,
          x: found?.x ?? initialX,
          y: found?.y ?? initialY,
          vx: found?.vx ?? 0,
          vy: found?.vy ?? 0,
          radius,
          color
        }
      })
    })

    simAlphaRef.current = 1.0
  }, [filteredNotes, filteredEdges, folderColorMap])

  // Signal Packets along active links
  useEffect(() => {
    if (!settings.enablePulses) {
      particlesRef.current = []
      return
    }

    const newParticles: Particle[] = []
    const limit = Math.min(60, filteredEdges.length)
    for (let i = 0; i < limit; i++) {
      const edge = filteredEdges[i]
      newParticles.push({
        sourceId: edge.source,
        targetId: edge.target,
        progress: Math.random(),
        speed: 0.003 + Math.random() * 0.005,
        color: '#ffffff'
      })
    }
    particlesRef.current = newParticles
  }, [filteredEdges, settings.enablePulses])

  // Canvas DPI & Resize
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

  // MAIN GRAPH RENDER & PHYSICS LOOP
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

      // Advance radar beam
      radarAngleRef.current = (radarAngleRef.current + 0.015 * settings.radarSpeed) % (Math.PI * 2)

      // 1. PHYSICS STEP
      if (simAlphaRef.current > 0.001 || draggedNodeRef.current) {
        const alpha = simAlphaRef.current
        const nodeMap = new Map(nodes.map(n => [n.id, n]))

        if (layoutMode === 'radar' && currentNoteId) {
          // RADAR MODE: Concentric Celestial Orbits around focused note
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
              const targetX = Math.cos(angle) * 380
              const targetY = Math.sin(angle) * 380
              if (draggedNodeRef.current?.id !== n.id) {
                n.x += (targetX - n.x) * 0.05
                n.y += (targetY - n.y) * 0.05
              }
            })
          }
        } else {
          // FORCES: Galaxy & Circuit Modes (Multi-Body Clustered Force)
          const repulsion = settings.repulsion * alpha
          const springLength = settings.linkDistance
          const springStrength = 0.04 * alpha
          const centerPull = settings.centerGravity * alpha
          const damping = 0.85

          // Folder Centroids for organic spatial islands
          const folderCentroids = new Map<string, { x: number; y: number; count: number }>()
          for (const n of nodes) {
            const cur = folderCentroids.get(n.folderShort) || { x: 0, y: 0, count: 0 }
            cur.x += n.x
            cur.y += n.y
            cur.count++
            folderCentroids.set(n.folderShort, cur)
          }
          folderCentroids.forEach(val => {
            val.x /= val.count
            val.y /= val.count
          })

          // Node-node soft repulsion
          const len = nodes.length
          for (let i = 0; i < len; i++) {
            const n1 = nodes[i]
            for (let j = i + 1; j < len; j++) {
              const n2 = nodes[j]
              const dx = n2.x - n1.x
              const dy = n2.y - n1.y
              const distSq = dx * dx + dy * dy || 1

              if (distSq < 160000) { // 400px radius
                const dist = Math.sqrt(distSq)
                const force = repulsion / (distSq + 600)
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

          // Link spring tension
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

          // Folder Cohesion & Velocity updates
          for (const n of nodes) {
            if (draggedNodeRef.current?.id !== n.id) {
              const fc = folderCentroids.get(n.folderShort)
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
          simAlphaRef.current *= 0.988
        }
      }

      // 2. CLEAR CANVAS & DRAW LUXURY VOID BACKGROUND
      ctx.save()
      ctx.scale(dpr, dpr)
      ctx.clearRect(0, 0, width, height)

      // Pure deep matte obsidian background (zero plastic gloss)
      ctx.fillStyle = '#090a0f'
      ctx.fillRect(0, 0, width, height)

      // Minimal CAD dot grid (subtle orientation without clutter)
      const transform = transformRef.current
      ctx.save()
      const dotSpacing = 36 * transform.scale
      if (dotSpacing > 14) {
        const offX = (width / 2 + transform.x) % dotSpacing
        const offY = (height / 2 + transform.y) % dotSpacing

        ctx.fillStyle = layoutMode === 'circuit' ? 'rgba(56, 189, 248, 0.05)' : 'rgba(255, 255, 255, 0.04)'
        for (let x = offX; x < width; x += dotSpacing) {
          for (let y = offY; y < height; y += dotSpacing) {
            ctx.fillRect(x, y, 1, 1)
          }
        }
      }
      ctx.restore()

      // CAMERA WORLD MATRIX
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

      // 3. RADAR MODE: Concentric Range Circles
      if (layoutMode === 'radar') {
        const rings = [100, 190, 280, 380, 500]
        ctx.save()

        rings.forEach((r, idx) => {
          ctx.beginPath()
          ctx.arc(0, 0, r, 0, Math.PI * 2)
          ctx.strokeStyle = idx === 1 ? 'rgba(212, 163, 56, 0.22)' : 'rgba(255, 255, 255, 0.05)'
          ctx.lineWidth = 1
          ctx.stroke()
        })

        // Radial cross lines
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)'
        for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
          ctx.beginPath()
          ctx.moveTo(0, 0)
          ctx.lineTo(Math.cos(a) * 520, Math.sin(a) * 520)
          ctx.stroke()
        }

        // Radar Sweep Sector
        const sweepAngle = radarAngleRef.current
        const sweepGrad = ctx.createRadialGradient(0, 0, 10, 0, 0, 500)
        sweepGrad.addColorStop(0, 'rgba(212, 163, 56, 0.12)')
        sweepGrad.addColorStop(1, 'rgba(212, 163, 56, 0)')

        ctx.beginPath()
        ctx.moveTo(0, 0)
        ctx.arc(0, 0, 500, sweepAngle - 0.35, sweepAngle)
        ctx.closePath()
        ctx.fillStyle = sweepGrad
        ctx.fill()

        ctx.restore()
      }

      // 4. SOFT ORGANIC NEBULAE (Ambient Island Clouds Behind Folders)
      // Completely borderless and soft: NO DASHED LINES, NO DEBUG TEXT
      if (settings.enableNebulae && layoutMode === 'constellation') {
        const folderGroups = new Map<string, SimNode[]>()
        for (const n of nodes) {
          const list = folderGroups.get(n.folderShort) || []
          list.push(n)
          folderGroups.set(n.folderShort, list)
        }

        folderGroups.forEach((groupNodes, folderShort) => {
          if (groupNodes.length < 2) return

          const color = folderColorMap.get(folderShort) || '#d4a338'
          const isFocused = hoveredFolder ? hoveredFolder === folderShort : true
          const opacity = isFocused ? 0.045 : 0.015

          const cx = groupNodes.reduce((acc, n) => acc + n.x, 0) / groupNodes.length
          const cy = groupNodes.reduce((acc, n) => acc + n.y, 0) / groupNodes.length

          let maxDist = 60
          for (const n of groupNodes) {
            const d = Math.hypot(n.x - cx, n.y - cy)
            if (d > maxDist) maxDist = d
          }
          const nebulaRadius = Math.max(90, Math.min(320, maxDist + 40))

          ctx.save()
          const grad = ctx.createRadialGradient(cx, cy, 10, cx, cy, nebulaRadius)
          grad.addColorStop(0, color + Math.round(opacity * 255).toString(16).padStart(2, '0'))
          grad.addColorStop(1, color + '00')

          ctx.beginPath()
          ctx.arc(cx, cy, nebulaRadius, 0, Math.PI * 2)
          ctx.fillStyle = grad
          ctx.fill()
          ctx.restore()
        })
      }

      // 5. RENDER CONNECTION LINKS
      for (const edge of edges) {
        const s = nodeMap.get(edge.source)
        const t = nodeMap.get(edge.target)
        if (!s || !t) continue

        const isHighlighted = hoveredNodeId
          ? (edge.source === hoveredNodeId || edge.target === hoveredNodeId)
          : (currentNoteId && (edge.source === currentNoteId || edge.target === currentNoteId))

        const isDimmed = hoveredNodeId
          ? !isHighlighted
          : (hoveredFolder && (s.folderShort !== hoveredFolder && t.folderShort !== hoveredFolder))

        ctx.save()
        if (isDimmed) {
          ctx.globalAlpha = 0.06
        }

        ctx.beginPath()

        if (layoutMode === 'circuit') {
          // CIRCUIT BLUEPRINT: Clean Orthogonal Stepped Trace
          const midX = (s.x + t.x) / 2
          ctx.moveTo(s.x, s.y)
          ctx.lineTo(midX, s.y)
          ctx.lineTo(midX, t.y)
          ctx.lineTo(t.x, t.y)

          ctx.strokeStyle = isHighlighted
            ? '#38bdf8'
            : 'rgba(56, 189, 248, 0.12)'
          ctx.lineWidth = isHighlighted ? 1.8 : 0.9
          ctx.stroke()

          if (isHighlighted) {
            ctx.beginPath()
            ctx.arc(midX, s.y, 2, 0, Math.PI * 2)
            ctx.arc(midX, t.y, 2, 0, Math.PI * 2)
            ctx.fillStyle = '#38bdf8'
            ctx.fill()
          }
        } else {
          // CONSTELLATION: Refined Fiber-Optic Filaments
          ctx.moveTo(s.x, s.y)
          ctx.lineTo(t.x, t.y)

          if (isHighlighted) {
            const grad = ctx.createLinearGradient(s.x, s.y, t.x, t.y)
            grad.addColorStop(0, s.color)
            grad.addColorStop(1, t.color)
            ctx.strokeStyle = grad
            ctx.lineWidth = 1.8
          } else {
            // Subtle, crisp filament
            const sameFolder = s.folderShort === t.folderShort
            ctx.strokeStyle = sameFolder ? s.color + '26' : 'rgba(255, 255, 255, 0.08)'
            ctx.lineWidth = 0.8
          }
          ctx.stroke()
        }

        ctx.restore()
      }

      // 6. SIGNAL PACKETS (Subtle Data Pulses along Active Links)
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
          ctx.arc(px, py, isNearActive ? 2.0 : 1.0, 0, Math.PI * 2)
          ctx.fillStyle = isNearActive ? s.color : 'rgba(255, 255, 255, 0.45)'
          ctx.fill()
        }
      }

      // 7. RENDER NODES (PRECISION MATTE GEMS - NO PLASTIC SHINE!)
      const isZoomedClose = transform.scale > 1.35

      for (const node of nodes) {
        const isCurrent = node.id === currentNoteId
        const isHovered = node.id === hoveredNodeId
        const isNeighbor = activeNeighborIds.has(node.id)
        const isFolderMatch = hoveredFolder ? node.folderShort === hoveredFolder : true
        const isSearchMatch = searchQuery
          ? node.title.toLowerCase().includes(searchQuery.toLowerCase())
          : false

        let alpha = 1.0
        if (searchQuery) {
          alpha = isSearchMatch ? 1.0 : 0.08
        } else if (hoveredFolder) {
          alpha = isFolderMatch ? 1.0 : 0.12
        } else if (hoveredNodeId) {
          alpha = (isHovered || isNeighbor) ? 1.0 : 0.1
        }

        ctx.save()
        ctx.globalAlpha = alpha

        const r = node.radius + (isHovered ? 2.5 : 0)

        // Hub Orbital Ring (for notes with >= 4 links)
        if (node.connections >= 4 && !isHovered) {
          ctx.beginPath()
          ctx.arc(node.x, node.y, r + 4, 0, Math.PI * 2)
          ctx.strokeStyle = node.color + '33'
          ctx.lineWidth = 0.9
          ctx.stroke()
        }

        // Active Note CAD Focus Reticle `[ · ]`
        if (isCurrent) {
          const pad = r + 6
          ctx.strokeStyle = node.color
          ctx.lineWidth = 1.2
          ctx.beginPath()
          // Top-Left
          ctx.moveTo(node.x - pad, node.y - pad + 5)
          ctx.lineTo(node.x - pad, node.y - pad)
          ctx.lineTo(node.x - pad + 5, node.y - pad)
          // Top-Right
          ctx.moveTo(node.x + pad - 5, node.y - pad)
          ctx.lineTo(node.x + pad, node.y - pad)
          ctx.lineTo(node.x + pad, node.y - pad + 5)
          // Bottom-Left
          ctx.moveTo(node.x - pad, node.y + pad - 5)
          ctx.lineTo(node.x - pad, node.y + pad)
          ctx.lineTo(node.x - pad + 5, node.y + pad)
          // Bottom-Right
          ctx.moveTo(node.x + pad - 5, node.y + pad)
          ctx.lineTo(node.x + pad, node.y + pad)
          ctx.lineTo(node.x + pad, node.y + pad - 5)
          ctx.stroke()
        }

        // Search Match Beacon
        if (isSearchMatch) {
          ctx.beginPath()
          ctx.arc(node.x, node.y, r + 6, 0, Math.PI * 2)
          ctx.strokeStyle = '#f59e0b'
          ctx.lineWidth = 1.2
          ctx.stroke()
        }

        // Matte Jewel Body: Solid deep core + crisp colored hairline ring (NO GLOSS)
        ctx.beginPath()
        ctx.arc(node.x, node.y, r, 0, Math.PI * 2)
        ctx.fillStyle = isCurrent ? '#161824' : isHovered ? '#1b1d2a' : '#101118'
        ctx.fill()

        ctx.strokeStyle = isHovered ? '#ffffff' : node.color
        ctx.lineWidth = isCurrent || isHovered ? 1.6 : 1.2
        ctx.stroke()

        // Inner Matte Color Core
        ctx.beginPath()
        ctx.arc(node.x, node.y, Math.max(2, r * 0.42), 0, Math.PI * 2)
        ctx.fillStyle = node.color
        ctx.fill()

        ctx.restore()
      }

      // 8. CONTEXTUAL LABELS PASS (NO SCREEN-WIDE TEXT CLUTTER!)
      // Text appears ONLY for:
      // 1) The active open note
      // 2) The currently hovered note & directly connected neighbors
      // 3) Search query matches
      // 4) High-zoom close-ups
      ctx.save()
      for (const node of nodes) {
        const isCurrent = node.id === currentNoteId
        const isHovered = node.id === hoveredNodeId
        const isNeighbor = hoveredNodeId ? activeNeighborIds.has(node.id) : false
        const isSearchMatch = searchQuery
          ? node.title.toLowerCase().includes(searchQuery.toLowerCase())
          : false

        // Determine if label should render
        const showLabel = isHovered || isNeighbor || isCurrent || isSearchMatch || (isZoomedClose && node.connections >= 2)

        if (!showLabel) continue

        const labelText = node.title
        ctx.font = isHovered || isCurrent
          ? '600 11px "Inter", system-ui, sans-serif'
          : '500 10px "Inter", system-ui, sans-serif'

        const textMetrics = ctx.measureText(labelText)
        const pillWidth = textMetrics.width + 16
        const pillHeight = 18
        const pillX = node.x - pillWidth / 2
        const pillY = node.y - node.radius - 22

        // Soft Dark Floating Pill Backdrop
        ctx.beginPath()
        ctx.roundRect(pillX, pillY, pillWidth, pillHeight, 5)
        ctx.fillStyle = isHovered
          ? 'rgba(20, 22, 34, 0.96)'
          : isCurrent
          ? 'rgba(22, 24, 38, 0.94)'
          : 'rgba(14, 15, 23, 0.88)'
        ctx.fill()

        ctx.strokeStyle = isHovered
          ? 'rgba(255, 255, 255, 0.25)'
          : isCurrent
          ? node.color
          : 'rgba(255, 255, 255, 0.08)'
        ctx.lineWidth = 1
        ctx.stroke()

        // Text
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillStyle = isHovered || isCurrent ? '#ffffff' : '#cbd5e1'
        ctx.fillText(labelText, node.x, pillY + pillHeight / 2)
      }
      ctx.restore()

      ctx.restore() // End World Matrix
      ctx.restore() // End Screen Matrix

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

  // Precise Radial Hit Testing (Generous, instant, zero rectangle overlap)
  const getNodeAtCoords = useCallback((worldX: number, worldY: number): SimNode | null => {
    let closestNode: SimNode | null = null
    let closestDistSq = Infinity

    for (let i = nodes.length - 1; i >= 0; i--) {
      const node = nodes[i]
      const dx = worldX - node.x
      const dy = worldY - node.y
      const distSq = dx * dx + dy * dy

      const hitRadius = Math.max(16, node.radius + 6)
      if (distSq <= hitRadius * hitRadius) {
        if (distSq < closestDistSq) {
          closestDistSq = distSq
          closestNode = node
        }
      }
    }
    return closestNode
  }, [nodes])

  // Mouse & Pointer Handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const mouse = getCanvasMouse(e)
    pointerDownRef.current = { x: e.clientX, y: e.clientY, time: Date.now() }

    const hit = getNodeAtCoords(mouse.x, mouse.y)
    if (hit) {
      draggedNodeRef.current = hit
      simAlphaRef.current = 0.4
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
      simAlphaRef.current = 0.4
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

    // Hover detection
    const hit = getNodeAtCoords(mouse.x, mouse.y)
    if (hit) {
      setHoveredNodeId(hit.id)
      canvas.style.cursor = 'pointer'
    } else {
      setHoveredNodeId(null)
      canvas.style.cursor = isDraggingCanvasRef.current ? 'grabbing' : 'default'
    }
  }

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    // Instant click detection
    if (pointerDownRef.current) {
      const dist = Math.hypot(e.clientX - pointerDownRef.current.x, e.clientY - pointerDownRef.current.y)
      const elapsed = Date.now() - pointerDownRef.current.time

      if (dist < 6 && elapsed < 500) {
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
    const newScale = Math.min(3.5, Math.max(0.18, currentScale * zoomFactor))

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

  // Smooth Focus on Folder Archipelago
  const handleFocusFolderIsland = (folderShort: string) => {
    const group = nodes.filter(n => n.folderShort === folderShort)
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

  // Top folders list for archipelago bottom buttons
  const allFolderShorts = useMemo(() => {
    const set = new Set(nodes.map(n => n.folderShort))
    return Array.from(set).sort()
  }, [nodes])

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-[#090a0f] overflow-hidden flex flex-col select-none"
    >
      {/* 1. TOP HUD CONTROL BAR */}
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

        {/* 3 Innovative Visualization Modes */}
        <div className="flex items-center bg-[#141622] border border-zinc-800 rounded-xl p-0.5 text-xs">
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
            title="Constelação Sináptica: Agrupamento orgânico de ideias por afinidade"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Constelação</span>
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
            title="Circuito Neural: Blueprint com trilhas ortogonais e nós de junção"
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
            title="Radar Ecosfera: Órbitas concêntricas ao redor da nota ativa"
          >
            <Radar className="w-3.5 h-3.5" />
            <span>Radar</span>
          </button>
        </div>

        <div className="h-4 w-px bg-zinc-800" />

        {/* Global vs Local Toggle */}
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
          title="Ajustes de Física e Topologia"
        >
          <Sliders className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* 2. FLOATING HUD CARD (Appears cleanly on hover) */}
      {hoveredNode && (
        <div className="absolute top-4 right-4 z-20 w-84 bg-[#0e0f17]/95 backdrop-blur-2xl border border-white/[0.1] rounded-2xl p-4 shadow-2xl space-y-3 text-xs animate-in fade-in zoom-in-95 duration-100 select-none">
          <div className="flex items-start justify-between gap-2 border-b border-zinc-800/80 pb-2.5">
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-[9px] font-mono uppercase tracking-wider text-zinc-400">
                <span
                  className="w-2 h-2 rounded-full inline-block"
                  style={{ backgroundColor: hoveredNode.color }}
                />
                <span>PASTA: {hoveredNode.folderShort}</span>
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

          {/* Connected Notes Pills */}
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
            <span>LINKS: {hoveredNode.connections}</span>
            <button
              onClick={() => onSelectNote(hoveredNode.id)}
              className="text-[var(--accent)] font-semibold flex items-center gap-1 hover:underline cursor-pointer"
            >
              CLIQUE PARA ABRIR <ArrowRight className="w-2.5 h-2.5" />
            </button>
          </div>
        </div>
      )}

      {/* 3. SETTINGS DRAWER */}
      {showSettingsDrawer && (
        <div className="absolute top-18 left-4 z-30 w-72 bg-[#0e0f17]/95 backdrop-blur-2xl border border-white/[0.1] rounded-2xl p-4 shadow-2xl space-y-3.5 text-xs text-zinc-300 animate-in fade-in zoom-in-95 duration-150">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
            <span className="font-bold text-zinc-100 flex items-center gap-1.5 font-mono text-[11px]">
              <Sliders className="w-3.5 h-3.5 text-[var(--accent)]" />
              PARÂMETROS DE FÍSICA
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
              min="800"
              max="4000"
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
              <span>COMPRIMENTO DOS LINKS</span>
              <span>{settings.linkDistance}px</span>
            </div>
            <input
              type="range"
              min="60"
              max="240"
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
              <span>COESÃO POR PASTA</span>
              <span>{(settings.clusterStrength * 100).toFixed(0)}%</span>
            </div>
            <input
              type="range"
              min="0.01"
              max="0.12"
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
              <span className="text-[11px]">Nebulosas Ambientes de Pasta</span>
              <input
                type="checkbox"
                checked={settings.enableNebulae}
                onChange={(e) => setSettings(s => ({ ...s, enableNebulae: e.target.checked }))}
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

      {/* 4. BOTTOM ARCHIPELAGO NAVIGATOR */}
      <div className="absolute bottom-5 left-5 z-20 bg-[#0e0f17]/90 backdrop-blur-xl border border-white/[0.08] rounded-2xl px-3.5 py-2 text-xs text-zinc-400 flex items-center gap-3 shadow-2xl">
        <div className="flex items-center gap-1.5 font-bold text-zinc-200 font-mono text-[11px]">
          <Layers className="w-3.5 h-3.5 text-[var(--accent)]" />
          <span>{nodes.length} NÓS</span>
        </div>
        <span className="text-zinc-700">•</span>
        <span className="font-mono text-[11px]">{edges.length} PONTES</span>
        <span className="text-zinc-700">•</span>

        {/* Clean Folder Jump Buttons */}
        <div className="flex items-center gap-1.5">
          {allFolderShorts.slice(0, 6).map(fShort => {
            const color = folderColorMap.get(fShort) || '#d4a338'
            const isHovered = hoveredFolder === fShort
            return (
              <button
                key={fShort}
                type="button"
                onClick={() => handleFocusFolderIsland(fShort)}
                onMouseEnter={() => setHoveredFolder(fShort)}
                onMouseLeave={() => setHoveredFolder(null)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-mono transition-all cursor-pointer ${
                  isHovered
                    ? 'bg-white/10 text-zinc-100 scale-105 border border-white/20'
                    : 'bg-[#141622] text-zinc-400 hover:text-zinc-200 border border-zinc-800'
                }`}
                title={`Focar no arquipélago: ${fShort}`}
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: color }}
                />
                <span className="truncate max-w-[85px]">{fShort}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* 5. FLOATING ZOOM CONTROLS */}
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
            transformRef.current.scale = Math.max(0.18, transformRef.current.scale * 0.77)
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

      {/* 6. CANVAS */}
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
        className="w-full h-full cursor-default outline-none"
      />
    </div>
  )
}
