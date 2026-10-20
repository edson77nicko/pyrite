import React, { useState, useEffect, useMemo, useRef, Component, type ErrorInfo, type ReactNode } from 'react'
import type { TaskSettings, TaskStatusOption, TaskPropertyConfig, TaskPriorityOption } from '../types/tasks'
import { DEFAULT_TASK_SETTINGS, DEFAULT_PRIORITIES } from '../utils/taskStorage'
import {
  X,
  Plus,
  Trash2,
  Sliders,
  Calendar,
  Compass,
  Flag,
  Type,
  ChevronDown,
  Check,
  Eye,
  EyeOff,
  Tag,
  Flame,
  AlertCircle,
  Zap,
  Shield,
  Star,
  Minus,
  AlertTriangle,
  Sparkles,
  CheckCircle2,
  Pencil
} from 'lucide-react'
import { CustomColorPickerPopover } from './CustomColorPickerPopover'

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
          <div className="bg-[#12131a] border border-rose-500/30 rounded-2xl p-5 max-w-md w-full text-zinc-200 text-xs space-y-3">
            <h3 className="text-rose-400 font-semibold text-sm">Erro ao carregar configurações de tarefas</h3>
            <p className="text-zinc-400">Houve uma falha ao renderizar as opções de tarefas do cofre.</p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  this.setState({ hasError: false })
                  this.props.onClose()
                }}
                className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-xs"
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

const PRESET_COLORS = [
  '#71717a', // Zinc
  '#3b82f6', // Blue
  '#10b981', // Green
  '#f59e0b', // Amber
  '#f97316', // Orange
  '#ef4444', // Red
  '#8b5cf6', // Violet
  '#06b6d4'  // Cyan
]

const PROPERTY_TYPE_OPTIONS: { id: TaskPropertyConfig['type']; label: string }[] = [
  { id: 'text', label: 'Texto' },
  { id: 'date', label: 'Data' },
  { id: 'select', label: 'Seleção' },
  { id: 'number', label: 'Número' }
]

const PRIORITY_ICON_NAMES = [
  'Flag', 'Flame', 'AlertCircle', 'Zap', 'Shield', 'Star', 'Minus', 'AlertTriangle', 'Sparkles', 'CheckCircle2'
]

const renderPriorityIcon = (iconName?: string, color?: string, className = "w-3.5 h-3.5") => {
  const style = color ? { color } : undefined
  switch (iconName) {
    case 'Flame': return <Flame className={className} style={style} />
    case 'AlertCircle': return <AlertCircle className={className} style={style} />
    case 'Zap': return <Zap className={className} style={style} />
    case 'Shield': return <Shield className={className} style={style} />
    case 'Star': return <Star className={className} style={style} />
    case 'Minus': return <Minus className={className} style={style} />
    case 'AlertTriangle': return <AlertTriangle className={className} style={style} />
    case 'Sparkles': return <Sparkles className={className} style={style} />
    case 'CheckCircle2': return <CheckCircle2 className={className} style={style} />
    default: return <Flag className={className} style={style} />
  }
}

