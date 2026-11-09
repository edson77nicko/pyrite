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
  Compass,
  PanelLeftClose,
  PanelLeft
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
  accentColor?: string
  isSidebarCollapsed?: boolean
  onToggleSidebar?: () => void
  onSelectSquad: (squadId: string) => void
  onSaveSquad: (squad: TeamDefinition) => void
  onDeleteSquad?: (squadId: string) => void
  onOpenSquadChat: (squad: TeamDefinition) => void
  onSaveAgent?: (agent: AgentProfileVersion) => void
  onOpenAgentChat?: (agentId: string) => void
  onOpenCreateSquadModal?: () => void
}

// =============================================================================
// FUNÇÃO UTILITÁRIA PARA RESOLVER A COR DE DESTAQUE DINÂMICA DA PLATAFORMA
// =============================================================================
export function getDynamicAccentColor(overrideHex?: string): { hex: string; num: number } {
  let hex = overrideHex
  if (!hex && typeof window !== 'undefined') {
    hex = getComputedStyle(document.documentElement).getPropertyValue('--accent')?.trim()
  }
  if (!hex || hex === 'undefined' || hex === 'null') {
    hex = '#c59b27'
  }
  if (!hex.startsWith('#')) {
    if (/^[0-9a-fA-F]{6}$/.test(hex)) {
      hex = `#${hex}`
    } else if (typeof document !== 'undefined') {
      const probe = document.createElement('div')
      probe.style.color = hex
      document.body.appendChild(probe)
      const computed = getComputedStyle(probe).color
      document.body.removeChild(probe)
      const m = computed.match(/\d+/g)
      if (m && m.length >= 3) {
        const r = parseInt(m[0], 10)
        const g = parseInt(m[1], 10)
        const b = parseInt(m[2], 10)
        hex = `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`
      } else {
        hex = '#c59b27'
      }
    }
  }
  const cleanHex = hex.replace('#', '')
  const num = parseInt(cleanHex, 16) || 0xc59b27
  return { hex, num }
}

// =============================================================================
// PALETA DE CORES NATIVA DO PYRITE (TITÂNIO ESCURO & ACENTO DINÂMICO)
// =============================================================================
const PYRITE_3D = {
  floorBg: 0x09090b,          // Obsidian / Zinc-950 puro do Pyrite
  platformNavy: 0x121215,     // Titânio escuro da plataforma
  platformSteel: 0x18181b,    // Chapa de aço Zinc-900
  platformTrim: 0x27272a,     // Friso Zinc-800
  gridColor: 0x27272a,        // Linhas de grade Zinc-800
  // STATUS CONECTADO (ONLINE)
  statusOnline: 0x10b981,     // Esmeralda conectado
  // STATUS DESCONECTADO (OFFLINE / PAUSADO)
  statusOffline: 0x52525b,    // Zinc-600 standby
  screenOffline: 0x09090b,    // Tela desligada fosca
  // MESA E ESPECIALISTA
  deskWood: 0xefe7db,         // Madeira birch clara
  deskLegDark: 0x27272a,      // Estrutura Zinc-800
  drawerUnit: 0xd8cfc0,       // Gaveteiro
  chairMesh: 0x18181b,        // Cadeira ergonômica carvão
  chairChrome: 0x71717a,      // Metal da cadeira
  agentSuit: 0x18181b,        // Traje executivo escuro
  agentSkin: 0xfcd34d,        // Pele natural
  agentHair: 0x27272a         // Cabelo
}

const getAvailableIntegrations = (accentHex: string) => [
  { id: 'vault', label: 'Cofre Local (.md)', color: accentHex },
  { id: 'web', label: 'Busca Web', color: '#38bdf8' },
  { id: 'code', label: 'Execução de Código', color: '#a855f7' },
  { id: 'slack', label: 'Slack', color: '#ec4899' },
  { id: 'zendesk', label: 'Zendesk', color: '#10b981' },
  { id: 'files', label: 'Análise de Arquivos', color: '#06b6d4' }
]

