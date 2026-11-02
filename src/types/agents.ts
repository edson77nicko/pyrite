// ==========================================
// Pyrite Multi-Agent, Team, Workflow & Automation Contracts
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
  projectId?: string     // Se vinculado a um projeto/cliente específico
  role: ContextRole
  required: boolean
  precedence: number     // Maior valor tem precedência configurada se autorizado; conflitos geram alerta por padrão
  updatePolicy: 'follow_latest' | 'pin_revision'
  pinnedHash?: string
  pinnedContentSnapshot?: string // Mantém o conteúdo fixado para recuperação determinística em pin_revision
}

export interface ProjectContext {
  id: string
  name: string                  // Nome do Projeto / Pasta / Categoria (ex: "Clientes", "Marketing", "Blog", "Desenvolvimento")
  itemName?: string             // Nome do Item de Conteúdo específico (ex: "Construtora Horizonte", "Artigo Multiagentes")
  clientName: string            // Mantido para compatibilidade total; espelha (itemName || clientName)
  itemType?: string             // Tipo de conteúdo flexível (ex: "Cliente", "Artigo", "Produto", "Módulo", "Geral")
  category?: 'project' | 'item' // Categoria de agrupamento: 'project' (Projetos) ou 'item' (Itens: Clientes, Produtos, etc.)
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
  skills?: string[]        // IDs das skills de IA cadastradas no Pyrite atribuídas a este agente
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
  revisionMismatch?: boolean
  expectedPinnedHash?: string
}

export interface CommercialLineItem {
  id: string
  serviceName: string
  description: string
  quantity: number
  recurrence: 'one_time' | 'monthly'
  unitPrice: number
  unitPriceCents: number
  discountPercent: number
  subtotal: number
  subtotalCents: number
  discountAmount: number
  discountAmountCents: number
  total: number
  totalCents: number
  timeframe?: string
  sourceNoteTitle: string
}

export interface CommercialConflict {
  id: string
  serviceKey: string
  field: string
  sourceA: string
  valueA: string
  priceACents: number
  sourceB: string
  valueB: string
  priceBCents: number
  resolution: 'unresolved' | 'user_decided' | 'precedence_rule'
  chosenValue?: string
  chosenPriceCents?: number
}

export interface CommercialCalculationResult {
  items: CommercialLineItem[]
  grossTotal: number
  grossTotalCents: number
  totalDiscount: number
  totalDiscountCents: number
  netTotal: number
  netTotalCents: number
  monthlyRecurringTotal: number
  monthlyRecurringTotalCents: number
  downPaymentPercent: number
  downPaymentAmount: number
  downPaymentCents: number
  financedBalance: number
  financedBalanceCents: number
  installments: number
  installmentValue: number
  installmentValueCents: number
  lastInstallmentValue?: number
  lastInstallmentValueCents?: number
  currency: string
  conflicts: CommercialConflict[]
  missingFields: string[]
  unfilledPlaceholders: string[]
  fixedSectionViolations: string[]
  appliedRuleSource?: string
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
    noteId?: string
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
  findings?: string[]
}

// ==========================================
// Canvas 1: Equipes (Team Builder)
// ==========================================

export interface TeamMemberNode {
  id: string
  agentId: string
  position: { x: number; y: number }
  roleInTeam: 'coordinator' | 'specialist' | 'reviewer'
  contextScope: ContextRole[]
  allowedOutputTypes: ('note' | 'tasks' | 'mindmap' | 'draw')[]
  requireUserReview?: boolean
}

export interface TeamEdge {
  id: string
  sourceNodeId: string
  targetNodeId: string
  relation: 'delegates_to' | 'reviews_output' | 'depends_on'
  label?: string
}

export interface TeamDefinition {
  id: string
  version: number
  name: string
  description: string
  coordinatorAgentId: string
  nodes: TeamMemberNode[]
  edges: TeamEdge[]
  maxParallelSubtasks: number
  createdAt: number
  updatedAt: number
}

// ==========================================
// Canvas 2: Fluxos de Trabalho (Workflow Builder)
// ==========================================

export type WorkflowNodeKind =
  | 'input'        // Entrada / Gatilho
  | 'read_note'    // Prompt / Consultar Nota
  | 'run_agent'    // Executar Agente
  | 'llm'          // Chamada Direta LLM
  | 'condition'    // Verificar Condição
  | 'approval'     // Solicitar Aprovação
  | 'deliverable'  // Saída / Criar Entrega
  | 'finish'       // Finalizar
  | 'sticky_note'  // Nota visual no canvas
  | 'text_block'   // Tarja de texto / título de seção

