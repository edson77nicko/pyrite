import React, { useState, useEffect } from 'react'
import {
  Cpu,
  KeyRound,
  Sparkles,
  X,
  Eye,
  EyeOff,
  Trash2,
  Check,
  AlertCircle,
  Mic,
  Lock
} from 'lucide-react'

export interface AiModelSettingsModalProps {
  isOpen: boolean
  onClose: () => void
  onConfigSaved?: () => void
}

type ProviderKey = 'openai' | 'gemini' | 'deepseek' | 'openrouter'

interface ProviderMeta {
  id: ProviderKey
  name: string
  defaultModel: string
  placeholderModel: string
  keyPrefix: string
}

const PROVIDERS: ProviderMeta[] = [
  { id: 'openai', name: 'OpenAI', defaultModel: 'gpt-4o', placeholderModel: 'gpt-4o ou gpt-4o-mini', keyPrefix: 'sk-...' },
  { id: 'gemini', name: 'Gemini', defaultModel: 'gemini-2.5-flash', placeholderModel: 'gemini-2.5-flash ou gemini-1.5-pro', keyPrefix: 'AIza...' },
  { id: 'deepseek', name: 'DeepSeek', defaultModel: 'deepseek-chat', placeholderModel: 'deepseek-chat ou deepseek-reasoner', keyPrefix: 'sk-...' },
  { id: 'openrouter', name: 'OpenRouter', defaultModel: 'google/gemini-2.5-flash', placeholderModel: 'google/gemini-2.5-flash ou anthropic/claude-3.5-sonnet', keyPrefix: 'sk-or-v1-...' }
]

