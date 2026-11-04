import React, { useState, useMemo, useRef, useLayoutEffect, useEffect } from 'react'
import { createPortal } from 'react-dom'
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Clock,
  Repeat,
  Trash2,
  X
} from 'lucide-react'

export interface CustomDatePickerPopoverProps {
  value?: string // format: YYYY-MM-DD or YYYY-MM-DD HH:mm (Start date or single date)
  endDate?: string // format: YYYY-MM-DD or YYYY-MM-DD HH:mm (End date for range)
  onChange?: (value: string | undefined) => void
  onRangeChange?: (startDate: string | undefined, endDate: string | undefined) => void
  onClose: () => void
  align?: 'left' | 'right'
  anchorEl?: HTMLElement | null
  isRange?: boolean
}

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
]

const WEEKDAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']

function pad(n: number) {
  return String(n).padStart(2, '0')
}

function formatDateStr(y: number, m: number, d: number) {
  return `${String(y).padStart(4, '0')}-${pad(m + 1)}-${pad(d)}`
}

function parseDatePart(val?: string) {
  if (!val) return null
  const [datePart, timePart] = val.split(' ')
  const [y, m, d] = (datePart || '').split('-').map(Number)
  if (isNaN(y) || isNaN(m) || isNaN(d)) return null
  return {
    year: y,
    month: m - 1,
    day: d,
    dateStr: formatDateStr(y, m - 1, d),
    hasTime: Boolean(timePart),
    time: timePart || '12:00'
  }
}

function calculateCoords(el: HTMLElement | null, align: 'left' | 'right') {
  if (!el || typeof window === 'undefined') {
    return { top: 100, left: 100 }
  }

  const rect = el.getBoundingClientRect()
  const popoverWidth = 440
  const popoverHeight = 350

  let left = align === 'right' ? rect.right - popoverWidth : rect.left
  if (left + popoverWidth > window.innerWidth - 16) {
    left = window.innerWidth - popoverWidth - 16
  }
  if (left < 16) {
    left = 16
  }

  let top = rect.bottom + 6
  if (top + popoverHeight > window.innerHeight - 16) {
    top = Math.max(16, rect.top - popoverHeight - 6)
  }

  return { top, left }
}

