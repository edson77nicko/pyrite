import React, { useState } from 'react'
import type { TaskSettings, TaskStatusOption, TaskPropertyConfig } from '../types/tasks'
import { X, Plus, Trash2, Sliders, Calendar, Compass, Flag, Type } from 'lucide-react'

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

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 select-none">
      <div className="w-full max-w-lg bg-[#121215] border border-zinc-800/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col text-xs text-zinc-100 animate-in fade-in zoom-in-95 duration-150">
        {/* Header - Sober & Minimal */}
        <div className="px-5 py-3.5 border-b border-zinc-800/60 flex items-center justify-between">
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

        {/* Navigation Tabs - Flat and clean */}
        <div className="px-5 pt-2 flex items-center gap-4 border-b border-zinc-800/60">
          <button
            onClick={() => setActiveTab('status')}
            className={`pb-2 text-xs font-medium border-b-2 transition-all cursor-pointer ${
              activeTab === 'status'
                ? 'text-zinc-100 font-semibold'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
            style={activeTab === 'status' ? { borderBottomColor: 'var(--accent, #c59b27)', color: 'var(--accent, #c59b27)' } : undefined}
          >
            Status ({settings.statuses.length})
          </button>
          <button
            onClick={() => setActiveTab('properties')}
            className={`pb-2 text-xs font-medium border-b-2 transition-all cursor-pointer ${
              activeTab === 'properties'
                ? 'text-zinc-100 font-semibold'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
            style={activeTab === 'properties' ? { borderBottomColor: 'var(--accent, #c59b27)', color: 'var(--accent, #c59b27)' } : undefined}
          >
            Propriedades / Colunas ({settings.properties.length})
          </button>
        </div>

        {/* Body Content */}
        <div className="p-5 overflow-y-auto max-h-[460px] custom-chat-scrollbar space-y-4">
          {activeTab === 'status' && (
            <div className="space-y-4">
              {/* Existing Status List - Flat rows, no nested cards */}
              <div className="space-y-1">
                <span className="text-[10.5px] font-medium text-zinc-400 uppercase tracking-wider block mb-1">
                  Status Ativos
                </span>
                <div className="divide-y divide-zinc-850/60 border border-zinc-800/60 rounded-xl overflow-hidden bg-zinc-900/30">
                  {settings.statuses.map(st => (
                    <div
                      key={st.id}
                      className="flex items-center justify-between px-3 py-2 hover:bg-zinc-850/40 transition-colors"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: st.color }} />
                        <span className="font-medium text-zinc-200 text-xs">{st.name}</span>
                        {st.isCompleted && (
                          <span className="text-[9.5px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-medium">
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
              </div>

              {/* Add New Status Form - Minimalist */}
              <form onSubmit={handleAddStatus} className="pt-2 border-t border-zinc-800/60 space-y-2.5">
                <span className="text-[10.5px] font-medium text-zinc-400 uppercase tracking-wider block">
                  Novo Status
                </span>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newStatusName}
                    onChange={e => setNewStatusName(e.target.value)}
                    placeholder="Nome do status (ex: Em Revisão)..."
                    className="flex-1 bg-zinc-900/80 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-zinc-600 transition-colors"
                  />
                  <div className="flex items-center gap-1">
                    {PRESET_COLORS.map(c => (
                      <button
                        type="button"
                        key={c}
                        onClick={() => setNewStatusColor(c)}
                        className={`w-4.5 h-4.5 rounded-full transition-transform cursor-pointer ${
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
                    <span>Marca tarefa como concluída</span>
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
              {/* Existing Properties - Flat & sober */}
              <div className="space-y-1">
                <span className="text-[10.5px] font-medium text-zinc-400 uppercase tracking-wider block mb-1">
                  Propriedades Ativas
                </span>
                <div className="divide-y divide-zinc-850/60 border border-zinc-800/60 rounded-xl overflow-hidden bg-zinc-900/30">
                  {settings.properties.map(prop => (
                    <div
                      key={prop.id}
                      className="flex items-center justify-between px-3 py-2 hover:bg-zinc-850/40 transition-colors"
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
              </div>

              {/* Add New Property Form */}
              <form onSubmit={handleAddProperty} className="pt-2 border-t border-zinc-800/60 space-y-2.5">
                <span className="text-[10.5px] font-medium text-zinc-400 uppercase tracking-wider block">
                  Nova Propriedade
                </span>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newPropName}
                    onChange={e => setNewPropName(e.target.value)}
                    placeholder="Nome da coluna/propriedade..."
                    className="flex-1 bg-zinc-900/80 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-zinc-600 transition-colors"
                  />
                  <select
                    value={newPropType}
                    onChange={e => setNewPropType(e.target.value as any)}
                    className="bg-zinc-900/80 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none cursor-pointer"
                  >
                    <option value="text">Texto</option>
                    <option value="date">Data</option>
                    <option value="select">Seleção</option>
                    <option value="number">Número</option>
                  </select>
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
