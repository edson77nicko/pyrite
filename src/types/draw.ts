export type DrawTool =
  | 'select'
  | 'rectangle'
  | 'diamond'
  | 'ellipse'
  | 'triangle'
  | 'triangleDown'
  | 'roundedRect'
  | 'parallelogram'
  | 'cylinder'
  | 'sticky'
  | 'data-task'
  | 'table'
  | 'note-card'
  | 'arrow'
  | 'line'
  | 'freedraw'
  | 'text'
  | 'eraser'
  | 'pan'

export type DrawElementType =
  | 'rectangle'
  | 'diamond'
  | 'ellipse'
  | 'triangle'
  | 'triangleDown'
  | 'roundedRect'
  | 'parallelogram'
  | 'cylinder'
  | 'sticky'
  | 'data-task'
  | 'table'
  | 'note-card'
  | 'arrow'
  | 'line'
  | 'freedraw'
  | 'text'

export interface DrawPoint {
  x: number
  y: number
}

export interface ElementBinding {
  elementId: string
  handle: 'top' | 'right' | 'bottom' | 'left'
}

export interface DrawElement {
  id: string
  type: DrawElementType
  x: number
  y: number
  width: number
  height: number
  strokeColor: string
  backgroundColor: string
  strokeWidth: number // 1, 2, 4, 6
  strokeStyle: 'solid' | 'dashed' | 'dotted'
  fillStyle: 'none' | 'semi' | 'solid'
  roughness?: number
  points?: DrawPoint[] // Para freedraw, line, arrow
  text?: string
  fontSize?: number // 14, 18, 24, 32
  fontFamily?: 'sans' | 'handwriting' | 'mono'
  textAlign?: 'left' | 'center' | 'right'
  opacity?: number // 0 a 100
  isLocked?: boolean
  startBinding?: ElementBinding
  endBinding?: ElementBinding
  isBold?: boolean
  isStrikethrough?: boolean
  isList?: boolean
  boardId?: string
  viewMode?: 'calendar' | 'list' | 'kanban'
  taskFilter?: 'all' | 'pending' | 'completed'
  rows?: number
  cols?: number
  rowHeights?: number[]
  colWidths?: number[]
  cells?: Record<string, string>
  noteId?: string
  noteTitle?: string
  noteContent?: string
  noteFolder?: string
}

export interface DrawViewport {
  panX: number
  panY: number
  zoom: number
}

export interface DrawDocument {
  type: 'pyrite-draw' | 'pyrita-draw'
  version: 1
  elements: DrawElement[]
  viewport: DrawViewport
}
