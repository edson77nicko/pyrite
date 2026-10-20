import React, { useState, useRef } from 'react'
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
  Trash2,
  List,
  Kanban,
  SlidersHorizontal,
  ChevronDown,
  Check
} from 'lucide-react'

interface TasksViewProps {
  tasks: TaskItem[]
  allNotes: Note[]
  settings: TaskSettings
  selectedTaskId?: string | null
  onSelectTask: (task: TaskItem | null) => void
  onCreateTask: (initialTitle?: string, initialData?: Partial<TaskItem>) => void
  onUpdateTask: (task: TaskItem) => void
  onDeleteTask: (taskId: string) => void
  onUpdateSettings: (settings: TaskSettings) => void
  onOpenNote: (noteId: string) => void
}

type ViewMode = 'list' | 'kanban'
type KanbanGroupBy = 'status' | 'priority'

const PRIORITY_BADGES: Record<TaskPriority, { label: string; color: string; bg: string }> = {
  none: { label: '-', color: '#71717a', bg: 'transparent' },
  low: { label: 'Baixa', color: '#60a5fa', bg: 'rgba(59, 130, 246, 0.12)' },
  medium: { label: 'Média', color: '#fbbf24', bg: 'rgba(245, 158, 11, 0.12)' },
  high: { label: 'Alta', color: '#fb923c', bg: 'rgba(249, 115, 22, 0.12)' },
  urgent: { label: 'Urgente', color: '#f87171', bg: 'rgba(239, 68, 68, 0.15)' }
}

