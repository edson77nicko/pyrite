import React, { useState } from 'react'
import type { Note } from '../types'
import { extractWikiLinks } from '../utils/vault'
import { MarkdownRenderer } from './MarkdownRenderer'
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
  onInsertSnippet?: (snippet: string) => void
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
  onInsertSnippet,
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

  // Resizable width state with localStorage persistence
  const [panelWidth, setPanelWidth] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('pyrita_ai_width')
      return saved ? Number(saved) : 380
    } catch {
      return 380
    }
  })
  const [isDragging, setIsDragging] = useState(false)

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'm1',
      sender: 'ai',
      text: `Olá! Sou o agente de IA do Pyrita. Estou analisando sua nota **"${effectiveNote.title}"** e todo o seu Vault. Você pode me pedir resumos, conexões ou gerar **Componentes Concêntricos** (KPI, Roadmap, Comparativos) para seu documento!`
    }
  ])
  const [input, setInput] = useState('')
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [suggestedConnections, setSuggestedConnections] = useState<{ note: Note; reason: string }[]>([])
  const [summary, setSummary] = useState<string | null>(null)
  const [suggestedTags, setSuggestedTags] = useState<string[]>([])

  // Drag handler to resize chat width
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    setIsDragging(true)
    const startX = e.clientX
    const startWidth = panelWidth

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX
      const newWidth = Math.min(800, Math.max(290, startWidth + deltaX))
      setPanelWidth(newWidth)
    }

    const handleMouseUp = (upEvent: MouseEvent) => {
      setIsDragging(false)
      const deltaX = upEvent.clientX - startX
      const finalWidth = Math.min(800, Math.max(290, startWidth + deltaX))
      try {
        localStorage.setItem('pyrita_ai_width', String(finalWidth))
      } catch {}
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
  }

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

  const generateReply = (rawPrompt: string) => {
    const prompt = rawPrompt.toLowerCase()
    if (prompt.includes('kpi') || prompt.includes('metrica') || prompt.includes('métrica')) {
      return `Gerei o cartão de KPI com bordas concêntricas ($R_{ext} = R_{int} + P$) para esta nota:\n\n:::kpi\ntitle: Métrica de Conversão\nvalue: 78.5%\nchange: +16.2%\ntrend: up\nsubtitle: Desempenho relativo à nota "${effectiveNote.title}"\nbadge: Q3 Meta\n:::`
    }
    if (prompt.includes('timeline') || prompt.includes('roadmap') || prompt.includes('linha do tempo') || prompt.includes('cronograma')) {
      return `Estruturei o roadmap cronológico embutido em camadas:\n\n:::timeline [Roadmap Estratégico: ${effectiveNote.title}] badge: 2026\n- Etapa 1 | Diagnóstico e Alinhamento | Mapeamento dos conceitos e conexões\n- Etapa 2 | Execução e Prototipagem | Aplicação de bordas concêntricas e design\n- Etapa 3 | Validação e Entrega | Integração com o Vault\n:::`
    }
    if (prompt.includes('compar') || prompt.includes('versus') || prompt.includes('prós') || prompt.includes('trade')) {
      return `Aqui está a matriz comparativa concêntrica de decisões:\n\n:::comparison [Matriz de Decisão: ${effectiveNote.title}] badge: Análise\n### Abordagem A (Destaque)\n- Menor consumo de tokens da IA\n- Renderização concêntrica instantânea\n- Foco em produtividade local\n### Abordagem B\n- Estrutura convencional sem camadas\n- Maior sobrecarga e ruído visual\n- Manutenção descentralizada\n:::`
    }
    if (prompt.includes('card') || prompt.includes('artefato') || prompt.includes('camada') || prompt.includes('cartão')) {
      return `Aqui está o cartão de camadas concêntrico com a fórmula aplicada:\n\n:::card [Padrão Inset / Nested Card] badge: Craft UI\nContainer externo com borda concêntrica: border-radius externo = border-radius interno + padding. Proporciona contraste sutil e harmonia óptica uniforme.\n:::`
    }
    if (prompt.includes('resumo') || prompt.includes('resumir')) {
      return `Aqui está o resumo executivo da nota **"${effectiveNote.title}"**:\n\n${summary || 'Nota trata de organização e conceitos conectados no Vault.'}`
    }
    if (prompt.includes('conectar') || prompt.includes('conex')) {
      return `Encontrei ${suggestedConnections.length} conexões potenciais no Vault. Destaque para **[[${suggestedConnections[0]?.note.title || 'Grafos de Conhecimento'}]]**.`
    }
    if (prompt.includes('obsidian') || prompt.includes('diferen')) {
      return `O Obsidian utiliza uma arquitetura baseada em Electron + CodeMirror + PixiJS. O **Pyrita** traz essa mesma essência local-first, porém com aceleração de IA semântica integrada e canvas sem dependências pesadas!`
    }
    return `Analisando sua pergunta no contexto do Vault: Na nota **"${effectiveNote.title}"**, você aborda tópicos interconectados com **${allNotes.length} outras notas**. Recomendo cruzar esses dados usando o **Grafo de Conhecimento**!`
  }

  // Interactive Vault Chat
  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim()) return

    const raw = input.trim()
    const userMsg: ChatMessage = { id: `msg_${Date.now()}`, sender: 'user', text: raw }
    setMessages(prev => [...prev, userMsg])
    setInput('')

    setTimeout(() => {
      const reply = generateReply(raw)
      setMessages(prev => [...prev, { id: `ai_${Date.now()}`, sender: 'ai', text: reply }])
    }, 400)
  }

  const handleSendPreset = (presetText: string) => {
    const userMsg: ChatMessage = { id: `msg_${Date.now()}`, sender: 'user', text: presetText }
    setMessages(prev => [...prev, userMsg])
    setTimeout(() => {
      const reply = generateReply(presetText)
      setMessages(prev => [...prev, { id: `ai_${Date.now()}`, sender: 'ai', text: reply }])
    }, 400)
  }

  return (
    <div
      style={{ width: `${panelWidth}px` }}
      className="h-full bg-[#0c0c0f] border-r border-zinc-800/80 flex flex-col select-none shrink-0 text-xs z-10 relative"
    >
      {/* Header matching reference layout */}
      <div className="h-10 px-3 border-b border-zinc-800/80 bg-[#0e0e12] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-900 border border-zinc-700/60 text-zinc-200 text-xs max-w-[210px] truncate shadow-sm">
          <Bot className="w-3.5 h-3.5 text-[#c59b27] shrink-0" />
          <span className="truncate font-medium">{effectiveNote.title}</span>
          <ChevronDown className="w-3 h-3 text-zinc-500 shrink-0 ml-0.5" />
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={runSmartDiscovery}
            disabled={isAnalyzing}
            className="p-1.5 text-zinc-400 hover:text-[#d4af37] hover:bg-zinc-800/60 rounded-md transition-colors cursor-pointer"
            title="Analisar conexões semânticas com o Vault"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isAnalyzing ? 'animate-spin text-[#c59b27]' : ''}`} />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 rounded-md transition-colors cursor-pointer"
            title="Fechar Agente"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Content / Chat Feed with Custom Scrollbar */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-chat-scrollbar">
        {/* Semantic Suggestions */}
        {suggestedConnections.length > 0 && (
          <div className="p-2.5 bg-[#121216] rounded-xl border border-zinc-800/90 space-y-1.5">
            <div className="flex items-center justify-between text-[11px] font-semibold text-zinc-300">
              <span className="flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-[#c59b27]" />
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
                    <span className="font-medium text-[#d4af37] truncate text-[11px]">[[{c.note.title}]]</span>
                    <button
                      onClick={() => onConnectNote(c.note.title)}
                      className="px-2 py-0.5 bg-[#c59b27] hover:bg-[#d8b150] text-zinc-950 font-bold rounded text-[10px] transition-colors shrink-0 shadow-sm cursor-pointer"
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
                  className="px-2 py-0.5 bg-zinc-800 hover:bg-[#c59b27]/20 text-[#d4af37] border border-zinc-700/60 rounded-full text-[10px] font-mono transition-colors cursor-pointer"
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
                    <Bot className="w-3 h-3 text-[#c59b27]" />
                    <span>Agente Pyrita</span>
                  </>
                ) : (
                  <>
                    <User className="w-3 h-3 text-zinc-400" />
                    <span>Você</span>
                  </>
                )}
              </div>
              <div
                className={`p-2.5 rounded-2xl max-w-[95%] ${
                  m.sender === 'user'
                    ? 'bg-zinc-800 text-zinc-100 rounded-br-xs'
                    : 'bg-[#15151a] border border-white/[0.06] text-zinc-200 rounded-bl-xs shadow-sm'
                }`}
              >
                {m.sender === 'ai' ? (
                  <div className="space-y-2">
                    <MarkdownRenderer
                      content={m.text}
                      onNavigate={onConnectNote}
                    />
                    {m.text.includes(':::') && onInsertSnippet && (
                      <div className="pt-2 border-t border-zinc-800/60 flex items-center justify-end">
                        <button
                          type="button"
                          onClick={() => {
                            const matches = m.text.match(/:::[\s\S]*?:::/g)
                            if (matches) {
                              onInsertSnippet(matches.join('\n\n'))
                            } else {
                              onInsertSnippet(m.text)
                            }
                          }}
                          className="px-2.5 py-1 bg-[#c59b27]/15 hover:bg-[#c59b27]/25 border border-[#c59b27]/30 text-[#d4af37] hover:text-[#f3e5ab] rounded-lg text-[10px] font-semibold transition-all flex items-center gap-1 cursor-pointer shadow-sm"
                          title="Inserir este artefato diretamente na nota atual"
                        >
                          <Sparkles className="w-3 h-3 text-[#c59b27]" />
                          + Inserir na Nota
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  m.text
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Modern Chat Input Card */}
      <form onSubmit={handleSendMessage} className="p-2.5 border-t border-zinc-800/80 bg-[#0c0c0f] flex flex-col gap-1.5">
        {/* Quick Generative UI Chips */}
        <div className="flex items-center gap-1 overflow-x-auto pb-0.5 scrollbar-none text-[10px]">
          <button
            type="button"
            onClick={() => handleSendPreset('Gere um cartão de KPI concêntrico sobre esta nota')}
            className="px-2 py-0.5 rounded-full bg-zinc-800/80 hover:bg-zinc-750 text-zinc-300 border border-zinc-700/60 whitespace-nowrap cursor-pointer transition-colors hover:text-[#d4af37] hover:border-[#c59b27]/40"
          >
            📊 + KPI
          </button>
          <button
            type="button"
            onClick={() => handleSendPreset('Crie uma linha do tempo com roadmap das etapas')}
            className="px-2 py-0.5 rounded-full bg-zinc-800/80 hover:bg-zinc-750 text-zinc-300 border border-zinc-700/60 whitespace-nowrap cursor-pointer transition-colors hover:text-[#d4af37] hover:border-[#c59b27]/40"
          >
            📅 + Roadmap
          </button>
          <button
            type="button"
            onClick={() => handleSendPreset('Faça um comparativo de prós e contras')}
            className="px-2 py-0.5 rounded-full bg-zinc-800/80 hover:bg-zinc-750 text-zinc-300 border border-zinc-700/60 whitespace-nowrap cursor-pointer transition-colors hover:text-[#d4af37] hover:border-[#c59b27]/40"
          >
            ⚖️ + Comparativo
          </button>
          <button
            type="button"
            onClick={() => handleSendPreset('Gere um cartão em camadas concêntrico')}
            className="px-2 py-0.5 rounded-full bg-zinc-800/80 hover:bg-zinc-750 text-zinc-300 border border-zinc-700/60 whitespace-nowrap cursor-pointer transition-colors hover:text-[#d4af37] hover:border-[#c59b27]/40"
          >
            ✨ + Cartão
          </button>
        </div>

        <div className="bg-[#141418] border border-zinc-800 focus-within:border-[#c59b27]/60 rounded-2xl p-2 transition-all shadow-inner flex flex-col gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Envie uma mensagem para o Agente..."
            className="w-full bg-transparent px-1 pt-0.5 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none"
          />
          <div className="flex items-center justify-between pt-1 border-t border-zinc-800/40">
            <div className="flex items-center gap-1 text-[10px] text-zinc-400 bg-zinc-900/90 border border-zinc-800 px-2 py-0.5 rounded-full max-w-[190px] truncate">
              <span className="text-[#c59b27] font-bold">@</span>
              <span className="truncate">{effectiveNote.title}</span>
            </div>
            <button
              type="submit"
              disabled={!input.trim()}
              className="w-6 h-6 rounded-full bg-[#c59b27] hover:bg-[#d8b150] disabled:opacity-30 disabled:hover:bg-[#c59b27] text-zinc-950 font-bold flex items-center justify-center transition-all cursor-pointer shadow-md shadow-black/40 shrink-0"
              title="Enviar mensagem"
            >
              <ArrowUp className="w-3.5 h-3.5 stroke-[2.5]" />
            </button>
          </div>
        </div>
      </form>

      {/* Vertical Resizable Drag Handle */}
      <div
        onMouseDown={handleMouseDown}
        onDoubleClick={() => {
          setPanelWidth(380)
          localStorage.setItem('pyrita_ai_width', '380')
        }}
        className={`absolute top-0 right-0 w-1.5 h-full cursor-col-resize select-none z-30 transition-colors group ${
          isDragging ? 'bg-[#c59b27]' : 'hover:bg-[#c59b27]/50'
        }`}
        title="Arraste para redimensionar a largura do chat (duplo clique para restaurar)"
      >
        <div className="w-[1px] h-full bg-zinc-800/80 group-hover:bg-[#c59b27]/80 mx-auto" />
      </div>
    </div>
  )
}
