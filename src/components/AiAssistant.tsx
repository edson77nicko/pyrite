import React, { useState, useEffect, useMemo, useRef } from 'react'
import type { Note } from '../types'
import { extractWikiLinks } from '../utils/vault'
import { MarkdownRenderer } from './MarkdownRenderer'
import { AiSettingsModal, DEFAULT_AGENT_SKILLS } from './AiSettingsModal'
import { FolderTreePicker } from './FolderTreePicker'
import {
  Sparkles,
  Bot,
  User,
  RefreshCw,
  X,
  ArrowUp,
  ChevronDown,
  Loader2,
  KeyRound,
  Folder,
  FolderPlus,
  Check,
  Settings,
  PenLine,
  Eye,
  Copy,
  MessageSquare,
  Plus,
  Trash2,
  Mic,
  Square,
  Search,
  FileText,
  Clock
} from 'lucide-react'

export type AgentRuleMode = 'analyst' | 'editor'

export interface AgentRuleMeta {
  id: AgentRuleMode
  name: string
  shortName: string
  icon: string
  tagline: string
  badgeColor: string
}

export const AGENT_RULES: AgentRuleMeta[] = [
  {
    id: 'analyst',
    name: 'Modo Analista',
    shortName: 'Analista',
    icon: '👁️',
    tagline: 'Apenas conversa e ajuda com nota e pasta (Somente Leitura)',
    badgeColor: '#38bdf8'
  },
  {
    id: 'editor',
    name: 'Modo Co-Autor',
    shortName: 'Co-Autor',
    icon: '✍️',
    tagline: 'A nota é o seu canvas: edita notas e artefatos diretamente',
    badgeColor: '#c59b27'
  }
]

