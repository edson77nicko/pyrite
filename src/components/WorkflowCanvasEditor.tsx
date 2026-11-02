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
import {
  validateWorkflowDefinition,
  computeWorkflowNextRunISO,
  formatWorkflowNextRun,
  executeWorkflowSingleNode
} from '../utils/multiAgentEngine'
import {
  snapDiagramCoord,
  diagramInputPort,
  diagramOutputPort,
  diagramEdgePath,
  diagramEdgeMidpoint,
  diagramEdgeArrow,
  diagramBounds,
  diagramConnectionProblem
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
  Shapes,
  Type,
  Search,
  Image as ImageIcon,
  FileText,
  Globe,
  Sliders,
  Check,
  CheckCircle2,
  XCircle,
  Copy,
  Clock,
  Power
} from 'lucide-react'

interface WorkflowCanvasEditorProps {
  workflows: WorkflowDefinition[]
  agents: AgentProfileVersion[]
  notes: Note[]
  folders: string[]
  selectedWorkflowId: string
  latestNodeStates?: WorkflowNodeExecution[]
  activeRun?: AgentRun
  allProjects?: ProjectContext[]
  onSelectWorkflow: (workflowId: string) => void
  onSaveWorkflow: (workflow: WorkflowDefinition) => void
  onDeleteWorkflow: (workflowId: string) => void
  onRunWorkflow: (workflow: WorkflowDefinition, isTest: boolean, prompt: string) => void
  onResumeWorkflowRun?: (run: AgentRun) => Promise<void> | void
  isExecuting: boolean
}

/**
 * Campo de exibição do resultado de execução da etapa (idêntico ao ResultField do OpenBot).
 */
