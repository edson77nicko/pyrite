import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import type { AgentProfileVersion, TeamDefinition, SquadPipelineStep } from '../types/agents'
import {
  Users,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  MessageSquare,
  Code,
  FileText,
  ListTodo,
  Search,
  Check,
  X,
  Pencil,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Activity
} from 'lucide-react'
import { AgentIcon } from './AgentIcon'
import { renderDynamicIcon, IconPickerPopover } from './IconPickerPopover'

interface SquadManagementViewProps {
  squads: TeamDefinition[]
  agents: AgentProfileVersion[]
  selectedSquadId: string
  onSelectSquad: (squadId: string) => void
  onSaveSquad: (squad: TeamDefinition) => void
  onDeleteSquad: (squadId: string) => void
  onOpenSquadChat: (squad: TeamDefinition) => void
}

const OUTPUT_TYPE_CONFIG: Record<
  string,
  { label: string; icon: any; color: string; badge: string; desc: string }
> = {
  html: {
    label: 'Interface HTML',
    icon: Code,
    color: '#38bdf8',
    badge: 'HTML',
    desc: 'Renderização visual interativa no chat'
  },
  note: {
    label: 'Nota no Cofre',
    icon: FileText,
    color: '#34d399',
    badge: 'NOTA',
    desc: 'Criação ou edição de documento no cofre'
  },
  tasks: {
    label: 'Tarefas no Quadro',
    icon: ListTodo,
    color: '#fbbf24',
    badge: 'TAREFAS',
    desc: 'Itens acionáveis com prazo e prioridade'
  },
  text: {
    label: 'Texto / Análise',
    icon: MessageSquare,
    color: '#a78bfa',
    badge: 'TEXTO',
    desc: 'Síntese textual e parecer explicativo'
  }
}

interface ActivityLogItem {
  id: string
  time: string
  agentName: string
  status: string
  success?: boolean
}

