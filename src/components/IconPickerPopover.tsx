import React, { useState, useRef, useEffect, useMemo } from 'react'
import {
  Search,
  X,
  CheckCircle2,
  Circle,
  Square,
  CheckSquare,
  Sparkles,
  Star,
  Bookmark,
  Pin,
  Tag,
  Flag,
  Heart,
  Sun,
  Moon,
  Zap,
  Flame,
  Rocket,
  Target,
  Trophy,
  Briefcase,
  Calendar,
  Clock,
  Compass,
  FileText,
  Layers,
  LayoutGrid,
  ListTodo,
  Milestone,
  Presentation,
  TrendingUp,
  Terminal,
  CodeXml,
  Cpu,
  Database,
  GitBranch,
  Globe,
  Server,
  Smartphone,
  Laptop,
  Bug,
  Wrench,
  Shield,
  Key,
  DollarSign,
  CreditCard,
  BarChart3,
  PieChart,
  Building2,
  ShoppingBag,
  Receipt,
  Wallet,
  Percent,
  MessageSquare,
  Send,
  Users,
  User,
  Mail,
  Phone,
  Bell,
  Megaphone,
  Share2,
  AtSign,
  Palette,
  Image,
  Camera,
  Video,
  Music,
  PenTool,
  Sliders,
  Eye,
  AlertCircle,
  AlertTriangle,
  Info,
  HelpCircle,
  Activity,
  LifeBuoy,
  Crosshair,
  Folder,
  FolderKanban,
  Ban
} from 'lucide-react'

export interface IconDefinition {
  name: string
  label: string
  category: 'popular' | 'general' | 'work' | 'tech' | 'business' | 'comm' | 'design'
  keywords: string[]
  component: React.ComponentType<{ className?: string; style?: React.CSSProperties }>
}

