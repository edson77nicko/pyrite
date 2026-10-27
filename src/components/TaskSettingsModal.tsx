import React, { useState, useEffect, useRef, Component, type ErrorInfo, type ReactNode } from 'react'
import type { TaskSettings, TaskPropertyConfig, TaskPropertyType, TaskStatusGroup } from '../types/tasks'
import { DEFAULT_TASK_SETTINGS } from '../utils/taskStorage'
import {
  getPropertyItems,
  setPropertyItems,
  isBuiltinProperty,
  STATUS_GROUPS,
  defaultStatusItems,
  type PropertyItem
} from '../utils/taskProperties'
import {
  X,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  ChevronRight,
  ArrowLeft,
  Type,
  Hash,
  ChevronDownCircle,
  List,
  Loader,
  Calendar,
  CheckSquare,
  Link2,
  Compass,
  Flag,
  Tag,
  GripVertical,
  Flame,
  AlertCircle,
  Zap,
  Shield,
  Star,
  Minus,
  AlertTriangle,
  Sparkles,
  CheckCircle2
} from 'lucide-react'
import { CustomColorPickerPopover } from './CustomColorPickerPopover'
import {
  StatusProgressCircle,
  StatusBarProgress,
  computeStatusProgress,
  type StatusIndicatorStyle
} from './StatusIndicator'

interface TaskSettingsModalProps {
  isOpen: boolean
  onClose: () => void
  settings: TaskSettings
  onUpdateSettings: (newSettings: TaskSettings) => void
}

class ModalErrorBoundary extends Component<{ children: ReactNode; onClose: () => void }, { hasError: boolean }> {
  constructor(props: { children: ReactNode; onClose: () => void }) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('TaskSettingsModal crashed:', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#16161a] border border-rose-500/30 rounded-2xl p-5 max-w-md w-full text-zinc-200 text-xs space-y-3">
            <h3 className="text-rose-400 font-semibold text-sm">Erro ao carregar propriedades</h3>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  this.setState({ hasError: false })
                  this.props.onClose()
                }}
                className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-xs cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

const TYPE_META: Record<string, { label: string; Icon: React.ComponentType<{ className?: string }> }> = {
  text: { label: 'Texto', Icon: Type },
  number: { label: 'Número', Icon: Hash },
  select: { label: 'Selecionar', Icon: ChevronDownCircle },
  multiselect: { label: 'Seleção múltipla', Icon: List },
  status: { label: 'Status', Icon: Loader },
  date: { label: 'Data', Icon: Calendar },
  checkbox: { label: 'Caixa de seleção', Icon: CheckSquare },
  url: { label: 'URL', Icon: Link2 },
  context: { label: 'Nota vinculada', Icon: Compass },
  priority: { label: 'Seleção com ícone', Icon: Flag }
}

const NEW_TYPE_ORDER: TaskPropertyType[] = ['text', 'number', 'select', 'multiselect', 'status', 'date', 'checkbox', 'url']

