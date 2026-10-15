import React from 'react'

export type NestedCardSize = 'sm' | 'md' | 'lg' | 'xl'
export type NestedCardVariant = 'default' | 'gold' | 'glass' | 'highlight'

export interface NestedCardProps {
  title?: React.ReactNode
  icon?: React.ReactNode
  badge?: React.ReactNode
  actions?: React.ReactNode
  subtitle?: React.ReactNode
  size?: NestedCardSize
  variant?: NestedCardVariant
  className?: string
  innerClassName?: string
  headerClassName?: string
  children: React.ReactNode
}

/**
 * Concentric Radii Geometry Mapping:
 * R_outer = R_inner + padding
 *
 * - 'sm': padding = 8px  | R_inner = 8px  | R_outer = 16px (16 = 8 + 8)
 * - 'md': padding = 10px | R_inner = 10px | R_outer = 20px (20 = 10 + 10)
 * - 'lg': padding = 12px | R_inner = 12px | R_outer = 24px (24 = 12 + 12)
 * - 'xl': padding = 16px | R_inner = 16px | R_outer = 32px (32 = 16 + 16)
 */
const SIZE_CONFIGS: Record<
  NestedCardSize,
  {
    outerClass: string
    innerClass: string
    headerPadding: string
  }
> = {
  sm: {
    outerClass: 'rounded-[16px] p-[8px]',
    innerClass: 'rounded-[8px] p-2.5',
    headerPadding: 'px-2 pt-0.5 pb-2'
  },
  md: {
    outerClass: 'rounded-[20px] p-[10px]',
    innerClass: 'rounded-[10px] p-3.5',
    headerPadding: 'px-2.5 pt-1 pb-2.5'
  },
  lg: {
    outerClass: 'rounded-[24px] p-[12px]',
    innerClass: 'rounded-[12px] p-4',
    headerPadding: 'px-3 pt-1.5 pb-3'
  },
  xl: {
    outerClass: 'rounded-[32px] p-[16px]',
    innerClass: 'rounded-[16px] p-5',
    headerPadding: 'px-3.5 pt-2 pb-3.5'
  }
}

const VARIANT_CONFIGS: Record<
  NestedCardVariant,
  {
    outer: string
    inner: string
  }
> = {
  default: {
    outer: 'bg-[#18181c] border border-zinc-800/80 shadow-xl shadow-black/40',
    inner: 'bg-[#0c0c0e] border border-zinc-800/70 shadow-inner'
  },
  gold: {
    outer: 'bg-gradient-to-b from-[#221c12] to-[#161410] border border-amber-500/30 shadow-xl shadow-amber-950/20',
    inner: 'bg-[#0c0c0e] border border-amber-500/20 shadow-inner'
  },
  glass: {
    outer: 'bg-zinc-900/60 backdrop-blur-md border border-zinc-700/50 shadow-2xl',
    inner: 'bg-zinc-950/80 border border-zinc-800/60 shadow-inner'
  },
  highlight: {
    outer: 'bg-gradient-to-br from-[#1a1824] via-[#14141c] to-[#101014] border border-amber-500/40 shadow-2xl shadow-amber-950/30',
    inner: 'bg-[#0a0a0d] border border-zinc-800/80 shadow-inner'
  }
}

export const NestedCard: React.FC<NestedCardProps> = ({
  title,
  icon,
  badge,
  actions,
  subtitle,
  size = 'md',
  variant = 'default',
  className = '',
  innerClassName = '',
  headerClassName = '',
  children
}) => {
  const sizeConfig = SIZE_CONFIGS[size]
  const variantConfig = VARIANT_CONFIGS[variant]
  const hasHeader = Boolean(title || icon || badge || actions || subtitle)

  return (
    <div
      className={`nested-card-outer relative flex flex-col transition-all text-xs ${sizeConfig.outerClass} ${variantConfig.outer} ${className}`}
    >
      {/* 1. Functional Outer Frame Header */}
      {hasHeader && (
        <div
          className={`nested-card-header flex items-center justify-between gap-2 select-none ${sizeConfig.headerPadding} ${headerClassName}`}
        >
          <div className="flex items-center gap-2 min-w-0">
            {icon && <span className="shrink-0 text-amber-400">{icon}</span>}
            <div className="truncate">
              {title && (
                <div className="font-semibold text-zinc-100 text-xs tracking-wide truncate">
                  {title}
                </div>
              )}
              {subtitle && (
                <div className="text-[10px] text-zinc-400 truncate">
                  {subtitle}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {badge && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-amber-950/40 text-amber-300 border border-amber-800/40 shadow-sm">
                {badge}
              </span>
            )}
            {actions}
          </div>
        </div>
      )}

      {/* 2. Concentric Inner Sub-surface (Action & Content Area) */}
      <div
        className={`nested-card-inner flex-1 transition-all text-zinc-300 ${sizeConfig.innerClass} ${variantConfig.inner} ${innerClassName}`}
      >
        {children}
      </div>
    </div>
  )
}
