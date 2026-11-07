import React, { useState, useRef, useEffect, useMemo } from 'react'
import type {
  AgentProfileVersion,
  AgentRun,
  ProjectContext,
  WorkflowDefinition,
  WorkflowEdge,
  WorkflowNode,
  WorkflowNodeExecution,
  WorkflowNodeKind
} from '../types/agents'
import type { Note } from '../types'
import type { TaskBoard } from '../types/tasks'
import {
  validateWorkflowDefinition,
  executeWorkflowSingleNode
} from '../utils/multiAgentEngine'
import {
  snapDiagramCoord,
  diagramVerticalEdgePath,
  diagramVerticalEdgeArrow,
  diagramEdgeMidpoint,
  diagramConnectionProblem,
  getNodeTopPort,
  getNodeBottomPort,
  autoLayoutVertical,
  VERTICAL_CARD_WIDTH,
  VERTICAL_CARD_HEIGHT
} from '../utils/openbotDiagramUtils'
import {
  GitBranch,
  Plus,
  Trash2,
  Play,
  ZoomIn,
  ZoomOut,
  X,
  Zap,
  Bot,
  Sparkles,
  MessageSquare,
  ShieldCheck,
  Send,
  ChevronDown,
  StickyNote,
  Type,
  Search,
  Sliders,
  Check,
  CheckCircle2,
  Copy,
  ListTodo,
  Loader2,
  FlaskConical,
  AlertTriangle,
  Eraser,
  PanelLeft,
  LayoutGrid,
  Info,
  Layers,
  CopyPlus
} from 'lucide-react'
import { CustomSelect } from './CustomSelect'
import { CustomTimePicker } from './CustomTimePicker'

interface WorkflowCanvasEditorProps {
  workflows: WorkflowDefinition[]
  agents: AgentProfileVersion[]
  notes: Note[]
  folders: string[]
  selectedWorkflowId: string
  latestNodeStates?: WorkflowNodeExecution[]
  activeRun?: AgentRun
  allProjects?: ProjectContext[]
  taskBoards?: TaskBoard[]
  onSelectWorkflow: (workflowId: string) => void
  onSaveWorkflow: (workflow: WorkflowDefinition) => void
  onDeleteWorkflow: (workflowId: string) => void
  onRunWorkflow: (workflow: WorkflowDefinition, isTest: boolean, prompt: string) => void
  onResumeWorkflowRun?: (run: AgentRun) => Promise<void> | void
  onOpenNote?: (noteId: string) => void
  isExecuting: boolean
}

/**
 * Campo de exibição do resultado de execução da etapa (sanfona minimalista com cópia e limpeza).
 */
