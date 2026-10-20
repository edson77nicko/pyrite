import React, { useState } from 'react'
import type { TaskItem, TaskSettings, TaskPriority } from '../types/tasks'
import type { Note } from '../types'
import { TaskContextPicker } from './TaskContextPicker'
import {
  CheckCircle2,
  Circle,
  X,
  Calendar,
  Hourglass,
  Flag,
  Compass,
  TrendingUp,
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

  return (
    <aside className="w-96 max-w-[420px] h-full bg-[#141418] border-l border-zinc-800 flex flex-col select-none shrink-0 text-xs text-zinc-200 z-20 shadow-2xl animate-in slide-in-from-right-4 duration-200">
      {/* 1. Header Toolbar */}
      <div className="h-10 px-4 border-b border-zinc-800/80 bg-[#121215] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400 font-medium text-[11px]">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Task</span>
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
            className="p-1 text-zinc-500 hover:text-rose-400 hover:bg-zinc-800 rounded-md transition-colors"
            title="Excluir tarefa"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onClose}
            className="p-1 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-md transition-colors"
            title="Fechar detalhes"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 2. Scrollable Task Details Body */}
      <div className="flex-1 overflow-y-auto p-5 custom-chat-scrollbar space-y-5">
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
              <Circle className="w-6 h-6 text-zinc-500 hover:text-amber-400" />
            )}
          </button>

          <input
            type="text"
            value={task.title}
            onChange={e => handleTitleChange(e.target.value)}
            placeholder="Nome da tarefa..."
            className={`w-full bg-transparent font-bold text-lg text-zinc-100 placeholder-zinc-600 focus:outline-none border-b border-transparent focus:border-zinc-700 transition-colors ${
              task.completed ? 'line-through text-zinc-500' : ''
            }`}
          />
        </div>

        {/* Tags */}
        <div className="flex items-center flex-wrap gap-1.5 pl-9">
          {task.tags.map(t => (
            <span
              key={t}
              className="group flex items-center gap-1 px-2 py-0.5 rounded-md bg-zinc-800/80 border border-zinc-700/60 text-[11px] text-zinc-300 font-mono"
            >
              #{t}
              <button
                onClick={() => handleRemoveTag(t)}
                className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-rose-400"
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
                className="w-20 px-1.5 py-0.5 bg-zinc-950 border border-amber-500/80 rounded text-[11px] text-zinc-200 outline-none"
              />
            </form>
          ) : (
            <button
              onClick={() => setIsAddingTag(true)}
              className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/60 transition-colors"
            >
              <Plus className="w-3 h-3" />
              <span>Tag</span>
            </button>
          )}
        </div>

        {/* Properties Section (List style like Capacities) */}
        <div className="space-y-3 pt-2 border-t border-zinc-800/80">
          {/* Status */}
          <div className="grid grid-cols-[100px_1fr] items-center gap-2 text-xs">
            <div className="flex items-center gap-1.5 text-zinc-400">
              <TrendingUp className="w-3.5 h-3.5 text-zinc-500" />
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

          {/* Date */}
          <div className="grid grid-cols-[100px_1fr] items-center gap-2 text-xs">
            <div className="flex items-center gap-1.5 text-zinc-400">
              <Calendar className="w-3.5 h-3.5 text-zinc-500" />
              <span>Data</span>
            </div>
            <div>
              <input
                type="date"
                value={task.date || ''}
                onChange={e => handleDateChange(e.target.value)}
                className="w-full bg-zinc-900/90 border border-zinc-800 rounded-lg px-2.5 py-1 text-xs text-zinc-200 focus:outline-none focus:border-zinc-700"
              />
            </div>
          </div>

          {/* Deadline */}
          <div className="grid grid-cols-[100px_1fr] items-center gap-2 text-xs">
            <div className="flex items-center gap-1.5 text-zinc-400">
              <Hourglass className="w-3.5 h-3.5 text-zinc-500" />
              <span>Deadline</span>
            </div>
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={task.deadline || ''}
                onChange={e => handleDeadlineChange(e.target.value)}
                className="flex-1 bg-zinc-900/90 border border-zinc-800 rounded-lg px-2.5 py-1 text-xs text-zinc-200 focus:outline-none focus:border-zinc-700"
              />
              {task.deadline === new Date().toISOString().slice(0, 10) && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-medium">
                  Hoje
                </span>
              )}
            </div>
          </div>

          {/* Priority */}
          <div className="grid grid-cols-[100px_1fr] items-center gap-2 text-xs">
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

          {/* Context (Nota do cofre vinculada - Destaque do print!) */}
          <div className="grid grid-cols-[100px_1fr] items-start gap-2 text-xs relative">
            <div className="flex items-center gap-1.5 text-zinc-400 pt-1.5">
              <Compass className="w-3.5 h-3.5 text-zinc-500" />
              <span>Contexto</span>
            </div>

            <div className="relative">
              {task.contextNoteId ? (
                <div className="flex items-center justify-between p-1.5 bg-zinc-900/90 border border-zinc-700/80 rounded-lg">
                  <button
                    onClick={() => setIsContextPickerOpen(true)}
                    className="flex items-center gap-1.5 truncate text-left font-medium text-amber-300 hover:underline max-w-[190px] cursor-pointer"
                    title="Alterar nota vinculada"
                  >
                    <Compass className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span className="truncate">{task.contextNoteTitle || 'Nota vinculada'}</span>
                  </button>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => onOpenNote(task.contextNoteId!)}
                      className="p-1 hover:text-white text-zinc-400 hover:bg-zinc-800 rounded transition-colors"
                      title="Abrir nota no editor"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleContextSelect(null)}
                      className="p-1 hover:text-rose-400 text-zinc-500 hover:bg-zinc-800 rounded transition-colors"
                      title="Desvincular nota"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setIsContextPickerOpen(true)}
                  className="w-full flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-dashed border-zinc-700 hover:border-zinc-500 text-zinc-400 hover:text-zinc-200 transition-colors text-left"
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

        {/* 3. Internal Content / Notes of the Task */}
        <div className="pt-4 border-t border-zinc-800 space-y-2">
          <span className="text-[11px] font-medium text-zinc-400 block uppercase tracking-wider">Conteúdo Interno / Anotações</span>
          <textarea
            value={task.description}
            onChange={e => handleDescriptionChange(e.target.value)}
            placeholder="Escreva anotações, checklists e detalhes desta tarefa..."
            rows={10}
            className="w-full p-3 bg-zinc-950/70 border border-zinc-800 rounded-xl text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-700 resize-y leading-relaxed font-sans"
          />
        </div>
      </div>
    </aside>
  )
}
export default TaskDetailSidebar
