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
  DIAGRAM_NODE_WIDTH,
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
  FlaskConical,
  CheckCircle2,
  AlertTriangle,
  ZoomIn,
  ZoomOut,
  Maximize2,
  LayoutGrid,
  List,
  PanelRight,
  X
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
  { label: string; badge: string; color: string; description: string }
> = {
  input: {
    label: 'Entrada / Pedido',
    badge: 'ENTRADA',
    color: '#06b6d4',
    description: 'Recebe o pedido do usuário, cliente selecionado ou evento disparador.'
  },
  read_note: {
    label: 'Consultar Nota',
    badge: 'FONTE',
    color: '#8b5cf6',
    description: 'Lê uma nota de modelo, catálogo ou contexto autorizado.'
  },
  run_agent: {
    label: 'Executar Agente',
    badge: 'AGENTE',
    color: '#c59b27',
    description: 'Executa um especialista dentro de suas permissões e fontes.'
  },
  condition: {
    label: 'Verificar Condição',
    badge: 'CONDIÇÃO',
    color: '#f59e0b',
    description: 'Verifica se há pendências, conflitos ou valor mínimo antes de avançar.'
  },
  approval: {
    label: 'Solicitar Aprovação',
    badge: 'APROVAÇÃO',
    color: '#ec4899',
    description: 'Pausa imediatamente o fluxo para revisão humana antes dos blocos seguintes.'
  },
  deliverable: {
    label: 'Criar Entrega',
    badge: 'ENTREGA',
    color: '#10b981',
    description: 'Prepara a nota, tarefa, mapa mental ou diagrama na pasta escolhida.'
  },
  finish: {
    label: 'Finalizar',
    badge: 'FIM',
    color: '#64748b',
    description: 'Encerra a execução e registra o histórico auditável.'
  }
}

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
  const [viewMode, setViewMode] = useState<'canvas' | 'list'>('canvas')
  const [zoom, setZoom] = useState(0.92)
  const [pan, setPan] = useState({ x: 36, y: 42 })
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)
  const [inspectorOpen, setInspectorOpen] = useState(false)
  const [branchToConnect, setBranchToConnect] = useState<WorkflowEdge['branch']>('default')
  const [testPrompt, setTestPrompt] = useState(
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

  // OpenBot Right-Click Context Menu
  const [canvasMenu, setCanvasMenu] = useState<{
    screenX: number
    screenY: number
    worldX: number
    worldY: number
  } | null>(null)

  const viewportRef = useRef<HTMLDivElement>(null)

  if (!activeWorkflow) return null

  const validation = validateWorkflowDefinition(activeWorkflow, agents, notes)
  const selectedNode = activeWorkflow.nodes.find(n => n.id === selectedNodeId)

  const screenToWorld = (clientX: number, clientY: number) => {
    const rect = viewportRef.current?.getBoundingClientRect()
    if (!rect) return { x: 200, y: 160 }
    return {
      x: (clientX - rect.left - pan.x) / zoom,
      y: (clientY - rect.top - pan.y) / zoom
    }
  }

  const handleFitView = () => {
    const rect = viewportRef.current?.getBoundingClientRect()
    const bounds = diagramBounds(activeWorkflow.nodes.map(n => n.position))
    if (!rect || !bounds) {
      setZoom(0.92)
      setPan({ x: 36, y: 42 })
      return
    }
    const nextZoom = Math.max(
      0.42,
      Math.min(1.15, Math.min((rect.width - 120) / bounds.width, (rect.height - 120) / bounds.height))
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
    const nAppId = `wn_ap_${Date.now()}`
    const nDelId = `wn_del_${Date.now()}`
    const nFinId = `wn_fin_${Date.now()}`

    const newWf: WorkflowDefinition = {
      id: `wf_${Date.now()}`,
      version: 1,
      status: 'draft',
      name: `Novo Fluxo (${workflows.length + 1})`,
      description: 'Fluxo de trabalho visual passo a passo com aprovação.',
      nodes: [
        { id: nInId, kind: 'input', label: 'Entrada do Pedido', position: { x: 64, y: 160 }, config: {} },
        {
          id: nAgId,
          kind: 'run_agent',
          label: firstAgent?.name || 'Executar Agente',
          position: { x: 368, y: 160 },
          config: { agentId: firstAgent?.id }
        },
        {
          id: nAppId,
          kind: 'approval',
          label: 'Solicitar Aprovação',
          position: { x: 672, y: 160 },
          config: { approvalMessage: 'Revise o rascunho antes de gravar no cofre.' }
        },
        {
          id: nDelId,
          kind: 'deliverable',
          label: 'Salvar Entrega',
          position: { x: 976, y: 160 },
          config: { targetFolder: 'Propostas', outputType: 'note', namingPattern: 'Entrega - {cliente}' }
        },
        { id: nFinId, kind: 'finish', label: 'Finalizar', position: { x: 1280, y: 160 }, config: {} }
      ],
      edges: [
        { id: `we_1_${Date.now()}`, sourceNodeId: nInId, targetNodeId: nAgId, branch: 'default' },
        { id: `we_2_${Date.now()}`, sourceNodeId: nAgId, targetNodeId: nAppId, branch: 'default' },
        { id: `we_3_${Date.now()}`, sourceNodeId: nAppId, targetNodeId: nDelId, branch: 'approved', label: 'Aprovado' },
        { id: `we_4_${Date.now()}`, sourceNodeId: nDelId, targetNodeId: nFinId, branch: 'default' }
      ],
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    onSaveWorkflow(newWf)
    onSelectWorkflow(newWf.id)
  }

  const handleAddNodeAt = (kind: WorkflowNodeKind, worldPos?: { x: number; y: number }) => {
    const meta = NODE_META[kind]
    const count = activeWorkflow.nodes.length
    const pos = worldPos
      ? { x: snapDiagramCoord(worldPos.x), y: snapDiagramCoord(worldPos.y) }
      : {
          x: snapDiagramCoord(240 + (count % 4) * 288),
          y: snapDiagramCoord(80 + Math.floor(count / 4) * 160)
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
    setCanvasMenu(null)
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

    const newEdge: WorkflowEdge = {
      id: `we_${Date.now()}`,
      sourceNodeId: fromId,
      targetNodeId: toId,
      branch: branchToConnect,
      label:
        branchToConnect === 'true'
          ? 'Verdadeiro'
          : branchToConnect === 'false'
          ? 'Falso'
          : branchToConnect === 'approved'
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
        if (n.id === wireDraft.fromNodeId || n.kind === 'input') continue
        const inPort = diagramInputPort(n.position)
        if (Math.hypot(world.x - inPort.x, world.y - inPort.y) < 34) {
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
      const world = screenToWorld(e.clientX, e.clientY)
      const newX = Math.max(16, snapDiagramCoord(world.x - dragOffsetRef.current.x))
      const newY = Math.max(16, snapDiagramCoord(world.y - dragOffsetRef.current.y))
      const updatedNodes = activeWorkflow.nodes.map(n =>
        n.id === draggingNodeId ? { ...n, position: { x: newX, y: newY } } : n
      )
      onSaveWorkflow({ ...activeWorkflow, nodes: updatedNodes, updatedAt: Date.now() })
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

  const updateSelectedNodeConfig = (patch: Partial<WorkflowNode['config']>, newLabel?: string) => {
    if (!selectedNode) return
    const updatedNodes = activeWorkflow.nodes.map(n =>
      n.id === selectedNode.id
        ? {
            ...n,
            label: newLabel !== undefined ? newLabel : n.label,
            config: { ...n.config, ...patch }
          }
        : n
    )
    onSaveWorkflow({
      ...activeWorkflow,
      version: activeWorkflow.version + 1,
      nodes: updatedNodes,
      updatedAt: Date.now()
    })
  }

  return (
    <div className="relative flex flex-col w-full h-full overflow-hidden bg-[#0b0c10] select-none">
      {/* Top OpenBot Workflow Header */}
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-[var(--bg-border)] bg-[#11131a]/95 backdrop-blur-md z-20 shrink-0 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-400">
            <GitBranch className="w-4 h-4" />
            <span>Fluxo:</span>
          </div>
          <select
            value={activeWorkflow.id}
            onChange={e => onSelectWorkflow(e.target.value)}
            className="bg-[#181b24] border border-[var(--bg-border)] rounded-lg px-2.5 py-1.5 text-xs font-medium text-[var(--text-main)]"
          >
            {workflows.map(w => (
              <option key={w.id} value={w.id}>
                {w.name} (v{w.version} • {w.status === 'published' ? 'Publicado' : 'Rascunho'})
              </option>
            ))}
          </select>

          <button
            onClick={handleCreateWorkflow}
            className="px-2.5 py-1.5 rounded-lg bg-[var(--bg-elevated)] hover:bg-[var(--bg-border)] text-xs text-[var(--text-main)] flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5 text-amber-400" />
            Novo Fluxo
          </button>

          {workflows.length > 1 && (
            <button
              onClick={() => onDeleteWorkflow(activeWorkflow.id)}
              className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-300"
              title="Excluir fluxo"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Quick Add Block Pills */}
          <div className="hidden xl:flex items-center gap-1 pl-2 border-l border-[var(--bg-border)]">
            {(['read_note', 'run_agent', 'condition', 'approval', 'deliverable'] as WorkflowNodeKind[]).map(
              kind => (
                <button
                  key={kind}
                  onClick={() => handleAddNodeAt(kind)}
                  className="px-2 py-1 rounded-md bg-[#181b24] hover:bg-white/10 border border-[var(--bg-border)] text-[10px] font-medium flex items-center gap-1"
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: NODE_META[kind].color }}
                  />
                  + {NODE_META[kind].badge}
                </button>
              )
            )}
          </div>
        </div>

        {/* Right Run Controls + Inspector Toggle */}
        <div className="flex items-center gap-2">
          <span
            className={`text-[11px] px-2 py-1 rounded-lg flex items-center gap-1 ${
              validation.valid
                ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
            }`}
            title={validation.errors.join(' | ')}
          >
            {validation.valid ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5" /> Válido
              </>
            ) : (
              <>
                <AlertTriangle className="w-3.5 h-3.5" /> {validation.errors.length} alerta(s)
              </>
            )}
          </span>

          <input
            type="text"
            value={testPrompt}
            onChange={e => setTestPrompt(e.target.value)}
            placeholder="Pedido para executar o fluxo..."
            className="w-56 lg:w-72 bg-[#181b24] border border-[var(--bg-border)] rounded-lg px-2.5 py-1.5 text-xs text-[var(--text-main)]"
          />

          <button
            disabled={isExecuting}
            onClick={() => onRunWorkflow(activeWorkflow, true, testPrompt)}
            className="px-2.5 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 text-xs font-medium flex items-center gap-1 disabled:opacity-50"
          >
            <FlaskConical className="w-3.5 h-3.5" />
            Testar
          </button>

          <button
            disabled={isExecuting}
            onClick={() => onRunWorkflow(activeWorkflow, false, testPrompt)}
            className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-xs font-semibold flex items-center gap-1 disabled:opacity-50"
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
            >
              <LayoutGrid className="w-3 h-3" />
              Canvas
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`px-2 py-1 rounded text-[11px] flex items-center gap-1 ${
                viewMode === 'list' ? 'bg-amber-500 text-black font-semibold' : 'text-[var(--text-muted)]'
              }`}
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
            title="Abrir/Fechar Inspetor Lateral"
          >
            <PanelRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Full-Bleed Canvas */}
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
              screenX: Math.min(e.clientX - rect.left, rect.width - 260),
              screenY: Math.min(e.clientY - rect.top, rect.height - 260),
              worldX: world.x,
              worldY: world.y
            })
          }}
          onWheel={e => {
            if (e.ctrlKey || e.metaKey) {
              e.preventDefault()
              const delta = e.deltaY < 0 ? 0.08 : -0.08
              setZoom(z => Math.min(1.5, Math.max(0.42, Number((z + delta).toFixed(2)))))
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
          {/* Floating Top-Left Branch Selector & Hint */}
          <div className="absolute top-3 left-4 z-10 flex items-center gap-2 bg-[#141720]/90 backdrop-blur-md border border-[var(--bg-border)] rounded-full px-3 py-1 text-[11px] text-[var(--text-muted)] shadow-lg">
            <span>Ramo ao conectar:</span>
            <select
              value={branchToConnect}
              onChange={e => setBranchToConnect(e.target.value as WorkflowEdge['branch'])}
              className="bg-[#0e1017] border border-[var(--bg-border)] rounded px-1.5 py-0.5 text-[10px] text-[var(--text-main)]"
            >
              <option value="default">Padrão</option>
              <option value="true">Verdadeiro (Condição)</option>
              <option value="false">Falso (Condição)</option>
              <option value="approved">Aprovado</option>
            </select>
            <span>•</span>
            <span>Clique direito no fundo para adicionar bloco</span>
          </div>

          <div
            data-canvas-bg="true"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: '0 0',
              width: 3400,
              height: 2200
            }}
            className="relative"
          >
            {/* OpenBot SVG Edges */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none overflow-visible">
              {activeWorkflow.edges.map(edge => {
                const src = activeWorkflow.nodes.find(n => n.id === edge.sourceNodeId)
                const dst = activeWorkflow.nodes.find(n => n.id === edge.targetNodeId)
                if (!src || !dst) return null
                const from = diagramOutputPort(src.position)
                const to = diagramInputPort(dst.position)
                const pathD = diagramEdgePath(from, to)
                const arrowD = diagramEdgeArrow(to)
                const mid = diagramEdgeMidpoint(from, to)
                const strokeColor =
                  edge.branch === 'false'
                    ? '#ef4444'
                    : edge.branch === 'true' || edge.branch === 'approved'
                    ? '#10b981'
                    : '#c59b27'

                return (
                  <g key={edge.id} className="pointer-events-auto">
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
                      stroke={strokeColor}
                      strokeWidth={selectedEdgeId === edge.id ? 3 : 2.2}
                      strokeDasharray={edge.branch === 'false' ? '5 5' : undefined}
                    />
                    <path
                      d={arrowD}
                      fill="none"
                      stroke={strokeColor}
                      strokeWidth={2.2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    {edge.label && (
                      <>
                        <rect
                          x={mid.x - 42}
                          y={mid.y - 20}
                          width={84}
                          height={16}
                          rx={8}
                          fill="#11131a"
                          stroke={strokeColor}
                          strokeWidth={1}
                        />
                        <text
                          x={mid.x}
                          y={mid.y - 9}
                          textAnchor="middle"
                          fill="#e4e4e7"
                          fontSize={9}
                          fontWeight={600}
                        >
                          {edge.label}
                        </text>
                      </>
                    )}
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

              {wireDraft && (() => {
                const src = activeWorkflow.nodes.find(n => n.id === wireDraft.fromNodeId)
                if (!src) return null
                const from = diagramOutputPort(src.position)
                return (
                  <path
                    d={diagramEdgePath(from, wireDraft.toWorld)}
                    fill="none"
                    stroke="#fbbf24"
                    strokeWidth={2.5}
                    strokeDasharray="5 5"
                  />
                )
              })()}
            </svg>

            {/* OpenBot DiagramNodeCards for Workflow Nodes */}
            {activeWorkflow.nodes.map(node => {
              const meta = NODE_META[node.kind]
              const isSelected = selectedNodeId === node.id
              const execState = latestNodeStates?.find(s => s.nodeId === node.id)
              const linkedAgent =
                node.kind === 'run_agent'
                  ? agents.find(a => a.id === node.config.agentId)
                  : undefined

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
                  className={`absolute rounded-2xl border bg-[#141720]/95 backdrop-blur-md shadow-2xl cursor-move transition-all ${
                    isSelected
                      ? 'border-amber-400 ring-2 ring-amber-400/25'
                      : 'border-[var(--bg-border)] hover:border-white/25'
                  }`}
                >
                  {/* Input Port */}
                  {node.kind !== 'input' && (
                    <button
                      type="button"
                      title="Porta de Entrada"
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

                  {/* Output Port */}
                  {node.kind !== 'finish' && (
                    <button
                      type="button"
                      title="Arraste desta porta para conectar ao próximo bloco"
                      onPointerDown={e => {
                        e.stopPropagation()
                        setWireDraft({
                          fromNodeId: node.id,
                          toWorld: diagramOutputPort(node.position),
                          hoveredTargetId: null
                        })
                      }}
                      style={{ top: 20, right: -7 }}
                      className="absolute w-3.5 h-3.5 rounded-full bg-amber-400 border-2 border-[#0b0c10] hover:scale-125 transition-transform cursor-crosshair"
                    />
                  )}

                  {/* Header */}
                  <div className="p-3 border-b border-[var(--bg-border)] flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <span
                        className="inline-block text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded mb-1"
                        style={{ backgroundColor: `${meta.color}25`, color: meta.color }}
                      >
                        {meta.badge}
                      </span>
                      <div className="text-xs font-bold text-[var(--text-main)] truncate">
                        {node.label}
                      </div>
                    </div>
                    {node.kind !== 'input' && (
                      <button
                        type="button"
                        onPointerDown={e => e.stopPropagation()}
                        onClick={e => {
                          e.stopPropagation()
                          handleRemoveNode(node.id)
                        }}
                        className="p-1 rounded-lg hover:bg-red-500/20 text-[var(--text-muted)] hover:text-red-300"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Body */}
                  <div className="p-3 space-y-2 text-[11px]">
                    {node.kind === 'run_agent' && (
                      <div className="text-[var(--text-muted)] flex items-center gap-1.5">
                        <span>{linkedAgent?.icon || '🤖'}</span>
                        <span className="text-[var(--text-main)] font-medium truncate">
                          {linkedAgent?.name || 'Selecionar Agente'}
                        </span>
                      </div>
                    )}
                    {node.kind === 'read_note' && (
                      <div className="text-[var(--text-muted)] truncate">
                        Nota: <strong className="text-purple-300">{node.config.noteTitle || 'Selecionar'}</strong>
                      </div>
                    )}
                    {node.kind === 'condition' && (
                      <div className="text-amber-300/90 text-[10px]">
                        Regra: {node.config.conditionType || 'no_missing_fields'}
                      </div>
                    )}
                    {node.kind === 'deliverable' && (
                      <div className="text-emerald-300/90 text-[10px]">
                        Pasta: <strong>{node.config.targetFolder || 'Propostas'}</strong>
                      </div>
                    )}
                    {node.kind === 'approval' && (
                      <div className="text-pink-300/90 text-[10px] line-clamp-2">
                        {node.config.approvalMessage || 'Pausa o fluxo para aprovação'}
                      </div>
                    )}

                    {/* Execution Status Footer */}
                    <div className="pt-1.5 border-t border-white/5 flex items-center justify-between text-[10px]">
                      {execState ? (
                        <span
                          className={`font-semibold ${
                            execState.status === 'completed'
                              ? 'text-emerald-400'
                              : execState.status === 'waiting_approval'
                              ? 'text-amber-400'
                              : execState.status === 'failed'
                              ? 'text-red-400'
                              : 'text-[var(--text-muted)]'
                          }`}
                        >
                          ●{' '}
                          {execState.status === 'completed'
                            ? 'Concluído'
                            : execState.status === 'waiting_approval'
                            ? 'Aguardando Aprovação'
                            : execState.status === 'skipped'
                            ? 'Pulado'
                            : execState.status === 'failed'
                            ? 'Falha'
                            : 'Pendente'}
                        </span>
                      ) : (
                        <span className="text-[var(--text-muted)]">Pronto</span>
                      )}
                      <button
                        type="button"
                        onPointerDown={e => e.stopPropagation()}
                        onClick={e => {
                          e.stopPropagation()
                          setSelectedNodeId(node.id)
                          setInspectorOpen(true)
                        }}
                        className="text-[var(--text-muted)] hover:text-amber-300 underline"
                      >
                        Editar
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Right-Click Context Menu */}
          {canvasMenu && (
            <div
              style={{ left: canvasMenu.screenX, top: canvasMenu.screenY }}
              onPointerDown={e => e.stopPropagation()}
              className="absolute z-30 w-60 rounded-2xl border border-[var(--bg-border)] bg-[#141720]/98 backdrop-blur-xl shadow-2xl p-2 text-xs"
            >
              <div className="flex items-center justify-between px-2 py-1 text-[10px] uppercase tracking-wider font-semibold text-[var(--text-muted)]">
                <span>Adicionar Bloco Aqui</span>
                <button onClick={() => setCanvasMenu(null)}>
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="space-y-1 mt-1">
                {(['read_note', 'run_agent', 'condition', 'approval', 'deliverable', 'finish'] as WorkflowNodeKind[]).map(
                  kind => (
                    <button
                      key={kind}
                      onClick={() =>
                        handleAddNodeAt(kind, { x: canvasMenu.worldX, y: canvasMenu.worldY })
                      }
                      className="w-full px-2.5 py-1.5 rounded-xl hover:bg-white/10 flex items-center gap-2 text-left"
                    >
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: NODE_META[kind].color }}
                      />
                      <div>
                        <div className="font-medium text-[var(--text-main)]">
                          {NODE_META[kind].label}
                        </div>
                        <div className="text-[10px] text-[var(--text-muted)] line-clamp-1">
                          {NODE_META[kind].description}
                        </div>
                      </div>
                    </button>
                  )
                )}
              </div>
            </div>
          )}

          {/* Bottom-Left Zoom Controls */}
          <div className="absolute bottom-4 left-4 z-20 flex items-center gap-1 bg-[#141720]/95 backdrop-blur-md border border-[var(--bg-border)] rounded-xl p-1 shadow-xl">
            <button
              onClick={() => setZoom(z => Math.max(0.42, Number((z - 0.1).toFixed(2))))}
              className="p-1.5 rounded-lg hover:bg-white/10 text-[var(--text-muted)] hover:text-white"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="text-[11px] font-mono px-2 text-[var(--text-main)]">
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={() => setZoom(z => Math.min(1.5, Number((z + 0.1).toFixed(2))))}
              className="p-1.5 rounded-lg hover:bg-white/10 text-[var(--text-muted)] hover:text-white"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <div className="w-px h-4 bg-[var(--bg-border)] mx-0.5" />
            <button
              onClick={handleFitView}
              className="px-2 py-1 rounded-lg hover:bg-white/10 text-[11px] text-[var(--text-muted)] hover:text-white flex items-center gap-1"
            >
              <Maximize2 className="w-3 h-3" />
              Ajustar
            </button>
          </div>

          {/* Collapsible Right-Hand DiagramInspector */}
          {inspectorOpen && (
            <div
              onPointerDown={e => e.stopPropagation()}
              className="absolute top-0 right-0 bottom-0 w-80 bg-[#141720]/98 backdrop-blur-xl border-l border-[var(--bg-border)] z-30 p-4 overflow-y-auto shadow-2xl space-y-4"
            >
              <div className="flex items-center justify-between border-b border-[var(--bg-border)] pb-2.5">
                <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400">
                  {selectedNode ? `Bloco: ${NODE_META[selectedNode.kind].badge}` : 'Propriedades do Fluxo'}
                </h4>
                <button
                  onClick={() => setInspectorOpen(false)}
                  className="p-1 rounded-lg hover:bg-white/10 text-[var(--text-muted)]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {selectedNode ? (
                <div className="space-y-3 text-xs">
                  <div>
                    <label className="text-[11px] text-[var(--text-muted)] block mb-1">
                      Título do Bloco
                    </label>
                    <input
                      type="text"
                      value={selectedNode.label}
                      onChange={e => updateSelectedNodeConfig({}, e.target.value)}
                      className="w-full bg-[#0e1017] border border-[var(--bg-border)] rounded-lg px-2.5 py-1.5 text-xs text-[var(--text-main)]"
                    />
                  </div>

                  {selectedNode.kind === 'run_agent' && (
                    <div>
                      <label className="text-[11px] text-[var(--text-muted)] block mb-1">
                        Agente Executor
                      </label>
                      <select
                        value={selectedNode.config.agentId || ''}
                        onChange={e => {
                          const ag = agents.find(a => a.id === e.target.value)
                          updateSelectedNodeConfig({ agentId: e.target.value }, ag?.name)
                        }}
                        className="w-full bg-[#0e1017] border border-[var(--bg-border)] rounded-lg px-2.5 py-1.5 text-xs text-[var(--text-main)]"
                      >
                        {agents.map(ag => (
                          <option key={ag.id} value={ag.id}>
                            {ag.icon} {ag.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {selectedNode.kind === 'read_note' && (
                    <div>
                      <label className="text-[11px] text-[var(--text-muted)] block mb-1">
                        Nota Autorizada do Cofre
                      </label>
                      <select
                        value={selectedNode.config.noteId || ''}
                        onChange={e => {
                          const nt = notes.find(n => n.id === e.target.value)
                          updateSelectedNodeConfig(
                            { noteId: nt?.id, noteTitle: nt?.title },
                            nt ? `Ler: ${nt.title}` : selectedNode.label
                          )
                        }}
                        className="w-full bg-[#0e1017] border border-[var(--bg-border)] rounded-lg px-2.5 py-1.5 text-xs text-[var(--text-main)]"
                      >
                        <option value="">Selecione uma nota...</option>
                        {notes.map(n => (
                          <option key={n.id} value={n.id}>
                            {n.title} ({n.folder})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {selectedNode.kind === 'condition' && (
                    <div>
                      <label className="text-[11px] text-[var(--text-muted)] block mb-1">
                        Tipo de Verificação
                      </label>
                      <select
                        value={selectedNode.config.conditionType || 'no_missing_fields'}
                        onChange={e =>
                          updateSelectedNodeConfig({
                            conditionType: e.target.value as WorkflowNode['config']['conditionType']
                          })
                        }
                        className="w-full bg-[#0e1017] border border-[var(--bg-border)] rounded-lg px-2.5 py-1.5 text-xs text-[var(--text-main)]"
                      >
                        <option value="no_missing_fields">Sem campos obrigatórios pendentes</option>
                        <option value="no_price_conflicts">Sem divergências de preços</option>
                        <option value="net_total_above">Valor líquido acima de R$</option>
                        <option value="always">Sempre verdadeiro</option>
                      </select>
                    </div>
                  )}

                  {selectedNode.kind === 'deliverable' && (
                    <>
                      <div>
                        <label className="text-[11px] text-[var(--text-muted)] block mb-1">
                          Pasta de Destino
                        </label>
                        <input
                          type="text"
                          list="wf-folders-list"
                          value={selectedNode.config.targetFolder || ''}
                          onChange={e => updateSelectedNodeConfig({ targetFolder: e.target.value })}
                          className="w-full bg-[#0e1017] border border-[var(--bg-border)] rounded-lg px-2.5 py-1.5 text-xs text-[var(--text-main)]"
                        />
                        <datalist id="wf-folders-list">
                          {folders.map(f => (
                            <option key={f} value={f} />
                          ))}
                        </datalist>
                      </div>
                      <div>
                        <label className="text-[11px] text-[var(--text-muted)] block mb-1">
                          Padrão de Nome da Entrega
                        </label>
                        <input
                          type="text"
                          value={selectedNode.config.namingPattern || ''}
                          onChange={e => updateSelectedNodeConfig({ namingPattern: e.target.value })}
                          className="w-full bg-[#0e1017] border border-[var(--bg-border)] rounded-lg px-2.5 py-1.5 text-xs text-[var(--text-main)]"
                        />
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <div className="space-y-3 text-xs">
                  <div>
                    <label className="text-[11px] text-[var(--text-muted)] block mb-1">
                      Nome do Fluxo
                    </label>
                    <input
                      type="text"
                      value={activeWorkflow.name}
                      onChange={e =>
                        onSaveWorkflow({
                          ...activeWorkflow,
                          name: e.target.value,
                          updatedAt: Date.now()
                        })
                      }
                      className="w-full bg-[#0e1017] border border-[var(--bg-border)] rounded-lg px-2.5 py-1.5 text-xs text-[var(--text-main)]"
                    />
                  </div>
                  {!validation.valid && (
                    <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 space-y-1">
                      <div className="font-semibold">Avisos de validação:</div>
                      {validation.errors.map((err, i) => (
                        <div key={i} className="text-[11px]">
                          • {err}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {activeWorkflow.nodes.map((node, i) => (
            <div
              key={node.id}
              className="p-3.5 rounded-xl border border-[var(--bg-border)] bg-[#141720] flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <span className="text-xs font-mono text-[var(--text-muted)]">#{i + 1}</span>
                <div>
                  <div className="text-xs font-bold text-[var(--text-main)]">{node.label}</div>
                  <div className="text-[11px] text-[var(--text-muted)]">
                    {NODE_META[node.kind].description}
                  </div>
                </div>
              </div>
              <span
                className="text-[10px] font-bold px-2 py-0.5 rounded"
                style={{
                  backgroundColor: `${NODE_META[node.kind].color}25`,
                  color: NODE_META[node.kind].color
                }}
              >
                {NODE_META[node.kind].badge}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
