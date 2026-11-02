import React, { useState, useRef, useEffect } from 'react'
import type { Note } from '../types'
import { FileText, ChevronDown, Search, X, Check, Folder } from 'lucide-react'

export interface CustomNotePickerProps {
  notes: Note[]
  selectedNoteId?: string
  onSelect: (note: Note | null) => void
  placeholder?: string
  className?: string
  buttonClassName?: string
  disabled?: boolean
}

export const CustomNotePicker: React.FC<CustomNotePickerProps> = ({
  notes,
  selectedNoteId,
  onSelect,
  placeholder = 'Selecionar nota do cofre...',
  className = '',
  buttonClassName = '',
  disabled = false
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const selectedNote = notes.find(n => n.id === selectedNoteId)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
        setSearch('')
      }
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false)
        setSearch('')
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      window.addEventListener('keydown', handleKeyDown)
      setTimeout(() => searchInputRef.current?.focus(), 50)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  const filteredNotes = notes.filter(n => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (
      n.title.toLowerCase().includes(q) ||
      (n.folder && n.folder.toLowerCase().includes(q)) ||
      (n.tags && n.tags.some(t => t.toLowerCase().includes(q)))
    )
  })

  return (
    <div
      ref={containerRef}
      data-no-pan="true"
      className={`relative inline-block w-full ${className}`}
      onPointerDown={e => e.stopPropagation()}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen(prev => !prev)}
        className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl border transition-all text-xs cursor-pointer select-none ${
          disabled
            ? 'opacity-50 cursor-not-allowed bg-zinc-900 border-zinc-800 text-zinc-500'
            : isOpen
            ? 'bg-[#1c1c1f] border-zinc-700 text-zinc-100 shadow-xs'
            : 'bg-[#18181b] hover:bg-[#1c1c1f] border-zinc-800/90 hover:border-zinc-700 text-zinc-200'
        } ${buttonClassName}`}
      >
        <div className="flex items-center gap-1.5 min-w-0 truncate">
          <FileText className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
          <span className="truncate font-medium">
            {selectedNote ? selectedNote.title : placeholder}
          </span>
          {selectedNote?.folder && selectedNote.folder !== 'Início' && (
            <span className="text-[10px] text-zinc-500 bg-zinc-900/80 px-1 rounded truncate">
              {selectedNote.folder}
            </span>
          )}
        </div>
        <ChevronDown
          className={`w-3.5 h-3.5 text-zinc-500 shrink-0 transition-transform duration-150 ${
            isOpen ? 'rotate-180 text-zinc-300' : ''
          }`}
        />
      </button>

      {isOpen && (
        <div
          data-no-pan="true"
          className="absolute top-full mt-1.5 left-0 w-full min-w-[240px] max-w-sm bg-[#18181b] border border-zinc-800 rounded-xl shadow-2xl p-1.5 z-50 flex flex-col text-xs animate-in fade-in zoom-in-95 duration-100"
          style={{ maxHeight: 280 }}
        >
          {/* Campo de Busca Rápida */}
          <div className="p-1 border-b border-zinc-800/80 mb-1 flex items-center gap-1.5">
            <Search className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
            <input
              ref={searchInputRef}
              type="text"
              autoComplete="off"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar notas do cofre..."
              className="w-full bg-transparent text-[11px] text-zinc-200 placeholder-zinc-500 focus:outline-none"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="text-zinc-500 hover:text-zinc-300 cursor-pointer p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Opção para desselecionar */}
          {selectedNoteId && (
            <button
              type="button"
              onClick={() => {
                onSelect(null)
                setIsOpen(false)
                setSearch('')
              }}
              className="px-2 py-1 mb-1 rounded-lg text-left text-zinc-400 hover:text-rose-400 hover:bg-zinc-800/50 flex items-center gap-1.5 text-[11px] transition-colors cursor-pointer"
            >
              <X className="w-3 h-3 text-rose-400" />
              <span>Limpar seleção de nota</span>
            </button>
          )}

          {/* Lista de Notas */}
          <div className="overflow-y-auto space-y-0.5 custom-chat-scrollbar max-h-52 pr-0.5">
            {filteredNotes.length === 0 ? (
              <div className="text-[11px] text-zinc-500 py-3 text-center">
                Nenhuma nota encontrada
              </div>
            ) : (
              filteredNotes.map(n => {
                const isSelected = n.id === selectedNoteId
                return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => {
                      onSelect(n)
                      setIsOpen(false)
                      setSearch('')
                    }}
                    className={`w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg text-left transition-colors cursor-pointer text-xs ${
                      isSelected
                        ? 'bg-zinc-800 text-white font-medium shadow-xs'
                        : 'text-zinc-300 hover:bg-zinc-800/60 hover:text-zinc-100'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0 truncate">
                      <FileText className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                      <div className="min-w-0 truncate">
                        <div className="truncate font-medium">{n.title}</div>
                        {n.folder && n.folder !== 'Início' && (
                          <div className="text-[10px] text-zinc-500 truncate flex items-center gap-1">
                            <Folder className="w-2.5 h-2.5 text-zinc-600" />
                            <span>{n.folder}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    {isSelected && (
                      <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 ml-1" />
                    )}
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
