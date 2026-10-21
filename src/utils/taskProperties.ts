import type {
  TaskSettings,
  TaskPropertyConfig,
  TaskStatusGroup,
  TaskStatusOption,
  TaskPriorityOption
} from '../types/tasks'
import { DEFAULT_TASK_SETTINGS, DEFAULT_PRIORITIES } from './taskStorage'

export interface PropertyItem {
  id: string
  name: string
  color: string
  icon?: string
  group?: TaskStatusGroup
}

export const STATUS_GROUPS: { id: TaskStatusGroup; label: string; color: string }[] = [
  { id: 'todo', label: 'A fazer', color: '#71717a' },
  { id: 'in_progress', label: 'Em andamento', color: '#3b82f6' },
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
    return list.map(s => ({ id: s.id, name: s.name, color: s.color, group: statusGroupOf(s) }))
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
        isCompleted: (it.group || 'todo') === 'done'
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
  { id: `opt_${Date.now()}_b`, name: 'Em andamento', color: '#3b82f6', group: 'in_progress' },
  { id: `opt_${Date.now()}_c`, name: 'Concluído', color: '#10b981', group: 'done' }
]
