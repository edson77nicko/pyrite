import React, { useState, useRef, useEffect } from 'react'
import { Clock } from 'lucide-react'

export interface CustomTimePickerProps {
  value?: string // HH:mm format, e.g. "09:00"
  onChange: (value: string) => void
  disabled?: boolean
  className?: string
  buttonClassName?: string
}

const PRESET_TIMES = [
  '08:00',
  '09:00',
  '10:00',
  '11:00',
  '12:00',
  '14:00',
  '15:00',
  '16:00',
  '18:00',
  '20:00'
]

export const CustomTimePicker: React.FC<CustomTimePickerProps> = ({
  value = '09:00',
  onChange,
  disabled = false,
  className = '',
  buttonClassName = ''
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const [h, m] = (value || '09:00').split(':')
  const currentHour = parseInt(h || '9', 10)
  const currentMinute = parseInt(m || '0', 10)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      window.addEventListener('keydown', handleKeyDown)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  const setHour = (newH: number) => {
    const hh = String(Math.max(0, Math.min(23, newH))).padStart(2, '0')
    const mm = String(currentMinute).padStart(2, '0')
    onChange(`${hh}:${mm}`)
  }

  const setMinute = (newM: number) => {
    const hh = String(currentHour).padStart(2, '0')
    const mm = String(Math.max(0, Math.min(59, newM))).padStart(2, '0')
    onChange(`${hh}:${mm}`)
  }

  return (
    <div
      ref={containerRef}
      data-no-pan="true"
      className={`relative inline-block ${className}`}
      onPointerDown={e => e.stopPropagation()}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen(prev => !prev)}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-[#18181b] hover:bg-[#1c1c1f] border border-zinc-800/80 hover:border-zinc-700 text-xs text-zinc-100 font-mono transition-all cursor-pointer ${buttonClassName}`}
      >
        <Clock className="w-3.5 h-3.5 text-zinc-400" />
        <span>{value || '09:00'}</span>
      </button>

      {isOpen && (
        <div
          data-no-pan="true"
          onWheel={e => e.stopPropagation()}
          className="absolute top-full mt-1.5 left-0 w-52 bg-[#18181b] border border-zinc-800 rounded-xl shadow-2xl p-2.5 z-50 space-y-2.5 text-xs animate-in fade-in zoom-in-95 duration-100 overscroll-contain"
        >
          <div className="flex items-center justify-between text-[10.5px] font-semibold uppercase tracking-wider text-zinc-400 border-b border-zinc-800 pb-1.5">
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3 text-zinc-400" />
              Horário
            </span>
            <span className="font-mono text-zinc-200">{value}</span>
          </div>

          {/* Seletor Rápido de Hora e Minuto */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="text-[10px] text-zinc-500 block mb-1">Hora</span>
              <div
                onWheel={e => e.stopPropagation()}
                className="max-h-32 overflow-y-auto space-y-0.5 custom-chat-scrollbar pr-1 overscroll-contain"
              >
                {Array.from({ length: 24 }).map((_, idx) => {
                  const isSel = idx === currentHour
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setHour(idx)}
                      className={`w-full py-0.5 px-1.5 rounded text-left font-mono text-[11px] transition-colors cursor-pointer ${
                        isSel
                          ? 'bg-zinc-800 text-white font-semibold'
                          : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'
                      }`}
                    >
                      {String(idx).padStart(2, '0')}h
                    </button>
                  )
                })}
              </div>
            </div>

            <div>
              <span className="text-[10px] text-zinc-500 block mb-1">Minuto</span>
              <div
                onWheel={e => e.stopPropagation()}
                className="max-h-32 overflow-y-auto space-y-0.5 custom-chat-scrollbar pr-1 overscroll-contain"
              >
                {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map(min => {
                  const isSel = min === currentMinute
                  return (
                    <button
                      key={min}
                      type="button"
                      onClick={() => setMinute(min)}
                      className={`w-full py-0.5 px-1.5 rounded text-left font-mono text-[11px] transition-colors cursor-pointer ${
                        isSel
                          ? 'bg-zinc-800 text-white font-semibold'
                          : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'
                      }`}
                    >
                      {String(min).padStart(2, '0')}m
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Horários Predefinidos */}
          <div className="border-t border-zinc-800/70 pt-2">
            <span className="text-[9.5px] uppercase font-semibold text-zinc-500 block mb-1.5">
              Sugestões Rápidas
            </span>
            <div className="grid grid-cols-4 gap-1">
              {PRESET_TIMES.slice(0, 8).map(time => {
                const isSel = time === value
                return (
                  <button
                    key={time}
                    type="button"
                    onClick={() => {
                      onChange(time)
                      setIsOpen(false)
                    }}
                    className={`py-0.5 rounded text-[10px] font-mono cursor-pointer transition-colors ${
                      isSel
                        ? 'bg-zinc-800 text-white font-semibold'
                        : 'bg-[#121215] text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'
                    }`}
                  >
                    {time}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
