import React, { useState, useRef, useMemo } from 'react'
import type {
  AgentProfileVersion,
  ContextRole,
  TeamDefinition,
  TeamEdge,
  TeamMemberNode
} from '../types/agents'
import { ROLE_LABELS, generateAgentDraftFromPrompt } from '../utils/multiAgentEngine'
import {
  DIAGRAM_NODE_WIDTH,
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
  FlaskConical,
  ZoomIn,
  ZoomOut,
  Maximize2,
  List,
  LayoutGrid,
  Users,
  Crown,
  PanelRight,
  MessageSquare,
  X,
  Send,
  Sparkles,
  Minus
} from 'lucide-react'

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

const RELATION_LABELS: Record<TeamEdge['relation'], { label: string; color: string }> = {
  delegates_to: { label: 'Delega subtarefa', color: '#c59b27' },
  reviews_output: { label: 'Revisa entrega', color: '#10b981' },
  depends_on: { label: 'Depende de', color: '#06b6d4' }
}

export const TeamCanvasEditor: React.FC<TeamCanvasEditorProps> = ({
  teams,
  agents,
  notes = [],
  selectedTeamId,
  onSelectTeam,
  onSaveTeam,
  onDeleteTeam,
  onRunTeam,
  onCreateAgentInline,
  onOpenAgentChat,
  isExecuting
}) => {
  const activeTeam = teams.find(t => t.id === selectedTeamId) || teams[0]
  const [viewMode, setViewMode] = useState<'canvas' | 'list'>('canvas')
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 48, y: 48 })
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)
  const [inspectorOpen, setInspectorOpen] = useState(false)
  const [connectionRelation, setConnectionRelation] = useState<TeamEdge['relation']>('delegates_to')
  const [testPrompt, setTestPrompt] = useState(
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

  // Interactive port-to-port wire dragging (OpenBot DiagramBoard pattern)
  const [wireDraft, setWireDraft] = useState<{
    fromNodeId: string
    toWorld: { x: number; y: number }
    hoveredTargetId: string | null
  } | null>(null)

  // Right-click canvas menu (OpenBot DiagramCanvasMenu + DiagramNewAgentCard pattern)
  const [canvasMenu, setCanvasMenu] = useState<{
    screenX: number
    screenY: number
    worldX: number
    worldY: number
    creatingNewAgent?: boolean
  } | null>(null)
  const [newAgentName, setNewAgentName] = useState('')
  const [newAgentPrompt, setNewAgentPrompt] = useState('')

  // Floating DiagramChatPanel (OpenBot DiagramChatPanel pattern)
  const [chatOpen, setChatOpen] = useState(false)
  const [chatInput, setChatInput] = useState('')
  const [chatMessages, setChatMessages] = useState<
    { id: string; sender: 'user' | 'assistant'; text: string }[]
  >([
    {
      id: 'welcome',
      sender: 'assistant',
      text: 'Clique com o botão direito em qualquer ponto do canvas para adicionar um agente na posição do cursor, ou arraste da porta direita (●) de um card até a porta esquerda de outro para conectá-los.'
    }
  ])

  const viewportRef = useRef<HTMLDivElement>(null)

  if (!activeTeam) return null

  const selectedNode = activeTeam.nodes.find(n => n.id === selectedNodeId)
  const selectedNodeAgent = selectedNode ? agents.find(a => a.id === selectedNode.agentId) : undefined

  // Reachability from coordinator (identifies disconnected nodes visually like OpenBot's "Unconnected")
  const reachableFromCoordinator = useMemo(() => {
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

  const screenToWorld = (clientX: number, clientY: number) => {
    const rect = viewportRef.current?.getBoundingClientRect()
    if (!rect) return { x: 160, y: 160 }
    return {
      x: (clientX - rect.left - pan.x) / zoom,
      y: (clientY - rect.top - pan.y) / zoom
    }
  }

  const handleFitView = () => {
    const rect = viewportRef.current?.getBoundingClientRect()
    const bounds = diagramBounds(activeTeam.nodes.map(n => n.position))
    if (!rect || !bounds) {
      setZoom(1)
      setPan({ x: 48, y: 48 })
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

  const handleCreateTeam = () => {
    const coord = agents.find(a => a.specialistRole === 'coordinator') || agents[0]
    const newTeam: TeamDefinition = {
      id: `team_${Date.now()}`,
      version: 1,
      name: `Nova Equipe (${teams.length + 1})`,
      description: 'Equipe coordenada para projetos e entregas no cofre.',
      coordinatorAgentId: coord.id,
      maxParallelSubtasks: 4,
      nodes: [
        {
          id: `tn_${Date.now()}_coord`,
          agentId: coord.id,
          position: { x: 96, y: 176 },
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
  }

  const handleAddMemberNodeAt = (agentId: string, worldPos?: { x: number; y: number }) => {
    const ag = agents.find(a => a.id === agentId)
    if (!ag) return
    const isReviewer = ag.specialistRole === 'reviewer'
    const isCoord = ag.specialistRole === 'coordinator'
    const existingCount = activeTeam.nodes.length
    const pos = worldPos
      ? { x: snapDiagramCoord(worldPos.x), y: snapDiagramCoord(worldPos.y) }
      : {
          x: snapDiagramCoord(416 + (existingCount % 2) * 320),
          y: snapDiagramCoord(80 + Math.floor(existingCount / 2) * 176)
        }

    const newNode: TeamMemberNode = {
      id: `tn_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      agentId: ag.id,
      position: pos,
      roleInTeam: isCoord ? 'coordinator' : isReviewer ? 'reviewer' : 'specialist',
      contextScope: isReviewer
        ? ['template', 'permanent_ref', 'project_context']
        : ['permanent_ref', 'project_context', 'request_context'],
      allowedOutputTypes: ag.deliverables.outputTypes.length ? [...ag.deliverables.outputTypes] : ['note'],
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
    setCanvasMenu(null)
  }

  const handleCreateInlineAgentAtCursor = () => {
    if (!newAgentName.trim() && !newAgentPrompt.trim()) return
    const { draft } = generateAgentDraftFromPrompt(
      `${newAgentName.trim()}: ${newAgentPrompt.trim() || newAgentName.trim()}`,
      notes
    )
    if (newAgentName.trim()) {
      draft.name = newAgentName.trim()
    }
    onCreateAgentInline?.(draft)
    const targetWorld = canvasMenu
      ? { x: canvasMenu.worldX, y: canvasMenu.worldY }
      : { x: 420, y: 180 }

    const newNode: TeamMemberNode = {
      id: `tn_${Date.now()}_new`,
      agentId: draft.id,
      position: { x: snapDiagramCoord(targetWorld.x), y: snapDiagramCoord(targetWorld.y) },
      roleInTeam: draft.specialistRole === 'reviewer' ? 'reviewer' : 'specialist',
      contextScope: ['permanent_ref', 'project_context', 'request_context'],
      allowedOutputTypes: draft.deliverables.outputTypes.length ? [...draft.deliverables.outputTypes] : ['note'],
      requireUserReview: true
    }
    const coordNode = activeTeam.nodes.find(n => n.roleInTeam === 'coordinator')
    const nextEdges = [...activeTeam.edges]
    if (coordNode) {
      nextEdges.push({
        id: `te_${Date.now()}`,
        sourceNodeId: coordNode.id,
        targetNodeId: newNode.id,
        relation: 'delegates_to',
        label: 'Delega subtarefa'
      })
    }
    onSaveTeam({
      ...activeTeam,
      version: activeTeam.version + 1,
      nodes: [...activeTeam.nodes, newNode],
      edges: nextEdges,
      updatedAt: Date.now()
    })
    setNewAgentName('')
    setNewAgentPrompt('')
    setCanvasMenu(null)
    setSelectedNodeId(newNode.id)
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

  const handleToggleNodeScope = (nodeId: string, role: ContextRole) => {
    const updatedNodes = activeTeam.nodes.map(n => {
      if (n.id !== nodeId) return n
      const exists = n.contextScope.includes(role)
      return {
        ...n,
        contextScope: exists ? n.contextScope.filter(r => r !== role) : [...n.contextScope, role]
      }
    })
    onSaveTeam({
      ...activeTeam,
      version: activeTeam.version + 1,
      nodes: updatedNodes,
      updatedAt: Date.now()
    })
  }

  const handleToggleNodeOutput = (nodeId: string, outType: 'note' | 'tasks' | 'mindmap' | 'draw') => {
    const updatedNodes = activeTeam.nodes.map(n => {
      if (n.id !== nodeId) return n
      const exists = n.allowedOutputTypes.includes(outType)
      return {
        ...n,
        allowedOutputTypes: exists
          ? n.allowedOutputTypes.filter(o => o !== outType)
          : [...n.allowedOutputTypes, outType]
      }
    })
    onSaveTeam({
      ...activeTeam,
      version: activeTeam.version + 1,
      nodes: updatedNodes,
      updatedAt: Date.now()
    })
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
      label: RELATION_LABELS[connectionRelation].label
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
      // Snap to target input port if near
      let hoveredTargetId: string | null = null
      for (const n of activeTeam.nodes) {
        if (n.id === wireDraft.fromNodeId) continue
        const inPort = diagramInputPort(n.position)
        const dist = Math.hypot(world.x - inPort.x, world.y - inPort.y)
        if (dist < 34) {
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
      const world = screenToWorld(e.clientX, e.clientY)
      const newX = Math.max(16, snapDiagramCoord(world.x - dragOffsetRef.current.x))
      const newY = Math.max(16, snapDiagramCoord(world.y - dragOffsetRef.current.y))
      const updatedNodes = activeTeam.nodes.map(n =>
        n.id === draggingNodeId ? { ...n, position: { x: newX, y: newY } } : n
      )
      onSaveTeam({ ...activeTeam, nodes: updatedNodes, updatedAt: Date.now() })
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

  const handleSendCanvasChat = () => {
    const trimmed = chatInput.trim()
    if (!trimmed) return
    const userMsg = { id: `u_${Date.now()}`, sender: 'user' as const, text: trimmed }
    setChatInput('')

    // Se o usuário pedir para adicionar um agente pela conversa do canvas, adiciona imediatamente!
    const matchedAgent = agents.find(a => trimmed.toLowerCase().includes(a.name.toLowerCase()))
    if (matchedAgent && !activeTeam.nodes.some(n => n.agentId === matchedAgent.id)) {
      handleAddMemberNodeAt(matchedAgent.id)
      setChatMessages(prev => [
        ...prev,
        userMsg,
        {
          id: `a_${Date.now()}`,
          sender: 'assistant',
          text: `Adicionei **${matchedAgent.name}** ao canvas e conectei ao coordenador da equipe.`
        }
      ])
      return
    }

    setChatMessages(prev => [
      ...prev,
      userMsg,
      {
        id: `a_${Date.now()}`,
        sender: 'assistant',
        text: `Equipe "${activeTeam.name}" possui ${activeTeam.nodes.length} bloco(s) e ${activeTeam.edges.length} conexão(ões) ativas. Clique em "Executar Agora" no topo para rodar o pedido atual.`
      }
    ])
  }

  return (
    <div className="relative flex flex-col w-full h-full overflow-hidden bg-[#0b0c10] select-none">
      {/* Top OpenBot Diagram Header */}
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-[var(--bg-border)] bg-[#11131a]/95 backdrop-blur-md z-20 shrink-0">
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-400">
            <Users className="w-4 h-4" />
            <span>Equipe:</span>
          </div>
          <select
            value={activeTeam.id}
            onChange={e => onSelectTeam(e.target.value)}
            className="bg-[#181b24] border border-[var(--bg-border)] rounded-lg px-2.5 py-1.5 text-xs font-medium text-[var(--text-main)] focus:outline-none focus:border-amber-500/50"
          >
            {teams.map(t => (
              <option key={t.id} value={t.id}>
                {t.name} (v{t.version})
              </option>
            ))}
          </select>

          <button
            onClick={handleCreateTeam}
            className="px-2.5 py-1.5 rounded-lg bg-[var(--bg-elevated)] hover:bg-[var(--bg-border)] text-xs text-[var(--text-main)] flex items-center gap-1 transition-colors"
            title="Criar nova equipe"
          >
            <Plus className="w-3.5 h-3.5 text-amber-400" />
            Nova Equipe
          </button>

          {teams.length > 1 && (
            <button
              onClick={() => onDeleteTeam(activeTeam.id)}
              className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-300 transition-colors"
              title="Excluir esta equipe"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}

          <div className="h-4 w-px bg-[var(--bg-border)] mx-1" />

          {/* Tipo de conexão ao arrastar entre portas */}
          <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
            <span>Relação ao conectar:</span>
            <select
              value={connectionRelation}
              onChange={e => setConnectionRelation(e.target.value as TeamEdge['relation'])}
              className="bg-[#181b24] border border-[var(--bg-border)] rounded-md px-2 py-1 text-[11px] text-[var(--text-main)]"
            >
              <option value="delegates_to">Delega subtarefa</option>
              <option value="reviews_output">Revisa entrega</option>
              <option value="depends_on">Depende de</option>
            </select>
          </div>
        </div>

        {/* Center/Right Run Bar + View Switch + Collapsible Inspector Toggle */}
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={testPrompt}
            onChange={e => setTestPrompt(e.target.value)}
            placeholder="Pedido para a equipe..."
            className="w-64 lg:w-80 bg-[#181b24] border border-[var(--bg-border)] rounded-lg px-3 py-1.5 text-xs text-[var(--text-main)] focus:outline-none focus:border-amber-500/50"
          />
          <button
            disabled={isExecuting}
            onClick={() => onRunTeam(activeTeam, true, testPrompt)}
            className="px-2.5 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 text-xs font-medium flex items-center gap-1.5 disabled:opacity-50"
            title="Simular equipe sem gravar arquivos"
          >
            <FlaskConical className="w-3.5 h-3.5" />
            Simular
          </button>
          <button
            disabled={isExecuting}
            onClick={() => onRunTeam(activeTeam, false, testPrompt)}
            className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50 shadow-sm"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            Executar agora
          </button>

          <div className="flex items-center bg-[#181b24] p-0.5 rounded-lg border border-[var(--bg-border)]">
            <button
              onClick={() => setViewMode('canvas')}
              className={`px-2 py-1 rounded text-[11px] flex items-center gap-1 ${
                viewMode === 'canvas' ? 'bg-amber-500 text-black font-semibold' : 'text-[var(--text-muted)]'
              }`}
              title="Canvas Visual (OpenBot Diagram)"
            >
              <LayoutGrid className="w-3 h-3" />
              Canvas
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`px-2 py-1 rounded text-[11px] flex items-center gap-1 ${
                viewMode === 'list' ? 'bg-amber-500 text-black font-semibold' : 'text-[var(--text-muted)]'
              }`}
              title="Modo em Lista"
            >
              <List className="w-3 h-3" />
              Lista
            </button>
          </div>

          <button
            onClick={() => setInspectorOpen(v => !v)}
            className={`p-1.5 rounded-lg border transition-colors ${
              inspectorOpen
                ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                : 'bg-[#181b24] border-[var(--bg-border)] text-[var(--text-muted)] hover:text-white'
            }`}
            title={inspectorOpen ? 'Ocultar Inspetor Lateral' : 'Abrir Inspetor Lateral'}
          >
            <PanelRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Content Area: Full-Bleed Canvas or Accessible List */}
      {viewMode === 'canvas' ? (
        <div
          ref={viewportRef}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerDown={e => {
            if (e.button !== 0) return
            const target = e.target as HTMLElement
            if (target === viewportRef.current || target.dataset.canvasBg === 'true') {
              setCanvasMenu(null)
              setSelectedNodeId(null)
              setSelectedEdgeId(null)
              setIsPanning(true)
              panStartRef.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y }
            }
          }}
          onContextMenu={e => {
            e.preventDefault()
            const rect = viewportRef.current?.getBoundingClientRect()
            if (!rect) return
            const world = screenToWorld(e.clientX, e.clientY)
            setCanvasMenu({
              screenX: Math.min(e.clientX - rect.left, rect.width - 280),
              screenY: Math.min(e.clientY - rect.top, rect.height - 260),
              worldX: world.x,
              worldY: world.y
            })
          }}
          onWheel={e => {
            if (e.ctrlKey || e.metaKey) {
              e.preventDefault()
              const delta = e.deltaY < 0 ? 0.08 : -0.08
              setZoom(z => Math.min(1.6, Math.max(0.45, Number((z + delta).toFixed(2)))))
            } else {
              setPan(p => ({ x: p.x - e.deltaX * 0.6, y: p.y - e.deltaY * 0.6 }))
            }
          }}
          data-canvas-bg="true"
          className="relative flex-1 w-full h-full overflow-hidden cursor-grab active:cursor-grabbing"
          style={{
            backgroundImage: 'radial-gradient(rgba(255,255,255,0.12) 1.25px, transparent 1.25px)',
            backgroundSize: `${22 * zoom}px ${22 * zoom}px`,
            backgroundPosition: `${pan.x}px ${pan.y}px`
          }}
        >
          {/* Floating Top-Left Lens Hint Pill */}
          <div className="absolute top-3 left-4 z-10 flex items-center gap-2 bg-[#141720]/90 backdrop-blur-md border border-[var(--bg-border)] rounded-full px-3 py-1 text-[11px] text-[var(--text-muted)] shadow-lg pointer-events-auto">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span>{activeTeam.nodes.length} agentes no canvas</span>
            <span>•</span>
            <span>Clique direito no fundo para adicionar agente no cursor</span>
            <span>•</span>
            <span>Arraste da porta ● direita para conectar</span>
          </div>

          {/* World Transform Container */}
          <div
            data-canvas-bg="true"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: '0 0',
              width: 3200,
              height: 2200
            }}
            className="relative"
          >
            {/* OpenBot SVG Edges Layer */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none overflow-visible">
              {activeTeam.edges.map(edge => {
                const src = activeTeam.nodes.find(n => n.id === edge.sourceNodeId)
                const dst = activeTeam.nodes.find(n => n.id === edge.targetNodeId)
                if (!src || !dst) return null
                const from = diagramOutputPort(src.position)
                const to = diagramInputPort(dst.position)
                const pathD = diagramEdgePath(from, to)
                const arrowD = diagramEdgeArrow(to)
                const mid = diagramEdgeMidpoint(from, to)
                const relMeta = RELATION_LABELS[edge.relation] || RELATION_LABELS.delegates_to
                const isSelected = selectedEdgeId === edge.id

                return (
                  <g key={edge.id} className="pointer-events-auto group">
                    {/* Invisible wide hit path */}
                    <path
                      d={pathD}
                      fill="none"
                      stroke="transparent"
                      strokeWidth={16}
                      className="cursor-pointer"
                      onClick={e => {
                        e.stopPropagation()
                        setSelectedEdgeId(edge.id)
                      }}
                    />
                    <path
                      d={pathD}
                      fill="none"
                      stroke={isSelected ? '#fbbf24' : relMeta.color}
                      strokeWidth={isSelected ? 3 : 2.2}
                      strokeDasharray={edge.relation === 'reviews_output' ? '6 4' : undefined}
                      className="transition-all"
                    />
                    <path
                      d={arrowD}
                      fill="none"
                      stroke={isSelected ? '#fbbf24' : relMeta.color}
                      strokeWidth={2.2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    {/* Label Pill on Midpoint */}
                    <rect
                      x={mid.x - 56}
                      y={mid.y - 22}
                      width={112}
                      height={18}
                      rx={9}
                      fill="#11131a"
                      stroke={relMeta.color}
                      strokeWidth={1}
                    />
                    <text
                      x={mid.x}
                      y={mid.y - 10}
                      textAnchor="middle"
                      fill="#e4e4e7"
                      fontSize={9.5}
                      fontWeight={600}
                    >
                      {edge.label || relMeta.label}
                    </text>

                    {/* OpenBot Midpoint Remove Button (-) */}
                    <g
                      transform={`translate(${mid.x}, ${mid.y + 8})`}
                      className="cursor-pointer opacity-80 hover:opacity-100"
                      onClick={e => {
                        e.stopPropagation()
                        handleRemoveEdge(edge.id)
                      }}
                    >
                      <circle r={9} fill="#181b24" stroke="#ef4444" strokeWidth={1.2} />
                      <line x1={-4} y1={0} x2={4} y2={0} stroke="#fca5a5" strokeWidth={1.8} />
                    </g>
                  </g>
                )
              })}

              {/* Live Draft Wire while dragging from output port */}
              {wireDraft && (() => {
                const src = activeTeam.nodes.find(n => n.id === wireDraft.fromNodeId)
                if (!src) return null
                const from = diagramOutputPort(src.position)
                const d = diagramEdgePath(from, wireDraft.toWorld)
                return (
                  <path
                    d={d}
                    fill="none"
                    stroke="#fbbf24"
                    strokeWidth={2.5}
                    strokeDasharray="5 5"
                  />
                )
              })()}
            </svg>

            {/* OpenBot DiagramNodeCard Layer */}
            {activeTeam.nodes.map((node, index) => {
              const ag = agents.find(a => a.id === node.agentId)
              if (!ag) return null
              const isSelected = selectedNodeId === node.id
              const isCoord = node.roleInTeam === 'coordinator'
              const isConnected = reachableFromCoordinator.has(node.id)
              const canReadContext = ag.allowedActions.includes('read_context')

              return (
                <div
                  key={node.id}
                  style={{
                    left: node.position.x,
                    top: node.position.y,
                    width: DIAGRAM_NODE_WIDTH
                  }}
                  onPointerDown={e => {
                    e.stopPropagation()
                    setSelectedNodeId(node.id)
                    setSelectedEdgeId(null)
                    const world = screenToWorld(e.clientX, e.clientY)
                    dragOffsetRef.current = {
                      x: world.x - node.position.x,
                      y: world.y - node.position.y
                    }
                    setDraggingNodeId(node.id)
                  }}
                  onDoubleClick={e => {
                    e.stopPropagation()
                    setSelectedNodeId(node.id)
                    setInspectorOpen(true)
                  }}
                  className={`absolute rounded-2xl border bg-[#141720]/95 backdrop-blur-md shadow-2xl transition-shadow cursor-move ${
                    isSelected
                      ? 'border-amber-400 ring-2 ring-amber-400/25'
                      : !isConnected
                      ? 'border-amber-500/40 opacity-80'
                      : 'border-[var(--bg-border)] hover:border-white/25'
                  }`}
                >
                  {/* Input Port (Left - at y=26px like OpenBot) */}
                  {!isCoord && (
                    <button
                      type="button"
                      title="Porta de Entrada (solte uma conexão aqui)"
                      onPointerDown={e => e.stopPropagation()}
                      onPointerUp={e => {
                        e.stopPropagation()
                        if (wireDraft && wireDraft.fromNodeId !== node.id) {
                          completeWireConnection(wireDraft.fromNodeId, node.id)
                          setWireDraft(null)
                        }
                      }}
                      style={{ top: 20, left: -7 }}
                      className={`absolute w-3.5 h-3.5 rounded-full border-2 transition-transform ${
                        wireDraft?.hoveredTargetId === node.id
                          ? 'bg-emerald-400 border-white scale-125'
                          : 'bg-[#181b24] border-amber-400 hover:scale-125'
                      }`}
                    />
                  )}

                  {/* Output Port (Right - drag from here to connect like OpenBot) */}
                  <button
                    type="button"
                    title="Arraste desta porta para conectar a outro agente"
                    onPointerDown={e => {
                      e.stopPropagation()
                      const outPort = diagramOutputPort(node.position)
                      setWireDraft({
                        fromNodeId: node.id,
                        toWorld: outPort,
                        hoveredTargetId: null
                      })
                    }}
                    style={{ top: 20, right: -7 }}
                    className="absolute w-3.5 h-3.5 rounded-full bg-amber-400 border-2 border-[#0b0c10] hover:scale-125 transition-transform cursor-crosshair"
                  />

                  {/* Card Header */}
                  <div className="p-3 border-b border-[var(--bg-border)] flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className="w-8 h-8 rounded-xl flex items-center justify-center text-base shrink-0 border border-white/10"
                        style={{ backgroundColor: `${ag.color}22`, color: ag.color }}
                      >
                        {ag.icon}
                      </span>
                      <div className="min-w-0">
                        <div className="text-[10px] uppercase tracking-wider font-semibold text-amber-400/90 flex items-center gap-1">
                          {isCoord ? (
                            <>
                              <Crown className="w-3 h-3" /> Coordenador
                            </>
                          ) : (
                            <span>Etapa {index} • {node.roleInTeam === 'reviewer' ? 'Revisor' : 'Especialista'}</span>
                          )}
                        </div>
                        <div className="text-xs font-bold text-[var(--text-main)] truncate">
                          {ag.name}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {onOpenAgentChat && (
                        <button
                          type="button"
                          onPointerDown={e => e.stopPropagation()}
                          onClick={e => {
                            e.stopPropagation()
                            onOpenAgentChat(ag.id)
                          }}
                          className="p-1 rounded-lg hover:bg-white/10 text-[var(--text-muted)] hover:text-amber-300"
                          title="Conversar diretamente com este agente"
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {!isCoord && (
                        <button
                          type="button"
                          onPointerDown={e => e.stopPropagation()}
                          onClick={e => {
                            e.stopPropagation()
                            handleRemoveNode(node.id)
                          }}
                          className="p-1 rounded-lg hover:bg-red-500/20 text-[var(--text-muted)] hover:text-red-300"
                          title="Remover do canvas"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Card Body */}
                  <div className="p-3 space-y-2">
                    <p className="text-[11px] text-[var(--text-muted)] line-clamp-2 leading-relaxed">
                      {ag.roleDescription}
                    </p>

                    <div className="flex flex-wrap gap-1">
                      {node.contextScope.map(role => (
                        <span
                          key={role}
                          className="text-[9px] px-1.5 py-0.5 rounded font-medium"
                          style={{
                            backgroundColor: `${ROLE_LABELS[role].badgeColor}20`,
                            color: ROLE_LABELS[role].badgeColor
                          }}
                        >
                          {ROLE_LABELS[role].label.split(' ')[0]}
                        </span>
                      ))}
                    </div>

                    {/* Footer Status Row (OpenBot DiagramNodeCard footer style) */}
                    <div className="pt-1.5 border-t border-white/5 flex items-center justify-between text-[10px]">
                      <span
                        className={`flex items-center gap-1.5 font-medium ${
                          !isConnected
                            ? 'text-amber-400'
                            : !canReadContext
                            ? 'text-red-400'
                            : 'text-emerald-400'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            !isConnected
                              ? 'bg-amber-400'
                              : !canReadContext
                              ? 'bg-red-400'
                              : 'bg-emerald-400'
                          }`}
                        />
                        {!isConnected
                          ? 'Sem conexão (ignorado)'
                          : !canReadContext
                          ? 'Sem read_context'
                          : 'Conectado'}
                      </span>
                      <button
                        type="button"
                        onPointerDown={e => e.stopPropagation()}
                        onClick={e => {
                          e.stopPropagation()
                          setSelectedNodeId(node.id)
                          setInspectorOpen(true)
                        }}
                        className="text-[10px] text-[var(--text-muted)] hover:text-amber-300 underline"
                      >
                        Configurar
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* OpenBot Right-Click Context Menu (`DiagramCanvasMenu` + `DiagramNewAgentCard`) */}
          {canvasMenu && (
            <div
              style={{ left: canvasMenu.screenX, top: canvasMenu.screenY }}
              onPointerDown={e => e.stopPropagation()}
              className="absolute z-30 w-68 rounded-2xl border border-[var(--bg-border)] bg-[#141720]/98 backdrop-blur-xl shadow-2xl p-2.5 text-xs animate-in fade-in zoom-in-95 duration-100"
            >
              {!canvasMenu.creatingNewAgent ? (
                <>
                  <div className="flex items-center justify-between px-2 py-1 text-[10px] uppercase tracking-wider font-semibold text-[var(--text-muted)]">
                    <span>Adicionar Agente Aqui</span>
                    <button onClick={() => setCanvasMenu(null)} className="hover:text-white">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="max-h-48 overflow-y-auto space-y-1 my-1">
                    {agents.map(ag => (
                      <button
                        key={ag.id}
                        onClick={() =>
                          handleAddMemberNodeAt(ag.id, {
                            x: canvasMenu.worldX,
                            y: canvasMenu.worldY
                          })
                        }
                        className="w-full px-2.5 py-1.5 rounded-xl hover:bg-white/10 flex items-center gap-2 text-left transition-colors"
                      >
                        <span className="text-sm">{ag.icon}</span>
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-[var(--text-main)] truncate">
                            {ag.name}
                          </div>
                          <div className="text-[10px] text-[var(--text-muted)] truncate">
                            {ag.workStyle.tone}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                  <div className="pt-1 border-t border-[var(--bg-border)]">
                    <button
                      onClick={() => setCanvasMenu({ ...canvasMenu, creatingNewAgent: true })}
                      className="w-full px-2.5 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 font-semibold flex items-center gap-1.5"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      Criar novo agente neste ponto...
                    </button>
                  </div>
                </>
              ) : (
                <div className="space-y-2 p-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-amber-300">Novo Agente no Canvas</span>
                    <button onClick={() => setCanvasMenu(null)} className="text-[var(--text-muted)] hover:text-white">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <input
                    type="text"
                    value={newAgentName}
                    onChange={e => setNewAgentName(e.target.value)}
                    placeholder="Nome do agente..."
                    className="w-full bg-[#0e1017] border border-[var(--bg-border)] rounded-lg px-2.5 py-1.5 text-xs text-[var(--text-main)]"
                    autoFocus
                  />
                  <textarea
                    value={newAgentPrompt}
                    onChange={e => setNewAgentPrompt(e.target.value)}
                    rows={2}
                    placeholder="Função e estilo de trabalho..."
                    className="w-full bg-[#0e1017] border border-[var(--bg-border)] rounded-lg px-2.5 py-1.5 text-xs text-[var(--text-main)] resize-none"
                  />
                  <div className="flex justify-end gap-1.5">
                    <button
                      onClick={() => setCanvasMenu({ ...canvasMenu, creatingNewAgent: false })}
                      className="px-2.5 py-1 rounded-lg bg-white/5 text-[11px] text-[var(--text-muted)]"
                    >
                      Voltar
                    </button>
                    <button
                      onClick={handleCreateInlineAgentAtCursor}
                      className="px-3 py-1 rounded-lg bg-amber-500 text-black font-semibold text-[11px]"
                    >
                      Criar e Conectar
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* OpenBot Bottom-Left Floating Zoom Controls */}
          <div className="absolute bottom-4 left-4 z-20 flex items-center gap-1 bg-[#141720]/95 backdrop-blur-md border border-[var(--bg-border)] rounded-xl p-1 shadow-xl">
            <button
              onClick={() => setZoom(z => Math.max(0.45, Number((z - 0.1).toFixed(2))))}
              className="p-1.5 rounded-lg hover:bg-white/10 text-[var(--text-muted)] hover:text-white"
              title="Diminuir Zoom"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="text-[11px] font-mono px-2 text-[var(--text-main)]">
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={() => setZoom(z => Math.min(1.6, Number((z + 0.1).toFixed(2))))}
              className="p-1.5 rounded-lg hover:bg-white/10 text-[var(--text-muted)] hover:text-white"
              title="Aumentar Zoom"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <div className="w-px h-4 bg-[var(--bg-border)] mx-0.5" />
            <button
              onClick={handleFitView}
              className="px-2 py-1 rounded-lg hover:bg-white/10 text-[11px] text-[var(--text-muted)] hover:text-white flex items-center gap-1"
              title="Ajustar todos os blocos à tela"
            >
              <Maximize2 className="w-3 h-3" />
              Ajustar
            </button>
          </div>

          {/* OpenBot Bottom-Right Floating DiagramChatPanel */}
          <div className="absolute bottom-4 right-4 z-20">
            {!chatOpen ? (
              <button
                onClick={() => setChatOpen(true)}
                className="flex items-center gap-2 px-3.5 py-2 rounded-full bg-[#141720]/95 hover:bg-[#1c202c] border border-amber-500/40 text-xs font-medium text-amber-300 shadow-2xl transition-all"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                Assistente do Canvas
              </button>
            ) : (
              <div
                onPointerDown={e => e.stopPropagation()}
                className="w-80 rounded-2xl border border-[var(--bg-border)] bg-[#141720]/98 backdrop-blur-xl shadow-2xl overflow-hidden flex flex-col"
              >
                <div className="px-3.5 py-2.5 border-b border-[var(--bg-border)] flex items-center justify-between bg-[#181b26]">
                  <div className="flex items-center gap-2 text-xs font-semibold text-amber-300">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Assistente da Equipe</span>
                  </div>
                  <button
                    onClick={() => setChatOpen(false)}
                    className="p-1 rounded hover:bg-white/10 text-[var(--text-muted)]"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="p-3 max-h-52 overflow-y-auto space-y-2 text-xs">
                  {chatMessages.map(m => (
                    <div
                      key={m.id}
                      className={`p-2 rounded-xl ${
                        m.sender === 'user'
                          ? 'bg-amber-500/20 text-amber-100 ml-6'
                          : 'bg-white/5 text-[var(--text-main)] mr-4'
                      }`}
                    >
                      {m.text}
                    </div>
                  ))}
                </div>
                <div className="p-2 border-t border-[var(--bg-border)] flex items-center gap-1.5">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSendCanvasChat()}
                    placeholder="Ex: Adicionar Cartógrafo..."
                    className="flex-1 bg-[#0e1017] border border-[var(--bg-border)] rounded-lg px-2.5 py-1.5 text-xs text-[var(--text-main)] focus:outline-none"
                  />
                  <button
                    onClick={handleSendCanvasChat}
                    className="p-1.5 rounded-lg bg-amber-500 text-black hover:bg-amber-400"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* OpenBot Collapsible Right-Hand DiagramInspector Drawer (Opens ONLY when toggled) */}
          {inspectorOpen && (
            <div
              onPointerDown={e => e.stopPropagation()}
              className="absolute top-0 right-0 bottom-0 w-80 bg-[#141720]/98 backdrop-blur-xl border-l border-[var(--bg-border)] z-30 p-4 overflow-y-auto shadow-2xl space-y-4 animate-in slide-in-from-right duration-150"
            >
              <div className="flex items-center justify-between border-b border-[var(--bg-border)] pb-2.5">
                <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400">
                  {selectedNode && selectedNodeAgent ? 'Inspetor do Membro' : 'Configurações da Equipe'}
                </h4>
                <button
                  onClick={() => setInspectorOpen(false)}
                  className="p-1 rounded-lg hover:bg-white/10 text-[var(--text-muted)] hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {selectedNode && selectedNodeAgent ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-2.5">
                    <span className="text-2xl">{selectedNodeAgent.icon}</span>
                    <div>
                      <div className="text-sm font-bold text-[var(--text-main)]">
                        {selectedNodeAgent.name}
                      </div>
                      <div className="text-[11px] text-[var(--text-muted)]">
                        {selectedNodeAgent.workStyle.tone}
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] text-[var(--text-muted)] block mb-1">
                      Papel dentro desta Equipe
                    </label>
                    <select
                      value={selectedNode.roleInTeam}
                      onChange={e => {
                        const roleInTeam = e.target.value as TeamMemberNode['roleInTeam']
                        const updatedNodes = activeTeam.nodes.map(n =>
                          n.id === selectedNode.id ? { ...n, roleInTeam } : n
                        )
                        onSaveTeam({
                          ...activeTeam,
                          coordinatorAgentId:
                            roleInTeam === 'coordinator'
                              ? selectedNode.agentId
                              : activeTeam.coordinatorAgentId,
                          nodes: updatedNodes,
                          updatedAt: Date.now()
                        })
                      }}
                      className="w-full bg-[#0e1017] border border-[var(--bg-border)] rounded-lg px-2.5 py-1.5 text-xs text-[var(--text-main)]"
                    >
                      <option value="coordinator">Coordenador Principal</option>
                      <option value="specialist">Especialista Executor</option>
                      <option value="reviewer">Revisor Independente</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] text-[var(--text-muted)] block mb-1.5">
                      Escopo de Contexto Compartilhado
                    </label>
                    <div className="space-y-1.5">
                      {(Object.keys(ROLE_LABELS) as ContextRole[]).map(role => {
                        const checked = selectedNode.contextScope.includes(role)
                        return (
                          <label
                            key={role}
                            className="flex items-start gap-2 p-2 rounded-lg bg-[#0e1017] border border-[var(--bg-border)] cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => handleToggleNodeScope(selectedNode.id, role)}
                              className="mt-0.5 accent-amber-500"
                            />
                            <div>
                              <div className="text-xs font-medium text-[var(--text-main)]">
                                {ROLE_LABELS[role].label}
                              </div>
                              <div className="text-[10px] text-[var(--text-muted)]">
                                {ROLE_LABELS[role].description}
                              </div>
                            </div>
                          </label>
                        )
                      })}
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] text-[var(--text-muted)] block mb-1.5">
                      Entregas Autorizadas na Equipe
                    </label>
                    <div className="grid grid-cols-2 gap-1.5">
                      {(
                        [
                          { id: 'note', label: 'Nota Markdown' },
                          { id: 'tasks', label: 'Tarefas' },
                          { id: 'mindmap', label: 'Mapa Mental' },
                          { id: 'draw', label: 'Diagrama' }
                        ] as const
                      ).map(item => (
                        <label
                          key={item.id}
                          className="flex items-center gap-1.5 p-2 rounded-lg bg-[#0e1017] border border-[var(--bg-border)] text-xs cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={selectedNode.allowedOutputTypes.includes(item.id)}
                            onChange={() => handleToggleNodeOutput(selectedNode.id, item.id)}
                            className="accent-amber-500"
                          />
                          <span>{item.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="text-[11px] text-[var(--text-muted)] block mb-1">
                      Nome da Equipe
                    </label>
                    <input
                      type="text"
                      value={activeTeam.name}
                      onChange={e =>
                        onSaveTeam({ ...activeTeam, name: e.target.value, updatedAt: Date.now() })
                      }
                      className="w-full bg-[#0e1017] border border-[var(--bg-border)] rounded-lg px-2.5 py-1.5 text-xs text-[var(--text-main)]"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-[var(--text-muted)] block mb-1">
                      Descrição
                    </label>
                    <textarea
                      value={activeTeam.description}
                      onChange={e =>
                        onSaveTeam({
                          ...activeTeam,
                          description: e.target.value,
                          updatedAt: Date.now()
                        })
                      }
                      rows={3}
                      className="w-full bg-[#0e1017] border border-[var(--bg-border)] rounded-lg px-2.5 py-1.5 text-xs text-[var(--text-main)] resize-none"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-[var(--text-muted)] block mb-1">
                      Adicionar Agente ao Canvas
                    </label>
                    <div className="space-y-1">
                      {agents.map(ag => (
                        <button
                          key={ag.id}
                          onClick={() => handleAddMemberNodeAt(ag.id)}
                          className="w-full px-2.5 py-1.5 rounded-lg bg-[#0e1017] hover:bg-white/5 border border-[var(--bg-border)] flex items-center justify-between text-xs"
                        >
                          <span className="flex items-center gap-2 truncate">
                            <span>{ag.icon}</span>
                            <span className="truncate">{ag.name}</span>
                          </span>
                          <Plus className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        /* Modo em Lista Acessível */
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-[var(--text-main)]">{activeTeam.name}</h3>
              <p className="text-xs text-[var(--text-muted)]">{activeTeam.description}</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {activeTeam.nodes.map(node => {
              const ag = agents.find(a => a.id === node.agentId)
              if (!ag) return null
              const isConnected = reachableFromCoordinator.has(node.id)
              return (
                <div
                  key={node.id}
                  className="p-4 rounded-xl border border-[var(--bg-border)] bg-[#141720] space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{ag.icon}</span>
                      <div>
                        <div className="text-xs font-bold text-[var(--text-main)]">{ag.name}</div>
                        <div className="text-[10px] text-amber-400 uppercase">{node.roleInTeam}</div>
                      </div>
                    </div>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full ${
                        isConnected
                          ? 'bg-emerald-500/15 text-emerald-300'
                          : 'bg-amber-500/15 text-amber-300'
                      }`}
                    >
                      {isConnected ? 'Conectado' : 'Sem conexão'}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--text-muted)]">{ag.roleDescription}</p>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
