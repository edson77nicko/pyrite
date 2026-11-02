import React, { useState, useRef, useEffect, useMemo } from 'react'
import type {
  AgentProfileVersion,
  ContextRole,
  TeamDefinition,
  TeamEdge,
  TeamMemberNode
} from '../types/agents'
import {
  snapDiagramCoord,
  diagramInputPort,
  diagramOutputPort,
  diagramEdgePath,
  diagramEdgeMidpoint,
  diagramEdgeArrow,
  diagramBounds,
  diagramConnectionProblem,
  reachesInGraph
} from '../utils/openbotDiagramUtils'
import type { Note } from '../types'
import {
  Plus,
  Trash2,
  Play,
  ZoomIn,
  ZoomOut,
  Maximize2,
  X,
  Crown,
  Bot,
  ShieldCheck,
  Search,
  MousePointer,
  Hand,
  ChevronDown,
  ArrowLeft,
  ArrowRight,
  MessageSquare,
  Map,
  PanelRight,
  FileText,
  Image as ImageIcon,
  StickyNote,
  Shapes,
  Type
} from 'lucide-react'
import { CustomSelect } from './CustomSelect'

interface TeamCanvasEditorProps {
  teams: TeamDefinition[]
  agents: AgentProfileVersion[]
  notes?: Note[]
  selectedTeamId: string
  onSelectTeam: (teamId: string) => void
  onSaveTeam: (team: TeamDefinition) => void
  onDeleteTeam: (teamId: string) => void
  onRunTeam: (team: TeamDefinition, isTest: boolean, prompt: string) => void
  onCreateAgentInline?: (agent: AgentProfileVersion) => void
  onOpenAgentChat?: (agentId: string) => void
  isExecuting: boolean
}

const RELATION_META: Record<TeamEdge['relation'], { label: string; color: string }> = {
  delegates_to: { label: 'Delega subtarefa', color: '#f59e0b' },
  reviews_output: { label: 'Revisa entrega', color: '#10b981' },
  depends_on: { label: 'Depende de', color: '#3b82f6' }
}

const AGENT_COLORS = ['#2563eb', '#10b981', '#8b5cf6', '#f59e0b', '#ec4899', '#06b6d4']