export const ICON_CATALOG: IconDefinition[] = [
  // Mais usados / Populares
  { name: 'CheckCircle2', label: 'Concluído', category: 'popular', keywords: ['check', 'sucesso', 'feito', 'ok'], component: CheckCircle2 },
  { name: 'Flame', label: 'Fogo / Urgente', category: 'popular', keywords: ['fogo', 'urgente', 'quente', 'chama'], component: Flame },
  { name: 'Sparkles', label: 'Brilho / IA', category: 'popular', keywords: ['ia', 'brilho', 'magia', 'novo', 'especial'], component: Sparkles },
  { name: 'Rocket', label: 'Foguete / Lançamento', category: 'popular', keywords: ['foguete', 'lancamento', 'startup', 'agil'], component: Rocket },
  { name: 'Star', label: 'Estrela / Destaque', category: 'popular', keywords: ['estrela', 'favorito', 'destaque', 'nota'], component: Star },
  { name: 'Target', label: 'Alvo / Meta', category: 'popular', keywords: ['alvo', 'meta', 'objetivo', 'foco'], component: Target },
  { name: 'Zap', label: 'Raio / Rápido', category: 'popular', keywords: ['raio', 'energia', 'rapido', 'eletrico'], component: Zap },
  { name: 'Flag', label: 'Bandeira / Prioridade', category: 'popular', keywords: ['bandeira', 'marco', 'prioridade'], component: Flag },
  { name: 'Calendar', label: 'Calendário / Prazo', category: 'popular', keywords: ['calendario', 'data', 'agenda', 'prazo', 'evento'], component: Calendar },
  { name: 'FolderKanban', label: 'Quadro / Projeto', category: 'popular', keywords: ['projeto', 'quadro', 'kanban', 'pasta'], component: FolderKanban },
  { name: 'Bookmark', label: 'Marcador', category: 'popular', keywords: ['salvo', 'leitura', 'marcador'], component: Bookmark },
  { name: 'CodeXml', label: 'Código / Dev', category: 'popular', keywords: ['codigo', 'programacao', 'desenvolvimento', 'tag'], component: CodeXml },

  // Geral & Status
  { name: 'Circle', label: 'Círculo', category: 'general', keywords: ['circulo', 'vazio', 'neutro'], component: Circle },
  { name: 'Square', label: 'Quadrado', category: 'general', keywords: ['quadrado', 'caixa'], component: Square },
  { name: 'CheckSquare', label: 'Caixa de Marcação', category: 'general', keywords: ['tarefa', 'checklist', 'marcado'], component: CheckSquare },
  { name: 'Heart', label: 'Coração', category: 'general', keywords: ['amor', 'favorito', 'curtida', 'saude'], component: Heart },
  { name: 'Pin', label: 'Fixar', category: 'general', keywords: ['fixar', 'pin', 'alfinete'], component: Pin },
  { name: 'Tag', label: 'Etiqueta', category: 'general', keywords: ['tag', 'etiqueta', 'categoria'], component: Tag },
  { name: 'Sun', label: 'Sol', category: 'general', keywords: ['sol', 'dia', 'claro', 'manha'], component: Sun },
  { name: 'Moon', label: 'Lua', category: 'general', keywords: ['lua', 'noite', 'escuro'], component: Moon },
  { name: 'AlertCircle', label: 'Alerta Circular', category: 'general', keywords: ['aviso', 'erro', 'atencao'], component: AlertCircle },
  { name: 'AlertTriangle', label: 'Triângulo de Alerta', category: 'general', keywords: ['perigo', 'cuidado', 'atencao'], component: AlertTriangle },
  { name: 'Info', label: 'Informação', category: 'general', keywords: ['info', 'detalhe', 'ajuda'], component: Info },
  { name: 'HelpCircle', label: 'Dúvida', category: 'general', keywords: ['duvida', 'pergunta', 'faq'], component: HelpCircle },
  { name: 'Activity', label: 'Atividade', category: 'general', keywords: ['pulso', 'saude', 'movimento', 'metrica'], component: Activity },

  // Trabalho & Produtividade
  { name: 'Briefcase', label: 'Maleta / Trabalho', category: 'work', keywords: ['trabalho', 'negocio', 'carreira', 'corporativo'], component: Briefcase },
  { name: 'Clock', label: 'Relógio / Tempo', category: 'work', keywords: ['relogio', 'hora', 'tempo', 'duracao'], component: Clock },
  { name: 'Compass', label: 'Bússola / Direção', category: 'work', keywords: ['bussola', 'direcao', 'guia', 'estrategia'], component: Compass },
  { name: 'FileText', label: 'Documento', category: 'work', keywords: ['arquivo', 'nota', 'texto', 'documento'], component: FileText },
  { name: 'Layers', label: 'Camadas', category: 'work', keywords: ['camadas', 'estrutura', 'niveis'], component: Layers },
  { name: 'LayoutGrid', label: 'Grade / Painel', category: 'work', keywords: ['grade', 'dashboard', 'painel'], component: LayoutGrid },
  { name: 'ListTodo', label: 'Lista de Tarefas', category: 'work', keywords: ['lista', 'checklist', 'afazer'], component: ListTodo },
  { name: 'Milestone', label: 'Marco / Entrega', category: 'work', keywords: ['marco', 'milestone', 'etapa', 'sprint'], component: Milestone },
  { name: 'Presentation', label: 'Apresentação', category: 'work', keywords: ['apresentacao', 'slides', 'reuniao'], component: Presentation },
  { name: 'Trophy', label: 'Troféu / Conquista', category: 'work', keywords: ['trofeu', 'vitoria', 'premio', 'sucesso'], component: Trophy },
  { name: 'Folder', label: 'Pasta', category: 'work', keywords: ['pasta', 'diretorio', 'organizar'], component: Folder },

  // Tecnologia & Dev
  { name: 'Terminal', label: 'Terminal / CLI', category: 'tech', keywords: ['terminal', 'console', 'bash', 'comando'], component: Terminal },
  { name: 'Cpu', label: 'Processador / Hardware', category: 'tech', keywords: ['cpu', 'chip', 'hardware', 'ia'], component: Cpu },
  { name: 'Database', label: 'Banco de Dados', category: 'tech', keywords: ['banco', 'dados', 'sql', 'armazenamento'], component: Database },
  { name: 'GitBranch', label: 'Git / Branch', category: 'tech', keywords: ['git', 'branch', 'versao', 'fluxo'], component: GitBranch },
  { name: 'Globe', label: 'Web / Internet', category: 'tech', keywords: ['web', 'site', 'globo', 'mundo', 'rede'], component: Globe },
  { name: 'Server', label: 'Servidor / Cloud', category: 'tech', keywords: ['servidor', 'cloud', 'nuvem', 'infra'], component: Server },
  { name: 'Smartphone', label: 'Celular / Mobile', category: 'tech', keywords: ['celular', 'mobile', 'smartphone', 'app'], component: Smartphone },
  { name: 'Laptop', label: 'Notebook / Computador', category: 'tech', keywords: ['computador', 'laptop', 'notebook', 'pc'], component: Laptop },
  { name: 'Bug', label: 'Bug / Defeito', category: 'tech', keywords: ['bug', 'defeito', 'erro', 'conserto'], component: Bug },
  { name: 'Wrench', label: 'Ferramenta / Ajuste', category: 'tech', keywords: ['ferramenta', 'ajuste', 'suporte', 'manutencao'], component: Wrench },
  { name: 'Shield', label: 'Segurança / Proteção', category: 'tech', keywords: ['escudo', 'seguranca', 'protecao', 'auth'], component: Shield },
  { name: 'Key', label: 'Chave / Acesso', category: 'tech', keywords: ['chave', 'acesso', 'senha', 'token'], component: Key },

  // Finanças & Negócios
  { name: 'DollarSign', label: 'Cifrão / Dinheiro', category: 'business', keywords: ['dinheiro', 'moeda', 'valor', 'preco', 'lucro'], component: DollarSign },
  { name: 'CreditCard', label: 'Cartão de Crédito', category: 'business', keywords: ['cartao', 'pagamento', 'compra'], component: CreditCard },
  { name: 'TrendingUp', label: 'Crescimento', category: 'business', keywords: ['crescimento', 'alta', 'lucro', 'evolucao'], component: TrendingUp },
  { name: 'BarChart3', label: 'Gráfico de Barras', category: 'business', keywords: ['grafico', 'estatistica', 'relatorio', 'metricas'], component: BarChart3 },
  { name: 'PieChart', label: 'Gráfico de Pizza', category: 'business', keywords: ['pizza', 'grafico', 'divisao', 'proporcao'], component: PieChart },
  { name: 'Building2', label: 'Empresa / Prédio', category: 'business', keywords: ['empresa', 'predio', 'corporativo', 'cliente'], component: Building2 },
  { name: 'ShoppingBag', label: 'Vendas / Sacola', category: 'business', keywords: ['vendas', 'sacola', 'loja', 'ecommerce'], component: ShoppingBag },
  { name: 'Receipt', label: 'Nota / Recibo', category: 'business', keywords: ['recibo', 'nota', 'fatura', 'imposto'], component: Receipt },
  { name: 'Wallet', label: 'Carteira', category: 'business', keywords: ['carteira', 'saldo', 'recursos'], component: Wallet },
  { name: 'Percent', label: 'Porcentagem / Desconto', category: 'business', keywords: ['porcentagem', 'desconto', 'taxa'], component: Percent },

  // Comunicação & Pessoas
  { name: 'MessageSquare', label: 'Mensagem / Chat', category: 'comm', keywords: ['chat', 'mensagem', 'conversa', 'comentario'], component: MessageSquare },
  { name: 'Send', label: 'Enviar / Disparo', category: 'comm', keywords: ['enviar', 'disparo', 'aviao', 'envio'], component: Send },
  { name: 'Users', label: 'Equipe / Usuários', category: 'comm', keywords: ['equipe', 'usuarios', 'time', 'pessoas'], component: Users },
  { name: 'User', label: 'Pessoa / Perfil', category: 'comm', keywords: ['pessoa', 'usuario', 'perfil', 'cliente'], component: User },
  { name: 'Mail', label: 'E-mail', category: 'comm', keywords: ['email', 'correio', 'mensagem'], component: Mail },
  { name: 'Phone', label: 'Telefone', category: 'comm', keywords: ['telefone', 'ligacao', 'contato'], component: Phone },
  { name: 'Bell', label: 'Notificação / Sino', category: 'comm', keywords: ['notificacao', 'aviso', 'sino', 'lembrete'], component: Bell },
  { name: 'Megaphone', label: 'Marketing / Anúncio', category: 'comm', keywords: ['megafone', 'marketing', 'anuncio', 'campanha'], component: Megaphone },
  { name: 'Share2', label: 'Compartilhar', category: 'comm', keywords: ['compartilhar', 'rede', 'social'], component: Share2 },
  { name: 'AtSign', label: 'Menção (@)', category: 'comm', keywords: ['mencao', 'arroba', 'contato'], component: AtSign },

  // Mídia & Design
  { name: 'Palette', label: 'Paleta / Arte', category: 'design', keywords: ['paleta', 'design', 'arte', 'cor', 'estilo'], component: Palette },
  { name: 'Image', label: 'Imagem / Foto', category: 'design', keywords: ['imagem', 'foto', 'banner'], component: Image },
  { name: 'Camera', label: 'Câmera', category: 'design', keywords: ['camera', 'foto', 'captura'], component: Camera },
  { name: 'Video', label: 'Vídeo', category: 'design', keywords: ['video', 'filme', 'gravacao'], component: Video },
  { name: 'Music', label: 'Áudio / Música', category: 'design', keywords: ['audio', 'musica', 'podcast'], component: Music },
  { name: 'PenTool', label: 'Vetor / Ilustração', category: 'design', keywords: ['vetor', 'caneta', 'ilustracao'], component: PenTool },
  { name: 'Sliders', label: 'Controles / Config', category: 'design', keywords: ['controles', 'filtros', 'ajustes'], component: Sliders },
  { name: 'Eye', label: 'Visualização / Olho', category: 'design', keywords: ['olho', 'visao', 'preview', 'ver'], component: Eye },
  { name: 'LifeBuoy', label: 'Suporte', category: 'design', keywords: ['suporte', 'socorro', 'boia'], component: LifeBuoy },
  { name: 'Crosshair', label: 'Precisão', category: 'design', keywords: ['mira', 'precisao', 'foco'], component: Crosshair }
]

