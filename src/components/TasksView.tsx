import React, { useState } from 'react'
import type { TaskItem, TaskSettings, TaskPriority, SubTask } from '../types/tasks'
import type { Note } from '../types'
import { DEFAULT_TASK_SETTINGS } from '../utils/taskStorage'
import { TaskSettingsModal } from './TaskSettingsModal'
import { CustomDatePickerPopover } from './CustomDatePickerPopover'
import {
  CheckCircle2,
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
  ChevronRight,
  Check,
  CheckSquare,
  CornerDownRight
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

  // Subtasks expanded state in list view
  const [expandedTaskIds, setExpandedTaskIds] = useState<Set<string>>(new Set())
  const [newSubtaskTitle, setNewSubtaskTitle] = useState<Record<string, string>>({})

  // Drag and drop state
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null)
  const [dragOverColumnId, setDragOverColumnId] = useState<string | null>(null)

  // Quick add states
  const [newTaskInput, setNewTaskInput] = useState('')
  const [addingInColumnId, setAddingInColumnId] = useState<string | null>(null)
  const [newColumnTaskTitle, setNewColumnTaskTitle] = useState('')

  // Inline deadline datepicker
  const [editingDeadlineTaskId, setEditingDeadlineTaskId] = useState<string | null>(null)
  const [deadlineAnchorEl, setDeadlineAnchorEl] = useState<HTMLElement | null>(null)

  // Micro-burst animation state on task completion
  const [burstingTaskId, setBurstingTaskId] = useState<string | null>(null)

  const todayStr = new Date().toISOString().slice(0, 10)

  const safeStatuses = Array.isArray(settings?.statuses) ? settings.statuses : DEFAULT_TASK_SETTINGS.statuses
  const safeProperties = Array.isArray(settings?.properties) ? settings.properties : DEFAULT_TASK_SETTINGS.properties

  // Column visibility check (Olhinho feature)
  const isColumnHidden = (propId: string) => {
    const prop = safeProperties.find(p => p.id === propId)
    return Boolean(prop?.hidden)
  }

  const visibleColumnCount =
    3 +
    (!isColumnHidden('prop_status') ? 1 : 0) +
    (!isColumnHidden('prop_priority') ? 1 : 0) +
    (!isColumnHidden('prop_deadline') ? 1 : 0) +
    (!isColumnHidden('prop_context') ? 1 : 0) +
    (!isColumnHidden('prop_tags') ? 1 : 0)

  // Subtasks helpers
  const toggleTaskExpand = (taskId: string) => {
    setExpandedTaskIds(prev => {
      const next = new Set(prev)
      if (next.has(taskId)) {
        next.delete(taskId)
      } else {
        next.add(taskId)
      }
      return next
    })
  }

  const handleToggleSubtask = (task: TaskItem, subtaskId: string, e?: React.MouseEvent) => {
    e?.stopPropagation()
    const updatedSubtasks = (task.subtasks || []).map(st =>
      st.id === subtaskId ? { ...st, completed: !st.completed } : st
    )
    onUpdateTask({
      ...task,
      subtasks: updatedSubtasks,
      updatedAt: Date.now()
    })
  }

  const handleAddSubtask = (task: TaskItem, title: string, e?: React.FormEvent) => {
    e?.preventDefault()
    if (!title.trim()) return
    const newSub: SubTask = {
      id: `sub_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      title: title.trim(),
      completed: false,
      createdAt: Date.now()
    }
    const updatedSubtasks = [...(task.subtasks || []), newSub]
    onUpdateTask({
      ...task,
      subtasks: updatedSubtasks,
      updatedAt: Date.now()
    })
    setNewSubtaskTitle(prev => ({ ...prev, [task.id]: '' }))
    setExpandedTaskIds(prev => new Set(prev).add(task.id))
  }

  const handleDeleteSubtask = (task: TaskItem, subtaskId: string, e?: React.MouseEvent) => {
    e?.stopPropagation()
    const updatedSubtasks = (task.subtasks || []).filter(st => st.id !== subtaskId)
    onUpdateTask({
      ...task,
      subtasks: updatedSubtasks,
      updatedAt: Date.now()
    })
  }

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
    if (nextCompleted) {
      setBurstingTaskId(task.id)
      setTimeout(() => setBurstingTaskId(null), 500)
    }
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

  // Handle Drag & Drop to change column/status/priority
  const handleDropTask = (taskId: string, targetColumnId: string) => {
    const taskToMove = tasks.find(t => t.id === taskId)
    if (!taskToMove) return

    if (kanbanGroupBy === 'status') {
      if (taskToMove.statusId === targetColumnId) return
      const targetStatus = settings.statuses.find(s => s.id === targetColumnId)
      const isCompleted = Boolean(targetStatus?.isCompleted)
      onUpdateTask({
        ...taskToMove,
        statusId: targetColumnId,
        completed: isCompleted,
        updatedAt: Date.now()
      })
    } else {
      // Group by priority
      if (taskToMove.priority === targetColumnId) return
      onUpdateTask({
        ...taskToMove,
        priority: targetColumnId as TaskPriority,
        updatedAt: Date.now()
      })
    }
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
      const isCompletedStatus = safeStatuses.find(s => s.id === columnId)?.isCompleted || false
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
      <style>{`
        @keyframes pyriteBurst1 { 0% { transform: translate(0, 0) scale(1); opacity: 1; } 100% { transform: translate(-10px, -8px) scale(0); opacity: 0; } }
        @keyframes pyriteBurst2 { 0% { transform: translate(0, 0) scale(1); opacity: 1; } 100% { transform: translate(0px, -12px) scale(0); opacity: 0; } }
        @keyframes pyriteBurst3 { 0% { transform: translate(0, 0) scale(1); opacity: 1; } 100% { transform: translate(10px, -8px) scale(0); opacity: 0; } }
        @keyframes pyriteBurst4 { 0% { transform: translate(0, 0) scale(1); opacity: 1; } 100% { transform: translate(-10px, 8px) scale(0); opacity: 0; } }
        @keyframes pyriteBurst5 { 0% { transform: translate(0, 0) scale(1); opacity: 1; } 100% { transform: translate(0px, 12px) scale(0); opacity: 0; } }
        @keyframes pyriteBurst6 { 0% { transform: translate(0, 0) scale(1); opacity: 1; } 100% { transform: translate(10px, 8px) scale(0); opacity: 0; } }
      `}</style>
      {/* 1. Header Toolbar - Seamless with Notes and Agent */}
      <div className="h-12 px-5 bg-[#0c0c0f] border-b border-zinc-800/60 flex items-center justify-between gap-4 shrink-0">
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
              className="text-[10px] px-2 py-0.5 rounded-full font-medium"
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
          <div className="flex items-center gap-0.5 bg-[#14151b] border border-zinc-800/60 p-0.5 rounded-lg">
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
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-[#14151b] border border-zinc-800/60 hover:bg-[#181922] text-zinc-300 transition-colors cursor-pointer"
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
                  className="absolute top-full mt-1.5 left-0 z-30 w-44 rounded-xl bg-[#13141a] shadow-lg p-1.5 space-y-0.5 animate-in fade-in-50 border border-zinc-800"
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
                        ? 'bg-zinc-800 text-white font-medium'
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
                        ? 'bg-zinc-800 text-white font-medium'
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
              className="w-36 md:w-44 pl-7 pr-2.5 py-1 bg-[#14151b] border border-zinc-800/60 rounded-lg text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-700 transition-all"
            />
          </div>

          {/* Settings Gear Button */}
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-[#14151b] border border-transparent hover:border-zinc-800/60 rounded-lg transition-colors cursor-pointer"
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
        /* LIST / TABLE VIEW - Refined, subtle selection & expandable subtasks */
        <div className="flex-1 overflow-x-auto overflow-y-auto custom-chat-scrollbar px-5 py-3">
          <table className="w-full text-left text-xs border-separate border-spacing-y-1.5">
            <thead>
              <tr className="text-zinc-500 uppercase text-[10px] tracking-wider font-semibold">
                <th className="w-10 px-3 py-2"></th>
                <th className="px-3 py-2">Tarefa</th>
                {!isColumnHidden('prop_status') && <th className="px-3 py-2 w-36">Status</th>}
                {!isColumnHidden('prop_priority') && <th className="px-3 py-2 w-28">Prioridade</th>}
                {!isColumnHidden('prop_deadline') && <th className="px-3 py-2 w-48 min-w-[180px]">Prazo</th>}
                {!isColumnHidden('prop_context') && <th className="px-3 py-2 w-48">Contexto (Nota)</th>}
                {!isColumnHidden('prop_tags') && <th className="px-3 py-2">Tags</th>}
                <th className="w-10 px-3 py-2 text-right"></th>
              </tr>
            </thead>
            <tbody className="font-normal">
              {filteredTasks.length === 0 ? (
                <tr>
                  <td colSpan={visibleColumnCount} className="text-center py-12 text-zinc-500 text-xs">
                    Nenhuma tarefa encontrada.
                  </td>
                </tr>
              ) : (
                filteredTasks.map(task => {
                  const isSelected = selectedTaskId === task.id
                  const statusObj = safeStatuses.find(s => s.id === task.statusId) || safeStatuses[0]
                  const priorityInfo = PRIORITY_BADGES[task.priority]
                  const isExpanded = expandedTaskIds.has(task.id)
                  const subtasksCount = task.subtasks?.length || 0
                  const completedSubtasksCount = task.subtasks?.filter(s => s.completed).length || 0

                  return (
                    <React.Fragment key={task.id}>
                      <tr
                        data-task-item="true"
                        onClick={() => onSelectTask(task)}
                        className="group transition-all cursor-pointer"
                      >
                        {/* Checkbox */}
                        <td
                          className={`px-3 py-2.5 first:rounded-l-xl transition-all ${
                            isSelected
                              ? 'bg-[#1a1b24] border-l-[3px] border-l-[var(--accent,#c59b27)] border-t border-b border-t-zinc-800/60 border-b-zinc-800/60'
                              : 'bg-[#13141a] group-hover:bg-[#181921] border-l-[3px] border-l-transparent border-t border-b border-t-zinc-800/40 border-b-zinc-800/40'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={e => handleToggleComplete(task, e)}
                            className="relative cursor-pointer flex items-center justify-center p-0.5"
                            title={task.completed ? 'Marcar como pendente' : 'Marcar como concluída'}
                          >
                            <div
                              className={`w-4 h-4 rounded-[5px] flex items-center justify-center transition-all ${
                                task.completed
                                  ? 'bg-emerald-500 border border-emerald-500 text-zinc-950 shadow-xs'
                                  : 'border border-zinc-700/80 hover:border-zinc-500 bg-transparent'
                              }`}
                            >
                              {task.completed && <Check className="w-3 h-3 stroke-[3]" />}
                            </div>

                            {/* Subtle micro-burst particle effect on completion */}
                            {burstingTaskId === task.id && (
                              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                                <span className="absolute w-1 h-1 rounded-full bg-emerald-400 animate-[pyriteBurst1_0.45s_ease-out_forwards]" />
                                <span className="absolute w-1 h-1 rounded-full bg-emerald-300 animate-[pyriteBurst2_0.45s_ease-out_forwards]" />
                                <span className="absolute w-1 h-1 rounded-full bg-emerald-400 animate-[pyriteBurst3_0.45s_ease-out_forwards]" />
                                <span className="absolute w-1 h-1 rounded-full bg-emerald-300 animate-[pyriteBurst4_0.45s_ease-out_forwards]" />
                                <span className="absolute w-1 h-1 rounded-full bg-emerald-400 animate-[pyriteBurst5_0.45s_ease-out_forwards]" />
                                <span className="absolute w-1 h-1 rounded-full bg-emerald-300 animate-[pyriteBurst6_0.45s_ease-out_forwards]" />
                              </div>
                            )}
                          </button>
                        </td>

                        {/* Task Title + Subtasks expander + quick action */}
                        <td
                          className={`px-3 py-2.5 font-medium text-zinc-100 max-w-xs text-[12.5px] transition-all ${
                            isSelected
                              ? 'bg-[#1a1b24] border-t border-b border-t-zinc-800/60 border-b-zinc-800/60'
                              : 'bg-[#13141a] group-hover:bg-[#181921] border-t border-b border-t-zinc-800/40 border-b-zinc-800/40'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span className={`truncate ${task.completed ? 'line-through text-zinc-500' : ''}`}>
                              {task.title}
                            </span>

                            {/* Subtasks expand toggle badge if task has subtasks */}
                            {subtasksCount > 0 && (
                              <button
                                type="button"
                                onClick={e => {
                                  e.stopPropagation()
                                  toggleTaskExpand(task.id)
                                }}
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-[#161722] hover:bg-zinc-800 text-[10px] text-zinc-400 font-mono transition-colors shrink-0 cursor-pointer border-0"
                                title={isExpanded ? 'Ocultar subtarefas' : 'Ver subtarefas'}
                              >
                                <ChevronRight
                                  className={`w-3 h-3 text-zinc-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                                />
                                <span>
                                  {completedSubtasksCount}/{subtasksCount}
                                </span>
                              </button>
                            )}

                            {/* Hover action to add subtask */}
                            <button
                              type="button"
                              onClick={e => {
                                e.stopPropagation()
                                toggleTaskExpand(task.id)
                              }}
                              className="opacity-0 group-hover:opacity-100 text-[10px] text-zinc-500 hover:text-zinc-300 transition-opacity shrink-0 cursor-pointer"
                              title="Adicionar subtarefas"
                            >
                              + subtarefa
                            </button>
                          </div>
                        </td>

                        {/* Status Pill */}
                        {!isColumnHidden('prop_status') && (
                          <td
                            className={`px-3 py-2.5 transition-all ${
                              isSelected
                                ? 'bg-[#1a1b24] border-t border-b border-t-zinc-800/60 border-b-zinc-800/60'
                                : 'bg-[#13141a] group-hover:bg-[#181921] border-t border-b border-t-zinc-800/40 border-b-zinc-800/40'
                            }`}
                          >
                            <span
                              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10.5px] font-medium"
                              style={{
                                backgroundColor: `${statusObj.color}20`,
                                color: statusObj.color
                              }}
                            >
                              <span
                                className="w-1.5 h-1.5 rounded-full shrink-0"
                                style={{ backgroundColor: statusObj.color }}
                              />
                              <span className="truncate">{statusObj.name}</span>
                            </span>
                          </td>
                        )}

                        {/* Priority Pill */}
                        {!isColumnHidden('prop_priority') && (
                          <td
                            className={`px-3 py-2.5 transition-all ${
                              isSelected
                                ? 'bg-[#1a1b24] border-t border-b border-t-zinc-800/60 border-b-zinc-800/60'
                                : 'bg-[#13141a] group-hover:bg-[#181921] border-t border-b border-t-zinc-800/40 border-b-zinc-800/40'
                            }`}
                          >
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
                        )}

                        {/* Deadline Pill - Never wraps */}
                        {!isColumnHidden('prop_deadline') && (
                          <td
                            className={`px-3 py-2.5 text-zinc-300 relative whitespace-nowrap transition-all ${
                              isSelected
                                ? 'bg-[#1a1b24] border-t border-b border-t-zinc-800/60 border-b-zinc-800/60'
                                : 'bg-[#13141a] group-hover:bg-[#181921] border-t border-b border-t-zinc-800/40 border-b-zinc-800/40'
                            }`}
                          >
                            <div className="inline-block">
                              {task.deadline ? (
                                <div
                                  className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded hover:bg-zinc-800/40 transition-colors cursor-pointer whitespace-nowrap"
                                  onClick={e => {
                                    e.stopPropagation()
                                    if (editingDeadlineTaskId === task.id) {
                                      setEditingDeadlineTaskId(null)
                                      setDeadlineAnchorEl(null)
                                    } else {
                                      setDeadlineAnchorEl(e.currentTarget)
                                      setEditingDeadlineTaskId(task.id)
                                    }
                                  }}
                                >
                                  <Hourglass className="w-3 h-3 text-zinc-500 shrink-0" />
                                  <span className="text-[11px] font-mono shrink-0 whitespace-nowrap">{task.deadline}</span>
                                  {task.deadline.slice(0, 10) === todayStr && (
                                    <span
                                      className="text-[9.5px] px-1.5 py-0.2 rounded font-medium shrink-0 whitespace-nowrap leading-none"
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
                                    setDeadlineAnchorEl(e.currentTarget)
                                    setEditingDeadlineTaskId(task.id)
                                  }}
                                  className="opacity-0 group-hover:opacity-100 text-[10.5px] text-zinc-500 hover:text-zinc-300 transition-opacity whitespace-nowrap cursor-pointer"
                                >
                                  + prazo
                                </button>
                              )}
                            </div>

                            {editingDeadlineTaskId === task.id && deadlineAnchorEl && (
                              <CustomDatePickerPopover
                                value={task.deadline}
                                anchorEl={deadlineAnchorEl}
                                onChange={newDeadline => {
                                  onUpdateTask({ ...task, deadline: newDeadline, updatedAt: Date.now() })
                                  setEditingDeadlineTaskId(null)
                                  setDeadlineAnchorEl(null)
                                }}
                                onClose={() => {
                                  setEditingDeadlineTaskId(null)
                                  setDeadlineAnchorEl(null)
                                }}
                                align="left"
                              />
                            )}
                          </td>
                        )}

                        {/* Context (Nota vinculada) */}
                        {!isColumnHidden('prop_context') && (
                          <td
                            className={`px-3 py-2.5 transition-all ${
                              isSelected
                                ? 'bg-[#1a1b24] border-t border-b border-t-zinc-800/60 border-b-zinc-800/60'
                                : 'bg-[#13141a] group-hover:bg-[#181921] border-t border-b border-t-zinc-800/40 border-b-zinc-800/40'
                            }`}
                          >
                            {task.contextNoteId ? (
                              <span
                                onClick={e => {
                                  e.stopPropagation()
                                  onOpenNote(task.contextNoteId!)
                                }}
                                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[#161722] hover:bg-zinc-800 transition-colors text-[11px] font-medium max-w-[190px] truncate cursor-pointer"
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
                        )}

                        {/* Tags */}
                        {!isColumnHidden('prop_tags') && (
                          <td
                            className={`px-3 py-2.5 transition-all ${
                              isSelected
                                ? 'bg-[#1a1b24] border-t border-b border-t-zinc-800/60 border-b-zinc-800/60'
                                : 'bg-[#13141a] group-hover:bg-[#181921] border-t border-b border-t-zinc-800/40 border-b-zinc-800/40'
                            }`}
                          >
                            <div className="flex items-center gap-1 flex-wrap">
                              {task.tags.map(tag => (
                                <span
                                  key={tag}
                                  className="px-1.5 py-0.2 rounded bg-zinc-850/80 text-[10px] text-zinc-400 font-mono"
                                >
                                  #{tag}
                                </span>
                              ))}
                            </div>
                          </td>
                        )}

                        {/* Row Action */}
                        <td
                          className={`px-3 py-2.5 text-right last:rounded-r-xl transition-all ${
                            isSelected
                              ? 'bg-[#1a1b24] border-r border-t border-b border-r-zinc-800/60 border-t-zinc-800/60 border-b-zinc-800/60'
                              : 'bg-[#13141a] group-hover:bg-[#181921] border-r border-t border-b border-r-zinc-800/40 border-t-zinc-800/40 border-b-zinc-800/40'
                          }`}
                        >
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
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>

                      {/* Expandable Subtasks Row in List View - Directly over background, zero card styling, minimal padding */}
                      {isExpanded && (
                        <tr key={`${task.id}_subtasks_row`} className="transition-all animate-in fade-in duration-150 bg-transparent border-0">
                          <td
                            colSpan={visibleColumnCount}
                            className="px-3 py-0.5 bg-transparent border-0"
                          >
                            <div className="ml-7 pl-3 border-l border-zinc-800/60 space-y-0.5 my-1">
                              {task.subtasks && task.subtasks.length > 0 ? (
                                task.subtasks.map(sub => (
                                  <div
                                    key={sub.id}
                                    className="flex items-center justify-between py-0.5 px-2 rounded hover:bg-zinc-800/20 group/sub transition-colors"
                                  >
                                    <div className="flex items-center gap-2 flex-1 min-w-0">
                                      <button
                                        type="button"
                                        onClick={e => handleToggleSubtask(task, sub.id, e)}
                                        className="cursor-pointer transition-transform shrink-0 flex items-center justify-center"
                                      >
                                        <div
                                          className={`w-3.5 h-3.5 rounded-[4px] flex items-center justify-center transition-all ${
                                            sub.completed
                                              ? 'bg-emerald-500 text-zinc-950 shadow-xs'
                                              : 'border border-zinc-700 hover:border-zinc-500 bg-transparent'
                                          }`}
                                        >
                                          {sub.completed && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                                        </div>
                                      </button>
                                      <span
                                        className={`text-xs truncate ${sub.completed ? 'line-through text-zinc-500' : 'text-zinc-200'}`}
                                      >
                                        {sub.title}
                                      </span>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={e => handleDeleteSubtask(task, sub.id, e)}
                                      className="opacity-0 group-hover/sub:opacity-100 p-1 text-zinc-500 hover:text-rose-400 rounded transition-opacity cursor-pointer shrink-0"
                                      title="Excluir subtarefa"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </div>
                                ))
                              ) : (
                                <div className="text-[11px] text-zinc-600 py-0.5 px-1">Nenhuma subtarefa criada ainda.</div>
                              )}

                              {/* Inline quick add for subtask - bare on background, no active border, no button */}
                              <form
                                onSubmit={e => handleAddSubtask(task, newSubtaskTitle[task.id] || '', e)}
                                className="flex items-center gap-2 py-0.5 px-1"
                              >
                                <CornerDownRight className="w-3 h-3 text-zinc-600 shrink-0" />
                                <input
                                  type="text"
                                  value={newSubtaskTitle[task.id] || ''}
                                  onChange={e =>
                                    setNewSubtaskTitle(prev => ({ ...prev, [task.id]: e.target.value }))
                                  }
                                  placeholder="+ Nova subtarefa... e pressione Enter"
                                  className="flex-1 bg-transparent border-0 text-xs text-zinc-300 placeholder-zinc-600 focus:outline-none transition-colors py-0.5"
                                />
                              </form>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  )
                })
              )}

              {/* Inline Quick Add Row */}
              <tr className="bg-[#101117]/80 hover:bg-[#13141a] border border-dashed border-zinc-800/50 transition-colors rounded-xl">
                <td className="px-3 py-2.5 text-center first:rounded-l-xl">
                  <Plus className="w-3.5 h-3.5 text-zinc-500" />
                </td>
                <td colSpan={visibleColumnCount - 1} className="px-3 py-2.5 last:rounded-r-xl">
                  <form onSubmit={handleQuickAddInList} className="flex items-center">
                    <input
                      type="text"
                      value={newTaskInput}
                      onChange={e => setNewTaskInput(e.target.value)}
                      placeholder="+ Adicionar nova tarefa e pressionar Enter..."
                      className="w-full bg-transparent text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none"
                    />
                  </form>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : (
        /* KANBAN BOARD VIEW - Borderless, Fluid Drag & Drop, No clipping */
        <div className="flex-1 overflow-x-auto overflow-y-hidden custom-chat-scrollbar p-5 flex gap-4 items-start">
          {kanbanGroupBy === 'status'
            ? settings.statuses.map(statusCol => {
                const colTasks = filteredTasks.filter(t => t.statusId === statusCol.id)
                const isAdding = addingInColumnId === statusCol.id
                const isDragTarget = dragOverColumnId === statusCol.id

                return (
                  <div
                    key={statusCol.id}
                    onDragOver={e => {
                      e.preventDefault()
                      e.dataTransfer.dropEffect = 'move'
                      if (dragOverColumnId !== statusCol.id) setDragOverColumnId(statusCol.id)
                    }}
                    onDragLeave={e => {
                      if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                        setDragOverColumnId(null)
                      }
                    }}
                    onDrop={e => {
                      e.preventDefault()
                      const taskId = e.dataTransfer.getData('text/plain') || draggedTaskId
                      if (taskId) handleDropTask(taskId, statusCol.id)
                      setDraggedTaskId(null)
                      setDragOverColumnId(null)
                    }}
                    className={`w-72 shrink-0 flex flex-col max-h-full rounded-2xl p-3 transition-colors border-0 ${
                      isDragTarget ? 'bg-[#14151e]/90 ring-1 ring-zinc-700/50' : 'bg-[#0e0f14]/80'
                    }`}
                  >
                    {/* Column Header - Clean, subtle count badge */}
                    <div className="flex items-center justify-between pb-2 mb-1">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: statusCol.color }}
                        />
                        <span className="text-xs font-semibold text-zinc-200 truncate">
                          {statusCol.name}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-[#14151b] text-zinc-400">
                          {colTasks.length}
                        </span>
                      </div>
                      <button
                        onClick={() => {
                          setAddingInColumnId(statusCol.id)
                          setNewColumnTaskTitle('')
                        }}
                        className="p-1 text-zinc-500 hover:text-zinc-200 hover:bg-[#181921] rounded-lg transition-colors cursor-pointer"
                        title="Adicionar tarefa nesta coluna"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Column Cards Container - px-1.5 py-1 ensures border/shadow is never clipped */}
                    <div className="flex-1 overflow-y-auto space-y-2.5 custom-chat-scrollbar px-1.5 py-1">
                      {colTasks.length === 0 && !isAdding && (
                        <div className="py-8 text-center text-xs text-zinc-600">
                          Nenhuma tarefa
                        </div>
                      )}

                      {colTasks.map(task => {
                        const isSelected = selectedTaskId === task.id
                        const priorityInfo = PRIORITY_BADGES[task.priority]
                        const isDragging = draggedTaskId === task.id

                        return (
                          <div
                            key={task.id}
                            data-task-item="true"
                            draggable={true}
                            onDragStart={e => {
                              e.dataTransfer.setData('text/plain', task.id)
                              setDraggedTaskId(task.id)
                            }}
                            onDragEnd={() => {
                              setDraggedTaskId(null)
                              setDragOverColumnId(null)
                            }}
                            onClick={() => onSelectTask(task)}
                            className={`group relative rounded-xl p-3 transition-all cursor-grab active:cursor-grabbing select-none ${
                              isDragging ? 'opacity-40 scale-95' : 'opacity-100'
                            } ${
                              isSelected
                                ? 'bg-[#171822] ring-1 ring-[var(--accent)]/70 shadow-sm border-0'
                                : 'bg-[#13141a] hover:bg-[#181921] border border-zinc-800/50'
                            }`}
                          >
                            {/* Card Top: Checkbox, Title, Delete */}
                            <div className="flex items-start gap-2">
                              <button
                                type="button"
                                onClick={e => handleToggleComplete(task, e)}
                                className="mt-0.5 cursor-pointer shrink-0 flex items-center justify-center"
                              >
                                <div
                                  className={`w-3.5 h-3.5 rounded-[4px] flex items-center justify-center transition-all ${
                                    task.completed
                                      ? 'bg-emerald-500 text-zinc-950 shadow-xs'
                                      : 'border border-zinc-700 hover:border-zinc-500 bg-transparent'
                                  }`}
                                >
                                  {task.completed && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                                </div>
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
                            <div className="mt-2.5 flex items-center gap-1.5 flex-wrap">
                              {/* Subtasks Progress Badge */}
                              {task.subtasks && task.subtasks.length > 0 && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-[#1a1b24] text-zinc-300 whitespace-nowrap">
                                  <CheckSquare className="w-2.5 h-2.5 text-zinc-400 shrink-0" />
                                  <span>
                                    {task.subtasks.filter(st => st.completed).length}/{task.subtasks.length}
                                  </span>
                                </span>
                              )}

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

                              {/* Deadline - Never wraps */}
                              {task.deadline && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-zinc-800/80 text-zinc-300 whitespace-nowrap">
                                  <Hourglass className="w-2.5 h-2.5 text-zinc-500 shrink-0" />
                                  <span className="font-mono shrink-0 whitespace-nowrap">{task.deadline}</span>
                                  {task.deadline.slice(0, 10) === todayStr && (
                                    <span
                                      className="font-medium shrink-0 whitespace-nowrap"
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
                                  className="px-1.5 py-0.5 rounded bg-zinc-850/90 text-[9.5px] text-zinc-400 font-mono"
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
                            className="w-full px-3 py-2 bg-[#13141a] border border-zinc-800 rounded-xl text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-600"
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
                        className="w-full mt-2 py-1.5 px-2 flex items-center justify-center gap-1.5 text-[11px] text-zinc-500 hover:text-zinc-300 hover:bg-[#13141a] rounded-xl transition-colors cursor-pointer"
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
                const isDragTarget = dragOverColumnId === priorityCol.id

                return (
                  <div
                    key={priorityCol.id}
                    onDragOver={e => {
                      e.preventDefault()
                      e.dataTransfer.dropEffect = 'move'
                      if (dragOverColumnId !== priorityCol.id) setDragOverColumnId(priorityCol.id)
                    }}
                    onDragLeave={e => {
                      if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                        setDragOverColumnId(null)
                      }
                    }}
                    onDrop={e => {
                      e.preventDefault()
                      const taskId = e.dataTransfer.getData('text/plain') || draggedTaskId
                      if (taskId) handleDropTask(taskId, priorityCol.id)
                      setDraggedTaskId(null)
                      setDragOverColumnId(null)
                    }}
                    className={`w-72 shrink-0 flex flex-col max-h-full rounded-2xl p-3 transition-colors border-0 ${
                      isDragTarget ? 'bg-[#14151e]/90 ring-1 ring-zinc-700/50' : 'bg-[#0e0f14]/80'
                    }`}
                  >
                    {/* Column Header - Clean, without divider line */}
                    <div className="flex items-center justify-between pb-2 mb-1">
                      <div className="flex items-center gap-2">
                        <Flag
                          className="w-3.5 h-3.5 shrink-0"
                          style={{ color: priorityCol.color }}
                        />
                        <span className="text-xs font-semibold text-zinc-200 truncate">
                          {priorityCol.label}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-[#14151b] text-zinc-400">
                          {colTasks.length}
                        </span>
                      </div>
                      <button
                        onClick={() => {
                          setAddingInColumnId(priorityCol.id)
                          setNewColumnTaskTitle('')
                        }}
                        className="p-1 text-zinc-500 hover:text-zinc-200 hover:bg-[#181921] rounded-lg transition-colors cursor-pointer"
                        title="Adicionar tarefa nesta coluna"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Column Cards Container - px-1.5 py-1 ensures border/shadow is never clipped */}
                    <div className="flex-1 overflow-y-auto space-y-2.5 custom-chat-scrollbar px-1.5 py-1">
                      {colTasks.length === 0 && !isAdding && (
                        <div className="py-8 text-center text-xs text-zinc-600">
                          Nenhuma tarefa
                        </div>
                      )}

                      {colTasks.map(task => {
                        const isSelected = selectedTaskId === task.id
                        const statusObj =
                          settings.statuses.find(s => s.id === task.statusId) ||
                          settings.statuses[0]
                        const isDragging = draggedTaskId === task.id

                        return (
                          <div
                            key={task.id}
                            data-task-item="true"
                            draggable={true}
                            onDragStart={e => {
                              e.dataTransfer.setData('text/plain', task.id)
                              setDraggedTaskId(task.id)
                            }}
                            onDragEnd={() => {
                              setDraggedTaskId(null)
                              setDragOverColumnId(null)
                            }}
                            onClick={() => onSelectTask(task)}
                            className={`group relative rounded-xl p-3 transition-all cursor-grab active:cursor-grabbing select-none ${
                              isDragging ? 'opacity-40 scale-95' : 'opacity-100'
                            } ${
                              isSelected
                                ? 'bg-[#171822] ring-1 ring-[var(--accent)]/70 shadow-sm border-0'
                                : 'bg-[#13141a] hover:bg-[#181921] border border-zinc-800/50'
                            }`}
                          >
                            {/* Card Top: Checkbox, Title, Delete */}
                            <div className="flex items-start gap-2">
                              <button
                                type="button"
                                onClick={e => handleToggleComplete(task, e)}
                                className="mt-0.5 cursor-pointer shrink-0 flex items-center justify-center"
                              >
                                <div
                                  className={`w-3.5 h-3.5 rounded-[4px] flex items-center justify-center transition-all ${
                                    task.completed
                                      ? 'bg-emerald-500 text-zinc-950 shadow-xs'
                                      : 'border border-zinc-700 hover:border-zinc-500 bg-transparent'
                                  }`}
                                >
                                  {task.completed && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                                </div>
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
                            <div className="mt-2.5 flex items-center gap-1.5 flex-wrap">
                              {/* Subtasks Progress Badge */}
                              {task.subtasks && task.subtasks.length > 0 && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-[#1a1b24] text-zinc-300 whitespace-nowrap">
                                  <CheckSquare className="w-2.5 h-2.5 text-zinc-400 shrink-0" />
                                  <span>
                                    {task.subtasks.filter(st => st.completed).length}/{task.subtasks.length}
                                  </span>
                                </span>
                              )}

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

                              {/* Deadline - Never wraps */}
                              {task.deadline && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-zinc-800/80 text-zinc-300 whitespace-nowrap">
                                  <Hourglass className="w-2.5 h-2.5 text-zinc-500 shrink-0" />
                                  <span className="font-mono shrink-0 whitespace-nowrap">{task.deadline}</span>
                                  {task.deadline.slice(0, 10) === todayStr && (
                                    <span
                                      className="font-medium shrink-0 whitespace-nowrap"
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
                                  className="px-1.5 py-0.5 rounded bg-zinc-850/90 text-[9.5px] text-zinc-400 font-mono"
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
                            className="w-full px-3 py-2 bg-[#13141a] border border-zinc-800 rounded-xl text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-600"
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
                        className="w-full mt-2 py-1.5 px-2 flex items-center justify-center gap-1.5 text-[11px] text-zinc-500 hover:text-zinc-300 hover:bg-[#13141a] rounded-xl transition-colors cursor-pointer"
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
