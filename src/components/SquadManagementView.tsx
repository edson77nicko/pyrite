import React, { useState } from 'react'
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
  ChevronRight,
  Search,
  Check,
  X,
  Pencil
} from 'lucide-react'
import { AgentIcon } from './AgentIcon'

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

const OUTPUT_TYPE_CONFIG: Record<string, { label: string; icon: any; color: string }> = {
  html: { label: 'Interface HTML', icon: Code, color: '#38bdf8' },
  note: { label: 'Nota no Cofre', icon: FileText, color: '#34d399' },
  tasks: { label: 'Tarefas no Quadro', icon: ListTodo, color: '#fbbf24' },
  text: { label: 'Texto / Análise', icon: MessageSquare, color: '#a78bfa' }
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
  const [isNewSquadModalOpen, setIsNewSquadModalOpen] = useState(false)
  const [isAddMemberModalOpen, setIsAddMemberModalOpen] = useState(false)
  const [editingRoleStepId, setEditingRoleStepId] = useState<string | null>(null)
  const [roleInput, setRoleInput] = useState('')

  // Formulário de novo esquadrão
  const [newSquadName, setNewSquadName] = useState('')
  const [newSquadObjective, setNewSquadObjective] = useState('')
  const [newSquadDescription, setNewSquadDescription] = useState('')
  const [newSquadLeadAgentId, setNewSquadLeadAgentId] = useState('')

  // Formulário de adicionar membro
  const [selectedAgentToAdd, setSelectedAgentToAdd] = useState('')
  const [newMemberRole, setNewMemberRole] = useState('')
  const [newMemberOutput, setNewMemberOutput] = useState<'html' | 'note' | 'tasks' | 'text'>('text')

  const filteredSquads = squads.filter(s =>
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

  const handleCreateSquad = () => {
    if (!newSquadName.trim()) return
    const leadId = newSquadLeadAgentId || agents[0]?.id || 'agent-partner'
    const newSquad: TeamDefinition = {
      id: `squad-${Date.now()}`,
      version: 1,
      name: newSquadName.trim(),
      description: newSquadDescription.trim() || 'Esquadrão especializado para entregas coordenadas.',
      objective: newSquadObjective.trim() || 'Executar demandas complexas com múltiplos especialistas no chat.',
      coordinatorAgentId: leadId,
      maxParallelSubtasks: 5,
      color: '#3b82f6',
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
    setNewSquadDescription('')
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
  }

  const handleAddMember = () => {
    if (!activeSquad || !selectedAgentToAdd) return
    const targetAgent = agents.find(a => a.id === selectedAgentToAdd)
    const newStep: SquadPipelineStep = {
      id: `step_${selectedAgentToAdd}_${Date.now()}`,
      agentId: selectedAgentToAdd,
      roleInSquad: newMemberRole.trim() || `${currentPipeline.length + 1}. ${targetAgent?.name || 'Especialista'}`,
      order: currentPipeline.length + 1,
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
  }

  const handleSaveStepRole = (stepId: string) => {
    if (!activeSquad || !roleInput.trim()) return
    const updated = currentPipeline.map(s => (s.id === stepId ? { ...s, roleInSquad: roleInput.trim() } : s))
    onSaveSquad({
      ...activeSquad,
      pipeline: updated,
      updatedAt: Date.now()
    })
    setEditingRoleStepId(null)
    setRoleInput('')
  }

  return (
    <div className="flex-1 flex overflow-hidden bg-[#0c0c0e]">
      {/* ==================================================================== */}
      {/* COLUNA ESQUERDA: LISTA DE ESQUADRÕES                                 */}
      {/* ==================================================================== */}
      <aside className="w-80 shrink-0 h-full bg-[#101012] border-r border-zinc-800/80 flex flex-col">
        {/* Cabeçalho */}
        <div className="h-13 px-4 border-b border-zinc-800/80 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
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
              setIsNewSquadModalOpen(true)
            }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs transition-colors cursor-pointer shadow-sm"
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
                onClick={() => onSelectSquad(sq.id)}
                className={`w-full text-left p-3 rounded-xl border transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-[#18181c] border-blue-500/40 shadow-sm'
                    : 'bg-[#131316] border-zinc-800/60 hover:bg-[#161619] hover:border-zinc-700/60'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="font-semibold text-xs text-zinc-100 truncate">{sq.name}</div>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-zinc-800 text-zinc-400 font-mono shrink-0">
                    {pipeline.length} agentes
                  </span>
                </div>
                {sq.objective && (
                  <p className="text-[11px] text-zinc-400 mt-1 line-clamp-2 leading-relaxed">
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
                  <span className="text-[10.5px] text-zinc-500 ml-auto">
                    Líder: {agents.find(a => a.id === sq.coordinatorAgentId)?.name || 'Principal'}
                  </span>
                </div>
              </button>
            )
          })}
        </div>
      </aside>

      {/* ==================================================================== */}
      {/* PAINEL CENTRAL: GESTÃO DETALHADA DO ESQUADRÃO SELECIONADO            */}
      {/* ==================================================================== */}
      {activeSquad ? (
        <main className="flex-1 flex flex-col h-full overflow-y-auto custom-chat-scrollbar">
          {/* Topo do Esquadrão */}
          <div className="px-8 py-6 border-b border-zinc-800/80 bg-[#101013] flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1.5 max-w-2xl">
              <div className="flex items-center gap-2.5">
                <h1 className="text-xl font-bold text-zinc-100 tracking-tight">{activeSquad.name}</h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-500/10 border border-blue-500/20 text-blue-400">
                  Esquadrão Ativo
                </span>
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed">
                {activeSquad.objective || activeSquad.description}
              </p>
            </div>

            {/* Ações principais */}
            <div className="flex items-center gap-2.5">
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
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
              <button
                type="button"
                onClick={() => onOpenSquadChat(activeSquad)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs transition-all shadow-md active:scale-95 cursor-pointer"
              >
                <MessageSquare className="w-4 h-4" />
                <span>Acionar Esquadrão no Chat</span>
                <Sparkles className="w-3.5 h-3.5 text-blue-200" />
              </button>
            </div>
          </div>

          {/* Conteúdo da Esteira (Pipeline) */}
          <div className="px-8 py-6 space-y-6 max-w-4xl">
            {/* Box explicativo */}
            <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 flex items-start gap-3.5">
              <div className="w-8 h-8 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 shrink-0 mt-0.5">
                <Sparkles className="w-4 h-4" />
              </div>
              <div className="space-y-1">
                <div className="text-xs font-semibold text-zinc-200">Como funciona a esteira do esquadrão</div>
                <p className="text-[11.5px] text-zinc-400 leading-relaxed">
                  Quando você aciona o esquadrão pelo chat, a sua solicitação é processada em cadeia pelos especialistas na ordem abaixo.
                  Cada agente adiciona a sua competência (redigir copy, construir a interface HTML responsiva, auditar regras ou criar tarefas no quadro),
                  entregando um resultado completo de ponta a ponta.
                </p>
              </div>
            </div>

            {/* Cabeçalho da Esteira */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-zinc-200">Esteira de Execução</h2>
                <span className="text-xs text-zinc-500 font-mono">({currentPipeline.length} etapas)</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  const available = agents.filter(a => !currentPipeline.some(p => p.agentId === a.id))
                  setSelectedAgentToAdd(available[0]?.id || agents[0]?.id || '')
                  setNewMemberRole('')
                  setIsAddMemberModalOpen(true)
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-800 hover:bg-zinc-800/70 text-zinc-300 font-medium text-xs transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 text-blue-400" />
                <span>Adicionar Especialista</span>
              </button>
            </div>

            {/* Lista da Pipeline com cartões e setas conectores */}
            <div className="space-y-3">
              {currentPipeline.map((step, idx) => {
                const ag = agents.find(a => a.id === step.agentId)
                const outMeta = OUTPUT_TYPE_CONFIG[step.expectedOutput || 'text'] || OUTPUT_TYPE_CONFIG.text
                const OutIcon = outMeta.icon
                const isEditingRole = editingRoleStepId === step.id

                return (
                  <div key={step.id} className="relative">
                    <div className="p-4 rounded-2xl bg-[#141417] border border-zinc-800/90 shadow-sm flex items-center justify-between gap-4">
                      {/* Lado Esquerdo: Ordem + Avatar + Dados */}
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div className="w-6 h-6 rounded-full bg-zinc-800 text-zinc-300 text-xs font-bold flex items-center justify-center shrink-0">
                          {idx + 1}
                        </div>

                        {/* Avatar do Agente */}
                        <AgentIcon
                          variant={ag?.icon}
                          state={ag?.state === 'working' ? 'executing' : 'waiting'}
                        />

                        <div className="min-w-0 space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-xs text-zinc-100">{ag?.name || 'Agente'}</span>
                            <span
                              className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md font-medium border"
                              style={{
                                color: outMeta.color,
                                backgroundColor: `${outMeta.color}15`,
                                borderColor: `${outMeta.color}30`
                              }}
                            >
                              <OutIcon className="w-3 h-3" />
                              <span>{outMeta.label}</span>
                            </span>
                          </div>

                          {/* Papel do Agente no Esquadrão */}
                          {isEditingRole ? (
                            <div className="flex items-center gap-1.5 pt-1">
                              <input
                                type="text"
                                value={roleInput}
                                onChange={e => setRoleInput(e.target.value)}
                                className="bg-[#1b1b20] border border-zinc-700 rounded-lg px-2 py-1 text-xs text-zinc-100 focus:outline-none"
                                placeholder="Defina a função específica..."
                              />
                              <button
                                type="button"
                                onClick={() => handleSaveStepRole(step.id)}
                                className="p-1 rounded bg-blue-600 text-white cursor-pointer"
                              >
                                <Check className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingRoleStepId(null)}
                                className="p-1 rounded bg-zinc-800 text-zinc-400 cursor-pointer"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 group">
                              <p className="text-xs text-zinc-400 truncate">{step.roleInSquad}</p>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingRoleStepId(step.id)
                                  setRoleInput(step.roleInSquad)
                                }}
                                className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-zinc-300 p-0.5 transition-opacity cursor-pointer"
                                title="Editar papel"
                              >
                                <Pencil className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Lado Direito: Ações (subir, descer, excluir) */}
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => handleMoveStep(idx, 'up')}
                          className="p-1.5 rounded-lg border border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 disabled:opacity-30 cursor-pointer"
                          title="Mover etapa para cima"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={idx === currentPipeline.length - 1}
                          onClick={() => handleMoveStep(idx, 'down')}
                          className="p-1.5 rounded-lg border border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 disabled:opacity-30 cursor-pointer"
                          title="Mover etapa para baixo"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                        {currentPipeline.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveStep(step.id)}
                            className="p-1.5 rounded-lg border border-zinc-800 text-zinc-400 hover:text-rose-400 hover:bg-rose-950/20 cursor-pointer"
                            title="Remover especialista da esteira"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Seta conector visual para a próxima etapa */}
                    {idx < currentPipeline.length - 1 && (
                      <div className="flex justify-center py-1">
                        <div className="w-0.5 h-4 bg-zinc-800 flex items-center justify-center">
                          <ChevronRight className="w-3 h-3 text-zinc-600 rotate-90" />
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
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
          <div className="bg-[#141417] border border-zinc-800 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-400" />
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
                  className="w-full bg-[#1b1b20] border border-zinc-800 rounded-xl px-3 py-2 text-zinc-100 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-zinc-300 font-medium">Objetivo / Missão do Esquadrão</label>
                <textarea
                  value={newSquadObjective}
                  onChange={e => setNewSquadObjective(e.target.value)}
                  placeholder="Ex: Criar páginas web completas com código HTML responsivo, copy persuasiva e tarefas de publicação."
                  rows={2}
                  className="w-full bg-[#1b1b20] border border-zinc-800 rounded-xl px-3 py-2 text-zinc-100 focus:outline-none focus:border-blue-500 resize-none"
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
                className="px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-semibold text-xs cursor-pointer"
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
          <div className="bg-[#141417] border border-zinc-800 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Plus className="w-4 h-4 text-blue-400" />
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
                  className="w-full bg-[#1b1b20] border border-zinc-800 rounded-xl px-3 py-2 text-zinc-100 focus:outline-none focus:border-blue-500"
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
                            ? 'bg-blue-600/15 border-blue-500 text-blue-200'
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
                className="px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-semibold text-xs cursor-pointer"
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