const KANBAN_PRIORITY_COLUMNS: { id: TaskPriority; label: string; color: string }[] = [
  { id: 'urgent', label: 'Urgente', color: '#f87171' },
  { id: 'high', label: 'Alta', color: '#fb923c' },
  { id: 'medium', label: 'Média', color: '#fbbf24' },
  { id: 'low', label: 'Baixa', color: '#60a5fa' },
  { id: 'none', label: 'Sem Prioridade', color: '#71717a' }
]

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
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [kanbanGroupBy, setKanbanGroupBy] = useState<KanbanGroupBy>('status')
  const [isGroupingMenuOpen, setIsGroupingMenuOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)

  // Quick add states
  const [newTaskInput, setNewTaskInput] = useState('')
  const [addingInColumnId, setAddingInColumnId] = useState<string | null>(null)
  const [newColumnTaskTitle, setNewColumnTaskTitle] = useState('')

  // Inline deadline datepicker
  const [editingDeadlineTaskId, setEditingDeadlineTaskId] = useState<string | null>(null)
  const deadlineBtnRef = useRef<HTMLDivElement | null>(null)

  const todayStr = new Date().toISOString().slice(0, 10)

  // Filter tasks based on search
  const filteredTasks = tasks.filter(t => {
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase()
    const matchesTitle = t.title.toLowerCase().includes(q)
    const matchesTag = t.tags.some(tag => tag.toLowerCase().includes(q))
    const matchesContext = t.contextNoteTitle?.toLowerCase().includes(q)
    return matchesTitle || matchesTag || matchesContext
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

  const handleQuickAddInList = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTaskInput.trim()) return
    onCreateTask(newTaskInput.trim())
    setNewTaskInput('')
  }

  const handleQuickAddInColumn = (columnId: string, e: React.FormEvent) => {
    e.preventDefault()
    if (!newColumnTaskTitle.trim()) {
      setAddingInColumnId(null)
      return
    }

    if (kanbanGroupBy === 'status') {
      const isCompletedStatus = settings.statuses.find(s => s.id === columnId)?.isCompleted || false
      onCreateTask(newColumnTaskTitle.trim(), {
        statusId: columnId,
        completed: isCompletedStatus
      })
    } else {
      onCreateTask(newColumnTaskTitle.trim(), {
        priority: columnId as TaskPriority
      })
    }

    setNewColumnTaskTitle('')
    setAddingInColumnId(null)
  }

  return (
    <div className="w-full h-full flex flex-col bg-[#0f0f12] text-zinc-100 select-none overflow-hidden">
      {/* 1. Header Toolbar */}
      <div className="h-12 px-5 border-b border-zinc-850/50 bg-[#121215] flex items-center justify-between gap-4 shrink-0">
        {/* Left: Title & Counters */}
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

        {/* Center: View Mode Switcher (Lista vs Kanban) + Grouping Options */}
        <div className="flex items-center gap-2">
          {/* View switcher buttons */}
          <div className="flex items-center gap-0.5 bg-zinc-900/60 p-0.5 rounded-lg border border-zinc-800/50">
            <button
              onClick={() => setViewMode('list')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-all cursor-pointer ${
                viewMode === 'list'
                  ? 'shadow-xs font-semibold'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
              style={
                viewMode === 'list'
                  ? {
                      backgroundColor: 'var(--accent, #c59b27)',
                      color: '#09090b'
                    }
                  : undefined
              }
              title="Visualização em Lista"
            >
              <List className="w-3.5 h-3.5" />
              <span>Lista</span>
            </button>

            <button
              onClick={() => setViewMode('kanban')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-all cursor-pointer ${
                viewMode === 'kanban'
                  ? 'shadow-xs font-semibold'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
              style={
                viewMode === 'kanban'
                  ? {
                      backgroundColor: 'var(--accent, #c59b27)',
                      color: '#09090b'
                    }
                  : undefined
              }
              title="Visualização em Kanban"
            >
              <Kanban className="w-3.5 h-3.5" />
              <span>Kanban</span>
            </button>
          </div>

          {/* Kanban column grouping setting */}
          {viewMode === 'kanban' && (
            <div className="relative">
              <button
                onClick={() => setIsGroupingMenuOpen(!isGroupingMenuOpen)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-zinc-900/60 hover:bg-zinc-850/80 border border-zinc-800/50 text-zinc-300 transition-colors cursor-pointer"
                title="Configurar qual propriedade define as colunas do Kanban"
              >
                <SlidersHorizontal className="w-3 h-3 text-zinc-400" />
                <span className="text-zinc-400">Colunas:</span>
                <span className="font-semibold text-zinc-200">
                  {kanbanGroupBy === 'status' ? 'Status' : 'Prioridade'}
                </span>
                <ChevronDown className="w-3 h-3 text-zinc-500" />
              </button>

              {isGroupingMenuOpen && (
                <div
                  className="absolute top-full mt-1.5 left-0 z-30 w-44 rounded-xl bg-zinc-900 border border-zinc-800/80 shadow-2xl p-1.5 space-y-0.5 animate-in fade-in-50"
                  onMouseLeave={() => setIsGroupingMenuOpen(false)}
                >
                  <div className="text-[10px] font-semibold text-zinc-500 px-2 py-1 uppercase tracking-wider">
                    Agrupar Colunas Por
                  </div>
                  <button
                    onClick={() => {
                      setKanbanGroupBy('status')
                      setIsGroupingMenuOpen(false)
                    }}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                      kanbanGroupBy === 'status'
                        ? 'bg-zinc-800/80 font-medium'
                        : 'hover:bg-zinc-800/40 text-zinc-300'
                    }`}
                    style={kanbanGroupBy === 'status' ? { color: 'var(--accent, #c59b27)' } : undefined}
                  >
                    <span>Status</span>
                    {kanbanGroupBy === 'status' && <Check className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    onClick={() => {
                      setKanbanGroupBy('priority')
                      setIsGroupingMenuOpen(false)
                    }}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                      kanbanGroupBy === 'priority'
                        ? 'bg-zinc-800/80 font-medium'
                        : 'hover:bg-zinc-800/40 text-zinc-300'
                    }`}
                    style={kanbanGroupBy === 'priority' ? { color: 'var(--accent, #c59b27)' } : undefined}
                  >
                    <span>Prioridade</span>
                    {kanbanGroupBy === 'priority' && <Check className="w-3.5 h-3.5" />}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Tools: Search, Settings Gear & Icon-Only New Task */}
        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="relative flex items-center">
            <Search className="w-3 h-3 text-zinc-500 absolute left-2.5 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Buscar tarefas..."
              className="w-36 md:w-44 pl-7 pr-2.5 py-1 bg-zinc-900/80 border border-zinc-800/60 rounded-lg text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-700 transition-all"
            />
          </div>

          {/* Settings Gear Button */}
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80 rounded-lg border border-zinc-800/60 transition-colors cursor-pointer"
            title="Configurações das Tarefas (Propriedades e Status)"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>

          {/* New Task Button - ICON ONLY */}
          <button
            onClick={() => onCreateTask()}
            className="w-7 h-7 flex items-center justify-center font-semibold rounded-lg text-xs transition-opacity hover:opacity-90 shadow-sm cursor-pointer shrink-0"
            style={{
              backgroundColor: 'var(--accent, #c59b27)',
              color: '#09090b'
            }}
            title="Nova Tarefa"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
          </button>
        </div>
      </div>

      {/* 2. Main Content: Lista or Kanban */}
      {viewMode === 'list' ? (
        /* LIST / TABLE VIEW */
        <div className="flex-1 overflow-x-auto overflow-y-auto custom-chat-scrollbar">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-zinc-800/40 bg-zinc-950/30 text-zinc-400 uppercase text-[9.5px] tracking-wider font-semibold">
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
            <tbody className="divide-y divide-zinc-850/30 font-normal">
              {filteredTasks.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-zinc-500 text-xs">
                    Nenhuma tarefa encontrada.
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
                          <span
                            className="w-1.5 h-1.5 rounded-full shrink-0"
                            style={{ backgroundColor: statusObj.color }}
                          />
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
                        <div
                          ref={editingDeadlineTaskId === task.id ? deadlineBtnRef : undefined}
                          className="inline-block"
                        >
                          {task.deadline ? (
                            <div
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded hover:bg-zinc-800/60 transition-colors cursor-pointer"
                              onClick={e => {
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
                              onClick={e => {
                                e.stopPropagation()
                                setEditingDeadlineTaskId(task.id)
                              }}
                              className="opacity-0 group-hover:opacity-100 text-[10.5px] text-zinc-500 hover:text-zinc-300 transition-opacity"
                            >
                              + prazo
                            </button>
                          )}
                        </div>

                        {editingDeadlineTaskId === task.id && (
                          <CustomDatePickerPopover
                            value={task.deadline}
                            anchorEl={deadlineBtnRef.current}
                            onChange={newDeadline => {
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

              {/* Inline Quick Add Row */}
              <tr className="bg-zinc-950/20">
                <td className="px-3 py-1.5 text-center">
                  <Plus className="w-3 h-3 text-zinc-600" />
                </td>
                <td colSpan={7} className="px-3 py-1.5">
                  <form onSubmit={handleQuickAddInList} className="flex items-center">
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
      ) : (
        /* KANBAN BOARD VIEW */
        <div className="flex-1 overflow-x-auto overflow-y-hidden custom-chat-scrollbar p-4 flex gap-4 items-start">
          {kanbanGroupBy === 'status'
            ? settings.statuses.map(statusCol => {
                const colTasks = filteredTasks.filter(t => t.statusId === statusCol.id)
                const isAdding = addingInColumnId === statusCol.id

                return (
                  <div
                    key={statusCol.id}
                    className="w-72 shrink-0 flex flex-col max-h-full bg-zinc-950/40 rounded-xl p-2.5 border border-zinc-850/40"
                  >
                    {/* Column Header */}
                    <div className="flex items-center justify-between pb-2 mb-2 border-b border-zinc-850/40">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: statusCol.color }}
                        />
                        <span className="text-xs font-semibold text-zinc-200 truncate">
                          {statusCol.name}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded-full font-medium bg-zinc-900 text-zinc-400 border border-zinc-800">
                          {colTasks.length}
                        </span>
                      </div>
                      <button
                        onClick={() => {
                          setAddingInColumnId(statusCol.id)
                          setNewColumnTaskTitle('')
                        }}
                        className="p-1 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-850 rounded transition-colors cursor-pointer"
                        title="Adicionar tarefa nesta coluna"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Column Cards */}
                    <div className="flex-1 overflow-y-auto space-y-2 custom-chat-scrollbar pr-0.5">
                      {colTasks.length === 0 && !isAdding && (
                        <div className="py-6 text-center text-xs text-zinc-600">
                          Nenhuma tarefa
                        </div>
                      )}

                      {colTasks.map(task => {
                        const isSelected = selectedTaskId === task.id
                        const priorityInfo = PRIORITY_BADGES[task.priority]

                        return (
                          <div
                            key={task.id}
                            onClick={() => onSelectTask(task)}
                            className={`group relative rounded-lg p-2.5 bg-zinc-900/60 hover:bg-zinc-850/80 border transition-all cursor-pointer shadow-xs ${
                              isSelected
                                ? 'border-zinc-500'
                                : 'border-zinc-800/40 hover:border-zinc-700/60'
                            }`}
                            style={
                              isSelected
                                ? {
                                    boxShadow: '0 0 0 1px var(--accent, #c59b27)'
                                  }
                                : undefined
                            }
                          >
                            {/* Card Top: Checkbox, Title, Delete */}
                            <div className="flex items-start gap-2">
                              <button
                                onClick={e => handleToggleComplete(task, e)}
                                className="mt-0.5 transition-transform hover:scale-110 cursor-pointer shrink-0"
                              >
                                {task.completed ? (
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                                ) : (
                                  <Circle className="w-3.5 h-3.5 text-zinc-600" />
                                )}
                              </button>
                              <span
                                className={`text-xs font-medium text-zinc-200 flex-1 leading-snug ${
                                  task.completed ? 'line-through text-zinc-500' : ''
                                }`}
                              >
                                {task.title}
                              </span>
                              <button
                                onClick={e => {
                                  e.stopPropagation()
                                  if (confirm(`Excluir "${task.title}"?`)) {
                                    onDeleteTask(task.id)
                                  }
                                }}
                                className="opacity-0 group-hover:opacity-100 p-0.5 text-zinc-500 hover:text-rose-400 transition-opacity cursor-pointer"
                                title="Excluir tarefa"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>

                            {/* Card Badges Row */}
                            <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                              {/* Priority */}
                              {task.priority !== 'none' && (
                                <span
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium"
                                  style={{
                                    backgroundColor: priorityInfo.bg,
                                    color: priorityInfo.color
                                  }}
                                >
                                  <Flag className="w-2.5 h-2.5" />
                                  <span>{priorityInfo.label}</span>
                                </span>
                              )}

                              {/* Deadline */}
                              {task.deadline && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-zinc-800/80 text-zinc-300">
                                  <Hourglass className="w-2.5 h-2.5 text-zinc-500" />
                                  <span>{task.deadline}</span>
                                  {task.deadline.slice(0, 10) === todayStr && (
                                    <span
                                      className="font-medium"
                                      style={{ color: 'var(--accent, #c59b27)' }}
                                    >
                                      Hoje
                                    </span>
                                  )}
                                </span>
                              )}

                              {/* Context Note */}
                              {task.contextNoteId && (
                                <span
                                  onClick={e => {
                                    e.stopPropagation()
                                    onOpenNote(task.contextNoteId!)
                                  }}
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-zinc-800/80 hover:bg-zinc-750 transition-colors max-w-[130px] truncate"
                                  style={{ color: 'var(--accent, #c59b27)' }}
                                  title="Abrir nota vinculada"
                                >
                                  <Compass className="w-2.5 h-2.5 shrink-0" />
                                  <span className="truncate">{task.contextNoteTitle || 'Nota'}</span>
                                </span>
                              )}

                              {/* Tags */}
                              {task.tags.map(t => (
                                <span
                                  key={t}
                                  className="px-1 py-0.2 rounded bg-zinc-850/90 text-[9.5px] text-zinc-400 font-mono"
                                >
                                  #{t}
                                </span>
                              ))}
                            </div>
                          </div>
                        )
                      })}

                      {/* Quick Add Form in Column */}
                      {isAdding && (
                        <form
                          onSubmit={e => handleQuickAddInColumn(statusCol.id, e)}
                          className="pt-1"
                        >
                          <input
                            autoFocus
                            type="text"
                            value={newColumnTaskTitle}
                            onChange={e => setNewColumnTaskTitle(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Escape') setAddingInColumnId(null)
                            }}
                            onBlur={() => {
                              if (!newColumnTaskTitle.trim()) setAddingInColumnId(null)
                            }}
                            placeholder="Nome da tarefa... (Enter)"
                            className="w-full px-2.5 py-1.5 bg-zinc-900 border border-zinc-700 rounded-lg text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none"
                          />
                        </form>
                      )}
                    </div>

                    {/* Column Bottom Add Button */}
                    {!isAdding && (
                      <button
                        onClick={() => {
                          setAddingInColumnId(statusCol.id)
                          setNewColumnTaskTitle('')
                        }}
                        className="w-full mt-2 py-1.5 px-2 flex items-center justify-center gap-1.5 text-[11px] text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/60 rounded-lg transition-colors cursor-pointer"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Adicionar tarefa</span>
                      </button>
                    )}
                  </div>
                )
              })
            : KANBAN_PRIORITY_COLUMNS.map(priorityCol => {
                const colTasks = filteredTasks.filter(t => t.priority === priorityCol.id)
                const isAdding = addingInColumnId === priorityCol.id

                return (
                  <div
                    key={priorityCol.id}
                    className="w-72 shrink-0 flex flex-col max-h-full bg-zinc-950/40 rounded-xl p-2.5 border border-zinc-850/40"
                  >
                    {/* Column Header */}
                    <div className="flex items-center justify-between pb-2 mb-2 border-b border-zinc-850/40">
                      <div className="flex items-center gap-2">
                        <Flag
                          className="w-3.5 h-3.5 shrink-0"
                          style={{ color: priorityCol.color }}
                        />
                        <span className="text-xs font-semibold text-zinc-200 truncate">
                          {priorityCol.label}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded-full font-medium bg-zinc-900 text-zinc-400 border border-zinc-800">
                          {colTasks.length}
                        </span>
                      </div>
                      <button
                        onClick={() => {
                          setAddingInColumnId(priorityCol.id)
                          setNewColumnTaskTitle('')
                        }}
                        className="p-1 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-850 rounded transition-colors cursor-pointer"
                        title="Adicionar tarefa nesta coluna"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Column Cards */}
                    <div className="flex-1 overflow-y-auto space-y-2 custom-chat-scrollbar pr-0.5">
                      {colTasks.length === 0 && !isAdding && (
                        <div className="py-6 text-center text-xs text-zinc-600">
                          Nenhuma tarefa
                        </div>
                      )}

                      {colTasks.map(task => {
                        const isSelected = selectedTaskId === task.id
                        const statusObj =
                          settings.statuses.find(s => s.id === task.statusId) ||
                          settings.statuses[0]

                        return (
                          <div
                            key={task.id}
                            onClick={() => onSelectTask(task)}
                            className={`group relative rounded-lg p-2.5 bg-zinc-900/60 hover:bg-zinc-850/80 border transition-all cursor-pointer shadow-xs ${
                              isSelected
                                ? 'border-zinc-500'
                                : 'border-zinc-800/40 hover:border-zinc-700/60'
                            }`}
                            style={
                              isSelected
                                ? {
                                    boxShadow: '0 0 0 1px var(--accent, #c59b27)'
                                  }
                                : undefined
                            }
                          >
                            {/* Card Top: Checkbox, Title, Delete */}
                            <div className="flex items-start gap-2">
                              <button
                                onClick={e => handleToggleComplete(task, e)}
                                className="mt-0.5 transition-transform hover:scale-110 cursor-pointer shrink-0"
                              >
                                {task.completed ? (
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                                ) : (
                                  <Circle className="w-3.5 h-3.5 text-zinc-600" />
                                )}
                              </button>
                              <span
                                className={`text-xs font-medium text-zinc-200 flex-1 leading-snug ${
                                  task.completed ? 'line-through text-zinc-500' : ''
                                }`}
                              >
                                {task.title}
                              </span>
                              <button
                                onClick={e => {
                                  e.stopPropagation()
                                  if (confirm(`Excluir "${task.title}"?`)) {
                                    onDeleteTask(task.id)
                                  }
                                }}
                                className="opacity-0 group-hover:opacity-100 p-0.5 text-zinc-500 hover:text-rose-400 transition-opacity cursor-pointer"
                                title="Excluir tarefa"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>

                            {/* Card Badges Row */}
                            <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                              {/* Status Pill */}
                              <span
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium"
                                style={{
                                  backgroundColor: `${statusObj.color}20`,
                                  color: statusObj.color
                                }}
                              >
                                <span
                                  className="w-1.5 h-1.5 rounded-full shrink-0"
                                  style={{ backgroundColor: statusColColor(statusObj.color) }}
                                />
                                <span>{statusObj.name}</span>
                              </span>

                              {/* Deadline */}
                              {task.deadline && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-zinc-800/80 text-zinc-300">
                                  <Hourglass className="w-2.5 h-2.5 text-zinc-500" />
                                  <span>{task.deadline}</span>
                                  {task.deadline.slice(0, 10) === todayStr && (
                                    <span
                                      className="font-medium"
                                      style={{ color: 'var(--accent, #c59b27)' }}
                                    >
                                      Hoje
                                    </span>
                                  )}
                                </span>
                              )}

                              {/* Context Note */}
                              {task.contextNoteId && (
                                <span
                                  onClick={e => {
                                    e.stopPropagation()
                                    onOpenNote(task.contextNoteId!)
                                  }}
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-zinc-800/80 hover:bg-zinc-750 transition-colors max-w-[130px] truncate"
                                  style={{ color: 'var(--accent, #c59b27)' }}
                                  title="Abrir nota vinculada"
                                >
                                  <Compass className="w-2.5 h-2.5 shrink-0" />
                                  <span className="truncate">{task.contextNoteTitle || 'Nota'}</span>
                                </span>
                              )}

                              {/* Tags */}
                              {task.tags.map(t => (
                                <span
                                  key={t}
                                  className="px-1 py-0.2 rounded bg-zinc-850/90 text-[9.5px] text-zinc-400 font-mono"
                                >
                                  #{t}
                                </span>
                              ))}
                            </div>
                          </div>
                        )
                      })}

                      {/* Quick Add Form in Column */}
                      {isAdding && (
                        <form
                          onSubmit={e => handleQuickAddInColumn(priorityCol.id, e)}
                          className="pt-1"
                        >
                          <input
                            autoFocus
                            type="text"
                            value={newColumnTaskTitle}
                            onChange={e => setNewColumnTaskTitle(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Escape') setAddingInColumnId(null)
                            }}
                            onBlur={() => {
                              if (!newColumnTaskTitle.trim()) setAddingInColumnId(null)
                            }}
                            placeholder="Nome da tarefa... (Enter)"
                            className="w-full px-2.5 py-1.5 bg-zinc-900 border border-zinc-700 rounded-lg text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none"
                          />
                        </form>
                      )}
                    </div>

                    {/* Column Bottom Add Button */}
                    {!isAdding && (
                      <button
                        onClick={() => {
                          setAddingInColumnId(priorityCol.id)
                          setNewColumnTaskTitle('')
                        }}
                        className="w-full mt-2 py-1.5 px-2 flex items-center justify-center gap-1.5 text-[11px] text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/60 rounded-lg transition-colors cursor-pointer"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Adicionar tarefa</span>
                      </button>
                    )}
                  </div>
                )
              })}
        </div>
      )}

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

function statusColColor(color: string) {
  return color || '#71717a'
}

export default TasksView
