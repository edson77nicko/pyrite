import React, { useState, useRef, useEffect, useMemo } from 'react'
import { icons, Search, X, Ban, CheckCircle2 } from 'lucide-react'

// Selected popular icons prominently highlighted at the top
const POPULAR_ICON_NAMES = [
  'CheckCircle2',
  'Flame',
  'Sparkles',
  'Rocket',
  'Target',
  'Star',
  'Zap',
  'Clock',
  'Calendar',
  'Briefcase',
  'Flag',
  'Heart',
  'Sun',
  'Folder',
  'ListTodo',
  'Layers',
  'CodeXml',
  'Terminal',
  'Database',
  'Globe',
  'Cpu',
  'DollarSign',
  'Users',
  'Palette'
]

export interface IconCategory {
  id: string
  label: string
}

export const ICON_CATEGORIES: IconCategory[] = [
  { id: 'all', label: 'Todos' },
  { id: 'popular', label: 'Populares' },
  { id: 'work', label: 'Trabalho' },
  { id: 'tech', label: 'Tecnologia' },
  { id: 'business', label: 'Negócios' },
  { id: 'design', label: 'Design' },
  { id: 'comm', label: 'Comunicação' }
]

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  work: [
    'briefcase', 'calendar', 'clock', 'timer', 'watch', 'file', 'folder', 'archive',
    'bookmark', 'check', 'clipboard', 'list', 'task', 'todo', 'target', 'milestone',
    'flag', 'pin', 'note', 'presentation', 'paperclip', 'table', 'sheet', 'kanban',
    'workflow', 'inbox', 'award', 'trophy'
  ],
  tech: [
    'code', 'terminal', 'cpu', 'database', 'server', 'network', 'wifi', 'cloud',
    'git', 'branch', 'bug', 'chip', 'harddrive', 'keyboard', 'laptop', 'monitor',
    'smartphone', 'router', 'cable', 'bot', 'robot', 'sparkles', 'command', 'globe',
    'link', 'shield', 'lock', 'key', 'wrench'
  ],
  business: [
    'dollar', 'euro', 'pound', 'bitcoin', 'coins', 'creditcard', 'wallet', 'receipt',
    'bank', 'vault', 'chart', 'graph', 'trend', 'percent', 'calculator', 'store',
    'shopping', 'cart', 'bag', 'tag', 'package', 'box', 'truck', 'handshake'
  ],
  design: [
    'palette', 'brush', 'pen', 'pencil', 'image', 'camera', 'video', 'film', 'play',
    'music', 'audio', 'volume', 'speaker', 'headphones', 'mic', 'sliders', 'crop',
    'layers', 'layout', 'grid', 'eye', 'circle', 'square', 'star', 'sun', 'moon',
    'heart', 'wand'
  ],
  comm: [
    'user', 'group', 'message', 'chat', 'mail', 'send', 'bell', 'phone', 'share',
    'megaphone', 'at'
  ]
}