// =============================================================================
// EDIFÍCIO CORPORATIVO CENTRAL (MINIATURA MODERNA DE HEADQUARTERS)
// =============================================================================
function createCorporateHQBuilding(
  accentNum: number,
  platformSteel: number,
  platformNavy: number,
  platformTrim: number
): THREE.Group {
  const building = new THREE.Group()

  const accentEmissiveMat = new THREE.MeshStandardMaterial({
    color: accentNum,
    emissive: accentNum,
    emissiveIntensity: 2.2,
    roughness: 0.2
  })

  const windowGlassMat = new THREE.MeshStandardMaterial({
    color: 0x18181b,
    emissive: accentNum,
    emissiveIntensity: 0.65,
    roughness: 0.2,
    metalness: 0.9
  })

  // 1. Térreo / Lobby de Entrada (Podium)
  const lobbyWidth = 15
  const lobbyHeight = 6.5
  const lobbyDepth = 15
  const podiumGeo = new THREE.BoxGeometry(lobbyWidth, lobbyHeight, lobbyDepth)
  const podiumMat = new THREE.MeshStandardMaterial({
    color: platformSteel,
    roughness: 0.35,
    metalness: 0.8
  })
  const podium = new THREE.Mesh(podiumGeo, podiumMat)
  podium.position.y = lobbyHeight / 2
  building.add(podium)

  // Vidro da entrada principal (fachada frontal envidraçada)
  const lobbyGlassGeo = new THREE.PlaneGeometry(7.5, 4.2)
  const lobbyGlassMat = new THREE.MeshStandardMaterial({
    color: 0x09090b,
    emissive: accentNum,
    emissiveIntensity: 1.4,
    roughness: 0.1,
    metalness: 0.95
  })
  const lobbyGlass = new THREE.Mesh(lobbyGlassGeo, lobbyGlassMat)
  lobbyGlass.position.set(0, 2.6, lobbyDepth / 2 + 0.05)
  building.add(lobbyGlass)

  // Marquise de entrada com fita LED na cor de destaque
  const canopyGeo = new THREE.BoxGeometry(9.5, 0.7, 3.8)
  const canopyMat = new THREE.MeshStandardMaterial({ color: platformTrim, metalness: 0.85, roughness: 0.25 })
  const canopy = new THREE.Mesh(canopyGeo, canopyMat)
  canopy.position.set(0, 5.0, lobbyDepth / 2 + 1.8)
  building.add(canopy)

  const canopyLedGeo = new THREE.BoxGeometry(9.3, 0.25, 0.3)
  const canopyLed = new THREE.Mesh(canopyLedGeo, accentEmissiveMat)
  canopyLed.position.set(0, 4.7, lobbyDepth / 2 + 3.7)
  building.add(canopyLed)

  // 2. Torre Central - Bloco Intermediário
  const midWidth = 11.5
  const midHeight = 13.5
  const midDepth = 11.5
  const midGeo = new THREE.BoxGeometry(midWidth, midHeight, midDepth)
  const midMat = new THREE.MeshStandardMaterial({
    color: platformNavy,
    roughness: 0.4,
    metalness: 0.85
  })
  const midTower = new THREE.Mesh(midGeo, midMat)
  midTower.position.y = lobbyHeight + midHeight / 2
  building.add(midTower)

  // Faixas horizontais de janelas iluminadas na torre média
  for (let t = 0; t < 4; t++) {
    const wy = lobbyHeight + 2.0 + t * 2.8
    const winFB = new THREE.Mesh(new THREE.BoxGeometry(9.2, 1.1, midDepth + 0.1), windowGlassMat)
    winFB.position.set(0, wy, 0)
    building.add(winFB)

    const winSide = new THREE.Mesh(new THREE.BoxGeometry(midWidth + 0.1, 1.1, 9.2), windowGlassMat)
    winSide.position.set(0, wy, 0)
    building.add(winSide)
  }

  // Frisos arquitetônicos verticais nas esquinas da torre média
  const cornerFinGeo = new THREE.BoxGeometry(0.6, midHeight, 0.6)
  const finMat = new THREE.MeshStandardMaterial({ color: 0x52525b, metalness: 0.95, roughness: 0.2 })
  ;[-midWidth / 2, midWidth / 2].forEach(fx => {
    ;[-midDepth / 2, midDepth / 2].forEach(fz => {
      const fin = new THREE.Mesh(cornerFinGeo, finMat)
      fin.position.set(fx, lobbyHeight + midHeight / 2, fz)
      building.add(fin)
    })
  })

  // 3. Terraço de Transição / Cornice Luminosa
  const terraceGeo = new THREE.BoxGeometry(12.5, 0.9, 12.5)
  const terraceMat = new THREE.MeshStandardMaterial({ color: platformTrim, metalness: 0.8, roughness: 0.3 })
  const terrace = new THREE.Mesh(terraceGeo, terraceMat)
  terrace.position.y = lobbyHeight + midHeight + 0.45
  building.add(terrace)

  const terraceLightGeo = new THREE.BoxGeometry(12.7, 0.3, 12.7)
  const terraceLight = new THREE.Mesh(terraceLightGeo, accentEmissiveMat)
  terraceLight.position.y = lobbyHeight + midHeight + 0.8
  building.add(terraceLight)

  // 4. Bloco Superior / Penthouse Executiva
  const topWidth = 8
  const topHeight = 9.5
  const topDepth = 8
  const topGeo = new THREE.BoxGeometry(topWidth, topHeight, topDepth)
  const topMat = new THREE.MeshStandardMaterial({
    color: platformSteel,
    roughness: 0.25,
    metalness: 0.92
  })
  const topTower = new THREE.Mesh(topGeo, topMat)
  const topElevation = lobbyHeight + midHeight + 0.9 + topHeight / 2
  topTower.position.y = topElevation
  building.add(topTower)

  // Janelas do bloco executivo
  for (let t = 0; t < 2; t++) {
    const wy = lobbyHeight + midHeight + 2.8 + t * 3.4
    const winTop = new THREE.Mesh(new THREE.BoxGeometry(6.2, 1.3, topDepth + 0.1), windowGlassMat)
    winTop.position.set(0, wy, 0)
    building.add(winTop)
  }

  // Emblema Corporativo no topo da torre (Face Frontal)
  const emblemGeo = new THREE.CylinderGeometry(1.3, 1.3, 0.3, 6)
  const emblem = new THREE.Mesh(emblemGeo, accentEmissiveMat)
  emblem.rotation.x = Math.PI / 2
  emblem.position.set(0, topElevation + 2.2, topDepth / 2 + 0.2)
  building.add(emblem)

  // 5. Cobertura / Heliponto & Spire / Antena
  const roofGeo = new THREE.BoxGeometry(6, 1.0, 6)
  const roofMat = new THREE.MeshStandardMaterial({ color: platformNavy, metalness: 0.75, roughness: 0.4 })
  const roof = new THREE.Mesh(roofGeo, roofMat)
  const roofElevation = lobbyHeight + midHeight + 0.9 + topHeight + 0.5
  roof.position.y = roofElevation
  building.add(roof)

  // Mastro da Antena
  const spireMastGeo = new THREE.CylinderGeometry(0.18, 0.4, 7.5, 8)
  const spireMastMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.95, roughness: 0.15 })
  const spireMast = new THREE.Mesh(spireMastGeo, spireMastMat)
  const spireElevation = roofElevation + 0.5 + 3.75
  spireMast.position.set(0, spireElevation, 0)
  building.add(spireMast)

  // Beacon Luminoso pulsante no topo
  const beaconGeo = new THREE.SphereGeometry(0.65, 12, 12)
  const beaconMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: accentNum,
    emissiveIntensity: 3.5,
    roughness: 0.1
  })
  const beacon = new THREE.Mesh(beaconGeo, beaconMat)
  beacon.position.set(0, spireElevation + 4.0, 0)
  building.add(beacon)

  return building
}

