import React from 'react'
import type { TabItem, EditorDisplayMode, ViewMode } from '../types'
import {
  FileText,
  Plus,
  X,
  Edit3,
  Eye,
  Search,
  Sparkles,
  Download,
  PanelRight,
  SlidersHorizontal
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
  isAiOpen: boolean
  onToggleAi: () => void
  isRightSidebarOpen: boolean
  onToggleRightSidebar: () => void
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
  isAiOpen,
  onToggleAi,
  isRightSidebarOpen,
  onToggleRightSidebar,
  onOpenCommandPalette,
  onOpenSettings,
  onExportVault
}) => {
  return (
    <div className="h-9 bg-[#0c0c0e] border-b border-zinc-800/80 flex items-center justify-between px-2 select-none shrink-0 z-10 text-xs">
      {/* Left: Tabs List (Max 5 tabs) + New Tab Button */}
      <div className="flex items-center gap-1 overflow-x-auto scrollbar-none py-1">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId
          return (
            <div
              key={tab.id}
              onClick={() => onSelectTab(tab.id)}
              className={`group flex items-center gap-1.5 h-7 px-2.5 rounded-t-lg text-xs cursor-pointer border-t border-x transition-all max-w-[170px] ${
                isActive
                  ? 'bg-[#121215] border-zinc-700/80 text-violet-300 font-medium shadow-sm'
                  : 'bg-transparent border-transparent text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/40'
              }`}
            >
              <FileText className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-violet-400' : 'text-zinc-600'}`} />
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
          className="p-1 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/60 rounded-md transition-colors ml-0.5"
          title="Nova nota em aba"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Right: Icon-only actions relocated from top header */}
      <div className="flex items-center gap-1 shrink-0 ml-2">
        {/* Mode Switcher: Only icons, visible in editor view */}
        {currentView === 'editor' && (
          <div className="flex items-center gap-0.5 bg-zinc-900/90 border border-zinc-800 rounded-md p-0.5 mr-1 shadow-sm">
            <button
              onClick={() => onChangeDisplayMode('live')}
              className={`p-1 rounded transition-all ${
                displayMode === 'live'
                  ? 'bg-violet-600 text-white shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
              title="Modo Edição ao Vivo (Live Preview no estilo Obsidian)"
            >
              <Edit3 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onChangeDisplayMode('reading')}
              className={`p-1 rounded transition-all ${
                displayMode === 'reading'
                  ? 'bg-violet-600 text-white shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
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

        {/* AI Assistant */}
        <button
          onClick={onToggleAi}
          className={`p-1.5 rounded-md transition-colors ${
            isAiOpen
              ? 'bg-violet-950/80 text-violet-300 border border-violet-800/60 shadow-sm'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
          }`}
          title="Assistente IA Copilot"
        >
          <Sparkles className="w-3.5 h-3.5 text-violet-400" />
        </button>

        {/* Export Vault */}
        <button
          onClick={onExportVault}
          className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 rounded-md transition-colors"
          title="Exportar Vault como JSON"
        >
          <Download className="w-3.5 h-3.5" />
        </button>

        {/* Right Sidebar Toggle */}
        <button
          onClick={onToggleRightSidebar}
          className={`p-1.5 rounded-md transition-colors ${
            isRightSidebarOpen
              ? 'text-zinc-200 bg-zinc-800/80'
              : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/40'
          }`}
          title="Alternar Painel Lateral Direito (Backlinks, Tags, Outline)"
        >
          <PanelRight className="w-3.5 h-3.5" />
        </button>

        {/* Settings Button */}
        <button
          onClick={onOpenSettings}
          className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 rounded-md transition-colors"
          title="Personalizar Cores, Fontes e Layout"
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}
