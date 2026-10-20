import React, { useState } from 'react'
import type { TaskItem, TaskSettings, TaskPriority } from '../types/tasks'
import type { Note } from '../types'
import { TaskSettingsModal } from './TaskSettingsModal'
import { CustomDatePickerPopover } from './CustomDatePickerPopover'
import {
  CheckCircle2,
  Circle,
  Plus,
  Settings,
  Search,
  Hourglass,
  Flag,
  Compass,
  Trash2
} from 'lucide-react'

interface TasksViewProps {
  tasks: TaskItem[]
  allNotes: Note[]
  settings: TaskSettings
  selectedTaskId?: string | null
  onSelectTask: (task: TaskItem | null) => void
  onCreateTask: (initialTitle?: string) => void
  onUpdateTask: (task: TaskItem) => void
  onDeleteTask: (taskId: string) => void
  onUpdateSettings: (settings: TaskSettings) => void
  onOpenNote: (noteId: string) => void
}

type FilterView = 'all' | 'today' | 'scheduled' | 'completed'

const PRIORITY_BADGES: Record<TaskPriority, { label: string; color: string; bg: string }> = {
  none: { label: '-', color: '#71717a', bg: 'transparent' },
  low: { label: 'Baixa', color: '#60a5fa', bg: 'rgba(59, 130, 246, 0.12)' },
  medium: { label: 'Média', color: '#fbbf24', bg: 'rgba(245, 158, 11, 0.12)' },
  high: { label: 'Alta', color: '#fb923c', bg: 'rgba(249, 115, 22, 0.12)' },
  urgent: { label: 'Urgente', color: '#f87171', bg: 'rgba(239, 68, 68, 0.15)' }
}

