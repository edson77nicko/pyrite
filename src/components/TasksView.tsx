import React, { useState, useMemo, useEffect } from 'react'
import type { TaskItem, TaskSettings, TaskPriority, SubTask, TaskBoard, TaskPropertyConfig } from '../types/tasks'
import type { Note } from '../types'
import { DEFAULT_TASK_SETTINGS, DEFAULT_PRIORITIES } from '../utils/taskStorage'
import {
  getPropertyItems,
  isBuiltinProperty,
  isOptionProperty,
  getBoardProperties,
  formatDateBR,
  formatDateRangeBR,
  formatCurrencyValue,
  PRIORITY_STAR_MAP,
  STAR_TO_PRIORITY,
  getSavedLabels,
  saveLabelToPool,
  renameLabelInPool,
  removeLabelFromPool,
  type PropertyItem
} from '../utils/taskProperties'
import { Pill } from './TaskCustomPropertyField'
import { TaskSettingsModal } from './TaskSettingsModal'
import { TaskDocumentView } from './TaskDocumentView'
import { TaskDetailSidebar } from './TaskDetailSidebar'
import { TaskGanttView } from './TaskGanttView'
import { CustomDatePickerPopover } from './CustomDatePickerPopover'
import { TaskContextPicker } from './TaskContextPicker'
import { TaskLabelBadge } from './TaskLabelBadge'
import { TaskLabelPicker } from './TaskLabelPicker'
import { IconPickerPopover, renderDynamicIcon } from './IconPickerPopover'
import {
  StatusBadge,
  StatusProgressCircle,
  StatusBarProgress,
  computeStatusProgress,
  type StatusIndicatorStyle
} from './StatusIndicator'
import {
  Plus,
  Settings,
  Search,
  Calendar,
  Flag,
  Compass,
  Trash2,
  List,
  Kanban,
  GanttChart,
  SlidersHorizontal,
  ChevronDown,
  ChevronRight,
  Check,
  CheckSquare,
  CornerDownRight,
  Pencil,
  PanelRightOpen,
  FolderKanban,
  Box,
  ExternalLink,
  X
} from 'lucide-react'

interface TasksViewProps {
  tasks: TaskItem[]
  allNotes: Note[]
  settings: TaskSettings
  selectedTaskId?: string | null
  activeBoardId?: string
  taskBoards?: TaskBoard[]
  onSelectTaskBoard?: (boardId: string) => void
  onChangeTaskBoardIcon?: (boardId: string, icon: string) => void
  onSelectTask: (task: TaskItem | null) => void
  onCreateTask: (initialTitle?: string, initialData?: Partial<TaskItem>) => void
  onUpdateTask: (task: TaskItem) => void
  onDeleteTask: (taskId: string) => void
  onUpdateSettings: (settings: TaskSettings) => void
  onOpenNote: (noteId: string) => void
}

type ViewMode = 'list' | 'kanban' | 'gantt'
type KanbanGroupBy = string

const DEFAULT_COLUMN_WIDTHS: Record<string, number> = {
  col_select: 44,
  col_title: 320,
  prop_status: 170,
  prop_priority: 130,
  prop_deadline: 160,
  prop_context: 170,
  prop_tags: 150,
  col_actions: 44
}

const MIN_COLUMN_WIDTHS: Record<string, number> = {
  col_select: 40,
  col_title: 150,
  prop_status: 110,
  prop_priority: 90,
  prop_deadline: 110,
  prop_context: 100,
  prop_tags: 90,
  col_actions: 40
}

