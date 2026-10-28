import React, { useState, useEffect, useMemo, useRef } from 'react'
import type { Note, NoteType } from '../types'
import type { TaskItem, TaskSettings, SubTask, TaskBoard } from '../types/tasks'
import { extractWikiLinks } from '../utils/vault'
import { mindMapToMarkdownOutline, parseMindMapDocument, serializeMindMapDocument, isMindMapContent, cleanNodeTitle } from '../utils/mindMapUtils'
import { MarkdownRenderer } from './MarkdownRenderer'
import { AiSettingsModal } from './AiSettingsModal'
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
  Pencil,
  Mic,
  Square,
  Search,
  FileText,
  Clock,
  CheckCircle2,
  CheckSquare,
  Calendar,
  Flag,
  ListTodo,
  FilePlus
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

export interface ParsedTaskAction {
  action: 'create' | 'update' | 'delete'
  title: string
  priority?: 'urgent' | 'high' | 'medium' | 'low' | 'none'
  deadline?: string
  tags?: string[]
  subtasks?: string[]
  description?: string
  boardId?: string
}

export function parseMessageTaskActions(text: string): { displayText: string; actions: ParsedTaskAction[] } {
  const actions: ParsedTaskAction[] = []
  if (!text || !text.includes('```task-action')) {
    return { displayText: text || '', actions }
  }

  const regex = /```task-action\s*([\s\S]*?)\s*```/g
  let match
  while ((match = regex.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[1])
      if (parsed && parsed.title) {
        actions.push({
          action: parsed.action || 'create',
          title: parsed.title,
          priority: parsed.priority || 'medium',
          deadline: parsed.deadline,
          tags: Array.isArray(parsed.tags) ? parsed.tags : [],
          subtasks: Array.isArray(parsed.subtasks) ? parsed.subtasks : [],
          description: parsed.description || '',
          boardId: parsed.boardId || undefined
        })
      }
    } catch (e) {
      console.warn('Falha ao processar bloco task-action:', e)
    }
  }

  const displayText = text.replace(/```task-action\s*[\s\S]*?\s*```/g, '').trim()
  return { displayText, actions }
}

