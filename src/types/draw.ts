export type DrawTool =
  | 'select'
  | 'rectangle'
  | 'diamond'
  | 'ellipse'
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
  | 'arrow'
  | 'line'
  | 'freedraw'
  | 'text'

export interface DrawPoint {
  x: number
  y: number
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
}

export interface DrawViewport {
  panX: number
  panY: number
  zoom: number
}

export interface DrawDocument {
  type: 'pyrita-draw'
  version: 1
  elements: DrawElement[]
  viewport: DrawViewport
}
