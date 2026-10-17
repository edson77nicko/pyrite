import React, { useState, useEffect, useMemo, useRef } from 'react'
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
  KeyRound,
  Folder,
  FolderPlus,
  Check
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

export interface AgentSpecialty {
  id: string
  name: string
  shortName: string
  badgeColor: string
  icon: string
  tagline: string
  systemDirective: string
  presets: { label: string; prompt: string }[]
}

export const AGENT_SPECIALTIES: AgentSpecialty[] = [
  {
    id: 'architect',
    name: 'Arquiteto de Conhecimento',
    shortName: 'Arquiteto',
    badgeColor: '#c59b27',
    icon: '🧠',
    tagline: 'Mapeamento conceitual, conexões do Vault e taxonomias',
    systemDirective: `Sua especialidade é ARQUITETURA DE CONHECIMENTO.
- Analise as notas e pastas fornecidas como nós de uma rede de ideias interconectadas.
- Identifique padrões transversais, proponha links bidirecionais [[Nome da Nota]] e sugira novas categorias e tags.
- Identifique lacunas conceituais e sugira como conectar este tópico a outros domínios do cofre.`,
    presets: [
      { label: '🔗 Conexões no Vault', prompt: 'Analise o contexto e sugira conexões semânticas com outras ideias do cofre, indicando links bidirecionais [[...]].' },
      { label: '🧩 Mapa Conceitual', prompt: 'Crie um mapa conceitual dos termos e ideias centrais presentes neste contexto.' },
      { label: '🏷️ Taxonomia & Tags', prompt: 'Sugira uma taxonomia de tags e categorias para organizar este material no cofre.' },
      { label: '🌌 Análise Sistêmica', prompt: 'Faça uma síntese sistêmica de como os conceitos desta nota/pasta se relacionam entre si.' }
    ]
  },
  {
    id: 'writer',
    name: 'Redator & Síntese',
    shortName: 'Redator',
    badgeColor: '#38bdf8',
    icon: '✍️',
    tagline: 'Refinamento de escrita, clareza e resumos executivos',
    systemDirective: `Sua especialidade é REDAÇÃO E SÍNTESE DE CONTEÚDO.
- Escreva com estilo polido, claro, conciso e elegante.
- Elimine prolixidade, estruture ideias em tópicos de alto impacto e crie resumos executivos rápidos de digerir.
- Quando solicitado a expandir, traga analogias claras e profundidade sem perder a essência.`,
    presets: [
      { label: '✨ Melhorar Redação', prompt: 'Reescreva e aprimore o texto do contexto com maior elegância, fluidez e clareza.' },
      { label: '📋 Resumo Executivo', prompt: 'Gere um resumo executivo em tópicos com os pontos mais importantes do contexto.' },
      { label: '📖 Expandir Tópico', prompt: 'Expanda o conteúdo com explicações aprofundadas, exemplos práticos e desdobramentos.' },
      { label: '🎯 Títulos & Estrutura', prompt: 'Sugira títulos, subtítulos e uma estrutura refinada para organizar este texto.' }
    ]
  },
  {
    id: 'strategist',
    name: 'Estrategista & Artefatos',
    shortName: 'Estrategista',
    badgeColor: '#10b981',
    icon: '📊',
    tagline: 'Painéis executivos e componentes visuais concêntricos',
    systemDirective: `Sua especialidade é ESTRATÉGIA E ARTEFATOS VISUAIS CONCÊNTRICOS.
- Transforme os dados e conceitos em componentes visuais nativos do Pyrita:
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
     - Vantagem
     ### Abordagem B
     - Consideração
     :::
  4) :::card [Título do Cartão] badge: Destaque
     Texto do cartão com detalhes em camadas.
     :::
- Foque em planos de ação práticos, métricas mensuráveis e roadmaps cronológicos.`,
    presets: [
      { label: '📊 + KPI Concêntrico', prompt: 'Gere um cartão de KPI concêntrico extraindo as métricas principais do contexto.' },
      { label: '📅 + Roadmap 2026', prompt: 'Crie uma linha do tempo/roadmap em camadas concêntricas das etapas necessárias.' },
      { label: '⚖️ + Comparativo', prompt: 'Faça uma matriz comparativa de prós, contras e trade-offs sobre este tema.' },
      { label: '✨ + Cartão Inset', prompt: 'Gere um cartão concêntrico em camadas sintetizando o ponto mais importante.' }
    ]
  },
  {
    id: 'critic',
    name: 'Analista Crítico & Socrático',
    shortName: 'Crítico',
    badgeColor: '#f43f5e',
    icon: '🔬',
    tagline: 'Rigor lógico, questionamento socrático e auditoria de riscos',
    systemDirective: `Sua especialidade é ANÁLISE CRÍTICA E MÉTODO SOCRÁTICO.
- Questione premissas ocultas, desafie conclusões precipitadas e aponte contradições ou inconsistências lógicas.
- Formule perguntas provocativas que estimulem reflexão profunda.
- Aponte riscos não mapeados e analise a antítese de cada ideia.`,
    presets: [
      { label: '🔍 Auditoria Crítica', prompt: 'Analise criticamente o conteúdo apontando fragilidades, premissas não comprovadas e possíveis falhas.' },
      { label: '❓ Perguntas Socráticas', prompt: 'Elabore 4 perguntas socráticas desafiadoras para testar a consistência desta tese.' },
      { label: '⚖️ Riscos & Trade-offs', prompt: 'Avalie os riscos potenciais, efeitos colaterais e trade-offs implícitos nesta abordagem.' },
      { label: '💡 Antítese Oposta', prompt: 'Apresente o melhor contra-argumento possível à ideia defendida neste contexto.' }
    ]
  },
  {
    id: 'coder',
    name: 'Engenheiro & Técnico',
    shortName: 'Técnico',
    badgeColor: '#a855f7',
    icon: '💻',
    tagline: 'Especificações técnicas, arquitetura de sistemas e código',
    systemDirective: `Sua especialidade é ENGENHARIA E ESPECIFICAÇÃO TÉCNICA.
- Forneça arquiteturas de software, diagramas lógicos, modelagem de dados e especificações funcionais.
- Entregue código limpo, moderno, tipado e com comentários explicativos quando solicitado.
- Crie checklists de implementação e boas práticas de engenharia.`,
    presets: [
      { label: '💻 Especificação Técnica', prompt: 'Elabore uma especificação técnica detalhada com requisitos funcionais e não funcionais.' },
      { label: '📐 Arquitetura de Dados', prompt: 'Proponha uma arquitetura de componentes ou modelo de dados para suportar este projeto.' },
      { label: '🛠️ Snippet de Código', prompt: 'Gere um exemplo de código funcional e bem documentado implementando o conceito central.' },
      { label: '✅ Checklist de Entrega', prompt: 'Crie um checklist de tarefas técnicas para implementação e validação passo a passo.' }
    ]
  }
]

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

  // Agent Specialty State with persistence
  const [activeSpecialtyId, setActiveSpecialtyId] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('pyrita_ai_specialty')
      return saved || 'architect'
    } catch {
      return 'architect'
    }
  })
  const [isSpecialtyMenuOpen, setIsSpecialtyMenuOpen] = useState(false)

  const activeSpecialty = useMemo(() => {
    return AGENT_SPECIALTIES.find(s => s.id === activeSpecialtyId) || AGENT_SPECIALTIES[0]
  }, [activeSpecialtyId])

  // Context Selection States (Note & Folder)
  const [isNoteContextActive, setIsNoteContextActive] = useState<boolean>(true)
  const [selectedFolderContext, setSelectedFolderContext] = useState<string | null>(null)
  const [isFolderPickerOpen, setIsFolderPickerOpen] = useState(false)

  const specialtyMenuRef = useRef<HTMLDivElement | null>(null)
  const folderPickerRef = useRef<HTMLDivElement | null>(null)

  // Compute all available folders with note counts
  const folderList = useMemo(() => {
    const map = new Map<string, number>()
    for (const n of allNotes) {
      const f = n.folder?.trim() || 'Início'
      map.set(f, (map.get(f) || 0) + 1)
    }
    return Array.from(map.entries())
      .map(([folder, count]) => ({ folder, count }))
      .sort((a, b) => a.folder.localeCompare(b.folder))
  }, [allNotes])

  // Click outside listener for dropdown popovers
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (specialtyMenuRef.current && !specialtyMenuRef.current.contains(e.target as Node)) {
        setIsSpecialtyMenuOpen(false)
      }
      if (folderPickerRef.current && !folderPickerRef.current.contains(e.target as Node)) {
        setIsFolderPickerOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

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
        setHasActiveKey(p === 'ollama' ? true : !!pConfig.hasKey)
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
      text: `Olá! Sou o **Agente de IA do Pyrita** atuando como **${activeSpecialty.name}** (${activeSpecialty.icon}).\n\nEstou pronto para analisar sua nota ativa e pastas selecionadas com raciocínio profundo e geração de artefatos concêntricos!`
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

  // Offline / Fallback generator tailored to active specialty
  const generateReply = (rawPrompt: string) => {
    const prompt = rawPrompt.toLowerCase()
    const targetTitle = isNoteContextActive ? effectiveNote.title : selectedFolderContext ? `Pasta ${selectedFolderContext}` : 'Vault'

    if (prompt.includes('kpi') || prompt.includes('metrica') || prompt.includes('métrica')) {
      return `Gerei o cartão de KPI concêntrico ($R_{ext} = R_{int} + P$) para este contexto:\n\n:::kpi\ntitle: Métrica de Execução\nvalue: 84.2%\nchange: +18.5%\ntrend: up\nsubtitle: Desempenho relativo a "${targetTitle}"\nbadge: Meta 2026\n:::`
    }
    if (prompt.includes('timeline') || prompt.includes('roadmap') || prompt.includes('linha do tempo') || prompt.includes('cronograma')) {
      return `Estruturei o roadmap cronológico embutido em camadas:\n\n:::timeline [Roadmap Estratégico: ${targetTitle}] badge: 2026\n- Etapa 1 | Diagnóstico e Alinhamento | Mapeamento dos conceitos e requisitos\n- Etapa 2 | Prototipagem e Estrutura | Aplicação de bordas concêntricas e design visual\n- Etapa 3 | Validação e Entrega | Integração contínua e documentação\n:::`
    }
    if (prompt.includes('compar') || prompt.includes('versus') || prompt.includes('prós') || prompt.includes('trade')) {
      return `Aqui está a matriz comparativa concêntrica de decisões:\n\n:::comparison [Matriz de Decisão: ${targetTitle}] badge: Análise\n### Abordagem A (Destaque)\n- Menor consumo de tokens da IA\n- Renderização concêntrica instantânea\n- Foco em produtividade local\n### Abordagem B\n- Estrutura convencional sem camadas\n- Maior sobrecarga e ruído visual\n- Manutenção descentralizada\n:::`
    }
    if (prompt.includes('card') || prompt.includes('artefato') || prompt.includes('camada') || prompt.includes('cartão')) {
      return `Aqui está o cartão de camadas concêntrico com a fórmula aplicada:\n\n:::card [Padrão Inset / Nested Card] badge: Craft UI\nContainer externo com borda concêntrica: border-radius externo = border-radius interno + padding. Proporciona contraste sutil e harmonia óptica uniforme.\n:::`
    }
    if (prompt.includes('resumo') || prompt.includes('resumir')) {
      return `Aqui está o resumo executivo de **"${targetTitle}"**:\n\n${summary || 'O contexto reúne notas estruturadas com conexões e conceitos-chave no Vault.'}`
    }
    if (prompt.includes('conectar') || prompt.includes('conex')) {
      return `Encontrei potenciais conexões no Vault. Destaque para **[[${suggestedConnections[0]?.note.title || 'Grafos de Conhecimento'}]]**.`
    }

    return `Atuando como **${activeSpecialty.name}**:\n\nAnalisando sua solicitação com base em **"${targetTitle}"**${selectedFolderContext ? ` e na pasta **"${selectedFolderContext}"**` : ''}. Para ter respostas inteligentes em tempo real alimentadas por LLM, configure sua chave de API nas opções acima!`
  }

  // Interactive Vault Chat with Real LLM and Context Injection
  const executePrompt = async (raw: string) => {
    if (!raw.trim() || isGenerating) return

    const userMsg: ChatMessage = { id: `msg_${Date.now()}`, sender: 'user', text: raw }
    setMessages(prev => [...prev, userMsg])

    // If an API key is configured (or ollama active) and Electron AI is available, execute real LLM call
    if (window.electronAPI?.aiChat && (hasActiveKey || activeProvider === 'ollama')) {
      setIsGenerating(true)
      const loadingId = `loading_${Date.now()}`
      setMessages(prev => [...prev, { id: loadingId, sender: 'ai', text: 'Pensando...' }])

      try {
        let contextBlock = ''

        // 1. Current Note Context (if enabled)
        if (isNoteContextActive && effectiveNote) {
          contextBlock += `\n### NOTA ATIVA EM CONTEXTO:\nTítulo: "${effectiveNote.title}"\nPasta: ${effectiveNote.folder || 'Início'}\nTags: ${effectiveNote.tags?.join(', ') || 'nenhuma'}\nConteúdo da nota:\n---\n${effectiveNote.content || '(nota vazia)'}\n---\n`
        }

        // 2. Folder Context (if selected)
        if (selectedFolderContext) {
          const folderNotes = allNotes.filter(
            n => (n.folder?.trim() || 'Início') === selectedFolderContext
          )
          contextBlock += `\n### PASTA COMPLETA EM CONTEXTO: "${selectedFolderContext}" (${folderNotes.length} notas no total)\nUse as informações e dados de todas as notas desta pasta para responder com profundidade e cruzamento de informações:\n`

          let charBudget = 22000
          for (const fn of folderNotes) {
            if (charBudget <= 0) break
            const snippet = fn.content.slice(0, 3500)
            charBudget -= snippet.length
            contextBlock += `\n--- NOTA DA PASTA: [[${fn.title}]] (Tags: ${fn.tags?.join(', ') || 'nenhuma'})\n${snippet}\n`
          }
          contextBlock += `\n---\n`
        }

        if (!isNoteContextActive && !selectedFolderContext) {
          contextBlock += `\n(Nenhum contexto específico de nota ou pasta ativo no momento. Responda com base no conhecimento geral e visão geral do Vault).\n`
        }

        const systemPrompt = `Você é o Agente de IA do Pyrita, assistente de alto nível para gestão de conhecimento e pensamento (estilo Obsidian) com foco em produtividade e artefatos concêntricos.
Especialidade atual: ${activeSpecialty.name} (${activeSpecialty.icon})
Diretriz de Especialidade:
${activeSpecialty.systemDirective}

Contexto fornecido pelo usuário:
${contextBlock}

Outras notas disponíveis no cofre: ${allNotes.map(n => n.title).slice(0, 30).join(', ')}.

Diretrizes gerais:
- Responda em português brasileiro com clareza, concisão e utilidade extrema.
- Use formatação Markdown rica (títulos, listas, negrito, etc.).
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

    // Fallback: If no API key configured, check for generative preset keywords or prompt user
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
            text: `Chave de API do **${activeProvider.toUpperCase()}** não está configurada.\n\nConfigure sua chave para conversar com a IA e ter respostas inteligentes em tempo real sobre sua nota e pastas selecionadas!`,
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
      {/* 1. TOP HEADER: AGENT SPECIALTY SELECTOR & MODEL PILL */}
      <div className="h-10 px-3 border-b border-zinc-800/80 bg-[#0e0e12] flex items-center justify-between shrink-0 gap-1.5">
        {/* Agent Specialty Dropdown Selector */}
        <div ref={specialtyMenuRef} className="relative">
          <button
            type="button"
            onClick={() => setIsSpecialtyMenuOpen(o => !o)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-900 border border-zinc-700/70 hover:border-zinc-500 text-zinc-200 text-xs transition-all cursor-pointer shadow-sm"
            title="Alterar Especialidade do Agente de IA"
          >
            <span>{activeSpecialty.icon}</span>
            <span className="font-semibold text-[11px] text-zinc-100">{activeSpecialty.shortName}</span>
            <ChevronDown className="w-3 h-3 text-zinc-500 ml-0.5" />
          </button>

          {isSpecialtyMenuOpen && (
            <div className="absolute top-9 left-0 z-50 w-72 bg-[#101117] border border-zinc-700/80 rounded-xl p-1.5 shadow-2xl space-y-1 animate-in fade-in zoom-in-95 duration-100">
              <div className="px-2 py-1 text-[10px] font-mono text-zinc-400 border-b border-zinc-800 flex items-center justify-between">
                <span>ESPECIALIDADES DO AGENTE</span>
                <span className="text-[9px] text-zinc-500">5 perfis</span>
              </div>
              <div className="space-y-0.5 pt-0.5">
                {AGENT_SPECIALTIES.map(s => {
                  const isCur = activeSpecialtyId === s.id
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => {
                        setActiveSpecialtyId(s.id)
                        try {
                          localStorage.setItem('pyrita_ai_specialty', s.id)
                        } catch {}
                        setIsSpecialtyMenuOpen(false)
                      }}
                      className={`w-full text-left px-2.5 py-2 rounded-lg flex items-start gap-2.5 transition-all cursor-pointer ${
                        isCur
                          ? 'bg-[var(--accent)]/15 border border-[var(--accent)]/30 text-white'
                          : 'hover:bg-zinc-850 text-zinc-300'
                      }`}
                    >
                      <span className="text-base leading-none mt-0.5">{s.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-xs flex items-center justify-between">
                          <span className={isCur ? 'text-[var(--accent)]' : 'text-zinc-100'}>{s.name}</span>
                          {isCur && <Check className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />}
                        </div>
                        <p className="text-[10px] text-zinc-400 leading-tight mt-0.5 line-clamp-2">
                          {s.tagline}
                        </p>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
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
          {hasActiveKey || activeProvider === 'ollama' ? (
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

      {/* 2. CHAT FEED */}
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
                    <span>{activeSpecialty.name}</span>
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

      {/* 3. MODERN CHAT INPUT CARD WITH CONTEXT PILLS (NOTA + PASTA) */}
      <form onSubmit={handleSendMessage} className="p-2.5 border-t border-zinc-800/80 bg-[#0c0c0f] flex flex-col gap-1.5">
        {/* Dynamic Specialty Prompt Chips */}
        <div className="flex items-center gap-1 overflow-x-auto pb-0.5 scrollbar-none text-[10px]">
          {activeSpecialty.presets.map((pr, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handleSendPreset(pr.prompt)}
              className="px-2 py-0.5 rounded-full bg-zinc-800/80 hover:bg-zinc-750 text-zinc-300 border border-zinc-700/60 whitespace-nowrap cursor-pointer transition-colors hover:text-[var(--accent)] hover:border-[var(--accent)]/40"
              title={pr.prompt}
            >
              {pr.label}
            </button>
          ))}
        </div>

        <div className="bg-[#141418] border border-zinc-800 focus-within:border-[var(--accent)]/60 rounded-2xl p-2 transition-all shadow-inner flex flex-col gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={`Pergunte ao ${activeSpecialty.shortName}...`}
            className="w-full bg-transparent px-1 pt-0.5 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none"
          />

          {/* Context Control Bar: Note Context + Folder Context */}
          <div className="flex items-center justify-between pt-1 border-t border-zinc-800/40 gap-1.5 flex-wrap">
            <div className="flex items-center gap-1.5 flex-wrap">
              {/* Note Context Pill */}
              <div
                className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border transition-all ${
                  isNoteContextActive
                    ? 'bg-zinc-900 border-[var(--accent)]/40 text-zinc-200'
                    : 'bg-zinc-950/60 border-zinc-800 text-zinc-500 line-through opacity-60'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setIsNoteContextActive(a => !a)}
                  className="flex items-center gap-1 cursor-pointer truncate max-w-[130px]"
                  title={isNoteContextActive ? 'Nota ativa no contexto (clique para alternar)' : 'Nota inativa no contexto (clique para ativar)'}
                >
                  <span className={`font-bold ${isNoteContextActive ? 'text-[var(--accent)]' : 'text-zinc-500'}`}>@</span>
                  <span className="truncate">{effectiveNote.title}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsNoteContextActive(a => !a)}
                  className="text-zinc-500 hover:text-zinc-300 ml-0.5 cursor-pointer"
                  title={isNoteContextActive ? 'Desativar nota do contexto' : 'Ativar nota no contexto'}
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </div>

              {/* Folder Context Pill / Selector */}
              <div ref={folderPickerRef} className="relative">
                {selectedFolderContext ? (
                  <div className="flex items-center gap-1 text-[10px] bg-amber-500/10 border border-amber-500/30 text-amber-200 px-2 py-0.5 rounded-full max-w-[170px] truncate shadow-sm">
                    <Folder className="w-3 h-3 text-amber-400 shrink-0" />
                    <button
                      type="button"
                      onClick={() => setIsFolderPickerOpen(o => !o)}
                      className="truncate cursor-pointer hover:underline"
                      title={`Pasta "${selectedFolderContext}" ativa como contexto. Clique para trocar.`}
                    >
                      {selectedFolderContext}
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedFolderContext(null)}
                      className="text-amber-400/80 hover:text-amber-200 ml-0.5 cursor-pointer"
                      title="Remover pasta do contexto"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsFolderPickerOpen(o => !o)}
                    className="flex items-center gap-1 text-[10px] text-zinc-400 hover:text-zinc-200 bg-zinc-900/70 hover:bg-zinc-800/90 border border-dashed border-zinc-700/80 hover:border-zinc-500 px-2 py-0.5 rounded-full transition-all cursor-pointer"
                    title="Adicionar uma pasta inteira do cofre como contexto para a IA"
                  >
                    <FolderPlus className="w-3 h-3 text-zinc-400" />
                    <span>+ Pasta</span>
                  </button>
                )}

                {/* Folder Selection Popover */}
                {isFolderPickerOpen && (
                  <div className="absolute bottom-8 left-0 z-50 w-60 bg-[#101117] border border-zinc-700/80 rounded-xl p-1.5 shadow-2xl space-y-1 animate-in fade-in zoom-in-95 duration-100">
                    <div className="flex items-center justify-between px-2 py-1 text-[10px] font-mono text-zinc-400 border-b border-zinc-800">
                      <span>PASTA COMO CONTEXTO</span>
                      <button
                        type="button"
                        onClick={() => setIsFolderPickerOpen(false)}
                        className="text-zinc-500 hover:text-zinc-300 cursor-pointer"
                      >
                        ✕
                      </button>
                    </div>

                    {/* Quick Button for Current Note's Folder */}
                    {effectiveNote.folder && effectiveNote.folder !== 'Início' && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedFolderContext(effectiveNote.folder)
                          setIsFolderPickerOpen(false)
                        }}
                        className="w-full text-left px-2 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-amber-300 text-[11px] font-medium flex items-center justify-between transition-colors cursor-pointer"
                      >
                        <span className="truncate">Usar pasta da nota: {effectiveNote.folder}</span>
                      </button>
                    )}

                    <div className="max-h-48 overflow-y-auto space-y-0.5 pt-0.5 custom-chat-scrollbar">
                      {folderList.map(({ folder, count }) => {
                        const isCur = selectedFolderContext === folder
                        return (
                          <button
                            key={folder}
                            type="button"
                            onClick={() => {
                              setSelectedFolderContext(folder)
                              setIsFolderPickerOpen(false)
                            }}
                            className={`w-full text-left px-2 py-1.5 rounded-lg flex items-center justify-between text-xs transition-colors cursor-pointer ${
                              isCur
                                ? 'bg-amber-500/20 text-amber-200 font-semibold'
                                : 'hover:bg-zinc-800/60 text-zinc-300'
                            }`}
                          >
                            <div className="flex items-center gap-1.5 truncate">
                              <Folder className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                              <span className="truncate">{folder}</span>
                            </div>
                            <span className="text-[10px] font-mono text-zinc-500 ml-1 shrink-0">
                              {count} {count === 1 ? 'nota' : 'notas'}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Send Message Button */}
            <button
              type="submit"
              disabled={!input.trim() || isGenerating}
              className="w-6 h-6 rounded-full bg-[var(--accent)] hover:opacity-90 disabled:opacity-30 text-zinc-950 font-bold flex items-center justify-center transition-all cursor-pointer shadow-md shadow-black/40 shrink-0 ml-auto"
              title="Enviar mensagem para o Agente"
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
          try {
            localStorage.setItem('pyrita_ai_width', '380')
          } catch {}
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
