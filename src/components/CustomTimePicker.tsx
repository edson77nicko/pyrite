import React, { useState, useRef, useEffect } from 'react'
import { Clock, Sun, Moon } from 'lucide-react'

export interface CustomTimePickerProps {
  value?: string // HH:mm format, e.g. "09:00"
  onChange: (value: string) => void
  disabled?: boolean
  className?: string
  buttonClassName?: string
}

const PRESET_TIMES = [
  '09:00',
  '10:00',
  '11:00',
  '12:00',
  '14:00',
  '15:00',
  '16:00',
  '17:00',
  '18:00',
  '20:00'
]

function getPeriodInfo(hour: number): { label: string; isPM: boolean } {
  if (hour >= 0 && hour < 6) return { label: 'madrugada', isPM: false }
  if (hour >= 6 && hour < 12) return { label: 'manhã', isPM: false }
  if (hour >= 12 && hour < 18) return { label: 'tarde', isPM: true }
  return { label: 'noite', isPM: true }
}

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

  const [periodTab, setPeriodTab] = useState<'am' | 'pm'>(() => (currentHour >= 12 ? 'pm' : 'am'))

  useEffect(() => {
    setPeriodTab(currentHour >= 12 ? 'pm' : 'am')
  }, [currentHour])

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

  const currentPeriod = getPeriodInfo(currentHour)

  const morningHours = [
    { h: 0, text: '00:00 (meia-noite)' },
    { h: 1, text: '01:00 (madrugada)' },
    { h: 2, text: '02:00 (madrugada)' },
    { h: 3, text: '03:00 (madrugada)' },
    { h: 4, text: '04:00 (4h madrugada)' },
    { h: 5, text: '05:00 (madrugada)' },
    { h: 6, text: '06:00 (6h manhã)' },
    { h: 7, text: '07:00 (7h manhã)' },
    { h: 8, text: '08:00 (8h manhã)' },
    { h: 9, text: '09:00 (9h manhã)' },
    { h: 10, text: '10:00 (10h manhã)' },
    { h: 11, text: '11:00 (11h manhã)' }
  ]

  const afternoonHours = [
    { h: 12, text: '12:00 (meio-dia)' },
    { h: 13, text: '13:00 (1h tarde)' },
    { h: 14, text: '14:00 (2h tarde)' },
    { h: 15, text: '15:00 (3h tarde)' },
    { h: 16, text: '16:00 (4h tarde)' },
    { h: 17, text: '17:00 (5h tarde)' },
    { h: 18, text: '18:00 (6h tarde)' },
    { h: 19, text: '19:00 (7h noite)' },
    { h: 20, text: '20:00 (8h noite)' },
    { h: 21, text: '21:00 (9h noite)' },
    { h: 22, text: '22:00 (10h noite)' },
    { h: 23, text: '23:00 (11h noite)' }
  ]

  const activeHoursList = periodTab === 'pm' ? afternoonHours : morningHours

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
        title={`Horário configurado: ${value} (${currentPeriod.label})`}
      >
        <Clock className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
        <span className="font-semibold">{value || '09:00'}</span>
        <span className="text-[10px] text-zinc-500 font-sans">({currentPeriod.label})</span>
      </button>

      {isOpen && (
        <div
          data-no-pan="true"
          onWheel={e => e.stopPropagation()}
          className="absolute top-full mt-1.5 left-0 w-64 bg-[#18181b] border border-zinc-800 rounded-xl shadow-2xl p-2.5 z-50 space-y-2.5 text-xs animate-in fade-in zoom-in-95 duration-100 overscroll-contain"
        >
          {/* Cabeçalho do Seletor */}
          <div className="flex items-center justify-between text-[11px] font-semibold border-b border-zinc-800 pb-2">
            <span className="flex items-center gap-1.5 text-zinc-300">
              <Clock className="w-3.5 h-3.5 text-zinc-400" />
              <span>Horário de Execução</span>
            </span>
            <div className="flex items-center gap-1">
              <span className="font-mono text-white text-xs font-bold">{value}</span>
              <span className="text-[10px] text-zinc-400">({currentPeriod.label})</span>
            </div>
          </div>

          {/* Sugestão Inteligente se selecionou horário da madrugada */}
          {currentHour >= 1 && currentHour <= 11 && (
            <div className="bg-amber-950/40 border border-amber-800/50 rounded-lg p-2 text-[10.5px] text-amber-200 space-y-1">
              <div className="leading-tight">
                <strong>{value}</strong> é de madrugada. Quis dizer <strong>{String(currentHour + 12).padStart(2, '0')}:{String(currentMinute).padStart(2, '0')} ({currentHour}h da tarde)</strong>?
              </div>
              <button
                type="button"
                onClick={() => {
                  setHour(currentHour + 12)
                  setPeriodTab('pm')
                }}
                className="w-full py-1 rounded bg-amber-500/25 hover:bg-amber-500/40 text-amber-100 font-semibold cursor-pointer transition-colors text-center"
              >
                Mudar para {String(currentHour + 12).padStart(2, '0')}:{String(currentMinute).padStart(2, '0')} (Tarde)
              </button>
            </div>
          )}

          {/* Abas de Período: Tarde / Noite vs Manhã */}
          <div className="grid grid-cols-2 gap-1 bg-[#121215] p-1 rounded-lg border border-zinc-800/60">
            <button
              type="button"
              onClick={() => setPeriodTab('pm')}
              className={`flex items-center justify-center gap-1.5 py-1 px-2 rounded text-[10.5px] font-medium transition-colors cursor-pointer ${
                periodTab === 'pm'
                  ? 'bg-zinc-800 text-white font-semibold shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Moon className="w-3 h-3 text-amber-400" />
              <span>Tarde / Noite</span>
            </button>
            <button
              type="button"
              onClick={() => setPeriodTab('am')}
              className={`flex items-center justify-center gap-1.5 py-1 px-2 rounded text-[10.5px] font-medium transition-colors cursor-pointer ${
                periodTab === 'am'
                  ? 'bg-zinc-800 text-white font-semibold shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Sun className="w-3 h-3 text-amber-400" />
              <span>Manhã / Madr.</span>
            </button>
          </div>

          {/* Seletor de Hora e Minuto */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="text-[10px] text-zinc-500 block mb-1 font-medium">Hora</span>
              <div
                onWheel={e => e.stopPropagation()}
                className="max-h-36 overflow-y-auto space-y-0.5 custom-chat-scrollbar pr-1 overscroll-contain"
              >
                {activeHoursList.map(item => {
                  const isSel = item.h === currentHour
                  return (
                    <button
                      key={item.h}
                      type="button"
                      onClick={() => setHour(item.h)}
                      className={`w-full py-1 px-1.5 rounded text-left font-mono text-[11px] transition-colors cursor-pointer truncate ${
                        isSel
                          ? 'bg-zinc-800 text-white font-bold'
                          : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'
                      }`}
                    >
                      {item.text}
                    </button>
                  )
                })}
              </div>
            </div>

            <div>
              <span className="text-[10px] text-zinc-500 block mb-1 font-medium">Minuto</span>
              <div
                onWheel={e => e.stopPropagation()}
                className="max-h-36 overflow-y-auto space-y-0.5 custom-chat-scrollbar pr-1 overscroll-contain"
              >
                {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map(min => {
                  const isSel = min === currentMinute
                  return (
                    <button
                      key={min}
                      type="button"
                      onClick={() => setMinute(min)}
                      className={`w-full py-1 px-1.5 rounded text-left font-mono text-[11px] transition-colors cursor-pointer ${
                        isSel
                          ? 'bg-zinc-800 text-white font-bold'
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
            <div className="grid grid-cols-5 gap-1">
              {PRESET_TIMES.map(time => {
                const isSel = time === value
                return (
                  <button
                    key={time}
                    type="button"
                    onClick={() => {
                      onChange(time)
                      setIsOpen(false)
                    }}
                    className={`py-1 rounded text-[10px] font-mono cursor-pointer transition-colors text-center ${
                      isSel
                        ? 'bg-zinc-800 text-white font-bold'
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
