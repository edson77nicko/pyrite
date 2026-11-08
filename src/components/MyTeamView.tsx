import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import type {
  AgentActionPermission,
  AgentArtifact,
  AgentProfileVersion,
  AgentRun,
  ContextBinding,
  ContextRole,
  MultiAgentStoreState,
  ProjectContext,
  ProposalStatus,
  TeamDefinition,
  WorkflowDefinition
} from '../types/agents'
import type { Note, NoteType, TaskItem } from '../types'
import type { TaskBoard } from '../types/tasks'
import {
  ROLE_LABELS,
  computeHashSync,
  executeAgentRun,
  executeWorkflowRun,
  type WorkflowCommitNoteFn,
  type WorkflowCommitTasksFn,
  registerWorkflowCommitTasks,
  resumeWorkflowRun,
  formatCentsBRL,
  generateAgentDraftFromPrompt,
  updateAgentProfileWithVersion,
  DEMO_PROJECTS,
  INITIAL_TEAMS,
  INITIAL_WORKFLOWS
} from '../utils/multiAgentEngine'
import { MarkdownRenderer } from './MarkdownRenderer'
import { SquadManagementView } from './SquadManagementView'
import { renderDynamicIcon } from './IconPickerPopover'
import { WorkflowCanvasEditor } from './WorkflowCanvasEditor'
import { ErrorBoundary } from './ErrorBoundary'
import { AiSettingsModal, type CustomAgentSkill } from './AiSettingsModal'
import { AgentIcon, AgentIconPicker } from './AgentIcon'
import {
  resolveAgentIconVariant,
  type AgentIconState,
  type AgentIconVariant
} from './agentIconRegistry'
import {
  Bot,
  Workflow,
  GitBranch,
  Activity,
  Plus,
  Settings,
  AlertTriangle,
  Sparkles,
  FileText,
  Trash2,
  X,
  Briefcase,
  RefreshCw,
  StopCircle,
  Search,
  PanelLeft,
  PanelRight,
  ArrowUp,
  ChevronRight,
  ChevronDown,
  Check,
  Copy,
  CornerUpLeft,
  Smile,
  Mic,
  Pencil,
  Globe,
  Cpu,
  Brain,
  Wrench,
  Folder,
  FolderOpen,
  Tag,
  Users,
  Maximize2,
  ExternalLink,
  ShieldCheck
} from 'lucide-react'
import { CustomSelect } from './CustomSelect'

export const WorkflowNodesIcon: React.FC<{ className?: string }> = ({ className = "w-4 h-4" }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <circle cx="5" cy="12" r="2.8" />
    <circle cx="19" cy="5.5" r="2.8" />
    <circle cx="19" cy="18.5" r="2.8" />
    <path d="M7.8 10.6l8.4-4" />
    <path d="M7.8 13.4l8.4 4" />
  </svg>
)

interface MyTeamViewProps {
  store: MultiAgentStoreState
  onUpdateStore: (next: MultiAgentStoreState) => Promise<{ success: boolean; error?: string }>
  notes: Note[]
  folders: string[]
  vaultPath?: string | null
  onOpenNote: (noteId: string) => void
  onCreateCommittedNote: (params: {
    folder: string
    title: string
    content: string
    type?: NoteType
    exclusive?: boolean
    overwriteExistingNoteId?: string
    expectedRevisionHash?: string
  }) => Promise<{
    success: boolean
    note?: Note
    filePath?: string
    revisionHash?: string
    alreadyExists?: boolean
    conflict?: boolean
    error?: string
  }>
  onCreateTask: (title?: string, initialData?: Partial<TaskItem>) => TaskItem
  taskBoards?: TaskBoard[]
  tasks?: TaskItem[]
  preselectedNoteForBinding?: { noteId: string; role: ContextRole } | null
  onClearPreselectedNote?: () => void
  onLoadDemoSeedNotes?: () => void
}

export interface UnifiedContextItem {
  id: string
  source: 'store_project' | 'task' | 'board'
  groupName: string               // Nome do grupo ou projeto contêiner (ex: "Clientes", "Marketing", "Blog")
  displayName: string             // Nome específico (ex: "Blowmind", "Artigo 1", "Lançamento Q4")
  category: 'project' | 'item'    // Categoria
  description?: string
  briefingNoteIds: string[]
  boardId?: string
  taskId?: string
  rawProject?: ProjectContext
}

type PrimarySection = 'agents' | 'squads' | 'workflows' | 'activity'

const ACTION_PERMISSION_LABELS: Record<AgentActionPermission, string> = {
  read_context: 'Ler notas e referências vinculadas',
  prepare_draft: 'Preparar novos documentos na pasta de destino',
  propose_patch: 'Propor edições em notas existentes (exige aprovação)',
  create_tasks: 'Criar tarefas de acompanhamento',
  edit_mindmap: 'Criar ou editar Mapas Mentais por ID',
  edit_diagram: 'Criar ou editar Diagramas por ID',
  delegate_team: 'Coordenar e delegar para equipe de especialistas'
}

const AGENT_AVATAR_COLORS = [
  '#10b981', // Emerald (Project Partner style)
  '#2563eb', // Blue (Pessoal style)
  '#8b5cf6', // Violet
  '#f59e0b', // Amber
  '#ec4899', // Pink
  '#06b6d4'  // Cyan
]

const STORAGE_KEY_SECTION = 'pyrite_myteam_active_section'
const STORAGE_KEY_WORKFLOW = 'pyrite_myteam_selected_workflow_id'
const STORAGE_KEY_AGENT = 'pyrite_myteam_selected_agent_id'
const STORAGE_KEY_TEAM = 'pyrite_myteam_selected_team_id'
const STORAGE_KEY_ROUTINE = 'pyrite_myteam_selected_routine_id'

