import type {
  TaskSettings,
  TaskPropertyConfig,
  TaskStatusGroup,
  TaskStatusOption,
  TaskPriorityOption,
  TaskItem
} from '../types/tasks'
import { DEFAULT_TASK_SETTINGS, DEFAULT_PRIORITIES } from './taskStorage'

export interface PropertyItem {
  id: string
  name: string
  color: string
  icon?: string
  group?: TaskStatusGroup
  progress?: number
}

export interface CurrencyConfig {
  code: string
  symbol: string
  label: string
  locale: string
}

export const CURRENCY_OPTIONS: CurrencyConfig[] = [
  { code: 'BRL', symbol: 'R$', label: 'Real Brasileiro (R$)', locale: 'pt-BR' },
  { code: 'USD', symbol: '$', label: 'Dólar Americano ($)', locale: 'en-US' },
  { code: 'EUR', symbol: '€', label: 'Euro (€)', locale: 'de-DE' },
  { code: 'GBP', symbol: '£', label: 'Libra Esterlina (£)', locale: 'en-GB' },
  { code: 'JPY', symbol: '¥', label: 'Iene Japonês (¥)', locale: 'ja-JP' },
  { code: 'CAD', symbol: 'CA$', label: 'Dólar Canadense (CA$)', locale: 'en-CA' },
  { code: 'AUD', symbol: 'AU$', label: 'Dólar Australiano (AU$)', locale: 'en-AU' },
  { code: 'CHF', symbol: 'CHF', label: 'Franco Suíço (CHF)', locale: 'de-CH' },
  { code: 'CNY', symbol: 'CN¥', label: 'Yuan Chinês (CN¥)', locale: 'zh-CN' }
]

export const formatCurrencyValue = (val: number | string | undefined | null, code = 'BRL'): string => {
  if (val === undefined || val === null || val === '') return '-'
  const num = typeof val === 'number' ? val : parseFloat(String(val).replace(/[^0-9.-]/g, ''))
  if (isNaN(num)) return String(val)

  const cfg = CURRENCY_OPTIONS.find(c => c.code === code) || CURRENCY_OPTIONS[0]
  try {
    return new Intl.NumberFormat(cfg.locale, {
      style: 'currency',
      currency: cfg.code
    }).format(num)
  } catch {
    return `${cfg.symbol} ${num.toFixed(2)}`
  }
}

/** Format ISO date (YYYY-MM-DD or YYYY-MM-DD HH:mm) into Brazilian format (DD/MM/AAAA or DD/MM/AAAA HH:mm) */
export const formatDateBR = (val?: string): string => {
  if (!val) return ''
  const [datePart, timePart] = val.split(' ')
  const parts = (datePart || '').split('-')
  if (parts.length === 3) {
    const [y, m, d] = parts
    const brDate = `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`
    return timePart ? `${brDate} ${timePart}` : brDate
  }
  return val
}

/** Format a date range into Brazilian standard: DD/MM → DD/MM/AAAA or DD/MM/AAAA */
export const formatDateRangeBR = (start?: string, end?: string): string => {
  if (!start && !end) return ''
  const sBR = formatDateBR(start)
  const eBR = formatDateBR(end)

  if (sBR && !eBR) return sBR
  if (!sBR && eBR) return eBR
  if (sBR === eBR) return sBR

  // If both have same year, shorten start to DD/MM
  const sParts = sBR.split(' ')
  const eParts = eBR.split(' ')
  const [sDayMonth, sYear] = [sParts[0].slice(0, 5), sParts[0].slice(6)]
  const [, eYear] = [eParts[0].slice(0, 5), eParts[0].slice(6)]

  if (sYear && eYear && sYear === eYear && !sParts[1] && !eParts[1]) {
    return `${sDayMonth} → ${eBR}`
  }

  return `${sBR} → ${eBR}`
}

/** Star rating mapping for priorities: 1 to 5 stars */
export const PRIORITY_STAR_MAP: Record<string, number> = {
  urgent: 4,
  high: 3,
  medium: 2,
  low: 1,
  none: 0
}