export const TaskSettingsModalContent: React.FC<TaskSettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings
}) => {
  const [activeTab, setActiveTab] = useState<'status' | 'priorities' | 'properties'>('status')

  // Form states for adding new status
  const [newStatusName, setNewStatusName] = useState('')
  const [newStatusColor, setNewStatusColor] = useState(PRESET_COLORS[0])
  const [newStatusIsCompleted, setNewStatusIsCompleted] = useState(false)
  const [isStatusColorPickerOpen, setIsStatusColorPickerOpen] = useState(false)
  const statusColorBtnRef = useRef<HTMLButtonElement>(null)

  // Editing existing status
  const [editingStatusId, setEditingStatusId] = useState<string | null>(null)
  const [editingStatusName, setEditingStatusName] = useState('')
  const [editingStatusColor, setEditingStatusColor] = useState('')
  const [editingStatusIsCompleted, setEditingStatusIsCompleted] = useState(false)

  // Form states for adding new priority
  const [newPriorityLabel, setNewPriorityLabel] = useState('')
  const [newPriorityColor, setNewPriorityColor] = useState(PRESET_COLORS[5])
  const [newPriorityIcon, setNewPriorityIcon] = useState('Flag')
  const [isPriorityColorPickerOpen, setIsPriorityColorPickerOpen] = useState(false)
  const priorityColorBtnRef = useRef<HTMLButtonElement>(null)

  // Editing existing priority
  const [editingPriorityId, setEditingPriorityId] = useState<string | null>(null)
  const [editingPriorityLabel, setEditingPriorityLabel] = useState('')
  const [editingPriorityColor, setEditingPriorityColor] = useState('')
  const [editingPriorityIcon, setEditingPriorityIcon] = useState('Flag')

  // Form states for adding new property
  const [newPropName, setNewPropName] = useState('')
  const [newPropType, setNewPropType] = useState<TaskPropertyConfig['type']>('text')
  const [isPropTypeDropdownOpen, setIsPropTypeDropdownOpen] = useState(false)

  // Editing existing property
  const [editingPropId, setEditingPropId] = useState<string | null>(null)
  const [editingPropName, setEditingPropName] = useState('')
  const [newOptionName, setNewOptionName] = useState('')
  const [newOptionColor, setNewOptionColor] = useState(PRESET_COLORS[1])

  const safeStatuses = useMemo(() => {
    return Array.isArray(settings?.statuses) && settings.statuses.length > 0
      ? settings.statuses
      : DEFAULT_TASK_SETTINGS.statuses
  }, [settings?.statuses])

  const safePriorities = useMemo(() => {
    return Array.isArray(settings?.priorities) && settings.priorities.length > 0
      ? settings.priorities
      : DEFAULT_PRIORITIES
  }, [settings?.priorities])

  const safeProperties = useMemo(() => {
    return Array.isArray(settings?.properties) && settings.properties.length > 0
      ? settings.properties
      : DEFAULT_TASK_SETTINGS.properties
  }, [settings?.properties])

  // Ensure default standard properties exist if not already present
  const allDisplayProperties = useMemo(() => {
    const list = [...safeProperties]
    return list
  }, [safeProperties])

  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  // STATUS HANDLERS
  const handleAddStatus = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newStatusName.trim()) return

    const newOption: TaskStatusOption = {
      id: `status_${Date.now()}`,
      name: newStatusName.trim(),
      color: newStatusColor,
      isCompleted: newStatusIsCompleted
    }

    onUpdateSettings({
      ...settings,
      statuses: [...safeStatuses, newOption],
      priorities: safePriorities,
      properties: safeProperties
    })

    setNewStatusName('')
    setNewStatusIsCompleted(false)
  }

  const handleStartEditStatus = (st: TaskStatusOption) => {
    setEditingStatusId(st.id)
    setEditingStatusName(st.name)
    setEditingStatusColor(st.color)
    setEditingStatusIsCompleted(Boolean(st.isCompleted))
  }

  const handleSaveEditStatus = () => {
    if (!editingStatusId || !editingStatusName.trim()) return
    const updated = safeStatuses.map(s =>
      s.id === editingStatusId
        ? { ...s, name: editingStatusName.trim(), color: editingStatusColor, isCompleted: editingStatusIsCompleted }
        : s
    )
    onUpdateSettings({
      ...settings,
      statuses: updated,
      priorities: safePriorities,
      properties: safeProperties
    })
    setEditingStatusId(null)
  }

  const handleDeleteStatus = (statusId: string) => {
    if (safeStatuses.length <= 1) {
      alert('Você precisa ter pelo menos um status configurado.')
      return
    }
    onUpdateSettings({
      ...settings,
      statuses: safeStatuses.filter(s => s.id !== statusId),
      priorities: safePriorities,
      properties: safeProperties
    })
  }

  // PRIORITY HANDLERS
  const handleAddPriority = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newPriorityLabel.trim()) return

    const newOpt: TaskPriorityOption = {
      id: `prio_${Date.now().toString(36)}`,
      label: newPriorityLabel.trim(),
      color: newPriorityColor,
      icon: newPriorityIcon
    }

    onUpdateSettings({
      ...settings,
      statuses: safeStatuses,
      priorities: [...safePriorities, newOpt],
      properties: safeProperties
    })

    setNewPriorityLabel('')
  }

  const handleStartEditPriority = (p: TaskPriorityOption) => {
    setEditingPriorityId(p.id)
    setEditingPriorityLabel(p.label)
    setEditingPriorityColor(p.color)
    setEditingPriorityIcon(p.icon || 'Flag')
  }

  const handleSaveEditPriority = () => {
    if (!editingPriorityId || !editingPriorityLabel.trim()) return
    const updated = safePriorities.map(p =>
      p.id === editingPriorityId
        ? { ...p, label: editingPriorityLabel.trim(), color: editingPriorityColor, icon: editingPriorityIcon }
        : p
    )
    onUpdateSettings({
      ...settings,
      statuses: safeStatuses,
      priorities: updated,
      properties: safeProperties
    })
    setEditingPriorityId(null)
  }

  const handleDeletePriority = (prioId: string) => {
    if (safePriorities.length <= 1) {
      alert('Você precisa ter pelo menos uma prioridade configurada.')
      return
    }
    onUpdateSettings({
      ...settings,
      statuses: safeStatuses,
      priorities: safePriorities.filter(p => p.id !== prioId),
      properties: safeProperties
    })
  }

  // PROPERTY HANDLERS
  const handleAddProperty = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newPropName.trim()) return

    const newProp: TaskPropertyConfig = {
      id: `prop_${Date.now()}`,
      name: newPropName.trim(),
      type: newPropType,
      options: newPropType === 'select' ? [] : undefined
    }

    onUpdateSettings({
      ...settings,
      statuses: safeStatuses,
      priorities: safePriorities,
      properties: [...safeProperties, newProp]
    })

    setNewPropName('')
  }

  const handleStartEditProperty = (prop: TaskPropertyConfig) => {
    setEditingPropId(prop.id)
    setEditingPropName(prop.name)
  }

  const handleSaveEditPropertyName = () => {
    if (!editingPropId || !editingPropName.trim()) return
    const updated = safeProperties.map(p =>
      p.id === editingPropId ? { ...p, name: editingPropName.trim() } : p
    )
    onUpdateSettings({
      ...settings,
      statuses: safeStatuses,
      priorities: safePriorities,
      properties: updated
    })
  }

  const handleAddPropertyOption = (propId: string) => {
    if (!newOptionName.trim()) return
    const newOpt = {
      id: `opt_${Date.now()}`,
      name: newOptionName.trim(),
      color: newOptionColor
    }
    const updated = safeProperties.map(p => {
      if (p.id === propId) {
        return { ...p, options: [...(p.options || []), newOpt] }
      }
      return p
    })
    onUpdateSettings({
      ...settings,
      statuses: safeStatuses,
      priorities: safePriorities,
      properties: updated
    })
    setNewOptionName('')
  }

  const handleDeletePropertyOption = (propId: string, optId: string) => {
    const updated = safeProperties.map(p => {
      if (p.id === propId) {
        return { ...p, options: (p.options || []).filter(o => o.id !== optId) }
      }
      return p
    })
    onUpdateSettings({
      ...settings,
      statuses: safeStatuses,
      priorities: safePriorities,
      properties: updated
    })
  }

  const handleDeleteProperty = (propId: string) => {
    onUpdateSettings({
      ...settings,
      statuses: safeStatuses,
      priorities: safePriorities,
      properties: safeProperties.filter(p => p.id !== propId)
    })
    if (editingPropId === propId) setEditingPropId(null)
  }

  const handleTogglePropertyHidden = (propId: string) => {
    onUpdateSettings({
      ...settings,
      statuses: safeStatuses,
      priorities: safePriorities,
      properties: safeProperties.map(p =>
        p.id === propId ? { ...p, hidden: !p.hidden } : p
      )
    })
  }

  const selectedPropTypeLabel = PROPERTY_TYPE_OPTIONS.find(o => o.id === newPropType)?.label || 'Texto'

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 select-none animate-in fade-in duration-100"
    >
      <div
        onClick={e => e.stopPropagation()}
        className="w-full max-w-lg bg-[#0f0f13] border border-zinc-800 rounded-2xl shadow-xl overflow-hidden flex flex-col text-xs text-zinc-100 animate-in zoom-in-95 duration-100 max-h-[85vh]"
      >
        {/* Header - Unified with app header style */}
        <div className="px-5 py-3.5 bg-[#0c0c0f] border-b border-zinc-800/60 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 text-zinc-300 font-medium">
            <Sliders className="w-4 h-4 text-zinc-400" />
            <span className="text-sm font-semibold">Configurações de Tarefas</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation Tabs - Status, Prioridades, Propriedades */}
        <div className="px-5 pt-3 pb-2 flex items-center gap-2 bg-[#0c0c0f] shrink-0">
          <button
            onClick={() => { setActiveTab('status'); setEditingStatusId(null); }}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
              activeTab === 'status'
                ? 'bg-[#181920] text-zinc-100 border border-zinc-700/60 shadow-xs'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60'
            }`}
            style={activeTab === 'status' ? { color: 'var(--accent, #ffffff)' } : undefined}
          >
            Status ({safeStatuses.length})
          </button>
          <button
            onClick={() => { setActiveTab('priorities'); setEditingPriorityId(null); }}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
              activeTab === 'priorities'
                ? 'bg-[#181920] text-zinc-100 border border-zinc-700/60 shadow-xs'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60'
            }`}
            style={activeTab === 'priorities' ? { color: 'var(--accent, #ffffff)' } : undefined}
          >
            Prioridades ({safePriorities.length})
          </button>
          <button
            onClick={() => { setActiveTab('properties'); setEditingPropId(null); }}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
              activeTab === 'properties'
                ? 'bg-[#181920] text-zinc-100 border border-zinc-700/60 shadow-xs'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60'
            }`}
            style={activeTab === 'properties' ? { color: 'var(--accent, #ffffff)' } : undefined}
          >
            Propriedades ({allDisplayProperties.length})
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-4 custom-chat-scrollbar flex-1">
          {/* TAB 1: STATUS */}
          {activeTab === 'status' && (
            <div className="space-y-4">
              {/* Existing Status List */}
              <div className="space-y-1 bg-[#13141a]/70 border border-zinc-800/40 p-2 rounded-xl">
                {safeStatuses.map(st => {
                  const isEditing = editingStatusId === st.id
                  return (
                    <div
                      key={st.id}
                      className="p-2 rounded-lg hover:bg-zinc-800/40 transition-colors space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: st.color }}
                          />
                          <span className="font-medium text-xs text-zinc-200 truncate">{st.name}</span>
                          {st.isCompleted && (
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                              Concluído
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => isEditing ? setEditingStatusId(null) : handleStartEditStatus(st)}
                            className="text-zinc-400 hover:text-zinc-200 p-1 rounded hover:bg-zinc-800 transition-colors cursor-pointer"
                            title="Editar status"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteStatus(st.id)}
                            className="text-zinc-500 hover:text-rose-400 p-1 rounded hover:bg-zinc-800 transition-colors cursor-pointer"
                            title="Remover status"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Inline Status Editor */}
                      {isEditing && (
                        <div className="p-2.5 bg-[#16161a] border border-zinc-700/60 rounded-lg space-y-2 animate-in fade-in duration-100">
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={editingStatusName}
                              onChange={e => setEditingStatusName(e.target.value)}
                              placeholder="Nome do status..."
                              className="flex-1 bg-[#121215] border border-zinc-700/60 rounded-md px-2 py-1 text-xs text-zinc-200 outline-none"
                            />
                            <div className="flex items-center gap-1">
                              {PRESET_COLORS.map(c => (
                                <button
                                  type="button"
                                  key={c}
                                  onClick={() => setEditingStatusColor(c)}
                                  className={`w-4 h-4 rounded-full transition-transform ${editingStatusColor === c ? 'scale-125 ring-2 ring-white/60' : 'opacity-70 hover:opacity-100'}`}
                                  style={{ backgroundColor: c }}
                                />
                              ))}
                            </div>
                          </div>
                          <div className="flex items-center justify-between pt-1">
                            <label className="flex items-center gap-1.5 text-[11px] text-zinc-400 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={editingStatusIsCompleted}
                                onChange={e => setEditingStatusIsCompleted(e.target.checked)}
                                className="rounded border-zinc-700 text-emerald-500 focus:ring-0"
                              />
                              <span>Concluído</span>
                            </label>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => setEditingStatusId(null)}
                                className="px-2 py-0.5 rounded text-[11px] text-zinc-400 hover:text-zinc-200"
                              >
                                Cancelar
                              </button>
                              <button
                                type="button"
                                onClick={handleSaveEditStatus}
                                className="px-2.5 py-0.5 rounded text-[11px] bg-zinc-800 hover:bg-zinc-700 text-zinc-100 font-medium"
                              >
                                Salvar
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Add New Status Form */}
              <form onSubmit={handleAddStatus} className="p-3 bg-[#13141a]/50 border border-zinc-800/30 rounded-xl space-y-2.5">
                <div className="font-semibold text-zinc-300 text-[11px]">Novo Status</div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newStatusName}
                    onChange={e => setNewStatusName(e.target.value)}
                    placeholder="Nome do status..."
                    className="flex-1 bg-[#14151b] border border-zinc-800 focus:border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none transition-colors"
                  />

                  {/* Preset Colors + Color Picker */}
                  <div className="flex items-center gap-1.5 relative">
                    {PRESET_COLORS.map(c => (
                      <button
                        type="button"
                        key={c}
                        onClick={() => {
                          setIsStatusColorPickerOpen(false)
                          setNewStatusColor(c)
                        }}
                        className={`w-4 h-4 rounded-full transition-transform cursor-pointer ${
                          newStatusColor === c ? 'scale-125 ring-2 ring-white/60 shadow-xs' : 'opacity-80 hover:opacity-100'
                        }`}
                        style={{ backgroundColor: c }}
                      />
                    ))}

                    <button
                      type="button"
                      ref={statusColorBtnRef}
                      title="Escolher cor personalizada"
                      onClick={() => setIsStatusColorPickerOpen(o => !o)}
                      className={`w-4 h-4 rounded-full border border-white/20 transition-transform cursor-pointer flex items-center justify-center p-0 ${
                        !PRESET_COLORS.includes(newStatusColor) ? 'scale-125 ring-2 ring-white/60 shadow-xs' : 'opacity-80 hover:opacity-100'
                      }`}
                      style={{ background: 'conic-gradient(from 180deg at 50% 50%, #f43f5e 0deg, #eab308 120deg, #06b6d4 240deg, #f43f5e 360deg)' }}
                    />

                    {isStatusColorPickerOpen && (
                      <CustomColorPickerPopover
                        currentColor={newStatusColor}
                        onChange={c => setNewStatusColor(c)}
                        onClose={() => setIsStatusColorPickerOpen(false)}
                        anchorEl={statusColorBtnRef.current}
                        align="right"
                      />
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <label className="flex items-center gap-2 text-zinc-400 cursor-pointer text-xs">
                    <input
                      type="checkbox"
                      checked={newStatusIsCompleted}
                      onChange={e => setNewStatusIsCompleted(e.target.checked)}
                      className="rounded border-zinc-700 text-emerald-500 focus:ring-0 focus:ring-offset-0 bg-zinc-900"
                    />
                    <span>Marcar tarefas como concluídas neste status</span>
                  </label>

                  <button
                    type="submit"
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-100 transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Adicionar Status</span>
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* TAB 2: PRIORIDADES */}
          {activeTab === 'priorities' && (
            <div className="space-y-4">
              {/* Existing Priorities List */}
              <div className="space-y-1 bg-[#13141a]/70 border border-zinc-800/40 p-2 rounded-xl">
                {safePriorities.map(p => {
                  const isEditing = editingPriorityId === p.id
                  return (
                    <div
                      key={p.id}
                      className="p-2 rounded-lg hover:bg-zinc-800/40 transition-colors space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            className="w-6 h-6 rounded-md flex items-center justify-center shrink-0 border border-zinc-800/80 shadow-xs"
                            style={{ backgroundColor: `${p.color}18`, borderColor: `${p.color}40` }}
                          >
                            {renderPriorityIcon(p.icon, p.color, "w-3.5 h-3.5")}
                          </div>
                          <span className="font-medium text-xs text-zinc-200 truncate">{p.label}</span>
                          <span className="text-[10px] text-zinc-500 font-mono">({p.id})</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => isEditing ? setEditingPriorityId(null) : handleStartEditPriority(p)}
                            className="text-zinc-400 hover:text-zinc-200 p-1 rounded hover:bg-zinc-800 transition-colors cursor-pointer"
                            title="Editar prioridade"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeletePriority(p.id)}
                            className="text-zinc-500 hover:text-rose-400 p-1 rounded hover:bg-zinc-800 transition-colors cursor-pointer"
                            title="Remover prioridade"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Inline Priority Editor */}
                      {isEditing && (
                        <div className="p-2.5 bg-[#16161a] border border-zinc-700/60 rounded-lg space-y-2.5 animate-in fade-in duration-100">
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={editingPriorityLabel}
                              onChange={e => setEditingPriorityLabel(e.target.value)}
                              placeholder="Nome da prioridade..."
                              className="flex-1 bg-[#121215] border border-zinc-700/60 rounded-md px-2 py-1 text-xs text-zinc-200 outline-none"
                            />
                            <div className="flex items-center gap-1">
                              {PRESET_COLORS.map(c => (
                                <button
                                  type="button"
                                  key={c}
                                  onClick={() => setEditingPriorityColor(c)}
                                  className={`w-4 h-4 rounded-full transition-transform ${editingPriorityColor === c ? 'scale-125 ring-2 ring-white/60' : 'opacity-70 hover:opacity-100'}`}
                                  style={{ backgroundColor: c }}
                                />
                              ))}
                            </div>
                          </div>

                          {/* Icon selection */}
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[10px] text-zinc-400 font-mono">Ícone:</span>
                            {PRIORITY_ICON_NAMES.map(ico => (
                              <button
                                type="button"
                                key={ico}
                                onClick={() => setEditingPriorityIcon(ico)}
                                className={`p-1 rounded-md border transition-all cursor-pointer ${editingPriorityIcon === ico ? 'bg-zinc-700 border-zinc-500 text-white' : 'border-zinc-800 text-zinc-400 hover:text-zinc-200'}`}
                              >
                                {renderPriorityIcon(ico, editingPriorityColor, "w-3 h-3")}
                              </button>
                            ))}
                          </div>

                          <div className="flex items-center justify-end gap-1.5 pt-1">
                            <button
                              type="button"
                              onClick={() => setEditingPriorityId(null)}
                              className="px-2 py-0.5 rounded text-[11px] text-zinc-400 hover:text-zinc-200"
                            >
                              Cancelar
                            </button>
                            <button
                              type="button"
                              onClick={handleSaveEditPriority}
                              className="px-2.5 py-0.5 rounded text-[11px] bg-zinc-800 hover:bg-zinc-700 text-zinc-100 font-medium"
                            >
                              Salvar
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Add New Priority Form */}
              <form onSubmit={handleAddPriority} className="p-3 bg-[#13141a]/50 border border-zinc-800/30 rounded-xl space-y-2.5">
                <div className="font-semibold text-zinc-300 text-[11px]">Nova Prioridade</div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newPriorityLabel}
                    onChange={e => setNewPriorityLabel(e.target.value)}
                    placeholder="Nome da prioridade..."
                    className="flex-1 bg-[#14151b] border border-zinc-800 focus:border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none transition-colors"
                  />

                  {/* Preset Colors + Color Picker */}
                  <div className="flex items-center gap-1.5 relative">
                    {PRESET_COLORS.map(c => (
                      <button
                        type="button"
                        key={c}
                        onClick={() => {
                          setIsPriorityColorPickerOpen(false)
                          setNewPriorityColor(c)
                        }}
                        className={`w-4 h-4 rounded-full transition-transform cursor-pointer ${
                          newPriorityColor === c ? 'scale-125 ring-2 ring-white/60 shadow-xs' : 'opacity-80 hover:opacity-100'
                        }`}
                        style={{ backgroundColor: c }}
                      />
                    ))}

                    <button
                      type="button"
                      ref={priorityColorBtnRef}
                      title="Escolher cor personalizada"
                      onClick={() => setIsPriorityColorPickerOpen(o => !o)}
                      className={`w-4 h-4 rounded-full border border-white/20 transition-transform cursor-pointer flex items-center justify-center p-0 ${
                        !PRESET_COLORS.includes(newPriorityColor) ? 'scale-125 ring-2 ring-white/60 shadow-xs' : 'opacity-80 hover:opacity-100'
                      }`}
                      style={{ background: 'conic-gradient(from 180deg at 50% 50%, #f43f5e 0deg, #eab308 120deg, #06b6d4 240deg, #f43f5e 360deg)' }}
                    />

                    {isPriorityColorPickerOpen && (
                      <CustomColorPickerPopover
                        currentColor={newPriorityColor}
                        onChange={c => setNewPriorityColor(c)}
                        onClose={() => setIsPriorityColorPickerOpen(false)}
                        anchorEl={priorityColorBtnRef.current}
                        align="right"
                      />
                    )}
                  </div>
                </div>

                {/* Icon Selector */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] text-zinc-400 font-mono">Ícone:</span>
                  {PRIORITY_ICON_NAMES.map(ico => (
                    <button
                      type="button"
                      key={ico}
                      onClick={() => setNewPriorityIcon(ico)}
                      className={`p-1 rounded-md border transition-all cursor-pointer ${newPriorityIcon === ico ? 'bg-zinc-700 border-zinc-500 text-white' : 'border-zinc-800 text-zinc-400 hover:text-zinc-200'}`}
                    >
                      {renderPriorityIcon(ico, newPriorityColor, "w-3 h-3")}
                    </button>
                  ))}
                </div>

                <div className="flex items-center justify-end pt-1">
                  <button
                    type="submit"
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-100 transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Adicionar Prioridade</span>
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* TAB 3: PROPRIEDADES */}
          {activeTab === 'properties' && (
            <div className="space-y-4">
              {/* Existing Properties */}
              <div className="space-y-1 bg-[#13141a]/70 border border-zinc-800/40 p-2 rounded-xl">
                {allDisplayProperties.map(prop => {
                  const isEditing = editingPropId === prop.id
                  return (
                    <div
                      key={prop.id}
                      className="p-2 rounded-lg hover:bg-zinc-800/40 transition-colors space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5 min-w-0">
                          {prop.type === 'context' ? (
                            <Compass className="w-3.5 h-3.5 text-blue-400" />
                          ) : prop.type === 'priority' ? (
                            <Flag className="w-3.5 h-3.5" style={{ color: 'var(--accent, #c59b27)' }} />
                          ) : prop.type === 'date' ? (
                            <Calendar className="w-3.5 h-3.5 text-zinc-400" />
                          ) : prop.id === 'prop_tags' ? (
                            <Tag className="w-3.5 h-3.5 text-zinc-400" />
                          ) : (
                            <Type className="w-3.5 h-3.5 text-zinc-400" />
                          )}
                          <span className={`font-medium text-xs ${prop.hidden ? 'text-zinc-500 line-through' : 'text-zinc-200'} truncate`}>
                            {prop.name}
                          </span>
                          <span className="text-[10px] text-zinc-500 font-mono">({prop.type})</span>
                          {prop.hidden && (
                            <span className="text-[9.5px] px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400 font-medium">
                              Oculto na lista
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5">
                          {/* Edit Property button */}
                          <button
                            type="button"
                            onClick={() => isEditing ? setEditingPropId(null) : handleStartEditProperty(prop)}
                            className="p-1 rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60 transition-colors cursor-pointer"
                            title="Editar propriedade"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>

                          {/* Eye / Olhinho visibility toggle */}
                          <button
                            type="button"
                            onClick={() => handleTogglePropertyHidden(prop.id)}
                            className="p-1 rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60 transition-colors cursor-pointer"
                            title={prop.hidden ? "Exibir coluna na lista" : "Ocultar coluna da lista"}
                          >
                            {prop.hidden ? (
                              <EyeOff className="w-3.5 h-3.5 text-zinc-500" />
                            ) : (
                              <Eye className="w-3.5 h-3.5 text-zinc-300 hover:text-white" />
                            )}
                          </button>

                          {prop.id !== 'prop_context' && prop.id !== 'prop_priority' && prop.id !== 'prop_deadline' && prop.id !== 'prop_status' && prop.id !== 'prop_tags' && (
                            <button
                              onClick={() => handleDeleteProperty(prop.id)}
                              className="text-zinc-500 hover:text-rose-400 p-1 rounded transition-colors cursor-pointer"
                              title="Remover propriedade"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Inline Property & Options Editor */}
                      {isEditing && (
                        <div className="p-3 bg-[#16161a] border border-zinc-700/60 rounded-xl space-y-3 animate-in fade-in duration-100">
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={editingPropName}
                              onChange={e => setEditingPropName(e.target.value)}
                              placeholder="Nome da propriedade..."
                              className="flex-1 bg-[#121215] border border-zinc-700/60 rounded-md px-2.5 py-1 text-xs text-zinc-200 outline-none"
                            />
                            <button
                              type="button"
                              onClick={handleSaveEditPropertyName}
                              className="px-2.5 py-1 rounded text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-100 font-medium"
                            >
                              Atualizar Nome
                            </button>
                          </div>

                          {/* If select or custom options property: allow managing internal items */}
                          {(prop.type === 'select' || prop.options !== undefined) && (
                            <div className="space-y-2 pt-1 border-t border-zinc-800/80">
                              <div className="text-[11px] font-semibold text-zinc-400">Itens / Opções da Propriedade:</div>
                              <div className="flex flex-wrap gap-1.5">
                                {(prop.options || []).map(opt => (
                                  <span
                                    key={opt.id}
                                    className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs border"
                                    style={{ backgroundColor: `${opt.color}15`, borderColor: `${opt.color}40`, color: opt.color }}
                                  >
                                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: opt.color }} />
                                    <span>{opt.name}</span>
                                    <button
                                      type="button"
                                      onClick={() => handleDeletePropertyOption(prop.id, opt.id)}
                                      className="opacity-70 hover:opacity-100 hover:text-rose-400 cursor-pointer text-xs"
                                    >
                                      ×
                                    </button>
                                  </span>
                                ))}
                              </div>

                              {/* Add option to property */}
                              <div className="flex items-center gap-2 pt-1">
                                <input
                                  type="text"
                                  value={newOptionName}
                                  onChange={e => setNewOptionName(e.target.value)}
                                  placeholder="Nova opção..."
                                  className="flex-1 bg-[#121215] border border-zinc-700/60 rounded-md px-2 py-1 text-xs text-zinc-200 outline-none"
                                />
                                <div className="flex items-center gap-1">
                                  {PRESET_COLORS.map(c => (
                                    <button
                                      type="button"
                                      key={c}
                                      onClick={() => setNewOptionColor(c)}
                                      className={`w-3.5 h-3.5 rounded-full transition-transform ${newOptionColor === c ? 'scale-125 ring-2 ring-white/60' : 'opacity-70 hover:opacity-100'}`}
                                      style={{ backgroundColor: c }}
                                    />
                                  ))}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleAddPropertyOption(prop.id)}
                                  className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-zinc-200 cursor-pointer"
                                >
                                  + Opção
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Add New Property Form with Custom Dropdown opening UPWARDS */}
              <form onSubmit={handleAddProperty} className="p-3 bg-[#13141a]/50 border border-zinc-800/40 rounded-xl space-y-2.5">
                <div className="font-semibold text-zinc-300 text-[11px]">Nova Propriedade</div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newPropName}
                    onChange={e => setNewPropName(e.target.value)}
                    placeholder="Nome da propriedade..."
                    className="flex-1 bg-[#14151b] border border-zinc-800 focus:border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none transition-colors"
                  />

                  {/* Custom Property Type Dropdown floating UPWARDS */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setIsPropTypeDropdownOpen(o => !o)}
                      className="flex items-center gap-1.5 bg-[#14151b] border border-zinc-800 hover:bg-zinc-800/60 px-2.5 py-1.5 rounded-lg text-xs text-zinc-200 transition-colors cursor-pointer"
                    >
                      <span>{selectedPropTypeLabel}</span>
                      <ChevronDown className="w-3 h-3 text-zinc-400" />
                    </button>

                    {isPropTypeDropdownOpen && (
                      <div className="absolute z-50 bottom-full right-0 mb-1.5 w-32 bg-[#14151b] border border-zinc-800 rounded-xl shadow-md p-1 space-y-0.5 animate-in fade-in duration-75">
                        {PROPERTY_TYPE_OPTIONS.map(opt => {
                          const isSelected = opt.id === newPropType
                          return (
                            <button
                              type="button"
                              key={opt.id}
                              onClick={() => {
                                setNewPropType(opt.id)
                                setIsPropTypeDropdownOpen(false)
                              }}
                              className={`w-full flex items-center justify-between px-2 py-1 rounded-lg text-xs text-left transition-colors cursor-pointer ${
                                isSelected ? 'bg-zinc-800/70 text-white font-medium' : 'text-zinc-300 hover:bg-zinc-800/40'
                              }`}
                            >
                              <span>{opt.label}</span>
                              {isSelected && <Check className="w-3 h-3 text-zinc-300" />}
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex justify-end pt-1">
                  <button
                    type="submit"
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-100 transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Adicionar Propriedade</span>
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
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
