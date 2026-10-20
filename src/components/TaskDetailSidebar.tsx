import React, { useState, useMemo } from 'react'
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
  Trash2
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

const PRIORITY_LABELS: Record<TaskPriority, { label: string; color: string }> = {
  none: { label: 'Nenhuma', color: '#71717a' },
  low: { label: 'Baixa', color: '#3b82f6' },
  medium: { label: 'Média', color: '#f59e0b' },
  high: { label: 'Alta', color: '#f97316' },
  urgent: { label: 'Urgente', color: '#ef4444' }
}

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

  const [newTagInput, setNewTagInput] = useState('')
  const [isAddingTag, setIsAddingTag] = useState(false)

  const activeStatus = settings.statuses.find(s => s.id === task.statusId) || settings.statuses[0]

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
      completed: !!chosenStatus?.isCompleted,
      updatedAt: Date.now()
    })
  }

  const handlePriorityChange = (priority: TaskPriority) => {
    onUpdateTask({ ...task, priority, updatedAt: Date.now() })
  }

  const handleDateChange = (date: string) => {
    onUpdateTask({ ...task, date, updatedAt: Date.now() })
  }

  const handleDeadlineChange = (deadline: string) => {
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

  // Virtual Note wrapper for LivePreviewEditor so the task content behaves 100% like a note document
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
    <aside className="w-[420px] max-w-[460px] h-full bg-[#121215] border-l border-zinc-800/80 flex flex-col select-none shrink-0 text-xs text-zinc-200 z-20 shadow-2xl animate-in slide-in-from-right-4 duration-200">
      {/* 1. Header Toolbar */}
      <div className="h-10 px-4 border-b border-zinc-800/60 bg-[#0f0f12] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <div
            className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-medium text-[11px] border shadow-xs"
            style={{
              backgroundColor: 'var(--accent-glow-subtle, rgba(197, 155, 39, 0.12))',
              borderColor: 'var(--accent, #c59b27)',
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
            className="p-1 text-zinc-500 hover:text-rose-400 hover:bg-zinc-800/60 rounded-md transition-colors cursor-pointer"
            title="Excluir tarefa"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onClose}
            className="p-1 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60 rounded-md transition-colors cursor-pointer"
            title="Fechar detalhes"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 2. Scrollable Task Details Body */}
      <div className="flex-1 overflow-y-auto p-5 custom-chat-scrollbar space-y-5 flex flex-col">
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
            className={`w-full bg-transparent font-bold text-lg text-zinc-100 placeholder-zinc-600 focus:outline-none border-b border-transparent focus:border-zinc-700/80 transition-colors ${
              task.completed ? 'line-through text-zinc-500' : ''
            }`}
          />
        </div>

        {/* Tags */}
        <div className="flex items-center flex-wrap gap-1.5 pl-9">
          {task.tags.map(t => (
            <span
              key={t}
              className="group flex items-center gap-1 px-2 py-0.5 rounded-md bg-zinc-850/70 border border-zinc-750/50 text-[11px] text-zinc-300 font-mono"
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
              className="text-[11px] text-zinc-500 hover:text-zinc-300 px-1.5 py-0.5 rounded hover:bg-zinc-800/50 transition-colors cursor-pointer"
            >
              + Tag
            </button>
          )}
        </div>

        {/* Properties Grid - Sleek & fine rows */}
        <div className="space-y-2.5 pt-2 border-t border-zinc-850/80">
          {/* Status */}
          <div className="grid grid-cols-[90px_1fr] items-center gap-2 text-xs">
            <div className="flex items-center gap-1.5 text-zinc-400">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: activeStatus.color }} />
              <span>Status</span>
            </div>
            <div>
              <select
                value={task.statusId}
                onChange={e => handleStatusChange(e.target.value)}
                className="w-full bg-zinc-900/90 border border-zinc-800 rounded-lg px-2.5 py-1 text-xs text-zinc-200 focus:outline-none focus:border-zinc-700 cursor-pointer"
                style={{ borderLeftColor: activeStatus.color, borderLeftWidth: 3 }}
              >
                {settings.statuses.map(st => (
                  <option key={st.id} value={st.id}>
                    {st.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Date with Custom Date Picker */}
          <div className="grid grid-cols-[90px_1fr] items-center gap-2 text-xs relative">
            <div className="flex items-center gap-1.5 text-zinc-400">
              <Calendar className="w-3.5 h-3.5 text-zinc-500" />
              <span>Data</span>
            </div>
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setIsDatePickerOpen(o => !o)
                  setIsDeadlinePickerOpen(false)
                }}
                className="w-full flex items-center justify-between bg-zinc-900/90 hover:bg-zinc-850 border border-zinc-800 rounded-lg px-2.5 py-1 text-xs text-zinc-200 transition-colors text-left cursor-pointer"
              >
                <span>{task.date || 'Definir data...'}</span>
                <Calendar className="w-3.5 h-3.5 text-zinc-500" />
              </button>
              {isDatePickerOpen && (
                <CustomDatePickerPopover
                  value={task.date}
                  onChange={(newDate) => handleDateChange(newDate || '')}
                  onClose={() => setIsDatePickerOpen(false)}
                  align="right"
                />
              )}
            </div>
          </div>

          {/* Deadline with Custom Date Picker */}
          <div className="grid grid-cols-[90px_1fr] items-center gap-2 text-xs relative">
            <div className="flex items-center gap-1.5 text-zinc-400">
              <Hourglass className="w-3.5 h-3.5 text-zinc-500" />
              <span>Prazo</span>
            </div>
            <div className="relative flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setIsDeadlinePickerOpen(o => !o)
                  setIsDatePickerOpen(false)
                }}
                className="flex-1 flex items-center justify-between bg-zinc-900/90 hover:bg-zinc-850 border border-zinc-800 rounded-lg px-2.5 py-1 text-xs text-zinc-200 transition-colors text-left cursor-pointer"
              >
                <span>{task.deadline || 'Definir prazo...'}</span>
                <Hourglass className="w-3.5 h-3.5 text-zinc-500" />
              </button>
              {task.deadline && task.deadline.slice(0, 10) === new Date().toISOString().slice(0, 10) && (
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded font-medium"
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
                  onChange={(newDeadline) => handleDeadlineChange(newDeadline || '')}
                  onClose={() => setIsDeadlinePickerOpen(false)}
                  align="right"
                />
              )}
            </div>
          </div>

          {/* Priority */}
          <div className="grid grid-cols-[90px_1fr] items-center gap-2 text-xs">
            <div className="flex items-center gap-1.5 text-zinc-400">
              <Flag className="w-3.5 h-3.5 text-zinc-500" />
              <span>Prioridade</span>
            </div>
            <div>
              <select
                value={task.priority}
                onChange={e => handlePriorityChange(e.target.value as TaskPriority)}
                className="w-full bg-zinc-900/90 border border-zinc-800 rounded-lg px-2.5 py-1 text-xs text-zinc-200 focus:outline-none focus:border-zinc-700 cursor-pointer"
                style={{ borderLeftColor: PRIORITY_LABELS[task.priority].color, borderLeftWidth: 3 }}
              >
                <option value="none">Nenhuma</option>
                <option value="low">Baixa</option>
                <option value="medium">Média</option>
                <option value="high">Alta</option>
                <option value="urgent">Urgente</option>
              </select>
            </div>
          </div>

          {/* Context Note Picker */}
          <div className="grid grid-cols-[90px_1fr] items-start gap-2 text-xs relative">
            <div className="flex items-center gap-1.5 text-zinc-400 pt-1.5">
              <Compass className="w-3.5 h-3.5 text-zinc-500" />
              <span>Contexto</span>
            </div>

            <div className="relative">
              {task.contextNoteId ? (
                <div className="flex items-center justify-between p-1.5 bg-zinc-900/90 border border-zinc-800 rounded-lg">
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

        {/* 3. Internal Content / Notes of the Task (Free-form area like a real note, with full note capabilities!) */}
        <div className="pt-4 border-t border-zinc-850/80 flex-1 flex flex-col min-h-[350px]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10.5px] font-medium text-zinc-400 uppercase tracking-wider block">
              Anotações & Detalhes da Tarefa
            </span>
            <span className="text-[10px] text-zinc-600 font-mono">
              (Use / para blocos, listas e tabelas)
            </span>
          </div>

          {/* Open live note editor area - No black box container, totally free-form */}
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
