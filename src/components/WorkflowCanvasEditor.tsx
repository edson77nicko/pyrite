import React, { useState, useRef } from 'react'
import type {
  AgentProfileVersion,
  WorkflowDefinition,
  WorkflowEdge,
  WorkflowNode,
  WorkflowNodeExecution,
  WorkflowNodeKind
} from '../types/agents'
import type { Note } from '../types'
import { validateWorkflowDefinition } from '../utils/multiAgentEngine'
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
  Map
} from 'lucide-react'

interface WorkflowCanvasEditorProps {
  workflows: WorkflowDefinition[]
  agents: AgentProfileVersion[]
  notes: Note[]
  folders: string[]
  selectedWorkflowId: string
  latestNodeStates?: WorkflowNodeExecution[]
  onSelectWorkflow: (workflowId: string) => void
  onSaveWorkflow: (workflow: WorkflowDefinition) => void
  onDeleteWorkflow: (workflowId: string) => void
  onRunWorkflow: (workflow: WorkflowDefinition, isTest: boolean, prompt: string) => void
  isExecuting: boolean
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

const AGENT_COLORS = ['#2563eb', '#10b981', '#8b5cf6', '#f59e0b', '#ec4899', '#06b6d4']

export const WorkflowCanvasEditor: React.FC<WorkflowCanvasEditorProps> = ({
  workflows,
  agents,
  notes,
  folders,
  selectedWorkflowId,
  latestNodeStates,
  onSelectWorkflow,
  onSaveWorkflow,
  onDeleteWorkflow,
  onRunWorkflow,
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
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false)
  const [addMenuSearch, setAddMenuSearch] = useState('')
  const [addMenuPos, setAddMenuPos] = useState<{ x: number; y: number } | null>(null)
  const [testPrompt] = useState(
    'Elabore proposta comercial para o cliente usando o modelo e catálogo vinculados.'
  )

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
          position: { x: 160, y: 180 },
          config: {}
        },
        {
          id: nAgId,
          kind: 'run_agent',
          label: firstAgent?.name || 'Agente',
          position: { x: 580, y: 180 },
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
          : kind === 'read_note'
          ? { noteId: notes[0]?.id, noteTitle: notes[0]?.title, contextRole: 'permanent_ref' }
          : kind === 'condition'
          ? { conditionType: 'no_missing_fields' }
          : kind === 'deliverable'
          ? { targetFolder: 'Propostas', outputType: 'note', namingPattern: 'Entrega - {cliente}' }
          : kind === 'approval'
          ? { approvalMessage: 'Confirme para prosseguir.' }
          : {}
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
        { kind: 'run_agent' as WorkflowNodeKind, label: 'LLM', icon: Sparkles, color: '#a855f7' },
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
      {/* BARRA SUPERIOR MINIMALISTA IDÊNTICA AO PRINT 02 DO OPENBOT */}
      <div className="h-11 px-4 border-b border-zinc-900/90 bg-[#09090b] flex items-center justify-between shrink-0 z-30">
        {/* Esquerda: Setas <- -> + Seletor de Fluxo de Trabalho */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 text-zinc-500">
            <button
              type="button"
              onClick={() => {
                const idx = workflows.findIndex(w => w.id === activeWorkflow.id)
                if (idx > 0) onSelectWorkflow(workflows[idx - 1].id)
              }}
              className="p-1 rounded hover:bg-zinc-800/60 hover:text-zinc-300 cursor-pointer"
              title="Fluxo anterior"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => {
                const idx = workflows.findIndex(w => w.id === activeWorkflow.id)
                if (idx >= 0 && idx < workflows.length - 1) onSelectWorkflow(workflows[idx + 1].id)
              }}
              className="p-1 rounded hover:bg-zinc-800/60 hover:text-zinc-300 cursor-pointer"
              title="Próximo fluxo"
            >
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => setIsWorkflowMenuOpen(v => !v)}
              className="flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-zinc-900 text-xs font-medium text-zinc-200 cursor-pointer"
            >
              <span>{activeWorkflow.name}</span>
              <ChevronDown className="w-3.5 h-3.5 text-zinc-500" />
            </button>

