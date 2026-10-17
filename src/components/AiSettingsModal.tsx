import React, { useState, useEffect } from 'react'
import {
  Cpu,
  KeyRound,
  X,
  Eye,
  EyeOff,
  Trash2,
  Check,
  AlertCircle,
  Mic,
  Bot,
  Zap,
  ShieldCheck
} from 'lucide-react'
import { AGENT_SPECIALTIES } from './AiAssistant'

export interface AiSettingsModalProps {
  isOpen: boolean
  onClose: () => void
  activeSpecialtyId: string
  onSelectSpecialty: (id: string) => void
  onConfigSaved?: () => void
}

export type SettingsTab = 'models' | 'specialties' | 'skills'

export type ProviderKey = 'openai' | 'gemini' | 'deepseek' | 'openrouter' | 'groq' | 'ollama'

export interface ProviderMeta {
  id: ProviderKey
  name: string
  defaultModel: string
  placeholderModel: string
  keyPrefix: string
  badge: string
}

export const PROVIDERS: ProviderMeta[] = [
  { id: 'openrouter', name: 'OpenRouter', defaultModel: 'google/gemini-2.5-flash', placeholderModel: 'google/gemini-2.5-flash ou anthropic/claude-3.5-sonnet', keyPrefix: 'sk-or-v1-...', badge: 'Recomendado' },
  { id: 'openai', name: 'OpenAI', defaultModel: 'gpt-4o', placeholderModel: 'gpt-4o ou gpt-4o-mini', keyPrefix: 'sk-...', badge: 'Oficial' },
  { id: 'gemini', name: 'Gemini', defaultModel: 'gemini-2.5-flash', placeholderModel: 'gemini-2.5-flash ou gemini-1.5-pro', keyPrefix: 'AIza...', badge: 'Google' },
  { id: 'deepseek', name: 'DeepSeek', defaultModel: 'deepseek-chat', placeholderModel: 'deepseek-chat ou deepseek-reasoner', keyPrefix: 'sk-...', badge: 'Raciocínio' },
  { id: 'groq', name: 'Groq', defaultModel: 'llama-3.3-70b-versatile', placeholderModel: 'llama-3.3-70b-versatile ou mixtral-8x7b-32768', keyPrefix: 'gsk_...', badge: 'Ultra-rápido' },
  { id: 'ollama', name: 'Ollama (Local)', defaultModel: 'llama3', placeholderModel: 'llama3, mistral ou qwen2.5 (localhost:11434)', keyPrefix: 'sem chave', badge: 'Offline' }
]

export interface AgentSkill {
  id: string
  name: string
  category: 'Artefatos' | 'Vault' | 'Escrita' | 'Produtividade' | 'Pesquisa'
  icon: string
  description: string
  directive: string
  installed: boolean
  isCore?: boolean
  tags: string[]
}

