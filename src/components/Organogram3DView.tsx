import React, { useState, useRef, useMemo, useEffect } from 'react'
import {
  Building2,
  Users,
  ShieldCheck,
  Plus,
  X,
  Check,
  Pencil,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Maximize2,
  Minimize2,
  ChevronRight,
  MessageSquare,
  Layers,
  CheckCircle2
} from 'lucide-react'
import type {
  AgentProfileVersion,
  TeamDefinition,
  SquadPipelineStep,
  AgentActionPermission,
  AgentState,
  TriggerMode
} from '../types/agents'
import { AgentIcon } from './AgentIcon'
import { renderDynamicIcon } from './IconPickerPopover'

export interface Organogram3DViewProps {
  squads: TeamDefinition[]
  agents: AgentProfileVersion[]
  vaultName?: string
  onSelectSquad: (squadId: string) => void
  onSaveSquad: (squad: TeamDefinition) => void
  onDeleteSquad: (squadId: string) => void
  onOpenSquadChat: (squad: TeamDefinition) => void
  onSaveAgent?: (agent: AgentProfileVersion) => void
  onOpenAgentChat?: (agentId: string) => void
  onOpenCreateSquadModal?: () => void
}

// Habilidades e integrações disponíveis para seleção rápida no drawer
const AVAILABLE_INTEGRATIONS = [
  { id: 'zendesk', label: 'Zendesk', color: '#10b981' },
  { id: 'slack', label: 'Slack', color: '#ec4899' },
  { id: 'vault', label: 'Cofre Local', color: '#f59e0b' },
  { id: 'web', label: 'Busca Web', color: '#38bdf8' },
  { id: 'code', label: 'Execução de Código', color: '#8b5cf6' },
  { id: 'files', label: 'Análise de Arquivos', color: '#06b6d4' }
]