export const TeamCanvasEditor: React.FC<TeamCanvasEditorProps> = ({
  teams,
  agents,
  notes: _notes = [],
  selectedTeamId,
  onSelectTeam,
  onSaveTeam,
  onDeleteTeam,
  onRunTeam,
  onOpenAgentChat,
  isExecuting
}) => {
  const activeTeam = teams.find(t => t.id === selectedTeamId) || teams[0]
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 80, y: 60 })
  const [toolMode, setToolMode] = useState<'pointer' | 'hand'>('pointer')
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)
  const [inspectorOpen, setInspectorOpen] = useState(false)
  const [isTeamMenuOpen, setIsTeamMenuOpen] = useState(false)
  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false)
  const [memberSearchQuery, setMemberSearchQuery] = useState('')
  const [connectionRelation, setConnectionRelation] = useState<TeamEdge['relation']>('delegates_to')
  const [teamPrompt, setTeamPrompt] = useState(
    'Monte proposta comercial completa, cronograma de tarefas, mapa mental de escopo e revisão de consistência para o cliente.'
  )

  // Dragging node
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null)
  const dragOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 })

  // Panning canvas
  const [isPanning, setIsPanning] = useState(false)
  const panStartRef = useRef<{ x: number; y: number; panX: number; panY: number }>({
    x: 0,
    y: 0,
    panX: 0,
    panY: 0
  })

  // Port wire dragging
  const [wireDraft, setWireDraft] = useState<{
    fromNodeId: string
    toWorld: { x: number; y: number }
    hoveredTargetId: string | null
  } | null>(null)

  const viewportRef = useRef<HTMLDivElement>(null)

  // Reachability from coordinator
  const reachableFromCoordinator = useMemo(() => {
    if (!activeTeam) return new Set<string>()
    const coordNodes = activeTeam.nodes.filter(
      n => n.roleInTeam === 'coordinator' || n.agentId === activeTeam.coordinatorAgentId
    )
    const set = new Set<string>(coordNodes.map(n => n.id))
    for (const c of coordNodes) {
      for (const n of activeTeam.nodes) {
        if (reachesInGraph(activeTeam.edges, c.id, n.id)) {
          set.add(n.id)
        }
      }
    }
    return set
  }, [activeTeam])

  const handleFitView = () => {
    if (!activeTeam) return
    const rect = viewportRef.current?.getBoundingClientRect()
    const bounds = diagramBounds(activeTeam.nodes.map(n => n.position))
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

  // Centralização automática ao abrir ou alternar de equipe (apenas ao trocar de equipe ou montar tela)
  const lastCenteredTeamIdRef = useRef<string | null>(null)
  useEffect(() => {
    if (!activeTeam) return
    if (lastCenteredTeamIdRef.current === selectedTeamId) return
    lastCenteredTeamIdRef.current = selectedTeamId
    const timer = setTimeout(() => {
      handleFitView()
    }, 60)
    return () => clearTimeout(timer)
  }, [selectedTeamId])

  if (!activeTeam) return null

  const selectedNode = activeTeam.nodes.find(n => n.id === selectedNodeId)
  const selectedNodeAgent = selectedNode ? agents.find(a => a.id === selectedNode.agentId) : undefined

  const screenToWorld = (clientX: number, clientY: number) => {
    const rect = viewportRef.current?.getBoundingClientRect()
    if (!rect) return { x: 200, y: 160 }
    return {
      x: (clientX - rect.left - pan.x) / zoom,
      y: (clientY - rect.top - pan.y) / zoom
    }
  }

  const handleCreateTeam = () => {
    const coord = agents.find(a => a.specialistRole === 'coordinator') || agents[0]
    const newTeam: TeamDefinition = {
      id: `team_${Date.now()}`,
      version: 1,
      name: `Equipe Especialista ${teams.length + 1}`,
      description: 'Equipe coordenada para entregas completas e integradas.',
      coordinatorAgentId: coord.id,
      maxParallelSubtasks: 4,
      nodes: [
        {
          id: `tn_${Date.now()}_coord`,
          agentId: coord.id,
          position: { x: 120, y: 180 },
          roleInTeam: 'coordinator',
          contextScope: ['template', 'permanent_ref', 'project_context', 'request_context'],
          allowedOutputTypes: ['note', 'tasks']
        }
      ],
      edges: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    onSaveTeam(newTeam)
    onSelectTeam(newTeam.id)
    setIsTeamMenuOpen(false)
  }

  const handleAddMemberNodeAt = (agentId: string) => {
    const ag = agents.find(a => a.id === agentId)
    if (!ag) return
    const isReviewer = ag.specialistRole === 'reviewer'
    const isCoord = ag.specialistRole === 'coordinator'
    const existingCount = activeTeam.nodes.length
    const pos = {
      x: snapDiagramCoord(180 + (existingCount % 3) * 320),
      y: snapDiagramCoord(160 + Math.floor(existingCount / 3) * 220)
    }

    const newNode: TeamMemberNode = {
      id: `tn_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      agentId: ag.id,
      position: pos,
      roleInTeam: isCoord ? 'coordinator' : isReviewer ? 'reviewer' : 'specialist',
      contextScope: isReviewer
        ? ['template', 'permanent_ref', 'project_context']
        : ['permanent_ref', 'project_context', 'request_context'],
      allowedOutputTypes: ag.deliverables?.outputTypes?.length ? [...ag.deliverables.outputTypes] : ['note'],
      requireUserReview: true
    }

    const coordNode = activeTeam.nodes.find(n => n.roleInTeam === 'coordinator')
    const newEdges = [...activeTeam.edges]
    if (coordNode && coordNode.id !== newNode.id) {
      newEdges.push({
        id: `te_${Date.now()}`,
        sourceNodeId: coordNode.id,
        targetNodeId: newNode.id,
        relation: isReviewer ? 'reviews_output' : 'delegates_to',
        label: isReviewer ? 'Revisa entrega' : 'Delega subtarefa'
      })
    }

    const updated: TeamDefinition = {
      ...activeTeam,
      version: activeTeam.version + 1,
      nodes: [...activeTeam.nodes, newNode],
      edges: newEdges,
      updatedAt: Date.now()
    }
    onSaveTeam(updated)
    setSelectedNodeId(newNode.id)
    setIsAddMemberOpen(false)
  }

  const handleRemoveNode = (nodeId: string) => {
    const updated: TeamDefinition = {
      ...activeTeam,
      version: activeTeam.version + 1,
      nodes: activeTeam.nodes.filter(n => n.id !== nodeId),
      edges: activeTeam.edges.filter(e => e.sourceNodeId !== nodeId && e.targetNodeId !== nodeId),
      updatedAt: Date.now()
    }
    onSaveTeam(updated)
    if (selectedNodeId === nodeId) setSelectedNodeId(null)
  }

  const handleRemoveEdge = (edgeId: string) => {
    const updated: TeamDefinition = {
      ...activeTeam,
      version: activeTeam.version + 1,
      edges: activeTeam.edges.filter(e => e.id !== edgeId),
      updatedAt: Date.now()
    }
    onSaveTeam(updated)
    if (selectedEdgeId === edgeId) setSelectedEdgeId(null)
  }

  const completeWireConnection = (fromId: string, toId: string) => {
    const targetNode = activeTeam.nodes.find(n => n.id === toId)
    if (!targetNode) return
    const problem = diagramConnectionProblem(
      activeTeam.edges,
      fromId,
      toId,
      targetNode.roleInTeam === 'coordinator'
    )
    if (problem) return

    const newEdge: TeamEdge = {
      id: `te_${Date.now()}`,
      sourceNodeId: fromId,
      targetNodeId: toId,
      relation: connectionRelation,
      label: RELATION_META[connectionRelation].label
    }
    onSaveTeam({
      ...activeTeam,
      version: activeTeam.version + 1,
      edges: [...activeTeam.edges, newEdge],
      updatedAt: Date.now()
    })
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (wireDraft) {
      const world = screenToWorld(e.clientX, e.clientY)
      let hoveredTargetId: string | null = null
      for (const n of activeTeam.nodes) {
        if (n.id === wireDraft.fromNodeId) continue
        const inPort = diagramInputPort(n.position)
        if (Math.hypot(world.x - inPort.x, world.y - inPort.y) < 42) {
          hoveredTargetId = n.id
          break
        }
      }
      setWireDraft({
        ...wireDraft,
        toWorld: hoveredTargetId
          ? diagramInputPort(activeTeam.nodes.find(n => n.id === hoveredTargetId)!.position)
          : world,
        hoveredTargetId
      })
      return
    }

    if (draggingNodeId) {
      const nextX = snapDiagramCoord((e.clientX - dragOffsetRef.current.x - pan.x) / zoom)
      const nextY = snapDiagramCoord((e.clientY - dragOffsetRef.current.y - pan.y) / zoom)
      onSaveTeam({
        ...activeTeam,
        nodes: activeTeam.nodes.map(n =>
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

  const handleUpdateNode = (nodeId: string, patch: Partial<TeamMemberNode>) => {
    onSaveTeam({
      ...activeTeam,
      version: activeTeam.version + 1,
      nodes: activeTeam.nodes.map(n => (n.id === nodeId ? { ...n, ...patch } : n)),
      updatedAt: Date.now()
    })
  }

  const filteredAvailableAgents = agents.filter(
    a =>
      a.name.toLowerCase().includes(memberSearchQuery.toLowerCase()) ||
      a.roleDescription?.toLowerCase().includes(memberSearchQuery.toLowerCase())
  )

  return (
    <div className="flex-1 flex flex-col bg-[#09090b] overflow-hidden select-none relative">
      {/* BARRA SUPERIOR MINIMALISTA (Mesmo padrão do OpenBot Print 02) */}
      <div className="h-11 px-4 border-b border-zinc-900/90 bg-[#09090b] flex items-center justify-between shrink-0 z-30">
        <div className="flex items-center gap-3">
          {/* Badge de Workspace "Local" com esfera verde (Idêntico ao Print 02) */}
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-zinc-900/60 border border-zinc-800/60 text-xs font-medium text-zinc-300">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-xs" />
            <span>Local</span>
            <ChevronDown className="w-3 h-3 text-zinc-500" />
          </div>

          <div className="flex items-center gap-1 text-zinc-500">
            <button
              type="button"
              onClick={() => {
                const idx = teams.findIndex(t => t.id === activeTeam.id)
                if (idx > 0) onSelectTeam(teams[idx - 1].id)
              }}
              className="p-1 rounded hover:bg-zinc-800/60 hover:text-zinc-300 cursor-pointer"
              title="Equipe anterior"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => {
                const idx = teams.findIndex(t => t.id === activeTeam.id)
                if (idx >= 0 && idx < teams.length - 1) onSelectTeam(teams[idx + 1].id)
              }}
              className="p-1 rounded hover:bg-zinc-800/60 hover:text-zinc-300 cursor-pointer"
              title="Próxima equipe"
            >
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => setIsTeamMenuOpen(v => !v)}
              className="flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-zinc-900 text-xs font-medium text-zinc-200 cursor-pointer"
            >
              <span>{activeTeam.name}</span>
              <ChevronDown className="w-3.5 h-3.5 text-zinc-500" />
            </button>

            {isTeamMenuOpen && (
              <div
                onMouseDown={e => e.stopPropagation()}
                className="absolute left-0 top-full mt-1.5 w-64 bg-[#141416] border border-zinc-800 rounded-2xl shadow-2xl p-1.5 z-50"
              >
                <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                  Equipes
                </div>
                {teams.map(t => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      onSelectTeam(t.id)
                      setIsTeamMenuOpen(false)
                    }}
                    className={`w-full text-left px-2.5 py-1.5 rounded-xl text-xs flex items-center justify-between cursor-pointer ${
                      t.id === activeTeam.id
                        ? 'bg-zinc-800/90 text-white font-medium'
                        : 'text-zinc-300 hover:bg-zinc-800/50'
                    }`}
                  >
                    <span className="truncate">{t.name}</span>
                    <span className="text-[10px] text-zinc-500">{t.nodes.length} agentes</span>
                  </button>
                ))}
                <div className="border-t border-zinc-800/80 my-1" />
                <button
                  type="button"
                  onClick={handleCreateTeam}
                  className="w-full text-left px-2.5 py-1.5 rounded-xl text-xs text-zinc-200 hover:bg-zinc-800/60 flex items-center gap-2 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Nova equipe</span>
                </button>
                {teams.length > 1 && (
                  <button
                    type="button"
                    onClick={() => {
                      onDeleteTeam(activeTeam.id)
                      setIsTeamMenuOpen(false)
                    }}
                    className="w-full text-left px-2.5 py-1.5 rounded-xl text-xs text-rose-400 hover:bg-rose-950/30 flex items-center gap-2 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Excluir equipe</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Direita: Relação ao conectar + Botão Pílula Branco */}
        <div className="flex items-center gap-2.5">
          <div className="hidden sm:flex items-center gap-1.5 text-[11px] text-zinc-400">
            <span>Relação:</span>
            <CustomSelect
              value={connectionRelation}
              onChange={val => setConnectionRelation(val as TeamEdge['relation'])}
              options={[
                { value: 'delegates_to', label: 'Delega subtarefa' },
                { value: 'reviews_output', label: 'Revisa entrega' },
                { value: 'depends_on', label: 'Depende de' }
              ]}
              size="xs"
              className="w-36"
            />
          </div>

          <button
            type="button"
            disabled={isExecuting}
            onClick={() => onRunTeam(activeTeam, false, teamPrompt)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-zinc-100 hover:bg-white text-zinc-950 font-semibold text-xs transition-all shadow-sm disabled:opacity-40 cursor-pointer"
          >
            <Play className="w-3 h-3 fill-current" />
            <span>{isExecuting ? 'Executando equipe...' : 'Executar equipe'}</span>
          </button>

          <button
            type="button"
            onClick={() => setInspectorOpen(v => !v)}
            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
              inspectorOpen
                ? 'bg-zinc-800 text-zinc-100'
                : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60'
            }`}
            title="Configurações da equipe"
          >
            <PanelRight className="w-4 h-4" />
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
          onPointerDown={e => {
            if (e.button === 2) return
            const target = e.target as HTMLElement
            const isInteractive = target?.closest?.('button, input, textarea, select, [data-node-id], [data-no-pan="true"]')
            if (!isInteractive) {
              setSelectedNodeId(null)
              setSelectedEdgeId(null)
              setIsTeamMenuOpen(false)
              setIsAddMemberOpen(false)
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
            <svg className="overflow-visible w-full h-full pointer-events-none">
              {activeTeam.edges.map(edge => {
                const src = activeTeam.nodes.find(n => n.id === edge.sourceNodeId)
                const dst = activeTeam.nodes.find(n => n.id === edge.targetNodeId)
                if (!src || !dst) return null
                const fromPt = diagramOutputPort(src.position)
                const toPt = diagramInputPort(dst.position)
                const pathD = diagramEdgePath(fromPt, toPt)
                const mid = diagramEdgeMidpoint(fromPt, toPt)
                const arrowPts = diagramEdgeArrow(toPt)
                const isSelected = selectedEdgeId === edge.id
                const meta = RELATION_META[edge.relation] || RELATION_META.delegates_to
                const strokeColor = isSelected ? '#ffffff' : meta.color

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
                      strokeDasharray={edge.relation === 'reviews_output' ? '5 4' : undefined}
                    />
                    <polygon points={arrowPts} fill={strokeColor} />
                    <g transform={`translate(${mid.x}, ${mid.y})`}>
                      <rect
                        x={-44}
                        y={-10}
                        width={88}
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
                        {edge.label || meta.label}
                      </text>
                    </g>
                  </g>
                )
              })}

              {/* Fio sendo puxado */}
              {wireDraft && (() => {
                const src = activeTeam.nodes.find(n => n.id === wireDraft.fromNodeId)
                if (!src) return null
                const fromPt = diagramOutputPort(src.position)
                const pathD = diagramEdgePath(fromPt, wireDraft.toWorld)
                return (
                  <g>
                    <path
                      d={pathD}
                      fill="none"
                      stroke="#ffffff"
                      strokeWidth={2}
                      strokeDasharray="5 4"
                    />
                    <circle cx={wireDraft.toWorld.x} cy={wireDraft.toWorld.y} r={5} fill="#ffffff" />
                  </g>
                )
              })()}
            </svg>

            {/* CARDS DOS MEMBROS DA EQUIPE (Estilo OpenBot Print 02) */}
            {activeTeam.nodes.map(node => {
              const ag = agents.find(a => a.id === node.agentId)
              const isSelected = selectedNodeId === node.id
              const isDropTarget = wireDraft?.hoveredTargetId === node.id
              const isCoordinator = node.roleInTeam === 'coordinator'
              const isReviewer = node.roleInTeam === 'reviewer'
              const isReachable = reachableFromCoordinator.has(node.id)
              const agentIdx = ag ? agents.findIndex(a => a.id === ag.id) : 0
              const color = AGENT_COLORS[Math.max(0, agentIdx) % AGENT_COLORS.length]

              return (
                <div
                  key={node.id}
                  style={{
                    left: node.position.x,
                    top: node.position.y,
                    width: 270
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
                  data-node-id={node.id}
                  className="absolute pointer-events-auto select-none group"
                >
                  {/* RÓTULO FLUTUANTE ACIMA DO CARD */}
                  <div className="flex items-center justify-between mb-1.5 px-1">
                    <div className="flex items-center gap-1.5 text-[11px] font-medium text-zinc-400">
                      {isCoordinator ? (
                        <Crown className="w-3.5 h-3.5 text-amber-400" />
                      ) : isReviewer ? (
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Bot className="w-3.5 h-3.5 text-zinc-400" />
                      )}
                      <span>
                        {isCoordinator
                          ? '👑 Coordenador'
                          : isReviewer
                          ? '🔍 Revisor'
                          : '🤖 Especialista'}
                      </span>
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
                        title="Configurações do membro"
                      >
                        •••
                      </button>
                      {!isCoordinator && (
                        <button
                          type="button"
                          onPointerDown={e => e.stopPropagation()}
                          onClick={e => {
                            e.stopPropagation()
                            handleRemoveNode(node.id)
                          }}
                          className="text-zinc-500 hover:text-rose-400 p-0.5 cursor-pointer"
                          title="Remover da equipe"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* PORTAS CIRCULARES À ESQUERDA (T, Imagem, Arquivo — Idêntico ao Print 02) */}
                  {!isCoordinator && (
                    <div className="absolute -left-9 top-10 flex flex-col gap-1.5 z-20">
                      <div
                        className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-serif transition-all ${
                          isDropTarget
                            ? 'bg-white text-black scale-125 shadow-lg'
                            : 'bg-[#1a1a1e] border border-zinc-700/80 text-zinc-300'
                        }`}
                        title="Entrada de texto / instruções"
                      >
                        T
                      </div>
                      <div
                        className="w-6 h-6 rounded-full bg-[#1a1a1e] border border-zinc-700/80 text-zinc-500 flex items-center justify-center"
                        title="Entrada de imagens e diagramas"
                      >
                        <ImageIcon className="w-3 h-3 text-zinc-400" />
                      </div>
                      <div
                        className="w-6 h-6 rounded-full bg-[#1a1a1e] border border-zinc-700/80 text-zinc-500 flex items-center justify-center"
                        title="Entrada de notas vinculadas"
                      >
                        <FileText className="w-3 h-3 text-zinc-400" />
                      </div>
                    </div>
                  )}

                  {/* PORTA CIRCULAR À DIREITA */}
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
                    title="Arraste para conectar a outro especialista"
                  >
                    T
                  </button>

                  {/* CORPO DO CARD ESCURO (#141416) */}
                  <div
                    className={`rounded-2xl bg-[#141416] border p-3.5 shadow-2xl transition-all space-y-2.5 ${
                      isSelected
                        ? 'border-zinc-500 ring-1 ring-zinc-500/30'
                        : isDropTarget
                        ? 'border-white ring-2 ring-white/20'
                        : 'border-zinc-800/90 hover:border-zinc-700/80'
                    }`}
                  >
                    {/* Header do Agente com Avatar Colorido */}
                    <div className="flex items-center gap-2.5">
                      <div
                        className="w-8 h-8 rounded-xl flex items-center justify-center text-white font-bold text-xs shrink-0 shadow-sm"
                        style={{ backgroundColor: color }}
                      >
                        ••
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-zinc-100 truncate">
                          {ag?.name || 'Agente'}
                        </div>
                        <div className="text-[10px] text-zinc-500 truncate">
                          {ag?.roleDescription || ag?.workStyle.tone || 'Especialista'}
                        </div>
                      </div>
                    </div>

                    {/* Escopo de Fontes Autorizadas em Chips */}
                    <div className="bg-[#1c1c1f] rounded-xl p-2 space-y-1 text-[10px]">
                      <div className="text-zinc-500 font-medium">Fontes autorizadas:</div>
                      <div className="flex flex-wrap gap-1">
                        {node.contextScope.map(role => (
                          <span
                            key={role}
                            className="px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-300"
                          >
                            {role === 'template'
                              ? 'Modelo'
                              : role === 'permanent_ref'
                              ? 'Catálogo'
                              : role === 'project_context'
                              ? 'Cliente'
                              : 'Pedido'}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Botão sutil de ação rápida: Falar com este agente no chat */}
                    <div className="flex items-center justify-between pt-1 text-[11px]">
                      {!isReachable && !isCoordinator ? (
                        <span className="text-amber-400 text-[10px]">Desconectado</span>
                      ) : (
                        <span className="text-emerald-400 text-[10px]">Conectado</span>
                      )}

                      <button
                        type="button"
                        onPointerDown={e => e.stopPropagation()}
                        onClick={e => {
                          e.stopPropagation()
                          if (ag) onOpenAgentChat?.(ag.id)
                        }}
                        className="flex items-center gap-1 text-zinc-400 hover:text-zinc-100 hover:underline cursor-pointer"
                      >
                        <MessageSquare className="w-3 h-3" />
                        <span>Falar no chat</span>
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* POPOVER CENTRAL "ADICIONAR ESPECIALISTA" */}
          {isAddMemberOpen && (
            <div
              onPointerDown={e => e.stopPropagation()}
              className="absolute left-1/2 bottom-20 -translate-x-1/2 w-64 bg-[#141416]/98 backdrop-blur-xl border border-zinc-800/90 rounded-2xl shadow-2xl p-2 z-40 animate-in fade-in zoom-in-95 duration-100"
            >
              <div className="flex items-center gap-2 px-2.5 py-1.5 border-b border-zinc-800/80 mb-1">
                <Search className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                <input
                  type="text"
                  autoFocus
                  value={memberSearchQuery}
                  onChange={e => setMemberSearchQuery(e.target.value)}
                  placeholder="Buscar agente para adicionar"
                  className="w-full bg-transparent text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none"
                />
              </div>

              <div className="space-y-1 max-h-60 overflow-y-auto py-1">
                {filteredAvailableAgents.map(ag => {
                  const alreadyInTeam = activeTeam.nodes.some(n => n.agentId === ag.id)
                  return (
                    <button
                      key={ag.id}
                      type="button"
                      disabled={alreadyInTeam}
                      onClick={() => handleAddMemberNodeAt(ag.id)}
                      className="w-full text-left px-2.5 py-1.5 rounded-xl hover:bg-zinc-800/70 flex items-center justify-between text-xs text-zinc-200 transition-colors disabled:opacity-40 cursor-pointer"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                        <span className="truncate">{ag.name}</span>
                      </div>
                      {alreadyInTeam && (
                        <span className="text-[10px] text-zinc-500">Na equipe</span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* PÍLULA DE ZOOM NO CANTO INFERIOR ESQUERDO */}
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
              title="Abrir configurações da equipe"
            >
              <Map className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* DOCK FLUTUANTE INFERIOR CENTRAL */}
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
              onClick={() => setIsAddMemberOpen(v => !v)}
              className="p-2 rounded-xl text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60 transition-colors cursor-pointer"
              title="Adicionar nota adesiva"
            >
              <StickyNote className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setIsAddMemberOpen(v => !v)}
              className="p-2 rounded-xl text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60 transition-colors cursor-pointer"
              title="Adicionar forma / agrupamento"
            >
              <Shapes className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setIsAddMemberOpen(v => !v)}
              className="p-2 rounded-xl text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60 transition-colors cursor-pointer"
              title="Adicionar rótulo de texto"
            >
              <Type className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setIsAddMemberOpen(v => !v)}
              className="p-2 rounded-xl text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60 transition-colors cursor-pointer"
              title="Buscar especialista"
            >
              <Search className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => setIsAddMemberOpen(v => !v)}
              className="ml-1 px-3.5 py-2 rounded-xl bg-zinc-100 hover:bg-white text-zinc-950 font-semibold text-xs flex items-center gap-1.5 transition-colors shadow-sm cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>Adicionar especialista</span>
            </button>
          </div>
        </div>

        {/* SIDEBAR DIREITA DE CONFIGURAÇÕES DA EQUIPE OU DO MEMBRO */}
        {inspectorOpen && (
          <aside className="w-80 bg-[#111113] border-l border-zinc-800/80 p-4 overflow-y-auto space-y-4 shrink-0 z-30">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2.5">
              <span className="text-xs font-semibold text-zinc-200">
                {selectedNode ? 'Membro da Equipe' : 'Configurações da Equipe'}
              </span>
              <button
                type="button"
                onClick={() => setInspectorOpen(false)}
                className="text-zinc-500 hover:text-zinc-200 p-1 rounded-lg hover:bg-zinc-800/60 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="space-y-2">
              <label className="block text-[11px] text-zinc-400">Nome da equipe</label>
              <input
                type="text"
                value={activeTeam.name}
                onChange={e =>
                  onSaveTeam({ ...activeTeam, name: e.target.value, updatedAt: Date.now() })
                }
                className="w-full bg-[#18181b] border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-100 focus:outline-none"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-[11px] text-zinc-400">Pedido para a equipe</label>
              <textarea
                value={teamPrompt}
                onChange={e => setTeamPrompt(e.target.value)}
                className="w-full h-20 bg-[#18181b] border border-zinc-800 rounded-xl p-2.5 text-xs text-zinc-100 resize-none focus:outline-none"
              />
            </div>

            {selectedNode && selectedNodeAgent && (
              <div className="space-y-3 pt-3 border-t border-zinc-800 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-zinc-200">{selectedNodeAgent.name}</span>
                  <button
                    type="button"
                    onClick={() => onOpenAgentChat?.(selectedNodeAgent.id)}
                    className="text-[11px] text-blue-400 hover:underline cursor-pointer"
                  >
                    Abrir conversa
                  </button>
                </div>

                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">Papel na equipe</label>
                  <CustomSelect
                    value={selectedNode.roleInTeam}
                    onChange={val =>
                      handleUpdateNode(selectedNode.id, {
                        roleInTeam: val as TeamMemberNode['roleInTeam']
                      })
                    }
                    options={[
                      { value: 'coordinator', label: 'Coordenador', icon: <Crown className="w-3.5 h-3.5 text-amber-400" /> },
                      { value: 'specialist', label: 'Especialista', icon: <Bot className="w-3.5 h-3.5 text-blue-400" /> },
                      { value: 'reviewer', label: 'Revisor', icon: <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> }
                    ]}
                    className="w-full"
                    size="sm"
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">Escopo de Fontes</label>
                  <div className="space-y-1">
                    {(['template', 'permanent_ref', 'project_context', 'request_context'] as ContextRole[]).map(
                      role => {
                        const checked = selectedNode.contextScope.includes(role)
                        return (
                          <label
                            key={role}
                            className="flex items-center gap-2 text-[11px] text-zinc-300 cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={e => {
                                const nextScope = e.target.checked
                                  ? [...selectedNode.contextScope, role]
                                  : selectedNode.contextScope.filter(r => r !== role)
                                handleUpdateNode(selectedNode.id, { contextScope: nextScope })
                              }}
                            />
                            <span>
                              {role === 'template'
                                ? 'Modelo de documento'
                                : role === 'permanent_ref'
                                ? 'Catálogo / Referência fixa'
                                : role === 'project_context'
                                ? 'Contexto de cliente/projeto'
                                : 'Contexto deste pedido'}
                            </span>
                          </label>
                        )
                      }
                    )}
                  </div>
                </div>

                {selectedNode.roleInTeam !== 'coordinator' && (
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => handleRemoveNode(selectedNode.id)}
                      className="w-full py-1.5 rounded-xl bg-rose-950/40 text-rose-300 text-xs hover:bg-rose-950/60 cursor-pointer"
                    >
                      Remover membro da equipe
                    </button>
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
