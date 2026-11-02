import React, { useId } from 'react'
import './AgentIcon.css'
import {
  type AgentIconVariant,
  type AgentIconState,
  type AgentIconDefinition,
  AGENT_ICON_VARIANTS,
  resolveAgentIconVariant,
  normalizeAgentIconState
} from './agentIconRegistry'

export type { AgentIconVariant, AgentIconState, AgentIconDefinition }

export interface AgentIconProps extends Omit<React.SVGProps<SVGSVGElement>, 'size'> {
  /**
   * Qual das 10 identidades visuais exibir (ex: 'wave', 'arch', 'split', 'stairs', ou número de 1 a 10).
   * @default 'split'
   */
  variant?: AgentIconVariant

  /**
   * Estado dinâmico do agente para controlar o movimento CSS.
   * - 'waiting' / 'idle': Pisca ocasionalmente
   * - 'thinking': Olhos olham suavemente para os lados
   * - 'executing' / 'running' / 'working': Forma interna se desloca suavemente (contínuo)
   * - 'completed' / 'success': Pequeno salto alegre com olhos sorridentes (^ ^)
   * - 'attention' / 'warning': Duas inclinações leves (curiosas)
   * @default 'waiting'
   */
  state?: AgentIconState

  /**
   * Tamanho em pixels (ou string com unidade CSS, ex: 32, 48, '2rem').
   * @default 32
   */
  size?: number | string

  /**
   * Desativa animações manuais além da verificação nativa de @media (prefers-reduced-motion: reduce).
   * @default false
   */
  reducedMotion?: boolean

  /**
   * Título descritivo para acessibilidade / tooltip.
   */
  title?: string
}

/**
 * <AgentIcon />
 * Componente oficial de ícone animado em SVG + CSS para os agentes do Pyrite.
 *
 * Estruturado estritamente em 3 camadas:
 * 1. Fundo arredondado estático (mantém o layout e contorno imóveis).
 * 2. Forma colorida interna vetorizada (se desloca no estado 'executing').
 * 3. Olhos vetorizados expressivos (piscam em 'waiting', olham aos lados em 'thinking',
 *    e sorriem em 'completed').
 *
 * Suporta preferência de movimento reduzido (prefers-reduced-motion).
 */
export const AgentIcon: React.FC<AgentIconProps> = ({
  variant = 'split',
  state = 'waiting',
  size = 32,
  reducedMotion = false,
  className = '',
  style,
  title,
  ...svgProps
}) => {
  const iconDef = resolveAgentIconVariant(variant)
  const normState = normalizeAgentIconState(state)
  const rawId = useId()
  const clipId = `pyrite-agent-clip-${iconDef.id}-${rawId.replace(/:/g, '')}`

  const lx = iconDef.eyeCx - 8
  const rx = iconDef.eyeCx + 8
  const ey = iconDef.eyeCy

  const ariaLabel = title || `${iconDef.name} Agent (${normState})`

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={`pyrite-agent-icon state-${normState} ${reducedMotion ? 'reduced-motion' : ''} ${className}`.trim()}
      role="img"
      aria-label={ariaLabel}
      style={{
        width: typeof size === 'number' ? `${size}px` : size,
        height: typeof size === 'number' ? `${size}px` : size,
        ...style
      }}
      {...svgProps}
    >
      {title && <title>{title}</title>}
      <defs>
        <clipPath id={clipId}>
          <rect width="100" height="100" rx="24" />
        </clipPath>
      </defs>

      {/* Camada 1: Fundo Arredondado Estático (Preserva a estabilidade da interface) */}
      <rect
        width="100"
        height="100"
        rx="24"
        fill={iconDef.bg}
        className="pyrite-agent-icon-bg"
      />

      {/* Conteúdo Interno com ClipPath */}
      <g clipPath={`url(#${clipId})`}>
        <g className="pyrite-agent-icon-character">
          {/* Camada 2: Forma Colorida Interna */}
          <g className="pyrite-agent-icon-shape">
            {iconDef.renderShape()}
          </g>

          {/* Camada 3: Olhos Animados */}
          <g className="pyrite-agent-icon-eyes-group">
            {/* Olhos Padrão (Pills) com ponto de rotação centrado */}
            <g className="pyrite-agent-icon-eye-pill" fill="#202738">
              <rect
                x={lx - 3.5}
                y={ey - 5.5}
                width={7}
                height={11}
                rx={3.5}
                style={{ transformOrigin: `${lx}px ${ey}px` }}
              />
              <rect
                x={rx - 3.5}
                y={ey - 5.5}
                width={7}
                height={11}
                rx={3.5}
                style={{ transformOrigin: `${rx}px ${ey}px` }}
              />
            </g>

            {/* Olhos Sorridentes (Concluído) */}
            <g
              className="pyrite-agent-icon-eye-smile"
              stroke="#202738"
              strokeWidth={2.6}
              strokeLinecap="round"
              fill="none"
            >
              <path
                d={`M ${lx - 4.5} ${ey + 1} Q ${lx} ${ey - 4.5} ${lx + 4.5} ${ey + 1}`}
              />
              <path
                d={`M ${rx - 4.5} ${ey + 1} Q ${rx} ${ey - 4.5} ${rx + 4.5} ${ey + 1}`}
              />
            </g>
          </g>
        </g>
      </g>
    </svg>
  )
}

/**
 * Componente Seletor de Ícones de Agentes (<AgentIconPicker />)
 * Exibe a grade de 10 variantes para seleção interativa com feedback visual.
 */
export interface AgentIconPickerProps {
  selectedVariant?: AgentIconVariant
  onSelect: (variantId: string) => void
  state?: AgentIconState
  size?: number
  className?: string
}

export const AgentIconPicker: React.FC<AgentIconPickerProps> = ({
  selectedVariant = 'split',
  onSelect,
  state = 'waiting',
  size = 40,
  className = ''
}) => {
  const current = resolveAgentIconVariant(selectedVariant)

  return (
    <div className={`grid grid-cols-5 gap-2 ${className}`}>
      {AGENT_ICON_VARIANTS.map(v => {
        const isSelected = current.id === v.id

        return (
          <button
            key={v.id}
            type="button"
            onClick={() => onSelect(v.id)}
            title={`${v.name} (${v.description})`}
            className={`group relative flex flex-col items-center justify-center p-1.5 rounded-xl transition-all cursor-pointer border ${
              isSelected
                ? 'bg-zinc-800/80 border-white/60 shadow-md ring-2 ring-white/20'
                : 'bg-zinc-900/40 border-zinc-800/60 hover:bg-zinc-800/50 hover:border-zinc-700'
            }`}
          >
            <AgentIcon
              variant={v.id}
              state={isSelected ? state : 'waiting'}
              size={size}
              className="transition-transform group-hover:scale-105"
            />
            <span
              className={`mt-1 text-[10px] font-medium transition-colors ${
                isSelected ? 'text-white font-semibold' : 'text-zinc-400 group-hover:text-zinc-200'
              }`}
            >
              {v.name}
            </span>
          </button>
        )
      })}
    </div>
  )
}

export default AgentIcon
