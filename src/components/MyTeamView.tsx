import React, { useState, useEffect, useRef } from 'react'
import type {
  AgentActionPermission,
  AgentArtifact,
  AgentProfileVersion,
  AgentRun,
  AutomationVersion,
  ContextBinding,
  ContextRole,
  MultiAgentStoreState,
  ProjectContext,
  ProposalStatus,
  TeamDefinition
} from '../types/agents'
import type { Note, NoteType, TaskItem } from '../types'
import {
  ROLE_LABELS,
  computeHashSync,
  executeAgentRun,
  executeWorkflowRun,
  resumeWorkflowRun,
  executeAutomationRun,
  formatCentsBRL,
  generateAgentDraftFromPrompt,
  updateAgentProfileWithVersion,
  DEMO_PROJECTS,
  INITIAL_TEAMS,
  INITIAL_WORKFLOWS
} from '../utils/multiAgentEngine'
import { MarkdownRenderer } from './MarkdownRenderer'
import { TeamCanvasEditor } from './TeamCanvasEditor'
import { WorkflowCanvasEditor } from './WorkflowCanvasEditor'
import { RoutineCanvasEditor } from './RoutineCanvasEditor'
import {
  Bot,
  Workflow,
  GitBranch,
  ListTodo,
  CalendarClock,
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
  ArrowLeft,
  ArrowRight,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  CornerUpLeft,
  Smile,
  Mic,
  Pencil,
  Globe,
  Cpu,
  Brain,
  Wrench,
  FolderOpen,
  Maximize2
} from 'lucide-react'

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
  preselectedNoteForBinding?: { noteId: string; role: ContextRole } | null
  onClearPreselectedNote?: () => void
  onLoadDemoSeedNotes?: () => void
}

type PrimarySection = 'agents' | 'teams' | 'workflows' | 'tasks' | 'routines' | 'activity'

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