export const TasksView: React.FC<TasksViewProps> = ({
  tasks,
  allNotes,
  settings,
  selectedTaskId,
  activeBoardId = 'default',
  taskBoards = [],
  onSelectTaskBoard,
  onChangeTaskBoardIcon,
  onSelectTask,
  onCreateTask,
  onUpdateTask,
  onDeleteTask,
  onUpdateSettings,
  onOpenNote
}) => {
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    try {
      const saved = localStorage.getItem('pyrite_tasks_view_mode')
      if (saved === 'list' || saved === 'kanban' || saved === 'gantt') {
        return saved
      }
    } catch {}
    return 'list'
  })

  useEffect(() => {
    try {
      localStorage.setItem('pyrite_tasks_view_mode', viewMode)
    } catch {}
  }, [viewMode])

  const [kanbanGroupBy, setKanbanGroupBy] = useState<KanbanGroupBy>('prop_status')
  const [isGroupingMenuOpen, setIsGroupingMenuOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isBoardIconPickerOpen, setIsBoardIconPickerOpen] = useState(false)

  // Labels pool for this specific project/board
  const allSavedLabels = useMemo(() => {
    return getSavedLabels(settings, tasks, activeBoardId || 'default')
  }, [settings, tasks, activeBoardId])

  const handleCreateLabelForTask = (labelName: string, task: TaskItem) => {
    const clean = labelName.trim().replace(/^#/, '')
    if (!clean) return
    const boardKey = activeBoardId || 'default'
    saveLabelToPool(clean, settings, tasks, boardKey)
    const exists = task.tags.some(t => t.toLowerCase() === clean.toLowerCase())
    if (!exists) {
      onUpdateTask({ ...task, tags: [...task.tags, clean], updatedAt: Date.now() })
    }
    if (onUpdateSettings) {
      const curBoardLabels = settings.boardLabels?.[boardKey] || []
      if (!curBoardLabels.some(l => l.toLowerCase() === clean.toLowerCase())) {
        onUpdateSettings({
          ...settings,
          boardLabels: {
            ...(settings.boardLabels || {}),
            [boardKey]: [...curBoardLabels, clean]
          }
        })
      }
    }
  }

  const handleToggleLabelForTask = (labelName: string, task: TaskItem) => {
    const exists = task.tags.some(t => t.toLowerCase() === labelName.toLowerCase())
    const nextTags = exists
      ? task.tags.filter(t => t.toLowerCase() !== labelName.toLowerCase())
      : [...task.tags, labelName]
    onUpdateTask({ ...task, tags: nextTags, updatedAt: Date.now() })
  }

  const handleRenameSavedLabel = (oldLabel: string, newLabel: string) => {
    const boardKey = activeBoardId || 'default'
    renameLabelInPool(oldLabel, newLabel, boardKey)

    // Update in all tasks belonging to this board
    tasks.forEach(t => {
      const tBoard = t.boardId || 'default'
      if (tBoard === boardKey && t.tags.some(tg => tg.toLowerCase() === oldLabel.toLowerCase())) {
        const nextTags = t.tags.map(tg => (tg.toLowerCase() === oldLabel.toLowerCase() ? newLabel : tg))
        onUpdateTask({ ...t, tags: nextTags, updatedAt: Date.now() })
      }
    })

    if (onUpdateSettings && settings.boardLabels?.[boardKey]) {
      const updated = settings.boardLabels[boardKey].map(l =>
        l.toLowerCase() === oldLabel.toLowerCase() ? newLabel : l
      )
      onUpdateSettings({
        ...settings,
        boardLabels: {
          ...settings.boardLabels,
          [boardKey]: updated
        }
      })
    }
  }

  const handleDeleteSavedLabel = (labelName: string) => {
    const boardKey = activeBoardId || 'default'
    removeLabelFromPool(labelName, boardKey)

    // Remove from all tasks belonging to this board
    tasks.forEach(t => {
      const tBoard = t.boardId || 'default'
      if (tBoard === boardKey && t.tags.some(tg => tg.toLowerCase() === labelName.toLowerCase())) {
        const nextTags = t.tags.filter(tg => tg.toLowerCase() !== labelName.toLowerCase())
        onUpdateTask({ ...t, tags: nextTags, updatedAt: Date.now() })
      }
    })

    if (onUpdateSettings && settings.boardLabels?.[boardKey]) {
      onUpdateSettings({
        ...settings,
        boardLabels: {
          ...settings.boardLabels,
          [boardKey]: settings.boardLabels[boardKey].filter(l => l.toLowerCase() !== labelName.toLowerCase())
        }
      })
    }
  }

  // Nome customizável da primeira coluna (ex: "Nome", "Tarefa", "Cliente", etc.)
  const [isEditingTitleCol, setIsEditingTitleCol] = useState(false)
  const [titleColDraft, setTitleColDraft] = useState('')

  // Inline editing states
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null)
  const [titleDraft, setTitleDraft] = useState('')
  const [inlinePriorityTaskId, setInlinePriorityTaskId] = useState<string | null>(null)
  const [inlineContextTaskId, setInlineContextTaskId] = useState<string | null>(null)
  const [inlineTagsTaskId, setInlineTagsTaskId] = useState<string | null>(null)
  const [inlineCustomField, setInlineCustomField] = useState<{ taskId: string; propId: string } | null>(null)
  const [inlineBoardTaskId, setInlineBoardTaskId] = useState<string | null>(null)
  const [inlineBoardPropId, setInlineBoardPropId] = useState<string | null>(null)

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

  // Resizable column widths
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem('pyrite_task_col_widths')
      if (saved) return { ...DEFAULT_COLUMN_WIDTHS, ...JSON.parse(saved) }
    } catch {}
    return DEFAULT_COLUMN_WIDTHS
  })
  const resizingColRef = React.useRef<{ colId: string; startX: number; startWidth: number } | null>(null)
  const [activeResizingCol, setActiveResizingCol] = useState<string | null>(null)

  // Inline status dropdown
  const [inlineStatusTaskId, setInlineStatusTaskId] = useState<string | null>(null)

  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null
      if (target?.closest('[data-inline-popover]')) return
      setInlineStatusTaskId(null)
      setInlinePriorityTaskId(null)
      setInlineBoardTaskId(null)
      setInlineBoardPropId(null)
      setInlineCustomField(null)
    }
    window.addEventListener('click', handleClickOutside)
    return () => window.removeEventListener('click', handleClickOutside)
  }, [])

  const handleResizeStart = (colId: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const currentWidth = columnWidths[colId] || DEFAULT_COLUMN_WIDTHS[colId] || 150
    resizingColRef.current = {
      colId,
      startX: e.clientX,
      startWidth: currentWidth
    }
    setActiveResizingCol(colId)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!resizingColRef.current) return
      const { colId: activeId, startX, startWidth } = resizingColRef.current
      const minWidth = MIN_COLUMN_WIDTHS[activeId] || 80
      const delta = moveEvent.clientX - startX
      const newWidth = Math.max(minWidth, startWidth + delta)
      setColumnWidths(prev => ({ ...prev, [activeId]: newWidth }))
    }

    const onMouseUp = () => {
      resizingColRef.current = null
      setActiveResizingCol(null)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      setColumnWidths(latest => {
        try {
          localStorage.setItem('pyrite_task_col_widths', JSON.stringify(latest))
        } catch {}
        return latest
      })
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  const handleResetColWidth = (colId: string) => {
    const def = DEFAULT_COLUMN_WIDTHS[colId] || 150
    setColumnWidths(prev => {
      const next = { ...prev, [colId]: def }
      try {
        localStorage.setItem('pyrite_task_col_widths', JSON.stringify(next))
      } catch {}
      return next
    })
  }

  // Board filtering
  const currentBoardId = activeBoardId || 'default'
  const currentBoard = useMemo(() => {
    return taskBoards.find(b => b.id === currentBoardId)
  }, [taskBoards, currentBoardId])

  const indicatorStyle: StatusIndicatorStyle = currentBoard?.statusIndicatorStyle || settings.statusIndicatorStyle || 'circle'
  const priorityStyle: 'badge' | 'stars' = currentBoard?.priorityIndicatorStyle || 'badge'

  const cycleStatusIndicatorStyle = (e: React.MouseEvent) => {
    e.stopPropagation()
    const order: StatusIndicatorStyle[] = ['circle', 'bar', 'dot']
    const nextIdx = (order.indexOf(indicatorStyle) + 1) % order.length
    const next = order[nextIdx]
    if (currentBoard) {
      const allBoards = settings.boards && settings.boards.length > 0 ? settings.boards : taskBoards
      const updatedBoards = allBoards.map(b => (b.id === currentBoard.id ? { ...b, statusIndicatorStyle: next } : b))
      onUpdateSettings({ ...settings, boards: updatedBoards })
    } else {
      onUpdateSettings({ ...settings, statusIndicatorStyle: next })
    }
  }

  const todayStr = new Date().toISOString().slice(0, 10)

  const safeStatuses = Array.isArray(settings?.statuses) ? settings.statuses : DEFAULT_TASK_SETTINGS.statuses
  const safeProperties = useMemo(() => {
    return getBoardProperties(settings, currentBoardId)
  }, [settings, currentBoardId])

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
    const items = getPropertyItems(settings, prop)

    const updateValue = (nextVal: any) => {
      const nextCustom = { ...(task.customValues || {}) }
      if (nextVal === undefined || nextVal === '') delete nextCustom[prop.id]
      else nextCustom[prop.id] = nextVal
      onUpdateTask({ ...task, customValues: nextCustom, updatedAt: Date.now() })
    }

    switch (prop.type) {
      case 'currency': {
        const isEditing = inlineCustomField?.taskId === task.id && inlineCustomField.propId === prop.id
        if (isEditing) {
          return (
            <input
              autoFocus
              type="number"
              step="0.01"
              defaultValue={v ?? ''}
              onClick={e => e.stopPropagation()}
              onBlur={e => {
                const val = e.target.value === '' ? undefined : Number(e.target.value)
                updateValue(val)
                setInlineCustomField(null)
              }}
              onKeyDown={e => {
                if (e.key === 'Enter') e.currentTarget.blur()
                if (e.key === 'Escape') setInlineCustomField(null)
              }}
              className="w-full bg-zinc-900 border border-[var(--accent,#c59b27)]/60 rounded px-1.5 py-0.5 text-xs text-zinc-100 font-mono outline-none"
            />
          )
        }
        return (
          <span
            onClick={e => {
              e.stopPropagation()
              setInlineCustomField({ taskId: task.id, propId: prop.id })
            }}
            className="text-[11px] font-mono text-zinc-200 hover:bg-zinc-800/40 px-1 py-0.5 rounded cursor-pointer truncate block"
            title="Clique para editar valor"
          >
            {v !== undefined && v !== '' ? formatCurrencyValue(v, prop.currencyCode) : <span className="text-zinc-600">-</span>}
          </span>
        )
      }

      case 'board': {
        const linkedBoard = taskBoards.find(b => b.id === v)
        const isMenuOpen = inlineBoardTaskId === task.id && inlineBoardPropId === prop.id
        return (
          <div className="relative flex items-center gap-1" data-inline-popover="true">
            <button
              type="button"
              onClick={e => {
                e.stopPropagation()
                if (isMenuOpen) {
                  setInlineBoardTaskId(null)
                  setInlineBoardPropId(null)
                } else {
                  setInlineBoardTaskId(task.id)
                  setInlineBoardPropId(prop.id)
                }
              }}
              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[#18181b] hover:bg-zinc-800 transition-colors text-[11px] font-medium max-w-[130px] truncate cursor-pointer text-amber-400"
              title="Clique para vincular projeto/item"
            >
              {linkedBoard ? (
                <>
                  {linkedBoard.category === 'item' ? (
                    <Box className="w-3 h-3 text-amber-400 shrink-0" />
                  ) : (
                    <FolderKanban className="w-3 h-3 text-amber-400 shrink-0" />
                  )}
                  <span className="truncate">{linkedBoard.name}</span>
                </>
              ) : (
                <span className="text-zinc-600">-</span>
              )}
            </button>

            {linkedBoard && onSelectTaskBoard && (
              <button
                type="button"
                onClick={e => {
                  e.stopPropagation()
                  onSelectTaskBoard(linkedBoard.id)
                }}
                className="opacity-0 group-hover:opacity-100 p-0.5 text-amber-400 hover:text-amber-300 transition-opacity cursor-pointer shrink-0"
                title={`Ir direto para ${linkedBoard.name}`}
              >
                <ExternalLink className="w-3 h-3" />
              </button>
            )}

            {isMenuOpen && (
              <div
                onClick={e => e.stopPropagation()}
                className="absolute top-full left-0 mt-1 z-50 w-48 rounded-xl bg-[#18181b] shadow-2xl p-1.5 space-y-0.5 border border-zinc-700/80 animate-in fade-in-50 max-h-56 overflow-y-auto custom-chat-scrollbar"
              >
                {v && (
                  <button
                    type="button"
                    onClick={() => {
                      updateValue(undefined)
                      setInlineBoardTaskId(null)
                      setInlineBoardPropId(null)
                    }}
                    className="w-full flex items-center gap-2 px-2 py-1 rounded-md text-[11px] text-zinc-500 hover:bg-zinc-800/40 cursor-pointer"
                  >
                    <X className="w-3 h-3" /> Desvincular
                  </button>
                )}
                {taskBoards.map(b => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => {
                      updateValue(b.id)
                      setInlineBoardTaskId(null)
                      setInlineBoardPropId(null)
                    }}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs cursor-pointer ${
                      b.id === v ? 'bg-zinc-800/80 text-amber-300 font-medium' : 'text-zinc-300 hover:bg-zinc-800/40'
                    }`}
                  >
                    <span className="flex items-center gap-2 truncate">
                      {b.category === 'item' ? (
                        <Box className="w-3 h-3 text-amber-400/80 shrink-0" />
                      ) : (
                        <FolderKanban className="w-3 h-3 text-amber-400/80 shrink-0" />
                      )}
                      <span className="truncate">{b.name}</span>
                    </span>
                    {b.id === v && <Check className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        )
      }

      case 'checkbox':
        return (
          <button
            type="button"
            onClick={e => {
              e.stopPropagation()
              updateValue(!v)
            }}
            className={`w-4 h-4 rounded-[4px] flex items-center justify-center cursor-pointer transition-all ${
              v ? 'bg-emerald-500 text-zinc-950' : 'border border-zinc-700 hover:border-zinc-500'
            }`}
          >
            {v && <Check className="w-3 h-3 stroke-[3]" />}
          </button>
        )

      case 'select':
      case 'status': {
        const cur = items.find(i => i.id === v)
        const isMenuOpen = inlineCustomField?.taskId === task.id && inlineCustomField.propId === prop.id
        return (
          <div className="relative inline-block" data-inline-popover="true">
            <button
              type="button"
              onClick={e => {
                e.stopPropagation()
                setInlineCustomField(isMenuOpen ? null : { taskId: task.id, propId: prop.id })
              }}
              className="cursor-pointer text-left"
            >
              {cur ? <Pill item={cur} /> : <span className="text-zinc-600">-</span>}
            </button>
            {isMenuOpen && (
              <div
                onClick={e => e.stopPropagation()}
                className="absolute top-full left-0 mt-1 z-40 w-44 rounded-xl bg-[#18181b] shadow-2xl p-1.5 space-y-0.5 border border-zinc-700/80 animate-in fade-in-50 max-h-48 overflow-y-auto custom-chat-scrollbar"
              >
                {items.map(it => (
                  <button
                    key={it.id}
                    type="button"
                    onClick={() => {
                      updateValue(it.id)
                      setInlineCustomField(null)
                    }}
                    className={`w-full flex items-center justify-between px-2 py-1 rounded text-xs cursor-pointer ${
                      it.id === v ? 'bg-zinc-800 text-white font-medium' : 'text-zinc-300 hover:bg-zinc-800/40'
                    }`}
                  >
                    <Pill item={it} />
                    {it.id === v && <Check className="w-3 h-3 text-zinc-400 shrink-0" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        )
      }

      case 'multiselect': {
        const selectedIds: string[] = Array.isArray(v) ? v : []
        const selectedItems = items.filter(it => selectedIds.includes(it.id))
        const isEditing = inlineCustomField?.taskId === task.id && inlineCustomField.propId === prop.id

        return (
          <div className="relative max-w-full" data-inline-popover="true">
            <div
              onClick={e => {
                e.stopPropagation()
                setInlineCustomField(isEditing ? null : { taskId: task.id, propId: prop.id })
              }}
              className="flex items-center gap-1 max-w-full overflow-hidden cursor-pointer flex-nowrap"
            >
              {selectedItems.length > 0 ? (
                selectedItems.map(it => <Pill key={it.id} item={it} />)
              ) : (
                <span className="opacity-0 group-hover:opacity-100 text-[10.5px] text-zinc-500 hover:text-zinc-300 transition-opacity whitespace-nowrap">
                  + escolher
                </span>
              )}
            </div>

            {isEditing && (
              <div
                onClick={e => e.stopPropagation()}
                className="absolute top-full left-0 mt-1 z-40 w-48 rounded-xl bg-[#18181b] shadow-2xl p-1.5 space-y-0.5 border border-zinc-700/80 animate-in fade-in-50"
              >
                <div className="text-[10px] font-semibold text-zinc-400 px-2 py-0.5 uppercase tracking-wider">
                  {prop.name}
                </div>
                {items.length === 0 ? (
                  <div className="p-2 text-center text-zinc-500 text-xs">Sem opções</div>
                ) : (
                  items.map(it => {
                    const on = selectedIds.includes(it.id)
                    return (
                      <button
                        key={it.id}
                        type="button"
                        onClick={e => {
                          e.stopPropagation()
                          const next = on ? selectedIds.filter(id => id !== it.id) : [...selectedIds, it.id]
                          updateValue(next)
                        }}
                        className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                          on ? 'bg-zinc-800 text-white font-medium' : 'hover:bg-zinc-800/50 text-zinc-300'
                        }`}
                      >
                        <Pill item={it} />
                        {on && <Check className="w-3.5 h-3.5 text-zinc-400 shrink-0" />}
                      </button>
                    )
                  })
                )}
              </div>
            )}
          </div>
        )
      }

      case 'text':
      case 'number':
      case 'url': {
        const isEditing = inlineCustomField?.taskId === task.id && inlineCustomField.propId === prop.id
        if (isEditing) {
          return (
            <input
              autoFocus
              type={prop.type === 'number' ? 'number' : 'text'}
              defaultValue={v ?? ''}
              onClick={e => e.stopPropagation()}
              onBlur={e => {
                const val = prop.type === 'number'
                  ? (e.target.value === '' ? undefined : Number(e.target.value))
                  : (e.target.value || undefined)
                updateValue(val)
                setInlineCustomField(null)
              }}
              onKeyDown={e => {
                if (e.key === 'Enter') e.currentTarget.blur()
                if (e.key === 'Escape') setInlineCustomField(null)
              }}
              className="w-full bg-zinc-900 border border-[var(--accent,#c59b27)]/60 rounded px-1.5 py-0.5 text-xs text-zinc-100 outline-none"
            />
          )
        }
        return (
          <span
            onClick={e => {
              e.stopPropagation()
              setInlineCustomField({ taskId: task.id, propId: prop.id })
            }}
            className="text-[11px] text-zinc-300 hover:bg-zinc-800/40 px-1 py-0.5 rounded cursor-pointer truncate block max-w-[160px]"
            title="Clique para editar"
          >
            {v !== undefined && v !== '' ? String(v) : <span className="text-zinc-600">-</span>}
          </span>
        )
      }

      default:
        return <span className="text-[11px] text-zinc-300 truncate block max-w-[160px]">{String(v || '-')}</span>
    }
  }

  const boardTasks = useMemo(() => {
    return tasks.filter(t => (t.boardId || 'default') === currentBoardId)
  }, [tasks, currentBoardId])

  const defaultColName = currentBoard?.category === 'item' ? 'Nome' : 'Tarefa'
  const currentTitleColName = currentBoard?.titleColumnName || settings.titleColumnName || defaultColName

  const handleSaveTitleCol = () => {
    const nextName = titleColDraft.trim() || defaultColName
    setIsEditingTitleCol(false)
    if (currentBoard) {
      const allBoards = settings.boards && settings.boards.length > 0 ? settings.boards : taskBoards
      const updatedBoards = allBoards.map(b =>
        b.id === currentBoard.id ? { ...b, titleColumnName: nextName } : b
      )
      onUpdateSettings({ ...settings, boards: updatedBoards })
    } else {
      onUpdateSettings({ ...settings, titleColumnName: nextName })
    }
  }

  // Column visibility check (Olhinho feature & deletion check)
  const isColumnHidden = (propId: string) => {
    const prop = safeProperties.find(p => p.id === propId)
    if (!prop) return true // deleted from this board!
    return Boolean(prop.hidden)
  }

  const visibleColumnCount =
    4 +
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

  // User can switch between 'sidebar' (recuada, default) and 'full' (documento em tela cheia)
  const [taskDetailMode, setTaskDetailMode] = useState<'sidebar' | 'full'>('sidebar')

  const selectedTask = useMemo(() => {
    return selectedTaskId ? tasks.find(t => t.id === selectedTaskId) || null : null
  }, [tasks, selectedTaskId])

  if (selectedTask && taskDetailMode === 'full') {
    return (
      <TaskDocumentView
        task={selectedTask}
        settings={settings}
        allNotes={allNotes}
        boardName={currentBoard?.name || 'Tarefas'}
        onUpdateTask={onUpdateTask}
        onDeleteTask={onDeleteTask}
        onClose={() => onSelectTask(null)}
        onOpenNote={onOpenNote}
        onToggleSidebarView={() => setTaskDetailMode('sidebar')}
      />
    )
  }

  return (
    <div className="w-full h-full flex overflow-hidden">
      <div className="app-tasks-pane flex-1 min-w-0 h-full flex flex-col bg-[#121215] text-zinc-100 select-none overflow-hidden">
        {/* 1. Header Toolbar - Seamless with Notes and Agent */}
      <div className="app-tasks-header h-12 px-5 bg-[#0e0e11] border-b border-zinc-800/60 flex items-center justify-between gap-4 shrink-0">
        {/* Left: Title & Counters */}
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsBoardIconPickerOpen(o => !o)}
              className="p-1 rounded-lg hover:bg-zinc-800 text-[var(--accent,#c59b27)] transition-colors cursor-pointer flex items-center justify-center group/iconbtn"
              title="Trocar ícone do projeto"
            >
              {renderDynamicIcon(currentBoard?.icon || 'CheckCircle2', 'w-4 h-4 shrink-0', { color: 'var(--accent, #c59b27)' })}
            </button>

            {isBoardIconPickerOpen && (
              <IconPickerPopover
                selectedIcon={currentBoard?.icon}
                onSelectIcon={iconName => {
                  if (onChangeTaskBoardIcon && currentBoard) {
                    onChangeTaskBoardIcon(currentBoard.id, iconName)
                  }
                  setIsBoardIconPickerOpen(false)
                }}
                onClose={() => setIsBoardIconPickerOpen(false)}
                align="left"
              />
            )}
          </div>

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
          <div className="flex items-center gap-0.5 bg-[#161619] border border-zinc-800/60 p-0.5 rounded-lg">
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
                      backgroundColor: 'var(--accent-glow-subtle, rgba(197, 155, 39, 0.12))',
                      color: 'var(--accent, #c59b27)'
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
                      backgroundColor: 'var(--accent-glow-subtle, rgba(197, 155, 39, 0.12))',
                      color: 'var(--accent, #c59b27)'
                    }
                  : undefined
              }
              title="Visualização em Kanban"
            >
              <Kanban className="w-3.5 h-3.5" />
              <span>Kanban</span>
            </button>

            <button
              onClick={() => setViewMode('gantt')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-all cursor-pointer ${
                viewMode === 'gantt'
                  ? 'shadow-xs font-semibold'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
              style={
                viewMode === 'gantt'
                  ? {
                      backgroundColor: 'var(--accent-glow-subtle, rgba(197, 155, 39, 0.12))',
                      color: 'var(--accent, #c59b27)'
                    }
                  : undefined
              }
              title="Visualização em Gantt"
            >
              <GanttChart className="w-3.5 h-3.5" />
              <span>Gantt</span>
            </button>
          </div>

          {/* Kanban column grouping setting */}
          {viewMode === 'kanban' && (
            <div className="relative">
              <button
                onClick={() => setIsGroupingMenuOpen(!isGroupingMenuOpen)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-[#161619] border border-zinc-800/60 hover:bg-[#1a1a1e] text-zinc-300 transition-colors cursor-pointer"
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
                  className="absolute top-full mt-1.5 left-0 z-30 w-44 rounded-xl bg-[#18181b] shadow-lg p-1.5 space-y-0.5 animate-in fade-in-50 border border-zinc-800"
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
              className="w-36 md:w-44 pl-7 pr-2.5 py-1 bg-[#161619] border border-zinc-800/60 rounded-lg text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-700 transition-all"
            />
          </div>

          {/* Settings Gear Button */}
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-[#161619] light:hover:bg-zinc-200 light:hover:text-zinc-950 border border-transparent hover:border-zinc-800/60 light:hover:border-zinc-300 rounded-lg transition-colors cursor-pointer"
            title="Configurações das Tarefas (Propriedades e Status)"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>

          {/* New Task Button - ICON ONLY */}
          <button
            onClick={() => onCreateTask(undefined, { boardId: currentBoardId })}
            className="w-7 h-7 flex items-center justify-center font-semibold rounded-lg text-xs transition-all hover:bg-[var(--accent-glow)] shadow-xs cursor-pointer shrink-0 hover:scale-105 active:scale-95"
            style={{
              backgroundColor: 'var(--accent-glow-subtle, rgba(197, 155, 39, 0.12))',
              color: 'var(--accent, #d4af37)'
            }}
            title="Nova Tarefa"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
          </button>
        </div>
      </div>

      {/* 2. Main Content: Lista, Kanban ou Gantt */}
      {viewMode === 'list' && (
        /* LIST / TABLE VIEW - Refined, subtle selection & expandable subtasks */
        <div className="flex-1 overflow-x-auto overflow-y-auto custom-chat-scrollbar p-0 bg-[#121215] rounded-bl-2xl">
          <table className="w-full text-left text-xs border-separate border-spacing-0 table-fixed min-w-full">
            <thead className="sticky top-0 z-20 bg-[#18181b] shadow-[0_1px_0_rgba(255,255,255,0.04)]">
              <tr className="text-zinc-300 uppercase text-[10.5px] tracking-wider font-semibold border-b border-zinc-800/80">
                {/* Checkbox column */}
                <th
                  style={{ width: columnWidths.col_select || 44 }}
                  className="w-11 px-3 py-2.5 text-center border-r border-zinc-800/60 bg-[#18181b] select-none"
                >
                  <CheckSquare className="w-3.5 h-3.5 mx-auto text-zinc-500 opacity-70" />
                </th>

                {/* Task Title / Item Name */}
                <th
                  style={{ width: columnWidths.col_title || 320 }}
                  className="relative px-3 py-2.5 border-r border-zinc-800/60 bg-[#18181b] select-none text-zinc-300 group"
                >
                  <div className="flex items-center justify-between gap-1">
                    {isEditingTitleCol ? (
                      <input
                        type="text"
                        autoFocus
                        value={titleColDraft}
                        onChange={e => setTitleColDraft(e.target.value)}
                        onBlur={handleSaveTitleCol}
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleSaveTitleCol()
                          if (e.key === 'Escape') setIsEditingTitleCol(false)
                        }}
                        className="bg-[#121215] border border-zinc-700 rounded px-1.5 py-0.5 text-xs text-zinc-100 outline-none w-full"
                      />
                    ) : (
                      <div
                        onClick={() => {
                          setTitleColDraft(currentTitleColName)
                          setIsEditingTitleCol(true)
                        }}
                        className="flex items-center gap-1.5 cursor-pointer hover:text-white"
                        title="Clique para renomear esta coluna"
                      >
                        <span className="font-medium">{currentTitleColName}</span>
                        <Pencil className="w-2.5 h-2.5 opacity-0 group-hover:opacity-70 text-zinc-400 hover:text-zinc-200 transition-opacity" />
                      </div>
                    )}
                  </div>
                  {/* Resizer */}
                  <div
                    onMouseDown={e => handleResizeStart('col_title', e)}
                    onDoubleClick={() => handleResetColWidth('col_title')}
                    className="absolute top-0 right-0 bottom-0 w-2.5 translate-x-1/2 cursor-col-resize z-30 group/resizer flex items-center justify-center select-none"
                    title="Arraste para redimensionar (clique duplo para redefinir)"
                  >
                    <div className={`w-[2px] transition-all ${activeResizingCol === 'col_title' ? 'h-full bg-[var(--accent,#c59b27)] shadow-[0_0_6px_var(--accent,#c59b27)]' : 'h-3.5 bg-zinc-600/40 group-hover/resizer:h-full group-hover/resizer:bg-[var(--accent,#c59b27)]'}`} />
                  </div>
                </th>

                {/* Status */}
                {!isColumnHidden('prop_status') && (
                  <th
                    style={{ width: columnWidths.prop_status || 170 }}
                    className="relative px-3 py-2.5 border-r border-zinc-800/60 bg-[#18181b] select-none text-zinc-300"
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span>Status</span>
                      <button
                        type="button"
                        onClick={cycleStatusIndicatorStyle}
                        className="p-1 rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700/50 transition-colors cursor-pointer"
                        title={`Estilo do indicador: ${indicatorStyle === 'circle' ? 'Círculo de progresso' : indicatorStyle === 'bar' ? 'Barra de progresso (%)' : 'Ponto colorido'}. Clique para alternar.`}
                      >
                        {indicatorStyle === 'circle' && (
                          <StatusProgressCircle progress={65} color="var(--accent, #c59b27)" size={12} />
                        )}
                        {indicatorStyle === 'bar' && (
                          <StatusBarProgress progress={65} color="var(--accent, #c59b27)" showText={false} />
                        )}
                        {indicatorStyle === 'dot' && (
                          <span className="w-2 h-2 rounded-full bg-[var(--accent,#c59b27)] inline-block" />
                        )}
                      </button>
                    </div>
                    {/* Resizer */}
                    <div
                      onMouseDown={e => handleResizeStart('prop_status', e)}
                      onDoubleClick={() => handleResetColWidth('prop_status')}
                      className="absolute top-0 right-0 bottom-0 w-2.5 translate-x-1/2 cursor-col-resize z-30 group/resizer flex items-center justify-center select-none"
                      title="Arraste para redimensionar (clique duplo para redefinir)"
                    >
                      <div className={`w-[2px] transition-all ${activeResizingCol === 'prop_status' ? 'h-full bg-[var(--accent,#c59b27)] shadow-[0_0_6px_var(--accent,#c59b27)]' : 'h-3.5 bg-zinc-600/40 group-hover/resizer:h-full group-hover/resizer:bg-[var(--accent,#c59b27)]'}`} />
                    </div>
                  </th>
                )}

                {/* Priority */}
                {!isColumnHidden('prop_priority') && (
                  <th
                    style={{ width: columnWidths.prop_priority || 130 }}
                    className="relative px-3 py-2.5 border-r border-zinc-800/60 bg-[#18181b] select-none text-zinc-300"
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span>Prioridade</span>
                    </div>
                    {/* Resizer */}
                    <div
                      onMouseDown={e => handleResizeStart('prop_priority', e)}
                      onDoubleClick={() => handleResetColWidth('prop_priority')}
                      className="absolute top-0 right-0 bottom-0 w-2.5 translate-x-1/2 cursor-col-resize z-30 group/resizer flex items-center justify-center select-none"
                      title="Arraste para redimensionar (clique duplo para redefinir)"
                    >
                      <div className={`w-[2px] transition-all ${activeResizingCol === 'prop_priority' ? 'h-full bg-[var(--accent,#c59b27)] shadow-[0_0_6px_var(--accent,#c59b27)]' : 'h-3.5 bg-zinc-600/40 group-hover/resizer:h-full group-hover/resizer:bg-[var(--accent,#c59b27)]'}`} />
                    </div>
                  </th>
                )}

                {/* Deadline */}
                {!isColumnHidden('prop_deadline') && (
                  <th
                    style={{ width: columnWidths.prop_deadline || 160 }}
                    className="relative px-3 py-2.5 border-r border-zinc-800/60 bg-[#18181b] select-none text-zinc-300"
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span>Prazo</span>
                    </div>
                    {/* Resizer */}
                    <div
                      onMouseDown={e => handleResizeStart('prop_deadline', e)}
                      onDoubleClick={() => handleResetColWidth('prop_deadline')}
                      className="absolute top-0 right-0 bottom-0 w-2.5 translate-x-1/2 cursor-col-resize z-30 group/resizer flex items-center justify-center select-none"
                      title="Arraste para redimensionar (clique duplo para redefinir)"
                    >
                      <div className={`w-[2px] transition-all ${activeResizingCol === 'prop_deadline' ? 'h-full bg-[var(--accent,#c59b27)] shadow-[0_0_6px_var(--accent,#c59b27)]' : 'h-3.5 bg-zinc-600/40 group-hover/resizer:h-full group-hover/resizer:bg-[var(--accent,#c59b27)]'}`} />
                    </div>
                  </th>
                )}

                {/* Context / Nota */}
                {!isColumnHidden('prop_context') && (
                  <th
                    style={{ width: columnWidths.prop_context || 170 }}
                    className="relative px-3 py-2.5 border-r border-zinc-800/60 bg-[#18181b] select-none text-zinc-300"
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span>Nota</span>
                    </div>
                    {/* Resizer */}
                    <div
                      onMouseDown={e => handleResizeStart('prop_context', e)}
                      onDoubleClick={() => handleResetColWidth('prop_context')}
                      className="absolute top-0 right-0 bottom-0 w-2.5 translate-x-1/2 cursor-col-resize z-30 group/resizer flex items-center justify-center select-none"
                      title="Arraste para redimensionar (clique duplo para redefinir)"
                    >
                      <div className={`w-[2px] transition-all ${activeResizingCol === 'prop_context' ? 'h-full bg-[var(--accent,#c59b27)] shadow-[0_0_6px_var(--accent,#c59b27)]' : 'h-3.5 bg-zinc-600/40 group-hover/resizer:h-full group-hover/resizer:bg-[var(--accent,#c59b27)]'}`} />
                    </div>
                  </th>
                )}

                {/* Rótulos */}
                {!isColumnHidden('prop_tags') && (
                  <th
                    style={{ width: columnWidths.prop_tags || 150 }}
                    className="relative px-3 py-2.5 border-r border-zinc-800/60 bg-[#18181b] select-none text-zinc-300"
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span>Rótulos</span>
                    </div>
                    {/* Resizer */}
                    <div
                      onMouseDown={e => handleResizeStart('prop_tags', e)}
                      onDoubleClick={() => handleResetColWidth('prop_tags')}
                      className="absolute top-0 right-0 bottom-0 w-2.5 translate-x-1/2 cursor-col-resize z-30 group/resizer flex items-center justify-center select-none"
                      title="Arraste para redimensionar (clique duplo para redefinir)"
                    >
                      <div className={`w-[2px] transition-all ${activeResizingCol === 'prop_tags' ? 'h-full bg-[var(--accent,#c59b27)] shadow-[0_0_6px_var(--accent,#c59b27)]' : 'h-3.5 bg-zinc-600/40 group-hover/resizer:h-full group-hover/resizer:bg-[var(--accent,#c59b27)]'}`} />
                    </div>
                  </th>
                )}

                {/* Custom properties */}
                {customListProps.map(cp => (
                  <th
                    key={cp.id}
                    style={{ width: columnWidths[cp.id] || 150 }}
                    className="relative px-3 py-2.5 border-r border-zinc-800/60 bg-[#18181b] select-none text-zinc-300"
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span>{cp.name}</span>
                    </div>
                    {/* Resizer */}
                    <div
                      onMouseDown={e => handleResizeStart(cp.id, e)}
                      onDoubleClick={() => handleResetColWidth(cp.id)}
                      className="absolute top-0 right-0 bottom-0 w-2.5 translate-x-1/2 cursor-col-resize z-30 group/resizer flex items-center justify-center select-none"
                      title="Arraste para redimensionar (clique duplo para redefinir)"
                    >
                      <div className={`w-[2px] transition-all ${activeResizingCol === cp.id ? 'h-full bg-[var(--accent,#c59b27)] shadow-[0_0_6px_var(--accent,#c59b27)]' : 'h-3.5 bg-zinc-600/40 group-hover/resizer:h-full group-hover/resizer:bg-[var(--accent,#c59b27)]'}`} />
                    </div>
                  </th>
                ))}

                {/* Add Property Column */}
                <th
                  style={{ width: 36 }}
                  className="w-9 px-1 py-2.5 text-center bg-[#18181b] select-none border-r border-zinc-800/60"
                >
                  <button
                    type="button"
                    onClick={() => setIsSettingsOpen(true)}
                    className="p-1 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/70 transition-colors cursor-pointer mx-auto flex items-center justify-center"
                    title="Adicionar ou gerenciar propriedades deste projeto"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </th>

                {/* Actions column */}
                <th
                  style={{ width: columnWidths.col_actions || 44 }}
                  className="w-11 px-3 py-2.5 text-right bg-[#18181b] select-none"
                ></th>
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
                  const rowBg = isSelected ? 'bg-[#222226]' : 'bg-[#141416] group-hover:bg-[#1a1a1e]'

                  return (
                    <React.Fragment key={task.id}>
                      <tr
                        data-task-item="true"
                        onClick={() => onSelectTask(task)}
                        className="group transition-all cursor-pointer"
                      >
                        {/* Checkbox */}
                        <td
                          style={{ width: columnWidths.col_select || 44 }}
                          className={`px-3 py-2 text-center border-r border-zinc-800/40 border-b border-zinc-800/60 rounded-none transition-all ${
                            isSelected
                              ? 'bg-[#222226] border-l-[3px] border-l-[var(--accent,#c59b27)]'
                              : 'bg-[#141416] group-hover:bg-[#1a1a1e] border-l-[3px] border-l-transparent'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={e => handleToggleComplete(task, e)}
                            className="relative cursor-pointer flex items-center justify-center p-0.5 mx-auto"
                            title={task.completed ? 'Marcar como pendente' : 'Marcar como concluída'}
                          >
                            <div
                              className={`w-4 h-4 rounded-[4px] flex items-center justify-center transition-all ${
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

                        {/* Task Title + Subtasks expander + quick action + hover open button */}
                        <td
                          style={{ width: columnWidths.col_title || 320 }}
                          className={`px-3 py-1.5 font-medium text-zinc-100 text-[12.5px] border-r border-zinc-800/40 border-b border-zinc-800/60 rounded-none transition-all ${rowBg}`}
                        >
                          <div className="flex items-center gap-1.5 w-full">
                            {/* Task Icon */}
                            <span className="shrink-0" title="Ícone da tarefa">
                              {renderDynamicIcon(task.icon || 'CheckCircle2', 'w-3.5 h-3.5 shrink-0 text-zinc-500')}
                            </span>

                            {/* Inline editable title input */}
                            <input
                              type="text"
                              value={editingTitleId === task.id ? titleDraft : task.title}
                              onFocus={() => {
                                setEditingTitleId(task.id)
                                setTitleDraft(task.title)
                              }}
                              onClick={e => e.stopPropagation()}
                              onChange={e => setTitleDraft(e.target.value)}
                              onBlur={() => {
                                if (editingTitleId === task.id) {
                                  if (titleDraft.trim() && titleDraft !== task.title) {
                                    onUpdateTask({ ...task, title: titleDraft.trim(), updatedAt: Date.now() })
                                  }
                                  setEditingTitleId(null)
                                }
                              }}
                              onKeyDown={e => {
                                if (e.key === 'Enter') {
                                  e.preventDefault()
                                  e.currentTarget.blur()
                                } else if (e.key === 'Escape') {
                                  setEditingTitleId(null)
                                }
                              }}
                              className={`flex-1 min-w-0 bg-transparent py-0.5 px-1 rounded hover:bg-zinc-800/40 focus:bg-zinc-900 focus:ring-1 focus:ring-[var(--accent,#c59b27)]/50 outline-none text-[12.5px] transition-colors ${
                                task.completed ? 'line-through text-zinc-500' : 'text-zinc-100'
                              }`}
                            />

                            {/* Subtasks expand toggle badge if task has subtasks */}
                            {subtasksCount > 0 && (
                              <button
                                type="button"
                                onClick={e => {
                                  e.stopPropagation()
                                  toggleTaskExpand(task.id)
                                }}
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-[#18181b] hover:bg-zinc-800 text-[10px] text-zinc-400 font-mono transition-colors shrink-0 cursor-pointer border-0"
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

                            {/* Subtle hover icon button with box & arrow to explicitly open task drawer */}
                            <button
                              type="button"
                              onClick={e => {
                                e.stopPropagation()
                                onSelectTask(task)
                              }}
                              className="opacity-0 group-hover:opacity-100 p-1 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/80 rounded transition-all shrink-0 cursor-pointer"
                              title="Abrir detalhes da tarefa"
                            >
                              <PanelRightOpen className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>

                        {/* Status Pill */}
                        {!isColumnHidden('prop_status') && (
                          <td
                            style={{ width: columnWidths.prop_status || 170 }}
                            className={`px-3 py-2 overflow-hidden max-w-0 border-r border-zinc-800/40 border-b border-zinc-800/60 rounded-none transition-all ${rowBg}`}
                          >
                            <div className="relative inline-block max-w-full truncate" data-inline-popover="true">
                              <button
                                type="button"
                                onClick={e => {
                                  e.stopPropagation()
                                  setInlineStatusTaskId(inlineStatusTaskId === task.id ? null : task.id)
                                }}
                                className="cursor-pointer text-left max-w-full truncate block"
                                title="Clique para alterar status"
                              >
                                <StatusBadge
                                  name={statusObj.name}
                                  color={statusObj.color}
                                  progress={computeStatusProgress(task.statusId, safeStatuses)}
                                  indicatorStyle={indicatorStyle}
                                />
                              </button>

                              {inlineStatusTaskId === task.id && (
                                <div
                                  onClick={e => e.stopPropagation()}
                                  className="absolute top-full left-0 mt-1 z-40 w-48 rounded-xl bg-[#18181b] shadow-2xl p-1.5 space-y-0.5 border border-zinc-700/80 animate-in fade-in-50"
                                >
                                  <div className="text-[10px] font-semibold text-zinc-400 px-2 py-0.5 uppercase tracking-wider">
                                    Status da Tarefa
                                  </div>
                                  {safeStatuses.map(st => {
                                    const isCur = st.id === task.statusId
                                    const prog = computeStatusProgress(st.id, safeStatuses)
                                    return (
                                      <button
                                        key={st.id}
                                        type="button"
                                        onClick={e => {
                                          e.stopPropagation()
                                          onUpdateTask({
                                            ...task,
                                            statusId: st.id,
                                            completed: Boolean(st.isCompleted),
                                            updatedAt: Date.now()
                                          })
                                          setInlineStatusTaskId(null)
                                        }}
                                        className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                                          isCur ? 'bg-zinc-800 text-white font-medium' : 'hover:bg-zinc-800/50 text-zinc-300'
                                        }`}
                                      >
                                        <StatusBadge
                                          name={st.name}
                                          color={st.color}
                                          progress={prog}
                                          indicatorStyle={indicatorStyle}
                                        />
                                        {isCur && <Check className="w-3.5 h-3.5 text-zinc-400 shrink-0" />}
                                      </button>
                                    )
                                  })}
                                </div>
                              )}
                            </div>
                          </td>
                        )}

                        {/* Priority Pill or Stars */}
                        {!isColumnHidden('prop_priority') && (
                          <td
                            style={{ width: columnWidths.prop_priority || 130 }}
                            className={`px-3 py-2 overflow-hidden max-w-0 border-r border-zinc-800/40 border-b border-zinc-800/60 rounded-none transition-all ${rowBg}`}
                          >
                            {priorityStyle === 'stars' ? (
                              <div className="flex items-center gap-0.5 max-w-full overflow-hidden" onClick={e => e.stopPropagation()}>
                                {[1, 2, 3, 4, 5].map(starNum => {
                                  const starCount = PRIORITY_STAR_MAP[task.priority] ?? 0
                                  const isActive = starNum <= (starCount === 4 && starNum === 5 ? 4 : starCount)
                                  return (
                                    <button
                                      key={starNum}
                                      type="button"
                                      onClick={e => {
                                        e.stopPropagation()
                                        const nextPri = starCount === starNum ? 'none' : (STAR_TO_PRIORITY[Math.min(4, starNum)] || 'none')
                                        onUpdateTask({ ...task, priority: nextPri as TaskPriority, updatedAt: Date.now() })
                                      }}
                                      className={`p-0.5 text-xs transition-transform hover:scale-125 cursor-pointer ${
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
                              <div className="relative inline-block max-w-full truncate" data-inline-popover="true">
                                <button
                                  type="button"
                                  onClick={e => {
                                    e.stopPropagation()
                                    setInlinePriorityTaskId(inlinePriorityTaskId === task.id ? null : task.id)
                                  }}
                                  className="cursor-pointer text-left max-w-full truncate block"
                                  title="Clique para alterar prioridade"
                                >
                                  {task.priority !== 'none' ? (
                                    <span
                                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10.5px] font-medium max-w-full truncate"
                                      style={{
                                        backgroundColor: priorityInfo.bg,
                                        color: priorityInfo.color
                                      }}
                                    >
                                      <Flag className="w-2.5 h-2.5 shrink-0" />
                                      <span className="truncate">{priorityInfo.label}</span>
                                    </span>
                                  ) : (
                                    <span className="text-zinc-600 hover:text-zinc-400 text-[11px]">-</span>
                                  )}
                                </button>

                                {inlinePriorityTaskId === task.id && (
                                  <div
                                    onClick={e => e.stopPropagation()}
                                    className="absolute top-full left-0 mt-1 z-40 w-40 rounded-xl bg-[#18181b] shadow-2xl p-1.5 space-y-0.5 border border-zinc-700/80 animate-in fade-in-50"
                                  >
                                    {safePriorities.map(p => {
                                      const isCur = p.id === task.priority
                                      return (
                                        <button
                                          key={p.id}
                                          type="button"
                                          onClick={e => {
                                            e.stopPropagation()
                                            onUpdateTask({ ...task, priority: p.id as TaskPriority, updatedAt: Date.now() })
                                            setInlinePriorityTaskId(null)
                                          }}
                                          className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                                            isCur ? 'bg-zinc-800 text-white font-medium' : 'hover:bg-zinc-800/50 text-zinc-300'
                                          }`}
                                        >
                                          <span className="flex items-center gap-1.5">
                                            <Flag className="w-3 h-3" style={{ color: p.color }} />
                                            <span>{p.label}</span>
                                          </span>
                                          {isCur && <Check className="w-3 h-3 text-zinc-400 shrink-0" />}
                                        </button>
                                      )
                                    })}
                                  </div>
                                )}
                              </div>
                            )}
                          </td>
                        )}

                        {/* Deadline Pill - Brazilian Date Format */}
                        {!isColumnHidden('prop_deadline') && (
                          <td
                            style={{ width: columnWidths.prop_deadline || 160 }}
                            className={`px-3 py-2 text-zinc-300 relative overflow-hidden max-w-0 whitespace-nowrap border-r border-zinc-800/40 border-b border-zinc-800/60 rounded-none transition-all ${rowBg}`}
                          >
                            <div className="inline-block max-w-full overflow-hidden">
                              {task.deadline || task.startDate || task.date ? (
                                <div
                                  className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded hover:bg-zinc-800/40 transition-colors cursor-pointer whitespace-nowrap max-w-full overflow-hidden"
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
                                  <Calendar className="w-3 h-3 text-zinc-500 shrink-0" />
                                  <span className="text-[11px] font-mono shrink-0 whitespace-nowrap">
                                    {formatDateRangeBR(task.startDate || task.date, task.endDate || task.deadline)}
                                  </span>
                                  {(task.deadline?.slice(0, 10) === todayStr || task.endDate?.slice(0, 10) === todayStr) && (
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
                                value={task.startDate || task.date}
                                endDate={task.endDate || task.deadline}
                                anchorEl={deadlineAnchorEl}
                                onRangeChange={(start, end) => {
                                  onUpdateTask({
                                    ...task,
                                    startDate: start,
                                    date: start,
                                    endDate: end,
                                    deadline: end || start,
                                    updatedAt: Date.now()
                                  })
                                  setEditingDeadlineTaskId(null)
                                  setDeadlineAnchorEl(null)
                                }}
                                onChange={newDeadline => {
                                  onUpdateTask({
                                    ...task,
                                    deadline: newDeadline,
                                    endDate: newDeadline,
                                    updatedAt: Date.now()
                                  })
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

                        {/* Nota vinculada */}
                        {!isColumnHidden('prop_context') && (
                          <td
                            style={{ width: columnWidths.prop_context || 170 }}
                            className={`px-3 py-2 overflow-hidden max-w-0 border-r border-zinc-800/40 border-b border-zinc-800/60 rounded-none transition-all ${rowBg}`}
                          >
                            <div className="flex items-center gap-1.5 max-w-full overflow-hidden">
                              {task.contextNoteId ? (
                                <span
                                  onClick={e => {
                                    e.stopPropagation()
                                    setInlineContextTaskId(task.id)
                                  }}
                                  className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[#18181b] hover:bg-zinc-800 transition-colors text-[11px] font-medium max-w-full truncate cursor-pointer"
                                  style={{ color: 'var(--accent, #c59b27)' }}
                                  title="Clique para alterar nota vinculada"
                                >
                                  <Compass className="w-3 h-3 shrink-0" style={{ color: 'var(--accent, #c59b27)' }} />
                                  <span className="truncate">{task.contextNoteTitle || 'Nota'}</span>
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={e => {
                                    e.stopPropagation()
                                    setInlineContextTaskId(task.id)
                                  }}
                                  className="opacity-0 group-hover:opacity-100 text-[10.5px] text-zinc-500 hover:text-zinc-300 transition-opacity cursor-pointer whitespace-nowrap"
                                  title="Vincular nota"
                                >
                                  + nota
                                </button>
                              )}

                              {task.contextNoteId && (
                                <button
                                  type="button"
                                  onClick={e => {
                                    e.stopPropagation()
                                    onOpenNote(task.contextNoteId!)
                                  }}
                                  className="opacity-0 group-hover:opacity-100 p-0.5 text-zinc-500 hover:text-zinc-200 transition-opacity cursor-pointer shrink-0"
                                  title="Abrir nota no editor"
                                >
                                  <ExternalLink className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          </td>
                        )}

                        {/* Rótulos */}
                        {!isColumnHidden('prop_tags') && (
                          <td
                            style={{ width: columnWidths.prop_tags || 150 }}
                            className={`px-3 py-2 overflow-hidden max-w-0 border-r border-zinc-800/40 border-b border-zinc-800/60 rounded-none transition-all relative ${rowBg}`}
                            data-inline-popover="true"
                          >
                            <div className="flex items-center gap-1.5 flex-nowrap overflow-hidden max-w-full">
                              {task.tags.map(tag => (
                                <TaskLabelBadge
                                  key={tag}
                                  label={tag}
                                  size="xs"
                                  onRemove={() => {
                                    onUpdateTask({
                                      ...task,
                                      tags: task.tags.filter(t => t !== tag),
                                      updatedAt: Date.now()
                                    })
                                  }}
                                />
                              ))}
                              <button
                                type="button"
                                onClick={e => {
                                  e.stopPropagation()
                                  setInlineTagsTaskId(inlineTagsTaskId === task.id ? null : task.id)
                                }}
                                className="opacity-0 group-hover:opacity-100 text-[10.5px] text-zinc-500 hover:text-zinc-300 transition-opacity cursor-pointer whitespace-nowrap shrink-0"
                                title="Adicionar ou selecionar rótulo"
                              >
                                + rótulo
                              </button>
                            </div>

                            {inlineTagsTaskId === task.id && (
                              <TaskLabelPicker
                                selectedLabels={task.tags}
                                allSavedLabels={allSavedLabels}
                                onToggleLabel={lbl => handleToggleLabelForTask(lbl, task)}
                                onCreateLabel={lbl => handleCreateLabelForTask(lbl, task)}
                                onRenameSavedLabel={handleRenameSavedLabel}
                                onDeleteSavedLabel={handleDeleteSavedLabel}
                                onClose={() => setInlineTagsTaskId(null)}
                                align="left"
                              />
                            )}
                          </td>
                        )}

                        {/* Custom property cells */}
                        {customListProps.map(cp => (
                          <td
                            key={cp.id}
                            style={{ width: columnWidths[cp.id] || 150 }}
                            className={`px-3 py-2 overflow-hidden max-w-0 border-r border-zinc-800/40 border-b border-zinc-800/60 rounded-none transition-all ${rowBg}`}
                          >
                            <div className="max-w-full overflow-hidden truncate">
                              {renderCustomCell(task, cp)}
                            </div>
                          </td>
                        ))}

                        {/* Add Property Column Empty Cell */}
                        <td
                          style={{ width: 36 }}
                          className={`w-9 px-1 py-2 text-center border-r border-zinc-800/40 border-b border-zinc-800/60 rounded-none transition-all ${rowBg}`}
                        />

                        {/* Row Action */}
                        <td
                          style={{ width: columnWidths.col_actions || 44 }}
                          className={`px-3 py-2 text-right border-b border-zinc-800/60 rounded-none transition-all ${rowBg}`}
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

                      {/* Expandable Subtasks Row in List View */}
                      {isExpanded && (
                        <tr key={`${task.id}_subtasks_row`} className="bg-[#111113] border-b border-zinc-800/60 transition-all animate-in fade-in duration-150">
                          <td
                            colSpan={visibleColumnCount}
                            className="px-3 py-1.5 bg-[#111113] border-b border-zinc-800/60 rounded-none"
                          >
                            <div className="ml-7 pl-3 border-l border-zinc-800/70 space-y-0.5 my-1">
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

                              {/* Inline quick add for subtask */}
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
              <tr className="bg-[#141416] hover:bg-[#1a1a1e] transition-colors rounded-none border-b border-zinc-800/60 task-quick-add-row">
                <td
                  style={{ width: columnWidths.col_select || 44 }}
                  className="px-3 py-2.5 text-center border-r border-zinc-800/40 border-b border-zinc-800/60 rounded-none"
                >
                  <Plus className="w-3.5 h-3.5 text-zinc-500 mx-auto" />
                </td>
                <td colSpan={visibleColumnCount - 1} className="px-3 py-2.5 border-b border-zinc-800/60 rounded-none">
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
      )}

      {/* GANTT TIMELINE VIEW - Compact, high-density candles with full platform identity */}
      {viewMode === 'gantt' && (
        <TaskGanttView
          tasks={filteredTasks}
          settings={settings}
          allNotes={allNotes}
          selectedTaskId={selectedTaskId || null}
          onSelectTask={onSelectTask}
          onUpdateTask={onUpdateTask}
          onCreateTask={onCreateTask}
        />
      )}

      {/* KANBAN BOARD VIEW - Distinct Contrast, Refined Header & Cards */}
      {viewMode === 'kanban' && (
        <div className="flex-1 overflow-x-auto overflow-y-hidden custom-chat-scrollbar p-5 flex gap-4 items-start bg-[#121215] rounded-bl-2xl">
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
                    className={`kanban-column-card w-76 shrink-0 flex flex-col max-h-full rounded-2xl bg-[#0f0f12] border-0 overflow-hidden transition-all ${
                      isDragTarget ? 'ring-1 ring-[var(--accent)]/50 bg-[#141416]' : ''
                    }`}
                  >
                    {/* Differentiated Column Header */}
                    <div className="kanban-column-header flex items-center justify-between mx-1.5 mt-1.5 px-3 py-2 rounded-xl bg-[#18181b] shadow-[0_2px_6px_rgba(0,0,0,0.45)] shrink-0">
                      <div className="flex items-center gap-2 min-w-0">
                        {groupProp.id === 'prop_status' && indicatorStyle === 'circle' ? (
                          <StatusProgressCircle
                            progress={computeStatusProgress(statusCol.id, safeStatuses)}
                            color={statusCol.color}
                            size={14}
                          />
                        ) : groupProp.id === 'prop_status' && indicatorStyle === 'bar' ? (
                          <StatusBarProgress
                            progress={computeStatusProgress(statusCol.id, safeStatuses)}
                            color={statusCol.color}
                            showText={false}
                          />
                        ) : (
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0 shadow-xs"
                            style={{ backgroundColor: statusCol.color }}
                          />
                        )}
                        <span className="text-xs font-semibold text-zinc-100 truncate tracking-wide">
                          {statusCol.name}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-mono font-medium bg-[#121215] text-zinc-400 shrink-0">
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
                            className={`kanban-task-card group relative rounded-xl p-3 transition-all cursor-grab active:cursor-grabbing select-none ${
                              isDragging ? 'opacity-40 scale-95' : 'opacity-100'
                            } ${
                              isSelected
                                ? 'is-selected bg-[#1a1a1e] ring-1 ring-[var(--accent)]/70 border-0'
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
                              {task.icon && (
                                <span className="shrink-0 mt-0.5" title={`Ícone: ${task.icon}`}>
                                  {renderDynamicIcon(task.icon, 'w-3.5 h-3.5 shrink-0 text-zinc-400')}
                                </span>
                              )}
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

                              {/* Deadline - Brazilian Date Format */}
                              {task.deadline && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-zinc-800/80 text-zinc-300 whitespace-nowrap">
                                  <Calendar className="w-2.5 h-2.5 text-zinc-500 shrink-0" />
                                  <span className="font-mono shrink-0 whitespace-nowrap">{formatDateBR(task.deadline)}</span>
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

                              {/* Rótulos */}
                              {task.tags.map(t => (
                                <TaskLabelBadge
                                  key={t}
                                  label={t}
                                  size="xs"
                                />
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
        activeBoardId={activeBoardId}
        activeBoard={currentBoard}
      />
      </div>

      {/* 4. Task Detail Drawer when in 'sidebar' (recuada) mode */}
      {selectedTask && taskDetailMode === 'sidebar' && (
        <TaskDetailSidebar
          task={selectedTask}
          settings={settings}
          allNotes={allNotes}
          taskBoards={taskBoards}
          activeBoard={currentBoard}
          onSelectTaskBoard={onSelectTaskBoard}
          onUpdateTask={onUpdateTask}
          onDeleteTask={onDeleteTask}
          onOpenNote={onOpenNote}
          onClose={() => onSelectTask(null)}
          onToggleFullView={() => setTaskDetailMode('full')}
        />
      )}

      {/* 5. Inline Context (Nota) Picker */}
      {inlineContextTaskId && (
        <TaskContextPicker
          allNotes={allNotes}
          selectedNoteId={tasks.find(t => t.id === inlineContextTaskId)?.contextNoteId}
          onSelectNote={note => {
            const task = tasks.find(t => t.id === inlineContextTaskId)
            if (task) {
              onUpdateTask({
                ...task,
                contextNoteId: note ? note.id : undefined,
                contextNoteTitle: note ? note.title : undefined,
                updatedAt: Date.now()
              })
            }
            setInlineContextTaskId(null)
          }}
          onClose={() => setInlineContextTaskId(null)}
        />
      )}
    </div>
  )
}

export default TasksView
