import React, { useState, useRef } from 'react'
import type {
  AgentProfileVersion,
  AutomationTriggerKind,
  AutomationVersion,
  ProjectContext,
  TeamDefinition,
  WorkflowDefinition
} from '../types/agents'
import { computeNextScheduleRunISO } from '../utils/multiAgentEngine'
import {
  Clock,
  Plus,
  Trash2,
  FlaskConical,
  LayoutGrid,
  Sliders,
  CheckCircle2,
  PauseCircle,
  ZoomIn,
  ZoomOut,
  Maximize2
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
  weekly_schedule: 'Agendamento semanal (Fuso America/Sao_Paulo)',
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
  const [mode, setMode] = useState<'simple' | 'canvas'>('simple')
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 20, y: 20 })

  const draggingStageRef = useRef<{
    stageKey: keyof NonNullable<AutomationVersion['visualLayout']>
    stageKeyY: keyof NonNullable<AutomationVersion['visualLayout']>
    startX: number
    startY: number
    origX: number
    origY: number
  } | null>(null)

  if (!activeRoutine) return null

  const layout = activeRoutine.visualLayout || {
    triggerX: 40,
    triggerY: 130,
    contextX: 330,
    contextY: 130,
    executorX: 620,
    executorY: 130,
    approvalX: 910,
    approvalY: 130,
    outputX: 1200,
    outputY: 130
  }

  const updateRoutine = (patch: Partial<AutomationVersion>) => {
    const merged: AutomationVersion = {
      ...activeRoutine,
      ...patch,
      version: activeRoutine.version + 1,
      updatedAt: Date.now()
    }
    if (merged.triggerKind === 'weekly_schedule' && merged.scheduleConfig) {
      merged.nextRunAt = computeNextScheduleRunISO(merged.scheduleConfig)
    }
    onSaveRoutine(merged)
  }

  const handleCreateRoutine = () => {
    const newRoutine: AutomationVersion = {
      id: `auto_${Date.now()}`,
      version: 1,
      name: `Nova Rotina ${automations.length + 1}`,
      description: 'Execução automatizada com controle de aprovação e limite diário.',
      active: true,
      triggerKind: 'briefing_added',
      watchFolder: 'Clientes',
      targetKind: 'agent',
      agentId: agents[0]?.id || 'agent-proposal-specialist',
      agentVersion: agents[0]?.version || 1,
      targetFolder: 'Propostas',
      requireApproval: true,
      maxRunsPerDay: 5,
      recentRunIds: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    onSaveRoutine(newRoutine)
    onSelectRoutine(newRoutine.id)
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!draggingStageRef.current) return
    const { stageKey, stageKeyY, startX, startY, origX, origY } = draggingStageRef.current
    const dx = Math.round((e.clientX - startX) / zoom)
    const dy = Math.round((e.clientY - startY) / zoom)
    onSaveRoutine({
      ...activeRoutine,
      visualLayout: {
        ...layout,
        [stageKey]: Math.max(20, origX + dx),
        [stageKeyY]: Math.max(20, origY + dy)
      },
      updatedAt: Date.now()
    })
  }

  const handleMouseUp = () => {
    draggingStageRef.current = null
  }

  return (
    <div className="flex flex-col h-full bg-[#0f0f13] text-zinc-100 overflow-hidden">
      {/* Cabeçalho da Rotina */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3.5 border-b border-zinc-800/80 bg-[#14141a]">
        <div className="flex items-center gap-3">
          <Clock className="w-5 h-5 text-[#c59b27]" />
          <select
            value={activeRoutine.id}
            onChange={e => onSelectRoutine(e.target.value)}
            className="bg-zinc-900 border border-zinc-700/80 rounded-lg px-3 py-1.5 text-sm font-semibold text-zinc-100 focus:outline-none focus:border-[#c59b27]"
          >
            {automations.map(a => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.active ? 'Ativa' : 'Pausada'})
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => updateRoutine({ active: !activeRoutine.active })}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium cursor-pointer ${
              activeRoutine.active
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                : 'border-zinc-700 bg-zinc-800 text-zinc-400'
            }`}
          >
            {activeRoutine.active ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Rotina Ativa</span>
              </>
            ) : (
              <>
                <PauseCircle className="w-3.5 h-3.5" />
                <span>Pausada</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleCreateRoutine}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-700/80 hover:border-zinc-500 text-xs font-medium text-zinc-200 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Nova Rotina</span>
          </button>

          {automations.length > 1 && (
            <button
              type="button"
              onClick={() => onDeleteRoutine(activeRoutine.id)}
              className="p-1.5 rounded-lg border border-zinc-800 hover:border-rose-500/50 text-zinc-400 hover:text-rose-400 cursor-pointer"
              title="Excluir rotina"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Alternador Sincronizado: Modo Simples vs Modo Visual (Canvas) */}
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-zinc-900 p-0.5 rounded-lg border border-zinc-800">
            <button
              type="button"
              onClick={() => setMode('simple')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium cursor-pointer ${
                mode === 'simple' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Modo Simples</span>
            </button>
            <button
              type="button"
              onClick={() => setMode('canvas')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium cursor-pointer ${
                mode === 'canvas' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Modo Visual (Canvas)</span>
            </button>
          </div>

          <button
            type="button"
            disabled={isExecuting}
            onClick={() => onTestRoutine(activeRoutine)}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-[#c59b27] hover:bg-[#d4a930] text-black font-semibold text-xs cursor-pointer disabled:opacity-50"
          >
            <FlaskConical className="w-3.5 h-3.5" />
            <span>Testar Rotina Agora</span>
          </button>
        </div>
      </div>

      {/* Corpo: Modo Simples ou Modo Visual (editando a MESMA entidade AutomationVersion!) */}
      {mode === 'simple' ? (
        <div className="flex-1 overflow-y-auto p-6 max-w-4xl mx-auto w-full space-y-6">
          <div className="p-6 rounded-2xl border border-zinc-800/80 bg-[#14141b] space-y-5">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">
                Nome da Rotina
              </label>
              <input
                type="text"
                value={activeRoutine.name}
                onChange={e => updateRoutine({ name: e.target.value })}
                className="w-full bg-zinc-900 border border-zinc-700/80 rounded-xl px-4 py-2.5 text-base font-medium text-zinc-100 focus:outline-none focus:border-[#c59b27]"
              />
            </div>

            {/* Frase estruturada: Quando acontecer X, executar Y, usando Z e entregar em W */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-2">
              <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/50 space-y-3">
                <div className="text-xs font-semibold uppercase tracking-wider text-[#c59b27]">
                  1. Quando acontecer (Gatilho)
                </div>
                <select
                  value={activeRoutine.triggerKind}
                  onChange={e =>
                    updateRoutine({
                      triggerKind: e.target.value as AutomationTriggerKind,
                      scheduleConfig:
                        e.target.value === 'weekly_schedule'
                          ? activeRoutine.scheduleConfig || {
                              dayOfWeek: 5,
                              hour: 16,
                              minute: 0,
                              timezone: 'America/Sao_Paulo',
                              missedPolicy: 'run_once_on_open'
                            }
                          : activeRoutine.scheduleConfig
                    })
                  }
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100"
                >
                  {(Object.keys(TRIGGER_LABELS) as AutomationTriggerKind[]).map(k => (
                    <option key={k} value={k}>
                      {TRIGGER_LABELS[k]}
                    </option>
                  ))}
                </select>

                {activeRoutine.triggerKind === 'weekly_schedule' && (
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <div>
                      <label className="block text-xs text-zinc-400 mb-1">Dia da Semana</label>
                      <select
                        value={activeRoutine.scheduleConfig?.dayOfWeek ?? 5}
                        onChange={e =>
                          updateRoutine({
                            scheduleConfig: {
                              dayOfWeek: Number(e.target.value),
                              hour: activeRoutine.scheduleConfig?.hour ?? 16,
                              minute: activeRoutine.scheduleConfig?.minute ?? 0,
                              timezone: 'America/Sao_Paulo',
                              missedPolicy: activeRoutine.scheduleConfig?.missedPolicy || 'run_once_on_open'
                            }
                          })
                        }
                        className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-zinc-100"
                      >
                        {DAYS_OF_WEEK.map((d, idx) => (
                          <option key={d} value={idx}>
                            {d}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-zinc-400 mb-1">Horário (Brasília)</label>
                      <input
                        type="time"
                        value={`${String(activeRoutine.scheduleConfig?.hour ?? 16).padStart(2, '0')}:${String(
                          activeRoutine.scheduleConfig?.minute ?? 0
                        ).padStart(2, '0')}`}
                        onChange={e => {
                          const [h, m] = e.target.value.split(':').map(Number)
                          updateRoutine({
                            scheduleConfig: {
                              dayOfWeek: activeRoutine.scheduleConfig?.dayOfWeek ?? 5,
                              hour: Number.isFinite(h) ? h : 16,
                              minute: Number.isFinite(m) ? m : 0,
                              timezone: 'America/Sao_Paulo',
                              missedPolicy: activeRoutine.scheduleConfig?.missedPolicy || 'run_once_on_open'
                            }
                          })
                        }}
                        className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-zinc-100"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/50 space-y-3">
                <div className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
                  2. Executar (Agente, Equipe ou Fluxo)
                </div>
                <div className="flex gap-2">
                  {(['agent', 'team', 'workflow'] as const).map(tk => (
                    <button
                      key={tk}
                      type="button"
                      onClick={() => updateRoutine({ targetKind: tk })}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium cursor-pointer ${
                        (activeRoutine.targetKind || 'agent') === tk
                          ? 'bg-[#c59b27] text-black'
                          : 'bg-zinc-800 text-zinc-300'
                      }`}
                    >
                      {tk === 'agent' ? 'Agente' : tk === 'team' ? 'Equipe' : 'Fluxo'}
                    </button>
                  ))}
                </div>

                {(activeRoutine.targetKind || 'agent') === 'agent' && (
                  <select
                    value={activeRoutine.agentId}
                    onChange={e => {
                      const ag = agents.find(a => a.id === e.target.value)
                      updateRoutine({
                        agentId: e.target.value,
                        agentVersion: ag?.version || 1
                      })
                    }}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100"
                  >
                    {agents.map(a => (
                      <option key={a.id} value={a.id}>
                        {a.icon} {a.name}
                      </option>
                    ))}
                  </select>
                )}

                {activeRoutine.targetKind === 'team' && (
                  <select
                    value={activeRoutine.teamId || teams[0]?.id || ''}
                    onChange={e => updateRoutine({ teamId: e.target.value })}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100"
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
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100"
                  >
                    {workflows.map(w => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/50 space-y-3">
                <div className="text-xs font-semibold uppercase tracking-wider text-violet-400">
                  3. Usando o Contexto / Pasta Monitorada
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Pasta Monitorada</label>
                  <select
                    value={activeRoutine.watchFolder || 'Clientes'}
                    onChange={e => updateRoutine({ watchFolder: e.target.value })}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100"
                  >
                    {folders.map(f => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                </div>
                {projects.length > 0 && (
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">Restringir a Cliente/Projeto (Opcional)</label>
                    <select
                      value={activeRoutine.projectContextId || ''}
                      onChange={e => updateRoutine({ projectContextId: e.target.value || undefined })}
                      className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100"
                    >
                      <option value="">Qualquer cliente na pasta monitorada</option>
                      {projects.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.clientName} — {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/50 space-y-3">
                <div className="text-xs font-semibold uppercase tracking-wider text-cyan-400">
                  4. Entregar em & Governança
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Pasta de Destino</label>
                  <select
                    value={activeRoutine.targetFolder}
                    onChange={e => updateRoutine({ targetFolder: e.target.value })}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100"
                  >
                    {folders.map(f => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                </div>

                <label className="flex items-center gap-2 text-sm text-zinc-200 pt-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={activeRoutine.requireApproval}
                    onChange={e => updateRoutine({ requireApproval: e.target.checked })}
                    className="accent-[#c59b27]"
                  />
                  <span>Exigir minha aprovação antes de gravar no cofre</span>
                </label>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Modo Visual em Canvas (Sincronizado com o Modo Simples!) */
        <div
          role="region"
          aria-label="Quadro visual da rotina"
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          className="flex-1 relative overflow-hidden bg-[#0c0c10] select-none"
          style={{
            backgroundImage: 'radial-gradient(rgba(255,255,255,0.07) 1px, transparent 1px)',
            backgroundSize: `${24 * zoom}px ${24 * zoom}px`
          }}
        >
          <div className="absolute top-4 right-4 z-10 flex items-center gap-1 bg-zinc-900 px-2.5 py-1 rounded-lg border border-zinc-800 text-xs">
            <button
              type="button"
              onClick={() => setZoom(z => Math.max(0.6, Number((z - 0.1).toFixed(2))))}
              className="p-1 text-zinc-400 hover:text-white cursor-pointer"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="w-11 text-center text-zinc-300">{Math.round(zoom * 100)}%</span>
            <button
              type="button"
              onClick={() => setZoom(z => Math.min(1.4, Number((z + 0.1).toFixed(2))))}
              className="p-1 text-zinc-400 hover:text-white cursor-pointer"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => {
                setZoom(1)
                setPan({ x: 20, y: 20 })
              }}
              className="p-1 text-zinc-400 hover:text-white cursor-pointer"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          </div>

          <div
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: '0 0'
            }}
            className="w-[1600px] h-[800px] relative"
          >
            {/* Linhas conectando os 5 blocos da rotina */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none">
              {[
                [layout.triggerX, layout.triggerY, layout.contextX, layout.contextY],
                [layout.contextX, layout.contextY, layout.executorX, layout.executorY],
                [layout.executorX, layout.executorY, layout.approvalX, layout.approvalY],
                [layout.approvalX, layout.approvalY, layout.outputX, layout.outputY]
              ].map(([x1, y1, x2, y2], idx) => {
                const sx = x1 + 240
                const sy = y1 + 65
                const tx = x2
                const ty = y2 + 65
                const mx = (sx + tx) / 2
                return (
                  <g key={idx}>
                    <path
                      d={`M ${sx} ${sy} C ${mx} ${sy}, ${mx} ${ty}, ${tx} ${ty}`}
                      fill="none"
                      stroke="#c59b27"
                      strokeWidth={2.2}
                    />
                    <circle cx={tx} cy={ty} r={4.5} fill="#c59b27" />
                  </g>
                )
              })}
            </svg>

            {/* Bloco 1: Gatilho */}
            <div
              style={{ left: layout.triggerX, top: layout.triggerY }}
              onMouseDown={e => {
                if ((e.target as HTMLElement).tagName === 'SELECT') return
                draggingStageRef.current = {
                  stageKey: 'triggerX',
                  stageKeyY: 'triggerY',
                  startX: e.clientX,
                  startY: e.clientY,
                  origX: layout.triggerX,
                  origY: layout.triggerY
                }
              }}
              className="absolute w-60 rounded-xl border border-[#c59b27]/60 bg-[#16161e] p-3.5 shadow-xl cursor-move space-y-2"
            >
              <div className="text-[11px] font-bold uppercase tracking-wider text-[#c59b27]">
                1. Quando acontecer
              </div>
              <select
                value={activeRoutine.triggerKind}
                onChange={e => updateRoutine({ triggerKind: e.target.value as AutomationTriggerKind })}
                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-zinc-100"
              >
                {(Object.keys(TRIGGER_LABELS) as AutomationTriggerKind[]).map(k => (
                  <option key={k} value={k}>
                    {TRIGGER_LABELS[k]}
                  </option>
                ))}
              </select>
            </div>

            {/* Bloco 2: Contexto */}
            <div
              style={{ left: layout.contextX, top: layout.contextY }}
              onMouseDown={e => {
                if ((e.target as HTMLElement).tagName === 'SELECT') return
                draggingStageRef.current = {
                  stageKey: 'contextX',
                  stageKeyY: 'contextY',
                  startX: e.clientX,
                  startY: e.clientY,
                  origX: layout.contextX,
                  origY: layout.contextY
                }
              }}
              className="absolute w-60 rounded-xl border border-violet-500/50 bg-[#16161e] p-3.5 shadow-xl cursor-move space-y-2"
            >
              <div className="text-[11px] font-bold uppercase tracking-wider text-violet-400">
                2. Usando Contexto
              </div>
              <select
                value={activeRoutine.watchFolder || 'Clientes'}
                onChange={e => updateRoutine({ watchFolder: e.target.value })}
                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-zinc-100"
              >
                {folders.map(f => (
                  <option key={f} value={f}>
                    Pasta: {f}
                  </option>
                ))}
              </select>
            </div>

            {/* Bloco 3: Executor */}
            <div
              style={{ left: layout.executorX, top: layout.executorY }}
              onMouseDown={e => {
                if ((e.target as HTMLElement).tagName === 'SELECT') return
                draggingStageRef.current = {
                  stageKey: 'executorX',
                  stageKeyY: 'executorY',
                  startX: e.clientX,
                  startY: e.clientY,
                  origX: layout.executorX,
                  origY: layout.executorY
                }
              }}
              className="absolute w-60 rounded-xl border border-emerald-500/50 bg-[#16161e] p-3.5 shadow-xl cursor-move space-y-2"
            >
              <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">
                3. Executar Agente
              </div>
              <select
                value={activeRoutine.agentId}
                onChange={e => updateRoutine({ agentId: e.target.value })}
                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-zinc-100"
              >
                {agents.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.icon} {a.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Bloco 4: Aprovação */}
            <div
              style={{ left: layout.approvalX, top: layout.approvalY }}
              onMouseDown={e => {
                if ((e.target as HTMLElement).tagName === 'INPUT') return
                draggingStageRef.current = {
                  stageKey: 'approvalX',
                  stageKeyY: 'approvalY',
                  startX: e.clientX,
                  startY: e.clientY,
                  origX: layout.approvalX,
                  origY: layout.approvalY
                }
              }}
              className="absolute w-60 rounded-xl border border-pink-500/50 bg-[#16161e] p-3.5 shadow-xl cursor-move space-y-2"
            >
              <div className="text-[11px] font-bold uppercase tracking-wider text-pink-400">
                4. Governança
              </div>
              <label className="flex items-center gap-2 text-xs text-zinc-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={activeRoutine.requireApproval}
                  onChange={e => updateRoutine({ requireApproval: e.target.checked })}
                  className="accent-[#c59b27]"
                />
                <span>Pausar para aprovação humana</span>
              </label>
              <div className="text-[11px] text-zinc-400">
                Limite diário: {activeRoutine.maxRunsPerDay} execuções/dia
              </div>
            </div>

            {/* Bloco 5: Destino */}
            <div
              style={{ left: layout.outputX, top: layout.outputY }}
              onMouseDown={e => {
                if ((e.target as HTMLElement).tagName === 'SELECT') return
                draggingStageRef.current = {
                  stageKey: 'outputX',
                  stageKeyY: 'outputY',
                  startX: e.clientX,
                  startY: e.clientY,
                  origX: layout.outputX,
                  origY: layout.outputY
                }
              }}
              className="absolute w-60 rounded-xl border border-cyan-500/50 bg-[#16161e] p-3.5 shadow-xl cursor-move space-y-2"
            >
              <div className="text-[11px] font-bold uppercase tracking-wider text-cyan-400">
                5. Entregar em
              </div>
              <select
                value={activeRoutine.targetFolder}
                onChange={e => updateRoutine({ targetFolder: e.target.value })}
                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-zinc-100"
              >
                {folders.map(f => (
                  <option key={f} value={f}>
                    Pasta: {f}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
