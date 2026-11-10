import React, { useState, useEffect, useRef } from 'react'
import { Baseline, Paintbrush, X } from 'lucide-react'

export interface NotionColorItem {
  id: string
  label: string
  color: string
  preview: string
}

export const NOTION_TEXT_COLORS: NotionColorItem[] = [
  { id: 'default', label: 'Padrão', color: 'inherit', preview: '#d4d4d8' },
  { id: 'gray', label: 'Cinza', color: '#9ca3af', preview: '#9ca3af' },
  { id: 'brown', label: 'Marrom', color: '#b45309', preview: '#b45309' },
  { id: 'orange', label: 'Laranja', color: '#f97316', preview: '#f97316' },
  { id: 'yellow', label: 'Amarelo', color: '#eab308', preview: '#eab308' },
  { id: 'green', label: 'Verde', color: '#10b981', preview: '#10b981' },
  { id: 'blue', label: 'Azul', color: '#38bdf8', preview: '#38bdf8' },
  { id: 'purple', label: 'Roxo', color: '#a855f7', preview: '#a855f7' },
  { id: 'pink', label: 'Rosa', color: '#ec4899', preview: '#ec4899' },
  { id: 'red', label: 'Vermelho', color: '#ef4444', preview: '#ef4444' }
]

export const NOTION_BG_COLORS: NotionColorItem[] = [
  { id: 'default', label: 'Sem fundo', color: 'transparent', preview: 'transparent' },
  { id: 'gray', label: 'Fundo Cinza', color: 'rgba(156, 163, 175, 0.25)', preview: '#9ca3af' },
  { id: 'brown', label: 'Fundo Marrom', color: 'rgba(180, 83, 9, 0.25)', preview: '#b45309' },
  { id: 'orange', label: 'Fundo Laranja', color: 'rgba(249, 115, 22, 0.25)', preview: '#f97316' },
  { id: 'yellow', label: 'Fundo Amarelo', color: 'rgba(234, 179, 8, 0.25)', preview: '#eab308' },
  { id: 'green', label: 'Fundo Verde', color: 'rgba(16, 185, 129, 0.25)', preview: '#10b981' },
  { id: 'blue', label: 'Fundo Azul', color: 'rgba(56, 189, 248, 0.25)', preview: '#38bdf8' },
  { id: 'purple', label: 'Fundo Roxo', color: 'rgba(168, 85, 247, 0.25)', preview: '#a855f7' },
  { id: 'pink', label: 'Fundo Rosa', color: 'rgba(236, 72, 153, 0.25)', preview: '#ec4899' },
  { id: 'red', label: 'Fundo Vermelho', color: 'rgba(239, 68, 68, 0.25)', preview: '#ef4444' }
]

const STORAGE_KEY_RECENT_COLORS = 'pyrite_recent_editor_colors'

export interface RecentColorEntry extends NotionColorItem {
  type: 'text' | 'bg'
}

const DEFAULT_RECENT_COLORS: RecentColorEntry[] = [
  { id: 'yellow', label: 'Amarelo', color: '#eab308', preview: '#eab308', type: 'text' },
  { id: 'red', label: 'Vermelho', color: '#ef4444', preview: '#ef4444', type: 'text' },
  { id: 'yellow', label: 'Fundo Amarelo', color: 'rgba(234, 179, 8, 0.25)', preview: '#eab308', type: 'bg' }
]

const loadRecentColors = (): RecentColorEntry[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_RECENT_COLORS)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0) return parsed
    }
  } catch {}
  return DEFAULT_RECENT_COLORS
}

interface NotionColorPickerProps {
  isOpen: boolean
  onClose: () => void
  onSelectColor: (type: 'text' | 'bg', color: string) => void
  anchorRef?: React.RefObject<HTMLElement | null>
  align?: 'left' | 'right' | 'center'
}

