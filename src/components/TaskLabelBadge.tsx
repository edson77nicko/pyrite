import React from 'react'
import { getLabelColor } from '../utils/taskProperties'
import { X } from 'lucide-react'

interface TaskLabelBadgeProps {
  label: string
  onRemove?: () => void
  onClick?: () => void
  className?: string
  size?: 'xs' | 'sm' | 'md'
  showRemoveAlways?: boolean
}

export const TaskLabelBadge: React.FC<TaskLabelBadgeProps> = ({
  label,
  onRemove,
  onClick,
  className = '',
  size = 'sm',
  showRemoveAlways = false
}) => {
  const colorStyle = getLabelColor(label)

  const sizeClasses = {
    xs: 'text-[9.5px] px-1.5 py-0.2 gap-1 rounded-full',
    sm: 'text-[10.5px] px-2 py-0.5 gap-1.5 rounded-full',
    md: 'text-xs px-2.5 py-1 gap-1.5 rounded-full'
  }[size]

  return (
    <span
      onClick={onClick}
      className={`group/label-badge inline-flex items-center font-medium transition-all select-none border shrink-0 ${sizeClasses} ${
        onClick ? 'cursor-pointer hover:brightness-110' : ''
      } ${className}`}
      style={{
        backgroundColor: colorStyle.bg,
        borderColor: colorStyle.border,
        color: colorStyle.text
      }}
      title={`Rótulo: ${label}`}
    >
      <span
        className="rounded-full shrink-0 shadow-xs"
        style={{
          backgroundColor: colorStyle.dot,
          width: size === 'xs' ? '4.5px' : '5.5px',
          height: size === 'xs' ? '4.5px' : '5.5px'
        }}
      />
      <span className="truncate max-w-[140px]">{label}</span>

      {onRemove && (
        <button
          type="button"
          onClick={e => {
            e.stopPropagation()
            onRemove()
          }}
          className={`hover:text-rose-400 hover:scale-110 transition-all cursor-pointer p-0.5 -mr-0.5 rounded-full ${
            showRemoveAlways ? 'opacity-70 hover:opacity-100' : 'opacity-0 group-hover/label-badge:opacity-100'
          }`}
          title="Remover rótulo"
        >
          <X className={size === 'xs' ? 'w-2.5 h-2.5' : 'w-3 h-3'} />
        </button>
      )}
    </span>
  )
}

export default TaskLabelBadge
