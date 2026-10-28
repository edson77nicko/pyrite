import React, { useState, useRef, useEffect } from 'react'
import type { Note } from '../types'
import { Search, FileText, Palette, Globe, Check, X } from 'lucide-react'

interface TaskContextPickerProps {
  allNotes: Note[]
  selectedNoteId?: string
  onSelectNote: (note: Note | null) => void
  onClose: () => void
}

export const TaskContextPicker: React.FC<TaskContextPickerProps> = ({
  allNotes,
  selectedNoteId,
  onSelectNote,
  onClose
}) => {
  const [search, setSearch] = useState('')
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

  const filteredNotes = allNotes.filter(n =>
    n.title.toLowerCase().includes(search.toLowerCase()) ||
    (n.folder && n.folder.toLowerCase().includes(search.toLowerCase())) ||
    n.tags.some(t => t.toLowerCase().includes(search.toLowerCase()))
  )

  const getNoteIcon = (note: Note) => {
    if (note.type === 'draw') {
      return <Palette className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--accent, #c59b27)' }} />
    }
    if (note.title.toLowerCase().includes('why') || note.title.toLowerCase().includes('web') || note.title.toLowerCase().includes('site')) {
      return <Globe className="w-3.5 h-3.5 text-blue-400 shrink-0" />
    }
    return <FileText className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
  }

  return (
    <div
      ref={containerRef}
      className="task-context-picker-popup absolute top-full left-0 mt-1 w-72 max-w-sm bg-[#121215] border border-zinc-750 rounded-xl shadow-md z-50 overflow-hidden flex flex-col text-xs animate-in fade-in zoom-in-95 duration-100"
    >
      {/* Header Search */}
      <div className="p-2 border-b border-zinc-800/60 bg-[#0f0f12] flex items-center gap-2">
        <Search className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
        <input
          ref={inputRef}
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar notas do cofre..."
          className="w-full bg-transparent text-zinc-200 placeholder-zinc-500 text-xs focus:outline-none"
        />
        {search && (
          <button onClick={() => setSearch('')} className="text-zinc-500 hover:text-zinc-300 cursor-pointer">
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Clear Selection Option */}
      {selectedNoteId && (
        <button
          onClick={() => {
            onSelectNote(null)
            onClose()
          }}
          className="px-3 py-1.5 text-left text-zinc-400 hover:text-rose-400 hover:bg-zinc-850/50 border-b border-zinc-800/40 flex items-center gap-2 transition-colors cursor-pointer"
        >
          <X className="w-3 h-3 text-rose-400" />
          <span>Remover vínculo com nota</span>
        </button>
      )}

      {/* Notes List */}
      <div className="max-h-60 overflow-y-auto custom-chat-scrollbar p-1 space-y-0.5">
        {filteredNotes.length === 0 ? (
          <div className="p-4 text-center text-zinc-500 text-xs">
            Nenhuma nota encontrada.
          </div>
        ) : (
          filteredNotes.map(note => {
            const isSelected = note.id === selectedNoteId
            return (
              <button
                key={note.id}
                onClick={() => {
                  onSelectNote(note)
                  onClose()
                }}
                className={`w-full group flex items-center justify-between p-2 rounded-lg text-left transition-colors cursor-pointer ${
                  isSelected ? 'bg-zinc-800/70 text-zinc-100 font-medium' : 'text-zinc-300 hover:bg-zinc-850/50'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  {getNoteIcon(note)}
                  <div className="min-w-0">
                    <div className="truncate text-xs">{note.title}</div>
                    {note.folder && note.folder !== 'Início' && (
                      <div className="text-[9.5px] text-zinc-500 truncate">{note.folder}</div>
                    )}
                  </div>
                </div>

                <div
                  className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                    isSelected ? 'shadow-xs' : 'border-zinc-700 bg-zinc-900 group-hover:border-zinc-500'
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
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
export default TaskContextPicker
