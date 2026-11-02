import React, { useState, useRef, useEffect } from 'react'
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
  CheckCircle2,
  PauseCircle,
  ZoomIn,
  ZoomOut,
  Maximize2,
  PanelRight,
  Play,
  X,
  ChevronDown,
  ArrowLeft,
  ArrowRight,
  MousePointer,
  Hand,
  Bot,
  Zap,
  FolderOpen,
  ShieldCheck,
  Target,
  Users,
  GitBranch,
  Folder
} from 'lucide-react'
import { CustomSelect } from './CustomSelect'
import { CustomTimePicker } from './CustomTimePicker'

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
  weekly_schedule: 'Agendamento semanal (Fuso IANA)',
  briefing_added: 'Ao adicionar briefing na pasta monitorada',
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
const AGENT_COLORS = ['#10b981', '#2563eb', '#8b5cf6', '#f59e0b', '#ec4899', '#06b6d4']

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
  const [zoom, setZoom] = useState(0.92)
  const [pan, setPan] = useState({ x: 50, y: 70 })
  const [toolMode, setToolMode] = useState<'pointer' | 'hand'>('pointer')
  const [inspectorOpen, setInspectorOpen] = useState(false)
  const [isRoutineMenuOpen, setIsRoutineMenuOpen] = useState(false)
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

  const layout = activeRoutine?.visualLayout || {
    triggerX: 50,
    triggerY: 160,
    contextX: 370,
    contextY: 160,
    executorX: 690,
    executorY: 160,
    approvalX: 1010,
    approvalY: 160,
    outputX: 1330,
    outputY: 160
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

  // Centralização automática ao abrir ou alternar de rotina
  useEffect(() => {
    if (!activeRoutine) return
    const timer = setTimeout(() => {
      handleFitView()
    }, 60)
    return () => clearTimeout(timer)
  }, [selectedRoutineId, activeRoutine])

  if (!activeRoutine) return null

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
    setIsRoutineMenuOpen(false)
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
      color: '#f59e0b'
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
    <div className="flex-1 flex flex-col bg-[#09090b] overflow-hidden select-none relative">
      {/* ======================================================================== */}
      {/* BARRA SUPERIOR MINIMALISTA (Idêntica ao Print 02 do OpenBot)              */}
      {/* ======================================================================== */}
      <div className="h-11 px-4 border-b border-zinc-900/90 bg-[#09090b] flex items-center justify-between shrink-0 z-30">
        <div className="flex items-center gap-3">
          {/* Badge de Workspace "Local" com esfera verde */}
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-zinc-900/60 border border-zinc-800/60 text-xs font-medium text-zinc-300">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-xs" />
            <span>Local</span>
            <ChevronDown className="w-3 h-3 text-zinc-500" />
          </div>

          {/* Navegação <- -> */}
          <div className="flex items-center gap-1 text-zinc-500">
            <button
              type="button"
              onClick={() => {
                const idx = automations.findIndex(a => a.id === activeRoutine.id)
                if (idx > 0) onSelectRoutine(automations[idx - 1].id)
              }}
              className="p-1 rounded hover:bg-zinc-800/60 hover:text-zinc-300 cursor-pointer"
              title="Rotina anterior"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => {
                const idx = automations.findIndex(a => a.id === activeRoutine.id)
                if (idx >= 0 && idx < automations.length - 1) onSelectRoutine(automations[idx + 1].id)
              }}
              className="p-1 rounded hover:bg-zinc-800/60 hover:text-zinc-300 cursor-pointer"
              title="Próxima rotina"
            >
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Dropdown de Seleção / Criação de Rotina */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsRoutineMenuOpen(v => !v)}
              className="flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-zinc-900 text-xs font-medium text-zinc-200 cursor-pointer"
            >
              <span>{activeRoutine.name}</span>
              <ChevronDown className="w-3.5 h-3.5 text-zinc-500" />
            </button>

            {isRoutineMenuOpen && (
              <div
                onMouseDown={e => e.stopPropagation()}
                className="absolute left-0 top-full mt-1.5 w-64 bg-[#141416] border border-zinc-800 rounded-2xl shadow-2xl p-1.5 z-50 animate-in fade-in zoom-in-95 duration-100"
              >
                <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                  Rotinas Automatizadas
                </div>
                {automations.map(a => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => {
                      onSelectRoutine(a.id)
                      setIsRoutineMenuOpen(false)
                    }}
                    className={`w-full text-left px-2.5 py-1.5 rounded-xl text-xs flex items-center justify-between cursor-pointer ${
                      a.id === activeRoutine.id
                        ? 'bg-zinc-800/90 text-white font-medium'
                        : 'text-zinc-300 hover:bg-zinc-800/50'
                    }`}
                  >
                    <span className="truncate">{a.name}</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                        a.active
                          ? 'bg-emerald-500/15 text-emerald-300'
                          : 'bg-zinc-800 text-zinc-500'
                      }`}
                    >
                      {a.active ? 'Ativa' : 'Pausada'}
                    </span>
                  </button>
                ))}
                <div className="border-t border-zinc-800/80 my-1" />
                <button
                  type="button"
                  onClick={handleCreateNewRoutine}
                  className="w-full text-left px-2.5 py-1.5 rounded-xl text-xs text-zinc-200 hover:bg-zinc-800/60 flex items-center gap-2 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Nova rotina</span>
                </button>
                {automations.length > 1 && (
                  <button
                    type="button"
                    onClick={() => {
                      onDeleteRoutine(activeRoutine.id)
                      setIsRoutineMenuOpen(false)
                    }}
                    className="w-full text-left px-2.5 py-1.5 rounded-xl text-xs text-rose-400 hover:bg-rose-950/30 flex items-center gap-2 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Excluir rotina atual</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Lado Direito: Toggle Ativa/Pausada + Botão Pílula Branco "▷ Executar rotina agora" */}
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => updateRoutine({ active: !activeRoutine.active })}
            className={`px-2.5 py-1 rounded-full text-[11px] font-medium flex items-center gap-1.5 border transition-all cursor-pointer ${
              activeRoutine.active
                ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                : 'bg-zinc-800 border-zinc-700 text-zinc-400'
            }`}
          >
            {activeRoutine.active ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Ativa</span>
              </>
            ) : (
              <>
                <PauseCircle className="w-3.5 h-3.5 text-zinc-500" />
                <span>Pausada</span>
              </>
            )}
          </button>

          <button
            type="button"
            disabled={isExecuting}
            onClick={() => onTestRoutine(activeRoutine)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-zinc-100 hover:bg-white text-zinc-950 font-semibold text-xs transition-all shadow-sm disabled:opacity-40 cursor-pointer"
          >
            <Play className="w-3 h-3 fill-current" />
            <span>{isExecuting ? 'Executando...' : 'Executar rotina agora'}</span>
          </button>

          <button
            type="button"
            onClick={() => setInspectorOpen(v => !v)}
            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
              inspectorOpen
                ? 'bg-zinc-800 text-zinc-100'
                : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60'
            }`}
            title="Configurações da rotina"
          >
            <PanelRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ======================================================================== */}
      {/* CANVAS INFINITO COM DOT-GRID ESCURO (#09090b)                             */}
      {/* ======================================================================== */}
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
            const isInteractive = target?.closest?.('button, input, textarea, select, [data-stage-card], [data-no-pan="true"]')
            if (!isInteractive) {
              setIsRoutineMenuOpen(false)
              setIsPanning(true)
              panStartRef.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y }
            }
          }}
          onPointerMove={handlePointerMove}
          onPointerUp={() => {
            setDraggingStage(null)
            setIsPanning(false)
          }}
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
            {/* Linhas Bezier S-Curve entre os 5 Estágios Sequenciais */}
            <svg className="overflow-visible w-full h-full pointer-events-none">
              {stageEdges.map((edge, idx) => {
                const pathD = diagramEdgePath(edge.from, edge.to)
                const arrowPts = diagramEdgeArrow(edge.to)
                return (
                  <g key={idx}>
                    <path
                      d={pathD}
                      fill="none"
                      stroke={edge.color}
                      strokeWidth={1.8}
                      strokeOpacity={0.8}
                    />
                    <polygon points={arrowPts} fill={edge.color} />
                  </g>
                )
              })}
            </svg>

            {/* ==================================================================== */}
            {/* 1. NÓ DE GATILHO (Estilo OpenBot Print 02)                            */}
            {/* ==================================================================== */}
            <div
              style={{
                left: layout.triggerX,
                top: layout.triggerY,
                width: 276
              }}
              data-stage-card="true"
              onPointerDown={e => {
                e.stopPropagation()
                if (toolMode === 'hand') return
                const world = screenToWorld(e.clientX, e.clientY)
                dragOffsetRef.current = { x: world.x - layout.triggerX, y: world.y - layout.triggerY }
                setDraggingStage('trigger')
              }}
              className="absolute pointer-events-auto select-none group"
            >
              {/* Rótulo Flutuante Superior */}
              <div className="flex items-center justify-between mb-1.5 px-1">
                <div className="flex items-center gap-1.5 text-[11px] font-medium text-zinc-400">
                  <Zap className="w-3 h-3 text-amber-400" />
                  <span>⚡ 1. Gatilho</span>
                </div>
                <span className="text-[10px] text-zinc-500 font-mono">
                  {activeRoutine.maxRunsPerDay}x/dia
                </span>
              </div>

              {/* Porta Circular à Direita */}
              <div
                className="absolute -right-9 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-[#1a1a1e] border border-zinc-700/80 text-zinc-300 text-[11px] font-serif flex items-center justify-center z-20"
                title="Saída do gatilho"
              >
                T
              </div>

              {/* Corpo do Card Escuro (#141416) */}
              <div className="rounded-2xl bg-[#141416] border border-zinc-800/90 hover:border-zinc-700/80 p-3.5 shadow-2xl transition-all space-y-3">
                {/* Header do Gatilho */}
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                    <Clock className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-zinc-100 truncate">
                      {activeRoutine.triggerKind === 'weekly_schedule'
                        ? 'Agendamento IANA'
                        : activeRoutine.triggerKind === 'briefing_added'
                        ? 'Pasta Monitorada'
                        : 'Evento no Cofre'}
                    </div>
                    <div className="text-[10px] text-zinc-500 truncate">
                      {TRIGGER_LABELS[activeRoutine.triggerKind]}
                    </div>
                  </div>
                </div>

                {/* Seletor de Tipo de Gatilho */}
                <div onPointerDown={e => e.stopPropagation()}>
                  <CustomSelect
                    value={activeRoutine.triggerKind}
                    onChange={val =>
                      updateRoutine({ triggerKind: val as AutomationTriggerKind })
                    }
                    options={(Object.keys(TRIGGER_LABELS) as AutomationTriggerKind[]).map(k => ({
                      value: k,
                      label: TRIGGER_LABELS[k]
                    }))}
                    className="w-full"
                    size="sm"
                  />
                </div>

                {/* Seletor Visual de 7 Dias da Semana (D S T Q Q S S) */}
                {activeRoutine.triggerKind === 'weekly_schedule' && (
                  <div
                    onPointerDown={e => e.stopPropagation()}
                    className="p-2 rounded-xl bg-[#18181b] border border-zinc-800/80 space-y-2"
                  >
                    <div className="flex items-center justify-between text-[10px] text-zinc-400">
                      <span>{DAYS_OF_WEEK[scheduledDay]}</span>
                      <CustomTimePicker
                        value={`${String(scheduledHour).padStart(2, '0')}:${String(scheduledMin).padStart(2, '0')}`}
                        onChange={newTime => {
                          const [th, tm] = newTime.split(':').map(Number)
                          updateRoutine({
                            scheduleConfig: {
                              ...(activeRoutine.scheduleConfig || {
                                timezone: 'America/Sao_Paulo',
                                missedPolicy: 'run_once_on_open'
                              }),
                              dayOfWeek: scheduledDay,
                              hour: isNaN(th) ? 16 : th,
                              minute: isNaN(tm) ? 0 : tm
                            }
                          })
                        }}
                      />
                    </div>

                    <div className="grid grid-cols-7 gap-1">
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
                            className={`flex flex-col items-center py-1 rounded-lg border transition-all cursor-pointer ${
                              isScheduled
                                ? 'border-amber-400/80 bg-amber-500/20 text-amber-300 font-bold'
                                : 'border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:border-zinc-700'
                            }`}
                          >
                            <span className="text-[10px]">{letter}</span>
                            <span
                              className={`mt-0.5 w-1.5 h-1.5 rounded-full ${
                                isScheduled ? 'bg-amber-400' : 'bg-transparent'
                              }`}
                            />
                          </button>
                        )
                      })}
                    </div>

                    <div className="text-[9px] text-zinc-500 truncate pt-0.5">
                      Próxima: {activeRoutine.nextRunAt ? new Date(activeRoutine.nextRunAt).toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Sob evento'}
                    </div>
                  </div>
                )}

                {/* Se for pasta monitorada */}
                {activeRoutine.triggerKind === 'briefing_added' && (
                  <div onPointerDown={e => e.stopPropagation()} className="space-y-1">
                    <label className="text-[10px] text-zinc-400 block">Pasta monitorada</label>
                    <CustomSelect
                      value={activeRoutine.watchFolder || 'Clientes'}
                      onChange={val => updateRoutine({ watchFolder: val })}
                      options={Array.from(new Set(['Clientes', 'Briefings', 'Pesquisa', ...folders])).map(f => ({
                        value: f,
                        label: f,
                        icon: <Folder className="w-3 h-3 text-zinc-400" />
                      }))}
                      className="w-full"
                      size="sm"
                    />
                  </div>
                )}

                {/* Footer do Card com Botão "Executar agora" e Histórico */}
                <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between text-[10px]">
                  <div className="flex items-center gap-1">
                    <span className="text-zinc-500">Histórico:</span>
                    {(activeRoutine.recentRunIds || []).slice(0, 4).map(id => (
                      <span key={id} className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    ))}
                    {(!activeRoutine.recentRunIds || activeRoutine.recentRunIds.length === 0) && (
                      <span className="text-zinc-600">Sem registros</span>
                    )}
                  </div>
                  <button
                    type="button"
                    onPointerDown={e => e.stopPropagation()}
                    onClick={() => onTestRoutine(activeRoutine)}
                    className="text-amber-400 hover:text-amber-300 font-medium cursor-pointer"
                  >
                    Executar agora ▷
                  </button>
                </div>
              </div>
            </div>

            {/* ==================================================================== */}
            {/* 2. NÓ DE CONTEXTO & FONTES                                            */}
            {/* ==================================================================== */}
            <div
              style={{
                left: layout.contextX,
                top: layout.contextY,
                width: 276
              }}
              data-stage-card="true"
              onPointerDown={e => {
                e.stopPropagation()
                if (toolMode === 'hand') return
                const world = screenToWorld(e.clientX, e.clientY)
                dragOffsetRef.current = { x: world.x - layout.contextX, y: world.y - layout.contextY }
                setDraggingStage('context')
              }}
              className="absolute pointer-events-auto select-none group"
            >
              <div className="flex items-center justify-between mb-1.5 px-1">
                <div className="flex items-center gap-1.5 text-[11px] font-medium text-zinc-400">
                  <FolderOpen className="w-3 h-3 text-purple-400" />
                  <span>📁 2. Contexto & Fontes</span>
                </div>
              </div>

              {/* Porta Entrada Esquerda */}
              <div
                className="absolute -left-9 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-[#1a1a1e] border border-zinc-700/80 text-zinc-300 text-[11px] font-serif flex items-center justify-center z-20"
                title="Entrada do gatilho"
              >
                T
              </div>

              {/* Porta Saída Direita */}
              <div
                className="absolute -right-9 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-[#1a1a1e] border border-zinc-700/80 text-zinc-300 text-[11px] font-serif flex items-center justify-center z-20"
                title="Saída do contexto"
              >
                T
              </div>

              <div className="rounded-2xl bg-[#141416] border border-zinc-800/90 hover:border-zinc-700/80 p-3.5 shadow-2xl transition-all space-y-3">
                <div onPointerDown={e => e.stopPropagation()} className="space-y-2.5">
                  <div>
                    <label className="text-[10px] text-zinc-400 block mb-1">
                      Pasta de Origem
                    </label>
                    <CustomSelect
                      value={activeRoutine.watchFolder || 'Clientes'}
                      onChange={val => updateRoutine({ watchFolder: val })}
                      options={Array.from(new Set(['Clientes', 'Briefings', 'Pesquisa', ...folders])).map(f => ({
                        value: f,
                        label: f,
                        icon: <Folder className="w-3 h-3 text-zinc-400" />
                      }))}
                      className="w-full"
                      size="sm"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] text-zinc-400 block mb-1">
                      Isolamento de Cliente Fixo
                    </label>
                    <CustomSelect
                      value={activeRoutine.projectContextId || ''}
                      onChange={val => updateRoutine({ projectContextId: val || undefined })}
                      options={[
                        { value: '', label: 'Dinâmico (conforme evento)' },
                        ...projects.map(p => ({
                          value: p.id,
                          label: p.clientName || p.name
                        }))
                      ]}
                      className="w-full"
                      size="sm"
                    />
                  </div>

                  {/* Chips de fontes autorizadas */}
                  <div className="bg-[#18181b] rounded-xl p-2 space-y-1 text-[10px]">
                    <span className="text-zinc-500 font-medium">Fontes autorizadas:</span>
                    <div className="flex flex-wrap gap-1">
                      <span className="px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-300">Modelo</span>
                      <span className="px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-300">Catálogo</span>
                      <span className="px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-300">Cliente</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ==================================================================== */}
            {/* 3. NÓ DO AGENTE EXECUTOR                                              */}
            {/* ==================================================================== */}
            <div
              style={{
                left: layout.executorX,
                top: layout.executorY,
                width: 276
              }}
              data-stage-card="true"
              onPointerDown={e => {
                e.stopPropagation()
                if (toolMode === 'hand') return
                const world = screenToWorld(e.clientX, e.clientY)
                dragOffsetRef.current = { x: world.x - layout.executorX, y: world.y - layout.executorY }
                setDraggingStage('executor')
              }}
              className="absolute pointer-events-auto select-none group"
            >
              <div className="flex items-center justify-between mb-1.5 px-1">
                <div className="flex items-center gap-1.5 text-[11px] font-medium text-zinc-400">
                  <Bot className="w-3 h-3 text-cyan-400" />
                  <span>🤖 3. Quem Executa</span>
                </div>
              </div>

              {/* Porta Entrada Esquerda */}
              <div
                className="absolute -left-9 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-[#1a1a1e] border border-zinc-700/80 text-zinc-300 text-[11px] font-serif flex items-center justify-center z-20"
                title="Entrada do executor"
              >
                T
              </div>

              {/* Porta Saída Direita */}
              <div
                className="absolute -right-9 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-[#1a1a1e] border border-zinc-700/80 text-zinc-300 text-[11px] font-serif flex items-center justify-center z-20"
                title="Saída da entrega"
              >
                T
              </div>

              <div className="rounded-2xl bg-[#141416] border border-zinc-800/90 hover:border-zinc-700/80 p-3.5 shadow-2xl transition-all space-y-3">
                <div onPointerDown={e => e.stopPropagation()} className="space-y-2.5">
                  <div>
                    <label className="text-[10px] text-zinc-400 block mb-1">
                      Destino da Execução
                    </label>
                    <CustomSelect
                      value={activeRoutine.targetKind || 'agent'}
                      onChange={val =>
                        updateRoutine({
                          targetKind: val as 'agent' | 'team' | 'workflow'
                        })
                      }
                      options={[
                        { value: 'agent', label: 'Agente Individual', icon: <Bot className="w-3.5 h-3.5 text-blue-400" /> },
                        { value: 'team', label: 'Equipe Coordenada', icon: <Users className="w-3.5 h-3.5 text-amber-400" /> },
                        { value: 'workflow', label: 'Fluxo de Trabalho', icon: <GitBranch className="w-3.5 h-3.5 text-purple-400" /> }
                      ]}
                      className="w-full"
                      size="sm"
                    />
                  </div>

                  {/* Agente selecionado */}
                  {(activeRoutine.targetKind || 'agent') === 'agent' && (
                    <div>
                      <CustomSelect
                        value={activeRoutine.agentId}
                        onChange={chosenId => {
                          const ag = agents.find(a => a.id === chosenId)
                          updateRoutine({ agentId: chosenId, agentVersion: ag?.version || 1 })
                        }}
                        options={agents.map((ag, idx) => ({
                          value: ag.id,
                          label: ag.name,
                          color: AGENT_COLORS[idx % AGENT_COLORS.length]
                        }))}
                        className="w-full"
                        size="sm"
                      />
                    </div>
                  )}

                  {/* Equipe selecionada */}
                  {activeRoutine.targetKind === 'team' && (
                    <div>
                      <CustomSelect
                        value={activeRoutine.teamId || teams[0]?.id || ''}
                        onChange={val => updateRoutine({ teamId: val })}
                        options={teams.map(t => ({
                          value: t.id,
                          label: t.name,
                          icon: <Users className="w-3.5 h-3.5 text-amber-400" />
                        }))}
                        className="w-full"
                        size="sm"
                      />
                    </div>
                  )}

                  {/* Workflow selecionado */}
                  {activeRoutine.targetKind === 'workflow' && (
                    <div>
                      <CustomSelect
                        value={activeRoutine.workflowId || workflows[0]?.id || ''}
                        onChange={val => updateRoutine({ workflowId: val })}
                        options={workflows.map(w => ({
                          value: w.id,
                          label: w.name,
                          icon: <GitBranch className="w-3.5 h-3.5 text-purple-400" />
                        }))}
                        className="w-full"
                        size="sm"
                      />
                    </div>
                  )}

                  {/* Descrição / Prompt da Rotina */}
                  <div>
                    <label className="text-[10px] text-zinc-400 block mb-1">
                      O que executar ao disparar
                    </label>
                    <textarea
                      value={activeRoutine.description}
                      onChange={e => updateRoutine({ description: e.target.value })}
                      placeholder="Instruções para o executor ao rodar esta rotina..."
                      rows={2}
                      className="w-full bg-[#18181b] border border-zinc-800 rounded-xl p-2 text-xs text-zinc-200 resize-none focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* ==================================================================== */}
            {/* 4. NÓ DE APROVAÇÃO HUMANA                                             */}
            {/* ==================================================================== */}
            <div
              style={{
                left: layout.approvalX,
                top: layout.approvalY,
                width: 276
              }}
              data-stage-card="true"
              onPointerDown={e => {
                e.stopPropagation()
                if (toolMode === 'hand') return
                const world = screenToWorld(e.clientX, e.clientY)
                dragOffsetRef.current = { x: world.x - layout.approvalX, y: world.y - layout.approvalY }
                setDraggingStage('approval')
              }}
              className="absolute pointer-events-auto select-none group"
            >
              <div className="flex items-center justify-between mb-1.5 px-1">
                <div className="flex items-center gap-1.5 text-[11px] font-medium text-zinc-400">
                  <ShieldCheck className="w-3 h-3 text-pink-400" />
                  <span>🛡️ 4. Regra de Aprovação</span>
                </div>
              </div>

              {/* Porta Entrada Esquerda */}
              <div
                className="absolute -left-9 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-[#1a1a1e] border border-zinc-700/80 text-zinc-300 text-[11px] font-serif flex items-center justify-center z-20"
                title="Entrada da revisão"
              >
                T
              </div>

              {/* Porta Saída Direita */}
              <div
                className="absolute -right-9 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-[#1a1a1e] border border-zinc-700/80 text-zinc-300 text-[11px] font-serif flex items-center justify-center z-20"
                title="Saída aprovada"
              >
                T
              </div>

              <div className="rounded-2xl bg-[#141416] border border-zinc-800/90 hover:border-zinc-700/80 p-3.5 shadow-2xl transition-all space-y-3">
                <label
                  onPointerDown={e => e.stopPropagation()}
                  className="flex items-start gap-2.5 text-xs text-zinc-200 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={activeRoutine.requireApproval}
                    onChange={e => updateRoutine({ requireApproval: e.target.checked })}
                    className="mt-0.5 accent-pink-500 rounded"
                  />
                  <div className="space-y-0.5">
                    <span className="font-medium">Exigir aprovação humana</span>
                    <p className="text-[10px] text-zinc-500">
                      O rascunho fica pendente na aba de tarefas até você revisar e confirmar antes de gravar no cofre.
                    </p>
                  </div>
                </label>
              </div>
            </div>

            {/* ==================================================================== */}
            {/* 5. NÓ DE DESTINO & TAREFAS                                            */}
            {/* ==================================================================== */}
            <div
              style={{
                left: layout.outputX,
                top: layout.outputY,
                width: 276
              }}
              data-stage-card="true"
              onPointerDown={e => {
                e.stopPropagation()
                if (toolMode === 'hand') return
                const world = screenToWorld(e.clientX, e.clientY)
                dragOffsetRef.current = { x: world.x - layout.outputX, y: world.y - layout.outputY }
                setDraggingStage('output')
              }}
              className="absolute pointer-events-auto select-none group"
            >
              <div className="flex items-center justify-between mb-1.5 px-1">
                <div className="flex items-center gap-1.5 text-[11px] font-medium text-zinc-400">
                  <Target className="w-3 h-3 text-emerald-400" />
                  <span>🎯 5. Destino & Entregas</span>
                </div>
              </div>

              {/* Porta Entrada Esquerda */}
              <div
                className="absolute -left-9 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-[#1a1a1e] border border-zinc-700/80 text-zinc-300 text-[11px] font-serif flex items-center justify-center z-20"
                title="Entrada do destino"
              >
                T
              </div>

              <div className="rounded-2xl bg-[#141416] border border-zinc-800/90 hover:border-zinc-700/80 p-3.5 shadow-2xl transition-all space-y-3">
                <div onPointerDown={e => e.stopPropagation()} className="space-y-2">
                  <label className="text-[10px] text-zinc-400 block mb-0.5">
                    Pasta de Destino no Cofre
                  </label>
                  <CustomSelect
                    value={activeRoutine.targetFolder || 'Propostas'}
                    onChange={val => updateRoutine({ targetFolder: val })}
                    options={Array.from(new Set(['Propostas', 'Escopos', 'Tarefas', 'Clientes', ...folders])).map(f => ({
                      value: f,
                      label: f,
                      icon: <Folder className="w-3 h-3 text-zinc-400" />
                    }))}
                    className="w-full"
                    size="sm"
                  />

                  <div className="flex flex-wrap gap-1 pt-1">
                    <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-[10px] text-zinc-300">
                      📄 Documento formatado
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-[10px] text-zinc-300">
                      📋 Tarefas rastreadas
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ==================================================================== */}
          {/* PÍLULA DE ZOOM NO CANTO INFERIOR ESQUERDO                            */}
          {/* ==================================================================== */}
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
          </div>

          {/* ==================================================================== */}
          {/* DOCK FLUTUANTE INFERIOR CENTRAL (Estilo OpenBot Print 02)             */}
          {/* ==================================================================== */}
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
              onClick={() => setInspectorOpen(v => !v)}
              className={`p-2 rounded-xl transition-colors cursor-pointer ${
                inspectorOpen ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'
              }`}
              title="Abrir configurações detalhadas da rotina"
            >
              <PanelRight className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => onTestRoutine(activeRoutine)}
              className="ml-1 px-3.5 py-2 rounded-xl bg-zinc-100 hover:bg-white text-zinc-950 font-semibold text-xs flex items-center gap-1.5 transition-colors shadow-sm cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Executar agora</span>
            </button>
          </div>

          {/* ==================================================================== */}
          {/* SIDEBAR DIREITA DE INSPETOR DA ROTINA                                 */}
          {/* ==================================================================== */}
          {inspectorOpen && (
            <aside className="w-80 bg-[#111113] border-l border-zinc-800/80 p-4 overflow-y-auto space-y-4 shrink-0 z-30 animate-in slide-in-from-right duration-150">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-2.5">
                <span className="text-xs font-semibold text-zinc-200">Inspetor da Rotina</span>
                <button
                  type="button"
                  onClick={() => setInspectorOpen(false)}
                  className="text-zinc-500 hover:text-zinc-200 p-1 rounded-lg hover:bg-zinc-800/60 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="text-[11px] text-zinc-400 block mb-1">Nome da rotina</label>
                  <input
                    type="text"
                    value={activeRoutine.name}
                    onChange={e => updateRoutine({ name: e.target.value })}
                    className="w-full bg-[#18181b] border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-100 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-[11px] text-zinc-400 block mb-1">
                    Instrução / Descrição da Rotina
                  </label>
                  <textarea
                    value={activeRoutine.description}
                    onChange={e => updateRoutine({ description: e.target.value })}
                    rows={3}
                    className="w-full bg-[#18181b] border border-zinc-800 rounded-xl p-2.5 text-xs text-zinc-100 resize-none focus:outline-none"
                  />
                </div>

                {activeRoutine.triggerKind === 'weekly_schedule' && (
                  <div className="space-y-2.5 p-3 rounded-2xl bg-[#18181b] border border-zinc-800">
                    <div className="font-semibold text-zinc-200 text-xs">Agendamento IANA</div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] text-zinc-400 block mb-0.5">Hora</label>
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
                          className="w-full bg-[#141416] border border-zinc-800 rounded-lg px-2 py-1 text-xs text-zinc-100"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-zinc-400 block mb-0.5">Minuto</label>
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
                          className="w-full bg-[#141416] border border-zinc-800 rounded-lg px-2 py-1 text-xs text-zinc-100"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] text-zinc-400 block mb-0.5">
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
                        className="w-full bg-[#141416] border border-zinc-800 rounded-lg px-2 py-1 text-xs text-zinc-100"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] text-zinc-400 block mb-0.5">
                        Política se o app estiver fechado
                      </label>
                      <CustomSelect
                        value={activeRoutine.scheduleConfig?.missedPolicy || 'run_once_on_open'}
                        onChange={val =>
                          updateRoutine({
                            scheduleConfig: {
                              ...(activeRoutine.scheduleConfig || {
                                dayOfWeek: 5,
                                hour: 16,
                                minute: 0,
                                timezone: 'America/Sao_Paulo'
                              }),
                              missedPolicy: val as 'skip' | 'run_once_on_open'
                            }
                          })
                        }
                        options={[
                          { value: 'run_once_on_open', label: 'Executar 1x ao abrir o Pyrite' },
                          { value: 'skip', label: 'Pular para a próxima semana' }
                        ]}
                        className="w-full"
                        size="sm"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className="text-[11px] text-zinc-400 block mb-1">
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
                    className="w-full bg-[#18181b] border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-100 focus:outline-none"
                  />
                </div>
              </div>
            </aside>
          )}
        </div>
      </div>
    </div>
  )
}
