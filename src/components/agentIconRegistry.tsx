import React from 'react'

/**
 * Identificadores das 10 variantes de ícones vetoriais de agentes.
 * Suporta identificadores canônicos, apelidos e índices numéricos (1 a 10).
 */
export type AgentIconVariant =
  | 'split'
  | 'diagonal'
  | 'mint'
  | 'arch'
  | 'portal'
  | 'tunnel'
  | 'corner'
  | 'coral'
  | 'l-shape'
  | 'bubble'
  | 'quarter'
  | 'orb'
  | 'stairs'
  | 'steps'
  | 'ladder'
  | 'pill'
  | 'capsule'
  | 'violet'
  | 'hill'
  | 'wave-hill'
  | 'dune'
  | 'horizon'
  | 'half'
  | 'rose'
  | 'wave'
  | 'sine'
  | 'stream'
  | 'flow'
  | 'badge'
  | 'square'
  | 'nested'
  | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10
  | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10'
  | (string & {})

/**
 * Estados do agente para controle das micro-animações.
 */
export type AgentIconState =
  | 'waiting'
  | 'idle'
  | 'available'
  | 'paused'
  | 'thinking'
  | 'executing'
  | 'running'
  | 'working'
  | 'completed'
  | 'success'
  | 'done'
  | 'attention'
  | 'warning'
  | 'needs_attention'
  | 'waiting_user'

export interface AgentIconDefinition {
  id: string
  index: number
  name: string
  description: string
  aliases: string[]
  bg: string
  shape: string
  eyeCx: number
  eyeCy: number
  renderShape: () => React.ReactNode
}

/**
 * Registro oficial das 10 variantes de ícones para agentes,
 * com geometria vetorizada, cores extraídas da referência e posições de olhos.
 */
export const AGENT_ICON_VARIANTS: AgentIconDefinition[] = [
  {
    id: 'split',
    index: 1,
    name: 'Split',
    description: 'Corte diagonal verde menta com esmeralda profundo',
    aliases: ['split', 'diagonal', 'mint', '1'],
    bg: '#93E5C2',
    shape: '#1D9683',
    eyeCx: 39.0,
    eyeCy: 44.5,
    renderShape: () => (
      <path d="M 0 100 L 100 15 L 100 100 Z" fill="#1D9683" />
    )
  },
  {
    id: 'arch',
    index: 2,
    name: 'Arch',
    description: 'Portal em arco cobalto profundo sobre azul pervinca',
    aliases: ['arch', 'portal', 'tunnel', 'hood', '2'],
    bg: '#9DB1FD',
    shape: '#355FDD',
    eyeCx: 50.0,
    eyeCy: 70.0,
    renderShape: () => (
      <path
        d="M 10 100 L 10 64 A 40 40 0 0 1 90 64 L 90 100 L 70 100 L 70 64 A 20 20 0 0 0 30 64 L 30 100 Z"
        fill="#355FDD"
      />
    )
  },
  {
    id: 'corner',
    index: 3,
    name: 'Corner',
    description: 'Borda curva em L em tom vermelho papoula sobre salmão coral',
    aliases: ['corner', 'coral', 'l-shape', 'bend', '3'],
    bg: '#FEA394',
    shape: '#F65F53',
    eyeCx: 61.0,
    eyeCy: 41.0,
    renderShape: () => (
      <path
        d="M 0 0 L 30 0 L 30 50 Q 30 70 50 70 L 100 70 L 100 100 L 0 100 Z"
        fill="#F65F53"
      />
    )
  },
  {
    id: 'bubble',
    index: 4,
    name: 'Bubble',
    description: 'Orbe em quarto de círculo azul safira sobre azul celeste',
    aliases: ['bubble', 'quarter', 'orb', 'blue', '4'],
    bg: '#99C1FE',
    shape: '#3179EB',
    eyeCx: 29.5,
    eyeCy: 29.5,
    renderShape: () => (
      <path d="M 32 100 A 68 68 0 0 1 100 32 L 100 100 Z" fill="#3179EB" />
    )
  },
  {
    id: 'stairs',
    index: 5,
    name: 'Stairs',
    description: 'Escada de 3 degraus laranja vívido sobre amarelo âmbar',
    aliases: ['stairs', 'steps', 'ladder', 'orange', '5'],
    bg: '#FDC858',
    shape: '#F88726',
    eyeCx: 34.0,
    eyeCy: 33.0,
    renderShape: () => (
      <path
        d="M 19 100 L 19 75 Q 19 74 20 74 L 46 74 Q 46 74 46 73 L 46 49 Q 46 48 47 48 L 73 48 Q 73 48 73 47 L 73 24 Q 73 23 74 23 L 100 23 L 100 100 Z"
        fill="#F88726"
      />
    )
  },
  {
    id: 'pill',
    index: 6,
    name: 'Pill',
    description: 'Cápsula vertical violeta profundo sobre lilás suave',
    aliases: ['pill', 'capsule', 'violet', 'dome', '6'],
    bg: '#CBA5E5',
    shape: '#6C459E',
    eyeCx: 50.0,
    eyeCy: 50.5,
    renderShape: () => (
      <path d="M 23 100 L 23 33 A 27 27 0 0 1 77 33 L 77 100 Z" fill="#6C459E" />
    )
  },
  {
    id: 'hill',
    index: 7,
    name: 'Hill',
    description: 'Colina em curva suave verde petróleo sobre água-marinha',
    aliases: ['hill', 'wave-hill', 'dune', 'teal', '7'],
    bg: '#92E1D3',
    shape: '#178488',
    eyeCx: 31.0,
    eyeCy: 33.0,
    renderShape: () => (
      <path d="M 34 100 C 34 70 64 42 100 36 L 100 100 Z" fill="#178488" />
    )
  },
  {
    id: 'horizon',
    index: 8,
    name: 'Horizon',
    description: 'Divisão horizontal framboesa sobre rosa suave',
    aliases: ['horizon', 'half', 'rose', 'level', '8'],
    bg: '#FC9BB3',
    shape: '#E95D7E',
    eyeCx: 49.5,
    eyeCy: 32.0,
    renderShape: () => (
      <rect x="0" y="54" width="100" height="46" fill="#E95D7E" />
    )
  },
  {
    id: 'wave',
    index: 9,
    name: 'Wave',
    description: 'Onda sinusoidal verde oliva sobre sálvia dourada',
    aliases: ['wave', 'sine', 'stream', 'flow', 'olive', '9'],
    bg: '#CDD37B',
    shape: '#7C8642',
    eyeCx: 53.0,
    eyeCy: 34.5,
    renderShape: () => (
      <path
        d="M 0 38 C 35 38 55 71 75 71 C 88 71 95 62 100 56 L 100 100 L 0 100 Z"
        fill="#7C8642"
      />
    )
  },
  {
    id: 'badge',
    index: 10,
    name: 'Badge',
    description: 'Quadrado concêntrico arredondado lavanda sobre lilás pastel',
    aliases: ['badge', 'square', 'nested', 'core', '10'],
    bg: '#C4B8FD',
    shape: '#8A84E1',
    eyeCx: 50.0,
    eyeCy: 51.0,
    renderShape: () => (
      <rect x="19" y="20" width="62" height="62" rx="18" fill="#8A84E1" />
    )
  }
]