// Portuguese keyword expansions for intuitive searching
const PT_KEYWORD_MAP: Record<string, string[]> = {
  fogo: ['flame', 'fire'],
  urgente: ['flame', 'alert', 'siren'],
  sucesso: ['check', 'checkcircle', 'circlecheck'],
  feito: ['check', 'checkcircle', 'circlecheck'],
  concluido: ['check', 'checkcircle', 'circlecheck'],
  ok: ['check', 'circlecheck'],
  estrela: ['star'],
  ia: ['sparkles', 'brain', 'bot'],
  brilho: ['sparkles'],
  magia: ['sparkles', 'wand'],
  foguete: ['rocket'],
  lancamento: ['rocket'],
  meta: ['target', 'milestone', 'flag'],
  alvo: ['target'],
  raio: ['zap', 'bolt'],
  energia: ['zap', 'battery'],
  relogio: ['clock', 'watch', 'timer'],
  tempo: ['clock', 'calendar', 'hourglass'],
  data: ['calendar'],
  agenda: ['calendar'],
  trabalho: ['briefcase', 'laptop'],
  negocio: ['briefcase', 'building', 'dollar'],
  pasta: ['folder'],
  arquivo: ['file', 'folder', 'archive'],
  nota: ['filetext', 'notepad', 'notebook'],
  documento: ['file', 'filetext'],
  tag: ['tag', 'bookmark'],
  rotulo: ['tag', 'bookmark', 'badge'],
  bandeira: ['flag'],
  coracao: ['heart'],
  favorito: ['heart', 'star', 'bookmark'],
  sol: ['sun'],
  lua: ['moon'],
  codigo: ['code', 'codexml', 'terminal'],
  dev: ['code', 'terminal', 'cpu', 'bug'],
  banco: ['database', 'vault', 'bank'],
  dados: ['database'],
  mundo: ['globe', 'earth'],
  web: ['globe', 'link'],
  dinheiro: ['dollar', 'coins', 'creditcard', 'wallet'],
  moeda: ['dollar', 'coins', 'circle-dollar'],
  pagamento: ['creditcard', 'wallet', 'dollar'],
  usuario: ['user', 'users'],
  pessoa: ['user'],
  time: ['users', 'usergroup'],
  equipe: ['users'],
  chat: ['message', 'messagesquare'],
  mensagem: ['message', 'mail', 'send'],
  email: ['mail'],
  som: ['volume', 'music', 'speaker'],
  musica: ['music'],
  foto: ['camera', 'image'],
  imagem: ['image'],
  video: ['video', 'film'],
  camera: ['camera'],
  design: ['palette', 'pentool', 'brush'],
  arte: ['palette'],
  cor: ['palette'],
  config: ['settings', 'sliders', 'cog'],
  engrenagem: ['cog', 'settings'],
  ajuste: ['sliders', 'settings'],
  aviso: ['alert', 'bell'],
  alerta: ['alert', 'trianglealert'],
  sino: ['bell'],
  notificacao: ['bell'],
  seguranca: ['shield', 'lock', 'key'],
  chave: ['key'],
  cadeado: ['lock'],
  ajuda: ['helpcircle', 'lifebuoy'],
  suporte: ['lifebuoy', 'headset', 'helpcircle'],
  lixeira: ['trash', 'trash2'],
  apagar: ['trash', 'x'],
  excluir: ['trash']
}

// Retrieve all available icon names from lucide-react once
const ALL_LUCIDE_NAMES = Object.keys(icons).filter(key => {
  return typeof (icons as any)[key] === 'object' || typeof (icons as any)[key] === 'function'
})

/** Dynamically render any icon from the 1,800+ Lucide icons */
export const renderDynamicIcon = (
  name?: string,
  className = 'w-4 h-4',
  style?: React.CSSProperties
): React.ReactNode => {
  if (!name) return <CheckCircle2 className={className} style={style} />
  const Component = (icons as Record<string, any>)[name]
  if (Component) {
    return <Component className={className} style={style} />
  }
  const lowerName = name.toLowerCase()
  const foundKey = ALL_LUCIDE_NAMES.find(k => k.toLowerCase() === lowerName)
  if (foundKey) {
    const FallbackComp = (icons as any)[foundKey]
    if (FallbackComp) return <FallbackComp className={className} style={style} />
  }
  return <CheckCircle2 className={className} style={style} />
}

interface IconPickerPopoverProps {
  selectedIcon?: string
  onSelectIcon: (iconName: string) => void
  onRemoveIcon?: () => void
  onClose: () => void
  align?: 'left' | 'right'
}