export const STAR_TO_PRIORITY: Record<number, string> = {
  4: 'urgent',
  3: 'high',
  2: 'medium',
  1: 'low',
  0: 'none'
}

export const STATUS_GROUPS: { id: TaskStatusGroup; label: string; color: string }[] = [
  { id: 'todo', label: 'A fazer', color: '#71717a' },
  { id: 'in_progress', label: 'Em andamento', color: '#f59e0b' },
  { id: 'done', label: 'Concluídos', color: '#10b981' }
]

export const BUILTIN_PROPERTY_IDS = ['prop_status', 'prop_priority', 'prop_deadline', 'prop_context', 'prop_tags']

export const isBuiltinProperty = (id: string) => BUILTIN_PROPERTY_IDS.includes(id)

export const statusGroupOf = (s: { group?: TaskStatusGroup; isCompleted?: boolean }): TaskStatusGroup =>
  s.group || (s.isCompleted ? 'done' : 'todo')

const groupOrder = (g: TaskStatusGroup) => STATUS_GROUPS.findIndex(x => x.id === g)

/** Property types that hold a list of items and can organize kanban columns */
export const isOptionProperty = (p: TaskPropertyConfig) =>
  p.type === 'status' || p.type === 'select' || p.type === 'priority'

export const getPropertyItems = (settings: TaskSettings, prop: TaskPropertyConfig): PropertyItem[] => {
  if (prop.id === 'prop_status') {
    const list = Array.isArray(settings.statuses) && settings.statuses.length ? settings.statuses : DEFAULT_TASK_SETTINGS.statuses
    return list.map(s => ({ id: s.id, name: s.name, color: s.color, group: statusGroupOf(s), progress: s.progress }))
  }
  if (prop.id === 'prop_priority') {
    const list = Array.isArray(settings.priorities) && settings.priorities.length ? settings.priorities : DEFAULT_PRIORITIES
    return list.map(p => ({ id: p.id, name: p.label, color: p.color, icon: p.icon }))
  }
  const opts = (prop.options || []).map(o => ({ ...o }))
  if (prop.type === 'status') {
    return opts.map(o => ({ ...o, group: o.group || 'todo' }))
  }
  return opts
}

export const setPropertyItems = (settings: TaskSettings, prop: TaskPropertyConfig, items: PropertyItem[]): TaskSettings => {
  if (prop.id === 'prop_status') {
    const statuses: TaskStatusOption[] = items
      .map((it, idx) => ({ it, idx }))
      .sort((a, b) => groupOrder(a.it.group || 'todo') - groupOrder(b.it.group || 'todo') || a.idx - b.idx)
      .map(({ it }) => ({
        id: it.id,
        name: it.name,
        color: it.color,
        group: it.group || 'todo',
        isCompleted: (it.group || 'todo') === 'done',
        progress: it.progress
      }))
    return { ...settings, statuses }
  }
  if (prop.id === 'prop_priority') {
    const priorities: TaskPriorityOption[] = items.map(it => ({
      id: it.id,
      label: it.name,
      color: it.color,
      icon: it.icon
    }))
    return { ...settings, priorities }
  }
  const sorted =
    prop.type === 'status'
      ? items
          .map((it, idx) => ({ it, idx }))
          .sort((a, b) => groupOrder(a.it.group || 'todo') - groupOrder(b.it.group || 'todo') || a.idx - b.idx)
          .map(x => x.it)
      : items
  return {
    ...settings,
    properties: (settings.properties || []).map(p => (p.id === prop.id ? { ...p, options: sorted } : p))
  }
}

export const defaultStatusItems = (): PropertyItem[] => [
  { id: `opt_${Date.now()}_a`, name: 'Não iniciada', color: '#71717a', group: 'todo' },
  { id: `opt_${Date.now()}_b`, name: 'Em andamento', color: '#f59e0b', group: 'in_progress' },
  { id: `opt_${Date.now()}_c`, name: 'Concluído', color: '#10b981', group: 'done' }
]

