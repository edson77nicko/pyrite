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

interface StellarTint {
  name: string
  hex: string
  rgb: [number, number, number] // 0..255 for canvas rgba()
}

// Authentic Hubble / Planckian Blackbody Starlight Palette (NO cartoon neon green/pink!)
const STELLAR_PALETTE: StellarTint[] = [
  { name: 'Ouro Solar', hex: '#ffd699', rgb: [255, 214, 153] },      // G/K Warm Gold
  { name: 'Sirius Azul', hex: '#b8d8ff', rgb: [184, 216, 255] },     // O/B Blue-White Star
  { name: 'Marfim Estelar', hex: '#fff2d9', rgb: [255, 242, 217] },  // F-Type Ivory Star
  { name: 'Âmbar Antares', hex: '#ffb070', rgb: [255, 176, 112] },   // K-Giant Warm Amber
  { name: 'Vega Cristal', hex: '#dcebff', rgb: [220, 235, 255] },    // A-Type Ice White
  { name: 'Cobre Cósmico', hex: '#ff9e75', rgb: [255, 158, 117] },   // M-Type Red-Gold
  { name: 'Nebulosa Pálida', hex: '#ffd1dc', rgb: [255, 209, 220] }, // Carina Warm Rose-White
  { name: 'Platina Celeste', hex: '#e8eef5', rgb: [232, 238, 245] }  // White Dwarf Silver
]

interface SimNode {
  id: string
  title: string
  folder: string
  folderShort: string
  tags: string[]
  connections: number
  excerpt: string
  // 2D coordinates (for Circuit / Radar modes)
  x: number
  y: number
  vx: number
  vy: number
  // 3D Keplerian Orbital coordinates around the Singularity
  orbitRadius: number
  orbitAngle: number
  orbitSpeed: number
  orbitElevation: number
  orbitPhase: number
  twinkleSeed: number
  // Cached 3D projection for current frame
  screenX: number
  screenY: number
  depthZ: number
  behindHorizon: boolean
  projectedScale: number
  radius: number
  color: string
  rgb: [number, number, number]
}

interface AccretionSpark {
  radius: number
  angle: number
  speed: number
  yOffset: number
  size: number
  alpha: number
  rgb: [number, number, number]
}

interface SpacetimeRipple {
  x3d: number
  z3d: number
  radius: number
  maxRadius: number
  alpha: number
  rgb: [number, number, number]
}

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
  return [0.92, 0.65, 0.25]
}

