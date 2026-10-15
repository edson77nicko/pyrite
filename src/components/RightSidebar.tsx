import React, { useState } from 'react'
import type { Note } from '../types'
import { getBacklinks, getOutgoingLinks } from '../utils/vault'
import {
  Link2,
  ArrowUpRight,
  List,
  Tag
} from 'lucide-react'

interface RightSidebarProps {
  currentNote?: Note
  allNotes: Note[]
  onSelectNote: (noteId: string) => void
  isOpen: boolean
}

export const RightSidebar: React.FC<RightSidebarProps> = ({
  currentNote,
  allNotes,
  onSelectNote,
  isOpen
}) => {
  const [activeTab, setActiveTab] = useState<'links' | 'outline' | 'tags'>('links')

  if (!isOpen || !currentNote) return null

  const backlinks = getBacklinks(currentNote, allNotes)
  const outgoingLinks = getOutgoingLinks(currentNote, allNotes)

  // Extract headings for Outline
  const headings = currentNote.content
    .split('\n')
    .filter(l => l.startsWith('#'))
    .map(line => {
      const match = line.match(/^(#{1,6})\s+(.*)$/)
      if (match) {
        return {
          level: match[1].length,
          text: match[2].trim()
        }
      }
      return null
    })
    .filter(Boolean) as { level: number; text: string }[]

  return (
    <div className="w-64 h-full bg-zinc-900 border-l border-zinc-800 flex flex-col select-none shrink-0 text-xs">
      {/* Tabs Header */}
      <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-950/40 p-1">
        <button
          onClick={() => setActiveTab('links')}
          className={`flex-1 py-1.5 px-2 rounded flex items-center justify-center gap-1.5 font-medium transition-colors ${
            activeTab === 'links'
              ? 'bg-zinc-800 text-violet-300 border border-zinc-700/60'
              : 'text-zinc-500 hover:text-zinc-300'
          }`}
          title="Backlinks & Links"
        >
          <Link2 className="w-3.5 h-3.5" />
          <span>Links</span>
        </button>

        <button
          onClick={() => setActiveTab('outline')}
          className={`flex-1 py-1.5 px-2 rounded flex items-center justify-center gap-1.5 font-medium transition-colors ${
            activeTab === 'outline'
              ? 'bg-zinc-800 text-violet-300 border border-zinc-700/60'
              : 'text-zinc-500 hover:text-zinc-300'
          }`}
          title="Sumário / Estrutura"
        >
          <List className="w-3.5 h-3.5" />
          <span>Sumário</span>
        </button>

        <button
          onClick={() => setActiveTab('tags')}
          className={`flex-1 py-1.5 px-2 rounded flex items-center justify-center gap-1.5 font-medium transition-colors ${
            activeTab === 'tags'
              ? 'bg-zinc-800 text-violet-300 border border-zinc-700/60'
              : 'text-zinc-500 hover:text-zinc-300'
          }`}
          title="Tags da nota"
        >
          <Tag className="w-3.5 h-3.5" />
          <span>Tags</span>
        </button>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {activeTab === 'links' && (
          <>
            {/* Backlinks */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-zinc-400 font-semibold tracking-wider uppercase text-[10px]">
                <div className="flex items-center gap-1.5">
                  <Link2 className="w-3 h-3 text-violet-400" />
                  <span>Backlinks ({backlinks.length})</span>
                </div>
              </div>

              {backlinks.length === 0 ? (
                <div className="text-[11px] text-zinc-600 italic">
                  Nenhuma outra nota referencia esta ainda.
                </div>
              ) : (
                <div className="space-y-1">
                  {backlinks.map(bn => (
                    <div
                      key={bn.id}
                      onClick={() => onSelectNote(bn.id)}
                      className="p-1.5 bg-zinc-800/60 hover:bg-zinc-800 rounded text-zinc-300 hover:text-violet-300 cursor-pointer border border-zinc-800/80 transition-colors flex items-center justify-between"
                    >
                      <span className="truncate">{bn.title}</span>
                      <span className="text-[10px] text-zinc-500 font-mono">[[...]]</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Outgoing Links */}
            <div className="space-y-2 pt-2 border-t border-zinc-800">
              <div className="flex items-center justify-between text-zinc-400 font-semibold tracking-wider uppercase text-[10px]">
                <div className="flex items-center gap-1.5">
                  <ArrowUpRight className="w-3 h-3 text-cyan-400" />
                  <span>Links de Saída ({outgoingLinks.length})</span>
                </div>
              </div>

              {outgoingLinks.length === 0 ? (
                <div className="text-[11px] text-zinc-600 italic">
                  Esta nota não aponta para nenhuma outra.
                </div>
              ) : (
                <div className="space-y-1">
                  {outgoingLinks.map((item, idx) => (
                    <div
                      key={idx}
                      onClick={() => item.note && onSelectNote(item.note.id)}
                      className={`p-1.5 rounded flex items-center justify-between transition-colors ${
                        item.note
                          ? 'bg-zinc-800/60 hover:bg-zinc-800 text-zinc-300 hover:text-cyan-300 cursor-pointer border border-zinc-800/80'
                          : 'bg-zinc-900/40 text-zinc-500 border border-zinc-800/40 cursor-not-allowed'
                      }`}
                    >
                      <span className="truncate">{item.title}</span>
                      {!item.note && <span className="text-[9px] text-amber-500/80">não criada</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* Outline Tab */}
        {activeTab === 'outline' && (
          <div className="space-y-2">
            <div className="text-zinc-400 font-semibold tracking-wider uppercase text-[10px]">
              Tópicos do Documento
            </div>
            {headings.length === 0 ? (
              <div className="text-[11px] text-zinc-600 italic">
                Nenhum título (#) encontrado na nota.
              </div>
            ) : (
              <div className="space-y-1">
                {headings.map((h, idx) => (
                  <div
                    key={idx}
                    className="text-zinc-300 hover:text-violet-300 cursor-pointer truncate py-1 px-1 rounded hover:bg-zinc-800/40 transition-colors"
                    style={{ paddingLeft: `${(h.level - 1) * 12 + 4}px` }}
                  >
                    <span className="text-zinc-600 mr-1.5 font-mono">{'#'.repeat(h.level)}</span>
                    <span>{h.text}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tags Tab */}
        {activeTab === 'tags' && (
          <div className="space-y-2">
            <div className="text-zinc-400 font-semibold tracking-wider uppercase text-[10px]">
              Tags da Nota
            </div>
            {currentNote.tags.length === 0 ? (
              <div className="text-[11px] text-zinc-600 italic">
                Nenhuma tag #definida.
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {currentNote.tags.map(t => (
                  <span
                    key={t}
                    className="bg-violet-950/60 text-violet-300 border border-violet-800/50 px-2 py-0.5 rounded-full font-mono text-xs"
                  >
                    #{t}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
