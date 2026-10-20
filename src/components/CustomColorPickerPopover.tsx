import React, { useState, useEffect, useRef } from 'react'
import { Check } from 'lucide-react'

interface CustomColorPickerPopoverProps {
  currentColor: string
  onChange: (color: string) => void
  onClose: () => void
  align?: 'left' | 'right'
}

const PALETTE_SWATCHES = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308',
  '#10b981', '#06b6d4', '#3b82f6', '#8b5cf6',
  '#d946ef', '#ec4899', '#f43f5e', '#64748b'
]

export const CustomColorPickerPopover: React.FC<CustomColorPickerPopoverProps> = ({
  currentColor,
  onChange,
  onClose,
  align = 'right'
}) => {
  const [hexInput, setHexInput] = useState(currentColor.toUpperCase())
  const popoverRef = useRef<HTMLDivElement>(null)
  const nativeColorRef = useRef<HTMLInputElement>(null)

  // Sync internal state if currentColor changes
  useEffect(() => {
    setHexInput(currentColor.toUpperCase())
  }, [currentColor])

  // Close on outside click or Escape
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleOutsideClick)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  const handleHexChange = (val: string) => {
    let clean = val.trim()
    if (!clean.startsWith('#')) clean = '#' + clean
    setHexInput(clean.toUpperCase())
    if (/^#[0-9A-Fa-f]{6}$/.test(clean)) {
      onChange(clean)
    }
  }

  const handleSwatchClick = (c: string) => {
    setHexInput(c.toUpperCase())
    onChange(c)
  }

  return (
    <div
      ref={popoverRef}
      onClick={e => e.stopPropagation()}
      className={`absolute z-50 top-full mt-1.5 ${
        align === 'left' ? 'left-0' : 'right-0'
      } w-48 bg-[#121216] border border-zinc-800 rounded-xl shadow-lg p-2.5 space-y-2.5 text-xs text-zinc-200 select-none animate-in fade-in zoom-in-95 duration-100`}
    >
      {/* 1. Quick Swatches Grid */}
      <div className="grid grid-cols-6 gap-1.5">
        {PALETTE_SWATCHES.map(color => {
          const isSelected = currentColor.toLowerCase() === color.toLowerCase()
          return (
            <button
              type="button"
              key={color}
              onClick={() => handleSwatchClick(color)}
              className="w-5 h-5 rounded-full flex items-center justify-center transition-transform hover:scale-115 cursor-pointer relative"
              style={{ backgroundColor: color }}
              title={color}
            >
              {isSelected && <Check className="w-3 h-3 text-white drop-shadow-xs stroke-[3]" />}
            </button>
          )
        })}
      </div>

      {/* 2. Custom Hex Input + Native Spectrum Opener */}
      <div className="flex items-center gap-1.5 pt-1 border-t border-zinc-800/80">
        <button
          type="button"
          onClick={() => nativeColorRef.current?.click()}
          className="w-6 h-6 rounded-lg shrink-0 border border-zinc-750/80 cursor-pointer overflow-hidden transition-transform hover:scale-105 shadow-xs relative"
          style={{ backgroundColor: currentColor }}
          title="Abrir espectro de cores"
        >
          <input
            ref={nativeColorRef}
            type="color"
            value={currentColor}
            onChange={e => {
              handleHexChange(e.target.value)
            }}
            className="absolute -top-4 -left-4 w-12 h-12 opacity-0 cursor-pointer pointer-events-none"
          />
        </button>

        <input
          type="text"
          value={hexInput}
          maxLength={7}
          onChange={e => handleHexChange(e.target.value)}
          placeholder="#RRGGBB"
          className="flex-1 bg-[#181820] border border-zinc-800 rounded-lg px-2 py-1 font-mono text-[11px] text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-700 uppercase"
        />
      </div>
    </div>
  )
}

export default CustomColorPickerPopover
