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
  ProposalStatus
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
  Users,
  GitBranch,
  Clock,
  Activity,
  Plus,
  Play,
  FlaskConical,
  BookOpen,
  Settings,
  AlertTriangle,
  XCircle,
  Sparkles,
  FileText,
  Trash2,
  X,
  Briefcase,
  ShieldAlert,
  RefreshCw,
  StopCircle
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

type PrimarySection = 'agents' | 'teams' | 'workflows' | 'routines' | 'activity'

const ACTION_PERMISSION_LABELS: Record<AgentActionPermission, string> = {
  read_context: 'Ler notas e referências vinculadas',
  prepare_draft: 'Preparar novos documentos na pasta de destino',
  propose_patch: 'Propor edições em notas existentes (exige aprovação)',
  create_tasks: 'Criar tarefas de acompanhamento',
  edit_mindmap: 'Criar ou editar Mapas Mentais por ID',
  edit_diagram: 'Criar ou editar Diagramas por ID',
  delegate_team: 'Coordenar e delegar para equipe de especialistas'
}

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
  const [extraNoteIds, setExtraNoteIds] = useState<string[]>([])
  const [useTeamDelegation, setUseTeamDelegation] = useState(false)
  const [isExecuting, setIsExecuting] = useState(false)
  const abortControllerRef = useRef<AbortController | null>(null)

  // Respostas a perguntas pendentes e resolução de conflitos de preços
  const [answerInputs, setAnswerInputs] = useState<Record<string, string>>({})
  const [conflictChoices, setConflictChoices] = useState<
    Record<string, { chosenValue: string; chosenPriceCents: number }>
  >({})

  // Gavetas e Modais Secundários (todos iniciam FECHADOS para dar 100% de largura ao chat e aos canvases, como no OpenBot!)
  const [isAgentsListDrawerOpen, setIsAgentsListDrawerOpen] = useState(false)
  const [isKnowledgeDrawerOpen, setIsKnowledgeDrawerOpen] = useState(false)
  const [isConfigDrawerOpen, setIsConfigDrawerOpen] = useState(false)
  const [isProjectsModalOpen, setIsProjectsModalOpen] = useState(false)
  const [isNewAgentModalOpen, setIsNewAgentModalOpen] = useState(false)
  const [newAgentTab, setNewAgentTab] = useState<'guided' | 'conversation'>('guided')
  const [attachNoteSelectId, setAttachNoteSelectId] = useState<string>('')
  const [expandedStepsRunIds, setExpandedStepsRunIds] = useState<Record<string, boolean>>({})

  // Modal de seleção de agente quando o usuário clica em "Usar com um agente" no Editor
  const [pendingNoteBindModal, setPendingNoteBindModal] = useState<{
    noteId: string
    role: ContextRole
    targetAgentId: string
  } | null>(null)

  // Modal de colisão de arquivo existente (Achado 2)
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

  // Estado de formulário para Novo Projeto/Cliente (Achado 10)
  const [editingProject, setEditingProject] = useState<ProjectContext | null>(null)
  const [projName, setProjName] = useState('')
  const [projClient, setProjClient] = useState('')
  const [projDesc, setProjDesc] = useState('')
  const [projBriefingIds, setProjBriefingIds] = useState<string[]>([])

  // Estado para adicionar vínculo de conhecimento
  const [bindNoteId, setBindNoteId] = useState<string>('')
  const [bindRole, setBindRole] = useState<ContextRole>('permanent_ref')
  const [bindPolicy, setBindPolicy] = useState<'follow_latest' | 'pin_revision'>('follow_latest')

  const storeRef = useRef(store)
  storeRef.current = store

  const selectedAgent = store.agents.find(a => a.id === selectedAgentId) || store.agents[0]
  const selectedProject = store.projects.find(p => p.id === selectedProjectId)
  const activeRun = store.runs.find(r => r.id === selectedRunId) || store.runs[0] || null

  // 1. Tratar "Usar com um agente" vindo do Editor (Achados 3 e 10):
  // Permite escolher QUAL agente receberá a nota, e quando o papel é `request_context`,
  // anexa APENAS ao pedido atual (`extraNoteIds`) sem alterar o perfil permanente do agente!
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
      // Anexar SOMENTE à execução/pedido atual!
      setExtraNoteIds(prev => (prev.includes(noteId) ? prev : [...prev, noteId]))
      setStatusBanner({
        type: 'success',
        text: `A nota "${targetNote.title}" foi anexada apenas para este pedido com ${targetAgent.name} (não altera o perfil permanente).`
      })
      setPendingNoteBindModal(null)
      return
    }

    // Para papéis permanentes (template, permanent_ref, project_context), vincular ao agente escolhido
    const existing = targetAgent.knowledgeBindings.some(b => b.noteId === targetNote.id && b.role === role)
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
        text: `Nota "${targetNote.title}" vinculada a ${targetAgent.name} como "${ROLE_LABELS[role].label}".`
      })
    }
    setPendingNoteBindModal(null)
  }

  // Execução direta de uma rotina usando o motor determinístico isolado (nunca herda selectedProject da UI!)
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
      const promptText =
        customPrompt || `[Rotina: ${routine.name}] ${routine.description}`
      const res = await executeAutomationRun({
        automation: routine,
        store: currentStore,
        allNotes: notes,
        triggerPrompt: promptText,
        extraRequestNotes: extraNotes,
        eventFingerprint
      })
      if (res.skippedReason) {
        setStatusBanner({
          type: 'warning',
          text: res.skippedReason
        })
        return
      }
      await onUpdateStore(res.updatedStore)
      if (res.run) {
        setSelectedRunId(res.run.id)
        setSelectedAgentId(res.run.agentId)
        setActiveSection('agents')
        setStatusBanner({
          type: 'success',
          text: `Rotina "${routine.name}" executada. Revise o resultado na conversa do agente.`
        })
      }
    } finally {
      setIsExecuting(false)
    }
  }

  // 3. Executar ou Testar Agente (com persistência prévia em `running`, suporte a cancelamento e atualização in-place da mesma Run)
  const handleRunAgent = async (opts: {
    isTest: boolean
    overridePrompt?: string
    overrideProjectId?: string
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

    if (!effectivePrompt) {
      setStatusBanner({
        type: 'warning',
        text: 'Descreva o pedido ou objetivo antes de acionar o agente.'
      })
      return
    }

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
        useTeamDelegation,
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
    } finally {
      setIsExecuting(false)
      abortControllerRef.current = null
    }
  }

  const handleCancelActiveExecution = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      setStatusBanner({
        type: 'warning',
        text: 'Execução cancelada pelo usuário.'
      })
    }
  }

  // 4. Salvar Rascunho vs Aprovar Proposta Final com Retomada de Fluxo Pausado em `approval` e Proteção contra Sobrescrita
  const handleCommitDeliverable = async (
    initialRun: AgentRun,
    finalApproval: boolean,
    conflictStrategy?: 'new_revision' | 'overwrite'
  ) => {
    let run = initialRun

    // Se a execução for um Fluxo pausado em um bloco `approval`, retomar o grafo a partir do bloco de aprovação primeiro!
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
        text: 'Esta execução não possui operação de escrita autorizada (verifique as permissões do agente).'
      })
      return
    }

    if (primaryOp.status === 'committed' && !conflictStrategy) {
      setStatusBanner({
        type: 'warning',
        text: 'Esta entrega já foi salva no cofre. Faça uma nova execução ou edite a nota aberta.'
      })
      return
    }

    // Bloquear aprovação final se houver informações obrigatórias faltantes, placeholders não preenchidos ou conflitos sem decisão (Achado 7)
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
        text: 'Não é possível aprovar como versão final enquanto houver campos obrigatórios pendentes, conflitos de preços ou violação de seção fixa. Resolva abaixo ou salve apenas como rascunho.'
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
      // Solicitar decisão explícita antes de sobrescrever documento existente no cofre!
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

    // Criar tarefas reais derivadas dos itens do escopo se for aprovação final e o agente tiver permissão `create_tasks` (Achado 10)
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

  // 5. Carregar Exemplos de Demonstração sob demanda (sem poluir o espaço principal com botões fixos de João/Maria)
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
      text: 'Exemplos de demonstração carregados (Projetos João Silva e Maria Oliveira disponíveis no seletor de cliente).'
    })
  }

  // 6. CRUD de Projetos / Clientes (Achado 10)
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

  // 7. Adicionar vínculo de nota ao Agente com suporte real a `pin_revision` (Achado 6)
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

  const primaryOpCommitted = activeRun?.changeSet?.operations[0]?.status === 'committed'
  const canApproveFinal =
    activeRun &&
    (!activeRun.calculation ||
      (activeRun.calculation.missingFields.length === 0 &&
        activeRun.calculation.conflicts.every(c => c.resolution !== 'unresolved') &&
        activeRun.calculation.fixedSectionViolations.length === 0))

  return (
    <div className="flex flex-col h-full w-full bg-[#0b0c10] text-zinc-100 overflow-hidden">
      {/* BARRA SUPERIOR UNIFICADA ESTILO OPENBOT (Sem duas sidebars fixas espremendo a tela!) */}
      <header className="px-4 py-2.5 border-b border-zinc-800/80 bg-[#11131a]/95 backdrop-blur-md flex flex-wrap items-center justify-between gap-3 shrink-0 z-30">
        {/* Esquerda: Botão Gaveta de Agentes + SlidingTabs (Conversar com Agentes | Equipes | Fluxos | Rotinas | Atividade) */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            type="button"
            onClick={() => setIsAgentsListDrawerOpen(v => !v)}
            className={`flex items-center gap-2 px-2.5 py-1.5 rounded-xl border text-xs font-semibold transition-colors cursor-pointer ${
              isAgentsListDrawerOpen
                ? 'border-[#c59b27] bg-[#c59b27]/15 text-[#c59b27]'
                : 'border-zinc-800 bg-[#181b24] text-zinc-200 hover:border-zinc-700'
            }`}
            title="Abrir/Fechar gaveta de agentes e clientes"
          >
            <Bot className="w-4 h-4 text-[#c59b27]" />
            <span>{selectedAgent ? `${selectedAgent.icon} ${selectedAgent.name}` : 'Agentes'}</span>
          </button>

          {/* OpenBot SlidingTabs Switcher */}
          <nav className="flex items-center bg-[#161821] p-1 rounded-xl border border-zinc-800/90 gap-1">
            {[
              { id: 'agents' as PrimarySection, label: 'Conversar com Agentes', icon: Bot, count: store.agents.length },
              { id: 'teams' as PrimarySection, label: 'Canvas de Equipe', icon: Users, count: teams.length },
              { id: 'workflows' as PrimarySection, label: 'Canvas de Fluxos', icon: GitBranch, count: workflows.length },
              { id: 'routines' as PrimarySection, label: 'Canvas de Rotinas', icon: Clock, count: store.automations.length },
              { id: 'activity' as PrimarySection, label: 'Atividade', icon: Activity, count: store.runs.length }
            ].map(item => {
              const Icon = item.icon
              const isActive = activeSection === item.id
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveSection(item.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                    isActive
                      ? 'bg-[#c59b27] text-black font-semibold shadow-sm'
                      : 'text-zinc-300 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{item.label}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                      isActive ? 'bg-black/20 text-black' : 'bg-zinc-900 text-zinc-400'
                    }`}
                  >
                    {item.count}
                  </span>
                </button>
              )
            })}
          </nav>
        </div>

        {/* Direita: Seletor de Cliente + Ações Rápidas (Exemplos, Conhecimento, Configurações — abrem só ao clicar!) */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 bg-[#161821] border border-zinc-800 rounded-xl px-2.5 py-1">
            <Briefcase className="w-3.5 h-3.5 text-[#c59b27]" />
            <select
              value={selectedProjectId}
              onChange={e => setSelectedProjectId(e.target.value)}
              className="bg-transparent text-xs text-zinc-200 focus:outline-none"
              title="Cliente ou Projeto ativo"
            >
              <option value="" className="bg-[#161821]">
                Sem cliente fixo (Por pedido)
              </option>
              {store.projects.map(p => (
                <option key={p.id} value={p.id} className="bg-[#161821]">
                  {p.clientName}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setIsProjectsModalOpen(true)}
              className="text-[11px] text-[#c59b27] hover:underline pl-1 border-l border-zinc-800 cursor-pointer"
            >
              Clientes
            </button>
          </div>

          <button
            type="button"
            onClick={handleLoadDemoExamples}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-zinc-800 bg-[#161821] hover:border-zinc-700 text-xs text-zinc-300 hover:text-white cursor-pointer"
            title="Carregar exemplos de demonstração"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#c59b27]" />
            <span className="hidden sm:inline">Exemplos</span>
          </button>

          {activeSection === 'agents' && selectedAgent && (
            <>
              <button
                type="button"
                onClick={() => {
                  setIsKnowledgeDrawerOpen(v => !v)
                  setIsConfigDrawerOpen(false)
                }}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-medium cursor-pointer ${
                  isKnowledgeDrawerOpen
                    ? 'border-[#c59b27] bg-[#c59b27]/15 text-[#c59b27]'
                    : 'border-zinc-800 bg-[#161821] text-zinc-200 hover:border-zinc-700'
                }`}
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>Fontes ({selectedAgent.knowledgeBindings.length})</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsConfigDrawerOpen(v => !v)
                  setIsKnowledgeDrawerOpen(false)
                }}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-medium cursor-pointer ${
                  isConfigDrawerOpen
                    ? 'border-[#c59b27] bg-[#c59b27]/15 text-[#c59b27]'
                    : 'border-zinc-800 bg-[#161821] text-zinc-200 hover:border-zinc-700'
                }`}
              >
                <Settings className="w-3.5 h-3.5" />
                <span>Configurar</span>
              </button>
            </>
          )}
        </div>
      </header>

      {/* Conteúdo Principal em Tela Cheia */}
      <main className="relative flex-1 flex flex-col overflow-hidden">
        {/* Gaveta Deslizante de Agentes à Esquerda (Abre SOMENTE quando o usuário clica no botão do topo!) */}
        {isAgentsListDrawerOpen && (
          <div className="absolute top-0 left-0 bottom-0 w-72 bg-[#141720]/98 backdrop-blur-xl border-r border-zinc-800 z-40 flex flex-col shadow-2xl animate-in slide-in-from-left duration-150">
            <div className="p-3.5 border-b border-zinc-800 flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-400">
                Seus Agentes ({store.agents.length})
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setNewAgentDraft(null)
                    setConvDescription('')
                    setIsNewAgentModalOpen(true)
                  }}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg bg-[#c59b27] text-black font-semibold text-xs hover:bg-[#d4a930] cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Novo</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsAgentsListDrawerOpen(false)}
                  className="p-1 rounded-lg text-zinc-400 hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2.5 space-y-1.5">
              {store.agents.map(ag => {
                const isSelected = selectedAgent?.id === ag.id
                const waitingCount = store.runs.filter(
                  r =>
                    r.agentId === ag.id &&
                    (r.status === 'waiting_user' || r.status === 'waiting_approval')
                ).length
                return (
                  <button
                    key={ag.id}
                    type="button"
                    onClick={() => {
                      setSelectedAgentId(ag.id)
                      setActiveSection('agents')
                      const latestForAgent = store.runs.find(r => r.agentId === ag.id)
                      if (latestForAgent) setSelectedRunId(latestForAgent.id)
                      setIsAgentsListDrawerOpen(false)
                    }}
                    className={`w-full text-left p-2.5 rounded-xl border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-[#1c202c] border-[#c59b27]/60 shadow-md'
                        : 'bg-transparent border-transparent hover:bg-white/5'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="text-xl">{ag.icon}</span>
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-zinc-100 truncate">{ag.name}</div>
                          <div className="text-[11px] text-zinc-400 truncate">
                            {ag.knowledgeBindings.length} fonte(s) • {ag.deliverables.targetFolder}
                          </div>
                        </div>
                      </div>
                      {waitingCount > 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-semibold shrink-0">
                          {waitingCount}
                        </span>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {statusBanner && (
          <div
            className={`px-6 py-2 border-b flex items-center justify-between text-xs shrink-0 ${
              statusBanner.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                : statusBanner.type === 'warning'
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-200'
                : 'bg-rose-500/10 border-rose-500/30 text-rose-200'
            }`}
          >
            <span>{statusBanner.text}</span>
            <button
              type="button"
              onClick={() => setStatusBanner(null)}
              className="text-zinc-400 hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* SEÇÃO 1: CONVERSA DIRETA COM CADA AGENTE (OpenBot AgentThreadView + QuestionPromptBubble + ApprovalCard + Composer) */}
        {activeSection === 'agents' && selectedAgent && (
          <div className="flex-1 flex overflow-hidden relative">
            <div className="flex-1 flex flex-col overflow-hidden bg-[#0b0c10]">
              {/* Faixa rápida de seleção de Agente estilo OpenBot (Clique em qualquer agente para conversar diretamente com ele!) */}
              <div className="px-5 py-2.5 border-b border-zinc-800/80 bg-[#11131a] flex items-center justify-between gap-3 overflow-x-auto shrink-0">
                <div className="flex items-center gap-1.5 overflow-x-auto py-0.5">
                  {store.agents.map(ag => {
                    const isSelected = ag.id === selectedAgent.id
                    const needsYou = store.runs.some(
                      r =>
                        r.agentId === ag.id &&
                        (r.status === 'waiting_user' || r.status === 'waiting_approval')
                    )
                    return (
                      <button
                        key={ag.id}
                        type="button"
                        onClick={() => {
                          setSelectedAgentId(ag.id)
                          const latestForAgent = store.runs.find(r => r.agentId === ag.id)
                          setSelectedRunId(latestForAgent?.id || null)
                        }}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium whitespace-nowrap transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-[#1c202c] border-[#c59b27] text-white shadow-sm'
                            : 'bg-[#151822]/70 border-zinc-800/80 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
                        }`}
                      >
                        <span>{ag.icon}</span>
                        <span>{ag.name}</span>
                        {needsYou && (
                          <span
                            className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"
                            title="Aguardando sua resposta ou aprovação"
                          />
                        )}
                      </button>
                    )
                  })}
                  <button
                    type="button"
                    onClick={() => {
                      setNewAgentDraft(null)
                      setConvDescription('')
                      setIsNewAgentModalOpen(true)
                    }}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-full border border-dashed border-zinc-700 hover:border-[#c59b27] text-xs text-zinc-300 hover:text-[#c59b27] whitespace-nowrap cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Novo Agente</span>
                  </button>
                </div>

                {/* Seletor de conversas/execuções deste agente */}
                {store.runs.filter(r => r.agentId === selectedAgent.id).length > 1 && (
                  <select
                    value={activeRun?.id || ''}
                    onChange={e => setSelectedRunId(e.target.value)}
                    className="bg-[#181b24] border border-zinc-800 rounded-lg px-2.5 py-1 text-xs text-zinc-300 shrink-0"
                  >
                    {store.runs
                      .filter(r => r.agentId === selectedAgent.id)
                      .map(r => (
                        <option key={r.id} value={r.id}>
                          {new Date(r.startedAt).toLocaleTimeString('pt-BR', {
                            hour: '2-digit',
                            minute: '2-digit'
                          })}{' '}
                          — {r.prompt.slice(0, 38)}...
                        </option>
                      ))}
                  </select>
                )}
              </div>

              {/* Stream de Conversa do Agente (OpenBot DirectConversation / AgentThreadView) */}
              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6 max-w-4xl mx-auto w-full">
                {/* Cartão de Boas-Vindas do Agente no topo da thread */}
                <div className="flex items-start gap-3.5 p-4 rounded-2xl border border-zinc-800/80 bg-[#131620]/90">
                  <span
                    className="w-11 h-11 rounded-2xl flex items-center justify-center text-2xl shrink-0 border border-white/10"
                    style={{
                      backgroundColor: `${selectedAgent.color}22`,
                      color: selectedAgent.color
                    }}
                  >
                    {selectedAgent.icon}
                  </span>
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-sm font-bold text-zinc-100">{selectedAgent.name}</h2>
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
                        Online • Pasta {selectedAgent.deliverables.targetFolder}
                      </span>
                      <span className="text-[11px] text-zinc-400">
                        ({selectedAgent.workStyle.tone})
                      </span>
                    </div>
                    <p className="text-xs text-zinc-300 leading-relaxed">
                      {selectedAgent.roleDescription}
                    </p>
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      {selectedAgent.knowledgeBindings.map(b => (
                        <span
                          key={b.id}
                          className="text-[10px] px-2 py-0.5 rounded-md border border-zinc-800 bg-zinc-900/80 text-zinc-300"
                        >
                          📚 {b.noteTitle} ({ROLE_LABELS[b.role].label})
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Se ainda não houver mensagens para este agente, exibir sugestões clicáveis estilo OpenBot */}
                {!activeRun && (
                  <div className="py-8 text-center space-y-4">
                    <p className="text-sm text-zinc-400">
                      Envie uma mensagem abaixo para conversar diretamente com{' '}
                      <strong className="text-zinc-200">{selectedAgent.name}</strong> ou escolha uma
                      sugestão rápida:
                    </p>
                    <div className="flex flex-wrap justify-center gap-2">
                      {[
                        `Gere uma proposta comercial para ${selectedProject?.clientName || 'Construtora Horizonte'} com Site Institucional e Manutenção Mensal no prazo de 3 semanas`,
                        `Analise as notas vinculadas e liste os principais entregáveis e prazos`,
                        `Monte um plano de tarefas acionáveis para o projeto atual`
                      ].map((sug, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => setPromptInput(sug)}
                          className="px-3.5 py-2 rounded-xl border border-zinc-800 bg-[#141720] hover:border-[#c59b27]/50 text-xs text-zinc-300 hover:text-white transition-all cursor-pointer"
                        >
                          "{sug.slice(0, 72)}..."
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Mensagem do Usuário + Turno de Resposta do Agente */}
                {activeRun && (
                  <div className="space-y-4">
                    {/* Bolha da Mensagem do Usuário */}
                    <div className="flex justify-end">
                      <div className="max-w-2xl rounded-2xl rounded-tr-sm bg-[#c59b27]/15 border border-[#c59b27]/40 px-4 py-3 text-sm text-zinc-100 space-y-1.5">
                        <div className="flex items-center justify-between gap-3 text-[11px] text-amber-300/90">
                          <span>Você</span>
                          <span>
                            {new Date(activeRun.startedAt).toLocaleTimeString('pt-BR', {
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </span>
                        </div>
                        <p className="leading-relaxed">{activeRun.prompt}</p>
                        {activeRun.clientName && (
                          <div className="text-[11px] text-amber-200/90 pt-1">
                            Cliente: <strong>{activeRun.clientName}</strong>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Turno do Agente (OpenBot Turn + StepsDisclosure + QuestionPromptBubble + ApprovalCard) */}
                    <div className="flex items-start gap-3">
                      <span
                        className="w-8 h-8 rounded-xl flex items-center justify-center text-base shrink-0 border border-white/10 mt-1"
                        style={{
                          backgroundColor: `${selectedAgent.color}22`,
                          color: selectedAgent.color
                        }}
                      >
                        {selectedAgent.icon}
                      </span>

                      <div className="flex-1 min-w-0 rounded-2xl rounded-tl-sm border border-zinc-800/90 bg-[#141720] p-5 space-y-4 shadow-xl">
                        {/* Cabeçalho do Turno + OpenBot AgentStepsDisclosure */}
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800/80 pb-3">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-bold text-zinc-100">
                              {activeRun.agentName}
                            </span>
                            <span
                              className={`text-[11px] px-2.5 py-0.5 rounded-full font-medium border ${
                                activeRun.status === 'completed'
                                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                                  : activeRun.status === 'waiting_user' ||
                                    activeRun.status === 'waiting_approval'
                                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                                  : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                              }`}
                            >
                              {activeRun.status === 'completed'
                                ? 'Pronto para revisão'
                                : activeRun.status === 'waiting_user'
                                ? 'Aguardando sua resposta'
                                : activeRun.status === 'waiting_approval'
                                ? 'Aguardando aprovação'
                                : activeRun.status === 'cancelled'
                                ? 'Cancelada'
                                : 'Atenção necessária'}
                            </span>

                            {/* OpenBot Collapsible Steps & Sources Disclosure */}
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedStepsRunIds(prev => ({
                                  ...prev,
                                  [activeRun.id]: !prev[activeRun.id]
                                }))
                              }
                              className="text-[11px] px-2.5 py-0.5 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white cursor-pointer"
                            >
                              {activeRun.sourceSnapshots.filter(s => s.available).length} fonte(s) •{' '}
                              {activeRun.subagentSteps.length} etapa(s) da equipe{' '}
                              {expandedStepsRunIds[activeRun.id] ? '▲' : '▼'}
                            </button>
                          </div>

                          {/* Botões de Aprovação / Gravação no Cofre */}
                          {activeRun.changeSet && activeRun.changeSet.operations.length > 0 && (
                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                disabled={primaryOpCommitted}
                                onClick={() => handleCommitDeliverable(activeRun, false)}
                                className="px-3 py-1.5 rounded-xl border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-zinc-100 cursor-pointer disabled:opacity-40"
                              >
                                {primaryOpCommitted ? 'Já salvo no cofre' : 'Salvar Rascunho'}
                              </button>

                              <button
                                type="button"
                                disabled={primaryOpCommitted || !canApproveFinal}
                                onClick={() => handleCommitDeliverable(activeRun, true)}
                                className="px-3.5 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-semibold text-xs cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                              >
                                {activeRun.pausedAtWorkflowNodeId
                                  ? 'Aprovar Fluxo e Salvar Entrega'
                                  : 'Aprovar e Salvar Entrega Final'}
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Detalhes recolhíveis de Fontes e Subagentes (OpenBot AgentStepsDisclosure) */}
                        {expandedStepsRunIds[activeRun.id] && (
                          <div className="p-3.5 rounded-xl bg-[#0e1017] border border-zinc-800/90 space-y-3 text-xs">
                            <div className="flex flex-wrap gap-1.5">
                              {activeRun.sourceSnapshots.map(snap => (
                                <button
                                  key={snap.sourceId}
                                  type="button"
                                  disabled={!snap.available}
                                  onClick={() => onOpenNote(snap.sourceId)}
                                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-zinc-800 bg-zinc-900 hover:border-zinc-700 text-zinc-200 cursor-pointer"
                                >
                                  <FileText className="w-3 h-3 text-[#c59b27]" />
                                  <span>{snap.title}</span>
                                  <span className="text-zinc-500">({ROLE_LABELS[snap.role].label})</span>
                                </button>
                              ))}
                            </div>
                            {activeRun.subagentSteps.length > 0 && (
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-2 border-t border-zinc-800/80">
                                {activeRun.subagentSteps.map(step => (
                                  <div
                                    key={step.id}
                                    className="p-2.5 rounded-lg border border-zinc-800 bg-zinc-900/60"
                                  >
                                    <div className="flex items-center justify-between font-semibold text-zinc-100">
                                      <span>{step.specialistName}</span>
                                      <span
                                        className={
                                          step.status === 'failed'
                                            ? 'text-rose-400 text-[10px]'
                                            : 'text-emerald-400 text-[10px]'
                                        }
                                      >
                                        {step.status === 'failed' ? 'Bloqueado' : 'Concluído'}
                                      </span>
                                    </div>
                                    <p className="text-[11px] text-zinc-400 mt-1">{step.summary}</p>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {activeRun.error && (
                          <div className="p-3.5 rounded-xl border border-rose-500/40 bg-rose-500/10 text-xs text-rose-200 flex items-start gap-2.5">
                            <XCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                            <div>{activeRun.error}</div>
                          </div>
                        )}

                        {/* OpenBot QuestionPromptBubble Inline: Conflitos de Preços */}
                        {activeRun.calculation && activeRun.calculation.conflicts.length > 0 && (
                          <div className="p-4 rounded-xl border border-amber-500/40 bg-amber-500/10 space-y-3">
                            <div className="flex items-center gap-2 text-xs font-semibold text-amber-200">
                              <ShieldAlert className="w-4 h-4 text-amber-400" />
                              <span>Divergência de preços nas fontes — escolha qual valor adotar:</span>
                            </div>
                            {activeRun.calculation.conflicts.map(c => (
                              <div
                                key={c.id}
                                className="p-3 rounded-lg bg-zinc-900/90 border border-zinc-800 flex flex-wrap items-center justify-between gap-3 text-xs"
                              >
                                <span className="font-semibold text-zinc-100">{c.field}</span>
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setConflictChoices(prev => ({
                                        ...prev,
                                        [c.id]: { chosenValue: c.valueA, chosenPriceCents: c.priceACents }
                                      }))
                                    }
                                    className={`px-3 py-1.5 rounded-lg border cursor-pointer ${
                                      conflictChoices[c.id]?.chosenPriceCents === c.priceACents ||
                                      c.chosenPriceCents === c.priceACents
                                        ? 'border-[#c59b27] bg-[#c59b27]/20 text-white font-semibold'
                                        : 'border-zinc-700 bg-zinc-800 text-zinc-300'
                                    }`}
                                  >
                                    {c.sourceA}: {c.valueA}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setConflictChoices(prev => ({
                                        ...prev,
                                        [c.id]: { chosenValue: c.valueB, chosenPriceCents: c.priceBCents }
                                      }))
                                    }
                                    className={`px-3 py-1.5 rounded-lg border cursor-pointer ${
                                      conflictChoices[c.id]?.chosenPriceCents === c.priceBCents ||
                                      c.chosenPriceCents === c.priceBCents
                                        ? 'border-[#c59b27] bg-[#c59b27]/20 text-white font-semibold'
                                        : 'border-zinc-700 bg-zinc-800 text-zinc-300'
                                    }`}
                                  >
                                    {c.sourceB}: {c.valueB}
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* OpenBot QuestionPromptBubble Inline: Perguntas Essenciais */}
                        {activeRun.clarifyingQuestions.length > 0 && (
                          <div className="p-4 rounded-xl border border-amber-500/40 bg-amber-500/10 space-y-3">
                            <div className="flex items-center gap-2 text-xs font-semibold text-amber-200">
                              <AlertTriangle className="w-4 h-4 text-amber-400" />
                              <span>Responda na conversa para concluir a versão final:</span>
                            </div>
                            <ul className="text-xs text-amber-100/90 space-y-1 pl-4 list-disc">
                              {activeRun.clarifyingQuestions.map((q, idx) => (
                                <li key={idx}>{q}</li>
                              ))}
                            </ul>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                              <input
                                type="text"
                                placeholder="Cliente (se pendente)..."
                                value={answerInputs.cliente || ''}
                                onChange={e =>
                                  setAnswerInputs(prev => ({ ...prev, cliente: e.target.value }))
                                }
                                className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-zinc-100"
                              />
                              <input
                                type="text"
                                placeholder="Prazo estimado (ex: 4 semanas)..."
                                value={answerInputs.prazo || ''}
                                onChange={e =>
                                  setAnswerInputs(prev => ({ ...prev, prazo: e.target.value }))
                                }
                                className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-zinc-100"
                              />
                            </div>
                            <div className="flex justify-end">
                              <button
                                type="button"
                                onClick={() =>
                                  handleRunAgent({
                                    isTest: activeRun.isTestRun,
                                    existingRunToUpdate: activeRun
                                  })
                                }
                                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#c59b27] text-black font-semibold text-xs cursor-pointer"
                              >
                                <RefreshCw className="w-3.5 h-3.5" />
                                <span>Enviar Respostas para {selectedAgent.name}</span>
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Resumo Financeiro Determinístico em Centavos */}
                        {activeRun.calculation && activeRun.calculation.items.length > 0 && (
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
                            <div className="p-3 rounded-xl bg-zinc-900/80 border border-zinc-800">
                              <div className="text-[11px] text-zinc-400">Subtotal Bruto</div>
                              <div className="text-sm font-bold text-zinc-100 mt-0.5">
                                {formatCentsBRL(activeRun.calculation.grossTotalCents)}
                              </div>
                            </div>
                            <div className="p-3 rounded-xl bg-zinc-900/80 border border-zinc-800">
                              <div className="text-[11px] text-zinc-400">Descontos Autorizados</div>
                              <div className="text-sm font-bold text-emerald-400 mt-0.5">
                                - {formatCentsBRL(activeRun.calculation.totalDiscountCents)}
                              </div>
                            </div>
                            <div className="p-3 rounded-xl bg-zinc-900/80 border border-[#c59b27]/40">
                              <div className="text-[11px] text-zinc-400">Valor Líquido Final</div>
                              <div className="text-sm font-bold text-[#c59b27] mt-0.5">
                                {formatCentsBRL(activeRun.calculation.netTotalCents)}
                              </div>
                            </div>
                            <div className="p-3 rounded-xl bg-zinc-900/80 border border-zinc-800">
                              <div className="text-[11px] text-zinc-400">Entrada & Parcelas</div>
                              <div className="text-xs font-semibold text-zinc-200 mt-0.5">
                                {activeRun.calculation.downPaymentCents > 0 &&
                                activeRun.calculation.installments > 1
                                  ? `Entrada ${formatCentsBRL(activeRun.calculation.downPaymentCents)} + ${
                                      activeRun.calculation.installments
                                    }x ${formatCentsBRL(activeRun.calculation.installmentValueCents)}`
                                  : `${activeRun.calculation.installments}x de ${formatCentsBRL(
                                      activeRun.calculation.installmentValueCents
                                    )}`}
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Prévia do Documento na Conversa */}
                        {activeRun.draftContent && (
                          <div className="rounded-xl border border-zinc-800 bg-[#0e1017] p-5">
                            <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 mb-3">
                              Entrega Preparada por {activeRun.agentName}
                            </div>
                            <div className="prose prose-invert max-w-none text-sm leading-relaxed">
                              <MarkdownRenderer
                                content={activeRun.draftContent}
                                onNavigate={(title: string) => {
                                  const found = notes.find(
                                    n => n.title.toLowerCase().trim() === title.toLowerCase().trim()
                                  )
                                  if (found) onOpenNote(found.id)
                                }}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* COMPOSER INFERIOR ESTILO OPENBOT (Sempre acessível na base da conversa!) */}
              <div className="px-6 py-3.5 border-t border-zinc-800/80 bg-[#11131a] shrink-0">
                <div className="max-w-4xl mx-auto space-y-2.5">
                  {/* Notas anexadas apenas a este pedido + Seletor rápido de anexo */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <select
                        value={attachNoteSelectId}
                        onChange={e => {
                          const id = e.target.value
                          if (id && !extraNoteIds.includes(id)) {
                            setExtraNoteIds(prev => [...prev, id])
                          }
                          setAttachNoteSelectId('')
                        }}
                        className="bg-[#181b24] border border-zinc-800 rounded-lg px-2.5 py-1 text-xs text-zinc-300"
                      >
                        <option value="">+ Anexar nota a este pedido...</option>
                        {notes.map(n => (
                          <option key={n.id} value={n.id}>
                            {n.title} ({n.folder})
                          </option>
                        ))}
                      </select>

                      {extraNoteIds.map(id => {
                        const n = notes.find(item => item.id === id)
                        if (!n) return null
                        return (
                          <span
                            key={id}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-cyan-500/15 border border-cyan-500/30 text-[11px] text-cyan-200"
                          >
                            <span>{n.title}</span>
                            <button
                              type="button"
                              onClick={() => setExtraNoteIds(prev => prev.filter(x => x !== id))}
                              className="hover:text-white cursor-pointer"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </span>
                        )
                      })}
                    </div>

                    {selectedAgent.limits.allowDelegation &&
                      selectedAgent.allowedActions.includes('delegate_team') && (
                        <label className="flex items-center gap-1.5 text-xs text-zinc-300 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={useTeamDelegation}
                            onChange={e => setUseTeamDelegation(e.target.checked)}
                            className="accent-[#c59b27]"
                          />
                          <span>Coordenar especialistas da equipe</span>
                        </label>
                      )}
                  </div>

                  {/* Caixa de Mensagem + Botões Simular / Enviar / Parar */}
                  <div className="flex items-end gap-2.5">
                    <textarea
                      rows={2}
                      value={promptInput}
                      onChange={e => setPromptInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault()
                          handleRunAgent({ isTest: false })
                        }
                      }}
                      placeholder={`Conversar com ${selectedAgent.name} (${
                        selectedProject ? `Cliente: ${selectedProject.clientName}` : 'Digite seu pedido...'
                      }) — Enter envia, Shift+Enter quebra linha`}
                      className="flex-1 bg-[#181b24] border border-zinc-700/80 rounded-2xl px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-[#c59b27] resize-none leading-relaxed"
                    />

                    {isExecuting ? (
                      <button
                        type="button"
                        onClick={handleCancelActiveExecution}
                        className="flex items-center gap-1.5 px-4 py-3 rounded-2xl border border-rose-500/50 bg-rose-500/15 text-rose-200 text-xs font-semibold cursor-pointer"
                      >
                        <StopCircle className="w-4 h-4" />
                        <span>Parar</span>
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => handleRunAgent({ isTest: true })}
                          className="flex items-center gap-1.5 px-3.5 py-3 rounded-2xl border border-zinc-700 bg-[#181b24] hover:bg-zinc-800 text-xs font-medium text-zinc-200 cursor-pointer"
                          title="Simular sem gravar no cofre"
                        >
                          <FlaskConical className="w-4 h-4 text-amber-400" />
                          <span>Simular</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRunAgent({ isTest: false })}
                          className="flex items-center gap-1.5 px-5 py-3 rounded-2xl bg-[#c59b27] hover:bg-[#d4a930] text-black font-semibold text-xs cursor-pointer shadow-md"
                        >
                          <Play className="w-4 h-4 fill-current" />
                          <span>Enviar</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Gaveta Direita 1: Conhecimento Vinculado */}
            {isKnowledgeDrawerOpen && (
              <div className="w-96 border-l border-zinc-800/80 bg-[#14141b] p-5 overflow-y-auto space-y-5 shrink-0">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-zinc-100">
                    Conhecimento de {selectedAgent.name}
                  </h3>
                  <button
                    type="button"
                    onClick={() => setIsKnowledgeDrawerOpen(false)}
                    className="text-zinc-400 hover:text-white cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-2.5">
                  {selectedAgent.knowledgeBindings.map(bind => (
                    <div
                      key={bind.id}
                      className="p-3 rounded-xl border border-zinc-800 bg-zinc-900/70 space-y-1.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-zinc-100 truncate">
                          {bind.noteTitle}
                        </span>
                        <button
                          type="button"
                          onClick={async () => {
                            const updated: AgentProfileVersion = {
                              ...selectedAgent,
                              knowledgeBindings: selectedAgent.knowledgeBindings.filter(
                                b => b.id !== bind.id
                              )
                            }
                            await onUpdateStore(updateAgentProfileWithVersion(store, updated))
                          }}
                          className="text-zinc-500 hover:text-rose-400 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-zinc-400">
                        <span
                          className="px-2 py-0.5 rounded font-medium"
                          style={{
                            backgroundColor: `${ROLE_LABELS[bind.role].badgeColor}22`,
                            color: ROLE_LABELS[bind.role].badgeColor
                          }}
                        >
                          {ROLE_LABELS[bind.role].label}
                        </span>
                        <span>
                          •{' '}
                          {bind.updatePolicy === 'pin_revision'
                            ? 'Revisão fixada'
                            : 'Acompanha nota atual'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Adicionar nova nota de referência */}
                <div className="pt-4 border-t border-zinc-800 space-y-3">
                  <div className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                    Vincular Nota do Cofre
                  </div>
                  <select
                    value={bindNoteId}
                    onChange={e => setBindNoteId(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-100"
                  >
                    <option value="">Selecione uma nota...</option>
                    {notes.map(n => (
                      <option key={n.id} value={n.id}>
                        {n.title} ({n.folder})
                      </option>
                    ))}
                  </select>

                  <select
                    value={bindRole}
                    onChange={e => setBindRole(e.target.value as ContextRole)}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-100"
                  >
                    {(['template', 'permanent_ref', 'project_context'] as ContextRole[]).map(r => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r].label}
                      </option>
                    ))}
                  </select>

                  <select
                    value={bindPolicy}
                    onChange={e => setBindPolicy(e.target.value as 'follow_latest' | 'pin_revision')}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-100"
                  >
                    <option value="follow_latest">Acompanhar versão mais recente da nota</option>
                    <option value="pin_revision">Fixar revisão atual (Snapshot imutável)</option>
                  </select>

                  <button
                    type="button"
                    disabled={!bindNoteId}
                    onClick={handleAddKnowledgeBinding}
                    className="w-full py-2 rounded-lg bg-[#c59b27] text-black font-semibold text-xs cursor-pointer disabled:opacity-40"
                  >
                    Vincular Conhecimento
                  </button>
                </div>
              </div>
            )}

            {/* Gaveta Direita 2: Configurações e Permissões do Agente */}
            {isConfigDrawerOpen && (
              <div className="w-96 border-l border-zinc-800/80 bg-[#14141b] p-5 overflow-y-auto space-y-5 shrink-0">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-zinc-100">
                    Configurações de {selectedAgent.name}
                  </h3>
                  <button
                    type="button"
                    onClick={() => setIsConfigDrawerOpen(false)}
                    className="text-zinc-400 hover:text-white cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Pasta de Entrega Autorizada</label>
                  <select
                    value={selectedAgent.deliverables.targetFolder}
                    onChange={async e => {
                      const updated: AgentProfileVersion = {
                        ...selectedAgent,
                        deliverables: {
                          ...selectedAgent.deliverables,
                          targetFolder: e.target.value
                        }
                      }
                      await onUpdateStore(updateAgentProfileWithVersion(store, updated))
                    }}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-100"
                  >
                    {folders.map(f => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                    Permissões Autorizadas
                  </div>
                  {(Object.keys(ACTION_PERMISSION_LABELS) as AgentActionPermission[]).map(perm => {
                    const checked = selectedAgent.allowedActions.includes(perm)
                    return (
                      <label
                        key={perm}
                        className="flex items-center gap-2.5 p-2 rounded-lg border border-zinc-800 bg-zinc-900/60 text-xs text-zinc-200 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={async () => {
                            const nextPerms = checked
                              ? selectedAgent.allowedActions.filter(p => p !== perm)
                              : [...selectedAgent.allowedActions, perm]
                            const updated: AgentProfileVersion = {
                              ...selectedAgent,
                              allowedActions: nextPerms
                            }
                            await onUpdateStore(updateAgentProfileWithVersion(store, updated))
                          }}
                          className="accent-[#c59b27]"
                        />
                        <span>{ACTION_PERMISSION_LABELS[perm]}</span>
                      </label>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* SEÇÃO 2: EQUIPES (Canvas 1) */}
        {activeSection === 'teams' && (
          <TeamCanvasEditor
            teams={teams}
            agents={store.agents}
            notes={notes}
            selectedTeamId={selectedTeamId}
            onSelectTeam={setSelectedTeamId}
            onCreateAgentInline={async newAgent => {
              const nextStore = updateAgentProfileWithVersion(storeRef.current, newAgent)
              await onUpdateStore(nextStore)
            }}
            onOpenAgentChat={agentId => {
              setSelectedAgentId(agentId)
              const latestForAgent = store.runs.find(r => r.agentId === agentId)
              setSelectedRunId(latestForAgent?.id || null)
              setActiveSection('agents')
            }}
            onSaveTeam={async updatedTeam => {
              const current = storeRef.current
              const currTeams = current.teams?.length ? current.teams : INITIAL_TEAMS
              const exists = currTeams.some(t => t.id === updatedTeam.id)
              const nextTeams = exists
                ? currTeams.map(t => (t.id === updatedTeam.id ? updatedTeam : t))
                : [...currTeams, updatedTeam]
              await onUpdateStore({ ...current, teams: nextTeams })
            }}
            onDeleteTeam={async teamId => {
              const nextTeams = teams.filter(t => t.id !== teamId)
              await onUpdateStore({ ...store, teams: nextTeams })
              if (nextTeams[0]) setSelectedTeamId(nextTeams[0].id)
            }}
            onRunTeam={async (team, isTest, prompt) => {
              const coord =
                store.agents.find(a => a.id === team.coordinatorAgentId) || store.agents[0]
              if (!coord) return
              setIsExecuting(true)
              try {
                const run = await executeAgentRun({
                  agent: coord,
                  allAgents: store.agents,
                  allNotes: notes,
                  allProjects: store.projects,
                  prompt,
                  isTestRun: isTest,
                  projectContext: selectedProject,
                  explicitClientName: selectedProject?.clientName,
                  useTeamDelegation: true,
                  teamDefinition: team
                })
                await onUpdateStore({
                  ...store,
                  runs: [run, ...store.runs]
                })
                setSelectedRunId(run.id)
                setSelectedAgentId(coord.id)
                setActiveSection('agents')
              } finally {
                setIsExecuting(false)
              }
            }}
            isExecuting={isExecuting}
          />
        )}

        {/* SEÇÃO 3: FLUXOS (Canvas 2) */}
        {activeSection === 'workflows' && (
          <WorkflowCanvasEditor
            workflows={workflows}
            agents={store.agents}
            notes={notes}
            folders={folders}
            selectedWorkflowId={selectedWorkflowId}
            latestNodeStates={activeRun?.workflowNodeStates}
            onSelectWorkflow={setSelectedWorkflowId}
            onSaveWorkflow={async updatedWf => {
              const exists = workflows.some(w => w.id === updatedWf.id)
              const nextWfs = exists
                ? workflows.map(w => (w.id === updatedWf.id ? updatedWf : w))
                : [...workflows, updatedWf]
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
                const run = await executeWorkflowRun({
                  workflow: wf,
                  allAgents: store.agents,
                  allNotes: notes,
                  allProjects: store.projects,
                  prompt,
                  projectContext: selectedProject,
                  explicitClientName: selectedProject?.clientName,
                  isTestRun: isTest
                })
                await onUpdateStore({
                  ...store,
                  runs: [run, ...store.runs]
                })
                setSelectedRunId(run.id)
                setStatusBanner({
                  type: 'success',
                  text: `Fluxo "${wf.name}" executado. Veja o status de cada bloco no Canvas ou abra em Agentes para aprovar.`
                })
              } finally {
                setIsExecuting(false)
              }
            }}
            isExecuting={isExecuting}
          />
        )}

        {/* SEÇÃO 4: ROTINAS (Canvas 3: Modo Simples + Modo Visual Sincronizados) */}
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
            onSaveRoutine={async updatedAuto => {
              const exists = store.automations.some(a => a.id === updatedAuto.id)
              const nextAutos = exists
                ? store.automations.map(a => (a.id === updatedAuto.id ? updatedAuto : a))
                : [...store.automations, updatedAuto]
              await onUpdateStore({ ...store, automations: nextAutos })
            }}
            onDeleteRoutine={async autoId => {
              const nextAutos = store.automations.filter(a => a.id !== autoId)
              await onUpdateStore({ ...store, automations: nextAutos })
              if (nextAutos[0]) setSelectedRoutineId(nextAutos[0].id)
            }}
            onTestRoutine={routine => executeRoutineDirectly(routine, true)}
            isExecuting={isExecuting}
          />
        )}

        {/* SEÇÃO 5: ATIVIDADE & HISTÓRICO */}
        {activeSection === 'activity' && (
          <div className="flex-1 overflow-y-auto p-6 max-w-5xl mx-auto w-full space-y-6">
            <div>
              <h2 className="text-lg font-bold text-zinc-100">Atividade e Entregas</h2>
              <p className="text-sm text-zinc-400">
                Histórico de execuções, fontes consultadas e documentos gerados pela sua equipe.
              </p>
            </div>

            {store.runs.length === 0 ? (
              <div className="p-8 rounded-2xl border border-zinc-800 bg-[#14141b] text-center text-sm text-zinc-400">
                Nenhuma atividade registrada neste cofre ainda.
              </div>
            ) : (
              <div className="space-y-3">
                {store.runs.map(run => (
                  <div
                    key={run.id}
                    className="p-4 rounded-xl border border-zinc-800 bg-[#14141b] flex flex-wrap items-center justify-between gap-4"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-zinc-100">{run.agentName}</span>
                        {run.clientName && (
                          <span className="text-xs px-2 py-0.5 rounded bg-zinc-800 text-zinc-300">
                            {run.clientName}
                          </span>
                        )}
                        <span className="text-xs text-zinc-500">
                          {new Date(run.startedAt).toLocaleString('pt-BR')}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-400">{run.prompt}</p>
                      <div className="text-xs text-zinc-500">
                        Fontes usadas: {run.sourceSnapshots.filter(s => s.available).map(s => s.title).join(', ') || 'Nenhuma'}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setSelectedRunId(run.id)
                        setSelectedAgentId(run.agentId)
                        setActiveSection('agents')
                      }}
                      className="px-3.5 py-1.5 rounded-lg border border-zinc-700 hover:border-[#c59b27] text-xs font-medium text-zinc-200 cursor-pointer"
                    >
                      Ver Detalhes
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Modal 1: Escolher Agente ao clicar em "Usar com um agente" no Editor (Achado 10) */}
      {pendingNoteBindModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-[#15151d] p-6 space-y-4 shadow-2xl">
            <h3 className="text-base font-bold text-zinc-100">Usar nota com qual agente?</h3>
            <p className="text-xs text-zinc-400">
              Papel selecionado: <strong>{ROLE_LABELS[pendingNoteBindModal.role].label}</strong>
            </p>
            <select
              value={pendingNoteBindModal.targetAgentId}
              onChange={e =>
                setPendingNoteBindModal({ ...pendingNoteBindModal, targetAgentId: e.target.value })
              }
              className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3.5 py-2.5 text-sm text-zinc-100"
            >
              {store.agents.map(a => (
                <option key={a.id} value={a.id}>
                  {a.icon} {a.name}
                </option>
              ))}
            </select>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPendingNoteBindModal(null)}
                className="px-4 py-2 rounded-lg border border-zinc-700 text-xs text-zinc-300 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmNoteFromEditor}
                className="px-4 py-2 rounded-lg bg-[#c59b27] text-black font-semibold text-xs cursor-pointer"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 2: Proteção contra Sobrescrita de Entrega Existente (Achado 2) */}
      {overwritePrompt && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl border border-amber-500/40 bg-[#15151d] p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-2 text-amber-300 font-bold text-base">
              <AlertTriangle className="w-5 h-5" />
              <span>Documento já existe na pasta "{overwritePrompt.folder}"</span>
            </div>
            <p className="text-sm text-zinc-300 leading-relaxed">
              Já existe uma entrega chamada <strong>"{overwritePrompt.existingTitle}"</strong>. Para proteger seus documentos anteriores, escolha como deseja salvar:
            </p>
            <div className="flex flex-wrap justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setOverwritePrompt(null)}
                className="px-3.5 py-2 rounded-lg border border-zinc-700 text-xs text-zinc-300 cursor-pointer"
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
                className="px-3.5 py-2 rounded-lg border border-amber-500/50 bg-amber-500/10 text-xs font-medium text-amber-200 cursor-pointer"
              >
                Substituir Arquivo Existente
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
                className="px-4 py-2 rounded-lg bg-[#c59b27] text-black font-semibold text-xs cursor-pointer"
              >
                Salvar como Nova Revisão (Recomendado)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 3: Gerenciar Clientes / Projetos (CRUD Completo - Achado 10) */}
      {isProjectsModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-zinc-800 bg-[#15151d] p-6 space-y-5 shadow-2xl max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Briefcase className="w-5 h-5 text-[#c59b27]" />
                <h3 className="text-base font-bold text-zinc-100">Clientes e Projetos</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsProjectsModalOpen(false)}
                className="text-zinc-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input
                type="text"
                placeholder="Nome do Cliente (ex: Construtora Horizonte)"
                value={projClient}
                onChange={e => setProjClient(e.target.value)}
                className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100"
              />
              <input
                type="text"
                placeholder="Nome do Projeto (ex: Site Institucional)"
                value={projName}
                onChange={e => setProjName(e.target.value)}
                className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100"
              />
            </div>

            <div>
              <label className="block text-xs text-zinc-400 mb-1.5">
                Notas de Briefing deste Cliente (Isolamento estrito)
              </label>
              <div className="max-h-36 overflow-y-auto space-y-1 p-2 rounded-lg border border-zinc-800 bg-zinc-900/60">
                {notes.map(n => {
                  const checked = projBriefingIds.includes(n.id)
                  return (
                    <label key={n.id} className="flex items-center gap-2 text-xs text-zinc-200 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setProjBriefingIds(prev =>
                            checked ? prev.filter(x => x !== n.id) : [...prev, n.id]
                          )
                        }
                        className="accent-[#c59b27]"
                      />
                      <span>
                        {n.title} ({n.folder})
                      </span>
                    </label>
                  )
                })}
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleSaveProject}
                className="px-4 py-2 rounded-lg bg-[#c59b27] text-black font-semibold text-xs cursor-pointer"
              >
                {editingProject ? 'Atualizar Cliente/Projeto' : 'Adicionar Cliente/Projeto'}
              </button>
            </div>

            <div className="space-y-2 pt-3 border-t border-zinc-800">
              {store.projects.map(p => (
                <div
                  key={p.id}
                  className="p-3 rounded-xl border border-zinc-800 bg-zinc-900/60 flex items-center justify-between text-xs"
                >
                  <div>
                    <div className="font-semibold text-zinc-100">{p.clientName}</div>
                    <div className="text-zinc-400">
                      {p.name} • {p.briefingNoteIds.length} nota(s) vinculada(s)
                    </div>
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
                      className="px-2.5 py-1 rounded border border-zinc-700 text-zinc-200 cursor-pointer"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        const next = store.projects.filter(item => item.id !== p.id)
                        await onUpdateStore({ ...store, projects: next })
                        if (selectedProjectId === p.id) setSelectedProjectId('')
                      }}
                      className="text-rose-400 hover:underline cursor-pointer"
                    >
                      Remover
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Modal 4: Novo Agente (Guiado ou Por Conversa dentro de um único modal limpo) */}
      {isNewAgentModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="w-full max-w-xl rounded-2xl border border-zinc-800 bg-[#15151d] p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-zinc-100">Criar Novo Agente</h3>
              <button
                type="button"
                onClick={() => setIsNewAgentModalOpen(false)}
                className="text-zinc-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex gap-2 bg-zinc-900 p-1 rounded-xl border border-zinc-800">
              <button
                type="button"
                onClick={() => setNewAgentTab('conversation')}
                className={`flex-1 py-1.5 rounded-lg text-xs font-medium cursor-pointer ${
                  newAgentTab === 'conversation' ? 'bg-zinc-800 text-white' : 'text-zinc-400'
                }`}
              >
                Criar por Conversa
              </button>
              <button
                type="button"
                onClick={() => setNewAgentTab('guided')}
                className={`flex-1 py-1.5 rounded-lg text-xs font-medium cursor-pointer ${
                  newAgentTab === 'guided' ? 'bg-zinc-800 text-white' : 'text-zinc-400'
                }`}
              >
                Configuração Guiada
              </button>
            </div>

            <div className="space-y-3">
              <label className="block text-xs text-zinc-400">
                Descreva o que este agente deve fazer e quais entregas ele deve produzir:
              </label>
              <textarea
                rows={3}
                value={convDescription}
                onChange={e => setConvDescription(e.target.value)}
                placeholder="Ex: Preciso de um especialista que leia meu modelo comercial e tabela de preços e monte propostas sem alterar o modelo original..."
                className="w-full bg-zinc-900 border border-zinc-700 rounded-xl p-3 text-sm text-zinc-100"
              />
              <button
                type="button"
                onClick={() => {
                  if (!convDescription.trim()) return
                  const generated = generateAgentDraftFromPrompt(convDescription, notes)
                  setNewAgentDraft(generated.draft)
                }}
                className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-zinc-100 cursor-pointer"
              >
                Gerar Proposta de Configuração Segura
              </button>
            </div>

            {newAgentDraft && (
              <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/70 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">Nome do Agente</label>
                    <input
                      type="text"
                      value={newAgentDraft.name}
                      onChange={e =>
                        setNewAgentDraft({ ...newAgentDraft, name: e.target.value })
                      }
                      className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-zinc-100"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">Pasta de Entrega</label>
                    <select
                      value={newAgentDraft.deliverables.targetFolder}
                      onChange={e =>
                        setNewAgentDraft({
                          ...newAgentDraft,
                          deliverables: {
                            ...newAgentDraft.deliverables,
                            targetFolder: e.target.value
                          }
                        })
                      }
                      className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-zinc-100"
                    >
                      {folders.map(f => (
                        <option key={f} value={f}>
                          {f}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    onClick={async () => {
                      const nextStore = updateAgentProfileWithVersion(store, newAgentDraft)
                      await onUpdateStore(nextStore)
                      setSelectedAgentId(newAgentDraft.id)
                      setIsNewAgentModalOpen(false)
                    }}
                    className="px-5 py-2 rounded-lg bg-[#c59b27] text-black font-semibold text-xs cursor-pointer"
                  >
                    Salvar e Ativar Agente
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