// =============================================================================
// CONSTRUTOR DE ESTAÇÃO DE TRABALHO DETALHADA NO ESTILO NATIVO PYRITE
// =============================================================================
function createWorkstationMesh(params: {
  agent: AgentProfileVersion
  squadId: string
  isConnected: boolean
  x: number
  z: number
  facingAngle?: number
  accentColorNum: number
}): THREE.Group {
  const { agent, squadId, isConnected, x, z, facingAngle = 0, accentColorNum } = params

  const group = new THREE.Group()
  group.position.set(x, 0, z)
  group.rotation.y = facingAngle
  group.userData = { agentId: agent.id, squadId }

  const deskTopWidth = 24
  const deskTopDepth = 14
  const deskTopHeight = 1.3
  const deskElevation = 7.5

  // 1. Tampo da Mesa (Madeira birch clara)
  const deskGeo = new THREE.BoxGeometry(deskTopWidth, deskTopHeight, deskTopDepth)
  const deskMat = new THREE.MeshStandardMaterial({
    color: PYRITE_3D.deskWood,
    roughness: 0.35,
    metalness: 0.15
  })
  const deskTop = new THREE.Mesh(deskGeo, deskMat)
  deskTop.position.y = deskElevation
  group.add(deskTop)

  // Painel lateral estrutural esquerdo
  const leftPanelGeo = new THREE.BoxGeometry(1.0, deskElevation - deskTopHeight / 2, deskTopDepth - 0.8)
  const legMat = new THREE.MeshStandardMaterial({ color: PYRITE_3D.deskLegDark, roughness: 0.6 })
  const leftPanel = new THREE.Mesh(leftPanelGeo, legMat)
  leftPanel.position.set(-deskTopWidth / 2 + 0.6, (deskElevation - deskTopHeight / 2) / 2, 0)
  group.add(leftPanel)

  // Gaveteiro sob a mesa à direita com 3 gavetas
  const cabinetWidth = 6.0
  const cabinetHeight = deskElevation - deskTopHeight / 2 - 0.2
  const cabinetDepth = deskTopDepth - 1.2
  const cabinetGeo = new THREE.BoxGeometry(cabinetWidth, cabinetHeight, cabinetDepth)
  const cabinetMat = new THREE.MeshStandardMaterial({
    color: PYRITE_3D.drawerUnit,
    roughness: 0.45,
    metalness: 0.2
  })
  const cabinet = new THREE.Mesh(cabinetGeo, cabinetMat)
  cabinet.position.set(deskTopWidth / 2 - cabinetWidth / 2 - 0.4, cabinetHeight / 2, 0)
  group.add(cabinet)

  // Puxadores cromados
  const handleGeo = new THREE.BoxGeometry(2.4, 0.25, 0.4)
  const handleMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.95, roughness: 0.15 })
  ;[-1.5, 0.2, 1.9].forEach(yOff => {
    const handle = new THREE.Mesh(handleGeo, handleMat)
    handle.position.set(deskTopWidth / 2 - cabinetWidth / 2 - 0.4, cabinetHeight / 2 + yOff, cabinetDepth / 2 + 0.2)
    group.add(handle)
  })

  // Divisória acústica traseira
  const dividerGeo = new THREE.BoxGeometry(deskTopWidth, 5.5, 0.8)
  const dividerMat = new THREE.MeshStandardMaterial({
    color: PYRITE_3D.platformTrim,
    roughness: 0.8
  })
  const divider = new THREE.Mesh(dividerGeo, dividerMat)
  divider.position.set(0, deskElevation + 2.8, -deskTopDepth / 2 + 0.4)
  group.add(divider)

  // Gabinete PC sob a mesa
  const pcGeo = new THREE.BoxGeometry(3.0, 5.8, 8.5)
  const pcMat = new THREE.MeshStandardMaterial({ color: PYRITE_3D.platformNavy, roughness: 0.5, metalness: 0.7 })
  const pcTower = new THREE.Mesh(pcGeo, pcMat)
  pcTower.position.set(deskTopWidth / 2 - cabinetWidth - 2.0, 3.0, 0.5)
  group.add(pcTower)

  // LED no PC
  const pcLedGeo = new THREE.BoxGeometry(0.3, 0.8, 0.2)
  const pcLedMat = new THREE.MeshStandardMaterial({
    color: isConnected ? PYRITE_3D.statusOnline : PYRITE_3D.statusOffline,
    emissive: isConnected ? PYRITE_3D.statusOnline : 0x000000,
    emissiveIntensity: isConnected ? 2.5 : 0
  })
  const pcLed = new THREE.Mesh(pcLedGeo, pcLedMat)
  pcLed.position.set(deskTopWidth / 2 - cabinetWidth - 2.0, 5.2, 4.8)
  group.add(pcLed)

  // Mousepad, teclado e mouse
  const padGeo = new THREE.BoxGeometry(14, 0.15, 8.5)
  const padMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.9 })
  const pad = new THREE.Mesh(padGeo, padMat)
  pad.position.set(-1.0, deskElevation + 0.7, 0.5)
  group.add(pad)

  const kbGeo = new THREE.BoxGeometry(8.5, 0.3, 3.2)
  const kbMat = new THREE.MeshStandardMaterial({ color: 0x09090b, roughness: 0.7 })
  const kb = new THREE.Mesh(kbGeo, kbMat)
  kb.position.set(-1.0, deskElevation + 0.85, 1.4)
  group.add(kb)

  const mouseGeo = new THREE.BoxGeometry(1.2, 0.35, 1.8)
  const mouseMat = new THREE.MeshStandardMaterial({ color: 0x27272a, roughness: 0.5 })
  const mouse = new THREE.Mesh(mouseGeo, mouseMat)
  mouse.position.set(4.5, deskElevation + 0.85, 1.4)
  group.add(mouse)

  // Caneca de café
  const mugGeo = new THREE.CylinderGeometry(0.7, 0.6, 1.4, 10)
  const mugMat = new THREE.MeshStandardMaterial({ color: 0xf4f4f5, roughness: 0.2 })
  const mug = new THREE.Mesh(mugGeo, mugMat)
  mug.position.set(-8.5, deskElevation + 1.3, -2.5)
  group.add(mug)

  // 2. Monitores Duplos Angulados
  const monWidth = 7.8
  const monHeight = 5.2
  const monDepth = 0.6
  const monElevation = deskElevation + 4.2
  const monZ = -deskTopDepth / 2 + 2.2

  const armPoleGeo = new THREE.CylinderGeometry(0.45, 0.45, 4.5, 8)
  const armPoleMat = new THREE.MeshStandardMaterial({ color: 0x71717a, metalness: 0.9 })
  const armPole = new THREE.Mesh(armPoleGeo, armPoleMat)
  armPole.position.set(0, deskElevation + 2.2, monZ - 0.6)
  group.add(armPole)

  const monChassisGeo = new THREE.BoxGeometry(monWidth, monHeight, monDepth)
  const monChassisMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.6, metalness: 0.6 })
  const screenGeo = new THREE.PlaneGeometry(monWidth - 0.6, monHeight - 0.6)

  // Telas: se conectado, telas luminosas quentes na cor de destaque; se desconectado, apagadas
  const leftScreenMat = new THREE.MeshStandardMaterial({
    color: isConnected ? accentColorNum : PYRITE_3D.screenOffline,
    emissive: isConnected ? accentColorNum : 0x000000,
    emissiveIntensity: isConnected ? 2.0 : 0,
    roughness: isConnected ? 0.2 : 0.8
  })
  const rightScreenMat = new THREE.MeshStandardMaterial({
    color: isConnected ? accentColorNum : PYRITE_3D.screenOffline,
    emissive: isConnected ? accentColorNum : 0x000000,
    emissiveIntensity: isConnected ? 1.6 : 0,
    roughness: isConnected ? 0.2 : 0.8
  })

  // Monitor Esquerdo
  const leftMon = new THREE.Mesh(monChassisGeo, monChassisMat)
  leftMon.position.set(-4.2, monElevation, monZ)
  leftMon.rotation.y = 0.22
  const leftScreen = new THREE.Mesh(screenGeo, leftScreenMat)
  leftScreen.position.z = monDepth / 2 + 0.05
  leftMon.add(leftScreen)
  group.add(leftMon)

  // Monitor Direito
  const rightMon = new THREE.Mesh(monChassisGeo, monChassisMat)
  rightMon.position.set(4.2, monElevation, monZ)
  rightMon.rotation.y = -0.22
  const rightScreen = new THREE.Mesh(screenGeo, rightScreenMat)
  rightScreen.position.z = monDepth / 2 + 0.05
  rightMon.add(rightScreen)
  group.add(rightMon)

  // Fita de LED na borda da mesa indicando status do agente (Verde se ativo, apagado se pausado)
  const deskLedGeo = new THREE.BoxGeometry(deskTopWidth, 0.35, 0.35)
  const deskLedMat = new THREE.MeshStandardMaterial({
    color: isConnected ? PYRITE_3D.statusOnline : PYRITE_3D.statusOffline,
    emissive: isConnected ? PYRITE_3D.statusOnline : 0x000000,
    emissiveIntensity: isConnected ? 2.2 : 0
  })
  const deskLed = new THREE.Mesh(deskLedGeo, deskLedMat)
  deskLed.position.set(0, deskElevation - 0.5, deskTopDepth / 2 + 0.15)
  group.add(deskLed)

  // 3. Cadeira Ergonômica de Escritório
  const chairGroup = new THREE.Group()
  chairGroup.position.set(-1.0, 0, 6.2)

  const starHubGeo = new THREE.CylinderGeometry(0.7, 0.7, 0.6, 8)
  const starHubMat = new THREE.MeshStandardMaterial({ color: PYRITE_3D.chairChrome, metalness: 0.9 })
  const starHub = new THREE.Mesh(starHubGeo, starHubMat)
  starHub.position.y = 0.5
  chairGroup.add(starHub)

  for (let i = 0; i < 5; i++) {
    const ang = (i / 5) * Math.PI * 2
    const spokeGeo = new THREE.CylinderGeometry(0.2, 0.2, 3.2, 6)
    const spoke = new THREE.Mesh(spokeGeo, starHubMat)
    spoke.position.set(Math.cos(ang) * 1.6, 0.4, Math.sin(ang) * 1.6)
    spoke.rotation.z = Math.PI / 2
    spoke.rotation.y = -ang
    chairGroup.add(spoke)
  }

  const pistonGeo = new THREE.CylinderGeometry(0.5, 0.5, 4.2, 8)
  const piston = new THREE.Mesh(pistonGeo, starHubMat)
  piston.position.y = 2.4
  chairGroup.add(piston)

  const seatGeo = new THREE.BoxGeometry(8.5, 1.4, 8.0)
  const seatMat = new THREE.MeshStandardMaterial({ color: PYRITE_3D.chairMesh, roughness: 0.85 })
  const seat = new THREE.Mesh(seatGeo, seatMat)
  seat.position.y = 4.8
  chairGroup.add(seat)

  const backGeo = new THREE.BoxGeometry(8.0, 9.5, 1.4)
  const back = new THREE.Mesh(backGeo, seatMat)
  back.position.set(0, 9.8, 3.5)
  back.rotation.x = 0.08
  chairGroup.add(back)

  const armGeo = new THREE.BoxGeometry(0.8, 3.2, 4.5)
  const leftArmRest = new THREE.Mesh(armGeo, starHubMat)
  leftArmRest.position.set(-4.2, 6.6, 0.8)
  chairGroup.add(leftArmRest)
  const rightArmRest = new THREE.Mesh(armGeo, starHubMat)
  rightArmRest.position.set(4.2, 6.6, 0.8)
  chairGroup.add(rightArmRest)

  group.add(chairGroup)

  // 4. Boneco do Especialista (Sentado na Cadeira)
  const agentFigure = new THREE.Group()
  agentFigure.position.set(-1.0, 0, 6.2)

  const thighsGeo = new THREE.BoxGeometry(4.8, 1.8, 6.5)
  const pantsMat = new THREE.MeshStandardMaterial({ color: 0x09090b, roughness: 0.8 })
  const thighs = new THREE.Mesh(thighsGeo, pantsMat)
  thighs.position.set(0, 5.4, -2.6)
  agentFigure.add(thighs)

  const torsoGeo = new THREE.BoxGeometry(5.8, 6.8, 3.8)
  const suitMat = new THREE.MeshStandardMaterial({
    color: isConnected ? PYRITE_3D.agentSuit : 0x27272a,
    roughness: 0.5
  })
  const torso = new THREE.Mesh(torsoGeo, suitMat)
  torso.position.set(0, 8.8, 0.4)
  agentFigure.add(torso)

  const armForeGeo = new THREE.BoxGeometry(1.5, 1.5, 5.5)
  const leftArm = new THREE.Mesh(armForeGeo, suitMat)
  leftArm.position.set(-2.8, 7.8, -2.2)
  leftArm.rotation.x = 0.2
  agentFigure.add(leftArm)

  const rightArm = new THREE.Mesh(armForeGeo, suitMat)
  rightArm.position.set(2.8, 7.8, -2.2)
  rightArm.rotation.x = 0.2
  agentFigure.add(rightArm)

  const headGeo = new THREE.SphereGeometry(2.5, 14, 14)
  const headMat = new THREE.MeshStandardMaterial({ color: PYRITE_3D.agentSkin, roughness: 0.5 })
  const head = new THREE.Mesh(headGeo, headMat)
  head.position.set(0, 14.2, 0.6)
  agentFigure.add(head)

  const hairGeo = new THREE.SphereGeometry(2.65, 14, 14)
  const hairMat = new THREE.MeshStandardMaterial({ color: PYRITE_3D.agentHair, roughness: 0.9 })
  const hair = new THREE.Mesh(hairGeo, hairMat)
  hair.position.set(0, 14.8, 1.0)
  hair.scale.set(1.02, 0.95, 0.9)
  agentFigure.add(hair)

  const headsetBandGeo = new THREE.TorusGeometry(2.4, 0.25, 8, 16)
  const headsetMat = new THREE.MeshStandardMaterial({ color: 0x27272a, metalness: 0.8 })
  const headset = new THREE.Mesh(headsetBandGeo, headsetMat)
  headset.rotation.z = Math.PI / 2
  headset.position.set(0, 14.6, 0.6)
  agentFigure.add(headset)

  const visorGeo = new THREE.BoxGeometry(3.6, 1.1, 1.4)
  const visorMat = new THREE.MeshStandardMaterial({
    color: isConnected ? accentColorNum : PYRITE_3D.statusOffline,
    emissive: isConnected ? accentColorNum : 0x000000,
    emissiveIntensity: isConnected ? 2.2 : 0
  })
  const visor = new THREE.Mesh(visorGeo, visorMat)
  visor.position.set(0, 14.2, -1.5)
  agentFigure.add(visor)

  group.add(agentFigure)

  // Hitbox invisível
  const hitGeo = new THREE.BoxGeometry(deskTopWidth + 4, 18, deskTopDepth + 12)
  const hitMat = new THREE.MeshBasicMaterial({ visible: false })
  const hitMesh = new THREE.Mesh(hitGeo, hitMat)
  hitMesh.position.set(0, 9, 2)
  group.add(hitMesh)

  return group
}

