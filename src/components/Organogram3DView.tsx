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
// PALETA DE CORES NATIVA DO PYRITE (TITÂNIO ESCURO REFINADO & ALTO CONTRASTE)
// =============================================================================
const PYRITE_3D = {
  floorBg: 0x0e131d,          // Dark studio slate (subtle navy tint, nunca preto 100% puro)
  platformNavy: 0x222a3a,     // Titânio escuro azulado elegante
  platformSteel: 0x2b3548,    // Aço estrutural slate Zinc/Titanium
  platformTrim: 0x3d4a63,     // Friso arquitetônico metálico
  platformDeck: 0x1d2433,     // Superfície do piso do pod
  gridColor: 0x263147,        // Linhas de grade visíveis e elegantes
  // STATUS CONECTADO (ONLINE)
  statusOnline: 0x10b981,     // Esmeralda conectado
  // STATUS DESCONECTADO (OFFLINE / PAUSADO)
  statusOffline: 0x64748b,    // Slate-500 standby
  screenOffline: 0x181e28,    // Tela desligada fosca
  // MESA E ESCRITÓRIO (ALTO CONTRASTE IDENTICO A REFERENCIA)
  deskWood: 0xf5eedf,         // Madeira birch clara (destaque brilhante sobre piso)
  deskLegDark: 0x293244,      // Estrutura metálica grafite
  drawerUnit: 0xd9d0c1,       // Gaveteiro claro
  chairMesh: 0x222a38,        // Cadeira ergonômica carvão
  chairChrome: 0x94a3b8,      // Metal cromado da cadeira

  // ROBLOX-STYLE AVATARS: Paletas de roupas, pele e cabelo para variedade visual rica
  skinTones: [0xfcd34d, 0xfde047, 0xf59e0b, 0xfbb6ce, 0xd97706],
  hairTones: [0x1e293b, 0x475569, 0xb45309, 0x0f172a, 0x334155],
  outfitTones: [
    { top: 0x2563eb, pants: 0x1e293b, shoes: 0xffffff, accent: 0x60a5fa }, // Royal Tech
    { top: 0x7c3aed, pants: 0x0f172a, shoes: 0xf1f5f9, accent: 0xa78bfa }, // Violet AI
    { top: 0x059669, pants: 0x1e293b, shoes: 0xffffff, accent: 0x34d399 }, // Emerald Pro
    { top: 0xd97706, pants: 0x1e293b, shoes: 0xffffff, accent: 0xfbbf24 }, // Amber Studio
    { top: 0x0284c7, pants: 0x0f172a, shoes: 0xf8fafc, accent: 0x38bdf8 }, // Cyan Agile
    { top: 0xe11d48, pants: 0x1e293b, shoes: 0xffffff, accent: 0xfb7185 }  // Crimson Lead
  ]
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
// FUNÇÃO UTILITÁRIA PARA GERAR FORMA DE TABULEIRO COM CANTOS ARREDONDADOS (POD)
// =============================================================================
function createRoundedRectShape(width: number, depth: number, radius: number): THREE.Shape {
  const shape = new THREE.Shape()
  const hw = width / 2
  const hd = depth / 2
  const r = Math.min(radius, hw - 1, hd - 1)
  shape.moveTo(-hw + r, -hd)
  shape.lineTo(hw - r, -hd)
  shape.quadraticCurveTo(hw, -hd, hw, -hd + r)
  shape.lineTo(hw, hd - r)
  shape.quadraticCurveTo(hw, hd, hw - r, hd)
  shape.lineTo(-hw + r, hd)
  shape.quadraticCurveTo(-hw, hd, -hw, hd - r)
  shape.lineTo(-hw, -hd + r)
  shape.quadraticCurveTo(-hw, -hd, -hw + r, -hd)
  return shape
}

// =============================================================================
// EDIFÍCIO CORPORATIVO CENTRAL (MINIATURA 3D ESTILIZADA DE ESCRITÓRIO MODERNO)
// =============================================================================
function createCorporateHQBuilding(accentNum: number): THREE.Group {
  const building = new THREE.Group()

  // 1. Materiais da Fachada Corporativa (Alta Legibilidade e Contraste)
  // Concreto / pedra arquitetônica em tom ardósia suave elegante (Clean Slate)
  const facadeWallMat = new THREE.MeshStandardMaterial({
    color: 0xdbe4ee, // Cinza ardósia suave arquitetônico (não monocromático lavado)
    roughness: 0.55,
    metalness: 0.1
  })

  // Faixas horizontais de divisão de andares (Spandrel panels / frisos de pavimento)
  const floorBandMat = new THREE.MeshStandardMaterial({
    color: 0x334155, // Ardósia escura de alto contraste que divide nitidamente cada andar
    roughness: 0.35,
    metalness: 0.35
  })

  // Janelas de vidro azul-ciano nítidas (Vidro espelhado corporativo aceso)
  const windowGlassMat = new THREE.MeshStandardMaterial({
    color: 0x0284c7, // Azul elétrico corporativo
    emissive: 0x0369a1,
    emissiveIntensity: 0.95,
    roughness: 0.1,
    metalness: 0.85
  })

  // Molduras de janela em branco puro (Criam alto relevo e delimitam cada janela)
  const winFrameMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.25,
    metalness: 0.15
  })

  // Base do pórtico, degraus e acabamentos técnicos
  const stepStoneMat = new THREE.MeshStandardMaterial({
    color: 0x64748b,
    roughness: 0.6,
    metalness: 0.2
  })

  // Folhagem verde viva das árvores e arbustos
  const foliageMat = new THREE.MeshStandardMaterial({
    color: 0x16a34a,
    roughness: 0.75,
    metalness: 0.05
  })

  // Tronco das árvores
  const trunkMat = new THREE.MeshStandardMaterial({
    color: 0x78350f,
    roughness: 0.85
  })

  // Gramado verde da praça
  const lawnMat = new THREE.MeshStandardMaterial({
    color: 0x15803d,
    roughness: 0.85
  })

  // Emblema e iluminação de acento corporativo
  const accentEmissiveMat = new THREE.MeshStandardMaterial({
    color: accentNum,
    emissive: accentNum,
    emissiveIntensity: 2.8,
    roughness: 0.15
  })

  // 2. GRAMADO VERDE CIRCULAR E CALÇADA NA BASE
  const lawnGeo = new THREE.CylinderGeometry(20, 20.5, 0.4, 40)
  const lawn = new THREE.Mesh(lawnGeo, lawnMat)
  lawn.position.y = 0.2
  building.add(lawn)

  // Calçada / base de concreto sob o prédio
  const basePlinthGeo = new THREE.BoxGeometry(18.5, 0.4, 15.5)
  const basePlinth = new THREE.Mesh(basePlinthGeo, stepStoneMat)
  basePlinth.position.y = 0.4
  building.add(basePlinth)

  // 3. CORPO PRINCIPAL DO EDIFÍCIO (TORRE COM CANTOS ARREDONDADOS)
  const towerW = 16.0
  const towerH = 32.0
  const towerD = 13.0
  const towerBaseY = 0.4

  const towerShape = createRoundedRectShape(towerW, towerD, 1.4)
  // bevelEnabled: false garante dimensões exatas sem dilatação que esconda as janelas
  const towerGeo = new THREE.ExtrudeGeometry(towerShape, {
    depth: towerH,
    bevelEnabled: false
  })
  towerGeo.rotateX(-Math.PI / 2)
  const tower = new THREE.Mesh(towerGeo, facadeWallMat)
  tower.position.set(0, towerBaseY, 0)
  building.add(tower)

  // 4. DIVISÕES DE ANDARES (FAIXAS HORIZONTAIS DE PAVIMENTO / CORNIJAS)
  // Criam as separações rítmicas de cada um dos pavimentos, visíveis de qualquer distância
  const bandLevels = [6.0, 9.6, 13.2, 16.8, 20.4, 24.0, 27.6, 31.2]
  const bandShape = createRoundedRectShape(towerW + 0.35, towerD + 0.35, 1.5)
  const bandGeo = new THREE.ExtrudeGeometry(bandShape, {
    depth: 0.35,
    bevelEnabled: false
  })
  bandGeo.rotateX(-Math.PI / 2)

  bandLevels.forEach(by => {
    const band = new THREE.Mesh(bandGeo, floorBandMat)
    band.position.set(0, by, 0)
    building.add(band)
  })

  // 5. GRADE DE JANELAS AZUIS INDIVIDUAIS COM MOLDURAS (7 ANDARES DE ESCRITÓRIOS)
  const floorCentersY = [7.8, 11.4, 15.0, 18.6, 22.2, 25.8, 29.4]
  const winW = 2.2
  const winH = 2.0
  const winFrameGeo = new THREE.BoxGeometry(winW + 0.35, winH + 0.35, 0.4)
  const winGeo = new THREE.BoxGeometry(winW, winH, 0.45)

  floorCentersY.forEach(wy => {
    // Fachada Frontal (Z = +towerD / 2 = +6.5)
    // 4 colunas de janelas com molduras e vidros azuis saltando para fora da parede
    ;[-5.2, -1.8, 1.8, 5.2].forEach(wx => {
      const frame = new THREE.Mesh(winFrameGeo, winFrameMat)
      frame.position.set(wx, wy, towerD / 2 + 0.15)
      building.add(frame)

      const win = new THREE.Mesh(winGeo, windowGlassMat)
      win.position.set(wx, wy, towerD / 2 + 0.22)
      building.add(win)
    })

    // Fachada Traseira (Z = -towerD / 2 = -6.5)
    ;[-5.2, -1.8, 1.8, 5.2].forEach(wx => {
      const frame = new THREE.Mesh(winFrameGeo, winFrameMat)
      frame.position.set(wx, wy, -towerD / 2 - 0.15)
      building.add(frame)

      const win = new THREE.Mesh(winGeo, windowGlassMat)
      win.position.set(wx, wy, -towerD / 2 - 0.22)
      building.add(win)
    })

    // Fachadas Laterais Esquerda e Direita (X = -towerW / 2 e +towerW / 2 = -8.0 e +8.0)
    const sideFrameGeo = new THREE.BoxGeometry(0.4, winH + 0.35, winW + 0.35)
    const sideWinGeo = new THREE.BoxGeometry(0.45, winH, winW)
    ;[-3.2, 0, 3.2].forEach(wz => {
      // Lateral Esquerda
      const leftFrame = new THREE.Mesh(sideFrameGeo, winFrameMat)
      leftFrame.position.set(-towerW / 2 - 0.15, wy, wz)
      building.add(leftFrame)

      const leftWin = new THREE.Mesh(sideWinGeo, windowGlassMat)
      leftWin.position.set(-towerW / 2 - 0.22, wy, wz)
      building.add(leftWin)

      // Lateral Direita
      const rightFrame = new THREE.Mesh(sideFrameGeo, winFrameMat)
      rightFrame.position.set(towerW / 2 + 0.15, wy, wz)
      building.add(rightFrame)

      const rightWin = new THREE.Mesh(sideWinGeo, windowGlassMat)
      rightWin.position.set(towerW / 2 + 0.22, wy, wz)
      building.add(rightWin)
    })
  })

  // 6. LOBBY DO TÉRREO & PÓRTICO DE ENTRADA PRINCIPAL
  const porticoGroup = new THREE.Group()
  const porticoZ = towerD / 2 + 1.8

  // Degraus da entrada
  const step1Geo = new THREE.BoxGeometry(8.4, 0.35, 4.2)
  const step1 = new THREE.Mesh(step1Geo, stepStoneMat)
  step1.position.set(0, 0.35, porticoZ)
  porticoGroup.add(step1)

  const step2Geo = new THREE.BoxGeometry(7.6, 0.35, 3.4)
  const step2 = new THREE.Mesh(step2Geo, stepStoneMat)
  step2.position.set(0, 0.7, porticoZ)
  porticoGroup.add(step2)

  // Vidro do Lobby Térreo (Painéis envidraçados modernos na fachada frontal)
  const lobbyGlassGeo = new THREE.BoxGeometry(10.0, 4.4, 0.3)
  const lobbyGlass = new THREE.Mesh(lobbyGlassGeo, windowGlassMat)
  lobbyGlass.position.set(0, 3.2, towerD / 2 + 0.12)
  building.add(lobbyGlass)

  // Portas duplas de vidro de entrada com moldura escura
  const doorGeo = new THREE.BoxGeometry(4.6, 3.8, 0.4)
  const doorMat = new THREE.MeshStandardMaterial({
    color: 0x0369a1,
    emissive: 0x0284c7,
    emissiveIntensity: 0.8,
    roughness: 0.1,
    metalness: 0.9
  })
  const doors = new THREE.Mesh(doorGeo, doorMat)
  doors.position.set(0, 2.7, towerD / 2 + 0.25)
  porticoGroup.add(doors)

  // Friso central da porta dupla e puxadores
  const doorFrameGeo = new THREE.BoxGeometry(0.25, 3.8, 0.45)
  const doorFrame = new THREE.Mesh(doorFrameGeo, winFrameMat)
  doorFrame.position.set(0, 2.7, towerD / 2 + 0.28)
  porticoGroup.add(doorFrame)

  // Duas colunas cilíndricas brancas sustentando a marquise
  const colGeo = new THREE.CylinderGeometry(0.35, 0.35, 4.6, 16)
  ;[-3.4, 3.4].forEach(cx => {
    const col = new THREE.Mesh(colGeo, winFrameMat)
    col.position.set(cx, 3.0, porticoZ + 1.2)
    porticoGroup.add(col)
  })

  // Marquise / Teto do pórtico com friso LED
  const canopyGeo = new THREE.BoxGeometry(8.2, 0.65, 4.4)
  const canopy = new THREE.Mesh(canopyGeo, winFrameMat)
  canopy.position.set(0, 5.5, porticoZ)
  porticoGroup.add(canopy)

  const canopyLedGeo = new THREE.BoxGeometry(8.0, 0.15, 0.2)
  const canopyLed = new THREE.Mesh(canopyLedGeo, accentEmissiveMat)
  canopyLed.position.set(0, 5.2, porticoZ + 2.25)
  porticoGroup.add(canopyLed)

  building.add(porticoGroup)

  // 7. COBERTURA: PLATIBANDA, ÁTICO / PENTHOUSE E ANTENA
  const roofTopY = towerBaseY + towerH // 32.4

  // Parapeito perimetral do telhado (Platibanda contornando a laje)
  const parapetShape = createRoundedRectShape(towerW + 0.2, towerD + 0.2, 1.45)
  const parapetGeo = new THREE.ExtrudeGeometry(parapetShape, {
    depth: 0.8,
    bevelEnabled: false
  })
  parapetGeo.rotateX(-Math.PI / 2)
  const parapet = new THREE.Mesh(parapetGeo, floorBandMat)
  parapet.position.set(0, roofTopY, 0)
  building.add(parapet)

  // Piso da laje de cobertura (Rooftop ardósia)
  const roofSlabGeo = new THREE.BoxGeometry(towerW - 0.4, 0.2, towerD - 0.4)
  const roofSlab = new THREE.Mesh(roofSlabGeo, floorBandMat)
  roofSlab.position.set(0, roofTopY + 0.1, 0)
  building.add(roofSlab)

  // Penthouse (Casa de máquinas dos elevadores / Ático central)
  const penthouseW = 8.0
  const penthouseH = 3.6
  const penthouseD = 6.4
  const penthouseShape = createRoundedRectShape(penthouseW, penthouseD, 0.8)
  const penthouseGeo = new THREE.ExtrudeGeometry(penthouseShape, {
    depth: penthouseH,
    bevelEnabled: false
  })
  penthouseGeo.rotateX(-Math.PI / 2)
  const penthouse = new THREE.Mesh(penthouseGeo, facadeWallMat)
  penthouse.position.set(0, roofTopY + 0.1, -0.3)
  building.add(penthouse)

  // Tampa superior chanfrada da Penthouse
  const capShape = createRoundedRectShape(penthouseW + 0.4, penthouseD + 0.4, 0.9)
  const capGeo = new THREE.ExtrudeGeometry(capShape, {
    depth: 0.4,
    bevelEnabled: false
  })
  capGeo.rotateX(-Math.PI / 2)
  const cap = new THREE.Mesh(capGeo, floorBandMat)
  cap.position.set(0, roofTopY + 0.1 + penthouseH, -0.3)
  building.add(cap)

  // Emblema Corporativo luminoso no topo da torre (Face frontal da Penthouse)
  const logoGeo = new THREE.BoxGeometry(2.6, 1.8, 0.3)
  const logoMesh = new THREE.Mesh(logoGeo, accentEmissiveMat)
  logoMesh.position.set(0, roofTopY + 0.1 + penthouseH / 2, -0.3 + penthouseD / 2 + 0.15)
  building.add(logoMesh)

  // Mastro da Antena no topo da cobertura
  const mastGeo = new THREE.CylinderGeometry(0.12, 0.18, 4.5, 8)
  const mast = new THREE.Mesh(mastGeo, floorBandMat)
  mast.position.set(0, roofTopY + 0.1 + penthouseH + 0.4 + 2.25, -0.3)
  building.add(mast)

  // Sinalizador luminoso no topo da antena
  const beaconGeo = new THREE.SphereGeometry(0.35, 10, 10)
  const beacon = new THREE.Mesh(beaconGeo, accentEmissiveMat)
  beacon.position.set(0, roofTopY + 0.1 + penthouseH + 0.4 + 4.5, -0.3)
  building.add(beacon)

  // 8. PAISAGISMO CORPORATIVO (ÁRVORES E ARBUSTOS DA PRAÇA)
  ;[-6.2, 6.2].forEach(tx => {
    const treeGroup = new THREE.Group()
    treeGroup.position.set(tx, 0.4, towerD / 2 + 2.4)

    const trunkGeo = new THREE.CylinderGeometry(0.28, 0.36, 2.4, 8)
    const trunk = new THREE.Mesh(trunkGeo, trunkMat)
    trunk.position.y = 1.2
    treeGroup.add(trunk)

    const crownGeo = new THREE.SphereGeometry(1.65, 12, 12)
    const crown = new THREE.Mesh(crownGeo, foliageMat)
    crown.position.y = 2.8
    crown.scale.set(1.0, 1.25, 1.0)
    treeGroup.add(crown)

    building.add(treeGroup)
  })

  // Arbustos verdes arredondados contornando a base do edifício
  const bushGeo = new THREE.SphereGeometry(1.15, 10, 10)
  const bushPositions = [
    // Lado esquerdo
    [-towerW / 2 - 1.2, 0.9, -3.2],
    [-towerW / 2 - 1.2, 0.9, 0.5],
    [-towerW / 2 - 1.2, 0.9, 4.2],
    // Lado direito
    [towerW / 2 + 1.2, 0.9, -3.2],
    [towerW / 2 + 1.2, 0.9, 0.5],
    [towerW / 2 + 1.2, 0.9, 4.2],
    // Fundos
    [-4.2, 0.9, -towerD / 2 - 1.2],
    [0, 0.9, -towerD / 2 - 1.2],
    [4.2, 0.9, -towerD / 2 - 1.2]
  ]

  bushPositions.forEach(([bx, by, bz]) => {
    const bush = new THREE.Mesh(bushGeo, foliageMat)
    bush.position.set(bx, by, bz)
    bush.scale.set(1.1, 0.9, 1.1)
    building.add(bush)
  })

  return building
}

