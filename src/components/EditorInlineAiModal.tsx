import React, { useState, useEffect, useRef } from 'react'
import {
  Sparkles,
  Wand2,
  FileText,
  PlusCircle,
  CheckCheck,
  ListOrdered,
  Languages,
  CornerDownLeft,
  Loader2,
  Check,
  X,
  RotateCcw
} from 'lucide-react'

export interface EditorInlineAiModalProps {
  isOpen: boolean
  targetText: string
  position: { top: number; left: number }
  onApply: (generatedText: string, action: 'replace' | 'insert-below') => void
  onClose: () => void
}

const PRESET_ACTIONS = [
  {
    id: 'improve',
    label: 'Melhorar escrita',
    icon: Wand2,
    instruction: 'Reescreva e melhore este texto, mantendo a mensagem original, tornando a linguagem fluida, elegante e profissional em português.'
  },
  {
    id: 'summarize',
    label: 'Resumir',
    icon: FileText,
    instruction: 'Resuma os pontos principais do texto a seguir de forma concisa e direta em português.'
  },
  {
    id: 'expand',
    label: 'Expandir & Detalhar',
    icon: PlusCircle,
    instruction: 'Expanda as ideias do texto a seguir, adicionando explicações claras, profundidade e exemplos práticos.'
  },
  {
    id: 'fix',
    label: 'Corrigir ortografia',
    icon: CheckCheck,
    instruction: 'Corrija erros de concordância, gramática, pontuação e ortografia no texto a seguir sem alterar o sentido.'
  },
  {
    id: 'bullets',
    label: 'Gerar tópicos',
    icon: ListOrdered,
    instruction: 'Converta as ideias centrais do texto a seguir em uma lista organizada de tópicos com marcadores em Markdown.'
  },
  {
    id: 'translate',
    label: 'Traduzir para Inglês',
    icon: Languages,
    instruction: 'Traduza o texto a seguir para o inglês de forma natural e fluida.'
  }
]

