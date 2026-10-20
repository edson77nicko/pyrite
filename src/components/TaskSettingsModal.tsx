import React, { useState, useEffect, useMemo, useRef, Component, type ErrorInfo, type ReactNode } from 'react'
import type { TaskSettings, TaskStatusOption, TaskPropertyConfig } from '../types/tasks'
import { DEFAULT_TASK_SETTINGS } from '../utils/taskStorage'
import { X, Plus, Trash2, Sliders, Calendar, Compass, Flag, Type, ChevronDown, Check, Eye, EyeOff, Tag } from 'lucide-react'
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

export const TaskSettingsModalContent: React.FC<TaskSettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings
}) => {
  const [activeTab, setActiveTab] = useState<'status' | 'properties'>('status')

  // Form states for adding new status
  const [newStatusName, setNewStatusName] = useState('')
  const [newStatusColor, setNewStatusColor] = useState(PRESET_COLORS[0])
  const [newStatusIsCompleted, setNewStatusIsCompleted] = useState(false)
  const [isStatusColorPickerOpen, setIsStatusColorPickerOpen] = useState(false)
  const statusColorBtnRef = useRef<HTMLButtonElement>(null)

  // Form states for adding new property
  const [newPropName, setNewPropName] = useState('')
  const [newPropType, setNewPropType] = useState<TaskPropertyConfig['type']>('text')
  const [isPropTypeDropdownOpen, setIsPropTypeDropdownOpen] = useState(false)

  const safeStatuses = useMemo(() => {
    return Array.isArray(settings?.statuses) && settings.statuses.length > 0
      ? settings.statuses
      : DEFAULT_TASK_SETTINGS.statuses
  }, [settings?.statuses])

  const safeProperties = useMemo(() => {
    return Array.isArray(settings?.properties) && settings.properties.length > 0
      ? settings.properties
      : DEFAULT_TASK_SETTINGS.properties
  }, [settings?.properties])

  // Ensure default standard properties exist if not already present
  const allDisplayProperties = useMemo(() => {
    const list = [...safeProperties]
    if (!list.some(p => p.id === 'prop_tags')) {
      list.push({ id: 'prop_tags', name: 'Tags', type: 'text' })
    }
    return list
  }, [safeProperties])

  // Keyboard Escape listener
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  // Now return null safely AFTER all hooks are defined
  if (!isOpen) return null

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
      statuses: [...safeStatuses, newOption],
      properties: safeProperties
    })

    setNewStatusName('')
    setNewStatusIsCompleted(false)
  }

  const handleDeleteStatus = (statusId: string) => {
    if (safeStatuses.length <= 1) {
      alert('Você precisa ter pelo menos um status configurado.')
      return
    }
    onUpdateSettings({
      statuses: safeStatuses.filter(s => s.id !== statusId),
      properties: safeProperties
    })
  }

  const handleAddProperty = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newPropName.trim()) return

    const newProp: TaskPropertyConfig = {
      id: `prop_${Date.now()}`,
      name: newPropName.trim(),
      type: newPropType
    }

    onUpdateSettings({
      statuses: safeStatuses,
      properties: [...safeProperties, newProp]
    })

    setNewPropName('')
  }

  const handleDeleteProperty = (propId: string) => {
    onUpdateSettings({
      statuses: safeStatuses,
      properties: safeProperties.filter(p => p.id !== propId)
    })
  }

  const handleTogglePropertyHidden = (propId: string) => {
    onUpdateSettings({
      statuses: safeStatuses,
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
        className="w-full max-w-lg bg-[#0f0f13] border border-zinc-800 rounded-2xl shadow-xl overflow-hidden flex flex-col text-xs text-zinc-100 animate-in zoom-in-95 duration-100"
      >
        {/* Header - Unified with app header style */}
        <div className="px-5 py-3.5 bg-[#0c0c0f] border-b border-zinc-800/60 flex items-center justify-between">
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

        {/* Navigation Tabs - Sober pills with subtle tones */}
        <div className="px-5 pt-3 pb-2 flex items-center gap-2 bg-[#0c0c0f]">
          <button
            onClick={() => setActiveTab('status')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
              activeTab === 'status'
                ? 'bg-zinc-800 text-zinc-100 font-semibold shadow-xs'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-850/40'
            }`}
            style={activeTab === 'status' ? { color: 'var(--accent, #ffffff)' } : undefined}
          >
            Status ({safeStatuses.length})
          </button>
          <button
            onClick={() => setActiveTab('properties')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
              activeTab === 'properties'
                ? 'bg-zinc-800 text-zinc-100 font-semibold shadow-xs'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-850/40'
            }`}
            style={activeTab === 'properties' ? { color: 'var(--accent, #ffffff)' } : undefined}
          >
            Propriedades ({allDisplayProperties.length})
          </button>
        </div>

        {/* Body Content - Separated by soft tonal backgrounds without lines */}
        <div className="p-5 overflow-y-auto max-h-[460px] custom-chat-scrollbar space-y-4">
          {activeTab === 'status' && (
            <div className="space-y-4">
              {/* Existing Status List */}
              <div className="space-y-1 bg-[#13141a]/70 border border-zinc-800/40 p-2 rounded-xl">
                {safeStatuses.map(st => (
                  <div
                    key={st.id}
                    className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-zinc-800/40 transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: st.color }} />
                      <span className="font-medium text-zinc-200 text-xs">{st.name}</span>
                      {st.isCompleted && (
                        <span className="text-[9.5px] px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-400 font-medium">
                          Conclusão
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => handleDeleteStatus(st.id)}
                      className="text-zinc-500 hover:text-rose-400 p-1 rounded transition-colors cursor-pointer"
                      title="Remover status"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              {/* Add New Status Form - Tone-separated */}
              <form onSubmit={handleAddStatus} className="p-3 bg-[#13141a]/50 border border-zinc-800/30 rounded-xl space-y-2.5">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newStatusName}
                    onChange={e => setNewStatusName(e.target.value)}
                    placeholder="Nome do status..."
                    className="flex-1 bg-[#14151b] border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-700 transition-colors"
                  />
                  <div className="flex items-center gap-1">
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

                    {/* Custom Color Dot */}
                    <div className="relative flex items-center">
                      <button
                        ref={statusColorBtnRef}
                        type="button"
                        onClick={() => setIsStatusColorPickerOpen(o => !o)}
                        className={`w-4 h-4 rounded-full transition-transform cursor-pointer ${
                          !PRESET_COLORS.includes(newStatusColor) ? 'scale-125 ring-2 ring-white/60 shadow-xs' : 'opacity-80 hover:opacity-100'
                        }`}
                        style={{
                          background: 'conic-gradient(from 0deg, #ef4444, #f97316, #f59e0b, #10b981, #06b6d4, #3b82f6, #8b5cf6, #ec4899, #ef4444)'
                        }}
                        title="Cor personalizada..."
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
                </div>

                <div className="flex items-center justify-between pt-1">
                  <label className="flex items-center gap-2 cursor-pointer text-zinc-300 text-[11px]">
                    <input
                      type="checkbox"
                      checked={newStatusIsCompleted}
                      onChange={e => setNewStatusIsCompleted(e.target.checked)}
                      className="rounded border-zinc-700 focus:ring-0"
                    />
                    <span>Marca como concluída</span>
                  </label>

                  <button
                    type="submit"
                    className="flex items-center gap-1 px-3 py-1.5 font-medium rounded-lg text-xs transition-opacity hover:opacity-90 cursor-pointer shadow-sm"
                    style={{
                      backgroundColor: 'var(--accent, #c59b27)',
                      color: '#09090b'
                    }}
                  >
                    <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                    <span>Adicionar</span>
                  </button>
                </div>
              </form>
            </div>
          )}

          {activeTab === 'properties' && (
            <div className="space-y-4">
              {/* Existing Properties */}
              <div className="space-y-1 bg-[#13141a]/70 border border-zinc-800/40 p-2 rounded-xl">
                {allDisplayProperties.map(prop => (
                  <div
                    key={prop.id}
                    className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-zinc-800/40 transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
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
                      <span className={`font-medium text-xs ${prop.hidden ? 'text-zinc-500 line-through' : 'text-zinc-200'}`}>
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
                ))}
              </div>

              {/* Add New Property Form with Custom Dropdown opening UPWARDS */}
              <form onSubmit={handleAddProperty} className="p-3 bg-[#13141a]/50 border border-zinc-800/40 rounded-xl space-y-2.5">
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
                              {isSelected && <Check className="w-3 h-3 text-zinc-400" />}
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>

                  <button
                    type="submit"
                    className="flex items-center gap-1 px-3 py-1.5 font-medium rounded-lg text-xs transition-opacity hover:opacity-90 cursor-pointer shadow-sm"
                    style={{
                      backgroundColor: 'var(--accent, #c59b27)',
                      color: '#09090b'
                    }}
                  >
                    <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                    <span>Adicionar</span>
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

export const TaskSettingsModal: React.FC<TaskSettingsModalProps> = (props) => {
  return (
    <ModalErrorBoundary onClose={props.onClose}>
      <TaskSettingsModalContent {...props} />
    </ModalErrorBoundary>
  )
}

export default TaskSettingsModal
