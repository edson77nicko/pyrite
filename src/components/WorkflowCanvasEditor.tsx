import React, { useState, useRef, useEffect } from 'react'
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
  computeWorkflowNextRunISO,
  formatWorkflowNextRun,
  executeWorkflowSingleNode,
  type WorkflowCommitTasksFn
} from '../utils/multiAgentEngine'
import { AgentIcon } from './AgentIcon'
import {
  snapDiagramCoord,
  diagramEdgePath,
  diagramEdgeMidpoint,
  diagramEdgeArrow,
  diagramConnectionProblem,
  getNodeCardDimensions,
  getNodeInputPort,
  getNodeOutputPort
} from '../utils/openbotDiagramUtils'
import {
  GitBranch,
  Plus,
  Trash2,
  Play,
  ZoomIn,
  ZoomOut,
  Maximize2,
  X,
  Zap,
  Bot,
  Sparkles,
  MessageSquare,
  ShieldCheck,
  Send,
  Calendar,
  ChevronDown,
  ArrowLeft,
  ArrowRight,
  MousePointer,
  Hand,
  StickyNote,
  Type,
  Search,
  FileText,
  Sliders,
  Check,
  CheckCircle2,
  XCircle,
  Copy,
  Clock,
  Folder,
  ListTodo,
  Loader2,
  FlaskConical,
  AlertTriangle,
  Eraser,
  PanelLeft
} from 'lucide-react'
import { CustomSelect } from './CustomSelect'
import { CustomTimePicker } from './CustomTimePicker'
import { CustomNotePicker } from './CustomNotePicker'

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
  commitTasks?: WorkflowCommitTasksFn
}