export const EditorInlineAiModal: React.FC<EditorInlineAiModalProps> = ({
  isOpen,
  targetText,
  position,
  onApply,
  onClose
}) => {
  const [customPrompt, setCustomPrompt] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [activeProvider, setActiveProvider] = useState<string>('openrouter')
  const [activeModel, setActiveModel] = useState<string>('google/gemini-2.5-flash')
  const inputRef = useRef<HTMLInputElement>(null)
  const modalRef = useRef<HTMLDivElement>(null)

  // Load configured AI provider & model
  useEffect(() => {
    if (!isOpen) return
    const loadAiConfig = async () => {
      if (window.electronAPI?.aiGetAllConfigs) {
        try {
          const cfg = await window.electronAPI.aiGetAllConfigs()
          const p = (cfg.activeProvider || 'openrouter').toLowerCase()
          setActiveProvider(p)
          const pConfig = cfg.providers?.[p]
          if (pConfig?.model) {
            setActiveModel(pConfig.model)
          }
        } catch (err) {
          console.error('Failed to load AI configs in Inline AI modal:', err)
        }
      }
    }
    loadAiConfig()
    setResult(null)
    setErrorMessage(null)
    setCustomPrompt('')

    // Focus input on open
    setTimeout(() => {
      inputRef.current?.focus()
    }, 50)
  }, [isOpen])

  // Click outside and escape handling
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    const handleClickOutside = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  const handleGenerate = async (instruction: string) => {
    if (isGenerating) return
    setIsGenerating(true)
    setErrorMessage(null)

    try {
      if (!window.electronAPI?.aiChat) {
        throw new Error('A integração com a IA do Electron não está disponível.')
      }

      const promptPayload = targetText.trim()
        ? `${instruction}\n\nTexto original:\n"""\n${targetText.trim()}\n"""\n\nRetorne apenas o texto gerado final em Markdown limpo, sem enrolação ou mensagens como 'Aqui está o texto'.`
        : `${instruction}\n\nRetorne em Markdown limpo e objetivo.`

      const response = await window.electronAPI.aiChat({
        provider: activeProvider,
        model: activeModel,
        messages: [
          {
            role: 'system',
            content: 'Você é o assistente de escrita inteligente do Pyrite. Escreva com extrema clareza, objetividade e fluidez em Markdown limpo.'
          },
          {
            role: 'user',
            content: promptPayload
          }
        ],
        temperature: 0.6
      })

      if (response.success && response.text) {
        setResult(response.text.trim())
      } else {
        setErrorMessage(response.error || 'A IA não retornou resposta. Verifique suas chaves de API nas configurações de IA.')
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Erro ao processar solicitação com a IA.')
    } finally {
      setIsGenerating(false)
    }
  }

  // Adjust coordinates to avoid viewport boundaries
  const modalWidth = 460
  const adjustedLeft = Math.max(16, Math.min(position.left, window.innerWidth - modalWidth - 24))
  const adjustedTop = Math.max(16, Math.min(position.top, window.innerHeight - 380))

  return (
    <div
      ref={modalRef}
      style={{
        position: 'fixed',
        top: `${adjustedTop}px`,
        left: `${adjustedLeft}px`,
        width: `${modalWidth}px`,
        zIndex: 10000
      }}
      className="bg-[#141418] border border-amber-500/30 rounded-2xl shadow-2xl backdrop-blur-xl p-3 text-zinc-200 select-none shadow-black/90 animate-in fade-in zoom-in-95 duration-150"
    >
      {/* Header with Model badge */}
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-zinc-800/80">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded-lg bg-amber-500/15 text-amber-400 border border-amber-500/30">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-semibold text-zinc-100 flex items-center gap-1.5">
              <span>Pyrite AI Inline</span>
              <span className="text-[10px] font-normal text-amber-400/80 bg-amber-950/40 px-1.5 py-0.5 rounded border border-amber-800/40">
                {activeModel.split('/').pop() || activeModel}
              </span>
            </h4>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 text-zinc-500 hover:text-zinc-300 rounded-lg hover:bg-zinc-800 transition-colors cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Target Preview if text was selected */}
      {targetText.trim() && !result && (
        <div className="mb-2.5 px-2.5 py-1.5 rounded-lg bg-zinc-900/60 border border-zinc-800/70 text-[11px] text-zinc-400 line-clamp-2 italic">
          "{targetText.trim()}"
        </div>
      )}

      {/* Result View */}
      {result ? (
        <div className="space-y-2.5">
          <div className="max-h-56 overflow-y-auto px-3 py-2 bg-zinc-950/80 border border-zinc-800/90 rounded-xl text-xs text-zinc-200 leading-relaxed font-sans whitespace-pre-wrap select-text">
            {result}
          </div>

          <div className="flex items-center justify-between gap-2 pt-1 border-t border-zinc-800/80">
            <button
              type="button"
              onClick={() => setResult(null)}
              className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-200 px-2 py-1 rounded-lg hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Tentar outro prompt</span>
            </button>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => onApply(result, 'insert-below')}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700/80 transition-colors cursor-pointer"
              >
                Inserir Abaixo
              </button>
              <button
                type="button"
                onClick={() => onApply(result, 'replace')}
                className="flex items-center gap-1 px-3 py-1 rounded-lg text-[11px] font-semibold bg-amber-500 hover:bg-amber-400 text-zinc-950 transition-colors cursor-pointer shadow-sm shadow-amber-500/20"
              >
                <Check className="w-3.5 h-3.5" />
                <span>{targetText.trim() ? 'Substituir' : 'Inserir'}</span>
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* Prompt Input & Quick Actions */
        <div className="space-y-2.5">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (customPrompt.trim()) handleGenerate(customPrompt.trim())
            }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-zinc-950/80 border border-zinc-800 focus-within:border-amber-500/50 transition-colors"
          >
            <input
              ref={inputRef}
              type="text"
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              disabled={isGenerating}
              placeholder={targetText.trim() ? "Instrua a IA sobre este trecho..." : "Peça à IA para escrever algo..."}
              className="flex-1 bg-transparent text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={isGenerating || !customPrompt.trim()}
              className="p-1 rounded-lg bg-amber-500 text-zinc-950 hover:bg-amber-400 disabled:opacity-40 disabled:hover:bg-amber-500 transition-colors cursor-pointer"
            >
              {isGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CornerDownLeft className="w-3.5 h-3.5" />}
            </button>
          </form>

          {errorMessage && (
            <div className="px-2.5 py-1.5 rounded-lg bg-red-950/40 border border-red-800/60 text-[11px] text-red-300">
              {errorMessage}
            </div>
          )}

          {isGenerating ? (
            <div className="py-6 flex flex-col items-center justify-center gap-2 text-zinc-400">
              <Loader2 className="w-5 h-5 animate-spin text-amber-400" />
              <span className="text-xs">A IA está gerando o texto...</span>
            </div>
          ) : (
            <div className="space-y-1">
              <div className="text-[10px] uppercase font-semibold tracking-wider text-zinc-500 px-1">
                Ações Rápidas
              </div>
              <div className="grid grid-cols-2 gap-1">
                {PRESET_ACTIONS.map(action => {
                  const Icon = action.icon
                  return (
                    <button
                      key={action.id}
                      type="button"
                      onClick={() => handleGenerate(action.instruction)}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-zinc-900/50 hover:bg-zinc-800/80 border border-zinc-800/60 hover:border-zinc-700/80 text-left text-zinc-300 hover:text-white transition-all cursor-pointer text-[11px]"
                    >
                      <Icon className="w-3.5 h-3.5 text-amber-400/90 shrink-0" />
                      <span className="truncate">{action.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
