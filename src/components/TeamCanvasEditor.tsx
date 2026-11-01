import React, { useState, useRef } from 'react'
import type {
  AgentProfileVersion,
  ContextRole,
  TeamDefinition,
  TeamEdge,
  TeamMemberNode
} from '../types/agents'
import { ROLE_LABELS } from '../utils/multiAgentEngine'
import {
  Plus,
  Trash2,
  Play,
  FlaskConical,
  ZoomIn,
  ZoomOut,
  Maximize2,
  List,
  LayoutGrid,
  ShieldCheck,
  Users,
  ArrowRight,
  CheckCircle2,
  Crown
} from 'lucide-react'

interface TeamCanvasEditorProps {
  teams: TeamDefinition[]
  agents: AgentProfileVersion[]
  selectedTeamId: string
  onSelectTeam: (teamId: string) => void
  onSaveTeam: (team: TeamDefinition) => void
  onDeleteTeam: (teamId: string) => void
  onRunTeam: (team: TeamDefinition, isTest: boolean, prompt: string) => void
  isExecuting: boolean
}

const RELATION_LABELS: Record<TeamEdge['relation'], { label: string; color: string }> = {
  delegates_to: { label: 'Delega subtarefa', color: '#c59b27' },
  reviews_output: { label: 'Revisa entrega', color: '#10b981' },
  depends_on: { label: 'Depende de', color: '#06b6d4' }
}

