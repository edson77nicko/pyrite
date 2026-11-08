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
  CheckCircle2
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

const AVAILABLE_INTEGRATIONS = [
  { id: 'vault', label: 'Cofre Local (.md)', color: '#c59b27' },
  { id: 'web', label: 'Busca Web', color: '#38bdf8' },
  { id: 'code', label: 'Execução de Código', color: '#a855f7' },
  { id: 'slack', label: 'Slack', color: '#ec4899' },
  { id: 'zendesk', label: 'Zendesk', color: '#10b981' },
  { id: 'files', label: 'Análise de Arquivos', color: '#06b6d4' }
]

// Paleta de Cores Oficial do Pyrite
const PYRITE_GOLD = 0xc59b27
const PYRITE_DARK_TITANIUM = 0x14151b

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

  // Drawer Lateral do Agente Selecionado
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)

  // Tags 2D projetadas sobre a cena 3D (para ficarem 100% nítidas e horizontais)
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

  // =========================================================================
  // MONTAGEM DO CENÁRIO THREE.JS (CANVAS 3D REAL, MATERIAIS PYRITE, SOMBRAS)
  // =========================================================================
  useEffect(() => {
    const container = containerRef.current
    const canvas = canvasRef.current
    if (!container || !canvas) return

    let width = container.clientWidth
    let height = container.clientHeight

    // 1. Scene, Camera, Renderer
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x09090b)
    scene.fog = new THREE.FogExp2(0x09090b, 0.0008)

    const camera = new THREE.PerspectiveCamera(36, width / height, 1, 3500)
    // Ângulo isométrico elegante
    camera.position.set(0, 420, 680)
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

    // 2. Controles Orbitais Suaves
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.06
    controls.maxPolarAngle = Math.PI / 2 - 0.05 // Não passar por baixo do piso
    controls.minDistance = 250
    controls.maxDistance = 1500
    controls.target.set(0, 0, 0)
    controlsRef.current = controls

    // 3. Iluminação do Cenário (Ambiente escuro com pontos de destaque Dourados)
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.85)
    scene.add(ambientLight)

    const dirLight = new THREE.DirectionalLight(0xfffbeb, 1.3)
    dirLight.position.set(200, 450, 300)
    dirLight.castShadow = true
    dirLight.shadow.mapSize.width = 2048
    dirLight.shadow.mapSize.height = 2048
    dirLight.shadow.camera.near = 10
    dirLight.shadow.camera.far = 1500
    dirLight.shadow.camera.left = -600
    dirLight.shadow.camera.right = 600
    dirLight.shadow.camera.top = 600
    dirLight.shadow.camera.bottom = -600
    scene.add(dirLight)

    // Ponto de luz no núcleo do Cofre Central
    const vaultPointLight = new THREE.PointLight(PYRITE_GOLD, 3.2, 550)
    vaultPointLight.position.set(0, 35, 0)
    scene.add(vaultPointLight)

    // 4. Piso Infinito com Grid Dourado & Reflexão
    const floorSize = 2400
    const gridHelper = new THREE.GridHelper(floorSize, 80, PYRITE_GOLD, 0x1f2129)
    gridHelper.position.y = -0.5
    // @ts-ignore
    gridHelper.material.opacity = 0.25
    // @ts-ignore
    gridHelper.material.transparent = true
    scene.add(gridHelper)

    const floorPlaneGeo = new THREE.PlaneGeometry(floorSize, floorSize)
    const floorPlaneMat = new THREE.MeshStandardMaterial({
      color: 0x090a0f,
      roughness: 0.85,
      metalness: 0.2
    })
    const floorMesh = new THREE.Mesh(floorPlaneGeo, floorPlaneMat)
    floorMesh.rotation.x = -Math.PI / 2
    floorMesh.position.y = -1
    floorMesh.receiveShadow = true
    scene.add(floorMesh)

    // =======================================================================
    // 5. CENTRO: O COFRE CORPORATIVO (PEDESTAL CILÍNDRICO METÁLICO 3D + CRISTAL)
    // =======================================================================
    const hubGroup = new THREE.Group()
    hubGroup.position.set(0, 0, 0)

    // Base inferior (disco escuro biselado)
    const baseCylGeo = new THREE.CylinderGeometry(85, 95, 14, 48)
    const baseCylMat = new THREE.MeshStandardMaterial({
      color: PYRITE_DARK_TITANIUM,
      roughness: 0.35,
      metalness: 0.8
    })
    const baseCyl = new THREE.Mesh(baseCylGeo, baseCylMat)
    baseCyl.position.y = 7
    baseCyl.castShadow = true
    baseCyl.receiveShadow = true
    hubGroup.add(baseCyl)

    // Anel de Neon Dourado Pyrite
    const goldRingGeo = new THREE.TorusGeometry(86, 2.5, 16, 64)
    const goldRingMat = new THREE.MeshStandardMaterial({
      color: PYRITE_GOLD,
      emissive: PYRITE_GOLD,
      emissiveIntensity: 2.2,
      roughness: 0.2,
      metalness: 0.9
    })
    const goldRing = new THREE.Mesh(goldRingGeo, goldRingMat)
    goldRing.rotation.x = Math.PI / 2
    goldRing.position.y = 13.5
    hubGroup.add(goldRing)

    // Platô superior biselado
    const topPlateGeo = new THREE.CylinderGeometry(78, 78, 6, 48)
    const topPlateMat = new THREE.MeshStandardMaterial({
      color: 0x181a22,
      roughness: 0.4,
      metalness: 0.7
    })
    const topPlate = new THREE.Mesh(topPlateGeo, topPlateMat)
    topPlate.position.y = 16
    topPlate.receiveShadow = true
    hubGroup.add(topPlate)

    // Cristal Holográfico Dourado Flutuante no centro
    const crystalGeo = new THREE.OctahedronGeometry(15, 0)
    const crystalMat = new THREE.MeshStandardMaterial({
      color: PYRITE_GOLD,
      emissive: PYRITE_GOLD,
      emissiveIntensity: 1.4,
      roughness: 0.15,
      metalness: 0.9,
      wireframe: false
    })
    const crystal = new THREE.Mesh(crystalGeo, crystalMat)
    crystal.position.y = 36
    crystal.castShadow = true
    hubGroup.add(crystal)
    crystalRef.current = crystal

    // Anéis orbitais finos giratórios
    const ringsGroup = new THREE.Group()
    ringsGroup.position.y = 36
    const ring1Geo = new THREE.TorusGeometry(26, 0.8, 12, 48)
    const ring1Mat = new THREE.MeshStandardMaterial({ color: PYRITE_GOLD, emissive: PYRITE_GOLD, emissiveIntensity: 0.8 })
    const ring1 = new THREE.Mesh(ring1Geo, ring1Mat)
    ring1.rotation.x = Math.PI / 3
    ringsGroup.add(ring1)

    const ring2Geo = new THREE.TorusGeometry(32, 0.6, 12, 48)
    const ring2Mat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.4, metalness: 0.8 })
    const ring2 = new THREE.Mesh(ring2Geo, ring2Mat)
    ring2.rotation.y = Math.PI / 4
    ringsGroup.add(ring2)

    hubGroup.add(ringsGroup)
    orbitRingsRef.current = ringsGroup

    scene.add(hubGroup)

    // =======================================================================
    // 6. PLATAFORMAS DOS DEPARTAMENTOS & ESTAÇÕES DE TRABALHO 3D
    // =======================================================================
    const totalSquads = squads.length
    deskMeshesRef.current.clear()
    pulseSpheresRef.current = []

    // Distribuição espacial equilibrada sem sobreposição com o centro
    const computeSquadCoords = (idx: number, total: number) => {
      if (total === 1) return { x: 0, z: -280 }
      if (total === 2) {
        // Exatamente como no print de referência: um esquadrão à esquerda e outro à direita
        return idx === 0 ? { x: -350, z: -20 } : { x: 350, z: -20 }
      }
      if (total === 3) {
        if (idx === 0) return { x: -360, z: -140 }
        if (idx === 1) return { x: 360, z: -140 }
        return { x: 0, z: 270 }
      }
      if (total === 4) {
        if (idx === 0) return { x: -360, z: -160 }
        if (idx === 1) return { x: 360, z: -160 }
        if (idx === 2) return { x: -360, z: 180 }
        return { x: 360, z: 180 }
      }
      // Mais esquadrões: distribuição elíptica segura
      const angle = (idx / total) * Math.PI * 2 - Math.PI / 2
      return {
        x: Math.round(Math.cos(angle) * 480),
        z: Math.round(Math.sin(angle) * 320)
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

      // Tamanho da plataforma baseado na quantidade de agentes
      const platWidth = 270
      const platDepth = 175
      const platHeight = 12

      // Base da plataforma (Box com bordas arredondadas / chanfradas)
      const platGeo = new THREE.BoxGeometry(platWidth, platHeight, platDepth)
      const platMat = new THREE.MeshStandardMaterial({
        color: PYRITE_DARK_TITANIUM,
        roughness: 0.45,
        metalness: 0.75
      })
      const platMesh = new THREE.Mesh(platGeo, platMat)
      platMesh.position.y = platHeight / 2
      platMesh.castShadow = true
      platMesh.receiveShadow = true
      platformGroup.add(platMesh)

      // Moldura Luminosa Dourada na Borda Superior da Plataforma
      const edgeGeo = new THREE.BoxGeometry(platWidth + 2, 2, platDepth + 2)
      const edgeMat = new THREE.MeshStandardMaterial({
        color: PYRITE_GOLD,
        emissive: PYRITE_GOLD,
        emissiveIntensity: 1.6,
        roughness: 0.2,
        metalness: 0.9
      })
      const edgeMesh = new THREE.Mesh(edgeGeo, edgeMat)
      edgeMesh.position.y = platHeight + 1
      platformGroup.add(edgeMesh)

      // =====================================================================
      // 7. MESAS DE TRABALHO 3D (DESK + DUAL MONITORS + CHAIR + AGENT)
      // =====================================================================
      const cols = 3
      const deskSpacingX = 75
      const deskSpacingZ = 65

      squadAgents.forEach((ag, agIdx) => {
        const col = agIdx % cols
        const row = Math.floor(agIdx / cols)

        const deskX = (col - (cols - 1) / 2) * deskSpacingX
        const deskZ = (row - 0.5) * deskSpacingZ

        const workstation = new THREE.Group()
        workstation.position.set(deskX, platHeight + 1, deskZ)
        workstation.userData = { agentId: ag.id, squadId: sq.id }

        // A. Tampo da Mesa 3D
        const deskTopGeo = new THREE.BoxGeometry(36, 2.5, 20)
        const deskTopMat = new THREE.MeshStandardMaterial({
          color: 0x1c1e26,
          roughness: 0.5,
          metalness: 0.6
        })
        const deskTop = new THREE.Mesh(deskTopGeo, deskTopMat)
        deskTop.position.y = 11
        deskTop.castShadow = true
        deskTop.receiveShadow = true
        workstation.add(deskTop)

        // B. Pernas da Mesa (Tubulares Metálicas)
        const legGeo = new THREE.CylinderGeometry(1, 1, 11, 12)
        const legMat = new THREE.MeshStandardMaterial({ color: 0x3f3f46, metalness: 0.9, roughness: 0.2 })
        const legPositions = [
          [-16, 5.5, -8],
          [16, 5.5, -8],
          [-16, 5.5, 8],
          [16, 5.5, 8]
        ]
        legPositions.forEach(([lx, ly, lz]) => {
          const leg = new THREE.Mesh(legGeo, legMat)
          leg.position.set(lx, ly, lz)
          leg.castShadow = true
          workstation.add(leg)
        })

        // C. Monitores Duplos Angulados com Telas Luminosas
        const monitorGeo = new THREE.BoxGeometry(12, 7.5, 1)

        // Tela Esquerda (Código Dourado Pyrite)
        const leftScreenMat = new THREE.MeshStandardMaterial({
          color: PYRITE_GOLD,
          emissive: PYRITE_GOLD,
          emissiveIntensity: 1.5,
          roughness: 0.1
        })
        const leftMon = new THREE.Mesh(monitorGeo, leftScreenMat)
        leftMon.position.set(-7, 16.5, -4)
        leftMon.rotation.y = 0.25
        leftMon.castShadow = true
        workstation.add(leftMon)

        // Tela Direita (Dados / Gráficos)
        const rightScreenMat = new THREE.MeshStandardMaterial({
          color: 0x38bdf8,
          emissive: 0x0284c7,
          emissiveIntensity: 1.3,
          roughness: 0.1
        })
        const rightMon = new THREE.Mesh(monitorGeo, rightScreenMat)
        rightMon.position.set(7, 16.5, -4)
        rightMon.rotation.y = -0.25
        rightMon.castShadow = true
        workstation.add(rightMon)

        // D. Cadeira de Escritório 3D
        const chairGroup = new THREE.Group()
        chairGroup.position.set(0, 0, 9)

        // Assento da cadeira
        const seatGeo = new THREE.BoxGeometry(12, 2, 12)
        const chairMat = new THREE.MeshStandardMaterial({ color: 0x111216, roughness: 0.8 })
        const seat = new THREE.Mesh(seatGeo, chairMat)
        seat.position.y = 8
        chairGroup.add(seat)

        // Encosto ergonômico
        const backGeo = new THREE.BoxGeometry(12, 14, 2)
        const back = new THREE.Mesh(backGeo, chairMat)
        back.position.set(0, 16, 5)
        chairGroup.add(back)

        // Base da cadeira
        const basePoleGeo = new THREE.CylinderGeometry(1.2, 1.2, 8, 12)
        const basePole = new THREE.Mesh(basePoleGeo, legMat)
        basePole.position.y = 4
        chairGroup.add(basePole)

        workstation.add(chairGroup)

        // E. Silhueta do Especialista 3D
        const bodyGeo = new THREE.BoxGeometry(9, 11, 6)
        const agentBodyMat = new THREE.MeshStandardMaterial({ color: 0x1e2029, roughness: 0.5, metalness: 0.5 })
        const body = new THREE.Mesh(bodyGeo, agentBodyMat)
        body.position.set(0, 14, 7)
        body.castShadow = true
        workstation.add(body)

        // Cabeça com Visor Dourado Luminoso
        const headGeo = new THREE.SphereGeometry(4, 16, 16)
        const head = new THREE.Mesh(headGeo, agentBodyMat)
        head.position.set(0, 22, 7)
        workstation.add(head)

        const visorGeo = new THREE.BoxGeometry(5.5, 1.6, 2)
        const visorMat = new THREE.MeshStandardMaterial({
          color: PYRITE_GOLD,
          emissive: PYRITE_GOLD,
          emissiveIntensity: 2.5
        })
        const visor = new THREE.Mesh(visorGeo, visorMat)
        visor.position.set(0, 22, 4)
        workstation.add(visor)

        // Hitbox invisível maior para facilitar cliques
        const hitGeo = new THREE.BoxGeometry(45, 30, 35)
        const hitMat = new THREE.MeshBasicMaterial({ visible: false })
        const hitMesh = new THREE.Mesh(hitGeo, hitMat)
        hitMesh.position.y = 15
        workstation.add(hitMesh)

        platformGroup.add(workstation)
        deskMeshesRef.current.set(ag.id, workstation)
      })

      scene.add(platformGroup)

      // =======================================================================
      // 8. CONDUÍTES 3D REAIS (TUBOS CURVOS DE VIDRO + FIBRA DOURADA + PULSOS)
      // =======================================================================
      // Ângulo de saída do cilindro central
      const angle = Math.atan2(sqZ, sqX)
      const hubRadius = 88
      const startX = Math.cos(angle) * hubRadius
      const startZ = Math.sin(angle) * hubRadius

      // Ponto de chegada na plataforma
      let endX = sqX
      let endZ = sqZ
      if (sqX < 0) {
        endX = sqX + platWidth / 2 - 5
      } else if (sqX > 0) {
        endX = sqX - platWidth / 2 + 5
      }

      // Curva 3D Bézier contínua no chão
      const mid1X = startX + Math.cos(angle) * 90
      const mid1Z = startZ + Math.sin(angle) * 90
      const mid2X = endX - (sqX > 0 ? 80 : -80)
      const mid2Z = endZ

      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(startX, 8, startZ),
        new THREE.Vector3(mid1X, 5, mid1Z),
        new THREE.Vector3(mid2X, 5, mid2Z),
        new THREE.Vector3(endX, 8, endZ)
      ])

      // Tubo de Vidro Externo
      const glassTubeGeo = new THREE.TubeGeometry(curve, 32, 3.5, 12, false)
      const glassTubeMat = new THREE.MeshStandardMaterial({
        color: 0x222634,
        roughness: 0.1,
        metalness: 0.9,
        transparent: true,
        opacity: 0.35
      })
      const glassTube = new THREE.Mesh(glassTubeGeo, glassTubeMat)
      scene.add(glassTube)

      // Linha Central de Fibra Dourada Luminosa
      const coreTubeGeo = new THREE.TubeGeometry(curve, 32, 1.2, 8, false)
      const coreTubeMat = new THREE.MeshStandardMaterial({
        color: PYRITE_GOLD,
        emissive: PYRITE_GOLD,
        emissiveIntensity: 2.2,
        roughness: 0.2
      })
      const coreTube = new THREE.Mesh(coreTubeGeo, coreTubeMat)
      scene.add(coreTube)

      // Esfera de Pulso de Dados que viaja pela curva
      const pulseGeo = new THREE.SphereGeometry(3, 16, 16)
      const pulseMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: PYRITE_GOLD,
        emissiveIntensity: 3.5
      })
      const pulseMesh = new THREE.Mesh(pulseGeo, pulseMat)
      scene.add(pulseMesh)

      pulseSpheresRef.current.push({
        mesh: pulseMesh,
        curve,
        speed: 0.003 + (sIdx % 3) * 0.001,
        progress: sIdx * 0.3
      })
    })

    // =======================================================================
    // 9. LOOP DE ANIMAÇÃO & PROJEÇÃO DE TAGS 2D NA TELA
    // =======================================================================
    let animId: number
    const tempVec = new THREE.Vector3()

    const animate = () => {
      animId = requestAnimationFrame(animate)

      // Atualizar controles orbitais
      controls.update()

      // Rotação sutil do cristal central e dos anéis
      if (crystalRef.current) {
        crystalRef.current.rotation.y += 0.012
        crystalRef.current.rotation.x += 0.006
      }
      if (orbitRingsRef.current) {
        orbitRingsRef.current.rotation.z += 0.008
        orbitRingsRef.current.rotation.y -= 0.004
      }

      // Movimentar pulsos de dados pelos conduítes
      pulseSpheresRef.current.forEach(p => {
        p.progress = (p.progress + p.speed) % 1
        const pos = p.curve.getPointAt(p.progress)
        p.mesh.position.copy(pos)
      })

      // Renderizar WebGL
      renderer.render(scene, camera)

      // Projeção das tags na tela (calcula coordenadas X, Y 2D perfeitas)
      const tags: ProjectedTag[] = []

      // 1. Tag do Cofre Central
      tempVec.set(0, 60, 0)
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

      // 2. Tags dos Esquadrões
      squads.forEach((sq, sIdx) => {
        const { x: sqX, z: sqZ } = computeSquadCoords(sIdx, totalSquads)
        tempVec.set(sqX, 22, sqZ + 95)
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

        // 3. Tags de cada Agente sobre suas respectivas estações
        const pipeline = sq.pipeline || []
        pipeline.forEach(p => {
          const desk = deskMeshesRef.current.get(p.agentId)
          if (desk) {
            desk.getWorldPosition(tempVec)
            tempVec.y += 28 // Acima da cabeça do agente
            tempVec.project(camera)
            if (tempVec.z < 1) {
              const sx = (tempVec.x * 0.5 + 0.5) * width
              const sy = (-tempVec.y * 0.5 + 0.5) * height
              const ag = agents.find(a => a.id === p.agentId)
              if (ag) {
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
        })
      })

      setProjectedTags(tags)
    }

    animate()

    // Redimensionamento
    const handleResize = () => {
      if (!container) return
      width = container.clientWidth
      height = container.clientHeight
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      renderer.setSize(width, height)
    }
    window.addEventListener('resize', handleResize)

    // Raycasting para clique nas mesas 3D
    const raycaster = new THREE.Raycaster()
    const mouse = new THREE.Vector2()

    const handleCanvasClick = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect()
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1

      raycaster.setFromCamera(mouse, camera)
      const allDesks = Array.from(deskMeshesRef.current.values())
      const intersects = raycaster.intersectObjects(allDesks, true)

      if (intersects.length > 0) {
        // Encontrar o grupo da estação correspondente
        let curr: THREE.Object3D | null = intersects[0].object
        while (curr && !curr.userData.agentId && curr.parent) {
          curr = curr.parent
        }
        if (curr && curr.userData.agentId) {
          setSelectedAgentId(curr.userData.agentId)
        }
      }
    }

    canvas.addEventListener('click', handleCanvasClick)

    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener('resize', handleResize)
      canvas.removeEventListener('click', handleCanvasClick)
      controls.dispose()
      renderer.dispose()
    }
  }, [squads, agents, vaultName])

  // Resetar câmera para posição isométrica perfeita
  const handleResetCamera = () => {
    if (!cameraRef.current || !controlsRef.current) return
    cameraRef.current.position.set(0, 420, 680)
    controlsRef.current.target.set(0, 0, 0)
    controlsRef.current.update()
  }

  const handleZoom = (delta: number) => {
    if (!cameraRef.current) return
    const factor = delta > 0 ? 0.85 : 1.15
    cameraRef.current.position.multiplyScalar(factor)
    controlsRef.current?.update()
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
      className="relative w-full h-full overflow-hidden select-none bg-[#09090b]"
    >
      {/* =========================================================================
          1. HEADER SUPERIOR (CORES DA PLATAFORMA PYRITE)
          ========================================================================= */}
      <header className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-6 py-4 bg-gradient-to-b from-[#09090b]/95 via-[#09090b]/75 to-transparent pointer-events-none">
        <div className="flex items-center gap-3 pointer-events-auto">
          <div className="w-9 h-9 rounded-xl bg-[var(--accent)]/15 border border-[var(--accent)]/40 flex items-center justify-center text-[var(--accent)] shadow-md">
            <Building2 className="w-5 h-5 text-[var(--accent)]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold text-zinc-100 tracking-tight">
                {vaultName}
              </h1>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--accent)]/15 border border-[var(--accent)]/30 text-[var(--accent)] font-mono font-medium">
                ORGANOGRAMA 3D
              </span>
            </div>
            <p className="text-[11px] text-zinc-400">
              Sede Corporativa &bull; Governança de Departamentos e Especialistas
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 pointer-events-auto">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#14151b]/90 border border-zinc-800 text-xs text-zinc-300 shadow-lg backdrop-blur-md">
            <Users className="w-3.5 h-3.5 text-[var(--accent)]" />
            <span>
              <strong className="text-zinc-100">{squads.length}</strong> Departamentos
            </span>
            <span className="text-zinc-600">&bull;</span>
            <span>
              <strong className="text-zinc-100">{totalUniqueAgents}</strong> Especialistas
            </span>
          </div>

          {onOpenCreateSquadModal && (
            <button
              type="button"
              onClick={onOpenCreateSquadModal}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[var(--accent)] hover:brightness-110 text-zinc-950 font-semibold text-xs transition-all shadow-md active:scale-95 cursor-pointer"
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
        className="w-full h-full block cursor-grab active:cursor-grabbing outline-none"
      />

      {/* =========================================================================
          3. TAGS 2D PROJETADAS EM COORDENADAS REAIS DA CÂMERA (NÍTIDAS & HORIZONTAIS)
          ========================================================================= */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-10">
        {projectedTags.map(tag => {
          if (!tag.visible) return null

          // Tag do Cofre Central
          if (tag.type === 'hub') {
            return (
              <div
                key={tag.id}
                className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-auto"
                style={{ left: `${tag.screenX}px`, top: `${tag.screenY}px` }}
              >
                <div className="px-3.5 py-1 rounded-full bg-[#14151b]/95 border border-[var(--accent)]/50 text-center shadow-2xl backdrop-blur-md">
                  <div className="text-[11px] font-bold text-zinc-100 flex items-center justify-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[var(--accent)] shadow-[0_0_8px_#c59b27] animate-pulse" />
                    <span>{tag.name}</span>
                    <span className="text-[9.5px] font-mono text-[var(--accent)] uppercase">&bull; HQ</span>
                  </div>
                </div>
              </div>
            )
          }

          // Tag do Departamento (Placa Frontal da Plataforma)
          if (tag.type === 'squad') {
            return (
              <div
                key={tag.id}
                className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-auto"
                style={{ left: `${tag.screenX}px`, top: `${tag.screenY}px` }}
              >
                <div className="px-3 py-1.5 rounded-2xl bg-[#14151b]/95 border border-zinc-800 hover:border-[var(--accent)]/60 text-center shadow-xl backdrop-blur-md flex items-center gap-2.5 transition-all">
                  <div className="w-6 h-6 rounded-lg bg-[var(--accent)]/15 border border-[var(--accent)]/30 flex items-center justify-center text-[var(--accent)] shrink-0">
                    {renderDynamicIcon(tag.icon || 'Users', 'w-3.5 h-3.5 text-[var(--accent)]')}
                  </div>
                  <div className="text-left">
                    <div className="text-xs font-bold text-zinc-100 flex items-center gap-1.5">
                      <span>{tag.name}</span>
                      <span className="text-[10px] text-zinc-400 font-mono font-normal">
                        {tag.subtitle}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 ml-1">
                    {tag.squad && onOpenSquadChat && (
                      <button
                        type="button"
                        onClick={() => onOpenSquadChat(tag.squad!)}
                        className="p-1 rounded-lg bg-zinc-800 hover:bg-[var(--accent)] hover:text-zinc-950 text-zinc-300 transition-colors cursor-pointer"
                        title={`Conversar com ${tag.name}`}
                      >
                        <MessageSquare className="w-3 h-3" />
                      </button>
                    )}
                    {tag.squadId && (
                      <button
                        type="button"
                        onClick={() => onSelectSquad(tag.squadId!)}
                        className="px-2 py-0.5 rounded-lg bg-zinc-800 hover:bg-[var(--accent)] hover:text-zinc-950 text-zinc-200 text-[10.5px] font-medium flex items-center gap-0.5 transition-colors cursor-pointer"
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

          // Tag Flutuante do Agente (Sobre a mesa 3D)
          if (tag.type === 'agent') {
            const isSelected = selectedAgentId === tag.agentId

            return (
              <div
                key={tag.id}
                onClick={() => tag.agentId && setSelectedAgentId(tag.agentId)}
                className={`absolute -translate-x-1/2 -translate-y-1/2 pointer-events-auto cursor-pointer transition-all duration-150 ${
                  isSelected ? 'scale-110 z-30' : 'hover:scale-105 z-20'
                }`}
                style={{ left: `${tag.screenX}px`, top: `${tag.screenY}px` }}
              >
                <div
                  className={`px-2 py-0.5 rounded-full border text-[10.5px] font-medium flex items-center gap-1.5 shadow-lg backdrop-blur-md ${
                    isSelected
                      ? 'bg-[var(--accent)] border-[var(--accent)] text-zinc-950 font-bold shadow-[0_0_12px_rgba(197,155,39,0.5)]'
                      : 'bg-[#12131a]/95 border-zinc-700/80 text-zinc-200 hover:border-[var(--accent)]'
                  }`}
                >
                  <AgentIcon variant={tag.icon} size={14} className="shrink-0 rounded-full" />
                  <span className="truncate max-w-[95px]">{tag.name}</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399]" />
                </div>
              </div>
            )
          }

          return null
        })}
      </div>

      {/* =========================================================================
          4. BARRA DE CONTROLES INFERIOR (ZOOM, RESET, FULLSCREEN)
          ========================================================================= */}
      <nav
        aria-label="Controles de visualização 3D"
        className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 px-3 py-2 rounded-2xl bg-[#14151b]/95 border border-zinc-800 shadow-2xl backdrop-blur-xl pointer-events-auto"
      >
        <button
          type="button"
          onClick={() => handleZoom(1)}
          className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors cursor-pointer"
          title="Aproximar (Zoom In)"
        >
          <ZoomIn className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={() => handleZoom(-1)}
          className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors cursor-pointer"
          title="Afastar (Zoom Out)"
        >
          <ZoomOut className="w-4 h-4" />
        </button>

        <div className="w-px h-4 bg-zinc-800 mx-1" />

        <button
          type="button"
          onClick={handleResetCamera}
          className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors cursor-pointer"
          title="Resetar Câmera para Visão Isométrica Inicial"
        >
          <RotateCcw className="w-4 h-4" />
        </button>

        <div className="w-px h-4 bg-zinc-800 mx-1" />

        <button
          type="button"
          onClick={handleToggleFullscreen}
          className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors cursor-pointer"
          title="Tela Cheia"
        >
          {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </button>
      </nav>

      {/* =========================================================================
          5. DRAWER LATERAL: "AGENT CONFIGURATION" (ESTILO DA PLATAFORMA PYRITE)
          ========================================================================= */}
      {selectedAgent && (
        <aside
          role="region"
          aria-label="Configuração do Agente"
          className="absolute top-0 right-0 bottom-0 w-96 bg-[#101117]/95 border-l border-zinc-800 shadow-2xl z-30 flex flex-col backdrop-blur-2xl animate-in slide-in-from-right duration-200"
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
            <div>
              <span className="text-[10px] font-mono tracking-wider text-[var(--accent)] uppercase font-semibold">
                AGENT CONFIGURATION
              </span>
              <h2 className="text-sm font-bold text-zinc-100 truncate mt-0.5">
                {selectedAgent.name}
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setSelectedAgentId(null)}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto custom-chat-scrollbar p-5 space-y-5">
            {/* 1. Preview da Estação de Trabalho 3D Turntable */}
            <div className="relative rounded-2xl bg-gradient-to-b from-[#181a24] to-[#12131a] border border-[var(--accent)]/30 p-4 flex flex-col items-center justify-center shadow-inner">
              <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-[10px] text-emerald-300 font-medium font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399]" />
                <span>ONLINE</span>
              </div>

              {/* Ícone e dados do Agente */}
              <div className="my-3 flex flex-col items-center">
                <div className="w-16 h-16 rounded-2xl bg-[var(--accent)]/15 border-2 border-[var(--accent)]/50 flex items-center justify-center text-[var(--accent)] shadow-[0_0_20px_rgba(197,155,39,0.3)] mb-2">
                  <AgentIcon variant={selectedAgent.icon} size={36} />
                </div>
                <div className="text-xs font-bold text-zinc-100">{selectedAgent.name}</div>
                <div className="text-[10.5px] text-[var(--accent)] font-mono mt-0.5">
                  {selectedAgentCurrentSquad ? selectedAgentCurrentSquad.name : 'Especialista Livre'}
                </div>
              </div>

              <div className="w-full pt-2 border-t border-zinc-800 text-center text-[10.5px] text-zinc-400">
                Estação de Trabalho 3D conectada ao Cofre
              </div>
            </div>

            {/* 2. Nome do Especialista */}
            <div>
              <label className="block text-[11px] font-medium text-zinc-400 mb-1.5">
                Nome do Especialista
              </label>
              <div className="relative flex items-center">
                <input
                  type="text"
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  placeholder="Nome do agente..."
                  className="w-full bg-[#161720] border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-[var(--accent)]"
                />
                <Pencil className="w-3.5 h-3.5 text-zinc-500 absolute right-3 pointer-events-none" />
              </div>
            </div>

            {/* 3. Departamento (Esquadrão) */}
            <div>
              <label className="block text-[11px] font-medium text-zinc-400 mb-1.5">
                Departamento (Esquadrão)
              </label>
              <select
                value={formSquadId}
                onChange={e => setFormSquadId(e.target.value)}
                className="w-full bg-[#161720] border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-[var(--accent)] cursor-pointer"
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
              <label className="block text-[11px] font-medium text-zinc-400 mb-1.5">
                Função Principal (Assigned Task)
              </label>
              <input
                type="text"
                value={formTask}
                onChange={e => setFormTask(e.target.value)}
                placeholder="Ex: Tier-1 Ticketing, Redação, Análise..."
                className="w-full bg-[#161720] border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-[var(--accent)]"
              />
            </div>

            {/* 5. Nível de Acesso (Access Level) */}
            <div>
              <label className="block text-[11px] font-medium text-zinc-400 mb-1.5">
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
                          ? 'bg-[var(--accent)] text-zinc-950 font-bold shadow-sm'
                          : 'bg-[#161720] text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 border border-zinc-800'
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
              <label className="block text-[11px] font-medium text-zinc-400 mb-1.5">
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
                          ? 'bg-[var(--accent)]/15 border-[var(--accent)] text-[var(--accent)]'
                          : 'bg-[#161720] border-zinc-800 text-zinc-500 hover:text-zinc-300'
                      }`}
                    >
                      <span
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ backgroundColor: isActive ? item.color : '#71717a' }}
                      />
                      <span>{item.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* 7. Chaves / Toggles de Atuação */}
            <div className="space-y-3 pt-2 border-t border-zinc-800">
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-xs text-zinc-300">Especialista Ativo no Esquadrão</span>
                <input
                  type="checkbox"
                  checked={formIsActive}
                  onChange={e => setFormIsActive(e.target.checked)}
                  className="w-4 h-4 rounded text-[var(--accent)] focus:ring-0 cursor-pointer accent-[var(--accent)]"
                />
              </label>

              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-xs text-zinc-300">Acesso de Leitura ao Cofre</span>
                <input
                  type="checkbox"
                  checked={formCanReadVault}
                  onChange={e => setFormCanReadVault(e.target.checked)}
                  className="w-4 h-4 rounded text-[var(--accent)] focus:ring-0 cursor-pointer accent-[var(--accent)]"
                />
              </label>

              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-xs text-zinc-300">Permissão de Escrita de Notas</span>
                <input
                  type="checkbox"
                  checked={formCanWriteVault}
                  onChange={e => setFormCanWriteVault(e.target.checked)}
                  className="w-4 h-4 rounded text-[var(--accent)] focus:ring-0 cursor-pointer accent-[var(--accent)]"
                />
              </label>

              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-xs text-zinc-300">Geração Autônoma</span>
                <input
                  type="checkbox"
                  checked={formAutonomous}
                  onChange={e => setFormAutonomous(e.target.checked)}
                  className="w-4 h-4 rounded text-[var(--accent)] focus:ring-0 cursor-pointer accent-[var(--accent)]"
                />
              </label>
            </div>
          </div>

          {/* Rodapé do Drawer */}
          <div className="p-4 border-t border-zinc-800 space-y-2 bg-[#0d0e14]">
            {saveSuccessNotice && (
              <div className="p-2 rounded-lg bg-emerald-950/60 border border-emerald-500/50 text-emerald-300 text-xs flex items-center justify-center gap-1.5 animate-in fade-in duration-150">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Configuração salva com sucesso!</span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleSaveConfig}
                className="w-full py-2 rounded-xl bg-[var(--accent)] hover:brightness-110 text-zinc-950 font-bold text-xs transition-all shadow-md active:scale-95 cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Salvar Config</span>
              </button>

              {onOpenAgentChat && (
                <button
                  type="button"
                  onClick={() => onOpenAgentChat(selectedAgent.id)}
                  className="w-full py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-100 font-semibold text-xs transition-all shadow-sm active:scale-95 cursor-pointer flex items-center justify-center gap-1.5"
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
                className="w-full py-1.5 rounded-xl bg-zinc-800/60 hover:bg-zinc-800 text-zinc-300 text-xs font-medium transition-colors cursor-pointer flex items-center justify-center gap-1.5"
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
