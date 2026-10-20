import React, { useState } from 'react'
import type { TaskSettings, TaskStatusOption, TaskPropertyConfig } from '../types/tasks'
import { X, Plus, Trash2, Sliders, Calendar, Compass, Flag, Type, ChevronDown, Check } from 'lucide-react'

interface TaskSettingsModalProps {
  isOpen: boolean
  onClose: () => void
  settings: TaskSettings
  onUpdateSettings: (newSettings: TaskSettings) => void
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

export const TaskSettingsModal: React.FC<TaskSettingsModalProps> = ({
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

  // Form states for adding new property
  const [newPropName, setNewPropName] = useState('')
  const [newPropType, setNewPropType] = useState<TaskPropertyConfig['type']>('text')
  const [isPropTypeDropdownOpen, setIsPropTypeDropdownOpen] = useState(false)

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
      ...settings,
      statuses: [...settings.statuses, newOption]
    })

    setNewStatusName('')
    setNewStatusIsCompleted(false)
  }

  const handleDeleteStatus = (statusId: string) => {
    if (settings.statuses.length <= 1) {
      alert('Você precisa ter pelo menos um status configurado.')
      return
    }
    onUpdateSettings({
      ...settings,
      statuses: settings.statuses.filter(s => s.id !== statusId)
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
      ...settings,
      properties: [...settings.properties, newProp]
    })

    setNewPropName('')
  }

  const handleDeleteProperty = (propId: string) => {
    onUpdateSettings({
      ...settings,
      properties: settings.properties.filter(p => p.id !== propId)
    })
  }

  const selectedPropTypeLabel = PROPERTY_TYPE_OPTIONS.find(o => o.id === newPropType)?.label || 'Texto'

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 select-none">
      <div className="w-full max-w-lg bg-[#111114] rounded-2xl shadow-2xl overflow-hidden flex flex-col text-xs text-zinc-100 animate-in fade-in zoom-in-95 duration-100">
        {/* Header - No harsh divider line */}
        <div className="px-5 py-3.5 bg-[#0e0e11] flex items-center justify-between">
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
        <div className="px-5 pt-3 pb-1 flex items-center gap-2 bg-[#0e0e11]">
          <button
            onClick={() => setActiveTab('status')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
              activeTab === 'status'
                ? 'bg-zinc-800/90 text-zinc-100 font-semibold shadow-xs'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-850/40'
            }`}
            style={activeTab === 'status' ? { color: 'var(--accent, #ffffff)' } : undefined}
          >
            Status ({settings.statuses.length})
          </button>
          <button
            onClick={() => setActiveTab('properties')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
              activeTab === 'properties'
                ? 'bg-zinc-800/90 text-zinc-100 font-semibold shadow-xs'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-850/40'
            }`}
            style={activeTab === 'properties' ? { color: 'var(--accent, #ffffff)' } : undefined}
          >
            Propriedades ({settings.properties.length})
          </button>
        </div>

        {/* Body Content - Separated by soft tonal backgrounds without lines */}
        <div className="p-5 overflow-y-auto max-h-[460px] custom-chat-scrollbar space-y-4">
          {activeTab === 'status' && (
            <div className="space-y-4">
              {/* Existing Status List */}
              <div className="space-y-1 bg-zinc-950/30 p-2 rounded-xl">
                {settings.statuses.map(st => (
                  <div
                    key={st.id}
                    className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-zinc-850/40 transition-colors"
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
              <form onSubmit={handleAddStatus} className="p-3 bg-zinc-950/20 rounded-xl space-y-2.5">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newStatusName}
                    onChange={e => setNewStatusName(e.target.value)}
                    placeholder="Nome do status..."
                    className="flex-1 bg-zinc-900/80 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:bg-zinc-900 transition-colors"
                  />
                  <div className="flex items-center gap-1">
                    {PRESET_COLORS.map(c => (
                      <button
                        type="button"
                        key={c}
                        onClick={() => setNewStatusColor(c)}
                        className={`w-4 h-4 rounded-full transition-transform cursor-pointer ${
                          newStatusColor === c ? 'scale-125 ring-2 ring-white/60 shadow-xs' : 'opacity-80 hover:opacity-100'
                        }`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
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
              <div className="space-y-1 bg-zinc-950/30 p-2 rounded-xl">
                {settings.properties.map(prop => (
                  <div
                    key={prop.id}
                    className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-zinc-850/40 transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      {prop.type === 'context' ? (
                        <Compass className="w-3.5 h-3.5 text-blue-400" />
                      ) : prop.type === 'priority' ? (
                        <Flag className="w-3.5 h-3.5" style={{ color: 'var(--accent, #c59b27)' }} />
                      ) : prop.type === 'date' ? (
                        <Calendar className="w-3.5 h-3.5 text-zinc-400" />
                      ) : (
                        <Type className="w-3.5 h-3.5 text-zinc-400" />
                      )}
                      <span className="font-medium text-zinc-200 text-xs">{prop.name}</span>
                      <span className="text-[10px] text-zinc-500 font-mono">({prop.type})</span>
                    </div>
                    {prop.id !== 'prop_context' && prop.id !== 'prop_priority' && prop.id !== 'prop_deadline' && (
                      <button
                        onClick={() => handleDeleteProperty(prop.id)}
                        className="text-zinc-500 hover:text-rose-400 p-1 rounded transition-colors cursor-pointer"
                        title="Remover propriedade"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Add New Property Form with Custom Dropdown */}
              <form onSubmit={handleAddProperty} className="p-3 bg-zinc-950/20 rounded-xl space-y-2.5">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newPropName}
                    onChange={e => setNewPropName(e.target.value)}
                    placeholder="Nome da propriedade..."
                    className="flex-1 bg-zinc-900/80 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:bg-zinc-900 transition-colors"
                  />

                  {/* Custom Property Type Dropdown */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setIsPropTypeDropdownOpen(o => !o)}
                      className="flex items-center gap-1.5 bg-zinc-900/80 hover:bg-zinc-850 px-2.5 py-1.5 rounded-lg text-xs text-zinc-200 transition-colors cursor-pointer"
                    >
                      <span>{selectedPropTypeLabel}</span>
                      <ChevronDown className="w-3 h-3 text-zinc-400" />
                    </button>

                    {isPropTypeDropdownOpen && (
                      <div className="absolute z-50 top-full right-0 mt-1 w-28 bg-[#18181e] border border-zinc-800 rounded-xl shadow-2xl p-1 space-y-0.5 animate-in fade-in duration-100">
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
                                isSelected ? 'bg-zinc-800 text-white font-medium' : 'text-zinc-300 hover:bg-zinc-800/40'
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
export default TaskSettingsModal
