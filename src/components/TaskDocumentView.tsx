import React, { useState, useRef, useMemo } from 'react'
import type { TaskItem, TaskSettings, TaskPriority, SubTask } from '../types/tasks'
import type { Note } from '../types'
import { LivePreviewEditor } from './LivePreviewEditor'
import { TaskContextPicker } from './TaskContextPicker'
import { CustomDatePickerPopover } from './CustomDatePickerPopover'
import { TaskCustomPropertyField } from './TaskCustomPropertyField'
import { StatusBadge, computeStatusProgress } from './StatusIndicator'
import {
  ArrowLeft,
  CheckCircle2,
  Trash2,
  X,
  Calendar,
  Flag,
  Compass,
  Check,
  Plus,
  PanelLeftClose,
  ChevronDown,
  Minimize2
} from 'lucide-react'

interface TaskDocumentViewProps {
  task: TaskItem
  settings: TaskSettings
  allNotes: Note[]
  boardName?: string
  onUpdateTask: (task: TaskItem) => void
  onDeleteTask: (taskId: string) => void
  onClose: () => void
  onOpenNote: (noteId: string) => void
  onToggleSidebarView?: () => void
}

export const TaskDocumentView: React.FC<TaskDocumentViewProps> = ({
  task,
  settings,
  allNotes,
  boardName = 'Tarefas',
  onUpdateTask,
  onDeleteTask,
  onClose,
  onOpenNote,
  onToggleSidebarView
}) => {
  const [isDeletingTask, setIsDeletingTask] = useState(false)
  const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false)
  const [isPriorityDropdownOpen, setIsPriorityDropdownOpen] = useState(false)
  const [isContextPickerOpen, setIsContextPickerOpen] = useState(false)
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false)
  const [isAddingTag, setIsAddingTag] = useState(false)
  const [newTagInput, setNewTagInput] = useState('')

  // Subtask local states
  const [isAddingSubtask, setIsAddingSubtask] = useState(false)
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('')
  const [editingSubtaskId, setEditingSubtaskId] = useState<string | null>(null)
  const [editingSubtaskTitle, setEditingSubtaskTitle] = useState('')

  // Completion burst animation
  const [isBursting, setIsBursting] = useState(false)
  const [burstingSubtaskId, setBurstingSubtaskId] = useState<string | null>(null)

  const dateBtnRef = useRef<HTMLButtonElement>(null)
  const statusBtnRef = useRef<HTMLButtonElement>(null)
  const priorityBtnRef = useRef<HTMLButtonElement>(null)

  const activeStatus = useMemo(() => {
    return settings.statuses.find(s => s.id === task.statusId) || settings.statuses[0] || {
      id: 'default',
      name: 'Status',
      color: '#71717a'
    }
  }, [settings.statuses, task.statusId])

  const safePriorities = useMemo(() => {
    return (
      settings.priorities || [
        { id: 'urgent', label: 'Urgente', color: '#ef4444' },
        { id: 'high', label: 'Alta', color: '#f97316' },
        { id: 'medium', label: 'Média', color: '#eab308' },
        { id: 'low', label: 'Baixa', color: '#3b82f6' },
        { id: 'none', label: 'Nenhuma', color: '#71717a' }
      ]
    )
  }, [settings.priorities])

  const activePriority = useMemo(() => {
    return safePriorities.find(p => p.id === task.priority) || safePriorities.find(p => p.id === 'none') || safePriorities[0]
  }, [safePriorities, task.priority])

  const customProps = useMemo(() => {
    return (settings.properties || []).filter(
      p => !['prop_status', 'prop_priority', 'prop_deadline', 'prop_context', 'prop_tags'].includes(p.id) && !p.hidden
    )
  }, [settings.properties])

  const handleToggleComplete = () => {
    const nextCompleted = !task.completed
    if (nextCompleted) {
      setIsBursting(true)
      setTimeout(() => setIsBursting(false), 500)
    }

    let nextStatusId = task.statusId
    if (nextCompleted) {
      const completedStatus = settings.statuses.find(s => s.isCompleted)
      if (completedStatus) nextStatusId = completedStatus.id
    } else {
      const activeStatusObj = settings.statuses.find(s => !s.isCompleted)
      if (activeStatusObj) nextStatusId = activeStatusObj.id
    }

    onUpdateTask({
      ...task,
      completed: nextCompleted,
      statusId: nextStatusId,
      updatedAt: Date.now()
    })
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

  const handleDeadlineChange = (deadline: string | undefined) => {
    onUpdateTask({ ...task, deadline, updatedAt: Date.now() })
  }

  const handleContextSelect = (note: Note | null) => {
    onUpdateTask({
      ...task,
      contextNoteId: note ? note.id : undefined,
      contextNoteTitle: note ? note.title : undefined,
      updatedAt: Date.now()
    })
  }

  const handleAddTag = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTagInput.trim()) return
    const tag = newTagInput.trim().toLowerCase().replace(/^#/, '')
    if (!task.tags.includes(tag)) {
      onUpdateTask({
        ...task,
        tags: [...task.tags, tag],
        updatedAt: Date.now()
      })
    }
    setNewTagInput('')
    setIsAddingTag(false)
  }

  const handleRemoveTag = (tagToRemove: string) => {
    onUpdateTask({
      ...task,
      tags: task.tags.filter(t => t !== tagToRemove),
      updatedAt: Date.now()
    })
  }

  const handleCustomValueChange = (propId: string, value: any) => {
    const next = { ...(task.customValues || {}) }
    if (value === undefined || value === '') delete next[propId]
    else next[propId] = value
    onUpdateTask({ ...task, customValues: next, updatedAt: Date.now() })
  }

  // Subtasks logic
  const subtasks = task.subtasks || []
  const completedSubtasksCount = subtasks.filter(s => s.completed).length

  const handleToggleSubtask = (subId: string) => {
    const target = subtasks.find(s => s.id === subId)
    if (target && !target.completed) {
      setBurstingSubtaskId(subId)
      setTimeout(() => setBurstingSubtaskId(null), 500)
    }
    const updated = subtasks.map(s => (s.id === subId ? { ...s, completed: !s.completed } : s))
    onUpdateTask({ ...task, subtasks: updated, updatedAt: Date.now() })
  }

  const handleAddSubtask = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newSubtaskTitle.trim()) return
    const newSub: SubTask = {
      id: `sub_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      title: newSubtaskTitle.trim(),
      completed: false,
      createdAt: Date.now()
    }
    onUpdateTask({ ...task, subtasks: [...subtasks, newSub], updatedAt: Date.now() })
    setNewSubtaskTitle('')
    setIsAddingSubtask(false)
  }

  const handleSaveSubtaskTitle = (subId: string) => {
    if (!editingSubtaskTitle.trim()) {
      setEditingSubtaskId(null)
      return
    }
    const updated = subtasks.map(s => (s.id === subId ? { ...s, title: editingSubtaskTitle.trim() } : s))
    onUpdateTask({ ...task, subtasks: updated, updatedAt: Date.now() })
    setEditingSubtaskId(null)
  }

  const handleDeleteSubtask = (subId: string) => {
    const updated = subtasks.filter(s => s.id !== subId)
    onUpdateTask({ ...task, subtasks: updated, updatedAt: Date.now() })
  }

  const handleDescriptionChange = (description: string) => {
    onUpdateTask({ ...task, description, updatedAt: Date.now() })
  }

  const virtualNote: Note = useMemo(
    () => ({
      id: task.id,
      title: task.title,
      content: task.description || '',
      folder: 'Tarefas',
      tags: task.tags,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt
    }),
    [task.id, task.title, task.description, task.tags, task.createdAt, task.updatedAt]
  )

  const indicatorStyle = settings.statusIndicatorStyle || 'circle'
  const todayStr = new Date().toISOString().slice(0, 10)

  return (
    <div className="w-full h-full flex bg-[#121214] text-zinc-100 select-none overflow-hidden relative">
      {/* 1. Left Vertical Rail (Coluna em pé com nome da tarefa deitado e botão voltar) */}
      <aside
        onClick={onClose}
        className="w-11 shrink-0 h-full bg-[#0f0f12] border-r border-zinc-800/80 hover:bg-[#141418] transition-colors flex flex-col items-center justify-between py-2 cursor-pointer select-none group/rail z-20 task-document-rail"
        title="Clique na coluna para fechar a tarefa e voltar à lista"
      >
        {/* Top of Rail: Back Arrow + Icon */}
        <div className="flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={e => {
              e.stopPropagation()
              onClose()
            }}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-zinc-400 hover:text-zinc-100 hover:bg-[#1f1f24] transition-colors cursor-pointer"
            title="Voltar para a lista"
          >
            <ArrowLeft className="w-4 h-4 stroke-[2]" />
          </button>
          <div className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--accent,#c59b27)]">
            <CheckCircle2 className="w-4 h-4" />
          </div>
        </div>

        {/* Center of Rail: Rotated Task Title ("escrito e deitado") */}
        <div
          className="flex-1 flex items-center justify-center overflow-hidden my-4"
          style={{
            writingMode: 'vertical-rl',
            textOrientation: 'mixed'
          }}
        >
          <span className="text-[11px] font-semibold tracking-wider text-zinc-400 group-hover/rail:text-zinc-200 uppercase truncate max-h-[360px] transition-colors">
            {task.title || 'Tarefa'}
          </span>
        </div>

        {/* Bottom of Rail: Collapse icon */}
        <div className="w-7 h-7 flex items-center justify-center text-zinc-600 group-hover/rail:text-zinc-300 transition-colors">
          <PanelLeftClose className="w-3.5 h-3.5" />
        </div>
      </aside>

      {/* 2. Main Document Page Area */}
      <div className="flex-1 h-full flex flex-col overflow-hidden bg-[#121214] task-document-body">
        {/* Top Header / Breadcrumb toolbar */}
        <div className="h-11 px-6 bg-[#0e0e11] border-b border-zinc-800/70 flex items-center justify-between shrink-0 task-document-header">
          <div className="flex items-center gap-2 text-xs text-zinc-400 min-w-0">
            <button
              type="button"
              onClick={onClose}
              className="flex items-center gap-1.5 hover:text-zinc-200 transition-colors cursor-pointer font-medium"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span className="truncate">{boardName}</span>
            </button>
            <span className="text-zinc-600">/</span>
            <span className="font-mono text-[11px] text-zinc-500">#{task.id.slice(-4)}</span>
            <span className="text-zinc-600">/</span>
            <StatusBadge
              name={activeStatus.name}
              color={activeStatus.color}
              progress={computeStatusProgress(activeStatus.id, settings.statuses)}
              indicatorStyle={indicatorStyle}
            />
          </div>

          <div className="flex items-center gap-1.5">
            {onToggleSidebarView && (
              <button
                type="button"
                onClick={onToggleSidebarView}
                className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-[#18181c] rounded-md transition-colors cursor-pointer flex items-center gap-1.5 text-xs"
                title="Recuar para painel lateral"
              >
                <Minimize2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline text-[11px] font-medium">Recuar</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsDeletingTask(true)}
              className="p-1.5 text-zinc-500 hover:text-rose-400 hover:bg-[#18181c] rounded-md transition-colors cursor-pointer"
              title="Excluir tarefa"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-[#18181c] rounded-md transition-colors cursor-pointer"
              title="Fechar (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Document Content */}
        <div className="flex-1 overflow-y-auto custom-chat-scrollbar px-6 md:px-14 py-8 task-document-page">
          <div className="max-w-3xl mx-auto space-y-6">
            {/* Title with Checkbox & Recuar toggle */}
            <div className="flex items-start gap-3">
              <button
                type="button"
                onClick={handleToggleComplete}
                className="mt-1.5 shrink-0 cursor-pointer relative flex items-center justify-center p-0.5"
                title={task.completed ? 'Marcar como pendente' : 'Marcar como concluída'}
              >
                <div
                  className={`w-5 h-5 rounded-[5px] flex items-center justify-center transition-all ${
                    task.completed
                      ? 'bg-emerald-500 text-zinc-950 shadow-xs'
                      : 'border border-zinc-700 hover:border-zinc-500 bg-transparent'
                  }`}
                >
                  {task.completed && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                </div>

                {isBursting && (
                  <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                    <span className="absolute w-1.5 h-1.5 rounded-full bg-emerald-400 affine-dot-top" />
                    <span className="absolute w-1.5 h-1.5 rounded-full bg-emerald-400 affine-dot-bottom" />
                    <span className="absolute w-1.5 h-1.5 rounded-full bg-emerald-400 affine-dot-left" />
                    <span className="absolute w-1.5 h-1.5 rounded-full bg-emerald-400 affine-dot-right" />
                  </div>
                )}
              </button>

              <div className="flex-1 min-w-0 flex items-center gap-2">
                <input
                  type="text"
                  value={task.title}
                  onChange={e => handleTitleChange(e.target.value)}
                  placeholder="Título da tarefa..."
                  className={`w-full bg-transparent font-bold text-2xl md:text-3xl text-zinc-100 placeholder-zinc-600 focus:outline-none transition-colors tracking-tight ${
                    task.completed ? 'line-through text-zinc-500' : ''
                  }`}
                />
                {onToggleSidebarView && (
                  <button
                    type="button"
                    onClick={onToggleSidebarView}
                    className="p-1.5 text-zinc-500 hover:text-zinc-200 hover:bg-[#18181c] rounded-lg transition-colors cursor-pointer shrink-0"
                    title="Alternar para tela recuada (painel lateral)"
                  >
                    <Minimize2 className="w-5 h-5" />
                  </button>
                )}
              </div>
            </div>

            {/* Properties Grid (Notion / ClickUp style table) */}
            <div className="bg-[#141416] border border-zinc-800/80 rounded-xl p-3.5 space-y-2.5 text-xs task-properties-card">
              {/* Status Row */}
              <div className="grid grid-cols-[120px_1fr] items-center gap-2">
                <span className="text-zinc-500 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-zinc-500" />
                  <span>Status</span>
                </span>
                <div className="relative inline-block">
                  <button
                    ref={statusBtnRef}
                    type="button"
                    onClick={() => {
                      setIsStatusDropdownOpen(o => !o)
                      setIsPriorityDropdownOpen(false)
                    }}
                    className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-[#1c1c20] transition-colors cursor-pointer"
                  >
                    <StatusBadge
                      name={activeStatus.name}
                      color={activeStatus.color}
                      progress={computeStatusProgress(activeStatus.id, settings.statuses)}
                      indicatorStyle={indicatorStyle}
                    />
                    <ChevronDown className="w-3 h-3 text-zinc-500" />
                  </button>

                  {isStatusDropdownOpen && (
                    <div className="absolute z-40 top-full left-0 mt-1 w-48 rounded-xl bg-[#18181b] border border-zinc-700/80 shadow-2xl p-1 space-y-0.5 animate-in fade-in-50">
                      {settings.statuses.map(st => {
                        const isCur = st.id === activeStatus.id
                        const prog = computeStatusProgress(st.id, settings.statuses)
                        return (
                          <button
                            key={st.id}
                            type="button"
                            onClick={() => handleStatusChange(st.id)}
                            className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                              isCur ? 'bg-[#222226] text-white font-medium' : 'hover:bg-[#1f1f23] text-zinc-300'
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
              </div>

              {/* Priority Row */}
              <div className="grid grid-cols-[120px_1fr] items-center gap-2">
                <span className="text-zinc-500 flex items-center gap-1.5">
                  <Flag className="w-3.5 h-3.5 text-zinc-500" />
                  <span>Prioridade</span>
                </span>
                <div className="relative inline-block">
                  <button
                    ref={priorityBtnRef}
                    type="button"
                    onClick={() => {
                      setIsPriorityDropdownOpen(o => !o)
                      setIsStatusDropdownOpen(false)
                    }}
                    className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-[#1c1c20] transition-colors cursor-pointer"
                  >
                    <span
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium"
                      style={{
                        backgroundColor: `${activePriority.color}20`,
                        color: activePriority.color
                      }}
                    >
                      <Flag className="w-3 h-3" />
                      <span>{activePriority.label}</span>
                    </span>
                    <ChevronDown className="w-3 h-3 text-zinc-500" />
                  </button>

                  {isPriorityDropdownOpen && (
                    <div className="absolute z-40 top-full left-0 mt-1 w-44 rounded-xl bg-[#18181b] border border-zinc-700/80 shadow-2xl p-1 space-y-0.5 animate-in fade-in-50">
                      {safePriorities.map(p => {
                        const isCur = p.id === activePriority.id
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => handlePriorityChange(p.id)}
                            className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                              isCur ? 'bg-[#222226] text-white font-medium' : 'hover:bg-[#1f1f23] text-zinc-300'
                            }`}
                          >
                            <span className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
                              <span>{p.label}</span>
                            </span>
                            {isCur && <Check className="w-3.5 h-3.5 text-zinc-400" />}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Deadline / Prazo Row */}
              <div className="grid grid-cols-[120px_1fr] items-center gap-2">
                <span className="text-zinc-500 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-zinc-500" />
                  <span>Prazo</span>
                </span>
                <div className="relative inline-block">
                  <button
                    ref={dateBtnRef}
                    type="button"
                    onClick={() => setIsDatePickerOpen(o => !o)}
                    className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-[#1c1c20] transition-colors cursor-pointer font-mono text-zinc-300"
                  >
                    <span>{task.deadline || 'Definir prazo...'}</span>
                    {task.deadline && task.deadline.slice(0, 10) === todayStr && (
                      <span
                        className="text-[9.5px] px-1.5 py-0.2 rounded font-medium font-sans"
                        style={{
                          backgroundColor: 'var(--accent-glow-subtle, rgba(197, 155, 39, 0.15))',
                          color: 'var(--accent, #c59b27)'
                        }}
                      >
                        Hoje
                      </span>
                    )}
                  </button>

                  {isDatePickerOpen && (
                    <CustomDatePickerPopover
                      value={task.deadline}
                      anchorEl={dateBtnRef.current}
                      onChange={handleDeadlineChange}
                      onClose={() => setIsDatePickerOpen(false)}
                      align="left"
                    />
                  )}
                </div>
              </div>

              {/* Context Note Row */}
              <div className="grid grid-cols-[120px_1fr] items-center gap-2">
                <span className="text-zinc-500 flex items-center gap-1.5">
                  <Compass className="w-3.5 h-3.5 text-zinc-500" />
                  <span>Contexto</span>
                </span>
                <div className="relative inline-block">
                  <button
                    type="button"
                    onClick={() => setIsContextPickerOpen(true)}
                    className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-[#1c1c20] transition-colors cursor-pointer text-zinc-300"
                  >
                    {task.contextNoteTitle ? (
                      <span className="flex items-center gap-1.5 text-[var(--accent,#c59b27)] font-medium">
                        <Compass className="w-3.5 h-3.5" />
                        <span>{task.contextNoteTitle}</span>
                      </span>
                    ) : (
                      <span className="text-zinc-500">Vincular nota...</span>
                    )}
                  </button>

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

              {/* Tags Row */}
              <div className="grid grid-cols-[120px_1fr] items-center gap-2">
                <span className="text-zinc-500 flex items-center gap-1.5">
                  <span>#</span>
                  <span>Tags</span>
                </span>
                <div className="flex items-center flex-wrap gap-1.5">
                  {task.tags.map(t => (
                    <span
                      key={t}
                      className="group flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#18181b] border border-zinc-800 text-[11px] text-zinc-300 font-mono"
                    >
                      #{t}
                      <button
                        type="button"
                        onClick={() => handleRemoveTag(t)}
                        className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-rose-400 cursor-pointer"
                      >
                        ×
                      </button>
                    </span>
                  ))}

                  {isAddingTag ? (
                    <form onSubmit={handleAddTag} className="inline-flex">
                      <input
                        type="text"
                        autoFocus
                        value={newTagInput}
                        onChange={e => setNewTagInput(e.target.value)}
                        onBlur={() => setIsAddingTag(false)}
                        placeholder="tag..."
                        className="w-20 px-1.5 py-0.5 bg-[#18181b] border rounded text-[11px] text-zinc-200 outline-none"
                        style={{ borderColor: 'var(--accent, #c59b27)' }}
                      />
                    </form>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setIsAddingTag(true)}
                      className="text-[11px] text-zinc-500 hover:text-zinc-300 px-1.5 py-0.5 rounded hover:bg-[#1c1c20] transition-colors cursor-pointer"
                    >
                      + Tag
                    </button>
                  )}
                </div>
              </div>

              {/* Custom Properties */}
              {customProps.map(cp => (
                <div key={cp.id} className="grid grid-cols-[120px_1fr] items-center gap-2">
                  <span className="text-zinc-500 truncate">{cp.name}</span>
                  <div>
                    <TaskCustomPropertyField
                      prop={cp}
                      task={task}
                      items={cp.options || []}
                      indicatorStyle={indicatorStyle}
                      onChange={val => handleCustomValueChange(cp.id, val)}
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Subtasks Section */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">Subtarefas</span>
                  {subtasks.length > 0 && (
                    <span className="text-[11px] px-1.5 py-0.2 rounded-full font-mono bg-[#18181b] text-zinc-400">
                      {completedSubtasksCount}/{subtasks.length}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setIsAddingSubtask(true)}
                  className="text-xs text-[var(--accent,#c59b27)] hover:underline cursor-pointer flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Adicionar subtarefa</span>
                </button>
              </div>

              {subtasks.length > 0 && (
                <div className="w-full h-1 bg-[#18181b] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 transition-all duration-300"
                    style={{ width: `${(completedSubtasksCount / subtasks.length) * 100}%` }}
                  />
                </div>
              )}

              <div className="space-y-1">
                {subtasks.map(st => (
                  <div
                    key={st.id}
                    className="group/sub flex items-center justify-between py-1 px-2.5 rounded-lg hover:bg-[#161619] transition-colors"
                  >
                    <div className="flex items-center gap-2.5 flex-1 min-w-0">
                      <button
                        type="button"
                        onClick={() => handleToggleSubtask(st.id)}
                        className="cursor-pointer relative flex items-center justify-center p-0.5 shrink-0"
                      >
                        <div
                          className={`w-3.5 h-3.5 rounded-[4px] flex items-center justify-center transition-all ${
                            st.completed ? 'bg-emerald-500 text-zinc-950' : 'border border-zinc-700 hover:border-zinc-500'
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
                          className="text-xs bg-[#18181b] text-zinc-100 border border-zinc-700 rounded px-1.5 py-0.5 outline-none flex-1 min-w-0"
                        />
                      ) : (
                        <span
                          onClick={() => {
                            setEditingSubtaskId(st.id)
                            setEditingSubtaskTitle(st.title)
                          }}
                          className={`text-xs truncate cursor-text hover:text-zinc-100 transition-colors ${
                            st.completed ? 'line-through text-zinc-500' : 'text-zinc-200'
                          }`}
                        >
                          {st.title}
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => handleDeleteSubtask(st.id)}
                      className="opacity-0 group-hover/sub:opacity-100 p-1 text-zinc-500 hover:text-rose-400 rounded transition-opacity cursor-pointer shrink-0"
                      title="Excluir"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}

                {isAddingSubtask && (
                  <form onSubmit={handleAddSubtask} className="flex items-center gap-2 pt-1 px-2.5">
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
                      placeholder="Nova subtarefa... (Pressione Enter)"
                      className="flex-1 px-2 py-1 bg-[#18181b] border border-zinc-750 rounded-lg text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none"
                    />
                  </form>
                )}
              </div>
            </div>

            {/* Subtle Divider */}
            <div className="h-px bg-zinc-800/40 my-6" />

            {/* Document Body / Description (LivePreviewEditor) - Free unconstrained note surface */}
            <div className="flex-1 min-h-[420px] pb-16">
              <LivePreviewEditor
                key={task.id}
                note={virtualNote}
                allNotes={allNotes}
                displayMode="live"
                onUpdateContent={handleDescriptionChange}
                onNavigate={onOpenNote}
                fontSizeClass="text-base leading-relaxed"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {isDeletingTask && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in-50"
          onClick={() => setIsDeletingTask(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-[#161619] border border-zinc-800/80 p-5 shadow-2xl space-y-4 animate-in zoom-in-95"
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
            <p className="text-xs text-zinc-300 bg-[#101013] px-3 py-2 rounded-xl border border-zinc-800 truncate">
              &ldquo;{task.title}&rdquo;
            </p>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setIsDeletingTask(false)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-300 hover:bg-zinc-800 transition-colors cursor-pointer"
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
                className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-rose-500 hover:bg-rose-600 text-white transition-colors cursor-pointer"
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
