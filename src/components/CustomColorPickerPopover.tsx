import React, { useState, useEffect, useRef, useLayoutEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'

interface CustomColorPickerPopoverProps {
  currentColor: string
  onChange: (color: string) => void
  onClose: () => void
  anchorEl: HTMLElement | null
  align?: 'left' | 'right' | 'center'
}

// Convert Hex to HSV
function hexToHsv(hex: string): { h: number; s: number; v: number } {
  let clean = hex.replace('#', '').trim()
  if (clean.length === 3) {
    clean = clean.split('').map(c => c + c).join('')
  }
  if (!/^[0-9A-Fa-f]{6}$/.test(clean)) {
    return { h: 210, s: 0.8, v: 0.9 }
  }

  const r = parseInt(clean.slice(0, 2), 16) / 255
  const g = parseInt(clean.slice(2, 4), 16) / 255
  const b = parseInt(clean.slice(4, 6), 16) / 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min

  let h = 0
  const s = max === 0 ? 0 : d / max
  const v = max

  if (max !== min) {
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break
      case g: h = (b - r) / d + 2; break
      case b: h = (r - g) / d + 4; break
    }
    h = h / 6
  }

  return { h: Math.round(h * 360), s, v }
}

// Convert HSV to Hex
function hsvToHex(h: number, s: number, v: number): string {
  let r = 0, g = 0, b = 0
  const i = Math.floor((h / 60) % 6)
  const f = (h / 60) - Math.floor(h / 60)
  const p = v * (1 - s)
  const q = v * (1 - f * s)
  const t = v * (1 - (1 - f) * s)

  switch (i) {
    case 0: r = v; g = t; b = p; break
    case 1: r = q; g = v; b = p; break
    case 2: r = p; g = v; b = t; break
    case 3: r = p; g = q; b = v; break
    case 4: r = t; g = p; b = v; break
    case 5: r = v; g = p; b = q; break
  }

  const toHex = (n: number) => Math.round(Math.max(0, Math.min(1, n)) * 255).toString(16).padStart(2, '0').toUpperCase()
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

function calculateCoords(el: HTMLElement | null, align: 'left' | 'right' | 'center') {
  if (!el || typeof window === 'undefined') {
    return { top: 120, left: 120 }
  }

  const rect = el.getBoundingClientRect()
  const popoverWidth = 230
  const popoverHeight = 210

  // Horizontal position
  let left = rect.left
  if (align === 'right') {
    left = rect.right - popoverWidth
  } else if (align === 'center') {
    left = rect.left + (rect.width - popoverWidth) / 2
  }

  if (left + popoverWidth > window.innerWidth - 12) {
    left = window.innerWidth - popoverWidth - 12
  }
  if (left < 12) {
    left = 12
  }

  // Vertical position: flip upwards if near the bottom of viewport
  const spaceBelow = window.innerHeight - rect.bottom
  let top = rect.bottom + 8
  if (spaceBelow < popoverHeight + 12 && rect.top > popoverHeight + 12) {
    top = rect.top - popoverHeight - 8
  }

  if (top + popoverHeight > window.innerHeight - 12) {
    top = Math.max(12, window.innerHeight - popoverHeight - 12)
  }

  return { top, left }
}

export const CustomColorPickerPopover: React.FC<CustomColorPickerPopoverProps> = ({
  currentColor,
  onChange,
  onClose,
  anchorEl,
  align = 'right'
}) => {
  const popoverRef = useRef<HTMLDivElement>(null)
  const satValAreaRef = useRef<HTMLDivElement>(null)
  const hueSliderRef = useRef<HTMLDivElement>(null)

  const [hsv, setHsv] = useState(() => hexToHsv(currentColor))
  const [hexInput, setHexInput] = useState(currentColor.toUpperCase())
  const [coords, setCoords] = useState(() => calculateCoords(anchorEl, align))

  // Sync coords on mount and resize
  useLayoutEffect(() => {
    if (anchorEl) {
      setCoords(calculateCoords(anchorEl, align))
    }
  }, [anchorEl, align])

  useEffect(() => {
    const handleResize = () => {
      if (anchorEl) setCoords(calculateCoords(anchorEl, align))
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [anchorEl, align])

  // Sync HSV when external currentColor prop changes (and not currently dragging)
  useEffect(() => {
    const currentUpper = currentColor.toUpperCase()
    if (currentUpper !== hexInput) {
      setHexInput(currentUpper)
      setHsv(hexToHsv(currentColor))
    }
  }, [currentColor])

  // Close on outside click or Escape
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as Node
      if (
        popoverRef.current &&
        !popoverRef.current.contains(target) &&
        anchorEl &&
        !anchorEl.contains(target)
      ) {
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
  }, [onClose, anchorEl])

  // Update Saturation and Value via dragging
  const handleSatValMove = useCallback((e: MouseEvent | React.MouseEvent) => {
    if (!satValAreaRef.current) return
    const rect = satValAreaRef.current.getBoundingClientRect()
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left))
    const y = Math.max(0, Math.min(rect.height, e.clientY - rect.top))

    const s = x / rect.width
    const v = 1 - (y / rect.height)

    setHsv(prev => {
      const next = { ...prev, s, v }
      const newHex = hsvToHex(next.h, next.s, next.v)
      setHexInput(newHex)
      onChange(newHex)
      return next
    })
  }, [onChange])

  const handleSatValMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    handleSatValMove(e)

    const onMouseMove = (ev: MouseEvent) => {
      handleSatValMove(ev)
    }
    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  // Update Hue via dragging
  const handleHueMove = useCallback((e: MouseEvent | React.MouseEvent) => {
    if (!hueSliderRef.current) return
    const rect = hueSliderRef.current.getBoundingClientRect()
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left))
    const h = Math.round((x / rect.width) * 360) % 360

    setHsv(prev => {
      const next = { ...prev, h }
      const newHex = hsvToHex(next.h, next.s, next.v)
      setHexInput(newHex)
      onChange(newHex)
      return next
    })
  }, [onChange])

  const handleHueMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    handleHueMove(e)

    const onMouseMove = (ev: MouseEvent) => {
      handleHueMove(ev)
    }
    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  // Manual Hex Input change
  const handleHexInputChange = (val: string) => {
    let clean = val.trim()
    if (!clean.startsWith('#')) clean = '#' + clean
    const upper = clean.toUpperCase()
    setHexInput(upper)

    if (/^#[0-9A-Fa-f]{6}$/.test(upper)) {
      setHsv(hexToHsv(upper))
      onChange(upper)
    }
  }

  const currentHex = hsvToHex(hsv.h, hsv.s, hsv.v)

  const popoverContent = (
    <div
      ref={popoverRef}
      onClick={e => e.stopPropagation()}
      data-color-picker-portal="true"
      className="fixed z-[99999] w-[230px] bg-[#12131a] border border-zinc-800 rounded-2xl shadow-xl p-3 text-xs text-zinc-200 select-none animate-in fade-in duration-75 space-y-2.5"
      style={{
        top: coords.top,
        left: coords.left
      }}
    >
      {/* 1. 2D Saturation / Value Gradient Canvas */}
      <div
        ref={satValAreaRef}
        onMouseDown={handleSatValMouseDown}
        className="w-full h-[120px] rounded-xl relative cursor-crosshair overflow-hidden shadow-inner select-none"
        style={{
          backgroundColor: `hsl(${hsv.h}, 100%, 50%)`
        }}
      >
        {/* White horizontal gradient overlay */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'linear-gradient(to right, #ffffff, transparent)'
          }}
        />
        {/* Black vertical gradient overlay */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'linear-gradient(to top, #000000, transparent)'
          }}
        />

        {/* Draggable Indicator */}
        <div
          className="absolute w-3.5 h-3.5 rounded-full border-2 border-white shadow-[0_0_2px_rgba(0,0,0,0.8)] -translate-x-1/2 -translate-y-1/2 pointer-events-none"
          style={{
            left: `${hsv.s * 100}%`,
            top: `${(1 - hsv.v) * 100}%`,
            backgroundColor: currentHex
          }}
        />
      </div>

      {/* 2. 1D Rainbow Hue Slider */}
      <div
        ref={hueSliderRef}
        onMouseDown={handleHueMouseDown}
        className="w-full h-3 rounded-full relative cursor-pointer select-none shadow-inner"
        style={{
          background: 'linear-gradient(to right, #ff0000 0%, #ffff00 17%, #00ff00 33%, #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000 100%)'
        }}
      >
        <div
          className="absolute w-3.5 h-3.5 rounded-full border-2 border-white shadow-sm -translate-x-1/2 top-1/2 -translate-y-1/2 pointer-events-none"
          style={{
            left: `${(hsv.h / 360) * 100}%`,
            backgroundColor: `hsl(${hsv.h}, 100%, 50%)`
          }}
        />
      </div>

      {/* 3. Bottom Preview Swatch & Uppercase Hex Input */}
      <div className="flex items-center gap-2 pt-1 border-t border-zinc-800/80">
        <div
          className="w-7 h-7 rounded-lg border border-zinc-700/80 shrink-0 shadow-xs"
          style={{ backgroundColor: currentHex }}
          title={currentHex}
        />
        <input
          type="text"
          value={hexInput}
          maxLength={7}
          onChange={e => handleHexInputChange(e.target.value)}
          placeholder="#HEX"
          className="flex-1 bg-[#161722] border border-zinc-800 focus:border-zinc-700 rounded-lg px-2.5 py-1 text-xs font-mono text-zinc-100 placeholder-zinc-500 focus:outline-none transition-colors uppercase text-center"
        />
      </div>
    </div>
  )

  return typeof document !== 'undefined' ? createPortal(popoverContent, document.body) : null
}

export default CustomColorPickerPopover
