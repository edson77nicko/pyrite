import React, { useState } from 'react'
import type { Note } from '../types'
import { extractWikiLinks } from '../utils/vault'
import {
  Sparkles,
  Bot,
  User,
  RefreshCw,
  X,
  ArrowUp,
  ChevronDown
} from 'lucide-react'

interface AiAssistantProps {
  currentNote?: Note
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
  const effectiveNote = currentNote || allNotes[0] || {
    id: 'vault-root',
    title: 'Meu Vault',
    content: '',
    folder: 'Início',
    tags: [],
    createdAt: Date.now(),
    updatedAt: Date.now()
  }

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'm1',
      sender: 'ai',
      text: `Olá! Sou o agente de IA do Pyrite. Estou analisando sua nota **"${effectiveNote.title}"** e todo o seu Vault. Como posso ajudar seu raciocínio hoje?`
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
      const currentLinks = extractWikiLinks(effectiveNote.content).map(l => l.toLowerCase())
      const currentWords = new Set(
        effectiveNote.content.toLowerCase().replace(/[^a-zA-Z0-9\u00C0-\u017F\s]/g, '').split(/\s+/).filter(w => w.length > 3)
      )

      const candidates: { note: Note; score: number; matchCount: number }[] = []

      for (const n of allNotes) {
        if (n.id === effectiveNote.id) continue
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
      const lines = effectiveNote.content.split('\n').filter(l => l.trim().length > 15)
      const keyPoints = lines.slice(0, 3).map(l => l.replace(/^[#\-*>\s]+/, '').trim())
      setSummary(keyPoints.join(' • ') || 'Nota em construção ou com pouco texto.')

      // Suggest Tags
      const potentialTags = ['conhecimento', 'produtividade', 'metodologia', 'arquitetura', 'ideias', 'estudos']
      const newTags = potentialTags.filter(t => !effectiveNote.tags.includes(t)).slice(0, 3)
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
        reply = `Aqui está o resumo da nota **"${effectiveNote.title}"**:\n\n${summary || 'Nota trata de organização e conceitos conectados no Vault.'}`
      } else if (prompt.includes('conectar') || prompt.includes('conex')) {
        reply = `Encontrei ${suggestedConnections.length} conexões potenciais no Vault. Destaque para **[[${suggestedConnections[0]?.note.title || 'Grafos de Conhecimento'}]]**.`
      } else if (prompt.includes('obsidian') || prompt.includes('diferen')) {
        reply = `O Obsidian utiliza uma arquitetura baseada em Electron + CodeMirror + PixiJS. O **Pyrite** traz essa mesma essência local-first, porém com aceleração de IA semântica integrada e canvas sem dependências pesadas!`
      } else {
        reply = `Analisando sua pergunta no contexto do Vault: Na nota **"${effectiveNote.title}"**, você aborda tópicos interconectados com **${allNotes.length} outras notas**. Recomendo cruzar esses dados usando o **Grafo de Conhecimento**!`
      }

      setMessages(prev => [...prev, { id: `ai_${Date.now()}`, sender: 'ai', text: reply }])
    }, 500)
  }

