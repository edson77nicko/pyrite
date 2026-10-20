import React, { useState, useMemo, useRef } from 'react'
import type { TaskItem, TaskSettings, TaskPriority } from '../types/tasks'
import type { Note } from '../types'
import { TaskContextPicker } from './TaskContextPicker'
import { CustomDatePickerPopover } from './CustomDatePickerPopover'
import { LivePreviewEditor } from './LivePreviewEditor'
import {
  CheckCircle2,
  Circle,
  X,
  Calendar,
  Hourglass,
  Flag,
  Compass,
  ExternalLink,
  Plus,
  Trash2,
  ChevronDown,
  Check
} from 'lucide-react'

interface TaskDetailSidebarProps {
  task: TaskItem
  allNotes: Note[]
  settings: TaskSettings
  onUpdateTask: (updatedTask: TaskItem) => void
  onDeleteTask: (taskId: string) => void
  onOpenNote: (noteId: string) => void
  onClose: () => void
}

const PRIORITY_OPTIONS: { id: TaskPriority; label: string; color: string }[] = [
  { id: 'none', label: 'Nenhuma', color: '#71717a' },
  { id: 'low', label: 'Baixa', color: '#3b82f6' },
  { id: 'medium', label: 'Média', color: '#f59e0b' },
  { id: 'high', label: 'Alta', color: '#f97316' },
  { id: 'urgent', label: 'Urgente', color: '#ef4444' }
]