export const getBoardProperties = (settings: TaskSettings, boardId?: string): TaskPropertyConfig[] => {
  const targetId = boardId || 'default'
  const board = (settings?.boards || []).find(b => b.id === targetId)
  if (board && Array.isArray(board.properties) && board.properties.length > 0) {
    return board.properties
  }
  if (settings?.boardProperties && Array.isArray(settings.boardProperties[targetId]) && settings.boardProperties[targetId].length > 0) {
    return settings.boardProperties[targetId]
  }
  const fallback = Array.isArray(settings?.properties) && settings.properties.length > 0
    ? settings.properties
    : DEFAULT_TASK_SETTINGS.properties
  return JSON.parse(JSON.stringify(fallback))
}

export const setBoardProperties = (
  settings: TaskSettings,
  boardId: string,
  properties: TaskPropertyConfig[]
): TaskSettings => {
  const targetId = boardId || 'default'
  const allBoards = settings.boards && settings.boards.length > 0 ? settings.boards : DEFAULT_TASK_SETTINGS.boards || []
  const boardExists = allBoards.some(b => b.id === targetId)

  const updatedBoards = boardExists
    ? allBoards.map(b => (b.id === targetId ? { ...b, properties } : b))
    : [...allBoards, { id: targetId, name: 'Geral', createdAt: Date.now(), properties }]

  return {
    ...settings,
    boards: updatedBoards,
    boardProperties: {
      ...(settings.boardProperties || {}),
      [targetId]: properties
    }
  }
}

/** Visual styles for labels (Rótulos) */
export interface LabelColorStyle {
  bg: string
  text: string
  border: string
  dot: string
}

export const LABEL_PALETTES: LabelColorStyle[] = [
  { bg: 'rgba(59, 130, 246, 0.12)', text: '#93c5fd', border: 'rgba(59, 130, 246, 0.35)', dot: '#3b82f6' },  // Blue
  { bg: 'rgba(16, 185, 129, 0.12)', text: '#6ee7b7', border: 'rgba(16, 185, 129, 0.35)', dot: '#10b981' },  // Emerald
  { bg: 'rgba(245, 158, 11, 0.12)', text: '#fcd34d', border: 'rgba(245, 158, 11, 0.35)', dot: '#f59e0b' },  // Amber
  { bg: 'rgba(139, 92, 246, 0.12)', text: '#c4b5fd', border: 'rgba(139, 92, 246, 0.35)', dot: '#8b5cf6' },  // Violet
  { bg: 'rgba(236, 72, 153, 0.12)', text: '#f472b6', border: 'rgba(236, 72, 153, 0.35)', dot: '#ec4899' },  // Pink
  { bg: 'rgba(14, 165, 233, 0.12)', text: '#7dd3fc', border: 'rgba(14, 165, 233, 0.35)', dot: '#0ea5e9' },  // Sky
  { bg: 'rgba(249, 115, 22, 0.12)', text: '#fdba74', border: 'rgba(249, 115, 22, 0.35)', dot: '#f97316' },  // Orange
  { bg: 'rgba(168, 85, 247, 0.12)', text: '#d8b4fe', border: 'rgba(168, 85, 247, 0.35)', dot: '#a855f7' },  // Purple
  { bg: 'rgba(20, 184, 166, 0.12)', text: '#5eead4', border: 'rgba(20, 184, 166, 0.35)', dot: '#14b8a6' },  // Teal
  { bg: 'rgba(244, 63, 94, 0.12)', text: '#fda4af', border: 'rgba(244, 63, 94, 0.35)', dot: '#f43f5e' }    // Rose
]

/** Get deterministic label color by string hashing */
export const getLabelColor = (label: string): LabelColorStyle => {
  if (!label) return LABEL_PALETTES[0]
  let hash = 0
  const normalized = label.trim().toLowerCase()
  for (let i = 0; i < normalized.length; i++) {
    hash = (hash << 5) - hash + normalized.charCodeAt(i)
    hash |= 0
  }
  const index = Math.abs(hash) % LABEL_PALETTES.length
  return LABEL_PALETTES[index]
}

