export interface Note {
  id: string
  title: string
  content: string
  folder: string
  tags: string[]
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

export interface CanvasCard {
  id: string
  x: number
  y: number
  width: number
  height: number
  text: string
  color: string
  noteId?: string
}

export interface CanvasConnection {
  id: string
  from: string
  to: string
  label?: string
}

export type ViewMode = 'editor' | 'graph' | 'canvas'

export type EditorDisplayMode = 'split' | 'edit' | 'preview'
