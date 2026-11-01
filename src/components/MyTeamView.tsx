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
  CheckCircle2,
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

  // Gavetas e Modais Secundários (para manter a área principal limpa!)
  const [isKnowledgeDrawerOpen, setIsKnowledgeDrawerOpen] = useState(false)
  const [isConfigDrawerOpen, setIsConfigDrawerOpen] = useState(false)
  const [isProjectsModalOpen, setIsProjectsModalOpen] = useState(false)
  const [isNewAgentModalOpen, setIsNewAgentModalOpen] = useState(false)
  const [newAgentTab, setNewAgentTab] = useState<'guided' | 'conversation'>('guided')

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

  // 2. Motor de Agendamento e Eventos de Rotinas em Tempo Real (Achado 8)
  useEffect(() => {
    const checkSchedulesAndEvents = async () => {
      const currentStore = storeRef.current
      if (isExecuting) return
      const now = Date.now()

      for (const routine of currentStore.automations) {
        if (!routine.active) continue

        // Verificar limite diário
        const todayStart = new Date()
        todayStart.setHours(0, 0, 0, 0)
        const runsToday = routine.recentRunIds.filter(rId => {
          const r = currentStore.runs.find(item => item.id === rId)
          return r && r.startedAt >= todayStart.getTime()
        }).length
        if (runsToday >= (routine.maxRunsPerDay || 10)) continue

        // Gatilho 1: Agendamento Semanal (`weekly_schedule`)
        if (routine.triggerKind === 'weekly_schedule' && routine.scheduleConfig) {
          const nextTime = routine.nextRunAt ? new Date(routine.nextRunAt).getTime() : 0
          if (nextTime > 0 && now >= nextTime) {
            await executeRoutineDirectly(routine, false, 'Execução automática agendada da rotina semanal.')
            return
          }
        }

        // Gatilho 2: Novo Briefing adicionado na pasta monitorada (`briefing_added`)
        if (routine.triggerKind === 'briefing_added' && routine.watchFolder) {
          const candidateNotes = notes.filter(
            n =>
              n.folder === routine.watchFolder &&
              (n.title.toLowerCase().includes('briefing') || n.tags.includes('briefing')) &&
              now - n.updatedAt < 60000 && // Estabilizado recentemente
              now - n.updatedAt >= 1500
          )
          if (candidateNotes.length > 0) {
            const latest = candidateNotes[0]
            const fingerprint = `${latest.id}_${latest.updatedAt}`
            if (routine.lastEventFingerprint !== fingerprint) {
              await executeRoutineDirectly(
                routine,
                false,
                `Preparar proposta comercial a partir do novo briefing: ${latest.title}`,
                [latest],
                 fingerprint
              )
              return
            }
          }
        }
      }
    }

    const timer = setInterval(checkSchedulesAndEvents, 25000)
    return () => clearInterval(timer)
  }, [notes, isExecuting])

  // Execução direta de uma rotina sem depender de estado assíncrono `selectedAgent` (Corrige Achado 8!)
  const executeRoutineDirectly = async (
    routine: AutomationVersion,
    isTest: boolean,
    customPrompt?: string,
    extraNotes?: Note[],
    eventFingerprint?: string
  ) => {
    const currentStore = storeRef.current
    const targetAgent =
      currentStore.agents.find(a => a.id === routine.agentId) || currentStore.agents[0]
    if (!targetAgent) return

    const routineProject = routine.projectContextId
      ? currentStore.projects.find(p => p.id === routine.projectContextId)
      : selectedProject

    setIsExecuting(true)
    const controller = new AbortController()
    abortControllerRef.current = controller

    try {
      const promptText =
        customPrompt ||
        `Execução da rotina "${routine.name}": ${routine.description}`

      let run: AgentRun
      if (routine.targetKind === 'workflow' && routine.workflowId) {
        const wf = workflows.find(w => w.id === routine.workflowId) || workflows[0]
        run = await executeWorkflowRun({
          workflow: wf,
          allAgents: currentStore.agents,
          allNotes: notes,
          allProjects: currentStore.projects,
          prompt: promptText,
          projectContext: routineProject,
          isTestRun: isTest || routine.requireApproval
        })
      } else {
        const teamDef =
          routine.targetKind === 'team' && routine.teamId
            ? teams.find(t => t.id === routine.teamId)
            : undefined
        run = await executeAgentRun({
          agent: {
            ...targetAgent,
            deliverables: {
              ...targetAgent.deliverables,
              targetFolder: routine.targetFolder || targetAgent.deliverables.targetFolder
            }
          },
          allAgents: currentStore.agents,
          allNotes: notes,
          allProjects: currentStore.projects,
          prompt: promptText,
          isTestRun: isTest || routine.requireApproval,
          projectContext: routineProject,
          extraRequestNotes: extraNotes,
          teamDefinition: teamDef,
          abortSignal: controller.signal
        })
      }

      const updatedAutomations = currentStore.automations.map(a =>
        a.id === routine.id
          ? {
              ...a,
              lastTriggeredAt: Date.now(),
              lastEventFingerprint: eventFingerprint || a.lastEventFingerprint,
              recentRunIds: [run.id, ...a.recentRunIds.slice(0, 19)]
            }
          : a
      )

      const nextStore: MultiAgentStoreState = {
        ...currentStore,
        runs: [run, ...currentStore.runs],
        automations: updatedAutomations
      }
      await onUpdateStore(nextStore)
      setSelectedRunId(run.id)
      setSelectedAgentId(targetAgent.id)
      setActiveSection('agents')
      setStatusBanner({
        type: 'success',
        text: `Rotina "${routine.name}" executada com o agente ${targetAgent.name}. Revise o resultado abaixo.`
      })
    } finally {
      setIsExecuting(false)
      abortControllerRef.current = null
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

  // 4. Salvar Rascunho vs Aprovar Proposta Final com Proteção Exclusiva contra Sobrescrita (Achados 2 e 7)
  const handleCommitDeliverable = async (
    run: AgentRun,
    finalApproval: boolean,
    conflictStrategy?: 'new_revision' | 'overwrite'
  ) => {
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
    <div className="flex h-full w-full bg-[#0d0d11] text-zinc-100 overflow-hidden">
      {/* Navegação Lateral Esquerda Limpa (5 destinos principais inspirados no OpenBot) */}
      <aside className="w-56 border-r border-zinc-800/80 bg-[#121217] flex flex-col justify-between p-3.5 shrink-0">
        <div className="space-y-5">
          <div className="px-2 pt-1 flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-zinc-100 tracking-tight">Minha Equipe</h2>
              <p className="text-xs text-zinc-400">Agentes, fluxos e rotinas</p>
            </div>
          </div>

          <nav className="space-y-1">
            {[
              { id: 'agents' as PrimarySection, label: 'Agentes', icon: Bot, count: store.agents.length },
              { id: 'teams' as PrimarySection, label: 'Equipes', icon: Users, count: teams.length },
              { id: 'workflows' as PrimarySection, label: 'Fluxos', icon: GitBranch, count: workflows.length },
              { id: 'routines' as PrimarySection, label: 'Rotinas', icon: Clock, count: store.automations.length },
              {
                id: 'activity' as PrimarySection,
                label: 'Atividade',
                icon: Activity,
                count: store.runs.length
              }
            ].map(item => {
              const Icon = item.icon
              const isActive = activeSection === item.id
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveSection(item.id)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer ${
                    isActive
                      ? 'bg-[#c59b27]/15 text-[#c59b27] border border-[#c59b27]/40'
                      : 'text-zinc-300 hover:bg-zinc-800/60 hover:text-white border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-900/90 text-zinc-400">
                    {item.count}
                  </span>
                </button>
              )
            })}
          </nav>

          {/* Seletor discreto de Cliente / Projeto Ativo */}
          <div className="pt-3 border-t border-zinc-800/80 space-y-2">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-semibold text-zinc-400">Cliente / Projeto</span>
              <button
                type="button"
                onClick={() => setIsProjectsModalOpen(true)}
                className="text-xs text-[#c59b27] hover:underline cursor-pointer"
              >
                Gerenciar
              </button>
            </div>
            <select
              value={selectedProjectId}
              onChange={e => setSelectedProjectId(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-2 text-xs text-zinc-200 focus:outline-none focus:border-[#c59b27]"
            >
              <option value="">Sem cliente fixo (Por pedido)</option>
              {store.projects.map(p => (
                <option key={p.id} value={p.id}>
                  {p.clientName}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Rodapé da barra lateral: Explorar exemplos sob demanda */}
        <div className="pt-3 border-t border-zinc-800/80 space-y-2">
          <button
            type="button"
            onClick={handleLoadDemoExamples}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-zinc-800 hover:border-zinc-700 bg-zinc-900/60 text-xs text-zinc-300 hover:text-white cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#c59b27]" />
            <span>Explorar Exemplos</span>
          </button>
        </div>
      </aside>

      {/* Conteúdo Principal de acordo com a seção selecionada */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {statusBanner && (
          <div
            className={`px-6 py-2.5 border-b flex items-center justify-between text-xs ${
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

        {/* SEÇÃO 1: AGENTES (Foco limpo na conversa/pedido e no resultado) */}
        {activeSection === 'agents' && selectedAgent && (
          <div className="flex-1 flex overflow-hidden">
            {/* Lista compacta de Agentes */}
            <div className="w-64 border-r border-zinc-800/80 bg-[#111116] flex flex-col overflow-hidden shrink-0">
              <div className="p-3.5 border-b border-zinc-800/80 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Especialistas
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setNewAgentDraft(null)
                    setConvDescription('')
                    setIsNewAgentModalOpen(true)
                  }}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#c59b27] text-black font-semibold text-xs hover:bg-[#d4a930] cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Novo agente</span>
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-2.5 space-y-1.5">
                {store.agents.map(agent => {
                  const isSelected = agent.id === selectedAgent.id
                  return (
                    <button
                      key={agent.id}
                      type="button"
                      onClick={() => setSelectedAgentId(agent.id)}
                      className={`w-full text-left p-3 rounded-xl border transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-[#191922] border-[#c59b27]/60 shadow-md'
                          : 'bg-transparent border-transparent hover:bg-zinc-900/70'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="text-xl">{agent.icon}</span>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold text-zinc-100 truncate">
                            {agent.name}
                          </div>
                          <div className="text-xs text-zinc-400 truncate mt-0.5">
                            {agent.knowledgeBindings.length} fonte(s) • Pasta {agent.deliverables.targetFolder}
                          </div>
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Área Central do Agente: Cabeçalho limpo + Caixa de Pedido + Resultado */}
            <div className="flex-1 flex flex-col overflow-hidden bg-[#0e0e12]">
              {/* Cabeçalho do Agente Selecionado */}
              <div className="px-6 py-4 border-b border-zinc-800/80 bg-[#131319] flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-3xl">{selectedAgent.icon}</span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h1 className="text-lg font-bold text-zinc-100 truncate">
                        {selectedAgent.name}
                      </h1>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
                        Disponível
                      </span>
                    </div>
                    <p className="text-sm text-zinc-400 truncate max-w-2xl mt-0.5">
                      {selectedAgent.roleDescription}
                    </p>
                  </div>
                </div>

                {/* Botões para abrir Conhecimento e Configurações sob demanda */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsKnowledgeDrawerOpen(v => !v)
                      setIsConfigDrawerOpen(false)
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium cursor-pointer ${
                      isKnowledgeDrawerOpen
                        ? 'border-[#c59b27] bg-[#c59b27]/15 text-[#c59b27]'
                        : 'border-zinc-700/80 bg-zinc-900 text-zinc-200 hover:border-zinc-500'
                    }`}
                  >
                    <BookOpen className="w-3.5 h-3.5" />
                    <span>Conhecimento ({selectedAgent.knowledgeBindings.length})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIsConfigDrawerOpen(v => !v)
                      setIsKnowledgeDrawerOpen(false)
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium cursor-pointer ${
                      isConfigDrawerOpen
                        ? 'border-[#c59b27] bg-[#c59b27]/15 text-[#c59b27]'
                        : 'border-zinc-700/80 bg-zinc-900 text-zinc-200 hover:border-zinc-500'
                    }`}
                  >
                    <Settings className="w-3.5 h-3.5" />
                    <span>Configurações</span>
                  </button>
                </div>
              </div>

              {/* Corpo Rolável: Pedido e Resultado da Execução */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6 max-w-5xl mx-auto w-full">
                {/* Card de Pedido ao Agente */}
                <div className="p-5 rounded-2xl border border-zinc-800/90 bg-[#14141b] space-y-4 shadow-lg">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-zinc-200">
                      Novo Pedido para {selectedAgent.name}
                    </span>
                    {selectedProject && (
                      <span className="text-xs px-2.5 py-1 rounded-lg bg-violet-500/15 border border-violet-500/30 text-violet-200">
                        Cliente isolado: <strong>{selectedProject.clientName}</strong>
                      </span>
                    )}
                  </div>

                  <textarea
                    rows={3}
                    value={promptInput}
                    onChange={e => setPromptInput(e.target.value)}
                    placeholder={`Ex: Gere uma proposta comercial para ${
                      selectedProject?.clientName || 'o cliente'
                    } incluindo Site Institucional e Manutenção Mensal no prazo de 3 semanas...`}
                    className="w-full bg-zinc-900/90 border border-zinc-700/80 rounded-xl p-3.5 text-base text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-[#c59b27] leading-relaxed"
                  />

                  {/* Notas anexadas apenas a este pedido (`request_context`) */}
                  {extraNoteIds.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-zinc-400">Anexadas somente a este pedido:</span>
                      {extraNoteIds.map(id => {
                        const n = notes.find(item => item.id === id)
                        if (!n) return null
                        return (
                          <span
                            key={id}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-xs text-cyan-200"
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
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                    <div className="flex items-center gap-4">
                      {selectedAgent.limits.allowDelegation &&
                        selectedAgent.allowedActions.includes('delegate_team') && (
                          <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={useTeamDelegation}
                              onChange={e => setUseTeamDelegation(e.target.checked)}
                              className="accent-[#c59b27]"
                            />
                            <span>Incluir revisão e especialistas da equipe</span>
                          </label>
                        )}
                    </div>

                    <div className="flex items-center gap-2.5">
                      {isExecuting && (
                        <button
                          type="button"
                          onClick={handleCancelActiveExecution}
                          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-rose-500/50 bg-rose-500/10 text-rose-300 text-xs font-medium cursor-pointer"
                        >
                          <StopCircle className="w-4 h-4" />
                          <span>Cancelar Execução</span>
                        </button>
                      )}

                      <button
                        type="button"
                        disabled={isExecuting}
                        onClick={() => handleRunAgent({ isTest: true })}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-zinc-700 bg-zinc-800/80 hover:bg-zinc-700 text-sm font-medium text-zinc-100 cursor-pointer disabled:opacity-50"
                      >
                        <FlaskConical className="w-4 h-4 text-amber-400" />
                        <span>Testar Agente</span>
                      </button>

                      <button
                        type="button"
                        disabled={isExecuting}
                        onClick={() => handleRunAgent({ isTest: false })}
                        className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-[#c59b27] hover:bg-[#d4a930] text-black font-semibold text-sm cursor-pointer disabled:opacity-50"
                      >
                        <Play className="w-4 h-4 fill-current" />
                        <span>Executar Pedido</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Resultado da Execução Ativa */}
                {activeRun && (
                  <div className="rounded-2xl border border-zinc-800/90 bg-[#14141b] overflow-hidden shadow-xl space-y-5 p-6">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800/80 pb-4">
                      <div>
                        <div className="flex items-center gap-2.5">
                          <span className="text-base font-bold text-zinc-100">
                            Resultado — {activeRun.agentName}
                          </span>
                          <span
                            className={`text-xs px-2.5 py-0.5 rounded-full font-medium border ${
                              activeRun.status === 'completed'
                                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                                : activeRun.status === 'waiting_user' || activeRun.status === 'waiting_approval'
                                ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                                : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                            }`}
                          >
                            {activeRun.status === 'completed'
                              ? 'Pronto para revisão'
                              : activeRun.status === 'waiting_user'
                              ? 'Aguardando informações'
                              : activeRun.status === 'waiting_approval'
                              ? 'Aguardando sua aprovação'
                              : activeRun.status === 'cancelled'
                              ? 'Cancelada'
                              : 'Atenção necessária'}
                          </span>
                          {activeRun.isTestRun && (
                            <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300">
                              Modo de Teste (Nada foi gravado no disco)
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-zinc-400 mt-1">
                          Pedido: "{activeRun.prompt}"
                        </p>
                      </div>

                      {/* Ações de Gravação Separadas: Rascunho vs Aprovação Final (Achados 2 e 7) */}
                      {activeRun.changeSet && activeRun.changeSet.operations.length > 0 && (
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            disabled={primaryOpCommitted}
                            onClick={() => handleCommitDeliverable(activeRun, false)}
                            className="px-3.5 py-2 rounded-xl border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-zinc-100 cursor-pointer disabled:opacity-40"
                          >
                            {primaryOpCommitted ? 'Já salvo no cofre' : 'Salvar como Rascunho'}
                          </button>

                          <button
                            type="button"
                            disabled={primaryOpCommitted || !canApproveFinal}
                            onClick={() => handleCommitDeliverable(activeRun, true)}
                            title={
                              !canApproveFinal
                                ? 'Resolva as pendências ou conflitos abaixo antes de aprovar a versão final'
                                : 'Aprovar proposta final e gerar tarefas do escopo'
                            }
                            className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-semibold text-xs cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            Aprovar e Salvar Proposta Final
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Erro se faltar modelo obrigatório */}
                    {activeRun.error && (
                      <div className="p-4 rounded-xl border border-rose-500/40 bg-rose-500/10 text-sm text-rose-200 flex items-start gap-3">
                        <XCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                        <div>{activeRun.error}</div>
                      </div>
                    )}

                    {/* Resolução Interativa de Conflitos de Preços entre Fontes (Achado 7) */}
                    {activeRun.calculation && activeRun.calculation.conflicts.length > 0 && (
                      <div className="p-4 rounded-xl border border-amber-500/40 bg-amber-500/10 space-y-3">
                        <div className="flex items-center gap-2 text-sm font-semibold text-amber-200">
                          <ShieldAlert className="w-4 h-4 text-amber-400" />
                          <span>Divergência de preços encontrada nas notas de referência</span>
                        </div>
                        {activeRun.calculation.conflicts.map(c => (
                          <div
                            key={c.id}
                            className="p-3 rounded-lg bg-zinc-900/90 border border-zinc-800 flex flex-wrap items-center justify-between gap-3 text-xs"
                          >
                            <div>
                              <div className="font-semibold text-zinc-100">{c.field}</div>
                              <div className="text-zinc-400 mt-0.5">
                                Escolha qual valor adotar para liberar a aprovação final:
                              </div>
                            </div>
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

                    {/* Perguntas Essenciais e Campos Obrigatórios Faltantes — Atualiza a MESMA Run (Achado 7) */}
                    {activeRun.clarifyingQuestions.length > 0 && (
                      <div className="p-4 rounded-xl border border-amber-500/40 bg-amber-500/10 space-y-3">
                        <div className="flex items-center gap-2 text-sm font-semibold text-amber-200">
                          <AlertTriangle className="w-4 h-4 text-amber-400" />
                          <span>Informações necessárias para concluir a versão final</span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <input
                            type="text"
                            placeholder="Cliente (se pendente)..."
                            value={answerInputs.cliente || ''}
                            onChange={e =>
                              setAnswerInputs(prev => ({ ...prev, cliente: e.target.value }))
                            }
                            className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100"
                          />
                          <input
                            type="text"
                            placeholder="Prazo estimado (ex: 4 semanas)..."
                            value={answerInputs.prazo || ''}
                            onChange={e =>
                              setAnswerInputs(prev => ({ ...prev, prazo: e.target.value }))
                            }
                            className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100"
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
                            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#c59b27] text-black font-semibold text-xs cursor-pointer"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            <span>Atualizar Esta Execução com as Respostas</span>
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Resumo Financeiro Determinístico em Centavos */}
                    {activeRun.calculation && activeRun.calculation.items.length > 0 && (
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="p-3.5 rounded-xl bg-zinc-900/80 border border-zinc-800">
                          <div className="text-xs text-zinc-400">Subtotal Bruto</div>
                          <div className="text-base font-bold text-zinc-100 mt-0.5">
                            {formatCentsBRL(activeRun.calculation.grossTotalCents)}
                          </div>
                        </div>
                        <div className="p-3.5 rounded-xl bg-zinc-900/80 border border-zinc-800">
                          <div className="text-xs text-zinc-400">Descontos Autorizados</div>
                          <div className="text-base font-bold text-emerald-400 mt-0.5">
                            - {formatCentsBRL(activeRun.calculation.totalDiscountCents)}
                          </div>
                        </div>
                        <div className="p-3.5 rounded-xl bg-zinc-900/80 border border-[#c59b27]/40">
                          <div className="text-xs text-zinc-400">Valor Líquido Final</div>
                          <div className="text-base font-bold text-[#c59b27] mt-0.5">
                            {formatCentsBRL(activeRun.calculation.netTotalCents)}
                          </div>
                        </div>
                        <div className="p-3.5 rounded-xl bg-zinc-900/80 border border-zinc-800">
                          <div className="text-xs text-zinc-400">Entrada & Parcelas</div>
                          <div className="text-xs font-semibold text-zinc-200 mt-1">
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

                    {/* Fontes Usadas (Linguagem humana, sem hashes técnicos poluindo a tela principal) */}
                    <div className="space-y-2">
                      <div className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                        Fontes Usadas nesta Execução
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {activeRun.sourceSnapshots.map(snap => (
                          <button
                            key={snap.sourceId}
                            type="button"
                            disabled={!snap.available}
                            onClick={() => onOpenNote(snap.sourceId)}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs transition-colors ${
                              snap.available
                                ? 'border-zinc-800 bg-zinc-900/80 hover:border-zinc-600 text-zinc-200 cursor-pointer'
                                : 'border-rose-500/40 bg-rose-500/10 text-rose-300 cursor-not-allowed'
                            }`}
                          >
                            <FileText className="w-3.5 h-3.5 text-[#c59b27]" />
                            <span className="font-medium">{snap.title}</span>
                            <span className="text-zinc-400">({ROLE_LABELS[snap.role].label})</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Etapas de Especialistas da Equipe (se acionados) */}
                    {activeRun.subagentSteps.length > 0 && (
                      <div className="space-y-2">
                        <div className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                          Colaboração da Equipe ({activeRun.subagentSteps.length} especialistas)
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {activeRun.subagentSteps.map(step => (
                            <div
                              key={step.id}
                              className="p-3.5 rounded-xl border border-zinc-800 bg-zinc-900/60 space-y-1.5"
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-semibold text-zinc-100">
                                  {step.specialistName}
                                </span>
                                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                              </div>
                              <p className="text-xs text-zinc-300 leading-relaxed">{step.summary}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Prévia do Documento Gerado */}
                    {activeRun.draftContent && (
                      <div className="rounded-xl border border-zinc-800 bg-[#101015] p-6">
                        <div className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-4">
                          Prévia do Documento
                        </div>
                        <div className="prose prose-invert max-w-none text-base leading-relaxed">
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
                )}
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
