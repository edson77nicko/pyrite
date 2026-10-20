export type TaskPriority = 'none' | 'low' | 'medium' | 'high' | 'urgent'

export interface TaskStatusOption {
  id: string
  name: string
  color: string
  isCompleted?: boolean
}

export type TaskPropertyType = 'text' | 'select' | 'date' | 'number' | 'context' | 'priority' | 'status'

export interface TaskPropertyOption {
  id: string
  name: string
  color: string
}

export interface TaskPropertyConfig {
  id: string
  name: string
  type: TaskPropertyType
  options?: TaskPropertyOption[]
}

export interface TaskItem {
  id: string
  title: string
  completed: boolean
  statusId: string
  priority: TaskPriority
  date?: string
  deadline?: string
  contextNoteId?: string
  contextNoteTitle?: string
  tags: string[]
  description: string
  customValues?: Record<string, any>
  createdAt: number
  updatedAt: number
}

export interface TaskSettings {
  statuses: TaskStatusOption[]
  properties: TaskPropertyConfig[]
}
