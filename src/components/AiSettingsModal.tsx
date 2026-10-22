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
  ShieldCheck,
  Folder,
  FolderPlus,
  RefreshCw,
  Edit2,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  FileText
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

export interface CustomSkillFile {
  name: string
  folder: string
  path: string
  content: string
}

export interface CustomAgentSkill {
  id: string
  name: string
  description: string
  folderPath: string
  enabled: boolean
  filesCount: number
  files: CustomSkillFile[]
  importedAt: number
  updatedAt: number
}

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

// System skills cleared per user request to prioritize folder-based sub-vault skills
export const DEFAULT_AGENT_SKILLS: AgentSkill[] = []

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

  // Tab 3: Custom Skills State with localStorage persistence
  const [customSkills, setCustomSkills] = useState<CustomAgentSkill[]>(() => {
    try {
      const saved = localStorage.getItem('pyrita_agent_custom_skills_v1')
      if (saved) {
        return JSON.parse(saved)
      }
    } catch {}
    return []
  })

  const [isImporting, setIsImporting] = useState(false)
  const [reloadingSkillId, setReloadingSkillId] = useState<string | null>(null)
  const [expandedSkillId, setExpandedSkillId] = useState<string | null>(null)
  const [previewFile, setPreviewFile] = useState<CustomSkillFile | null>(null)
  const [editingSkillId, setEditingSkillId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editDesc, setEditDesc] = useState('')

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

  const saveCustomSkills = (newSkills: CustomAgentSkill[]) => {
    setCustomSkills(newSkills)
    try {
      localStorage.setItem('pyrita_agent_custom_skills_v1', JSON.stringify(newSkills))
    } catch (err) {
      console.error('Failed to save custom skills to localStorage', err)
    }
  }

  const handleImportSkillFolder = async () => {
    if (!window.electronAPI?.selectFolder || !window.electronAPI?.readVault) {
      alert('Esta funcionalidade requer a execução do Pyrita no Electron.')
      return
    }

    try {
      const folderPath = await window.electronAPI.selectFolder()
      if (!folderPath) return

      setIsImporting(true)
      const vaultFiles = await window.electronAPI.readVault(folderPath)

      const folderName = folderPath.split(/[\\/]/).filter(Boolean).pop() || 'Nova Skill'

      let description = `Skill com ${vaultFiles.length} arquivo(s) .md como sub-cofre de conhecimento.`
      const docFile = vaultFiles.find(f => /^(skill|readme|doc|instrucoes)\.md$/i.test(f.title?.trim() || ''))
      if (docFile && docFile.content) {
        const firstLines = docFile.content
          .split('\n')
          .map(l => l.replace(/^[#\-*>\s]+/, '').trim())
          .filter(l => l.length > 5)
        if (firstLines.length > 0) {
          description = firstLines.slice(0, 2).join(' — ').slice(0, 160)
        }
      }

      const newSkill: CustomAgentSkill = {
        id: `skill_${Date.now()}`,
        name: folderName,
        description,
        folderPath,
        enabled: true,
        filesCount: vaultFiles.length,
        files: vaultFiles.map(f => ({
          name: f.title || f.filePath.split(/[\\/]/).pop() || 'nota.md',
          folder: f.folder || '',
          path: f.filePath,
          content: f.content || ''
        })),
        importedAt: Date.now(),
        updatedAt: Date.now()
      }

      saveCustomSkills([newSkill, ...customSkills])
    } catch (err: any) {
      console.error('Erro ao importar pasta de skill:', err)
      alert('Erro ao importar pasta: ' + (err.message || String(err)))
    } finally {
      setIsImporting(false)
    }
  }

  const handleReloadSkillFolder = async (skill: CustomAgentSkill) => {
    if (!window.electronAPI?.readVault) return
    setReloadingSkillId(skill.id)
    try {
      const vaultFiles = await window.electronAPI.readVault(skill.folderPath)
      const updated = customSkills.map(s => {
        if (s.id === skill.id) {
          return {
            ...s,
            filesCount: vaultFiles.length,
            files: vaultFiles.map(f => ({
              name: f.title || f.filePath.split(/[\\/]/).pop() || 'nota.md',
              folder: f.folder || '',
              path: f.filePath,
              content: f.content || ''
            })),
            updatedAt: Date.now()
          }
        }
        return s
      })
      saveCustomSkills(updated)
    } catch (err: any) {
      alert('Erro ao recarregar pasta da skill: ' + (err.message || String(err)))
    } finally {
      setReloadingSkillId(null)
    }
  }

  const handleToggleCustomSkill = (skillId: string) => {
    const updated = customSkills.map(s => {
      if (s.id === skillId) {
        return { ...s, enabled: !s.enabled }
      }
      return s
    })
    saveCustomSkills(updated)
  }

  const handleDeleteCustomSkill = (skillId: string) => {
    if (confirm('Tem certeza que deseja remover esta skill do Pyrita? Seus arquivos em disco continuarão intactos.')) {
      const updated = customSkills.filter(s => s.id !== skillId)
      saveCustomSkills(updated)
      if (expandedSkillId === skillId) setExpandedSkillId(null)
    }
  }

  const handleStartEdit = (skill: CustomAgentSkill) => {
    setEditingSkillId(skill.id)
    setEditName(skill.name)
    setEditDesc(skill.description)
  }

  const handleSaveEdit = (skillId: string) => {
    if (!editName.trim()) return
    const updated = customSkills.map(s => {
      if (s.id === skillId) {
        return {
          ...s,
          name: editName.trim(),
          description: editDesc.trim(),
          updatedAt: Date.now()
        }
      }
      return s
    })
    saveCustomSkills(updated)
    setEditingSkillId(null)
  }

  const handleOpenInExplorer = (folderPath: string) => {
    if (window.electronAPI?.openInExplorer) {
      window.electronAPI.openInExplorer(folderPath)
    }
  }

  const installedSkillsCount = customSkills.filter(s => s.enabled).length

  return (
    <>
      {/* Semi-transparent Backdrop with subtle blur */}
      <div
        className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Main Settings Modal with Left Sidebar */}
      <div
        className="ai-settings-modal fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[840px] max-w-[95vw] h-[600px] max-h-[90vh] bg-[#0c0d11] border border-zinc-800/90 rounded-2xl shadow-2xl flex overflow-hidden text-xs text-zinc-300 select-none animate-in fade-in zoom-in-95 duration-150"
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
                  <div className="text-[9px] text-zinc-500 truncate mt-0.5">Pastas como cofres</div>
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
                {currentTab === 'skills' && 'Habilidades & Cofres de Conhecimento'}
              </h3>
              <p className="text-[10px] text-zinc-500">
                {currentTab === 'models' && 'Selecione o provedor, modelo e conecte sua chave de API'}
                {currentTab === 'specialties' && 'Escolha a persona e o modo de raciocínio ativo para o agente'}
                {currentTab === 'skills' && 'Importe pastas locais com notas e instruções para expandir as capacidades do agente'}
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
                  Selecione a especialidade com a qual o agente de IA irá raciocinar e estruturar suas notas:
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
                              <p className="text-[11px] text-zinc-400 mt-1 leading-relaxed">{s.tagline}</p>
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
                            className={`px-3.5 py-1.5 rounded-xl font-semibold text-xs transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
                              isCur
                                ? 'bg-[var(--accent)] text-zinc-950 font-bold shadow-sm'
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

                        {/* Quick Presets Pills */}
                        {s.presets.length > 0 && (
                          <div className="mt-2.5 pt-2 border-t border-zinc-800/60 flex items-center gap-1.5 flex-wrap">
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
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* ------------------------------------------------------------------- */}
            {/* TAB 3: SKILLS CATALOG & FOLDER SUB-VAULTS */}
            {/* ------------------------------------------------------------------- */}
            {currentTab === 'skills' && (
              <div className="space-y-4">
                {/* Header action bar */}
                <div className="flex items-center justify-between pb-1">
                  <div>
                    <p className="text-[11px] text-zinc-300 font-medium">
                      Habilidades baseadas em Pastas & Cofres
                    </p>
                    <p className="text-[10px] text-zinc-500">
                      Importe qualquer pasta com arquivos .md para que o agente utilize como base de conhecimento ativa.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleImportSkillFolder}
                    disabled={isImporting}
                    className="px-3.5 py-1.5 rounded-xl bg-[var(--accent)] hover:opacity-90 disabled:opacity-50 text-zinc-950 font-bold text-xs transition-all shadow-md shadow-black/40 cursor-pointer flex items-center gap-1.5 shrink-0"
                  >
                    <FolderPlus className="w-3.5 h-3.5" />
                    <span>{isImporting ? 'Lendo pasta...' : '+ Importar Pasta de Skill'}</span>
                  </button>
                </div>

                {/* Empty State */}
                {customSkills.length === 0 && (
                  <div className="border border-dashed border-zinc-800 rounded-2xl p-8 text-center space-y-3 bg-[#0f1013]/50">
                    <div className="w-12 h-12 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mx-auto text-[var(--accent)]">
                      <Folder className="w-6 h-6" />
                    </div>
                    <div className="max-w-md mx-auto space-y-1">
                      <h4 className="font-bold text-xs text-zinc-200">Nenhuma Skill Instalada</h4>
                      <p className="text-[11px] text-zinc-400 leading-relaxed">
                        Transforme qualquer pasta do seu computador contendo arquivos <code className="text-zinc-200">.md</code> (instruções, diretrizes de redação, manuais, prompts e subpastas) em uma Habilidade para o Agente.
                      </p>
                      <p className="text-[10px] text-zinc-500 pt-1">
                        O agente ingere todos os arquivos markdown da pasta automaticamente, funcionando como um sub-cofre vivo.
                      </p>
                    </div>
                    <div className="pt-2">
                      <button
                        type="button"
                        onClick={handleImportSkillFolder}
                        disabled={isImporting}
                        className="px-4 py-2 rounded-xl bg-[var(--accent)] hover:opacity-90 text-zinc-950 font-bold text-xs transition-all shadow-md shadow-black/40 cursor-pointer inline-flex items-center gap-1.5"
                      >
                        <FolderPlus className="w-4 h-4" />
                        <span>{isImporting ? 'Lendo pasta...' : 'Selecionar Pasta no Computador'}</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Skills Cards */}
                {customSkills.length > 0 && (
                  <div className="space-y-3">
                    {customSkills.map(skill => {
                      const isExpanded = expandedSkillId === skill.id
                      const isEditing = editingSkillId === skill.id
                      const isReloading = reloadingSkillId === skill.id

                      return (
                        <div
                          key={skill.id}
                          className={`p-3.5 rounded-2xl border transition-all ${
                            skill.enabled
                              ? 'bg-[#12141a] border-zinc-700/80 shadow-sm'
                              : 'bg-[#0f1013] border-zinc-850 opacity-75'
                          }`}
                        >
                          {/* Header row */}
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-3 flex-1 min-w-0">
                              <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-center text-amber-400 shrink-0 mt-0.5">
                                <Folder className="w-4 h-4" />
                              </div>

                              <div className="flex-1 min-w-0">
                                {isEditing ? (
                                  <div className="space-y-2 max-w-md">
                                    <input
                                      type="text"
                                      value={editName}
                                      onChange={e => setEditName(e.target.value)}
                                      className="w-full bg-[#161820] border border-zinc-700 rounded-lg px-2.5 py-1 text-xs text-zinc-100 outline-none focus:border-[var(--accent)]"
                                      placeholder="Nome da Skill"
                                    />
                                    <textarea
                                      value={editDesc}
                                      onChange={e => setEditDesc(e.target.value)}
                                      rows={2}
                                      className="w-full bg-[#161820] border border-zinc-700 rounded-lg px-2.5 py-1 text-[11px] text-zinc-200 outline-none focus:border-[var(--accent)] resize-none"
                                      placeholder="Descrição da habilidade..."
                                    />
                                    <div className="flex items-center gap-1.5">
                                      <button
                                        type="button"
                                        onClick={() => handleSaveEdit(skill.id)}
                                        className="px-2.5 py-1 rounded bg-[var(--accent)] text-zinc-950 font-bold text-[10px] cursor-pointer"
                                      >
                                        Salvar
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setEditingSkillId(null)}
                                        className="px-2.5 py-1 rounded bg-zinc-800 text-zinc-300 text-[10px] cursor-pointer"
                                      >
                                        Cancelar
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <div>
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <h4 className="font-bold text-xs text-zinc-100">{skill.name}</h4>
                                      <span className="px-1.5 py-0.2 rounded-full bg-zinc-800 border border-zinc-700/60 text-[9px] font-mono text-zinc-300">
                                        {skill.filesCount} arquivo{skill.filesCount !== 1 ? 's' : ''} .md
                                      </span>
                                      {skill.enabled && (
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_4px_rgba(52,211,153,0.8)]" />
                                      )}
                                    </div>
                                    <p className="text-[11px] text-zinc-400 mt-0.5 leading-relaxed">
                                      {skill.description}
                                    </p>
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Actions Right */}
                            <div className="flex items-center gap-1.5 shrink-0">
                              {/* Reload Sync button */}
                              <button
                                type="button"
                                onClick={() => handleReloadSkillFolder(skill)}
                                disabled={isReloading}
                                className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
                                title="Recarregar arquivos da pasta em disco"
                              >
                                <RefreshCw className={`w-3.5 h-3.5 ${isReloading ? 'animate-spin text-[var(--accent)]' : ''}`} />
                              </button>

                              {/* Open in Windows Explorer */}
                              <button
                                type="button"
                                onClick={() => handleOpenInExplorer(skill.folderPath)}
                                className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
                                title="Abrir pasta no Windows Explorer"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </button>

                              {/* Edit Name & Desc */}
                              {!isEditing && (
                                <button
                                  type="button"
                                  onClick={() => handleStartEdit(skill)}
                                  className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
                                  title="Editar nome e descrição"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                              )}

                              {/* Delete Skill */}
                              <button
                                type="button"
                                onClick={() => handleDeleteCustomSkill(skill.id)}
                                className="p-1.5 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-rose-950/30 transition-colors cursor-pointer"
                                title="Remover Skill do Pyrita"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>

                              {/* Toggle switch */}
                              <button
                                type="button"
                                onClick={() => handleToggleCustomSkill(skill.id)}
                                className={`w-9 h-5 rounded-full p-0.5 transition-colors cursor-pointer flex items-center ml-1 ${
                                  skill.enabled ? 'bg-[var(--accent)] justify-end' : 'bg-zinc-700 justify-start'
                                }`}
                                title={skill.enabled ? 'Habilidade ativa no contexto' : 'Habilidade desativada'}
                              >
                                <div className="w-3.5 h-3.5 rounded-full bg-zinc-950 shadow-md" />
                              </button>
                            </div>
                          </div>

                          {/* Path and Expand Bar */}
                          <div className="mt-2.5 pt-2 border-t border-zinc-800/60 flex items-center justify-between text-[10px] text-zinc-500">
                            <span className="font-mono truncate max-w-[380px]" title={skill.folderPath}>
                              📁 {skill.folderPath}
                            </span>

                            <button
                              type="button"
                              onClick={() => setExpandedSkillId(isExpanded ? null : skill.id)}
                              className="flex items-center gap-1 text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer px-1.5 py-0.5 rounded hover:bg-zinc-800"
                            >
                              <span>{isExpanded ? 'Ocultar arquivos' : `Ver ${skill.filesCount} arquivos`}</span>
                              {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                            </button>
                          </div>

                          {/* Expanded Files List */}
                          {isExpanded && (
                            <div className="mt-2.5 pt-2 border-t border-zinc-850 space-y-1.5 animate-in fade-in duration-150">
                              <div className="text-[10px] text-zinc-400 font-mono flex items-center justify-between">
                                <span>ARQUIVOS .MD INGERIDOS NESTA SKILL:</span>
                                <span className="text-[9px] text-zinc-500">Clique para inspecionar</span>
                              </div>
                              <div className="max-h-40 overflow-y-auto custom-chat-scrollbar space-y-1 bg-[#090a0d] p-2 rounded-xl border border-zinc-850">
                                {skill.files.map((file, fIdx) => (
                                  <button
                                    key={fIdx}
                                    type="button"
                                    onClick={() => setPreviewFile(file)}
                                    className="w-full text-left px-2 py-1 rounded hover:bg-zinc-800/80 text-zinc-300 flex items-center justify-between text-[11px] cursor-pointer transition-colors"
                                  >
                                    <div className="flex items-center gap-1.5 truncate">
                                      <FileText className="w-3 h-3 text-[var(--accent)] shrink-0" />
                                      <span className="truncate font-mono">{file.name}</span>
                                    </div>
                                    <span className="text-[9px] text-zinc-500 font-mono shrink-0 ml-2">
                                      {file.folder || '/'} • {file.content.length} chars
                                    </span>
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* File Inspection Modal (when previewFile is selected) */}
                {previewFile && (
                  <div
                    className="fixed inset-0 z-60 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4"
                    onClick={() => setPreviewFile(null)}
                  >
                    <div
                      className="bg-[#121318] border border-zinc-700 rounded-2xl w-[600px] max-w-[90vw] max-h-[80vh] flex flex-col overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-100"
                      onClick={e => e.stopPropagation()}
                    >
                      <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
                        <div className="flex items-center gap-2 truncate">
                          <FileText className="w-4 h-4 text-[var(--accent)] shrink-0" />
                          <div>
                            <h4 className="font-bold text-xs text-zinc-100 truncate">{previewFile.name}</h4>
                            <p className="text-[10px] text-zinc-500 font-mono truncate">{previewFile.path}</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setPreviewFile(null)}
                          className="p-1 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 cursor-pointer"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="p-4 overflow-y-auto flex-1 custom-chat-scrollbar">
                        <pre className="font-mono text-[11px] text-zinc-300 whitespace-pre-wrap leading-relaxed select-text">
                          {previewFile.content || '(arquivo sem conteúdo)'}
                        </pre>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
