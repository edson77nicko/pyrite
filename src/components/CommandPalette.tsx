import React, { useState, useEffect, useRef } from 'react'
import type { Note, ViewMode } from '../types'
import {
  Search,
  FileText,
  Share2,
  Layout,
  Plus,
  Sparkles,
  HardDrive,
  FolderSync,
  Palette
} from 'lucide-react'

interface CommandPaletteProps {
  isOpen: boolean
  onClose: () => void
  notes: Note[]
  onSelectNote: (noteId: string) => void
  onCreateNote: (folder?: string, title?: string, type?: any) => void
  onCreateDraw?: (folder?: string, title?: string) => void
  onChangeViewMode: (mode: ViewMode) => void
  onOpenAi: () => void
  onOpenLocalFolder: () => void
  onOpenVaultSwitcher?: () => void
}

interface PaletteItem {
  id: string
  title: string
  subtitle?: string
  icon: React.ReactNode
  action: () => void
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  notes,
  onSelectNote,
  onCreateNote,
  onCreateDraw,
  onChangeViewMode,
  onOpenAi,
  onOpenLocalFolder,
  onOpenVaultSwitcher
}) => {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (isOpen) {
      setQuery('')
      setSelectedIndex(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [isOpen])

  if (!isOpen) return null

  // Built-in system commands
  const defaultCommands: PaletteItem[] = [
    {
      id: 'cmd-new-note',
      title: 'Criar Nova Nota',
      subtitle: 'Cria uma nova nota em branco',
      icon: <Plus className="w-4 h-4 text-emerald-400" />,
      action: () => onCreateNote(undefined, undefined, 'note')
    },
    {
      id: 'cmd-new-draw',
      title: 'Criar Novo Draw (Desenho)',
      subtitle: 'Quadro em branco estilo Excalidraw',
      icon: <Palette className="w-4 h-4 text-[#c59b27]" />,
      action: () => onCreateDraw ? onCreateDraw() : onCreateNote(undefined, undefined, 'draw')
    },
    {
      id: 'cmd-open-graph',
      title: 'Abrir Grafo de Conhecimento',
      subtitle: 'Visualizar todas as conexões em 2D',
      icon: <Share2 className="w-4 h-4 text-amber-400" />,
      action: () => onChangeViewMode('graph')
    },
    {
      id: 'cmd-open-canvas',
      title: 'Abrir Canvas Visual / Draws',
      subtitle: 'Quadros infinitos e desenhos livres',
      icon: <Layout className="w-4 h-4 text-cyan-400" />,
      action: () => onChangeViewMode('canvas')
    },
    {
      id: 'cmd-open-ai',
      title: 'Assistente de IA do Vault',
      subtitle: 'Resumo, sugestão de links e chat com notas',
      icon: <Sparkles className="w-4 h-4 text-amber-400" />,
      action: () => onOpenAi()
    },
    {
      id: 'cmd-open-local',
      title: 'Conectar Pasta Local do PC',
      subtitle: 'Usa uma pasta real do seu computador como Vault',
      icon: <HardDrive className="w-4 h-4 text-blue-400" />,
      action: () => onOpenLocalFolder()
    },
    ...(onOpenVaultSwitcher ? [{
      id: 'cmd-vault-switcher',
      title: 'Alternar / Gerenciar Cofres (Vault Switcher)',
      subtitle: 'Abrir lista de cofres conectados, criar ou alternar de cofre (Ctrl+Shift+O)',
      icon: <FolderSync className="w-4 h-4 text-[#c59b27]" />,
      action: () => {
        onClose()
        onOpenVaultSwitcher()
      }
    }] : [])
  ]

  // Note items matching query
  const noteItems: PaletteItem[] = notes
    .filter(n => n.title.toLowerCase().includes(query.toLowerCase()) || n.tags.some(t => t.toLowerCase().includes(query.toLowerCase())))
    .map(n => {
      const isDraw = n.type === 'draw'
      return {
        id: `note-${n.id}`,
        title: n.title,
        subtitle: `${isDraw ? 'Desenho / Draw' : 'Nota'} • Pasta: ${n.folder} • ${n.tags.map(t => `#${t}`).join(' ')}`,
        icon: isDraw ? <Palette className="w-4 h-4 text-[#c59b27]" /> : <FileText className="w-4 h-4 text-zinc-400" />,
        action: () => onSelectNote(n.id)
      }
    })

  const commandItems = defaultCommands.filter(c =>
    c.title.toLowerCase().includes(query.toLowerCase()) || (c.subtitle && c.subtitle.toLowerCase().includes(query.toLowerCase()))
  )

  const allItems = [...commandItems, ...noteItems]

  // If query doesn't match existing note, offer to create one with this title
  if (query.trim() && !notes.some(n => n.title.toLowerCase() === query.trim().toLowerCase())) {
    allItems.unshift({
      id: 'cmd-create-custom',
      title: `Criar nota: "${query.trim()}"`,
      subtitle: 'Criar e abrir instantaneamente',
      icon: <Plus className="w-4 h-4 text-amber-400" />,
      action: () => onCreateNote(query.trim())
    })
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex(idx => (idx + 1) % Math.max(1, allItems.length))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex(idx => (idx - 1 + allItems.length) % Math.max(1, allItems.length))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (allItems[selectedIndex]) {
        allItems[selectedIndex].action()
        onClose()
      }
    } else if (e.key === 'Escape') {
      onClose()
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-start justify-center pt-24"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl bg-zinc-900 border border-zinc-700/80 rounded-xl shadow-2xl overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Search Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800 bg-[#0c0c0e]">
          <Search className="w-5 h-5 text-amber-400" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => {
              setQuery(e.target.value)
              setSelectedIndex(0)
            }}
            onKeyDown={handleKeyDown}
            placeholder="Digite um comando ou o nome de uma nota..."
            className="flex-1 bg-transparent text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none"
          />
          <kbd className="px-2 py-0.5 bg-zinc-800 border border-zinc-700 rounded text-[10px] text-zinc-400 font-mono">
            ESC
          </kbd>
        </div>

        {/* Results List */}
        <div className="max-h-80 overflow-y-auto p-2 space-y-1">
          {allItems.length === 0 ? (
            <div className="p-4 text-center text-xs text-zinc-500">
              Nenhum resultado encontrado.
            </div>
          ) : (
            allItems.map((item, index) => {
              const isSelected = index === selectedIndex
              return (
                <div
                  key={item.id}
                  onClick={() => {
                    item.action()
                    onClose()
                  }}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={`flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                    isSelected ? 'bg-amber-500/15 border border-amber-500/40 text-amber-200' : 'text-zinc-300 hover:bg-zinc-800/60'
                  }`}
                >
                  <div className="flex items-center gap-3 truncate">
                    {item.icon}
                    <div className="truncate">
                      <div className="text-xs font-medium text-zinc-100 truncate">{item.title}</div>
                      {item.subtitle && <div className="text-[11px] text-zinc-500 truncate">{item.subtitle}</div>}
                    </div>
                  </div>
                  {isSelected && (
                    <span className="text-[10px] text-amber-400 font-mono">↵ Abrir</span>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