export const CustomDatePickerPopover: React.FC<CustomDatePickerPopoverProps> = ({
  value,
  endDate,
  onChange,
  onRangeChange,
  onClose,
  align = 'right',
  anchorEl,
  isRange = true
}) => {
  const containerRef = useRef<HTMLDivElement>(null)

  // Calculate coordinates synchronously on mount
  const [coords, setCoords] = useState(() => calculateCoords(anchorEl || null, align))

  useLayoutEffect(() => {
    if (anchorEl) {
      setCoords(calculateCoords(anchorEl, align))
    }
  }, [anchorEl, align])

  useEffect(() => {
    const el = anchorEl || containerRef.current?.parentElement
    if (!el) return

    const updatePosition = () => {
      const newCoords = calculateCoords(el, align)
      setCoords(newCoords)
    }

    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [anchorEl, align])

  // Parse initial dates
  const initialStart = useMemo(() => parseDatePart(value), [value])
  const initialEnd = useMemo(() => parseDatePart(endDate), [endDate])

  const [rangeStart, setRangeStart] = useState<string | null>(initialStart ? initialStart.dateStr : null)
  const [rangeEnd, setRangeEnd] = useState<string | null>(initialEnd ? initialEnd.dateStr : null)
  const [isSelectingEnd, setIsSelectingEnd] = useState<boolean>(false)
  const [hoverDate, setHoverDate] = useState<string | null>(null)

  // Calendar View month/year
  const [viewYear, setViewYear] = useState<number>(() => {
    if (initialStart) return initialStart.year
    if (initialEnd) return initialEnd.year
    return new Date().getFullYear()
  })

  const [viewMonth, setViewMonth] = useState<number>(() => {
    if (initialStart) return initialStart.month
    if (initialEnd) return initialEnd.month
    return new Date().getMonth()
  })

  const [includeTime, setIncludeTime] = useState<boolean>(Boolean(initialStart?.hasTime))
  const [timeValue, setTimeValue] = useState<string>(initialStart?.time || '12:00')
  const [isRepeat, setIsRepeat] = useState<boolean>(false)

  const [showMonthSelect, setShowMonthSelect] = useState(false)
  const [showYearSelect, setShowYearSelect] = useState(false)

  // Outside click listener to close popover
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null
      if (containerRef.current && !containerRef.current.contains(target)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleOutsideClick)
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick)
    }
  }, [onClose])

  // Month navigation
  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11)
      setViewYear(y => y - 1)
    } else {
      setViewMonth(m => m - 1)
    }
  }

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0)
      setViewYear(y => y + 1)
    } else {
      setViewMonth(m => m + 1)
    }
  }

  // Days calculations (42 slots: previous month tail + current month + next month lead)
  const calendarDays = useMemo(() => {
    const firstDayIndex = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7
    const daysInCurrentMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
    const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate()

    const days: { day: number; isCurrent: boolean; monthOffset: number; dateStr: string }[] = []

    // Previous month tail
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const d = daysInPrevMonth - i
      let m = viewMonth - 1
      let y = viewYear
      if (m < 0) {
        m = 11
        y -= 1
      }
      days.push({ day: d, isCurrent: false, monthOffset: -1, dateStr: formatDateStr(y, m, d) })
    }

    // Current month
    for (let i = 1; i <= daysInCurrentMonth; i++) {
      days.push({ day: i, isCurrent: true, monthOffset: 0, dateStr: formatDateStr(viewYear, viewMonth, i) })
    }

    // Next month lead
    const remaining = 42 - days.length
    for (let i = 1; i <= remaining; i++) {
      let m = viewMonth + 1
      let y = viewYear
      if (m > 11) {
        m = 0
        y += 1
      }
      days.push({ day: i, isCurrent: false, monthOffset: 1, dateStr: formatDateStr(y, m, i) })
    }

    return days
  }, [viewYear, viewMonth])

  // Effective display range (considering hover during step 2)
  const { displayStart, displayEnd } = useMemo(() => {
    if (isSelectingEnd && rangeStart && hoverDate) {
      if (rangeStart <= hoverDate) {
        return { displayStart: rangeStart, displayEnd: hoverDate }
      } else {
        return { displayStart: hoverDate, displayEnd: rangeStart }
      }
    }
    if (rangeStart && rangeEnd) {
      if (rangeStart <= rangeEnd) {
        return { displayStart: rangeStart, displayEnd: rangeEnd }
      } else {
        return { displayStart: rangeEnd, displayEnd: rangeStart }
      }
    }
    if (rangeStart) {
      return { displayStart: rangeStart, displayEnd: null }
    }
    return { displayStart: null, displayEnd: null }
  }, [rangeStart, rangeEnd, isSelectingEnd, hoverDate])

  // Select day handler - Immediate definition, no confirmation button required!
  const handleSelectDay = (clickedDateStr: string, monthOffset: number) => {
    // If clicking a day from another month, sync the view month
    if (monthOffset !== 0) {
      let targetMonth = viewMonth + monthOffset
      let targetYear = viewYear
      if (targetMonth < 0) {
        targetMonth = 11
        targetYear -= 1
      } else if (targetMonth > 11) {
        targetMonth = 0
        targetYear += 1
      }
      setViewMonth(targetMonth)
      setViewYear(targetYear)
    }

    // Mode: Single Date (isRange === false)
    if (!isRange) {
      const fullVal = includeTime && timeValue ? `${clickedDateStr} ${timeValue}` : clickedDateStr
      onChange?.(fullVal)
      onClose()
      return
    }

    // Mode: Range (1st click defines start immediately; 2nd click defines end & finishes)
    if (!isSelectingEnd || !rangeStart) {
      // 1st click: Set start date immediately!
      const startVal = includeTime && timeValue ? `${clickedDateStr} ${timeValue}` : clickedDateStr
      setRangeStart(clickedDateStr)
      setRangeEnd(null)
      setIsSelectingEnd(true)

      // Immediately define start date in parent
      if (onRangeChange) {
        onRangeChange(startVal, undefined)
      }
      if (onChange) {
        onChange(startVal)
      }
    } else {
      // 2nd click: Set end date, order correctly, define immediately and close!
      let finalStart = rangeStart
      let finalEnd = clickedDateStr

      if (clickedDateStr < rangeStart) {
        finalStart = clickedDateStr
        finalEnd = rangeStart
      }

      const startVal = includeTime && timeValue ? `${finalStart} ${timeValue}` : finalStart
      const endVal = finalEnd

      setRangeStart(finalStart)
      setRangeEnd(finalEnd)
      setIsSelectingEnd(false)
      setHoverDate(null)

      if (onRangeChange) {
        onRangeChange(startVal, endVal)
      }
      if (onChange) {
        onChange(startVal)
      }

      // Range selection is complete, close popover immediately
      onClose()
    }
  }

  // Quick Presets - Define immediately and close
  const applyPreset = (startDateStr: string, endDateStr?: string) => {
    const sVal = includeTime && timeValue ? `${startDateStr} ${timeValue}` : startDateStr
    const eVal = endDateStr || undefined

    setRangeStart(startDateStr)
    setRangeEnd(endDateStr || null)
    setIsSelectingEnd(false)
    setHoverDate(null)

    if (onRangeChange) {
      onRangeChange(sVal, eVal)
    }
    if (onChange) {
      onChange(sVal)
    }
    onClose()
  }

  const handleSetToday = () => {
    const now = new Date()
    const dStr = formatDateStr(now.getFullYear(), now.getMonth(), now.getDate())
    applyPreset(dStr, dStr)
  }

  const handleSetTomorrow = () => {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    const dStr = formatDateStr(d.getFullYear(), d.getMonth(), d.getDate())
    applyPreset(dStr, dStr)
  }

  const handleSetNextWeek = () => {
    const now = new Date()
    const nextW = new Date()
    nextW.setDate(now.getDate() + 7)
    const startStr = formatDateStr(now.getFullYear(), now.getMonth(), now.getDate())
    const endStr = formatDateStr(nextW.getFullYear(), nextW.getMonth(), nextW.getDate())
    applyPreset(startStr, endStr)
  }

  const handleSetNextMonth = () => {
    const now = new Date()
    const nextM = new Date()
    nextM.setMonth(now.getMonth() + 1)
    const startStr = formatDateStr(now.getFullYear(), now.getMonth(), now.getDate())
    const endStr = formatDateStr(nextM.getFullYear(), nextM.getMonth(), nextM.getDate())
    applyPreset(startStr, endStr)
  }

  const handleRemove = () => {
    setRangeStart(null)
    setRangeEnd(null)
    setIsSelectingEnd(false)
    setHoverDate(null)
    if (onRangeChange) {
      onRangeChange(undefined, undefined)
    }
    if (onChange) {
      onChange(undefined)
    }
    onClose()
  }

  // Header display string in Brazilian format
  const headerLabel = useMemo(() => {
    if (displayStart && displayEnd && displayStart !== displayEnd) {
      const [sy, sm, sd] = displayStart.split('-')
      const [ey, em, ed] = displayEnd.split('-')
      if (sy === ey) {
        return `${sd}/${sm} → ${ed}/${em}/${ey}`
      }
      return `${sd}/${sm}/${sy} → ${ed}/${em}/${ey}`
    }
    if (displayStart) {
      const [sy, sm, sd] = displayStart.split('-')
      if (isSelectingEnd) {
        return `${sd}/${sm}/${sy} → selecione o término`
      }
      return `${sd}/${sm}/${sy}`
    }
    return 'Selecionar período'
  }, [displayStart, displayEnd, isSelectingEnd])

  const rangeDayCount = useMemo(() => {
    if (!displayStart || !displayEnd || displayStart === displayEnd) return null
    const msStart = new Date(displayStart).getTime()
    const msEnd = new Date(displayEnd).getTime()
    const days = Math.round(Math.abs(msEnd - msStart) / (1000 * 60 * 60 * 24)) + 1
    return days
  }, [displayStart, displayEnd])

  const todayStr = useMemo(() => {
    const now = new Date()
    return formatDateStr(now.getFullYear(), now.getMonth(), now.getDate())
  }, [])

  const popoverContent = (
    <div
      ref={containerRef}
      data-popover-portal="true"
      className="custom-datepicker-popover fixed z-[99999] bg-[#121216] rounded-2xl shadow-xl border border-zinc-800/80 p-4 text-xs select-none animate-in fade-in duration-75"
      style={{
        top: coords.top,
        left: coords.left,
        width: '450px'
      }}
    >
      <div className="flex gap-3.5">
        {/* Left Column: Calendar & Range Grid */}
        <div className="flex-1 flex flex-col space-y-2.5">
          {/* Top Date Display Pill */}
          <div className="bg-[#191920] rounded-xl px-3 py-2 flex items-center justify-between text-zinc-100">
            <div className="flex items-center gap-2 font-medium">
              <CalendarIcon className="w-3.5 h-3.5 text-zinc-400" />
              <span className="text-xs truncate">{headerLabel}</span>
            </div>
            {rangeDayCount && (
              <span
                className="text-[10px] px-2 py-0.5 rounded font-medium shrink-0 ml-2"
                style={{
                  backgroundColor: 'var(--accent-glow-subtle, rgba(197, 155, 39, 0.15))',
                  color: 'var(--accent, #c59b27)'
                }}
              >
                {rangeDayCount} {rangeDayCount === 1 ? 'dia' : 'dias'}
              </span>
            )}
          </div>

          {/* Month & Year Selectors with Chevrons */}
          <div className="flex items-center justify-between px-1">
            <button
              type="button"
              onClick={handlePrevMonth}
              className="p-1 hover:bg-[#1c1c24] text-zinc-400 hover:text-zinc-200 rounded-lg transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-2">
              {/* Month Dropdown Button */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowMonthSelect(o => !o)}
                  className="flex items-center gap-1 font-semibold text-zinc-200 hover:text-white px-2 py-1 rounded-md hover:bg-[#1c1c24] transition-colors cursor-pointer"
                >
                  <span>{MONTH_NAMES[viewMonth]}</span>
                  <ChevronDown className="w-3 h-3 text-zinc-400" />
                </button>
                {showMonthSelect && (
                  <div className="absolute top-full left-0 mt-1 bg-[#181820] rounded-xl shadow-lg p-1 z-30 grid grid-cols-3 gap-1 w-52 max-h-48 overflow-y-auto custom-chat-scrollbar border border-zinc-800">
                    {MONTH_NAMES.map((name, idx) => (
                      <button
                        type="button"
                        key={name}
                        onClick={() => {
                          setViewMonth(idx)
                          setShowMonthSelect(false)
                        }}
                        className={`px-2 py-1.5 text-[11px] rounded-lg text-left transition-colors cursor-pointer ${
                          viewMonth === idx ? 'bg-zinc-700 text-white font-medium' : 'text-zinc-300 hover:bg-zinc-800'
                        }`}
                      >
                        {name.slice(0, 3)}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Year Dropdown Button */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowYearSelect(o => !o)}
                  className="flex items-center gap-1 font-semibold text-zinc-200 hover:text-white px-2 py-1 rounded-md hover:bg-[#1c1c24] transition-colors cursor-pointer"
                >
                  <span>{viewYear}</span>
                  <ChevronDown className="w-3 h-3 text-zinc-400" />
                </button>
                {showYearSelect && (
                  <div className="absolute top-full left-0 mt-1 bg-[#181820] rounded-xl shadow-lg p-1 z-30 w-24 max-h-48 overflow-y-auto custom-chat-scrollbar border border-zinc-800">
                    {Array.from({ length: 20 }, (_, i) => viewYear - 10 + i).map(y => (
                      <button
                        type="button"
                        key={y}
                        onClick={() => {
                          setViewYear(y)
                          setShowYearSelect(false)
                        }}
                        className={`w-full px-2 py-1 text-[11px] rounded-lg text-left transition-colors cursor-pointer ${
                          viewYear === y ? 'bg-zinc-700 text-white font-medium' : 'text-zinc-300 hover:bg-zinc-800'
                        }`}
                      >
                        {y}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={handleNextMonth}
              className="p-1 hover:bg-[#1c1c24] text-zinc-400 hover:text-zinc-200 rounded-lg transition-colors cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Weekday Labels */}
          <div className="grid grid-cols-7 text-center text-[10px] text-zinc-500 font-semibold uppercase tracking-wider">
            {WEEKDAYS.map(w => (
              <div key={w} className="py-1">
                {w}
              </div>
            ))}
          </div>

          {/* Days Grid with Range Ribbon Connectors */}
          <div
            className="grid grid-cols-7 gap-y-1 text-center text-xs"
            onMouseLeave={() => setHoverDate(null)}
          >
            {calendarDays.map((item, idx) => {
              const dStr = item.dateStr
              const isStart = Boolean(displayStart && dStr === displayStart)
              const isEnd = Boolean(displayEnd && dStr === displayEnd)
              const isSameDayRange = isStart && isEnd
              const isInRange = Boolean(displayStart && displayEnd && dStr > displayStart && dStr < displayEnd)
              const currentDayToday = dStr === todayStr
              const isMonday = idx % 7 === 0
              const isSunday = idx % 7 === 6

              return (
                <div
                  key={idx}
                  className="relative flex items-center justify-center h-8"
                  onMouseEnter={() => {
                    if (isSelectingEnd) {
                      setHoverDate(dStr)
                    }
                  }}
                >
                  {/* Range Connector Ribbons */}
                  {displayStart && displayEnd && displayStart !== displayEnd && (
                    <>
                      {/* Fully in-range ribbon connecting the middle */}
                      {isInRange && (
                        <div
                          className={`absolute inset-y-1 inset-x-0 bg-[var(--accent,#c59b27)]/20 z-0 ${
                            isMonday ? 'rounded-l-md' : ''
                          } ${isSunday ? 'rounded-r-md' : ''}`}
                        />
                      )}

                      {/* Right ribbon for start date */}
                      {isStart && !isSameDayRange && !isSunday && (
                        <div className="absolute inset-y-1 right-0 left-1/2 bg-[var(--accent,#c59b27)]/20 z-0" />
                      )}

                      {/* Left ribbon for end date */}
                      {isEnd && !isSameDayRange && !isMonday && (
                        <div className="absolute inset-y-1 left-0 right-1/2 bg-[var(--accent,#c59b27)]/20 z-0" />
                      )}
                    </>
                  )}

                  {/* Day Button */}
                  <button
                    type="button"
                    onClick={() => handleSelectDay(dStr, item.monthOffset)}
                    className={`relative z-10 w-8 h-8 rounded-xl flex items-center justify-center transition-all cursor-pointer text-xs ${
                      isStart || isEnd
                        ? 'font-bold shadow-md'
                        : isInRange
                        ? 'text-zinc-100 font-semibold'
                        : item.isCurrent
                        ? currentDayToday
                          ? 'text-zinc-100 font-bold bg-[#1e1e28]'
                          : 'text-zinc-200 hover:bg-[#1c1c24] font-normal'
                        : 'text-zinc-600 hover:text-zinc-400 font-normal'
                    }`}
                    style={
                      isStart || isEnd
                        ? {
                            backgroundColor: 'var(--accent, #c59b27)',
                            color: '#09090b'
                          }
                        : undefined
                    }
                  >
                    {item.day}
                  </button>
                </div>
              )
            })}
          </div>
        </div>

        {/* Right Column: Presets & Controls */}
        <div className="w-40 bg-[#16161c] rounded-xl p-3 flex flex-col justify-between space-y-3">
          {/* Presets List */}
          <div className="space-y-1">
            <button
              type="button"
              onClick={handleSetToday}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-[#1e1e27] hover:bg-[#252532] text-zinc-100 font-medium transition-colors text-left cursor-pointer"
            >
              <CalendarIcon className="w-3.5 h-3.5 text-zinc-400" />
              <span>Hoje</span>
            </button>
            <button
              type="button"
              onClick={handleSetTomorrow}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-[#1f1f28] text-zinc-300 transition-colors text-left cursor-pointer"
            >
              <span className="text-zinc-500 font-mono text-[11px]">&gt;</span>
              <span>Amanhã</span>
            </button>
            <button
              type="button"
              onClick={handleSetNextWeek}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-[#1f1f28] text-zinc-300 transition-colors text-left cursor-pointer"
            >
              <span className="text-zinc-500 font-mono text-[11px]">&gt;&gt;</span>
              <span>Próxima semana</span>
            </button>
            <button
              type="button"
              onClick={handleSetNextMonth}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-[#1f1f28] text-zinc-300 transition-colors text-left cursor-pointer"
            >
              <span className="text-zinc-500 font-mono text-[11px]">&#8630;</span>
              <span>Próximo mês</span>
            </button>
          </div>

          {/* Toggles (Include Time & Repeat) */}
          <div className="space-y-2 pt-1 bg-[#121217] p-2 rounded-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-zinc-300 text-[11px]">
                <Clock className="w-3.5 h-3.5 text-zinc-400" />
                <span>Incluir Hora</span>
              </div>
              <button
                type="button"
                onClick={() => setIncludeTime(o => !o)}
                className={`w-7 h-4 rounded-full p-0.5 transition-colors cursor-pointer flex items-center ${
                  includeTime ? 'bg-zinc-200 justify-end' : 'bg-zinc-800 justify-start'
                }`}
                style={includeTime ? { backgroundColor: 'var(--accent, #c59b27)' } : undefined}
              >
                <span className="w-3 h-3 rounded-full bg-zinc-950 block shadow-xs" />
              </button>
            </div>

            {includeTime && (
              <div className="pt-1">
                <input
                  type="time"
                  value={timeValue}
                  onChange={e => setTimeValue(e.target.value)}
                  className="w-full bg-[#18181e] rounded-lg px-2 py-1 text-zinc-200 text-xs focus:outline-none border-0"
                />
              </div>
            )}

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-zinc-300 text-[11px]">
                <Repeat className="w-3.5 h-3.5 text-zinc-400" />
                <span>Repetir</span>
              </div>
              <button
                type="button"
                onClick={() => setIsRepeat(o => !o)}
                className={`w-7 h-4 rounded-full p-0.5 transition-colors cursor-pointer flex items-center ${
                  isRepeat ? 'bg-zinc-200 justify-end' : 'bg-zinc-800 justify-start'
                }`}
                style={isRepeat ? { backgroundColor: 'var(--accent, #c59b27)' } : undefined}
              >
                <span className="w-3 h-3 rounded-full bg-zinc-950 block shadow-xs" />
              </button>
            </div>
          </div>

          {/* Remove / Clear Button */}
          <div className="pt-1">
            <button
              type="button"
              onClick={handleRemove}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-rose-500/10 text-zinc-400 hover:text-rose-400 transition-colors text-left cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Remover</span>
            </button>
          </div>
        </div>
      </div>

      {/* Footer Status Bar: Informative, minimal, no confirmation button needed */}
      <div className="flex items-center justify-between pt-2.5 mt-2 border-t border-zinc-800/40 text-[11px] text-zinc-400">
        <span className="text-zinc-500">
          {isSelectingEnd
            ? 'Clique na 2ª data para definir o término'
            : 'Clique para definir início, ou selecione intervalo'}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="flex items-center gap-1 px-2.5 py-1 rounded-lg hover:bg-[#1a1a22] text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer text-xs"
        >
          <X className="w-3 h-3" />
          <span>Fechar</span>
        </button>
      </div>
    </div>
  )

  return typeof document !== 'undefined' ? createPortal(popoverContent, document.body) : null
}

export default CustomDatePickerPopover