// Draw a realistic Hubble Space Telescope Optical Star (pure additive light, PSF halo + 4-point diffraction spikes)
function drawHubbleStar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  coreRadius: number,
  rgb: [number, number, number],
  alpha: number,
  options: {
    hasSpikes: boolean
    spikeLength: number
    isFocused: boolean
    isCurrent: boolean
  }
) {
  const [r, g, b] = rgb

  // 1. Radiant Optical Point-Spread Function (PSF) Corona (Hubble starlight atmospheric glow)
  const haloMultiplier = options.isFocused ? 5.2 : 3.8
  const haloRadius = Math.max(coreRadius * haloMultiplier, coreRadius + 4.5)
  const corona = ctx.createRadialGradient(x, y, 0, x, y, haloRadius)
  corona.addColorStop(0, `rgba(255, 255, 255, ${Math.min(1, alpha * 0.95)})`)
  corona.addColorStop(0.18, `rgba(${Math.min(255, r + 45)}, ${Math.min(255, g + 45)}, ${Math.min(255, b + 45)}, ${Math.min(1, alpha * 0.72)})`)
  corona.addColorStop(0.42, `rgba(${r}, ${g}, ${b}, ${Math.min(1, alpha * 0.38)})`)
  corona.addColorStop(0.72, `rgba(${r}, ${g}, ${b}, ${Math.min(1, alpha * 0.12)})`)
  corona.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`)

  ctx.fillStyle = corona
  ctx.beginPath()
  ctx.arc(x, y, haloRadius, 0, Math.PI * 2)
  ctx.fill()

  // 2. Hubble Secondary-Mirror 4-Point Diffraction Spikes (+)
  if (options.hasSpikes) {
    const sLen = Math.max(options.spikeLength, coreRadius * 2.8)
    const spikeAlpha = Math.min(1, alpha * (options.isFocused ? 0.90 : 0.60))

    // Horizontal spike
    const gradH = ctx.createLinearGradient(x - sLen, y, x + sLen, y)
    gradH.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0)`)
    gradH.addColorStop(0.38, `rgba(${r}, ${g}, ${b}, ${spikeAlpha * 0.45})`)
    gradH.addColorStop(0.5, `rgba(255, 255, 255, ${spikeAlpha})`)
    gradH.addColorStop(0.62, `rgba(${r}, ${g}, ${b}, ${spikeAlpha * 0.45})`)
    gradH.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`)

    ctx.strokeStyle = gradH
    ctx.lineWidth = options.isFocused ? 1.1 : 0.75
    ctx.beginPath()
    ctx.moveTo(x - sLen, y)
    ctx.lineTo(x + sLen, y)
    ctx.stroke()

    // Vertical spike
    const gradV = ctx.createLinearGradient(x, y - sLen, x, y + sLen)
    gradV.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0)`)
    gradV.addColorStop(0.38, `rgba(${r}, ${g}, ${b}, ${spikeAlpha * 0.45})`)
    gradV.addColorStop(0.5, `rgba(255, 255, 255, ${spikeAlpha})`)
    gradV.addColorStop(0.62, `rgba(${r}, ${g}, ${b}, ${spikeAlpha * 0.45})`)
    gradV.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`)

    ctx.strokeStyle = gradV
    ctx.lineWidth = options.isFocused ? 1.1 : 0.75
    ctx.beginPath()
    ctx.moveTo(x, y - sLen)
    ctx.lineTo(x, y + sLen)
    ctx.stroke()

    // Subtle 45-degree JWST/Hubble secondary micro-glint for active star
    if (options.isFocused) {
      const diagLen = sLen * 0.38
      ctx.strokeStyle = `rgba(255, 248, 230, ${spikeAlpha * 0.35})`
      ctx.lineWidth = 0.6
      ctx.beginPath()
      ctx.moveTo(x - diagLen, y - diagLen)
      ctx.lineTo(x + diagLen, y + diagLen)
      ctx.moveTo(x - diagLen, y + diagLen)
      ctx.lineTo(x + diagLen, y - diagLen)
      ctx.stroke()
    }
  }

  // 3. Chromatic Stellar Disc (Shows the star's radiant hue around the core)
  ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${Math.min(1, alpha * 0.88)})`
  ctx.beginPath()
  ctx.arc(x, y, Math.max(1.1, coreRadius * 0.78), 0, Math.PI * 2)
  ctx.fill()

  // 4. Incandescent White-Hot Pinpoint Star Center
  ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(1, alpha)})`
  ctx.beginPath()
  ctx.arc(x, y, Math.max(0.7, coreRadius * 0.36), 0, Math.PI * 2)
  ctx.fill()
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

  // State
  const [nodes, setNodes] = useState<SimNode[]>([])
  const [edges, setEdges] = useState<LinkEdge[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [pinnedPopoverNodeId, setPinnedPopoverNodeId] = useState<string | null>(null)
  const [hoveredFolder, setHoveredFolder] = useState<string | null>(null)
  const [isLocalMode, setIsLocalMode] = useState(false)
  const [showSettingsDrawer, setShowSettingsDrawer] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [isContemplationMode, setIsContemplationMode] = useState(false)
  const [contemplatedNodeId, setContemplatedNodeId] = useState<string | null>(null)

  const [settings, setSettings] = useState<GraphSettings & {
    orbitalSpeed: number
    diskTilt: number
    accretionIntensity: number
    enableTrails: boolean
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
    diskTilt: 0.34,
    accretionIntensity: 1.05,
    enableTrails: true,
    clusterStrength: 0.05
  })

  // Camera & Physics Refs
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

  const sparksRef = useRef<AccretionSpark[]>([])
  const ripplesRef = useRef<SpacetimeRipple[]>([])

  useEffect(() => {
    tiltRef.current = settings.diskTilt
  }, [settings.diskTilt])

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
      const connected = nodes.filter(n => n.connections > 0)
      const pool = connected.length > 0 ? connected : nodes
      const chosen = pool[Math.floor(Math.random() * pool.length)]
      if (chosen) setContemplatedNodeId(chosen.id)
    }

    pickSpotlight()
    const timer = setInterval(pickSpotlight, 5500)
    return () => clearInterval(timer)
  }, [isContemplationMode, nodes])

  // Map folders to subtle Planckian star temperatures
  const folderTintMap = useMemo(() => {
    const folders = Array.from(new Set(notes.map(n => {
      const parts = (n.folder || 'Início').replace(/\\/g, '/').split('/')
      return parts[parts.length - 1] || 'Início'
    }))).sort()

    const map = new Map<string, StellarTint>()
    folders.forEach((f, idx) => {
      map.set(f, STELLAR_PALETTE[idx % STELLAR_PALETTE.length])
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

  // Initialize Fine Accretion Micro-Starlight Dust Particles
  useEffect(() => {
    const sparks: AccretionSpark[] = []
    for (let i = 0; i < 420; i++) {
      const u = Math.random()
      const radius = 0.36 + Math.pow(u, 1.45) * 2.05
      const angle = Math.random() * Math.PI * 2
      const speed = (0.30 + Math.random() * 0.12) / Math.pow(radius, 1.15)
      const tint = STELLAR_PALETTE[i % STELLAR_PALETTE.length]
      sparks.push({
        radius,
        angle,
        speed,
        yOffset: (Math.random() - 0.5) * 0.032 * radius,
        size: 0.5 + Math.random() * 1.1,
        alpha: 0.18 + Math.random() * 0.52,
        rgb: tint.rgb
      })
    }
    sparksRef.current = sparks
  }, [])

  // Initialize Notes as Orbiting Stars in Keplerian Spiral Streams
  useEffect(() => {
    setEdges(filteredEdges)

    const degreeMap = new Map<string, number>()
    for (const e of filteredEdges) {
      degreeMap.set(e.source, (degreeMap.get(e.source) || 0) + 1)
      degreeMap.set(e.target, (degreeMap.get(e.target) || 0) + 1)
    }

    setNodes(prev => {
      const existing = new Map(prev.map(n => [n.id, n]))

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
        group.sort((a, b) => (degreeMap.get(b.id) || 0) - (degreeMap.get(a.id) || 0))

        const armBaseAngle = (fIdx / numFolders) * Math.PI * 2
        const tint = folderTintMap.get(folderShort) || STELLAR_PALETTE[0]

        group.forEach((note, idxInFolder) => {
          const found = existing.get(note.id)
          const connections = degreeMap.get(note.id) || 0

          const t = group.length > 1 ? idxInFolder / (group.length - 1) : 0.35
          const hubPull = Math.min(0.28, connections * 0.04)
          const jitterR = (((idxInFolder * 37) % 100) / 100) * 0.11
          const orbitRadius = Math.max(
            0.40,
            Math.min(2.30, 0.46 + Math.pow(t, 0.82) * 1.72 - hubPull + jitterR)
          )

          const spiralWind = Math.log(orbitRadius * 2.5) * 1.75
          const goldenSpread = idxInFolder * 2.39996 * 0.22
          const orbitAngle = found?.orbitAngle ?? armBaseAngle + spiralWind + goldenSpread
          const orbitSpeed = 0.17 / Math.pow(orbitRadius, 1.05)

          const orbitElevation = ((idxInFolder % 7) - 3) * 0.011 * orbitRadius
          const orbitPhase = (idxInFolder * 1.7) % (Math.PI * 2)

          // Radiant star core radius (authentic celestial proportions: 1.8px to 4.6px)
          const radius = Math.max(1.8, Math.min(4.6, 1.8 + Math.sqrt(connections) * 0.72))

          const rawText = note.content
            .replace(/[#*`>~\[\]\(\)-]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
          const excerpt = rawText.slice(0, 140) + (rawText.length > 140 ? '...' : '')

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
            x: found?.x ?? fCenterX + Math.cos(subAngle) * subDist,
            y: found?.y ?? fCenterY + Math.sin(subAngle) * subDist,
            vx: found?.vx ?? 0,
            vy: found?.vy ?? 0,
            orbitRadius: found?.orbitRadius ?? orbitRadius,
            orbitAngle,
            orbitSpeed,
            orbitElevation,
            orbitPhase,
            twinkleSeed: (idxInFolder * 19.37 + fIdx * 7.1) % 100,
            screenX: 0,
            screenY: 0,
            depthZ: 1,
            behindHorizon: false,
            projectedScale: 1,
            radius,
            color: tint.hex,
            rgb: tint.rgb
          })
        })
      })

      return result
    })

    simAlphaRef.current = 1.0
  }, [filteredNotes, filteredEdges, folderTintMap])

  // Initialize WebGL Black Hole Renderer
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
    if (rect.width === 0 || rect.height === 0) return
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

  // MAIN 60FPS RENDERING & KEPLERIAN ORBIT LOOP
  useEffect(() => {
    const overlay = overlayCanvasRef.current
    if (!overlay) return
    const ctx = overlay.getContext('2d')
    if (!ctx) return

    let lastTime = performance.now()

    // Exact 3D Camera Projection matching BlackHoleShader.ts
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

      const relX = x3d
      const relY = y3d - sinT * camDist
      const relZ = z3d + cosT * camDist

      const forwardZ = relY * -sinT + relZ * cosT
      const safeDepth = Math.max(0.4, forwardZ)

      let projX = (relX / safeDepth) * 1.65
      let projY = ((relY * cosT + relZ * sinT) / safeDepth) * 1.65

      // Relativistic Einstein Ring gravitational lensing when passing behind the black hole (z3d > 0)
      const r3d = Math.hypot(x3d, y3d, z3d)
      const behindHorizon = z3d > 0.02
      if (behindHorizon) {
        const screenRad = Math.hypot(projX, projY) + 0.0001
        const einsteinDeflection = 0.042 / (screenRad + 0.14)
        const bendFactor = Math.min(1.0, z3d / (r3d + 0.1))
        projX += (projX / screenRad) * einsteinDeflection * bendFactor
        projY += (projY / screenRad) * einsteinDeflection * bendFactor
      }

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
      if (width === 0 || height === 0) {
        animationFrameRef.current = requestAnimationFrame(render)
        return
      }
      const dpr = window.devicePixelRatio || 1

      // Gravitational Time Dilation: smoothly freeze orbital motion when hovering a star
      const targetTimeScale = isPaused
        ? 0.0
        : hoveredNodeId
        ? 0.03
        : settings.orbitalSpeed

      timeScaleRef.current += (targetTimeScale - timeScaleRef.current) * 0.1
      const effectiveDt = rawDt * timeScaleRef.current
      simTimeRef.current += effectiveDt

      if (isContemplationMode && !isDraggingCanvasRef.current && !isTiltingCameraRef.current) {
        const t = currentTime * 0.00022
        tiltRef.current = 0.31 + Math.sin(t) * 0.1
        transformRef.current.scale = 0.95 + Math.cos(t * 0.7) * 0.1
      }

      const transform = transformRef.current
      const centerX = width / 2 + transform.x
      const centerY = height / 2 + transform.y
      const baseUnit = Math.min(width, height) * 0.42 * transform.scale
      const currentTilt = tiltRef.current

      const computedAccent =
        getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#d4a338'
      const accentRgb = hexToNormalizedRgb(computedAccent)

      // 1. RENDER WEBGL GARGANTUA SHADER
      if (bhRendererRef.current) {
        rotationRef.current = (rotationRef.current + effectiveDt * 0.16) % (Math.PI * 2)
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

      const focalNodeId =
        pinnedPopoverNodeId ||
        hoveredNodeId ||
        selectedNodeId ||
        (isContemplationMode ? contemplatedNodeId : null)

      const activeNeighborIds = new Set<string>()
      if (focalNodeId) {
        activeNeighborIds.add(focalNodeId)
        for (const e of edges) {
          if (e.source === focalNodeId) activeNeighborIds.add(e.target)
          if (e.target === focalNodeId) activeNeighborIds.add(e.source)
        }
      }

      // =========================================================================
      // SINGULARITY / HUBBLE ASTROPHOTOGRAPHY (Pure Additive Starlight)
      // =========================================================================
      if (!bhRendererRef.current) {
          ctx.fillStyle = '#010103'
          ctx.fillRect(0, 0, width, height)
        }

        const nodeMap = new Map<string, SimNode>()
        const shadowScreenRadius = baseUnit * 0.145

        // Update 3D Keplerian Orbital Positions
        for (const n of nodes) {
          if (draggedNodeRef.current?.id !== n.id) {
            n.orbitAngle = (n.orbitAngle + n.orbitSpeed * effectiveDt) % (Math.PI * 2)
          }

          const x3d = Math.cos(n.orbitAngle) * n.orbitRadius
          const z3d = Math.sin(n.orbitAngle) * n.orbitRadius
          const y3d =
            n.orbitElevation +
            Math.sin(simTimeRef.current * 1.2 + n.orbitPhase) * 0.009 * n.orbitRadius

          const proj = project3D(x3d, y3d, z3d, centerX, centerY, baseUnit, currentTilt)
          n.screenX = proj.screenX
          n.screenY = proj.screenY
          n.depthZ = proj.depthZ
          n.behindHorizon = proj.behindHorizon
          n.projectedScale = proj.projectedScale

          nodeMap.set(n.id, n)
        }

        // Enable Pure Additive Blending so stars & filaments emit light like a Hubble exposure!
        ctx.save()
        ctx.globalCompositeOperation = 'lighter'

        // Render Subtle Spacetime Ripples
        for (let i = ripplesRef.current.length - 1; i >= 0; i--) {
          const rip = ripplesRef.current[i]
          rip.radius += rawDt * 0.45
          rip.alpha *= 0.94
          if (rip.alpha < 0.015 || rip.radius > rip.maxRadius) {
            ripplesRef.current.splice(i, 1)
            continue
          }

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
          const [rr, rg, rb] = rip.rgb
          ctx.strokeStyle = `rgba(${rr}, ${rg}, ${rb}, ${rip.alpha * 0.45})`
          ctx.lineWidth = 1.0
          ctx.stroke()
        }

        // Render Fine Accretion Micro-Starlight Dust Particles
        for (const sp of sparksRef.current) {
          sp.angle = (sp.angle + sp.speed * effectiveDt) % (Math.PI * 2)
          const sx = Math.cos(sp.angle) * sp.radius
          const sz = Math.sin(sp.angle) * sp.radius
          const proj = project3D(sx, sp.yOffset, sz, centerX, centerY, baseUnit, currentTilt)

          // Occlude particles passing directly behind the pitch-black Event Horizon shadow
          const distFromCenter = Math.hypot(proj.screenX - centerX, proj.screenY - centerY)
          if (proj.behindHorizon && distFromCenter < shadowScreenRadius) continue

          const [sr, sg, sb] = sp.rgb
          const a = sp.alpha * (proj.behindHorizon ? 0.35 : 0.65)
          const size = Math.max(0.5, sp.size * proj.projectedScale * 0.55)

          ctx.fillStyle = `rgba(${sr}, ${sg}, ${sb}, ${a})`
          ctx.beginPath()
          ctx.arc(proj.screenX, proj.screenY, size, 0, Math.PI * 2)
          ctx.fill()
        }

        // Render Gossamer Geodesic Synaptic Filaments (Connections between stars)
        for (const edge of edges) {
          const s = nodeMap.get(edge.source)
          const t = nodeMap.get(edge.target)
          if (!s || !t) continue

          const isHighlighted = focalNodeId
            ? edge.source === focalNodeId || edge.target === focalNodeId
            : false

          const isDimmed = hoveredNodeId
            ? !isHighlighted
            : hoveredFolder && s.folderShort !== hoveredFolder && t.folderShort !== hoveredFolder

          if (isDimmed && !isHighlighted) continue

          const sx3 = Math.cos(s.orbitAngle) * s.orbitRadius
          const sz3 = Math.sin(s.orbitAngle) * s.orbitRadius
          const tx3 = Math.cos(t.orbitAngle) * t.orbitRadius
          const tz3 = Math.sin(t.orbitAngle) * t.orbitRadius

          const midX3 = (sx3 + tx3) * 0.44
          const midZ3 = (sz3 + tz3) * 0.44
          const midY3 = (s.orbitElevation + t.orbitElevation) * 0.5 + (isHighlighted ? 0.08 : 0.03)

          const midProj = project3D(midX3, midY3, midZ3, centerX, centerY, baseUnit, currentTilt)

          ctx.beginPath()
          ctx.moveTo(s.screenX, s.screenY)
          ctx.quadraticCurveTo(midProj.screenX, midProj.screenY, t.screenX, t.screenY)

          if (isHighlighted) {
            const [sr, sg, sb] = s.rgb
            const [tr, tg, tb] = t.rgb
            const grad = ctx.createLinearGradient(s.screenX, s.screenY, t.screenX, t.screenY)
            grad.addColorStop(0, `rgba(${sr}, ${sg}, ${sb}, 0.75)`)
            grad.addColorStop(0.5, 'rgba(255, 250, 240, 0.85)')
            grad.addColorStop(1, `rgba(${tr}, ${tg}, ${tb}, 0.75)`)
            ctx.strokeStyle = grad
            ctx.lineWidth = 1.15
          } else {
            const [sr, sg, sb] = s.rgb
            ctx.strokeStyle = `rgba(${sr}, ${sg}, ${sb}, 0.055)`
            ctx.lineWidth = 0.55
          }
          ctx.stroke()
        }

        // Depth-sort stars back-to-front
        const sortedNodes = [...nodes].sort((a, b) => b.depthZ - a.depthZ)

        // Render Notes as Authentic Hubble Stars & Accretion Particles
        for (const node of sortedNodes) {
          // If a star is directly behind the pitch-black Event Horizon shadow, occlude it naturally
          const distFromBhCenter = Math.hypot(node.screenX - centerX, node.screenY - centerY)
          if (node.behindHorizon && distFromBhCenter < shadowScreenRadius * 0.92) continue

          const isFocal = node.id === focalNodeId
          const isNeighbor = focalNodeId ? activeNeighborIds.has(node.id) : false
          const isFolderMatch = hoveredFolder ? node.folderShort === hoveredFolder : true
          const isSearchMatch = searchQuery
            ? node.title.toLowerCase().includes(searchQuery.toLowerCase())
            : false

          const twinkle =
            0.86 + 0.14 * Math.sin(currentTime * 0.0035 + node.twinkleSeed)

          let starAlpha = twinkle
          if (searchQuery) {
            starAlpha = isSearchMatch ? 1.0 : 0.1
          } else if (hoveredFolder) {
            starAlpha = isFolderMatch ? 1.0 : 0.12
          } else if (focalNodeId) {
            starAlpha = isFocal || isNeighbor ? 1.0 : 0.18
          } else if (node.behindHorizon) {
            starAlpha = 0.65 * twinkle
          }

          const [nr, ng, nb] = node.rgb

          // 1. Delicate Relativistic Orbital Streak (Subtle light wake along the ellipse)
          if (settings.enableTrails && !isPaused && starAlpha > 0.2) {
            const steps = isFocal ? 8 : 4
            const arcSpan = (isFocal ? 0.18 : 0.08) * Math.min(1.4, settings.orbitalSpeed)

            ctx.beginPath()
            for (let s = 0; s <= steps; s++) {
              const frac = s / steps
              const pastAngle = node.orbitAngle - frac * arcSpan
              const tx = Math.cos(pastAngle) * node.orbitRadius
              const tz = Math.sin(pastAngle) * node.orbitRadius
              const ty =
                node.orbitElevation +
                Math.sin(simTimeRef.current * 1.2 + node.orbitPhase) * 0.009 * node.orbitRadius
              const tp = project3D(tx, ty, tz, centerX, centerY, baseUnit, currentTilt)
              if (s === 0) ctx.moveTo(tp.screenX, tp.screenY)
              else ctx.lineTo(tp.screenX, tp.screenY)
            }
            ctx.strokeStyle = `rgba(${nr}, ${ng}, ${nb}, ${
              starAlpha * (isFocal ? 0.38 : 0.14)
            })`
            ctx.lineWidth = isFocal ? 1.1 : 0.6
            ctx.lineCap = 'round'
            ctx.stroke()
          }

          // 2. Render Hubble Optical Star (NO black circles, NO cartoon borders!)
          const coreR =
            node.radius *
            node.projectedScale *
            settings.nodeSize *
            (isFocal ? 1.35 : 1.0)

          const isFocalStar = isFocal || isNeighbor
          const hasSpikes =
            isFocalStar ||
            (focalNodeId === null && node.connections >= 1) ||
            isSearchMatch ||
            node.connections >= 2
          const spikeLen = coreR * (isFocal ? 4.6 : isNeighbor ? 3.4 : 2.6)

          drawHubbleStar(ctx, node.screenX, node.screenY, coreR, node.rgb, starAlpha, {
            hasSpikes,
            spikeLength: spikeLen,
            isFocused: isFocal,
            isCurrent: false
          })
        }

        ctx.restore() // End Additive 'lighter' Blending

        // 3. Contextual Floating Glass Labels (ONLY for focal note and its connected group, or search match)
        ctx.save()
        for (const node of sortedNodes) {
          const isFocal = node.id === focalNodeId
          const isNeighbor = focalNodeId ? activeNeighborIds.has(node.id) : false
          const isSearchMatch = searchQuery
            ? node.title.toLowerCase().includes(searchQuery.toLowerCase())
            : false

          const showLabel = isSearchMatch || (focalNodeId !== null && (isFocal || isNeighbor))

          if (!showLabel) continue

          const labelText = node.title
          ctx.font = isFocal
            ? '600 11px "Inter", system-ui, sans-serif'
            : '500 10px "Inter", system-ui, sans-serif'

          const textMetrics = ctx.measureText(labelText)
          const pillW = textMetrics.width + 18
          const pillH = 20
          const r = node.radius * node.projectedScale
          const pillX = node.screenX - pillW / 2
          const pillY = node.screenY - r - 22

          ctx.beginPath()
          ctx.roundRect(pillX, pillY, pillW, pillH, 6)
          ctx.fillStyle = isFocal
            ? 'rgba(6, 7, 12, 0.94)'
            : 'rgba(4, 5, 8, 0.84)'
          ctx.fill()

          ctx.strokeStyle = isFocal
            ? node.color
            : 'rgba(255, 255, 255, 0.12)'
          ctx.lineWidth = isFocal ? 1.0 : 0.75
          ctx.stroke()

          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillStyle = isFocal ? '#ffffff' : '#d4dce8'
          ctx.fillText(labelText, node.screenX, pillY + pillH / 2)
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
      selectedNodeId,
      pinnedPopoverNodeId,
      contemplatedNodeId,
      hoveredFolder,
      searchQuery,
      settings,
      isPaused,
      isContemplationMode
    ])

  // Screen-space Hit Testing
  const getNodeAtScreenCoords = useCallback(
    (screenX: number, screenY: number): SimNode | null => {
      let closestNode: SimNode | null = null
      let closestDistSq = Infinity

      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i]
        const dx = screenX - node.screenX
        const dy = screenY - node.screenY
        const distSq = dx * dx + dy * dy

        const hitRadius = Math.max(16, node.radius * node.projectedScale * 2.5 + 8)
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

  const spawnRipple = useCallback((node?: SimNode) => {
    const r = node ? node.orbitRadius : 0.45
    const a = node ? node.orbitAngle : Math.random() * Math.PI * 2
    ripplesRef.current.push({
      x3d: Math.cos(a) * r,
      z3d: Math.sin(a) * r,
      radius: 0.03,
      maxRadius: 0.55,
      alpha: 0.55,
      rgb: node ? node.rgb : [255, 214, 153]
    })
  }, [])

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = overlayCanvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top

    pointerDownRef.current = { x: e.clientX, y: e.clientY, time: Date.now(), button: e.button }

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

      const baseUnit = Math.min(rect.width, rect.height) * 0.42 * transform.scale
      const dx = (sx - centerX) / Math.max(1, baseUnit)
      const dy = (centerY - sy) / Math.max(1, baseUnit) / Math.max(0.25, Math.sin(tiltRef.current))
      const newR = Math.max(0.4, Math.min(2.35, Math.hypot(dx, dy) * 2.1))
      const newAngle = Math.atan2(dy, dx)
      draggedNodeRef.current.orbitRadius = newR
      draggedNodeRef.current.orbitAngle = newAngle
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
      const isClick = dist < 7 && elapsed < 500
      const button = pointerDownRef.current.button

      if (isClick) {
        const rect = canvas.getBoundingClientRect()
        const sx = e.clientX - rect.left
        const sy = e.clientY - rect.top
        const hit = getNodeAtScreenCoords(sx, sy)

        if (hit) {
          spawnRipple(hit)
          if (button === 0) {
            // Left click on a star: select it to view its connected group and open popover
            setSelectedNodeId(hit.id)
            setPinnedPopoverNodeId(hit.id)
            setHoveredNodeId(hit.id)
          } else if (button === 2) {
            // Right click on a star: keep popover pinned/fixed
            setSelectedNodeId(hit.id)
            setPinnedPopoverNodeId(hit.id)
          }
        } else {
          // Click on empty canvas / background: deselect all notes and close popover!
          setSelectedNodeId(null)
          setPinnedPopoverNodeId(null)
          setHoveredNodeId(null)
        }
      }
    }

    draggedNodeRef.current = null
    isDraggingCanvasRef.current = false
    isTiltingCameraRef.current = false
    pointerDownRef.current = null
  }

  const handleDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = overlayCanvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top
    const hit = getNodeAtScreenCoords(sx, sy)
    if (hit) {
      spawnRipple(hit)
      onSelectNote(hit.id)
    }
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

  const activeInspectNode = useMemo(() => {
    const id =
      pinnedPopoverNodeId ||
      hoveredNodeId ||
      selectedNodeId ||
      (isContemplationMode ? contemplatedNodeId : null)
    if (!id) return null
    return nodes.find(n => n.id === id) || null
  }, [pinnedPopoverNodeId, hoveredNodeId, selectedNodeId, contemplatedNodeId, isContemplationMode, nodes])

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
      className="relative w-full h-full bg-[#010103] overflow-hidden flex flex-col select-none"
    >
      {/* 1. TOP HUD CONTROL BAR */}
      {!isContemplationMode && (
        <div className="absolute top-4 left-4 z-20 flex items-center gap-2 bg-[#080911]/80 backdrop-blur-2xl border border-white/[0.08] rounded-2xl p-1.5 shadow-2xl">
          {/* Search */}
          <div className="relative flex items-center">
            <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Buscar estrela..."
              className="w-40 pl-8 pr-7 py-1.5 bg-[#0f111c]/90 border border-white/[0.06] rounded-xl text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-[var(--accent)] font-mono transition-all"
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

          <button
            onClick={() => setIsPaused(p => !p)}
            className={`p-1.5 rounded-xl transition-all cursor-pointer ${
              isPaused
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5'
            }`}
            title={isPaused ? 'Retomar órbita' : 'Pausar órbita'}
          >
            {isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
          </button>

          <button
            onClick={() => setIsContemplationMode(true)}
            className="p-1.5 rounded-xl text-zinc-400 hover:text-zinc-200 hover:bg-white/5 transition-all cursor-pointer"
            title="Modo Contemplação (Ocultar interface)"
          >
            <Eye className="w-3.5 h-3.5" />
          </button>

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

          <button
            onClick={() => setShowSettingsDrawer(d => !d)}
            className={`p-1.5 rounded-xl transition-all cursor-pointer ${
              showSettingsDrawer
                ? 'bg-[var(--accent)] text-zinc-950 font-bold'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5'
            }`}
            title="Parâmetros Astronômicos"
          >
            <Sliders className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* CONTEMPLATION MODE FLOATING EXIT PILL */}
      {isContemplationMode && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 bg-[#080911]/75 backdrop-blur-2xl border border-white/15 rounded-full px-4 py-2 text-xs text-zinc-300 shadow-2xl animate-in fade-in duration-300">
          <Sparkles className="w-3.5 h-3.5 text-amber-300 animate-pulse" />
          <span className="font-mono text-[11px] tracking-wide">
            MODO CONTEMPLAÇÃO HUBBLE
          </span>
          <button
            onClick={() => setIsContemplationMode(false)}
            className="px-2.5 py-0.5 rounded-full bg-white/10 hover:bg-white/20 text-white font-semibold transition-colors cursor-pointer"
          >
            Sair (ESC)
          </button>
        </div>
      )}

      {/* 2. TOP-RIGHT INSPECTOR HUD CARD */}
      {activeInspectNode && (
        <div className="absolute top-4 right-4 z-20 w-84 bg-[#06070c]/90 backdrop-blur-2xl border border-white/[0.1] rounded-2xl p-4 shadow-2xl space-y-3 text-xs animate-in fade-in zoom-in-95 duration-150 select-none">
          <div className="flex items-start justify-between gap-2 border-b border-white/[0.07] pb-2.5">
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-[9px] font-mono uppercase tracking-wider text-zinc-400">
                <span
                  className="w-2 h-2 rounded-full inline-block shadow-[0_0_8px_currentColor]"
                  style={{ backgroundColor: activeInspectNode.color, color: activeInspectNode.color }}
                />
                <span>CONSTELAÇÃO // {activeInspectNode.folderShort}</span>
                {pinnedPopoverNodeId === activeInspectNode.id && (
                  <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-mono border border-amber-500/30">
                    FIXO
                  </span>
                )}
              </div>
              <h3 className="text-sm font-bold text-zinc-100 leading-snug">
                {activeInspectNode.title}
              </h3>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => onSelectNote(activeInspectNode.id)}
                className="p-1.5 rounded-lg bg-[var(--accent)]/15 hover:bg-[var(--accent)] text-[var(--accent)] hover:text-zinc-950 transition-all cursor-pointer shadow-sm"
                title="Abrir nota no editor"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => {
                  setPinnedPopoverNodeId(null)
                  setSelectedNodeId(null)
                  setHoveredNodeId(null)
                }}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-white/10 transition-all cursor-pointer"
                title="Fechar (ou clique fora)"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {activeInspectNode.excerpt && (
            <p className="text-[11px] text-zinc-300/90 leading-relaxed font-normal">
              {activeInspectNode.excerpt}
            </p>
          )}

          {activeInspectConnections.length > 0 && (
            <div className="space-y-1 pt-1">
              <span className="text-[10px] text-zinc-500 font-mono">
                ESTRELAS CONECTADAS ({activeInspectConnections.length}):
              </span>
              <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto pt-0.5">
                {activeInspectConnections.map(c => (
                  <button
                    key={c.id}
                    onClick={() => {
                      setSelectedNodeId(c.id)
                      setPinnedPopoverNodeId(c.id)
                    }}
                    className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/[0.04] hover:bg-white/[0.1] border border-white/[0.07] text-[10px] text-zinc-200 transition-colors cursor-pointer"
                    title={`Ver grupo de: ${c.title}`}
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

          <div className="flex items-center justify-between pt-1 border-t border-white/[0.07] text-[10px] text-zinc-400 font-mono">
            <span>RAIO ORBITAL: {activeInspectNode.orbitRadius.toFixed(2)} Rs</span>
            <button
              onClick={() => onSelectNote(activeInspectNode.id)}
              className="text-[var(--accent)] font-semibold flex items-center gap-1 hover:underline cursor-pointer"
            >
              ABRIR NOTA <ArrowRight className="w-2.5 h-2.5" />
            </button>
          </div>
        </div>
      )}

      {/* 3. SETTINGS DRAWER */}
      {showSettingsDrawer && !isContemplationMode && (
        <div className="absolute top-18 left-4 z-30 w-76 bg-[#080911]/95 backdrop-blur-2xl border border-white/[0.1] rounded-2xl p-4 shadow-2xl space-y-3.5 text-xs text-zinc-300 animate-in fade-in zoom-in-95 duration-150">
          <div className="flex items-center justify-between border-b border-white/[0.08] pb-2">
            <span className="font-bold text-zinc-100 flex items-center gap-1.5 font-mono text-[11px]">
              <Compass className="w-3.5 h-3.5 text-[var(--accent)]" />
              ÓPTICA HUBBLE & SINGULARIDADE
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
              <span>EXPOSIÇÃO DO DISCO DE ACREÇÃO</span>
              <span>{Math.round(settings.accretionIntensity * 100)}%</span>
            </div>
            <input
              type="range"
              min="0.4"
              max="1.6"
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
              <span>MAGNITUDE ESTELAR (BRILHO)</span>
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
              <span className="text-[11px]">Rastros Orbitais de Luz</span>
              <input
                type="checkbox"
                checked={settings.enableTrails}
                onChange={e =>
                  setSettings(s => ({ ...s, enableTrails: e.target.checked }))
                }
                className="accent-[var(--accent)] rounded cursor-pointer"
              />
            </label>
          </div>

          <div className="pt-1 text-[10px] text-zinc-400 font-mono leading-relaxed space-y-1">
            <div>
              💡 <span className="text-zinc-200">Clique esquerdo</span>: Seleciona estrela e vê conexões
            </div>
            <div>
              📌 <span className="text-zinc-200">Clique direito</span>: Fixa o card (popover)
            </div>
            <div>
              🌌 <span className="text-zinc-200">Clique no fundo</span>: Desmarca e fecha o card
            </div>
            <div>
              📖 <span className="text-zinc-200">Duplo clique</span>: Abre a nota no editor
            </div>
            <div>
              🔭 <span className="text-zinc-200">Direito + arrastar</span>: Inclina o ângulo 3D
            </div>
          </div>
        </div>
      )}

      {/* 4. BOTTOM STELLAR CLUSTERS BAR */}
      {!isContemplationMode && (
        <div className="absolute bottom-5 left-5 z-20 bg-[#080911]/80 backdrop-blur-2xl border border-white/[0.08] rounded-2xl px-3.5 py-2 text-xs text-zinc-400 flex items-center gap-3 shadow-2xl">
          <div className="flex items-center gap-1.5 font-bold text-zinc-200 font-mono text-[11px]">
            <Layers className="w-3.5 h-3.5 text-[var(--accent)]" />
            <span>{nodes.length} ESTRELAS</span>
          </div>
          <span className="text-zinc-700">•</span>
          <span className="font-mono text-[11px]">{edges.length} LIGAÇÕES</span>
          <span className="text-zinc-700">•</span>

          <div className="flex items-center gap-1.5">
            {allFolderShorts.slice(0, 6).map(fShort => {
              const tint = folderTintMap.get(fShort) || STELLAR_PALETTE[0]
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
                      : 'bg-[#0f111c]/90 text-zinc-400 hover:text-zinc-200 border border-white/[0.06]'
                  }`}
                  title={`Destacar constelação: ${fShort}`}
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0 shadow-[0_0_6px_currentColor]"
                    style={{ backgroundColor: tint.hex, color: tint.hex }}
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
        <div className="absolute bottom-5 right-5 z-20 flex flex-col gap-1.5 bg-[#080911]/80 backdrop-blur-2xl border border-white/[0.08] rounded-2xl p-1.5 shadow-2xl">
          <button
            onClick={() => {
              transformRef.current.scale = Math.min(3.5, transformRef.current.scale * 1.28)
            }}
            className="p-2 text-zinc-400 hover:text-zinc-100 hover:bg-white/10 rounded-xl transition-all cursor-pointer"
            title="Aproximar (+)"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={() => {
              transformRef.current.scale = Math.max(0.25, transformRef.current.scale * 0.78)
            }}
            className="p-2 text-zinc-400 hover:text-zinc-100 hover:bg-white/10 rounded-xl transition-all cursor-pointer"
            title="Afastar (-)"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            onClick={handleFocusActiveNote}
            className="p-2 text-zinc-400 hover:text-[var(--accent)] hover:bg-white/10 rounded-xl transition-all cursor-pointer"
            title="Focar na Estrela da Nota Ativa"
          >
            <Focus className="w-4 h-4" />
          </button>
          <button
            onClick={handleResetCamera}
            className="p-2 text-zinc-400 hover:text-zinc-100 hover:bg-white/10 rounded-xl transition-all cursor-pointer"
            title="Centralizar Câmera"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 6. LAYER 1: WEBGL HUBBLE DEEP-FIELD & GARGANTUA SHADER CANVAS */}
      <canvas
        ref={webglCanvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none opacity-100"
      />

      {/* 7. LAYER 2: ADDITIVE OPTICAL STARLIGHT & ORBITAL PARTICLES CANVAS */}
      <canvas
        ref={overlayCanvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onDoubleClick={handleDoubleClick}
        onWheel={handleWheel}
        className="relative z-10 w-full h-full cursor-default outline-none bg-transparent"
      />
    </div>
  )
}