export const AiModelSettingsModal: React.FC<AiModelSettingsModalProps> = ({
  isOpen,
  onClose,
  onConfigSaved
}) => {
  const [activeProvider, setActiveProvider] = useState<ProviderKey>('openrouter')
  const [models, setModels] = useState<Record<ProviderKey, string>>({
    openrouter: 'google/gemini-2.5-flash',
    openai: 'gpt-4o',
    gemini: 'gemini-2.5-flash',
    deepseek: 'deepseek-chat'
  })
  const [multimodalMap, setMultimodalMap] = useState<Record<ProviderKey, boolean>>({
    openrouter: true,
    openai: true,
    gemini: true,
    deepseek: false
  })
  const [hasKeyMap, setHasKeyMap] = useState<Record<ProviderKey, boolean>>({
    openrouter: false,
    openai: false,
    gemini: false,
    deepseek: false
  })

  const [inputKey, setInputKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Load existing credentials and provider configurations from Electron safeStorage
  const loadStoredConfigs = async () => {
    if (!window.electronAPI?.aiGetAllConfigs) return

    try {
      const data = await window.electronAPI.aiGetAllConfigs()
      if (data.activeProvider && ['openai', 'gemini', 'deepseek', 'openrouter'].includes(data.activeProvider)) {
        setActiveProvider(data.activeProvider as ProviderKey)
      }

      const newModels = { ...models }
      const newMultimodal = { ...multimodalMap }
      const newHasKeys = { ...hasKeyMap }

      for (const [pKey, info] of Object.entries(data.providers || {})) {
        const pk = pKey as ProviderKey
        if (info.model) newModels[pk] = info.model
        newMultimodal[pk] = !!info.multimodal
        newHasKeys[pk] = !!info.hasKey
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

  const currentProviderMeta = PROVIDERS.find(p => p.id === activeProvider) || PROVIDERS[3]
  const currentModel = models[activeProvider] ?? currentProviderMeta.defaultModel
  const currentMultimodal = multimodalMap[activeProvider] ?? true
  const hasKey = hasKeyMap[activeProvider] ?? false

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

  const handleSave = async () => {
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

  return (
    <>
      {/* Semi-transparent Backdrop with subtle blur */}
      <div
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] transition-opacity"
        onClick={onClose}
      />

      {/* Modal Dialog Card matching the user's reference design */}
      <div
        className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[420px] max-w-[95vw] bg-[#0c0d10] border border-zinc-800/90 rounded-2xl shadow-2xl p-5 space-y-4 text-xs text-zinc-300 select-none animate-in fade-in zoom-in-95 duration-150"
        onClick={e => e.stopPropagation()}
      >
        {/* Header matching reference */}
        <div className="flex items-center justify-between pb-1">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[var(--accent)]/10 border border-[var(--accent)]/30 flex items-center justify-center text-[var(--accent)] shadow-sm">
              <Cpu className="w-4 h-4 text-[var(--accent)]" />
            </div>
            <h2 className="text-sm font-bold text-zinc-100 tracking-tight">
              Provedor & Modelo LLM
            </h2>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-[var(--accent)] tracking-wider uppercase">
              {activeProvider}
            </span>
            <button
              onClick={onClose}
              className="p-1 rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 transition-colors cursor-pointer"
              title="Fechar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 2x2 Provider Selector Grid */}
        <div className="grid grid-cols-2 gap-2">
          {PROVIDERS.map(p => {
            const isSelected = p.id === activeProvider
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => handleProviderSelect(p.id)}
                className={`flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-[#15171d] border border-[var(--accent)] text-[var(--accent)] font-semibold shadow-sm'
                    : 'bg-[#121317] border border-zinc-800/80 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
                }`}
              >
                <span>{p.name}</span>
                {isSelected && (
                  <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
                )}
              </button>
            )
          })}
        </div>

        {/* Section: Modelo de IA (Free Text Input with Clear Button) */}
        <div className="space-y-1.5">
          <label className="block text-zinc-400 text-[11px] font-medium">
            Modelo de IA
          </label>
          <div className="relative flex items-center">
            <input
              type="text"
              value={currentModel}
              onChange={e => handleModelChange(e.target.value)}
              placeholder={currentProviderMeta.placeholderModel}
              className="w-full bg-[#121317] border border-zinc-800 focus:border-[var(--accent)]/80 focus:ring-1 focus:ring-[var(--accent)]/40 rounded-xl px-3 py-2.5 text-zinc-100 font-mono text-xs placeholder-zinc-600 transition-all outline-none pr-8"
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
              <span>Chave de API</span>
            </label>
            <div>
              {hasKey ? (
                <span className="text-emerald-400 font-semibold text-[11px] flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  Configurada
                </span>
              ) : (
                <span className="text-zinc-500 text-[11px]">
                  Não configurada
                </span>
              )}
            </div>
          </div>

          <div className="relative flex items-center">
            <input
              type={showKey ? 'text' : 'password'}
              value={inputKey}
              onChange={e => {
                setInputKey(e.target.value)
                setSaveSuccess(false)
              }}
              placeholder={hasKey ? '••••••••••••••••••••••••••••••••' : `Insira sua chave (${currentProviderMeta.keyPrefix})`}
              className="w-full bg-[#121317] border border-zinc-800 focus:border-[var(--accent)]/80 focus:ring-1 focus:ring-[var(--accent)]/40 rounded-xl px-3 py-2.5 text-zinc-100 font-mono text-xs placeholder-zinc-600 transition-all outline-none pr-16"
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
          <div className="flex items-center gap-1 text-[10px] text-zinc-500 pt-0.5">
            <Lock className="w-3 h-3 text-emerald-500/80 shrink-0" />
            <span>Criptografia de hardware segura (Windows DPAPI / safeStorage).</span>
          </div>
        </div>

        {/* Concentric Card: Modelo Multimodal */}
        <div className="bg-[#121317] border border-zinc-800/80 rounded-2xl p-3.5 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-zinc-800/80 border border-zinc-700/50 flex items-center justify-center text-[var(--accent)]">
                <Mic className="w-4 h-4 text-emerald-400" />
              </div>
              <span className="font-semibold text-zinc-200 text-xs">
                Modelo Multimodal
              </span>
            </div>

            {/* Pill Switch Toggle */}
            <button
              type="button"
              onClick={handleMultimodalToggle}
              className={`w-11 h-6 rounded-full p-0.5 transition-colors cursor-pointer flex items-center ${
                currentMultimodal
                  ? 'bg-emerald-500 justify-end'
                  : 'bg-zinc-700 justify-start'
              }`}
              title="Ativar/desativar suporte multimodal"
            >
              <div className="w-5 h-5 rounded-full bg-zinc-950 shadow-md transition-transform" />
            </button>
          </div>

          {/* Sub-card badge */}
          <div
            className={`rounded-xl px-3 py-2 flex items-center gap-2 text-[11px] transition-colors border ${
              currentMultimodal
                ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-400 font-medium'
                : 'bg-zinc-900/60 border-zinc-800 text-zinc-400'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 shrink-0" />
            <span>
              {currentMultimodal
                ? 'Processamento nativo ativo'
                : 'Processamento textual padrão'}
            </span>
          </div>
        </div>

        {/* Feedback Alerts */}
        {saveSuccess && (
          <div className="p-2.5 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 text-xs flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Configurações salvas e ativas com sucesso!</span>
          </div>
        )}

        {errorMessage && (
          <div className="p-2.5 rounded-xl bg-red-950/40 border border-red-500/40 text-red-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Footer Actions */}
        <div className="pt-2 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-zinc-800/80 hover:bg-zinc-750 text-zinc-300 text-xs font-medium transition-colors cursor-pointer"
          >
            Fechar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="px-5 py-2 rounded-xl bg-[var(--accent)] hover:opacity-90 disabled:opacity-50 text-zinc-950 font-bold text-xs transition-all shadow-md shadow-black/40 cursor-pointer flex items-center gap-1.5"
          >
            {isSaving ? 'Salvando...' : 'Salvar Alterações'}
          </button>
        </div>
      </div>
    </>
  )
}
