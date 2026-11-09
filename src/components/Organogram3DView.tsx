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
  floorBg: 0x060910,         // Fundo escuro do grid
  containerNavy: 0x0b1120,   // Base escura do container
  containerSteel: 0x1e293b,  // Chapa de aço industrial
  containerSlate: 0x334155,  // Bordas e frisos metálicos
  containerBlue: 0x0284c7,   // Azul marítimo de container
  neonCyan: 0x38bdf8,        // Neon cyan das conexões e conduítes
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
  const [isFullscreen, setIsFullscreen] = useState(false)

  // Modo de Navegação da Câmera (Pan Livre vs Órbita)
  const [navMode, setNavMode] = useState<'pan' | 'orbit'>('pan')

  // Refs de estado para uso dentro do Three.js sem causar recreação do cenário
  const selectedAgentIdRef = useRef<string | null>(selectedAgentId)
  selectedAgentIdRef.current = selectedAgentId

  const hoveredAgentIdRef = useRef<string | null>(null)
  const tagRefs = useRef<Map<string, HTMLDivElement>>(new Map())

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

  // Atualizar modo do OrbitControls (Pan vs Orbit) dinamicamente sem recriar a cena
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
  // MINI TURNTABLE 3D NO DRAWER PARA O AGENTE SELECIONADO (SUPER LEVE)
  // =========================================================================
  useEffect(() => {
    const canvas = turntableCanvasRef.current
    if (!canvas || !selectedAgent) return

    const ttWidth = canvas.clientWidth || 300
    const ttHeight = canvas.clientHeight || 150

    const ttScene = new THREE.Scene()
    ttScene.background = new THREE.Color(0x0f172a)

    const ttCamera = new THREE.PerspectiveCamera(30, ttWidth / ttHeight, 1, 1000)
    ttCamera.position.set(0, 36, 70)
    ttCamera.lookAt(0, 10, 0)

    const ttRenderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'low-power'
    })
    ttRenderer.setSize(ttWidth, ttHeight)
    ttRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))

    const ttAmbient = new THREE.AmbientLight(0xffffff, 1.2)
    ttScene.add(ttAmbient)

    const ttDirLight = new THREE.DirectionalLight(0x38bdf8, 1.8)
    ttDirLight.position.set(30, 50, 30)
    ttScene.add(ttDirLight)

    const ttGroup = new THREE.Group()

    // Base giratória com anel circular de neon cyan
    const discGeo = new THREE.CylinderGeometry(22, 24, 2, 32)
    const discMat = new THREE.MeshStandardMaterial({
      color: CONTAINER_PALETTE.containerNavy,
      metalness: 0.8,
      roughness: 0.3
    })
    const disc = new THREE.Mesh(discGeo, discMat)
    disc.position.y = 1
    ttGroup.add(disc)

    const ringGeo = new THREE.TorusGeometry(21, 0.6, 12, 40)
    const ringMat = new THREE.MeshStandardMaterial({
      color: CONTAINER_PALETTE.neonCyan,
      emissive: CONTAINER_PALETTE.neonCyan,
      emissiveIntensity: 2.0
    })
    const ring = new THREE.Mesh(ringGeo, ringMat)
    ring.rotation.x = Math.PI / 2
    ring.position.y = 2.1
    ttGroup.add(ring)

    // Mesa Branca de Alto Contraste
    const deskGeo = new THREE.BoxGeometry(25, 2, 14)
    const deskMat = new THREE.MeshStandardMaterial({
      color: CONTAINER_PALETTE.deskTop,
      roughness: 0.25,
      metalness: 0.4
    })
    const desk = new THREE.Mesh(deskGeo, deskMat)
    desk.position.set(0, 9.5, -1.5)
    ttGroup.add(desk)

    // Pernas cromadas
    const legGeo = new THREE.CylinderGeometry(0.7, 0.7, 8.5, 10)
    const legMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.9, roughness: 0.2 })
    const legCoords = [[-11, -5.5], [11, -5.5], [-11, 4.5], [11, 4.5]]
    legCoords.forEach(([lx, lz]) => {
      const leg = new THREE.Mesh(legGeo, legMat)
      leg.position.set(lx, 4.75, lz - 1.5)
      ttGroup.add(leg)
    })

    // Monitores duplos luminosos
    const monChassisGeo = new THREE.BoxGeometry(8.5, 5.8, 0.6)
    const monMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.8 })
    const screenGeo = new THREE.PlaneGeometry(7.8, 5.2)
    const screenMat = new THREE.MeshStandardMaterial({
      color: CONTAINER_PALETTE.neonCyan,
      emissive: CONTAINER_PALETTE.neonCyan,
      emissiveIntensity: 2.2
    })

    const lMon = new THREE.Mesh(monChassisGeo, monMat)
    lMon.position.set(-5.2, 13.5, -4.5)
    lMon.rotation.y = 0.24
    const lScr = new THREE.Mesh(screenGeo, screenMat)
    lScr.position.z = 0.35
    lMon.add(lScr)
    ttGroup.add(lMon)

    const rMon = new THREE.Mesh(monChassisGeo, monMat)
    rMon.position.set(5.2, 13.5, -4.5)
    rMon.rotation.y = -0.24
    const rScr = new THREE.Mesh(screenGeo, screenMat)
    rScr.position.z = 0.35
    rMon.add(rScr)
    ttGroup.add(rMon)

    // Cadeira ergonômica
    const chairGroup = new THREE.Group()
    chairGroup.position.set(0, 0, 5.5)
    const seatGeo = new THREE.BoxGeometry(9.5, 1.8, 9)
    const chairMat = new THREE.MeshStandardMaterial({ color: CONTAINER_PALETTE.chairDark, roughness: 0.85 })
    const seat = new THREE.Mesh(seatGeo, chairMat)
    seat.position.y = 6
    chairGroup.add(seat)
    const backGeo = new THREE.BoxGeometry(9.5, 10, 1.6)
    const back = new THREE.Mesh(backGeo, chairMat)
    back.position.set(0, 12, 3.8)
    chairGroup.add(back)
    ttGroup.add(chairGroup)

    // Avatar do Agente
    const bodyGeo = new THREE.BoxGeometry(6.8, 8.5, 4.8)
    const suitMat = new THREE.MeshStandardMaterial({ color: CONTAINER_PALETTE.agentSuit, roughness: 0.4 })
    const body = new THREE.Mesh(bodyGeo, suitMat)
    body.position.set(0, 11, 4)
    ttGroup.add(body)

    const headGeo = new THREE.SphereGeometry(3.0, 14, 14)
    const headMat = new THREE.MeshStandardMaterial({ color: CONTAINER_PALETTE.agentSkin, roughness: 0.5 })
    const head = new THREE.Mesh(headGeo, headMat)
    head.position.set(0, 17.5, 4)
    ttGroup.add(head)

    const visorGeo = new THREE.BoxGeometry(4.4, 1.4, 1.8)
    const visorMat = new THREE.MeshStandardMaterial({
      color: CONTAINER_PALETTE.neonCyan,
      emissive: CONTAINER_PALETTE.neonCyan,
      emissiveIntensity: 2.8
    })
    const visor = new THREE.Mesh(visorGeo, visorMat)
    visor.position.set(0, 17.5, 1.8)
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
  // MONTAGEM DO CENÁRIO PRINCIPAL THREE.JS (OTIMIZADO, LEVE, CÂMERA PERSISTENTE)
  // =========================================================================
  useEffect(() => {
    const container = containerRef.current
    const canvas = canvasRef.current
    if (!container || !canvas) return

    let width = container.clientWidth
    let height = container.clientHeight

    // 1. Scene, Camera, Renderer (Otimizado sem sombras pesadas)
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(CONTAINER_PALETTE.floorBg)

    const camera = new THREE.PerspectiveCamera(36, width / height, 1, 3200)
    camera.position.set(0, 360, 560)
    camera.lookAt(0, 0, 0)
    cameraRef.current = camera

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance'
    })
    renderer.setSize(width, height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
    // Desabilitar shadowMap para máxima performance e leveza
    renderer.shadowMap.enabled = false

    // 2. OrbitControls com Pan Totalmente Livre e Desbloqueado
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.screenSpacePanning = true // PAN TOTALMENTE LIVRE PELO CENÁRIO
    controls.maxPolarAngle = Math.PI / 2 - 0.04
    controls.minDistance = 140
    controls.maxDistance = 1400
    controls.target.set(0, 0, 0)
    controls.mouseButtons = {
      LEFT: THREE.MOUSE.PAN,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.ROTATE
    }
    controlsRef.current = controls

    // 3. Iluminação Otimizada
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.25)
    scene.add(ambientLight)

    const dirLight = new THREE.DirectionalLight(0xe0f2fe, 1.4)
    dirLight.position.set(200, 400, 260)
    scene.add(dirLight)

    const vaultPointLight = new THREE.PointLight(CONTAINER_PALETTE.neonCyan, 2.5, 450)
    vaultPointLight.position.set(0, 24, 0)
    scene.add(vaultPointLight)

    // 4. Piso Industrial com Grid Leve
    const floorSize = 2400
    const gridHelper = new THREE.GridHelper(floorSize, 60, CONTAINER_PALETTE.neonCyan, 0x1e293b)
    gridHelper.position.y = -0.5
    // @ts-ignore
    gridHelper.material.opacity = 0.22
    // @ts-ignore
    gridHelper.material.transparent = true
    scene.add(gridHelper)

    // =======================================================================
    // 5. CENTRO: O COFRE CORPORATIVO REDUZIDO (SEM CRISTAL/ANÉIS GIRANDO)
    // =======================================================================
    const hubGroup = new THREE.Group()
    hubGroup.position.set(0, 0, 0)

    // Base inferior reduzida (disco de aço naval compacto)
    const hubRadius = 68
    const baseCylGeo = new THREE.CylinderGeometry(hubRadius, hubRadius + 8, 10, 48)
    const baseCylMat = new THREE.MeshStandardMaterial({
      color: CONTAINER_PALETTE.containerNavy,
      roughness: 0.4,
      metalness: 0.85
    })
    const baseCyl = new THREE.Mesh(baseCylGeo, baseCylMat)
    baseCyl.position.y = 5
    hubGroup.add(baseCyl)

    // Anel de canal luminoso Cyan compacto
    const cyanRingGeo = new THREE.TorusGeometry(hubRadius - 1, 2.2, 12, 48)
    const cyanRingMat = new THREE.MeshStandardMaterial({
      color: CONTAINER_PALETTE.neonCyan,
      emissive: CONTAINER_PALETTE.neonCyan,
      emissiveIntensity: 2.5,
      roughness: 0.2,
      metalness: 0.8
    })
    const cyanRing = new THREE.Mesh(cyanRingGeo, cyanRingMat)
    cyanRing.rotation.x = Math.PI / 2
    cyanRing.position.y = 10
    hubGroup.add(cyanRing)

    // Platô superior biselado limpo (sem elementos flutuantes/girando acima)
    const topPlateGeo = new THREE.CylinderGeometry(hubRadius - 8, hubRadius - 8, 4, 48)
    const topPlateMat = new THREE.MeshStandardMaterial({
      color: CONTAINER_PALETTE.containerSteel,
      roughness: 0.5,
      metalness: 0.75
    })
    const topPlate = new THREE.Mesh(topPlateGeo, topPlateMat)
    topPlate.position.y = 12
    hubGroup.add(topPlate)

    // Disco central embutido com brilho suave e elegante
    const coreDiscGeo = new THREE.CylinderGeometry(hubRadius - 20, hubRadius - 20, 1, 36)
    const coreDiscMat = new THREE.MeshStandardMaterial({
      color: CONTAINER_PALETTE.containerNavy,
      roughness: 0.2,
      metalness: 0.9
    })
    const coreDisc = new THREE.Mesh(coreDiscGeo, coreDiscMat)
    coreDisc.position.y = 14.5
    hubGroup.add(coreDisc)

    const coreRingGeo = new THREE.TorusGeometry(hubRadius - 22, 1.2, 10, 36)
    const coreRingMat = new THREE.MeshStandardMaterial({
      color: CONTAINER_PALETTE.neonCyan,
      emissive: CONTAINER_PALETTE.neonCyan,
      emissiveIntensity: 2.0
    })
    const coreRing = new THREE.Mesh(coreRingGeo, coreRingMat)
    coreRing.rotation.x = Math.PI / 2
    coreRing.position.y = 15.1
    hubGroup.add(coreRing)

    scene.add(hubGroup)

    // =======================================================================
    // 6. PLATAFORMAS DOS DEPARTAMENTOS COMPACTAS (ESPAÇAMENTOS REDUZIDOS)
    // =======================================================================
    const totalSquads = squads.length
    deskMeshesRef.current.clear()
    pulseSpheresRef.current = []

    // Espaçamentos compactos trazendo as plataformas mais próximas do centro
    const computeSquadCoords = (idx: number, total: number) => {
      if (total === 1) return { x: 0, z: -270 }
      if (total === 2) {
        return idx === 0 ? { x: -310, z: -15 } : { x: 310, z: -15 }
      }
      if (total === 3) {
        if (idx === 0) return { x: -320, z: -110 }
        if (idx === 1) return { x: 320, z: -110 }
        return { x: 0, z: 240 }
      }
      if (total === 4) {
        if (idx === 0) return { x: -320, z: -120 }
        if (idx === 1) return { x: 320, z: -120 }
        if (idx === 2) return { x: -320, z: 130 }
        return { x: 320, z: 130 }
      }
      const angle = (idx / total) * Math.PI * 2 - Math.PI / 2
      return {
        x: Math.round(Math.cos(angle) * 380),
        z: Math.round(Math.sin(angle) * 250)
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

      // Tamanho reduzido e otimizado da plataforma
      const platWidth = 240
      const platDepth = 160
      const platHeight = 12

      // Base chanfrada (Tier 1)
      const basePlatformGeo = new THREE.BoxGeometry(platWidth + 8, 4, platDepth + 8)
      const basePlatformMat = new THREE.MeshStandardMaterial({
        color: CONTAINER_PALETTE.containerNavy,
        roughness: 0.5,
        metalness: 0.85
      })
      const basePlat = new THREE.Mesh(basePlatformGeo, basePlatformMat)
      basePlat.position.y = 2
      platformGroup.add(basePlat)

      // Corpo principal do container compacto (Tier 2)
      const platGeo = new THREE.BoxGeometry(platWidth, platHeight, platDepth)
      const platMat = new THREE.MeshStandardMaterial({
        color: CONTAINER_PALETTE.containerSteel,
        roughness: 0.45,
        metalness: 0.75
      })
      const platMesh = new THREE.Mesh(platGeo, platMat)
      platMesh.position.y = platHeight / 2 + 2
      platformGroup.add(platMesh)

      // Moldura Luminosa Cyan na Borda Superior (Tier 3)
      const edgeGeo = new THREE.BoxGeometry(platWidth + 1.5, 2, platDepth + 1.5)
      const edgeMat = new THREE.MeshStandardMaterial({
        color: CONTAINER_PALETTE.neonCyan,
        emissive: CONTAINER_PALETTE.containerBlue,
        emissiveIntensity: 2.2,
        roughness: 0.2,
        metalness: 0.8
      })
      const edgeMesh = new THREE.Mesh(edgeGeo, edgeMat)
      edgeMesh.position.y = platHeight + 2.5
      platformGroup.add(edgeMesh)

      // Caixa Terminal de Conexão dos Conduítes na Borda Interna
      const dockWidth = 28
      const dockDepth = 10
      const dockHeight = 8
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

      // =====================================================================
      // 7. MESAS REFINADAS & AGENTES EM ALTO CONTRASTE (COMPACTOS & NÍTITOS)
      // =====================================================================
      const cols = 3
      const deskSpacingX = 68
      const deskSpacingZ = 58

      squadAgents.forEach((ag, agIdx) => {
        const col = agIdx % cols
        const row = Math.floor(agIdx / cols)

        const deskX = (col - (cols - 1) / 2) * deskSpacingX
        const deskZ = (row - 0.5) * deskSpacingZ

        const workstation = new THREE.Group()
        workstation.position.set(deskX, platHeight + 2.5, deskZ)
        workstation.userData = { agentId: ag.id, squadId: sq.id }

        // A. Tampo da Mesa em Branco/Laminado Titânio Claro (Destaque absoluto!)
        const deskTopGeo = new THREE.BoxGeometry(32, 2.4, 18)
        const deskTopMat = new THREE.MeshStandardMaterial({
          color: CONTAINER_PALETTE.deskTop,
          roughness: 0.25,
          metalness: 0.45
        })
        const deskTop = new THREE.Mesh(deskTopGeo, deskTopMat)
        deskTop.position.y = 9
        workstation.add(deskTop)

        // Mousepad escuro
        const padGeo = new THREE.BoxGeometry(26, 0.3, 13)
        const padMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.9 })
        const pad = new THREE.Mesh(padGeo, padMat)
        pad.position.set(0, 10.3, 0)
        workstation.add(pad)

        // B. Pernas Metálicas Cromadas
        const legGeo = new THREE.CylinderGeometry(1.0, 1.0, 9, 10)
        const legMat = new THREE.MeshStandardMaterial({ color: CONTAINER_PALETTE.deskLegs, metalness: 0.92, roughness: 0.15 })
        const legPositions = [
          [-14, 4.5, -7],
          [14, 4.5, -7],
          [-14, 4.5, 7],
          [14, 4.5, 7]
        ]
        legPositions.forEach(([lx, ly, lz]) => {
          const leg = new THREE.Mesh(legGeo, legMat)
          leg.position.set(lx, ly, lz)
          workstation.add(leg)
        })

        // C. Monitores Duplos Angulados com Telas Luminosas
        const monitorChassisGeo = new THREE.BoxGeometry(10, 6.8, 0.8)
        const monitorChassisMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.85, roughness: 0.25 })

        const screenGeo = new THREE.PlaneGeometry(9.2, 6)
        const leftScreenMat = new THREE.MeshStandardMaterial({
          color: CONTAINER_PALETTE.neonCyan,
          emissive: CONTAINER_PALETTE.neonCyan,
          emissiveIntensity: 2.2,
          roughness: 0.1
        })
        const rightScreenMat = new THREE.MeshStandardMaterial({
          color: 0x38bdf8,
          emissive: CONTAINER_PALETTE.containerBlue,
          emissiveIntensity: 1.8,
          roughness: 0.1
        })

        // Monitor Esquerdo
        const leftMon = new THREE.Mesh(monitorChassisGeo, monitorChassisMat)
        leftMon.position.set(-6.5, 14.5, -4.5)
        leftMon.rotation.y = 0.25
        const leftScreen = new THREE.Mesh(screenGeo, leftScreenMat)
        leftScreen.position.z = 0.45
        leftMon.add(leftScreen)
        workstation.add(leftMon)

        // Monitor Direito
        const rightMon = new THREE.Mesh(monitorChassisGeo, monitorChassisMat)
        rightMon.position.set(6.5, 14.5, -4.5)
        rightMon.rotation.y = -0.25
        const rightScreen = new THREE.Mesh(screenGeo, rightScreenMat)
        rightScreen.position.z = 0.45
        rightMon.add(rightScreen)
        workstation.add(rightMon)

        // D. Cadeira Ergonômica 3D
        const chairGroup = new THREE.Group()
        chairGroup.position.set(0, 0, 8)

        const seatGeo = new THREE.BoxGeometry(12, 2.2, 11)
        const chairMat = new THREE.MeshStandardMaterial({ color: CONTAINER_PALETTE.chairDark, roughness: 0.85 })
        const seat = new THREE.Mesh(seatGeo, chairMat)
        seat.position.y = 6.5
        chairGroup.add(seat)

        const backGeo = new THREE.BoxGeometry(11.5, 12.5, 2)
        const back = new THREE.Mesh(backGeo, chairMat)
        back.position.set(0, 13, 4.5)
        chairGroup.add(back)

        workstation.add(chairGroup)

        // E. Silhueta do Especialista 3D em Azul Royal Vibrante
        const bodyGeo = new THREE.BoxGeometry(8, 9.5, 5.5)
        const agentBodyMat = new THREE.MeshStandardMaterial({
          color: CONTAINER_PALETTE.agentSuit,
          roughness: 0.45,
          metalness: 0.2
        })
        const body = new THREE.Mesh(bodyGeo, agentBodyMat)
        body.position.set(0, 11.5, 6)
        workstation.add(body)

        // Braços alcançando a mesa
        const armGeo = new THREE.BoxGeometry(2.2, 2.2, 6.5)
        const leftArm = new THREE.Mesh(armGeo, agentBodyMat)
        leftArm.position.set(-4.6, 10.5, 3)
        workstation.add(leftArm)
        const rightArm = new THREE.Mesh(armGeo, agentBodyMat)
        rightArm.position.set(4.6, 10.5, 3)
        workstation.add(rightArm)

        // Cabeça do Especialista
        const headGeo = new THREE.SphereGeometry(3.6, 14, 14)
        const headMat = new THREE.MeshStandardMaterial({ color: CONTAINER_PALETTE.agentSkin, roughness: 0.5 })
        const head = new THREE.Mesh(headGeo, headMat)
        head.position.set(0, 19, 6)
        workstation.add(head)

        // Cabelo esculpido
        const hairGeo = new THREE.SphereGeometry(3.8, 14, 14)
        const hairMat = new THREE.MeshStandardMaterial({ color: CONTAINER_PALETTE.agentHair, roughness: 0.9 })
        const hair = new THREE.Mesh(hairGeo, hairMat)
        hair.position.set(0, 19.8, 6.5)
        hair.scale.set(1.02, 0.95, 0.9)
        workstation.add(hair)

        // Visor Luminoso Cyan
        const visorGeo = new THREE.BoxGeometry(5.2, 1.6, 1.8)
        const visorMat = new THREE.MeshStandardMaterial({
          color: CONTAINER_PALETTE.neonCyan,
          emissive: CONTAINER_PALETTE.neonCyan,
          emissiveIntensity: 3.0
        })
        const visor = new THREE.Mesh(visorGeo, visorMat)
        visor.position.set(0, 19, 3.2)
        workstation.add(visor)

        // Hitbox invisível para cliques fáceis
        const hitGeo = new THREE.BoxGeometry(38, 28, 30)
        const hitMat = new THREE.MeshBasicMaterial({ visible: false })
        const hitMesh = new THREE.Mesh(hitGeo, hitMat)
        hitMesh.position.y = 12
        workstation.add(hitMesh)

        platformGroup.add(workstation)
        deskMeshesRef.current.set(ag.id, workstation)
      })

      scene.add(platformGroup)

      // =======================================================================
      // 8. CONDUÍTES 3D CONTÍNUOS E LEVES (CONECTADOS AO TERMINAL DA PLATAFORMA)
      // =======================================================================
      const angle = Math.atan2(sqZ, sqX)
      const startX = Math.cos(angle) * hubRadius
      const startZ = Math.sin(angle) * hubRadius

      const isLeftSide = sqX < 0
      const endX = isLeftSide ? sqX + platWidth / 2 : sqX - platWidth / 2
      const endZ = sqZ

      const distX = endX - startX
      const distZ = endZ - startZ

      const mid1X = startX + distX * 0.35
      const mid1Z = startZ + distZ * 0.15
      const mid2X = startX + distX * 0.70
      const mid2Z = endZ

      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(startX, 8, startZ),
        new THREE.Vector3(mid1X, 5, mid1Z),
        new THREE.Vector3(mid2X, 5, mid2Z),
        new THREE.Vector3(endX, 8, endZ)
      ])

      // Tubo Central Blindado em Steel (resolução otimizada para leveza)
      const armorTubeGeo = new THREE.TubeGeometry(curve, 24, 2.8, 8, false)
      const armorTubeMat = new THREE.MeshStandardMaterial({
        color: CONTAINER_PALETTE.containerSteel,
        roughness: 0.35,
        metalness: 0.85
      })
      const armorTube = new THREE.Mesh(armorTubeGeo, armorTubeMat)
      scene.add(armorTube)

      // Fibra Cyan Neon Central Luminosa
      const coreTubeGeo = new THREE.TubeGeometry(curve, 24, 1.2, 6, false)
      const coreTubeMat = new THREE.MeshStandardMaterial({
        color: CONTAINER_PALETTE.neonCyan,
        emissive: CONTAINER_PALETTE.neonCyan,
        emissiveIntensity: 2.6,
        roughness: 0.15
      })
      const coreTube = new THREE.Mesh(coreTubeGeo, coreTubeMat)
      scene.add(coreTube)

      // Esfera de Pulso de Dados em Movimento
      const pulseGeo = new THREE.SphereGeometry(2.4, 12, 12)
      const pulseMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: CONTAINER_PALETTE.neonCyan,
        emissiveIntensity: 4.0
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
    // 9. LOOP DE ANIMAÇÃO COM MUTABILIDADE DIRETA NO DOM (ZERO RE-RENDERS REACT)
    // =======================================================================
    let animId: number
    const tempVec = new THREE.Vector3()

    const animate = () => {
      animId = requestAnimationFrame(animate)

      controls.update()

      // Calcular distância para visibilidade dos agentes sem disparar re-render no React
      const cameraDist = camera.position.distanceTo(controls.target)
      const zoomed = cameraDist < 460

      pulseSpheresRef.current.forEach(p => {
        p.progress = (p.progress + p.speed) % 1
        const pos = p.curve.getPointAt(p.progress)
        p.mesh.position.copy(pos)
      })

      renderer.render(scene, camera)

      // Atualização direta do DOM das Tags sem sobrecarregar o React
      // 1. Tag do Hub Central
      const hubEl = tagRefs.current.get('hub')
      if (hubEl) {
        tempVec.set(0, 48, 0)
        tempVec.project(camera)
        if (tempVec.z < 1) {
          const sx = (tempVec.x * 0.5 + 0.5) * width
          const sy = (-tempVec.y * 0.5 + 0.5) * height
          hubEl.style.transform = `translate3d(${sx}px, ${sy}px, 0) translate(-50%, -50%)`
          hubEl.style.display = 'block'
        } else {
          hubEl.style.display = 'none'
        }
      }

      // 2. Tags dos Esquadrões e Agentes
      squads.forEach((sq, sIdx) => {
        const sqEl = tagRefs.current.get(`squad-${sq.id}`)
        if (sqEl) {
          const { x: sqX, z: sqZ } = computeSquadCoords(sIdx, totalSquads)
          tempVec.set(sqX, 20, sqZ + 95)
          tempVec.project(camera)
          if (tempVec.z < 1) {
            const sx = (tempVec.x * 0.5 + 0.5) * width
            const sy = (-tempVec.y * 0.5 + 0.5) * height
            sqEl.style.transform = `translate3d(${sx}px, ${sy}px, 0) translate(-50%, -50%)`
            sqEl.style.display = 'block'
          } else {
            sqEl.style.display = 'none'
          }
        }

        const pipeline = sq.pipeline || []
        pipeline.forEach(p => {
          const agEl = tagRefs.current.get(`agent-${p.agentId}`)
          if (agEl) {
            const desk = deskMeshesRef.current.get(p.agentId)
            const isTargeted = selectedAgentIdRef.current === p.agentId || hoveredAgentIdRef.current === p.agentId
            const shouldShow = zoomed || isTargeted

            if (desk && shouldShow) {
              desk.getWorldPosition(tempVec)
              tempVec.y += 24
              tempVec.project(camera)
              if (tempVec.z < 1) {
                const sx = (tempVec.x * 0.5 + 0.5) * width
                const sy = (-tempVec.y * 0.5 + 0.5) * height
                agEl.style.transform = `translate3d(${sx}px, ${sy}px, 0) translate(-50%, -50%)`
                agEl.style.display = 'block'
              } else {
                agEl.style.display = 'none'
              }
            } else {
              agEl.style.display = 'none'
            }
          }
        })
      })
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

    // Raycasting com verificação segura sem recriar a cena
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
          hoveredAgentIdRef.current = curr.userData.agentId
          canvas.style.cursor = 'pointer'
          return
        }
      }
      hoveredAgentIdRef.current = null
      canvas.style.cursor = 'default'
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
  }, [squads, agents])

  // Resetar câmera e alvo para a perspectiva compacta padrão
  const handleResetCamera = () => {
    if (!cameraRef.current || !controlsRef.current) return
    cameraRef.current.position.set(0, 360, 560)
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
      className="relative w-full h-full overflow-hidden select-none bg-[#060910]"
    >
      {/* =========================================================================
          1. HEADER SUPERIOR
          ========================================================================= */}
      <header className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-6 py-4 bg-gradient-to-b from-[#060910]/95 via-[#060910]/75 to-transparent pointer-events-none">
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
          3. TAGS 2D PROJETADAS (ATUALIZADAS VIA DOM DIRETO - ULTRA LEVES)
          ========================================================================= */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-10">
        {/* Tag do Cofre Central */}
        <div
          ref={el => {
            if (el) tagRefs.current.set('hub', el)
            else tagRefs.current.delete('hub')
          }}
          className="absolute top-0 left-0 pointer-events-auto whitespace-nowrap min-w-max shrink-0 hidden"
          style={{ willChange: 'transform' }}
        >
          <div className="px-3.5 py-1 rounded-full bg-[#0b1120]/95 border border-sky-500/50 text-center shadow-2xl backdrop-blur-md flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-sky-400 shadow-[0_0_8px_#38bdf8] animate-pulse shrink-0" />
            <span className="text-xs font-bold text-slate-100">{vaultName}</span>
            <span className="text-[10px] font-mono text-sky-400 uppercase font-semibold">&bull; CORPORATE HQ</span>
          </div>
        </div>

        {/* Tags dos Esquadrões e dos Agentes */}
        {squads.map(sq => {
          const count = (sq.pipeline || []).length
          return (
            <React.Fragment key={sq.id}>
              {/* Tag do Departamento */}
              <div
                ref={el => {
                  if (el) tagRefs.current.set(`squad-${sq.id}`, el)
                  else tagRefs.current.delete(`squad-${sq.id}`)
                }}
                className="absolute top-0 left-0 pointer-events-auto whitespace-nowrap min-w-max shrink-0 z-20 hidden"
                style={{ willChange: 'transform' }}
              >
                <div className="px-3.5 py-1.5 rounded-2xl bg-[#0b1120]/95 border border-slate-700/80 hover:border-sky-500/80 text-center shadow-2xl backdrop-blur-md flex items-center gap-2.5 transition-all w-max whitespace-nowrap shrink-0">
                  <div className="w-6 h-6 rounded-lg bg-sky-950/60 border border-sky-500/30 flex items-center justify-center text-sky-400 shrink-0">
                    {renderDynamicIcon(sq.icon || 'Users', 'w-3.5 h-3.5 text-sky-400')}
                  </div>
                  <div className="text-left flex items-center gap-2 whitespace-nowrap shrink-0">
                    <span className="text-xs font-bold text-slate-100 whitespace-nowrap">{sq.name}</span>
                    <span className="text-[10.5px] text-sky-300 font-mono font-medium whitespace-nowrap">
                      ({count} {count === 1 ? 'Agente' : 'Agentes'})
                    </span>
                  </div>

                  <div className="flex items-center gap-1 ml-1 shrink-0">
                    {onOpenSquadChat && (
                      <button
                        type="button"
                        onClick={() => onOpenSquadChat(sq)}
                        className="p-1 rounded-lg bg-slate-800 hover:bg-sky-500 hover:text-slate-950 text-slate-300 transition-colors cursor-pointer"
                        title={`Conversar com equipe de ${sq.name}`}
                      >
                        <MessageSquare className="w-3 h-3" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onSelectSquad(sq.id)}
                      className="px-2.5 py-0.5 rounded-lg bg-slate-800 hover:bg-sky-500 hover:text-slate-950 text-slate-200 text-[10.5px] font-medium flex items-center gap-0.5 transition-colors cursor-pointer shrink-0"
                    >
                      <span>Gerenciar</span>
                      <ChevronRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Tags dos Agentes do Esquadrão */}
              {(sq.pipeline || []).map(p => {
                const ag = agents.find(a => a.id === p.agentId)
                if (!ag) return null
                const isSelected = selectedAgentId === ag.id

                return (
                  <div
                    key={ag.id}
                    ref={el => {
                      if (el) tagRefs.current.set(`agent-${ag.id}`, el)
                      else tagRefs.current.delete(`agent-${ag.id}`)
                    }}
                    onClick={() => setSelectedAgentId(ag.id)}
                    className={`absolute top-0 left-0 pointer-events-auto cursor-pointer transition-transform duration-100 whitespace-nowrap min-w-max shrink-0 hidden ${
                      isSelected ? 'scale-110 z-30' : 'hover:scale-105 z-20'
                    }`}
                    style={{ willChange: 'transform' }}
                  >
                    <div
                      className={`px-2 py-0.5 rounded-full border text-[10.5px] font-medium flex items-center gap-1.5 shadow-lg backdrop-blur-md ${
                        isSelected
                          ? 'bg-sky-500 border-sky-400 text-slate-950 font-bold shadow-[0_0_12px_rgba(56,189,248,0.5)]'
                          : 'bg-[#0b1120]/95 border-slate-700/80 text-slate-200 hover:border-sky-400'
                      }`}
                    >
                      <AgentIcon variant={ag.icon} size={14} className="shrink-0 rounded-full" />
                      <span className="truncate max-w-[95px]">{ag.name}</span>
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399] shrink-0" />
                    </div>
                  </div>
                )
              })}
            </React.Fragment>
          )
        })}
      </div>

      {/* =========================================================================
          4. BARRA DE CONTROLES INFERIOR
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
            title="Modo Mover: Arraste para transladar livremente pelo mapa 3D"
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
            title="Modo Girar: Arraste para orbitar o ângulo da câmera"
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
          5. DRAWER LATERAL: "AGENT CONFIGURATION"
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
              <div className="w-full h-32 relative flex items-center justify-center">
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
