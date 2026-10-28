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
  CheckCircle2,
  Brain,
  Sun,
  Moon
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
  isMindMapActive?: boolean
  onOpenMindMap?: () => void
  themeMode?: 'dark' | 'light'
  onToggleTheme?: () => void
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
  onToggleConversations,
  isMindMapActive,
  onOpenMindMap,
  themeMode,
  onToggleTheme
}) => {
  const isEditorActive = isLeftSidebarOpen && currentView === 'editor' && !isMindMapActive

  return (
    <aside className="app-ribbon w-11 h-full bg-[#09090b] border-r border-zinc-800/80 flex flex-col items-center py-2 select-none shrink-0 text-zinc-400 z-10">
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
          onClick={() => {
            if (currentView === 'editor' && !isMindMapActive) {
              onToggleLeftSidebar()
            } else {
              if (!isLeftSidebarOpen) onToggleLeftSidebar()
              onChangeView('editor')
            }
          }}
          style={isEditorActive ? { backgroundColor: 'var(--accent-subtle, var(--accent-glow-subtle))', color: 'var(--accent-icon, var(--accent))' } : undefined}
          className={`w-8 h-8 flex items-center justify-center rounded-lg transition-all cursor-pointer ${
            isEditorActive
              ? 'app-ribbon-active shadow-none'
              : 'text-zinc-400 hover:text-[var(--accent-icon,var(--accent))] hover:bg-zinc-800/50'
          }`}
          title="Editor de Notas / Explorador de Arquivos"
        >
          <FileText className="w-4 h-4" />
        </button>

        <button
          onClick={() => onChangeView('graph')}
          style={currentView === 'graph' ? { backgroundColor: 'var(--accent-subtle, var(--accent-glow-subtle))', color: 'var(--accent-icon, var(--accent))' } : undefined}
          className={`w-8 h-8 flex items-center justify-center rounded-lg transition-all cursor-pointer ${
            currentView === 'graph'
              ? 'app-ribbon-active shadow-none'
              : 'text-zinc-400 hover:text-[var(--accent-icon,var(--accent))] hover:bg-zinc-800/50'
          }`}
          title="Grafo de Conhecimento"
        >
          <Share2 className="w-4 h-4" />
        </button>

        <button
          onClick={() => onChangeView('canvas')}
          style={currentView === 'canvas' ? { backgroundColor: 'var(--accent-subtle, var(--accent-glow-subtle))', color: 'var(--accent-icon, var(--accent))' } : undefined}
          className={`w-8 h-8 flex items-center justify-center rounded-lg transition-all cursor-pointer ${
            currentView === 'canvas'
              ? 'app-ribbon-active shadow-none'
              : 'text-zinc-400 hover:text-[var(--accent-icon,var(--accent))] hover:bg-zinc-800/50'
          }`}
          title="Quadros de Desenho / Canvas (Excalidraw)"
        >
          <Palette className="w-4 h-4" />
        </button>

        <button
          onClick={() => onChangeView('tasks')}
          style={currentView === 'tasks' ? { backgroundColor: 'var(--accent-subtle, var(--accent-glow-subtle))', color: 'var(--accent-icon, var(--accent))' } : undefined}
          className={`w-8 h-8 flex items-center justify-center rounded-lg transition-all cursor-pointer ${
            currentView === 'tasks'
              ? 'app-ribbon-active shadow-none'
              : 'text-zinc-400 hover:text-[var(--accent-icon,var(--accent))] hover:bg-zinc-800/50'
          }`}
          title="Tarefas do Workspace"
        >
          <CheckCircle2 className="w-4 h-4" />
        </button>

        {/* Mapas Mentais */}
        <button
          onClick={onOpenMindMap}
          style={isMindMapActive ? { backgroundColor: 'var(--accent-subtle, var(--accent-glow-subtle))', color: 'var(--accent-icon, var(--accent))' } : undefined}
          className={`w-8 h-8 flex items-center justify-center rounded-lg transition-all cursor-pointer ${
            isMindMapActive
              ? 'app-ribbon-active shadow-none'
              : 'text-zinc-400 hover:text-[var(--accent-icon,var(--accent))] hover:bg-zinc-800/50'
          }`}
          title="Mapas Mentais"
        >
          <Brain className="w-4 h-4" />
        </button>

        {/* AI Agent Icon right below Canvas */}
        <button
          onClick={onToggleAi}
          style={isAiOpen ? { backgroundColor: 'var(--accent-subtle, var(--accent-glow-subtle))', color: 'var(--accent-icon, var(--accent))' } : undefined}
          className={`w-8 h-8 flex items-center justify-center rounded-lg transition-all cursor-pointer ${
            isAiOpen
              ? 'app-ribbon-active shadow-none'
              : 'text-zinc-400 hover:text-[var(--accent-icon,var(--accent))] hover:bg-zinc-800/50'
          }`}
          title="Agente Pyrite"
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
            style={isConversationsOpen ? { backgroundColor: 'var(--accent-subtle, var(--accent-glow-subtle))', color: 'var(--accent-icon, var(--accent))' } : undefined}
            className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors cursor-pointer ${
              isConversationsOpen
                ? 'app-ribbon-active shadow-none'
                : 'text-zinc-400 hover:text-[var(--accent-icon,var(--accent))] hover:bg-zinc-800/50'
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

        {onToggleTheme && (
          <button
            onClick={onToggleTheme}
            className="w-8 h-8 flex items-center justify-center text-zinc-400 hover:text-[var(--accent)] hover:bg-zinc-800/50 rounded-lg transition-colors cursor-pointer"
            title={themeMode === 'light' ? 'Mudar para Modo Escuro' : 'Mudar para Modo Claro'}
          >
            {themeMode === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
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