export const Organogram3DView: React.FC<Organogram3DViewProps> = ({
  squads,
  agents,
  vaultName = 'Cofre Principal',
  accentColor,
  isSidebarCollapsed = false,
  onToggleSidebar,
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

  // Cor de destaque dinâmica baseada no tema selecionado pelo usuário
  const [dynamicAccent, setDynamicAccent] = useState(() => getDynamicAccentColor(accentColor))

  useEffect(() => {
    const updateAccent = () => {
      const next = getDynamicAccentColor(accentColor)
      setDynamicAccent(prev => (prev.hex === next.hex ? prev : next))
    }
    updateAccent()
    const observer = new MutationObserver(updateAccent)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'class'] })
    return () => observer.disconnect()
  }, [accentColor])

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
      const availableIntegrations = getAvailableIntegrations(dynamicAccent.hex)
      const initialIntegrations = availableIntegrations.map(i => i.id).filter(id =>
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
  // MINI TURNTABLE 3D NO DRAWER PARA O AGENTE SELECIONADO (ESTILO PYRITE)
  // =========================================================================
  useEffect(() => {
    const canvas = turntableCanvasRef.current
    if (!canvas || !selectedAgent) return

    const ttWidth = canvas.clientWidth || 300
    const ttHeight = canvas.clientHeight || 150

    const ttScene = new THREE.Scene()
    ttScene.background = new THREE.Color(0x121215)

    const ttCamera = new THREE.PerspectiveCamera(30, ttWidth / ttHeight, 1, 1000)
    ttCamera.position.set(0, 24, 46)
    ttCamera.lookAt(0, 8, 0)

    const ttRenderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'low-power'
    })
    ttRenderer.setSize(ttWidth, ttHeight)
    ttRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))

    const ttAmbient = new THREE.AmbientLight(0xffffff, 1.35)
    ttScene.add(ttAmbient)

    const ttDirLight = new THREE.DirectionalLight(0xffffff, 1.6)
    ttDirLight.position.set(20, 35, 25)
    ttScene.add(ttDirLight)

    const ttGroup = new THREE.Group()

    // Base giratória com anel circular de neon dourado
    const discGeo = new THREE.CylinderGeometry(18, 19, 1.5, 32)
    const discMat = new THREE.MeshStandardMaterial({
      color: PYRITE_3D.platformNavy,
      metalness: 0.8,
      roughness: 0.3
    })
    const disc = new THREE.Mesh(discGeo, discMat)
    disc.position.y = 0.75
    ttGroup.add(disc)

    const ringGeo = new THREE.TorusGeometry(17, 0.5, 12, 40)
    const ringMat = new THREE.MeshStandardMaterial({
      color: dynamicAccent.num,
      emissive: dynamicAccent.num,
      emissiveIntensity: 2.0
    })
    const ring = new THREE.Mesh(ringGeo, ringMat)
    ring.rotation.x = Math.PI / 2
    ring.position.y = 1.6
    ttGroup.add(ring)

    // Estação do agente detalhada na base giratória
    const isConn = selectedAgent.state !== 'paused'
    const miniStation = createWorkstationMesh({
      agent: selectedAgent,
      squadId: selectedAgentCurrentSquad?.id || '',
      isConnected: isConn,
      x: 0,
      z: -2,
      facingAngle: 0,
      accentColorNum: dynamicAccent.num
    })
    ttGroup.add(miniStation)

    ttScene.add(ttGroup)

    let ttAnimId: number
    const animateTurntable = () => {
      ttAnimId = requestAnimationFrame(animateTurntable)
      ttGroup.rotation.y += 0.012
      ttRenderer.render(ttScene, ttCamera)
    }
    animateTurntable()

    return () => {
      cancelAnimationFrame(ttAnimId)
      ttRenderer.dispose()
    }
  }, [selectedAgent, selectedAgentCurrentSquad, dynamicAccent.hex])

  // =========================================================================
  // MONTAGEM DO CENÁRIO PRINCIPAL THREE.JS (CORES NATIVAS PYRITE & TABULEIROS ESTREITOS)
  // =========================================================================
  useEffect(() => {
    const container = containerRef.current
    const canvas = canvasRef.current
    if (!container || !canvas) return

    let width = container.clientWidth
    let height = container.clientHeight

    // 1. Scene, Camera, Renderer
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(PYRITE_3D.floorBg)

    const camera = new THREE.PerspectiveCamera(34, width / height, 1, 3000)
    camera.position.set(0, 240, 380)
    camera.lookAt(0, 0, 0)
    cameraRef.current = camera

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance'
    })
    renderer.setSize(width, height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
    renderer.shadowMap.enabled = false

    // 2. OrbitControls com Pan Totalmente Livre e Desbloqueado
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.screenSpacePanning = true // PAN TOTALMENTE LIVRE
    controls.maxPolarAngle = Math.PI / 2 - 0.04
    controls.minDistance = 90
    controls.maxDistance = 1100
    controls.target.set(0, 0, 0)
    controls.mouseButtons = {
      LEFT: THREE.MOUSE.PAN,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.ROTATE
    }
    controlsRef.current = controls

    // 3. Iluminação Pyrite (Quente / Ouro + Neutro Titânio)
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.35)
    scene.add(ambientLight)

    const dirLight = new THREE.DirectionalLight(0xfffbeb, 1.5)
    dirLight.position.set(160, 320, 200)
    scene.add(dirLight)

    const vaultPointLight = new THREE.PointLight(dynamicAccent.num, 2.2, 380)
    vaultPointLight.position.set(0, 48, 0)
    scene.add(vaultPointLight)

    // 4. Piso Industrial com Grid Pyrite
    const floorSize = 1800
    const gridHelper = new THREE.GridHelper(floorSize, 50, dynamicAccent.num, 0x1f1f23)
    gridHelper.position.y = -0.5
    // @ts-ignore
    gridHelper.material.opacity = 0.18
    // @ts-ignore
    gridHelper.material.transparent = true
    scene.add(gridHelper)

    // =======================================================================
    // 5. CENTRO: O COFRE CORPORATIVO (REDONDO, REDUZIDO PELA METADE COM HQ TOWER)
    // =======================================================================
    const hubGroup = new THREE.Group()
    hubGroup.position.set(0, 0, 0)

    // Redução do círculo central pela metade (raio 24 em vez de 48)
    const hubRadius = 24
    const baseCylGeo = new THREE.CylinderGeometry(hubRadius, hubRadius + 3, 5, 48)
    const baseCylMat = new THREE.MeshStandardMaterial({
      color: PYRITE_3D.platformNavy,
      roughness: 0.35,
      metalness: 0.85
    })
    const baseCyl = new THREE.Mesh(baseCylGeo, baseCylMat)
    baseCyl.position.y = 2.5
    hubGroup.add(baseCyl)

    // Anel perimetral luminoso na cor de destaque selecionada
    const goldRingGeo = new THREE.TorusGeometry(hubRadius - 0.5, 1.0, 12, 48)
    const goldRingMat = new THREE.MeshStandardMaterial({
      color: dynamicAccent.num,
      emissive: dynamicAccent.num,
      emissiveIntensity: 2.2,
      roughness: 0.2,
      metalness: 0.8
    })
    const goldRing = new THREE.Mesh(goldRingGeo, goldRingMat)
    goldRing.rotation.x = Math.PI / 2
    goldRing.position.y = 5.0
    hubGroup.add(goldRing)

    // Platô superior biselado da praça
    const topPlateGeo = new THREE.CylinderGeometry(hubRadius - 3, hubRadius - 3, 2, 48)
    const topPlateMat = new THREE.MeshStandardMaterial({
      color: PYRITE_3D.platformSteel,
      roughness: 0.5,
      metalness: 0.8
    })
    const topPlate = new THREE.Mesh(topPlateGeo, topPlateMat)
    topPlate.position.y = 6.0
    hubGroup.add(topPlate)

    // Núcleo circular embutido da praça
    const coreDiscGeo = new THREE.CylinderGeometry(hubRadius - 5, hubRadius - 5, 0.6, 36)
    const coreDiscMat = new THREE.MeshStandardMaterial({
      color: PYRITE_3D.platformNavy,
      roughness: 0.25,
      metalness: 0.9
    })
    const coreDisc = new THREE.Mesh(coreDiscGeo, coreDiscMat)
    coreDisc.position.y = 7.3
    hubGroup.add(coreDisc)

    const coreRingGeo = new THREE.TorusGeometry(hubRadius - 6, 0.5, 10, 36)
    const coreRingMat = new THREE.MeshStandardMaterial({
      color: dynamicAccent.num,
      emissive: dynamicAccent.num,
      emissiveIntensity: 1.8
    })
    const coreRing = new THREE.Mesh(coreRingGeo, coreRingMat)
    coreRing.rotation.x = Math.PI / 2
    coreRing.position.y = 7.6
    hubGroup.add(coreRing)

    // PREDIOZINHO CORPORATIVO NO CENTRO (MINIATURA DA CORPORAÇÃO)
    const hqBuilding = createCorporateHQBuilding(
      dynamicAccent.num,
      PYRITE_3D.platformSteel,
      PYRITE_3D.platformNavy,
      PYRITE_3D.platformTrim
    )
    hqBuilding.position.y = 7.6
    hubGroup.add(hqBuilding)

    scene.add(hubGroup)

    // =======================================================================
    // 6. PLATAFORMAS DOS DEPARTAMENTOS (TABULEIROS ESTREITOS COM MARGEM MÍNIMA)
    // =======================================================================
    const totalSquads = squads.length
    deskMeshesRef.current.clear()
    pulseSpheresRef.current = []

    const computeSquadCoords = (idx: number, total: number) => {
      if (total === 1) return { x: 0, z: -180 }
      if (total === 2) {
        return idx === 0 ? { x: -180, z: -10 } : { x: 180, z: -10 }
      }
      if (total === 3) {
        if (idx === 0) return { x: -190, z: -70 }
        if (idx === 1) return { x: 190, z: -70 }
        return { x: 0, z: 160 }
      }
      if (total === 4) {
        if (idx === 0) return { x: -190, z: -80 }
        if (idx === 1) return { x: 190, z: -80 }
        if (idx === 2) return { x: -190, z: 90 }
        return { x: 190, z: 90 }
      }
      const angle = (idx / total) * Math.PI * 2 - Math.PI / 2
      return {
        x: Math.round(Math.cos(angle) * 240),
        z: Math.round(Math.sin(angle) * 160)
      }
    }

    squads.forEach((sq, sIdx) => {
      const { x: sqX, z: sqZ } = computeSquadCoords(sIdx, totalSquads)
      const pipeline = sq.pipeline || []
      const squadAgents = pipeline
        .map(p => ({
          step: p,
          agent: agents.find(a => a.id === p.agentId)
        }))
        .filter(item => Boolean(item.agent)) as { step: SquadPipelineStep; agent: AgentProfileVersion }[]

      const platformGroup = new THREE.Group()
      platformGroup.position.set(sqX, 0, sqZ)

      const agentCount = squadAgents.length
      const cols = agentCount > 3 ? 3 : Math.max(1, agentCount)
      const rows = Math.ceil(agentCount / cols)

      // Dimensões estreitas que abraçam os módulos de mesas
      const deskPitchX = 29
      const deskPitchZ = 24
      const marginX = 8
      const marginZ = 7

      const platWidth = Math.max(76, cols * deskPitchX + marginX * 2)
      const platDepth = Math.max(48, rows * deskPitchZ + marginZ * 2)
      const platHeight = 7

      // Base do tabuleiro em titânio escuro
      const basePlatformGeo = new THREE.BoxGeometry(platWidth + 4, 2.5, platDepth + 4)
      const basePlatformMat = new THREE.MeshStandardMaterial({
        color: PYRITE_3D.platformNavy,
        roughness: 0.5,
        metalness: 0.85
      })
      const basePlat = new THREE.Mesh(basePlatformGeo, basePlatformMat)
      basePlat.position.y = 1.25
      platformGroup.add(basePlat)

      // Corpo principal do tabuleiro estreito
      const platGeo = new THREE.BoxGeometry(platWidth, platHeight, platDepth)
      const platMat = new THREE.MeshStandardMaterial({
        color: PYRITE_3D.platformSteel,
        roughness: 0.45,
        metalness: 0.75
      })
      const platMesh = new THREE.Mesh(platGeo, platMat)
      platMesh.position.y = platHeight / 2 + 1.25
      platformGroup.add(platMesh)

      // Friso luminoso na borda superior do tabuleiro na cor selecionada
      const edgeGeo = new THREE.BoxGeometry(platWidth + 0.8, 1.2, platDepth + 0.8)
      const edgeMat = new THREE.MeshStandardMaterial({
        color: dynamicAccent.num,
        emissive: dynamicAccent.num,
        emissiveIntensity: 1.6,
        roughness: 0.2,
        metalness: 0.8
      })
      const edgeMesh = new THREE.Mesh(edgeGeo, edgeMat)
      edgeMesh.position.y = platHeight + 1.6
      platformGroup.add(edgeMesh)

      // Terminal/Dock de conexão dos cabos de dados
      const dockWidth = 18
      const dockDepth = 6
      const dockHeight = 5
      const dockGeo = new THREE.BoxGeometry(dockWidth, dockHeight, dockDepth)
      const dockMat = new THREE.MeshStandardMaterial({
        color: PYRITE_3D.platformTrim,
        metalness: 0.85,
        roughness: 0.25
      })
      const dockMesh = new THREE.Mesh(dockGeo, dockMat)
      const isLeftSide = sqX < 0
      const dockX = isLeftSide ? platWidth / 2 - dockDepth / 2 : -platWidth / 2 + dockDepth / 2
      dockMesh.position.set(dockX, platHeight + 0.5, 0)
      platformGroup.add(dockMesh)

      // 7. CRIAÇÃO DE CADA ESTAÇÃO DE TRABALHO
      squadAgents.forEach(({ step, agent }, agIdx) => {
        const col = agIdx % cols
        const row = Math.floor(agIdx / cols)

        const startX = -((cols - 1) * deskPitchX) / 2
        const startZ = -((rows - 1) * deskPitchZ) / 2

        const deskX = startX + col * deskPitchX
        const deskZ = startZ + row * deskPitchZ

        let facingAngle = 0
        if (rows > 1 && row === 1) {
          facingAngle = Math.PI
        }

        const isConnected = step.enabled !== false && agent.state !== 'paused'

        const workstation = createWorkstationMesh({
          agent,
          squadId: sq.id,
          isConnected,
          x: deskX,
          z: deskZ,
          facingAngle,
          accentColorNum: dynamicAccent.num
        })

        workstation.position.y = platHeight + 1.25

        platformGroup.add(workstation)
        deskMeshesRef.current.set(agent.id, workstation)
      })

      scene.add(platformGroup)

      // =======================================================================
      // 8. CONDUÍTES CONTÍNUOS QUE ENCONTRAM O DOCK DA PLATAFORMA
      // =======================================================================
      const angle = Math.atan2(sqZ, sqX)
      const startX = Math.cos(angle) * hubRadius
      const startZ = Math.sin(angle) * hubRadius

      const endX = isLeftSide ? sqX + platWidth / 2 : sqX - platWidth / 2
      const endZ = sqZ

      const distX = endX - startX
      const distZ = endZ - startZ

      const mid1X = startX + distX * 0.35
      const mid1Z = startZ + distZ * 0.15
      const mid2X = startX + distX * 0.70
      const mid2Z = endZ

      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(startX, 6, startZ),
        new THREE.Vector3(mid1X, 4, mid1Z),
        new THREE.Vector3(mid2X, 4, mid2Z),
        new THREE.Vector3(endX, 6, endZ)
      ])

      // Tubo de blindagem metálica grafite
      const armorTubeGeo = new THREE.TubeGeometry(curve, 20, 2.0, 8, false)
      const armorTubeMat = new THREE.MeshStandardMaterial({
        color: PYRITE_3D.platformTrim,
        roughness: 0.35,
        metalness: 0.85
      })
      const armorTube = new THREE.Mesh(armorTubeGeo, armorTubeMat)
      scene.add(armorTube)

      // Fibra de dados luminosa interna na cor selecionada
      const coreTubeGeo = new THREE.TubeGeometry(curve, 20, 0.9, 6, false)
      const coreTubeMat = new THREE.MeshStandardMaterial({
        color: dynamicAccent.num,
        emissive: dynamicAccent.num,
        emissiveIntensity: 2.2,
        roughness: 0.15
      })
      const coreTube = new THREE.Mesh(coreTubeGeo, coreTubeMat)
      scene.add(coreTube)

      // Esfera de pulso de dados animada
      const pulseGeo = new THREE.SphereGeometry(1.8, 10, 10)
      const pulseMat = new THREE.MeshStandardMaterial({
        color: 0xfffbeb,
        emissive: dynamicAccent.num,
        emissiveIntensity: 3.5
      })
      const pulseMesh = new THREE.Mesh(pulseGeo, pulseMat)
      scene.add(pulseMesh)

      pulseSpheresRef.current.push({
        mesh: pulseMesh,
        curve,
        speed: 0.004 + (sIdx % 3) * 0.001,
        progress: sIdx * 0.35
      })
    })

    // =======================================================================
    // 9. LOOP DE ANIMAÇÃO SUPER LEVE COM ATUALIZAÇÃO DIRETA NO DOM
    // =======================================================================
    let animId: number
    const tempVec = new THREE.Vector3()

    const animate = () => {
      animId = requestAnimationFrame(animate)

      controls.update()

      const cameraDist = camera.position.distanceTo(controls.target)
      const zoomed = cameraDist < 320

      pulseSpheresRef.current.forEach(p => {
        p.progress = (p.progress + p.speed) % 1
        const pos = p.curve.getPointAt(p.progress)
        p.mesh.position.copy(pos)
      })

      renderer.render(scene, camera)

      // 1. Tag do Hub Central (acima da antena da torre corporativa)
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
          tempVec.set(sqX, 16, sqZ + 45)
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
              tempVec.y += 18
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

    // Raycasting
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
  }, [squads, agents, vaultName, dynamicAccent.hex])

  // Resetar câmera e alvo para a perspectiva compacta padrão
  const handleResetCamera = () => {
    if (!cameraRef.current || !controlsRef.current) return
    cameraRef.current.position.set(0, 240, 380)
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
      className="relative w-full h-full overflow-hidden select-none bg-[#09090b]"
    >
      {/* =========================================================================
          1. HEADER SUPERIOR COM IDENTIDADE PYRITE & BOTÃO DE RECOLHER SIDEBAR
          ========================================================================= */}
      <header className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-5 py-3.5 bg-gradient-to-b from-[#09090b]/95 via-[#09090b]/75 to-transparent pointer-events-none">
        <div className="flex items-center gap-3 pointer-events-auto">
          {onToggleSidebar && (
            <button
              type="button"
              onClick={onToggleSidebar}
              className="p-2 rounded-xl bg-[#141417]/90 border border-zinc-800 hover:border-zinc-700 text-zinc-300 hover:text-zinc-100 shadow-md backdrop-blur-md transition-all cursor-pointer active:scale-95"
              title={isSidebarCollapsed ? 'Expandir barra lateral' : 'Recolher barra lateral'}
            >
              {isSidebarCollapsed ? (
                <PanelLeft className="w-4 h-4 text-[var(--accent)]" />
              ) : (
                <PanelLeftClose className="w-4 h-4 text-zinc-400" />
              )}
            </button>
          )}

          <div className="w-9 h-9 rounded-xl bg-[var(--accent)]/15 border border-[var(--accent)]/30 flex items-center justify-center text-[var(--accent)] shadow-sm">
            <Building2 className="w-4 h-4 text-[var(--accent)]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold text-zinc-100 tracking-tight">
                {vaultName}
              </h1>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--accent)]/10 border border-[var(--accent)]/30 text-[var(--accent)] font-mono font-medium">
                ORGANOGRAMA 3D
              </span>
            </div>
            <p className="text-[11px] text-zinc-400">
              Sede Corporativa &bull; Governança de Departamentos e Especialistas
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 pointer-events-auto">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#141417]/90 border border-zinc-800 text-xs text-zinc-300 shadow-lg backdrop-blur-md">
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
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[var(--accent)] hover:brightness-110 text-zinc-950 font-bold text-xs transition-all shadow-sm active:scale-95 cursor-pointer"
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
          <div className="px-3.5 py-1 rounded-full bg-[#141417]/95 border border-[var(--accent)]/50 text-center shadow-xl backdrop-blur-md flex items-center gap-2">
            <span
              className="w-2 h-2 rounded-full bg-[var(--accent)] animate-pulse shrink-0"
              style={{ boxShadow: `0 0 8px ${dynamicAccent.hex}` }}
            />
            <span className="text-xs font-bold text-zinc-100">{vaultName}</span>
            <span className="text-[10px] font-mono text-[var(--accent)] uppercase font-semibold">&bull; CORPORATE HQ</span>
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
                <div className="px-3 py-1.5 rounded-2xl bg-[#141417]/95 border border-zinc-800 hover:border-[var(--accent)]/60 text-center shadow-xl backdrop-blur-md flex items-center gap-2 transition-all w-max whitespace-nowrap shrink-0">
                  <div className="w-5 h-5 rounded-lg bg-[var(--accent)]/15 border border-[var(--accent)]/30 flex items-center justify-center text-[var(--accent)] shrink-0">
                    {renderDynamicIcon(sq.icon || 'Users', 'w-3 h-3 text-[var(--accent)]')}
                  </div>
                  <div className="text-left flex items-center gap-1.5 whitespace-nowrap shrink-0">
                    <span className="text-[11.5px] font-bold text-zinc-100 whitespace-nowrap">{sq.name}</span>
                    <span className="text-[10px] text-[var(--accent)] font-mono font-medium whitespace-nowrap">
                      ({count} {count === 1 ? 'Agente' : 'Agentes'})
                    </span>
                  </div>

                  <div className="flex items-center gap-1 ml-1 shrink-0">
                    {onOpenSquadChat && (
                      <button
                        type="button"
                        onClick={() => onOpenSquadChat(sq)}
                        className="p-1 rounded-lg bg-zinc-800 hover:bg-[var(--accent)] hover:text-zinc-950 text-zinc-300 transition-colors cursor-pointer"
                        title={`Conversar com equipe de ${sq.name}`}
                      >
                        <MessageSquare className="w-3 h-3" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onSelectSquad(sq.id)}
                      className="px-2 py-0.5 rounded-lg bg-zinc-800 hover:bg-[var(--accent)] hover:text-zinc-950 text-zinc-200 text-[10px] font-medium flex items-center gap-0.5 transition-colors cursor-pointer shrink-0"
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
                const isConn = p.enabled !== false && ag.state !== 'paused'

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
                      className={`px-2 py-0.5 rounded-full border text-[10px] font-medium flex items-center gap-1.5 shadow-lg backdrop-blur-md ${
                        isSelected
                          ? 'bg-[var(--accent)] border-[var(--accent)] text-zinc-950 font-bold'
                          : 'bg-[#141417]/95 border-zinc-800 text-zinc-200 hover:border-[var(--accent)]/50'
                      }`}
                      style={{
                        boxShadow: isSelected ? `0 0 12px ${dynamicAccent.hex}66` : undefined
                      }}
                    >
                      <AgentIcon variant={ag.icon} size={13} className="shrink-0 rounded-full" />
                      <span className="truncate max-w-[90px]">{ag.name}</span>
                      <span
                        className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                          isConn
                            ? 'bg-emerald-400 shadow-[0_0_6px_#34d399]'
                            : 'bg-zinc-600 shadow-none'
                        }`}
                        title={isConn ? 'Conectado / Online' : 'Pausado / Desconectado'}
                      />
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
        className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 px-3 py-2 rounded-2xl bg-[#141417]/95 border border-zinc-800 shadow-2xl backdrop-blur-xl pointer-events-auto"
      >
        {/* Alternador de Modo de Arraste (Mover vs Girar) */}
        <div className="flex items-center rounded-xl bg-zinc-900/80 p-0.5 border border-zinc-800/80">
          <button
            type="button"
            onClick={() => setNavMode('pan')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              navMode === 'pan'
                ? 'bg-[var(--accent)] text-zinc-950 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
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
                ? 'bg-[var(--accent)] text-zinc-950 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
            title="Modo Girar: Arraste para orbitar o ângulo da câmera"
          >
            <Compass className="w-3.5 h-3.5" />
            <span>Girar (Órbita)</span>
          </button>
        </div>

        <div className="w-px h-4 bg-zinc-800 mx-1" />

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

        <button
          type="button"
          onClick={handleResetCamera}
          className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors cursor-pointer"
          title="Centralizar Câmera no Cofre Central"
        >
          <RotateCcw className="w-4 h-4" />
        </button>

        <div className="w-px h-4 bg-zinc-800 mx-1" />

        <button
          type="button"
          onClick={handleToggleFullscreen}
          className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors cursor-pointer"
          title={isFullscreen ? 'Sair da Tela Cheia' : 'Tela Cheia'}
        >
          {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </button>
      </nav>

      {/* =========================================================================
          5. DRAWER LATERAL: "AGENT CONFIGURATION" (IDENTIDADE PYRITE)
          ========================================================================= */}
      {selectedAgent && (
        <aside
          role="region"
          aria-label="Configuração do Agente"
          className="absolute top-0 right-0 bottom-0 w-96 bg-[#121215]/98 border-l border-zinc-800 shadow-2xl z-30 flex flex-col backdrop-blur-2xl animate-in slide-in-from-right duration-200"
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
            {/* 1. Preview 3D Real com a Estação de Trabalho do Agente */}
            <div className="relative rounded-2xl bg-gradient-to-b from-[#18181b] to-[#121215] border border-zinc-800 p-3 flex flex-col items-center justify-center shadow-inner overflow-hidden">
              <div
                className={`absolute top-2.5 right-2.5 z-10 flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-medium font-mono ${
                  formIsActive
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                    : 'bg-zinc-800 border-zinc-700 text-zinc-400'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    formIsActive ? 'bg-emerald-400 shadow-[0_0_6px_#34d399]' : 'bg-zinc-500'
                  }`}
                />
                <span>{formIsActive ? 'CONECTADO' : 'DESCONECTADO'}</span>
              </div>

              {/* Canvas 3D do Turntable Giratório */}
              <div className="w-full h-36 relative flex items-center justify-center">
                <canvas
                  ref={turntableCanvasRef}
                  className="w-full h-full block outline-none"
                />
              </div>

              <div className="w-full pt-2 border-t border-zinc-800/80 flex items-center justify-between text-[10px] text-zinc-400 px-1">
                <span className="font-medium text-zinc-200">{selectedAgent.name}</span>
                <span className="text-[var(--accent)] font-mono">
                  {selectedAgentCurrentSquad ? selectedAgentCurrentSquad.name : 'Especialista Livre'}
                </span>
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
                  className="w-full bg-[#18181b] border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-[var(--accent)]"
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
                className="w-full bg-[#18181b] border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-[var(--accent)] cursor-pointer"
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
                className="w-full bg-[#18181b] border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-[var(--accent)]"
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
                          : 'bg-[#18181b] text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 border border-zinc-800'
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
                {getAvailableIntegrations(dynamicAccent.hex).map(item => {
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
                          ? 'bg-[var(--accent)]/15 border-[var(--accent)] text-zinc-100'
                          : 'bg-[#18181b] border-zinc-800 text-zinc-400 hover:border-zinc-700'
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

            {/* 7. Toggles Operacionais (Conectado / Desconectado) */}
            <div className="space-y-3 pt-2 border-t border-zinc-800">
              <label className="flex items-center justify-between cursor-pointer">
                <div>
                  <span className="text-xs text-zinc-200 font-medium">Especialista Conectado</span>
                  <p className="text-[10px] text-zinc-400">
                    {formIsActive ? 'Estação iluminada e ativa' : 'Estação desligada (standby)'}
                  </p>
                </div>
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
          <div className="p-4 border-t border-zinc-800 space-y-2 bg-[#0e0e11]">
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
                className="w-full py-2 rounded-xl bg-[var(--accent)] hover:brightness-110 text-zinc-950 font-bold text-xs transition-all shadow-sm active:scale-95 cursor-pointer flex items-center justify-center gap-1.5"
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
