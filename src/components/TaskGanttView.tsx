import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import type { TaskItem, TaskSettings } from '../types/tasks'
import type { Note } from '../types'
import { StatusProgressCircle, computeStatusProgress } from './StatusIndicator'
import { CustomDatePickerPopover } from './CustomDatePickerPopover'
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Plus,
  Check,
  Clock
} from 'lucide-react'

export type GanttScale = 'day' | 'week' | 'month'

interface TaskGanttViewProps {
  tasks: TaskItem[]
  settings: TaskSettings
  allNotes: Note[]
  selectedTaskId: string | null
  onSelectTask: (task: TaskItem | null) => void
  onUpdateTask: (task: TaskItem) => void
  onCreateTask: (initialTitle?: string, initialData?: Partial<TaskItem>) => void
}

const WEEKDAY_NAMES_PT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const MONTH_NAMES_PT = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
]

// Normaliza uma data para 'YYYY-MM-DD' local
function toLocalDateStr(d: Date): string {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function parseLocalDate(str?: string): Date | null {
  if (!str) return null
  const clean = str.slice(0, 10)
  const parts = clean.split('-')
  if (parts.length !== 3) return null
  const y = parseInt(parts[0], 10)
  const m = parseInt(parts[1], 10) - 1
  const d = parseInt(parts[2], 10)
  if (isNaN(y) || isNaN(m) || isNaN(d)) return null
  return new Date(y, m, d)
}

function addDays(d: Date, days: number): Date {
  const result = new Date(d)
  result.setDate(result.getDate() + days)
  return result
}

function daysDiff(d1: Date, d2: Date): number {
  const utc1 = Date.UTC(d1.getFullYear(), d1.getMonth(), d1.getDate())
  const utc2 = Date.UTC(d2.getFullYear(), d2.getMonth(), d2.getDate())
  return Math.round((utc2 - utc1) / (1000 * 60 * 60 * 24))
}

export const TaskGanttView: React.FC<TaskGanttViewProps> = ({
  tasks,
  settings,
  selectedTaskId,
  onSelectTask,
  onUpdateTask,
  onCreateTask
}) => {
  const [scale, setScale] = useState<GanttScale>('day')
  const [tableWidth, setTableWidth] = useState<number>(() => {
    const saved = localStorage.getItem('pyrita_gantt_table_width')
    return saved ? parseInt(saved, 10) : 280
  })
  const [newTaskInput, setNewTaskInput] = useState('')

  // Popover de data inline para as tarefas
  const [editingDateTask, setEditingDateTask] = useState<{ id: string; field: 'start' | 'end'; anchorEl: HTMLElement } | null>(null)

  // Referências para o scroll sincronizado
  const timelineScrollRef = useRef<HTMLDivElement>(null)
  const todayLineRef = useRef<HTMLDivElement>(null)
  const isResizingTableRef = useRef(false)
  const startXRef = useRef(0)
  const startWidthRef = useRef(0)

  // Estado para arrastar/redimensionar a barra no Gantt
  const [dragState, setDragState] = useState<{
    taskId: string
    action: 'move' | 'resize-start' | 'resize-end'
    startX: number
    origStart: Date
    origEnd: Date
    currentStart: Date
    currentEnd: Date
  } | null>(null)

  const today = useMemo(() => new Date(), [])
  const todayStr = useMemo(() => toLocalDateStr(today), [today])

  // Largura de cada coluna na timeline em pixels baseado na escala
  const colWidth = useMemo(() => {
    switch (scale) {
      case 'day': return 34
      case 'week': return 68
      case 'month': return 100
      default: return 34
    }
  }, [scale])

  // Calcular limites de datas para a visualização
  const { startDate, totalDays, datesList } = useMemo(() => {
    // Achar as datas mínimas e máximas de todas as tarefas
    let minD = addDays(today, -14)
    let maxD = addDays(today, 45)

    tasks.forEach(t => {
      const s = parseLocalDate(t.startDate || t.date)
      const e = parseLocalDate(t.endDate || t.deadline)
      if (s && s < minD) minD = addDays(s, -7)
      if (e && e > maxD) maxD = addDays(e, 14)
    })

    // Alinhar o início para o primeiro dia da semana ou mês se necessário
    const start = new Date(minD.getFullYear(), minD.getMonth(), minD.getDate())
    const end = new Date(maxD.getFullYear(), maxD.getMonth(), maxD.getDate())
    const count = daysDiff(start, end) + 1

    const list: Date[] = []
    for (let i = 0; i < count; i++) {
      list.push(addDays(start, i))
    }

    return {
      startDate: start,
      endDate: end,
      totalDays: count,
      datesList: list
    }
  }, [tasks, today])

  // Agrupamentos de meses no cabeçalho
  const monthGroups = useMemo(() => {
    const groups: { monthName: string; year: number; startIndex: number; count: number }[] = []
    let currentKey = ''
    let curGroup: { monthName: string; year: number; startIndex: number; count: number } | null = null

    datesList.forEach((d, idx) => {
      const key = `${d.getFullYear()}-${d.getMonth()}`
      if (key !== currentKey) {
        if (curGroup) groups.push(curGroup)
        currentKey = key
        curGroup = {
          monthName: MONTH_NAMES_PT[d.getMonth()],
          year: d.getFullYear(),
          startIndex: idx,
          count: 1
        }
      } else if (curGroup) {
        curGroup.count++
      }
    })
    if (curGroup) groups.push(curGroup)
    return groups
  }, [datesList])

  // Posição de hoje em pixels
  const todayIndex = useMemo(() => {
    return daysDiff(startDate, today)
  }, [startDate, today])

  // Centralizar na data de Hoje no carregamento
  const scrollToToday = useCallback(() => {
    if (!timelineScrollRef.current) return
    const container = timelineScrollRef.current
    const targetX = todayIndex * colWidth - container.clientWidth / 2 + colWidth / 2
    container.scrollTo({
      left: Math.max(0, targetX),
      behavior: 'smooth'
    })
  }, [todayIndex, colWidth])

  useEffect(() => {
    // Pequeno timeout para aguardar layout
    const t = setTimeout(() => {
      scrollToToday()
    }, 100)
    return () => clearTimeout(t)
  }, [scrollToToday])

  // Redimensionador de largura da tabela lateral
  const handleTableResizeStart = (e: React.MouseEvent) => {
    e.preventDefault()
    isResizingTableRef.current = true
    startXRef.current = e.clientX
    startWidthRef.current = tableWidth

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isResizingTableRef.current) return
      const delta = moveEvent.clientX - startXRef.current
      const newWidth = Math.max(180, Math.min(500, startWidthRef.current + delta))
      setTableWidth(newWidth)
    }

    const handleMouseUp = () => {
      isResizingTableRef.current = false
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
      setTableWidth(w => {
        localStorage.setItem('pyrita_gantt_table_width', String(w))
        return w
      })
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
  }

  // Tratamento de Quick Add no Gantt
  const handleQuickAdd = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTaskInput.trim()) return
    const startStr = todayStr
    const endStr = toLocalDateStr(addDays(today, 2))
    onCreateTask(newTaskInput.trim(), {
      startDate: startStr,
      date: startStr,
      endDate: endStr,
      deadline: endStr
    })
    setNewTaskInput('')
  }

  // Interação de arrasto de vela (move / resize)
  const handleBarMouseDown = (
    e: React.MouseEvent,
    task: TaskItem,
    action: 'move' | 'resize-start' | 'resize-end'
  ) => {
    e.stopPropagation()
    const taskStart = parseLocalDate(task.startDate || task.date) || today
    const taskEnd = parseLocalDate(task.endDate || task.deadline) || addDays(taskStart, 2)

    setDragState({
      taskId: task.id,
      action,
      startX: e.clientX,
      origStart: taskStart,
      origEnd: taskEnd,
      currentStart: taskStart,
      currentEnd: taskEnd
    })

    const onMouseMove = (moveEvt: MouseEvent) => {
      const deltaX = moveEvt.clientX - e.clientX
      const deltaDays = Math.round(deltaX / colWidth)

      if (action === 'move') {
        const nextStart = addDays(taskStart, deltaDays)
        const nextEnd = addDays(taskEnd, deltaDays)
        setDragState(prev => prev ? { ...prev, currentStart: nextStart, currentEnd: nextEnd } : null)
      } else if (action === 'resize-start') {
        let nextStart = addDays(taskStart, deltaDays)
        if (nextStart > taskEnd) nextStart = taskEnd
        setDragState(prev => prev ? { ...prev, currentStart: nextStart } : null)
      } else if (action === 'resize-end') {
        let nextEnd = addDays(taskEnd, deltaDays)
        if (nextEnd < taskStart) nextEnd = taskStart
        setDragState(prev => prev ? { ...prev, currentEnd: nextEnd } : null)
      }
    }

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)

      setDragState(latest => {
        if (latest) {
          const newStartStr = toLocalDateStr(latest.currentStart)
          const newEndStr = toLocalDateStr(latest.currentEnd)
          onUpdateTask({
            ...task,
            startDate: newStartStr,
            date: newStartStr,
            endDate: newEndStr,
            deadline: newEndStr,
            updatedAt: Date.now()
          })
        }
        return null
      })
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  // Status mapping
  const statusMap = useMemo(() => {
    const map = new Map<string, { name: string; color: string; isCompleted?: boolean }>()
    settings.statuses.forEach(s => {
      map.set(s.id, { name: s.name, color: s.color, isCompleted: s.isCompleted || s.group === 'done' })
    })
    return map
  }, [settings.statuses])

  const defaultStatusColor = '#c59b27'

  return (
    <div className="w-full h-full flex flex-col bg-[#121214] text-zinc-100 select-none overflow-hidden rounded-bl-2xl gantt-container">
      {/* 1. Barra de Controles do Gantt */}
      <div className="h-10 px-4 bg-[#141416] border-b border-zinc-800/60 flex items-center justify-between gap-3 shrink-0 gantt-header">
        <div className="flex items-center gap-2">
          {/* Botão Hoje */}
          <button
            type="button"
            onClick={scrollToToday}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium bg-[#18181b] hover:bg-[#222226] border border-zinc-800 text-zinc-300 hover:text-zinc-100 transition-colors cursor-pointer"
            title="Centralizar no dia atual"
          >
            <Clock className="w-3 h-3 text-[var(--accent,#c59b27)]" />
            <span>Hoje</span>
          </button>

          {/* Navegação Anterior / Próximo */}
          <div className="flex items-center bg-[#18181b] border border-zinc-800 rounded-md overflow-hidden">
            <button
              type="button"
              onClick={() => {
                if (timelineScrollRef.current) {
                  timelineScrollRef.current.scrollBy({ left: -colWidth * 7, behavior: 'smooth' })
                }
              }}
              className="p-1 hover:bg-[#222226] text-zinc-400 hover:text-zinc-100 transition-colors cursor-pointer"
              title="Voltar 1 semana"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <div className="h-3 w-px bg-zinc-800" />
            <button
              type="button"
              onClick={() => {
                if (timelineScrollRef.current) {
                  timelineScrollRef.current.scrollBy({ left: colWidth * 7, behavior: 'smooth' })
                }
              }}
              className="p-1 hover:bg-[#222226] text-zinc-400 hover:text-zinc-100 transition-colors cursor-pointer"
              title="Avançar 1 semana"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <span className="text-xs font-semibold text-zinc-300 pl-1">
            {MONTH_NAMES_PT[today.getMonth()]} {today.getFullYear()}
          </span>
        </div>

        {/* Lado Direito: Seletor de Escala (Dia, Semana, Mês) */}
        <div className="flex items-center gap-1 bg-[#18181b] border border-zinc-800 p-0.5 rounded-lg">
          {(['day', 'week', 'month'] as GanttScale[]).map(sc => (
            <button
              key={sc}
              type="button"
              onClick={() => setScale(sc)}
              className={`px-2 py-0.5 rounded text-[10.5px] font-medium transition-all cursor-pointer ${
                scale === sc
                  ? 'bg-[var(--accent,#c59b27)] text-zinc-950 font-bold shadow-xs'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {sc === 'day' ? 'Dias' : sc === 'week' ? 'Semanas' : 'Meses'}
            </button>
          ))}
        </div>
      </div>

      {/* 2. Área Principal com Painel Dividido (Tabela Fixa à Esquerda + Timeline Horizontal à Direita) */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Lado Esquerdo: Lista de Tarefas (Coluna Fixa com Título e Datas) */}
        <div
          style={{ width: tableWidth }}
          className="shrink-0 h-full flex flex-col bg-[#121214] border-r border-zinc-800/70 z-10 select-none overflow-hidden relative"
        >
          {/* Cabeçalho da Lista de Tarefas */}
          <div className="h-[52px] px-3 bg-[#18181b] border-b border-zinc-800/70 flex items-center justify-between text-xs font-semibold text-zinc-300 shrink-0">
            <div className="flex items-center gap-2">
              <span>Tarefas</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full font-mono bg-zinc-800/80 text-zinc-400">
                {tasks.length}
              </span>
            </div>
            <span className="text-[10px] font-medium text-zinc-500">Início → Fim</span>
          </div>

          {/* Linhas de Tarefas da Lista Lateral */}
          <div className="flex-1 overflow-y-hidden overflow-x-hidden">
            {tasks.map(task => {
              const isSelected = selectedTaskId === task.id
              const statusInfo = statusMap.get(task.statusId)
              const startStr = task.startDate || task.date
              const endStr = task.endDate || task.deadline

              return (
                <div
                  key={task.id}
                  onClick={() => onSelectTask(task)}
                  className={`h-[34px] px-3 flex items-center justify-between gap-2 border-b border-zinc-800/40 text-xs transition-colors cursor-pointer group/row gantt-row ${
                    isSelected
                      ? 'bg-[#222226] text-white border-l-2 border-l-[var(--accent,#c59b27)] is-selected'
                      : 'bg-[#141416] hover:bg-[#1a1a1e] text-zinc-300'
                  }`}
                >
                  {/* Checkbox + Ícone de status + Título */}
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation()
                        onUpdateTask({ ...task, completed: !task.completed, updatedAt: Date.now() })
                      }}
                      className={`w-3.5 h-3.5 rounded-[4px] flex items-center justify-center shrink-0 transition-colors ${
                        task.completed
                          ? 'bg-emerald-500 text-zinc-950'
                          : 'border border-zinc-700 hover:border-zinc-400 bg-transparent'
                      }`}
                    >
                      {task.completed && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                    </button>

                    <StatusProgressCircle
                      progress={computeStatusProgress(task.statusId, settings.statuses)}
                      color={statusInfo?.color || defaultStatusColor}
                      size={11}
                    />

                    <span
                      className={`truncate font-medium text-[11.5px] ${
                        task.completed ? 'line-through text-zinc-500' : 'text-zinc-200'
                      }`}
                    >
                      {task.title}
                    </span>
                  </div>

                  {/* Resumo de Datas (Clicável para editar) */}
                  <div
                    onClick={e => {
                      e.stopPropagation()
                      setEditingDateTask({ id: task.id, field: 'start', anchorEl: e.currentTarget })
                    }}
                    className="flex items-center gap-1 text-[10px] font-mono text-zinc-500 hover:text-zinc-200 shrink-0 px-1 py-0.5 rounded hover:bg-zinc-800/50 transition-colors"
                    title="Clique para alterar as datas da tarefa"
                  >
                    <span>{startStr ? startStr.slice(5) : '--'}</span>
                    <span className="text-zinc-600">→</span>
                    <span>{endStr ? endStr.slice(5) : '--'}</span>
                  </div>
                </div>
              )
            })}

            {/* Quick Add no rodapé da lista */}
            <form onSubmit={handleQuickAdd} className="h-[34px] px-3 flex items-center gap-2 border-b border-zinc-800/40 bg-[#141416]">
              <Plus className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
              <input
                type="text"
                value={newTaskInput}
                onChange={e => setNewTaskInput(e.target.value)}
                placeholder="+ Adicionar tarefa..."
                className="w-full bg-transparent text-[11px] text-zinc-200 placeholder-zinc-500 focus:outline-none"
              />
            </form>
          </div>

          {/* Alça de redimensionamento da lista */}
          <div
            onMouseDown={handleTableResizeStart}
            className="absolute top-0 right-0 bottom-0 w-1.5 cursor-col-resize hover:bg-[var(--accent,#c59b27)]/60 transition-colors z-20"
            title="Arraste para redimensionar a lista"
          />
        </div>

        {/* Lado Direito: Timeline Horizontal do Gantt */}
        <div
          ref={timelineScrollRef}
          className="flex-1 h-full overflow-x-auto overflow-y-auto custom-chat-scrollbar relative bg-[#121214]"
        >
          <div style={{ width: totalDays * colWidth }} className="min-w-full relative">
            {/* Cabeçalho da Timeline: Nível 1 (Meses) + Nível 2 (Dias) */}
            <div className="sticky top-0 z-30 bg-[#18181b] border-b border-zinc-800/70 select-none shadow-[0_1px_0_rgba(255,255,255,0.03)]">
              {/* Nível 1: Meses */}
              <div className="h-6 flex border-b border-zinc-800/50 text-[10px] font-semibold text-zinc-400">
                {monthGroups.map((g, idx) => (
                  <div
                    key={`${g.year}-${g.monthName}-${idx}`}
                    style={{ width: g.count * colWidth }}
                    className="h-full px-2 flex items-center border-r border-zinc-800/50 truncate bg-[#18181b]"
                  >
                    <span className="truncate">{g.monthName} {g.year}</span>
                  </div>
                ))}
              </div>

              {/* Nível 2: Dias da semana e números */}
              <div className="h-[28px] flex text-[10px] font-mono">
                {datesList.map(d => {
                  const dStr = toLocalDateStr(d)
                  const isCurrentDay = dStr === todayStr
                  const dayOfWeek = d.getDay()
                  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6

                  return (
                    <div
                      key={dStr}
                      style={{ width: colWidth }}
                      className={`h-full flex flex-col items-center justify-center border-r border-zinc-800/35 shrink-0 ${
                        isWeekend ? 'bg-zinc-900/30 text-zinc-500' : 'text-zinc-400'
                      } ${isCurrentDay ? 'bg-[var(--accent-glow-subtle,rgba(197,155,39,0.12))] font-bold text-[var(--accent,#c59b27)]' : ''}`}
                    >
                      <span className="text-[8.5px] leading-tight opacity-75">
                        {WEEKDAY_NAMES_PT[dayOfWeek].slice(0, 1)}
                      </span>
                      <span className="text-[10px] leading-tight">
                        {d.getDate()}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Linha Vertical Marcando "Hoje" em Toda a Extensão */}
            {todayIndex >= 0 && todayIndex < totalDays && (
              <div
                ref={todayLineRef}
                style={{
                  left: todayIndex * colWidth + colWidth / 2,
                  width: '2px'
                }}
                className="absolute top-[52px] bottom-0 bg-[var(--accent,#c59b27)] opacity-70 z-20 pointer-events-none"
              >
                <div className="w-2 h-2 rounded-full bg-[var(--accent,#c59b27)] -translate-x-[3px] -translate-y-1 shadow-sm" />
              </div>
            )}

            {/* Fundo de Linhas de Grade e Fins de Semana */}
            <div className="absolute top-[52px] left-0 right-0 bottom-0 pointer-events-none flex">
              {datesList.map(d => {
                const dayOfWeek = d.getDay()
                const isWeekend = dayOfWeek === 0 || dayOfWeek === 6
                return (
                  <div
                    key={`grid_${toLocalDateStr(d)}`}
                    style={{ width: colWidth }}
                    className={`h-full border-r border-zinc-800/20 shrink-0 ${
                      isWeekend ? 'bg-zinc-950/20' : ''
                    }`}
                  />
                )
              })}
            </div>

            {/* Linhas das Tarefas e Barras (Velas do Gantt) */}
            <div className="relative z-10">
              {tasks.map(task => {
                const isSelected = selectedTaskId === task.id
                const statusInfo = statusMap.get(task.statusId)
                const barColor = statusInfo?.color || defaultStatusColor

                // Determinar limites de datas da tarefa
                const isDraggingThis = dragState && dragState.taskId === task.id
                const taskStartDate = isDraggingThis
                  ? dragState.currentStart
                  : parseLocalDate(task.startDate || task.date)
                const taskEndDate = isDraggingThis
                  ? dragState.currentEnd
                  : parseLocalDate(task.endDate || task.deadline)

                let barLeft = 0
                let barWidth = 0
                let hasValidDates = false

                if (taskStartDate && taskEndDate) {
                  const startOffsetDays = daysDiff(startDate, taskStartDate)
                  const durationDays = Math.max(1, daysDiff(taskStartDate, taskEndDate) + 1)
                  barLeft = startOffsetDays * colWidth
                  barWidth = Math.max(colWidth * 0.85, durationDays * colWidth - 2)
                  hasValidDates = true
                }

                // Cálculo de progresso de subtarefas se houver
                const subtasks = task.subtasks || []
                const completedSubtasks = subtasks.filter(st => st.completed).length
                const subtaskProgress = subtasks.length > 0 ? (completedSubtasks / subtasks.length) * 100 : null

                return (
                  <div
                    key={`gantt_row_${task.id}`}
                    onClick={() => onSelectTask(task)}
                    className={`h-[34px] border-b border-zinc-800/40 relative flex items-center transition-colors gantt-row ${
                      isSelected ? 'bg-[#222226]/50 is-selected' : 'hover:bg-[#1a1a1e]/40'
                    }`}
                  >
                    {hasValidDates ? (
                      /* Barra (Vela) do Gantt */
                      <div
                        style={{
                          left: barLeft,
                          width: barWidth,
                          height: '16px' // Linhas finas / velas elegantes como solicitado
                        }}
                        onMouseDown={e => handleBarMouseDown(e, task, 'move')}
                        className={`absolute rounded-[4px] cursor-grab active:cursor-grabbing flex items-center px-1.5 overflow-hidden transition-shadow group/bar ${
                          task.completed
                            ? 'opacity-65 ring-1 ring-emerald-500/50'
                            : 'hover:brightness-110 shadow-xs'
                        }`}
                        title={`${task.title}\nInício: ${toLocalDateStr(taskStartDate!)}\nTérmino: ${toLocalDateStr(taskEndDate!)}\nStatus: ${statusInfo?.name || 'Padrão'}`}
                      >
                        {/* Fundo da barra com a cor do status */}
                        <div
                          className="absolute inset-0 opacity-85"
                          style={{ backgroundColor: barColor }}
                        />

                        {/* Preenchimento de progresso se tiver subtarefas */}
                        {subtaskProgress !== null && (
                          <div
                            className="absolute top-0 bottom-0 left-0 bg-white/20"
                            style={{ width: `${subtaskProgress}%` }}
                          />
                        )}

                        {/* Texto do título dentro da barra se couber */}
                        <span className="relative z-10 text-[9.5px] font-semibold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] truncate">
                          {task.title}
                        </span>

                        {/* Alça Esquerda para Redimensionar Data de Início */}
                        <div
                          onMouseDown={e => handleBarMouseDown(e, task, 'resize-start')}
                          className="absolute left-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-white/40 transition-colors z-20"
                          title="Arrastar para alterar data de início"
                        />

                        {/* Alça Direita para Redimensionar Data de Término */}
                        <div
                          onMouseDown={e => handleBarMouseDown(e, task, 'resize-end')}
                          className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-white/40 transition-colors z-20"
                          title="Arrastar para alterar data de término"
                        />
                      </div>
                    ) : (
                      /* Tarefa sem data definida: Botão discreto para posicionar no Gantt */
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation()
                          const newStart = todayStr
                          const newEnd = toLocalDateStr(addDays(today, 3))
                          onUpdateTask({
                            ...task,
                            startDate: newStart,
                            date: newStart,
                            endDate: newEnd,
                            deadline: newEnd,
                            updatedAt: Date.now()
                          })
                        }}
                        style={{ left: todayIndex * colWidth }}
                        className="absolute h-[16px] px-2 rounded-[4px] border border-dashed border-zinc-700 hover:border-[var(--accent,#c59b27)] bg-zinc-800/40 hover:bg-zinc-800 text-[9.5px] text-zinc-400 hover:text-zinc-100 flex items-center gap-1 transition-colors cursor-pointer"
                        title="Clique para agendar esta tarefa no Gantt"
                      >
                        <Calendar className="w-2.5 h-2.5" />
                        <span>Agendar</span>
                      </button>
                    )}
                  </div>
                )
              })}

              {/* Linha fantasma para o Quick Add */}
              <div className="h-[34px] border-b border-zinc-800/40 relative" />
            </div>
          </div>
        </div>
      </div>

      {/* Popover flutuante para editar data ao clicar na lista */}
      {editingDateTask && (
        <CustomDatePickerPopover
          value={
            (() => {
              const t = tasks.find(x => x.id === editingDateTask.id)
              if (!t) return undefined
              return editingDateTask.field === 'start' ? (t.startDate || t.date) : (t.endDate || t.deadline)
            })()
          }
          onChange={val => {
            const t = tasks.find(x => x.id === editingDateTask.id)
            if (t) {
              if (editingDateTask.field === 'start') {
                onUpdateTask({ ...t, startDate: val, date: val, updatedAt: Date.now() })
              } else {
                onUpdateTask({ ...t, endDate: val, deadline: val, updatedAt: Date.now() })
              }
            }
          }}
          onClose={() => setEditingDateTask(null)}
          anchorEl={editingDateTask.anchorEl}
          align="left"
        />
      )}
    </div>
  )
}
