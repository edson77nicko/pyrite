import React, { useState, useEffect } from 'react'
import type { Note } from '../types'
import { DrawEditor } from './DrawEditor'
import { Palette, Plus } from 'lucide-react'

interface CanvasViewProps {
  notes: Note[]
  currentNoteId?: string
  vaultPath?: string
  onSelectNote: (noteId: string) => void
  onCreateDraw: (folder?: string, title?: string) => void
  onUpdateNote: (note: Note) => void
}

export const CanvasView: React.FC<CanvasViewProps> = ({
  notes,
  currentNoteId,
  onSelectNote,
  onCreateDraw,
  onUpdateNote
}) => {
  const drawNotes = notes.filter(n => n.type === 'draw')

  // Find active draw: either currentNoteId if it's a draw, or the first draw note
  const initialActiveId = (drawNotes.some(n => n.id === currentNoteId) ? currentNoteId : drawNotes[0]?.id) || ''

  const [activeDrawId, setActiveDrawId] = useState<string>(initialActiveId)

  useEffect(() => {
    if (drawNotes.some(n => n.id === currentNoteId)) {
      setActiveDrawId(currentNoteId!)
    } else if (!drawNotes.some(n => n.id === activeDrawId) && drawNotes.length > 0) {
      setActiveDrawId(drawNotes[0].id)
    }
  }, [currentNoteId, drawNotes, activeDrawId])

  const activeDraw = drawNotes.find(n => n.id === activeDrawId) || drawNotes[0]

  // If there are no draw notes yet, show a welcoming hero screen
  if (drawNotes.length === 0) {
    return (
      <div className="draw-empty-state-wrapper w-full h-full flex flex-col items-center justify-center bg-[#111114] text-zinc-100 p-8 select-none">
        <div className="draw-empty-state-card max-w-md w-full flex flex-col items-center text-center p-8 bg-[#18181d] border border-zinc-800 rounded-2xl shadow-2xl backdrop-blur-md">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5 shadow-lg"
            style={{ backgroundColor: 'var(--accent-glow)', borderColor: 'var(--accent)', borderWidth: 1 }}
          >
            <Palette className="w-8 h-8" style={{ color: 'var(--accent)' }} />
          </div>

          <h2 className="text-xl font-bold tracking-tight text-white mb-2">
            Pyrite Draw
          </h2>

          <p className="text-sm text-zinc-400 leading-relaxed mb-6">
            Nossa versão de quadro de desenho inspirada no Excalidraw. Crie esboços livres, diagramas de fluxo, formas geométricas e anotações visuais.
            Cada desenho é salvo como um item único no seu cofre, lado a lado com suas notas.
          </p>

          <button
            onClick={() => onCreateDraw()}
            className="draw-create-btn flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all shadow-md hover:opacity-95 hover:scale-[1.02] cursor-pointer"
            style={{ backgroundColor: 'var(--accent)', color: '#ffffff' }}
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>Criar Primeiro Draw</span>
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="relative w-full h-full flex flex-col bg-[#111114] overflow-hidden">
      {/* Top Bar for Switcher between Draws */}
      <div className="h-9 px-3 bg-[#141418] border-b border-zinc-800/80 flex items-center justify-between text-xs select-none shrink-0 z-10">
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-1">
          <div className="flex items-center gap-1 mr-2 text-zinc-400 font-medium">
            <Palette className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
            <span>Draws:</span>
          </div>

          {drawNotes.map(draw => {
            const isActive = draw.id === activeDraw?.id
            return (
              <button
                key={draw.id}
                onClick={() => {
                  setActiveDrawId(draw.id)
                  onSelectNote(draw.id)
                }}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition-all cursor-pointer truncate max-w-[150px] ${
                  isActive
                    ? 'bg-zinc-800 text-white font-medium shadow-xs border border-zinc-700'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-850'
                }`}
                style={isActive ? { borderColor: 'var(--accent-glow)' } : undefined}
                title={`${draw.title} (${draw.folder || 'Início'})`}
              >
                <span className="truncate">{draw.title}</span>
              </button>
            )
          })}
        </div>

        <button
          onClick={() => onCreateDraw()}
          className="flex items-center gap-1 px-2.5 py-1 rounded-md text-zinc-950 font-semibold text-xs transition-opacity hover:opacity-90 shadow-xs cursor-pointer shrink-0 ml-2"
          style={{ backgroundColor: 'var(--accent)' }}
          title="Criar Novo Quadro de Desenho"
        >
          <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
          <span>Novo Draw</span>
        </button>
      </div>

      {/* Main Draw Surface */}
      <div className="flex-1 w-full h-full overflow-hidden relative">
        {activeDraw && (
          <DrawEditor
            key={activeDraw.id}
            note={activeDraw}
            onUpdateNote={onUpdateNote}
          />
        )}
      </div>
    </div>
  )
}
export default CanvasView