// =============================================================================
// PLACA 3D DO DEPARTAMENTO (TÓTEM EXECUTIVO CHANFRADO COM ALTA VISIBILIDADE)
// =============================================================================
function createSquadFloorPlaque(params: {
  squad: TeamDefinition
  accentColorHex: string
  accentColorNum: number
  agentCount: number
  width?: number
  height?: number
}): THREE.Group {
  const { squad, accentColorHex, accentColorNum, agentCount, width = 36, height = 11 } = params
  const plaqueGroup = new THREE.Group()
  plaqueGroup.userData = { squadId: squad.id, isPlaque: true }

  // Canvas 2D de ultra alta resolução (1024 x 320)
  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = 320
  const ctx = canvas.getContext('2d')
  if (ctx) {
    // 1. Fundo profundo grafite/obsidiana com acabamento acetinado
    const grad = ctx.createLinearGradient(0, 0, 1024, 320)
    grad.addColorStop(0, '#0d131f')
    grad.addColorStop(0.5, '#131b2e')
    grad.addColorStop(1, '#0b101a')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, 1024, 320)

    // Borda perimétrica chanfrada com brilho elegante
    ctx.strokeStyle = '#2d3b55'
    ctx.lineWidth = 8
    ctx.strokeRect(4, 4, 1016, 312)

    // Moldura interna fina
    ctx.strokeStyle = `${accentColorHex}44`
    ctx.lineWidth = 3
    ctx.strokeRect(16, 16, 992, 288)

    // Barra vertical de destaque na cor do departamento
    ctx.fillStyle = accentColorHex
    ctx.fillRect(26, 28, 12, 264)

    // 2. Título do Departamento (Limpo, moderno, caixa alta)
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 50px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    ctx.textBaseline = 'top'
    const cleanName = squad.name || 'Departamento'
    ctx.fillText(cleanName.toUpperCase(), 54, 44, 920)

    // Divisória sutil
    ctx.strokeStyle = '#2d3b55'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(54, 148)
    ctx.lineTo(970, 148)
    ctx.stroke()

    // 3. Subtítulo (Contagem de especialistas)
    ctx.fillStyle = accentColorHex
    ctx.font = '600 32px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace'
    const agentText = `${agentCount} ${agentCount === 1 ? 'ESPECIALISTA CONECTADO' : 'ESPECIALISTAS CONECTADOS'}`
    ctx.fillText(agentText, 54, 172)

    // 4. Status badge (Indicador verde elegante)
    ctx.fillStyle = '#10b981'
    ctx.beginPath()
    ctx.arc(68, 262, 10, 0, Math.PI * 2)
    ctx.fill()

    ctx.fillStyle = '#94a3b8'
    ctx.font = '600 26px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace'
    ctx.fillText('ONLINE & ATIVO', 90, 248)
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.generateMipmaps = false

  // Base Pedestal / Púlpito chanfrado elevado do chão
  const pedestalGeo = new THREE.BoxGeometry(width + 2, 2.4, 7)
  const pedestalMat = new THREE.MeshStandardMaterial({
    color: 0x182030,
    metalness: 0.85,
    roughness: 0.3
  })
  const pedestal = new THREE.Mesh(pedestalGeo, pedestalMat)
  pedestal.position.set(0, 1.2, 0)
  plaqueGroup.add(pedestal)

  // Friso LED inferior na base do pedestal
  const ledGeo = new THREE.BoxGeometry(width + 2.2, 0.3, 0.4)
  const ledMat = new THREE.MeshStandardMaterial({
    color: accentColorNum,
    emissive: accentColorNum,
    emissiveIntensity: 2.8
  })
  const ledMesh = new THREE.Mesh(ledGeo, ledMat)
  ledMesh.position.set(0, 0.3, 3.6)
  plaqueGroup.add(ledMesh)

  // Painel Tilted Display (Inclinado ~36° para a linha de visão da câmera)
  const panelGroup = new THREE.Group()
  panelGroup.position.set(0, 2.0, 0)
  panelGroup.rotation.x = -Math.PI / 5

  // Moldura chanfrada traseira da placa
  const frameGeo = new THREE.BoxGeometry(width, height, 1.0)
  const frameMat = new THREE.MeshStandardMaterial({
    color: 0x1c2436,
    metalness: 0.9,
    roughness: 0.25
  })
  const frameMesh = new THREE.Mesh(frameGeo, frameMat)
  panelGroup.add(frameMesh)

  // Face frontal com a textura do canvas em MeshBasicMaterial (Zero reflexo branco)
  const faceGeo = new THREE.PlaneGeometry(width - 0.4, height - 0.4)
  const faceMat = new THREE.MeshBasicMaterial({
    map: texture
  })
  const faceMesh = new THREE.Mesh(faceGeo, faceMat)
  faceMesh.position.z = 0.52
  panelGroup.add(faceMesh)

  plaqueGroup.add(panelGroup)

  // Propagar userData para clique e raycasting 100% responsivo
  plaqueGroup.traverse(child => {
    child.userData = { squadId: squad.id, isPlaque: true }
  })

  return plaqueGroup
}

