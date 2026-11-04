import React, { useState, useRef, useEffect, useMemo } from 'react'
import { Search, Tag, Check, Plus, Trash2, X } from 'lucide-react'
import { TaskLabelBadge } from './TaskLabelBadge'

interface TaskLabelPickerProps {
  selectedLabels: string[]
  allSavedLabels: string[]
  onToggleLabel: (label: string) => void
  onCreateLabel: (label: string) => void
  onDeleteSavedLabel?: (label: string) => void
  onClose: () => void
  anchorEl?: HTMLElement | null
  align?: 'left' | 'right'
}

export const TaskLabelPicker: React.FC<TaskLabelPickerProps> = ({
  selectedLabels = [],
  allSavedLabels = [],
  onToggleLabel,
  onCreateLabel,
  onDeleteSavedLabel,
  onClose,
  align = 'left'
}) => {
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    inputRef.current?.focus()

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }

    document.addEventListener('mousedown', handleClickOutside)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  const cleanQuery = query.trim().replace(/^#/, '')

  const filteredLabels = useMemo(() => {
    if (!cleanQuery) return allSavedLabels
    const lower = cleanQuery.toLowerCase()
    return allSavedLabels.filter(l => l.toLowerCase().includes(lower))
  }, [allSavedLabels, cleanQuery])

  const exactMatchExists = useMemo(() => {
    if (!cleanQuery) return true
    return allSavedLabels.some(l => l.toLowerCase() === cleanQuery.toLowerCase())
  }, [allSavedLabels, cleanQuery])

  const handleCreateAndSelect = () => {
    if (!cleanQuery) return
    onCreateLabel(cleanQuery)
    setQuery('')
  }

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!exactMatchExists && cleanQuery) {
      handleCreateAndSelect()
    } else if (filteredLabels.length > 0) {
      onToggleLabel(filteredLabels[0])
      setQuery('')
    }
  }

  return (
    <div
      ref={containerRef}
      onClick={e => e.stopPropagation()}
      className={`absolute top-full mt-1.5 z-50 w-64 rounded-xl bg-[#141417] border border-zinc-700/80 shadow-2xl overflow-hidden flex flex-col text-xs animate-in fade-in zoom-in-95 duration-100 ${
        align === 'right' ? 'right-0' : 'left-0'
      }`}
    >
      {/* Search & Add Header */}
      <div className="p-2 border-b border-zinc-800/80 bg-[#101013] flex items-center gap-2">
        <Tag className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
        <form onSubmit={handleFormSubmit} className="flex-1 flex items-center min-w-0">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Buscar ou criar rótulo..."
            className="w-full bg-transparent text-zinc-200 placeholder-zinc-500 text-xs focus:outline-none"
          />
        </form>
        {query ? (
          <button
            type="button"
            onClick={() => setQuery('')}
            className="text-zinc-500 hover:text-zinc-300 cursor-pointer"
          >
            <X className="w-3 h-3" />
          </button>
        ) : (
          <Search className="w-3 h-3 text-zinc-600 shrink-0" />
        )}
      </div>

      {/* Create New Option */}
      {!exactMatchExists && cleanQuery && (
        <button
          type="button"
          onClick={handleCreateAndSelect}
          className="px-3 py-2 text-left bg-zinc-850/60 hover:bg-zinc-800 border-b border-zinc-800/80 flex items-center gap-2 transition-colors cursor-pointer text-zinc-200"
        >
          <Plus className="w-3.5 h-3.5 text-[var(--accent,#c59b27)] shrink-0" />
          <span className="truncate flex-1">
            Criar rótulo <span className="font-semibold text-white">"{cleanQuery}"</span>
          </span>
          <TaskLabelBadge label={cleanQuery} size="xs" />
        </button>
      )}

      {/* Saved Labels List */}
      <div className="max-h-56 overflow-y-auto custom-chat-scrollbar p-1.5 space-y-0.5">
        <div className="text-[10px] font-semibold text-zinc-500 px-2 py-1 uppercase tracking-wider flex items-center justify-between">
          <span>Rótulos Disponíveis</span>
          <span className="font-mono text-[9px]">{filteredLabels.length}</span>
        </div>

        {filteredLabels.length === 0 && (
          <div className="py-6 px-3 text-center text-zinc-500 text-xs">
            {cleanQuery ? 'Nenhum rótulo encontrado com esse nome.' : 'Nenhum rótulo cadastrado ainda. Digite um nome acima para criar o primeiro.'}
          </div>
        )}

        {filteredLabels.map(label => {
          const isSelected = selectedLabels.some(l => l.toLowerCase() === label.toLowerCase())

          return (
            <div
              key={label}
              className={`group/item flex items-center justify-between px-2 py-1.5 rounded-lg transition-colors cursor-pointer ${
                isSelected ? 'bg-zinc-800/80 text-white' : 'hover:bg-zinc-850/60 text-zinc-300'
              }`}
              onClick={() => onToggleLabel(label)}
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <TaskLabelBadge label={label} size="sm" />
              </div>

              <div className="flex items-center gap-1 shrink-0">
                {onDeleteSavedLabel && !isSelected && (
                  <button
                    type="button"
                    onClick={e => {
                      e.stopPropagation()
                      onDeleteSavedLabel(label)
                    }}
                    className="opacity-0 group-hover/item:opacity-100 p-1 text-zinc-500 hover:text-rose-400 rounded transition-all cursor-pointer"
                    title="Excluir rótulo salvo"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}

                <div
                  className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                    isSelected ? 'shadow-xs' : 'border-zinc-700 bg-zinc-900 group-hover/item:border-zinc-500'
                  }`}
                  style={
                    isSelected
                      ? {
                          backgroundColor: 'var(--accent, #c59b27)',
                          borderColor: 'var(--accent, #c59b27)',
                          color: '#09090b'
                        }
                      : undefined
                  }
                >
                  {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default TaskLabelPicker
