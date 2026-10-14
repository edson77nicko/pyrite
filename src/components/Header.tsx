import React from 'react'
import type { ViewMode } from '../types'
import {
  FileText,
  Share2,
  Layout,
  PanelLeft,
  PanelRight,
  Sparkles,
  Search,
  Download
} from 'lucide-react'

interface HeaderProps {
  currentView: ViewMode
  onChangeView: (view: ViewMode) => void
  isLeftSidebarOpen: boolean
  onToggleLeftSidebar: () => void
  isRightSidebarOpen: boolean
  onToggleRightSidebar: () => void
  isAiOpen: boolean
  onToggleAi: () => void
  onOpenCommandPalette: () => void
  onExportVault: () => void
  noteCount: number
}

export const Header: React.FC<HeaderProps> = ({
  currentView,
  onChangeView,
  isLeftSidebarOpen,
  onToggleLeftSidebar,
  isRightSidebarOpen,
  onToggleRightSidebar,
  isAiOpen,
  onToggleAi,
  onOpenCommandPalette,
  onExportVault,
  noteCount
}) => {
  return (
    <header className="h-11 bg-zinc-950 border-b border-zinc-800 flex items-center justify-between px-3 select-none shrink-0 text-xs">
      {/* Left Section: Logo & Sidebar Toggle */}
      <div className="flex items-center gap-2">
        <button
          onClick={onToggleLeftSidebar}
          className={`p-1.5 rounded transition-colors ${
            isLeftSidebarOpen ? 'text-zinc-200 bg-zinc-800' : 'text-zinc-500 hover:text-zinc-300'
          }`}
          title="Alternar Barra Lateral Esquerda"
        >
          <PanelLeft className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-2 pl-1">
          <span className="font-bold text-zinc-100 text-sm tracking-tight flex items-center gap-1.5">
            <span className="text-violet-400">💎</span> Pyrite
          </span>
          <span className="text-[10px] px-1.5 py-0.2 bg-violet-950/60 text-violet-300 border border-violet-800/50 rounded font-mono font-medium">
            {noteCount} notas
          </span>
        </div>
      </div>

      {/* Center Section: Main View Tabs */}
      <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800/80 p-0.5 rounded-lg">
        <button
          onClick={() => onChangeView('editor')}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-md font-medium transition-colors ${
            currentView === 'editor'
              ? 'bg-violet-600 text-white shadow-sm'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Editor</span>
        </button>

        <button
          onClick={() => onChangeView('graph')}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-md font-medium transition-colors ${
            currentView === 'graph'
              ? 'bg-violet-600 text-white shadow-sm'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
          }`}
        >
          <Share2 className="w-3.5 h-3.5" />
          <span>Grafo</span>
        </button>

        <button
          onClick={() => onChangeView('canvas')}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-md font-medium transition-colors ${
            currentView === 'canvas'
              ? 'bg-violet-600 text-white shadow-sm'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
          }`}
        >
          <Layout className="w-3.5 h-3.5" />
          <span>Canvas</span>
        </button>
      </div>

      {/* Right Section: Command Palette, AI, Export, Right Sidebar */}
      <div className="flex items-center gap-1.5">
        {/* Command Palette Button */}
        <button
          onClick={onOpenCommandPalette}
          className="flex items-center gap-2 px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800/80 border border-zinc-800 rounded-md text-zinc-400 hover:text-zinc-200 transition-colors"
          title="Paleta de Comandos (Ctrl + P)"
        >
          <Search className="w-3.5 h-3.5 text-violet-400" />
          <span className="text-[11px]">Buscar...</span>
          <kbd className="px-1 py-0.2 bg-zinc-800 text-[10px] text-zinc-500 rounded border border-zinc-700/60 font-mono">
            Ctrl P
          </kbd>
        </button>

        {/* AI Assistant Button */}
        <button
          onClick={onToggleAi}
          className={`p-1.5 rounded transition-colors ${
            isAiOpen
              ? 'bg-violet-950/80 text-violet-300 border border-violet-800/60'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
          }`}
          title="Assistente IA"
        >
          <Sparkles className="w-4 h-4 text-violet-400" />
        </button>

        {/* Export Vault Button */}
        <button
          onClick={onExportVault}
          className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded transition-colors"
          title="Exportar Vault como JSON/Markdown"
        >
          <Download className="w-4 h-4" />
        </button>

        {/* Right Sidebar Toggle */}
        <button
          onClick={onToggleRightSidebar}
          className={`p-1.5 rounded transition-colors ${
            isRightSidebarOpen ? 'text-zinc-200 bg-zinc-800' : 'text-zinc-500 hover:text-zinc-300'
          }`}
          title="Alternar Painel de Links e Metadados"
        >
          <PanelRight className="w-4 h-4" />
        </button>
      </div>
    </header>
  )
}
