import React, { useState, useMemo } from 'react'
import type {
  AgentProfileVersion,
  AgentRun,
  AgentArtifact,
  ContextBinding,
  ContextRole,
  MultiAgentStoreState,
  AgentActionPermission
} from '../types/agents'
import type { Note, NoteType, TaskItem } from '../types'
import {
  ROLE_LABELS,
  updateAgentProfileWithVersion,
  generateAgentDraftFromPrompt,
  executeAgentRun,
  computeHashSync
} from '../utils/multiAgentEngine'
import { MarkdownRenderer } from './MarkdownRenderer'
import {
  Users,
  Plus,
  Search,
  Play,
  SlidersHorizontal,
  Copy,
  Pause,
  History,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Folder,
  ShieldCheck,
  ChevronRight,
  ChevronDown,
  X,
  Check,
  Trash2,
  Brain,
  ListTodo,
  Zap,
  Eye,
  Layers,
  ArrowRight
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
  }) => Promise<{ success: boolean; note?: Note; filePath?: string; revisionHash?: string; error?: string }>
  onCreateTask: (title?: string, initialData?: Partial<TaskItem>) => TaskItem
  preselectedNoteForBinding?: { noteId: string; role: ContextRole } | null
  onClearPreselectedNote?: () => void
}

const ACTION_LABELS: Record<AgentActionPermission, { label: string; summary: string }> = {
  read_context: {
    label: 'Ler referências vinculadas',
    summary: 'Pode consultar apenas as notas e pastas autorizadas'
  },
  prepare_draft: {
    label: 'Preparar rascunhos e novas notas',
    summary: 'Pode preparar rascunhos na pasta de destino autorizada'
  },
  propose_patch: {
    label: 'Propor alterações em notas existentes',
    summary: 'Precisa da sua aprovação para alterar notas existentes'
  },
  create_tasks: {
    label: 'Criar tarefas de acompanhamento',
    summary: 'Pode gerar tarefas vinculadas à entrega'
  },
  edit_mindmap: {
    label: 'Criar/editar mapas mentais por ID',
    summary: 'Pode criar mapas mentais preservando nós existentes'
  },
  edit_diagram: {
    label: 'Criar/editar diagramas por ID',
    summary: 'Pode criar diagramas e fluxos visuais'
  },
  delegate_team: {
    label: 'Coordenar e delegar para especialistas',
    summary: 'Pode distribuir subtarefas para especialistas da equipe'
  }
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
  onClearPreselectedNote
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'team' | 'runs' | 'automations' | 'projects'>('team')
  const [searchQuery, setSearchQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState<string>('all')

  // Active workspace panel: Running / Testing an agent or viewing a Run
  const [selectedAgentId, setSelectedAgentId] = useState<string>(store.agents[0]?.id || 'agent-proposal-specialist')
  const [activeRunId, setActiveRunId] = useState<string | null>(store.runs[0]?.id || null)

  // Execution Composer State
  const [promptInput, setPromptInput] = useState(
    'Prepare uma proposta para João, para criação de site com manutenção mensal'
  )
  const [selectedProjectId, setSelectedProjectId] = useState<string>('proj-joao-horizonte')
  const [extraNoteIds, setExtraNoteIds] = useState<string[]>([])
  const [useTeamCoordination, setUseTeamCoordination] = useState<boolean>(false)
  const [isExecuting, setIsExecuting] = useState<boolean>(false)
  const [userAnswerInputs, setUserAnswerInputs] = useState<Record<string, string>>({})
  const [commitBanner, setCommitBanner] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // Agent Creator / Editor Modal State
  const [isCreatorOpen, setIsCreatorOpen] = useState(false)
  const [creatorMode, setCreatorMode] = useState<'guided' | 'conversation'>('guided')
  const [conversationPrompt, setConversationPrompt] = useState(
    'Quero alguém que prepare propostas comerciais com meu modelo, meus serviços e minhas regras de preço'
  )
  const [conversationExplanation, setConversationExplanation] = useState<string | null>(null)
  const [editingAgent, setEditingAgent] = useState<AgentProfileVersion | null>(null)
  const [showAdvancedConfig, setShowAdvancedConfig] = useState(false)

  // Bind note from Editor ("Usar com um agente")
  React.useEffect(() => {
    if (preselectedNoteForBinding) {
      const targetNote = notes.find(n => n.id === preselectedNoteForBinding.noteId)
      const targetAgent = store.agents.find(a => a.id === selectedAgentId) || store.agents[0]
      if (targetNote && targetAgent) {
        const exists = targetAgent.knowledgeBindings.some(b => b.noteId === targetNote.id)
        if (!exists) {
          const newBinding: ContextBinding = {
            id: `bind_${Date.now()}`,
            targetType: 'note',
            noteId: targetNote.id,
            noteTitle: targetNote.title,
            role: preselectedNoteForBinding.role,
            required: preselectedNoteForBinding.role === 'template',
            precedence: preselectedNoteForBinding.role === 'template' ? 100 : 80,
            updatePolicy: 'follow_latest'
          }
          const updatedAgent: AgentProfileVersion = {
            ...targetAgent,
            knowledgeBindings: [...targetAgent.knowledgeBindings, newBinding]
          }
          const nextStore = updateAgentProfileWithVersion(store, updatedAgent)
          onUpdateStore(nextStore)
          setCommitBanner({
            type: 'success',
            message: `Nota "${targetNote.title}" vinculada a "${targetAgent.name}" (v${updatedAgent.version + 1}) como ${ROLE_LABELS[preselectedNoteForBinding.role].label}!`
          })
          setTimeout(() => setCommitBanner(null), 5000)
        }
      }
      onClearPreselectedNote?.()
    }
  }, [preselectedNoteForBinding])

  const selectedAgent = useMemo(
    () => store.agents.find(a => a.id === selectedAgentId) || store.agents[0],
    [store.agents, selectedAgentId]
  )

  const activeRun = useMemo(
    () => store.runs.find(r => r.id === activeRunId) || null,
    [store.runs, activeRunId]
  )

  const filteredAgents = useMemo(() => {
    return store.agents.filter(a => {
      const matchesQuery =
        a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        a.roleDescription.toLowerCase().includes(searchQuery.toLowerCase())
      const matchesRole = roleFilter === 'all' || a.specialistRole === roleFilter
      return matchesQuery && matchesRole
    })
  }, [store.agents, searchQuery, roleFilter])

  // Open Guided or Conversational Creator
  const handleOpenCreateAgent = (mode: 'guided' | 'conversation' = 'guided') => {
    setCreatorMode(mode)
    setConversationExplanation(null)
    const blank: AgentProfileVersion = {
      id: `agent_${Date.now()}`,
      version: 1,
      name: 'Novo Especialista',
      icon: '🤖',
      color: '#c59b27',
      specialistRole: 'proposal_specialist',
      roleDescription: 'Preparar propostas e documentos seguindo meu modelo e referências autorizadas.',
      workStyle: {
        tone: 'Profissional, claro e objetivo',
        rules: [
          'Preservar notas de modelo originais intactas',
          'Consultar apenas notas e pastas explicitamente autorizadas'
        ],
        requiredQuestions: ['Qual é o cliente ou projeto?', 'Qual o escopo principal?'],
        guardrails: ['Precisa da aprovação do usuário para alterar notas existentes']
      },
      knowledgeBindings: [],
      allowedActions: ['read_context', 'prepare_draft', 'create_tasks'],
      deliverables: {
        targetFolder: 'Propostas',
        namingPattern: 'Proposta - {cliente}',
        outputTypes: ['note', 'tasks'],
        requireApprovalForExisting: true
      },
      aiConfig: { useDefault: true, temperature: 0.3 },
      limits: {
        maxDurationSec: 60,
        maxSteps: 6,
        maxSubtasks: 4,
        maxDelegationDepth: 2,
        allowDelegation: false
      },
      triggerMode: 'on_demand',
      state: 'available',
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    setEditingAgent(blank)
    setIsCreatorOpen(true)
  }

  const handleGenerateFromConversation = () => {
    if (!conversationPrompt.trim()) return
    const { draft, explanation } = generateAgentDraftFromPrompt(conversationPrompt, notes)
    setEditingAgent(draft)
    setConversationExplanation(explanation)
  }

  const handleSaveAgentProfile = async () => {
    if (!editingAgent || !editingAgent.name.trim()) return
    const nextStore = updateAgentProfileWithVersion(store, editingAgent)
    const res = await onUpdateStore(nextStore)
    if (res.success) {
      setSelectedAgentId(editingAgent.id)
      setIsCreatorOpen(false)
      setEditingAgent(null)
      setCommitBanner({
        type: 'success',
        message: `Perfil "${editingAgent.name}" salvo com sucesso!`
      })
      setTimeout(() => setCommitBanner(null), 4000)
    } else {
      setCommitBanner({
        type: 'error',
        message: res.error || 'Erro ao salvar perfil do agente.'
      })
    }
  }

  const handleDuplicateAgent = async (agent: AgentProfileVersion) => {
    const copy: AgentProfileVersion = {
      ...structuredClone(agent),
      id: `agent_${Date.now()}`,
      version: 1,
      name: `${agent.name} (Cópia)`,
      state: 'available',
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    const nextStore: MultiAgentStoreState = {
      ...store,
      agents: [copy, ...store.agents],
      agentHistoryVersions: [...store.agentHistoryVersions, copy]
    }
    await onUpdateStore(nextStore)
    setSelectedAgentId(copy.id)
  }

  const handleTogglePauseAgent = async (agent: AgentProfileVersion) => {
    const nextState = agent.state === 'paused' ? 'available' : 'paused'
    const updated: AgentProfileVersion = { ...agent, state: nextState, updatedAt: Date.now() }
    const nextStore: MultiAgentStoreState = {
      ...store,
      agents: store.agents.map(a => (a.id === agent.id ? updated : a))
    }
    await onUpdateStore(nextStore)
  }

  const handleDeleteAgent = async (agent: AgentProfileVersion) => {
    if (agent.state === 'working') {
      setCommitBanner({
        type: 'error',
        message: 'Interrompa as execuções ativas deste agente antes de excluir o perfil.'
      })
      return
    }
    // Excluir um perfil não apaga propostas/notas produzidas e mantém agentHistoryVersions para auditoria!
    const remaining = store.agents.filter(a => a.id !== agent.id)
    const nextStore: MultiAgentStoreState = {
      ...store,
      agents: remaining
    }
    await onUpdateStore(nextStore)
    if (selectedAgentId === agent.id && remaining[0]) {
      setSelectedAgentId(remaining[0].id)
    }
  }

  // Run or Test Agent (Seção 2 & Seção 4)
  const handleRunOrTestAgent = async (isTestRun: boolean, customAnswers?: Record<string, string>) => {
    if (!selectedAgent) return
    if (selectedAgent.state === 'paused') {
      setCommitBanner({
        type: 'error',
        message: `O agente "${selectedAgent.name}" está pausado. Retome-o antes de iniciar um pedido.`
      })
      return
    }

    setIsExecuting(true)
    setCommitBanner(null)

    try {
      const projectContext = store.projects.find(p => p.id === selectedProjectId)
      const extraNotes = notes.filter(n => extraNoteIds.includes(n.id))

      const runResult = await executeAgentRun({
        agent: selectedAgent,
        allAgents: store.agents,
        allNotes: notes,
        prompt: promptInput,
        isTestRun,
        projectContext,
        extraRequestNotes: extraNotes,
        userAnswers: customAnswers || userAnswerInputs,
        useTeamDelegation: useTeamCoordination || selectedAgent.specialistRole === 'coordinator'
      })

      const nextStore: MultiAgentStoreState = {
        ...store,
        runs: [runResult, ...store.runs.filter(r => r.id !== runResult.id)]
      }
      await onUpdateStore(nextStore)
      setActiveRunId(runResult.id)
    } catch (err: any) {
      setCommitBanner({
        type: 'error',
        message: err?.message || 'Falha durante a execução do agente.'
      })
    } finally {
      setIsExecuting(false)
    }
  }

  // Salvar Proposta / Entrega como Nota Real no Cofre com confirmação pós-gravação (P0 & Seção 4 Etapa 8)
  const handleCommitRunDeliverable = async (run: AgentRun) => {
    if (!run.draftContent) return
    const targetFolder = selectedAgent?.deliverables.targetFolder || 'Propostas'
    const baseTitle =
      run.changeSet?.operations[0]?.targetTitle ||
      `Proposta Comercial - ${run.clientName || 'Cliente'} - ${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}`

    // P0: Só confirma sucesso APÓS o recibo real de gravação
    const commitRes = await onCreateCommittedNote({
      folder: targetFolder,
      title: baseTitle,
      content: run.draftContent,
      type: 'note'
    })

    if (!commitRes.success) {
      setCommitBanner({
        type: 'error',
        message: `Falha ao gravar no cofre: ${commitRes.error || 'Erro de escrita em disco'}`
      })
      return
    }

    const newArtifact: AgentArtifact = {
      id: `art_${Date.now()}`,
      runId: run.id,
      agentId: run.agentId,
      agentVersion: run.agentVersion,
      title: baseTitle,
      folder: targetFolder,
      noteId: commitRes.note?.id,
      filePath: commitRes.filePath,
      artifactType: 'proposal',
      proposalStatus: 'approved',
      clientName: run.clientName,
      projectId: run.projectContextId,
      sourceSnapshots: run.sourceSnapshots,
      calculation: run.calculation,
      revisionHash: commitRes.revisionHash || computeHashSync(run.draftContent),
      createdAt: Date.now()
    }

    const updatedRun: AgentRun = {
      ...run,
      isTestRun: false,
      status: 'completed',
      proposalStatus: 'approved',
      artifacts: [newArtifact, ...run.artifacts],
      changeSet: run.changeSet
        ? {
            ...run.changeSet,
            operations: run.changeSet.operations.map((op, i) =>
              i === 0
                ? {
                    ...op,
                    status: 'committed',
                    commitReceipt: {
                      filePath: commitRes.filePath,
                      revisionHash: newArtifact.revisionHash,
                      committedAt: Date.now()
                    }
                  }
                : op
            )
          }
        : undefined,
      updatedAt: Date.now()
    }

    const nextStore: MultiAgentStoreState = {
      ...store,
      runs: store.runs.map(r => (r.id === run.id ? updatedRun : r)),
      artifacts: [newArtifact, ...store.artifacts]
    }
    await onUpdateStore(nextStore)

    setCommitBanner({
      type: 'success',
      message: `Nota "${baseTitle}" gravada e confirmada em "${targetFolder}" (Recibo #${newArtifact.revisionHash.slice(0, 8)})!`
    })
    setTimeout(() => setCommitBanner(null), 6000)
  }

  // Ações separadas pós-proposta (Seção 4 Etapa 9): Gerar Tarefas de Acompanhamento, Mapa Mental ou Diagrama
  const handleGenerateFollowUpTasks = async (run: AgentRun) => {
    const clientLabel = run.clientName || 'Cliente'
    const linkedNote = run.artifacts[0]
    const tasksToCreate = [
      `Enviar proposta comercial revisada para ${clientLabel}`,
      `Fazer follow-up comercial em 48h com ${clientLabel}`,
      `Coletar assinatura e comprovante de entrada (40%) — ${clientLabel}`,
      `Agendar reunião de Kick-off e alinhamento de escopo — ${clientLabel}`
    ]

    for (const title of tasksToCreate) {
      onCreateTask(title, {
        priority: 'high',
        tags: ['proposta', 'comercial'],
        contextNoteId: linkedNote?.noteId,
        contextNoteTitle: linkedNote?.title || `Proposta - ${clientLabel}`,
        description: `Gerada a partir da proposta de ${clientLabel} (Run ${run.id}).`
      })
    }

    setCommitBanner({
      type: 'success',
      message: `4 tarefas de acompanhamento criadas e vinculadas a "${linkedNote?.title || clientLabel}"!`
    })
    setTimeout(() => setCommitBanner(null), 4000)
  }

  const handleGenerateScopeMindMap = async (run: AgentRun) => {
    const clientLabel = run.clientName || 'Cliente'
    const items = run.calculation?.items || []
    const outlineLines = [
      `# Escopo do Projeto — ${clientLabel}`,
      `## Entregáveis Comerciais`,
      ...items.map(it => `  - ${it.serviceName} (R$ ${it.total.toFixed(2)})`),
      `## Condições e Prazos`,
      `  - Total Líquido: R$ ${(run.calculation?.netTotal || 0).toFixed(2)}`,
      `  - Parcelamento: ${run.calculation?.installments || 1}x`,
      `## Próximas Etapas`,
      `  - [ ] Aprovação da Proposta`,
      `  - [ ] Kick-off e Briefing Técnico`,
      `  - [ ] Desenvolvimento e Revisão`,
      `  - [ ] Entrega Final e Homologação`
    ]

    const res = await onCreateCommittedNote({
      folder: selectedAgent?.deliverables.targetFolder || 'Propostas',
      title: `Mapa de Escopo - ${clientLabel}`,
      content: outlineLines.join('\n'),
      type: 'mindmap'
    })

    if (res.success) {
      setCommitBanner({
        type: 'success',
        message: `Mapa Mental "Mapa de Escopo - ${clientLabel}" criado com sucesso!`
      })
      setTimeout(() => setCommitBanner(null), 4000)
    }
  }

  // Presets rápidos para validar a jornada de Dois Clientes Distintos (João vs Maria) sem vazamento
  const handleQuickPresetClient = (preset: 'joao' | 'maria' | 'team_project') => {
    setUserAnswerInputs({})
    if (preset === 'joao') {
      setSelectedAgentId('agent-proposal-specialist')
      setSelectedProjectId('proj-joao-horizonte')
      setPromptInput('Prepare uma proposta para João, para criação de site com manutenção mensal')
      setUseTeamCoordination(false)
    } else if (preset === 'maria') {
      setSelectedAgentId('agent-proposal-specialist')
      setSelectedProjectId('proj-maria-botanico')
      setPromptInput('Faça outra proposta para Maria, com loja virtual e identidade visual à vista no PIX')
      setUseTeamCoordination(false)
    } else {
      setSelectedAgentId('agent-team-coordinator')
      setSelectedProjectId('proj-joao-horizonte')
      setPromptInput('Transforme estas notas em um projeto completo com proposta, síntese, tarefas e mapa mental')
      setUseTeamCoordination(true)
    }
  }

  return (
    <div className="w-full h-full flex flex-col bg-[#0f0f12] text-zinc-100 overflow-hidden select-none">
      {/* Top Header of "Minha Equipe" */}
      <header className="flex items-center justify-between px-6 py-3.5 bg-[#121216] border-b border-zinc-800/80 shrink-0">
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center border shadow-sm"
            style={{
              backgroundColor: 'var(--accent-glow-subtle, rgba(197, 155, 39, 0.12))',
              borderColor: 'rgba(197, 155, 39, 0.35)',
              color: 'var(--accent, #c59b27)'
            }}
          >
            <Users className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold tracking-tight text-zinc-100">Minha Equipe</h1>
              <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30">
                Multiagentes & Conhecimento Vinculado
              </span>
            </div>
            <p className="text-xs text-zinc-400">
              Crie especialistas, escolha quais notas eles consultam por papel e revise entregas com rastreabilidade.
            </p>
          </div>
        </div>

        {/* Sub-navigation Tabs + Create Agent Buttons */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-zinc-900/90 p-1 rounded-xl border border-zinc-800">
            <button
              onClick={() => setActiveSubTab('team')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
                activeSubTab === 'team'
                  ? 'bg-zinc-800 text-white shadow-xs'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Users className="w-3.5 h-3.5 text-[#c59b27]" />
              <span>Especialistas ({store.agents.length})</span>
            </button>
            <button
              onClick={() => setActiveSubTab('runs')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
                activeSubTab === 'runs'
                  ? 'bg-zinc-800 text-white shadow-xs'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <History className="w-3.5 h-3.5 text-emerald-400" />
              <span>Execuções & Auditoria ({store.runs.length})</span>
            </button>
            <button
              onClick={() => setActiveSubTab('projects')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
                activeSubTab === 'projects'
                  ? 'bg-zinc-800 text-white shadow-xs'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Folder className="w-3.5 h-3.5 text-purple-400" />
              <span>Clientes & Contextos ({store.projects.length})</span>
            </button>
            <button
              onClick={() => setActiveSubTab('automations')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
                activeSubTab === 'automations'
                  ? 'bg-zinc-800 text-white shadow-xs'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span>Rotinas & Automações ({store.automations.length})</span>
            </button>
          </div>

          <button
            onClick={() => handleOpenCreateAgent('conversation')}
            className="px-3 py-1.5 rounded-xl text-xs font-medium bg-zinc-800/90 hover:bg-zinc-700 text-zinc-200 border border-zinc-700/80 flex items-center gap-1.5 transition-all cursor-pointer"
            title="Descreva o assistente desejado e receba uma configuração pronta para revisar"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>Criar por Conversa</span>
          </button>

          <button
            onClick={() => handleOpenCreateAgent('guided')}
            className="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-black flex items-center gap-1.5 transition-all shadow-sm cursor-pointer hover:opacity-95"
            style={{ backgroundColor: 'var(--accent, #c59b27)' }}
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Criar Agente</span>
          </button>
        </div>
      </header>

      {/* Feedback Banner */}
      {commitBanner && (
        <div
          className={`px-6 py-2.5 text-xs font-medium flex items-center justify-between border-b shrink-0 ${
            commitBanner.type === 'success'
              ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/15 border-rose-500/30 text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {commitBanner.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span>{commitBanner.message}</span>
          </div>
          <button onClick={() => setCommitBanner(null)} className="text-zinc-400 hover:text-white cursor-pointer">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Main Content Split */}
      {activeSubTab === 'team' && (
        <div className="flex-1 flex overflow-hidden">
          {/* Left Column: Agent Cards List & Filters */}
          <div className="w-[410px] border-r border-zinc-800/80 flex flex-col bg-[#101014] shrink-0">
            {/* Search & Filter Bar */}
            <div className="p-3.5 border-b border-zinc-800/80 space-y-2.5">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Buscar especialista por nome ou função..."
                  className="w-full pl-8 pr-3 py-1.5 bg-zinc-900/90 border border-zinc-800 rounded-xl text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-[#c59b27]"
                />
              </div>
              <div className="flex items-center gap-1 overflow-x-auto scrollbar-none">
                {[
                  { id: 'all', label: 'Todos' },
                  { id: 'proposal_specialist', label: 'Propostas' },
                  { id: 'coordinator', label: 'Coordenador' },
                  { id: 'knowledge_curator', label: 'Curador' },
                  { id: 'project_planner', label: 'Planejador' },
                  { id: 'reviewer', label: 'Revisor' }
                ].map(f => (
                  <button
                    key={f.id}
                    onClick={() => setRoleFilter(f.id)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-medium whitespace-nowrap cursor-pointer transition-colors ${
                      roleFilter === f.id
                        ? 'bg-[#c59b27]/20 text-[#d4af37] border border-[#c59b27]/40'
                        : 'bg-zinc-900/60 text-zinc-400 hover:text-zinc-200 border border-zinc-800/60'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Agent Cards Scroll Area */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2.5 custom-chat-scrollbar">
              {filteredAgents.map(agent => {
                const isSelected = agent.id === selectedAgent?.id
                const stateBadge =
                  agent.state === 'working'
                    ? { text: 'Trabalhando', cls: 'bg-amber-500/15 text-amber-400 border-amber-500/30' }
                    : agent.state === 'waiting_user'
                    ? { text: 'Aguardando você', cls: 'bg-purple-500/15 text-purple-300 border-purple-500/30' }
                    : agent.state === 'paused'
                    ? { text: 'Pausado', cls: 'bg-zinc-800 text-zinc-400 border-zinc-700' }
                    : { text: 'Disponível', cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' }

                return (
                  <div
                    key={agent.id}
                    onClick={() => setSelectedAgentId(agent.id)}
                    className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-[#17171f] border-[#c59b27]/60 shadow-lg'
                        : 'bg-[#131319] border-zinc-800/80 hover:border-zinc-700'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <div
                          className="w-9 h-9 rounded-xl flex items-center justify-center text-lg shrink-0 border"
                          style={{
                            backgroundColor: `${agent.color}18`,
                            borderColor: `${agent.color}45`
                          }}
                        >
                          {agent.icon}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <h3 className="text-xs font-bold text-zinc-100">{agent.name}</h3>
                            <span className="text-[10px] font-mono text-zinc-500">v{agent.version}</span>
                          </div>
                          <span className={`inline-block mt-0.5 px-2 py-0.2 text-[10px] rounded-full border ${stateBadge.cls}`}>
                            {stateBadge.text}
                          </span>
                        </div>
                      </div>

                      {/* Card quick actions: Editar, Duplicar, Pausar, Excluir */}
                      <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => {
                            setEditingAgent(structuredClone(agent))
                            setCreatorMode('guided')
                            setIsCreatorOpen(true)
                          }}
                          className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors cursor-pointer"
                          title="Editar perfil (cria nova versão)"
                        >
                          <SlidersHorizontal className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDuplicateAgent(agent)}
                          className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors cursor-pointer"
                          title="Duplicar agente"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleTogglePauseAgent(agent)}
                          className="p-1.5 rounded-lg text-zinc-400 hover:text-amber-400 hover:bg-zinc-800 transition-colors cursor-pointer"
                          title={agent.state === 'paused' ? 'Retomar agente' : 'Pausar agente'}
                        >
                          <Pause className="w-3.5 h-3.5" />
                        </button>
                        {agent.id !== 'agent-proposal-specialist' && (
                          <button
                            onClick={() => handleDeleteAgent(agent)}
                            className="p-1.5 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-zinc-800 transition-colors cursor-pointer"
                            title="Excluir perfil (preserva notas e histórico)"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    <p className="text-[11px] text-zinc-400 mt-2 line-clamp-2 leading-relaxed">
                      {agent.roleDescription}
                    </p>

                    {/* Linked Notes by Role */}
                    {agent.knowledgeBindings.length > 0 && (
                      <div className="mt-2.5 flex flex-wrap gap-1">
                        {agent.knowledgeBindings.map(b => (
                          <span
                            key={b.id}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] bg-zinc-900 border border-zinc-800 text-zinc-300"
                            title={`${ROLE_LABELS[b.role].label}: ${b.noteTitle}`}
                          >
                            <span
                              className="w-1.5 h-1.5 rounded-full"
                              style={{ backgroundColor: ROLE_LABELS[b.role].badgeColor }}
                            />
                            <span className="truncate max-w-[140px]">{b.noteTitle}</span>
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Human-friendly permission summary */}
                    <div className="mt-2.5 pt-2 border-t border-zinc-800/70 flex items-center justify-between text-[10px] text-zinc-500">
                      <span>📁 Pode preparar rascunhos em "{agent.deliverables.targetFolder}"</span>
                      <span>🔒 Aprovação p/ existentes</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Right Column: Active Agent Workbench (Context Chips, Prompt, Test vs Run, Preview & Audit) */}
          {selectedAgent && (
            <div className="flex-1 flex flex-col overflow-y-auto custom-chat-scrollbar bg-[#0d0d11] p-6 space-y-5">
              {/* Selected Agent Summary Card & Quick Scenario Switcher */}
              <div className="bg-[#14141b] border border-zinc-800/90 rounded-2xl p-4 space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-11 h-11 rounded-2xl flex items-center justify-center text-2xl border"
                      style={{
                        backgroundColor: `${selectedAgent.color}18`,
                        borderColor: `${selectedAgent.color}45`
                      }}
                    >
                      {selectedAgent.icon}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-sm font-bold text-white">{selectedAgent.name}</h2>
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-mono bg-zinc-800 text-zinc-300">
                          Versão {selectedAgent.version}
                        </span>
                        <span className="text-[11px] text-zinc-400">
                          • Destino padrão: <strong className="text-zinc-200">{selectedAgent.deliverables.targetFolder}</strong>
                        </span>
                      </div>
                      <p className="text-xs text-zinc-400 mt-0.5">{selectedAgent.roleDescription}</p>
                    </div>
                  </div>

                  {/* Quick Journey Presets (João vs Maria vs Equipe) */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[10px] text-zinc-500 mr-1">Exemplos rápidos:</span>
                    <button
                      onClick={() => handleQuickPresetClient('joao')}
                      className="px-2.5 py-1 rounded-lg text-[11px] bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 cursor-pointer transition-colors"
                    >
                      Cliente 1: João (Site + Manutenção)
                    </button>
                    <button
                      onClick={() => handleQuickPresetClient('maria')}
                      className="px-2.5 py-1 rounded-lg text-[11px] bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 cursor-pointer transition-colors"
                    >
                      Cliente 2: Maria (Loja Virtual PIX)
                    </button>
                    <button
                      onClick={() => handleQuickPresetClient('team_project')}
                      className="px-2.5 py-1 rounded-lg text-[11px] bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 cursor-pointer transition-colors"
                    >
                      Equipe: Notas → Projeto
                    </button>
                  </div>
                </div>

                {/* Knowledge & Context Chips with Explicit Roles (Seção 3) */}
                <div className="pt-3 border-t border-zinc-800/80 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-zinc-300 flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-[#c59b27]" />
                      Fontes e Referências Autorizadas para este Pedido (por Papel):
                    </span>
                    <div className="flex items-center gap-2">
                      <label className="text-[11px] text-zinc-400">Cliente / Projeto:</label>
                      <select
                        value={selectedProjectId}
                        onChange={e => setSelectedProjectId(e.target.value)}
                        className="bg-zinc-900 border border-zinc-700 rounded-lg px-2.5 py-1 text-xs text-zinc-200 focus:outline-none focus:border-[#c59b27]"
                      >
                        <option value="">-- Escolher pelo pedido --</option>
                        {store.projects.map(p => (
                          <option key={p.id} value={p.id}>
                            {p.clientName} — {p.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Role Chips */}
                  <div className="flex flex-wrap gap-2">
                    {selectedAgent.knowledgeBindings.map(bind => {
                      const foundNote = notes.find(
                        n => (bind.noteId && n.id === bind.noteId) || n.title.toLowerCase() === bind.noteTitle.toLowerCase()
                      )
                      const roleMeta = ROLE_LABELS[bind.role]
                      return (
                        <div
                          key={bind.id}
                          onClick={() => foundNote && onOpenNote(foundNote.id)}
                          className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs cursor-pointer transition-all ${
                            foundNote
                              ? 'bg-zinc-900/90 border-zinc-800 hover:border-zinc-600 text-zinc-200'
                              : 'bg-rose-950/30 border-rose-500/40 text-rose-300'
                          }`}
                          title={roleMeta.description}
                        >
                          <span
                            className="px-1.5 py-0.5 rounded text-[10px] font-semibold"
                            style={{
                              backgroundColor: `${roleMeta.badgeColor}20`,
                              color: roleMeta.badgeColor
                            }}
                          >
                            {roleMeta.label}
                          </span>
                          <span className="font-medium">
                            {foundNote ? foundNote.title : `${bind.noteTitle} (Referência indisponível)`}
                          </span>
                        </div>
                      )
                    })}

                    {/* Selected Client/Project Context Chip */}
                    {selectedProjectId &&
                      (() => {
                        const proj = store.projects.find(p => p.id === selectedProjectId)
                        if (!proj) return null
                        return proj.briefingNoteIds.map(bId => {
                          const bNote = notes.find(n => n.id === bId)
                          if (!bNote) return null
                          return (
                            <div
                              key={bId}
                              onClick={() => onOpenNote(bNote.id)}
                              className="flex items-center gap-2 px-3 py-1.5 rounded-xl border bg-purple-950/20 border-purple-500/40 text-xs text-purple-200 cursor-pointer"
                            >
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-purple-500/20 text-purple-300">
                                Contexto do Cliente
                              </span>
                              <span className="font-medium">{bNote.title}</span>
                            </div>
                          )
                        })
                      })()}

                    {/* Attach single request note selector */}
                    <select
                      value=""
                      onChange={e => {
                        const val = e.target.value
                        if (val && !extraNoteIds.includes(val)) {
                          setExtraNoteIds([...extraNoteIds, val])
                        }
                      }}
                      className="bg-zinc-900/70 border border-dashed border-zinc-700 rounded-xl px-2.5 py-1 text-[11px] text-zinc-400 hover:text-zinc-200 cursor-pointer"
                    >
                      <option value="">+ Anexar nota apenas p/ este pedido</option>
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
                        <div
                          key={id}
                          className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-cyan-950/30 border border-cyan-500/40 text-xs text-cyan-200"
                        >
                          <span className="text-[10px] font-semibold text-cyan-400">Contexto deste pedido:</span>
                          <span>{n.title}</span>
                          <button
                            onClick={() => setExtraNoteIds(extraNoteIds.filter(x => x !== id))}
                            className="hover:text-white cursor-pointer"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Request Input & Execution Buttons ("Testar antes de usar" vs "Executar Pedido") */}
                <div className="pt-2 space-y-2.5">
                  <textarea
                    value={promptInput}
                    onChange={e => setPromptInput(e.target.value)}
                    rows={2}
                    placeholder="Descreva o pedido para o especialista..."
                    className="w-full p-3 rounded-xl bg-[#0b0b0f] border border-zinc-800 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-[#c59b27] resize-none"
                  />

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4 text-[11px] text-zinc-400">
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={useTeamCoordination || selectedAgent.specialistRole === 'coordinator'}
                          onChange={e => setUseTeamCoordination(e.target.checked)}
                          className="rounded accent-[#c59b27]"
                        />
                        <span>Incluir revisão e especialistas da equipe (Planejador, Cartógrafo e Revisor)</span>
                      </label>
                      <span className="text-zinc-500">
                        • Privacidade: somente as notas listadas nos chips acima entram na execução.
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        disabled={isExecuting}
                        onClick={() => handleRunOrTestAgent(true)}
                        className="px-3.5 py-2 rounded-xl text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                        title="Simula o rascunho, fontes e cálculos sem modificar os documentos do cofre"
                      >
                        <Eye className="w-3.5 h-3.5 text-amber-400" />
                        <span>Testar Agente (Sem Gravar)</span>
                      </button>

                      <button
                        disabled={isExecuting}
                        onClick={() => handleRunOrTestAgent(false)}
                        className="px-4 py-2 rounded-xl text-xs font-semibold text-black flex items-center gap-1.5 transition-all shadow-md cursor-pointer disabled:opacity-50"
                        style={{ backgroundColor: 'var(--accent, #c59b27)' }}
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>{isExecuting ? 'Preparando Entrega...' : 'Preparar Proposta / Entrega'}</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Active Run Result & Preview Surface */}
              {activeRun && (
                <div className="bg-[#14141b] border border-zinc-800/90 rounded-2xl overflow-hidden flex flex-col">
                  {/* Run Status Header */}
                  <div className="px-5 py-3.5 bg-[#181822] border-b border-zinc-800 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                          activeRun.status === 'completed'
                            ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                            : activeRun.status === 'waiting_user'
                            ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                            : 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                        }`}
                      >
                        {activeRun.isTestRun
                          ? 'Modo de Teste (Simulação sem escrita)'
                          : activeRun.proposalStatus === 'approved'
                          ? 'Proposta Salva e Confirmada'
                          : activeRun.status === 'waiting_user'
                          ? 'Rascunho com Pendências'
                          : 'Rascunho Pronto para Revisão'}
                      </span>
                      <span className="text-xs font-semibold text-zinc-200">
                        {activeRun.agentName} (v{activeRun.agentVersion})
                      </span>
                      {activeRun.clientName && (
                        <span className="text-xs text-zinc-400">
                          • Cliente: <strong className="text-white">{activeRun.clientName}</strong>
                        </span>
                      )}
                    </div>

                    {/* Save / Commit Actions */}
                    <div className="flex items-center gap-2">
                      {activeRun.draftContent && (
                        <button
                          onClick={() => handleCommitRunDeliverable(activeRun)}
                          className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-black flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
                        >
                          <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                          <span>
                            {activeRun.isTestRun
                              ? 'Salvar Resultado do Teste como Nota'
                              : 'Aprovar e Salvar Nova Nota em "' + selectedAgent.deliverables.targetFolder + '"'}
                          </span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Error or Missing Mandatory Template Alert */}
                  {activeRun.error && (
                    <div className="m-5 p-4 rounded-xl bg-rose-950/40 border border-rose-500/40 text-xs text-rose-200 flex items-start gap-3">
                      <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                      <div>
                        <div className="font-bold text-rose-300 mb-1">Execução bloqueada por referência obrigatória</div>
                        <p>{activeRun.error}</p>
                      </div>
                    </div>
                  )}

                  {/* Clarifying Questions / Missing Commercial Fields (Seção 4 - Etapas 3 e 4) */}
                  {activeRun.clarifyingQuestions.length > 0 && (
                    <div className="mx-5 mt-5 p-4 rounded-xl bg-amber-950/25 border border-amber-500/40 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-xs font-bold text-amber-300">
                          <AlertTriangle className="w-4 h-4 text-amber-400" />
                          <span>Informações essenciais pendentes para conclusão final:</span>
                        </div>
                        <span className="text-[11px] text-amber-400/80">
                          Você pode responder abaixo para atualizar ou continuar como rascunho
                        </span>
                      </div>
                      <ul className="list-disc list-inside text-xs text-amber-200/90 space-y-1">
                        {activeRun.clarifyingQuestions.map((q, i) => (
                          <li key={i}>{q}</li>
                        ))}
                      </ul>
                      <div className="grid grid-cols-3 gap-2 pt-1">
                        <input
                          type="text"
                          placeholder="Cliente (ex: João Silva)"
                          value={userAnswerInputs.cliente || ''}
                          onChange={e => setUserAnswerInputs({ ...userAnswerInputs, cliente: e.target.value })}
                          className="px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-700 text-xs text-zinc-200"
                        />
                        <input
                          type="text"
                          placeholder="Prazo (ex: 3 semanas)"
                          value={userAnswerInputs.prazo || ''}
                          onChange={e => setUserAnswerInputs({ ...userAnswerInputs, prazo: e.target.value })}
                          className="px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-700 text-xs text-zinc-200"
                        />
                        <button
                          onClick={() => handleRunOrTestAgent(activeRun.isTestRun, userAnswerInputs)}
                          className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-semibold text-xs cursor-pointer"
                        >
                          Atualizar Proposta com Respostas
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Audit Grid: Sources Snapshot + Review Checklist + Team Subagents */}
                  <div className="p-5 grid grid-cols-1 lg:grid-cols-2 gap-4 border-b border-zinc-800/80">
                    {/* 1. Sources & Version Hashes */}
                    <div className="bg-[#101016] border border-zinc-800/80 rounded-xl p-3.5 space-y-2">
                      <h4 className="text-xs font-bold text-zinc-200 flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5 text-[#c59b27]" />
                        <span>Snapshots das Fontes Consultadas ({activeRun.sourceSnapshots.length})</span>
                      </h4>
                      <div className="space-y-1.5">
                        {activeRun.sourceSnapshots.map(snap => (
                          <div
                            key={snap.sourceId}
                            onClick={() => snap.available && onOpenNote(snap.sourceId)}
                            className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-zinc-900/70 border border-zinc-800/80 text-[11px] cursor-pointer hover:border-zinc-700"
                          >
                            <div className="flex items-center gap-2 truncate">
                              <span
                                className="w-2 h-2 rounded-full shrink-0"
                                style={{ backgroundColor: ROLE_LABELS[snap.role].badgeColor }}
                              />
                              <span className="text-zinc-200 font-medium truncate">{snap.title}</span>
                              <span className="text-[10px] text-zinc-500">({ROLE_LABELS[snap.role].label})</span>
                            </div>
                            <span className="font-mono text-[10px] text-zinc-400 shrink-0">
                              rev #{snap.hash.slice(0, 8)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* 2. Verification & Guardrail Checklist */}
                    <div className="bg-[#101016] border border-zinc-800/80 rounded-xl p-3.5 space-y-2">
                      <h4 className="text-xs font-bold text-zinc-200 flex items-center gap-1.5">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Revisão de Consistência, Preços e Isolamento</span>
                      </h4>
                      <div className="space-y-1.5">
                        {activeRun.reviewChecklist.map((chk, idx) => (
                          <div
                            key={idx}
                            className="flex items-start gap-2 px-2.5 py-1.5 rounded-lg bg-zinc-900/70 border border-zinc-800/80 text-[11px]"
                          >
                            {chk.passed ? (
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                            ) : (
                              <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                            )}
                            <div>
                              <div className="font-semibold text-zinc-200">{chk.label}</div>
                              <div className="text-[10px] text-zinc-400">{chk.detail}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Team Subagent Steps (if coordinated run) */}
                  {activeRun.subagentSteps.length > 0 && (
                    <div className="px-5 py-3.5 bg-[#111118] border-b border-zinc-800/80 space-y-2">
                      <h4 className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5" />
                        <span>Trabalho Coordenado da Equipe de Especialistas ({activeRun.subagentSteps.length} etapas)</span>
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {activeRun.subagentSteps.map(step => (
                          <div
                            key={step.id}
                            className="p-2.5 rounded-xl bg-zinc-900/80 border border-zinc-800 flex items-start gap-2.5 text-xs"
                          >
                            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                            <div>
                              <div className="font-semibold text-zinc-200">{step.specialistName}</div>
                              <div className="text-[11px] text-zinc-400">{step.summary}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Follow-up Linked Actions (Seção 4 Etapa 9: Tarefas, Mapa do Projeto) */}
                  {activeRun.draftContent && (
                    <div className="px-5 py-3 bg-[#15151e] border-b border-zinc-800 flex items-center justify-between">
                      <span className="text-xs text-zinc-300 font-medium">
                        Ações complementares vinculadas a esta proposta:
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleGenerateFollowUpTasks(activeRun)}
                          className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-200 border border-zinc-700 flex items-center gap-1.5 cursor-pointer"
                        >
                          <ListTodo className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Gerar Tarefas de Acompanhamento</span>
                        </button>
                        <button
                          onClick={() => handleGenerateScopeMindMap(activeRun)}
                          className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-200 border border-zinc-700 flex items-center gap-1.5 cursor-pointer"
                        >
                          <Brain className="w-3.5 h-3.5 text-[#c59b27]" />
                          <span>Gerar Mapa Mental do Escopo</span>
                        </button>
                        {activeRun.artifacts[0]?.noteId && (
                          <button
                            onClick={() => onOpenNote(activeRun.artifacts[0].noteId!)}
                            className="px-3 py-1.5 rounded-lg bg-[#c59b27]/20 hover:bg-[#c59b27]/30 text-xs text-[#d4af37] border border-[#c59b27]/40 flex items-center gap-1.5 cursor-pointer"
                          >
                            <ArrowRight className="w-3.5 h-3.5" />
                            <span>Abrir Nota Criada no Editor</span>
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Rendered Proposal / Deliverable Preview */}
                  {activeRun.draftContent && (
                    <div className="p-6 bg-[#0f0f14] select-text">
                      <div className="max-w-3xl mx-auto bg-[#14141b] border border-zinc-800/90 rounded-2xl p-6 shadow-inner">
                        <MarkdownRenderer
                          content={activeRun.draftContent}
                          onNavigate={(title: string) => {
                            const target = notes.find(n => n.title.toLowerCase() === title.toLowerCase())
                            if (target) onOpenNote(target.id)
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* SubTab 2: Execuções & Auditoria (Histórico de Runs e Versões de Perfil) */}
      {activeSubTab === 'runs' && (
        <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-chat-scrollbar">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-zinc-100">Histórico de Execuções, Snapshots e Entregas</h2>
              <p className="text-xs text-zinc-400">
                Cada execução preserva a versão exata do perfil do agente e os hashes das notas consultadas.
              </p>
            </div>
          </div>

          {store.runs.length === 0 ? (
            <div className="p-12 text-center bg-[#14141b] border border-zinc-800 rounded-2xl text-xs text-zinc-500">
              Nenhuma execução registrada ainda. Selecione um agente na aba Especialistas e clique em Testar ou Preparar Proposta.
            </div>
          ) : (
            <div className="space-y-3">
              {store.runs.map(run => (
                <div
                  key={run.id}
                  className="p-4 rounded-2xl bg-[#14141b] border border-zinc-800/90 flex items-center justify-between gap-4"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-white">
                        {run.agentName} (v{run.agentVersion})
                      </span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-zinc-800 text-zinc-300">
                        {run.isTestRun ? 'TESTE' : run.proposalStatus?.toUpperCase() || run.status.toUpperCase()}
                      </span>
                      {run.clientName && (
                        <span className="text-xs text-amber-400 font-medium">Cliente: {run.clientName}</span>
                      )}
                    </div>
                    <p className="text-xs text-zinc-300">"{run.prompt}"</p>
                    <div className="flex items-center gap-3 text-[11px] text-zinc-500">
                      <span>Fontes auditadas: {run.sourceSnapshots.length}</span>
                      {run.calculation && (
                        <span>Total calculado: R$ {run.calculation.netTotal.toFixed(2)}</span>
                      )}
                      <span>{new Date(run.startedAt).toLocaleString('pt-BR')}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setSelectedAgentId(run.agentId)
                        setActiveRunId(run.id)
                        setActiveSubTab('team')
                      }}
                      className="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-200 cursor-pointer"
                    >
                      Inspecionar Prévia & Fontes
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* SubTab 3: Clientes & Contextos de Projeto (Seção 3 & 4) */}
      {activeSubTab === 'projects' && (
        <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-chat-scrollbar">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-zinc-100">Contextos por Cliente / Projeto</h2>
              <p className="text-xs text-zinc-400">
                Isolamento garantido: cada projeto vincula apenas os briefings daquele cliente, impedindo vazamento entre propostas.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {store.projects.map(proj => (
              <div key={proj.id} className="p-4 rounded-2xl bg-[#14141b] border border-zinc-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-purple-400">
                      Cliente Isolado
                    </span>
                    <h3 className="text-sm font-bold text-white">{proj.clientName}</h3>
                    <p className="text-xs text-zinc-400">{proj.name}</p>
                  </div>
                  <button
                    onClick={() => {
                      setSelectedProjectId(proj.id)
                      setActiveSubTab('team')
                    }}
                    className="px-3 py-1.5 rounded-xl bg-[#c59b27]/20 hover:bg-[#c59b27]/30 text-[#d4af37] border border-[#c59b27]/40 text-xs font-medium cursor-pointer"
                  >
                    Gerar Proposta p/ este Cliente
                  </button>
                </div>

                <div className="pt-2 border-t border-zinc-800/80 space-y-1.5">
                  <span className="text-[11px] text-zinc-400">Notas de Briefing vinculadas:</span>
                  <div className="flex flex-wrap gap-1.5">
                    {proj.briefingNoteIds.map(id => {
                      const n = notes.find(item => item.id === id)
                      return (
                        <button
                          key={id}
                          onClick={() => n && onOpenNote(n.id)}
                          className="px-2.5 py-1 rounded-lg bg-zinc-900 border border-zinc-700 text-xs text-zinc-200 hover:border-[#c59b27] cursor-pointer flex items-center gap-1.5"
                        >
                          <FileText className="w-3 h-3 text-purple-400" />
                          <span>{n ? n.title : id}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SubTab 4: Rotinas & Automações Configuráveis (Seção 7) */}
      {activeSubTab === 'automations' && (
        <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-chat-scrollbar">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-zinc-100">Rotinas e Automações Locais</h2>
              <p className="text-xs text-zinc-400">
                Gatilhos com fuso IANA (America/Sao_Paulo), estabilização de arquivos, prevenção de auto-disparo e opção de testar/pausar.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3">
            {store.automations.map(auto => {
              const assignedAgent = store.agents.find(a => a.id === auto.agentId)
              return (
                <div
                  key={auto.id}
                  className="p-4 rounded-2xl bg-[#14141b] border border-zinc-800 flex items-center justify-between gap-4"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          auto.active ? 'bg-emerald-400' : 'bg-zinc-600'
                        }`}
                      />
                      <h3 className="text-sm font-bold text-white">{auto.name}</h3>
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-zinc-800 text-zinc-400">
                        v{auto.version}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-400">{auto.description}</p>
                    <div className="flex flex-wrap items-center gap-3 text-[11px] text-zinc-500">
                      <span>
                        🤖 Agente: <strong className="text-zinc-300">{assignedAgent?.name || auto.agentId}</strong>
                      </span>
                      <span>
                        📁 Destino: <strong className="text-zinc-300">{auto.targetFolder}</strong>
                      </span>
                      {auto.scheduleConfig && (
                        <span>
                          🕒 Fuso: <strong className="text-zinc-300">{auto.scheduleConfig.timezone}</strong> (Política perdida:{' '}
                          {auto.scheduleConfig.missedPolicy === 'run_once_on_open'
                            ? 'Executar 1x ao reabrir'
                            : 'Pular'})
                        </span>
                      )}
                      {auto.nextRunAt && (
                        <span>
                          📅 Próxima execução:{' '}
                          <strong className="text-amber-400">
                            {new Date(auto.nextRunAt).toLocaleString('pt-BR')}
                          </strong>
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => {
                        setSelectedAgentId(auto.agentId)
                        setActiveSubTab('team')
                        handleRunOrTestAgent(true)
                      }}
                      className="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-200 border border-zinc-700 cursor-pointer"
                    >
                      Testar Rotina
                    </button>
                    <button
                      onClick={async () => {
                        const updated = store.automations.map(item =>
                          item.id === auto.id ? { ...item, active: !item.active, updatedAt: Date.now() } : item
                        )
                        await onUpdateStore({ ...store, automations: updated })
                      }}
                      className={`px-3 py-1.5 rounded-xl text-xs font-medium border cursor-pointer ${
                        auto.active
                          ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                          : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                      }`}
                    >
                      {auto.active ? 'Pausar' : 'Ativar'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Modal: Criar / Editar Agente (Criação Guiada & Criação por Conversa - Seção 2) */}
      {isCreatorOpen && editingAgent && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setIsCreatorOpen(false)}
        >
          <div
            onClick={e => e.stopPropagation()}
            className="w-full max-w-2xl max-h-[90vh] bg-[#14141c] border border-zinc-700/80 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
          >
            {/* Modal Header */}
            <div className="px-6 py-4 bg-[#181822] border-b border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{editingAgent.icon}</span>
                <div>
                  <h3 className="text-sm font-bold text-white">
                    {store.agents.some(a => a.id === editingAgent.id)
                      ? `Editar Agente (${editingAgent.name} → v${editingAgent.version + 1})`
                      : 'Criar Especialista da Equipe'}
                  </h3>
                  <p className="text-[11px] text-zinc-400">
                    Escolha o caminho guiado ou descreva por conversa. Nenhuma permissão oculta é concedida.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex bg-zinc-900 p-0.5 rounded-lg border border-zinc-800 text-xs">
                  <button
                    onClick={() => setCreatorMode('guided')}
                    className={`px-2.5 py-1 rounded-md cursor-pointer ${
                      creatorMode === 'guided' ? 'bg-zinc-800 text-white font-medium' : 'text-zinc-400'
                    }`}
                  >
                    Criação Guiada
                  </button>
                  <button
                    onClick={() => setCreatorMode('conversation')}
                    className={`px-2.5 py-1 rounded-md cursor-pointer ${
                      creatorMode === 'conversation' ? 'bg-zinc-800 text-amber-300 font-medium' : 'text-zinc-400'
                    }`}
                  >
                    Por Conversa
                  </button>
                </div>
                <button
                  onClick={() => setIsCreatorOpen(false)}
                  className="p-1 text-zinc-400 hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5 custom-chat-scrollbar">
              {/* Conversational Builder Box */}
              {creatorMode === 'conversation' && (
                <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-3">
                  <label className="block text-xs font-semibold text-amber-300">
                    Descreva o assistente que você deseja criar:
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={conversationPrompt}
                      onChange={e => setConversationPrompt(e.target.value)}
                      placeholder="Ex: Quero alguém que prepare propostas comerciais com meu modelo, meus serviços e minhas regras de preço"
                      className="flex-1 px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-xs text-zinc-100"
                    />
                    <button
                      onClick={handleGenerateFromConversation}
                      className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-semibold text-xs cursor-pointer shrink-0"
                    >
                      Gerar Configuração
                    </button>
                  </div>
                  {conversationExplanation && (
                    <p className="text-[11px] text-emerald-300 bg-emerald-950/40 border border-emerald-500/30 rounded-lg px-3 py-2">
                      ✨ {conversationExplanation}
                    </p>
                  )}
                </div>
              )}

              {/* 1. Nome, Ícone e Cor */}
              <div className="grid grid-cols-12 gap-3">
                <div className="col-span-2">
                  <label className="block text-[11px] text-zinc-400 mb-1">Ícone</label>
                  <input
                    type="text"
                    value={editingAgent.icon}
                    onChange={e => setEditingAgent({ ...editingAgent, icon: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-center text-base"
                  />
                </div>
                <div className="col-span-7">
                  <label className="block text-[11px] text-zinc-400 mb-1">Nome do Agente</label>
                  <input
                    type="text"
                    value={editingAgent.name}
                    onChange={e => setEditingAgent({ ...editingAgent, name: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-100"
                  />
                </div>
                <div className="col-span-3">
                  <label className="block text-[11px] text-zinc-400 mb-1">Pasta de Entregas</label>
                  <select
                    value={editingAgent.deliverables.targetFolder}
                    onChange={e =>
                      setEditingAgent({
                        ...editingAgent,
                        deliverables: { ...editingAgent.deliverables, targetFolder: e.target.value }
                      })
                    }
                    className="w-full px-2.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-200"
                  >
                    {Array.from(new Set(['Propostas', 'Projetos', 'Comercial', ...folders])).map(f => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* 2. Função */}
              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">
                  Função (O resultado que ele deve ajudar a produzir)
                </label>
                <textarea
                  rows={2}
                  value={editingAgent.roleDescription}
                  onChange={e => setEditingAgent({ ...editingAgent, roleDescription: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-100 resize-none"
                />
              </div>

              {/* 3. Conhecimento: Notas vinculadas com Papel */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-zinc-200">
                    Conhecimento Autorizado (Notas e o Papel de cada referência)
                  </label>
                </div>

                {/* Add Note Binding Row */}
                <div className="flex gap-2">
                  <select
                    id="new-bind-note"
                    defaultValue=""
                    className="flex-1 px-2.5 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-200"
                  >
                    <option value="">Selecionar uma nota do cofre para vincular...</option>
                    {notes.map(n => (
                      <option key={n.id} value={n.id}>
                        {n.title} ({n.folder})
                      </option>
                    ))}
                  </select>
                  <select
                    id="new-bind-role"
                    defaultValue="permanent_ref"
                    className="px-2.5 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-200"
                  >
                    <option value="template">Modelo a seguir</option>
                    <option value="permanent_ref">Referência permanente</option>
                    <option value="project_context">Contexto do cliente/projeto</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => {
                      const noteSel = document.getElementById('new-bind-note') as HTMLSelectElement
                      const roleSel = document.getElementById('new-bind-role') as HTMLSelectElement
                      const nId = noteSel?.value
                      const role = (roleSel?.value || 'permanent_ref') as ContextRole
                      const found = notes.find(n => n.id === nId)
                      if (!found) return
                      const newBind: ContextBinding = {
                        id: `bind_${Date.now()}`,
                        targetType: 'note',
                        noteId: found.id,
                        noteTitle: found.title,
                        role,
                        required: role === 'template',
                        precedence: role === 'template' ? 100 : 80,
                        updatePolicy: 'follow_latest'
                      }
                      setEditingAgent({
                        ...editingAgent,
                        knowledgeBindings: [...editingAgent.knowledgeBindings, newBind]
                      })
                      noteSel.value = ''
                    }}
                    className="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-200 border border-zinc-700 cursor-pointer"
                  >
                    + Vincular
                  </button>
                </div>

                {/* Bound List */}
                <div className="space-y-1.5">
                  {editingAgent.knowledgeBindings.map(b => (
                    <div
                      key={b.id}
                      className="flex items-center justify-between px-3 py-2 rounded-xl bg-zinc-900/80 border border-zinc-800 text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="px-2 py-0.5 rounded text-[10px] font-semibold"
                          style={{
                            backgroundColor: `${ROLE_LABELS[b.role].badgeColor}20`,
                            color: ROLE_LABELS[b.role].badgeColor
                          }}
                        >
                          {ROLE_LABELS[b.role].label}
                        </span>
                        <span className="text-zinc-200 font-medium">{b.noteTitle}</span>
                      </div>
                      <button
                        onClick={() =>
                          setEditingAgent({
                            ...editingAgent,
                            knowledgeBindings: editingAgent.knowledgeBindings.filter(x => x.id !== b.id)
                          })
                        }
                        className="text-zinc-500 hover:text-rose-400 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* 4. Ações Permitidas (Linguagem Humana - Seção 2) */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-zinc-200">
                  Ações Permitidas e Garantias
                </label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {(Object.keys(ACTION_LABELS) as AgentActionPermission[]).map(perm => {
                    const checked = editingAgent.allowedActions.includes(perm)
                    return (
                      <label
                        key={perm}
                        className="flex items-start gap-2 p-2.5 rounded-xl bg-zinc-900/70 border border-zinc-800 cursor-pointer text-xs"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={e => {
                            const next = e.target.checked
                              ? [...editingAgent.allowedActions, perm]
                              : editingAgent.allowedActions.filter(x => x !== perm)
                            setEditingAgent({ ...editingAgent, allowedActions: next })
                          }}
                          className="mt-0.5 accent-[#c59b27]"
                        />
                        <div>
                          <div className="font-medium text-zinc-200">{ACTION_LABELS[perm].label}</div>
                          <div className="text-[10px] text-zinc-400">{ACTION_LABELS[perm].summary}</div>
                        </div>
                      </label>
                    )
                  })}
                </div>
              </div>

              {/* 5. Configurações Avançadas Recolhidas */}
              <div className="border-t border-zinc-800 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAdvancedConfig(v => !v)}
                  className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 cursor-pointer"
                >
                  {showAdvancedConfig ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                  <span>Configurações avançadas (Modelo de IA, limites de orçamento e acionamento)</span>
                </button>

                {showAdvancedConfig && (
                  <div className="mt-3 grid grid-cols-3 gap-3 p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800 text-xs">
                    <div>
                      <label className="block text-[10px] text-zinc-400 mb-1">Padrão de Nome da Entrega</label>
                      <input
                        type="text"
                        value={editingAgent.deliverables.namingPattern}
                        onChange={e =>
                          setEditingAgent({
                            ...editingAgent,
                            deliverables: { ...editingAgent.deliverables, namingPattern: e.target.value }
                          })
                        }
                        className="w-full px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-200"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-zinc-400 mb-1">Limite de Subtarefas</label>
                      <input
                        type="number"
                        min={1}
                        max={8}
                        value={editingAgent.limits.maxSubtasks}
                        onChange={e =>
                          setEditingAgent({
                            ...editingAgent,
                            limits: { ...editingAgent.limits, maxSubtasks: Number(e.target.value) || 4 }
                          })
                        }
                        className="w-full px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-200"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-zinc-400 mb-1">Acionamento</label>
                      <select
                        value={editingAgent.triggerMode}
                        onChange={e =>
                          setEditingAgent({ ...editingAgent, triggerMode: e.target.value as any })
                        }
                        className="w-full px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-200"
                      >
                        <option value="on_demand">Somente por pedido</option>
                        <option value="by_project">Por projeto selecionado</option>
                        <option value="routine">Por rotina autorizada</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3.5 bg-[#181822] border-t border-zinc-800 flex items-center justify-between">
              <span className="text-[11px] text-zinc-400">
                🔒 Precisa da sua aprovação para alterar notas existentes.
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsCreatorOpen(false)}
                  className="px-3.5 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-300 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSaveAgentProfile}
                  className="px-4 py-1.5 rounded-xl text-xs font-semibold text-black cursor-pointer"
                  style={{ backgroundColor: 'var(--accent, #c59b27)' }}
                >
                  Salvar Perfil do Agente
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
