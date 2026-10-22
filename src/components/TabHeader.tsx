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
  ArrowDownToLine,
  Share2,
  Palette,
  CheckCircle2,
  Pin,
  Brain
} from 'lucide-react'

interface TabHeaderProps {
  tabs: TabItem[]
  activeTabId: string
  onSelectTab: (tabId: string) => void
  onCloseTab: (tabId: string) => void
  onTogglePinTab?: (tabId: string) => void
  onNewTab: () => void
  currentView: ViewMode
  displayMode: EditorDisplayMode
  onChangeDisplayMode: (mode: EditorDisplayMode) => void
  onOpenCommandPalette: () => void
  onOpenSettings: () => void
  onExportVault: () => void
  onReorderTabs?: (sourceTabId: string, targetTabId: string) => void
}

export const TabHeader: React.FC<TabHeaderProps> = ({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onTogglePinTab,
  onNewTab,
  currentView,
  displayMode,
  onChangeDisplayMode,
  onOpenCommandPalette,
  onOpenSettings,
  onExportVault,
  onReorderTabs
}) => {
  const isElectron = typeof window !== 'undefined' && !!window.electronAPI?.isElectron
  const [isMaximized, setIsMaximized] = useState(false)
  const [updaterStatus, setUpdaterStatus] = useState<UpdaterStatusData | null>(null)
  const [draggedTabId, setDraggedTabId] = useState<string | null>(null)
  const [dragOverTabId, setDragOverTabId] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    tab: TabItem
  } | null>(null)

  // Close context menu on outside click or Escape
  useEffect(() => {
    if (!contextMenu) return
    const handleCloseMenu = () => setContextMenu(null)
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setContextMenu(null)
    }
    window.addEventListener('mousedown', handleCloseMenu)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('mousedown', handleCloseMenu)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [contextMenu])

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
          const isGraphTab = tab.noteId === '__graph__'
          const isCanvasTab = tab.noteId === '__canvas__'
          const isTasksTab = tab.noteId === '__tasks__'
          const isDrawTab = tab.type === 'draw'
          const isMindMapTab = tab.type === 'mindmap'
          const TabIcon = isGraphTab ? Share2 : isTasksTab ? CheckCircle2 : isMindMapTab ? Brain : (isCanvasTab || isDrawTab) ? Palette : FileText
          const isBeingDragged = draggedTabId === tab.id
          const isDragTarget = dragOverTabId === tab.id && draggedTabId !== tab.id

          return (
            <div
              key={tab.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('text/plain', tab.id)
                e.dataTransfer.effectAllowed = 'move'
                setDraggedTabId(tab.id)
              }}
              onDragOver={(e) => {
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
                if (draggedTabId && draggedTabId !== tab.id && dragOverTabId !== tab.id) {
                  setDragOverTabId(tab.id)
                }
              }}
              onDragLeave={(e) => {
                if (dragOverTabId === tab.id && !e.currentTarget.contains(e.relatedTarget as Node)) {
                  setDragOverTabId(null)
                }
              }}
              onDrop={(e) => {
                e.preventDefault()
                if (draggedTabId && draggedTabId !== tab.id && onReorderTabs) {
                  onReorderTabs(draggedTabId, tab.id)
                }
                setDraggedTabId(null)
                setDragOverTabId(null)
              }}
              onDragEnd={() => {
                setDraggedTabId(null)
                setDragOverTabId(null)
              }}
              onClick={() => onSelectTab(tab.id)}
              onContextMenu={(e) => {
                e.preventDefault()
                setContextMenu({ x: e.clientX, y: e.clientY, tab })
              }}
              title={tab.isPinned ? `[Fixada] ${tab.title || 'Sem título'}` : (tab.title || 'Sem título')}
              className={`group flex items-center gap-1.5 h-7 rounded-t-lg text-xs cursor-pointer select-none border-t border-x transition-all ${
                tab.isPinned ? 'px-2 max-w-[130px]' : 'px-2.5 max-w-[170px]'
              } ${
                isActive
                  ? 'bg-[#141418] border-zinc-700/80 border-t-2 text-zinc-200 font-medium shadow-sm tab-item-active'
                  : 'bg-transparent border-transparent text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/40 tab-item-inactive'
              } ${
                isBeingDragged ? 'opacity-30 scale-95' : ''
              } ${
                isDragTarget ? 'border-l-2 !border-l-[var(--accent)] ring-1 ring-[var(--accent)]/40 bg-zinc-800/60' : ''
              }`}
              style={isActive ? { borderTopColor: 'var(--accent)' } : undefined}
            >
              <TabIcon className="w-3.5 h-3.5 shrink-0" style={isActive ? { color: 'var(--accent)' } : { color: '#71717a' }} />
              <span className="truncate">{tab.title || 'Sem título'}</span>

              {/* If Pinned: Show ONLY the Gold Pin icon (click to unpin) */}
              {tab.isPinned && onTogglePinTab && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onTogglePinTab(tab.id)
                  }}
                  className="p-0.5 rounded hover:bg-zinc-800 text-[var(--accent)] transition-all cursor-pointer shrink-0"
                  title="Aba fixada - clique para desafixar"
                >
                  <Pin className="w-3 h-3 rotate-45 fill-current" />
                </button>
              )}

              {/* If Unpinned: Show Pin on hover and Close (X) on hover */}
              {!tab.isPinned && (
                <div className="flex items-center gap-0.5 shrink-0">
                  {onTogglePinTab && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        onTogglePinTab(tab.id)
                      }}
                      className="p-0.5 rounded hover:bg-zinc-800 text-zinc-500 hover:text-[var(--accent)] opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                      title="Fixar aba"
                    >
                      <Pin className="w-2.5 h-2.5" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      onCloseTab(tab.id)
                    }}
                    className="p-0.5 rounded-full hover:bg-zinc-800 text-zinc-500 hover:text-zinc-200 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                    title="Fechar aba"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
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

        {updaterStatus?.status === 'available' && (
          <div
            className="flex items-center gap-1.5 h-6 px-2 rounded-md bg-[#1a1711] border border-[#c59b27]/30 text-[#d4af37] text-[11px] mr-0.5 animate-pulse"
            title={`Nova versão ${updaterStatus.version} encontrada! Baixando...`}
          >
            <ArrowDownToLine className="w-3 h-3 text-[#c59b27]" />
            <span>Baixando v{updaterStatus.version}...</span>
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

      {/* Tab Context Menu */}
      {contextMenu && (
        <div
          onMouseDown={e => e.stopPropagation()}
          style={{ top: contextMenu.y, left: contextMenu.x }}
          className="fixed z-50 w-44 bg-[#141418] border border-zinc-700/80 rounded-xl shadow-2xl p-1 text-xs text-zinc-300 space-y-0.5 animate-in fade-in zoom-in-95 duration-100"
        >
          {onTogglePinTab && (
            <button
              onClick={() => {
                onTogglePinTab(contextMenu.tab.id)
                setContextMenu(null)
              }}
              className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-zinc-800 flex items-center gap-2 cursor-pointer transition-colors"
            >
              <Pin className={`w-3.5 h-3.5 ${contextMenu.tab.isPinned ? 'rotate-45 fill-current text-[var(--accent)]' : ''}`} />
              <span>{contextMenu.tab.isPinned ? 'Desafixar aba' : 'Fixar aba'}</span>
            </button>
          )}

          {!contextMenu.tab.isPinned && (
            <button
              onClick={() => {
                onCloseTab(contextMenu.tab.id)
                setContextMenu(null)
              }}
              className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-zinc-800 flex items-center gap-2 text-zinc-300 hover:text-red-400 cursor-pointer transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              <span>Fechar aba</span>
            </button>
          )}

          {tabs.length > 1 && (
            <button
              onClick={() => {
                // Close other unpinned tabs
                tabs.forEach(t => {
                  if (t.id !== contextMenu.tab.id && !t.isPinned) {
                    onCloseTab(t.id)
                  }
                })
                setContextMenu(null)
              }}
              className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-zinc-800 flex items-center gap-2 text-zinc-300 cursor-pointer transition-colors border-t border-zinc-800/80 pt-1 mt-0.5"
            >
              <span>Fechar outras abas</span>
            </button>
          )}

          <button
            onClick={() => {
              onNewTab()
              setContextMenu(null)
            }}
            className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-zinc-800 flex items-center gap-2 text-zinc-300 cursor-pointer transition-colors border-t border-zinc-800/80 pt-1 mt-0.5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Nova nota em aba</span>
          </button>
        </div>
      )}
    </div>
  )
}