// =============================================================================
// AVATAR 3D ESTILIZADO ROBLOX (MAIS CURVAS, DETALHES, R15 E ALTA VISIBILIDADE)
// =============================================================================
function createRobloxAgentFigure(params: {
  agent: AgentProfileVersion
  isConnected: boolean
  accentColorNum: number
  agentIndex?: number
}): THREE.Group {
  const { isConnected, accentColorNum, agentIndex = 0 } = params
  const figure = new THREE.Group()
  figure.position.set(-1.0, 0, 5.8)

  const theme = PYRITE_3D.outfitTones[agentIndex % PYRITE_3D.outfitTones.length]
  const skinColor = PYRITE_3D.skinTones[agentIndex % PYRITE_3D.skinTones.length]
  const hairColor = PYRITE_3D.hairTones[agentIndex % PYRITE_3D.hairTones.length]

  // Materiais refinados de alto contraste
  const topMat = new THREE.MeshStandardMaterial({
    color: isConnected ? theme.top : 0x334155,
    roughness: 0.45,
    metalness: 0.15
  })
  const pantsMat = new THREE.MeshStandardMaterial({
    color: isConnected ? theme.pants : 0x1e293b,
    roughness: 0.65
  })
  const skinMat = new THREE.MeshStandardMaterial({
    color: skinColor,
    roughness: 0.38
  })
  const hairMat = new THREE.MeshStandardMaterial({
    color: hairColor,
    roughness: 0.8
  })
  const shoeMat = new THREE.MeshStandardMaterial({
    color: theme.shoes,
    roughness: 0.3
  })
  const shoeSoleMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.2
  })
  const accentMat = new THREE.MeshStandardMaterial({
    color: theme.accent,
    emissive: isConnected ? theme.accent : 0x000000,
    emissiveIntensity: isConnected ? 1.5 : 0
  })

  // 1. QUADRIL & PERNAS (Postura sentada ergonômica Roblox)
  const pelvisGeo = new THREE.BoxGeometry(4.8, 1.6, 3.4)
  const pelvis = new THREE.Mesh(pelvisGeo, pantsMat)
  pelvis.position.set(0, 4.6, 0.2)
  figure.add(pelvis)

  // Coxas (estendidas horizontalmente para frente sobre a cadeira)
  const thighGeo = new THREE.CylinderGeometry(1.0, 1.0, 4.4, 12)
  thighGeo.rotateX(Math.PI / 2)
  ;[-1.4, 1.4].forEach(legX => {
    const thigh = new THREE.Mesh(thighGeo, pantsMat)
    thigh.position.set(legX, 4.6, -1.8)
    figure.add(thigh)
  })

  // Joelhos arredondados
  const kneeGeo = new THREE.SphereGeometry(1.05, 10, 10)
  ;[-1.4, 1.4].forEach(kneeX => {
    const knee = new THREE.Mesh(kneeGeo, pantsMat)
    knee.position.set(kneeX, 4.6, -4.0)
    figure.add(knee)
  })

  // Canelas (descendo verticalmente em direção ao chão)
  const shinGeo = new THREE.CylinderGeometry(0.95, 0.9, 3.6, 12)
  ;[-1.4, 1.4].forEach(shinX => {
    const shin = new THREE.Mesh(shinGeo, pantsMat)
    shin.position.set(shinX, 2.7, -4.0)
    figure.add(shin)
  })

  // Tênis estilizados Roblox (Sneakers com solado de borracha branco)
  const soleGeo = new THREE.BoxGeometry(1.9, 0.45, 3.2)
  const shoeBodyGeo = new THREE.BoxGeometry(1.8, 0.9, 3.0)
  ;[-1.4, 1.4].forEach(footX => {
    const sole = new THREE.Mesh(soleGeo, shoeSoleMat)
    sole.position.set(footX, 0.4, -4.4)
    figure.add(sole)

    const shoeBody = new THREE.Mesh(shoeBodyGeo, shoeMat)
    shoeBody.position.set(footX, 1.0, -4.4)
    figure.add(shoeBody)
  })

  // 2. TORSO ROBLOX (Com curvas, gola e crachá corporativo lanyard)
  const upperTorsoGeo = new THREE.BoxGeometry(5.4, 4.2, 3.6)
  const upperTorso = new THREE.Mesh(upperTorsoGeo, topMat)
  upperTorso.position.set(0, 7.5, 0.2)
  figure.add(upperTorso)

  // Gola / Detalhe no peito
  const collarGeo = new THREE.BoxGeometry(2.4, 0.4, 0.3)
  const collar = new THREE.Mesh(collarGeo, accentMat)
  collar.position.set(0, 9.4, -1.65)
  figure.add(collar)

  // Crachá corporativo pendurado
  const lanyardGeo = new THREE.BoxGeometry(1.2, 1.6, 0.15)
  const badgeMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: accentColorNum,
    emissiveIntensity: 0.4
  })
  const badge = new THREE.Mesh(lanyardGeo, badgeMat)
  badge.position.set(0, 7.2, -1.7)
  figure.add(badge)

  // 3. BRAÇOS E MÃOS (Postura de digitação no teclado da mesa)
  // Ombros arredondados
  const shoulderGeo = new THREE.SphereGeometry(1.0, 10, 10)
  ;[-3.1, 3.1].forEach(sx => {
    const shoulder = new THREE.Mesh(shoulderGeo, topMat)
    shoulder.position.set(sx, 9.0, 0.2)
    figure.add(shoulder)
  })

  // Braços superiores (inclinando suavemente para a frente e para baixo)
  const upperArmGeo = new THREE.CylinderGeometry(0.85, 0.8, 3.2, 10)
  ;[-2.8, 2.8].forEach((armX, i) => {
    const upperArm = new THREE.Mesh(upperArmGeo, topMat)
    upperArm.position.set(armX, 7.6, -0.9)
    upperArm.rotation.x = 0.55
    upperArm.rotation.z = (i === 0 ? 1 : -1) * 0.15
    figure.add(upperArm)
  })

  // Cotovelos
  const elbowGeo = new THREE.SphereGeometry(0.85, 8, 8)
  ;[-2.5, 2.5].forEach(ex => {
    const elbow = new THREE.Mesh(elbowGeo, topMat)
    elbow.position.set(ex, 6.4, -2.1)
    figure.add(elbow)
  })

  // Antebraços (estendidos em direção ao teclado da mesa)
  const forearmGeo = new THREE.CylinderGeometry(0.8, 0.75, 3.4, 10)
  forearmGeo.rotateX(Math.PI / 2)
  ;[-2.0, 2.0].forEach((faX, i) => {
    const forearm = new THREE.Mesh(forearmGeo, topMat)
    forearm.position.set(faX, 6.8, -3.7)
    forearm.rotation.y = (i === 0 ? 1 : -1) * 0.2
    figure.add(forearm)
  })

  // Mãos arredondadas Roblox (apoiadas no teclado/mouse)
  const handGeo = new THREE.SphereGeometry(0.75, 10, 10)
  ;[-1.6, 1.8].forEach(hx => {
    const hand = new THREE.Mesh(handGeo, skinMat)
    hand.position.set(hx, 6.9, -5.3)
    figure.add(hand)
  })

  // 4. CABEÇA ROBLOX COM CURVAS E DETALHES
  // Cabeça (Cilindro com topo e base suavizados)
  const headGeo = new THREE.CylinderGeometry(1.8, 1.8, 2.8, 20)
  const head = new THREE.Mesh(headGeo, skinMat)
  head.position.set(0, 11.5, 0.2)
  figure.add(head)

  // Topo arredondado da cabeça
  const headCapGeo = new THREE.SphereGeometry(1.8, 16, 12)
  const headTopCap = new THREE.Mesh(headCapGeo, skinMat)
  headTopCap.position.set(0, 12.8, 0.2)
  headTopCap.scale.set(1, 0.35, 1)
  figure.add(headTopCap)

  // Cabelo esculpido com volume estilizado
  const hairCapGeo = new THREE.SphereGeometry(2.05, 16, 14)
  const hair = new THREE.Mesh(hairCapGeo, hairMat)
  hair.position.set(0, 12.5, 0.4)
  hair.scale.set(1.05, 0.85, 1.05)
  figure.add(hair)

  // Franja frontal estilizada
  const fringeGeo = new THREE.BoxGeometry(2.4, 0.8, 0.8)
  const fringe = new THREE.Mesh(fringeGeo, hairMat)
  fringe.position.set(0, 12.6, -1.35)
  fringe.rotation.x = -0.2
  figure.add(fringe)

  // Fone Gamer / Studio Headset de alta fidelidade
  const headsetArchGeo = new THREE.TorusGeometry(2.1, 0.24, 8, 24)
  const headsetArchMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    metalness: 0.8,
    roughness: 0.2
  })
  const headsetArch = new THREE.Mesh(headsetArchGeo, headsetArchMat)
  headsetArch.rotation.z = Math.PI / 2
  headsetArch.position.set(0, 12.5, 0.2)
  figure.add(headsetArch)

  // Conchas auriculares do fone com anel LED luminoso nas laterais
  const earCupGeo = new THREE.CylinderGeometry(0.85, 0.85, 0.6, 16)
  earCupGeo.rotateZ(Math.PI / 2)
  const earCupMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.4, metalness: 0.7 })

  const ledRingGeo = new THREE.TorusGeometry(0.7, 0.12, 8, 16)
  ledRingGeo.rotateY(Math.PI / 2)
  const ledRingMat = new THREE.MeshStandardMaterial({
    color: isConnected ? accentColorNum : 0x64748b,
    emissive: isConnected ? accentColorNum : 0x000000,
    emissiveIntensity: isConnected ? 2.5 : 0
  })

  ;[-2.1, 2.1].forEach((cupX, i) => {
    const earCup = new THREE.Mesh(earCupGeo, earCupMat)
    earCup.position.set(cupX, 11.8, 0.2)
    figure.add(earCup)

    const ledRing = new THREE.Mesh(ledRingGeo, ledRingMat)
    ledRing.position.set(cupX + (i === 0 ? -0.32 : 0.32), 11.8, 0.2)
    figure.add(ledRing)
  })

  // Óculos / Visor Tech futurista
  const visorFrameGeo = new THREE.BoxGeometry(3.0, 0.8, 0.5)
  const visorMat = new THREE.MeshStandardMaterial({
    color: isConnected ? accentColorNum : 0x475569,
    emissive: isConnected ? accentColorNum : 0x000000,
    emissiveIntensity: isConnected ? 2.0 : 0,
    roughness: 0.1,
    metalness: 0.9,
    transparent: true,
    opacity: 0.85
  })
  const visor = new THREE.Mesh(visorFrameGeo, visorMat)
  visor.position.set(0, 11.8, -1.6)
  figure.add(visor)

  return figure
}

