export type MindMapShape =
  | 'rounded'
  | 'capsule'
  | 'rectangle'
  | 'oval'
  | 'cloud'
  | 'diamond'
  | 'hexagon'
  | 'underline'

export type MindMapLayout =
  | 'radial'      // Standard Mindomo balanced (left & right)
  | 'right'       // Mindomo Right-sided logic chart
  | 'left'        // Mindomo Left-sided tree
  | 'org-chart'   // Top-down organizational chart
  | 'tree-bottom' // Bottom-up hierarchy

export type MindMapThemeId =
  | 'mindomo-classic'
  | 'pyrita-gold'
  | 'synthwave-neon'
  | 'cyber-emerald'
  | 'pastel-dream'
  | 'monochrome'

export interface MindMapTask {
  completed?: boolean
  dueDate?: string
  priority?: number // 1 to 5
  progress?: number // 0, 25, 50, 75, 100
}

export interface MindMapNode {
  id: string
  parentId: string | null
  children: string[]
  title: string
  side?: 'left' | 'right'
  collapsed?: boolean
  shape?: MindMapShape
  fillColor?: string
  strokeColor?: string
  strokeWidth?: number
  textColor?: string
  fontSize?: number
  fontWeight?: 'normal' | 'bold'
  fontItalic?: boolean
  fontUnderline?: boolean
  fontStrike?: boolean
  branchColor?: string
  branchWidth?: number
  branchStyle?: 'curved' | 'straight' | 'rounded-elbow'
  icons?: string[]
  note?: string
  link?: string
  task?: MindMapTask
  customX?: number
  customY?: number
}

export interface MindMapRelation {
  id: string
  fromId: string
  toId: string
  label?: string
  color?: string
  lineStyle?: 'solid' | 'dashed' | 'dotted'
  arrowStart?: boolean
  arrowEnd?: boolean
  ctrlX1?: number
  ctrlY1?: number
  ctrlX2?: number
  ctrlY2?: number
}

export interface MindMapBoundary {
  id: string
  rootNodeId: string
  label?: string
  fillColor?: string
  strokeColor?: string
  shape?: 'rectangle' | 'rounded' | 'cloud'
}

export interface MindMapViewport {
  panX: number
  panY: number
  zoom: number
}

export interface MindMapDocument {
  type: 'pyrita-mindmap'
  version: 1
  rootId: string
  nodes: Record<string, MindMapNode>
  relations: MindMapRelation[]
  boundaries: MindMapBoundary[]
  theme: MindMapThemeId
  layout: MindMapLayout
  viewport: MindMapViewport
}

export interface ComputedNode {
  id: string
  x: number
  y: number
  width: number
  height: number
  side: 'left' | 'right' | 'center' | 'bottom'
  level: number
  node: MindMapNode
  branchColor: string
}

export interface ComputedEdge {
  id: string
  fromId: string
  toId: string
  path: string
  color: string
  width: number
  style: 'solid' | 'dashed' | 'dotted'
}

export interface ComputedBoundary {
  id: string
  boundary: MindMapBoundary
  rect: { x: number; y: number; width: number; height: number }
}

export interface ComputedLayout {
  nodes: ComputedNode[]
  edges: ComputedEdge[]
  boundaries: ComputedBoundary[]
  bounds: { minX: number; maxX: number; minY: number; maxY: number }
}