  return (
    <div className="w-84 h-full bg-[#0c0c0f] border-r border-zinc-800/80 flex flex-col select-none shrink-0 text-xs z-10">
      {/* Header matching reference layout */}
      <div className="h-10 px-3 border-b border-zinc-800/80 bg-[#0e0e12] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-900 border border-zinc-700/60 text-zinc-200 text-xs max-w-[210px] truncate shadow-sm">
          <Bot className="w-3.5 h-3.5 text-violet-400 shrink-0" />
          <span className="truncate font-medium">{effectiveNote.title}</span>
          <ChevronDown className="w-3 h-3 text-zinc-500 shrink-0 ml-0.5" />
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={runSmartDiscovery}
            disabled={isAnalyzing}
            className="p-1.5 text-zinc-400 hover:text-violet-300 hover:bg-zinc-800/60 rounded-md transition-colors"
            title="Analisar conexões semânticas com o Vault"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isAnalyzing ? 'animate-spin text-violet-400' : ''}`} />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 rounded-md transition-colors"
            title="Fechar Agente"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Content / Chat Feed */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-thin">
        {/* Semantic Suggestions */}
        {suggestedConnections.length > 0 && (
          <div className="p-2.5 bg-[#121216] rounded-xl border border-zinc-800/90 space-y-1.5">
            <div className="flex items-center justify-between text-[11px] font-semibold text-zinc-300">
              <span className="flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-violet-400" />
                Conexões Descobertas
              </span>
            </div>
            <div className="space-y-1.5 pt-0.5">
              {suggestedConnections.map(c => (
                <div
                  key={c.note.id}
                  className="p-2 bg-zinc-900/90 rounded-lg border border-zinc-800/80 space-y-1"
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-medium text-violet-300 truncate text-[11px]">[[{c.note.title}]]</span>
                    <button
                      onClick={() => onConnectNote(c.note.title)}
                      className="px-2 py-0.5 bg-violet-600 hover:bg-violet-500 text-white rounded text-[10px] font-medium transition-colors shrink-0"
                      title="Adicionar link na nota"
                    >
                      + Linkar
                    </button>
                  </div>
                  <p className="text-[10px] text-zinc-500 leading-tight">{c.reason}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Suggested Tags */}
        {suggestedTags.length > 0 && (
          <div className="p-2.5 bg-[#121216] rounded-xl border border-zinc-800/90 space-y-1">
            <span className="font-semibold text-zinc-300 text-[11px]">Tags Sugeridas</span>
            <div className="flex flex-wrap gap-1 pt-1">
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

        {/* Messages Feed */}
        <div className="space-y-2.5 pt-1">
          {messages.map(m => (
            <div
              key={m.id}
              className={`flex flex-col gap-1 text-xs leading-relaxed ${
                m.sender === 'user' ? 'items-end' : 'items-start'
              }`}
            >
              <div className="text-[10px] text-zinc-500 font-medium px-1 flex items-center gap-1">
                {m.sender === 'ai' ? (
                  <>
                    <Bot className="w-3 h-3 text-violet-400" />
                    <span>Agente Pyrite</span>
                  </>
                ) : (
                  <>
                    <User className="w-3 h-3 text-zinc-400" />
                    <span>Você</span>
                  </>
                )}
              </div>
              <div
                className={`p-2.5 rounded-2xl max-w-[92%] ${
                  m.sender === 'user'
                    ? 'bg-zinc-800 text-zinc-100 rounded-br-xs'
                    : 'bg-[#15151a] border border-zinc-800/90 text-zinc-200 rounded-bl-xs shadow-sm'
                }`}
              >
                {m.text}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Modern Chat Input Card (Styled matching reference image) */}
      <form onSubmit={handleSendMessage} className="p-2.5 border-t border-zinc-800/80 bg-[#0c0c0f]">
        <div className="bg-[#15151a] border border-zinc-800 focus-within:border-violet-500/60 rounded-2xl p-2 transition-all shadow-inner flex flex-col gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Envie uma mensagem para o Agente..."
            className="w-full bg-transparent px-1 pt-0.5 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none"
          />
          <div className="flex items-center justify-between pt-1 border-t border-zinc-800/40">
            <div className="flex items-center gap-1 text-[10px] text-zinc-400 bg-zinc-900/90 border border-zinc-800 px-2 py-0.5 rounded-full max-w-[190px] truncate">
              <span className="text-violet-400 font-bold">@</span>
              <span className="truncate">{effectiveNote.title}</span>
            </div>
            <button
              type="submit"
              disabled={!input.trim()}
              className="w-6 h-6 rounded-full bg-violet-600 hover:bg-violet-500 disabled:opacity-30 disabled:hover:bg-violet-600 text-white flex items-center justify-center transition-all cursor-pointer shadow-sm shrink-0"
              title="Enviar mensagem"
            >
              <ArrowUp className="w-3.5 h-3.5 stroke-[2.5]" />
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
