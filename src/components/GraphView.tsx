import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import type { Note, LinkEdge, GraphSettings } from '../types'
import { buildGraphEdges } from '../utils/vault'
import { createBlackHoleRenderer, type BlackHoleRenderer } from './BlackHoleShader'
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
  ArrowRight,
  Play,
  Pause,
  Eye,
  Compass
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
  // 2D coordinates (used in Circuit / Radar modes & projected screen cache)
  x: number
  y: number
  vx: number
  vy: number
  // 3D Keplerian Orbital coordinates around the Singularity (in normalized Schwarzschild units)
  orbitRadius: number     // 0.42 .. 2.35
  orbitAngle: number      // radians
  orbitSpeed: number      // angular velocity (rad/s)
  orbitElevation: number  // vertical 3D offset above/below equatorial disk
  orbitPhase: number      // vertical oscillation phase
  // Cached 3D projection for current frame
  screenX: number
  screenY: number
  depthZ: number          // distance along camera forward axis
  behindHorizon: boolean  // true if behind the black hole
  projectedScale: number
  radius: number
  color: string
}

interface QuantumPacket {
  sourceId: string
  targetId: string
  progress: number
  speed: number
  arcHeight: number
}

interface AccretionSpark {
  radius: number
  angle: number
  speed: number
  yOffset: number
  size: number
  alpha: number
  colorIndex: number
  isJet?: boolean
  jetProgress?: number
  jetDir?: number
}

interface SpacetimeRipple {
  x3d: number
  z3d: number
  radius: number
  maxRadius: number
  alpha: number
  color: string
}

// Celestial palette for orbital streams
const FOLDER_PALETTE: string[] = [
  '#f5b041', // Relativistic Gold
  '#38bdf8', // Cherenkov Cyan
  '#c084fc', // Hawking Violet
  '#34d399', // Pulsar Emerald
  '#fb7185', // Redshift Rose
  '#fb923c', // Accretion Amber
  '#818cf8', // Quasar Indigo
  '#2dd4bf', // Nebula Teal
  '#f472b6', // Supernova Pink
  '#a3e635', // Ion Lime
  '#e2e8f0'  // Starlight White
]

function hexToNormalizedRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '').trim()
  if (clean.length === 6) {
    const r = parseInt(clean.slice(0, 2), 16) / 255
    const g = parseInt(clean.slice(2, 4), 16) / 255
    const b = parseInt(clean.slice(4, 6), 16) / 255
    if (!Number.isNaN(r) && !Number.isNaN(g) && !Number.isNaN(b)) {
      return [r, g, b]
    }
  }
  return [0.85, 0.65, 0.22]
}

