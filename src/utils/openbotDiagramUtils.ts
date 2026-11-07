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
  if (kind === 'create_task') return { width: 310, height: 210, offsetY: 131 }
  if (kind === 'manage_properties') return { width: 310, height: 210, offsetY: 131 }
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

export const VERTICAL_CARD_WIDTH = 320
export const VERTICAL_CARD_HEIGHT = 86

export function getNodeTopPort(
  node?: { position?: { x: number; y: number }; kind?: string } | null,
  measuredWidth = VERTICAL_CARD_WIDTH
): { x: number; y: number } {
  const posX = node?.position?.x ?? 80
  const posY = node?.position?.y ?? 80
  return {
    x: Math.round(posX + measuredWidth / 2),
    y: Math.round(posY)
  }
}

export function getNodeBottomPort(
  node?: { position?: { x: number; y: number }; kind?: string } | null,
  measuredWidth = VERTICAL_CARD_WIDTH,
  measuredHeight = VERTICAL_CARD_HEIGHT
): { x: number; y: number } {
  const posX = node?.position?.x ?? 80
  const posY = node?.position?.y ?? 80
  return {
    x: Math.round(posX + measuredWidth / 2),
    y: Math.round(posY + measuredHeight)
  }
}

export function getNodeInputPort(
  node: { position?: { x: number; y: number }; kind?: string },
  _measuredHeight?: number,
  measuredWidth = VERTICAL_CARD_WIDTH
): { x: number; y: number } {
  return getNodeTopPort(node, measuredWidth)
}

export function getNodeOutputPort(
  node: { position?: { x: number; y: number }; kind?: string },
  measuredHeight?: number,
  measuredWidth = VERTICAL_CARD_WIDTH
): { x: number; y: number } {
  const h = measuredHeight || VERTICAL_CARD_HEIGHT
  return getNodeBottomPort(node, measuredWidth, h)
}

/**
 * Traçado vertical Bezier suave fluindo de cima para baixo
 */
export function diagramVerticalEdgePath(
  from: { x: number; y: number },
  to: { x: number; y: number }
): string {
  const dy = to.y - from.y
  const dx = to.x - from.x

  // Se o nó de destino está abaixo do nó de origem (fluxo normal descendente)
  if (dy > 10) {
    const bendY = Math.max(36, dy * 0.45)
    return `M ${from.x} ${from.y} C ${from.x} ${from.y + bendY}, ${to.x} ${to.y - bendY}, ${to.x} ${to.y}`
  }

  // Se o nó está no mesmo nível ou acima (contorno lateral)
  const offsetSide = dx >= 0 ? 90 : -90
  return `M ${from.x} ${from.y} C ${from.x} ${from.y + 60}, ${from.x + offsetSide} ${from.y + 60}, ${from.x + offsetSide} ${(from.y + to.y) / 2} C ${from.x + offsetSide} ${to.y - 60}, ${to.x} ${to.y - 60}, ${to.x} ${to.y}`
}

export function diagramVerticalEdgeArrow(to: { x: number; y: number }): string {
  const x = to.x
  const y = to.y
  return `M ${x - 4.5} ${y - 6} L ${x} ${y - 0.5} L ${x + 4.5} ${y - 6}`
}

export function diagramEdgePath(from: { x: number; y: number }, to: { x: number; y: number }): string {
  return diagramVerticalEdgePath(from, to)
}

export function diagramEdgeMidpoint(from: { x: number; y: number }, to: { x: number; y: number }): { x: number; y: number } {
  return {
    x: (from.x + to.x) / 2,
    y: (from.y + to.y) / 2
  }
}

export function diagramEdgeArrow(to: { x: number; y: number }): string {
  return diagramVerticalEdgeArrow(to)
}

export function autoLayoutVertical<T extends { id: string; position: { x: number; y: number }; kind?: string }>(
  nodes: T[],
  edges: { sourceNodeId: string; targetNodeId: string; branch?: string }[],
  startX = 380,
  startY = 80,
  rowGap = 150,
  colGap = 360
): T[] {
  if (nodes.length === 0) return []

  const inDegree = new Map<string, number>()
  const outgoing = new Map<string, { targetId: string; branch?: string }[]>()

  for (const n of nodes) {
    inDegree.set(n.id, 0)
    outgoing.set(n.id, [])
  }

  for (const e of edges) {
    if (inDegree.has(e.targetNodeId)) {
      inDegree.set(e.targetNodeId, (inDegree.get(e.targetNodeId) || 0) + 1)
    }
    if (outgoing.has(e.sourceNodeId)) {
      outgoing.get(e.sourceNodeId)!.push({ targetId: e.targetNodeId, branch: e.branch })
    }
  }

  // Identificar raízes (geralmente nós de gatilho/input ou inDegree === 0)
  const roots = nodes.filter(n => (inDegree.get(n.id) || 0) === 0)
  if (roots.length === 0 && nodes[0]) roots.push(nodes[0])

  const placedPositions = new Map<string, { x: number; y: number }>()
  const visited = new Set<string>()

  const placeTree = (nodeId: string, currentX: number, currentY: number) => {
    if (visited.has(nodeId)) return
    visited.add(nodeId)
    placedPositions.set(nodeId, { x: currentX, y: currentY })

    const children = outgoing.get(nodeId) || []
    if (children.length === 0) return

    if (children.length === 1) {
      // Caminho reto para baixo
      placeTree(children[0].targetId, currentX, currentY + rowGap)
    } else if (children.length === 2) {
      // Ramificação condicional (esquerda NO, direita YES)
      const noChild = children.find(c => c.branch === 'false' || c.branch === 'rejected') || children[0]
      const yesChild = children.find(c => c.branch === 'true' || c.branch === 'approved') || children[1]

      placeTree(noChild.targetId, currentX - colGap / 2, currentY + rowGap)
      placeTree(yesChild.targetId, currentX + colGap / 2, currentY + rowGap)
    } else {
      const totalWidth = (children.length - 1) * colGap
      children.forEach((c, idx) => {
        const childX = currentX - totalWidth / 2 + idx * colGap
        placeTree(c.targetId, childX, currentY + rowGap)
      })
    }
  }

  roots.forEach((root, idx) => {
    placeTree(root.id, startX + idx * (colGap * 1.5), startY)
  })

  // Para quaisquer nós soltos não visitados
  let orphanIndex = 0
  for (const n of nodes) {
    if (!visited.has(n.id)) {
      placedPositions.set(n.id, {
        x: startX + colGap * 1.2,
        y: startY + orphanIndex * rowGap
      })
      orphanIndex++
    }
  }

  return nodes.map(n => ({
    ...n,
    position: placedPositions.get(n.id) || n.position
  }))
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
