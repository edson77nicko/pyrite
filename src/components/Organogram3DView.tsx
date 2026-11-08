import React, { useState, useRef, useMemo, useEffect } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import {
  Building2,
  Users,
  Plus,
  X,
  Check,
  Pencil,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Maximize2,
  Minimize2,
  ChevronRight,
  MessageSquare,
  CheckCircle2,
  Move,
  Compass
} from 'lucide-react'
import type {
  AgentProfileVersion,
  TeamDefinition,
  SquadPipelineStep,
  AgentActionPermission,
  AgentState,
  TriggerMode
} from '../types/agents'
import { AgentIcon } from './AgentIcon'
import { renderDynamicIcon } from './IconPickerPopover'

export interface Organogram3DViewProps {
  squads: TeamDefinition[]
  agents: AgentProfileVersion[]
  vaultName?: string
  onSelectSquad: (squadId: string) => void
  onSaveSquad: (squad: TeamDefinition) => void
  onDeleteSquad: (squadId: string) => void
  onOpenSquadChat: (squad: TeamDefinition) => void
  onSaveAgent?: (agent: AgentProfileVersion) => void
  onOpenAgentChat?: (agentId: string) => void
  onOpenCreateSquadModal?: () => void
}

// =============================================================================
// PALETA DE CORES EM TONS DE CONTAINERES INDUSTRIAIS (MARITIME NAVY & CYBER CYAN)
// =============================================================================
const CONTAINER_PALETTE = {
  floorBg: 0x070b12,         // Fundo abissal do grid
  containerNavy: 0x0b1120,   // Base escura do container
  containerSteel: 0x1e293b,  // Chapa de aço industrial
  containerSlate: 0x334155,  // Bordas e frisos metálicos
  containerBlue: 0x0284c7,   // Azul marítimo de container
  neonCyan: 0x38bdf8,        // Neon cyan das conexões e conduítes
  neonCyanGlow: 0x00f2fe,    // Pulso elétrico intenso
  // MESA E AGENTE (Alto contraste para máxima visibilidade)
  deskTop: 0xf1f5f9,         // Tampo de mesa branco/laminado titânio claro (destaque absoluto!)
  deskTrim: 0x334155,        // Friso escuro da mesa
  deskLegs: 0x94a3b8,        // Pernas metálicas cromadas
  agentSuit: 0x1d4ed8,       // Traje executivo azul royal vibrante (contraste nítido com a mesa branca)
  agentSkin: 0xfcd34d,       // Tom de pele/cabeça nítido
  agentHair: 0x1e293b,       // Cabelo escuro esculpido
  chairDark: 0x0f172a        // Cadeira ergonômica carvão
}

const AVAILABLE_INTEGRATIONS = [
  { id: 'vault', label: 'Cofre Local (.md)', color: '#0284c7' },
  { id: 'web', label: 'Busca Web', color: '#38bdf8' },
  { id: 'code', label: 'Execução de Código', color: '#818cf8' },
  { id: 'slack', label: 'Slack', color: '#ec4899' },
  { id: 'zendesk', label: 'Zendesk', color: '#10b981' },
  { id: 'files', label: 'Análise de Arquivos', color: '#06b6d4' }
]

interface ProjectedTag {
  id: string
  type: 'agent' | 'squad' | 'hub'
  name: string
  subtitle?: string
  icon?: string
  screenX: number
  screenY: number
  visible: boolean
  agentId?: string
  squadId?: string
  squad?: TeamDefinition
}

