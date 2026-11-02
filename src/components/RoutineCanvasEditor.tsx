import React, { useState, useRef } from 'react'
import type {
  AgentProfileVersion,
  AutomationTriggerKind,
  AutomationVersion,
  ProjectContext,
  TeamDefinition,
  WorkflowDefinition
} from '../types/agents'
import { computeNextScheduleRunISO, createDefaultAutomation } from '../utils/multiAgentEngine'
import {
  DIAGRAM_NODE_WIDTH,
  snapDiagramCoord,
  diagramInputPort,
  diagramOutputPort,
  diagramEdgePath,
  diagramEdgeArrow,
  diagramBounds
} from '../utils/openbotDiagramUtils'
import {
  Clock,
  Plus,
  Trash2,
  LayoutGrid,
  Sliders,
  CheckCircle2,
  PauseCircle,
  ZoomIn,
  ZoomOut,
  Maximize2,
  PanelRight,
  Play,
  X
} from 'lucide-react'

interface RoutineCanvasEditorProps {
  automations: AutomationVersion[]
  agents: AgentProfileVersion[]
  teams: TeamDefinition[]
  workflows: WorkflowDefinition[]
  projects: ProjectContext[]
  folders: string[]
  selectedRoutineId: string
  onSelectRoutine: (routineId: string) => void
  onSaveRoutine: (routine: AutomationVersion) => void
  onDeleteRoutine: (routineId: string) => void
  onTestRoutine: (routine: AutomationVersion) => void
  isExecuting: boolean
}

const TRIGGER_LABELS: Record<AutomationTriggerKind, string> = {
  briefing_added: 'Ao adicionar briefing na pasta monitorada',
  weekly_schedule: 'Agendamento semanal (Fuso IANA)',
  meeting_completed: 'Ao concluir uma nota de reunião',
  task_completed: 'Quando uma tarefa for concluída'
}

const DAYS_OF_WEEK = [
  'Domingo',
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado'
]

const WEEK_INITIALS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']

