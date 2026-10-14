import React from 'react'
import type { AppSettings, AccentColor } from '../types'
import { X, Palette, Type, Maximize, Check } from 'lucide-react'

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
  settings: AppSettings
  onUpdateSettings: (newSettings: AppSettings) => void
}

const ACCENT_OPTIONS: { id: AccentColor; label: string; color: string }[] = [
  { id: 'violet', label: 'Violeta', color: '#8b5cf6' },
  { id: 'emerald', label: 'Esmeralda', color: '#10b981' },
  { id: 'cyan', label: 'Ciano', color: '#06b6d4' },
  { id: 'amber', label: 'Âmbar', color: '#f59e0b' },
  { id: 'rose', label: 'Rosa', color: '#ec4899' },
]

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings
}) => {
  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-zinc-900 border border-zinc-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col text-xs text-zinc-300"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-800 bg-zinc-950/70">
          <div className="flex items-center gap-2 font-semibold text-sm text-zinc-100">
            <Palette className="w-4 h-4 text-violet-400" />
            <span>Personalizar Pyrite</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-zinc-400 hover:text-zinc-200 rounded-lg hover:bg-zinc-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-5">
          {/* Accent Color */}
          <div className="space-y-2">
            <label className="font-semibold text-zinc-200 flex items-center gap-2">
              <Palette className="w-3.5 h-3.5 text-zinc-400" />
              <span>Cor de Destaque</span>
            </label>
            <div className="flex items-center gap-2.5 pt-1">
              {ACCENT_OPTIONS.map(opt => {
                const isSelected = settings.accentColor === opt.id
                return (
                  <button
                    key={opt.id}
                    onClick={() => onUpdateSettings({ ...settings, accentColor: opt.id })}
                    className="flex flex-col items-center gap-1.5 group"
                    title={opt.label}
                  >
                    <div
                      className={`w-7 h-7 rounded-full flex items-center justify-center transition-all ${
                        isSelected ? 'ring-2 ring-white ring-offset-2 ring-offset-zinc-900 scale-110' : 'hover:scale-105'
                      }`}
                      style={{ backgroundColor: opt.color }}
                    >
                      {isSelected && <Check className="w-4 h-4 text-white" />}
                    </div>
                    <span className="text-[10px] text-zinc-400 group-hover:text-zinc-200">{opt.label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Font Size */}
          <div className="space-y-2 border-t border-zinc-800 pt-4">
            <label className="font-semibold text-zinc-200 flex items-center gap-2">
              <Type className="w-3.5 h-3.5 text-zinc-400" />
              <span>Tamanho da Tipografia</span>
            </label>
            <div className="grid grid-cols-3 gap-2 pt-1">
              {[
                { id: 'small', label: 'Pequeno (13px)' },
                { id: 'medium', label: 'Padrão (15px)' },
                { id: 'large', label: 'Grande (17px)' },
              ].map(opt => (
                <button
                  key={opt.id}
                  onClick={() => onUpdateSettings({ ...settings, fontSize: opt.id as any })}
                  className={`py-2 px-2 rounded-xl border text-center font-medium transition-all ${
                    settings.fontSize === opt.id
                      ? 'bg-violet-600/20 border-violet-500 text-violet-200 shadow-sm'
                      : 'border-zinc-800 bg-zinc-950/40 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Editor Width */}
          <div className="space-y-2 border-t border-zinc-800 pt-4">
            <label className="font-semibold text-zinc-200 flex items-center gap-2">
              <Maximize className="w-3.5 h-3.5 text-zinc-400" />
              <span>Largura do Texto no Editor</span>
            </label>
            <div className="grid grid-cols-3 gap-2 pt-1">
              {[
                { id: 'compact', label: 'Compacto' },
                { id: 'standard', label: 'Padrão (800px)' },
                { id: 'wide', label: 'Amplo' },
              ].map(opt => (
                <button
                  key={opt.id}
                  onClick={() => onUpdateSettings({ ...settings, editorWidth: opt.id as any })}
                  className={`py-2 px-2 rounded-xl border text-center font-medium transition-all ${
                    settings.editorWidth === opt.id
                      ? 'bg-violet-600/20 border-violet-500 text-violet-200 shadow-sm'
                      : 'border-zinc-800 bg-zinc-950/40 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-zinc-800 bg-zinc-950/60 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-violet-600 hover:bg-violet-500 text-white rounded-lg font-medium transition-colors"
          >
            Concluído
          </button>
        </div>
      </div>
    </div>
  )
}
