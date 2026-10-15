import React, { useState } from 'react'
import type { Note } from '../types'
import { extractWikiLinks } from '../utils/vault'
import {
  Link2,
  Tag,
  List,
  ArrowUpRight
} from 'lucide-react'

interface RightSidebarProps {
  currentNote: Note
  allNotes: Note[]
  onSelectNote: (noteId: string) => void
  isOpen: boolean
}

type SidebarTab = 'links' | 'outline' | 'tags'

export const RightSidebar: React.FC<RightSidebarProps> = ({
  currentNote,
  allNotes,
  onSelectNote,
  isOpen
}) => {
  const [activeTab, setActiveTab] = useState<SidebarTab>('links')

  if (!isOpen) return null

  // 1. Backlinks: notes that link to currentNote
  const backlinks = allNotes.filter(n => {
    if (n.id === currentNote.id) return false
    const links = extractWikiLinks(n.content)
    return links.some(link => link.toLowerCase() === currentNote.title.toLowerCase())
  })

  // 2. Outgoing links from currentNote
  const currentLinks = extractWikiLinks(currentNote.content)
  const outgoingLinks = currentLinks.map(linkText => {
    const target = allNotes.find(n => n.title.toLowerCase() === linkText.toLowerCase())
    return { title: linkText, note: target }
  })

  // 3. Document Outline (Markdown Headings)
  const headings = currentNote.content
    .split('\n')
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
          className={`flex-1 py-1.5 px-2 rounded flex items-center justify-center gap-1.5 font-medium transition-colors cursor-pointer ${
            activeTab === 'links'
              ? 'bg-[#c59b27]/10 text-[#d4af37] border border-[#c59b27]/30'
              : 'text-zinc-500 hover:text-[#d4af37]'
          }`}
          title="Backlinks & Links"
        >
          <Link2 className="w-3.5 h-3.5" />
          <span>Links</span>
        </button>

        <button
          onClick={() => setActiveTab('outline')}
          className={`flex-1 py-1.5 px-2 rounded flex items-center justify-center gap-1.5 font-medium transition-colors cursor-pointer ${
            activeTab === 'outline'
              ? 'bg-[#c59b27]/10 text-[#d4af37] border border-[#c59b27]/30'
              : 'text-zinc-500 hover:text-[#d4af37]'
          }`}
          title="Sumário / Estrutura"
        >
          <List className="w-3.5 h-3.5" />
          <span>Sumário</span>
        </button>

        <button
          onClick={() => setActiveTab('tags')}
          className={`flex-1 py-1.5 px-2 rounded flex items-center justify-center gap-1.5 font-medium transition-colors cursor-pointer ${
            activeTab === 'tags'
              ? 'bg-[#c59b27]/10 text-[#d4af37] border border-[#c59b27]/30'
              : 'text-zinc-500 hover:text-[#d4af37]'
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
                  <Link2 className="w-3 h-3 text-[#c59b27]" />
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
                      className="p-1.5 bg-zinc-800/60 hover:bg-zinc-800 rounded text-zinc-300 hover:text-[#d4af37] cursor-pointer border border-zinc-800/80 transition-colors flex items-center justify-between"
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
                  <ArrowUpRight className="w-3 h-3 text-zinc-400" />
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
                          ? 'bg-zinc-800/60 hover:bg-zinc-800 text-zinc-300 hover:text-zinc-100 cursor-pointer border border-zinc-800/80'
                          : 'bg-zinc-900/40 text-zinc-500 border border-zinc-800/40 cursor-not-allowed'
                      }`}
                    >
                      <span className="truncate">{item.title}</span>
                      {!item.note && <span className="text-[9px] text-[#c59b27]/80">não criada</span>}
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
                    className="text-zinc-300 hover:text-[#d4af37] cursor-pointer truncate py-1 px-1 rounded hover:bg-zinc-800/40 transition-colors"
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
                    className="bg-[#1a1711] text-[#d4af37] border border-[#c59b27]/30 px-2.5 py-0.5 rounded-full font-mono text-xs shadow-xs"
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
