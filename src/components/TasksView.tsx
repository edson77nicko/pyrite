import React, { useState } from 'react'
import type { TaskItem, TaskSettings, TaskPriority } from '../types/tasks'
import type { Note } from '../types'
import { TaskSettingsModal } from './TaskSettingsModal'
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
      return !t.completed && (t.date === todayStr || t.deadline === todayStr)
    }
    if (filterView === 'scheduled') {
      return !t.completed && (!!t.date || !!t.deadline)
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
      <div className="h-14 px-6 border-b border-zinc-800 bg-[#121215] flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-zinc-100 tracking-tight">Tasks</h1>
            <span className="text-[10px] text-zinc-400">{tasks.filter(t => !t.completed).length} pendentes</span>
          </div>
        </div>

        {/* Filter View Pills */}
        <div className="flex items-center gap-1 bg-zinc-900/90 p-1 rounded-xl border border-zinc-800">
          {[
            { id: 'all', label: 'Todas' },
            { id: 'today', label: 'Hoje' },
            { id: 'scheduled', label: 'Agendadas' },
            { id: 'completed', label: 'Concluídas' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setFilterView(tab.id as FilterView)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                filterView === tab.id
                  ? 'bg-zinc-800 text-zinc-100 shadow-xs border border-zinc-700/80'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Right Tools: Search, Settings Gear & New Task */}
        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="relative flex items-center">
            <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Buscar tarefas..."
              className="w-44 pl-8 pr-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-amber-500/80"
            />
          </div>

          {/* Settings Gear Button */}
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="p-2 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80 rounded-lg border border-zinc-800 transition-colors cursor-pointer"
            title="Configurações das Tarefas (Propriedades e Status)"
          >
            <Settings className="w-4 h-4" />
          </button>

          {/* New Task Button */}
          <button
            onClick={() => onCreateTask()}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold rounded-lg text-xs transition-colors shadow-sm cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Nova Tarefa</span>
          </button>
        </div>
      </div>

      {/* 2. Main Database Table (Inspired by reference print 1) */}
      <div className="flex-1 overflow-x-auto overflow-y-auto custom-chat-scrollbar">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-zinc-800/80 bg-zinc-950/40 text-zinc-400 uppercase text-[10px] tracking-wider font-semibold">
              <th className="w-10 px-4 py-2.5"></th>
              <th className="px-4 py-2.5">Tarefa</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5">Prioridade</th>
              <th className="px-4 py-2.5">Deadline</th>
              <th className="px-4 py-2.5">Contexto (Nota)</th>
              <th className="px-4 py-2.5">Tags</th>
              <th className="w-12 px-4 py-2.5 text-right"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/40 font-normal">
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
                        ? 'bg-amber-500/10 hover:bg-amber-500/15'
                        : 'hover:bg-zinc-800/40'
                    }`}
                  >
                    {/* Checkbox */}
                    <td className="px-4 py-2.5">
                      <button
                        onClick={e => handleToggleComplete(task, e)}
                        className="transition-transform hover:scale-110 cursor-pointer flex items-center justify-center"
                      >
                        {task.completed ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        ) : (
                          <Circle className="w-4 h-4 text-zinc-600 group-hover:text-amber-400" />
                        )}
                      </button>
                    </td>

                    {/* Task Title */}
                    <td className="px-4 py-2.5 font-medium text-zinc-100 max-w-xs truncate">
                      <span className={task.completed ? 'line-through text-zinc-500' : ''}>
                        {task.title}
                      </span>
                    </td>

                    {/* Status Pill */}
                    <td className="px-4 py-2.5">
                      <span
                        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium"
                        style={{
                          backgroundColor: `${statusObj.color}22`,
                          color: statusObj.color,
                          border: `1px solid ${statusObj.color}44`
                        }}
                      >
                        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: statusObj.color }} />
                        {statusObj.name}
                      </span>
                    </td>

                    {/* Priority Pill */}
                    <td className="px-4 py-2.5">
                      {task.priority !== 'none' ? (
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium"
                          style={{
                            backgroundColor: priorityInfo.bg,
                            color: priorityInfo.color
                          }}
                        >
                          <Flag className="w-3 h-3" />
                          {priorityInfo.label}
                        </span>
                      ) : (
                        <span className="text-zinc-600">-</span>
                      )}
                    </td>

                    {/* Deadline */}
                    <td className="px-4 py-2.5 text-zinc-300">
                      {task.deadline ? (
                        <div className="flex items-center gap-1.5">
                          <Hourglass className="w-3.5 h-3.5 text-zinc-500" />
                          <span>{task.deadline}</span>
                          {task.deadline === todayStr && (
                            <span className="text-[9.5px] px-1 rounded bg-amber-500/20 text-amber-300 font-medium">
                              Hoje
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-zinc-600">-</span>
                      )}
                    </td>

                    {/* Context (Nota vinculada) */}
                    <td className="px-4 py-2.5">
                      {task.contextNoteId ? (
                        <span
                          onClick={e => {
                            e.stopPropagation()
                            onOpenNote(task.contextNoteId!)
                          }}
                          className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-zinc-800/90 border border-zinc-700/80 text-amber-300 hover:text-amber-200 hover:border-amber-500/60 transition-colors text-[11px] font-medium max-w-[190px] truncate"
                          title="Abrir nota vinculada no editor"
                        >
                          <Compass className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          <span className="truncate">{task.contextNoteTitle || 'Nota'}</span>
                        </span>
                      ) : (
                        <span className="text-zinc-600">-</span>
                      )}
                    </td>

                    {/* Tags */}
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1 flex-wrap">
                        {task.tags.map(tag => (
                          <span
                            key={tag}
                            className="px-1.5 py-0.5 rounded bg-zinc-800 text-[10px] text-zinc-400 font-mono"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    </td>

                    {/* Row Action */}
                    <td className="px-4 py-2.5 text-right">
                      <button
                        onClick={e => {
                          e.stopPropagation()
                          if (confirm(`Excluir "${task.title}"?`)) {
                            onDeleteTask(task.id)
                          }
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1 text-zinc-500 hover:text-rose-400 rounded transition-opacity"
                        title="Excluir tarefa"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                )
              })
            )}

            {/* Inline Quick Add Row */}
            <tr className="bg-zinc-950/20">
              <td className="px-4 py-2.5 text-center">
                <Plus className="w-3.5 h-3.5 text-zinc-600" />
              </td>
              <td colSpan={7} className="px-4 py-2.5">
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
