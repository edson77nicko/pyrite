import React, { useState, useRef, useEffect, useMemo } from 'react'
import { ChevronDown, Check, Search, X } from 'lucide-react'

export interface CustomSelectOption<T extends string = string> {
  value: T
  label: string
  sublabel?: string
  icon?: React.ReactNode
  color?: string
}

export interface CustomSelectProps<T extends string = string> {
  value: T
  options: CustomSelectOption<T>[]
  onChange: (value: T) => void
  placeholder?: string
  icon?: React.ReactNode
  className?: string
  buttonClassName?: string
  dropdownClassName?: string
  size?: 'xs' | 'sm' | 'md'
  disabled?: boolean
  searchable?: boolean
  dropDirection?: 'down' | 'up' | 'auto'
}

export function CustomSelect<T extends string = string>({
  value,
  options,
  onChange,
  placeholder = 'Selecionar...',
  icon,
  className = '',
  buttonClassName = '',
  dropdownClassName = '',
  size = 'sm',
  disabled = false,
  searchable = false,
  dropDirection = 'auto'
}: CustomSelectProps<T>) {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [openUpwards, setOpenUpwards] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const selectedOption = useMemo(
    () => options.find(o => o.value === value),
    [options, value]
  )

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
        setSearch('')
      }
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false)
        setSearch('')
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      window.addEventListener('keydown', handleKeyDown)
      if (searchable) {
        setTimeout(() => searchInputRef.current?.focus(), 50)
      }
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, searchable])

  const handleToggle = () => {
    if (disabled) return
    if (!isOpen && containerRef.current && dropDirection === 'auto') {
      const rect = containerRef.current.getBoundingClientRect()
      const spaceBelow = window.innerHeight - rect.bottom
      setOpenUpwards(spaceBelow < 220 && rect.top > 220)
    } else if (dropDirection === 'up') {
      setOpenUpwards(true)
    } else {
      setOpenUpwards(false)
    }
    setIsOpen(prev => !prev)
    setSearch('')
  }

  const filteredOptions = useMemo(() => {
    if (!search.trim()) return options
    const q = search.toLowerCase()
    return options.filter(
      o => o.label.toLowerCase().includes(q) || (o.sublabel && o.sublabel.toLowerCase().includes(q))
    )
  }, [options, search])

  const isXs = size === 'xs'
  const isSm = size === 'sm'

  return (
    <div
      ref={containerRef}
      data-no-pan="true"
      className={`relative inline-block text-left ${className}`}
      onPointerDown={e => e.stopPropagation()}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={handleToggle}
        className={`w-full flex items-center justify-between gap-1.5 rounded-xl border transition-all cursor-pointer select-none ${
          disabled
            ? 'opacity-50 cursor-not-allowed bg-zinc-900 border-zinc-800 text-zinc-500'
            : isOpen
            ? 'bg-[#1c1c1f] border-zinc-700 text-zinc-100 shadow-xs'
            : 'bg-[#18181b] hover:bg-[#1c1c1f] border-zinc-800/90 hover:border-zinc-700 text-zinc-200'
        } ${
          isXs
            ? 'px-2 py-1 text-[11px]'
            : isSm
            ? 'px-2.5 py-1.5 text-xs'
            : 'px-3 py-2 text-xs'
        } ${buttonClassName}`}
      >
        <div className="flex items-center gap-1.5 min-w-0 truncate">
          {selectedOption?.icon || icon}
          {selectedOption?.color && (
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: selectedOption.color }}
            />
          )}
          <span className="truncate font-medium">
            {selectedOption ? selectedOption.label : placeholder}
          </span>
        </div>
        <ChevronDown
          className={`w-3.5 h-3.5 text-zinc-500 shrink-0 transition-transform duration-150 ${
            isOpen ? 'rotate-180 text-zinc-300' : ''
          }`}
        />
      </button>

      {isOpen && (
        <div
          data-no-pan="true"
          className={`absolute ${
            openUpwards ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
          } left-0 w-full min-w-[170px] max-w-xs bg-[#18181b] border border-zinc-800 rounded-xl shadow-2xl p-1 z-50 flex flex-col text-xs animate-in fade-in zoom-in-95 duration-100 ${dropdownClassName}`}
          style={{ maxHeight: 260 }}
        >
          {(searchable || options.length > 7) && (
            <div className="p-1 border-b border-zinc-800/80 mb-1 flex items-center gap-1.5">
              <Search className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
              <input
                ref={searchInputRef}
                type="text"
                autoComplete="off"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar..."
                className="w-full bg-transparent text-[11px] text-zinc-200 placeholder-zinc-500 focus:outline-none"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="text-zinc-500 hover:text-zinc-300 cursor-pointer p-0.5"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          )}

          <div className="overflow-y-auto space-y-0.5 custom-chat-scrollbar max-h-52 pr-0.5">
            {filteredOptions.length === 0 ? (
              <div className="text-[11px] text-zinc-500 py-2 text-center">
                Nenhum resultado
              </div>
            ) : (
              filteredOptions.map(opt => {
                const isSelected = opt.value === value
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      onChange(opt.value)
                      setIsOpen(false)
                      setSearch('')
                    }}
                    className={`w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg text-left transition-colors cursor-pointer text-xs ${
                      isSelected
                        ? 'bg-zinc-800 text-white font-medium shadow-xs'
                        : 'text-zinc-300 hover:bg-zinc-800/60 hover:text-zinc-100'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0 truncate">
                      {opt.icon}
                      {opt.color && (
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: opt.color }}
                        />
                      )}
                      <div className="min-w-0 truncate">
                        <div className="truncate">{opt.label}</div>
                        {opt.sublabel && (
                          <div className="text-[10px] text-zinc-500 truncate">{opt.sublabel}</div>
                        )}
                      </div>
                    </div>
                    {isSelected && (
                      <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 ml-1" />
                    )}
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
