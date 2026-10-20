import React, { useState } from 'react'
import type { TaskSettings, TaskStatusOption, TaskPropertyConfig } from '../types/tasks'
import { X, Plus, Trash2, Sliders, CheckCircle2, Calendar, Compass, Flag, Type } from 'lucide-react'

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
  '#ef4444', // Red
  '#8b5cf6', // Purple
  '#06b6d4', // Cyan
  '#ec4899'  // Pink
]

export const TaskSettingsModal: React.FC<TaskSettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings
}) => {
  const [activeTab, setActiveTab] = useState<'status' | 'properties'>('status')

  // New status form state
  const [newStatusName, setNewStatusName] = useState('')
  const [newStatusColor, setNewStatusColor] = useState(PRESET_COLORS[0])
  const [newStatusIsCompleted, setNewStatusIsCompleted] = useState(false)

  // New property form state
  const [newPropName, setNewPropName] = useState('')
  const [newPropType, setNewPropType] = useState<TaskPropertyConfig['type']>('text')

  if (!isOpen) return null

  const handleAddStatus = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newStatusName.trim()) return

    const newStatus: TaskStatusOption = {
      id: `status_${Date.now()}`,
      name: newStatusName.trim(),
      color: newStatusColor,
      isCompleted: newStatusIsCompleted
    }

    onUpdateSettings({
      ...settings,
      statuses: [...settings.statuses, newStatus]
    })
    setNewStatusName('')
    setNewStatusIsCompleted(false)
  }

  const handleDeleteStatus = (statusId: string) => {
    if (settings.statuses.length <= 1) {
      alert('Você precisa manter pelo menos um status configurado.')
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
    setNewPropType('text')
  }

  const handleDeleteProperty = (propId: string) => {
    onUpdateSettings({
      ...settings,
      properties: settings.properties.filter(p => p.id !== propId)
    })
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-[#18181d] border border-zinc-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col text-xs text-zinc-100 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-5 py-4 border-b border-zinc-800 bg-[#141418] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-zinc-100">Configurações de Tarefas</h2>
              <p className="text-[11px] text-zinc-400">Personalize status, colunas e propriedades do workspace de tarefas</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="px-5 pt-3 pb-0 flex items-center gap-2 border-b border-zinc-800/80 bg-[#141418]">
          <button
            onClick={() => setActiveTab('status')}
            className={`pb-2.5 px-2 font-medium text-xs border-b-2 transition-all cursor-pointer ${
              activeTab === 'status'
                ? 'border-amber-400 text-zinc-100'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Opções de Status ({settings.statuses.length})
          </button>
          <button
            onClick={() => setActiveTab('properties')}
            className={`pb-2.5 px-2 font-medium text-xs border-b-2 transition-all cursor-pointer ${
              activeTab === 'properties'
                ? 'border-amber-400 text-zinc-100'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Propriedades / Colunas ({settings.properties.length})
          </button>
        </div>

        {/* Body Content */}
        <div className="p-5 overflow-y-auto max-h-[460px] custom-chat-scrollbar space-y-4">
          {activeTab === 'status' && (
            <div className="space-y-4">
              {/* Existing Status List */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-medium text-zinc-400 block uppercase tracking-wider">Status Ativos</span>
                <div className="space-y-1 bg-zinc-900/60 p-2 rounded-xl border border-zinc-800/80">
                  {settings.statuses.map(st => (
                    <div
                      key={st.id}
                      className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-zinc-800/50 border border-zinc-750/60"
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: st.color }} />
                        <span className="font-medium text-zinc-200">{st.name}</span>
                        {st.isCompleted && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                            Finaliza tarefa
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => handleDeleteStatus(st.id)}
                        className="text-zinc-500 hover:text-rose-400 p-1 rounded transition-colors"
                        title="Remover status"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Add New Status */}
              <form onSubmit={handleAddStatus} className="p-3 bg-zinc-900/80 border border-zinc-800 rounded-xl space-y-3">
                <span className="text-[11px] font-medium text-zinc-300 block">Criar Novo Status</span>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newStatusName}
                    onChange={e => setNewStatusName(e.target.value)}
                    placeholder="Nome do status (ex: Aguardando Cliente)"
                    className="flex-1 bg-zinc-950 border border-zinc-750 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-amber-500"
                  />
                  <div className="flex items-center gap-1">
                    {PRESET_COLORS.map(c => (
                      <button
                        type="button"
                        key={c}
                        onClick={() => setNewStatusColor(c)}
                        className={`w-5 h-5 rounded-full border transition-transform ${
                          newStatusColor === c ? 'scale-125 border-white shadow-xs' : 'border-transparent'
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
                      className="rounded border-zinc-700 text-amber-500 focus:ring-0"
                    />
                    <span>Marcar este status como concluído</span>
                  </label>

                  <button
                    type="submit"
                    className="flex items-center gap-1 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold rounded-lg text-xs transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                    <span>Adicionar Status</span>
                  </button>
                </div>
              </form>
            </div>
          )}

          {activeTab === 'properties' && (
            <div className="space-y-4">
              {/* Existing Properties */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-medium text-zinc-400 block uppercase tracking-wider">Propriedades Configuradas</span>
                <div className="space-y-1 bg-zinc-900/60 p-2 rounded-xl border border-zinc-800/80">
                  {settings.properties.map(prop => (
                    <div
                      key={prop.id}
                      className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-zinc-800/50 border border-zinc-750/60"
                    >
                      <div className="flex items-center gap-2">
                        {prop.type === 'context' ? (
                          <Compass className="w-3.5 h-3.5 text-blue-400" />
                        ) : prop.type === 'priority' ? (
                          <Flag className="w-3.5 h-3.5 text-amber-400" />
                        ) : prop.type === 'date' ? (
                          <Calendar className="w-3.5 h-3.5 text-emerald-400" />
                        ) : prop.type === 'status' ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-purple-400" />
                        ) : (
                          <Type className="w-3.5 h-3.5 text-zinc-400" />
                        )}
                        <span className="font-medium text-zinc-200">{prop.name}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-700/60 text-zinc-300 font-mono">
                          {prop.type}
                        </span>
                      </div>
                      {prop.id !== 'prop_status' && prop.id !== 'prop_context' && (
                        <button
                          onClick={() => handleDeleteProperty(prop.id)}
                          className="text-zinc-500 hover:text-rose-400 p-1 rounded transition-colors"
                          title="Remover propriedade"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Add New Property */}
              <form onSubmit={handleAddProperty} className="p-3 bg-zinc-900/80 border border-zinc-800 rounded-xl space-y-3">
                <span className="text-[11px] font-medium text-zinc-300 block">Criar Nova Propriedade</span>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={newPropName}
                    onChange={e => setNewPropName(e.target.value)}
                    placeholder="Nome da propriedade (ex: Responsável)"
                    className="bg-zinc-950 border border-zinc-750 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-amber-500"
                  />
                  <select
                    value={newPropType}
                    onChange={e => setNewPropType(e.target.value as any)}
                    className="bg-zinc-950 border border-zinc-750 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-amber-500"
                  >
                    <option value="text">Texto simples</option>
                    <option value="number">Número / Valor</option>
                    <option value="date">Data / Horário</option>
                    <option value="select">Seleção / Tag</option>
                  </select>
                </div>

                <div className="flex justify-end pt-1">
                  <button
                    type="submit"
                    className="flex items-center gap-1 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold rounded-lg text-xs transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                    <span>Adicionar Propriedade</span>
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-zinc-800 bg-[#141418] flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium rounded-lg text-xs transition-colors"
          >
            Concluir
          </button>
        </div>
      </div>
    </div>
  )
}
export default TaskSettingsModal