export const RoutineCanvasEditor: React.FC<RoutineCanvasEditorProps> = ({
  automations,
  agents,
  teams,
  workflows,
  projects,
  folders,
  selectedRoutineId,
  onSelectRoutine,
  onSaveRoutine,
  onDeleteRoutine,
  onTestRoutine,
  isExecuting
}) => {
  const activeRoutine = automations.find(a => a.id === selectedRoutineId) || automations[0]
  const [mode, setMode] = useState<'canvas' | 'simple'>('canvas')
  const [zoom, setZoom] = useState(0.92)
  const [pan, setPan] = useState({ x: 36, y: 48 })
  const [inspectorOpen, setInspectorOpen] = useState(false)
  const [draggingStage, setDraggingStage] = useState<
    'trigger' | 'context' | 'executor' | 'approval' | 'output' | null
  >(null)
  const dragOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const panStartRef = useRef<{ x: number; y: number; panX: number; panY: number }>({
    x: 0,
    y: 0,
    panX: 0,
    panY: 0
  })

  const viewportRef = useRef<HTMLDivElement>(null)

  if (!activeRoutine) return null

  const layout = activeRoutine.visualLayout || {
    triggerX: 48,
    triggerY: 160,
    contextX: 352,
    contextY: 160,
    executorX: 656,
    executorY: 160,
    approvalX: 960,
    approvalY: 160,
    outputX: 1264,
    outputY: 160
  }

  const updateRoutine = (patch: Partial<AutomationVersion>) => {
    const merged: AutomationVersion = {
      ...activeRoutine,
      ...patch,
      version: activeRoutine.version + 1,
      updatedAt: Date.now()
    }
    if (patch.scheduleConfig || patch.triggerKind === 'weekly_schedule') {
      merged.nextRunAt = computeNextScheduleRunISO(merged.scheduleConfig)
    }
    onSaveRoutine(merged)
  }

  const handleCreateNewRoutine = () => {
    const newAuto = createDefaultAutomation(agents[0]?.id || 'agent-proposal-specialist')
    newAuto.name = `Nova Rotina (${automations.length + 1})`
    onSaveRoutine(newAuto)
    onSelectRoutine(newAuto.id)
    setInspectorOpen(true)
  }

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
    const positions = [
      { x: layout.triggerX, y: layout.triggerY },
      { x: layout.contextX, y: layout.contextY },
      { x: layout.executorX, y: layout.executorY },
      { x: layout.approvalX, y: layout.approvalY },
      { x: layout.outputX, y: layout.outputY }
    ]
    const bounds = diagramBounds(positions)
    if (!rect || !bounds) return
    const nextZoom = Math.max(
      0.45,
      Math.min(1.1, Math.min((rect.width - 120) / bounds.width, (rect.height - 120) / bounds.height))
    )
    const cx = bounds.minX + bounds.width / 2
    const cy = bounds.minY + bounds.height / 2
    setZoom(Number(nextZoom.toFixed(2)))
    setPan({
      x: Math.round(rect.width / 2 - cx * nextZoom),
      y: Math.round(rect.height / 2 - cy * nextZoom)
    })
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (draggingStage) {
      const world = screenToWorld(e.clientX, e.clientY)
      const nx = Math.max(16, snapDiagramCoord(world.x - dragOffsetRef.current.x))
      const ny = Math.max(16, snapDiagramCoord(world.y - dragOffsetRef.current.y))
      const nextLayout = { ...layout }
      if (draggingStage === 'trigger') {
        nextLayout.triggerX = nx
        nextLayout.triggerY = ny
      } else if (draggingStage === 'context') {
        nextLayout.contextX = nx
        nextLayout.contextY = ny
      } else if (draggingStage === 'executor') {
        nextLayout.executorX = nx
        nextLayout.executorY = ny
      } else if (draggingStage === 'approval') {
        nextLayout.approvalX = nx
        nextLayout.approvalY = ny
      } else if (draggingStage === 'output') {
        nextLayout.outputX = nx
        nextLayout.outputY = ny
      }
      updateRoutine({ visualLayout: nextLayout })
      return
    }
    if (isPanning) {
      setPan({
        x: panStartRef.current.panX + (e.clientX - panStartRef.current.x),
        y: panStartRef.current.panY + (e.clientY - panStartRef.current.y)
      })
    }
  }

  const stageEdges = [
    {
      from: diagramOutputPort({ x: layout.triggerX, y: layout.triggerY }),
      to: diagramInputPort({ x: layout.contextX, y: layout.contextY }),
      color: '#c59b27'
    },
    {
      from: diagramOutputPort({ x: layout.contextX, y: layout.contextY }),
      to: diagramInputPort({ x: layout.executorX, y: layout.executorY }),
      color: '#8b5cf6'
    },
    {
      from: diagramOutputPort({ x: layout.executorX, y: layout.executorY }),
      to: diagramInputPort({ x: layout.approvalX, y: layout.approvalY }),
      color: '#ec4899'
    },
    {
      from: diagramOutputPort({ x: layout.approvalX, y: layout.approvalY }),
      to: diagramInputPort({ x: layout.outputX, y: layout.outputY }),
      color: '#10b981'
    }
  ]

  const scheduledDay = activeRoutine.scheduleConfig?.dayOfWeek ?? 5
  const scheduledHour = activeRoutine.scheduleConfig?.hour ?? 16
  const scheduledMin = activeRoutine.scheduleConfig?.minute ?? 0

  return (
    <div className="relative flex flex-col w-full h-full overflow-hidden bg-[#0b0c10] select-none">
      {/* Top OpenBot Routine Header */}
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-[var(--bg-border)] bg-[#11131a]/95 backdrop-blur-md z-20 shrink-0 flex-wrap">
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-400">
            <Clock className="w-4 h-4" />
            <span>Rotina:</span>
          </div>
          <select
            value={activeRoutine.id}
            onChange={e => onSelectRoutine(e.target.value)}
            className="bg-[#181b24] border border-[var(--bg-border)] rounded-lg px-2.5 py-1.5 text-xs font-medium text-[var(--text-main)]"
          >
            {automations.map(a => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.active ? 'Ativa' : 'Pausada'})
              </option>
            ))}
          </select>

          <button
            onClick={handleCreateNewRoutine}
            className="px-2.5 py-1.5 rounded-lg bg-[var(--bg-elevated)] hover:bg-[var(--bg-border)] text-xs text-[var(--text-main)] flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5 text-amber-400" />
            Nova Rotina
          </button>

          {automations.length > 1 && (
            <button
              onClick={() => onDeleteRoutine(activeRoutine.id)}
              className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-300"
              title="Excluir rotina"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            onClick={() => updateRoutine({ active: !activeRoutine.active })}
            className={`px-2.5 py-1 rounded-full text-[11px] font-semibold flex items-center gap-1.5 border ${
              activeRoutine.active
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                : 'bg-zinc-500/15 border-zinc-500/30 text-zinc-300'
            }`}
          >
            {activeRoutine.active ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5" /> Ativa
              </>
            ) : (
              <>
                <PauseCircle className="w-3.5 h-3.5" /> Pausada (Padrão Seguro)
              </>
            )}
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            disabled={isExecuting}
            onClick={() => onTestRoutine(activeRoutine)}
            className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            Executar agora
          </button>

          <div className="flex items-center bg-[#181b24] p-0.5 rounded-lg border border-[var(--bg-border)]">
            <button
              onClick={() => setMode('canvas')}
              className={`px-2.5 py-1 rounded text-[11px] flex items-center gap-1 ${
                mode === 'canvas' ? 'bg-amber-500 text-black font-semibold' : 'text-[var(--text-muted)]'
              }`}
            >
              <LayoutGrid className="w-3 h-3" />
              Canvas
            </button>
            <button
              onClick={() => setMode('simple')}
              className={`px-2.5 py-1 rounded text-[11px] flex items-center gap-1 ${
                mode === 'simple' ? 'bg-amber-500 text-black font-semibold' : 'text-[var(--text-muted)]'
              }`}
            >
              <Sliders className="w-3 h-3" />
              Formulário
            </button>
          </div>

          <button
            onClick={() => setInspectorOpen(v => !v)}
            className={`p-1.5 rounded-lg border transition-colors ${
              inspectorOpen
                ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                : 'bg-[#181b24] border-[var(--bg-border)] text-[var(--text-muted)] hover:text-white'
            }`}
            title="Abrir/Fechar Inspetor da Rotina"
          >
            <PanelRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {mode === 'canvas' ? (
        <div
          ref={viewportRef}
          onPointerMove={handlePointerMove}
          onPointerUp={() => {
            setDraggingStage(null)
            setIsPanning(false)
          }}
          onPointerDown={e => {
            if (e.button !== 0) return
            const target = e.target as HTMLElement
            if (target === viewportRef.current || target.dataset.canvasBg === 'true') {
              setIsPanning(true)
              panStartRef.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y }
            }
          }}
          onWheel={e => {
            if (e.ctrlKey || e.metaKey) {
              e.preventDefault()
              const delta = e.deltaY < 0 ? 0.08 : -0.08
              setZoom(z => Math.min(1.5, Math.max(0.45, Number((z + delta).toFixed(2)))))
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
          <div
            data-canvas-bg="true"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: '0 0',
              width: 3000,
              height: 1800
            }}
            className="relative"
          >
            {/* OpenBot Horizontal S-Curve Edges */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none overflow-visible">
              {stageEdges.map((edge, idx) => (
                <g key={idx}>
                  <path
                    d={diagramEdgePath(edge.from, edge.to)}
                    fill="none"
                    stroke={edge.color}
                    strokeWidth={2.4}
                  />
                  <path
                    d={diagramEdgeArrow(edge.to)}
                    fill="none"
                    stroke={edge.color}
                    strokeWidth={2.4}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </g>
              ))}
            </svg>

            {/* 1. OpenBot Trigger Node Card with DiagramRoutineWeek & DiagramRoutineRunDots */}
            <div
              style={{ left: layout.triggerX, top: layout.triggerY, width: DIAGRAM_NODE_WIDTH }}
              onPointerDown={e => {
                e.stopPropagation()
                const world = screenToWorld(e.clientX, e.clientY)
                dragOffsetRef.current = { x: world.x - layout.triggerX, y: world.y - layout.triggerY }
                setDraggingStage('trigger')
              }}
              className="absolute rounded-2xl border border-amber-500/40 bg-[#141720]/95 backdrop-blur-md shadow-2xl cursor-move p-3 space-y-2.5"
            >
              <span
                style={{ top: 20, right: -7 }}
                className="absolute w-3.5 h-3.5 rounded-full bg-amber-400 border-2 border-[#0b0c10]"
              />
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400">
                  1. Gatilho • {activeRoutine.active ? 'Ativa' : 'Pausada'}
                </span>
                <span className="text-[10px] text-[var(--text-muted)]">
                  Máx {activeRoutine.maxRunsPerDay}/dia
                </span>
              </div>

              <select
                value={activeRoutine.triggerKind}
                onChange={e => updateRoutine({ triggerKind: e.target.value as AutomationTriggerKind })}
                onPointerDown={e => e.stopPropagation()}
                className="w-full bg-[#0e1017] border border-[var(--bg-border)] rounded-lg px-2 py-1 text-xs text-[var(--text-main)]"
              >
                {(Object.keys(TRIGGER_LABELS) as AutomationTriggerKind[]).map(k => (
                  <option key={k} value={k}>
                    {TRIGGER_LABELS[k]}
                  </option>
                ))}
              </select>

              {/* OpenBot DiagramRoutineWeek 7-day Visual */}
              {activeRoutine.triggerKind === 'weekly_schedule' && (
                <div
                  onPointerDown={e => e.stopPropagation()}
                  className="p-2 rounded-xl bg-[#0e1017] border border-white/5 space-y-1.5"
                >
                  <div className="flex items-center justify-between text-[10px] text-[var(--text-muted)]">
                    <span>{DAYS_OF_WEEK[scheduledDay]}</span>
                    <span className="font-mono text-amber-300">
                      {String(scheduledHour).padStart(2, '0')}:{String(scheduledMin).padStart(2, '0')} ({activeRoutine.scheduleConfig?.timezone || 'America/Sao_Paulo'})
                    </span>
                  </div>
                  <div className="grid grid-cols-7 gap-1 pt-0.5">
                    {WEEK_INITIALS.map((letter, dayIdx) => {
                      const isScheduled = dayIdx === scheduledDay
                      return (
                        <button
                          key={dayIdx}
                          type="button"
                          onClick={() =>
                            updateRoutine({
                              scheduleConfig: {
                                ...(activeRoutine.scheduleConfig || {
                                  hour: 16,
                                  minute: 0,
                                  timezone: 'America/Sao_Paulo',
                                  missedPolicy: 'run_once_on_open'
                                }),
                                dayOfWeek: dayIdx
                              }
                            })
                          }
                          className={`flex flex-col items-center py-1 rounded-md border transition-colors ${
                            isScheduled
                              ? 'border-amber-400/60 bg-amber-500/15 text-amber-300'
                              : 'border-white/5 bg-white/[0.02] text-[var(--text-muted)] hover:border-white/20'
                          }`}
                        >
                          <span className="text-[9px] font-bold">{letter}</span>
                          <span
                            className={`mt-1 w-3 h-1 rounded-full ${
                              isScheduled ? 'bg-amber-400' : 'bg-white/10'
                            }`}
                          />
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* OpenBot DiagramRoutineRunDots + Footer */}
              <div className="pt-1 border-t border-white/5 flex items-center justify-between text-[10px]">
                <div className="flex items-center gap-1" title="Execuções recentes desta rotina">
                  <span className="text-[var(--text-muted)]">Histórico:</span>
                  {(activeRoutine.recentRunIds || []).slice(0, 5).map(id => (
                    <span key={id} className="w-2 h-2 rounded-full bg-emerald-400" />
                  ))}
                  {(activeRoutine.recentRunIds || []).length === 0 && (
                    <span className="text-[var(--text-muted)]">Sem execuções</span>
                  )}
                </div>
                <button
                  type="button"
                  onPointerDown={e => e.stopPropagation()}
                  onClick={() => onTestRoutine(activeRoutine)}
                  className="text-amber-300 hover:underline font-semibold"
                >
                  Executar
                </button>
              </div>
            </div>

            {/* 2. Context Node Card */}
            <div
              style={{ left: layout.contextX, top: layout.contextY, width: DIAGRAM_NODE_WIDTH }}
              onPointerDown={e => {
                e.stopPropagation()
                const world = screenToWorld(e.clientX, e.clientY)
                dragOffsetRef.current = { x: world.x - layout.contextX, y: world.y - layout.contextY }
                setDraggingStage('context')
              }}
              className="absolute rounded-2xl border border-purple-500/40 bg-[#141720]/95 backdrop-blur-md shadow-2xl cursor-move p-3 space-y-2.5"
            >
              <span
                style={{ top: 20, left: -7 }}
                className="absolute w-3.5 h-3.5 rounded-full bg-[#181b24] border-2 border-purple-400"
              />
              <span
                style={{ top: 20, right: -7 }}
                className="absolute w-3.5 h-3.5 rounded-full bg-purple-400 border-2 border-[#0b0c10]"
              />
              <div className="text-[10px] font-bold uppercase tracking-wider text-purple-300">
                2. Contexto Autorizado
              </div>
              <div onPointerDown={e => e.stopPropagation()} className="space-y-2">
                <div>
                  <label className="text-[10px] text-[var(--text-muted)] block mb-0.5">
                    Pasta Monitorada
                  </label>
                  <input
                    type="text"
                    value={activeRoutine.watchFolder || ''}
                    onChange={e => updateRoutine({ watchFolder: e.target.value })}
                    placeholder="Ex: Clientes"
                    className="w-full bg-[#0e1017] border border-[var(--bg-border)] rounded-lg px-2 py-1 text-xs text-[var(--text-main)]"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-[var(--text-muted)] block mb-0.5">
                    Isolamento de Cliente Fixo (Opcional)
                  </label>
                  <select
                    value={activeRoutine.projectContextId || ''}
                    onChange={e => updateRoutine({ projectContextId: e.target.value || undefined })}
                    className="w-full bg-[#0e1017] border border-[var(--bg-border)] rounded-lg px-2 py-1 text-xs text-[var(--text-main)]"
                  >
                    <option value="">Sem cliente fixo (usar apenas evento)</option>
                    {projects.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.clientName}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* 3. Executor Node Card */}
            <div
              style={{ left: layout.executorX, top: layout.executorY, width: DIAGRAM_NODE_WIDTH }}
              onPointerDown={e => {
                e.stopPropagation()
                const world = screenToWorld(e.clientX, e.clientY)
                dragOffsetRef.current = { x: world.x - layout.executorX, y: world.y - layout.executorY }
                setDraggingStage('executor')
              }}
              className="absolute rounded-2xl border border-cyan-500/40 bg-[#141720]/95 backdrop-blur-md shadow-2xl cursor-move p-3 space-y-2.5"
            >
              <span
                style={{ top: 20, left: -7 }}
                className="absolute w-3.5 h-3.5 rounded-full bg-[#181b24] border-2 border-cyan-400"
              />
              <span
                style={{ top: 20, right: -7 }}
                className="absolute w-3.5 h-3.5 rounded-full bg-cyan-400 border-2 border-[#0b0c10]"
              />
              <div className="text-[10px] font-bold uppercase tracking-wider text-cyan-300">
                3. Quem Executa
              </div>
              <div onPointerDown={e => e.stopPropagation()} className="space-y-2">
                <select
                  value={activeRoutine.targetKind || 'agent'}
                  onChange={e =>
                    updateRoutine({
                      targetKind: e.target.value as 'agent' | 'team' | 'workflow'
                    })
                  }
                  className="w-full bg-[#0e1017] border border-[var(--bg-border)] rounded-lg px-2 py-1 text-xs text-[var(--text-main)]"
                >
                  <option value="agent">Agente Individual</option>
                  <option value="team">Equipe Coordenada</option>
                  <option value="workflow">Fluxo de Trabalho</option>
                </select>

                {(activeRoutine.targetKind || 'agent') === 'agent' && (
                  <select
                    value={activeRoutine.agentId}
                    onChange={e => {
                      const ag = agents.find(a => a.id === e.target.value)
                      updateRoutine({ agentId: e.target.value, agentVersion: ag?.version || 1 })
                    }}
                    className="w-full bg-[#0e1017] border border-[var(--bg-border)] rounded-lg px-2 py-1 text-xs text-[var(--text-main)]"
                  >
                    {agents.map(ag => (
                      <option key={ag.id} value={ag.id}>
                        {ag.icon} {ag.name} (v{ag.version})
                      </option>
                    ))}
                  </select>
                )}

                {activeRoutine.targetKind === 'team' && (
                  <select
                    value={activeRoutine.teamId || teams[0]?.id || ''}
                    onChange={e => updateRoutine({ teamId: e.target.value })}
                    className="w-full bg-[#0e1017] border border-[var(--bg-border)] rounded-lg px-2 py-1 text-xs text-[var(--text-main)]"
                  >
                    {teams.map(t => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                )}

                {activeRoutine.targetKind === 'workflow' && (
                  <select
                    value={activeRoutine.workflowId || workflows[0]?.id || ''}
                    onChange={e => updateRoutine({ workflowId: e.target.value })}
                    className="w-full bg-[#0e1017] border border-[var(--bg-border)] rounded-lg px-2 py-1 text-xs text-[var(--text-main)]"
                  >
                    {workflows.map(w => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            {/* 4. Approval Node Card */}
            <div
              style={{ left: layout.approvalX, top: layout.approvalY, width: DIAGRAM_NODE_WIDTH }}
              onPointerDown={e => {
                e.stopPropagation()
                const world = screenToWorld(e.clientX, e.clientY)
                dragOffsetRef.current = { x: world.x - layout.approvalX, y: world.y - layout.approvalY }
                setDraggingStage('approval')
              }}
              className="absolute rounded-2xl border border-pink-500/40 bg-[#141720]/95 backdrop-blur-md shadow-2xl cursor-move p-3 space-y-2.5"
            >
              <span
                style={{ top: 20, left: -7 }}
                className="absolute w-3.5 h-3.5 rounded-full bg-[#181b24] border-2 border-pink-400"
              />
              <span
                style={{ top: 20, right: -7 }}
                className="absolute w-3.5 h-3.5 rounded-full bg-pink-400 border-2 border-[#0b0c10]"
              />
              <div className="text-[10px] font-bold uppercase tracking-wider text-pink-300">
                4. Regra de Aprovação
              </div>
              <label
                onPointerDown={e => e.stopPropagation()}
                className="flex items-start gap-2 text-xs text-[var(--text-main)] cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={activeRoutine.requireApproval}
                  onChange={e => updateRoutine({ requireApproval: e.target.checked })}
                  className="mt-0.5 accent-pink-500"
                />
                <span>Exigir aprovação humana antes de salvar no cofre</span>
              </label>
            </div>

            {/* 5. Output Node Card */}
            <div
              style={{ left: layout.outputX, top: layout.outputY, width: DIAGRAM_NODE_WIDTH }}
              onPointerDown={e => {
                e.stopPropagation()
                const world = screenToWorld(e.clientX, e.clientY)
                dragOffsetRef.current = { x: world.x - layout.outputX, y: world.y - layout.outputY }
                setDraggingStage('output')
              }}
              className="absolute rounded-2xl border border-emerald-500/40 bg-[#141720]/95 backdrop-blur-md shadow-2xl cursor-move p-3 space-y-2.5"
            >
              <span
                style={{ top: 20, left: -7 }}
                className="absolute w-3.5 h-3.5 rounded-full bg-[#181b24] border-2 border-emerald-400"
              />
              <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-300">
                5. Pasta de Destino
              </div>
              <div onPointerDown={e => e.stopPropagation()}>
                <input
                  type="text"
                  list="routine-folders-list"
                  value={activeRoutine.targetFolder}
                  onChange={e => updateRoutine({ targetFolder: e.target.value })}
                  className="w-full bg-[#0e1017] border border-[var(--bg-border)] rounded-lg px-2 py-1 text-xs text-[var(--text-main)]"
                />
                <datalist id="routine-folders-list">
                  {folders.map(f => (
                    <option key={f} value={f} />
                  ))}
                </datalist>
              </div>
            </div>
          </div>

          {/* Bottom-Left Zoom Controls */}
          <div className="absolute bottom-4 left-4 z-20 flex items-center gap-1 bg-[#141720]/95 backdrop-blur-md border border-[var(--bg-border)] rounded-xl p-1 shadow-xl">
            <button
              onClick={() => setZoom(z => Math.max(0.45, Number((z - 0.1).toFixed(2))))}
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
              className="absolute top-0 right-0 bottom-0 w-84 bg-[#141720]/98 backdrop-blur-xl border-l border-[var(--bg-border)] z-30 p-4 overflow-y-auto shadow-2xl space-y-4"
            >
              <div className="flex items-center justify-between border-b border-[var(--bg-border)] pb-2.5">
                <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400">
                  Inspetor da Rotina
                </h4>
                <button
                  onClick={() => setInspectorOpen(false)}
                  className="p-1 rounded-lg hover:bg-white/10 text-[var(--text-muted)]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="text-[11px] text-[var(--text-muted)] block mb-1">
                    Nome da Rotina
                  </label>
                  <input
                    type="text"
                    value={activeRoutine.name}
                    onChange={e => updateRoutine({ name: e.target.value })}
                    className="w-full bg-[#0e1017] border border-[var(--bg-border)] rounded-lg px-2.5 py-1.5 text-xs text-[var(--text-main)]"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-[var(--text-muted)] block mb-1">
                    Instrução / Descrição
                  </label>
                  <textarea
                    value={activeRoutine.description}
                    onChange={e => updateRoutine({ description: e.target.value })}
                    rows={3}
                    className="w-full bg-[#0e1017] border border-[var(--bg-border)] rounded-lg px-2.5 py-1.5 text-xs text-[var(--text-main)] resize-none"
                  />
                </div>

                {activeRoutine.triggerKind === 'weekly_schedule' && (
                  <div className="space-y-2 p-2.5 rounded-xl bg-[#0e1017] border border-[var(--bg-border)]">
                    <div className="font-semibold text-amber-300">Agendamento IANA</div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] text-[var(--text-muted)] block">Hora</label>
                        <input
                          type="number"
                          min={0}
                          max={23}
                          value={scheduledHour}
                          onChange={e =>
                            updateRoutine({
                              scheduleConfig: {
                                ...(activeRoutine.scheduleConfig || {
                                  dayOfWeek: 5,
                                  minute: 0,
                                  timezone: 'America/Sao_Paulo',
                                  missedPolicy: 'run_once_on_open'
                                }),
                                hour: Math.min(23, Math.max(0, Number(e.target.value) || 0))
                              }
                            })
                          }
                          className="w-full bg-[#141720] border border-[var(--bg-border)] rounded px-2 py-1 text-xs"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-[var(--text-muted)] block">Minuto</label>
                        <input
                          type="number"
                          min={0}
                          max={59}
                          value={scheduledMin}
                          onChange={e =>
                            updateRoutine({
                              scheduleConfig: {
                                ...(activeRoutine.scheduleConfig || {
                                  dayOfWeek: 5,
                                  hour: 16,
                                  timezone: 'America/Sao_Paulo',
                                  missedPolicy: 'run_once_on_open'
                                }),
                                minute: Math.min(59, Math.max(0, Number(e.target.value) || 0))
                              }
                            })
                          }
                          className="w-full bg-[#141720] border border-[var(--bg-border)] rounded px-2 py-1 text-xs"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] text-[var(--text-muted)] block">
                        Fuso Horário IANA
                      </label>
                      <input
                        type="text"
                        value={activeRoutine.scheduleConfig?.timezone || 'America/Sao_Paulo'}
                        onChange={e =>
                          updateRoutine({
                            scheduleConfig: {
                              ...(activeRoutine.scheduleConfig || {
                                dayOfWeek: 5,
                                hour: 16,
                                minute: 0,
                                missedPolicy: 'run_once_on_open'
                              }),
                              timezone: e.target.value
                            }
                          })
                        }
                        className="w-full bg-[#141720] border border-[var(--bg-border)] rounded px-2 py-1 text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-[var(--text-muted)] block">
                        Política se o app estiver fechado no horário
                      </label>
                      <select
                        value={activeRoutine.scheduleConfig?.missedPolicy || 'run_once_on_open'}
                        onChange={e =>
                          updateRoutine({
                            scheduleConfig: {
                              ...(activeRoutine.scheduleConfig || {
                                dayOfWeek: 5,
                                hour: 16,
                                minute: 0,
                                timezone: 'America/Sao_Paulo'
                              }),
                              missedPolicy: e.target.value as 'skip' | 'run_once_on_open'
                            }
                          })
                        }
                        className="w-full bg-[#141720] border border-[var(--bg-border)] rounded px-2 py-1 text-xs"
                      >
                        <option value="run_once_on_open">Executar 1x ao abrir o Pyrite</option>
                        <option value="skip">Pular para a próxima semana</option>
                      </select>
                    </div>
                  </div>
                )}

                <div>
                  <label className="text-[11px] text-[var(--text-muted)] block mb-1">
                    Limite máximo de execuções por dia
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={activeRoutine.maxRunsPerDay}
                    onChange={e =>
                      updateRoutine({ maxRunsPerDay: Math.max(1, Number(e.target.value) || 1) })
                    }
                    className="w-full bg-[#0e1017] border border-[var(--bg-border)] rounded-lg px-2.5 py-1.5 text-xs text-[var(--text-main)]"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-6 max-w-3xl mx-auto w-full space-y-4">
          <div className="p-5 rounded-2xl border border-[var(--bg-border)] bg-[#141720] space-y-4">
            <h3 className="text-sm font-bold text-[var(--text-main)]">{activeRoutine.name}</h3>
            <p className="text-xs text-[var(--text-muted)]">{activeRoutine.description}</p>
            <div className="text-xs text-amber-300">
              Próxima execução calculada: {activeRoutine.nextRunAt ? new Date(activeRoutine.nextRunAt).toLocaleString('pt-BR') : 'Sob evento'}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
