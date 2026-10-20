import React from 'react'
import type { ViewMode } from '../types'
import {
  FileText,
  Share2,
  PanelLeft,
  Bot,
  Search,
  Calendar,
  SlidersHorizontal,
  FolderSync,
  MessageSquare,
  Palette,
  CheckCircle2
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
  onOpenVaultSwitcher?: () => void
  isConversationsOpen?: boolean
  onToggleConversations?: () => void
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
  onOpenSettings,
  onOpenVaultSwitcher,
  isConversationsOpen,
  onToggleConversations
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

      {/* 2. Main Views (Icon only): Editor, Graph, Canvas, Tasks, AI Agent */}
      <div className="flex flex-col items-center gap-1">
        <button
          onClick={() => onChangeView('editor')}
          style={currentView === 'editor' ? { backgroundColor: 'var(--accent-glow-subtle, rgba(197, 155, 39, 0.15))', borderColor: 'var(--accent, #d4af37)', color: 'var(--accent, #d4af37)' } : undefined}
          className={`w-8 h-8 flex items-center justify-center rounded-lg transition-all cursor-pointer ${
            currentView === 'editor'
              ? 'border'
              : 'text-zinc-400 hover:text-[var(--accent)] hover:bg-zinc-800/50'
          }`}
          title="Editor de Notas"
        >
          <FileText className="w-4 h-4" />
        </button>

        <button
          onClick={() => onChangeView('graph')}
          style={currentView === 'graph' ? { backgroundColor: 'var(--accent-glow-subtle, rgba(197, 155, 39, 0.15))', borderColor: 'var(--accent, #d4af37)', color: 'var(--accent, #d4af37)' } : undefined}
          className={`w-8 h-8 flex items-center justify-center rounded-lg transition-all cursor-pointer ${
            currentView === 'graph'
              ? 'border'
              : 'text-zinc-400 hover:text-[var(--accent)] hover:bg-zinc-800/50'
          }`}
          title="Grafo de Conhecimento"
        >
          <Share2 className="w-4 h-4" />
        </button>

        <button
          onClick={() => onChangeView('canvas')}
          style={currentView === 'canvas' ? { backgroundColor: 'var(--accent-glow-subtle, rgba(197, 155, 39, 0.15))', borderColor: 'var(--accent, #d4af37)', color: 'var(--accent, #d4af37)' } : undefined}
          className={`w-8 h-8 flex items-center justify-center rounded-lg transition-all cursor-pointer ${
            currentView === 'canvas'
              ? 'border'
              : 'text-zinc-400 hover:text-[var(--accent)] hover:bg-zinc-800/50'
          }`}
          title="Quadros de Desenho / Canvas (Excalidraw)"
        >
          <Palette className="w-4 h-4" />
        </button>

        <button
          onClick={() => onChangeView('tasks')}
          style={currentView === 'tasks' ? { backgroundColor: 'var(--accent-glow-subtle, rgba(197, 155, 39, 0.15))', borderColor: 'var(--accent, #d4af37)', color: 'var(--accent, #d4af37)' } : undefined}
          className={`w-8 h-8 flex items-center justify-center rounded-lg transition-all cursor-pointer ${
            currentView === 'tasks'
              ? 'border'
              : 'text-zinc-400 hover:text-[var(--accent)] hover:bg-zinc-800/50'
          }`}
          title="Tarefas do Workspace"
        >
          <CheckCircle2 className="w-4 h-4" />
        </button>

        {/* AI Agent Icon right below Canvas */}
        <button
          onClick={onToggleAi}
          style={isAiOpen ? { backgroundColor: 'var(--accent-glow-subtle, rgba(197, 155, 39, 0.2))', borderColor: 'var(--accent, #d4af37)', color: 'var(--accent, #d4af37)' } : undefined}
          className={`w-8 h-8 flex items-center justify-center rounded-lg transition-all cursor-pointer ${
            isAiOpen
              ? 'border'
              : 'text-zinc-400 hover:text-[var(--accent)] hover:bg-zinc-800/50'
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
          className="w-8 h-8 flex items-center justify-center text-zinc-400 hover:text-[var(--accent)] hover:bg-zinc-800/50 rounded-lg transition-colors cursor-pointer"
          title="Busca Rápida / Paleta de Comandos (Ctrl + P)"
        >
          <Search className="w-4 h-4" />
        </button>

        <button
          onClick={onOpenDailyNote}
          className="w-8 h-8 flex items-center justify-center text-zinc-400 hover:text-[var(--accent)] hover:bg-zinc-800/50 rounded-lg transition-colors cursor-pointer"
          title="Abrir Nota Diária de Hoje"
        >
          <Calendar className="w-4 h-4" />
        </button>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* 4. Bottom Utilities: Conversations History, Vault Switcher & Settings */}
      <div className="flex flex-col items-center gap-1">
        {onToggleConversations && (
          <button
            onClick={onToggleConversations}
            style={isConversationsOpen ? { backgroundColor: 'var(--accent-glow-subtle, rgba(197, 155, 39, 0.2))', borderColor: 'var(--accent, #d4af37)', color: 'var(--accent, #d4af37)' } : undefined}
            className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors cursor-pointer ${
              isConversationsOpen
                ? 'border'
                : 'text-zinc-400 hover:text-[var(--accent)] hover:bg-zinc-800/50'
            }`}
            title="Histórico de Conversas do Agente"
          >
            <MessageSquare className="w-4 h-4" />
          </button>
        )}

        {onOpenVaultSwitcher && (
          <button
            onClick={onOpenVaultSwitcher}
            className="w-8 h-8 flex items-center justify-center text-zinc-400 hover:text-[var(--accent)] hover:bg-zinc-800/50 rounded-lg transition-colors cursor-pointer"
            title="Alternar / Gerenciar Cofres (Ctrl + Shift + O)"
          >
            <FolderSync className="w-4 h-4" />
          </button>
        )}

        <button
          onClick={onOpenSettings}
          className="w-8 h-8 flex items-center justify-center text-zinc-400 hover:text-[var(--accent)] hover:bg-zinc-800/50 rounded-lg transition-colors cursor-pointer"
          title="Configurações e Personalização"
        >
          <SlidersHorizontal className="w-4 h-4" />
        </button>
      </div>
    </aside>
  )
}
