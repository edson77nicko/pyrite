// ==========================================
// Pyrite Multi-Agent, Team & Automation Contracts
// ==========================================

export type ContextRole =
  | 'template'           // Modelo a seguir (preservar estrutura, criar novo documento)
  | 'permanent_ref'      // Referência permanente (catálogo de serviços, regras e preços)
  | 'project_context'    // Contexto do projeto ou cliente (briefing, reuniões, escopo)
  | 'request_context'    // Contexto deste pedido (utilizar apenas nesta execução)

export type AgentActionPermission =
  | 'read_context'       // Ler fontes vinculadas e autorizadas
  | 'prepare_draft'      // Preparar rascunhos na pasta de destino autorizada
  | 'propose_patch'      // Propor alterações em notas existentes (requer aprovação)
  | 'create_tasks'       // Criar e atualizar tarefas de acompanhamento
  | 'edit_mindmap'       // Criar ou editar mapas mentais por ID
  | 'edit_diagram'       // Criar ou editar diagramas/draws por ID
  | 'delegate_team'      // Coordenar e delegar subtarefas para especialistas

export type AgentSpecialistRole =
  | 'proposal_specialist'  // Especialista em propostas comerciais
  | 'knowledge_curator'    // Curador de conhecimento (sínteses, conexões e organização)
  | 'project_planner'      // Planejador (etapas, tarefas, dependências e perguntas)
  | 'cartographer'         // Cartógrafo (mapas mentais preservando elementos existentes)
  | 'diagram_designer'     // Designer de diagramas (fluxos e diagramas ligados a notas)
  | 'reviewer'             // Revisor (conferência de fontes, omissões e consistência)
  | 'coordinator'          // Coordenador de equipe (distribui trabalho e integra entregas)
  | 'custom'               // Personalizado pelo usuário

export type AgentState =
  | 'available'          // Disponível
  | 'working'            // Trabalhando
  | 'waiting_user'       // Aguardando você (aprovação ou informações faltantes)
  | 'paused'             // Pausado

export type RunStatus =
  | 'queued'             // Na fila
  | 'running'            // Em execução
  | 'waiting_dependency' // Aguardando dependência de especialista
  | 'waiting_approval'   // Aguardando aprovação do usuário
  | 'waiting_user'       // Aguardando informações do usuário
  | 'completed'          // Concluída
  | 'failed'             // Falhou
  | 'cancelled'          // Cancelada
  | 'interrupted'        // Interrompida (ex: reinício do app)
  | 'uncertain'          // Resultado incerto (exige reconciliação)

export type ProposalStatus =
  | 'draft'              // Rascunho
  | 'pending_info'       // Com pendências
  | 'approved'           // Aprovada pelo usuário
  | 'sent'               // Enviada (registro explícito)

export type TriggerMode =
  | 'on_demand'          // Somente por pedido
  | 'by_project'         // Por projeto/cliente selecionado
  | 'routine'            // Por rotina autorizada

export interface ContextBinding {
  id: string
  targetType: 'note' | 'folder'
  noteId?: string
  noteTitle: string
  folderPath?: string
  filePath?: string
  role: ContextRole
  required: boolean
  precedence: number // Maior valor tem precedência configurada se autorizado; conflitos geram alerta por padrão
  updatePolicy: 'follow_latest' | 'pin_revision'
  pinnedHash?: string
}

export interface ProjectContext {
  id: string
  name: string
  clientName: string
  description?: string
  folderPath?: string
  briefingNoteIds: string[]
  createdAt: number
  updatedAt: number
}

export interface AgentDeliverableConfig {
  targetFolder: string
  namingPattern: string // ex: "Proposta - {cliente} - {data}"
  outputTypes: ('note' | 'tasks' | 'mindmap' | 'draw')[]
  requireApprovalForExisting: boolean
}

export interface AgentLimitsConfig {
  maxDurationSec: number
  maxSteps: number
  maxSubtasks: number
  maxDelegationDepth: number
  allowDelegation: boolean
  specialistTeamIds?: string[]
}

export interface AgentProfileVersion {
  id: string               // ID estável do agente
  version: number          // Versão incremental (1, 2, 3...)
  name: string
  icon: string             // Emoji ou identificador de ícone
  color: string            // Cor hex para identificação visual
  specialistRole: AgentSpecialistRole
  roleDescription: string  // "O resultado que ele deve ajudar a produzir"
  workStyle: {
    tone: string
    rules: string[]
    requiredQuestions: string[]
    guardrails: string[]
    fixedSections?: string[]
  }
  knowledgeBindings: ContextBinding[]
  allowedActions: AgentActionPermission[]
  deliverables: AgentDeliverableConfig
  aiConfig: {
    useDefault: boolean
    provider?: string
    model?: string
    temperature?: number
  }
  limits: AgentLimitsConfig
  triggerMode: TriggerMode
  state: AgentState
  createdAt: number
  updatedAt: number
}

export interface SourceSnapshot {
  sourceId: string
  title: string
  folder: string
  role: ContextRole
  hash: string
  capturedAt: number
  contentSnapshot: string // Snapshot local com retenção para reprodução fiel
  available: boolean
}

