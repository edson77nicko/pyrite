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
  Info
} from 'lucide-react'

interface CustomDatePickerPopoverProps {
  value?: string // format: YYYY-MM-DD or YYYY-MM-DD HH:mm
  onChange: (value: string | undefined) => void
  onClose: () => void
  align?: 'left' | 'right'
  anchorEl?: HTMLElement | null
}

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
]

const MONTH_NAMES_EN = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']

function calculateCoords(el: HTMLElement | null, align: 'left' | 'right') {
  if (!el || typeof window === 'undefined') {
    return { top: 100, left: 100 }
  }

  const rect = el.getBoundingClientRect()
  const popoverWidth = 440
  const popoverHeight = 360

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
  onChange,
  onClose,
  align = 'right',
  anchorEl
}) => {
  const containerRef = useRef<HTMLDivElement>(null)

  // Calculate coordinates synchronously on mount to immediately spawn in the exact position
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

  // Parse initial date
  const parsed = useMemo(() => {
    if (!value) {
      const now = new Date()
      return {
        year: now.getFullYear(),
        month: now.getMonth(),
        day: now.getDate(),
        hasTime: false,
        time: '12:00'
      }
    }
    const [datePart, timePart] = value.split(' ')
    const [y, m, d] = (datePart || '').split('-').map(Number)
    const valid = !isNaN(y) && !isNaN(m) && !isNaN(d)
    const now = new Date()
    return {
      year: valid ? y : now.getFullYear(),
      month: valid ? m - 1 : now.getMonth(),
      day: valid ? d : now.getDate(),
      hasTime: Boolean(timePart),
      time: timePart || '12:00'
    }
  }, [value])

  const [selectedYear, setSelectedYear] = useState<number | null>(value ? parsed.year : null)
  const [selectedMonth, setSelectedMonth] = useState<number | null>(value ? parsed.month : null)
  const [selectedDay, setSelectedDay] = useState<number | null>(value ? parsed.day : null)

  const [viewYear, setViewYear] = useState<number>(parsed.year)
  const [viewMonth, setViewMonth] = useState<number>(parsed.month)

  const [includeTime, setIncludeTime] = useState<boolean>(parsed.hasTime)
  const [timeValue, setTimeValue] = useState<string>(parsed.time)
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

  // Days calculations
  const calendarDays = useMemo(() => {
    const firstDayIndex = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7
    const daysInCurrentMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
    const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate()

    const days: { day: number; isCurrent: boolean; monthOffset: number }[] = []

    for (let i = firstDayIndex - 1; i >= 0; i--) {
      days.push({ day: daysInPrevMonth - i, isCurrent: false, monthOffset: -1 })
    }

    for (let i = 1; i <= daysInCurrentMonth; i++) {
      days.push({ day: i, isCurrent: true, monthOffset: 0 })
    }

    const remaining = 42 - days.length
    for (let i = 1; i <= remaining; i++) {
      days.push({ day: i, isCurrent: false, monthOffset: 1 })
    }

    return days
  }, [viewYear, viewMonth])

  const handleSelectDay = (day: number, monthOffset: number) => {
    let targetMonth = viewMonth + monthOffset
    let targetYear = viewYear

    if (targetMonth < 0) {
      targetMonth = 11
      targetYear -= 1
    } else if (targetMonth > 11) {
      targetMonth = 0
      targetYear += 1
    }

    setSelectedYear(targetYear)
    setSelectedMonth(targetMonth)
    setSelectedDay(day)

    if (monthOffset !== 0) {
      setViewYear(targetYear)
      setViewMonth(targetMonth)
    }
  }

  const isSelected = (day: number, monthOffset: number) => {
    let targetMonth = viewMonth + monthOffset
    let targetYear = viewYear

    if (targetMonth < 0) {
      targetMonth = 11
      targetYear -= 1
    } else if (targetMonth > 11) {
      targetMonth = 0
      targetYear += 1
    }

    return selectedYear === targetYear && selectedMonth === targetMonth && selectedDay === day
  }

  const isToday = (day: number, monthOffset: number) => {
    const now = new Date()
    let targetMonth = viewMonth + monthOffset
    let targetYear = viewYear

    if (targetMonth < 0) {
      targetMonth = 11
      targetYear -= 1
    } else if (targetMonth > 11) {
      targetMonth = 0
      targetYear += 1
    }

    return (
      now.getFullYear() === targetYear &&
      now.getMonth() === targetMonth &&
      now.getDate() === day
    )
  }

  // Quick Preset Actions
  const setQuickDate = (daysFromNow: number) => {
    const d = new Date()
    d.setDate(d.getDate() + daysFromNow)
    setSelectedYear(d.getFullYear())
    setSelectedMonth(d.getMonth())
    setSelectedDay(d.getDate())
    setViewYear(d.getFullYear())
    setViewMonth(d.getMonth())
  }

  const handleSetToday = () => setQuickDate(0)
  const handleSetTomorrow = () => setQuickDate(1)
  const handleSetNextWeek = () => setQuickDate(7)
  const handleSetNextMonth = () => {
    const d = new Date()
    d.setMonth(d.getMonth() + 1)
    setSelectedYear(d.getFullYear())
    setSelectedMonth(d.getMonth())
    setSelectedDay(d.getDate())
    setViewYear(d.getFullYear())
    setViewMonth(d.getMonth())
  }

  const handleConfirm = () => {
    if (selectedYear === null || selectedMonth === null || selectedDay === null) {
      onChange(undefined)
      onClose()
      return
    }
    const yStr = String(selectedYear)
    const mStr = String(selectedMonth + 1).padStart(2, '0')
    const dStr = String(selectedDay).padStart(2, '0')
    let result = `${yStr}-${mStr}-${dStr}`
    if (includeTime && timeValue) {
      result += ` ${timeValue}`
    }
    onChange(result)
    onClose()
  }

  const handleRemove = () => {
    onChange(undefined)
    onClose()
  }

  // Formatted date string for top pill
  const formattedHeaderDate = useMemo(() => {
    if (selectedYear === null || selectedMonth === null || selectedDay === null) {
      return 'Selecionar data'
    }
    const monthEn = MONTH_NAMES_EN[selectedMonth] || 'October'
    return `${monthEn} ${selectedDay}, ${selectedYear}`
  }, [selectedYear, selectedMonth, selectedDay])

  const popoverContent = (
    <div
      ref={containerRef}
      data-popover-portal="true"
      className="fixed z-[99999] bg-[#121216] rounded-2xl shadow-md border border-zinc-800/80 p-4 text-xs select-none animate-in fade-in duration-75"
      style={{
        top: coords.top,
        left: coords.left,
        width: '440px'
      }}
    >
      <div className="flex gap-3.5">
        {/* Left Column: Calendar & Controls */}
        <div className="flex-1 flex flex-col space-y-3">
          {/* Top Date Display Pill - Sober depth, no white borders */}
          <div className="bg-[#191920] rounded-xl px-3 py-2 flex items-center justify-between text-zinc-100">
            <div className="flex items-center gap-2 font-medium">
              <CalendarIcon className="w-3.5 h-3.5 text-zinc-400" />
              <span>{formattedHeaderDate}</span>
            </div>
            <Info className="w-3.5 h-3.5 text-zinc-500" />
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

          {/* Days Grid */}
          <div className="grid grid-cols-7 gap-y-1 gap-x-0.5 text-center text-xs">
            {calendarDays.map((item, idx) => {
              const active = isSelected(item.day, item.monthOffset)
              const currentDayToday = isToday(item.day, item.monthOffset)

              return (
                <div key={idx} className="flex items-center justify-center">
                  <button
                    type="button"
                    onClick={() => handleSelectDay(item.day, item.monthOffset)}
                    className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors cursor-pointer text-xs ${
                      active
                        ? 'font-bold shadow-md'
                        : item.isCurrent
                        ? currentDayToday
                          ? 'text-zinc-100 font-bold bg-[#1e1e28]'
                          : 'text-zinc-200 hover:bg-[#1c1c24] font-normal'
                        : 'text-zinc-600 hover:text-zinc-400 font-normal'
                    }`}
                    style={
                      active
                        ? {
                            backgroundColor: 'var(--accent, #ffffff)',
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

        {/* Right Column: Presets & Controls - Elegant dark surface without harsh vertical line */}
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
                style={includeTime ? { backgroundColor: 'var(--accent, #ffffff)' } : undefined}
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
                style={isRepeat ? { backgroundColor: 'var(--accent, #ffffff)' } : undefined}
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

      {/* Footer Actions: Cancel & Confirm */}
      <div className="flex items-center justify-end gap-2 pt-3 mt-1">
        <button
          type="button"
          onClick={onClose}
          className="px-3.5 py-1.5 rounded-xl text-zinc-400 hover:text-zinc-200 hover:bg-[#1a1a22] transition-colors cursor-pointer text-xs font-medium"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          className="px-4 py-1.5 rounded-xl font-semibold transition-all cursor-pointer shadow-md text-xs"
          style={{
            backgroundColor: 'var(--accent, #ffffff)',
            color: '#09090b'
          }}
        >
          Confirmar
        </button>
      </div>
    </div>
  )

  return typeof document !== 'undefined' ? createPortal(popoverContent, document.body) : null
}

export default CustomDatePickerPopover