export const NotionColorPicker: React.FC<NotionColorPickerProps> = ({
  isOpen,
  onClose,
  onSelectColor,
  anchorRef,
  align = 'left'
}) => {
  const [tab, setTab] = useState<'text' | 'bg'>('text')
  const [recentColors, setRecentColors] = useState<RecentColorEntry[]>(loadRecentColors)
  const popoverRef = useRef<HTMLDivElement>(null)

  const handleSelectColor = (type: 'text' | 'bg', item: NotionColorItem) => {
    const entry: RecentColorEntry = { ...item, type }
    setRecentColors(prev => {
      const filtered = prev.filter(r => !(r.type === type && r.id === item.id))
      const updated = [entry, ...filtered].slice(0, 5)
      try {
        localStorage.setItem(STORAGE_KEY_RECENT_COLORS, JSON.stringify(updated))
      } catch {}
      return updated
    })
    onSelectColor(type, item.color)
    onClose()
  }

  useEffect(() => {
    if (!isOpen) return
    const handleOutsideClick = (e: PointerEvent) => {
      const target = e.target as Node | null
      if (!target) return
      if (popoverRef.current && !popoverRef.current.contains(target)) {
        if (anchorRef?.current && anchorRef.current.contains(target)) return
        onClose()
      }
    }
    document.addEventListener('pointerdown', handleOutsideClick, true)
    return () => {
      document.removeEventListener('pointerdown', handleOutsideClick, true)
    }
  }, [isOpen, onClose, anchorRef])

  if (!isOpen) return null

  return (
    <div
      ref={popoverRef}
      onMouseDown={e => e.stopPropagation()}
      className={`absolute top-full mt-1.5 z-50 w-56 bg-[#16161a] border border-zinc-800 rounded-xl shadow-2xl p-2 text-xs text-zinc-200 animate-in fade-in zoom-in-95 duration-100 select-none shadow-black/80 ${
        align === 'right' ? 'right-0' : align === 'center' ? 'left-1/2 -translate-x-1/2' : 'left-0'
      }`}
    >
      {/* Header Tabs: Cor de Texto / Cor de Fundo */}
      <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-zinc-800">
        <div className="flex items-center gap-1 bg-zinc-900 p-0.5 rounded-lg border border-zinc-800/80">
          <button
            type="button"
            onClick={() => setTab('text')}
            className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
              tab === 'text'
                ? 'bg-zinc-800 text-zinc-100 shadow-xs'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-850'
            }`}
          >
            <Baseline className="w-3 h-3" />
            <span>Texto</span>
          </button>
          <button
            type="button"
            onClick={() => setTab('bg')}
            className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
              tab === 'bg'
                ? 'bg-zinc-800 text-zinc-100 shadow-xs'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-850'
            }`}
          >
            <Paintbrush className="w-3 h-3" />
            <span>Fundo</span>
          </button>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50 cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Recent Colors (At least top 3-5 recently used) */}
      {recentColors.length > 0 && (
        <div className="pb-2 mb-2 border-b border-zinc-800/80">
          <div className="flex items-center justify-between text-[10px] uppercase font-semibold text-zinc-500 px-1 py-0.5 mb-1">
            <span>Mais Recentes</span>
            <span className="text-[9px] text-zinc-600 font-normal">Acesso rápido</span>
          </div>
          <div className="flex items-center gap-1.5 px-0.5 flex-wrap">
            {recentColors.slice(0, 5).map((recent, idx) => {
              const isText = recent.type === 'text'
              return (
                <button
                  key={`${recent.type}-${recent.id}-${idx}`}
                  type="button"
                  onMouseDown={e => {
                    e.preventDefault()
                    handleSelectColor(recent.type, recent)
                  }}
                  title={`${isText ? 'Texto' : 'Fundo'}: ${recent.label}`}
                  className="group relative flex items-center justify-center w-7 h-7 rounded-lg border border-zinc-700/70 hover:border-[var(--accent)] hover:bg-zinc-800/80 hover:scale-105 active:scale-95 transition-all cursor-pointer bg-zinc-900/80"
                >
                  {isText ? (
                    <span
                      className="font-bold text-[12.5px] leading-none"
                      style={{ color: recent.preview }}
                    >
                      A
                    </span>
                  ) : (
                    <span
                      className="w-4 h-4 rounded text-[10px] flex items-center justify-center font-bold border border-zinc-700/60 leading-none"
                      style={{
                        backgroundColor: recent.color === 'transparent' ? 'transparent' : recent.color,
                        color: recent.preview === 'transparent' ? '#a1a1aa' : recent.preview
                      }}
                    >
                      A
                    </span>
                  )}
                  {/* Subtle indicator dot: accent for text, sky for background */}
                  <span
                    className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-[#16161a]"
                    style={{ backgroundColor: isText ? 'var(--accent, #eab308)' : '#38bdf8' }}
                  />
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Colors List (Notion Style) */}
      <div className="max-h-56 overflow-y-auto space-y-0.5 custom-chat-scrollbar pr-0.5">
        {tab === 'text' ? (
          <div>
            <div className="text-[10px] uppercase font-semibold text-zinc-500 px-2 py-1">
              Cor do Texto
            </div>
            {NOTION_TEXT_COLORS.map(item => (
              <button
                key={item.id}
                type="button"
                onMouseDown={e => {
                  e.preventDefault()
                  handleSelectColor('text', item)
                }}
                className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-zinc-800 text-zinc-300 hover:text-zinc-100 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <div
                    className="w-4 h-4 rounded border border-zinc-700/80 flex items-center justify-center font-bold text-[11px] shrink-0"
                    style={{ color: item.preview }}
                  >
                    A
                  </div>
                  <span className="text-[11.5px]">{item.label}</span>
                </div>
                {item.id !== 'default' && (
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: item.preview }}
                  />
                )}
              </button>
            ))}
          </div>
        ) : (
          <div>
            <div className="text-[10px] uppercase font-semibold text-zinc-500 px-2 py-1">
              Cor de Fundo / Realce
            </div>
            {NOTION_BG_COLORS.map(item => (
              <button
                key={item.id}
                type="button"
                onMouseDown={e => {
                  e.preventDefault()
                  handleSelectColor('bg', item)
                }}
                className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-zinc-800 text-zinc-300 hover:text-zinc-100 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <div
                    className="w-5 h-4 rounded border border-zinc-700/80 flex items-center justify-center font-bold text-[11px] shrink-0"
                    style={{
                      backgroundColor: item.color === 'transparent' ? 'transparent' : item.color,
                      color: item.preview === 'transparent' ? '#a1a1aa' : item.preview
                    }}
                  >
                    A
                  </div>
                  <span className="text-[11.5px]">{item.label}</span>
                </div>
                {item.id !== 'default' && (
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: item.preview }}
                  />
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