export const DEFAULT_AGENT_SKILLS: AgentSkill[] = [
  {
    id: 'concentric_artifacts',
    name: 'Artefatos Concêntricos Nativos',
    category: 'Artefatos',
    icon: '📊',
    description: 'Gera e formata blocos visuais nativos: KPIs ($R_{ext} = R_{int} + P$), Timelines embutidas, Matrizes de Decisão e Cartões Inset.',
    directive: 'HABILIDADE ATIVA: Geração de Artefatos Concêntricos do Pyrita (:::kpi, :::timeline, :::comparison, :::card). Use-os ativamente para sintetizar métricas, processos e trade-offs.',
    installed: true,
    isCore: true,
    tags: ['Design', 'KPIs', 'Fórmula R_ext']
  },
  {
    id: 'vault_graph_mapper',
    name: 'Mapeador de Grafos & Backlinks',
    category: 'Vault',
    icon: '🔗',
    description: 'Identifica conceitos transversais no cofre e sugere conexões semânticas automáticas com sintaxe bidirecional [[Nome da Nota]].',
    directive: 'HABILIDADE ATIVA: Mapeamento de Grafo & Conexões do Vault. Analise o contexto e sugira links bidirecionais [[...]] com notas relevantes do cofre.',
    installed: true,
    tags: ['Vault', 'WikiLinks', 'Grafo 3D']
  },
  {
    id: 'folder_context_auditor',
    name: 'Auditor de Pastas & Contexto Amplo',
    category: 'Vault',
    icon: '📂',
    description: 'Ingere e cruza informações de múltiplos arquivos de uma pasta inteira no cofre para diagnósticos abrangentes.',
    directive: 'HABILIDADE ATIVA: Auditoria de Pastas & Contexto Amplo. Cruze dados de todas as notas fornecidas no bloco de pasta selecionada.',
    installed: true,
    tags: ['Contexto', 'Multinotas', 'Pastas']
  },
  {
    id: 'note_coauthor_write',
    name: 'Injetor de Notas & Co-Autoria',
    category: 'Escrita',
    icon: '✍️',
    description: 'No Modo Co-Autor, gera conteúdos prontos e injeta artefatos diretamente na nota ativa ou cria novas notas no cofre.',
    directive: 'HABILIDADE ATIVA: Co-Autoria e Injeção de Conteúdo. Entregue textos e artefatos prontos para serem salvos diretamente no documento.',
    installed: true,
    tags: ['Co-Autor', 'Edição', 'Automação']
  },
  {
    id: 'executive_exporter',
    name: 'Exportador Markdown & Relatórios Executivos',
    category: 'Produtividade',
    icon: '📄',
    description: 'Formata notas e sínteses em resumos executivos de alta densidade, apresentações em tópicos e sumários prontos para compartilhamento.',
    directive: 'HABILIDADE ATIVA: Síntese Executiva de Alta Densidade. Estruture informações em tópicos concisos, bullets de ação e resumos executivos claros.',
    installed: true,
    tags: ['Executivo', 'Resumos', 'Produtividade']
  },
  {
    id: 'web_research',
    name: 'Pesquisa Web & Conhecimento Externo',
    category: 'Pesquisa',
    icon: '🌐',
    description: 'Sugere termos de busca chave e referências externas para enriquecer as ideias do cofre com fontes contemporâneas.',
    directive: 'HABILIDADE ATIVA: Pesquisa e Referenciamento Externo. Sugira termos de busca chave e cite fontes e melhores práticas da indústria.',
    installed: false,
    tags: ['Web', 'Referências', 'Atualização']
  },
  {
    id: 'vault_cleaner',
    name: 'Organizador de Vault & Auditoria de Tags',
    category: 'Vault',
    icon: '🧹',
    description: 'Audita o cofre em busca de notas órfãs, tags despadronizadas e links quebrados, sugerindo reorganização.',
    directive: 'HABILIDADE ATIVA: Organização e Auditoria do Vault. Aponte redundâncias conceituais e sugira padronização de taxonomia.',
    installed: false,
    tags: ['Taxonomia', 'Limpeza', 'Refatoração']
  },
  {
    id: 'deep_code_spec',
    name: 'Engenheiro de Código & Arquitetura',
    category: 'Produtividade',
    icon: '💻',
    description: 'Especificações técnicas, diagramas de arquitetura e snippets de código funcionais tipados e comentados.',
    directive: 'HABILIDADE ATIVA: Engenharia e Arquitetura de Software. Entregue código limpo, arquitetura modular e diagramas conceituais.',
    installed: true,
    tags: ['TypeScript', 'Arquitetura', 'Código']
  }
]