export const AGENT_SPECIALTIES: AgentSpecialty[] = [
  {
    id: 'none',
    name: 'Modo Padrão (Sem Especialidade)',
    shortName: 'Padrão',
    badgeColor: '#71717a',
    icon: '🤖',
    tagline: 'Comportamento natural do modelo LLM sem direcionamento de persona adicional',
    systemDirective: '',
    presets: []
  },
  {
    id: 'architect',
    name: 'Arquiteto de Conhecimento',
    shortName: 'Arquiteto',
    badgeColor: '#c59b27',
    icon: '🧠',
    tagline: 'Construção de segundo cérebro, mapeamento ontológico, taxonomia e pontes no Vault',
    systemDirective: `Sua persona e missão principal é a ARQUITETURA DE CONHECIMENTO E GESTÃO DE PENSAMENTO EM REDE (Segundo Cérebro / Zettelkasten).
- Trate cada nota e pasta não como arquivos isolados, mas como nós de um grafo vivo e interconectado de ideias.
- Identifique ativamente pontes conceituais latentes e conexões não óbvias entre diferentes tópicos e disciplinas presentes no cofre.
- Proponha links bidirecionais [[Nome da Nota]] ou [[Nome da Nota|Alias]] sempre que oportuno, justificando a sinergia.
- Ajude a estruturar MOCs (Maps of Content), taxonomias orgânicas de tags e categorias para organização sustentável de longo prazo.
- Detecte lacunas conceituais e sugira desdobramentos lógicos para aprofundamento do tema.`,
    presets: [
      { label: '🔗 Conexões no Vault', prompt: 'Analise o contexto e sugira conexões semânticas com outras ideias do cofre, indicando links bidirecionais [[...]].' },
      { label: '🧩 Mapa Conceitual', prompt: 'Crie um mapa conceitual das ideias centrais presentes neste contexto.' },
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
    tagline: 'Comunicação executiva de alto impacto, clareza cirúrgica, elegância e ritmo',
    systemDirective: `Sua persona e missão principal é a REDAÇÃO DE ELITE, CLAREZA RADICAL E SÍNTESE EXECUTIVA.
- Escreva com máxima densidade informacional e elegância: cada parágrafo deve entregar valor indispensável sem desperdício de palavras.
- Elimine jargões vazios, rodeios e prolixidade. Estruture o texto com ritmo fluido, títulos escaneáveis e frases de alto impacto.
- Ao sintetizar, capture a essência nuclear das notas sem perder os nuances críticos.
- Ao expandir tópicos, utilize analogias memoráveis, exemplos práticos concretos e distinções conceituais nítidas.`,
    presets: [
      { label: '✨ Melhorar Redação', prompt: 'Reescreva e aprimore o texto do contexto com maior elegância, fluidez e clareza.' },
      { label: '📋 Resumo Executivo', prompt: 'Gere um resumo executivo em tópicos com os pontos mais importantes do contexto.' },
      { label: '📖 Expandir Tópico', prompt: 'Expanda o conteúdo com explicações aprofundadas, exemplos práticos e desdobramentos.' },
      { label: '🎯 Títulos & Estrutura', prompt: 'Sugira títulos, subtítulos e uma estrutura refinada para organizar este texto.' }
    ]
  },
  {
    id: 'critic',
    name: 'Analista Crítico & Socrático',
    shortName: 'Crítico',
    badgeColor: '#f43f5e',
    icon: '🔬',
    tagline: 'Pensamento por primeiros princípios, testes de estresse em teses e método socrático',
    systemDirective: `Sua persona e missão principal é a ANÁLISE CRÍTICA RIGOROSA, QUESTIONAMENTO SOCRÁTICO E PENSAMENTO POR PRIMEIROS PRINCÍPIOS.
- Atue como um parceiro intelectual exigente: desafie premissas não comprovadas, vieses de confirmação e conclusões precipitadas.
- Construa a melhor antítese possível (steel-man) para a tese defendida pelo usuário, testando sua solidez lógica.
- Formule perguntas socráticas cirúrgicas que provoquem reflexão profunda e desvelem ângulos cegos.
- Avalie efeitos de segunda e terceira ordem, custos de oportunidade, riscos não mapeados e trade-offs implícitos.`,
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
    tagline: 'Arquitetura de sistemas, especificações técnicas rigorosas e engenharia limpa',
    systemDirective: `Sua persona e missão principal é a ENGENHARIA DE SOFTWARE E ESPECIFICAÇÃO TÉCNICA DE ALTO PADRÃO.
- Projete soluções com rigor arquitetural: desacoplamento, manutenibilidade, escalabilidade e respeito a padrões consolidados.
- Ao propor arquiteturas, pondere os trade-offs de engenharia (complexidade vs. flexibilidade, performance vs. legibilidade).
- Quando fornecer código, entregue implementações idiomáticas, tipadas, robustas, com tratamento preventivo de erros e documentação contextualizada.
- Crie especificações funcionais, checklists técnicos de implementação e diagramas textuais estruturados.`,
    presets: [
      { label: '💻 Especificação Técnica', prompt: 'Elabore uma especificação técnica detalhada com requisitos funcionais e não funcionais.' },
      { label: '📐 Arquitetura de Dados', prompt: 'Proponha uma arquitetura de componentes ou modelo de dados para suportar este projeto.' },
      { label: '🛠️ Snippet de Código', prompt: 'Gere um exemplo de código funcional e bem documentado implementando o conceito central.' },
      { label: '✅ Checklist de Entrega', prompt: 'Crie um checklist de tarefas técnicas para implementação e validação passo a passo.' }
    ]
  },
  {
    id: 'project_manager',
    name: 'Gestor de Projetos & Tarefas',
    shortName: 'Gestor',
    badgeColor: '#10b981',
    icon: '📋',
    tagline: 'Decomposição de metas em planos acionáveis, gestão de backlog, prazos e tarefas',
    systemDirective: `Sua persona e missão principal é a GESTÃO ESTRATÉGICA DE PROJETOS, EXECUÇÃO E DECOMPOSIÇÃO DE METAS EM TAREFAS.
- Atue como um experiente Gerente de Projetos e Tech Lead ágil.
- Quando o usuário expressar um objetivo, projeto ou necessidade, ajude a decompô-lo em tarefas claras, prioritárias, estimadas e acionáveis com subtarefas lógicas.
- Sempre que sugerir criar, atualizar ou estruturar tarefas no Pyrita, forneça blocos executáveis de ação de tarefas usando a sintaxe especial:
\`\`\`task-action
{
  "action": "create",
  "title": "Nome conciso da tarefa",
  "priority": "high",
  "deadline": "2026-10-25",
  "tags": ["projeto", "prioridade"],
  "subtasks": ["Passo 1", "Passo 2", "Passo 3"],
  "description": "Detalhes sobre a entrega..."
}
\`\`\`
- Prioridades aceitas: "urgent", "high", "medium", "low", "none".
- Analise periodicamente a lista de tarefas existentes no Vault para identificar gargalos, tarefas atrasadas e dependências críticas.`,
    presets: [
      { label: '🎯 Decompor em Tarefas', prompt: 'Analise o contexto atual e crie um plano de execução estruturado com tarefas acionáveis e subtarefas detalhadas.' },
      { label: '📊 Status & Priorização', prompt: 'Analise as tarefas do cofre e sugira a priorização recomendada para a semana/sprint com prazos.' },
      { label: '⚡ Checklist Rápido', prompt: 'Gere um checklist executável de tarefas prioritárias para iniciar este objetivo imediatamente.' },
      { label: '🔍 Auditoria de Gargalos', prompt: 'Identifique riscos, dependências ocultas e tarefas que podem travar o avanço do projeto.' }
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
  linkedBoardId?: string
}

interface AiAssistantProps {
  vaultPath?: string
  currentNote?: Note
  allNotes: Note[]
  onConnectNote: (targetTitle: string) => void
  onAddTag: (tag: string) => void
  onInsertSnippet?: (snippet: string) => void
  onCreateNote?: (folder?: string, initialTitle?: string, initialContent?: string, type?: NoteType) => void
  onUpdateNote?: (note: Note) => void
  tasks?: TaskItem[]
  taskSettings?: TaskSettings
  activeBoardId?: string
  taskBoards?: TaskBoard[]
  onCreateTask?: (initialTitle?: string, initialData?: Partial<TaskItem>) => void
  onUpdateTask?: (task: TaskItem) => void
  onDeleteTask?: (taskId: string) => void
  onOpenTasks?: () => void
  isConversationsOpen?: boolean
  onToggleConversations?: () => void
  onClose: () => void
}

export const AiAssistant: React.FC<AiAssistantProps> = ({
  vaultPath,
  currentNote,
  allNotes,
  onConnectNote,
  onAddTag,
  onInsertSnippet,
  onCreateNote,
  onUpdateNote,
  tasks,
  taskSettings,
  activeBoardId,
  taskBoards = [],
  onCreateTask,
  onUpdateTask,
  onDeleteTask,
  onOpenTasks,
  isConversationsOpen: externalConversationsOpen,
  onToggleConversations,
  onClose
}) => {
  const vaultKey = useMemo(() => (vaultPath ? encodeURIComponent(vaultPath).replace(/%/g, '_') : 'default'), [vaultPath])
  const storageKeyConversations = `pyrita_ai_conversations_v2_${vaultKey}`
  const storageKeyActiveConvId = `pyrita_ai_active_conv_id_${vaultKey}`
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

  // Local conversations sidebar open state
  const [isLocalConversationsOpen, setIsLocalConversationsOpen] = useState<boolean>(false)
  const showConversationsSidebar = externalConversationsOpen ?? isLocalConversationsOpen

  // Renaming state for conversations
  const [editingConvId, setEditingConvId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')

  // Agent Specialty State with persistence
  const [activeSpecialtyId, setActiveSpecialtyId] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('pyrita_ai_specialty')
      if (saved === 'strategist') return 'architect'
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
  const [executedTaskActions, setExecutedTaskActions] = useState<Record<string, boolean>>({})

  const handleExecuteTaskAction = (act: ParsedTaskAction, key: string) => {
    if (act.action === 'delete' && onDeleteTask) {
      const existing = tasks?.find(t => t.title.toLowerCase() === act.title.toLowerCase())
      if (existing) {
        onDeleteTask(existing.id)
        setExecutedTaskActions(prev => ({ ...prev, [key]: true }))
        return
      }
    }

    if (act.action === 'update' && onUpdateTask) {
      const existing = tasks?.find(t => t.title.toLowerCase() === act.title.toLowerCase())
      if (existing) {
        onUpdateTask({
          ...existing,
          priority: (act.priority as any) || existing.priority,
          deadline: act.deadline || existing.deadline,
          tags: act.tags?.length ? act.tags : existing.tags,
          description: act.description || existing.description,
          updatedAt: Date.now()
        })
        setExecutedTaskActions(prev => ({ ...prev, [key]: true }))
        return
      }
    }

    if (!onCreateTask) return
    const subtasksList: SubTask[] = (act.subtasks || []).map(stTitle => ({
      id: 'st_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6),
      title: stTitle,
      completed: false,
      createdAt: Date.now()
    }))

    const targetBoardId = act.boardId || activeConversation?.linkedBoardId || activeBoardId || 'default'
    onCreateTask(act.title, {
      priority: (act.priority as any) || 'medium',
      deadline: act.deadline,
      tags: act.tags || [],
      subtasks: subtasksList,
      description: act.description || '',
      boardId: targetBoardId
    })

    setExecutedTaskActions(prev => ({ ...prev, [key]: true }))
  }

  const activeSpecialty = useMemo(() => {
    if (activeSpecialtyId === 'none') {
      return AGENT_SPECIALTIES[0]
    }
    return AGENT_SPECIALTIES.find(s => s.id === activeSpecialtyId) || AGENT_SPECIALTIES[1]
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
  const boardMenuRef = useRef<HTMLDivElement | null>(null)
  const folderPickerRef = useRef<HTMLDivElement | null>(null)
  const folderPopupRef = useRef<HTMLDivElement | null>(null)
  const [completionIndex, setCompletionIndex] = useState(0)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)

  // Conversations History State with localStorage persistence per vault
  const [conversations, setConversations] = useState<AgentConversation[]>(() => {
    try {
      const saved = localStorage.getItem(storageKeyConversations) || (vaultKey === 'default' ? localStorage.getItem('pyrita_ai_conversations_v2') : null)
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
            text: `Olá! Sou o **Agente de IA do Pyrita**.\n\nEstou pronto para analisar sua nota ativa e pastas selecionadas com raciocínio profundo.`
          }
        ]
      }
    ]
  })

  const [activeConversationId, setActiveConversationId] = useState<string>(() => {
    try {
      const savedId = localStorage.getItem(storageKeyActiveConvId) || (vaultKey === 'default' ? localStorage.getItem('pyrita_ai_active_conv_id') : null)
      return savedId || conversations[0]?.id || 'conv_initial'
    } catch {
      return conversations[0]?.id || 'conv_initial'
    }
  })

  // Reload conversations when switching vaults
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKeyConversations) || (vaultKey === 'default' ? localStorage.getItem('pyrita_ai_conversations_v2') : null)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed) && parsed.length > 0) {
          setConversations(parsed)
          const savedId = localStorage.getItem(storageKeyActiveConvId) || (vaultKey === 'default' ? localStorage.getItem('pyrita_ai_active_conv_id') : null)
          setActiveConversationId(savedId || parsed[0].id)
          return
        }
      }
    } catch {}

    const fresh: AgentConversation = {
      id: `conv_${Date.now()}`,
      title: 'Conversa Inicial',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      specialtyId: 'architect',
      ruleMode: 'analyst',
      messages: [
        {
          id: 'm1',
          sender: 'ai',
          text: `Olá! Sou o **Agente de IA do Pyrita**.\n\nEstou pronto para analisar sua nota ativa e pastas selecionadas com raciocínio profundo.`
        }
      ]
    }
    setConversations([fresh])
    setActiveConversationId(fresh.id)
  }, [storageKeyConversations, storageKeyActiveConvId, vaultKey])

  // Synchronize active conversation with messages state
  const activeConversation = useMemo(() => {
    return conversations.find(c => c.id === activeConversationId) || conversations[0]
  }, [conversations, activeConversationId])

  const [isBoardMenuOpen, setIsBoardMenuOpen] = useState(false)

  const handleSetLinkedBoardId = (boardId: string | undefined) => {
    setConversations(prev =>
      prev.map(c => (c.id === activeConversationId ? { ...c, linkedBoardId: boardId, updatedAt: Date.now() } : c))
    )
  }

  const effectiveBoardId = activeConversation?.linkedBoardId || activeBoardId || 'default'
  const currentLinkedBoard = useMemo(() => {
    return taskBoards.find(b => b.id === effectiveBoardId)
  }, [taskBoards, effectiveBoardId])

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
      localStorage.setItem(storageKeyConversations, JSON.stringify(conversations))
      localStorage.setItem(storageKeyActiveConvId, activeConversationId)
    } catch (err) {
      console.error('Failed to save conversations:', err)
    }
  }, [conversations, activeConversationId, storageKeyConversations, storageKeyActiveConvId])

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
              text: `Conversas anteriores excluídas. Iniciando novo chat.`
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

  const handleStartRename = (conv: AgentConversation, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingConvId(conv.id)
    setEditingTitle(conv.title)
  }

  const handleSaveRename = (convId: string, e?: React.FormEvent | React.MouseEvent) => {
    if (e) e.stopPropagation()
    if (editingTitle.trim()) {
      setConversations(prev => prev.map(c => c.id === convId ? { ...c, title: editingTitle.trim() } : c))
    }
    setEditingConvId(null)
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
      if (boardMenuRef.current && !boardMenuRef.current.contains(e.target as Node)) {
        setIsBoardMenuOpen(false)
      }
      if (folderPickerRef.current && !folderPickerRef.current.contains(e.target as Node) && !folderPopupRef.current?.contains(e.target as Node)) {
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
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value
    setInput(val)
    setCompletionIndex(0)

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
    const cleaned = input.replace(/@([a-zA-Z0-9\u00C0-\u017F\s_-]*)$/, '').trim()
    setInput(cleaned)
    setAtSearchOpen(false)
    inputRef.current?.focus()
  }

  // Select a `/` skill or preset to run
  const handleSelectSlashItem = (promptText: string) => {
    setInput(promptText + '\n\n')
    setSlashSearchOpen(false)
    inputRef.current?.focus()
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
          if (effectiveNote.type === 'mindmap' || isMindMapContent(effectiveNote.content)) {
            const mindMapDoc = parseMindMapDocument(effectiveNote.content, effectiveNote.title)
            const outline = mindMapToMarkdownOutline(mindMapDoc)
            contextBlock += `\n### NOTA ATIVA PRINCIPAL EM CONTEXTO (MAPA MENTAL INTERATIVO):
Título: "${effectiveNote.title}"
Pasta: ${effectiveNote.folder || 'Início'}
Tags: ${effectiveNote.tags?.join(', ') || 'mindmap'}
Tipo: Mapa Mental (Mind Map)
Estrutura Atual do Mapa em Formato Hierárquico:
---
${outline}
---
🚨 INSTRUÇÃO OBRIGATÓRIA PARA EDIÇÃO DESTE MAPA MENTAL:
- O usuário está com este mapa mental aberto na tela.
- Quando ele solicitar para adicionar tópicos, criar etapas, novos ramos, organizar ou expandir este mapa, você DEVE gerar a versão completa atualizada dentro do bloco:
  <<<REPLACE_NOTE>>>
  # ${cleanNodeTitle(effectiveNote.title)}
  ## 1ª Etapa (Ramo Principal)
    - 2ª Etapa (Subtópico)
      - 3ª Etapa (Detalhe/Ação)
  <<<END_REPLACE_NOTE>>>
- TABELA DE CORRESPONDÊNCIA DE ETAPAS:
  * NÓ INICIAL (Centro do Mapa)  -> 1 hashtag: # Tópico Central
  * 1ª ETAPA após o centro        -> 2 hashtags: ## Ramo Principal (OU traço sem recuo: - Ramo Principal)
  * 2ª ETAPA (Subtópicos)         -> 2 espaços de recuo:   - Subtópico (OU 3 hashtags: ### Subtópico)
  * 3ª ETAPA (Detalhes/Ações)     -> 4 espaços de recuo:     - Detalhe (OU 4 hashtags: #### Detalhe)
- REGRAS VITAIS DE SINTAXE:
  * NUNCA use 3 hashtags ('###') na 1ª etapa após o centro! O nó central já é '#'. A 1ª etapa após o centro é '##' (2 hashtags) ou '-'.
  * NUNCA misture traço com hashtag (ex: NUNCA faça '- ### Título' ou '* ### Título'). Se usar traço, escreva texto limpo: '- Título'.
  * NUNCA use asteriscos para definir etapas (ex: NUNCA faça '** Etapa' ou '*** Detalhe') e NUNCA use negrito ('**Título**').
  * Mantenha o '# Tópico Central' e a estrutura que o usuário já tinha, anexando as novas etapas nos ramos corretos.\n`
          } else if (effectiveNote.type === 'html' || effectiveNote.filePath?.endsWith('.html') || effectiveNote.filePath?.endsWith('.htm')) {
            contextBlock += `\n### ARQUIVO HTML ATIVO EM CONTEXTO (DOCUMENTO WEB INTERATIVO):
Título: "${effectiveNote.title}"
Arquivo: ${effectiveNote.filePath || `${effectiveNote.title}.html`}
Pasta: ${effectiveNote.folder || 'Início'}
Tags: ${effectiveNote.tags?.join(', ') || 'html, web'}
Tipo: Documento HTML5 (Renderizado em tempo real no app)
Código-Fonte Atual:
---
${effectiveNote.content || '<!-- Documento HTML vazio -->'}
---
🚨 INSTRUÇÃO OBRIGATÓRIA PARA EDIÇÃO DESTE CÓDIGO HTML:
- O usuário está com este arquivo HTML aberto na tela do Pyrita com visualização ao vivo e editor de código.
- Quando ele solicitar para adicionar elementos, alterar estilos CSS/Tailwind, modificar cores, adicionar seções, criar formulários, incluir scripts JavaScript, gráficos ou reformular o código, você DEVE gerar o código HTML completo atualizado dentro do bloco:
  <<<REPLACE_NOTE>>>
  <!DOCTYPE html>
  <html lang="pt-BR">
  ... (todo o código HTML completo com as modificações)
  </html>
  <<<END_REPLACE_NOTE>>>
- O Pyrita irá detectar o bloco <<<REPLACE_NOTE>>> e atualizar o código e a pré-visualização ao vivo do usuário instantaneamente!\n`
          } else {
            contextBlock += `\n### NOTA ATIVA PRINCIPAL EM CONTEXTO:\nTítulo: "${effectiveNote.title}"\nPasta: ${effectiveNote.folder || 'Início'}\nTags: ${effectiveNote.tags?.join(', ') || 'nenhuma'}\nConteúdo da nota:\n---\n${effectiveNote.content || '(nota vazia)'}\n---\n`
          }
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

        // Ingest active custom skills from localStorage
        let skillsDirectiveBlock = ''
        try {
          const savedCustomSkills = localStorage.getItem('pyrita_agent_custom_skills_v1')
          if (savedCustomSkills) {
            const parsedCustomSkills: any[] = JSON.parse(savedCustomSkills)
            const activeCustomSkills = parsedCustomSkills.filter(s => s.enabled)
            if (activeCustomSkills.length > 0) {
              const skillTexts: string[] = []
              for (const sk of activeCustomSkills) {
                const filesContent = (sk.files || [])
                  .slice(0, 5)
                  .map((f: any) => `[Arquivo: ${f.name || f.path}]\n${f.content ? f.content.slice(0, 2000) : ''}`)
                  .join('\n\n')
                skillTexts.push(`### HABILIDADE / SKILL ATIVA: "${sk.name}"\nDescrição: ${sk.description || ''}\n${filesContent}`)
              }
              skillsDirectiveBlock = `\n${skillTexts.join('\n\n')}\n`
            }
          }
        } catch {}

        const ruleDirective = agentRule === 'editor'
          ? `REGRA DE OPERAÇÃO: MODO CO-AUTOR (ESCRITA & CRIAÇÃO ATIVA).
- A nota ativa é o seu CANVA de trabalho direto!
- Você tem permissão para editar, reescrever, melhorar e atualizar a nota ativa diretamente quando o usuário solicitar.
- QUANDO O USUÁRIO SOLICITAR PARA SUBSTITUIR, EDITAR, REESCREVER OU MELHORAR A NOTA ATIVA (ex: "substitua a nota", "reescreva a nota", "melhore o texto da nota", "atualize o mapa mental", "adicione tópicos no mapa", "expanda o mapa", "aplique as alterações na nota"):
  Você DEVE fornecer a versão final completa delimitada EXATAMENTE pelo bloco:
  <<<REPLACE_NOTE>>>
  (todo o conteúdo revisado aqui)
  <<<END_REPLACE_NOTE>>>
  O Pyrita irá detectar esse bloco e atualizar a nota ou mapa mental do usuário automaticamente no editor!
- PARA NOTAS DO TIPO MAPA MENTAL (mindmap) - GUIA DE CRIAÇÃO E EDIÇÃO CORRETA:
  Dentro do bloco <<<REPLACE_NOTE>>>, forneça SEMPRE uma estrutura hierárquica em Markdown Outline rigorosamente formatada:
  1. TABELA DE CORRESPONDÊNCIA DE ETAPAS (SIGA ESTRITAMENTE):
     * NÓ INICIAL (Centro do Mapa)  -> 1 hashtag: # Tópico Central
     * 1ª ETAPA após o centro        -> 2 hashtags: ## Ramo Principal (OU traço sem recuo: - Ramo Principal)
     * 2ª ETAPA (Subtópicos)         -> 2 espaços de recuo:   - Subtópico (OU 3 hashtags: ### Subtópico)
     * 3ª ETAPA (Detalhes/Ações)     -> 4 espaços de recuo:     - Detalhe (OU 4 hashtags: #### Detalhe)
     * 4ª ETAPA (Sub-ações)          -> 6 espaços de recuo:       - Ação Detalhada
  2. REGRAS CRÍTICAS E PROIBIÇÕES VITAIS:
     * A 1ª ETAPA logo após o nó inicial DEVE SER '##' (2 hashtags) ou traço '-', NUNCA '###' (3 hashtags)! Usar 3 hashtags na 1ª etapa quebra a hierarquia da árvore.
     * NUNCA misture traço com hashtag (ex: PROIBIDO escrever '- ### Título' ou '* ### Título'). Se usar traço, escreva direto o texto: '- Título'.
     * NUNCA use asteriscos para definir etapas (ex: PROIBIDO '** Subtópico' ou '*** Detalhe'). Isso NÃO cria a etapa e faz os asteriscos ficarem colados no título do nó.
     * NUNCA use negrito com asteriscos nos títulos (ex: PROIBIDO '**Título**' ou '- **Etapa 1:**'). O editor gráfico já estiliza e formata os nós visualmente. Use sempre texto limpo: '- Etapa 1: Descrição'.
     * Use SEMPRE o hífen '-' como marcador de subtópicos, NUNCA o asterisco '*'.
  3. Checkboxes: use '- [ ] ' ou '- [x] ' para transformar qualquer nó em tarefa interativa.
  4. Exemplo correto de mapa mental:
     # Planejamento Estratégico
     ## Pesquisa de Mercado
       - Análise de Concorrentes
         - Mapeamento de Preços
         - Funcionalidades Principais
       - Entrevistas com Clientes
     ## Execução do Produto
       - [x] Especificação do MVP
       - [ ] Desenvolvimento Frontend
         - Tela de Login
         - Painel de Controle
       - [ ] Testes e Validação
         - Testes de Usabilidade
         - Homologação em Produção
- PARA ARQUIVOS DO TIPO HTML (html):
  Dentro do bloco <<<REPLACE_NOTE>>>, forneça o código HTML completo atualizado com <!DOCTYPE html>, tags semânticas, estilos <style> ou Tailwind CDN e scripts <script>. Não use explicações ou marcações markdown dentro do bloco <<<REPLACE_NOTE>>>, apenas o código HTML puro que será executado e renderizado no app.
- REGRA CRÍTICA PARA CRIAÇÃO DE NOVAS NOTAS, MAPAS MENTAIS OU ARQUIVOS HTML:
  Sempre que o usuário pedir para CRIAR, GERAR, SALVAR ou MONTAR uma nova nota, novo documento ou novo mapa mental (ex: "crie uma nota sobre...", "criar nova nota...", "crie um novo mapa sobre...", "gere uma nota...", "salve essa ideia em uma nota..."):
  Você DEVE OBRIGATORIAMENTE emitir o bloco executável delimitado no formato exato:
  <<<CREATE_NOTE>>>
  Título: Nome Exato da Nova Nota
  Pasta: Início
  Tipo: note (ou mindmap se for mapa mental)
  Conteúdo:
  (coloque todo o conteúdo formatado em markdown aqui)
  <<<END_CREATE_NOTE>>>
  NUNCA apenas diga no texto que vai criar sem emitir o bloco <<<CREATE_NOTE>>>, pois este bloco é o comando que cria o arquivo no cofre do usuário!
- Fora dos blocos delimitadores, explique resumidamente no chat o que foi gerado/aprimorado.`
          : `REGRA DE OPERAÇÃO: MODO ANALISTA (CONSULTORIA & LEITURA).
- Você atua exclusivamente como consultor, parceiro de pensamento e analista de conhecimento.
- Analise a nota e a pasta em profundidade, formule hipóteses, aponte conexões e proponha melhorias.
- Não altere a nota ativa atual diretamente sem permissão.
- CRIAÇÃO DE NOVAS NOTAS OU MAPAS MENTAIS: Quando o usuário solicitar expressamente a criação de uma NOVA nota ou mapa mental (ex: "crie uma nota sobre...", "crie um mapa sobre..."), você DEVE emitir o bloco executável <<<CREATE_NOTE>>> normalmente para criá-lo no cofre:
  <<<CREATE_NOTE>>>
  Título: Nome da Nova Nota
  Pasta: Início
  Tipo: note (ou mindmap)
  Conteúdo:
  (conteúdo em markdown completo aqui)
  <<<END_CREATE_NOTE>>>`

        const specialtyBlock = activeSpecialty.id !== 'none' && activeSpecialty.systemDirective
          ? `Especialidade cognitiva ativa: ${activeSpecialty.name} (${activeSpecialty.icon})\nDiretriz de Especialidade:\n${activeSpecialty.systemDirective}\n`
          : `Modo Geral Padrão: Atue conforme os parâmetros base do modelo LLM sem direcionamento de persona específica.\n`

        const artifactsDirective = `DIRETRIZ CRUCIAL SOBRE ARTEFATOS CONCÊNTRICOS (:::kpi, :::timeline, :::comparison, :::card):
- USE COM PARCIMÔNIA E MODERAÇÃO EXTREMA.
- NÃO gere artefatos em conversas rotineiras, explicações conceituais normais ou respostas simples.
- Gere um bloco de artefato APENAS quando a informação for altamente estruturada e tiver real potencial e valor para ser adicionada como um componente visual dentro da nota do usuário (ex: métricas de desempenho para um KPI, etapas cronológicas reais para uma timeline, ou comparação estruturada de decisões).
- Quando a resposta for conceitual, analítica ou textual, responda com formatação Markdown normal limpa, sem blocos :::.
- Quando utilizar artefatos e fizer referências a notas do cofre dentro deles, utilize sempre a sintaxe de link bidirecional [[Nome da Nota]].`

        const currentBoardObj = (taskBoards || []).find(b => b.id === effectiveBoardId)
        const boardName = currentBoardObj?.name || 'Geral'

        const relevantTasks = tasks && tasks.length > 0
          ? tasks.filter(t => (t.boardId || 'default') === effectiveBoardId)
          : []

        const boardContextText = `Aba de tarefas ativa/vinculada a este chat: "${boardName}" (ID: "${effectiveBoardId}").`
        const allBoardsText = taskBoards && taskBoards.length > 0
          ? `Abas de tarefas cadastradas no cofre: ${taskBoards.map(b => `"${b.name}" (id: ${b.id})`).join(', ')}.`
          : ''

        const tasksSummary = relevantTasks.length > 0
          ? `Tarefas na aba "${boardName}" (${relevantTasks.length} tarefas):\n${relevantTasks.slice(0, 30).map(t => `- [${t.completed ? 'x' : ' '}] ${t.title} (Status: ${t.statusId}, Prioridade: ${t.priority}${t.deadline ? `, Prazo: ${t.deadline}` : ''}${t.subtasks && t.subtasks.length > 0 ? `, ${t.subtasks.filter(st => st.completed).length}/${t.subtasks.length} subtarefas` : ''})`).join('\n')}`
          : `Nenhuma tarefa cadastrada na aba "${boardName}" no momento.`

        const statusesList = taskSettings?.statuses?.length
          ? `Status disponíveis: ${taskSettings.statuses.map(s => s.name).join(', ')}.`
          : ''

        const tasksDirective = `DIRETRIZ DE GESTÃO DE PROJETOS E TAREFAS:
- Você é capaz de atuar como gestor de projetos do usuário: planejar entregas, analisar gargalos e decompor objetivos em tarefas acionáveis e subtarefas.
- ${boardContextText}
${allBoardsText ? `- ${allBoardsText}\n` : ''}${statusesList ? `- ${statusesList}\n` : ''}- Quando sugerir criar tarefas, forneça blocos executáveis formatados com a sintaxe especial:
\`\`\`task-action
{
  "action": "create",
  "title": "Título conciso da tarefa",
  "priority": "high",
  "deadline": "2026-10-25",
  "tags": ["projeto", "foco"],
  "subtasks": ["Passo 1", "Passo 2", "Passo 3"],
  "description": "Breve detalhamento...",
  "boardId": "${effectiveBoardId}"
}
\`\`\`
O Pyrita renderiza esses blocos automaticamente como cards com botão de 1 clique para criação direta no cofre.`

        const mindMapDirective = `DIRETRIZ DE OURO PARA MAPAS MENTAIS (MINDMAP):
- O Pyrita possui um motor gráfico próprio de mapas mentais interativos.
- A estrutura de um mapa mental é SEMPRE em Markdown Outline:
  # Tópico Central (Nó Inicial - 1 hashtag)
  ## 1ª Etapa (Ramos Principais - 2 hashtags OU traço '-' sem recuo)
    - 2ª Etapa (Subtópicos - 2 espaços de recuo com traço '-' OU 3 hashtags '###')
      - 3ª Etapa (Detalhes/Ações - 4 espaços de recuo com traço '-' OU 4 hashtags '####')
- REGRAS CRÍTICAS DE SINTAXE:
  * A 1ª ETAPA após o nó inicial DEVE SER '##' (2 hashtags) ou traço '-', NUNCA '###' (3 hashtags)!
  * NUNCA misture traço com hashtag (ex: NUNCA escreva '- ### Título').
  * NUNCA use asteriscos ('**', '***') para indicar etapas ou níveis de profundidade, e NUNCA envolva títulos em negrito ('**Título**'). Use apenas texto limpo precedido de traço '-' e indentação correta. O motor gráfico cuida de todo o design e peso visual dos nós.`

        const systemPrompt = `Você é o Agente de IA do Pyrita, assistente de alto nível para gestão de conhecimento e pensamento (estilo Obsidian) com foco em produtividade e pensamento em rede.

${specialtyBlock}
${ruleDirective}
${mindMapDirective}
${artifactsDirective}
${tasksDirective}
${skillsDirectiveBlock}
Contexto de Tarefas no Cofre:
${tasksSummary}

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
              const isHtml = effectiveNote.type === 'html' || effectiveNote.filePath?.endsWith('.html') || effectiveNote.filePath?.endsWith('.htm') || /<!DOCTYPE\s+html|<html/i.test(revisedContent)
              const isMind = !isHtml && (effectiveNote.type === 'mindmap' || isMindMapContent(effectiveNote.content) || isMindMapContent(revisedContent))
              const baseDoc = (!isHtml && (effectiveNote.type === 'mindmap' || isMindMapContent(effectiveNote.content)))
                ? parseMindMapDocument(effectiveNote.content, effectiveNote.title)
                : undefined
              const finalContent = isMind
                ? serializeMindMapDocument(parseMindMapDocument(revisedContent, effectiveNote.title, baseDoc))
                : revisedContent

              onUpdateNote({
                ...effectiveNote,
                content: finalContent,
                type: isHtml ? 'html' : isMind ? 'mindmap' : effectiveNote.type,
                updatedAt: Date.now()
              })
              const label = isHtml ? 'Arquivo HTML' : isMind ? 'Mapa Mental' : 'Nota'
              setToastNotice(`✨ ${label} "${effectiveNote.title}" atualizado pelo Agente!`)
              setTimeout(() => setToastNotice(null), 4000)

              responseText = responseText.replace(
                /<<<REPLACE_NOTE>>>[\s\S]*?<<<END_REPLACE_NOTE>>>/,
                `> ✨ **${label} [[${effectiveNote.title}]] atualizado com sucesso no seu cofre!**\n`
              ).trim()
            }
          }

          // Check for Note / MindMap Creation <<<CREATE_NOTE>>>
          if (onCreateNote) {
            const createRegex = /<<<(?:CREATE_NOTE|create_note)>>>([\s\S]*?)(?:<<<(?:END_CREATE_NOTE|end_create_note)>>>|$)/i
            const codeBlockRegex = /```(?:create-note|create_note|note-action)\s*([\s\S]*?)\s*```/i

            let blockText: string | null = null
            let matchedRaw: string | null = null

            const match1 = responseText.match(createRegex)
            if (match1 && match1[1] && match1[1].trim()) {
              blockText = match1[1].trim()
              matchedRaw = match1[0]
            } else {
              const match2 = responseText.match(codeBlockRegex)
              if (match2 && match2[1] && match2[1].trim()) {
                blockText = match2[1].trim()
                matchedRaw = match2[0]
              }
            }

            // Fallback Intent Detection: user explicitly asked to create a note and AI responded with note content without delimiters
            if (!blockText) {
              const userPromptLower = userContent.toLowerCase()
              const userWantsNewNote = /\b(?:crie|criar|gere|gerar|salve|salvar|monte|montar)\s+(?:uma\s+)?(?:nova\s+)?(?:nota|mapa|documento)\b/i.test(userPromptLower)

              if (userWantsNewNote) {
                const headingMatch = responseText.match(/(?:^|\n)#\s+([^\n]+)/)
                const titleFieldMatch = responseText.match(/(?:^|\n)T[íi]tulo:\s*([^\n]+)/i)
                const noteTitle = (headingMatch ? headingMatch[1] : titleFieldMatch ? titleFieldMatch[1] : '').replace(/[\[\]]/g, '').trim()

                if (noteTitle && responseText.length > 40) {
                  const isMind = /\bmapa\b/i.test(userPromptLower) || isMindMapContent(responseText)
                  const cleanContent = responseText
                    .replace(/^(?:Claro[!,.]?|Com certeza[!,.]?|Vou criar[^\n]*|Aqui est[áa][^\n]*)\s*\n+/i, '')
                    .trim()

                  blockText = `Título: ${noteTitle}\nPasta: Início\nTipo: ${isMind ? 'mindmap' : 'note'}\nConteúdo:\n${cleanContent}`
                }
              }
            }

            if (blockText) {
              let title = 'Novo Conteúdo'
              let folder = 'Início'
              let type = 'note'
              let content = blockText

              const titleM = blockText.match(/Título:\s*(.+)/i)
              if (titleM) title = titleM[1].trim()

              const folderM = blockText.match(/Pasta:\s*(.+)/i)
              if (folderM) folder = folderM[1].trim()

              const typeM = blockText.match(/Tipo:\s*(.+)/i)
              if (typeM) type = typeM[1].trim().toLowerCase()

              const contentM = blockText.match(/Conteúdo:\s*([\s\S]*)/i)
              if (contentM) content = contentM[1].trim()

              title = title.replace(/[\[\]]/g, '').trim() || 'Nova Nota'

              const isHtml = type === 'html' || title.toLowerCase().endsWith('.html') || title.toLowerCase().endsWith('.htm') || /<!DOCTYPE\s+html|<html/i.test(content)
              const isMind = !isHtml && (type === 'mindmap' || isMindMapContent(content))
              const finalContent = isMind
                ? serializeMindMapDocument(parseMindMapDocument(content, title))
                : content

              onCreateNote(folder, title, finalContent, isHtml ? 'html' : isMind ? 'mindmap' : 'note')
              const label = isHtml ? 'Arquivo HTML' : isMind ? 'Mapa Mental' : 'Nota'
              setToastNotice(`✨ ${label} "${title}" criada com sucesso!`)
              setTimeout(() => setToastNotice(null), 4000)

              if (matchedRaw) {
                responseText = responseText.replace(
                  matchedRaw,
                  `> ✨ **${label} [[${title}]] criada com sucesso no seu cofre!**\n`
                ).trim()
              } else {
                responseText = `> ✨ **${label} [[${title}]] criada com sucesso no seu cofre!**\n\n` + responseText
              }
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

    // Fallback: If no API key configured
    setTimeout(() => {
      setMessages(prev => [
        ...prev,
        {
          id: `ai_${Date.now()}`,
          sender: 'ai',
          text: `Chave de API do **${activeProvider.toUpperCase()}** não está configurada.\n\nConfigure sua chave no ícone de configurações para conversar com a IA e ter respostas inteligentes em tempo real sobre sua nota e pastas selecionadas!`,
          isActionable: true
        }
      ])
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

    // Include custom skills
    try {
      const savedCustomSkills = localStorage.getItem('pyrita_agent_custom_skills_v1')
      if (savedCustomSkills) {
        const parsed: any[] = JSON.parse(savedCustomSkills)
        for (const sk of parsed) {
          if (sk.name.toLowerCase().includes(q) || (sk.description && sk.description.toLowerCase().includes(q))) {
            list.push({
              label: `📁 ${sk.name}`,
              prompt: `Aplicar habilidade "${sk.name}": analise o contexto conforme esta especialidade e seus arquivos.`,
              category: 'Custom Skill'
            })
          }
        }
      }
    } catch {}

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
      className="app-ai-assistant-panel my-2 mx-1.5 bg-[#0e0e12] border border-zinc-800/80 rounded-2xl flex flex-col select-none shrink-0 text-xs z-10 relative overflow-hidden shadow-2xl shadow-black/50"
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
        <div className="flex items-center gap-1.5 min-w-0">
          {/* Agent Rule Selector: Modo Analista (Leitura) vs Modo Co-Autor (Edita Notas) */}
          <div ref={ruleMenuRef} className="relative">
            <button
              type="button"
              onClick={() => setIsRuleMenuOpen(o => !o)}
              className={`flex items-center justify-center w-7 h-7 rounded-lg border text-xs transition-all cursor-pointer shadow-sm ${
                agentRule === 'editor'
                  ? 'bg-[var(--accent)]/15 border-[var(--accent)]/40 text-[var(--accent)]'
                  : 'bg-zinc-900 border-zinc-700/70 text-zinc-200 hover:border-zinc-500'
              }`}
              title={`Permissão do Agente: ${agentRule === 'editor' ? 'Modo Co-Autor (Edita Notas)' : 'Modo Analista (Leitura)'} (clique para alternar)`}
            >
              <span className="text-sm leading-none">{agentRule === 'editor' ? '✍️' : '👁️'}</span>
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

          {/* Linked Task Board Selector */}
          {taskBoards && taskBoards.length > 0 && (
            <div ref={boardMenuRef} className="relative">
              <button
                type="button"
                onClick={() => setIsBoardMenuOpen(o => !o)}
                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-zinc-900 border border-zinc-700/70 hover:border-zinc-500 text-zinc-300 text-xs transition-all cursor-pointer shadow-sm"
                title="Vincular aba de tarefas a este chat"
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                <span className="max-w-[85px] truncate text-[11px] font-medium">
                  {currentLinkedBoard?.name || 'Aba Atual'}
                </span>
                <ChevronDown className="w-3 h-3 text-zinc-500 shrink-0" />
              </button>
              {isBoardMenuOpen && (
                <div className="absolute top-9 left-0 z-50 w-52 bg-[#101117] border border-zinc-700/80 rounded-xl p-1.5 shadow-2xl space-y-0.5 animate-in fade-in zoom-in-95 duration-100">
                  <div className="px-2 py-1 text-[10px] font-mono text-zinc-400 border-b border-zinc-800">
                    VINCULAR ABA DE TAREFAS
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      handleSetLinkedBoardId(undefined)
                      setIsBoardMenuOpen(false)
                    }}
                    className={`w-full text-left px-2 py-1.5 rounded-lg flex items-center justify-between text-xs transition-colors cursor-pointer ${
                      !activeConversation?.linkedBoardId ? 'bg-zinc-800 text-white font-medium' : 'text-zinc-300 hover:bg-zinc-850'
                    }`}
                  >
                    <span className="truncate">Automático (Aba Ativa)</span>
                    {!activeConversation?.linkedBoardId && <Check className="w-3.5 h-3.5 text-[var(--accent)]" />}
                  </button>
                  {taskBoards.map(b => {
                    const isCur = activeConversation?.linkedBoardId === b.id
                    return (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => {
                          handleSetLinkedBoardId(b.id)
                          setIsBoardMenuOpen(false)
                        }}
                        className={`w-full text-left px-2 py-1.5 rounded-lg flex items-center justify-between text-xs transition-colors cursor-pointer ${
                          isCur ? 'bg-zinc-800 text-white font-medium' : 'text-zinc-300 hover:bg-zinc-850'
                        }`}
                      >
                        <span className="truncate">{b.name}</span>
                        {isCur && <Check className="w-3.5 h-3.5 text-[var(--accent)]" />}
                      </button>
                    )
                  })}
                </div>
              )}
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

      {/* 2. CONVERSATIONS DRAWER OVERLAY (ChatGPT / Gemini Style with Edit Title) */}
      {showConversationsSidebar && (
        <div className="chat-conversations-drawer absolute inset-0 top-10 z-40 bg-[#0e0f14]/95 backdrop-blur-md flex flex-col p-3 border-r border-zinc-800/90 animate-in fade-in slide-in-from-left duration-200">
          <div className="flex items-center justify-between pb-2 border-b border-zinc-800/70 mb-2">
            <div className="flex items-center gap-1.5">
              <MessageSquare className="w-4 h-4 text-[var(--accent)]" />
              <span className="font-semibold text-zinc-200 text-xs">Conversas Salvas</span>
            </div>
            <button
              type="button"
              onClick={handleStartNewConversation}
              className="px-2.5 py-1 font-bold rounded-lg text-[10px] flex items-center gap-1 cursor-pointer shadow-xs transition-all hover:bg-[var(--accent-glow)]"
              style={{
                backgroundColor: 'var(--accent-glow-subtle, rgba(197, 155, 39, 0.12))',
                color: 'var(--accent, #d4af37)'
              }}
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
                const isEditing = editingConvId === conv.id

                if (isEditing) {
                  return (
                    <div
                      key={conv.id}
                      onClick={e => e.stopPropagation()}
                      className="p-1.5 rounded-xl bg-zinc-900 border border-[var(--accent)]/50 flex items-center gap-1"
                    >
                      <input
                        autoFocus
                        type="text"
                        value={editingTitle}
                        onChange={e => setEditingTitle(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleSaveRename(conv.id)
                          if (e.key === 'Escape') setEditingConvId(null)
                        }}
                        className="flex-1 bg-transparent text-xs text-zinc-100 outline-none px-1"
                      />
                      <button
                        type="button"
                        onClick={(e) => handleSaveRename(conv.id, e)}
                        className="p-1 text-emerald-400 hover:text-emerald-300 rounded cursor-pointer"
                        title="Salvar nome"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          setEditingConvId(null)
                        }}
                        className="p-1 text-zinc-400 hover:text-zinc-200 rounded cursor-pointer"
                        title="Cancelar"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )
                }

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
                    onDoubleClick={(e) => handleStartRename(conv, e)}
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

                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity ml-1 shrink-0">
                      <button
                        type="button"
                        onClick={(e) => handleStartRename(conv, e)}
                        className="p-1 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded transition-all cursor-pointer"
                        title="Editar nome da conversa"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => handleDeleteConversation(conv.id, e)}
                        className="p-1 text-zinc-400 hover:text-rose-400 hover:bg-zinc-800 rounded transition-all cursor-pointer"
                        title="Excluir conversa"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
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
                <div className="chat-user-bubble p-2.5 rounded-2xl bg-zinc-800/90 text-zinc-100 rounded-br-xs max-w-[90%] shadow-sm">
                  {m.text}
                </div>
              ) : (
                (() => {
                  const { displayText, actions: taskActions } = parseMessageTaskActions(m.text)

                  return (
                    <div className="w-full text-zinc-200 px-1 py-1 space-y-2">
                      {m.text === 'Pensando...' ? (
                        <div className="flex items-center gap-2 py-1 text-zinc-400 font-mono text-[11px]">
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--accent)] shrink-0" />
                          <span>Preparando uma resposta para você…</span>
                        </div>
                      ) : (
                        <MarkdownRenderer
                          content={displayText}
                          onNavigate={onConnectNote}
                          onButtonClick={(promptText) => executePrompt(promptText)}
                          onInsertSnippet={agentRule === 'editor' ? onInsertSnippet : undefined}
                        />
                      )}

                      {/* Executable Task Actions Cards */}
                      {taskActions.length > 0 && (
                        <div className="mt-3 space-y-2 pt-2 border-t border-zinc-800/60">
                          <div className="flex items-center justify-between text-[11px] font-semibold text-emerald-400">
                            <span className="flex items-center gap-1.5">
                              <CheckSquare className="w-3.5 h-3.5 text-emerald-400" />
                              <span>Plano de Tarefas Proposto pelo Agente</span>
                            </span>
                            {taskActions.length > 1 && onCreateTask && (
                              <button
                                type="button"
                                onClick={() => {
                                  taskActions.forEach((act, idx) => {
                                    const key = `${m.id}_${idx}`
                                    if (!executedTaskActions[key]) {
                                      handleExecuteTaskAction(act, key)
                                    }
                                  })
                                }}
                                className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 font-medium transition-colors cursor-pointer"
                              >
                                Criar todas ({taskActions.length})
                              </button>
                            )}
                          </div>

                          <div className="space-y-1.5">
                            {taskActions.map((act, idx) => {
                              const taskKey = `${m.id}_${idx}`
                              const isDone = !!executedTaskActions[taskKey]

                              return (
                                <div
                                  key={taskKey}
                                  className="p-3 rounded-xl bg-[#13141a] border border-zinc-800/80 hover:border-zinc-700/80 transition-all space-y-2 shadow-xs"
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="flex items-start gap-2 min-w-0">
                                      <CheckSquare className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                                      <div className="min-w-0">
                                        <div className="font-semibold text-zinc-100 text-xs leading-snug">{act.title}</div>
                                        {act.description && (
                                          <div className="text-[11px] text-zinc-400 mt-0.5 leading-relaxed">{act.description}</div>
                                        )}
                                      </div>
                                    </div>

                                    {onCreateTask && (
                                      <button
                                        type="button"
                                        disabled={isDone}
                                        onClick={() => handleExecuteTaskAction(act, taskKey)}
                                        className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold shrink-0 transition-colors flex items-center gap-1 cursor-pointer ${
                                          isDone
                                            ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 cursor-default'
                                            : 'bg-emerald-500 hover:bg-emerald-400 text-zinc-950 shadow-sm'
                                        }`}
                                      >
                                        {isDone ? (
                                          <>
                                            <Check className="w-3 h-3" />
                                            <span>Criada!</span>
                                          </>
                                        ) : (
                                          <>
                                            <Plus className="w-3 h-3 stroke-[2.5]" />
                                            <span>Criar Tarefa</span>
                                          </>
                                        )}
                                      </button>
                                    )}
                                  </div>

                                  {/* Badges */}
                                  <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                                    {act.priority && act.priority !== 'none' && (
                                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9.5px] font-medium bg-zinc-800/80 text-zinc-300">
                                        <Flag className="w-2.5 h-2.5 text-zinc-400" />
                                        <span>Prioridade: {act.priority}</span>
                                      </span>
                                    )}
                                    {act.deadline && (
                                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9.5px] font-mono bg-zinc-800/80 text-zinc-300">
                                        <Calendar className="w-2.5 h-2.5 text-zinc-400" />
                                        <span>Prazo: {act.deadline}</span>
                                      </span>
                                    )}
                                    {act.subtasks && act.subtasks.length > 0 && (
                                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9.5px] bg-zinc-800/80 text-zinc-300">
                                        <ListTodo className="w-2.5 h-2.5 text-zinc-400" />
                                        <span>{act.subtasks.length} subtarefas</span>
                                      </span>
                                    )}
                                    {act.tags && act.tags.map(t => (
                                      <span key={t} className="px-1.5 py-0.5 rounded bg-zinc-850 text-[9px] text-zinc-400 font-mono">
                                        #{t}
                                      </span>
                                    ))}
                                  </div>

                                  {/* Subtasks Preview List */}
                                  {act.subtasks && act.subtasks.length > 0 && (
                                    <div className="pt-1.5 border-t border-zinc-800/60 space-y-1">
                                      {act.subtasks.map((st, i) => (
                                        <div key={i} className="flex items-center gap-1.5 text-[10.5px] text-zinc-400 pl-1">
                                          <span className="w-1.5 h-1.5 rounded-full bg-zinc-600 shrink-0" />
                                          <span>{st}</span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                          </div>

                          {onOpenTasks && (
                            <div className="pt-1 flex justify-end">
                              <button
                                type="button"
                                onClick={onOpenTasks}
                                className="text-[10px] text-emerald-400 hover:text-emerald-300 hover:underline flex items-center gap-1 cursor-pointer"
                              >
                                <span>Abrir quadro de tarefas</span>
                                <span>→</span>
                              </button>
                            </div>
                          )}
                        </div>
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

                      {/* Message Bottom Action Bar: Minimalist style */}
                      {!m.isActionable && m.text !== 'Pensando...' && (
                        <div className="pt-2 border-t border-zinc-800/40 flex items-center justify-between gap-1.5">
                          <div>
                            {agentRule === 'editor' && onInsertSnippet && (
                              <button
                                type="button"
                                onClick={() => {
                                  onInsertSnippet(displayText)
                                  setInsertedNotice(m.id)
                                  setTimeout(() => setInsertedNotice(null), 3000)
                                }}
                                className="px-2 py-0.5 rounded text-[10px] text-zinc-400 hover:text-zinc-200 border border-zinc-800/80 hover:border-zinc-700 bg-zinc-900/40 transition-colors cursor-pointer flex items-center gap-1 shadow-xs"
                                title="Inserir todo o texto e artefatos desta resposta na nota ativa"
                              >
                                <PenLine className="w-2.5 h-2.5" />
                                <span>{insertedNotice === m.id ? '✓ Inserido!' : 'Inserir resposta na nota'}</span>
                              </button>
                            )}
                            {agentRule === 'analyst' && (
                              <span className="text-[10px] text-zinc-500 italic flex items-center gap-1">
                                <Eye className="w-3 h-3 text-sky-400/70" />
                                Modo Analista (Consultivo)
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5">
                            {onCreateNote && (
                              <button
                                type="button"
                                onClick={() => {
                                  const headingMatch = displayText.match(/(?:^|\n)#\s+([^\n]+)/)
                                  const extractedTitle = (headingMatch ? headingMatch[1] : 'Nova Nota da IA').replace(/[\[\]]/g, '').trim()
                                  const isMind = isMindMapContent(displayText)
                                  const finalContent = isMind
                                    ? serializeMindMapDocument(parseMindMapDocument(displayText, extractedTitle))
                                    : displayText
                                  onCreateNote('Início', extractedTitle, finalContent)
                                  setToastNotice(`✨ ${isMind ? 'Mapa Mental' : 'Nota'} "${extractedTitle}" criada no cofre!`)
                                  setTimeout(() => setToastNotice(null), 4000)
                                }}
                                className="px-2 py-0.5 rounded text-[10px] text-zinc-400 hover:text-[var(--accent)] border border-zinc-800/80 hover:border-[var(--accent)]/50 bg-zinc-900/40 transition-colors cursor-pointer flex items-center gap-1 shadow-xs"
                                title="Criar nova nota no cofre com esta resposta"
                              >
                                <FilePlus className="w-2.5 h-2.5" />
                                <span>Criar como Nota</span>
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard.writeText(displayText)
                                setCopiedNotice(m.id)
                                setTimeout(() => setCopiedNotice(null), 2000)
                              }}
                              className="px-2 py-0.5 rounded text-[10px] text-zinc-400 hover:text-zinc-200 border border-zinc-800/80 hover:border-zinc-700 bg-zinc-900/40 transition-colors cursor-pointer flex items-center gap-1 shadow-xs"
                              title="Copiar texto em Markdown"
                            >
                              {copiedNotice === m.id ? <Check className="w-2.5 h-2.5 text-emerald-400" /> : <Copy className="w-2.5 h-2.5" />}
                              <span>{copiedNotice === m.id ? 'Copiado!' : 'Copiar'}</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })()
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
          <div role="listbox" aria-label="Comandos do agente" className="absolute bottom-full left-2.5 right-2.5 mb-2 bg-[#12131a] border border-zinc-700/80 rounded-xl p-1.5 shadow-2xl z-50 space-y-0.5 max-h-56 overflow-y-auto custom-chat-scrollbar animate-in fade-in zoom-in-95 duration-100">
            <div className="px-2 py-1 text-[10px] font-mono text-zinc-400 border-b border-zinc-800 flex items-center justify-between">
              <span>SKILLS & PRESETS DISPONÍVEIS (/)</span>
              <span className="text-[9px] text-zinc-500">{filteredSlashItems.length} opções</span>
            </div>
            {filteredSlashItems.map((item, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSelectSlashItem(item.prompt)}
                role="option"
                aria-selected={idx === Math.min(completionIndex, filteredSlashItems.length - 1)}
                onMouseEnter={() => setCompletionIndex(idx)}
                className={`w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-zinc-800/80 text-zinc-200 flex items-center justify-between text-xs cursor-pointer transition-colors ${idx === Math.min(completionIndex, filteredSlashItems.length - 1) ? 'bg-white/[0.06]' : ''}`}
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

        {/* Dynamic HTML / Specialty Prompt Chips */}
        {(effectiveNote.type === 'html' || effectiveNote.filePath?.endsWith('.html') || effectiveNote.filePath?.endsWith('.htm')) ? (
          <div className="flex items-center gap-1 overflow-x-auto pb-0.5 scrollbar-none text-[10px]">
            <button
              type="button"
              onClick={() => handleSelectSlashItem('Melhore e modernize o design deste arquivo HTML utilizando Tailwind CSS via CDN, paleta elegante no tema escuro, tipografia refinada e espaçamentos perfeitos.')}
              className="px-2 py-0.5 rounded-full bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 border border-orange-500/30 whitespace-nowrap cursor-pointer transition-colors"
            >
              🎨 Estilizar Tailwind
            </button>
            <button
              type="button"
              onClick={() => handleSelectSlashItem('Torne este código HTML 100% responsivo para mobile, tablet e desktop, com classes Tailwind e layouts flexíveis.')}
              className="px-2 py-0.5 rounded-full bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 border border-orange-500/30 whitespace-nowrap cursor-pointer transition-colors"
            >
              📱 Tornar Responsivo
            </button>
            <button
              type="button"
              onClick={() => handleSelectSlashItem('Adicione uma seção com gráfico interativo ou dashboard de dados usando a biblioteca Chart.js via CDN neste arquivo HTML.')}
              className="px-2 py-0.5 rounded-full bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 border border-orange-500/30 whitespace-nowrap cursor-pointer transition-colors"
            >
              📊 Gráfico Chart.js
            </button>
            <button
              type="button"
              onClick={() => handleSelectSlashItem('Adicione interatividade dinâmica com JavaScript moderno nesta página HTML (animações, eventos de clique, feedback visual).')}
              className="px-2 py-0.5 rounded-full bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 border border-orange-500/30 whitespace-nowrap cursor-pointer transition-colors"
            >
              ⚡ Interatividade JS
            </button>
          </div>
        ) : activeSpecialty.presets.length > 0 && (
          <div className="flex items-center gap-1 overflow-x-auto pb-0.5 scrollbar-none text-[10px]">
            {activeSpecialty.presets.map((pr, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSelectSlashItem(pr.prompt)}
                className="px-2 py-0.5 rounded-full bg-zinc-800/80 hover:bg-zinc-750 text-zinc-300 border border-zinc-700/60 whitespace-nowrap cursor-pointer transition-colors hover:text-[var(--accent)] hover:border-[var(--accent)]/40"
                title={pr.prompt}
              >
                {pr.label}
              </button>
            ))}
          </div>
        )}

        {/* Input Box Card */}
        <div className="bg-[#141418] border border-zinc-800 focus-within:border-zinc-600 rounded-2xl p-2 transition-all shadow-inner flex flex-col gap-2">
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
            <textarea
              ref={inputRef}
              rows={2}
              aria-label="Mensagem para o agente"
              value={input}
              onChange={handleInputChange}
              placeholder={`Pergunte ao ${activeSpecialty.shortName} (digite '/' para skills ou '@' para somar notas)...`}
              className="agent-message-input w-full bg-transparent px-1 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none"
              onKeyDown={event => {
                if (event.nativeEvent.isComposing) return
                const options = slashSearchOpen ? filteredSlashItems : atSearchOpen ? filteredAtNotes : []
                if ((slashSearchOpen || atSearchOpen) && ['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes(event.key)) {
                  if (event.key === 'Escape') { event.preventDefault(); setSlashSearchOpen(false); setAtSearchOpen(false); return }
                  if (event.key === 'Enter' || (options.length && ['ArrowDown', 'ArrowUp', 'Tab'].includes(event.key))) {
                    event.preventDefault()
                    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') setCompletionIndex(index => (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length)
                    else if (options.length) {
                      const index = Math.min(completionIndex, options.length - 1)
                      if (slashSearchOpen) handleSelectSlashItem(filteredSlashItems[index].prompt)
                      else handleSelectAtNote(filteredAtNotes[index])
                    }
                    return
                  }
                }
                if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); handleSendMessage(event) }
              }}
            />
          )}

          {/* Context Control Bar: Note Context + Extra Notes (@) + Folder Context (Hierarchical) */}
          <div className="flex items-center justify-between pt-1 border-t border-zinc-800/40 gap-1.5 flex-wrap">
            <div className="flex items-center gap-1.5 flex-wrap">
              {/* Primary Active Note Context Pill */}
              <div
                className={`ai-context-pill flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border transition-all ${
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
                  className="ai-extra-note-pill flex items-center gap-1 text-[10px] bg-purple-500/15 border border-purple-500/30 text-purple-200 px-2 py-0.5 rounded-full max-w-[140px] truncate shadow-sm"
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
                  <div className="ai-folder-active-pill flex items-center gap-1 text-[10px] bg-amber-500/10 border border-amber-500/30 text-amber-200 px-2 py-0.5 rounded-full max-w-[170px] truncate shadow-sm">
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
                    className="ai-folder-context-btn flex items-center gap-1 text-[10px] text-zinc-400 hover:text-zinc-200 bg-zinc-900/70 hover:bg-zinc-800/90 border border-dashed border-zinc-700/80 hover:border-zinc-500 px-2 py-0.5 rounded-full transition-all cursor-pointer"
                    title="Adicionar uma pasta inteira do cofre com hierarquia como contexto para a IA"
                  >
                    <FolderPlus className="w-3 h-3 text-zinc-400" />
                    <span>+ Pasta</span>
                  </button>
                )}

                {/* Hierarchical Folder Selection Popover with Subfolder Tree */}
                {isFolderPickerOpen && (
                  <FolderTreePicker
                      anchorRef={folderPickerRef}
                      popupRef={folderPopupRef}
                      folders={folderList}
                      selectedFolder={selectedFolderContext}
                      currentNoteFolder={effectiveNote.folder}
                      onSelectFolder={(f) => {
                        inputRef.current?.focus()
                        setSelectedFolderContext(f)
                        setIsFolderPickerOpen(false)
                      }}
                      onClose={() => setIsFolderPickerOpen(false)}
                    />
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

      {/* Vertical Resizable Drag Handle - Completely invisible when idle */}
      <div
        onMouseDown={handleMouseDown}
        onDoubleClick={() => {
          setPanelWidth(380)
          try {
            localStorage.setItem('pyrita_ai_width', '380')
          } catch {}
        }}
        className={`absolute top-0 right-0 w-2 h-full cursor-col-resize select-none z-30 transition-colors ${
          isDragging ? 'bg-[var(--accent)]/80' : 'hover:bg-[var(--accent)]/30'
        }`}
        title="Arraste para redimensionar a largura do chat (duplo clique para restaurar)"
      >
        {isDragging && <div className="w-[1px] h-full bg-[var(--accent)] mx-auto" />}
      </div>
    </div>
  )
}