const ResultField: React.FC<{
  output?: string
  isRunning?: boolean
}> = ({ output, isRunning }) => {
  const [copied, setCopied] = useState(false)
  if (!output && !isRunning) return null

  const handleCopy = () => {
    if (!output) return
    navigator.clipboard.writeText(output)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="mt-2.5 pt-2 border-t border-zinc-800/60 text-xs">
      <div className="flex items-center justify-between text-[10.5px] text-zinc-400 font-medium pb-1.5">
        <span className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          Resultado da etapa
        </span>
        {output && (
          <button
            type="button"
            onClick={handleCopy}
            className="text-zinc-500 hover:text-zinc-200 transition-colors cursor-pointer flex items-center gap-1"
            title="Copiar resultado"
          >
            {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            <span className="text-[10px]">{copied ? 'Copiado!' : 'Copiar'}</span>
          </button>
        )}
      </div>

      {isRunning ? (
        <div className="space-y-1.5 py-1">
          <div className="h-2.5 bg-zinc-800 rounded animate-pulse w-3/4" />
          <div className="h-2.5 bg-zinc-800 rounded animate-pulse w-5/6" />
          <div className="h-2.5 bg-zinc-800 rounded animate-pulse w-1/2" />
        </div>
      ) : (
        <div className="bg-[#141416] border border-zinc-800/80 rounded-lg p-2 text-zinc-300 leading-relaxed max-h-36 overflow-y-auto custom-chat-scrollbar text-[11px] whitespace-pre-wrap select-text">
          {output}
        </div>
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

const AGENT_COLORS = ['#10b981', '#2563eb', '#8b5cf6', '#f59e0b', '#ec4899', '#06b6d4']

export const WorkflowCanvasEditor: React.FC<WorkflowCanvasEditorProps> = ({
  workflows,
  agents,
  notes,
  folders,
  selectedWorkflowId,
  latestNodeStates,
  activeRun,
  allProjects = [],
  onSelectWorkflow,
  onSaveWorkflow,
  onDeleteWorkflow,
  onRunWorkflow,
  onResumeWorkflowRun,
  isExecuting
}) => {
  const activeWorkflow = workflows.find(w => w.id === selectedWorkflowId) || workflows[0]
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 80, y: 60 })
  const [toolMode, setToolMode] = useState<'pointer' | 'hand'>('pointer')
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)
  const [inspectorOpen, setInspectorOpen] = useState(false)
  const [isWorkflowMenuOpen, setIsWorkflowMenuOpen] = useState(false)
  const [isRenamingWorkflow, setIsRenamingWorkflow] = useState(false)
  const [workflowTitleDraft, setWorkflowTitleDraft] = useState('')
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false)
  const [addMenuSearch, setAddMenuSearch] = useState('')
  const [addMenuPos, setAddMenuPos] = useState<{ x: number; y: number } | null>(null)
  const [executingNodeId, setExecutingNodeId] = useState<string | null>(null)
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
        setIsWorkflowMenuOpen(false)
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
      if (workflowMenuRef.current && !workflowMenuRef.current.contains(e.target as Node)) {
        setIsWorkflowMenuOpen(false)
      }
      if (addMenuRef.current && !addMenuRef.current.contains(e.target as Node)) {
        setIsAddMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

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

  const handleFitView = () => {
    const rect = viewportRef.current?.getBoundingClientRect()
    const bounds = diagramBounds(activeWorkflow.nodes.map(n => n.position))
    if (!rect || !bounds) {
      setZoom(1)
      setPan({ x: 80, y: 60 })
      return
    }
    const nextZoom = Math.max(
      0.45,
      Math.min(1.15, Math.min((rect.width - 140) / bounds.width, (rect.height - 140) / bounds.height))
    )
    const centerX = bounds.minX + bounds.width / 2
    const centerY = bounds.minY + bounds.height / 2
    setZoom(Number(nextZoom.toFixed(2)))
    setPan({
      x: Math.round(rect.width / 2 - centerX * nextZoom),
      y: Math.round(rect.height / 2 - centerY * nextZoom)
    })
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
    setIsWorkflowMenuOpen(false)
  }

  const handleAddNodeAt = (kind: WorkflowNodeKind, worldPos?: { x: number; y: number } | null) => {
    const meta = NODE_META[kind]
    const count = activeWorkflow.nodes.length
    const pos = worldPos
      ? { x: snapDiagramCoord(worldPos.x), y: snapDiagramCoord(worldPos.y) }
      : {
          x: snapDiagramCoord(180 + (count % 3) * 340),
          y: snapDiagramCoord(160 + Math.floor(count / 3) * 220)
        }
    const newNode: WorkflowNode = {
      id: `wn_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      kind,
      label: meta.label,
      position: pos,
      config:
        kind === 'run_agent'
          ? { agentId: agents[0]?.id }
          : kind === 'llm'
          ? { model: 'gpt-4o', reasoning: 'low', promptTemplate: '' }
          : kind === 'read_note'
          ? { noteId: notes[0]?.id, noteTitle: notes[0]?.title, contextRole: 'permanent_ref' }
          : kind === 'condition'
          ? { conditionType: 'no_missing_fields' }
          : kind === 'approval'
          ? { approvalMessage: 'Revisar entregável gerado antes de salvar no cofre.' }
          : kind === 'deliverable'
          ? { targetFolder: 'Propostas', outputType: 'note' }
          : { triggerType: 'schedule', scheduleFrequency: 'daily', scheduleTime: '09:00' }
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
        branch === 'true' ? 'Verdadeiro' : branch === 'approved' ? 'Aprovado' : undefined
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
        if (n.id === wireDraft.fromNodeId || n.kind === 'input') continue
        const inPort = diagramInputPort(n.position)
        if (Math.hypot(world.x - inPort.x, world.y - inPort.y) < 42) {
          hoveredTargetId = n.id
          break
        }
      }
      setWireDraft({
        ...wireDraft,
        toWorld: hoveredTargetId
          ? diagramInputPort(activeWorkflow.nodes.find(n => n.id === hoveredTargetId)!.position)
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
    try {
      const res = await executeWorkflowSingleNode({
        node,
        workflow: activeWorkflow,
        allAgents: agents,
        allNotes: notes,
        allProjects,
        prompt: node.config.approvalMessage || node.config.promptTemplate || 'Executar etapa'
      })
      handleUpdateNodeById(node.id, {
        config: {
          ...node.config,
          lastOutput: res.output,
          branchTaken: res.branchTaken || node.config.branchTaken
        }
      })
    } catch (err: any) {
      handleUpdateNodeById(node.id, {
        config: {
          ...node.config,
          lastOutput: `Erro na execução da etapa: ${err?.message || 'Falha ao processar'}`
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

  const addMenuGroups = [
    {
      title: 'Entradas',
      items: [
        { kind: 'input' as WorkflowNodeKind, label: 'Gatilho', icon: Zap, color: '#f59e0b' },
        { kind: 'read_note' as WorkflowNodeKind, label: 'Prompt', icon: MessageSquare, color: '#3b82f6' }
      ]
    },
    {
      title: 'Etapas',
      items: [
        { kind: 'llm' as WorkflowNodeKind, label: 'LLM', icon: Sparkles, color: '#a855f7' },
        { kind: 'run_agent' as WorkflowNodeKind, label: 'Agente', icon: Bot, color: '#10b981' }
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

  return (
    <div className="flex-1 flex flex-col bg-[#09090b] overflow-hidden select-none relative">
      {/* ============================================================================ */}
      {/* 1. BARRA SUPERIOR MINIMALISTA IDÊNTICA AO PRINT 02 DO OPENBOT                */}
      {/* ============================================================================ */}
      <div className="h-11 px-4 border-b border-zinc-900/90 bg-[#09090b] flex items-center justify-between shrink-0 z-30">
        {/* Esquerda: Status Local + Setas + Nome do Fluxo */}
        <div className="flex items-center gap-3">
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
              <button
                type="button"
                onClick={() => setIsWorkflowMenuOpen(v => !v)}
                className="flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-zinc-850 text-xs font-medium text-zinc-200 cursor-pointer transition-colors"
              >
                <span>{activeWorkflow.name}</span>
                <ChevronDown className="w-3.5 h-3.5 text-zinc-500" />
              </button>
            )}

            {isWorkflowMenuOpen && (
              <div
                onMouseDown={e => e.stopPropagation()}
                className="absolute left-0 top-full mt-1.5 w-64 bg-[#141416] border border-zinc-800 rounded-2xl shadow-2xl p-1.5 z-50 animate-in fade-in zoom-in-95 duration-100"
              >
                <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                  Fluxos de trabalho
                </div>
                {workflows.map(wf => (
                  <button
                    key={wf.id}
                    type="button"
                    onClick={() => {
                      onSelectWorkflow(wf.id)
                      setIsWorkflowMenuOpen(false)
                    }}
                    className={`w-full text-left px-2.5 py-1.5 rounded-xl text-xs flex items-center justify-between cursor-pointer ${
                      wf.id === activeWorkflow.id
                        ? 'bg-zinc-800/90 text-white font-medium'
                        : 'text-zinc-300 hover:bg-zinc-800/50'
                    }`}
                  >
                    <span className="truncate">{wf.name}</span>
                    <span className="text-[10px] text-zinc-500">v{wf.version}</span>
                  </button>
                ))}
                <div className="border-t border-zinc-800/80 my-1" />
                <button
                  type="button"
                  onClick={() => {
                    setWorkflowTitleDraft(activeWorkflow.name)
                    setIsRenamingWorkflow(true)
                    setIsWorkflowMenuOpen(false)
                  }}
                  className="w-full text-left px-2.5 py-1.5 rounded-xl text-xs text-zinc-200 hover:bg-zinc-800/60 flex items-center gap-2 cursor-pointer"
                >
                  <Type className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Renomear fluxo atual</span>
                </button>
                <button
                  type="button"
                  onClick={handleCreateWorkflow}
                  className="w-full text-left px-2.5 py-1.5 rounded-xl text-xs text-zinc-200 hover:bg-zinc-800/60 flex items-center gap-2 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Novo fluxo de trabalho</span>
                </button>
                {workflows.length > 1 && (
                  <button
                    type="button"
                    onClick={() => {
                      onDeleteWorkflow(activeWorkflow.id)
                      setIsWorkflowMenuOpen(false)
                    }}
                    className="w-full text-left px-2.5 py-1.5 rounded-xl text-xs text-rose-400 hover:bg-rose-950/30 flex items-center gap-2 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Excluir fluxo atual</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Direita: Botão Pílula Branco "▷ Executar fluxo de trabalho" (Idêntico ao Print 02!) */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={isExecuting || !validation.valid}
            onClick={() => onRunWorkflow(activeWorkflow, false, 'Executar fluxo completo')}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-zinc-100 hover:bg-white text-zinc-950 font-semibold text-xs transition-all shadow-sm disabled:opacity-40 cursor-pointer"
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
            if (e.target === e.currentTarget || (e.target as HTMLElement).dataset.canvasBg === 'true') {
              setSelectedNodeId(null)
              setSelectedEdgeId(null)
              setIsWorkflowMenuOpen(false)
              setIsAddMenuOpen(false)
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
            <svg className="overflow-visible w-full h-full pointer-events-auto">
              {activeWorkflow.edges.map(edge => {
                const src = activeWorkflow.nodes.find(n => n.id === edge.sourceNodeId)
                const dst = activeWorkflow.nodes.find(n => n.id === edge.targetNodeId)
                if (!src || !dst) return null
                const fromPt = diagramOutputPort(src.position)
                const toPt = diagramInputPort(dst.position)
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
                    className="cursor-pointer group"
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
                const fromPt = diagramOutputPort(src.position)
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
              const isExecutingThisNode = executingNodeId === node.id || latestNodeStates?.find(s => s.nodeId === node.id)?.status === 'running'
              const nodeAgent =
                node.kind === 'run_agent'
                  ? agents.find(a => a.id === node.config.agentId) || agents[0]
                  : undefined
              const agentIdx = nodeAgent ? agents.findIndex(a => a.id === nodeAgent.id) : 0
              const agentColor = AGENT_COLORS[Math.max(0, agentIdx) % AGENT_COLORS.length]
              const execState = latestNodeStates?.find(s => s.nodeId === node.id)

              return (
                <div
                  key={node.id}
                  style={{
                    left: node.position.x,
                    top: node.position.y,
                    width: node.kind === 'run_agent' || node.kind === 'llm' ? 284 : 264
                  }}
                  onPointerDown={e => {
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
                  className="absolute pointer-events-auto select-none group"
                >
                  {/* RÓTULO FLUTUANTE ACIMA DO CARD (ex: ⚡ Gatilho, 🤖 Agente, 🔮 LLM) */}
                  <div className="flex items-center justify-between mb-1.5 px-1">
                    <div className="flex items-center gap-1.5 text-[11px] font-medium text-zinc-400">
                      {node.kind === 'input' ? (
                        <Zap className="w-3 h-3 text-amber-400" />
                      ) : node.kind === 'read_note' ? (
                        <MessageSquare className="w-3 h-3 text-blue-400" />
                      ) : node.kind === 'llm' ? (
                        <Sparkles className="w-3 h-3 text-purple-400" />
                      ) : node.kind === 'run_agent' ? (
                        <Bot className="w-3 h-3 text-emerald-400" />
                      ) : node.kind === 'approval' ? (
                        <ShieldCheck className="w-3 h-3 text-orange-400" />
                      ) : node.kind === 'condition' ? (
                        <GitBranch className="w-3 h-3 text-purple-400" />
                      ) : (
                        <Send className="w-3 h-3 text-blue-400" />
                      )}
                      <span>{node.label || NODE_META[node.kind].label}</span>
                      {execState && (
                        <span className={`text-[9px] px-1 py-0.5 rounded font-mono ${execState.status === 'completed' ? 'text-emerald-400 bg-emerald-950/40' : execState.status === 'failed' ? 'text-rose-400 bg-rose-950/40' : 'text-amber-400 bg-amber-950/40'}`}>
                          {execState.status}
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

                  {/* PORTAS CIRCULARES À ESQUERDA (T, Imagem, Arquivo — como no Print 02!) */}
                  {node.kind !== 'input' && (
                    <div className="absolute -left-9 top-8 flex flex-col gap-1.5 z-20">
                      <div
                        className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-serif transition-all ${
                          isDropTarget
                            ? 'bg-white text-black scale-125 shadow-lg'
                            : 'bg-[#1a1a1e] border border-zinc-700/80 text-zinc-300'
                        }`}
                        title="Entrada de Texto / Contexto"
                      >
                        T
                      </div>
                      {(node.kind === 'run_agent' || node.kind === 'llm') && (
                        <>
                          <div
                            className="w-6 h-6 rounded-full bg-[#1a1a1e] border border-zinc-800 text-zinc-500 flex items-center justify-center"
                            title="Entrada de Imagem"
                          >
                            <ImageIcon className="w-3 h-3" />
                          </div>
                          <div
                            className="w-6 h-6 rounded-full bg-[#1a1a1e] border border-zinc-800 text-zinc-500 flex items-center justify-center"
                            title="Entrada de Arquivo / Nota"
                          >
                            <FileText className="w-3 h-3" />
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {/* PORTA CIRCULAR À DIREITA (Arraste para conectar ao próximo nó!) */}
                  {node.kind !== 'finish' && (
                    <button
                      type="button"
                      onPointerDown={e => {
                        e.stopPropagation()
                        const outPort = diagramOutputPort(node.position, node.kind === 'run_agent' || node.kind === 'llm' ? 284 : 264)
                        setWireDraft({
                          fromNodeId: node.id,
                          toWorld: outPort,
                          hoveredTargetId: null
                        })
                      }}
                      className="absolute -right-9 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-[#1a1a1e] border border-zinc-700/80 hover:border-white hover:bg-zinc-800 text-zinc-300 text-[11px] font-serif flex items-center justify-center cursor-crosshair z-20 transition-transform hover:scale-110"
                      title="Arraste para conectar ao próximo nó"
                    >
                      T
                    </button>
                  )}

                  {/* CORPO DO CARD ESCURO (#141416) */}
                  <div
                    className={`rounded-2xl bg-[#141416] border p-3.5 shadow-2xl transition-all ${
                      isSelected
                        ? 'border-zinc-500 ring-1 ring-zinc-500/30'
                        : isDropTarget
                        ? 'border-white ring-2 ring-white/20'
                        : 'border-zinc-800/90 hover:border-zinc-700/80'
                    }`}
                  >
                    {/* CARD 1: GATILHO / AGENDAMENTO (Idêntico ao Print 02!) */}
                    {node.kind === 'input' && (
                      <div className="space-y-3" onPointerDown={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between bg-[#1c1c1f] border border-zinc-800/80 rounded-xl px-3 py-2">
                          <div className="flex items-center gap-2">
                            <span className="w-5 h-5 rounded-md bg-amber-500/15 text-amber-400 flex items-center justify-center">
                              <Calendar className="w-3.5 h-3.5" />
                            </span>
                            <select
                              value={node.config.triggerType || 'schedule'}
                              onChange={e => {
                                const newType = e.target.value as any
                                const nextIso = computeWorkflowNextRunISO(
                                  node.config.scheduleFrequency || 'daily',
                                  node.config.scheduleTime || '09:00',
                                  node.config.scheduleDays
                                )
                                handleUpdateNodeById(node.id, {
                                  config: { ...node.config, triggerType: newType, nextRunAt: nextIso }
                                })
                              }}
                              className="bg-transparent text-xs font-semibold text-zinc-100 outline-none cursor-pointer"
                            >
                              <option value="schedule" className="bg-[#18181b]">Agendamento</option>
                              <option value="manual" className="bg-[#18181b]">Manual (Ao Executar)</option>
                              <option value="task_event" className="bg-[#18181b]">Ao Criar Tarefa</option>
                              <option value="note_event" className="bg-[#18181b]">Ao Alterar Nota</option>
                            </select>
                          </div>
                          <ChevronDown className="w-3.5 h-3.5 text-zinc-500 pointer-events-none" />
                        </div>

                        {node.config.triggerType !== 'manual' && (
                          <div className="flex items-center gap-1.5 text-[11px] text-zinc-400 flex-wrap">
                            <select
                              value={node.config.scheduleFrequency || 'daily'}
                              onChange={e => {
                                const newFreq = e.target.value as any
                                const nextIso = computeWorkflowNextRunISO(
                                  newFreq,
                                  node.config.scheduleTime || '09:00',
                                  node.config.scheduleDays
                                )
                                handleUpdateNodeById(node.id, {
                                  config: { ...node.config, scheduleFrequency: newFreq, nextRunAt: nextIso }
                                })
                              }}
                              className="px-2 py-1 rounded-lg bg-[#1c1c1f] border border-zinc-800/80 text-zinc-200 font-medium outline-none cursor-pointer"
                            >
                              <option value="daily" className="bg-[#18181b]">Diariamente</option>
                              <option value="weekdays" className="bg-[#18181b]">Dias úteis</option>
                              <option value="weekly" className="bg-[#18181b]">Semanalmente</option>
                              <option value="monthly" className="bg-[#18181b]">Mensalmente</option>
                            </select>
                            <span>em</span>
                            <span className="px-2 py-1 rounded-lg bg-[#1c1c1f] text-zinc-200 font-medium">
                              {node.config.scheduleFrequency === 'weekdays' ? 'Dias úteis' : 'Todo dia'}
                            </span>
                            <span>às</span>
                            <input
                              type="time"
                              value={node.config.scheduleTime || '09:00'}
                              onChange={e => {
                                const newTime = e.target.value
                                const nextIso = computeWorkflowNextRunISO(
                                  node.config.scheduleFrequency || 'daily',
                                  newTime,
                                  node.config.scheduleDays
                                )
                                handleUpdateNodeById(node.id, {
                                  config: { ...node.config, scheduleTime: newTime, nextRunAt: nextIso }
                                })
                              }}
                              className="px-1.5 py-0.5 rounded-lg bg-[#1c1c1f] border border-zinc-800/80 text-zinc-200 font-medium outline-none text-[11px] cursor-pointer"
                            />
                          </div>
                        )}

                        <div className="flex items-center justify-between pt-2 border-t border-zinc-800/70 text-[11px]">
                          <div className="flex flex-col">
                            <span className="text-zinc-400 leading-tight">
                              Próxima
                              <br />
                              execução
                            </span>
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
                              className={`mt-1 text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1 cursor-pointer w-fit ${
                                activeWorkflow.active !== false
                                  ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/40'
                                  : 'bg-zinc-800 text-zinc-400'
                              }`}
                              title="Ativar/pausar execução automática em segundo plano"
                            >
                              <Power className="w-2.5 h-2.5" />
                              <span>{activeWorkflow.active !== false ? 'Agendado' : 'Pausado'}</span>
                            </button>
                          </div>
                          <span className="text-zinc-100 font-medium text-right">
                            {formatWorkflowNextRun(
                              node.config.nextRunAt ||
                              computeWorkflowNextRunISO(
                                node.config.scheduleFrequency || 'daily',
                                node.config.scheduleTime || '09:00',
                                node.config.scheduleDays
                              )
                            )}
                          </span>
                        </div>

                        <button
                          type="button"
                          disabled={isExecuting || isExecutingThisNode}
                          onClick={() => handleExecuteSingleNode(node)}
                          className="w-full py-2 rounded-xl bg-zinc-100 hover:bg-white text-zinc-950 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <span>{isExecutingThisNode ? 'Executando...' : 'Executar agora'}</span>
                          <Play className="w-3 h-3 fill-current" />
                        </button>

                        <ResultField output={node.config.lastOutput} isRunning={isExecutingThisNode} />
                      </div>
                    )}

                    {/* CARD 2: AGENTE (Idêntico ao Print 02!) */}
                    {node.kind === 'run_agent' && (
                      <div className="space-y-2.5" onPointerDown={e => e.stopPropagation()}>
                        <div className="bg-[#1c1c1f] border border-zinc-800/80 rounded-xl p-2.5 space-y-2">
                          <textarea
                            value={node.config.approvalMessage || ''}
                            onChange={e =>
                              handleUpdateNodeById(node.id, {
                                config: { ...node.config, approvalMessage: e.target.value }
                              })
                            }
                            placeholder="Diga ao agente o que fazer"
                            className="w-full h-16 bg-transparent text-xs text-zinc-200 placeholder-zinc-500 resize-none focus:outline-none leading-relaxed"
                          />

                          <div className="flex items-center justify-between gap-1 pt-1">
                            {/* Seletor de Agente inline */}
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span
                                className="w-4 h-4 rounded-md flex items-center justify-center text-[9px] text-white shrink-0 font-bold"
                                style={{ backgroundColor: agentColor }}
                              >
                                ••
                              </span>
                              <select
                                value={node.config.agentId || agents[0]?.id || ''}
                                onChange={e => {
                                  const chosen = agents.find(a => a.id === e.target.value)
                                  handleUpdateNodeById(node.id, {
                                    label: chosen?.name || 'Agente',
                                    config: { ...node.config, agentId: e.target.value }
                                  })
                                }}
                                className="bg-transparent text-[11px] font-medium text-zinc-200 focus:outline-none truncate cursor-pointer max-w-[100px]"
                              >
                                {agents.map(ag => (
                                  <option key={ag.id} value={ag.id} className="bg-[#18181b]">
                                    {ag.name}
                                  </option>
                                ))}
                              </select>
                            </div>

                            {/* Indicador / Seletor de Modelo inline */}
                            <div className="flex items-center gap-1 text-[11px] text-zinc-300 shrink-0">
                              <Globe className="w-3 h-3 text-zinc-400" />
                              <select
                                value={node.config.model || nodeAgent?.aiConfig?.model || 'GPT-6.1 Terra'}
                                onChange={e =>
                                  handleUpdateNodeById(node.id, {
                                    config: { ...node.config, model: e.target.value }
                                  })
                                }
                                className="bg-transparent text-[11px] text-zinc-300 focus:outline-none cursor-pointer max-w-[100px] truncate"
                              >
                                <option value="GPT-6.1 Terra" className="bg-[#18181b]">GPT-6.1 Terra</option>
                                <option value="google/gemini-2.5-flash" className="bg-[#18181b]">Gemini 2.5</option>
                                <option value="anthropic/claude-3.5-sonnet" className="bg-[#18181b]">Claude 3.5</option>
                                <option value="deepseek/deepseek-chat" className="bg-[#18181b]">DeepSeek V3</option>
                              </select>
                            </div>
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

                        <ResultField output={node.config.lastOutput} isRunning={isExecutingThisNode} />
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
                            <div className="flex items-center gap-1 text-[11px] text-purple-400 min-w-0">
                              <Sparkles className="w-3 h-3 shrink-0" />
                              <select
                                value={node.config.model || 'gpt-4o'}
                                onChange={e =>
                                  handleUpdateNodeById(node.id, {
                                    config: { ...node.config, model: e.target.value }
                                  })
                                }
                                className="bg-transparent text-[11px] font-medium text-zinc-200 focus:outline-none truncate cursor-pointer max-w-[100px]"
                              >
                                <option value="gpt-4o" className="bg-[#18181b]">GPT-4o</option>
                                <option value="google/gemini-2.5-flash" className="bg-[#18181b]">Gemini 2.5</option>
                                <option value="anthropic/claude-3.5-sonnet" className="bg-[#18181b]">Claude 3.5</option>
                                <option value="deepseek/deepseek-chat" className="bg-[#18181b]">DeepSeek V3</option>
                              </select>
                            </div>

                            <div className="flex items-center gap-1 text-[10.5px] text-zinc-400 shrink-0">
                              <Sliders className="w-3 h-3 text-zinc-500" />
                              <select
                                value={node.config.reasoning || 'low'}
                                onChange={e =>
                                  handleUpdateNodeById(node.id, {
                                    config: { ...node.config, reasoning: e.target.value as any }
                                  })
                                }
                                className="bg-transparent text-[10.5px] text-zinc-300 focus:outline-none cursor-pointer"
                              >
                                <option value="low" className="bg-[#18181b]">Raciocínio Baixo</option>
                                <option value="medium" className="bg-[#18181b]">Raciocínio Médio</option>
                                <option value="high" className="bg-[#18181b]">Raciocínio Alto</option>
                              </select>
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

                        <ResultField output={node.config.lastOutput} isRunning={isExecutingThisNode} />
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
                            <div className="py-1">
                              <select
                                value={node.config.noteId || ''}
                                onChange={e => {
                                  const nt = notes.find(n => n.id === e.target.value)
                                  handleUpdateNodeById(node.id, {
                                    config: {
                                      ...node.config,
                                      noteId: e.target.value,
                                      noteTitle: nt?.title
                                    }
                                  })
                                }}
                                className="w-full bg-[#141416] border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-200 focus:outline-none"
                              >
                                <option value="">Selecione uma nota...</option>
                                {notes.map(n => (
                                  <option key={n.id} value={n.id} className="bg-[#18181b]">
                                    {n.title}
                                  </option>
                                ))}
                              </select>
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

                        <ResultField output={node.config.lastOutput} isRunning={isExecutingThisNode} />
                      </div>
                    )}

                    {/* CARD 5: CONDIÇÃO (Com branches Sim e Não visuais!) */}
                    {node.kind === 'condition' && (
                      <div className="space-y-2.5" onPointerDown={e => e.stopPropagation()}>
                        <div className="bg-[#1c1c1f] border border-zinc-800/80 rounded-xl p-2.5 text-xs text-zinc-300 space-y-2">
                          <div className="space-y-1">
                            <label className="text-[10.5px] text-zinc-400 font-medium">Regra de Validação:</label>
                            <input
                              type="text"
                              value={node.config.rule || ''}
                              onChange={e =>
                                handleUpdateNodeById(node.id, {
                                  config: { ...node.config, rule: e.target.value }
                                })
                              }
                              placeholder="Ex: se contiver 'aprovado' ou valor > 1000..."
                              className="w-full bg-[#141416] border border-zinc-800 rounded-lg px-2 py-1 text-xs text-zinc-200 focus:outline-none"
                            />
                          </div>

                          <div className="flex items-center gap-1.5 pt-1">
                            <div
                              className={`flex-1 py-1.5 px-2 rounded-lg border flex items-center justify-between text-xs transition-colors ${
                                node.config.branchTaken === 'yes'
                                  ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-300 font-medium'
                                  : node.config.branchTaken === 'no'
                                  ? 'bg-zinc-900/40 border-zinc-800 text-zinc-500 opacity-50'
                                  : 'bg-[#141416] border-zinc-800 text-zinc-300'
                              }`}
                            >
                              <span>Sim (Verdadeiro)</span>
                              {node.config.branchTaken === 'yes' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                            </div>

                            <div
                              className={`flex-1 py-1.5 px-2 rounded-lg border flex items-center justify-between text-xs transition-colors ${
                                node.config.branchTaken === 'no'
                                  ? 'bg-rose-950/40 border-rose-500/50 text-rose-300 font-medium'
                                  : node.config.branchTaken === 'yes'
                                  ? 'bg-zinc-900/40 border-zinc-800 text-zinc-500 opacity-50'
                                  : 'bg-[#141416] border-zinc-800 text-zinc-300'
                              }`}
                            >
                              <span>Não (Falso)</span>
                              {node.config.branchTaken === 'no' && <CheckCircle2 className="w-3.5 h-3.5 text-rose-400" />}
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

                        <ResultField output={node.config.lastOutput} isRunning={isExecutingThisNode} />
                      </div>
                    )}

                    {/* CARD 6: APROVAÇÃO HUMANA (Com botões Aprovar e Rejeitar interativos!) */}
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

                          <ResultField output={node.config.lastOutput} isRunning={isExecutingThisNode} />
                        </div>
                      )
                    })()}

                    {/* CARD 7: SAÍDA / ENTREGA */}
                    {(node.kind === 'deliverable' || node.kind === 'finish') && (
                      <div className="space-y-2.5" onPointerDown={e => e.stopPropagation()}>
                        <div className="bg-[#1c1c1f] border border-zinc-800/80 rounded-xl p-2.5 text-xs text-zinc-300 space-y-1.5">
                          <label className="text-[10.5px] text-zinc-400 font-medium">Pasta de Destino no Cofre:</label>
                          <select
                            value={node.config.targetFolder || 'Propostas'}
                            onChange={e =>
                              handleUpdateNodeById(node.id, {
                                config: { ...node.config, targetFolder: e.target.value }
                              })
                            }
                            className="w-full bg-[#141416] border border-zinc-800 rounded-lg px-2 py-1 text-xs text-zinc-200 focus:outline-none"
                          >
                            {Array.from(new Set(['Propostas', 'Escopos', 'Tarefas', 'Clientes', ...folders])).map(f => (
                              <option key={f} value={f} className="bg-[#18181b]">
                                {f}
                              </option>
                            ))}
                          </select>
                          <div className="text-[10px] text-blue-400/90 pt-0.5">
                            Grava a entrega diretamente no cofre local.
                          </div>
                        </div>

                        <button
                          type="button"
                          disabled={isExecuting || isExecutingThisNode}
                          onClick={() => handleExecuteSingleNode(node)}
                          className="w-full py-2 rounded-xl bg-blue-900/40 hover:bg-blue-900/60 text-blue-200 font-medium text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer border border-blue-800/40"
                        >
                          <span>{isExecutingThisNode ? 'Salvando...' : 'Testar gravação no cofre'}</span>
                          <Play className="w-3 h-3" />
                        </button>

                        <ResultField output={node.config.lastOutput} isRunning={isExecutingThisNode} />
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* ======================================================================== */}
          {/* 3. POPOVER CENTRAL "BUSCAR NÓS" (Idêntico ao Print 02!)                  */}
          {/* ======================================================================== */}
          {isAddMenuOpen && (
            <div
              ref={addMenuRef}
              onPointerDown={e => e.stopPropagation()}
              className="absolute left-1/2 bottom-20 -translate-x-1/2 w-56 bg-[#141416]/98 backdrop-blur-xl border border-zinc-800/90 rounded-2xl shadow-2xl p-2 z-40 animate-in fade-in zoom-in-95 duration-100"
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

              <div className="space-y-2 max-h-72 overflow-y-auto py-1 custom-chat-scrollbar">
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
          {/* 4. PÍLULA DE ZOOM NO CANTO INFERIOR ESQUERDO (Idêntico ao Print 02!)     */}
          {/* ======================================================================== */}
          <div
            onPointerDown={e => e.stopPropagation()}
            className="absolute bottom-4 left-4 flex items-center gap-1 bg-[#141416]/95 backdrop-blur-md border border-zinc-800/90 rounded-xl px-2 py-1.5 shadow-2xl z-30 text-xs text-zinc-300"
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
          {/* 5. DOCK FLUTUANTE INFERIOR CENTRAL (Idêntico ao Print 02!)                */}
          {/* ======================================================================== */}
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
              onClick={() => handleAddNodeAt('read_note')}
              className="p-2 rounded-xl text-amber-400 hover:bg-zinc-800/60 transition-colors cursor-pointer"
              title="Adicionar nó Prompt / Nota"
            >
              <StickyNote className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => handleAddNodeAt('run_agent')}
              className="p-2 rounded-xl text-zinc-300 hover:bg-zinc-800/60 transition-colors cursor-pointer"
              title="Adicionar nó Agente"
            >
              <Shapes className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => handleAddNodeAt('llm')}
              className="p-2 rounded-xl text-zinc-300 hover:bg-zinc-800/60 transition-colors cursor-pointer"
              title="Adicionar nó LLM"
            >
              <Type className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                setAddMenuPos(null)
                setIsAddMenuOpen(v => !v)
              }}
              className="p-2 rounded-xl text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60 transition-colors cursor-pointer"
              title="Buscar nós"
            >
              <Search className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => {
                setAddMenuPos(null)
                setIsAddMenuOpen(v => !v)
              }}
              className="ml-1 px-3.5 py-2 rounded-xl bg-zinc-100 hover:bg-white text-zinc-950 font-semibold text-xs flex items-center gap-1.5 transition-colors shadow-sm cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>Adicionar nó</span>
            </button>
          </div>
        </div>

        {/* ======================================================================== */}
        {/* 6. INSPETOR LATERAL COMPLETO                                             */}
        {/* ======================================================================== */}
        {inspectorOpen && (
          <aside className="w-80 bg-[#111113] border-l border-zinc-800/80 p-4 overflow-y-auto space-y-4 shrink-0 z-30 custom-chat-scrollbar">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2.5">
              <span className="text-xs font-semibold text-zinc-200">Configurações do Fluxo</span>
              <button
                type="button"
                onClick={() => setInspectorOpen(false)}
                className="text-zinc-500 hover:text-zinc-200 p-1 rounded-lg hover:bg-zinc-800/60 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

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

            {selectedNode && (
              <div className="space-y-3 pt-3 border-t border-zinc-800">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-zinc-200">
                    Nó Selecionado: {selectedNode.label}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRemoveNode(selectedNode.id)}
                    className="text-[11px] text-rose-400 hover:underline cursor-pointer"
                  >
                    Excluir nó
                  </button>
                </div>

                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1 font-medium">Rótulo no canvas</label>
                  <input
                    type="text"
                    value={selectedNode.label}
                    onChange={e => handleUpdateSelectedNode({ label: e.target.value })}
                    className="w-full bg-[#18181b] border border-zinc-800 rounded-xl px-3 py-1.5 text-xs text-zinc-100"
                  />
                </div>

                {selectedNode.kind === 'deliverable' && (
                  <div>
                    <label className="block text-[11px] text-zinc-400 mb-1 font-medium">Pasta de Destino</label>
                    <select
                      value={selectedNode.config.targetFolder || 'Propostas'}
                      onChange={e =>
                        handleUpdateSelectedNode({
                          config: { ...selectedNode.config, targetFolder: e.target.value }
                        })
                      }
                      className="w-full bg-[#18181b] border border-zinc-800 rounded-xl px-3 py-1.5 text-xs text-zinc-100"
                    >
                      {Array.from(new Set(['Propostas', 'Escopos', 'Tarefas', 'Clientes', ...folders])).map(f => (
                        <option key={f} value={f} className="bg-[#18181b]">
                          {f}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
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
  )
}
