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
      return <Palette className="w-3.5 h-3.5 text-amber-400 shrink-0" />
    }
    if (note.title.toLowerCase().includes('why') || note.title.toLowerCase().includes('web') || note.title.toLowerCase().includes('site')) {
      return <Globe className="w-3.5 h-3.5 text-blue-400 shrink-0" />
    }
    return <FileText className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
  }

  return (
    <div
      ref={containerRef}
      className="absolute top-full left-0 mt-1 w-72 max-w-sm bg-[#1c1c21] border border-zinc-700/80 rounded-xl shadow-2xl z-50 overflow-hidden flex flex-col text-xs animate-in fade-in zoom-in-95 duration-100"
    >
      {/* Header Search */}
      <div className="p-2 border-b border-zinc-800 bg-[#16161a] flex items-center gap-2">
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
          <button onClick={() => setSearch('')} className="text-zinc-500 hover:text-zinc-300">
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Option to clear context */}
      {selectedNoteId && (
        <button
          onClick={() => {
            onSelectNote(null)
            onClose()
          }}
          className="flex items-center justify-between px-3 py-1.5 text-left text-[11px] text-zinc-400 hover:text-rose-400 hover:bg-zinc-800/50 border-b border-zinc-800/40 transition-colors"
        >
          <span>Remover vínculo de contexto</span>
          <X className="w-3 h-3" />
        </button>
      )}

      {/* List of Notes */}
      <div className="max-h-56 overflow-y-auto py-1 custom-chat-scrollbar">
        {filteredNotes.length === 0 ? (
          <div className="px-3 py-4 text-center text-zinc-500 text-[11px]">
            Nenhuma nota encontrada
          </div>
        ) : (
          filteredNotes.map(note => {
            const isSelected = note.id === selectedNoteId
            return (
              <button
                key={note.id}
                onClick={() => {
                  onSelectNote(isSelected ? null : note)
                  onClose()
                }}
                className={`w-full flex items-center justify-between px-3 py-2 text-left hover:bg-zinc-800/70 transition-colors group cursor-pointer ${
                  isSelected ? 'bg-zinc-800/90 text-zinc-100 font-medium' : 'text-zinc-300'
                }`}
              >
                <div className="flex items-center gap-2 truncate min-w-0 pr-2">
                  <div className="w-5 h-5 rounded-md bg-zinc-800/80 flex items-center justify-center shrink-0">
                    {getNoteIcon(note)}
                  </div>
                  <div className="truncate">
                    <div className="truncate text-xs">{note.title}</div>
                    {note.folder && note.folder !== 'Início' && (
                      <div className="text-[9.5px] text-zinc-500 truncate">{note.folder}</div>
                    )}
                  </div>
                </div>

                <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                  isSelected ? 'bg-amber-500 border-amber-400 text-zinc-950' : 'border-zinc-700 bg-zinc-900 group-hover:border-zinc-500'
                }`}>
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