// =============================================================================
// CONSTRUTOR DE ESTAÇÃO DE TRABALHO DETALHADA (COM AGENTE ROBLOX E ALTO CONTRASTE)
// =============================================================================
function createWorkstationMesh(params: {
  agent: AgentProfileVersion
  squadId: string
  isConnected: boolean
  x: number
  z: number
  facingAngle?: number
  accentColorNum: number
  agentIndex?: number
}): THREE.Group {
  const { agent, squadId, isConnected, x, z, facingAngle = 0, accentColorNum, agentIndex = 0 } = params

  const group = new THREE.Group()
  group.position.set(x, 0, z)
  group.rotation.y = facingAngle
  group.userData = { agentId: agent.id, squadId }

  const deskTopWidth = 22
  const deskTopDepth = 13
  const deskTopHeight = 1.2
  const deskElevation = 7.2

  // 1. Tampo da Mesa (Madeira birch clara de alto contraste)
  const deskGeo = new THREE.BoxGeometry(deskTopWidth, deskTopHeight, deskTopDepth)
  const deskMat = new THREE.MeshStandardMaterial({
    color: PYRITE_3D.deskWood,
    roughness: 0.32,
    metalness: 0.12
  })
  const deskTop = new THREE.Mesh(deskGeo, deskMat)
  deskTop.position.y = deskElevation
  group.add(deskTop)

  // Painel lateral estrutural esquerdo
  const leftPanelGeo = new THREE.BoxGeometry(0.9, deskElevation - deskTopHeight / 2, deskTopDepth - 0.8)
  const legMat = new THREE.MeshStandardMaterial({ color: PYRITE_3D.deskLegDark, roughness: 0.6 })
  const leftPanel = new THREE.Mesh(leftPanelGeo, legMat)
  leftPanel.position.set(-deskTopWidth / 2 + 0.5, (deskElevation - deskTopHeight / 2) / 2, 0)
  group.add(leftPanel)

  // Gaveteiro sob a mesa à direita com 3 gavetas e puxadores cromados
  const cabinetWidth = 5.5
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

  const handleGeo = new THREE.BoxGeometry(2.2, 0.22, 0.35)
  const handleMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.95, roughness: 0.15 })
  ;[-1.4, 0.2, 1.8].forEach(yOff => {
    const handle = new THREE.Mesh(handleGeo, handleMat)
    handle.position.set(deskTopWidth / 2 - cabinetWidth / 2 - 0.4, cabinetHeight / 2 + yOff, cabinetDepth / 2 + 0.18)
    group.add(handle)
  })

  // Divisória acústica traseira entre mesas opostas
  const dividerGeo = new THREE.BoxGeometry(deskTopWidth, 5.2, 0.8)
  const dividerMat = new THREE.MeshStandardMaterial({
    color: PYRITE_3D.platformTrim,
    roughness: 0.8
  })
  const divider = new THREE.Mesh(dividerGeo, dividerMat)
  divider.position.set(0, deskElevation + 2.6, -deskTopDepth / 2 + 0.4)
  group.add(divider)

  // Friso superior da divisória
  const dividerTrimGeo = new THREE.BoxGeometry(deskTopWidth + 0.2, 0.3, 0.9)
  const dividerTrimMat = new THREE.MeshStandardMaterial({ color: 0x52525b, metalness: 0.85, roughness: 0.3 })
  const dividerTrim = new THREE.Mesh(dividerTrimGeo, dividerTrimMat)
  dividerTrim.position.set(0, deskElevation + 5.2, -deskTopDepth / 2 + 0.4)
  group.add(dividerTrim)

  // Gabinete PC sob a mesa
  const pcGeo = new THREE.BoxGeometry(2.8, 5.4, 8.0)
  const pcMat = new THREE.MeshStandardMaterial({ color: PYRITE_3D.platformNavy, roughness: 0.5, metalness: 0.7 })
  const pcTower = new THREE.Mesh(pcGeo, pcMat)
  pcTower.position.set(deskTopWidth / 2 - cabinetWidth - 1.8, 2.7, 0.5)
  group.add(pcTower)

  // LED de status no gabinete PC (Verde ativo / Cinza desligado)
  const pcLedGeo = new THREE.BoxGeometry(0.25, 0.7, 0.2)
  const pcLedMat = new THREE.MeshStandardMaterial({
    color: isConnected ? PYRITE_3D.statusOnline : PYRITE_3D.statusOffline,
    emissive: isConnected ? PYRITE_3D.statusOnline : 0x000000,
    emissiveIntensity: isConnected ? 2.5 : 0
  })
  const pcLed = new THREE.Mesh(pcLedGeo, pcLedMat)
  pcLed.position.set(deskTopWidth / 2 - cabinetWidth - 1.8, 4.8, 4.5)
  group.add(pcLed)

  // Mousepad, teclado e mouse
  const padGeo = new THREE.BoxGeometry(13, 0.12, 8.0)
  const padMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.9 })
  const pad = new THREE.Mesh(padGeo, padMat)
  pad.position.set(-1.0, deskElevation + 0.65, 0.5)
  group.add(pad)

  const kbGeo = new THREE.BoxGeometry(8.0, 0.28, 3.0)
  const kbMat = new THREE.MeshStandardMaterial({ color: 0x09090b, roughness: 0.7 })
  const kb = new THREE.Mesh(kbGeo, kbMat)
  kb.position.set(-1.0, deskElevation + 0.78, 1.4)
  group.add(kb)

  const mouseGeo = new THREE.BoxGeometry(1.1, 0.32, 1.6)
  const mouseMat = new THREE.MeshStandardMaterial({ color: 0x27272a, roughness: 0.5 })
  const mouse = new THREE.Mesh(mouseGeo, mouseMat)
  mouse.position.set(4.2, deskElevation + 0.78, 1.4)
  group.add(mouse)

  // Caneca de café
  const mugGeo = new THREE.CylinderGeometry(0.65, 0.55, 1.3, 10)
  const mugMat = new THREE.MeshStandardMaterial({ color: 0xf4f4f5, roughness: 0.2 })
  const mug = new THREE.Mesh(mugGeo, mugMat)
  mug.position.set(-8.0, deskElevation + 1.2, -2.2)
  group.add(mug)

  // 2. Monitores Duplos Angulados
  const monWidth = 7.4
  const monHeight = 4.8
  const monDepth = 0.5
  const monElevation = deskElevation + 4.0
  const monZ = -deskTopDepth / 2 + 2.0

  const armPoleGeo = new THREE.CylinderGeometry(0.4, 0.4, 4.2, 8)
  const armPoleMat = new THREE.MeshStandardMaterial({ color: 0x71717a, metalness: 0.9 })
  const armPole = new THREE.Mesh(armPoleGeo, armPoleMat)
  armPole.position.set(0, deskElevation + 2.1, monZ - 0.5)
  group.add(armPole)

  const monChassisGeo = new THREE.BoxGeometry(monWidth, monHeight, monDepth)
  const monChassisMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.6, metalness: 0.6 })
  const screenGeo = new THREE.PlaneGeometry(monWidth - 0.5, monHeight - 0.5)

  // Telas: se conectado, telas luminosas na cor de destaque; se desconectado, apagadas
  const leftScreenMat = new THREE.MeshStandardMaterial({
    color: isConnected ? accentColorNum : PYRITE_3D.screenOffline,
    emissive: isConnected ? accentColorNum : 0x000000,
    emissiveIntensity: isConnected ? 2.2 : 0,
    roughness: isConnected ? 0.2 : 0.8
  })
  const rightScreenMat = new THREE.MeshStandardMaterial({
    color: isConnected ? 0x38bdf8 : PYRITE_3D.screenOffline,
    emissive: isConnected ? 0x38bdf8 : 0x000000,
    emissiveIntensity: isConnected ? 1.8 : 0,
    roughness: isConnected ? 0.2 : 0.8
  })

  // Monitor Esquerdo
  const leftMon = new THREE.Mesh(monChassisGeo, monChassisMat)
  leftMon.position.set(-3.9, monElevation, monZ)
  leftMon.rotation.y = 0.22
  const leftScreen = new THREE.Mesh(screenGeo, leftScreenMat)
  leftScreen.position.z = monDepth / 2 + 0.05
  leftMon.add(leftScreen)
  group.add(leftMon)

  // Monitor Direito
  const rightMon = new THREE.Mesh(monChassisGeo, monChassisMat)
  rightMon.position.set(3.9, monElevation, monZ)
  rightMon.rotation.y = -0.22
  const rightScreen = new THREE.Mesh(screenGeo, rightScreenMat)
  rightScreen.position.z = monDepth / 2 + 0.05
  rightMon.add(rightScreen)
  group.add(rightMon)

  // Fita de LED na borda da mesa indicando status do agente
  const deskLedGeo = new THREE.BoxGeometry(deskTopWidth, 0.3, 0.3)
  const deskLedMat = new THREE.MeshStandardMaterial({
    color: isConnected ? PYRITE_3D.statusOnline : PYRITE_3D.statusOffline,
    emissive: isConnected ? PYRITE_3D.statusOnline : 0x000000,
    emissiveIntensity: isConnected ? 2.5 : 0
  })
  const deskLed = new THREE.Mesh(deskLedGeo, deskLedMat)
  deskLed.position.set(0, deskElevation - 0.45, deskTopDepth / 2 + 0.12)
  group.add(deskLed)

  // 3. Cadeira Ergonômica de Escritório
  const chairGroup = new THREE.Group()
  chairGroup.position.set(-1.0, 0, 5.8)

  const starHubGeo = new THREE.CylinderGeometry(0.65, 0.65, 0.5, 8)
  const starHubMat = new THREE.MeshStandardMaterial({ color: PYRITE_3D.chairChrome, metalness: 0.9 })
  const starHub = new THREE.Mesh(starHubGeo, starHubMat)
  starHub.position.y = 0.45
  chairGroup.add(starHub)

  for (let i = 0; i < 5; i++) {
    const ang = (i / 5) * Math.PI * 2
    const spokeGeo = new THREE.CylinderGeometry(0.18, 0.18, 3.0, 6)
    const spoke = new THREE.Mesh(spokeGeo, starHubMat)
    spoke.position.set(Math.cos(ang) * 1.5, 0.35, Math.sin(ang) * 1.5)
    spoke.rotation.z = Math.PI / 2
    spoke.rotation.y = -ang
    chairGroup.add(spoke)
  }

  const pistonGeo = new THREE.CylinderGeometry(0.45, 0.45, 3.8, 8)
  const piston = new THREE.Mesh(pistonGeo, starHubMat)
  piston.position.y = 2.2
  chairGroup.add(piston)

  const seatGeo = new THREE.BoxGeometry(8.0, 1.3, 7.5)
  const seatMat = new THREE.MeshStandardMaterial({ color: PYRITE_3D.chairMesh, roughness: 0.85 })
  const seat = new THREE.Mesh(seatGeo, seatMat)
  seat.position.y = 4.5
  chairGroup.add(seat)

  const backGeo = new THREE.BoxGeometry(7.5, 9.0, 1.3)
  const back = new THREE.Mesh(backGeo, seatMat)
  back.position.set(0, 9.2, 3.2)
  back.rotation.x = 0.08
  chairGroup.add(back)

  const armGeo = new THREE.BoxGeometry(0.75, 3.0, 4.2)
  const leftArmRest = new THREE.Mesh(armGeo, starHubMat)
  leftArmRest.position.set(-3.9, 6.2, 0.7)
  chairGroup.add(leftArmRest)
  const rightArmRest = new THREE.Mesh(armGeo, starHubMat)
  rightArmRest.position.set(3.9, 6.2, 0.7)
  chairGroup.add(rightArmRest)

  group.add(chairGroup)

  // 4. PERSONAGEM ROBLOX R15 COM CURVAS, DETALHE E ALTO CONTRASTE
  const agentFigure = createRobloxAgentFigure({
    agent,
    isConnected,
    accentColorNum,
    agentIndex
  })
  group.add(agentFigure)

  // Hitbox invisível com detecção precisa de clique e raycasting
  const hitGeo = new THREE.BoxGeometry(deskTopWidth + 4, 18, deskTopDepth + 12)
  const hitMat = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0,
    depthWrite: false
  })
  const hitMesh = new THREE.Mesh(hitGeo, hitMat)
  hitMesh.position.set(0, 9, 2)
  hitMesh.userData = { agentId: agent.id, squadId }
  group.add(hitMesh)

  // Propagar userData para todos os elementos filhos garantindo clique 100% responsivo
  group.traverse(child => {
    child.userData = { agentId: agent.id, squadId }
  })

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

  // Sincronizar estado de fullscreen nativo
  useEffect(() => {
    const handleFSChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement))
    }
    document.addEventListener('fullscreenchange', handleFSChange)
    return () => document.removeEventListener('fullscreenchange', handleFSChange)
  }, [])

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
  const savedCameraPosRef = useRef<THREE.Vector3>(new THREE.Vector3(0, 240, 380))
  const savedTargetRef = useRef<THREE.Vector3>(new THREE.Vector3(0, 0, 0))
  const isCameraInitializedRef = useRef<boolean>(false)

  // Assinaturas para evitar recriação desnecessária da cena 3D por re-renders externos
  const squadsSignature = useMemo(() => {
    return squads.map(s => `${s.id}_${s.name}_${s.coordinatorAgentId}_${(s.pipeline || []).length}_${(s.nodes || []).length}`).join(';')
  }, [squads])

  const agentsSignature = useMemo(() => {
    return agents.map(a => `${a.id}_${a.name}_${a.state}`).join(';')
  }, [agents])

  const allWorkstationsRef = useRef<THREE.Object3D[]>([])
  const deskMeshesRef = useRef<Map<string, THREE.Object3D>>(new Map())
  const plaqueMeshesRef = useRef<Map<string, THREE.Object3D>>(new Map())
  const pulseStreamsRef = useRef<{
    lead: THREE.Mesh
    trail: THREE.Mesh[]
    curve: THREE.CatmullRomCurve3
    speed: number
    progress: number
    dockRing: THREE.Mesh
  }[]>([])

  const selectedAgent = useMemo(() => {
    if (!selectedAgentId) return null
    return agents.find(a => a.id === selectedAgentId) || null
  }, [agents, selectedAgentId])

  const selectedAgentCurrentSquad = useMemo(() => {
    if (!selectedAgentId) return null
    return (
      squads.find(sq =>
        sq.coordinatorAgentId === selectedAgentId ||
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
  // MINI TURNTABLE 3D NO DRAWER PARA O AGENTE SELECIONADO
  // =========================================================================
  useEffect(() => {
    const canvas = turntableCanvasRef.current
    if (!canvas || !selectedAgent) return

    const ttWidth = canvas.clientWidth || 300
    const ttHeight = canvas.clientHeight || 150

    const ttScene = new THREE.Scene()
    ttScene.background = new THREE.Color(0x131924)

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

    const ttAmbient = new THREE.AmbientLight(0xffffff, 2.0)
    ttScene.add(ttAmbient)

    const ttDirLight = new THREE.DirectionalLight(0xffffff, 2.2)
    ttDirLight.position.set(20, 35, 25)
    ttScene.add(ttDirLight)

    const ttGroup = new THREE.Group()

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
      emissiveIntensity: 2.2
    })
    const ring = new THREE.Mesh(ringGeo, ringMat)
    ring.rotation.x = Math.PI / 2
    ring.position.y = 1.6
    ttGroup.add(ring)

    // Estação do agente detalhada na base giratória com Roblox Avatar
    const isConn = selectedAgent.state !== 'paused'
    const miniStation = createWorkstationMesh({
      agent: selectedAgent,
      squadId: selectedAgentCurrentSquad?.id || '',
      isConnected: isConn,
      x: 0,
      z: -2,
      facingAngle: 0,
      accentColorNum: dynamicAccent.num,
      agentIndex: 0
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
  // MONTAGEM DO CENÁRIO PRINCIPAL THREE.JS (MODULAR PODS, CONDUÍTES E ALTO CONTRASTE)
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
    if (isCameraInitializedRef.current) {
      camera.position.copy(savedCameraPosRef.current)
    } else {
      camera.position.set(0, 240, 380)
    }
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
    controls.screenSpacePanning = true
    controls.maxPolarAngle = Math.PI / 2 - 0.04
    controls.minDistance = 90
    controls.maxDistance = 1100
    if (isCameraInitializedRef.current) {
      controls.target.copy(savedTargetRef.current)
    } else {
      controls.target.set(0, 0, 0)
      isCameraInitializedRef.current = true
    }
    controls.mouseButtons = {
      LEFT: THREE.MOUSE.PAN,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.ROTATE
    }
    controls.update()
    controlsRef.current = controls

    // 3. Iluminação Pyrite (Luminosa, nítida e rica em contraste arquitetônico)
    const ambientLight = new THREE.AmbientLight(0xffffff, 2.2)
    scene.add(ambientLight)

    const dirLight = new THREE.DirectionalLight(0xffffff, 2.4)
    dirLight.position.set(160, 320, 200)
    scene.add(dirLight)

    const fillLight = new THREE.DirectionalLight(0x93c5fd, 1.2)
    fillLight.position.set(-160, 200, -180)
    scene.add(fillLight)

    const vaultPointLight = new THREE.PointLight(dynamicAccent.num, 3.8, 500)
    vaultPointLight.position.set(0, 52, 0)
    scene.add(vaultPointLight)

    // 4. Piso Industrial com Grid Pyrite Elegante
    const floorSize = 1800
    const gridHelper = new THREE.GridHelper(floorSize, 50, dynamicAccent.num, 0x2a354a)
    gridHelper.position.y = -0.5
    // @ts-ignore
    gridHelper.material.opacity = 0.28
    // @ts-ignore
    gridHelper.material.transparent = true
    scene.add(gridHelper)

    // =======================================================================
    // 5. CENTRO: O COFRE CORPORATIVO (PEDESTAL CIRCULAR + PRÉDIO CORPORATIVO HQ)
    // =======================================================================
    const hubGroup = new THREE.Group()
    hubGroup.position.set(0, 0, 0)

    const hubRadius = 26
    const baseCylGeo = new THREE.CylinderGeometry(hubRadius, hubRadius + 3, 5, 48)
    const baseCylMat = new THREE.MeshStandardMaterial({
      color: 0x242a38,
      roughness: 0.35,
      metalness: 0.85
    })
    const baseCyl = new THREE.Mesh(baseCylGeo, baseCylMat)
    baseCyl.position.y = 2.5
    hubGroup.add(baseCyl)

    // Anel perimetral luminoso na cor de destaque selecionada
    const goldRingGeo = new THREE.TorusGeometry(hubRadius - 0.5, 0.9, 12, 48)
    const goldRingMat = new THREE.MeshStandardMaterial({
      color: dynamicAccent.num,
      emissive: dynamicAccent.num,
      emissiveIntensity: 2.8,
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
      color: 0x333c4f,
      roughness: 0.35,
      metalness: 0.88
    })
    const topPlate = new THREE.Mesh(topPlateGeo, topPlateMat)
    topPlate.position.y = 6.0
    hubGroup.add(topPlate)

    // Núcleo circular embutido da praça
    const coreDiscGeo = new THREE.CylinderGeometry(hubRadius - 5, hubRadius - 5, 0.6, 36)
    const coreDiscMat = new THREE.MeshStandardMaterial({
      color: 0x222a3a,
      roughness: 0.25,
      metalness: 0.9
    })
    const coreDisc = new THREE.Mesh(coreDiscGeo, coreDiscMat)
    coreDisc.position.y = 7.3
    hubGroup.add(coreDisc)

    const coreRingGeo = new THREE.TorusGeometry(hubRadius - 6, 0.45, 10, 36)
    const coreRingMat = new THREE.MeshStandardMaterial({
      color: dynamicAccent.num,
      emissive: dynamicAccent.num,
      emissiveIntensity: 2.0
    })
    const coreRing = new THREE.Mesh(coreRingGeo, coreRingMat)
    coreRing.rotation.x = Math.PI / 2
    coreRing.position.y = 7.6
    hubGroup.add(coreRing)

    // PREDIOZINHO CORPORATIVO NO CENTRO (MINIATURA DA CORPORAÇÃO VISÍVEL E DETALHADA)
    const hqBuilding = createCorporateHQBuilding(dynamicAccent.num)
    hqBuilding.position.y = 7.6
    hubGroup.add(hqBuilding)

    scene.add(hubGroup)

    // =======================================================================
    // 6. PLATAFORMAS DOS DEPARTAMENTOS (BASE ÚNICA SEM DUPLICAÇÃO + ESPAÇAMENTO REAL)
    // =======================================================================
    const totalSquads = squads.length
    deskMeshesRef.current.clear()
    plaqueMeshesRef.current.clear()
    allWorkstationsRef.current = []
    pulseStreamsRef.current = []

    // Coordenadas das plataformas (distribuição harmoniosa no mapa 3D)
    const computeSquadCoords = (idx: number, total: number) => {
      if (total === 1) return { x: 0, z: -175 }
      if (total === 2) {
        return idx === 0 ? { x: -180, z: -60 } : { x: 180, z: -60 }
      }
      if (total === 3) {
        if (idx === 0) return { x: -185, z: -65 }
        if (idx === 1) return { x: 185, z: -65 }
        return { x: 0, z: 165 }
      }
      if (total === 4) {
        if (idx === 0) return { x: -190, z: -75 }
        if (idx === 1) return { x: 190, z: -75 }
        if (idx === 2) return { x: -190, z: 100 }
        return { x: 190, z: 100 }
      }
      const angle = (idx / total) * Math.PI * 2 - Math.PI / 2
      return {
        x: Math.round(Math.cos(angle) * 235),
        z: Math.round(Math.sin(angle) * 165)
      }
    }

    squads.forEach((sq, sIdx) => {
      const { x: sqX, z: sqZ } = computeSquadCoords(sIdx, totalSquads)

      // Coletar todos os agentes únicos pertencentes a este departamento
      const agentMap = new Map<string, { agent: AgentProfileVersion; isConnected: boolean; role: string }>()

      if (sq.coordinatorAgentId) {
        const ag = agents.find(a => a.id === sq.coordinatorAgentId)
        if (ag) {
          agentMap.set(ag.id, {
            agent: ag,
            isConnected: ag.state !== 'paused',
            role: 'Coordenador'
          })
        }
      }

      ;(sq.pipeline || []).forEach(step => {
        const ag = agents.find(a => a.id === step.agentId)
        if (ag) {
          agentMap.set(ag.id, {
            agent: ag,
            isConnected: step.enabled !== false && ag.state !== 'paused',
            role: step.roleInSquad || ag.roleDescription || 'Especialista'
          })
        }
      })

      ;(sq.nodes || []).forEach(n => {
        if (n.agentId && !agentMap.has(n.agentId)) {
          const ag = agents.find(a => a.id === n.agentId)
          if (ag) {
            agentMap.set(ag.id, {
              agent: ag,
              isConnected: ag.state !== 'paused',
              role: (n as any).roleInSquad || n.roleInTeam || ag.roleDescription || 'Especialista'
            })
          }
        }
      })

      const squadAgents = Array.from(agentMap.values())

      const platformGroup = new THREE.Group()
      platformGroup.position.set(sqX, 0, sqZ)

      const agentCount = squadAgents.length
      const cols = agentCount > 4 ? 3 : agentCount > 2 ? 2 : Math.max(1, agentCount)
      const rows = agentCount > 1 ? 2 : 1

      // Dimensões da plataforma com espaçamento generoso para evitar colisões entre personagens
      const deskPitchX = 30
      const deskPitchZ = 34
      const marginX = 14
      const marginZ = 12

      const platWidth = Math.max(84, cols * deskPitchX + marginX * 2)
      const platDepth = Math.max(66, rows * deskPitchZ + marginZ * 2)
      const platHeight = 4.8

      // BASE ÚNICA DA PLATAFORMA (SEM DUPLICAÇÃO DE BASES: UM ÚNICO CORPO ELEGANTE)
      const podShape = createRoundedRectShape(platWidth, platDepth, 8)
      const podGeo = new THREE.ExtrudeGeometry(podShape, {
        depth: platHeight,
        bevelEnabled: true,
        bevelSegments: 3,
        steps: 1,
        bevelSize: 1.4,
        bevelThickness: 1.4
      })
      podGeo.rotateX(Math.PI / 2)
      const podMat = new THREE.MeshStandardMaterial({
        color: PYRITE_3D.platformSteel,
        roughness: 0.32,
        metalness: 0.82
      })
      const podMesh = new THREE.Mesh(podGeo, podMat)
      podMesh.position.y = platHeight / 2 + 0.6
      platformGroup.add(podMesh)

      // Friso metálico superior chanfrado
      const trimGeo = new THREE.BoxGeometry(platWidth + 0.8, 0.2, platDepth + 0.8)
      const trimMat = new THREE.MeshStandardMaterial({
        color: PYRITE_3D.platformTrim,
        metalness: 0.9,
        roughness: 0.2
      })
      const trimMesh = new THREE.Mesh(trimGeo, trimMat)
      trimMesh.position.y = platHeight + 0.7
      platformGroup.add(trimMesh)

      // Underglow LED na base inferior da plataforma
      const glowGeo = new THREE.BoxGeometry(platWidth - 2, 0.35, platDepth - 2)
      const glowMat = new THREE.MeshStandardMaterial({
        color: dynamicAccent.num,
        emissive: dynamicAccent.num,
        emissiveIntensity: 2.2
      })
      const glowMesh = new THREE.Mesh(glowGeo, glowMat)
      glowMesh.position.y = 0.35
      platformGroup.add(glowMesh)

      // PLACA 3D COM O NOME DO DEPARTAMENTO ELEVADA E INCLINADA PARA A CÂMERA
      const squadPlaque = createSquadFloorPlaque({
        squad: sq,
        accentColorHex: dynamicAccent.hex,
        accentColorNum: dynamicAccent.num,
        agentCount: squadAgents.length,
        width: 36,
        height: 10
      })
      squadPlaque.position.set(0, platHeight + 0.82, platDepth / 2 - 4.5)
      platformGroup.add(squadPlaque)
      plaqueMeshesRef.current.set(sq.id, squadPlaque)

      // Terminal/Dock de conexão dos cabos de dados voltado para o Hub Central
      const isLeftSide = sqX < 0
      const dockWidth = 14
      const dockDepth = 5
      const dockHeight = 4.2
      const dockGeo = new THREE.BoxGeometry(dockWidth, dockHeight, dockDepth)
      const dockMat = new THREE.MeshStandardMaterial({
        color: PYRITE_3D.platformTrim,
        metalness: 0.9,
        roughness: 0.2
      })
      const dockMesh = new THREE.Mesh(dockGeo, dockMat)
      const dockLocalX = isLeftSide ? platWidth / 2 - dockDepth / 2 : -platWidth / 2 + dockDepth / 2
      dockMesh.position.set(dockLocalX, platHeight + 1.2, 0)
      platformGroup.add(dockMesh)

      // Colar do dock (com anel pulsante de transição de energia conectada)
      const dockRingGeo = new THREE.CylinderGeometry(2.4, 2.6, 1.8, 16)
      const dockRingMat = new THREE.MeshStandardMaterial({
        color: dynamicAccent.num,
        emissive: dynamicAccent.num,
        emissiveIntensity: 1.8,
        metalness: 0.9
      })
      const dockRing = new THREE.Mesh(dockRingGeo, dockRingMat)
      dockRing.rotation.z = Math.PI / 2
      dockRing.position.set(dockLocalX + (isLeftSide ? 2.8 : -2.8), platHeight + 1.2, 0)
      platformGroup.add(dockRing)

      // 7. CRIAÇÃO DE CADA ESTAÇÃO DE TRABALHO COM ESPAÇAMENTO GENEROSO (ZERO COLISÃO ENTRE AGENTES)
      squadAgents.forEach(({ agent, isConnected }, agIdx) => {
        let deskX = 0
        let deskZ = 0
        let facingAngle = 0

        if (agentCount === 1) {
          deskX = 0
          deskZ = -10
          facingAngle = 0
        } else if (agentCount === 2) {
          // 2 mesas se encarando com corredor espaçoso no meio
          deskX = 0
          deskZ = agIdx === 0 ? -18 : 14
          facingAngle = agIdx === 0 ? 0 : Math.PI
        } else if (agentCount <= 4) {
          // 2 colunas de mesas com amplo espaçamento entre fileiras
          const col = agIdx % 2
          const row = Math.floor(agIdx / 2)
          deskX = (col === 0 ? -1 : 1) * (deskPitchX / 2)
          deskZ = row === 0 ? -18 : 14
          facingAngle = row === 0 ? 0 : Math.PI
        } else {
          // 3 colunas de mesas
          const col = agIdx % 3
          const row = Math.floor(agIdx / 3)
          deskX = (col - 1) * deskPitchX
          deskZ = row === 0 ? -18 : 14
          facingAngle = row === 0 ? 0 : Math.PI
        }

        const workstation = createWorkstationMesh({
          agent,
          squadId: sq.id,
          isConnected,
          x: deskX,
          z: deskZ,
          facingAngle,
          accentColorNum: dynamicAccent.num,
          agentIndex: agIdx
        })

        workstation.position.y = platHeight + 0.6

        platformGroup.add(workstation)
        allWorkstationsRef.current.push(workstation)
        deskMeshesRef.current.set(`${sq.id}_${agent.id}`, workstation)
      })

      scene.add(platformGroup)

      // =======================================================================
      // 8. CONDUÍTES FLUÍDOS SUPER ILUMINADOS COM COMETA DE ENERGIA ANIMADO
      // =======================================================================
      const angle = Math.atan2(sqZ, sqX)
      const startX = Math.cos(angle) * (hubRadius + 1)
      const startZ = Math.sin(angle) * (hubRadius + 1)
      const startY = 3.8

      const hubPortGeo = new THREE.CylinderGeometry(2.6, 2.8, 2.0, 16)
      const hubPortMat = new THREE.MeshStandardMaterial({
        color: PYRITE_3D.platformTrim,
        metalness: 0.9,
        roughness: 0.25
      })
      const hubPort = new THREE.Mesh(hubPortGeo, hubPortMat)
      hubPort.position.set(startX, startY, startZ)
      hubPort.rotation.z = Math.PI / 2
      hubPort.rotation.y = -angle
      scene.add(hubPort)

      const dockWorldX = sqX + dockLocalX + (isLeftSide ? 2.5 : -2.5)
      const dockWorldZ = sqZ
      const dockWorldY = platHeight + 1.2

      const dist = Math.hypot(dockWorldX - startX, dockWorldZ - startZ)

      const p0 = new THREE.Vector3(startX, startY, startZ)
      const p1 = new THREE.Vector3(
        startX + Math.cos(angle) * dist * 0.38,
        2.8,
        startZ + Math.sin(angle) * dist * 0.38
      )
      const p2 = new THREE.Vector3(
        dockWorldX - (isLeftSide ? -1 : 1) * dist * 0.38,
        2.8,
        dockWorldZ
      )
      const p3 = new THREE.Vector3(dockWorldX, dockWorldY, dockWorldZ)

      const curve = new THREE.CatmullRomCurve3([p0, p1, p2, p3])

      // 1. Tubo de blindagem externo translúcido com brilho sutil
      const armorTubeGeo = new THREE.TubeGeometry(curve, 32, 2.4, 10, false)
      const armorTubeMat = new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        roughness: 0.1,
        metalness: 0.2,
        transparent: true,
        opacity: 0.35
      })
      const armorTube = new THREE.Mesh(armorTubeGeo, armorTubeMat)
      scene.add(armorTube)

      // 2. Fibra interna de alta luminescência (super iluminada)
      const coreTubeGeo = new THREE.TubeGeometry(curve, 32, 1.1, 8, false)
      const coreTubeMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: dynamicAccent.num,
        emissiveIntensity: 4.2,
        roughness: 0.05
      })
      const coreTube = new THREE.Mesh(coreTubeGeo, coreTubeMat)
      scene.add(coreTube)

      // 3. Abraçadeiras metálicas de fixação no piso ao longo do conduíte
      ;[0.28, 0.55, 0.82].forEach(pct => {
        const clampPt = curve.getPointAt(pct)
        const clampGeo = new THREE.TorusGeometry(2.5, 0.4, 8, 16)
        const clampMat = new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.9, roughness: 0.2 })
        const clampMesh = new THREE.Mesh(clampGeo, clampMat)
        clampMesh.position.copy(clampPt)
        scene.add(clampMesh)
      })

      // 4. Fluxo de energia em cometa (Lead orb + 4 partículas na cauda)
      const leadOrbGeo = new THREE.SphereGeometry(2.3, 14, 14)
      const leadOrbMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: dynamicAccent.num,
        emissiveIntensity: 4.8
      })
      const leadOrb = new THREE.Mesh(leadOrbGeo, leadOrbMat)
      scene.add(leadOrb)

      const trailMeshes: THREE.Mesh[] = []
      const trailSizes = [1.8, 1.4, 1.0, 0.7]
      const trailOpacities = [0.85, 0.65, 0.45, 0.25]
      trailSizes.forEach((sz, tIdx) => {
        const tGeo = new THREE.SphereGeometry(sz, 10, 10)
        const tMat = new THREE.MeshStandardMaterial({
          color: dynamicAccent.num,
          emissive: dynamicAccent.num,
          emissiveIntensity: 3.5 - tIdx * 0.6,
          transparent: true,
          opacity: trailOpacities[tIdx]
        })
        const tMesh = new THREE.Mesh(tGeo, tMat)
        scene.add(tMesh)
        trailMeshes.push(tMesh)
      })

      pulseStreamsRef.current.push({
        lead: leadOrb,
        trail: trailMeshes,
        curve,
        speed: 0.004 + (sIdx % 3) * 0.0012,
        progress: sIdx * 0.35,
        dockRing
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
      savedCameraPosRef.current.copy(camera.position)
      savedTargetRef.current.copy(controls.target)

      const cameraDist = camera.position.distanceTo(controls.target)
      const zoomed = cameraDist < 360

      // Atualização dos cometas de energia e onda de choque no dock
      pulseStreamsRef.current.forEach(stream => {
        stream.progress = (stream.progress + stream.speed) % 1
        const leadPos = stream.curve.getPointAt(stream.progress)
        stream.lead.position.copy(leadPos)

        stream.trail.forEach((tMesh, tIdx) => {
          const trailLag = (tIdx + 1) * 0.028
          let trailProg = stream.progress - trailLag
          if (trailProg < 0) trailProg += 1
          const tPos = stream.curve.getPointAt(trailProg)
          tMesh.position.copy(tPos)
        })

        // Efeito de transição de energia conectando com a base do departamento
        if (stream.progress > 0.82) {
          const dockFactor = (stream.progress - 0.82) / 0.18
          const surge = Math.sin(dockFactor * Math.PI)
          // @ts-ignore
          if (stream.dockRing.material) {
            // @ts-ignore
            stream.dockRing.material.emissiveIntensity = 1.8 + surge * 3.6
          }
        } else {
          // @ts-ignore
          if (stream.dockRing.material) {
            // @ts-ignore
            stream.dockRing.material.emissiveIntensity = 1.8
          }
        }
      })

      renderer.render(scene, camera)

      // 1. Tag do Hub Central (acima da antena da torre corporativa)
      const hubEl = tagRefs.current.get('hub')
      if (hubEl) {
        tempVec.set(0, 50, 0)
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

      // 2. Tags dos Agentes (Exibidas ao aproximar o zoom ou ao selecionar)
      squads.forEach(sq => {
        const squadAgentIds = new Set<string>()
        if (sq.coordinatorAgentId) squadAgentIds.add(sq.coordinatorAgentId)
        ;(sq.pipeline || []).forEach(p => squadAgentIds.add(p.agentId))
        ;(sq.nodes || []).forEach(n => {
          if (n.agentId) squadAgentIds.add(n.agentId)
        })

        squadAgentIds.forEach(agId => {
          const tagKey = `${sq.id}_${agId}`
          const agEl = tagRefs.current.get(tagKey)
          if (agEl) {
            const desk = deskMeshesRef.current.get(tagKey)
            const isTargeted = selectedAgentIdRef.current === agId || hoveredAgentIdRef.current === agId
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

    // Raycasting para Estações de Trabalho e Placas no Chão
    const raycaster = new THREE.Raycaster()
    const mouse = new THREE.Vector2()

    const handleCanvasMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect()
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1

      raycaster.setFromCamera(mouse, camera)
      const allPlaques = Array.from(plaqueMeshesRef.current.values())
      const intersects = raycaster.intersectObjects([...allWorkstationsRef.current, ...allPlaques], true)

      // 1. Prioridade absoluta para agentes
      for (const hit of intersects) {
        let curr: THREE.Object3D | null = hit.object
        while (curr && !curr.userData.agentId && curr.parent) {
          curr = curr.parent
        }
        if (curr?.userData.agentId) {
          hoveredAgentIdRef.current = curr.userData.agentId
          canvas.style.cursor = 'pointer'
          return
        }
      }

      // 2. Placa do departamento
      for (const hit of intersects) {
        let curr: THREE.Object3D | null = hit.object
        while (curr && !curr.userData.squadId && curr.parent) {
          curr = curr.parent
        }
        if (curr?.userData.squadId && curr.userData.isPlaque) {
          hoveredAgentIdRef.current = null
          canvas.style.cursor = 'pointer'
          return
        }
      }

      hoveredAgentIdRef.current = null
      canvas.style.cursor = 'default'
    }

    let pointerDownPos = { x: 0, y: 0 }
    let pointerDownTime = 0
    const handleCanvasMouseDown = (e: MouseEvent) => {
      pointerDownPos = { x: e.clientX, y: e.clientY }
      pointerDownTime = Date.now()
    }

    const handleCanvasClick = (e: MouseEvent) => {
      // Se moveu mais de 6 pixels ou segurou arrastando por mais de 350ms, foi um movimento de câmera (pan/órbita), não um clique!
      const dragDist = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y)
      const pressDuration = Date.now() - pointerDownTime
      if (dragDist > 6 || pressDuration > 350) return

      const rect = canvas.getBoundingClientRect()
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1

      raycaster.setFromCamera(mouse, camera)
      const allPlaques = Array.from(plaqueMeshesRef.current.values())
      const intersects = raycaster.intersectObjects([...allWorkstationsRef.current, ...allPlaques], true)

      // 1. Prioridade máxima para selecionar o agente clicado
      for (const hit of intersects) {
        let curr: THREE.Object3D | null = hit.object
        while (curr && !curr.userData.agentId && curr.parent) {
          curr = curr.parent
        }
        if (curr?.userData.agentId) {
          setSelectedAgentId(curr.userData.agentId)
          return
        }
      }

      // 2. Se não clicou em nenhum agente, verifica se clicou na placa do departamento
      for (const hit of intersects) {
        let curr: THREE.Object3D | null = hit.object
        while (curr && !curr.userData.squadId && curr.parent) {
          curr = curr.parent
        }
        if (curr?.userData.squadId && curr.userData.isPlaque) {
          onSelectSquad(curr.userData.squadId)
          return
        }
      }
    }

    canvas.addEventListener('mousedown', handleCanvasMouseDown)
    canvas.addEventListener('mousemove', handleCanvasMouseMove)
    canvas.addEventListener('click', handleCanvasClick)

    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener('resize', handleResize)
      canvas.removeEventListener('mousedown', handleCanvasMouseDown)
      canvas.removeEventListener('mousemove', handleCanvasMouseMove)
      canvas.removeEventListener('click', handleCanvasClick)
      controls.dispose()
      renderer.dispose()
    }
  }, [squadsSignature, agentsSignature, vaultName, dynamicAccent.hex])

  // Resetar câmera e alvo para a perspectiva compacta padrão
  const handleResetCamera = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!cameraRef.current || !controlsRef.current) return
    cameraRef.current.position.set(0, 240, 380)
    controlsRef.current.target.set(0, 0, 0)
    controlsRef.current.update()
    savedCameraPosRef.current.set(0, 240, 380)
    savedTargetRef.current.set(0, 0, 0)
  }

  const handleZoom = (e: React.MouseEvent, delta: number) => {
    e.stopPropagation()
    if (!cameraRef.current || !controlsRef.current) return
    const factor = delta > 0 ? 0.82 : 1.18
    cameraRef.current.position.multiplyScalar(factor)
    controlsRef.current.update()
  }

  // Alternador de Tela Cheia com proteção total contra ghost backdrops
  const handleToggleFullscreen = async (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()

    // 1. Sempre fechar qualquer drawer/sidebar aberto para evitar sobreposições
    setSelectedAgentId(null)

    // 2. Tentar API nativa do Electron (se em ambiente desktop)
    const electron = (window as any).electronAPI
    if (electron?.toggleFullscreen) {
      try {
        const next = await electron.toggleFullscreen()
        setIsFullscreen(next)
        return
      } catch {}
    }

    // 3. Fallback para HTML5 Fullscreen nativo
    if (!containerRef.current) return
    try {
      if (!document.fullscreenElement) {
        await containerRef.current.requestFullscreen()
        setIsFullscreen(true)
      } else {
        await document.exitFullscreen()
        setIsFullscreen(false)
      }
    } catch {}
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

        {/* Tags Flutuantes dos Agentes do Departamento (Capsule badges em perspectiva) */}
        {squads.map(sq => {
          const squadAgentIds = new Set<string>()
          if (sq.coordinatorAgentId) squadAgentIds.add(sq.coordinatorAgentId)
          ;(sq.pipeline || []).forEach(p => squadAgentIds.add(p.agentId))
          ;(sq.nodes || []).forEach(n => {
            if (n.agentId) squadAgentIds.add(n.agentId)
          })

          return (
            <React.Fragment key={sq.id}>
              {Array.from(squadAgentIds).map(agentId => {
                const ag = agents.find(a => a.id === agentId)
                if (!ag) return null
                const isSelected = selectedAgentId === ag.id
                const isConn = ag.state !== 'paused'

                return (
                  <div
                    key={`${sq.id}_${ag.id}`}
                    ref={el => {
                      if (el) tagRefs.current.set(`${sq.id}_${ag.id}`, el)
                      else tagRefs.current.delete(`${sq.id}_${ag.id}`)
                    }}
                    onClick={() => setSelectedAgentId(ag.id)}
                    className={`absolute top-0 left-0 pointer-events-auto cursor-pointer transition-transform duration-100 whitespace-nowrap min-w-max shrink-0 hidden ${
                      isSelected ? 'scale-110 z-30' : 'hover:scale-105 z-20'
                    }`}
                    style={{ willChange: 'transform' }}
                  >
                    <div
                      className={`px-2 py-0.5 rounded-full border text-[10px] font-medium flex items-center gap-1.5 shadow-xl backdrop-blur-md ${
                        isSelected
                          ? 'bg-[var(--accent)] border-[var(--accent)] text-zinc-950 font-bold'
                          : 'bg-[#121215]/95 border-zinc-800 text-zinc-200 hover:border-[var(--accent)]/50'
                      }`}
                      style={{
                        boxShadow: isSelected ? `0 0 12px ${dynamicAccent.hex}66` : undefined
                      }}
                    >
                      <AgentIcon variant={ag.icon} size={12} className="shrink-0 rounded-full" />
                      <span className="truncate max-w-[95px]">{ag.name}</span>
                      <span
                        className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                          isConn
                            ? 'bg-emerald-400 shadow-[0_0_6px_#34d399]'
                            : 'bg-zinc-600 shadow-none'
                        }`}
                        title={isConn ? 'Conectado / Online' : 'Pausado / Standby'}
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
        onClick={e => e.stopPropagation()}
        onMouseDown={e => e.stopPropagation()}
        className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 px-3 py-2 rounded-2xl bg-[#141417]/95 border border-zinc-800 shadow-2xl backdrop-blur-xl pointer-events-auto"
      >
        {/* Alternador de Modo de Arraste (Mover vs Girar) */}
        <div className="flex items-center rounded-xl bg-zinc-900/80 p-0.5 border border-zinc-800/80">
          <button
            type="button"
            onClick={e => {
              e.stopPropagation()
              setNavMode('pan')
            }}
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
            onClick={e => {
              e.stopPropagation()
              setNavMode('orbit')
            }}
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
          onClick={e => handleZoom(e, 1)}
          className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors cursor-pointer"
          title="Aproximar (Zoom In)"
        >
          <ZoomIn className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={e => handleZoom(e, -1)}
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
      {selectedAgent && selectedAgent.id && !isFullscreen && (
        <aside
          role="region"
          aria-label="Configuração do Agente"
          onClick={e => e.stopPropagation()}
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

            {/* 3. Departamento */}
            <div>
              <label className="block text-[11px] font-medium text-zinc-400 mb-1.5">
                Departamento
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
              <div className="space-y-1.5 pt-1">
                <button
                  type="button"
                  onClick={() => onSelectSquad(selectedAgentCurrentSquad.id)}
                  className="w-full py-1.5 rounded-xl bg-zinc-800/60 hover:bg-zinc-800 text-zinc-300 text-xs font-medium transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <span>Ver no Departamento ({selectedAgentCurrentSquad.name})</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>

                {onOpenSquadChat && (
                  <button
                    type="button"
                    onClick={() => onOpenSquadChat(selectedAgentCurrentSquad)}
                    className="w-full py-1.5 rounded-xl bg-zinc-800/30 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 text-xs font-medium transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>Chat com Equipe ({selectedAgentCurrentSquad.name})</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </aside>
      )}
    </div>
  )
}
