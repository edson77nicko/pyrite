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
 * Concentric Radii Geometry Mapping with Ultra-Snug Margins:
 * R_outer = R_inner + padding
 *
 * Spacing at sides & bottom is intentionally minimal (4px - 6px)
 * for a precision machined inlay feel without colored containers.
 *
 * - 'sm': P = 4px | R_inner = 8px  | R_outer = 12px (12 = 8 + 4)
 * - 'md': P = 5px | R_inner = 10px | R_outer = 15px (15 = 10 + 5)
 * - 'lg': P = 6px | R_inner = 12px | R_outer = 18px (18 = 12 + 6)
 * - 'xl': P = 8px | R_inner = 14px | R_outer = 22px (22 = 14 + 8)
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
    outerClass: 'rounded-[12px] px-[4px] pb-[4px] pt-[5px]',
    innerClass: 'rounded-[8px] p-2.5',
    headerPadding: 'px-2 pb-1.5 pt-0.5'
  },
  md: {
    outerClass: 'rounded-[15px] px-[5px] pb-[5px] pt-[6px]',
    innerClass: 'rounded-[10px] p-3',
    headerPadding: 'px-2.5 pb-2 pt-0.5'
  },
  lg: {
    outerClass: 'rounded-[18px] px-[6px] pb-[6px] pt-[7px]',
    innerClass: 'rounded-[12px] p-4',
    headerPadding: 'px-3 pb-2.5 pt-1'
  },
  xl: {
    outerClass: 'rounded-[22px] px-[8px] pb-[8px] pt-[9px]',
    innerClass: 'rounded-[14px] p-5',
    headerPadding: 'px-3.5 pb-3 pt-1'
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
    outer: 'bg-[#141417] border border-white/[0.08] shadow-lg shadow-black/50',
    inner: 'bg-[#0a0a0c] border border-white/[0.04] shadow-inner'
  },
  gold: {
    outer: 'bg-[#141417] border border-white/[0.09] shadow-lg shadow-black/50',
    inner: 'bg-[#0a0a0c] border border-white/[0.04] shadow-inner'
  },
  glass: {
    outer: 'bg-zinc-900/60 backdrop-blur-md border border-white/[0.08] shadow-2xl shadow-black/60',
    inner: 'bg-[#0a0a0c]/90 border border-white/[0.04] shadow-inner'
  },
  highlight: {
    outer: 'bg-[#151519] border border-white/[0.12] shadow-xl shadow-black/60',
    inner: 'bg-[#0a0a0d] border border-white/[0.05] shadow-inner'
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
            {icon && <span className="shrink-0 text-[#c59b27]">{icon}</span>}
            <div className="truncate">
              {title && (
                <div className="font-semibold text-zinc-200 text-xs tracking-wide truncate">
                  {title}
                </div>
              )}
              {subtitle && (
                <div className="text-[10px] text-zinc-500 truncate">
                  {subtitle}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {badge && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-[#1c1913] text-[#d4af37] border border-[#c59b27]/25 shadow-xs">
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