export interface ChatMessage {
  id: string
  sender: 'ai' | 'user'
  text: string
  isActionable?: boolean
  isAudio?: boolean
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

export interface AgentConversation {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  specialtyId: string
  ruleMode: AgentRuleMode
  messages: ChatMessage[]
}

interface AiAssistantProps {
  currentNote?: Note
  allNotes: Note[]
  onConnectNote: (targetTitle: string) => void
  onAddTag: (tag: string) => void
  onInsertSnippet?: (snippet: string) => void
  onCreateNote?: (folder?: string, initialTitle?: string, initialContent?: string) => void
  onUpdateNote?: (note: Note) => void
  isConversationsOpen?: boolean
  onToggleConversations?: () => void
  onClose: () => void
}

export const AiAssistant: React.FC<AiAssistantProps> = ({
  currentNote,
  allNotes,
  onConnectNote,
  onAddTag,
  onInsertSnippet,
  onUpdateNote,
  isConversationsOpen: externalConversationsOpen,
  onToggleConversations,
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
  const [isMultimodalActive, setIsMultimodalActive] = useState<boolean>(true)
  const [isGenerating, setIsGenerating] = useState<boolean>(false)

  // Local conversations sidebar open state (can be toggled internally or via external prop)
  const [isLocalConversationsOpen, setIsLocalConversationsOpen] = useState<boolean>(false)
  const showConversationsSidebar = externalConversationsOpen ?? isLocalConversationsOpen

  // Agent Specialty State with persistence
  const [activeSpecialtyId, setActiveSpecialtyId] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('pyrita_ai_specialty')
      return saved || 'architect'
    } catch {
      return 'architect'
    }
  })

  // Agent Permission Rule Mode: 'analyst' (read-only consultant) vs 'editor' (co-author that creates/edits notes)
  const [agentRule, setAgentRule] = useState<AgentRuleMode>(() => {
    try {
      const saved = localStorage.getItem('pyrita_ai_agent_rule')
      return (saved === 'editor' ? 'editor' : 'analyst') as AgentRuleMode
    } catch {
      return 'analyst'
    }
  })
  const [isRuleMenuOpen, setIsRuleMenuOpen] = useState(false)

  // Feedback notifications for 1-click actions
  const [insertedNotice, setInsertedNotice] = useState<string | null>(null)
  const [copiedNotice, setCopiedNotice] = useState<string | null>(null)
  const [toastNotice, setToastNotice] = useState<string | null>(null)

  const activeSpecialty = useMemo(() => {
    return AGENT_SPECIALTIES.find(s => s.id === activeSpecialtyId) || AGENT_SPECIALTIES[0]
  }, [activeSpecialtyId])

  // Context Selection States (Note, Folder & Additional Tagged Notes)
  const [isNoteContextActive, setIsNoteContextActive] = useState<boolean>(true)
  const [selectedFolderContext, setSelectedFolderContext] = useState<string | null>(null)
  const [isFolderPickerOpen, setIsFolderPickerOpen] = useState(false)
  const [extraContextNotes, setExtraContextNotes] = useState<Note[]>([])

  // Autocomplete / Search Popups for '/' (skills) and '@' (notes)
  const [slashSearchOpen, setSlashSearchOpen] = useState(false)
  const [slashQuery, setSlashQuery] = useState('')
  const [atSearchOpen, setAtSearchOpen] = useState(false)
  const [atQuery, setAtQuery] = useState('')

  // Audio Recording State for Multimodal Models
  const [isRecording, setIsRecording] = useState(false)
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const recordingTimerRef = useRef<any>(null)

  const ruleMenuRef = useRef<HTMLDivElement | null>(null)
  const folderPickerRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  // Conversations History State with localStorage persistence
  const [conversations, setConversations] = useState<AgentConversation[]>(() => {
    try {
      const saved = localStorage.getItem('pyrita_ai_conversations_v2')
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed) && parsed.length > 0) return parsed
      }
    } catch {}
    return [
      {
        id: 'conv_initial',
        title: 'Conversa Inicial',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        specialtyId: 'architect',
        ruleMode: 'analyst',
        messages: [
          {
            id: 'm1',
            sender: 'ai',
            text: `Olá! Sou o **Agente de IA do Pyrita** atuando como **Arquiteto de Conhecimento** (🧠).\n\nEstou pronto para analisar sua nota ativa e pastas selecionadas com raciocínio profundo e geração de artefatos concêntricos!`
          }
        ]
      }
    ]
  })

  const [activeConversationId, setActiveConversationId] = useState<string>(() => {
    try {
      const savedId = localStorage.getItem('pyrita_ai_active_conv_id')
      return savedId || conversations[0]?.id || 'conv_initial'
    } catch {
      return conversations[0]?.id || 'conv_initial'
    }
  })

  // Synchronize active conversation with messages state
  const activeConversation = useMemo(() => {
    return conversations.find(c => c.id === activeConversationId) || conversations[0]
  }, [conversations, activeConversationId])

  const messages = activeConversation?.messages || []

  const setMessages = (updateFn: (prev: ChatMessage[]) => ChatMessage[]) => {
    setConversations(prevConvs => {
      return prevConvs.map(c => {
        if (c.id === activeConversationId) {
          const newMessages = updateFn(c.messages)
          return {
            ...c,
            messages: newMessages,
            updatedAt: Date.now()
          }
        }
        return c
      })
    })
  }

  // Persist conversations to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('pyrita_ai_conversations_v2', JSON.stringify(conversations))
      localStorage.setItem('pyrita_ai_active_conv_id', activeConversationId)
    } catch (err) {
      console.error('Failed to save conversations:', err)
    }
  }, [conversations, activeConversationId])

  // New Conversation Creator
  const handleStartNewConversation = () => {
    const newConv: AgentConversation = {
      id: `conv_${Date.now()}`,
      title: 'Nova Conversa',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      specialtyId: activeSpecialtyId,
      ruleMode: agentRule,
      messages: [
        {
          id: `msg_${Date.now()}`,
          sender: 'ai',
          text: `Olá! Nova conversa iniciada com **${activeSpecialty.name}** (${activeSpecialty.icon}).\n\nComo posso ajudar você agora? Digite uma pergunta, use \`/\` para skills ou \`@\` para adicionar notas ao contexto.`
        }
      ]
    }
    setConversations(prev => [newConv, ...prev])
    setActiveConversationId(newConv.id)
    if (onToggleConversations && externalConversationsOpen) {
      onToggleConversations()
    } else {
      setIsLocalConversationsOpen(false)
    }
  }

  const handleDeleteConversation = (convId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setConversations(prev => {
      const remaining = prev.filter(c => c.id !== convId)
      if (remaining.length === 0) {
        const fresh: AgentConversation = {
          id: `conv_${Date.now()}`,
          title: 'Nova Conversa',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          specialtyId: activeSpecialtyId,
          ruleMode: agentRule,
          messages: [
            {
              id: `msg_${Date.now()}`,
              sender: 'ai',
              text: `Conversas anteriores excluídas. Iniciando novo chat com **${activeSpecialty.name}**.`
            }
          ]
        }
        setActiveConversationId(fresh.id)
        return [fresh]
      }
      if (activeConversationId === convId) {
        setActiveConversationId(remaining[0].id)
      }
      return remaining
    })
  }

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
      if (ruleMenuRef.current && !ruleMenuRef.current.contains(e.target as Node)) {
        setIsRuleMenuOpen(false)
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
        setIsMultimodalActive(pConfig.multimodal !== undefined ? !!pConfig.multimodal : true)
      }
    } catch (err) {
      console.error('Failed to load AI config:', err)
    }
  }

  useEffect(() => {
    refreshAiConfig()
  }, [])

  const [input, setInput] = useState('')
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [suggestedConnections, setSuggestedConnections] = useState<{ note: Note; reason: string }[]>([])
  const [summary, setSummary] = useState<string | null>(null)
  const [suggestedTags, setSuggestedTags] = useState<string[]>([])
  const [conversationFilter, setConversationFilter] = useState('')

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

  // Audio Recording Handlers
  const handleStartAudioRecording = async () => {
    if (isRecording) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream)
      mediaRecorderRef.current = mediaRecorder
      audioChunksRef.current = []

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' })
        stream.getTracks().forEach(t => t.stop())

        const reader = new FileReader()
        reader.readAsDataURL(audioBlob)
        reader.onloadend = () => {
          const result = reader.result as string
          const base64Data = result.includes(',') ? result.split(',')[1] : result
          executePrompt('', base64Data)
        }
      }

      mediaRecorder.start()
      setIsRecording(true)
      setRecordingSeconds(0)

      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds(s => s + 1)
      }, 1000)
    } catch (err: any) {
      console.error('Audio recording failed:', err)
      alert('Não foi possível acessar o microfone: ' + (err.message || 'Permissão negada.'))
    }
  }

  const handleStopAudioRecording = () => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current)
      recordingTimerRef.current = null
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
    setIsRecording(false)
  }

  const handleCancelAudioRecording = () => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current)
      recordingTimerRef.current = null
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.onstop = null
      mediaRecorderRef.current.stop()
      mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop())
    }
    audioChunksRef.current = []
    setIsRecording(false)
  }

  // Input change handler supporting `/` (skills) and `@` (notes context)
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setInput(val)

    // Check for trailing `@query`
    const atMatch = val.match(/@([a-zA-Z0-9\u00C0-\u017F\s_-]*)$/)
    if (atMatch) {
      setAtQuery(atMatch[1].trim())
      setAtSearchOpen(true)
      setSlashSearchOpen(false)
      return
    } else {
      setAtSearchOpen(false)
    }

    // Check for leading `/query`
    const slashMatch = val.match(/^\/([a-zA-Z0-9\u00C0-\u017F\s_-]*)$/)
    if (slashMatch) {
      setSlashQuery(slashMatch[1].trim())
      setSlashSearchOpen(true)
      setAtSearchOpen(false)
      return
    } else {
      setSlashSearchOpen(false)
    }
  }

  // Select an `@` note to inject into context
  const handleSelectAtNote = (note: Note) => {
    if (!extraContextNotes.some(n => n.id === note.id)) {
      setExtraContextNotes(prev => [...prev, note])
    }
    // Clean `@query` from input
    const cleaned = input.replace(/@([a-zA-Z0-9\u00C0-\u017F\s_-]*)$/, '').trim()
    setInput(cleaned)
    setAtSearchOpen(false)
    inputRef.current?.focus()
  }

  // Select a `/` skill or preset to run
  const handleSelectSlashItem = (promptText: string) => {
    setInput('')
    setSlashSearchOpen(false)
    executePrompt(promptText)
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

  // Interactive Vault Chat with Real LLM, Context Injection & Canvas Auto-Update
  const executePrompt = async (raw: string, audioBase64?: string) => {
    if ((!raw.trim() && !audioBase64) || isGenerating) return

    // Auto-name conversation on first user prompt if still default
    if (activeConversation.title === 'Nova Conversa' || activeConversation.title === 'Conversa Inicial') {
      const derivedTitle = raw.replace(/^[#@/\s]+/, '').slice(0, 30).trim() || (audioBase64 ? 'Mensagem de Áudio' : 'Conversa')
      setConversations(prev => prev.map(c => c.id === activeConversationId ? { ...c, title: derivedTitle } : c))
    }

    const userDisplayText = audioBase64
      ? (raw.trim() ? `🎙️ [Áudio]: ${raw.trim()}` : `🎙️ Mensagem de Áudio (${recordingSeconds || 2}s)`)
      : raw

    const userMsg: ChatMessage = {
      id: `msg_${Date.now()}`,
      sender: 'user',
      text: userDisplayText,
      isAudio: !!audioBase64
    }
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
          contextBlock += `\n### NOTA ATIVA PRINCIPAL EM CONTEXTO:\nTítulo: "${effectiveNote.title}"\nPasta: ${effectiveNote.folder || 'Início'}\nTags: ${effectiveNote.tags?.join(', ') || 'nenhuma'}\nConteúdo da nota:\n---\n${effectiveNote.content || '(nota vazia)'}\n---\n`
        }

        // 2. Extra Tagged Notes via `@`
        if (extraContextNotes.length > 0) {
          contextBlock += `\n### NOTAS ADICIONAIS VINCULADAS COMO CONTEXTO (@):\n`
          for (const en of extraContextNotes) {
            contextBlock += `\n--- NOTA CONTEXTUAL: [[${en.title}]] (Pasta: ${en.folder || 'Início'})\n${en.content.slice(0, 4000)}\n`
          }
          contextBlock += `\n---\n`
        }

        // 3. Folder Context (if selected)
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

        if (!isNoteContextActive && !selectedFolderContext && extraContextNotes.length === 0) {
          contextBlock += `\n(Nenhum contexto específico de nota ou pasta ativo no momento. Responda com base no conhecimento geral e visão geral do Vault).\n`
        }

        // Active skills directives from localStorage
        let skillsDirectiveBlock = ''
        try {
          const savedSkills = localStorage.getItem('pyrita_agent_skills')
          const skillMap: Record<string, boolean> = savedSkills ? JSON.parse(savedSkills) : {}
          const activeDirectives = DEFAULT_AGENT_SKILLS
            .filter(s => (skillMap[s.id] !== undefined ? skillMap[s.id] : s.installed))
            .map(s => `- ${s.directive}`)
          if (activeDirectives.length > 0) {
            skillsDirectiveBlock = `\nHabilidades e Skills Ativas:\n${activeDirectives.join('\n')}\n`
          }
        } catch {}

        const ruleDirective = agentRule === 'editor'
          ? `REGRA DE OPERAÇÃO: MODO CO-AUTOR (ESCRITA & CRIAÇÃO ATIVA).
- A nota ativa é o seu CANVA de trabalho direto!
- Você tem permissão para editar, reescrever, melhorar e atualizar a nota ativa diretamente quando o usuário solicitar.
- QUANDO O USUÁRIO SOLICITAR PARA SUBSTITUIR, EDITAR, REESCREVER OU MELHORAR A NOTA ATIVA (ex: "substitua a nota", "reescreva a nota", "melhore o texto da nota", "atualize a nota com...", "aplique as alterações na nota"):
  Você DEVE fornecer a versão final completa da nota delimitada EXATAMENTE pelo bloco:
  <<<REPLACE_NOTE>>>
  (todo o conteúdo revisado em markdown da nota aqui)
  <<<END_REPLACE_NOTE>>>
  O Pyrita irá detectar esse bloco e atualizar a nota do usuário automaticamente no editor!
- Fora do bloco <<<REPLACE_NOTE>>>, explique resumidamente no chat as melhorias feitas.
- Ao produzir artefatos visuais concêntricos (:::kpi, :::timeline, :::comparison, :::card), forneça blocos elegantes prontos para inserção.`
          : `REGRA DE OPERAÇÃO: MODO ANALISTA (SOMENTE LEITURA).
- Você atua exclusivamente como consultor, parceiro de pensamento e analista de conhecimento.
- Analise a nota e a pasta em profundidade, formule hipóteses, aponte conexões e proponha melhorias.
- Não altere arquivos nem modifique notas diretamente. Todas as interações devem ser no chat.`

        const systemPrompt = `Você é o Agente de IA do Pyrita, assistente de alto nível para gestão de conhecimento e pensamento (estilo Obsidian) com foco em produtividade e artefatos concêntricos.
Especialidade atual: ${activeSpecialty.name} (${activeSpecialty.icon})
Diretriz de Especialidade:
${activeSpecialty.systemDirective}

${ruleDirective}
${skillsDirectiveBlock}
Contexto fornecido pelo usuário:
${contextBlock}

Outras notas disponíveis no cofre: ${allNotes.map(n => n.title).slice(0, 30).join(', ')}.

Diretrizes gerais:
- Responda em português brasileiro com clareza, concisão e utilidade extrema.
- Use formatação Markdown rica (títulos, listas, negrito, etc.).
- Quando fizer perguntas com opções ou alternativas para o usuário escolher com praticidade, utilize o bloco de botões nativo:
  :::buttons [Escolha uma opção]
  - Opção 1 | Prompt enviado ao clicar na Opção 1
  - Opção 2 | Prompt enviado ao clicar na Opção 2
  :::
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

        // Prepare user payload: text or multimodal audio
        let userContent: any = raw
        if (audioBase64) {
          userContent = [
            {
              type: 'text',
              text: raw.trim() || 'Por favor, ouça a mensagem de áudio enviada pelo usuário e responda no contexto do Pyrita:'
            },
            {
              type: 'input_audio',
              input_audio: {
                data: audioBase64,
                format: 'wav'
              }
            }
          ]
        }

        const payloadMessages = [
          { role: 'system', content: systemPrompt },
          ...history,
          { role: 'user', content: userContent }
        ]

        const res = await window.electronAPI.aiChat({
          provider: activeProvider,
          model: activeModel,
          messages: payloadMessages,
          temperature: 0.7
        })

        setMessages(prev => prev.filter(m => m.id !== loadingId))

        if (res.success && res.text) {
          let responseText = res.text

          // Check for Canvas Auto-Update <<<REPLACE_NOTE>>>
          if (agentRule === 'editor' && onUpdateNote && responseText.includes('<<<REPLACE_NOTE>>>')) {
            const replaceMatch = responseText.match(/<<<REPLACE_NOTE>>>([\s\S]*?)<<<END_REPLACE_NOTE>>>/)
            if (replaceMatch && replaceMatch[1]) {
              const revisedContent = replaceMatch[1].trim()
              onUpdateNote({
                ...effectiveNote,
                content: revisedContent,
                updatedAt: Date.now()
              })
              setToastNotice(`✨ Nota "${effectiveNote.title}" atualizada pelo Agente!`)
              setTimeout(() => setToastNotice(null), 4000)

              responseText = responseText.replace(
                /<<<REPLACE_NOTE>>>[\s\S]*?<<<END_REPLACE_NOTE>>>/,
                `> ✨ **Nota [[${effectiveNote.title}]] atualizada com sucesso no seu cofre!**\n`
              ).trim()
            }
          }

          setMessages(prev => [...prev, { id: `ai_${Date.now()}`, sender: 'ai', text: responseText }])
        } else {
          setMessages(prev => [
            ...prev,
            {
              id: `ai_${Date.now()}`,
              sender: 'ai',
              text: `⚠️ **Erro na resposta do provedor (${activeProvider.toUpperCase()}):**\n${res.error || 'Falha ao processar solicitação.'}\n\n*Clique no ícone de configurações acima para ajustar modelo ou chave.*`,
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
            text: `Chave de API do **${activeProvider.toUpperCase()}** não está configurada.\n\nConfigure sua chave no ícone de configurações para conversar com a IA e ter respostas inteligentes em tempo real sobre sua nota e pastas selecionadas!`,
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
    setSlashSearchOpen(false)
    setAtSearchOpen(false)
    executePrompt(text)
  }

  const handleSendPreset = (presetText: string) => {
    executePrompt(presetText)
  }

  // Filtered notes for `@` autocomplete
  const filteredAtNotes = useMemo(() => {
    if (!atSearchOpen) return []
    const q = atQuery.toLowerCase()
    return allNotes
      .filter(n => n.title.toLowerCase().includes(q) || (n.folder && n.folder.toLowerCase().includes(q)))
      .slice(0, 6)
  }, [allNotes, atQuery, atSearchOpen])

  // Filtered skills and presets for `/` autocomplete
  const filteredSlashItems = useMemo(() => {
    if (!slashSearchOpen) return []
    const q = slashQuery.toLowerCase()
    const list: { label: string; prompt: string; category: string }[] = []

    for (const p of activeSpecialty.presets) {
      if (p.label.toLowerCase().includes(q) || p.prompt.toLowerCase().includes(q)) {
        list.push({ label: p.label, prompt: p.prompt, category: activeSpecialty.shortName })
      }
    }

    for (const sk of DEFAULT_AGENT_SKILLS) {
      if (sk.name.toLowerCase().includes(q) || sk.description.toLowerCase().includes(q)) {
        list.push({ label: `${sk.icon} ${sk.name}`, prompt: `Aplicar habilidade "${sk.name}": analise o contexto conforme esta especialidade.`, category: 'Skill' })
      }
    }

    return list.slice(0, 8)
  }, [slashSearchOpen, slashQuery, activeSpecialty])

  // Filtered conversations list for the drawer
  const filteredConversations = useMemo(() => {
    if (!conversationFilter.trim()) return conversations
    const q = conversationFilter.toLowerCase()
    return conversations.filter(c => c.title.toLowerCase().includes(q))
  }, [conversations, conversationFilter])

  return (
    <div
      style={{ width: `${panelWidth}px` }}
      className="h-full bg-[#0c0c0f] border-r border-zinc-800/80 flex flex-col select-none shrink-0 text-xs z-10 relative overflow-hidden"
    >
      {/* Toast Notification Banner (e.g. Note updated as canvas) */}
      {toastNotice && (
        <div className="absolute top-11 left-3 right-3 z-50 bg-[var(--accent)] text-zinc-950 px-3 py-2 rounded-xl font-semibold text-xs shadow-xl flex items-center justify-between animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center gap-1.5 truncate">
            <Sparkles className="w-4 h-4 shrink-0" />
            <span className="truncate">{toastNotice}</span>
          </div>
          <button
            type="button"
            onClick={() => setToastNotice(null)}
            className="text-zinc-950 hover:opacity-75 cursor-pointer ml-1"
          >
            ✕
          </button>
        </div>
      )}

      {/* 1. TOP HEADER: AGENT RULE SELECTOR (ANALISTA vs CO-AUTOR) & ACTION ICONS */}
      <div className="h-10 px-3 border-b border-zinc-800/80 bg-[#0e0e12] flex items-center justify-between shrink-0 gap-1.5">
        {/* Agent Rule Selector: Modo Analista (Leitura) vs Modo Co-Autor (Edita Notas) */}
        <div ref={ruleMenuRef} className="relative">
          <button
            type="button"
            onClick={() => setIsRuleMenuOpen(o => !o)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs transition-all cursor-pointer shadow-sm ${
              agentRule === 'editor'
                ? 'bg-[var(--accent)]/15 border-[var(--accent)]/40 text-[var(--accent)]'
                : 'bg-zinc-900 border-zinc-700/70 text-zinc-200 hover:border-zinc-500'
            }`}
            title="Permissão do Agente: Modo Analista (Leitura) ou Modo Co-Autor (Edita Notas)"
          >
            <span>{agentRule === 'editor' ? '✍️' : '👁️'}</span>
            <span className="font-semibold text-[11px]">
              {agentRule === 'editor' ? 'Modo Co-Autor' : 'Modo Analista'}
            </span>
            <ChevronDown className="w-3 h-3 text-zinc-500 ml-0.5" />
          </button>

          {isRuleMenuOpen && (
            <div className="absolute top-9 left-0 z-50 w-72 bg-[#101117] border border-zinc-700/80 rounded-xl p-1.5 shadow-2xl space-y-1 animate-in fade-in zoom-in-95 duration-100">
              <div className="px-2 py-1 text-[10px] font-mono text-zinc-400 border-b border-zinc-800 flex items-center justify-between">
                <span>REGRA DE OPERAÇÃO DO AGENTE</span>
                <span className="text-[9px] text-zinc-500">Permissão</span>
              </div>
              <div className="space-y-0.5 pt-0.5">
                {AGENT_RULES.map(rule => {
                  const isCur = agentRule === rule.id
                  return (
                    <button
                      key={rule.id}
                      type="button"
                      onClick={() => {
                        setAgentRule(rule.id)
                        try {
                          localStorage.setItem('pyrita_ai_agent_rule', rule.id)
                        } catch {}
                        setIsRuleMenuOpen(false)
                      }}
                      className={`w-full text-left px-2.5 py-2 rounded-lg flex items-start gap-2.5 transition-all cursor-pointer ${
                        isCur
                          ? 'bg-[var(--accent)]/15 border border-[var(--accent)]/30 text-white'
                          : 'hover:bg-zinc-850 text-zinc-300'
                      }`}
                    >
                      <span className="text-base leading-none mt-0.5">{rule.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-xs flex items-center justify-between">
                          <span className={isCur ? 'text-[var(--accent)]' : 'text-zinc-100'}>{rule.name}</span>
                          {isCur && <Check className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />}
                        </div>
                        <p className="text-[10px] text-zinc-400 leading-tight mt-0.5">
                          {rule.tagline}
                        </p>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Action Buttons: Conversations Drawer Toggle, Settings Icon (NO text!), Smart Discovery, Close */}
        <div className="flex items-center gap-0.5">
          {/* Toggle Conversations History Drawer */}
          <button
            type="button"
            onClick={() => {
              if (onToggleConversations) {
                onToggleConversations()
              } else {
                setIsLocalConversationsOpen(o => !o)
              }
            }}
            className={`p-1.5 rounded-md transition-colors cursor-pointer ${
              showConversationsSidebar
                ? 'bg-[var(--accent)]/20 text-[var(--accent)] border border-[var(--accent)]/40'
                : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60'
            }`}
            title="Histórico de Conversas (ChatGPT / Gemini style)"
          >
            <MessageSquare className="w-3.5 h-3.5" />
          </button>

          {/* Settings Icon Only (No model name in header) */}
          <button
            type="button"
            onClick={() => setIsSettingsOpen(true)}
            className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60 rounded-md transition-colors cursor-pointer relative"
            title="Configurações do Agente (Modelos, Especialidades, Skills)"
          >
            <Settings className="w-3.5 h-3.5" />
            {hasActiveKey || activeProvider === 'ollama' ? (
              <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_4px_rgba(52,211,153,0.8)]" title="Chave configurada e ativa" />
            ) : (
              <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-amber-400" title="Chave não configurada" />
            )}
          </button>

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

      {/* 2. CONVERSATIONS DRAWER OVERLAY (ChatGPT / Gemini Style) */}
      {showConversationsSidebar && (
        <div className="absolute inset-0 top-10 z-40 bg-[#0e0f14]/95 backdrop-blur-md flex flex-col p-3 border-r border-zinc-800/90 animate-in fade-in slide-in-from-left duration-200">
          <div className="flex items-center justify-between pb-2 border-b border-zinc-800/70 mb-2">
            <div className="flex items-center gap-1.5">
              <MessageSquare className="w-4 h-4 text-[var(--accent)]" />
              <span className="font-semibold text-zinc-200 text-xs">Conversas Salvas</span>
            </div>
            <button
              type="button"
              onClick={handleStartNewConversation}
              className="px-2.5 py-1 bg-[var(--accent)] hover:opacity-90 text-zinc-950 font-bold rounded-lg text-[10px] flex items-center gap-1 cursor-pointer shadow-sm transition-all"
            >
              <Plus className="w-3 h-3 stroke-[3]" />
              <span>Nova Conversa</span>
            </button>
          </div>

          {/* Search conversation */}
          <div className="relative mb-2">
            <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-2" />
            <input
              type="text"
              value={conversationFilter}
              onChange={(e) => setConversationFilter(e.target.value)}
              placeholder="Buscar histórico..."
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-8 pr-2 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-[var(--accent)]/50"
            />
          </div>

          {/* Conversations List */}
          <div className="flex-1 overflow-y-auto space-y-1 custom-chat-scrollbar pr-0.5">
            {filteredConversations.length === 0 ? (
              <div className="text-center py-6 text-zinc-500 text-[11px]">
                Nenhuma conversa encontrada.
              </div>
            ) : (
              filteredConversations.map(conv => {
                const isCur = conv.id === activeConversationId
                return (
                  <div
                    key={conv.id}
                    onClick={() => {
                      setActiveConversationId(conv.id)
                      if (onToggleConversations && externalConversationsOpen) {
                        onToggleConversations()
                      } else {
                        setIsLocalConversationsOpen(false)
                      }
                    }}
                    className={`group w-full text-left p-2 rounded-xl flex items-center justify-between text-xs transition-all cursor-pointer ${
                      isCur
                        ? 'bg-[var(--accent)]/15 border border-[var(--accent)]/30 text-white font-medium'
                        : 'hover:bg-zinc-850/80 text-zinc-300 border border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <Clock className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[11px] leading-tight">{conv.title}</div>
                        <div className="text-[9px] text-zinc-500 mt-0.5 flex items-center gap-1">
                          <span>{conv.messages.length} msgs</span>
                          <span>•</span>
                          <span>{new Date(conv.updatedAt).toLocaleDateString('pt-BR')}</span>
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => handleDeleteConversation(conv.id, e)}
                      className="opacity-0 group-hover:opacity-100 p-1 text-zinc-500 hover:text-rose-400 hover:bg-zinc-800 rounded transition-all cursor-pointer ml-1"
                      title="Excluir conversa"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                )
              })
            )}
          </div>

          <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between text-[10px] text-zinc-500">
            <span>{conversations.length} conversas salvas</span>
            <button
              type="button"
              onClick={() => {
                if (onToggleConversations && externalConversationsOpen) {
                  onToggleConversations()
                } else {
                  setIsLocalConversationsOpen(false)
                }
              }}
              className="text-zinc-400 hover:text-zinc-200 cursor-pointer"
            >
              Fechar
            </button>
          </div>
        </div>
      )}

      {/* 3. CHAT FEED */}
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
        <div className="space-y-3 pt-1">
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

              {/* Seamless Typography: Transparent container for AI, Speech bubble for User */}
              {m.sender === 'user' ? (
                <div className="p-2.5 rounded-2xl bg-zinc-800/90 text-zinc-100 rounded-br-xs max-w-[90%] shadow-sm">
                  {m.text}
                </div>
              ) : (
                <div className="w-full text-zinc-200 px-1 py-1 space-y-2">
                  {m.text === 'Pensando...' ? (
                    <div className="flex items-center gap-2 py-1 text-zinc-400 font-mono text-[11px]">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--accent)] shrink-0" />
                      <span>Processando com {activeProvider.toUpperCase()} ({activeModel})...</span>
                    </div>
                  ) : (
                    <MarkdownRenderer
                      content={m.text}
                      onNavigate={onConnectNote}
                      onButtonClick={(promptText) => executePrompt(promptText)}
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

                  {/* Co-Autor Mode: Direct note insertion & Copy actions (NO manual "Substituir Nota" and NO "+ Nova Nota") */}
                  {agentRule === 'editor' && !m.isActionable && m.text !== 'Pensando...' && (
                    <div className="pt-2 border-t border-zinc-800/60 flex items-center justify-between gap-1.5 flex-wrap">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {m.text.includes(':::') && onInsertSnippet && (
                          <button
                            type="button"
                            onClick={() => {
                              const matches = m.text.match(/:::[\s\S]*?:::/g)
                              const snippet = matches ? matches.join('\n\n') : m.text
                              onInsertSnippet(snippet)
                              setInsertedNotice(m.id)
                              setTimeout(() => setInsertedNotice(null), 3000)
                            }}
                            className="px-2.5 py-1 bg-[var(--accent)]/15 hover:bg-[var(--accent)]/25 border border-[var(--accent)]/30 text-[var(--accent)] rounded-lg text-[10px] font-semibold transition-all flex items-center gap-1 cursor-pointer shadow-sm"
                            title="Inserir artefato concêntrico diretamente na nota ativa"
                          >
                            <Sparkles className="w-3 h-3 text-[var(--accent)]" />
                            <span>{insertedNotice === m.id ? '✓ Inserido na Nota!' : '+ Inserir Artefato na Nota'}</span>
                          </button>
                        )}

                        {onInsertSnippet && !m.text.includes(':::') && (
                          <button
                            type="button"
                            onClick={() => {
                              onInsertSnippet(m.text)
                              setInsertedNotice(m.id)
                              setTimeout(() => setInsertedNotice(null), 3000)
                            }}
                            className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-750 border border-zinc-700/60 text-zinc-200 rounded-lg text-[10px] font-medium transition-all flex items-center gap-1 cursor-pointer shadow-sm"
                            title="Inserir resposta no final da nota ativa"
                          >
                            <PenLine className="w-3 h-3 text-zinc-400" />
                            <span>{insertedNotice === m.id ? '✓ Inserido!' : 'Inserir no Final da Nota'}</span>
                          </button>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(m.text)
                          setCopiedNotice(m.id)
                          setTimeout(() => setCopiedNotice(null), 2000)
                        }}
                        className="p-1 text-zinc-500 hover:text-zinc-300 rounded transition-colors cursor-pointer"
                        title="Copiar texto em Markdown"
                      >
                        {copiedNotice === m.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  )}

                  {/* Analyst Mode: Read-only badge and Copy button */}
                  {agentRule === 'analyst' && !m.isActionable && m.text !== 'Pensando...' && (
                    <div className="pt-2 border-t border-zinc-800/60 flex items-center justify-between text-[10px] text-zinc-500">
                      <span className="italic flex items-center gap-1">
                        <Eye className="w-3 h-3 text-sky-400/80" />
                        Modo Analista (Consultivo)
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(m.text)
                          setCopiedNotice(m.id)
                          setTimeout(() => setCopiedNotice(null), 2000)
                        }}
                        className="px-2 py-0.5 rounded bg-zinc-850 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 flex items-center gap-1 cursor-pointer transition-colors"
                        title="Copiar análise"
                      >
                        {copiedNotice === m.id ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedNotice === m.id ? 'Copiado!' : 'Copiar'}</span>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 4. MODERN CHAT INPUT CARD WITH '/' (SKILLS) & '@' (NOTES) AUTOCOMPLETE */}
      <form onSubmit={handleSendMessage} className="p-2.5 border-t border-zinc-800/80 bg-[#0c0c0f] flex flex-col gap-1.5 relative">
        {/* Floating Autocomplete for '@' (Notes Context) */}
        {atSearchOpen && filteredAtNotes.length > 0 && (
          <div className="absolute bottom-full left-2.5 right-2.5 mb-2 bg-[#12131a] border border-zinc-700/80 rounded-xl p-1.5 shadow-2xl z-50 space-y-0.5 max-h-56 overflow-y-auto custom-chat-scrollbar animate-in fade-in zoom-in-95 duration-100">
            <div className="px-2 py-1 text-[10px] font-mono text-zinc-400 border-b border-zinc-800 flex items-center justify-between">
              <span>SOMAR NOTA AO CONTEXTO (@)</span>
              <span className="text-[9px] text-zinc-500">{filteredAtNotes.length} opções</span>
            </div>
            {filteredAtNotes.map(n => (
              <button
                key={n.id}
                type="button"
                onClick={() => handleSelectAtNote(n)}
                className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-zinc-800/80 text-zinc-200 flex items-center justify-between text-xs cursor-pointer transition-colors"
              >
                <div className="flex items-center gap-1.5 truncate">
                  <FileText className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                  <span className="truncate font-medium">{n.title}</span>
                </div>
                <span className="text-[10px] text-zinc-500 font-mono shrink-0 ml-1">
                  {n.folder || 'Início'}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Floating Autocomplete for '/' (Skills / Presets) */}
        {slashSearchOpen && filteredSlashItems.length > 0 && (
          <div className="absolute bottom-full left-2.5 right-2.5 mb-2 bg-[#12131a] border border-zinc-700/80 rounded-xl p-1.5 shadow-2xl z-50 space-y-0.5 max-h-56 overflow-y-auto custom-chat-scrollbar animate-in fade-in zoom-in-95 duration-100">
            <div className="px-2 py-1 text-[10px] font-mono text-zinc-400 border-b border-zinc-800 flex items-center justify-between">
              <span>SKILLS & PRESETS DISPONÍVEIS (/)</span>
              <span className="text-[9px] text-zinc-500">{filteredSlashItems.length} opções</span>
            </div>
            {filteredSlashItems.map((item, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSelectSlashItem(item.prompt)}
                className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-zinc-800/80 text-zinc-200 flex items-center justify-between text-xs cursor-pointer transition-colors"
              >
                <div className="flex items-center gap-1.5 truncate">
                  <Sparkles className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                  <span className="truncate font-medium">{item.label}</span>
                </div>
                <span className="text-[9px] text-zinc-500 font-mono px-1 py-0.5 rounded bg-zinc-900 border border-zinc-800 shrink-0 ml-1">
                  {item.category}
                </span>
              </button>
            ))}
          </div>
        )}

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

        {/* Input Box Card */}
        <div className="bg-[#141418] border border-zinc-800 focus-within:border-[var(--accent)]/60 rounded-2xl p-2 transition-all shadow-inner flex flex-col gap-2">
          {/* Audio Recording Live Banner */}
          {isRecording ? (
            <div className="flex items-center justify-between px-2 py-1.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs animate-pulse">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
                <span className="font-semibold">Gravando áudio multimodal ({recordingSeconds}s)...</span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleCancelAudioRecording}
                  className="px-2 py-0.5 text-[10px] text-zinc-400 hover:text-zinc-200 rounded cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleStopAudioRecording}
                  className="px-2.5 py-1 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-lg text-[10px] flex items-center gap-1 cursor-pointer shadow-sm"
                  title="Finalizar e enviar áudio direto ao modelo"
                >
                  <Square className="w-3 h-3 fill-current" />
                  <span>Enviar</span>
                </button>
              </div>
            </div>
          ) : (
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={handleInputChange}
              placeholder={`Pergunte ao ${activeSpecialty.shortName} (digite '/' para skills ou '@' para somar notas)...`}
              className="w-full bg-transparent px-1 pt-0.5 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none"
            />
          )}

          {/* Context Control Bar: Note Context + Extra Notes (@) + Folder Context (Hierarchical) */}
          <div className="flex items-center justify-between pt-1 border-t border-zinc-800/40 gap-1.5 flex-wrap">
            <div className="flex items-center gap-1.5 flex-wrap">
              {/* Primary Active Note Context Pill */}
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

              {/* Extra Tagged Context Notes (@) */}
              {extraContextNotes.map(en => (
                <div
                  key={en.id}
                  className="flex items-center gap-1 text-[10px] bg-purple-500/15 border border-purple-500/30 text-purple-200 px-2 py-0.5 rounded-full max-w-[140px] truncate shadow-sm"
                >
                  <span className="font-bold text-purple-400">@</span>
                  <span className="truncate">{en.title}</span>
                  <button
                    type="button"
                    onClick={() => setExtraContextNotes(prev => prev.filter(n => n.id !== en.id))}
                    className="text-purple-400/80 hover:text-purple-100 ml-0.5 cursor-pointer"
                    title="Remover do contexto"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </div>
              ))}

              {/* Hierarchical Folder Context Picker */}
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
                    title="Adicionar uma pasta inteira do cofre com hierarquia como contexto para a IA"
                  >
                    <FolderPlus className="w-3 h-3 text-zinc-400" />
                    <span>+ Pasta</span>
                  </button>
                )}

                {/* Hierarchical Folder Selection Popover with Subfolder Tree */}
                {isFolderPickerOpen && (
                  <div className="absolute bottom-8 left-0 z-50 w-72 bg-[#101117] border border-zinc-700/80 rounded-xl p-2 shadow-2xl animate-in fade-in zoom-in-95 duration-100">
                    <FolderTreePicker
                      folders={folderList}
                      selectedFolder={selectedFolderContext}
                      currentNoteFolder={effectiveNote.folder}
                      onSelectFolder={(f) => {
                        setSelectedFolderContext(f)
                        setIsFolderPickerOpen(false)
                      }}
                      onClose={() => setIsFolderPickerOpen(false)}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Input Action Group: Multimodal Audio Button & Send Button */}
            <div className="flex items-center gap-1.5 ml-auto">
              {/* Multimodal Audio Recording Button */}
              {isMultimodalActive && !isRecording && (
                <button
                  type="button"
                  onClick={handleStartAudioRecording}
                  disabled={isGenerating}
                  className="p-1.5 text-zinc-400 hover:text-rose-400 hover:bg-zinc-800/60 rounded-full transition-colors cursor-pointer"
                  title="Gravar áudio direto para o modelo multimodal (sem transcrição)"
                >
                  <Mic className="w-3.5 h-3.5" />
                </button>
              )}

              {/* Send Message Button */}
              <button
                type="submit"
                disabled={!input.trim() || isGenerating}
                className="w-6 h-6 rounded-full bg-[var(--accent)] hover:opacity-90 disabled:opacity-30 text-zinc-950 font-bold flex items-center justify-center transition-all cursor-pointer shadow-md shadow-black/40 shrink-0"
                title="Enviar mensagem para o Agente"
              >
                <ArrowUp className="w-3.5 h-3.5 stroke-[2.5]" />
              </button>
            </div>
          </div>
        </div>
      </form>

      {/* Unified AI Settings Modal with Left Sidebar (Modelos, Especialidades, Skills) */}
      <AiSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        activeSpecialtyId={activeSpecialtyId}
        onSelectSpecialty={id => {
          setActiveSpecialtyId(id)
          try {
            localStorage.setItem('pyrita_ai_specialty', id)
          } catch {}
        }}
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
