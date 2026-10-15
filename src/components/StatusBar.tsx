import React from 'react'
import type { Note } from '../types'
import { getBacklinks } from '../utils/vault'
import { Link2 } from 'lucide-react'

interface StatusBarProps {
  currentNote?: Note
  allNotes: Note[]
  onOpenGraph: () => void
  onOpenCommandPalette: () => void
}

export const StatusBar: React.FC<StatusBarProps> = ({
  currentNote,
  allNotes,
  onOpenGraph,
  onOpenCommandPalette
}) => {
  const words = currentNote?.content.trim() ? currentNote.content.trim().split(/\s+/).length : 0
  const chars = currentNote?.content.length || 0
  const backlinks = currentNote ? getBacklinks(currentNote, allNotes) : []

  return (
    <footer className="h-6 bg-[#0c0c0e] border-t border-zinc-800/80 px-3 flex items-center justify-between text-[11px] text-zinc-500 select-none shrink-0 font-sans">
      {/* Left status: Vault stats */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 text-zinc-400">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span>Local Vault</span>
        </div>

        <span className="text-zinc-700">|</span>

        <button
          onClick={onOpenGraph}
          className="hover:text-amber-300 transition-colors flex items-center gap-1"
          title="Ver no Grafo de Conhecimento"
        >
          <span>{allNotes.length} notas</span>
        </button>

        {currentNote && (
          <>
            <span className="text-zinc-700">|</span>
            <div className="flex items-center gap-1 text-zinc-400">
              <Link2 className="w-3 h-3 text-amber-400" />
              <span>{backlinks.length} backlinks</span>
            </div>
          </>
        )}
      </div>

      {/* Right status: Active note metrics & encoding */}
      <div className="flex items-center gap-3">
        {currentNote && (
          <div className="flex items-center gap-2">
            <span>{words} palavras</span>
            <span>•</span>
            <span>{chars} caracteres</span>
          </div>
        )}

        <span className="text-zinc-700">|</span>

        <span className="font-mono text-[10px] text-zinc-600">UTF-8</span>

        <span className="text-zinc-700">|</span>

        <button
          onClick={onOpenCommandPalette}
          className="hover:text-zinc-300 text-[10px] bg-zinc-900 border border-zinc-800 px-1.5 py-0.2 rounded font-mono transition-colors"
          title="Abrir Paleta de Comandos (Ctrl + P)"
        >
          Ctrl+P
        </button>
      </div>
    </footer>
  )
}
