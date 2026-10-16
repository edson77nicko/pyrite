import React, { useState, useEffect } from 'react'
import type { Note } from '../types'
import { extractWikiLinks } from '../utils/vault'
import { MarkdownRenderer } from './MarkdownRenderer'
import { AiModelSettingsModal } from './AiModelSettingsModal'
import {
  Sparkles,
  Bot,
  User,
  RefreshCw,
  X,
  ArrowUp,
  ChevronDown,
  Cpu,
  Loader2,
  KeyRound
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
  isActionable?: boolean
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

  // AI Configuration Modal & Active Provider State
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [activeProvider, setActiveProvider] = useState<string>('openrouter')
  const [activeModel, setActiveModel] = useState<string>('google/gemini-2.5-flash')
  const [hasActiveKey, setHasActiveKey] = useState<boolean>(false)
  const [isGenerating, setIsGenerating] = useState<boolean>(false)

  // Refresh AI configuration from Electron safeStorage
  const refreshAiConfig = async () => {
    if (!window.electronAPI?.aiGetAllConfigs) return
    try {
      const data = await window.electronAPI.aiGetAllConfigs()
      const p = (data.activeProvider || 'openrouter').toLowerCase()
      setActiveProvider(p)
      const pConfig = data.providers?.[p]
      if (pConfig) {
        setActiveModel(pConfig.model || 'google/gemini-2.5-flash')
        setHasActiveKey(!!pConfig.hasKey)
      }
    } catch (err) {
      console.error('Failed to load AI config:', err)
    }
  }

  useEffect(() => {
    refreshAiConfig()
  }, [])

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

  // Interactive Vault Chat with Real LLM and Fallback
  const executePrompt = async (raw: string) => {
    if (!raw.trim() || isGenerating) return

    const userMsg: ChatMessage = { id: `msg_${Date.now()}`, sender: 'user', text: raw }
    setMessages(prev => [...prev, userMsg])

    // If an API key is configured and Electron AI is available, execute real LLM call
    if (window.electronAPI?.aiChat && hasActiveKey) {
      setIsGenerating(true)
      const loadingId = `loading_${Date.now()}`
      setMessages(prev => [...prev, { id: loadingId, sender: 'ai', text: 'Pensando...' }])

      try {
        const systemPrompt = `Você é o Agente de IA do Pyrita, assistente de anotações e gestão de conhecimento (estilo Obsidian) com foco em produtividade e componentes concêntricos visuais.
A nota ativa no momento é "${effectiveNote.title}".
Conteúdo atual da nota:
---
${effectiveNote.content || '(nota vazia)'}
---
Outras notas disponíveis no cofre: ${allNotes.map(n => n.title).slice(0, 25).join(', ')}.

Diretrizes:
- Responda em português brasileiro com clareza, concisão e alta utilidade.
- Use formatação Markdown (títulos, listas, negrito, etc.).
- Sempre que oportuno para resumir métricas, processos ou comparativos, utilize os blocos de componentes concêntricos do Pyrita:
  1) :::kpi
     title: Nome da Métrica
     value: 85%
     change: +12%
     trend: up
     subtitle: Descrição
     badge: Meta
     :::
  2) :::timeline [Título da Linha do Tempo] badge: 2026
     - Etapa 1 | Subtítulo | Descrição detalhada
     - Etapa 2 | Subtítulo | Descrição detalhada
     :::
  3) :::comparison [Título Comparativo] badge: Análise
     ### Abordagem A (Destaque)
     - Ponto positivo
     ### Abordagem B
     - Ponto a considerar
     :::
  4) :::card [Título do Cartão] badge: Destaque
     Texto do cartão com detalhes em camadas.
     :::`

        const history = messages
          .filter(m => m.id !== loadingId && !m.text.startsWith('⚠️'))
          .slice(-6)
          .map(m => ({
            role: m.sender === 'user' ? 'user' : 'assistant',
            content: m.text
          }))

        const payloadMessages = [
          { role: 'system', content: systemPrompt },
          ...history,
          { role: 'user', content: raw }
        ]

        const res = await window.electronAPI.aiChat({
          provider: activeProvider,
          model: activeModel,
          messages: payloadMessages,
          temperature: 0.7
        })

        setMessages(prev => prev.filter(m => m.id !== loadingId))

        if (res.success && res.text) {
          setMessages(prev => [...prev, { id: `ai_${Date.now()}`, sender: 'ai', text: res.text! }])
        } else {
          setMessages(prev => [
            ...prev,
            {
              id: `ai_${Date.now()}`,
              sender: 'ai',
              text: `⚠️ **Erro na resposta do provedor (${activeProvider.toUpperCase()}):**\n${res.error || 'Falha ao processar solicitação.'}\n\n*Clique no botão acima ou configure uma chave válida.*`,
              isActionable: true
            }
          ])
        }
      } catch (err: any) {
        setMessages(prev => prev.filter(m => m.id !== loadingId))
        setMessages(prev => [
          ...prev,
          {
            id: `ai_${Date.now()}`,
            sender: 'ai',
            text: `⚠️ **Erro de conexão:** ${err.message || 'Não foi possível contatar o provedor.'}`
          }
        ])
      } finally {
        setIsGenerating(false)
      }
      return
    }

    // Fallback: If no API key configured, check for generative preset keywords or prompt user to configure key
    setTimeout(() => {
      const isPreset = ['kpi', 'metrica', 'métrica', 'timeline', 'roadmap', 'cronograma', 'compar', 'versus', 'card', 'resumo'].some(k => raw.toLowerCase().includes(k))
      if (isPreset) {
        const reply = generateReply(raw)
        setMessages(prev => [...prev, { id: `ai_${Date.now()}`, sender: 'ai', text: reply }])
      } else {
        setMessages(prev => [
          ...prev,
          {
            id: `ai_${Date.now()}`,
            sender: 'ai',
            text: `Chave de API do **${activeProvider.toUpperCase()}** não está configurada.\n\nConfigure sua chave para conversar com a IA e ter respostas inteligentes em tempo real sobre todo o seu cofre!`,
            isActionable: true
          }
        ])
      }
    }, 300)
  }

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isGenerating) return
    const text = input.trim()
    setInput('')
    executePrompt(text)
  }

  const handleSendPreset = (presetText: string) => {
    executePrompt(presetText)
  }

  return (
    <div
      style={{ width: `${panelWidth}px` }}
      className="h-full bg-[#0c0c0f] border-r border-zinc-800/80 flex flex-col select-none shrink-0 text-xs z-10 relative"
    >
      {/* Header matching reference layout */}
      <div className="h-10 px-3 border-b border-zinc-800/80 bg-[#0e0e12] flex items-center justify-between shrink-0 gap-1.5">
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-zinc-900 border border-zinc-700/60 text-zinc-200 text-xs max-w-[140px] truncate shadow-sm">
          <Bot className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
          <span className="truncate font-medium">{effectiveNote.title}</span>
          <ChevronDown className="w-3 h-3 text-zinc-500 shrink-0 ml-0.5" />
        </div>

        {/* LLM Model & Provider Indicator Pill */}
        <button
          type="button"
          onClick={() => setIsSettingsOpen(true)}
          className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-zinc-900/90 border border-zinc-800 hover:border-zinc-700 text-zinc-300 hover:text-zinc-100 text-xs transition-colors cursor-pointer shrink-0"
          title="Configurações de Provedor & Modelo LLM"
        >
          <Cpu className="w-3.5 h-3.5 text-[var(--accent)]" />
          <span className="font-bold text-[10px] tracking-wide uppercase text-zinc-300">
            {activeProvider}
          </span>
          {hasActiveKey ? (
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_4px_rgba(52,211,153,0.8)]" title="Chave configurada e ativa" />
          ) : (
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" title="Chave não configurada" />
          )}
        </button>

        <div className="flex items-center gap-0.5">
          <button
            onClick={runSmartDiscovery}
            disabled={isAnalyzing}
            className="p-1.5 text-zinc-400 hover:text-[var(--accent)] hover:bg-zinc-800/60 rounded-md transition-colors cursor-pointer"
            title="Analisar conexões semânticas com o Vault"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isAnalyzing ? 'animate-spin text-[var(--accent)]' : ''}`} />
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
                    <Bot className="w-3 h-3 text-[var(--accent)]" />
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
                    {m.text === 'Pensando...' ? (
                      <div className="flex items-center gap-2 py-1 text-zinc-400 font-mono text-[11px]">
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--accent)] shrink-0" />
                        <span>Processando com {activeProvider.toUpperCase()} ({activeModel})...</span>
                      </div>
                    ) : (
                      <MarkdownRenderer
                        content={m.text}
                        onNavigate={onConnectNote}
                      />
                    )}

                    {m.isActionable && (
                      <div className="pt-2 border-t border-zinc-800/60 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setIsSettingsOpen(true)}
                          className="px-3 py-1.5 rounded-xl bg-[var(--accent)] hover:opacity-90 text-zinc-950 font-bold text-xs transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
                        >
                          <KeyRound className="w-3.5 h-3.5" />
                          <span>Configurar Chave & Modelo</span>
                        </button>
                      </div>
                    )}

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
                          className="px-2.5 py-1 bg-[var(--accent)]/15 hover:bg-[var(--accent)]/25 border border-[var(--accent)]/30 text-[var(--accent)] rounded-lg text-[10px] font-semibold transition-all flex items-center gap-1 cursor-pointer shadow-sm"
                          title="Inserir este artefato diretamente na nota atual"
                        >
                          <Sparkles className="w-3 h-3 text-[var(--accent)]" />
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
              <span className="text-[var(--accent)] font-bold">@</span>
              <span className="truncate">{effectiveNote.title}</span>
            </div>
            <button
              type="submit"
              disabled={!input.trim() || isGenerating}
              className="w-6 h-6 rounded-full bg-[var(--accent)] hover:opacity-90 disabled:opacity-30 text-zinc-950 font-bold flex items-center justify-center transition-all cursor-pointer shadow-md shadow-black/40 shrink-0"
              title="Enviar mensagem"
            >
              <ArrowUp className="w-3.5 h-3.5 stroke-[2.5]" />
            </button>
          </div>
        </div>
      </form>

      {/* AI Provider & Model Configuration Modal */}
      <AiModelSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onConfigSaved={refreshAiConfig}
      />

      {/* Vertical Resizable Drag Handle */}
      <div
        onMouseDown={handleMouseDown}
        onDoubleClick={() => {
          setPanelWidth(380)
          localStorage.setItem('pyrita_ai_width', '380')
        }}
        className={`absolute top-0 right-0 w-1.5 h-full cursor-col-resize select-none z-30 transition-colors group ${
          isDragging ? 'bg-[var(--accent)]' : 'hover:bg-[var(--accent)]/50'
        }`}
        title="Arraste para redimensionar a largura do chat (duplo clique para restaurar)"
      >
        <div className="w-[1px] h-full bg-zinc-800/80 group-hover:bg-[var(--accent)]/80 mx-auto" />
      </div>
    </div>
  )
}
