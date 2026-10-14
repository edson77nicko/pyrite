export interface Note {
  id: string
  title: string
  content: string
  folder: string
  tags: string[]
  isFavorite?: boolean
  createdAt: number
  updatedAt: number
}

export interface Folder {
  id: string
  name: string
  parentId: string | null
}

export interface LinkEdge {
  source: string
  target: string
}

export interface GraphNode {
  id: string
  title: string
  folder: string
  tags: string[]
  connections: number
  x: number
  y: number
  vx: number
  vy: number
  color?: string
}

export interface GraphSettings {
  repulsion: number
  linkDistance: number
  centerGravity: number
  nodeSize: number
  showLabels: boolean
  showArrows: boolean
  isLocalGraph: boolean
}

export interface CanvasCard {
  id: string
  x: number
  y: number
  width: number
  height: number
  text: string
  color: string
  noteId?: string
  title?: string
}

export interface CanvasConnection {
  id: string
  from: string
  to: string
  label?: string
}

export interface TabItem {
  id: string
  noteId: string
  title: string
  isPinned?: boolean
}

export type ViewMode = 'editor' | 'graph' | 'canvas'

export type EditorDisplayMode = 'split' | 'edit' | 'preview'

export type AccentColor = 'violet' | 'emerald' | 'cyan' | 'amber' | 'rose'