export interface CommercialLineItem {
  id: string
  serviceName: string
  description: string
  quantity: number
  unitPrice: number
  discountPercent: number
  subtotal: number
  discountAmount: number
  total: number
  sourceNoteTitle: string
}

export interface CommercialCalculationResult {
  items: CommercialLineItem[]
  grossTotal: number
  totalDiscount: number
  netTotal: number
  installments: number
  installmentValue: number
  currency: string
  conflicts: {
    field: string
    sourceA: string
    valueA: string
    sourceB: string
    valueB: string
    resolution: 'unresolved' | 'user_decided' | 'precedence_rule'
    chosenValue?: string
  }[]
  missingFields: string[]
  fixedSectionViolations: string[]
}

export interface ChangeSetOperation {
  id: string
  type: 'create_note' | 'update_note' | 'create_task' | 'create_mindmap' | 'create_diagram'
  targetTitle: string
  targetFolder: string
  targetNoteId?: string
  expectedRevisionHash?: string
  contentPreview: string
  status: 'pending' | 'approved' | 'rejected' | 'committed' | 'conflict' | 'failed'
  commitReceipt?: {
    filePath?: string
    revisionHash: string
    committedAt: number
  }
  error?: string
}

export interface ChangeSet {
  id: string
  runId: string
  operations: ChangeSetOperation[]
  requiresApproval: boolean
  planHash: string
  createdAt: number
}

export interface ApprovalRecord {
  id: string
  runId: string
  changeSetId: string
  planHash: string
  scope: string
  status: 'pending' | 'approved' | 'rejected' | 'expired'
  decidedAt?: number
  expiresAt: number
}

export interface AgentArtifact {
  id: string
  runId: string
  agentId: string
  agentVersion: number
  title: string
  folder: string
  noteId?: string
  filePath?: string
  artifactType: 'proposal' | 'note' | 'tasks' | 'mindmap' | 'draw'
  proposalStatus?: ProposalStatus
  clientName?: string
  projectId?: string
  sourceSnapshots: SourceSnapshot[]
  calculation?: CommercialCalculationResult
  revisionHash: string
  createdAt: number
}

export interface SubagentStep {
  id: string
  specialistId: string
  specialistName: string
  specialistRole: AgentSpecialistRole
  title: string
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
  summary: string
  startedAt: number
  endedAt?: number
  outputPreview?: string
}

export interface AgentRun {
  id: string
  idempotencyKey: string
  agentId: string
  agentName: string
  agentVersion: number
  isTestRun: boolean // Se true, não grava em disco até ação explícita do usuário
  prompt: string
  clientName?: string
  projectContextId?: string
  status: RunStatus
  proposalStatus?: ProposalStatus
  sourceSnapshots: SourceSnapshot[]
  missingReferences: string[]
  clarifyingQuestions: string[]
  userAnswers?: Record<string, string>
  calculation?: CommercialCalculationResult
  draftContent?: string
  reviewChecklist: {
    label: string
    passed: boolean
    detail: string
  }[]
  subagentSteps: SubagentStep[]
  changeSet?: ChangeSet
  approval?: ApprovalRecord
  artifacts: AgentArtifact[]
  error?: string
  startedAt: number
  updatedAt: number
  completedAt?: number
}

export type AutomationTriggerKind =
  | 'meeting_completed'  // Ao concluir uma reunião
  | 'weekly_schedule'    // Toda sexta-feira (ou dia/hora configurado em fuso IANA)
  | 'briefing_added'     // Ao adicionar um briefing à pasta autorizada
  | 'task_completed'     // Quando uma tarefa for concluída

export interface AutomationVersion {
  id: string
  version: number
  name: string
  description: string
  active: boolean
  triggerKind: AutomationTriggerKind
  scheduleConfig?: {
    dayOfWeek?: number // 0-6 (5 = Sexta-feira)
    hour: number
    minute: number
    timezone: string // ex: 'America/Sao_Paulo'
    missedPolicy: 'skip' | 'run_once_on_open'
  }
  watchFolder?: string
  agentId: string
  agentVersion: number
  targetFolder: string
  requireApproval: boolean
  maxRunsPerDay: number
  lastTriggeredAt?: number
  nextRunAt?: string
  recentRunIds: string[]
  createdAt: number
  updatedAt: number
}

export interface AgentQueueDelivery {
  id: string
  idempotencyKey: string
  runId: string
  senderKind: 'user' | 'agent' | 'routine'
  senderAgentId?: string
  recipientAgentId: string
  text: string
  status: 'queued' | 'running' | 'completed' | 'failed' | 'interrupted' | 'cancelled'
  createdAt: number
  updatedAt: number
}

export interface MultiAgentStoreState {
  version: number
  agents: AgentProfileVersion[]
  agentHistoryVersions: AgentProfileVersion[]
  projects: ProjectContext[]
  runs: AgentRun[]
  artifacts: AgentArtifact[]
  automations: AutomationVersion[]
  mailboxQueue: AgentQueueDelivery[]
}