/**
 * Campo de exibição do resultado de execução da etapa (sanfona minimalista, cópia e limpeza).
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
    <div className="mt-2 pt-1.5 border-t border-zinc-800/60 text-xs">
      <div className="flex items-center justify-between text-[10.5px] text-zinc-400 font-medium py-0.5">
        <button
          type="button"
          onClick={() => setIsExpanded(v => !v)}
          className="flex items-center gap-1.5 hover:text-zinc-200 cursor-pointer select-none text-left"
          title={isExpanded ? 'Recolher resultado' : 'Expandir resultado'}
        >
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isRunning ? 'bg-amber-400 animate-ping' : 'bg-emerald-500'}`} />
          <span className="truncate">{isRunning ? 'Executando novo teste...' : 'Resultado do teste'}</span>
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
            <div className="space-y-1 pt-0.5 opacity-60">
              <div className="h-2 bg-zinc-700/60 rounded w-4/5" />
              <div className="h-2 bg-zinc-700/40 rounded w-2/3" />
            </div>
          </div>
        ) : (
          <div
            onWheel={e => e.stopPropagation()}
            className="bg-[#141416] border border-zinc-800/80 rounded-lg p-2 text-zinc-300 leading-relaxed max-h-36 overflow-y-auto custom-chat-scrollbar text-[11px] whitespace-pre-wrap select-text mt-1.5 overscroll-contain"
          >
            {output}
          </div>
        )
      )}
    </div>
  )
}

const NODE_META: Record<
  WorkflowNodeKind,
  { label: string; group: 'Entradas' | 'Etapas' | 'Fluxo'; color: string }
> = {
  input: {
    label: 'Gatilho',
    group: 'Entradas',
    color: '#f59e0b'
  },
  read_note: {
    label: 'Prompt',
    group: 'Entradas',
    color: '#3b82f6'
  },
  sticky_note: {
    label: 'Nota Adesiva',
    group: 'Entradas',
    color: '#eab308'
  },
  text_block: {
    label: 'Tarja de Título',
    group: 'Entradas',
    color: '#94a3b8'
  },
  llm: {
    label: 'LLM',
    group: 'Etapas',
    color: '#a855f7'
  },
  run_agent: {
    label: 'Agente',
    group: 'Etapas',
    color: '#10b981'
  },
  condition: {
    label: 'Condição',
    group: 'Fluxo',
    color: '#a855f7'
  },
  approval: {
    label: 'Aprovação',
    group: 'Fluxo',
    color: '#f97316'
  },
  create_task: {
    label: 'Gerenciador de Tarefas',
    group: 'Etapas',
    color: '#06b6d4'
  },
  manage_properties: {
    label: 'Gerenciador de Tarefas',
    group: 'Etapas',
    color: '#06b6d4'
  },
  deliverable: {
    label: 'Saída',
    group: 'Fluxo',
    color: '#3b82f6'
  },
  finish: {
    label: 'Finalizar',
    group: 'Fluxo',
    color: '#64748b'
  }
}

export const WorkflowCanvasEditor: React.FC<WorkflowCanvasEditorProps> = ({
  workflows,
  agents,
  notes,
  folders,
  selectedWorkflowId,
  latestNodeStates: _latestNodeStates,
  activeRun,
  allProjects = [],
  taskBoards = [],
  onSelectWorkflow,
  onSaveWorkflow,
  onDeleteWorkflow,
  onRunWorkflow,
  onResumeWorkflowRun,
  onOpenNote,
  isExecuting,
  commitTasks
}) => {
  const activeWorkflow = workflows.find(w => w.id === selectedWorkflowId) || workflows[0]
  // Só mostramos o estado de execução quando a execução pertence ao fluxo aberto
  const runForThisWorkflow =
    activeRun && activeWorkflow && activeRun.workflowId === activeWorkflow.id ? activeRun : undefined
  const runStates = runForThisWorkflow?.workflowNodeStates
  const [dismissedRunId, setDismissedRunId] = useState<string | null>(null)
  const [isRunPanelCollapsed, setIsRunPanelCollapsed] = useState(false)
  const [expandedRunSteps, setExpandedRunSteps] = useState<Record<string, boolean>>({})
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 80, y: 60 })
  const [toolMode, setToolMode] = useState<'pointer' | 'hand'>('pointer')
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)
  const [inspectorOpen, setInspectorOpen] = useState(false)
  const [isFlowSidebarOpen, setIsFlowSidebarOpen] = useState(true)
  const [flowSearchQuery, setFlowSearchQuery] = useState('')
  const [isRenamingWorkflow, setIsRenamingWorkflow] = useState(false)
  const [workflowTitleDraft, setWorkflowTitleDraft] = useState('')

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
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false)
  const [addMenuSearch, setAddMenuSearch] = useState('')
  const [addMenuPos, setAddMenuPos] = useState<{ x: number; y: number } | null>(null)
  const [executingNodeId, setExecutingNodeId] = useState<string | null>(null)
  const [cardHeights, setCardHeights] = useState<Record<string, number>>({})
  const [activeTabPrompt, setActiveTabPrompt] = useState<Record<string, 'text' | 'note'>>({})

  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null)
  const dragOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const panStartRef = useRef<{ x: number; y: number; panX: number; panY: number }>({
    x: 0,
    y: 0,
    panX: 0,
    panY: 0
  })

  // OpenBot Interactive Port Wire Dragging
  const [wireDraft, setWireDraft] = useState<{
    fromNodeId: string
    toWorld: { x: number; y: number }
    hoveredTargetId: string | null
  } | null>(null)

  const viewportRef = useRef<HTMLDivElement>(null)
  const workflowMenuRef = useRef<HTMLDivElement>(null)
  const addMenuRef = useRef<HTMLDivElement>(null)

  // Keyboard shortcut listener: Delete/Backspace removes selected node or edge
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement
      const isInput = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT')
      if (isInput) return

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedNodeId && activeWorkflow) {
          handleRemoveNode(selectedNodeId)
        } else if (selectedEdgeId && activeWorkflow) {
          handleRemoveEdge(selectedEdgeId)
        }
      } else if (e.key === 'Escape') {
        setIsAddMenuOpen(false)
        setInspectorOpen(false)
        setSelectedNodeId(null)
        setSelectedEdgeId(null)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedNodeId, selectedEdgeId, activeWorkflow])

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (addMenuRef.current && !addMenuRef.current.contains(e.target as Node)) {
        setIsAddMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleFitView = () => {
    if (!activeWorkflow || activeWorkflow.nodes.length === 0) return
    const rect = viewportRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0 || rect.height === 0) {
      setZoom(1)
      setPan({ x: 80, y: 60 })
      return
    }

    // Calcula os limites geométricos reais de cada card considerando sua altura e largura reais
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity

    for (const node of activeWorkflow.nodes) {
      const dim = getNodeCardDimensions(node.kind)
      const measuredH = cardHeights[node.id] || dim.height
      minX = Math.min(minX, node.position.x)
      minY = Math.min(minY, node.position.y)
      maxX = Math.max(maxX, node.position.x + dim.width)
      maxY = Math.max(maxY, node.position.y + measuredH)
    }

    const flowWidth = Math.max(100, maxX - minX)
    const flowHeight = Math.max(100, maxY - minY)

    // Margens balanceadas e simétricas
    const availableW = Math.max(200, rect.width - 120)
    const availableH = Math.max(200, rect.height - 120)

    const scaleX = availableW / flowWidth
    const scaleY = availableH / flowHeight
    const nextZoom = Math.max(0.45, Math.min(1.05, Math.min(scaleX, scaleY)))

    const flowCenterX = minX + flowWidth / 2
    const flowCenterY = minY + flowHeight / 2

    const finalZoom = Number(nextZoom.toFixed(2))
    setZoom(finalZoom)
    setPan({
      x: Math.round(rect.width / 2 - flowCenterX * finalZoom),
      y: Math.round(rect.height / 2 - flowCenterY * finalZoom)
    })
  }

  // Centralização automática ao abrir ou trocar de fluxo (apenas uma vez ao mudar selectedWorkflowId)
  const lastCenteredWfIdRef = useRef<string | null>(null)
  useEffect(() => {
    if (!activeWorkflow) return
    if (lastCenteredWfIdRef.current === selectedWorkflowId) return
    lastCenteredWfIdRef.current = selectedWorkflowId
    const timer = setTimeout(() => {
      handleFitView()
    }, 60)
    return () => clearTimeout(timer)
  }, [selectedWorkflowId])

  // Limpeza silenciosa de conexões órfãs apontando para nós que já foram removidos
  useEffect(() => {
    if (!activeWorkflow) return
    const validNodeIds = new Set(activeWorkflow.nodes.map(n => n.id))
    const orphanEdges = activeWorkflow.edges.filter(
      e => !validNodeIds.has(e.sourceNodeId) || !validNodeIds.has(e.targetNodeId)
    )
    if (orphanEdges.length > 0) {
      onSaveWorkflow({
        ...activeWorkflow,
        edges: activeWorkflow.edges.filter(
          e => validNodeIds.has(e.sourceNodeId) && validNodeIds.has(e.targetNodeId)
        )
      })
    }
  }, [activeWorkflow?.id, activeWorkflow?.nodes.length])

  if (!activeWorkflow) return null

  const validation = validateWorkflowDefinition(activeWorkflow, agents, notes)
  const selectedNode = activeWorkflow.nodes.find(n => n.id === selectedNodeId)

  const screenToWorld = (clientX: number, clientY: number) => {
    const rect = viewportRef.current?.getBoundingClientRect()
    if (!rect) return { x: 240, y: 180 }
    return {
      x: (clientX - rect.left - pan.x) / zoom,
      y: (clientY - rect.top - pan.y) / zoom
    }
  }

  const handleCreateWorkflow = () => {
    const firstAgent = agents[0]
    const nInId = `wn_in_${Date.now()}`
    const nAgId = `wn_ag_${Date.now()}`

    const newWf: WorkflowDefinition = {
      id: `wf_${Date.now()}`,
      version: 1,
      status: 'draft',
      name: `Fluxo de trabalho sem título ${workflows.length + 1}`,
      description: 'Fluxo visual em estilo OpenBot.',
      nodes: [
        {
          id: nInId,
          kind: 'input',
          label: 'Gatilho',
          position: { x: 140, y: 160 },
          config: {
            triggerType: 'schedule',
            scheduleFrequency: 'daily',
            scheduleTime: '09:00'
          }
        },
        {
          id: nAgId,
          kind: 'run_agent',
          label: firstAgent?.name || 'Agente',
          position: { x: 540, y: 160 },
          config: { agentId: firstAgent?.id }
        }
      ],
      edges: [
        { id: `we_1_${Date.now()}`, sourceNodeId: nInId, targetNodeId: nAgId, branch: 'default' }
      ],
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    onSaveWorkflow(newWf)
    onSelectWorkflow(newWf.id)
  }

  const handleAddNodeAt = (kind: WorkflowNodeKind, worldPos?: { x: number; y: number } | null) => {
    const meta = NODE_META[kind] || { label: 'Etapa' }
    const count = activeWorkflow.nodes.length
    let pos: { x: number; y: number }

    if (worldPos) {
      pos = { x: snapDiagramCoord(worldPos.x), y: snapDiagramCoord(worldPos.y) }
    } else {
      // Posiciona no centro visível da viewport atual do usuário
      const rect = viewportRef.current?.getBoundingClientRect()
      const viewW = rect?.width || 800
      const viewH = rect?.height || 600
      const centerWorldX = (-pan.x + viewW / 2) / zoom
      const centerWorldY = (-pan.y + viewH / 2) / zoom
      const dim = getNodeCardDimensions(kind)
      const jitter = ((count * 25) % 90) - 45
      pos = {
        x: snapDiagramCoord(Math.round(centerWorldX - dim.width / 2 + jitter)),
        y: snapDiagramCoord(Math.round(centerWorldY - dim.height / 2 + jitter))
      }
    }

    const newNode: WorkflowNode = {
      id: `wn_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      kind,
      label: meta.label,
      position: pos,
      config:
        kind === 'sticky_note'
          ? { content: 'Nova nota de apoio para o fluxo de trabalho...' }
          : kind === 'text_block'
          ? {}
          : kind === 'run_agent'
          ? { agentId: agents[0]?.id }
          : kind === 'llm'
          ? { model: 'gpt-4o', reasoning: 'low', promptTemplate: '' }
          : kind === 'read_note'
          ? { noteId: notes[0]?.id, noteTitle: notes[0]?.title, contextRole: 'permanent_ref' }
          : kind === 'condition'
          ? { conditionType: 'ai_rule', rule: '', trueLabel: 'Sim (Verdadeiro)', falseLabel: 'Não (Falso)' }
          : kind === 'approval'
          ? { approvalMessage: 'Revisar entregável gerado antes de salvar no cofre.' }
          : kind === 'create_task'
          ? { targetBoardId: 'default', taskMode: 'auto_ai', taskPriority: 'normal', autoCreateProperty: true }
          : kind === 'deliverable'
          ? { targetFolder: 'Propostas', outputType: 'note' }
          : { triggerType: 'manual' }
    }
    onSaveWorkflow({
      ...activeWorkflow,
      version: activeWorkflow.version + 1,
      nodes: [...activeWorkflow.nodes, newNode],
      updatedAt: Date.now()
    })
    setSelectedNodeId(newNode.id)
    setIsAddMenuOpen(false)
    setAddMenuPos(null)
  }

  const handleRemoveNode = (nodeId: string) => {
    onSaveWorkflow({
      ...activeWorkflow,
      version: activeWorkflow.version + 1,
      nodes: activeWorkflow.nodes.filter(n => n.id !== nodeId),
      edges: activeWorkflow.edges.filter(e => e.sourceNodeId !== nodeId && e.targetNodeId !== nodeId),
      updatedAt: Date.now()
    })
    if (selectedNodeId === nodeId) setSelectedNodeId(null)
  }

  const handleRemoveEdge = (edgeId: string) => {
    onSaveWorkflow({
      ...activeWorkflow,
      version: activeWorkflow.version + 1,
      edges: activeWorkflow.edges.filter(e => e.id !== edgeId),
      updatedAt: Date.now()
    })
    if (selectedEdgeId === edgeId) setSelectedEdgeId(null)
  }

  const completeWireConnection = (fromId: string, toId: string) => {
    const targetNode = activeWorkflow.nodes.find(n => n.id === toId)
    if (!targetNode) return
    const problem = diagramConnectionProblem(
      activeWorkflow.edges,
      fromId,
      toId,
      targetNode.kind === 'input'
    )
    if (problem) return

    const sourceNode = activeWorkflow.nodes.find(n => n.id === fromId)
    const branch: WorkflowEdge['branch'] =
      sourceNode?.kind === 'approval'
        ? 'approved'
        : sourceNode?.kind === 'condition'
        ? 'true'
        : 'default'

    const newEdge: WorkflowEdge = {
      id: `we_${Date.now()}`,
      sourceNodeId: fromId,
      targetNodeId: toId,
      branch,
      label:
        branch === 'true'
          ? sourceNode?.config?.trueLabel || 'Sim'
          : branch === 'approved'
          ? 'Aprovado'
          : undefined
    }
    onSaveWorkflow({
      ...activeWorkflow,
      version: activeWorkflow.version + 1,
      edges: [...activeWorkflow.edges, newEdge],
      updatedAt: Date.now()
    })
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (wireDraft) {
      const world = screenToWorld(e.clientX, e.clientY)
      let hoveredTargetId: string | null = null
      for (const n of activeWorkflow.nodes) {
        if (n.id === wireDraft.fromNodeId || n.kind === 'input' || n.kind === 'sticky_note' || n.kind === 'text_block') continue
        const inPort = getNodeInputPort(n, cardHeights[n.id])
        if (Math.hypot(world.x - inPort.x, world.y - inPort.y) < 48) {
          hoveredTargetId = n.id
          break
        }
      }
      setWireDraft({
        ...wireDraft,
        toWorld: hoveredTargetId
          ? getNodeInputPort(activeWorkflow.nodes.find(n => n.id === hoveredTargetId)!, cardHeights[hoveredTargetId])
          : world,
        hoveredTargetId
      })
      return
    }

    if (draggingNodeId) {
      const nextX = snapDiagramCoord((e.clientX - dragOffsetRef.current.x - pan.x) / zoom)
      const nextY = snapDiagramCoord((e.clientY - dragOffsetRef.current.y - pan.y) / zoom)
      onSaveWorkflow({
        ...activeWorkflow,
        nodes: activeWorkflow.nodes.map(n =>
          n.id === draggingNodeId ? { ...n, position: { x: nextX, y: nextY } } : n
        ),
        updatedAt: Date.now()
      })
      return
    }

    if (isPanning) {
      setPan({
        x: panStartRef.current.panX + (e.clientX - panStartRef.current.x),
        y: panStartRef.current.panY + (e.clientY - panStartRef.current.y)
      })
    }
  }

  const handlePointerUp = () => {
    if (wireDraft) {
      if (wireDraft.hoveredTargetId) {
        completeWireConnection(wireDraft.fromNodeId, wireDraft.hoveredTargetId)
      }
      setWireDraft(null)
    }
    setDraggingNodeId(null)
    setIsPanning(false)
  }

  const handleUpdateSelectedNode = (patch: Partial<WorkflowNode>) => {
    if (!selectedNode) return
    onSaveWorkflow({
      ...activeWorkflow,
      version: activeWorkflow.version + 1,
      nodes: activeWorkflow.nodes.map(n => (n.id === selectedNode.id ? { ...n, ...patch } : n)),
      updatedAt: Date.now()
    })
  }

  const handleUpdateNodeById = (nodeId: string, patch: Partial<WorkflowNode>) => {
    onSaveWorkflow({
      ...activeWorkflow,
      version: activeWorkflow.version + 1,
      nodes: activeWorkflow.nodes.map(n => (n.id === nodeId ? { ...n, ...patch } : n)),
      updatedAt: Date.now()
    })
  }

  const handleExecuteSingleNode = async (node: WorkflowNode) => {
    setExecutingNodeId(node.id)
    // Limpar o resultado anterior imediatamente para dar feedback visual instantâneo
    handleUpdateNodeById(node.id, {
      config: {
        ...node.config,
        lastOutput: undefined,
        lastExecutedAt: undefined
      }
    })
    try {
      // Se este nó tem conexões de entrada, utiliza a saída/prompt deles como contexto dinâmico
      const incomingEdges = activeWorkflow.edges.filter(e => e.targetNodeId === node.id)
      const inputOutputs = incomingEdges
        .map(e => activeWorkflow.nodes.find(n => n.id === e.sourceNodeId))
        .filter(Boolean)
        .map(n => n?.config.lastOutput || n?.config.promptTemplate || n?.config.content || '')
        .filter(t => t.trim().length > 0)

      const contextualPrompt = inputOutputs.length > 0
        ? inputOutputs.join('\n\n')
        : (node.config.approvalMessage || node.config.promptTemplate || node.config.content || 'Executar etapa')

      const res = await executeWorkflowSingleNode({
        node,
        workflow: activeWorkflow,
        allAgents: agents,
        allNotes: notes,
        allProjects,
        prompt: contextualPrompt,
        commitTasks
      })
      handleUpdateNodeById(node.id, {
        config: {
          ...node.config,
          lastOutput: res.output,
          lastExecutedAt: Date.now(),
          branchTaken: res.branchTaken || node.config.branchTaken
        }
      })
    } catch (err: any) {
      handleUpdateNodeById(node.id, {
        config: {
          ...node.config,
          lastOutput: `Erro na execução da etapa: ${err?.message || 'Falha ao processar'}`,
          lastExecutedAt: Date.now()
        }
      })
    } finally {
      setExecutingNodeId(null)
    }
  }

  const handleApproveNode = async (nodeId: string) => {
    handleUpdateNodeById(nodeId, {
      config: {
        ...activeWorkflow.nodes.find(n => n.id === nodeId)?.config,
        branchTaken: 'yes',
        lastOutput: 'Aprovado pelo usuário.'
      }
    })
    if (activeRun && onResumeWorkflowRun) {
      await onResumeWorkflowRun(activeRun)
    }
  }

  const handleRejectNode = (nodeId: string) => {
    handleUpdateNodeById(nodeId, {
      config: {
        ...activeWorkflow.nodes.find(n => n.id === nodeId)?.config,
        branchTaken: 'no',
        lastOutput: 'Rejeitado pelo usuário. Fluxo finalizado.'
      }
    })
  }

  const handleStartRun = (isTest: boolean) => {
    if (!validation.valid) {
      alert(`Para executar o fluxo:\n\n• ${validation.errors.join('\n• ')}`)
      return
    }
    // Limpa os resultados de testes de etapa anteriores: a partir daqui só vale o resultado desta execução
    const cleaned: WorkflowDefinition = {
      ...activeWorkflow,
      nodes: activeWorkflow.nodes.map(n =>
        n.config.lastOutput || n.config.lastExecutedAt
          ? { ...n, config: { ...n.config, lastOutput: undefined, lastExecutedAt: undefined } }
          : n
      ),
      updatedAt: Date.now()
    }
    onSaveWorkflow(cleaned)
    setDismissedRunId(null)
    setExpandedRunSteps({})
    onRunWorkflow(cleaned, isTest, 'Executar fluxo completo')
  }

  const addMenuGroups = [
    {
      title: 'Entradas & Apoio',
      items: [
        { kind: 'input' as WorkflowNodeKind, label: 'Gatilho', icon: Zap, color: '#f59e0b' },
        { kind: 'read_note' as WorkflowNodeKind, label: 'Prompt', icon: MessageSquare, color: '#3b82f6' },
        { kind: 'sticky_note' as WorkflowNodeKind, label: 'Nota Adesiva', icon: StickyNote, color: '#eab308' },
        { kind: 'text_block' as WorkflowNodeKind, label: 'Tarja de Título', icon: Type, color: '#94a3b8' }
      ]
    },
    {
      title: 'Etapas',
      items: [
        { kind: 'llm' as WorkflowNodeKind, label: 'LLM', icon: Sparkles, color: '#a855f7' },
        { kind: 'run_agent' as WorkflowNodeKind, label: 'Agente', icon: Bot, color: '#10b981' },
        { kind: 'create_task' as WorkflowNodeKind, label: 'Gerenciador de Tarefas', icon: ListTodo, color: '#06b6d4' }
      ]
    },
    {
      title: 'Fluxo',
      items: [
        { kind: 'condition' as WorkflowNodeKind, label: 'Condição', icon: GitBranch, color: '#a855f7' },
        { kind: 'approval' as WorkflowNodeKind, label: 'Aprovação', icon: ShieldCheck, color: '#f97316' },
        { kind: 'deliverable' as WorkflowNodeKind, label: 'Saída', icon: Send, color: '#3b82f6' }
      ]
    }
  ]

  const filteredWorkflows = workflows.filter(w =>
    w.name.toLowerCase().includes(flowSearchQuery.toLowerCase()) ||
    (w.description || '').toLowerCase().includes(flowSearchQuery.toLowerCase())
  )

  return (
    <div className="flex-1 flex h-full bg-[#09090b] overflow-hidden select-none relative">
      {/* ============================================================================ */}
      {/* SIDEBAR LATERAL DE FLUXOS: Lista retrátil, busca e ações (Print 01 style!)     */}
      {/* ============================================================================ */}
      {isFlowSidebarOpen && (
        <aside className="w-72 shrink-0 h-full bg-[#0c0c0e] border-r border-zinc-800/80 flex flex-col z-30">
          {/* Topo da Sidebar de Fluxos */}
          <div className="h-11 px-3 border-b border-zinc-800/80 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)] inline-block" />
              <span className="text-xs font-semibold text-zinc-100">Fluxos de Trabalho</span>
              <span className="text-[10px] text-zinc-500 font-mono">({workflows.length})</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleCreateWorkflow}
                className="p-1 rounded-lg hover:bg-zinc-800 text-zinc-300 hover:text-white cursor-pointer"
                title="Novo fluxo de trabalho"
              >
                <Plus className="w-4 h-4 text-emerald-400" />
              </button>
              <button
                type="button"
                onClick={() => setIsFlowSidebarOpen(false)}
                className="p-1 rounded-lg hover:bg-zinc-800 text-zinc-500 hover:text-zinc-200 cursor-pointer"
                title="Recolher lista de fluxos"
              >
                <PanelLeft className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Campo de Busca de Fluxos */}
          <div className="p-2.5 border-b border-zinc-800/60">
            <div className="relative flex items-center">
              <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 pointer-events-none" />
              <input
                type="text"
                value={flowSearchQuery}
                onChange={e => setFlowSearchQuery(e.target.value)}
                placeholder="Buscar fluxo..."
                className="w-full bg-[#141416] border border-zinc-800/70 rounded-xl pl-8 pr-2.5 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-700"
              />
            </div>
          </div>

          {/* Lista com rolagem de Fluxos */}
          <div
            onWheel={e => e.stopPropagation()}
            className="flex-1 overflow-y-auto custom-chat-scrollbar p-2 space-y-1 overscroll-contain"
          >
            {filteredWorkflows.map(wf => {
              const isSelected = wf.id === activeWorkflow.id
              const realNodesCount = wf.nodes.filter(n => n.kind !== 'sticky_note' && n.kind !== 'text_block').length
              return (
                <div
                  key={wf.id}
                  onClick={() => onSelectWorkflow(wf.id)}
                  className={`w-full group text-left p-2.5 rounded-xl border transition-all cursor-pointer flex items-start justify-between gap-2 ${
                    isSelected
                      ? 'bg-[#18181c] border-emerald-500/40 text-white shadow-xs'
                      : 'bg-[#121214] border-zinc-800/60 text-zinc-300 hover:bg-[#151518] hover:border-zinc-700/60'
                  }`}
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="font-semibold text-xs truncate">{wf.name}</div>
                    <div className="flex items-center gap-2 text-[10px] text-zinc-500">
                      <span>{realNodesCount} blocos</span>
                      <span>•</span>
                      <span className={wf.status === 'published' ? 'text-emerald-400/90' : 'text-amber-400/90'}>
                        {wf.status === 'published' ? 'Publicado' : 'Rascunho'}
                      </span>
                    </div>
                  </div>

                  {/* Ações rápidas */}
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDuplicateWorkflow(wf)
                      }}
                      className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 cursor-pointer"
                      title="Duplicar fluxo"
                    >
                      <Copy className="w-3 h-3" />
                    </button>
                    {workflows.length > 1 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          if (window.confirm(`Excluir fluxo "${wf.name}"?`)) {
                            onDeleteWorkflow(wf.id)
                          }
                        }}
                        className="p-1 rounded hover:bg-rose-950/40 text-zinc-400 hover:text-rose-400 cursor-pointer"
                        title="Excluir fluxo"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </aside>
      )}

      {/* ÁREA PRINCIPAL DO CANVAS */}
      <div className="flex-1 flex flex-col h-full overflow-hidden relative">
        {/* ============================================================================ */}
        {/* 1. BARRA SUPERIOR MINIMALISTA IDÊNTICA AO PRINT 02 DO OPENBOT                */}
        {/* ============================================================================ */}
        <div className="h-11 px-4 border-b border-zinc-900/90 bg-[#09090b] flex items-center justify-between shrink-0 z-30">
          {/* Esquerda: Botão de abrir sidebar + Status Local + Setas + Nome do Fluxo */}
          <div className="flex items-center gap-3">
            {!isFlowSidebarOpen && (
              <button
                type="button"
                onClick={() => setIsFlowSidebarOpen(true)}
                className="p-1.5 rounded-lg border border-zinc-800 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 cursor-pointer"
                title="Abrir lista de fluxos"
              >
                <PanelLeft className="w-4 h-4" />
              </button>
            )}

            <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-zinc-900/60 border border-zinc-800/60 text-xs text-zinc-300 font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)] inline-block" />
              <span>Local</span>
            </div>

            <div className="flex items-center gap-0.5 text-zinc-500">
              <button
                type="button"
                onClick={handleFitView}
                className="p-1 rounded hover:bg-zinc-850 hover:text-zinc-200 transition-colors cursor-pointer"
                title="Centralizar visualização"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={handleFitView}
                className="p-1 rounded hover:bg-zinc-850 hover:text-zinc-200 transition-colors cursor-pointer"
                title="Ajustar à tela"
              >
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="relative" ref={workflowMenuRef}>
              {isRenamingWorkflow ? (
                <input
                  type="text"
                  autoFocus
                  value={workflowTitleDraft}
                  onChange={e => setWorkflowTitleDraft(e.target.value)}
                  onBlur={() => {
                    if (workflowTitleDraft.trim()) {
                      onSaveWorkflow({ ...activeWorkflow, name: workflowTitleDraft.trim(), updatedAt: Date.now() })
                    }
                    setIsRenamingWorkflow(false)
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      if (workflowTitleDraft.trim()) {
                        onSaveWorkflow({ ...activeWorkflow, name: workflowTitleDraft.trim(), updatedAt: Date.now() })
                      }
                      setIsRenamingWorkflow(false)
                    }
                    if (e.key === 'Escape') setIsRenamingWorkflow(false)
                  }}
                  className="bg-[#141416] border border-zinc-700 rounded-lg px-2 py-0.5 text-xs text-zinc-100 outline-none font-medium"
                />
              ) : (
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-xs text-zinc-100">{activeWorkflow.name}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setWorkflowTitleDraft(activeWorkflow.name)
                      setIsRenamingWorkflow(true)
                    }}
                    className="p-1 text-zinc-500 hover:text-zinc-300 cursor-pointer"
                    title="Renomear fluxo"
                  >
                    <Type className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={handleFitView}
              className="p-1.5 rounded-lg border border-zinc-800/80 hover:bg-zinc-850 text-zinc-400 hover:text-zinc-200 text-xs flex items-center gap-1 cursor-pointer ml-1"
              title="Centralizar e ajustar à tela"
            >
              <Maximize2 className="w-3.5 h-3.5" />
              <span className="text-[11px]">Centralizar</span>
            </button>
          </div>

          {/* Direita: Botão Pílula Branco "▷ Executar fluxo de trabalho" */}
          <div className="flex items-center gap-2">
            {!validation.valid && (
              <div
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-950/70 border border-amber-800/60 text-amber-300 text-[11px]"
                title={validation.errors.join('\n')}
              >
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span className="truncate max-w-[220px]">{validation.errors[0]}</span>
              </div>
            )}
            <button
              type="button"
              disabled={isExecuting}
              onClick={() => handleStartRun(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white font-medium text-xs transition-all cursor-pointer disabled:opacity-50"
              title="Percorre todo o fluxo sem gravar nada no cofre"
            >
              <FlaskConical className="w-3 h-3" />
              <span>Testar</span>
            </button>
            <button
              type="button"
              disabled={isExecuting}
              onClick={() => handleStartRun(false)}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full font-semibold text-xs transition-all shadow-sm cursor-pointer ${
                validation.valid
                  ? 'bg-zinc-100 hover:bg-white text-zinc-950 active:scale-95'
                  : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'
              }`}
              title={validation.valid ? 'Iniciar execução do fluxo' : validation.errors.join('\n')}
            >
              <Play className={`w-3 h-3 fill-current ${isExecuting ? 'animate-spin' : ''}`} />
              <span>{isExecuting ? 'Executando fluxo...' : 'Executar fluxo de trabalho'}</span>
            </button>
          </div>
        </div>

      {/* ============================================================================ */}
      {/* 2. ÁREA DO CANVAS INFINITO COM DOT-GRID ESCURO (#09090b)                      */}
      {/* ============================================================================ */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* PAINEL DA ÚLTIMA EXECUÇÃO — mostra de forma clara o que aconteceu (teste x produção) e onde ficou o resultado */}
        {runForThisWorkflow && dismissedRunId !== runForThisWorkflow.id && (() => {
          const run = runForThisWorkflow
          const states = (run.workflowNodeStates || []).filter(
            s => s.kind !== 'sticky_note' && s.kind !== 'text_block' && s.status !== 'pending'
          )
          const isRunActive = run.status === 'running' || isExecuting
          const statusMeta =
            isRunActive
              ? { label: 'Executando...', cls: 'text-amber-300 bg-amber-950/50 border-amber-800/50' }
              : run.status === 'completed'
              ? { label: 'Concluído', cls: 'text-emerald-300 bg-emerald-950/50 border-emerald-800/50' }
              : run.status === 'failed'
              ? { label: 'Falhou', cls: 'text-rose-300 bg-rose-950/50 border-rose-800/50' }
              : run.status === 'waiting_approval'
              ? { label: 'Aguardando aprovação', cls: 'text-amber-300 bg-amber-950/50 border-amber-800/50' }
              : { label: 'Em andamento', cls: 'text-zinc-300 bg-zinc-900 border-zinc-800' }
          return (
            <div
              data-no-pan="true"
              onPointerDown={e => e.stopPropagation()}
              className={`absolute left-4 bottom-4 z-30 w-[340px] flex flex-col rounded-2xl bg-[#141416] border border-zinc-800 shadow-2xl overflow-hidden transition-all duration-150 ${
                isRunPanelCollapsed ? 'max-h-10' : 'max-h-[60%]'
              }`}
            >
              <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-zinc-800/80">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span
                    className={`text-[9.5px] font-semibold px-1.5 py-0.5 rounded-md border ${
                      run.isTestRun
                        ? 'text-sky-300 bg-sky-950/50 border-sky-800/50'
                        : 'text-emerald-300 bg-emerald-950/50 border-emerald-800/50'
                    }`}
                    title={run.isTestRun ? 'Execução de teste: nada foi gravado no cofre' : 'Execução real: as entregas foram gravadas no cofre'}
                  >
                    {run.isTestRun ? 'TESTE' : 'PRODUÇÃO'}
                  </span>
                  <span className={`text-[9.5px] font-semibold px-1.5 py-0.5 rounded-md border ${statusMeta.cls} ${isRunActive ? 'animate-pulse' : ''}`}>
                    {isRunActive && <Loader2 className="w-2.5 h-2.5 animate-spin inline mr-1" />}
                    {statusMeta.label}
                  </span>
                  <span className="text-[10px] text-zinc-500 font-mono truncate">
                    {new Date(run.startedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setIsRunPanelCollapsed(v => !v)}
                    className="text-zinc-500 hover:text-zinc-200 p-0.5 cursor-pointer"
                    title={isRunPanelCollapsed ? 'Expandir painel' : 'Minimizar painel'}
                  >
                    <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-150 ${isRunPanelCollapsed ? 'rotate-180' : ''}`} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDismissedRunId(run.id)}
                    className="text-zinc-500 hover:text-zinc-200 p-0.5 cursor-pointer"
                    title="Fechar painel"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {!isRunPanelCollapsed && (
                <div
                  onWheel={e => e.stopPropagation()}
                  className="overflow-y-auto custom-chat-scrollbar p-2 space-y-1.5 overscroll-contain"
                >
                {run.error && (
                  <div className="text-[11px] text-rose-300 bg-rose-950/30 border border-rose-900/50 rounded-lg p-2 leading-relaxed">
                    {run.error}
                  </div>
                )}

                {run.artifacts.map(art => (
                  <button
                    key={art.id}
                    type="button"
                    onClick={() => art.noteId && onOpenNote?.(art.noteId)}
                    className="w-full text-left flex items-center gap-2 text-[11px] text-emerald-200 bg-emerald-950/30 border border-emerald-900/50 hover:bg-emerald-950/50 rounded-lg p-2 cursor-pointer"
                  >
                    <FileText className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
                    <span className="truncate">
                      Nota gravada: <b>{art.folder}/{art.title}</b>
                    </span>
                    <span className="ml-auto text-[10px] text-emerald-400/80 shrink-0">Abrir</span>
                  </button>
                ))}

                {run.isTestRun && run.status === 'completed' && (
                  <div className="text-[10.5px] text-sky-300/90 bg-sky-950/20 border border-sky-900/40 rounded-lg p-2">
                    Execução de teste: o fluxo foi percorrido, mas nenhuma nota foi criada. Use “Executar fluxo de trabalho” para gravar de verdade.
                  </div>
                )}

                {states.length === 0 && (
                  <div className="text-[11px] text-zinc-500 p-2">Nenhuma etapa foi executada.</div>
                )}

                {states.map(s => {
                  const open = expandedRunSteps[s.nodeId]
                  return (
                    <div key={s.nodeId} className="rounded-lg bg-[#101012] border border-zinc-800/80">
                      <button
                        type="button"
                        onClick={() => setExpandedRunSteps(prev => ({ ...prev, [s.nodeId]: !prev[s.nodeId] }))}
                        className="w-full flex items-center gap-2 px-2 py-1.5 text-left cursor-pointer"
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                            s.status === 'completed'
                              ? 'bg-emerald-500'
                              : s.status === 'failed'
                              ? 'bg-rose-500'
                              : s.status === 'skipped'
                              ? 'bg-zinc-600'
                              : 'bg-amber-400'
                          }`}
                        />
                        <span className="text-[11px] text-zinc-200 font-medium truncate">{s.label}</span>
                        <span className="text-[10px] text-zinc-500 truncate flex-1">
                          {!open && (s.outputSummary || '')}
                        </span>
                        <ChevronDown className={`w-3 h-3 text-zinc-500 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
                      </button>
                      {open && (
                        <div
                          onWheel={e => e.stopPropagation()}
                          className="px-2 pb-2 text-[11px] text-zinc-300 whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto custom-chat-scrollbar select-text overscroll-contain"
                        >
                          {s.output || s.outputSummary || 'Sem saída registrada.'}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })()}

        <div
          ref={viewportRef}
          onWheel={e => {
            if (e.ctrlKey || e.metaKey) {
              e.preventDefault()
              const delta = e.deltaY < 0 ? 0.08 : -0.08
              setZoom(z => Math.max(0.4, Math.min(1.8, Number((z + delta).toFixed(2)))))
            } else {
              setPan(p => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }))
            }
          }}
          onContextMenu={e => {
            e.preventDefault()
            const world = screenToWorld(e.clientX, e.clientY)
            setAddMenuPos({ x: world.x, y: world.y })
            setIsAddMenuOpen(true)
          }}
          onPointerDown={e => {
            if (e.button === 2) return
            const target = e.target as HTMLElement
            const isInput = target?.closest?.('button, input, textarea, select, [data-no-pan="true"]')
            const isNode = target?.closest?.('[data-node-id]')

            if (toolMode === 'hand' || e.button === 1 || (!isInput && !isNode)) {
              if (!isNode) {
                setSelectedNodeId(null)
                setSelectedEdgeId(null)
                setIsAddMenuOpen(false)
              }
              setIsPanning(true)
              panStartRef.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y }
            }
          }}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          data-canvas-bg="true"
          className={`flex-1 relative overflow-hidden bg-[#09090b] ${
            toolMode === 'hand' || isPanning ? 'cursor-grabbing' : 'cursor-default'
          }`}
          style={{
            backgroundImage: 'radial-gradient(#27272a 1px, transparent 1px)',
            backgroundSize: `${20 * zoom}px ${20 * zoom}px`,
            backgroundPosition: `${pan.x}px ${pan.y}px`
          }}
        >
          {/* Camada Transformável com Zoom e Pan */}
          <div
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: '0 0'
            }}
            className="absolute inset-0 pointer-events-none"
          >
            {/* Arestas Bezier Suaves */}
            <svg className="overflow-visible w-full h-full pointer-events-none">
              {activeWorkflow.edges.map(edge => {
                const src = activeWorkflow.nodes.find(n => n.id === edge.sourceNodeId)
                const dst = activeWorkflow.nodes.find(n => n.id === edge.targetNodeId)
                if (!src || !dst) return null
                const fromPt = getNodeOutputPort(src, cardHeights[src.id])
                const toPt = getNodeInputPort(dst, cardHeights[dst.id])
                const pathD = diagramEdgePath(fromPt, toPt)
                const mid = diagramEdgeMidpoint(fromPt, toPt)
                const arrowPts = diagramEdgeArrow(toPt)
                const isSelected = selectedEdgeId === edge.id
                const strokeColor = isSelected ? '#ffffff' : edge.branch === 'false' || edge.branch === 'rejected' ? '#ef4444' : edge.branch === 'true' || edge.branch === 'approved' ? '#10b981' : '#3f3f46'

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
                    <path d={pathD} fill="none" stroke="transparent" strokeWidth={16} />
                    <path
                      d={pathD}
                      fill="none"
                      stroke={strokeColor}
                      strokeWidth={isSelected ? 2.5 : 1.75}
                    />
                    <polygon points={arrowPts} fill={strokeColor} />
                    {edge.label && (
                      <g transform={`translate(${mid.x}, ${mid.y})`}>
                        <rect
                          x={-34}
                          y={-10}
                          width={68}
                          height={20}
                          rx={6}
                          fill="#141416"
                          stroke={strokeColor}
                        />
                        <text
                          textAnchor="middle"
                          dominantBaseline="central"
                          fill="#d4d4d8"
                          fontSize={9}
                          fontWeight={500}
                        >
                          {edge.label}
                        </text>
                      </g>
                    )}
                  </g>
                )
              })}

              {/* Fio sendo puxado ao vivo pelo usuário */}
              {wireDraft && (() => {
                const src = activeWorkflow.nodes.find(n => n.id === wireDraft.fromNodeId)
                if (!src) return null
                const fromPt = getNodeOutputPort(src, cardHeights[src.id])
                const pathD = diagramEdgePath(fromPt, wireDraft.toWorld)
                return (
                  <g>
                    <path
                      d={pathD}
                      fill="none"
                      stroke="#e4e4e7"
                      strokeWidth={2}
                      strokeDasharray="5 4"
                    />
                    <circle
                      cx={wireDraft.toWorld.x}
                      cy={wireDraft.toWorld.y}
                      r={5}
                      fill="#ffffff"
                    />
                  </g>
                )
              })()}
            </svg>

            {/* ======================================================================== */}
            {/* CARDS DOS NÓS — ESTILO EXATO DO PRINT 02 DO OPENBOT                      */}
            {/* ======================================================================== */}
            {activeWorkflow.nodes.map(node => {
              const isSelected = selectedNodeId === node.id
              const isDropTarget = wireDraft?.hoveredTargetId === node.id
              const isExecutingThisNode = executingNodeId === node.id || runStates?.find(s => s.nodeId === node.id)?.status === 'running'

              const execState = runStates?.find(s => s.nodeId === node.id)
              const cardDim = getNodeCardDimensions(node.kind)
              const incomingEdges = activeWorkflow.edges.filter(e => e.targetNodeId === node.id)
              const incomingNodes = incomingEdges.map(e => activeWorkflow.nodes.find(n => n.id === e.sourceNodeId)).filter(Boolean)

              // 1. NOTA ADESIVA VISUAL LIVRE (sem card escuro, sem handlers)
              if (node.kind === 'sticky_note') {
                return (
                  <div
                    key={node.id}
                    style={{
                      left: node.position.x,
                      top: node.position.y,
                      width: cardDim.width
                    }}
                    onPointerDown={e => {
                      const target = e.target as HTMLElement
                      if (target?.closest?.('textarea, button, input')) return
                      e.stopPropagation()
                      setSelectedNodeId(node.id)
                      setSelectedEdgeId(null)
                      if (toolMode === 'hand') return
                      setDraggingNodeId(node.id)
                      dragOffsetRef.current = {
                        x: e.clientX - (node.position.x * zoom + pan.x),
                        y: e.clientY - (node.position.y * zoom + pan.y)
                      }
                    }}
                    data-node-id={node.id}
                    className="absolute pointer-events-auto select-none group"
                  >
                    <div className="relative rounded-2xl bg-[#2a2415] border border-amber-500/40 p-3 shadow-2xl transition-all hover:border-amber-400/70">
                      <div className="flex items-center justify-between pb-1.5 border-b border-amber-500/20 mb-2">
                        <div className="flex items-center gap-1.5 text-amber-400 text-xs font-semibold">
                          <StickyNote className="w-3.5 h-3.5" />
                          <span>Nota Adesiva</span>
                        </div>
                        <button
                          type="button"
                          onClick={e => {
                            e.stopPropagation()
                            handleRemoveNode(node.id)
                          }}
                          className="text-amber-500/60 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 cursor-pointer"
                          title="Remover nota"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <textarea
                        value={node.config.content || ''}
                        onChange={e => handleUpdateNodeById(node.id, { config: { ...node.config, content: e.target.value } })}
                        placeholder="Escreva anotações, lembretes ou orientações sobre este fluxo..."
                        className="w-full h-28 bg-transparent text-xs text-amber-100 placeholder-amber-500/40 resize-none focus:outline-none leading-relaxed custom-chat-scrollbar"
                      />
                    </div>
                  </div>
                )
              }

              // 2. TARJA DE TÍTULO / SEÇÃO LIVRE (sem card escuro, sem handlers, com cores)
              if (node.kind === 'text_block') {
                const color = node.config.color || 'zinc'
                const colorMap: Record<string, { bg: string; border: string; bar: string; text: string }> = {
                  zinc: { bg: 'bg-[#18181b]/95', border: 'border-zinc-700/80', bar: 'bg-zinc-400', text: 'text-zinc-100' },
                  amber: { bg: 'bg-[#261f12]/95', border: 'border-amber-600/60', bar: 'bg-amber-400', text: 'text-amber-200' },
                  emerald: { bg: 'bg-[#0f241a]/95', border: 'border-emerald-600/60', bar: 'bg-emerald-400', text: 'text-emerald-200' },
                  blue: { bg: 'bg-[#0e1d33]/95', border: 'border-blue-600/60', bar: 'bg-blue-400', text: 'text-blue-200' },
                  purple: { bg: 'bg-[#1e1333]/95', border: 'border-purple-600/60', bar: 'bg-purple-400', text: 'text-purple-200' },
                  rose: { bg: 'bg-[#29121a]/95', border: 'border-rose-600/60', bar: 'bg-rose-400', text: 'text-rose-200' },
                }
                const theme = colorMap[color] || colorMap.zinc

                return (
                  <div
                    key={node.id}
                    style={{
                      left: node.position.x,
                      top: node.position.y,
                      width: cardDim.width
                    }}
                    onPointerDown={e => {
                      const target = e.target as HTMLElement
                      if (target?.closest?.('input, button')) return
                      e.stopPropagation()
                      setSelectedNodeId(node.id)
                      setSelectedEdgeId(null)
                      if (toolMode === 'hand') return
                      setDraggingNodeId(node.id)
                      dragOffsetRef.current = {
                        x: e.clientX - (node.position.x * zoom + pan.x),
                        y: e.clientY - (node.position.y * zoom + pan.y)
                      }
                    }}
                    data-node-id={node.id}
                    className="absolute pointer-events-auto select-none group"
                  >
                    <div className={`relative rounded-xl ${theme.bg} ${theme.border} border shadow-lg pl-3 pr-2 py-2 flex items-center gap-2 backdrop-blur-md`}>
                      <div className={`w-1 h-5 rounded-full ${theme.bar} shrink-0`} />
                      <input
                        type="text"
                        value={node.label || ''}
                        onChange={e => handleUpdateNodeById(node.id, { label: e.target.value })}
                        placeholder="Título da Seção..."
                        className={`w-full bg-transparent text-xs font-bold ${theme.text} placeholder-zinc-500 focus:outline-none`}
                      />
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        {(['zinc', 'amber', 'emerald', 'blue', 'purple', 'rose'] as const).map(c => (
                          <button
                            key={c}
                            type="button"
                            onClick={e => {
                              e.stopPropagation()
                              handleUpdateNodeById(node.id, { config: { ...node.config, color: c } })
                            }}
                            className={`w-2.5 h-2.5 rounded-full cursor-pointer hover:scale-125 transition-transform ${
                              c === 'zinc' ? 'bg-zinc-400' :
                              c === 'amber' ? 'bg-amber-400' :
                              c === 'emerald' ? 'bg-emerald-400' :
                              c === 'blue' ? 'bg-blue-400' :
                              c === 'purple' ? 'bg-purple-400' : 'bg-rose-400'
                            } ${color === c ? 'ring-2 ring-white/60' : ''}`}
                            title={`Cor ${c}`}
                          />
                        ))}
                        <button
                          type="button"
                          onClick={e => {
                            e.stopPropagation()
                            handleRemoveNode(node.id)
                          }}
                          className="text-zinc-500 hover:text-rose-400 ml-1 p-0.5 cursor-pointer"
                          title="Remover tarja de título"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                )
              }

              return (
                <div
                  key={node.id}
                  style={{
                    left: node.position.x,
                    top: node.position.y,
                    width: cardDim.width
                  }}
                  onPointerDown={e => {
                    const target = e.target as HTMLElement
                    if (target?.closest?.('input, textarea, select, button, [data-no-pan="true"]')) {
                      return
                    }
                    e.stopPropagation()
                    setSelectedNodeId(node.id)
                    setSelectedEdgeId(null)
                    if (toolMode === 'hand') return
                    setDraggingNodeId(node.id)
                    dragOffsetRef.current = {
                      x: e.clientX - (node.position.x * zoom + pan.x),
                      y: e.clientY - (node.position.y * zoom + pan.y)
                    }
                  }}
                  data-node-id={node.id}
                  className="absolute pointer-events-auto select-none group"
                >
                  {/* RÓTULO FLUTUANTE ACIMA DO CARD (ex: ⚡ Gatilho, 🤖 Agente, 🔮 LLM) */}
                  <div className="flex items-center justify-between mb-1.5 px-1 h-5">
                    <div className="flex items-center gap-1.5 text-[11px] font-medium text-zinc-400">
                      {node.kind === 'input' ? (
                        <Zap className="w-3 h-3 text-amber-400" />
                      ) : node.kind === 'read_note' ? (
                        <MessageSquare className="w-3 h-3 text-blue-400" />
                      ) : node.kind === 'llm' ? (
                        <Sparkles className="w-3 h-3 text-purple-400" />
                      ) : node.kind === 'run_agent' ? (
                        (() => {
                          const curAg = agents.find(a => a.id === node.config?.agentId)
                          return curAg?.icon ? (
                            <AgentIcon variant={curAg.icon} size={13} className="text-emerald-400 shrink-0" />
                          ) : (
                            <Bot className="w-3 h-3 text-emerald-400" />
                          )
                        })()
                      ) : node.kind === 'approval' ? (
                        <ShieldCheck className="w-3 h-3 text-orange-400" />
                      ) : node.kind === 'condition' ? (
                        <GitBranch className="w-3 h-3 text-purple-400" />
                      ) : node.kind === 'create_task' ? (
                        <ListTodo className="w-3 h-3 text-cyan-400" />
                      ) : node.kind === 'manage_properties' ? (
                        <Sliders className="w-3 h-3 text-pink-400" />
                      ) : (
                        <Send className="w-3 h-3 text-blue-400" />
                      )}
                      <span>{node.label || NODE_META[node.kind]?.label || 'Etapa'}</span>
                      {execState && (
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-md font-medium ${execState.status === 'completed' ? 'text-emerald-400 bg-emerald-950/40' : execState.status === 'failed' ? 'text-rose-400 bg-rose-950/40' : execState.status === 'skipped' || execState.status === 'pending' ? 'text-zinc-500 bg-zinc-900' : 'text-amber-400 bg-amber-950/40'}`}>
                          {({ completed: 'Concluído', failed: 'Falhou', running: 'Executando', pending: 'Não executado', skipped: 'Ignorado', waiting_approval: 'Aguardando aprovação' } as Record<string, string>)[execState.status] || execState.status}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onPointerDown={e => e.stopPropagation()}
                        onClick={e => {
                          e.stopPropagation()
                          setSelectedNodeId(node.id)
                          setInspectorOpen(true)
                        }}
                        className="text-[10px] text-zinc-500 hover:text-zinc-200 px-1 cursor-pointer"
                        title="Detalhes do nó"
                      >
                        •••
                      </button>
                      <button
                        type="button"
                        onPointerDown={e => e.stopPropagation()}
                        onClick={e => {
                          e.stopPropagation()
                          handleRemoveNode(node.id)
                        }}
                        className="text-zinc-500 hover:text-rose-400 p-0.5 cursor-pointer"
                        title="Remover nó"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  {/* CORPO DO CARD ESCURO (#141416) */}
                  <div
                    ref={el => {
                      if (el) {
                        const h = el.offsetHeight
                        if (h && cardHeights[node.id] !== h) {
                          setCardHeights(prev => ({ ...prev, [node.id]: h }))
                        }
                      }
                    }}
                    className={`relative rounded-2xl bg-[#141416] border p-3.5 shadow-2xl transition-all ${
                      isSelected
                        ? 'border-zinc-500 ring-1 ring-zinc-500/30'
                        : isDropTarget
                        ? 'border-white ring-2 ring-white/20'
                        : 'border-zinc-800/90 hover:border-zinc-700/80'
                    }`}
                  >
                    {/* PORTA DE ENTRADA CENTRALIZADA À ESQUERDA NO CORPO DO CARD */}
                    {node.kind !== 'input' && (
                      <div
                        data-handle="input"
                        onPointerUp={e => {
                          if (wireDraft && wireDraft.fromNodeId !== node.id) {
                            e.stopPropagation()
                            completeWireConnection(wireDraft.fromNodeId, node.id)
                            setWireDraft(null)
                          }
                        }}
                        onPointerEnter={() => {
                          if (wireDraft && wireDraft.fromNodeId !== node.id) {
                            setWireDraft(prev => prev ? {
                              ...prev,
                              hoveredTargetId: node.id,
                              toWorld: getNodeInputPort(node, cardHeights[node.id])
                            } : null)
                          }
                        }}
                        className={`absolute -left-3.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full flex items-center justify-center transition-all z-20 cursor-pointer ${
                          isDropTarget
                            ? 'bg-emerald-500 ring-4 ring-emerald-500/40 scale-125 border-white'
                            : 'bg-[#141416] border border-zinc-700 hover:border-emerald-400 group-hover:scale-110 shadow-md'
                        }`}
                        title="Entrada da etapa (Conecte o fluxo anterior aqui)"
                      >
                        <div className={`w-2 h-2 rounded-full ${isDropTarget ? 'bg-white' : 'bg-zinc-400 group-hover:bg-emerald-400'} transition-colors`} />
                      </div>
                    )}

                    {/* PORTA DE SAÍDA CENTRALIZADA À DIREITA NO CORPO DO CARD */}
                    {node.kind !== 'finish' && (
                      <button
                        type="button"
                        onPointerDown={e => {
                          e.stopPropagation()
                          const outPort = getNodeOutputPort(node, cardHeights[node.id])
                          setWireDraft({
                            fromNodeId: node.id,
                            toWorld: outPort,
                            hoveredTargetId: null
                          })
                        }}
                        className="absolute -right-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-[#141416] border border-zinc-700 hover:border-emerald-400 hover:bg-zinc-850 text-zinc-300 flex items-center justify-center cursor-crosshair z-20 transition-all hover:scale-125 shadow-md hover:ring-2 hover:ring-emerald-500/30"
                        title="Arraste para conectar ao próximo nó"
                      >
                        <div className="w-2 h-2 rounded-full bg-zinc-300 group-hover:bg-emerald-400 transition-colors" />
                      </button>
                    )}
                    {/* CARD 1: GATILHO INDEPENDENTE (Manual, Agendamento, Tarefa, Nota) */}
                    {node.kind === 'input' && (
                      <div className="space-y-3" onPointerDown={e => e.stopPropagation()}>
                        <div className="bg-[#1c1c1f] border border-zinc-800/80 rounded-xl p-1">
                          <CustomSelect
                            value={node.config.triggerType || 'manual'}
                            onChange={newType => {
                              const nextIso = newType === 'schedule'
                                ? computeWorkflowNextRunISO(
                                    node.config.scheduleFrequency || 'daily',
                                    node.config.scheduleTime || '09:00',
                                    node.config.scheduleDays
                                  )
                                : undefined
                              handleUpdateNodeById(node.id, {
                                config: {
                                  ...node.config,
                                  triggerType: newType as any,
                                  nextRunAt: nextIso,
                                  lastOutput: undefined, // LIMPA RESULTADO DO TESTE ANTERIOR
                                  lastExecutedAt: undefined
                                }
                              })
                            }}
                            options={[
                              { value: 'manual', label: 'Manual (Ao Executar)' },
                              { value: 'schedule', label: 'Agendamento Programado' },
                              { value: 'task_event', label: 'Ao Criar/Alterar Tarefa' },
                              { value: 'note_event', label: 'Ao Alterar Nota' },
                            ]}
                            icon={
                              <span className="w-5 h-5 rounded-md bg-amber-500/15 text-amber-400 flex items-center justify-center shrink-0">
                                {node.config.triggerType === 'schedule' ? (
                                  <Calendar className="w-3.5 h-3.5" />
                                ) : node.config.triggerType === 'task_event' ? (
                                  <ListTodo className="w-3.5 h-3.5" />
                                ) : node.config.triggerType === 'note_event' ? (
                                  <FileText className="w-3.5 h-3.5" />
                                ) : (
                                  <Play className="w-3.5 h-3.5" />
                                )}
                              </span>
                            }
                            className="w-full"
                            buttonClassName="bg-transparent border-0 hover:bg-zinc-800/40 text-xs font-semibold py-1.5"
                          />
                        </div>

                        {/* Gatilho Manual */}
                        {(node.config.triggerType === 'manual' || !node.config.triggerType) && (
                          <div className="text-[11px] text-zinc-400 bg-[#1c1c1f]/80 p-2.5 rounded-xl flex items-center gap-2 border border-zinc-800/50">
                            <Play className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                            <span>Executado sob demanda. Clique no botão abaixo para iniciar o fluxo.</span>
                          </div>
                        )}

                        {/* Gatilho Agendamento */}
                        {node.config.triggerType === 'schedule' && (
                          <div className="space-y-2.5">
                            {/* Linha 1: Frequência e Horário na mesma linha sem quebras */}
                            <div className="flex items-center justify-between gap-2 text-xs bg-[#18181b] p-2 rounded-xl border border-zinc-800/80">
                              <div className="flex items-center gap-1.5 shrink-0">
                                <CustomSelect
                                  value={node.config.scheduleFrequency || 'daily'}
                                  onChange={newFreq => {
                                    const nextIso = computeWorkflowNextRunISO(
                                      newFreq as any,
                                      node.config.scheduleTime || '09:00',
                                      node.config.scheduleDays
                                    )
                                    handleUpdateNodeById(node.id, {
                                      config: { ...node.config, scheduleFrequency: newFreq as any, nextRunAt: nextIso }
                                    })
                                  }}
                                  options={[
                                    { value: 'daily', label: 'Diariamente' },
                                    { value: 'weekdays', label: 'Dias úteis' },
                                    { value: 'weekly', label: 'Semanalmente' },
                                    { value: 'monthly', label: 'Mensalmente' },
                                  ]}
                                  size="xs"
                                />
                                <span className="text-zinc-500 text-[11px]">às</span>
                              </div>
                              <CustomTimePicker
                                value={node.config.scheduleTime || '09:00'}
                                onChange={newTime => {
                                  const nextIso = computeWorkflowNextRunISO(
                                    node.config.scheduleFrequency || 'daily',
                                    newTime,
                                    node.config.scheduleDays
                                  )
                                  handleUpdateNodeById(node.id, {
                                    config: { ...node.config, scheduleTime: newTime, nextRunAt: nextIso }
                                  })
                                }}
                              />
                            </div>

                            {/* Linha 2: Próxima execução na esquerda e badge Agendado/Pausado na direita */}
                            <div className="flex items-center justify-between text-xs px-1 pt-1 border-t border-zinc-800/60">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <Clock className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                                <span className="text-[11px] text-zinc-400 truncate">
                                  Próxima: <strong className="text-zinc-200 font-medium">{formatWorkflowNextRun(node.config.nextRunAt)}</strong>
                                </span>
                              </div>

                              <button
                                type="button"
                                onClick={() => {
                                  const nextActive = activeWorkflow.active === false ? true : false
                                  onSaveWorkflow({
                                    ...activeWorkflow,
                                    active: nextActive,
                                    version: activeWorkflow.version + 1,
                                    updatedAt: Date.now()
                                  })
                                }}
                                className={`text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1.5 cursor-pointer font-medium transition-colors shrink-0 ${
                                  activeWorkflow.active !== false
                                    ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/50 hover:bg-emerald-900/50'
                                    : 'bg-zinc-800 text-zinc-400 border border-zinc-700/60 hover:bg-zinc-700/60'
                                }`}
                                title={activeWorkflow.active !== false ? 'Pausar agendamento' : 'Ativar agendamento'}
                              >
                                <span className={`w-1.5 h-1.5 rounded-full ${activeWorkflow.active !== false ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-500'}`} />
                                <span>{activeWorkflow.active !== false ? 'Agendado' : 'Pausado'}</span>
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Gatilho Tarefa */}
                        {node.config.triggerType === 'task_event' && (
                          <div className="space-y-2 text-xs">
                            <CustomSelect
                              value={node.config.eventType || 'task_created'}
                              onChange={newEvt => handleUpdateNodeById(node.id, { config: { ...node.config, eventType: newEvt } })}
                              options={[
                                { value: 'task_created', label: 'Ao Criar Nova Tarefa' },
                                { value: 'task_completed', label: 'Ao Concluir Tarefa' },
                                { value: 'task_moved', label: 'Ao Mover de Status/Coluna' },
                              ]}
                              size="xs"
                            />
                            {taskBoards && taskBoards.length > 0 && (
                              <CustomSelect
                                value={node.config.boardId || ''}
                                onChange={newBoard => handleUpdateNodeById(node.id, { config: { ...node.config, boardId: newBoard } })}
                                options={[
                                  { value: '', label: 'Todos os Quadros e Grupos' },
                                  ...taskBoards.map(b => ({ value: b.id, label: `Quadro: ${b.name}` }))
                                ]}
                                size="xs"
                              />
                            )}
                            <div className="text-[10.5px] text-amber-400/90 bg-amber-950/20 border border-amber-800/30 p-2 rounded-xl flex items-center gap-2">
                              <Zap className="w-3 h-3 text-amber-400 shrink-0" />
                              <span>Monitorando tarefas do cofre em tempo real.</span>
                            </div>
                          </div>
                        )}

                        {/* Gatilho Nota */}
                        {node.config.triggerType === 'note_event' && (
                          <div className="space-y-2 text-xs">
                            <CustomSelect
                              value={node.config.eventType || 'note_created'}
                              onChange={newEvt => handleUpdateNodeById(node.id, { config: { ...node.config, eventType: newEvt } })}
                              options={[
                                { value: 'note_created', label: 'Ao Criar Nova Nota' },
                                { value: 'note_modified', label: 'Ao Editar / Salvar Nota' },
                              ]}
                              size="xs"
                            />
                            <CustomSelect
                              value={node.config.targetFolder || ''}
                              onChange={newFolder => handleUpdateNodeById(node.id, { config: { ...node.config, targetFolder: newFolder } })}
                              options={[
                                { value: '', label: 'Todo o Cofre' },
                                ...folders.map(f => ({ value: f, label: `📁 ${f}` }))
                              ]}
                              size="xs"
                            />
                            <div className="text-[10.5px] text-blue-400/90 bg-blue-950/20 border border-blue-800/30 p-2 rounded-xl flex items-center gap-2">
                              <FileText className="w-3 h-3 text-blue-400 shrink-0" />
                              <span>Monitorando arquivos do cofre em tempo real.</span>
                            </div>
                          </div>
                        )}

                        <button
                          type="button"
                          disabled={isExecuting || isExecutingThisNode}
                          onClick={() => {
                            if (node.config.triggerType === 'manual' || !node.config.triggerType) {
                              handleStartRun(false)
                            } else {
                              handleExecuteSingleNode(node)
                            }
                          }}
                          className="w-full py-2 rounded-xl bg-zinc-100 hover:bg-white text-zinc-950 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-sm active:scale-95 disabled:opacity-50"
                        >
                          <Play className={`w-3.5 h-3.5 fill-current ${isExecutingThisNode || isExecuting ? 'animate-spin' : ''}`} />
                          <span>
                            {isExecutingThisNode || isExecuting
                              ? 'Executando...'
                              : node.config.triggerType === 'manual' || !node.config.triggerType
                              ? 'Executar agora (iniciar fluxo)'
                              : 'Testar gatilho'}
                          </span>
                        </button>

                        <ResultField
                          output={node.config.lastOutput}
                          isRunning={isExecutingThisNode}
                          lastExecutedAt={node.config.lastExecutedAt}
                          onClear={() => handleUpdateNodeById(node.id, { config: { ...node.config, lastOutput: undefined, lastExecutedAt: undefined } })}
                        />
                      </div>
                    )}

                    {/* CARD 2: AGENTE (Sem modelo LLM duplicado + Detecção de nó anterior + Importar do cofre) */}
                    {node.kind === 'run_agent' && (
                      <div className="space-y-2.5" onPointerDown={e => e.stopPropagation()}>
                        <div className="bg-[#1c1c1f] border border-zinc-800/80 rounded-xl p-2.5 space-y-2">
                          {/* Badge de Entrada Conectada */}
                          {incomingNodes.length > 0 ? (
                            <div className="flex items-center gap-1.5 text-[10.5px] text-emerald-400 bg-emerald-950/40 border border-emerald-800/30 px-2 py-1 rounded-lg">
                              <Zap className="w-3 h-3 shrink-0" />
                              <span className="truncate">
                                Entrada vinculada: {incomingNodes.map(n => n?.label || NODE_META[n!.kind]?.label).join(', ')}
                              </span>
                            </div>
                          ) : (
                            <div className="text-[10px] text-zinc-500">
                              Sem nós conectados como entrada. Você pode vincular um Prompt ou importar uma nota abaixo:
                            </div>
                          )}

                          <textarea
                            value={node.config.approvalMessage || node.config.promptTemplate || ''}
                            onChange={e =>
                              handleUpdateNodeById(node.id, {
                                config: { ...node.config, approvalMessage: e.target.value, promptTemplate: e.target.value }
                              })
                            }
                            placeholder="Diga ao agente o que fazer ou complemente as instruções..."
                            className="w-full h-16 bg-transparent text-xs text-zinc-200 placeholder-zinc-500 resize-none focus:outline-none leading-relaxed"
                          />

                          {/* Seletor de Agente Responsável */}
                          <div className="pt-1">
                            <label className="text-[10px] text-zinc-500 font-medium mb-1 block">Agente Executor</label>
                            <CustomSelect
                              value={node.config.agentId || agents[0]?.id || ''}
                              onChange={chosenId => {
                                const chosen = agents.find(a => a.id === chosenId)
                                handleUpdateNodeById(node.id, {
                                  label: chosen?.name || 'Agente',
                                  config: { ...node.config, agentId: chosenId }
                                })
                              }}
                              options={agents.map(ag => ({
                                value: ag.id,
                                label: ag.name,
                                icon: <AgentIcon variant={ag.icon} size={15} />
                              }))}
                              size="xs"
                              className="w-full"
                            />
                          </div>

                          {/* Importar Nota do Cofre (se necessário) */}
                          <div className="pt-1 border-t border-zinc-800/60">
                            <label className="text-[10px] text-zinc-500 font-medium mb-1 block">Contexto de Nota do Cofre (opcional)</label>
                            <CustomNotePicker
                              notes={notes}
                              selectedNoteId={node.config.noteId}
                              onSelect={nt => {
                                handleUpdateNodeById(node.id, {
                                  config: {
                                    ...node.config,
                                    noteId: nt?.id,
                                    noteTitle: nt?.title
                                  }
                                })
                              }}
                              placeholder="Importar nota do cofre..."
                            />
                          </div>
                        </div>

                        <button
                          type="button"
                          disabled={isExecuting || isExecutingThisNode}
                          onClick={() => handleExecuteSingleNode(node)}
                          className="w-full py-2 rounded-xl bg-zinc-700/60 hover:bg-zinc-700 text-zinc-100 font-medium text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <span>{isExecutingThisNode ? 'Executando...' : 'Executar etapa'}</span>
                          <Play className="w-3 h-3" />
                        </button>

                        <ResultField
                          output={node.config.lastOutput}
                          isRunning={isExecutingThisNode}
                          lastExecutedAt={node.config.lastOutput ? node.config.lastExecutedAt : undefined}
                          onClear={() => handleUpdateNodeById(node.id, { config: { ...node.config, lastOutput: undefined, lastExecutedAt: undefined } })}
                        />
                      </div>
                    )}

                    {/* CARD 3: LLM (Etapa direta de inteligência artificial) */}
                    {node.kind === 'llm' && (
                      <div className="space-y-2.5" onPointerDown={e => e.stopPropagation()}>
                        <div className="bg-[#1c1c1f] border border-zinc-800/80 rounded-xl p-2.5 space-y-2">
                          <textarea
                            value={node.config.promptTemplate || ''}
                            onChange={e =>
                              handleUpdateNodeById(node.id, {
                                config: { ...node.config, promptTemplate: e.target.value }
                              })
                            }
                            placeholder="Prompt e instruções da etapa LLM..."
                            className="w-full h-16 bg-transparent text-xs text-zinc-200 placeholder-zinc-500 resize-none focus:outline-none leading-relaxed"
                          />

                          <div className="flex items-center justify-between gap-1 pt-1">
                            <div className="flex-1 min-w-0">
                              <CustomSelect
                                value={node.config.model || 'openai/gpt-4o'}
                                onChange={chosenModel =>
                                  handleUpdateNodeById(node.id, {
                                    config: { ...node.config, model: chosenModel }
                                  })
                                }
                                options={[
                                  { value: 'openai/gpt-4o', label: 'GPT-4o' },
                                  { value: 'google/gemini-2.5-flash', label: 'Gemini 2.5' },
                                  { value: 'google/gemini-2.5-pro', label: 'Gemini Pro' },
                                  { value: 'anthropic/claude-3.5-sonnet', label: 'Claude 3.5' },
                                  { value: 'deepseek/deepseek-chat', label: 'DeepSeek V3' }
                                ]}
                                size="xs"
                                icon={<Sparkles className="w-3 h-3 text-purple-400" />}
                              />
                            </div>

                            <div className="shrink-0 max-w-[130px]">
                              <CustomSelect
                                value={node.config.reasoning || 'low'}
                                onChange={r =>
                                  handleUpdateNodeById(node.id, {
                                    config: { ...node.config, reasoning: r as any }
                                  })
                                }
                                options={[
                                  { value: 'low', label: 'Raciocínio Baixo' },
                                  { value: 'medium', label: 'Raciocínio Médio' },
                                  { value: 'high', label: 'Raciocínio Alto' }
                                ]}
                                size="xs"
                                icon={<Sliders className="w-3 h-3 text-zinc-500" />}
                              />
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          disabled={isExecuting || isExecutingThisNode}
                          onClick={() => handleExecuteSingleNode(node)}
                          className="w-full py-2 rounded-xl bg-purple-900/40 hover:bg-purple-900/60 text-purple-200 font-medium text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer border border-purple-800/40"
                        >
                          <span>{isExecutingThisNode ? 'Processando LLM...' : 'Executar etapa LLM'}</span>
                          <Play className="w-3 h-3" />
                        </button>

                        <ResultField
                          output={node.config.lastOutput}
                          isRunning={isExecutingThisNode}
                          lastExecutedAt={node.config.lastOutput ? node.config.lastExecutedAt : undefined}
                          onClear={() => handleUpdateNodeById(node.id, { config: { ...node.config, lastOutput: undefined, lastExecutedAt: undefined } })}
                        />
                      </div>
                    )}

                    {/* CARD 4: PROMPT (Entrada de texto ou nota do cofre) */}
                    {node.kind === 'read_note' && (
                      <div className="space-y-2.5" onPointerDown={e => e.stopPropagation()}>
                        <div className="bg-[#1c1c1f] border border-zinc-800/80 rounded-xl p-2.5 space-y-2">
                          <div className="flex items-center gap-2 border-b border-zinc-800 pb-1.5 text-[10.5px]">
                            <button
                              type="button"
                              onClick={() => setActiveTabPrompt(prev => ({ ...prev, [node.id]: 'text' }))}
                              className={`px-2 py-0.5 rounded cursor-pointer ${
                                (activeTabPrompt[node.id] || 'text') === 'text' ? 'bg-zinc-800 text-white font-medium' : 'text-zinc-500 hover:text-zinc-300'
                              }`}
                            >
                              Texto Livre
                            </button>
                            <button
                              type="button"
                              onClick={() => setActiveTabPrompt(prev => ({ ...prev, [node.id]: 'note' }))}
                              className={`px-2 py-0.5 rounded cursor-pointer ${
                                activeTabPrompt[node.id] === 'note' ? 'bg-zinc-800 text-white font-medium' : 'text-zinc-500 hover:text-zinc-300'
                              }`}
                            >
                              Nota do Cofre
                            </button>
                          </div>

                          {(activeTabPrompt[node.id] || 'text') === 'text' ? (
                            <textarea
                              value={node.config.promptTemplate || ''}
                              onChange={e =>
                                handleUpdateNodeById(node.id, {
                                  config: { ...node.config, promptTemplate: e.target.value }
                                })
                              }
                              placeholder="Digite as orientações iniciais para o fluxo..."
                              className="w-full h-16 bg-transparent text-xs text-zinc-200 placeholder-zinc-500 resize-none focus:outline-none leading-relaxed"
                            />
                          ) : (
                            <div className="py-0.5">
                              <CustomNotePicker
                                notes={notes}
                                selectedNoteId={node.config.noteId}
                                onSelect={nt => {
                                  handleUpdateNodeById(node.id, {
                                    config: {
                                      ...node.config,
                                      noteId: nt?.id,
                                      noteTitle: nt?.title
                                    }
                                  })
                                }}
                                placeholder="Selecionar nota do cofre..."
                              />
                            </div>
                          )}
                        </div>

                        <button
                          type="button"
                          disabled={isExecuting || isExecutingThisNode}
                          onClick={() => handleExecuteSingleNode(node)}
                          className="w-full py-2 rounded-xl bg-blue-900/40 hover:bg-blue-900/60 text-blue-200 font-medium text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer border border-blue-800/40"
                        >
                          <span>{isExecutingThisNode ? 'Testando...' : 'Testar prompt'}</span>
                          <Play className="w-3 h-3" />
                        </button>

                        <ResultField
                          output={node.config.lastOutput}
                          isRunning={isExecutingThisNode}
                          lastExecutedAt={node.config.lastOutput ? node.config.lastExecutedAt : undefined}
                          onClear={() => handleUpdateNodeById(node.id, { config: { ...node.config, lastOutput: undefined, lastExecutedAt: undefined } })}
                        />
                      </div>
                    )}

                    {/* CARD 5: CONDIÇÃO (Com regras avançadas e rótulos de saídas em uma linha) */}
                    {node.kind === 'condition' && (
                      <div className="space-y-2.5" onPointerDown={e => e.stopPropagation()}>
                        <div className="bg-[#1c1c1f] border border-zinc-800/80 rounded-xl p-2.5 text-xs text-zinc-300 space-y-2">
                          <div>
                            <label className="text-[10.5px] text-zinc-400 font-medium block mb-1">Tipo de Regra:</label>
                            <CustomSelect
                              value={node.config.conditionType || 'contains'}
                              onChange={cType =>
                                handleUpdateNodeById(node.id, {
                                  config: { ...node.config, conditionType: cType as any }
                                })
                              }
                              options={[
                                { value: 'ai_rule', label: 'Regra avaliada por IA' },
                                { value: 'contains', label: 'Contém palavra-chave' },
                                { value: 'not_contains', label: 'Não contém palavra-chave' },
                                { value: 'has_approval', label: 'Aprovado na etapa anterior' },
                                { value: 'status_equals', label: 'Status da tarefa é igual a...' },
                                { value: 'no_missing_fields', label: 'Sem campos pendentes' },
                                { value: 'custom', label: 'Regra personalizada' },
                              ]}
                              size="xs"
                            />
                          </div>

                          {(node.config.conditionType === 'contains' || node.config.conditionType === 'not_contains' || node.config.conditionType === 'status_equals' || node.config.conditionType === 'custom' || !node.config.conditionType) && (
                            <div className="space-y-1">
                              <label className="text-[10px] text-zinc-400 font-medium">Palavra ou Valor Esperado:</label>
                              <input
                                type="text"
                                value={node.config.rule || ''}
                                onChange={e =>
                                  handleUpdateNodeById(node.id, {
                                    config: { ...node.config, rule: e.target.value }
                                  })
                                }
                                placeholder="Ex: aprovado, urgente, concluído..."
                                className="w-full bg-[#141416] border border-zinc-800 rounded-lg px-2.5 py-1 text-xs text-zinc-200 focus:outline-none"
                              />
                            </div>
                          )}

                          {/* Rótulos das Saídas customizados e em uma linha */}
                          <div className="pt-1 space-y-1.5">
                            <div className="flex items-center justify-between text-[10px] text-zinc-500 font-medium">
                              <span>Ramos de Decisão</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <div
                                className={`flex-1 py-1.5 px-2 rounded-lg border flex items-center justify-between text-[11px] whitespace-nowrap min-w-0 transition-colors ${
                                  node.config.branchTaken === 'yes'
                                    ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-300 font-medium'
                                    : node.config.branchTaken === 'no'
                                    ? 'bg-zinc-900/40 border-zinc-800 text-zinc-500 opacity-60'
                                    : 'bg-[#141416] border-zinc-800 text-zinc-300'
                                }`}
                              >
                                <span className="truncate">{node.config.trueLabel || 'Sim (Verdadeiro)'}</span>
                                {node.config.branchTaken === 'yes' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 ml-1" />}
                              </div>

                              <div
                                className={`flex-1 py-1.5 px-2 rounded-lg border flex items-center justify-between text-[11px] whitespace-nowrap min-w-0 transition-colors ${
                                  node.config.branchTaken === 'no'
                                    ? 'bg-rose-950/40 border-rose-500/50 text-rose-300 font-medium'
                                    : node.config.branchTaken === 'yes'
                                    ? 'bg-zinc-900/40 border-zinc-800 text-zinc-500 opacity-60'
                                    : 'bg-[#141416] border-zinc-800 text-zinc-300'
                                }`}
                              >
                                <span className="truncate">{node.config.falseLabel || 'Não (Falso)'}</span>
                                {node.config.branchTaken === 'no' && <CheckCircle2 className="w-3.5 h-3.5 text-rose-400 shrink-0 ml-1" />}
                              </div>
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          disabled={isExecuting || isExecutingThisNode}
                          onClick={() => handleExecuteSingleNode(node)}
                          className="w-full py-2 rounded-xl bg-purple-900/40 hover:bg-purple-900/60 text-purple-200 font-medium text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer border border-purple-800/40"
                        >
                          <span>{isExecutingThisNode ? 'Avaliando condição...' : 'Testar condição'}</span>
                          <Play className="w-3 h-3" />
                        </button>

                        <ResultField
                          output={node.config.lastOutput}
                          isRunning={isExecutingThisNode}
                          lastExecutedAt={node.config.lastOutput ? node.config.lastExecutedAt : undefined}
                          onClear={() => handleUpdateNodeById(node.id, { config: { ...node.config, lastOutput: undefined, lastExecutedAt: undefined } })}
                        />
                      </div>
                    )}

                    {/* CARD 6: APROVAÇÃO HUMANA */}
                    {node.kind === 'approval' && (() => {
                      const isWaitingApproval =
                        execState?.status === 'waiting_approval' ||
                        activeRun?.pausedAtWorkflowNodeId === node.id

                      return (
                        <div className="space-y-2.5" onPointerDown={e => e.stopPropagation()}>
                          <div className="bg-[#1c1c1f] border border-zinc-800/80 rounded-xl p-2.5 text-xs text-zinc-300 space-y-2">
                            <label className="text-[10.5px] text-zinc-400 font-medium">Instrução de Aprovação:</label>
                            <input
                              type="text"
                              value={node.config.approvalMessage || ''}
                              onChange={e =>
                                handleUpdateNodeById(node.id, {
                                  config: { ...node.config, approvalMessage: e.target.value }
                                })
                              }
                              placeholder="Requer confirmação do usuário..."
                              className="w-full bg-[#141416] border border-zinc-800 rounded-lg px-2 py-1 text-xs text-zinc-200 focus:outline-none"
                            />

                            {isWaitingApproval ? (
                              <div className="space-y-1.5 pt-1">
                                <div className="text-[10px] text-amber-400 font-medium flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  Fluxo pausado nesta etapa aguardando sua decisão:
                                </div>
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => handleApproveNode(node.id)}
                                    className="flex-1 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                    <span>Aprovar</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleRejectNode(node.id)}
                                    className="flex-1 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-rose-300 font-medium text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer border border-zinc-700"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                    <span>Rejeitar</span>
                                  </button>
                                </div>
                              </div>
                            ) : node.config.branchTaken === 'yes' ? (
                              <div className="text-[11px] text-emerald-400 flex items-center gap-1.5 font-medium pt-1">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                Aprovado pelo usuário
                              </div>
                            ) : node.config.branchTaken === 'no' ? (
                              <div className="text-[11px] text-rose-400 flex items-center gap-1.5 font-medium pt-1">
                                <XCircle className="w-3.5 h-3.5" />
                                Rejeitado pelo usuário
                              </div>
                            ) : (
                              <div className="text-[10px] text-amber-400/90 pt-0.5">
                                Pausa o fluxo até aprovação expressa do usuário.
                              </div>
                            )}
                          </div>

                          <ResultField
                          output={node.config.lastOutput}
                          isRunning={isExecutingThisNode}
                          lastExecutedAt={node.config.lastOutput ? node.config.lastExecutedAt : undefined}
                          onClear={() => handleUpdateNodeById(node.id, { config: { ...node.config, lastOutput: undefined, lastExecutedAt: undefined } })}
                        />
                        </div>
                      )
                    })()}

                    {/* CARD: GERENCIADOR DE TAREFAS & PROPRIEDADES (COMPLETO COM IA) */}
                    {(node.kind === 'create_task' || (node.kind as string) === 'manage_properties') && (
                      <div className="space-y-2.5" onPointerDown={e => e.stopPropagation()}>
                        <div className="bg-[#1c1c1f] border border-zinc-800/80 rounded-xl p-2.5 text-xs text-zinc-300 space-y-2.5">
                          {/* 1. Destino */}
                          <div>
                            <label className="text-[10px] text-zinc-400 font-medium mb-1 block">Quadro ou Projeto de Destino:</label>
                            <CustomSelect
                              value={node.config.targetBoardId || node.config.boardId || (taskBoards[0]?.id || 'default')}
                              onChange={chosenBoard => handleUpdateNodeById(node.id, { config: { ...node.config, targetBoardId: chosenBoard, boardId: chosenBoard } })}
                              options={[
                                ...(taskBoards.length > 0 ? [] : [{ value: 'default', label: '📋 Quadro Geral' }]),
                                ...taskBoards.map(b => ({
                                  value: b.id,
                                  label: b.category === 'project' ? `📁 Projeto: ${b.name}` : `📋 Quadro: ${b.name}`
                                }))
                              ]}
                              size="xs"
                              className="w-full"
                            />
                          </div>

                          {/* 2. Modo de Operação */}
                          <div>
                            <label className="text-[10px] text-zinc-400 font-medium mb-1 block">Modo de Operação da IA:</label>
                            <CustomSelect
                              value={node.config.taskMode || 'auto_ai'}
                              onChange={mode => handleUpdateNodeById(node.id, { config: { ...node.config, taskMode: mode as any } })}
                              options={[
                                { value: 'auto_ai', label: 'IA Completa (Criar Tarefas & Metadados)' },
                                { value: 'extract_checklist', label: 'Extrair Apenas Checklist de Tarefas' },
                                { value: 'single', label: 'Criar Tarefa Única Manual' },
                                { value: 'properties_only', label: 'Apenas Extrair / Criar Propriedades' }
                              ]}
                              size="xs"
                              className="w-full"
                            />
                          </div>

                          {/* Configuração de Tarefas (se aplicável) */}
                          {node.config.taskMode !== 'properties_only' && (
                            <div className="space-y-2 pt-1 border-t border-zinc-800/60">
                              {node.config.taskMode === 'single' ? (
                                <div>
                                  <label className="text-[10px] text-zinc-400 font-medium mb-1 block">Título da Tarefa:</label>
                                  <input
                                    type="text"
                                    value={node.config.taskTitleTemplate || ''}
                                    onChange={e => handleUpdateNodeById(node.id, { config: { ...node.config, taskTitleTemplate: e.target.value } })}
                                    placeholder="Ex: Executar plano com a equipe..."
                                    className="w-full bg-[#141416] border border-zinc-800 rounded-lg px-2 py-1 text-xs text-zinc-200 focus:outline-none"
                                  />
                                </div>
                              ) : (
                                <div className="text-[10px] text-cyan-400/90 bg-cyan-950/20 border border-cyan-800/30 p-2 rounded-xl flex items-center gap-2">
                                  <Sparkles className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                                  <span>A IA extrairá e organizará as tarefas diretamente do conteúdo do fluxo.</span>
                                </div>
                              )}

                              <div>
                                <label className="text-[10px] text-zinc-400 font-medium mb-1 block">Prioridade Padrão:</label>
                                <CustomSelect
                                  value={node.config.taskPriority || 'normal'}
                                  onChange={p => handleUpdateNodeById(node.id, { config: { ...node.config, taskPriority: p } })}
                                  options={[
                                    { value: 'urgent', label: '🔴 Urgente' },
                                    { value: 'high', label: '🟠 Alta' },
                                    { value: 'normal', label: '🟡 Normal' },
                                    { value: 'low', label: '🔵 Baixa' }
                                  ]}
                                  size="xs"
                                  className="w-full"
                                />
                              </div>
                            </div>
                          )}

                          {/* Configuração de Propriedade da IA (se auto_ai ou properties_only) */}
                          {(node.config.taskMode === 'auto_ai' || node.config.taskMode === 'properties_only') && (
                            <div className="space-y-2 pt-1 border-t border-zinc-800/60">
                              <label className="text-[10px] text-pink-300 font-medium flex items-center gap-1">
                                <Sliders className="w-3 h-3 text-pink-400" />
                                <span>Propriedade Customizada (Opcional):</span>
                              </label>

                              <div className="grid grid-cols-2 gap-2">
                                <input
                                  type="text"
                                  value={node.config.propertyName || ''}
                                  onChange={e => handleUpdateNodeById(node.id, { config: { ...node.config, propertyName: e.target.value } })}
                                  placeholder="Nome (ex: Prazo, Valor)"
                                  className="w-full bg-[#141416] border border-zinc-800 rounded-lg px-2 py-1 text-xs text-zinc-200 focus:outline-none"
                                />
                                <CustomSelect
                                  value={node.config.propertyType || 'text'}
                                  onChange={t => handleUpdateNodeById(node.id, { config: { ...node.config, propertyType: t } })}
                                  options={[
                                    { value: 'text', label: 'Texto' },
                                    { value: 'number', label: 'Número' },
                                    { value: 'date', label: 'Data' },
                                    { value: 'select', label: 'Seleção' }
                                  ]}
                                  size="xs"
                                  className="w-full"
                                />
                              </div>

                              <input
                                type="text"
                                value={node.config.propertyPrompt || ''}
                                onChange={e => handleUpdateNodeById(node.id, { config: { ...node.config, propertyPrompt: e.target.value } })}
                                placeholder="Instrução para a IA (ex: extrair prazo em AAAA-MM-DD)..."
                                className="w-full bg-[#141416] border border-zinc-800 rounded-lg px-2 py-1 text-[11px] text-zinc-300 placeholder-zinc-500 focus:outline-none"
                              />

                              <label className="flex items-center gap-1.5 cursor-pointer select-none text-[10.5px] text-zinc-400">
                                <input
                                  type="checkbox"
                                  checked={Boolean(node.config.autoCreateProperty ?? true)}
                                  onChange={e => handleUpdateNodeById(node.id, { config: { ...node.config, autoCreateProperty: e.target.checked } })}
                                  className="rounded border-zinc-700 bg-zinc-800 text-pink-500 focus:ring-0 cursor-pointer"
                                />
                                <span>Criar propriedade no quadro se ainda não existir</span>
                              </label>
                            </div>
                          )}
                        </div>

                        <button
                          type="button"
                          disabled={isExecuting || isExecutingThisNode}
                          onClick={() => handleExecuteSingleNode(node)}
                          className="w-full py-2 rounded-xl bg-cyan-950/40 hover:bg-cyan-950/60 text-cyan-200 font-medium text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer border border-cyan-800/40"
                        >
                          <Play className="w-3 h-3" />
                          <span>{isExecutingThisNode ? 'Gerenciando tarefas...' : 'Testar gerenciador de tarefas'}</span>
                        </button>

                        <ResultField
                          output={node.config.lastOutput}
                          isRunning={isExecutingThisNode}
                          lastExecutedAt={node.config.lastOutput ? node.config.lastExecutedAt : undefined}
                          onClear={() => handleUpdateNodeById(node.id, { config: { ...node.config, lastOutput: undefined, lastExecutedAt: undefined } })}
                        />
                      </div>
                    )}

                    {/* CARD 7: SAÍDA / ENTREGA */}
                    {(node.kind === 'deliverable' || node.kind === 'finish') && (() => {
                      // Verifica se o run atual gravou notas no cofre
                      const deliverableArtifacts = runForThisWorkflow?.artifacts || []
                      const lastDeliveredArt = deliverableArtifacts[0]
                      const isTestDelivery = runForThisWorkflow?.isTestRun && execState?.status === 'completed'

                      return (
                        <div className="space-y-2.5" onPointerDown={e => e.stopPropagation()}>
                          <div className="bg-[#1c1c1f] border border-zinc-800/80 rounded-xl p-2.5 text-xs text-zinc-300 space-y-1.5">
                            <label className="text-[10.5px] text-zinc-400 font-medium">Pasta de Destino no Cofre:</label>
                            <CustomSelect
                              value={node.config.targetFolder || 'Propostas'}
                              onChange={folder =>
                                handleUpdateNodeById(node.id, {
                                  config: { ...node.config, targetFolder: folder }
                                })
                              }
                              options={Array.from(new Set(['Propostas', 'Escopos', 'Tarefas', 'Clientes', ...folders])).map(f => ({
                                value: f,
                                label: f,
                                icon: <Folder className="w-3 h-3 text-zinc-400" />
                              }))}
                              size="sm"
                              className="w-full"
                            />
                          </div>

                          {/* Confirmação visual de nota gravada */}
                          {lastDeliveredArt && !isTestDelivery && (
                            <button
                              type="button"
                              onClick={() => lastDeliveredArt.noteId && onOpenNote?.(lastDeliveredArt.noteId)}
                              className="w-full flex items-center gap-2 text-[11px] text-emerald-200 bg-emerald-950/30 border border-emerald-900/50 hover:bg-emerald-950/50 rounded-xl p-2.5 cursor-pointer transition-colors"
                            >
                              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                              <span className="truncate text-left">
                                <span className="block font-semibold">Nota gravada no cofre</span>
                                <span className="text-emerald-300/70 text-[10px]">{lastDeliveredArt.folder}/{lastDeliveredArt.title}</span>
                              </span>
                              {lastDeliveredArt.noteId && (
                                <span className="ml-auto shrink-0 text-[10px] text-emerald-400/80 font-medium">Abrir</span>
                              )}
                            </button>
                          )}

                          {/* Modo teste: aviso sem link */}
                          {isTestDelivery && (
                            <div className="text-[10.5px] text-sky-300/90 bg-sky-950/20 border border-sky-900/40 rounded-xl p-2.5 flex items-center gap-2">
                              <FlaskConical className="w-3.5 h-3.5 shrink-0 text-sky-400" />
                              <span>Modo teste — nenhuma nota foi criada. Destino: <b>{node.config.targetFolder || 'Propostas'}</b></span>
                            </div>
                          )}

                          {execState?.status === 'failed' && (
                            <div className="text-[10.5px] text-rose-300/90 bg-rose-950/20 border border-rose-900/40 rounded-xl p-2.5 flex items-center gap-2">
                              <XCircle className="w-3.5 h-3.5 shrink-0 text-rose-400" />
                              <span>{execState.outputSummary || 'Erro ao gravar nota no cofre.'}</span>
                            </div>
                          )}

                          {isExecutingThisNode && (
                            <div className="text-[10.5px] text-blue-300/90 bg-blue-950/20 border border-blue-900/40 rounded-xl p-2.5 flex items-center gap-2">
                              <Loader2 className="w-3.5 h-3.5 shrink-0 text-blue-400 animate-spin" />
                              <span>Gravando no cofre...</span>
                            </div>
                          )}

                          {!lastDeliveredArt && !isTestDelivery && !isExecutingThisNode && execState?.status !== 'failed' && (
                            <div className="text-[10px] text-zinc-500 pt-0.5">
                              Grava a entrega gerada pelo fluxo diretamente no cofre local.
                            </div>
                          )}
                        </div>
                      )
                    })()}


                  </div>
                </div>
              )
            })}
          </div>
{/* 3. POPOVER CENTRAL "BUSCAR NÓS" (Idêntico ao Print 02!)                  */}
          {/* ======================================================================== */}
          {isAddMenuOpen && (
            <div
              ref={addMenuRef}
              onPointerDown={e => e.stopPropagation()}
              onWheel={e => e.stopPropagation()}
              className="absolute left-1/2 bottom-20 -translate-x-1/2 w-56 bg-[#141416]/98 backdrop-blur-xl border border-zinc-800/90 rounded-2xl shadow-2xl p-2 z-40 animate-in fade-in zoom-in-95 duration-100 overscroll-contain"
            >
              <div className="flex items-center gap-2 px-2.5 py-1.5 border-b border-zinc-800/80 mb-1">
                <Search className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                <input
                  type="text"
                  autoFocus
                  value={addMenuSearch}
                  onChange={e => setAddMenuSearch(e.target.value)}
                  placeholder="Buscar nós"
                  className="w-full bg-transparent text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none"
                />
              </div>

              <div
                onWheel={e => e.stopPropagation()}
                className="space-y-2 max-h-72 overflow-y-auto py-1 custom-chat-scrollbar overscroll-contain"
              >
                {addMenuGroups.map(group => {
                  const filtered = group.items.filter(it =>
                    it.label.toLowerCase().includes(addMenuSearch.toLowerCase())
                  )
                  if (filtered.length === 0) return null
                  return (
                    <div key={group.title}>
                      <div className="px-2.5 py-1 text-[10px] font-medium text-zinc-500">
                        {group.title}
                      </div>
                      {filtered.map((item, idx) => {
                        const Icon = item.icon
                        return (
                          <button
                            key={`${item.kind}_${idx}`}
                            type="button"
                            onClick={() => handleAddNodeAt(item.kind, addMenuPos)}
                            className="w-full text-left px-2.5 py-1.5 rounded-xl hover:bg-zinc-800/70 flex items-center gap-2.5 text-xs font-medium text-zinc-200 transition-colors cursor-pointer"
                          >
                            <Icon className="w-3.5 h-3.5 shrink-0" style={{ color: item.color }} />
                            <span>{item.label}</span>
                          </button>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ======================================================================== */}
          {/* 4. PÍLULA DE ZOOM NO CANTO INFERIOR DIREITO (Mover para a direita)       */}
          {/* ======================================================================== */}
          <div
            onPointerDown={e => e.stopPropagation()}
            className="absolute bottom-4 right-4 flex items-center gap-1 bg-[#141416]/95 backdrop-blur-md border border-zinc-800/90 rounded-xl px-2 py-1.5 shadow-2xl z-30 text-xs text-zinc-300"
          >
            <button
              type="button"
              onClick={() => setZoom(z => Math.max(0.4, Number((z - 0.1).toFixed(2))))}
              className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 cursor-pointer"
              title="Diminuir zoom"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="px-1.5 text-[11px] font-mono text-zinc-200 min-w-[42px] text-center">
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              onClick={() => setZoom(z => Math.min(1.8, Number((z + 0.1).toFixed(2))))}
              className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 cursor-pointer"
              title="Aumentar zoom"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <div className="w-px h-4 bg-zinc-800 mx-0.5" />
            <button
              type="button"
              onClick={handleFitView}
              className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 cursor-pointer"
              title="Ajustar à tela"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setInspectorOpen(v => !v)}
              className={`p-1 rounded hover:bg-zinc-800 cursor-pointer ${
                inspectorOpen ? 'text-white bg-zinc-800' : 'text-zinc-400 hover:text-zinc-100'
              }`}
              title="Configurações do fluxo"
            >
              <Sliders className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* ======================================================================== */}
          {/* 5. DOCK FLUTUANTE INFERIOR CENTRAL (Customizado)                */}
          <div
            onPointerDown={e => e.stopPropagation()}
            className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-[#141416]/95 backdrop-blur-xl border border-zinc-800/90 rounded-2xl p-1.5 shadow-2xl z-30"
          >
            <button
              type="button"
              onClick={() => setToolMode('pointer')}
              className={`p-2 rounded-xl transition-colors cursor-pointer ${
                toolMode === 'pointer'
                  ? 'bg-zinc-800 text-zinc-100'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
              }`}
              title="Selecionar / Mover nós (Ponteiro)"
            >
              <MousePointer className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setToolMode('hand')}
              className={`p-2 rounded-xl transition-colors cursor-pointer ${
                toolMode === 'hand'
                  ? 'bg-zinc-800 text-zinc-100'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
              }`}
              title="Mover tela (Mão)"
            >
              <Hand className="w-4 h-4" />
            </button>

            <div className="w-px h-5 bg-zinc-800 mx-0.5" />

            <button
              type="button"
              onClick={() => handleAddNodeAt('sticky_note')}
              className="p-2 rounded-xl text-amber-400 hover:bg-zinc-800/60 transition-colors cursor-pointer"
              title="Adicionar Nota Adesiva Visual"
            >
              <StickyNote className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => handleAddNodeAt('text_block')}
              className="p-2 rounded-xl text-zinc-300 hover:bg-zinc-800/60 transition-colors cursor-pointer"
              title="Adicionar Tarja de Título / Seção"
            >
              <Type className="w-4 h-4" />
            </button>

            <div className="w-px h-5 bg-zinc-800 mx-0.5" />

            <button
              type="button"
              onClick={() => {
                setAddMenuPos(null)
                setIsAddMenuOpen(v => !v)
              }}
              className="px-3.5 py-2 rounded-xl bg-zinc-100 hover:bg-white text-zinc-950 font-semibold text-xs flex items-center gap-1.5 transition-colors shadow-sm cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>Adicionar nó</span>
            </button>
          </div>
        </div>
{/* 6. INSPETOR LATERAL DEDICADO DO NÓ OU FLUXO */}
        {inspectorOpen && (
          <aside
            onWheel={e => e.stopPropagation()}
            className="w-80 bg-[#111113] border-l border-zinc-800/80 p-4 overflow-y-auto space-y-4 shrink-0 z-30 custom-chat-scrollbar overscroll-contain"
          >
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2.5">
              <span className="text-xs font-semibold text-zinc-200">
                {selectedNode ? `Configurações da Etapa: ${NODE_META[selectedNode.kind]?.label || 'Nó'}` : 'Configurações do Fluxo'}
              </span>
              <button
                type="button"
                onClick={() => setInspectorOpen(false)}
                className="text-zinc-500 hover:text-zinc-200 p-1 rounded-lg hover:bg-zinc-800/60 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {selectedNode ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-300">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: NODE_META[selectedNode.kind]?.color || '#a1a1aa' }} />
                    <span>Tipo: {NODE_META[selectedNode.kind]?.label}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveNode(selectedNode.id)}
                    className="text-[11px] text-rose-400 hover:underline cursor-pointer flex items-center gap-1"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Excluir nó</span>
                  </button>
                </div>

                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1 font-medium">Nome / Rótulo da Etapa</label>
                  <input
                    type="text"
                    value={selectedNode.label}
                    onChange={e => handleUpdateSelectedNode({ label: e.target.value })}
                    className="w-full bg-[#18181b] border border-zinc-800 rounded-xl px-3 py-1.5 text-xs text-zinc-100 focus:outline-none"
                  />
                </div>

                {/* Campos Específicos: Gatilho */}
                {selectedNode.kind === 'input' && (
                  <div className="space-y-3 pt-2 border-t border-zinc-800/70">
                    <div>
                      <label className="block text-[11px] text-zinc-400 mb-1 font-medium">Tipo de Gatilho</label>
                      <CustomSelect
                        value={selectedNode.config.triggerType || 'manual'}
                        onChange={newType => handleUpdateSelectedNode({ config: { ...selectedNode.config, triggerType: newType as any } })}
                        options={[
                          { value: 'manual', label: 'Manual (Ao Executar)' },
                          { value: 'schedule', label: 'Agendamento Programado' },
                          { value: 'task_event', label: 'Ao Criar/Alterar Tarefa' },
                          { value: 'note_event', label: 'Ao Alterar Nota' },
                        ]}
                        size="sm"
                      />
                    </div>

                    {selectedNode.config.triggerType === 'schedule' && (
                      <div className="space-y-2">
                        <div>
                          <label className="block text-[11px] text-zinc-400 mb-1 font-medium">Frequência</label>
                          <CustomSelect
                            value={selectedNode.config.scheduleFrequency || 'daily'}
                            onChange={newFreq => handleUpdateSelectedNode({ config: { ...selectedNode.config, scheduleFrequency: newFreq as any } })}
                            options={[
                              { value: 'daily', label: 'Diariamente' },
                              { value: 'weekdays', label: 'Dias úteis' },
                              { value: 'weekly', label: 'Semanalmente' },
                              { value: 'monthly', label: 'Mensalmente' },
                            ]}
                            size="sm"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-zinc-400 mb-1 font-medium">Horário de Execução</label>
                          <CustomTimePicker
                            value={selectedNode.config.scheduleTime || '09:00'}
                            onChange={newTime => handleUpdateSelectedNode({ config: { ...selectedNode.config, scheduleTime: newTime } })}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Campos Específicos: Agente */}
                {selectedNode.kind === 'run_agent' && (
                  <div className="space-y-3 pt-2 border-t border-zinc-800/70">
                    <div>
                      <label className="block text-[11px] text-zinc-400 mb-1 font-medium">Agente Atribuído</label>
                      <CustomSelect
                        value={selectedNode.config.agentId || agents[0]?.id || ''}
                        onChange={chosenId => {
                          const chosen = agents.find(a => a.id === chosenId)
                          handleUpdateSelectedNode({
                            label: chosen?.name || 'Agente',
                            config: { ...selectedNode.config, agentId: chosenId }
                          })
                        }}
                        options={agents.map(ag => ({
                          value: ag.id,
                          label: ag.name,
                          icon: <AgentIcon variant={ag.icon} size={15} />
                        }))}
                        size="sm"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-zinc-400 mb-1 font-medium">Instruções / Diretrizes</label>
                      <textarea
                        value={selectedNode.config.approvalMessage || selectedNode.config.promptTemplate || ''}
                        onChange={e => handleUpdateSelectedNode({ config: { ...selectedNode.config, approvalMessage: e.target.value, promptTemplate: e.target.value } })}
                        rows={3}
                        className="w-full bg-[#18181b] border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-100 focus:outline-none resize-none leading-relaxed"
                        placeholder="Diretrizes específicas..."
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-zinc-400 mb-1 font-medium">Nota Vinculada do Cofre</label>
                      <CustomNotePicker
                        notes={notes}
                        selectedNoteId={selectedNode.config.noteId}
                        onSelect={nt => handleUpdateSelectedNode({ config: { ...selectedNode.config, noteId: nt?.id, noteTitle: nt?.title } })}
                        placeholder="Importar nota do cofre..."
                      />
                    </div>
                  </div>
                )}

                {/* Campos Específicos: Condição */}
                {selectedNode.kind === 'condition' && (
                  <div className="space-y-3 pt-2 border-t border-zinc-800/70">
                    <div>
                      <label className="block text-[11px] text-zinc-400 mb-1 font-medium">Tipo de Regra</label>
                      <CustomSelect
                        value={selectedNode.config.conditionType || 'contains'}
                        onChange={cType => handleUpdateSelectedNode({ config: { ...selectedNode.config, conditionType: cType as any } })}
                        options={[
                          { value: 'ai_rule', label: 'Regra avaliada por IA' },
                          { value: 'contains', label: 'Contém palavra-chave' },
                          { value: 'not_contains', label: 'Não contém palavra-chave' },
                          { value: 'has_approval', label: 'Aprovado na etapa anterior' },
                          { value: 'status_equals', label: 'Status da tarefa é igual a...' },
                          { value: 'no_missing_fields', label: 'Sem campos pendentes' },
                          { value: 'custom', label: 'Regra personalizada' },
                        ]}
                        size="sm"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-zinc-400 mb-1 font-medium">Valor / Palavra Esperada</label>
                      <input
                        type="text"
                        value={selectedNode.config.rule || ''}
                        onChange={e => handleUpdateSelectedNode({ config: { ...selectedNode.config, rule: e.target.value } })}
                        placeholder="Ex: aprovado, urgente..."
                        className="w-full bg-[#18181b] border border-zinc-800 rounded-xl px-3 py-1.5 text-xs text-zinc-100"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] text-zinc-400 mb-1 font-medium">Rótulo Saída Sim</label>
                        <input
                          type="text"
                          value={selectedNode.config.trueLabel || 'Sim'}
                          onChange={e => handleUpdateSelectedNode({ config: { ...selectedNode.config, trueLabel: e.target.value } })}
                          className="w-full bg-[#18181b] border border-zinc-800 rounded-xl px-2.5 py-1 text-xs text-zinc-100"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-zinc-400 mb-1 font-medium">Rótulo Saída Não</label>
                        <input
                          type="text"
                          value={selectedNode.config.falseLabel || 'Não'}
                          onChange={e => handleUpdateSelectedNode({ config: { ...selectedNode.config, falseLabel: e.target.value } })}
                          className="w-full bg-[#18181b] border border-zinc-800 rounded-xl px-2.5 py-1 text-xs text-zinc-100"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Campos Específicos: Aprovação */}
                {selectedNode.kind === 'approval' && (
                  <div className="space-y-3 pt-2 border-t border-zinc-800/70">
                    <div>
                      <label className="block text-[11px] text-zinc-400 mb-1 font-medium">Mensagem de Solicitação</label>
                      <textarea
                        value={selectedNode.config.approvalMessage || ''}
                        onChange={e => handleUpdateSelectedNode({ config: { ...selectedNode.config, approvalMessage: e.target.value } })}
                        rows={3}
                        className="w-full bg-[#18181b] border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-100 focus:outline-none resize-none leading-relaxed"
                        placeholder="Mensagem exibida ao usuário..."
                      />
                    </div>
                  </div>
                )}

                {/* Campos Específicos: Gerenciador de Tarefas & Propriedades */}
                {(selectedNode.kind === 'create_task' || (selectedNode.kind as string) === 'manage_properties') && (
                  <div className="space-y-3 pt-2 border-t border-zinc-800/70">
                    <div>
                      <label className="block text-[11px] text-zinc-400 mb-1 font-medium">Quadro ou Projeto de Destino</label>
                      <CustomSelect
                        value={selectedNode.config.targetBoardId || selectedNode.config.boardId || (taskBoards[0]?.id || 'default')}
                        onChange={chosenBoard => handleUpdateSelectedNode({ config: { ...selectedNode.config, targetBoardId: chosenBoard, boardId: chosenBoard } })}
                        options={[
                          ...(taskBoards.length > 0 ? [] : [{ value: 'default', label: '📋 Quadro Geral' }]),
                          ...taskBoards.map(b => ({
                            value: b.id,
                            label: b.category === 'project' ? `📁 Projeto: ${b.name}` : `📋 Quadro: ${b.name}`
                          }))
                        ]}
                        size="sm"
                        className="w-full"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] text-zinc-400 mb-1 font-medium">Modo de Operação</label>
                      <CustomSelect
                        value={selectedNode.config.taskMode || 'auto_ai'}
                        onChange={mode => handleUpdateSelectedNode({ config: { ...selectedNode.config, taskMode: mode as any } })}
                        options={[
                          { value: 'auto_ai', label: 'IA Completa (Criar Tarefas & Metadados)' },
                          { value: 'extract_checklist', label: 'Extrair Apenas Checklist de Tarefas' },
                          { value: 'single', label: 'Criar Tarefa Única Manual' },
                          { value: 'properties_only', label: 'Apenas Extrair / Criar Propriedades' }
                        ]}
                        size="sm"
                        className="w-full"
                      />
                    </div>

                    {selectedNode.config.taskMode === 'single' && (
                      <div>
                        <label className="block text-[11px] text-zinc-400 mb-1 font-medium">Título da Tarefa</label>
                        <input
                          type="text"
                          value={selectedNode.config.taskTitleTemplate || ''}
                          onChange={e => handleUpdateSelectedNode({ config: { ...selectedNode.config, taskTitleTemplate: e.target.value } })}
                          placeholder="Ex: Executar plano com a equipe..."
                          className="w-full bg-[#18181b] border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-100 focus:outline-none"
                        />
                      </div>
                    )}

                    {selectedNode.config.taskMode !== 'properties_only' && (
                      <div>
                        <label className="block text-[11px] text-zinc-400 mb-1 font-medium">Prioridade Padrão</label>
                        <CustomSelect
                          value={selectedNode.config.taskPriority || 'normal'}
                          onChange={p => handleUpdateSelectedNode({ config: { ...selectedNode.config, taskPriority: p } })}
                          options={[
                            { value: 'urgent', label: '🔴 Urgente' },
                            { value: 'high', label: '🟠 Alta' },
                            { value: 'normal', label: '🟡 Normal' },
                            { value: 'low', label: '🔵 Baixa' }
                          ]}
                          size="sm"
                          className="w-full"
                        />
                      </div>
                    )}

                    <div className="pt-2 border-t border-zinc-800/60 space-y-2">
                      <label className="block text-[11px] text-pink-300 font-medium">Propriedade Customizada (Opcional)</label>
                      <input
                        type="text"
                        value={selectedNode.config.propertyName || ''}
                        onChange={e => handleUpdateSelectedNode({ config: { ...selectedNode.config, propertyName: e.target.value } })}
                        placeholder="Nome da propriedade (ex: Prazo, Valor)"
                        className="w-full bg-[#18181b] border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-100 focus:outline-none"
                      />
                      <CustomSelect
                        value={selectedNode.config.propertyType || 'text'}
                        onChange={t => handleUpdateSelectedNode({ config: { ...selectedNode.config, propertyType: t } })}
                        options={[
                          { value: 'text', label: 'Texto' },
                          { value: 'number', label: 'Número' },
                          { value: 'date', label: 'Data' },
                          { value: 'select', label: 'Seleção' }
                        ]}
                        size="sm"
                        className="w-full"
                      />
                      <input
                        type="text"
                        value={selectedNode.config.propertyPrompt || ''}
                        onChange={e => handleUpdateSelectedNode({ config: { ...selectedNode.config, propertyPrompt: e.target.value } })}
                        placeholder="Instrução para a IA (ex: extrair data em AAAA-MM-DD)..."
                        className="w-full bg-[#18181b] border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-300 focus:outline-none"
                      />
                    </div>
                  </div>
                )}

                {/* Campos Específicos: Saída */}
                {(selectedNode.kind === 'deliverable' || selectedNode.kind === 'finish') && (
                  <div className="space-y-3 pt-2 border-t border-zinc-800/70">
                    <div>
                      <label className="block text-[11px] text-zinc-400 mb-1 font-medium">Pasta de Destino no Cofre</label>
                      <CustomSelect
                        value={selectedNode.config.targetFolder || 'Propostas'}
                        onChange={folder => handleUpdateSelectedNode({ config: { ...selectedNode.config, targetFolder: folder } })}
                        options={Array.from(new Set(['Propostas', 'Escopos', 'Tarefas', 'Clientes', ...folders])).map(f => ({
                          value: f,
                          label: f,
                          icon: <Folder className="w-3 h-3 text-zinc-400" />
                        }))}
                        size="sm"
                        className="w-full"
                      />
                    </div>
                  </div>
                )}

                {/* Campos Específicos: Nota Adesiva */}
                {selectedNode.kind === 'sticky_note' && (
                  <div className="space-y-3 pt-2 border-t border-zinc-800/70">
                    <div>
                      <label className="block text-[11px] text-zinc-400 mb-1 font-medium">Conteúdo da Anotação</label>
                      <textarea
                        value={selectedNode.config.content || ''}
                        onChange={e => handleUpdateSelectedNode({ config: { ...selectedNode.config, content: e.target.value } })}
                        rows={4}
                        className="w-full bg-[#18181b] border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-100 focus:outline-none resize-none leading-relaxed"
                        placeholder="Notas e orientações..."
                      />
                    </div>
                  </div>
                )}

                {/* Botão de Testar Etapa */}
                <div className="pt-2 border-t border-zinc-800/70">
                  <button
                    type="button"
                    disabled={isExecuting || executingNodeId === selectedNode.id}
                    onClick={() => handleExecuteSingleNode(selectedNode)}
                    className="w-full py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-100 font-medium text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>{executingNodeId === selectedNode.id ? 'Testando...' : 'Testar esta etapa'}</span>
                  </button>
                  <ResultField
                    output={selectedNode.config.lastOutput}
                    isRunning={executingNodeId === selectedNode.id}
                    lastExecutedAt={selectedNode.config.lastExecutedAt}
                    onClear={() => handleUpdateSelectedNode({ config: { ...selectedNode.config, lastOutput: undefined, lastExecutedAt: undefined } })}
                  />
                </div>
              </div>
            ) : (
              /* Configurações Globais do Fluxo */
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="block text-[11px] text-zinc-400 font-medium">Nome do fluxo</label>
                  <input
                    type="text"
                    value={activeWorkflow.name}
                    onChange={e =>
                      onSaveWorkflow({ ...activeWorkflow, name: e.target.value, updatedAt: Date.now() })
                    }
                    className="w-full bg-[#18181b] border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-100 focus:outline-none"
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-[11px] text-zinc-400 font-medium">Descrição</label>
                  <textarea
                    value={activeWorkflow.description || ''}
                    onChange={e =>
                      onSaveWorkflow({ ...activeWorkflow, description: e.target.value, updatedAt: Date.now() })
                    }
                    rows={3}
                    className="w-full bg-[#18181b] border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-100 focus:outline-none resize-none leading-relaxed"
                    placeholder="Objetivo deste fluxo de trabalho..."
                  />
                </div>

                <div className="pt-3 border-t border-zinc-800 space-y-2 text-xs text-zinc-400">
                  <div className="flex items-center justify-between">
                    <span>Total de etapas (nós):</span>
                    <span className="font-mono text-zinc-200">{activeWorkflow.nodes.length}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Conexões ativas:</span>
                    <span className="font-mono text-zinc-200">{activeWorkflow.edges.length}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Versão:</span>
                    <span className="font-mono text-zinc-200">v{activeWorkflow.version}</span>
                  </div>
                </div>
              </div>
            )}

            {selectedEdgeId && (
              <div className="pt-3 border-t border-zinc-800 flex items-center justify-between">
                <span className="text-xs text-zinc-400">Conexão selecionada</span>
                <button
                  type="button"
                  onClick={() => handleRemoveEdge(selectedEdgeId)}
                  className="px-2.5 py-1 rounded-lg bg-rose-950/40 text-rose-300 text-xs cursor-pointer hover:bg-rose-900/60"
                >
                  Remover fio
                </button>
              </div>
            )}
          </aside>
        )}
      </div>
    </div>
  </div>
  )
}