export const TeamCanvasEditor: React.FC<TeamCanvasEditorProps> = ({
  teams,
  agents,
  selectedTeamId,
  onSelectTeam,
  onSaveTeam,
  onDeleteTeam,
  onRunTeam,
  isExecuting
}) => {
  const activeTeam = teams.find(t => t.id === selectedTeamId) || teams[0]
  const [viewMode, setViewMode] = useState<'canvas' | 'list'>('canvas')
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 20, y: 20 })
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [connectingFromNodeId, setConnectingFromNodeId] = useState<string | null>(null)
  const [connectionRelation, setConnectionRelation] = useState<TeamEdge['relation']>('delegates_to')
  const [teamPrompt, setTeamPrompt] = useState(
    'Elaborar proposta comercial completa, auditar preços e gerar plano de tarefas e mapa de escopo.'
  )

  const draggingNodeRef = useRef<{ nodeId: string; startX: number; startY: number; origX: number; origY: number } | null>(null)
  const panningRef = useRef<{ startX: number; startY: number; origPanX: number; origPanY: number } | null>(null)

  if (!activeTeam) return null

  const selectedNode = activeTeam.nodes.find(n => n.id === selectedNodeId) || null
  const selectedNodeAgent = selectedNode ? agents.find(a => a.id === selectedNode.agentId) : null

  const handleCreateNewTeam = () => {
    const coordinator = agents.find(a => a.specialistRole === 'coordinator') || agents[0]
    const reviewer = agents.find(a => a.specialistRole === 'reviewer')
    const newTeam: TeamDefinition = {
      id: `team_${Date.now()}`,
      version: 1,
      name: `Nova Equipe ${teams.length + 1}`,
      description: 'Equipe colaborativa com escopo controlado por especialista.',
      coordinatorAgentId: coordinator?.id || '',
      maxParallelSubtasks: 4,
      nodes: [
        ...(coordinator
          ? [
              {
                id: `tn_${Date.now()}_1`,
                agentId: coordinator.id,
                position: { x: 80, y: 150 },
                roleInTeam: 'coordinator' as const,
                contextScope: ['template', 'permanent_ref', 'project_context', 'request_context'] as ContextRole[],
                allowedOutputTypes: ['note'] as ('note' | 'tasks' | 'mindmap' | 'draw')[]
              }
            ]
          : []),
        ...(reviewer
          ? [
              {
                id: `tn_${Date.now()}_2`,
                agentId: reviewer.id,
                position: { x: 420, y: 150 },
                roleInTeam: 'reviewer' as const,
                contextScope: ['template', 'permanent_ref', 'project_context'] as ContextRole[],
                allowedOutputTypes: ['note'] as ('note' | 'tasks' | 'mindmap' | 'draw')[],
                requireUserReview: true
              }
            ]
          : [])
      ],
      edges: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    onSaveTeam(newTeam)
    onSelectTeam(newTeam.id)
  }

  const handleAddAgentNode = (agentId: string) => {
    if (activeTeam.nodes.some(n => n.agentId === agentId)) return
    const ag = agents.find(a => a.id === agentId)
    if (!ag) return
    const nextNode: TeamMemberNode = {
      id: `tn_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      agentId: ag.id,
      position: {
        x: 380 + (activeTeam.nodes.length % 2) * 280,
        y: 70 + Math.floor(activeTeam.nodes.length / 2) * 145
      },
      roleInTeam: ag.specialistRole === 'reviewer' ? 'reviewer' : 'specialist',
      contextScope: ['permanent_ref', 'project_context'],
      allowedOutputTypes: ag.deliverables.outputTypes.length ? [...ag.deliverables.outputTypes] : ['note']
    }
    const coordNode = activeTeam.nodes.find(n => n.roleInTeam === 'coordinator')
    const nextEdges = [...activeTeam.edges]
    if (coordNode) {
      nextEdges.push({
        id: `te_${Date.now()}`,
        sourceNodeId: coordNode.id,
        targetNodeId: nextNode.id,
        relation: ag.specialistRole === 'reviewer' ? 'reviews_output' : 'delegates_to',
        label: ag.specialistRole === 'reviewer' ? 'Auditar entrega' : 'Executar subtarefa'
      })
    }
    onSaveTeam({
      ...activeTeam,
      version: activeTeam.version + 1,
      nodes: [...activeTeam.nodes, nextNode],
      edges: nextEdges,
      updatedAt: Date.now()
    })
    setSelectedNodeId(nextNode.id)
  }

  const handleRemoveNode = (nodeId: string) => {
    const nextNodes = activeTeam.nodes.filter(n => n.id !== nodeId)
    const nextEdges = activeTeam.edges.filter(e => e.sourceNodeId !== nodeId && e.targetNodeId !== nodeId)
    onSaveTeam({
      ...activeTeam,
      version: activeTeam.version + 1,
      nodes: nextNodes,
      edges: nextEdges,
      updatedAt: Date.now()
    })
    if (selectedNodeId === nodeId) setSelectedNodeId(null)
  }

  const handleSetCoordinator = (nodeId: string) => {
    const target = activeTeam.nodes.find(n => n.id === nodeId)
    if (!target) return
    const nextNodes = activeTeam.nodes.map(n => ({
      ...n,
      roleInTeam: n.id === nodeId ? ('coordinator' as const) : n.roleInTeam === 'coordinator' ? ('specialist' as const) : n.roleInTeam
    }))
    onSaveTeam({
      ...activeTeam,
      version: activeTeam.version + 1,
      coordinatorAgentId: target.agentId,
      nodes: nextNodes,
      updatedAt: Date.now()
    })
  }

  const handleToggleContextScope = (nodeId: string, role: ContextRole) => {
    const nextNodes = activeTeam.nodes.map(n => {
      if (n.id !== nodeId) return n
      const exists = n.contextScope.includes(role)
      const nextScope = exists ? n.contextScope.filter(r => r !== role) : [...n.contextScope, role]
      return { ...n, contextScope: nextScope }
    })
    onSaveTeam({
      ...activeTeam,
      nodes: nextNodes,
      updatedAt: Date.now()
    })
  }

  const handleCompleteConnection = (targetNodeId: string) => {
    if (!connectingFromNodeId || connectingFromNodeId === targetNodeId) {
      setConnectingFromNodeId(null)
      return
    }
    const exists = activeTeam.edges.some(
      e => e.sourceNodeId === connectingFromNodeId && e.targetNodeId === targetNodeId
    )
    if (!exists) {
      const newEdge: TeamEdge = {
        id: `te_${Date.now()}`,
        sourceNodeId: connectingFromNodeId,
        targetNodeId,
        relation: connectionRelation,
        label: RELATION_LABELS[connectionRelation].label
      }
      onSaveTeam({
        ...activeTeam,
        version: activeTeam.version + 1,
        edges: [...activeTeam.edges, newEdge],
        updatedAt: Date.now()
      })
    }
    setConnectingFromNodeId(null)
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (draggingNodeRef.current) {
      const { nodeId, startX, startY, origX, origY } = draggingNodeRef.current
      const dx = (e.clientX - startX) / zoom
      const dy = (e.clientY - startY) / zoom
      const nextNodes = activeTeam.nodes.map(n =>
        n.id === nodeId
          ? { ...n, position: { x: Math.max(20, Math.round(origX + dx)), y: Math.max(20, Math.round(origY + dy)) } }
          : n
      )
      onSaveTeam({ ...activeTeam, nodes: nextNodes, updatedAt: Date.now() })
    } else if (panningRef.current) {
      const { startX, startY, origPanX, origPanY } = panningRef.current
      setPan({
        x: origPanX + (e.clientX - startX),
        y: origPanY + (e.clientY - startY)
      })
    }
  }

  const handleMouseUp = () => {
    draggingNodeRef.current = null
    panningRef.current = null
  }

  return (
    <div className="flex flex-col h-full bg-[#0f0f13] text-zinc-100 overflow-hidden">
      {/* Barra superior da Equipe */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3.5 border-b border-zinc-800/80 bg-[#14141a]">
        <div className="flex items-center gap-3">
          <Users className="w-5 h-5 text-[#c59b27]" />
          <select
            value={activeTeam.id}
            onChange={e => onSelectTeam(e.target.value)}
            className="bg-zinc-900 border border-zinc-700/80 rounded-lg px-3 py-1.5 text-sm font-semibold text-zinc-100 focus:outline-none focus:border-[#c59b27]"
          >
            {teams.map(t => (
              <option key={t.id} value={t.id}>
                {t.name} (v{t.version})
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleCreateNewTeam}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-700/80 hover:border-zinc-500 text-xs font-medium text-zinc-200 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Nova Equipe</span>
          </button>
          {teams.length > 1 && (
            <button
              type="button"
              onClick={() => onDeleteTeam(activeTeam.id)}
              className="p-1.5 rounded-lg border border-zinc-800 hover:border-rose-500/50 text-zinc-400 hover:text-rose-400 cursor-pointer"
              title="Excluir equipe"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Alternador Canvas vs Lista + Controles de Zoom */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-zinc-900 p-0.5 rounded-lg border border-zinc-800">
            <button
              type="button"
              onClick={() => setViewMode('canvas')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium cursor-pointer ${
                viewMode === 'canvas' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Canvas Visual</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium cursor-pointer ${
                viewMode === 'list' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              <span>Lista Acessível</span>
            </button>
          </div>

          {viewMode === 'canvas' && (
            <div className="flex items-center gap-1 bg-zinc-900 px-2 py-1 rounded-lg border border-zinc-800 text-xs">
              <button
                type="button"
                onClick={() => setZoom(z => Math.max(0.6, Number((z - 0.1).toFixed(2))))}
                className="p-1 hover:text-white text-zinc-400 cursor-pointer"
                title="Reduzir zoom"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="w-11 text-center text-zinc-300">{Math.round(zoom * 100)}%</span>
              <button
                type="button"
                onClick={() => setZoom(z => Math.min(1.5, Number((z + 0.1).toFixed(2))))}
                className="p-1 hover:text-white text-zinc-400 cursor-pointer"
                title="Aumentar zoom"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setZoom(1)
                  setPan({ x: 20, y: 20 })
                }}
                className="p-1 hover:text-white text-zinc-400 cursor-pointer"
                title="Ajustar à tela"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Barra de Pedido para Executar / Testar Equipe */}
      <div className="flex flex-wrap items-center gap-3 px-6 py-3 bg-[#121217] border-b border-zinc-800/60">
        <input
          type="text"
          value={teamPrompt}
          onChange={e => setTeamPrompt(e.target.value)}
          placeholder="Descreva o objetivo para esta equipe executar..."
          className="flex-1 min-w-[260px] bg-zinc-900/90 border border-zinc-700/80 rounded-lg px-3.5 py-2 text-sm text-zinc-100 focus:outline-none focus:border-[#c59b27]"
        />
        <button
          type="button"
          disabled={isExecuting}
          onClick={() => onRunTeam(activeTeam, true, teamPrompt)}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-zinc-700 bg-zinc-800/80 hover:bg-zinc-700 text-xs font-medium text-zinc-100 cursor-pointer disabled:opacity-50"
        >
          <FlaskConical className="w-4 h-4 text-amber-400" />
          <span>Testar Equipe</span>
        </button>
        <button
          type="button"
          disabled={isExecuting}
          onClick={() => onRunTeam(activeTeam, false, teamPrompt)}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#c59b27] hover:bg-[#d4a930] text-black font-semibold text-xs cursor-pointer disabled:opacity-50"
        >
          <Play className="w-4 h-4 fill-current" />
          <span>Executar Equipe</span>
        </button>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Paleta esquerda: Adicionar especialistas e conectar */}
        <div className="w-64 border-r border-zinc-800/80 bg-[#131319] p-4 flex flex-col gap-4 overflow-y-auto">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">
              Adicionar Agente à Equipe
            </div>
            <div className="space-y-1.5">
              {agents.map(ag => {
                const inTeam = activeTeam.nodes.some(n => n.agentId === ag.id)
                return (
                  <button
                    key={ag.id}
                    type="button"
                    disabled={inTeam}
                    onClick={() => handleAddAgentNode(ag.id)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border text-left text-xs transition-all ${
                      inTeam
                        ? 'border-zinc-800/60 bg-zinc-900/30 text-zinc-500 cursor-not-allowed'
                        : 'border-zinc-800 bg-zinc-900/80 hover:border-[#c59b27]/60 text-zinc-200 cursor-pointer'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span className="text-base">{ag.icon}</span>
                      <span className="truncate font-medium">{ag.name}</span>
                    </div>
                    {inTeam ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    ) : (
                      <Plus className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="border-t border-zinc-800/80 pt-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">
              Tipo de Conexão
            </div>
            <select
              value={connectionRelation}
              onChange={e => setConnectionRelation(e.target.value as TeamEdge['relation'])}
              className="w-full bg-zinc-900 border border-zinc-700/80 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200"
            >
              <option value="delegates_to">Delega subtarefa para</option>
              <option value="reviews_output">Revisa entrega de</option>
              <option value="depends_on">Depende de</option>
            </select>
            <p className="text-xs text-zinc-400 mt-2 leading-relaxed">
              {connectingFromNodeId
                ? 'Clique no agente de destino no quadro para concluir a conexão.'
                : 'Clique em "Conectar" em qualquer cartão de agente para criar um vínculo de delegação ou revisão.'}
            </p>
          </div>
        </div>

        {/* Área Central: Canvas ou Lista */}
        {viewMode === 'canvas' ? (
          <div
            role="region"
            aria-label="Quadro visual de montagem da equipe"
            onMouseDown={e => {
              if (e.target === e.currentTarget) {
                panningRef.current = {
                  startX: e.clientX,
                  startY: e.clientY,
                  origPanX: pan.x,
                  origPanY: pan.y
                }
              }
            }}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            className="flex-1 relative overflow-hidden bg-[#0c0c10] select-none cursor-grab active:cursor-grabbing"
            style={{
              backgroundImage: 'radial-gradient(rgba(255,255,255,0.07) 1px, transparent 1px)',
              backgroundSize: `${24 * zoom}px ${24 * zoom}px`
            }}
          >
            <div
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                transformOrigin: '0 0'
              }}
              className="w-[1600px] h-[1000px] relative"
            >
              {/* Arestas SVG */}
              <svg className="absolute inset-0 w-full h-full pointer-events-none">
                {activeTeam.edges.map(edge => {
                  const src = activeTeam.nodes.find(n => n.id === edge.sourceNodeId)
                  const dst = activeTeam.nodes.find(n => n.id === edge.targetNodeId)
                  if (!src || !dst) return null
                  const x1 = src.position.x + 240
                  const y1 = src.position.y + 52
                  const x2 = dst.position.x
                  const y2 = dst.position.y + 52
                  const midX = (x1 + x2) / 2
                  const relInfo = RELATION_LABELS[edge.relation]
                  return (
                    <g key={edge.id}>
                      <path
                        d={`M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`}
                        fill="none"
                        stroke={relInfo.color}
                        strokeWidth={2.2}
                      />
                      <circle cx={x2} cy={y2} r={4.5} fill={relInfo.color} />
                      <rect
                        x={midX - 62}
                        y={(y1 + y2) / 2 - 11}
                        width={124}
                        height={22}
                        rx={6}
                        fill="#14141c"
                        stroke={relInfo.color}
                        strokeWidth={1}
                      />
                      <text
                        x={midX}
                        y={(y1 + y2) / 2 + 4}
                        textAnchor="middle"
                        fill="#e4e4e7"
                        fontSize={11}
                      >
                        {relInfo.label}
                      </text>
                    </g>
                  )
                })}
              </svg>

              {/* Nós da Equipe */}
              {activeTeam.nodes.map(node => {
                const ag = agents.find(a => a.id === node.agentId)
                if (!ag) return null
                const isSelected = selectedNodeId === node.id
                const isConnecting = connectingFromNodeId === node.id
                const isCoord = node.roleInTeam === 'coordinator'

                return (
                  <div
                    key={node.id}
                    style={{ left: node.position.x, top: node.position.y }}
                    onMouseDown={e => {
                      e.stopPropagation()
                      setSelectedNodeId(node.id)
                      if (connectingFromNodeId && connectingFromNodeId !== node.id) {
                        handleCompleteConnection(node.id)
                        return
                      }
                      draggingNodeRef.current = {
                        nodeId: node.id,
                        startX: e.clientX,
                        startY: e.clientY,
                        origX: node.position.x,
                        origY: node.position.y
                      }
                    }}
                    className={`absolute w-60 rounded-xl border p-3.5 bg-[#16161e] shadow-xl transition-shadow cursor-move ${
                      isSelected
                        ? 'border-[#c59b27] ring-2 ring-[#c59b27]/30'
                        : isConnecting
                        ? 'border-emerald-400 ring-2 ring-emerald-400/30'
                        : 'border-zinc-800 hover:border-zinc-600'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xl">{ag.icon}</span>
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-zinc-100 truncate">{ag.name}</div>
                          <div className="text-xs text-zinc-400 flex items-center gap-1">
                            {isCoord && <Crown className="w-3 h-3 text-[#c59b27]" />}
                            <span>
                              {isCoord
                                ? 'Coordenador'
                                : node.roleInTeam === 'reviewer'
                                ? 'Revisor'
                                : 'Especialista'}
                            </span>
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation()
                          handleRemoveNode(node.id)
                        }}
                        className="text-zinc-500 hover:text-rose-400 p-1 cursor-pointer"
                        title="Remover da equipe"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="mt-2.5 flex flex-wrap gap-1">
                      {node.contextScope.map(role => (
                        <span
                          key={role}
                          className="px-2 py-0.5 rounded text-[11px] font-medium bg-zinc-900 border border-zinc-700/80 text-zinc-300"
                        >
                          {ROLE_LABELS[role].label.split(' ')[0]}
                        </span>
                      ))}
                    </div>

                    <div className="mt-3 pt-2.5 border-t border-zinc-800/80 flex items-center justify-between text-xs">
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation()
                          setConnectingFromNodeId(isConnecting ? null : node.id)
                        }}
                        className="text-[#c59b27] hover:underline font-medium cursor-pointer"
                      >
                        {isConnecting ? 'Cancelar vínculo' : 'Conectar →'}
                      </button>
                      {!isCoord && (
                        <button
                          type="button"
                          onClick={e => {
                            e.stopPropagation()
                            handleSetCoordinator(node.id)
                          }}
                          className="text-zinc-400 hover:text-zinc-200 cursor-pointer"
                        >
                          Tornar líder
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ) : (
          /* Visão em Lista Acessível por Teclado */
          <div className="flex-1 p-6 overflow-y-auto space-y-4">
            <h3 className="text-base font-semibold text-zinc-100">
              Membros e Vínculos de "{activeTeam.name}"
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {activeTeam.nodes.map(node => {
                const ag = agents.find(a => a.id === node.agentId)
                if (!ag) return null
                return (
                  <div
                    key={node.id}
                    className="p-4 rounded-xl border border-zinc-800 bg-[#15151c] flex flex-col gap-3"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <span className="text-2xl">{ag.icon}</span>
                        <div>
                          <div className="text-sm font-semibold text-zinc-100">{ag.name}</div>
                          <div className="text-xs text-zinc-400">{ag.roleDescription}</div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedNodeId(node.id)}
                        className="px-2.5 py-1 rounded-lg border border-zinc-700 text-xs text-zinc-200 hover:bg-zinc-800 cursor-pointer"
                      >
                        Configurar escopo
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>

            <h4 className="text-sm font-semibold text-zinc-300 pt-2">Regras de Delegação e Revisão</h4>
            <div className="space-y-2">
              {activeTeam.edges.map(edge => {
                const src = activeTeam.nodes.find(n => n.id === edge.sourceNodeId)
                const dst = activeTeam.nodes.find(n => n.id === edge.targetNodeId)
                const srcAg = agents.find(a => a.id === src?.agentId)
                const dstAg = agents.find(a => a.id === dst?.agentId)
                if (!srcAg || !dstAg) return null
                return (
                  <div
                    key={edge.id}
                    className="flex items-center justify-between px-4 py-2.5 rounded-lg border border-zinc-800 bg-zinc-900/60 text-sm"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-zinc-200">{srcAg.name}</span>
                      <ArrowRight className="w-4 h-4 text-[#c59b27]" />
                      <span className="text-xs px-2 py-0.5 rounded bg-zinc-800 text-zinc-300">
                        {RELATION_LABELS[edge.relation].label}
                      </span>
                      <ArrowRight className="w-4 h-4 text-[#c59b27]" />
                      <span className="font-medium text-zinc-200">{dstAg.name}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        onSaveTeam({
                          ...activeTeam,
                          edges: activeTeam.edges.filter(e => e.id !== edge.id),
                          updatedAt: Date.now()
                        })
                      }
                      className="text-xs text-rose-400 hover:underline cursor-pointer"
                    >
                      Remover vínculo
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Inspetor Direito do Membro Selecionado */}
        {selectedNode && selectedNodeAgent && (
          <div className="w-80 border-l border-zinc-800/80 bg-[#14141b] p-5 overflow-y-auto space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-[#c59b27]" />
                <span className="text-sm font-semibold text-zinc-100">Escopo na Equipe</span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedNodeId(null)}
                className="text-xs text-zinc-400 hover:text-white cursor-pointer"
              >
                Fechar
              </button>
            </div>

            <div>
              <div className="text-sm font-semibold text-white">
                {selectedNodeAgent.icon} {selectedNodeAgent.name}
              </div>
              <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                Defina exatamente quais tipos de contexto este especialista pode receber quando acionado pelo coordenador.
              </p>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Contexto Autorizado para este Membro
              </div>
              {(['template', 'permanent_ref', 'project_context', 'request_context'] as ContextRole[]).map(
                role => {
                  const checked = selectedNode.contextScope.includes(role)
                  return (
                    <label
                      key={role}
                      className="flex items-start gap-2.5 p-2.5 rounded-lg border border-zinc-800 bg-zinc-900/60 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => handleToggleContextScope(selectedNode.id, role)}
                        className="mt-0.5 accent-[#c59b27]"
                      />
                      <div>
                        <div className="text-xs font-medium text-zinc-200">{ROLE_LABELS[role].label}</div>
                        <div className="text-[11px] text-zinc-400">{ROLE_LABELS[role].description}</div>
                      </div>
                    </label>
                  )
                }
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
