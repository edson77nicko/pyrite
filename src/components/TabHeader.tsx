import React, { useState, useEffect } from 'react'
import type { TabItem, EditorDisplayMode, ViewMode } from '../types'
import type { UpdaterStatusData } from '../types/electron'
import {
  FileText,
  Plus,
  X,
  Edit3,
  Eye,
  Search,
  Download,
  SlidersHorizontal,
  Minus,
  Square,
  Copy,
  RefreshCw,
  ArrowDownToLine
} from 'lucide-react'

interface TabHeaderProps {
  tabs: TabItem[]
  activeTabId: string
  onSelectTab: (tabId: string) => void
  onCloseTab: (tabId: string) => void
  onNewTab: () => void
  currentView: ViewMode
  displayMode: EditorDisplayMode
  onChangeDisplayMode: (mode: EditorDisplayMode) => void
  onOpenCommandPalette: () => void
  onOpenSettings: () => void
  onExportVault: () => void
}

export const TabHeader: React.FC<TabHeaderProps> = ({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onNewTab,
  currentView,
  displayMode,
  onChangeDisplayMode,
  onOpenCommandPalette,
  onOpenSettings,
  onExportVault
}) => {
  const isElectron = typeof window !== 'undefined' && !!window.electronAPI?.isElectron
  const [isMaximized, setIsMaximized] = useState(false)
  const [updaterStatus, setUpdaterStatus] = useState<UpdaterStatusData | null>(null)

  useEffect(() => {
    if (!isElectron || !window.electronAPI) return
    window.electronAPI.isMaximized().then(setIsMaximized)
    const cleanupMaximized = window.electronAPI.onMaximizedChange(setIsMaximized)
    const cleanupUpdater = window.electronAPI.onUpdaterStatus?.((status) => {
      setUpdaterStatus(status)
    })

    return () => {
      cleanupMaximized?.()
      cleanupUpdater?.()
    }
  }, [isElectron])

  const handleMinimize = () => window.electronAPI?.minimize()
  const handleMaximize = () => window.electronAPI?.maximize().then(setIsMaximized)
  const handleClose = () => window.electronAPI?.close()

  return (
    <div className="h-9 bg-[#0c0c0e] border-b border-zinc-800/80 flex items-center justify-between px-2 select-none shrink-0 z-10 text-xs app-drag">
      {/* Left: Tabs List (Max 5 tabs) + New Tab Button */}
      <div className="flex items-center gap-1 overflow-x-auto scrollbar-none py-1 app-no-drag">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId
          return (
            <div
              key={tab.id}
              onClick={() => onSelectTab(tab.id)}
              className={`group flex items-center gap-1.5 h-7 px-2.5 rounded-t-lg text-xs cursor-pointer border-t border-x transition-all max-w-[170px] ${
                isActive
                  ? 'bg-[#141418] border-zinc-700/80 border-t-2 text-zinc-200 font-medium shadow-sm'
                  : 'bg-transparent border-transparent text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/40'
              }`}
              style={isActive ? { borderTopColor: 'var(--accent)' } : undefined}
            >
              <FileText className="w-3.5 h-3.5 shrink-0" style={isActive ? { color: 'var(--accent)' } : { color: '#71717a' }} />
              <span className="truncate">{tab.title || 'Sem título'}</span>
              {tabs.length > 1 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onCloseTab(tab.id)
                  }}
                  className="p-0.5 rounded-full hover:bg-zinc-800 text-zinc-500 hover:text-zinc-200 opacity-0 group-hover:opacity-100 transition-opacity ml-0.5"
                  title="Fechar aba"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          )
        })}

        <button
          onClick={onNewTab}
          className="p-1 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/60 rounded-md transition-colors ml-0.5 cursor-pointer"
          title="Nova nota em aba"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Right: Icon-only actions + Electron Window Controls */}
      <div className="flex items-center gap-1 shrink-0 ml-2 app-no-drag">
        {/* Mode Switcher: Only icons, visible in editor view */}
        {currentView === 'editor' && (
          <div className="flex items-center gap-0.5 bg-zinc-900/90 border border-zinc-800 rounded-md p-0.5 mr-1 shadow-sm">
            <button
              onClick={() => onChangeDisplayMode('live')}
              className={`p-1 rounded transition-all cursor-pointer ${
                displayMode === 'live'
                  ? 'font-bold shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
              style={displayMode === 'live' ? { backgroundColor: 'var(--accent)', color: '#09090b' } : undefined}
              title="Modo Edição ao Vivo (Live Preview no estilo Obsidian)"
            >
              <Edit3 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onChangeDisplayMode('reading')}
              className={`p-1 rounded transition-all cursor-pointer ${
                displayMode === 'reading'
                  ? 'font-bold shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
              style={displayMode === 'reading' ? { backgroundColor: 'var(--accent)', color: '#09090b' } : undefined}
              title="Modo Leitura (Visualização pura)"
            >
              <Eye className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Quick Search / Command Palette */}
        <button
          onClick={onOpenCommandPalette}
          className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 rounded-md transition-colors"
          title="Buscar no Vault / Paleta de Comandos (Ctrl+P)"
        >
          <Search className="w-3.5 h-3.5" />
        </button>

        {/* Export Vault */}
        <button
          onClick={onExportVault}
          className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 rounded-md transition-colors cursor-pointer"
          title="Exportar Vault como JSON"
        >
          <Download className="w-3.5 h-3.5" />
        </button>

        {/* Auto Update Notification Button - Only rendered if an update is ready or downloading */}
        {updaterStatus?.status === 'downloaded' && (
          <button
            onClick={() => window.electronAPI?.quitAndInstall()}
            className="flex items-center gap-1.5 h-6 px-2 rounded-md bg-[#c59b27]/20 hover:bg-[#c59b27]/30 text-[#d4af37] border border-[#c59b27]/40 text-[11px] font-semibold transition-all shadow-md shadow-black/40 animate-pulse mr-0.5 cursor-pointer"
            title={`Nova versão ${updaterStatus.version} pronta! Clique para reiniciar e atualizar sem reinstalar.`}
          >
            <RefreshCw className="w-3 h-3 text-[#c59b27] animate-spin" style={{ animationDuration: '4s' }} />
            <span className="font-semibold">Atualizar v{updaterStatus.version}</span>
          </button>
        )}

        {updaterStatus?.status === 'downloading' && (
          <div
            className="flex items-center gap-1.5 h-6 px-2 rounded-md bg-[#1a1711] border border-[#c59b27]/30 text-[#d4af37] text-[11px] mr-0.5"
            title={`Baixando atualização: ${updaterStatus.percent}%`}
          >
            <ArrowDownToLine className="w-3 h-3 text-[#c59b27] animate-bounce" />
            <span>Baixando {updaterStatus.percent}%</span>
          </div>
        )}

        {/* Settings Button */}
        <button
          onClick={onOpenSettings}
          className="p-1.5 text-zinc-400 hover:text-[#d4af37] hover:bg-zinc-800/60 rounded-md transition-colors cursor-pointer"
          title="Personalizar Cores, Fontes e Layout"
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
        </button>

        {/* Native Electron Window Controls (Minimize, Maximize, Close) */}
        {isElectron && (
          <div className="flex items-center h-full ml-1.5 pl-1.5 border-l border-zinc-800/80">
            <button
              onClick={handleMinimize}
              className="h-7 w-7 flex items-center justify-center rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80 transition-colors"
              title="Minimizar Janela"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleMaximize}
              className="h-7 w-7 flex items-center justify-center rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80 transition-colors"
              title={isMaximized ? "Restaurar Janela" : "Maximizar Janela"}
            >
              {isMaximized ? <Copy className="w-3 h-3" /> : <Square className="w-3 h-3" />}
            </button>
            <button
              onClick={handleClose}
              className="h-7 w-7 flex items-center justify-center rounded text-zinc-400 hover:text-white hover:bg-rose-600 transition-colors"
              title="Fechar Pyrite"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
