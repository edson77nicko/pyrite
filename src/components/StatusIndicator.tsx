import React from 'react'
import type { TaskStatusGroup } from '../types/tasks'

export type StatusIndicatorStyle = 'circle' | 'bar' | 'dot'

export interface StatusLikeOption {
  id: string
  name?: string
  label?: string
  color: string
  isCompleted?: boolean
  group?: TaskStatusGroup
  progress?: number
}

/**
 * Calculates a dynamic 0-100% progress value for a status option.
 * Automatically adapts based on the quantity and order of options.
 * If progress is explicitly defined, it takes precedence.
 * If option is completed or belongs to 'done' group, resolves to 100%.
 */
export function computeStatusProgress<T extends StatusLikeOption>(
  currentId: string | undefined,
  options: T[]
): number {
  if (!currentId || !options || options.length === 0) return 0
  const index = options.findIndex(o => o.id === currentId)
  if (index === -1) return 0

  const current = options[index]
  if (typeof current.progress === 'number' && !isNaN(current.progress)) {
    return Math.max(0, Math.min(100, Math.round(current.progress)))
  }

  if (current.isCompleted || current.group === 'done') {
    return 100
  }

  if (options.length === 1) {
    return current.isCompleted ? 100 : 0
  }

  // First non-completed option = 0%
  if (index === 0) return 0

  // Last option in list = 100%
  if (index === options.length - 1) return 100

  // Linearly distribute between 0 and 100% based on position in total options
  return Math.round((index / (options.length - 1)) * 100)
}

/**
 * Circular progress ring icon matching the user's reference.
 * Empty ring when 0%, partial arc when in progress, full ring when 100%.
 */
export const StatusProgressCircle: React.FC<{
  progress: number
  color: string
  size?: number
  className?: string
}> = ({ progress, color, size = 13, className = '' }) => {
  const r = 8.5
  const circ = 2 * Math.PI * r
  const clamped = Math.max(0, Math.min(100, progress))
  const strokeOffset = circ - (clamped / 100) * circ

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={`shrink-0 ${className}`}
      style={{ overflow: 'visible' }}
    >
      {/* Background circular track */}
      <circle
        cx="12"
        cy="12"
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        className="opacity-30"
      />
      {/* Progress ring arc */}
      {clamped > 0 && (
        <circle
          cx="12"
          cy="12"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="2.8"
          strokeDasharray={circ}
          strokeDashoffset={strokeOffset}
          strokeLinecap="round"
          transform="rotate(-90 12 12)"
          className="transition-all duration-300 ease-out"
        />
      )}
    </svg>
  )
}

/**
 * Horizontal progress bar indicator with percentage.
 */
export const StatusBarProgress: React.FC<{
  progress: number
  color: string
  showText?: boolean
  className?: string
}> = ({ progress, color, showText = true, className = '' }) => {
  const clamped = Math.max(0, Math.min(100, progress))
  return (
    <div className={`inline-flex items-center gap-1.5 shrink-0 ${className}`}>
      <div className="w-5 h-1.5 bg-zinc-800/90 rounded-full overflow-hidden border border-zinc-700/60 shrink-0">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{ width: `${clamped}%`, backgroundColor: color }}
        />
      </div>
      {showText && (
        <span className="text-[9px] font-mono opacity-85 shrink-0 leading-none">
          {clamped}%
        </span>
      )}
    </div>
  )
}

/**
 * Complete status badge / pill supporting circle, bar, or dot indicator.
 */
export const StatusBadge: React.FC<{
  name: string
  color: string
  progress: number
  indicatorStyle?: StatusIndicatorStyle
  onClick?: (e: React.MouseEvent) => void
  className?: string
}> = ({
  name,
  color,
  progress,
  indicatorStyle = 'circle',
  onClick,
  className = ''
}) => {
  return (
    <span
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10.5px] font-medium transition-all ${className}`}
      style={{
        backgroundColor: `${color}18`,
        color: color
      }}
    >
      {indicatorStyle === 'circle' && (
        <StatusProgressCircle progress={progress} color={color} size={13} />
      )}
      {indicatorStyle === 'bar' && (
        <StatusBarProgress progress={progress} color={color} showText={true} />
      )}
      {indicatorStyle === 'dot' && (
        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
      )}
      <span className="truncate">{name}</span>
    </span>
  )
}