export const TasksView: React.FC<TasksViewProps> = ({
  tasks,
  allNotes: _allNotes,
  settings,
  selectedTaskId,
  onSelectTask,
  onCreateTask,
  onUpdateTask,
  onDeleteTask,
  onUpdateSettings,
  onOpenNote
}) => {
  const [filterView, setFilterView] = useState<FilterView>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [newTaskInput, setNewTaskInput] = useState('')
  const [editingDeadlineTaskId, setEditingDeadlineTaskId] = useState<string | null>(null)

  const todayStr = new Date().toISOString().slice(0, 10)

  // Filter tasks based on view & search
  const filteredTasks = tasks.filter(t => {
    // Text search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      const matchesTitle = t.title.toLowerCase().includes(q)
      const matchesTag = t.tags.some(tag => tag.toLowerCase().includes(q))
      const matchesContext = t.contextNoteTitle?.toLowerCase().includes(q)
      if (!matchesTitle && !matchesTag && !matchesContext) return false
    }

    // Tab filter
    if (filterView === 'today') {
      return !t.completed && ((t.date && t.date.slice(0, 10) === todayStr) || (t.deadline && t.deadline.slice(0, 10) === todayStr))
    }
    if (filterView === 'scheduled') {
      return !t.completed && (Boolean(t.date) || Boolean(t.deadline))
    }
    if (filterView === 'completed') {
      return t.completed
    }
    return true
  })

  const handleToggleComplete = (task: TaskItem, e: React.MouseEvent) => {
    e.stopPropagation()
    const nextCompleted = !task.completed
    let nextStatusId = task.statusId
    if (nextCompleted) {
      const comp = settings.statuses.find(s => s.isCompleted)
      if (comp) nextStatusId = comp.id
    } else {
      const pending = settings.statuses.find(s => !s.isCompleted)
      if (pending) nextStatusId = pending.id
    }

    onUpdateTask({
      ...task,
      completed: nextCompleted,
      statusId: nextStatusId,
      updatedAt: Date.now()
    })
  }

  const handleQuickAddTask = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTaskInput.trim()) return
    onCreateTask(newTaskInput.trim())
    setNewTaskInput('')
  }

  return (
    <div className="w-full h-full flex flex-col bg-[#0f0f12] text-zinc-100 select-none overflow-hidden">
      {/* 1. Header Toolbar */}
      <div className="h-12 px-5 border-b border-zinc-800/80 bg-[#121215] flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center border shadow-xs"
            style={{
              backgroundColor: 'var(--accent-glow-subtle, rgba(197, 155, 39, 0.12))',
              borderColor: 'var(--accent, #c59b27)',
              color: 'var(--accent, #c59b27)'
            }}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
          </div>
          <div className="flex items-center gap-2">
            <h1 className="text-xs font-bold text-zinc-100 uppercase tracking-wider">Tarefas</h1>
            <span
              className="text-[10px] px-1.5 py-0.2 rounded-full font-medium"
              style={{
                backgroundColor: 'var(--accent-glow-subtle, rgba(197, 155, 39, 0.12))',
                color: 'var(--accent, #c59b27)'
              }}
            >
              {tasks.filter(t => !t.completed).length} pendentes
            </span>
          </div>
        </div>

        {/* Filter View Pills */}
        <div className="flex items-center gap-0.5 bg-zinc-900/90 p-0.5 rounded-lg border border-zinc-800/80">
          {[
            { id: 'all', label: 'Todas' },
            { id: 'today', label: 'Hoje' },
            { id: 'scheduled', label: 'Agendadas' },
            { id: 'completed', label: 'Concluídas' }
          ].map(tab => {
            const isActive = filterView === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setFilterView(tab.id as FilterView)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all cursor-pointer ${
                  isActive
                    ? 'shadow-xs font-semibold'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
                style={
                  isActive
                    ? {
                        backgroundColor: 'var(--accent, #c59b27)',
                        color: '#09090b'
                      }
                    : undefined
                }
              >
                {tab.label}
              </button>
            )
          })}
        </div>

        {/* Right Tools: Search, Settings Gear & New Task */}
        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="relative flex items-center">
            <Search className="w-3 h-3 text-zinc-500 absolute left-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Buscar tarefas..."
              className="w-40 pl-7 pr-2.5 py-1 bg-zinc-900/80 border border-zinc-800 rounded-lg text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-700"
            />
          </div>

          {/* Settings Gear Button */}
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80 rounded-lg border border-zinc-800 transition-colors cursor-pointer"
            title="Configurações das Tarefas (Propriedades e Status)"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>

          {/* New Task Button */}
          <button
            onClick={() => onCreateTask()}
            className="flex items-center gap-1.5 px-2.5 py-1 font-semibold rounded-lg text-xs transition-opacity hover:opacity-90 shadow-sm cursor-pointer"
            style={{
              backgroundColor: 'var(--accent, #c59b27)',
              color: '#09090b'
            }}
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Nova Tarefa</span>
          </button>
        </div>
      </div>

      {/* 2. Main Database Table - Compact and tight lines ("linhas mais justas") */}
      <div className="flex-1 overflow-x-auto overflow-y-auto custom-chat-scrollbar">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-zinc-800/60 bg-zinc-950/30 text-zinc-400 uppercase text-[9.5px] tracking-wider font-semibold">
              <th className="w-9 px-3 py-1.5"></th>
              <th className="px-3 py-1.5">Tarefa</th>
              <th className="px-3 py-1.5 w-36">Status</th>
              <th className="px-3 py-1.5 w-28">Prioridade</th>
              <th className="px-3 py-1.5 w-36">Prazo</th>
              <th className="px-3 py-1.5 w-48">Contexto (Nota)</th>
              <th className="px-3 py-1.5">Tags</th>
              <th className="w-10 px-3 py-1.5 text-right"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-850/40 font-normal">
            {filteredTasks.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center py-12 text-zinc-500 text-xs">
                  Nenhuma tarefa encontrada neste filtro.
                </td>
              </tr>
            ) : (
              filteredTasks.map(task => {
                const isSelected = selectedTaskId === task.id
                const statusObj = settings.statuses.find(s => s.id === task.statusId) || settings.statuses[0]
                const priorityInfo = PRIORITY_BADGES[task.priority]

                return (
                  <tr
                    key={task.id}
                    onClick={() => onSelectTask(task)}
                    className={`group transition-colors cursor-pointer ${
                      isSelected
                        ? 'border-l-2'
                        : 'hover:bg-zinc-850/40'
                    }`}
                    style={
                      isSelected
                        ? {
                            backgroundColor: 'var(--accent-glow-subtle, rgba(197, 155, 39, 0.08))',
                            borderLeftColor: 'var(--accent, #c59b27)'
                          }
                        : undefined
                    }
                  >
                    {/* Checkbox */}
                    <td className="px-3 py-1.5">
                      <button
                        onClick={e => handleToggleComplete(task, e)}
                        className="transition-transform hover:scale-110 cursor-pointer flex items-center justify-center"
                      >
                        {task.completed ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Circle
                            className="w-3.5 h-3.5 text-zinc-600 transition-colors"
                            style={{ color: isSelected ? 'var(--accent)' : undefined }}
                          />
                        )}
                      </button>
                    </td>

                    {/* Task Title */}
                    <td className="px-3 py-1.5 font-medium text-zinc-100 max-w-xs truncate">
                      <span className={task.completed ? 'line-through text-zinc-500' : ''}>
                        {task.title}
                      </span>
                    </td>

                    {/* Status Pill */}
                    <td className="px-3 py-1.5">
                      <span
                        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10.5px] font-medium"
                        style={{
                          backgroundColor: `${statusObj.color}20`,
                          color: statusObj.color,
                          border: `1px solid ${statusObj.color}35`
                        }}
                      >
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: statusObj.color }} />
                        <span className="truncate">{statusObj.name}</span>
                      </span>
                    </td>

                    {/* Priority Pill */}
                    <td className="px-3 py-1.5">
                      {task.priority !== 'none' ? (
                        <span
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10.5px] font-medium"
                          style={{
                            backgroundColor: priorityInfo.bg,
                            color: priorityInfo.color
                          }}
                        >
                          <Flag className="w-2.5 h-2.5" />
                          <span>{priorityInfo.label}</span>
                        </span>
                      ) : (
                        <span className="text-zinc-600">-</span>
                      )}
                    </td>

                    {/* Deadline Pill */}
                    <td className="px-3 py-1.5 text-zinc-300 relative">
                      {task.deadline ? (
                        <div
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded hover:bg-zinc-800/60 transition-colors cursor-pointer"
                          onClick={(e) => {
                            e.stopPropagation()
                            setEditingDeadlineTaskId(editingDeadlineTaskId === task.id ? null : task.id)
                          }}
                        >
                          <Hourglass className="w-3 h-3 text-zinc-500" />
                          <span className="text-[11px]">{task.deadline}</span>
                          {task.deadline.slice(0, 10) === todayStr && (
                            <span
                              className="text-[9.5px] px-1 rounded font-medium"
                              style={{
                                backgroundColor: 'var(--accent-glow-subtle, rgba(197, 155, 39, 0.15))',
                                color: 'var(--accent, #c59b27)'
                              }}
                            >
                              Hoje
                            </span>
                          )}
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            setEditingDeadlineTaskId(task.id)
                          }}
                          className="opacity-0 group-hover:opacity-100 text-[10.5px] text-zinc-500 hover:text-zinc-300 transition-opacity"
                        >
                          + prazo
                        </button>
                      )}

                      {editingDeadlineTaskId === task.id && (
                        <CustomDatePickerPopover
                          value={task.deadline}
                          onChange={(newDeadline) => {
                            onUpdateTask({ ...task, deadline: newDeadline, updatedAt: Date.now() })
                            setEditingDeadlineTaskId(null)
                          }}
                          onClose={() => setEditingDeadlineTaskId(null)}
                          align="left"
                        />
                      )}
                    </td>

                    {/* Context (Nota vinculada) */}
                    <td className="px-3 py-1.5">
                      {task.contextNoteId ? (
                        <span
                          onClick={e => {
                            e.stopPropagation()
                            onOpenNote(task.contextNoteId!)
                          }}
                          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-zinc-850/80 border border-zinc-750/60 hover:border-zinc-500 transition-colors text-[11px] font-medium max-w-[190px] truncate"
                          style={{ color: 'var(--accent, #c59b27)' }}
                          title="Abrir nota vinculada no editor"
                        >
                          <Compass className="w-3 h-3 shrink-0" style={{ color: 'var(--accent, #c59b27)' }} />
                          <span className="truncate">{task.contextNoteTitle || 'Nota'}</span>
                        </span>
                      ) : (
                        <span className="text-zinc-600">-</span>
                      )}
                    </td>

                    {/* Tags */}
                    <td className="px-3 py-1.5">
                      <div className="flex items-center gap-1 flex-wrap">
                        {task.tags.map(tag => (
                          <span
                            key={tag}
                            className="px-1.5 py-0.2 rounded bg-zinc-850/70 text-[10px] text-zinc-400 font-mono"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    </td>

                    {/* Row Action */}
                    <td className="px-3 py-1.5 text-right">
                      <button
                        onClick={e => {
                          e.stopPropagation()
                          if (confirm(`Excluir "${task.title}"?`)) {
                            onDeleteTask(task.id)
                          }
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1 text-zinc-500 hover:text-rose-400 rounded transition-opacity cursor-pointer"
                        title="Excluir tarefa"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </td>
                  </tr>
                )
              })
            )}

            {/* Inline Quick Add Row - Tight and fine */}
            <tr className="bg-zinc-950/20">
              <td className="px-3 py-1.5 text-center">
                <Plus className="w-3 h-3 text-zinc-600" />
              </td>
              <td colSpan={7} className="px-3 py-1.5">
                <form onSubmit={handleQuickAddTask} className="flex items-center">
                  <input
                    type="text"
                    value={newTaskInput}
                    onChange={e => setNewTaskInput(e.target.value)}
                    placeholder="+ Adicionar nova tarefa e pressionar Enter..."
                    className="w-full bg-transparent text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none"
                  />
                </form>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* 3. Settings Modal */}
      <TaskSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onUpdateSettings={onUpdateSettings}
      />
    </div>
  )
}
export default TasksView