export const MyTeamView: React.FC<MyTeamViewProps> = ({
  store,
  onUpdateStore,
  notes,
  folders,
  vaultPath,
  onOpenNote,
  onCreateCommittedNote,
  onCreateTask,
  taskBoards = [],
  tasks = [],
  preselectedNoteForBinding,
  onClearPreselectedNote,
  onLoadDemoSeedNotes
}) => {
  const [activeSection, setActiveSection] = useState<PrimarySection>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_SECTION) as PrimarySection | null
      if (saved && ['agents', 'squads', 'workflows', 'activity'].includes(saved)) {
        return saved
      }
    } catch {}
    return 'agents'
  })

  // Seleções nos 3 Canvases
  const teams = store.teams?.length ? store.teams : INITIAL_TEAMS
  const workflows = store.workflows?.length ? store.workflows : INITIAL_WORKFLOWS

  const [selectedAgentId, setSelectedAgentId] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_AGENT)
      if (saved && store.agents.some(a => a.id === saved)) return saved
    } catch {}
    return store.agents[0]?.id || ''
  })
  const [selectedProjectId, setSelectedProjectId] = useState<string>('')
  const [selectedRunId, setSelectedRunId] = useState<string | null>(() => store.runs[0]?.id || null)

  const [selectedTeamId, setSelectedTeamId] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_TEAM)
      if (saved && (saved === 'overview' || teams.some(t => t.id === saved))) return saved
    } catch {}
    return 'overview'
  })
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_WORKFLOW)
      if (saved && workflows.some(w => w.id === saved)) return saved
    } catch {}
    return workflows[0]?.id || ''
  })
  const [selectedRoutineId] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_ROUTINE)
      if (saved && store.automations.some(a => a.id === saved)) return saved
    } catch {}
    return store.automations[0]?.id || ''
  })

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_SECTION, activeSection)
    } catch {}
  }, [activeSection])

  useEffect(() => {
    if (selectedWorkflowId) {
      try {
        localStorage.setItem(STORAGE_KEY_WORKFLOW, selectedWorkflowId)
      } catch {}
    }
  }, [selectedWorkflowId])

  useEffect(() => {
    if (selectedAgentId) {
      try {
        localStorage.setItem(STORAGE_KEY_AGENT, selectedAgentId)
      } catch {}
    }
  }, [selectedAgentId])

  useEffect(() => {
    if (selectedTeamId) {
      try {
        localStorage.setItem(STORAGE_KEY_TEAM, selectedTeamId)
      } catch {}
    }
  }, [selectedTeamId])

  useEffect(() => {
    if (selectedRoutineId) {
      try {
        localStorage.setItem(STORAGE_KEY_ROUTINE, selectedRoutineId)
      } catch {}
    }
  }, [selectedRoutineId])

  useEffect(() => {
    const handleOpenItem = (e: Event) => {
      const detail = (e as CustomEvent)?.detail
      if (!detail) return
      if (detail.section && ['agents', 'squads', 'workflows', 'activity'].includes(detail.section)) {
        setActiveSection(detail.section)
      }
      if (detail.agentId) setSelectedAgentId(detail.agentId)
      if (detail.workflowId) setSelectedWorkflowId(detail.workflowId)
      if (detail.teamId) setSelectedTeamId(detail.teamId)
    }
    window.addEventListener('pyrite-open-team-item', handleOpenItem)
    return () => window.removeEventListener('pyrite-open-team-item', handleOpenItem)
  }, [])

  useEffect(() => {
    if (workflows.length > 0 && !workflows.some(w => w.id === selectedWorkflowId)) {
      setSelectedWorkflowId(workflows[0].id)
    }
  }, [workflows, selectedWorkflowId])

  // Pedido atual e contexto temporário (request_context)
  const [promptInput, setPromptInput] = useState('')

  const [agentSearchQuery, setAgentSearchQuery] = useState('')
  const [chatSidebarTab, setChatSidebarTab] = useState<'agents' | 'squads'>(() => {
    try {
      const saved = localStorage.getItem('pyrite_chat_sidebar_tab')
      if (saved === 'squads' || saved === 'agents') return saved
    } catch {}
    return 'agents'
  })
  const [squadSearchQuery, setSquadSearchQuery] = useState('')

  useEffect(() => {
    try {
      localStorage.setItem('pyrite_chat_sidebar_tab', chatSidebarTab)
    } catch {}
  }, [chatSidebarTab])
  const [extraNoteIds, setExtraNoteIds] = useState<string[]>([])
  const [useTeamDelegation, setUseTeamDelegation] = useState(false)
  const [isExecuting, setIsExecuting] = useState(false)
  const abortControllerRef = useRef<AbortController | null>(null)

  // Respostas a perguntas pendentes e resolução de conflitos de preços
  const [answerInputs, setAnswerInputs] = useState<Record<string, string>>({})
  const [conflictChoices, setConflictChoices] = useState<
    Record<string, { chosenValue: string; chosenPriceCents: number }>
  >({})

  // Painéis estilo OpenBot:
  // - Coluna esquerda de lista de agentes (Print 01 e Print 04)
  // - Sidebar direita de Configurações do Agente (Print 04 — fecha/abre pelo ícone no topo direito!)
  const [isAgentListOpen, setIsAgentListOpen] = useState(true)
  const [isAgentSettingsOpen, setIsAgentSettingsOpen] = useState(false)
  const [expandedSettingsSection, setExpandedSettingsSection] = useState<
    'instructions' | 'memories' | 'skills' | 'files' | null
  >(null)
  const [reasoningEffort, setReasoningEffort] = useState<'Baixo' | 'Médio' | 'Alto'>('Baixo')
  const [isComposerPlusOpen, setIsComposerPlusOpen] = useState(false)
  const [expandedDraftRunIds, setExpandedDraftRunIds] = useState<Record<string, boolean>>({})
  const [expandedStepsRunIds, setExpandedStepsRunIds] = useState<Record<string, boolean>>({})

  // Modais pontuais
  const [isProjectsModalOpen, setIsProjectsModalOpen] = useState(false)
  const [isApprovalDrawerOpen, setIsApprovalDrawerOpen] = useState(false)
  const [isNewAgentModalOpen, setIsNewAgentModalOpen] = useState(false)
  const [newAgentTab, setNewAgentTab] = useState<'guided' | 'conversation'>('guided')

  // Modal de seleção de agente quando o usuário clica em "Usar com um agente" no Editor
  const [pendingNoteBindModal, setPendingNoteBindModal] = useState<{
    noteId: string
    role: ContextRole
    targetAgentId: string
  } | null>(null)

  // Modal de colisão de arquivo existente
  const [overwritePrompt, setOverwritePrompt] = useState<{
    run: AgentRun
    finalApproval: boolean
    existingTitle: string
    folder: string
    content: string
    type: NoteType
  } | null>(null)

  const [statusBanner, setStatusBanner] = useState<{
    type: 'success' | 'warning' | 'error' | 'info'
    text: string
  } | null>(null)

  // Estado de formulário para Novo Agente
  const [convDescription, setConvDescription] = useState('')
  const [newAgentDraft, setNewAgentDraft] = useState<AgentProfileVersion | null>(null)

  // Estado de formulário para Projetos & Itens de Conteúdo
  const [editingProject, setEditingProject] = useState<ProjectContext | null>(null)
  const [projCategory, setProjCategory] = useState<'project' | 'item'>('project')
  const [projName, setProjName] = useState('')
  const [isProjGroupDropdownOpen, setIsProjGroupDropdownOpen] = useState(false)
  const [projItem, setProjItem] = useState('')
  const [projDesc, setProjDesc] = useState('')
  const [projBriefingIds, setProjBriefingIds] = useState<string[]>([])
  const [projBriefingSearch, setProjBriefingSearch] = useState('')

  // Estado para adicionar vínculo de conhecimento na aba Arquivos (Print 04)
  const [bindRole, setBindRole] = useState<ContextRole>('permanent_ref')
  const [bindPolicy, setBindPolicy] = useState<'follow_latest' | 'pin_revision'>('follow_latest')

  // Modais e Popovers customizados de alta usabilidade
  const [isAiSettingsModalOpen, setIsAiSettingsModalOpen] = useState(false)
  const [aiSettingsInitialTab, setAiSettingsInitialTab] = useState<'models' | 'specialties' | 'skills'>('models')
  const [installedAiSkills, setInstalledAiSkills] = useState<CustomAgentSkill[]>([])
  const [activeProviderName, setActiveProviderName] = useState<string>('openrouter')
  const [activeModelName, setActiveModelName] = useState<string>('google/gemini-2.5-flash')
  const [hasActiveKey, setHasActiveKey] = useState<boolean>(true)
  const [isAvatarPickerOpen, setIsAvatarPickerOpen] = useState(false)
  const [avatarPreviewState, setAvatarPreviewState] = useState<AgentIconState>('waiting')
  const [isProjectDropdownOpen, setIsProjectDropdownOpen] = useState(false)
  const [contextSearchQuery, setContextSearchQuery] = useState('')
  const [hoveredCategory, setHoveredCategory] = useState<'project' | 'item' | null>(null)
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false)
  const [isNoteBindPickerOpen, setIsNoteBindPickerOpen] = useState(false)
  const [noteSearchQuery, setNoteSearchQuery] = useState('')
  const [selectedNoteForBind, setSelectedNoteForBind] = useState<Note | null>(null)
  const [composerNoteSearch, setComposerNoteSearch] = useState('')
  const [isListening, setIsListening] = useState(false)
  const speechRecRef = useRef<any>(null)

  // Referências para fechamento com clique externo (dropdowns e popovers)
  const projectDropdownRef = useRef<HTMLDivElement>(null)
  const projGroupDropdownRef = useRef<HTMLDivElement>(null)
  const modelDropdownRef = useRef<HTMLDivElement>(null)
  const composerPlusRef = useRef<HTMLDivElement>(null)

  const loadInstalledAiSkills = () => {
    if (typeof window === 'undefined') return
    try {
      const saved =
        localStorage.getItem('pyrite_agent_custom_skills_v1') ||
        localStorage.getItem('pyrita_agent_custom_skills_v1')
      if (saved) {
        setInstalledAiSkills(JSON.parse(saved))
      } else {
        setInstalledAiSkills([])
      }
    } catch {
      setInstalledAiSkills([])
    }
  }

  const loadAiConfigs = async () => {
    if (typeof window !== 'undefined' && window.electronAPI?.aiGetAllConfigs) {
      try {
        const data = await window.electronAPI.aiGetAllConfigs()
        if (data.activeProvider) {
          const prov = data.activeProvider.toLowerCase()
          setActiveProviderName(prov)
          const pConfig = data.providers?.[prov]
          if (pConfig?.model) {
            setActiveModelName(pConfig.model)
          }
          setHasActiveKey(prov === 'ollama' ? true : !!pConfig?.hasKey)
        }
      } catch (err) {
        console.error('Failed to load AI configs in MyTeamView:', err)
      }
    }
  }

  useEffect(() => {
    loadAiConfigs()
    loadInstalledAiSkills()
  }, [])

  // Fechar dropdowns e menus flutuantes ao clicar fora
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node
      if (
        isProjectDropdownOpen &&
        projectDropdownRef.current &&
        !projectDropdownRef.current.contains(target)
      ) {
        setIsProjectDropdownOpen(false)
      }
      if (
        isModelDropdownOpen &&
        modelDropdownRef.current &&
        !modelDropdownRef.current.contains(target)
      ) {
        setIsModelDropdownOpen(false)
      }
      if (
        isComposerPlusOpen &&
        composerPlusRef.current &&
        !composerPlusRef.current.contains(target)
      ) {
        setIsComposerPlusOpen(false)
      }
      if (
        isProjGroupDropdownOpen &&
        projGroupDropdownRef.current &&
        !projGroupDropdownRef.current.contains(target)
      ) {
        setIsProjGroupDropdownOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('touchstart', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('touchstart', handleClickOutside)
    }
  }, [isProjectDropdownOpen, isModelDropdownOpen, isComposerPlusOpen, isProjGroupDropdownOpen])

  // Identificação inteligente de Itens vs Projetos
  const isItemProject = (p: ProjectContext) => {
    if (p.category === 'item') return true
    if (p.category === 'project') return false
    const n = (p.name || '').toLowerCase()
    const t = (p.itemType || '').toLowerCase()
    return (
      n.includes('cliente') ||
      t.includes('cliente') ||
      n.includes('produto') ||
      t.includes('produto') ||
      n.includes('artigo') ||
      t.includes('artigo') ||
      n.includes('campanha') ||
      t.includes('campanha') ||
      n.includes('post') ||
      t.includes('post')
    )
  }

  // Unificação inteligente de contextos integrando TaskBoards, Tasks e Store Projects
  const allUnifiedItems = useMemo<UnifiedContextItem[]>(() => {
    const list: UnifiedContextItem[] = []
    const seenIds = new Set<string>()

    // 1. TaskBoards e suas tarefas (Kanban / Sidebar)
    taskBoards.forEach(board => {
      const isItem = board.category === 'item'
      const boardTasks = tasks.filter(t => (t.boardId || 'default') === board.id)

      boardTasks.forEach(task => {
        const id = `task:${task.id}`
        if (!seenIds.has(id)) {
          seenIds.add(id)
          list.push({
            id,
            source: 'task',
            groupName: board.name,
            displayName: task.title,
            category: isItem ? 'item' : 'project',
            description: task.description || '',
            briefingNoteIds: task.contextNoteId ? [task.contextNoteId] : [],
            boardId: board.id,
            taskId: task.id
          })
        }
      })

      // Também inclui o Board como contêiner/grupo selecionável
      const boardId = `board:${board.id}`
      if (!seenIds.has(boardId)) {
        seenIds.add(boardId)
        list.push({
          id: boardId,
          source: 'board',
          groupName: board.name,
          displayName: board.name,
          category: isItem ? 'item' : 'project',
          description: isItem ? `Grupo de itens: ${board.name}` : `Projeto contêiner: ${board.name}`,
          briefingNoteIds: [],
          boardId: board.id
        })
      }
    })

    // 2. Projetos explícitos do store (ProjectContext)
    store.projects.forEach(p => {
      const isItem = isItemProject(p)
      if (!seenIds.has(p.id)) {
        seenIds.add(p.id)
        list.push({
          id: p.id,
          source: 'store_project',
          groupName: p.name || (isItem ? 'Clientes' : 'Geral'),
          displayName: p.itemName || p.clientName || p.name,
          category: isItem ? 'item' : 'project',
          description: p.description || '',
          briefingNoteIds: p.briefingNoteIds || [],
          rawProject: p
        })
      }
    })

    return list
  }, [taskBoards, tasks, store.projects])

  // Itens unificados filtrados por categoria
  const unifiedItemItems = useMemo(() => {
    return allUnifiedItems.filter(item => item.category === 'item')
  }, [allUnifiedItems])

  const unifiedProjectItems = useMemo(() => {
    return allUnifiedItems.filter(item => item.category === 'project')
  }, [allUnifiedItems])

  // Agrupamento dos itens por grupo/board
  const groupedContentItems = useMemo(() => {
    const map: Record<string, UnifiedContextItem[]> = {}
    unifiedItemItems.forEach(item => {
      const g = item.groupName.trim() || 'Clientes'
      if (!map[g]) map[g] = []
      map[g].push(item)
    })
    return map
  }, [unifiedItemItems])

  const groupedProjectItems = useMemo(() => {
    const map: Record<string, UnifiedContextItem[]> = {}
    unifiedProjectItems.forEach(item => {
      const g = item.groupName.trim() || 'Geral'
      if (!map[g]) map[g] = []
      map[g].push(item)
    })
    return map
  }, [unifiedProjectItems])

  // Conversão para ProjectContext para retrocompatibilidade
  const allUnifiedAsProjects = useMemo<ProjectContext[]>(() => {
    return allUnifiedItems.map(item => {
      if (item.rawProject) return item.rawProject
      return {
        id: item.id,
        name: item.groupName,
        itemName: item.displayName,
        clientName: item.displayName,
        category: item.category,
        description: item.description,
        briefingNoteIds: item.briefingNoteIds,
        createdAt: Date.now(),
        updatedAt: Date.now()
      }
    })
  }, [allUnifiedItems])

  // Execuções em pausa aguardando aprovação humana em fluxo
  const pendingApprovalRuns = useMemo(() => {
    return store.runs.filter(r => r.status === 'waiting_approval' || (r.workflowId && r.pausedAtWorkflowNodeId))
  }, [store.runs])

  // Grava de verdade a nota de entrega do fluxo no cofre (mesmo caminho usado pelas entregas dos agentes)
  const workflowCommitNote: WorkflowCommitNoteFn = async ({ folder, title, content }) => {
    const res = await onCreateCommittedNote({ folder, title, content, type: 'note', exclusive: true })
    return {
      success: res.success,
      note: res.note,
      filePath: res.filePath,
      revisionHash: res.revisionHash,
      alreadyExists: res.alreadyExists,
      error: res.error
    }
  }

  // Grava de verdade as tarefas geradas pelo fluxo no quadro/projeto
  const workflowCommitTasks: WorkflowCommitTasksFn = useCallback(async ({ boardId, tasks: tasksList }: Parameters<WorkflowCommitTasksFn>[0]) => {
    try {
      const createdIds: string[] = []
      let effectiveBoardId = boardId
      if (!effectiveBoardId || effectiveBoardId === 'default') {
        effectiveBoardId = taskBoards.find(b => b.category === 'project')?.id || taskBoards[0]?.id || 'default'
      } else {
        const found = taskBoards.find(b => b.id === effectiveBoardId)
        if (!found && taskBoards[0]) {
          effectiveBoardId = taskBoards[0].id
        }
      }

      for (const t of tasksList) {
        const item = onCreateTask(t.title, {
          boardId: effectiveBoardId,
          description: t.description || '',
          priority: (t.priority as any) || 'medium',
          statusId: t.statusId || 'todo',
          customValues: t.customValues || {}
        })
        if (item?.id) {
          createdIds.push(item.id)
        }
      }

      return {
        success: true,
        createdCount: createdIds.length,
        taskIds: createdIds
      }
    } catch (err: any) {
      console.error('Erro ao gravar tarefas no quadro:', err)
      return {
        success: false,
        createdCount: 0,
        taskIds: [],
        error: err?.message || 'Falha ao salvar tarefas no quadro'
      }
    }
  }, [onCreateTask, taskBoards])

  useEffect(() => {
    registerWorkflowCommitTasks(workflowCommitTasks)
    return () => registerWorkflowCommitTasks(null)
  }, [workflowCommitTasks])

  // Salva a execução do fluxo na store e registra as entregas gravadas
  const persistWorkflowRun = async (run: AgentRun, mode: 'prepend' | 'replace') => {
    const knownArtifactIds = new Set(store.artifacts.map(a => a.id))
    const newArtifacts = run.artifacts.filter(a => !knownArtifactIds.has(a.id))
    await onUpdateStore({
      ...store,
      runs:
        mode === 'prepend'
          ? [run, ...store.runs]
          : store.runs.map(r => (r.id === run.id ? run : r)),
      artifacts: [...newArtifacts, ...store.artifacts]
    })
  }

  const handleDirectApproveWorkflowRun = async (pausedRun: AgentRun) => {
    setIsExecuting(true)
    try {
      const wf = workflows.find(w => w.id === pausedRun.workflowId) || workflows[0]
      const resumed = await resumeWorkflowRun({
        pausedRun,
        workflow: wf,
        allAgents: store.agents,
        allNotes: notes,
        allProjects: allUnifiedAsProjects,
        commitNote: workflowCommitNote,
        commitTasks: workflowCommitTasks
      })
      await persistWorkflowRun(resumed, 'replace')
      setSelectedRunId(resumed.id)
      setStatusBanner({
        type: resumed.status === 'failed' ? 'error' : 'success',
        text:
          resumed.status === 'failed'
            ? `Fluxo falhou após a aprovação: ${resumed.error || 'erro desconhecido'}`
            : 'Etapa aprovada! O fluxo de trabalho continuou.'
      })
      setIsApprovalDrawerOpen(false)
    } catch (err: any) {
      setStatusBanner({ type: 'error', text: `Erro ao aprovar etapa: ${err?.message || 'Falha ao processar'}` })
    } finally {
      setIsExecuting(false)
    }
  }

  const handleDirectRejectWorkflowRun = async (pausedRun: AgentRun) => {
    try {
      await onUpdateStore({
        ...store,
        runs: store.runs.map(r =>
          r.id === pausedRun.id
            ? {
                ...r,
                status: 'failed' as const,
                pausedAtWorkflowNodeId: undefined,
                error: 'Execução rejeitada pelo usuário na etapa de aprovação.',
                updatedAt: Date.now()
              }
            : r
        )
      })
      setStatusBanner({ type: 'warning', text: 'Fluxo rejeitado e finalizado.' })
      setIsApprovalDrawerOpen(false)
    } catch (err: any) {
      setStatusBanner({ type: 'error', text: `Erro ao rejeitar: ${err?.message || 'Falha ao processar'}` })
    }
  }

  const resolveActiveContext = (id: string | null | undefined): UnifiedContextItem | undefined => {
    if (!id) return undefined
    return allUnifiedItems.find(item => item.id === id)
  }

  // Grupos disponíveis para o combobox customizado do modal
  const availableGroupsForCategory = useMemo(() => {
    const set = new Set<string>()
    if (projCategory === 'item') {
      taskBoards.filter(b => b.category === 'item').forEach(b => set.add(b.name))
      Object.keys(groupedContentItems).forEach(g => set.add(g))
      ;['Clientes', 'Produtos & Recursos', 'Blog & Conteúdo', 'Marketing', 'Campanhas', 'Pesquisa'].forEach(d => set.add(d))
    } else {
      taskBoards.filter(b => b.category !== 'item').forEach(b => set.add(b.name))
      Object.keys(groupedProjectItems).forEach(g => set.add(g))
      ;['Geral', 'Desenvolvimento', 'Operações', 'Planejamento Estratégico', 'Lançamento Q4'].forEach(d => set.add(d))
    }
    const query = projName.toLowerCase().trim()
    return Array.from(set).filter(name => !query || name.toLowerCase().includes(query))
  }, [projCategory, projName, taskBoards, groupedContentItems, groupedProjectItems])


  const toggleSpeechRecognition = () => {
    const SpeechRec = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition
    if (!SpeechRec) {
      setStatusBanner({
        type: 'warning',
        text: 'Reconhecimento de voz não suportado neste navegador.'
      })
      return
    }

    if (isListening && speechRecRef.current) {
      speechRecRef.current.stop()
      setIsListening(false)
      return
    }

    try {
      const rec = new SpeechRec()
      rec.lang = 'pt-BR'
      rec.continuous = false
      rec.interimResults = true

      rec.onresult = (event: any) => {
        let text = ''
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          text += event.results[i][0].transcript
        }
        if (text) {
          setPromptInput(prev => (prev ? prev + ' ' + text : text))
        }
      }

      rec.onend = () => setIsListening(false)
      rec.onerror = () => setIsListening(false)

      speechRecRef.current = rec
      rec.start()
      setIsListening(true)
    } catch {
      setIsListening(false)
    }
  }

  const handleConfirmBindNote = async () => {
    if (!selectedNoteForBind || !selectedAgent) return
    const noteId = selectedNoteForBind.id
    const existing = selectedAgent.knowledgeBindings.some(
      b => b.noteId === noteId && b.role === bindRole
    )
    if (existing) {
      setStatusBanner({
        type: 'warning',
        text: `A nota "${selectedNoteForBind.title}" já está vinculada neste papel a este agente.`
      })
      setIsNoteBindPickerOpen(false)
      setSelectedNoteForBind(null)
      return
    }

    const revisionHash =
      bindPolicy === 'pin_revision'
        ? computeHashSync(selectedNoteForBind.content || '')
        : undefined

    const newBinding: ContextBinding = {
      id: `bind_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      targetType: 'note',
      noteId: selectedNoteForBind.id,
      noteTitle: selectedNoteForBind.title,
      folderPath: selectedNoteForBind.folder,
      role: bindRole,
      required: bindRole === 'template',
      precedence: bindRole === 'template' ? 100 : 80,
      updatePolicy: bindPolicy,
      pinnedHash: revisionHash,
      pinnedContentSnapshot: bindPolicy === 'pin_revision' ? selectedNoteForBind.content : undefined
    }

    const updatedAgent: AgentProfileVersion = {
      ...selectedAgent,
      knowledgeBindings: [...selectedAgent.knowledgeBindings, newBinding]
    }
    const nextStore = updateAgentProfileWithVersion(store, updatedAgent)
    await onUpdateStore(nextStore)
    setStatusBanner({
      type: 'success',
      text: `Nota "${selectedNoteForBind.title}" vinculada como ${ROLE_LABELS[bindRole]?.label || bindRole}.`
    })
    setIsNoteBindPickerOpen(false)
    setSelectedNoteForBind(null)
    setNoteSearchQuery('')
  }

  const handleDeleteAgent = async (agentId: string) => {
    if (store.agents.length <= 1) {
      setStatusBanner({ type: 'warning', text: 'Você precisa manter pelo menos um agente na equipe.' })
      return
    }
    const targetAgent = store.agents.find(a => a.id === agentId)
    if (!targetAgent) return

    const confirmed = window.confirm(`Deseja realmente excluir o agente "${targetAgent.name}"?`)
    if (!confirmed) return

    const nextAgents = store.agents.filter(a => a.id !== agentId)
    const nextStore = {
      ...store,
      agents: nextAgents,
      runs: store.runs.filter(r => r.agentId !== agentId)
    }
    await onUpdateStore(nextStore)
    setSelectedAgentId(nextAgents[0]?.id || '')
    setIsAgentSettingsOpen(false)
    setStatusBanner({ type: 'success', text: `Agente "${targetAgent.name}" excluído com sucesso.` })
  }

  const storeRef = useRef(store)
  storeRef.current = store

  const selectedAgent = store.agents.find(a => a.id === selectedAgentId) || store.agents[0]
  const activeRun = selectedRunId ? (store.runs.find(r => r.id === selectedRunId) || null) : null

  const getAgentColor = (agentId?: string) => {
    const ag = store.agents.find(a => a.id === agentId)
    if (ag?.color) return ag.color
    const idx = store.agents.findIndex(a => a.id === agentId)
    return AGENT_AVATAR_COLORS[Math.max(0, idx) % AGENT_AVATAR_COLORS.length]
  }

  const formatTimeShort = (ts?: number) => {
    if (!ts) return ''
    const d = new Date(ts)
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  }

  const getRunSummaryText = (run: AgentRun) => {
    if (run.status === 'waiting_user' && run.clarifyingQuestions.length > 0) {
      return `Preciso de ${run.clarifyingQuestions.length} informação(ões) complementar(es) para concluir.`
    }
    if (run.calculation) {
      return `Entrega estruturada (${run.calculation.items.length} itens • Total líquido: ${formatCentsBRL(run.calculation.netTotalCents)}).`
    }
    if (run.changeSet?.operations[0]) {
      return `Documento "${run.changeSet.operations[0].targetTitle}" preparado em ${run.changeSet.operations[0].targetFolder}.`
    }
    return 'Entendido. Solicitação processada.'
  }

  useEffect(() => {
    if (preselectedNoteForBinding) {
      setPendingNoteBindModal({
        noteId: preselectedNoteForBinding.noteId,
        role: preselectedNoteForBinding.role,
        targetAgentId: selectedAgentId || store.agents[0]?.id || ''
      })
      onClearPreselectedNote?.()
    }
  }, [preselectedNoteForBinding])

  const handleConfirmNoteFromEditor = async () => {
    if (!pendingNoteBindModal) return
    const { noteId, role, targetAgentId } = pendingNoteBindModal
    const targetNote = notes.find(n => n.id === noteId)
    const targetAgent = store.agents.find(a => a.id === targetAgentId)
    if (!targetNote || !targetAgent) {
      setPendingNoteBindModal(null)
      return
    }

    setSelectedAgentId(targetAgent.id)
    setActiveSection('agents')

    if (role === 'request_context') {
      setExtraNoteIds(prev => (prev.includes(noteId) ? prev : [...prev, noteId]))
      setStatusBanner({
        type: 'success',
        text: `Nota "${targetNote.title}" anexada ao próximo envio para ${targetAgent.name}.`
      })
      setPendingNoteBindModal(null)
      return
    }

    const existing = targetAgent.knowledgeBindings.some(
      b => b.noteId === targetNote.id && b.role === role
    )
    if (!existing) {
      const newBinding: ContextBinding = {
        id: `bind_${Date.now()}`,
        targetType: 'note',
        noteId: targetNote.id,
        noteTitle: targetNote.title,
        folderPath: targetNote.folder,
        projectId: role === 'project_context' ? selectedProjectId || undefined : undefined,
        role,
        required: role === 'template',
        precedence: role === 'template' ? 100 : 80,
        updatePolicy: 'follow_latest'
      }
      const updatedAgent: AgentProfileVersion = {
        ...targetAgent,
        knowledgeBindings: [...targetAgent.knowledgeBindings, newBinding]
      }
      const nextStore = updateAgentProfileWithVersion(store, updatedAgent)
      await onUpdateStore(nextStore)
      setStatusBanner({
        type: 'success',
        text: `Nota "${targetNote.title}" vinculada a ${targetAgent.name}.`
      })
    }
    setPendingNoteBindModal(null)
  }

  // executeRoutineDirectly removed

  const handleRunAgent = async (opts: {
    isTest: boolean
    overridePrompt?: string
    overrideProjectId?: string
    overrideTeam?: TeamDefinition
    existingRunToUpdate?: AgentRun
  }) => {
    if (!selectedAgent) return
    const effectiveProjectId =
      opts.overrideProjectId !== undefined ? opts.overrideProjectId : selectedProjectId
    const effectiveContext = resolveActiveContext(effectiveProjectId)
    const effectiveProject: ProjectContext | undefined = effectiveContext ? {
      id: effectiveContext.id,
      name: effectiveContext.groupName,
      itemName: effectiveContext.displayName,
      clientName: effectiveContext.displayName,
      itemType: effectiveContext.groupName,
      category: effectiveContext.category,
      description: effectiveContext.description,
      folderPath: effectiveContext.groupName,
      briefingNoteIds: effectiveContext.briefingNoteIds,
      createdAt: Date.now(),
      updatedAt: Date.now()
    } : store.projects.find(p => p.id === effectiveProjectId)
    const effectivePrompt = (
      opts.overridePrompt ??
      opts.existingRunToUpdate?.prompt ??
      promptInput
    ).trim()

    if (!effectivePrompt) return

    setIsExecuting(true)
    setStatusBanner(null)
    const controller = new AbortController()
    abortControllerRef.current = controller

    const attachedNotes = notes.filter(n =>
      (opts.existingRunToUpdate?.extraNoteIds || extraNoteIds).includes(n.id)
    )

    const mergedAnswers = {
      ...(opts.existingRunToUpdate?.userAnswers || {}),
      ...answerInputs
    }
    const mergedConflicts = {
      ...(opts.existingRunToUpdate?.conflictResolutions || {}),
      ...conflictChoices
    }

    try {
      const resultRun = await executeAgentRun({
        agent: selectedAgent,
        allAgents: store.agents,
        allNotes: notes,
        allProjects: allUnifiedAsProjects,
        prompt: effectivePrompt,
        isTestRun: opts.isTest,
        projectContext: effectiveProject,
        explicitClientName: effectiveProject?.clientName,
        extraRequestNotes: attachedNotes,
        userAnswers: Object.keys(mergedAnswers).length > 0 ? mergedAnswers : undefined,
        conflictResolutions: Object.keys(mergedConflicts).length > 0 ? mergedConflicts : undefined,
        useTeamDelegation: Boolean(opts.overrideTeam || useTeamDelegation),
        teamDefinition: opts.overrideTeam || (useTeamDelegation ? teams.find(t => t.id === selectedTeamId) : undefined),
        existingRunId: opts.existingRunToUpdate?.id,
        abortSignal: controller.signal,
        onRunStarted: async initialRunning => {
          const current = storeRef.current
          const exists = current.runs.some(r => r.id === initialRunning.id)
          const nextRuns = exists
            ? current.runs.map(r => (r.id === initialRunning.id ? initialRunning : r))
            : [initialRunning, ...current.runs]
          await onUpdateStore({ ...current, runs: nextRuns })
        }
      })

      const latestStore = storeRef.current
      const existsInStore = latestStore.runs.some(r => r.id === resultRun.id)
      const finalRuns = existsInStore
        ? latestStore.runs.map(r => (r.id === resultRun.id ? resultRun : r))
        : [resultRun, ...latestStore.runs]

      await onUpdateStore({
        ...latestStore,
        runs: finalRuns
      })
      setSelectedRunId(resultRun.id)
      setAnswerInputs({})
      if (!opts.existingRunToUpdate) {
        setPromptInput('')
      }
    } finally {
      setIsExecuting(false)
      abortControllerRef.current = null
    }
  }

  const handleCancelActiveExecution = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
  }

  const handleCommitDeliverable = async (
    initialRun: AgentRun,
    finalApproval: boolean,
    conflictStrategy?: 'new_revision' | 'overwrite'
  ) => {
    let run = initialRun

    if (run.pausedAtWorkflowNodeId && finalApproval) {
      setIsExecuting(true)
      try {
        const wf = workflows.find(w => w.id === run.workflowId)
        run = await resumeWorkflowRun({
          pausedRun: run,
          workflow: wf,
          allAgents: store.agents,
          allNotes: notes,
          allProjects: allUnifiedAsProjects,
          commitNote: workflowCommitNote
        })
      } finally {
        setIsExecuting(false)
      }
    }

    const primaryOp = run.changeSet?.operations[0]
    if (!primaryOp) {
      setStatusBanner({
        type: 'warning',
        text: 'Esta execução não possui operação de escrita autorizada.'
      })
      return
    }

    if (primaryOp.status === 'committed' && !conflictStrategy) {
      setStatusBanner({
        type: 'warning',
        text: 'Esta entrega já foi salva no cofre.'
      })
      return
    }

    const hasMissing = Boolean(run.calculation && run.calculation.missingFields.length > 0)
    const hasUnresolvedConflicts = Boolean(
      run.calculation && run.calculation.conflicts.some(c => c.resolution === 'unresolved')
    )
    const hasFixedViolations = Boolean(
      run.calculation && run.calculation.fixedSectionViolations.length > 0
    )

    if (finalApproval && (hasMissing || hasUnresolvedConflicts || hasFixedViolations)) {
      setStatusBanner({
        type: 'error',
        text: 'Resolva os campos pendentes ou conflitos de preço antes de aprovar como versão final.'
      })
      return
    }

    const frozenFolder = primaryOp.targetFolder || 'Propostas'
    let targetTitle = primaryOp.targetTitle
    const contentToSave = primaryOp.contentPreview || run.draftContent || ''
    const noteType: NoteType =
      primaryOp.type === 'create_mindmap'
        ? 'mindmap'
        : primaryOp.type === 'create_diagram'
        ? 'draw'
        : 'note'

    const existingNoteInVault = notes.find(
      n =>
        n.folder.toLowerCase() === frozenFolder.toLowerCase() &&
        n.title.toLowerCase() === targetTitle.toLowerCase()
    )

    if (conflictStrategy === 'new_revision') {
      const revNum =
        notes.filter(
          n =>
            n.folder.toLowerCase() === frozenFolder.toLowerCase() &&
            n.title.toLowerCase().startsWith(targetTitle.toLowerCase())
        ).length + 1
      targetTitle = `${targetTitle} (v${revNum})`
    } else if (!conflictStrategy && existingNoteInVault) {
      setOverwritePrompt({
        run,
        finalApproval,
        existingTitle: targetTitle,
        folder: frozenFolder,
        content: contentToSave,
        type: noteType
      })
      return
    }

    const runAgent = store.agents.find(a => a.id === run.agentId)
    if (conflictStrategy === 'overwrite' && !runAgent?.allowedActions.includes('propose_patch')) {
      setStatusBanner({
        type: 'warning',
        text: `Habilidade não autorizada: O agente "${runAgent?.name || 'Agente'}" não possui permissão para editar notas existentes ("propose_patch"). Ative esta permissão nas configurações do agente.`
      })
      return
    }

    const res = await onCreateCommittedNote({
      folder: frozenFolder,
      title: targetTitle,
      content: contentToSave,
      type: noteType,
      exclusive: conflictStrategy !== 'overwrite',
      overwriteExistingNoteId: conflictStrategy === 'overwrite' ? existingNoteInVault?.id : undefined,
      expectedRevisionHash:
        conflictStrategy === 'overwrite' && existingNoteInVault
          ? computeHashSync(existingNoteInVault.content)
          : undefined
    })

    if (res.alreadyExists && !conflictStrategy) {
      setOverwritePrompt({
        run,
        finalApproval,
        existingTitle: targetTitle,
        folder: frozenFolder,
        content: contentToSave,
        type: noteType
      })
      return
    }

    if (!res.success || !res.note) {
      setStatusBanner({
        type: 'error',
        text: res.error || 'Falha ao gravar a entrega no cofre.'
      })
      return
    }

    const proposalStatus: ProposalStatus = finalApproval
      ? 'approved'
      : hasMissing || hasUnresolvedConflicts
      ? 'pending_info'
      : 'draft'

    if (finalApproval && runAgent?.allowedActions.includes('create_tasks')) {
      const scopeItems = run.calculation?.items || []
      if (scopeItems.length > 0) {
        for (const item of scopeItems) {
          onCreateTask(`Entregar ${item.serviceName} — ${run.clientName || targetTitle}`, {
            description: `${item.description} (Valor: ${formatCentsBRL(item.totalCents)} • Fonte: [[${item.sourceNoteTitle}]])`,
            contextNoteId: res.note.id,
            contextNoteTitle: res.note.title,
            priority: 'high',
            tags: ['proposta', 'escopo']
          })
        }
      } else {
        onCreateTask(`Acompanhar entrega: ${targetTitle}`, {
          description: `Documento vinculado: [[${targetTitle}]]`,
          contextNoteId: res.note.id,
          contextNoteTitle: res.note.title,
          priority: 'medium',
          tags: ['agente']
        })
      }
    }

    const newArtifact: AgentArtifact = {
      id: `art_${Date.now()}`,
      runId: run.id,
      agentId: run.agentId,
      agentVersion: run.agentVersion,
      title: targetTitle,
      folder: frozenFolder,
      noteId: res.note.id,
      filePath: res.filePath,
      artifactType:
        noteType === 'mindmap'
          ? 'mindmap'
          : noteType === 'draw'
          ? 'draw'
          : run.calculation
          ? 'proposal'
          : 'note',
      proposalStatus,
      clientName: run.clientName,
      projectId: run.projectContextId,
      sourceSnapshots: run.sourceSnapshots,
      calculation: run.calculation,
      revisionHash: res.revisionHash || computeHashSync(contentToSave),
      createdAt: Date.now()
    }

    const updatedRun: AgentRun = {
      ...run,
      status: 'completed',
      proposalStatus,
      completedAt: Date.now(),
      updatedAt: Date.now(),
      changeSet: run.changeSet
        ? {
            ...run.changeSet,
            operations: run.changeSet.operations.map((op, idx) =>
              idx === 0
                ? {
                    ...op,
                    targetTitle,
                    status: 'committed',
                    commitReceipt: {
                      noteId: res.note?.id,
                      filePath: res.filePath,
                      revisionHash: newArtifact.revisionHash,
                      committedAt: Date.now()
                    }
                  }
                : op
            )
          }
        : undefined,
      artifacts: [newArtifact, ...run.artifacts]
    }

    await onUpdateStore({
      ...store,
      runs: store.runs.map(r => (r.id === run.id ? updatedRun : r)),
      artifacts: [newArtifact, ...store.artifacts]
    })

    setOverwritePrompt(null)
    setStatusBanner({
      type: 'success',
      text: finalApproval
        ? `Proposta aprovada e salva em "${frozenFolder}/${targetTitle}".`
        : `Rascunho salvo em "${frozenFolder}/${targetTitle}".`
    })
  }

  const handleLoadDemoExamples = async () => {
    onLoadDemoSeedNotes?.()
    const existingIds = new Set(store.projects.map(p => p.id))
    const mergedProjects = [
      ...store.projects,
      ...DEMO_PROJECTS.filter(dp => !existingIds.has(dp.id))
    ]
    await onUpdateStore({
      ...store,
      projects: mergedProjects,
      demoExamplesLoaded: true
    })
    if (mergedProjects[0]) {
      setSelectedProjectId(mergedProjects[0].id)
    }
    setStatusBanner({
      type: 'success',
      text: 'Exemplos de demonstração carregados.'
    })
  }

  const handleSaveProject = async () => {
    const defaultContainer = projCategory === 'item' ? 'Clientes' : 'Geral'
    const containerName = projName.trim() || defaultContainer
    const itemName = projItem.trim() || containerName
    if (!itemName) return
    const nextProj: ProjectContext = {
      id: editingProject?.id || `proj_${Date.now()}`,
      name: containerName,
      itemName,
      clientName: itemName,
      itemType: containerName,
      category: projCategory,
      description: projDesc.trim(),
      folderPath: containerName,
      briefingNoteIds: projBriefingIds,
      createdAt: editingProject?.createdAt || Date.now(),
      updatedAt: Date.now()
    }
    const exists = store.projects.some(p => p.id === nextProj.id)
    const nextProjects = exists
      ? store.projects.map(p => (p.id === nextProj.id ? nextProj : p))
      : [nextProj, ...store.projects]
    await onUpdateStore({ ...store, projects: nextProjects })
    setSelectedProjectId(nextProj.id)
    setEditingProject(null)
    setProjName('')
    setProjItem('')
    setProjCategory('project')
    setIsProjGroupDropdownOpen(false)
    setProjDesc('')
    setProjBriefingIds([])
    setProjBriefingSearch('')
    setStatusBanner({
      type: 'success',
      text: `${projCategory === 'item' ? 'Item' : 'Projeto'} "${itemName}" salvo no conjunto "${containerName}".`
    })
  }

  const filteredSquadsForChat = teams.filter(
    sq =>
      sq.name.toLowerCase().includes(squadSearchQuery.toLowerCase()) ||
      (sq.objective || '').toLowerCase().includes(squadSearchQuery.toLowerCase())
  )

  const filteredAgents = store.agents.filter(
    ag =>
      ag.name.toLowerCase().includes(agentSearchQuery.toLowerCase()) ||
      ag.roleDescription.toLowerCase().includes(agentSearchQuery.toLowerCase()) ||
      ag.workStyle.tone.toLowerCase().includes(agentSearchQuery.toLowerCase())
  )

  const agentRuns = store.runs
    .filter(r => r.agentId === selectedAgent?.id)
    .slice()
    .reverse()



  return (
    <div className="flex h-full w-full bg-[#09090b] text-zinc-100 overflow-hidden select-none">
      {/* ============================================================================ */}
      {/* BARRA VERTICAL ESQUERDA DE ÍCONES (Idêntica aos Prints 01, 02, 03 e 04!)     */}
      {/* ============================================================================ */}
      <aside className="w-11 shrink-0 h-full bg-[#09090b] border-r border-zinc-900 flex flex-col items-center py-2.5 gap-1.5 z-30">
        {[
          { id: 'agents' as PrimarySection, icon: Bot, title: 'Agentes' },
          { id: 'squads' as PrimarySection, icon: Users, title: 'Esquadrões' },
          { id: 'workflows' as PrimarySection, icon: Workflow, title: 'Fluxos de Trabalho' },
          { id: 'activity' as PrimarySection, icon: Activity, title: 'Atividade' }
        ].map(nav => {
          const Icon = nav.icon
          const isActive = activeSection === nav.id
          return (
            <button
              key={nav.id}
              type="button"
              onClick={() => {
                setActiveSection(nav.id)
                if (nav.id === 'squads') {
                  setSelectedTeamId('overview')
                }
              }}
              title={nav.title}
              className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
                isActive
                  ? 'bg-zinc-800/90 text-zinc-100 shadow-xs'
                  : 'text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900'
              }`}
            >
              <Icon className="w-4 h-4 stroke-[1.8]" />
            </button>
          )
        })}

        <div className="flex-1" />

        {/* Utilitários discretos na base do rail */}
        <button
          type="button"
          onClick={handleLoadDemoExamples}
          title="Carregar exemplos de demonstração"
          className="w-8 h-8 rounded-xl flex items-center justify-center text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900 transition-colors cursor-pointer"
        >
          <Sparkles className="w-4 h-4 stroke-[1.8]" />
        </button>

        <button
          type="button"
          onClick={() => setIsProjectsModalOpen(true)}
          title="Projetos & Itens de Conteúdo"
          className="w-8 h-8 rounded-xl flex items-center justify-center text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900 transition-colors cursor-pointer"
        >
          <Briefcase className="w-4 h-4 stroke-[1.8]" />
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveSection('agents')
            setIsAgentSettingsOpen(v => !v)
          }}
          title="Configurações do agente"
          className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors cursor-pointer ${
            isAgentSettingsOpen
              ? 'bg-zinc-800 text-zinc-100'
              : 'text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900'
          }`}
        >
          <Settings className="w-4 h-4 stroke-[1.8]" />
        </button>
      </aside>


      {/* Botão Pill Fixo no Topo: Notificação de Aprovações Pendentes em Segundo Plano */}
      {pendingApprovalRuns.length > 0 && (
        <div className="fixed top-3 right-6 z-50 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsApprovalDrawerOpen(v => !v)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#141416]/95 backdrop-blur-xl border border-amber-500/50 text-amber-300 hover:bg-zinc-850 hover:border-amber-400 transition-all shadow-2xl cursor-pointer"
          >
            <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="text-xs font-semibold">
              {pendingApprovalRuns.length} Aprovação{pendingApprovalRuns.length > 1 ? 'ões' : ''} Pendente{pendingApprovalRuns.length > 1 ? 's' : ''}
            </span>
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
          </button>
        </div>
      )}

      {/* Popover / Drawer Lateral Fixo de Aprovações Pendentes (Não invasivo) */}
      {isApprovalDrawerOpen && pendingApprovalRuns.length > 0 && (
        <aside
          onMouseDown={e => e.stopPropagation()}
          className="fixed top-12 right-6 w-96 max-h-[85vh] bg-[#141416]/98 backdrop-blur-2xl border border-amber-500/30 rounded-2xl shadow-2xl p-4 z-50 overflow-y-auto space-y-4 custom-chat-scrollbar animate-in fade-in slide-in-from-right-4 duration-200"
        >
          <div className="flex items-center justify-between border-b border-zinc-800 pb-2.5">
            <div className="flex items-center gap-2 text-xs font-semibold text-zinc-100">
              <span className="w-6 h-6 rounded-lg bg-amber-500/15 text-amber-400 flex items-center justify-center">
                <ShieldCheck className="w-3.5 h-3.5" />
              </span>
              <span>Aprovações de Fluxo Pendentes</span>
            </div>
            <button
              type="button"
              onClick={() => setIsApprovalDrawerOpen(false)}
              className="text-zinc-500 hover:text-zinc-200 p-1 rounded-lg hover:bg-zinc-800/60 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-3">
            {pendingApprovalRuns.map(pr => {
              const runWf = workflows.find(w => w.id === pr.workflowId)
              const approvalNode = runWf?.nodes.find(n => n.id === pr.pausedAtWorkflowNodeId)
              return (
                <div key={pr.id} className="p-3 bg-[#18181b] border border-zinc-800/80 rounded-xl space-y-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-zinc-200 truncate">{runWf?.name || 'Fluxo de Trabalho'}</span>
                    <span className="text-[10px] text-amber-400 font-mono bg-amber-950/40 px-1.5 py-0.5 rounded">
                      {approvalNode?.label || 'Aprovação'}
                    </span>
                  </div>

                  <div className="text-xs text-zinc-300 bg-[#121214] p-2 rounded-lg border border-zinc-800/60">
                    <div className="text-[10px] text-zinc-500 font-medium mb-1">Instrução:</div>
                    <p className="leading-relaxed">{approvalNode?.config?.approvalMessage || 'Confirmação solicitada antes de prosseguir com as entregas.'}</p>
                  </div>

                  {pr.draftContent && (
                    <div className="text-[11px] text-zinc-400 bg-[#121214] p-2 rounded-lg border border-zinc-800/40 max-h-24 overflow-y-auto custom-chat-scrollbar">
                      <div className="text-[10px] text-zinc-500 font-medium mb-0.5">Prévia da saída da etapa anterior:</div>
                      <p className="whitespace-pre-wrap">{pr.draftContent.slice(0, 240)}...</p>
                    </div>
                  )}

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      disabled={isExecuting}
                      onClick={() => handleDirectApproveWorkflowRun(pr)}
                      className="flex-1 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Aprovar e Continuar</span>
                    </button>
                    <button
                      type="button"
                      disabled={isExecuting}
                      onClick={() => handleDirectRejectWorkflowRun(pr)}
                      className="px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-rose-300 font-medium text-xs flex items-center justify-center gap-1 transition-colors cursor-pointer border border-zinc-700"
                    >
                      <X className="w-3.5 h-3.5" />
                      <span>Rejeitar</span>
                    </button>
                  </div>

                  <div className="text-right">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedWorkflowId(pr.workflowId || workflows[0].id)
                        setActiveSection('workflows')
                        setIsApprovalDrawerOpen(false)
                      }}
                      className="text-[10.5px] text-zinc-400 hover:text-zinc-200 hover:underline cursor-pointer"
                    >
                      Ver no Fluxo de Trabalho →
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </aside>
      )}
      {/* ============================================================================ */}
      {/* ÁREA DE CONTEÚDO PRINCIPAL                                                   */}
      {/* ============================================================================ */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* ========================================================================== */}
        {/* TELA 01 & 04: AGENTES + CHAT DIRETO + SIDEBAR DE CONFIGURAÇÕES DO AGENTE   */}
        {/* ========================================================================== */}
        {activeSection === 'agents' && (
          <div className="flex-1 flex overflow-hidden bg-[#111113]">
            {/* COLUNA ESQUERDA: LISTA DE AGENTES (Print 01 e Print 04) */}
            {isAgentListOpen && (
              <aside className="w-68 shrink-0 h-full bg-[#0c0c0e] border-r border-zinc-900/90 flex flex-col">
                {/* Topo da coluna: Seletor de Abas Agentes / Esquadrões */}
                <div className="h-11 px-2.5 flex items-center justify-between border-b border-zinc-900/80">
                  <div className="flex items-center p-0.5 bg-[#151518] rounded-xl border border-zinc-800/70">
                    <button
                      type="button"
                      onClick={() => {
                        setChatSidebarTab('agents')
                        setUseTeamDelegation(false)
                      }}
                      className={`px-2 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                        chatSidebarTab === 'agents'
                          ? 'bg-zinc-800 text-zinc-100 shadow-xs'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      Agentes
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setChatSidebarTab('squads')
                        setUseTeamDelegation(true)
                      }}
                      className={`px-2 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                        chatSidebarTab === 'squads'
                          ? 'bg-zinc-800 text-zinc-100 shadow-xs'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      Esquadrões
                    </button>
                  </div>

                  <div className="flex items-center gap-1 text-zinc-400">
                    {chatSidebarTab === 'agents' ? (
                      <button
                        type="button"
                        onClick={() => {
                          setNewAgentDraft(
                            generateAgentDraftFromPrompt(
                              'Agente para atividades rotineiras e propostas',
                              notes
                            ).draft
                          )
                          setIsNewAgentModalOpen(true)
                        }}
                        className="p-1 rounded-lg hover:bg-zinc-800/70 hover:text-zinc-100 cursor-pointer"
                        title="Criar novo agente"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setActiveSection('squads')}
                        className="p-1 rounded-lg hover:bg-zinc-800/70 hover:text-zinc-100 cursor-pointer"
                        title="Gerenciar esquadrões"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Campo Buscar contextual */}
                <div className="px-2.5 pt-2.5 pb-1.5">
                  <div className="relative flex items-center">
                    <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 pointer-events-none" />
                    <input
                      type="text"
                      value={chatSidebarTab === 'agents' ? agentSearchQuery : squadSearchQuery}
                      onChange={e => {
                        if (chatSidebarTab === 'agents') {
                          setAgentSearchQuery(e.target.value)
                        } else {
                          setSquadSearchQuery(e.target.value)
                        }
                      }}
                      placeholder={chatSidebarTab === 'agents' ? 'Buscar agente...' : 'Buscar esquadrão...'}
                      className="w-full bg-[#161618] border border-zinc-800/60 rounded-xl pl-8 pr-2.5 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-700"
                    />
                  </div>
                </div>

                {/* Conteúdo: Lista de Agentes ou Lista de Esquadrões */}
                {chatSidebarTab === 'agents' ? (
                  <div className="flex-1 overflow-y-auto px-2 py-1 space-y-0.5">
                    {filteredAgents.map(ag => {
                      const isSelected = !useTeamDelegation && selectedAgent?.id === ag.id
                      const lastRun = store.runs.find(r => r.agentId === ag.id)
                      const previewText = lastRun
                        ? getRunSummaryText(lastRun)
                        : ag.roleDescription || 'No messages yet'
                      const timeStr = lastRun
                        ? formatTimeShort(lastRun.updatedAt || lastRun.startedAt)
                        : formatTimeShort(ag.createdAt)

                      return (
                        <button
                          key={ag.id}
                          type="button"
                          onClick={() => {
                            setSelectedAgentId(ag.id)
                            setUseTeamDelegation(false)
                            const firstAgRun = store.runs.find(r => r.agentId === ag.id)
                            setSelectedRunId(firstAgRun?.id || null)
                          }}
                          className={`w-full text-left px-2.5 py-2.5 rounded-xl flex items-center gap-2.5 transition-colors cursor-pointer ${
                            isSelected
                              ? 'bg-[#1c1c20] text-zinc-100'
                              : 'hover:bg-[#151518] text-zinc-300'
                          }`}
                        >
                          <AgentIcon
                            variant={ag.icon}
                            state={ag.state === 'working' ? 'executing' : ag.state === 'waiting_user' ? 'attention' : 'waiting'}
                            size={36}
                            className="shrink-0 rounded-xl shadow-sm"
                          />

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-1">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className="text-xs font-semibold text-zinc-100 truncate">
                                  {ag.name}
                                </span>
                                {ag.workStyle.tone && (
                                  <span className="px-1.5 py-0.2 rounded bg-zinc-800/90 text-[10px] text-zinc-400 truncate max-w-[76px]">
                                    {ag.workStyle.tone}
                                  </span>
                                )}
                              </div>
                              <span className="text-[10px] text-zinc-500 shrink-0">{timeStr}</span>
                            </div>
                            <div className="text-[11px] text-zinc-500 truncate mt-0.5">
                              {previewText}
                            </div>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                ) : (
                  <div className="flex-1 overflow-y-auto px-2 py-1 space-y-1">
                    {filteredSquadsForChat.map(sq => {
                      const isSelected = useTeamDelegation && selectedTeamId === sq.id
                      const pipeline = sq.pipeline && sq.pipeline.length > 0 ? sq.pipeline : sq.nodes
                      return (
                        <button
                          key={sq.id}
                          type="button"
                          onClick={() => {
                            setSelectedTeamId(sq.id)
                            setUseTeamDelegation(true)
                            const leadId =
                              sq.coordinatorAgentId ||
                              sq.pipeline?.[0]?.agentId ||
                              sq.nodes[0]?.agentId ||
                              store.agents[0]?.id ||
                              ''
                            setSelectedAgentId(leadId)
                            setSelectedRunId(null)
                          }}
                          className={`w-full text-left p-2.5 rounded-xl flex items-center gap-2.5 transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-[#1c1c20] border border-[var(--accent)]/40 text-zinc-100 shadow-sm'
                              : 'hover:bg-[#151518] text-zinc-300 border border-transparent'
                          }`}
                        >
                          <div className="w-8 h-8 rounded-xl bg-zinc-800/90 border border-zinc-700/60 flex items-center justify-center text-zinc-200 shrink-0">
                            {renderDynamicIcon(sq.icon || 'Users', 'w-4 h-4 text-zinc-200')}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-1">
                              <span className="text-xs font-semibold text-zinc-100 truncate">{sq.name}</span>
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400 font-mono shrink-0">
                                {pipeline.length}
                              </span>
                            </div>
                            <div className="text-[11px] text-zinc-500 truncate mt-0.5">
                              {sq.objective || `${pipeline.length} especialistas na esteira`}
                            </div>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )}
              </aside>
            )}

            {/* CENTRO: CONVERSA DIRETA COM O AGENTE (Print 01 e Print 04) */}
            <div className="flex-1 flex flex-col overflow-hidden bg-[#111113]">
              {/* Topbar da conversa (Idêntica ao Print 01/04: Tab do Agente + "+" à esquerda; Modelo + Ícone Painel à direita) */}
              <header className="h-11 px-4 border-b border-zinc-900/90 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                  <button
                    type="button"
                    onClick={() => setIsAgentListOpen(v => !v)}
                    className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/60 cursor-pointer"
                    title="Alternar lista de agentes"
                  >
                    <PanelLeft className="w-3.5 h-3.5" />
                  </button>

                  {useTeamDelegation ? (
                    (() => {
                      const curSquad = teams.find(t => t.id === selectedTeamId) || teams[0]
                      const pipeline = curSquad?.pipeline || []
                      return (
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="flex items-center gap-2 bg-[#1b1b1f] border border-zinc-800/80 rounded-xl px-2.5 py-1">
                            <div className="w-4 h-4 text-[var(--accent)] shrink-0 flex items-center justify-center">
                              {renderDynamicIcon(curSquad?.icon || 'Users', 'w-3.5 h-3.5 text-[var(--accent)]')}
                            </div>
                            <span className="text-xs font-semibold text-zinc-100 truncate max-w-[150px]">
                              {curSquad?.name || 'Esquadrão'}
                            </span>
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-[var(--accent)]/15 border border-[var(--accent)]/30 text-[var(--accent)] font-semibold">
                              Esquadrão
                            </span>
                          </div>

                          {/* Miniatura dos especialistas da esteira */}
                          <div className="hidden lg:flex items-center gap-1 text-[11px] text-zinc-400">
                            {pipeline.slice(0, 3).map((p, idx) => {
                              const ag = store.agents.find(a => a.id === p.agentId)
                              return (
                                <React.Fragment key={p.id || idx}>
                                  <span className="text-zinc-300 truncate max-w-[85px]" title={ag?.name}>
                                    {ag?.name || 'Agente'}
                                  </span>
                                  {idx < Math.min(2, pipeline.length - 1) && (
                                    <span className="text-zinc-600 text-[10px]">→</span>
                                  )}
                                </React.Fragment>
                              )
                            })}
                            {pipeline.length > 3 && (
                              <span className="text-zinc-500 font-mono text-[10px]">+{pipeline.length - 3}</span>
                            )}
                          </div>
                        </div>
                      )
                    })()
                  ) : (
                    selectedAgent && (
                      <div className="flex items-center gap-1.5 bg-[#1b1b1f] border border-zinc-800/80 rounded-xl px-2 py-1">
                        <AgentIcon
                          variant={selectedAgent.icon}
                          state={selectedAgent.state === 'working' ? 'executing' : selectedAgent.state === 'waiting_user' ? 'attention' : 'waiting'}
                          size={18}
                          className="shrink-0 rounded-md"
                        />
                        <span className="text-xs font-medium text-zinc-100 truncate max-w-[160px]">
                          {selectedAgent.name}
                        </span>
                      </div>
                    )
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      setSelectedRunId(null)
                      setPromptInput('')
                    }}
                    className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/60 cursor-pointer"
                    title="Nova conversa com este agente"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Direita: Dropdowns Customizados (Cliente + Modelo/IA + Toggle Configurações) */}
                <div className="flex items-center gap-2">
                  {/* Dropdown Customizado de Projeto & Item de Conteúdo */}
                  <div className="relative" ref={projectDropdownRef}>
                    <button
                      type="button"
                      onClick={() => {
                        setIsProjectDropdownOpen(v => !v)
                        setIsModelDropdownOpen(false)
                      }}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-[#18181b] border border-zinc-800/80 hover:border-zinc-700 text-xs text-zinc-200 transition-colors cursor-pointer"
                      title="Contexto de Projeto & Item de Conteúdo"
                    >
                      <Briefcase className="w-3.5 h-3.5 text-zinc-400" />
                      <span className="truncate max-w-[130px]">
                        {(() => {
                          const activeProj = resolveActiveContext(selectedProjectId)
                          if (!activeProj) return 'Contexto: Automático'
                          return activeProj.displayName
                        })()}
                      </span>
                      <ChevronDown className="w-3 h-3 text-zinc-500" />
                    </button>

                    {isProjectDropdownOpen && (
                      <div
                        onMouseLeave={() => setHoveredCategory(null)}
                        className="absolute right-0 top-full mt-1.5 w-64 bg-[#18181b] border border-zinc-800 rounded-2xl shadow-2xl p-2 z-40 space-y-1.5 animate-in fade-in zoom-in-95 duration-100"
                      >
                        {/* Campo de Busca Rápida Unificada */}
                        <div className="relative flex items-center px-1">
                          <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 pointer-events-none" />
                          <input
                            type="text"
                            autoFocus
                            autoComplete="off"
                            value={contextSearchQuery}
                            onChange={e => setContextSearchQuery(e.target.value)}
                            placeholder="Buscar projetos ou itens..."
                            className="w-full bg-[#121215] border border-zinc-800 rounded-xl pl-8 pr-7 py-1 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-700"
                          />
                          {contextSearchQuery && (
                            <button
                              type="button"
                              onClick={() => setContextSearchQuery('')}
                              className="absolute right-2 text-zinc-500 hover:text-zinc-300 p-0.5 cursor-pointer"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          )}
                        </div>

                        {/* Se estiver buscando: exibe lista filtrada direta */}
                        {contextSearchQuery.trim() ? (
                          <div className="max-h-56 overflow-y-auto space-y-0.5 pr-0.5 custom-scrollbar">
                            {allUnifiedItems
                              .filter(p => {
                                const q = contextSearchQuery.toLowerCase()
                                return (
                                  p.displayName.toLowerCase().includes(q) ||
                                  p.groupName.toLowerCase().includes(q) ||
                                  (p.description && p.description.toLowerCase().includes(q))
                                )
                              })
                              .map(p => {
                                const isSel = selectedProjectId === p.id
                                return (
                                  <button
                                    key={p.id}
                                    type="button"
                                    onClick={() => {
                                      setSelectedProjectId(p.id)
                                      setIsProjectDropdownOpen(false)
                                      setContextSearchQuery('')
                                      setHoveredCategory(null)
                                    }}
                                    className={`w-full text-left px-2.5 py-1.5 rounded-xl text-xs flex items-center justify-between cursor-pointer ${
                                      isSel
                                        ? 'bg-zinc-800 text-white font-medium'
                                        : 'text-zinc-300 hover:bg-zinc-800/50'
                                    }`}
                                  >
                                    <div className="min-w-0 pr-2">
                                      <div className="truncate font-medium">{p.displayName}</div>
                                      <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 mt-0.5">
                                        <span>{p.groupName}</span>
                                        <span className="px-1 rounded bg-zinc-800 text-zinc-400">
                                          {p.category === 'item' ? 'Item' : 'Projeto'}
                                        </span>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                      {p.briefingNoteIds.length > 0 && (
                                        <span className="text-[10px] text-zinc-500">{p.briefingNoteIds.length} notas</span>
                                      )}
                                      {isSel && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                                    </div>
                                  </button>
                                )
                              })}
                          </div>
                        ) : (
                          <>
                            {/* Opção Automático */}
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedProjectId('')
                                setIsProjectDropdownOpen(false)
                                setHoveredCategory(null)
                              }}
                              className={`w-full text-left px-2.5 py-1.5 rounded-xl text-xs flex items-center justify-between cursor-pointer ${
                                !selectedProjectId
                                  ? 'bg-zinc-800/90 text-white font-medium'
                                  : 'text-zinc-300 hover:bg-zinc-800/50'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                                <span>Automático (detectado no pedido)</span>
                              </div>
                              {!selectedProjectId && <Check className="w-3.5 h-3.5 text-zinc-200" />}
                            </button>

                            <div className="border-t border-zinc-800/70 my-1" />

                            {/* Menu 1: Itens (Clientes, Produtos, etc.) - ACIMA */}
                            <div
                              onMouseEnter={() => setHoveredCategory('item')}
                              onClick={() => setHoveredCategory(h => (h === 'item' ? null : 'item'))}
                              className={`flex items-center justify-between px-2.5 py-2 rounded-xl text-xs cursor-pointer transition-colors ${
                                hoveredCategory === 'item'
                                  ? 'bg-zinc-800 text-white font-medium'
                                  : 'text-zinc-300 hover:bg-zinc-800/50'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <Tag className="w-3.5 h-3.5 text-zinc-400" />
                                <span>Itens (Clientes, etc.)</span>
                              </div>
                              <div className="flex items-center gap-1.5 text-zinc-500">
                                <span className="text-[10px] font-mono">{unifiedItemItems.length}</span>
                                <ChevronRight className="w-3.5 h-3.5 text-zinc-400" />
                              </div>
                            </div>

                            {/* Menu 2: Projetos - ABAIXO */}
                            <div
                              onMouseEnter={() => setHoveredCategory('project')}
                              onClick={() => setHoveredCategory(h => (h === 'project' ? null : 'project'))}
                              className={`flex items-center justify-between px-2.5 py-2 rounded-xl text-xs cursor-pointer transition-colors ${
                                hoveredCategory === 'project'
                                  ? 'bg-zinc-800 text-white font-medium'
                                  : 'text-zinc-300 hover:bg-zinc-800/50'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <Briefcase className="w-3.5 h-3.5 text-zinc-400" />
                                <span>Projetos</span>
                              </div>
                              <div className="flex items-center gap-1.5 text-zinc-500">
                                <span className="text-[10px] font-mono">{unifiedProjectItems.length}</span>
                                <ChevronRight className="w-3.5 h-3.5 text-zinc-400" />
                              </div>
                            </div>
                          </>
                        )}

                        <div className="border-t border-zinc-800/80 my-1 pt-1 shrink-0" />
                        <button
                          type="button"
                          onClick={() => {
                            setIsProjectDropdownOpen(false)
                            setHoveredCategory(null)
                            setIsProjectsModalOpen(true)
                          }}
                          className="w-full text-left px-2.5 py-1.5 rounded-xl text-xs text-zinc-200 hover:bg-zinc-800/60 flex items-center gap-2 cursor-pointer shrink-0"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Gerenciar projetos e itens</span>
                        </button>

                        {/* SUBMENU FLUTUANTE (FLYOUT) AO MOVER O MOUSE OU CLICAR */}
                        {hoveredCategory && !contextSearchQuery.trim() && (
                          <div
                            onMouseEnter={() => setHoveredCategory(hoveredCategory)}
                            className="absolute right-[calc(100%-2px)] top-0 w-80 bg-[#18181b] border border-zinc-800 rounded-2xl shadow-2xl p-2 z-50 animate-in fade-in zoom-in-95 duration-100 max-h-96 overflow-hidden flex flex-col pointer-events-auto"
                          >
                            <div className="flex items-center justify-between px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400 shrink-0">
                              <span>
                                {hoveredCategory === 'item' ? 'Itens Cadastrados (Clientes, etc.)' : 'Projetos Cadastrados'}
                              </span>
                              <span className="text-zinc-500 font-mono">
                                {hoveredCategory === 'item' ? unifiedItemItems.length : unifiedProjectItems.length} {hoveredCategory === 'item' ? 'itens' : 'projetos'}
                              </span>
                            </div>

                            <div className="overflow-y-auto space-y-2 flex-1 pr-0.5 mt-1 max-h-80 custom-scrollbar">
                              {(() => {
                                const currentGrouped =
                                  hoveredCategory === 'item' ? groupedContentItems : groupedProjectItems
                                const keys = Object.keys(currentGrouped)
                                if (keys.length === 0) {
                                  return (
                                    <div className="text-[11px] text-zinc-500 px-2 py-6 text-center">
                                      Nenhum {hoveredCategory === 'item' ? 'item' : 'projeto'} cadastrado ainda.
                                    </div>
                                  )
                                }
                                return keys.map(groupName => {
                                  const items = currentGrouped[groupName] || []
                                  return (
                                    <div key={groupName} className="space-y-0.5">
                                      <div className="flex items-center justify-between px-2 py-1 text-[10px] font-medium text-zinc-500 bg-zinc-900/70 rounded-lg">
                                        <span className="truncate flex items-center gap-1.5 font-semibold text-zinc-400">
                                          {hoveredCategory === 'item' ? (
                                            <Tag className="w-3 h-3 text-zinc-400" />
                                          ) : (
                                            <Folder className="w-3 h-3 text-zinc-400" />
                                          )}
                                          {groupName}
                                        </span>
                                        <span className="text-[9px] text-zinc-500 font-mono">{items.length}</span>
                                      </div>
                                      {items.map(p => {
                                        const isSel = selectedProjectId === p.id
                                        return (
                                          <button
                                            key={p.id}
                                            type="button"
                                            onClick={() => {
                                              setSelectedProjectId(p.id)
                                              setIsProjectDropdownOpen(false)
                                              setHoveredCategory(null)
                                            }}
                                            className={`w-full text-left pl-3.5 pr-2 py-1.5 rounded-xl text-xs flex items-center justify-between cursor-pointer transition-colors ${
                                              isSel
                                                ? 'bg-zinc-800/90 text-white font-medium'
                                                : 'text-zinc-300 hover:bg-zinc-800/50'
                                            }`}
                                          >
                                            <div className="min-w-0 pr-2">
                                              <div className="truncate font-medium">{p.displayName}</div>
                                              {p.description && (
                                                <div className="text-[10px] text-zinc-500 truncate">
                                                  {p.description}
                                                </div>
                                              )}
                                            </div>
                                            <div className="flex items-center gap-1.5 shrink-0">
                                              {p.briefingNoteIds.length > 0 && (
                                                <span className="text-[10px] text-zinc-500">
                                                  {p.briefingNoteIds.length} {p.briefingNoteIds.length === 1 ? 'nota' : 'notas'}
                                                </span>
                                              )}
                                              {isSel && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                                            </div>
                                          </button>
                                        )
                                      })}
                                    </div>
                                  )
                                })
                              })()}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Dropdown Customizado de Modelo / IA */}
                  <div className="relative" ref={modelDropdownRef}>
                    <button
                      type="button"
                      onClick={() => {
                        setIsModelDropdownOpen(v => !v)
                        setIsProjectDropdownOpen(false)
                      }}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-[#18181b] border border-zinc-800/80 hover:border-zinc-700 text-xs text-zinc-300 transition-colors cursor-pointer"
                      title="Modelo de IA e raciocínio"
                    >
                      <Globe className="w-3.5 h-3.5 text-zinc-400" />
                      <span className="font-medium text-zinc-200 truncate max-w-[130px]">
                        {selectedAgent?.aiConfig?.model || activeModelName}
                      </span>
                      <span className="text-zinc-500">· {reasoningEffort}</span>
                      <ChevronDown className="w-3 h-3 text-zinc-500" />
                    </button>

                    {isModelDropdownOpen && (
                      <div
                        className="absolute right-0 top-full mt-1.5 w-64 bg-[#18181b] border border-zinc-800 rounded-2xl shadow-2xl p-2 z-40 space-y-2 animate-in fade-in zoom-in-95 duration-100"
                      >
                        <div className="px-1 text-xs">
                          <div className="text-[10px] uppercase font-semibold text-zinc-500">IA Conectada</div>
                          <div className="flex items-center justify-between text-zinc-200 font-medium mt-0.5">
                            <span className="capitalize">{activeProviderName}</span>
                            <span
                              className={`w-2 h-2 rounded-full ${
                                hasActiveKey ? 'bg-emerald-400' : 'bg-amber-400'
                              }`}
                            />
                          </div>
                          <div className="text-[11px] text-zinc-400 font-mono truncate mt-0.5">
                            {selectedAgent?.aiConfig?.model || activeModelName}
                          </div>
                        </div>

                        <div className="border-t border-zinc-800 pt-1.5">
                          <div className="text-[10px] text-zinc-500 uppercase font-semibold px-1 mb-1">
                            Raciocínio
                          </div>
                          <div className="grid grid-cols-3 gap-1 bg-[#131316] p-1 rounded-xl">
                            {(['Baixo', 'Médio', 'Alto'] as const).map(effort => {
                              const isSel = reasoningEffort === effort
                              const temp = effort === 'Baixo' ? 0.2 : effort === 'Médio' ? 0.5 : 0.8
                              return (
                                <button
                                  key={effort}
                                  type="button"
                                  onClick={() => {
                                    setReasoningEffort(effort)
                                    onUpdateStore(
                                      updateAgentProfileWithVersion(store, {
                                        ...selectedAgent,
                                        aiConfig: {
                                          ...selectedAgent.aiConfig,
                                          temperature: temp
                                        }
                                      })
                                    )
                                  }}
                                  className={`py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                                    isSel ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white'
                                  }`}
                                >
                                  {effort}
                                </button>
                              )
                            })}
                          </div>
                        </div>

                        <div className="border-t border-zinc-800 pt-1">
                          <button
                            type="button"
                            onClick={() => {
                              setIsModelDropdownOpen(false)
                              setAiSettingsInitialTab('models')
                              setIsAiSettingsModalOpen(true)
                            }}
                            className="w-full text-left px-2.5 py-1.5 rounded-xl hover:bg-zinc-800 text-xs text-zinc-200 flex items-center justify-between cursor-pointer"
                          >
                            <span>Configurações de IA do Pyrite</span>
                            <ExternalLink className="w-3.5 h-3.5 text-zinc-400" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsAgentSettingsOpen(v => !v)}
                    className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                      isAgentSettingsOpen
                        ? 'bg-zinc-800 text-zinc-100'
                        : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60'
                    }`}
                    title="Configurações do agente"
                  >
                    <PanelRight className="w-4 h-4" />
                  </button>
                </div>
              </header>

              {/* Banner sutil de status se houver */}
              {statusBanner && (
                <div className="mx-6 mt-3 px-3.5 py-2 rounded-xl bg-[#18181b] border border-zinc-800 flex items-center justify-between text-xs text-zinc-200">
                  <span>{statusBanner.text}</span>
                  <button
                    type="button"
                    onClick={() => setStatusBanner(null)}
                    className="text-zinc-500 hover:text-zinc-200 p-0.5 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Banner de Esquadrão Ativo no Chat */}
              {useTeamDelegation && (() => {
                const activeSquad = teams.find(t => t.id === selectedTeamId) || teams[0]
                const stepCount = activeSquad?.pipeline?.length || activeSquad?.nodes.length || 0
                return (
                  <div className="mx-6 mt-3 px-4 py-2.5 rounded-2xl bg-[var(--accent)]/10 border border-[var(--accent)]/30 flex items-center justify-between gap-3 text-xs shadow-md">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-6 h-6 rounded-lg bg-[var(--accent)]/20 border border-[var(--accent)]/30 flex items-center justify-center text-[var(--accent)] shrink-0">
                        <Sparkles className="w-3.5 h-3.5" />
                      </div>
                      <div className="truncate">
                        <span className="font-semibold text-zinc-100">Esquadrão Ativo: {activeSquad?.name}</span>
                        <span className="text-zinc-400 text-[11px] ml-2">
                          ({stepCount} especialistas em esteira colaborativa)
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setActiveSection('squads')}
                        className="text-[11px] text-[var(--accent)] hover:underline px-2 py-1 transition-colors shrink-0 cursor-pointer"
                      >
                        Ver Esteira →
                      </button>
                      <button
                        type="button"
                        onClick={() => setUseTeamDelegation(false)}
                        className="text-[11px] text-zinc-400 hover:text-zinc-200 px-2 py-1 rounded-lg hover:bg-zinc-800 transition-colors shrink-0 cursor-pointer"
                        title="Voltar ao modo agente individual"
                      >
                        Alternar para Agente
                      </button>
                    </div>
                  </div>
                )
              })()}

              {/* Área de Mensagens Limpa (Idêntica ao Print 01) */}
              <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5">
                {selectedAgent && (
                  <>
                    {/* Data centralizada */}
                    <div className="text-center text-[11px] text-zinc-500">
                      Hoje {formatTimeShort(selectedAgent.createdAt || Date.now())}
                    </div>

                    {/* Mensagem inicial de papel do agente (igual ao Print 01: "Your ongoing role is: ...") */}
                    <div className="flex justify-end">
                      <div className="max-w-xl bg-[#1f1f23] text-zinc-100 rounded-2xl px-4 py-2.5 text-xs leading-relaxed">
                        Your ongoing role is: {selectedAgent.roleDescription || selectedAgent.workStyle.tone}
                      </div>
                    </div>

                    <div className="flex flex-col items-start gap-1">
                      <div className="max-w-xl bg-[#18181b] text-zinc-200 rounded-2xl px-4 py-2.5 text-xs leading-relaxed">
                        Entendido. Vou ajudar com {selectedAgent.roleDescription.toLowerCase() || 'suas solicitações'}.
                      </div>
                      <div className="flex items-center gap-2.5 px-1 text-zinc-500 text-[10px]">
                        <Copy className="w-3 h-3 hover:text-zinc-300 cursor-pointer" />
                        <Smile className="w-3 h-3 hover:text-zinc-300 cursor-pointer" />
                        <CornerUpLeft className="w-3 h-3 hover:text-zinc-300 cursor-pointer" />
                        <span>{formatTimeShort(selectedAgent.createdAt || Date.now())}</span>
                      </div>
                    </div>

                    {/* Histórico real de conversas / execuções deste agente */}
                    {agentRuns.map(run => {
                      const runOp = run.changeSet?.operations[0]
                      const runCommitted = runOp?.status === 'committed'
                      const canApprove =
                        !run.calculation ||
                        (run.calculation.missingFields.length === 0 &&
                          run.calculation.conflicts.every(c => c.resolution !== 'unresolved') &&
                          run.calculation.fixedSectionViolations.length === 0)
                      const isDraftExpanded = expandedDraftRunIds[run.id] ?? (run.id === activeRun?.id)

                      return (
                        <div key={run.id} className="space-y-4">
                          {/* Bolha do Usuário à direita */}
                          <div className="flex justify-end">
                            <div className="max-w-xl bg-[#1f1f23] text-zinc-100 rounded-2xl px-4 py-2.5 text-xs leading-relaxed">
                              {run.prompt}
                            </div>
                          </div>

                          {/* Bolha do Agente à esquerda */}
                          <div className="flex flex-col items-start gap-1.5">
                            <div className="max-w-2xl w-full bg-[#18181b] border border-zinc-800/70 text-zinc-200 rounded-2xl p-4 text-xs space-y-3">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-medium text-zinc-100">
                                  {getRunSummaryText(run)}
                                </span>
                                {run.calculation && (
                                  <span className="px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-200 font-semibold text-[11px] shrink-0">
                                    Total: {formatCentsBRL(run.calculation.netTotalCents)}
                                  </span>
                                )}
                              </div>

                              {/* Se o agente estiver aguardando respostas obrigatórias */}
                              {run.clarifyingQuestions.length > 0 && (
                                <div className="p-3 rounded-xl bg-[#121215] border border-zinc-800 space-y-2.5">
                                  <div className="text-[11px] font-semibold text-amber-300">
                                    Responda para concluir a entrega:
                                  </div>
                                  {run.clarifyingQuestions.map((qText: string, qIdx: number) => {
                                    const qKey = `q_${qIdx}`
                                    return (
                                      <div key={qKey} className="space-y-1">
                                        <label className="block text-[11px] text-zinc-300">
                                          {qText}
                                        </label>
                                        <input
                                          type="text"
                                          value={
                                            answerInputs[qKey] ?? run.userAnswers?.[qKey] ?? ''
                                          }
                                          onChange={e =>
                                            setAnswerInputs(prev => ({
                                              ...prev,
                                              [qKey]: e.target.value
                                            }))
                                          }
                                          placeholder="Digite sua resposta..."
                                          className="w-full bg-[#18181b] border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-zinc-600"
                                        />
                                      </div>
                                    )
                                  })}
                                  <button
                                    type="button"
                                    disabled={isExecuting}
                                    onClick={() =>
                                      handleRunAgent({
                                        isTest: run.isTestRun,
                                        existingRunToUpdate: run
                                      })
                                    }
                                    className="px-3 py-1.5 rounded-lg bg-zinc-100 hover:bg-white text-zinc-950 font-semibold text-xs cursor-pointer"
                                  >
                                    Enviar respostas e atualizar
                                  </button>
                                </div>
                              )}

                              {/* Se houver conflito de preços entre fontes */}
                              {run.calculation && run.calculation.conflicts.length > 0 && (
                                <div className="p-3 rounded-xl bg-[#121215] border border-zinc-800 space-y-2">
                                  <div className="text-[11px] font-semibold text-rose-300">
                                    Divergência entre notas vinculadas — escolha qual valor aplicar:
                                  </div>
                                  {run.calculation.conflicts.map(conf => (
                                    <div
                                      key={conf.id}
                                      className="flex flex-wrap items-center justify-between gap-2 text-[11px] bg-[#18181b] p-2 rounded-lg"
                                    >
                                      <span className="text-zinc-200 font-medium">
                                        {conf.serviceKey} ({conf.field})
                                      </span>
                                      <div className="flex items-center gap-1.5">
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setConflictChoices(prev => ({
                                              ...prev,
                                              [conf.id]: {
                                                chosenValue: conf.valueA,
                                                chosenPriceCents: conf.priceACents || 0
                                              }
                                            }))
                                          }
                                          className={`px-2 py-1 rounded text-[11px] border cursor-pointer ${
                                            conflictChoices[conf.id]?.chosenValue === conf.valueA
                                              ? 'border-white bg-zinc-800 text-white'
                                              : 'border-zinc-800 text-zinc-400'
                                          }`}
                                        >
                                          {conf.sourceA}: {conf.valueA}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setConflictChoices(prev => ({
                                              ...prev,
                                              [conf.id]: {
                                                chosenValue: conf.valueB,
                                                chosenPriceCents: conf.priceBCents || 0
                                              }
                                            }))
                                          }
                                          className={`px-2 py-1 rounded text-[11px] border cursor-pointer ${
                                            conflictChoices[conf.id]?.chosenValue === conf.valueB
                                              ? 'border-white bg-zinc-800 text-white'
                                              : 'border-zinc-800 text-zinc-400'
                                          }`}
                                        >
                                          {conf.sourceB}: {conf.valueB}
                                        </button>
                                      </div>
                                    </div>
                                  ))}
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleRunAgent({
                                        isTest: run.isTestRun,
                                        existingRunToUpdate: run
                                      })
                                    }
                                    className="px-3 py-1.5 rounded-lg bg-zinc-100 hover:bg-white text-zinc-950 font-semibold text-xs cursor-pointer"
                                  >
                                    Recalcular com valor escolhido
                                  </button>
                                </div>
                              )}

                              {/* Documento gerado expansível */}
                              {run.draftContent && (
                                <div className="border-t border-zinc-800/80 pt-2.5">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setExpandedDraftRunIds(prev => ({
                                        ...prev,
                                        [run.id]: !isDraftExpanded
                                      }))
                                    }
                                    className="flex items-center gap-1.5 text-[11px] text-zinc-400 hover:text-zinc-200 mb-2 cursor-pointer"
                                  >
                                    <FileText className="w-3.5 h-3.5" />
                                    <span>
                                      {isDraftExpanded
                                        ? 'Ocultar prévia do documento'
                                        : 'Ver documento completo'}
                                    </span>
                                  </button>

                                  {isDraftExpanded && (
                                    <div className="max-h-80 overflow-y-auto rounded-xl bg-[#121215] border border-zinc-800/80 p-3.5">
                                      <MarkdownRenderer
                                        content={run.draftContent}
                                        onNavigate={title => {
                                          const found = notes.find(
                                            n => n.title.toLowerCase() === title.toLowerCase()
                                          )
                                          if (found) onOpenNote(found.id)
                                        }}
                                      />
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* Ações de entrega discretas */}
                              {runOp && (
                                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-zinc-800/70">
                                  <span className="text-[11px] text-zinc-400">
                                    Destino:{' '}
                                    <strong className="text-zinc-200">
                                      {runOp.targetFolder}/{runOp.targetTitle}
                                    </strong>
                                  </span>
                                  <div className="flex items-center gap-2">
                                    {runCommitted && runOp.commitReceipt?.noteId ? (
                                      <button
                                        type="button"
                                        onClick={() => onOpenNote(runOp.commitReceipt!.noteId!)}
                                        className="px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-300 text-[11px] font-medium hover:bg-emerald-500/25 cursor-pointer"
                                      >
                                        Abrir nota no cofre
                                      </button>
                                    ) : (
                                      <>
                                        <button
                                          type="button"
                                          onClick={() => handleCommitDeliverable(run, false)}
                                          className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[11px] cursor-pointer"
                                        >
                                          Salvar rascunho
                                        </button>
                                        <button
                                          type="button"
                                          disabled={!canApprove}
                                          onClick={() => handleCommitDeliverable(run, true)}
                                          className="px-3 py-1 rounded-lg bg-zinc-100 hover:bg-white text-zinc-950 font-semibold text-[11px] disabled:opacity-40 cursor-pointer"
                                        >
                                          Aprovar e salvar no cofre
                                        </button>
                                      </>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* Barra inferior de ícones da mensagem (Idêntica ao Print 01!) */}
                            <div className="flex items-center gap-3 px-1 text-zinc-500 text-[10px]">
                              <button
                                type="button"
                                onClick={() =>
                                  navigator.clipboard?.writeText(
                                    run.draftContent || getRunSummaryText(run)
                                  )
                                }
                                className="hover:text-zinc-300 cursor-pointer"
                                title="Copiar resposta"
                              >
                                <Copy className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedStepsRunIds(prev => ({
                                    ...prev,
                                    [run.id]: !prev[run.id]
                                  }))
                                }
                                className="hover:text-zinc-300 cursor-pointer"
                                title="Ver etapas e fontes consultadas"
                              >
                                <GitBranch className="w-3 h-3" />
                              </button>
                              <span>{formatTimeShort(run.updatedAt || run.startedAt)}</span>
                            </div>

                            {expandedStepsRunIds[run.id] && (
                              <div className="max-w-xl bg-[#141417] border border-zinc-800/80 rounded-xl p-2.5 text-[11px] text-zinc-400 space-y-1">
                                {run.subagentSteps.map(st => (
                                  <div
                                    key={st.id}
                                    className="flex items-center justify-between gap-3"
                                  >
                                    <span>• {st.title}</span>
                                    <span className="text-zinc-500 truncate max-w-[220px]">
                                      {st.summary}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Linha de evento centralizada quando uma entrega foi gravada (igual ao "Rotina criada · Nova Rotina 18:23" do Print 01!) */}
                          {run.artifacts.map(art => (
                            <div
                              key={art.id}
                              onClick={() => art.noteId && onOpenNote(art.noteId)}
                              className="flex items-center justify-center gap-1.5 text-[11px] text-zinc-500 hover:text-zinc-300 cursor-pointer py-1"
                            >
                              <span>Entrega criada</span>
                              <FileText className="w-3 h-3 text-zinc-400" />
                              <span className="text-zinc-300 font-medium">{art.title}</span>
                              <span>{formatTimeShort(art.createdAt)}</span>
                            </div>
                          ))}
                        </div>
                      )
                    })}
                  </>
                )}
              </div>

              {/* COMPOSER PÍLULA INFERIOR (Idêntico ao Print 01 e Print 04: "+ | Mensagem para Pessoal | mic | ↑") */}
              <div className="px-6 pb-4 pt-1 shrink-0 relative" ref={composerPlusRef}>
                {/* Notas anexadas a este envio */}
                {extraNoteIds.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap mb-2 px-2">
                    {extraNoteIds.map(nid => {
                      const n = notes.find(x => x.id === nid)
                      if (!n) return null
                      return (
                        <span
                          key={nid}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-zinc-800 text-[11px] text-zinc-200"
                        >
                          <FileText className="w-3 h-3 text-zinc-400" />
                          <span>{n.title}</span>
                          <button
                            type="button"
                            onClick={() =>
                              setExtraNoteIds(prev => prev.filter(id => id !== nid))
                            }
                            className="text-zinc-400 hover:text-white cursor-pointer"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      )
                    })}
                  </div>
                )}

                {/* Menu Popover do botão "+" no Composer com Busca Instantânea */}
                {isComposerPlusOpen && (
                  <div
                    className="absolute bottom-16 left-6 w-80 bg-[#18181b] border border-zinc-800 rounded-2xl shadow-2xl p-2.5 z-40 space-y-2 animate-in fade-in zoom-in-95 duration-100"
                  >
                    <div className="flex items-center justify-between px-1">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                        Anexar Nota ao Pedido
                      </span>
                      <button
                        type="button"
                        onClick={() => setIsComposerPlusOpen(false)}
                        className="text-zinc-500 hover:text-zinc-300 p-0.5 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Campo de Busca Rápida (Igual Mover para...) */}
                    <div className="relative flex items-center">
                      <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 pointer-events-none" />
                      <input
                        type="text"
                        autoFocus
                        value={composerNoteSearch}
                        onChange={e => setComposerNoteSearch(e.target.value)}
                        placeholder="Buscar nota por título ou pasta..."
                        className="w-full bg-[#121214] border border-zinc-800 rounded-xl pl-8 pr-7 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-700"
                      />
                      {composerNoteSearch && (
                        <button
                          type="button"
                          onClick={() => setComposerNoteSearch('')}
                          className="absolute right-2 text-zinc-500 hover:text-zinc-300 cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>

                    <div className="max-h-52 overflow-y-auto space-y-0.5 pr-0.5">
                      {notes
                        .filter(n => {
                          const q = composerNoteSearch.toLowerCase().trim()
                          if (!q) return true
                          return (
                            n.title.toLowerCase().includes(q) ||
                            (n.folder && n.folder.toLowerCase().includes(q))
                          )
                        })
                        .map(n => {
                          const isAlreadyAttached = extraNoteIds.includes(n.id)
                          return (
                            <button
                              key={n.id}
                              type="button"
                              onClick={() => {
                                setExtraNoteIds(prev =>
                                  prev.includes(n.id)
                                    ? prev.filter(id => id !== n.id)
                                    : [...prev, n.id]
                                )
                              }}
                              className={`w-full text-left px-2.5 py-1.5 rounded-xl text-xs flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                                isAlreadyAttached
                                  ? 'bg-zinc-800 text-white font-medium'
                                  : 'text-zinc-300 hover:bg-zinc-800/50'
                              }`}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <FileText className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                                <span className="truncate">{n.title}</span>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                {n.folder && (
                                  <span className="text-[10px] text-zinc-500 max-w-[80px] truncate">
                                    {n.folder}
                                  </span>
                                )}
                                {isAlreadyAttached && (
                                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                                )}
                              </div>
                            </button>
                          )
                        })}
                    </div>

                    <div className="border-t border-zinc-800 pt-1.5">
                      <label className="flex items-center gap-2 px-1 text-xs text-zinc-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={useTeamDelegation}
                          onChange={e => setUseTeamDelegation(e.target.checked)}
                          className="rounded bg-zinc-800 border-zinc-700 text-emerald-500"
                        />
                        <span>Acionar Esquadrão em esteira colaborativa</span>
                      </label>
                    </div>
                  </div>
                )}

                <div className="bg-[#18181b] border border-zinc-800/90 rounded-full px-2.5 py-1.5 flex items-center gap-2.5 shadow-lg">
                  <button
                    type="button"
                    onClick={() => setIsComposerPlusOpen(v => !v)}
                    className="w-7 h-7 rounded-full bg-zinc-800/90 hover:bg-zinc-700 text-zinc-300 flex items-center justify-center shrink-0 transition-colors cursor-pointer"
                    title="Anexar nota do cofre ou opções"
                  >
                    <Plus className="w-4 h-4" />
                  </button>

                  <input
                    type="text"
                    value={promptInput}
                    onChange={e => setPromptInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        handleRunAgent({ isTest: false })
                      }
                    }}
                    placeholder={`Mensagem para ${selectedAgent?.name || 'Agente'}`}
                    className="flex-1 bg-transparent text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none"
                  />

                  <button
                    type="button"
                    onClick={toggleSpeechRecognition}
                    className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition-colors cursor-pointer ${
                      isListening
                        ? 'bg-rose-500/20 text-rose-400 animate-pulse'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                    title={isListening ? 'Ouvindo... Clique para parar' : 'Ditado de voz (pt-BR)'}
                  >
                    <Mic className="w-3.5 h-3.5" />
                  </button>

                  {isExecuting ? (
                    <button
                      type="button"
                      onClick={handleCancelActiveExecution}
                      className="w-7 h-7 rounded-full bg-rose-500 text-white flex items-center justify-center shrink-0 cursor-pointer"
                      title="Parar execução"
                    >
                      <StopCircle className="w-4 h-4" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={!promptInput.trim()}
                      onClick={() => handleRunAgent({ isTest: false })}
                      className="w-7 h-7 rounded-full bg-zinc-100 hover:bg-white text-zinc-950 disabled:opacity-30 flex items-center justify-center shrink-0 transition-all cursor-pointer"
                      title="Enviar mensagem"
                    >
                      <ArrowUp className="w-4 h-4 stroke-[2.5]" />
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* ======================================================================== */}
            {/* SIDEBAR DIREITA: CONFIGURAÇÕES DO AGENTE (Idêntica ao Print 04!)         */}
            {/* ======================================================================== */}
            {isAgentSettingsOpen && selectedAgent && (
              <aside className="w-80 shrink-0 h-full bg-[#111113] border-l border-zinc-900/90 flex flex-col overflow-hidden animate-in slide-in-from-right duration-150">
                {/* Header da Sidebar de Configurações (Print 04) */}
                <div className="h-11 px-3.5 border-b border-zinc-900/90 flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-1.5 bg-[#1b1b1f] border border-zinc-800/80 rounded-xl px-2.5 py-1 text-xs font-medium text-zinc-100">
                    <Settings className="w-3.5 h-3.5 text-zinc-400" />
                    <span>Configurações do agente</span>
                  </div>
                  <div className="flex items-center gap-1 text-zinc-400">
                    <button
                      type="button"
                      onClick={() => {
                        setNewAgentDraft(
                          generateAgentDraftFromPrompt('Novo agente especialista', notes).draft
                        )
                        setIsNewAgentModalOpen(true)
                      }}
                      className="p-1 rounded-lg hover:bg-zinc-800 hover:text-zinc-100 cursor-pointer"
                      title="Novo agente"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsAgentSettingsOpen(false)}
                      className="p-1 rounded-lg hover:bg-zinc-800 hover:text-zinc-100 cursor-pointer"
                      title="Fechar configurações"
                    >
                      <Maximize2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Corpo rolável idêntico ao Print 04 */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {/* Avatar centralizado com botão de lápis */}
                  <div className="flex justify-center py-2">
                    <div className="relative">
                      <div
                        className="cursor-pointer transition-transform hover:scale-105"
                        onClick={() => setIsAvatarPickerOpen(true)}
                        title="Clique para personalizar avatar"
                      >
                        <AgentIcon
                          variant={selectedAgent.icon}
                          state={selectedAgent.state === 'working' ? 'executing' : selectedAgent.state === 'waiting_user' ? 'attention' : 'waiting'}
                          size={64}
                          className="rounded-2xl shadow-lg ring-2 ring-white/10"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsAvatarPickerOpen(true)}
                        className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-[#1c1c20] border border-zinc-700 text-zinc-200 flex items-center justify-center shadow-md cursor-pointer hover:bg-zinc-700 hover:text-white transition-colors"
                        title="Editar ícone e cor"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  {/* Nome */}
                  <div className="space-y-1.5">
                    <label className="block text-xs text-zinc-300 font-medium">Nome</label>
                    <input
                      type="text"
                      value={selectedAgent.name}
                      onChange={e =>
                        onUpdateStore(
                          updateAgentProfileWithVersion(store, {
                            ...selectedAgent,
                            name: e.target.value
                          })
                        )
                      }
                      className="w-full bg-[#18181b] border border-zinc-800/80 rounded-xl px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-zinc-700"
                    />
                  </div>

                  {/* Título */}
                  <div className="space-y-1.5">
                    <label className="block text-xs text-zinc-300 font-medium">Título</label>
                    <input
                      type="text"
                      value={selectedAgent.workStyle.tone}
                      onChange={e =>
                        onUpdateStore(
                          updateAgentProfileWithVersion(store, {
                            ...selectedAgent,
                            workStyle: {
                              ...selectedAgent.workStyle,
                              tone: e.target.value
                            }
                          })
                        )
                      }
                      placeholder="Descreva o que seu agente faz"
                      className="w-full bg-[#18181b] border border-zinc-800/80 rounded-xl px-3 py-2 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-700"
                    />
                  </div>

                  {/* Descrição */}
                  <div className="space-y-1.5">
                    <label className="block text-xs text-zinc-300 font-medium">Descrição</label>
                    <textarea
                      value={selectedAgent.roleDescription}
                      onChange={e =>
                        onUpdateStore(
                          updateAgentProfileWithVersion(store, {
                            ...selectedAgent,
                            roleDescription: e.target.value
                          })
                        )
                      }
                      placeholder="Atividades rotineiras e dúvidas pontuais"
                      className="w-full h-20 bg-[#18181b] border border-zinc-800/80 rounded-xl px-3 py-2 text-xs text-zinc-100 placeholder-zinc-500 resize-none focus:outline-none focus:border-zinc-700"
                    />
                  </div>

                  {/* Seção Cérebro (Modelo, Raciocínio, Modelos de reserva) */}
                  <div className="space-y-2 pt-1">
                    <div className="text-[11px] text-zinc-400 font-medium">Cérebro</div>
                    <div className="bg-[#18181b] border border-zinc-800/80 rounded-2xl divide-y divide-zinc-800/70">
                      <div className="px-3 py-2.5 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2 text-zinc-200 font-medium">
                          <Cpu className="w-3.5 h-3.5 text-zinc-400" />
                          <span>Modelo</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setAiSettingsInitialTab('models')
                            setIsAiSettingsModalOpen(true)
                          }}
                          className="flex items-center gap-1.5 text-zinc-300 hover:text-white transition-colors cursor-pointer group"
                          title="Clique para configurar no Pyrite"
                        >
                          <Globe className="w-3 h-3 text-zinc-400 group-hover:text-zinc-200" />
                          <span className="font-mono text-[11px] truncate max-w-[120px]">
                            {selectedAgent?.aiConfig?.model || activeModelName}
                          </span>
                          <ExternalLink className="w-3 h-3 text-zinc-500 group-hover:text-zinc-300" />
                        </button>
                      </div>

                      <div className="px-3 py-2.5 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2 text-zinc-200 font-medium">
                          <Brain className="w-3.5 h-3.5 text-zinc-400" />
                          <span>Raciocínio</span>
                        </div>
                        <div className="flex items-center gap-1 bg-[#121215] p-0.5 rounded-lg border border-zinc-800/60">
                          {(['Baixo', 'Médio', 'Alto'] as const).map(effort => {
                            const isSel = reasoningEffort === effort
                            const temp = effort === 'Baixo' ? 0.2 : effort === 'Médio' ? 0.5 : 0.8
                            return (
                              <button
                                key={effort}
                                type="button"
                                onClick={() => {
                                  setReasoningEffort(effort)
                                  onUpdateStore(
                                    updateAgentProfileWithVersion(store, {
                                      ...selectedAgent,
                                      aiConfig: {
                                        ...selectedAgent.aiConfig,
                                        temperature: temp
                                      }
                                    })
                                  )
                                }}
                                className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors cursor-pointer ${
                                  isSel
                                    ? 'bg-zinc-800 text-white font-semibold shadow-xs'
                                    : 'text-zinc-400 hover:text-zinc-200'
                                }`}
                              >
                                {effort}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setAiSettingsInitialTab('models')
                        setIsAiSettingsModalOpen(true)
                      }}
                      className="w-full bg-[#18181b] hover:bg-[#1f1f23] border border-zinc-800/80 rounded-2xl px-3 py-2.5 flex items-center justify-between text-xs transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-2 text-zinc-200 font-medium">
                        <RefreshCw className="w-3.5 h-3.5 text-zinc-400" />
                        <span>Chaves & Provedores de IA</span>
                      </div>
                      <span className="text-zinc-400 flex items-center gap-1 text-[11px]">
                        <span className="capitalize">{activeProviderName}</span>
                        <ExternalLink className="w-3 h-3 text-zinc-500" />
                      </span>
                    </button>
                  </div>

                  {/* Seção Sabe (Instruções, Memórias, Habilidades, Arquivos — Print 04!) */}
                  <div className="space-y-2 pt-1">
                    <div className="text-[11px] text-zinc-400 font-medium">Sabe</div>
                    <div className="bg-[#18181b] border border-zinc-800/80 rounded-2xl divide-y divide-zinc-800/70">
                      {/* 1. Instruções */}
                      <div>
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedSettingsSection(s =>
                              s === 'instructions' ? null : 'instructions'
                            )
                          }
                          className="w-full px-3 py-2.5 flex items-center justify-between text-xs hover:bg-zinc-800/40 cursor-pointer"
                        >
                          <div className="flex items-center gap-2 text-zinc-200 font-medium">
                            <FileText className="w-3.5 h-3.5 text-zinc-400" />
                            <span>Instruções</span>
                          </div>
                          <ChevronRight className={`w-3.5 h-3.5 text-zinc-500 transition-transform ${expandedSettingsSection === 'instructions' ? 'rotate-90' : ''}`} />
                        </button>
                        {expandedSettingsSection === 'instructions' && (
                          <div className="p-3 bg-[#131316] border-t border-zinc-800/70 space-y-3 text-xs">
                            <div>
                              <label className="block text-[11px] text-zinc-400 mb-1 font-medium">
                                Regras de trabalho (1 por linha)
                              </label>
                              <textarea
                                value={selectedAgent.workStyle.rules.join('\n')}
                                onChange={e =>
                                  onUpdateStore(
                                    updateAgentProfileWithVersion(store, {
                                      ...selectedAgent,
                                      workStyle: {
                                        ...selectedAgent.workStyle,
                                        rules: e.target.value
                                          .split('\n')
                                          .map(s => s.trim())
                                          .filter(Boolean)
                                      }
                                    })
                                  )
                                }
                                placeholder="Diretrizes de execução..."
                                className="w-full h-20 bg-[#18181b] border border-zinc-800 rounded-xl p-2 text-xs text-zinc-200 resize-none focus:outline-none focus:border-zinc-700"
                              />
                            </div>

                            <div>
                              <label className="block text-[11px] text-zinc-400 mb-1 font-medium">
                                Perguntas obrigatórias antes da entrega (1 por linha)
                              </label>
                              <textarea
                                value={(selectedAgent.workStyle.requiredQuestions || []).join('\n')}
                                onChange={e =>
                                  onUpdateStore(
                                    updateAgentProfileWithVersion(store, {
                                      ...selectedAgent,
                                      workStyle: {
                                        ...selectedAgent.workStyle,
                                        requiredQuestions: e.target.value
                                          .split('\n')
                                          .map(s => s.trim())
                                          .filter(Boolean)
                                      }
                                    })
                                  )
                                }
                                placeholder="Ex: Qual o cliente? Qual o prazo estimado?"
                                className="w-full h-16 bg-[#18181b] border border-zinc-800 rounded-xl p-2 text-xs text-zinc-200 resize-none focus:outline-none focus:border-zinc-700"
                              />
                            </div>

                            <div>
                              <label className="block text-[11px] text-zinc-400 mb-1 font-medium">
                                Travas de segurança / Guardrails (1 por linha)
                              </label>
                              <textarea
                                value={(selectedAgent.workStyle.guardrails || []).join('\n')}
                                onChange={e =>
                                  onUpdateStore(
                                    updateAgentProfileWithVersion(store, {
                                      ...selectedAgent,
                                      workStyle: {
                                        ...selectedAgent.workStyle,
                                        guardrails: e.target.value
                                          .split('\n')
                                          .map(s => s.trim())
                                          .filter(Boolean)
                                      }
                                    })
                                  )
                                }
                                placeholder="Ex: Proibido alterar modelo original..."
                                className="w-full h-16 bg-[#18181b] border border-zinc-800 rounded-xl p-2 text-xs text-zinc-200 resize-none focus:outline-none focus:border-zinc-700"
                              />
                            </div>

                            <div>
                              <label className="block text-[11px] text-zinc-400 mb-1 font-medium">
                                Pasta padrão de entrega no cofre
                              </label>
                              <CustomSelect
                                value={selectedAgent.deliverables.targetFolder || 'Propostas'}
                                onChange={val =>
                                  onUpdateStore(
                                    updateAgentProfileWithVersion(store, {
                                      ...selectedAgent,
                                      deliverables: {
                                        ...selectedAgent.deliverables,
                                        targetFolder: val
                                      }
                                    })
                                  )
                                }
                                options={Array.from(new Set(['Propostas', 'Escopos', 'Tarefas', 'Equipe', ...folders])).map(f => ({
                                  value: f,
                                  label: f,
                                  icon: <Folder className="w-3 h-3 text-zinc-400" />
                                }))}
                                className="w-full"
                                size="sm"
                              />
                            </div>
                          </div>
                        )}
                      </div>

                      {/* 2. Memórias (Projetos & Itens de Conteúdo) */}
                      <div>
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedSettingsSection(s =>
                              s === 'memories' ? null : 'memories'
                            )
                          }
                          className="w-full px-3 py-2.5 flex items-center justify-between text-xs hover:bg-zinc-800/40 cursor-pointer"
                        >
                          <div className="flex items-center gap-2 text-zinc-200 font-medium">
                            <Brain className="w-3.5 h-3.5 text-zinc-400" />
                            <span>Projetos & Itens</span>
                          </div>
                          <span className="text-zinc-400 flex items-center gap-1">
                            {store.projects.length} salvos <ChevronRight className={`w-3.5 h-3.5 text-zinc-500 transition-transform ${expandedSettingsSection === 'memories' ? 'rotate-90' : ''}`} />
                          </span>
                        </button>
                        {expandedSettingsSection === 'memories' && (
                          <div className="p-3 bg-[#131316] border-t border-zinc-800/70 space-y-2.5 text-xs">
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] text-zinc-400 font-medium">Itens de Conteúdo & Projetos</span>
                              <button
                                type="button"
                                onClick={() => setIsProjectsModalOpen(true)}
                                className="text-[11px] text-zinc-200 hover:text-white underline cursor-pointer"
                              >
                                Gerenciar
                              </button>
                            </div>
                            {store.projects.length === 0 ? (
                              <div className="text-[11px] text-zinc-500 py-1">
                                Nenhum projeto ou item de conteúdo cadastrado.
                              </div>
                            ) : (
                              store.projects.map(p => {
                                const displayName = p.itemName || p.clientName || p.name
                                return (
                                  <div
                                    key={p.id}
                                    className="px-2.5 py-2 rounded-xl bg-[#18181b] border border-zinc-800/60 text-zinc-300 text-[11px] flex items-center justify-between"
                                  >
                                    <div className="min-w-0 pr-2">
                                      <div className="font-medium text-zinc-200 truncate">{displayName}</div>
                                      <div className="text-[10px] text-zinc-500 truncate flex items-center gap-1 mt-0.5">
                                        <span>{p.name}</span>
                                        {p.itemType && (
                                          <span className="px-1 rounded bg-zinc-800 text-zinc-400">
                                            {p.itemType}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                    <span className="text-[10px] bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-400 shrink-0">
                                      {p.briefingNoteIds.length} notas
                                    </span>
                                  </div>
                                )
                              })
                            )}
                            <div className="pt-1 border-t border-zinc-800/80">
                              <button
                                type="button"
                                onClick={() => setIsProjectsModalOpen(true)}
                                className="w-full py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs flex items-center justify-center gap-1 cursor-pointer"
                              >
                                <Plus className="w-3.5 h-3.5" />
                                <span>Novo Projeto ou Item</span>
                              </button>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* 3. Habilidades (Permissões e Skills de IA) */}
                      <div>
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedSettingsSection(s => (s === 'skills' ? null : 'skills'))
                          }
                          className="w-full px-3 py-2.5 flex items-center justify-between text-xs hover:bg-zinc-800/40 cursor-pointer"
                        >
                          <div className="flex items-center gap-2 text-zinc-200 font-medium">
                            <Wrench className="w-3.5 h-3.5 text-zinc-400" />
                            <span>Habilidades</span>
                          </div>
                          <span className="text-zinc-400 flex items-center gap-1">
                            {selectedAgent.allowedActions.length + (selectedAgent.skills?.length || 0)} atribuídas{' '}
                            <ChevronRight className={`w-3.5 h-3.5 text-zinc-500 transition-transform ${expandedSettingsSection === 'skills' ? 'rotate-90' : ''}`} />
                          </span>
                        </button>
                        {expandedSettingsSection === 'skills' && (
                          <div className="p-3 bg-[#131316] border-t border-zinc-800/70 space-y-3 text-xs">
                            {/* Permissões do Cofre */}
                            <div className="space-y-1">
                              <div className="text-[11px] text-zinc-400 font-medium mb-1">
                                Permissões de Ação no Cofre
                              </div>
                              {(Object.keys(ACTION_PERMISSION_LABELS) as AgentActionPermission[]).map(
                                perm => {
                                  const checked = selectedAgent.allowedActions.includes(perm)
                                  return (
                                    <label
                                      key={perm}
                                      className="flex items-center gap-2 text-[11px] text-zinc-300 cursor-pointer py-1 px-1.5 rounded-lg hover:bg-zinc-800/40"
                                    >
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={e => {
                                          const nextPerms = e.target.checked
                                            ? [...selectedAgent.allowedActions, perm]
                                            : selectedAgent.allowedActions.filter(p => p !== perm)
                                          onUpdateStore(
                                            updateAgentProfileWithVersion(store, {
                                              ...selectedAgent,
                                              allowedActions: nextPerms
                                            })
                                          )
                                        }}
                                        className="rounded bg-zinc-800 border-zinc-700 text-emerald-500 focus:ring-0"
                                      />
                                      <span>{ACTION_PERMISSION_LABELS[perm]}</span>
                                    </label>
                                  )
                                }
                              )}
                            </div>

                            {/* Delegação em Equipe */}
                            <div className="pt-2 border-t border-zinc-800/80 space-y-1.5">
                              <div className="text-[11px] text-zinc-400 font-medium">Delegação em Equipe</div>
                              <label className="flex items-center gap-2 text-[11px] text-zinc-300 cursor-pointer py-0.5">
                                <input
                                  type="checkbox"
                                  checked={selectedAgent.limits.allowDelegation}
                                  onChange={e =>
                                    onUpdateStore(
                                      updateAgentProfileWithVersion(store, {
                                        ...selectedAgent,
                                        limits: {
                                          ...selectedAgent.limits,
                                          allowDelegation: e.target.checked
                                        }
                                      })
                                    )
                                  }
                                  className="rounded bg-zinc-800 border-zinc-700 text-emerald-500 focus:ring-0"
                                />
                                <span>Permitir delegação para especialistas</span>
                              </label>

                              {selectedAgent.limits.allowDelegation && (
                                <div className="flex items-center justify-between text-[11px] text-zinc-400 pl-5">
                                  <span>Limite de profundidade:</span>
                                  <div className="flex items-center gap-1">
                                    {[1, 2, 3].map(depth => (
                                      <button
                                        key={depth}
                                        type="button"
                                        onClick={() =>
                                          onUpdateStore(
                                            updateAgentProfileWithVersion(store, {
                                              ...selectedAgent,
                                              limits: {
                                                ...selectedAgent.limits,
                                                maxDelegationDepth: depth
                                              }
                                            })
                                          )
                                        }
                                        className={`px-2 py-0.5 rounded text-[10px] cursor-pointer ${
                                          selectedAgent.limits.maxDelegationDepth === depth
                                            ? 'bg-zinc-700 text-white font-bold'
                                            : 'bg-zinc-800/60 text-zinc-400'
                                        }`}
                                      >
                                        {depth}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* Skills de IA Conectadas (do Popup de Configurações de IA) */}
                            <div className="pt-2 border-t border-zinc-800/80 space-y-1.5">
                              <div className="flex items-center justify-between">
                                <div className="text-[11px] text-zinc-400 font-medium">
                                  Skills de IA Conectadas
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setAiSettingsInitialTab('skills')
                                    setIsAiSettingsModalOpen(true)
                                  }}
                                  className="text-[10px] text-zinc-400 hover:text-white flex items-center gap-1 cursor-pointer"
                                  title="Abrir gerenciador de skills no popup de IA"
                                >
                                  <ExternalLink className="w-3 h-3" />
                                  <span>Gerenciar skills</span>
                                </button>
                              </div>

                              {installedAiSkills.length === 0 ? (
                                <div className="p-2.5 rounded-xl bg-[#18181b] border border-zinc-800/60 text-[11px] text-zinc-400 space-y-2">
                                  <p>Nenhuma skill de IA importada ou cadastrada no Pyrite ainda.</p>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setAiSettingsInitialTab('skills')
                                      setIsAiSettingsModalOpen(true)
                                    }}
                                    className="w-full py-1.5 px-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium cursor-pointer text-center"
                                  >
                                    Importar ou criar skills no Popup de IA
                                  </button>
                                </div>
                              ) : (
                                <div className="space-y-1 max-h-40 overflow-y-auto pr-0.5">
                                  {installedAiSkills.map(sk => {
                                    const agentSkills = selectedAgent.skills || []
                                    const isAssigned = agentSkills.includes(sk.id)
                                    return (
                                      <label
                                        key={sk.id}
                                        className="flex items-start gap-2 p-1.5 rounded-lg hover:bg-zinc-800/40 cursor-pointer text-[11px]"
                                      >
                                        <input
                                          type="checkbox"
                                          checked={isAssigned}
                                          onChange={e => {
                                            const nextSkills = e.target.checked
                                              ? [...agentSkills, sk.id]
                                              : agentSkills.filter(id => id !== sk.id)
                                            onUpdateStore(
                                              updateAgentProfileWithVersion(store, {
                                                ...selectedAgent,
                                                skills: nextSkills
                                              })
                                            )
                                          }}
                                          className="mt-0.5 rounded bg-zinc-800 border-zinc-700 text-emerald-500 focus:ring-0"
                                        />
                                        <div className="min-w-0">
                                          <div className="font-medium text-zinc-200 flex items-center gap-1.5">
                                            <span>{sk.name}</span>
                                            {sk.folderPath && (
                                              <span className="text-[9px] px-1 rounded bg-zinc-800 text-zinc-400">
                                                local
                                              </span>
                                            )}
                                          </div>
                                          {sk.description && (
                                            <div className="text-[10px] text-zinc-400 truncate">
                                              {sk.description}
                                            </div>
                                          )}
                                        </div>
                                      </label>
                                    )
                                  })}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* 4. Arquivos (Fontes vinculadas do Cofre!) */}
                      <div>
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedSettingsSection(s => (s === 'files' ? null : 'files'))
                          }
                          className="w-full px-3 py-2.5 flex items-center justify-between text-xs hover:bg-zinc-800/40 cursor-pointer"
                        >
                          <div className="flex items-center gap-2 text-zinc-200 font-medium">
                            <FolderOpen className="w-3.5 h-3.5 text-zinc-400" />
                            <span>Arquivos</span>
                          </div>
                          <span className="text-zinc-400 flex items-center gap-1">
                            {selectedAgent.knowledgeBindings.length} vinculadas{' '}
                            <ChevronRight className={`w-3.5 h-3.5 text-zinc-500 transition-transform ${expandedSettingsSection === 'files' ? 'rotate-90' : ''}`} />
                          </span>
                        </button>
                        {expandedSettingsSection === 'files' && (
                          <div className="p-3 bg-[#131316] border-t border-zinc-800/70 space-y-2.5 text-xs">
                            {selectedAgent.knowledgeBindings.length === 0 ? (
                              <div className="text-[11px] text-zinc-500 py-2 text-center">
                                Nenhuma nota do cofre vinculada a este agente.
                              </div>
                            ) : (
                              selectedAgent.knowledgeBindings.map(b => (
                                <div
                                  key={b.id}
                                  className="p-2.5 rounded-xl bg-[#18181b] border border-zinc-800/80 flex items-center justify-between gap-2"
                                >
                                  <div className="min-w-0 flex-1">
                                    <button
                                      type="button"
                                      onClick={() => b.noteId && onOpenNote(b.noteId)}
                                      className="text-[11px] font-medium text-zinc-200 hover:text-white truncate block text-left cursor-pointer"
                                      title={b.noteTitle}
                                    >
                                      {b.noteTitle || b.folderPath || 'Documento'}
                                    </button>
                                    <div className="flex items-center gap-1.5 mt-0.5">
                                      <span
                                        className="text-[9px] px-1.5 py-0.2 rounded font-medium"
                                        style={{
                                          backgroundColor: `${ROLE_LABELS[b.role]?.badgeColor || '#3b82f6'}20`,
                                          color: ROLE_LABELS[b.role]?.badgeColor || '#3b82f6'
                                        }}
                                      >
                                        {ROLE_LABELS[b.role]?.label || b.role}
                                      </span>
                                      <span className="text-[9px] text-zinc-500">
                                        {b.updatePolicy === 'pin_revision' ? '🔒 Fixado' : '🔄 Acompanha'}
                                      </span>
                                    </div>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      onUpdateStore(
                                        updateAgentProfileWithVersion(store, {
                                          ...selectedAgent,
                                          knowledgeBindings: selectedAgent.knowledgeBindings.filter(
                                            x => x.id !== b.id
                                          )
                                        })
                                      )
                                    }
                                    className="text-zinc-500 hover:text-rose-400 p-1 cursor-pointer transition-colors"
                                    title="Remover vínculo"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ))
                            )}

                            <button
                              type="button"
                              onClick={() => {
                                setNoteSearchQuery('')
                                setSelectedNoteForBind(null)
                                setIsNoteBindPickerOpen(true)
                              }}
                              className="w-full py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>Vincular nota do cofre...</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Excluir Agente se houver mais de 1 */}
                  {store.agents.length > 1 && (
                    <div className="pt-2 border-t border-zinc-900/90">
                      <button
                        type="button"
                        onClick={() => handleDeleteAgent(selectedAgent.id)}
                        className="w-full py-2 rounded-xl border border-rose-900/40 text-rose-400 hover:bg-rose-950/30 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Excluir este agente</span>
                      </button>
                    </div>
                  )}
                </div>
              </aside>
            )}
          </div>
        )}


        {/* ========================================================================== */}
        {/* TELA 02: FLUXO DE TRABALHO (Canvas OpenBot tela cheia — Print 02!)          */}
        {/* ========================================================================== */}
        {activeSection === 'workflows' && (
          <ErrorBoundary fallbackTitle="Editor de Fluxos de Trabalho">
            <WorkflowCanvasEditor
            workflows={workflows}
            agents={store.agents}
            notes={notes}
            folders={folders}
            selectedWorkflowId={selectedWorkflowId}
            latestNodeStates={activeRun?.workflowNodeStates}
            activeRun={activeRun || undefined}
            allProjects={allUnifiedAsProjects}
            taskBoards={taskBoards}
            onSelectWorkflow={setSelectedWorkflowId}
            onSaveWorkflow={async wf => {
              const exists = workflows.some(w => w.id === wf.id)
              const nextWfs = exists
                ? workflows.map(w => (w.id === wf.id ? wf : w))
                : [...workflows, wf]
              await onUpdateStore({ ...store, workflows: nextWfs })
            }}
            onDeleteWorkflow={async wfId => {
              let nextWfs = workflows.filter(w => w.id !== wfId)
              if (nextWfs.length === 0) {
                const freshInId = `wn_in_${Date.now()}`
                const freshLlmId = `wn_llm_${Date.now() + 1}`
                const freshOutId = `wn_out_${Date.now() + 2}`
                const freshWf: WorkflowDefinition = {
                  id: `wf_${Date.now()}`,
                  version: 1,
                  status: 'draft',
                  name: 'Novo Fluxo de Trabalho',
                  description: 'Fluxo visual customizado.',
                  nodes: [
                    {
                      id: freshInId,
                      kind: 'input',
                      label: 'Gatilho Manual',
                      position: { x: 140, y: 180 },
                      config: { triggerType: 'manual', content: '' }
                    },
                    {
                      id: freshLlmId,
                      kind: 'llm',
                      label: 'Processamento por IA',
                      position: { x: 500, y: 180 },
                      config: {
                        model: 'gpt-4o',
                        promptTemplate: 'Com base na entrada, elabore o conteúdo solicitado com detalhes e qualidade profissional.',
                        systemPrompt: 'Você é um assistente inteligente executando uma etapa de automação no Pyrite. Responda em português com clareza e objetividade.'
                      }
                    },
                    {
                      id: freshOutId,
                      kind: 'deliverable',
                      label: 'Gravar Nota no Cofre',
                      position: { x: 860, y: 180 },
                      config: {
                        targetFolder: 'Entregas',
                        namingPattern: 'Entrega - {fluxo} - {data}',
                        outputType: 'note'
                      }
                    }
                  ],
                  edges: [
                    { id: `we_${Date.now()}_1`, sourceNodeId: freshInId, targetNodeId: freshLlmId, branch: 'default' },
                    { id: `we_${Date.now()}_2`, sourceNodeId: freshLlmId, targetNodeId: freshOutId, branch: 'default' }
                  ],
                  createdAt: Date.now(),
                  updatedAt: Date.now()
                }
                nextWfs = [freshWf]
              }
              await onUpdateStore({ ...store, workflows: nextWfs })
              if (nextWfs[0]) setSelectedWorkflowId(nextWfs[0].id)
            }}
            onRunWorkflow={async (wf, isTest, prompt) => {
              setIsExecuting(true)
              const controller = new AbortController()
              abortControllerRef.current = controller
              try {
                const wfContext = resolveActiveContext(selectedProjectId)
                const proj: ProjectContext | undefined = wfContext ? {
                  id: wfContext.id,
                  name: wfContext.groupName,
                  itemName: wfContext.displayName,
                  clientName: wfContext.displayName,
                  itemType: wfContext.groupName,
                  category: wfContext.category,
                  description: wfContext.description,
                  folderPath: wfContext.groupName,
                  briefingNoteIds: wfContext.briefingNoteIds,
                  createdAt: Date.now(),
                  updatedAt: Date.now()
                } : store.projects.find(p => p.id === selectedProjectId)
                const wfRun = await executeWorkflowRun({
                  workflow: wf,
                  allAgents: store.agents,
                  allNotes: notes,
                  allProjects: allUnifiedAsProjects,
                  prompt,
                  projectContext: proj,
                  explicitClientName: proj?.clientName,
                  isTestRun: isTest,
                  abortSignal: controller.signal,
                  commitNote: workflowCommitNote,
                  commitTasks: workflowCommitTasks
                })
                await persistWorkflowRun(wfRun, 'prepend')
                setSelectedRunId(wfRun.id)
                setStatusBanner({
                  type:
                    wfRun.status === 'completed'
                      ? 'success'
                      : wfRun.status === 'cancelled'
                      ? 'warning'
                      : wfRun.status === 'failed'
                      ? 'error'
                      : 'warning',
                  text:
                    wfRun.status === 'completed'
                      ? isTest
                        ? `Teste do fluxo "${wf.name}" concluído (nada foi gravado no cofre).`
                        : `Fluxo "${wf.name}" executado com sucesso!`
                      : wfRun.status === 'cancelled'
                      ? `Execução do fluxo "${wf.name}" foi cancelada.`
                      : wfRun.status === 'waiting_approval'
                      ? `Fluxo "${wf.name}" pausado aguardando aprovação humana.`
                      : `Fluxo "${wf.name}" falhou: ${wfRun.error || wfRun.status}`
                })
              } catch (err: any) {
                if (controller.signal.aborted) {
                  setStatusBanner({
                    type: 'warning',
                    text: `Execução do fluxo "${wf.name}" foi cancelada.`
                  })
                } else {
                  setStatusBanner({
                    type: 'error',
                    text: `Erro ao executar o fluxo: ${err?.message || 'falha inesperada'}`
                  })
                }
              } finally {
                setIsExecuting(false)
                abortControllerRef.current = null
              }
            }}
            onStopWorkflow={handleCancelActiveExecution}
            onClearExecution={async () => {
              setSelectedRunId(null)
              if (selectedWorkflowId) {
                const nextRuns = (store.runs || []).map(r =>
                  r.workflowId === selectedWorkflowId ? { ...r, workflowId: undefined } : r
                )
                await onUpdateStore({ ...store, runs: nextRuns })
              }
            }}
            onOpenNote={onOpenNote}
            onResumeWorkflowRun={async pausedRun => {
              await handleDirectApproveWorkflowRun(pausedRun)
            }}
            isExecuting={isExecuting}
            commitTasks={workflowCommitTasks}
            />
          </ErrorBoundary>
        )}

        {/* ========================================================================== */}
        {/* ESQUADRÕES: GESTÃO ELEGANTE DE ESQUADRÕES & ESTEIRAS                       */}
        {/* ========================================================================== */}
        {activeSection === 'squads' && (
          <ErrorBoundary fallbackTitle="Gestão de Esquadrão">
            <SquadManagementView
              squads={teams}
              agents={store.agents}
              selectedSquadId={selectedTeamId}
              vaultName={vaultPath ? (vaultPath.split(/[/\\]/).filter(Boolean).pop() || 'Cofre Principal') : 'Cofre Principal'}
              onSelectSquad={setSelectedTeamId}
              onSaveSquad={async updatedSquad => {
                const exists = teams.some(t => t.id === updatedSquad.id)
                const nextTeams = exists
                  ? teams.map(t => (t.id === updatedSquad.id ? updatedSquad : t))
                  : [...teams, updatedSquad]
                await onUpdateStore({ ...store, teams: nextTeams })
              }}
              onDeleteSquad={async squadId => {
                const nextTeams = teams.filter(t => t.id !== squadId)
                await onUpdateStore({ ...store, teams: nextTeams })
                setSelectedTeamId('overview')
              }}
              onOpenSquadChat={squad => {
                const leadId = squad.coordinatorAgentId || squad.pipeline?.[0]?.agentId || squad.nodes?.[0]?.agentId || store.agents[0]?.id || ''
                setSelectedAgentId(leadId)
                setSelectedTeamId(squad.id)
                setUseTeamDelegation(true)
                setActiveSection('agents')
              }}
            />
          </ErrorBoundary>
        )}

        {/* ========================================================================== */}
        {/* ATIVIDADE: HISTÓRICO AUDITÁVEL LIMPO                                       */}
        {/* ========================================================================== */}
        {activeSection === 'activity' && (
          <div className="flex-1 overflow-y-auto p-6 bg-[#111113]">
            <div className="max-w-4xl mx-auto space-y-4">
              <h2 className="text-sm font-semibold text-zinc-100">Atividade dos Agentes</h2>
              {store.runs.length === 0 ? (
                <div className="text-xs text-zinc-500 py-8 text-center">
                  Nenhuma execução registrada ainda.
                </div>
              ) : (
                <div className="space-y-2">
                  {store.runs.map(r => (
                    <div
                      key={r.id}
                      onClick={() => {
                        setSelectedAgentId(r.agentId)
                        setSelectedRunId(r.id)
                        setActiveSection('agents')
                      }}
                      className="p-3.5 rounded-2xl bg-[#18181b] border border-zinc-800/80 hover:border-zinc-700 flex items-center justify-between gap-4 cursor-pointer transition-colors"
                    >
                      <div className="min-w-0 space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-4 h-4 rounded-md flex items-center justify-center text-[8px] text-white font-bold"
                            style={{ backgroundColor: getAgentColor(r.agentId) }}
                          >
                            ••
                          </span>
                          <span className="text-xs font-semibold text-zinc-100">
                            {r.agentName}
                          </span>
                          <span className="text-[11px] text-zinc-500">
                            {new Date(r.startedAt).toLocaleString('pt-BR')}
                          </span>
                        </div>
                        <p className="text-xs text-zinc-400 truncate">{r.prompt}</p>
                      </div>
                      <span className="text-[11px] text-zinc-300 shrink-0">
                        {r.calculation ? formatCentsBRL(r.calculation.netTotalCents) : r.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ============================================================================ */}
      {/* MODAL: CRIAR NOVO AGENTE                                                     */}
      {/* ============================================================================ */}
      {isNewAgentModalOpen && newAgentDraft && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#141416] border border-zinc-800 rounded-2xl max-w-lg w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <span className="text-sm font-semibold text-zinc-100">Novo Agente</span>
              <button
                type="button"
                onClick={() => setIsNewAgentModalOpen(false)}
                className="text-zinc-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex gap-1.5 bg-[#1c1c1f] p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setNewAgentTab('guided')}
                className={`flex-1 py-1.5 rounded-lg text-xs font-medium cursor-pointer ${
                  newAgentTab === 'guided' ? 'bg-zinc-800 text-white' : 'text-zinc-400'
                }`}
              >
                Configuração Direta
              </button>
              <button
                type="button"
                onClick={() => setNewAgentTab('conversation')}
                className={`flex-1 py-1.5 rounded-lg text-xs font-medium cursor-pointer ${
                  newAgentTab === 'conversation' ? 'bg-zinc-800 text-white' : 'text-zinc-400'
                }`}
              >
                Gerar por Descrição
              </button>
            </div>

            {newAgentTab === 'conversation' && (
              <div className="space-y-2">
                <textarea
                  value={convDescription}
                  onChange={e => setConvDescription(e.target.value)}
                  placeholder="Ex.: Preciso de um agente que monte propostas comerciais e verifique preços..."
                  className="w-full h-20 bg-[#1c1c1f] border border-zinc-800 rounded-xl p-2.5 text-xs text-zinc-100"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (!convDescription.trim()) return
                    setNewAgentDraft(generateAgentDraftFromPrompt(convDescription, notes).draft)
                    setNewAgentTab('guided')
                  }}
                  className="px-3 py-1.5 rounded-xl bg-zinc-100 text-zinc-950 text-xs font-semibold cursor-pointer"
                >
                  Preencher perfil
                </button>
              </div>
            )}

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-zinc-400 mb-1">Nome</label>
                <input
                  type="text"
                  value={newAgentDraft.name}
                  onChange={e => setNewAgentDraft({ ...newAgentDraft, name: e.target.value })}
                  className="w-full bg-[#1c1c1f] border border-zinc-800 rounded-xl px-3 py-2 text-zinc-100"
                />
              </div>
              <div>
                <label className="block text-zinc-400 mb-1">Título</label>
                <input
                  type="text"
                  value={newAgentDraft.workStyle.tone}
                  onChange={e =>
                    setNewAgentDraft({
                      ...newAgentDraft,
                      workStyle: { ...newAgentDraft.workStyle, tone: e.target.value }
                    })
                  }
                  className="w-full bg-[#1c1c1f] border border-zinc-800 rounded-xl px-3 py-2 text-zinc-100"
                />
              </div>
              <div>
                <label className="block text-zinc-400 mb-1">Descrição</label>
                <textarea
                  value={newAgentDraft.roleDescription}
                  onChange={e =>
                    setNewAgentDraft({ ...newAgentDraft, roleDescription: e.target.value })
                  }
                  className="w-full h-16 bg-[#1c1c1f] border border-zinc-800 rounded-xl px-3 py-2 text-zinc-100 resize-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => setIsNewAgentModalOpen(false)}
                className="px-3 py-1.5 rounded-xl bg-zinc-800 text-zinc-300 text-xs cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={async () => {
                  const created: AgentProfileVersion = {
                    ...newAgentDraft,
                    id: `agent_custom_${Date.now()}`,
                    createdAt: Date.now(),
                    updatedAt: Date.now()
                  }
                  await onUpdateStore(updateAgentProfileWithVersion(store, created))
                  setSelectedAgentId(created.id)
                  setIsNewAgentModalOpen(false)
                }}
                className="px-4 py-1.5 rounded-xl bg-zinc-100 hover:bg-white text-zinc-950 font-semibold text-xs cursor-pointer"
              >
                Criar Agente
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================================ */}
      {/* MODAL: PROJETOS E ITENS DE CONTEÚDO (CLIENTES, ARTIGOS, PRODUTOS, ETC.)       */}
      {/* ============================================================================ */}
      {isProjectsModalOpen && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#141416] border border-zinc-800 rounded-2xl max-w-2xl w-full p-5 space-y-4 shadow-2xl max-h-[88vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-100">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div>
                <h3 className="text-sm font-semibold text-zinc-100">
                  Projetos & Itens de Conteúdo
                </h3>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  Organize itens de qualquer tipo (Clientes, Artigos, Produtos, Campanhas). Seus agentes usam essas notas como contexto isolado de trabalho.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsProjectsModalOpen(false)
                  setEditingProject(null)
                }}
                className="text-zinc-400 hover:text-white p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Lista de Itens Cadastrados */}
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {store.projects.length === 0 ? (
                <div className="text-xs text-zinc-500 py-4 text-center">
                  Nenhum projeto ou item de conteúdo cadastrado ainda.
                </div>
              ) : (
                store.projects.map(p => {
                  const displayName = p.itemName || p.clientName || p.name
                  return (
                    <div
                      key={p.id}
                      className="p-3 rounded-xl bg-[#1c1c1f] border border-zinc-800/80 flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-zinc-100 truncate">{displayName}</span>
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-zinc-800 text-zinc-400">
                            {isItemProject(p) ? 'Item' : 'Projeto'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-zinc-500 mt-0.5">
                          <span>Grupo / Projeto: <strong className="text-zinc-400">{p.name}</strong></span>
                          <span>•</span>
                          <span>{p.briefingNoteIds.length} notas vinculadas</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingProject(p)
                            setProjItem(p.itemName || p.clientName || '')
                            setProjName(p.name)
                            setProjCategory(p.category || (isItemProject(p) ? 'item' : 'project'))
                            setProjDesc(p.description || '')
                            setProjBriefingIds(p.briefingNoteIds || [])
                          }}
                          className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs cursor-pointer"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            await onUpdateStore({
                              ...store,
                              projects: store.projects.filter(x => x.id !== p.id)
                            })
                            if (selectedProjectId === p.id) {
                              setSelectedProjectId('')
                            }
                          }}
                          className="p-1 rounded-lg hover:bg-rose-950/40 text-rose-400 cursor-pointer"
                          title="Excluir item"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            {/* Formulário de Criação / Edição */}
            <div className="border-t border-zinc-800 pt-3.5 space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-zinc-200">
                  {editingProject ? 'Editar Item de Conteúdo' : 'Adicionar Novo Item de Conteúdo'}
                </span>
                {editingProject && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingProject(null)
                      setProjName('')
                      setProjItem('')
                      setProjCategory('project')
                      setIsProjGroupDropdownOpen(false)
                      setProjDesc('')
                      setProjBriefingIds([])
                    }}
                    className="text-[11px] text-zinc-400 hover:text-white underline cursor-pointer"
                  >
                    Cancelar edição
                  </button>
                )}
              </div>

              {/* Seletor de Categoria: Item vs Projeto */}
              <div className="flex items-center gap-2 pt-1">
                <span className="text-[11px] text-zinc-400 font-medium">Categoria:</span>
                <div className="inline-flex rounded-xl bg-[#18181b] p-0.5 border border-zinc-800">
                  <button
                    type="button"
                    onClick={() => {
                      setProjCategory('item')
                      setIsProjGroupDropdownOpen(false)
                    }}
                    className={`px-3 py-1 rounded-lg text-xs font-medium cursor-pointer transition-colors flex items-center gap-1.5 ${
                      projCategory === 'item'
                        ? 'bg-zinc-800 text-white shadow-xs'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <Tag className="w-3.5 h-3.5" />
                    <span>Item (Cliente, etc.)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setProjCategory('project')
                      setIsProjGroupDropdownOpen(false)
                    }}
                    className={`px-3 py-1 rounded-lg text-xs font-medium cursor-pointer transition-colors flex items-center gap-1.5 ${
                      projCategory === 'project'
                        ? 'bg-zinc-800 text-white shadow-xs'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <Briefcase className="w-3.5 h-3.5" />
                    <span>Projeto</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="relative" ref={projGroupDropdownRef}>
                  <label className="block text-[11px] text-zinc-400 mb-1 font-medium">
                    {projCategory === 'item' ? 'Grupo de Itens (ex: Clientes)' : 'Projeto Contêiner (ex: Geral)'}
                  </label>
                  <div className="relative flex items-center">
                    <input
                      type="text"
                      autoComplete="off"
                      value={projName}
                      onChange={e => {
                        setProjName(e.target.value)
                        setIsProjGroupDropdownOpen(true)
                      }}
                      onFocus={() => setIsProjGroupDropdownOpen(true)}
                      placeholder={projCategory === 'item' ? 'Ex: Clientes, Produtos, Campanhas' : 'Ex: Geral, Lançamento Q4, Marketing'}
                      className="w-full bg-[#1c1c1f] border border-zinc-800 rounded-xl pl-3 pr-8 py-2 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-700 text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => setIsProjGroupDropdownOpen(v => !v)}
                      className="absolute right-2 text-zinc-500 hover:text-zinc-300 p-1 cursor-pointer"
                      title="Selecionar existente"
                    >
                      <ChevronDown className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {isProjGroupDropdownOpen && (
                    <div className="absolute left-0 top-full mt-1.5 w-full bg-[#18181b] border border-zinc-800 rounded-xl shadow-2xl p-1.5 z-50 space-y-1 max-h-52 overflow-y-auto custom-scrollbar animate-in fade-in zoom-in-95 duration-100">
                      <div className="text-[10px] uppercase font-semibold text-zinc-500 px-2 py-0.5">
                        {projCategory === 'item' ? 'Grupos de Itens Disponíveis' : 'Projetos Disponíveis'}
                      </div>
                      {availableGroupsForCategory.map(grp => (
                        <button
                          key={grp}
                          type="button"
                          onClick={() => {
                            setProjName(grp)
                            setIsProjGroupDropdownOpen(false)
                          }}
                          className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs flex items-center justify-between cursor-pointer ${
                            projName === grp
                              ? 'bg-zinc-800 text-white font-medium'
                              : 'text-zinc-300 hover:bg-zinc-800/50'
                          }`}
                        >
                          <span className="truncate">{grp}</span>
                          {projName === grp && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1 font-medium">
                    {projCategory === 'item' ? 'Nome do Item (ex: Nome do Cliente)' : 'Nome do Subprojeto / Tarefa'}
                  </label>
                  <input
                    type="text"
                    autoComplete="off"
                    value={projItem}
                    onChange={e => setProjItem(e.target.value)}
                    placeholder={projCategory === 'item' ? 'Ex: Blowmind, Construtora Horizonte' : 'Ex: Nova Landing Page, Integração API'}
                    className="w-full bg-[#1c1c1f] border border-zinc-800 rounded-xl px-3 py-2 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-700 text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] text-zinc-400 mb-1 font-medium">
                  Descrição / Diretrizes do Item (opcional)
                </label>
                <textarea
                  value={projDesc}
                  onChange={e => setProjDesc(e.target.value)}
                  placeholder="Instruções de escopo ou objetivos específicos para este item..."
                  className="w-full h-16 bg-[#1c1c1f] border border-zinc-800 rounded-xl p-2.5 text-xs text-zinc-200 placeholder-zinc-500 resize-none focus:outline-none focus:border-zinc-700"
                />
              </div>

              {/* Seletor de Notas de Briefing com Busca Rápida */}
              <div className="space-y-1.5">
                <label className="block text-[11px] text-zinc-400 font-medium">
                  Notas de Briefing / Fontes Vinculadas a este Item ({projBriefingIds.length} selecionadas)
                </label>

                {projBriefingIds.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-1.5">
                    {projBriefingIds.map(nid => {
                      const found = notes.find(n => n.id === nid)
                      if (!found) return null
                      return (
                        <span
                          key={nid}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-zinc-800 text-[11px] text-zinc-200"
                        >
                          <FileText className="w-3 h-3 text-zinc-400" />
                          <span className="truncate max-w-[140px]">{found.title}</span>
                          <button
                            type="button"
                            onClick={() => setProjBriefingIds(prev => prev.filter(id => id !== nid))}
                            className="text-zinc-400 hover:text-white cursor-pointer ml-0.5"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      )
                    })}
                  </div>
                )}

                <div className="relative flex items-center">
                  <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 pointer-events-none" />
                  <input
                    type="text"
                    value={projBriefingSearch}
                    onChange={e => setProjBriefingSearch(e.target.value)}
                    placeholder="Buscar nota para vincular a este item..."
                    className="w-full bg-[#18181b] border border-zinc-800 rounded-xl pl-8 pr-7 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-700"
                  />
                  {projBriefingSearch && (
                    <button
                      type="button"
                      onClick={() => setProjBriefingSearch('')}
                      className="absolute right-2 text-zinc-500 hover:text-zinc-300 cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {projBriefingSearch && (
                  <div className="max-h-32 overflow-y-auto space-y-0.5 border border-zinc-800 rounded-xl p-1 bg-[#121214]">
                    {notes
                      .filter(n => {
                        const q = projBriefingSearch.toLowerCase().trim()
                        return (
                          n.title.toLowerCase().includes(q) ||
                          (n.folder && n.folder.toLowerCase().includes(q))
                        )
                      })
                      .map(n => {
                        const isAttached = projBriefingIds.includes(n.id)
                        return (
                          <button
                            key={n.id}
                            type="button"
                            onClick={() => {
                              setProjBriefingIds(prev =>
                                isAttached ? prev.filter(id => id !== n.id) : [...prev, n.id]
                              )
                            }}
                            className={`w-full text-left px-2 py-1 rounded-lg text-xs flex items-center justify-between gap-2 cursor-pointer ${
                              isAttached ? 'bg-zinc-800 text-white font-medium' : 'text-zinc-300 hover:bg-zinc-800/40'
                            }`}
                          >
                            <span className="truncate">{n.title}</span>
                            <div className="flex items-center gap-1.5">
                              {n.folder && <span className="text-[10px] text-zinc-500">{n.folder}</span>}
                              {isAttached && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                            </div>
                          </button>
                        )
                      })}
                  </div>
                )}
              </div>

              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  disabled={!projItem.trim() && !projName.trim()}
                  onClick={handleSaveProject}
                  className="px-4 py-2 rounded-xl bg-zinc-100 hover:bg-white text-zinc-950 font-semibold text-xs disabled:opacity-40 cursor-pointer transition-colors"
                >
                  {editingProject ? 'Atualizar Item de Conteúdo' : 'Salvar Item de Conteúdo'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================================ */}
      {/* MODAL: VINCULAR NOTA VINDA DO EDITOR                                         */}
      {/* ============================================================================ */}
      {pendingNoteBindModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#141416] border border-zinc-800 rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl">
            <div className="text-sm font-semibold text-zinc-100">Usar Nota com um Agente</div>
            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-zinc-400 mb-1">Agente</label>
                <CustomSelect
                  value={pendingNoteBindModal.targetAgentId}
                  onChange={chosenId =>
                    setPendingNoteBindModal({
                      ...pendingNoteBindModal,
                      targetAgentId: chosenId
                    })
                  }
                  options={store.agents.map(a => ({
                    value: a.id,
                    label: a.name
                  }))}
                  className="w-full"
                  size="sm"
                />
              </div>
              <div>
                <label className="block text-zinc-400 mb-1">Papel da nota</label>
                <CustomSelect
                  value={pendingNoteBindModal.role}
                  onChange={chosenRole =>
                    setPendingNoteBindModal({
                      ...pendingNoteBindModal,
                      role: chosenRole as ContextRole
                    })
                  }
                  options={[
                    { value: 'request_context', label: 'Usar apenas neste pedido' },
                    { value: 'template', label: 'Modelo de estrutura' },
                    { value: 'permanent_ref', label: 'Catálogo / Referência fixa' },
                    { value: 'project_context', label: 'Contexto do cliente' }
                  ]}
                  className="w-full"
                  size="sm"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingNoteBindModal(null)}
                className="px-3 py-1.5 rounded-xl bg-zinc-800 text-zinc-300 text-xs cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmNoteFromEditor}
                className="px-4 py-1.5 rounded-xl bg-zinc-100 text-zinc-950 font-semibold text-xs cursor-pointer"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================================ */}
      {/* MODAL: PROTEÇÃO CONTRA SOBRESCRITA DE ARQUIVO EXISTENTE                      */}
      {/* ============================================================================ */}
      {overwritePrompt && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#141416] border border-zinc-800 rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center gap-2 text-amber-400 text-sm font-semibold">
              <AlertTriangle className="w-4 h-4" />
              <span>Nota já existente na pasta "{overwritePrompt.folder}"</span>
            </div>
            <p className="text-xs text-zinc-300">
              Já existe <strong>"{overwritePrompt.existingTitle}"</strong>. Deseja salvar como nova
              revisão ou sobrescrever?
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOverwritePrompt(null)}
                className="px-3 py-1.5 rounded-xl bg-zinc-800 text-zinc-300 text-xs cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() =>
                  handleCommitDeliverable(
                    overwritePrompt.run,
                    overwritePrompt.finalApproval,
                    'overwrite'
                  )
                }
                className="px-3 py-1.5 rounded-xl bg-amber-500/20 text-amber-300 text-xs cursor-pointer"
              >
                Sobrescrever
              </button>
              <button
                type="button"
                onClick={() =>
                  handleCommitDeliverable(
                    overwritePrompt.run,
                    overwritePrompt.finalApproval,
                    'new_revision'
                  )
                }
                className="px-3.5 py-1.5 rounded-xl bg-zinc-100 text-zinc-950 font-semibold text-xs cursor-pointer"
              >
                Criar Nova Revisão
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ============================================================================ */}
      {/* MODAL: PERSONALIZAR AVATAR DO AGENTE                                         */}
      {/* ============================================================================ */}
      {isAvatarPickerOpen && selectedAgent && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#141416] border border-zinc-800 rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl animate-in fade-in zoom-in-95 duration-100 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-zinc-800/80">
              <div>
                <h3 className="text-sm font-semibold text-zinc-100">
                  Personalizar Avatar do Agente
                </h3>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  Selecione o avatar que melhor representa este agente
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsAvatarPickerOpen(false)}
                className="text-zinc-500 hover:text-zinc-200 p-1 cursor-pointer rounded-lg hover:bg-zinc-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Pré-visualização ao vivo */}
            <div className="flex flex-col items-center justify-center py-2 gap-2 bg-[#0e0e10] rounded-xl border border-zinc-850 p-3">
              <AgentIcon
                variant={selectedAgent.icon}
                state={avatarPreviewState}
                size={72}
                className="rounded-2xl shadow-xl"
              />

              {/* Seletor de estado para testar animações ao vivo */}
              <div className="flex items-center gap-1 bg-[#16161a] p-1 rounded-lg border border-zinc-800/80 text-[10px] mt-1">
                <span className="text-zinc-500 px-1 font-medium">Movimento:</span>
                {(
                  [
                    { id: 'waiting', label: 'Aguardando' },
                    { id: 'thinking', label: 'Pensando' },
                    { id: 'executing', label: 'Executando' },
                    { id: 'completed', label: 'Concluído' },
                    { id: 'attention', label: 'Atenção' }
                  ] as const
                ).map(st => (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => setAvatarPreviewState(st.id)}
                    className={`px-2 py-0.5 rounded cursor-pointer transition-colors ${
                      avatarPreviewState === st.id
                        ? 'bg-zinc-700 text-white font-semibold shadow-xs'
                        : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
                    }`}
                  >
                    {st.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Seletor de Avatares */}
            <div className="space-y-1.5">
              <label className="block text-[11px] text-zinc-300 font-semibold">
                Avatar do Agente
              </label>
              <AgentIconPicker
                selectedVariant={selectedAgent.icon}
                state={avatarPreviewState}
                size={38}
                onSelect={(variantId: AgentIconVariant) => {
                  const def = resolveAgentIconVariant(variantId)
                  onUpdateStore(
                    updateAgentProfileWithVersion(store, {
                      ...selectedAgent,
                      icon: def.id,
                      color: def.bg
                    })
                  )
                }}
              />
            </div>

            <div className="flex justify-end pt-2 border-t border-zinc-800/80">
              <button
                type="button"
                onClick={() => setIsAvatarPickerOpen(false)}
                className="px-4 py-1.5 rounded-xl bg-zinc-100 hover:bg-white text-zinc-950 font-semibold text-xs cursor-pointer shadow-sm transition-colors"
              >
                Concluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================================ */}
      {/* MODAL: VINCULAR NOTA DO COFRE AO AGENTE (BUSCA RÁPIDA ESTILO MOVER PARA)   */}
      {/* ============================================================================ */}
      {isNoteBindPickerOpen && selectedAgent && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#141416] border border-zinc-800 rounded-2xl max-w-lg w-full p-5 space-y-4 shadow-2xl animate-in fade-in zoom-in-95 duration-100">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-zinc-100">
                  Vincular Nota do Cofre ao Agente
                </h3>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  Conecte documentos do cofre ao cérebro de <strong>{selectedAgent.name}</strong>.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsNoteBindPickerOpen(false)
                  setSelectedNoteForBind(null)
                  setNoteSearchQuery('')
                }}
                className="text-zinc-500 hover:text-zinc-200 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Campo de Busca Rápida */}
            <div className="relative flex items-center">
              <Search className="w-4 h-4 text-zinc-500 absolute left-3 pointer-events-none" />
              <input
                type="text"
                autoFocus
                value={noteSearchQuery}
                onChange={e => setNoteSearchQuery(e.target.value)}
                placeholder="Buscar nota por título ou pasta..."
                className="w-full bg-[#1c1c1f] border border-zinc-800 rounded-xl pl-9 pr-8 py-2 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-600"
              />
              {noteSearchQuery && (
                <button
                  type="button"
                  onClick={() => setNoteSearchQuery('')}
                  className="absolute right-2.5 text-zinc-500 hover:text-zinc-300 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Lista Filtrada de Notas */}
            <div className="max-h-56 overflow-y-auto space-y-1 pr-1 border border-zinc-800/60 rounded-xl p-1 bg-[#121214]">
              {notes
                .filter(n => {
                  const q = noteSearchQuery.toLowerCase().trim()
                  if (!q) return true
                  return (
                    n.title.toLowerCase().includes(q) ||
                    (n.folder && n.folder.toLowerCase().includes(q))
                  )
                })
                .map(n => {
                  const isSelected = selectedNoteForBind?.id === n.id
                  return (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => setSelectedNoteForBind(n)}
                      className={`w-full text-left px-3 py-2 rounded-xl text-xs flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-zinc-800 text-white font-medium shadow-xs'
                          : 'text-zinc-300 hover:bg-zinc-800/40'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="w-4 h-4 text-zinc-400 shrink-0" />
                        <span className="truncate">{n.title}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {n.folder && (
                          <span className="text-[10px] text-zinc-500 bg-zinc-900 px-1.5 py-0.5 rounded">
                            {n.folder}
                          </span>
                        )}
                        {isSelected && <Check className="w-4 h-4 text-emerald-400" />}
                      </div>
                    </button>
                  )
                })}
            </div>

            {/* Configurações de Papel e Política de Integridade */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block text-[11px] text-zinc-400 mb-1 font-medium">
                  Papel da Nota
                </label>
                <CustomSelect
                  value={bindRole}
                  onChange={r => setBindRole(r as ContextRole)}
                  options={[
                    { value: 'template', label: 'Modelo a seguir (Preserva original)' },
                    { value: 'permanent_ref', label: 'Referência / Catálogo de preços' },
                    { value: 'project_context', label: 'Contexto do Cliente / Briefing' },
                    { value: 'request_context', label: 'Contexto deste pedido (Temporário)' }
                  ]}
                  className="w-full"
                  size="sm"
                />
              </div>

              <div>
                <label className="block text-[11px] text-zinc-400 mb-1 font-medium">
                  Integridade & Versão
                </label>
                <CustomSelect
                  value={bindPolicy}
                  onChange={p => setBindPolicy(p as 'follow_latest' | 'pin_revision')}
                  options={[
                    { value: 'follow_latest', label: '🔄 Acompanhar versão atualizada' },
                    { value: 'pin_revision', label: '🔒 Fixar snapshot imutável' }
                  ]}
                  className="w-full"
                  size="sm"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-zinc-800">
              <span className="text-[11px] text-zinc-500">
                {selectedNoteForBind
                  ? `Selecionada: ${selectedNoteForBind.title}`
                  : 'Selecione uma nota acima para vincular'}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsNoteBindPickerOpen(false)
                    setSelectedNoteForBind(null)
                    setNoteSearchQuery('')
                  }}
                  className="px-3.5 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={!selectedNoteForBind}
                  onClick={handleConfirmBindNote}
                  className="px-4 py-1.5 rounded-xl bg-zinc-100 hover:bg-white text-zinc-950 font-semibold text-xs disabled:opacity-40 cursor-pointer"
                >
                  Vincular ao Agente
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================================ */}
      {/* MODAL: CONFIGURAÇÕES DE IA DO PYRITE (CHAVES, MODELOS, PROVEDORES)          */}
      {/* ============================================================================ */}
      {isAiSettingsModalOpen && (
        <AiSettingsModal
          isOpen={isAiSettingsModalOpen}
          initialTab={aiSettingsInitialTab}
          onClose={() => {
            setIsAiSettingsModalOpen(false)
            loadAiConfigs()
            loadInstalledAiSkills()
          }}
          onConfigSaved={() => {
            loadAiConfigs()
            loadInstalledAiSkills()
          }}
        />
      )}
    </div>
  )
}