export const IconPickerPopover: React.FC<IconPickerPopoverProps> = ({
  selectedIcon,
  onSelectIcon,
  onRemoveIcon,
  onClose,
  align = 'left'
}) => {
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState<string>('all')
  const [displayLimit, setDisplayLimit] = useState(120)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    inputRef.current?.focus()

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }

    document.addEventListener('mousedown', handleClickOutside)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  const cleanSearch = search.trim().toLowerCase()

  // Reset pagination when searching or changing category
  useEffect(() => {
    setDisplayLimit(120)
    if (scrollRef.current) scrollRef.current.scrollTop = 0
  }, [search, activeCategory])

  const categoryBaseIcons = useMemo(() => {
    if (activeCategory === 'all') return ALL_LUCIDE_NAMES
    if (activeCategory === 'popular') return POPULAR_ICON_NAMES
    const words = CATEGORY_KEYWORDS[activeCategory]
    if (!words) return ALL_LUCIDE_NAMES

    return ALL_LUCIDE_NAMES.filter(name => {
      const lower = name.toLowerCase()
      return words.some(w => lower.includes(w))
    })
  }, [activeCategory])

  const filteredIconNames = useMemo(() => {
    if (!cleanSearch) return categoryBaseIcons

    // Expand search terms with Portuguese synonym translations
    const expandedTerms = [cleanSearch]
    Object.entries(PT_KEYWORD_MAP).forEach(([ptWord, enTerms]) => {
      if (cleanSearch.includes(ptWord) || ptWord.includes(cleanSearch)) {
        expandedTerms.push(...enTerms)
      }
    })

    return categoryBaseIcons.filter(name => {
      const lower = name.toLowerCase()
      return expandedTerms.some(term => lower.includes(term))
    })
  }, [cleanSearch, categoryBaseIcons])

  const displayedIcons = useMemo(() => {
    return filteredIconNames.slice(0, displayLimit)
  }, [filteredIconNames, displayLimit])

  const hasMore = displayedIcons.length < filteredIconNames.length

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 160 && hasMore) {
      setDisplayLimit(prev => Math.min(prev + 120, filteredIconNames.length))
    }
  }

  return (
    <div
      ref={containerRef}
      onClick={e => e.stopPropagation()}
      className={`absolute top-full mt-1.5 z-50 w-84 rounded-2xl bg-[#141417] border border-zinc-700/80 shadow-2xl overflow-hidden flex flex-col text-xs animate-in fade-in zoom-in-95 duration-100 ${
        align === 'right' ? 'right-0' : 'left-0'
      }`}
    >
      {/* Header Search */}
      <div className="p-2.5 border-b border-zinc-800 bg-[#101013] flex items-center gap-2">
        <Search className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
        <input
          ref={inputRef}
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Pesquisar entre mais de 1.800 ícones..."
          className="flex-1 min-w-0 bg-transparent text-zinc-200 placeholder-zinc-500 text-xs focus:outline-none"
        />
        {search ? (
          <button
            type="button"
            onClick={() => setSearch('')}
            className="text-zinc-500 hover:text-zinc-300 cursor-pointer p-0.5"
            title="Limpar pesquisa"
          >
            <X className="w-3 h-3" />
          </button>
        ) : null}
      </div>

      {/* Categorias (Filtro por Abas) */}
      <div className="px-2 py-1.5 border-b border-zinc-800/80 bg-[#121215] flex items-center gap-1 overflow-x-auto no-scrollbar">
        {ICON_CATEGORIES.map(cat => {
          const isActive = activeCategory === cat.id
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => setActiveCategory(cat.id)}
              className={`px-2 py-0.5 rounded-full text-[10.5px] font-medium whitespace-nowrap transition-all cursor-pointer ${
                isActive
                  ? 'bg-zinc-800 text-[var(--accent,#c59b27)] border border-zinc-700 shadow-xs'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50 border border-transparent'
              }`}
            >
              {cat.label}
            </button>
          )
        })}
      </div>

      {/* Remove Icon Action Bar */}
      {onRemoveIcon && selectedIcon && (
        <div className="px-3 py-1.5 border-b border-zinc-800/60 bg-[#161619] flex items-center justify-between">
          <span className="text-[11px] text-zinc-400 flex items-center gap-1.5">
            <span>Ícone atual:</span>
            <span className="text-zinc-200 font-medium flex items-center gap-1">
              {renderDynamicIcon(selectedIcon, 'w-3.5 h-3.5 text-[var(--accent,#c59b27)]')}
              {selectedIcon}
            </span>
          </span>
          <button
            type="button"
            onClick={() => {
              onRemoveIcon()
              onClose()
            }}
            className="text-[11px] text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 px-2 py-0.5 rounded transition-colors cursor-pointer flex items-center gap-1"
          >
            <Ban className="w-3 h-3" />
            <span>Remover</span>
          </button>
        </div>
      )}

      {/* Icons List Grid Container */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="max-h-72 overflow-y-auto p-2.5 custom-chat-scrollbar space-y-3"
      >
        {/* Popular / Mais usados em evidência quando em 'all' e sem busca */}
        {!cleanSearch && activeCategory === 'all' && (
          <div>
            <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider px-1 pb-1.5">
              Mais Usados
            </div>
            <div className="grid grid-cols-6 gap-1">
              {POPULAR_ICON_NAMES.map(name => {
                const isCur = selectedIcon?.toLowerCase() === name.toLowerCase()
                return (
                  <button
                    key={`pop_${name}`}
                    type="button"
                    onClick={() => {
                      onSelectIcon(name)
                      onClose()
                    }}
                    className={`h-9 flex items-center justify-center rounded-lg transition-all cursor-pointer relative group/icon ${
                      isCur
                        ? 'bg-zinc-800 ring-1 ring-[var(--accent,#c59b27)] text-white shadow-xs'
                        : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80 hover:scale-105'
                    }`}
                    style={isCur ? { color: 'var(--accent, #c59b27)' } : undefined}
                    title={name}
                  >
                    {renderDynamicIcon(name, 'w-4 h-4')}
                    {isCur && (
                      <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-[var(--accent,#c59b27)]" />
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Categorized Library Grid */}
        <div>
          <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider px-1 pb-1.5 flex items-center justify-between">
            <span>
              {activeCategory === 'all'
                ? 'Biblioteca Completa'
                : ICON_CATEGORIES.find(c => c.id === activeCategory)?.label}
            </span>
            <span className="text-zinc-600 font-mono">
              {filteredIconNames.length} {filteredIconNames.length === 1 ? 'ícone' : 'ícones'}
            </span>
          </div>

          {filteredIconNames.length === 0 ? (
            <div className="py-8 text-center text-zinc-500 text-xs">
              Nenhum ícone encontrado para "{search}".
            </div>
          ) : (
            <div className="grid grid-cols-6 gap-1">
              {displayedIcons.map(name => {
                const isCur = selectedIcon?.toLowerCase() === name.toLowerCase()
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => {
                      onSelectIcon(name)
                      onClose()
                    }}
                    className={`h-9 flex items-center justify-center rounded-lg transition-all cursor-pointer relative group/icon ${
                      isCur
                        ? 'bg-zinc-800 ring-1 ring-[var(--accent,#c59b27)] text-white shadow-xs'
                        : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80 hover:scale-105'
                    }`}
                    style={isCur ? { color: 'var(--accent, #c59b27)' } : undefined}
                    title={name}
                  >
                    {renderDynamicIcon(name, 'w-4 h-4')}
                    {isCur && (
                      <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-[var(--accent,#c59b27)]" />
                    )}
                  </button>
                )
              })}
            </div>
          )}

          {hasMore && (
            <div className="pt-2 text-center">
              <button
                type="button"
                onClick={() => setDisplayLimit(prev => Math.min(prev + 120, filteredIconNames.length))}
                className="text-[11px] text-zinc-400 hover:text-zinc-200 px-3 py-1 rounded-md bg-zinc-800/60 hover:bg-zinc-800 transition-colors cursor-pointer"
              >
                Carregar mais ({filteredIconNames.length - displayedIcons.length} restantes)...
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default IconPickerPopover