export const AiSettingsModal: React.FC<AiSettingsModalProps> = ({
  isOpen,
  onClose,
  activeSpecialtyId,
  onSelectSpecialty,
  onConfigSaved
}) => {
  // Navigation tab
  const [currentTab, setCurrentTab] = useState<SettingsTab>('models')

  // Tab 1: Models & Providers State
  const [activeProvider, setActiveProvider] = useState<ProviderKey>('openrouter')
  const [models, setModels] = useState<Record<ProviderKey, string>>({
    openrouter: 'google/gemini-2.5-flash',
    openai: 'gpt-4o',
    gemini: 'gemini-2.5-flash',
    deepseek: 'deepseek-chat',
    groq: 'llama-3.3-70b-versatile',
    ollama: 'llama3'
  })
  const [multimodalMap, setMultimodalMap] = useState<Record<ProviderKey, boolean>>({
    openrouter: true,
    openai: true,
    gemini: true,
    deepseek: false,
    groq: false,
    ollama: false
  })
  const [hasKeyMap, setHasKeyMap] = useState<Record<ProviderKey, boolean>>({
    openrouter: false,
    openai: false,
    gemini: false,
    deepseek: false,
    groq: false,
    ollama: true
  })

  const [inputKey, setInputKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Tab 3: Skills State with localStorage persistence
  const [skills, setSkills] = useState<AgentSkill[]>(() => {
    try {
      const saved = localStorage.getItem('pyrita_agent_skills')
      if (saved) {
        const parsed = JSON.parse(saved) as Record<string, boolean>
        return DEFAULT_AGENT_SKILLS.map(s => ({
          ...s,
          installed: parsed[s.id] !== undefined ? parsed[s.id] : s.installed
        }))
      }
    } catch {}
    return DEFAULT_AGENT_SKILLS
  })

  // Load provider configurations from Electron safeStorage
  const loadStoredConfigs = async () => {
    if (!window.electronAPI?.aiGetAllConfigs) return

    try {
      const data = await window.electronAPI.aiGetAllConfigs()
      if (
        data.activeProvider &&
        ['openai', 'gemini', 'deepseek', 'openrouter', 'groq', 'ollama'].includes(data.activeProvider)
      ) {
        setActiveProvider(data.activeProvider as ProviderKey)
      }

      const newModels = { ...models }
      const newMultimodal = { ...multimodalMap }
      const newHasKeys = { ...hasKeyMap }

      for (const [pKey, info] of Object.entries(data.providers || {})) {
        const pk = pKey as ProviderKey
        if (info.model) newModels[pk] = info.model
        newMultimodal[pk] = !!info.multimodal
        newHasKeys[pk] = pk === 'ollama' ? true : !!info.hasKey
      }

      setModels(newModels)
      setMultimodalMap(newMultimodal)
      setHasKeyMap(newHasKeys)
      setInputKey('')
      setShowKey(false)
      setErrorMessage(null)
    } catch (err: any) {
      console.error('Failed to load AI configs:', err)
    }
  }

  useEffect(() => {
    if (isOpen) {
      loadStoredConfigs()
      setSaveSuccess(false)
      setErrorMessage(null)
    }
  }, [isOpen])

  if (!isOpen) return null

  const currentProviderMeta = PROVIDERS.find(p => p.id === activeProvider) || PROVIDERS[0]
  const currentModel = models[activeProvider] ?? currentProviderMeta.defaultModel
  const currentMultimodal = multimodalMap[activeProvider] ?? true
  const hasKey = activeProvider === 'ollama' ? true : (hasKeyMap[activeProvider] ?? false)

  const handleProviderSelect = (providerId: ProviderKey) => {
    setActiveProvider(providerId)
    setInputKey('')
    setShowKey(false)
    setSaveSuccess(false)
    setErrorMessage(null)
  }

  const handleModelChange = (val: string) => {
    setModels(prev => ({
      ...prev,
      [activeProvider]: val
    }))
    setSaveSuccess(false)
  }

  const handleMultimodalToggle = () => {
    setMultimodalMap(prev => ({
      ...prev,
      [activeProvider]: !prev[activeProvider]
    }))
    setSaveSuccess(false)
  }

  const handleDeleteKey = async () => {
    if (!window.electronAPI?.aiDeleteKey) return
    try {
      await window.electronAPI.aiDeleteKey(activeProvider)
      setHasKeyMap(prev => ({ ...prev, [activeProvider]: false }))
      setInputKey('')
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 2500)
    } catch (err: any) {
      setErrorMessage('Erro ao remover chave: ' + err.message)
    }
  }

  const handleSaveModels = async () => {
    if (!window.electronAPI?.aiSaveConfig) {
      setErrorMessage('Electron API não disponível neste ambiente.')
      return
    }

    setIsSaving(true)
    setErrorMessage(null)

    try {
      const res = await window.electronAPI.aiSaveConfig({
        provider: activeProvider,
        apiKey: inputKey.trim() || undefined,
        model: currentModel.trim() || currentProviderMeta.defaultModel,
        multimodal: currentMultimodal,
        setActive: true
      })

      if (res.success) {
        if (inputKey.trim()) {
          setHasKeyMap(prev => ({ ...prev, [activeProvider]: true }))
          setInputKey('')
        }
        setSaveSuccess(true)
        if (onConfigSaved) onConfigSaved()
        setTimeout(() => setSaveSuccess(false), 2500)
      } else {
        setErrorMessage(res.error || 'Falha ao salvar configuração.')
      }
    } catch (err: any) {
      setErrorMessage('Erro ao salvar: ' + err.message)
    } finally {
      setIsSaving(false)
    }
  }

  const handleToggleSkill = (skillId: string) => {
    setSkills(prev => {
      const updated = prev.map(s => {
        if (s.id === skillId) {
          if (s.isCore) return s // Core skill cannot be disabled
          return { ...s, installed: !s.installed }
        }
        return s
      })

      try {
        const map: Record<string, boolean> = {}
        updated.forEach(s => {
          map[s.id] = s.installed
        })
        localStorage.setItem('pyrita_agent_skills', JSON.stringify(map))
      } catch {}

      return updated
    })
  }

  const installedSkillsCount = skills.filter(s => s.installed).length

  return (
    <>
      {/* Semi-transparent Backdrop with subtle blur */}
      <div
        className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Main Settings Modal with Left Sidebar */}
      <div
        className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[840px] max-w-[95vw] h-[600px] max-h-[90vh] bg-[#0c0d11] border border-zinc-800/90 rounded-2xl shadow-2xl flex overflow-hidden text-xs text-zinc-300 select-none animate-in fade-in zoom-in-95 duration-150"
        onClick={e => e.stopPropagation()}
      >
        {/* ========================================================================= */}
        {/* LEFT SIDEBAR NAVIGATION */}
        {/* ========================================================================= */}
        <div className="w-56 bg-[#090a0d] border-r border-zinc-800/80 flex flex-col justify-between shrink-0 p-3">
          <div className="space-y-4">
            {/* Sidebar Title */}
            <div className="px-2 pt-1 pb-2 border-b border-zinc-800/60">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-md bg-[var(--accent)]/15 border border-[var(--accent)]/30 flex items-center justify-center text-[var(--accent)]">
                  <Bot className="w-3.5 h-3.5" />
                </div>
                <div>
                  <h2 className="font-bold text-xs text-zinc-100">Agente de IA</h2>
                  <p className="text-[10px] text-zinc-500 font-mono">Configurações</p>
                </div>
              </div>
            </div>

            {/* Sidebar Navigation Tabs */}
            <div className="space-y-1">
              <button
                type="button"
                onClick={() => setCurrentTab('models')}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left transition-all cursor-pointer ${
                  currentTab === 'models'
                    ? 'bg-[var(--accent)]/15 border border-[var(--accent)]/30 text-white font-semibold shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
                }`}
              >
                <Cpu className={`w-4 h-4 ${currentTab === 'models' ? 'text-[var(--accent)]' : 'text-zinc-500'}`} />
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-medium leading-tight">Configurações do Modelo</div>
                  <div className="text-[9px] text-zinc-500 truncate mt-0.5">Provedores & Chaves</div>
                </div>
                {hasKey && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_4px_rgba(52,211,153,0.8)]" />
                )}
              </button>

              <button
                type="button"
                onClick={() => setCurrentTab('specialties')}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left transition-all cursor-pointer ${
                  currentTab === 'specialties'
                    ? 'bg-[var(--accent)]/15 border border-[var(--accent)]/30 text-white font-semibold shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
                }`}
              >
                <Bot className={`w-4 h-4 ${currentTab === 'specialties' ? 'text-[var(--accent)]' : 'text-zinc-500'}`} />
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-medium leading-tight">Especialidades</div>
                  <div className="text-[9px] text-zinc-500 truncate mt-0.5">5 perfis cognitivos</div>
                </div>
                <span className="text-[10px]">
                  {AGENT_SPECIALTIES.find(s => s.id === activeSpecialtyId)?.icon}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setCurrentTab('skills')}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left transition-all cursor-pointer ${
                  currentTab === 'skills'
                    ? 'bg-[var(--accent)]/15 border border-[var(--accent)]/30 text-white font-semibold shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
                }`}
              >
                <Zap className={`w-4 h-4 ${currentTab === 'skills' ? 'text-[var(--accent)]' : 'text-zinc-500'}`} />
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-medium leading-tight">Instalar Skills</div>
                  <div className="text-[9px] text-zinc-500 truncate mt-0.5">Habilidades do agente</div>
                </div>
                <span className="px-1.5 py-0.2 rounded-full bg-zinc-800 text-zinc-400 text-[9px] font-mono">
                  {installedSkillsCount}
                </span>
              </button>
            </div>
          </div>

          {/* Sidebar Footer with DPAPI Security Badge */}
          <div className="p-2.5 rounded-xl bg-zinc-900/60 border border-zinc-800/60 text-[10px] text-zinc-500 space-y-1">
            <div className="flex items-center gap-1.5 text-zinc-400 font-medium">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>Segurança Local</span>
            </div>
            <p className="text-[9px] text-zinc-500 leading-tight">
              Chaves encriptadas com Windows DPAPI via safeStorage. Seus tokens nunca são sincronizados.
            </p>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* RIGHT CONTENT AREA */}
        {/* ========================================================================= */}
        <div className="flex-1 flex flex-col bg-[#0c0d11] min-w-0">
          {/* Header Bar */}
          <div className="h-12 px-5 border-b border-zinc-800/80 flex items-center justify-between shrink-0">
            <div>
              <h3 className="font-bold text-sm text-zinc-100">
                {currentTab === 'models' && 'Configurações do Modelo LLM'}
                {currentTab === 'specialties' && 'Especialidades Cognitivas do Agente'}
                {currentTab === 'skills' && 'Catálogo de Skills & Habilidades'}
              </h3>
              <p className="text-[10px] text-zinc-500">
                {currentTab === 'models' && 'Selecione o provedor, modelo e conecte sua chave de API'}
                {currentTab === 'specialties' && 'Escolha a persona e diretrizes ativas para o pensamento do agente'}
                {currentTab === 'skills' && 'Ative ou desative capacidades modulares e artefatos visuais'}
              </p>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 transition-colors cursor-pointer"
              title="Fechar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body content with scroll */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-chat-scrollbar">
            {/* ------------------------------------------------------------------- */}
            {/* TAB 1: MODEL CONFIGURATION */}
            {/* ------------------------------------------------------------------- */}
            {currentTab === 'models' && (
              <div className="space-y-4 max-w-xl">
                {/* 2x3 Provider Selector Grid */}
                <div className="space-y-1.5">
                  <label className="block text-zinc-400 text-[11px] font-medium">
                    Provedor de Inteligência Artificial
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {PROVIDERS.map(p => {
                      const isSelected = p.id === activeProvider
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => handleProviderSelect(p.id)}
                          className={`flex flex-col items-start p-2.5 rounded-xl text-xs font-medium transition-all cursor-pointer text-left ${
                            isSelected
                              ? 'bg-[#15171e] border border-[var(--accent)] text-[var(--accent)] shadow-sm'
                              : 'bg-[#111216] border border-zinc-800/80 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
                          }`}
                        >
                          <div className="w-full flex items-center justify-between">
                            <span className="font-semibold text-zinc-200">{p.name}</span>
                            {isSelected && (
                              <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
                            )}
                          </div>
                          <span className="text-[9px] text-zinc-500 mt-0.5">{p.badge}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Section: Modelo de IA */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="block text-zinc-400 text-[11px] font-medium">
                      Modelo do Provedor
                    </label>
                    <span className="text-[10px] text-zinc-500 font-mono">
                      Padrão: {currentProviderMeta.defaultModel}
                    </span>
                  </div>
                  <div className="relative flex items-center">
                    <input
                      type="text"
                      value={currentModel}
                      onChange={e => handleModelChange(e.target.value)}
                      placeholder={currentProviderMeta.placeholderModel}
                      className="w-full bg-[#111216] border border-zinc-800 focus:border-[var(--accent)]/80 focus:ring-1 focus:ring-[var(--accent)]/40 rounded-xl px-3 py-2 text-zinc-100 font-mono text-xs placeholder-zinc-600 transition-all outline-none pr-8"
                    />
                    {currentModel && (
                      <button
                        type="button"
                        onClick={() => handleModelChange('')}
                        className="absolute right-2.5 p-1 text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
                        title="Limpar modelo"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Section: Chave de API */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-1.5 text-zinc-400 text-[11px] font-medium">
                      <KeyRound className="w-3.5 h-3.5 text-zinc-500" />
                      <span>Chave de API ({currentProviderMeta.name})</span>
                    </label>
                    <div>
                      {activeProvider === 'ollama' ? (
                        <span className="text-sky-400 font-semibold text-[11px] flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
                          Localhost:11434 (Sem chave)
                        </span>
                      ) : hasKey ? (
                        <span className="text-emerald-400 font-semibold text-[11px] flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                          Chave Configurada
                        </span>
                      ) : (
                        <span className="text-amber-400 text-[11px] flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                          Não configurada
                        </span>
                      )}
                    </div>
                  </div>

                  {activeProvider !== 'ollama' && (
                    <div className="relative flex items-center">
                      <input
                        type={showKey ? 'text' : 'password'}
                        value={inputKey}
                        onChange={e => {
                          setInputKey(e.target.value)
                          setSaveSuccess(false)
                        }}
                        placeholder={
                          hasKey
                            ? '••••••••••••••••••••••••••••••••'
                            : `Insira sua chave (${currentProviderMeta.keyPrefix})`
                        }
                        className="w-full bg-[#111216] border border-zinc-800 focus:border-[var(--accent)]/80 focus:ring-1 focus:ring-[var(--accent)]/40 rounded-xl px-3 py-2 text-zinc-100 font-mono text-xs placeholder-zinc-600 transition-all outline-none pr-16"
                      />
                      <div className="absolute right-2 flex items-center gap-1 text-zinc-500">
                        {inputKey.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setShowKey(!showKey)}
                            className="p-1 hover:text-zinc-300 transition-colors cursor-pointer"
                            title={showKey ? 'Ocultar' : 'Mostrar'}
                          >
                            {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                        )}
                        {hasKey && (
                          <button
                            type="button"
                            onClick={handleDeleteKey}
                            className="p-1 hover:text-red-400 transition-colors cursor-pointer"
                            title="Remover chave salva"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                  {activeProvider === 'ollama' && (
                    <p className="text-[11px] text-zinc-400 bg-zinc-900/50 p-2.5 rounded-xl border border-zinc-800">
                      O Ollama roda localmente em seu computador. Certifique-se de que o serviço está em execução em <code className="text-zinc-200">http://localhost:11434</code> com o modelo baixado (ex: <code className="text-zinc-200">ollama run llama3</code>).
                    </p>
                  )}
                </div>

                {/* Multimodal Card */}
                <div className="bg-[#111216] border border-zinc-800/80 rounded-2xl p-3 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-zinc-850 border border-zinc-700/50 flex items-center justify-center text-[var(--accent)]">
                      <Mic className="w-3.5 h-3.5 text-emerald-400" />
                    </div>
                    <div>
                      <span className="font-semibold text-zinc-200 text-xs block">
                        Suporte Multimodal
                      </span>
                      <span className="text-[10px] text-zinc-500">
                        Processamento de contexto ampliado e visão
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleMultimodalToggle}
                    className={`w-10 h-5 rounded-full p-0.5 transition-colors cursor-pointer flex items-center ${
                      currentMultimodal ? 'bg-emerald-500 justify-end' : 'bg-zinc-700 justify-start'
                    }`}
                  >
                    <div className="w-4 h-4 rounded-full bg-zinc-950 shadow-md" />
                  </button>
                </div>

                {/* Feedback Alerts */}
                {saveSuccess && (
                  <div className="p-2.5 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 text-xs flex items-center gap-2 animate-in fade-in">
                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Configurações salvas e ativas com sucesso!</span>
                  </div>
                )}

                {errorMessage && (
                  <div className="p-2.5 rounded-xl bg-red-950/40 border border-red-500/40 text-red-300 text-xs flex items-center gap-2 animate-in fade-in">
                    <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                    <span>{errorMessage}</span>
                  </div>
                )}

                {/* Save Button */}
                <div className="pt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={handleSaveModels}
                    disabled={isSaving}
                    className="px-5 py-2.5 rounded-xl bg-[var(--accent)] hover:opacity-90 disabled:opacity-50 text-zinc-950 font-bold text-xs transition-all shadow-md shadow-black/40 cursor-pointer flex items-center gap-1.5"
                  >
                    {isSaving ? 'Salvando...' : 'Salvar Alterações'}
                  </button>
                </div>
              </div>
            )}

            {/* ------------------------------------------------------------------- */}
            {/* TAB 2: SPECIALTIES CONFIGURATION */}
            {/* ------------------------------------------------------------------- */}
            {currentTab === 'specialties' && (
              <div className="space-y-3">
                <div className="text-[11px] text-zinc-400 pb-1">
                  Selecione a especialidade padrão com a qual o agente de IA irá raciocinar e estruturar suas notas:
                </div>

                <div className="space-y-2.5">
                  {AGENT_SPECIALTIES.map(s => {
                    const isCur = activeSpecialtyId === s.id
                    return (
                      <div
                        key={s.id}
                        className={`p-3.5 rounded-2xl border transition-all ${
                          isCur
                            ? 'bg-[#13151c] border-[var(--accent)] shadow-md shadow-black/30'
                            : 'bg-[#0f1014] border-zinc-800/80 hover:border-zinc-700'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3">
                            <span className="text-2xl leading-none mt-0.5">{s.icon}</span>
                            <div>
                              <div className="flex items-center gap-2">
                                <h4 className="font-bold text-xs text-zinc-100">{s.name}</h4>
                                <span
                                  className="px-1.5 py-0.2 rounded-full text-[9px] font-semibold"
                                  style={{
                                    backgroundColor: `${s.badgeColor}22`,
                                    color: s.badgeColor,
                                    border: `1px solid ${s.badgeColor}44`
                                  }}
                                >
                                  {s.shortName}
                                </span>
                              </div>
                              <p className="text-[11px] text-zinc-400 mt-0.5">{s.tagline}</p>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              onSelectSpecialty(s.id)
                              try {
                                localStorage.setItem('pyrita_ai_specialty', s.id)
                              } catch {}
                            }}
                            className={`px-3 py-1.5 rounded-xl font-semibold text-xs transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
                              isCur
                                ? 'bg-[var(--accent)] text-zinc-950 font-bold'
                                : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200'
                            }`}
                          >
                            {isCur ? (
                              <>
                                <Check className="w-3.5 h-3.5" />
                                <span>Ativo</span>
                              </>
                            ) : (
                              <span>Selecionar</span>
                            )}
                          </button>
                        </div>

                        {/* Directives Preview */}
                        <div className="mt-2.5 pt-2 border-t border-zinc-850 text-[10px] text-zinc-400 space-y-1">
                          <span className="font-semibold text-zinc-500 uppercase tracking-wider text-[9px]">
                            Diretrizes cognitivas:
                          </span>
                          <p className="font-mono text-zinc-400 whitespace-pre-line leading-relaxed bg-[#0b0b0e] p-2 rounded-lg border border-zinc-850">
                            {s.systemDirective}
                          </p>
                        </div>

                        {/* Quick Presets Pills */}
                        <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                          <span className="text-[9px] text-zinc-500 font-semibold uppercase">Prompts rápidos:</span>
                          {s.presets.map((p, idx) => (
                            <span
                              key={idx}
                              className="px-2 py-0.5 rounded-md bg-zinc-850 border border-zinc-800 text-[10px] text-zinc-300"
                            >
                              {p.label}
                            </span>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* ------------------------------------------------------------------- */}
            {/* TAB 3: SKILLS CATALOG */}
            {/* ------------------------------------------------------------------- */}
            {currentTab === 'skills' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between pb-1">
                  <p className="text-[11px] text-zinc-400">
                    Instale ou ative habilidades para expandir o raciocínio e automações do agente:
                  </p>
                  <span className="text-[10px] font-mono text-zinc-500">
                    {installedSkillsCount} de {skills.length} ativas
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  {skills.map(skill => {
                    return (
                      <div
                        key={skill.id}
                        className={`p-3.5 rounded-2xl border flex flex-col justify-between transition-all ${
                          skill.installed
                            ? 'bg-[#12141a] border-zinc-700/80 shadow-sm'
                            : 'bg-[#0f1013] border-zinc-850 opacity-70'
                        }`}
                      >
                        <div className="space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="text-xl">{skill.icon}</span>
                              <div>
                                <h4 className="font-bold text-xs text-zinc-100 flex items-center gap-1.5">
                                  <span>{skill.name}</span>
                                  {skill.isCore && (
                                    <span className="px-1 py-0.2 rounded bg-zinc-800 text-[8px] font-mono text-zinc-400 uppercase">
                                      Core
                                    </span>
                                  )}
                                </h4>
                                <span className="text-[9px] text-[var(--accent)] font-medium">
                                  {skill.category}
                                </span>
                              </div>
                            </div>

                            {/* Toggle Switch */}
                            <button
                              type="button"
                              onClick={() => handleToggleSkill(skill.id)}
                              disabled={skill.isCore}
                              className={`w-9 h-5 rounded-full p-0.5 transition-colors cursor-pointer flex items-center shrink-0 ${
                                skill.installed ? 'bg-[var(--accent)] justify-end' : 'bg-zinc-700 justify-start'
                              } ${skill.isCore ? 'opacity-80 cursor-not-allowed' : ''}`}
                              title={skill.isCore ? 'Habilidade fundamental' : 'Ativar/desativar habilidade'}
                            >
                              <div className="w-3.5 h-3.5 rounded-full bg-zinc-950 shadow-md" />
                            </button>
                          </div>

                          <p className="text-[10px] text-zinc-400 leading-relaxed">
                            {skill.description}
                          </p>
                        </div>

                        {/* Tags */}
                        <div className="mt-3 pt-2 border-t border-zinc-800/60 flex items-center gap-1 flex-wrap">
                          {skill.tags.map((tag, tIdx) => (
                            <span
                              key={tIdx}
                              className="px-1.5 py-0.2 rounded bg-zinc-850 text-zinc-400 text-[9px] font-mono"
                            >
                              #{tag}
                            </span>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