/**
 * Resolve o identificador ou apelido para uma das 10 variantes.
 */
export function resolveAgentIconVariant(variant?: AgentIconVariant): AgentIconDefinition {
  if (typeof variant === 'number') {
    const idx = (variant - 1) % AGENT_ICON_VARIANTS.length
    return AGENT_ICON_VARIANTS[idx >= 0 ? idx : 0]
  }

  if (!variant) return AGENT_ICON_VARIANTS[0]

  const key = String(variant).toLowerCase().trim()

  const match = AGENT_ICON_VARIANTS.find(
    v => v.id === key || v.aliases.includes(key)
  )

  if (match) return match

  const numMatch = key.match(/\d+/)
  if (numMatch) {
    const n = parseInt(numMatch[0], 10)
    if (!isNaN(n) && n >= 1 && n <= AGENT_ICON_VARIANTS.length) {
      return AGENT_ICON_VARIANTS[n - 1]
    }
  }

  return AGENT_ICON_VARIANTS[0]
}

/**
 * Normaliza o estado do agente para a classe CSS correspondente.
 */
export function normalizeAgentIconState(state?: AgentIconState): string {
  switch (state) {
    case 'thinking':
      return 'thinking'
    case 'executing':
    case 'running':
    case 'working':
      return 'executing'
    case 'completed':
    case 'success':
    case 'done':
      return 'completed'
    case 'attention':
    case 'warning':
    case 'needs_attention':
    case 'waiting_user':
      return 'attention'
    case 'waiting':
    case 'idle':
    case 'available':
    case 'paused':
    default:
      return 'waiting'
  }
}

/**
 * Verifica se um valor arbitrário corresponde a uma das 10 variantes de ícone.
 */
export function isAgentIconVariant(val?: string | number): boolean {
  if (!val) return false
  if (typeof val === 'number') return val >= 1 && val <= 10
  const k = String(val).toLowerCase().trim()
  return AGENT_ICON_VARIANTS.some(v => v.id === k || v.aliases.includes(k))
}