export interface WorkflowNode {
  id: string
  kind: WorkflowNodeKind
  label: string
  position: { x: number; y: number }
  config: {
    noteId?: string
    noteTitle?: string
    folderPath?: string
    contextRole?: ContextRole
    agentId?: string
    teamId?: string
    model?: string
    temperature?: number
    reasoning?: 'low' | 'medium' | 'high'
    promptTemplate?: string
    triggerType?: 'schedule' | 'manual' | 'task_event' | 'note_event'
    scheduleFrequency?: 'daily' | 'weekly' | 'weekdays' | 'monthly'
    scheduleTime?: string
    scheduleDays?: string[]
    conditionType?: 'no_missing_fields' | 'no_price_conflicts' | 'net_total_above' | 'always' | 'contains' | 'not_contains' | 'status_equals' | 'has_approval' | 'custom'
    conditionThreshold?: number
    targetFolder?: string
    outputType?: 'note' | 'tasks' | 'mindmap' | 'draw'
    namingPattern?: string
    approvalMessage?: string
    systemPrompt?: string
    rule?: string
    trueLabel?: string
    falseLabel?: string
    boardId?: string
    eventType?: string
    content?: string
    description?: string
    branchTaken?: 'yes' | 'no' | 'true' | 'false'
    lastOutput?: string
    lastExecutedAt?: number
    color?: string
    nextRunAt?: string
  }
}

export interface WorkflowEdge {
  id: string
  sourceNodeId: string
  targetNodeId: string
  branch?: 'default' | 'true' | 'false' | 'approved' | 'rejected' | 'yes' | 'no'
  label?: string
}

export interface WorkflowDefinition {
  id: string
  version: number
  publishedVersion?: number
  status: 'draft' | 'published'
  active?: boolean
  nextRunAt?: string
  lastTriggeredAt?: number
  name: string
  description: string
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  createdAt: number
  updatedAt: number
}

export interface WorkflowNodeExecution {
  nodeId: string
  label: string
  kind: WorkflowNodeKind
  status: 'pending' | 'running' | 'waiting_approval' | 'completed' | 'skipped' | 'failed'
  outputSummary?: string
  startedAt?: number
  endedAt?: number
}

export interface AgentRun {
  id: string
  idempotencyKey: string
  agentId: string
  agentName: string
  agentVersion: number
  teamId?: string
  workflowId?: string
  routineId?: string
  pausedAtWorkflowNodeId?: string
  teamSnapshot?: TeamDefinition
  workflowSnapshot?: WorkflowDefinition
  workflowNodeStates?: WorkflowNodeExecution[]
  isTestRun: boolean // Se true, não grava em disco até ação explícita do usuário
  prompt: string
  clientName?: string
  projectContextId?: string
  extraNoteIds?: string[]
  status: RunStatus
  proposalStatus?: ProposalStatus
  sourceSnapshots: SourceSnapshot[]
  missingReferences: string[]
  clarifyingQuestions: string[]
  userAnswers?: Record<string, string>
  conflictResolutions?: Record<string, { chosenValue: string; chosenPriceCents: number }>
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

// ==========================================
// Canvas 3: Rotinas (Simple + Visual Canvas)
// ==========================================

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
  targetKind?: 'agent' | 'team' | 'workflow'
  agentId: string
  agentVersion: number
  teamId?: string
  workflowId?: string
  projectContextId?: string
  targetFolder: string
  requireApproval: boolean
  maxRunsPerDay: number
  lastTriggeredAt?: number
  lastEventFingerprint?: string
  processedEventFingerprints?: string[]
  nextRunAt?: string
  recentRunIds: string[]
  visualLayout?: {
    triggerX: number
    triggerY: number
    contextX: number
    contextY: number
    executorX: number
    executorY: number
    approvalX: number
    approvalY: number
    outputX: number
    outputY: number
  }
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

export interface AgentChatMessage {
  id: string
  agentId: string
  sender: 'user' | 'agent'
  text: string
  createdAt: number
  runId?: string
  clientName?: string
  extraNoteIds?: string[]
  steps?: SubagentStep[]
  facts?: string[]
}

export interface MultiAgentStoreState {
  version: number
  agents: AgentProfileVersion[]
  agentHistoryVersions: AgentProfileVersion[]
  teams?: TeamDefinition[]
  workflows?: WorkflowDefinition[]
  projects: ProjectContext[]
  runs: AgentRun[]
  artifacts: AgentArtifact[]
  automations: AutomationVersion[]
  mailboxQueue: AgentQueueDelivery[]
  agentChats?: Record<string, AgentChatMessage[]>
  demoExamplesLoaded?: boolean
}