export const GraphView: React.FC<GraphViewProps> = ({
  notes,
  currentNoteId,
  onSelectNote
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const webglCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const bhRendererRef = useRef<BlackHoleRenderer | null>(null)

  // Graph & Simulation State
  const [nodes, setNodes] = useState<SimNode[]>([])
  const [edges, setEdges] = useState<LinkEdge[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)
  const [hoveredFolder, setHoveredFolder] = useState<string | null>(null)
  const [isLocalMode, setIsLocalMode] = useState(false)
  const [layoutMode, setLayoutMode] = useState<GraphLayoutMode>('constellation')
  const [showSettingsDrawer, setShowSettingsDrawer] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [isContemplationMode, setIsContemplationMode] = useState(false)
  const [contemplatedNodeId, setContemplatedNodeId] = useState<string | null>(null)

  // Settings
  const [settings, setSettings] = useState<GraphSettings & {
    orbitalSpeed: number
    diskTilt: number
    accretionIntensity: number
    enableTrails: boolean
    enablePulses: boolean
    enableSingularityTethers: boolean
    clusterStrength: number
  }>({
    repulsion: 1800,
    linkDistance: 115,
    centerGravity: 0.008,
    nodeSize: 1.0,
    showLabels: false,
    showArrows: true,
    isLocalGraph: false,
    orbitalSpeed: 1.0,
    diskTilt: 0.34, // ~70 deg inclination (iconic Gargantua view)
    accretionIntensity: 1.15,
    enableTrails: true,
    enablePulses: true,
    enableSingularityTethers: true,
    clusterStrength: 0.05
  })

  // Camera & Interaction Refs
  const transformRef = useRef({ x: 0, y: 0, scale: 0.92 })
  const tiltRef = useRef(0.34)
  const rotationRef = useRef(0)
  const timeScaleRef = useRef(1.0)
  const simTimeRef = useRef(0)
  const mouseScreenRef = useRef({ x: -9999, y: -9999 })

  const isDraggingCanvasRef = useRef(false)
  const isTiltingCameraRef = useRef(false)
  const pointerDownRef = useRef<{ x: number; y: number; time: number; button: number } | null>(null)
  const draggedNodeRef = useRef<SimNode | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const simAlphaRef = useRef<number>(1.0)
  const radarAngleRef = useRef<number>(0)

  const packetsRef = useRef<QuantumPacket[]>([])
  const sparksRef = useRef<AccretionSpark[]>([])
  const ripplesRef = useRef<SpacetimeRipple[]>([])

  // Keep tiltRef synchronized with settings
  useEffect(() => {
    tiltRef.current = settings.diskTilt
  }, [settings.diskTilt])

  // Exit contemplation mode on Escape
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isContemplationMode) {
        setIsContemplationMode(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isContemplationMode])

  // Contemplation Mode auto-dream spotlight timer
  useEffect(() => {
    if (!isContemplationMode || nodes.length === 0) {
      setContemplatedNodeId(null)
      return
    }

    const pickSpotlight = () => {
      // Prefer connected notes for rich synaptic visuals
      const connected = nodes.filter(n => n.connections > 0)
      const pool = connected.length > 0 ? connected : nodes
      const chosen = pool[Math.floor(Math.random() * pool.length)]
      if (chosen) setContemplatedNodeId(chosen.id)
    }

    pickSpotlight()
    const timer = setInterval(pickSpotlight, 5500)
    return () => clearInterval(timer)
  }, [isContemplationMode, nodes])

  // Folder Color Map
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

  // Filter Notes & Edges
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

  // Initialize Ambient Accretion Sparks & Relativistic Polar Jets
  useEffect(() => {
    const sparks: AccretionSpark[] = []
    // 380 Accretion disk micro-sparks
    for (let i = 0; i < 380; i++) {
      const u = Math.random()
      // Concentrate more sparks near the inner photon ring
      const radius = 0.37 + Math.pow(u, 1.55) * 2.15
      const angle = Math.random() * Math.PI * 2
      // Keplerian angular velocity: w ~ r^(-1.2)
      const speed = (0.32 + Math.random() * 0.14) / Math.pow(radius, 1.15)
      sparks.push({
        radius,
        angle,
        speed,
        yOffset: (Math.random() - 0.5) * 0.045 * radius,
        size: 0.7 + Math.random() * 1.6,
        alpha: 0.25 + Math.random() * 0.65,
        colorIndex: i % FOLDER_PALETTE.length
      })
    }

    // 45 Relativistic Polar Jet particles (shooting up/down along the spin axis)
    for (let i = 0; i < 45; i++) {
      sparks.push({
        radius: 0.02 + Math.random() * 0.08,
        angle: Math.random() * Math.PI * 2,
        speed: 2.2,
        yOffset: 0,
        size: 1.0 + Math.random() * 1.4,
        alpha: 0.3 + Math.random() * 0.5,
        colorIndex: i % 3,
        isJet: true,
        jetProgress: Math.random(),
        jetDir: i % 2 === 0 ? 1 : -1
      })
    }

    sparksRef.current = sparks
  }, [])

  // Initialize Nodes in 3D Keplerian Spiral Arms around the Black Hole
  useEffect(() => {
    setEdges(filteredEdges)

    const degreeMap = new Map<string, number>()
    for (const e of filteredEdges) {
      degreeMap.set(e.source, (degreeMap.get(e.source) || 0) + 1)
      degreeMap.set(e.target, (degreeMap.get(e.target) || 0) + 1)
    }

    setNodes(prev => {
      const existing = new Map(prev.map(n => [n.id, n]))

      // Group notes by folder so each folder forms a coherent Galactic Spiral Arm!
      const folderGroups = new Map<string, Note[]>()
      for (const n of filteredNotes) {
        const parts = (n.folder || 'Início').replace(/\\/g, '/').split('/')
        const fShort = parts[parts.length - 1] || 'Início'
        const list = folderGroups.get(fShort) || []
        list.push(n)
        folderGroups.set(fShort, list)
      }

      const folderList = Array.from(folderGroups.keys()).sort()
      const numFolders = Math.max(1, folderList.length)
      const folderSpreadRadius2D = Math.max(260, Math.min(620, numFolders * 55))

      const result: SimNode[] = []

      folderList.forEach((folderShort, fIdx) => {
        const group = folderGroups.get(folderShort) || []
        // Sort within folder so highest-connection hubs orbit closer to the Event Horizon!
        group.sort((a, b) => (degreeMap.get(b.id) || 0) - (degreeMap.get(a.id) || 0))

        const armBaseAngle = (fIdx / numFolders) * Math.PI * 2
        const color = folderColorMap.get(folderShort) || '#f5b041'

        group.forEach((note, idxInFolder) => {
          const found = existing.get(note.id)
          const connections = degreeMap.get(note.id) || 0

          // Normalized progress along this folder's spiral arm [0..1]
          const t = group.length > 1 ? idxInFolder / (group.length - 1) : 0.35

          // High-degree hubs orbit closer to the inner Photon Sphere (r = 0.44 .. 0.85)
          // Other notes sweep outward along the logarithmic spiral arm (r = 0.55 .. 2.25)
          const hubPull = Math.min(0.32, connections * 0.045)
          const jitterR = ((idxInFolder * 37) % 100) / 100 * 0.09
          const orbitRadius = Math.max(
            0.43,
            Math.min(2.32, 0.52 + Math.pow(t, 0.82) * 1.68 - hubPull + jitterR)
          )

          // Logarithmic spiral twist: angle winds as radius increases + golden angle spread
          const spiralWind = Math.log(orbitRadius * 2.5) * 1.65
          const goldenSpread = (idxInFolder * 2.39996) * 0.18
          const orbitAngle = found?.orbitAngle ?? (armBaseAngle + spiralWind + goldenSpread)

          // Keplerian orbital speed: inner rings orbit faster than outer rings
          const orbitSpeed = 0.18 / Math.pow(orbitRadius, 1.05)

          // Subtle 3D vertical wave thickness
          const orbitElevation = ((idxInFolder % 7) - 3) * 0.014 * orbitRadius
          const orbitPhase = (idxInFolder * 1.7) % (Math.PI * 2)

          // Node visual gem size
          const radius = Math.max(4.2, Math.min(12.5, 4.2 + Math.sqrt(connections) * 2.1))

          const rawText = note.content.replace(/[#*`>~\[\]\(\)-]/g, ' ').replace(/\s+/g, ' ').trim()
          const excerpt = rawText.slice(0, 140) + (rawText.length > 140 ? '...' : '')

          // 2D fallback coordinates for Circuit & Radar modes
          const fCenterX = Math.cos(armBaseAngle) * folderSpreadRadius2D
          const fCenterY = Math.sin(armBaseAngle) * folderSpreadRadius2D
          const subAngle = idxInFolder * 2.39996
          const subDist = 22 + Math.sqrt(idxInFolder % 35) * 26

          result.push({
            id: note.id,
            title: note.title,
            folder: note.folder,
            folderShort,
            tags: note.tags,
            connections,
            excerpt,
            x: found?.x ?? (fCenterX + Math.cos(subAngle) * subDist),
            y: found?.y ?? (fCenterY + Math.sin(subAngle) * subDist),
            vx: found?.vx ?? 0,
            vy: found?.vy ?? 0,
            orbitRadius: found?.orbitRadius ?? orbitRadius,
            orbitAngle,
            orbitSpeed,
            orbitElevation,
            orbitPhase,
            screenX: 0,
            screenY: 0,
            depthZ: 1,
            behindHorizon: false,
            projectedScale: 1,
            radius,
            color
          })
        })
      })

      return result
    })

    simAlphaRef.current = 1.0
  }, [filteredNotes, filteredEdges, folderColorMap])

  // Initialize Quantum Photons along Synaptic Arcs
  useEffect(() => {
    if (!settings.enablePulses) {
      packetsRef.current = []
      return
    }

    const packets: QuantumPacket[] = []
    const maxPackets = Math.min(90, filteredEdges.length * 2)
    for (let i = 0; i < maxPackets; i++) {
      const edge = filteredEdges[i % filteredEdges.length]
      if (!edge) continue
      packets.push({
        sourceId: edge.source,
        targetId: edge.target,
        progress: Math.random(),
        speed: 0.0035 + Math.random() * 0.0055,
        arcHeight: (i % 2 === 0 ? 1 : -1) * (0.06 + (i % 5) * 0.025)
      })
    }
    packetsRef.current = packets
  }, [filteredEdges, settings.enablePulses])

  // Initialize WebGL Black Hole Shader Renderer
  useEffect(() => {
    const glCanvas = webglCanvasRef.current
    if (!glCanvas) return

    const renderer = createBlackHoleRenderer(glCanvas)
    bhRendererRef.current = renderer

    return () => {
      renderer?.dispose()
      bhRendererRef.current = null
    }
  }, [])

  // Synchronize Canvas Sizes with Container & DPI
  const updateCanvasSize = useCallback(() => {
    const overlay = overlayCanvasRef.current
    const glCanvas = webglCanvasRef.current
    const container = containerRef.current
    if (!overlay || !container) return

    const rect = container.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1

    overlay.width = rect.width * dpr
    overlay.height = rect.height * dpr
    overlay.style.width = `${rect.width}px`
    overlay.style.height = `${rect.height}px`

    if (glCanvas) {
      glCanvas.style.width = `${rect.width}px`
      glCanvas.style.height = `${rect.height}px`
    }
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

  // MAIN 60FPS ANIMATION, RELATIVISTIC ORBIT & RENDERING LOOP
  useEffect(() => {
    const overlay = overlayCanvasRef.current
    if (!overlay) return
    const ctx = overlay.getContext('2d')
    if (!ctx) return

    let lastTime = performance.now()

    // Exact 3D Camera Projection matching BlackHoleShader.ts!
    const project3D = (
      x3d: number,
      y3d: number,
      z3d: number,
      centerX: number,
      centerY: number,
      baseUnit: number,
      tilt: number
    ) => {
      const camDist = 3.8
      const clampedTilt = Math.max(0.12, Math.min(1.35, tilt))
      const sinT = Math.sin(clampedTilt)
      const cosT = Math.cos(clampedTilt)

      // Camera origin ro = (0, sinT * camDist, -cosT * camDist)
      // Forward vector = (0, -sinT, cosT)
      // Right vector   = (1, 0, 0)
      // Up vector      = (0, cosT, sinT)
      const relX = x3d
      const relY = y3d - sinT * camDist
      const relZ = z3d + cosT * camDist

      const forwardZ = relY * (-sinT) + relZ * cosT
      const safeDepth = Math.max(0.4, forwardZ)

      let projX = (relX / safeDepth) * 1.65
      let projY = ((relY * cosT + relZ * sinT) / safeDepth) * 1.65

      // Apply relativistic Einstein ring deflection when behind the singularity (z3d > 0)
      const r3d = Math.hypot(x3d, y3d, z3d)
      const behindHorizon = z3d > 0.02
      if (behindHorizon) {
        const screenRad = Math.hypot(projX, projY) + 0.0001
        const einsteinDeflection = 0.042 / (screenRad + 0.14)
        const bendFactor = Math.min(1.0, z3d / (r3d + 0.1))
        projX += (projX / screenRad) * einsteinDeflection * bendFactor
        projY += (projY / screenRad) * einsteinDeflection * bendFactor
      }

      // Inverse camera roll (+0.14 rad) to match shader's mat2(cr, -sr, sr, cr) * p
      const roll = 0.14
      const cr = Math.cos(roll)
      const sr = Math.sin(roll)
      const rotX = cr * projX - sr * projY
      const rotY = sr * projX + cr * projY

      return {
        screenX: centerX + rotX * baseUnit,
        screenY: centerY - rotY * baseUnit,
        depthZ: safeDepth,
        behindHorizon,
        projectedScale: Math.max(0.45, Math.min(2.2, 3.8 / safeDepth))
      }
    }

    const render = (currentTime: number) => {
      const rawDt = Math.min(40, currentTime - lastTime) / 1000
      lastTime = currentTime

      const width = overlay.clientWidth
      const height = overlay.clientHeight
      const dpr = window.devicePixelRatio || 1

      // Gravitational Time Dilation: slow down smoothly when hovering a node or paused
      const targetTimeScale = isPaused
        ? 0.0
        : hoveredNodeId
        ? 0.04 // Relativistic freeze when inspecting a note!
        : settings.orbitalSpeed

      timeScaleRef.current += (targetTimeScale - timeScaleRef.current) * 0.1
      const effectiveDt = rawDt * timeScaleRef.current
      simTimeRef.current += effectiveDt

      // Contemplation Mode gentle autonomous camera drift
      if (isContemplationMode && !isDraggingCanvasRef.current && !isTiltingCameraRef.current) {
        const t = currentTime * 0.00025
        tiltRef.current = 0.32 + Math.sin(t) * 0.11
        transformRef.current.scale = 0.96 + Math.cos(t * 0.7) * 0.12
      }

      const transform = transformRef.current
      const centerX = width / 2 + transform.x
      const centerY = height / 2 + transform.y
      const baseUnit = Math.min(width, height) * 0.42 * transform.scale
      const currentTilt = tiltRef.current

      // Read accent color from CSS variable for shader harmony
      const computedAccent = getComputedStyle(document.documentElement)
        .getPropertyValue('--accent')
        .trim() || '#f5b041'
      const accentRgb = hexToNormalizedRgb(computedAccent)

      // 1. RENDER WEBGL GARGANTUA BLACK HOLE SHADER (in Constellation Mode)
      if (layoutMode === 'constellation' && bhRendererRef.current) {
        rotationRef.current = (rotationRef.current + effectiveDt * 0.18) % (Math.PI * 2)
        bhRendererRef.current.render({
          width,
          height,
          dpr,
          centerX,
          centerY,
          scale: transform.scale,
          time: simTimeRef.current,
          tilt: currentTilt,
          rotation: rotationRef.current,
          accentRgb,
          mouseX: mouseScreenRef.current.x,
          mouseY: mouseScreenRef.current.y,
          intensity: settings.accretionIntensity
        })
      }

      // 2. CLEAR 2D VECTOR OVERLAY CANVAS
      ctx.save()
      ctx.scale(dpr, dpr)
      ctx.clearRect(0, 0, width, height)

      // Active / Highlighted Neighbor Sets
      const focalNodeId = hoveredNodeId || contemplatedNodeId || currentNoteId
      const activeNeighborIds = new Set<string>()
      if (focalNodeId) {
        activeNeighborIds.add(focalNodeId)
        for (const e of edges) {
          if (e.source === focalNodeId) activeNeighborIds.add(e.target)
          if (e.target === focalNodeId) activeNeighborIds.add(e.source)
        }
      }

      // =========================================================================
      // MODE A: SINGULARITY / CONSTELLATION (3D Relativistic Black Hole Galaxy)
      // =========================================================================
      if (layoutMode === 'constellation') {
        // Fallback background if WebGL is unavailable
        if (!bhRendererRef.current) {
          ctx.fillStyle = '#06070b'
          ctx.fillRect(0, 0, width, height)
        }

        const nodeMap = new Map<string, SimNode>()

        // Update 3D Keplerian Orbital Positions & Project to Screen
        for (const n of nodes) {
          if (draggedNodeRef.current?.id !== n.id) {
            n.orbitAngle = (n.orbitAngle + n.orbitSpeed * effectiveDt) % (Math.PI * 2)
          }

          const x3d = Math.cos(n.orbitAngle) * n.orbitRadius
          const z3d = Math.sin(n.orbitAngle) * n.orbitRadius
          const y3d =
            n.orbitElevation +
            Math.sin(simTimeRef.current * 1.4 + n.orbitPhase) * 0.012 * n.orbitRadius

          const proj = project3D(x3d, y3d, z3d, centerX, centerY, baseUnit, currentTilt)
          n.screenX = proj.screenX
          n.screenY = proj.screenY
          n.depthZ = proj.depthZ
          n.behindHorizon = proj.behindHorizon
          n.projectedScale = proj.projectedScale

          nodeMap.set(n.id, n)
        }

        // Render Spacetime Ripples (Gravitational Waves from clicks/drags)
        for (let i = ripplesRef.current.length - 1; i >= 0; i--) {
          const rip = ripplesRef.current[i]
          rip.radius += rawDt * 0.55
          rip.alpha *= 0.95
          if (rip.alpha < 0.02 || rip.radius > rip.maxRadius) {
            ripplesRef.current.splice(i, 1)
            continue
          }

          ctx.save()
          ctx.beginPath()
          const segs = 36
          for (let s = 0; s <= segs; s++) {
            const a = (s / segs) * Math.PI * 2
            const rx = rip.x3d + Math.cos(a) * rip.radius
            const rz = rip.z3d + Math.sin(a) * rip.radius
            const p = project3D(rx, 0, rz, centerX, centerY, baseUnit, currentTilt)
            if (s === 0) ctx.moveTo(p.screenX, p.screenY)
            else ctx.lineTo(p.screenX, p.screenY)
          }
          ctx.strokeStyle = rip.color
          ctx.globalAlpha = rip.alpha
          ctx.lineWidth = 1.4
          ctx.stroke()
          ctx.restore()
        }

        // Render Ambient Accretion Sparks & Relativistic Polar Jets
        ctx.save()
        for (const sp of sparksRef.current) {
          if (sp.isJet) {
            sp.jetProgress = ((sp.jetProgress || 0) + effectiveDt * 0.45) % 1.0
            const jp = sp.jetProgress
            const jetY = (sp.jetDir || 1) * (0.26 + jp * 1.85)
            const jetSpread = sp.radius * (1.0 + jp * 2.8)
            sp.angle += effectiveDt * 3.0
            const jx = Math.cos(sp.angle) * jetSpread
            const jz = Math.sin(sp.angle) * jetSpread
            const proj = project3D(jx, jetY, jz, centerX, centerY, baseUnit, currentTilt)

            const jetAlpha = Math.sin(jp * Math.PI) * sp.alpha * 0.55
            ctx.fillStyle = FOLDER_PALETTE[sp.colorIndex]
            ctx.globalAlpha = jetAlpha
            ctx.beginPath()
            ctx.arc(proj.screenX, proj.screenY, sp.size * proj.projectedScale * 0.8, 0, Math.PI * 2)
            ctx.fill()
          } else {
            sp.angle = (sp.angle + sp.speed * effectiveDt) % (Math.PI * 2)
            const sx = Math.cos(sp.angle) * sp.radius
            const sz = Math.sin(sp.angle) * sp.radius
            const proj = project3D(sx, sp.yOffset, sz, centerX, centerY, baseUnit, currentTilt)

            // Occlude sparks directly behind the Event Horizon shadow
            const distFromBhCenter = Math.hypot(proj.screenX - centerX, proj.screenY - centerY)
            if (proj.behindHorizon && distFromBhCenter < baseUnit * 0.14) continue

            // Doppler brightness boost on left/approaching side
            const dopplerBoost = sx < 0 ? 1.25 : 0.75
            ctx.fillStyle = FOLDER_PALETTE[sp.colorIndex]
            ctx.globalAlpha = Math.min(0.9, sp.alpha * dopplerBoost * (proj.behindHorizon ? 0.5 : 0.85))
            const r = Math.max(0.6, sp.size * proj.projectedScale * 0.65)
            ctx.fillRect(proj.screenX - r / 2, proj.screenY - r / 2, r, r)
          }
        }
        ctx.restore()

        // Render Singularity Core Tethers (Infalling energy filaments from Top Hubs into Photon Ring)
        if (settings.enableSingularityTethers) {
          ctx.save()
          const photonRingScreenR = baseUnit * 0.165
          for (const n of nodes) {
            if (n.connections < 3 && n.id !== currentNoteId) continue
            const isFocal = n.id === focalNodeId

            const angleToCenter = Math.atan2(n.screenY - centerY, n.screenX - centerX)
            const anchorX = centerX + Math.cos(angleToCenter + 0.6) * photonRingScreenR
            const anchorY = centerY + Math.sin(angleToCenter + 0.6) * photonRingScreenR

            const ctrlX = centerX + Math.cos(angleToCenter + 0.3) * (photonRingScreenR * 1.8)
            const ctrlY = centerY + Math.sin(angleToCenter + 0.3) * (photonRingScreenR * 1.8)

            const grad = ctx.createLinearGradient(n.screenX, n.screenY, anchorX, anchorY)
            grad.addColorStop(0, n.color + (isFocal ? '88' : '28'))
            grad.addColorStop(1, '#ffffff00')

            ctx.beginPath()
            ctx.moveTo(n.screenX, n.screenY)
            ctx.quadraticCurveTo(ctrlX, ctrlY, anchorX, anchorY)
            ctx.strokeStyle = grad
            ctx.lineWidth = isFocal ? 1.4 : 0.7
            ctx.stroke()
          }
          ctx.restore()
        }

        // Render 3D Geodesic Synaptic Filaments (Edges)
        for (const edge of edges) {
          const s = nodeMap.get(edge.source)
          const t = nodeMap.get(edge.target)
          if (!s || !t) continue

          const isHighlighted = focalNodeId
            ? (edge.source === focalNodeId || edge.target === focalNodeId)
            : false

          const isDimmed = hoveredNodeId
            ? !isHighlighted
            : (hoveredFolder && (s.folderShort !== hoveredFolder && t.folderShort !== hoveredFolder))

          ctx.save()
          if (isDimmed) {
            ctx.globalAlpha = 0.05
          }

          // Calculate 3D midpoint curved slightly toward the gravitational center & lifted in Y
          const sx3 = Math.cos(s.orbitAngle) * s.orbitRadius
          const sz3 = Math.sin(s.orbitAngle) * s.orbitRadius
          const tx3 = Math.cos(t.orbitAngle) * t.orbitRadius
          const tz3 = Math.sin(t.orbitAngle) * t.orbitRadius

          const midX3 = (sx3 + tx3) * 0.42 // Pulled inward by gravity!
          const midZ3 = (sz3 + tz3) * 0.42
          const midY3 = (s.orbitElevation + t.orbitElevation) * 0.5 + (isHighlighted ? 0.12 : 0.05)

          const midProj = project3D(midX3, midY3, midZ3, centerX, centerY, baseUnit, currentTilt)

          ctx.beginPath()
          ctx.moveTo(s.screenX, s.screenY)
          ctx.quadraticCurveTo(midProj.screenX, midProj.screenY, t.screenX, t.screenY)

          if (isHighlighted) {
            const grad = ctx.createLinearGradient(s.screenX, s.screenY, t.screenX, t.screenY)
            grad.addColorStop(0, s.color)
            grad.addColorStop(0.5, '#ffffff')
            grad.addColorStop(1, t.color)
            ctx.strokeStyle = grad
            ctx.lineWidth = 1.9
          } else {
            const sameFolder = s.folderShort === t.folderShort
            ctx.strokeStyle = sameFolder ? s.color + '30' : 'rgba(255, 255, 255, 0.09)'
            ctx.lineWidth = 0.85
          }
          ctx.stroke()
          ctx.restore()
        }

        // Render Quantum Photons Streaming Along Geodesic Filaments
        if (settings.enablePulses && packetsRef.current.length > 0) {
          for (const pkt of packetsRef.current) {
            const s = nodeMap.get(pkt.sourceId)
            const t = nodeMap.get(pkt.targetId)
            if (!s || !t) continue

            const isNearFocal = activeNeighborIds.has(pkt.sourceId) || activeNeighborIds.has(pkt.targetId)
            if (hoveredNodeId && !isNearFocal) continue

            pkt.progress = (pkt.progress + pkt.speed * (isNearFocal ? 1.35 : 0.8)) % 1.0
            const u = pkt.progress
            const invU = 1 - u

            const sx3 = Math.cos(s.orbitAngle) * s.orbitRadius
            const sz3 = Math.sin(s.orbitAngle) * s.orbitRadius
            const tx3 = Math.cos(t.orbitAngle) * t.orbitRadius
            const tz3 = Math.sin(t.orbitAngle) * t.orbitRadius

            const midX3 = (sx3 + tx3) * 0.42
            const midZ3 = (sz3 + tz3) * 0.42
            const midY3 = (s.orbitElevation + t.orbitElevation) * 0.5 + pkt.arcHeight

            const midProj = project3D(midX3, midY3, midZ3, centerX, centerY, baseUnit, currentTilt)

            // Quadratic Bezier evaluation in screen space
            const px = invU * invU * s.screenX + 2 * invU * u * midProj.screenX + u * u * t.screenX
            const py = invU * invU * s.screenY + 2 * invU * u * midProj.screenY + u * u * t.screenY

            ctx.save()
            ctx.beginPath()
            ctx.arc(px, py, isNearFocal ? 2.4 : 1.3, 0, Math.PI * 2)
            ctx.fillStyle = isNearFocal ? '#ffffff' : s.color
            ctx.globalAlpha = isNearFocal ? 0.95 : 0.55
            ctx.fill()
            ctx.restore()
          }
        }

        // Depth-sort nodes back-to-front (largest depthZ first) so foreground nodes pass in front!
        const sortedNodes = [...nodes].sort((a, b) => b.depthZ - a.depthZ)

        // Render Nodes & Relativistic Orbital Comet Trails
        for (const node of sortedNodes) {
          const isCurrent = node.id === currentNoteId
          const isHovered = node.id === hoveredNodeId
          const isContemplated = node.id === contemplatedNodeId
          const isNeighbor = activeNeighborIds.has(node.id)
          const isFolderMatch = hoveredFolder ? node.folderShort === hoveredFolder : true
          const isSearchMatch = searchQuery
            ? node.title.toLowerCase().includes(searchQuery.toLowerCase())
            : false

          let alpha = 1.0
          if (searchQuery) {
            alpha = isSearchMatch ? 1.0 : 0.08
          } else if (hoveredFolder) {
            alpha = isFolderMatch ? 1.0 : 0.1
          } else if (hoveredNodeId) {
            alpha = (isHovered || isNeighbor) ? 1.0 : 0.14
          } else if (node.behindHorizon) {
            alpha = 0.72
          }

          ctx.save()
          ctx.globalAlpha = alpha

          // 1. Orbital Comet Trail (Curved 3D wake behind the orbiting note)
          if (settings.enableTrails && !isPaused) {
            const trailSteps = isHovered || isCurrent || isContemplated ? 10 : 5
            const trailArc = (isHovered || isCurrent ? 0.24 : 0.13) * Math.min(1.4, settings.orbitalSpeed)

            ctx.beginPath()
            for (let step = 0; step <= trailSteps; step++) {
              const frac = step / trailSteps
              const pastAngle = node.orbitAngle - frac * trailArc
              const tx = Math.cos(pastAngle) * node.orbitRadius
              const tz = Math.sin(pastAngle) * node.orbitRadius
              const ty =
                node.orbitElevation +
                Math.sin(simTimeRef.current * 1.4 + node.orbitPhase) * 0.012 * node.orbitRadius
              const tp = project3D(tx, ty, tz, centerX, centerY, baseUnit, currentTilt)
              if (step === 0) ctx.moveTo(tp.screenX, tp.screenY)
              else ctx.lineTo(tp.screenX, tp.screenY)
            }
            ctx.strokeStyle = node.color + (isHovered || isCurrent ? '75' : '32')
            ctx.lineWidth = Math.max(0.8, node.radius * node.projectedScale * 0.28)
            ctx.lineCap = 'round'
            ctx.stroke()
          }

          const r =
            node.radius *
            node.projectedScale *
            settings.nodeSize *
            (isHovered || isContemplated ? 1.35 : 1.0)

          // 2. Outer Gravitational Halo for Hub Notes or Focal Notes
          if (node.connections >= 3 || isCurrent || isHovered || isContemplated) {
            ctx.beginPath()
            ctx.arc(node.screenX, node.screenY, r + 4.5, 0, Math.PI * 2)
            ctx.strokeStyle = isHovered || isContemplated ? '#ffffff66' : node.color + '44'
            ctx.lineWidth = isCurrent || isHovered ? 1.3 : 0.85
            ctx.stroke()
          }

          // 3. Active Note Astronomical Reticle `[ · ]`
          if (isCurrent || isContemplated) {
            const pad = r + 7
            ctx.strokeStyle = isContemplated ? '#ffffff' : node.color
            ctx.lineWidth = 1.3
            ctx.beginPath()
            ctx.moveTo(node.screenX - pad, node.screenY - pad + 5)
            ctx.lineTo(node.screenX - pad, node.screenY - pad)
            ctx.lineTo(node.screenX - pad + 5, node.screenY - pad)

            ctx.moveTo(node.screenX + pad - 5, node.screenY - pad)
            ctx.lineTo(node.screenX + pad, node.screenY - pad)
            ctx.lineTo(node.screenX + pad, node.screenY - pad + 5)

            ctx.moveTo(node.screenX - pad, node.screenY + pad - 5)
            ctx.lineTo(node.screenX - pad, node.screenY + pad)
            ctx.lineTo(node.screenX - pad + 5, node.screenY + pad)

            ctx.moveTo(node.screenX + pad - 5, node.screenY + pad)
            ctx.lineTo(node.screenX + pad, node.screenY + pad)
            ctx.lineTo(node.screenX + pad, node.screenY + pad - 5)
            ctx.stroke()
          }

          // 4. Search Match Pulse Ring
          if (isSearchMatch) {
            ctx.beginPath()
            ctx.arc(node.screenX, node.screenY, r + 7, 0, Math.PI * 2)
            ctx.strokeStyle = '#f59e0b'
            ctx.lineWidth = 1.5
            ctx.stroke()
          }

          // 5. Celestial Star-Core Body (Dark Obsidian Halo + Incandescent Core)
          ctx.beginPath()
          ctx.arc(node.screenX, node.screenY, r, 0, Math.PI * 2)
          ctx.fillStyle = isHovered ? '#1e2235' : '#0d0f18'
          ctx.fill()

          ctx.strokeStyle = isHovered || isContemplated ? '#ffffff' : node.color
          ctx.lineWidth = isCurrent || isHovered ? 1.7 : 1.2
          ctx.stroke()

          // Inner Star Core
          ctx.beginPath()
          ctx.arc(node.screenX, node.screenY, Math.max(1.8, r * 0.48), 0, Math.PI * 2)
          ctx.fillStyle = isHovered || isContemplated ? '#ffffff' : node.color
          ctx.fill()

          ctx.restore()
        }

        // Contextual Floating Glass Labels (Zero Clutter)
        const isZoomedClose = transform.scale > 1.45
        ctx.save()
        for (const node of sortedNodes) {
          const isCurrent = node.id === currentNoteId
          const isHovered = node.id === hoveredNodeId
          const isContemplated = node.id === contemplatedNodeId
          const isNeighbor = focalNodeId ? activeNeighborIds.has(node.id) : false
          const isSearchMatch = searchQuery
            ? node.title.toLowerCase().includes(searchQuery.toLowerCase())
            : false

          const showLabel =
            isHovered ||
            isContemplated ||
            isCurrent ||
            (hoveredNodeId && isNeighbor) ||
            (contemplatedNodeId && isNeighbor) ||
            isSearchMatch ||
            (isZoomedClose && node.connections >= 3)

          if (!showLabel) continue

          const labelText = node.title
          ctx.font =
            isHovered || isCurrent || isContemplated
              ? '600 11px "Inter", system-ui, sans-serif'
              : '500 10px "Inter", system-ui, sans-serif'

          const textMetrics = ctx.measureText(labelText)
          const pillW = textMetrics.width + 18
          const pillH = 20
          const r = node.radius * node.projectedScale
          const pillX = node.screenX - pillW / 2
          const pillY = node.screenY - r - 25

          ctx.beginPath()
          ctx.roundRect(pillX, pillY, pillW, pillH, 6)
          ctx.fillStyle =
            isHovered || isContemplated
              ? 'rgba(16, 18, 30, 0.95)'
              : 'rgba(10, 11, 18, 0.88)'
          ctx.fill()

          ctx.strokeStyle =
            isHovered || isContemplated
              ? node.color
              : isCurrent
              ? node.color + 'aa'
              : 'rgba(255, 255, 255, 0.12)'
          ctx.lineWidth = isHovered || isContemplated ? 1.2 : 0.9
          ctx.stroke()

          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillStyle = isHovered || isCurrent || isContemplated ? '#ffffff' : '#cbd5e1'
          ctx.fillText(labelText, node.screenX, pillY + pillH / 2)
        }
        ctx.restore()
      } else {
        // =========================================================================
        // MODE B & C: CIRCUIT BLUEPRINT & RADAR ECOSPHERE (2D Modes)
        // =========================================================================
        const dt2d = Math.min(32, rawDt * 1000) / 16.66
        radarAngleRef.current = (radarAngleRef.current + 0.015 * settings.orbitalSpeed) % (Math.PI * 2)

        const nodeMap = new Map(nodes.map(n => [n.id, n]))

        if (simAlphaRef.current > 0.001 || draggedNodeRef.current) {
          const alpha = simAlphaRef.current

          if (layoutMode === 'radar' && currentNoteId) {
            const centerNode = nodeMap.get(currentNoteId)
            if (centerNode) {
              centerNode.x += (0 - centerNode.x) * 0.1
              centerNode.y += (0 - centerNode.y) * 0.1

              const directNeighbors = new Set<string>()
              for (const e of edges) {
                if (e.source === currentNoteId) directNeighbors.add(e.target)
                if (e.target === currentNoteId) directNeighbors.add(e.source)
              }

              const orbit1 = Array.from(directNeighbors)
                .map(id => nodeMap.get(id))
                .filter(Boolean) as SimNode[]
              orbit1.forEach((n, idx) => {
                const angle = (idx / Math.max(1, orbit1.length)) * Math.PI * 2
                const targetX = Math.cos(angle) * 190
                const targetY = Math.sin(angle) * 190
                if (draggedNodeRef.current?.id !== n.id) {
                  n.x += (targetX - n.x) * 0.06
                  n.y += (targetY - n.y) * 0.06
                }
              })

              const outer = nodes.filter(
                n => n.id !== currentNoteId && !directNeighbors.has(n.id)
              )
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
            const repulsion = settings.repulsion * alpha
            const springLength = settings.linkDistance
            const springStrength = 0.04 * alpha
            const centerPull = settings.centerGravity * alpha
            const damping = 0.85

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

            const len = nodes.length
            for (let i = 0; i < len; i++) {
              const n1 = nodes[i]
              for (let j = i + 1; j < len; j++) {
                const n2 = nodes[j]
                const dx = n2.x - n1.x
                const dy = n2.y - n1.y
                const distSq = dx * dx + dy * dy || 1
                if (distSq < 160000) {
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

            for (const n of nodes) {
              if (draggedNodeRef.current?.id !== n.id) {
                const fc = folderCentroids.get(n.folderShort)
                if (fc && fc.count > 1) {
                  n.vx += (fc.x - n.x) * settings.clusterStrength * alpha
                  n.vy += (fc.y - n.y) * settings.clusterStrength * alpha
                }
                n.vx -= n.x * centerPull
                n.vy -= n.y * centerPull
                n.vx *= damping
                n.vy *= damping
                n.x += n.vx * dt2d
                n.y += n.vy * dt2d
              }
            }
          }

          if (!draggedNodeRef.current) {
            simAlphaRef.current *= 0.988
          }
        }

        // Matte Blueprint Background
        ctx.fillStyle = '#090a0f'
        ctx.fillRect(0, 0, width, height)

        const dotSpacing = 36 * transform.scale
        if (dotSpacing > 14) {
          const offX = centerX % dotSpacing
          const offY = centerY % dotSpacing
          ctx.fillStyle = 'rgba(56, 189, 248, 0.05)'
          for (let x = offX; x < width; x += dotSpacing) {
            for (let y = offY; y < height; y += dotSpacing) {
              ctx.fillRect(x, y, 1, 1)
            }
          }
        }

        ctx.save()
        ctx.translate(centerX, centerY)
        ctx.scale(transform.scale, transform.scale)

        if (layoutMode === 'radar') {
          const rings = [100, 190, 280, 380, 500]
          rings.forEach((r, idx) => {
            ctx.beginPath()
            ctx.arc(0, 0, r, 0, Math.PI * 2)
            ctx.strokeStyle =
              idx === 1 ? 'rgba(245, 176, 65, 0.22)' : 'rgba(255, 255, 255, 0.05)'
            ctx.lineWidth = 1
            ctx.stroke()
          })

          const sweepAngle = radarAngleRef.current
          const sweepGrad = ctx.createRadialGradient(0, 0, 10, 0, 0, 500)
          sweepGrad.addColorStop(0, 'rgba(245, 176, 65, 0.14)')
          sweepGrad.addColorStop(1, 'rgba(245, 176, 65, 0)')
          ctx.beginPath()
          ctx.moveTo(0, 0)
          ctx.arc(0, 0, 500, sweepAngle - 0.35, sweepAngle)
          ctx.closePath()
          ctx.fillStyle = sweepGrad
          ctx.fill()
        }

        for (const edge of edges) {
          const s = nodeMap.get(edge.source)
          const t = nodeMap.get(edge.target)
          if (!s || !t) continue
          const isHighlighted = focalNodeId
            ? edge.source === focalNodeId || edge.target === focalNodeId
            : false

          ctx.save()
          if (hoveredNodeId && !isHighlighted) ctx.globalAlpha = 0.08
          ctx.beginPath()
          if (layoutMode === 'circuit') {
            const midX = (s.x + t.x) / 2
            ctx.moveTo(s.x, s.y)
            ctx.lineTo(midX, s.y)
            ctx.lineTo(midX, t.y)
            ctx.lineTo(t.x, t.y)
            ctx.strokeStyle = isHighlighted ? '#38bdf8' : 'rgba(56, 189, 248, 0.14)'
            ctx.lineWidth = isHighlighted ? 1.8 : 0.9
            ctx.stroke()
          } else {
            ctx.moveTo(s.x, s.y)
            ctx.lineTo(t.x, t.y)
            ctx.strokeStyle = isHighlighted ? s.color : 'rgba(255, 255, 255, 0.1)'
            ctx.lineWidth = isHighlighted ? 1.6 : 0.8
            ctx.stroke()
          }
          ctx.restore()
        }

        for (const node of nodes) {
          node.screenX = centerX + node.x * transform.scale
          node.screenY = centerY + node.y * transform.scale
          node.projectedScale = transform.scale

          const isCurrent = node.id === currentNoteId
          const isHovered = node.id === hoveredNodeId
          const isNeighbor = activeNeighborIds.has(node.id)

          ctx.save()
          if (hoveredNodeId && !isHovered && !isNeighbor) ctx.globalAlpha = 0.12
          const r = node.radius + (isHovered ? 2.5 : 0)

          ctx.beginPath()
          ctx.arc(node.x, node.y, r, 0, Math.PI * 2)
          ctx.fillStyle = '#101118'
          ctx.fill()
          ctx.strokeStyle = isHovered ? '#ffffff' : node.color
          ctx.lineWidth = isCurrent || isHovered ? 1.6 : 1.2
          ctx.stroke()

          ctx.beginPath()
          ctx.arc(node.x, node.y, Math.max(2, r * 0.42), 0, Math.PI * 2)
          ctx.fillStyle = node.color
          ctx.fill()

          if (isHovered || isCurrent || (hoveredNodeId && isNeighbor)) {
            ctx.font = '600 11px "Inter", system-ui, sans-serif'
            ctx.textAlign = 'center'
            ctx.fillStyle = '#ffffff'
            ctx.fillText(node.title, node.x, node.y - r - 10)
          }
          ctx.restore()
        }

        ctx.restore()
      }

      ctx.restore() // End DPI scale
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
    contemplatedNodeId,
    hoveredFolder,
    searchQuery,
    settings,
    layoutMode,
    isPaused,
    isContemplationMode
  ])

  // Screen-space Node Hit Testing (works seamlessly across 3D & 2D projections!)
  const getNodeAtScreenCoords = useCallback(
    (screenX: number, screenY: number): SimNode | null => {
      let closestNode: SimNode | null = null
      let closestDistSq = Infinity

      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i]
        const dx = screenX - node.screenX
        const dy = screenY - node.screenY
        const distSq = dx * dx + dy * dy

        const hitRadius = Math.max(18, node.radius * node.projectedScale + 8)
        if (distSq <= hitRadius * hitRadius) {
          if (distSq < closestDistSq) {
            closestDistSq = distSq
            closestNode = node
          }
        }
      }
      return closestNode
    },
    [nodes]
  )

  // Spawn a Gravitational Wave Ripple in 3D accretion plane
  const spawnRipple = useCallback((nodeOrAngle?: SimNode) => {
    const r = nodeOrAngle ? nodeOrAngle.orbitRadius : 0.45
    const a = nodeOrAngle ? nodeOrAngle.orbitAngle : Math.random() * Math.PI * 2
    ripplesRef.current.push({
      x3d: Math.cos(a) * r,
      z3d: Math.sin(a) * r,
      radius: 0.04,
      maxRadius: 0.65,
      alpha: 0.65,
      color: nodeOrAngle?.color || '#f5b041'
    })
  }, [])

  // Mouse / Pointer Handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = overlayCanvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top

    pointerDownRef.current = { x: e.clientX, y: e.clientY, time: Date.now(), button: e.button }

    // Right-click or Alt+Click tilts the 3D Accretion Disk in real time!
    if (e.button === 2 || e.altKey) {
      isTiltingCameraRef.current = true
      return
    }

    const hit = getNodeAtScreenCoords(sx, sy)
    if (hit) {
      draggedNodeRef.current = hit
      spawnRipple(hit)
      simAlphaRef.current = 0.4
    } else {
      isDraggingCanvasRef.current = true
    }
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = overlayCanvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top

    mouseScreenRef.current = { x: sx, y: sy }

    if (isTiltingCameraRef.current && pointerDownRef.current) {
      const dy = e.clientY - pointerDownRef.current.y
      const dx = e.clientX - pointerDownRef.current.x
      const newTilt = Math.max(0.14, Math.min(1.3, tiltRef.current + dy * 0.004))
      tiltRef.current = newTilt
      rotationRef.current += dx * 0.004
      setSettings(s => ({ ...s, diskTilt: Number(newTilt.toFixed(2)) }))
      pointerDownRef.current = { ...pointerDownRef.current, x: e.clientX, y: e.clientY }
      return
    }

    if (draggedNodeRef.current) {
      const transform = transformRef.current
      const centerX = rect.width / 2 + transform.x
      const centerY = rect.height / 2 + transform.y

      if (layoutMode === 'constellation') {
        const baseUnit = Math.min(rect.width, rect.height) * 0.42 * transform.scale
        const dx = (sx - centerX) / Math.max(1, baseUnit)
        const dy = (centerY - sy) / Math.max(1, baseUnit) / Math.max(0.25, Math.sin(tiltRef.current))
        const newR = Math.max(0.4, Math.min(2.4, Math.hypot(dx, dy) * 2.1))
        const newAngle = Math.atan2(dy, dx)
        draggedNodeRef.current.orbitRadius = newR
        draggedNodeRef.current.orbitAngle = newAngle
      } else {
        draggedNodeRef.current.x = (sx - centerX) / transform.scale
        draggedNodeRef.current.y = (sy - centerY) / transform.scale
        draggedNodeRef.current.vx = 0
        draggedNodeRef.current.vy = 0
        simAlphaRef.current = 0.4
      }
      return
    }

    if (isDraggingCanvasRef.current && pointerDownRef.current) {
      const dx = e.clientX - pointerDownRef.current.x
      const dy = e.clientY - pointerDownRef.current.y
      transformRef.current.x += dx
      transformRef.current.y += dy
      pointerDownRef.current = { ...pointerDownRef.current, x: e.clientX, y: e.clientY }
      return
    }

    const hit = getNodeAtScreenCoords(sx, sy)
    if (hit) {
      setHoveredNodeId(hit.id)
      canvas.style.cursor = 'pointer'
    } else {
      setHoveredNodeId(null)
      canvas.style.cursor = isDraggingCanvasRef.current ? 'grabbing' : 'default'
    }
  }

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = overlayCanvasRef.current
    if (pointerDownRef.current && canvas) {
      const dist = Math.hypot(
        e.clientX - pointerDownRef.current.x,
        e.clientY - pointerDownRef.current.y
      )
      const elapsed = Date.now() - pointerDownRef.current.time

      if (dist < 7 && elapsed < 500 && pointerDownRef.current.button === 0) {
        const rect = canvas.getBoundingClientRect()
        const sx = e.clientX - rect.left
        const sy = e.clientY - rect.top
        const hit = getNodeAtScreenCoords(sx, sy)
        if (hit) {
          spawnRipple(hit)
          onSelectNote(hit.id)
        }
      }
    }

    draggedNodeRef.current = null
    isDraggingCanvasRef.current = false
    isTiltingCameraRef.current = false
    pointerDownRef.current = null
  }

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    const canvas = overlayCanvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const mouseScreenX = e.clientX - rect.left - rect.width / 2
    const mouseScreenY = e.clientY - rect.top - rect.height / 2

    const zoomFactor = e.deltaY < 0 ? 1.14 : 0.88
    const currentScale = transformRef.current.scale
    const newScale = Math.min(3.5, Math.max(0.25, currentScale * zoomFactor))

    transformRef.current.x -= (mouseScreenX - transformRef.current.x) * (newScale / currentScale - 1)
    transformRef.current.y -= (mouseScreenY - transformRef.current.y) * (newScale / currentScale - 1)
    transformRef.current.scale = newScale
  }

  const handleResetCamera = () => {
    transformRef.current = { x: 0, y: 0, scale: 0.92 }
    tiltRef.current = 0.34
    setSettings(s => ({ ...s, diskTilt: 0.34 }))
    simAlphaRef.current = 1.0
  }

  const handleFocusActiveNote = () => {
    if (!currentNoteId) return
    const target = nodes.find(n => n.id === currentNoteId)
    if (!target) return

    const canvas = overlayCanvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()

    const offsetX = target.screenX - (rect.width / 2 + transformRef.current.x)
    const offsetY = target.screenY - (rect.height / 2 + transformRef.current.y)
    transformRef.current = {
      x: -offsetX,
      y: -offsetY,
      scale: Math.max(1.15, transformRef.current.scale)
    }
    spawnRipple(target)
  }

  // Active Hovered / Contemplated Node Data
  const activeInspectNode = useMemo(() => {
    const id = hoveredNodeId || (isContemplationMode ? contemplatedNodeId : null)
    if (!id) return null
    return nodes.find(n => n.id === id) || null
  }, [hoveredNodeId, contemplatedNodeId, isContemplationMode, nodes])

  const activeInspectConnections = useMemo(() => {
    if (!activeInspectNode) return []
    const ids: string[] = []
    edges.forEach(e => {
      if (e.source === activeInspectNode.id) ids.push(e.target)
      if (e.target === activeInspectNode.id) ids.push(e.source)
    })
    return nodes.filter(n => ids.includes(n.id))
  }, [activeInspectNode, edges, nodes])

  const allFolderShorts = useMemo(() => {
    const set = new Set(nodes.map(n => n.folderShort))
    return Array.from(set).sort()
  }, [nodes])

  return (
    <div
      ref={containerRef}
      onContextMenu={e => e.preventDefault()}
      className="relative w-full h-full bg-[#06070b] overflow-hidden flex flex-col select-none"
    >
      {/* 1. TOP HUD CONTROL BAR (Hidden in Contemplation Mode) */}
      {!isContemplationMode && (
        <div className="absolute top-4 left-4 z-20 flex items-center gap-2 bg-[#0c0d16]/85 backdrop-blur-2xl border border-white/[0.09] rounded-2xl p-1.5 shadow-2xl">
          {/* Search */}
          <div className="relative flex items-center">
            <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Filtrar horizonte..."
              className="w-40 pl-8 pr-7 py-1.5 bg-[#121422]/90 border border-white/[0.07] rounded-xl text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-[var(--accent)] font-mono transition-all"
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

          {/* 3 Visualization Engines */}
          <div className="flex items-center bg-[#121422]/90 border border-white/[0.07] rounded-xl p-0.5 text-xs">
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
              title="Singularidade (Gargantua): Buraco negro relativístico em WebGL com órbitas keplerianas 3D"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Singularidade</span>
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
              title="Circuito Neural: Trilhas ortogonais estilo blueprint"
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

          <div className="h-4 w-px bg-white/10" />

          {/* Orbital Time Flow Pause/Resume */}
          {layoutMode === 'constellation' && (
            <button
              onClick={() => setIsPaused(p => !p)}
              className={`p-1.5 rounded-xl transition-all cursor-pointer ${
                isPaused
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5'
              }`}
              title={isPaused ? 'Retomar rotação orbital' : 'Congelar o tempo (Dilatação Temporal)'}
            >
              {isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
            </button>
          )}

          {/* Contemplation / Screensaver Zen Mode */}
          {layoutMode === 'constellation' && (
            <button
              onClick={() => setIsContemplationMode(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium text-amber-200/90 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 transition-all cursor-pointer"
              title="Modo Contemplação: Oculta os menus e navega suavemente pelas conexões do seu universo"
            >
              <Eye className="w-3.5 h-3.5 text-amber-400" />
              <span>Contemplar</span>
            </button>
          )}

          {/* Local vs Global Toggle */}
          <button
            onClick={() => setIsLocalMode(m => !m)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              isLocalMode
                ? 'bg-[var(--accent)] text-zinc-950 shadow-md'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5'
            }`}
            title="Alternar entre Galáxia Completa e Órbita Local"
          >
            <Focus className="w-3.5 h-3.5" />
            <span>{isLocalMode ? 'Foco Local' : 'Global'}</span>
          </button>

          {/* Settings Drawer Button */}
          <button
            onClick={() => setShowSettingsDrawer(d => !d)}
            className={`p-1.5 rounded-xl transition-all cursor-pointer ${
              showSettingsDrawer
                ? 'bg-[var(--accent)] text-zinc-950 font-bold'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5'
            }`}
            title="Parâmetros Relativísticos e Órbitas"
          >
            <Sliders className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* CONTEMPLATION MODE FLOATING EXIT PILL */}
      {isContemplationMode && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 bg-[#0b0c14]/75 backdrop-blur-2xl border border-white/15 rounded-full px-4 py-2 text-xs text-zinc-300 shadow-2xl animate-in fade-in duration-300">
          <Sparkles className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
          <span className="font-mono text-[11px] tracking-wide">
            MODO CONTEMPLAÇÃO ATIVO — DILAÇÃO TEMPORAL AUTOMÁTICA
          </span>
          <button
            onClick={() => setIsContemplationMode(false)}
            className="px-2.5 py-0.5 rounded-full bg-white/10 hover:bg-white/20 text-white font-semibold transition-colors cursor-pointer"
          >
            Sair (ESC)
          </button>
        </div>
      )}

      {/* 2. TOP-RIGHT CELESTIAL INSPECTOR HUD CARD */}
      {activeInspectNode && (
        <div className="absolute top-4 right-4 z-20 w-84 bg-[#0b0d16]/90 backdrop-blur-2xl border border-white/[0.12] rounded-2xl p-4 shadow-2xl space-y-3 text-xs animate-in fade-in zoom-in-95 duration-150 select-none">
          <div className="flex items-start justify-between gap-2 border-b border-white/[0.08] pb-2.5">
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-[9px] font-mono uppercase tracking-wider text-zinc-400">
                <span
                  className="w-2 h-2 rounded-full inline-block"
                  style={{ backgroundColor: activeInspectNode.color }}
                />
                <span>BRAÇO ESPIRAL // {activeInspectNode.folderShort}</span>
              </div>
              <h3 className="text-sm font-bold text-zinc-100 leading-snug">
                {activeInspectNode.title}
              </h3>
            </div>
            <button
              onClick={() => onSelectNote(activeInspectNode.id)}
              className="p-1.5 rounded-lg bg-[var(--accent)]/15 hover:bg-[var(--accent)] text-[var(--accent)] hover:text-zinc-950 transition-all cursor-pointer shadow-sm"
              title="Abrir nota no editor"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          </div>

          {activeInspectNode.excerpt && (
            <p className="text-[11px] text-zinc-300/90 leading-relaxed font-normal">
              {activeInspectNode.excerpt}
            </p>
          )}

          {activeInspectConnections.length > 0 && (
            <div className="space-y-1 pt-1">
              <span className="text-[10px] text-zinc-500 font-mono">
                SINAPSES GRAVITACIONAIS ({activeInspectConnections.length}):
              </span>
              <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto pt-0.5">
                {activeInspectConnections.map(c => (
                  <button
                    key={c.id}
                    onClick={() => onSelectNote(c.id)}
                    className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/[0.04] hover:bg-white/[0.1] border border-white/[0.08] text-[10px] text-zinc-200 transition-colors cursor-pointer"
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ backgroundColor: c.color }}
                    />
                    <span className="truncate max-w-[130px]">{c.title}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between pt-1 border-t border-white/[0.08] text-[10px] text-zinc-400 font-mono">
            <span>ÓRBITA: {activeInspectNode.orbitRadius.toFixed(2)} Rs</span>
            <button
              onClick={() => onSelectNote(activeInspectNode.id)}
              className="text-[var(--accent)] font-semibold flex items-center gap-1 hover:underline cursor-pointer"
            >
              MERGULHAR NA NOTA <ArrowRight className="w-2.5 h-2.5" />
            </button>
          </div>
        </div>
      )}

      {/* 3. RELATIVISTIC SETTINGS DRAWER */}
      {showSettingsDrawer && !isContemplationMode && (
        <div className="absolute top-18 left-4 z-30 w-76 bg-[#0b0d16]/95 backdrop-blur-2xl border border-white/[0.12] rounded-2xl p-4 shadow-2xl space-y-3.5 text-xs text-zinc-300 animate-in fade-in zoom-in-95 duration-150">
          <div className="flex items-center justify-between border-b border-white/[0.08] pb-2">
            <span className="font-bold text-zinc-100 flex items-center gap-1.5 font-mono text-[11px]">
              <Compass className="w-3.5 h-3.5 text-[var(--accent)]" />
              ASTROFÍSICA DA SINGULARIDADE
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
              <span>VELOCIDADE ORBITAL</span>
              <span>{settings.orbitalSpeed.toFixed(1)}x</span>
            </div>
            <input
              type="range"
              min="0"
              max="3.0"
              step="0.1"
              value={settings.orbitalSpeed}
              onChange={e =>
                setSettings(s => ({ ...s, orbitalSpeed: Number(e.target.value) }))
              }
              className="w-full accent-[var(--accent)] cursor-pointer"
            />
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-[11px] text-zinc-400 font-mono">
              <span>INCLINAÇÃO DO DISCO (3D)</span>
              <span>{Math.round((settings.diskTilt / 1.57) * 90)}°</span>
            </div>
            <input
              type="range"
              min="0.15"
              max="1.25"
              step="0.02"
              value={settings.diskTilt}
              onChange={e =>
                setSettings(s => ({ ...s, diskTilt: Number(e.target.value) }))
              }
              className="w-full accent-[var(--accent)] cursor-pointer"
            />
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-[11px] text-zinc-400 font-mono">
              <span>LUMINOSIDADE DO PLASMA</span>
              <span>{Math.round(settings.accretionIntensity * 100)}%</span>
            </div>
            <input
              type="range"
              min="0.4"
              max="1.8"
              step="0.05"
              value={settings.accretionIntensity}
              onChange={e =>
                setSettings(s => ({ ...s, accretionIntensity: Number(e.target.value) }))
              }
              className="w-full accent-[var(--accent)] cursor-pointer"
            />
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-[11px] text-zinc-400 font-mono">
              <span>ESCALA DAS ESTRELAS (NÓS)</span>
              <span>{settings.nodeSize.toFixed(1)}x</span>
            </div>
            <input
              type="range"
              min="0.6"
              max="1.8"
              step="0.1"
              value={settings.nodeSize}
              onChange={e =>
                setSettings(s => ({ ...s, nodeSize: Number(e.target.value) }))
              }
              className="w-full accent-[var(--accent)] cursor-pointer"
            />
          </div>

          <div className="pt-2 border-t border-white/[0.08] space-y-2">
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-[11px]">Rastros Cometares de Órbita</span>
              <input
                type="checkbox"
                checked={settings.enableTrails}
                onChange={e =>
                  setSettings(s => ({ ...s, enableTrails: e.target.checked }))
                }
                className="accent-[var(--accent)] rounded cursor-pointer"
              />
            </label>

            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-[11px]">Fótons Quânticos nas Ligações</span>
              <input
                type="checkbox"
                checked={settings.enablePulses}
                onChange={e =>
                  setSettings(s => ({ ...s, enablePulses: e.target.checked }))
                }
                className="accent-[var(--accent)] rounded cursor-pointer"
              />
            </label>

            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-[11px]">Filamentos do Horizonte de Eventos</span>
              <input
                type="checkbox"
                checked={settings.enableSingularityTethers}
                onChange={e =>
                  setSettings(s => ({ ...s, enableSingularityTethers: e.target.checked }))
                }
                className="accent-[var(--accent)] rounded cursor-pointer"
              />
            </label>
          </div>

          <div className="pt-1 text-[10px] text-zinc-500 font-mono leading-relaxed">
            💡 Dica: Segure <span className="text-zinc-300">Botão Direito</span> ou{' '}
            <span className="text-zinc-300">Alt + Arrastar</span> para inclinar a galáxia em 3D!
          </div>
        </div>
      )}

      {/* 4. BOTTOM GALACTIC SPIRAL ARMS FILTER BAR */}
      {!isContemplationMode && (
        <div className="absolute bottom-5 left-5 z-20 bg-[#0b0d16]/85 backdrop-blur-2xl border border-white/[0.09] rounded-2xl px-3.5 py-2 text-xs text-zinc-400 flex items-center gap-3 shadow-2xl">
          <div className="flex items-center gap-1.5 font-bold text-zinc-200 font-mono text-[11px]">
            <Layers className="w-3.5 h-3.5 text-[var(--accent)]" />
            <span>{nodes.length} ASTROS</span>
          </div>
          <span className="text-zinc-700">•</span>
          <span className="font-mono text-[11px]">{edges.length} SINAPSES</span>
          <span className="text-zinc-700">•</span>

          <div className="flex items-center gap-1.5">
            {allFolderShorts.slice(0, 6).map(fShort => {
              const color = folderColorMap.get(fShort) || '#f5b041'
              const isHovered = hoveredFolder === fShort
              return (
                <button
                  key={fShort}
                  type="button"
                  onClick={() =>
                    setHoveredFolder(prev => (prev === fShort ? null : fShort))
                  }
                  onMouseEnter={() => setHoveredFolder(fShort)}
                  onMouseLeave={() => setHoveredFolder(null)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-mono transition-all cursor-pointer ${
                    isHovered
                      ? 'bg-white/15 text-zinc-100 scale-105 border border-white/25'
                      : 'bg-[#121422]/90 text-zinc-400 hover:text-zinc-200 border border-white/[0.06]'
                  }`}
                  title={`Iluminar braço espiral: ${fShort}`}
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
      )}

      {/* 5. FLOATING CAMERA & ZOOM CONTROLS */}
      {!isContemplationMode && (
        <div className="absolute bottom-5 right-5 z-20 flex flex-col gap-1.5 bg-[#0b0d16]/85 backdrop-blur-2xl border border-white/[0.09] rounded-2xl p-1.5 shadow-2xl">
          <button
            onClick={() => {
              transformRef.current.scale = Math.min(3.5, transformRef.current.scale * 1.28)
            }}
            className="p-2 text-zinc-400 hover:text-zinc-100 hover:bg-white/10 rounded-xl transition-all cursor-pointer"
            title="Aproximar do Horizonte de Eventos (+)"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={() => {
              transformRef.current.scale = Math.max(0.25, transformRef.current.scale * 0.78)
            }}
            className="p-2 text-zinc-400 hover:text-zinc-100 hover:bg-white/10 rounded-xl transition-all cursor-pointer"
            title="Afastar para o Halo Galáctico (-)"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            onClick={handleFocusActiveNote}
            className="p-2 text-zinc-400 hover:text-[var(--accent)] hover:bg-white/10 rounded-xl transition-all cursor-pointer"
            title="Localizar Nota Ativa na Órbita"
          >
            <Focus className="w-4 h-4" />
          </button>
          <button
            onClick={handleResetCamera}
            className="p-2 text-zinc-400 hover:text-zinc-100 hover:bg-white/10 rounded-xl transition-all cursor-pointer"
            title="Restaurar Horizonte de Gargantua"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 6. LAYER 1: HARDWARE-ACCELERATED WEBGL GARGANTUA SHADER CANVAS */}
      <canvas
        ref={webglCanvasRef}
        className={`absolute inset-0 w-full h-full pointer-events-none transition-opacity duration-500 ${
          layoutMode === 'constellation' ? 'opacity-100' : 'opacity-0'
        }`}
      />

      {/* 7. LAYER 2: 3D KEPLERIAN ORBITAL & INTERACTIVE SYNAPTIC VECTOR CANVAS */}
      <canvas
        ref={overlayCanvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
        className="relative z-10 w-full h-full cursor-default outline-none bg-transparent"
      />
    </div>
  )
}