const CATEGORIES = [
  { id: 'all', label: 'Todos' },
  { id: 'popular', label: 'Populares' },
  { id: 'work', label: 'Trabalho' },
  { id: 'tech', label: 'Tecnologia' },
  { id: 'business', label: 'Negócios' },
  { id: 'comm', label: 'Comunicação' },
  { id: 'design', label: 'Design' },
  { id: 'general', label: 'Geral' }
]

/** Dynamically render an icon by its name */
export const renderDynamicIcon = (
  name?: string,
  className = 'w-4 h-4',
  style?: React.CSSProperties
): React.ReactNode => {
  if (!name) return <CheckCircle2 className={className} style={style} />
  const found = ICON_CATALOG.find(i => i.name.toLowerCase() === name.toLowerCase())
  if (found) {
    const Component = found.component
    return <Component className={className} style={style} />
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
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

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

  const popularIcons = useMemo(() => {
    return ICON_CATALOG.filter(i => i.category === 'popular')
  }, [])

  const filteredIcons = useMemo(() => {
    return ICON_CATALOG.filter(icon => {
      if (cleanSearch) {
        const matchesName = icon.name.toLowerCase().includes(cleanSearch)
        const matchesLabel = icon.label.toLowerCase().includes(cleanSearch)
        const matchesKeywords = icon.keywords.some(k => k.includes(cleanSearch))
        return matchesName || matchesLabel || matchesKeywords
      }
      if (activeCategory === 'all') return true
      return icon.category === activeCategory
    })
  }, [cleanSearch, activeCategory])

  return (
    <div
      ref={containerRef}
      onClick={e => e.stopPropagation()}
      className={`absolute top-full mt-1.5 z-50 w-80 rounded-2xl bg-[#141417] border border-zinc-700/80 shadow-2xl overflow-hidden flex flex-col text-xs animate-in fade-in zoom-in-95 duration-100 ${
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
          placeholder="Pesquisar ícones (ex: fogo, meta, dev, nota)..."
          className="flex-1 min-w-0 bg-transparent text-zinc-200 placeholder-zinc-500 text-xs focus:outline-none"
        />
        {search ? (
          <button
            type="button"
            onClick={() => setSearch('')}
            className="text-zinc-500 hover:text-zinc-300 cursor-pointer p-0.5"
          >
            <X className="w-3 h-3" />
          </button>
        ) : null}

        {onRemoveIcon && selectedIcon && (
          <button
            type="button"
            onClick={() => {
              onRemoveIcon()
              onClose()
            }}
            className="text-[11px] text-zinc-400 hover:text-rose-400 flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-zinc-800 transition-colors cursor-pointer shrink-0"
            title="Remover ícone personalizado"
          >
            <Ban className="w-3 h-3 text-rose-400" />
            <span>Remover</span>
          </button>
        )}
      </div>

      {/* Category Pills (when not actively searching) */}
      {!cleanSearch && (
        <div className="px-2 pt-2 pb-1 border-b border-zinc-800/60 bg-[#111114] flex items-center gap-1 overflow-x-auto custom-chat-scrollbar shrink-0">
          {CATEGORIES.map(cat => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setActiveCategory(cat.id)}
              className={`px-2 py-0.5 rounded-full text-[10.5px] font-medium whitespace-nowrap transition-colors cursor-pointer ${
                activeCategory === cat.id
                  ? 'bg-zinc-800 text-white shadow-xs'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-850'
              }`}
              style={activeCategory === cat.id ? { color: 'var(--accent, #c59b27)' } : undefined}
            >
              {cat.label}
            </button>
          ))}
        </div>
      )}

      {/* Main Grid View */}
      <div className="max-h-64 overflow-y-auto custom-chat-scrollbar p-2.5 space-y-3">
        {/* Mais Usados / Em Evidência (shown when viewing all categories without search) */}
        {!cleanSearch && activeCategory === 'all' && (
          <div>
            <div className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider px-1 pb-1.5 flex items-center gap-1.5">
              <Sparkles className="w-3 h-3 text-[var(--accent,#c59b27)]" />
              <span>Mais Usados</span>
            </div>
            <div className="grid grid-cols-6 gap-1 bg-[#18181c]/60 p-1.5 rounded-xl border border-zinc-800/60">
              {popularIcons.map(icon => {
                const IconComp = icon.component
                const isCur = selectedIcon?.toLowerCase() === icon.name.toLowerCase()
                return (
                  <button
                    key={`pop_${icon.name}`}
                    type="button"
                    onClick={() => {
                      onSelectIcon(icon.name)
                      onClose()
                    }}
                    className={`h-9 flex items-center justify-center rounded-lg transition-all cursor-pointer relative group/icon ${
                      isCur
                        ? 'bg-zinc-800 ring-1 ring-[var(--accent,#c59b27)] text-white shadow-xs'
                        : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80 hover:scale-105'
                    }`}
                    style={isCur ? { color: 'var(--accent, #c59b27)' } : undefined}
                    title={icon.label}
                  >
                    <IconComp className="w-4 h-4" />
                    {isCur && (
                      <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-[var(--accent,#c59b27)]" />
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Regular Categorized / Filtered List */}
        <div>
          {!cleanSearch && activeCategory === 'all' && (
            <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider px-1 pb-1.5">
              Biblioteca Completa ({filteredIcons.length})
            </div>
          )}

          {filteredIcons.length === 0 ? (
            <div className="py-8 text-center text-zinc-500 text-xs">
              Nenhum ícone encontrado para "{search}".
            </div>
          ) : (
            <div className="grid grid-cols-6 gap-1">
              {filteredIcons.map(icon => {
                const IconComp = icon.component
                const isCur = selectedIcon?.toLowerCase() === icon.name.toLowerCase()
                return (
                  <button
                    key={icon.name}
                    type="button"
                    onClick={() => {
                      onSelectIcon(icon.name)
                      onClose()
                    }}
                    className={`h-9 flex items-center justify-center rounded-lg transition-all cursor-pointer relative group/icon ${
                      isCur
                        ? 'bg-zinc-800 ring-1 ring-[var(--accent,#c59b27)] text-white shadow-xs'
                        : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80 hover:scale-105'
                    }`}
                    style={isCur ? { color: 'var(--accent, #c59b27)' } : undefined}
                    title={icon.label}
                  >
                    <IconComp className="w-4 h-4" />
                    {isCur && (
                      <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-[var(--accent,#c59b27)]" />
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default IconPickerPopover