export const Organogram3DView: React.FC<Organogram3DViewProps> = ({
  squads,
  agents,
  vaultName = 'Cofre Principal',
  onSelectSquad,
  onSaveSquad,
  onOpenSquadChat,
  onSaveAgent,
  onOpenAgentChat,
  onOpenCreateSquadModal
}) => {
  // Estado de Navegação da Câmera (Pan, Zoom, Perspectiva 3D)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1.0)
  const [is3D, setIs3D] = useState(true)
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [isFullscreen, setIsFullscreen] = useState(false)

  // Seleção de Agente para o Drawer Lateral
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)
  const [isTurntableSpinning, setIsTurntableSpinning] = useState(true)

  // Estado do formulário no Drawer
  const [formName, setFormName] = useState('')
  const [formSquadId, setFormSquadId] = useState('')
  const [formTask, setFormTask] = useState('')
  const [formAccessLevel, setFormAccessLevel] = useState<'low' | 'medium' | 'high'>('medium')
  const [formIntegrations, setFormIntegrations] = useState<string[]>([])
  const [formIsActive, setFormIsActive] = useState(true)
  const [formCanReadVault, setFormCanReadVault] = useState(true)
  const [formCanWriteVault, setFormCanWriteVault] = useState(false)
  const [formAutonomous, setFormAutonomous] = useState(true)
  const [saveSuccessNotice, setSaveSuccessNotice] = useState(false)

  const containerRef = useRef<HTMLDivElement>(null)

  // Mapeamento de agentes e esquadrões
  const selectedAgent = useMemo(() => {
    if (!selectedAgentId) return null
    return agents.find(a => a.id === selectedAgentId) || null
  }, [agents, selectedAgentId])

  // Esquadrão ao qual o agente selecionado pertence atualmente
  const selectedAgentCurrentSquad = useMemo(() => {
    if (!selectedAgentId) return null
    return squads.find(sq =>
      (sq.pipeline || []).some(p => p.agentId === selectedAgentId) ||
      (sq.nodes || []).some(n => n.agentId === selectedAgentId)
    ) || null
  }, [squads, selectedAgentId])

  // Carregar dados no formulário quando o agente selecionado mudar
  useEffect(() => {
    if (selectedAgent) {
      setFormName(selectedAgent.name || '')
      setFormSquadId(selectedAgentCurrentSquad?.id || '')
      setFormTask(selectedAgent.roleDescription || selectedAgent.specialistRole || 'Tier-1 Ticketing')

      // Integrations
      const currentSkills = selectedAgent.skills || []
      const initialIntegrations = AVAILABLE_INTEGRATIONS.map(i => i.id).filter(id =>
        currentSkills.some(s => s.toLowerCase().includes(id)) ||
        (id === 'vault' && (selectedAgent.knowledgeBindings || []).length > 0) ||
        (id === 'web' && currentSkills.some(s => s.includes('web')))
      )
      setFormIntegrations(initialIntegrations.length > 0 ? initialIntegrations : ['zendesk', 'slack'])

      // Permissões
      const actions = selectedAgent.allowedActions || []
      setFormCanReadVault(actions.includes('read_context'))
      setFormCanWriteVault(actions.includes('prepare_draft') || actions.includes('propose_patch'))
      setFormIsActive(selectedAgent.state !== 'paused')
      setFormAccessLevel(actions.length > 3 ? 'high' : actions.length > 1 ? 'medium' : 'low')
      setFormAutonomous(selectedAgent.triggerMode !== 'on_demand')
    }
  }, [selectedAgent, selectedAgentCurrentSquad])

  // Manipulação de Mouse Pan e Zoom
  const handleMouseDown = (e: React.MouseEvent) => {
    // Apenas se o clique for direto no fundo (não em botões ou drawer)
    if ((e.target as HTMLElement).closest('.prevent-canvas-drag')) return
    setIsDragging(true)
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y })
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return
    setPan({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    })
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  const handleWheel = (e: React.WheelEvent) => {
    if ((e.target as HTMLElement).closest('.prevent-canvas-zoom')) return
    e.preventDefault()
    const zoomFactor = -e.deltaY * 0.001
    setZoom(prev => Math.max(0.45, Math.min(1.85, prev + zoomFactor)))
  }

  const handleResetView = () => {
    setPan({ x: 0, y: 0 })
    setZoom(1.0)
    setIs3D(true)
  }

  // Toggle de tela cheia
  const handleToggleFullscreen = () => {
    if (!containerRef.current) return
    if (!isFullscreen) {
      if (containerRef.current.requestFullscreen) {
        containerRef.current.requestFullscreen().catch(() => {})
      }
      setIsFullscreen(true)
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {})
      }
      setIsFullscreen(false)
    }
  }

  // Layout geométrico dos Esquadrões na cena 3D (Cofre no Centro 0,0)
  const squadPositions = useMemo(() => {
    const total = squads.length
    if (total === 0) return []

    if (total === 1) {
      return [{ squad: squads[0], x: 0, y: -240 }]
    }

    if (total === 2) {
      // Idêntico ao print de referência: Customer Support na esquerda, Engineering na direita
      return [
        { squad: squads[0], x: -440, y: -160 },
        { squad: squads[1], x: 440, y: -160 }
      ]
    }

    if (total === 3) {
      return [
        { squad: squads[0], x: -450, y: -170 },
        { squad: squads[1], x: 450, y: -170 },
        { squad: squads[2], x: 0, y: 260 }
      ]
    }

    if (total === 4) {
      return [
        { squad: squads[0], x: -450, y: -180 },
        { squad: squads[1], x: 450, y: -180 },
        { squad: squads[2], x: -450, y: 200 },
        { squad: squads[3], x: 450, y: 200 }
      ]
    }

    // Para 5 ou mais esquadrões: distribuição elíptica ao redor do cofre central
    return squads.map((squad, i) => {
      const angle = (i / total) * (2 * Math.PI) - Math.PI / 2
      const x = Math.round(Math.cos(angle) * 520)
      const y = Math.round(Math.sin(angle) * 320)
      return { squad, x, y }
    })
  }, [squads])

  // Geração das rotas dos cabos/conduítes cybernéticos (do Cofre até cada Esquadrão)
  const conduitPaths = useMemo(() => {
    const hubRadius = 115

    return squadPositions.map(pos => {
      const { squad, x, y } = pos
      const angle = Math.atan2(y, x)
      const startX = Math.round(Math.cos(angle) * hubRadius)
      const startY = Math.round(Math.sin(angle) * hubRadius)

      // Ponto de entrada na plataforma do departamento
      let targetX = x
      let targetY = y
      if (x < 0) {
        targetX = x + 160
        targetY = y + 40
      } else if (x > 0) {
        targetX = x - 160
        targetY = y + 40
      } else {
        targetY = y > 0 ? y - 100 : y + 100
      }

      // Pontos de controle para curvas Bézier cibernéticas suaves
      const deltaX = targetX - startX
      const cp1X = Math.round(startX + Math.cos(angle) * 120)
      const cp1Y = Math.round(startY + Math.sin(angle) * 80)
      const cp2X = Math.round(targetX - (deltaX > 0 ? 100 : -100))
      const cp2Y = targetY

      const pathData = `M ${startX} ${startY} C ${cp1X} ${cp1Y}, ${cp2X} ${cp2Y}, ${targetX} ${targetY}`
      return { id: squad.id, pathData, squad }
    })
  }, [squadPositions])

  // Salvar alterações da configuração do agente
  const handleSaveConfig = () => {
    if (!selectedAgent) return

    // 1. Montar permissões de ação
    const actions: AgentActionPermission[] = []
    if (formCanReadVault) actions.push('read_context')
    if (formCanWriteVault) {
      actions.push('prepare_draft')
      actions.push('propose_patch')
    }
    if (formAutonomous) actions.push('create_tasks')

    // 2. Atualizar Agente
    const updatedAgent: AgentProfileVersion = {
      ...selectedAgent,
      name: formName || selectedAgent.name,
      roleDescription: formTask || selectedAgent.roleDescription,
      state: (formIsActive ? 'available' : 'paused') as AgentState,
      skills: formIntegrations,
      triggerMode: (formAutonomous ? 'routine' : 'on_demand') as TriggerMode,
      allowedActions: actions
    }

    if (onSaveAgent) {
      onSaveAgent(updatedAgent)
    }

    // 3. Se mudou de esquadrão, atualizar as definições de esquadrões
    if (formSquadId !== (selectedAgentCurrentSquad?.id || '')) {
      // Remover do antigo
      if (selectedAgentCurrentSquad) {
        const nextPipeline = (selectedAgentCurrentSquad.pipeline || []).filter(
          p => p.agentId !== selectedAgent.id
        )
        const nextNodes = (selectedAgentCurrentSquad.nodes || []).filter(
          n => n.agentId !== selectedAgent.id
        )
        onSaveSquad({
          ...selectedAgentCurrentSquad,
          pipeline: nextPipeline,
          nodes: nextNodes
        })
      }

      // Adicionar ao novo
      if (formSquadId) {
        const targetSquad = squads.find(s => s.id === formSquadId)
        if (targetSquad) {
          const nextStep: SquadPipelineStep = {
            id: `step_${selectedAgent.id}_${Date.now()}`,
            agentId: selectedAgent.id,
            enabled: true,
            roleInSquad: formTask || 'Especialista Operacional',
            order: (targetSquad.pipeline || []).length + 1,
            expectedOutput: 'text'
          }
          const nextPipeline = [...(targetSquad.pipeline || []), nextStep]
          onSaveSquad({
            ...targetSquad,
            pipeline: nextPipeline
          })
        }
      }
    }

    // Feedback visual
    setSaveSuccessNotice(true)
    setTimeout(() => setSaveSuccessNotice(false), 2200)
  }

  // Agentes únicos em toda a empresa
  const totalUniqueAgents = useMemo(() => {
    const ids = new Set<string>()
    squads.forEach(sq => {
      ;(sq.pipeline || []).forEach(p => ids.add(p.agentId))
      ;(sq.nodes || []).forEach(n => ids.add(n.agentId))
    })
    return ids.size || agents.length
  }, [squads, agents])

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onWheel={handleWheel}
      className={`relative w-full h-full overflow-hidden select-none bg-[#07090e] ${
        isDragging ? 'cursor-grabbing' : 'cursor-grab'
      }`}
    >
      {/* =========================================================================
          1. CABEÇALHO SUPERIOR ELEGANTE (TRANSLÚCIDO)
          ========================================================================= */}
      <header className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between px-6 py-4 bg-gradient-to-b from-[#07090e]/95 via-[#07090e]/75 to-transparent pointer-events-none">
        <div className="flex items-center gap-3 pointer-events-auto">
          <div className="w-9 h-9 rounded-xl bg-cyan-950/40 border border-cyan-500/40 flex items-center justify-center text-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.2)]">
            <Building2 className="w-5 h-5 text-cyan-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold text-zinc-100 tracking-tight">
                {vaultName}
              </h1>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 font-mono font-medium">
                ORGANOGRAMA 3D
              </span>
            </div>
            <p className="text-[11px] text-zinc-400">
              Sede Corporativa &bull; Governança de Departamentos e Especialistas
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 pointer-events-auto">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#0f131d]/90 border border-zinc-800/80 text-xs text-zinc-300 shadow-lg backdrop-blur-md">
            <Users className="w-3.5 h-3.5 text-cyan-400" />
            <span>
              <strong className="text-zinc-100">{squads.length}</strong> Departamentos
            </span>
            <span className="text-zinc-600">&bull;</span>
            <span>
              <strong className="text-zinc-100">{totalUniqueAgents}</strong> Especialistas
            </span>
          </div>

          {onOpenCreateSquadModal && (
            <button
              type="button"
              onClick={onOpenCreateSquadModal}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-zinc-950 font-semibold text-xs transition-all shadow-[0_0_20px_rgba(6,182,212,0.3)] active:scale-95 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>Novo Departamento</span>
            </button>
          )}
        </div>
      </header>

      {/* =========================================================================
          2. ESTÁGIO 3D ISOMÉTRICO (CANVAS 3D)
          ========================================================================= */}
      <div
        className="w-full h-full flex items-center justify-center transition-transform duration-75"
        style={{
          perspective: '1400px',
          perspectiveOrigin: '50% 50%'
        }}
      >
        <div
          className="relative transition-all duration-300 ease-out"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom}) ${
              is3D ? 'rotateX(54deg) rotateZ(-18deg)' : 'rotateX(0deg) rotateZ(0deg)'
            }`,
            transformStyle: 'preserve-3d',
            width: '1200px',
            height: '800px'
          }}
        >
          {/* Piso Cibernético: Grid de Blueprint com profundidade */}
          <div
            className="absolute -inset-[1400px] pointer-events-none"
            style={{
              backgroundImage: `
                radial-gradient(circle at 50% 50%, rgba(56, 189, 248, 0.08) 0%, transparent 60%),
                linear-gradient(to right, rgba(56, 189, 248, 0.05) 1px, transparent 1px),
                linear-gradient(to bottom, rgba(56, 189, 248, 0.05) 1px, transparent 1px)
              `,
              backgroundSize: '100% 100%, 60px 60px, 60px 60px',
              backgroundPosition: 'center, center, center',
              transform: 'translateZ(-1px)'
            }}
          />

          {/* SVG dos Cabos / Conduítes Cybernéticos Luminosos */}
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none overflow-visible"
            style={{ transform: 'translateZ(2px)' }}
          >
            <defs>
              <filter id="glow-conduit" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="4" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
            </defs>

            {conduitPaths.map(({ id, pathData }) => (
              <g key={`conduit-${id}`}>
                {/* Tubo de vidro externo translúcido com brilho */}
                <path
                  d={pathData}
                  fill="none"
                  stroke="rgba(56, 189, 248, 0.15)"
                  strokeWidth="14"
                  strokeLinecap="round"
                  filter="url(#glow-conduit)"
                />
                {/* Trilhos do conduíte */}
                <path
                  d={pathData}
                  fill="none"
                  stroke="rgba(56, 189, 248, 0.4)"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                />
                {/* Linha central neon com fluxo animado de dados */}
                <path
                  d={pathData}
                  fill="none"
                  stroke="#38bdf8"
                  strokeWidth="2"
                  strokeDasharray="10 18"
                  strokeLinecap="round"
                  className="animate-conduit-flow"
                />
              </g>
            ))}
          </svg>

          {/* =====================================================================
              CENTRO: O PEDESTAL CIBERNÉTICO DO COFRE (CORPORATE HQ / CEO)
              ===================================================================== */}
          <div
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center justify-center cursor-pointer group"
            style={{ transformStyle: 'preserve-3d', transform: 'translate(-50%, -50%) translateZ(10px)' }}
          >
            {/* Sombra de profundidade no chão */}
            <div
              className="absolute w-72 h-72 rounded-full bg-cyan-500/10 blur-2xl pointer-events-none"
              style={{ transform: 'translateZ(-8px)' }}
            />

            {/* Pedestal Cilíndrico 3D com Bordas Metálicas e Anel Luminoso */}
            <div
              className="relative w-56 h-56 rounded-full bg-gradient-to-b from-[#1c2333] via-[#0f1420] to-[#090c14] border-4 border-cyan-400/80 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.9),0_0_40px_rgba(56,189,248,0.4)] flex flex-col items-center justify-center transition-transform group-hover:scale-105 duration-300"
              style={{
                boxShadow:
                  '0 30px 60px rgba(0,0,0,0.95), 0 0 45px rgba(56, 189, 248, 0.45), inset 0 0 25px rgba(56, 189, 248, 0.25)'
              }}
            >
              {/* Anéis orbitais concêntricos com rotação contínua */}
              <div className="absolute -inset-4 rounded-full border border-cyan-500/30 animate-orbit-spin pointer-events-none">
                <span className="absolute top-0 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_8px_#38bdf8]" />
              </div>
              <div className="absolute -inset-8 rounded-full border border-cyan-500/15 border-dashed animate-orbit-spin-rev pointer-events-none" />

              {/* Anel de Neon com Pulso */}
              <div className="absolute inset-2 rounded-full border-2 border-cyan-400/50 animate-cyber-core pointer-events-none" />

              {/* Ícone do Cofre / Emblema Central */}
              <div className="w-16 h-16 rounded-2xl bg-cyan-950/60 border border-cyan-400/60 flex items-center justify-center mb-1 shadow-[0_0_20px_rgba(56,189,248,0.3)]">
                <ShieldCheck className="w-9 h-9 text-cyan-300 drop-shadow-[0_0_8px_rgba(56,189,248,0.8)]" />
              </div>

              {/* Título do Cofre */}
              <div className="text-center px-3 max-w-[190px]">
                <div className="text-xs font-black text-white tracking-wider uppercase truncate drop-shadow">
                  {vaultName}
                </div>
                <div className="text-[10px] text-cyan-400 font-mono font-semibold tracking-wider uppercase mt-0.5">
                  CORPORATE HQ
                </div>
              </div>
            </div>

            {/* Placa / Tag Flutuante do Cofre (Billboarded para frente) */}
            <div
              className="mt-6 px-3.5 py-1.5 rounded-full bg-[#0c101c]/90 border border-cyan-500/40 text-center shadow-xl backdrop-blur-md"
              style={{
                transform: is3D ? 'rotateZ(18deg) rotateX(-54deg)' : 'none',
                transformStyle: 'preserve-3d'
              }}
            >
              <div className="text-[11px] font-bold text-zinc-100 flex items-center justify-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399] animate-pulse" />
                <span>Corporate HQ &bull; Governança Central</span>
              </div>
            </div>
          </div>

          {/* =====================================================================
              PLATAFORMAS DOS DEPARTAMENTOS / ESQUADRÕES COM AS ESTAÇÕES DE TRABALHO
              ===================================================================== */}
          {squadPositions.map(({ squad, x, y }) => {
            const pipeline = squad.pipeline || []
            const squadAgents = pipeline
              .map(p => agents.find(a => a.id === p.agentId))
              .filter(Boolean) as AgentProfileVersion[]

            return (
              <div
                key={`platform-squad-${squad.id}`}
                className="absolute flex flex-col items-center"
                style={{
                  left: `calc(50% + ${x}px)`,
                  top: `calc(50% + ${y}px)`,
                  transform: 'translate(-50%, -50%) translateZ(12px)',
                  transformStyle: 'preserve-3d'
                }}
              >
                {/* Plataforma 3D do Departamento */}
                <div
                  className="relative p-5 rounded-3xl bg-[#0d121c]/90 border-2 border-cyan-500/30 hover:border-cyan-400 transition-all duration-300 shadow-[0_20px_50px_rgba(0,0,0,0.85),0_0_30px_rgba(56,189,248,0.15)] group"
                  style={{
                    minWidth: '340px',
                    boxShadow:
                      '0 25px 50px rgba(0,0,0,0.9), 0 0 30px rgba(56, 189, 248, 0.15), inset 0 0 20px rgba(56, 189, 248, 0.05)'
                  }}
                >
                  {/* Grid de Estações de Trabalho (Mesas dos Agentes) */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pb-3">
                    {squadAgents.map(ag => {
                      const isSelected = selectedAgentId === ag.id

                      return (
                        <div
                          key={`ws-${squad.id}-${ag.id}`}
                          onClick={e => {
                            e.stopPropagation()
                            setSelectedAgentId(ag.id)
                          }}
                          className={`relative flex flex-col items-center cursor-pointer transition-all duration-200 group/ws ${
                            isSelected ? 'scale-105' : 'hover:-translate-y-1'
                          }`}
                        >
                          {/* Tag de Avatar Flutuante (Billboarded upright para fácil leitura!) */}
                          <div
                            className={`mb-1 px-2 py-0.5 rounded-full border text-[10px] font-medium flex items-center gap-1.5 transition-all shadow-md ${
                              isSelected
                                ? 'bg-cyan-500 border-cyan-300 text-zinc-950 font-bold scale-105'
                                : 'bg-[#121724]/90 border-zinc-700/80 text-zinc-200 group-hover/ws:border-cyan-400'
                            }`}
                            style={{
                              transform: is3D ? 'rotateZ(18deg) rotateX(-54deg)' : 'none',
                              transformStyle: 'preserve-3d'
                            }}
                          >
                            <AgentIcon variant={ag.icon} size={14} className="shrink-0 rounded-full" />
                            <span className="truncate max-w-[85px]">{ag.name}</span>
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399]" />
                          </div>

                          {/* Estação de Trabalho Isométrica em SVG (Mesa + Monitores duplos + Cadeira + Agente) */}
                          <div className="relative">
                            <svg viewBox="0 0 140 100" className="w-24 h-18 overflow-visible">
                              {/* Sombra da Mesa no chão */}
                              <ellipse
                                cx="70"
                                cy="78"
                                rx="45"
                                ry="16"
                                fill={isSelected ? 'rgba(56, 189, 248, 0.35)' : 'rgba(0,0,0,0.5)'}
                                filter="blur(4px)"
                              />

                              {/* Anel de seleção em volta da estação */}
                              {isSelected && (
                                <ellipse
                                  cx="70"
                                  cy="78"
                                  rx="48"
                                  ry="18"
                                  fill="none"
                                  stroke="#38bdf8"
                                  strokeWidth="2"
                                  strokeDasharray="4 4"
                                  className="animate-spin"
                                />
                              )}

                              {/* Pernas da Mesa */}
                              <line x1="32" y1="52" x2="32" y2="74" stroke="#27272a" strokeWidth="3" />
                              <line x1="108" y1="52" x2="108" y2="74" stroke="#27272a" strokeWidth="3" />

                              {/* Superfície da Mesa (Diamante Isométrico) */}
                              <polygon
                                points="30,48 70,28 110,48 70,68"
                                fill={isSelected ? '#1e293b' : '#18181b'}
                                stroke={isSelected ? '#38bdf8' : '#3f3f46'}
                                strokeWidth="1.5"
                              />

                              {/* Cadeira de Escritório */}
                              <polygon
                                points="62,64 78,64 76,74 64,74"
                                fill="#111827"
                                stroke="#374151"
                                strokeWidth="1"
                              />

                              {/* Silhueta do Especialista sentado */}
                              <circle cx="70" cy="44" r="7" fill="#38bdf8" fillOpacity="0.85" />
                              <path
                                d="M 64 51 Q 70 48 76 51 L 78 64 L 62 64 Z"
                                fill="#1e293b"
                                stroke="#38bdf8"
                                strokeWidth="0.8"
                              />

                              {/* Monitor Esquerdo (em ângulo) com telas com scanlines de código */}
                              <polygon
                                points="46,30 62,22 62,38 46,46"
                                fill="#09090b"
                                stroke="#38bdf8"
                                strokeWidth="1"
                              />
                              <polygon
                                points="48,32 60,25 60,37 48,44"
                                fill="#0284c7"
                                fillOpacity="0.85"
                              />
                              <line x1="50" y1="36" x2="58" y2="32" stroke="#e0f2fe" strokeWidth="1" />
                              <line x1="50" y1="40" x2="56" y2="37" stroke="#e0f2fe" strokeWidth="1" />

                              {/* Monitor Direito (em ângulo) */}
                              <polygon
                                points="68,22 84,30 84,46 68,38"
                                fill="#09090b"
                                stroke="#38bdf8"
                                strokeWidth="1"
                              />
                              <polygon
                                points="70,25 82,32 82,44 70,37"
                                fill="#0284c7"
                                fillOpacity="0.85"
                              />
                              <line x1="72" y1="32" x2="80" y2="36" stroke="#e0f2fe" strokeWidth="1" />
                              <line x1="74" y1="36" x2="80" y2="39" stroke="#e0f2fe" strokeWidth="1" />

                              {/* Teclado e Mouse */}
                              <polygon
                                points="65,54 75,49 80,52 70,57"
                                fill="#27272a"
                                stroke="#52525b"
                                strokeWidth="0.5"
                              />
                            </svg>
                          </div>
                        </div>
                      )
                    })}

                    {squadAgents.length === 0 && (
                      <div className="col-span-2 py-4 px-6 text-center text-xs text-zinc-500 border border-dashed border-zinc-800 rounded-xl">
                        Nenhum especialista atribuído.
                      </div>
                    )}
                  </div>

                  {/* Rótulo do Departamento na Frente da Plataforma (Billboarded) */}
                  <div
                    className="mt-2 pt-2 border-t border-zinc-800/80 flex items-center justify-between gap-3 text-center"
                    style={{
                      transform: is3D ? 'rotateZ(18deg) rotateX(-54deg)' : 'none',
                      transformStyle: 'preserve-3d'
                    }}
                  >
                    <div className="text-left min-w-0">
                      <div className="font-bold text-xs text-zinc-100 truncate flex items-center gap-1.5">
                        <span className="text-cyan-400">
                          {renderDynamicIcon(squad.icon || 'Users', 'w-3.5 h-3.5 text-cyan-400')}
                        </span>
                        <span>{squad.name}</span>
                      </div>
                      <div className="text-[10px] text-zinc-400 font-mono mt-0.5">
                        ({squadAgents.length} {squadAgents.length === 1 ? 'Agente' : 'Agentes'})
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation()
                          onOpenSquadChat(squad)
                        }}
                        className="p-1.5 rounded-lg bg-zinc-800/90 hover:bg-cyan-500 hover:text-zinc-950 text-zinc-400 transition-all cursor-pointer"
                        title={`Conversar com Esquadrão ${squad.name}`}
                      >
                        <MessageSquare className="w-3 h-3" />
                      </button>

                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation()
                          onSelectSquad(squad.id)
                        }}
                        className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-cyan-500 hover:text-zinc-950 text-zinc-300 text-[10.5px] font-medium flex items-center gap-1 transition-all cursor-pointer shrink-0"
                      >
                        <span>Gerenciar</span>
                        <ChevronRight className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* =========================================================================
          3. BARRA DE CONTROLES INFERIOR (ZOOM, PAN, 3D TILT, RESET)
          ========================================================================= */}
      <nav
        aria-label="Controles de visualização do organograma"
        className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5 px-3 py-2 rounded-2xl bg-[#0f1422]/90 border border-zinc-800/90 shadow-2xl backdrop-blur-xl pointer-events-auto prevent-canvas-drag"
      >
        <button
          type="button"
          onClick={() => setZoom(prev => Math.min(1.85, prev + 0.15))}
          className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors cursor-pointer"
          title="Aproximar (Zoom In)"
        >
          <ZoomIn className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={() => setZoom(prev => Math.max(0.45, prev - 0.15))}
          className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors cursor-pointer"
          title="Afastar (Zoom Out)"
        >
          <ZoomOut className="w-4 h-4" />
        </button>

        <div className="w-px h-4 bg-zinc-800 mx-1" />

        <button
          type="button"
          onClick={handleResetView}
          className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors cursor-pointer"
          title="Centralizar Visão"
        >
          <RotateCcw className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={() => setIs3D(prev => !prev)}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
            is3D
              ? 'bg-cyan-500/20 border border-cyan-500/40 text-cyan-300'
              : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800'
          }`}
          title="Alternar entre Perspectiva 3D e Visão 2D Superior"
        >
          <Layers className="w-3.5 h-3.5" />
          <span>{is3D ? '3D Isométrico' : '2D Plano'}</span>
        </button>

        <div className="w-px h-4 bg-zinc-800 mx-1" />

        <button
          type="button"
          onClick={handleToggleFullscreen}
          className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors cursor-pointer"
          title="Tela Cheia"
        >
          {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </button>
      </nav>

      {/* =========================================================================
          4. DRAWER LATERAL DIREITO: "AGENT CONFIGURATION" (IDÊNTICO AO PRINT!)
          ========================================================================= */}
      {selectedAgent && (
        <aside
          role="region"
          aria-label="Configuração do Agente"
          className="absolute top-0 right-0 bottom-0 w-96 bg-[#0c101c]/95 border-l border-zinc-800/90 shadow-2xl z-40 flex flex-col backdrop-blur-2xl animate-in slide-in-from-right duration-200 prevent-canvas-drag prevent-canvas-zoom"
        >
          {/* Header do Drawer */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800/80">
            <div>
              <span className="text-[10px] font-mono tracking-wider text-cyan-400 uppercase font-semibold">
                AGENT CONFIGURATION
              </span>
              <h2 className="text-sm font-bold text-zinc-100 truncate mt-0.5">
                {selectedAgent.name}
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setSelectedAgentId(null)}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Conteúdo do Drawer com Scroll Suave */}
          <div className="flex-1 overflow-y-auto custom-chat-scrollbar p-5 space-y-5">
            {/* 1. Hero 3D da Estação de Trabalho do Agente com Giratório Turntable */}
            <div className="relative rounded-2xl bg-gradient-to-b from-[#141b2d] to-[#0b101d] border border-cyan-500/30 p-4 flex flex-col items-center justify-center overflow-hidden shadow-inner">
              <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-[10px] text-emerald-300 font-medium font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399]" />
                <span>ONLINE</span>
              </div>

              {/* Workstation 3D com anel de rotação turntable */}
              <div className="relative my-2">
                <div className={`transition-transform duration-300 ${isTurntableSpinning ? 'animate-turntable-3d' : ''}`}>
                  <svg viewBox="0 0 160 120" className="w-40 h-28 overflow-visible">
                    {/* Anel de órbita 3D turntable */}
                    <ellipse
                      cx="80"
                      cy="95"
                      rx="65"
                      ry="22"
                      fill="none"
                      stroke="#38bdf8"
                      strokeWidth="1.5"
                      strokeDasharray="6 6"
                      strokeOpacity="0.7"
                    />

                    {/* Sombra da mesa */}
                    <ellipse cx="80" cy="92" rx="50" ry="18" fill="rgba(0,0,0,0.6)" filter="blur(6px)" />

                    {/* Pernas da mesa */}
                    <line x1="38" y1="62" x2="38" y2="88" stroke="#3f3f46" strokeWidth="3" />
                    <line x1="122" y1="62" x2="122" y2="88" stroke="#3f3f46" strokeWidth="3" />

                    {/* Tampo da Mesa */}
                    <polygon
                      points="35,58 80,34 125,58 80,82"
                      fill="#1e293b"
                      stroke="#38bdf8"
                      strokeWidth="1.5"
                    />

                    {/* Cadeira de Escritório */}
                    <polygon
                      points="70,76 90,76 87,90 73,90"
                      fill="#0f172a"
                      stroke="#334155"
                      strokeWidth="1"
                    />

                    {/* Especialista sentado */}
                    <circle cx="80" cy="52" r="8" fill="#38bdf8" fillOpacity="0.9" />
                    <path
                      d="M 72 61 Q 80 57 88 61 L 90 78 L 70 78 Z"
                      fill="#0f172a"
                      stroke="#38bdf8"
                      strokeWidth="1"
                    />

                    {/* Monitores Duplos Luminosos */}
                    <polygon
                      points="52,38 72,28 72,48 52,58"
                      fill="#09090b"
                      stroke="#38bdf8"
                      strokeWidth="1.2"
                    />
                    <polygon
                      points="55,41 69,32 69,46 55,54"
                      fill="#0284c7"
                      fillOpacity="0.85"
                    />
                    <line x1="57" y1="46" x2="67" y2="40" stroke="#e0f2fe" strokeWidth="1" />
                    <line x1="57" y1="50" x2="65" y2="46" stroke="#e0f2fe" strokeWidth="1" />

                    <polygon
                      points="80,28 100,38 100,58 80,48"
                      fill="#09090b"
                      stroke="#38bdf8"
                      strokeWidth="1.2"
                    />
                    <polygon
                      points="83,32 97,41 97,54 83,46"
                      fill="#0284c7"
                      fillOpacity="0.85"
                    />
                    <line x1="85" y1="40" x2="95" y2="46" stroke="#e0f2fe" strokeWidth="1" />
                    <line x1="87" y1="46" x2="95" y2="50" stroke="#e0f2fe" strokeWidth="1" />
                  </svg>
                </div>
              </div>

              <div className="flex items-center justify-between w-full pt-1 border-t border-zinc-800/60 text-[10px] text-zinc-400">
                <span className="font-mono text-cyan-300">Workstation Turntable</span>
                <button
                  type="button"
                  onClick={() => setIsTurntableSpinning(prev => !prev)}
                  className="text-zinc-500 hover:text-cyan-400 transition-colors cursor-pointer"
                >
                  {isTurntableSpinning ? 'Pausar rotação' : 'Girar 3D'}
                </button>
              </div>
            </div>

            {/* 2. Nome do Agente com ícone de edição */}
            <div>
              <label className="block text-[11px] font-medium text-zinc-400 mb-1.5">
                Nome do Especialista
              </label>
              <div className="relative flex items-center">
                <input
                  type="text"
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  placeholder="Nome do agente..."
                  className="w-full bg-[#131929] border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-cyan-500"
                />
                <Pencil className="w-3.5 h-3.5 text-zinc-500 absolute right-3 pointer-events-none" />
              </div>
            </div>

            {/* 3. Departamento (Esquadrão) */}
            <div>
              <label className="block text-[11px] font-medium text-zinc-400 mb-1.5">
                Departamento (Esquadrão)
              </label>
              <select
                value={formSquadId}
                onChange={e => setFormSquadId(e.target.value)}
                className="w-full bg-[#131929] border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-cyan-500 cursor-pointer"
              >
                <option value="">Sem Departamento (Livre)</option>
                {squads.map(sq => (
                  <option key={sq.id} value={sq.id}>
                    {sq.name}
                  </option>
                ))}
              </select>
            </div>

            {/* 4. Assigned Task / Função Principal */}
            <div>
              <label className="block text-[11px] font-medium text-zinc-400 mb-1.5">
                Função Principal (Assigned Task)
              </label>
              <input
                type="text"
                value={formTask}
                onChange={e => setFormTask(e.target.value)}
                placeholder="Ex: Tier-1 Ticketing, Redação, Análise..."
                className="w-full bg-[#131929] border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-cyan-500"
              />
            </div>

            {/* 5. Nível de Acesso (Access Level) */}
            <div>
              <label className="block text-[11px] font-medium text-zinc-400 mb-1.5">
                Nível de Acesso (Access Level)
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {(['low', 'medium', 'high'] as const).map(lvl => {
                  const isSel = formAccessLevel === lvl
                  const labels = { low: 'Básico', medium: 'Médio', high: 'Total / Root' }
                  return (
                    <button
                      key={lvl}
                      type="button"
                      onClick={() => setFormAccessLevel(lvl)}
                      className={`py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                        isSel
                          ? 'bg-cyan-500 text-zinc-950 font-bold shadow-sm'
                          : 'bg-[#131929] text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 border border-zinc-800'
                      }`}
                    >
                      {labels[lvl]}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* 6. Integrações & Ferramentas Ativas */}
            <div>
              <label className="block text-[11px] font-medium text-zinc-400 mb-1.5">
                Integrações & Ferramentas Ativas
              </label>
              <div className="flex flex-wrap gap-1.5">
                {AVAILABLE_INTEGRATIONS.map(item => {
                  const isActive = formIntegrations.includes(item.id)
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setFormIntegrations(prev =>
                          prev.includes(item.id)
                            ? prev.filter(x => x !== item.id)
                            : [...prev, item.id]
                        )
                      }}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all cursor-pointer flex items-center gap-1.5 ${
                        isActive
                          ? 'bg-cyan-950/60 border-cyan-500/60 text-cyan-200'
                          : 'bg-[#131929] border-zinc-800 text-zinc-500 hover:text-zinc-300'
                      }`}
                    >
                      <span
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ backgroundColor: isActive ? item.color : '#71717a' }}
                      />
                      <span>{item.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* 7. Chaves / Toggles de Atuação */}
            <div className="space-y-3 pt-2 border-t border-zinc-800/80">
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-xs text-zinc-300">Especialista Ativo no Esquadrão</span>
                <input
                  type="checkbox"
                  checked={formIsActive}
                  onChange={e => setFormIsActive(e.target.checked)}
                  className="w-4 h-4 rounded text-cyan-500 focus:ring-0 cursor-pointer"
                />
              </label>

              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-xs text-zinc-300">Acesso de Leitura ao Cofre</span>
                <input
                  type="checkbox"
                  checked={formCanReadVault}
                  onChange={e => setFormCanReadVault(e.target.checked)}
                  className="w-4 h-4 rounded text-cyan-500 focus:ring-0 cursor-pointer"
                />
              </label>

              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-xs text-zinc-300">Permissão de Escrita de Notas</span>
                <input
                  type="checkbox"
                  checked={formCanWriteVault}
                  onChange={e => setFormCanWriteVault(e.target.checked)}
                  className="w-4 h-4 rounded text-cyan-500 focus:ring-0 cursor-pointer"
                />
              </label>

              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-xs text-zinc-300">Geração Autônoma</span>
                <input
                  type="checkbox"
                  checked={formAutonomous}
                  onChange={e => setFormAutonomous(e.target.checked)}
                  className="w-4 h-4 rounded text-cyan-500 focus:ring-0 cursor-pointer"
                />
              </label>
            </div>
          </div>

          {/* Rodapé de Ações do Drawer */}
          <div className="p-4 border-t border-zinc-800/80 space-y-2 bg-[#0a0d16]">
            {saveSuccessNotice && (
              <div className="p-2 rounded-lg bg-emerald-950/60 border border-emerald-500/50 text-emerald-300 text-xs flex items-center justify-center gap-1.5 animate-in fade-in duration-150">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Configuração salva com sucesso!</span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleSaveConfig}
                className="w-full py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-zinc-950 font-bold text-xs transition-all shadow-[0_0_15px_rgba(6,182,212,0.3)] active:scale-95 cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Save Config</span>
              </button>

              {onOpenAgentChat && (
                <button
                  type="button"
                  onClick={() => onOpenAgentChat(selectedAgent.id)}
                  className="w-full py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs transition-all shadow-md active:scale-95 cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>Deploy</span>
                </button>
              )}
            </div>

            {selectedAgentCurrentSquad && (
              <button
                type="button"
                onClick={() => onSelectSquad(selectedAgentCurrentSquad.id)}
                className="w-full py-1.5 rounded-xl bg-zinc-800/80 hover:bg-zinc-800 text-zinc-300 text-xs font-medium transition-colors cursor-pointer flex items-center justify-center gap-1.5"
              >
                <span>Ver no Esquadrão ({selectedAgentCurrentSquad.name})</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </aside>
      )}
    </div>
  )
}
