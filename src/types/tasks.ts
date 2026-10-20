export type TaskPriority = string

export interface TaskPriorityOption {
  id: string
  label: string
  color: string
  icon?: string
}

export interface TaskBoard {
  id: string
  name: string
  icon?: string
  createdAt: number
}

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
  icon?: string
}

export interface TaskPropertyConfig {
  id: string
  name: string
  type: TaskPropertyType
  options?: TaskPropertyOption[]
  hidden?: boolean
}

export interface SubTask {
  id: string
  title: string
  completed: boolean
  createdAt: number
}

export interface TaskItem {
  id: string
  boardId?: string
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
  subtasks?: SubTask[]
  customValues?: Record<string, any>
  createdAt: number
  updatedAt: number
}

export interface TaskSettings {
  statuses: TaskStatusOption[]
  priorities?: TaskPriorityOption[]
  properties: TaskPropertyConfig[]
  boards?: TaskBoard[]
}
