import React, { useState, useRef } from 'react'
import type { AppSettings } from '../types'
import { Palette, Type, Maximize2, Sun, Moon } from 'lucide-react'
import { CustomColorPickerPopover } from './CustomColorPickerPopover'

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
  settings: AppSettings
  onUpdateSettings: (newSettings: AppSettings) => void
}

const ACCENT_COLORS: string[] = [
  '#c59b27', // Pirita Gold (Padrão)
  '#eab308', // Yellow
  '#f59e0b', // Amber
  '#f97316', // Orange
  '#ea580c', // Dark Orange
  '#ef4444', // Red
  '#f43f5e', // Rose
  '#ec4899', // Pink
  '#d946ef', // Fuchsia
  '#a855f7', // Purple
  '#8b5cf6', // Violet
  '#6366f1', // Indigo
  '#3b82f6', // Blue
  '#0ea5e9', // Sky
  '#06b6d4', // Cyan
  '#10b981', // Emerald
  '#22c55e', // Green
  '#84cc16', // Lime
  '#78716c', // Stone
  '#94a3b8', // Slate
  '#e4e4e7', // Silver
]

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings
}) => {
  const [isCustomColorOpen, setIsCustomColorOpen] = useState(false)
  const customColorBtnRef = useRef<HTMLButtonElement>(null)

  if (!isOpen) return null

  // Normalize current accent color (support legacy named keys if present)
  const legacyMap: Record<string, string> = {
    amber: '#c59b27',
    violet: '#8b5cf6',
    emerald: '#10b981',
    cyan: '#06b6d4',
    rose: '#ec4899'
  }
  const currentAccent = legacyMap[settings.accentColor] || settings.accentColor || '#c59b27'
  const isCustomSelected = !ACCENT_COLORS.some(c => c.toLowerCase() === currentAccent.toLowerCase())

  return (
    <>
      {/* Transparent backdrop - Closes dropdown when clicking outside without darkening screen */}
      <div className="fixed inset-0 z-40 bg-transparent" onClick={onClose} />

      {/* Popover Dropdown positioned directly under the settings icon */}
      <div
        className="fixed right-2.5 top-9.5 z-50 w-60 bg-[#121215] border border-zinc-800 rounded-xl shadow-lg p-3 space-y-3 text-xs text-zinc-300 animate-in fade-in zoom-in-95 duration-100 select-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Section 1: Color Palette (Icon only, small dots grid, no text) */}
        <div className="space-y-1.5 relative">
          <div className="flex items-center text-zinc-400">
            <Palette className="w-3.5 h-3.5" />
          </div>
          <div className="grid grid-cols-8 gap-1.5 pt-0.5">
            {ACCENT_COLORS.map(color => {
              const isSelected = currentAccent.toLowerCase() === color.toLowerCase()
              return (
                <button
                  key={color}
                  type="button"
                  onClick={() => {
                    setIsCustomColorOpen(false)
                    onUpdateSettings({ ...settings, accentColor: color })
                  }}
                  className="flex items-center justify-center p-0.5 group cursor-pointer focus:outline-none"
                  title={color}
                >
                  <div
                    className={`w-4 h-4 rounded-full transition-all duration-150 ${
                      isSelected
                        ? 'ring-2 ring-white ring-offset-1 ring-offset-[#121215] scale-110 shadow-sm'
                        : 'opacity-85 hover:opacity-100 hover:scale-120'
                    }`}
                    style={{ backgroundColor: color }}
                  />
                </button>
              )
            })}

            {/* Custom Rainbow Dot */}
            <div className="relative flex items-center justify-center p-0.5">
              <button
                ref={customColorBtnRef}
                type="button"
                onClick={() => setIsCustomColorOpen(o => !o)}
                className="flex items-center justify-center cursor-pointer focus:outline-none"
                title="Personalizar cor..."
              >
                <div
                  className={`w-4 h-4 rounded-full transition-all duration-150 ${
                    isCustomSelected
                      ? 'ring-2 ring-white ring-offset-1 ring-offset-[#121215] scale-110 shadow-sm'
                      : 'opacity-85 hover:opacity-100 hover:scale-120'
                  }`}
                  style={{
                    background: 'conic-gradient(from 0deg, #ef4444, #f97316, #f59e0b, #10b981, #06b6d4, #3b82f6, #8b5cf6, #ec4899, #ef4444)'
                  }}
                />
              </button>

              {isCustomColorOpen && (
                <CustomColorPickerPopover
                  currentColor={currentAccent}
                  onChange={newColor => onUpdateSettings({ ...settings, accentColor: newColor })}
                  onClose={() => setIsCustomColorOpen(false)}
                  anchorEl={customColorBtnRef.current}
                  align="right"
                />
              )}
            </div>
          </div>
        </div>

        {/* Section 2: Typography (Icon only, 13px / 15px / 17px only) */}
        <div className="space-y-1.5 border-t border-zinc-800/80 pt-2.5">
          <div className="flex items-center text-zinc-400">
            <Type className="w-3.5 h-3.5" />
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {[
              { id: 'small', px: '13px' },
              { id: 'medium', px: '15px' },
              { id: 'large', px: '17px' },
            ].map(opt => {
              const isActive = settings.fontSize === opt.id
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onUpdateSettings({ ...settings, fontSize: opt.id as any })}
                  className={`py-1.5 rounded-lg border text-center font-mono text-[11px] transition-all cursor-pointer ${
                    isActive
                      ? 'border-zinc-600 bg-zinc-800/80 text-white font-semibold shadow-sm'
                      : 'border-zinc-800/80 bg-zinc-900/40 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                  }`}
                  style={isActive ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : undefined}
                >
                  {opt.px}
                </button>
              )
            })}
          </div>
        </div>

        {/* Section 3: Editor Width (Icon only, 672px / 768px / 1024px only) */}
        <div className="space-y-1.5 border-t border-zinc-800/80 pt-2.5">
          <div className="flex items-center text-zinc-400">
            <Maximize2 className="w-3.5 h-3.5" />
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {[
              { id: 'compact', px: '672px' },
              { id: 'standard', px: '768px' },
              { id: 'wide', px: '1024px' },
            ].map(opt => {
              const isActive = settings.editorWidth === opt.id
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onUpdateSettings({ ...settings, editorWidth: opt.id as any })}
                  className={`py-1.5 rounded-lg border text-center font-mono text-[11px] transition-all cursor-pointer ${
                    isActive
                      ? 'border-zinc-600 bg-zinc-800/80 text-white font-semibold shadow-sm'
                      : 'border-zinc-800/80 bg-zinc-900/40 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                  }`}
                  style={isActive ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : undefined}
                >
                  {opt.px}
                </button>
              )
            })}
          </div>
        </div>

        {/* Section 4: Theme Mode (Dark / Light) */}
        <div className="space-y-1.5 border-t border-zinc-800/80 pt-2.5">
          <div className="flex items-center justify-between text-zinc-400">
            <div className="flex items-center gap-1.5">
              {settings.themeMode === 'light' ? (
                <Sun className="w-3.5 h-3.5 text-amber-500" />
              ) : (
                <Moon className="w-3.5 h-3.5 text-zinc-400" />
              )}
              <span className="text-[11px] font-medium">Tema</span>
            </div>
            <span className="text-[10px] text-zinc-500 font-mono">
              {settings.themeMode === 'light' ? 'Modo Claro' : 'Modo Escuro'}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => onUpdateSettings({ ...settings, themeMode: 'dark' })}
              className={`py-1.5 px-2 rounded-lg border flex items-center justify-center gap-1.5 text-xs transition-all cursor-pointer ${
                settings.themeMode !== 'light'
                  ? 'border-zinc-600 bg-zinc-800/80 text-white font-semibold shadow-sm'
                  : 'border-zinc-800/80 bg-zinc-900/40 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
              }`}
              style={settings.themeMode !== 'light' ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : undefined}
            >
              <Moon className="w-3.5 h-3.5" />
              <span>Escuro</span>
            </button>
            <button
              type="button"
              onClick={() => onUpdateSettings({ ...settings, themeMode: 'light' })}
              className={`py-1.5 px-2 rounded-lg border flex items-center justify-center gap-1.5 text-xs transition-all cursor-pointer ${
                settings.themeMode === 'light'
                  ? 'border-zinc-600 bg-zinc-800/80 text-white font-semibold shadow-sm'
                  : 'border-zinc-800/80 bg-zinc-900/40 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
              }`}
              style={settings.themeMode === 'light' ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : undefined}
            >
              <Sun className="w-3.5 h-3.5" />
              <span>Claro</span>
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
