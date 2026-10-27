export type NoteType = 'note' | 'draw' | 'mindmap' | 'html'

export interface Note {
  id: string
  title: string
  content: string
  folder: string // e.g. "Início" or "Projetos/Design"
  tags: string[]
  isFavorite?: boolean
  createdAt: number
  updatedAt: number
  filePath?: string // Full path on disk when running in Electron
  type?: NoteType
}

export interface Folder {
  id: string
  name: string
  path: string
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
  notePath?: string
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
  type?: NoteType
}

export * from './draw'
export * from './mindmap'
export * from './tasks'

export type ViewMode = 'editor' | 'graph' | 'canvas' | 'tasks'

// Updated: Only Live Preview and Reading Mode (no split mode!)
export type EditorDisplayMode = 'live' | 'reading'

export type AccentColor = string

export interface AppSettings {
  accentColor: AccentColor
  fontSize: 'small' | 'medium' | 'large'
  editorWidth: 'compact' | 'standard' | 'wide'
  themeMode?: 'dark' | 'light'
}

export interface SavedVault {
  id: string
  name: string
  path: string
  lastOpened: number
}

