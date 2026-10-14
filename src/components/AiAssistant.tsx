import React, { useState } from 'react'
import type { Note } from '../types'
import { extractWikiLinks } from '../utils/vault'
import {
  Sparkles,
  Send,
  Bot,
  User,
  RefreshCw,
  X
} from 'lucide-react'

interface AiAssistantProps {
  currentNote: Note
  allNotes: Note[]
  onConnectNote: (targetTitle: string) => void
  onAddTag: (tag: string) => void
  onClose: () => void
}

interface ChatMessage {
  id: string
  sender: 'ai' | 'user'
  text: string
}

export const AiAssistant: React.FC<AiAssistantProps> = ({
  currentNote,
  allNotes,
  onConnectNote,
  onAddTag,
  onClose
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'm1',
      sender: 'ai',
      text: `Olá! Sou o assistente de IA do Pyrite. Estou analisando sua nota **"${currentNote.title}"** e todo o seu Vault. Como posso ajudar seu raciocínio hoje?`
    }
  ])
  const [input, setInput] = useState('')
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [suggestedConnections, setSuggestedConnections] = useState<{ note: Note; reason: string }[]>([])
  const [summary, setSummary] = useState<string | null>(null)
  const [suggestedTags, setSuggestedTags] = useState<string[]>([])

  // Smart Discovery of unlinked notes with semantic relevance
  const runSmartDiscovery = () => {
    setIsAnalyzing(true)
    setTimeout(() => {
      const currentLinks = extractWikiLinks(currentNote.content).map(l => l.toLowerCase())
      const currentWords = new Set(
        currentNote.content.toLowerCase().replace(/[^a-zA-Z0-9\u00C0-\u017F\s]/g, '').split(/\s+/).filter(w => w.length > 3)
      )

      const candidates: { note: Note; score: number; matchCount: number }[] = []

      for (const n of allNotes) {
        if (n.id === currentNote.id) continue
        if (currentLinks.includes(n.title.toLowerCase())) continue // already explicitly linked

        const otherWords = n.content.toLowerCase().replace(/[^a-zA-Z0-9\u00C0-\u017F\s]/g, '').split(/\s+/).filter(w => w.length > 3)
        let matches = 0
        for (const w of otherWords) {
          if (currentWords.has(w)) matches++
        }

        if (matches > 2) {
          candidates.push({ note: n, score: matches, matchCount: matches })
        }
      }

      candidates.sort((a, b) => b.score - a.score)
      const top3 = candidates.slice(0, 3).map(c => ({
        note: c.note,
        reason: `Compartilha conceitos centrais e vocabulário chave (${c.matchCount} termos em comum).`
      }))

      setSuggestedConnections(top3)

      // Generate Auto-Summary
      const lines = currentNote.content.split('\n').filter(l => l.trim().length > 15)
      const keyPoints = lines.slice(0, 3).map(l => l.replace(/^[#\-*>\s]+/, '').trim())
      setSummary(keyPoints.join(' • ') || 'Nota em construção ou com pouco texto.')

      // Suggest Tags
      const potentialTags = ['conhecimento', 'produtividade', 'metodologia', 'arquitetura', 'ideias', 'estudos']
      const newTags = potentialTags.filter(t => !currentNote.tags.includes(t)).slice(0, 3)
      setSuggestedTags(newTags)

      setIsAnalyzing(false)
    }, 400)
  }

  // Interactive Vault Chat
  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim()) return

    const userMsg: ChatMessage = { id: `msg_${Date.now()}`, sender: 'user', text: input.trim() }
    setMessages(prev => [...prev, userMsg])
    const prompt = input.trim().toLowerCase()
    setInput('')

    // Generate responsive vault response
    setTimeout(() => {
      let reply = ''
      if (prompt.includes('resumo') || prompt.includes('resumir')) {
        reply = `Aqui está o resumo da nota **"${currentNote.title}"**:\n\n${summary || 'Nota trata de organização e conceitos conectados no Vault.'}`
      } else if (prompt.includes('conectar') || prompt.includes('conex')) {
        reply = `Encontrei ${suggestedConnections.length} conexões potenciais no Vault. Destaque para **[[${suggestedConnections[0]?.note.title || 'Grafos de Conhecimento'}]]**.`
      } else if (prompt.includes('obsidian') || prompt.includes('diferen')) {
        reply = `O Obsidian utiliza uma arquitetura baseada em Electron + CodeMirror + PixiJS. O **Pyrite** traz essa mesma essência local-first, porém com aceleração de IA semântica integrada e canvas sem dependências pesadas!`
      } else {
        reply = `Analisando sua pergunta no contexto do Vault: Na nota **"${currentNote.title}"**, você aborda tópicos interconectados com **${allNotes.length} outras notas**. Recomendo cruzar esses dados usando o **Grafo de Conhecimento**!`
      }

      setMessages(prev => [...prev, { id: `ai_${Date.now()}`, sender: 'ai', text: reply }])
    }, 500)
  }

  return (
    <div className="w-80 h-full bg-zinc-900 border-l border-zinc-800 flex flex-col select-none shrink-0 text-xs">
      {/* Header */}
      <div className="p-3 border-b border-zinc-800 bg-zinc-950/60 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-gradient-to-br from-violet-600 to-indigo-600 text-white shadow-md">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <div className="font-semibold text-zinc-100">Pyrite Copilot</div>
            <div className="text-[10px] text-zinc-500">Inteligência do Vault</div>
          </div>
        </div>

        <button
          onClick={onClose}
          className="p-1 hover:text-zinc-200 text-zinc-500 rounded transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* Quick Action: Discover Connections */}
        <div className="p-3 bg-zinc-950/60 rounded-xl border border-zinc-800 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-zinc-300">Conexões Ocultas</span>
            <button
              onClick={runSmartDiscovery}
              disabled={isAnalyzing}
              className="flex items-center gap-1 text-[10px] px-2 py-0.5 bg-violet-600/30 hover:bg-violet-600/50 text-violet-300 rounded border border-violet-500/40 transition-colors"
            >
              <RefreshCw className={`w-3 h-3 ${isAnalyzing ? 'animate-spin' : ''}`} />
              <span>{isAnalyzing ? 'Analisando...' : 'Analisar'}</span>
            </button>
          </div>

          {suggestedConnections.length > 0 ? (
            <div className="space-y-1.5 pt-1">
              {suggestedConnections.map(c => (
                <div
                  key={c.note.id}
                  className="p-2 bg-zinc-900 rounded-lg border border-zinc-800 space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-violet-300 truncate">[[{c.note.title}]]</span>
                    <button
                      onClick={() => onConnectNote(c.note.title)}
                      className="px-1.5 py-0.5 bg-violet-600 hover:bg-violet-500 text-white rounded text-[10px] font-medium transition-colors"
                      title="Adicionar link na nota atual"
                    >
                      + Linkar
                    </button>
                  </div>
                  <p className="text-[10px] text-zinc-500 leading-tight">{c.reason}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-zinc-500 italic">
              Clique em Analisar para descobrir afinidades semânticas com outras notas do Vault.
            </p>
          )}
        </div>

        {/* Suggested Tags */}
        {suggestedTags.length > 0 && (
          <div className="p-3 bg-zinc-950/60 rounded-xl border border-zinc-800 space-y-1.5">
            <span className="font-semibold text-zinc-300">Tags Sugeridas</span>
            <div className="flex flex-wrap gap-1">
              {suggestedTags.map(t => (
                <button
                  key={t}
                  onClick={() => onAddTag(t)}
                  className="px-2 py-0.5 bg-zinc-800 hover:bg-violet-900/40 text-violet-300 border border-zinc-700/60 rounded-full text-[10px] font-mono transition-colors"
                >
                  +{t}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Chat History */}
        <div className="space-y-2 pt-2 border-t border-zinc-800">
          <div className="text-[10px] uppercase font-semibold text-zinc-500 tracking-wider">
            Conversar com a Nota
          </div>
          <div className="space-y-2">
            {messages.map(m => (
              <div
                key={m.id}
                className={`flex gap-2 p-2 rounded-lg text-xs leading-relaxed ${
                  m.sender === 'user'
                    ? 'bg-zinc-800 text-zinc-200 ml-4'
                    : 'bg-violet-950/30 border border-violet-900/40 text-zinc-300 mr-2'
                }`}
              >
                {m.sender === 'ai' ? (
                  <Bot className="w-3.5 h-3.5 text-violet-400 shrink-0 mt-0.5" />
                ) : (
                  <User className="w-3.5 h-3.5 text-zinc-400 shrink-0 mt-0.5" />
                )}
                <div>{m.text}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Chat Input */}
      <form onSubmit={handleSendMessage} className="p-2.5 border-t border-zinc-800 bg-zinc-950/80 flex items-center gap-1.5">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Pergunte ao Vault..."
          className="flex-1 px-3 py-1.5 bg-zinc-900 border border-zinc-700/80 rounded-lg text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-violet-500"
        />
        <button
          type="submit"
          className="p-1.5 bg-violet-600 hover:bg-violet-500 text-white rounded-lg transition-colors"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </form>
    </div>
  )
}
