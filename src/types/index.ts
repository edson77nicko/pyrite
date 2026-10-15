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

// Updated: Only Live Preview and Reading Mode (no split mode!)
export type EditorDisplayMode = 'live' | 'reading'

export type AccentColor = 'violet' | 'emerald' | 'cyan' | 'amber' | 'rose'

export interface AppSettings {
  accentColor: AccentColor
  fontSize: 'small' | 'medium' | 'large'
  editorWidth: 'compact' | 'standard' | 'wide'
}

export interface SavedVault {
  id: string
  name: string
  path: string
  lastOpened: number
}

