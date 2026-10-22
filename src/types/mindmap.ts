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
  | 'radial'      // Standard balanced (left & right)
  | 'right'       // Right-sided logic chart
  | 'left'        // Left-sided tree
  | 'org-chart'   // Top-down organizational chart
  | 'tree-bottom' // Bottom-up hierarchy

export type MindMapLineStyle = 'tapered' | 'curved' | 'rounded-elbow'

export type MindMapStylePreset =
  | 'organic-branch' // Reference: Thick organic branches, underline subtopics
  | 'modern-cards'   // Rounded card boxes
  | 'pills'          // Pill/capsule topics
  | 'technical'      // Rectangles with orthogonal lines
  | 'minimal-lines'  // Clean lines without background boxes

export type MindMapPaletteId =
  | 'rainbow'    // Vibrant multi-color (Blue, Orange, Green, Purple, Magenta)
  | 'gold'       // Pyrita Amber Gold
  | 'ocean'      // Cyan, Blue, Teal
  | 'emerald'    // Forest, Emerald, Mint
  | 'sunset'     // Coral, Orange, Rose, Amber
  | 'monochrome' // Clean Black, Zinc, White
  | (string & {}) // Custom palette IDs

export type MindMapThemeId =
  | 'pyrita-classic'
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
  branchStyle?: MindMapLineStyle
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
  canvasBg?: string
  lineStyle?: MindMapLineStyle
  mapStyle?: MindMapStylePreset
  paletteId?: MindMapPaletteId
  colorizeNodeBg?: boolean
  colorDistribution?: 'hierarchy' | 'branch'
  customPalettes?: Record<string, { name: string; colors: string[] }>
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
  isTapered?: boolean
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
