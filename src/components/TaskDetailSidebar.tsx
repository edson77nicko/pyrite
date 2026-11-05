import React, { useState, useMemo, useRef, useEffect } from 'react'
import type { TaskItem, TaskSettings, TaskPriority, SubTask, TaskBoard } from '../types/tasks'
import type { Note } from '../types'
import { DEFAULT_PRIORITIES } from '../utils/taskStorage'
import {
  getPropertyItems,
  isBuiltinProperty,
  getBoardProperties,
  formatDateBR,
  PRIORITY_STAR_MAP,
  STAR_TO_PRIORITY,
  getSavedLabels,
  saveLabelToPool,
  renameLabelInPool,
  removeLabelFromPool
} from '../utils/taskProperties'
import { TaskCustomPropertyField } from './TaskCustomPropertyField'
import { TaskContextPicker } from './TaskContextPicker'
import { CustomDatePickerPopover } from './CustomDatePickerPopover'
import { StatusBadge, computeStatusProgress } from './StatusIndicator'
import { LivePreviewEditor } from './LivePreviewEditor'
import { TaskLabelBadge } from './TaskLabelBadge'
import { TaskLabelPicker } from './TaskLabelPicker'
import { IconPickerPopover, renderDynamicIcon } from './IconPickerPopover'
import {
  CheckCircle2,
  X,
  Calendar,
  Flag,
  Compass,
  ExternalLink,
  Plus,
  Trash2,
  ChevronDown,
  Check,
  CheckSquare,
  Type,
  Hash,
  ChevronDownCircle,
  List,
  Loader,
  Link2,
  Maximize2,
  Columns2,
  DollarSign,
  FolderKanban
} from 'lucide-react'

const CUSTOM_PROP_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  text: Type,
  number: Hash,
  currency: DollarSign,
  select: ChevronDownCircle,
  multiselect: List,
  status: Loader,
  date: Calendar,
  checkbox: CheckSquare,
  url: Link2,
  board: FolderKanban
}

interface TaskDetailSidebarProps {
  task: TaskItem
  allNotes: Note[]
  settings: TaskSettings
  taskBoards?: TaskBoard[]
  activeBoard?: TaskBoard
  onSelectTaskBoard?: (boardId: string) => void
  onUpdateTask: (updatedTask: TaskItem) => void
  onDeleteTask: (taskId: string) => void
  onOpenNote: (noteId: string) => void
  onClose: () => void
  onToggleFullView?: () => void
}

