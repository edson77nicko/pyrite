import React, { useState, useMemo } from 'react'
import type { TaskItem, TaskSettings, TaskPriority, SubTask, TaskBoard, TaskPropertyConfig } from '../types/tasks'
import type { Note } from '../types'
import { DEFAULT_TASK_SETTINGS, DEFAULT_PRIORITIES } from '../utils/taskStorage'
import { getPropertyItems, isBuiltinProperty, isOptionProperty, type PropertyItem } from '../utils/taskProperties'
import { Pill } from './TaskCustomPropertyField'
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
  activeBoardId?: string
  taskBoards?: TaskBoard[]
  onSelectTaskBoard?: (boardId: string) => void
  onSelectTask: (task: TaskItem | null) => void
  onCreateTask: (initialTitle?: string, initialData?: Partial<TaskItem>) => void
  onUpdateTask: (task: TaskItem) => void
  onDeleteTask: (taskId: string) => void
  onUpdateSettings: (settings: TaskSettings) => void
  onOpenNote: (noteId: string) => void
}

type ViewMode = 'list' | 'kanban'
type KanbanGroupBy = string

export const TasksView: React.FC<TasksViewProps> = ({
  tasks,
  allNotes: _allNotes,
  settings,
  selectedTaskId,
  activeBoardId = 'default',
  taskBoards = [],
  onSelectTaskBoard: _onSelectTaskBoard,
  onSelectTask,
  onCreateTask,
  onUpdateTask,
  onDeleteTask,
  onUpdateSettings,
  onOpenNote
}) => {
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [kanbanGroupBy, setKanbanGroupBy] = useState<KanbanGroupBy>('prop_status')
  const [isGroupingMenuOpen, setIsGroupingMenuOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)

  // Subtasks expanded state in list view
  const [expandedTaskIds, setExpandedTaskIds] = useState<Set<string>>(new Set())
  const [newSubtaskTitle, setNewSubtaskTitle] = useState<Record<string, string>>({})
  const [editingSubtaskId, setEditingSubtaskId] = useState<string | null>(null)
  const [editingSubtaskTitle, setEditingSubtaskTitle] = useState('')

  // Task deletion custom modal state
  const [taskToDelete, setTaskToDelete] = useState<TaskItem | null>(null)

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
  const [burstingSubtaskId, setBurstingSubtaskId] = useState<string | null>(null)

  const todayStr = new Date().toISOString().slice(0, 10)

  const safeStatuses = Array.isArray(settings?.statuses) ? settings.statuses : DEFAULT_TASK_SETTINGS.statuses
  const safeProperties = Array.isArray(settings?.properties) ? settings.properties : DEFAULT_TASK_SETTINGS.properties

  const safePriorities = useMemo(() => {
    return Array.isArray(settings?.priorities) && settings.priorities.length > 0
      ? settings.priorities
      : DEFAULT_PRIORITIES
  }, [settings?.priorities])

  const getPriorityBadge = (priorityId: string) => {
    const found = safePriorities.find(p => p.id === priorityId)
    if (found) {
      return {
        label: found.label,
        color: found.color,
        bg: `${found.color}20`
      }
    }
    return {
      label: priorityId || 'Nenhuma',
      color: '#71717a',
      bg: '#27272a'
    }
  }

  // Properties that can organize the Kanban columns (status / priority / custom select & status)
  const groupableProps = useMemo(() => safeProperties.filter(isOptionProperty), [safeProperties])
  const groupProp: TaskPropertyConfig =
    groupableProps.find(p => p.id === kanbanGroupBy) ||
    groupableProps[0] || { id: 'prop_status', name: 'Status', type: 'status' }

  const kanbanColumns = useMemo<PropertyItem[]>(() => {
    const items = getPropertyItems(settings, groupProp)
    return isBuiltinProperty(groupProp.id)
      ? items
      : [{ id: '__none', name: 'Sem valor', color: '#52525b' }, ...items]
  }, [settings, groupProp])

  const getTaskColumnId = (t: TaskItem): string => {
    const ids = kanbanColumns.map(c => c.id)
    let raw: string | undefined
    if (groupProp.id === 'prop_status') raw = t.statusId
    else if (groupProp.id === 'prop_priority') raw = t.priority
    else raw = t.customValues?.[groupProp.id]
    if (raw && ids.includes(raw)) return raw
    return isBuiltinProperty(groupProp.id) ? ids[0] : '__none'
  }

  const columnPatch = (colId: string): Partial<TaskItem> => {
    if (groupProp.id === 'prop_status') {
      const st = safeStatuses.find(s => s.id === colId)
      return { statusId: colId, completed: Boolean(st?.isCompleted) }
    }
    if (groupProp.id === 'prop_priority') return { priority: colId as TaskPriority }
    return {}
  }

  const mergeCustom = (t: TaskItem | undefined, colId: string) => {
    if (isBuiltinProperty(groupProp.id)) return t?.customValues
    const next = { ...(t?.customValues || {}) }
    if (colId === '__none') delete next[groupProp.id]
    else next[groupProp.id] = colId
    return next
  }

  const customListProps = useMemo(
    () => safeProperties.filter(p => !isBuiltinProperty(p.id) && !p.hidden),
    [safeProperties]
  )

  const renderCustomCell = (task: TaskItem, prop: TaskPropertyConfig) => {
    const v = task.customValues?.[prop.id]
    if (v === undefined || v === '' || (Array.isArray(v) && v.length === 0)) {
      return <span className="text-zinc-600">-</span>
    }
    const items = getPropertyItems(settings, prop)
    switch (prop.type) {
      case 'select':
      case 'status': {
        const it = items.find(i => i.id === v)
        return it ? <Pill item={it} /> : <span className="text-zinc-600">-</span>
      }
      case 'multiselect':
        return (
          <div className="flex flex-wrap gap-1">
            {(v as string[]).map(id => {
              const it = items.find(i => i.id === id)
              return it ? <Pill key={id} item={it} /> : null
            })}
          </div>
        )
      case 'checkbox':
        return v ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <span className="text-zinc-600">-</span>
      case 'url':
        return <span className="text-[11px] text-sky-400 truncate block max-w-[160px]">{String(v)}</span>
      default:
        return <span className="text-[11px] text-zinc-300 truncate block max-w-[160px]">{String(v)}</span>
    }
  }

  // Board filtering
  const currentBoardId = activeBoardId || 'default'
  const boardTasks = useMemo(() => {
    return tasks.filter(t => (t.boardId || 'default') === currentBoardId)
  }, [tasks, currentBoardId])

  const currentBoard = useMemo(() => {
    return taskBoards.find(b => b.id === currentBoardId)
  }, [taskBoards, currentBoardId])

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
    (!isColumnHidden('prop_tags') ? 1 : 0) +
    customListProps.length

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

  const handleStartEditSubtask = (sub: SubTask, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingSubtaskId(sub.id)
    setEditingSubtaskTitle(sub.title)
  }

  const handleSaveSubtaskTitle = (task: TaskItem, subId: string) => {
    if (!editingSubtaskTitle.trim()) {
      setEditingSubtaskId(null)
      return
    }
    const updated = (task.subtasks || []).map(st =>
      st.id === subId ? { ...st, title: editingSubtaskTitle.trim() } : st
    )
    onUpdateTask({ ...task, subtasks: updated, updatedAt: Date.now() })
    setEditingSubtaskId(null)
  }

  const handleToggleSubtask = (task: TaskItem, subtaskId: string, e?: React.MouseEvent) => {
    e?.stopPropagation()
    const targetSt = (task.subtasks || []).find(st => st.id === subtaskId)
    if (targetSt && !targetSt.completed) {
      setBurstingSubtaskId(subtaskId)
      setTimeout(() => setBurstingSubtaskId(null), 500)
    }
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
  const filteredTasks = useMemo(() => {
    return boardTasks.filter(t => {
      if (!searchQuery.trim()) return true
      const q = searchQuery.toLowerCase()
      const matchesTitle = t.title.toLowerCase().includes(q)
      const matchesTag = t.tags.some(tag => tag.toLowerCase().includes(q))
      const matchesContext = t.contextNoteTitle?.toLowerCase().includes(q)
      return matchesTitle || matchesTag || matchesContext
    })
  }, [boardTasks, searchQuery])

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

  // Handle Drag & Drop to change column (value of the property organizing the board)
  const handleDropTask = (taskId: string, targetColumnId: string) => {
    const taskToMove = tasks.find(t => t.id === taskId)
    if (!taskToMove) return
    if (getTaskColumnId(taskToMove) === targetColumnId) return
    onUpdateTask({ ...taskToMove, ...columnPatch(targetColumnId), customValues: mergeCustom(taskToMove, targetColumnId), updatedAt: Date.now() })
  }

  const handleQuickAddInList = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTaskInput.trim()) return
    onCreateTask(newTaskInput.trim(), { boardId: currentBoardId })
    setNewTaskInput('')
  }

  const handleQuickAddInColumn = (columnId: string, e: React.FormEvent) => {
    e.preventDefault()
    if (!newColumnTaskTitle.trim()) {
      setAddingInColumnId(null)
      return
    }

    onCreateTask(newColumnTaskTitle.trim(), {
      boardId: currentBoardId,
      ...columnPatch(columnId),
      customValues: mergeCustom(undefined, columnId)
    })

    setNewColumnTaskTitle('')
    setAddingInColumnId(null)
  }

  return (
    <div className="w-full h-full flex flex-col bg-[#121215] text-zinc-100 select-none overflow-hidden">
      {/* 1. Header Toolbar - Seamless with Notes and Agent */}
      <div className="h-12 px-5 bg-[#0c0c0f] border-b border-zinc-800/60 flex items-center justify-between gap-4 shrink-0">
        {/* Left: Title & Counters */}
        <div className="flex items-center gap-2.5">
          <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: 'var(--accent, #c59b27)' }} />
          <div className="flex items-center gap-2">
            <h1 className="text-xs font-bold text-zinc-100 uppercase tracking-wider">
              {currentBoard?.name || 'Tarefas'}
            </h1>
            <span
              className="text-[10px] px-2 py-0.5 rounded-full font-medium"
              style={{
                backgroundColor: 'var(--accent-glow-subtle, rgba(197, 155, 39, 0.12))',
                color: 'var(--accent, #c59b27)'
              }}
            >
              {boardTasks.filter(t => !t.completed).length} pendentes
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
                  {groupProp.name}
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
                  {groupableProps.map(gp => {
                    const active = groupProp.id === gp.id
                    return (
                      <button
                        key={gp.id}
                        onClick={() => {
                          setKanbanGroupBy(gp.id)
                          setIsGroupingMenuOpen(false)
                        }}
                        className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                          active ? 'bg-zinc-800 text-white font-medium' : 'hover:bg-zinc-800/40 text-zinc-300'
                        }`}
                        style={active ? { color: 'var(--accent, #c59b27)' } : undefined}
                      >
                        <span className="truncate">{gp.name}</span>
                        {active && <Check className="w-3.5 h-3.5 shrink-0" />}
                      </button>
                    )
                  })}
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
            className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-[#14151b] light:hover:bg-zinc-200 light:hover:text-zinc-950 border border-transparent hover:border-zinc-800/60 light:hover:border-zinc-300 rounded-lg transition-colors cursor-pointer"
            title="Configurações das Tarefas (Propriedades e Status)"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>

          {/* New Task Button - ICON ONLY */}
          <button
            onClick={() => onCreateTask(undefined, { boardId: currentBoardId })}
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
                {customListProps.map(cp => (
                  <th key={cp.id} className="px-3 py-2">{cp.name}</th>
                ))}
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
                  const priorityInfo = getPriorityBadge(task.priority)
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
                              ? 'bg-[#1a1b24] border-l-[3px] border-l-[var(--accent,#c59b27)] border-y-0'
                              : 'bg-[#13141a] group-hover:bg-[#181921] border-l-[3px] border-l-transparent border-y-0'
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
                                  ? 'bg-emerald-500 border border-emerald-500 text-zinc-950 shadow-xs affine-check-pop'
                                  : 'border border-zinc-700/80 hover:border-zinc-500 bg-transparent'
                              }`}
                            >
                              {task.completed && <Check className="w-3 h-3 stroke-[3]" />}
                            </div>

                            {/* Affine 4-Dot Cardinal Burst */}
                            {burstingTaskId === task.id && (
                              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                                <span className="absolute w-1 h-1 rounded-full bg-emerald-400 affine-dot-top" />
                                <span className="absolute w-1 h-1 rounded-full bg-emerald-400 affine-dot-bottom" />
                                <span className="absolute w-1 h-1 rounded-full bg-emerald-400 affine-dot-left" />
                                <span className="absolute w-1 h-1 rounded-full bg-emerald-400 affine-dot-right" />
                              </div>
                            )}
                          </button>
                        </td>

                        {/* Task Title + Subtasks expander + quick action */}
                        <td
                          className={`px-3 py-2.5 font-medium text-zinc-100 max-w-xs text-[12.5px] transition-all ${
                            isSelected
                              ? 'bg-[#1a1b24]'
                              : 'bg-[#13141a] group-hover:bg-[#181921]'
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
                                ? 'bg-[#1a1b24]'
                                : 'bg-[#13141a] group-hover:bg-[#181921]'
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
                                ? 'bg-[#1a1b24]'
                                : 'bg-[#13141a] group-hover:bg-[#181921]'
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
                                ? 'bg-[#1a1b24]'
                                : 'bg-[#13141a] group-hover:bg-[#181921]'
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
                                ? 'bg-[#1a1b24]'
                                : 'bg-[#13141a] group-hover:bg-[#181921]'
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
                                ? 'bg-[#1a1b24]'
                                : 'bg-[#13141a] group-hover:bg-[#181921]'
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

                        {/* Custom property cells */}
                        {customListProps.map(cp => (
                          <td
                            key={cp.id}
                            className={`px-3 py-2.5 transition-all ${
                              isSelected
                                ? 'bg-[#1a1b24]'
                                : 'bg-[#13141a] group-hover:bg-[#181921]'
                            }`}
                          >
                            {renderCustomCell(task, cp)}
                          </td>
                        ))}

                        {/* Row Action */}
                        <td
                          className={`px-3 py-2.5 text-right last:rounded-r-xl transition-all ${
                            isSelected
                              ? 'bg-[#1a1b24]'
                              : 'bg-[#13141a] group-hover:bg-[#181921]'
                          }`}
                        >
                          <button
                            onClick={e => {
                              e.stopPropagation()
                              setTaskToDelete(task)
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
                                        className="cursor-pointer transition-transform shrink-0 relative flex items-center justify-center p-0.5"
                                      >
                                        <div
                                          className={`w-3.5 h-3.5 rounded-[4px] flex items-center justify-center transition-all ${
                                            sub.completed
                                              ? 'bg-emerald-500 text-zinc-950 shadow-xs affine-check-pop'
                                              : 'border border-zinc-700 hover:border-zinc-500 bg-transparent'
                                          }`}
                                        >
                                          {sub.completed && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                                        </div>
                                        {burstingSubtaskId === sub.id && (
                                          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                                            <span className="absolute w-1 h-1 rounded-full bg-emerald-400 affine-dot-top" />
                                            <span className="absolute w-1 h-1 rounded-full bg-emerald-400 affine-dot-bottom" />
                                            <span className="absolute w-1 h-1 rounded-full bg-emerald-400 affine-dot-left" />
                                            <span className="absolute w-1 h-1 rounded-full bg-emerald-400 affine-dot-right" />
                                          </div>
                                        )}
                                      </button>
                                      {editingSubtaskId === sub.id ? (
                                        <input
                                          autoFocus
                                          type="text"
                                          value={editingSubtaskTitle}
                                          onChange={e => setEditingSubtaskTitle(e.target.value)}
                                          onKeyDown={e => {
                                            if (e.key === 'Enter') handleSaveSubtaskTitle(task, sub.id)
                                            if (e.key === 'Escape') setEditingSubtaskId(null)
                                          }}
                                          onBlur={() => handleSaveSubtaskTitle(task, sub.id)}
                                          onClick={e => e.stopPropagation()}
                                          className="text-xs bg-zinc-800/80 text-zinc-100 border border-zinc-700 rounded px-1.5 py-0.5 outline-none flex-1 min-w-0"
                                        />
                                      ) : (
                                        <span
                                          onClick={e => handleStartEditSubtask(sub, e)}
                                          className={`text-xs truncate cursor-text hover:text-zinc-100 transition-colors ${
                                            sub.completed ? 'line-through text-zinc-500' : 'text-zinc-200'
                                          }`}
                                          title="Clique para editar o texto da subtarefa"
                                        >
                                          {sub.title}
                                        </span>
                                      )}
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
              <tr className="bg-[#14151b] light:bg-white hover:bg-[#181921] light:hover:bg-[#f9f9fb] border border-dashed border-zinc-800/50 light:border-zinc-300 transition-colors rounded-xl task-quick-add-row">
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
        /* KANBAN BOARD VIEW - Distinct Contrast, Refined Header & Cards */
        <div className="flex-1 overflow-x-auto overflow-y-hidden custom-chat-scrollbar p-5 flex gap-4 items-start bg-[#121215]">
          {kanbanColumns.map(statusCol => {
                const colTasks = filteredTasks.filter(t => getTaskColumnId(t) === statusCol.id)
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
                    className={`w-76 shrink-0 flex flex-col max-h-full rounded-2xl bg-[#0e0e11] border-0 overflow-hidden transition-all ${
                      isDragTarget ? 'ring-1 ring-[var(--accent)]/50 bg-[#111114]' : ''
                    }`}
                  >
                    {/* Differentiated Column Header */}
                    <div className="flex items-center justify-between mx-1.5 mt-1.5 px-3 py-2 rounded-xl bg-[#1b1b1f] shadow-[0_2px_6px_rgba(0,0,0,0.45)] shrink-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0 shadow-xs"
                          style={{ backgroundColor: statusCol.color }}
                        />
                        <span className="text-xs font-semibold text-zinc-100 truncate tracking-wide">
                          {statusCol.name}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-mono font-medium bg-[#0e0e11] text-zinc-400 shrink-0">
                          {colTasks.length}
                        </span>
                      </div>
                      <button
                        onClick={() => {
                          setAddingInColumnId(statusCol.id)
                          setNewColumnTaskTitle('')
                        }}
                        className="p-1 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700/40 rounded-lg transition-colors cursor-pointer shrink-0"
                        title="Adicionar tarefa nesta coluna"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Column Cards Container */}
                    <div className="flex-1 overflow-y-auto space-y-2.5 custom-chat-scrollbar p-3">
                      {colTasks.length === 0 && !isAdding && (
                        <div className="py-8 text-center text-xs text-zinc-600 font-medium">
                          Nenhuma tarefa
                        </div>
                      )}

                      {colTasks.map(task => {
                        const isSelected = selectedTaskId === task.id
                        const priorityInfo = getPriorityBadge(task.priority)
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
                                ? 'bg-[#1a1a1e] ring-1 ring-[var(--accent)]/70 border-0'
                                : 'bg-[#161619] hover:bg-[#1a1a1e] border-0'
                            }`}
                          >
                            {/* Card Top: Checkbox, Title, Delete */}
                            <div className="flex items-start gap-2">
                              <button
                                type="button"
                                onClick={e => handleToggleComplete(task, e)}
                                className="mt-0.5 cursor-pointer shrink-0 relative flex items-center justify-center p-0.5"
                              >
                                <div
                                  className={`w-3.5 h-3.5 rounded-[4px] flex items-center justify-center transition-all ${
                                    task.completed
                                      ? 'bg-emerald-500 text-zinc-950 shadow-xs affine-check-pop'
                                      : 'border border-zinc-700 hover:border-zinc-500 bg-transparent'
                                  }`}
                                >
                                  {task.completed && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                                </div>
                                {burstingTaskId === task.id && (
                                  <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                                    <span className="absolute w-1 h-1 rounded-full bg-emerald-400 affine-dot-top" />
                                    <span className="absolute w-1 h-1 rounded-full bg-emerald-400 affine-dot-bottom" />
                                    <span className="absolute w-1 h-1 rounded-full bg-emerald-400 affine-dot-left" />
                                    <span className="absolute w-1 h-1 rounded-full bg-emerald-400 affine-dot-right" />
                                  </div>
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
                                  setTaskToDelete(task)
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
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-zinc-800/50 text-zinc-300 whitespace-nowrap">
                                  <CheckSquare className="w-2.5 h-2.5 text-zinc-400 shrink-0" />
                                  <span>
                                    {task.subtasks.filter(st => st.completed).length}/{task.subtasks.length}
                                  </span>
                                </span>
                              )}

                              {/* Status pill when columns are not organized by status */}
                              {groupProp.id !== 'prop_status' && (() => {
                                const st = safeStatuses.find(s => s.id === task.statusId) || safeStatuses[0]
                                return st ? (
                                  <span
                                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium"
                                    style={{ backgroundColor: `${st.color}20`, color: st.color }}
                                  >
                                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: st.color }} />
                                    <span>{st.name}</span>
                                  </span>
                                ) : null
                              })()}

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
                                  className="task-tag-badge px-1.5 py-0.5 rounded bg-zinc-850/90 text-[9.5px] text-zinc-400 font-mono"
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
                            className="w-full px-3 py-2 bg-[#161619] border-0 rounded-xl text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none"
                          />
                        </form>
                      )}
                    </div>

                    {/* Column Bottom Add Button */}
                    {!isAdding && (
                      <div className="p-2.5 pt-0 shrink-0">
                        <button
                          onClick={() => {
                            setAddingInColumnId(statusCol.id)
                            setNewColumnTaskTitle('')
                          }}
                          className="w-full py-1.5 px-3 flex items-center justify-center gap-1.5 text-[11px] text-zinc-400 hover:text-zinc-200 hover:bg-[#161619] rounded-xl transition-colors cursor-pointer"
                        >
                          <Plus className="w-3 h-3" />
                          <span>Adicionar tarefa</span>
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
        </div>
      )}

      {/* Custom Task Deletion Confirmation Modal */}
      {taskToDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in-50"
          onClick={() => setTaskToDelete(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-[#16161a] border border-zinc-800/80 p-5 shadow-2xl space-y-4 animate-in zoom-in-95"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center shrink-0">
                <Trash2 className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-zinc-100">Excluir tarefa?</h3>
                <p className="text-xs text-zinc-400">Esta ação não poderá ser desfeita.</p>
              </div>
            </div>
            <p className="text-xs text-zinc-300 bg-[#0e0e11] px-3 py-2 rounded-xl border border-zinc-850 truncate">
              &ldquo;{taskToDelete.title}&rdquo;
            </p>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setTaskToDelete(null)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  onDeleteTask(taskToDelete.id)
                  setTaskToDelete(null)
                }}
                className="px-3.5 py-1.5 rounded-lg text-xs font-medium bg-rose-600 hover:bg-rose-500 text-white transition-colors cursor-pointer shadow-xs"
              >
                Excluir
              </button>
            </div>
          </div>
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

export default TasksView
