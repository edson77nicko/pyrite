import React from 'react'
import type { ViewMode } from '../types'
import {
  FileText,
  Share2,
  Layout,
  PanelLeft,
  Bot,
  Search,
  Calendar,
  SlidersHorizontal
} from 'lucide-react'

interface RibbonProps {
  currentView: ViewMode
  onChangeView: (view: ViewMode) => void
  isLeftSidebarOpen: boolean
  onToggleLeftSidebar: () => void
  onOpenDailyNote: () => void
  onOpenCommandPalette: () => void
  isAiOpen: boolean
  onToggleAi: () => void
  onOpenSettings: () => void
}

export const Ribbon: React.FC<RibbonProps> = ({
  currentView,
  onChangeView,
  isLeftSidebarOpen,
  onToggleLeftSidebar,
  onOpenDailyNote,
  onOpenCommandPalette,
  isAiOpen,
  onToggleAi,
  onOpenSettings
}) => {
  return (
    <aside className="w-11 h-full bg-[#09090b] border-r border-zinc-800/80 flex flex-col items-center py-2 select-none shrink-0 text-zinc-400 z-10">
      {/* 1. Toggle Sidebar Button */}
      <button
        onClick={onToggleLeftSidebar}
        className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${
          isLeftSidebarOpen
            ? 'text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800/60'
            : 'text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/40'
        }`}
        title="Alternar Barra Lateral (Explorador de Arquivos)"
      >
        <PanelLeft className="w-4 h-4" />
      </button>

      <div className="w-5 h-px bg-zinc-800/80 my-2" />

      {/* 2. Main Views (Icon only, no text): Editor, Graph, Canvas */}
      <div className="flex flex-col items-center gap-1">
        <button
          onClick={() => onChangeView('editor')}
          className={`w-8 h-8 flex items-center justify-center rounded-lg transition-all cursor-pointer ${
            currentView === 'editor'
              ? 'bg-amber-500/15 text-amber-300 border border-amber-500/40 shadow-[0_0_10px_rgba(245,158,11,0.15)]'
              : 'text-zinc-400 hover:text-amber-300 hover:bg-zinc-800/50'
          }`}
          title="Editor de Notas"
        >
          <FileText className="w-4 h-4" />
        </button>

        <button
          onClick={() => onChangeView('graph')}
          className={`w-8 h-8 flex items-center justify-center rounded-lg transition-all cursor-pointer ${
            currentView === 'graph'
              ? 'bg-amber-500/15 text-amber-300 border border-amber-500/40 shadow-[0_0_10px_rgba(245,158,11,0.15)]'
              : 'text-zinc-400 hover:text-amber-300 hover:bg-zinc-800/50'
          }`}
          title="Grafo de Conhecimento"
        >
          <Share2 className="w-4 h-4" />
        </button>

        <button
          onClick={() => onChangeView('canvas')}
          className={`w-8 h-8 flex items-center justify-center rounded-lg transition-all cursor-pointer ${
            currentView === 'canvas'
              ? 'bg-amber-500/15 text-amber-300 border border-amber-500/40 shadow-[0_0_10px_rgba(245,158,11,0.15)]'
              : 'text-zinc-400 hover:text-amber-300 hover:bg-zinc-800/50'
          }`}
          title="Canvas Infinito"
        >
          <Layout className="w-4 h-4" />
        </button>

        {/* AI Agent Icon right below Canvas */}
        <button
          onClick={onToggleAi}
          className={`w-8 h-8 flex items-center justify-center rounded-lg transition-all cursor-pointer ${
            isAiOpen
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50 shadow-[0_0_12px_rgba(245,158,11,0.2)]'
              : 'text-zinc-400 hover:text-amber-300 hover:bg-zinc-800/50'
          }`}
          title="Agente Pyrita"
        >
          <Bot className="w-4 h-4" />
        </button>
      </div>

      <div className="w-5 h-px bg-zinc-800/80 my-2" />

      {/* 3. Obsidian Tool Icons */}
      <div className="flex flex-col items-center gap-1">
        <button
          onClick={onOpenCommandPalette}
          className="w-8 h-8 flex items-center justify-center text-zinc-400 hover:text-amber-300 hover:bg-zinc-800/50 rounded-lg transition-colors cursor-pointer"
          title="Busca Rápida / Paleta de Comandos (Ctrl + P)"
        >
          <Search className="w-4 h-4" />
        </button>

        <button
          onClick={onOpenDailyNote}
          className="w-8 h-8 flex items-center justify-center text-zinc-400 hover:text-amber-300 hover:bg-zinc-800/50 rounded-lg transition-colors cursor-pointer"
          title="Abrir Nota Diária de Hoje"
        >
          <Calendar className="w-4 h-4" />
        </button>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* 4. Bottom Utilities: Settings only */}
      <div className="flex flex-col items-center gap-1">
        <button
          onClick={onOpenSettings}
          className="w-8 h-8 flex items-center justify-center text-zinc-400 hover:text-amber-300 hover:bg-zinc-800/50 rounded-lg transition-colors cursor-pointer"
          title="Configurações e Personalização"
        >
          <SlidersHorizontal className="w-4 h-4" />
        </button>
      </div>
    </aside>
  )
}