            {isWorkflowMenuOpen && (
              <div
                onMouseDown={e => e.stopPropagation()}
                className="absolute left-0 top-full mt-1.5 w-64 bg-[#141416] border border-zinc-800 rounded-2xl shadow-2xl p-1.5 z-50"
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
            onClick={() => onRunWorkflow(activeWorkflow, false, testPrompt)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-zinc-100 hover:bg-white text-zinc-950 font-semibold text-xs transition-all shadow-sm disabled:opacity-40 cursor-pointer"
          >
            <Play className="w-3 h-3 fill-current" />
            <span>{isExecuting ? 'Executando...' : 'Executar fluxo de trabalho'}</span>
          </button>
        </div>
      </div>

      {/* ÁREA DO CANVAS INFINITO COM DOT-GRID ESCURO (#09090b) */}
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
          {/* Camada Transformável */}
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
                const strokeColor = isSelected ? '#ffffff' : '#3f3f46'

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
                        >
                          {edge.label}
                        </text>
                      </g>
                    )}
                  </g>
                )
              })}

              {/* Fio sendo puxado ao vivo */}
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

            {/* CARDS DOS NÓS — ESTILO EXATO DO PRINT 02 DO OPENBOT */}
            {activeWorkflow.nodes.map(node => {
              const isSelected = selectedNodeId === node.id
              const isDropTarget = wireDraft?.hoveredTargetId === node.id
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
                    width: node.kind === 'run_agent' ? 284 : 264
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
                  {/* RÓTULO FLUTUANTE ACIMA DO CARD (ex: ⚡ Gatilho, 🤖 Agente) */}
                  <div className="flex items-center justify-between mb-1.5 px-1">
                    <div className="flex items-center gap-1.5 text-[11px] font-medium text-zinc-400">
                      {node.kind === 'input' ? (
                        <Zap className="w-3 h-3 text-zinc-400" />
                      ) : node.kind === 'run_agent' ? (
                        <Bot className="w-3 h-3 text-zinc-400" />
                      ) : node.kind === 'approval' ? (
                        <ShieldCheck className="w-3 h-3 text-zinc-400" />
                      ) : node.kind === 'condition' ? (
                        <GitBranch className="w-3 h-3 text-zinc-400" />
                      ) : (
                        <Send className="w-3 h-3 text-zinc-400" />
                      )}
                      <span>{node.label || NODE_META[node.kind].label}</span>
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

                  {/* PORTAS CIRCULARES À ESQUERDA (wfn-port: T, Image, File — como no Print 02!) */}
                  {node.kind !== 'input' && (
                    <div className="absolute -left-9 top-9 flex flex-col gap-1.5 z-20">
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
                      {node.kind === 'run_agent' && (
                        <>
                          <div
                            className="w-6 h-6 rounded-full bg-[#1a1a1e] border border-zinc-800 text-zinc-400 flex items-center justify-center"
                            title="Entrada de Imagem"
                          >
                            <ImageIcon className="w-3 h-3" />
                          </div>
                          <div
                            className="w-6 h-6 rounded-full bg-[#1a1a1e] border border-zinc-800 text-zinc-400 flex items-center justify-center"
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
                        const outPort = diagramOutputPort(node.position)
                        setWireDraft({
                          fromNodeId: node.id,
                          toWorld: outPort,
                          hoveredTargetId: null
                        })
                      }}
                      className="absolute -right-9 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-[#1a1a1e] border border-zinc-700/80 hover:border-white hover:bg-zinc-800 text-zinc-300 text-[11px] font-serif flex items-center justify-center cursor-crosshair z-20 transition-transform hover:scale-110"
                      title="Arraste para conectar a outro nó"
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
                      <div className="space-y-3">
                        <div className="flex items-center justify-between bg-[#1c1c1f] border border-zinc-800/80 rounded-xl px-3 py-2">
                          <div className="flex items-center gap-2">
                            <span className="w-5 h-5 rounded-md bg-amber-500/15 text-amber-400 flex items-center justify-center">
                              <Calendar className="w-3.5 h-3.5" />
                            </span>
                            <span className="text-xs font-semibold text-zinc-100">Agendamento</span>
                          </div>
                          <ChevronDown className="w-3.5 h-3.5 text-zinc-500" />
                        </div>

                        <div className="flex items-center gap-1.5 text-[11px] text-zinc-400 flex-wrap">
                          <span className="px-2 py-1 rounded-lg bg-[#1c1c1f] text-zinc-200 font-medium">
                            Diariamente
                          </span>
                          <span>em</span>
                          <span className="px-2 py-1 rounded-lg bg-[#1c1c1f] text-zinc-200 font-medium">
                            Todo ...
                          </span>
                          <span>às</span>
                          <span className="px-2 py-1 rounded-lg bg-[#1c1c1f] text-zinc-200 font-medium">
                            09:00
                          </span>
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t border-zinc-800/70 text-[11px]">
                          <span className="text-zinc-400 leading-tight">
                            Próxima
                            <br />
                            execução
                          </span>
                          <span className="text-zinc-100 font-medium">seg., 2 de nov., 09:00</span>
                        </div>

                        <button
                          type="button"
                          disabled={isExecuting}
                          onPointerDown={e => e.stopPropagation()}
                          onClick={e => {
                            e.stopPropagation()
                            onRunWorkflow(activeWorkflow, false, testPrompt)
                          }}
                          className="w-full py-2 rounded-xl bg-zinc-100 hover:bg-white text-zinc-950 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <span>Executar agora</span>
                          <Play className="w-3 h-3 fill-current" />
                        </button>
                      </div>
                    )}

                    {/* CARD 2: AGENTE (Idêntico ao Print 02!) */}
                    {node.kind === 'run_agent' && (
                      <div className="space-y-2.5">
                        <div
                          onPointerDown={e => e.stopPropagation()}
                          className="bg-[#1c1c1f] border border-zinc-800/80 rounded-xl p-2.5 space-y-2"
                        >
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
                                className="bg-transparent text-[11px] font-medium text-zinc-200 focus:outline-none truncate cursor-pointer"
                              >
                                {agents.map(ag => (
                                  <option key={ag.id} value={ag.id} className="bg-[#18181b]">
                                    {ag.name}
                                  </option>
                                ))}
                              </select>
                            </div>

                            {/* Indicador de Modelo inline */}
                            <div className="flex items-center gap-1 text-[11px] text-zinc-300 shrink-0">
                              <Globe className="w-3 h-3 text-zinc-400" />
                              <span>GPT-6.1 Terra</span>
                              <ChevronDown className="w-3 h-3 text-zinc-500" />
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          disabled={isExecuting}
                          onPointerDown={e => e.stopPropagation()}
                          onClick={e => {
                            e.stopPropagation()
                            onRunWorkflow(
                              activeWorkflow,
                              false,
                              node.config.approvalMessage || testPrompt
                            )
                          }}
                          className="w-full py-2 rounded-xl bg-zinc-700/60 hover:bg-zinc-700 text-zinc-100 font-medium text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <span>Executar etapa</span>
                          <Play className="w-3 h-3" />
                        </button>
                      </div>
                    )}

                    {/* OUTROS CARDS (Prompt/Nota, Condição, Aprovação, Saída) */}
                    {node.kind !== 'input' && node.kind !== 'run_agent' && (
                      <div className="space-y-2.5" onPointerDown={e => e.stopPropagation()}>
                        <div className="bg-[#1c1c1f] border border-zinc-800/80 rounded-xl p-2.5 text-xs text-zinc-300">
                          {node.kind === 'read_note' && (
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
                              className="w-full bg-transparent text-xs text-zinc-200 focus:outline-none"
                            >
                              {notes.map(n => (
                                <option key={n.id} value={n.id} className="bg-[#18181b]">
                                  {n.title}
                                </option>
                              ))}
                            </select>
                          )}

                          {node.kind === 'condition' && (
                            <select
                              value={node.config.conditionType || 'no_missing_fields'}
                              onChange={e =>
                                handleUpdateNodeById(node.id, {
                                  config: {
                                    ...node.config,
                                    conditionType: e.target.value as WorkflowNode['config']['conditionType']
                                  }
                                })
                              }
                              className="w-full bg-transparent text-xs text-zinc-200 focus:outline-none"
                            >
                              <option value="no_missing_fields" className="bg-[#18181b]">
                                Sem lacunas pendentes
                              </option>
                              <option value="no_price_conflicts" className="bg-[#18181b]">
                                Sem conflitos de preço
                              </option>
                              <option value="total_above_threshold" className="bg-[#18181b]">
                                Valor acima do limite
                              </option>
                            </select>
                          )}

                          {node.kind === 'approval' && (
                            <input
                              type="text"
                              value={node.config.approvalMessage || ''}
                              onChange={e =>
                                handleUpdateNodeById(node.id, {
                                  config: { ...node.config, approvalMessage: e.target.value }
                                })
                              }
                              placeholder="Mensagem de aprovação humana..."
                              className="w-full bg-transparent text-xs text-zinc-200 focus:outline-none"
                            />
                          )}

                          {(node.kind === 'deliverable' || node.kind === 'finish') && (
                            <div className="text-[11px] text-zinc-300">
                              Destino: <span className="text-zinc-100 font-medium">{node.config.targetFolder || 'Propostas'}</span>
                            </div>
                          )}
                        </div>

                        {execState && (
                          <div className="text-[10px] text-zinc-400 px-1 truncate">
                            Status: {execState.status}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* POPOVER CENTRAL "BUSCAR NÓS" (Idêntico ao Print 02!) */}
          {isAddMenuOpen && (
            <div
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

              <div className="space-y-2 max-h-72 overflow-y-auto py-1">
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

          {/* PÍLULA DE ZOOM NO CANTO INFERIOR ESQUERDO (Idêntica ao Print 02: - 100% + | [ ] [map]) */}
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
              title="Abrir inspetor lateral"
            >
              <Map className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* DOCK FLUTUANTE INFERIOR CENTRAL (Idêntico ao Print 02: Pointer, Hand, Sticky, Shape, Text, Search, "+ Adicionar nó") */}
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
              title="Selecionar (Ponteiro)"
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
              title="Mover canvas (Mão)"
            >
              <Hand className="w-4 h-4" />
            </button>

            <div className="w-px h-5 bg-zinc-800 mx-0.5" />

            <button
              type="button"
              onClick={() => handleAddNodeAt('read_note')}
              className="p-2 rounded-xl text-amber-400 hover:bg-zinc-800/60 transition-colors cursor-pointer"
              title="Adicionar nota / contexto"
            >
              <StickyNote className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => handleAddNodeAt('condition')}
              className="p-2 rounded-xl text-zinc-300 hover:bg-zinc-800/60 transition-colors cursor-pointer"
              title="Adicionar condição"
            >
              <Shapes className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => handleAddNodeAt('approval')}
              className="p-2 rounded-xl text-zinc-300 hover:bg-zinc-800/60 transition-colors cursor-pointer"
              title="Adicionar etapa de aprovação"
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

        {/* INSPETOR LATERAL OPCIONAL (Fechado por padrão, abre só ao clicar em ••• ou no botão de mapa) */}
        {inspectorOpen && (
          <aside className="w-80 bg-[#111113] border-l border-zinc-800/80 p-4 overflow-y-auto space-y-4 shrink-0 z-30">
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
              <label className="block text-[11px] text-zinc-400">Nome do fluxo</label>
              <input
                type="text"
                value={activeWorkflow.name}
                onChange={e =>
                  onSaveWorkflow({ ...activeWorkflow, name: e.target.value, updatedAt: Date.now() })
                }
                className="w-full bg-[#18181b] border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-100 focus:outline-none"
              />
            </div>

            {selectedNode && (
              <div className="space-y-3 pt-3 border-t border-zinc-800">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-zinc-200">
                    Nó: {selectedNode.label}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRemoveNode(selectedNode.id)}
                    className="text-[11px] text-rose-400 hover:underline cursor-pointer"
                  >
                    Excluir
                  </button>
                </div>

                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">Rótulo</label>
                  <input
                    type="text"
                    value={selectedNode.label}
                    onChange={e => handleUpdateSelectedNode({ label: e.target.value })}
                    className="w-full bg-[#18181b] border border-zinc-800 rounded-xl px-3 py-1.5 text-xs text-zinc-100"
                  />
                </div>

                {selectedNode.kind === 'deliverable' && (
                  <div>
                    <label className="block text-[11px] text-zinc-400 mb-1">Pasta de Destino</label>
                    <select
                      value={selectedNode.config.targetFolder || 'Propostas'}
                      onChange={e =>
                        handleUpdateSelectedNode({
                          config: { ...selectedNode.config, targetFolder: e.target.value }
                        })
                      }
                      className="w-full bg-[#18181b] border border-zinc-800 rounded-xl px-3 py-1.5 text-xs text-zinc-100"
                    >
                      {Array.from(new Set(['Propostas', 'Escopos', 'Tarefas', ...folders])).map(f => (
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
                  className="px-2.5 py-1 rounded-lg bg-rose-950/40 text-rose-300 text-xs cursor-pointer"
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
