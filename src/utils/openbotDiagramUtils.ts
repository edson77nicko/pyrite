/**
 * Utilitários geométricos e de validação de grafo baseados no DiagramBoard / diagram-graph.ts do OpenBot (extraídos via REA).
 */

export const DIAGRAM_NODE_WIDTH = 264
export const DIAGRAM_PORT_OFFSET_Y = 74
export const DIAGRAM_SNAP = 16

export function snapDiagramCoord(value: number): number {
  return Math.round(value / DIAGRAM_SNAP) * DIAGRAM_SNAP
}

export function getNodeCardDimensions(kind?: string): { width: number; height: number; offsetY: number } {
  if (kind === 'sticky_note') return { width: 220, height: 160, offsetY: 80 }
  if (kind === 'text_block') return { width: 300, height: 44, offsetY: 22 }
  if (kind === 'run_agent') return { width: 290, height: 210, offsetY: 131 }
  if (kind === 'llm') return { width: 290, height: 210, offsetY: 131 }
  if (kind === 'input') return { width: 350, height: 160, offsetY: 106 }
  if (kind === 'condition') return { width: 290, height: 180, offsetY: 116 }
  if (kind === 'approval') return { width: 290, height: 160, offsetY: 106 }
  return { width: 280, height: 160, offsetY: 106 }
}

export function diagramInputPort(position: { x: number; y: number }, offsetY = DIAGRAM_PORT_OFFSET_Y): { x: number; y: number } {
  return {
    x: position.x,
    y: position.y + offsetY
  }
}

export function diagramOutputPort(position: { x: number; y: number }, width = DIAGRAM_NODE_WIDTH, offsetY = DIAGRAM_PORT_OFFSET_Y): { x: number; y: number } {
  return {
    x: position.x + width,
    y: position.y + offsetY
  }
}

export function getNodeInputPort(
  node: { position: { x: number; y: number }; kind?: string },
  measuredHeight?: number
): { x: number; y: number } {
  const dim = getNodeCardDimensions(node.kind)
  const portY = measuredHeight ? node.position.y + 26 + (measuredHeight / 2) : node.position.y + dim.offsetY
  return {
    x: node.position.x,
    y: Math.round(portY)
  }
}

export function getNodeOutputPort(
  node: { position: { x: number; y: number }; kind?: string },
  measuredHeight?: number
): { x: number; y: number } {
  const dim = getNodeCardDimensions(node.kind)
  const portY = measuredHeight ? node.position.y + 26 + (measuredHeight / 2) : node.position.y + dim.offsetY
  return {
    x: node.position.x + dim.width,
    y: Math.round(portY)
  }
}

export function diagramEdgePath(from: { x: number; y: number }, to: { x: number; y: number }): string {
  const dx = Math.abs(to.x - from.x)
  const bend = Math.max(48, dx / 2)
  return `M ${from.x} ${from.y} C ${from.x + bend} ${from.y}, ${to.x - bend} ${to.y}, ${to.x} ${to.y}`
}

export function diagramEdgeMidpoint(from: { x: number; y: number }, to: { x: number; y: number }): { x: number; y: number } {
  return {
    x: (from.x + to.x) / 2,
    y: (from.y + to.y) / 2
  }
}

export function diagramEdgeArrow(to: { x: number; y: number }): string {
  const x = to.x
  const y = to.y
  return `M ${x - 7} ${y - 4} L ${x - 1} ${y} L ${x - 7} ${y + 4}`
}

export function diagramBounds(
  positions: { x: number; y: number }[],
  cardWidth = DIAGRAM_NODE_WIDTH,
  cardHeight = 148
): { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number } | null {
  if (positions.length === 0) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const pos of positions) {
    minX = Math.min(minX, pos.x)
    minY = Math.min(minY, pos.y)
    maxX = Math.max(maxX, pos.x + cardWidth)
    maxY = Math.max(maxY, pos.y + cardHeight)
  }
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: Math.max(cardWidth, maxX - minX),
    height: Math.max(cardHeight, maxY - minY)
  }
}

export function reachesInGraph(
  edges: { sourceNodeId: string; targetNodeId: string }[],
  start: string,
  goal: string
): boolean {
  const seen = new Set<string>([start])
  const queue = [start]
  while (queue.length > 0) {
    const current = queue.shift()!
    if (current === goal) return true
    for (const edge of edges) {
      if (edge.sourceNodeId === current && !seen.has(edge.targetNodeId)) {
        seen.add(edge.targetNodeId)
        queue.push(edge.targetNodeId)
      }
    }
  }
  return false
}

export type DiagramConnectionProblem = 'same-node' | 'into-root' | 'duplicate' | 'cycle'

export function diagramConnectionProblem(
  edges: { sourceNodeId: string; targetNodeId: string }[],
  fromId: string,
  toId: string,
  isTargetRoot = false
): DiagramConnectionProblem | null {
  if (fromId === toId) return 'same-node'
  if (isTargetRoot) return 'into-root'
  if (edges.some(edge => edge.sourceNodeId === fromId && edge.targetNodeId === toId)) {
    return 'duplicate'
  }
  if (reachesInGraph(edges, toId, fromId)) {
    return 'cycle'
  }
  return null
}