const PRESET_COLORS = ['#71717a', '#3b82f6', '#10b981', '#f59e0b', '#f97316', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899']

const PRIORITY_ICONS = ['Flag', 'Flame', 'AlertCircle', 'Zap', 'Shield', 'Star', 'Minus', 'AlertTriangle', 'Sparkles', 'CheckCircle2']

const renderPriorityIcon = (name?: string, color?: string) => {
  const cls = 'w-3.5 h-3.5'
  const style = color ? { color } : undefined
  switch (name) {
    case 'Flame': return <Flame className={cls} style={style} />
    case 'AlertCircle': return <AlertCircle className={cls} style={style} />
    case 'Zap': return <Zap className={cls} style={style} />
    case 'Shield': return <Shield className={cls} style={style} />
    case 'Star': return <Star className={cls} style={style} />
    case 'Minus': return <Minus className={cls} style={style} />
    case 'AlertTriangle': return <AlertTriangle className={cls} style={style} />
    case 'Sparkles': return <Sparkles className={cls} style={style} />
    case 'CheckCircle2': return <CheckCircle2 className={cls} style={style} />
    default: return <Flag className={cls} style={style} />
  }
}

const propIcon = (prop: TaskPropertyConfig) => {
  if (prop.id === 'prop_tags') return Tag
  if (prop.id === 'prop_deadline') return Calendar
  return (TYPE_META[prop.type] || TYPE_META.text).Icon
}

const typeLabel = (prop: TaskPropertyConfig) => {
  if (prop.id === 'prop_tags') return 'Tags'
  if (prop.id === 'prop_priority') return 'Selecionar'
  return (TYPE_META[prop.type] || TYPE_META.text).label
}

/** Single option row: color dot (opens picker), inline name, optional icon, delete */
const ItemRow: React.FC<{
  item: PropertyItem
  withIcon?: boolean
  statusProgress?: number
  indicatorStyle?: StatusIndicatorStyle
  onChange: (next: PropertyItem) => void
  onDelete: () => void
}> = ({ item, withIcon, statusProgress, indicatorStyle, onChange, onDelete }) => {
  const [pickerOpen, setPickerOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)

  const cycleIcon = () => {
    const idx = PRIORITY_ICONS.indexOf(item.icon || 'Flag')
    onChange({ ...item, icon: PRIORITY_ICONS[(idx + 1) % PRIORITY_ICONS.length] })
  }

  return (
    <div className="group flex items-center gap-2 py-1 pl-0.5 pr-1 rounded-lg hover:bg-[#1b1b20] transition-colors">
      <GripVertical className="w-3.5 h-3.5 text-zinc-700 shrink-0" />
      {withIcon && (
        <button
          type="button"
          onClick={cycleIcon}
          className="p-1 rounded-md hover:bg-zinc-800 cursor-pointer shrink-0"
          title="Trocar ícone"
        >
          {renderPriorityIcon(item.icon, item.color)}
        </button>
      )}
      {statusProgress !== undefined && indicatorStyle === 'circle' && (
        <div className="shrink-0 flex items-center" title={`Progresso calculado: ${statusProgress}%`}>
          <StatusProgressCircle progress={statusProgress} color={item.color} size={15} />
        </div>
      )}
      {statusProgress !== undefined && indicatorStyle === 'bar' && (
        <div className="shrink-0 flex items-center" title={`Progresso: ${statusProgress}%`}>
          <StatusBarProgress progress={statusProgress} color={item.color} showText={false} />
        </div>
      )}
      <button
        ref={btnRef}
        type="button"
        onClick={() => setPickerOpen(o => !o)}
        className="w-4 h-4 rounded-full shrink-0 cursor-pointer ring-1 ring-white/10"
        style={{ backgroundColor: item.color }}
        title="Alterar cor"
      />
      <input
        value={item.name}
        onChange={e => onChange({ ...item, name: e.target.value })}
        className="flex-1 min-w-0 bg-transparent text-xs text-zinc-100 outline-none rounded px-1.5 py-1 focus:bg-[#121215]"
        spellCheck={false}
      />
      {statusProgress !== undefined && (
        <span className="text-[10px] font-mono text-zinc-500 font-medium px-1 shrink-0">
          {statusProgress}%
        </span>
      )}
      <button
        type="button"
        onClick={onDelete}
        className="opacity-0 group-hover:opacity-100 p-1 text-zinc-500 hover:text-rose-400 cursor-pointer transition-opacity shrink-0"
        title="Remover"
      >
        <Trash2 className="w-3 h-3" />
      </button>
      {pickerOpen && (
        <CustomColorPickerPopover
          currentColor={item.color}
          onChange={c => onChange({ ...item, color: c })}
          onClose={() => setPickerOpen(false)}
          anchorEl={btnRef.current}
          align="left"
        />
      )}
    </div>
  )
}

type View = { name: 'list' } | { name: 'types' } | { name: 'edit'; propId: string }

export const TaskSettingsModalContent: React.FC<TaskSettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings
}) => {
  const [view, setView] = useState<View>({ name: 'list' })

  const properties: TaskPropertyConfig[] =
    Array.isArray(settings?.properties) && settings.properties.length > 0
      ? settings.properties
      : DEFAULT_TASK_SETTINGS.properties

  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const save = (next: TaskSettings) => onUpdateSettings({ ...next, properties: next.properties?.length ? next.properties : properties })

  const updateProp = (propId: string, patch: Partial<TaskPropertyConfig>) => {
    save({ ...settings, properties: properties.map(p => (p.id === propId ? { ...p, ...patch } : p)) })
  }

  const handleCreate = (type: TaskPropertyType) => {
    const meta = TYPE_META[type]
    const newProp: TaskPropertyConfig = {
      id: `prop_${Date.now().toString(36)}`,
      name: meta.label,
      type,
      options:
        type === 'status'
          ? defaultStatusItems()
          : type === 'select' || type === 'multiselect'
            ? []
            : undefined
    }
    save({ ...settings, properties: [...properties, newProp] })
    setView({ name: 'edit', propId: newProp.id })
  }

  const handleDelete = (propId: string) => {
    save({ ...settings, properties: properties.filter(p => p.id !== propId) })
    setView({ name: 'list' })
  }

  const editingProp = view.name === 'edit' ? properties.find(p => p.id === view.propId) : undefined

  const renderEdit = (prop: TaskPropertyConfig) => {
    const Icon = propIcon(prop)
    const builtin = isBuiltinProperty(prop.id)
    const hasItems = prop.type === 'status' || prop.type === 'select' || prop.type === 'multiselect' || prop.type === 'priority'
    const items = hasItems ? getPropertyItems(settings, prop) : []
    const commitItems = (next: PropertyItem[]) => save(setPropertyItems(settings, prop, next))
    const addItem = (group?: TaskStatusGroup) => {
      const base: PropertyItem = {
        id: `opt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
        name: 'Nova opção',
        color: PRESET_COLORS[items.length % PRESET_COLORS.length],
        group,
        icon: prop.type === 'priority' ? 'Flag' : undefined
      }
      commitItems([...items, base])
    }
    const patchItem = (next: PropertyItem) => commitItems(items.map(i => (i.id === next.id ? next : i)))
    const removeItem = (id: string) => {
      if (items.length <= 1 && (prop.id === 'prop_status' || prop.id === 'prop_priority')) return
      commitItems(items.filter(i => i.id !== id))
    }

    return (
      <>
        <div className="px-4 pt-4 pb-2 flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setView({ name: 'list' })}
            className="p-1 text-zinc-400 hover:text-zinc-100 cursor-pointer rounded-md hover:bg-[#1b1b20]"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-semibold text-zinc-100 flex-1">Editar propriedade</span>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-zinc-400 hover:text-zinc-100 cursor-pointer rounded-full hover:bg-[#1b1b20]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-4 pb-4 overflow-y-auto custom-chat-scrollbar space-y-3 flex-1">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#1b1b20] flex items-center justify-center shrink-0">
              <Icon className="w-4 h-4 text-zinc-300" />
            </div>
            <input
              value={prop.name}
              onChange={e => updateProp(prop.id, { name: e.target.value })}
              className="flex-1 min-w-0 bg-[#1b1b20] text-sm text-zinc-100 rounded-lg px-2.5 py-1.5 outline-none"
              spellCheck={false}
            />
          </div>

          <div className="flex items-center justify-between px-1 py-1 text-zinc-300">
            <span className="text-xs">Tipo</span>
            <span className="text-xs text-zinc-500">{typeLabel(prop)}</span>
          </div>

          {prop.type === 'status' && (
            <div className="space-y-3">
              {/* Indicator Style Selector */}
              <div className="bg-[#1b1b20] p-2.5 rounded-xl space-y-2 border border-zinc-800/60">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-zinc-300">Ícone de Progresso</span>
                  <span className="text-[10px] text-zinc-500 font-mono">Modo Lista & Kanban</span>
                </div>
                <div className="grid grid-cols-3 gap-1.5 bg-[#14151b] p-1 rounded-lg border border-zinc-800/50">
                  <button
                    type="button"
                    onClick={() => save({ ...settings, statusIndicatorStyle: 'circle' })}
                    className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md text-[11px] font-medium transition-all cursor-pointer ${
                      (settings.statusIndicatorStyle || 'circle') === 'circle'
                        ? 'bg-zinc-800 text-white shadow-xs font-semibold'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                    style={(settings.statusIndicatorStyle || 'circle') === 'circle' ? { color: 'var(--accent, #c59b27)' } : undefined}
                    title="Círculo de progresso proporcional à quantidade de opções"
                  >
                    <StatusProgressCircle progress={65} color="var(--accent, #c59b27)" size={13} />
                    <span>Círculo</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => save({ ...settings, statusIndicatorStyle: 'bar' })}
                    className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md text-[11px] font-medium transition-all cursor-pointer ${
                      settings.statusIndicatorStyle === 'bar'
                        ? 'bg-zinc-800 text-white shadow-xs font-semibold'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                    style={settings.statusIndicatorStyle === 'bar' ? { color: 'var(--accent, #c59b27)' } : undefined}
                    title="Barra horizontal de progresso com porcentagem"
                  >
                    <StatusBarProgress progress={65} color="var(--accent, #c59b27)" showText={false} />
                    <span>Barra (%)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => save({ ...settings, statusIndicatorStyle: 'dot' })}
                    className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md text-[11px] font-medium transition-all cursor-pointer ${
                      settings.statusIndicatorStyle === 'dot'
                        ? 'bg-zinc-800 text-white shadow-xs font-semibold'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                    style={settings.statusIndicatorStyle === 'dot' ? { color: 'var(--accent, #c59b27)' } : undefined}
                    title="Ponto circular colorido tradicional"
                  >
                    <span className="w-2 h-2 rounded-full bg-[var(--accent,#c59b27)] shrink-0" />
                    <span>Ponto</span>
                  </button>
                </div>
                <div className="text-[10.5px] text-zinc-500 leading-tight">
                  Adapta a porcentagem automaticamente conforme a quantidade e sequência de etapas.
                </div>
              </div>

              {STATUS_GROUPS.map(g => {
                const groupItems = items.filter(i => (i.group || 'todo') === g.id)
                return (
                  <div key={g.id}>
                    <div className="flex items-center justify-between px-1 pb-1">
                      <span className="text-[11px] text-zinc-400 font-medium">{g.label}</span>
                      <button
                        type="button"
                        onClick={() => addItem(g.id)}
                        className="p-0.5 text-zinc-500 hover:text-zinc-100 cursor-pointer"
                        title="Adicionar opção"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    {groupItems.length === 0 ? (
                      <div className="px-2 py-1 text-[11px] text-zinc-600">Vazio</div>
                    ) : (
                      groupItems.map(it => {
                        const prog = computeStatusProgress(it.id, items)
                        return (
                          <ItemRow
                            key={it.id}
                            item={it}
                            statusProgress={prog}
                            indicatorStyle={settings.statusIndicatorStyle || 'circle'}
                            onChange={patchItem}
                            onDelete={() => removeItem(it.id)}
                          />
                        )
                      })
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {(prop.type === 'select' || prop.type === 'multiselect' || prop.type === 'priority') && (
            <div>
              <div className="flex items-center justify-between px-1 pb-1">
                <span className="text-[11px] text-zinc-400 font-medium">Opções</span>
                <button
                  type="button"
                  onClick={() => addItem()}
                  className="p-0.5 text-zinc-500 hover:text-zinc-100 cursor-pointer"
                  title="Adicionar opção"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
              {items.length === 0 ? (
                <div className="px-2 py-1 text-[11px] text-zinc-600">Nenhuma opção</div>
              ) : (
                items.map(it => (
                  <ItemRow
                    key={it.id}
                    item={it}
                    withIcon={prop.type === 'priority'}
                    onChange={patchItem}
                    onDelete={() => removeItem(it.id)}
                  />
                ))
              )}
            </div>
          )}

          <div className="flex items-center justify-between px-1 pt-1">
            <span className="text-xs text-zinc-300">Mostrar na lista</span>
            <button
              type="button"
              onClick={() => updateProp(prop.id, { hidden: !prop.hidden })}
              className="p-1 text-zinc-400 hover:text-zinc-100 cursor-pointer rounded-md hover:bg-[#1b1b20]"
            >
              {prop.hidden ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          {!builtin && (
            <button
              type="button"
              onClick={() => handleDelete(prop.id)}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-rose-400 hover:bg-rose-500/10 cursor-pointer transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Excluir propriedade</span>
            </button>
          )}
        </div>
      </>
    )
  }

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 select-none animate-in fade-in duration-100"
    >
      <div
        onClick={e => e.stopPropagation()}
        className="w-full max-w-sm bg-[#16161a] border border-zinc-800/80 rounded-2xl shadow-xl overflow-hidden flex flex-col text-xs text-zinc-100 animate-in zoom-in-95 duration-100 max-h-[80vh]"
      >
        {view.name === 'list' && (
          <>
            <div className="px-4 pt-4 pb-2 flex items-center justify-between shrink-0">
              <span className="text-sm font-semibold text-zinc-100">Propriedades</span>
              <button
                type="button"
                onClick={onClose}
                className="p-1 text-zinc-400 hover:text-zinc-100 cursor-pointer rounded-full hover:bg-[#1b1b20]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-2 pb-2 overflow-y-auto custom-chat-scrollbar flex-1">
              {properties.map(prop => {
                const Icon = propIcon(prop)
                return (
                  <div
                    key={prop.id}
                    className="group flex items-center gap-2 pl-2 pr-1 py-1.5 rounded-lg hover:bg-[#1b1b20] transition-colors"
                  >
                    <button
                      type="button"
                      onClick={() => setView({ name: 'edit', propId: prop.id })}
                      className="flex items-center gap-2.5 flex-1 min-w-0 text-left cursor-pointer"
                    >
                      <Icon className={`w-4 h-4 shrink-0 ${prop.hidden ? 'text-zinc-600' : 'text-zinc-300'}`} />
                      <span className={`truncate text-[13px] ${prop.hidden ? 'text-zinc-500' : 'text-zinc-100'}`}>
                        {prop.name}
                      </span>
                      <span className="text-[10.5px] text-zinc-600 truncate">{typeLabel(prop)}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => updateProp(prop.id, { hidden: !prop.hidden })}
                      className="p-1 text-zinc-500 hover:text-zinc-100 cursor-pointer shrink-0"
                      title={prop.hidden ? 'Mostrar na lista' : 'Ocultar da lista'}
                    >
                      {prop.hidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => setView({ name: 'edit', propId: prop.id })}
                      className="p-1 text-zinc-600 hover:text-zinc-200 cursor-pointer shrink-0"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )
              })}
            </div>
            <div className="px-2 pb-2 pt-1 shrink-0">
              <button
                type="button"
                onClick={() => setView({ name: 'types' })}
                className="w-full flex items-center gap-2 px-2 py-2 rounded-lg text-xs text-zinc-300 hover:bg-[#1b1b20] hover:text-zinc-100 cursor-pointer transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>Nova propriedade</span>
              </button>
            </div>
          </>
        )}

        {view.name === 'types' && (
          <>
            <div className="px-4 pt-4 pb-2 flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setView({ name: 'list' })}
                className="p-1 text-zinc-400 hover:text-zinc-100 cursor-pointer rounded-md hover:bg-[#1b1b20]"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <span className="text-sm font-semibold text-zinc-100 flex-1">Nova propriedade</span>
              <button
                type="button"
                onClick={onClose}
                className="p-1 text-zinc-400 hover:text-zinc-100 cursor-pointer rounded-full hover:bg-[#1b1b20]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-2 pb-3 overflow-y-auto custom-chat-scrollbar">
              {NEW_TYPE_ORDER.map(t => {
                const { label, Icon } = TYPE_META[t]
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => handleCreate(t)}
                    className="w-full flex items-center gap-3 px-2.5 py-2 rounded-lg text-[13px] text-zinc-200 hover:bg-[#1b1b20] cursor-pointer transition-colors text-left"
                  >
                    <Icon className="w-4 h-4 text-zinc-300" />
                    <span>{label}</span>
                  </button>
                )
              })}
            </div>
          </>
        )}

        {view.name === 'edit' && editingProp && renderEdit(editingProp)}
        {view.name === 'edit' && !editingProp && (
          <div className="p-4">
            <button type="button" onClick={() => setView({ name: 'list' })} className="text-zinc-400 cursor-pointer">
              Voltar
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export const TaskSettingsModal: React.FC<TaskSettingsModalProps> = props => {
  if (!props.isOpen) return null
  return (
    <ModalErrorBoundary onClose={props.onClose}>
      <TaskSettingsModalContent {...props} />
    </ModalErrorBoundary>
  )
}

export default TaskSettingsModal