export const Organogram3DView: React.FC<Organogram3DViewProps> = ({
  squads,
  agents,
  vaultName = 'Cofre Principal',
  onSelectSquad,
  onSaveSquad,
  onOpenSquadChat,
  onSaveAgent,
  onOpenAgentChat,
  onOpenCreateSquadModal
}) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const turntableCanvasRef = useRef<HTMLCanvasElement>(null)

  // Drawer Lateral
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)
  const [hoveredAgentId, setHoveredAgentId] = useState<string | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)

  // Modo de Navegação da Câmera (Pan Livre vs Órbita)
  const [navMode, setNavMode] = useState<'pan' | 'orbit'>('pan')

  // Tags 2D projetadas sobre a cena 3D
  const [projectedTags, setProjectedTags] = useState<ProjectedTag[]>([])

  // Formulário do Agente
  const [formName, setFormName] = useState('')
  const [formSquadId, setFormSquadId] = useState('')
  const [formTask, setFormTask] = useState('')
  const [formAccessLevel, setFormAccessLevel] = useState<'low' | 'medium' | 'high'>('medium')
  const [formIntegrations, setFormIntegrations] = useState<string[]>([])
  const [formIsActive, setFormIsActive] = useState(true)
  const [formCanReadVault, setFormCanReadVault] = useState(true)
  const [formCanWriteVault, setFormCanWriteVault] = useState(false)
  const [formAutonomous, setFormAutonomous] = useState(true)
  const [saveSuccessNotice, setSaveSuccessNotice] = useState(false)

  // Referência para controles e objetos 3D
  const controlsRef = useRef<OrbitControls | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const deskMeshesRef = useRef<Map<string, THREE.Object3D>>(new Map())
  const pulseSpheresRef = useRef<{ mesh: THREE.Mesh; curve: THREE.CatmullRomCurve3; speed: number; progress: number }[]>([])
  const crystalRef = useRef<THREE.Mesh | null>(null)
  const orbitRingsRef = useRef<THREE.Group | null>(null)

  const selectedAgent = useMemo(() => {
    if (!selectedAgentId) return null
    return agents.find(a => a.id === selectedAgentId) || null
  }, [agents, selectedAgentId])

  const selectedAgentCurrentSquad = useMemo(() => {
    if (!selectedAgentId) return null
    return (
      squads.find(sq =>
        (sq.pipeline || []).some(p => p.agentId === selectedAgentId) ||
        (sq.nodes || []).some(n => n.agentId === selectedAgentId)
      ) || null
    )
  }, [squads, selectedAgentId])

  useEffect(() => {
    if (selectedAgent) {
      setFormName(selectedAgent.name || '')
      setFormSquadId(selectedAgentCurrentSquad?.id || '')
      setFormTask(selectedAgent.roleDescription || selectedAgent.specialistRole || 'Especialista Operacional')

      const currentSkills = selectedAgent.skills || []
      const initialIntegrations = AVAILABLE_INTEGRATIONS.map(i => i.id).filter(id =>
        currentSkills.some(s => s.toLowerCase().includes(id)) ||
        (id === 'vault' && (selectedAgent.knowledgeBindings || []).length > 0)
      )
      setFormIntegrations(initialIntegrations.length > 0 ? initialIntegrations : ['vault', 'web'])

      const actions = selectedAgent.allowedActions || []
      setFormCanReadVault(actions.includes('read_context'))
      setFormCanWriteVault(actions.includes('prepare_draft') || actions.includes('propose_patch'))
      setFormIsActive(selectedAgent.state !== 'paused')
      setFormAccessLevel(actions.length > 3 ? 'high' : actions.length > 1 ? 'medium' : 'low')
      setFormAutonomous(selectedAgent.triggerMode !== 'on_demand')
    }
  }, [selectedAgent, selectedAgentCurrentSquad])

  // Atualizar modo do OrbitControls (Pan vs Orbit)
  useEffect(() => {
    if (!controlsRef.current) return
    const controls = controlsRef.current
    if (navMode === 'pan') {
      controls.mouseButtons = {
        LEFT: THREE.MOUSE.PAN,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.ROTATE
      }
    } else {
      controls.mouseButtons = {
        LEFT: THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.PAN
      }
    }
  }, [navMode])

  // =========================================================================
  // MINI TURNTABLE 3D NO DRAWER PARA O AGENTE SELECIONADO
  // =========================================================================
  useEffect(() => {
    const canvas = turntableCanvasRef.current
    if (!canvas || !selectedAgent) return

    const ttWidth = canvas.clientWidth || 320
    const ttHeight = canvas.clientHeight || 180

    const ttScene = new THREE.Scene()
    ttScene.background = new THREE.Color(0x0f172a)

    const ttCamera = new THREE.PerspectiveCamera(32, ttWidth / ttHeight, 1, 1000)
    ttCamera.position.set(0, 48, 85)
    ttCamera.lookAt(0, 14, 0)

    const ttRenderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true
    })
    ttRenderer.setSize(ttWidth, ttHeight)
    ttRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

    const ttAmbient = new THREE.AmbientLight(0xffffff, 1.2)
    ttScene.add(ttAmbient)

    const ttDirLight = new THREE.DirectionalLight(0x38bdf8, 2.0)
    ttDirLight.position.set(40, 60, 40)
    ttScene.add(ttDirLight)

    const ttGroup = new THREE.Group()

    // 1. Base giratória com anel circular de neon cyan
    const discGeo = new THREE.CylinderGeometry(28, 30, 2.5, 36)
    const discMat = new THREE.MeshStandardMaterial({
      color: CONTAINER_PALETTE.containerNavy,
      metalness: 0.8,
      roughness: 0.3
    })
    const disc = new THREE.Mesh(discGeo, discMat)
    disc.position.y = 1
    ttGroup.add(disc)

    const ringGeo = new THREE.TorusGeometry(26, 0.8, 16, 48)
    const ringMat = new THREE.MeshStandardMaterial({
      color: CONTAINER_PALETTE.neonCyan,
      emissive: CONTAINER_PALETTE.neonCyan,
      emissiveIntensity: 2.2
    })
    const ring = new THREE.Mesh(ringGeo, ringMat)
    ring.rotation.x = Math.PI / 2
    ring.position.y = 2.4
    ttGroup.add(ring)

    // 2. Mesa Branca de Alto Contraste
    const deskGeo = new THREE.BoxGeometry(32, 2.5, 18)
    const deskMat = new THREE.MeshStandardMaterial({
      color: CONTAINER_PALETTE.deskTop,
      roughness: 0.25,
      metalness: 0.4
    })
    const desk = new THREE.Mesh(deskGeo, deskMat)
    desk.position.set(0, 12, -2)
    ttGroup.add(desk)

    // Pernas cromadas
    const legGeo = new THREE.CylinderGeometry(0.9, 0.9, 11, 12)
    const legMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.9, roughness: 0.2 })
    const legCoords = [[-14, -8], [14, -8], [-14, 6], [14, 6]]
    legCoords.forEach(([lx, lz]) => {
      const leg = new THREE.Mesh(legGeo, legMat)
      leg.position.set(lx, 6, lz - 2)
      ttGroup.add(leg)
    })

    // Monitores duplos luminosos
    const monChassisGeo = new THREE.BoxGeometry(11, 7.5, 0.8)
    const monMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.8 })
    const screenGeo = new THREE.PlaneGeometry(10, 6.8)
    const screenMat = new THREE.MeshStandardMaterial({
      color: CONTAINER_PALETTE.neonCyan,
      emissive: CONTAINER_PALETTE.neonCyan,
      emissiveIntensity: 2.5
    })

    const lMon = new THREE.Mesh(monChassisGeo, monMat)
    lMon.position.set(-6.8, 17.5, -6)
    lMon.rotation.y = 0.24
    const lScr = new THREE.Mesh(screenGeo, screenMat)
    lScr.position.z = 0.45
    lMon.add(lScr)
    ttGroup.add(lMon)

    const rMon = new THREE.Mesh(monChassisGeo, monMat)
    rMon.position.set(6.8, 17.5, -6)
    rMon.rotation.y = -0.24
    const rScr = new THREE.Mesh(screenGeo, screenMat)
    rScr.position.z = 0.45
    rMon.add(rScr)
    ttGroup.add(rMon)

    // Cadeira ergonômica
    const chairGroup = new THREE.Group()
    chairGroup.position.set(0, 0, 7)
    const seatGeo = new THREE.BoxGeometry(12, 2.2, 11)
    const chairMat = new THREE.MeshStandardMaterial({ color: CONTAINER_PALETTE.chairDark, roughness: 0.85 })
    const seat = new THREE.Mesh(seatGeo, chairMat)
    seat.position.y = 7.5
    chairGroup.add(seat)
    const backGeo = new THREE.BoxGeometry(12, 13, 2)
    const back = new THREE.Mesh(backGeo, chairMat)
    back.position.set(0, 15, 4.8)
    chairGroup.add(back)
    ttGroup.add(chairGroup)

    // Avatar do Agente
    const bodyGeo = new THREE.BoxGeometry(8.5, 11, 6)
    const suitMat = new THREE.MeshStandardMaterial({ color: CONTAINER_PALETTE.agentSuit, roughness: 0.4 })
    const body = new THREE.Mesh(bodyGeo, suitMat)
    body.position.set(0, 14, 5)
    ttGroup.add(body)

    const headGeo = new THREE.SphereGeometry(3.8, 16, 16)
    const headMat = new THREE.MeshStandardMaterial({ color: CONTAINER_PALETTE.agentSkin, roughness: 0.5 })
    const head = new THREE.Mesh(headGeo, headMat)
    head.position.set(0, 22, 5)
    ttGroup.add(head)

    const visorGeo = new THREE.BoxGeometry(5.5, 1.8, 2.2)
    const visorMat = new THREE.MeshStandardMaterial({
      color: CONTAINER_PALETTE.neonCyan,
      emissive: CONTAINER_PALETTE.neonCyan,
      emissiveIntensity: 3.0
    })
    const visor = new THREE.Mesh(visorGeo, visorMat)
    visor.position.set(0, 22, 2.2)
    ttGroup.add(visor)

    ttScene.add(ttGroup)

    let ttAnimId: number
    const animateTurntable = () => {
      ttAnimId = requestAnimationFrame(animateTurntable)
      ttGroup.rotation.y += 0.015
      ttRenderer.render(ttScene, ttCamera)
    }
    animateTurntable()

    return () => {
      cancelAnimationFrame(ttAnimId)
      ttRenderer.dispose()
    }
  }, [selectedAgent])

  // =========================================================================
  // MONTAGEM DO CENÁRIO PRINCIPAL THREE.JS (CANVAS 3D REAL, TONS CONTAINERES)
  // =========================================================================
  useEffect(() => {
    const container = containerRef.current
    const canvas = canvasRef.current
    if (!container || !canvas) return

    let width = container.clientWidth
    let height = container.clientHeight

    // 1. Scene, Camera, Renderer
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(CONTAINER_PALETTE.floorBg)
    scene.fog = new THREE.FogExp2(CONTAINER_PALETTE.floorBg, 0.00065)

    const camera = new THREE.PerspectiveCamera(38, width / height, 1, 3800)
    camera.position.set(0, 480, 750)
    camera.lookAt(0, 0, 0)
    cameraRef.current = camera

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance'
    })
    renderer.setSize(width, height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap

    // 2. OrbitControls com Pan Totalmente Livre e Desbloqueado
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.06
    controls.screenSpacePanning = true // PAN TOTALMENTE LIVRE PELO CENÁRIO
    controls.maxPolarAngle = Math.PI / 2 - 0.04
    controls.minDistance = 180
    controls.maxDistance = 1800
    controls.target.set(0, 0, 0)
    controls.mouseButtons = {
      LEFT: THREE.MOUSE.PAN, // Padrão: Arrastar para transladar livremente
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.ROTATE
    }
    controlsRef.current = controls

    // 3. Iluminação Industrial
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.1)
    scene.add(ambientLight)

    const dirLight = new THREE.DirectionalLight(0xe0f2fe, 1.6)
    dirLight.position.set(280, 520, 360)
    dirLight.castShadow = true
    dirLight.shadow.mapSize.width = 2048
    dirLight.shadow.mapSize.height = 2048
    dirLight.shadow.camera.near = 10
    dirLight.shadow.camera.far = 1800
    dirLight.shadow.camera.left = -800
    dirLight.shadow.camera.right = 800
    dirLight.shadow.camera.top = 800
    dirLight.shadow.camera.bottom = -800
    scene.add(dirLight)

    const vaultPointLight = new THREE.PointLight(CONTAINER_PALETTE.neonCyan, 4.0, 750)
    vaultPointLight.position.set(0, 42, 0)
    scene.add(vaultPointLight)

    // 4. Piso Industrial com Grid
    const floorSize = 3000
    const gridHelper = new THREE.GridHelper(floorSize, 90, CONTAINER_PALETTE.neonCyan, 0x1e293b)
    gridHelper.position.y = -0.5
    // @ts-ignore
    gridHelper.material.opacity = 0.28
    // @ts-ignore
    gridHelper.material.transparent = true
    scene.add(gridHelper)

    const floorPlaneGeo = new THREE.PlaneGeometry(floorSize, floorSize)
    const floorPlaneMat = new THREE.MeshStandardMaterial({
      color: 0x060910,
      roughness: 0.9,
      metalness: 0.25
    })
    const floorMesh = new THREE.Mesh(floorPlaneGeo, floorPlaneMat)
    floorMesh.rotation.x = -Math.PI / 2
    floorMesh.position.y = -1
    floorMesh.receiveShadow = true
    scene.add(floorMesh)

    // =======================================================================
    // 5. CENTRO: O COFRE CORPORATIVO (ESTILO CONTAINER INDUSTRIAL CILÍNDRICO)
    // =======================================================================
    const hubGroup = new THREE.Group()
    hubGroup.position.set(0, 0, 0)

    // Base inferior (disco de aço naval espesso)
    const baseCylGeo = new THREE.CylinderGeometry(95, 108, 16, 56)
    const baseCylMat = new THREE.MeshStandardMaterial({
      color: CONTAINER_PALETTE.containerNavy,
      roughness: 0.4,
      metalness: 0.85
    })
    const baseCyl = new THREE.Mesh(baseCylGeo, baseCylMat)
    baseCyl.position.y = 8
    baseCyl.castShadow = true
    baseCyl.receiveShadow = true
    hubGroup.add(baseCyl)

    // Anel de canal luminoso Cyan
    const cyanRingGeo = new THREE.TorusGeometry(96, 3.2, 16, 64)
    const cyanRingMat = new THREE.MeshStandardMaterial({
      color: CONTAINER_PALETTE.neonCyan,
      emissive: CONTAINER_PALETTE.neonCyan,
      emissiveIntensity: 2.8,
      roughness: 0.2,
      metalness: 0.8
    })
    const cyanRing = new THREE.Mesh(cyanRingGeo, cyanRingMat)
    cyanRing.rotation.x = Math.PI / 2
    cyanRing.position.y = 15
    hubGroup.add(cyanRing)

    // Platô superior biselado em container steel
    const topPlateGeo = new THREE.CylinderGeometry(88, 88, 6, 56)
    const topPlateMat = new THREE.MeshStandardMaterial({
      color: CONTAINER_PALETTE.containerSteel,
      roughness: 0.5,
      metalness: 0.75
    })
    const topPlate = new THREE.Mesh(topPlateGeo, topPlateMat)
    topPlate.position.y = 18
    topPlate.receiveShadow = true
    hubGroup.add(topPlate)

    // Núcleo central holográfico
    const crystalGeo = new THREE.OctahedronGeometry(18, 0)
    const crystalMat = new THREE.MeshStandardMaterial({
      color: CONTAINER_PALETTE.neonCyan,
      emissive: CONTAINER_PALETTE.neonCyan,
      emissiveIntensity: 2.2,
      roughness: 0.1,
      metalness: 0.95
    })
    const crystal = new THREE.Mesh(crystalGeo, crystalMat)
    crystal.position.y = 42
    crystal.castShadow = true
    hubGroup.add(crystal)
    crystalRef.current = crystal

    // Anéis orbitais
    const ringsGroup = new THREE.Group()
    ringsGroup.position.y = 42
    const ring1Geo = new THREE.TorusGeometry(30, 0.9, 12, 56)
    const ring1Mat = new THREE.MeshStandardMaterial({
      color: CONTAINER_PALETTE.neonCyan,
      emissive: CONTAINER_PALETTE.neonCyan,
      emissiveIntensity: 1.4
    })
    const ring1 = new THREE.Mesh(ring1Geo, ring1Mat)
    ring1.rotation.x = Math.PI / 3
    ringsGroup.add(ring1)

    const ring2Geo = new THREE.TorusGeometry(38, 0.7, 12, 56)
    const ring2Mat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.35, metalness: 0.85 })
    const ring2 = new THREE.Mesh(ring2Geo, ring2Mat)
    ring2.rotation.y = Math.PI / 4
    ringsGroup.add(ring2)

    hubGroup.add(ringsGroup)
    orbitRingsRef.current = ringsGroup

    scene.add(hubGroup)

    // =======================================================================
    // 6. PLATAFORMAS DOS DEPARTAMENTOS (CONTAINERES INDUSTRIAIS ROBUSTOS)
    // =======================================================================
    const totalSquads = squads.length
    deskMeshesRef.current.clear()
    pulseSpheresRef.current = []

    // Distribuição espacial equilibrada garantindo espaçamento amplo
    const computeSquadCoords = (idx: number, total: number) => {
      if (total === 1) return { x: 0, z: -380 }
      if (total === 2) {
        // Exatamente como no print de referência: um esquadrão à esquerda e outro à direita com espaço respirável
        return idx === 0 ? { x: -450, z: -40 } : { x: 450, z: -40 }
      }
      if (total === 3) {
        if (idx === 0) return { x: -460, z: -180 }
        if (idx === 1) return { x: 460, z: -180 }
        return { x: 0, z: 350 }
      }
      if (total === 4) {
        if (idx === 0) return { x: -460, z: -200 }
        if (idx === 1) return { x: 460, z: -200 }
        if (idx === 2) return { x: -460, z: 220 }
        return { x: 460, z: 220 }
      }
      const angle = (idx / total) * Math.PI * 2 - Math.PI / 2
      return {
        x: Math.round(Math.cos(angle) * 540),
        z: Math.round(Math.sin(angle) * 360)
      }
    }

    squads.forEach((sq, sIdx) => {
      const { x: sqX, z: sqZ } = computeSquadCoords(sIdx, totalSquads)
      const pipeline = sq.pipeline || []
      const squadAgents = pipeline
        .map(p => agents.find(a => a.id === p.agentId))
        .filter(Boolean) as AgentProfileVersion[]

      const platformGroup = new THREE.Group()
      platformGroup.position.set(sqX, 0, sqZ)

      const platWidth = 320
      const platDepth = 210
      const platHeight = 16

      // Base chanfrada de aço escuro (Tier 1)
      const basePlatformGeo = new THREE.BoxGeometry(platWidth + 12, 6, platDepth + 12)
      const basePlatformMat = new THREE.MeshStandardMaterial({
        color: CONTAINER_PALETTE.containerNavy,
        roughness: 0.5,
        metalness: 0.85
      })
      const basePlat = new THREE.Mesh(basePlatformGeo, basePlatformMat)
      basePlat.position.y = 3
      basePlat.castShadow = true
      basePlat.receiveShadow = true
      platformGroup.add(basePlat)

      // Corpo principal do container (Tier 2)
      const platGeo = new THREE.BoxGeometry(platWidth, platHeight, platDepth)
      const platMat = new THREE.MeshStandardMaterial({
        color: CONTAINER_PALETTE.containerSteel,
        roughness: 0.45,
        metalness: 0.75
      })
      const platMesh = new THREE.Mesh(platGeo, platMat)
      platMesh.position.y = platHeight / 2 + 3
      platMesh.castShadow = true
      platMesh.receiveShadow = true
      platformGroup.add(platMesh)

      // Moldura Luminosa Cyan na Borda Superior (Tier 3)
      const edgeGeo = new THREE.BoxGeometry(platWidth + 2, 2.5, platDepth + 2)
      const edgeMat = new THREE.MeshStandardMaterial({
        color: CONTAINER_PALETTE.neonCyan,
        emissive: CONTAINER_PALETTE.containerBlue,
        emissiveIntensity: 2.2,
        roughness: 0.2,
        metalness: 0.8
      })
      const edgeMesh = new THREE.Mesh(edgeGeo, edgeMat)
      edgeMesh.position.y = platHeight + 3.8
      platformGroup.add(edgeMesh)

      // Caixa Terminal de Conexão dos Conduítes na Borda Frontal/Interna
      const dockWidth = 36
      const dockDepth = 14
      const dockHeight = 10
      const dockGeo = new THREE.BoxGeometry(dockWidth, dockHeight, dockDepth)
      const dockMat = new THREE.MeshStandardMaterial({
        color: CONTAINER_PALETTE.containerSlate,
        metalness: 0.85,
        roughness: 0.25
      })
      const dockMesh = new THREE.Mesh(dockGeo, dockMat)
      const dockX = sqX > 0 ? -platWidth / 2 + dockDepth / 2 : platWidth / 2 - dockDepth / 2
      dockMesh.position.set(dockX, platHeight + 1, 0)
      platformGroup.add(dockMesh)

      // LED de status do dock
      const dockLedGeo = new THREE.BoxGeometry(dockWidth - 6, 2, 2)
      const dockLedMat = new THREE.MeshStandardMaterial({
        color: CONTAINER_PALETTE.neonCyan,
        emissive: CONTAINER_PALETTE.neonCyan,
        emissiveIntensity: 3.0
      })
      const dockLed = new THREE.Mesh(dockLedGeo, dockLedMat)
      dockLed.position.set(dockX, platHeight + dockHeight / 2 + 1, 0)
      platformGroup.add(dockLed)

      // =====================================================================
      // 7. MESAS REFINADAS & AGENTES EM ALTO CONTRASTE (CLAROS & VISÍVEIS)
      // =====================================================================
      const cols = 3
      const deskSpacingX = 92
      const deskSpacingZ = 80

      squadAgents.forEach((ag, agIdx) => {
        const col = agIdx % cols
        const row = Math.floor(agIdx / cols)

        const deskX = (col - (cols - 1) / 2) * deskSpacingX
        const deskZ = (row - 0.5) * deskSpacingZ

        const workstation = new THREE.Group()
        workstation.position.set(deskX, platHeight + 4, deskZ)
        workstation.userData = { agentId: ag.id, squadId: sq.id }

        // A. Tampo da Mesa em Branco/Laminado Titânio Claro (Destaque absoluto!)
        const deskTopGeo = new THREE.BoxGeometry(44, 3.2, 25)
        const deskTopMat = new THREE.MeshStandardMaterial({
          color: CONTAINER_PALETTE.deskTop, // BRANCO TITÂNIO CLARO
          roughness: 0.25,
          metalness: 0.45
        })
        const deskTop = new THREE.Mesh(deskTopGeo, deskTopMat)
        deskTop.position.y = 12
        deskTop.castShadow = true
        deskTop.receiveShadow = true
        workstation.add(deskTop)

        // Mousepad escuro no centro
        const padGeo = new THREE.BoxGeometry(36, 0.4, 18)
        const padMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.9 })
        const pad = new THREE.Mesh(padGeo, padMat)
        pad.position.set(0, 13.8, 0)
        workstation.add(pad)

        // Mini Teclado
        const kbGeo = new THREE.BoxGeometry(18, 0.5, 7)
        const kbMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.8 })
        const kb = new THREE.Mesh(kbGeo, kbMat)
        kb.position.set(0, 14.1, 3.5)
        workstation.add(kb)

        // B. Pernas Metálicas Cromadas
        const legGeo = new THREE.CylinderGeometry(1.3, 1.3, 12, 16)
        const legMat = new THREE.MeshStandardMaterial({ color: CONTAINER_PALETTE.deskLegs, metalness: 0.92, roughness: 0.15 })
        const legPositions = [
          [-19, 6, -10],
          [19, 6, -10],
          [-19, 6, 10],
          [19, 6, 10]
        ]
        legPositions.forEach(([lx, ly, lz]) => {
          const leg = new THREE.Mesh(legGeo, legMat)
          leg.position.set(lx, ly, lz)
          leg.castShadow = true
          workstation.add(leg)
        })

        // C. Monitores Duplos Angulados com Chassi Prata e Telas Luminosas
        const monitorChassisGeo = new THREE.BoxGeometry(14, 9, 1)
        const monitorChassisMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.85, roughness: 0.25 })

        const screenGeo = new THREE.PlaneGeometry(13, 8)
        const leftScreenMat = new THREE.MeshStandardMaterial({
          color: CONTAINER_PALETTE.neonCyan,
          emissive: CONTAINER_PALETTE.neonCyan,
          emissiveIntensity: 2.4,
          roughness: 0.1
        })
        const rightScreenMat = new THREE.MeshStandardMaterial({
          color: 0x38bdf8,
          emissive: CONTAINER_PALETTE.containerBlue,
          emissiveIntensity: 2.0,
          roughness: 0.1
        })

        // Monitor Esquerdo
        const leftMon = new THREE.Mesh(monitorChassisGeo, monitorChassisMat)
        leftMon.position.set(-8.8, 19, -6)
        leftMon.rotation.y = 0.25
        leftMon.castShadow = true
        const leftScreen = new THREE.Mesh(screenGeo, leftScreenMat)
        leftScreen.position.z = 0.55
        leftMon.add(leftScreen)
        workstation.add(leftMon)

        // Monitor Direito
        const rightMon = new THREE.Mesh(monitorChassisGeo, monitorChassisMat)
        rightMon.position.set(8.8, 19, -6)
        rightMon.rotation.y = -0.25
        rightMon.castShadow = true
        const rightScreen = new THREE.Mesh(screenGeo, rightScreenMat)
        rightScreen.position.z = 0.55
        rightMon.add(rightScreen)
        workstation.add(rightMon)

        // D. Cadeira Ergonômica 3D
        const chairGroup = new THREE.Group()
        chairGroup.position.set(0, 0, 11)

        const seatGeo = new THREE.BoxGeometry(16, 2.8, 15)
        const chairMat = new THREE.MeshStandardMaterial({ color: CONTAINER_PALETTE.chairDark, roughness: 0.85 })
        const seat = new THREE.Mesh(seatGeo, chairMat)
        seat.position.y = 8.5
        chairGroup.add(seat)

        const backGeo = new THREE.BoxGeometry(15, 17, 2.6)
        const back = new THREE.Mesh(backGeo, chairMat)
        back.position.set(0, 17.5, 6)
        chairGroup.add(back)

        const basePoleGeo = new THREE.CylinderGeometry(1.3, 1.3, 8.5, 12)
        const basePole = new THREE.Mesh(basePoleGeo, legMat)
        basePole.position.y = 4.25
        chairGroup.add(basePole)

        workstation.add(chairGroup)

        // E. Silhueta do Especialista 3D em Azul Royal Vibrante (Destaque total!)
        const bodyGeo = new THREE.BoxGeometry(11, 13, 7.5)
        const agentBodyMat = new THREE.MeshStandardMaterial({
          color: CONTAINER_PALETTE.agentSuit, // AZUL ROYAL NÍTIDO
          roughness: 0.45,
          metalness: 0.2
        })
        const body = new THREE.Mesh(bodyGeo, agentBodyMat)
        body.position.set(0, 15.5, 8.5)
        body.castShadow = true
        workstation.add(body)

        // Braços alcançando a mesa
        const armGeo = new THREE.BoxGeometry(2.8, 2.8, 9)
        const leftArm = new THREE.Mesh(armGeo, agentBodyMat)
        leftArm.position.set(-6.2, 13.8, 4.2)
        workstation.add(leftArm)
        const rightArm = new THREE.Mesh(armGeo, agentBodyMat)
        rightArm.position.set(6.2, 13.8, 4.2)
        workstation.add(rightArm)

        // Cabeça do Especialista
        const headGeo = new THREE.SphereGeometry(4.8, 16, 16)
        const headMat = new THREE.MeshStandardMaterial({ color: CONTAINER_PALETTE.agentSkin, roughness: 0.5 })
        const head = new THREE.Mesh(headGeo, headMat)
        head.position.set(0, 25.5, 8.5)
        workstation.add(head)

        // Cabelo esculpido
        const hairGeo = new THREE.SphereGeometry(5.0, 16, 16)
        const hairMat = new THREE.MeshStandardMaterial({ color: CONTAINER_PALETTE.agentHair, roughness: 0.9 })
        const hair = new THREE.Mesh(hairGeo, hairMat)
        hair.position.set(0, 26.5, 9.2)
        hair.scale.set(1.02, 0.95, 0.9)
        workstation.add(hair)

        // Visor Luminoso Cyan
        const visorGeo = new THREE.BoxGeometry(7, 2.2, 2.5)
        const visorMat = new THREE.MeshStandardMaterial({
          color: CONTAINER_PALETTE.neonCyan,
          emissive: CONTAINER_PALETTE.neonCyan,
          emissiveIntensity: 3.2
        })
        const visor = new THREE.Mesh(visorGeo, visorMat)
        visor.position.set(0, 25.5, 4.8)
        workstation.add(visor)

        // Mini Caneca de Café no canto
        const mugGeo = new THREE.CylinderGeometry(1.6, 1.4, 3.2, 12)
        const mugMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.2 })
        const mug = new THREE.Mesh(mugGeo, mugMat)
        mug.position.set(17, 14.8, 4)
        workstation.add(mug)

        // Hitbox invisível para cliques
        const hitGeo = new THREE.BoxGeometry(50, 36, 40)
        const hitMat = new THREE.MeshBasicMaterial({ visible: false })
        const hitMesh = new THREE.Mesh(hitGeo, hitMat)
        hitMesh.position.y = 16
        workstation.add(hitMesh)

        platformGroup.add(workstation)
        deskMeshesRef.current.set(ag.id, workstation)
      })

      scene.add(platformGroup)

      // =======================================================================
      // 8. CONDUÍTES 3D MATEMATICAMENTE CONTÍNUOS (SEM LAÇOS, CURVATURA S PERFEITA)
      // =======================================================================
      const hubRadius = 100
      const angle = Math.atan2(sqZ, sqX)

      // Ponto de saída do anel do Cofre Central
      const startX = Math.cos(angle) * hubRadius
      const startZ = Math.sin(angle) * hubRadius

      // Ponto de entrada na borda da plataforma do esquadrão
      const isLeftSide = sqX < 0
      const endX = isLeftSide ? sqX + platWidth / 2 : sqX - platWidth / 2
      const endZ = sqZ

      // Distância no eixo X entre a saída do hub e a plataforma
      const distX = endX - startX
      const distZ = endZ - startZ

      // Curva Bézier CatmullRom suave sem reversão de coordenadas
      const mid1X = startX + distX * 0.35
      const mid1Z = startZ + distZ * 0.15
      const mid2X = startX + distX * 0.70
      const mid2Z = endZ

      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(startX, 10, startZ),
        new THREE.Vector3(mid1X, 6, mid1Z),
        new THREE.Vector3(mid2X, 6, mid2Z),
        new THREE.Vector3(endX, 10, endZ)
      ])

      // 1. Tubo Central Blindado em Steel
      const armorTubeGeo = new THREE.TubeGeometry(curve, 40, 4.2, 12, false)
      const armorTubeMat = new THREE.MeshStandardMaterial({
        color: CONTAINER_PALETTE.containerSteel,
        roughness: 0.35,
        metalness: 0.85
      })
      const armorTube = new THREE.Mesh(armorTubeGeo, armorTubeMat)
      scene.add(armorTube)

      // 2. Fibra Cyan Neon Central Luminosa
      const coreTubeGeo = new THREE.TubeGeometry(curve, 40, 1.6, 8, false)
      const coreTubeMat = new THREE.MeshStandardMaterial({
        color: CONTAINER_PALETTE.neonCyan,
        emissive: CONTAINER_PALETTE.neonCyan,
        emissiveIntensity: 2.8,
        roughness: 0.15
      })
      const coreTube = new THREE.Mesh(coreTubeGeo, coreTubeMat)
      scene.add(coreTube)

      // 3. Esfera de Pulso de Dados em Movimento
      const pulseGeo = new THREE.SphereGeometry(3.6, 16, 16)
      const pulseMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: CONTAINER_PALETTE.neonCyan,
        emissiveIntensity: 4.5
      })
      const pulseMesh = new THREE.Mesh(pulseGeo, pulseMat)
      scene.add(pulseMesh)

      pulseSpheresRef.current.push({
        mesh: pulseMesh,
        curve,
        speed: 0.0035 + (sIdx % 3) * 0.001,
        progress: sIdx * 0.35
      })
    })

    // =======================================================================
    // 9. LOOP DE ANIMAÇÃO & PROJEÇÃO DE TAGS 2D CONDICIONAIS PELO ZOOM
    // =======================================================================
    let animId: number
    const tempVec = new THREE.Vector3()

    const animate = () => {
      animId = requestAnimationFrame(animate)

      controls.update()

      // Calcular distância da câmera ao alvo para controlar a visibilidade dos títulos dos agentes
      const cameraDist = camera.position.distanceTo(controls.target)
      const zoomed = cameraDist < 520 // Apenas ao aproximar bem no zoom!

      if (crystalRef.current) {
        crystalRef.current.rotation.y += 0.012
        crystalRef.current.rotation.x += 0.006
      }
      if (orbitRingsRef.current) {
        orbitRingsRef.current.rotation.z += 0.008
        orbitRingsRef.current.rotation.y -= 0.004
      }

      pulseSpheresRef.current.forEach(p => {
        p.progress = (p.progress + p.speed) % 1
        const pos = p.curve.getPointAt(p.progress)
        p.mesh.position.copy(pos)
      })

      renderer.render(scene, camera)

      // Projeção das tags na tela
      const tags: ProjectedTag[] = []

      // 1. Tag do Cofre Central (Sempre visível)
      tempVec.set(0, 68, 0)
      tempVec.project(camera)
      if (tempVec.z < 1) {
        const sx = (tempVec.x * 0.5 + 0.5) * width
        const sy = (-tempVec.y * 0.5 + 0.5) * height
        tags.push({
          id: 'hub-tag',
          type: 'hub',
          name: vaultName,
          subtitle: 'Corporate HQ • Governança Central',
          screenX: sx,
          screenY: sy,
          visible: true
        })
      }

      // 2. Tags dos Esquadrões (Sempre visíveis, SEM quebra de linha!)
      squads.forEach((sq, sIdx) => {
        const { x: sqX, z: sqZ } = computeSquadCoords(sIdx, totalSquads)
        tempVec.set(sqX, 28, sqZ + 120)
        tempVec.project(camera)
        if (tempVec.z < 1) {
          const sx = (tempVec.x * 0.5 + 0.5) * width
          const sy = (-tempVec.y * 0.5 + 0.5) * height
          const count = (sq.pipeline || []).length
          tags.push({
            id: `squad-tag-${sq.id}`,
            type: 'squad',
            name: sq.name,
            subtitle: `(${count} ${count === 1 ? 'Agente' : 'Agentes'})`,
            icon: sq.icon,
            squadId: sq.id,
            squad: sq,
            screenX: sx,
            screenY: sy,
            visible: true
          })
        }

        // 3. Tags de cada Agente: APARECEM SOMENTE NO ZOOM PRÓXIMO OU HOVER
        const pipeline = sq.pipeline || []
        pipeline.forEach(p => {
          const desk = deskMeshesRef.current.get(p.agentId)
          if (desk) {
            desk.getWorldPosition(tempVec)
            tempVec.y += 32
            tempVec.project(camera)
            if (tempVec.z < 1) {
              const sx = (tempVec.x * 0.5 + 0.5) * width
              const sy = (-tempVec.y * 0.5 + 0.5) * height
              const ag = agents.find(a => a.id === p.agentId)
              if (ag) {
                // Aparece apenas no zoom próximo ou se estiver selecionado / hovered
                const showAgentTag = zoomed || selectedAgentId === ag.id || hoveredAgentId === ag.id
                if (showAgentTag) {
                  tags.push({
                    id: `agent-tag-${ag.id}`,
                    type: 'agent',
                    name: ag.name,
                    icon: ag.icon,
                    agentId: ag.id,
                    screenX: sx,
                    screenY: sy,
                    visible: true
                  })
                }
              }
            }
          }
        })
      })

      setProjectedTags(tags)
    }

    animate()

    const handleResize = () => {
      if (!container) return
      width = container.clientWidth
      height = container.clientHeight
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      renderer.setSize(width, height)
    }
    window.addEventListener('resize', handleResize)

    // Raycasting para clique e hover nas mesas 3D
    const raycaster = new THREE.Raycaster()
    const mouse = new THREE.Vector2()

    const handleCanvasMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect()
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1

      raycaster.setFromCamera(mouse, camera)
      const allDesks = Array.from(deskMeshesRef.current.values())
      const intersects = raycaster.intersectObjects(allDesks, true)

      if (intersects.length > 0) {
        let curr: THREE.Object3D | null = intersects[0].object
        while (curr && !curr.userData.agentId && curr.parent) {
          curr = curr.parent
        }
        if (curr && curr.userData.agentId) {
          setHoveredAgentId(curr.userData.agentId)
          canvas.style.cursor = 'pointer'
          return
        }
      }
      setHoveredAgentId(null)
      canvas.style.cursor = navMode === 'pan' ? 'grab' : 'default'
    }

    const handleCanvasClick = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect()
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1

      raycaster.setFromCamera(mouse, camera)
      const allDesks = Array.from(deskMeshesRef.current.values())
      const intersects = raycaster.intersectObjects(allDesks, true)

      if (intersects.length > 0) {
        let curr: THREE.Object3D | null = intersects[0].object
        while (curr && !curr.userData.agentId && curr.parent) {
          curr = curr.parent
        }
        if (curr && curr.userData.agentId) {
          setSelectedAgentId(curr.userData.agentId)
        }
      }
    }

    canvas.addEventListener('mousemove', handleCanvasMouseMove)
    canvas.addEventListener('click', handleCanvasClick)

    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener('resize', handleResize)
      canvas.removeEventListener('mousemove', handleCanvasMouseMove)
      canvas.removeEventListener('click', handleCanvasClick)
      controls.dispose()
      renderer.dispose()
    }
  }, [squads, agents, vaultName, selectedAgentId, hoveredAgentId, navMode])

  // Resetar câmera e alvo
  const handleResetCamera = () => {
    if (!cameraRef.current || !controlsRef.current) return
    cameraRef.current.position.set(0, 480, 750)
    controlsRef.current.target.set(0, 0, 0)
    controlsRef.current.update()
  }

  const handleZoom = (delta: number) => {
    if (!cameraRef.current || !controlsRef.current) return
    const factor = delta > 0 ? 0.82 : 1.18
    cameraRef.current.position.multiplyScalar(factor)
    controlsRef.current.update()
  }

  const handleToggleFullscreen = () => {
    if (!containerRef.current) return
    if (!isFullscreen) {
      containerRef.current.requestFullscreen?.().catch(() => {})
      setIsFullscreen(true)
    } else {
      document.exitFullscreen?.().catch(() => {})
      setIsFullscreen(false)
    }
  }

  // Salvar Configuração no Drawer
  const handleSaveConfig = () => {
    if (!selectedAgent) return

    const actions: AgentActionPermission[] = []
    if (formCanReadVault) actions.push('read_context')
    if (formCanWriteVault) {
      actions.push('prepare_draft')
      actions.push('propose_patch')
    }
    if (formAutonomous) actions.push('create_tasks')

    const updatedAgent: AgentProfileVersion = {
      ...selectedAgent,
      name: formName || selectedAgent.name,
      roleDescription: formTask || selectedAgent.roleDescription,
      state: (formIsActive ? 'available' : 'paused') as AgentState,
      skills: formIntegrations,
      triggerMode: (formAutonomous ? 'routine' : 'on_demand') as TriggerMode,
      allowedActions: actions
    }

    if (onSaveAgent) {
      onSaveAgent(updatedAgent)
    }

    if (formSquadId !== (selectedAgentCurrentSquad?.id || '')) {
      if (selectedAgentCurrentSquad) {
        const nextPipeline = (selectedAgentCurrentSquad.pipeline || []).filter(
          p => p.agentId !== selectedAgent.id
        )
        const nextNodes = (selectedAgentCurrentSquad.nodes || []).filter(
          n => n.agentId !== selectedAgent.id
        )
        onSaveSquad({
          ...selectedAgentCurrentSquad,
          pipeline: nextPipeline,
          nodes: nextNodes
        })
      }

      if (formSquadId) {
        const targetSquad = squads.find(s => s.id === formSquadId)
        if (targetSquad) {
          const nextStep: SquadPipelineStep = {
            id: `step_${selectedAgent.id}_${Date.now()}`,
            agentId: selectedAgent.id,
            enabled: true,
            roleInSquad: formTask || 'Especialista Operacional',
            order: (targetSquad.pipeline || []).length + 1,
            expectedOutput: 'text'
          }
          const nextPipeline = [...(targetSquad.pipeline || []), nextStep]
          onSaveSquad({
            ...targetSquad,
            pipeline: nextPipeline
          })
        }
      }
    }

    setSaveSuccessNotice(true)
    setTimeout(() => setSaveSuccessNotice(false), 2200)
  }

  const totalUniqueAgents = useMemo(() => {
    const ids = new Set<string>()
    squads.forEach(sq => {
      ;(sq.pipeline || []).forEach(p => ids.add(p.agentId))
      ;(sq.nodes || []).forEach(n => ids.add(n.agentId))
    })
    return ids.size || agents.length
  }, [squads, agents])

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden select-none bg-[#070b12]"
    >
      {/* =========================================================================
          1. HEADER SUPERIOR (TONS DE CONTAINERES INDUSTRIAIS)
          ========================================================================= */}
      <header className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-6 py-4 bg-gradient-to-b from-[#070b12]/95 via-[#070b12]/75 to-transparent pointer-events-none">
        <div className="flex items-center gap-3 pointer-events-auto">
          <div className="w-9 h-9 rounded-xl bg-sky-950/60 border border-sky-500/40 flex items-center justify-center text-sky-400 shadow-[0_0_15px_rgba(56,189,248,0.25)]">
            <Building2 className="w-5 h-5 text-sky-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold text-slate-100 tracking-tight">
                {vaultName}
              </h1>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-sky-500/15 border border-sky-500/30 text-sky-300 font-mono font-medium">
                ORGANOGRAMA 3D
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Sede Corporativa &bull; Governança de Departamentos e Especialistas
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 pointer-events-auto">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#0b1120]/90 border border-slate-800 text-xs text-slate-300 shadow-lg backdrop-blur-md">
            <Users className="w-3.5 h-3.5 text-sky-400" />
            <span>
              <strong className="text-slate-100">{squads.length}</strong> Departamentos
            </span>
            <span className="text-slate-600">&bull;</span>
            <span>
              <strong className="text-slate-100">{totalUniqueAgents}</strong> Especialistas
            </span>
          </div>

          {onOpenCreateSquadModal && (
            <button
              type="button"
              onClick={onOpenCreateSquadModal}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs transition-all shadow-[0_0_15px_rgba(56,189,248,0.3)] active:scale-95 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>Novo Departamento</span>
            </button>
          )}
        </div>
      </header>

      {/* =========================================================================
          2. CANVAS THREE.JS (RENDERIZAÇÃO REAL 3D WEBGL)
          ========================================================================= */}
      <canvas
        ref={canvasRef}
        className="w-full h-full block outline-none"
      />

      {/* =========================================================================
          3. TAGS 2D PROJETADAS (SEM QUEBRA DE LINHA & CONDICIONAIS POR ZOOM)
          ========================================================================= */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-10">
        {projectedTags.map(tag => {
          if (!tag.visible) return null

          // Tag do Cofre Central (Sempre visível)
          if (tag.type === 'hub') {
            return (
              <div
                key={tag.id}
                className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-auto whitespace-nowrap min-w-max shrink-0"
                style={{ left: `${tag.screenX}px`, top: `${tag.screenY}px`, whiteSpace: 'nowrap' }}
              >
                <div className="px-3.5 py-1 rounded-full bg-[#0b1120]/95 border border-sky-500/50 text-center shadow-2xl backdrop-blur-md flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-sky-400 shadow-[0_0_8px_#38bdf8] animate-pulse shrink-0" />
                  <span className="text-xs font-bold text-slate-100">{tag.name}</span>
                  <span className="text-[10px] font-mono text-sky-400 uppercase font-semibold">&bull; CORPORATE HQ</span>
                </div>
              </div>
            )
          }

          // Tag do Departamento (Sempre visível, SEM QUEBRA DE LINHA!)
          if (tag.type === 'squad') {
            return (
              <div
                key={tag.id}
                className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-auto whitespace-nowrap min-w-max shrink-0 z-20"
                style={{ left: `${tag.screenX}px`, top: `${tag.screenY}px`, whiteSpace: 'nowrap' }}
              >
                <div className="px-3.5 py-1.5 rounded-2xl bg-[#0b1120]/95 border border-slate-700/80 hover:border-sky-500/80 text-center shadow-2xl backdrop-blur-md flex items-center gap-2.5 transition-all w-max whitespace-nowrap shrink-0">
                  <div className="w-6 h-6 rounded-lg bg-sky-950/60 border border-sky-500/30 flex items-center justify-center text-sky-400 shrink-0">
                    {renderDynamicIcon(tag.icon || 'Users', 'w-3.5 h-3.5 text-sky-400')}
                  </div>
                  <div className="text-left flex items-center gap-2 whitespace-nowrap shrink-0">
                    <span className="text-xs font-bold text-slate-100 whitespace-nowrap">{tag.name}</span>
                    <span className="text-[10.5px] text-sky-300 font-mono font-medium whitespace-nowrap">
                      {tag.subtitle}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 ml-1 shrink-0">
                    {tag.squad && onOpenSquadChat && (
                      <button
                        type="button"
                        onClick={() => onOpenSquadChat(tag.squad!)}
                        className="p-1 rounded-lg bg-slate-800 hover:bg-sky-500 hover:text-slate-950 text-slate-300 transition-colors cursor-pointer"
                        title={`Conversar com equipe de ${tag.name}`}
                      >
                        <MessageSquare className="w-3 h-3" />
                      </button>
                    )}
                    {tag.squadId && (
                      <button
                        type="button"
                        onClick={() => onSelectSquad(tag.squadId!)}
                        className="px-2.5 py-0.5 rounded-lg bg-slate-800 hover:bg-sky-500 hover:text-slate-950 text-slate-200 text-[10.5px] font-medium flex items-center gap-0.5 transition-colors cursor-pointer shrink-0"
                      >
                        <span>Gerenciar</span>
                        <ChevronRight className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          }

          // Tag Flutuante do Agente: APARECE SOMENTE NO ZOOM PRÓXIMO OU HOVER
          if (tag.type === 'agent') {
            const isSelected = selectedAgentId === tag.agentId

            return (
              <div
                key={tag.id}
                onClick={() => tag.agentId && setSelectedAgentId(tag.agentId)}
                className={`absolute -translate-x-1/2 -translate-y-1/2 pointer-events-auto cursor-pointer transition-all duration-150 whitespace-nowrap min-w-max shrink-0 ${
                  isSelected ? 'scale-110 z-30' : 'hover:scale-105 z-20'
                }`}
                style={{ left: `${tag.screenX}px`, top: `${tag.screenY}px`, whiteSpace: 'nowrap' }}
              >
                <div
                  className={`px-2 py-0.5 rounded-full border text-[10.5px] font-medium flex items-center gap-1.5 shadow-lg backdrop-blur-md ${
                    isSelected
                      ? 'bg-sky-500 border-sky-400 text-slate-950 font-bold shadow-[0_0_12px_rgba(56,189,248,0.5)]'
                      : 'bg-[#0b1120]/95 border-slate-700/80 text-slate-200 hover:border-sky-400'
                  }`}
                >
                  <AgentIcon variant={tag.icon} size={14} className="shrink-0 rounded-full" />
                  <span className="truncate max-w-[95px]">{tag.name}</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399] shrink-0" />
                </div>
              </div>
            )
          }

          return null
        })}
      </div>

      {/* =========================================================================
          4. BARRA DE CONTROLES INFERIOR (PAN LIVRE, ÓRBITA, ZOOM, RESET)
          ========================================================================= */}
      <nav
        aria-label="Controles de visualização 3D"
        className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 px-3 py-2 rounded-2xl bg-[#0b1120]/95 border border-slate-800 shadow-2xl backdrop-blur-xl pointer-events-auto"
      >
        {/* Alternador de Modo de Arraste (Mover vs Girar) */}
        <div className="flex items-center rounded-xl bg-slate-900/80 p-0.5 border border-slate-800/80">
          <button
            type="button"
            onClick={() => setNavMode('pan')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              navMode === 'pan'
                ? 'bg-sky-500 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Modo Mover: Clique e arraste com o botão esquerdo para transladar livremente pelo mapa 3D"
          >
            <Move className="w-3.5 h-3.5" />
            <span>Mover (Pan)</span>
          </button>

          <button
            type="button"
            onClick={() => setNavMode('orbit')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              navMode === 'orbit'
                ? 'bg-sky-500 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Modo Girar: Clique e arraste para orbitar o ângulo da câmera"
          >
            <Compass className="w-3.5 h-3.5" />
            <span>Girar (Órbita)</span>
          </button>
        </div>

        <div className="w-px h-4 bg-slate-800 mx-1" />

        <button
          type="button"
          onClick={() => handleZoom(1)}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors cursor-pointer"
          title="Aproximar (Zoom In)"
        >
          <ZoomIn className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={() => handleZoom(-1)}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors cursor-pointer"
          title="Afastar (Zoom Out)"
        >
          <ZoomOut className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={handleResetCamera}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors cursor-pointer"
          title="Centralizar Câmera no Cofre Central"
        >
          <RotateCcw className="w-4 h-4" />
        </button>

        <div className="w-px h-4 bg-slate-800 mx-1" />

        <button
          type="button"
          onClick={handleToggleFullscreen}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors cursor-pointer"
          title={isFullscreen ? 'Sair da Tela Cheia' : 'Tela Cheia'}
        >
          {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </button>
      </nav>

      {/* =========================================================================
          5. DRAWER LATERAL: "AGENT CONFIGURATION" (ESTILO CONTAINER INDUSTRIAL)
          ========================================================================= */}
      {selectedAgent && (
        <aside
          role="region"
          aria-label="Configuração do Agente"
          className="absolute top-0 right-0 bottom-0 w-96 bg-[#0b1120]/95 border-l border-slate-800 shadow-2xl z-30 flex flex-col backdrop-blur-2xl animate-in slide-in-from-right duration-200"
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
            <div>
              <span className="text-[10px] font-mono tracking-wider text-sky-400 uppercase font-semibold">
                AGENT CONFIGURATION
              </span>
              <h2 className="text-sm font-bold text-slate-100 truncate mt-0.5">
                {selectedAgent.name}
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setSelectedAgentId(null)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto custom-chat-scrollbar p-5 space-y-5">
            {/* 1. Preview da Estação de Trabalho do Agente com Turntable 3D Real */}
            <div className="relative rounded-2xl bg-gradient-to-b from-[#1e293b] to-[#0b1120] border border-sky-500/30 p-3 flex flex-col items-center justify-center shadow-inner overflow-hidden">
              <div className="absolute top-2.5 right-2.5 z-10 flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-[10px] text-emerald-300 font-medium font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399]" />
                <span>ONLINE</span>
              </div>

              {/* Canvas 3D do Turntable Giratório */}
              <div className="w-full h-36 relative flex items-center justify-center">
                <canvas
                  ref={turntableCanvasRef}
                  className="w-full h-full block outline-none"
                />
              </div>

              <div className="w-full pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-400 px-1">
                <span className="font-medium text-slate-200">{selectedAgent.name}</span>
                <span className="text-sky-400 font-mono">
                  {selectedAgentCurrentSquad ? selectedAgentCurrentSquad.name : 'Especialista Livre'}
                </span>
              </div>
            </div>

            {/* 2. Nome do Especialista */}
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1.5">
                Nome do Especialista
              </label>
              <div className="relative flex items-center">
                <input
                  type="text"
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  placeholder="Nome do agente..."
                  className="w-full bg-[#1e293b] border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-500"
                />
                <Pencil className="w-3.5 h-3.5 text-slate-500 absolute right-3 pointer-events-none" />
              </div>
            </div>

            {/* 3. Departamento (Esquadrão) */}
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1.5">
                Departamento (Esquadrão)
              </label>
              <select
                value={formSquadId}
                onChange={e => setFormSquadId(e.target.value)}
                className="w-full bg-[#1e293b] border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-sky-500 cursor-pointer"
              >
                <option value="">Sem Departamento (Livre)</option>
                {squads.map(sq => (
                  <option key={sq.id} value={sq.id}>
                    {sq.name}
                  </option>
                ))}
              </select>
            </div>

            {/* 4. Função Principal (Assigned Task) */}
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1.5">
                Função Principal (Assigned Task)
              </label>
              <input
                type="text"
                value={formTask}
                onChange={e => setFormTask(e.target.value)}
                placeholder="Ex: Tier-1 Ticketing, Redação, Análise..."
                className="w-full bg-[#1e293b] border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-500"
              />
            </div>

            {/* 5. Nível de Acesso (Access Level) */}
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1.5">
                Nível de Acesso (Access Level)
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {(['low', 'medium', 'high'] as const).map(lvl => {
                  const isSel = formAccessLevel === lvl
                  const labels = { low: 'Básico', medium: 'Médio', high: 'Total / Root' }
                  return (
                    <button
                      key={lvl}
                      type="button"
                      onClick={() => setFormAccessLevel(lvl)}
                      className={`py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                        isSel
                          ? 'bg-sky-500 text-slate-950 font-bold shadow-sm'
                          : 'bg-[#1e293b] text-slate-400 hover:bg-slate-700 hover:text-slate-200 border border-slate-750'
                      }`}
                    >
                      {labels[lvl]}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* 6. Integrações & Ferramentas Ativas */}
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1.5">
                Integrações & Ferramentas Ativas
              </label>
              <div className="flex flex-wrap gap-1.5">
                {AVAILABLE_INTEGRATIONS.map(item => {
                  const isActive = formIntegrations.includes(item.id)
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setFormIntegrations(prev =>
                          prev.includes(item.id)
                            ? prev.filter(x => x !== item.id)
                            : [...prev, item.id]
                        )
                      }}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all cursor-pointer flex items-center gap-1.5 ${
                        isActive
                          ? 'bg-sky-500/20 border-sky-400 text-sky-200'
                          : 'bg-[#1e293b] border-slate-700/80 text-slate-400 hover:border-slate-600'
                      }`}
                    >
                      <span
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ backgroundColor: item.color }}
                      />
                      <span>{item.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* 7. Toggles Operacionais */}
            <div className="space-y-3 pt-2 border-t border-slate-800">
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-xs text-slate-300">Especialista Ativo no Esquadrão</span>
                <input
                  type="checkbox"
                  checked={formIsActive}
                  onChange={e => setFormIsActive(e.target.checked)}
                  className="w-4 h-4 rounded text-sky-500 focus:ring-0 cursor-pointer accent-sky-500"
                />
              </label>

              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-xs text-slate-300">Acesso de Leitura ao Cofre</span>
                <input
                  type="checkbox"
                  checked={formCanReadVault}
                  onChange={e => setFormCanReadVault(e.target.checked)}
                  className="w-4 h-4 rounded text-sky-500 focus:ring-0 cursor-pointer accent-sky-500"
                />
              </label>

              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-xs text-slate-300">Permissão de Escrita de Notas</span>
                <input
                  type="checkbox"
                  checked={formCanWriteVault}
                  onChange={e => setFormCanWriteVault(e.target.checked)}
                  className="w-4 h-4 rounded text-sky-500 focus:ring-0 cursor-pointer accent-sky-500"
                />
              </label>

              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-xs text-slate-300">Geração Autônoma</span>
                <input
                  type="checkbox"
                  checked={formAutonomous}
                  onChange={e => setFormAutonomous(e.target.checked)}
                  className="w-4 h-4 rounded text-sky-500 focus:ring-0 cursor-pointer accent-sky-500"
                />
              </label>
            </div>
          </div>

          {/* Rodapé do Drawer */}
          <div className="p-4 border-t border-slate-800 space-y-2 bg-[#090d16]">
            {saveSuccessNotice && (
              <div className="p-2 rounded-lg bg-emerald-950/60 border border-emerald-500/50 text-emerald-300 text-xs flex items-center justify-center gap-1.5 animate-in fade-in duration-150">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Configurações salvas com sucesso!</span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleSaveConfig}
                className="w-full py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs transition-all shadow-[0_0_15px_rgba(56,189,248,0.25)] active:scale-95 cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Salvar Config</span>
              </button>

              {onOpenAgentChat && (
                <button
                  type="button"
                  onClick={() => onOpenAgentChat(selectedAgent.id)}
                  className="w-full py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 font-semibold text-xs transition-all shadow-sm active:scale-95 cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>Conversar</span>
                </button>
              )}
            </div>

            {selectedAgentCurrentSquad && (
              <button
                type="button"
                onClick={() => onSelectSquad(selectedAgentCurrentSquad.id)}
                className="w-full py-1.5 rounded-xl bg-slate-800/60 hover:bg-slate-800 text-slate-300 text-xs font-medium transition-colors cursor-pointer flex items-center justify-center gap-1.5"
              >
                <span>Ver no Esquadrão ({selectedAgentCurrentSquad.name})</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </aside>
      )}
    </div>
  )
}