export const MyTeamView: React.FC<MyTeamViewProps> = ({
  store,
  onUpdateStore,
  notes,
  folders,
  onOpenNote,
  onCreateCommittedNote,
  onCreateTask,
  preselectedNoteForBinding,
  onClearPreselectedNote,
  onLoadDemoSeedNotes
}) => {
  const [activeSection, setActiveSection] = useState<PrimarySection>('agents')
  const [selectedAgentId, setSelectedAgentId] = useState<string>(() => store.agents[0]?.id || '')
  const [selectedProjectId, setSelectedProjectId] = useState<string>('')
  const [selectedRunId, setSelectedRunId] = useState<string | null>(() => store.runs[0]?.id || null)

  // Seleções nos 3 Canvases
  const teams = store.teams?.length ? store.teams : INITIAL_TEAMS
  const workflows = store.workflows?.length ? store.workflows : INITIAL_WORKFLOWS
  const [selectedTeamId, setSelectedTeamId] = useState<string>(() => teams[0]?.id || '')
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string>(() => workflows[0]?.id || '')
  const [selectedRoutineId, setSelectedRoutineId] = useState<string>(() => store.automations[0]?.id || '')

  // Pedido atual e contexto temporário (request_context)
  const [promptInput, setPromptInput] = useState('')
  const [taskPromptInput, setTaskPromptInput] = useState('')
  const [isTaskAgentMenuOpen, setIsTaskAgentMenuOpen] = useState(false)
  const [agentSearchQuery, setAgentSearchQuery] = useState('')
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
    type: 'success' | 'warning' | 'error'
    text: string
  } | null>(null)

  // Estado de formulário para Novo Agente
  const [convDescription, setConvDescription] = useState('')
  const [newAgentDraft, setNewAgentDraft] = useState<AgentProfileVersion | null>(null)

  // Estado de formulário para Novo Projeto/Cliente
  const [editingProject, setEditingProject] = useState<ProjectContext | null>(null)
  const [projName, setProjName] = useState('')
  const [projClient, setProjClient] = useState('')
  const [projDesc, setProjDesc] = useState('')
  const [projBriefingIds, setProjBriefingIds] = useState<string[]>([])

  // Estado para adicionar vínculo de conhecimento na aba Arquivos (Print 04)
  const [bindNoteId, setBindNoteId] = useState<string>('')
  const [bindRole, setBindRole] = useState<ContextRole>('permanent_ref')
  const [bindPolicy] = useState<'follow_latest' | 'pin_revision'>('follow_latest')

  const storeRef = useRef(store)
  storeRef.current = store

  const selectedAgent = store.agents.find(a => a.id === selectedAgentId) || store.agents[0]
  const activeRun = store.runs.find(r => r.id === selectedRunId) || store.runs[0] || null

  const getAgentColor = (agentId?: string) => {
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

  const executeRoutineDirectly = async (
    routine: AutomationVersion,
    _isTest: boolean,
    customPrompt?: string,
    extraNotes?: Note[],
    eventFingerprint?: string
  ) => {
    const currentStore = storeRef.current
    setIsExecuting(true)
    try {
      const promptText = customPrompt || `[Rotina: ${routine.name}] ${routine.description}`
      const res = await executeAutomationRun({
        automation: routine,
        store: currentStore,
        allNotes: notes,
        triggerPrompt: promptText,
        extraRequestNotes: extraNotes,
        eventFingerprint
      })
      if (res.skippedReason) {
        setStatusBanner({ type: 'warning', text: res.skippedReason })
        return
      }
      await onUpdateStore(res.updatedStore)
      if (res.run) {
        setSelectedRunId(res.run.id)
        setSelectedAgentId(res.run.agentId)
        setActiveSection('agents')
        setStatusBanner({
          type: 'success',
          text: `Rotina "${routine.name}" executada com sucesso! Entrega gerada.`
        })
      }
    } finally {
      setIsExecuting(false)
    }
  }

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
    const effectiveProject = store.projects.find(p => p.id === effectiveProjectId)
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
        allProjects: store.projects,
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
        setTaskPromptInput('')
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
          allProjects: store.projects
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

    const runAgent = store.agents.find(a => a.id === run.agentId)
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
    if (!projClient.trim() || !projName.trim()) return
    const nextProj: ProjectContext = {
      id: editingProject?.id || `proj_${Date.now()}`,
      name: projName.trim(),
      clientName: projClient.trim(),
      description: projDesc.trim(),
      folderPath: 'Clientes',
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
    setProjClient('')
    setProjDesc('')
    setProjBriefingIds([])
  }

  const handleAddKnowledgeBinding = async () => {
    if (!selectedAgent || !bindNoteId) return
    const targetNote = notes.find(n => n.id === bindNoteId)
    if (!targetNote) return

    const newBind: ContextBinding = {
      id: `bind_${Date.now()}`,
      targetType: 'note',
      noteId: targetNote.id,
      noteTitle: targetNote.title,
      folderPath: targetNote.folder,
      projectId: bindRole === 'project_context' ? selectedProjectId || undefined : undefined,
      role: bindRole,
      required: bindRole === 'template',
      precedence: bindRole === 'template' ? 100 : 85,
      updatePolicy: bindPolicy,
      pinnedHash: bindPolicy === 'pin_revision' ? computeHashSync(targetNote.content) : undefined,
      pinnedContentSnapshot: bindPolicy === 'pin_revision' ? targetNote.content : undefined
    }

    const updatedAgent: AgentProfileVersion = {
      ...selectedAgent,
      knowledgeBindings: [...selectedAgent.knowledgeBindings, newBind]
    }
    await onUpdateStore(updateAgentProfileWithVersion(store, updatedAgent))
    setBindNoteId('')
  }

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

  const answeredRuns = store.runs.filter(r => r.status === 'completed')
  const workingRuns = store.runs.filter(r => r.status === 'running')
  const waitingRuns = store.runs.filter(r => r.status === 'waiting_user')

  return (
    <div className="flex h-full w-full bg-[#09090b] text-zinc-100 overflow-hidden select-none">
      {/* ============================================================================ */}
      {/* BARRA VERTICAL ESQUERDA DE ÍCONES (Idêntica aos Prints 01, 02, 03 e 04!)     */}
      {/* ============================================================================ */}
      <aside className="w-11 shrink-0 h-full bg-[#09090b] border-r border-zinc-900 flex flex-col items-center py-2.5 gap-1.5 z-30">
        {[
          { id: 'agents' as PrimarySection, icon: Bot, title: 'Agentes' },
          { id: 'teams' as PrimarySection, icon: Workflow, title: 'Equipes' },
          { id: 'workflows' as PrimarySection, icon: GitBranch, title: 'Fluxo de trabalho' },
          { id: 'tasks' as PrimarySection, icon: ListTodo, title: 'Tarefas' },
          { id: 'routines' as PrimarySection, icon: CalendarClock, title: 'Rotinas' },
          { id: 'activity' as PrimarySection, icon: Activity, title: 'Atividade' }
        ].map(nav => {
          const Icon = nav.icon
          const isActive = activeSection === nav.id
          return (
            <button
              key={nav.id}
              type="button"
              onClick={() => setActiveSection(nav.id)}
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
          title="Clientes e Projetos"
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
              <aside className="w-64 shrink-0 h-full bg-[#0c0c0e] border-r border-zinc-900/90 flex flex-col">
                {/* Topo da coluna: Setas e botão + para novo agente */}
                <div className="h-11 px-3 flex items-center justify-between border-b border-zinc-900/80">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                    <span className="text-xs font-medium text-zinc-200">Local</span>
                  </div>
                  <div className="flex items-center gap-1 text-zinc-400">
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
                  </div>
                </div>

                {/* Campo Buscar (Idêntico ao Print 01) */}
                <div className="px-2.5 pt-2.5 pb-1.5">
                  <div className="relative flex items-center">
                    <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 pointer-events-none" />
                    <input
                      type="text"
                      value={agentSearchQuery}
                      onChange={e => setAgentSearchQuery(e.target.value)}
                      placeholder="Buscar"
                      className="w-full bg-[#161618] border border-zinc-800/60 rounded-xl pl-8 pr-2.5 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-700"
                    />
                  </div>
                </div>

                {/* Lista de Agentes estilo OpenBot (Avatar colorido arredondado + Nome + Badge + Hora + Preview) */}
                <div className="flex-1 overflow-y-auto px-2 py-1 space-y-0.5">
                  {filteredAgents.map(ag => {
                    const isSelected = selectedAgent?.id === ag.id
                    const color = getAgentColor(ag.id)
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
                          const firstAgRun = store.runs.find(r => r.agentId === ag.id)
                          setSelectedRunId(firstAgRun?.id || null)
                        }}
                        className={`w-full text-left px-2.5 py-2.5 rounded-xl flex items-center gap-2.5 transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-[#1c1c20] text-zinc-100'
                            : 'hover:bg-[#151518] text-zinc-300'
                        }`}
                      >
                        {/* Avatar colorido com olhinhos do OpenBot */}
                        <div
                          className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold text-xs shrink-0 shadow-sm"
                          style={{ backgroundColor: color }}
                        >
                          <span className="tracking-tighter text-sm">••</span>
                        </div>

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

                  {selectedAgent && (
                    <div className="flex items-center gap-1.5 bg-[#1b1b1f] border border-zinc-800/80 rounded-xl px-2.5 py-1">
                      <span
                        className="w-4 h-4 rounded-md flex items-center justify-center text-[9px] text-white font-bold"
                        style={{ backgroundColor: getAgentColor(selectedAgent.id) }}
                      >
                        ••
                      </span>
                      <span className="text-xs font-medium text-zinc-100 truncate max-w-[160px]">
                        {selectedAgent.name}
                      </span>
                    </div>
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

                {/* Direita: Seletor discreto de Cliente + Modelo (GPT-6.1 Terra · Baixo) + Toggle Configurações */}
                <div className="flex items-center gap-2">
                  {store.projects.length > 0 && (
                    <select
                      value={selectedProjectId}
                      onChange={e => setSelectedProjectId(e.target.value)}
                      className="bg-[#18181b] border border-zinc-800/80 rounded-lg px-2 py-1 text-[11px] text-zinc-300 focus:outline-none cursor-pointer"
                      title="Contexto de cliente opcional"
                    >
                      <option value="" className="bg-[#18181b]">
                        Cliente: Automático
                      </option>
                      {store.projects.map(p => (
                        <option key={p.id} value={p.id} className="bg-[#18181b]">
                          {p.clientName}
                        </option>
                      ))}
                    </select>
                  )}

                  <button
                    type="button"
                    onClick={() => setIsAgentSettingsOpen(v => !v)}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg hover:bg-zinc-800/60 text-xs text-zinc-300 cursor-pointer"
                    title="Modelo e raciocínio"
                  >
                    <Globe className="w-3.5 h-3.5 text-zinc-400" />
                    <span className="font-medium text-zinc-200">GPT-6.1 Terra</span>
                    <span className="text-zinc-500">· {reasoningEffort}</span>
                    <ChevronDown className="w-3 h-3 text-zinc-500" />
                  </button>

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
              <div className="px-6 pb-4 pt-1 shrink-0 relative">
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

                {/* Menu Popover do botão "+" no Composer */}
                {isComposerPlusOpen && (
                  <div className="absolute bottom-16 left-6 w-64 bg-[#18181b] border border-zinc-800 rounded-2xl shadow-2xl p-2 z-40 space-y-1">
                    <div className="px-2 py-1 text-[10px] font-semibold uppercase text-zinc-500">
                      Anexar nota do cofre ao pedido
                    </div>
                    <div className="max-h-40 overflow-y-auto space-y-0.5">
                      {notes.map(n => (
                        <button
                          key={n.id}
                          type="button"
                          onClick={() => {
                            setExtraNoteIds(prev =>
                              prev.includes(n.id) ? prev : [...prev, n.id]
                            )
                            setIsComposerPlusOpen(false)
                          }}
                          className="w-full text-left px-2.5 py-1.5 rounded-xl hover:bg-zinc-800 text-xs text-zinc-200 flex items-center gap-2 truncate cursor-pointer"
                        >
                          <FileText className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                          <span className="truncate">{n.title}</span>
                        </button>
                      ))}
                    </div>
                    <div className="border-t border-zinc-800 pt-1">
                      <label className="flex items-center gap-2 px-2.5 py-1.5 text-xs text-zinc-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={useTeamDelegation}
                          onChange={e => setUseTeamDelegation(e.target.checked)}
                        />
                        <span>Coordenar com equipe</span>
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
                    className="w-7 h-7 rounded-full text-zinc-400 hover:text-zinc-200 flex items-center justify-center shrink-0 cursor-pointer"
                    title="Ditado de voz"
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
                        className="w-16 h-16 rounded-2xl flex items-center justify-center text-white font-bold text-xl shadow-lg"
                        style={{ backgroundColor: getAgentColor(selectedAgent.id) }}
                      >
                        <span className="tracking-tighter text-2xl">••</span>
                      </div>
                      <button
                        type="button"
                        className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-[#1c1c20] border border-zinc-700 text-zinc-200 flex items-center justify-center shadow-md cursor-pointer"
                        title="Editar ícone"
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
                        <div className="flex items-center gap-1 text-zinc-300">
                          <Globe className="w-3 h-3 text-zinc-400" />
                          <span>GPT-6.1 Terra</span>
                          <ChevronDown className="w-3 h-3 text-zinc-500" />
                        </div>
                      </div>

                      <div className="px-3 py-2.5 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2 text-zinc-200 font-medium">
                          <Brain className="w-3.5 h-3.5 text-zinc-400" />
                          <span>Raciocínio</span>
                        </div>
                        <select
                          value={reasoningEffort}
                          onChange={e =>
                            setReasoningEffort(e.target.value as 'Baixo' | 'Médio' | 'Alto')
                          }
                          className="bg-transparent text-xs text-zinc-300 focus:outline-none cursor-pointer"
                        >
                          <option value="Baixo" className="bg-[#18181b]">
                            Baixo
                          </option>
                          <option value="Médio" className="bg-[#18181b]">
                            Médio
                          </option>
                          <option value="Alto" className="bg-[#18181b]">
                            Alto
                          </option>
                        </select>
                      </div>
                    </div>

                    <div className="bg-[#18181b] border border-zinc-800/80 rounded-2xl px-3 py-2.5 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2 text-zinc-200 font-medium">
                        <RefreshCw className="w-3.5 h-3.5 text-zinc-400" />
                        <span>Modelos de reserva</span>
                      </div>
                      <span className="text-zinc-400 flex items-center gap-1">
                        Perguntar antes <ChevronRight className="w-3 h-3" />
                      </span>
                    </div>
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
                          <ChevronRight className="w-3.5 h-3.5 text-zinc-500" />
                        </button>
                        {expandedSettingsSection === 'instructions' && (
                          <div className="p-3 bg-[#131316] border-t border-zinc-800/70 space-y-2.5 text-xs">
                            <div>
                              <label className="block text-[11px] text-zinc-400 mb-1">
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
                                className="w-full h-24 bg-[#18181b] border border-zinc-800 rounded-xl p-2 text-xs text-zinc-200 resize-none focus:outline-none"
                              />
                            </div>
                            <div>
                              <label className="block text-[11px] text-zinc-400 mb-1">
                                Pasta padrão de entrega
                              </label>
                              <select
                                value={selectedAgent.deliverables.targetFolder}
                                onChange={e =>
                                  onUpdateStore(
                                    updateAgentProfileWithVersion(store, {
                                      ...selectedAgent,
                                      deliverables: {
                                        ...selectedAgent.deliverables,
                                        targetFolder: e.target.value
                                      }
                                    })
                                  )
                                }
                                className="w-full bg-[#18181b] border border-zinc-800 rounded-xl px-2.5 py-1.5 text-xs text-zinc-200"
                              >
                                {Array.from(
                                  new Set(['Propostas', 'Escopos', 'Tarefas', ...folders])
                                ).map(f => (
                                  <option key={f} value={f} className="bg-[#18181b]">
                                    {f}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* 2. Memórias (Clientes/Projetos) */}
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
                            <span>Memórias</span>
                          </div>
                          <span className="text-zinc-400 flex items-center gap-1">
                            {store.projects.length} salva <ChevronRight className="w-3.5 h-3.5" />
                          </span>
                        </button>
                        {expandedSettingsSection === 'memories' && (
                          <div className="p-3 bg-[#131316] border-t border-zinc-800/70 space-y-2 text-xs">
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] text-zinc-400">Clientes e Projetos</span>
                              <button
                                type="button"
                                onClick={() => setIsProjectsModalOpen(true)}
                                className="text-[11px] text-zinc-200 hover:underline cursor-pointer"
                              >
                                Gerenciar
                              </button>
                            </div>
                            {store.projects.map(p => (
                              <div
                                key={p.id}
                                className="px-2.5 py-1.5 rounded-lg bg-[#18181b] text-zinc-300 text-[11px] flex items-center justify-between"
                              >
                                <span className="truncate">{p.clientName}</span>
                                <span className="text-zinc-500">{p.briefingNoteIds.length} notas</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* 3. Habilidades (Permissões) */}
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
                            {selectedAgent.allowedActions.length} atribuída{' '}
                            <ChevronRight className="w-3.5 h-3.5" />
                          </span>
                        </button>
                        {expandedSettingsSection === 'skills' && (
                          <div className="p-3 bg-[#131316] border-t border-zinc-800/70 space-y-1.5 text-xs">
                            {(Object.keys(ACTION_PERMISSION_LABELS) as AgentActionPermission[]).map(
                              perm => {
                                const checked = selectedAgent.allowedActions.includes(perm)
                                return (
                                  <label
                                    key={perm}
                                    className="flex items-center gap-2 text-[11px] text-zinc-300 cursor-pointer py-0.5"
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
                                    />
                                    <span>{ACTION_PERMISSION_LABELS[perm]}</span>
                                  </label>
                                )
                              }
                            )}
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
                            <ChevronRight className="w-3.5 h-3.5" />
                          </span>
                        </button>
                        {expandedSettingsSection === 'files' && (
                          <div className="p-3 bg-[#131316] border-t border-zinc-800/70 space-y-2.5 text-xs">
                            {selectedAgent.knowledgeBindings.map(b => (
                              <div
                                key={b.id}
                                className="p-2 rounded-xl bg-[#18181b] border border-zinc-800/80 flex items-center justify-between gap-2"
                              >
                                <div className="min-w-0">
                                  <div className="text-[11px] font-medium text-zinc-200 truncate">
                                    {b.noteTitle || b.folderPath}
                                  </div>
                                  <div className="text-[10px] text-zinc-500">
                                    {ROLE_LABELS[b.role].label}
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
                                  className="text-zinc-500 hover:text-rose-400 p-1 cursor-pointer"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            ))}

                            <div className="space-y-1.5 pt-1 border-t border-zinc-800">
                              <select
                                value={bindNoteId}
                                onChange={e => setBindNoteId(e.target.value)}
                                className="w-full bg-[#18181b] border border-zinc-800 rounded-lg px-2 py-1.5 text-[11px] text-zinc-200"
                              >
                                <option value="" className="bg-[#18181b]">
                                  Vincular nota do cofre...
                                </option>
                                {notes.map(n => (
                                  <option key={n.id} value={n.id} className="bg-[#18181b]">
                                    {n.title}
                                  </option>
                                ))}
                              </select>
                              <div className="flex items-center gap-1.5">
                                <select
                                  value={bindRole}
                                  onChange={e => setBindRole(e.target.value as ContextRole)}
                                  className="flex-1 bg-[#18181b] border border-zinc-800 rounded-lg px-2 py-1 text-[11px] text-zinc-200"
                                >
                                  <option value="template" className="bg-[#18181b]">
                                    Modelo
                                  </option>
                                  <option value="permanent_ref" className="bg-[#18181b]">
                                    Catálogo / Regra
                                  </option>
                                  <option value="project_context" className="bg-[#18181b]">
                                    Contexto Cliente
                                  </option>
                                </select>
                                <button
                                  type="button"
                                  onClick={handleAddKnowledgeBinding}
                                  className="px-2.5 py-1 rounded-lg bg-zinc-100 text-zinc-950 font-semibold text-[11px] cursor-pointer"
                                >
                                  Vincular
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </aside>
            )}
          </div>
        )}

        {/* ========================================================================== */}
        {/* TELA 03: TAREFAS DELEGADAS ("Delegue o trabalho. Volte para uma resposta.")*/}
        {/* ========================================================================== */}
        {activeSection === 'tasks' && (
          <div
            onClick={() => setIsTaskAgentMenuOpen(false)}
            className="flex-1 flex flex-col bg-[#111113] overflow-y-auto"
          >
            {/* Barra superior limpa */}
            <header className="h-11 px-4 border-b border-zinc-900/90 flex items-center gap-3 shrink-0">
              <div className="flex items-center gap-1 text-zinc-500">
                <ArrowLeft className="w-3.5 h-3.5" />
                <ArrowRight className="w-3.5 h-3.5" />
              </div>
              <div className="flex items-center gap-2 text-xs font-medium text-zinc-200">
                <PanelLeft className="w-3.5 h-3.5 text-zinc-400" />
                <span>Tarefas</span>
              </div>
            </header>

            {/* Coluna Central Idêntica ao Print 03 */}
            <div className="max-w-xl w-full mx-auto pt-16 pb-12 px-4 flex flex-col">
              {/* Hero Title */}
              <div className="text-center space-y-1">
                <div className="text-2xl font-semibold text-zinc-400 tracking-tight">
                  Delegue o trabalho.
                </div>
                <div className="text-3xl font-bold text-zinc-100 tracking-tight">
                  Volte para uma{' '}
                  <span className="italic font-serif font-normal text-[#3b82f6]">resposta</span>.
                </div>
                <p className="text-xs text-zinc-500 pt-2 leading-relaxed">
                  Seus agentes trabalham em tarefas em paralelo.
                  <br />
                  Cada resposta espera você aqui.
                </p>
              </div>

              {/* Card de Prompt Centralizado (Idêntico ao Print 03) */}
              <div
                onClick={e => e.stopPropagation()}
                className="mt-7 bg-[#18181b] border border-zinc-800/90 rounded-2xl p-3.5 shadow-2xl"
              >
                <textarea
                  value={taskPromptInput}
                  onChange={e => setTaskPromptInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      if (taskPromptInput.trim()) {
                        handleRunAgent({ isTest: false, overridePrompt: taskPromptInput })
                      }
                    }
                  }}
                  placeholder="O que você quer que seja feito?"
                  className="w-full h-14 bg-transparent text-xs text-zinc-100 placeholder-zinc-500 resize-none focus:outline-none leading-relaxed"
                />

                <div className="flex items-center justify-between pt-2">
                  {/* Seletor de Agente com Menu Dropdown (Idêntico ao Print 03!) */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setIsTaskAgentMenuOpen(v => !v)}
                      className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-[#202024] hover:bg-zinc-800 text-xs font-medium text-zinc-100 transition-colors cursor-pointer"
                    >
                      <span
                        className="w-4 h-4 rounded-md flex items-center justify-center text-[9px] text-white font-bold"
                        style={{ backgroundColor: getAgentColor(selectedAgent?.id) }}
                      >
                        ••
                      </span>
                      <span>{selectedAgent?.name || 'Selecionar Agente'}</span>
                      <ChevronUp className="w-3.5 h-3.5 text-zinc-400" />
                    </button>

                    {isTaskAgentMenuOpen && (
                      <div className="absolute left-0 top-full mt-1.5 w-52 bg-[#18181b] border border-zinc-800 rounded-2xl shadow-2xl p-1.5 z-40 space-y-0.5">
                        {store.agents.map(ag => {
                          const isSelected = ag.id === selectedAgent?.id
                          return (
                            <button
                              key={ag.id}
                              type="button"
                              onClick={() => {
                                setSelectedAgentId(ag.id)
                                setIsTaskAgentMenuOpen(false)
                              }}
                              className="w-full text-left px-2.5 py-2 rounded-xl hover:bg-zinc-800/80 flex items-center justify-between text-xs text-zinc-100 cursor-pointer"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <span
                                  className="w-4 h-4 rounded-md flex items-center justify-center text-[9px] text-white font-bold shrink-0"
                                  style={{ backgroundColor: getAgentColor(ag.id) }}
                                >
                                  ••
                                </span>
                                <span className="truncate font-medium">{ag.name}</span>
                              </div>
                              {isSelected && <Check className="w-3.5 h-3.5 text-zinc-200 shrink-0" />}
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>

                  {/* Direita: Microfone + Botão Circular ↑ */}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="w-7 h-7 rounded-full bg-zinc-800/80 text-zinc-400 hover:text-zinc-200 flex items-center justify-center cursor-pointer"
                      title="Ditado"
                    >
                      <Mic className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={!taskPromptInput.trim() || isExecuting}
                      onClick={() =>
                        handleRunAgent({ isTest: false, overridePrompt: taskPromptInput })
                      }
                      className="w-7 h-7 rounded-full bg-zinc-700 hover:bg-zinc-100 hover:text-zinc-950 text-zinc-200 disabled:opacity-40 flex items-center justify-center transition-colors cursor-pointer"
                      title="Delegar tarefa"
                    >
                      <ArrowUp className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Lista de Tarefas Delegadas abaixo do Composer (Idêntica ao Print 03!) */}
              <div className="mt-8 space-y-5">
                {store.runs.length > 0 ? (
                  <>
                    {/* Respondidas */}
                    {answeredRuns.slice(0, 4).map(run => (
                      <button
                        key={run.id}
                        type="button"
                        onClick={() => {
                          setSelectedAgentId(run.agentId)
                          setSelectedRunId(run.id)
                          setActiveSection('agents')
                        }}
                        className="w-full text-left px-2 py-1.5 rounded-xl hover:bg-zinc-900/80 flex items-center justify-between gap-3 text-xs transition-colors cursor-pointer"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <CheckCircle2 className="w-4 h-4 text-zinc-500 shrink-0" />
                          <span className="text-zinc-300 truncate">{run.prompt}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[11px] text-blue-400 font-medium">Respondida</span>
                          <span
                            className="w-4 h-4 rounded-md flex items-center justify-center text-[8px] text-white font-bold"
                            style={{ backgroundColor: getAgentColor(run.agentId) }}
                          >
                            ••
                          </span>
                        </div>
                      </button>
                    ))}

                    {/* Trabalhando */}
                    <div className="space-y-2">
                      <div className="text-[11px] text-zinc-500 font-medium px-2">
                        Trabalhando <span className="text-zinc-600">{workingRuns.length}</span>
                      </div>
                      {workingRuns.map(run => (
                        <button
                          key={run.id}
                          type="button"
                          onClick={() => {
                            setSelectedAgentId(run.agentId)
                            setSelectedRunId(run.id)
                            setActiveSection('agents')
                          }}
                          className="w-full text-left px-2 py-1.5 rounded-xl hover:bg-zinc-900/80 flex items-center justify-between gap-3 text-xs cursor-pointer"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <RefreshCw className="w-3.5 h-3.5 text-zinc-400 animate-spin shrink-0" />
                            <span className="text-zinc-300 truncate">{run.prompt}</span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-[11px] text-zinc-400">Processando...</span>
                            <span
                              className="w-4 h-4 rounded-md flex items-center justify-center text-[8px] text-white font-bold"
                              style={{ backgroundColor: getAgentColor(run.agentId) }}
                            >
                              ••
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>

                    {/* Em espera */}
                    <div className="space-y-2">
                      <div className="text-[11px] text-zinc-500 font-medium px-2">
                        Em espera <span className="text-zinc-600">{waitingRuns.length}</span>
                      </div>
                      {waitingRuns.map(run => (
                        <button
                          key={run.id}
                          type="button"
                          onClick={() => {
                            setSelectedAgentId(run.agentId)
                            setSelectedRunId(run.id)
                            setActiveSection('agents')
                          }}
                          className="w-full text-left px-2 py-1.5 rounded-xl hover:bg-zinc-900/80 flex items-center justify-between gap-3 text-xs cursor-pointer"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                            <span className="text-zinc-300 truncate">{run.prompt}</span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-[11px] text-zinc-500">Em espera</span>
                            <span
                              className="w-4 h-4 rounded-md flex items-center justify-center text-[8px] text-white font-bold"
                              style={{ backgroundColor: getAgentColor(run.agentId) }}
                            >
                              ••
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  /* Decorative OpenBot TasksEmptyBoard (Idêntico ao Print 03 quando ainda não há tarefas!) */
                  <div className="space-y-5 opacity-75">
                    <div className="px-2 py-1.5 flex items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <CheckCircle2 className="w-4 h-4 text-zinc-600 shrink-0" />
                        <span className="text-zinc-400 truncate">
                          Elabore proposta comercial padronizada com base no catálogo
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[11px] text-blue-400">Respondida</span>
                        <span className="w-4 h-4 rounded-md bg-blue-600 flex items-center justify-center text-[8px] text-white font-bold">
                          ••
                        </span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="text-[11px] text-zinc-500 font-medium px-2">
                        Trabalhando <span className="text-zinc-600">1</span>
                      </div>
                      <div className="px-2 py-1.5 flex items-center justify-between gap-3 text-xs">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <RefreshCw className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                          <span className="text-zinc-400 truncate">
                            Resuma o escopo técnico e monte o cronograma de entregas...
                          </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[11px] text-zinc-400">
                            Lendo Modelo de Proposta.md
                          </span>
                          <span className="w-4 h-4 rounded-md bg-emerald-500 flex items-center justify-center text-[8px] text-white font-bold">
                            ••
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="text-[11px] text-zinc-500 font-medium px-2">
                        Em espera <span className="text-zinc-600">1</span>
                      </div>
                      <div className="px-2 py-1.5 flex items-center justify-between gap-3 text-xs">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Clock className="w-3.5 h-3.5 text-zinc-600 shrink-0" />
                          <span className="text-zinc-500 truncate">
                            Verifique pendências de aprovação de orçamento na pasta Propostas
                          </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[11px] text-zinc-500">Em espera</span>
                          <span className="w-4 h-4 rounded-md bg-blue-600 flex items-center justify-center text-[8px] text-white font-bold">
                            ••
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================== */}
        {/* TELA 02: FLUXO DE TRABALHO (Canvas OpenBot tela cheia — Print 02!)          */}
        {/* ========================================================================== */}
        {activeSection === 'workflows' && (
          <WorkflowCanvasEditor
            workflows={workflows}
            agents={store.agents}
            notes={notes}
            folders={folders}
            selectedWorkflowId={selectedWorkflowId}
            latestNodeStates={activeRun?.workflowNodeStates}
            onSelectWorkflow={setSelectedWorkflowId}
            onSaveWorkflow={async wf => {
              const exists = workflows.some(w => w.id === wf.id)
              const nextWfs = exists
                ? workflows.map(w => (w.id === wf.id ? wf : w))
                : [...workflows, wf]
              await onUpdateStore({ ...store, workflows: nextWfs })
            }}
            onDeleteWorkflow={async wfId => {
              const nextWfs = workflows.filter(w => w.id !== wfId)
              await onUpdateStore({ ...store, workflows: nextWfs })
              if (nextWfs[0]) setSelectedWorkflowId(nextWfs[0].id)
            }}
            onRunWorkflow={async (wf, isTest, prompt) => {
              setIsExecuting(true)
              try {
                const proj = store.projects.find(p => p.id === selectedProjectId)
                const wfRun = await executeWorkflowRun({
                  workflow: wf,
                  allAgents: store.agents,
                  allNotes: notes,
                  allProjects: store.projects,
                  prompt,
                  projectContext: proj,
                  explicitClientName: proj?.clientName,
                  isTestRun: isTest
                })
                await onUpdateStore({
                  ...store,
                  runs: [wfRun, ...store.runs]
                })
                setSelectedRunId(wfRun.id)
                setSelectedAgentId(wfRun.agentId)
                setActiveSection('agents')
              } finally {
                setIsExecuting(false)
              }
            }}
            isExecuting={isExecuting}
          />
        )}

        {/* ========================================================================== */}
        {/* EQUIPES: CANVAS VISUAL DE EQUIPE                                           */}
        {/* ========================================================================== */}
        {activeSection === 'teams' && (
          <TeamCanvasEditor
            teams={teams}
            agents={store.agents}
            notes={notes}
            selectedTeamId={selectedTeamId}
            onSelectTeam={setSelectedTeamId}
            onSaveTeam={async updatedTeam => {
              const exists = teams.some(t => t.id === updatedTeam.id)
              const nextTeams = exists
                ? teams.map(t => (t.id === updatedTeam.id ? updatedTeam : t))
                : [...teams, updatedTeam]
              await onUpdateStore({ ...store, teams: nextTeams })
            }}
            onDeleteTeam={async teamId => {
              const nextTeams = teams.filter(t => t.id !== teamId)
              await onUpdateStore({ ...store, teams: nextTeams })
              if (nextTeams[0]) setSelectedTeamId(nextTeams[0].id)
            }}
            onOpenAgentChat={agentId => {
              setSelectedAgentId(agentId)
              setActiveSection('agents')
            }}
            onRunTeam={(team, isTest, prompt) => {
              const leadId = team.coordinatorAgentId || team.nodes[0]?.agentId || store.agents[0]?.id || ''
              setSelectedAgentId(leadId)
              setUseTeamDelegation(true)
              setActiveSection('agents')
              handleRunAgent({ isTest, overridePrompt: prompt, overrideTeam: team })
            }}
            isExecuting={isExecuting}
          />
        )}

        {/* ========================================================================== */}
        {/* ROTINAS: CANVAS VISUAL DE ROTINAS                                          */}
        {/* ========================================================================== */}
        {activeSection === 'routines' && (
          <RoutineCanvasEditor
            automations={store.automations}
            agents={store.agents}
            teams={teams}
            workflows={workflows}
            projects={store.projects}
            folders={folders}
            selectedRoutineId={selectedRoutineId}
            onSelectRoutine={setSelectedRoutineId}
            onSaveRoutine={async routine => {
              const exists = store.automations.some(a => a.id === routine.id)
              const nextAutos = exists
                ? store.automations.map(a => (a.id === routine.id ? routine : a))
                : [...store.automations, routine]
              await onUpdateStore({ ...store, automations: nextAutos })
            }}
            onDeleteRoutine={async routineId => {
              const nextAutos = store.automations.filter(a => a.id !== routineId)
              await onUpdateStore({ ...store, automations: nextAutos })
              if (nextAutos[0]) setSelectedRoutineId(nextAutos[0].id)
            }}
            onTestRoutine={routine => executeRoutineDirectly(routine, true)}
            isExecuting={isExecuting}
          />
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
      {/* MODAL: CLIENTES E PROJETOS                                                   */}
      {/* ============================================================================ */}
      {isProjectsModalOpen && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#141416] border border-zinc-800 rounded-2xl max-w-xl w-full p-5 space-y-4 shadow-2xl max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <span className="text-sm font-semibold text-zinc-100">Clientes e Projetos</span>
              <button
                type="button"
                onClick={() => setIsProjectsModalOpen(false)}
                className="text-zinc-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2">
              {store.projects.map(p => (
                <div
                  key={p.id}
                  className="p-3 rounded-xl bg-[#1c1c1f] border border-zinc-800 flex items-center justify-between gap-2 text-xs"
                >
                  <div>
                    <div className="font-semibold text-zinc-100">{p.clientName}</div>
                    <div className="text-zinc-400">{p.name}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingProject(p)
                        setProjClient(p.clientName)
                        setProjName(p.name)
                        setProjDesc(p.description || '')
                        setProjBriefingIds(p.briefingNoteIds)
                      }}
                      className="px-2.5 py-1 rounded-lg bg-zinc-800 text-zinc-200 cursor-pointer"
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
                      }}
                      className="text-rose-400 hover:underline px-2 cursor-pointer"
                    >
                      Excluir
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t border-zinc-800 pt-3 space-y-2.5 text-xs">
              <div className="font-semibold text-zinc-200">
                {editingProject ? 'Editar Cliente' : 'Adicionar Cliente'}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={projClient}
                  onChange={e => setProjClient(e.target.value)}
                  placeholder="Nome do Cliente"
                  className="bg-[#1c1c1f] border border-zinc-800 rounded-xl px-3 py-2 text-zinc-100"
                />
                <input
                  type="text"
                  value={projName}
                  onChange={e => setProjName(e.target.value)}
                  placeholder="Projeto"
                  className="bg-[#1c1c1f] border border-zinc-800 rounded-xl px-3 py-2 text-zinc-100"
                />
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleSaveProject}
                  className="px-4 py-1.5 rounded-xl bg-zinc-100 text-zinc-950 font-semibold cursor-pointer"
                >
                  Salvar Cliente
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
                <select
                  value={pendingNoteBindModal.targetAgentId}
                  onChange={e =>
                    setPendingNoteBindModal({
                      ...pendingNoteBindModal,
                      targetAgentId: e.target.value
                    })
                  }
                  className="w-full bg-[#1c1c1f] border border-zinc-800 rounded-xl px-3 py-2 text-zinc-100"
                >
                  {store.agents.map(a => (
                    <option key={a.id} value={a.id} className="bg-[#1c1c1f]">
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-zinc-400 mb-1">Papel da nota</label>
                <select
                  value={pendingNoteBindModal.role}
                  onChange={e =>
                    setPendingNoteBindModal({
                      ...pendingNoteBindModal,
                      role: e.target.value as ContextRole
                    })
                  }
                  className="w-full bg-[#1c1c1f] border border-zinc-800 rounded-xl px-3 py-2 text-zinc-100"
                >
                  <option value="request_context">Usar apenas neste pedido</option>
                  <option value="template">Modelo de estrutura</option>
                  <option value="permanent_ref">Catálogo / Referência fixa</option>
                  <option value="project_context">Contexto do cliente</option>
                </select>
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
    </div>
  )
}
