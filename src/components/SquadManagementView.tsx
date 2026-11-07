import React, { useState, useRef, useEffect } from 'react'
import type { AgentProfileVersion, TeamDefinition, SquadPipelineStep } from '../types/agents'
import {
  Users,
  Sparkles,
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
  Sliders
} from 'lucide-react'
import { AgentIcon } from './AgentIcon'
import { renderDynamicIcon, IconPickerPopover } from './IconPickerPopover'

const SQUAD_AGENT_COLORS = ['#10b981', '#2563eb', '#8b5cf6', '#f59e0b', '#ec4899', '#06b6d4']

function getAgentColor(agentId?: string): string {
  if (!agentId) return '#10b981'
  let hash = 0
  for (let i = 0; i < agentId.length; i++) {
    hash = (hash * 31 + agentId.charCodeAt(i)) >>> 0
  }
  return SQUAD_AGENT_COLORS[hash % SQUAD_AGENT_COLORS.length]
}

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
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null)
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

  const filteredSquads = squads.filter(
    s =>
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.objective || '').toLowerCase().includes(searchQuery.toLowerCase())
  )

  // Obter pipeline do esquadrão ativo ou gerar a partir dos nós existentes
  const getSquadPipeline = (squad: TeamDefinition): SquadPipelineStep[] => {
    if (squad.pipeline && squad.pipeline.length > 0) {
      return squad.pipeline
    }
    // Fallback retrocompatível: derivar dos nós
    return squad.nodes.map((n, idx) => ({
      id: `step_${n.agentId}_${idx}`,
      agentId: n.agentId,
      roleInSquad: n.roleInTeam === 'coordinator' ? 'Coordenador & Líder' : `Especialista ${idx + 1}`,
      order: idx + 1,
      expectedOutput: (n.allowedOutputTypes?.[0] as any) || 'text'
    }))
  }

  const currentPipeline = activeSquad ? getSquadPipeline(activeSquad) : []

  // Se o step selecionado não existir no pipeline atual, selecionar o primeiro ou nulo
  useEffect(() => {
    if (currentPipeline.length > 0 && selectedStepId) {
      const exists = currentPipeline.some(s => s.id === selectedStepId)
      if (!exists) setSelectedStepId(currentPipeline[0].id)
    }
  }, [activeSquad?.id, currentPipeline, selectedStepId])

  const selectedStep = currentPipeline.find(s => s.id === selectedStepId) || null
  const selectedStepIndex = currentPipeline.findIndex(s => s.id === selectedStepId)

  const handleCreateSquad = () => {
    if (!newSquadName.trim()) return
    const leadId = newSquadLeadAgentId || agents[0]?.id || 'agent-partner'
    const newSquad: TeamDefinition = {
      id: `squad-${Date.now()}`,
      version: 1,
      name: newSquadName.trim(),
      description: 'Esquadrão especializado para entregas coordenadas.',
      objective: newSquadObjective.trim() || 'Executar demandas complexas com múltiplos especialistas no chat.',
      coordinatorAgentId: leadId,
      maxParallelSubtasks: 5,
      icon: newSquadIcon || 'Users',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      pipeline: [
        {
          id: `step_${leadId}_1`,
          agentId: leadId,
          roleInSquad: '1. Líder & Estrategista',
          order: 1,
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

  const handleMoveStep = (stepIndex: number, direction: 'up' | 'down') => {
    if (!activeSquad) return
    const pipeline = [...currentPipeline]
    const targetIndex = direction === 'up' ? stepIndex - 1 : stepIndex + 1
    if (targetIndex < 0 || targetIndex >= pipeline.length) return

    const temp = pipeline[stepIndex]
    pipeline[stepIndex] = pipeline[targetIndex]
    pipeline[targetIndex] = temp

    // Reindexar ordem
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
    if (selectedStepId === stepId) {
      setSelectedStepId(updated[0]?.id || null)
    }
  }

  const handleAddMember = () => {
    if (!activeSquad || !selectedAgentToAdd) return
    const targetAgent = agents.find(a => a.id === selectedAgentToAdd)
    const newStep: SquadPipelineStep = {
      id: `step_${selectedAgentToAdd}_${Date.now()}`,
      agentId: selectedAgentToAdd,
      roleInSquad: newMemberRole.trim() || `${currentPipeline.length + 1}. ${targetAgent?.name || 'Especialista'}`,
      order: currentPipeline.length + 1,
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
    setSelectedStepId(newStep.id)
  }

  const handleUpdateStep = (stepId: string, partial: Partial<SquadPipelineStep>) => {
    if (!activeSquad) return
    const updated = currentPipeline.map(s => (s.id === stepId ? { ...s, ...partial } : s))
    onSaveSquad({
      ...activeSquad,
      pipeline: updated,
      coordinatorAgentId: updated[0]?.agentId || activeSquad.coordinatorAgentId,
      updatedAt: Date.now()
    })
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

  return (
    <div className="flex-1 flex overflow-hidden bg-[#0c0c0e]">
      {/* ==================================================================== */}
      {/* COLUNA ESQUERDA: LISTA DE ESQUADRÕES                                 */}
      {/* ==================================================================== */}
      <aside className="w-80 shrink-0 h-full bg-[#101012] border-r border-zinc-800/80 flex flex-col">
        {/* Cabeçalho */}
        <div className="h-13 px-4 border-b border-zinc-800/80 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-[var(--accent)]/15 border border-[var(--accent)]/30 flex items-center justify-center text-[var(--accent)]">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-semibold text-zinc-100">Esquadrões</div>
              <div className="text-[10px] text-zinc-500">{squads.length} equipes ativas</div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setNewSquadLeadAgentId(agents[0]?.id || '')
              setNewSquadIcon('Users')
              setIsNewSquadModalOpen(true)
            }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[var(--accent)] hover:brightness-110 text-zinc-950 font-semibold text-xs transition-all cursor-pointer shadow-sm active:scale-95"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Novo</span>
          </button>
        </div>

        {/* Campo de Busca */}
        <div className="p-3 border-b border-zinc-800/60">
          <div className="relative flex items-center">
            <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Buscar esquadrão..."
              className="w-full bg-[#161619] border border-zinc-800/80 rounded-xl pl-8 pr-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-700"
            />
          </div>
        </div>

        {/* Lista de Cards */}
        <div className="flex-1 overflow-y-auto custom-chat-scrollbar p-2.5 space-y-1.5">
          {filteredSquads.map(sq => {
            const isSelected = sq.id === activeSquad?.id
            const pipeline = getSquadPipeline(sq)
            return (
              <button
                key={sq.id}
                type="button"
                onClick={() => {
                  onSelectSquad(sq.id)
                  setSelectedStepId(pipeline[0]?.id || null)
                }}
                className={`w-full text-left p-3 rounded-xl border transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-[#18181c] border-[var(--accent)]/40 ring-1 ring-[var(--accent)]/20 shadow-sm'
                    : 'bg-[#131316] border-zinc-800/60 hover:bg-[#161619] hover:border-zinc-700/60'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-6 h-6 rounded-lg bg-zinc-800/90 border border-zinc-700/60 flex items-center justify-center text-zinc-300 shrink-0">
                      {renderDynamicIcon(sq.icon || 'Users', 'w-3.5 h-3.5 text-zinc-300')}
                    </div>
                    <div className="font-semibold text-xs text-zinc-100 truncate">{sq.name}</div>
                  </div>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-zinc-800 text-zinc-400 font-mono shrink-0">
                    {pipeline.length} especialistas
                  </span>
                </div>
                {sq.objective && (
                  <p className="text-[11px] text-zinc-400 mt-1.5 line-clamp-2 leading-relaxed">
                    {sq.objective}
                  </p>
                )}
                <div className="flex items-center gap-1.5 mt-2.5 pt-2 border-t border-zinc-800/50">
                  <div className="flex -space-x-1.5 overflow-hidden">
                    {pipeline.slice(0, 4).map((p, idx) => {
                      const ag = agents.find(a => a.id === p.agentId)
                      return (
                        <div
                          key={p.id || idx}
                          className="w-5 h-5 rounded-md flex items-center justify-center text-[9px] text-white font-bold border border-[#131316] shrink-0"
                          style={{ backgroundColor: getAgentColor(ag?.id) }}
                          title={ag?.name}
                        >
                          {ag?.name?.[0] || '•'}
                        </div>
                      )
                    })}
                  </div>
                  <span className="text-[10.5px] text-zinc-500 ml-auto truncate max-w-[150px]">
                    Líder: {agents.find(a => a.id === sq.coordinatorAgentId)?.name || 'Principal'}
                  </span>
                </div>
              </button>
            )
          })}
        </div>
      </aside>

      {/* ==================================================================== */}
      {/* PAINEL CENTRAL & DIREITO: ESTEIRA VISUAL + PAINEL DE DETALHES         */}
      {/* ==================================================================== */}
      {activeSquad ? (
        <div className="flex-1 flex overflow-hidden">
          {/* Main: Cabeçalho Minimalista + Esteira Inspirada no Print */}
          <main className="flex-1 flex flex-col h-full overflow-y-auto custom-chat-scrollbar">
            {/* Topo do Esquadrão: Minimalista, limpo e direto */}
            <div className="h-14 px-6 border-b border-zinc-800/80 bg-[#101013] flex items-center justify-between shrink-0">
              {/* Esquerda: Ícone customizável + Nome do Esquadrão */}
              <div className="flex items-center gap-3 min-w-0">
                <div className="relative">
                  <button
                    ref={iconPickerButtonRef}
                    type="button"
                    onClick={() => setIsIconPickerOpen(v => !v)}
                    className="w-8 h-8 rounded-xl bg-zinc-800/90 hover:bg-zinc-700/80 border border-zinc-700/70 flex items-center justify-center text-zinc-200 transition-colors cursor-pointer shadow-xs"
                    title="Alterar ícone do esquadrão"
                  >
                    {renderDynamicIcon(activeSquad.icon || 'Users', 'w-4 h-4 text-zinc-200')}
                  </button>

                  {/* Popover de Seleção de Ícone */}
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

                {/* Nome do Esquadrão (com edição inline) */}
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
                      className="bg-[#18181c] border border-zinc-700 rounded-lg px-2 py-1 text-sm font-semibold text-zinc-100 focus:outline-none focus:border-[var(--accent)]"
                    />
                    <button
                      type="button"
                      onClick={handleSaveSquadName}
                      className="p-1 rounded bg-[var(--accent)] text-zinc-950 cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsEditingSquadName(false)}
                      className="p-1 rounded bg-zinc-800 text-zinc-400 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 group">
                    <h1
                      onDoubleClick={() => {
                        setSquadNameInput(activeSquad.name)
                        setIsEditingSquadName(true)
                      }}
                      className="text-sm font-semibold text-zinc-100 tracking-tight truncate cursor-pointer hover:text-white"
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
                      title="Renomear esquadrão"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>

              {/* Direita: Ações discretas (Abrir no Chat estilo container neutro + Excluir) */}
              <div className="flex items-center gap-2">
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

                {/* Botão Abrir no Chat: Cores de contêiner discreto, sem roubar a cena */}
                <button
                  type="button"
                  onClick={() => onOpenSquadChat(activeSquad)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-zinc-800/80 hover:bg-zinc-700/80 text-zinc-300 hover:text-white border border-zinc-700/60 font-medium text-xs transition-colors cursor-pointer shadow-xs active:scale-95"
                >
                  <MessageSquare className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Abrir no Chat</span>
                </button>
              </div>
            </div>

            {/* Conteúdo da Esteira (Pipeline) */}
            <div className="p-6 space-y-6 max-w-3xl">
              {/* Box explicativo sutil com cor de destaque do tema */}
              <div className="p-3.5 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 flex items-start gap-3">
                <div className="w-7 h-7 rounded-lg bg-[var(--accent)]/15 border border-[var(--accent)]/30 flex items-center justify-center text-[var(--accent)] shrink-0 mt-0.5">
                  <Sparkles className="w-3.5 h-3.5" />
                </div>
                <div className="space-y-0.5">
                  <div className="text-xs font-semibold text-zinc-200">Esteira Colaborativa em Ação</div>
                  <p className="text-[11.5px] text-zinc-400 leading-relaxed">
                    No chat, sua mensagem é processada sequencialmente pelos especialistas na ordem abaixo.
                    Cada agente executa seu papel orientativo, gerando código HTML interativo, notas ou tarefas de ponta a ponta.
                  </p>
                </div>
              </div>

              {/* Cabeçalho da Esteira */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h2 className="text-xs font-semibold text-zinc-200 uppercase tracking-wider font-mono">
                    Esteira de Execução
                  </h2>
                  <span className="text-xs text-zinc-500 font-mono">({currentPipeline.length} etapas)</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const available = agents.filter(a => !currentPipeline.some(p => p.agentId === a.id))
                    setSelectedAgentToAdd(available[0]?.id || agents[0]?.id || '')
                    setNewMemberRole('')
                    setNewMemberPrompt('')
                    setIsAddMemberModalOpen(true)
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-800 hover:bg-zinc-800/70 text-zinc-300 font-medium text-xs transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5 text-[var(--accent)]" />
                  <span>Adicionar Especialista</span>
                </button>
              </div>

              {/* Lista Vertical de Cards Estilo Print */}
              <div className="space-y-0">
                {currentPipeline.map((step, idx) => {
                  const ag = agents.find(a => a.id === step.agentId)
                  const outMeta = OUTPUT_TYPE_CONFIG[step.expectedOutput || 'text'] || OUTPUT_TYPE_CONFIG.text
                  const OutIcon = outMeta.icon
                  const isSelected = selectedStepId === step.id

                  return (
                    <div key={step.id} className="relative">
                      {/* Card da Etapa */}
                      <div
                        onClick={() => setSelectedStepId(step.id)}
                        className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-[#16161a] border-[var(--accent)]/50 ring-1 ring-[var(--accent)]/20 shadow-md'
                            : 'bg-[#121215] border-zinc-800/80 hover:bg-[#151518] hover:border-zinc-700/80'
                        }`}
                      >
                        {/* Header superior do Card: ETAPA X à esquerda; TIPO DE SAÍDA à direita */}
                        <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-zinc-800/60">
                          <span className="text-[10px] font-mono uppercase tracking-wider font-semibold text-zinc-500">
                            ETAPA {step.order}
                          </span>
                          <span
                            className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md font-semibold uppercase tracking-wider border"
                            style={{
                              color: outMeta.color,
                              backgroundColor: `${outMeta.color}15`,
                              borderColor: `${outMeta.color}30`
                            }}
                          >
                            <OutIcon className="w-3 h-3" />
                            <span>{outMeta.badge}</span>
                          </span>
                        </div>

                        {/* Corpo do Card: Ícone do Agente + Nome + Função */}
                        <div className="flex items-start gap-3">
                          <AgentIcon
                            variant={ag?.icon}
                            state={ag?.state === 'working' ? 'executing' : 'waiting'}
                            size={36}
                            className="shrink-0 rounded-xl"
                          />

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-semibold text-xs text-zinc-100 truncate">
                                {ag?.name || 'Agente'}
                              </span>
                              <span className="text-[11px] text-zinc-500 shrink-0">
                                {idx === 0 ? 'Líder da Esteira' : `Passo ${idx + 1}`}
                              </span>
                            </div>

                            <div className="text-xs text-zinc-300 font-medium truncate mt-0.5">
                              {step.roleInSquad}
                            </div>

                            {/* Prompt orientador prévia */}
                            {step.customPrompt ? (
                              <div className="mt-2 text-[11px] text-zinc-400 bg-black/25 px-2.5 py-1.5 rounded-lg border border-zinc-800/60 line-clamp-2 italic">
                                &ldquo;{step.customPrompt}&rdquo;
                              </div>
                            ) : (
                              <div className="mt-1.5 text-[10.5px] text-zinc-500 hover:text-[var(--accent)] transition-colors flex items-center gap-1">
                                <Plus className="w-3 h-3" />
                                <span>Adicionar orientações de prompt para a IA...</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Conector Vertical Fino entre os Cards (estilo o print) */}
                      {idx < currentPipeline.length - 1 && (
                        <div className="flex flex-col items-center py-1">
                          <div className="w-px h-5 bg-zinc-800" />
                          <div className="w-2 h-2 rounded-full border border-zinc-700 bg-zinc-900" />
                          <div className="w-px h-5 bg-zinc-800" />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </main>

          {/* ==================================================================== */}
          {/* PAINEL LATERAL DIREITO: DETALHES DA ETAPA SELECIONADA (DETAILS)      */}
          {/* ==================================================================== */}
          {selectedStep && (
            <aside className="w-84 shrink-0 h-full bg-[#101013] border-l border-zinc-800/80 flex flex-col animate-in slide-in-from-right-4 duration-200">
              {/* Topo do Painel de Detalhes */}
              <div className="h-14 px-4 border-b border-zinc-800/80 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-[var(--accent)]" />
                  <span className="font-semibold text-xs text-zinc-100">
                    Detalhes da Etapa {selectedStepIndex + 1}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedStepId(null)}
                  className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/60 cursor-pointer"
                  title="Fechar detalhes"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Corpo de Configurações */}
              <div className="flex-1 overflow-y-auto custom-chat-scrollbar p-4 space-y-4 text-xs">
                {/* 1. Agente Responsável */}
                <div className="space-y-1.5">
                  <label className="text-zinc-300 font-medium flex items-center justify-between">
                    <span>Agente Especialista</span>
                    <span className="text-[10px] text-zinc-500 font-mono">Etapa {selectedStep.order}</span>
                  </label>
                  <select
                    value={selectedStep.agentId}
                    onChange={e => handleUpdateStep(selectedStep.id, { agentId: e.target.value })}
                    className="w-full bg-[#161619] border border-zinc-800 rounded-xl px-3 py-2 text-zinc-100 focus:outline-none focus:border-zinc-700 cursor-pointer"
                  >
                    {agents.map(ag => (
                      <option key={ag.id} value={ag.id}>
                        {ag.name} ({ag.roleDescription || ag.specialistRole})
                      </option>
                    ))}
                  </select>
                </div>

                {/* 2. Papel / Função no Esquadrão */}
                <div className="space-y-1.5">
                  <label className="text-zinc-300 font-medium">Função nesta Etapa</label>
                  <input
                    type="text"
                    value={selectedStep.roleInSquad}
                    onChange={e => handleUpdateStep(selectedStep.id, { roleInSquad: e.target.value })}
                    placeholder="Ex: Copywriter e Arquitetura de Vendas"
                    className="w-full bg-[#161619] border border-zinc-800 rounded-xl px-3 py-2 text-zinc-100 focus:outline-none focus:border-zinc-700"
                  />
                </div>

                {/* 3. Prompt de Orientação Específico para a IA (NOVO RECURSO) */}
                <div className="space-y-1.5">
                  <label className="text-zinc-300 font-medium flex items-center justify-between">
                    <span>Prompt de Orientação (IA)</span>
                    <Sparkles className="w-3 h-3 text-[var(--accent)]" />
                  </label>
                  <textarea
                    rows={4}
                    value={selectedStep.customPrompt || ''}
                    onChange={e => handleUpdateStep(selectedStep.id, { customPrompt: e.target.value })}
                    placeholder="Ex: Crie o código HTML responsivo completo com tags semânticas, classes Tailwind CSS modernas, modo escuro e interações limpas..."
                    className="w-full bg-[#161619] border border-zinc-800 rounded-xl px-3 py-2 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-700 resize-none leading-relaxed text-[11.5px]"
                  />
                  <p className="text-[10px] text-zinc-500 leading-relaxed">
                    Orientações adicionais que direcionam o comportamento do modelo LLM nesta etapa específica da esteira.
                  </p>
                </div>

                {/* 4. Tipo de Entrega Esperada */}
                <div className="space-y-1.5">
                  <label className="text-zinc-300 font-medium">Tipo de Entrega</label>
                  <div className="grid grid-cols-2 gap-2 pt-0.5">
                    {(Object.keys(OUTPUT_TYPE_CONFIG) as Array<keyof typeof OUTPUT_TYPE_CONFIG>).map(k => {
                      const meta = OUTPUT_TYPE_CONFIG[k]
                      const Icon = meta.icon
                      const isSel = (selectedStep.expectedOutput || 'text') === k
                      return (
                        <button
                          key={k}
                          type="button"
                          onClick={() => handleUpdateStep(selectedStep.id, { expectedOutput: k as any })}
                          className={`flex items-center gap-2 p-2.5 rounded-xl border text-left cursor-pointer transition-all ${
                            isSel
                              ? 'bg-[var(--accent)]/15 border-[var(--accent)]/40 text-zinc-100 font-medium shadow-xs'
                              : 'bg-[#161619] border-zinc-800/80 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700/80'
                          }`}
                        >
                          <Icon className="w-3.5 h-3.5 shrink-0" style={{ color: meta.color }} />
                          <div className="min-w-0">
                            <div className="text-[11px] font-semibold truncate">{meta.label}</div>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* 5. Ações da Etapa: Subir, Descer e Excluir */}
                <div className="pt-3 border-t border-zinc-800/70 space-y-2">
                  <label className="text-zinc-400 text-[11px] font-medium">Ordem e Gestão</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={selectedStepIndex === 0}
                      onClick={() => handleMoveStep(selectedStepIndex, 'up')}
                      className="flex items-center justify-center gap-1.5 p-2 rounded-xl border border-zinc-800 text-zinc-300 hover:bg-zinc-800 disabled:opacity-30 cursor-pointer"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                      <span>Subir Etapa</span>
                    </button>
                    <button
                      type="button"
                      disabled={selectedStepIndex === currentPipeline.length - 1}
                      onClick={() => handleMoveStep(selectedStepIndex, 'down')}
                      className="flex items-center justify-center gap-1.5 p-2 rounded-xl border border-zinc-800 text-zinc-300 hover:bg-zinc-800 disabled:opacity-30 cursor-pointer"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                      <span>Descer Etapa</span>
                    </button>
                  </div>

                  {currentPipeline.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveStep(selectedStep.id)}
                      className="w-full flex items-center justify-center gap-1.5 p-2 rounded-xl border border-zinc-800 text-rose-400 hover:bg-rose-950/20 hover:border-rose-800/40 cursor-pointer transition-colors mt-2"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Remover esta Etapa</span>
                    </button>
                  )}
                </div>
              </div>
            </aside>
          )}
        </div>
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
                Adicionar à Esteira
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