export const getBoardSavedLabelsKey = (boardId = 'default') => `pyrite_task_board_labels_${boardId}`

/** Extract all saved labels for a specific project/board */
export const getSavedLabels = (
  settings?: TaskSettings,
  tasksOrBoardId?: TaskItem[] | string,
  maybeBoardId?: string
): string[] => {
  const set = new Set<string>()
  const tasks = Array.isArray(tasksOrBoardId) ? tasksOrBoardId : undefined
  const targetBoard = typeof tasksOrBoardId === 'string' ? tasksOrBoardId : (maybeBoardId || 'default')

  // From localStorage for this board
  try {
    const raw = localStorage.getItem(getBoardSavedLabelsKey(targetBoard))
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        parsed.forEach(l => {
          if (typeof l === 'string' && l.trim()) set.add(l.trim())
        })
      }
    }
  } catch {}

  // From settings boardLabels
  if (settings?.boardLabels && Array.isArray(settings.boardLabels[targetBoard])) {
    settings.boardLabels[targetBoard].forEach(l => {
      if (typeof l === 'string' && l.trim()) set.add(l.trim())
    })
  }

  // From existing tasks that belong to this board
  if (tasks && Array.isArray(tasks)) {
    tasks.forEach(t => {
      const tBoard = t.boardId || 'default'
      if (tBoard === targetBoard && Array.isArray(t.tags)) {
        t.tags.forEach(l => {
          if (typeof l === 'string' && l.trim()) set.add(l.trim())
        })
      }
    })
  }

  return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }))
}

/** Save a new label to this board's pool */
export const saveLabelToPool = (
  label: string,
  settings?: TaskSettings,
  tasksOrBoardId?: TaskItem[] | string,
  maybeBoardId?: string
): string[] => {
  const clean = label.trim().replace(/^#/, '')
  const tasks = Array.isArray(tasksOrBoardId) ? tasksOrBoardId : undefined
  const targetBoard = typeof tasksOrBoardId === 'string' ? tasksOrBoardId : (maybeBoardId || 'default')
  if (!clean) return getSavedLabels(settings, tasks, targetBoard)

  const current = getSavedLabels(settings, tasks, targetBoard)
  if (!current.some(l => l.toLowerCase() === clean.toLowerCase())) {
    const updated = [...current, clean].sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }))
    try {
      localStorage.setItem(getBoardSavedLabelsKey(targetBoard), JSON.stringify(updated))
    } catch {}
    return updated
  }
  return current
}

/** Rename an existing label in this board's pool */
export const renameLabelInPool = (oldLabel: string, newLabel: string, boardId = 'default'): string[] => {
  const targetBoard = boardId || 'default'
  const oldClean = oldLabel.trim().toLowerCase()
  const newClean = newLabel.trim().replace(/^#/, '')
  if (!newClean) return []

  try {
    const raw = localStorage.getItem(getBoardSavedLabelsKey(targetBoard))
    const list: string[] = raw ? JSON.parse(raw) : []
    const updated = list.map(l => l.toLowerCase() === oldClean ? newClean : l)
    if (!updated.some(l => l.toLowerCase() === newClean.toLowerCase())) {
      updated.push(newClean)
    }
    const deduplicated = Array.from(new Set(updated)).sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }))
    localStorage.setItem(getBoardSavedLabelsKey(targetBoard), JSON.stringify(deduplicated))
    return deduplicated
  } catch {}
  return []
}

/** Remove a label from this board's pool */
export const removeLabelFromPool = (label: string, boardId = 'default'): string[] => {
  const targetBoard = boardId || 'default'
  const clean = label.trim().toLowerCase()
  try {
    const raw = localStorage.getItem(getBoardSavedLabelsKey(targetBoard))
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        const updated = parsed.filter((l: string) => l.toLowerCase() !== clean)
        localStorage.setItem(getBoardSavedLabelsKey(targetBoard), JSON.stringify(updated))
        return updated
      }
    }
  } catch {}
  return []
}