export const TaskDetailSidebar: React.FC<TaskDetailSidebarProps> = ({
  task,
  allNotes,
  settings,
  onUpdateTask,
  onDeleteTask,
  onOpenNote,
  onClose
}) => {
  const [isContextPickerOpen, setIsContextPickerOpen] = useState(false)
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false)
  const [isDeadlinePickerOpen, setIsDeadlinePickerOpen] = useState(false)
  const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false)
  const [isPriorityDropdownOpen, setIsPriorityDropdownOpen] = useState(false)

  const dateBtnRef = useRef<HTMLButtonElement>(null)
  const deadlineBtnRef = useRef<HTMLButtonElement>(null)

  const [newTagInput, setNewTagInput] = useState('')
  const [isAddingTag, setIsAddingTag] = useState(false)

  const activeStatus = settings.statuses.find(s => s.id === task.statusId) || settings.statuses[0]
  const activePriority = PRIORITY_OPTIONS.find(p => p.id === task.priority) || PRIORITY_OPTIONS[0]

  const handleToggleComplete = () => {
    const nextCompleted = !task.completed
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

  const handleDateChange = (date: string | undefined) => {
    onUpdateTask({ ...task, date, updatedAt: Date.now() })
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
    <aside className="w-[420px] max-w-[460px] h-full bg-[#111114] flex flex-col select-none shrink-0 text-xs text-zinc-200 z-20 shadow-2xl animate-in slide-in-from-right-4 duration-150">
      {/* 1. Header Toolbar - Sober without harsh white divider */}
      <div className="h-10 px-4 bg-[#0e0e11] flex items-center justify-between shrink-0">
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
            onClick={() => {
              if (confirm(`Excluir tarefa "${task.title}"?`)) {
                onDeleteTask(task.id)
                onClose()
              }
            }}
            className="p-1 text-zinc-500 hover:text-rose-400 hover:bg-zinc-850/60 rounded-md transition-colors cursor-pointer"
            title="Excluir tarefa"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onClose}
            className="p-1 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-850/60 rounded-md transition-colors cursor-pointer"
            title="Fechar detalhes"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 2. Scrollable Task Details Body */}
      <div className="flex-1 overflow-y-auto p-5 custom-chat-scrollbar space-y-4 flex flex-col">
        {/* Title & Completion checkbox */}
        <div className="flex items-start gap-3">
          <button
            onClick={handleToggleComplete}
            className="mt-1 transition-transform hover:scale-110 cursor-pointer shrink-0"
            title={task.completed ? "Marcar como pendente" : "Marcar como concluída"}
          >
            {task.completed ? (
              <CheckCircle2 className="w-6 h-6 text-emerald-400 fill-emerald-500/20" />
            ) : (
              <Circle
                className="w-6 h-6 text-zinc-500 hover:opacity-100 transition-colors"
                style={{ color: 'var(--accent, #71717a)' }}
              />
            )}
          </button>

          <input
            type="text"
            value={task.title}
            onChange={e => handleTitleChange(e.target.value)}
            placeholder="Nome da tarefa..."
            className={`w-full bg-transparent font-bold text-lg text-zinc-100 placeholder-zinc-600 focus:outline-none transition-colors ${
              task.completed ? 'line-through text-zinc-500' : ''
            }`}
          />
        </div>

        {/* Tags */}
        <div className="flex items-center flex-wrap gap-1.5 pl-9">
          {task.tags.map(t => (
            <span
              key={t}
              className="group flex items-center gap-1 px-2 py-0.5 rounded-md bg-zinc-850/60 text-[11px] text-zinc-300 font-mono"
            >
              #{t}
              <button
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
                className="w-20 px-1.5 py-0.5 bg-zinc-900 border rounded text-[11px] text-zinc-200 outline-none"
                style={{ borderColor: 'var(--accent, #c59b27)' }}
              />
            </form>
          ) : (
            <button
              onClick={() => setIsAddingTag(true)}
              className="text-[11px] text-zinc-500 hover:text-zinc-300 px-1.5 py-0.5 rounded hover:bg-zinc-850/40 transition-colors cursor-pointer"
            >
              + Tag
            </button>
          )}
        </div>

        {/* Properties Grid - Subtle tone separation, no white divider lines */}
        <div className="space-y-2 pt-2 bg-zinc-950/25 p-3 rounded-xl">
          {/* Status Custom Dropdown */}
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
                className="w-full flex items-center justify-between bg-zinc-900/80 hover:bg-zinc-850/90 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: activeStatus.color }} />
                  <span className="truncate">{activeStatus.name}</span>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
              </button>

              {isStatusDropdownOpen && (
                <div className="absolute z-50 top-full left-0 mt-1 w-full bg-[#16161b] border border-zinc-800 rounded-xl shadow-2xl p-1 space-y-0.5 animate-in fade-in duration-100">
                  {settings.statuses.map(st => {
                    const isSelected = st.id === activeStatus.id
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
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: st.color }} />
                          <span>{st.name}</span>
                        </div>
                        {isSelected && <Check className="w-3.5 h-3.5 text-zinc-400" />}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Date with Custom Date Picker floating via Portal */}
          <div className="grid grid-cols-[80px_1fr] items-center gap-2 text-xs relative">
            <div className="flex items-center gap-1.5 text-zinc-400">
              <Calendar className="w-3.5 h-3.5 text-zinc-500" />
              <span>Data</span>
            </div>
            <div className="relative">
              <button
                ref={dateBtnRef}
                type="button"
                onClick={() => {
                  setIsDatePickerOpen(o => !o)
                  setIsDeadlinePickerOpen(false)
                }}
                className="w-full flex items-center justify-between bg-zinc-900/80 hover:bg-zinc-850/90 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 transition-colors text-left cursor-pointer"
              >
                <span>{task.date || 'Definir data...'}</span>
                <Calendar className="w-3.5 h-3.5 text-zinc-500" />
              </button>
              {isDatePickerOpen && (
                <CustomDatePickerPopover
                  value={task.date}
                  onChange={handleDateChange}
                  onClose={() => setIsDatePickerOpen(false)}
                  anchorEl={dateBtnRef.current}
                  align="right"
                />
              )}
            </div>
          </div>

          {/* Deadline with Custom Date Picker floating via Portal */}
          <div className="grid grid-cols-[80px_1fr] items-center gap-2 text-xs relative">
            <div className="flex items-center gap-1.5 text-zinc-400">
              <Hourglass className="w-3.5 h-3.5 text-zinc-500" />
              <span>Prazo</span>
            </div>
            <div className="relative flex items-center gap-1.5">
              <button
                ref={deadlineBtnRef}
                type="button"
                onClick={() => {
                  setIsDeadlinePickerOpen(o => !o)
                  setIsDatePickerOpen(false)
                }}
                className="flex-1 flex items-center justify-between bg-zinc-900/80 hover:bg-zinc-850/90 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 transition-colors text-left cursor-pointer"
              >
                <span>{task.deadline || 'Definir prazo...'}</span>
                <Hourglass className="w-3.5 h-3.5 text-zinc-500" />
              </button>
              {task.deadline && task.deadline.slice(0, 10) === new Date().toISOString().slice(0, 10) && (
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
                  value={task.deadline}
                  onChange={handleDeadlineChange}
                  onClose={() => setIsDeadlinePickerOpen(false)}
                  anchorEl={deadlineBtnRef.current}
                  align="right"
                />
              )}
            </div>
          </div>

          {/* Priority Custom Dropdown */}
          <div className="grid grid-cols-[80px_1fr] items-center gap-2 text-xs relative">
            <div className="flex items-center gap-1.5 text-zinc-400">
              <Flag className="w-3.5 h-3.5 text-zinc-500" />
              <span>Prioridade</span>
            </div>
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setIsPriorityDropdownOpen(o => !o)
                  setIsStatusDropdownOpen(false)
                }}
                className="w-full flex items-center justify-between bg-zinc-900/80 hover:bg-zinc-850/90 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <Flag className="w-3 h-3" style={{ color: activePriority.color }} />
                  <span>{activePriority.label}</span>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
              </button>

              {isPriorityDropdownOpen && (
                <div className="absolute z-50 top-full left-0 mt-1 w-full bg-[#16161b] border border-zinc-800 rounded-xl shadow-2xl p-1 space-y-0.5 animate-in fade-in duration-100">
                  {PRIORITY_OPTIONS.map(opt => {
                    const isSelected = opt.id === activePriority.id
                    return (
                      <button
                        type="button"
                        key={opt.id}
                        onClick={() => handlePriorityChange(opt.id)}
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
            </div>
          </div>

          {/* Context Note Picker */}
          <div className="grid grid-cols-[80px_1fr] items-start gap-2 text-xs relative">
            <div className="flex items-center gap-1.5 text-zinc-400 pt-1.5">
              <Compass className="w-3.5 h-3.5 text-zinc-500" />
              <span>Contexto</span>
            </div>

            <div className="relative">
              {task.contextNoteId ? (
                <div className="flex items-center justify-between p-1.5 bg-zinc-900/80 rounded-lg">
                  <button
                    onClick={() => setIsContextPickerOpen(true)}
                    className="flex items-center gap-1.5 truncate text-left font-medium hover:underline max-w-[190px] cursor-pointer"
                    style={{ color: 'var(--accent, #c59b27)' }}
                    title="Alterar nota vinculada"
                  >
                    <Compass className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--accent, #c59b27)' }} />
                    <span className="truncate">{task.contextNoteTitle || 'Nota vinculada'}</span>
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
                  className="w-full flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-dashed border-zinc-750 hover:border-zinc-500 text-zinc-400 hover:text-zinc-200 transition-colors text-left cursor-pointer"
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
        </div>

        {/* Divisor bem apagado entre as propriedades e o conteúdo */}
        <div className="h-px bg-zinc-800/25 my-3.5 mx-1" />

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
    </aside>
  )
}
export default TaskDetailSidebar