const ResultField: React.FC<{
  output?: string
  isRunning?: boolean
  lastExecutedAt?: number
  onClear?: () => void
}> = ({ output, isRunning, lastExecutedAt, onClear }) => {
  const [copied, setCopied] = useState(false)
  const [isExpanded, setIsExpanded] = useState(true)
  if (!output && !isRunning) return null

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!output) return
    navigator.clipboard.writeText(output)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleClearClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onClear?.()
  }

  const timeLabel = lastExecutedAt
    ? new Date(lastExecutedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : undefined

  return (
    <div className="mt-2.5 pt-2 border-t border-zinc-800/60 text-xs select-none">
      <div className="flex items-center justify-between text-[10.5px] text-zinc-400 font-medium py-0.5">
        <button
          type="button"
          onClick={() => setIsExpanded(v => !v)}
          className="flex items-center gap-1.5 hover:text-zinc-200 cursor-pointer select-none text-left"
          title={isExpanded ? 'Recolher resultado' : 'Expandir resultado'}
        >
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isRunning ? 'bg-amber-400 animate-ping' : 'bg-emerald-500'}`} />
          <span className="truncate">{isRunning ? 'Executando teste...' : 'Resultado da etapa'}</span>
          {timeLabel && !isRunning && (
            <span className="text-[9.5px] text-zinc-500 font-mono">({timeLabel})</span>
          )}
          <ChevronDown className={`w-3 h-3 text-zinc-500 shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
        </button>

        <div className="flex items-center gap-1 shrink-0">
          {output && !isRunning && (
            <button
              type="button"
              onClick={handleCopy}
              className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
              title={copied ? 'Copiado!' : 'Copiar'}
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          )}
          {output && !isRunning && onClear && (
            <button
              type="button"
              onClick={handleClearClick}
              className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-rose-400 transition-colors cursor-pointer"
              title="Limpar resultado"
            >
              <Eraser className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {isExpanded && (
        isRunning ? (
          <div className="bg-[#101012] border border-amber-500/30 rounded-lg p-2.5 space-y-1.5 animate-pulse mt-1.5">
            <div className="flex items-center gap-2 text-[11px] text-amber-300 font-medium">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
              <span>Processando etapa em tempo real...</span>
            </div>
          </div>
        ) : (
          <div className="bg-[#141416] border border-zinc-800/80 rounded-lg p-2 text-zinc-300 leading-relaxed max-h-36 overflow-y-auto custom-chat-scrollbar text-[11px] whitespace-pre-wrap select-text mt-1.5 font-mono">
            {output}
          </div>
        )
      )}
    </div>
  )
}

/**
 * Metadados dos tipos de nós inspirados no estilo da referência (Categoria | Subcategoria)
 */
const NODE_META: Record<
  WorkflowNodeKind,
  {
    label: string
    category: string
    subcategory: string
    color: string
    bgLight: string
    icon: any
    defaultDesc: string
  }
> = {
  input: {
    label: 'Gatilho Inicial',
    category: 'TRIGGER',
    subcategory: 'USER ACTIVITY',
    color: '#38bdf8',
    bgLight: 'rgba(56, 189, 248, 0.12)',
    icon: Zap,
    defaultDesc: 'Início da execução (Manual, Agendamento ou Evento)'
  },
  read_note: {
    label: 'Instrução / Nota',
    category: 'INPUT',
    subcategory: 'KNOWLEDGE',
    color: '#60a5fa',
    bgLight: 'rgba(96, 165, 250, 0.12)',
    icon: MessageSquare,
    defaultDesc: 'Lê documento do cofre ou injeta contexto'
  },
  sticky_note: {
    label: 'Nota Adesiva',
    category: 'DOCS',
    subcategory: 'ANNOTATION',
    color: '#facc15',
    bgLight: 'rgba(250, 204, 21, 0.12)',
    icon: StickyNote,
    defaultDesc: 'Anotação visual livre no quadro'
  },
  text_block: {
    label: 'Tarja de Título',
    category: 'LAYOUT',
    subcategory: 'HEADER',
    color: '#94a3b8',
    bgLight: 'rgba(148, 163, 184, 0.12)',
    icon: Type,
    defaultDesc: 'Separador de seções e etapas'
  },
  llm: {
    label: 'Processamento IA',
    category: 'LOGIC',
    subcategory: 'REASONING',
    color: '#c084fc',
    bgLight: 'rgba(192, 132, 252, 0.12)',
    icon: Sparkles,
    defaultDesc: 'Geração e síntese com Modelo de IA'
  },
  run_agent: {
    label: 'Especialista',
    category: 'ACTION',
    subcategory: 'SPECIALIST',
    color: '#34d399',
    bgLight: 'rgba(52, 211, 153, 0.12)',
    icon: Bot,
    defaultDesc: 'Executa um agente dedicado da equipe'
  },
  condition: {
    label: 'If / else',
    category: 'LOGIC',
    subcategory: 'CONDITIONS',
    color: '#fbbf24',
    bgLight: 'rgba(251, 191, 36, 0.12)',
    icon: GitBranch,
    defaultDesc: 'Avalia regra e bifurca em caminhos NO / YES'
  },
  approval: {
    label: 'Revisão Humana',
    category: 'GATE',
    subcategory: 'APPROVAL',
    color: '#fb923c',
    bgLight: 'rgba(251, 146, 60, 0.12)',
    icon: ShieldCheck,
    defaultDesc: 'Pausa a execução aguardando decisão do usuário'
  },
  create_task: {
    label: 'Criar Tarefas',
    category: 'ACTION',
    subcategory: 'USER MANAGEMENT',
    color: '#22d3ee',
    bgLight: 'rgba(34, 211, 238, 0.12)',
    icon: ListTodo,
    defaultDesc: 'Desdobra plano em itens no quadro de tarefas'
  },
  manage_properties: {
    label: 'Propriedades',
    category: 'ACTION',
    subcategory: 'DATA PIPELINE',
    color: '#f472b6',
    bgLight: 'rgba(244, 114, 182, 0.12)',
    icon: Sliders,
    defaultDesc: 'Gerencia propriedades e metadados'
  },
  deliverable: {
    label: 'Gravar no Cofre',
    category: 'ACTION',
    subcategory: 'COMMUNICATION',
    color: '#818cf8',
    bgLight: 'rgba(129, 140, 248, 0.12)',
    icon: Send,
    defaultDesc: 'Salva entrega final como nota no cofre'
  },
  finish: {
    label: 'Concluir Fluxo',
    category: 'OUTPUT',
    subcategory: 'COMPLETION',
    color: '#a1a1aa',
    bgLight: 'rgba(161, 161, 170, 0.12)',
    icon: CheckCircle2,
    defaultDesc: 'Finaliza a automação com sucesso'
  }
}

export const WorkflowCanvasEditor: React.FC<WorkflowCanvasEditorProps> = ({
  workflows = [],
  agents = [],
  notes = [],
  folders = [],
  selectedWorkflowId,
  latestNodeStates: _latestNodeStates,
  activeRun,
  allProjects = [],
  taskBoards = [],
  onSelectWorkflow,
  onSaveWorkflow,
  onDeleteWorkflow,
  onRunWorkflow,
  isExecuting
}) => {
  // Garantia absoluta contra undefined (evita tela preta)
  const defaultFallbackWf: WorkflowDefinition = useMemo(
    () => ({
      id: 'wf-default-empty',
      version: 1,
      publishedVersion: 1,
      status: 'published',
      name: 'Novo Fluxo de Trabalho',
      description: 'Defina etapas e conecte agentes em uma esteira de execução vertical.',
      nodes: [
        {
          id: 'node-trigger-init',
          kind: 'input',
          label: 'Gatilho Inicial',
          position: { x: 380, y: 80 },
          config: { triggerType: 'manual', content: 'Início do fluxo sob demanda' }
        }
      ],
      edges: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    }),
    []
  )

  const activeWorkflow: WorkflowDefinition =
    workflows.find(w => w.id === selectedWorkflowId) || workflows[0] || defaultFallbackWf

  // Abas do topo: Editor vs Runs (Execuções)
  const [activeTab, setActiveTab] = useState<'editor' | 'runs'>('editor')

  // Estado de alterações não publicadas (Unpublished changes banner)
  const [hasUnpublishedChanges, setHasUnpublishedChanges] = useState(false)
  const lastSavedVersionRef = useRef<string>(JSON.stringify(activeWorkflow))

  useEffect(() => {
    lastSavedVersionRef.current = JSON.stringify(activeWorkflow)
    setHasUnpublishedChanges(false)
  }, [activeWorkflow.id])

  const runForThisWorkflow =
    activeRun && activeWorkflow && activeRun.workflowId === activeWorkflow.id ? activeRun : undefined

  // Canvas Transform
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 120, y: 60 })
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)

  // Painéis laterais
  const [isFlowSidebarOpen, setIsFlowSidebarOpen] = useState(false)
  const [flowSearchQuery, setFlowSearchQuery] = useState('')
  const [rightPanelTab, setRightPanelTab] = useState<'details' | 'checklist'>('details')
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(true)

  // Edição de título

  // Menu de Adicionar Bloco
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false)
  const [addMenuSearch, setAddMenuSearch] = useState('')

  // Execução de nó individual
  const [executingNodeId, setExecutingNodeId] = useState<string | null>(null)

  // Dragging de nós
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null)
  const dragOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const panStartRef = useRef<{ x: number; y: number; panX: number; panY: number }>({
    x: 0,
    y: 0,
    panX: 0,
    panY: 0
  })

  // Fio interativo sendo puxado (da porta inferior à superior)
  const [wireDraft, setWireDraft] = useState<{
    fromNodeId: string
    toWorld: { x: number; y: number }
    hoveredTargetId: string | null
  } | null>(null)

  const viewportRef = useRef<HTMLDivElement>(null)
  const addMenuRef = useRef<HTMLDivElement>(null)

  // Validação do grafo
  const validation = useMemo(
    () => validateWorkflowDefinition(activeWorkflow, agents, notes),
    [activeWorkflow, agents, notes]
  )

  const selectedNode = (activeWorkflow.nodes || []).find(n => n.id === selectedNodeId)

  // Remover nó
  const handleRemoveNode = (nodeId: string) => {
    const updated: WorkflowDefinition = {
      ...activeWorkflow,
      version: (activeWorkflow.version || 1) + 1,
      nodes: (activeWorkflow.nodes || []).filter(n => n.id !== nodeId),
      edges: (activeWorkflow.edges || []).filter(e => e.sourceNodeId !== nodeId && e.targetNodeId !== nodeId),
      updatedAt: Date.now()
    }
    onSaveWorkflow(updated)
    if (selectedNodeId === nodeId) setSelectedNodeId(null)
    setHasUnpublishedChanges(true)
  }

  // Remover aresta
  const handleRemoveEdge = (edgeId: string) => {
    const updated: WorkflowDefinition = {
      ...activeWorkflow,
      edges: (activeWorkflow.edges || []).filter(e => e.id !== edgeId),
      updatedAt: Date.now()
    }
    onSaveWorkflow(updated)
    if (selectedEdgeId === edgeId) setSelectedEdgeId(null)
    setHasUnpublishedChanges(true)
  }

  // Teclas de atalho (Delete / Escape)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement
      const isInput =
        activeEl &&
        (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT')
      if (isInput) return

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedNodeId && activeWorkflow) {
          handleRemoveNode(selectedNodeId)
        } else if (selectedEdgeId && activeWorkflow) {
          handleRemoveEdge(selectedEdgeId)
        }
      } else if (e.key === 'Escape') {
        setIsAddMenuOpen(false)
        setSelectedNodeId(null)
        setSelectedEdgeId(null)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedNodeId, selectedEdgeId, activeWorkflow])

  // Fechar menu de adicionar ao clicar fora
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (addMenuRef.current && !addMenuRef.current.contains(e.target as Node)) {
        setIsAddMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Coordenadas da tela para o mundo
  const screenToWorld = (clientX: number, clientY: number) => {
    const rect = viewportRef.current?.getBoundingClientRect() || { left: 0, top: 0 }
    return {
      x: snapDiagramCoord((clientX - rect.left - pan.x) / zoom),
      y: snapDiagramCoord((clientY - rect.top - pan.y) / zoom)
    }
  }

  // Centralizar visualização
  const handleFitView = () => {
    const nodes = activeWorkflow.nodes || []
    if (nodes.length === 0) {
      setZoom(1)
      setPan({ x: 120, y: 60 })
      return
    }

    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity

    for (const node of nodes) {
      const px = node.position?.x ?? 380
      const py = node.position?.y ?? 80
      minX = Math.min(minX, px)
      minY = Math.min(minY, py)
      maxX = Math.max(maxX, px + VERTICAL_CARD_WIDTH)
      maxY = Math.max(maxY, py + VERTICAL_CARD_HEIGHT)
    }

    const flowWidth = Math.max(100, maxX - minX)
    const flowHeight = Math.max(100, maxY - minY)
    const rect = viewportRef.current?.getBoundingClientRect() || { width: 900, height: 600 }
    const padding = 80

    const nextZoom = Math.min(
      1.15,
      Math.max(0.4, Math.min((rect.width - padding * 2) / flowWidth, (rect.height - padding * 2) / flowHeight))
    )
    const nextPanX = (rect.width - flowWidth * nextZoom) / 2 - minX * nextZoom
    const nextPanY = Math.max(40, (rect.height - flowHeight * nextZoom) / 2 - minY * nextZoom)

    setZoom(nextZoom)
    setPan({ x: Math.round(nextPanX), y: Math.round(nextPanY) })
  }

  // Auto-Organizar Verticalmente (como na referência)
  const handleAutoLayoutVertical = () => {
    const reordered = autoLayoutVertical(activeWorkflow.nodes || [], activeWorkflow.edges || [])
    const updated: WorkflowDefinition = {
      ...activeWorkflow,
      nodes: reordered,
      updatedAt: Date.now()
    }
    onSaveWorkflow(updated)
    setHasUnpublishedChanges(true)
    setTimeout(handleFitView, 60)
  }

  // Adicionar novo nó
  const handleAddNode = (kind: WorkflowNodeKind, overridePos?: { x: number; y: number }) => {
    const meta = NODE_META[kind] || { label: 'Etapa' }
    const nodes = activeWorkflow.nodes || []
    let pos: { x: number; y: number }

    if (overridePos) {
      pos = overridePos
    } else {
      // Posicionar no centro visível do viewport
      const rect = viewportRef.current?.getBoundingClientRect()
      if (rect) {
        const centerWorld = screenToWorld(rect.left + rect.width / 2, rect.top + rect.height / 2)
        pos = {
          x: centerWorld.x - VERTICAL_CARD_WIDTH / 2,
          y: centerWorld.y - VERTICAL_CARD_HEIGHT / 2
        }
      } else {
        const lastNode = nodes[nodes.length - 1]
        pos = lastNode
          ? { x: (lastNode.position?.x ?? 380), y: (lastNode.position?.y ?? 80) + 140 }
          : { x: 380, y: 80 }
      }
    }

    const newNode: WorkflowNode = {
      id: `wn_${kind}_${Date.now()}`,
      kind,
      label: meta.label,
      position: pos,
      config:
        kind === 'input'
          ? { triggerType: 'manual', content: '' }
          : kind === 'run_agent'
          ? { agentId: agents[0]?.id || '' }
          : kind === 'llm'
          ? { model: 'gpt-4o', reasoning: 'low', promptTemplate: '' }
          : kind === 'condition'
          ? { conditionType: 'contains', expectedValue: '' }
          : kind === 'approval'
          ? { approvalMessage: 'Por favor, revise o resultado para prosseguir.' }
          : kind === 'create_task'
          ? { taskMode: 'auto_ai', targetBoardId: taskBoards[0]?.id || 'default', taskPriority: 'medium' }
          : kind === 'deliverable'
          ? { targetFolder: folders[0] || 'Propostas', outputType: 'note', namingPattern: 'Entrega - {data}' }
          : {}
    }

    const nextNodes = [...nodes, newNode]
    const updated: WorkflowDefinition = {
      ...activeWorkflow,
      version: (activeWorkflow.version || 1) + 1,
      nodes: nextNodes,
      updatedAt: Date.now()
    }
    onSaveWorkflow(updated)
    setSelectedNodeId(newNode.id)
    setIsAddMenuOpen(false)
    setHasUnpublishedChanges(true)
  }


  // Conectar aresta do nó de origem ao nó de destino
  const completeWireConnection = (fromId: string, toId: string) => {
    const nodes = activeWorkflow.nodes || []
    const edges = activeWorkflow.edges || []
    const targetNode = nodes.find(n => n.id === toId)
    if (!targetNode) return

    const problem = diagramConnectionProblem(edges, fromId, toId, targetNode.kind === 'input')
    if (problem) return

    const sourceNode = nodes.find(n => n.id === fromId)
    const existingOutEdges = edges.filter(e => e.sourceNodeId === fromId)

    // Se o nó de origem for 'condition', a primeira conexão vira 'false' (NO) e a segunda vira 'true' (YES)
    let branch: WorkflowEdge['branch'] = 'default'
    let label: string | undefined = undefined

    if (sourceNode?.kind === 'condition') {
      const hasFalse = existingOutEdges.some(e => e.branch === 'false')
      const hasTrue = existingOutEdges.some(e => e.branch === 'true')
      if (!hasFalse) {
        branch = 'false'
        label = 'NO'
      } else if (!hasTrue) {
        branch = 'true'
        label = 'YES'
      }
    } else if (sourceNode?.kind === 'approval') {
      const hasApproved = existingOutEdges.some(e => e.branch === 'approved')
      if (!hasApproved) {
        branch = 'approved'
        label = 'Aprovado'
      } else {
        branch = 'rejected'
        label = 'Rejeitado'
      }
    }

    const newEdge: WorkflowEdge = {
      id: `we_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      sourceNodeId: fromId,
      targetNodeId: toId,
      branch,
      label
    }

    const updated: WorkflowDefinition = {
      ...activeWorkflow,
      edges: [...edges, newEdge],
      updatedAt: Date.now()
    }
    onSaveWorkflow(updated)
    setHasUnpublishedChanges(true)
  }

  // Atualizar nó individualmente
  const handleUpdateNodeById = (nodeId: string, patch: Partial<WorkflowNode>) => {
    const updated: WorkflowDefinition = {
      ...activeWorkflow,
      nodes: (activeWorkflow.nodes || []).map(n => (n.id === nodeId ? { ...n, ...patch } : n)),
      updatedAt: Date.now()
    }
    onSaveWorkflow(updated)
    setHasUnpublishedChanges(true)
  }

  // Publicar alterações
  const handlePublishChanges = () => {
    const updated: WorkflowDefinition = {
      ...activeWorkflow,
      publishedVersion: (activeWorkflow.publishedVersion || 1) + 1,
      status: 'published',
      updatedAt: Date.now()
    }
    onSaveWorkflow(updated)
    lastSavedVersionRef.current = JSON.stringify(updated)
    setHasUnpublishedChanges(false)
  }

  // Descartar alterações (recarregar estado original)
  const handleDiscardChanges = () => {
    try {
      const original = JSON.parse(lastSavedVersionRef.current) as WorkflowDefinition
      onSaveWorkflow(original)
      setHasUnpublishedChanges(false)
    } catch {}
  }

  // Duplicar fluxo
  const handleDuplicateWorkflow = (sourceWf: WorkflowDefinition) => {
    const copy: WorkflowDefinition = {
      ...JSON.parse(JSON.stringify(sourceWf)),
      id: `wf-${Date.now()}`,
      name: `${sourceWf.name} (Cópia)`,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    onSaveWorkflow(copy)
    onSelectWorkflow(copy.id)
  }

  // Criar novo fluxo
  const handleCreateNewWorkflow = () => {
    const newWf: WorkflowDefinition = {
      id: `wf-${Date.now()}`,
      version: 1,
      publishedVersion: 1,
      status: 'published',
      name: `Novo Fluxo ${workflows.length + 1}`,
      description: 'Defina etapas e configure automações integradas.',
      nodes: [
        {
          id: `wn_in_${Date.now()}`,
          kind: 'input',
          label: 'Gatilho Inicial',
          position: { x: 380, y: 80 },
          config: { triggerType: 'manual', content: '' }
        }
      ],
      edges: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    onSaveWorkflow(newWf)
    onSelectWorkflow(newWf.id)
  }

  // Testar etapa isolada
  const handleTestSingleNode = async (nodeId: string) => {
    const target = (activeWorkflow.nodes || []).find(n => n.id === nodeId)
    if (!target) return
    setExecutingNodeId(nodeId)
    try {
      const result = await executeWorkflowSingleNode({
        node: target,
        allAgents: agents,
        allNotes: notes,
        allProjects,
        workflow: activeWorkflow
      })
      handleUpdateNodeById(nodeId, {
        config: {
          ...(target.config || {}),
          lastOutput: result.output,
          lastExecutedAt: Date.now()
        }
      })
    } catch (err: any) {
      handleUpdateNodeById(nodeId, {
        config: {
          ...(target.config || {}),
          lastOutput: `Erro ao testar etapa: ${err.message || 'Falha inesperada'}`,
          lastExecutedAt: Date.now()
        }
      })
    } finally {
      setExecutingNodeId(null)
    }
  }

  // Lista de nós ordenada para a visão
  const safeNodes = activeWorkflow.nodes || []
  const safeEdges = activeWorkflow.edges || []

  // Itens para o menu de adicionar nós
  const ADD_NODE_CATEGORIES = [
    {
      group: 'Gatilhos & Entradas',
      items: [
        { kind: 'input' as WorkflowNodeKind, label: 'Gatilho Inicial', desc: 'Manual, Agendamento ou Evento' },
        { kind: 'read_note' as WorkflowNodeKind, label: 'Prompt / Nota', desc: 'Lê contexto do cofre' },
        { kind: 'sticky_note' as WorkflowNodeKind, label: 'Nota Adesiva', desc: 'Anotação livre no quadro' },
        { kind: 'text_block' as WorkflowNodeKind, label: 'Tarja de Título', desc: 'Separador de seções' }
      ]
    },
    {
      group: 'Processamento & IA',
      items: [
        { kind: 'run_agent' as WorkflowNodeKind, label: 'Especialista', desc: 'Agente especialista da equipe' },
        { kind: 'llm' as WorkflowNodeKind, label: 'Modelo IA', desc: 'Prompt e raciocínio direto' },
        { kind: 'create_task' as WorkflowNodeKind, label: 'Criar Tarefas', desc: 'Gera itens no quadro de tarefas' }
      ]
    },
    {
      group: 'Lógica & Saída',
      items: [
        { kind: 'condition' as WorkflowNodeKind, label: 'If / else', desc: 'Bifurcação condicional NO / YES' },
        { kind: 'approval' as WorkflowNodeKind, label: 'Revisão Humana', desc: 'Pausa para validação' },
        { kind: 'deliverable' as WorkflowNodeKind, label: 'Gravar no Cofre', desc: 'Gera nota final no cofre' },
        { kind: 'finish' as WorkflowNodeKind, label: 'Concluir Fluxo', desc: 'Marcação de conclusão' }
      ]
    }
  ]

  return (
    <div className="flex-1 w-full h-full flex flex-col bg-[#0b0b0e] text-zinc-100 overflow-hidden select-none relative font-sans">
      {/* ======================================================================== */}
      {/* 1. TOP BAR: TABS [Editor | Runs] + AÇÕES DE PUBLICAÇÃO & EXECUÇÃO         */}
      {/* ======================================================================== */}
      <header className="h-12 border-b border-zinc-800/80 bg-[#101014] px-4 flex items-center justify-between z-30 shrink-0">
        {/* Esquerda: Seletor de Abas (Editor | Runs) + Nome do Fluxo */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => setIsFlowSidebarOpen(v => !v)}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80 transition-colors cursor-pointer shrink-0"
            title="Listar fluxos de trabalho"
          >
            <PanelLeft className="w-4 h-4" />
          </button>

          {/* Abas Estilo Topo da Referência */}
          <div className="flex items-center p-0.5 rounded-xl bg-zinc-900 border border-zinc-800">
            <button
              type="button"
              onClick={() => setActiveTab('editor')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                activeTab === 'editor'
                  ? 'bg-zinc-800 text-zinc-100 shadow-xs'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Editor</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('runs')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                activeTab === 'runs'
                  ? 'bg-zinc-800 text-zinc-100 shadow-xs'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Play className="w-3.5 h-3.5" />
              <span>Runs</span>
              {runForThisWorkflow && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse ml-0.5" />
              )}
            </button>
          </div>

          <div className="h-4 w-px bg-zinc-800 mx-1 shrink-0" />

          {/* Nome do Fluxo ativo */}
          <div className="flex items-center gap-2 truncate">
            <span className="text-xs font-semibold text-zinc-200 truncate max-w-[200px] md:max-w-[320px]">
              {activeWorkflow.name}
            </span>
            <span className="text-[10px] px-1.5 py-0.2 rounded border border-zinc-700/60 bg-zinc-800/60 text-zinc-400 font-mono">
              v{activeWorkflow.publishedVersion || 1}
            </span>
          </div>
        </div>

        {/* Direita: Controles de Zoom, Auto-Layout e Painel Lateral */}
        <div className="flex items-center gap-2">
          {activeTab === 'editor' && (
            <>
              {/* Botão de Organização Vertical Automática */}
              <button
                type="button"
                onClick={handleAutoLayoutVertical}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-800 text-xs font-medium transition-colors cursor-pointer"
                title="Reorganizar nós em colunas verticais perfeitamente alinhadas"
              >
                <Layers className="w-3.5 h-3.5 text-[var(--accent)]" />
                <span className="hidden sm:inline">Organizar Vertical</span>
              </button>

              {/* Botão + Novo Bloco */}
              <button
                type="button"
                onClick={() => {
                  setIsAddMenuOpen(v => !v)
                }}
                className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-xs font-medium transition-colors cursor-pointer border border-zinc-700/60"
              >
                <Plus className="w-3.5 h-3.5 text-[var(--accent)]" />
                <span>Adicionar</span>
              </button>

              <div className="h-4 w-px bg-zinc-800 mx-1 shrink-0" />

              {/* Controles de Zoom */}
              <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-xl p-0.5">
                <button
                  type="button"
                  onClick={() => setZoom(z => Math.max(0.4, Number((z - 0.1).toFixed(2))))}
                  className="p-1 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors cursor-pointer"
                  title="Diminuir zoom"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={handleFitView}
                  className="px-2 text-[11px] font-mono text-zinc-300 hover:text-white cursor-pointer"
                  title="Centralizar e ajustar tela"
                >
                  {Math.round(zoom * 100)}%
                </button>
                <button
                  type="button"
                  onClick={() => setZoom(z => Math.min(1.8, Number((z + 0.1).toFixed(2))))}
                  className="p-1 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors cursor-pointer"
                  title="Aumentar zoom"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
              </div>
            </>
          )}

          {/* Alternar Painel de Detalhes Direito */}
          <button
            type="button"
            onClick={() => setIsRightSidebarOpen(v => !v)}
            className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
              isRightSidebarOpen
                ? 'bg-zinc-800 text-zinc-100 border-zinc-700'
                : 'text-zinc-400 hover:text-zinc-100 bg-zinc-900 border-zinc-800'
            }`}
            title="Alternar painel de detalhes lateral"
          >
            <Sliders className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* ======================================================================== */}
      {/* 2. NOTIFICATION / STATUS BAR (Idêntico ao print de referência!)            */}
      {/* ======================================================================== */}
      {activeTab === 'editor' && (
        <div className="bg-[#121217] border-b border-zinc-800/80 px-4 py-2 flex items-center justify-between text-xs shrink-0 z-20">
          <div className="flex items-center gap-2.5 text-zinc-300">
            <span className="w-5 h-5 rounded-full bg-blue-500/15 text-blue-400 flex items-center justify-center shrink-0">
              <Info className="w-3 h-3" />
            </span>
            <span className="font-medium text-[11.5px]">
              {hasUnpublishedChanges
                ? 'Este fluxo possui alterações não publicadas'
                : 'Todas as alterações foram salvas e publicadas'}
            </span>
            {!validation.valid && (
              <span className="text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-md flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                <span>{validation.errors[0]}</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {hasUnpublishedChanges && (
              <button
                type="button"
                onClick={handleDiscardChanges}
                className="px-3 py-1 rounded-xl border border-zinc-800 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 font-medium text-xs transition-colors cursor-pointer"
              >
                Descartar alterações
              </button>
            )}

            <button
              type="button"
              onClick={handlePublishChanges}
              disabled={!hasUnpublishedChanges}
              className={`px-3.5 py-1 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                hasUnpublishedChanges
                  ? 'bg-zinc-100 text-zinc-950 hover:bg-white shadow-xs'
                  : 'bg-zinc-800/60 text-zinc-500 cursor-not-allowed border border-zinc-800'
              }`}
            >
              Publicar alterações
            </button>

            <button
              type="button"
              disabled={isExecuting || !validation.valid}
              onClick={() => onRunWorkflow(activeWorkflow, false, '')}
              className="flex items-center gap-1.5 px-3.5 py-1 rounded-xl bg-[var(--accent)] hover:brightness-110 disabled:opacity-40 text-zinc-950 text-xs font-semibold transition-all cursor-pointer shadow-xs ml-1"
            >
              {isExecuting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5 fill-current" />}
              <span>Executar</span>
            </button>
          </div>
        </div>
      )}

      {/* ======================================================================== */}
      {/* 3. CORPO CENTRAL: SIDEBAR DE FLUXOS + CANVAS + PAINEL DE DETALHES        */}
      {/* ======================================================================== */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* SIDEBAR ESQUERDA: LISTAGEM DE FLUXOS (Gaveta colapsável) */}
        {isFlowSidebarOpen && (
          <aside className="w-64 border-r border-zinc-800/80 bg-[#101014] flex flex-col shrink-0 z-20">
            <div className="p-3 border-b border-zinc-800/70 flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-200">Fluxos Salvos</span>
              <button
                type="button"
                onClick={handleCreateNewWorkflow}
                className="p-1 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 cursor-pointer"
                title="Novo fluxo"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            <div className="p-2 border-b border-zinc-800/60">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Buscar fluxos..."
                  value={flowSearchQuery}
                  onChange={e => setFlowSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-2 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-700"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-chat-scrollbar">
              {workflows
                .filter(w => (w.name || '').toLowerCase().includes(flowSearchQuery.toLowerCase()))
                .map(wf => {
                  const isSel = wf.id === activeWorkflow.id
                  return (
                    <div
                      key={wf.id}
                      onClick={() => onSelectWorkflow(wf.id)}
                      className={`group p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-2 ${
                        isSel
                          ? 'bg-zinc-800/90 border-zinc-600 text-zinc-100 shadow-xs'
                          : 'bg-transparent border-transparent hover:bg-zinc-850/60 text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-medium truncate">{wf.name}</div>
                        <div className="text-[10px] text-zinc-500 mt-0.5">
                          {(wf.nodes || []).length} blocos • v{wf.publishedVersion || 1}
                        </div>
                      </div>

                      <button
                          type="button"
                          onClick={e => {
                            e.stopPropagation()
                            handleDuplicateWorkflow(wf)
                          }}
                          className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition-opacity cursor-pointer"
                          title="Duplicar fluxo"
                        >
                          <CopyPlus className="w-3 h-3" />
                        </button>
                        {workflows.length > 1 && (
                        <button
                          type="button"
                          onClick={e => {
                            e.stopPropagation()
                            if (window.confirm(`Excluir o fluxo "${wf.name}"?`)) {
                              onDeleteWorkflow(wf.id)
                            }
                          }}
                          className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-zinc-700 text-zinc-400 hover:text-rose-400 transition-opacity cursor-pointer"
                          title="Excluir fluxo"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  )
                })}
            </div>
          </aside>
        )}

        {/* ======================================================================== */}
        {/* ABA 1: O CANVAS VERTICAL DO EDITOR                                       */}
        {/* ======================================================================== */}
        {activeTab === 'editor' && (
          <div
            ref={viewportRef}
            className="flex-1 h-full relative overflow-hidden cursor-default"
            style={{
              backgroundImage: 'radial-gradient(circle, #222228 1px, transparent 1px)',
              backgroundSize: '24px 24px',
              backgroundColor: '#0c0c0f'
            }}
            onPointerDown={e => {
              if (e.target === viewportRef.current || (e.target as HTMLElement).tagName === 'svg') {
                setSelectedNodeId(null)
                setSelectedEdgeId(null)
                setIsPanning(true)
                panStartRef.current = {
                  x: e.clientX,
                  y: e.clientY,
                  panX: pan.x,
                  panY: pan.y
                }
              }
            }}
            onPointerMove={e => {
              if (isPanning) {
                const dx = e.clientX - panStartRef.current.x
                const dy = e.clientY - panStartRef.current.y
                setPan({
                  x: panStartRef.current.panX + dx,
                  y: panStartRef.current.panY + dy
                })
              } else if (draggingNodeId) {
                const rect = viewportRef.current?.getBoundingClientRect() || { left: 0, top: 0 }
                const rawX = (e.clientX - rect.left - pan.x) / zoom - dragOffsetRef.current.x
                const rawY = (e.clientY - rect.top - pan.y) / zoom - dragOffsetRef.current.y
                const nextX = snapDiagramCoord(rawX)
                const nextY = snapDiagramCoord(rawY)

                const updated: WorkflowDefinition = {
                  ...activeWorkflow,
                  nodes: (activeWorkflow.nodes || []).map(n =>
                    n.id === draggingNodeId ? { ...n, position: { x: nextX, y: nextY } } : n
                  )
                }
                onSaveWorkflow(updated)
                setHasUnpublishedChanges(true)
              } else if (wireDraft) {
                const world = screenToWorld(e.clientX, e.clientY)
                let hoveredId: string | null = null

                // Detectar se o mouse está sobre a porta de entrada superior de outro nó
                for (const n of safeNodes) {
                  if (n.id === wireDraft.fromNodeId || n.kind === 'input') continue
                  const inPort = getNodeTopPort(n)
                  const dist = Math.hypot(world.x - inPort.x, world.y - inPort.y)
                  if (dist < 40) {
                    hoveredId = n.id
                    break
                  }
                }

                setWireDraft({
                  ...wireDraft,
                  toWorld: hoveredId ? getNodeTopPort(safeNodes.find(n => n.id === hoveredId)!) : world,
                  hoveredTargetId: hoveredId
                })
              }
            }}
            onPointerUp={() => {
              if (isPanning) setIsPanning(false)
              if (draggingNodeId) setDraggingNodeId(null)
              if (wireDraft) {
                if (wireDraft.hoveredTargetId) {
                  completeWireConnection(wireDraft.fromNodeId, wireDraft.hoveredTargetId)
                }
                setWireDraft(null)
              }
            }}
          >
            {/* CAMADA DE TRANSFORMAÇÃO ZOOM & PAN */}
            <div
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                transformOrigin: '0 0'
              }}
              className="absolute inset-0 pointer-events-none"
            >
              {/* ================================================================== */}
              {/* CAMADA SVG DAS ARESTAS VERTICAIS                                   */}
              {/* ================================================================== */}
              <svg className="overflow-visible w-full h-full pointer-events-none">
                <defs>
                  <filter id="wire-glow" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur stdDeviation="2" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                  </filter>
                </defs>

                {safeEdges.map(edge => {
                  const src = safeNodes.find(n => n.id === edge.sourceNodeId)
                  const dst = safeNodes.find(n => n.id === edge.targetNodeId)
                  if (!src || !dst) return null

                  // Porta de saída na base central de src -> Porta de entrada no topo central de dst
                  const fromPt = getNodeBottomPort(src)
                  const toPt = getNodeTopPort(dst)
                  const pathD = diagramVerticalEdgePath(fromPt, toPt)
                  const mid = diagramEdgeMidpoint(fromPt, toPt)
                  const arrowPts = diagramVerticalEdgeArrow(toPt)
                  const isSelected = selectedEdgeId === edge.id

                  const isFalseBranch = edge.branch === 'false' || edge.branch === 'rejected'
                  const isTrueBranch = edge.branch === 'true' || edge.branch === 'approved'

                  const strokeColor = isSelected
                    ? '#ffffff'
                    : isFalseBranch
                    ? '#ef4444'
                    : isTrueBranch
                    ? '#10b981'
                    : '#52525b'

                  return (
                    <g
                      key={edge.id}
                      onClick={e => {
                        e.stopPropagation()
                        setSelectedEdgeId(edge.id)
                        setSelectedNodeId(null)
                      }}
                      className="cursor-pointer group pointer-events-auto"
                    >
                      {/* Área expandida invisível para facilitar o clique */}
                      <path d={pathD} fill="none" stroke="transparent" strokeWidth={16} />

                      {/* Linha visível do cabo vertical */}
                      <path
                        d={pathD}
                        fill="none"
                        stroke={strokeColor}
                        strokeWidth={isSelected ? 2.5 : 1.75}
                      />

                      {/* Ponta de seta apontando para a porta de entrada */}
                      <polygon points={arrowPts} fill={strokeColor} />

                      {/* BADGES NO / YES EXATOS DA REFERÊNCIA */}
                      {(isFalseBranch || isTrueBranch || edge.label) && (
                        <g transform={`translate(${mid.x}, ${mid.y})`}>
                          <rect
                            x={-18}
                            y={-9}
                            width={36}
                            height={18}
                            rx={9}
                            fill={isFalseBranch ? '#450a0a' : isTrueBranch ? '#064e3b' : '#18181b'}
                            stroke={isFalseBranch ? '#ef4444' : isTrueBranch ? '#10b981' : '#52525b'}
                            strokeWidth={1}
                          />
                          <text
                            textAnchor="middle"
                            dominantBaseline="central"
                            fill={isFalseBranch ? '#fca5a5' : isTrueBranch ? '#6ee7b7' : '#d4d4d8'}
                            fontSize={9}
                            fontWeight={700}
                          >
                            {isFalseBranch ? 'NO' : isTrueBranch ? 'YES' : edge.label}
                          </text>
                        </g>
                      )}
                    </g>
                  )
                })}

                {/* Cabo sendo puxado interativamente */}
                {wireDraft && (() => {
                  const src = safeNodes.find(n => n.id === wireDraft.fromNodeId)
                  if (!src) return null
                  const fromPt = getNodeBottomPort(src)
                  const pathD = diagramVerticalEdgePath(fromPt, wireDraft.toWorld)
                  return (
                    <g>
                      <path
                        d={pathD}
                        fill="none"
                        stroke="#38bdf8"
                        strokeWidth={2}
                        strokeDasharray="4 4"
                      />
                      <circle
                        cx={wireDraft.toWorld.x}
                        cy={wireDraft.toWorld.y}
                        r={4.5}
                        fill="#38bdf8"
                      />
                    </g>
                  )
                })()}
              </svg>

              {/* ================================================================== */}
              {/* CARDS DOS NÓS: ANATOMIA IDÊNTICA À IMAGEM DE REFERÊNCIA           */}
              {/* ================================================================== */}
              {safeNodes.map(node => {
                const isSelected = selectedNodeId === node.id
                const isDropTarget = wireDraft?.hoveredTargetId === node.id
                const meta = NODE_META[node.kind] || {
                  label: 'Etapa',
                  category: 'ACTION',
                  subcategory: 'CUSTOM',
                  color: '#38bdf8',
                  bgLight: 'rgba(56, 189, 248, 0.12)',
                  icon: Bot,
                  defaultDesc: 'Etapa do fluxo'
                }
                const IconComp = meta.icon

                const px = node.position?.x ?? 380
                const py = node.position?.y ?? 80

                // Descrição contextual dinâmica do card
                let subtitleText = node.config?.description || meta.defaultDesc
                if (node.kind === 'input') {
                  subtitleText =
                    node.config?.triggerType === 'schedule'
                      ? `Agendado às ${node.config?.scheduleTime || '09:00'}`
                      : node.config?.triggerType === 'task_event'
                      ? 'Ao alterar ou criar tarefa'
                      : 'Executado sob demanda pelo usuário'
                } else if (node.kind === 'condition') {
                  subtitleText = node.config?.expectedValue
                    ? `Regra: ${node.config.expectedValue}`
                    : 'Avaliação de regra e roteamento'
                } else if (node.kind === 'run_agent') {
                  const ag = agents.find(a => a.id === node.config?.agentId)
                  subtitleText = ag ? `Agente: ${ag.name}` : 'Especialista atribuído'
                } else if (node.kind === 'deliverable') {
                  subtitleText = `Salvar na pasta "${node.config?.targetFolder || 'Propostas'}"`
                }

                return (
                  <div
                    key={node.id}
                    style={{
                      left: px,
                      top: py,
                      width: VERTICAL_CARD_WIDTH
                    }}
                    onPointerDown={e => {
                      e.stopPropagation()
                      setSelectedNodeId(node.id)
                      setSelectedEdgeId(null)
                      setDraggingNodeId(node.id)
                      dragOffsetRef.current = {
                        x: (e.clientX - (viewportRef.current?.getBoundingClientRect().left || 0) - pan.x) / zoom - px,
                        y: (e.clientY - (viewportRef.current?.getBoundingClientRect().top || 0) - pan.y) / zoom - py
                      }
                    }}
                    className={`absolute pointer-events-auto rounded-2xl p-3.5 transition-all shadow-xl group border ${
                      isSelected
                        ? 'bg-[#18181d] border-zinc-500 ring-1 ring-zinc-400/40 shadow-2xl'
                        : isDropTarget
                        ? 'bg-[#18181d] border-emerald-400 ring-2 ring-emerald-400/40'
                        : 'bg-[#131317] border-zinc-800/90 hover:border-zinc-700'
                    }`}
                  >
                    {/* PORTA DE ENTRADA SUPERIOR (Topo Central) */}
                    {node.kind !== 'input' && (
                      <div
                        className={`absolute left-1/2 -top-2.5 -translate-x-1/2 w-4 h-4 rounded-full border flex items-center justify-center transition-all z-20 ${
                          isDropTarget
                            ? 'bg-emerald-500 border-white scale-125 ring-4 ring-emerald-500/40'
                            : 'bg-[#131317] border-zinc-600 group-hover:border-zinc-400'
                        }`}
                        title="Porta de entrada (Conecte o bloco anterior aqui)"
                      >
                        <div className="w-1.5 h-1.5 rounded-full bg-zinc-400" />
                      </div>
                    )}

                    {/* PORTA DE SAÍDA INFERIOR (Base Central) */}
                    {node.kind !== 'finish' && (
                      <button
                        type="button"
                        onPointerDown={e => {
                          e.stopPropagation()
                          const outPort = getNodeBottomPort(node)
                          setWireDraft({
                            fromNodeId: node.id,
                            toWorld: outPort,
                            hoveredTargetId: null
                          })
                        }}
                        className="absolute left-1/2 -bottom-2.5 -translate-x-1/2 w-4 h-4 rounded-full bg-[#131317] border-2 border-blue-500 hover:border-blue-400 hover:scale-125 transition-all flex items-center justify-center cursor-crosshair z-20 shadow-md group/port"
                        title="Puxe para conectar à próxima etapa"
                      >
                        <div className="w-1.5 h-1.5 rounded-full bg-blue-400 group-hover/port:bg-white" />
                      </button>
                    )}

                    {/* CABEÇALHO DO CARD: CATEGORIA (Esquerda) | SUBCATEGORIA (Direita) */}
                    <div className="flex items-center justify-between text-[9.5px] font-mono tracking-wider uppercase text-zinc-500 pb-1.5 mb-1.5 border-b border-zinc-800/50">
                      <span>{meta.category}</span>
                      <span>{meta.subcategory}</span>
                    </div>

                    {/* CORPO DO CARD: ÍCONE + TÍTULO + SUBTÍTULO */}
                    <div className="flex items-start gap-3">
                      <div
                        className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border mt-0.5"
                        style={{
                          backgroundColor: meta.bgLight,
                          borderColor: `${meta.color}40`,
                          color: meta.color
                        }}
                      >
                        <IconComp className="w-4 h-4 stroke-[2]" />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-zinc-100 truncate">
                            {node.label || meta.label}
                          </span>
                          <button
                            type="button"
                            onClick={e => {
                              e.stopPropagation()
                              setSelectedNodeId(node.id)
                              setIsRightSidebarOpen(true)
                            }}
                            className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-200 transition-opacity cursor-pointer text-[10px]"
                            title="Editar propriedades"
                          >
                            •••
                          </button>
                        </div>
                        <div className="text-[11px] text-zinc-400 line-clamp-2 mt-0.5 leading-snug">
                          {subtitleText}
                        </div>
                      </div>
                    </div>

                    {/* EXIBIÇÃO DE TESTE MINIMALISTA (se houver resultado) */}
                    <ResultField
                      output={node.config?.lastOutput}
                      isRunning={executingNodeId === node.id}
                      lastExecutedAt={node.config?.lastExecutedAt}
                      onClear={() =>
                        handleUpdateNodeById(node.id, {
                          config: { ...node.config, lastOutput: undefined, lastExecutedAt: undefined }
                        })
                      }
                    />
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ======================================================================== */}
        {/* ABA 2: VISUALIZAÇÃO DE EXECUÇÕES (Runs Tab)                             */}
        {/* ======================================================================== */}
        {activeTab === 'runs' && (
          <div className="flex-1 h-full overflow-y-auto p-6 bg-[#0c0c0f] custom-chat-scrollbar">
            <div className="max-w-4xl mx-auto space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-zinc-800/70">
                <div>
                  <h2 className="text-sm font-semibold text-zinc-100">Histórico de Execuções</h2>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    Registros detalhados de execuções automatizadas e testes manuais do fluxo.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={isExecuting}
                  onClick={() => onRunWorkflow(activeWorkflow, false, '')}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[var(--accent)] hover:brightness-110 text-zinc-950 font-semibold text-xs cursor-pointer shadow-sm transition-all"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Nova Execução</span>
                </button>
              </div>

              {runForThisWorkflow ? (
                <div className="space-y-3">
                  <div className="p-4 rounded-2xl bg-[#131317] border border-zinc-800/80 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            runForThisWorkflow.status === 'completed'
                              ? 'bg-emerald-400'
                              : runForThisWorkflow.status === 'failed'
                              ? 'bg-rose-400'
                              : 'bg-amber-400 animate-pulse'
                          }`}
                        />
                        <span className="text-xs font-semibold text-zinc-200">
                          Execução #{runForThisWorkflow.id.substring(0, 8)}
                        </span>
                        <span className="text-[10px] text-zinc-500 font-mono">
                          {new Date(runForThisWorkflow.startedAt).toLocaleString('pt-BR')}
                        </span>
                      </div>
                      <span className="text-xs font-mono text-zinc-400">
                        {runForThisWorkflow.status}
                      </span>
                    </div>

                    {/* Etapas executadas */}
                    <div className="space-y-1.5 pt-2 border-t border-zinc-800/60">
                      {(runForThisWorkflow.workflowNodeStates || []).map((st, idx) => {
                        const n = safeNodes.find(node => node.id === st.nodeId)
                        return (
                          <div
                            key={st.nodeId || idx}
                            className="flex items-center justify-between p-2 rounded-xl bg-zinc-900/60 border border-zinc-800/50 text-xs"
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-zinc-500 font-mono">#{idx + 1}</span>
                              <span className="font-medium text-zinc-200">{n?.label || 'Etapa'}</span>
                            </div>
                            <span
                              className={`text-[10px] font-medium px-2 py-0.5 rounded ${
                                st.status === 'completed'
                                  ? 'text-emerald-400 bg-emerald-950/40'
                                  : st.status === 'failed'
                                  ? 'text-rose-400 bg-rose-950/40'
                                  : 'text-amber-400 bg-amber-950/40'
                              }`}
                            >
                              {st.status}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-8 text-center text-xs text-zinc-500 rounded-2xl border border-dashed border-zinc-800/70">
                  Nenhuma execução recente para este fluxo. Clique em "Executar" para iniciar.
                </div>
              )}
            </div>
          </div>
        )}

        {/* ======================================================================== */}
        {/* PAINEL LATERAL DIREITO: DETAILS & CHECKLIST (Estilo da Referência)        */}
        {/* ======================================================================== */}
        {isRightSidebarOpen && (
          <aside className="w-80 border-l border-zinc-800/80 bg-[#101014] flex flex-col shrink-0 z-20">
            {/* Header com Tabs: Details | Checklist */}
            <div className="h-10 border-b border-zinc-800/70 px-3 flex items-center justify-between">
              <div className="flex items-center gap-3 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setRightPanelTab('details')}
                  className={`py-2 transition-colors cursor-pointer border-b-2 ${
                    rightPanelTab === 'details'
                      ? 'border-[var(--accent)] text-zinc-100'
                      : 'border-transparent text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  Details
                </button>
                <button
                  type="button"
                  onClick={() => setRightPanelTab('checklist')}
                  className={`py-2 transition-colors cursor-pointer border-b-2 ${
                    rightPanelTab === 'checklist'
                      ? 'border-[var(--accent)] text-zinc-100'
                      : 'border-transparent text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  Checklist
                </button>
              </div>

              <button
                type="button"
                onClick={() => setIsRightSidebarOpen(false)}
                className="p-1 rounded text-zinc-500 hover:text-zinc-200 cursor-pointer"
                title="Fechar painel"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* CONTEÚDO DO PAINEL LATERAL */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-chat-scrollbar text-xs">
              {rightPanelTab === 'details' ? (
                selectedNode ? (
                  /* Propriedades do Nó Selecionado */
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 pb-2 border-b border-zinc-800/60">
                      <div className="w-7 h-7 rounded-lg bg-zinc-800 flex items-center justify-center text-zinc-200">
                        {React.createElement(NODE_META[selectedNode.kind]?.icon || Bot, { className: 'w-4 h-4' })}
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="font-semibold text-zinc-200 block truncate">
                          {selectedNode.label || 'Etapa'}
                        </span>
                        <span className="text-[10px] text-zinc-500 uppercase font-mono">
                          {NODE_META[selectedNode.kind]?.category || 'NÓ'}
                        </span>
                      </div>
                    </div>

                    {/* Nome do Bloco */}
                    <div>
                      <label className="block text-[11px] text-zinc-400 font-medium mb-1">
                        Rótulo do Bloco
                      </label>
                      <input
                        type="text"
                        value={selectedNode.label || ''}
                        onChange={e => handleUpdateNodeById(selectedNode.id, { label: e.target.value })}
                        className="w-full px-2.5 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 focus:outline-none focus:border-zinc-700"
                      />
                    </div>

                    {/* Campos específicos por tipo de nó */}
                    {selectedNode.kind === 'input' && (
                      <div className="space-y-3">
                        <div>
                          <label className="block text-[11px] text-zinc-400 font-medium mb-1">
                            Tipo de Gatilho
                          </label>
                          <CustomSelect
                            value={selectedNode.config?.triggerType || 'manual'}
                            onChange={v =>
                              handleUpdateNodeById(selectedNode.id, {
                                config: { ...(selectedNode.config || {}), triggerType: v as any }
                              })
                            }
                            options={[
                              { value: 'manual', label: 'Manual (Sob Demanda)' },
                              { value: 'schedule', label: 'Agendamento Programado' },
                              { value: 'task_event', label: 'Evento de Tarefa' },
                              { value: 'note_event', label: 'Evento de Nota' }
                            ]}
                            className="w-full"
                          />
                        </div>

                        {selectedNode.config?.triggerType === 'schedule' && (
                          <div>
                            <label className="block text-[11px] text-zinc-400 font-medium mb-1">
                              Horário
                            </label>
                            <CustomTimePicker
                              value={selectedNode.config?.scheduleTime || '09:00'}
                              onChange={v =>
                                handleUpdateNodeById(selectedNode.id, {
                                  config: { ...(selectedNode.config || {}), scheduleTime: v }
                                })
                              }
                            />
                          </div>
                        )}
                      </div>
                    )}

                    {selectedNode.kind === 'run_agent' && (
                      <div className="space-y-3">
                        <div>
                          <label className="block text-[11px] text-zinc-400 font-medium mb-1">
                            Agente Atribuído
                          </label>
                          <CustomSelect
                            value={selectedNode.config?.agentId || agents[0]?.id || ''}
                            onChange={v =>
                              handleUpdateNodeById(selectedNode.id, {
                                config: { ...(selectedNode.config || {}), agentId: v }
                              })
                            }
                            options={agents.map(a => ({ value: a.id, label: a.name }))}
                            className="w-full"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] text-zinc-400 font-medium mb-1">
                            Instrução Específica para a Etapa
                          </label>
                          <textarea
                            rows={3}
                            value={selectedNode.config?.promptTemplate || ''}
                            onChange={e =>
                              handleUpdateNodeById(selectedNode.id, {
                                config: { ...(selectedNode.config || {}), promptTemplate: e.target.value }
                              })
                            }
                            placeholder="Descreva o que o especialista deve fazer com as informações recebidas..."
                            className="w-full px-2.5 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 focus:outline-none focus:border-zinc-700"
                          />
                        </div>
                      </div>
                    )}

                    {selectedNode.kind === 'condition' && (
                      <div className="space-y-3">
                        <div>
                          <label className="block text-[11px] text-zinc-400 font-medium mb-1">
                            Regra de Avaliação
                          </label>
                          <CustomSelect
                            value={selectedNode.config?.conditionType || 'contains'}
                            onChange={v =>
                              handleUpdateNodeById(selectedNode.id, {
                                config: { ...(selectedNode.config || {}), conditionType: v as any }
                              })
                            }
                            options={[
                              { value: 'contains', label: 'Contém termo/palavra' },
                              { value: 'no_missing_fields', label: 'Sem pendências ou campos vazios' },
                              { value: 'ai_evaluation', label: 'Critério avaliado por IA' }
                            ]}
                            className="w-full"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] text-zinc-400 font-medium mb-1">
                            Valor / Condição Esperada
                          </label>
                          <input
                            type="text"
                            value={selectedNode.config?.expectedValue || ''}
                            onChange={e =>
                              handleUpdateNodeById(selectedNode.id, {
                                config: { ...(selectedNode.config || {}), expectedValue: e.target.value }
                              })
                            }
                            placeholder="ex: aprovado, VIP, prioritário"
                            className="w-full px-2.5 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 focus:outline-none focus:border-zinc-700"
                          />
                        </div>
                      </div>
                    )}

                    {/* Botão de Testar Etapa */}
                    <div className="pt-2 border-t border-zinc-800/60">
                      <button
                        type="button"
                        disabled={executingNodeId === selectedNode.id}
                        onClick={() => handleTestSingleNode(selectedNode.id)}
                        className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium text-xs transition-colors cursor-pointer"
                      >
                        {executingNodeId === selectedNode.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <FlaskConical className="w-3.5 h-3.5 text-amber-400" />
                        )}
                        <span>Testar Etapa Isolada</span>
                      </button>
                    </div>

                    {/* Botão de Remover Bloco */}
                    <button
                      type="button"
                      onClick={() => handleRemoveNode(selectedNode.id)}
                      className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl border border-rose-900/40 text-rose-400 hover:bg-rose-950/20 font-medium text-xs transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Excluir este bloco</span>
                    </button>
                  </div>
                ) : (
                  /* Detalhes Gerais do Workflow (Estilo Print) */
                  <div className="space-y-4">
                    <div>
                      <label className="block text-[11px] text-zinc-400 font-medium mb-1">
                        Nome do Fluxo
                      </label>
                      <input
                        type="text"
                        value={activeWorkflow.name || ''}
                        onChange={e => {
                          onSaveWorkflow({ ...activeWorkflow, name: e.target.value, updatedAt: Date.now() })
                          setHasUnpublishedChanges(true)
                        }}
                        className="w-full px-2.5 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 focus:outline-none focus:border-zinc-700 font-semibold"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] text-zinc-400 font-medium mb-1">
                        Descrição & Objetivo
                      </label>
                      <textarea
                        rows={4}
                        value={activeWorkflow.description || ''}
                        onChange={e => {
                          onSaveWorkflow({ ...activeWorkflow, description: e.target.value, updatedAt: Date.now() })
                          setHasUnpublishedChanges(true)
                        }}
                        placeholder="Descreva o propósito deste fluxo automatizado..."
                        className="w-full px-2.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-300 focus:outline-none focus:border-zinc-700 leading-relaxed"
                      />
                    </div>

                    <div className="pt-2 border-t border-zinc-800/60 space-y-2 text-zinc-400 text-[11px]">
                      <div className="flex items-center justify-between">
                        <span>Total de blocos:</span>
                        <span className="font-mono text-zinc-200">{safeNodes.length}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Conexões ativas:</span>
                        <span className="font-mono text-zinc-200">{safeEdges.length}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Versão atual:</span>
                        <span className="font-mono text-zinc-200">v{activeWorkflow.publishedVersion || 1}</span>
                      </div>
                    </div>
                  </div>
                )
              ) : (
                /* Aba Checklist (Estilo Print) */
                <div className="space-y-3">
                  <div className="text-[11px] text-zinc-400">
                    Verifique se todos os requisitos do fluxo estão cumpridos antes de publicar:
                  </div>

                  <div className="space-y-2">
                    <div className="p-2.5 rounded-xl bg-zinc-900/80 border border-zinc-800 flex items-start gap-2">
                      <CheckCircle2
                        className={`w-4 h-4 mt-0.5 shrink-0 ${
                          safeNodes.some(n => n.kind === 'input') ? 'text-emerald-400' : 'text-zinc-600'
                        }`}
                      />
                      <div>
                        <div className="font-medium text-zinc-200">Gatilho configurado</div>
                        <div className="text-[10px] text-zinc-500">Pelo menos um bloco de entrada.</div>
                      </div>
                    </div>

                    <div className="p-2.5 rounded-xl bg-zinc-900/80 border border-zinc-800 flex items-start gap-2">
                      <CheckCircle2
                        className={`w-4 h-4 mt-0.5 shrink-0 ${
                          validation.valid ? 'text-emerald-400' : 'text-amber-400'
                        }`}
                      />
                      <div>
                        <div className="font-medium text-zinc-200">Grafo e conexões válidas</div>
                        <div className="text-[10px] text-zinc-500">Sem loops ou blocos soltos.</div>
                      </div>
                    </div>

                    <div className="p-2.5 rounded-xl bg-zinc-900/80 border border-zinc-800 flex items-start gap-2">
                      <CheckCircle2
                        className={`w-4 h-4 mt-0.5 shrink-0 ${
                          safeNodes.some(n => n.kind === 'deliverable' || n.kind === 'finish')
                            ? 'text-emerald-400'
                            : 'text-zinc-600'
                        }`}
                      />
                      <div>
                        <div className="font-medium text-zinc-200">Saída definida</div>
                        <div className="text-[10px] text-zinc-500">Gravação em cofre ou conclusão.</div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </aside>
        )}
      </div>

      {/* ======================================================================== */}
      {/* 4. MODAL FLUTUANTE DE ADICIONAR BLOCO (Categorizado com busca)            */}
      {/* ======================================================================== */}
      {isAddMenuOpen && (
        <div
          ref={addMenuRef}
          className="absolute left-1/2 top-24 -translate-x-1/2 w-96 rounded-2xl bg-[#141418] border border-zinc-700/90 shadow-2xl p-3 z-50 select-none space-y-3"
        >
          <div className="flex items-center justify-between pb-1.5 border-b border-zinc-800">
            <span className="text-xs font-semibold text-zinc-100">Adicionar Bloco ao Fluxo</span>
            <button
              type="button"
              onClick={() => setIsAddMenuOpen(false)}
              className="text-zinc-500 hover:text-zinc-200 p-0.5 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Filtrar blocos..."
              value={addMenuSearch}
              onChange={e => setAddMenuSearch(e.target.value)}
              className="w-full pl-8 pr-2 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-700"
              autoFocus
            />
          </div>

          <div className="max-h-72 overflow-y-auto space-y-3 custom-chat-scrollbar pr-1">
            {ADD_NODE_CATEGORIES.map(cat => {
              const filtered = cat.items.filter(
                it =>
                  it.label.toLowerCase().includes(addMenuSearch.toLowerCase()) ||
                  it.desc.toLowerCase().includes(addMenuSearch.toLowerCase())
              )
              if (filtered.length === 0) return null

              return (
                <div key={cat.group} className="space-y-1">
                  <div className="text-[10px] font-mono uppercase text-zinc-500 tracking-wider px-1">
                    {cat.group}
                  </div>
                  {filtered.map(item => {
                    const meta = NODE_META[item.kind]
                    const Icon = meta.icon
                    return (
                      <button
                        key={item.kind}
                        type="button"
                        onClick={() => handleAddNode(item.kind)}
                        className="w-full p-2 rounded-xl hover:bg-zinc-800/80 border border-transparent hover:border-zinc-700/80 transition-all flex items-center gap-2.5 text-left cursor-pointer group"
                      >
                        <div
                          className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border"
                          style={{
                            backgroundColor: meta.bgLight,
                            borderColor: `${meta.color}30`,
                            color: meta.color
                          }}
                        >
                          <Icon className="w-3.5 h-3.5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-medium text-zinc-200 group-hover:text-white">
                            {item.label}
                          </div>
                          <div className="text-[10.5px] text-zinc-400 truncate">{item.desc}</div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
