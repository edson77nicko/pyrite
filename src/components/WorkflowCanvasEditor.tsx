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
  List
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
    description: 'Aciona um especialista com as fontes conectadas.'
  },
  condition: {
    label: 'Verificar Condição',
    badge: 'CONDIÇÃO',
    color: '#f59e0b',
    description: 'Valida se há campos pendentes, conflitos de preços ou alçada de valor.'
  },
  approval: {
    label: 'Solicitar Aprovação',
    badge: 'APROVAÇÃO',
    color: '#ec4899',
    description: 'Pausa o fluxo e aguarda decisão explícita do usuário.'
  },
  deliverable: {
    label: 'Criar Entrega',
    badge: 'ENTREGA',
    color: '#10b981',
    description: 'Prepara ou salva a nota/tarefa/mapa na pasta autorizada.'
  },
  finish: {
    label: 'Finalizar',
    badge: 'FIM',
    color: '#71717a',
    description: 'Encerra o fluxo e registra o histórico.'
  }
}

export const WorkflowCanvasEditor: React.FC<WorkflowCanvasEditorProps> = ({
  workflows,
  agents,
  notes,
  folders,
  selectedWorkflowId,
  latestNodeStates = [],
  onSelectWorkflow,
  onSaveWorkflow,
  onDeleteWorkflow,
  onRunWorkflow,
  isExecuting
}) => {
  const activeWorkflow = workflows.find(w => w.id === selectedWorkflowId) || workflows[0]
  const [viewMode, setViewMode] = useState<'canvas' | 'list'>('canvas')
  const [zoom, setZoom] = useState(0.95)
  const [pan, setPan] = useState({ x: 20, y: 20 })
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [connectingFromNodeId, setConnectingFromNodeId] = useState<string | null>(null)
  const [workflowPrompt, setWorkflowPrompt] = useState(
    'Gerar proposta comercial para João Silva com Site Institucional e Manutenção Mensal no prazo de 3 semanas.'
  )

  const draggingNodeRef = useRef<{
    nodeId: string
    startX: number
    startY: number
    origX: number
    origY: number
  } | null>(null)
  const panningRef = useRef<{
    startX: number
    startY: number
    origPanX: number
    origPanY: number
  } | null>(null)

  if (!activeWorkflow) return null

  const validation = validateWorkflowDefinition(activeWorkflow, agents, notes)
  const selectedNode = activeWorkflow.nodes.find(n => n.id === selectedNodeId) || null

  const handleAddNode = (kind: WorkflowNodeKind) => {
    const meta = NODE_META[kind]
    const newNode: WorkflowNode = {
      id: `wn_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      kind,
      label: meta.label,
      position: {
        x: 160 + (activeWorkflow.nodes.length % 5) * 230,
        y: 120 + Math.floor(activeWorkflow.nodes.length / 5) * 140
      },
      config:
        kind === 'run_agent'
          ? { agentId: agents[0]?.id }
          : kind === 'read_note'
          ? { noteId: notes[0]?.id, noteTitle: notes[0]?.title, contextRole: 'permanent_ref' }
          : kind === 'condition'
          ? { conditionType: 'no_missing_fields' }
          : kind === 'deliverable'
          ? { targetFolder: folders[0] || 'Propostas', outputType: 'note', namingPattern: 'Proposta - {cliente}' }
          : {}
    }
    onSaveWorkflow({
      ...activeWorkflow,
      version: activeWorkflow.version + 1,
      status: 'draft',
      nodes: [...activeWorkflow.nodes, newNode],
      updatedAt: Date.now()
    })
    setSelectedNodeId(newNode.id)
  }

  const handleUpdateNode = (updated: WorkflowNode) => {
    onSaveWorkflow({
      ...activeWorkflow,
      version: activeWorkflow.version + 1,
      status: 'draft',
      nodes: activeWorkflow.nodes.map(n => (n.id === updated.id ? updated : n)),
      updatedAt: Date.now()
    })
  }

  const handleRemoveNode = (nodeId: string) => {
    onSaveWorkflow({
      ...activeWorkflow,
      version: activeWorkflow.version + 1,
      status: 'draft',
      nodes: activeWorkflow.nodes.filter(n => n.id !== nodeId),
      edges: activeWorkflow.edges.filter(e => e.sourceNodeId !== nodeId && e.targetNodeId !== nodeId),
      updatedAt: Date.now()
    })
    if (selectedNodeId === nodeId) setSelectedNodeId(null)
  }

  const handleCompleteEdge = (targetNodeId: string) => {
    if (!connectingFromNodeId || connectingFromNodeId === targetNodeId) {
      setConnectingFromNodeId(null)
      return
    }
    const exists = activeWorkflow.edges.some(
      e => e.sourceNodeId === connectingFromNodeId && e.targetNodeId === targetNodeId
    )
    if (!exists) {
      const newEdge: WorkflowEdge = {
        id: `we_${Date.now()}`,
        sourceNodeId: connectingFromNodeId,
        targetNodeId,
        branch: 'default'
      }
      onSaveWorkflow({
        ...activeWorkflow,
        version: activeWorkflow.version + 1,
        status: 'draft',
        edges: [...activeWorkflow.edges, newEdge],
        updatedAt: Date.now()
      })
    }
    setConnectingFromNodeId(null)
  }

  const handlePublishWorkflow = () => {
    if (!validation.valid) return
    onSaveWorkflow({
      ...activeWorkflow,
      status: 'published',
      publishedVersion: activeWorkflow.version,
      updatedAt: Date.now()
    })
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (draggingNodeRef.current) {
      const { nodeId, startX, startY, origX, origY } = draggingNodeRef.current
      const dx = (e.clientX - startX) / zoom
      const dy = (e.clientY - startY) / zoom
      const nextNodes = activeWorkflow.nodes.map(n =>
        n.id === nodeId
          ? {
              ...n,
              position: {
                x: Math.max(20, Math.round(origX + dx)),
                y: Math.max(20, Math.round(origY + dy))
              }
            }
          : n
      )
      onSaveWorkflow({ ...activeWorkflow, nodes: nextNodes, updatedAt: Date.now() })
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
      {/* Barra superior do Fluxo */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3.5 border-b border-zinc-800/80 bg-[#14141a]">
        <div className="flex items-center gap-3">
          <GitBranch className="w-5 h-5 text-[#c59b27]" />
          <select
            value={activeWorkflow.id}
            onChange={e => onSelectWorkflow(e.target.value)}
            className="bg-zinc-900 border border-zinc-700/80 rounded-lg px-3 py-1.5 text-sm font-semibold text-zinc-100 focus:outline-none focus:border-[#c59b27]"
          >
            {workflows.map(w => (
              <option key={w.id} value={w.id}>
                {w.name} ({w.status === 'published' ? `Publicado v${w.publishedVersion || w.version}` : `Rascunho v${w.version}`})
              </option>
            ))}
          </select>

          <span
            className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${
              validation.valid
                ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300'
                : 'bg-amber-500/10 border-amber-500/40 text-amber-300'
            }`}
          >
            {validation.valid ? 'Fluxo válido' : `${validation.errors.length} pendência(s)`}
          </span>

          <button
            type="button"
            disabled={!validation.valid || activeWorkflow.status === 'published'}
            onClick={handlePublishWorkflow}
            className="px-3 py-1.5 rounded-lg border border-emerald-500/50 bg-emerald-500/10 hover:bg-emerald-500/20 text-xs font-medium text-emerald-300 disabled:opacity-40 cursor-pointer"
          >
            Publicar Versão
          </button>

          {workflows.length > 1 && (
            <button
              type="button"
              onClick={() => onDeleteWorkflow(activeWorkflow.id)}
              className="p-1.5 rounded-lg border border-zinc-800 hover:border-rose-500/50 text-zinc-400 hover:text-rose-400 cursor-pointer"
              title="Excluir fluxo"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>

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
              <span>Canvas</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium cursor-pointer ${
                viewMode === 'list' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              <span>Etapas em Lista</span>
            </button>
          </div>

          {viewMode === 'canvas' && (
            <div className="flex items-center gap-1 bg-zinc-900 px-2 py-1 rounded-lg border border-zinc-800 text-xs">
              <button
                type="button"
                onClick={() => setZoom(z => Math.max(0.5, Number((z - 0.1).toFixed(2))))}
                className="p-1 hover:text-white text-zinc-400 cursor-pointer"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="w-11 text-center text-zinc-300">{Math.round(zoom * 100)}%</span>
              <button
                type="button"
                onClick={() => setZoom(z => Math.min(1.5, Number((z + 0.1).toFixed(2))))}
                className="p-1 hover:text-white text-zinc-400 cursor-pointer"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setZoom(0.95)
                  setPan({ x: 20, y: 20 })
                }}
                className="p-1 hover:text-white text-zinc-400 cursor-pointer"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Avisos de validação se houver */}
      {!validation.valid && (
        <div className="px-6 py-2.5 bg-amber-500/10 border-b border-amber-500/30 flex items-center gap-2 text-xs text-amber-200">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
          <span>{validation.errors.join(' • ')}</span>
        </div>
      )}

      {/* Barra de execução do Fluxo */}
      <div className="flex flex-wrap items-center gap-3 px-6 py-3 bg-[#121217] border-b border-zinc-800/60">
        <input
          type="text"
          value={workflowPrompt}
          onChange={e => setWorkflowPrompt(e.target.value)}
          placeholder="Pedido de entrada para testar ou executar este fluxo..."
          className="flex-1 min-w-[260px] bg-zinc-900/90 border border-zinc-700/80 rounded-lg px-3.5 py-2 text-sm text-zinc-100 focus:outline-none focus:border-[#c59b27]"
        />
        <button
          type="button"
          disabled={isExecuting || !validation.valid}
          onClick={() => onRunWorkflow(activeWorkflow, true, workflowPrompt)}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-zinc-700 bg-zinc-800/80 hover:bg-zinc-700 text-xs font-medium text-zinc-100 cursor-pointer disabled:opacity-50"
        >
          <FlaskConical className="w-4 h-4 text-amber-400" />
          <span>Testar Fluxo</span>
        </button>
        <button
          type="button"
          disabled={isExecuting || !validation.valid}
          onClick={() => onRunWorkflow(activeWorkflow, false, workflowPrompt)}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#c59b27] hover:bg-[#d4a930] text-black font-semibold text-xs cursor-pointer disabled:opacity-50"
        >
          <Play className="w-4 h-4 fill-current" />
          <span>Executar Fluxo</span>
        </button>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Paleta de Blocos */}
        <div className="w-60 border-r border-zinc-800/80 bg-[#131319] p-4 flex flex-col gap-2 overflow-y-auto">
          <div className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1">
            Adicionar Bloco ao Fluxo
          </div>
          {(Object.keys(NODE_META) as WorkflowNodeKind[]).map(kind => {
            const meta = NODE_META[kind]
            return (
              <button
                key={kind}
                type="button"
                onClick={() => handleAddNode(kind)}
                className="w-full text-left p-2.5 rounded-lg border border-zinc-800 bg-zinc-900/80 hover:border-zinc-600 transition-colors cursor-pointer"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-zinc-100">{meta.label}</span>
                  <Plus className="w-3.5 h-3.5 text-zinc-400" />
                </div>
                <div className="text-[11px] text-zinc-400 mt-0.5 leading-snug">{meta.description}</div>
              </button>
            )
          })}
        </div>

        {/* Canvas ou Lista */}
        {viewMode === 'canvas' ? (
          <div
            role="region"
            aria-label="Quadro visual de fluxo de trabalho"
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
              className="w-[1800px] h-[1000px] relative"
            >
              {/* Arestas SVG */}
              <svg className="absolute inset-0 w-full h-full pointer-events-none">
                {activeWorkflow.edges.map(edge => {
                  const src = activeWorkflow.nodes.find(n => n.id === edge.sourceNodeId)
                  const dst = activeWorkflow.nodes.find(n => n.id === edge.targetNodeId)
                  if (!src || !dst) return null
                  const x1 = src.position.x + 210
                  const y1 = src.position.y + 46
                  const x2 = dst.position.x
                  const y2 = dst.position.y + 46
                  const midX = (x1 + x2) / 2
                  return (
                    <g key={edge.id}>
                      <path
                        d={`M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`}
                        fill="none"
                        stroke="#71717a"
                        strokeWidth={2}
                      />
                      <circle cx={x2} cy={y2} r={4} fill="#c59b27" />
                      {edge.label && (
                        <text
                          x={midX}
                          y={(y1 + y2) / 2 - 6}
                          textAnchor="middle"
                          fill="#d4d4d8"
                          fontSize={11}
                        >
                          {edge.label}
                        </text>
                      )}
                    </g>
                  )
                })}
              </svg>

              {/* Blocos do Fluxo */}
              {activeWorkflow.nodes.map(node => {
                const meta = NODE_META[node.kind]
                const execState = latestNodeStates.find(s => s.nodeId === node.id)
                const isSelected = selectedNodeId === node.id
                const isConnecting = connectingFromNodeId === node.id

                return (
                  <div
                    key={node.id}
                    style={{ left: node.position.x, top: node.position.y }}
                    onMouseDown={e => {
                      e.stopPropagation()
                      setSelectedNodeId(node.id)
                      if (connectingFromNodeId && connectingFromNodeId !== node.id) {
                        handleCompleteEdge(node.id)
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
                    className={`absolute w-[210px] rounded-xl border p-3 bg-[#16161e] shadow-xl cursor-move ${
                      isSelected
                        ? 'border-[#c59b27] ring-2 ring-[#c59b27]/30'
                        : isConnecting
                        ? 'border-emerald-400 ring-2 ring-emerald-400/30'
                        : 'border-zinc-800 hover:border-zinc-600'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 mb-1.5">
                      <span
                        className="px-2 py-0.5 rounded text-[10px] font-bold tracking-wider"
                        style={{ backgroundColor: `${meta.color}22`, color: meta.color }}
                      >
                        {meta.badge}
                      </span>
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation()
                          handleRemoveNode(node.id)
                        }}
                        className="text-zinc-500 hover:text-rose-400 p-0.5 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="text-sm font-semibold text-zinc-100 truncate">{node.label}</div>

                    {execState && (
                      <div className="mt-2 pt-2 border-t border-zinc-800/80 text-[11px] flex items-center gap-1.5">
                        <CheckCircle2
                          className={`w-3.5 h-3.5 shrink-0 ${
                            execState.status === 'completed'
                              ? 'text-emerald-400'
                              : execState.status === 'waiting_approval'
                              ? 'text-amber-400'
                              : execState.status === 'failed'
                              ? 'text-rose-400'
                              : 'text-zinc-500'
                          }`}
                        />
                        <span className="truncate text-zinc-300">
                          {execState.outputSummary || execState.status}
                        </span>
                      </div>
                    )}

                    <div className="mt-2.5 pt-2 border-t border-zinc-800/70 flex items-center justify-between text-xs">
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation()
                          setConnectingFromNodeId(isConnecting ? null : node.id)
                        }}
                        className="text-[#c59b27] hover:underline font-medium cursor-pointer"
                      >
                        {isConnecting ? 'Cancelar' : 'Conectar →'}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ) : (
          <div className="flex-1 p-6 overflow-y-auto space-y-3">
            {activeWorkflow.nodes.map((node, i) => (
              <div
                key={node.id}
                onClick={() => setSelectedNodeId(node.id)}
                className="p-4 rounded-xl border border-zinc-800 bg-[#15151c] flex items-center justify-between cursor-pointer hover:border-zinc-600"
              >
                <div>
                  <div className="text-xs font-semibold text-[#c59b27]">
                    Etapa {i + 1} • {NODE_META[node.kind].label}
                  </div>
                  <div className="text-sm font-medium text-zinc-100 mt-0.5">{node.label}</div>
                </div>
                <span className="text-xs text-zinc-400">Clique para configurar</span>
              </div>
            ))}
          </div>
        )}

        {/* Inspetor do Bloco Selecionado */}
        {selectedNode && (
          <div className="w-80 border-l border-zinc-800/80 bg-[#14141b] p-5 overflow-y-auto space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-zinc-100">Configurar Bloco</span>
              <button
                type="button"
                onClick={() => setSelectedNodeId(null)}
                className="text-xs text-zinc-400 hover:text-white cursor-pointer"
              >
                Fechar
              </button>
            </div>

            <div>
              <label className="block text-xs text-zinc-400 mb-1">Título do Bloco</label>
              <input
                type="text"
                value={selectedNode.label}
                onChange={e => handleUpdateNode({ ...selectedNode, label: e.target.value })}
                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-zinc-100"
              />
            </div>

            {selectedNode.kind === 'read_note' && (
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Nota a Consultar</label>
                <select
                  value={selectedNode.config.noteId || ''}
                  onChange={e => {
                    const n = notes.find(item => item.id === e.target.value)
                    handleUpdateNode({
                      ...selectedNode,
                      config: {
                        ...selectedNode.config,
                        noteId: n?.id,
                        noteTitle: n?.title
                      }
                    })
                  }}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-zinc-100"
                >
                  {notes.map(n => (
                    <option key={n.id} value={n.id}>
                      {n.title} ({n.folder})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {selectedNode.kind === 'run_agent' && (
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Agente Responsável</label>
                <select
                  value={selectedNode.config.agentId || ''}
                  onChange={e =>
                    handleUpdateNode({
                      ...selectedNode,
                      config: { ...selectedNode.config, agentId: e.target.value }
                    })
                  }
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-zinc-100"
                >
                  {agents.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.icon} {a.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {selectedNode.kind === 'condition' && (
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Regra de Verificação</label>
                <select
                  value={selectedNode.config.conditionType || 'no_missing_fields'}
                  onChange={e =>
                    handleUpdateNode({
                      ...selectedNode,
                      config: {
                        ...selectedNode.config,
                        conditionType: e.target.value as any
                      }
                    })
                  }
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-zinc-100"
                >
                  <option value="no_missing_fields">Sem informações obrigatórias pendentes</option>
                  <option value="no_price_conflicts">Sem divergências de preços</option>
                  <option value="net_total_above">Valor líquido acima de limite (R$)</option>
                  <option value="always">Sempre prosseguir</option>
                </select>
              </div>
            )}

            {selectedNode.kind === 'deliverable' && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Pasta de Destino</label>
                  <select
                    value={selectedNode.config.targetFolder || 'Propostas'}
                    onChange={e =>
                      handleUpdateNode({
                        ...selectedNode,
                        config: { ...selectedNode.config, targetFolder: e.target.value }
                      })
                    }
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-zinc-100"
                  >
                    {folders.map(f => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Padrão de Nome</label>
                  <input
                    type="text"
                    value={selectedNode.config.namingPattern || 'Proposta - {cliente}'}
                    onChange={e =>
                      handleUpdateNode({
                        ...selectedNode,
                        config: { ...selectedNode.config, namingPattern: e.target.value }
                      })
                    }
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-zinc-100"
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