export const TaskDetailSidebar: React.FC<TaskDetailSidebarProps> = ({
  task,
  allNotes,
  settings,
  taskBoards = [],
  activeBoard,
  onSelectTaskBoard,
  onUpdateTask,
  onDeleteTask,
  onOpenNote,
  onClose,
  onToggleFullView
}) => {
  // Resizable width state with localStorage persistence
  const [drawerWidth, setDrawerWidth] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('pyrite_task_drawer_width')
      return saved ? Math.min(820, Math.max(360, Number(saved))) : 440
    } catch {
      return 440
    }
  })
  const [isDraggingWidth, setIsDraggingWidth] = useState(false)

  // Drag handler to resize drawer width
  const handleMouseDownResize = (e: React.MouseEvent) => {
    e.preventDefault()
    setIsDraggingWidth(true)
    const startX = e.clientX
    const startWidth = drawerWidth

    const handleMouseMove = (moveEvent: MouseEvent) => {
      // Dragging left handle: moving cursor left (startX - clientX) increases width
      const deltaX = startX - moveEvent.clientX
      const newWidth = Math.min(850, Math.max(360, startWidth + deltaX))
      setDrawerWidth(newWidth)
    }

    const handleMouseUp = (upEvent: MouseEvent) => {
      setIsDraggingWidth(false)
      const deltaX = startX - upEvent.clientX
      const finalWidth = Math.min(850, Math.max(360, startWidth + deltaX))
      try {
        localStorage.setItem('pyrite_task_drawer_width', String(finalWidth))
      } catch {}
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
  }

  const toggleExpandWidth = () => {
    const nextWidth = drawerWidth > 550 ? 440 : 680
    setDrawerWidth(nextWidth)
    try {
      localStorage.setItem('pyrite_task_drawer_width', String(nextWidth))
    } catch {}
  }

  const [isContextPickerOpen, setIsContextPickerOpen] = useState(false)
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false)
  const [isDeadlinePickerOpen, setIsDeadlinePickerOpen] = useState(false)
  const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false)
  const [isPriorityDropdownOpen, setIsPriorityDropdownOpen] = useState(false)
  const [isDeletingTask, setIsDeletingTask] = useState(false)
  const [isTaskIconPickerOpen, setIsTaskIconPickerOpen] = useState(false)

  const sidebarRef = useRef<HTMLElement>(null)
  const dateBtnRef = useRef<HTMLButtonElement>(null)
  const deadlineBtnRef = useRef<HTMLButtonElement>(null)

  const [burstingSubtaskId, setBurstingSubtaskId] = useState<string | null>(null)

  // Close sidebar on click outside, preserving task switches, popovers and editor interactions
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      const path = e.composedPath ? e.composedPath() : []
      if (sidebarRef.current && path.includes(sidebarRef.current)) {
        return
      }

      const target = e.target as HTMLElement | null
      if (!target) return

      // If target was already detached from DOM (e.g. unmounted slash menu item / selection toolbar button)
      if (!target.isConnected) {
        return
      }

      // Check if click was inside sidebar
      if (sidebarRef.current && sidebarRef.current.contains(target)) {
        return
      }

      // Don't close if clicking inside editor menus, toolbars, popups, modals, or task items
      const isEditorOrOverlay = path.some((el: any) =>
        el.classList?.contains('editor-command-menu') ||
        el.classList?.contains('editor-selection-toolbar') ||
        el.classList?.contains('live-preview-container') ||
        el.dataset?.popoverPortal !== undefined ||
        el.dataset?.taskItem !== undefined
      )
      if (
        isEditorOrOverlay ||
        target.closest('.editor-command-menu') ||
        target.closest('.editor-selection-toolbar') ||
        target.closest('.live-preview-container') ||
        target.closest('[data-popover-portal]') ||
        target.closest('[role="dialog"]') ||
        target.closest('.fixed') ||
        target.closest('[data-task-item]')
      ) {
        return
      }

      onClose()
    }

    document.addEventListener('mousedown', handleOutsideClick)
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick)
    }
  }, [onClose])

  const [isAddingTag, setIsAddingTag] = useState(false)
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('')
  const [isAddingSubtask, setIsAddingSubtask] = useState(false)
  const [editingSubtaskId, setEditingSubtaskId] = useState<string | null>(null)
  const [editingSubtaskTitle, setEditingSubtaskTitle] = useState('')

  const safePriorities = useMemo(() => {
    return Array.isArray(settings?.priorities) && settings.priorities.length > 0
      ? settings.priorities
      : DEFAULT_PRIORITIES
  }, [settings?.priorities])

  const activeStatus = settings.statuses.find(s => s.id === task.statusId) || settings.statuses[0]
  const activePriority = safePriorities.find(p => p.id === task.priority) || safePriorities[0] || {
    id: 'none',
    label: 'Nenhuma',
    color: '#71717a'
  }

  const currentBoard = activeBoard || (taskBoards || []).find(b => b.id === (task.boardId || 'default'))
  const priorityStyle: 'badge' | 'stars' = currentBoard?.priorityIndicatorStyle || 'badge'

  const boardProps = useMemo(
    () => getBoardProperties(settings, task.boardId),
    [settings, task.boardId]
  )
  const isPropActive = (id: string) => boardProps.some(p => p.id === id)

  const customProps = useMemo(
    () => boardProps.filter(p => !isBuiltinProperty(p.id)),
    [boardProps]
  )

  const handleCustomValueChange = (propId: string, value: any) => {
    const next = { ...(task.customValues || {}) }
    if (value === undefined || value === '') delete next[propId]
    else next[propId] = value
    onUpdateTask({ ...task, customValues: next, updatedAt: Date.now() })
  }

  const handleStartEditSubtask = (st: SubTask, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingSubtaskId(st.id)
    setEditingSubtaskTitle(st.title)
  }

  const handleSaveSubtaskTitle = (subId: string) => {
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

  const handleTitleChange = (newTitle: string) => {
    onUpdateTask({ ...task, title: newTitle, updatedAt: Date.now() })
  }

  const handleStatusChange = (statusId: string) => {
    const chosenStatus = settings.statuses.find(s => s.id === statusId)
    onUpdateTask({
      ...task,
      statusId,
      completed: Boolean(chosenStatus?.isCompleted),
      updatedAt: Date.now()
    })
    setIsStatusDropdownOpen(false)
  }

  const handlePriorityChange = (priority: TaskPriority) => {
    onUpdateTask({ ...task, priority, updatedAt: Date.now() })
    setIsPriorityDropdownOpen(false)
  }

  const handleDateChange = (date: string | undefined) => {
    onUpdateTask({ ...task, date, startDate: date, updatedAt: Date.now() })
  }

  const handleDeadlineChange = (deadline: string | undefined) => {
    onUpdateTask({ ...task, deadline, endDate: deadline, updatedAt: Date.now() })
  }

  const handleRangeChange = (startDate: string | undefined, endDate: string | undefined) => {
    onUpdateTask({
      ...task,
      date: startDate,
      startDate: startDate,
      endDate: endDate,
      deadline: endDate,
      updatedAt: Date.now()
    })
  }

  const handleContextSelect = (note: Note | null) => {
    onUpdateTask({
      ...task,
      contextNoteId: note ? note.id : undefined,
      contextNoteTitle: note ? note.title : undefined,
      updatedAt: Date.now()
    })
  }

  const boardId = task.boardId || 'default'

  const allSavedLabels = useMemo(() => {
    return getSavedLabels(settings, undefined, boardId)
  }, [settings, boardId])

  const handleCreateLabel = (labelName: string) => {
    const clean = labelName.trim().replace(/^#/, '')
    if (!clean) return
    saveLabelToPool(clean, settings, boardId)
    if (!task.tags.some(t => t.toLowerCase() === clean.toLowerCase())) {
      onUpdateTask({
        ...task,
        tags: [...task.tags, clean],
        updatedAt: Date.now()
      })
    }
  }

  const handleRenameSavedLabel = (oldLabel: string, newLabel: string) => {
    renameLabelInPool(oldLabel, newLabel, boardId)
    if (task.tags.some(t => t.toLowerCase() === oldLabel.toLowerCase())) {
      const updatedTags = task.tags.map(t => (t.toLowerCase() === oldLabel.toLowerCase() ? newLabel : t))
      onUpdateTask({
        ...task,
        tags: updatedTags,
        updatedAt: Date.now()
      })
    }
  }

  const handleToggleLabel = (labelName: string) => {
    const exists = task.tags.some(t => t.toLowerCase() === labelName.toLowerCase())
    const nextTags = exists
      ? task.tags.filter(t => t.toLowerCase() !== labelName.toLowerCase())
      : [...task.tags, labelName]
    onUpdateTask({
      ...task,
      tags: nextTags,
      updatedAt: Date.now()
    })
  }

  const handleDeleteSavedLabel = (labelName: string) => {
    removeLabelFromPool(labelName, boardId)
    if (task.tags.some(t => t.toLowerCase() === labelName.toLowerCase())) {
      onUpdateTask({
        ...task,
        tags: task.tags.filter(t => t.toLowerCase() !== labelName.toLowerCase()),
        updatedAt: Date.now()
      })
    }
  }

  const handleRemoveTag = (tagToRemove: string) => {
    onUpdateTask({
      ...task,
      tags: task.tags.filter(t => t !== tagToRemove),
      updatedAt: Date.now()
    })
  }

  const handleToggleSubtask = (subtaskId: string) => {
    const currentSubtasks = task.subtasks || []
    const updated = currentSubtasks.map(st => {
      if (st.id === subtaskId) {
        const nextCompleted = !st.completed
        if (nextCompleted) {
          setBurstingSubtaskId(subtaskId)
          setTimeout(() => setBurstingSubtaskId(null), 500)
        }
        return { ...st, completed: nextCompleted }
      }
      return st
    })
    onUpdateTask({ ...task, subtasks: updated, updatedAt: Date.now() })
  }

  const handleAddSubtask = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newSubtaskTitle.trim()) return
    const newSt: SubTask = {
      id: 'st_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6),
      title: newSubtaskTitle.trim(),
      completed: false,
      createdAt: Date.now()
    }
    const currentSubtasks = task.subtasks || []
    onUpdateTask({
      ...task,
      subtasks: [...currentSubtasks, newSt],
      updatedAt: Date.now()
    })
    setNewSubtaskTitle('')
    setIsAddingSubtask(false)
  }

  const handleDeleteSubtask = (subtaskId: string) => {
    const currentSubtasks = task.subtasks || []
    onUpdateTask({
      ...task,
      subtasks: currentSubtasks.filter(st => st.id !== subtaskId),
      updatedAt: Date.now()
    })
  }

  const handleDescriptionChange = (description: string) => {
    onUpdateTask({ ...task, description, updatedAt: Date.now() })
  }

  // Virtual Note wrapper for LivePreviewEditor so the task content behaves 100% like a real note
  const virtualNote: Note = useMemo(() => ({
    id: task.id,
    title: task.title,
    content: task.description || '',
    folder: 'Tarefas',
    tags: task.tags,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt
  }), [task.id, task.title, task.description, task.tags, task.createdAt, task.updatedAt])

  return (
    <aside
      ref={sidebarRef}
      style={{ width: `${drawerWidth}px` }}
      className="task-detail-sidebar relative my-2 mr-2 ml-1.5 bg-[#121215] border border-zinc-800/80 rounded-2xl flex flex-col select-none shrink-0 text-xs text-zinc-200 z-20 shadow-2xl shadow-black/50 overflow-hidden animate-in slide-in-from-right-4 duration-150"
    >
      {/* Draggable Left Resize Handle */}
      <div
        onMouseDown={handleMouseDownResize}
        onDoubleClick={() => {
          setDrawerWidth(440)
          try {
            localStorage.setItem('pyrite_task_drawer_width', '440')
          } catch {}
        }}
        className={`absolute top-0 left-0 w-2 h-full cursor-col-resize select-none z-30 transition-colors ${
          isDraggingWidth ? 'bg-[var(--accent)]/80' : 'hover:bg-[var(--accent)]/40'
        }`}
        title="Arraste para redimensionar a largura do painel (duplo clique para restaurar 440px)"
      >
        {isDraggingWidth && <div className="w-[1px] h-full bg-[var(--accent)] mx-auto" />}
      </div>

      {/* 1. Header Toolbar - Sober without harsh white divider */}
      <div className="h-10 px-4 bg-[#151519] border-b border-zinc-800/50 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <div
            className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-medium text-[11px]"
            style={{
              backgroundColor: 'var(--accent-glow-subtle, rgba(197, 155, 39, 0.12))',
              color: 'var(--accent, #c59b27)'
            }}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Tarefa</span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={toggleExpandWidth}
            className="p-1 text-zinc-400 hover:text-zinc-100 hover:bg-[#1b1b20] rounded-md transition-colors cursor-pointer"
            title={drawerWidth > 550 ? 'Restaurar largura padrão' : 'Ampliar largura do painel'}
          >
            <Columns2 className="w-3.5 h-3.5" />
          </button>
          {onToggleFullView && (
            <button
              type="button"
              onClick={onToggleFullView}
              className="p-1 text-zinc-400 hover:text-zinc-100 hover:bg-[#1b1b20] rounded-md transition-colors cursor-pointer"
              title="Expandir para documento em tela inteira"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={() => setIsDeletingTask(true)}
            className="p-1 text-zinc-500 hover:text-rose-400 hover:bg-[#1b1b20] rounded-md transition-colors cursor-pointer"
            title="Excluir tarefa"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onClose}
            className="p-1 text-zinc-400 hover:text-zinc-100 hover:bg-[#1b1b20] rounded-md transition-colors cursor-pointer"
            title="Fechar detalhes"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 2. Scrollable Task Details Body */}
      <div className="flex-1 overflow-y-auto p-5 custom-chat-scrollbar space-y-4 flex flex-col">
        {/* Title & Task Icon button with IconPickerPopover */}
        <div className="flex items-start gap-3">
          <div className="relative mt-1 shrink-0">
            <button
              type="button"
              onClick={() => setIsTaskIconPickerOpen(prev => !prev)}
              className="p-1 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-[#1f1f24] border border-zinc-800 hover:border-zinc-700 transition-all cursor-pointer flex items-center justify-center group"
              title="Escolher ícone da tarefa"
            >
              {task.icon ? (
                renderDynamicIcon(task.icon, 'w-5 h-5 text-[var(--accent,#c59b27)]')
              ) : (
                <div className="w-5 h-5 rounded-md border border-dashed border-zinc-650 hover:border-zinc-400 flex items-center justify-center text-zinc-500 hover:text-zinc-300 transition-colors">
                  <CheckSquare className="w-3.5 h-3.5" />
                </div>
              )}
            </button>

            {isTaskIconPickerOpen && (
              <IconPickerPopover
                selectedIcon={task.icon}
                onSelectIcon={iconName => {
                  onUpdateTask({ ...task, icon: iconName, updatedAt: Date.now() })
                  setIsTaskIconPickerOpen(false)
                }}
                onRemoveIcon={() => {
                  const nextTask = { ...task, updatedAt: Date.now() }
                  delete nextTask.icon
                  onUpdateTask(nextTask)
                  setIsTaskIconPickerOpen(false)
                }}
                onClose={() => setIsTaskIconPickerOpen(false)}
                align="left"
              />
            )}
          </div>

          <div className="flex-1 min-w-0 flex items-center gap-1.5">
            <input
              type="text"
              value={task.title}
              onChange={e => handleTitleChange(e.target.value)}
              placeholder="Nome da tarefa..."
              className={`w-full bg-transparent font-bold text-lg text-zinc-100 placeholder-zinc-600 focus:outline-none transition-colors ${
                task.completed ? 'line-through text-zinc-500' : ''
              }`}
            />
            {onToggleFullView && (
              <button
                type="button"
                onClick={onToggleFullView}
                className="p-1 text-zinc-500 hover:text-zinc-200 hover:bg-[#1b1b20] rounded-md transition-colors cursor-pointer shrink-0"
                title="Expandir para documento em tela inteira"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Rótulos */}
        {isPropActive('prop_tags') && (
          <div className="relative flex items-center flex-wrap gap-1.5 pl-9">
            {task.tags.map(t => (
              <TaskLabelBadge
                key={t}
                label={t}
                size="sm"
                onRemove={() => handleRemoveTag(t)}
              />
            ))}

            <div className="relative inline-block">
              <button
                type="button"
                onClick={() => setIsAddingTag(o => !o)}
                className="text-[11px] text-zinc-500 hover:text-zinc-200 px-2 py-0.5 rounded-full border border-dashed border-zinc-750 hover:border-zinc-500 hover:bg-[#1b1b20] transition-colors cursor-pointer"
                title="Adicionar ou selecionar rótulos"
              >
                + Rótulo
              </button>

              {isAddingTag && (
                <TaskLabelPicker
                  selectedLabels={task.tags}
                  allSavedLabels={allSavedLabels}
                  onToggleLabel={handleToggleLabel}
                  onCreateLabel={handleCreateLabel}
                  onRenameSavedLabel={handleRenameSavedLabel}
                  onDeleteSavedLabel={handleDeleteSavedLabel}
                  onClose={() => setIsAddingTag(false)}
                  align="left"
                />
              )}
            </div>
          </div>
        )}

        {/* Properties Grid - Unified dark platform tone */}
        <div className="space-y-2 pt-2 bg-[#16161a] border border-zinc-800/60 p-3 rounded-xl">
          {/* Status Custom Dropdown */}
          {isPropActive('prop_status') && (
            <div className="grid grid-cols-[80px_1fr] items-center gap-2 text-xs relative">
              <div className="flex items-center gap-1.5 text-zinc-400">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: activeStatus.color }} />
                <span>Status</span>
              </div>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setIsStatusDropdownOpen(o => !o)
                    setIsPriorityDropdownOpen(false)
                  }}
                  className="w-full flex items-center justify-between bg-[#1b1b20] hover:bg-[#222228] rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <StatusBadge
                      name={activeStatus.name}
                      color={activeStatus.color}
                      progress={computeStatusProgress(activeStatus.id, settings.statuses)}
                      indicatorStyle={settings.statusIndicatorStyle || 'circle'}
                    />
                  </div>
                  <ChevronDown className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                </button>

                {isStatusDropdownOpen && (
                  <div className="absolute z-50 top-full left-0 mt-1 w-full bg-[#1a1a1f] border border-zinc-700/60 rounded-xl shadow-md p-1 space-y-0.5 animate-in fade-in duration-100 max-h-60 overflow-y-auto custom-chat-scrollbar">
                    {settings.statuses.map(st => {
                      const isSelected = st.id === activeStatus.id
                      const prog = computeStatusProgress(st.id, settings.statuses)
                      return (
                        <button
                          type="button"
                          key={st.id}
                          onClick={() => handleStatusChange(st.id)}
                          className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                            isSelected ? 'bg-zinc-800/80 text-white font-medium' : 'text-zinc-300 hover:bg-zinc-800/40'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <StatusBadge
                              name={st.name}
                              color={st.color}
                              progress={prog}
                              indicatorStyle={settings.statusIndicatorStyle || 'circle'}
                            />
                          </div>
                          {isSelected && <Check className="w-3.5 h-3.5 text-zinc-400" />}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Start Date / Início & End Date / Término */}
          {isPropActive('prop_deadline') && (
            <>
              <div className="grid grid-cols-[80px_1fr] items-center gap-2 text-xs relative">
                <div className="flex items-center gap-1.5 text-zinc-400">
                  <Calendar className="w-3.5 h-3.5 text-zinc-500" />
                  <span>Início</span>
                </div>
                <div className="relative">
                  <button
                    ref={dateBtnRef}
                    type="button"
                    onClick={() => {
                      setIsDatePickerOpen(o => !o)
                      setIsDeadlinePickerOpen(false)
                    }}
                    className="w-full flex items-center justify-between bg-[#1b1b20] hover:bg-[#222228] rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 transition-colors text-left cursor-pointer"
                  >
                    <span>{(task.startDate || task.date) ? formatDateBR(task.startDate || task.date) : 'Definir início...'}</span>
                    <Calendar className="w-3.5 h-3.5 text-zinc-500" />
                  </button>
                  {isDatePickerOpen && (
                    <CustomDatePickerPopover
                      value={task.startDate || task.date}
                      endDate={task.endDate || task.deadline}
                      onRangeChange={handleRangeChange}
                      onChange={handleDateChange}
                      onClose={() => setIsDatePickerOpen(false)}
                      anchorEl={dateBtnRef.current}
                      align="right"
                    />
                  )}
                </div>
              </div>

              {/* End Date / Término */}
              <div className="grid grid-cols-[80px_1fr] items-center gap-2 text-xs relative">
                <div className="flex items-center gap-1.5 text-zinc-400">
                  <Calendar className="w-3.5 h-3.5 text-zinc-500" />
                  <span>Término</span>
                </div>
                <div className="relative flex items-center gap-1.5">
                  <button
                    ref={deadlineBtnRef}
                    type="button"
                    onClick={() => {
                      setIsDeadlinePickerOpen(o => !o)
                      setIsDatePickerOpen(false)
                    }}
                    className="flex-1 flex items-center justify-between bg-[#1b1b20] hover:bg-[#222228] rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 transition-colors text-left cursor-pointer"
                  >
                    <span>{(task.endDate || task.deadline) ? formatDateBR(task.endDate || task.deadline) : 'Definir término...'}</span>
                    <Calendar className="w-3.5 h-3.5 text-zinc-500" />
                  </button>
                  {(task.endDate || task.deadline) && (task.endDate || task.deadline)!.slice(0, 10) === new Date().toISOString().slice(0, 10) && (
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0"
                      style={{
                        backgroundColor: 'var(--accent-glow-subtle, rgba(197, 155, 39, 0.15))',
                        color: 'var(--accent, #c59b27)'
                      }}
                    >
                      Hoje
                    </span>
                  )}
                  {isDeadlinePickerOpen && (
                    <CustomDatePickerPopover
                      value={task.startDate || task.date}
                      endDate={task.endDate || task.deadline}
                      onRangeChange={handleRangeChange}
                      onChange={handleDeadlineChange}
                      onClose={() => setIsDeadlinePickerOpen(false)}
                      anchorEl={deadlineBtnRef.current}
                      align="right"
                    />
                  )}
                </div>
              </div>
            </>
          )}

          {/* Priority */}
          {isPropActive('prop_priority') && (
            <div className="grid grid-cols-[80px_1fr] items-center gap-2 text-xs relative">
              <div className="flex items-center gap-1.5 text-zinc-400">
                <Flag className="w-3.5 h-3.5 text-zinc-500" />
                <span>Prioridade</span>
              </div>
              <div className="relative">
                {priorityStyle === 'stars' ? (
                  <div className="flex items-center gap-1 py-1 px-1 bg-[#1b1b20] rounded-lg">
                    {[1, 2, 3, 4, 5].map(starNum => {
                      const starCount = PRIORITY_STAR_MAP[task.priority] ?? 0
                      const isActive = starNum <= (starCount === 4 && starNum === 5 ? 4 : starCount)
                      return (
                        <button
                          key={starNum}
                          type="button"
                          onClick={() => {
                            const nextPri = starCount === starNum ? 'none' : (STAR_TO_PRIORITY[Math.min(4, starNum)] || 'none')
                            handlePriorityChange(nextPri as TaskPriority)
                          }}
                          className={`p-1 text-sm transition-transform hover:scale-125 cursor-pointer ${
                            isActive ? 'text-amber-400' : 'text-zinc-700 hover:text-amber-300/60'
                          }`}
                          title={`${starNum} estrela${starNum > 1 ? 's' : ''}`}
                        >
                          ★
                        </button>
                      )
                    })}
                  </div>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setIsPriorityDropdownOpen(o => !o)
                        setIsStatusDropdownOpen(false)
                      }}
                      className="w-full flex items-center justify-between bg-[#1b1b20] hover:bg-[#222228] rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <Flag className="w-3 h-3" style={{ color: activePriority.color }} />
                        <span>{activePriority.label}</span>
                      </div>
                      <ChevronDown className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                    </button>

                    {isPriorityDropdownOpen && (
                      <div className="absolute z-50 top-full left-0 mt-1 w-full bg-[#1a1a1f] border border-zinc-700/60 rounded-xl shadow-md p-1 space-y-0.5 animate-in fade-in duration-100">
                        {safePriorities.map(opt => {
                          const isSelected = opt.id === activePriority.id
                          return (
                            <button
                              type="button"
                              key={opt.id}
                              onClick={() => handlePriorityChange(opt.id as TaskPriority)}
                              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                                isSelected ? 'bg-zinc-800/80 text-white font-medium' : 'text-zinc-300 hover:bg-zinc-800/40'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <Flag className="w-3 h-3" style={{ color: opt.color }} />
                                <span>{opt.label}</span>
                              </div>
                              {isSelected && <Check className="w-3.5 h-3.5 text-zinc-400" />}
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* Context Note Picker (Nota) */}
          {isPropActive('prop_context') && (
            <div className="grid grid-cols-[80px_1fr] items-start gap-2 text-xs relative">
              <div className="flex items-center gap-1.5 text-zinc-400 pt-1.5">
                <Compass className="w-3.5 h-3.5 text-zinc-500" />
                <span>Nota</span>
              </div>

              <div className="relative">
                {task.contextNoteId ? (
                  <div className="task-context-active-box flex items-center justify-between p-1.5 bg-[#1b1b20] rounded-lg">
                    <button
                      onClick={() => setIsContextPickerOpen(true)}
                      className="flex items-center gap-1.5 truncate text-left font-medium hover:underline max-w-[190px] cursor-pointer"
                      style={{ color: 'var(--accent, #c59b27)' }}
                      title="Alterar nota vinculada"
                    >
                      <Compass className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--accent, #c59b27)' }} />
                      <span className="truncate">{task.contextNoteTitle || 'Nota'}</span>
                    </button>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => onOpenNote(task.contextNoteId!)}
                        className="p-1 hover:text-white text-zinc-400 hover:bg-zinc-800 rounded transition-colors cursor-pointer"
                        title="Abrir nota no editor"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleContextSelect(null)}
                        className="p-1 hover:text-rose-400 text-zinc-500 hover:bg-zinc-800 rounded transition-colors cursor-pointer"
                        title="Desvincular nota"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setIsContextPickerOpen(true)}
                    className="task-context-empty-btn w-full flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-dashed border-zinc-750 hover:border-zinc-500 text-zinc-400 hover:text-zinc-200 bg-[#1b1b20]/40 transition-colors text-left cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Vincular nota do cofre...</span>
                  </button>
                )}

                {/* Context Picker Dropdown */}
                {isContextPickerOpen && (
                  <TaskContextPicker
                    allNotes={allNotes}
                    selectedNoteId={task.contextNoteId}
                    onSelectNote={handleContextSelect}
                    onClose={() => setIsContextPickerOpen(false)}
                  />
                )}
              </div>
            </div>
          )}

          {/* Custom properties created in settings */}
          {customProps.map(prop => {
            const Icon = CUSTOM_PROP_ICONS[prop.type] || Type
            return (
              <div key={prop.id} className="grid grid-cols-[80px_1fr] items-start gap-2 text-xs relative">
                <div className="flex items-center gap-1.5 text-zinc-400 pt-1.5 min-w-0">
                  <Icon className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                  <span className="truncate">{prop.name}</span>
                </div>
                <TaskCustomPropertyField
                  prop={prop}
                  task={task}
                  items={getPropertyItems(settings, prop)}
                  boards={taskBoards}
                  onSelectBoard={onSelectTaskBoard}
                  onChange={val => handleCustomValueChange(prop.id, val)}
                />
              </div>
            )
          })}
        </div>

        {/* Subtarefas Section */}
        <div className="bg-[#16161a] border border-zinc-800/60 p-3 rounded-xl space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-zinc-300 font-medium">
              <CheckSquare className="w-3.5 h-3.5 text-zinc-400" />
              <span>Subtarefas</span>
              {(task.subtasks?.length ?? 0) > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#1b1b20] text-zinc-400 font-mono">
                  {task.subtasks?.filter(st => st.completed).length}/{task.subtasks?.length}
                </span>
              )}
            </div>

            {!isAddingSubtask && (
              <button
                type="button"
                onClick={() => setIsAddingSubtask(true)}
                className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] text-zinc-400 hover:text-zinc-200 hover:bg-[#1b1b20] transition-colors cursor-pointer"
              >
                <Plus className="w-3 h-3" />
                <span>Adicionar</span>
              </button>
            )}
          </div>

          {/* Subtasks list with Affine 4-Dot Cardinal Burst */}
          <div className="space-y-1">
            {task.subtasks && task.subtasks.length > 0 ? (
              task.subtasks.map(st => (
                <div
                  key={st.id}
                  className="group flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-[#121215] hover:bg-[#1b1b20] transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={() => handleToggleSubtask(st.id)}
                      className="cursor-pointer shrink-0 relative flex items-center justify-center p-0.5"
                    >
                      <div
                        className={`w-3.5 h-3.5 rounded-[4px] flex items-center justify-center transition-all ${
                          st.completed
                            ? 'bg-emerald-500 text-zinc-950 shadow-xs affine-check-pop'
                            : 'border border-zinc-700 hover:border-zinc-500 bg-transparent'
                        }`}
                      >
                        {st.completed && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                      </div>

                      {burstingSubtaskId === st.id && (
                        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                          <span className="absolute w-1 h-1 rounded-full bg-emerald-400 affine-dot-top" />
                          <span className="absolute w-1 h-1 rounded-full bg-emerald-400 affine-dot-bottom" />
                          <span className="absolute w-1 h-1 rounded-full bg-emerald-400 affine-dot-left" />
                          <span className="absolute w-1 h-1 rounded-full bg-emerald-400 affine-dot-right" />
                        </div>
                      )}
                    </button>

                    {editingSubtaskId === st.id ? (
                      <input
                        autoFocus
                        type="text"
                        value={editingSubtaskTitle}
                        onChange={e => setEditingSubtaskTitle(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleSaveSubtaskTitle(st.id)
                          if (e.key === 'Escape') setEditingSubtaskId(null)
                        }}
                        onBlur={() => handleSaveSubtaskTitle(st.id)}
                        onClick={e => e.stopPropagation()}
                        className="text-xs bg-zinc-800/80 text-zinc-100 border border-zinc-700 rounded px-1.5 py-0.5 outline-none flex-1 min-w-0"
                      />
                    ) : (
                      <span
                        onClick={e => handleStartEditSubtask(st, e)}
                        className={`text-xs truncate cursor-text hover:text-zinc-100 transition-colors ${
                          st.completed ? 'line-through text-zinc-500' : 'text-zinc-200'
                        }`}
                        title="Clique para editar o texto da subtarefa"
                      >
                        {st.title}
                      </span>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => handleDeleteSubtask(st.id)}
                    className="opacity-0 group-hover:opacity-100 p-0.5 text-zinc-500 hover:text-rose-400 transition-opacity cursor-pointer shrink-0"
                    title="Excluir subtarefa"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))
            ) : !isAddingSubtask ? (
              <div className="text-[11px] text-zinc-500 italic py-1 px-1">
                Nenhuma subtarefa
              </div>
            ) : null}

            {isAddingSubtask && (
              <form onSubmit={handleAddSubtask} className="pt-1 flex items-center gap-1.5">
                <input
                  type="text"
                  autoFocus
                  value={newSubtaskTitle}
                  onChange={e => setNewSubtaskTitle(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Escape') setIsAddingSubtask(false)
                  }}
                  onBlur={() => {
                    if (!newSubtaskTitle.trim()) setIsAddingSubtask(false)
                  }}
                  placeholder="Nome da subtarefa... (Enter)"
                  className="flex-1 px-2.5 py-1.5 bg-[#121215] border border-zinc-800 rounded-lg text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-600"
                />
              </form>
            )}
          </div>
        </div>

        {/* Divisor bem apagado entre as propriedades e o conteúdo */}
        <div className="h-px bg-zinc-800/35 my-3.5 mx-1" />

        {/* 3. Internal Content / Notes of the Task (100% clean note surface, no guidance labels) */}
        <div className="flex-1 flex flex-col min-h-[300px] pt-1">
          <div className="flex-1 relative bg-transparent">
            <LivePreviewEditor
              key={task.id}
              note={virtualNote}
              allNotes={allNotes}
              displayMode="live"
              onUpdateContent={handleDescriptionChange}
              onNavigate={onOpenNote}
              fontSizeClass="text-xs leading-relaxed"
            />
          </div>
        </div>
      </div>
      {/* Custom Task Deletion Confirmation Modal */}
      {isDeletingTask && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in-50"
          onClick={() => setIsDeletingTask(false)}
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
              &ldquo;{task.title}&rdquo;
            </p>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setIsDeletingTask(false)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  onDeleteTask(task.id)
                  setIsDeletingTask(false)
                  onClose()
                }}
                className="px-3.5 py-1.5 rounded-lg text-xs font-medium bg-rose-600 hover:bg-rose-500 text-white transition-colors cursor-pointer shadow-xs"
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  )
}
export default TaskDetailSidebar