export const SquadManagementView: React.FC<SquadManagementViewProps> = ({
  squads,
  agents,
  selectedSquadId,
  onSelectSquad,
  onSaveSquad,
  onDeleteSquad,
  onOpenSquadChat
}) => {
  const activeSquad = squads.find(s => s.id === selectedSquadId) || squads[0]
  const [squadSearchQuery, setSquadSearchQuery] = useState('')
  const [agentFilterQuery, setAgentFilterQuery] = useState('')
  const [connectionFilter, setConnectionFilter] = useState<'all' | 'active' | 'inactive'>('all')

  // Estado de expansão do acordeão por card (Configurar ⌵)
  const [expandedCardIds, setExpandedCardIds] = useState<Record<string, boolean>>({})

  // Modais e edição inline
  const [isNewSquadModalOpen, setIsNewSquadModalOpen] = useState(false)
  const [isAddMemberModalOpen, setIsAddMemberModalOpen] = useState(false)
  const [isIconPickerOpen, setIsIconPickerOpen] = useState(false)
  const [isEditingSquadName, setIsEditingSquadName] = useState(false)
  const [squadNameInput, setSquadNameInput] = useState('')
  const iconPickerButtonRef = useRef<HTMLButtonElement | null>(null)

  // Formulário de novo esquadrão
  const [newSquadName, setNewSquadName] = useState('')
  const [newSquadObjective, setNewSquadObjective] = useState('')
  const [newSquadLeadAgentId, setNewSquadLeadAgentId] = useState('')
  const [newSquadIcon, setNewSquadIcon] = useState('Users')

  // Formulário de adicionar membro
  const [selectedAgentToAdd, setSelectedAgentToAdd] = useState('')
  const [newMemberRole, setNewMemberRole] = useState('')
  const [newMemberPrompt, setNewMemberPrompt] = useState('')
  const [newMemberOutput, setNewMemberOutput] = useState<'html' | 'note' | 'tasks' | 'text'>('text')

  // Histórico de atividade em tempo real da esteira
  const [activityLogs, setActivityLogs] = useState<ActivityLogItem[]>([
    { id: 'log-1', time: '09:40:55', agentName: 'Líder / Coordenador', status: 'ativo ✓', success: true },
    { id: 'log-2', time: '09:41:00', agentName: 'Especialista Central', status: '18 ms', success: true },
    { id: 'log-3', time: '09:41:07', agentName: 'Esteira Conectada', status: '200 OK', success: true }
  ])

  // Refs para medição de cabos SVG
  const lienzoRef = useRef<HTMLDivElement | null>(null)
  const nucleoRef = useRef<HTMLDivElement | null>(null)
  const cardSocketsRef = useRef<Record<string, HTMLDivElement | null>>({})
  const [cablePaths, setCablePaths] = useState<
    { id: string; d: string; active: boolean; side: 'left' | 'right' }[]
  >([])

  // Obter pipeline do esquadrão ativo com fallback retrocompatível
  const getSquadPipeline = (squad?: TeamDefinition | null): SquadPipelineStep[] => {
    if (!squad) return []
    if (squad.pipeline && squad.pipeline.length > 0) {
      return squad.pipeline.map(p => ({
        ...p,
        enabled: p.enabled !== false
      }))
    }
    return (squad.nodes || []).map((n, idx) => ({
      id: `step_${n.agentId}_${idx}`,
      agentId: n.agentId,
      roleInSquad: n.roleInTeam === 'coordinator' ? 'Coordenador & Líder' : `Especialista ${idx + 1}`,
      order: idx + 1,
      enabled: true,
      expectedOutput: (n.allowedOutputTypes?.[0] as any) || 'text'
    }))
  }

  const currentPipeline = useMemo(() => {
    return activeSquad ? getSquadPipeline(activeSquad) : []
  }, [activeSquad?.id, activeSquad?.pipeline, activeSquad?.nodes])

  // Filtragem dos agentes na visualização Empalme
  const filteredPipeline = useMemo(() => {
    return currentPipeline.filter(step => {
      const ag = agents.find(a => a.id === step.agentId)
      const matchesSearch =
        !agentFilterQuery ||
        (ag?.name || '').toLowerCase().includes(agentFilterQuery.toLowerCase()) ||
        (step.roleInSquad || '').toLowerCase().includes(agentFilterQuery.toLowerCase())

      const isStepActive = step.enabled !== false
      if (connectionFilter === 'active') return matchesSearch && isStepActive
      if (connectionFilter === 'inactive') return matchesSearch && !isStepActive
      return matchesSearch
    })
  }, [currentPipeline, agents, agentFilterQuery, connectionFilter])

  // Dividir a lista em Coluna Esquerda e Coluna Direita (distribuição equilibrada)
  const halfCount = Math.ceil(filteredPipeline.length / 2)
  const leftColumnSteps = useMemo(() => filteredPipeline.slice(0, halfCount), [filteredPipeline, halfCount])
  const rightColumnSteps = useMemo(() => filteredPipeline.slice(halfCount), [filteredPipeline, halfCount])

  const activeCount = currentPipeline.filter(p => p.enabled !== false).length
  const inactiveCount = currentPipeline.length - activeCount

  // Atualizar cálculo das curvas SVG dos cabos
  const recalculateCables = useCallback(() => {
    if (!lienzoRef.current || !nucleoRef.current) return

    const lienzoRect = lienzoRef.current.getBoundingClientRect()
    const nucleoRect = nucleoRef.current.getBoundingClientRect()

    const nucleoCenterY = nucleoRect.top + nucleoRect.height / 2 - lienzoRect.top
    const nucleoLeftX = nucleoRect.left - lienzoRect.left
    const nucleoRightX = nucleoRect.right - lienzoRect.left

    const newPaths: { id: string; d: string; active: boolean; side: 'left' | 'right' }[] = []

    // Cabos da coluna esquerda
    leftColumnSteps.forEach(step => {
      const socketEl = cardSocketsRef.current[step.id]
      if (!socketEl) return
      const sRect = socketEl.getBoundingClientRect()
      const x1 = sRect.left + sRect.width / 2 - lienzoRect.left
      const y1 = sRect.top + sRect.height / 2 - lienzoRect.top
      const x2 = nucleoLeftX + 4
      const y2 = nucleoCenterY

      const cp1X = x1 + (x2 - x1) * 0.55
      const cp1Y = y1
      const cp2X = x2 - (x2 - x1) * 0.35
      const cp2Y = y2

      newPaths.push({
        id: step.id,
        d: `M ${x1} ${y1} C ${cp1X} ${cp1Y}, ${cp2X} ${cp2Y}, ${x2} ${y2}`,
        active: step.enabled !== false,
        side: 'left'
      })
    })

    // Cabos da coluna direita
    rightColumnSteps.forEach(step => {
      const socketEl = cardSocketsRef.current[step.id]
      if (!socketEl) return
      const sRect = socketEl.getBoundingClientRect()
      const x1 = sRect.left + sRect.width / 2 - lienzoRect.left
      const y1 = sRect.top + sRect.height / 2 - lienzoRect.top
      const x2 = nucleoRightX - 4
      const y2 = nucleoCenterY

      const cp1X = x1 - (x1 - x2) * 0.55
      const cp1Y = y1
      const cp2X = x2 + (x1 - x2) * 0.35
      const cp2Y = y2

      newPaths.push({
        id: step.id,
        d: `M ${x1} ${y1} C ${cp1X} ${cp1Y}, ${cp2X} ${cp2Y}, ${x2} ${y2}`,
        active: step.enabled !== false,
        side: 'right'
      })
    })

    setCablePaths(prev => {
      if (prev.length === newPaths.length) {
        let isSame = true
        for (let i = 0; i < prev.length; i++) {
          if (
            prev[i].id !== newPaths[i].id ||
            prev[i].d !== newPaths[i].d ||
            prev[i].active !== newPaths[i].active ||
            prev[i].side !== newPaths[i].side
          ) {
            isSame = false
            break
          }
        }
        if (isSame) return prev
      }
      return newPaths
    })
  }, [leftColumnSteps, rightColumnSteps])

  useEffect(() => {
    let rafId: number
    const scheduleRecalc = () => {
      cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(() => recalculateCables())
    }

    scheduleRecalc()
    window.addEventListener('resize', scheduleRecalc)
    const observer = new ResizeObserver(() => scheduleRecalc())
    if (lienzoRef.current) observer.observe(lienzoRef.current)

    return () => {
      cancelAnimationFrame(rafId)
      window.removeEventListener('resize', scheduleRecalc)
      observer.disconnect()
    }
  }, [recalculateCables, expandedCardIds, activeSquad?.id])

  // Alternar conexão do agente (Toggle ON/OFF)
  const handleToggleStepConnection = (stepId: string) => {
    if (!activeSquad) return
    const targetStep = currentPipeline.find(s => s.id === stepId)
    if (!targetStep) return

    const nextEnabled = targetStep.enabled === false ? true : false
    const updated = currentPipeline.map(s => (s.id === stepId ? { ...s, enabled: nextEnabled } : s))

    onSaveSquad({
      ...activeSquad,
      pipeline: updated,
      updatedAt: Date.now()
    })

    // Adicionar log na caixa de atividade
    const ag = agents.find(a => a.id === targetStep.agentId)
    const timeStr = new Date().toTimeString().split(' ')[0]
    setActivityLogs(prev => [
      {
        id: `act-${Date.now()}`,
        time: timeStr,
        agentName: ag?.name || 'Agente',
        status: nextEnabled ? 'conectado ✓' : 'desconectado ✕',
        success: nextEnabled
      },
      ...prev.slice(0, 4)
    ])

    setTimeout(recalculateCables, 50)
  }

  const handleUpdateStep = (stepId: string, partial: Partial<SquadPipelineStep>) => {
    if (!activeSquad) return
    const updated = currentPipeline.map(s => (s.id === stepId ? { ...s, ...partial } : s))
    onSaveSquad({
      ...activeSquad,
      pipeline: updated,
      updatedAt: Date.now()
    })
  }

  const handleMoveStep = (stepIndex: number, direction: 'up' | 'down') => {
    if (!activeSquad) return
    const pipeline = [...currentPipeline]
    const targetIndex = direction === 'up' ? stepIndex - 1 : stepIndex + 1
    if (targetIndex < 0 || targetIndex >= pipeline.length) return

    const temp = pipeline[stepIndex]
    pipeline[stepIndex] = pipeline[targetIndex]
    pipeline[targetIndex] = temp

    const updated = pipeline.map((p, idx) => ({ ...p, order: idx + 1 }))
    onSaveSquad({
      ...activeSquad,
      pipeline: updated,
      coordinatorAgentId: updated[0]?.agentId || activeSquad.coordinatorAgentId,
      updatedAt: Date.now()
    })
  }

  const handleRemoveStep = (stepId: string) => {
    if (!activeSquad) return
    const updated = currentPipeline
      .filter(s => s.id !== stepId)
      .map((p, idx) => ({ ...p, order: idx + 1 }))
    onSaveSquad({
      ...activeSquad,
      pipeline: updated,
      updatedAt: Date.now()
    })
  }

  const handleAddMember = () => {
    if (!activeSquad || !selectedAgentToAdd) return
    const targetAgent = agents.find(a => a.id === selectedAgentToAdd)
    const newStep: SquadPipelineStep = {
      id: `step_${selectedAgentToAdd}_${Date.now()}`,
      agentId: selectedAgentToAdd,
      roleInSquad: newMemberRole.trim() || `${currentPipeline.length + 1}. ${targetAgent?.name || 'Especialista'}`,
      order: currentPipeline.length + 1,
      enabled: true,
      customPrompt: newMemberPrompt.trim() || undefined,
      expectedOutput: newMemberOutput
    }
    const updated = [...currentPipeline, newStep]
    onSaveSquad({
      ...activeSquad,
      pipeline: updated,
      updatedAt: Date.now()
    })
    setIsAddMemberModalOpen(false)
    setSelectedAgentToAdd('')
    setNewMemberRole('')
    setNewMemberPrompt('')
  }

  const handleCreateSquad = () => {
    if (!newSquadName.trim()) return
    const leadId = newSquadLeadAgentId || agents[0]?.id || 'agent-partner'
    const newSquad: TeamDefinition = {
      id: `squad-${Date.now()}`,
      version: 1,
      name: newSquadName.trim(),
      description: 'Esquadrão especializado com arquitetura centralizada.',
      objective: newSquadObjective.trim() || 'Processar demandas de ponta a ponta com especialistas conectados.',
      coordinatorAgentId: leadId,
      maxParallelSubtasks: 6,
      icon: newSquadIcon || 'Users',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      pipeline: [
        {
          id: `step_${leadId}_1`,
          agentId: leadId,
          roleInSquad: '1. Líder & Estrategista',
          order: 1,
          enabled: true,
          expectedOutput: 'text'
        }
      ],
      nodes: [
        {
          id: `tnode-${leadId}`,
          agentId: leadId,
          position: { x: 80, y: 160 },
          roleInTeam: 'coordinator',
          contextScope: ['template', 'permanent_ref', 'project_context', 'request_context'],
          allowedOutputTypes: ['note', 'tasks', 'mindmap', 'draw']
        }
      ],
      edges: []
    }

    onSaveSquad(newSquad)
    onSelectSquad(newSquad.id)
    setIsNewSquadModalOpen(false)
    setNewSquadName('')
    setNewSquadObjective('')
    setNewSquadIcon('Users')
  }

  const handleSaveSquadName = () => {
    if (!activeSquad || !squadNameInput.trim()) {
      setIsEditingSquadName(false)
      return
    }
    onSaveSquad({
      ...activeSquad,
      name: squadNameInput.trim(),
      updatedAt: Date.now()
    })
    setIsEditingSquadName(false)
  }

  // Renderizador de Card individual
  const renderAgentCard = (step: SquadPipelineStep, side: 'left' | 'right') => {
    const ag = agents.find(a => a.id === step.agentId)
    const isExpanded = Boolean(expandedCardIds[step.id])
    const isStepActive = step.enabled !== false
    const outMeta = OUTPUT_TYPE_CONFIG[step.expectedOutput || 'text'] || OUTPUT_TYPE_CONFIG.text
    const OutIcon = outMeta.icon
    const stepIdx = currentPipeline.findIndex(s => s.id === step.id)

    return (
      <div
        key={step.id}
        className={`relative rounded-2xl border transition-all duration-200 ${
          isStepActive
            ? 'bg-[#141419] border-zinc-700/80 shadow-md hover:border-zinc-600'
            : 'bg-[#101013] border-zinc-800/60 opacity-80'
        }`}
      >
        {/* Ponto Conector Socket do Cabo na borda */}
        <div
          ref={el => {
            cardSocketsRef.current[step.id] = el
          }}
          className={`absolute top-7 w-3.5 h-3.5 rounded-full border-2 border-[#101014] z-20 flex items-center justify-center transition-all ${
            side === 'left' ? '-right-1.75' : '-left-1.75'
          } ${
            isStepActive
              ? 'bg-[var(--accent)] shadow-[0_0_10px_var(--accent-glow,#38bdf8)]'
              : 'bg-zinc-700'
          }`}
        >
          <span className="w-1 h-1 rounded-full bg-white opacity-80" />
        </div>

        {/* Topo do Card: Avatar + Informações + Switch Toggle */}
        <div className="p-3.5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5 min-w-0">
              <AgentIcon
                variant={ag?.icon}
                state={isStepActive ? (ag?.state === 'working' ? 'executing' : 'waiting') : 'waiting'}
                size={34}
                className="shrink-0 rounded-xl"
              />
              <div className="min-w-0">
                <div className="font-semibold text-xs text-zinc-100 truncate">
                  {ag?.name || 'Agente'}
                </div>
                <div className="text-[11px] text-zinc-400 truncate mt-0.5">
                  {step.roleInSquad}
                </div>
              </div>
            </div>

            {/* Interruptor Switch (ON / OFF) com estilo Empalme */}
            <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
              <span className="text-[10px] text-zinc-400 font-medium">
                {isStepActive ? 'Conectado' : 'Conectar'}
              </span>
              <button
                type="button"
                onClick={() => handleToggleStepConnection(step.id)}
                className={`w-9 h-5 rounded-full p-0.5 transition-colors cursor-pointer flex items-center ${
                  isStepActive ? 'bg-[var(--accent)]' : 'bg-zinc-800'
                }`}
                title={isStepActive ? 'Desconectar do núcleo' : 'Conectar ao núcleo'}
              >
                <div
                  className={`w-4 h-4 rounded-full bg-white shadow-xs transition-transform transform ${
                    isStepActive ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Rodapé do Card: Status luminoso + Badge de Saída + Botão Configurar ⌵ */}
          <div className="flex items-center justify-between mt-3 pt-2 border-t border-zinc-800/60 text-[11px]">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                <span
                  className={`w-2 h-2 rounded-full ${
                    isStepActive ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-600'
                  }`}
                />
                <span className={isStepActive ? 'text-zinc-300 font-medium' : 'text-zinc-500'}>
                  {isStepActive ? 'Ativa' : 'Sin conectar'}
                </span>
              </div>
              <span
                className="flex items-center gap-1 text-[9.5px] px-1.5 py-0.2 rounded border font-medium"
                style={{
                  color: outMeta.color,
                  borderColor: `${outMeta.color}30`,
                  backgroundColor: `${outMeta.color}10`
                }}
              >
                <OutIcon className="w-2.5 h-2.5" />
                <span>{outMeta.badge}</span>
              </span>
            </div>

            <button
              type="button"
              onClick={() => {
                setExpandedCardIds(prev => ({
                  ...prev,
                  [step.id]: !prev[step.id]
                }))
                setTimeout(recalculateCables, 50)
              }}
              className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
            >
              <span>Configurar</span>
              {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          </div>
        </div>

        {/* Acordeão de Configuração Sanfona (Abre embutido no Card como no vídeo) */}
        {isExpanded && (
          <div className="px-3.5 pb-3.5 pt-1 border-t border-zinc-800/80 space-y-3 text-xs animate-in fade-in duration-150">
            {/* Prompt de Orientação IA */}
            <div className="space-y-1">
              <label className="text-zinc-300 font-medium text-[11px] flex items-center justify-between">
                <span>Prompt de Orientação (IA)</span>
                <Sparkles className="w-3 h-3 text-[var(--accent)]" />
              </label>
              <textarea
                rows={3}
                value={step.customPrompt || ''}
                onChange={e => handleUpdateStep(step.id, { customPrompt: e.target.value })}
                placeholder="Orientações específicas para direcionar este agente nesta esteira..."
                className="w-full bg-[#18181d] border border-zinc-800 rounded-xl px-2.5 py-1.5 text-zinc-100 placeholder-zinc-500 text-[11px] focus:outline-none focus:border-zinc-700 resize-none leading-relaxed"
              />
            </div>

            {/* Função no Esquadrão */}
            <div className="space-y-1">
              <label className="text-zinc-300 font-medium text-[11px]">Função nesta Etapa</label>
              <input
                type="text"
                value={step.roleInSquad}
                onChange={e => handleUpdateStep(step.id, { roleInSquad: e.target.value })}
                className="w-full bg-[#18181d] border border-zinc-800 rounded-xl px-2.5 py-1.5 text-zinc-100 text-[11px] focus:outline-none focus:border-zinc-700"
              />
            </div>

            {/* Tipo de Entrega */}
            <div className="space-y-1">
              <label className="text-zinc-300 font-medium text-[11px]">Entrega Esperada</label>
              <div className="grid grid-cols-2 gap-1.5">
                {(Object.keys(OUTPUT_TYPE_CONFIG) as Array<keyof typeof OUTPUT_TYPE_CONFIG>).map(k => {
                  const meta = OUTPUT_TYPE_CONFIG[k]
                  const Icon = meta.icon
                  const isSel = (step.expectedOutput || 'text') === k
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => handleUpdateStep(step.id, { expectedOutput: k as any })}
                      className={`flex items-center gap-1.5 p-1.5 rounded-lg border text-left cursor-pointer transition-all ${
                        isSel
                          ? 'bg-[var(--accent)]/15 border-[var(--accent)]/40 text-zinc-100 font-medium'
                          : 'bg-[#18181d] border-zinc-800 text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      <Icon className="w-3 h-3" style={{ color: meta.color }} />
                      <span className="text-[10px] truncate">{meta.badge}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Gestão de Ordem e Remoção */}
            <div className="pt-2 border-t border-zinc-800/60 flex items-center justify-between">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={stepIdx === 0}
                  onClick={() => handleMoveStep(stepIdx, 'up')}
                  className="p-1 rounded-lg border border-zinc-800 text-zinc-400 hover:text-zinc-200 disabled:opacity-30 cursor-pointer"
                  title="Mover para cima"
                >
                  <ArrowUp className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  disabled={stepIdx === currentPipeline.length - 1}
                  onClick={() => handleMoveStep(stepIdx, 'down')}
                  className="p-1 rounded-lg border border-zinc-800 text-zinc-400 hover:text-zinc-200 disabled:opacity-30 cursor-pointer"
                  title="Mover para baixo"
                >
                  <ArrowDown className="w-3 h-3" />
                </button>
              </div>

              {currentPipeline.length > 1 && (
                <button
                  type="button"
                  onClick={() => handleRemoveStep(step.id)}
                  className="flex items-center gap-1 text-[10.5px] text-rose-400 hover:text-rose-300 cursor-pointer"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Remover</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex-1 flex overflow-hidden bg-[#0a0a0c]">
      {/* ==================================================================== */}
      {/* COLUNA ESQUERDA: LISTA DE ESQUADRÕES                                 */}
      {/* ==================================================================== */}
      <aside className="w-72 shrink-0 h-full bg-[#0e0e11] border-r border-zinc-800/80 flex flex-col">
        {/* Cabeçalho */}
        <div className="h-13 px-4 border-b border-zinc-800/80 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[var(--accent)]/15 border border-[var(--accent)]/30 flex items-center justify-center text-[var(--accent)]">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-semibold text-zinc-100">Esquadrões</div>
              <div className="text-[10px] text-zinc-500">{squads.length} equipes</div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setNewSquadLeadAgentId(agents[0]?.id || '')
              setNewSquadIcon('Users')
              setIsNewSquadModalOpen(true)
            }}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[var(--accent)] hover:brightness-110 text-zinc-950 font-semibold text-xs transition-all cursor-pointer shadow-sm active:scale-95"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Novo</span>
          </button>
        </div>

        {/* Busca de Esquadrões */}
        <div className="p-3 border-b border-zinc-800/60">
          <div className="relative flex items-center">
            <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 pointer-events-none" />
            <input
              type="text"
              value={squadSearchQuery}
              onChange={e => setSquadSearchQuery(e.target.value)}
              placeholder="Buscar esquadrão..."
              className="w-full bg-[#151518] border border-zinc-800/80 rounded-xl pl-8 pr-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-700"
            />
          </div>
        </div>

        {/* Lista de Esquadrões */}
        <div className="flex-1 overflow-y-auto custom-chat-scrollbar p-2.5 space-y-1.5">
          {squads
            .filter(
              s =>
                s.name.toLowerCase().includes(squadSearchQuery.toLowerCase()) ||
                (s.objective || '').toLowerCase().includes(squadSearchQuery.toLowerCase())
            )
            .map(sq => {
              const isSelected = sq.id === activeSquad?.id
              const pipeline = getSquadPipeline(sq)
              const actCount = pipeline.filter(p => p.enabled !== false).length

              return (
                <button
                  key={sq.id}
                  type="button"
                  onClick={() => onSelectSquad(sq.id)}
                  className={`w-full text-left p-3 rounded-xl border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-[#18181d] border-[var(--accent)]/40 ring-1 ring-[var(--accent)]/20 shadow-sm'
                      : 'bg-[#121215] border-zinc-800/60 hover:bg-[#151519] hover:border-zinc-700/60'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-6 h-6 rounded-lg bg-zinc-800/90 border border-zinc-700/60 flex items-center justify-center text-zinc-300 shrink-0">
                        {renderDynamicIcon(sq.icon || 'Users', 'w-3.5 h-3.5 text-zinc-300')}
                      </div>
                      <div className="font-semibold text-xs text-zinc-100 truncate">{sq.name}</div>
                    </div>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-zinc-800 text-zinc-400 font-mono shrink-0">
                      {actCount}/{pipeline.length}
                    </span>
                  </div>
                  {sq.objective && (
                    <p className="text-[11px] text-zinc-400 mt-1.5 line-clamp-2 leading-relaxed">
                      {sq.objective}
                    </p>
                  )}
                </button>
              )
            })}
        </div>
      </aside>

      {/* ==================================================================== */}
      {/* PAINEL CENTRAL: O CANVAS DE INTEGRAÇÃO CENTRALIZADA (EMPALME)         */}
      {/* ==================================================================== */}
      {activeSquad ? (
        <main className="flex-1 overflow-y-auto custom-chat-scrollbar p-6 flex flex-col items-center">
          {/* Card Principal Centralizado (Idêntico ao vídeo de referência) */}
          <div
            ref={lienzoRef}
            className="w-full max-w-6xl rounded-3xl bg-[#0f0f13] border border-zinc-800/90 p-7 shadow-2xl relative flex flex-col min-h-[660px]"
          >
            {/* Camada SVG dos Cabos Conectores com Curvas de Bézier Fluidas */}
            <svg className="absolute inset-0 pointer-events-none w-full h-full z-10 overflow-visible">
              <defs>
                <filter id="glow-cable" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="3" result="blur" />
                  <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
              </defs>

              {cablePaths.map(c => {
                if (!c.active) return null
                return (
                  <g key={`cable-${c.id}`}>
                    {/* Cabo de fundo suave com glow */}
                    <path
                      d={c.d}
                      fill="none"
                      stroke="var(--accent,#38bdf8)"
                      strokeWidth="3.5"
                      strokeOpacity="0.4"
                      filter="url(#glow-cable)"
                    />
                    {/* Cabo central com cor pura */}
                    <path
                      d={c.d}
                      fill="none"
                      stroke="var(--accent,#38bdf8)"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                    {/* Pulso de energia viajando no cabo */}
                    <circle r="2.5" fill="#ffffff">
                      <animateMotion dur="2.4s" repeatCount="indefinite" path={c.d} />
                    </circle>
                  </g>
                )
              })}
            </svg>

            {/* Cabeçalho do Canvas: Ajustes • Conexões + Título + Filtros */}
            <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-zinc-800/70 z-20">
              <div className="space-y-1 min-w-0">
                <div className="text-[10px] font-mono tracking-wider text-zinc-500 uppercase">
                  AJUSTES • ESQUADRÃO MULTIAGENTE
                </div>
                <div className="flex items-center gap-3">
                  {/* Ícone customizável */}
                  <div className="relative">
                    <button
                      ref={iconPickerButtonRef}
                      type="button"
                      onClick={() => setIsIconPickerOpen(v => !v)}
                      className="w-8 h-8 rounded-xl bg-zinc-800/90 hover:bg-zinc-700 border border-zinc-700/80 flex items-center justify-center text-zinc-200 transition-colors cursor-pointer shadow-xs"
                      title="Alterar ícone do esquadrão"
                    >
                      {renderDynamicIcon(activeSquad.icon || 'Users', 'w-4 h-4 text-zinc-200')}
                    </button>

                    {isIconPickerOpen && (
                      <IconPickerPopover
                        selectedIcon={activeSquad.icon}
                        onSelectIcon={iconName => {
                          onSaveSquad({
                            ...activeSquad,
                            icon: iconName,
                            updatedAt: Date.now()
                          })
                          setIsIconPickerOpen(false)
                        }}
                        onClose={() => setIsIconPickerOpen(false)}
                        align="left"
                      />
                    )}
                  </div>

                  {/* Nome do Esquadrão */}
                  {isEditingSquadName ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        autoFocus
                        value={squadNameInput}
                        onChange={e => setSquadNameInput(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleSaveSquadName()
                          if (e.key === 'Escape') setIsEditingSquadName(false)
                        }}
                        onBlur={handleSaveSquadName}
                        className="bg-[#18181d] border border-zinc-700 rounded-lg px-2 py-1 text-base font-bold text-zinc-100 focus:outline-none focus:border-[var(--accent)]"
                      />
                      <button
                        type="button"
                        onClick={handleSaveSquadName}
                        className="p-1 rounded bg-[var(--accent)] text-zinc-950 cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 group">
                      <h1
                        onDoubleClick={() => {
                          setSquadNameInput(activeSquad.name)
                          setIsEditingSquadName(true)
                        }}
                        className="text-lg font-bold text-zinc-100 tracking-tight truncate cursor-pointer hover:text-white"
                        title="Duplo clique para renomear"
                      >
                        {activeSquad.name}
                      </h1>
                      <button
                        type="button"
                        onClick={() => {
                          setSquadNameInput(activeSquad.name)
                          setIsEditingSquadName(true)
                        }}
                        className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-zinc-300 p-0.5 transition-opacity cursor-pointer"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>

                <div className="text-xs text-zinc-400 flex items-center gap-2">
                  <span>{currentPipeline.length} especialistas disponíveis</span>
                  <span>•</span>
                  <span className="text-[var(--accent)] font-medium">{activeCount} ativas</span>
                </div>
              </div>

              {/* Filtros em Pílulas e Ações */}
              <div className="flex flex-wrap items-center gap-2.5">
                {/* Campo de Busca */}
                <div className="relative flex items-center">
                  <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 pointer-events-none" />
                  <input
                    type="text"
                    value={agentFilterQuery}
                    onChange={e => setAgentFilterQuery(e.target.value)}
                    placeholder="Buscar especialista..."
                    className="w-48 bg-[#16161a] border border-zinc-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-700"
                  />
                </div>

                {/* Filtros: Todas | Activas | Sin conectar */}
                <div className="flex items-center p-0.5 bg-[#151519] rounded-xl border border-zinc-800 text-xs">
                  <button
                    type="button"
                    onClick={() => setConnectionFilter('all')}
                    className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                      connectionFilter === 'all'
                        ? 'bg-zinc-800 text-zinc-100 shadow-xs'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    Todas <span className="text-[10px] opacity-70 font-mono">{currentPipeline.length}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setConnectionFilter('active')}
                    className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                      connectionFilter === 'active'
                        ? 'bg-zinc-800 text-zinc-100 shadow-xs'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    Activas <span className="text-[10px] opacity-70 font-mono">{activeCount}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setConnectionFilter('inactive')}
                    className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                      connectionFilter === 'inactive'
                        ? 'bg-zinc-800 text-zinc-100 shadow-xs'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    Sin conectar <span className="text-[10px] opacity-70 font-mono">{inactiveCount}</span>
                  </button>
                </div>

                {/* Botão Adicionar Especialista */}
                <button
                  type="button"
                  onClick={() => {
                    const available = agents.filter(a => !currentPipeline.some(p => p.agentId === a.id))
                    setSelectedAgentToAdd(available[0]?.id || agents[0]?.id || '')
                    setNewMemberRole('')
                    setNewMemberPrompt('')
                    setIsAddMemberModalOpen(true)
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-zinc-800 bg-zinc-900/80 hover:bg-zinc-800 text-zinc-200 text-xs font-medium cursor-pointer transition-colors"
                >
                  <Plus className="w-3.5 h-3.5 text-[var(--accent)]" />
                  <span>Especialista</span>
                </button>

                {/* Botão Excluir Esquadrão */}
                {squads.length > 1 && (
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm(`Deseja realmente excluir o esquadrão "${activeSquad.name}"?`)) {
                        onDeleteSquad(activeSquad.id)
                      }
                    }}
                    className="p-2 rounded-xl border border-zinc-800 text-zinc-400 hover:text-rose-400 hover:bg-rose-950/20 transition-colors cursor-pointer"
                    title="Excluir este esquadrão"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}

                {/* Botão Abrir no Chat */}
                <button
                  type="button"
                  onClick={() => onOpenSquadChat(activeSquad)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-800/80 hover:bg-zinc-700/80 text-zinc-300 hover:text-white border border-zinc-700/60 font-medium text-xs transition-colors cursor-pointer"
                >
                  <MessageSquare className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Abrir no Chat</span>
                </button>
              </div>
            </div>

            {/* GRADE CENTRAL: COLUNA ESQUERDA | NÚCLEO CENTRAL | COLUNA DIREITA */}
            <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-6 pt-8 z-20 items-start">
              {/* Coluna Esquerda de Agentes */}
              <div className="space-y-4">
                {leftColumnSteps.map(step => renderAgentCard(step, 'left'))}
                {leftColumnSteps.length === 0 && (
                  <div className="p-6 text-center text-xs text-zinc-600 border border-dashed border-zinc-800/60 rounded-2xl">
                    Nenhum agente neste lado.
                  </div>
                )}
              </div>

              {/* Centro: O NÚCLEO CIRCULAR CENTRAL + CAIXA DE ATIVIDADE */}
              <div className="flex flex-col items-center justify-center space-y-6 pt-4">
                {/* Núcleo Central com Anéis Pulsantes */}
                <div
                  ref={nucleoRef}
                  className="relative w-28 h-28 rounded-full border border-zinc-700/80 bg-[#121217] flex flex-col items-center justify-center shadow-2xl z-30 group select-none"
                >
                  {/* Anel luminoso externo */}
                  <div className="absolute -inset-2 rounded-full border border-[var(--accent)]/30 opacity-70 animate-pulse pointer-events-none" />
                  <div className="absolute -inset-4 rounded-full border border-[var(--accent)]/15 opacity-40 pointer-events-none" />

                  {/* Ícone e Nome do Núcleo */}
                  <div className="w-8 h-8 rounded-xl bg-[var(--accent)]/15 border border-[var(--accent)]/30 flex items-center justify-center text-[var(--accent)] mb-1">
                    {renderDynamicIcon(activeSquad.icon || 'Zap', 'w-4 h-4 text-[var(--accent)]')}
                  </div>
                  <span className="text-[11px] font-semibold text-zinc-100 tracking-tight">Núcleo</span>
                  <span className="text-[10px] text-[var(--accent)] font-mono">
                    {activeCount} activas
                  </span>
                </div>

                {/* Caixa de Atividade (Log Terminal no Estilo Moxen / Empalme) */}
                <div className="w-68 rounded-2xl bg-black/60 border border-zinc-800/80 p-3 shadow-inner space-y-1.5 font-mono text-[10px]">
                  <div className="flex items-center justify-between text-zinc-500 uppercase tracking-wider text-[9px] pb-1 border-b border-zinc-900">
                    <div className="flex items-center gap-1.5">
                      <Activity className="w-3 h-3 text-[var(--accent)]" />
                      <span>ACTIVIDAD</span>
                    </div>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                  </div>
                  <div className="space-y-1">
                    {activityLogs.map(log => (
                      <div key={log.id} className="flex items-center justify-between gap-2 text-zinc-400">
                        <span className="text-zinc-600">{log.time}</span>
                        <span className="truncate text-zinc-300">{log.agentName}</span>
                        <span
                          className={log.success ? 'text-[var(--accent)]' : 'text-zinc-500'}
                        >
                          {log.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Coluna Direita de Agentes */}
              <div className="space-y-4">
                {rightColumnSteps.map(step => renderAgentCard(step, 'right'))}
                {rightColumnSteps.length === 0 && (
                  <div className="p-6 text-center text-xs text-zinc-600 border border-dashed border-zinc-800/60 rounded-2xl">
                    Nenhum agente neste lado.
                  </div>
                )}
              </div>
            </div>
          </div>
        </main>
      ) : (
        <div className="flex-1 flex items-center justify-center text-zinc-500 text-xs">
          Selecione ou crie um esquadrão para gerenciar.
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL: NOVO ESQUADRÃO                                               */}
      {/* ==================================================================== */}
      {isNewSquadModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#141417] border border-zinc-800 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-[var(--accent)]" />
                <h3 className="font-semibold text-sm text-zinc-100">Criar Novo Esquadrão</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsNewSquadModalOpen(false)}
                className="text-zinc-500 hover:text-zinc-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="text-zinc-300 font-medium">Nome do Esquadrão</label>
                <input
                  type="text"
                  value={newSquadName}
                  onChange={e => setNewSquadName(e.target.value)}
                  placeholder="Ex: Esquadrão Criação Web & Landing Pages"
                  className="w-full bg-[#1b1b20] border border-zinc-800 rounded-xl px-3 py-2 text-zinc-100 focus:outline-none focus:border-[var(--accent)]"
                />
              </div>

              <div className="space-y-1">
                <label className="text-zinc-300 font-medium">Objetivo / Missão do Esquadrão</label>
                <textarea
                  value={newSquadObjective}
                  onChange={e => setNewSquadObjective(e.target.value)}
                  placeholder="Ex: Criar páginas web completas com código HTML responsivo, copy persuasiva e tarefas de publicação."
                  rows={2}
                  className="w-full bg-[#1b1b20] border border-zinc-800 rounded-xl px-3 py-2 text-zinc-100 focus:outline-none focus:border-[var(--accent)] resize-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-zinc-300 font-medium">Líder Inicial</label>
                <select
                  value={newSquadLeadAgentId}
                  onChange={e => setNewSquadLeadAgentId(e.target.value)}
                  className="w-full bg-[#1b1b20] border border-zinc-800 rounded-xl px-3 py-2 text-zinc-100 focus:outline-none cursor-pointer"
                >
                  {agents.map(ag => (
                    <option key={ag.id} value={ag.id}>
                      {ag.name} ({ag.roleDescription || ag.specialistRole})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => setIsNewSquadModalOpen(false)}
                className="px-3.5 py-1.5 rounded-xl text-zinc-400 hover:text-zinc-200 text-xs cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={!newSquadName.trim()}
                onClick={handleCreateSquad}
                className="px-4 py-1.5 rounded-xl bg-[var(--accent)] hover:brightness-110 disabled:opacity-40 text-zinc-950 font-semibold text-xs cursor-pointer shadow-sm transition-all"
              >
                Criar Esquadrão
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL: ADICIONAR ESPECIALISTA AO ESQUADRÃO                           */}
      {/* ==================================================================== */}
      {isAddMemberModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#141417] border border-zinc-800 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Plus className="w-4 h-4 text-[var(--accent)]" />
                <h3 className="font-semibold text-sm text-zinc-100">Adicionar Especialista à Esteira</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAddMemberModalOpen(false)}
                className="text-zinc-500 hover:text-zinc-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="text-zinc-300 font-medium">Selecione o Agente</label>
                <select
                  value={selectedAgentToAdd}
                  onChange={e => setSelectedAgentToAdd(e.target.value)}
                  className="w-full bg-[#1b1b20] border border-zinc-800 rounded-xl px-3 py-2 text-zinc-100 focus:outline-none cursor-pointer"
                >
                  {agents.map(ag => (
                    <option key={ag.id} value={ag.id}>
                      {ag.name} ({ag.roleDescription || ag.specialistRole})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-zinc-300 font-medium">Função específica neste Esquadrão</label>
                <input
                  type="text"
                  value={newMemberRole}
                  onChange={e => setNewMemberRole(e.target.value)}
                  placeholder="Ex: Gerar código HTML e componentes interativos"
                  className="w-full bg-[#1b1b20] border border-zinc-800 rounded-xl px-3 py-2 text-zinc-100 focus:outline-none focus:border-[var(--accent)]"
                />
              </div>

              <div className="space-y-1">
                <label className="text-zinc-300 font-medium">Prompt de Orientação (Opcional)</label>
                <textarea
                  rows={2}
                  value={newMemberPrompt}
                  onChange={e => setNewMemberPrompt(e.target.value)}
                  placeholder="Instruções específicas para a IA nesta etapa..."
                  className="w-full bg-[#1b1b20] border border-zinc-800 rounded-xl px-3 py-2 text-zinc-100 focus:outline-none focus:border-[var(--accent)] resize-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-zinc-300 font-medium">Entrega esperada</label>
                <div className="grid grid-cols-2 gap-2 pt-1">
                  {(Object.keys(OUTPUT_TYPE_CONFIG) as Array<keyof typeof OUTPUT_TYPE_CONFIG>).map(k => {
                    const meta = OUTPUT_TYPE_CONFIG[k]
                    const Icon = meta.icon
                    const isSel = newMemberOutput === k
                    return (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setNewMemberOutput(k as any)}
                        className={`flex items-center gap-2 p-2 rounded-xl border text-left cursor-pointer transition-colors ${
                          isSel
                            ? 'bg-[var(--accent)]/15 border-[var(--accent)]/40 text-zinc-100 font-semibold'
                            : 'bg-[#1b1b20] border-zinc-800 text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5" style={{ color: meta.color }} />
                        <span className="font-medium text-[11px]">{meta.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => setIsAddMemberModalOpen(false)}
                className="px-3.5 py-1.5 rounded-xl text-zinc-400 hover:text-zinc-200 text-xs cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={!selectedAgentToAdd}
                onClick={handleAddMember}
                className="px-4 py-1.5 rounded-xl bg-[var(--accent)] hover:brightness-110 disabled:opacity-40 text-zinc-950 font-semibold text-xs cursor-pointer shadow-sm transition-all"
              >
                Adicionar ao Esquadrão
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
